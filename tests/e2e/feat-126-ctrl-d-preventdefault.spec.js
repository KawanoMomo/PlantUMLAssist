// @ts-check
// FEAT-126 / UI-012: Ctrl+D のハンドラで、複製が成立しない経路でも既定動作
// (ブラウザのブックマーク追加) を止める。
// 判定は「DSL が変わらないこと」ではなく (それは FEAT-076 [AC-4] が既に見ている)、
// keydown イベントの defaultPrevented を直接読む。UI-012 の指摘そのものである。
// 🔴 手数の数値は測らない (charter §5 の 3 操作に本機能は含まれない)。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');
const SHOT = path.join(__dirname, '..', '..', 'test-results', 'feat-126');
const LINE = 8; // 既定テンプレートの 8 行目 (System -> DB : Query)
const shot = (page, n) => page.screenshot({ path: path.join(SHOT, n), fullPage: true });
const txt = (page) => page.locator('#editor').inputValue();

async function boot(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(500);
  // アプリのリスナは既に登録済みなので、後から足す本リスナは同フェーズで必ず後に走る。
  // よって e.defaultPrevented はアプリが preventDefault() を呼んだか否かを反映する。
  await page.evaluate(() => {
    window.__feat126 = [];
    document.addEventListener('keydown', function (e) {
      if ((e.key || '').toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
        window.__feat126.push(e.defaultPrevented);
      }
    });
  });
}
async function blur(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.focus();
  });
}
// Ctrl+D を実キー入力で押し、そのイベントの defaultPrevented を返す。
async function ctrlDPrevented(page) {
  await page.evaluate(() => { window.__feat126 = []; });
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(400);
  const rec = await page.evaluate(() => window.__feat126);
  expect(rec.length).toBe(1); // 観測できていないのに true/false を語らない
  return rec[0];
}
async function selectMessage(page, line) {
  return page.evaluate((l) => {
    var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
    var r = p.relations.filter(function (x) { return x.kind === 'message' && x.line === l; })[0];
    if (!r) return null;
    window.MA.selection.setSelected([{ type: 'message', id: r.id, line: r.line }]);
    return r.id;
  }, line);
}

test.describe('FEAT-126: Ctrl+D は複製が成立しない経路でもブラウザ既定を止める', () => {
  // (a) 新しい振る舞いを主張するテスト — 変更前コードでは FAIL する。
  test('[F126-1] 選択 0 件で Ctrl+D を押しても既定動作は止まる', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await page.evaluate(() => window.MA.selection.clearSelection());
    await blur(page);
    await shot(page, 'f126-1-before.png');
    expect(await ctrlDPrevented(page)).toBe(true);
    expect(await txt(page)).toBe(before); // FEAT-076 [AC-4] の非退行も同時に見る
    await shot(page, 'f126-1-after.png');
  });

  // (a) 新しい振る舞いを主張するテスト。
  test('[F126-2] 複数選択で Ctrl+D を押しても既定動作は止まる', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await page.evaluate(() => {
      var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
      var m = p.relations.filter(function (x) { return x.kind === 'message'; });
      window.MA.selection.setSelected([
        { type: 'message', id: m[0].id, line: m[0].line },
        { type: 'message', id: m[1].id, line: m[1].line }]);
    });
    await blur(page);
    expect(await ctrlDPrevented(page)).toBe(true);
    expect(await txt(page)).toBe(before);
  });

  // (a) 新しい振る舞いを主張するテスト。
  test('[F126-3] message 以外 (participant) の選択で Ctrl+D を押しても既定動作は止まる', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await page.evaluate(() => {
      var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
      window.MA.selection.setSelected([{ type: 'participant', id: p.elements[0].id, line: p.elements[0].line }]);
    });
    await blur(page);
    expect(await ctrlDPrevented(page)).toBe(true);
    expect(await txt(page)).toBe(before);
  });

  // (b) 回帰ガード — 変更前も PASS する。複製が成立する経路は従来どおり止まる。
  test('[F126-4] (回帰ガード) 単独 message 選択では従来どおり既定動作が止まり、複製される', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    expect(await selectMessage(page, LINE)).toBeTruthy();
    await blur(page);
    expect(await ctrlDPrevented(page)).toBe(true);
    const after = await txt(page);
    expect(after.split('\n').length).toBe(before.split('\n').length + 1);
  });

  // (b) 回帰ガード — FEAT-076 [AC-3]。引き受けていない経路は既定を通したままであること。
  test('[F126-5] (回帰ガード) DSL エディタにフォーカスがある間は既定動作を止めない', async ({ page }) => {
    await boot(page);
    await selectMessage(page, LINE);
    await page.locator('#editor').focus();
    expect(await ctrlDPrevented(page)).toBe(false);
  });

  // (b) 回帰ガード — FEAT-076 [AC-5]。modal 表示中も引き受けていない。
  test('[F126-6] (回帰ガード) 挿入 modal 表示中は既定動作を止めない', async ({ page }) => {
    await boot(page);
    await selectMessage(page, LINE);
    await blur(page);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');
    await blur(page);
    expect(await ctrlDPrevented(page)).toBe(false);
    await shot(page, 'f126-6-modal-open.png');
  });
});
