'use strict';
// BLK-reviewer-20260914-2106: `diagram1.puml` に `domain-verdict` コメント行が
// 復元されただけで `diagram1.svg` が stale と出た。それがコメント追加による
// 埋め込みソースの符号化差分だけなのか、可視内容が実際にずれているのかは
// audit.js の出力 (「SVG が古い」件数のみ) からは分からず、reviewer は毎回
// render API を呼んで文字列 diff を取る使い捨てスクリプトを書いていた。
// audit.js が、描き直さずに (server も Java も立てずに) 内訳まで言うことを固定する。
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const report = require('../tools/audit-report');
const embedded = require('../tools/svg-embedded-src');
const cli = require('../tools/audit');

const PLANTUML_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// PlantUML が svg の末尾に畳むのと同じ形の token を作る (展開の逆)。
function fold(dsl) {
  const b64 = zlib.deflateRawSync(Buffer.from(dsl, 'utf-8')).toString('base64').replace(/=+$/, '');
  let out = '';
  for (const ch of b64) {
    const i = STD_B64.indexOf(ch);
    out += i < 0 ? ch : PLANTUML_B64[i];
  }
  return out;
}

function svgWith(dsl) {
  return '<svg xmlns="http://www.w3.org/2000/svg"><text x="1" y="2">Spi_Driver</text>'
    + '<?plantuml-src ' + fold(dsl) + '?></svg>';
}

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-stale-')); }

// svg を先に、puml を後に書く。mtime が puml > svg になり stale と判定される
// (reviewer が実際に踏んだ形: 本文を直した後、書き出していない)。
function putPair(dir, name, svgDsl, pumlText) {
  fs.writeFileSync(path.join(dir, name + '.svg'), svgWith(svgDsl), 'utf-8');
  const p = path.join(dir, name + '.puml');
  fs.writeFileSync(p, pumlText, 'utf-8');
  const later = new Date(Date.now() + 4000);
  fs.utimesSync(p, later, later);
}

const DRAWN = 'participant Spi_Driver\nparticipant Mcu\nSpi_Driver -> Mcu: init';
const PUML = '@startuml\n' + DRAWN + '\n@enduml\n';

function capture(argv) {
  const lines = [];
  const orig = console.log;
  const origErr = console.error;
  console.log = function(s) { lines.push(String(s)); };
  console.error = function(s) { lines.push(String(s)); };
  let code;
  try { code = cli.main(argv); } finally { console.log = orig; console.error = origErr; }
  return { code: code, out: lines.join('\n') };
}

describe('svg-embedded-src — svg に畳まれた元の DSL を開く', function() {
  test('processing instruction の形を読める', function() {
    expect(embedded.decode(svgWith(DRAWN))).toBe(DRAWN);
  });

  test('DOM を通って HTML コメントに包まれた形も読める', function() {
    const wrapped = svgWith(DRAWN).replace(/<\?(plantuml-src [^?]*)\?>/, '<!--?$1?-->');
    expect(embedded.decode(wrapped)).toBe(DRAWN);
  });

  test('畳まれていない svg は null (読めないものを空文字と混ぜない)', function() {
    expect(embedded.decode('<svg></svg>')).toBe(null);
    expect(embedded.decode(null)).toBe(null);
  });
});

describe('audit.js — 「SVG が古い」の内訳を、描き直さずに言う', function() {
  test('コメント行を足しただけの図と、中身が変わった図を分けて名指しする', function() {
    const dir = tmpdir();
    // 見かけ上の stale: 絵に出ない行 (コメント) だけが増えた。
    putPair(dir, 'comment_only', DRAWN, "@startuml\n'domain-verdict: ok\n" + DRAWN + '\n@enduml\n');
    // 本物の stale: participant 名が変わった。
    putPair(dir, 'content_drift', DRAWN, PUML.replace('Spi_Driver', 'Spi_Drv'));
    // 畳まれた DSL が無い svg。言えないものを「一致」に寄せない。
    fs.writeFileSync(path.join(dir, 'no_src.svg'), '<svg></svg>', 'utf-8');
    const np = path.join(dir, 'no_src.puml');
    fs.writeFileSync(np, PUML, 'utf-8');
    const later = new Date(Date.now() + 4000);
    fs.utimesSync(np, later, later);

    const s = JSON.parse(capture([dir, '--summary-json', '--no-state']).out).audits.svg;
    expect(s.stale).toBe(3);
    expect(s.staleCommentOnlyNames).toEqual(['comment_only.puml']);
    expect(s.staleContentNames).toEqual(['content_drift.puml']);
    expect(s.staleUnknownNames).toEqual(['no_src.puml']);
  });

  test('CLI の要約の行に内訳がそのまま出る (JSON を grep し直さない)', function() {
    const dir = tmpdir();
    putPair(dir, 'comment_only', DRAWN, "@startuml\n'domain-verdict: ok\n" + DRAWN + '\n@enduml\n');
    putPair(dir, 'content_drift', DRAWN, PUML.replace('Spi_Driver', 'Spi_Drv'));
    const out = capture([dir, '--summary', '--no-state']).out;
    expect(out).toContain('SVG が古い 2 枚');
    expect(out).toContain('可視内容の食い違い 1 枚 (content_drift.puml)');
    expect(out).toContain('コメント等ソース変化のみ 1 枚 (comment_only.puml)');
  });
});
