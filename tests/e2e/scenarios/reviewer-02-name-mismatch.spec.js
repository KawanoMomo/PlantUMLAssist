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

// 突合を GPIO の外へ広げた回 (BLK-reviewer-20260909-0503-wish)。`plantuml` ドメインが
// 3 フォルダで「食い違い」と出たが、中身はアプリ同梱テンプレを各自が複製しただけの
// 練習用ファイルだった。テンプレ由来の雑音と業務データの食い違いを区別できることを
// 到達条件にする (区別できないと、毎回 puml の中身を読んで選り分けることになる)。
test('手順2 テンプレ由来の食い違いは、中身を読まずに業務データと分けて出る', () => {
  const { MA } = loadMA();

  const stock = ['@startuml', 'title Sample Sequence', 'actor User',
    'participant System', 'database DB', 'User -> System : Request', '@enduml'].join('\n');
  const docs = [
    // 業務データ: 本物の名前空間衝突 (junior は Gpio_Driver、primary は GpioDrv)。
    {
      name: 'junior/gpio_init_sequence.puml',
      dsl: ['@startuml', 'participant Gpio_Driver', 'participant Hw_Ctrl',
        'Gpio_Driver -> Hw_Ctrl : Gpio_Setup', '@enduml'].join('\n'),
    },
    { name: 'primary/gpio_init_sequence.puml', dsl: R.DOCS.gpio_init_sequence },
    // テンプレ由来の雑音: 同梱テンプレを 3 人が独立に複製しただけ。
    { name: 'junior/plantuml-sequence.puml', dsl: stock },
    { name: 'primary/plantuml-sequence.puml', dsl: stock },
    { name: 'reviewer/plantuml-sequence.puml', dsl: stock.replace('Request', 'Ping') },
    // 新規タブの既定サンプルも同じ名前でフォルダをまたいで残る。
    { name: 'junior/diagram1.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
    { name: 'primary/diagram1.puml', dsl: '@startuml\n[*] --> Ready\n@enduml' },
  ];

  const result = MA.domainCohort.audit(docs);
  // 到達条件 1: 既定で出るのは業務データの食い違いだけ。
  expect(result.groups.map((g) => g.domain)).toEqual(['gpio']);
  expect(result.groups[0].mismatched).toBe(1);

  // 到達条件 2: 外したテンプレは黙って消えず、何を外したかが数えられる。
  expect(result.templateDomains.map((t) => t.domain)).toEqual(['diagram1', 'plantuml']);
  expect(result.templateDomains[1].reason).toBe('アプリ同梱テンプレ');
  expect(MA.domainCohort.summaryLine(result))
    .toContain('テンプレ由来 2 ドメインは除外: diagram1, plantuml');

  // 到達条件 3: テンプレも見たいときは 1 回の呼び直しで戻せる。
  const withTpl = MA.domainCohort.audit(docs, { includeTemplates: true });
  expect(withTpl.groups.map((g) => g.domain)).toEqual(['diagram1', 'gpio', 'plantuml']);
});

// BLK-reviewer-20260909-0703-wish: 「junior の GPIO とは意図して別物」という判断は
// primary が puml のコメント行に手で書いていたが、突合はその行を読まなかった。
// reviewer は突合が出した食い違い 1 件ごとに grep で「もう決まっているか」を確かめ
// 直しており、書き忘れ・typo があれば同じ指摘を再起票し続けた。手順を
// 「宣言を読む」から「宣言と実体の食い違いだけを見る」に変えることを到達条件にする。
test('手順2 判断済みの別ドメインは突合が最初から外し、宣言と実体の食い違いだけが残る', () => {
  const { MA } = loadMA();
  const DV = MA.domainVerdict;
  expect(DV).toBeTruthy();

  const junior = ['@startuml', 'participant Gpio_Driver', 'participant Hw_Ctrl',
    'Gpio_Driver -> Hw_Ctrl : Gpio_Setup', '@enduml'].join('\n');
  const primary = ['@startuml', 'participant GpioDrv', 'participant HwCtl',
    'GpioDrv -> HwCtl : Gpio_Init', '@enduml'].join('\n');
  const pair = (j, p) => [
    { name: 'junior/gpio_init_sequence.puml', dsl: j },
    { name: 'primary/gpio_init_sequence.puml', dsl: p },
  ];

  // 宣言が無い間は、これまでどおり「これから判断する食い違い」として出る。
  expect(MA.domainCohort.audit(pair(junior, primary)).groups[0].mismatched).toBe(1);

  // 「別ドメイン」と宣言した図は、grep しなくても突合が判断済みと分かる。
  const declared = MA.domainCohort.audit(
    pair(DV.applyMark(junior, 'separate', 'gpio', 'primary'), primary));
  expect(declared.groups[0].mismatched).toBe(0);
  expect(declared.declared).toBe(1);
  const row = MA.domainCohort.rows(declared)[0];
  expect(row.verdict.kind).toBe('separate');
  expect(row.verdict.by).toEqual(['junior']);
  // 外したことは 1 行に残る (件数が減っただけを「直った」と読ませない)。
  expect(MA.domainCohort.summaryLine(declared)).toContain('宣言済み 1 組は除外');

  // 宣言が現実と合っていない組だけが、名指しで残る。ここが手順 4.7 で見る一覧。
  const conflicted = MA.domainCohort.audit(
    pair(DV.applyMark(junior, 'shared', 'gpio', 'primary'), primary));
  expect(conflicted.conflicts).toBe(1);
  expect(conflicted.groups[0].mismatched).toBe(0);
  const conf = MA.domainCohort.conflictRows(conflicted);
  expect(conf.map((c) => c.conflict)).toEqual(['shared-but-differs']);
  expect(conf[0].text).toContain('同一と宣言されているのに中身が食い違う');
  expect(MA.domainCohort.summaryLine(conflicted)).toContain('宣言と実体の食い違い 1 組');
});

// BLK-reviewer-20260913-0306-wish: 保存直後の複数ファイルが同じ中身に収束して
// 正しい内容がどこにも残らない事故が起きたとき、手順2 は指摘を書く前に
// 「どのファイルが最新の正か」を過去 run の控え (runs/*/tmp、たまたま複製して
// いただけ) を漁って推測する作業になっていた。控えは保存のたびに server が
// `_versions/` へ 1 世代取っているので、手順2 を「直前版とのdiffを見る」に
// 変えられることを到達条件にする。
test('手順2 中身が消えた図を、直前版との差分で名指しできる', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');

  // 事故の前後を、実際の保存フォルダと同じ形 (図 + `_versions/{name}--{刻印}.puml`) で作る。
  const dir = path.join(REPO, 'test-results', 'reviewer-02-versions');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '_versions'), { recursive: true });

  const FULL = ['@startuml', 'title Driver_Common_Class',
    'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
    'class Spi_Driver', 'class Can_Driver', 'class Gpio_Driver', '@enduml'].join('\n');
  const TEMPLATE = ['@startuml', 'title Sample Sequence', 'actor User',
    'participant System', '@enduml'].join('\n');

  // 事故: plantuml-class に別の図が被さり、driver_common_class は普通に書き足された。
  fs.writeFileSync(path.join(dir, 'plantuml-class.puml'), TEMPLATE, 'utf-8');
  fs.writeFileSync(path.join(dir, '_versions', 'plantuml-class--20260914-001252.puml'), FULL, 'utf-8');
  fs.writeFileSync(path.join(dir, 'driver_common_class.puml'), FULL + '\nclass Irq_Driver', 'utf-8');
  fs.writeFileSync(path.join(dir, '_versions', 'driver_common_class--20260913-031500.puml'), FULL, 'utf-8');
  // 控えのまだ無い図は「初めての保存」で、疑いに数えない。
  fs.writeFileSync(path.join(dir, 'spi_state.puml'), ['@startuml', '[*] --> Idle', '@enduml'].join('\n'), 'utf-8');

  const out = execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), dir, '--versions'],
    { cwd: REPO, encoding: 'utf-8' });

  // 到達条件 1: 消えた図が、推測ではなく名指しで、先頭に出る。
  const lines = out.split('\n').filter((l) => /^\s*[⚠・]/.test(l));
  expect(lines[0]).toContain('plantuml-class.puml');
  expect(lines[0]).toContain('別の図で塗り潰された疑い');
  // 到達条件 2: 普通の書き足しと、控えの無い図は疑いに混ざらない。
  expect(out).toContain('疑い 1 件 / 3 枚');
  expect(out).toContain('driver_common_class.puml  書き足し・直し');
  expect(out).toContain('spi_state.puml  控えなし');
  // 到達条件 3: 指摘に写す材料 (消えた行と、戻し先の版) がその場で読める。
  expect(out).toContain('- 2  title Driver_Common_Class');
  expect(out).toContain('plantuml-class@20260914-001252');

  fs.rmSync(dir, { recursive: true, force: true });
});
