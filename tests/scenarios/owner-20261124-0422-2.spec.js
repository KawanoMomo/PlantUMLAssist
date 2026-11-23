// @ts-check
// TICKET-owner-20261124-0422-2: 改名で参照の行を付け替えると、関係・メッセージのラベルと note の本文の中の同じ語まで
// 書き換わっていた (`Bus --> BusCtl : Bus data` → `Bus2 --> BusCtl : Bus2 data`)。
// 期待 (principles.md「直した行でも名指ししない字は元のまま」「名指しした要素だけを変える」):
//   - 5 図種 (sequence・class・component・usecase・state) で、既定の画面のまま要素を押して名前 (id) を変えると、
//     付け替わるのは宣言・線の両端・note の対象の識別子だけ。`:` の後のラベル・note の本文・コメント行の字は元のまま
//   - 同じ名前で始まる別の要素 (CtlSub・BusCtl・UserAdmin・IdleWait) も元のまま。Ctrl+Z 1 回で戻る
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');
const { clickOverlayByLine } = require('../e2e/helpers');

const CASES = [
  {
    kind: 'sequence', oldId: 'Ctl', newId: 'Ctl2', idField: '#seq-edit-alias', apply: null,
    text: ['@startuml', "' Ctl drives the bus", 'participant Ctl', 'participant CtlSub', 'Ctl -> CtlSub : Ctl req',
      'CtlSub --> Ctl : done', 'note over Ctl : Ctl note', '@enduml', ''],
    words: ['Ctl', 'CtlSub', 'Ctl req', 'Ctl note'],
    decl: 3, changed: { 3: 'participant Ctl2', 5: 'Ctl2 -> CtlSub : Ctl req', 6: 'CtlSub --> Ctl2 : done', 7: 'note over Ctl2 : Ctl note' },
  },
  {
    kind: 'class', type: 'class', oldId: 'Bus', newId: 'Bus2', idField: '#cl-edit-id', apply: '#cl-edit-apply',
    text: ['@startuml', "' Bus is the shared line", 'class Bus {', '  +send()', '}', 'class BusCtl',
      'BusCtl --> Bus : uses Bus', 'note right of Bus : Bus note', '@enduml', ''],
    words: ['Bus', 'BusCtl', 'uses Bus', 'Bus note'],
    decl: 3, changed: { 7: 'BusCtl --> Bus2 : uses Bus', 8: 'note right of Bus2 : Bus note' },
  },
  {
    kind: 'component', type: 'component', oldId: 'Bus', newId: 'Bus2', idField: '#co-edit-id', apply: '#co-edit-apply',
    text: ['@startuml', "' Bus is the shared line", 'component Bus', 'component BusCtl', 'Bus --> BusCtl : Bus data',
      'note right of Bus : Bus note', '@enduml', ''],
    words: ['Bus', 'BusCtl', 'Bus data', 'Bus note'],
    decl: 3, changed: { 5: 'Bus2 --> BusCtl : Bus data', 6: 'note right of Bus2 : Bus note' },
  },
  {
    kind: 'usecase', type: 'actor', oldId: 'User', newId: 'User2', idField: '#uc-edit-id', apply: '#uc-edit-apply',
    text: ['@startuml', "' User signs in", 'actor User', 'actor UserAdmin', 'usecase "Login" as UC1', 'User --> UC1 : User login',
      'UserAdmin --> UC1', '@enduml', ''],
    words: ['User', 'UserAdmin', 'Login', 'User login'],
    decl: 3, changed: { 6: 'User2 --> UC1 : User login' },
  },
  {
    kind: 'state', type: 'state', oldId: 'Idle', newId: 'Idle2', idField: '#st-id', apply: '#st-update',
    text: ['@startuml', "' Idle is the waiting state", 'state Idle', 'state IdleWait', '[*] --> Idle',
      'Idle --> IdleWait : Idle go', 'IdleWait --> Idle', 'note right of Idle : Idle note', '@enduml', ''],
    words: ['Idle', 'IdleWait', 'Idle go', 'Idle note'],
    decl: 3, changed: { 5: '[*] --> Idle2', 6: 'Idle2 --> IdleWait : Idle go', 7: 'IdleWait --> Idle2', 8: 'note right of Idle2 : Idle note' },
  },
];

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

for (const c of CASES) {
  test('owner 0422-2 ' + c.kind + ': 改名の付け替えはラベル・note の本文の同じ語を変えない', async ({ page }, testInfo) => {
    test.setTimeout(120 * 1000);
    const before = c.text.join('\n');
    await H.bootWith(page, before);
    await H.waitDrawn(page, c.words);

    if (c.kind === 'sequence') {
      // 末尾に追加の種類を「参加者」にしてから参加者を押す (メッセージの To に入らないように)。
      const chip = page.locator('#seq-tail-kind-chip-participant');
      if (await chip.count()) await chip.click();
      await clickOverlayByLine(page, c.decl);
    } else {
      await clickHit(page, page.locator('#overlay-layer [data-type="' + c.type + '"][data-id="' + c.oldId + '"]').first(), c.kind);
    }
    const field = page.locator(c.idField);
    await expect(field).toHaveValue(c.oldId);
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(c.newId);
    const r = await H.measure(page, testInfo, async () => {
      if (c.apply) await page.locator(c.apply).click();
      else await field.press('Tab');
      await expect.poll(async () => (await H.getEditorText(page)).split('\n')[c.decl - 1], { timeout: 10000 })
        .toMatch(new RegExp('\\b' + c.newId + '\\b'));
    }, null);
    await H.waitDrawn(page, c.words.filter((w) => w !== c.oldId));
    await H.expectRendered(page);

    const a = r.after.split('\n');
    const b = before.split('\n');
    expect(a.length).toBe(b.length);
    for (const n of Object.keys(c.changed)) expect(a[Number(n) - 1], n + ' 行目').toBe(c.changed[n]);
    for (let i = 0; i < b.length; i++) {
      if (i === c.decl - 1 || c.changed[i + 1]) continue;
      expect(a[i], (i + 1) + ' 行目は変わらない').toBe(b[i]);
    }
    await page.screenshot({ path: testInfo.outputPath(c.kind + '-renamed.png') });

    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(before);
    H.annotate(testInfo, 'result', c.kind + ' diff=' + r.diffLines);
  });
}
