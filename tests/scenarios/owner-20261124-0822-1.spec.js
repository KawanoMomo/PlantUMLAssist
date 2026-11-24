// @ts-check
// TICKET-owner-20261124-0822-1: 右パネルの「名前 (id)」に打って Enter を押しても class・component・state・usecase では
// 何も起きず、図の別の要素を押すと打った名前は黙って捨てられた。sequence の参加者には「変更を反映」が無かった。
// 期待 (principles.md「同じ操作は 6 図種で同じ語・同じ場所」「押して何も起きない行を残さない」):
//   - class と state: 名前 (id) に打って Enter → 宣言と参照の行が改名され、Ctrl+Z 1 回で戻る
//   - sequence の参加者: 同じ並びに「変更を反映」があり、押すと同じ改名
//   - component: 打ったまま図の別の要素を押しても、打った名前は捨てられず反映される
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');
const { clickOverlayByLine } = require('../e2e/helpers');

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const CASES = [
  {
    kind: 'class', type: 'class', oldId: 'Bus', newId: 'Bus2', field: '#cl-edit-id', how: 'enter',
    text: ['@startuml', 'class Bus', 'class Ctl', 'Ctl --> Bus : uses', '@enduml', ''],
    words: ['Bus', 'Ctl', 'uses'], changed: { 2: 'class Bus2', 4: 'Ctl --> Bus2 : uses' },
  },
  {
    kind: 'state', type: 'state', oldId: 'Idle', newId: 'Idle2', field: '#st-id', how: 'enter',
    text: ['@startuml', 'state Idle', 'state Run', '[*] --> Idle', 'Idle --> Run : go', '@enduml', ''],
    words: ['Idle', 'Run', 'go'], changed: { 2: /^state (?:"Idle" as )?Idle2$/, 4: '[*] --> Idle2', 5: 'Idle2 --> Run : go' },
  },
  {
    kind: 'sequence', type: 'participant', oldId: 'Ctl', newId: 'Ctl2', field: '#seq-edit-alias', how: 'button', decl: 2,
    text: ['@startuml', 'participant Ctl', 'participant Sub', 'Ctl -> Sub : req', '@enduml', ''],
    words: ['Ctl', 'Sub', 'req'], changed: { 2: 'participant Ctl2', 4: 'Ctl2 -> Sub : req' },
  },
  {
    kind: 'component', type: 'component', oldId: 'Bus', newId: 'Bus2', field: '#co-edit-id', how: 'leave', other: 'Ctl',
    text: ['@startuml', 'component Bus', 'component Ctl', 'Bus --> Ctl : data', '@enduml', ''],
    words: ['Bus', 'Ctl', 'data'], changed: { 2: /^component (?:"Bus" as )?Bus2$/, 4: 'Bus2 --> Ctl : data' },
  },
];

for (const c of CASES) {
  test('owner 0822-1 ' + c.kind + ' (' + c.how + '): 名前 (id) の確定は「変更を反映」と同じ', async ({ page }, testInfo) => {
    test.setTimeout(120 * 1000);
    const before = c.text.join('\n');
    await H.bootWith(page, before);
    await H.waitDrawn(page, c.words);
    if (c.kind === 'sequence') {
      const chip = page.locator('#seq-tail-kind-chip-participant');
      if (await chip.count()) await chip.click();
      await clickOverlayByLine(page, c.decl);
    } else {
      await clickHit(page, page.locator('#overlay-layer [data-type="' + c.type + '"][data-id="' + c.oldId + '"]').first(), c.kind);
    }
    const field = page.locator(c.field);
    await expect(field).toHaveValue(c.oldId);
    // 5 図種とも同じ語の「変更を反映」が名前 (id) の欄の後ろにある
    await expect(page.locator('#props-content [data-apply]').first()).toHaveText('変更を反映');
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(c.newId);
    const r = await H.measure(page, testInfo, async () => {
      if (c.how === 'enter') await page.keyboard.press('Enter');
      else if (c.how === 'button') await page.locator('#props-content [data-apply]').first().click();
      else await clickHit(page, page.locator('#overlay-layer [data-type="' + c.type + '"][data-id="' + c.other + '"]').first(), c.other);
      // 宣言の行 (2 行目) に新しい名前が入るまで待つ。表示名を書いていない宣言が `"Bus" as Bus2` になるのは
      // 改名の今の形 (TICKET-owner-20261124-0822-3 の範囲) なので、ここでは両方を受ける
      await expect.poll(async () => (await H.getEditorText(page)).split('\n')[1], { timeout: 10000 })
        .toMatch(new RegExp('\\b' + c.newId + '$'));
      await H.waitDrawn(page, c.words.filter((w) => w !== c.oldId));
    }, null);
    await H.expectRendered(page);
    const a = r.after.split('\n');
    const b = before.split('\n');
    expect(a.length).toBe(b.length);
    for (let i = 0; i < b.length; i++) {
      const want = c.changed[i + 1];
      if (want instanceof RegExp) expect(a[i], (i + 1) + ' 行目').toMatch(want);
      else expect(a[i], (i + 1) + ' 行目').toBe(want !== undefined ? want : b[i]);
    }
    if (c.how === 'enter') await page.screenshot({ path: testInfo.outputPath(c.kind + '-entered.png') });

    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(before);
    H.annotate(testInfo, 'result', c.kind + ' ' + c.how + ' diff=' + r.diffLines);
  });
}
