// @ts-check
// BLK-primary-20260908-1303: 📂 一覧の SVG 集計行が「SVG: 古い 2 枚」と出るのに、
// 同じ画面の「古い SVG を作り直す」は「古い SVG はありません」で押せなかった。
// primary は毎回「内容はすべて確かめてあります」まで開いて、本当に古いのかを
// 確かめ直していた。集計行とボタンが同じ基準で数えることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);

async function bootWithDir(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-tools-folded', '0');
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

async function putSvg(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
    });
    return r.status;
  }, { name, dir: DIR });
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

const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';
const A2 = '@startuml\nparticipant A\nA -> B: go\nB -> C: next\n@enduml';

// 保存し直しただけで中身は同じ図を 2 枚作る (primary が見た状態)。
async function twoTouched(page) {
  await clearDir(page);
  await putFile(page, 'P1303_a', A1);
  await putFile(page, 'P1303_b', A2);
  expect(await putSvg(page, 'P1303_a')).toBe(200);
  expect(await putSvg(page, 'P1303_b')).toBe(200);
  // mtime は秒精度。同じ中身で puml を保存し直し、svg より新しくする。
  await page.waitForTimeout(1200);
  await putFile(page, 'P1303_a', A1);
  await putFile(page, 'P1303_b', A2);
}

test('中身が一致していれば集計行も「古い」と言わない', async ({ page }) => {
  await bootWithDir(page);
  await twoTouched(page);
  await openFolder(page);

  const sum = page.locator('#folder-panel .folder-svg-summary').first();
  // ここが「SVG: 古い 2 枚」と出ていたのが起票の中身。
  await expect(sum).not.toContainText('古い 2 枚');
  await expect(sum).toContainText('2 枚とも puml に追いついています');
  // なぜ 0 枚なのかを、下まで開かなくても見出しから読める。
  await expect(sum).toContainText('中身が一致した 2 枚は作り直し不要');
  await expect(page.locator('#folder-svg-render')).toContainText('古い SVG はありません');
  await expect(page.locator('#folder-svg-render')).toBeDisabled();
});

test('本当に古い図があれば、集計行とボタンが同じ枚数を言う', async ({ page }) => {
  await bootWithDir(page);
  await twoTouched(page);
  // 1 枚だけ中身を変える。これは作り直しが要る。
  await putFile(page, 'P1303_b', A1);
  await openFolder(page);

  const sum = page.locator('#folder-panel .folder-svg-summary').first();
  await expect(sum).toContainText('古い 1 枚');
  await expect(sum).toContainText('中身が一致した 1 枚は作り直し不要');
  await expect(page.locator('#folder-svg-render')).toContainText('古い SVG を作り直す（1 枚）');
  await expect(page.locator('#folder-svg-render')).toBeEnabled();
});

test('SVG が無い図はそのまま数える (内容一致になりようがない)', async ({ page }) => {
  await bootWithDir(page);
  await clearDir(page);
  await putFile(page, 'P1303_c', A1);
  await openFolder(page);

  await expect(page.locator('#folder-panel .folder-svg-summary').first()).toContainText('無い 1 枚');
  await expect(page.locator('#folder-panel .folder-svg-summary').first()).not.toContainText('作り直し不要');
  await expect(page.locator('#folder-svg-render')).toContainText('古い SVG を作り直す（1 枚）');
});
