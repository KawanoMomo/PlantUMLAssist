// @ts-check
// reviewer 台本 手順8: 前回の指摘が反映されたか確認する。
//
// BLK-reviewer-20260914-1206-wish: これまでは、前回の指摘文書・手順2〜7 で出した今回の指摘・
// 前回控えとの diff の 3 つを手で突き合わせ、1 件ずつ「反映済み / 継続」を頭の中で
// 振り分け、継続の回数も自分で憶えていた。いまは前回の 指摘.md をそのまま渡せば、
// 振り分けと継続 tick 数まで 1 枚の画面が出す。
//
// BLK-reviewer-20260914-1306-wish: それでも「前回の指摘文書」を持って来る必要は残っていた。
// 指摘.md が手元に無い tick や、2 tick より前から続いている指摘の初出を知りたいときは、
// audit.js --summary-json を叩き直して run ログを遡るしかなかった。いまは監査を記録して
// おけば、台帳が指摘 1 件ごとに 対象ファイル:行 / 初出 tick / 解消 tick を並べる。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const auditBoard = require('../../../src/core/audit-board');
const reviewBoard = require('../../../src/core/review-board');
const timeline = require('../../../src/core/audit-timeline');
const ledger = require('../../../src/core/finding-ledger');
// BLK-reviewer-20260914-1406: 監査は window.MA 前提なので、spec からは CLI と
// 同じ入口 (tools/audit-runtime) で読む。CLI が出す数字とここが同じ根拠になる。
const { loadMA } = require('../../../tools/audit-runtime');

// 前回 primary に返した指摘文書そのもの (reviewer が 指摘.md に上書き保存した形)。
const 指摘 = [
  '# primary への指摘(前回)',
  '',
  '## 【継続・2回目】gpio_init_sequence.puml の participant 名が他図と揃っていない',
  '`GpioDrv` は他図の `Gpio_Driver` と揃っていない。初出: runs/20260913-0206。継続 2 tick 目。',
  '',
  '## 【継続】spi_init_sequence.puml の participant 名が他図と揃っていない',
  '`SpiDrv` は他図の `Spi_Driver` と揃っていない。',
  '',
  '## 突合サマリ',
  '命名 2 件。どちらも継続・未着手。',
].join('\n');

// 手順2〜7 で今回出した指摘。台本どおり DSL を読んで拾う。
function findingsOfToday() {
  const out = [];
  Object.entries(R.DOCS).forEach(([doc, dsl]) => {
    dsl.split('\n').forEach((line, i) => {
      if (/^participant\s+\w+Drv\b/.test(line)) {
        const name = line.split(/\s+/)[1];
        out.push({ doc: doc + '.puml', line: i + 1, keep: false, label: '要再確認',
          text: name + ' は他図の Gpio_Driver と揃っていない' });
      }
    });
  });
  const seq = R.DOCS.gpio_init_sequence;
  const used = new Set(R.arrowEnds(seq));
  R.participants(seq).forEach((p) => {
    if (used.has(p)) return;
    out.push({ doc: 'gpio_init_sequence.puml', line: 0, keep: false, label: '要再確認',
      text: p + ' は宣言だけで使われていない' });
  });
  return out;
}

test('手順8 前回の指摘それぞれに、反映済みか継続かを画面が言う', () => {
  const board = auditBoard.build({ findings: findingsOfToday() });
  const view = reviewBoard.build({
    board: board,
    findings: 指摘,
    // 前回控えとの diff。spi 側だけが実際に書き換わっている。
    changedFiles: ['spi_init_sequence.puml'],
  });

  const byDoc = {};
  view.carried.forEach((c) => { byDoc[c.finding.docs[0]] = c; });

  // GpioDrv は今回も指摘に出る = 継続。tick 数は前回の 2 から 1 つ進む。
  const gpio = byDoc.gpio_init_sequence;
  expect(gpio.verdict).toBe('carried');
  expect(gpio.tick).toBe(3);
  expect(gpio.finding.since).toBe('runs/20260913-0206');
  expect(gpio.rows.length).toBe(1);
  // 前回控えから 1 行も変わっていない = 未着手、まで同じ行で分かる。
  expect(gpio.touched).toEqual([]);

  // SpiDrv は直っている = 解消。前回控えから中身も変わっている。
  const spi = byDoc.spi_init_sequence;
  expect(spi.verdict).toBe('resolved');
  expect(spi.rows).toEqual([]);

  // 件数表の節は指摘として振り分けない (本文に「継続・未着手」が出てきても)。
  expect(view.carried.length).toBe(2);
  expect(view.counts.carried).toBe(1);
  expect(view.counts.resolved).toBe(1);
  // 前回の指摘に当たらない今回の指摘は、新規として別に残る。
  expect(view.fresh.map((r) => r.title)).toEqual(['Dbg_Trace は宣言だけで使われていない']);

  // 到達条件: 4 種類の情報源を手で束ねずに、1 枚の文面がそのまま読める。
  const md = reviewBoard.markdown(view, '前回の指摘の反映状況');
  expect(md).toContain('## 前回の指摘 — 継続（1 件）');
  expect(md).toContain('3 tick 目');
  expect(md).toContain('前回控えから 1 行も変わっていません = 未着手');
  expect(md).toContain('## 前回の指摘 — 解消（1 件）');
  expect(md).toContain('## 今回の新規（1 件）');
  expect(md).toContain('## 前回控えから変わった図（1 枚）');
});

