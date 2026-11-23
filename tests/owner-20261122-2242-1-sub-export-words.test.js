'use strict';
// TICKET-owner-20261122-2242-1: サブフォルダの図の書き出し先は、図のフォルダを道で言い、サブフォルダを「保存先」と呼ばない。
// 置き場は図のフォルダごとに覚える。保存フォルダの一覧は直下の図だけを並べ、そう書く。
// 実マウスの確かめは tests/scenarios/owner-20261122-2242-1.spec.js。
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

describe('書き出し先の言い方 (図のフォルダの道)', function() {
  test('直下の図は今までどおり', function() {
    expect(ED.placeLabel('')).toBe('図と同じフォルダ');
    expect(ED.placeLabel('out')).toBe('保存先の「out」フォルダ');
    expect(ED.placeLabel('', '')).toBe('図と同じフォルダ');
    expect(ED.sameFolderChoice('')).toBe('図と同じフォルダ (保存先の直下)');
    expect(ED.subChoice('out', '')).toBe('保存先の下の「out」フォルダ');
  });
  test('サブフォルダの図は図のフォルダを道で言い、保存先と呼ばない', function() {
    expect(ED.placeLabel('', 'docs/api')).toBe('図と同じフォルダ（docs/api）');
    expect(ED.placeLabel('out', 'docs\\api')).toBe('図のフォルダ（docs/api）の下の「out」フォルダ');
    expect(ED.sameFolderChoice('docs/api')).toBe('図と同じフォルダ (docs/api)');
    expect(ED.subChoice('img', 'docs/api')).toBe('図のフォルダ (docs/api) の下の「img」フォルダ');
    expect(ED.sameFolderChoice('docs/api')).not.toContain('保存先');
  });
  test('書いた直後の 1 行も図のフォルダを言う', function() {
    expect(ED.message({ rel: 'st.svg', bytes: 3, existed: false }, '', 'docs/api'))
      .toBe('書き出しました: st.svg → 図と同じフォルダ（docs/api） · 3 バイト · 新規');
  });
  test('パスの区切りは / に揃える', function() {
    expect(ED.slashPath('E:\\w\\proj')).toBe('E:/w/proj');
  });
});

describe('app.js の結線', function() {
  test('窓の「保存先:」は保存先 (root) を指し、図のフォルダ (dir) を保存先と呼ばない', function() {
    expect(APP).toContain("curEl.textContent = '保存先: ' + ED.slashPath(t.root)");
    expect(APP).not.toContain("'保存先: ' + t.dir");
  });
  test('置き場の言い方はどこでも図のフォルダを渡す', function() {
    expect((APP.match(/ED\.placeLabel\([^)]*\)/g) || []).every(function(s) { return /t\.folder\)$/.test(s); })).toBe(true);
    // TICKET-junior-20261123-1142-wish: PNG の画素数 (px) を後ろに足した。図のフォルダを渡すのは変わらない。
    expect(APP).toContain('ED.message(res.j, sub, t.folder, px)');
  });
  test('保存フォルダの一覧に直下の図だけである旨の行がある', function() {
    expect(APP).toContain("scope.id = 'folder-scope'");
    expect(APP).toContain('保存先の直下の図だけを並べます');
  });
});
