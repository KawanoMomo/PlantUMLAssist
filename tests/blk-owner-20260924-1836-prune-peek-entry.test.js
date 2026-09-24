'use strict';
// BLK-owner-20260924-1836-prune: 隣の保存フォルダを覗く窓 (#peek-modal) の入口が 5 つ・名前が 4 通りあり、
// 窓の中にも FILES「読むだけ」節と同じフォルダの一覧があった。入口と一覧を FILES「読むだけ」に寄せる。
//   - 読むだけのフォルダの右クリックに「このフォルダの図を調べる…」(そのフォルダを開いた状態で窓が出る)
//   - 窓の中のフォルダの一覧は外す。開いた時点で見るフォルダを 1 つに決める (右クリックした → 並べている相手 → 前回 → 先頭)
//   - ツール ▾ は案内 1 行 (FILES の読むだけ)。Ctrl+K は 1 行で右クリックと同じ名前、旧名は検索の語
//   - 保存先の右クリック「読むだけにする」は覗く窓を開かない (保存先は読むだけにできないので押せない)

var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var PF = W.MA.peekFolder;
var FM = W.MA.fileMenu;
var TM = W.MA.toolMenu;

var root = path.resolve(__dirname, '..');
var app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
var ui = fs.readFileSync(path.join(root, 'src', 'ui', 'file-menu.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'plantuml-assist.html'), 'utf8');

var DIRS = [
  { name: 'junior', path: 'D:/p/junior', files: 3, current: true },
  { name: 'primary', path: 'D:/p/primary', files: 5, current: false },
  { name: 'senior', path: 'D:/p/senior', files: 2, current: false },
];

describe('窓を開いたときに見るフォルダ (peek-folder.defaultDir)', function() {
  test('右クリックしたフォルダが最優先', function() {
    expect(PF.defaultDir(DIRS, 'D:/p/senior', 'D:/p/primary', '')).toBe('D:/p/senior');
  });
  test('次は右の枠に並べている相手 (区切り文字・大小は問わない)', function() {
    expect(PF.defaultDir(DIRS, '', 'd:\\p\\SENIOR', '')).toBe('D:/p/senior');
  });
  test('次は前に覗いていたフォルダ、無ければ先頭', function() {
    expect(PF.defaultDir(DIRS, '', '', 'D:/p/senior')).toBe('D:/p/senior');
    expect(PF.defaultDir(DIRS, '', '', '')).toBe('D:/p/primary');
  });
  test('自分の保存先・隣に無いフォルダは選ばない', function() {
    expect(PF.defaultDir(DIRS, 'D:/p/junior', 'D:/elsewhere', '')).toBe('D:/p/primary');
    expect(PF.defaultDir([DIRS[0]], '', '', '')).toBe('');
    expect(PF.defaultDir(null, 'x', 'y', 'z')).toBe('');
  });
});

describe('入口は FILES「読むだけ」の右クリック', function() {
  test('読むだけのフォルダの右クリックに「このフォルダの図を調べる…」', function() {
    var it = FM.folderItems({ kind: 'readonly' });
    var peek = it.filter(function(x) { return x.id === 'peek'; })[0];
    expect(peek.label).toBe('このフォルダの図を調べる…');
    expect(!!peek.disabled).toBe(false);
  });
  test('保存先・部品のフォルダには出さない', function() {
    ['target', 'part'].forEach(function(k) {
      expect(FM.folderItems({ kind: k }).some(function(x) { return x.id === 'peek'; })).toBe(false);
    });
  });
  test('押すとそのフォルダを渡して窓を開く', function() {
    var body = ui.slice(ui.indexOf('function runFolder'), ui.indexOf('// ── メニュー'));
    expect(body).toContain("case 'peek':");
    expect(body).toContain('window.openPeekFolder({ dir: folder && folder.dir })');
  });
  test('「読むだけにする」は覗く窓を開かない', function() {
    var body = ui.slice(ui.indexOf('function runFolder'), ui.indexOf('// ── メニュー'));
    var i = body.indexOf("case 'set-readonly':");
    expect(i).toBeGreaterThan(0);
    expect(body.slice(i, body.indexOf('\n', i))).not.toContain('btn-tab-peek');
    var t = FM.folderItems({ kind: 'target' }).filter(function(x) { return x.id === 'set-readonly'; })[0];
    expect(t.disabled).toBe(true);
  });
});

describe('窓の中のフォルダの一覧は外す', function() {
  var body = app.slice(app.indexOf('function renderPeekDirs'), app.indexOf('function _peekDirsShow'));
  test('フォルダの行 (.peek-dir) を作らず、左の列は畳む', function() {
    expect(body).not.toContain("'peek-dir'");
    expect(body).not.toContain('selectPeekDir(');
    expect(body).toContain("el.dirs.style.display = 'none'");
  });
  test('見出しに今見ているフォルダの名前、押すとツリーのその行へ', function() {
    expect(html).toContain('id="peek-dir-name"');
    expect(app).toContain("dirName.addEventListener('click', revealPeekDirInTree)");
    var rv = app.slice(app.indexOf('function revealPeekDirInTree'), app.indexOf('function revealPeekDirInTree') + 900);
    expect(rv).toContain("FP.setSec('readonly', true)");
    expect(rv).toContain('.files-ro-folder[data-ro-dir]');
  });
  test('ドメインで揃える・同名で並べるの間だけ左の列を使う', function() {
    ['function renderCohortDomains', 'function renderSbsPairs'].forEach(function(fn) {
      var b = app.slice(app.indexOf(fn), app.indexOf(fn) + 200);
      expect(b).toContain('_peekDirsShow()');
    });
  });
  test('開くときは PF.defaultDir で 1 つに決める', function() {
    var op = app.slice(app.indexOf('function openPeekFolder'), app.indexOf('function openPeekFolder') + 1600);
    expect(op).toContain('PF.defaultDir(_peekDirs, want,');
  });
});

describe('ツール ▾ と Ctrl+K', function() {
  test('ツール ▾ のレビューには並べず、案内 1 行に落とす', function() {
    var review = TM.panelGroups().filter(function(g) { return g.key === 'review'; })[0];
    expect(review.items.some(function(it) { return it.id === 'btn-tab-peek'; })).toBe(false);
    expect(TM.FILES_NOTE).toContain('FILES の読むだけ');
    expect(TM.FILES_NOTE).toContain('このフォルダの図を調べる…');
  });
  test('Ctrl+K は 1 行で、右クリックと同じ名前。旧名は検索の語に残す', function() {
    var rows = app.split('\n').filter(function(l) { return l.indexOf("button: 'btn-tab-peek'") >= 0; });
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain("title: 'このフォルダの図を調べる…");
    ['他フォルダを覗く', '他の保存フォルダを覗く', '読むだけのフォルダを足す', 'peek'].forEach(function(k) {
      expect(rows[0]).toContain("'" + k + "'");
    });
  });
});
