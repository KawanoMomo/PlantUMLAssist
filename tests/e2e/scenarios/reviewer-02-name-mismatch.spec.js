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

// BLK-reviewer-20260914-1706: 名前突合は「表記揺れ 3 組」という件数と正規化キーだけを出し、
// どの綴りがどの綴りと対応するのか・その宣言行がどのファイルの何行目なのかは出なかった。
// reviewer は件数を得たあと結局 2 フォルダを grep し直していた。手順2 を
// 「件数を見て grep する」から「1 回のコマンドで指摘に写す」に変える。
test('手順2 表記揺れを、どの図のどの宣言行かまで 1 回のコマンドで出せる', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');

  // 事故の実物と同じ形 (primary は IRQCtrl / ClockCtrl、junior は Irq_Ctrl / Clock_Ctrl)。
  const root = path.join(REPO, 'test-results', 'reviewer-02-names');
  fs.rmSync(root, { recursive: true, force: true });
  for (const p of ['primary', 'junior']) fs.mkdirSync(path.join(root, p), { recursive: true });

  fs.writeFileSync(path.join(root, 'primary', 'driver_common_class.puml'),
    ['@startuml', 'class IRQCtrl {', '  + Init() : void', '}', 'class ClockCtrl',
      'IRQCtrl --> ClockCtrl', '@enduml'].join('\n'), 'utf-8');
  fs.writeFileSync(path.join(root, 'junior', 'diagram1.puml'),
    ['@startuml', 'participant Irq_Ctrl', 'participant Clock_Ctrl',
      'Irq_Ctrl -> Clock_Ctrl : Init()', '@enduml'].join('\n'), 'utf-8');

  // --names は `--only name --summary` の別名 (手順2 で毎 tick 打つので短くする)。
  const out = execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), path.join(root, 'primary'), path.join(root, 'junior'),
      '--names', '--no-state'],
    { cwd: REPO, encoding: 'utf-8' });

  // 到達条件 1: 件数は今までどおり出る。
  expect(out).toContain('表記揺れ 2 組');
  // 到達条件 2: どの綴りがどの綴りと対応し、どちらに揃えるかが 1 行で読める。
  expect(out).toMatch(/IRQCtrl ⇔ Irq_Ctrl — 揃える先: /);
  // 到達条件 3: 指摘に写す「図名 + 行 + 内容」が、grep し直さずにその場で出る。
  expect(out).toContain('primary/driver_common_class.puml:2 宣言  class IRQCtrl {');
  expect(out).toContain('junior/diagram1.puml:2 宣言  participant Irq_Ctrl');
  expect(out).toContain('ClockCtrl');

  fs.rmSync(root, { recursive: true, force: true });
});

// BLK-reviewer-20260914-1406-wish: `plantuml-usecase.puml`(図種はユースケース)の中身が
// 丸ごと `dma_transfer_sequence.puml` の複製になっている事故を見つけたのは、31 枚の DSL を
// 1 枚ずつ読んだ結果だった。図種の宣言 (ファイル名) と本文の食い違いを見る監査は
// GUI にも CLI にも無く、同じ事故 (driver_common_class / plantuml-class の入れ替わり) は
// 過去にも起きている。手順2 を「全文を読む」から「食い違いだけを読む」に変える。
test('手順2 名乗っている図種と本文の図種の食い違いを、全文を読まずに名指しできる', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');

  const dir = path.join(REPO, 'test-results', 'reviewer-02-kind');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const SEQ = ['@startuml', 'title DMA 転送シーケンス',
    'participant Dma_Driver', 'participant Spi_Driver',
    'Dma_Driver -> Spi_Driver : Dma_Start', '@enduml'].join('\n');
  const UC = ['@startuml', 'left to right direction', 'actor 開発者',
    '(ドライバを設定する)', '開発者 --> (ドライバを設定する)', '@enduml'].join('\n');
  // 事故の実物: 図種はユースケースを名乗るのに、中身はシーケンス図の複製。
  fs.writeFileSync(path.join(dir, 'plantuml-usecase.puml'), SEQ, 'utf-8');
  fs.writeFileSync(path.join(dir, 'dma_transfer_sequence.puml'), SEQ, 'utf-8');
  fs.writeFileSync(path.join(dir, 'driver_use_case.puml'), UC, 'utf-8');
  // 名前に図種を持たない図は「照合できない」であって「問題なし」ではない。
  fs.writeFileSync(path.join(dir, 'diagram1.puml'), SEQ, 'utf-8');

  const out = execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), dir, '--only', 'kind', '--summary', '--no-state'],
    { cwd: REPO, encoding: 'utf-8' });

  // 到達条件 1: 食い違った図が名指しで 1 枚だけ出る (複製元は巻き込まれない)。
  expect(out).toContain('名乗りと本文が食い違う図 1 枚 (plantuml-usecase.puml)');
  expect(out).not.toContain('dma_transfer_sequence.puml');
  // 到達条件 2: 何枚を照合しての件数かが出る (名乗りの無い図を「問題なし」に数えない)。
  expect(out).toContain('3 枚を照合');
  // 到達条件 3: 指摘の件数に入る (件数だけを見ている run でも見落とさない)。
  expect(out).toContain('合計 1 件');

  // 監査結果の JSON からも、指摘に写す 1 行がそのまま読める。
  const { MA } = loadMA();
  const row = MA.kindMismatch.rowOf({ name: 'plantuml-usecase.puml', dsl: SEQ });
  expect(row.text).toContain('名乗りはユースケース図、本文はシーケンス図');

  fs.rmSync(dir, { recursive: true, force: true });
});

