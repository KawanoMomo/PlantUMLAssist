// @ts-check
// FEAT-012 / [AC-1]〜[AC-7]
// 選択中の ArrowUp / ArrowDown で、DSL 上の前後のメッセージへ選択を移す。
// 手数の主張はしない ([AC-8]: 本 FEAT 単独では手数の数値を主張しない)。
// スクリーンショットは test-results/ にのみ保存する
// (docs/images は git status --porcelain の保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', '..', 'test-results', 'feat-012');

async function boot(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function setDsl(page, text) {
  await page.evaluate((t) => {
    var ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
    ed.blur();
    document.body.focus();
  }, text);
  await page.waitForTimeout(400);
}

// 図上の選択と同じ形 ({type,id,line}) で、DSL 行番号から message を選択する。
async function selectMessageByLine(page, line) {
  return page.evaluate((l) => {
    var seq = window.MA.modules.plantumlSequence;
    var ed = document.getElementById('editor');
    var parsed = seq.parseSequence(ed.value);
    var r = parsed.relations.filter(function(x) { return x.kind === 'message' && x.line === l; })[0];
    if (!r) return null;
    window.MA.selection.setSelected([{ type: 'message', id: r.id, line: r.line }]);
    return r.id;
  }, line);
}

// 現在の単独選択が指す message の DSL 行番号 (単独 message 選択でなければ null)。
async function selectedLine(page) {
  return page.evaluate(() => {
    var sel = window.MA.selection.getSelected() || [];
    if (sel.length !== 1) return null;
    var seq = window.MA.modules.plantumlSequence;
    var ed = document.getElementById('editor');
    var parsed = seq.parseSequence(ed.value);
    var r = parsed.relations.filter(function(x) { return x.kind === 'message' && x.id === sel[0].id; })[0];
    return r ? r.line : null;
  });
}

async function blurToBody(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.focus();
  });
}

