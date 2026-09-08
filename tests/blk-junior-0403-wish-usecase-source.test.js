'use strict';
// BLK-junior-20260909-0403-wish: ユースケース図の「追加」に、同じ部品の
// シーケンス図から拾ったアクター候補・ユースケース候補を出す。
// コンポーネント図には実績候補が出るのに、ユースケース図は白紙から
// 考えて一括入力欄に打つしかなかった。

var W = (typeof window !== 'undefined' && window) || global.window;
var US = W.MA.usecaseSource;
var UC = W.MA.modules.plantumlUsecase;

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// 同じ部品 (GPIO) のシーケンス図。開発者と RTOS が GpioDrv を呼び、
// GpioDrv は Port_Drv を呼ぶ。日本語の参加者は GUI が ASCII の識別子に
// 正規化して表示名を別に持つので (sequence.js の normalizeIdInput)、
// 実ファイルと同じ `as A1` 形で書く。
var GPIO_SEQ = uml([
  'actor "開発者" as A1',
  'participant GpioDrv',
  'participant Port_Drv',
  'participant RTOS',
  'A1 -> GpioDrv : Gpio_Init(cfg)',
  'A1 -> GpioDrv : Gpio_WritePin(id, level)',
  'RTOS -> GpioDrv : Gpio_EnableIrq()',
  'GpioDrv -> Port_Drv : Port_SetMode()',
]);

// 同じ部品の 2 枚目。読み取りの API がここにしかない。
var GPIO_READ_SEQ = uml([
  'actor "開発者" as A1',
  'participant GpioDrv',
  'A1 -> GpioDrv : Gpio_ReadPin(id)',
  'GpioDrv --> A1 : level',
]);

// 別部品のシーケンス図。ここの参加者・メッセージは GPIO の候補ではない。
var SPI_SEQ = uml([
  'actor "保守員" as A2',
  'participant SpiDrv',
  'participant Dma_Drv',
  'A2 -> SpiDrv : Spi_TransmitDma()',
]);

var BLANK_UC = uml(['actor User', '(Login)', 'User --> Login']);
var EMPTY_UC = uml([]);

var DOCS = [
  { id: 1, name: 'gpio_usecase', diagramType: 'plantuml-usecase', dsl: EMPTY_UC },
  { id: 2, name: 'gpio_init_sequence', diagramType: 'plantuml-sequence', dsl: GPIO_SEQ },
  { id: 3, name: 'gpio_read_sequence', diagramType: 'plantuml-sequence', dsl: GPIO_READ_SEQ },
  { id: 4, name: 'spi_transfer_sequence', diagramType: 'plantuml-sequence', dsl: SPI_SEQ },
];

function names(list) { return list.map(function(r) { return r.name; }); }

describe('起点にする部品', function() {
  test('シーケンス図の名前から部品を束ねる', function() {
    var ids = US.subjects(DOCS, 1).map(function(s) { return s.id; });
    expect(ids.indexOf('gpio') >= 0).toBe(true);
    expect(ids.indexOf('spi') >= 0).toBe(true);
    // どの部品にも付く語は起点にならない。
    expect(ids.indexOf('sequence')).toBe(-1);
    expect(ids.indexOf('init')).toBe(-1);
  });

  test('図が多い部品が先に来る', function() {
    expect(US.subjects(DOCS, 1)[0].id).toBe('gpio');
  });

  test('ラベルにどの図から来たかが出る', function() {
    var gpio = US.subjects(DOCS, 1).filter(function(s) { return s.id === 'gpio'; })[0];
    expect(gpio.label.indexOf('gpio_init_sequence') >= 0).toBe(true);
    expect(gpio.label.indexOf('gpio_read_sequence') >= 0).toBe(true);
  });

  test('既定は今の図の名前と語が重なる部品', function() {
    expect(US.defaultSubject(DOCS, 1, 'gpio_usecase')).toBe('gpio');
    expect(US.defaultSubject(DOCS, 1, 'spi_usecase')).toBe('spi');
  });

  test('手がかりが無ければ図が多い部品', function() {
    expect(US.defaultSubject(DOCS, 1, '無題')).toBe('gpio');
  });

  test('シーケンス図が無ければ起点も無い', function() {
    expect(US.subjects([DOCS[0]], 1)).toEqual([]);
    expect(US.defaultSubject([DOCS[0]], 1, 'gpio')).toBe('');
  });
});

