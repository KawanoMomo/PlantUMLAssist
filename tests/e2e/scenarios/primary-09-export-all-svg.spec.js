// @ts-check
// primary 台本 手順9: 全図を、設計書に貼るために SVG で一括出力する(全図をSVGで保存 zip)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// BLK-owner-20260923-2332-prune: 開いている図を全部 zip にする範囲は、Export ▾ の独立した項目から
// 📦 資料セットの「対象の選び方」→「開いている図すべて」に移った。
async function exportOpenDocs(page, timeout) {
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#dsc-open', { state: 'visible' });
  const dl = page.waitForEvent('download', { timeout: timeout || 20000 }).catch(() => null);
  await page.locator('#dsc-open').click();
  return dl;
}

test('手順9 開いている全図を SVG の zip で 1 度に書き出せる', async ({ page }) => {
  test.setTimeout(90 * 1000);
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state', 'can_state']) {
    await S.putDoc(page, DIR, n, S.docFor(n));
    await S.openFolderItem(page, n);
  }

  const download = await (await exportOpenDocs(page, 60000));
  // 到達条件: zip が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

// BLK-primary-20260909-0003-wish: 2 度目以降の書き出しで「前回書き出しから
// 変わった図だけ」に絞れる。控えは保存フォルダに置くので、開き直しても残る。
test('手順9 2 度目は前回書き出しからの差分が出て、変わった図だけに絞れる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) {
    await S.putDoc(page, DIR, n, S.docFor(n));
    await S.openFolderItem(page, n);
  }

  // 1 度目。ここが次回の基準になる。
  expect(await exportOpenDocs(page, 60000)).not.toBeNull();
  await page.waitForFunction(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    const j = r.ok ? await r.json() : null;
    return !!(j && j.exportLog);
  }, DIR, { timeout: 20000 });

  // 3 枚のうち 1 枚だけをフォルダ側で書き換え、開き直す。
  // 控えは localStorage ではなく保存フォルダにあるので開き直しても残る。
  await S.putDoc(page, DIR, 'spi_state', S.docFor('spi_state') + "\n' 追記\n");
  await S.bootWithSaveDir(page, DIR);
  for (const n of NAMES) await S.openFolderItem(page, n);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-scope', { state: 'visible' });
  await page.locator('#dsc-pick').click();
  await expect(page.locator('#expick-modal')).toBeVisible();
  // 「初回」ではなく前回書き出しの時点が基準として出る。
  await expect(page.locator('#expick-since')).toContainText('前回SVG 一括出力');
  await expect(page.locator('#expick-since')).not.toContainText('初回');
  await page.locator('#expick-mode-since').click();
  await expect(page.locator('#expick-count')).toContainText('前回書き出しから変わった図のみ');
  // 3 枚のうち直した 1 枚だけが残る (最初から開いている白紙の図は前回書き出しに
  // 含まれているので、ここでは数に入らない)。
  await expect(page.locator('#expick-count')).toContainText(/：1 \/ \d+ 枚/);
});

