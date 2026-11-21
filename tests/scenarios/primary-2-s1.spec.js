// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 2:
//   seq-1 にメッセージを 2 本足し、participant を 1 つ改名する。操作数と本文の差分行数を数える。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - メッセージ 1 本の追加は本文 1 行の追加だけ。ほかの行 (コメント・字下げ) は動かない
//   - 改名は名指しした参加者 (SpiDrv) を語として持つ行だけを書き換える。名前が前方一致する別の参加者
//     (SpiDrvMon)・コメント・字下げは変えない
//   - 直した図が描け、新しい名前とメッセージが図に出て、古い名前は出ない
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');
const { clickOverlayByLine } = require('../e2e/helpers');

const OLD = 'SpiDrv';
const NEW = 'Spi_Driver';
const MESSAGES = [
  { from: 'SpiDrv', to: 'Hw', label: 'WriteReg(BAUD)' },
  { from: 'Hw', to: 'SpiDrv', label: 'ack2' },
];

test('primary 手順2 seq-1 にメッセージを 2 本足し、参加者を改名しても他の行が変わらない', async ({ page }, testInfo) => {
  const original = H.fixture('seq-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['SpiDrvMon', 'Spi_Init()']);
  let ops = 0;

  // メッセージを 2 本、末尾に追加の「メッセージ」から足す。
  for (const m of MESSAGES) {
    const r = await H.measure(page, testInfo, async () => {
      await page.locator('#seq-tail-kind-chip-message').click();
      await page.locator('#seq-tail-from').selectOption(m.from);
      await page.locator('#seq-tail-to').selectOption(m.to);
      await page.locator('#seq-tail-label-rle .rle-textarea').fill(m.label);
      await page.locator('#seq-tail-add').click();
    }, [m.label]);
    ops += 5;
    expect(r.diffLines, 'diff lines for ' + m.label).toBe(1);
    expect(H.removedLines(r.before, r.after)).toEqual([]);
    const added = r.after.split('\n').filter((l) => l.indexOf(m.label) >= 0);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(new RegExp('^\\s*' + m.from + '\\s*->\\s*' + m.to + '\\s*:\\s*' + m.label.replace(/[()]/g, '\\$&') + '\\s*$'));
  }

  // 参加者 SpiDrv を図の上で選び、Alias を Spi_Driver に変える (参照も追従)。
  // 末尾に追加の「メッセージ」は 1 本確定した後 To が空欄で、そのあいだ図の参加者を押すと To に入る
  // (選択は動かない)。改名のために押す前に、追加フォームの種類を「参加者」へ切り替えて離れる。
  const declLine = (await H.getEditorText(page)).split('\n').findIndex((l) => /^participant SpiDrv$/.test(l)) + 1;
  expect(declLine).toBeGreaterThan(0);
  const r = await H.measure(page, testInfo, async () => {
    await page.locator('#seq-tail-kind-chip-participant').click();
    await clickOverlayByLine(page, declLine);
    await expect(page.locator('#seq-edit-alias')).toHaveValue(OLD);
    await expect(page.locator('#seq-edit-rename-refs')).toBeChecked();
    await page.locator('#seq-edit-alias').fill(NEW);
    await page.locator('#seq-edit-alias').press('Tab');
  }, [NEW]);
  ops += 4;

  // 書き換わったのは SpiDrv を語として持つ行だけ。それ以外の行は 1 字も動かない。
  const word = new RegExp('\\b' + OLD + '\\b');
  const removed = H.removedLines(r.before, r.after);
  const expectRemoved = r.before.split('\n').filter((l) => word.test(l));
  expect(removed).toEqual(expectRemoved);
  const expectAfter = r.before.split('\n').map((l) => l.replace(new RegExp('\\b' + OLD + '\\b', 'g'), NEW)).join('\n');
  expect(r.after).toBe(expectAfter);
  // 前方一致の別の参加者・コメント・字下げは保たれる。
  expect(r.after).toContain('participant SpiDrvMon');
  expect(r.after).toContain("' 手で整えた図。字下げとコメントは道具に崩させない");
  expect(r.after).toContain('  ' + NEW + ' -> Hw : WriteReg(CTRL)');

  // 元の図からの差分: 足した 2 行 + 元の図で SpiDrv を持つ行の書き換え (消した分と足した分)。
  const total = H.diffLines(original, r.after);
  expect(total).toBe(2 + 2 * original.split('\n').filter((l) => word.test(l)).length);
  H.annotate(testInfo, 'ops', ops);

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, [NEW, 'WriteReg(BAUD)', 'ack2', 'SpiDrvMon']);
  const txt = await H.svgText(page);
  expect(txt.split('\n').map((s) => s.trim())).not.toContain(OLD);
});
