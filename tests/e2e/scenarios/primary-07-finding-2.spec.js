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

// BLK-human-20260912-0900: 足した図に指摘を反映するときも、プレビューでの選択が入口。
// ステレオタイプを付けた図でも、ステレオタイプ・ラベル・矢印のどこを押しても同じメッセージが選べること。
test('手順7 ステレオタイプ付きのシーケンスでも、ステレオタイプ・ラベル・矢印のどこを押しても同じメッセージが選べる', async ({ page }) => {
  await S.bootPlain(page);
  const dsl = ['@startuml', 'participant Adc_Driver', 'participant Hw_Ctrl',
    'Adc_Driver -> Hw_Ctrl : <<async>>' + String.fromCharCode(92) + 'nAdc_Driver_Init',
    'Hw_Ctrl --> Adc_Driver : Adc_Driver_Done', '@enduml'].join(String.fromCharCode(10));
  await S.expectMessageHitUniform(page, expect, dsl, 0);
});

// BLK-human-20260923-2002: 指摘 2 の反映で「途中の処理 (数本のメッセージと alt) が抜けている」とき、
// 「シーケンス構成をまとめて追加」を末尾ではなく選んだメッセージの後ろに入れる。
// 選んだのが帯の最後のメッセージなら既定は帯の外 (帯が伸びない)。入れた行は選ばれたままで、
// 続けてまとめて追加すれば前回の続き (end の後ろ) に入る。
const FOUR_SEQ = [
  '@startuml',
  'participant Adc_Driver',
  'participant Hw_Ctrl',
  'participant Dma',
  'Adc_Driver -> Hw_Ctrl : Adc_Start',
  'activate Hw_Ctrl',
  'Hw_Ctrl --> Adc_Driver : Adc_Started',
  'deactivate Hw_Ctrl',
  'Adc_Driver -> Dma : Dma_Setup',
  'Dma --> Adc_Driver : Dma_Ready',
  '@enduml',
].join('\n');

async function fillScMsg(page, j, from, arrow, to, text, inBlock) {
  await page.locator('#seq-sc-mfrom-' + j).selectOption(from);
  await page.locator('#seq-sc-marrow-' + j).selectOption(arrow);
  await page.locator('#seq-sc-mto-' + j).selectOption(to);
  await page.locator('#seq-sc-mtext-' + j).fill(text);
  if (inBlock) await page.locator('#seq-sc-mblock-' + j).selectOption(inBlock);
}

test('手順7 まとめて追加を選んだメッセージの後ろに入れ、3 本と alt が 2 本目と 3 本目の間に入って帯が伸びない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, FOUR_SEQ);
  await page.waitForTimeout(1800);

  // 4 本のうち 2 本目 (7 行目、Hw_Ctrl の帯の最後) を実マウスで選び、「この後にまとめて追加」。
  await page.locator('#overlay-layer rect[data-type="message"][data-line="7"]').click();
  await page.waitForTimeout(400);
  await page.locator('.seq-scaffold-after').first().click();
  await expect(page.locator('#seq-sc-modal')).toBeVisible();

  // 挿入先がフォームに文字で出る。帯の末尾なので既定は帯の外。
  const where = await page.locator('#seq-sc-where').textContent();
  expect(where).toContain('`Hw_Ctrl --> Adc_Driver : Adc_Started` の後');
  expect(where).toContain('帯の外側');

  await fillScMsg(page, 0, 'Adc_Driver', 'sync', 'Dma', 'Dma_Check', '');
  await fillScMsg(page, 1, 'Dma', 'reply', 'Adc_Driver', 'Dma_Ok', 'main');
  await fillScMsg(page, 2, 'Dma', 'reply', 'Adc_Driver', 'Dma_Ng', 'else');
  await page.locator('#seq-sc-block-label').fill('空きあり');
  await page.locator('#seq-sc-else-label').fill('空きなし');
  await page.locator('#seq-sc-confirm').click();
  await page.waitForTimeout(1000);

  const lines = (await editorText(page)).split('\n').map((s) => s.trim());
  const i2 = lines.indexOf('Hw_Ctrl --> Adc_Driver : Adc_Started');
  const i3 = lines.indexOf('Adc_Driver -> Dma : Dma_Setup');
  expect(lines.slice(i2 + 1, i3)).toEqual([
    'deactivate Hw_Ctrl',
    'Adc_Driver -> Dma : Dma_Check',
    'alt 空きあり',
    'Dma --> Adc_Driver : Dma_Ok',
    'else 空きなし',
    'Dma --> Adc_Driver : Dma_Ng',
    'end',
  ]);
  // 帯は伸びていない (deactivate は 2 本目の直後のまま、1 組のまま)。
  expect(lines.filter((l) => l === 'activate Hw_Ctrl').length).toBe(1);
  expect(lines.filter((l) => l === 'deactivate Hw_Ctrl').length).toBe(1);
  // 宣言は参加者の欄のまま (本文の途中に散っていない)。
  expect(lines.slice(1, 4)).toEqual(['participant Adc_Driver', 'participant Hw_Ctrl', 'participant Dma']);

  // 追加した 3 本がプレビューで選ばれている。
  await expect(page.locator('#overlay-layer rect.selectable.selected[data-type="message"]')).toHaveCount(3);

  // 連続入力: 選んだまま「この後にまとめて追加」を開くと、前回の続き (end の後ろ) に入る。
  await page.locator('.seq-scaffold-after').first().click();
  await expect(page.locator('#seq-sc-modal')).toBeVisible();
  expect(await page.locator('#seq-sc-where').textContent()).toContain('`end` の後');
  await fillScMsg(page, 0, 'Adc_Driver', 'sync', 'Dma', 'Dma_Retry', '');
  await page.locator('#seq-sc-confirm').click();
  await page.waitForTimeout(1000);
  const after = (await editorText(page)).split('\n').map((s) => s.trim());
  const iEnd = after.indexOf('end');
  expect(after.slice(iEnd, iEnd + 3)).toEqual(['end', 'Adc_Driver -> Dma : Dma_Retry', 'Adc_Driver -> Dma : Dma_Setup']);
});
