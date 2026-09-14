'use strict';
// BLK-primary-20260908-1403-wish: 系統ごとの遷移密度 (1 メッセージ何遷移か) を並べ、
// 他系統の中央値から外れた系統を先に示す。粒度の指摘を「一覧を見る → 外れた系統だけ
// 開いて直す」の 2 段階にするのが目的。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/dsl-utils.js', '../src/core/parser-utils.js', '../src/core/scope-decl.js',
  '../src/core/family-audit.js', '../src/core/trace-coverage.js',
  '../src/core/transition-density.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var td = global.window.MA.transitionDensity;

function seq(prefix, msgs) {
  return ['@startuml', 'participant App', 'participant ' + prefix]
    .concat(msgs.map(function(m) { return 'App -> ' + prefix + ' : ' + m; }))
    .concat(['@enduml']).join('\n');
}

function state(pairs) {
  return ['@startuml', '[*] --> Idle']
    .concat(pairs.map(function(p) { return p[0] + ' --> ' + p[1] + ' : ' + p[2]; }))
    .concat(['@enduml']).join('\n');
}

// 1 メッセージ 1 遷移の系統。
function oneToOne(key) {
  return [
    { id: key + 's', name: key + '_state', diagramType: 'state',
      dsl: state([['Idle', 'Configured', key + '_Init'], ['Configured', 'Done', key + '_Start']]) },
    { id: key + 'q', name: key + '_init_sequence', diagramType: 'sequence',
      dsl: seq(key, [key + '_Init', key + '_Start']) },
  ];
}

// dma だけ 1 メッセージが 4 遷移に分解されている。
var DMA = [
  { id: 'dmas', name: 'dma_state', diagramType: 'state',
    dsl: state([
      ['Idle', 'Configured', 'Dma_Configure'],
      ['Configured', 'SrcDstSet', 'Dma_SetSrcDst'],
      ['SrcDstSet', 'DmaReqEnabled', 'Dma_EnableReq'],
      ['DmaReqEnabled', 'Transferring', 'Dma_Arm'],
      ['Transferring', 'Done', 'Dma_Complete'],
      ['Done', 'Idle', 'Dma_Ack'],
      ['Idle', 'Error', 'Dma_Fault'],
      ['Error', 'Idle', 'Dma_Reset'],
    ]) },
  { id: 'dmaq', name: 'dma_init_sequence', diagramType: 'sequence',
    dsl: seq('Dma', ['Dma_Configure', 'Dma_Complete']) },
];

var DOCS = oneToOne('Adc').concat(oneToOne('Can'), oneToOne('Uart'), DMA);

describe('transition-density', function() {
  test('系統ごとに状態数・遷移数・メッセージ数を数える', function() {
    var r = td.rank(DOCS);
    var byKey = {};
    r.rows.forEach(function(row) { byKey[row.key] = row; });
    expect(Object.keys(byKey).sort()).toEqual(['adc', 'can', 'dma', 'uart']);
    expect(byKey.adc.transitions).toBe(2);
    expect(byKey.adc.messages).toBe(2);
    expect(byKey.adc.density).toBe(1);
    // Idle / Configured / Done の 3 状態 ([*] は数えない)
    expect(byKey.adc.states).toBe(3);
    expect(byKey.dma.transitions).toBe(8);
    expect(byKey.dma.messages).toBe(2);
    expect(byKey.dma.density).toBe(4);
  });

  test('中央値から外れた系統を外れ値として名指しし、先頭に置く', function() {
    var r = td.rank(DOCS);
    expect(r.median).toBe(1);
    expect(r.outliers.map(function(x) { return x.key; })).toEqual(['dma']);
    expect(r.rows[0].key).toBe('dma');
    expect(r.rows[0].reason).toBe('他系統より細かく分解されています');
    expect(td.summaryLine(r)).toContain('dma');
  });

  test('揃っている系統だけなら外れ値を出さない', function() {
    var r = td.rank(oneToOne('Adc').concat(oneToOne('Can'), oneToOne('Uart')));
    expect(r.outliers).toEqual([]);
    expect(td.summaryLine(r)).toContain('揃っています');
  });

  test('系統が 2 つしか無いときは、どちらが外れているか言わない', function() {
    var r = td.rank(oneToOne('Adc').concat(DMA));
    expect(r.outliers).toEqual([]);
  });

  test('片方の図種が欠けている系統は密度を出さず、理由を持つ', function() {
    var docs = oneToOne('Adc').concat(oneToOne('Can'), oneToOne('Uart'), [
      { id: 'x', name: 'timer_state', diagramType: 'state',
        dsl: state([['Idle', 'Done', 'Timer_Start']]) },
    ]);
    var r = td.rank(docs);
    var timer = r.rows.filter(function(x) { return x.key === 'timer'; })[0];
    expect(timer.density).toBe(null);
    expect(timer.reason).toBe('シーケンス図がありません');
    expect(td.densityText(timer)).toBe('—');
    // 密度を出せない系統は末尾 (外れ値の判定材料にならない)
    expect(r.rows[r.rows.length - 1].key).toBe('timer');
  });

  test('図が 1 枚も無ければ数えるものが無いと言う', function() {
    expect(td.summaryLine(td.rank([]))).toContain('系統ごとに数えられる図がありません');
  });
});
