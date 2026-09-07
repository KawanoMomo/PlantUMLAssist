const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

// BLK-reviewer-20260907-1403 (wish):
// 「まず全部読んで機械監査して初めて変更なしと分かる」から
// 「バッジが変化した図だけ読む」に業務を変えるための一覧バッジ。
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

const A1 = '@startuml\n[*] --> Idle\nIdle --> Busy\n@enduml';
const A2 = '@startuml\n[*] --> Idle\nIdle --> Busy\nBusy --> Fault\n@enduml';
const B1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';

test.describe('BLK-reviewer-1403: 前回見た版からの差を一覧で出す', () => {
  test('控えが無い初回は全部が新規、控えを取ると全部が変更なしになる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1403_a', A1);
    await putFile(page, 'R1403_b', B1);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('控えがありません');
    // 開いていたタブも保存フォルダに書き出されるので、置いた 2 枚を名指しで見る。
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_a"]'))
      .toHaveAttribute('data-review-status', 'new');
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_b"]'))
      .toHaveAttribute('data-review-status', 'new');
    // 最終保存時刻が図ごとに出る
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_a"] .folder-mtime')).not.toHaveText('');

    await page.locator('#folder-panel .folder-mark-seen').click();
    await page.waitForSelector('#folder-panel .folder-item[data-review-status="unchanged"]');
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('すべて前回見た版のまま');
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_a"] .folder-badge')).toHaveCount(0);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_b"] .folder-badge')).toHaveCount(0);
  });

  test('中身を変えた図だけに変更バッジが付く', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1403_a', A1);
    await putFile(page, 'R1403_b', B1);
    await openFolder(page);
    await page.locator('#folder-panel .folder-mark-seen').click();
    await page.waitForSelector('#folder-panel .folder-item[data-review-status="unchanged"]');
    await closeFolder(page);

    await putFile(page, 'R1403_a', A2);
    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_a"]'))
      .toHaveAttribute('data-review-status', 'changed');
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_b"]'))
      .toHaveAttribute('data-review-status', 'unchanged');
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('変更 1 枚');
  });

  test('中身が同じまま保存し直しただけなら変更なしのまま', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1403_a', A1);
    await openFolder(page);
    await page.locator('#folder-panel .folder-mark-seen').click();
    await page.waitForSelector('#folder-panel .folder-item[data-review-status="unchanged"]');
    await closeFolder(page);

    await putFile(page, 'R1403_a', A1);
    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_a"]'))
      .toHaveAttribute('data-review-status', 'unchanged');
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('すべて前回見た版のまま');
  });

  test('後から増えた図は新規として出る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1403_a', A1);
    await openFolder(page);
    await page.locator('#folder-panel .folder-mark-seen').click();
    await page.waitForSelector('#folder-panel .folder-item[data-review-status="unchanged"]');
    await closeFolder(page);

    await putFile(page, 'R1403_c', B1);
    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1403_c"]'))
      .toHaveAttribute('data-review-status', 'new');
    await expect(page.locator('#folder-panel .folder-summary')).toContainText('新規 1 枚');
  });

  test('バッジが付いていても図はこれまでどおり開ける', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1403_a', A1);
    await openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="R1403_a"]').click();
    await page.waitForTimeout(500);
    expect(await page.locator('#editor').inputValue()).toContain('Idle');
    await expect(page.locator('#tab-bar .tab[data-doc-name="R1403_a"]')).toHaveCount(1);
  });
});
