// @ts-check
// BLK-primary-20260908-1803-wish 申し送りチェックリストの往復。
// (1) 差分が無くなった図にも申し送りを書ける (渡す時点で固定できる)
// (2) 新人が返した JSON を読み込むと「未読 N 件・要フォロー M 件」が出る
// (3) 次に開いたとき、ボードを開く前からその件数が見える
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const DSL = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
const WHY = 'adc_state の Done→Configured に対応するメソッドが無かった';

async function openApp(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Driver');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, DSL);
  await page.waitForTimeout(600);
  // 基準を取り直して差分 0 枚にする (今日つまずいた「書く場所が無い」状態)。
  await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
}

test.describe('BLK-primary-1803-wish 申し送りチェックリスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('差分が無くても図を選んで申し送りを足せる', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
    await page.locator('#cb-note-doc').selectOption('Adc_Driver');
    await page.locator('#cb-note-text').fill(WHY);
    await page.locator('#cb-note-add').click();
    await expect(page.locator('#cb-note-add-state')).toContainText('Adc_Driver');
    await expect(page.locator('#cb-summary')).toContainText('申し送り 1 件');
    const saved = await page.evaluate(() => window.MA.handoverNotes.get('Adc_Driver').text);
    expect(saved).toBe(WHY);
  });

  test('返信 JSON を読み込むと未読・要フォローが出る', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-checklist-state')).toContainText('まだ引き継ぎパッケージを渡していません');

    // 引き継ぎパッケージを渡したところまでを作る (zip の書き出しは別 spec の職掌)。
    const created = await page.evaluate((why) => {
      window.MA.handoverNotes.set('Adc_Driver', why, {});
      window.MA.handoverNotes.set('Dma_Driver', '状態名を dma_state に揃えた', {});
      var c = window.MA.handoverChecklist.build(window.MA.handoverNotes.list(), 'T0');
      window.MA.handoverChecklist.issue(c);
      return c.items.map(function(i) { return i.id; });
    }, WHY);
    expect(created.length).toBe(2);

    await page.locator('#cb-close').click();
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-checklist-state')).toContainText('未読 2 件');

    // 新人が index.html で押した結果 = 返信 JSON。
    await page.locator('#cb-reply-file').setInputFiles({
      name: 'handover-reply.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        kind: 'handover-reply', createdAt: 'T0', at: '2026-09-08T19:00:00Z',
        replies: { Adc_Driver: 'done', Dma_Driver: 'unclear' },
      })),
    });
    await expect(page.locator('#cb-checklist-state')).toContainText('未読 0 件');
    await expect(page.locator('#cb-checklist-state')).toContainText('要フォロー 1 件');
    await expect(page.locator('#cb-summary')).toContainText('引き継ぎ 申し送り 2 件');
    await expect(page.locator('#cb-checklist-state')).toHaveAttribute('title', /Dma_Driver/);
  });

  test('次に開いたときはボードを開く前から件数が見える', async ({ page }) => {
    // 前回の起動で渡して返信を受け取った状態を localStorage に置いてから開き直す
    // (beforeEach の clear より後に走るよう、ここで addInitScript する)。
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('plantuml-handover-checklist', JSON.stringify({
          checklist: { createdAt: 'T0', items: [
            { id: 'Adc_Driver', name: 'Adc_Driver', text: 'なぜ直したか', at: 'T0' }] },
          reply: { createdAt: 'T0', at: 'T1', replies: { Adc_Driver: 'unclear' } },
        }));
      } catch (e) {}
    });
    await openApp(page);
    await page.waitForTimeout(800);
    await expect(page.locator('#btn-tab-board'))
      .toHaveAttribute('title', /未読 0 件・要フォロー 1 件/);
  });
});
