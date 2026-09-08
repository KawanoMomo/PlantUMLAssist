'use strict';
// BLK-junior-20260908-2003-wish: 部品を選ぶと図種ごとの「あり / なし」が出る棚卸し。
// 手順 1 で「無い」に気付くのではなく、周の頭で欠けが分かることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/component-pack.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/component-inventory.js')]; } catch (e) {}
require('../src/core/component-pack.js');
require('../src/core/component-inventory.js');
var CI = global.window.MA.componentInventory;

// junior の保存フォルダの実際の並び。状態遷移図が無いのが今回の詰まり。
var FILES = [
  'GPIOドライバコンポーネント構成.puml',
  'GPIOドライバユースケース.puml',
  'GPIOドライバ初期化アクティビティ.puml',
  'GPIOドライバ初期化シーケンス.puml',
  'GPIOドライバ派生クラス.puml',
  'CANドライバユースケース.puml',
  'diagram1.puml',
];

describe('componentInventory.build', function() {
  test('部品ごとに 8 図種の行が揃い、無い図種が missing に出る', function() {
    var recs = CI.build(FILES);
    var gpio = CI.pick(recs, 'GPIOドライバ');
    expect(!!gpio).toBe(true);
    expect(gpio.rows.length).toBe(8);
    expect(gpio.missing.indexOf('状態遷移図') >= 0).toBe(true);
    expect(gpio.missing.indexOf('シーケンス図') >= 0).toBe(false);
    expect(gpio.have).toBe(5);
  });

  test('あった図種にはファイル名が付く', function() {
    var gpio = CI.pick(CI.build(FILES), 'GPIOドライバ');
    var seq = gpio.rows.filter(function(r) { return r.kind === 'シーケンス図'; })[0];
    expect(seq.present).toBe(true);
    expect(seq.files).toEqual(['GPIOドライバ初期化シーケンス.puml']);
    var st = gpio.rows.filter(function(r) { return r.kind === '状態遷移図'; })[0];
    expect(st.present).toBe(false);
    expect(st.files).toEqual([]);
  });

  test('図種の語が名前に無い図は「なし」に数えず unknown に分ける', function() {
    var recs = CI.build(['diagram1.puml']);
    var rec = recs[0];
    expect(rec.unknown).toEqual(['diagram1.puml']);
    expect(rec.have).toBe(0);
    expect(rec.missing.length).toBe(8);
  });

  test('同じ図種が 2 枚あってもその図種は「あり」1 行にまとまる', function() {
    var rec = CI.buildOne('GPIO', ['GPIO状態遷移.puml', 'GPIO状態遷移(先輩反映).puml']);
    var st = rec.rows.filter(function(r) { return r.kind === '状態遷移図'; })[0];
    expect(st.present).toBe(true);
    expect(st.files.length).toBe(2);
    expect(rec.have).toBe(1);
  });
});

describe('componentInventory.pickFor', function() {
  test('開いている図の名前からその部品の棚卸しが選ばれる', function() {
    var recs = CI.build(FILES);
    var rec = CI.pickFor(recs, 'GPIOドライバ初期化シーケンス.puml');
    expect(rec && rec.component).toBe('GPIOドライバ');
  });

  test('拡張子が付いていなくても同じ部品に当たる', function() {
    var recs = CI.build(FILES);
    var rec = CI.pickFor(recs, 'GPIOドライバユースケース');
    expect(rec && rec.component).toBe('GPIOドライバ');
  });

  test('当たらなければ null（別の部品を勝手に選ばない）', function() {
    expect(CI.pickFor(CI.build(FILES), 'UARTドライバ状態遷移.puml')).toBe(null);
  });
});

describe('componentInventory.summary', function() {
  test('欠けている図種を名指しする', function() {
    var rec = CI.pick(CI.build(FILES), 'GPIOドライバ');
    var s = CI.summary(rec);
    expect(s.indexOf('GPIOドライバ') >= 0).toBe(true);
    expect(s.indexOf('8 図種中 5 種あり') >= 0).toBe(true);
    expect(s.indexOf('状態遷移図') >= 0).toBe(true);
    expect(CI.summaryClass(rec)).toBe('inv-short');
  });

  test('全部あれば欠け無しと言い切る', function() {
    var full = CI.kinds().map(function(k) { return 'X' + k.replace('図', '') + '.puml'; });
    var rec = CI.buildOne('X', full);
    expect(rec.missing).toEqual([]);
    expect(CI.summary(rec).indexOf('欠けはありません') >= 0).toBe(true);
    expect(CI.summaryClass(rec)).toBe('inv-ok');
  });

  test('部品が無いときも黙らない', function() {
    expect(CI.summary(null).indexOf('部品を選ぶ') >= 0).toBe(true);
  });
});

describe('componentInventory.text', function() {
  test('図種と有無とファイル名の表になる', function() {
    var rec = CI.pick(CI.build(FILES), 'GPIOドライバ');
    var t = CI.text(rec);
    expect(t.indexOf('| 状態遷移図 | なし | — |') >= 0).toBe(true);
    expect(t.indexOf('| シーケンス図 | あり | GPIOドライバ初期化シーケンス.puml |') >= 0).toBe(true);
  });
});
