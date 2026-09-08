// @ts-check
// reviewer 台本 手順4.10: SVG の実体一致を確認する。
// BLK-reviewer-20260908-2003-wish: 印 (@pua-source-sha1) が付いた図は一覧の判定だけで
// 片が付くようになった一方、印を刻む前に保存された図は要約の「未確認 N 枚」に件数として
// しか出ず、その 1 枚がどれかは audit.js を回して突き止めていた。
// 一覧の行に「未刻印」と puml / SVG の両方の時刻が出て、名前の行からその図だけを
// 確かめられれば、手順4.10 は一覧の中で完結する。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);

const NOW = '@startuml\nparticipant Spi_Driver\nparticipant Mcu\n'
  + 'Spi_Driver -> Mcu: init\nMcu -> Spi_Driver: done\n@enduml';

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

function putFile(page, name, dsl) {
  return page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

function render(page, dsl) {
  return page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, dsl);
}

// 印の付いた svg (GUI から書き出した図と同じ道)。
async function putStampedSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  await page.evaluate(async (a) => {
    await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: a.svg }),
    });
  }, { name, dir: DIR, svg });
}

// 印を刻む前から保存フォルダにある svg。app を通さずに置くので fs で書く。
async function putRawSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  fs.writeFileSync(path.join(ABS, name + '.svg'), svg, 'utf-8');
}

// 同じものを任意のフォルダに置く (覗き先の図を用意するため)。
async function putRawSvgIn(page, dir, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  const abs = path.join(__dirname, '..', '..', '..', dir.replace(/^\.\//, ''));
  fs.writeFileSync(path.join(abs, name + '.svg'), svg, 'utf-8');
}

function clearDir(page) {
  return page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

test('手順4.10 印の無い SVG を一覧の上で名指しし、その図だけを確かめられる', async ({ page }) => {
  test.setTimeout(180000);
  await bootWithDir(page);
  await clearDir(page);
  await putFile(page, 'R04g_stamped', NOW);
  await putFile(page, 'R04g_raw', NOW);
  await putStampedSvg(page, 'R04g_stamped', NOW);
  await putRawSvg(page, 'R04g_raw', NOW);

  await openFolder(page);

  // 到達条件その1: 印のある図は一覧の判定だけで片が付き、印の無い図だけが名指しされる。
  const stamped = page.locator('#folder-panel .folder-item[data-file-name="R04g_stamped"]');
  const raw = page.locator('#folder-panel .folder-item[data-file-name="R04g_raw"]');
  await expect(raw.locator('[data-svg-content="unverified"]')).toHaveText('未刻印');
  await expect(stamped.locator('[data-svg-content="unverified"]')).toHaveCount(0);

  // 到達条件その2: puml の保存時刻と SVG の書き出し時刻が同じ行に並ぶ
  // (「puml は直っているが SVG だけ古い」を ls -l に戻らず言える)。
  await expect(raw.locator('.folder-mtime')).toHaveText(/\d\d\/\d\d \d\d:\d\d/);
  await expect(raw.locator('.folder-svg-mtime')).toHaveText(/^SVG \d\d\/\d\d \d\d:\d\d$/);

  // 到達条件その2b: 2 つの時刻の隣に labels の突合結果が並ぶ。render を回して
  // labels をテキストで手で突き合わせる作業が、この 1 列で置き換わる。
  await expect(stamped.locator('.folder-svg-labels')).toHaveText('labels 一致');
  await expect(raw.locator('.folder-svg-labels')).toHaveText('labels 未確認');
  await expect(page.locator('#folder-svg-labels-summary'))
    .toHaveText('labels: 一致 1 枚 / 未確認 1 枚');

  // 到達条件その3: 名前の行にその 1 枚が並び、そこから確かめに入れる。
  const row = page.locator('#folder-svg-unstamped');
  await expect(row.locator('.folder-svg-name')).toHaveText(['R04g_raw']);
  const only = row.locator('.folder-svg-names-verify');
  await expect(only).toHaveText('この 1 枚だけ中身を確かめる');
  await only.click();

  // 到達条件その4: 確かめ終われば未刻印は消え、一覧だけで内容の一致を言える。
  await expect(page.locator('#folder-svg-content'))
    .toContainText('2 枚とも今の puml から作られています', { timeout: 120000 });
  await expect(page.locator('#folder-svg-unstamped')).toHaveCount(0);
  await expect(page.locator('#folder-svg-labels-summary'))
    .toHaveText('labels: 2 枚とも今の puml と一致しています');
});

// BLK-reviewer-20260909-0603-wish: 同じ手順4.10 でも、見るのが他人のフォルダ
// (primary が置いた図) のときは、GUI の「他のフォルダを見る」一覧にファイル名と
// 更新日時しか出ず、puml と svg の中身が食い違っているかは分からなかった。
// 実際 primary/diagram1.puml の書き換えに svg が追いついていない事故に気付けたのは、
// reviewer が毎回 CLI で /verify-svg を叩いていたからで、GUI からではない。
// 覗いた一覧の行に最初から印が付き、印だけでは言えない図もその場で確かめられる
// ことを到達条件にする。
const PEEK_ROOT = DIR + '-peek';
const MY_DIR = PEEK_ROOT + '/reviewer';
const OTHER_DIR = PEEK_ROOT + '/primary';

const OLD_DSL = '@startuml\nparticipant Spi_Drv\nparticipant Mcu\n'
  + 'Spi_Drv -> Mcu: init\n@enduml';

function putFileIn(page, dir, name, dsl) {
  return page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir });
}

async function putStampedSvgIn(page, dir, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  await page.evaluate(async (a) => {
    await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: a.svg }),
    });
  }, { name, dir, svg });
}

