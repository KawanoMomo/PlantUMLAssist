'use strict';
// TICKET-roadmap-20261122-0855-5: 保存先の一覧で印を付けた図を、選んだ形式で保存先へまとめて書き出す。
// 実マウスの確かめは tests/scenarios/roadmap-20261122-0855-5.spec.js。ここは
//   - ボタンの文言 (枚数)・形式の言い方・書いた後の 1 行 (枚数・形式・置き場・書かなかった図の名前) (src/core/export-dest.js)
//   - 画面側の道: 1 枚ずつの書き出しと同じ置き場 (loadSub) と同じ口 (ED.url → POST /export-file)、描けない図は書かない
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

describe('まとめて書き出す: 文言 (exportDest)', function() {
  test('形式は 1 枚ずつの書き出しと同じ 3 つ (SVG / PNG / PNG（透過背景）) で、同じ名前の決まり', function() {
    expect(ED.BATCH_KINDS).toEqual(['svg', 'png', 'png-transparent']);
    expect(ED.BATCH_KINDS.map(ED.kindLabel)).toEqual(['SVG', 'PNG', 'PNG（透過背景）']);
    expect(ED.BATCH_KINDS.map(function(k) { return ED.fileName('a', k); })).toEqual(['a.svg', 'a.png', 'a.transparent.png']);
  });
  test('ボタンは押す前に枚数を言う。印が無ければ枚数を言わない', function() {
    expect(ED.batchLabel(3)).toBe('選んだ 3 枚を書き出す');
    expect(ED.batchLabel(0)).toBe('選んだ図を書き出す');
  });
  test('書いた後の 1 行は、枚数・形式・置き場', function() {
    var rs = [{ name: 'a', ok: true }, { name: 'b', ok: true }, { name: 'c', ok: true }];
    expect(ED.batchMessage(rs, 'png', '')).toBe('書き出しました: 3 枚 (PNG) → 図と同じフォルダ');
    expect(ED.batchMessage(rs, 'svg', 'out')).toBe('書き出しました: 3 枚 (SVG) → 保存先の「out」フォルダ');
  });
  test('描けなかった図は書いた枚数に入れず、名前と理由を言う', function() {
    var rs = [{ name: 'a', ok: true }, { name: 'bad', ok: false, error: '描けません' }, { name: 'c', ok: true }];
    expect(ED.batchMessage(rs, 'png-transparent', '')).toBe(
      '書き出しました: 2 枚 (PNG（透過背景）) → 図と同じフォルダ ／ 書かなかった図: bad（描けません）');
  });
  test('1 枚も書けなければ「書き出しました」と言わない', function() {
    var m = ED.batchMessage([{ name: 'bad', ok: false }], 'svg', '');
    expect(m.indexOf('書き出しました')).toBe(-1);
    expect(m).toContain('bad（描けません）');
  });
});

describe('まとめて書き出す: 画面側の道 (src/app.js)', function() {
  var many = slice(APP, 'function exportManyToFolder', '\nwindow.exportManyToFolder');
  var one = slice(APP, 'function _batchExportOne', '\n// names を');
  test('置き場は 1 枚ずつの書き出しと同じ記憶 (保存先ごとの loadSub)', function() {
    expect(many).toContain('ED.loadSub(_exportStorage(), dir)');
  });
  test('書く口は 1 枚ずつと同じ POST /export-file (ED.url)。zip は作らない', function() {
    expect(one).toContain('fetch(ED.url(dir, name, kind, sub)');
    expect(APP.indexOf('export-zip')).toBe(-1);
  });
  test('描けない図 (render が失敗・SVG が無い・画像にできない) は書かずに名前を返す', function() {
    expect(one).toContain("}, function() { return fail('描けません'); });");
    expect(one).toContain("if (!svg || String(svg).indexOf('<svg') < 0) return fail('描けません');");
    expect(one).toContain("if (!blob || !blob.size) return fail('画像にできません');");
    // 描けなかった図の後も、残りの図は書く (1 枚のために全部を止めない)
    expect(many).toContain('results.push(r); return step(i + 1);');
  });
  test('PNG は 1 枚ずつと同じく、透過でなければ白で塗ってから描く', function() {
    // TICKET-junior-20261123-1142-wish: 1 枚ずつ・まとめての PNG は同じ _rasterSvgEl (倍率・白地) を通る。
    var png = slice(APP, 'function _svgTextToPngBlob', '\n// その図の本文');
    expect(png).toContain('_rasterSvgEl(s.el, s.w, s.h, transparent,');
    var raster = slice(APP, 'function _rasterSvgEl', '\n// プレビューの図を PNG の canvas にする');
    expect(raster).toContain('if (!transparent) {');
    expect(raster).toContain("ctx.fillStyle = '#ffffff';");
  });
  test('一覧の印を付ける行に、形式の選択と「選んだ N 枚を書き出す」と結果の行がある', function() {
    var bar = slice(APP, 'function folderPickBar', 'function folderOpenButton');
    expect(bar).toContain("kind.className = 'folder-export-kind'");
    expect(bar).toContain('folderExportButton(kind)');
    expect(bar).toContain("result.className = 'folder-export-result'");
  });
});
