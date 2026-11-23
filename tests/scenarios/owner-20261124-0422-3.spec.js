// @ts-check
// TICKET-owner-20261124-0422-3: 線・メッセージ・note の付いた要素の「✕ 削除」が、コンポーネント・アクター・
// シーケンスの参加者では宣言の行だけを消し、確かめに「はい」と答えても要素が図に残っていた。Delete キーは
// クラス・コンポーネント・状態・アクターを押した選択では何も起きなかった。
// 期待 (principles.md「同じ操作は 6 図種で同じ語・同じ場所」「押して何も起きない行を残さない」):
//   - 既定の画面のまま要素を押して ✕ 削除 → アプリ内の窓が一緒に消える本数を言い、Enter で要素と付いた行が消え、
//     描き直した図からその要素の名前が消える。差分は窓の言った行だけ。Ctrl+Z 1 回で全部戻る。Esc は何も変えない
//   - 同じ図で要素を押して Delete キー → 同じ窓・同じ結果
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');
const { clickOverlayByLine } = require('../e2e/helpers');

const CASES = [
  {
    kind: 'component', type: 'component', id: 'Bus',
    text: ['@startuml', "' Bus is the shared line", 'component Bus', 'component Ctl', 'Bus --> Ctl : data',
      'note right of Bus : memo', '@enduml', ''],
    words: ['Bus', 'Ctl', 'data', 'memo'], gone: ['Bus', 'data', 'memo'], kept: ['Ctl'],
    removed: [3, 5, 6], message: '部品 Bus を削除します。関係 1 本とnote 1 つも消えます。',
  },
  {
    kind: 'usecase', type: 'actor', id: 'User',
    text: ['@startuml', 'actor User', 'actor Admin', 'usecase "Login" as UC1', 'User --> UC1', 'Admin --> UC1', '@enduml', ''],
    words: ['User', 'Admin', 'Login'], gone: ['User'], kept: ['Admin', 'Login'],
    removed: [2, 5], message: 'アクター User を削除します。関係 1 本も消えます。',
  },
  {
    kind: 'sequence', type: 'participant', id: 'Ctl', decl: 2,
    text: ['@startuml', 'participant Ctl', 'participant Sub', 'participant Obs', 'Ctl -> Sub : req', 'Sub --> Ctl : done',
      'note over Ctl : memo', 'Obs -> Sub : ping', '@enduml', ''],
    words: ['Ctl', 'Sub', 'Obs', 'req', 'done', 'memo', 'ping'], gone: ['Ctl', 'req', 'done', 'memo'], kept: ['Sub', 'Obs', 'ping'],
    removed: [2, 5, 6, 7], message: '参加者 Ctl を削除します。メッセージ 2 本とnote 1 つも消えます。',
  },
  {
    kind: 'state', type: 'state', id: 'Idle',
    text: ['@startuml', 'state Idle', 'state Run', '[*] --> Idle', 'Idle --> Run : go', 'Run --> Idle : back',
      'note right of Idle : memo', '@enduml', ''],
    words: ['Idle', 'Run', 'go', 'back', 'memo'], gone: ['Idle', 'go', 'back', 'memo'], kept: ['Run'],
    removed: [2, 4, 5, 6, 7], message: '状態 Idle を削除します。遷移 3 本とnote 1 つも消えます。',
  },
];

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function pick(page, c) {
  if (c.kind === 'sequence') {
    const chip = page.locator('#seq-tail-kind-chip-participant');
    if (await chip.count()) await chip.click();
    await clickOverlayByLine(page, c.decl);
  } else {
    await clickHit(page, page.locator('#overlay-layer [data-type="' + c.type + '"][data-id="' + c.id + '"]').first(), c.kind);
  }
  await expect(page.locator('#props-content [data-el-delete]')).toBeVisible();
}

function wantAfter(c) {
  return c.text.filter((_, i) => c.removed.indexOf(i + 1) < 0).join('\n');
}

for (const c of CASES) {
  for (const how of ['button', 'key']) {
    test('owner 0422-3 ' + c.kind + ' (' + how + '): 線の付いた要素の削除は窓が本数を言い、付いた行ごと消えて図から消える', async ({ page }, testInfo) => {
      test.setTimeout(120 * 1000);
      const before = c.text.join('\n');
      await H.bootWith(page, before);
      await H.waitDrawn(page, c.words);
      await pick(page, c);

      const r = await H.measure(page, testInfo, async () => {
        if (how === 'button') await page.locator('#props-content [data-el-delete]').click();
        else await page.keyboard.press('Delete');
        await expect(page.locator('.el-del-modal')).toBeVisible();
        await expect(page.locator('.el-del-message')).toHaveText(c.message);
        await expect.poll(() => H.getEditorText(page)).toBe(before);
        await page.keyboard.press('Enter');
        await expect(page.locator('.el-del-modal')).toHaveCount(0);
        await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toBe(wantAfter(c));
        // 描き直した図からその要素の名前と、付いていた線・note の字が消えるまで待つ
        await expect.poll(async () => {
          const words = (await H.svgText(page)).split(/\s+/);
          return c.gone.filter((w) => words.indexOf(w) >= 0);
        }, { timeout: 15000 }).toEqual([]);
      }, c.kept);
      await H.expectRendered(page);
      expect(H.removedLines(before, r.after)).toEqual(c.removed.map((n) => c.text[n - 1]));
      if (how === 'button') await page.screenshot({ path: testInfo.outputPath(c.kind + '-deleted.png') });

      await page.locator('#editor').focus();
      await page.keyboard.press('Control+z');
      await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(before);
      H.annotate(testInfo, 'result', c.kind + ' ' + how + ' diff=' + r.diffLines);
    });
  }
}

test('owner 0422-3 component: 窓の Esc は何も変えずに閉じる', async ({ page }) => {
  const c = CASES[0];
  const before = c.text.join('\n');
  await H.bootWith(page, before);
  await H.waitDrawn(page, c.words);
  await pick(page, c);
  await page.locator('#props-content [data-el-delete]').click();
  await expect(page.locator('.el-del-message')).toHaveText(c.message);
  await page.keyboard.press('Escape');
  await expect(page.locator('.el-del-modal')).toHaveCount(0);
  expect(await H.getEditorText(page)).toBe(before);
});
