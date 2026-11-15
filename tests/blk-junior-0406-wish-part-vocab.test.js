'use strict';
// BLK-junior-20260915-0406-wish: 同じ部品 (SPI) の 6 図種に散らばっている名前を
// 1 冊の名前帳にまとめ、状態遷移図の遷移ラベル・シーケンスのメッセージ名を
// 候補から選べるようにする。ここで固定するのは名前帳そのものの約束:
//   - 部品名で図を選ぶ (他部品の図を巻き込まない)
//   - 役割 (メソッド / きっかけ / 状態 / 型) の見分けが methodAudit と同じ規則
//   - 表記揺れ (Spi_Init ⇔ SpiInit) は片方を消さず「揺れている」と言う
//   - どの図に出る名前かが 1 件ごとに言える (先輩の図を開かずに済む根拠)
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/name-pairing.js',
 '../src/core/dupe-merge.js', '../src/core/method-audit.js', '../src/core/part-reference.js',
 '../src/core/part-vocab.js', '../src/ui/properties.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var PV = global.window.MA.partVocab;
var P = global.window.MA.properties;

// 先輩 (primary) のシーケンス図。呼び出しと、括弧の無いきっかけが混ざる。
var SENIOR_SEQ = [
  '@startuml',
  'participant Dev',
  'participant Spi_Driver',
  'Dev -> Spi_Driver : Spi_Init()',
  'Dev -> Spi_Driver : Spi_Transmit(buf, len)',
  'Spi_Driver --> Dev : TransferComplete',
  '@enduml',
].join('\n');

// 自分 (junior) の状態遷移図。状態と遷移ラベル。
var MY_STATE = [
  '@startuml',
  'state Uninit',
  'state Idle',
  'state Busy',
  'state Error',
  '[*] --> Uninit',
  'Uninit --> Idle : Spi_Init',
  'Idle --> Busy : Spi_Transmit',
  'Busy --> Idle : TransferComplete',
  'Busy --> Error : Fault',
  'Error --> Uninit : Spi_Reset',
  '@enduml',
].join('\n');

var MY_CLASS = [
  '@startuml',
  'class Spi_Driver {',
  '  +Spi_Init()',
  '  +Spi_Transmit(buf, len)',
  '}',
  '@enduml',
].join('\n');

// 別部品。名前帳に混ざってはいけない。
var OTHER = [
  '@startuml',
  'state Idle',
  'Idle --> Busy : Uart_Send',
  '@enduml',
].join('\n');

var DOCS = [
  { name: 'spi_init_sequence.puml', kind: 'sequence', text: SENIOR_SEQ, folder: 'primary' },
  { name: 'spi_state.puml', kind: 'state', text: MY_STATE, folder: '' },
  { name: 'spi_class.puml', kind: 'class', text: MY_CLASS, folder: '' },
  { name: 'uart_state.puml', kind: 'state', text: OTHER, folder: '' },
];

function names(items) { return items.map(function(i) { return i.name; }); }

describe('名前帳 — 部品ごとに集める', function() {
  test('ファイル名から部品名を取る。図種だけの名前は部品名を名乗らない', function() {
    expect(PV.subjectOf('spi_state.puml')).toBe('spi');
    expect(PV.subjectOf('spi_init_sequence.puml')).toBe('spi');
    expect(PV.subjectOf('state.puml')).toBe('');
  });

  test('同じ部品名の図だけを読む (別部品の Uart_Send は入らない)', function() {
    var v = PV.collect('spi', DOCS);
    expect(v.docs.length).toBe(3);
    expect(names(v.items)).not.toContain('Uart_Send');
  });

  test('先輩のシーケンスにしか出ない名前も、自分の図を開かずに引ける', function() {
    var v = PV.collect('spi', DOCS);
    expect(names(v.byRole.method)).toContain('Spi_Init');
    expect(names(v.byRole.method)).toContain('Spi_Transmit');
  });

  test('接頭辞の無いきっかけはメソッドと分けて数える', function() {
    var v = PV.collect('spi', DOCS);
    expect(names(v.byRole.event)).toContain('TransferComplete');
    expect(names(v.byRole.event)).toContain('Fault');
    expect(names(v.byRole.method)).not.toContain('Fault');
  });

  test('状態遷移図の状態は状態として並ぶ', function() {
    var v = PV.collect('spi', DOCS);
    ['Uninit', 'Idle', 'Busy', 'Error'].forEach(function(n) {
      expect(names(v.byRole.state)).toContain(n);
    });
  });

  test('クラス図の型は型として並び、メソッドに紛れない', function() {
    var v = PV.collect('spi', DOCS);
    expect(names(v.byRole.type)).toContain('Spi_Driver');
    expect(names(v.byRole.method)).not.toContain('Spi_Driver');
  });

  test('1 件ごとに、どの図に出るかが言える', function() {
    var v = PV.collect('spi', DOCS);
    var txt = PV.sourceText(v.byName['Spi_Init']);
    expect(txt).toContain('primary/spi_init_sequence');
    expect(txt).toContain('spi_state');
  });

  test('日本語のラベルは名前帳に載せない (突き合わせる形になっていない)', function() {
    var v = PV.collect('spi', [{ name: 'spi_state.puml', kind: 'state',
      text: '@startuml\nIdle --> Busy : 送信開始\n@enduml' }]);
    expect(names(v.items)).toEqual(['Busy', 'Idle']);
  });
});