// BLK-reviewer-20260915-0506-wish: 表記揺れは機械で見つかるようになったが、「揃える先」は
// 出現数からの推定で毎回作り直されるだけで、junior/primary のどちらにも共有されない。
// reviewer は毎 tick 同じ組を見つけ→指摘.md に揃える先を書き→次の run で読ませる、という
// 最短 2 tick の伝言を続けていた (IRQCtrl 系は継続 4 tick 以上)。手順2 を
// 「毎回決め直す」から「登録簿に無い組だけを 1 回決める」に変える。
test('手順2 揃える先を 1 度登録すると、次の tick は決め直す組が残らない', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');

  // 事故の実物と同じ形 (primary は IRQCtrl / ClockCtrl、junior は Irq_Ctrl / Clock_Ctrl)。
  const root = path.join(REPO, 'test-results', 'reviewer-02-registry');
  fs.rmSync(root, { recursive: true, force: true });
  for (const p of ['primary', 'junior']) fs.mkdirSync(path.join(root, p), { recursive: true });
  fs.writeFileSync(path.join(root, 'primary', 'driver_common_class.puml'),
    ['@startuml', 'class IRQCtrl {', '  + Init() : void', '}', 'class ClockCtrl',
      'IRQCtrl --> ClockCtrl', '@enduml'].join('\n'), 'utf-8');
  fs.writeFileSync(path.join(root, 'junior', 'diagram1.puml'),
    ['@startuml', 'participant Irq_Ctrl', 'participant Clock_Ctrl',
      'Irq_Ctrl -> Clock_Ctrl : Init()', '@enduml'].join('\n'), 'utf-8');

  const run = (...extra) => execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), path.join(root, 'primary'), path.join(root, 'junior'),
      '--no-state', ...extra],
    { cwd: REPO, encoding: 'utf-8' });

  // 1 tick 目: 揃える先がまだ決まっていない組が名指しで出る。
  const before = run('--registry');
  expect(before).toContain('表記揺れ 2 組 / 登録済み 0 組 / 要決定 2 組');
  expect(before).toMatch(/要決定\s+IRQCtrl ⇔ Irq_Ctrl/);
  // 決めるための材料 (どの図のどの宣言行か) が同じ画面に出る。
  expect(before).toContain('primary/driver_common_class.puml:2 宣言  class IRQCtrl {');
  expect(before).toContain('→ 揃える先を登録する: 同じコマンドに --register を足す');

  // 登録は 1 回。置き場は 2 つのフォルダの親なので、3 人が同じ 1 冊を見る。
  const wrote = run('--register', '--by', 'reviewer');
  expect(wrote).toContain('登録しました: 2 語');
  const file = path.join(root, '_names.json');
  expect(fs.existsSync(file)).toBe(true);

  // 2 tick 目: 図は 1 文字も直っていないのに、決め直す組はもう無い。
  const after = run('--registry');
  expect(after).toContain('表記揺れ 2 組 / 登録済み 2 組 / 要決定 0 組');
  expect(after).toContain('→ 決め直す組はありません');
  expect(after).toContain('IRQCtrl ← Irq_Ctrl');
  expect(after).toContain('登録: reviewer');

  // 新しい略語が出た回だけ、その 1 組が要決定に戻る (登録済みは蒸し返さない)。
  fs.writeFileSync(path.join(root, 'junior', 'dma_sequence.puml'),
    ['@startuml', 'participant Dma_Driver', 'participant Irq_Ctrl',
      'Dma_Driver -> Irq_Ctrl : Dma_Start', '@enduml'].join('\n'), 'utf-8');
  fs.writeFileSync(path.join(root, 'primary', 'dma_class.puml'),
    ['@startuml', 'class DmaDriver', '@enduml'].join('\n'), 'utf-8');
  const next = run('--registry');
  expect(next).toContain('要決定 1 組');
  expect(next).toMatch(/要決定\s+.*Dma/);

  // 揃える先は junior / primary の GUI が読む 1 冊なので、機械が読める形で残る。
  const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const irq = saved.entries.find((e) => e.canonical === 'IRQCtrl');
  expect(irq.variants).toEqual(['Irq_Ctrl']);
  expect(irq.by).toBe('reviewer');

  fs.rmSync(root, { recursive: true, force: true });
});

