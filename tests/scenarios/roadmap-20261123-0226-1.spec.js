// @ts-check
// TICKET-roadmap-20261123-0226-1 (roadmap v7.0 必須 2・クライテリア 2):
//   ⇄ 部品名を一括置換する (Ctrl+H) の「開いていない図も数える」が、保存先の直下だけでなく
//   その下の木 (サブフォルダ) の図も数えて当て、同じ名前の図をフォルダの道で見分け、
//   置換した開いていない図を置換前のバイト列に戻せる。
// 置き方 (PUA_DATA_ROOT の試験用フォルダだけ):
//   a.puml            直下・開く (SpiDrv を持つ)
//   other.puml        直下・当たらない
//   hw/a.puml         1 階層下・開かない・直下の a と同じ名前 (SpiDrv を持つ)
//   hw/c.puml         1 階層下・当たらない
//   hw/spi/b.puml     2 階層下・開かない・CRLF (SpiDrv を持つ)
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - Ctrl+H 1 回で、a・hw/a・hw/spi/b の 3 枚が道付きで「ヒットした図」に数えられる (当たらない 2 枚は 0 件)
//   - 置換後は各図で名前を語として持つ行だけが替わる (SpiDrvMon・コメント・字下げ・CRLF は不変)。
//     同じ名前の a と hw/a はそれぞれ自分の行だけが替わる。他のファイルはバイト一致・増えたファイル 0
//   - 「置換前に戻す」で、置換した開いていない図 (hw/a・hw/spi/b) が置換前のバイト列に戻る。開いている a は Ctrl+Z 1 回で戻る
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const REL = S.dirFor(__filename);
const ABS = S.absDirFor(__filename);

const LF = (s) => s.replace(/\r\n/g, '\n');
const SEQ1 = () => LF(H.fixture('seq-1.puml'));
const FILES = {
  'a.puml': () => Buffer.from(SEQ1(), 'utf8'),
  'other.puml': () => Buffer.from(LF(H.fixture('class-1.puml')), 'utf8'),
  'hw/a.puml': () => Buffer.from(LF(H.fixture('tree-hw-a.puml')), 'utf8'),
  'hw/c.puml': () => Buffer.from(LF(H.fixture('state-1.puml')), 'utf8'),
  'hw/spi/b.puml': () => Buffer.from(LF(H.fixture('tree-hw-spi-b.puml')).replace(/\n/g, '\r\n'), 'utf8'),
};
const HIT = ['a.puml', 'hw/a.puml', 'hw/spi/b.puml'];

function place(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const k of Object.keys(FILES)) {
    const p = path.join(dir, ...k.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, FILES[k]());
  }
}

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const buf = fs.readFileSync(p);
      out[path.relative(dir, p).replace(/\\/g, '/')] = {
        size: buf.length, sha1: crypto.createHash('sha1').update(buf).digest('hex'), buf,
      };
    }
  })(dir);
  return out;
}

// 名前を語として持つ所だけを替えたバイト列 (SpiDrvMon は別の名前なので替わらない)。
const renamed = (buf) => Buffer.from(buf.toString('utf8').replace(/\bSpiDrv\b/g, 'SpiCore'), 'utf8');