// BLK-reviewer-20260914-2206: 前回の指摘文書に「puml 側は解消・svg 再エクスポートのみ継続」の
// ように複合の状態を書くと、--board は「解消」の 2 文字だけを見て今回の突合と付き合わせ、
// 残っている方に当たった所で「前回は解消と書いていますが、今回また当たっています」と出していた。
// 内容が前回から 1 文字も変わっていない継続まで再発に見えるので、図の中身を読み直していた。
test('手順8 内容据え置きの継続と、本当の出戻りを --board が区別する', () => {
  const 複合 = [
    '# primary への指摘(前回)',
    '',
    '## 指摘2 `domain-verdict` の宣言 (diagram1.puml)',
    'diagram1.puml 側は宣言を入れたので解消、svg の再エクスポートのみ継続。継続 2 tick 目。',
    '',
    '## 【解消】`Gpio_Driver` の participant 名 (gpio_init_sequence.puml)',
    '前回の指摘どおり揃えたので解消。',
  ].join('\n');
  // 今回の突合。diagram1 は出力物 (svg) だけが古い。gpio は宣言そのものが戻っている。
  const rows = [
    { doc: 'diagram1', docs: ['diagram1'], kind: 'svg.stale', category: 'SVG が古い',
      title: 'diagram1.svg が diagram1.puml より古い', detail: '再エクスポート待ち' },
    { doc: 'gpio_init_sequence', docs: ['gpio_init_sequence'], kind: 'name.variant', category: '命名',
      title: '`Gpio_Driver` が GpioDrv に戻っている', detail: 'gpio_init_sequence.puml:3' },
  ];
  const view = reviewBoard.build({ board: { rows: rows }, findings: 複合, changedFiles: [] });
  const byDoc = {};
  view.carried.forEach((c) => { byDoc[c.finding.docs[0]] = c; });

  // 到達条件その1: 部分解消の残りに当たっただけの指摘は出戻りにならず、
  // 継続 tick も前回の続きから数える (1 に戻らない)。
  const d1 = byDoc.diagram1;
  expect(d1.verdict).toBe('carried');
  expect(d1.regressed).toBe(false);
  expect(d1.tick).toBe(3);
  expect(d1.note).toContain('出戻りではありません');

  // 到達条件その2: 解消と書いた本体にまた当たったものだけが出戻りとして残る。
  const gpio = byDoc.gpio_init_sequence;
  expect(gpio.regressed).toBe(true);
  expect(gpio.tick).toBe(1);
  expect(gpio.note).toBe('前回は解消と書いていますが、今回また当たっています');

  // 到達条件その3: 読み直しが要る件数が要約と一覧の行頭で分かる (全件読み直さない)。
  expect(view.counts.regressed).toBe(1);
  expect(reviewBoard.summaryLine(view)).toContain('継続 2（うち出戻り 1）');
  const md = reviewBoard.markdown(view, '前回の指摘の反映状況');
  expect(md).toContain('（出戻り）');
  expect(md).toContain('（SVG 再エクスポート待ち）');
});