// BLK-reviewer-20260916-0326-wish: 表記揺れはグループ単位でしか出ないので、
// Clock_Ctrl ⇔ ClockCtrl が junior の中だけの揺れなのか primary の図とぶつかって
// いるのかは、グループの図を 1 枚ずつ開いて誰のフォルダかを見るまで分からなかった
// (前回の run はそれを取り違えて「junior 内部だけの揺れ」と書いた)。手順2 を
// 「突合対象をコマンドで組み立てて全文を読み直す」から「印が付いた図だけ開く」に変える。
const S2 = require('./_scenario');

test('手順2 他 persona と部品名が衝突している図が、一覧の印で分かる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  // 隣り合う 2 つの persona フォルダ (peek の行き先は保存先の隣)。
  const ROOT = S2.dirFor(__filename) + '/personas';
  const MINE = ROOT + '/primary';
  const THEIRS = ROOT + '/junior';

  const cls = (names) => ['@startuml', ...names.map((n) => 'class ' + n),
    names[0] + ' --> ' + names[0], '@enduml'].join('\n');
  const seq = (names) => ['@startuml', ...names.map((n) => 'participant ' + n),
    names[0] + ' -> ' + names[0] + ' : Init()', '@enduml'].join('\n');

  await S2.bootWithSaveDir(page, THEIRS);
  await S2.clearDir(page, THEIRS);
  // junior 側: Clock_Ctrl / Irq_Ctrl。
  await S2.putDoc(page, THEIRS, 'clock_state', seq(['Clock_Ctrl']));
  await S2.putDoc(page, THEIRS, 'irq_sequence', seq(['Irq_Ctrl']));

  await S2.bootWithSaveDir(page, MINE);
  await S2.clearDir(page, MINE);
  // primary 側: ClockCtrl は junior と綴りが割れている (= 衝突)。
  await S2.putDoc(page, MINE, 'driver_common_class', cls(['ClockCtrl', 'SpiDrv']));
  // IrqCtrl も割れているが、こちらは自分の中でも割れている図を作らないので
  // 「相手と衝突」だけが出る。SpiDrv は誰とも割れていない (印が付かない)。
  await S2.putDoc(page, MINE, 'spi_state', seq(['SpiDrv']));
  await S2.bootWithSaveDir(page, MINE);
  await page.waitForSelector('#preview-svg');

  await S2.openFolder(page);
  // 到達条件 1: 押す前は「照合していない」と言い切る (0 件と読み違えさせない)。
  await expect(page.locator('#folder-name-clash')).toContainText('照合していません');

  await page.locator('#folder-clash-run').click();
  await expect(page.locator('#folder-name-clash')).toContainText('枚を照合', { timeout: 60000 });

  // 到達条件 2: 衝突している図の行にだけ印が付き、相手の persona を名指しする。
  const bad = page.locator('.folder-row[data-clash-verdict="cross"]');
  await expect(bad).toHaveCount(1);
  await expect(bad.locator('.folder-clash')).toContainText('juniorと衝突');
  // 誰とも割れていない図には印が付かない。
  await expect(page.locator('[data-clash="spi_state"]')).toHaveCount(0);

  // 到達条件 3: どの図が相手側かが、1 枚ずつ開かずにその場で読める。
  const lines = page.locator('#folder-clash-lines');
  await expect(lines).toContainText('ClockCtrl');
  await expect(lines).toContainText('Clock_Ctrl');
  await expect(lines).toContainText('junior/clock_state');
  // 数え上げは両側の図を数える (相手側が何枚巻き込まれているかまで見えないと、
  // 「相手に断る」ときにこちらの 1 枚だけを見て話すことになる)。
  await expect(page.locator('#folder-name-clash')).toContainText('他 persona と衝突 2 図');
});

