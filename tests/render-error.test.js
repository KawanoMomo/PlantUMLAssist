'use strict';
// BLK-primary-20260907-1303-design / design 5a「描画エラーを図の上に重ねて表示」。
// PlantUML は文法エラーでも 200 + SVG を返すので、SVG の中身からエラー画を見分ける。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/render-error.js')]; } catch (e) {}
require('../src/core/render-error.js');
var RE = global.window.MA.renderError;

// PlantUML 1.2026.2 が実際に返すエラー画の骨格 (長い base64 ロゴなどは省いてある)。
var ERROR_SVG = [
  '<?plantuml 1.2026.2?><svg xmlns="http://www.w3.org/2000/svg" style="background:#000000;">',
  '<rect fill="#FFFFFF" width="532" x="0" y="0"/>',
  '<text fill="#000000" font-size="12">Welcome to PlantUML!</text>',
  '<text fill="#33FF02" font-size="12">PlantUML 1.2026.2</text>',
  '<rect fill="#33FF02" width="142" x="5" y="296"/>',
  '<text fill="#000000" font-size="14">[From string (line 3) ]</text>',
  '<text fill="#33FF02" font-size="14">zzz??? bad line !!!</text>',
  '<text fill="#FF0000" font-size="14">Syntax Error? (Assumed diagram type: sequence)</text>',
  '</svg>',
].join('');

var GOOD_SVG = [
  '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg">',
  '<rect fill="#E2E2F0" x="0" y="0" width="100" height="40"/>',
  '<text fill="#000000" font-size="14">Alice</text>',
  '<text fill="#FF0000" font-size="14">赤いラベル</text>',
  '</svg>',
].join('');

describe('renderError.detect', function() {
  test('PlantUML のエラー画をエラーと見分ける', function() {
    var r = RE.detect(ERROR_SVG);
    expect(r.isError).toBe(true);
    expect(r.message).toBe('Syntax Error? (Assumed diagram type: sequence)');
    expect(r.line).toBe(3);
  });
  test('正常な図はエラーにしない (赤い文字があっても)', function() {
    expect(RE.detect(GOOD_SVG).isError).toBe(false);
  });
  // BLK-migrator-20260926-1608: 文言に error の語があるかでは決めない (Illegal sequence arrow / No such color もエラー画)。
  // 緑・赤の配色があっても、出所の行 `[From …]` も波線の行も無ければエラー画の形ではない。
  test('エラー画の配色でも、出所の行も波線の行も無い赤文字だけならエラーにしない', function() {
    var svg = ERROR_SVG.replace('[From string (line 3) ]', '注意事項');
    expect(RE.detect(svg).isError).toBe(false);
  });
  test('赤字に error の語が無くてもエラー画の形ならエラー', function() {
    var svg = ERROR_SVG.replace('Syntax Error? (Assumed diagram type: sequence)', '注意事項');
    expect(RE.detect(svg).isError).toBe(true);
    expect(RE.detect(svg).message).toBe('注意事項');
  });
  test('行番号が書かれていないエラー画でも message は取れる', function() {
    var svg = ERROR_SVG.replace('[From string (line 3) ]', '[From string]');
    var r = RE.detect(svg);
    expect(r.isError).toBe(true);
    expect(r.line).toBe(null);
  });
  test('実体参照をほどいて読める文にする', function() {
    var svg = ERROR_SVG.replace(
      'Syntax Error? (Assumed diagram type: sequence)',
      'Syntax Error?&#160;&lt;&amp;&gt;');
    expect(RE.detect(svg).message).toBe('Syntax Error? <&>');
  });
  test('空・非文字列でも落ちない', function() {
    expect(RE.detect('').isError).toBe(false);
    expect(RE.detect(null).isError).toBe(false);
    expect(RE.detect(undefined).isError).toBe(false);
    expect(RE.detect(42).isError).toBe(false);
  });
});

describe('renderError.describe', function() {
  // BLK-migrator-20260925-0752: 版の分かるエラー画は「PlantUML {版} がこの行を読めません」を先に言う (元の文言は括弧に残す)。
  test('行番号が分かるときは行番号を言う (版の分かるエラー画は PlantUML の版と一緒に)', function() {
    expect(RE.describe(RE.detect(ERROR_SVG)))
      .toBe('PlantUML 1.2026.2 がこの行を読めません: 3 行目 (Syntax Error? (Assumed diagram type: sequence))');
  });
  test('版の書かれていないエラー画は従来どおり行番号を先に置く', function() {
    var svg = ERROR_SVG.replace('PlantUML 1.2026.2', 'Welcome');
    expect(RE.describe(RE.detect(svg)))
      .toBe('3 行目: Syntax Error? (Assumed diagram type: sequence)');
  });
  test('行番号が無ければ message だけ', function() {
    expect(RE.describe({ isError: true, message: 'Syntax Error?', line: null }))
      .toBe('Syntax Error?');
  });
  test('エラーでなければ空文字', function() {
    expect(RE.describe(RE.detect(GOOD_SVG))).toBe('');
    expect(RE.describe(null)).toBe('');
  });
});

