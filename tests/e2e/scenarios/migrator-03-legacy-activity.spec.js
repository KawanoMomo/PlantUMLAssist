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
  // BLK-human-20260925-1500: 同梱・取得の既定を 1.2026.8 に上げ、その図は PlantUML 自身が描けるようになった
  // (今の既定の版が落ちる図は見つかっていない)。画面の見え方は、描画の応答に 1.2026.3 の落ちた絵が返ってきた
  // 場合 (古い jar を選んでいる利用者) を差し替えで作って確かめる。server の見分けは同じ絵を直接通して確かめる。
  const crashDsl = read('smetana-empty-first-region-crash.puml');
  const crash3 = path.join(FIX, 'svg', 'plantuml-crash-1.2026.3.svg');
  const judged3 = JSON.parse(execFileSync('python', ['-c',
    'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
    + 'print(json.dumps(server.detect_render_error(open(sys.argv[2], "rb").read())))', root, crash3],
  { encoding: 'utf8' }));
  expect(judged3.crashed).toBe(true);
  expect(judged3.message).toContain('PlantUML 1.2026.3 が描画の途中で落ちました');
  const drawnNow = await page.request.post('/render', { data: { text: crashDsl, mode: 'local' } });
  expect(drawnNow.status(), '今の既定の PlantUML はこの図を描ける').toBe(200);
  await setDsl(read('svg-sprite-style-min.puml'));
  await expect.poll(previewTexts, { timeout: 20000 }).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  await page.route('**/render', async (route) => {
    const body = route.request().postDataJSON() || {};
    if (String(body.text || '').indexOf('!pragma layout smetana') < 0) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(crash3, 'utf8') });
  });
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
// PlantUML 1.2026.3 自身が描画の途中で落ちていた (落ちた帯に「N 行目 `--` の前の並行領域が空です」と原因の行を添える)。
// BLK-human-20260925-1500: 同梱・取得の既定を 1.2026.8 に上げた。1.2026.3〜.6 は並行領域を持つ複合状態で最初の領域しか
// 描かず、残りの領域が黙って消えていた。今の既定ではこの実物がそのまま描け、全部の領域 (A と B) が図に出る。
// ファイルは無変更保存でバイト一致、右パネルの「追加する位置」から空の領域に状態を足せる。
test('手順3 最初の並行領域が空の state 図も全部の領域が描け、無変更保存はバイト一致、空の領域に状態を足せる', async ({ page }) => {
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

  // 落ちずに描け、2 つ目の領域 (B) も消えずに図に出る。図種は状態図のまま。
  const texts = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#preview-svg svg text')).map((t) => (t.textContent || '').trim()));
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(page.locator('#render-error-overlay')).toBeHidden();
  await expect.poll(texts, { timeout: 20000 }).toEqual(expect.arrayContaining(['Parent', 'A', 'B']));
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
  const drawn = await page.request.post('/render', { data: { text: REAL.replace(/\r\n/g, '\n'), mode: 'local' } });
  expect(drawn.status()).toBe(200);

  // 何もせず保存すれば元とバイト一致 (実キー)。
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
  // 足した状態も、前からある 2 つの領域の状態も全部図に出る。
  await expect.poll(texts, { timeout: 20000 }).toEqual(expect.arrayContaining(['Parent', 'Z', 'A', 'B']));
  const after = await texts();
  expect(after.some((t) => /An error has occurr?ed|has crashed/.test(t)), '落ちた絵が図として出ている').toBe(false);
});

