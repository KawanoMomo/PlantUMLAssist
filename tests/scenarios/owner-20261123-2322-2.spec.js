// @ts-check
// TICKET-owner-20261123-2322-2: 「末尾に追加」で終点 (To) を選ばずに「+ 追加」を押したときの知らせが 5 図種で 4 通りだった。
// 期待 (principles「同じ操作は 6 図種で同じ語・同じ場所」): sequence・usecase・component・class・state で To を選ばずに
// 「+ 追加」を押すと、本文はバイト一致、知らせは欄の見出しの語の同じ形「「{見出し}」を選んでください」、手は To の欄、
// 欄の補足も「「{見出し}」を選んでください ({選び方})」の同じ組み立て。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const FILES = {
  seq: { text: '@startuml\nparticipant A\nparticipant B\nparticipant C\nA -> B : start()\n@enduml\n', word: 'start()',
    p: 'seq', chip: 'message', hint: '#seq-tail-endpoint-note' },
  uc: { text: '@startuml\nactor User\nusecase Login\nUser --> Login\n@enduml\n', word: 'Login',
    p: 'uc', chip: 'relation', hint: '#uc-tail-rhint' },
  cmp: { text: '@startuml\ncomponent Api\ncomponent Db\nApi --> Db\n@enduml\n', word: 'Api',
    p: 'co', chip: 'relation', hint: '#co-tail-rhint' },
  cls: { text: '@startuml\nclass Foo\nclass Bar\nFoo --> Bar\n@enduml\n', word: 'Foo',
    p: 'cl', chip: 'relation', hint: '#cl-tail-rpreview' },
  st: { text: '@startuml\n[*] --> Idle\nIdle --> Run : go\nstate Stop\n@enduml\n', word: 'Idle',
    p: 'st', chip: 'transition', hint: '#st-tx-hint' },
};

test('owner 2322-2 5 図種で To を選ばずに「+ 追加」→ 本文は不変、同じ形の知らせ、手は To', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const k of Object.keys(FILES)) fs.writeFileSync(path.join(dir, k + '.puml'), FILES[k].text);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');
  const messages = [];
  page.on('dialog', async (d) => { messages.push(d.message()); await d.accept(); });

  const seen = [];
  for (const k of Object.keys(FILES)) {
    const f = FILES[k];
    await page.locator('#files-parts .files-part-file[data-file-name="' + k + '"]').click();
    await H.waitDrawn(page, [f.word]);
    const chip = page.locator('#' + f.p + '-tail-kind-chip-' + f.chip);
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
    const to = page.locator('#' + f.p + '-tail-to');
    await expect(to).toHaveValue('');
    const before = await H.getEditorText(page);
    messages.length = 0;
    await page.locator('#' + f.p + '-tail-add').click();
    await expect.poll(() => messages.length).toBe(1);
    // 欄の見出し (画面の語) で言う。
    const word = (await page.evaluate((id) => {
      const lab = document.querySelector('label[for="' + id + '"]') || document.getElementById(id + '-label');
      return lab ? (lab.textContent || '').trim() : '';
    }, f.p + '-tail-to'));
    expect(word).toMatch(/\(To\)$/);
    expect(messages[0]).toBe('「' + word + '」を選んでください');
    await expect(to).toBeFocused();
    await expect(page.locator(f.hint)).toHaveText(new RegExp('^「' + word.replace(/[()]/g, '\\$&') + '」を選んでください \\(.+\\)$'));
    expect(await H.getEditorText(page)).toBe(before);
    seen.push(k + ': ' + messages[0] + ' / ' + (await page.locator(f.hint).textContent()));
    await page.screenshot({ path: testInfo.outputPath('need-to-' + k + '.png') });
  }
  H.annotate(testInfo, 'notices', seen.join(' | '));
});
