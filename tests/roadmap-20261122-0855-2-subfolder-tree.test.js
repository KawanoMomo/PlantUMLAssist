'use strict';
// TICKET-roadmap-20261122-0855-2 (roadmap/v6.0.md 必須 3): 保存先の下のサブフォルダを FILES ツリーに階層のまま出し、
// その図を開く・直す・保存する・名前で探すをその場でできるようにする。
// 実マウスの確かめは tests/scenarios/roadmap-20261122-0855-2.spec.js。ここは
//   - ツリーの行の組み方 (実在の階層のまま・.puml の無いフォルダも出す・畳んだ下は出さない・絞り込みは道を添えて平らに)
//   - 同じ名前の図が直下とサブフォルダにあっても、タブは別々で名前を付け替えない (付け替えると別のファイルへ書く)
//   - パンくずは保存先からの道を 1 段ずつ言う
//   - server の /tree-dir は読むだけ (何も書かない)
// を守る。
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
(function() {
  var store = {};
  var stub = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: stub });
})();
['../src/core/file-tree.js', '../src/core/top-status.js', '../src/core/workspace.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var fs = require('fs');
var path = require('path');
var FT = global.window.MA.fileTree;
var TS = global.window.MA.topStatus;
var WS = global.window.MA.workspace;
var ROOT = path.join(__dirname, '..');
var SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
var FMENU = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'file-menu.js'), 'utf8');

// /tree-dir の答え (行きがけ順)。docs/api に 2 枚、docs/old は図の無いフォルダ、spec に 1 枚。
var DIRS = [
  { rel: 'docs', path: 'E:/w/docs', name: 'docs', depth: 1, files: ['gpio_seq'] },
  { rel: 'docs/api', path: 'E:/w/docs/api', name: 'api', depth: 2, files: ['spi_state', 'can_seq'] },
  { rel: 'docs/old', path: 'E:/w/docs/old', name: 'old', depth: 2, files: [] },
  { rel: 'spec', path: 'E:/w/spec', name: 'spec', depth: 1, files: ['gpio_seq'] },
];
function shape(rows) {
  return rows.map(function(r) { return r.type === 'dir' ? 'D ' + r.rel + (r.open ? ' ▾' : ' ▸') : 'F ' + r.rel + '/' + r.name; });
}

describe('サブフォルダの行 (fileTree.subTreeRows)', function() {
  test('畳んだままなら直下のフォルダの行だけ (名前も場所も変えない)', function() {
    expect(shape(FT.subTreeRows(DIRS, {}, ''))).toEqual(['D docs ▸', 'D spec ▸']);
  });
  test('開いたフォルダの下に、その図 (名前の順) と子フォルダが実在の階層のまま並ぶ。図の無いフォルダも行に出る', function() {
    expect(shape(FT.subTreeRows(DIRS, { docs: true }, ''))).toEqual(
      ['D docs ▾', 'F docs/gpio_seq', 'D docs/api ▸', 'D docs/old ▸', 'D spec ▸']);
    expect(shape(FT.subTreeRows(DIRS, { docs: true, 'docs/api': true }, ''))).toEqual(
      ['D docs ▾', 'F docs/gpio_seq', 'D docs/api ▾', 'F docs/api/can_seq', 'F docs/api/spi_state', 'D docs/old ▸', 'D spec ▸']);
  });
  test('親を畳むと、開いたままの子の行も出さない', function() {
    expect(shape(FT.subTreeRows(DIRS, { 'docs/api': true }, ''))).toEqual(['D docs ▸', 'D spec ▸']);
  });
  test('図の行はそのフォルダの絶対パスを持つ (そのファイルを開く・書く)', function() {
    var rows = FT.subTreeRows(DIRS, { docs: true, 'docs/api': true }, '');
    var f = rows.filter(function(r) { return r.type === 'file' && r.name === 'spi_state'; })[0];
    expect(f.dir).toBe('E:/w/docs/api');
    expect(f.rel).toBe('docs/api');
    var d = rows.filter(function(r) { return r.type === 'dir' && r.rel === 'docs/api'; })[0];
    expect(d.count).toBe(2);
    expect(d.depth).toBe(2);
  });
  test('絞り込みは畳んでいても当たる図だけを道を添えて平らに出し、同じ名前はフォルダの順に並ぶ', function() {
    var rows = FT.subTreeRows(DIRS, {}, 'GPIO');
    expect(shape(rows)).toEqual(['F docs/gpio_seq', 'F spec/gpio_seq']);
    expect(rows[0].dir).toBe('E:/w/docs');
    expect(rows[1].dir).toBe('E:/w/spec');
    // 「フォルダ/名前」でも引ける
    expect(shape(FT.subTreeRows(DIRS, {}, 'api/'))).toEqual(['F docs/api/can_seq', 'F docs/api/spi_state']);
    expect(FT.subTreeRows(DIRS, {}, 'nothing')).toEqual([]);
  });
  test('答えが無い・壊れていても空', function() {
    expect(FT.subTreeRows(null, null, '')).toEqual([]);
  });
});

