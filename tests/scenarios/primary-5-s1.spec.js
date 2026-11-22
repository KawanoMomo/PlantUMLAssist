// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 5:
//   直した図を保存し、改行コード (CRLF)・字下げ・コメントが保たれるか、差分が一覧と一致するかを見る。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「同じ本文からは同じバイト列が保存される」):
//   - 保存先の CRLF の図を一覧から開き、GUI で直して Ctrl+S すると、同じファイルに CRLF のまま書かれる
//     (素の LF が 1 つも混ざらない。末尾の改行も元のまま)
//   - 手で入れた字下げ (空白・タブ)・行コメント・ブロックコメントは 1 バイトも変わらない
//   - 保存したファイルと元のファイルの差分は、仕様変更の一覧 (メッセージ 1 本の追加・参加者 1 つの改名) の分だけ
//   - 直した図が描ける
// 図: tests/scenarios/fixtures/seq-1-crlf.puml (CRLF で入れてある。.gitattributes で -text)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const { clickOverlayByLine } = require('../e2e/helpers');
const S = require('../e2e/scenarios/_scenario');

const NAME = 'seq-1';
const OLD = 'SpiDrv';
const NEW = 'Spi_Driver';
const MSG = { from: 'SpiDrv', to: 'Hw', label: 'WriteReg(BAUD)' };

// 保存先の図は、ほかの図と同じく Ctrl+S と自動保存でそのファイルに書く。「開いたファイルを上書きしますか」の
// 窓は出さず、`{名前}-編集中` の控えも作らない (TICKET-owner-20261115-1829-prune)。

