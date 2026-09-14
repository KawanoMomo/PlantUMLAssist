// @ts-check
// BLK-reviewer-20260908-0003-wish: audit.js が拾えない手動の指摘は `指摘.md` に自然文で
// 書くしかなく、次に見るときは全文を読み直していた。指摘に「対象ファイル + 行 + 行の指紋」を
// 持たせ、開いた時点で「未変更のため前回判定を維持」と「要再確認」に仕分かれるのを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);

const FILES = {
  R0003_dma_seq: [
    '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
    'Spi_Driver -> DmaCtrl : Spi_Reset()', 'DmaCtrl --> Spi_Driver : Ack()', '@enduml',
  ].join('\n'),
  R0003_gpio_state: [
    '@startuml', '[*] --> Idle', 'Idle --> Busy : Gpio_Set', '@enduml',
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

async function openFindings(page) {
  // 開いているときに押すと閉じてしまう (他のパネルと同じトグル)。開いていなければ押す。
  const open = await page.locator('#findings-panel.open').count();
  if (!open) await page.locator('#btn-tab-findings').click();
  await page.waitForSelector('#findings-panel.open .mf-head');
  await page.waitForFunction(() => {
    const h = document.querySelector('#findings-panel .mf-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });
}

// 台帳に 2 件入れる (dma_seq の Spi_Reset 行 / gpio_state の遷移行)。
// 画面から足すのと同じ形になるよう、必ずモジュール経由で作る。
async function seed(page) {
  await page.evaluate((a) => {
    const MF = window.MA.manualFindings;
    let list = MF.add([], {
      doc: 'R0003_dma_seq', dsl: a.dma, line: 4,
      text: 'dma_state.puml の Error --> Idle : Spi_Reset に対応するリセットフローが無い',
      author: 'reviewer', at: '2026-09-08T00:03', verdict: '未解消',
    });
    list = MF.add(list, {
      doc: 'R0003_gpio_state', dsl: a.gpio, line: 3,
      text: '復帰遷移が無い', author: 'reviewer', at: '2026-09-08T00:03', verdict: '未解消',
    });
    MF.save(window.localStorage, a.dir, list);
  }, { dma: FILES.R0003_dma_seq, gpio: FILES.R0003_gpio_state, dir: DIR });
}

test.describe('BLK-reviewer-0003-wish: 手動指摘の台帳', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFiles(page, FILES);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('DSL が無変更なら全件「未変更」で、今日読む行が無いと言い切る', async ({ page }) => {
    await seed(page);
    await openFindings(page);
    const head = await page.locator('#findings-panel .mf-head').textContent();
    expect(head).toContain('2 件すべて未変更のため前回判定を維持');
    expect(head).toContain('今日読む行はありません');
    await expect(page.locator('#findings-panel .mf-row[data-mf-keep="1"]')).toHaveCount(2);
    await expect(page.locator('#findings-panel .mf-row.recheck')).toHaveCount(0);
    expect(await page.locator('#btn-tab-findings').textContent()).toContain('0/2');
  });

  test('指摘した行が書き換わった図だけが「要再確認」で先頭に来る', async ({ page }) => {
    await seed(page);
    await putFiles(page, {
      R0003_gpio_state: FILES.R0003_gpio_state.replace('Gpio_Set', 'Gpio_Write'),
    });
    await openFindings(page);
    const head = await page.locator('#findings-panel .mf-head').textContent();
    expect(head).toContain('要再確認 1 件');
    expect(head).toContain('前回判定を維持 1 件');
    const first = page.locator('#findings-panel .mf-row').first();
    await expect(first).toHaveClass(/recheck/);
    expect(await first.textContent()).toContain('R0003_gpio_state');
    expect(await page.locator('#btn-tab-findings').textContent()).toContain('1/2');
  });

  test('上に行が増えただけなら維持のまま、行番号だけ付け直す', async ({ page }) => {
    await seed(page);
    await putFiles(page, {
      R0003_dma_seq: FILES.R0003_dma_seq.replace('@startuml', '@startuml\ntitle DMA 転送'),
    });
    await openFindings(page);
    const row = page.locator('#findings-panel .mf-row[data-mf-id^="R0003_dma_seq"]');
    // 走査した時点で新しい行番号を控えに憶え直すので、画面では L5 の「未変更」になる。
    expect(await row.getAttribute('data-mf-keep')).toBe('1');
    expect(await row.textContent()).toContain('R0003_dma_seq:5');
    expect(await page.locator('#findings-panel .mf-head').textContent()).toContain('今日読む行はありません');
  });

  test('要再確認の行を押すとその図が開き、該当行が選ばれる', async ({ page }) => {
    await seed(page);
    await putFiles(page, {
      R0003_gpio_state: FILES.R0003_gpio_state.replace('Gpio_Set', 'Gpio_Write'),
    });
    await openFindings(page);
    await page.locator('#findings-panel .mf-row.recheck .mf-where').click();
    await page.waitForTimeout(1500);
    const sel = await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel.trim()).toBe('Idle --> Busy : Gpio_Write');
  });

  test('「確認した」を押すと今の行で憶え直し、次からは維持側になる', async ({ page }) => {
    await seed(page);
    await putFiles(page, {
      R0003_gpio_state: FILES.R0003_gpio_state.replace('Gpio_Set', 'Gpio_Write'),
    });
    await openFindings(page);
    await page.locator('#findings-panel .mf-row.recheck button[data-mf-act="confirm"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#findings-panel .mf-row.recheck')).toHaveCount(0);
    expect(await page.locator('#findings-panel .mf-head').textContent()).toContain('今日読む行はありません');
    // 控えに残るので、開き直しても維持のまま
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await openFindings(page);
    expect(await page.locator('#btn-tab-findings').textContent()).toContain('0/2');
  });

  test('図を開いて行を選び、その場で指摘を台帳に足せる', async ({ page }) => {
    await openFindings(page);
    expect(await page.locator('#findings-panel .mf-empty').textContent()).toContain('手動の指摘はまだありません');
    // 図を開いて 3 行目にキャレットを置く
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\n[*] --> Idle\nIdle --> Busy : Gpio_Set\n@enduml';
      ed.dispatchEvent(new Event('input'));
      ed.selectionStart = ed.selectionEnd = ed.value.indexOf('Idle --> Busy');
    });
    await page.waitForTimeout(600);
    await openFindings(page);
    await page.locator('#mf-text').fill('復帰遷移が無い');
    await page.locator('#mf-add').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#findings-panel .mf-row')).toHaveCount(1);
    const row = await page.locator('#findings-panel .mf-row').textContent();
    expect(row).toContain('復帰遷移が無い');
    expect(row).toContain('未変更');
    // 実体 id は「図名#行の指紋」の形
    const id = await page.locator('#findings-panel .mf-row').getAttribute('data-mf-id');
    expect(id).toMatch(/#[0-9a-f]{8}$/);
  });
});
