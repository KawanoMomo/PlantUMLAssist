// @ts-check
// reviewer 台本 手順4: クラス図のクラス名が、シーケンスの participant 名と一致するか突合する。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');
const { loadMA } = require('../../../tools/audit-runtime');

test('手順4 クラス名と participant 名の食い違いを挙げられる', () => {
  const classes = R.classNames(R.DOCS.driver_common_class);
  expect(classes).toContain('Gpio_Driver');
  const parts = R.participants(R.DOCS.gpio_init_sequence);
  // 到達条件: クラス図にある Gpio_Driver がシーケンスに無い(GpioDrv になっている)と言える。
  expect(parts).not.toContain('Gpio_Driver');
  expect(parts).toContain('GpioDrv');
  const unmatched = classes.filter((c) => !parts.includes(c) && /Gpio/.test(c));
  expect(unmatched).toEqual(['Gpio_Driver']);
});

// ── BLK-reviewer-20260912-2206-wish ─────────────────────────────────────
// 成長規則で対象が junior のフォルダにも広がった回、junior と primary の
// 同名ファイル (gpio_init_sequence.puml) で participant 名 (Gpio / Gpio_Driver) と
// 粒度が食い違っているのを見つけたが、GUI にはこの 2 枚を並べて見る手段が無く、
// persona-data の 2 フォルダから同名ファイルを自分でテキストとして開いて
// 読み比べるしかなかった。同名で組み、本文を左右に並べ、食い違う語だけを
// 光らせられることを到達条件にする。

const JDIR = S.dirFor(__filename) + '-junior';
const PDIR = S.dirFor(__filename) + '-primary';
// 覚える必要の無い、実際のフォルダ名 (覚き先の一覧に出るのはフォルダ名そのもの)。
const JF = JDIR.slice(JDIR.lastIndexOf('/') + 1);
const PF = PDIR.slice(PDIR.lastIndexOf('/') + 1);
const BASE = 'sbs_gpio_init_sequence';

const J_DSL = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio', 'participant Hw_Ctrl',
  'Gpio -> Hw_Ctrl : Gpio_Init', 'Hw_Ctrl --> Gpio : Gpio_Done', '@enduml'].join('\n');
const P_DSL = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', 'Gpio_Driver -> Hw_Ctrl : Gpio_SetMode',
  'Hw_Ctrl --> Gpio_Driver : Gpio_Done', '@enduml'].join('\n');

test('手順4 2 人の同名ファイルを、探さずに組んで食い違う語だけ指せる', () => {
  const { MA } = loadMA();
  expect(MA.sideBySide).toBeTruthy();

  const docs = [
    { name: `junior/${BASE}.puml`, dsl: J_DSL },
    { name: `primary/${BASE}.puml`, dsl: P_DSL },
    { name: 'junior/spi_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
  ];
  const pairs = MA.sideBySide.pairsByFile(docs);
  // 到達条件 1: 同じファイル名の組が、名前で推測せずに 1 件出る。
  expect(pairs.length).toBe(1);
  expect(MA.sideBySide.headerLabel(pairs[0])).toBe(`${BASE}: junior ⇔ primary`);

  const a = { name: pairs[0].a.name, dsl: J_DSL };
  const b = { name: pairs[0].b.name, dsl: P_DSL };
  const marks = MA.sideBySide.marks(a, b);
  // 到達条件 2: Gpio と Gpio_Driver が「同じものの綴り違い」として 1 件に組まれる
  // (「片方にしか無い語が 2 つ」と出されると、どれとどれが対応するかは結局本文で決めることになる)。
  expect(marks.left['Gpio'].status).toBe('spelling');
  expect(marks.left['Gpio'].right).toBe('Gpio_Driver');
  // 揃っている語には印が付かない。
  expect(marks.left['Hw_Ctrl'].status).toBe('same');

  // 到達条件 3: 粒度の差 (primary にしか無いメッセージ) が段の増減として出る。
  const rows = MA.sideBySide.rows(a, b);
  const onlyRight = rows.filter((r) => r.kind === 'only-right');
  expect(onlyRight.length).toBe(1);
  expect(onlyRight[0].right).toContain('Gpio_SetMode');
  // 到達条件 4: 指摘に書ける 1 行が、この 1 回の呼び出しから出る。
  expect(MA.sideBySide.summaryLine(a, b)).toContain('Gpio / Gpio_Driver');
});

test('手順4 同名の 2 枚を画面で並べ、揃える綴りをその場で当てられる', async ({ page }) => {
  await S.bootWithSaveDir(page, JDIR);
  await S.clearDir(page, JDIR);
  await S.clearDir(page, PDIR);
  await S.putDoc(page, JDIR, BASE, J_DSL);
  await S.putDoc(page, PDIR, BASE, P_DSL);

  // 覗く画面を開き、同名で並べる (ここまで 2 クリック)。
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal', { state: 'visible' });
  await page.locator('#peek-sbs-toggle').click();
  await page.locator(`#peek-dirs [data-sbs-pair="${BASE}"]`).first().click();
  await page.waitForSelector('#sbs-grid');

  // 到達条件 1: 2 人の本文が左右に並び、どちらがどのフォルダかが見出しに出る。
  await expect(page.locator('#sbs-head')).toHaveText(`${BASE}: ${JF} ⇔ ${PF}`);
  const grid = page.locator('#sbs-grid');
  await expect(grid).toContainText('participant Gpio_Driver');
  await expect(grid).toContainText('Gpio_SetMode');

  // 到達条件 2: 食い違う語だけが光る (揃っている Hw_Ctrl には印が付かない)。
  const marked = grid.locator('.sbs-mark');
  expect(await marked.count()).toBeGreaterThan(0);
  const markedTexts = await marked.allTextContents();
  expect(markedTexts).toContain('Gpio');
  expect(markedTexts).toContain('Gpio_Driver');
  expect(markedTexts).not.toContain('Hw_Ctrl');
  await expect(page.locator('#sbs-summary')).toContainText('Gpio / Gpio_Driver');

  // 到達条件 3: 片方にしか無い行は、片側が空の段として出る。
  await expect(grid.locator('.sbs-text.sbs-gap').first()).toBeVisible();

  // 到達条件 4: どちらの綴りに揃えるかをその場で当てられる (自分の保存フォルダの図だけ)。
  await page.locator('[data-sbs-align-to="Gpio_Driver"]').first().click();
  await expect(page.locator('#sbs-summary')).toContainText('Gpio → Gpio_Driver');
  const saved = await S.readDoc(page, JDIR, BASE);
  expect(saved).toContain('participant Gpio_Driver');
  expect(saved).not.toContain('participant Gpio\n');
});
