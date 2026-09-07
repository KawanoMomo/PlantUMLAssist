// @ts-check
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('./helpers');

// クラス構成の一括追加フォーム。overlay を使わないので、外部レンダラに
// 頼らずローカルのまま開く (helpers.gotoApp は online 描画に切り替える)。
async function openClassDiagram(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
}

async function fillClassRow(page, i, name, members, relation) {
  await page.locator('#cl-sc-name-' + i).fill(name);
  if (members) await page.locator('#cl-sc-mem-' + i).fill(members);
  if (relation) await page.locator('#cl-sc-rel-' + i).selectOption(relation);
}

async function openScaffold(page) {
  await page.locator('#cl-scaffold-open').click();
  await expect(page.locator('#cl-sc-modal')).toBeVisible();
  await page.locator('#cl-sc-parent').fill('CanDrv');
  await page.locator('#cl-sc-pmembers').fill('+init() : void, -state : uint8');
}

test.describe('BLK-junior-20260906-2143 クラス構成の一括追加', () => {
  test('UC-1: 4 クラス・6 関連が 1 回の確定で入る', async ({ page }) => {
    await openClassDiagram(page);
    await openScaffold(page);
    await fillClassRow(page, 0, 'CanDrvHs', '+send()', 'inheritance');
    await fillClassRow(page, 1, 'CanDrvFd', '+send()', 'inheritance');
    await fillClassRow(page, 2, 'CanBus', '', 'none');
    await page.locator('#cl-sc-add-row').click();
    await fillClassRow(page, 3, 'CanFrame', '-id : uint32', 'none');

    // BLK-junior-20260907-0823: 関連の行は最初から 3 行あり、元 / 先は
    // このモーダルで作る名前からの選択になった。
    await page.locator('#cl-sc-rfrom-0').selectOption('CanDrvHs');
    await page.locator('#cl-sc-rto-0').selectOption('CanBus');
    await page.locator('#cl-sc-rlabel-0').fill('uses');
    await page.locator('#cl-sc-rfrom-1').selectOption('CanDrvFd');
    await page.locator('#cl-sc-rkind-1').selectOption('aggregation');
    await page.locator('#cl-sc-rto-1').selectOption('CanFrame');
    await page.locator('#cl-sc-rfrom-2').selectOption('CanBus');
    await page.locator('#cl-sc-rkind-2').selectOption('composition');
    await page.locator('#cl-sc-rto-2').selectOption('CanFrame');

    await page.locator('#cl-sc-confirm').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('abstract class CanDrv {');
    expect(t).toContain('  +init() : void');
    expect(t).toContain('  -state : uint8');
    expect(t).toContain('class CanDrvHs {');
    expect(t).toContain('class CanFrame {');
    // 関連 6 本
    expect(t).toContain('CanDrv <|-- CanDrvHs');
    expect(t).toContain('CanDrv <|-- CanDrvFd');
    expect(t).toContain('CanDrvHs -- CanBus : uses');
    expect(t).toContain('CanDrvFd o-- CanFrame');
    expect(t).toContain('CanBus *-- CanFrame');
    await expect(page.locator('#cl-sc-modal')).toBeHidden();
  });

  test('UC-2: 追加される行がプレビューに出る', async ({ page }) => {
    await openClassDiagram(page);
    await openScaffold(page);
    await fillClassRow(page, 0, 'CanDrvHs', '+send()', 'inheritance');
    var preview = await page.locator('#cl-sc-preview').textContent();
    expect(preview).toContain('abstract class CanDrv {');
    expect(preview).toContain('CanDrv <|-- CanDrvHs');
  });

  // BLK-junior-20260907-0823: 未定義の相手は打ち込めなくなったので、
  // 「打てば止まる」ではなく「選べる名前がこのモーダルの中のものだけ」を見る。
  test('UC-3: 関連の相手はこの構成にある名前からしか選べない', async ({ page }) => {
    await openClassDiagram(page);
    await openScaffold(page);
    await fillClassRow(page, 0, 'CanDrvHs', '', 'inheritance');
    var opts = await page.locator('#cl-sc-rto-0 option').allTextContents();
    expect(opts).toContain('CanDrv');
    expect(opts).toContain('CanDrvHs');
    expect(opts).not.toContain('Nowhere');
  });

  test('UC-4: クラス名が空なら確定できない', async ({ page }) => {
    await openClassDiagram(page);
    await page.locator('#cl-scaffold-open').click();
    await expect(page.locator('#cl-sc-confirm')).toBeDisabled();
    await expect(page.locator('#cl-sc-errors')).toContainText('1 つ以上');
  });

  test('UC-5: キャンセルすると DSL は変わらない', async ({ page }) => {
    await openClassDiagram(page);
    var before = await getEditorText(page);
    await openScaffold(page);
    await fillClassRow(page, 0, 'CanDrvHs', '+send()', 'inheritance');
    await page.locator('#cl-sc-cancel').click();
    await expect(page.locator('#cl-sc-modal')).toBeHidden();
    expect(await getEditorText(page)).toBe(before);
  });

  test('UC-6: Ctrl+Z 1 手でクラス構成ごと戻る', async ({ page }) => {
    await openClassDiagram(page);
    var before = await getEditorText(page);
    await openScaffold(page);
    await fillClassRow(page, 0, 'CanDrvHs', '+send()', 'inheritance');
    await fillClassRow(page, 1, 'CanDrvFd', '+send()', 'inheritance');
    await page.locator('#cl-sc-confirm').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('CanDrvHs');
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toBe(before);
  });

  test('UC-7: 行を削除すると DSL に出ない', async ({ page }) => {
    await openClassDiagram(page);
    await openScaffold(page);
    await fillClassRow(page, 0, 'CanDrvHs', '', 'inheritance');
    await fillClassRow(page, 1, 'CanDrvFd', '', 'inheritance');
    await page.locator('#cl-sc-del-1').click();
    await page.locator('#cl-sc-confirm').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('CanDrv <|-- CanDrvHs');
    expect(t).not.toContain('CanDrvFd');
  });
});
