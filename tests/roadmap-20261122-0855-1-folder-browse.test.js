'use strict';
// TICKET-roadmap-20261122-0855-1: 保存先を選ぶ窓でフォルダを辿る (子へ・親へ・ドライブ・最近使ったフォルダ)。
// 実マウスの確かめは tests/scenarios/roadmap-20261122-0855.spec.js。ここは答えの読み方と最近使ったフォルダの控え、
// 4 つの入口が同じ 1 つの窓 (openChangeTarget) を開くこと、server の口が読むだけであることを守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
try { delete require.cache[require.resolve('../src/core/folder-browse.js')]; } catch (e) {}
require('../src/core/folder-browse.js');
var FB = global.window.MA.folderBrowse;

var ROOT = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
var SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

function memStore() {
  var m = {};
  return { getItem: function(k) { return k in m ? m[k] : null; }, setItem: function(k, v) { m[k] = String(v); } };
}

describe('folder-browse: /browse-dir の答えの読み方', function() {
  test('ok の答えは子フォルダ・親・枚数・ドライブを持つ', function() {
    var v = FB.view({ ok: true, path: 'E:/w', parent: 'E:/', files: 2,
      dirs: [{ name: 'docs', path: 'E:/w/docs', files: 3 }, { name: 'old', path: 'E:/w/old', files: 0 }, { name: 'x' }],
      drives: ['C:\\', 'E:\\'] });
    expect(v.ok).toBe(true);
    expect(v.parent).toBe('E:/');
    expect(v.files).toBe(2);
    expect(v.dirs.map(function(d) { return d.name; })).toEqual(['docs', 'old']);
    expect(v.drives).toEqual(['C:\\', 'E:\\']);
  });
  test('読めない・存在しないフォルダは ok: false と理由', function() {
    var v = FB.view({ ok: false, path: 'E:/nope', error: 'そのフォルダはありません' });
    expect(v.ok).toBe(false);
    expect(v.error).toBe('そのフォルダはありません');
    expect(FB.view(null).ok).toBe(false);
    expect(FB.view(null).error.length > 0).toBe(true);
  });
  test('図の無いフォルダも行に出し、枚数は図があるときだけ付ける', function() {
    expect(FB.dirLabel({ name: 'docs', files: 3 })).toBe('docs  3 図');
    expect(FB.dirLabel({ name: 'old', files: 0 })).toBe('old');
    expect(FB.hereText({ ok: true, path: 'E:/w', files: 0 })).toContain('図はまだありません');
    expect(FB.hereText({ ok: true, path: 'E:/w', files: 2 })).toContain('2 図');
  });
  test('browseUrl はパスを URL に符号化する', function() {
    expect(FB.browseUrl('E:\\a b')).toBe('/browse-dir?dir=' + encodeURIComponent('E:\\a b'));
    expect(FB.browseUrl('')).toBe('/browse-dir?dir=');
  });
});

describe('folder-browse: 最近使ったフォルダ', function() {
  test('新しい順・同じフォルダ (区切り・大文字小文字違い) は 1 行・最大件数まで', function() {
    var l = [];
    l = FB.pushRecent(l, 'E:/a');
    l = FB.pushRecent(l, 'E:/b');
    l = FB.pushRecent(l, 'e:\\A');
    expect(l).toEqual(['e:\\A', 'E:/b']);
    for (var i = 0; i < 10; i++) l = FB.pushRecent(l, 'E:/d' + i);
    expect(l.length).toBe(FB.RECENT_MAX);
    expect(l[0]).toBe('E:/d9');
  });
  test('控えは往復し、壊れた控えは空として読む', function() {
    var s = memStore();
    FB.saveRecent(s, ['E:/a', 'E:/b']);
    expect(FB.loadRecent(s)).toEqual(['E:/a', 'E:/b']);
    s.setItem(FB.RECENT_KEY, '{oops');
    expect(FB.loadRecent(s)).toEqual([]);
    expect(FB.loadRecent(null)).toEqual([]);
  });
  test('baseName はフォルダ名', function() {
    expect(FB.baseName('E:\\work\\docs\\')).toBe('docs');
    expect(FB.baseName('C:\\')).toBe('C:');
  });
});

describe('保存先を決める・替える窓は 1 つ (FILES・Import ▾・Ctrl+K・⚙ 設定)', function() {
  test('Import ▾ に「保存先のフォルダを選ぶ…」があり、押すと openChangeTarget', function() {
    expect(HTML).toContain('<button id="imp-target">保存先のフォルダを選ぶ…</button>');
    expect(/getElementById\('imp-target'\)[\s\S]{0,200}openChangeTarget\(\)/.test(APP)).toBe(true);
  });
  test('⚙ 設定に同じ窓を開くボタンがある', function() {
    expect(HTML).toContain('id="cfg-file-dir-pick"');
    expect(/getElementById\('cfg-file-dir-pick'\)[\s\S]{0,200}openChangeTarget\(\)/.test(APP)).toBe(true);
  });
  test('Ctrl+K の change-target と FILES の右クリックも同じ openChangeTarget', function() {
    expect(/id: 'change-target'[^\n]*openChangeTarget/.test(APP)).toBe(true);
  });
  test('窓を作る関数は 1 つ (#target-pick を作るのは openChangeTarget だけ)', function() {
    expect((APP.match(/\.id = 'target-pick';/g) || []).length).toBe(1);
  });
});

describe('server の /browse-dir は読むだけ', function() {
  var body = SERVER.slice(SERVER.indexOf('def _handle_browse_dir'));
  body = body.slice(0, body.indexOf('\n    def ', 10));
  test('口がある', function() {
    expect(SERVER).toContain("== '/browse-dir'");
    expect(body.length > 100).toBe(true);
  });
  test('書かない (write / mkdir / unlink / rename を呼ばない)', function() {
    ['write_text', 'write_bytes', 'mkdir', 'unlink', 'rename', 'rmdir', 'open('].forEach(function(w) {
      expect(body.indexOf(w)).toBe(-1);
    });
  });
  test('試験 (PUA_DATA_ROOT) ではそこから辿り、本物のドライブを並べない', function() {
    expect(body).toContain('DATA_ROOT if SANDBOX_DATA_ROOT else Path.home()');
    expect(body).toContain('not SANDBOX_DATA_ROOT');
  });
});