// BLK-primary-20260914-1806-wish: 「新人に引き継ぐ」ために全図を SVG にしたら、zip の中身は
// その回に開いた 2 枚だけだった (書き出しの対象が開いているタブなので)。渡す資料を作るには
// 14 枚を毎回 1 枚ずつ開き直すしかなく、手順1 で数えた 14 枚を開き直す作業そのものが手順だった。
// 📂一覧で印を付けた図を、1 枚も開かずに zip へ入れられることを到達条件にする。
test('手順9 保存フォルダの図を、1 枚も開き直さずに選んで zip にできる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state', 'can_init_sequence'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 保存フォルダには 4 枚ある。タブは開いたままの白紙 1 枚だけ (= 開き直していない)。
  for (const n of NAMES) await S.putDoc(page, DIR, n, S.docFor(n));
  await S.bootWithSaveDir(page, DIR);

  // 保存フォルダにあるのは 4 枚 + 開いたままの白紙 (自動保存で 1 枚増える)。
  const saved = await S.listDir(page, DIR);
  for (const n of NAMES) expect(saved).toContain(n);

  await S.openFolder(page);
  await page.locator('#folder-panel .folder-pick-all').click();
  const btn = page.locator('#folder-panel .folder-export-svg');
  // 到達条件 1: 印を付けた枚数が、開いているタブの数ではなく保存フォルダの枚数で出る。
  await expect(btn).toBeEnabled();
  await expect(btn).toContainText(saved.length + ' 枚');

  const dl = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await btn.click();
  const download = await dl;
  // 到達条件 2: 1 枚も開かずに zip が出る。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  // 到達条件 3: zip の中身は保存フォルダの図 (開いたタブの枚数ではない)。
  const fs = require('fs');
  const zip = fs.readFileSync(await download.path());
  const entries = [];
  const re = /\x50\x4b\x03\x04/g;
  let m;
  while ((m = re.exec(zip.toString('latin1'))) !== null) {
    const at = m.index;
    const len = zip.readUInt16LE(at + 26);
    entries.push(zip.toString('utf-8', at + 30, at + 30 + len));
  }
  for (const n of NAMES) expect(entries).toContain(n + '.svg');
  expect(entries.filter((e) => e.endsWith('.svg')).length).toBe(saved.length);
});

// BLK-primary-20260914-2006-wish: 「全図を SVG で保存 (zip)」の対象は今開いている
// タブだけで、保存フォルダに 14 枚あってもタブが 1 枚なら 1 枚しか入らない。
// しかも入らなかったことは zip を開くまで分からないので、書き出すたびに
// 「今何枚開いているか」を数え直すはめになっていた。資料に入れる図の組に
// 名前を付けて登録し、名前を選ぶだけで常にその枚数が入るようにする。
test('手順9 資料セットを登録すると、タブを開き直さずに保存フォルダの全図が zip に入る', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n));
  // タブは 1 枚だけ開く (= 起票時の状況。ここで「全図」を押すと 1 枚しか出ない)。
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await S.openFolderItem(page, 'spi_init_sequence');

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });

  // 到達条件その1: 名前は既定で埋まっていて、対象枚数が押す前に出る
  // (押してから枚数を知る作りが、1 枚しか入らない事故の元だった)。
  await expect(page.locator('#docset-name')).not.toHaveValue('');
  await expect(page.locator('#docset-pick-count')).toContainText('保存フォルダの全図');
  const picked = Number((await page.locator('#docset-pick-count').textContent()).match(/(\d+)/)[1]);
  expect(picked).toBeGreaterThanOrEqual(S.PRIMARY_DOCS.length);

  await page.locator('#docset-name').fill('顧客資料');
  await page.locator('#docset-create').click();

  const row = page.locator('.ds-row[data-set-name="顧客資料"]');
  await expect(row).toHaveCount(1);
  // 到達条件その2: 登録した枚数と、今フォルダにある枚数を言い切る。
  await expect(row.locator('.ds-sum')).toHaveAttribute('data-expected', String(picked));
  await expect(row.locator('.ds-sum')).toHaveAttribute('data-present', String(picked));

  // 到達条件その3: 開いているタブは 1 枚のままなのに、対象は 14 枚以上ある。
  expect(await page.locator('#tab-bar .tab').count()).toBeLessThan(S.PRIMARY_DOCS.length);

  const dl = page.waitForEvent('download', { timeout: 150000 }).catch(() => null);
  await row.locator('.ds-export').click();
  const download = await dl;
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  await expect(page.locator('#docset-status'))
    .toContainText(picked + ' 枚の資料セット', { timeout: 150000 });

  // 到達条件その4: zip の中身が実際にその枚数ある (起票の事故は「1 枚しか入って
  // いない」ことが zip を開くまで分からなかったことなので、中身まで数える)。
  const zipPath = test.info().outputPath('docset.zip');
  await download.saveAs(zipPath);
  const buf = require('fs').readFileSync(zipPath);
  let svgs = 0;
  for (let i = 0; i + 4 <= buf.length; i++) {
    // ローカルファイルヘッダ (PK) を数える
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) svgs++;
  }
  expect(svgs).toBeGreaterThanOrEqual(picked);

  // BLK-primary-20260918-0249 到達条件その5: zip が保存フォルダに実際に届いている。
  // 起票の事故は「トーストは成功、ファイルはどこにも無い」だったので、
  // 画面の文言ではなくフォルダの中身で確かめる。
  const landed = require('path').join(S.absDirFor(__filename), download.suggestedFilename());
  expect(require('fs').existsSync(landed)).toBe(true);
  expect(require('fs').statSync(landed).size).toBe(buf.length);
});

