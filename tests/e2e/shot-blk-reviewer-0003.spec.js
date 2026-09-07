const { test } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-reviewer-20260908-0003 の画面写真。📥 指摘箱の先頭に「根拠が崩れた指摘」が
// 名指しで出ているところを撮る。
const DIR = './autosave-shot-r0003';
const OUT = process.env.SHOT_OUT || 'shot-blk-reviewer-0003.png';

function pin(id, state, author, text, anchor) {
  return "' @pin " + [id, state, author, '2026-09-08T00:03', anchor, text].join('|');
}
const FILES = {
  R0003S_dma_state: ['@startuml', '[*] --> Idle', 'Idle --> Busy : Spi_Start',
    'Error --> Idle : Spi_Reset',
    pin('1', 'open', 'reviewer',
      '対応するリセットフローが無い / 根拠: R0003S_dma_seq に Spi_Reset が無い',
      'Error --> Idle : Spi_Reset'),
    '@enduml'].join('\n'),
  R0003S_dma_seq: ['@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
    'Spi_Driver -> DmaCtrl : Spi_Transmit()',
    'Spi_Driver -> DmaCtrl : Spi_Reset()', '@enduml'].join('\n'),
  R0003S_uart_state: ['@startuml', '[*] --> Off', 'Off --> On : Uart_Open',
    pin('1', 'open', 'reviewer',
      'Close が無い / 根拠: R0003S_uart_seq に Uart_Close が無い', 'Off --> On : Uart_Open'),
    '@enduml'].join('\n'),
  R0003S_uart_seq: ['@startuml', 'participant Uart_Driver',
    'Uart_Driver -> Hw : Uart_Open()', '@enduml'].join('\n'),
};

test('shot: 根拠が崩れた指摘', async ({ page }) => {
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
  await page.locator('#btn-tab-inbox').click();
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForFunction(() => {
    var h = document.querySelector('#inbox-panel .ib-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT, fullPage: false });
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
});
