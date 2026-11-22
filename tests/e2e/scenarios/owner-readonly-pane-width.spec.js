// @ts-check
// TICKET-owner-20261116-0840-1: 幅 1280 の画面で右の枠 (読むだけの図・この図の履歴の比較) を開くと、
// プレビューの列が数十 px に潰れて自分の図・ズームの帯 (− % ＋ Fit)・状態遷移表の切り替えが押せなかった。
// 右の枠を開いてもプレビューの列は自分の図とズームの帯が見える幅を残し、本文欄と枠が縮んで横に並ぶ (重ねない)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = require('./_scenario');

const MINE = ['@startuml', 'title 自分の図', '[*] --> Idle', 'Idle --> Busy : go', 'Busy --> Idle : done', '@enduml', ''].join('\n');
const MINE2 = MINE.replace('@enduml', 'Busy --> [*] : stop\n@enduml');
const SENIOR = ['@startuml', 'title SPI 状態遷移 (先輩)', '[*] --> Uninit', 'Uninit --> Ready : Spi_Init', '@enduml', ''].join('\n');

// id の要素の中心を elementFromPoint で引き、その要素自身 (か中身) に当たるか。当たらなければ当たったものの id。
async function hitOf(page, sel) {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return 'missing';
    const b = e.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) return 'zero';
    const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!t) return 'null';
    if (e.contains(t)) return 'ok';
    const pane = t.closest && t.closest('#senior-pane, #compare-pane');
    return pane ? 'covered-by-' + pane.id : 'other:' + (t.id || t.tagName);
  }, sel);
}

async function rect(page, sel) {
  return page.evaluate((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { left: b.left, right: b.right, width: b.width };
  }, sel);
}

function setup(file, sub) {
  const root = path.join(S.absDirFor(file), sub);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'mine'), { recursive: true });
  fs.mkdirSync(path.join(root, 'senior'), { recursive: true });
  const seniorFile = path.join(root, 'senior', 'spi_state.puml');
  fs.writeFileSync(seniorFile, SENIOR, 'utf8');
  return { root, seniorFile, mine: S.dirFor(file) + '/' + sub + '/mine' };
}

async function openReadonly(page) {
  await page.locator('#files-sec-readonly').click();
  await page.locator('#files-ro-list .files-ro-folder[data-ro-name="senior"]').click();
  await page.locator('#files-ro-list .files-ro-file[data-file-name="spi_state"]').click();
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-svg svg')).toHaveCount(1);
  await page.waitForTimeout(300);
}

for (const [w, h] of [[1280, 720], [1280, 800]]) {
  test('幅 ' + w + '×' + h + ' で読むだけの図を右の枠に出しても、自分の図・ズームの帯・状態遷移表の切り替えは覆われず押せる', async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const env = setup(__filename, 'ro-' + w + 'x' + h);
    const before = fs.statSync(env.seniorFile).mtimeMs;
    await S.bootWithSaveDir(page, env.mine);
    await S.typeDslDrawn(page, MINE);
    const text = await page.locator('#editor').inputValue();
    await openReadonly(page);

    // 横に並ぶ: プレビューの列の右端 ≦ 枠の左端。プレビューの列は自分の図とズームの帯が入る幅がある。
    const pv = await rect(page, '#preview-pane');
    const sp = await rect(page, '#senior-pane');
    const ed = await rect(page, '#editor-pane');
    expect(pv.right).toBeLessThanOrEqual(sp.left);
    expect(ed.right).toBeLessThanOrEqual(pv.left);
    expect(pv.width).toBeGreaterThanOrEqual(280);
    // 右パネルも画面の中に収まる (枠を並べた分が右へはみ出さない)。
    const pp = await rect(page, '#props-pane');
    expect(sp.right).toBeLessThanOrEqual(pp.left);
    expect(pp.right).toBeLessThanOrEqual(w + 0.5);
    const hud = await rect(page, '#zoom-hud');
    expect(hud.left).toBeGreaterThanOrEqual(pv.left);

    for (const sel of ['#hud-zoom-fit', '#hud-zoom-out', '#hud-zoom-in', '#btn-state-table-toggle']) {
      expect(await hitOf(page, sel), sel).toBe('ok');
    }
    expect(await hitOf(page, '#preview-svg svg')).not.toMatch(/^covered-by/);

    // 押せる: Fit と状態遷移表の切り替えを実マウスで押す。本文は変わらない。
    await page.locator('#hud-zoom-fit').click();
    await page.locator('#btn-state-table-toggle').click();
    await page.locator('#btn-state-table-toggle').click();
    expect(await page.locator('#editor').inputValue()).toBe(text);
    expect(fs.statSync(env.seniorFile).mtimeMs).toBe(before);
    expect(fs.readFileSync(env.seniorFile, 'utf8')).toBe(SENIOR);
    fs.rmSync(env.root, { recursive: true, force: true });
  });
}

test('幅 1600 では今と同じく 本文欄・プレビュー・右の枠・右パネル の順に横に並ぶ', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const env = setup(__filename, 'ro-1600');
  await S.bootWithSaveDir(page, env.mine);
  await S.typeDslDrawn(page, MINE);
  await openReadonly(page);
  const ed = await rect(page, '#editor-pane');
  const pv = await rect(page, '#preview-pane');
  const sp = await rect(page, '#senior-pane');
  const pp = await rect(page, '#props-pane');
  expect(ed.right).toBeLessThanOrEqual(pv.left);
  expect(pv.right).toBeLessThanOrEqual(sp.left);
  expect(sp.right).toBeLessThanOrEqual(pp.left);
  expect(sp.width).toBeGreaterThanOrEqual(340);
  for (const sel of ['#hud-zoom-fit', '#btn-state-table-toggle']) expect(await hitOf(page, sel), sel).toBe('ok');
  fs.rmSync(env.root, { recursive: true, force: true });
});

test('幅 1280 でこの図の履歴の「比較」を開いても、プレビューの列は潰れず並ぶ (右の枠と同じ置き方)', async ({ page }) => {
  test.setTimeout(90 * 1000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const env = setup(__filename, 'cmp-1280');
  await S.bootWithSaveDir(page, env.mine);
  await S.putDoc(page, env.mine, 'gpio_state', MINE);
  await page.waitForTimeout(1100);   // server の刻印は秒。版が同じ秒に潰れないように
  await S.putDoc(page, env.mine, 'gpio_state', MINE2);
  await S.reopenApp(page);
  await S.openFolder(page);
  const hist = page.locator('#folder-panel [data-versions-name="gpio_state"]');
  await expect(hist).toHaveText(/履歴 \d/);
  await hist.click();
  await expect(page.locator('#vt-modal')).toBeVisible();
  await page.locator('#vt-body [data-version-compare][data-version-of="gpio_state"]').first().click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-svg svg')).toHaveCount(1, { timeout: 20000 });
  await S.closeFolderList(page);
  const pv = await rect(page, '#preview-pane');
  const cp = await rect(page, '#compare-pane');
  expect(pv.right).toBeLessThanOrEqual(cp.left);
  expect(pv.width).toBeGreaterThanOrEqual(280);
  const pp = await rect(page, '#props-pane');
  expect(cp.right).toBeLessThanOrEqual(pp.left);
  expect(pp.right).toBeLessThanOrEqual(1280.5);
  for (const sel of ['#hud-zoom-fit', '#hud-zoom-out']) expect(await hitOf(page, sel), sel).toBe('ok');
  fs.rmSync(env.root, { recursive: true, force: true });
});