// BLK-primary-20260918-0249: 届かなかったときに「保存しました」と出ると、
// ファイルが無いことに画面上で気付けない。保存が断られた回は成功を名乗らない。
test('手順9 資料セットの zip が保存できなかった回は、成功と表示しない', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  // 保存先が書けない状況を作る (ディスク不足・権限なしと同じ経路)。
  await page.route('**/export-zip', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'write failed' }),
  }));

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  await page.locator('#docset-name').fill('顧客資料');
  await page.locator('#docset-create').click();

  const row = page.locator('.ds-row[data-set-name="顧客資料"]');
  await expect(row).toHaveCount(1);
  await row.locator('.ds-export').click();

  // 到達条件: 保存できなかったことを言い、「保存しました」とは言わない。
  await expect(page.locator('#docset-status'))
    .toContainText('zip を保存できませんでした', { timeout: 150000 });
  await expect(page.locator('#docset-status')).not.toContainText('枚を SVG で保存しました');
});

// BLK-primary-20260916-0100-wish: 資料セットは登録して zip を出すところまでしか GUI で
// 完結せず、実際に提案書へ貼るときの「どの順で並べるか」「各図にどんな見出し・1 行説明を
// 添えるか」は zip を開いた後に資料側の道具で手作業だった。順序を入れ替えたい・説明を
// 足したいと気付くのが貼り込んだ後なので、毎回そこで手戻りが出る。貼る前に GUI 上で
// 資料の体裁まで確かめてから書き出せることを到達条件にする。
test('手順9 貼る前に、資料セットの順序・見出し・1 行説明を組んで 1 枚物で確かめられる', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) await S.putDoc(page, DIR, n, S.docFor(n));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  await page.locator('#docset-name').fill('顧客資料');
  await page.locator('#docset-create').click();

  const row = page.locator('.ds-row[data-set-name="顧客資料"]');
  await expect(row).toHaveCount(1);

  // 到達条件その1: 資料セットの行から、貼る前の体裁を組む画面に入れる。
  await row.locator('.ds-layout').click();
  await expect(page.locator('#docset-layout')).toBeVisible();
  const rows = page.locator('#dl-rows .dl-row');
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(NAMES.length);
  // 到達条件その2: 書き出す前に「1 行説明が空の図」を名指しする。
  await expect(page.locator('#dl-sum')).toContainText('1 行説明が空の図');

  // 到達条件その3: 見出しと 1 行説明を書くと、貼り込みプレビューにそのまま出る。
  const first = rows.first();
  const firstName = await first.getAttribute('data-doc-name');
  await first.locator('.dl-heading').fill('SPI 初期化シーケンス');
  await first.locator('.dl-note').fill('起動直後の初期化手順を示す');
  await expect(page.locator('#dl-toc .dl-toc-line[data-no="1"]'))
    .toHaveText('図1 SPI 初期化シーケンス — 起動直後の初期化手順を示す');
  await expect(page.locator('#dl-sheet .dl-fig[data-no="1"] .dl-fig-head'))
    .toHaveText('図1 SPI 初期化シーケンス');

  // 到達条件その4: 並び順を GUI で変えられ、図番号と目次が振り直される。
  await first.locator('.dl-down').click();
  await expect(page.locator('#dl-rows .dl-row').nth(1))
    .toHaveAttribute('data-doc-name', firstName);
  await expect(page.locator('#dl-toc .dl-toc-line[data-no="2"]'))
    .toHaveText('図2 SPI 初期化シーケンス — 起動直後の初期化手順を示す');

  // 到達条件その5: 体裁は保存フォルダの持ち物なので、開き直しても残る。
  await page.locator('#dl-save').click();
  await expect(page.locator('#docset-status')).toContainText('体裁');
  await S.bootWithSaveDir(page, DIR);
  await page.waitForSelector('#preview-svg');
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  await page.locator('.ds-row[data-set-name="顧客資料"] .ds-layout').click();
  await expect(page.locator('#dl-rows .dl-row').nth(1))
    .toHaveAttribute('data-doc-name', firstName);
  await expect(page.locator('#dl-rows .dl-row').nth(1).locator('.dl-heading'))
    .toHaveValue('SPI 初期化シーケンス');

  // 到達条件その6: 書き出した zip に、組んだ順の図番号付き SVG と目次付きの 1 枚物が入る。
  await page.locator('#dl-back').click();
  const dl = page.waitForEvent('download', { timeout: 150000 }).catch(() => null);
  await page.locator('.ds-row[data-set-name="顧客資料"] .ds-export').click();
  const download = await dl;
  expect(download).not.toBeNull();
  const zipPath = test.info().outputPath('docset-layout.zip');
  await download.saveAs(zipPath);
  const buf = require('fs').readFileSync(zipPath);
  const entries = [];
  const re = /\x50\x4b\x03\x04/g;
  let m;
  const latin = buf.toString('latin1');
  while ((m = re.exec(latin)) !== null) {
    const at = m.index;
    const len = buf.readUInt16LE(at + 26);
    entries.push(buf.toString('utf-8', at + 30, at + 30 + len));
  }
  expect(entries).toContain('資料の体裁.md');
  expect(entries).toContain('02_' + firstName + '.svg');
  await expect(page.locator('#docset-status')).toContainText('資料の体裁.md', { timeout: 150000 });
});

