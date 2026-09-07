const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-reviewer-20260907-2203 (wish):
// 「前回から無変更」と確かめた日は、前回の指摘一覧をそのまま今回の指摘として複製し、
// 「前回から無変更のため再突合なし」を 1 行付けて確定する。
// 図が無変更でも監査ツールの構えが変われば新しい指摘が出るので、そのときは複製せず再突合を促す。
const DIR = './autosave-e2e-blk-r2203w';

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

// 指摘 2 件が付いた状態遷移図と、指摘の無いシーケンス図。
const A1 = ['@startuml',
  "' @pin 1|open|reviewer|2026-09-07T19:03|Idle --> Busy : Timer_StartConv|対応する method が無い",
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : 完了',
  '@enduml'].join('\n');
const A2 = A1.replace('Busy --> Idle : 完了', 'Busy --> Idle : 完了する');
const B1 = ['@startuml',
  "' @pin 2|read|primary|2026-09-07T19:03|A -> B: go|粒度がそろっていない",
  'participant A',
  'A -> B: go',
  '@enduml'].join('\n');

const CARRY = '#folder-panel .folder-carry';
const NOTE = '#folder-panel .folder-carry-note';

test.describe('BLK-reviewer-2203-wish: 無変更の日は前回の指摘をそのまま確定する', () => {
  test('無変更なら 3 操作で確定でき、注記が 1 行付く', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R2203W_a', A1);
    await putFile(page, 'R2203W_b', B1);

    // 前回の review: ここまで見たことにする (指摘一覧も一緒に控える)
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    // 今回の review: 一覧を開く → 変更 0 枚 → 複製ボタン の 3 操作
    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('すべて前回見た版のまま');
    const btn = page.locator(CARRY);
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute('data-carry-count', '2');
    await expect(btn).toContainText('2 件');
    await btn.click();

    // 確定の中身は画面に残る (複製元の時刻と注記)
    await expect(page.locator(NOTE)).toContainText('から複製');
    await expect(page.locator(NOTE)).toContainText('前回から無変更のため再突合なし');

    // 控えは保存フォルダごとに残り、注記は積み上がらない
    const rec = await page.evaluate((d) => JSON.parse(
      window.localStorage.getItem(window.MA.reviewCarry.storageKey(d))), DIR);
    expect(rec.pins.length).toBe(2);
    expect(rec.notes).toEqual(['前回から無変更のため再突合なし']);
    expect(rec.carriedFrom).toBeTruthy();
  });

  test('変更図があれば複製できず、理由を言う', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R2203W_a', A1);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    await putFile(page, 'R2203W_a', A2);
    await openFolder(page);
    await expect(page.locator(CARRY)).toBeDisabled();
    await expect(page.locator(NOTE)).toHaveAttribute('data-carry-reason', 'changed');
    await expect(page.locator(NOTE)).toContainText('変更 1 枚');
  });

  test('図が無変更でも監査カテゴリが増えていたら再突合を促す', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R2203W_a', A1);
    await openFolder(page);
    await markSeen(page);
    await closeFolder(page);

    // 監査ツール側の改修で consistency にカテゴリが 1 つ増えた状況を作る
    await page.evaluate(() => {
      const orig = window.MA.consistency.check;
      window.MA.consistency.check = function(docs) {
        const r = orig.apply(this, arguments);
        r.newCategory = [];
        return r;
      };
    });

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('すべて前回見た版のまま');
    await expect(page.locator(CARRY)).toBeDisabled();
    const note = page.locator(NOTE);
    await expect(note).toHaveAttribute('data-carry-reason', 'audit-changed');
    await expect(note).toContainText('再突合');
    await expect(note).toContainText('増えた監査');
    await expect(note).toHaveClass(/recheck/);
  });

  test('前回の控えが無ければ複製ボタンは押せない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R2203W_a', A1);
    await openFolder(page);
    await expect(page.locator(CARRY)).toBeDisabled();
    await expect(page.locator(NOTE)).toHaveAttribute('data-carry-reason', 'no-record');
  });
});
