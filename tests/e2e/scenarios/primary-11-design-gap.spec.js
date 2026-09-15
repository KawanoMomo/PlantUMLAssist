// @ts-check
// primary 台本 手順11: design/README.md の「対象の仕様」を上から 1 ファイル開き、
// 仕様に描かれていて現状の GUI に無い操作・画面を 1 つ選んで BLK にする。
// spec 側で見るのは「仕様書が読める場所にあり、GUI と突き合わせられる」ことまで。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DESIGN = path.join('E:', '01_Loop', 'loop', 'design');
const DIR = S.dirFor(__filename);

test('手順11 仕様の「対象の仕様」を読み、GUI と突き合わせられる', async ({ page }) => {
  const readme = path.join(DESIGN, 'README.md');
  test.skip(!fs.existsSync(readme), 'design/README.md が無い環境では突き合わせができない');

  const text = fs.readFileSync(readme, 'utf8');
  // 到達条件その1: 「対象の仕様」の一覧が読め、そこに挙がったファイルが実在する。
  expect(text).toContain('対象の仕様');
  const files = (text.match(/[^`\n]+\.dc\.html/g) || []).map((f) => f.replace(/^`/, ''));
  expect(files.length).toBeGreaterThan(0);
  const present = files.filter((f) => fs.existsSync(path.join(DESIGN, f)));
  expect(present.length).toBeGreaterThan(0);

  // 到達条件その2: 突き合わせる相手の GUI が実際に立ち上がる。
  await S.bootWithSaveDir(page, DIR);
  await expect(page.locator('#preview-svg')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
});

// 📐 仕様突合 は 7b どおり畳まれているので、入口は Ctrl+K に寄せる。
async function openDesignCheck(page) {
  // 読み込み直後はどこにも焦点が無く Ctrl+K が届かないので、画面が組み上がるのを
  // 待って本文に焦点を置いてから押す (設定を戻した直後は読み込み直しの途中で届かない)。
  await page.waitForSelector('#preview-svg');
  await page.waitForTimeout(800);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('仕様突合');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dc-modal .dc-table');
}

// BLK-primary-20260915-2240-wish: 仕様と GUI の食い違いが「仕様後退」なのか
// 「この環境の設定が既定と違うだけ」なのかを GUI から判定できず、手順 11 が
// 原因の切り分けをできないまま終わっていた。📐 仕様突合 でその 1 手を守る。
test('手順11 📐 仕様突合 が、仕様と現在値を並べて不一致を設定差と仕様後退に分ける', async ({ page }) => {
  // 既定そのものを見る手順なので、helper に畳み方を書かせない (foldedTools)。
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });

  // 到達条件その1: Ctrl+K から入口に着く (7b: 機能はコマンドパレットから引く)。
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('仕様突合');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dc-modal .dc-table');

  // 到達条件その2: 仕様項目が出典 (.dc.html と案番号) つきで並ぶ。
  const rows = page.locator('#dc-modal .dc-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator('#dc-modal')).toContainText('.dc.html');

  // 到達条件その3: 既定の環境では仕様後退が 0 件だと言い切る (保留にしない)。
  const summary = await page.locator('#dc-summary').textContent();
  expect(summary).not.toContain('仕様後退');

  // 判定はどの行も「一致 / 設定差 / 仕様後退」のどれかに落ちている。
  const verdicts = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-verdict')));
  expect(verdicts.every((v) => ['ok', 'setting', 'gap'].includes(v))).toBe(true);
});

// BLK-primary-20260915-2240-friction: 突合項目が 2 ファイルぶんしか無いと、残りの
// 仕様ファイルは結局 .dc.html を grep して読むことになり、手順 11 の手作業が半分残る。
// 「対象の仕様」6 ファイル全部を機械で見ていること、出典ごとに読めることを守る。
test('手順11 突合は design の「対象の仕様」6 ファイル全部を見ていて、出典で絞って読める', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  await openDesignCheck(page);

  // 到達条件その1: 手で grep する必要のあるファイルが残っていないと言い切る。
  await expect(page.locator('#dc-coverage')).toContainText('6 ファイル中 6 ファイル');
  await expect(page.locator('#dc-coverage')).toContainText('grep で読む必要のあるファイルは無い');

  // 到達条件その2: 出典の選択肢が 6 ファイルぶんあり、どれも項目を持つ (0 件が無い)。
  const opts = page.locator('#dc-spec option');
  expect(await opts.count()).toBe(7); // すべての出典 + 6 ファイル
  const labels = await opts.evaluateAll((els) => els.map((e) => e.textContent || ''));
  expect(labels.slice(1).some((t) => / \(0\)$/.test(t))).toBe(false);

  // 到達条件その3: 1 ファイルに絞ると、その出典の行だけが残る。
  const target = 'PlantUMLAssist - 1a 設定と網羅.dc.html';
  await page.locator('#dc-spec').selectOption(target);
  const specs = await page.locator('#dc-modal .dc-row').evaluateAll(
    (els) => els.map((e) => (e.textContent || '')));
  expect(specs.length).toBeGreaterThan(0);
  expect(specs.every((t) => t.includes(target))).toBe(true);

  // 到達条件その4: その場面でだけ出る項目は「組み込まれているかを見る」と断ってある
  // (設定モーダルを開いていないだけの状態を仕様後退と読まないため)。
  await expect(page.locator('#dc-modal .dc-scope').first()).toContainText('その場面でだけ出る');
});

test('手順11 設定を既定から変えた環境の不一致は「設定差」と名指しされ、その場で戻せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  // 「機能ボタンを畳む」を自分で解いた人と同じ状態にする (7a/7b の既定は畳む)。
  // この設定は localStorage を消してから開き直しても効くよう、逃がし鍵の下で書く。
  await page.evaluate(() => {
    try {
      localStorage.setItem('pua.e2e.keep', '1');
      localStorage.setItem('plantuml-tools-folded', '0');
    } catch (e) {}
  });
  await page.reload();
  await page.waitForSelector('#editor');

  await openDesignCheck(page);

  // 到達条件その1: タブ列の項目が「設定差」と名指しされる (仕様後退にしない)。
  const row = page.locator('#dc-modal .dc-row[data-verdict="setting"]').first();
  await expect(row).toContainText('設定差');
  await expect(row).toContainText('既定に戻せば');

  // 到達条件その2: その場で既定に戻せて、戻すと一致になる。
  await row.locator('.dc-reset').click();
  await page.waitForSelector('#editor');
  expect(await page.evaluate(() => localStorage.getItem('plantuml-tools-folded'))).toBe(null);

  // 到達条件その3: 戻したあと測り直すと設定差が消える (残れば仕様後退だと分かる)。
  await openDesignCheck(page);
  await expect(page.locator('#dc-modal .dc-row[data-verdict="setting"]')).toHaveCount(0);
  await expect(page.locator('#dc-summary')).toContainText('すべて仕様どおり');
});
