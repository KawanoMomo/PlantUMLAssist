'use strict';
// TICKET-owner-20261124-0342-3: 保存先の無い図 (ダウンロード) の「PNG（透過背景）で書き出す」が、通常の PNG と同じ
// `{名前}.png` で落ちていた。ダウンロード名も保存先の図・まとめての書き出しと同じ `{名前}.transparent.png` にする。
// 実マウスの確かめは tests/scenarios/owner-20261124-0342-3.spec.js。
var fs = require('fs');
var path = require('path');
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var SRC = ['../src/core/export-dest.js', '../src/core/export-name.js'];
SRC.forEach(function(r) { try { delete require.cache[require.resolve(r)]; } catch (e) {} });
SRC.forEach(function(r) { require(r); });
var EN = global.window.MA.exportName;
var ED = global.window.MA.exportDest;

describe('書き出しのダウンロード名 (TICKET-owner-20261124-0342-3)', function() {
  test('透過 PNG は `{名前}.transparent.png`、PNG は `{名前}.png`、SVG は `{名前}.svg`', function() {
    var doc = { name: 's2-out' };
    expect(EN.kindFileName(doc, null, 'png-transparent')).toBe('s2-out.transparent.png');
    expect(EN.kindFileName(doc, null, 'png')).toBe('s2-out.png');
    expect(EN.kindFileName(doc, null, 'svg')).toBe('s2-out.svg');
  });
  test('保存先に書く名前 (exportDest.fileName) と同じ決め方', function() {
    ['svg', 'png', 'png-transparent'].forEach(function(k) {
      expect(EN.kindFileName({ name: 'rev-seq' }, null, k)).toBe(ED.fileName('rev-seq', k));
    });
  });
  test('名前の決め方は今どおり (図の名前 → title → untitled)', function() {
    expect(EN.kindFileName(null, { title: 'GPIO' }, 'png-transparent')).toBe('GPIO.transparent.png');
    expect(EN.kindFileName(null, null, 'png-transparent')).toBe('untitled.transparent.png');
  });
  test('Export ▾ の PNG の書き出しは種類ごとのダウンロード名を渡す (透過も `.png` 1 つに決め打ちしない)', function() {
    var APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    var i = APP.indexOf('function _exportPngNow(');
    var body = APP.slice(i, APP.indexOf('\nfunction ', i + 1));
    expect(body).toContain('exportKindFileName(kind)');
    expect(body).not.toContain("exportFileName('png')");
  });
});
