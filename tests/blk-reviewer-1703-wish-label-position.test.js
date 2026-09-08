'use strict';
// BLK-reviewer-20260908-1703-wish: ラベル突合 (trace-label-table) は「その
// ラベルが実在するメッセージか」までしか見ない。dma のラベルは実在名
// (ArmChannel) に直っていたが、他系統が「シーケンス冒頭のエントリ呼び出し名」を
// ラベルにしているのに dma だけ「末尾の内部呼び出し名」を指しており、
// 慣習がズレていた。実在チェックでは一致と出るため、9 系統 × 2 図を開いて
// 「ラベルが何番目のメッセージか」を数えるしかなかった。
// ここでは「位置が系統ごとに出ること」「多数派からズレた系統が上に来ること」
// 「比べる相手が居ないときにズレと言わないこと」を固定する。

const { loadMA } = require('../tools/audit-runtime');

const { MA } = loadMA();
const LP = MA.labelPosition;

function state(name, label) {
  return ['@startuml', '[*] --> Idle', 'Idle --> ' + name + ' : ' + label, '@enduml'].join('\n');
}

function seq(msgs) {
  return ['@startuml', 'actor App', 'participant Drv']
    .concat(msgs.map((m) => 'App -> Drv : ' + m))
    .concat(['@enduml']).join('\n');
}

// 頭のエントリ呼び出しをラベルにする系統 (慣習)。
function headFamily(key, entry) {
  return [
    { id: key + 's', name: key + '_state', diagramType: 'plantuml-state', dsl: state('Configured', entry) },
    { id: key + 'q', name: key + '_init_sequence', diagramType: 'plantuml-sequence',
      dsl: seq([entry, 'EnableClock', 'WriteConfig']) },
  ];
}

// 末尾の内部呼び出しをラベルにする系統 (今回見つかったズレ)。
const DMA = [
  { id: 'dmas', name: 'dma_state', diagramType: 'plantuml-state', dsl: state('Armed', 'ArmChannel') },
  { id: 'dmaq', name: 'dma_transfer_sequence', diagramType: 'plantuml-sequence',
    dsl: seq(['SetSrcDst', 'WriteConfig', 'ArmChannel']) },
];

function rankOf(docs) {
  return LP.rank(MA.traceCoverage.audit(docs));
}

describe('label-position — 遷移ラベルが指すメッセージの位置', function() {
  test('位置は先頭・中間・末尾の 3 つに畳む', function() {
    expect(LP.positionOf(0, 3)).toBe('head');
    expect(LP.positionOf(1, 3)).toBe('middle');
    expect(LP.positionOf(2, 3)).toBe('tail');
    // 1 件しか無い図は先頭とも末尾とも言えない
    expect(LP.positionOf(0, 1)).toBe('single');
    expect(LP.positionOf(-1, 3)).toBe('');
  });

  test('多数派の慣習からズレた系統が上に来る', function() {
    const r = rankOf([].concat(headFamily('adc', 'Adc_Init'), headFamily('spi', 'Spi_Init'), DMA));
    expect(r.common).toBe('head');
    expect(r.rows.length).toBe(3);
    expect(r.rows[0].key).toBe('dma');
    expect(r.rows[0].odd).toBe(true);
    expect(r.rows[0].convention).toBe('tail');
    expect(r.odd.map((x) => x.key)).toEqual(['dma']);
    // ズレていない系統をズレと言わない
    expect(r.rows.filter((x) => x.odd).length).toBe(1);
  });

  test('ズレた行は、ラベルと相手のメッセージと何番目かまで出す', function() {
    const r = rankOf([].concat(headFamily('adc', 'Adc_Init'), headFamily('spi', 'Spi_Init'), DMA));
    const e = r.rows[0].entries[0];
    expect(e.label).toBe('ArmChannel');
    expect(e.message).toBe('ArmChannel');
    expect(e.ordinal).toBe(3);
    expect(e.total).toBe(3);
    expect(e.position).toBe('tail');
    expect(e.odd).toBe(true);
    // 行から図のその行へ飛べる控えが付く
    expect(e.docId).toBe('dmas');
    expect(e.line).toBeGreaterThan(0);
    expect(LP.positionText(r.rows[0])).toBe('末尾（末尾 1）');
  });

  test('比べる相手が 1 系統しか無いときは、ズレと言わない', function() {
    const r = rankOf(DMA);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].convention).toBe('tail');
    expect(r.common).toBe('');
    expect(r.odd.length).toBe(0);
    expect(LP.summaryLine(r)).toContain('1 件しかありません');
  });

  test('慣習が言えない系統は、その理由を書く (空欄でごまかさない)', function() {
    // シーケンス図が無い系統は突き合わせ自体が成立しない
    const r = rankOf([
      { id: 'a', name: 'pwm_state', diagramType: 'plantuml-state', dsl: state('Running', 'Pwm_Start') },
      { id: 'b', name: 'pwm_state2', diagramType: 'plantuml-state', dsl: state('Stopped', 'Pwm_Stop') },
    ]);
    expect(r.rows[0].convention).toBe('');
    expect(r.rows[0].reason).toContain('シーケンス図がありません');
    expect(LP.positionText(r.rows[0])).toBe(r.rows[0].reason);
  });

  test('見出しは、揃っているときは揃っていると言う', function() {
    const r = rankOf([].concat(headFamily('adc', 'Adc_Init'), headFamily('spi', 'Spi_Init')));
    expect(r.common).toBe('head');
    expect(r.odd.length).toBe(0);
    expect(LP.summaryLine(r)).toBe('2 系統とも遷移ラベルは先頭のメッセージを指しています');
  });

  test('慣習の多数決は系統 1 つにつき 1 票 (遷移の多い系統に引きずられない)', function() {
    const many = [
      { id: 'ms', name: 'i2c_state', diagramType: 'plantuml-state',
        dsl: ['@startuml', '[*] --> Idle', 'Idle --> A : Stop', 'A --> B : Reset',
          'B --> C : Abort', '@enduml'].join('\n') },
      { id: 'mq', name: 'i2c_seq', diagramType: 'plantuml-sequence',
        dsl: seq(['Start', 'Stop', 'Reset', 'Abort']) },
    ];
    const r = rankOf([].concat(many, headFamily('adc', 'Adc_Init'), headFamily('spi', 'Spi_Init')));
    // i2c は末尾寄り 3 件だが 1 票。head を持つ 2 系統が多数派になる
    expect(r.common).toBe('head');
    expect(r.votes.head).toBe(2);
    expect(r.rows[0].key).toBe('i2c');
    expect(r.rows[0].odd).toBe(true);
  });
});