// BLK-reviewer-20260917-0323-wish: 突合の答えは ClockCtrl.EnableClock のような
// メソッド 1 個に付いているのに、手掛かりはファイル単位 (24 枚) でしか返らず、
// 「どの上位ドメインから呼ばれているか」は毎回シーケンス図 5〜6 枚を開いて
// 頭の中で組み直していた。手順2 を「ファイル単位の羅列を読む」から
// 「呼び出しグラフを 1 回走査する」に変えることを到達条件にする。
test('手順2 あるメソッドを呼んでいる全図を、1 回の探索でドメインごとに辿れる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const DIR = S2.dirFor(__filename) + '/callgraph';

  // 実物と同じ形。6 ドメインの初期化シーケンスが同じ ClockCtrl.EnableClock を呼び、
  // クラス図にはその宣言が無い (F-01)。
  const seq = (drv) => ['@startuml', 'title ' + drv,
    'actor App', 'participant ' + drv, 'participant ClockCtrl',
    'App -> ' + drv + ' : ' + drv.split('_')[0] + '_Init()',
    drv + ' -> ClockCtrl : EnableClock()',
    drv + ' --> App : InitDone', '@enduml'].join('\n');

  await S2.bootWithSaveDir(page, DIR);
  await S2.clearDir(page, DIR);
  await S2.putDoc(page, DIR, 'adc_init_sequence', seq('Adc_Driver'));
  await S2.putDoc(page, DIR, 'can_init_sequence', seq('Can_Driver'));
  await S2.putDoc(page, DIR, 'spi_init_sequence', seq('Spi_Driver'));
  await S2.putDoc(page, DIR, 'spi_state', ['@startuml', 'title Spi_State',
    '[*] --> Uninit', 'state Uninit', 'state Ready',
    'Uninit --> Ready : Spi_Init', '@enduml'].join('\n'));
  await S2.putDoc(page, DIR, 'driver_common_class', ['@startuml', 'title Driver_Common_Class',
    'class Spi_Driver {', '  + Spi_Init() : void', '}', '@enduml'].join('\n'));

  await S2.bootWithSaveDir(page, DIR);
  await page.waitForSelector('#preview-svg');
  await S2.openFolder(page);
  await page.locator('#folder-callgraph-open').click();

  // 到達条件 1: 開いた時点で「先に見るメソッド」が選ばれている
  // (24 枚の一覧から目で探す手順がここで消える)。
  await expect(page.locator('#cg-title')).toHaveText('ClockCtrl.EnableClock', { timeout: 60000 });
  await expect(page.locator('#cg-sum')).toContainText('最も散っているのは ClockCtrl.EnableClock');
  await expect(page.locator('.cg-node').first()).toHaveAttribute('data-undeclared', '1');

  // 到達条件 2: そのメソッドがどの上位ドメインから呼ばれているかが、
  // シーケンス図を 1 枚も開かずにグラフのまま読める。
  await expect(page.locator('#cg-verdict')).toContainText('クラス図に宣言なし');
  await expect(page.locator('#cg-verdict')).toContainText('3 枚 / 3 領域');
  await expect(page.locator('#cg-verdict')).toContainText('adc、can、spi');
  const domains = page.locator('#cg-refs .cg-domain');
  await expect(domains).toHaveCount(3);
  await expect(domains.first()).toHaveText('adc（1）');
  // 指摘に写す「図名 + 行 + 内容」が同じ画面に並ぶ。
  await expect(page.locator('.cg-ref[data-doc="adc_init_sequence.puml"]'))
    .toContainText('adc_init_sequence.puml:7');
  await expect(page.locator('.cg-ref[data-doc="adc_init_sequence.puml"]'))
    .toContainText('Adc_Driver -> ClockCtrl : EnableClock()');

  // 到達条件 3: 宣言のあるメソッドは、シーケンスの呼び出しと状態遷移の遷移ラベルが
  // 同じ 1 つの節点に並ぶ (手順 4.11 の突合がここで済む)。
  await page.locator('#cg-find').fill('Spi_Init');
  await page.locator('.cg-node[data-key="Spi_Driver.Spi_Init"]').click();
  await expect(page.locator('#cg-verdict')).toContainText('宣言 1 件（driver_common_class.puml:4）');
  await expect(page.locator('.cg-ref[data-kind="transition"]')).toContainText('spi_state.puml:6 遷移');
  await expect(page.locator('.cg-ref[data-kind="message"]')).toContainText('spi_init_sequence.puml:6');

  // 到達条件 4: 呼び出し元の行を押せば、その図のその行が開く
  // (「どの図の何行目か」を控えて自分で開き直す手順を残さない)。
  await page.locator('.cg-ref[data-kind="transition"]').click();
  await expect(page.locator('#cg-modal')).toBeHidden();
  await expect.poll(async () => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(ed.selectionStart, ed.selectionEnd);
  }), { timeout: 30000 }).toBe('Uninit --> Ready : Spi_Init');
});