// BLK-migrator-20260924-1432: PlantUML が描画の途中で落ちたときの絵 (1.2026.2 が実際に返す骨格)。
// 文法エラーの配色 (緑・赤) を使わず、白地に黒文字でエラーの文言を並べる。
var CRASH_SVG = [
  '<?plantuml 1.2026.2?><svg xmlns="http://www.w3.org/2000/svg">',
  '<text fill="#000000" font-size="12" x="5" y="17">An error has occured : java.lang.NullPointerException: Cannot invoke &quot;String.startsWith(String)&quot; because &quot;s&quot; is null</text>',
  '<text fill="#000000" font-size="12" font-style="italic" x="5" y="32">Six by nine. Forty two.</text>',
  '<text fill="#000000" font-size="12" x="5" y="47">&#160;</text>',
  '<text fill="#000000" font-size="12" x="5" y="62">PlantUML (1.2026.2) has crashed.</text>',
  '<text fill="#000000" font-size="12" x="5" y="77">This version of PlantUML is 248 days old, so you should</text>',
  '</svg>',
].join('');

describe('renderError.detect — PlantUML が落ちた絵 (BLK-migrator-20260924-1432)', function() {
  test('落ちた絵を描画エラーと見分け、例外の文を添える', function() {
    var r = RE.detect(CRASH_SVG);
    expect(r.isError).toBe(true);
    expect(r.line).toBe(null);
    expect(r.message).toContain('PlantUML 1.2026.2 が描画の途中で落ちました');
    expect(r.message).toContain('java.lang.NullPointerException: Cannot invoke "String.startsWith(String)"');
    expect(RE.describe(r)).toBe(r.message);
  });
  test('「has crashed」の行が無ければ、図の中の同じ文言をエラーにしない', function() {
    var svg = '<svg><text fill="#000000">An error has occured : sample text in a note</text><text>Alice</text></svg>';
    expect(RE.detect(svg).isError).toBe(false);
  });
  test('「An error has occured」の行が無ければ、図の中の「has crashed」だけではエラーにしない', function() {
    var svg = '<svg><text fill="#000000">PlantUML (1.2026.2) has crashed.</text><text>Alice</text></svg>';
    expect(RE.detect(svg).isError).toBe(false);
  });
  test('文法エラーの絵は今まで通り (行番号つき)', function() {
    var r = RE.detect(ERROR_SVG);
    expect(r.isError).toBe(true);
    expect(r.line).toBe(3);
    expect(!!r.crashed).toBe(false);
  });
});

// BLK-migrator-20260926-1608 / BLK-owner-20260925-1932-1: PlantUML 1.2026.8 が実際に返したエラー画 (-pipe、server と同じ渡し方)。
// 赤字は「Illegal sequence arrow」「No such color」で error の語を含まない。これを図として並べていた。
describe('renderError.detect — error の語を含まない PlantUML 1.2026.8 のエラー画', function() {
  var fs = require('fs');
  var path = require('path');
  var childProcess = require('child_process');
  var ROOT = path.join(__dirname, '..');
  var CASES = [
    ['plantuml-illegal-arrow-1.2026.8.svg', 4, 'A - B : half', 'Illegal sequence arrow (Assumed diagram type: sequence)'],
    ['plantuml-no-such-color-1.2026.8.svg', 2, 'participant Client #white;line:red;line.bold;text:blue',
      'No such color (Assumed diagram type: sequence)'],
  ];
  CASES.forEach(function(c) {
    var file = path.join(ROOT, 'tests', 'fixtures', 'svg', c[0]);
    test(c[0] + ': 画面側はエラー画と見分け、版・行・行の本文・理由を帯に言う', function() {
      var r = RE.detect(fs.readFileSync(file, 'utf8'));
      expect(r.isError).toBe(true);
      expect(r.line).toBe(c[1]);
      expect(r.version).toBe('1.2026.8');
      expect(r.source).toBe(c[2]);
      expect(r.message).toBe(c[3]);
      expect(RE.describe(r)).toBe('PlantUML 1.2026.8 がこの行を読めません: ' + c[1] + ' 行目 `' + c[2] + '` (' + c[3] + ')');
    });
    test(c[0] + ': server 側 (422 の元) も同じ規則で見分ける', function() {
      var out = childProcess.execFileSync('python', ['-c',
        'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
        + 'e = server.detect_render_error(open(sys.argv[2], "rb").read()); '
        + 'print(json.dumps({"err": e, "text": server.describe_render_error(e) if e else None}))',
      ROOT, file], { encoding: 'utf8' });
      var r = JSON.parse(out);
      expect(r.err).not.toBe(null);
      expect(r.err.line).toBe(c[1]);
      expect(r.text).toBe(RE.describe(RE.detect(fs.readFileSync(file, 'utf8'))));
    });
  });
});
