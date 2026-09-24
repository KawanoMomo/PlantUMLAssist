// @ts-check
// BLK-human-20260915-1205 — 人間の台本 手順 2「途中から参加者を足す」。
//
// 図を作っている途中で actor / participant / database を足すと、宣言行が DSL の
// 最後 (メッセージの後ろ) に入っていた。動きはするが DSL が読めず、左右の並びも
// 意図どおりにならない。到達条件は「宣言が最初のメッセージより前に入り、図の
// 左右順が宣言順になる」こと。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// メッセージが 3 本ある、作りかけの図。
const THREE_MESSAGES = [
  '@startuml',
  'title 受付の流れ',
  'actor User',
  'participant Front',
  '',
  'User -> Front : 申し込む',
  'Front -> Front : 内容を確かめる',
  'Front --> User : 受付番号',
  '@enduml',
].join('\n');

async function setDsl(page, dsl) {
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(600);
}

// 描かれた SVG から、参加者の箱を左から順に読む。PlantUML は参加者名を
// `<text>` で描くので、対象の名前を持つものだけを x 順に並べる。
async function participantOrder(page, names) {
  return page.evaluate((wanted) => {
    var svg = document.querySelector('#preview-svg svg');
    if (!svg) return [];
    var found = {};
    var texts = svg.querySelectorAll('text');
    for (var i = 0; i < texts.length; i++) {
      var label = (texts[i].textContent || '').trim();
      if (wanted.indexOf(label) < 0) continue;
      var box = texts[i].getBBox ? texts[i].getBBox() : null;
      var x = box ? box.x : Number(texts[i].getAttribute('x') || 0);
      // 同じ名前は上下 2 箇所 (頭と足) に描かれる。左端が同じなので最初の 1 つでよい。
      if (found[label] === undefined) found[label] = x;
    }
    return Object.keys(found).sort(function(a, b) { return found[a] - found[b]; });
  }, names);
}

test.describe('人間 手順 2 — 途中から足した参加者の宣言が上に揃う', () => {
  test('メッセージ 3 本の図に database を足すと、宣言は最初のメッセージより前に入る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, THREE_MESSAGES);

    // 末尾に追加の「参加者」から database DB を足す。
    await page.locator('#seq-tail-kind-chip-participant').click();
    await page.locator('#seq-tail-ptype').selectOption('database');
    await page.locator('#seq-tail-alias').fill('DB');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(800);

    const dsl = await getEditorText(page);
    const lines = dsl.split('\n');
    const declIdx = lines.findIndex((l) => /^\s*database\s+DB\b/.test(l));
    const firstMsgIdx = lines.findIndex((l) => l.includes('User -> Front'));
    const lastMsgIdx = lines.findIndex((l) => l.includes('Front --> User'));

    expect(declIdx).toBeGreaterThan(-1);
    // 到達条件 1: 宣言が最初のメッセージより前にある (末尾ではない)。
    expect(declIdx).toBeLessThan(firstMsgIdx);
    expect(declIdx).toBeLessThan(lastMsgIdx);
    // 既存の宣言の後ろ、`title` は跨がない。
    expect(declIdx).toBeGreaterThan(lines.findIndex((l) => /^\s*participant\s+Front\b/.test(l)));
    expect(lines[1]).toContain('title');

    // 到達条件 2: 図の左右順が宣言順 (User → Front → DB) になる。
    await expect(page.locator('#preview-svg svg')).toHaveCount(1);
    const order = await participantOrder(page, ['User', 'Front', 'DB']);
    expect(order).toEqual(['User', 'Front', 'DB']);
  });

  test('宣言が 1 つも無い図では、最初のメッセージの直前に欄ができる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, ['@startuml', 'A -> B : req', 'B --> A : res', '@enduml'].join('\n'));

    await page.locator('#seq-tail-kind-chip-participant').click();
    await page.locator('#seq-tail-ptype').selectOption('actor');
    await page.locator('#seq-tail-alias').fill('Ope');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(800);

    const lines = (await getEditorText(page)).split('\n');
    expect(lines[0]).toContain('@startuml');
    expect(lines[1]).toMatch(/^\s*actor\s+Ope\b/);
    expect(lines[2]).toContain('A -> B : req');
  });

  test('続けて 2 人足しても、宣言は欄の中で足した順に並ぶ', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, THREE_MESSAGES);

    for (const [ptype, alias] of [['database', 'DB'], ['queue', 'MQ']]) {
      await page.locator('#seq-tail-kind-chip-participant').click();
      await page.locator('#seq-tail-ptype').selectOption(ptype);
      await page.locator('#seq-tail-alias').fill(alias);
      await page.locator('#seq-tail-add').click();
      await page.waitForTimeout(700);
    }

    const lines = (await getEditorText(page)).split('\n');
    const idx = (re) => lines.findIndex((l) => re.test(l));
    const user = idx(/^\s*actor\s+User\b/);
    const front = idx(/^\s*participant\s+Front\b/);
    const db = idx(/^\s*database\s+DB\b/);
    const mq = idx(/^\s*queue\s+MQ\b/);
    const firstMsg = lines.findIndex((l) => l.includes('User -> Front'));

    expect(user).toBeLessThan(front);
    expect(front).toBeLessThan(db);
    expect(db).toBeLessThan(mq);
    expect(mq).toBeLessThan(firstMsg);

    await expect(page.locator('#preview-svg svg')).toHaveCount(1);
    const order = await participantOrder(page, ['User', 'Front', 'DB', 'MQ']);
    expect(order).toEqual(['User', 'Front', 'DB', 'MQ']);
  });
});