test('手順4.10 他人のフォルダを覗いた一覧にも SVG の鮮度が最初から出る', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, MY_DIR);
  await gotoApp(page);
  await page.evaluate(async (a) => {
    for (const d of [a.mine, a.other]) {
      await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
    }
  }, { mine: MY_DIR, other: OTHER_DIR });
  // 自分のフォルダにも 1 枚置く (覗き先の一覧が「隣のフォルダ」として出る形にする)。
  await putFileIn(page, MY_DIR, 'R04g_mine', NOW);
  // 追いついている図 / 書き換えに svg が追いついていない図 / 印を刻む前の svg。
  await putFileIn(page, OTHER_DIR, 'R04g_ok', NOW);
  await putStampedSvgIn(page, OTHER_DIR, 'R04g_ok', NOW);
  await putFileIn(page, OTHER_DIR, 'R04g_drift', OLD_DSL);
  await putStampedSvgIn(page, OTHER_DIR, 'R04g_drift', OLD_DSL);
  await putFileIn(page, OTHER_DIR, 'R04g_drift', NOW);      // puml だけ書き換える
  await putFileIn(page, OTHER_DIR, 'R04g_raw', NOW);
  await putRawSvgIn(page, OTHER_DIR, 'R04g_raw', NOW);

  // 到達条件その1: 覗いただけで (隣が 1 つなので追加のクリック無しで) 印が並ぶ。
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  const files = page.locator('#peek-files');
  await expect(files.locator('.peek-file[data-file-name="R04g_ok"] .peek-svg-badge'))
    .toHaveText('内容一致');
  await expect(files.locator('.peek-file[data-file-name="R04g_drift"] .peek-svg-badge'))
    .toHaveText('内容ずれ');
  await expect(files.locator('.peek-file[data-file-name="R04g_raw"] .peek-svg-badge'))
    .toHaveText('未刻印');

  // 到達条件その2: フォルダ全体の答えが 1 行で出る (/verify-svg を叩き直さない)。
  await expect(page.locator('#peek-svg-summary'))
    .toHaveText('内容: 一致 1 枚 / ずれ 1 枚 / 未確認 1 枚');

  // 到達条件その3: 印だけでは言えない図は、その場で上書きせずに確かめられる。
  const verify = page.locator('#peek-svg-verify');
  await expect(verify).toHaveText('SVG の中身を確かめる（2 枚）');
  await verify.click();
  await expect(page.locator('#peek-svg-summary'))
    .toHaveText('内容: 一致 2 枚 / ずれ 1 枚', { timeout: 120000 });
  await expect(files.locator('.peek-file[data-file-name="R04g_raw"] .peek-svg-badge'))
    .toHaveText('内容一致');
  // 確かめても、ずれている図は「ずれ」のまま (作り直しは持ち主の仕事)。
  await expect(files.locator('.peek-file[data-file-name="R04g_drift"] .peek-svg-badge'))
    .toHaveText('内容ずれ');
});