test('手順8 絞って回した回は、見ていない監査の指摘を解消と言わない', () => {
  // BLK-reviewer-20260914-2206 (3 件目): `--board --only svg` のように監査を絞ると、
  // 回していない監査の指摘まで「今回の突合に出ていない = 解消」と出ていた。
  // reviewer はそのたびに図の中身を読み直して人力で判定していた。
  const 前回 = [
    '# primary への指摘(前回)',
    '',
    '## 【継続・2回目】依頼2 `ClockCtrl.EnableClock` の呼び先',
    'driver_common_class.puml のクラス図に `ClockCtrl.EnableClock` のメソッドがありません。継続 2 tick 目。',
    '',
    '## 【継続】1回目 driver_common_class.svg が未再エクスポート',
    'driver_common_class.puml を直した後の svg の書き出しが追いついていません。',
  ].join('\n');
  // --only svg で回した回の突合行。svg の行しか来ない。
  const rows = [
    { doc: 'driver_common_class', docs: ['driver_common_class'], kind: 'svg.stale',
      category: '出力物/SVG 古', title: 'driver_common_class.puml', detail: 'SVG が図より古いままです' },
  ];
  const view = reviewBoard.build({ board: { rows: rows }, findings: 前回,
    changedFiles: [], scope: ['svg'] });
  const by = {};
  view.carried.forEach((c) => { by[c.verdict] = (by[c.verdict] || []).concat([c]); });

  // 到達条件その1: 回していない監査の指摘は解消に落ちない。
  expect(view.counts.resolved).toBe(0);
  expect(view.counts.outOfScope).toBe(1);
  expect(by.outOfScope[0].finding.title).toContain('ClockCtrl.EnableClock');
  expect(by.outOfScope[0].note).toContain('見ていません');

  // 到達条件その2: 据え置きなので tick を数え直さない
  // (絞った回を挟んだだけで継続 N がぶれない)。
  expect(by.outOfScope[0].tick).toBe(2);

  // 到達条件その3: スコープ内の指摘は今までどおり継続として数える。
  expect(view.counts.carried).toBe(1);
  expect(by.carried[0].finding.title).toContain('driver_common_class.svg');

  // 到達条件その4: 絞って回したことが画面の頭と要約で分かる。
  expect(reviewBoard.summaryLine(view)).toContain('今回は見ていない 1 件');
  const md = reviewBoard.markdown(view, '前回の指摘の反映状況');
  expect(md).toContain('--only svg');
  expect(md).toContain('据え置き');
});

// 監査を回すたびに記録しておいた 3 tick 分。gpio の名前不一致は 3 tick 目で直り、
// spi の名前不一致は最後まで残る (台本の「継続 / 反映済み」がそのまま出る形)。
function ok(result) { return { status: 'ok', result: result }; }
function nameRun(variants) {
  return { name: ok({ variants: variants, undeclared: [] }) };
}
const GPIO_VAR = {
  key: 'Gpio_Driver', suggested: 'Gpio_Driver',
  members: [{ name: 'GpioDrv', docs: ['gpio_init_sequence.puml'] }, { name: 'Gpio_Driver', docs: ['gpio_state.puml'] }],
};
const SPI_VAR = {
  key: 'Spi_Driver', suggested: 'Spi_Driver',
  members: [{ name: 'SpiDrv', docs: ['spi_init_sequence.puml'] }, { name: 'Spi_Driver', docs: ['spi_state.puml'] }],
};

test('手順8 指摘.md を持って来なくても、台帳が初出 tick と解消 tick を言う', () => {
  const snaps = [
    timeline.snapshot(nameRun([GPIO_VAR, SPI_VAR]), { label: 'runs/20260913-0206' }),
    timeline.snapshot(nameRun([GPIO_VAR, SPI_VAR]), { label: 'runs/20260914-1206' }),
    timeline.snapshot(nameRun([SPI_VAR]), { label: 'runs/20260914-1306' }),
  ];
  const view = ledger.build({
    snapshots: snaps,
    docs: Object.entries(R.DOCS).map(([name, dsl]) => ({ name: name + '.puml', dsl: dsl })),
  });

  const byTitle = {};
  view.rows.forEach((r) => { byTitle[r.title] = r; });

  // GpioDrv は 3 tick 目で消えた = 反映済み。いつ直ったかまで 1 行で出る。
  const gpio = byTitle.Gpio_Driver;
  expect(gpio.open).toBe(false);
  expect(gpio.since).toBe('runs/20260913-0206');
  expect(gpio.resolvedAt).toBe('runs/20260914-1306');
  // 対象ファイルと、その綴りが出ている行。puml を開き直して数えなくてよい。
  expect(ledger.whereText(gpio)).toContain('gpio_init_sequence.puml:3');

  // SpiDrv は最後の tick にも出ている = 継続。継続 tick 数も台帳が数える。
  const spi = byTitle.Spi_Driver;
  expect(spi.open).toBe(true);
  expect(spi.resolvedAt).toBe(null);
  expect(spi.ticks).toBe(3);
  expect(spi.spark).toBe('●●●');

  // 手順1 (前回の BLK をもう一度出すか) は、この一覧がそのまま答えになる。
  expect(ledger.carriedOver(view).map((r) => r.title)).toEqual(['Spi_Driver']);

  // 到達条件: audit.js を叩き直さずに、継続と解消が 1 枚の文面で読める。
  const md = ledger.markdown(view, '前回の指摘の反映状況');
  expect(md).toContain('## 継続（1 件）');
  expect(md).toContain('## 解消（1 件）');
  expect(md).toContain('解消 runs/20260914-1306');
  expect(md).toContain('初出 runs/20260913-0206');
});