test('primary 手順5 CRLF の図を直して保存しても CRLF・字下げ・コメントが保たれ、差分が一覧と一致する', async ({ page }, testInfo) => {
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // 取り出し方 (autocrlf) に左右されないよう、置くファイルは必ず CRLF にする。
  const originalLf = H.fixture('seq-1-crlf.puml').replace(/\r\n/g, '\n');
  const originalBytes = Buffer.from(originalLf.replace(/\n/g, '\r\n'), 'utf8');
  const file = path.join(dir, NAME + '.puml');
  fs.writeFileSync(file, originalBytes);

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolderItem(page, NAME);
  await expect(page.locator('#editor')).toHaveValue(/Spi_Write\(\)/, { timeout: 20000 });
  // 中央に開いた保存先の一覧を閉じて、図とフォームに戻る。
  await S.closeFolderList(page);
  await H.waitDrawn(page, ['SpiDrvMon', 'Spi_Write()']);
  // 開いただけでは本文は変わらない。
  expect(await H.getEditorText(page)).toBe(originalLf);
  let ops = 0;

  // 一覧 1: メッセージを 1 本、末尾に追加の「メッセージ」から足す。
  const rm = await H.measure(page, testInfo, async () => {
    await page.locator('#seq-tail-kind-chip-message').click();
    await page.locator('#seq-tail-from').selectOption(MSG.from);
    await page.locator('#seq-tail-to').selectOption(MSG.to);
    await page.locator('#seq-tail-label-rle .rle-textarea').fill(MSG.label);
    await page.locator('#seq-tail-add').click();
  }, [MSG.label]);
  ops += 5;
  expect(rm.diffLines).toBe(1);
  expect(H.removedLines(rm.before, rm.after)).toEqual([]);
  // 足したメッセージの矢印の種類を替え、Ctrl+Z 1 回で戻す (窓に吸われず図の Undo が効く)。
  const msgLine = rm.after.split('\n').findIndex((l) => l.indexOf(MSG.label) >= 0) + 1;
  await clickOverlayByLine(page, msgLine);
  await page.locator('#seq-edit-arrow-seg .prop-seg[data-value="-\\>x"]').click();
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toContain(MSG.from + ' ->x ' + MSG.to);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+z');
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(rm.after);
  ops += 4;
  // 窓は出ない。自動保存が聞かずに同じファイルへ書く (足した 1 行だけの差分・CRLF のまま)。
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);
  const wantAuto = Buffer.from(rm.after.replace(/\n/g, '\r\n'), 'utf8');
  await expect.poll(() => Buffer.compare(fs.readFileSync(file), wantAuto), { timeout: 15000 }).toBe(0);
  expect(fs.readdirSync(dir)).toEqual([NAME + '.puml']);

  // 一覧 2: 参加者 SpiDrv を図の上で選び、Alias を Spi_Driver に変える (参照も追従)。
  const declLine = rm.after.split('\n').findIndex((l) => /^participant SpiDrv$/.test(l)) + 1;
  expect(declLine).toBeGreaterThan(0);
  const rr = await H.measure(page, testInfo, async () => {
    // 直前に矢印を替えたメッセージが選ばれたままなら、右は編集パネルで「末尾に追加」は出ていない
    // (参加者を押せばそのまま選び替わる)。出ているときだけ種類を「参加者」へ切り替えて離れる。
    const chip = page.locator('#seq-tail-kind-chip-participant');
    if (await chip.isVisible()) await chip.click();
    await clickOverlayByLine(page, declLine);
    await expect(page.locator('#seq-edit-alias')).toHaveValue(OLD);
    await expect(page.locator('#seq-edit-rename-refs')).toBeChecked();
    await page.locator('#seq-edit-alias').fill(NEW);
    await page.locator('#seq-edit-alias').press('Tab');
  }, [NEW]);
  ops += 4;
  const word = new RegExp('\\b' + OLD + '\\b');
  expect(H.removedLines(rr.before, rr.after)).toEqual(rr.before.split('\n').filter((l) => word.test(l)));

  // 保存 (本文の欄で Ctrl+S)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  ops += 2;
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  H.annotate(testInfo, 'ops', ops);

  // 保存先の同じファイルが、画面の本文を CRLF にしたバイト列と一致する。
  const edited = await H.getEditorText(page);
  const want = Buffer.from(edited.replace(/\n/g, '\r\n'), 'utf8');
  await expect.poll(() => Buffer.compare(fs.readFileSync(file), want), { timeout: 10000 }).toBe(0);
  const saved = fs.readFileSync(file);
  const savedText = saved.toString('utf8');
  expect(/(^|[^\r])\n/.test(savedText), '素の LF が混ざらない').toBe(false);
  expect(savedText.endsWith('@enduml\r\n'), '末尾の改行も元のまま').toBe(true);
  // 別名の控えを作らない (直したのは開いたファイルそのもの)。保存先 (利用者の Git 作業木) には
  // .puml 以外の控え・目録 (_kinds.json / _meta.json / _versions/) も書かない (TICKET-owner-20261115-1827-1)。
  expect(fs.readdirSync(dir)).toEqual([NAME + '.puml']);

  // Undo・Redo の後にもう一度保存しても、保存先は .puml 1 枚のまま、中身は同じバイト列。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+z');
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).not.toBe(edited);
  await page.keyboard.press('Control+y');
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(edited);
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await expect.poll(() => Buffer.compare(fs.readFileSync(file), want), { timeout: 10000 }).toBe(0);
  await page.waitForTimeout(1500);   // 自動保存が走り終える間を置いてから数える
  expect(fs.readdirSync(dir)).toEqual([NAME + '.puml']);

  // 字下げ・コメントの行は元のバイトのまま残る (改名の対象の語を持つ行は改名分だけ変わる)。
  const savedLines = savedText.split('\r\n');
  for (const l of ["' 手で整えた図。改行は CRLF、字下げとコメントは道具に崩させない",
    '/\' 監視は別の流れ。', '   この塊は書き換えない \'/', '\tHw --> ' + NEW + ' : ack', '  ' + NEW + ' -> Hw : WriteReg(DATA)']) {
    expect(savedLines, '保たれる行: ' + JSON.stringify(l)).toContain(l);
  }

  // 差分が一覧と一致する: 消えた行は SpiDrv を語として持つ行だけ、足した行はその改名後と新しいメッセージ 1 本だけ。
  const savedLf = savedText.replace(/\r\n/g, '\n');
  const renamedOrig = originalLf.split('\n').filter((l) => word.test(l));
  expect(H.removedLines(originalLf, savedLf)).toEqual(renamedOrig);
  const added = H.removedLines(savedLf, originalLf);
  const msgRe = new RegExp('^\\s*' + NEW + '\\s*->\\s*Hw\\s*:\\s*WriteReg\\(BAUD\\)\\s*$');
  expect(added.filter((l) => msgRe.test(l))).toHaveLength(1);
  expect(added.filter((l) => !msgRe.test(l))).toEqual(renamedOrig.map((l) => l.replace(new RegExp('\\b' + OLD + '\\b', 'g'), NEW)));
  const d = H.diffLines(originalLf, savedLf);
  expect(d).toBe(1 + 2 * renamedOrig.length);
  H.annotate(testInfo, 'diffLinesSaved', d);

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, [NEW, 'WriteReg(BAUD)', 'SpiDrvMon']);
});
