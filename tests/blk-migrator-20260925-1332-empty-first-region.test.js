'use strict';
// BLK-migrator-20260925-1332: smetana の state 図で、複合状態の最初の並行領域が空 (`state X {` の直後に `--`) だと
// 同梱の PlantUML 1.2026.3 自身が IllegalArgumentException で落ちる (web/plantuml vega/state concurrent-empty-first-region)。
// 1.2026.7 からは描けるが、版を上げると sequence / state の SVG の形が変わりホバー枠の spec が 12 件落ちるので同梱版は上げない。
// 代わりに (1) 落ちた帯に「N 行目 `--` の前の並行領域が空です」を添え (画面と server の同じ規則)、
// (2) 追加フォームの「追加する位置」にその空の領域を並べ、状態を 1 つ置けば描けるようにする。
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/render-error.js', '../src/core/state-child.js', '../src/core/state-insert.js'].forEach(function(dep) {
  try { delete require.cache[require.resolve(dep)]; } catch (e) {}
  require(dep);
});
var RE = global.window.MA.renderError;
var SI = global.window.MA.stateInsert;

var ROOT = path.join(__dirname, '..');
var FIX = path.join(__dirname, 'fixtures');
var CRASH_DSL = fs.readFileSync(path.join(FIX, 'dsl', 'smetana-empty-first-region-crash.puml'), 'utf8').replace(/\r\n/g, '\n');
var CRASH_SVG = path.join(FIX, 'svg', 'plantuml-crash-1.2026.3.svg');

// 1.2026.3 で落ちるか (x) 描けるか (o) を jar で確かめた形。落ちるのは「最初の」領域が空のときだけ。
var CASES = [
  ['最初の領域が空 (--)', '@startuml\n!pragma layout smetana\nstate Parent {\n  --\n  state A\n  --\n  state B\n}\n@enduml\n', [4]],
  ['最初の領域が空 (||)', '@startuml\n!pragma layout smetana\nstate Parent {\n  ||\n  state A\n}\n@enduml\n', [4]],
  ['コメントだけの最初の領域', "@startuml\nstate Parent {\n  ' c\n  /' 複数行\n  '/\n  --\n  state A\n}\n@enduml\n", [6]],
  ['入れ子の複合状態', '@startuml\nstate X {\n  state \"親\" as P {\n    --\n    state A\n  }\n}\n@enduml\n', [4]],
  ['真ん中の領域が空 (描ける)', '@startuml\nstate Parent {\n  state A\n  --\n  --\n  state B\n}\n@enduml\n', []],
  ['最後の領域が空 (描ける)', '@startuml\nstate Parent {\n  state A\n  --\n  state B\n  --\n}\n@enduml\n', []],
  ['最初の領域に遷移 (描ける)', '@startuml\nstate Parent {\n  [*] --> A\n  --\n  state B\n}\n@enduml\n', []],
  ['front matter の --- は区切りではない', '---\ntitle: x\n---\n@startuml\nstate A\n@enduml\n', []],
];

function serverRegions(text) {
  var out = childProcess.execFileSync('python', ['-c',
    'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
    + 'print(json.dumps([r["line"] for r in server.empty_first_regions(sys.stdin.buffer.read().decode("utf-8"))]))', ROOT],
  { encoding: 'utf8', input: text });
  return JSON.parse(out);
}

describe('最初の並行領域が空の複合状態を本文から探す — BLK-migrator-20260925-1332', function() {
  CASES.forEach(function(c) {
    test('画面側: ' + c[0], function() {
      expect(RE.emptyFirstRegions(c[1]).map(function(r) { return r.line; })).toEqual(c[2]);
    });
  });

  test('server も同じ規則で同じ行を返す (片方だけ変えない)', function() {
    CASES.forEach(function(c) {
      expect(serverRegions(c[1])).toEqual(c[2]);
    });
  });

  test('落ちた絵の帯に「N 行目 `--` の前の並行領域が空です」を添える (落ちていなければ添えない)', function() {
    var info = RE.detect(fs.readFileSync(CRASH_SVG, 'utf8'));
    expect(info.crashed).toBe(true);
    expect(RE.crashCause(info, CRASH_DSL)).toBe('4 行目 `--` の前の並行領域が空です');
    expect(RE.crashCause({ isError: true, message: 'x' }, CRASH_DSL)).toBe('');
    expect(RE.crashCause(info, '@startuml\nstate A\n@enduml\n')).toBe('');
  });

  test('server の 422 の文は、落ちた旨・例外・原因の行の順', function() {
    var out = childProcess.execFileSync('python', ['-c',
      'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
      + 'err = server.detect_render_error(open(sys.argv[2], "rb").read()); '
      + 'print(json.dumps(server.crash_cause(err, sys.stdin.buffer.read().decode("utf-8"))))', ROOT, CRASH_SVG],
    { encoding: 'utf8', input: CRASH_DSL });
    expect(JSON.parse(out)).toEqual(['4 行目 `--` の前の並行領域が空です', 4]);
  });
});

describe('追加する位置: 空の並行領域 — BLK-migrator-20260925-1332', function() {
  var PARSED = {
    states: [
      { id: 'Parent', label: 'Parent', line: 3, endLine: 8 },
      { id: 'Parent.A', label: 'A', line: 5, endLine: 5, parentId: 'Parent' },
      { id: 'Parent.B', label: 'B', line: 7, endLine: 7, parentId: 'Parent' },
    ],
    transitions: [],
  };

  test('空の領域があるときだけ位置に並ぶ (値は region:{区切りの行})', function() {
    var ps = SI.positions(PARSED, CRASH_DSL);
    var region = ps.filter(function(p) { return p.value.indexOf('region:') === 0; });
    expect(region.length).toBe(1);
    expect(region[0].value).toBe('region:4');
    expect(region[0].label).toContain('の空の並行領域 (4 行目 `--` の前)');
    // 本文を渡さない呼び方・空の領域が無い図では今までどおり。
    expect(SI.positions(PARSED).some(function(p) { return p.value.indexOf('region:') === 0; })).toBe(false);
  });

  test('その領域 (区切りの前) に区切りと同じ字下げで入り、ほかの行は動かない', function() {
    var out = SI.insertIntoRegion(CRASH_DSL, 4, 'state Z');
    expect(out).toBe('@startuml\n!pragma layout smetana\nstate Parent {\n  state Z\n  --\n  state A\n  --\n  state B\n}\n@enduml\n');
    expect(RE.emptyFirstRegions(out)).toEqual([]);
    // もう空でない領域・区切りでない行には入れない。
    expect(SI.insertIntoRegion(out, 5, 'state Y')).toBe(out);
    expect(SI.insertIntoRegion(CRASH_DSL, 5, 'state Y')).toBe(CRASH_DSL);
  });
});