// BLK-reviewer-20260914-1406: 手順8 の裏取りは「指摘が減ったか」だけでは終わらない。
// メソッド名をそのままクラスとして宣言した行でも、写しにだけ入れた修正でも件数は減り、
// これまでは該当 diff を 1 枚ずつ読み直すか sha1 を手で比べるまで気付けなかった。
test('手順8 指摘が減った理由が誤った宣言なら、diff を読み直す前に監査が名指しする', () => {
  const MA = loadMA().MA;
  const seq = { name: 'adc_sequence.puml',
    dsl: ['@startuml', 'Adc_Driver -> AdcRegs : WriteConfig()', '@enduml'].join('\n') };
  const 前回 = { name: 'driver_common_class.puml',
    dsl: ['@startuml', 'class Adc_Driver {', '  +Adc_Init()', '}', '@enduml'].join('\n') };
  // primary の「対応」。受け手のクラスと一緒に、メソッド名のクラスまで足してある。
  const 今回 = { name: 'driver_common_class.puml', dsl: ['@startuml',
    'class Adc_Driver {', '  +Adc_Init()', '}',
    'class AdcRegs', 'class WriteConfig', '@enduml'].join('\n') };

  const before = MA.methodAudit.audit([前回, seq]);
  const after = MA.methodAudit.audit([今回, seq]);
  // 「クラス無し」は確かに消える。ここまでしか見ないと直ったように読める。
  expect(before.issues.filter((i) => i.kind === 'no-class').length).toBe(1);
  expect(after.issues.filter((i) => i.kind === 'no-class').length).toBe(0);

  // 到達条件: 誤った宣言が指摘として出るので、合計は減らない。
  const suspect = after.issues.filter((i) => i.kind === 'method-as-class');
  expect(suspect.map((i) => i.method)).toEqual(['WriteConfig']);
  expect(MA.methodAudit.describe(suspect[0])).toContain('メソッド宣言を独立したクラスとして書いた誤りの疑い');
  expect(after.issues.length).toBeGreaterThanOrEqual(before.issues.length);
});

test('手順8 本体ではなく写しにだけ入った修正を、sha1 を手で比べずに名指しする', () => {
  const MA = loadMA().MA;
  const seq = { name: 'timer_sequence.puml',
    dsl: ['@startuml', 'App -> Timer_Driver : Timer_Init(cfg)', '@enduml'].join('\n') };
  const 写し = { name: 'driver_common_class-編集中.puml',
    dsl: ['@startuml', 'class Timer_Driver {', '  +Timer_Init(cfg)', '}', '@enduml'].join('\n') };
  const r = MA.methodAudit.audit([写し, seq]);
  expect(r.issues.map((i) => i.kind)).toEqual(['draft-only']);
  // 到達条件: どのファイルにだけ宣言があるかまで 1 行で読める。
  expect(MA.methodAudit.describe(r.issues[0]))
    .toContain('写しの driver_common_class-編集中.puml にしかない');
});

// BLK-reviewer-20260914-2206-wish: 台帳は「出た・出ない」の 2 値なので、reviewer が
// 下した複合の判断 (「puml 側は解消。svg の再エクスポートだけ継続」) を憶える場所が
// 無い。指摘.md は毎 tick 全文を書き直す 1 枚なので、その判断は次の tick に残らず、
// 監査が同じ論点を別カテゴリで拾い直すと「再発」に見えていた。指摘トラッカーは
// 指摘 1 件に id を与え、貼った判断を持ち越す (全文の書き直しを 1 行の更新に替える)。
const tracker = require('../../../src/core/finding-tracker');

