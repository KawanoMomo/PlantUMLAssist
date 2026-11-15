// @ts-check
// migrator 台本 手順 5「無変更保存」— 他ツールの .puml を開き、何も変えずに保存先へ
// 保存すると、元のファイルとバイト単位で一致する。
//
// 保存フォルダにクラス図があっても、開いただけの図の保存は止まらず、そのまま書かれる。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { bootWithSaveDir, dirFor, absDirFor, openFolderItem, typeDsl } = require('./_scenario');

// 保存フォルダに置くクラス図 (メッセージ文が呼び出しに見える図と同居させる)。
const CLASS_DOC = [
  '@startuml',
  'class EdgeCache {',
  '  +Reset(): void',
  '}',
  '@enduml',
  '',
].join('\n');

// 開く側。他人が書いたシーケンス図で、メッセージ文が `Cls.Method()` に見える行を持つ。
// 行末空白・タブ・コメント・CRLF を混ぜ、バイト一致の判定を甘くしない。
const FOREIGN = [
  '@startuml Figure 5',
  '',
  "' https://example.invalid/blog/versioning",
  'participant "Edge" as edge',
  'participant "EdgeCache" as cache',
  '\tedge -> cache: EnableClock(id)   ',
  'edge -> edge: cache version mappings',
  '',
  '@enduml',
  '',
].join('\r\n');

test('migrator 手順 5 — 保存フォルダにクラス図があっても、開いて何もせず保存した図は元とバイト単位で一致する', async ({ page }) => {
  const dir = absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'driver_common_class.puml'), CLASS_DOC);

  // 開く元は保存先の外に置く (台本の「他ツールの .puml を持ち込む」と同じ位置関係)。
  const srcDir = path.join(dir, '..', 'migrator-05-src');
  fs.mkdirSync(srcDir, { recursive: true });
  const src = path.join(srcDir, 'foreign-figure-5.puml');
  fs.writeFileSync(src, FOREIGN);

  await bootWithSaveDir(page, dirFor(__filename));

  // 保存フォルダの中身は、1 回保存するまで読まれない。台本でも 1 枚目の後に効いてくる
  // 順番なので、ここでも先に 1 枚保存して突合の相手を読ませる。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });

  // 📄 ファイルを開く
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20000 }),
    page.evaluate(() => { document.getElementById('file-input').click(); }),
  ]);
  await chooser.setFiles(src);
  await expect(page.locator('#editor')).toHaveValue(/EnableClock/, { timeout: 20000 });

  // 何も変えずに保存する (実キー)。
  // 下端の「保存しました」は 1 枚目の保存の分が残っているので、それでは 2 回目の保存を待てない
  // (全体実行の負荷で、書き終わる前にファイルを見て赤になっていた)。この図の名前が出るまで待つ。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('foreign-figure-5', { timeout: 20000 });
  await expect(page.locator('#status-save-result')).toContainText('保存しました');

  // 保存は監査で止めない (保存前の突合は整理で外した)。書かれていれば止まっていない。
  const written = path.join(dir, 'foreign-figure-5.puml');
  await expect.poll(() => fs.existsSync(written), { message: '保存先に書かれている', timeout: 10000 }).toBe(true);
  expect(Buffer.compare(fs.readFileSync(written), fs.readFileSync(src))).toBe(0);
});

// BLK-human-20260925-1250: 保存先の一覧から開いた LF の .puml を 1 行直して保存すると、
// 全行が CRLF で書き直されていた (一覧から開いた図は開いたときの改行を持たず、server が
// Windows の既定の改行で書いていた)。上書きする相手の改行を引き継ぎ、直した行だけが変わる。
test('migrator 手順 5 — 保存先の一覧から開いた LF の図を 1 行直して保存しても LF のまま、直した行だけが変わる', async ({ page }) => {
  const dir = absDirFor(__filename) + '-list-lf';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ORIG = ['@startuml', "' memo", 'class Same', 'class Other', '@enduml', ''].join('\n');
  const file = path.join(dir, 'Same_Class.puml');
  fs.writeFileSync(file, ORIG);

  await bootWithSaveDir(page, dirFor(__filename) + '-list-lf');
  await openFolderItem(page, 'Same_Class');
  await expect(page.locator('#editor')).toHaveValue(/class Other/, { timeout: 20000 });

  // 2 行目 (コメント) の行末に 1 文字足す (実キー)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type('2');
  await page.waitForTimeout(600);
  // 一覧から開いたファイルを直しても、上書きしてよいかは聞かれない。
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });

  const want = ORIG.replace("' memo", "' memo2");
  await expect.poll(() => fs.readFileSync(file, 'utf8'), { timeout: 10000 }).toBe(want);
  expect(fs.readFileSync(file).includes(Buffer.from('\r')), 'CRLF に書き直さない').toBe(false);
});

// BLK-builder-20260925-2010-1 (data-loss): 右パネルのステレオタイプ欄に無いステレオタイプ (<<history*>> / <<end>> …) の
// 状態を選んでラベルを直し「更新」を押すと、欄が (none) に見えていたためステレオタイプが消え、深い履歴や名前付き終了が
// ふつうの状態の箱に変わっていた。直したラベル以外は書かれたままの字で残り、保存しても直した行以外は変わらない。
test('migrator 手順 5 — 欄に無いステレオタイプの状態を図で選んでラベルを直しても、ステレオタイプは消えない', async ({ page }) => {
  const ORIG = [
    '@startuml',
    'state Comp {',
    '  state A',
    '  state H2 <<history*>>',
    '  state E1 <<end>>',
    '  A --> H2',
    '  A --> E1',
    '}',
    '@enduml',
  ].join('\n');
  await bootWithSaveDir(page, dirFor(__filename) + '-stereo');
  await typeDsl(page, ORIG);

  const relabel = async (id, label) => {
    const r = page.locator('#overlay-layer rect.selectable[data-type="state"][data-id="' + id + '"]');
    await expect(r).toHaveCount(1, { timeout: 20000 });
    const b = await r.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.locator('#st-id')).toBeVisible({ timeout: 10000 });
    // 欄は (none) ではなく、書かれた字を選んだ形で出る。
    await expect(page.locator('#st-stereo')).not.toHaveValue('');
    await page.locator('#st-label').fill(label);
    await page.locator('#st-update').click();
    await page.waitForTimeout(800);
  };
  await relabel('Comp.H2', 'Resume');
  await relabel('Comp.E1', 'Done');

  const want = ORIG.replace('state H2 <<', 'state "Resume" as H2 <<').replace('state E1 <<', 'state "Done" as E1 <<');
  await expect.poll(() => page.locator('#editor').inputValue(), { timeout: 10000 }).toBe(want);
});
