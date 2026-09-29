const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-junior-20260908-0630-wish: 指摘に対応するたびに「元図(レビュー反映).puml」を
// 別名で保存していたので、📂 一覧に同じ題材が 2 枚並び、手順 1・9 でどちらを開くか
// 毎回名前を読み比べていた。1 枚のままバッジで未反映 / 反映済みを見分けられること、
// 未反映の図だけを 1 押しで選べることを確かめる。
const DIR = saveDirFor(__filename);

const PIN_OPEN = "' @pin 1|open|reviewer|2026-09-08T06:30|Gpio_Init() : 電源系との依存が抜けている";
const PIN_DONE = "' @pin 1|done|reviewer|2026-09-08T06:30|Gpio_Init()|電源系との依存が抜けている|Gpio_Init()";

function dsl(pinLines) {
  return ['@startuml', 'usecase Gpio_Init()'].concat(pinLines || []).concat(['@enduml']).join('\n');
}

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

async function putFile(page, name, text) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: text, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// 保存先の一覧は FILES の保存先の右クリック「保存先の一覧を開く」で中央の枠に開く
// (BLK-owner-20260924-0637-1。scenarios/_scenario.js の openFolder と同じ経路)。旧経路 (見出しを
// 畳んで開き直す) は FILES の節を開くだけで、一覧の枠は見えないまま待ち続けた。
async function openFolder(page) {
  await require('../scenarios/_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open.is-list .folder-item');
}

// 中央の枠の一覧は ✕ で閉じる (ツリーの保存先節は開いたまま)。旧経路の外側クリックでは閉じない。
async function closeFolder(page) {
  await require('../scenarios/_scenario').closeFolderList(page);
}

function itemOf(page, name) {
  return page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]');
}

test.describe('BLK-junior-20260908-0630-wish: 一覧で指摘の反映状態を見分ける', () => {
  test('server の一覧が指摘の件数を状態ごとに返す', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'J0630_pending', dsl([PIN_OPEN]));
    const e = await page.evaluate(async (d) => {
      const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
      const j = await r.json();
      return (j.entries || []).filter((x) => x.name === 'J0630_pending')[0] || null;
    }, DIR);
    expect(e).not.toBeNull();
    expect(e.pins).toEqual({ open: 1, read: 0, done: 0, total: 1 });
  });

  test('未反映と反映済みのバッジが図名の隣に出て、指摘なしは無印のまま', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'J0630_pending', dsl([PIN_OPEN]));
    await putFile(page, 'J0630_applied', dsl([PIN_DONE]));
    await putFile(page, 'J0630_plain', dsl([]));
    await openFolder(page);

    const pending = itemOf(page, 'J0630_pending').locator('.folder-review-badge');
    await expect(pending).toBeVisible();
    await expect(pending).toHaveAttribute('data-review-state', 'pending');
    await expect(pending).toHaveText('未反映 1/1');

    const applied = itemOf(page, 'J0630_applied').locator('.folder-review-badge');
    await expect(applied).toHaveAttribute('data-review-state', 'applied');
    await expect(applied).toHaveText('反映済 1/1');

    await expect(itemOf(page, 'J0630_plain').locator('.folder-review-badge')).toHaveCount(0);
    await expect(page.locator('#folder-review-summary')).toHaveText('指摘の反映状態: 未反映 1 枚 / 反映済み 1 枚');
  });

  test('指摘を対応済みにして保存し直すと、別名にしなくてもバッジが反映済みに変わる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'J0630_turn', dsl([PIN_OPEN]));
    await openFolder(page);
    await expect(itemOf(page, 'J0630_turn').locator('.folder-review-badge'))
      .toHaveAttribute('data-review-state', 'pending');

    await closeFolder(page);
    await putFile(page, 'J0630_turn', dsl([PIN_DONE]));
    await openFolder(page);
    // 一覧に並ぶのは 1 枚のまま (「(レビュー反映)」の別名が増えない)。
    await expect(page.locator('#folder-panel .folder-item[data-file-name^="J0630_turn"]')).toHaveCount(1);
    await expect(itemOf(page, 'J0630_turn').locator('.folder-review-badge'))
      .toHaveAttribute('data-review-state', 'applied');
  });

  test('「未反映だけ選ぶ」で、指摘が残っている図にだけ印が付く', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'J0630_a', dsl([PIN_OPEN]));
    await putFile(page, 'J0630_b', dsl([PIN_DONE]));
    await putFile(page, 'J0630_c', dsl([]));
    await openFolder(page);

    const btn = page.locator('#folder-panel .folder-pick-pending');
    await expect(btn).toHaveText('未反映だけ選ぶ（1 枚）');
    await expect(btn).toBeEnabled();
    await btn.click();

    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="J0630_a"]')).toBeChecked();
    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="J0630_b"]')).not.toBeChecked();
    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="J0630_c"]')).not.toBeChecked();
  });

  test('未反映が 1 枚も無ければボタンは押せない (押して何も起きない状態を作らない)', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'J0630_done1', dsl([PIN_DONE]));
    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-pick-pending')).toBeDisabled();
    await expect(page.locator('#folder-panel .folder-pick-pending')).toHaveText('未反映だけ選ぶ（0 枚）');
  });
});
