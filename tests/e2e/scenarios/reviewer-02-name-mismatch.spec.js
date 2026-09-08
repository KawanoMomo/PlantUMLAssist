// @ts-check
// reviewer 台本 手順2: 5 枚の間で部品名の不一致を探し、見つけたら指摘を書く
// (図名・行・内容・初出日・継続 tick 数)。
// 成長規則で対象は junior のフォルダにも広がっているので、フォルダをまたぐ
// 同じドメインの図の突合もここで到達条件にする (BLK-reviewer-20260909-0403-wish)。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const { loadMA } = require('../../../tools/audit-runtime');

test('手順2 図をまたぐ部品名の不一致を、図名と行で指せる', () => {
  const findings = [];
  for (const [name, dsl] of Object.entries(R.DOCS)) {
    dsl.split('\n').forEach((line, i) => {
      // 他図の多数派は Xxx_Driver。XxxDrv 形が残っていれば不一致。
      const m = /\b([A-Z][a-z]+)Drv\b/.exec(line);
      if (m) findings.push({ doc: name, line: i + 1, content: line.trim(), want: m[1] + '_Driver' });
    });
  }
  // 到達条件: 不一致が見つかり、指摘の 3 要素 (図名・行・内容) が揃う。
  expect(findings.length).toBeGreaterThan(0);
  expect(new Set(findings.map((f) => f.doc))).toEqual(new Set(['gpio_init_sequence']));
  expect(findings[0].line).toBeGreaterThan(0);
  expect(findings[0].want).toBe('Gpio_Driver');
});

// 対象を junior のフォルダに広げた回の突合。以前はここで
// 「同じドメインの図が向こうにもあるか」をファイル名から推測して 1 枚ずつ開き、
// テキストを目で見比べるしかなかった。ドメインで束ねて差分を出せることを到達条件にする。
test('手順2 フォルダをまたぐ同じドメインの図を、探さずに束ねて差分まで出せる', () => {
  const { MA } = loadMA();
  expect(MA.domainCohort).toBeTruthy();

  // primary の図と、同じドメインを持つ junior の図。名前は `フォルダ/ファイル名`。
  const docs = [
    ...Object.entries(R.DOCS).map(([n, dsl]) => ({ name: `primary/${n}.puml`, dsl })),
    {
      name: 'junior/gpio_init_sequence.puml',
      dsl: ['@startuml', 'title GPIO 初期化シーケンス',
        'participant Gpio_Driver', 'participant Hw_Ctrl',
        'Gpio_Driver -> Hw_Ctrl : Gpio_Setup',
        '@enduml'].join('\n'),
    },
    {
      name: 'junior/gpio_state.puml',
      dsl: ['@startuml', 'title GPIO 状態遷移',
        '[*] --> Idle', 'Idle --> Active : Gpio_Setup',
        '@enduml'].join('\n'),
    },
  ];

  const result = MA.domainCohort.audit(docs);
  // 到達条件 1: フォルダをまたぐドメインが、探さずに名指しで出る。
  const domains = result.groups.map((g) => g.domain);
  expect(domains).toEqual(['gpio']);
  expect(result.groups[0].folders).toEqual(['junior', 'primary']);
  // 相手のいないドメイン (spi / can / driver) は「揃っている」に数えない。
  expect(result.soloDomains).toEqual(expect.arrayContaining(['spi', 'can', 'driver']));

  // 到達条件 2: 同じ図種の組ごとに、部品名と遷移ラベルの差分がその場で読める。
  const rows = MA.domainCohort.rows(result);
  expect(rows.map((r) => r.kind).sort()).toEqual(['plantuml-sequence', 'plantuml-state']);

  const seq = rows.find((r) => r.kind === 'plantuml-sequence');
  expect(seq.left).toBe('junior / gpio_init_sequence');
  expect(seq.right).toBe('primary / gpio_init_sequence');
  // junior は Gpio_Driver、primary は GpioDrv — 部品名が別物であることが出る。
  expect(seq.diff.names.onlyA).toContain('Gpio_Driver');
  expect(seq.diff.names.onlyB).toContain('GpioDrv');
  // メッセージ名も別物 (Gpio_Setup / Gpio_Init)。
  expect(seq.diff.labels.onlyA).toContain('Gpio_Setup');
  expect(seq.diff.labels.onlyB).toContain('Gpio_Init');

  const st = rows.find((r) => r.kind === 'plantuml-state');
  // 状態名も遷移ラベルも噛み合っていない。
  expect(st.diff.names.onlyA.sort()).toEqual(['Active', 'Idle']);
  expect(st.diff.names.onlyB.sort()).toEqual(['Ready', 'Uninit']);
  expect(st.matched).toBe(false);

  // 到達条件 3: 指摘に書ける 1 行が、この 1 回の呼び出しから出る。
  expect(MA.domainCohort.summaryLine(result)).toContain('gpio [junior × primary]');
});
