// @ts-check
// primary 台本 手順6: レビュー指摘 1 があれば反映する。
// 指摘は「図名・行・内容」で来るので、行を指されたらそこへ跳べることが入口になる。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順6 指摘 1(図名・行・内容)の行へ跳んで直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'irq_state', S.docFor('irq_state'));
  await S.openFolderItem(page, 'irq_state');

  // 指摘 1: 遷移ラベル Irq_Driver_Write は実在しないので Irq_Driver_Enable に直す。
  const before = await page.locator('#editor').inputValue();
  expect(before).toContain('Irq_Driver_Write');
  await S.typeDsl(page, before.replace('Irq_Driver_Write', 'Irq_Driver_Enable'));
  // 直す目的で開いた図なので、錠の問いには「このファイルを書き換える」で答える。
  await S.overwriteOpenedFile(page);
  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1500);

  // 到達条件: 指摘された名前が保存先の図から消えている。
  const after = await S.readDoc(page, DIR, 'irq_state');
  expect(after).toContain('Irq_Driver_Enable');
  expect(after).not.toContain('Irq_Driver_Write');
});

// BLK-human-20260912-0900: 指摘を反映するときはまずプレビューでその要素を選ぶ。
// autonumber を付けた図でも、番号・ラベル・矢印のどこを押しても同じメッセージが選べること。
test('手順6 autonumber 付きのシーケンスでも、番号・ラベル・矢印のどこを押しても同じメッセージが選べる', async ({ page }) => {
  await S.bootPlain(page);
  const dsl = ['@startuml', 'autonumber', 'participant Irq_Driver', 'participant Hw_Ctrl',
    'Irq_Driver -> Hw_Ctrl : Irq_Driver_Enable',
    'Hw_Ctrl --> Irq_Driver : Irq_Driver_Done', '@enduml'].join(String.fromCharCode(10));
  await S.expectMessageHitUniform(page, expect, dsl, 0);
});