test('手順8 前回の判断が次の tick に残り、書き直さず 1 行だけ更新できる', () => {
  const svg = (rows) => ({ svg: { status: 'ok', result: { rows: rows } } });
  const STALE = [{ name: 'spi_init_sequence.puml', status: 'stale' }];

  // BLK-reviewer-20260917-0023-wish: id はカテゴリの頭文字を持つようになった
  // (SVG は S-)。持ち越しの筋はそのまま、id の綴りだけを合わせる。
  // 1 tick 目。監査が「SVG が古い」を出し、reviewer が中身を見て判断を貼る。
  let s = tracker.update(tracker.emptyState(), { audits: svg(STALE), label: 'runs/20260914-2106', at: 'runs/20260914-2106' });
  const row = tracker.rows(s)[0];
  expect(row.id).toBe('S-01');
  expect(row.since).toBe('runs/20260914-2106');
  expect(tracker.statusText(row)).toBe('新規');

  const set = tracker.setVerdict(s, 'S-01', 'partial', 'puml 側は解消。svg 再エクスポートのみ継続', 'runs/20260914-2106');
  expect(set.ok).toBe(true);
  s = set.state;

  // 2 tick 目。監査はこの論点を落とす (別カテゴリへ移した回でも同じ)。
  s = tracker.update(s, { audits: svg([]), label: 'runs/20260914-2206', at: 'runs/20260914-2206' });
  expect(tracker.rows(s)[0].state).toBe('partial');

  // 3 tick 目。また出ても「再発」にはならない — ここが手順8 の往復を作っていた。
  s = tracker.update(s, { audits: svg(STALE), label: 'runs/20260914-2306', at: 'runs/20260914-2306' });
  const back = tracker.rows(s)[0];
  expect(back.state).toBe('partial');
  expect(back.note).toBe('puml 側は解消。svg 再エクスポートのみ継続');

  // 到達条件: 指摘.md の全文を書き直さず、該当行の状態を 1 つ更新するだけで済む。
  s = tracker.setVerdict(s, 'S-01', 'resolved', '再エクスポート確認', 'runs/20260914-2306').state;
  const done = tracker.rows(s)[0];
  expect(done.state).toBe('resolved');
  expect(done.open).toBe(false);

  // 表はそのまま 指摘.md に貼れる (id・状態・意図・初出・対象が 1 行に並ぶ)。
  // 「意図」は BLK-reviewer-20260915-0307-wish で入った列。図の側に意図的な省略と
  // 書いてあるかで、手書きしていた 対応済み / 未対応 の区別がそのまま出る。
  const md = tracker.markdown(s, '指摘トラッカー');
  expect(md).toContain('| id | 状態 | 意図 | 初出 | 対象 | 分類 | 備考 |');
  expect(md).toContain('| S-01 | 解消（判断） | 未対応 | runs/20260914-2106 |');
  expect(md).toContain('記録した tick: runs/20260914-2106 → runs/20260914-2206 → runs/20260914-2306');
});

// BLK-reviewer-20260914-2206: 手順8 は素の `--board` を 1 本打って読むだけのはずが、
// 「前回控えから変わった図 24 枚」を鵜呑みにできず、毎回 prev/ との手 diff で裏取り
// していた。根は、前回比較用の控えを CLI を打つ場所に 1 個だけ持ち、どの対象を渡した
// 回でも上書きしていたこと — 対象を切り替えて打つ (手順2 は junior,primary、手順8 は
// primary) だけで、図を 1 バイトも触っていない回が全枚「変わった」に化けていた。
test('手順8 対象を切り替えて打っても、変わった図の数が打つ順で変わらない', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cp = require('child_process');
  const audit = path.resolve(__dirname, '..', '..', '..', 'tools', 'audit.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-r08-'));
  const write = (dir, name, body) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), '@startuml\n' + body + '\n@enduml\n', 'utf-8');
  };
  const primary = path.join(root, 'primary');
  const junior = path.join(root, 'junior');
  write(primary, 'gpio_init_sequence.puml', 'participant Gpio_Driver\nGpio_Driver -> Gpio_Driver : Gpio_Init()');
  write(junior, 'spi_init_sequence.puml', 'participant Spi_Driver\nSpi_Driver -> Spi_Driver : Spi_Init()');
  // 手順8 の 1 本。cwd も一時フォルダにして、リポジトリ直下の控えを踏まない。
  const board = (...dirs) => {
    const r = cp.spawnSync(process.execPath, [audit, ...dirs, '--board'], { cwd: root, encoding: 'utf-8' });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  const changed = (out) => {
    const m = out.match(/前回控えから変わった図（(\d+) 枚）/);
    expect(m, out).toBeTruthy();
    return Number(m[1]);
  };
  try {
    board(primary);
    expect(changed(board(primary))).toBe(0);
    board(junior, primary);            // 手順2 の対象を挟む
    const after = board(primary);
    expect(changed(after)).toBe(0);    // 触っていないので 0 枚のまま
    // 何と比べた数字かが画面に出るので、prev/ との手 diff で裏取りしない。
    expect(after).toContain('前回控え:');
    expect(after).toContain(primary);
    // 本当に 1 枚触れば 1 枚出る (黙って 0 枚にしているのではない)。
    write(primary, 'gpio_init_sequence.puml',
      'participant Gpio_Driver\nGpio_Driver -> Gpio_Driver : Gpio_Init()\nGpio_Driver -> Gpio_Driver : Gpio_Reset()');
    const touched = board(primary);
    expect(changed(touched)).toBe(1);
    expect(touched).toContain('gpio_init_sequence.puml');
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
  }
});

