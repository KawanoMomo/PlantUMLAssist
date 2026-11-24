// @ts-check
// junior 台本 手順5: Export メニューから資料に貼る画像を書き出す。
// 状態遷移図は「SVGとして保存」、他の図種は「PNG(透過背景)」。
//
// BLK-junior-20260908-2303-wish: 形式の決まりを利用者が覚えて選ぶのをやめ、
// 「資料化」で部品と図種を選ぶだけで、形式・題名の (資料用)・保存・庫までを 1 回で行う。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');
const path = require('path');

const DIR = S.dirFor(__filename);

test('手順5(状態遷移図) SVG として書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  // 到達条件: SVG が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  // BLK-junior-20260915-0406: 書き出し名は title (title GPIOドライバ状態遷移) ではなく
  // .puml の保存名 (図の名前) に揃うので、保存フォルダで .puml と対になる。
  expect(download.suggestedFilename()).toBe('gpio_state_doc.svg');
});

test('手順5(他の図種) PNG(透過背景)も同じメニューから選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_SEQ);
  await S.renameActive(page, 'gpio_seq_doc');

  const download = await (await S.exportVia(page, 'exp-png-transparent'));
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  // TICKET-owner-20261124-0342-3: 透過 PNG は通常の PNG と名前で分かれる (保存先の図と同じ `{名前}.transparent.png`)。
  expect(download.suggestedFilename()).toBe('gpio_seq_doc.transparent.png');
});

// BLK-builder-20260924-1736-2 (design 9a): Export ▾ は上部バーの右端にあり、開いたメニューは窓の中に収まる
test('手順5 Export ▾ のメニューは窓からはみ出さず、項目が全部読める', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  const vw = page.viewportSize().width;
  const menuBox = await page.locator('#export-menu').boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(vw);
  const btnBox = await page.locator('#btn-export').boundingBox();
  // ボタンの右端にそろえて左へ開く
  expect(Math.abs((menuBox.x + menuBox.width) - (btnBox.x + btnBox.width))).toBeLessThanOrEqual(2);
});

// 資料化 (1 枚を資料化・部品の資料一式・貼付先の見出し・部品の残り) の手順は TICKET-owner-20261116-0140-prune で外した。
// 書き出しは Export ▾ の 1 枚ずつ (SVG / PNG / 透過 PNG / クリップボード)。
// BLK-junior-20260923-1409: junior の 1 枚 (IRQ 初期化シーケンス) だけが
// 「PNGエクスポートに失敗しました (SVG読み込みエラー)」で止まり、download が始まらなかった。
// PlantUML が svg 末尾に畳む元 DSL の処理命令は画面に入れた時点でコメントに化け、
// 畳んだ文字列に `--` を含むこの図では書き戻した svg が XML として壊れていた。
// 3 形式のどれでも書き出せることを、同じ 1 枚で押さえる。
test('手順5(再現した 1 枚) PNG(透過背景)で書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.IRQ_SEQ_FOLDED_DASH);
  await S.renameActive(page, 'irq_init_sequence');

  // 失敗は alert で出ていたので、出たら握りつぶさず落とす。
  const alerts = [];
  page.on('dialog', async (d) => { alerts.push(d.message()); await d.dismiss(); });

  const download = await (await S.exportVia(page, 'exp-png-transparent'));
  expect(alerts).toEqual([]);
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('irq_init_sequence.transparent.png');
});

test('手順5(再現した 1 枚) PNGとして保存でも書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.IRQ_SEQ_FOLDED_DASH);
  await S.renameActive(page, 'irq_init_sequence');

  const alerts = [];
  page.on('dialog', async (d) => { alerts.push(d.message()); await d.dismiss(); });

  const download = await (await S.exportVia(page, 'exp-png'));
  expect(alerts).toEqual([]);
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('irq_init_sequence.png');
});

test('手順5(再現した 1 枚) SVG は XML として読める形で保存され、埋め込みの元 DSL も残る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.IRQ_SEQ_FOLDED_DASH);
  await S.renameActive(page, 'irq_init_sequence');

  const download = await (await S.exportVia(page, 'exp-svg'));
  expect(download).not.toBeNull();
  const saved = await download.path();
  const text = require('fs').readFileSync(saved, 'utf8');

  // 化けたコメントのまま保存されていると、この svg はどのビューアでも開けない。
  expect(text).not.toContain('<!--?plantuml-src');
  // 埋め込みは差分・突き合わせが読むので、落とさず処理命令の形で残す。
  expect(text).toContain('<?plantuml-src');
  // ブラウザに XML として読ませて、壊れていないことを確かめる。
  const ok = await page.evaluate((svgText) => {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    return !doc.querySelector('parsererror');
  }, text);
  expect(ok).toBe(true);
});