describe('保存先からの道 (fileTree.relSegments)', function() {
  test('区切り・大文字小文字の違いを問わず、保存先の下なら道を返す', function() {
    expect(FT.relSegments('E:\\w', 'E:\\w\\docs\\api')).toEqual(['docs', 'api']);
    expect(FT.relSegments('e:/W/', 'E:\\w\\docs')).toEqual(['docs']);
    expect(FT.relSegments('E:/w', 'E:/w')).toEqual([]);
  });
  test('保存先の外・名前の頭が同じだけの隣のフォルダは null', function() {
    expect(FT.relSegments('E:/w', 'E:/work/docs')).toBeNull();
    expect(FT.relSegments('E:/w', 'D:/w/docs')).toBeNull();
    expect(FT.relSegments('', 'E:/w')).toBeNull();
  });
});

describe('パンくずは保存先からの道を言う (topStatus.crumbs)', function() {
  test('サブフォルダの図は保存先の段の後に 1 段ずつ', function() {
    var c = TS.crumbs('work', ['docs', 'api']);
    expect(c.map(function(x) { return x.kind + ':' + x.label; })).toEqual(['target:work', 'sub:docs', 'sub:api']);
    expect(c[2].title).toContain('work/docs/api');
  });
  test('直下の図は今までどおり保存先の 1 段', function() {
    expect(TS.crumbs('work').length).toBe(1);
    expect(TS.crumbs('work', []).length).toBe(1);
    expect(TS.crumbs('')).toEqual([]);
  });
});

describe('同じ名前の図が直下とサブフォルダにあるとき (workspace)', function() {
  test('別々のタブで開き、どちらの名前も付け替えない (付け替えると別のファイルへ書く)', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var top = WS.openOrActivate({ name: 'gpio_seq', dsl: 'TOP' });
    var sub = WS.openOrActivate({ name: 'gpio_seq', sub: true, dir: 'E:/w/spec', dsl: 'SUB' });
    expect(sub.id === top.id).toBe(false);
    expect(top.name).toBe('gpio_seq');
    expect(sub.name).toBe('gpio_seq');
    expect(sub.sub).toBe(true);
    expect(WS.dirOf(sub.id, 'E:/w')).toBe('E:/w/spec');
    expect(WS.dirOf(top.id, 'E:/w')).toBe('E:/w');
  });
  test('直下の図をもう一度開いてもサブフォルダのタブに当たらず、中身も書き換えない', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var sub = WS.openOrActivate({ name: 'gpio_seq', sub: true, dir: 'E:/w/spec', dsl: 'SUB' });
    var top = WS.openOrActivate({ name: 'gpio_seq', dsl: 'TOP' });
    expect(top.id === sub.id).toBe(false);
    var again = WS.openOrActivate({ name: 'gpio_seq', sub: true, dir: 'e:\\w\\spec', dsl: 'SUB2' });
    expect(again.id).toBe(sub.id);
    var list = WS.list();
    var s = list.filter(function(d) { return d.id === sub.id; })[0];
    var t = list.filter(function(d) { return d.id === top.id; })[0];
    expect(s.dsl).toBe('SUB2');
    expect(t.dsl).toBe('TOP');
    expect(s.dir).toBe('E:/w/spec');   // 読み直してもサブフォルダのファイルのまま (留めを外さない)
  });
  test('仮のタブで開いても、直下の同じ名前のタブへは移らない', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var top = WS.openOrActivate({ name: 'a', dsl: 'TOP' });
    var sub = WS.openPreview({ name: 'a', sub: true, dir: 'E:/w/x', dsl: 'SUB' });
    expect(sub.id === top.id).toBe(false);
    expect(sub.preview).toBe(true);
  });
  test('findByName は直下の図だけ、findOpen は居場所で引く', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var sub = WS.openOrActivate({ name: 'a', sub: true, dir: 'E:/w/x', dsl: 'SUB' });
    expect(WS.findByName('a')).toBeNull();
    expect(WS.findOpen({ name: 'a', sub: true, dir: 'E:/w/x' }).id).toBe(sub.id);
    expect(WS.findOpen({ name: 'a' })).toBeNull();
    expect(WS.findOpen({ name: 'a', sub: true, dir: 'E:/w/y' })).toBeNull();
  });
  test('同じフォルダの中では今までどおり名前を一意にする', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    var a = WS.open({ name: 'n', sub: true, dir: 'E:/w/x' });
    var b = WS.open({ name: 'n', sub: true, dir: 'E:/w/x' });
    expect(a.name).toBe('n');
    expect(b.name).toBe('n-2');
  });
  test('サブフォルダのタブの印は開き直し (localStorage) の後も残る', function() {
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '' });
    WS.openOrActivate({ name: 'a', sub: true, dir: 'E:/w/x', dsl: 'SUB' });
    var raw = global.window.localStorage.getItem('plantuml-workspace');
    WS.reset();
    global.window.localStorage.setItem('plantuml-workspace', raw);
    WS.init({});
    var d = WS.list().filter(function(x) { return x.name === 'a'; })[0];
    expect(d.sub).toBe(true);
    expect(d.dir).toBe('E:/w/x');
  });
});

