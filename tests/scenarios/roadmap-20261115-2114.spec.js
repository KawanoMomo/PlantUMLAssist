// @ts-check
// TICKET-roadmap-20261115-2114-2 (整理の締め) の守り:
//   外した機能の設定 (localStorage に残った控え) と、外した機能が保存先に置いた物 (`指摘.md`・`_versions/`・
//   `{名前}-編集中.puml`・`_export-log.json`) が残る保存先を開いても、ページエラー 0 で図が描け、
//   何も直さずに Ctrl+S しても .puml はバイト一致のまま。保存先のほかのファイルは読み書きしない (中身も並びも変わらない)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const NAME = 'seq-1';

// 外した機能が localStorage に書いていた控え (v4.0 時点の鍵)。今の製品は読まない。
const OLD_KEYS = {
  'plantuml-handover-checklist': '{"seq-1":{"done":true}}',
  'plantuml-meeting-set': '["seq-1"]',
  'plantuml-review-verdicts': '{"seq-1":{"3":"要修正"}}',
  'plantuml-finding-links': '{broken json',
  'plantuml-source-lock-default': 'copy',
  'plantuml-lineage': '{"seq-1":"seq-0"}',
};

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    fs.readdirSync(d).sort().forEach((f) => {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p).replace(/\\/g, '/')] = fs.readFileSync(p).toString('base64');
    });
  })(dir);
  return out;
}

test('roadmap 2114 外した機能の控えが残る保存先を開いても描け、無変更の保存はバイト一致', async ({ page }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));

  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '_versions', NAME), { recursive: true });
  const original = Buffer.from(H.fixture('seq-1-crlf.puml').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
  fs.writeFileSync(path.join(dir, NAME + '.puml'), original);
  fs.writeFileSync(path.join(dir, '指摘.md'), '# 指摘\r\n- seq-1: SpiDrv の名前\r\n');
  fs.writeFileSync(path.join(dir, NAME + '-編集中.puml'), '@startuml\r\nA -> B\r\n@enduml\r\n');
  fs.writeFileSync(path.join(dir, '_versions', NAME, '20260101-000000.puml'), '@startuml\nA -> B\n@enduml\n');
  fs.writeFileSync(path.join(dir, '_export-log.json'), '{"seq-1":[{"at":"2026-01-01","kind":"svg"}]}');
  const before = snapshot(dir);

  await page.addInitScript((keys) => {
    try { Object.keys(keys).forEach((k) => window.localStorage.setItem(k, keys[k])); } catch (e) {}
  }, OLD_KEYS);
  await S.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolderItem(page, NAME);
  await expect(page.locator('#editor')).toHaveValue(/Spi_Write\(\)/, { timeout: 20000 });
  await S.closeFolderList(page);
  await H.waitDrawn(page, ['SpiDrvMon', 'Spi_Write()']);

  // 何も直さずに保存する。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1500);

  expect(Buffer.compare(fs.readFileSync(path.join(dir, NAME + '.puml')), original)).toBe(0);
  expect(snapshot(dir)).toEqual(before);
  expect(errors).toEqual([]);
});
