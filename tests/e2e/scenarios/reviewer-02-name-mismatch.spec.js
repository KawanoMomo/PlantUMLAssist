// @ts-check
// reviewer 台本 手順2: 5 枚の間で部品名の不一致を探し、見つけたら指摘を書く
// (図名・行・内容・初出日・継続 tick 数)。
// 成長規則で対象は junior のフォルダにも広がっているので、フォルダをまたぐ
// 同じドメインの図の突合もここで到達条件にする (BLK-reviewer-20260909-0403-wish)。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const { loadMA } = require('../../load-ma');

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

// BLK-reviewer-20260916-0326-wish: 表記揺れはグループ単位でしか出ないので、
// Clock_Ctrl ⇔ ClockCtrl が junior の中だけの揺れなのか primary の図とぶつかって
// いるのかは、グループの図を 1 枚ずつ開いて誰のフォルダかを見るまで分からなかった
// (前回の run はそれを取り違えて「junior 内部だけの揺れ」と書いた)。手順2 を
// 「突合対象をコマンドで組み立てて全文を読み直す」から「印が付いた図だけ開く」に変える。
const S2 = require('./_scenario');

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
