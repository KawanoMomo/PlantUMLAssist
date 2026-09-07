// @ts-check
// BLK-junior-20260907-0843 の実測。手順8「保存先を persona-data\junior にして保存」を
// 前回値が覚えられている状態でなぞり、クリック数とキー入力数を数える。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const DIR = './autosave-e2e-blk-j0843-measure';

test('手順8 の実測 — 前回値が残っていれば設定を開き直さない', async ({ page, context, request }) => {
  // 前の run で保存先を決めた状態を作る。
  await request.post('/prefs', { data: { backend: 'file', fileDir: DIR } });

  let clicks = 0, keys = 0;
  const fresh = await context.newPage();
  await fresh.goto('/');
  await fresh.evaluate(() => window.localStorage.clear());   // 新しいプロファイル相当
  await gotoApp(fresh);
  fresh.on('console', () => {});
  const click = async (sel) => { clicks++; await fresh.locator(sel).click(); };
  const press = async (k) => { keys++; await fresh.keyboard.press(k); };
  const type = async (s) => { keys += s.length; await fresh.keyboard.type(s); };

  await fresh.locator('#editor').fill('@startuml\nstart\n:UARTを初期化する;\nstop\n@enduml');
  await fresh.waitForTimeout(800);

  // 手順8 はここから。以前は ⚙ → ファイルタブ → パス入力 → OK が要った。
  await press('Control+K');
  await type('ファイルを保存');
  await click('#cp-list .cp-item >> nth=0');

  await expect(fresh.locator('#status-save-result')).toContainText('保存しました', { timeout: 8000 });
  await expect(fresh.locator('#status-save-result')).toContainText(DIR);

  console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
  await fresh.close();
});