describe('名前で引く操作はサブフォルダの図に当てない (直下の同じ名前の図を消さない)', function() {
  test('ツリーの名前変更・削除の相手 (FILE_SEL) にサブフォルダの行を入れない', function() {
    var m = FMENU.match(/var FILE_SEL = '([^']*)'/);
    expect(!!m).toBe(true);
    expect(m[1].indexOf('files-sub')).toBe(-1);
    expect(FMENU).toContain('isSubDocRow(row)');
  });
  test('タブ・図の設定からの名前の変更は、サブフォルダの図では付け替えをしない', function() {
    var p = APP.slice(APP.indexOf('function promptRenameDoc'));
    p = p.slice(0, p.indexOf('WS.rename('));
    expect(p).toContain('if (doc.sub)');
    var d = APP.slice(APP.indexOf('function _dsRenameActive'));
    d = d.slice(0, d.indexOf('ws.rename('));
    expect(d).toContain('actDoc.sub');
  });
  test('サブフォルダの図は「最近開いた図」に積まない (名前だけの履歴は直下の図を開く)', function() {
    var f = APP.slice(APP.indexOf('function openFromSubFolder'));
    f = f.slice(0, f.indexOf('window.openFromSubFolder = openFromSubFolder'));
    expect(f.length > 100).toBe(true);
    expect(f.indexOf('recentPush(')).toBe(-1);
    expect(f).toContain('markOpenedSource(doc)');
  });
});

describe('server の /tree-dir は読むだけ', function() {
  var body = SERVER.slice(SERVER.indexOf('def _handle_tree_dir'));
  body = body.slice(0, body.indexOf('\n    def ', 10));
  test('口がある', function() {
    expect(SERVER).toContain("== '/tree-dir'");
    expect(body.length > 100).toBe(true);
  });
  test('書かない (write / mkdir / unlink / rename を呼ばない)', function() {
    ['write_text', 'write_bytes', 'mkdir', 'unlink', 'rename', 'rmdir', 'open(', '_state_path'].forEach(function(w) {
      expect(body.indexOf(w)).toBe(-1);
    });
  });
  test('隠しフォルダと控えの置き場は出さない', function() {
    var skip = SERVER.slice(SERVER.indexOf('def _tree_skip'));
    skip = skip.slice(0, skip.indexOf('\n    def ', 10));
    expect(skip).toContain("startswith('.')");
    expect(skip).toContain('VERSIONS_DIRNAME');
  });
});