// BLK-reviewer-20260914-2206 (差し戻し 1 回目): 素の `--board` 1 本で済ませたいのに、
// 「今回の新規 24 件」が毎 tick 出続けていた。中身は前 tick と同じ整合/イベントの行で、
// 指摘.md に書き落としているだけ。--board は「前回の指摘.md に書かれているか」で
// 新規を決めていたので、書き落とした指摘は永久に新規に出る。reviewer はそのたびに
// findings.js と prev/ で裏取りしていた。新規は前回の突合結果と実体 id
// (findings.js が継続を数えるのと同じ id) だけで決める。
test('手順8 前回も出ていた指摘は、指摘.md に書き落としていても新規に出ない', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cp = require('child_process');
  const audit = path.resolve(__dirname, '..', '..', '..', 'tools', 'audit.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-r08e-'));
  const primary = path.join(root, 'primary');
  const write = (name, body) => {
    fs.mkdirSync(primary, { recursive: true });
    fs.writeFileSync(path.join(primary, name), '@startuml\n' + body + '\n@enduml\n', 'utf-8');
  };
  write('driver_class.puml', 'class Timer {\n  +Timer_Init()\n}');
  write('timer_state.puml', '[*] --> Idle\nIdle --> Running : Timer_Start()\nRunning --> Idle : Timer_Stop()');
  const board = () => {
    const r = cp.spawnSync(process.execPath, [audit, primary, '--board'], { cwd: root, encoding: 'utf-8' });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  const fresh = (out) => {
    const m = out.match(/新規 (\d+) 件/);
    expect(m, out).toBeTruthy();
    return Number(m[1]);
  };
  try {
    // 1 回目は控えが無いので全部が新規 (初回はそう言い切る)。
    const first = board();
    expect(fresh(first)).toBeGreaterThan(0);
    expect(first).toContain('この対象の控えはありません');
    // 図を 1 バイトも触らずにもう 1 本。指摘.md は無い = 何も書き留めていない。
    const second = board();
    expect(fresh(second)).toBe(0);
    expect(second).toContain('前回の突合にもあった');
    expect(second).toContain('新規ではありません');
    // 何を根拠に新規を決めたかが画面に出るので、findings.js との手作業の突き合わせが要らない。
    expect(second).toContain('前回控えの突合結果と実体 id で比較');
    // 本当に新しい欠陥が出れば、ちゃんと新規に出る (黙って 0 件にしているのではない)。
    write('timer_state.puml',
      '[*] --> Idle\nIdle --> Running : Timer_Start()\nRunning --> Idle : Timer_Stop()\nRunning --> Fault : Timer_Fault()');
    const third = board();
    expect(fresh(third)).toBeGreaterThan(0);
    expect(third).toContain('Fault');
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
  }
});

