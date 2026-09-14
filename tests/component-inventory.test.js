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

// BLK-junior-20260914-1106: 同じ図種に「本番用 / 資料用 / 編集中」が同居するように
// なると、行の見出しが「あり」だけではどれが今回の対象か分からず、ボタンの文字を
// 全部読み比べることになる。行の側が版を名指しすることを守る。
describe('componentInventory: 同じ図種に並ぶ版', function() {
  var FILES2 = [
    'GPIOドライバ初期化アクティビティ.puml',
    'GPIOドライバ初期化アクティビティ(資料用).puml',
    'GPIOドライバ初期化シーケンス.puml',
    'GPIOドライバ派生クラス(編集中).puml',
  ];
  var rec = CI.build(FILES2)[0];
  function rowOf(kind) {
    return rec.rows.filter(function(r) { return r.kind === kind; })[0];
  }

  test('版が 2 つ以上ある行は「あり」ではなく版を名指しする', function() {
    expect(CI.markText(rowOf('アクティビティ図'))).toBe('あり: 本番用 / 資料用');
  });

  test('版が 1 つだけの行は今までどおり「あり」のまま', function() {
    expect(CI.markText(rowOf('シーケンス図'))).toBe('あり');
    expect(CI.markText(rowOf('クラス図'))).toBe('あり');
  });

  test('無い図種は「なし」のまま（版の話に巻き込まない）', function() {
    expect(CI.markText(rowOf('状態遷移図'))).toBe('なし');
    expect(CI.markText(null)).toBe('なし');
  });

  test('但し書きの無いファイルの版は「本番用」', function() {
    expect(CI.variantLabel('GPIOドライバ初期化アクティビティ.puml')).toBe('本番用');
    expect(CI.variantLabel('GPIOドライバ初期化アクティビティ(資料用).puml')).toBe('資料用');
    expect(CI.variantLabel('GPIOドライバ派生クラス(編集中).puml')).toBe('編集中');
  });

  test('行は並んでいる版を並び順どおりに持つ', function() {
    expect(CI.variantsOf(rowOf('アクティビティ図'))).toEqual(['本番用', '資料用']);
    expect(CI.variantsOf(rowOf('シーケンス図'))).toEqual(['本番用']);
    expect(CI.variantsOf(null)).toEqual([]);
  });

  test('版が並ぶ行のボタンは版そのもの、1 枚だけの行はファイル名のまま', function() {
    var act = rowOf('アクティビティ図');
    expect(CI.fileLabel(act, 'GPIOドライバ初期化アクティビティ(資料用).puml')).toBe('資料用');
    expect(CI.fileLabel(act, 'GPIOドライバ初期化アクティビティ.puml')).toBe('本番用');
    var seq = rowOf('シーケンス図');
    expect(CI.fileLabel(seq, 'GPIOドライバ初期化シーケンス.puml')).toBe('GPIOドライバ初期化シーケンス.puml');
  });

  test('控える表にも版が出る（周の頭のメモで取り違えない）', function() {
    expect(CI.text(rec).indexOf('| アクティビティ図 | あり: 本番用 / 資料用 |') >= 0).toBe(true);
  });
});