test.describe('FEAT-012: 上下矢印キーで選択を前後のメッセージへ移す', () => {
  test('[AC-1] ArrowDown で次のメッセージ、ArrowUp で前のメッセージが単独選択になる', async ({ page }) => {
    await boot(page);
    // 既定テンプレートの message は 7,8,9,10 行目。
    expect(await selectMessageByLine(page, 8)).toBeTruthy();
    await blurToBody(page);

    await page.keyboard.press('ArrowDown');
    expect(await selectedLine(page)).toBe(9);

    await page.keyboard.press('ArrowDown');
    expect(await selectedLine(page)).toBe(10);

    await page.keyboard.press('ArrowUp');
    expect(await selectedLine(page)).toBe(9);

    await page.keyboard.press('ArrowUp');
    expect(await selectedLine(page)).toBe(8);

    // 常に単独選択であること。
    expect(await page.evaluate(() => window.MA.selection.getSelected().length)).toBe(1);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-arrow-move-selection.png') });
  });

  test('[AC-1] message 以外の行 (note) は飛ばす', async ({ page }) => {
    await boot(page);
    await setDsl(page, [
      '@startuml',
      'participant A',
      'participant B',
      'A -> B : m1',
      'note over A : memo',
      'B -> A : m2',
      '@enduml',
    ].join('\n'));

    expect(await selectMessageByLine(page, 4)).toBeTruthy();
    await blurToBody(page);
    await page.keyboard.press('ArrowDown');
    // note (5行目) を飛ばして 6行目の message へ。
    expect(await selectedLine(page)).toBe(6);

    await page.keyboard.press('ArrowUp');
    expect(await selectedLine(page)).toBe(4);
  });

  test('[AC-2] 端では選択が変化せず、例外を投げず、DSL を書き換えない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);

    const before = await page.locator('#editor').inputValue();

    await selectMessageByLine(page, 7);
    await blurToBody(page);
    await page.keyboard.press('ArrowUp');
    expect(await selectedLine(page)).toBe(7);

    await selectMessageByLine(page, 10);
    await blurToBody(page);
    await page.keyboard.press('ArrowDown');
    expect(await selectedLine(page)).toBe(10);

    expect(await page.locator('#editor').inputValue()).toBe(before);
    expect(errors).toEqual([]);
  });

  test('[AC-3] 選択が0件のときは何もしない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);

    await page.evaluate(() => window.MA.selection.clearSelection());
    await blurToBody(page);
    const before = await page.locator('#editor').inputValue();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => window.MA.selection.getSelected().length)).toBe(0);
    expect(await page.locator('#editor').inputValue()).toBe(before);
    expect(errors).toEqual([]);
  });

  test('[AC-4] 修飾キー付きの ArrowUp / ArrowDown は本経路に入らない', async ({ page }) => {
    await boot(page);
    await selectMessageByLine(page, 8);
    await blurToBody(page);

    for (const mod of ['Control', 'Shift', 'Meta']) {
      await page.keyboard.press(mod + '+ArrowDown');
      expect(await selectedLine(page)).toBe(8);
      await page.keyboard.press(mod + '+ArrowUp');
      expect(await selectedLine(page)).toBe(8);
    }

    // Alt+↑↓ は design 5b で「同じ親の中の兄弟と入れ替える」に割り当てられており、
    // 選択中の要素そのものが動く。本経路 (前後の要素へ選択を移す) に入っていないことは
    // 「選択が別の要素へ移らない」で見る。入れ替えて戻せば行番号も元へ戻る。
    const before = await page.evaluate(() => window.MA.selection.getSelected()[0].id);
    await page.keyboard.press('Alt+ArrowDown');
    expect(await page.evaluate(() => window.MA.selection.getSelected().length)).toBe(1);
    await page.keyboard.press('Alt+ArrowUp');
    expect(await selectedLine(page)).toBe(8);
    expect(await page.evaluate(() => window.MA.selection.getSelected()[0].id)).toBe(before);
  });

  test('[AC-5] DSL エディタの textarea 内でのカーソル移動を奪わない', async ({ page }) => {
    await boot(page);
    await selectMessageByLine(page, 8);

    // editor textarea にフォーカスし、先頭にキャレットを置く。
    await page.locator('#editor').focus();
    await page.evaluate(() => {
      var ed = document.getElementById('editor');
      ed.selectionStart = ed.selectionEnd = 0;
    });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // 選択は本 FEAT で動かない。
    expect(await selectedLine(page)).toBe(8);
    // キャレットは textarea 内で下方向に移動している (= キーを奪っていない)。
    const caret = await page.evaluate(() => document.getElementById('editor').selectionStart);
    expect(caret).toBeGreaterThan(0);
  });

  test('[AC-6] 不可触: Ctrl+Z / Ctrl+Y の history ルーティングとドラッグ外 Escape が不変', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);

    const original = await page.locator('#editor').inputValue();
    await page.evaluate(() => {
      window.MA.history.pushHistory();
      var ed = document.getElementById('editor');
      ed.value = ed.value.replace('Request', 'RequestX');
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(300);
    expect(await page.locator('#editor').inputValue()).toContain('RequestX');

    await blurToBody(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect(await page.locator('#editor').inputValue()).toBe(original);

    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    expect(await page.locator('#editor').inputValue()).toContain('RequestX');

    // ドラッグ中でない Escape は無害 (既存 handler の早期 return)。
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('[AC-6] 不可触: overlay クリックによる単独選択 / Shift 併用の複数選択', async ({ page }) => {
    await boot(page);
    // selection-router の click 経路を、overlay rect を直接 click して確認する。
    const built = await page.evaluate(() => {
      return !!document.querySelector('#overlay-layer rect.selectable');
    });
    test.skip(!built, 'overlay 未構築 (レンダラ未使用) のため click 経路は評価対象外');

    await page.evaluate(() => window.MA.selection.clearSelection());
    await page.locator('#overlay-layer rect.selectable').first().click();
    expect(await page.evaluate(() => window.MA.selection.getSelected().length)).toBe(1);

    const count = await page.locator('#overlay-layer rect.selectable').count();
    if (count > 1) {
      await page.locator('#overlay-layer rect.selectable').nth(1).click({ modifiers: ['Shift'] });
      expect(await page.evaluate(() => window.MA.selection.getSelected().length)).toBeGreaterThan(1);
    }
  });
});
