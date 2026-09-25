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
// PlantUML 1.2026.2 自身が描画の途中で落ち (jar の CLI でも同じ NullPointerException)、「An error has occured」
// 「PlantUML (…) has crashed.」だけの絵を返していた。落ちた絵は描画の失敗として出し (見出し ERROR・帯・直前の図を残す)、
// 同じ <style> でも PlantUML が描ける図はそのまま描く。
// BLK-migrator-20260925-0752: 同梱・取得の既定を 1.2026.3 に上げ、この実物は PlantUML 自身が描けるようになった。
// 落ちた絵の扱いは、1.2026.2 が返した絵 (fixtures/svg/plantuml-crash-1.2026.2.svg) を server の見分けに通し、
// その 422 を画面が受けたときの見え方で確かめる。
test('手順3 PlantUML が落ちる図は成功のふりをせず描画エラーに出し、<style> 付きスプライトでも描ける図は描く', async ({ page }) => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const FIX = path.join(__dirname, '..', '..', 'fixtures');
  const read = (n) => fs.readFileSync(path.join(FIX, 'dsl', n), 'utf8').replace(/\r\n/g, '\n');
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

  // 1.2026.2 が落ちていた実物は、今の既定の PlantUML で図として描ける。
  await setDsl(read('svg-sprite-style-crash.puml'));
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect.poll(previewTexts, { timeout: 20000 }).toEqual(expect.arrayContaining(['hello', 'there']));
  await expect(page.locator('#render-error-overlay')).toBeHidden();
  const drawn = await page.request.post('/render', { data: { text: read('svg-sprite-style-crash.puml'), mode: 'local' } });
  expect(drawn.status()).toBe(200);

  // server は PlantUML が落ちた絵を 200 の SVG として流さず、描画の途中で落ちたと見分ける (curl からも 422 になる元)。
  const crashSvg = path.join(FIX, 'svg', 'plantuml-crash-1.2026.2.svg');
  const root = path.join(__dirname, '..', '..', '..');
  const judged = JSON.parse(execFileSync('python', ['-c',
    'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
    + 'print(json.dumps(server.detect_render_error(open(sys.argv[2], "rb").read())))', root, crashSvg],
  { encoding: 'utf8' }));
  expect(judged.crashed).toBe(true);
  expect(judged.message).toContain('PlantUML 1.2026.2 が描画の途中で落ちました');
  expect(judged.message).toContain('NullPointerException');

  // その 422 (kind: plantuml-crash) を受けた画面は、落ちた絵を図として出さず描画エラーとして言い、直前の図を残す。
  await setDsl(read('svg-sprite-style-min.puml'));
  await expect.poll(previewTexts, { timeout: 20000 }).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  await page.route('**/render', (route) => route.fulfill({ status: 422, contentType: 'application/json',
    body: JSON.stringify({ error: judged.message, line: null, kind: 'plantuml-crash' }) }));
  await setDsl(read('svg-sprite-style-crash.puml'));
  await expect(page.locator('#render-status')).toHaveText('ERROR', { timeout: 20000 });
  await expect(page.locator('#render-error-overlay')).toBeVisible();
  await expect(page.locator('#render-error-overlay')).toContainText('描画の途中で落ちました');
  await expect(page.locator('#render-error-overlay')).toContainText('NullPointerException');
  const after = await previewTexts();
  expect(after.some((t) => /An error has occured|has crashed/.test(t)), '落ちた絵が図として出ている').toBe(false);
  expect(after).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  await page.unroute('**/render');
});

// BLK-migrator-20260925-0752: package 宣言の先頭に可視性の `+` を付けた実物 (PlantUML 公式 issue #2846 の再現、
// web/plantuml の vega/nonreg/group2846)。1.2026.2 は PlantUML 自身が `Syntax Error? (Assumed diagram type: sequence)` で拒んでいた。
// 同梱・取得の既定を読める版 (1.2026.3) に上げた。図種はクラス図と判定され、本文の `+` は外さずにそのまま描く。
test('手順3 package 宣言に可視性の + が付いた実物がクラス図として描け、本文は書き換わらない', async ({ page }) => {
  const SRC = '@startuml\n+package "Hello" as uid <<Frame>> {\n  class World\n}\n@enduml\n';
  await gotoApp(page);
  const kind = await page.evaluate((text) => window.MA.workspace.detectType(text), SRC);
  expect(kind).toBe('plantuml-class');
  await page.evaluate((text) => {
    const ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, SRC);
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(page.locator('#render-error-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll('#preview-svg svg text')).map((t) => (t.textContent || '').trim())), { timeout: 20000 })
    .toEqual(expect.arrayContaining(['Hello', 'World']));
  expect(await page.locator('#editor').inputValue()).toBe(SRC);
  const res = await page.request.post('/render', { data: { text: SRC, mode: 'local' } });
  expect(res.status()).toBe(200);
});
