'use strict';
// BLK-junior-20260916-0526: 親状態に子状態を足す入口は右パネルに出ているのに
// 見つけられなかった。置き場所ではなく言葉の問題で、研修で PlantUML を見た程度の
// 人は「子状態」「複合状態」を知らない。知らない語は目に入っても自分のやりたいこと
// (状態の中に状態を入れる) と結びつかず、コマンド検索に打つ語も当てられない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var AKV = require('../src/core/add-kind-vocab.js');

// コマンド検索と同じ当て方 (部分一致) で、その語がその種別に届くか。
function reaches(word, diagramType, value) {
  var fields = ['子状態 (状態の中に入れる)', 'add', 'ついか', value]
    .concat(AKV.words(diagramType, value));
  var q = String(word).toLowerCase();
  for (var i = 0; i < fields.length; i++) {
    if (String(fields[i]).toLowerCase().indexOf(q) >= 0) return true;
  }
  return false;
}

describe('add-kind-vocab: 用語を知らない人の言葉から、足す種別へ届かせる', function() {

  test('起票者が打った・打ちそうな言葉が、どれも子状態に届く', function() {
    ['入れ子', 'いれこ', 'ネスト', '階層', '中に入れる', 'サブ状態', '内側']
      .forEach(function(w) {
        expect(reaches(w, 'plantuml-state', 'child')).toBe(true);
      });
  });

  test('用語を知っている人の語 (子状態・複合・composite) も従来どおり届く', function() {
    ['子状態', '複合', 'composite', 'child'].forEach(function(w) {
      expect(reaches(w, 'plantuml-state', 'child')).toBe(true);
    });
  });

  test('複合状態にも同じ言葉から届く (どちらを選んでも入れ子にたどり着く)', function() {
    ['入れ子', 'ネスト', 'まとめる'].forEach(function(w) {
      expect(reaches(w, 'plantuml-state', 'composite')).toBe(true);
    });
  });

  test('関係の無い種別に、入れ子の言葉を紛れ込ませない', function() {
    expect(AKV.words('plantuml-state', 'note').indexOf('入れ子')).toBe(-1);
    expect(AKV.words('plantuml-state', 'state').indexOf('入れ子')).toBe(-1);
  });

  test('知らない図種・種別では空を返す (呼ぶ側は concat するだけでよい)', function() {
    expect(AKV.words('plantuml-nope', 'child')).toEqual([]);
    expect(AKV.words('plantuml-state', 'nope')).toEqual([]);
    expect(AKV.words(null, null)).toEqual([]);
  });

  test('返す配列を書き換えても、次に呼んだ語が減らない', function() {
    var a = AKV.words('plantuml-state', 'child');
    var n = a.length;
    a.push('よけいな語');
    expect(AKV.words('plantuml-state', 'child').length).toBe(n);
  });

  test('用語抜きの 1 行を持つ (押す前に何が起きるかが読める)', function() {
    expect(AKV.hintFor('plantuml-state', 'child')).toContain('中に');
    expect(AKV.hintFor('plantuml-state', 'composite')).toContain('入れ子');
    expect(AKV.hintFor('plantuml-state', 'note')).toBe('');
  });
});
