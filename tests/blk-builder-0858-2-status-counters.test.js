'use strict';
// BLK-builder-20260908-0858-2 (design 7a / 7b): 件数を持つものを下端のステータスに寄せる。
//
// 差分・指摘・指摘箱の件数はタブ列のボタン文字の末尾にしか出ていない。ツールを畳むと
// 件数が画面から消えるので、状態表示として下端に置き、押せば従来のパネルが開く。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var SC = W.MA.statusCounters;

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('下端に寄せる件数', function() {
  test('design の並び (± 差分 / 指摘 / 指摘箱) で 3 つ持つ', function() {
    expect(SC.items().map(function(it) { return it.prefix; })).toEqual(['± 差分', '指摘', '指摘箱']);
  });

  test('出どころのタブ列ボタンと下端のボタンがどちらも実在する', function() {
    SC.items().forEach(function(it) {
      expect(html.indexOf('id="' + it.src + '"')).toBeGreaterThan(0);
      expect(html.indexOf('id="' + it.id + '"')).toBeGreaterThan(0);
    });
  });
});

describe('件数の読み取り', function() {
  test('ボタン文字の末尾から数を取る', function() {
    expect(SC.countToken('📌 指摘 3')).toBe('3');
    expect(SC.countToken('± 差分 12')).toBe('12');
    expect(SC.countToken('📥 指摘箱 0')).toBe('0');
  });

  test('まだ数えていない印 (−) はそのまま', function() {
    expect(SC.countToken('± 差分 −')).toBe('−');
    expect(SC.countToken('± 差分 -')).toBe('−');
  });

  test('数も印も無ければ − に落とす', function() {
    expect(SC.countToken('± 差分')).toBe('−');
    expect(SC.countToken('')).toBe('−');
    expect(SC.countToken(null)).toBe('−');
  });
});

describe('下端の表示', function() {
  test('見出しと件数を並べる', function() {
    expect(SC.statusText('指摘', '📌 指摘 3')).toBe('指摘 3');
    expect(SC.statusText('± 差分', '± 差分 −')).toBe('± 差分 −');
  });

  test('件数があるときだけ色を付ける (0 件・未計算では付けない)', function() {
    expect(SC.isActive('📌 指摘 3')).toBe(true);
    expect(SC.isActive('📌 指摘 0')).toBe(false);
    expect(SC.isActive('📌 指摘 −')).toBe(false);
  });
});