// BLK-migrator-20260925-1600: 「この図種として読めない行」の帯が、行ごとの正規表現で正しい PlantUML にも出ていた
// (`|||`、skinparam { } の本文、SVG スプライトの本文、半矢印 `-\` `-/`。migrator の実物 217 枚中 117 枚)。
// 帯はエンジンが読めたかで決める: PlantUML が図を返した本文には出さず、出すときは理由 (エンジンのエラー行・閉じない枠) を書く。
test('手順3 正しい PlantUML には「読めない行」の帯が出ず、エンジンが読めない行・閉じない枠には理由つきで出る', async ({ page }) => {
  const OK = [
    '@startuml', 'skinparam sequence {', '  ArrowColor DeepSkyBlue', '  LifeLineBorderColor blue', '}',
    'sprite $ok <svg viewBox="0 0 10 10">', '<circle cx="5" cy="5" r="4" fill="green"/>', '</svg>',
    'participant A', 'participant B', 'A -\ B : half', '|||', 'B -/ A : back <$ok>', '@enduml', '',
  ].join('\n');
  // migrator の corpus/dirty-06-unmatched-block-broken と同じ形: alt に end が無い (PlantUML は図の終わりで閉じたものとして描く)。
  const UNCLOSED = ['@startuml', 'participant App', 'participant Drv', 'App -> Drv : Read()', 'alt 正常',
    '  Drv --> App : value', 'else 異常', '  Drv --> App : error', 'App -> Drv : Close()', '@enduml', ''].join('\n');
  const BAD = ['@startuml', 'participant A', 'A -> B : x', '$wobble B ~~ zz', '@enduml', ''].join('\n');
  const dir = absDirFor(__filename) + '-banner';
  fs.rmSync(dir, { recursive: true, force: true });
  const srcDir = path.join(dir, '..', 'migrator-03-banner-src');
  fs.mkdirSync(srcDir, { recursive: true });
  const files = [['ok-seq.puml', OK], ['unclosed-alt.puml', UNCLOSED], ['engine-bad.puml', BAD]].map(([n, t]) => {
    const p = path.join(srcDir, n);
    fs.writeFileSync(p, t);
    return p;
  });

  await bootWithSaveDir(page, dirFor(__filename) + '-banner');
  const openOne = async (p, re) => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 20000 }),
      page.evaluate(() => { document.getElementById('file-input').click(); }),
    ]);
    await chooser.setFiles(p);
    await expect(page.locator('#editor')).toHaveValue(re, { timeout: 20000 });
  };
  const panel = page.locator('#unsupported-panel');

  // 正しい図: PlantUML が描けたので帯は出ない (以前は 3・4・6・7・8・11・12・13 行目の 8 行が並んでいた)。
  await openOne(files[0], /skinparam sequence \{/);
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(panel).toBeHidden();
  await expect(panel).toHaveAttribute('data-count', '0');

  // end の無い alt: エンジンは描くが図の終わりまで枠に入れてしまうので、開いた行と理由を出す。
  await openOne(files[1], /alt 正常/);
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(panel).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#unsupported-list .unsupported-row')).toHaveCount(1);
  const row = page.locator('#unsupported-list .unsupported-row[data-line="5"]');
  await expect(row).toHaveAttribute('data-reason', /5 行目の alt を閉じる end がありません/);
  await expect(page.locator('#unsupported-summary')).toContainText('alt を閉じる end がありません');

  // エンジンが読めない行: その行だけを「エンジンのエラー 行 N: …」で出す (推定の行は並べない)。
  await openOne(files[2], /\$wobble/);
  await expect(page.locator('#render-status')).toHaveText('ERROR', { timeout: 20000 });
  await expect(panel).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#unsupported-list .unsupported-row')).toHaveCount(1);
  await expect(page.locator('#unsupported-list .unsupported-row[data-line="4"]')).toHaveAttribute('data-reason', /^エンジンのエラー 行 4: /);
  await expect(page.locator('#unsupported-summary')).toContainText('エンジンのエラー 行 4');

  // 直せば (読めない行を消せば) 次の描画で帯が消える。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  await expect(page.locator('#render-status')).toHaveText(/^Rendered/, { timeout: 20000 });
  await expect(panel).toBeHidden({ timeout: 20000 });
});
