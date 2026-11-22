// @ts-check
// TICKET-owner-20261116-1221-1: 「末尾に追加」の文字を打つ欄 (シーケンスのメッセージの「本文」「ステレオタイプ」、
//   アクティビティの「処理」、注釈の本文) の見出しが欄に結び付いておらず、見出しの語で欄を引けず、見出しを押しても欄に移らなかった。
// 期待 (principles.md「欄の見出しは欄に結び付き…」「同じ操作は 6 図種で同じ語」「押した対象だけが変わる」「描ける」):
//   - 6 図種の「末尾に追加」で、見えている文字の欄に見出しの無いものが 0
//   - 本文の欄は見出しの語 (getByRole('textbox', { name })) で 1 件引け、見出しを押すとその欄にフォーカスが移る
//   - 注釈の本文の見出しは 5 図種 (注釈を足せる図種) とも「本文」。Enter で足すと本文の差分は 1 行
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

// 右パネルで見えている文字・選ぶ欄のうち、見出しも aria の名前も無いもの (owner の批評 c1.js の PANE と同じ数え方)。
async function unlabeled(page) {
  return page.evaluate(() => {
    const root = document.getElementById('props-content');
    if (!root) return ['no props-content'];
    return Array.from(root.querySelectorAll('input, select, textarea'))
      .filter((e) => e.offsetParent !== null && e.type !== 'hidden' && e.type !== 'checkbox' && e.type !== 'radio')
      .filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby'))
      .map((e) => e.tagName + '#' + (e.id || '?') + '[' + (e.placeholder || '') + ']');
  });
}

// 見出しの語で欄を 1 件引け、見出しを押すとその欄にフォーカスが移る。
async function expectLinked(page, word) {
  const box = page.locator('#props-content').getByRole('textbox', { name: word, exact: true });
  await expect(box, word).toHaveCount(1);
  await page.locator('#props-content label').filter({ hasText: new RegExp('^\\s*' + word.replace(/[()]/g, '\\$&') + '\\s*$') }).first().click();
  await expect(box, word).toBeFocused();
  return box;
}

// 見出しで引いた欄に打って Enter で足す。本文は 1 行だけ増える。
async function addByEnter(page, testInfo, word, text) {
  const r = await H.measure(page, testInfo, async () => {
    const box = await expectLinked(page, word);
    await box.fill(text);
    await box.press('Enter');
    await expect.poll(() => H.getEditorText(page)).toContain(text);
  }, [text]);
  expect(r.diffLines, word + ' -> ' + text).toBe(1);
  expect(H.removedLines(r.before, r.after)).toEqual([]);
}

async function open(page, name, words) {
  await H.setText(page, H.fixture(name).replace(/\r\n/g, '\n'));
  await H.waitDrawn(page, words);
}

test('owner 1221-1 6 図種の末尾に追加で、本文・処理・注釈の欄を見出しの語で引き、見出しを押すと欄に移り、Enter で 1 行足せる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await H.bootWith(page, null);

  // シーケンス: メッセージの本文・ステレオタイプ、注釈の本文。
  await open(page, 'seq-1.puml', ['SPI 初期化シーケンス']);
  expect(await unlabeled(page)).toEqual([]);
  await expectLinked(page, 'ステレオタイプ');
  await expectLinked(page, '本文');
  await page.locator('#seq-tail-kind-chip-note').click();
  expect(await unlabeled(page)).toEqual([]);
  await addByEnter(page, testInfo, '本文', 'seq_memo_1221');
  await page.screenshot({ path: testInfo.outputPath('seq-note.png') });
  await H.expectRendered(page);

  // アクティビティ: 処理、注釈の本文。
  await open(page, 'act-1.puml', ['SPI 転送の流れ']);
  expect(await unlabeled(page)).toEqual([]);
  await addByEnter(page, testInfo, '処理', 'Spi_Check1221');
  await page.locator('#ac-tail-kind-chip-note').click();
  expect(await unlabeled(page)).toEqual([]);
  await addByEnter(page, testInfo, '本文', 'act_memo_1221');
  await page.screenshot({ path: testInfo.outputPath('act-note.png') });
  await H.expectRendered(page);

  // 状態遷移・クラス・ユースケース: 注釈の本文の見出しも「本文」。
  for (const [name, prefix, words, memo] of [
    ['state-1.puml', 'st', ['SPI 駆動の状態'], 'st_memo_1221'],
    ['class-1.puml', 'cl', ['SPI ドライバの構成'], 'cl_memo_1221'],
    ['uc-1.puml', 'uc', ['SPI ドライバの要求'], 'uc_memo_1221'],
  ]) {
    await open(page, /** @type {string} */ (name), /** @type {string[]} */ (words));
    expect(await unlabeled(page), name).toEqual([]);
    await page.locator('#' + prefix + '-tail-kind-chip-note').click();
    expect(await unlabeled(page), name + ' note').toEqual([]);
    await addByEnter(page, testInfo, '本文', /** @type {string} */ (memo));
    await H.expectRendered(page);
  }

  // コンポーネント: 末尾に追加の欄はどれも見出しを持つ。
  await open(page, 'comp-1.puml', ['SPI 周りの部品']);
  expect(await unlabeled(page)).toEqual([]);
  await H.expectRendered(page);

  expect(errors, errors.join('\n')).toEqual([]);
});
