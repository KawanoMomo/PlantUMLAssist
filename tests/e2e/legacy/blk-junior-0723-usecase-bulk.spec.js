const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// BLK-junior-20260907-0723 (friction): GpioDrv のユースケース図 (アクター 2 / ユースケース 4 /
// 関連 6) を、個別フォームの積み上げではなく「末尾に追加」の一括欄で 1 回に作れることを
// 実機で測る。判定はクリック 10 以下・キー入力 50 以下。
const BULK = [
  'actor 開発者',
  'actor テスタ',
  '(GPIO 初期化)',
  '(ポート出力設定)',
  '(ポート入力読み出し)',
  '(GPIO 診断)',
  '開発者 --> (GPIO 初期化)',
  '開発者 --> (ポート出力設定)',
  '開発者 --> (ポート入力読み出し)',
  'テスタ --> (GPIO 診断)',
  '(ポート出力設定) ..> (GPIO 初期化) : include',
  '(GPIO 診断) ..> (ポート入力読み出し) : include',
].join('\n');

// テンプレートに元からある要素を差し引くため、種類ごとに数える。
function countParts(dsl) {
  const lines = dsl.split('\n').map((l) => l.trim());
  return {
    actors: lines.filter((l) => /^actor\s/.test(l) || /^:.+:$/.test(l)).length,
    usecases: lines.filter((l) => /^usecase\s/.test(l) || /^\(.+\)$/.test(l)).length,
    relations: lines.filter((l) => /(-->|\.\.>|<\|--)/.test(l)).length,
  };
}

test('一括欄で 12 要素をまとめて作れ、クリック 10 以下 / キー入力 50 以下に収まる', async ({ page }) => {
  await gotoApp(page);

  // 数える対象は利用者の物理操作だけ。ページ側で実際に起きた click / keydown を数える。
  await page.evaluate(() => {
    window.__clicks = 0;
    window.__keys = 0;
    document.addEventListener('click', () => { window.__clicks++; }, true);
    document.addEventListener('keydown', () => { window.__keys++; }, true);
  });

  // 1 クリック目: 図種レールの UC
  await page.locator('#rail-uc, [data-diagram="plantuml-usecase"]').first().click();
  await page.waitForTimeout(1000);

  const before = countParts(await getEditorText(page));

  // 2 クリック目: 「末尾に追加」の種別チップ「一括」
  await page.locator('#uc-tail-kind-chip-bulk').click();
  await page.waitForTimeout(300);

  // 3 クリック目: 一括欄をクリックして貼り付ける (Ctrl+V の 2 キーを実測に入れる)
  await page.locator('#uc-tail-bulk').click();
  await page.evaluate((text) => {
    var el = document.getElementById('uc-tail-bulk');
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, BULK);
  await page.keyboard.press('Control+v');

  // 4 クリック目: まとめて追加
  await page.locator('#uc-tail-add').click();
  await page.waitForTimeout(1500);

  const after = countParts(await getEditorText(page));
  expect(after.actors - before.actors).toBe(2);
  expect(after.usecases - before.usecases).toBe(4);
  expect(after.relations - before.relations).toBe(6);

  const counts = await page.evaluate(() => ({ clicks: window.__clicks, keys: window.__keys }));
  console.log('BLK-junior-20260907-0723 実測: clicks=' + counts.clicks + ' keys=' + counts.keys);
  expect(counts.clicks).toBeLessThanOrEqual(10);
  expect(counts.keys).toBeLessThanOrEqual(50);
});