// BLK-reviewer-20260917-0423-wish: junior×primary の 4 組は毎 tick 同じ「部品名/ラベルが
// 違うだけの内部揺れ」を出し続け、reviewer は毎回同じ diff を最初から読んで同じ結論を
// 出し直していた。domain-verdict の宣言は図の持ち主が自分の図に書く印で、どちらの図も
// 持たない reviewer には置き場が無い。手順2 を「未確認の新しい差分だけを見る」に
// 変えることを到達条件にする。
test('手順2 内部揺れと確認した組は台帳に残り、次の突合は未確認の差分だけになる', () => {
  const { MA } = loadMA();
  const CA = MA.cohortAck;
  expect(CA).toBeTruthy();

  const docs = () => [
    { name: 'junior/spi_init_sequence.puml', diagramType: 'plantuml-sequence',
      dsl: ['@startuml', 'participant SpiDrv', 'participant Clock',
        'SpiDrv -> Clock : Init()', '@enduml'].join('\n') },
    { name: 'primary/spi_init_sequence.puml', diagramType: 'plantuml-sequence',
      dsl: ['@startuml', 'participant Spi_Driver', 'participant Clock',
        'Spi_Driver -> Clock : Init()', '@enduml'].join('\n') },
  ];
  const rows = () => MA.domainCohort.diffRows(MA.domainCohort.audit(docs()));

  // 今日の突合。内部揺れ 1 組が未確認として出る (これまではここで毎回終わっていた)。
  expect(rows().length).toBe(1);
  expect(CA.statusOf(CA.empty(), rows()[0]).status).toBe('new');

  // 「内部揺れ・非衝突」と確かめて台帳に入れる。
  const ledger = CA.ack(CA.empty(), rows()[0],
    { by: 'reviewer', at: '2026-09-17', note: '内部揺れ・非衝突' }).ledger;

  // 次の tick — 図は同じなので同じ組が出るが、読み直す対象からは外れている。
  expect(CA.pending(rows(), ledger).length).toBe(0);
  expect(CA.settled(rows(), ledger).length).toBe(1);
  // 畳んだことは 1 行に残る (件数が減っただけを「直った」と読ませない)。
  expect(CA.summaryLine(rows(), ledger)).toContain('1 組を除外');

  // 台帳はファイルに落として読み直しても同じ判定になる (tick をまたいで残る)。
  const reread = CA.parse(CA.format(ledger));
  expect(CA.statusOf(reread, rows()[0]).status).toBe('acked');

  // 差分が変わった組は台帳があっても戻ってくる (確認済みが新しい食い違いを隠さない)。
  const grown = MA.domainCohort.diffRows(MA.domainCohort.audit([
    docs()[0],
    { name: 'primary/spi_init_sequence.puml', diagramType: 'plantuml-sequence',
      dsl: ['@startuml', 'participant Spi_Driver', 'participant Clock', 'participant Dma',
        'Spi_Driver -> Clock : Init()', 'Spi_Driver -> Dma : Start()', '@enduml'].join('\n') },
  ]));
  expect(CA.statusOf(ledger, grown[0]).status).toBe('changed');
  expect(CA.pending(grown, ledger).length).toBe(1);
});

