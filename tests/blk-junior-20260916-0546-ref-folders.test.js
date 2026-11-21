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

describe('ref-folders: 参照に足したフォルダを保存先と別に控える', function() {

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

  // BLK-owner-20260925-0416-prune: 参照タブ列を外し、控えのフォルダは FILES「読むだけ」節の並び (/peek-dirs) に
  // keep で渡して残す。保存先そのものと空の行は渡さない。
  test('控えのフォルダは keep で読むだけ節に渡し、保存先は渡さない', function() {
    var q = RF.keepQuery([SENIOR, MINE, '', OTHER], MINE);
    expect(q).toBe('&keep=' + encodeURIComponent(SENIOR) + '&keep=' + encodeURIComponent(OTHER));
    expect(RF.keepQuery([], MINE)).toBe('');
    expect(RF.keepQuery(null, MINE)).toBe('');
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
