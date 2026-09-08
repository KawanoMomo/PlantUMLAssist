'use strict';
// BLK-primary-20260908-1703: 保存フォルダの「対象 set」と一覧の突合。
// 手順 1 (対象 14 枚が揃っているか) を目で数えずに済ませるのが目的なので、
// 数だけでなく「足りない図の名前」まで見出しの文言に出ることを固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/target-set.js')]; } catch (e) {}
require('../src/core/target-set.js');
var TS = global.window.MA.targetSet;

function fakeStore() {
  var data = {};
  return {
    data: data,
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function(k, v) { data[k] = String(v); },
    removeItem: function(k) { delete data[k]; },
  };
}

// 台本の対象 14 枚 (13 枚 + ADC 状態遷移)。
var SET14 = [];
for (var i = 1; i <= 13; i++) SET14.push('doc' + i + '.puml');
SET14.push('adc_state.puml');

function entries(names) {
  return names.map(function(n) { return { name: n, mtime: 1 }; });
}

describe('target-set: 突合', function() {
  test('14 枚揃っていれば 14/14 と言い切る', function() {
    var rec = TS.reconcile(SET14, entries(SET14));
    assert.strictEqual(rec.expected, 14);
    assert.strictEqual(rec.present, 14);
    assert.strictEqual(rec.complete, true);
    assert.deepStrictEqual(rec.missing, []);
    assert.strictEqual(TS.summary(rec), '対象set: 14/14 揃っています');
    assert.strictEqual(TS.summaryClass(rec), 'target-set-ok');
  });

  test('1 枚欠けたら 13/14 と欠けた名前を出す', function() {
    var here = SET14.filter(function(n) { return n !== 'adc_state.puml'; });
    var rec = TS.reconcile(SET14, entries(here));
    assert.strictEqual(rec.present, 13);
    assert.strictEqual(rec.complete, false);
    assert.deepStrictEqual(rec.missing, ['adc_state.puml']);
    assert.strictEqual(TS.summary(rec), '対象set: 13/14 — 足りない: adc_state.puml');
    assert.strictEqual(TS.summaryClass(rec), 'target-set-short');
  });

  test('欠けが複数なら全部の名前を並べる', function() {
    var here = SET14.filter(function(n) { return n !== 'doc2.puml' && n !== 'adc_state.puml'; });
    var rec = TS.reconcile(SET14, entries(here));
    assert.strictEqual(TS.summary(rec), '対象set: 12/14 — 足りない: doc2.puml、adc_state.puml');
  });

  test('対象外の図が混ざっても期待枚数は増えない', function() {
    var rec = TS.reconcile(SET14, entries(SET14.concat(['scratch.puml', 'tmp.puml'])));
    assert.strictEqual(rec.expected, 14);
    assert.strictEqual(rec.present, 14);
    assert.deepStrictEqual(rec.extra, ['scratch.puml', 'tmp.puml']);
    assert.strictEqual(TS.summary(rec), '対象set: 14/14 揃っています（対象外 2 枚）');
  });

  test('未登録のときは黙らず、登録の入口を案内する', function() {
    var rec = TS.reconcile([], entries(SET14));
    assert.strictEqual(rec.configured, false);
    assert.strictEqual(rec.complete, false);
    assert.strictEqual(TS.summary(rec), '対象set: 未登録（この一覧を対象setにすると過不足が出ます）');
    assert.strictEqual(TS.summaryClass(rec), 'target-set-none');
  });

  test('文字列の一覧でも {name} の一覧でも同じ答えになる', function() {
    var a = TS.reconcile(SET14, SET14);
    var b = TS.reconcile(SET14, entries(SET14));
    assert.deepStrictEqual(a.missing, b.missing);
    assert.strictEqual(a.present, b.present);
  });
});

describe('target-set: 印の出し入れ', function() {
  test('重複と空文字を落として登録の並びを保つ', function() {
    assert.deepStrictEqual(TS.normalize(['a', '', 'b', 'a', null]), ['a', 'b']);
  });

  test('toggle で 1 枚だけ足せる / 外せる', function() {
    var v = TS.toggle(['a', 'b'], 'c');
    assert.deepStrictEqual(v, ['a', 'b', 'c']);
    assert.deepStrictEqual(TS.toggle(v, 'a'), ['b', 'c']);
    assert.strictEqual(TS.has(v, 'c'), true);
    assert.strictEqual(TS.has(v, 'z'), false);
  });

  test('行のボタンは今の状態と押した結果を言い分ける', function() {
    assert.strictEqual(TS.rowLabel(true), '対象');
    assert.strictEqual(TS.rowLabel(false), '対象にする');
    assert.notStrictEqual(TS.rowTitle(true), TS.rowTitle(false));
  });

  test('登録済みかで見出しのボタン文言が変わる', function() {
    var none = TS.reconcile([], entries(SET14));
    var some = TS.reconcile(SET14, entries(SET14));
    assert.strictEqual(TS.buttonLabel(none), '今の一覧を対象setにする');
    assert.strictEqual(TS.buttonLabel(some), '対象setを今の一覧で取り直す');
    assert.ok(TS.buttonTitle(some).indexOf('14 枚') >= 0);
  });
});

describe('target-set: 保存', function() {
  test('フォルダごとに別の対象 set を持つ', function() {
    var st = fakeStore();
    TS.save(st, './a', ['x.puml']);
    TS.save(st, './b', ['y.puml', 'z.puml']);
    assert.deepStrictEqual(TS.load(st, './a'), ['x.puml']);
    assert.deepStrictEqual(TS.load(st, './b'), ['y.puml', 'z.puml']);
    assert.notStrictEqual(TS.storageKey('./a'), TS.storageKey('./b'));
  });

  test('保存先が空なら既定の autosave として扱う', function() {
    assert.strictEqual(TS.storageKey(''), TS.storageKey('./autosave'));
  });

  test('壊れた控えは未登録として読む', function() {
    var st = fakeStore();
    st.setItem(TS.storageKey('./a'), '{');
    assert.deepStrictEqual(TS.load(st, './a'), []);
    st.setItem(TS.storageKey('./a'), '"x"');
    assert.deepStrictEqual(TS.load(st, './a'), []);
  });

  test('clear で外れる', function() {
    var st = fakeStore();
    TS.save(st, './a', SET14);
    assert.strictEqual(TS.load(st, './a').length, 14);
    TS.clear(st, './a');
    assert.deepStrictEqual(TS.load(st, './a'), []);
  });

  test('storage が無くても落ちない', function() {
    assert.deepStrictEqual(TS.load(null, './a'), []);
    assert.strictEqual(TS.save(null, './a', ['x']), false);
    assert.strictEqual(TS.clear(null, './a'), false);
  });

  test('消えた図の名前は対象 set から落とさない', function() {
    var st = fakeStore();
    TS.save(st, './a', SET14);
    // 一覧から 1 枚消えても、期待値は 14 のまま残る (落とすと欠品が言えなくなる)
    var rec = TS.reconcile(TS.load(st, './a'), entries(SET14.slice(0, 13)));
    assert.strictEqual(rec.expected, 14);
    assert.deepStrictEqual(rec.missing, ['adc_state.puml']);
  });
});