// BLK-owner-20260924-1332-prune: 表記揺れを「見つける」画面が 🔍 名前突合と ▦ 突合ボードの 2 つ、
// 「直す」道が 🔍 の「これに統一」と 🔤 表記統一の 2 本あった。前者で揃えた組は登録簿に入らず、
// 次の tick の突合 (--registry) で同じ組を決め直していた。見つけるのは ▦ 突合ボード、直すのは
// 🔤 表記統一の 1 本ずつにし、ボードで揃える先を選ぶと登録簿に入ることを到達条件にする。
test('手順2 表記揺れは突合ボードで見つけ、揃える先を選ぶと登録簿に入って 🔤 表記統一で直る', async ({ page }) => {
  test.setTimeout(120 * 1000);
  // 登録簿 (_names.json) は保存先の親に置かれる。spec の外へ漏らさないよう 1 段下げる。
  const ROOT = S2.dirFor(__filename) + '/unify';
  const DIR = ROOT + '/primary';
  await S2.bootWithSaveDir(page, DIR);
  await S2.clearDir(page, DIR);
  await page.evaluate(async (d) => {
    await fetch('/name-registry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: d, entries: [] }) });
  }, DIR);
  await S2.typeDsl(page, ['@startuml', 'participant SpiDrv', 'participant IRQCtrl',
    'SpiDrv -> IRQCtrl : request', '@enduml'].join('\n'));
  await page.locator('#btn-tab-new').click();
  await S2.typeDsl(page, ['@startuml', 'participant CanDrv', 'participant IrqCtrl',
    'CanDrv -> IrqCtrl : notify', '@enduml'].join('\n'));

  // 到達条件 1: ツール ▾ に「表記揺れ」と打つと当たるのは ▦ 突合ボードの 1 行で、
  // 押すと「名前/表記揺れ」で絞られて開く (🔍 名前突合という別の画面は無い)。
  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-filter').fill('表記揺れ');
  const hits = page.locator('#tool-menu .tool-menu-hits .tool-menu-item');
  await expect(hits).toHaveCount(1);
  await expect(hits.first()).toHaveAttribute('data-target', 'btn-tab-cross');
  await hits.first().click();
  await expect(page.locator('#ab-modal')).toBeVisible();
  await expect(page.locator('#ab-kind')).toHaveValue('name.variants');
  const row = page.locator('#ab-body .ab-row[data-ab-kind="name.variants"]');
  await expect(row).toHaveCount(1);

  // 到達条件 2: 行で揃える先を選ぶと、組が登録簿に入り 🔤 表記統一がその組で開く。
  await row.locator('.ab-unify-to[data-to="IRQCtrl"]').click();
  await expect(page.locator('#unify-panel')).toHaveClass(/open/);
  await expect(page.locator('#unify-entry')).toHaveValue('irqctrl');
  const reg = await page.evaluate(async (d) =>
    (await (await fetch('/name-registry?dir=' + encodeURIComponent(d))).json()), DIR);
  expect(reg.entries.map((e) => e.canonical + ' ← ' + e.variants.join(','))).toEqual(['IRQCtrl ← IrqCtrl']);

  // 到達条件 3: 書くのは 🔤 表記統一の「まとめて適用」の 1 本。保存フォルダの図まで直る。
  await page.locator('#btn-unify-apply').click();
  await expect(page.locator('#unify-result')).toHaveAttribute('data-applied', '2');
  await page.locator('#btn-unify-cancel').click();
  expect(await S2.readDoc(page, DIR, 'diagram2')).toContain('participant IRQCtrl');

  // 到達条件 4: 直したあとの突合は、ボードの「名前/表記揺れ」も表記統一の未統一の組も 0。
  await S2.runCommand(page, '表記揺れ');
  await expect(page.locator('#ab-kind')).toHaveValue('name.variants');
  await expect(page.locator('#ab-body .ab-row')).toHaveCount(0);
  await page.locator('#ab-close').click();
  await page.locator('#btn-tab-unify').click();
  await expect(page.locator('#unify-summary')).toHaveText('登録簿の表記はすべて揃っています');
});