describe('メッセージからユースケース名を作る', function() {
  test('引数の中身は畳む (題材ごとに違うのでユースケース名にならない)', function() {
    expect(US.usecaseLabel('Gpio_Init(cfg)')).toBe('Gpio_Init()');
  });

  test('autonumber の番号を落とす', function() {
    expect(US.usecaseLabel('3. Gpio_ReadPin(id)')).toBe('Gpio_ReadPin()');
  });

  test('返り値の代入を落とす', function() {
    expect(US.usecaseLabel('ret = Gpio_ReadPin(id)')).toBe('Gpio_ReadPin()');
  });

  test('PlantUML の装飾を落とす', function() {
    expect(US.usecaseLabel('""Gpio_Init()""')).toBe('Gpio_Init()');
    expect(US.usecaseLabel('<b>ピン設定</b>')).toBe('ピン設定');
  });

  test('空のラベルは空のまま', function() {
    expect(US.usecaseLabel('')).toBe('');
    expect(US.usecaseLabel(null)).toBe('');
  });
});

describe('アクター候補', function() {
  test('部品を呼んでいる参加者が候補になる', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').actors);
    expect(got.indexOf('開発者') >= 0).toBe(true);
    expect(got.indexOf('RTOS') >= 0).toBe(true);
  });

  test('部品自身はアクターにしない', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').actors);
    expect(got.indexOf('GpioDrv')).toBe(-1);
  });

  test('別部品の図の参加者は出ない', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').actors);
    expect(got.indexOf('保守員')).toBe(-1);
    expect(got.indexOf('SpiDrv')).toBe(-1);
  });

  test('呼び出し元が、呼ばれるだけの相手より先に並ぶ', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').actors);
    // 開発者・RTOS は GpioDrv を呼ぶ。Port_Drv は呼ばれるだけ。
    expect(got.indexOf('Port_Drv') > got.indexOf('開発者')).toBe(true);
    expect(got.indexOf('Port_Drv') > got.indexOf('RTOS')).toBe(true);
  });

  test('どの図から来たかが理由に出る', function() {
    var row = US.candidates(EMPTY_UC, DOCS, 1, 'gpio').actors
      .filter(function(r) { return r.name === '開発者'; })[0];
    expect(row.why.indexOf('gpio_init_sequence') >= 0).toBe(true);
    expect(row.why.indexOf('呼んでいます') >= 0).toBe(true);
  });

  test('既に図にあるアクターは候補に出ない', function() {
    var dsl = uml(['actor "開発者" as A1']);
    var got = names(US.candidates(dsl, DOCS, 1, 'gpio').actors);
    expect(got.indexOf('開発者')).toBe(-1);
    expect(got.indexOf('RTOS') >= 0).toBe(true);
  });
});

describe('ユースケース候補', function() {
  test('部品宛てのメッセージが候補になる', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').usecases);
    expect(got.indexOf('Gpio_Init()') >= 0).toBe(true);
    expect(got.indexOf('Gpio_WritePin()') >= 0).toBe(true);
    expect(got.indexOf('Gpio_EnableIrq()') >= 0).toBe(true);
  });

  test('2 枚目の図の API も混ざる', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').usecases);
    expect(got.indexOf('Gpio_ReadPin()') >= 0).toBe(true);
  });

  test('部品宛てが、部品から出るものより先に並ぶ', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').usecases);
    expect(got.indexOf('Port_SetMode()') > got.indexOf('Gpio_Init()')).toBe(true);
  });

  test('別部品の図のメッセージは出ない', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'gpio').usecases);
    expect(got.indexOf('Spi_TransmitDma()')).toBe(-1);
  });

  test('呼び出し元が理由と関連の材料になる', function() {
    var row = US.candidates(EMPTY_UC, DOCS, 1, 'gpio').usecases
      .filter(function(r) { return r.name === 'Gpio_EnableIrq()'; })[0];
    expect(row.callers).toEqual(['RTOS']);
    expect(row.why.indexOf('RTOS') >= 0).toBe(true);
  });

  test('既に図にあるユースケースは候補に出ない', function() {
    var dsl = uml(['usecase "Gpio_Init()" as U1']);
    var got = names(US.candidates(dsl, DOCS, 1, 'gpio').usecases);
    expect(got.indexOf('Gpio_Init()')).toBe(-1);
    expect(got.indexOf('Gpio_ReadPin()') >= 0).toBe(true);
  });

  test('起点が違えば候補も違う', function() {
    var got = names(US.candidates(EMPTY_UC, DOCS, 1, 'spi').usecases);
    expect(got.indexOf('Spi_TransmitDma()') >= 0).toBe(true);
    expect(got.indexOf('Gpio_Init()')).toBe(-1);
  });
});