// BLK-reviewer-20260916-0426: 前回の指摘の反映を見るのと同じ tick で、直前に done に
// なった BLK が効いているかも確かめる。これまではその 1 件ずつについて 100 行前後の
// 実装ログを全文読み、本文のどこかに書かれたコマンドを目で拾って打ち直していた。
// DSL に変化が無い tick でも確認自体は省けないので、同じ数件を毎 tick 読み直していた。
test('手順8 直前に done になった BLK は、本文を読まずに 1 本で確かめられる', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cp = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-r08b-'));
  const tool = path.join(__dirname, '..', '..', '..', 'tools', 'blk-check.js');
  const body = (id, extra) => ['---', 'id: ' + id, 'persona: reviewer', 'depth: friction',
    'status: done / merge: abc1234', 'builder: builder-1 run=20260916-0326',
    'task: ' + id + ' の穴', '---',
    // 実装ログは長い。読ませないのがこの手順の目的なので、長さも実物に寄せる。
    ...new Array(80).fill('実装の経緯。ここを毎 tick 読み直していた。'),
    '手順で打つコマンドは `node -e "console.log(process.argv[1])" <保存フォルダ>` のまま。',
    '',
    'できるようになったこと:',
    '出力に「' + extra + '」が出ます。',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'BLK-reviewer-20260916-0046.md'), body('BLK-reviewer-20260916-0046', '効き目A'), 'utf8');
  fs.writeFileSync(path.join(root, 'BLK-reviewer-20260916-0326-wish.md'), body('BLK-reviewer-20260916-0326-wish', '効き目B'), 'utf8');
  const run = (args) => {
    const r = cp.spawnSync(process.execPath, [tool, root, ...args], { cwd: root, encoding: 'utf-8' });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  try {
    // 1 本打てば、2 件が数行ずつのカードで出る。本文 (80 行超/件) は開かない。
    const first = run(['--no-state', '--all']);
    expect(first).toContain('BLK-reviewer-20260916-0046  done  merge abc1234');
    expect(first).toContain('確認コマンド: node -e');
    expect(first).toContain('出力に出るはず: 効き目A');
    expect(first).toContain('2 件を確認');
    // カードは本文よりはるかに短い (読み直しの置き換えになっている)。
    expect(first.split('\n').length).toBeLessThan(30);

    // --run を付ければ、本文のコマンドをこちらで打ち直さずに走り、
    // 「できるようになったこと」の語が出力に出たかまで言う。
    const ran = run(['--no-state', '--all', '--run', '--folder', '効き目A']);
    expect(ran).toContain('→ 実行: node -e');
    expect(ran).toContain('出た  : 「効き目A」');
    expect(ran).toContain('効いている (語 1/1)');
    // 語が出ない方は「消えた」と決めつけず、確認できずと言う。
    expect(ran).toContain('この出力では確認できず');

    // 控えを書けば、次の tick は新しく done になった分だけになる。
    run(['--all'].slice(1));            // 1 回目: 2 件を確認して控えに残す
    expect(run([])).toContain('新しく done になった BLK は無い');
    fs.writeFileSync(path.join(root, 'BLK-reviewer-20260916-0446.md'),
      body('BLK-reviewer-20260916-0446', '効き目C'), 'utf8');
    const next = run(['--no-state']);
    expect(next).toContain('BLK-reviewer-20260916-0446');
    expect(next).not.toContain('BLK-reviewer-20260916-0046  done');
    expect(next).toContain('1 件を確認');
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
  }
});

// BLK-reviewer-20260916-0629-wish: 指摘.md の確認依頼が primary に回答されたかを、
// --board (突合に出ない = 解消) に頼らず run ログから項目ごとに判定する。
// 「回答待ちリストを見る」だけで手順8が終わり、無回答の依頼が埋もれないことを到達条件にする。
test('手順8 指摘.md の各項目を primary の run ログと突き合わせ、未回答 N tick 目 / 回答済み / 判定できない を出す', () => {
  const fs2 = require('fs');
  const path2 = require('path');
  const { execFileSync } = require('child_process');
  const root = path2.join(__dirname, '..', '..', '..', 'test-results', 'reviewer-08-replies');
  fs2.rmSync(root, { recursive: true, force: true });
  const rev = path2.join(root, 'persona-data', 'reviewer');
  fs2.mkdirSync(rev, { recursive: true });
  fs2.writeFileSync(path2.join(rev, '指摘.md'), [
    '# reviewer 指摘',
    '## 最優先: diagram1.puml の domain-verdict 切替、意図確認は継続保留(3tick目)',
    '`domain-verdict: separate` の意図を primary に確認。`audit.js --board` は解消と出すが未回答。',
    '## メソッド不一致 F-01〜F-02 (継続)',
    'spi.puml',
    '## SVG',
    '古い 8 枚',
  ].join('\n'), 'utf8');
  const put = (ts, who, text) => {
    const d = path2.join(root, 'loop', 'runs', ts);
    fs2.mkdirSync(d, { recursive: true });
    fs2.writeFileSync(path2.join(d, who + '.md'), text, 'utf8');
  };
  put('20260916-0526', 'reviewer', 'diagram1.puml の domain-verdict 確認依頼。F-01〜F-02 継続');
  put('20260916-0626', 'reviewer', 'diagram1.puml の domain-verdict 未回答。F-01〜F-02 継続');
  put('20260916-0626', 'primary', '手順5.5: F-01〜F-02 は note で意図明記済み');
  put('20260916-2314', 'reviewer', 'diagram1.puml の\ndomain-verdict 未回答 3tick目');
  const tool = path2.join(__dirname, '..', '..', '..', 'tools', 'replies.js');
  const out = execFileSync(process.execPath, [tool, path2.join(rev, '指摘.md')], { encoding: 'utf8' });
  expect(out).toContain('回答待ち 1 件 / 回答済み 1 件 / 判定できない 1 件');
  expect(out).toMatch(/domain-verdict 切替、意図確認は継続保留 — まだ回答なし（3 tick 目、初出 runs\/20260916-0526）/);
  expect(out).toContain('runs/20260916-0626/primary.md で回答');
  expect(out).toContain('判定できない（解消ではない');
  // 初出は控えに持ち越す (次回 run ログが掃除されても tick 数が戻らない)。
  expect(fs2.existsSync(path2.join(rev, '.replies-state.json'))).toBe(true);
});