// 登録したあとで図が減ったら、書き出す前に名指しで言う (zip を開いてから気付かせない)。
test('手順9 資料セットの図が保存フォルダから減ると、書き出す前に欠けた図を名指しする', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) await S.putDoc(page, DIR, n, S.docFor(n));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  await page.locator('#docset-name').fill('顧客資料');
  await page.locator('#docset-create').click();

  const sum0 = page.locator('.ds-row[data-set-name="顧客資料"] .ds-sum');
  await expect(sum0).toHaveClass(/ds-ready/);
  const expected = Number(await sum0.getAttribute('data-expected'));
  expect(expected).toBeGreaterThanOrEqual(NAMES.length);

  // 1 枚消して、ブラウザも開き直す (セットは localStorage ではなくフォルダの持ち物)。
  await page.evaluate(async (a) => {
    await fetch('/autosave?type=' + encodeURIComponent(a.name) + '&dir=' + encodeURIComponent(a.dir),
      { method: 'DELETE' });
  }, { dir: DIR, name: 'can_state' });
  await S.bootWithSaveDir(page, DIR);
  await page.waitForSelector('#preview-svg');
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });

  const sum = page.locator('.ds-row[data-set-name="顧客資料"] .ds-sum');
  await expect(sum).toHaveAttribute('data-expected', String(expected));
  await expect(sum).toHaveAttribute('data-present', String(expected - 1));
  await expect(sum).toContainText('can_state');
  await expect(sum).toHaveClass(/ds-short/);
});

