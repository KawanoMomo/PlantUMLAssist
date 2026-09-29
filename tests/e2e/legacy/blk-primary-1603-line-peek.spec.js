const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// BLK-primary-20260908-1603: 遷移ラベルを実在メッセージ名に直すとき、
// 書き換えそのものより「どの矢印が DSL の何行目か」を SVG 上で目で探す段階が手間だった。
// rect は data-line を持つのに、選ぶまで表示上の手掛かりが無かった。
// DSL のキャレット行・行番号にマウスが乗った行に対応する図形を薄く光らせる (peek)。

const DSL = [
  '@startuml',
  'title DMA 転送',
  '[*] --> Idle',
  'Idle --> Configuring : Dma_Configure',
  'Configuring --> Transferring_Active : Dma_Start',
  'Transferring_Active --> Idle : Dma_Complete',
  '@enduml',
].join('\n');

// キャレットを N 行目の行頭に置く (先輩が DSL を読みながら行を追う動き)。
async function caretToLine(page, line) {
  await page.evaluate((n) => {
    var ed = document.getElementById('editor');
    var pos = ed.value.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
    ed.focus();
    ed.selectionStart = ed.selectionEnd = pos;
    ed.dispatchEvent(new Event('click', { bubbles: true }));
  }, line);
  await page.waitForTimeout(200);
}

async function peekedLines(page) {
  return page.evaluate(() => {
    var rects = document.querySelectorAll('#overlay-layer rect.peek');
    var out = [];
    Array.prototype.forEach.call(rects, function(r) { out.push(r.getAttribute('data-line')); });
    return out;
  });
}

test.describe('BLK-primary-20260908-1603: 選ぶ前に DSL 行と図形の対応を見せる', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate((text) => {
      var ed = document.getElementById('editor');
      ed.value = text;
      ed.dispatchEvent(new Event('input'));
    }, DSL);
    await page.waitForTimeout(1500);
    await page.waitForSelector('#overlay-layer rect[data-line]');
  });

  test('行番号は data-line 付きの取っ手になっている', async ({ page }) => {
    const gutter = page.locator('#line-numbers .ln');
    await expect(gutter).toHaveCount(DSL.split('\n').length);
    await expect(page.locator('#line-numbers .ln[data-line="4"]')).toHaveText('4');
  });

  test('キャレットを遷移の行に置くとその図形だけが光る', async ({ page }) => {
    await caretToLine(page, 4);
    let lines = await peekedLines(page);
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines)).toEqual(new Set(['4']));

    // 行を移すと前の行の peek は残らない
    await caretToLine(page, 6);
    lines = await peekedLines(page);
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines)).toEqual(new Set(['6']));
  });

  // 題 (title) は図の上の見出しとして枠を持つようになった (光るのは題そのもの)。図形を持たない行は @startuml で見る
  // (BLK-releaser-20260929-0851-2 で今の画面に合わせた)。
  test('対応する図形が無い行 (@startuml) では何も光らない', async ({ page }) => {
    await caretToLine(page, 2);
    expect(new Set(await peekedLines(page))).toEqual(new Set(['2']));
    await caretToLine(page, 1);
    expect(await peekedLines(page)).toEqual([]);
    await expect(page.locator('#line-numbers .ln.ln-peek')).toHaveCount(0);
  });

  test('行番号にマウスを乗せるだけで対応する図形が光る (クリック不要)', async ({ page }) => {
    await page.locator('#line-numbers .ln[data-line="5"]').hover();
    await page.waitForTimeout(200);
    const lines = await peekedLines(page);
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines)).toEqual(new Set(['5']));
    // 当たった行は行番号の側も光り、「探し当てた」ことが手元で分かる
    await expect(page.locator('#line-numbers .ln.ln-peek')).toHaveText('5');
    // 選択はしていない = まだ何も選ばずに対応だけ見えている
    await expect(page.locator('#overlay-layer rect.selected')).toHaveCount(0);
  });

  test('ガターからマウスを外すとキャレット行の対応に戻る', async ({ page }) => {
    await caretToLine(page, 4);
    await page.locator('#line-numbers .ln[data-line="6"]').hover();
    await page.waitForTimeout(200);
    expect(new Set(await peekedLines(page))).toEqual(new Set(['6']));
    await page.mouse.move(5, 5);
    await page.locator('#line-numbers').dispatchEvent('mouseleave');
    await page.waitForTimeout(200);
    expect(new Set(await peekedLines(page))).toEqual(new Set(['4']));
  });

  test('peek は選択を壊さない — 選んだ図形は選ばれたまま', async ({ page }) => {
    // 遷移は線の枠・ラベル・矢じりの複数枚で当たる。見えているラベルを押す
    await page.locator('#overlay-layer rect[data-line="4"][data-hit-kind="linklabel"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#overlay-layer rect.selected').first()).toBeVisible();
    await page.locator('#line-numbers .ln[data-line="6"]').hover();
    await page.waitForTimeout(200);
    // 6 行目が光っても 4 行目の選択は残る
    expect(new Set(await peekedLines(page))).toEqual(new Set(['6']));
    const stillSelected = await page.evaluate(() =>
      document.querySelector('#overlay-layer rect.selected').getAttribute('data-line'));
    expect(stillSelected).toBe('4');
  });

  test('再描画しても対応表示は残る', async ({ page }) => {
    await caretToLine(page, 4);
    expect(new Set(await peekedLines(page))).toEqual(new Set(['4']));
    // DSL を打ち直す (図が作り直される)
    await page.evaluate(() => {
      var ed = document.getElementById('editor');
      ed.value = ed.value.replace('Dma_Complete', 'Dma_Done');
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(1500);
    await caretToLine(page, 4);
    expect(new Set(await peekedLines(page))).toEqual(new Set(['4']));
  });
});
