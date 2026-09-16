'use strict';
// BLK-primary-20260915-0007: 依存グラフの影響先すべてに同じ note を 1 回で打てること。
// ここで固定するのは (a) 図の中身に応じて note の書き方を選ぶところ、
// (b) 既に同じ文面がある図を二重に汚さないところ。

var W = (typeof window !== 'undefined' && window) || global.window;
var BN = W.MA.bulkNote;

var SEQ = [
  '@startuml',
  'participant Spi_Driver',
  'participant ClockCtrl',
  'Spi_Driver -> ClockCtrl : EnableClock()',
  '@enduml',
].join('\n');

var CLS = [
  '@startuml',
  'class ClockCtrl {',
  '  + EnableClock() : void',
  '}',
  '@enduml',
].join('\n');

var NOTE = 'ClockCtrl の呼び先は意図的に省略 (reviewer依頼2への回答)';

describe('bulk-note: 影響先すべてに同じ note を打つ', function() {
  test('シーケンス図は最初の参加者に掛ける', function() {
    expect(BN.anchorFor(SEQ)).toBe('Spi_Driver');
    expect(BN.noteLine(SEQ, NOTE)).toBe('note over Spi_Driver : ' + NOTE);
  });

  test('参加者が宣言されていなくても、最初のメッセージの送り手に掛ける', function() {
    var dsl = '@startuml\nA -> B : x()\n@enduml';
    expect(BN.anchorFor(dsl)).toBe('A');
  });

  test('参加者もメッセージも無い図 (クラス図) は浮いた note にする', function() {
    expect(BN.anchorFor(CLS)).toBe(null);
    expect(BN.noteLine(CLS, NOTE)).toBe('note "' + NOTE + '" as MA_BULK_NOTE');
  });

  test('note は @enduml の直前に入る', function() {
    var res = BN.applyToDsl(CLS, NOTE);
    expect(res.added).toBe(1);
    var lines = res.dsl.split('\n');
    expect(lines[lines.length - 2]).toBe('note "' + NOTE + '" as MA_BULK_NOTE');
    expect(lines[lines.length - 1]).toBe('@enduml');
  });

  test('@enduml が無い断片でも末尾に入り、空行を増やさない', function() {
    var res = BN.applyToDsl('class A\n\n', NOTE);
    expect(res.added).toBe(1);
    expect(res.dsl).toBe('class A\nnote "' + NOTE + '" as MA_BULK_NOTE\n\n');
  });

  test('同じ文面が既にある図は飛ばす (二重に打たない)', function() {
    var once = BN.applyToDsl(SEQ, NOTE);
    var twice = BN.applyToDsl(once.dsl, NOTE);
    expect(twice.added).toBe(0);
    expect(twice.skipped).toBe(1);
    expect(twice.dsl).toBe(once.dsl);
  });

  test('別の文面なら 2 本目が入り、浮いた note の別名は衝突しない', function() {
    var once = BN.applyToDsl(CLS, NOTE);
    var twice = BN.applyToDsl(once.dsl, '2 本目の断り書き');
    expect(twice.added).toBe(1);
    expect(twice.dsl).toContain('as MA_BULK_NOTE2');
  });

  test('本文の改行は 1 行に畳む (どの図にも同じ 1 行が入る)', function() {
    var line = BN.noteLine(SEQ, '1 行目\n2 行目');
    expect(line).toBe('note over Spi_Driver : 1 行目\\n2 行目');
  });

  test('文面が空なら何もしない', function() {
    var res = BN.applyToDsl(CLS, '   ');
    expect(res.added).toBe(0);
    expect(res.dsl).toBe(CLS);
  });
});

describe('bulk-note: 複数図への一括適用', function() {
  var docs = [
    { id: 1, name: 'spi_init_sequence', dsl: SEQ },
    { id: 2, name: 'driver_common_class', dsl: CLS },
    { id: 3, name: 'irq_state', dsl: '@startuml\nstate A\n@enduml' },
  ];

  test('選んだ図だけに入る', function() {
    var res = BN.apply(docs, ['spi_init_sequence', 'driver_common_class'], NOTE);
    expect(res.added).toBe(2);
    expect(res.changed.map(function(c) { return c.name; }))
      .toEqual(['spi_init_sequence', 'driver_common_class']);
    // 選ばなかった図は 1 文字も変わらない
    expect(docs[2].dsl).toBe('@startuml\nstate A\n@enduml');
  });

  test('変更前の本文が changed に残る (書き込み履歴の前後に使う)', function() {
    var res = BN.apply(docs, ['driver_common_class'], NOTE);
    expect(res.changed[0].before).toBe(CLS);
  });

  test('preview は図ごとに入るか既にあるかを出す', function() {
    var applied = BN.applyToDsl(SEQ, NOTE).dsl;
    var rows = BN.preview([
      { id: 1, name: 'spi_init_sequence', dsl: applied },
      { id: 2, name: 'driver_common_class', dsl: CLS },
    ], ['spi_init_sequence', 'driver_common_class'], NOTE);
    expect(rows.map(function(r) { return r.status; })).toEqual(['skip', 'add']);
    expect(BN.summaryText(rows)).toBe('1 図に打ちます（1 図は既にあり）');
  });

  test('文面が空のときの案内', function() {
    var rows = BN.preview(docs, ['irq_state'], '');
    expect(BN.summaryText(rows)).toBe('note の文面を入力してください');
    expect(BN.summaryText([])).toBe('打つ図を選んでください');
  });
});
