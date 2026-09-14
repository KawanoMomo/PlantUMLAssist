// @ts-check
// BLK-primary-20260907-0703: design 3d「図全体の外観 / Theme」。
// 右パネルの「図の設定」タブに 外観プリセット・図形の色・線の色・背景色・文字サイズ・
// タイトル を常設し、選ぶと skinparam / title が DSL 先頭に書き込まれ、
// 生成される行もその場に出る。GUI だけで完結することを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

async function openSettings(page) {
  await page.locator('#props-tab-settings').click();
  await expect(page.locator('#diagram-settings-content')).toBeVisible();
}

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(400);
}

const SEQ = '@startuml\nparticipant SpiDrv\nparticipant SpiHw\nSpiDrv -> SpiHw: transfer\n@enduml';

test.describe('BLK-primary-0703 図の設定タブ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('右パネルに「図の設定」タブがあり、Properties と行き来できる', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#props-tab-settings')).toBeVisible();
    await openSettings(page);
    await expect(page.locator('#props-content')).toBeHidden();
    await page.locator('#props-tab-props').click();
    await expect(page.locator('#props-content')).toBeVisible();
    await expect(page.locator('#diagram-settings-content')).toBeHidden();
  });

  test('外観・色・文字サイズ・タイトルの選択肢が常設されている', async ({ page }) => {
    await gotoApp(page);
    await openSettings(page);
    await expect(page.locator('#ds-title')).toBeVisible();
    for (const label of ['標準', 'モノクロ', 'ダーク']) {
      await expect(page.locator('#ds-theme-group .ds-choice', { hasText: label })).toHaveCount(1);
    }
    await expect(page.locator('#ds-shape-color')).toBeVisible();
    await expect(page.locator('#ds-line-color')).toBeVisible();
    await expect(page.locator('#ds-background-color')).toBeVisible();
    await expect(page.locator('#ds-font-group .ds-choice')).toHaveCount(4);
  });

  test('外観を選ぶと skinparam が DSL 先頭に書き込まれる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'ダーク' }).click();

    const text = await getEditorText(page);
    expect(text).toContain('skinparam backgroundColor #1E1E1E');
    const lines = text.split('\n');
    expect(lines[0]).toBe('@startuml');
    expect(lines[1]).toContain('skinparam');
    // 図の中身は残る
    expect(text).toContain('SpiDrv -> SpiHw: transfer');
  });

  test('モノクロを選ぶと monochrome true になる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'モノクロ' }).click();
    expect(await getEditorText(page)).toContain('skinparam monochrome true');
  });

  test('文字サイズを選ぶと defaultFontSize が変わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-font-group .ds-choice[data-ds-value="16"]').click();
    expect(await getEditorText(page)).toContain('skinparam defaultFontSize 16');
    await page.locator('#ds-font-group .ds-choice[data-ds-value="10"]').click();
    const text = await getEditorText(page);
    expect(text).toContain('skinparam defaultFontSize 10');
    expect(text).not.toContain('skinparam defaultFontSize 16');
  });

  test('色を選ぶと該当の skinparam 行が変わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-shape-color').evaluate((el) => {
      /** @type {HTMLInputElement} */ (el).value = '#ff0000';
      el.dispatchEvent(new Event('change'));
    });
    expect(await getEditorText(page)).toContain('skinparam sequenceParticipantBackgroundColor #FF0000');
  });

  test('タイトルを入れると title 行が入る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-title').fill('SPI 初期化');
    await page.locator('#ds-title').blur();
    await page.waitForTimeout(300);
    const text = await getEditorText(page);
    expect(text).toContain('title SPI 初期化');
    expect(text.split('\n').filter((l) => l.startsWith('title ')).length).toBe(1);
  });

  test('書き込まれる行がその場に表示される', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'ダーク' }).click();
    await expect(page.locator('#ds-preview')).toContainText('skinparam backgroundColor #1E1E1E');
    await expect(page.locator('#ds-preview')).toContainText('skinparam defaultFontSize');
  });

  test('外観を選び直しても skinparam が積み上がらない', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'ダーク' }).click();
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'モノクロ' }).click();
    await page.locator('#ds-theme-group .ds-choice', { hasText: '標準' }).click();
    const text = await getEditorText(page);
    expect(text).not.toContain('monochrome');
    expect(text.split('\n').filter((l) => l.startsWith('skinparam backgroundColor')).length).toBe(1);
  });

  test('選んだ外観が Ctrl+Z 1 手で戻る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'ダーク' }).click();
    expect(await getEditorText(page)).toContain('skinparam');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).not.toContain('skinparam');
  });

  test('タブを開き直すと今の DSL の設定が反映されている', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, '@startuml\nskinparam monochrome true\ntitle 既存タイトル\nparticipant A\n@enduml');
    await openSettings(page);
    await expect(page.locator('#ds-title')).toHaveValue('既存タイトル');
    await expect(page.locator('#ds-theme-group .ds-choice.active')).toHaveText('モノクロ');
  });

  test('設定を変えるとプレビューが再描画される', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await openSettings(page);
    await page.locator('#ds-theme-group .ds-choice', { hasText: 'ダーク' }).click();
    await page.waitForTimeout(1500);
    // svg の style 属性は表示側 (normalizeSvgSize) が上書きするので、
    // 描画結果そのものに背景色が入っているかを見る。
    const svg = await page.locator('#preview-svg').innerHTML();
    expect(svg.toLowerCase()).toContain('1e1e1e');
  });
});
