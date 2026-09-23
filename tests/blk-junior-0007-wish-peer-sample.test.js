'use strict';
// BLK-junior-20260915-0007-wish: 先輩が持たない図種では、自分の他部品で作り終えた
// 同じ図種を「見本」として横に出す。手順 1 が「先輩を見る → いなければ自分の
// 他部品の完成形を見る」に変わることを、選び方の側で固定する。
const assert = require('assert');
const PS = require('../src/core/peer-sample');

// junior の保存フォルダの並び (persona-data/junior と同じ形)。
const OWN = [
  'GPIOドライバ初期化アクティビティ図.puml',
  'GPIOドライバ初期化アクティビティ図(資料用).puml',
  'GPIOドライバ状態遷移.puml',
  'GPIOドライバ状態遷移(資料用)-編集中.puml',
  'CANドライバ初期化アクティビティ図.puml',
  'UARTドライバ初期化アクティビティ図.puml',
  'TIMERドライバ初期化アクティビティ図.puml',
  'TIMERドライバ初期化シーケンス.puml',
  'TimerDrv派生クラス図.puml',
  'diagram1_sequence-12.puml',
];

function pick(mine, names) {
  return PS.pickSample({ name: mine, dir: './junior' },
    names === undefined ? OWN : names, './junior');
}

describe('先輩が持たない図種の見本選び', function() {
  test('自分の他部品で作った同じ図種を見本にする', function() {
    const p = pick('TIMERドライバ初期化アクティビティ図.puml');
    assert.strictEqual(p.how, 'peer-sample');
    assert.strictEqual(p.kind, 'activity');
    // 部品ごとに 1 枚。CAN / GPIO / UART の 3 部品が候補に並ぶ。
    assert.deepStrictEqual(p.candidates.map(PS.partOf).sort(), ['can', 'gpio', 'uart']);
  });

  test('いま開いている図と同じ部品の図は見本にしない', function() {
    const p = pick('TIMERドライバ初期化アクティビティ図.puml');
    p.candidates.forEach(function(n) {
      assert.notStrictEqual(PS.partOf(n), 'timer');
    });
  });

  test('図種が違う図は見本にしない', function() {
    const p = pick('TIMERドライバ初期化アクティビティ図.puml');
    p.candidates.forEach(function(n) {
      assert.strictEqual(PS.kindOf(n), 'activity');
    });
  });

  test('資料用・編集中・連番の控えは見本にしない (同じ図が 2 枚並ぶだけになる)', function() {
    assert.strictEqual(PS.isDerived('GPIOドライバ初期化アクティビティ図(資料用).puml'), true);
    assert.strictEqual(PS.isDerived('GPIOドライバ状態遷移(資料用)-編集中.puml'), true);
    assert.strictEqual(PS.isDerived('diagram1_sequence-12.puml'), true);
    assert.strictEqual(PS.isDerived('GPIOドライバ初期化アクティビティ図.puml'), false);
    const p = pick('TIMERドライバ初期化アクティビティ図.puml');
    p.candidates.forEach(function(n) {
      assert.strictEqual(PS.isDerived(n), false);
    });
  });

  test('自分の他部品にも無ければ、黙って別の図を出さずに「無い」と返す', function() {
    const p = pick('TIMERドライバ利用ユースケース図.puml');
    assert.strictEqual(p.how, 'none');
    assert.strictEqual(p.name, '');
    assert.ok(p.reason.indexOf('同じ図種の図がありません') >= 0, p.reason);
  });

  test('図種の読めない名前では見本を選ばない (別図種を手本にしてしまう)', function() {
    const p = pick('diagram3.puml');
    assert.strictEqual(p.how, 'none');
    assert.strictEqual(p.name, '');
  });

  test('枠の 1 行は、先輩がいないことと横に出ている物の両方を言う', function() {
    const p = pick('TIMERドライバ初期化アクティビティ図.puml');
    const t = PS.noticeText(p, 'この図 (TIMERドライバ初期化アクティビティ図) に当たる相手の図はありません');
    assert.ok(t.indexOf('当たる相手の図はありません') >= 0, t);
    assert.ok(t.indexOf('見本') >= 0, t);
    assert.ok(t.indexOf('読むだけ') >= 0, t);
    assert.ok(t.indexOf(PS.baseOf(p.name)) >= 0, t);
  });

  test('下端は見本の名前を出し、見本が無ければ何も返さない', function() {
    const t = PS.statusText(pick('TIMERドライバ初期化アクティビティ図.puml'));
    assert.ok(t.label.indexOf('見本') >= 0, t.label);
    assert.strictEqual(t.count, 3);
    assert.strictEqual(PS.statusText(pick('TIMERドライバ利用ユースケース図.puml')), null);
  });

  test('読みに行く先は自分のフォルダ (先輩のフォルダから読むと空振りする)', function() {
    const p = pick('TIMERドライバ初期化アクティビティ図.puml');
    assert.strictEqual(p.dir, './junior');
  });
});
