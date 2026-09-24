// @ts-check
// BLK-human-20260917-0901 — 人間の台本「仕事で使っている手元の .puml を開いて直す」。
//
// ツールバーの英語の「Open」と Ctrl+K にしか入口が無く、開き方が分からなかった。ドロップも無かった。
// 到達条件: 日本語の入口が見える → .puml を 2 枚ドロップ → 2 タブで開く → 直して上書き →
// 元のファイルが (文字コード・改行を保ったまま) 変わる。未対応記法は行で一覧になり、
// 「報告用に複製」は図の中身を含まない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { bootPlain, typeDsl, openFolder } = require('./_scenario');

const DIR = path.join(__dirname, '..', '..', '..', 'test-results', 'human-06-open-local-files');
const A = path.join(DIR, '制御シーケンス.puml');   // UTF-8 BOM + CRLF
const B = path.join(DIR, 'legacy_state.puml');     // Shift_JIS + LF、未対応の行を含む
const A_TEXT = '@startuml\r\nparticipant 機密ECU as Ecu\r\nactor User\r\nUser -> Ecu : 起動要求\r\n@enduml\r\n';
const B_TEXT = '@startuml\nstate 待機\n[*] --> 待機\n待機 --> 秘密動作 : 開始\n$wobble 秘密動作 ~~ zz\n@enduml\n';

async function dropFiles(page, targetSel, files) {
  await page.evaluate(async ({ sel, list }) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], f.name, { type: 'text/plain' });
      // アプリ版 (pywebview) のドロップが持たせる実パスと同じ形
      Object.defineProperty(file, 'pywebviewFullPath', { value: f.path });
      dt.items.add(file);
    }
    const el = document.querySelector(sel);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, { sel: targetSel, list: files });
}

test('人間 手順 6 — 手元の .puml を 2 枚ドロップして 2 タブで開き、直して元のファイルへ上書きする', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(A, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(A_TEXT, 'utf-8')]));
  await bootPlain(page);

  // 入口: タブ列と、起動直後の空の画面に日本語で出る
  // BLK-human-20260923-1600 (design 9a): タブ列の札は外し、入口は上部バーの Import ▾ に移した。
  await expect(page.locator('#btn-import')).toBeVisible();
  await page.locator('#btn-import').click();
  await expect(page.locator('#imp-file')).toBeVisible();
  await expect(page.locator('#imp-clipboard')).toBeVisible();
  await expect(page.locator('#imp-folder')).toBeVisible();
  await expect(page.locator('#import-menu .menu-note')).toContainText('ドラッグ');
  // BLK-builder-20260924-1736-2 (design 9a): 上部バーの右端のメニューは窓の中に収まり、Ctrl+O の札まで読める
  {
    const vw = page.viewportSize().width;
    const menuBox = await page.locator('#import-menu').boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(vw);
    const keyBox = await page.locator('#imp-file .menu-key').boundingBox();
    expect(keyBox.x + keyBox.width).toBeLessThanOrEqual(vw);
  }
  await page.keyboard.press('Escape');
  await page.locator('#btn-import').click();
  await expect(page.locator('#btn-open-file-empty')).toHaveText('ファイルを開く(.puml)');
  await expect(page.locator('#open-empty-hint')).toBeVisible();
  // BLK-builder-20260924-1415-4 (design 7a / 9a): 入口は図の上に重ねず、図のすぐ下に出る
  await expect(page.locator('#preview-svg svg').first()).toBeVisible();
  {
    const svgBox = await page.locator('#preview-svg svg').first().boundingBox();
    const hintBox = await page.locator('#open-empty-hint').boundingBox();
    expect(hintBox.y).toBeGreaterThanOrEqual(svgBox.y + svgBox.height);
  }
  // 📂 一覧 の頭にも出る
  await openFolder(page);
  await expect(page.locator('#folder-open-file')).toBeVisible();
  await page.click('#btn-tab-folder');   // 閉じる

  // Shift_JIS のバイト列はブラウザの TextEncoder では作れないので、server の書き戻しで作る
  fs.writeFileSync(B, '');
  const made = await page.evaluate(async ({ p, t }) => {
    const r = await fetch('/native-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p, text: t, encoding: 'shift_jis', bom: false }) });
    return r.status;
  }, { p: B, t: B_TEXT });
  expect(made).toBe(200);
  const bBytes = fs.readFileSync(B);
  expect(bBytes.includes(Buffer.from('待機', 'utf-8'))).toBe(false); // UTF-8 ではない

  await dropFiles(page, '#editor', [
    { name: path.basename(A), path: A, b64: fs.readFileSync(A).toString('base64') },
    { name: path.basename(B), path: B, b64: bBytes.toString('base64') },
  ]);

  await expect(page.locator('#tab-bar .tab[data-doc-name="制御シーケンス"]')).toHaveCount(1);
  await expect(page.locator('#tab-bar .tab[data-doc-name="legacy_state"]')).toHaveCount(1);
  await expect(page.locator('#open-empty-hint')).toBeHidden();
  // Shift_JIS が化けずに読めている
  await expect(page.locator('#editor')).toHaveValue(/state 待機/);

  // 未対応記法: 行で一覧、報告用の複製は図の中身を含まない
  await expect(page.locator('#unsupported-panel')).toBeVisible();
  await expect(page.locator('#unsupported-list .unsupported-row[data-line="5"]')).toHaveCount(1);
  await page.click('#btn-unsupported-copy');
  await expect(page.locator('#btn-unsupported-copy')).toHaveAttribute('data-copied', '1');
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  if (clip !== null) {
    expect(clip).toContain('L5:');
    for (const secret of ['秘密動作', '待機', 'wobble', 'legacy_state', '開始']) expect(clip).not.toContain(secret);
  }

  // 1 枚目 (UTF-8 BOM + CRLF) を直して上書き → 元のファイルが変わり、BOM と CRLF が残る
  await page.click('#tab-bar .tab[data-doc-name="制御シーケンス"]');
  await expect(page.locator('#editor')).toHaveValue(/機密ECU/);
  await typeDsl(page, '@startuml\nparticipant 機密ECU as Ecu\nactor User\nUser -> Ecu : 起動要求\nEcu --> User : 応答\n@enduml\n');
  await page.evaluate(() => document.getElementById('btn-save').click());
  await expect(page.locator('#status-save-result')).toHaveAttribute('data-source-write', 'ok');
  const after = fs.readFileSync(A);
  expect(after.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF]))).toBe(true);
  const text = after.subarray(3).toString('utf-8');
  expect(text).toContain('Ecu --> User : 応答\r\n');
  expect(text.replace(/\r\n/g, '')).not.toContain('\n');

  // 2 枚目 (Shift_JIS) も上書きで Shift_JIS のまま
  await page.click('#tab-bar .tab[data-doc-name="legacy_state"]');
  await expect(page.locator('#editor')).toHaveValue(/state 待機/);
  await typeDsl(page, B_TEXT.replace('@enduml', 'state 終了\n@enduml'));
  await page.evaluate(() => document.getElementById('btn-save').click());
  await expect(page.locator('#status-save-result')).toHaveAttribute('data-source-write', 'ok');
  const b2 = fs.readFileSync(B);
  expect(b2.length).toBeGreaterThan(bBytes.length);
  expect(b2.includes(Buffer.from('終了', 'utf-8'))).toBe(false);
  const decoded = new TextDecoder('shift_jis').decode(b2);
  expect(decoded).toContain('state 終了\n');
});
