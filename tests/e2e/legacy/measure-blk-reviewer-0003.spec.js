// @ts-check
// BLK-reviewer-20260908-0003 の手数実測。起票者の手順 (手で書いた指摘の根拠が
// 今も立っているかを確かめ、崩れていればその図を読み直す) を通しで行い、
// クリック数とキー入力数を数える。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);

function pin(id, state, author, text, anchor) {
  return "' @pin " + [id, state, author, '2026-09-08T00:03', anchor, text].join('|');
}

const FILES = {
  R0003M_dma_state: ['@startuml', '[*] --> Idle', 'Idle --> Busy : Spi_Start',
    'Error --> Idle : Spi_Reset',
    pin('1', 'open', 'reviewer',
      '対応するリセットフローが無い / 根拠: R0003M_dma_seq に Spi_Reset が無い',
      'Error --> Idle : Spi_Reset'),
    '@enduml'].join('\n'),
  R0003M_dma_seq: ['@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
    'Spi_Driver -> DmaCtrl : Spi_Transmit()',
    'Spi_Driver -> DmaCtrl : Spi_Reset()', '@enduml'].join('\n'),
};

test('measure: 手書き指摘の根拠を確かめて読み直す', async ({ page }) => {
  let clicks = 0;
  let keys = 0;
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (a) => {
    await fetch('/autosave?dir=' + encodeURIComponent(a.dir), { method: 'DELETE' });
    for (const name of Object.keys(a.files)) {
      await fetch('/autosave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: name, dir: a.dir, dsl: a.files[name] }),
      });
    }
  }, { files: FILES, dir: DIR });
  await page.waitForTimeout(300);

  // 1) 受信箱を開く。
  await page.locator('#btn-tab-inbox').click(); clicks++;
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForFunction(() => {
    var h = document.querySelector('#inbox-panel .ib-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });

  // ここで「根拠が崩れた 1 件」が読める。22 枚を読み直す必要が無い。
  await expect(page.locator('#ib-claims')).toContainText('根拠が崩れた 1 件');

  // 2) 崩れた行を押して、根拠の図のその行へ行く。
  await page.locator('#ib-claims .ib-claim-row').first().click(); clicks++;
  await page.waitForTimeout(1200);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'R0003M_dma_seq');

  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);

  console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
