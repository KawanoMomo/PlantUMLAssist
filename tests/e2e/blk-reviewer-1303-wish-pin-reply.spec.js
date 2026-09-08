// @ts-check
// BLK-reviewer-20260908-1303-wish: 指摘に「直す側の応答」を返す。
// 指摘が一方通行だと reviewer は次の run でまた同じ全件を確かめ直す。
// primary が「対応した / 保留 (理由) / 直さない (理由)」を図に書き戻せて、
// reviewer 側が「裏取りだけでよい件」と「応答なしの件」に分けて見られる、を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, saveDirFor } = require('./helpers');

const DSL = [
  '@startuml',
  'title Timer state',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Timer_Ack',
  '@enduml',
].join('\n');

const DIR = saveDirFor(__filename);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-tools-folded', '0');
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
});

async function setDsl(page, text) {
  await page.evaluate((t) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(2000);
}

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(1200);
  await setDsl(page, DSL);
}

async function pinLine(page, line, text) {
  await page.evaluate((n) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    var start = ed.value.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
    ed.focus();
    ed.selectionStart = start;
    ed.selectionEnd = start;
  }, line);
  // 📌 は押すたびに開閉するので、閉じているときだけ押す (2 件目を打てなくなる)。
  if (!(await page.locator('#pin-panel.open').count())) {
    await page.locator('#btn-tab-pins').click();
  }
  await page.locator('#pin-text').fill(text);
  await page.locator('#pin-add').click();
  await page.waitForTimeout(1200);
}

function replyBox(page, id) {
  return page.locator('.pin-reply[data-pin-id="' + id + '"]');
}

test('応答が無いうちは「全部を確かめ直す」と出る', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
  await expect(page.locator('#pin-reply-head')).toHaveText('応答なし 1 件 (全部を確かめ直す)');
});

test('「対応した」を返すと図に残り、裏取りだけでよい件になる', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
  const before = await getEditorText(page);

  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('done');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(900);

  const dsl = await getEditorText(page);
  expect(dsl).toContain("' @reply 1|done|");
  // 図そのものは変わらない (応答はコメント行)。
  expect(dsl.split('\n').filter((l) => l.trim().indexOf("' @reply") !== 0).join('\n')).toBe(before);
  await expect(page.locator('#pin-reply-head')).toHaveText('裏取り 1 ・ 保留/直さない 0 ・ 応答なし 0');
  await expect(replyBox(page, '1').locator('.pin-reply-now')).toContainText('対応した');
});

test('理由の無い保留は書かせない', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
  const before = await getEditorText(page);

  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('held');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(600);

  await expect(replyBox(page, '1').locator('.pin-reply-err'))
    .toHaveText('保留には理由が要ります (いつ・何待ちか)');
  expect(await getEditorText(page)).toBe(before);
});

test('理由を書けば保留を返せて、理由がそのまま残る', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');

  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('held');
  await replyBox(page, '1').locator('.pin-reply-text').fill('SVG の作り直しは提出直前にまとめて行う');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(900);

  await expect(replyBox(page, '1').locator('.pin-reply-now'))
    .toContainText('保留');
  await expect(replyBox(page, '1').locator('.pin-reply-now'))
    .toContainText('SVG の作り直しは提出直前にまとめて行う');
  await expect(page.locator('#pin-reply-head')).toHaveText('裏取り 0 ・ 保留/直さない 1 ・ 応答なし 0');
});

test('2 件の指摘に別々の応答が付き、取り違えない', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
  await pinLine(page, 5, 'Timer_Ack の SVG が古い');

  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('done');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(800);
  await replyBox(page, '2').locator('.pin-reply-verdict').selectOption('wontfix');
  await replyBox(page, '2').locator('.pin-reply-text').fill('この図の Ack は仕様どおり');
  await replyBox(page, '2').locator('.pin-reply-add').click();
  await page.waitForTimeout(800);

  await expect(replyBox(page, '1')).toHaveAttribute('data-verdict', 'done');
  await expect(replyBox(page, '2')).toHaveAttribute('data-verdict', 'wontfix');
  await expect(page.locator('#pin-reply-head')).toHaveText('裏取り 1 ・ 保留/直さない 1 ・ 応答なし 0');
});

test('応答は取り消して書き直せる', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');

  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('done');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(800);
  await replyBox(page, '1').locator('.pin-reply-del').click();
  await page.waitForTimeout(800);

  await expect(replyBox(page, '1').locator('.pin-reply-now')).toHaveCount(0);
  await expect(page.locator('#pin-reply-head')).toHaveText('応答なし 1 件 (全部を確かめ直す)');
  expect(await getEditorText(page)).not.toContain("' @reply");
});

test('指摘を消すと、その応答も残らない', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('done');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(800);

  await page.locator('.pin-del[data-pin-id="1"]').click();
  await page.waitForTimeout(800);
  const dsl = await getEditorText(page);
  expect(dsl).not.toContain("' @reply");
  expect(dsl).not.toContain("' @pin");
});

test('📮 指摘箱でも、応答の有無が指摘ごとに並ぶ', async ({ page }) => {
  await openState(page);
  await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
  await pinLine(page, 5, 'Timer_Ack の SVG が古い');
  await replyBox(page, '1').locator('.pin-reply-verdict').selectOption('done');
  await replyBox(page, '1').locator('.pin-reply-add').click();
  await page.waitForTimeout(1200);

  await page.locator('#btn-tab-inbox').click();
  await page.waitForTimeout(2500);
  await expect(page.locator('.ib-row[data-pin-id="1"] .ib-reply')).toContainText('対応した');
  await expect(page.locator('.ib-row[data-pin-id="2"] .ib-reply')).toHaveText('↩ 応答なし');
});
