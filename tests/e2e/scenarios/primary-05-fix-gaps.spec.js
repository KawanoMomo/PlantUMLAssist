// @ts-check
// primary 台本 手順5: 並べた変更のうち、既存の reviewer 指摘と符合する欠落があれば直す。
// 直し漏れがあれば直す(漏れが無ければ「反映済み」を run ログに残す)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5 直し漏れ(旧名の残存)が横断で見つかり、その場で直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // spi_init_sequence だけ直っていて、spi_state と共通クラス図に旧名が残っている = 直し漏れ。
  await S.putDoc(page, DIR, 'spi_init_sequence', S.docFor('spi_init_sequence'));
  for (const n of ['spi_state', 'driver_common_class']) {
    await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  }
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(1200);

  // 到達条件その1: 旧名の宣言が残っている図が、件数つきで名指しで出る。
  const folder = page.locator('#rename-folder');
  await expect(folder).toContainText('driver_common_class');
  const listed = (await folder.textContent()) || '';
  expect(listed).toMatch(/driver_common_class\s*1\s*件/);

  // 到達条件その2: すでに直っている図は 0 件と出て、直す対象から外れる。
  expect(listed).toMatch(/spi_init_sequence(開いている)?\s*0\s*件/);

  // 到達条件その3: 漏れが残っているあいだは適用に進める。
  // (適用そのものが保存先へ書き戻ることは 手順2 の spec が受け持つ)
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
});

// BLK-primary-20260914-1406: 手順5.5 (指摘反映の保存)。file backend にして 💾 保存を
// 押しても本体の中身が変わらない、という詰まりが 3 周続いた。書かれてはいたが、
// 書かれた先が `{名前}-編集中.puml` だった (source-lock の「元ファイルは変更前のまま保つ」に
// 既定で付く「開いている他のファイルも同じ扱い」が、以後に開く図を黙って控えへ逸らす)。
// ここで守るのは「逸れたら保存のその場で言うこと」と「1 押しで本体に入ること」。
test('手順5.5 保存が控えへ逸れたらその場で名指しされ、1 押しで本体に入る', async ({ page }) => {
  const DIR2 = DIR + '-redirect';
  await S.bootWithSaveDir(page, DIR2);
  await S.clearDir(page, DIR2);
  const BASE = ['@startuml', 'class AdcRegs', 'class SpiRegs', '@enduml'].join('\n');
  await S.putDoc(page, DIR2, 'driver_common_class', BASE);
  await S.putDoc(page, DIR2, 'plantuml-usecase', BASE);

  // 1 枚目: 「元ファイルは変更前のまま保つ」を選ぶ (既定で「他のファイルも同じ扱い」が付く)。
  await S.openFolderItem(page, 'driver_common_class');
  await S.typeDsl(page, BASE + '\nclass Keep');
  await page.waitForTimeout(900);
  const modal = page.locator('#source-lock-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#source-lock-all')).toBeChecked();
  await page.locator('#source-lock-keep').click();
  await page.waitForTimeout(900);

  // 2 枚目: もう何も聞かれない。編集して 💾 保存を押す。
  await S.openFolderItem(page, 'plantuml-usecase');
  await S.typeDsl(page, BASE + '\nclass WriteConfig');
  await page.waitForTimeout(900);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(1500);

  // 到達条件その1: 書いた先と、変わっていない本体の両方が帯で名指しされる。
  const band = page.locator('#save-redirect-overlay');
  await expect(band).toBeVisible();
  await expect(page.locator('#srd-summary')).toContainText('plantuml-usecase-編集中.puml に書きました');
  await expect(page.locator('#srd-summary')).toContainText('plantuml-usecase.puml は変更前のままです');
  // 実際、この時点の本体はまだ編集前のまま (詰まりの再現)。
  expect(await S.readDoc(page, DIR2, 'plantuml-usecase')).not.toContain('WriteConfig');

  // 到達条件その2: [本体に書く] の 1 押しでディスクの本体が今の本文になる。
  await page.locator('#btn-srd-overwrite').click();
  await page.waitForTimeout(1500);
  await expect(band).toBeHidden();
  expect(await S.readDoc(page, DIR2, 'plantuml-usecase')).toContain('WriteConfig');

  // 到達条件その3: 以後この図の保存は本体へ入る (押すたびに逸れ直さない)。
  await S.typeDsl(page, BASE + '\nclass WriteConfig\nclass EnableDmaReq');
  await page.waitForTimeout(900);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(1500);
  await expect(band).toBeHidden();
  expect(await S.readDoc(page, DIR2, 'plantuml-usecase')).toContain('EnableDmaReq');
});

// BLK-primary-20260914-2206: 手順5.5 (指摘反映の保存)。一覧から開いた図の DSL 欄に
// note を打っても、保存フォルダの .puml が何分待っても変わらない。自動保存は錠の
// 返事を待って 1 度もディスクへ写しておらず、それでも状態バーの 💾 は「たった今」と
// 出続けていた —— 「保存した」と「ファイルが変わった」が同じ 1 語だったのが詰まりの本体。
// ここで守るのは「書けていない回はそう言うこと」と「その場で返事を求めて先へ進めること」。
test('手順5.5 ディスクに書けていない保存は 💾 がそう言い、その場で答えれば本体に入る', async ({ page }) => {
  const DIR3 = DIR + '-pending';
  await S.bootWithSaveDir(page, DIR3);
  await S.clearDir(page, DIR3);
  const BASE = ['@startuml', 'class ClockCtrl', 'class NVIC', '@enduml'].join('\n');
  await S.putDoc(page, DIR3, 'driver_common_class', BASE);

  await S.openFolderItem(page, 'driver_common_class');
  // 依頼2 への回答を DSL 欄の末尾に打つ (ペルソナと同じ経路)。
  await S.typeDsl(page, BASE + '\nnote top of ClockCtrl : 呼び先は意図的に省略');
  await page.waitForTimeout(1500);

  // 到達条件その1: 打った内容はまだディスクに無い。状態バーはそれを「たった今保存」と
  // 言わず、どのファイルに書けていないのかを名指しする。
  expect(await S.readDoc(page, DIR3, 'driver_common_class')).not.toContain('note top of ClockCtrl');
  const badge = page.locator('#status-autosave');
  await expect(badge).toContainText('未保存');
  await expect(badge).toContainText('driver_common_class.puml');

  // 到達条件その2: 止まっている理由 (錠の返事待ち) がその場に出ていて、答えられる。
  await expect(page.locator('#source-lock-modal')).toBeVisible();
  await page.locator('#source-lock-overwrite').click();
  await page.waitForTimeout(1500);

  // 到達条件その3: 答えた分がディスクの本体に入り、💾 は書けた先を名乗る。
  expect(await S.readDoc(page, DIR3, 'driver_common_class')).toContain('note top of ClockCtrl');
  await expect(badge).not.toContainText('未保存');
  await expect(badge).toContainText('driver_common_class.puml');
  // design 9c (BLK-builder-20260924-1336-3): 保存状態は「13:31 に自動保存 · 名前」の文字だけ。💾 を付けない。
  await expect(badge).toHaveText(/^\d{2}:\d{2} に自動保存 · driver_common_class\.puml$/);

  // 到達条件その4: 以後の追記は黙って本体へ入る (毎回止まらない)。
  await S.typeDsl(page, BASE + '\nnote top of ClockCtrl : 呼び先は意図的に省略\nnote top of NVIC : 割り込み設定');
  await page.waitForTimeout(1500);
  expect(await S.readDoc(page, DIR3, 'driver_common_class')).toContain('note top of NVIC');
});
