// @ts-check
// TICKET-owner-20261123-0842-2: 「末尾に追加」で名前を空のまま「+ 追加」を押したときの知らせを、
// 欄の見出しの語で 6 図種同じ形に言う。
// 期待: 知らせに画面に無い語 (Alias / ID / Target) が無く、欄の見出しの語 (名前 / 名前 (識別子)) を含む。
//       知らせの後、手は空だった欄に入る。本文は変わらない。
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const KINDS = [
  { kind: 'sequence', dsl: '@startuml\nparticipant A\nA -> A : hi\n@enduml', words: ['hi'], field: 'seq-tail-alias', add: 'seq-tail-add', chip: 'participant' },
  { kind: 'usecase', dsl: '@startuml\nactor User\nusecase "Login" as UC1\nUser --> UC1\n@enduml', words: ['Login'], field: 'uc-tail-alias', add: 'uc-tail-add', chip: 'actor' },
  { kind: 'component', dsl: '@startuml\ncomponent App\ncomponent Lib\nApp ..> Lib\n@enduml', words: ['Lib'], field: 'co-tail-alias', add: 'co-tail-add', chip: 'component' },
  { kind: 'class', dsl: '@startuml\nclass Foo\nclass Bar\nFoo --> Bar\n@enduml', words: ['Bar'], field: 'cl-tail-alias', add: 'cl-tail-add', chip: 'class' },
  { kind: 'state', dsl: '@startuml\n[*] --> Idle\nIdle --> Run : go\n@enduml', words: ['Run'], field: 'st-tail-id', add: 'st-tail-add', chip: 'state' },
];

for (const K of KINDS) {
  test('owner 0842-2 ' + K.kind + ': 名前を空のまま「+ 追加」を押すと、欄の見出しの語で知らせ、手はその欄に入る', async ({ page }, testInfo) => {
    await H.bootWith(page, K.dsl);
    await H.waitDrawn(page, K.words);
    // 末尾に追加の種別を名前のある種別にする (既定の種別が別でも同じ欄で確かめる)。
    const chip = page.locator('#' + K.field.replace(/-(alias|id)$/, '-kind') + '-chip-' + K.chip);
    if (await chip.count()) await chip.click();
    const field = page.locator('#' + K.field);
    await expect(field).toBeVisible();
    await field.fill('');
    const label = (await page.locator('label[for="' + K.field + '"]').innerText()).trim();
    expect(label.length).toBeGreaterThan(0);
    const before = await H.getEditorText(page);
    const messages = [];
    page.on('dialog', async (d) => { messages.push(d.message()); await d.accept(); });
    await page.locator('#' + K.add).click();
    await expect.poll(() => messages.length).toBe(1);
    const msg = messages[0];
    expect(msg).not.toMatch(/Alias|\bID\b|Target|必須/);
    expect(msg).toBe('「' + label.replace(/\s*[（(]任意[）)]\s*$/, '') + '」を入れてください');
    // 手は空だった欄に入っている (押し直す欄を探さずに打てる)。
    await expect(field).toBeFocused();
    await page.keyboard.type('Nx');
    await expect(field).toHaveValue('Nx');
    if (K.kind === 'component') await page.screenshot({ path: testInfo.outputPath('typed-after-notice.png') });
    H.annotate(testInfo, 'notice', msg);
    // 本文は変わらない。
    expect(await H.getEditorText(page)).toBe(before);
  });
}
