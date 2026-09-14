'use strict';
// BLK-reviewer-20260915-0406: CLI 経路 (node tools/findings.js <フォルダ>) の svg 一覧が
// hash / svgSource を持たず、svg-freshness.contentOf が常に 'unverified' を返していた。
// 内容一致 (isSettled) の判定を一度も通らないため、mtime だけがずれた図が「SVG 古」として
// 継続追跡に載っていた。GUI (server の /autosave) と同じ 3 つを載せて、同じ答えを出す。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { loadMA } = require('../tools/audit-runtime');
const report = require('../tools/audit-report');

const PUML = '@startuml\ntitle SPI\n[*] --> Uninit\nUninit --> Ready : Spi_Init\n@enduml\n';
const SVG_BODY = '<svg xmlns="http://www.w3.org/2000/svg"><text>SPI</text></svg>\n';

function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

// puml が新しく svg が古い (mtime だけがずれた) 1 組を作る。stamp を渡さなければ印なし。
function fixture(stampDigest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-stamp-'));
  const pumlPath = path.join(dir, 'spi.puml');
  const svgPath = path.join(dir, 'spi.svg');
  fs.writeFileSync(pumlPath, PUML, 'utf-8');
  const stamp = stampDigest === undefined ? sha1(fs.readFileSync(pumlPath)) : stampDigest;
  fs.writeFileSync(svgPath, SVG_BODY + (stamp ? '<!-- @pua-source-sha1 ' + stamp + ' -->\n' : ''), 'utf-8');
  const now = Date.now() / 1000;
  fs.utimesSync(svgPath, now - 3600, now - 3600);
  fs.utimesSync(pumlPath, now, now);
  return { dir, pumlPath, svgPath };
}

function scanOf(dir) {
  const rt = loadMA();
  const docs = report.collectDocs([dir]);
  const audits = report.runAudits(rt.MA, docs, ['svg']);
  return { MA: rt.MA, audits, docs };
}

function svgRow(dir) {
  const { audits } = scanOf(dir);
  const rows = audits.svg.result.rows;
  return rows.filter(function(r) { return r.name === 'spi.puml'; })[0];
}

describe('CLI の svg 一覧が印と puml の sha1 を持つ', function() {
  test('印が今の puml と一致すれば content は match (mtime は古いまま)', function() {
    const fx = fixture();
    const row = svgRow(fx.dir);
    expect(row.status).toBe('stale');
    expect(row.content).toBe('match');
  });

  test('印が今の puml と違えば content は differ (作り直しが要る)', function() {
    const fx = fixture(sha1(Buffer.from('別の puml', 'utf-8')));
    const row = svgRow(fx.dir);
    expect(row.status).toBe('stale');
    expect(row.content).toBe('differ');
  });

  test('印の無い svg は unverified のまま (嘘を足さない)', function() {
    const fx = fixture('');
    const row = svgRow(fx.dir);
    expect(row.content).toBe('unverified');
  });
});

describe('継続追跡 (audit-timeline) が mtime だけの古さを別の箱に入れる', function() {
  function itemsOf(dir) {
    const { MA, audits } = scanOf(dir);
    return MA.auditTimeline.itemsOf(audits);
  }

  test('内容一致なら svg.staleSettled になり、作り直しの箱 svg.stale には入らない', function() {
    const fx = fixture();
    const items = itemsOf(fx.dir);
    const kinds = items.map(function(i) { return i.kind; });
    expect(kinds).toContain('svg.staleSettled');
    expect(kinds).not.toContain('svg.stale');
  });

  test('内容が違えば従来どおり svg.stale に残る', function() {
    const fx = fixture(sha1(Buffer.from('別の puml', 'utf-8')));
    const kinds = itemsOf(fx.dir).map(function(i) { return i.kind; });
    expect(kinds).toContain('svg.stale');
    expect(kinds).not.toContain('svg.staleSettled');
  });
});
