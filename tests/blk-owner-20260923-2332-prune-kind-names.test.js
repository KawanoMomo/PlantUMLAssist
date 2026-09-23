'use strict';
// BLK-owner-20260923-2332-prune: 右ペイン「追加」の種別チップの名前を 6 図種で日本語にそろえ、
// 同じものは同じ名前にする (注釈 / 関係 / 境界 / まとめて)。チップの文字は各図種の
// 「種類」select の option から読むので、option の文言を図種ごとに確かめる。
var fs = require('fs');
var path = require('path');

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/tail-kind-chips.js')]; } catch (e) {}
require('../src/core/tail-kind-chips.js');
var chips = global.window.MA.tailKindChips;

// selectFieldHtml('種類', '{prefix}-tail-kind', [ ... ]) の中の { value, label } を読む。
function tailKinds(file, prefix) {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', file), 'utf8');
  var at = src.indexOf("'" + prefix + "-tail-kind', [");
  if (at < 0) throw new Error('no tail-kind in ' + file);
  // 閉じは行頭の `])` (ラベルの中の `[*] / [H])` で切らない)。
  var close = /\n\s*\]\)/g;
  close.lastIndex = at;
  var cm = close.exec(src);
  var body = src.slice(at, cm ? cm.index : src.length);
  var re = /value:\s*'([^']*)',\s*label:\s*'([^']*)'/g;
  var out = {};
  var m;
  while ((m = re.exec(body))) out[m[1]] = chips.shortLabel(m[2]);
  return out;
}

var ALL = [
  ['sequence.js', 'seq'], ['class.js', 'cl'], ['component.js', 'co'],
  ['usecase.js', 'uc'], ['state.js', 'st'], ['activity.js', 'ac'],
];

describe('種別チップの名前 (BLK-owner-20260923-2332-prune)', () => {
  test('同じものは 6 図種で同じ名前: 注釈 / 関係 / 境界 / まとめて', () => {
    ALL.forEach(function(f) {
      var k = tailKinds(f[0], f[1]);
      if (k.note) expect(k.note).toBe('注釈');
      if (k.relation) expect(k.relation).toBe('関係');
      if (k.package) expect(k.package).toBe('境界');
      if (k.bulk) expect(k.bulk).toBe('まとめて');
    });
  });

  test('チップの文字に英語だけの名前が残っていない (記法名は括弧の添え字)', () => {
    ALL.forEach(function(f) {
      var k = tailKinds(f[0], f[1]);
      Object.keys(k).forEach(function(v) {
        expect(/^[A-Za-z][A-Za-z ]*$/.test(k[v])).toBe(false);
      });
    });
  });

  test('図種ごとの読み: 状態遷移図とアクティビティ図とクラス図', () => {
    var st = tailKinds('state.js', 'st');
    expect(st.state).toBe('状態');
    expect(st.composite).toBe('複合状態');
    expect(st.transition).toBe('遷移');
    var ac = tailKinds('activity.js', 'ac');
    expect(ac.if).toBe('条件分岐');
    expect(ac.action).toBe('アクション');
    var cl = tailKinds('class.js', 'cl');
    expect(cl.class).toBe('クラス');
    expect(cl.abstract).toBe('抽象クラス');
  });
});
