// @ts-check
// reviewer 台本 手順5: 前回 run の控えと比べ、意図しない変更(無関係な行の差分・整形だけの差分)が
// 混ざっていないか確認する。今回の DSL も控える。
//
// BLK-reviewer-20260912-2103-wish: 手順5 で見つかる事故のうち「中身がファイルを
// またいで入れ替わった」ものは、前回 run の控えとのバイト比較でしか掘り起こせず、
// 書いた本人 (primary) は気付いていなかった。保存したその場で GUI が言うようにした。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// 7 クラス・メソッド付きの図 (事故の前の driver_common_class に相当)。
const FULL_CLASS = ['@startuml', 'title driver_common_class'].concat(
  ['Spi_Driver', 'Can_Driver', 'Gpio_Driver', 'Irq_Driver', 'Uart_Driver', 'Adc_Driver', 'Timer_Driver']
    .map((c) => `class ${c} {\n  +Init()\n  +DeInit()\n  +Read()\n}`)
).concat(['@enduml']).join('\n');

// 別名で保存フォルダに居る雛形 (事故の後の中身と完全一致するもの)。
const TEMPLATE_CLASS = ['@startuml', 'class Foo', '@enduml'].join('\n');

function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) out.push({ line: i + 1, before: a[i], after: b[i] });
  }
  return out;
}

test('手順5 意図した差分と、整形だけの差分を分けて言える', () => {
  const before = R.DOCS.spi_state;
  // 意図した変更: 遷移ラベルを 1 つ直した。
  const intended = before.replace('Spi_Driver_Write', 'Spi_Driver_Send');
  // 意図しない変更: 各行の末尾に空白を足しただけ(整形差)。
  const cosmetic = before.split('\n').map((l) => l + ' ').join('\n');

  const d1 = diffLines(before, intended);
  expect(d1.length).toBe(1);
  expect(d1[0].after).toContain('Spi_Driver_Send');

  const d2 = diffLines(before, cosmetic);
  // 到達条件: 整形だけの差は、trim すると 1 件も残らない。
  expect(d2.length).toBeGreaterThan(0);
  expect(d2.filter((d) => (d.before || '').trim() !== (d.after || '').trim())).toEqual([]);
});

test('手順5 中身が別名の図と入れ替わった保存を、その場で名指しできる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 保存フォルダの前提: 中身の詰まった図と、その中身が入り込んでしまった別名の図。
  // BLK-primary-20260913-0306 までは、この「別名にも同じ中身が入る」状態を
  // 自動保存の図種キーが勝手に作っていたので、下ごしらえでは雛形を置くだけで
  // 事故の形が出来ていた。書き先を図の名前にした今は勝手には起きないので、
  // reviewer が見つけた事故の形 (中身が別名の図と一致している) をここで用意する。
  await S.putDoc(page, DIR, 'driver_common_class', FULL_CLASS);
  await S.putDoc(page, DIR, 'plantuml-class', FULL_CLASS);
  await S.openFolderItem(page, 'driver_common_class');
  await S.overwriteOpenedFile(page);

  await S.typeDsl(page, FULL_CLASS);
  await page.locator('#btn-save').dispatchEvent('click');   // 上部バーから外れているので直接叩く
  await page.waitForTimeout(1800);

  // 到達条件その1: 保存した本人の画面に、その場で警告が出る。
  // (この保存は実際に driver_common_class の中身を別名の plantuml-class にも書いており、
  //  reviewer が前回 run のバイト比較で掘り起こしたのと同じ形の事故がここで起きている)
  const warn = page.locator('#save-swap-overlay');
  await expect(warn).toBeVisible();
  await expect(warn).toHaveAttribute('data-warn', '1');
  await expect(page.locator('#ssw-summary')).toContainText('driver_common_class');
  // 到達条件その2: 一致した相手のファイル名を名指しする (バイト比較で掘らなくてよい)。
  await expect(page.locator('#ssw-list')).toContainText('plantuml-class');

  // 事故の続き: 中身が雛形に入れ替わった状態で保存すると、行の激減も同時に言う。
  await S.typeDsl(page, TEMPLATE_CLASS);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(1800);
  await expect(warn).toHaveAttribute('data-warn', '1');
  await expect(page.locator('#ssw-list')).toContainText('行に減りました');

  // 到達条件その3: 「どの保存操作が起こしたか」を、ファイル名込みで後から辿れる。
  await page.locator('#btn-ssw-log').click();
  await page.waitForTimeout(400);
  const log = page.locator('#ssw-log');
  await expect(log).toBeVisible();
  await expect(log.locator('li').first()).toContainText('driver_common_class');
  // 直前の保存も残っている (事故の直前に何を保存したかが欠けない)。
  expect(await log.locator('li').count()).toBeGreaterThan(1);
});
