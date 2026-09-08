'use strict';
// BLK-reviewer-20260908-0923-wish: reviewer は tick 開始時点の状態を読んでいる
// つもりでも、同じ tick の中で primary が保存フォルダに書き込み続けている。
// 「今読んでいる版が読み始めた瞬間のものか」を、更新時刻だけで見分ける。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/write-activity.js')]; } catch (e) {}
require('../src/core/write-activity.js');

const assert = require('assert');
const WA = () => window.MA.writeActivity;

const NOW = '2026-09-08T10:00:00Z';
function ago(sec) {
  return new Date(Date.parse(NOW) - sec * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
}
function e(name, puml, svg) {
  return { name: name, mtime: puml, svgMtime: svg === undefined ? null : svg };
}

describe('1 枚が書き込み中かどうか', function() {
  test('直近 5 分以内の更新は active', function() {
    assert.strictEqual(WA().statusOf(e('gpio', ago(30)), NOW), 'active');
  });

  test('窓の外の更新は settled', function() {
    assert.strictEqual(WA().statusOf(e('gpio', ago(20 * 60)), NOW), 'settled');
  });

  test('境界ちょうど (5 分前) は active に倒す', function() {
    assert.strictEqual(WA().statusOf(e('gpio', ago(300)), NOW), 'active');
    assert.strictEqual(WA().statusOf(e('gpio', ago(301)), NOW), 'settled');
  });

  test('窓は呼び出し側で変えられる', function() {
    assert.strictEqual(WA().statusOf(e('gpio', ago(600)), NOW, 20), 'active');
  });

  test('puml が古くても svg が新しければ active (SVG だけ書き出し中も書き込み中)', function() {
    assert.strictEqual(WA().statusOf(e('gpio', ago(3600), ago(10)), NOW), 'active');
  });

  test('未来の時刻は時計のずれか書き込み中。settled と言わない', function() {
    assert.strictEqual(WA().statusOf(e('gpio', '2026-09-08T10:05:00Z'), NOW), 'active');
  });

  test('時刻が取れなければ unknown (settled と混ぜない)', function() {
    assert.strictEqual(WA().statusOf(e('gpio', null), NOW), 'unknown');
  });

  test('now を返さない古い server では判定しない', function() {
    assert.strictEqual(WA().statusOf(e('gpio', ago(30)), null), 'unknown');
  });
});

describe('一覧ぶんの判定', function() {
  const entries = [
    e('timer_state', ago(20)),        // primary が今まさに書いた
    e('gpio_state', ago(120)),        // 2 分前
    e('adc_seq', ago(3600)),          // 1 時間前
    e('uart_class', null),            // 時刻が取れない
  ];

  test('更新中の図を新しい順に名指しする', function() {
    const s = WA().scan(entries, NOW);
    assert.deepStrictEqual(s.activeNames, ['timer_state', 'gpio_state']);
    assert.strictEqual(s.counts.active, 2);
    assert.strictEqual(s.counts.settled, 1);
    assert.strictEqual(s.counts.unknown, 1);
  });

  test('今すぐ読んでよい図に unknown は入れない', function() {
    assert.deepStrictEqual(WA().settledNames(WA().scan(entries, NOW)), ['adc_seq']);
  });

  test('要約は窓の長さと内訳を言う', function() {
    const t = WA().summary(WA().scan(entries, NOW));
    assert.ok(t.indexOf('5 分') >= 0, t);
    assert.ok(t.indexOf('更新中の可能性 2 枚') >= 0, t);
    assert.ok(t.indexOf('時刻不明 1 枚') >= 0, t);
  });

  test('全部落ち着いていればその旨を言う (無言にしない)', function() {
    const t = WA().summary(WA().scan([e('adc_seq', ago(3600))], NOW));
    assert.ok(t.indexOf('更新された図はありません') >= 0, t);
  });

  test('名前の無い行は一覧に混ぜない', function() {
    assert.strictEqual(WA().scan([{ mtime: ago(10) }, e('gpio', ago(10))], NOW).rows.length, 1);
  });

  test('図が 0 枚なら要約は空 (印を出す相手がいない)', function() {
    assert.strictEqual(WA().summary(WA().scan([], NOW)), '');
  });
});

describe('経過時間の言い方', function() {
  test('分の手前は秒で言う (30 秒前と 5 分前で判断が変わる)', function() {
    assert.strictEqual(WA().ageText(30 * 1000), '30 秒前');
  });
  test('分', function() { assert.strictEqual(WA().ageText(4 * 60 * 1000), '4 分前'); });
  test('時間', function() { assert.strictEqual(WA().ageText(2 * 3600 * 1000), '2 時間前'); });
  test('取れなければ空', function() { assert.strictEqual(WA().ageText(null), ''); });
});
