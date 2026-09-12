// @ts-check
// primary 台本 手順7: レビュー指摘 2 があれば反映する。
// 指摘 2 は「新規の部品はシーケンス・状態遷移・クラスの 3 枚を揃える」型の指摘。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順7 指摘 2(部品の 3 枚が揃っていない)を、図を足して埋められる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // ADC はシーケンスしかなく、状態遷移が無い = 指摘 2。
  await S.putDoc(page, DIR, 'adc_init_sequence', S.docFor('adc_init_sequence'));
  expect(await S.listDir(page, DIR)).not.toContain('adc_state');

  await S.typeDsl(page, S.docFor('adc_state'));
  await S.renameActive(page, 'adc_state');
  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);

  // 到達条件: 足りなかった図が保存先に増え、部品名が既存図と揃っている。
  const names = await S.listDir(page, DIR);
  expect(names).toContain('adc_state');
  expect(await S.readDoc(page, DIR, 'adc_state')).toContain('Adc_Driver');
});

// BLK-human-20260912-0901: 指摘 2 の反映で「足りないメッセージを図の途中に足す」とき、
// その図に activate / deactivate (実行中の帯) があると、矢印が帯の開始と切り離されたり
// 帯の内側に入るつもりの矢印が deactivate の後ろに落ちたりしていた。
// 帯付きの図でも途中挿入が帯を壊さないことを、手順 7 の条件として守る。
const BAND_SEQ = [
  '@startuml',
  'title ADC 初期化シーケンス',
  'participant Adc_Driver',
  'participant Hw_Ctrl',
  'Adc_Driver -> Hw_Ctrl : Adc_Driver_Init',
  'activate Hw_Ctrl',
  'Hw_Ctrl -> Hw_Ctrl : SelfCheck',
  'deactivate Hw_Ctrl',
  'Hw_Ctrl --> Adc_Driver : Adc_Driver_Done',
  '@enduml',
].join('\n');

// overlay の rect を data-line で選ぶ (どの矢印かを座標に頼らず決める)。
async function selectMessageLine(page, line) {
  await page.evaluate((ln) => {
    const el = document.querySelector('#overlay-layer rect[data-type="message"][data-line="' + ln + '"]');
    if (!el) throw new Error('line ' + ln + ' の message rect が無い');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, line);
  await page.waitForTimeout(400);
}

async function editorText(page) {
  return page.evaluate(() => document.getElementById('editor').value);
}

test('手順7 activate のある図でも、途中挿入した矢印が帯を壊さない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, BAND_SEQ);
  await page.waitForTimeout(1800);

  // 帯の起点になっているメッセージ (5 行目) を選び、「この後にメッセージ追加」。
  await selectMessageLine(page, 5);
  await page.locator('.seq-insert-msg-after').first().click();
  await expect(page.locator('#seq-modal')).toBeVisible();

  // 挿入先の見出しに「帯の内側」が出る (どちらに入るか分かる表示)。
  const target = await page.locator('#seq-mod-target').textContent();
  expect(target).toContain('帯の内側');
  expect(target).toContain('DSL 7 行目に挿入');

  await page.locator('#seq-mod-from').selectOption('Hw_Ctrl');
  await page.locator('#seq-mod-to').selectOption('Hw_Ctrl');
  await page.locator('#seq-mod-label-rle textarea, #seq-mod-label-rle input').first().fill('ClockCheck');
  await page.locator('#seq-mod-confirm').click();
  await page.waitForTimeout(800);

  const lines = (await editorText(page)).split('\n').map((s) => s.trim());
  const iTrigger = lines.indexOf('Adc_Driver -> Hw_Ctrl : Adc_Driver_Init');
  const iActivate = lines.indexOf('activate Hw_Ctrl');
  const iNew = lines.findIndex((l) => l.indexOf('ClockCheck') >= 0);
  const iDeactivate = lines.indexOf('deactivate Hw_Ctrl');
  expect(iNew).toBeGreaterThan(-1);
  // 帯の開始は起点メッセージの直後のまま (矢印が割り込んでいない)。
  expect(iActivate).toBe(iTrigger + 1);
  // 新しい矢印は帯の内側 (activate の後・deactivate の前)。
  expect(iNew).toBeGreaterThan(iActivate);
  expect(iNew).toBeLessThan(iDeactivate);
  // 帯は 1 組のまま (二重に重なっていない)。
  expect(lines.filter((l) => l === 'activate Hw_Ctrl').length).toBe(1);
  expect(lines.filter((l) => l === 'deactivate Hw_Ctrl').length).toBe(1);
});

test('手順7 deactivate の後を指したときは帯の外に入る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, BAND_SEQ);
  await page.waitForTimeout(1800);

  // 帯の中の最後のメッセージ (7 行目) ではなく、帯を出た後のメッセージ (9 行目) の前に足す。
  await selectMessageLine(page, 9);
  await page.locator('.seq-insert-msg-before').first().click();
  await expect(page.locator('#seq-modal')).toBeVisible();
  const target = await page.locator('#seq-mod-target').textContent();
  expect(target).toContain('帯の外側');

  await page.locator('#seq-mod-from').selectOption('Hw_Ctrl');
  await page.locator('#seq-mod-to').selectOption('Adc_Driver');
  await page.locator('#seq-mod-label-rle textarea, #seq-mod-label-rle input').first().fill('Notify');
  await page.locator('#seq-mod-confirm').click();
  await page.waitForTimeout(800);

  const lines = (await editorText(page)).split('\n').map((s) => s.trim());
  expect(lines.findIndex((l) => l.indexOf('Notify') >= 0))
    .toBeGreaterThan(lines.indexOf('deactivate Hw_Ctrl'));
});
