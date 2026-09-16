'use strict';
// BLK-reviewer-20260915-0606: `node tools/audit.js -p primary --board` が
// 「出力物/SVG 内容ずれ」(= 作り直しが要る) として名指しした 4 枚を
// `POST /verify-svg` で確かめると全て differ-format (描かれる中身は一致、違うのは
// 体裁だけ) だった。audit.js 側の判定材料が指紋 (印 @pua-source-sha1 / 畳まれた DSL の
// sha1) しか無く、コメントや体裁だけの書き換えでも指紋は食い違うため、
// 体裁差が内容差に倒れていた。svg に畳まれた元の DSL と今の puml を「描かれる行だけ」で
// 比べれば、server も Java も無しに differ-format と同じ答えが出る。
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { loadMA } = require('../tools/audit-runtime');
const report = require('../tools/audit-report');
const auditBoard = require('../src/core/audit-board');

const PUML = '@startuml\ntitle SPI\n[*] --> Uninit\nUninit --> Ready : Spi_Init\n@enduml\n';
// 畳まれた DSL には @startuml / @enduml が無く、行末の空白も落ちている。
const FOLDED_SAME = 'title SPI\n[*] --> Uninit\nUninit --> Ready : Spi_Init';
const FOLDED_DIFFER = 'title SPI\n[*] --> Uninit\nUninit --> Ready : Spi_Open';
// コメント行は絵に出ない。畳まれた DSL との差がこれだけなら「体裁差のみ」。
const FOLDED_COMMENT_ONLY = "' domain-verdict: ok\ntitle SPI\n[*] --> Uninit\nUninit --> Ready : Spi_Init";

const PLANTUML_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// svg-embedded-src.decode() が読む形に畳む (展開の裏返し)。
function fold(dsl) {
  const std = zlib.deflateRawSync(Buffer.from(dsl, 'utf-8')).toString('base64');
  let out = '';
  for (const ch of std) {
    if (ch === '=') continue;
    const i = STD_B64.indexOf(ch);
    out += i < 0 ? ch : PLANTUML_B64[i];
  }
  return '<?plantuml-src ' + out + '?>';
}

function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

// puml が新しく svg が古い 1 組。印は必ず今の puml と食い違わせる
// (指紋だけなら differ に倒れる状態を作ってから、畳まれた DSL で判定させる)。
function fixture(folded) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-fmt-'));
  const pumlPath = path.join(dir, 'spi.puml');
  const svgPath = path.join(dir, 'spi.svg');
  fs.writeFileSync(pumlPath, PUML, 'utf-8');
  const body = '<svg xmlns="http://www.w3.org/2000/svg"><text>SPI</text>'
    + (folded === null ? '' : fold(folded)) + '</svg>\n';
  fs.writeFileSync(svgPath, body + '<!-- @pua-source-sha1 ' + sha1(Buffer.from('別の puml', 'utf-8')) + ' -->\n', 'utf-8');
  const now = Date.now() / 1000;
  fs.utimesSync(svgPath, now - 3600, now - 3600);
  fs.utimesSync(pumlPath, now, now);
  return dir;
}

function scanOf(dir) {
  const rt = loadMA();
  const docs = report.collectDocs([dir]);
  const audits = report.runAudits(rt.MA, docs, ['svg']);
  return audits.svg.result;
}

function rowOf(dir) {
  return scanOf(dir).rows.filter((r) => r.name === 'spi.puml')[0];
}

function boardKinds(dir) {
  return auditBoard.build({ audits: {}, svg: scanOf(dir) }).rows.map((r) => r.kind);
}

describe('CLI の SVG 判定が体裁差を内容差と混同しない', () => {
  test('畳まれた DSL の描かれる行が今の puml と同じなら「体裁差のみ」(印は食い違っていても)', () => {
    const row = rowOf(fixture(FOLDED_SAME));
    expect(row.status).toBe('stale');
    expect(row.content).toBe('format');
    expect(row.basis).toBe('visible');
  });

  test('差がコメント行だけでも「体裁差のみ」(指紋は必ず食い違う)', () => {
    expect(rowOf(fixture(FOLDED_COMMENT_ONLY)).content).toBe('format');
  });

  test('体裁差のみの図は --board の指摘にならない (内容ずれとも SVG 古とも言わない)', () => {
    expect(boardKinds(fixture(FOLDED_SAME))).toEqual([]);
  });

  test('描かれる行が違えば今までどおり「内容ずれ」として指摘する', () => {
    const dir = fixture(FOLDED_DIFFER);
    expect(rowOf(dir).content).toBe('differ');
    expect(rowOf(dir).basis).toBe('visible');
    expect(boardKinds(dir)).toEqual(['svg.differ']);
  });

  test('畳まれた DSL が無ければ判定は変えない (印の食い違いは differ のまま)', () => {
    const dir = fixture(null);
    expect(rowOf(dir).content).toBe('differ');
    expect(rowOf(dir).basis).toBe('stamp');
    expect(boardKinds(dir)).toEqual(['svg.differ']);
  });

  test('作り直しの対象 (needsRender) からも外れる', () => {
    expect(scanOf(fixture(FOLDED_SAME)).needsRender).toEqual([]);
    expect(scanOf(fixture(FOLDED_DIFFER)).needsRender).toEqual(['spi.puml']);
  });
});

describe('描かれる行の突合は、より強い根拠に譲る', () => {
  const rt = loadMA();
  const SF = rt.MA.svgFreshness;
  const base = { name: 'a', hash: 'aaa', svgHash: 'sss',
    mtime: '2026-09-15T00:00:00Z', svgMtime: '2026-09-14T00:00:00Z' };

  test('印がバイトまで一致していれば match (描かれる行を見るまでもない)', () => {
    const e = Object.assign({}, base, { svgSource: 'aaa', visibleMatch: 'same' });
    expect(SF.contentOf(e, {})).toBe('match');
    expect(SF.contentBasisOf(e, {})).toBe('stamp');
  });

  test('描き直して比べた控えがあれば控えを採る', () => {
    const e = Object.assign({}, base, { svgSource: 'zzz', visibleMatch: 'differ' });
    const rec = { a: { pumlHash: 'aaa', svgHash: 'sss', result: 'differ-format' } };
    expect(SF.contentOf(e, rec)).toBe('format');
    expect(SF.contentBasisOf(e, rec)).toBe('rerender');
  });

  test('印が無くても、描かれる行が同じなら体裁差のみと言える', () => {
    const e = Object.assign({}, base, { svgSource: null, visibleMatch: 'same' });
    expect(SF.contentOf(e, {})).toBe('format');
    expect(SF.contentBasisOf(e, {})).toBe('visible');
  });

  test('根拠は判定の根拠の行にも出る', () => {
    const scan = SF.scan([Object.assign({}, base, { svgSource: 'zzz', visibleMatch: 'same' })], {});
    expect(scan.basisCounts.visible).toBe(1);
    expect(SF.basisNote(scan)).toContain('描かれる行の突合 1 枚');
  });
});
