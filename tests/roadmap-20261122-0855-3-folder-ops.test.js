'use strict';
// TICKET-roadmap-20261122-0855-3 (roadmap/v6.0.md 必須 4): FILES ツリーの右クリックだけで、そのフォルダに新しい図・新しいフォルダ・
// 移動・名前変更・削除を終え、開いているタブの書き先を付いていかせる。
// 実マウスの確かめは tests/scenarios/roadmap-20261122-0855-3.spec.js。ここは
//   - 右クリックの中身 (保存先とサブフォルダに「新しいフォルダ」、サブフォルダは作る 2 つだけ、移動の行き先の札)
//   - タブの居場所の付け替え (workspace.setPlace)
//   - 付け替えの間はそのタブを書かない・待っている自動保存を先に書き切らせる
//   - server の mkdir は 1 つだけ作り、同じ名前は断る。削除の前に中身を版として控える
// を守る。
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
(function() {
  var store = {};
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
  } });
})();
['../src/core/file-menu.js', '../src/core/workspace.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var fs = require('fs');
var path = require('path');
var FM = global.window.MA.fileMenu;
var WS = global.window.MA.workspace;
var ROOT = path.join(__dirname, '..');
var SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
var UIFM = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'file-menu.js'), 'utf8');

function ids(items) { return items.filter(function(i) { return !i.sep; }).map(function(i) { return i.id; }); }

describe('右クリックの中身 (fileMenu)', function() {
  test('保存先の右クリックに「新しいフォルダ」がある (新しい図のすぐ下)', function() {
    var t = ids(FM.folderItems({ kind: 'target' }));
    expect(t.indexOf('new-folder')).toBe(t.indexOf('new-doc') + 1);
  });
  test('サブフォルダの右クリックは、そこに作る 2 つ (新しい図・新しいフォルダ) だけ', function() {
    expect(ids(FM.folderItems({ kind: 'sub' }))).toEqual(['new-doc', 'new-folder']);
    expect(FM.folderItems({ kind: 'sub' }).map(function(i) { return i.label; })).toEqual(['新しい図', '新しいフォルダ']);
  });
  test('読むだけのフォルダには作る行を出さない', function() {
    var r = ids(FM.folderItems({ kind: 'readonly' }));
    expect(r.indexOf('new-doc')).toBe(-1);
    expect(r.indexOf('new-folder')).toBe(-1);
  });
  test('ファイルの右クリックは直下の図でもサブフォルダの図でも同じ語・同じ並び', function() {
    expect(ids(FM.fileItems({}))).toEqual(['open', 'history', 'rename', 'copy', 'move', 'export-svg', 'reveal', 'delete']);
  });
  test('移動の行き先: 保存先の下のフォルダは「保存先の下」、隣の保存フォルダは「フォルダ」の札', function() {
    var t = FM.moveTargets('a', [{ path: 'E:/w/design/archive', name: 'design/archive', inTarget: true },
      { path: 'E:/other', name: 'other' }]);
    expect(t[0].label).toBe('design/archive');
    expect(t[0].tag).toBe('保存先の下');
    expect(t[0].dir).toBe('E:/w/design/archive');
    expect(t[1].tag).toBe('フォルダ');
    expect(t[t.length - 1].id).toBe('move-path');
  });
});

describe('タブの居場所を付け替える (workspace.setPlace)', function() {
  test('直下の図をサブフォルダへ移すと、そのフォルダの図になる。名前はそのまま', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var d = WS.openOrActivate({ name: 'a', dsl: 'X' });
    var m = WS.setPlace(d.id, 'E:/w/design', true);
    expect(m.sub).toBe(true);
    expect(m.dir).toBe('E:/w/design');
    expect(m.name).toBe('a');
    expect(WS.dirOf(d.id, 'E:/w')).toBe('E:/w/design');
  });
  test('保存先そのものへ戻すと、今の保存先に従うタブに戻る', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var d = WS.openOrActivate({ name: 'a', sub: true, dir: 'E:/w/design', dsl: 'X' });
    var m = WS.setPlace(d.id, '', false);
    expect(!!m.sub).toBe(false);
    expect(m.dir === undefined).toBe(true);
    expect(WS.dirOf(d.id, 'E:/w')).toBe('E:/w');
  });
});

describe('付け替えの間はそのタブを書かない (前の場所に 2 枚目を作らない)', function() {
  test('移動・名前変更は、待っている自動保存を先に書き切らせてから、タブを止めてディスクを付け替える', function() {
    var w = UIFM.slice(UIFM.indexOf('function withHeldDoc'));
    w = w.slice(0, w.indexOf('\n  }\n'));
    expect(w.indexOf('settle()') >= 0).toBe(true);
    expect(w.indexOf('settle()') < w.indexOf('hold(doc.id, true)')).toBe(true);
    expect(w.indexOf('hold(doc.id, true)') < w.indexOf('return op()')).toBe(true);
  });
  test('止めている間は自動保存・タブの書き戻し・まとめた書き戻しのどれも書かない', function() {
    expect(APP).toContain("if (doc && _docWriteHeld(doc.id)) return { name: '', reason: 'moving' };");
    expect(APP).toContain("cfg.backend === 'file' && _docWriteHeld(doc.id)");
    expect(APP).toContain('if (_docWriteHeld(doc.id)) return false;');
  });
  test('「この図の履歴」はサブフォルダの図ならそのフォルダの版を読む', function() {
    var lv = APP.slice(APP.indexOf('function loadVersions'));
    lv = lv.slice(0, lv.indexOf('\n  }\n'));
    expect(lv).toContain('_histDirFor(name)');
  });
});

describe('server: 新しいフォルダと削除の控え', function() {
  var mk = SERVER.slice(SERVER.indexOf('def _file_op_mkdir'));
  mk = mk.slice(0, mk.indexOf('\n    def ', 10));
  test('mkdir は 1 つだけ作り (parents を作らない)、同じ名前は 409 で断る', function() {
    expect(mk).toContain('dst.mkdir()');
    expect(mk.indexOf('parents=True')).toBe(-1);
    expect(mk).toContain('409');
    expect(mk).toContain('is_safe_autosave_name(to_name)');
    expect(mk).toContain("to_name.startswith('.')");
  });
  test('削除の直前に今の中身を版として控える (「この図の履歴」から戻せる)', function() {
    var del = SERVER.slice(SERVER.indexOf('def _autosave_delete_one'));
    del = del.slice(0, del.indexOf('\n    def ', 10));
    expect(del.indexOf('self._stash_version(save_dir, dt, None)') >= 0).toBe(true);
    expect(del.indexOf('self._stash_version(save_dir, dt, None)') < del.indexOf('target.unlink()')).toBe(true);
  });
});
