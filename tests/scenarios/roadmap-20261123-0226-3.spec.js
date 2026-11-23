// @ts-check
// TICKET-roadmap-20261123-0226-3 (roadmap/v7.0.md できれば 2): GIT 節の変更の行と FILES のツリーの M・A の印が、
//   サブフォルダの図でも直下の図と同じに押して開け、印が付く。
// 期待 (利用者の初回と同じ既定の画面・実マウス。Git の作業木にした試験用の保存先):
//   - 1 階層下の図を 1 行直して Ctrl+S → GIT 節の変更の行にその図が道付きで出て、押すとその図が開き最後のコミットと並ぶ。
//     ツリーのその図の行に M の印が付き、直下の同じ名前の図の行には付かない
//   - 直下に同じ名前の図があり、それを開いている時に押しても、押した行の道の図が開く
//   - この間、保存先以下の全ファイルは保存した 1 枚以外バイト一致・増えたファイル 0
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
    }
  })(dir);
  return out;
}

async function mouseClick(page, locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const TOP = '@startuml\nparticipant TopOnly\nTopOnly -> TopOnly : top\n@enduml\n';
const SUB = '@startuml\nparticipant SubOnly\nparticipant SpiDrv\nSubOnly -> SpiDrv : Spi_Init()\n@enduml\n';

test('roadmap 0226-3 サブフォルダの図の変更の行を押すとその図が開いて最後のコミットと並び、ツリーの行に M が付く', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = path.join(S.absDirFor(__filename), 'g1');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'hw'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spi_state.puml'), TOP);
  fs.writeFileSync(path.join(dir, 'hw', 'spi_state.puml'), SUB);
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'roadmap');
  git('config', 'user.email', 'roadmap@example.invalid');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', '初版');
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/g1');

  // 1 階層下の図を FILES のツリーから開いて 1 行直し、Ctrl+S。
  const hw = page.locator('#files-subtree .files-sub-dir[data-sub-rel="hw"]');
  await expect(hw).toHaveCount(1, { timeout: 10000 });
  if ((await hw.getAttribute('aria-expanded')) !== 'true') await mouseClick(page, hw);
  const subRow = page.locator('#files-subtree .files-sub-file[data-sub-rel="hw"][data-file-name="spi_state"]');
  await mouseClick(page, subRow);
  await H.waitDrawn(page, ['SubOnly']);
  const fixed = SUB.replace('@enduml', 'SpiDrv --> SubOnly : E_OK\n@enduml');
  await S.typeDsl(page, fixed);
  await H.waitDrawn(page, ['E_OK']);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await expect.poll(() => fs.readFileSync(path.join(dir, 'hw', 'spi_state.puml'), 'utf8')).toBe(fixed);

  // 直下の同じ名前の図を開いておく (変更の行を押したら、こちらではなく押した行の道の図が開くこと)。
  const topRow = page.locator('#files-parts .files-part-file[data-file-name="spi_state"]');
  await mouseClick(page, topRow);
  await expect.poll(() => H.getEditorText(page)).toContain('TopOnly');

  // GIT 節を開いて読み直す。変更の行はサブフォルダの図を道付きで出す。
  await mouseClick(page, page.locator('#files-sec-git'));
  await mouseClick(page, page.locator('#git-refresh'));
  const change = page.locator('#git-changes .git-change[data-file="hw/spi_state.puml"]');
  await expect(change).toHaveCount(1, { timeout: 10000 });
  await expect(change).toHaveAttribute('data-git-code', 'M');
  await expect(change.locator('.git-change-name')).toHaveText('hw/spi_state');
  await expect(page.locator('#git-changes .git-change')).toHaveCount(1);
  // ツリーのその図の行に M。直下の同じ名前の図の行には付かない。
  await expect(subRow).toHaveAttribute('data-git', 'M');
  await expect(topRow).not.toHaveAttribute('data-git', /.+/);

  // 変更の行を押すと、押した行の道の図が開き、最後のコミットと右の枠に並ぶ。
  await mouseClick(page, change);
  await expect.poll(() => H.getEditorText(page)).toBe(fixed);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-sub-rel', 'hw');
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-git-pick')).toContainText('初版');
  await expect(page.locator('#senior-pane')).toContainText('SubOnly', { timeout: 10000 });
  await expect(page.locator('#senior-pane')).not.toContainText('TopOnly');
  await page.screenshot({ path: testInfo.outputPath('git-subfolder.png') });

  // 保存した 1 枚以外はバイト一致、増えたファイル 0 (行を押す・印を見るだけでは何も書かない)。
  await page.waitForTimeout(1500);
  const after = snapshot(dir);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) {
    if (k === 'hw/spi_state.puml') continue;
    expect(after[k], k).toBe(before[k]);
  }
  expect(errors).toEqual([]);
});
