const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-reviewer-20260907-1803 (wish):
// 「変更図だけを、前回見た版と並べて読む」。バッジ (BLK-1403) までは出ていたが、
// どこが変わったかは自作の diff で見るしかなかった。控えに本文を足して、
// 一覧から [差分] を押すだけで旧DSL/新DSL が左右に並ぶようにする。
const DIR = saveDirFor(__filename);

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

async function putFile(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
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
  await page.waitForTimeout(150);
}

async function markSeen(page) {
  await page.locator('#folder-panel .folder-mark-seen').click();
  await page.waitForSelector('#folder-panel .folder-item[data-review-status="unchanged"]');
}

const A1 = '@startuml\n[*] --> Idle\nIdle --> Busy : 開始\nBusy --> Idle : 完了\n@enduml';
// Busy --> Idle の語尾を直し、異常遷移を 1 行足した版
const A2 = '@startuml\n[*] --> Idle\nIdle --> Busy : 開始\nBusy --> Idle : 完了する\nBusy --> Fault : 異常\n@enduml';
const B1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';

test.describe('BLK-reviewer-1803-wish: 変更図を旧版と並べて読む', () => {
  test('変更図にだけ [差分] が付き、押すと旧DSL/新DSL が左右に並ぶ', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1803W_a', A1);
    await putFile(page, 'R1803W_b', B1);

    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await putFile(page, 'R1803W_a', A2);
    await openFolder(page);

    // 変わった図にだけボタンが出る (無変更の図は開く必要が無い)
    await expect(page.locator('#folder-panel .folder-diff[data-diff-name="R1803W_a"]')).toHaveCount(1);
    await expect(page.locator('#folder-panel .folder-diff[data-diff-name="R1803W_b"]')).toHaveCount(0);

    await page.locator('#folder-panel .folder-diff[data-diff-name="R1803W_a"]').click();
    await page.waitForSelector('#rd-modal #rd-list .rd-row');

    await expect(page.locator('#rd-head .rd-title')).toHaveText('R1803W_a');
    await expect(page.locator('#rd-head .rd-stats')).toContainText('書換 1 行');
    await expect(page.locator('#rd-head .rd-stats')).toContainText('追加 1 行');

    // 書き換えた行は左に旧、右に新が並ぶ
    const chg = page.locator('#rd-list .rd-row[data-rd-kind="change"]');
    await expect(chg).toHaveCount(1);
    await expect(chg.locator('.rd-side-left .rd-text')).toHaveText('Busy --> Idle : 完了');
    await expect(chg.locator('.rd-side-right .rd-text')).toHaveText('Busy --> Idle : 完了する');

    // 足した行は右だけに出る
    const add = page.locator('#rd-list .rd-row[data-rd-kind="add"]');
    await expect(add).toHaveCount(1);
    await expect(add.locator('.rd-side-right .rd-text')).toHaveText('Busy --> Fault : 異常');
    await expect(add.locator('.rd-side-left .rd-text')).toHaveText('');
  });

  test('同じ行は畳まれ、押せば全部出る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    const long = ['@startuml', 'participant A', 'participant B', 'participant C',
      'participant D', 'participant E', 'A -> B: go', '@enduml'].join('\n');
    await putFile(page, 'R1803W_c', long);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await putFile(page, 'R1803W_c', long.replace('A -> B: go', 'A -> B: start'));
    await openFolder(page);
    await page.locator('#folder-panel .folder-diff[data-diff-name="R1803W_c"]').click();
    await page.waitForSelector('#rd-modal #rd-list .rd-row');

    await expect(page.locator('#rd-list .rd-skip')).toHaveCount(1);
    await expect(page.locator('#rd-list .rd-skip')).toContainText('同じ行');
    const foldedRows = await page.locator('#rd-list .rd-row').count();

    await page.locator('#rd-foot .rd-toggle').click();
    await expect(page.locator('#rd-list .rd-skip')).toHaveCount(0);
    expect(await page.locator('#rd-list .rd-row').count()).toBeGreaterThan(foldedRows);
  });

  test('新しい図は「控えがありません」と出て、全行が追加として並ぶ', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1803W_a', A1);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await putFile(page, 'R1803W_new', B1);
    await openFolder(page);
    await page.locator('#folder-panel .folder-diff[data-diff-name="R1803W_new"]').click();
    await page.waitForSelector('#rd-modal #rd-list .rd-row');
    await expect(page.locator('#rd-head .rd-stats')).toContainText('控えがありません');
    await expect(page.locator('#rd-list .rd-row[data-rd-kind="add"]')).toHaveCount(4);
    await expect(page.locator('#rd-list .rd-row[data-rd-kind="same"]')).toHaveCount(0);
  });

  test('変更図だけ印を付けて、その場でまとめて開ける', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1803W_a', A1);
    await putFile(page, 'R1803W_b', B1);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await putFile(page, 'R1803W_a', A2);
    await openFolder(page);
    const btn = page.locator('#folder-panel .folder-pick-changed');
    await expect(btn).toContainText('1 枚');
    await btn.click();
    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="R1803W_a"]')).toBeChecked();
    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="R1803W_b"]')).not.toBeChecked();

    await page.locator('#folder-panel .folder-open-many').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#tab-bar .tab[data-doc-name="R1803W_a"]')).toHaveCount(1);
    await expect(page.locator('#tab-bar .tab[data-doc-name="R1803W_b"]')).toHaveCount(0);
  });

  test('変更が無い日は [差分] が 1 つも出ず、変更図だけ選ぶも押せない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1803W_a', A1);
    await putFile(page, 'R1803W_b', B1);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('すべて前回見た版のまま');
    await expect(page.locator('#folder-panel .folder-diff')).toHaveCount(0);
    await expect(page.locator('#folder-panel .folder-pick-changed')).toBeDisabled();
  });

  test('差分ビューから図を開いて、その場で直せる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1803W_a', A1);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await putFile(page, 'R1803W_a', A2);
    await openFolder(page);
    await page.locator('#folder-panel .folder-diff[data-diff-name="R1803W_a"]').click();
    await page.waitForSelector('#rd-modal #rd-list .rd-row');
    await page.locator('#rd-foot .rd-open').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#rd-modal')).toBeHidden();
    await expect(page.locator('#tab-bar .tab[data-doc-name="R1803W_a"]')).toHaveCount(1);
    expect(await page.locator('#editor').inputValue()).toContain('Busy --> Fault');
  });
});
