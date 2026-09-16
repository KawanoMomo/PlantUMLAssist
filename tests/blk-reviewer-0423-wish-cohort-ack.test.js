'use strict';
// BLK-reviewer-20260917-0423-wish: junior×primary の突合 (spi/timer の 4 組) が毎 tick
// 同じ「部品名/ラベルが違うだけの内部揺れ」を出し続け、reviewer は同じ diff を
// 最初から読み直して同じ結論を出し直していた。ここで固定するのは台帳の約束:
//   - 一度「内部揺れ・非衝突」と確認した組は、次の突合では未確認から外れる
//   - 左右が入れ替わって組み直されても同じ組として当たる
//   - 差分が変わったら確認は自動的に外れる (確認済みの印が新しい食い違いを隠さない)
//   - 畳んだ数は必ず数えられる (黙って減らさない)
//   - 壊れた台帳でも突合は止まらない
// 自前の窓で回す。run-tests.js は 1 プロセスで全部を順に回すので最後に元へ戻す。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/name-pairing.js',
 '../src/core/method-audit.js', '../src/core/name-audit.js', '../src/core/audit-scope.js',
 '../src/core/family-audit.js', '../src/core/domain-cohort.js', '../src/core/cohort-ack.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var CA = global.window.MA.cohortAck;
var DC = global.window.MA.domainCohort;

// 事故の実物。junior と primary の spi シーケンスは部品名の綴りだけが違う。
var JUNIOR = {
  name: 'junior/spi_init_sequence.puml',
  diagramType: 'plantuml-sequence',
  dsl: ['@startuml', 'participant SpiDrv', 'participant Clock',
    'SpiDrv -> Clock : Init()', '@enduml'].join('\n'),
};
var PRIMARY = {
  name: 'primary/spi_init_sequence.puml',
  diagramType: 'plantuml-sequence',
  dsl: ['@startuml', 'participant Spi_Driver', 'participant Clock',
    'Spi_Driver -> Clock : Init()', '@enduml'].join('\n'),
};

function rowsOf(docs) {
  return DC.diffRows(DC.audit(docs || [JUNIOR, PRIMARY]));
}

describe('確認済みペアの台帳 — 同じ内部揺れを二度読まない', function() {

  test('突合はまず未確認の組として出す (台帳が空なら何も畳まない)', function() {
    var rows = rowsOf();
    expect(rows.length).toBe(1);
    var st = CA.statusOf(CA.empty(), rows[0]);
    expect(st.status).toBe('new');
    expect(CA.pending(rows, CA.empty()).length).toBe(1);
  });

  test('一度確認した組は次の突合で未確認から外れる', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0], { by: 'reviewer', at: '2026-09-17' }).ledger;
    // 次の tick — 図は変わっていないので突合をやり直しても同じ組が出る。
    var again = rowsOf();
    expect(CA.statusOf(led, again[0]).status).toBe('acked');
    expect(CA.pending(again, led).length).toBe(0);
    expect(CA.settled(again, led).length).toBe(1);
    expect(CA.statusOf(led, again[0]).text).toContain('内部揺れ');
  });

  test('左右が入れ替わって組まれても同じ組として当たる', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0]).ledger;
    var swapped = rowsOf([PRIMARY, JUNIOR]);
    expect(CA.pairKey(swapped[0])).toBe(CA.pairKey(rows[0]));
    expect(CA.statusOf(led, swapped[0]).status).toBe('acked');
  });

  test('差分が変わったら確認は外れる (新しい食い違いを隠さない)', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0]).ledger;
    // primary が部品を 1 つ増やした = 前に確認したときとは違う差分。
    var changed = rowsOf([JUNIOR, {
      name: 'primary/spi_init_sequence.puml',
      diagramType: 'plantuml-sequence',
      dsl: ['@startuml', 'participant Spi_Driver', 'participant Clock', 'participant Dma',
        'Spi_Driver -> Clock : Init()', 'Spi_Driver -> Dma : Start()', '@enduml'].join('\n'),
    }]);
    var st = CA.statusOf(led, changed[0]);
    expect(st.status).toBe('changed');
    expect(st.text).toContain('もう一度');
    expect(CA.pending(changed, led).length).toBe(1);
  });

  test('確認を取り消すと元に戻る', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0]).ledger;
    var back = CA.unack(led, rows[0]);
    expect(CA.statusOf(back, rows[0]).status).toBe('new');
    expect(back.entries.length).toBe(0);
  });

  test('畳んだ数と未確認の数を必ず言う', function() {
    var rows = rowsOf();
    expect(CA.summaryLine(rows, CA.empty())).toContain('まだ 1 組も確認していません');
    var led = CA.ack(CA.empty(), rows[0]).ledger;
    var line = CA.summaryLine(rowsOf(), led);
    expect(line).toContain('1 組を除外');
    expect(line).toContain('未確認 0 組');
  });

  test('台帳は保存して読み直しても同じ判定になる', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0], { by: 'reviewer', at: '2026-09-17',
      note: '内部揺れ・非衝突' }).ledger;
    var reread = CA.parse(CA.format(led));
    expect(reread.entries.length).toBe(1);
    expect(reread.entries[0].note).toBe('内部揺れ・非衝突');
    expect(CA.statusOf(reread, rowsOf()[0]).status).toBe('acked');
  });

  test('壊れた台帳は「1 組も確認していない」と同じ扱い (突合を止めない)', function() {
    expect(CA.parse('{壊れ').entries.length).toBe(0);
    expect(CA.parse(null).entries.length).toBe(0);
    expect(CA.statusOf(CA.parse('{壊れ'), rowsOf()[0]).status).toBe('new');
  });

  test('同じ組を二度確認しても台帳は 1 行のまま (2 つの確認済みが並ばない)', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0], { by: 'a' }).ledger;
    led = CA.ack(led, rows[0], { by: 'b' }).ledger;
    expect(led.entries.length).toBe(1);
    expect(led.entries[0].by).toBe('b');
  });

  test('まとめて確認済みにできる', function() {
    var rows = rowsOf();
    var res = CA.ackAll(CA.empty(), rows, { by: 'reviewer' });
    expect(res.added).toBe(1);
    expect(CA.pending(rowsOf(), res.ledger).length).toBe(0);
  });

  test('台帳の行は人が読める 1 行になる', function() {
    var rows = rowsOf();
    var led = CA.ack(CA.empty(), rows[0], { by: 'reviewer', at: '2026-09-17' }).ledger;
    var line = CA.lines(led)[0];
    expect(line).toContain('spi');
    expect(line).toContain('確認: reviewer');
  });
});

// 窓を元に戻す。
global.window = prevWindow;
global.document = prevDocument;
