// @ts-check
// TICKET-owner-20261123-2322-3: 状態遷移図を開いた直後の「末尾に追加」(遷移) の始点 (From) が一覧の先頭の `[*]` で始まり、
// To だけ図で選んで足すと選んでいない開始の遷移 (`[*] --> Stop`) が入った。
// 期待: 保存先の st.puml を FILES から開き、遷移のチップを押すと From は本文の最後の遷移の行き先 Run、案内がその名前を言う。
// 図の Stop を押して「+ 追加」→ `Run --> Stop` の 1 行だけが足され、`[*] -->` の行は増えない (押した対象だけが変わる・描ける)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const ST = '@startuml\n[*] --> Idle\nIdle --> Run : go\nstate Stop\n@enduml\n';

async function clickState(page, id) {
  const hit = page.locator('#overlay-layer [data-type="state"][data-id="' + id + '"]').first();
  await expect(hit).toBeAttached({ timeout: 15000 });
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('overlay box not found: state ' + id);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function count(text, re) { return text.split('\n').filter((l) => re.test(l)).length; }

test('owner 2322-3 状態遷移図を開いた直後の遷移は本文の最後の遷移先から始まり、To だけ押して足すと Run --> Stop だけが入る', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'st.puml'), ST);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');

  await page.locator('#files-parts .files-part-file[data-file-name="st"]').click();
  await H.waitDrawn(page, ['Idle', 'Run', 'Stop']);
  const chip = page.locator('#st-tail-kind-chip-transition');
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();

  await expect(page.locator('#st-tail-from')).toHaveValue('Run');
  await expect(page.locator('#st-tail-to')).toHaveValue('');
  await expect(page.locator('#st-tx-hint')).toContainText('Run');
  await expect(page.locator('#st-tx-hint')).toContainText('遷移先');
  await page.screenshot({ path: testInfo.outputPath('open-from.png') });

  const before = await H.getEditorText(page);
  const r = await H.measure(page, testInfo, async () => {
    await clickState(page, 'Stop');
    await expect(page.locator('#st-tail-to')).toHaveValue('Stop');
    await page.locator('#st-tail-add').click();
  }, ['Stop']);
  await expect.poll(async () => count(await H.getEditorText(page), /^\s*Run\s*-->\s*Stop\s*$/)).toBe(1);
  const after = await H.getEditorText(page);
  const d = H.diffLines(before, after);
  expect(count(after, /^\s*\[\*\]\s*-->/)).toBe(count(before, /^\s*\[\*\]\s*-->/));
  expect(H.removedLines(before, after)).toEqual([]);
  expect(d).toBe(1);
  await H.expectRendered(page);
  // 確定した後は「直前の遷移先から」(変えない)
  await expect(page.locator('#st-tail-from')).toHaveValue('Stop');
  await page.screenshot({ path: testInfo.outputPath('after-add.png') });
  H.annotate(testInfo, 'result', 'diff=' + d + ' ms=' + r.renderMs);
});
