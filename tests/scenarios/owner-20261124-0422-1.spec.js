// @ts-check
// TICKET-owner-20261124-0422-1 (data-loss): 状態・クラス・コンポーネント・アクターの右パネルで「名前 (id)」を変えて
// 「変更を反映」を押すと、宣言の行だけが変わり、遷移・関係・note の行は元の名前のまま残って、PlantUML が元の名前で
// 別の要素を描いていた (押した要素の線が全部外れる)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「同じ操作は 6 図種で同じ語・同じ場所」):
//   - 4 図種とも、既定の画面のまま 名前 (id) を変えて「変更を反映」1 回で、宣言の行と名前を識別子として持つ行が替わる
//   - 同じ名前で始まる別の要素 (IdleWait・BusCtl・UserAdmin)・コメント行・ほかの行は 1 バイトも変わらない
//   - 図の要素の数 (overlay の当たり) は改名の前と同じ。元の名前の要素は描かれない
//   - 付け替えのチェック「名前を変えたら関係の行も付け替える」は既定 on。別ボタンは無い
//   - Ctrl+Z 1 回で全部戻る
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const CASES = [
  {
    kind: 'state', type: 'state', oldId: 'Idle', newId: 'Idle2', idField: '#st-id', apply: '#st-update', check: '#st-rename-refs',
    text: ['@startuml', "' Idle is the waiting state", 'state Idle', 'state IdleWait', '[*] --> Idle',
      'Idle --> IdleWait : go', 'IdleWait --> Idle : back', '@enduml', ''],
    words: ['Idle', 'IdleWait', 'go', 'back'],
    decl: 3, changed: { 5: '[*] --> Idle2', 6: 'Idle2 --> IdleWait : go', 7: 'IdleWait --> Idle2 : back' },
  },
  {
    kind: 'class', type: 'class', oldId: 'Bus', newId: 'Bus2', idField: '#cl-edit-id', apply: '#cl-edit-apply', check: '#cl-edit-rename-refs',
    text: ['@startuml', "' Bus is the shared line", 'class Bus {', '  +send()', '}', 'class BusCtl',
      'BusCtl --> Bus : uses', 'note right of Bus : shared', '@enduml', ''],
    words: ['Bus', 'BusCtl', 'uses', 'shared'],
    decl: 3, changed: { 7: 'BusCtl --> Bus2 : uses', 8: 'note right of Bus2 : shared' },
  },
  {
    kind: 'component', type: 'component', oldId: 'Bus', newId: 'Bus2', idField: '#co-edit-id', apply: '#co-edit-apply', check: '#co-edit-rename-refs',
    text: ['@startuml', "' Bus is the shared line", 'component Bus', 'component BusCtl', 'Bus --> BusCtl : data',
      'note right of Bus : shared', '@enduml', ''],
    words: ['Bus', 'BusCtl', 'data', 'shared'],
    decl: 3, changed: { 5: 'Bus2 --> BusCtl : data', 6: 'note right of Bus2 : shared' },
  },
  {
    kind: 'usecase', type: 'actor', oldId: 'User', newId: 'User2', idField: '#uc-edit-id', apply: '#uc-edit-apply', check: '#uc-edit-rename-refs',
    text: ['@startuml', "' User signs in", 'actor User', 'actor UserAdmin', 'usecase "Login" as UC1', 'User --> UC1',
      'UserAdmin --> UC1', '@enduml', ''],
    words: ['User', 'UserAdmin', 'Login'],
    decl: 3, changed: { 6: 'User2 --> UC1' },
  },
];

function hit(page, type, id) {
  return page.locator('#overlay-layer [data-type="' + type + '"][data-id="' + id + '"]').first();
}

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function countType(page, type) {
  return page.evaluate((t) => {
    const ids = new Set();
    document.querySelectorAll('#overlay-layer [data-type="' + t + '"]').forEach((e) => ids.add(e.getAttribute('data-id')));
    return ids.size;
  }, type);
}

for (const c of CASES) {
  test('owner 0422-1 ' + c.kind + ': 名前 (id) を変えた「変更を反映」1 回で参照する行も付け替え、要素の数は変わらない', async ({ page }, testInfo) => {
    test.setTimeout(120 * 1000);
    const before = c.text.join('\n');
    await H.bootWith(page, before);
    await H.waitDrawn(page, c.words);
    await expect(hit(page, c.type, c.oldId)).toBeAttached({ timeout: 15000 });
    const nBefore = await countType(page, c.type);

    await clickHit(page, hit(page, c.type, c.oldId), c.kind + ' ' + c.oldId);
    const field = page.locator(c.idField);
    await expect(field).toHaveValue(c.oldId);
    await expect(page.locator(c.check)).toBeChecked();
    await expect(page.getByRole('button', { name: '名前を変えたら関係の行も付け替える' })).toHaveCount(0);
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(c.newId);
    const r = await H.measure(page, testInfo, async () => {
      await page.locator(c.apply).click();
      await expect(hit(page, c.type, c.newId)).toBeAttached({ timeout: 15000 });
    }, c.words.filter((w) => w !== c.oldId));
    await H.expectRendered(page);

    const after = await H.getEditorText(page);
    const a = after.split('\n');
    const b = before.split('\n');
    expect(a.length).toBe(b.length);
    expect(new RegExp('\\b' + c.newId + '\\b').test(a[c.decl - 1]), '宣言の行が新しい名前を持つ').toBe(true);
    for (const n of Object.keys(c.changed)) expect(a[Number(n) - 1], n + ' 行目').toBe(c.changed[n]);
    for (let i = 0; i < b.length; i++) {
      if (i === c.decl - 1 || c.changed[i + 1]) continue;
      expect(a[i], (i + 1) + ' 行目は変わらない').toBe(b[i]);
    }
    expect(r.diffLines).toBe(2 * (1 + Object.keys(c.changed).length));
    // 元の名前の要素は描かれず、要素の数は改名の前と同じ。
    await expect(hit(page, c.type, c.oldId)).toHaveCount(0);
    expect(await countType(page, c.type)).toBe(nBefore);
    await page.screenshot({ path: testInfo.outputPath(c.kind + '-renamed.png') });

    // Ctrl+Z 1 回で全部戻る。
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(before);
    H.annotate(testInfo, 'result', c.kind + ' diff=' + r.diffLines + ' ms=' + r.renderMs);
  });
}
