'use strict';
// BLK-junior-20260914-1106-wish: 同じ図種の枠に「〜アクティビティ図」と
// 「〜アクティビティ図(資料用)」が並ぶと、今回の対象はボタンの文字を読み比べる
// しかなかった。指摘文が「資料用」と書いているなら、その 1 枚を機械が決める。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/component-pack.js', '../src/core/finding-variant.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var FV = global.window.MA.findingVariant;

var NAMES = [
  'GPIOドライバ初期化アクティビティ図',
  'GPIOドライバ初期化アクティビティ図(資料用)',
  'GPIOドライバ状態遷移図',
  'GPIOドライバ初期化シーケンス図',
];

describe('finding-variant — 版の読み取り', function() {
  test('括弧の無い名前は本番用', function() {
    expect(FV.variantOf('GPIOドライバ状態遷移図')).toBe('production');
  });

  test('(資料用) は資料用', function() {
    expect(FV.variantOf('GPIOドライバ初期化アクティビティ図(資料用)')).toBe('material');
    expect(FV.label('material')).toBe('資料用');
  });

  test('全角括弧・編集中・旧版も読む', function() {
    expect(FV.variantOf('gpio_state（編集中）')).toBe('editing');
    expect(FV.variantOf('gpio_state(旧版)')).toBe('old');
  });

  test('知らない括弧は版として分類しない (本番用に混ぜない)', function() {
    expect(FV.variantOf('gpio_state(先輩反映)')).toBe('');
  });

  test('stem は版の括弧を落とし、版どうしを同じ鍵にする', function() {
    expect(FV.stemOf('GPIOドライバ初期化アクティビティ図(資料用)'))
      .toBe(FV.stemOf('GPIOドライバ初期化アクティビティ図'));
    expect(FV.stemOf('GPIOドライバ状態遷移図') === FV.stemOf('GPIOドライバ初期化アクティビティ図')).toBe(false);
  });

  test('本番用 (無印) には印を出さない。版のある名前だけ印が付く', function() {
    expect(FV.badge('GPIOドライバ状態遷移図')).toBeNull();
    expect(FV.badge('GPIOドライバ初期化アクティビティ図(資料用)').mark).toBe('資');
    expect(FV.badge('GPIOドライバ初期化アクティビティ図(資料用)').label).toBe('資料用');
  });
});

describe('finding-variant — 指摘文の読み取り', function() {
  test('「資料用の方」と書いてあれば資料用', function() {
    expect(FV.wantedVariant('対象は資料用の方です')).toBe('material');
  });

  test('版を書いていない指摘は空 (勝手に版を決めない)', function() {
    expect(FV.wantedVariant('部品名が Gpio のままです')).toBe('');
  });

  test('「資料に貼る」だけでは資料用と読まない', function() {
    expect(FV.wantedVariant('設計書の資料に貼る図の話です')).toBe('');
  });

  test('2 つの版に触れる指摘は、先に書かれた方を対象にする', function() {
    expect(FV.wantedVariant('資料用が本番用と食い違っています')).toBe('material');
    expect(FV.wantedVariant('本番用が資料用と食い違っています')).toBe('production');
  });

  test('図種は「アクティビティ」でも「アクティビティ図」でも読む', function() {
    expect(FV.wantedKind('アクティビティ図の分岐が足りません')).toBe('アクティビティ図');
    expect(FV.wantedKind('状態遷移のラベルが揃っていません')).toBe('状態遷移図');
    expect(FV.wantedKind('部品名が違います')).toBe('');
  });
});

describe('finding-variant — 版ぞろい', function() {
  test('同じ図の版を集め、本番用を先に並べる', function() {
    expect(FV.familyOf(NAMES, 'GPIOドライバ初期化アクティビティ図(資料用)')).toEqual([
      'GPIOドライバ初期化アクティビティ図',
      'GPIOドライバ初期化アクティビティ図(資料用)',
    ]);
  });

  test('別の図種は同じ版ぞろいに入らない', function() {
    expect(FV.familyOf(NAMES, 'GPIOドライバ状態遷移図')).toEqual(['GPIOドライバ状態遷移図']);
  });
});

describe('finding-variant — 対象の 1 枚', function() {
  test('指摘が資料用と書いていれば、資料用の版を選ぶ', function() {
    var p = FV.choose({
      bases: ['GPIOドライバ初期化アクティビティ図'],
      names: NAMES,
      text: 'アクティビティ図(資料用)の分岐が本番用と食い違っています。対象は資料用です',
    });
    expect(p.name).toBe('GPIOドライバ初期化アクティビティ図(資料用)');
    expect(p.variant).toBe('material');
    expect(p.kind).toBe('アクティビティ図');
    expect(p.byText).toBe(true);
  });

  test('版を書いていない指摘は本番用 (無印) を選ぶ', function() {
    var p = FV.choose({
      bases: ['GPIOドライバ初期化アクティビティ図'],
      names: NAMES,
      text: '部品名が Gpio のままです',
    });
    expect(p.name).toBe('GPIOドライバ初期化アクティビティ図');
    expect(p.byText).toBe(false);
    expect(p.family.length).toBe(2);
  });

  test('指摘が名指しした版がフォルダに無ければ本番用に落とす', function() {
    var p = FV.choose({
      bases: ['GPIOドライバ状態遷移図'],
      names: NAMES,
      text: '旧版と比べてください',
    });
    expect(p.name).toBe('GPIOドライバ状態遷移図');
    expect(p.byText).toBe(false);
  });

  test('図名が複数挙がっていれば、指摘文の図種に合う方を選ぶ', function() {
    var p = FV.choose({
      bases: ['GPIOドライバ初期化シーケンス図', 'GPIOドライバ状態遷移図'],
      names: NAMES,
      text: '状態遷移図の遷移ラベルがシーケンス図のメッセージ名と揃っていません',
    });
    expect(p.name).toBe('GPIOドライバ状態遷移図');
  });

  test('図名が書かれていない指摘は対象なし', function() {
    var p = FV.choose({ bases: [], names: NAMES, text: '全体的に粒度が粗いです' });
    expect(p.name).toBe('');
    expect(FV.targetText(p)).toBe('対象: 指摘に図の名前が書かれていません');
  });
});

describe('finding-variant — 画面に出す 1 行', function() {
  test('図種・版・図名を言い切る', function() {
    var t = FV.targetText(FV.choose({
      bases: ['GPIOドライバ初期化アクティビティ図'], names: NAMES, text: '対象は資料用です',
    }));
    expect(t.indexOf('アクティビティ図') >= 0).toBe(true);
    expect(t.indexOf('資料用') >= 0).toBe(true);
    expect(t.indexOf('GPIOドライバ初期化アクティビティ図(資料用)') >= 0).toBe(true);
  });

  test('版が複数あるのに指摘が版を書いていないときだけ、ほかの版を知らせる', function() {
    var vague = FV.choose({
      bases: ['GPIOドライバ初期化アクティビティ図'], names: NAMES, text: '部品名が違います',
    });
    expect(FV.ambiguousText(vague).indexOf('(資料用)') >= 0).toBe(true);
    var only = FV.choose({
      bases: ['GPIOドライバ状態遷移図'], names: NAMES, text: '部品名が違います',
    });
    expect(FV.ambiguousText(only)).toBe('');
  });
});
