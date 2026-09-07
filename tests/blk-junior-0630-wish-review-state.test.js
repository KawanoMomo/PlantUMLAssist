'use strict';
// BLK-junior-20260908-0630-wish: 指摘に対応するたびに「元図(レビュー反映).puml」を
// 別名で保存していたので、📂 一覧に同じ題材が 2 枚並び、開くたびに名前を読み比べて
// いた。指摘は既に 1 枚の中で未対応 / 対応済みを持てるので、状態はバッジで出す。
const assert = require('assert');

const RS = () => window.MA.reviewState;

function entry(name, pins) { return { name: name, hash: 'h', mtime: null, pins: pins }; }

describe('図 1 枚の反映状態', function() {
  test('指摘が無ければ none (無印。バッジを出さない)', function() {
    const c = RS().counts(entry('gpio', { open: 0, read: 0, done: 0, total: 0 }));
    assert.strictEqual(c.kind, 'none');
    assert.strictEqual(RS().badgeText(c), '');
  });

  test('未対応が 1 件でも残っていれば未反映', function() {
    assert.strictEqual(RS().kindOf(entry('gpio', { open: 1, read: 0, done: 3, total: 4 })), 'pending');
  });

  test('「読んだだけ」も未反映に数える (直したことにしない)', function() {
    assert.strictEqual(RS().kindOf(entry('gpio', { open: 0, read: 2, done: 1, total: 3 })), 'pending');
  });

  test('全部 done なら反映済み', function() {
    assert.strictEqual(RS().kindOf(entry('gpio', { open: 0, read: 0, done: 3, total: 3 })), 'applied');
  });

  test('pins を返さない古い server は unknown (指摘なしと混ぜない)', function() {
    assert.strictEqual(RS().kindOf(entry('gpio', null)), 'unknown');
    assert.strictEqual(RS().kindOf('gpio'), 'unknown');
  });

  test('total が欠けていても内訳から数え直す', function() {
    const c = RS().counts(entry('gpio', { open: 1, read: 1, done: 2 }));
    assert.strictEqual(c.total, 4);
    assert.strictEqual(c.kind, 'pending');
  });

  test('壊れた値でも例外を投げず、負の件数を数えない', function() {
    const c = RS().counts(entry('gpio', { open: -3, read: 'x', done: null, total: 'y' }));
    assert.strictEqual(c.open, 0);
    assert.strictEqual(c.total, 0);
    assert.strictEqual(c.kind, 'none');
  });
});

describe('バッジの文言', function() {
  test('未反映は残り件数と全体を出す (開かずに残数が読める)', function() {
    const c = RS().counts(entry('gpio', { open: 1, read: 1, done: 3, total: 5 }));
    assert.strictEqual(RS().badgeText(c), '未反映 2/5');
    assert.ok(RS().badgeTitle(c).indexOf('5 件のうち 2 件が未対応') >= 0);
    assert.ok(RS().badgeTitle(c).indexOf('読んだだけ 1 件') >= 0);
  });

  test('反映済みは対応した件数を出す', function() {
    const c = RS().counts(entry('gpio', { open: 0, read: 0, done: 4, total: 4 }));
    assert.strictEqual(RS().badgeText(c), '反映済 4/4');
  });
});

describe('一覧まるごと', function() {
  const entries = [
    entry('GPIOドライバユースケース', { open: 2, read: 0, done: 1, total: 3 }),
    entry('GPIOドライバ派生クラス', { open: 0, read: 0, done: 2, total: 2 }),
    entry('CANドライバ状態遷移', { open: 0, read: 0, done: 0, total: 0 }),
  ];

  test('未反映 / 反映済みの図名を分けて取れる', function() {
    const map = RS().statusMap(entries);
    assert.deepStrictEqual(RS().pendingNames(map), ['GPIOドライバユースケース']);
    assert.deepStrictEqual(RS().appliedNames(map), ['GPIOドライバ派生クラス']);
  });

  test('頭の 1 行に枚数が出る', function() {
    assert.strictEqual(RS().summary(RS().statusMap(entries)), '指摘の反映状態: 未反映 1 枚 / 反映済み 1 枚');
  });

  test('指摘の付いた図が 1 枚も無くても黙らない', function() {
    const map = RS().statusMap([entry('a', { open: 0, read: 0, done: 0, total: 0 })]);
    assert.strictEqual(RS().summary(map), '指摘の反映状態: 指摘の付いた図はありません');
  });

  test('数えられなかっただけの一覧は、そう言う', function() {
    const map = RS().statusMap([entry('a', null), entry('b', null)]);
    assert.ok(RS().summary(map).indexOf('数えられませんでした') >= 0);
  });
});
