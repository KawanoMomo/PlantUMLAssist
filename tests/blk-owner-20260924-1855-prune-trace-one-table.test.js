'use strict';
// BLK-owner-20260924-1855-prune: 「遷移 × シーケンスのメッセージ」の表を
// 状態遷移のトレース漏れ (#tc-modal) の 1 枚に寄せた。系統チェック (#fa-modal) は案内だけ。
// ここでは 1 枚の表を組む材料が噛み合うことを守る:
// - traceLabelTable の行 (対応が無い行が上) は traceCoverage の行と同じ件数 (対象外を除く)
// - labelPosition の entries は同じ docId#line で表の行に引ける (位置の列が空にならない)
// - 画面側: #fl-table はどこにも出さず、系統チェックには案内ボタンだけがある
const fs = require('fs');
const path = require('path');
const { loadMA } = require('../tools/audit-runtime');
const TT = require('../src/core/trace-label-table');

const { MA } = loadMA();

function state(lines) { return ['@startuml', '[*] --> Idle'].concat(lines).concat(['@enduml']).join('\n'); }
function seq(msgs) {
  return ['@startuml', 'actor App', 'participant Drv']
    .concat(msgs.map((m) => 'App -> Drv : ' + m)).concat(['@enduml']).join('\n');
}

const DOCS = [
  { id: 'dmas', name: 'dma_state', diagramType: 'plantuml-state',
    dsl: state(['Idle --> Configured : Dma_Configure', 'Configured --> Armed : ArmChannel']) },
  { id: 'dmaq', name: 'dma_transfer_sequence', diagramType: 'plantuml-sequence',
    dsl: seq(['SetSrcDst', 'WriteConfig', 'ArmChannel']) },
  { id: 'adcs', name: 'adc_state', diagramType: 'plantuml-state', dsl: state(['Idle --> Configured : Adc_Init']) },
  { id: 'adcq', name: 'adc_init_sequence', diagramType: 'plantuml-sequence', dsl: seq(['Adc_Init', 'EnableClock', 'WriteConfig']) },
  { id: 'gpios', name: 'gpio_state', diagramType: 'plantuml-state', dsl: state(['Idle --> Configured : Gpio_Init']) },
  { id: 'gpioq', name: 'gpio_init_sequence', diagramType: 'plantuml-sequence', dsl: seq(['Gpio_Init', 'EnableClock', 'WriteConfig']) },
];

function tableFor(key) {
  const families = MA.traceCoverage.audit(DOCS);
  const fam = families.filter((f) => f.key === key)[0];
  const rows = TT.build(fam).rows.filter((r) => r.status !== 'out-of-scope');
  const rank = MA.labelPosition.rank(families);
  const pos = {};
  rank.rows.forEach((r) => {
    if (r.key !== key) return;
    r.entries.forEach((e) => { pos[e.docId + '#' + e.line] = e; });
  });
  return { fam, rows, pos };
}

describe('トレース漏れの表 1 枚 — 材料の噛み合わせ', function() {
  test('行数は traceCoverage の行と同じ、対応が無い行が上に来る', function() {
    const t = tableFor('dma');
    expect(t.rows.length).toBe(t.fam.rows.length);
    expect(t.rows[0].status).toBe('missing');
    expect(t.rows[0].label).toBe('Dma_Configure');
    expect(t.fam.missing.length).toBe(1);
    // 対応が無い行の「対応するメッセージ」欄は、直す先 (候補か実在名) を言う
    expect(TT.matchText(t.rows[0])).toContain('対応なし →');
  });

  test('位置の列は同じ docId#line で表の行から引ける (ズレた行に印)', function() {
    const t = tableFor('dma');
    const armed = t.rows.filter((r) => r.label === 'ArmChannel')[0];
    const pe = t.pos[armed.docId + '#' + armed.line];
    expect(pe).toBeTruthy();
    expect(pe.odd).toBe(true);
    expect(pe.position).toBe('tail');
  });

  test('系統チェックの画面は表を持たず、トレース漏れへの案内だけを持つ', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    expect(src).not.toContain('id="fl-table"');
    expect(src).not.toContain('_labelTableHtml');
    expect(src).toContain('fa-open-trace');
    expect(src).toContain('function openTraceCoverage(key)');
  });
});
