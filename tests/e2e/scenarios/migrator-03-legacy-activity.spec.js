// @ts-check
// migrator 台本 手順3: 実物の .puml を開くと図種が正しく判定される。
// BLK-migrator-20260917-2349: 旧記法 activity (`(*) -->` / `if "c" then`) が usecase と判定されていた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const LEGACY = '@startuml\n(*) --> "電源投入"\n"電源投入" --> "自己診断"\nif "診断結果" then\n  -->[OK] "通常起動"\nelse\n  -->[NG] "エラー処理"\nendif\n@enduml\n';

test('手順3 旧記法だけの activity 図を開くと activity と判定される', async ({ page }) => {
  await gotoApp(page);
  // フォルダ/ファイルから開いた図の図種は workspace.detectType で決まる。
  const kind = await page.evaluate((text) => window.MA.workspace.detectType(text), LEGACY);
  expect(kind).toBe('plantuml-activity');
  // usecase の短縮形は従来どおり usecase のまま。
  const uc = await page.evaluate(() => window.MA.workspace.detectType('@startuml\nactor User\n(Login)\n@enduml\n'));
  expect(uc).toBe('plantuml-usecase');
});

// BLK-migrator-20260924-1432: SVG スプライトに <style> の CSS を持つ実物 (web/plantuml の svg2GroupsWithStyle.puml) は、
// 同梱の PlantUML 1.2026.2 自身が描画の途中で落ち (jar の CLI でも同じ NullPointerException)、「An error has occured」
// 「PlantUML (…) has crashed.」だけの絵を返す。これを図として流し込み、見出しが Rendered のままになっていた (成功のふり)。
// 落ちた絵は描画の失敗として出し (見出し ERROR・帯・直前の図を残す)、同じ <style> でも PlantUML が描ける図はそのまま描く。
test('手順3 PlantUML が落ちる図は成功のふりをせず描画エラーに出し、<style> 付きスプライトでも描ける図は描く', async ({ page }) => {
  const fs = require('fs');
  const path = require('path');
  const read = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', n), 'utf8').replace(/\r\n/g, '\n');
  await gotoApp(page);
  const setDsl = (t) => page.evaluate((text) => {
    const ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, t);
  const previewTexts = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#preview-svg svg text')).map((t) => (t.textContent || '').trim()));

  // <style> の CSS ブロックを持つスプライトでも、PlantUML が描ける図は Alice → Bob として描ける。
  await setDsl(read('svg-sprite-style-min.puml'));
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect.poll(previewTexts, { timeout: 20000 }).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  await expect(page.locator('#render-error-overlay')).toBeHidden();

  // PlantUML 自身が落ちる実物: 落ちた絵を図として出さず、描画エラーとして言う。直前の図は残す。
  await setDsl(read('svg-sprite-style-crash.puml'));
  await expect(page.locator('#render-status')).toHaveText('ERROR', { timeout: 20000 });
  await expect(page.locator('#render-error-overlay')).toBeVisible();
  await expect(page.locator('#render-error-overlay')).toContainText('描画の途中で落ちました');
  await expect(page.locator('#render-error-overlay')).toContainText('NullPointerException');
  const after = await previewTexts();
  expect(after.some((t) => /An error has occured|has crashed/.test(t)), '落ちた絵が図として出ている').toBe(false);
  expect(after).toEqual(expect.arrayContaining(['Alice', 'Bob']));

  // curl から叩いても同じ: 落ちた絵は 200 の SVG ではなく 422 (kind: plantuml-crash) で返る。
  const res = await page.request.post('/render', { data: { text: read('svg-sprite-style-crash.puml'), mode: 'local' } });
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.kind).toBe('plantuml-crash');
  expect(body.error).toContain('NullPointerException');
  const ok = await page.request.post('/render', { data: { text: read('svg-sprite-style-min.puml'), mode: 'local' } });
  expect(ok.status()).toBe(200);
});
