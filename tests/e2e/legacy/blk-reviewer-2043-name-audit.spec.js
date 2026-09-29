// @ts-check
// BLK-reviewer-20260906-2043: 図をまたいだ部品名の突合を機械的に行う。
// レビューでは 7〜8 枚の DSL を全文読み、participant / class / 状態名を
// 頭の中で名寄せしていた。表記揺れ・宣言なし・図をまたぐ部品名が
// 1 回で出て、揺れを直す先まで辿れることを確認する。
//
// BLK-owner-20260924-1332-prune: 🔍 名前突合の画面は畳んだ。同じ事実を
// ▦ 突合ボード (見つける) と 🔤 表記統一 (直す) で見る形に書き換えた:
// - 「1 クリックで突合結果」→ Ctrl+K「表記揺れ」でボードが 名前/表記揺れ で絞られて開く
// - 「図 × 部品名の対照表」→ ▤ 影響を見る を名前を空のまま開いたときの、図をまたぐ部品名の一覧
// - 「これに統一」→ ボードの行で揃える先を選ぶと登録簿に入り、🔤 表記統一がその組で開く
//   (書く道は表記統一の 1 本。登録簿を書くので保存先は test-results 配下)
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, saveDirFor } = require('../helpers');

const SPI_SEQ = '@startuml\nparticipant SpiDrv\nparticipant IRQCtrl\nSpiDrv -> IRQCtrl: request\n@enduml';
const CAN_SEQ = '@startuml\nparticipant CanDrv\nparticipant IrqCtrl\nCanDrv -> IrqCtrl: notify\n@enduml';
const CLS = '@startuml\nclass SpiDrv\nclass CanDrv\nCanDrv --> DmaCtrl: uses\n@enduml';
// 登録簿 (_names.json) は保存先の親に置かれるので、1 段下げて spec の外へ漏らさない。
const DIR = saveDirFor(__filename) + '/primary';

async function freshWorkspace(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(200);
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
    await fetch('/name-registry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: d, entries: [] }) });
  }, DIR);
}

async function setupThreeDocs(page) {
  await gotoApp(page);
  await clearDir(page);
  await typeDsl(page, SPI_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CAN_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

// 旧 🔍 名前突合の語で Ctrl+K から引く (1 画面 1 行: 当たるのは ▦ 突合ボードの行)。
async function openByWord(page, word) {
  await page.keyboard.press('Control+k');
  await page.locator('#cp-input').fill(word);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await expect(page.locator('#ab-modal')).toBeVisible();
}

test.describe('BLK-reviewer-2043 名前突合 (▦ 突合ボードで見る)', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('Ctrl+K「表記揺れ」でボードが 名前/表記揺れ で絞られて開く', async ({ page }) => {
    await setupThreeDocs(page);
    await openByWord(page, '表記揺れ');
    await expect(page.locator('#ab-kind')).toHaveValue('name.variants');
    await expect(page.locator('#ab-body .ab-row')).toHaveCount(1);
    await expect(page.locator('#ab-body .ab-row').first()).toHaveAttribute('data-ab-kind', 'name.variants');
  });

  test('「名前突合」でも同じ 1 行に当たり、パレットに名前突合の行は別に無い', async ({ page }) => {
    await setupThreeDocs(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('名前突合');
    await page.waitForTimeout(250);
    await expect(page.locator('#cp-list .cp-item', { hasText: '名前の表記揺れ' })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('#ab-modal')).toBeVisible();
    await expect(page.locator('#ab-kind')).toHaveValue('name.variants');
  });

  test('IRQCtrl と IrqCtrl が表記揺れの 1 行に並び、揃える先に選べる', async ({ page }) => {
    await setupThreeDocs(page);
    await openByWord(page, '表記揺れ');
    const row = page.locator('#ab-body .ab-row[data-ab-kind="name.variants"]');
    await expect(row).toContainText('IRQCtrl');
    await expect(row).toContainText('IrqCtrl');
    await expect(row.locator('.ab-unify-to')).toHaveCount(2);
  });

  test('どの図にも宣言が無い名前を挙げる (絞らずに開くとボードに出る)', async ({ page }) => {
    await setupThreeDocs(page);
    await page.locator('#btn-tab-cross').click();
    await expect(page.locator('#ab-modal')).toBeVisible();
    await expect(page.locator('#ab-kind')).toHaveValue('');
    const row = page.locator('#ab-body .ab-row[data-ab-kind="name.undeclared"]');
    await expect(row).toContainText('DmaCtrl');
  });

  test('図をまたぐ部品名は ▤ 影響を見る の一覧に枚数付きで出る', async ({ page }) => {
    await setupThreeDocs(page);
    await page.evaluate(() => { /* @ts-ignore */ openImpactScreen(); });
    const names = page.locator('#ri-xref-names');
    await expect(names).toBeVisible();
    // SpiDrv は SPI シーケンスとクラス図の 2 枚にある
    await expect(names.locator('.ri-xref-name[data-name="SpiDrv"]')).toHaveAttribute('data-docs', '2');
  });

  test('揃える先を選ぶと登録簿に入り、表記統一のまとめて適用で別の図まで直る', async ({ page }) => {
    await setupThreeDocs(page);
    await openByWord(page, '表記揺れ');
    await page.locator('#ab-body .ab-row[data-ab-kind="name.variants"] .ab-unify-to[data-to="IRQCtrl"]').click();
    // ボードは閉じ、表記統一がその組を選んだ状態で開く (書くのは表記統一の 1 本)
    await expect(page.locator('#ab-modal')).toBeHidden();
    await expect(page.locator('#unify-panel')).toHaveClass(/open/);
    await expect(page.locator('#unify-entry')).toHaveValue('irqctrl');
    await expect(page.locator('#unify-files .uf-name')).toContainText(['diagram2']);
    // 登録簿に組が入った
    const reg = await page.evaluate(async (d) => (await (await fetch('/name-registry?dir=' + encodeURIComponent(d))).json()), DIR);
    const irq = reg.entries.find((e) => e.canonical === 'IRQCtrl');
    expect(irq.variants).toEqual(['IrqCtrl']);
    await page.locator('#btn-unify-apply').click();
    await expect(page.locator('#unify-result')).toHaveAttribute('data-applied', '2');
    await page.locator('#btn-unify-cancel').click();
    // CAN シーケンス (2 枚目) の IrqCtrl が IRQCtrl になっている
    await page.locator('#tab-bar .tab').nth(1).click();
    await page.waitForTimeout(300);
    const text = await getEditorText(page);
    expect(text).toContain('IRQCtrl');
    expect(text).not.toContain('IrqCtrl');
    // ボードの 名前/表記揺れ は 0 件になる
    await openByWord(page, '表記揺れ');
    await expect(page.locator('#ab-body .ab-row')).toHaveCount(0);
    await expect(page.locator('#ab-kind')).toHaveValue('name.variants');
  });

  test('揺れが無ければ 名前/表記揺れ で絞っても行が無い', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI_SEQ);
    await openByWord(page, '表記揺れ');
    await expect(page.locator('#ab-body .ab-empty')).toBeVisible();
    await expect(page.locator('#ab-body .ab-row')).toHaveCount(0);
  });
});
