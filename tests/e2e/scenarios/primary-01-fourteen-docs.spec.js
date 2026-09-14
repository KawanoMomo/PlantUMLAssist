// @ts-check
// primary 台本 手順1: 横断対象の 14 枚を用意する(無ければ作る)。保存先は persona-data\primary。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順1 14 枚が保存先に揃い、一覧から数えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 用意されていない図は作る、が台本。ここでは 13 枚だけ置いて 1 枚足りない状態から始める。
  const missing = S.PRIMARY_DOCS[S.PRIMARY_DOCS.length - 1];
  for (const n of S.PRIMARY_DOCS.slice(0, -1)) await S.putDoc(page, DIR, n, S.docFor(n));
  expect((await S.listDir(page, DIR)).length).toBe(13);

  // 足りない 1 枚 (ADC 状態遷移) を作って保存する。
  await S.putDoc(page, DIR, missing, S.docFor(missing));

  // 到達条件: 14 枚すべてが保存先にあり、一覧に名前で並ぶ。
  const names = await S.listDir(page, DIR);
  expect(names.length).toBe(14);
  for (const n of S.PRIMARY_DOCS) expect(names).toContain(n);

  await S.openFolder(page);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="adc_state"]')).toBeVisible();
});

// BLK-reviewer-20260914-1406-wish: 手順1 で揃えた図のうち 1 枚の中身が、別の図の
// 複製で丸ごと塗り潰されていても、一覧は名前と枚数しか言わなかった。事故が見つかったのは
// reviewer が 31 枚の DSL を 1 枚ずつ読んだ後で、primary は保存直後には気付けない。
// 「名乗っている図種」と「本文が描く図種」の食い違いが一覧に出ることを到達条件にする。
test('手順1 中身が別の図で塗り潰された 1 枚を、全文を読まずに一覧で見つけられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n));
  // 事故そのもの: ユースケース図のファイルに、別の図 (SPI 初期化シーケンス) の本文が丸ごと入る。
  await S.putDoc(page, DIR, 'plantuml-usecase', S.docFor('spi_init_sequence'));
  // 正しいユースケース図。server の図種判定は `actor` をシーケンスと読むので、
  // ここが赤くなると印が毎回出て役に立たなくなる (疑いの出た図は本文まで見る)。
  await S.putDoc(page, DIR, 'driver_use_case', ['@startuml', 'left to right direction',
    'actor 開発者', '(ドライバを設定する)', '開発者 --> (ドライバを設定する)', '@enduml'].join('\n'));

  await S.openFolder(page);
  // 到達条件 1: 一覧の 1 行が、食い違った図を名指しする (枚数も出るので、
  // 「0 件」が照合できていないだけなのかどうかも読める)。
  const line = page.locator('#folder-kind-mismatch');
  await expect(line).toBeVisible();
  await expect(line).toContainText('図種ずれ: 1 件');
  await expect(line).toContainText('plantuml-usecase');

  // 到達条件 2: その図の行にだけ印が付き、名乗りと本文の両方がその場で読める。
  const badge = page.locator('#folder-panel [data-kind-mismatch="plantuml-usecase"]');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('名乗り ユースケース');
  await expect(badge).toContainText('本文 シーケンス');
  // 到達条件 3: 正しいユースケース図は赤くならない (印が付くのは事故の 1 枚だけ)。
  await expect(page.locator('#folder-panel [data-kind-mismatch="driver_use_case"]')).toHaveCount(0);
  expect(await page.locator('#folder-panel [data-kind-mismatch]').count()).toBe(1);
});