describe('選んだ候補を一括入力の行にする', function() {
  function pick(res, name) {
    var all = res.actors.concat(res.usecases);
    return all.filter(function(r) { return r.name === name; })[0];
  }

  test('アクターと呼んでいるユースケースを選ぶと関連の行も出る', function() {
    var res = US.candidates(EMPTY_UC, DOCS, 1, 'gpio');
    var block = US.blockFor([pick(res, 'RTOS'), pick(res, 'Gpio_EnableIrq()')]);
    var lines = block.split('\n');
    expect(lines.indexOf('actor RTOS') >= 0).toBe(true);
    expect(lines.indexOf('(Gpio_EnableIrq())') >= 0).toBe(true);
    expect(lines.indexOf('RTOS --> (Gpio_EnableIrq())') >= 0).toBe(true);
  });

  test('呼び出し元を選ばなければ関連は出ない', function() {
    var res = US.candidates(EMPTY_UC, DOCS, 1, 'gpio');
    var block = US.blockFor([pick(res, 'Gpio_EnableIrq()')]);
    expect(block.indexOf('-->')).toBe(-1);
    expect(block.indexOf('(Gpio_EnableIrq())') >= 0).toBe(true);
  });

  test('要素の行が関連より先に並ぶ (宣言してから結ぶ)', function() {
    var res = US.candidates(EMPTY_UC, DOCS, 1, 'gpio');
    var block = US.blockFor([pick(res, '開発者'), pick(res, 'Gpio_Init()')]);
    var lines = block.split('\n');
    expect(lines[lines.length - 1].indexOf('-->') >= 0).toBe(true);
  });

  test('何も選ばなければ空', function() {
    expect(US.blockFor([])).toBe('');
    expect(US.blockFor(null)).toBe('');
  });

  test('書き出した行がそのまま図になる', function() {
    var res = US.candidates(EMPTY_UC, DOCS, 1, 'gpio');
    var block = US.blockFor([pick(res, '開発者'), pick(res, 'Gpio_Init()')]);
    var parsed = UC.parse(BLANK_UC);
    var out = UC.addBulk(BLANK_UC, block, parsed);
    var p2 = UC.parse(out);
    var labels = p2.elements.map(function(e) { return e.label; });
    expect(labels.indexOf('開発者') >= 0).toBe(true);
    expect(labels.indexOf('Gpio_Init()') >= 0).toBe(true);
    // 元からある行は残る。
    expect(labels.indexOf('Login') >= 0).toBe(true);
    expect(p2.relations.length).toBe(2);
  });
});

describe('候補の要約', function() {
  test('件数を数える', function() {
    var res = US.candidates(EMPTY_UC, DOCS, 1, 'gpio');
    var s = US.summaryText(res);
    expect(s.indexOf('アクター候補 ' + res.actors.length + ' 件') >= 0).toBe(true);
    expect(s.indexOf('ユースケース候補 ' + res.usecases.length + ' 件') >= 0).toBe(true);
  });

  test('候補が無いときはその旨', function() {
    expect(US.summaryText({ actors: [], usecases: [] }).indexOf('ありません') >= 0).toBe(true);
  });
});
