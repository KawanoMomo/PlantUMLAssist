'use strict';
// TICKET-owner-20261123-1922-1: 保存先を決めていない既定の画面で、FILES の「保存先」が既定のフォルダ ./autosave の図を並べ、
// そこから開いた図の Ctrl+S・書き出しはその図に書かずダウンロードになり、`!include` も別のフォルダを探していた。
// 一覧が読むフォルダ (listDir) と保存が書く行き先 (decide) を同じ 1 つから決め、未設定のときは一覧に図を並べない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');

try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
require('../src/core/workspace.js');
try { delete require.cache[require.resolve('../src/core/save-target.js')]; } catch (e) {}
require('../src/core/save-target.js');
var STG = global.window.MA.saveTarget;

var CFGS = [
  null,
  {},
  { backend: 'localStorage', fileDir: './autosave' },     // 既定の画面 (auto-save.js の DEFAULTS)
  { backend: 'localStorage', fileDir: 'E:/persona/primary' },
  { backend: 'file', fileDir: 'E:/persona/primary' },
  { backend: 'file', fileDir: './autosave' },
  { backend: 'file' },
];

describe('TICKET-owner-20261123-1922-1 保存先が未設定のとき、一覧の読むフォルダと保存の行き先が食い違わない', () => {
  test('既定の画面 (保存先を決めていない) では一覧は図を並べるフォルダを持たない', () => {
    expect(STG.listDir({ backend: 'localStorage', fileDir: './autosave' })).toBe('');
    expect(STG.listDir(null)).toBe('');
  });

  test('保存先を決めた画面では、一覧のフォルダは今までどおりその保存先', () => {
    expect(STG.listDir({ backend: 'file', fileDir: 'E:/persona/primary' })).toBe('E:/persona/primary');
    expect(STG.listDir({ backend: 'file' })).toBe('./autosave');
  });

  test('どの設定でも、一覧に並ぶフォルダの図の Ctrl+S はそのフォルダに書く (並ぶのにダウンロードになる組が無い)', () => {
    CFGS.forEach(function(cfg) {
      var listed = STG.listDir(cfg);
      var t = STG.decide(cfg, { name: 'hand_seq' });
      if (listed) {
        expect(t.mode).toBe('file');
        expect(t.dir).toBe(listed);
      } else {
        expect(t.mode).toBe('download');
      }
    });
  });

  test('未設定の案内は、保存がダウンロードになることと決める入口の語を言う', () => {
    var h = STG.unsetHint();
    expect(h.text).toContain('保存先のフォルダを決めていません');
    expect(h.text).toContain('ダウンロード');
    expect(h.how).toContain('保存先のフォルダを選ぶ…');
  });

  test('保存先の一覧の描画は、図を読みに行く前に listDir で未設定を見分けて案内を出す', () => {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    var at = src.indexOf('function renderFolderPanel()');
    expect(at).toBeGreaterThan(0);
    var body = src.slice(at, src.indexOf('listFolder(dir)', at));
    expect(body).toContain('ST.listDir(cfgNow)');
    expect(body).toContain('renderFolderUnset()');
  });
});
