'use strict';
// BLK-junior-20260916-0546-wish: 📂 一覧は保存先の中身しか出せず、先輩の図を覗くには
// 保存先を切り替えるしかなかった。切り替えたまま保存すると自分の図が他人のフォルダに
// 紛れ込むので、junior は手順 1 のたびに「戻し忘れていないか」を確かめていた。
// 参照先を保存先とは別に登録してタブで並べれば、その確認そのものが要らなくなる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/ref-folders.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var RF = global.window.MA.refFolders;

var MINE = 'E:\\01_Loop\\persona-data\\junior';
var SENIOR = 'E:\\01_Loop\\persona-data\\primary';
var OTHER = 'E:\\01_Loop\\persona-data\\reviewer';

function fakeStorage() {
  var box = {};
  return {
    box: box,
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
    setItem: function(k, v) { box[k] = String(v); },
  };
}

describe('ref-folders: 参照専用フォルダを保存先と別に持つ', function() {

  test('タブは保存先が先頭で、参照には (参照) が付く', function() {
    var tabs = RF.tabs(MINE, [SENIOR], '');
    expect(tabs.length).toBe(2);
    expect(tabs[0].label).toBe('junior(保存先)');
    expect(tabs[0].kind).toBe('save');
    expect(tabs[0].active).toBe(true);
    expect(tabs[1].label).toBe('primary(参照)');
    expect(tabs[1].kind).toBe('ref');
    expect(tabs[1].active).toBe(false);
  });

  test('参照タブを見ている間も、保存先タブは先頭に残る', function() {
    var tabs = RF.tabs(MINE, [SENIOR, OTHER], SENIOR);
    expect(tabs[0].kind).toBe('save');
    expect(tabs[0].active).toBe(false);
    expect(tabs[1].active).toBe(true);
    expect(tabs[2].active).toBe(false);
    expect(RF.activeTab(MINE, [SENIOR, OTHER], SENIOR).name).toBe('primary');
  });

  test('登録の消えたフォルダを見ていたら、保存先タブに戻す', function() {
    var tabs = RF.tabs(MINE, [SENIOR], OTHER);
    expect(tabs.length).toBe(2);
    expect(tabs[0].active).toBe(true);
  });

  test('保存先そのものは参照に足さない (書き込む先が 2 枚に割れない)', function() {
    expect(RF.add([], MINE, MINE).length).toBe(0);
    expect(RF.add([], MINE + '\\', MINE).length).toBe(0);
    // 同じフォルダを二度足しても 1 枚 (区切りと大小文字の違いは同じと見る)。
    var list = RF.add(RF.add([], SENIOR, MINE), 'E:/01_Loop/persona-data/PRIMARY', MINE);
    expect(list.length).toBe(1);
  });

  test('外した参照は残らない', function() {
    var list = RF.add(RF.add([], SENIOR, MINE), OTHER, MINE);
    expect(list.length).toBe(2);
    var left = RF.remove(list, SENIOR);
    expect(left.length).toBe(1);
    expect(RF.baseName(left[0])).toBe('reviewer');
  });

  test('参照タブは「保存先は変わらない」と自分で言う', function() {
    expect(RF.isRef(MINE, SENIOR)).toBe(true);
    expect(RF.isRef(MINE, '')).toBe(false);
    expect(RF.notice(MINE, SENIOR)).toBe('読むだけです。保存先は junior のまま変わりません');
    expect(RF.notice(MINE, '')).toBe('');
  });

  test('足せる行き先から、保存先と登録済みを外す', function() {
    var choices = [{ path: MINE, name: 'junior' }, { path: SENIOR, name: 'primary' },
                   { path: OTHER, name: 'reviewer' }];
    var left = RF.candidates(choices, MINE, [SENIOR]);
    expect(left.length).toBe(1);
    expect(left[0].name).toBe('reviewer');
  });

  test('登録は保存され、壊れていても画面を止めない', function() {
    var st = fakeStorage();
    RF.save(st, [SENIOR, OTHER]);
    expect(RF.load(st).length).toBe(2);
    st.setItem(RF.STORE_KEY, '{壊れた');
    expect(RF.load(st)).toEqual([]);
    expect(RF.parse(null)).toEqual([]);
  });
});
