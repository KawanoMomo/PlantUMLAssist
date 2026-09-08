// @ts-check
// BLK-reviewer-20260908-1603-wish: 前回の依頼が着手されたかを知るのに、audit.js --since-files で
// 保存フォルダの全図の指紋を控えと突き合わせていた。指摘箱を開けば 1 件ずつに
// 未着手 / 着手 / 解消 が付いていて、何回見送られたかも出ている、を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);

function pin(id, state, author, text, anchor) {
  return "' @pin " + [id, state, author, '2026-09-08T15:03', anchor, text].join('|');
}

const BASE = {
  R1603_dma_state: [
    '@startuml', 'title Dma state', '[*] --> Idle', 'Idle --> Busy : Dma_Configure',
    pin('1', 'open', 'reviewer', '架空の遷移ラベル', 'Idle --> Busy : Dma_Configure'),
    '@enduml',
  ].join('\n'),
  R1603_adc_state: [
    '@startuml', 'title Adc state', '[*] --> Idle', 'Idle --> Busy : Adc_Start',
    pin('1', 'open', 'reviewer', '対応する method が無い', 'Idle --> Busy : Adc_Start'),
    '@enduml',
  ].join('\n'),
};

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function putFiles(page, files) {
  await page.evaluate(async (a) => {
    for (const name of Object.keys(a.files)) {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: name, dir: a.dir, dsl: a.files[name] }),
      });
    }
  }, { files: files, dir: DIR });
}

async function openInbox(page) {
  await page.locator('#btn-tab-inbox').click();
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForFunction(() => {
    var h = document.querySelector('#inbox-panel .ib-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });
}

async function closeInbox(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('#inbox-panel.open', { state: 'detached' }).catch(() => {});
}

// 指摘箱を開き直す = reviewer の次の tick。控えとの突き合わせはここで走る。
async function reopenInbox(page) {
  await closeInbox(page);
  await openInbox(page);
}

function rowOf(page, doc) {
  return page.locator('#inbox-panel .ib-row[data-doc="' + doc + '"]').first();
}

test.describe('BLK-reviewer-1603-wish: 指摘ごとの着手状況', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFiles(page, BASE);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('指摘箱を開くと 1 件ずつに着手状況が付き、帯が件数を言う', async ({ page }) => {
    await openInbox(page);
    await expect(page.locator('#ib-progress')).toBeVisible();
    const head = await page.locator('#ib-progress').textContent();
    expect(head).toContain('未着手 2');
    expect(await page.locator('#ib-progress').getAttribute('data-untouched')).toBe('2');
    // 行そのものにも状況が出る
    await expect(rowOf(page, 'R1603_dma_state').locator('.ib-prog')).toHaveText(/未着手/);
    expect(await rowOf(page, 'R1603_dma_state').getAttribute('data-progress')).toBe('untouched');
  });

  test('図を直さずに開き直しても未着手のまま', async ({ page }) => {
    await openInbox(page);
    await reopenInbox(page);
    expect(await page.locator('#ib-progress').getAttribute('data-untouched')).toBe('2');
    expect(await rowOf(page, 'R1603_dma_state').getAttribute('data-passes')).toBe('0');
  });

  test('指摘とは別の行を直すと着手になり、見送り回数が増える', async ({ page }) => {
    await openInbox(page);
    await closeInbox(page);
    // dma だけ、指摘先ではない行を書き換えて保存し直す。
    await putFiles(page, {
      R1603_dma_state: BASE.R1603_dma_state.replace('title Dma state', 'title DMA state machine'),
    });
    await openInbox(page);
    const row = rowOf(page, 'R1603_dma_state');
    expect(await row.getAttribute('data-progress')).toBe('started');
    expect(await row.getAttribute('data-passes')).toBe('1');
    await expect(row.locator('.ib-prog')).toHaveText(/着手/);
    await expect(row.locator('.ib-prog')).toHaveText(/見送り 1 回/);
    // adc は触っていないので未着手のまま
    expect(await rowOf(page, 'R1603_adc_state').getAttribute('data-progress')).toBe('untouched');
    expect(await page.locator('#ib-progress').getAttribute('data-stalled')).toBe('1');
  });

  test('指摘した行を直すと解消になり、「解消も出す」で確かめられる', async ({ page }) => {
    await openInbox(page);
    await closeInbox(page);
    await putFiles(page, {
      R1603_dma_state: BASE.R1603_dma_state.replace(
        'Idle --> Busy : Dma_Configure\n', 'Idle --> Busy : Dma_Start\n'),
    });
    await openInbox(page);
    expect(await page.locator('#ib-progress').getAttribute('data-resolved')).toBe('1');
    expect(await page.locator('#ib-progress').getAttribute('data-untouched')).toBe('1');
    // 解消は既定では行に出ない (受信箱は「まだ直っていない指摘」の箱のまま)
    await expect(page.locator('#inbox-panel .ib-row[data-progress="resolved"]')).toHaveCount(0);
    await page.locator('#ib-resolved').check();
    await page.waitForTimeout(200);
    const resolved = page.locator('#inbox-panel .ib-row[data-progress="resolved"]');
    await expect(resolved).toHaveCount(1);
    await expect(resolved.locator('.ib-prog')).toHaveText(/解消/);
  });
});