async function mouseClick(page, locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('Ctrl+H の置換が保存先の木の全部の図を道付きで数えて当て、同じ名前の図を取り違えず、開いていない図を置換前に戻せる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const sub = 'tree-' + process.pid + '-' + Date.now();
  const dir = path.join(ABS, sub);
  place(dir);
  const before = snapshot(dir);
  await H.bootWithSaveDir(page, REL + '/' + sub);

  // 直下の a を FILES から実マウスで開く。木 (hw・hw/spi) が FILES に出るのを待つ。
  await mouseClick(page, page.locator('#files-parts .files-part-file[data-file-name="a"]'));
  await expect(page.locator('#editor')).toHaveValue(SEQ1(), { timeout: 20000 });
  await H.waitDrawn(page, ['SpiDrvMon', 'Spi_Init()']);
  await expect(page.locator('#files-subtree .files-sub-dir[data-sub-rel="hw"]')).toHaveCount(1, { timeout: 10000 });

  // Ctrl+H 1 回。置換前・置換後を実マウスで欄を押してから打つ。
  await mouseClick(page, page.locator('#editor'));
  await page.keyboard.press('Control+h');
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await mouseClick(page, page.locator('#rename-from'));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('SpiDrv');
  await mouseClick(page, page.locator('#rename-to'));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('SpiCore');
  const head = page.locator('#rename-folder-head');
  await expect(head).toHaveAttribute('data-loading', '0', { timeout: 15000 });
  await page.screenshot({ path: testInfo.outputPath('rename-tree.png') });
  await expect(page.locator('label[for="rename-scan-folder"]'), '欄の語は届く範囲をそのまま言う').toContainText('サブフォルダの図も');

  // 3 枚とも道付きで「ヒットした図」に数えられる。同じ名前の a と hw/a は別の行。
  await expect(head, 'ヒットした図は 3 枚 (直下・1 階層下・2 階層下)').toHaveAttribute('data-hit-docs', '3');
  // 数える図: 置いた 5 枚 (開いた a は 1 行に畳む) と、起動時の白紙のタブ。
  await expect(page.locator('#rename-folder .folder-row:not(.zero)')).toHaveCount(3);
  const row = (label) => page.locator('#rename-folder .folder-row[data-doc-name="' + label + '"]');
  await expect(row('a')).toHaveAttribute('data-open', '1');
  await expect(row('a')).toHaveAttribute('data-count', '6');
  await expect(row('hw/a')).toHaveAttribute('data-open', '0');
  await expect(row('hw/a')).toHaveAttribute('data-count', '4');
  await expect(row('hw/a')).toContainText('hw/a');
  await expect(row('hw/spi/b')).toHaveAttribute('data-count', '2');
  await expect(row('hw/spi/b')).toContainText('hw/spi/b');
  await expect(row('other')).toHaveAttribute('data-count', '0');
  await expect(row('hw/c')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#rename-summary')).toHaveAttribute('data-unopened-docs', '2');

  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await mouseClick(page, page.locator('#btn-rename-apply'));
  await expect(page.locator('#rename-summary')).toHaveAttribute('data-applied-unopened', '2', { timeout: 15000 });
  await expect.poll(() => H.getEditorText(page)).toBe(renamed(Buffer.from(SEQ1())).toString('utf8'));
  await H.waitDrawn(page, ['SpiCore']);
  await H.expectRendered(page);
  await page.waitForTimeout(1500);   // 自動保存の待ちを越えて見る

  // 押した (当たった) 図だけが、名前の語だけ替わる。他はバイト一致・増えたファイル 0。
  const after = snapshot(dir);
  expect(Object.keys(after).sort(), '保存先以下に増えた・消えたファイルは無い').toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) {
    if (HIT.indexOf(k) >= 0) {
      expect(after[k].buf.equals(renamed(before[k].buf)), k + ' は名前の語だけが替わる (SpiDrvMon・コメント・改行は不変)').toBe(true);
    } else {
      expect(after[k].sha1, k + ' はバイト一致').toBe(before[k].sha1);
    }
  }
  expect(after['hw/spi/b.puml'].buf.toString('utf8').indexOf('\r\n') >= 0, 'CRLF のまま').toBe(true);
  expect(after['hw/spi/b.puml'].buf.toString('utf8').replace(/\r\n/g, '').indexOf('\n'), 'LF が混ざらない').toBe(-1);

  // 開いていない図を置換前に戻す (窓の中の 1 押し)。
  const revert = page.locator('#btn-rename-revert');
  await expect(revert).toHaveAttribute('data-docs', '2');
  await page.screenshot({ path: testInfo.outputPath('rename-tree-applied.png') });
  await mouseClick(page, revert);
  await expect(page.locator('#rename-summary')).toHaveAttribute('data-reverted', '2', { timeout: 15000 });
  await expect(revert).toBeHidden();
  const reverted = snapshot(dir);
  expect(Object.keys(reverted).sort()).toEqual(Object.keys(before).sort());
  for (const k of ['hw/a.puml', 'hw/spi/b.puml', 'other.puml', 'hw/c.puml']) {
    expect(reverted[k].sha1, k + ' は置換前のバイト列').toBe(before[k].sha1);
  }

  // 開いている a は今までどおり Ctrl+Z 1 回で戻る。
  await mouseClick(page, page.locator('#btn-rename-cancel'));
  await mouseClick(page, page.locator('#editor'));
  await page.keyboard.press('Control+z');
  await expect.poll(() => H.getEditorText(page)).toBe(SEQ1());
  await page.waitForTimeout(1500);
  const last = snapshot(dir);
  expect(Object.keys(last).sort()).toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) expect(last[k].sha1, k + ' は置く前と同じ').toBe(before[k].sha1);
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
