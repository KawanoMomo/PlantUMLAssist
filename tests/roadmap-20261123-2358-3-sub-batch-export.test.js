'use strict';
// TICKET-roadmap-20261123-2358-3: 保存先の一覧のまとめての書き出しが、保存先の下のどの階層の図にも届く。
// 実マウスの確かめは tests/scenarios/roadmap-20261123-2358-3.spec.js。ここは
//   - 道付きの名前と、サブフォルダの図が混ざったときの書いた後の 1 行 (src/core/export-dest.js)
//   - 画面側の道: サブフォルダの図はその図のフォルダの置き場 (loadSub(図のフォルダ)) へ同じ口で書き、
//     開いているタブの本文は同じ場所の図 (findOpen) からだけ読む。直下の図だけのときの言い方は前のまま
// を守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');

try { delete require.cache[require.resolve('../src/core/export-dest.js')]; } catch (e) {}
require('../src/core/export-dest.js');
var ED = global.window.MA.exportDest;
var APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

function slice(src, from, to) {
  var i = src.indexOf(from);
  var j = src.indexOf(to, i + from.length);
  return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j);
}

describe('サブフォルダの図のまとめての書き出し: 言い方 (exportDest)', function() {
  test('道付きの名前は保存先から見たフォルダの道 + 名前。直下の図は名前だけ', function() {
    expect(ED.pathName('hw', 'a')).toBe('hw/a');
    expect(ED.pathName('hw\\spi', 'b')).toBe('hw/spi/b');
    expect(ED.pathName('', 'a')).toBe('a');
    expect(ED.pathName(undefined, 'a')).toBe('a');
  });
  test('サブフォルダの図が混ざると、置き場は図ごとと言い、書いた図を道付きで並べる', function() {
    var rs = [{ name: 'a', rel: '', ok: true }, { name: 'b', rel: '', ok: true },
      { name: 'a', rel: 'hw', ok: true }, { name: 'c', rel: 'hw/spi', ok: true }];
    expect(ED.batchMessage(rs, 'png', '')).toBe(
      '書き出しました: 4 枚 (PNG) → それぞれの図のフォルダの置き場: a・b・hw/a・hw/spi/c');
  });
  test('書かなかった図も道付きで言う (同じ名前の直下の図と取り違えない)', function() {
    var rs = [{ name: 'a', rel: '', ok: true }, { name: 'a', rel: 'hw', ok: false, error: '描けません' }];
    expect(ED.batchMessage(rs, 'svg', '')).toBe(
      '書き出しました: 1 枚 (SVG) → それぞれの図のフォルダの置き場: a ／ 書かなかった図: hw/a（描けません）');
  });
  test('直下の図だけなら今の言い方のまま (rel が空・無い)', function() {
    var rs = [{ name: 'a', rel: '', ok: true }, { name: 'b', ok: true }];
    expect(ED.batchMessage(rs, 'png', '')).toBe('書き出しました: 2 枚 (PNG) → 図と同じフォルダ');
    expect(ED.batchMessage(rs, 'png', 'out')).toBe('書き出しました: 2 枚 (PNG) → 保存先の「out」フォルダ');
  });
});

describe('サブフォルダの図のまとめての書き出し: 画面側の道 (src/app.js)', function() {
  var many = slice(APP, 'function exportManyToFolder', '\nwindow.exportManyToFolder');
  var dsl = slice(APP, 'function _batchExportDsl', '\n// rel はサブフォルダの図');
  var one = slice(APP, 'function _batchExportOne', '\n// names を');
  test('サブフォルダの図の置き場は、その図のフォルダごとの記憶 (1 枚ずつの書き出しと同じ鍵)', function() {
    expect(many).toContain('ED.loadSub(_exportStorage(), s.dir)');
    expect(many).toContain('_batchExportOne(it.name, it.dir, kind, it.sub, it.rel)');
  });
  test('開いているタブの本文は、同じ場所の図 (サブフォルダの図は findOpen) からだけ読む', function() {
    expect(dsl).toContain('WS.findOpen({ name: name, sub: true, dir: dir })');
    expect(dsl).toContain('return WS ? WS.loadFile(name, dir) : Promise.resolve(null);');
    expect(one).toContain('_batchExportDsl(name, dir, rel)');
    expect(one).toContain('renderDslToSvg(String(dsl), dir)');
  });
  test('結果は道 (rel) を持つ (書いた図・書かなかった図とも)', function() {
    expect(one).toContain("return { name: name, rel: rel || '', ok: false, error: why };");
    expect(one).toContain("return { name: name, rel: rel || '', ok: true, res: j };");
  });
  test('一覧: サブフォルダの図の節は木を読むだけ (/tree-dir) で、印は書き出しの枚数とボタンに入る', function() {
    var sec = slice(APP, 'function appendSubFolderSection', 'function folderSubRow');
    expect(sec).toContain('WS.listTree(dir)');
    expect(sec).toContain('if (gen !== _folderRenderGen) return;');
    var sync = slice(APP, 'function syncFolderPickUi', 'function folderButton');
    expect(sync).toContain('+ _pickedSubFiles().length');
    var exp = slice(APP, 'function folderExportButton', 'function folderOpenButton');
    expect(exp).toContain('var subs = _pickedSubFiles();');
    expect(exp).toContain('}, subs).then(function(out) {');
  });
  test('一覧の頭の行は届く範囲を言う (直下の図だけ、と言わない)', function() {
    expect(APP).toContain('印を付けてまとめて書き出せます');
    expect(APP).not.toContain('保存先の直下の図だけを並べます');
  });
});