// BLK-reviewer-20260916-0629-friction: blk-check の「出ない / 確認できず」が、機能不良と
// 「今回は比べる変化が無かった」を区別しなかった。--board も確認依頼を「突合に出ない = 解消」と出していた。
// 無変化の回と失敗した回を出力だけで見分けられ、確認依頼は解消に数えないことを到達条件にする。
test('手順8 確認できなかった理由 (対象なし / コマンド失敗) を分けて言い、確認依頼は解消にしない', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cp = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-r08n-'));
  const tool = path.join(__dirname, '..', '..', '..', 'tools', 'blk-check.js');
  const body = (id, cmd) => ['---', 'id: ' + id, 'persona: reviewer', 'depth: blocked',
    'status: done / merge: abc1234', 'builder: builder-2 run=20260916-0546', 'task: ' + id, '---',
    '手順で打つコマンドは `' + cmd + '` のまま。', '',
    'できるようになったこと:', '出力に「変化の中身」の下に全文 diff が出ます。'].join('\n');
  // 無変化の回: audit.js --since-files が変わった図 0 枚のときに出す行と同じ語を出す。
  fs.writeFileSync(path.join(root, 'BLK-reviewer-20260916-0526-wish.md'),
    body('BLK-reviewer-20260916-0526-wish', 'node -e "console.log(String.fromCharCode(0x5bfe,0x8c61,0x306a,0x3057))" <保存フォルダ>'), 'utf8');
  // 失敗した回。
  fs.writeFileSync(path.join(root, 'BLK-reviewer-20260916-0527-wish.md'),
    body('BLK-reviewer-20260916-0527-wish', 'node -e "process.exit(3)" <保存フォルダ>'), 'utf8');
  try {
    const r = cp.spawnSync(process.execPath, [tool, root, '--no-state', '--all', '--run', '--folder', 'x'],
      { cwd: root, encoding: 'utf-8' });
    expect(r.status, r.stderr).toBe(0);
    const cut = r.stdout.indexOf('BLK-reviewer-20260916-0527-wish');
    const idle = r.stdout.slice(0, cut);
    const failed = r.stdout.slice(cut);
    expect(idle).toContain('今回は比べる対象が無いので確認できず (機能不良ではない');
    expect(failed).toContain('コマンドが失敗したため確認できず');
    expect(r.stdout).not.toContain('対象はあるのに語が出ない');
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
  }

  // --board: 本文中の確認依頼は、監査の突合に出なくても「解消」にしない。
  const 指摘2 = [
    '# reviewer 指摘',
    '',
    '## 最優先: diagram1.puml の domain-verdict 切替、意図確認は継続保留(4tick目)',
    '冒頭の `domain-verdict: separate` コメントは今回も内容変化なし。primary の回答待ち。',
  ].join('\n');
  const view = reviewBoard.build({ board: auditBoard.build({ findings: [] }), findings: 指摘2 });
  const md = reviewBoard.markdown(view, 'レビュー結果');
  expect(view.counts.resolved).toBe(0);
  expect(md).toContain('突合の対象外で判定できない (本文を読む)（1 件）');
  expect(md).toContain('（前回のまま 4 tick 目）');
});
