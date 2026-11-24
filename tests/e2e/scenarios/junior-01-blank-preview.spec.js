// @ts-check
// TICKET-owner-20261115-1827-3: 白紙の図 (＋ や図種の切り替えで開いた @startuml / @enduml だけの本文) の
// プレビューに、PlantUML が空の図に返す「Welcome to PlantUML! … https://plantuml.com」の案内画面を出さない。
// 6 図種とも、空のキャンバスと「末尾に追加」から足せることの 1 行になり、本文は書き換えない。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const KINDS = [
  'plantuml-sequence', 'plantuml-usecase', 'plantuml-component',
  'plantuml-class', 'plantuml-activity', 'plantuml-state',
];

function isBlank(text) {
  return String(text).split('\n').map((l) => l.trim())
    .filter((l) => l && !/^@(start|end)uml\b/.test(l) && !/^'/.test(l)).length === 0;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
});

for (const kind of KINDS) {
  test('白紙の ' + kind + ' は案内画面を描かず、空のキャンバスと 1 行の案内になる', async ({ page }) => {
    await page.locator('#btn-tab-new').click();
    await page.waitForTimeout(300);
    if ((await page.locator('#diagram-type').inputValue()) !== kind) {
      await page.locator('#diagram-type').selectOption(kind);
      await page.waitForTimeout(500);
    }
    let text = await getEditorText(page);
    // アクティビティの新しい図は start / stop の 2 行入りで開き、PlantUML はそれを図として描く。
    // 白紙 (@startuml / @enduml だけ) にしてから見る。
    if (!isBlank(text)) {
      await page.evaluate(() => {
        const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
        ed.value = '@startuml\n@enduml';
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      });
      text = '@startuml\n@enduml';
    }
    await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('#preview-svg .preview-blank-hint')).toHaveText('まだ要素がありません。右の「末尾に追加」から最初の要素を足せます');
    await expect(page.locator('#preview-svg')).not.toContainText('Welcome to PlantUML');
    await expect(page.locator('#preview-svg')).not.toContainText('plantuml.com');
    await expect(page.locator('#render-status')).toHaveText(/^Rendered/);
    // 描いただけでは本文は 1 字も変わらない。
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(text);
  });
}

test('本文に「Welcome to PlantUML!」と自分で書いた図は、そのまま描く', async ({ page }) => {
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = '@startuml\nAlice -> Bob : Welcome to PlantUML!\n@enduml';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#preview-svg svg text', { hasText: 'Alice' }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(0);
  await expect(page.locator('#preview-svg .preview-blank-hint')).toHaveCount(0);
});
