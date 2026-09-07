'use strict';
// BLK-junior-20260908-0723: 先輩の図を読むためだけに保存先をフルパスで打ち替え、
// 読んだ後に打ち戻していた (往復 60 字超)。読むだけなら保存先は動かさない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/peek-folder.js')]; } catch (e) {}
require('../src/core/peek-folder.js');
var pf = global.window.MA.peekFolder;

var PAYLOAD = {
  current: 'E:\\01_Loop\\persona-data\\junior',
  parent: 'E:\\01_Loop\\persona-data',
  dirs: [
    { name: 'junior', path: 'E:\\01_Loop\\persona-data\\junior', files: 8, current: true },
    { name: 'reviewer', path: 'E:\\01_Loop\\persona-data\\reviewer', files: 3, current: false },
    { name: 'primary', path: 'E:\\01_Loop\\persona-data\\primary', files: 22, current: false },
    { name: 'tmp', path: 'E:\\01_Loop\\persona-data\\tmp', files: 0, current: false },
  ],
};

describe('peekFolder.choices', function() {
  test('自分の保存先が先頭、残りは名前順', function() {
    var names = pf.choices(PAYLOAD).map(function(d) { return d.name; });
    expect(names).toEqual(['junior', 'primary', 'reviewer']);
  });

  test('図が 0 枚のフォルダは行き先にしない', function() {
    expect(pf.choices(PAYLOAD).map(function(d) { return d.name; })).not.toContain('tmp');
  });

  test('自分の保存先は 0 枚でも残る (自分の図が無い日でも入口は消えない)', function() {
    var p = { dirs: [{ name: 'junior', path: 'x/junior', files: 0, current: true }] };
    expect(pf.choices(p).length).toBe(1);
  });

  test('others は自分の保存先を外す', function() {
    var names = pf.others(pf.choices(PAYLOAD)).map(function(d) { return d.name; });
    expect(names).toEqual(['primary', 'reviewer']);
  });

  test('壊れた応答で落ちない', function() {
    expect(pf.choices(null)).toEqual([]);
    expect(pf.choices({ dirs: [null, { name: 'x' }] })).toEqual([]);
    expect(pf.others(null)).toEqual([]);
  });
});

describe('peekFolder の表示', function() {
  test('行き先の表示は枚数付き、自分の保存先は明示', function() {
    var list = pf.choices(PAYLOAD);
    expect(pf.label(list[0])).toBe('junior (8 枚) — 自分の保存先');
    expect(pf.label(list[1])).toBe('primary (22 枚)');
  });

  test('閲覧中の 1 行は「保存先は変わらない」を必ず言う', function() {
    var t = pf.noticeText('E:\\01_Loop\\persona-data\\primary', 'E:\\01_Loop\\persona-data\\junior');
    expect(t).toContain('primary を読むだけで見ています');
    expect(t).toContain('保存先は junior のままです');
  });

  test('自分の保存先を見ているときは言い方を変える', function() {
    var d = 'E:\\01_Loop\\persona-data\\junior';
    expect(pf.noticeText(d, d)).toBe('junior を見ています (自分の保存先)');
  });

  test('区切りと末尾のスラッシュが違っても同じフォルダと分かる', function() {
    expect(pf.samePath('E:\\a\\junior', 'E:/a/junior/')).toBe(true);
    expect(pf.samePath('E:/a/junior', 'E:/a/primary')).toBe(false);
  });

  test('baseName はフォルダ名だけを返す', function() {
    expect(pf.baseName('E:\\01_Loop\\persona-data\\primary')).toBe('primary');
    expect(pf.baseName('./autosave/')).toBe('autosave');
  });
});

describe('peekFolder.step', function() {
  var names = ['a', 'b', 'c'];
  test('次と前へ 1 枚ずつ動く', function() {
    expect(pf.step(names, 'a', 1)).toBe('b');
    expect(pf.step(names, 'b', -1)).toBe('a');
  });
  test('端では反対側へ回る (行き止まりで押し直さない)', function() {
    expect(pf.step(names, 'c', 1)).toBe('a');
    expect(pf.step(names, 'a', -1)).toBe('c');
  });
  test('選んでいない・空なら先頭か null', function() {
    expect(pf.step(names, null, 1)).toBe('a');
    expect(pf.step([], 'a', 1)).toBe(null);
    expect(pf.step(null, 'a', 1)).toBe(null);
  });
});
