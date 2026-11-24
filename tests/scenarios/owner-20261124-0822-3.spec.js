// @ts-check
// TICKET-owner-20261124-0822-3: 表示名を書いていない要素 (`component Bus`・`actor User`・`state Idle`) の「名前 (id)」を
// 変えて「変更を反映」を押すと、宣言の行が `component "Bus" as Bus2` のように前の名前を表示名にした形へ書き換わり、
// 図は前の名前のまま描かれていた。
// 期待 (principles.md「直した行でも名指ししない字は元のまま」「同じ操作は 6 図種で同じ」「描ける」):
//   - 既定の画面・実マウスで 名前 (id) だけを替えて「変更を反映」1 回で、宣言の行は名前の字だけが替わる (`component Bus2`)
//   - 差分は宣言の行と参照の行だけ。ほかの行は 1 バイトも動かない
//   - 図は新しい名前で描かれ、前の名前の字は図に残らない
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const CASES = [
  {
    kind: 'component', type: 'component', oldId: 'Bus', newId: 'Bus2', idField: '#co-edit-id', apply: '#co-edit-apply',
    text: ['@startuml', 'component Bus', 'component Ctl', 'Bus --> Ctl : data', '@enduml', ''],
    words: ['Bus', 'Ctl', 'data'], decl: 2, declAfter: 'component Bus2', changed: { 4: 'Bus2 --> Ctl : data' },
  },
  {
    kind: 'usecase', type: 'actor', oldId: 'User', newId: 'User2', idField: '#uc-edit-id', apply: '#uc-edit-apply',
    text: ['@startuml', 'actor User', 'usecase "Login" as UC1', 'User --> UC1', '@enduml', ''],
    words: ['User', 'Login'], decl: 2, declAfter: 'actor User2', changed: { 4: 'User2 --> UC1' },
  },
  {
    kind: 'state', type: 'state', oldId: 'Idle', newId: 'Idle2', idField: '#st-id', apply: '#st-update',
    text: ['@startuml', 'state Idle', 'state Run', '[*] --> Idle', 'Idle --> Run : go', '@enduml', ''],
    words: ['Idle', 'Run', 'go'], decl: 2, declAfter: 'state Idle2', changed: { 4: '[*] --> Idle2', 5: 'Idle2 --> Run : go' },
  },
];

function hit(page, type, id) {
  return page.locator('#overlay-layer [data-type="' + type + '"][data-id="' + id + '"]').first();
}

async function svgWords(page) {
  return (await H.svgText(page)).split('\n').map((s) => s.trim()).filter(Boolean);
}

for (const c of CASES) {
  test('owner 0822-3 ' + c.kind + ': 表示名の無い宣言の改名は名前の字だけを替え、図も新しい名前で描く', async ({ page }, testInfo) => {
    test.setTimeout(120 * 1000);
    const before = c.text.join('\n');
    await H.bootWith(page, before);
    await H.waitDrawn(page, c.words);
    const target = hit(page, c.type, c.oldId);
    await expect(target).toBeAttached({ timeout: 15000 });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error('overlay box not found');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const field = page.locator(c.idField);
    await expect(field).toHaveValue(c.oldId);
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(c.newId);
    const r = await H.measure(page, testInfo, async () => {
      await page.locator(c.apply).click();
      await expect(hit(page, c.type, c.newId)).toBeAttached({ timeout: 15000 });
    }, [c.newId]);
    await H.expectRendered(page);

    const a = (await H.getEditorText(page)).split('\n');
    const b = before.split('\n');
    expect(a.length).toBe(b.length);
    expect(a[c.decl - 1], '宣言の行は名前の字だけが替わる').toBe(c.declAfter);
    for (const n of Object.keys(c.changed)) expect(a[Number(n) - 1], n + ' 行目').toBe(c.changed[n]);
    for (let i = 0; i < b.length; i++) {
      if (i === c.decl - 1 || c.changed[i + 1]) continue;
      expect(a[i], (i + 1) + ' 行目は変わらない').toBe(b[i]);
    }
    expect(r.diffLines).toBe(2 * (1 + Object.keys(c.changed).length));

    // 図は新しい名前で描かれ、前の名前は描かれない。
    const words = await svgWords(page);
    expect(words, 'SVG に ' + c.newId).toContain(c.newId);
    expect(words, 'SVG に前の名前 ' + c.oldId + ' が残らない').not.toContain(c.oldId);
    await expect(hit(page, c.type, c.oldId)).toHaveCount(0);
    H.annotate(testInfo, 'result', c.kind + ' diff=' + r.diffLines + ' ms=' + r.renderMs);
  });
}