describe('名前帳 — 引く', function() {
  test('役割で絞れる。きっかけの欄にクラス名は出ない', function() {
    var v = PV.collect('spi', DOCS);
    var s = PV.suggest(v, ['method', 'event'], {});
    expect(names(s)).toContain('Spi_Init');
    expect(names(s)).not.toContain('Spi_Driver');
    expect(names(s)).not.toContain('Idle');
  });

  test('前方一致で絞れる', function() {
    var v = PV.collect('spi', DOCS);
    expect(names(PV.suggest(v, 'method', { prefix: 'spi_t' }))).toEqual(['Spi_Transmit']);
  });

  test('件数を絞れる', function() {
    var v = PV.collect('spi', DOCS);
    expect(PV.suggest(v, 'state', { limit: 2 }).length).toBe(2);
  });

  test('出てくる図が多い名前が先に並ぶ', function() {
    var v = PV.collect('spi', DOCS);
    var m = names(v.byRole.method);
    expect(m.indexOf('Spi_Init')).toBeLessThan(m.indexOf('Spi_Reset'));
  });
});

describe('名前帳 — 表記揺れ', function() {
  var SHAKY = DOCS.concat([{
    name: 'spi_activity.puml', kind: 'activity', text: '@startuml\nstart\n:SpiInit();\nstop\n@enduml',
  }]);

  test('綴りの違う同じ名前は、どちらも消さずに 1 組として出る', function() {
    var v = PV.collect('spi', SHAKY);
    expect(names(v.items)).toContain('Spi_Init');
    expect(names(v.items)).toContain('SpiInit');
    var pair = v.variants.map(function(g) { return names(g).sort().join(','); });
    expect(pair).toContain('SpiInit,Spi_Init');
  });

  test('打った名前が名前帳と揺れていれば、その場で相手の綴りを言う', function() {
    var v = PV.collect('spi', DOCS);
    expect(PV.checkName(v, 'SpiInit')).toContain('Spi_Init');
    expect(PV.checkName(v, 'SpiInit')).toContain('spi_init_sequence');
  });

  test('名前帳に載っている綴りなら何も言わない', function() {
    var v = PV.collect('spi', DOCS);
    expect(PV.checkName(v, 'Spi_Init')).toBe('');
  });

  test('どこにも似ていない新しい名前は黙って通す (新語を邪魔しない)', function() {
    var v = PV.collect('spi', DOCS);
    expect(PV.checkName(v, 'Spi_Abort')).toBe('');
  });

  // BLK-owner-20260926-0550-5: 数えているのは図の枚数なので「図種」と言わない。
  test('見出しは図の枚数と語数、揺れの組数を数で言う', function() {
    var v = PV.collect('spi', SHAKY);
    expect(PV.summary(v)).toContain('SPI の名前帳');
    expect(PV.summary(v)).toContain('4 枚の図から');
    expect(PV.summary(v)).not.toContain('図種');
    expect(PV.summary(v)).toContain('表記揺れ 1 組');
  });

  test('下に並べる語が総数より少なければ「並べる数/総数」で言う', function() {
    var v = PV.collect('spi', SHAKY);
    var total = v.items.length;
    expect(PV.summary(v, total)).toContain(' ' + total + ' 語');
    expect(/\d+\/\d+ 語/.test(PV.summary(v, total))).toBe(false);
    expect(PV.summary(v, 1)).toContain(' 1/' + total + ' 語');
  });
});

describe('名前帳 — 現在の 1 冊', function() {
  test('app.js が預けたものを図種パネルが引ける', function() {
    var v = PV.collect('spi', DOCS);
    PV.setCurrent(v);
    expect(PV.current().subject).toBe('spi');
    PV.setCurrent(null);
    expect(PV.current()).toBe(null);
  });
});


// TICKET-owner-20261115-2140-prune: 入力欄の下に名前を並べるチップは外した (候補は今の図の中の名前だけ)。
// 集めた名前があっても、入力欄の下には何も出さない。
describe('入力欄には出さない', function() {
  test('集めた名前があっても欄の下にチップは出ない', function() {
    PV.setCurrent(PV.collect('spi', DOCS));
    expect(P.vocabPickerHtml('pk', { roles: ['method', 'event'] })).toBe('');
  });
});

// window を差し替えたままにすると、後続のテストファイルが別の window を見る。
PV.setCurrent(null);
global.window = prevWindow;
global.document = prevDocument;
