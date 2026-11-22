// @ts-check
// TICKET-owner-20261115-1900-1: 「末尾に追加」で 1 件足した直後、手が欄に残ったまま Ctrl+Z を押すと
// 図の Undo が効かなかった (欄のネイティブ undo に回り、欄は空で何も起きない)。
// 期待 (principles「Undo は 1 操作単位」、primary 手順 4 の「Undo で 1 操作ずつ戻す」):
//   - 6 図種それぞれ、欄で Enter で 1 件足し、欄から手を離さずに Ctrl+Z → 本文が足す前とバイト一致
//   - 続く Ctrl+Y で足した後に戻る
//   - 欄に 1 字打ってからの Ctrl+Z は欄の字を戻すだけで、本文は変えない
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const CASES = [
  { type: 'plantuml-sequence', kind: 'seq', chip: 'participant', field: '#seq-tail-alias', value: 'Zed',
    dsl: '@startuml\nparticipant A\nparticipant B\nA -> B : go\n@enduml' },
  { type: 'plantuml-state', kind: 'st', chip: 'state', field: '#st-tail-id', value: 'Zed',
    dsl: '@startuml\n[*] --> Idle\nIdle --> Busy : go\n@enduml' },
  { type: 'plantuml-class', kind: 'cl', chip: 'class', field: '#cl-tail-alias', value: 'Zed',
    dsl: '@startuml\nclass A\nclass B\nA --> B\n@enduml' },
  { type: 'plantuml-component', kind: 'co', chip: 'component', field: '#co-tail-alias', value: 'Zed',
    dsl: '@startuml\ncomponent A\ncomponent B\nA ..> B\n@enduml' },
  { type: 'plantuml-activity', kind: 'ac', chip: 'action', field: '#ac-tail-text', value: 'Zed する',
    dsl: '@startuml\nstart\n:A する;\nstop\n@enduml' },
  { type: 'plantuml-usecase', kind: 'uc', chip: 'actor', field: '#uc-tail-alias', value: 'Zed',
    dsl: '@startuml\nactor User\nusecase (Send)\nUser --> (Send)\n@enduml' },
];

for (const c of CASES) {
  test('owner 1900 ' + c.type + ': 欄で Enter で足した直後の Ctrl+Z / Ctrl+Y は図の Undo / Redo', async ({ page }, testInfo) => {
    await H.bootWith(page, null);
    await page.locator('#diagram-type').selectOption(c.type);
    await page.waitForTimeout(300);
    await H.setText(page, c.dsl);
    await page.locator('#props-tab-props').click();
    const chip = page.locator('#' + c.kind + '-tail-kind-chip-' + c.chip);
    if (await chip.count()) await chip.click();
    const before = await H.getEditorText(page);

    const field = page.locator(c.field);
    await field.fill(c.value);
    await field.press('Enter');
    await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).not.toBe(before);
    const after = await H.getEditorText(page);
    expect(after).toContain(c.value);
    H.annotate(testInfo, 'diffLines', H.diffLines(before, after));

    // 手は欄に残ったまま (blur しない)。
    const tag = await page.evaluate(() => (document.activeElement && document.activeElement.tagName) || '');
    expect(['INPUT', 'TEXTAREA', 'SELECT']).toContain(tag);
    await page.keyboard.press('Control+z');
    await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(before);
    await page.keyboard.press('Control+y');
    await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(after);
  });
}

test('owner 1900: 欄に 1 字打ってからの Ctrl+Z は欄の字を戻し、本文は変えない', async ({ page }) => {
  await H.bootWith(page, null);
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(300);
  await H.setText(page, CASES[0].dsl);
  await page.locator('#props-tab-props').click();
  const chip = page.locator('#seq-tail-kind-chip-participant');
  if (await chip.count()) await chip.click();
  const field = page.locator('#seq-tail-alias');
  await field.fill('Zed');
  await field.press('Enter');
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toContain('Zed');
  const after = await H.getEditorText(page);
  // 欄に打ち始めた後の Ctrl+Z は欄のもの。
  await field.pressSequentially('Q');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  expect(await H.getEditorText(page)).toBe(after);
});
