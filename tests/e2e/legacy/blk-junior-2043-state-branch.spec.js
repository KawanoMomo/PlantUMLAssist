// @ts-check
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('../helpers');

// 分岐 (choice) の追加フォーム。overlay を使わないので、外部レンダラに
// 頼らずローカルのまま開く (helpers.gotoApp は online 描画に切り替える)。
async function openStateDiagram(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(500);
}

async function fillBranch(page, i, guard, to, action) {
  await page.locator('#st-br-guard-' + i).fill(guard);
  await page.locator('#st-br-to-' + i).fill(to);
  if (action) await page.locator('#st-br-act-' + i).fill(action);
}

test.describe('BLK-junior-20260906-2043 分岐 (choice) 追加', () => {
  test('UC-1: 分岐一式が 1 回の確定で入る', async ({ page }) => {
    await openStateDiagram(page);
    await page.locator('#st-branch-open').click();
    await expect(page.locator('#st-br-modal')).toBeVisible();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await fillBranch(page, 0, '重大', 'Error');
    await fillBranch(page, 1, '軽微', 'Idle');
    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('state AnomalyCheck <<choice>>');
    expect(t).toContain('AnomalyCheck --> Error : [重大]');
    expect(t).toContain('AnomalyCheck --> Idle : [軽微]');
    await expect(page.locator('#st-br-modal')).toBeHidden();
  });

  test('UC-2: 枝を 3 本以上に増やせる', async ({ page }) => {
    await openStateDiagram(page);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await fillBranch(page, 0, '重大', 'Error');
    await fillBranch(page, 1, '軽微', 'Idle');
    await page.locator('#st-br-add-row').click();
    await fillBranch(page, 2, '致命', '[*]', 'shutdown()');
    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('AnomalyCheck --> [*] : [致命] / shutdown()');
  });

  test('UC-3: 追加される行がプレビューに出る', async ({ page }) => {
    await openStateDiagram(page);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await fillBranch(page, 0, '重大', 'Error');
    await fillBranch(page, 1, '軽微', 'Idle');
    var preview = await page.locator('#st-br-preview').textContent();
    expect(preview).toContain('state AnomalyCheck <<choice>>');
    expect(preview).toContain('AnomalyCheck --> Error : [重大]');
  });

  test('UC-4: 枝が 1 本だけなら確定できない', async ({ page }) => {
    await openStateDiagram(page);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await fillBranch(page, 0, '重大', 'Error');
    await expect(page.locator('#st-br-confirm')).toBeDisabled();
    await expect(page.locator('#st-br-errors')).toContainText('2 本以上');
  });

  test('UC-5: キャンセルすると DSL は変わらない', async ({ page }) => {
    await openStateDiagram(page);
    var before = await getEditorText(page);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await fillBranch(page, 0, '重大', 'Error');
    await fillBranch(page, 1, '軽微', 'Idle');
    await page.locator('#st-br-cancel').click();
    await expect(page.locator('#st-br-modal')).toBeHidden();
    expect(await getEditorText(page)).toBe(before);
  });

  test('UC-6: Ctrl+Z 1 手で分岐ごと戻る', async ({ page }) => {
    await openStateDiagram(page);
    var before = await getEditorText(page);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await fillBranch(page, 0, '重大', 'Error');
    await fillBranch(page, 1, '軽微', 'Idle');
    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('AnomalyCheck');
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toBe(before);
  });

  test('UC-7: 選択中の state から分岐に入るトリガーを付けられる', async ({ page }) => {
    await openStateDiagram(page);
    // overlay クリックは描画待ちになるので、選択そのものを API から立てる。
    await page.evaluate(() => {
      window.MA.selection.setSelected([{ type: 'state', id: 'Idle' }]);
    });
    await page.waitForTimeout(300);
    await page.locator('#st-add-branch').click();
    await expect(page.locator('#st-br-modal')).toBeVisible();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await page.locator('#st-br-trigger').fill('Fault');
    await fillBranch(page, 0, '重大', 'Error');
    await fillBranch(page, 1, '軽微', 'Idle');
    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('Idle --> AnomalyCheck : Fault');
    expect(t).toContain('AnomalyCheck --> Error : [重大]');
  });
});
