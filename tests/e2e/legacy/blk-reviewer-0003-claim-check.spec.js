// @ts-check
// BLK-reviewer-20260908-0003: 手で書いた指摘は audit.js のどの監査にも当たらないので、
// 根拠 (別の図の中身) が消えても「DSL 無変更 → 前回のまま」で何 run も引き継がれた。
// 指摘の末尾に「根拠: 図名 に 語 が無い」を書いておけば、受信箱を開いた時点で
// 崩れた根拠だけが名指しで出て、読み直す先へ 1 クリックで飛べることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);

function pin(id, state, author, text, anchor) {
  return "' @pin " + [id, state, author, '2026-09-08T00:03', anchor, text].join('|');
}

// 起票時の状況: dma_state の指摘は「dma_transfer_sequence に Spi_Reset が無い」が根拠。
// その後 dma_transfer_sequence に Spi_Reset() が書かれ、根拠は崩れている。
// もう 1 件 (uart) の根拠はまだ立っている。
const FILES = {
  R0003_dma_state: [
    '@startuml', '[*] --> Idle', 'Idle --> Busy : Spi_Start', 'Error --> Idle : Spi_Reset',
    pin('1', 'open', 'reviewer',
      '対応するリセットフローが無い / 根拠: R0003_dma_seq に Spi_Reset が無い',
      'Error --> Idle : Spi_Reset'),
    '@enduml',
  ].join('\n'),
  R0003_dma_seq: [
    '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
    'Spi_Driver -> DmaCtrl : Spi_Transmit()',
    'Spi_Driver -> DmaCtrl : Spi_Reset()',
    '@enduml',
  ].join('\n'),
  R0003_uart_state: [
    '@startuml', '[*] --> Off', 'Off --> On : Uart_Open',
    pin('1', 'open', 'reviewer',
      'Close が無い / 根拠: R0003_uart_seq に Uart_Close が無い', 'Off --> On : Uart_Open'),
    '@enduml',
  ].join('\n'),
  R0003_uart_seq: [
    '@startuml', 'participant Uart_Driver', 'Uart_Driver -> Hw : Uart_Open()', '@enduml',
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

async function putFiles(page) {
  await page.evaluate(async (a) => {
    for (const name of Object.keys(a.files)) {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: name, dir: a.dir, dsl: a.files[name] }),
      });
    }
  }, { files: FILES, dir: DIR });
}

async function openInbox(page) {
  await page.locator('#btn-tab-inbox').click();
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForFunction(() => {
    var h = document.querySelector('#inbox-panel .ib-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });
}

test.describe('BLK-reviewer-20260908-0003: 手書き指摘の根拠の風化', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFiles(page);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('受信箱を開くだけで、根拠が崩れた指摘が名指しで出る', async ({ page }) => {
    await openInbox(page);
    const claims = page.locator('#ib-claims');
    await expect(claims).toHaveAttribute('data-claims', '2');
    await expect(claims).toHaveAttribute('data-broken', '1');
    await expect(claims).toContainText('根拠が崩れた 1 件');

    // 崩れているのは dma の 1 件だけ。uart の根拠はまだ立っているので出ない。
    const rows = page.locator('#ib-claims .ib-claim-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-doc', 'R0003_dma_state');
    // 何が変わったかまで言う (読み直す前に、直っただけかどうかが分かる)。
    await expect(rows.first()).toContainText('R0003_dma_seq に Spi_Reset が L5 に書かれている');
  });

  test('崩れた行を押すと、根拠の図のその行へ運ばれる', async ({ page }) => {
    await openInbox(page);
    await page.locator('#ib-claims .ib-claim-row').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'R0003_dma_seq');
    expect(await page.locator('#editor').inputValue()).toContain('Spi_Reset()');
  });

  test('根拠の図が直れば、次に開いたときは崩れが消える', async ({ page }) => {
    await openInbox(page);
    await expect(page.locator('#ib-claims')).toHaveAttribute('data-broken', '1');

    // Spi_Reset() の行を消す = 指摘の根拠が立ち直る。
    await page.evaluate(async (a) => {
      await fetch('/autosave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'R0003_dma_seq', dir: a.dir, dsl: a.dsl }),
      });
    }, { dir: DIR, dsl: ['@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
      'Spi_Driver -> DmaCtrl : Spi_Transmit()', '@enduml'].join('\n') });

    await page.locator('#ib-reload').click();
    await page.waitForFunction(() => {
      var el = document.getElementById('ib-claims');
      return el && el.getAttribute('data-broken') === '0';
    });
    await expect(page.locator('#ib-claims')).toContainText('すべて根拠は立っています');
    await expect(page.locator('#ib-claims .ib-claim-row')).toHaveCount(0);
  });

  test('指摘欄の書き方に、根拠の書き方が出ている', async ({ page }) => {
    await page.locator('#btn-tab-pins').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#pin-text')).toHaveAttribute('placeholder', /根拠/);
  });
});
