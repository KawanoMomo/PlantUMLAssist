// @ts-check
// migrator 台本 手順3: 実物の .puml を開くと図種が正しく判定される。
// BLK-migrator-20260917-2349: 旧記法 activity (`(*) -->` / `if "c" then`) が usecase と判定されていた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');
const fs = require('fs');
const path = require('path');
const { bootWithSaveDir, dirFor, absDirFor } = require('./_scenario');

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
// 画面の見え方は、今の同梱版が実際に落ちる図で確かめる (BLK-builder-20260925-1052-4)。
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

  // BLK-builder-20260925-1052-4: 1.2026.3 は落ちた絵の 1 行目を「An error has occurred」と綴る (1.2026.2 は occured)。
  // 同梱の PlantUML が実際に落ちる図 (smetana で最初の並行領域が空の state、migrator の concurrent-empty-first-region) で、
  // server が 422 (plantuml-crash) を返し、画面は落ちた絵を図として出さず描画エラーとして言い、直前の図を残す。
  const crashDsl = read('smetana-empty-first-region-crash.puml');
  const crashed = await page.request.post('/render', { data: { text: crashDsl, mode: 'local' } });
  expect(crashed.status()).toBe(422);
  const crashedBody = await crashed.json();
  expect(crashedBody.kind).toBe('plantuml-crash');
  expect(crashedBody.error).toContain('が描画の途中で落ちました');
  await setDsl(read('svg-sprite-style-min.puml'));
  await expect.poll(previewTexts, { timeout: 20000 }).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  await setDsl(crashDsl);
  await expect(page.locator('#render-status')).toHaveText('ERROR', { timeout: 20000 });
  await expect(page.locator('#render-error-overlay')).toBeVisible();
  await expect(page.locator('#render-error-overlay')).toContainText('描画の途中で落ちました');
  await expect(page.locator('#render-error-overlay')).toContainText('IllegalArgumentException');
  const after = await previewTexts();
  expect(after.some((t) => /An error has occurr?ed|has crashed/.test(t)), '落ちた絵が図として出ている').toBe(false);
  expect(after).toEqual(expect.arrayContaining(['Alice', 'Bob']));
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

// BLK-migrator-20260925-0752 (差し戻し 1 回目): 同じ issue #2846 の語順違い `+package uid as "Hello" <<Frame>>` は、
// 公開版の PlantUML (1.2026.3〜1.2026.8) がどれも読めない (`Syntax Error? (Assumed diagram type: sequence)`)。
// 描けないことは隠さず、帯で「PlantUML {版} がこの行を読めません: N 行目 `その行`」と描画エンジンの限界であることと行を言い、
// PlantUML の推測 (sequence) が本文の図種 (クラス図) と違うことも言う。ファイルは開けて本文は直せ、何もせず保存すれば 1 バイトも変わらない。
test('手順3 PlantUML の公開版が読めない +package の語順は、版と行を帯で示し、図種はクラス図のまま、無変更保存はバイト一致', async ({ page }) => {
  // 実物 (web/plantuml の src__test__resources__vega__nonreg__group2846__bug.puml) と同じ CRLF・前置きの YAML・末尾のコメント。
  const REAL = [
    '---', 'output: svg', '---', '',
    '@startuml',
    '+package uid as "Hello" <<Frame>> {',
    '  class World',
    '}',
    '@enduml',
    '',
    "/' Issue #2846 - this was the code that had",
    'produced the bug. The output for this',
    "(now corrected code) is in bug.png",
    "'/",
  ].join('\r\n');
  const dir = absDirFor(__filename) + '-2846';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srcDir = path.join(dir, '..', 'migrator-03-2846-src');
  fs.mkdirSync(srcDir, { recursive: true });
  const src = path.join(srcDir, 'group2846-bug.puml');
  fs.writeFileSync(src, REAL);

  await bootWithSaveDir(page, dirFor(__filename) + '-2846');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20000 }),
    page.evaluate(() => { document.getElementById('file-input').click(); }),
  ]);
  await chooser.setFiles(src);
  await expect(page.locator('#editor')).toHaveValue(/\+package uid as "Hello"/, { timeout: 20000 });

  await expect(page.locator('#render-status')).toHaveText('ERROR', { timeout: 20000 });
  const band = page.locator('#render-error-overlay');
  await expect(band).toBeVisible();
  await expect(band).toContainText(/PlantUML \d+\.\d+\.\d+ がこの行を読めません: \d+ 行目/);
  await expect(band).toContainText('`+package uid as "Hello" <<Frame>> {`');
  await expect(band).toContainText('本文は クラス図 として開いています');
  // 図種は本文から読んだクラス図のまま (PlantUML の推測した sequence に引きずられない)。
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-class');
  // 本文の `+` は外さない。
  expect(await page.locator('#editor').inputValue()).toBe(REAL.replace(/\r\n/g, '\n'));

  // 何もせず保存すれば元とバイト一致 (実キー)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  const written = path.join(dir, 'group2846-bug.puml');
  expect(fs.existsSync(written), '保存先に書かれている').toBe(true);
  expect(Buffer.compare(fs.readFileSync(written), fs.readFileSync(src))).toBe(0);

  // 本文は直せる: `+` を外せば PlantUML も読め、帯が消えてクラス図が描ける (直すのは本人。製品は勝手に外さない)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(band).toBeHidden();
});

