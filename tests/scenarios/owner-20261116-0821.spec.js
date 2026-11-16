// @ts-check
// TICKET-owner-20261116-0821-prune: 右の枠 (読むだけの図 / この図の履歴の版) に残った付け足し
// (⚖ 整合チェック・書き込み履歴の帯と控え・「手本なし」の憶え) を外した後も、
// (1) 「この図の履歴」の行の「比較」で前の版が右の枠に並び、今の図はそのまま。右の枠に整合チェック・書き込み履歴の帯は無い。
// (2) 外した道具の控え (localStorage の書き込み履歴・保存先の `_peek/settled.json`) が残った設定と保存先でも、
//     エラー無しで開けて描け、控えのファイルは消さない・書かない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const GONE = ['整合チェック', '書き込み履歴', '手本なし'];

const STATE = ['@startuml', 'state IDLE', 'IDLE --> RUNNING : start', '@enduml', ''].join('\n');
const STATE2 = ['@startuml', 'state IDLE', 'IDLE --> ERROR : fail', '@enduml', ''].join('\n');

const OLD_WRITES = JSON.stringify({ './x': [{ id: 'w1', kind: 'rename', at: '2026-11-01T09:00:00.000Z',
  meta: { from: 'A', to: 'B' }, files: [{ name: 'gpio_state', before: 'x', after: 'y' }] }] });

test('owner 0821 この図の履歴の「比較」で前の版が右に並び、右の枠に整合チェック・書き込み履歴の帯は無い', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '_peek'), { recursive: true });
  // 外した「手本なし」の憶えが保存先に残っている。
  const settled = path.join(dir, '_peek', 'settled.json');
  const settledText = JSON.stringify({ entries: [{ peer: 'primary', kind: 'usecase', count: 0, at: '2026-11-01T09:00:00Z' }] });
  fs.writeFileSync(settled, settledText, 'utf8');

  await S.bootWithSaveDir(page, S.dirFor(__filename));
  // 外した書き込み履歴の控えが localStorage に残っている。
  await page.evaluate((v) => { localStorage.setItem('plantuml-write-history', v); }, OLD_WRITES);
  await S.putDoc(page, S.dirFor(__filename), 'gpio_state', STATE);
  await page.waitForTimeout(1100);   // server の刻印は秒。版が同じ秒に潰れないように
  await S.putDoc(page, S.dirFor(__filename), 'gpio_state', STATE2);

  // 保存先の一覧の [履歴 N] から「この図の履歴」を開き、版の「比較」を押す。
  await S.openFolder(page);
  await page.waitForSelector('#folder-panel.open');
  await expect(page.locator('#folder-panel [data-versions-name="gpio_state"]')).toHaveText(/履歴 \d/);
  await page.locator('#folder-panel [data-versions-name="gpio_state"]').click();
  await expect(page.locator('#vt-modal')).toBeVisible();
  await page.locator('#vt-body [data-version-compare][data-version-of="gpio_state"]').first().click();
  await expect(page.locator('#vt-modal')).toBeHidden();

  // 今の図はそのまま (上書きされない)。右の枠には前の版が並び、描ける。
  await expect.poll(() => page.evaluate(() => {
    const d = window.MA.workspace.getActive();
    return d ? d.name + '|' + d.dsl : '';
  })).toContain('gpio_state|');
  expect(await page.evaluate(() => window.MA.workspace.getActive().dsl)).toContain('IDLE --> ERROR');
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-select option:checked')).toContainText('gpio_state@');
  await expect(page.locator('#compare-status')).toHaveText('前の版 (読むだけ)', { timeout: 20000 });
  await expect(page.locator('#compare-svg')).toContainText('RUNNING', { timeout: 20000 });
  await S.closeFolderList(page).catch(() => {});
  await page.screenshot({ path: testInfo.outputPath('compare-pane.png') });

  // 右の枠に外した帯は無く、選べる相手も版だけ (書き込み履歴の回は出ない)。
  for (const id of ['#check-bar', '#btn-check-run', '#check-list', '#compare-hist-bar', '#btn-compare-hist', '#compare-hist-list']) {
    await expect(page.locator(id), id).toHaveCount(0);
  }
  await expect(page.locator('#compare-select option[data-hist]')).toHaveCount(0);
  const paneText = await page.locator('#compare-pane').innerText();
  for (const w of GONE) expect(paneText, w).not.toContain(w);

  // ± 差分 に移っても、前回保存時点との言い切りだけ (書き込み履歴の回を基準にした「… の前から」は足さない)。
  await page.locator('#compare-mode-diff').click();
  await expect(page.locator('#compare-diff-head')).toContainText('gpio_state');
  await expect(page.locator('#compare-diff-head')).not.toContainText('の前から');
  await expect(page.locator('#compare-diff-head')).not.toHaveAttribute('data-basis', /.+/);
  await page.locator('#compare-mode-ref').click();

  // 控えのファイルは残り、中身も変わらない。画面のどこにも外した道具の語は出ない。
  expect(fs.readFileSync(settled, 'utf8')).toBe(settledText);
  const bodyText = await page.locator('body').innerText();
  for (const w of GONE) expect(bodyText, w).not.toContain(w);
  await H.expectRendered(page);
  H.annotate(testInfo, 'diffLines', 0);
  expect(errors, errors.join('\n')).toEqual([]);
});