// BLK-primary-20260916-0426-wish: docset から 24 枚の SVG を zip に書き出した後、
// 「客先に見せてよい状態か」を資料の完成物 (表紙・目次・図番号・注記込み) で見返す
// 画面が無かった。あるのは編集用のプレビュー (1 枚ずつ・DSL 入力欄と並び) だけで、
// 差し戻しがあれば zip を解凍して 1 枚ずつ開き直すことになる。
// 「書き出す → そのまま資料として見る → 直すページだけ編集に戻る」が 1 画面で
// 閉じることを到達条件にする。
test('手順9 書き出した資料を客先の体裁のまま見返し、直すページから編集に戻れる', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) await S.putDoc(page, DIR, n, S.docFor(n));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  await page.locator('#docset-name').fill('顧客資料');
  await page.locator('#docset-create').click();

  const row = page.locator('.ds-row[data-set-name="顧客資料"]');
  await expect(row).toHaveCount(1);

  // 体裁 (見出し・注記) を 1 枚だけ埋めて、残りは空のままにする。
  await row.locator('.ds-layout').click();
  await expect(page.locator('#docset-layout')).toBeVisible();
  const first = page.locator('#dl-rows .dl-row').first();
  const firstName = await first.getAttribute('data-doc-name');
  await first.locator('.dl-heading').fill('SPI 初期化シーケンス');
  await first.locator('.dl-note').fill('起動直後の初期化手順を示す');
  await page.locator('#dl-save').click();
  await expect(page.locator('#docset-status')).toContainText('体裁');
  await page.locator('#dl-back').click();

  // 到達条件その1: 書き出す前でも、資料セットの行から客先資料そのものの体裁で通しで見られる。
  await row.locator('.ds-proof').click();
  await expect(page.locator('#docset-proof')).toBeVisible({ timeout: 150000 });
  await expect(page.locator('#dp-cover .dp-cover-title')).toHaveText('顧客資料');
  await expect(page.locator('#dp-cover')).toContainText('全 ' + (await page.locator('#dp-pages .dp-fig').count()) + ' 図');

  // 到達条件その2: 目次・図番号・注記が資料の形で並ぶ。
  await expect(page.locator('#dp-toc .dp-toc-line[data-no="1"]'))
    .toHaveText('図1 SPI 初期化シーケンス — 起動直後の初期化手順を示す');
  const p1 = page.locator('#dp-pages .dp-fig[data-no="1"]');
  await expect(p1.locator('.dp-fig-head')).toHaveText('図1 SPI 初期化シーケンス');
  await expect(p1.locator('.dp-fig-note')).toHaveText('起動直後の初期化手順を示す');

  // 到達条件その3: 編集用プレビューではなく、図そのものが資料のページに入っている。
  await expect(p1.locator('.dp-fig-body svg')).toHaveCount(1);

  // 到達条件その4: 客先に出してよいかを 1 文で判定し、直す所を名指しする。
  await expect(page.locator('#dp-verdict')).toContainText('直すなら');
  await expect(page.locator('#dp-issues li[data-key="blank"]')).toContainText('注記が空のページ');

  // BLK-primary-20260916-0626-wish: 指摘を、資料を開いたままその場で埋める。
  // 指摘を押すと最初に埋めるページの注記欄へ飛び、打つと判定・目次がその場で変わる。
  await page.locator('#dp-issues li[data-key="blank"]').click();
  const p2 = page.locator('#dp-pages .dp-fig[data-no="2"]');
  await expect(p2.locator('.dp-note-input')).toBeFocused();
  const figs = await page.locator('#dp-pages .dp-fig').count();
  for (let i = 2; i <= figs; i++) {
    const pg = page.locator('#dp-pages .dp-fig[data-no="' + i + '"]');
    await pg.locator('.dp-heading-input').fill('見出し' + i);
    await pg.locator('.dp-note-input').fill('注記' + i);
  }
  await expect(page.locator('#dp-verdict')).toContainText('このまま客先に出せます');
  await expect(page.locator('#dp-issues')).toBeHidden();
  await expect(p2.locator('.dp-fig-head')).toHaveText('図2 見出し2');
  await expect(page.locator('#dp-toc .dp-toc-line[data-no="2"]')).toHaveText('図2 見出し2 — 注記2');
  await page.locator('#dp-save').click();
  await expect(page.locator('#docset-status')).toContainText('見出し・注記を保存しました');
  // 保存はフォルダ側の資料セットに入る (開き直しても残る)。
  const sets = await page.evaluate(async (d) => {
    const r = await fetch('/doc-sets?dir=' + encodeURIComponent(d));
    return r.ok ? r.json() : null;
  }, DIR);
  const saved = sets.sets.find((x) => x.name === '顧客資料');
  expect(saved.items.find((it) => it.note === '注記2')).toBeTruthy();

  // 到達条件その5: 差し戻しは、そのページから編集に戻れる (zip を解かない)。
  await p1.locator('.dp-edit').click();
  await expect(page.locator('#docset-modal')).toBeHidden();
  await expect(page.locator('#tab-bar .tab.active')).toContainText(firstName);

  // 到達条件その6: 書き出した直後は、zip に入った中身がそのまま資料として出る。
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  const dl = page.waitForEvent('download', { timeout: 150000 }).catch(() => null);
  await page.locator('.ds-row[data-set-name="顧客資料"] .ds-export').click();
  expect(await dl).not.toBeNull();
  await expect(page.locator('#docset-proof')).toBeVisible({ timeout: 150000 });
  await expect(page.locator('#dp-cover')).toContainText('.zip');
  await expect(page.locator('#dp-pages .dp-fig[data-no="1"] .dp-fig-body svg')).toHaveCount(1);
  await expect(page.locator('#dp-pages .dp-fig[data-no="1"] .dp-file')).toHaveText('01_' + firstName + '.svg');
});

