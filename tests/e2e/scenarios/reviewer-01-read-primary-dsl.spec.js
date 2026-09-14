// @ts-check
// reviewer 台本 手順1: primary が persona-data\primary に置いた DSL(5 枚以上)を読む。
// 無ければ「今回の業務は成立しない」と run ログに書いて終了する(BLK は起票しない)。
//
// BLK-reviewer-20260914-1806-wish: 読む対象のフォルダには `-編集中` の下書きが混ざる。
// どれが本体でどれが反映待ちかは、これまで ls と diff で毎回目視していた。
// 一覧がファイルごとに「本体 / 差し替え待ち / 削除予定」を出すようにした。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順1 読む対象の DSL が 5 枚以上あり、全部が図として読める', () => {
  const names = Object.keys(R.DOCS);
  // 到達条件: 5 枚に満たなければ業務は成立しない。
  expect(names.length).toBeGreaterThanOrEqual(5);
  for (const n of names) {
    expect(R.DOCS[n]).toContain('@startuml');
    expect(R.DOCS[n]).toContain('@enduml');
  }
});

test('手順1 下書きの混ざったフォルダで、各ファイルの立場が一覧で読める', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 手順1 の実際の形: 本体のほかに、反映待ちの下書きと、もう要らない下書きが混ざる。
  await S.putDoc(page, DIR, 'plantuml-usecase', R.DOCS.gpio_init_sequence);
  await S.putDoc(page, DIR, 'spi_state', R.DOCS.spi_state);
  await S.putDoc(page, DIR, 'spi_state-編集中', R.DOCS.spi_state);   // 本体と同じ中身
  await page.waitForTimeout(1100);
  // 直した内容が下書きにしか入っていない (本体へ差し替え待ち)。
  await S.putDoc(page, DIR, 'plantuml-usecase-編集中',
    R.DOCS.gpio_init_sequence.replace('GpioDrv', 'Gpio_Driver'));

  await S.openFolder(page);
  // 到達条件その1: 下書きの全体が 1 行で読める (ls して数え直さない)。
  const sum = page.locator('#folder-swapq-summary');
  await expect(sum).toBeVisible();
  await expect(sum).toContainText('下書き 2 枚');
  await expect(sum).toContainText('本体へ差し替え待ち 1 枚');
  await expect(sum).toContainText('削除予定 1 枚');

  // 到達条件その2: 行ごとの一手が、ファイル名の推測なしに出ている。
  await expect(page.locator('.folder-swapq-row[data-swapq-name="plantuml-usecase"]'))
    .toHaveAttribute('data-swapq-action', 'apply');
  await expect(page.locator('.folder-swapq-row[data-swapq-name="spi_state"]'))
    .toHaveAttribute('data-swapq-action', 'drop');

  // 到達条件その3: 一覧の各行にも立場が付く (下書きの行だけを見ていても分かる)。
  await expect(page.locator('[data-swapq-badge-of="plantuml-usecase-編集中"]'))
    .toHaveAttribute('data-swapq-state', '差し替え待ち');
  await expect(page.locator('[data-swapq-badge-of="spi_state-編集中"]'))
    .toHaveAttribute('data-swapq-state', '削除予定');
  await expect(page.locator('[data-swapq-badge-of="plantuml-usecase"]'))
    .toHaveAttribute('data-swapq-state', '本体');

  // 到達条件その4: 手順7 で primary に渡す文面が、その場で取り出せる。
  await page.locator('#folder-swapq-report-btn').click();
  const rep = page.locator('#folder-swapq-report');
  await expect(rep).toBeVisible();
  expect(await rep.inputValue())
    .toContain('plantuml-usecase-編集中.puml → plantuml-usecase.puml … 本体へ差し替え待ち');
});