// BLK-migrator-20260925-1332: smetana の state 図で最初の並行領域が空 (web/plantuml の vega/state/concurrent-empty-first-region) だと、
// 同梱の PlantUML 1.2026.3 自身が描画の途中で落ちる (1.2026.7 からは描けるが、版を上げると sequence / state の SVG の形が変わり
// migrator-04 のホバー枠が 12 件落ちるので上げない)。落ちた帯に「N 行目 `--` の前の並行領域が空です」と原因の行を添え、
// 描けない間もファイルは開けて無変更保存はバイト一致、右パネルの「追加する位置」から空の領域に状態を足せば次の描画で図が出る。
test('手順3 最初の並行領域が空の state 図は、落ちた帯に原因の行を添え、無変更保存はバイト一致、空の領域に状態を足せば描ける', async ({ page }) => {
  // 実物と同じ CRLF・前置きの YAML。
  const REAL = [
    '---', 'output: svg', '---',
    '@startuml', '!pragma layout smetana', 'state Parent {', '  --', '  state A', '  --', '  state B', '}', '@enduml', '',
  ].join('\r\n');
  const dir = absDirFor(__filename) + '-region';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srcDir = path.join(dir, '..', 'migrator-03-region-src');
  fs.mkdirSync(srcDir, { recursive: true });
  const src = path.join(srcDir, 'concurrent-empty-first-region.puml');
  fs.writeFileSync(src, REAL);

  await bootWithSaveDir(page, dirFor(__filename) + '-region');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20000 }),
    page.evaluate(() => { document.getElementById('file-input').click(); }),
  ]);
  await chooser.setFiles(src);
  await expect(page.locator('#editor')).toHaveValue(/state Parent \{/, { timeout: 20000 });

  // 落ちたことと、落ちる原因の行 (7 行目の `--`) を言う。図種は状態図のまま。
  await expect(page.locator('#render-status')).toHaveText('ERROR', { timeout: 20000 });
  const preview = page.locator('#preview-container');
  await expect(preview).toContainText('描画の途中で落ちました');
  await expect(preview).toContainText('7 行目 `--` の前の並行領域が空です');
  await expect(preview).toContainText('その領域に状態を 1 つ置くと描けます');
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
  const crashed = await page.request.post('/render', { data: { text: REAL.replace(/\r\n/g, '\n'), mode: 'local' } });
  expect(crashed.status()).toBe(422);
  const body = await crashed.json();
  expect(body.kind).toBe('plantuml-crash');
  expect(body.causeLine).toBe(7);
  expect(body.error).toMatch(/が描画の途中で落ちました \(java\.lang\.IllegalArgumentException\)。7 行目 `--` の前の並行領域が空です$/);

  // 描けない間も、何もせず保存すれば元とバイト一致 (実キー)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  const written = path.join(dir, 'concurrent-empty-first-region.puml');
  expect(fs.existsSync(written), '保存先に書かれている').toBe(true);
  expect(Buffer.compare(fs.readFileSync(written), fs.readFileSync(src))).toBe(0);

  // 右パネルの追加フォーム: 「追加する位置」に空の領域が並び、そこへ状態を足すと次の描画で図が出る。
  await page.locator('#st-tail-kind').selectOption('state');
  await page.locator('#st-tail-id').fill('Z');
  const where = page.locator('#st-tail-where');
  await expect(where).toBeVisible();
  await expect(where.locator('option[value="region:7"]')).toHaveText(/Parent の空の並行領域 \(7 行目 `--` の前\)/);
  await where.selectOption('region:7');
  await page.locator('#st-tail-add').click();
  await expect(page.locator('#editor')).toHaveValue(/state Parent \{\n  state Z\n  --\n  state A\n  --\n  state B\n\}/, { timeout: 20000 });
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(page.locator('#render-error-overlay')).toBeHidden();
  // 同梱の 1.2026.3 は smetana の並行状態を最初の領域だけ描く (実物の dash-two-regions / dash-three-regions も同じ)。
  // 落ちた絵ではなく、足した状態の入った図が出ることを確かめる。
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll('#preview-svg svg text')).map((t) => (t.textContent || '').trim())), { timeout: 20000 })
    .toEqual(expect.arrayContaining(['Parent', 'Z']));
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#preview-svg svg text')).map((t) => (t.textContent || '').trim()));
  expect(after.some((t) => /An error has occurr?ed|has crashed/.test(t)), '落ちた絵が図として出ている').toBe(false);
});