// BLK-primary-20260917-0423-wish: 手順4「顧客に見せる形で SVG を選び、docset 出力に
// 渡す前に見出し・注記が揃っているかを確認する」は、14 枚を 1 枚ずつフォルダから
// 開き直してエディタの中身を目で追うしかなかった。体裁の画面に欄は並ぶが、
// 埋まっているかは 1 行ずつ読まないと分からず、「見出しが図名のまま」に至っては
// 書き出した後のトースト (doc-proof) しか言わないので、気付くのは zip を出した後。
// 行の頭に ○× を置き、空欄の行だけに絞れれば、手順は 2 手で終わる。
test('手順4 書き出す前に、見出し・注記の有無が図ごとに ○× で並び、空欄だけに絞れる', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) await S.putDoc(page, DIR, n, S.docFor(n));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-modal', { state: 'visible' });
  await page.locator('#docset-name').fill('顧客資料-手順4');
  await page.locator('#docset-create').click();
  await page.locator('.ds-row[data-set-name="顧客資料-手順4"] .ds-layout').click();
  await expect(page.locator('#docset-layout')).toBeVisible();

  const rows = page.locator('#dl-rows .dl-row');
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(NAMES.length);

  // 到達条件その1: どの行も、見出しと注記の有無を ○× で自分から言う。
  // (欄の中身を 1 行ずつ読まなくても、埋まっていない図が目で拾える)
  const first = rows.first();
  await expect(first.locator('.dl-mark')).toContainText('見出し ×');
  await expect(first.locator('.dl-mark')).toContainText('注記 ×');
  await expect(first).toHaveAttribute('data-ready', '0');

  // 到達条件その2: 「見出しが図名のまま」も、書き出す前の要約が枚数で言う。
  await expect(page.locator('#dl-sum')).toContainText('見出しが図名のままの図');

  // 到達条件その3: 空欄の残る枚数はボタンに出ていて、押せばその行だけになる。
  const only = page.locator('#dl-blank-only');
  await expect(only).toContainText('空欄だけ表示（' + total + ' 枚）');
  await only.click();
  await expect(only).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(total);          // 行は消えず、
  await expect(page.locator('#dl-rows .dl-row:visible')).toHaveCount(total);

  // 到達条件その4: 埋めた行はその場で ○ になる。打っている間は消えず、
  // 欄から離れたところで絞り込みから外れる。
  await first.locator('.dl-heading').fill('SPI 初期化シーケンス');
  await first.locator('.dl-note').fill('起動直後の初期化手順を示す');
  const firstAgain = page.locator('#dl-rows .dl-row').first();
  await expect(firstAgain.locator('.dl-mark')).toContainText('見出し ○');
  await expect(firstAgain.locator('.dl-mark')).toContainText('注記 ○');
  await expect(firstAgain).toBeVisible();
  await expect(page.locator('#dl-blank-only')).toContainText('（' + (total - 1) + ' 枚）');
  await first.locator('.dl-note').blur();
  await expect(firstAgain).toBeHidden();
  await expect(page.locator('#dl-rows .dl-row:visible')).toHaveCount(total - 1);
});
