// @ts-check
// junior 台本 場面 2 手順 1: 前の場面で書き出した図 (参加者 4 者) を Import ▾ → .puml を開く で開き、
//   「末尾に追加」の始点 (From)・終点 (To) を選んで「+ 追加」を 8 回押す。本文と描画を見る。
// TICKET-junior-20261116-0601: 欄の見出しが欄に結び付いておらず、見出しの語で欄を引けなかった
//   (getByRole('combobox', { name: '始点 (From)' }) が 0 件で 170 秒止まった)。見出しの語のまま引く。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 1 回の「+ 追加」で本文はメッセージ 1 行だけ増え、ほかの行は動かない
//   - 見出しを押すとその欄にフォーカスが移る
//   - 8 本足した図が描ける
const { test, expect } = require('@playwright/test');
const path = require('path');
const H = require('./_helpers');

const MSGS = [
  ['User', 'Ui'], ['Ui', 'Ctrl'], ['Ctrl', 'Srv'], ['Srv', 'Ctrl'],
  ['Ctrl', 'Ui'], ['Ui', 'User'], ['Ctrl', 'Ctrl'], ['Srv', 'Srv'],
];

test('junior 手順1 (場面2) 開いた図に、末尾に追加の始点・終点を見出しの語で選んでメッセージを 8 本足す', async ({ page }, testInfo) => {
  await H.bootWith(page, null);

  // Import ▾ → .puml を開く (利用者と同じく項目を押し、開いたファイル選択の窓で選ぶ。項目を押すとメニューは閉じる)。
  await page.locator('#btn-import').click();
  await expect(page.locator('#imp-file')).toBeVisible();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#imp-file').click()]);
  await fc.setFiles(path.join(H.FIXTURES, 'junior-s1-out.puml'));
  await expect.poll(() => H.getEditorText(page)).toContain('participant "サーバ" as Srv');
  await expect(page.locator('#imp-file')).toBeHidden();
  await H.waitDrawn(page, ['利用者', 'サーバ']);

  const from = page.getByRole('combobox', { name: '始点 (From)' });
  const to = page.getByRole('combobox', { name: '終点 (To)' });
  await expect(from).toHaveCount(1);
  await expect(to).toHaveCount(1);
  // 見出しを押すとその欄にフォーカスが移る。
  await page.locator('label', { hasText: '終点 (To)' }).click();
  await expect(to).toBeFocused();

  const start = await H.getEditorText(page);
  for (const [f, t] of MSGS) {
    const r = await H.measure(page, testInfo, async () => {
      await page.getByRole('combobox', { name: '始点 (From)' }).selectOption(f);
      await page.getByRole('combobox', { name: '終点 (To)' }).selectOption(t);
      await page.getByRole('button', { name: /^\+ 追加/ }).click();
      await expect.poll(() => H.getEditorText(page)).toMatch(new RegExp('^\\s*' + f + '\\s*-+>+\\s*' + t + '\\b', 'm'));
      // 利用者は次の 1 本を、右パネルが描き直されて「直前の送り先から続けます」(From = 直前の To・To は空欄) に
      // なってから選ぶ。本文が変わっただけで選ぶと、選んだ後に描き直しが来て To が空欄に戻り、
      // 「+ 追加」が何も足さない (全体実行の負荷で選ぶ〜押すの間が延びたときの揺れ。TICKET-releaser-20261123-0142-4)。
      await expect(page.getByRole('combobox', { name: '始点 (From)' })).toHaveValue(t);
      await expect(page.getByRole('combobox', { name: '終点 (To)' })).toHaveValue('');
    });
    // 押した対象だけが変わる: メッセージ 1 行が増えるだけ。
    expect(r.diffLines, 'diff lines for ' + f + ' -> ' + t).toBe(1);
    expect(H.removedLines(r.before, r.after)).toEqual([]);
  }

  // 4 者の宣言は元のまま残り、足したメッセージが 8 行。
  const dsl = await H.getEditorText(page);
  expect(H.removedLines(start, dsl)).toEqual([]);
  expect(H.diffLines(start, dsl)).toBe(8);
  await H.expectRendered(page);
  const txt = await H.svgText(page);
  for (const w of ['利用者', '画面', '制御部', 'サーバ']) expect(txt).toContain(w);
});
