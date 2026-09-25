'use strict';
// BLK-builder-20260925-1052-4: 同梱 PlantUML 1.2026.3 は落ちた絵の 1 行目を「An error has occurred」と書く
// (1.2026.2 までは occured)。綴りだけで見分けていたため、1.2026.3 の落ちた絵が Rendered の図として出ていた
// (migrator の web/plantuml vega/state concurrent-empty-first-region、smetana の空の最初の領域)。
// 画面側 (src/core/render-error.js) と server 側 (server.py) の両方が、どちらの綴りでも落ちた絵と見分けることを守る。
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/render-error.js')]; } catch (e) {}
require('../src/core/render-error.js');
var RE = global.window.MA.renderError;

var ROOT = path.join(__dirname, '..');
var FIX = path.join(__dirname, 'fixtures', 'svg');
var CRASH_3 = path.join(FIX, 'plantuml-crash-1.2026.3.svg');
var CRASH_2 = path.join(FIX, 'plantuml-crash-1.2026.2.svg');

function serverJudge(file) {
  var out = childProcess.execFileSync('python', ['-c',
    'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
    + 'print(json.dumps(server.detect_render_error(open(sys.argv[2], "rb").read())))', ROOT, file],
  { encoding: 'utf8' });
  return JSON.parse(out);
}

describe('落ちた絵の綴り (occured / occurred) — BLK-builder-20260925-1052-4', function() {
  test('1.2026.3 が実際に返した落ちた絵 (occurred) を画面側が描画エラーと見分ける', function() {
    var r = RE.detect(fs.readFileSync(CRASH_3, 'utf8'));
    expect(r.isError).toBe(true);
    expect(r.crashed).toBe(true);
    expect(r.line).toBe(null);
    expect(r.message).toBe('PlantUML 1.2026.3 が描画の途中で落ちました (java.lang.IllegalArgumentException)');
  });
  test('1.2026.2 の落ちた絵 (occured) も今まで通り見分ける', function() {
    var r = RE.detect(fs.readFileSync(CRASH_2, 'utf8'));
    expect(r.isError).toBe(true);
    expect(r.message).toContain('PlantUML 1.2026.2 が描画の途中で落ちました');
  });
  test('「has crashed」の行が無ければ、図の中の「An error has occurred」だけではエラーにしない', function() {
    var svg = '<svg><text fill="#000000">An error has occurred : sample text in a note</text><text>Alice</text></svg>';
    expect(RE.detect(svg).isError).toBe(false);
  });
  test('server も 1.2026.3 の落ちた絵を 422 (plantuml-crash) の元として見分け、画面側と同じ文を返す', function() {
    var j = serverJudge(CRASH_3);
    expect(j.crashed).toBe(true);
    expect(j.line).toBe(null);
    expect(j.message).toBe(RE.detect(fs.readFileSync(CRASH_3, 'utf8')).message);
  });
  test('server も 1.2026.2 の落ちた絵を今まで通り見分ける', function() {
    var j = serverJudge(CRASH_2);
    expect(j.crashed).toBe(true);
    expect(j.message).toContain('PlantUML 1.2026.2 が描画の途中で落ちました');
  });
});
