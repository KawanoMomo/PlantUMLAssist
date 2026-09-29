const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// 保存先の一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開き、開くたびに読み直す
// (BLK-owner-20260924-0637-1。scenarios/_scenario.js の openFolder と同じ経路)。
async function openFolder(page) {
  await require('../scenarios/_scenario').openFolder(page);
}

// BLK-reviewer-20260908-1303 の「できるようになったこと」の画。
const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);
const OUT = process.env.SHOT_OUT || path.join(__dirname, '..', '..', '..', 'test-results', 'BLK-reviewer-20260908-1303.png');

const NOW = [
  '@startuml',
  'participant "受注サービス"',
  'participant "倉庫サービス"',
  '"受注サービス" -> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" -> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');
const OLD_ORDER = [
  '@startuml',
  'participant "倉庫サービス"',
  'participant "受注サービス"',
  '"受注サービス" -> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" -> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');

test('shot: 文字に現れない食い違いを構造として出す', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'S1303_order', dir: a.dir, dsl: a.dsl }),
    });
  }, { dir: DIR, dsl: NOW });
  const svg = await page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, OLD_ORDER);
  expect(svg).not.toBeNull();
  fs.writeFileSync(path.join(ABS, 'S1303_order.svg'), svg, 'utf-8');

  await openFolder(page);
  await page.waitForSelector('#folder-panel.open .folder-item');
  // SVG に畳まれた元の DSL と突き合わせるので、一覧を開いた時点で「ずれ 1 枚」と言える
  // (上書きせずに描き直す「SVG の中身を確かめる」は押す対象が無く押せない)。食い違いの中身は「食い違いの中身を調べる」で出す。
  await expect(page.locator('#folder-svg-content')).toContainText('ずれ 1 枚', { timeout: 120000 });
  await page.locator('#folder-svg-diff-scan').click();
  await expect(page.locator('[data-svg-diff="S1303_order"] .diff-structural')).not.toHaveCount(0, { timeout: 120000 });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
