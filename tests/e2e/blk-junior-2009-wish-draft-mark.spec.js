// @ts-check
// BLK-junior-20260907-2009-wish: やり直しの練習で残す控え (*_TYPO_interim) が
// 保存フォルダに溜まり、📂 一覧で本物の成果物と同じ並びに混ざっていた。
// 「🗂 一時控え」で印を付けると一覧では畳まれ、成果物だけが並ぶ。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);
const REAL = ['J2009_CanUseCase', 'J2009_UartSequence'];
const DRAFTS = ['J2009_Gpio_TYPO_interim', 'J2009_Uart_TYPO_interim', 'J2009_Can_TYPO_interim'];
const DSL = '@startuml\nstart\n:初期化する;\nstop\n@enduml';

async function bootWithDir(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function putFile(page, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: DSL, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

async function closeFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open', { state: 'detached' }).catch(() => {});
}

// 一覧に「今この場に出ている」図の名前。畳まれた控えはここに現れない。
async function visibleNames(page) {
  return page.locator('#folder-panel .folder-item').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-file-name')));
}

test.describe('BLK-junior-2009-wish: 一時控えに印を付けて一覧から畳む', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    for (const n of REAL.concat(DRAFTS)) await putFile(page, n);
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('印を付ける前は成果物も控えも同じ並びに混ざっている', async ({ page }) => {
    await openFolder(page);
    const names = await visibleNames(page);
    for (const n of REAL.concat(DRAFTS)) expect(names).toContain(n);
    // 控えの印はまだ 1 件も付いていない
    await expect(page.locator('#folder-panel .folder-draft-toggle')).toHaveCount(0);
  });

  test('一覧の行から控えの印を付けると、畳まれて成果物だけが並ぶ', async ({ page }) => {
    await openFolder(page);
    let clicks = 1;   // 📂 一覧
    for (const n of DRAFTS) {
      await page.locator('#folder-panel .folder-draft[data-draft-name="' + n + '"]').click();
      clicks++;
      await page.waitForTimeout(250);
    }
    const toggle = page.locator('#folder-panel .folder-draft-toggle');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute('data-draft-count', String(DRAFTS.length));
    await expect(toggle).toContainText('一時控え ' + DRAFTS.length + ' 件を出す');

    const names = await visibleNames(page);
    for (const n of REAL) expect(names).toContain(n);
    for (const n of DRAFTS) expect(names).not.toContain(n);
    // 3 件の控えを畳むのに、一覧を開く 1 + 印 3 = 4 クリック
    expect(clicks).toBe(4);
  });

  test('畳んだ控えは「出す」で読め、もう一度押すと畳まれる', async ({ page }) => {
    await openFolder(page);
    for (const n of DRAFTS) {
      await page.locator('#folder-panel .folder-draft[data-draft-name="' + n + '"]').click();
      await page.waitForTimeout(200);
    }
    await page.locator('#folder-panel .folder-draft-toggle').click();
    await page.waitForTimeout(300);
    let names = await visibleNames(page);
    for (const n of DRAFTS) expect(names).toContain(n);
    await expect(page.locator('#folder-panel .folder-draft-toggle'))
      .toContainText('一時控え ' + DRAFTS.length + ' 件を畳む');
    // 控えの行はそれと分かる印が付いている
    await expect(page.locator('#folder-panel .folder-row-draft')).toHaveCount(DRAFTS.length);

    await page.locator('#folder-panel .folder-draft-toggle').click();
    await page.waitForTimeout(300);
    names = await visibleNames(page);
    for (const n of DRAFTS) expect(names).not.toContain(n);
  });

  test('「全部選ぶ」は畳んだ控えを掴まない', async ({ page }) => {
    await openFolder(page);
    for (const n of DRAFTS) {
      await page.locator('#folder-panel .folder-draft[data-draft-name="' + n + '"]').click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('#folder-panel .folder-pick-all'))
      .toContainText('全部選ぶ（' + REAL.length + ' 枚）');
    await page.locator('#folder-panel .folder-pick-all').click();
    await expect(page.locator('#folder-panel .folder-pick:checked')).toHaveCount(REAL.length);
  });

  test('印は一覧を閉じて開き直しても残る', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-panel .folder-draft[data-draft-name="' + DRAFTS[0] + '"]').click();
    await page.waitForTimeout(250);
    await closeFolder(page);
    await openFolder(page);
    const names = await visibleNames(page);
    expect(names).not.toContain(DRAFTS[0]);
    await expect(page.locator('#folder-panel .folder-draft-toggle')).toContainText('一時控え 1 件を出す');
  });

  test('上部バーの「🗂 一時控え」で、開いている図そのものに印を付けられる', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + DRAFTS[0] + '"]').click();
    await page.waitForTimeout(1000);

    const btn = page.locator('#btn-tab-draft');
    await expect(btn).toContainText('🗂 一時控え');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toContainText('一時控え中');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');

    await openFolder(page);
    const names = await visibleNames(page);
    expect(names).not.toContain(DRAFTS[0]);

    // もう一度押せば成果物に戻る (やり直しの控えを本採用にする道が残る)
    await closeFolder(page);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await openFolder(page);
    expect(await visibleNames(page)).toContain(DRAFTS[0]);
  });
});
