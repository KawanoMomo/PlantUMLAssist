// @ts-check
// migrator 台本 手順 4「選択枠」— 実物の .puml の要素に順にホバーし、出る枠がその要素を指す。
// BLK-migrator-20260917-2349-b: 可視性 -/#/~ 付きの C 風メンバー (`- uint8 pinState`) に枠が出なかった。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { bootPlain, bootWithSaveDir, typeDsl, dirFor, absDirFor } = require('./_scenario');

const DSL = [
  '@startuml',
  'class GpioDriver {',
  '  - uint8 pinState',
  '  # uint32 baseAddr',
  '  ~ bool initialized',
  '  + Init() : void',
  '}',
  '@enduml',
].join('\n');

test('migrator 手順 4 — 可視性記号の混ざったクラスで、クラス名と全メンバーにホバーすると各行の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, DSL);
  await page.waitForSelector('#preview-svg svg text, #preview svg text', { timeout: 20000 }).catch(() => {});
  await expect(page.locator('#overlay-layer rect[data-type="member"]')).toHaveCount(4, { timeout: 20000 });

  const targets = [
    ['GpioDriver', 'class', '2'],
    ['uint8 pinState', 'member', '3'],
    ['uint32 baseAddr', 'member', '4'],
    ['bool initialized', 'member', '5'],
    ['Init() : void', 'member', '6'],
  ];
  for (const [label, type, line] of targets) {
    const box = await page.evaluate((l) => {
      const t = Array.prototype.find.call(document.querySelectorAll('svg g.entity text'),
        (n) => (n.textContent || '').trim() === l);
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, label);
    expect(box, label + ' が描かれている').not.toBeNull();
    await page.mouse.move(box.x, box.y);
    const hit = await page.evaluate((p) => {
      const els = document.elementsFromPoint(p.x, p.y);
      const r = els.find((e) => e.tagName.toLowerCase() === 'rect' && e.closest('#overlay-layer'));
      return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line') } : null;
    }, box);
    expect(hit, label + ' にホバーして枠が出る').toEqual({ type, line });
  }
});

// 差し戻し 1 回目: 前に保存した図の「保存時チェック」の帯が、次のファイルを開いた後も
// プレビュー上端に残り、上の方のメンバー行 (-/#/~) を覆ってホバーが届かなかった。
test('migrator 手順 4 — 前の図の保存で出た警告帯は、次のファイルを開くと消え、上端のメンバーにも枠が出る', async ({ page }) => {
  await bootPlain(page);
  await page.evaluate((dir) => {
    try { Object.keys(localStorage).forEach((k) => { if (k.indexOf('pua.savecheck:') === 0) localStorage.removeItem(k); }); } catch (e) {}
    window.MA.autoSave.setConfig({ enabled: true, debounceMs: 500, restoreMode: 'none', backend: 'file', fileDir: dir });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'Gpio_Seq');
  }, dirFor(__filename));
  await page.locator('#editor').fill(['@startuml', 'participant Gpio_Driver', 'participant Gpio_Hw', 'participant Unused',
    'Gpio_Driver -> Gpio_Hw : Gpio_Init', '@enduml'].join(String.fromCharCode(10)));
  await page.waitForTimeout(800);
  await page.locator('#btn-save').dispatchEvent('click');
  await expect(page.locator('#save-check-overlay')).toBeVisible();

  const dir = absDirFor(__filename);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'class-01-basic-visibility.puml');
  fs.writeFileSync(file, DSL);
  await page.click('#btn-command-palette');
  await page.fill('#cp-input', 'ファイルを開く');
  await page.waitForTimeout(300);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#cp-list [role="option"], #cp-list li, #cp-list .cp-item').filter({ hasText: 'ファイルを開く' }).first().click(),
  ]);
  await chooser.setFiles(file);
  await expect(page.locator('#overlay-layer rect[data-type="member"]')).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('#save-check-overlay')).toBeHidden();

  const ids = await page.locator('#overlay-layer rect.selectable[data-type="member"]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-id')));
  for (const id of ids) {
    const r = page.locator('#overlay-layer rect.selectable[data-type="member"][data-id="' + id + '"]');
    const b = await r.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r, id + ' にホバーして枠が出る').toHaveClass(/hit-hover/);
  }
});

// BLK-migrator-20260918-0049: struct / annotation、package・namespace の中のクラス、文字入り区切り線の後のメンバーに
// ホバーしても枠が出ない / 別の行の枠が出た。
test('migrator 手順 4 — struct・package 配下・区切り線のあるクラスでも、ホバーした要素そのものに枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',
    'package "BSW層" {',
    '  class GpioDriver',
    '}',
    'namespace App {',
    '  class MainTask',
    '}',
    'annotation "@Safety(ASIL_D)" as SafetyTag',
    'struct CanFrame {',
    '  id: uint32',
    '}',
    'class TaskA {',
    '  + Run()',
    '  ..private..',
    '  - secret : int',
    '  ==公開定数==',
    '  {static} MAX : int',
    '}',
    '@enduml',
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="struct"]')).toHaveCount(1, { timeout: 20000 });

  const targets = [
    ['BSW層', 'package', '2'],
    ['GpioDriver', 'class', '3'],
    ['MainTask', 'class', '6'],
    ['@Safety(ASIL_D)', 'annotation', '8'],
    ['CanFrame', 'struct', '9'],
    ['id: uint32', 'member', '10'],
    ['Run()', 'member', '13'],
    ['secret : int', 'member', '15'],
    ['MAX : int', 'member', '17'],
  ];
  for (const [label, type, line] of targets) {
    const box = await page.evaluate(([l, ty]) => {
      const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'),
        (n) => (n.textContent || '').trim() === l);
      if (!t) return null;
      // 図が画面より広いと右端の要素 (MainTask) は右欄の下に入る。利用者と同じく見える所まで動かしてから指す。
      t.scrollIntoView({ block: 'center', inline: 'center' });
      // package の名前札は右上のズーム帯の下に隠れることがあるので、枠の左下の内側を指す。
      const pk = ty === 'package' ? t.closest('g') && t.closest('g').querySelector('path, rect, polygon') : null;
      const r = (pk || t).getBoundingClientRect();
      return pk ? { x: r.left + 4, y: r.bottom - 4 } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, [label, type]);
    expect(box, label + ' が描かれている').not.toBeNull();
    await page.mouse.move(box.x, box.y);
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
      .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(',')), label + ' にホバーして枠が出る')
      .toBe(type + '@' + line);
  }
});

// BLK-migrator-20260918-0049 差し戻し 1 回目: hide で隠れたメンバーを数えたまま行を当てたため、
// 描かれているメンバーに 1 つ前の (隠れた) メンバーの行が付いた。together の二重宣言は同じ図形へ
// 枠を二重に出し、note は今の PlantUML が path で描くので枠が 1 つも出なかった。
test('migrator 手順 4 — hide・together・note のある図でも、ホバーした要素そのものの行が枠に出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',              // 1
    'together {',             // 2
    '  class TaskB',          // 3
    '}',                      // 4
    'class Sensor {',         // 5
    '  - float value',        // 6
    '  + Read() : float',     // 7
    '}',                      // 8
    'class Actuator {',       // 9
    '  - float target',       // 10
    '  + Write() : void',     // 11
    '}',                      // 12
    'note top of Sensor : 校正が要る',  // 13
    'hide Actuator fields',   // 14
    '@enduml',                // 15
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="note"]')).toHaveCount(1, { timeout: 20000 });
  // 二重宣言しても TaskB の枠は 1 つ。
  await expect(page.locator('#overlay-layer rect[data-type="class"][data-id="TaskB"]')).toHaveCount(1);

  const targets = [
    ['float value', 'member', '6'],
    ['Read() : float', 'member', '7'],
    // hide Actuator fields で target(L10) は描かれない。描かれている行は Write(L11)。
    ['Write() : void', 'member', '11'],
    ['校正が要る', 'note', '13'],
  ];
  for (const [label, type, line] of targets) {
    const box = await page.evaluate((l) => {
      const t = Array.prototype.find.call(document.querySelectorAll('svg g.entity text'),
        (n) => (n.textContent || '').trim() === l);
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, label);
    expect(box, label + ' が描かれている').not.toBeNull();
    await page.mouse.move(box.x, box.y);
    const hit = await page.evaluate((p) => {
      const els = document.elementsFromPoint(p.x, p.y);
      const r = els.find((e) => e.tagName.toLowerCase() === 'rect' && e.closest('#overlay-layer'));
      return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line') } : null;
    }, box);
    expect(hit, label + ' にホバーしてその行の枠が出る').toEqual({ type, line });
  }
});

// BLK-builder-20260925-0654-3: メンバーを指す note (`note right of E::field1 #yellow`) の本文に枠が出なかった。
// PlantUML はこれを g.entity の外の裸の吹き出し (tips) で描き、parser は `E` + 本文 `:field1 #yellow` と読み違えていた。
test('migrator 手順 4 — メンバーに付けた色つきの note でも、本文のどの行を指しても本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                    // 1
    'class AttributeNoteTest {',                    // 2
    '  int yellow',                                 // 3
    '  int lightblue',                              // 4
    '}',                                            // 5
    'note right of AttributeNoteTest::lightblue #lightblue', // 6
    '  Hello lightblue',                            // 7
    'end note',                                     // 8
    'note right of AttributeNoteTest::yellow #yellow', // 9
    '  Hello yellow',                               // 10
    '  (but it is actually lightblue)',             // 11
    'end note',                                     // 12
    '@enduml',                                      // 13
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="note"]')).toHaveCount(2, { timeout: 20000 });

  const targets = [
    ['int yellow', 'member', '3'],
    ['int lightblue', 'member', '4'],
    // DSL の順 (lightblue が先) と描かれる順 (メンバー順) が違っても、本文の文字で本人に当たる
    ['Hello lightblue', 'note', '6'],
    ['Hello yellow', 'note', '9'],
    ['(but it is actually lightblue)', 'note', '9'],
  ];
  for (const [label, type, line] of targets) {
    const box = await page.evaluate((l) => {
      const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text, #preview svg text'),
        (n) => (n.textContent || '').trim() === l);
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, label);
    expect(box, label + ' が描かれている').not.toBeNull();
    await page.mouse.move(box.x, box.y);
    const hit = await page.evaluate((p) => {
      const els = document.elementsFromPoint(p.x, p.y);
      const r = els.find((e) => e.tagName.toLowerCase() === 'rect' && e.closest('#overlay-layer') &&
        !/overlay-background/.test(e.getAttribute('class') || ''));
      return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line') } : null;
    }, box);
    expect(hit, label + ' にホバーしてその行の枠が出る').toEqual({ type, line });
  }
});

// BLK-migrator-20260918-0249: component 図で方向指定の矢印 (-right->/-left->/-up->/-down->) を
// 含むと、枠が 1 つも出なかった。角括弧だけで書かれた部品 (宣言行が 1 つも無い) と
// 方向語入りの矢印の両方が関係行として読めていなかった。
test('migrator 手順 4 — 方向指定の矢印だけで書かれた component 図でも、ホバーした部品に枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                               // 1
    '[SensorMgr] --> [FilterMgr]',             // 2
    '[FilterMgr] ..> [ActuatorMgr] : depends', // 3
    '[ActuatorMgr] <--> [SafetyMonitor]',      // 4
    '[SafetyMonitor] -up-> [Logger]',          // 5
    '[Logger] -down-> [DiagPort]',             // 6
    '[SensorMgr] -right-> [SafetyMonitor] : 監視',   // 7
    '[DiagPort] -left-> [SensorMgr] : フィードバック', // 8
    '@enduml',                                 // 9
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="component"]')).toHaveCount(6, { timeout: 20000 });

  for (const id of ['SensorMgr', 'FilterMgr', 'ActuatorMgr', 'SafetyMonitor', 'Logger', 'DiagPort']) {
    const r = page.locator('#overlay-layer rect.selectable[data-type="component"][data-id="' + id + '"]');
    await expect(r, id + ' の枠がある').toHaveCount(1);
    const b = await r.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r, id + ' にホバーして枠が出る').toHaveClass(/hit-hover/);
  }
});

// BLK-migrator-20260918-0449: sequence 図で、通常の矢印 (-> / -->) 以外の記法
// (片羽根 -\ -/ ・丸留め ->o ・双方向 <-> ・図の外との発着 [-> ->] ?-> ->?) で
// 書かれたメッセージ行に選択枠が 1 つも出ず、実物の図の大半の行が選べなかった。
test('migrator 手順 4 — 特殊な矢印で書かれた sequence のメッセージにも、ホバーで枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                    // 1
    'participant A',                // 2
    'participant B',                // 3
    'A -\\ B : half arrow down',    // 4
    'B -/ A : half arrow up',       // 5
    'A ->o B : lost message',       // 6
    'A <-> B : bidir',              // 7
    '[-> A : ext in',               // 8
    'A ->] : ext out',              // 9
    '?-> A : from nowhere',         // 10
    'A ->? : to nowhere',           // 11
    '@enduml',                      // 12
  ].join(String.fromCharCode(10)));
  // 8 行すべてがメッセージとして枠を持つ (1 つでも欠けると手順 4 が完了しない)。
  const msgRects = page.locator('#overlay-layer rect[data-type="message"]');
  await expect(msgRects).toHaveCount(8, { timeout: 20000 });

  // 疑似端点 (図の外・描かない) は参加者として数えない。
  await expect(page.locator('#overlay-layer rect[data-type="participant"]')).toHaveCount(4, { timeout: 20000 });

  for (const line of ['4', '5', '6', '7', '8', '9', '10', '11']) {
    const r = page.locator('#overlay-layer rect[data-type="message"][data-line="' + line + '"]');
    await expect(r, line + ' 行目の枠がある').toHaveCount(1);
    const b = await r.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r, line + ' 行目にホバーして枠が出る').toHaveClass(/hit-hover/);
  }
});

// BLK-migrator-20260918-0549: 実物は `autonumber 10 5 "<b>[000]"` のように書式を指定して
// 採番する。書式つきの行を GUI が採番行として読めておらず、図の設定は「番号なし」と出て、
// そこを触ると 2 本目の autonumber 行が入り実物の採番が勝手に変わっていた。
// 枠が全要素に出ること (手順 4 の到達条件) と、採番の状態が正しく出ることを守る。
test('migrator 手順 4 — 書式指定つき autonumber の sequence 図でも、全要素に枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                   // 1
    'autonumber 10 5 "<b>[000]"',                  // 2
    'participant App',                             // 3
    'participant Rte',                             // 4
    'App -> Rte : Rte_Write_PortName(val)',        // 5
    'Rte --> App : Rte_E_OK',                      // 6
    'App -> Rte : Rte_Read_PortName(&val)',        // 7
    'Rte --> App : Rte_E_OK',                      // 8
    '@enduml',                                     // 9
  ].join(String.fromCharCode(10)));

  const msgRects = page.locator('#overlay-layer rect[data-type="message"]');
  await expect(msgRects).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="participant"]')).toHaveCount(4, { timeout: 20000 });

  // 番号 ([010] など) が前に付いていても、各行の枠が出てホバーで反応する。
  // (書式を採番行として読めること自体は blk-migrator-0549-autonumber-format.test.js で守る)
  for (const line of ['5', '6', '7', '8']) {
    const r = page.locator('#overlay-layer rect[data-type="message"][data-line="' + line + '"]');
    await expect(r, line + ' 行目の枠がある').toHaveCount(1);
    const b = await r.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r, line + ' 行目にホバーして枠が出る').toHaveClass(/hit-hover/);
  }

});

// BLK-migrator-20260923-1307: 実物は `box "…" #色` / `end box` で参加者をグループ化する。
// その囲みがあると図の全要素 (参加者見出し・メッセージ) で枠が 1 件も出ず、手順 4 が完了しない。
// 0449 (特殊矢印)・0549 (書式つき autonumber) と同じ「読めない行があるとその図の枠が落ちる」系統。
test('migrator 手順 4 — box で参加者をグループ化した sequence 図でも、全要素に枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    "' 狙い: box によるparticipantのグルーピング",  // 1
    '@startuml',                                    // 2
    'box "ECU本体" #LightYellow',                   // 3
    '  participant App',                            // 4
    '  participant Rte',                            // 5
    'end box',                                      // 6
    'box "外部装置"',                                // 7
    '  participant Tester',                         // 8
    'end box',                                      // 9
    'Tester -> App : 診断リクエスト',                 // 10
    'App -> Rte : データ取得',                       // 11
    'Rte --> App : データ',                          // 12
    'App --> Tester : 診断レスポンス',                // 13
    '@enduml',                                      // 14
  ].join(String.fromCharCode(10)));

  // 参加者は 3 人 = 上下 (head/tail) で 6 枠。メッセージは 4 本。
  await expect(page.locator('#overlay-layer rect[data-type="participant"]'))
    .toHaveCount(6, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(4);

  // box の囲みそのものは group (alt/loop 等) ではないので、group の枠は作らない。
  await expect(page.locator('#overlay-layer rect[data-type="group"]')).toHaveCount(0);

  // 囲みの見出し (「ECU本体」「外部装置」) にもそれぞれ枠がある。
  // 以前はここにホバーしても、図全体を覆う背景しか下に無く、何も指していなかった。
  const boxRects = page.locator('#overlay-layer rect[data-type="box"]');
  await expect(boxRects).toHaveCount(2);
  for (const [label, line] of [['ECU本体', '3'], ['外部装置', '7']]) {
    const r = page.locator('#overlay-layer rect[data-type="box"][data-line="' + line + '"]');
    await expect(r, label + ' の枠がある').toHaveCount(1);
    const t = page.locator('#preview-svg svg text', { hasText: label }).first();
    const tb = await t.boundingBox();
    const under = await page.evaluate((q) => {
      const els = document.elementsFromPoint(q.x, q.y);
      const rr = els.find((e) => e.tagName && e.tagName.toLowerCase() === 'rect'
        && e.closest('#overlay-layer') && e.getAttribute('data-type'));
      return rr ? { type: rr.getAttribute('data-type'), line: rr.getAttribute('data-line') } : null;
    }, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 });
    expect(under, label + ' の見出しの下に枠がある').toEqual({ type: 'box', line: line });
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await expect(r, label + ' にホバーして枠が出る').toHaveClass(/hit-hover/);
  }

  // 見出しを押すと、何を囲んでいるかが出て、名前をその場で直せる。
  await page.locator('#overlay-layer rect[data-type="box"][data-line="3"]').click();
  await expect(page.locator('#seq-edit-boxlabel')).toHaveValue('ECU本体');
  await page.locator('#seq-edit-boxlabel').fill('車体側');
  await page.locator('#seq-edit-boxlabel').dispatchEvent('change');
  await page.waitForTimeout(800);
  // 色 (#LightYellow) は落とさない。開いただけの図の見た目を勝手に変えない。
  expect(await page.locator('#editor').inputValue()).toContain('box "車体側" #LightYellow');

  // 参加者の枠は、box の中に書かれていても宣言行を指す。
  for (const [id, line] of [['App', '4'], ['Rte', '5'], ['Tester', '8']]) {
    const r = page.locator('#overlay-layer rect[data-type="participant"][data-id="' + id + '"]');
    await expect(r, id + ' の枠がある').toHaveCount(2);
    await expect(r.first()).toHaveAttribute('data-line', line);
    const b = await r.first().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r.first(), id + ' にホバーして枠が出る').toHaveClass(/hit-hover/);
  }

  // メッセージ 4 本も、それぞれの行を指してホバーで反応する。
  for (const line of ['10', '11', '12', '13']) {
    const r = page.locator('#overlay-layer rect[data-type="message"][data-line="' + line + '"]');
    await expect(r, line + ' 行目の枠がある').toHaveCount(1);
    const b = await r.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r, line + ' 行目にホバーして枠が出る').toHaveClass(/hit-hover/);
  }
});

// BLK-migrator-20260923-1409: 実物 (AWS アイコン構成図) は participant の表示名を
// `"1行目\n<b>2行目</b>\n3行目"` と複数行で書く。その図では見出しにホバーしても枠が出ず、
// 出ても隣の参加者の枠になっていた。0449・0549・1307 と同じ「読めない/描き方の違う行があると
// その図の枠が落ちる」系統。見出しの 2 行目・3 行目を指しても本人の枠が出ることを守る。
test('migrator 手順 4 — 表示名が複数行の participant でも、見出しのどの行を指しても本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                          // 1
    'participant "Amazon EC2\\n<b>App Server</b>\\nAZ-a" as EC2',  // 2
    'participant "Amazon RDS" as RDS',                    // 3
    'EC2 -> RDS : query',                                 // 4
    'RDS --> EC2 : rows',                                 // 5
    '@enduml',                                            // 6
  ].join(String.fromCharCode(10)));

  // 参加者 2 人 = 上下で 4 枠、メッセージ 2 本。表示名の中の改行は別の参加者にならない。
  await expect(page.locator('#overlay-layer rect[data-type="participant"]'))
    .toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2);

  // 見出しの 1 行目と 3 行目、どちらを指しても EC2 の宣言行 (2 行目) の枠が下にある。
  // 以前は 1 行目の上しか当たり判定が無く、3 行目では何も指さなかった。
  for (const label of ['Amazon EC2', 'AZ-a']) {
    const t = page.locator('#preview-svg svg text', { hasText: label }).first();
    const tb = await t.boundingBox();
    const under = await page.evaluate((q) => {
      const els = document.elementsFromPoint(q.x, q.y);
      const rr = els.find((e) => e.tagName && e.tagName.toLowerCase() === 'rect'
        && e.closest('#overlay-layer') && e.getAttribute('data-type'));
      return rr ? { type: rr.getAttribute('data-type'), line: rr.getAttribute('data-line') } : null;
    }, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 });
    expect(under, label + ' を指すと EC2 の宣言行の枠が下にある')
      .toEqual({ type: 'participant', line: '2' });
  }

  // メッセージも今までどおりホバーで反応する (当事者を取り違えない)。
  for (const line of ['4', '5']) {
    const r = page.locator('#overlay-layer rect[data-type="message"][data-line="' + line + '"]');
    await expect(r, line + ' 行目の枠がある').toHaveCount(1);
    const b = await r.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(r, line + ' 行目にホバーして枠が出る').toHaveClass(/hit-hover/);
  }
});

// BLK-migrator-20260923-1409 差し戻し 1 回目: AWS の構成図 (Figure 5 系) は参加者を
// 手続き (`$AWSIcon(...) as x`) で宣言し、`a->b++ 色:` の略記・`return`・`note right`・
// 引用符の無い囲み名・テーマ色の群の枠を使う。1 つでも読めないと順番で当てた枠が
// 以後ずれ、alt の中のライフラインを指すと alt が選ばれていた。
test('migrator 手順 4 — 手続きで参加者を宣言した sequence 図でも、参加者・ライフライン・メッセージ・注釈に本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'sequence-procedure-participants.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);

  // hide footbox なので参加者は頭だけ 3 枠。メッセージ 4 本 (return は枠にしない)・注釈・群・囲み。
  await expect(page.locator('#overlay-layer rect[data-type="participant"]')).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(4);
  await expect(page.locator('#overlay-layer rect[data-type="note"]')).toHaveCount(1);
  await expect(page.locator('#overlay-layer rect[data-type="group"]')).toHaveCount(1);
  await expect(page.locator('#overlay-layer rect[data-type="box"]')).toHaveCount(1);
  await expect(page.locator('#overlay-warning')).toBeHidden();

  async function hoverText(label) {
    const t = page.locator('#preview-svg svg text', { hasText: label }).first();
    const tb = await t.boundingBox();
    await page.mouse.move(3, 3);
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  }
  // 手続きで宣言した参加者の見出し 3 行目 → その呼び出し行 (15 行目) の枠
  await hoverText('Gateway');
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-line', '15');
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-type', 'participant');
  // return の後のメッセージ → その行 (29 行目)
  await hoverText('200 OK');
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-line', '29');
  // メッセージに付けた注釈 → note right の行 (21 行目)
  await hoverText('missing Accept-Version');
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-type', 'note');
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-line', '21');

  // alt の中で、メッセージの無い高さのライフラインを指すと alt ではなくそのライフライン
  const ll = page.locator('#overlay-layer rect.selectable[data-type="lifeline"][data-id="api"]');
  const lb = await ll.boundingBox();
  const grp = await page.locator('#overlay-layer rect[data-type="group"]').boundingBox();
  const msgs = await page.locator('#overlay-layer rect[data-type="message"], #overlay-layer rect[data-type="note"]').evaluateAll(
    (rs) => rs.map((r) => { const b = r.getBoundingClientRect(); return [b.top, b.bottom]; }));
  // BLK-owner-20260924-0637-2: 枠の見出しの行 (札・条件の文字) と枠線は枠の当たり。その下から探す。
  const head = await page.locator('#overlay-layer path.group-hit[data-hit-part="head"]').first().boundingBox();
  let y = null;
  for (let yy = Math.max(lb.y, head.y + head.height) + 4; yy < Math.min(lb.y + lb.height, grp.y + grp.height) - 6; yy += 3) {
    if (!msgs.some(([t, b]) => yy >= t - 2 && yy <= b + 2)) { y = yy; break; }
  }
  expect(y, 'alt の中にメッセージの無い高さがある').not.toBeNull();
  await page.mouse.move(3, 3);
  await page.mouse.move(lb.x + lb.width / 2, y);
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-type', 'lifeline');
  await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-id', 'api');
});

// BLK-migrator-20260923-1909: 継承線の先・`abstract X`・node / cloud など、フォームが読めない記法の要素に
// ホバーしても枠が出なかった (class-ex 3/25、component-ex 13/25)。PlantUML が SVG に残す
// 要素名と行で当て、フォームで直せない要素も「本文の何行目か」を指す枠にする。
async function hoverHit(page, label) {
  const box = await page.evaluate((l) => {
    const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text, #preview svg text'),
      (n) => (n.textContent || '').trim() === l);
    if (!t) return null;
    // 入れ物の名札は右上のズーム帯の下に隠れることがあるので、枠の左下の内側を指す。
    const g = t.closest('g');
    if (g && /cluster/.test(g.getAttribute('class') || '')) {
      const f = g.getBoundingClientRect();
      return { x: f.left + 6, y: f.bottom - 6 };
    }
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  expect(box, label + ' が描かれている').not.toBeNull();
  // 描き直しで当たり判定が作り直されると、乗せたままの枠は光らない (mousemove が来ない)。
  // 実際の利用者と同じく、少し動かし直して確かめる。
  let hit = null;
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(3, 3);
    await page.mouse.move(box.x + (i % 2), box.y);
    await page.waitForTimeout(100 + i * 100);
    hit = await page.evaluate((p) => {
      const els = document.elementsFromPoint(p.x, p.y);
      // BLK-builder-20260926-1010-1: 枠 (群・塗りの無い ref) の札・枠線・文字は、ライフラインより手前の <path class="group-hit">。
      // 指すと同じ要素の枠の rect が光る (path 自身は光らない) ので、光ったかは同じ種類・id の rect で見る。
      const r = els.find((e) => e.closest('#overlay-layer') && e.getAttribute('data-type') &&
        (e.tagName.toLowerCase() === 'rect' || /group-hit/.test(e.getAttribute('class') || '')) &&
        !/overlay-background/.test(e.getAttribute('class') || ''));
      if (!r) return null;
      const type = r.getAttribute('data-type'), id = r.getAttribute('data-id');
      const lit = r.tagName.toLowerCase() === 'rect' ? /hit-hover/.test(r.getAttribute('class') || '')
        : Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
          .some((x) => x.getAttribute('data-type') === type && x.getAttribute('data-id') === id);
      return { type, line: r.getAttribute('data-line'), hover: lit };
    }, { x: box.x + (i % 2), y: box.y });
    if (hit && hit.hover) break;
  }
  return { box, hit };
}

// BLK-migrator-20260929-0459: 全参加者にまたがる注釈 (`note across`、corpus の seq-23) の紙には、縁にも本文にも枠が出なかった。
// 1 行・複数行・hnote (帯は polygon)・色付きで、紙の左右の縁と本文の文字のどこでも note の枠が出て、押すと見出しの行 (5) が選ばれる。
test('migrator 手順 4 — note across の紙の縁・本文のどこでも注釈の枠が出て、押すと note の行', async ({ page }) => {
  await bootPlain(page);
  const cases = [
    { note: ['note across : 全体にまたがるnote'], text: '全体にまたがるnote' },
    { note: ['note across', '  1 行目の注釈', '  2 行目の注釈', 'end note'], text: '2 行目の注釈' },
    { note: ['hnote across #LightBlue : 色付きの帯'], text: '色付きの帯' },
    { note: ['rnote across : 四角の帯'], text: '四角の帯' },
  ];
  for (const c of cases) {
    await typeDsl(page, ['@startuml', 'participant A', 'participant B', 'A -> B : req'].concat(c.note, ['B --> A : res', '@enduml']).join('\n'));
    await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2, { timeout: 20000 });
    await expect(page.locator('#overlay-layer rect[data-type="note"]')).toHaveCount(1);
    const t = await hoverHit(page, c.text);
    expect(t.hit, c.text + ' の本文に枠').not.toBeNull();
    expect(t.hit.type + '@' + t.hit.line + (t.hit.hover ? '' : ' (光らない)')).toBe('note@5');
    // 紙 (本文の文字を囲む塗りのある最小の図形) の左右の縁の内側
    const edges = await page.evaluate((s) => {
      const tx = Array.from(document.querySelectorAll('#preview-svg svg text')).find((n) => (n.textContent || '').trim() === s);
      const tb = tx.getBoundingClientRect();
      let best = null;
      document.querySelectorAll('#preview-svg svg path, #preview-svg svg polygon, #preview-svg svg rect').forEach((el) => {
        const f = (el.getAttribute('fill') || '').toLowerCase();
        if (!f || f === 'none' || f === 'transparent') return;
        const b = el.getBoundingClientRect();
        if (b.left > tb.left + 2 || b.top > tb.top + 2 || b.right < tb.right - 2 || b.bottom < tb.bottom - 2) return;
        if (!best || b.width * b.height < best.width * best.height) best = b;
      });
      return best && [{ x: best.left + 3, y: best.top + best.height / 2 }, { x: best.right - 3, y: best.top + best.height / 2 }];
    }, c.text);
    expect(edges, c.text + ' の紙が描かれている').not.toBeNull();
    for (const p of edges) {
      await page.mouse.move(3, 3);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(150);
      const got = await page.evaluate((q) => {
        const r = document.elementsFromPoint(q.x, q.y).find((e) => e.closest('#overlay-layer') && e.tagName.toLowerCase() === 'rect' &&
          e.getAttribute('data-type') && !/overlay-background/.test(e.getAttribute('class') || ''));
        return r ? r.getAttribute('data-type') + '@' + r.getAttribute('data-line') : 'none';
      }, p);
      expect(got, c.text + ' の紙の縁').toBe('note@5');
    }
    await page.mouse.move(t.box.x, t.box.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => s.type + '@' + s.line)),
      { timeout: 5000 }).toEqual(['note@5']);
    await page.keyboard.press('Escape');
  }
});

test('migrator 手順 4 — 継承線の先・abstract・circle のある class 図でも、ホバーした要素の行に枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                 // 1
    'abstract class Animal',     // 2
    'Animal <|-- Dog',           // 3
    'abstract Plant',            // 4
    'Plant <|- Tree',            // 5
    'interface Living',          // 6
    'Living <|-- Animal',        // 7
    'circle Sun',                // 8
    '@enduml',
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="abstract"]')).toHaveCount(1, { timeout: 20000 });
  for (const [label, line] of [['Animal', '2'], ['Dog', '3'], ['Plant', '4'], ['Tree', '5'], ['Living', '6'], ['Sun', '8']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして枠が出る').not.toBeNull();
    expect(hit.line, label + ' の枠が指す行').toBe(line);
    expect(hit.hover, label + ' の枠が光る').toBe(true);
  }
  // フォームが読めない記法 (`abstract X`) は、押すと本文の行とフォーム未対応であることが右欄に出る
  const { box } = await hoverHit(page, 'Plant');
  await page.mouse.click(box.x, box.y);
  await expect(page.locator('#src-line-props')).toHaveAttribute('data-line', '4');
  await expect(page.locator('#src-line-text')).toHaveText('abstract Plant');
  await expect(page.locator('#src-line-props')).toContainText('フォームで直せません');
});

test('migrator 手順 4 — package / cloud / database / folder で入れ子にした component 図でも、部品と入れ物に枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                         // 1
    'package "My Package" {',            // 2
    '  [First Component]',               // 3
    '}',                                 // 4
    'cloud "My Cloud" {',                // 5
    '  [Example 1]',                     // 6
    '}',                                 // 7
    'database "My Database" {',          // 8
    '  folder "My folder" {',            // 9
    '    [Folder 3]',                    // 10
    '  }',                               // 11
    '}',                                 // 12
    'artifact "My Artifact"',            // 13
    'queue "My Queue"',                  // 14
    '[First Component] --> [Example 1]', // 15
    '[Example 1] --> [Folder 3]',        // 16
    '@enduml',
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="component"]')).toHaveCount(3, { timeout: 20000 });
  for (const [label, type, line] of [
    ['First Component', 'component', '3'], ['Example 1', 'component', '6'], ['Folder 3', 'component', '10'],
    ['My Package', 'package', '2'], ['My Cloud', 'source-line', '5'], ['My Database', 'source-line', '8'],
    ['My folder', 'package', '9'], ['My Artifact', 'source-line', '13'], ['My Queue', 'source-line', '14'],
  ]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして枠が出る').toEqual({ type, line, hover: true });
  }
});

// BLK-migrator-20260923-1909 差し戻し 1 回目: 実物を開いて保存し終えた保存フォルダに中身の同じ図の組が
// あると、保存のたびに「保存の記録」の帯が図の上に出て図を下へ押す。当たり判定の層は図が余白 16px の
// 位置にあると決め打ちしていたので、帯の高さだけ上にずれ、次に開いた図で枠が出ない / 隣の枠が出た
// (migrator の実測で class-ex2 2/23、component-ex 3/25)。帯が図を押していても本人の枠が出ること。
// BLK-migrator-20260923-2312 差し戻し 1 回目: 前の図の帯が次の図を開いても出たままだと、縦に長い図の下の方が
// 画面の外へ押し出されてホバーが届かない (state-ex2 11/25)。保存時チェックの帯と同じく、次の図を開いたら引っ込む。
test('migrator 手順 4 — 前の図の保存の帯は次の図を開くと引っ込み、その図の保存で帯が出て図を押しても、部品と入れ物に本人の枠が出る', async ({ page }) => {
  const dir = dirFor(__filename) + '/band-shift';
  const abs = path.join(absDirFor(__filename), 'band-shift');
  fs.rmSync(abs, { recursive: true, force: true });
  fs.mkdirSync(abs, { recursive: true });
  // 前の周で「別名で保存」した結果、中身の同じ図が 2 枚ある保存フォルダ (migrator の out と同じ)。
  const twin = ['@startuml', 'class Twin', '@enduml', ''].join(String.fromCharCode(10));
  fs.writeFileSync(path.join(abs, 'twin-a.puml'), twin);
  fs.writeFileSync(path.join(abs, 'twin-b.puml'), twin);
  await bootWithSaveDir(page, dir);
  const openVia = async (file) => {
    await page.click('#btn-import');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file')]);
    await fc.setFiles(file);
  };
  const first = path.join(abs, 'first.puml');
  fs.writeFileSync(first, ['@startuml', 'class First', '@enduml', ''].join(String.fromCharCode(10)));
  await openVia(first);
  await expect(page.locator('#overlay-layer rect[data-type="class"]')).toHaveCount(1, { timeout: 20000 });
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-swap-overlay')).toBeVisible({ timeout: 15000 });

  const comp = path.join(abs, 'component-nested.puml');
  fs.writeFileSync(comp, [
    '@startuml',                         // 1
    'package "My Package" {',            // 2
    '  [First Component]',               // 3
    '}',                                 // 4
    'cloud "My Cloud" {',                // 5
    '  [Example 1]',                     // 6
    '}',                                 // 7
    'database "My Database" {',          // 8
    '  folder "My folder" {',            // 9
    '    [Folder 3]',                    // 10
    '  }',                               // 11
    '}',                                 // 12
    'artifact "My Artifact"',            // 13
    'queue "My Queue"',                  // 14
    '[First Component] --> [Example 1]', // 15
    '[Example 1] --> [Folder 3]',        // 16
    '@enduml', '',
  ].join(String.fromCharCode(10)));
  await openVia(comp);
  await expect(page.locator('#overlay-layer rect[data-type="component"]')).toHaveCount(3, { timeout: 20000 });
  // 前の図の帯は引っ込み、図は余白どおりの位置に戻る。
  await expect(page.locator('#save-swap-overlay')).toBeHidden();
  // BLK-builder-20260926-1010-1: 帯の無い図は余白 16px ではなく、右上のズーム帯のすぐ下 (帯の下端 + 4px) に置く。
  expect(await page.evaluate(() => document.getElementById('preview-svg').getBoundingClientRect().top
    - document.getElementById('zoom-hud').getBoundingClientRect().bottom)).toBeLessThan(20);
  // この図を保存すると帯がまた出て、図はその分だけ下へ押される (この状態で当たり判定が図に重なっていること)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-swap-overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#overlay-layer rect[data-type="component"]')).toHaveCount(3, { timeout: 20000 });
  const shift = await page.evaluate(() => {
    const s = document.getElementById('preview-svg').getBoundingClientRect();
    const o = document.getElementById('overlay-layer').getBoundingClientRect();
    return { svgTop: document.getElementById('preview-svg').offsetTop, dy: Math.round(o.top - s.top), dx: Math.round(o.left - s.left) };
  });
  expect(shift.svgTop, '帯が図を下へ押している').toBeGreaterThan(40);
  expect({ dx: shift.dx, dy: shift.dy }, '当たり判定の層の原点が図の原点と一致する').toEqual({ dx: 0, dy: 0 });
  for (const [label, type, line] of [
    ['First Component', 'component', '3'], ['Example 1', 'component', '6'], ['Folder 3', 'component', '10'],
    ['My Package', 'package', '2'], ['My Cloud', 'source-line', '5'], ['My Database', 'source-line', '8'],
    ['My folder', 'package', '9'], ['My Artifact', 'source-line', '13'], ['My Queue', 'source-line', '14'],
  ]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして本人の枠が出る').toEqual({ type, line, hover: true });
  }
});

// BLK-migrator-20260923-2012: participant 以外の宣言キーワード (actor / boundary / control / entity /
// database / collections / queue) で書かれた実物 (corpus seq-08・web sequence-ex / ex2) で、
// 参加者の見出しにホバーしても枠が出なかった。名前が図形の外に出る形でも、見出しの名前・下端の名前・
// 遅延で区切られたライフラインの下の区間に、その本人の枠だけが出ること。
test('migrator 手順 4 — actor〜queue で宣言した sequence 図でも、見出し・下端の名前・ライフラインに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                  // 1
    'actor "整備士" as User',                      // 2
    'boundary "診断ツールUI" as UI',               // 3
    'control "UDSサービス" as UDS',                // 4
    'entity "DTC情報" as DTC',                     // 5
    'database "EEPROM" as EE',                     // 6
    'collections "センサ群" as Sensors',           // 7
    'queue "CANメッセージキュー" as MQ',            // 8
    'User -> UI : 故障診断開始',                    // 9
    'UI -> UDS : ReadDTC',                         // 10
    '...',                                         // 11
    'UDS -> EE : read',                            // 12
    'Sensors -> MQ : push',                        // 13
    '@enduml',                                     // 14
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="participant"]')).toHaveCount(14, { timeout: 20000 });

  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(','));
  const names = [['整備士', '2'], ['診断ツールUI', '3'], ['UDSサービス', '4'], ['DTC情報', '5'],
    ['EEPROM', '6'], ['センサ群', '7'], ['CANメッセージキュー', '8']];
  for (const [name, line] of names) {
    // BLK-human-20260925-1500: PlantUML 1.2026.7 からシーケンス図の SVG に参加者の <g class> が無い。描かれた文字で探す。
    const texts = page.locator('#preview-svg svg text').filter({ hasText: new RegExp('^' + name + '$') });
    await expect(texts, name + ' は上下 2 か所に描かれる').toHaveCount(2);
    for (let k = 0; k < 2; k++) {
      const b = await texts.nth(k).boundingBox();
      // 右上のズーム帯 (#zoom-hud) が見出しに重なる位置は避け、名前の上で図の上に出ている点を指す。
      const pt = await page.evaluate((bb) => {
        for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
          const p = { x: bb.x + bb.width * fx, y: bb.y + bb.height / 2 };
          const e = document.elementFromPoint(p.x, p.y);
          if (e && e.closest('#overlay-layer')) return p;
        }
        return null;
      }, b);
      if (!pt) continue;
      await page.mouse.move(3, 3);
      await page.mouse.move(pt.x, pt.y);
      // 指した側 (頭か足) の枠だけが光る。離れたもう片方は光らない。
      await expect.poll(hovered, name + (k ? ' (下端)' : ' (見出し)') + ' にホバーして本人の枠が出る')
        .toBe('participant@' + line);
    }
  }

  // 遅延 (...) より下の区間のライフラインにも、そのライフラインの枠が出る。
  const ll = page.locator('#overlay-layer rect.selectable[data-type="lifeline"][data-id="User"]');
  const lb = await ll.boundingBox();
  const svgLine = await page.evaluate(() => {
    // ライフラインは `<g><title>表示名 (日本語は伏せ字)</title>…<line 点線/></g>`。User は左端の列。
    const cols = Array.from(document.querySelectorAll('#preview-svg svg g'))
      .filter((g) => Array.from(g.children).some((c) => c.tagName.toLowerCase() === 'title'))
      .flatMap((g) => Array.from(g.querySelectorAll('line')));
    const left = Math.min(...cols.map((l) => parseFloat(l.getAttribute('x1'))));
    const ls = cols.filter((l) => Math.abs(parseFloat(l.getAttribute('x1')) - left) < 0.5)
      .map((l) => l.getBoundingClientRect());
    return { top: Math.min(...ls.map((r) => r.top)), bottom: Math.max(...ls.map((r) => r.bottom)) };
  });
  expect(lb.y).toBeLessThanOrEqual(svgLine.top + 1);
  expect(lb.y + lb.height).toBeGreaterThanOrEqual(svgLine.bottom - 1);
  await page.mouse.move(3, 3);
  await page.mouse.move(lb.x + lb.width / 2, svgLine.bottom - 10);
  await expect.poll(hovered).toBe('lifeline@2');
});

// BLK-migrator-20260923-2012 差し戻し: web の実物 (puml-themes sequence-ex / ex2) で、長いメッセージが
// 横切るライフラインを文字も矢印も無い高さで指すとメッセージの枠が出た。題名 (`!if` の枝ごとの title) にも
// 枠が無かった。ライフラインの線の上はメッセージの文字・矢印の上だけをメッセージにし、題名は描かれた方の行を指す。
test('migrator 手順 4 — 長いメッセージが横切るライフラインと、!if の枝で書き分けた題名にも本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                  // 1
    '!if %variable_exists("$THEME")',             // 2
    'title Diag - $THEME theme',                  // 3
    '!else',                                      // 4
    'title Diag',                                 // 5
    '!endif',                                     // 6
    'actor A',                                    // 7
    'participant B',                              // 8
    'participant C',                              // 9
    'database D',                                 // 10
    'A -> D : go',                                // 11
    'D --> A : ok',                               // 12
    '@enduml',                                    // 13
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="lifeline"]')).toHaveCount(4, { timeout: 20000 });

  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(','));

  // B のライフラインの線の上で、A → D の箱の中だが文字も矢印も無い高さ / 矢印の線の高さ
  const pts = await page.evaluate(() => {
    // BLK-human-20260925-1500: PlantUML 1.2026.7 からライフラインは `<g><title>B</title>…<line/></g>`、メッセージは class の無い線。
    const lg = Array.from(document.querySelectorAll('#preview-svg svg g')).find((g) =>
      Array.from(g.children).some((c) => c.tagName.toLowerCase() === 'title' && c.textContent.trim() === 'B'));
    const ln = lg.querySelector('line').getBoundingClientRect();
    const msg = document.querySelector('#overlay-layer rect[data-type="message"][data-line="11"]').getBoundingClientRect();
    const arrow = Array.from(document.querySelectorAll('#preview-svg svg line')).find((l) =>
      !/dasharray/.test(l.getAttribute('style') || '')
      && Math.abs(parseFloat(l.getAttribute('x2')) - parseFloat(l.getAttribute('x1'))) > 30).getBoundingClientRect();
    const x = ln.left + ln.width / 2;
    let free = null;
    for (let y = msg.top + 1; y < arrow.top - 3; y += 1) {
      const e = document.elementFromPoint(x, y);
      if (e && e.getAttribute('data-type') === 'lifeline') { free = { x, y }; break; }
    }
    return { free, onArrow: { x, y: arrow.top + arrow.height / 2 } };
  });
  expect(pts.free, 'A → D の箱の中でも、B の線の上の空いた高さはライフラインに当たる').not.toBeNull();
  await page.mouse.move(3, 3);
  await page.mouse.move(pts.free.x, pts.free.y);
  await expect.poll(hovered).toBe('lifeline@8');
  await page.mouse.move(3, 3);
  await page.mouse.move(pts.onArrow.x, pts.onArrow.y);
  await expect.poll(hovered, '矢印の線の上はメッセージのまま').toBe('message@11');

  // 題名: 描かれている方 (!else の枝、5 行目) の枠が出て、押すとその行を直せる
  const title = page.locator('#preview-svg svg text', { hasText: /^Diag$/ }).first();
  const tb = await title.boundingBox();
  await page.mouse.move(3, 3);
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await expect.poll(hovered, '題名にホバーして枠が出る').toBe('title@5');
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  const field = page.locator('#seq-edit-title');
  await expect(field).toHaveValue('Diag');
  await field.fill('Diag v2');
  await field.press('Enter');
  await field.blur();
  await expect.poll(() => page.locator('#editor').inputValue().then((v) => v.split('\n').slice(2, 5)))
    .toEqual(['title Diag - $THEME theme', '!else', 'title Diag v2']);
});

// BLK-builder-20260926-1010-1: web の実物 (puml-themes sequence-ex) で、右上に浮くズーム帯 (#zoom-hud) の
// ボタンが図の上端に重なり、右上の header「Page Header」にホバーしても帯のボタンに当たって枠が出なかった。
// 図の上端は帯の下端より下に置き、header・右端の参加者の頭に実マウスで本人の枠が出る。
test('migrator 手順 4 — 図の右上の header と右端の参加者の頭は、ズーム帯の下に隠れずホバーで本人の枠が出る', async ({ page }) => {
  // migrator の計測と同じ画面の大きさ (図が幅に合わせて縮み、右上が帯の高さに来る)
  await page.setViewportSize({ width: 1600, height: 1000 });
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'themes-sequence-ex.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-src-kind="header"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  // 幅に合わせる (ファイルを開いたときと同じ倍率)。図の右端が帯の真下に来る
  await page.locator('#hud-zoom-fit').click();
  await page.waitForTimeout(300);

  const geo = await page.evaluate(() => {
    const hud = document.getElementById('zoom-hud').getBoundingClientRect();
    const svg = document.getElementById('preview-svg').getBoundingClientRect();
    return { hudBottom: hud.bottom, hudH: hud.height, svgTop: svg.top };
  });
  expect(geo.hudH, 'ズーム帯が出ている').toBeGreaterThan(0);
  expect(geo.svgTop, '図の上端はズーム帯の下端より下').toBeGreaterThanOrEqual(geo.hudBottom);

  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(','));
  for (const [label, want] of [['Page Header', 'source-line@14'], ['Alice', 'participant@']]) {
    const b = await page.locator('#preview-svg svg text').filter({ hasText: new RegExp('^' + label + '$') }).first().boundingBox();
    const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const top = await page.evaluate((q) => {
      const e = document.elementFromPoint(q.x, q.y);
      return e ? (e.closest('#zoom-hud') ? 'zoom-hud' : e.closest('#overlay-layer') ? 'overlay' : e.tagName + '#' + e.id + '.' + e.className + ' in ' + (e.parentElement && e.parentElement.id) + ' ' + (e.textContent || '').slice(0, 30)) : null;
    }, p);
    expect(top, label + ' の真上に帯のボタンが重ならない').toBe('overlay');
    await page.mouse.move(3, 3);
    await page.mouse.move(p.x, p.y);
    await expect.poll(hovered, label + ' にホバーして本人の枠が出る').toContain(want);
  }

  // `ref over Foo4, Foo5` (35 行目) の箱は塗りが無く、中を Foo4・Foo5 のライフラインが通って見える。
  // 箱の中のライフラインの線を指すとライフライン、箱の中の文字・札を指すと ref の行の枠が出る。
  const refBox = await page.locator('#overlay-layer rect[data-src-kind="ref"][data-line="35"]').boundingBox();
  const foo4 = await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('#overlay-layer rect[data-type="lifeline"][data-id="Foo4"]'))
      .map((e) => e.getBoundingClientRect()).sort((a, b) => b.height - a.height)[0];
    return { x: r.x + r.width / 2 };
  });
  expect(foo4.x).toBeGreaterThan(refBox.x);
  expect(foo4.x).toBeLessThan(refBox.x + refBox.width);
  await page.mouse.move(3, 3);
  await page.mouse.move(foo4.x, refBox.y + refBox.height * 0.6);
  await expect.poll(hovered, '塗りの無い ref の箱の中でもライフラインの線はライフライン').toContain('lifeline@');
  for (const label of ['ref', 'several lines']) {
    const b = await page.locator('#preview-svg svg text').filter({ hasText: new RegExp('^' + label + '$') }).first().boundingBox();
    await page.mouse.move(3, 3);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(hovered, 'ref の「' + label + '」を指すと ref の行の枠').toContain('source-line@35');
  }
});

// BLK-builder-20260925-1712-1: migrator の実物 7 枚 (seq-06 / seq-08 / dirty-04 …) で、ライフラインの上を矢印の線から
// 数 px 離れて指すと、その矢印のメッセージの枠が出た。1.2026.8 の SVG ではメッセージが線の上下 7px を丸ごと持っていた。
// 線の尾は描いた太さだけがメッセージ、それより離れたライフラインの上はライフライン。
test('migrator 手順 4 — 矢印の尾が付くライフラインを、線から少し離れて指すとライフラインの枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',          // 1
    'participant A',      // 2
    'participant B',      // 3
    'A -> B : req',       // 4
    'B --> A : ack',      // 5
    'A -> B : req2',      // 6
    '@enduml',            // 7
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="message"]')).toHaveCount(3, { timeout: 20000 });

  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(','));
  // A のライフラインの線 (点線) の x と、`req2` の矢印の線 (A の線から出る 3 本目の実線) の y
  const pts = await page.evaluate(() => {
    const lg = Array.from(document.querySelectorAll('#preview-svg svg g')).find((g) =>
      Array.from(g.children).some((c) => c.tagName.toLowerCase() === 'title' && c.textContent.trim() === 'A'));
    const ln = lg.querySelector('line').getBoundingClientRect();
    const arrows = Array.from(document.querySelectorAll('#preview-svg svg line')).filter((l) =>
      !/dasharray/.test(l.getAttribute('style') || '')
      && Math.abs(parseFloat(l.getAttribute('x2')) - parseFloat(l.getAttribute('x1'))) > 30)
      .map((l) => l.getBoundingClientRect()).sort((p, q) => p.top - q.top);
    const a = arrows[arrows.length - 1];
    return { x: ln.left + ln.width / 2, y: a.top + a.height / 2 };
  });
  const z = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox && svg.viewBox.baseVal;
    return vb && vb.height ? r.height / vb.height : 1;
  });
  for (const dy of [-5, 5]) {
    await page.mouse.move(3, 3);
    await page.mouse.move(pts.x, pts.y + dy * z);
    await expect.poll(hovered, `req2 の尾から ${dy}px のライフラインの上はライフライン`).toBe('lifeline@2');
  }
  await page.mouse.move(3, 3);
  await page.mouse.move(pts.x, pts.y);
  await expect.poll(hovered, '矢印の線の上はメッセージのまま').toBe('message@6');
});

// BLK-migrator-20260924-0012: web の実物 (puml-themes の usecase-ex / ex2 / with-actorstyle-ex) で、ユースケース図の
// 要素にホバーしても枠がほとんど出なかった。略記だけの図はシーケンス図と判定され、パッケージの中の要素は
// 修飾名で描かれるので当たらず、フォームが読めない略記・題・凡例には枠が無かった。
test('migrator 手順 4 — 略記・パッケージ・凡例の混ざったユースケース図でも、ホバーした要素の行に枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                              // 1
    'title Usecase Diagram',                  // 2
    'skinparam actorStyle awesome',           // 3
    ':User: --> (Use)',                       // 4
    '"Use the application" as (Use)',         // 5
    'package Professional {',                 // 6
    '  actor "Food Critic" as fc',            // 7
    '}',                                      // 8
    'rectangle Restaurant {',                 // 9
    '  usecase "Eat Food" as UC1',            // 10
    '}',                                      // 11
    'fc --> UC1',                             // 12
    'legend',                                 // 13
    'my legend',                              // 14
    'endlegend',                              // 15
    '@enduml',                                // 16
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="usecase"]')).toHaveCount(1, { timeout: 20000 });

  for (const [label, type, line] of [
    ['Usecase Diagram', 'source-line', '2'],
    ['User', 'source-line', '4'],
    ['Use the application', 'source-line', '4'],
    ['Food Critic', 'actor', '7'],
    ['Eat Food', 'usecase', '10'],
    ['Restaurant', 'package', '9'],
    ['my legend', 'source-line', '13'],
  ]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして枠が出る').toEqual({ type, line, hover: true });
  }
});

// BLK-migrator-20260923-2312: state 図は宣言の数と SVG の図形の数を突き合わせて当てていたので、
// 宣言の無い状態・choice / fork / join・`->` / `--->` の遷移が 1 つ混ざるだけで枠がほぼ全滅した。
// PlantUML が SVG に残す要素情報で当て、どの要素にホバーしても本人の枠が出る。
test('migrator 手順 4 — 宣言の無い状態・choice / fork / join・`->` の混ざった state 図でも、全要素に本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'state-svgmap-' + n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  // 描画の後から枠が作り直されると、その前に付いたホバーの印は消える。印が無ければ置き直す。
  const hoverAndRead = async (t) => {
    const r = page.locator('#overlay-layer rect.hit-hover').first();
    for (let k = 0; k < 3; k++) {
      await hoverTarget(t);
      try { await expect(r).toHaveCount(1, { timeout: 1500 }); break; } catch (e) {
        if (k === 2) {
          const dbg = await page.evaluate((a) => {
            const el = document.querySelector('#preview-svg svg').querySelectorAll(a.sel)[a.i];
            const b = el.getBoundingClientRect();
            const x = b.left + b.width / 2, y = b.top + b.height / 2;
            return JSON.stringify({ x, y, vw: innerWidth, vh: innerHeight, top: document.elementsFromPoint(x, y).slice(0, 4).map((n) => n.tagName + '#' + n.id + '.' + (n.getAttribute('class') || '') + ':' + (n.getAttribute('data-id') || '')) });
          }, { sel: SEL, i: t.i });
          throw new Error(t.what + ' にホバーして枠が出ない ' + dbg);
        }
      }
    }
    await expect(r, t.what + ' にホバーして枠が出る').toHaveCount(1);
    return (await r.getAttribute('data-type')) + ':' + (await r.getAttribute('data-id'));
  };
  // SVG の要素 (状態の <g>・遷移のラベル・fork/join の棒)。図が縦に長いと下端はプレビューの外なので、
  // 1 つずつ見える所まで送ってから、その中心にマウスを置く。
  const SEL = 'g.entity[data-qualified-name] > rect, g.entity[data-qualified-name] > polygon, g.start_entity > ellipse, g.end_entity > ellipse, g.link text, rect[fill="#555555"], rect[fill="#555"]';
  const targets = () => page.evaluate((sel) => {
    const svg = document.querySelector('#preview-svg svg');
    const seen = new Set();
    const out = [];
    svg.querySelectorAll(sel).forEach((el, i) => {
      const g = el.closest('g.entity, g.start_entity, g.end_entity');
      let what;
      if (el.closest('g.link')) what = 'label:' + el.textContent.trim();
      else if (g) what = g.getAttribute('data-qualified-name');
      else what = 'bar' + out.filter((o) => o.what.indexOf('bar') === 0).length;
      if (g && seen.has(g)) return;
      if (g) seen.add(g);
      out.push({ what, i });
    });
    return out;
  }, SEL);
  const hoverTarget = async (t) => {
    const b = await page.evaluate((a) => {
      const el = document.querySelector('#preview-svg svg').querySelectorAll(a.sel)[a.i];
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, { sel: SEL, i: t.i });
    await page.mouse.move(3, 3);
    await page.mouse.move(b.x, b.y);
  };

  // BLK の最小再現: 宣言の無い状態と、複合状態の子
  await typeDsl(page, fx('minimal'));
  await expect(page.locator('#overlay-layer rect[data-type="transition"][data-id="__t_3"]').first()).toBeAttached({ timeout: 20000 });
  const want1 = {
    State1: 'state:State1', State2: 'state:State2', 'State3.Sub1': 'state:State3.Sub1', 'State3.Sub2': 'state:State3.Sub2',
    '.start.': 'pseudo:start@', 'State3..start.State3': 'pseudo:start@State3', 'label:event1': 'transition:__t_1',
  };
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  for (const t of await targets()) {
    if (!want1[t.what]) continue;
    expect(await hoverAndRead(t), t.what).toBe(want1[t.what]);
  }

  // choice / fork / join / 名前付き終了、`--->` と `->`
  await typeDsl(page, fx('pseudo'));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="join2"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="transition"][data-id="__t_7"]').first()).toBeAttached();
  // 図種の切替などで出る通知 (#ma-toast) は下端の要素を覆うので、消えてから指す。
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  const got = {};
  for (const t of await targets()) {
    got[t.what] = await hoverAndRead(t);
  }
  expect(got.choice1).toBe('state:choice1');
  expect(got.end3).toBe('state:end3');
  expect(got.Worker1).toBe('state:Worker1');
  expect(got.Worker2).toBe('state:Worker2');
  expect([got.bar0, got.bar1].sort()).toEqual(['state:fork1', 'state:join2']);
  expect(got['label:[ok]']).toBe('transition:__t_1');
  expect(got['label:[ng]']).toBe('transition:__t_2');
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-migrator-20260923-2312 差し戻し 1 回目: state 図の題 (title) にホバーしても枠が出ない / 下の枠が出た。
// class / component と同じく、題にも本文の title 行を指す枠が出る。
test('migrator 手順 4 — 題のある state 図で、題にホバーすると title 行を指す枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',
    "'skinparam BackgroundColor transparent",
    'title State Diagram',
    '[*] --> State1',
    'State1 --> Active',
    'state Active {',
    '  [*] -> NumLockOff',
    '  NumLockOff --> NumLockOn : EvNumLockPressed',
    '}',
    '@enduml',
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="State1"]')).toHaveCount(1, { timeout: 20000 });
  const { hit } = await hoverHit(page, 'State Diagram');
  expect(hit, '題にホバーして title 行の枠が出る').toEqual({ type: 'source-line', line: '3', hover: true });
  const s1 = await hoverHit(page, 'State1');
  expect(s1.hit, 'State1 は今までどおり本人の枠').toEqual({ type: 'state', line: '4', hover: true });
});

// BLK-builder-20260925-1712-2: 新記法のアクティビティ図で、合流の菱形 (endif / endswitch)・repeat の入口の菱形・end fork の棒に
// 枠が出なかった (本文の節点は開きの行にしか無い)。開きと閉じを対にして閉じの図形を探し、閉じの行を指す枠を置く。
test('migrator 手順 4 — 新記法のアクティビティ図の合流の菱形・repeat の入口・end fork の棒に、閉じの行の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'v1-2026-8-act-closers.puml'), 'utf8').replace(/\r\n/g, '\n');
  await typeDsl(page, dsl);
  const lines = dsl.split('\n');
  const lineOf = (re) => String(lines.findIndex((l) => re.test(l.trim())) + 1);
  await expect(page.locator('#overlay-layer rect.selectable[data-type="fork"]')).toHaveCount(1, { timeout: 20000 });
  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-line')).join(','));
  // 文字の無い小さい菱形 (上から endif の合流・endswitch の合流・repeat の入口) と、棒 (上から fork・end fork)
  const shapes = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    // 図の下端 (end fork の棒) が画面の下の帯に隠れないよう、図の中ほどを画面の中央に寄せる
    const rs = Array.from(svg.querySelectorAll('rect')).filter((r) => parseFloat(r.getAttribute('height')) < 12);
    if (rs.length) rs[rs.length - 1].scrollIntoView({ block: 'center' });
    const ds = Array.from(svg.querySelectorAll('polygon')).map((p) => p.getBoundingClientRect())
      .filter((b) => b.width >= 20 && b.width <= 30 && b.height >= 20 && b.height <= 30).sort((a, b) => a.top - b.top);
    const bars = Array.from(svg.querySelectorAll('rect')).filter((r) => parseFloat(r.getAttribute('height')) < 12)
      .map((r) => r.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const c = (b) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
    // 棒は中央に矢印の線が付くので、左端寄りを指す
    return { ds: ds.map(c), bars: bars.map((b) => ({ x: b.left + 8, y: b.top + b.height / 2 })) };
  });
  expect(shapes.ds.length).toBe(3);
  expect(shapes.bars.length).toBe(2);
  const want = [
    [shapes.ds[0], lineOf(/^endif$/), 'endif の合流'],
    [shapes.ds[1], lineOf(/^endswitch$/), 'endswitch の合流'],
    [shapes.ds[2], lineOf(/^repeat$/), 'repeat の入口'],
    [shapes.bars[1], lineOf(/^end fork$/), 'end fork の棒'],
  ];
  for (const [pt, line, what] of want) {
    await page.mouse.move(3, 3);
    await page.mouse.move(pt.x, pt.y);
    await expect.poll(hovered, what + 'にホバーすると、その行の枠').toBe(line);
  }
});

// BLK-migrator-20260929-0951: split / end split の棒は fork の棒 (塗った細い rect) と違い、横の <line> 1 本で描かれ、
// どこにホバーしても枠が出なかった。棒は描いた横線から拾い、上の棒は split の行、下の棒は end split の行を指す。
test('migrator 手順 4 — アクティビティ図の split の分岐の棒・end split の合流の棒の左端・中央・右端に枠が出て、押すとその行が選ばれる', async ({ page }) => {
  await bootPlain(page);
  const dsl = ['@startuml', 'start', 'split', '  :a;', 'split again', '  :b;', 'end split', 'stop', '@enduml'].join('\n');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect.selectable[data-type="fork"]')).toHaveCount(1, { timeout: 20000 });
  const bars = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    return Array.from(svg.querySelectorAll('line'))
      .filter((l) => l.getAttribute('y1') === l.getAttribute('y2') && /stroke-width:1\.5/.test(l.getAttribute('style') || ''))
      .map((l) => l.getBoundingClientRect()).sort((a, b) => a.top - b.top)
      .map((b) => ({ l: b.left + 2, c: b.left + b.width / 2, r: b.right - 2, y: b.top + b.height / 2 }));
  });
  expect(bars.length, 'split の棒 2 本 (分岐・合流) が横線で描かれている').toBe(2);
  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-line')).join(','));
  for (const [bar, line, what] of [[bars[0], '3', 'split の分岐の棒'], [bars[1], '7', 'end split の合流の棒']]) {
    for (const x of [bar.l, bar.c, bar.r]) {
      await page.mouse.move(3, 3);
      await page.mouse.move(x, bar.y);
      await expect.poll(hovered, what + ' (x=' + Math.round(x) + ') にホバーすると、その行の枠').toBe(line);
    }
  }
  const caretLine = () => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(0, ed.selectionStart).split('\n').length;
  });
  await page.mouse.click(bars[0].l, bars[0].y);
  await expect.poll(caretLine, '分岐の棒を押すと split の行').toBe(3);
  await page.mouse.click(3, 3);
  await page.mouse.click(bars[1].l, bars[1].y);
  await expect.poll(caretLine, '合流の棒を押すと end split の行').toBe(7);
});

// BLK-migrator-20260929-0951 追記: `repeat :検証;` (repeat 行に処理) の箱・文字・戻りの矢印と、色付きレーン `|#色|B|` へ
// 移る矢印の縦 5px の区間に枠が出なかった。矢印の線の中点・矢じりの中心のどこを指しても枠が出て、箱を押すと repeat の行。
test('migrator 手順 4 — repeat 行に処理を書いた repeat の箱・戻りの矢印と、色付きレーンへ移る矢印の全区間に枠が出る', async ({ page }) => {
  await bootPlain(page);
  const gaps = () => page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const out = [];
    const pts = [];
    svg.querySelectorAll('line').forEach((l) => {
      if (!/stroke-width:1;/.test(l.getAttribute('style') || '')) return;
      const b = l.getBoundingClientRect();
      if (b.width + b.height < 1) return;
      pts.push(['line', b.left + b.width / 2, b.top + b.height / 2]);
    });
    svg.querySelectorAll('polygon').forEach((p) => {
      if ((p.getAttribute('points') || '').split(',').length !== 8) return;
      const b = p.getBoundingClientRect();
      pts.push(['head', b.left + b.width / 2, b.top + b.height / 2]);
    });
    for (const [k, x, y] of pts) {
      const hit = document.elementsFromPoint(x, y).find((e) => e.closest && e.closest('#overlay-layer [data-type]'));
      if (!hit) out.push(k + '@' + Math.round(x) + ',' + Math.round(y));
    }
    return out;
  });
  const caretLine = () => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(0, ed.selectionStart).split('\n').length;
  });

  await typeDsl(page, ['@startuml', 'start', 'repeat :検証;', '  :ログ出力;', 'repeat while (エラー?)', 'stop', '@enduml'].join('\n'));
  await expect(page.locator('#overlay-layer rect.selectable[data-src-kind="loop"]')).toHaveCount(1, { timeout: 20000 });
  expect(await gaps(), 'repeat :検証; の図で枠の出ない矢印').toEqual([]);
  const box = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('#preview-svg svg text')).find((n) => n.textContent.trim() === '検証');
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-line')).join(',')), '「検証」にホバーすると repeat の行の枠').toBe('3');
  await page.mouse.click(box.x, box.y);
  await expect.poll(caretLine, '「検証」を押すと repeat の行').toBe(3);

  await typeDsl(page, ['@startuml', '|A|', 'start', ':a;', '|#LightGray|B|', ':x;', 'stop', '@enduml'].join('\n'));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="swimlane"]')).toHaveCount(2, { timeout: 20000 });
  expect(await gaps(), '色付きレーンの図で枠の出ない矢印').toEqual([]);
});

// BLK-migrator-20260926-2118: 単純な if / else の、枝から合流へ「下へ → 横へ」折れる矢印の縦の区間 (と、菱形から枝へ
// 「横へ → 下へ」の横の区間) にホバーしても枠が出なかった。1 本の矢印の全区間に同じ枠を置き、どの区間を指しても矢印全体が光る。
test('migrator 手順 4 — 単純な if / else の折れた矢印は、どの区間を指しても枠が出て、その矢印の全区間が光る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'activity-2118-if-else.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-type="action"]')).toHaveCount(3, { timeout: 20000 });
  // 線分 (長さ 0 を除く) の中点を画面の座標で。上から順。
  const segs = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    return Array.from(svg.querySelectorAll('line')).map((l) => {
      const len = l.getTotalLength();
      if (!(len > 1)) return null;
      const p = l.getPointAtLength(len / 2);
      const q = new DOMPoint(p.x, p.y).matrixTransform(l.getScreenCTM());
      return { x: q.x, y: q.y, key: ['x1', 'y1', 'x2', 'y2'].map((a) => Math.round(+l.getAttribute(a))).join(',') };
    }).filter(Boolean);
  });
  expect(segs.length).toBe(11);
  const got = {};
  for (const s of segs) {
    await page.mouse.move(3, 3);
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(100);
    got[s.key] = await page.evaluate((p) => {
      const r = document.elementsFromPoint(p.x, p.y).find((e) => e.tagName.toLowerCase() === 'rect' &&
        e.closest('#overlay-layer') && !/overlay-background/.test(e.getAttribute('class') || ''));
      if (!r) return null;
      const lit = Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'));
      return { type: r.getAttribute('data-type'), line: r.getAttribute('data-line'), lit: lit.length,
        same: lit.every((e) => e.getAttribute('data-id') === r.getAttribute('data-id')) };
    }, s);
  }
  for (const s of segs) expect(got[s.key] && got[s.key].type, s.key + ' の中点に流れの枠').toBe('flow');
  // yes 側・no 側の縦の線は各枝 (4 行目 a / 6 行目 b) から合流への矢印で、縦と横の 2 区間が一緒に光る
  expect(got['29,124,29,142']).toEqual({ type: 'flow', line: '4', lit: 2, same: true });
  expect(got['103,124,103,142']).toEqual({ type: 'flow', line: '6', lit: 2, same: true });
  // 菱形から枝への横の区間も、その枝の矢印 (if の行の後 = 3 行目)
  expect(got['39,67,29,67']).toEqual({ type: 'flow', line: '3', lit: 2, same: true });
  // yes 側の縦の線を押すと、その枝の末尾 (a の後) が既定の挿入位置になる
  const yes = segs.find((s) => s.key === '29,124,29,142');
  await page.mouse.click(yes.x, yes.y);
  await expect(page.locator('#ac-ins-point')).toBeVisible();
  await expect(page.locator('#ac-ins-point option:checked')).toContainText('(L4)');
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-migrator-20260924-0752: 旧記法 (`(*) -->` / `if "..." then` / `===LABEL===`) のアクティビティ図で枠が全滅していた。
// PlantUML が関係に残す行と線のつながりで当て、押すと本文のその行が選ばれてフォーム未対応と出る。
// 新記法でも、レーンをまたぐ動作は箱の中の文字で当て、レーンの見出しにも枠が出る。
test('migrator 手順 4 — 旧記法のアクティビティ図でも、開始・動作・分岐・枝のラベル・同期バーに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                  // 1
    '(*) --> "Action1"',          // 2
    'if "cond?" then',            // 3
    '->[yes] "Action2"',          // 4
    '--> ===LABEL===',            // 5
    'else',                       // 6
    '-->[no] ===LABEL===',        // 7
    'endif',                      // 8
    '--> (*)',                    // 9
    '@enduml',
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-src-kind="shape"]')).toHaveCount(3, { timeout: 20000 });
  for (const [label, line] of [['Action1', '2'], ['Action2', '4'], ['cond?', '3'], ['yes', '4'], ['no', '7']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして枠が出る').not.toBeNull();
    expect(hit.line, label + ' の枠が指す行').toBe(line);
    expect(hit.hover, label + ' の枠が光る').toBe(true);
  }
  const { box } = await hoverHit(page, 'Action2');
  await page.mouse.click(box.x, box.y);
  await expect(page.locator('#src-line-props')).toHaveAttribute('data-line', '4');
  await expect(page.locator('#src-line-text')).toHaveText('->[yes] "Action2"');
  await expect(page.locator('#src-line-props')).toContainText('フォームで直せません');
});

test('migrator 手順 4 — レーンをまたぐ新記法のアクティビティ図でも、動作とレーンの見出しに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',          // 1
    'skinparam roundcorner 0', // 2
    '|Swimlane1|',        // 3
    'start',              // 4
    ':foo1;',             // 5
    '|Swimlane2|',        // 6
    ':foo2;',             // 7
    ':foo3;',             // 8
    '|Swimlane1|',        // 9
    ':foo4;',             // 10
    'stop',               // 11
    '@enduml',
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="action"]')).toHaveCount(4, { timeout: 20000 });
  for (const [label, type, line] of [['foo1', 'action', '5'], ['foo2', 'action', '7'], ['foo3', 'action', '8'],
    ['foo4', 'action', '10'], ['Swimlane2', 'swimlane', '6']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして本人の枠が出る').toEqual({ type, line, hover: true });
  }
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-migrator-20260924-2232: 題 (title) と sprite を使う新記法のアクティビティ図 (web/plantuml の svg-sprites 系 5 枚と同型)。
// 題の文字と矢印 (矢じり) に枠が出なかった。題は SVG に残る行で、矢印は矢じりの先の要素から「その前の行の後」の流れで当てる。
// 流れを押すと、右欄の「＋ ここに挿入」がその矢印の上 (= 前の行の後) を既定にする。
test('migrator 手順 4 — 題と sprite のある新記法のアクティビティ図でも、題・動作・矢じりに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'activity-2232-title-sprite.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-type="action"]')).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="flow"]')).toHaveCount(2);
  for (const [label, type, line] of [
    ['Transform Translate Test', 'source-line', '10'],
    ['The blue circle (with translate) should appear at 40,50', 'action', '11'],
    ['The red circle (without translate) should appear at 10,10', 'action', '12'],
  ]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして本人の枠が出る').toEqual({ type, line, hover: true });
  }
  // 矢じり (4 点の polygon) の中心を実マウスで指す。上から順に 11 の後・12 の後の流れ。
  const heads = await page.evaluate(() => Array.prototype.filter.call(
    document.querySelectorAll('#preview-svg svg polygon'),
    (p) => (p.getAttribute('points') || '').trim().split(/[\s,]+/).length === 8)
    .map((p) => { const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
    .sort((a, b) => a.y - b.y));
  expect(heads.length).toBe(2);
  const got = [];
  for (const h of heads) {
    await page.mouse.move(3, 3);
    await page.mouse.move(h.x, h.y);
    await page.waitForTimeout(150);
    got.push(await page.evaluate((p) => {
      const r = document.elementsFromPoint(p.x, p.y).find((e) => e.tagName.toLowerCase() === 'rect' &&
        e.closest('#overlay-layer') && !/overlay-background/.test(e.getAttribute('class') || ''));
      return r ? [r.getAttribute('data-type'), r.getAttribute('data-line'), /hit-hover/.test(r.getAttribute('class') || '')] : null;
    }, h));
  }
  expect(got).toEqual([['flow', '11', true], ['flow', '12', true]]);
  // 2 本目の矢印を押すと、その矢印の上に足す位置 (12 行目の動作の後) が既定になる
  await page.mouse.click(heads[1].x, heads[1].y);
  await expect(page.locator('#ac-ins-point')).toBeVisible();
  await expect(page.locator('#ac-ins-point option:checked')).toContainText('(L12)');
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-migrator-20260924-0637: AWS アイコンの手続き (`WorkDocs(...)` など) で部品を宣言した図は、DSL に見えるのが
// `actor` と `-->` だけなのでシーケンス図と読まれ、枠が 1 つも出なかった (「⚠ Overlay マッチング失敗」)。
// 手続きの中身は読まず、PlantUML が SVG に残した図種で読み直す。行き先の部品に食い込む矢じりの上では関係が出る。
test('migrator 手順 4 — 手続きで部品を宣言した図 (DSL は actor と --> だけ) でも、部品・関係・矢じりに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'aws-procedure-parts.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-type="relation"][data-hit-kind="link"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();

  for (const [label, line] of [['Person', '16'], ['Desktop', '17'], ['Storage', '18'], ['[S3]', '18']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして本人の行の枠が出る').toEqual(expect.objectContaining({ line, hover: true }));
  }

  // 矢じりの中心 → 行き先の部品ではなくその関係の行
  const heads = await page.evaluate(() => Array.prototype.map.call(
    document.querySelectorAll('#preview-svg svg g.link polygon'), (p) => {
      const r = p.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }));
  expect(heads.length).toBe(2);
  for (const [i, line] of [[0, '20'], [1, '21']]) {
    await page.mouse.move(3, 3);
    await page.mouse.move(heads[i].x, heads[i].y);
    const hot = page.locator('#overlay-layer rect.hit-hover').first();
    await expect(hot).toHaveAttribute('data-type', 'relation');
    await expect(hot).toHaveAttribute('data-line', line);
  }

  // 押すと本文の行が選ばれる (部品は宣言した手続きの呼び出し行)
  const { box } = await hoverHit(page, 'Storage');
  await page.mouse.click(box.x, box.y);
  await expect.poll(() => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(0, ed.selectionStart).split('\n').length;
  })).toBe(18);
});

// BLK-migrator-20260924-1132: C4_Sequence の手続き (Container / Component / ContainerDb / *_Boundary / Rel) だけで
// 書いた sequence 図は、参加者の頭もメッセージも class の無い図形で描かれ、枠が 1 つも出なかった (0/25)。
// 手続きの名前は覚えず、呼び出しの形と描かれた表示名・矢じりの付いた横線で当てる。
test('migrator 手順 4 — C4 の手続きだけで書いた sequence 図でも、参加者・囲み・メッセージに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'c4-sequence-procedure.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);

  // 参加者 4 + 囲み 1 (名札の帯)、メッセージ 3。
  await expect(page.locator('#overlay-layer rect[data-type="participant"]')).toHaveCount(5, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(3);
  await expect(page.locator('#overlay-warning')).toBeHidden();

  // 図が横に長いので幅に合わせ、右端の参加者もプレビューの中に入れてから指す。
  await page.locator('#hud-zoom-fit').click();
  await page.waitForTimeout(400);
  const expectHit = async (label, type, line) => {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' に枠').not.toBeNull();
    expect(hit.type, label).toBe(type);
    expect(hit.line, label).toBe(String(line));
  };
  await expectHit('Single-Page Application', 'participant', 4);
  await expectHit('Sign In Controller', 'participant', 6);
  await expectHit('Security Component', 'participant', 7);
  await expectHit('[JSON/HTTPS]', 'message', 12);
  await expectHit('isAuthenticated()', 'message', 13);
  await expectHit('[JDBC]', 'message', 14);
});

// BLK-migrator-20260924-1332: C4 の手続きの sequence 図に alt / loop / ref / == 区切り == / ... 遅延 ... が混ざると
// 枠がほぼ全滅し (4/25)、「Overlay マッチング失敗」の帯が出た。斜めの線 ($rel="->(39)") と枠の線で本数が合わず、
// 全部のメッセージを諦めていた。枠・区切り・遅延を先に見分け、メッセージは線の上の文字の文言で当てる。
test('migrator 手順 4 — C4 手続きの sequence に alt / loop / ref / 区切り / 遅延が混ざっても、参加者・メッセージ・枠に本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'c4-sequence-frames.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);

  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(9, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();

  // 縦に長い図なので、指す文字をプレビューの中へ送ってから指す。
  const expectHit = async (label, type, line) => {
    await page.evaluate((l) => {
      const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'), (n) => (n.textContent || '').trim() === l);
      if (t) t.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, label);
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' に枠').not.toBeNull();
    expect(hit.type, label).toBe(type);
    expect(hit.line, label).toBe(String(line));
  };
  await expectHit('Alice', 'participant', 81);
  await expectHit('Bob', 'participant', 83);
  await expectHit('Request', 'message', 88);
  await expectHit('Accepted', 'message', 91);
  await expectHit('DNS', 'message', 94);
  await expectHit('hello', 'message', 100);
  await expectHit('[successful case]', 'group', 90);
  await expectHit('init', 'source-line', 98);
  await expectHit('Initialization', 'source-line', 107);
  await expectHit('5 minutes later', 'source-line', 117);
  await expectHit('phone', 'message', 119);
});

// BLK-builder-20260925-1552-3: ふつうの sequence 図 (参加者・メッセージに class が付く SVG) では、ref over の箱・
// == 区切り ==・... 遅延 ... に枠が 1 つも出ず、ref の札「ref」はライフラインの上にあってライフラインの枠が出ていた
// (corpus の seq-16 / seq-17、web の sequence-ex / S3 Upload Workflow)。描かれた形から見分けて書かれた行を指す。
test('migrator 手順 4 — ふつうの sequence 図の ref の箱・区切り・遅延にホバーすると、その行を指す枠が出る', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'seq-ref-divider-delay.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);

  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();

  const expectHit = async (label, type, line) => {
    await page.evaluate((l) => {
      const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'), (n) => (n.textContent || '').trim() === l);
      if (t) t.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, label);
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' に枠').not.toBeNull();
    expect(hit.type, label).toBe(type);
    expect(hit.line, label).toBe(String(line));
  };
  await expectHit('初期化フェーズ', 'source-line', 4);
  await expectHit('Start()', 'message', 5);
  await expectHit('ref', 'source-line', 6);
  await expectHit('初期化シーケンス(別図参照)', 'source-line', 6);
  await expectHit('六角形メモ', 'note', 7);
  await expectHit('Some', 'source-line', 8);
  await expectHit('[成功]', 'group', 9);
  await expectHit('複数行の', 'source-line', 14);
  await expectHit('Ready', 'message', 19);

  // 選ぶと右欄に書かれた行が出る (フォームで直せない記法として黙らない)。
  const at = await page.evaluate(() => {
    const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'), (n) => (n.textContent || '').trim() === '初期化フェーズ');
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#src-line-text')).toHaveText('== 初期化フェーズ ==');
});

// BLK-builder-20260925-0305-1: `!pragma layout smetana` の SVG は線に行の情報を付けず、関連クラス `(A, B) . C` が
// あると A→B の線は名前の無い中継点で 2 本に割れる。線を並び順で当てていたので矢じりの側の線に枠が無く、
// 矢じりを指すと行き先のクラスの枠が出ていた (web/plantuml の group2712 の 4 枚、枠が 21〜43px ずれる)。
// 線の両端 (data-entity-1 / -2) で当て、`-down->` のような置き方の指示付きの矢印も関係として読む。
for (const name of ['down', 'left']) {
  test('migrator 手順 4 — smetana と関連クラスの class 図 (' + name + ') でも、矢じり・クラス・関連クラスの点線に本人の枠が出る', async ({ page }) => {
    await bootPlain(page);
    const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'class-0305-assoc-' + name + '.puml'), 'utf8')
      .replace(/\r\n/g, '\n').replace(/\n+$/, '');
    await typeDsl(page, dsl);
    await expect(page.locator('#overlay-layer rect[data-type="relation"][data-hit-kind="linkhead"]')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('#overlay-warning')).toBeHidden();

    for (const [label, line] of [['annotation', '5'], ['dog', '6'], ['chases', '7']]) {
      const { hit } = await hoverHit(page, label);
      expect(hit, label + ' にホバーして本人の行の枠が出る').toEqual({ type: 'class', line, hover: true });
    }

    // 矢じりの中心 → 行き先の dog ではなく chases -name-> dog の行 (9 行目)。光る枠 (中継点の両側を 1 つに
    // 囲む関係の枠) は矢じりを含む (migrator の計測で「ずれ」にならない)。
    const head = await page.evaluate(() => {
      const r = document.querySelector('#preview-svg svg g.link polygon').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    });
    await page.mouse.move(3, 3);
    await page.mouse.move(head.x, head.y);
    const hot = page.locator('#overlay-layer rect.hit-hover').first();
    await expect(hot).toHaveAttribute('data-type', 'relation');
    await expect(hot).toHaveAttribute('data-line', '9');
    const fb = await hot.boundingBox();
    const hw = head.w / 2, hh = head.h / 2;
    expect(fb.x - 1 <= head.x - hw && fb.y - 1 <= head.y - hh &&
      fb.x + fb.width + 1 >= head.x + hw && fb.y + fb.height + 1 >= head.y + hh, '光る枠が矢じりを含む').toBe(true);

    // 関連クラスの点線 (中継点 → annotation) の中ほど → (chases, dog) . annotation の行 (10 行目)
    const dash = await page.evaluate(() => {
      const p = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg g.link path'),
        (e) => /dasharray/.test(e.getAttribute('style') || ''));
      const len = p.getTotalLength();
      const pt = p.getPointAtLength(len / 2);
      const m = p.getScreenCTM();
      return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
    });
    await page.mouse.move(3, 3);
    await page.mouse.move(dash.x, dash.y);
    await expect(page.locator('#overlay-layer rect.hit-hover').first()).toHaveAttribute('data-line', '10');
  });
}

// BLK-builder-20260925-0314-1: 日本語の名前 (PlantUML は SVG の名前を `.....` に伏せる)・`create` した参加者
// (頭が途中に裸の箱で描かれる)・別名と表示名の違う参加者の帯・teoz の `&` で並べたメッセージで、
// 参加者やメッセージに枠が出ず「⚠ Overlay マッチング失敗」が出ていた (corpus の dirty-01 / seq-11 / seq-12、web の teoz)。
test('migrator 手順 4 — 日本語の名前・create した参加者・teoz の並んだメッセージでも、本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(','));
  async function hoverText(name, nth) {
    const t = page.locator('#preview-svg svg text', { hasText: name }).nth(nth || 0);
    const b = await t.boundingBox();
    expect(b, name + ' が描かれている').not.toBeNull();
    await page.mouse.move(3, 3);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  }

  // 1. 日本語の名前の参加者と、その名前を使うメッセージ
  await typeDsl(page, [
    '@startuml',                         // 1
    'participant App',                   // 2
    'participant センサ制御',            // 3
    'App -> センサ制御 : Init()',        // 4
    'センサ制御 --> App : E_OK',         // 5
    '@enduml',                           // 6
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  await hoverText('センサ制御', 0);
  await expect.poll(hovered, 'センサ制御 の見出しにホバー').toBe('participant@3');
  await hoverText('Init()');
  await expect.poll(hovered, 'Init() にホバー').toBe('message@4');

  // 2. create した参加者の途中の頭と、別名と表示名の違う参加者の帯
  await typeDsl(page, [
    '@startuml',                                   // 1
    'participant Factory',                         // 2
    'participant "Session Manager" as SM',         // 3
    'Factory -> SM ++ : open()',                   // 4
    'SM --> Factory -- : handle',                  // 5
    'create participant "Instance" as Inst',       // 6
    'Factory -> Inst : new(config)',               // 7
    'Inst --> Factory : ok',                       // 8
    '@enduml',                                     // 9
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="participant"][data-id="Inst"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  await hoverText('Instance', 0);
  await expect.poll(hovered, '途中に描かれた Instance の頭にホバー').toBe('participant@6');

  // 3. teoz の `&` で並べたメッセージ (class の無い SVG)
  await typeDsl(page, [
    '@startuml',                          // 1
    '!pragma teoz true',                  // 2
    'Alice -> Bob : hello',               // 3
    '& Bob -> Charlie : hi',              // 4
    '@enduml',                            // 5
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  await hoverText('hi');
  await expect.poll(hovered, '並んだメッセージ hi にホバー').toBe('message@4');
  await hoverText('Charlie', 0);
  await expect.poll(hovered, 'Charlie の見出しにホバー').toBe('participant@4');
});

// BLK-builder-20260925-0656-2: smetana の複合状態は見出しを円弧付きの path で描き、その数字を座標として読んでいたので、
// 複合状態の枠が図の左上まで広がり、2 つ目の複合状態の名前を指すと 1 つ目にまたがる枠が出た。
// 行き先の側にある出口・pin (線が矢じりの手前で切れる) と、どの遷移にもつながらない pin にも枠が無かった。
test('migrator 手順 4 — smetana の複合状態・出口・pin のある state 図でも、名前・丸・四角に本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'state-' + n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  // 名前の文字 (text) か、その脇の図形 (名前の付いた <g> の外の丸・四角) の中心を指し、光った枠を読む
  const hoverAt = async (label, shape) => {
    const pt = await page.evaluate((a) => {
      const svg = document.querySelector('#preview-svg svg');
      const t = Array.prototype.find.call(svg.querySelectorAll('text'), (n) => (n.textContent || '').trim() === a.label &&
        !n.closest('g.link'));
      if (!t) return null;
      let el = t;
      if (a.shape) {
        const tb = t.getBoundingClientRect();
        let best = null, bd = Infinity;
        svg.querySelectorAll('ellipse, rect').forEach((e) => {
          const g = e.parentNode;
          if (g && g.getAttribute && g.getAttribute('class')) return;
          const b = e.getBoundingClientRect();
          const d = Math.abs(b.left + b.width / 2 - (tb.left + tb.width / 2)) + Math.abs(b.top + b.height / 2 - (tb.top + tb.height / 2));
          if (d < bd) { bd = d; best = e; }
        });
        el = best;
      }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, { label, shape });
    expect(pt, label + ' が描かれている').not.toBeNull();
    await page.mouse.move(3, 3);
    await page.mouse.move(pt.x, pt.y);
    const r = page.locator('#overlay-layer rect.hit-hover').first();
    await expect(r, label + ' にホバーして枠が出る').toHaveCount(1, { timeout: 5000 });
    const bb = await r.boundingBox();
    return { id: await r.getAttribute('data-id'), bb };
  };

  // smetana の並んだ複合状態: B の名前を指すと B の枠が、B の外枠に重なって出る
  await typeDsl(page, fx('smetana-siblings'));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="B"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  const b = await hoverAt('B', false);
  expect(b.id).toBe('B');
  const clusterB = await page.evaluate(() => {
    // PlantUML 1.2026.7 から smetana の複合状態は g.cluster ではなく中の状態を包む g.entity。どちらも直の子の rect が外枠。
    const r = document.querySelector('#preview-svg svg g[data-qualified-name="B"] > rect').getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  expect(Math.abs(b.bb.x - clusterB.x), '枠の左端が B の外枠に合う').toBeLessThan(6);
  expect(Math.abs(b.bb.y - clusterB.y), '枠の上端が B の外枠に合う (A にまたがらない)').toBeLessThan(6);

  // 出口 (矢じりの側): exit1 の丸を指すと exit1
  await typeDsl(page, fx('pin-exits'));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="Diagnostics.exit1"]')).toHaveCount(1, { timeout: 20000 });
  expect((await hoverAt('exit1', true)).id).toBe('Diagnostics.exit1');

  // pin: 遷移の行き先の entry2 と、どこにもつながらない ex / count_start
  await typeDsl(page, fx('pin-pins'));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="module.ex"]')).toHaveCount(1, { timeout: 20000 });
  expect((await hoverAt('entry2', true)).id).toBe('module.Somp.entry2');
  expect((await hoverAt('ex', true)).id).toBe('module.ex');
  expect((await hoverAt('count_start', true)).id).toBe('module.counter.count_start');
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-builder-20260925-0934-3: header / footer / caption / legend に枠が出なかった (sequence は裸の文字、
// class は <g class="header"> … で描かれ、legend は行を持たない)。図種を問わず本文の行で当て、押すとその行が選ばれる。
test('migrator 手順 4 — title / header / footer / caption / legend のある sequence 図と class 図でも、飾りに本人の行の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');

  // corpus の seq-18: 1 行目がコメントなので title は 3 行目、legend … endlegend は 12 行目から
  await typeDsl(page, fx('chrome-seq'));
  await expect(page.locator('#overlay-layer rect[data-src-kind="legend"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  for (const [label, line] of [['ドキュメントNo. SWD-0012', '4'], ['Confidential', '5'], ['図1: 起動処理', '6'],
    ['BSW = Basic Software', '12'], ['RTE = Runtime Environment', '12']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーしてその行の枠が出る').toEqual({ type: 'source-line', line, hover: true });
  }
  const msg = await hoverHit(page, 'Jump_to_App()');
  expect(msg.hit && msg.hit.type, 'メッセージは今までどおり本人の枠').toBe('message');
  // 凡例を押すと本文の legend 行が選ばれる
  const leg = await hoverHit(page, 'BSW = Basic Software');
  await page.mouse.click(leg.box.x, leg.box.y);
  await expect(page.locator('#src-line-props')).toHaveAttribute('data-line', '12');

  // web の A0005 (前書きを除いたもの): <style> で色を付けた class 図。legend は行を持たない <g class="legend">
  await typeDsl(page, fx('chrome-class'));
  await expect(page.locator('#overlay-layer rect[data-src-kind="legend"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  for (const [label, line] of [['legend', '3'], ['footer', '4'], ['header', '5'], ['caption', '6']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーしてその行の枠が出る').toEqual({ type: 'source-line', line, hover: true });
  }
  const bob = await hoverHit(page, 'Bob');
  expect(bob.hit && bob.hit.type, 'クラスは今までどおり本人の枠').not.toBe('source-line');

  // BLK-migrator-20260925-0932 の最小再現: title / legend / header と矢印 (Sally --> Bob) の全部に本人の枠
  await typeDsl(page, ['@startuml', 'title title', 'legend legend', 'header header', 'class Bob', 'class Sally',
    'Sally --> Bob', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-src-kind="legend"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  for (const [label, line] of [['title', '2'], ['legend', '3'], ['header', '4']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーしてその行の枠が出る').toEqual({ type: 'source-line', line, hover: true });
  }
  for (const name of ['Bob', 'Sally']) {
    const { hit } = await hoverHit(page, name);
    expect(hit && hit.hover, name + ' に本人の枠').toBe(true);
    expect(hit.type, name + ' はクラスの枠').not.toBe('source-line');
  }
  const head = await page.evaluate(() => {
    const r = document.querySelector('#preview-svg svg g.link polygon').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(3, 3);
  await page.mouse.move(head.x, head.y);
  await expect.poll(() => page.locator('#overlay-layer .hit-hover[data-type="relation"][data-line="7"]').count(),
    { message: '矢じりにホバーして 7 行目の関係の枠', timeout: 5000 }).toBeGreaterThan(0);

  // 他の図種 (state) でも header / footer / caption に枠
  await typeDsl(page, ['@startuml', 'header SH', 'footer SF', 'caption SC', '[*] --> S1', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-src-kind="caption"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  for (const [label, line] of [['SH', '2'], ['SF', '3'], ['SC', '4']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーしてその行の枠が出る').toEqual({ type: 'source-line', line, hover: true });
  }
});

// BLK-migrator-20260925-1032: 複合状態の中の空所 (線の無い所) を指すと、その中を通る遷移の箱が当たり、遷移の枠が出ていた。
// 遷移は線そのもの (太い透明な線) とラベルで当て、箱は入れ物より後ろに置く。線・ラベルの上は今までどおり遷移。
test('migrator 手順 4 — 複合状態の中の空所を指すと複合状態の枠が出て、中の遷移は線とラベルの上でだけ選ばれる', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'state-composite-center.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="counter"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#overlay-layer path.link-hit[data-type="transition"]')).toHaveCount(4);
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });

  const hoverAt = async (pt) => {
    await page.mouse.move(3, 3);
    await page.mouse.move(pt.x, pt.y);
    const r = page.locator('#overlay-layer rect.hit-hover').first();
    await expect(r).toHaveCount(1, { timeout: 5000 });
    return { id: await r.getAttribute('data-id'), type: await r.getAttribute('data-type'), line: await r.getAttribute('data-line') };
  };
  const pts = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const c = svg.querySelector('rect[fill="none"][rx="12.5"]');
    c.scrollIntoView({ block: 'center', inline: 'center' });
    const cb = c.getBoundingClientRect();
    const lk = svg.querySelector('g.link[data-source-line="6"]');   // count_idle --> count_ongoing: count_start (L7)
    const lb = lk.querySelector('text').getBoundingClientRect();
    const p = lk.querySelector('path');
    const q = p.getPointAtLength(p.getTotalLength() / 2);
    const m = p.getScreenCTM();
    return {
      center: { x: cb.left + cb.width / 2, y: cb.top + cb.height / 2 },
      label: { x: lb.left + lb.width / 2, y: lb.top + lb.height / 2 },
      line: { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f },
    };
  });

  const center = await hoverAt(pts.center);
  expect(center, '複合状態の真ん中の空所 → counter の枠').toEqual(expect.objectContaining({ type: 'state', id: 'counter' }));
  const label = await hoverAt(pts.label);
  expect(label, '遷移ラベル count_start → その遷移 (L7)').toEqual(expect.objectContaining({ type: 'transition', line: '7' }));
  const onLine = await hoverAt(pts.line);
  expect(onLine, '遷移の線の中ほど → その遷移 (L7)').toEqual(expect.objectContaining({ type: 'transition', line: '7' }));

  // 押しても同じ: 真ん中の空所を押すと counter が選ばれる
  await page.mouse.click(pts.center.x, pts.center.y);
  await expect(page.locator('#overlay-layer rect.selected[data-id="counter"]').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-migrator-20260925-1732: mainframe の見出しの文字に枠が出ず、「⚠ Overlay マッチング失敗: message:6」が出ていた (corpus の seq-19)。
// mainframe の札は title / header と同じ 1 か所で当て (押すと mainframe の行)、2 枚目以降 (newpage の後) は 1 枚目の照合に数えない。
// 宣言の後ろの `<<ステレオタイプ>>` も名前の外として読み、参加者は宣言の行に当たる。
test('migrator 手順 4 — mainframe と newpage とステレオタイプ付きの宣言がある sequence 図でも、見出し・参加者・メッセージに本人の枠が出て警告が出ない', async ({ page }) => {
  await bootPlain(page);
  const dsl = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'mainframe-seq19.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-src-kind="mainframe"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  for (const [label, type, line] of [['起動シーケンス概要', 'source-line', '5'], ['MCUドライバ', 'participant', '3'],
    ['アプリ', 'participant', '4'], ['Init()', 'message', '6'], ['E_OK', 'message', '7']]) {
    const { hit } = await hoverHit(page, label);
    expect(hit, label + ' にホバーして本人の行の枠が出る').toEqual({ type, line, hover: true });
  }
  // 見出しを押すと本文の mainframe の行が選ばれる
  const mf = await hoverHit(page, '起動シーケンス概要');
  await page.mouse.click(mf.box.x, mf.box.y);
  await expect(page.locator('#src-line-props')).toHaveAttribute('data-line', '5');

  // 他の図種 (新記法のアクティビティ図) でも札に mainframe の行、動作は本人の枠
  await typeDsl(page, ['@startuml', 'mainframe 動作の枠', 'start', ':A;', 'stop', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-src-kind="mainframe"]')).toHaveCount(1, { timeout: 20000 });
  expect((await hoverHit(page, '動作の枠')).hit).toEqual({ type: 'source-line', line: '2', hover: true });
  expect((await hoverHit(page, 'A')).hit).toEqual({ type: 'action', line: '4', hover: true });

  // BLK-migrator-20260929-2158: newpage が 1 枚目の下端に全幅で描く破線 (ページの境目) にも newpage の行の枠が出て、
  // 押すとその行が選ばれる (== 区切り == と同じ)。メッセージの枠は今までどおり本人の行 (corpus の seq-42)。
  const seq42 = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'seq-42-autonumber-in-groups-newpage.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, seq42);
  await expect(page.locator('#overlay-layer rect[data-src-kind="newpage"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  const rulePts = await page.evaluate(() => {
    const ls = Array.from(document.querySelectorAll('#preview-svg svg line')).filter((l) =>
      /dasharray:\s*2,\s*2/.test(l.getAttribute('style') || '') && Math.abs(+l.getAttribute('y1') - +l.getAttribute('y2')) < 0.5);
    ls.sort((a, b) => Math.abs(+b.getAttribute('x2') - +b.getAttribute('x1')) - Math.abs(+a.getAttribute('x2') - +a.getAttribute('x1')));
    const r = ls[0].getBoundingClientRect();
    return [0.1, 0.5, 0.9].map((f) => ({ x: r.left + r.width * f, y: r.top + r.height / 2 }));
  });
  for (const p of rulePts) {
    await page.mouse.move(3, 3);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    const hit = await page.evaluate((q) => {
      const r = document.elementsFromPoint(q.x, q.y).find((e) => e.closest('#overlay-layer') && e.getAttribute('data-type'));
      return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line') } : null;
    }, p);
    expect(hit, 'ページの境目の破線にホバーして newpage の行の枠').toEqual({ type: 'source-line', line: '14' });
  }
  await page.mouse.click(rulePts[1].x, rulePts[1].y);
  await expect(page.locator('#src-line-props')).toHaveAttribute('data-line', '14');
  for (const [label, line] of [['電源投入', '7'], ['運転開始', '11']]) {
    expect((await hoverHit(page, label)).hit, label + ' は本人の行').toEqual({ type: 'message', line, hover: true });
  }
});

// BLK-migrator-20260929-1300: `!ifdef` / `!else` の両枝に同じ `A -> B` があると、描かれない枝の行まで当て損ねに数え、
// 正しい図に「図の要素 1 個に選択枠を当てられませんでした」が出ていた (corpus の common-20)。`hide unlinked` で隠れる参加者も
// 同じ誤警告 (seq-23)。描かれない枝の行と隠れる参加者は数えず、下端の件数も描かれる物で数える。
test('migrator 手順 4 — !ifdef / !else の両枝にメッセージのある sequence 図と hide unlinked の図で、帯が出ず、描かれた矢印に描かれた側の行の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, fx('preproc-ifdef-else-seq'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  await expect(page.locator('#status-info')).toHaveText('2 elements · 1 relation');
  expect((await hoverHit(page, 'a')).hit).toEqual({ type: 'message', line: '6', hover: true });

  // 描かれない枝が先にあっても、描かれた矢印は描かれた側の行 (順番でずれない)
  await typeDsl(page, fx('preproc-ifndef-first-dead-seq'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  expect((await hoverHit(page, 'a')).hit).toEqual({ type: 'message', line: '8', hover: true });
  expect((await hoverHit(page, 'done')).hit).toEqual({ type: 'message', line: '10', hover: true });

  for (const name of ['common-20-preproc-include-local-undef', 'seq-23-hide-unlinked-note-across']) {
    await typeDsl(page, fx(name));
    await expect(page.locator('#overlay-layer rect[data-type="message"]').first()).toBeAttached({ timeout: 20000 });
    await page.waitForTimeout(600);
    await expect(page.locator('#overlay-warning'), name + ' で帯が出ない').toBeHidden();
  }
  await expect(page.locator('#overlay-layer rect[data-type="participant"][data-id="Cache"]').first()).toBeAttached();
});

// BLK-migrator-20260929-1351: `!definelong RETRY(target)` を `RETRY(B)` で呼ぶと、描かれる B の自己メッセージにも後ろの
// `B --> A` にも枠が出ず、「⚠ 図の要素 3 個に選択枠を当てられませんでした」が出た (corpus の seq-36)。当てる前の本文を
// 同梱 jar のプリプロセッサに展開させ、展開で生まれた行は呼んだ行として読む。
test('migrator 手順 4 — !definelong・変数・%関数で書いた sequence 図でも、マクロが描く矢印は呼んだ行、後ろの矢印は本人の行の枠が出て、帯が出ない', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, fx('seq-definelong-retry'));
  await expect(page.locator('#overlay-layer rect[data-type="message"][data-line="8"]').first()).toBeAttached({ timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  await expect(page.locator('#status-info')).toHaveText('2 elements · 3 relations');
  for (const [label, line] of [['送信', '7'], ['再試行', '8'], ['完了', '9']]) {
    expect((await hoverHit(page, label)).hit, label + ' にホバーして枠が出る').toEqual({ type: 'message', line, hover: true });
  }
  const caretLine = () => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(0, ed.selectionStart).split('\n').length;
  });
  for (const [label, line] of [['再試行', '8'], ['完了', '9']]) {
    const h = await hoverHit(page, label);
    await page.mouse.click(3, 3);
    await page.mouse.click(h.box.x, h.box.y);
    await expect(page.locator('#overlay-layer rect.selected[data-type="message"]').first(), label + ' を押すと ' + line + ' 行目')
      .toHaveAttribute('data-line', line);
    await expect.poll(caretLine, label + ' を押すと本文の ' + line + ' 行目').toBe(Number(line));
  }

  await typeDsl(page, fx('seq-36-definelong-variables-strfunc'));
  await expect(page.locator('#overlay-layer rect[data-type="message"][data-line="14"]').first()).toBeAttached({ timeout: 20000 });
  await page.waitForTimeout(600);
  await expect(page.locator('#overlay-warning'), 'seq-36 で帯が出ない').toBeHidden();
  for (const [label, line] of [['REQ 送信', '10'], ['上限 3 回まで', '12'], ['再試行', '14'], ['文字数 4 / 3', '15']]) {
    expect((await hoverHit(page, label)).hit, label + ' にホバーして枠が出る').toEqual({ type: 'message', line, hover: true });
  }

  // 差し戻し 1 回目: `!while` の中で宣言した参加者 (`participant "サービス$i" as S$i`) に枠が出ず、帯が出た (corpus の common-22)。
  // 展開で別の要素になる行は展開後の行で読み、参加者は宣言した行 (4 行目) の枠になる。
  await typeDsl(page, fx('seq-while-participants'));
  await expect(page.locator('#overlay-layer rect[data-type="participant"][data-id="S2"]').first()).toBeAttached({ timeout: 20000 });
  await page.waitForTimeout(600);
  await expect(page.locator('#overlay-warning'), '!while の図で帯が出ない').toBeHidden();
  // 上下の頭の両方に枠が出る
  await expect(page.locator('#overlay-layer rect[data-type="participant"][data-id="S1"]')).toHaveCount(2);
  await expect(page.locator('#overlay-layer rect[data-type="participant"][data-id="S2"]')).toHaveCount(2);
  for (const label of ['サービス1', 'サービス2']) {
    const h = await hoverHit(page, label);
    expect(h.hit && h.hit.type, label + ' にホバーして参加者の枠が出る').toBe('participant');
    expect(h.hit.line, label + ' は宣言した 4 行目').toBe('4');
  }
  expect((await hoverHit(page, '転送')).hit, '転送 にホバーして 7 行目の枠').toEqual({ type: 'message', line: '7', hover: true });

  // BLK-owner-20260929-2131-1: !while が作った参加者を押すと、右パネルは読むだけで、どの行が作っているかを 1 行で言う。
  // 欄から名前を直してひな形の行 (4 行目) を書き換え、2 人とも同じ名前にしない。普通の行 (7 行目) は今までどおり直せる。
  const whileDsl = fx('seq-while-participants');
  const s2 = await hoverHit(page, 'サービス2');
  await page.mouse.click(s2.box.x, s2.box.y);
  await expect(page.locator('#generated-part-note'), '!while の参加者は理由の 1 行が出る').toContainText('L3 の繰り返し (!while)');
  await expect(page.locator('#seq-edit-alias'), 'Alias 欄は読むだけ').toBeDisabled();
  await expect(page.locator('#props-content .seq-delete-line'), '✕ 削除も押せない').toBeDisabled();
  // BLK-owner-20260930-0111-1: 利用者と同じく、図を押した直後にそのままキーを押す (blur しない)。
  // 図を押しても本文欄にフォーカスは移らず、Delete・d は本文を書き換えずに断る。
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id), '図を押しても本文欄にフォーカスは移らない').not.toBe('editor');
  await page.keyboard.press('Delete');
  await expect(page.locator('#ma-toast'), '断って理由を言う').toContainText('書き換えませんでした');
  await page.keyboard.press('d');
  expect(await page.evaluate(() => document.getElementById('editor').value), '本文は 1 字も変わらない').toBe(whileDsl);
  const tr = await hoverHit(page, '転送');
  await page.mouse.click(tr.box.x, tr.box.y);
  await expect(page.locator('#props-content .seq-delete-line'), '普通の行は ✕ 削除を押せる').toBeEnabled();
  await expect(page.locator('#generated-part-note')).toHaveCount(0);
});

// BLK-owner-20260930-0111-1: 図の部品を押すと本文欄にフォーカスが移ってその行全体が選ばれ、続けて押した Enter で行が空行 2 つに、
// 文字キーで行がその 1 文字に置き換わって自動保存されていた (design 5b の図の編集キーは素通しされて効かなかった)。
// 図を押したら本文欄は行を光らせるだけにし、キーは選んだ部品に効かせる。実マウスで押して、そのままキーを押す。
test('migrator 手順 4 — 図の部品を押した直後のキーは本文の行を書き換えず、Delete・d・Ctrl+D は選んだ部品に効く', async ({ page }) => {
  await bootPlain(page);
  const dsl = ['@startuml', 'participant A', 'participant Z', 'A -> Z : req', 'Z --> A : ack', '@enduml'].join('\n');
  const text = () => page.evaluate(() => document.getElementById('editor').value);
  const active = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  await typeDsl(page, dsl);
  await expect(page.locator('#overlay-layer rect[data-type="message"][data-line="5"]').first()).toBeAttached({ timeout: 20000 });
  await page.waitForTimeout(600);

  // 参加者 Z を押す: 本文欄へはフォーカスを移さず、3 行目に帯と行番号の印が出る
  const z = await hoverHit(page, 'Z');
  await page.mouse.click(3, 3);
  await page.mouse.click(z.box.x, z.box.y);
  await expect(page.locator('#overlay-layer rect.selected[data-type="participant"]').first()).toHaveAttribute('data-line', '3');
  expect(await active(), '図を押しても本文欄にフォーカスは移らない').not.toBe('editor');
  await expect(page.locator('#editor-jump-band'), '選んだ行に帯が出る').toBeVisible();
  await expect(page.locator('#editor-jump-band')).toHaveAttribute('data-line', '3');
  await expect(page.locator('#line-numbers .ln.ln-jump')).toHaveAttribute('data-line', '3');
  // Enter・文字キーで行が置き換わらない
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.mouse.click(3, 3);
  await page.mouse.click(z.box.x, z.box.y);
  await page.keyboard.press('x');
  expect(await text(), 'Enter・文字キーで本文は変わらない').toBe(dsl);
  // Delete は ✕ 削除と同じ (宣言の行だけを行ごと消す)。Ctrl+Z で戻る
  await page.keyboard.press('Delete');
  await expect.poll(text, 'Delete で参加者の宣言の行が行ごと消える').toBe(dsl.replace('participant Z\n', ''));
  await page.keyboard.press('Control+z');
  await expect.poll(text).toBe(dsl);
  await expect(page.locator('#overlay-layer rect[data-type="message"][data-line="4"]').first()).toBeAttached({ timeout: 20000 });
  await page.waitForTimeout(600);

  // メッセージを押して Delete: 行の文字だけ消して空行を残さず、行ごと消える
  const req = await hoverHit(page, 'req');
  await page.mouse.click(3, 3);
  await page.mouse.click(req.box.x, req.box.y);
  await expect(page.locator('#overlay-layer rect.selected[data-type="message"]').first()).toHaveAttribute('data-line', '4');
  expect(await active()).not.toBe('editor');
  await page.keyboard.press('Delete');
  await expect.poll(text, 'Delete でメッセージの行が行ごと消える').toBe(dsl.replace('A -> Z : req\n', ''));
  await page.keyboard.press('Control+z');
  await expect.poll(text).toBe(dsl);
  await expect(page.locator('#overlay-layer rect[data-type="message"][data-line="5"]').first()).toBeAttached({ timeout: 20000 });
  await page.waitForTimeout(600);

  // メッセージを押して Ctrl+D: 直後に複製
  const ack = await hoverHit(page, 'ack');
  await page.mouse.click(3, 3);
  await page.mouse.click(ack.box.x, ack.box.y);
  await expect(page.locator('#overlay-layer rect.selected[data-type="message"]').first()).toHaveAttribute('data-line', '5');
  await page.keyboard.press('Control+d');
  await expect.poll(text, 'Ctrl+D で複製').toBe(dsl.replace('Z --> A : ack\n', 'Z --> A : ack\nZ --> A : ack\n'));

  // 本文を打ちたい人は本文欄を押せば打てる (帯は下りる)
  await page.locator('#editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type("\n' memo");
  await expect.poll(text).toContain("' memo");
  await expect(page.locator('#editor-jump-band')).toBeHidden();
});

// BLK-migrator-20260925-1800: 途中で `create` / `**` した参加者の頭がそのメッセージの高さに描かれ、メッセージの文字を探す床を押し下げて、
// それより上のメッセージの文字に枠が出なかった (corpus の seq-11 / seq-12、1.2026.8 への版上げ由来)。床は最初の矢印より上の頭だけで決める。
test('migrator 手順 4 — 途中で create / ** / !! した参加者のある sequence 図でも、その頭より上のメッセージの文字に本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  for (const [name, labels] of [
    ['seq-created-head-12', [['validate()', '4'], ['new(config)', '6'], ['ok', '7'], ['stop()', '12']]],
    ['seq-created-head-11', [['Session_Open()', '5'], ['internal_alloc()', '6'], ['handle', '7'], ['force_cleanup()', '9'],
      ['done', '11'], ['Session_Reopen()', '13']]],
  ]) {
    await typeDsl(page, fx(name));
    await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(7, { timeout: 20000 });
    await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#overlay-warning')).toBeHidden();
    for (const [label, line] of labels) {
      const { hit } = await hoverHit(page, label);
      expect(hit, name + ' の ' + label + ' にホバーして本人の行の枠が出る').toEqual({ type: 'message', line, hover: true });
    }
  }
});

// BLK-builder-20260925-1835-2: 同じファイルで定義した手続きを呼ぶ行 (corpus の seq-22)、改行 `\l`・`\r` とアイコン `<&x>` を含む文言、
// 文言の無いメッセージと `return` が並ぶ区間 (aws-icons の Sequence - Images・Figure 5・S3 Upload Workflow) で
// 「⚠ Overlay マッチング失敗: message:N」が出て、メッセージの枠が抜けていた。描かれた矢印と DSL のメッセージを同じ数だけ並べて当てる。
test('migrator 手順 4 — 手続きで描いたメッセージ・\l で折り返した文言・return の並ぶ sequence 図でも、メッセージに本人の枠が出て警告が出ない', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'v1-2026-8-' + n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, fx('local-proc'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  for (const [label, line] of [['Flush()', '8'], ['Rotate()', '10'], ['Close()', '11']]) {
    expect((await hoverHit(page, label)).hit, label + ' にホバーして呼んだ行の枠が出る').toEqual({ type: 'message', line, hover: true });
  }
  // 手続きの矢印を押すと、呼んだ行が選ばれる
  const fl = await hoverHit(page, 'Flush()');
  await page.mouse.click(fl.box.x, fl.box.y);
  await expect(page.locator('#overlay-layer rect.selected[data-type="message"]')).toHaveAttribute('data-line', '8');

  await typeDsl(page, fx('lbreak-sprite'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(5, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  for (const [label, line] of [['POST /prod', '5'], ['create token', '6'], ['check', '7'], ['bye', '11']]) {
    expect((await hoverHit(page, label)).hit, label + ' にホバーして本人の行の枠が出る').toEqual({ type: 'message', line, hover: true });
  }
});

// BLK-migrator-20260925-1832: corpus の seq-21 (`!pragma teoz true` で 1 行に `A -> B : x & A -> C : y` と書いた図) で、
// 「& で並べたメッセージの文字の枠が 102px ずれる」と報告された。PlantUML 1.2026.8 は行の途中の `&` を並べる印と読まず、
// `x & A -> C : y` を 1 本の矢印の文字として描く (並べる印は行頭の `&`)。文字の枠は描いた文字の上に出ており、
// ずれと数えられた 2 点は、ライフラインの中心がちょうど矢印の線の高さにある点 (線の上はメッセージ、が既定の当て方)。
// 文字には本人の行の枠が出て、線から離れたライフラインはライフラインが選ばれることを守る。
test('migrator 手順 4 — teoz の 1 行に & を書いた sequence 図でも、描かれた文字に本人の行の枠が出て、線から離れたライフラインはライフライン', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                          // 1
    '!pragma teoz true',                                  // 2
    'participant App',                                    // 3
    'participant DrvA',                                   // 4
    'participant DrvB',                                   // 5
    'App -> DrvA : Start() & App -> DrvB : Start()',      // 6
    'DrvA --> App : Done() & DrvB --> App : Done()',      // 7
    'App -> DrvA : Stop() & App -> DrvB : Stop()',        // 8
    'DrvA --> App : Ack() & DrvB --> App : Ack()',        // 9
    'App -> App : LogFinish()',                           // 10
    '@enduml',                                            // 11
  ].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="message"]')).toHaveCount(5, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  for (const [label, line] of [['Start() & App -> DrvB : Start()', '6'], ['Done() & DrvB --> App : Done()', '7'],
    ['Stop() & App -> DrvB : Stop()', '8'], ['Ack() & DrvB --> App : Ack()', '9'], ['LogFinish()', '10']]) {
    expect((await hoverHit(page, label)).hit, label + ' にホバーして本人の行の枠が出る').toEqual({ type: 'message', line, hover: true });
  }
  // Stop() の矢印の尾が付く App のライフラインは線から 5px、矢じりが付く DrvA のライフラインは矢じり (高さ ±4px) から離れた 8px の所でライフライン
  const hovered = () => page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')).join(','));
  const pts = await page.evaluate(() => {
    const ls = Array.from(document.querySelectorAll('#preview-svg svg line')).map((l) => l.getBoundingClientRect());
    const vert = ls.filter((b) => b.width < 1 && b.height > 100).sort((p, q) => p.left - q.left);
    const horiz = ls.filter((b) => b.height < 1 && b.width > 100).sort((p, q) => p.top - q.top);
    return { xs: [vert[0].left, vert[1].left], y: horiz[2].top };
  });
  const z = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const vb = svg.viewBox && svg.viewBox.baseVal;
    return vb && vb.height ? svg.getBoundingClientRect().height / vb.height : 1;
  });
  for (const [i, line, d] of [[0, '3', 5], [1, '4', 8]]) {
    for (const dy of [-d, d]) {
      await page.mouse.move(3, 3);
      await page.mouse.move(pts.xs[i], pts.y + dy * z);
      await expect.poll(hovered, `ライフライン ${line} 行の、矢印の線から ${dy}px の所はライフライン`).toBe('lifeline@' + line);
    }
  }
});

// BLK-migrator-20260925-1932: どの遷移にもつながらない `state History <<history>>` の丸と「H」に枠が出なかった (corpus の state-06)。
// PlantUML は履歴の丸・fork / join の棒を名前も <g> も無しに描くので、遷移の端から名前を引けない図形は
// 形 (H / H* / 棒) と入れ物の組で宣言順に当てる。遷移の有無で枠の有無が変わらない。
test('migrator 手順 4 — 遷移の無い履歴・fork の棒のある state 図でも、丸・「H」・棒に本人の宣言行の枠が出て、押すとその行が選ばれる', async ({ page }) => {
  await bootPlain(page);
  const fx = (n) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'state-unnamed-glyph-' + n + '.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  // 名前の付いた <g> の外の図形 (丸・棒) と丸の中の文字に印を付け、1 つずつ画面に入れてから中心を指す
  const glyphs = () => page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const els = [];
    const bare = (e) => !(e.parentNode.getAttribute && e.parentNode.getAttribute('class'));
    svg.querySelectorAll('text').forEach((t) => {
      const s = (t.textContent || '').trim();
      if ((s === 'H' || s === 'H*') && bare(t)) els.push(['text', t]);
    });
    svg.querySelectorAll('ellipse').forEach((e) => { if (bare(e) && parseFloat(e.getAttribute('rx')) === 11) els.push(['circle', e]); });
    svg.querySelectorAll('rect').forEach((e) => { if ((e.getAttribute('fill') || '').toLowerCase() === '#555') els.push(['bar', e]); });
    return els.map(([kind, e], i) => {
      e.setAttribute('data-glyph', String(i));
      const r = e.getBoundingClientRect();
      return { kind, i, y: r.top };
    });
  });
  const hotAt = async (g) => {
    const p = await page.evaluate((i) => {
      const e = document.querySelector('#preview-svg svg [data-glyph="' + i + '"]');
      e.scrollIntoView({ block: 'center', inline: 'center' });
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, g.i);
    await page.mouse.move(3, 3);
    await page.mouse.move(p.x, p.y);
    const r = page.locator('#overlay-layer rect.hit-hover').first();
    await expect(r, g.kind + ' にホバーして枠が出る').toHaveCount(1, { timeout: 5000 });
    return { p, id: (await r.getAttribute('data-id')) + '@' + (await r.getAttribute('data-line')) };
  };

  // corpus の state-06: 丸 2 つ・「H」2 つとも、遷移の無い History (9 行目) と遷移のある DeepHist (12 行目) に当たる
  await typeDsl(page, fx('s6'));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="History"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  const s6 = await glyphs();
  expect(s6.filter((g) => g.kind !== 'bar').length).toBe(4);
  const got = [];
  for (const g of s6) got.push(g.kind + ':' + (await hotAt(g)).id);
  expect(got.sort()).toEqual(['circle:DeepHist@12', 'circle:History@9', 'text:DeepHist@12', 'text:History@9']);

  // 押すと本文の宣言行 (9 行目) が選ばれる
  const hist = s6.filter((g) => g.kind === 'circle').sort((a, b) => a.y - b.y)[0];
  const hh = await hotAt(hist);
  expect(hh.id).toBe('History@9');
  await page.mouse.click(hh.p.x, hh.p.y);
  await expect.poll(() => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(0, ed.selectionStart).split('\n').length;
  })).toBe(9);

  // 宣言だけの図: fork / join の棒・H・H*・複合状態の中の H のどれにも枠が出る
  await typeDsl(page, fx('iso'));
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="Comp.HH"]')).toHaveCount(1, { timeout: 20000 });
  const iso = await glyphs();
  const isoGot = [];
  for (const g of iso) isoGot.push(g.kind + ':' + (await hotAt(g)).id);
  expect(isoGot).toEqual(expect.arrayContaining(['bar:F1@4', 'bar:J1@5', 'circle:H1@8', 'text:H1@8', 'circle:H2@9', 'text:H2@9',
    'circle:Comp.HH@11', 'text:Comp.HH@11']));
  expect(isoGot.length).toBe(8);
});

// BLK-builder-20260925-2015-3: 遷移の端に書いた履歴 (`Operation --> [H]` / `[H] --> Operation` / `--> [H*]`) の丸と「H」は、
// 名前の付いた <g> も状態の名前も無く描かれるので、「H」を指すと隣の遷移の大きな枠が出て、「H*」では何も出なかった (corpus の state-11)。
// 丸に触れる遷移の端の書き方で「どこの履歴か」を決め、開始・終了と同じ枠にする。押すと右パネルにその履歴につながる遷移が並ぶ。
test('migrator 手順 4 — 遷移の端に [H] / [H*] を書いた state 図で、丸と「H」に履歴の枠が出て、押すとつながる遷移が並ぶ。宣言した履歴と混ぜても全部の丸に本人の枠', async ({ page }) => {
  await bootPlain(page);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'state-history-end-s11.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, src);
  await expect(page.locator('#overlay-layer rect[data-type="pseudo"][data-id="history@"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  // 図種の切替などで出る通知 (#ma-toast) は下端の丸を覆うので、消えてから指す。
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  const markGlyphs = () => page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const out = [];
    const bare = (e) => !(e.parentNode.getAttribute && e.parentNode.getAttribute('class'));
    svg.querySelectorAll('text').forEach((t) => {
      const s = (t.textContent || '').trim();
      if ((s === 'H' || s === 'H*') && bare(t)) {
        t.setAttribute('data-hmark', String(out.length)); out.push({ i: out.length, what: 'text ' + s });
        const c = t.getBBox(); const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
        svg.querySelectorAll('ellipse').forEach((e) => {
          const r = parseFloat(e.getAttribute('rx')), x = parseFloat(e.getAttribute('cx')), y = parseFloat(e.getAttribute('cy'));
          if (bare(e) && Math.abs(x - cx) <= r && Math.abs(y - cy) <= r) { e.setAttribute('data-hmark', String(out.length)); out.push({ i: out.length, what: 'circle ' + s }); }
        });
      }
    });
    return out;
  });
  const marks = await markGlyphs();
  expect(marks.length).toBe(4);
  const hotAt = async (m) => {
    const p = await page.evaluate((i) => {
      const e = document.querySelector('#preview-svg svg [data-hmark="' + i + '"]');
      e.scrollIntoView({ block: 'center', inline: 'center' });
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, m.i);
    await page.mouse.move(3, 3);
    await page.mouse.move(p.x, p.y);
    const r = page.locator('#overlay-layer rect.hit-hover').first();
    await expect(r, m.what + ' にホバーして枠が出る').toHaveCount(1, { timeout: 5000 });
    return { p, id: (await r.getAttribute('data-type')) + ':' + (await r.getAttribute('data-id')) + '@' + (await r.getAttribute('data-line')) };
  };
  const got = [];
  for (const m of marks) got.push(m.what + '=' + (await hotAt(m)).id);
  expect(got.sort()).toEqual(['circle H*=pseudo:historyDeep@@12', 'circle H=pseudo:history@@10',
    'text H*=pseudo:historyDeep@@12', 'text H=pseudo:history@@10']);

  // 「H」を押すと、右パネルに履歴とつながる 2 本の遷移 (10 行目・11 行目) が並ぶ
  const h = await hotAt(marks.find((m) => m.what === 'text H'));
  await page.mouse.click(h.p.x, h.p.y);
  await expect(page.locator('#st-pseudo-info')).toHaveAttribute('data-kind', 'history');
  await expect(page.locator('#st-pseudo-info')).toContainText('履歴 [H]');
  await expect(page.locator('#st-pseudo-links li')).toHaveText(['L10 Operation --> [H]', 'L11 [H] --> Operation']);

  // BLK-migrator-20260926-0550: 宣言して遷移でつないだ履歴・宣言だけの履歴・{ } の中の [H]・親を名指す Comp[H] / Other[H*] を 1 枚に混ぜる。
  // 履歴は 1 か所で当てるので、どの丸と文字にも本人の枠が出る (宣言したものは宣言の行、端に書いたものは最初に使う遷移の行)。
  const uni = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'dsl', 'state-history-unify.puml'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await typeDsl(page, uni);
  await expect(page.locator('#overlay-layer rect[data-type="pseudo"][data-id="history@Other"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#overlay-layer rect[data-type="state"][data-id="Comp.Lone"]')).toHaveCount(1);
  await expect(page.locator('#ma-toast')).toBeHidden({ timeout: 15000 });
  const um = await markGlyphs();
  expect(um.length).toBe(10);
  const ug = [];
  for (const m of um) ug.push(m.what + '=' + (await hotAt(m)).id);
  expect(ug.sort()).toEqual([
    'circle H*=pseudo:historyDeep@Other@15', 'circle H*=state:Comp.DeepHist@5',
    'circle H=pseudo:history@Comp@16', 'circle H=pseudo:history@Other@12', 'circle H=state:Comp.Lone@6',
    'text H*=pseudo:historyDeep@Other@15', 'text H*=state:Comp.DeepHist@5',
    'text H=pseudo:history@Comp@16', 'text H=pseudo:history@Other@12', 'text H=state:Comp.Lone@6',
  ]);
});

// BLK-migrator-20260926-1116: note の中に Creole の表 (|= |)・箇条書き・リンク・区切り線を書くと、state / sequence /
// activity では表の見出し・セルに枠が出なかった (範囲を中の図形から取り、箇条書きの点の 4px 角や表の 1 セルになった)。
// 範囲は note の紙の外形から全図種共通の 1 か所で取る: 6 図種とも、見出し・各セル・箇条書き・リンクに note の行の枠が出る。
test('migrator 手順 4 — note に Creole の表・箇条書き・リンクを書いても、6 図種とも見出し・各セル・リンクに note の行の枠が出て、押すと note の行が選ばれる', async ({ page }) => {
  await bootPlain(page);
  const NOTE = ['  |= Item |= Status |', '  | WDT reset | ok |', '  | Brownout detect | NG |', '',
    '  * Checklist', '  ** Sub item A', '  # Step 1', '  ----', '  See [[https://example.com/spec spec doc]]', 'end note'];
  const cases = [
    ['state', ['state Review', 'note right of Review'], 3],
    ['class', ['class Review', 'note right of Review'], 3],
    ['sequence', ['participant Review', 'participant B', 'Review -> B : go', 'note right of Review'], 5],
    ['activity', ['start', ':Review;', 'note right'], 4],
    ['usecase', ['actor User', 'usecase (Review)', 'User --> (Review)', 'note right of (Review)'], 5],
    ['component', ['component Review', 'note right of Review'], 3],
  ];
  const words = ['Item', 'Status', 'WDT reset', 'ok', 'Brownout detect', 'NG', 'Checklist', 'Sub item A', 'Step 1', 'spec doc'];
  for (const [kind, head, noteLine] of cases) {
    const tail = kind === 'activity' ? ['stop'] : [];
    await typeDsl(page, ['@startuml'].concat(head, NOTE, tail, ['@enduml']).join(String.fromCharCode(10)));
    await expect(page.locator('#preview-svg svg text').filter({ hasText: 'Brownout detect' })).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('#overlay-layer rect[data-line="' + noteLine + '"]')).not.toHaveCount(0, { timeout: 20000 });
    const got = [];
    for (const w of words) {
      const box = await page.evaluate((l) => {
        const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'),
          (n) => (n.textContent || '').trim() === l);
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, w);
      expect(box, kind + ': ' + w + ' が描かれている').not.toBeNull();
      await page.mouse.move(3, 3);
      await page.mouse.move(box.x, box.y);
      const line = await page.evaluate(() => {
        const r = document.querySelector('#overlay-layer .hit-hover');
        return r ? r.getAttribute('data-line') : null;
      });
      got.push(w + '=' + line);
    }
    expect(got, kind).toEqual(words.map((w) => w + '=' + noteLine));
    // 表のセルを押すと note の行が選ばれる
    const cell = await page.evaluate(() => {
      const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'),
        (n) => (n.textContent || '').trim() === 'WDT reset');
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // 前の図種で選んだ note (同じ行・同じ id) が選ばれたまま残ると、押して外す操作になるので空にしてから押す
    await page.evaluate(() => window.MA.selection.setSelected([]));
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => Number(s.line))),
      { message: kind + ': 押すと note の行', timeout: 5000 }).toEqual([noteLine]);
  }
});

// BLK-migrator-20260929-1858: `skinparam roundCorner` を付けると note の紙と折り返しが円弧入りの path で描かれ、
// 紙が見つからず、sequence では Creole の見出し (`== 見出し ==`) のある note に枠が出なかった。6 図種とも、
// 角の丸い note の見出し・本文に note の行の枠が出て、押すと note の行が選ばれる。
test('migrator 手順 4 — roundCorner を付けた図でも、6 図種とも見出しのある note の見出し・本文に note の行の枠が出て、押すと note の行', async ({ page }) => {
  await bootPlain(page);
  const NOTE = ['  == 見出し ==', '  本文', 'end note'];
  const cases = [
    ['sequence', ['participant A', 'participant B', 'A -> B : x', 'note right of B'], ['B --> A : y'], 6],
    ['class', ['class Foo', 'note right of Foo'], [], 4],
    ['state', ['state S', 'note right of S'], [], 4],
    ['activity', ['start', ':処理;', 'note right'], ['stop'], 5],
    ['usecase', ['actor U', 'usecase UC', 'U --> UC', 'note right of UC'], [], 6],
    ['component', ['component C', 'note right of C'], [], 4],
  ];
  for (const [kind, head, tail, noteLine] of cases) {
    await typeDsl(page, ['@startuml', 'skinparam roundCorner 8'].concat(head, NOTE, tail, ['@enduml']).join(String.fromCharCode(10)));
    await expect(page.locator('#preview-svg svg text').filter({ hasText: '見出し' })).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('#overlay-layer rect[data-line="' + noteLine + '"]')).not.toHaveCount(0, { timeout: 20000 });
    const got = [];
    for (const w of ['見出し', '本文']) {
      const box = await page.evaluate((l) => {
        const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'),
          (n) => (n.textContent || '').trim() === l);
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, w);
      expect(box, kind + ': ' + w + ' が描かれている').not.toBeNull();
      await page.mouse.move(3, 3);
      await page.mouse.move(box.x, box.y);
      got.push(w + '=' + await page.evaluate(() => {
        const r = document.querySelector('#overlay-layer .hit-hover');
        return r ? r.getAttribute('data-line') : null;
      }));
      if (w === '見出し') {
        await page.evaluate(() => window.MA.selection.setSelected([]));
        await page.mouse.click(box.x, box.y);
        await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => Number(s.line))),
          { message: kind + ': 見出しを押すと note の行', timeout: 5000 }).toEqual([noteLine]);
      }
    }
    expect(got, kind).toEqual(['見出し=' + noteLine, '本文=' + noteLine]);
  }
});

// BLK-builder-20260926-1243-2: corpus seq-11 / seq-12 (ok と記録済み) の退行。`create` で作った参加者の頭は、それを作る
// メッセージの高さに描かれ、メッセージの枠 (矢印と文言の和) の中に入る。頭を指すとメッセージの枠が出ていた。
test('migrator 手順 4 — create で途中に作った参加者の頭を指すと、作ったメッセージではなくその参加者の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                                  // 1
    'participant Factory',                        // 2
    'Factory -> Factory : validate()',            // 3
    'create participant "Instance" as Inst',      // 4
    'Factory -> Inst : new(config)',              // 5
    'Inst --> Factory : ok',                      // 6
    'Factory -> Inst : start()',                  // 7
    '@enduml',
  ].join('\n'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();

  const heads = await page.evaluate(() => Array.from(document.querySelectorAll('#preview-svg svg text'))
    .filter((t) => (t.textContent || '').trim() === 'Instance').map((t) => { const r = t.getBoundingClientRect(); return r.top; }));
  expect(heads.length, '頭と尻の 2 か所に描かれる').toBe(2);
  const { hit } = await hoverHit(page, 'Instance');
  expect(hit, 'Instance の頭に枠').not.toBeNull();
  expect(hit.type).toBe('participant');
  expect(hit.line).toBe('4');
  // 作ったメッセージの文言は今までどおりメッセージ
  const msg = await hoverHit(page, 'new(config)');
  expect(msg.hit.type).toBe('message');
  expect(msg.hit.line).toBe('5');
});

// BLK-migrator-20260929-0011: 同じ名前の参加者を create → destroy → create し直すと (corpus の seq-32)、PlantUML は
// 同じ列の途中に頭をもう一度描く。名前で 1 つに畳んでいたため 2 回目の頭 (箱・見出し文字) に枠が出なかった。
test('migrator 手順 4 — destroy した参加者を同じ名前で create し直すと、2 回目の頭にも枠が出て、押すと 2 回目の create の行が選ばれる', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, [
    '@startuml',                 // 1
    'participant Main',          // 2
    'create Worker',             // 3
    'Main -> Worker : run1',     // 4
    'destroy Worker',            // 5
    'create Worker',             // 6
    'Main -> Worker : run2',     // 7
    'destroy Worker',            // 8
    '@enduml',
  ].join('\n'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
  // 見出し文字「Worker」は 1 回目の頭・2 回目の頭・尻の 3 か所。上から順に指す。
  const pts = await page.evaluate(() => Array.from(document.querySelectorAll('#preview-svg svg text'))
    .filter((t) => (t.textContent || '').trim() === 'Worker')
    .map((t) => { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
    .sort((a, b) => a.y - b.y));
  expect(pts.length, '頭 2 つと尻の 3 か所に描かれる').toBe(3);
  const got = [];
  for (const p of pts) {
    await page.mouse.move(3, 3);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(150);
    got.push(await page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
      .filter((r) => r.getAttribute('data-type') === 'participant')
      .map((r) => r.getAttribute('data-id')).filter((v, i, a) => a.indexOf(v) === i).join(',')));
  }
  expect(got, '3 か所とも Worker の枠が出る').toEqual(['Worker', 'Worker', 'Worker']);
  // 2 回目の頭を押すと 2 回目の create の行 (6) が選ばれ、右欄は同じ参加者 Worker の編集
  await page.mouse.move(pts[1].x, pts[1].y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => s.type + ':' + s.id + '@' + s.line)),
    { timeout: 5000 }).toEqual(['participant:Worker@6']);
  await expect(page.locator('#props-content')).toContainText('Worker');
  // BLK-owner-20260929-0431-1: 右欄の見出し・✕ 削除は光らせた行 (6) を指す。1 回目のメッセージ (4) を消さない。
  await expect(page.locator('#props-content')).toContainText('participant · L6');
  const before = await page.locator('#editor').inputValue();
  // 1 回目の頭は宣言の行が無く、選んだ行は最初のメッセージ。✕ 削除は理由を言って本文を変えない。
  // (同じ参加者をもう一度押すと選択が外れるので、Esc で外してから押す)
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).length)).toBe(0);
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => s.type + ':' + s.id)),
    { timeout: 5000 }).toEqual(['participant:Worker']);
  await page.locator('#props-content .seq-delete-line').click();
  await expect(page.locator('#seq-range-toast')).toContainText('宣言の行がありません');
  expect(await page.locator('#editor').inputValue()).toBe(before);
  // 2 回目の頭の ✕ 削除は 2 回目の create の行だけを消し、描ける図のまま。
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).length)).toBe(0);
  await page.mouse.move(pts[1].x, pts[1].y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#props-content')).toContainText('participant · L6');
  await page.locator('#props-content .seq-delete-line').click();
  const after = before.split('\n');
  after.splice(5, 1);
  await expect.poll(() => page.locator('#editor').inputValue()).toBe(after.join('\n'));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-migrator-20260929-0952: アクティビティ図の 2 つ目の partition・入れ子の外側の partition の見出し (名前の文字) と左辺に
// ホバーしても枠が出なかった。partition を本文から読み、見出しの文字を名前で照らして枠を決める。見出し・4 辺の中点のどこでも
// 同じ partition が光り、押すと `partition 名前 {` の行が選ばれる。
test('migrator 手順 4 — アクティビティ図の partition は 2 つ目・入れ子の外側でも、見出しの文字と 4 辺に枠が出て、押すと partition の行', async ({ page }) => {
  await bootPlain(page);
  const caretLine = () => page.evaluate(() => {
    const ed = document.getElementById('editor');
    return ed.value.slice(0, ed.selectionStart).split('\n').length;
  });
  const hovered = () => page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
    .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')))).join(','));
  // 描いた partition (札の <path> の直前の <rect>) の見出しの文字と 4 辺の中点を、画面の座標で
  const points = () => page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const out = [];
    Array.from(svg.querySelectorAll('rect')).forEach((r) => {
      const p = r.nextElementSibling;
      if (!p || p.tagName.toLowerCase() !== 'path' || !/stroke-width:1\.5/.test(p.getAttribute('style') || '')) return;
      const t = p.nextElementSibling.getBoundingClientRect();
      const b = r.getBoundingClientRect();
      out.push({ name: p.nextElementSibling.textContent, pts: [
        ['見出し', t.left + t.width / 2, t.top + t.height / 2], ['上辺', b.left + b.width / 2, b.top],
        ['下辺', b.left + b.width / 2, b.bottom], ['左辺', b.left, b.top + b.height / 2], ['右辺', b.right, b.top + b.height / 2]] });
    });
    return out;
  });
  const cases = [
    [['@startuml', 'start', 'partition A {', '  :a;', '  :b;', '}', 'partition B {', '  :c;', '}', 'stop', '@enduml'], { A: 3, B: 7 }],
    [['@startuml', 'start', 'partition A {', '  :a;', '  partition C {', '    :c;', '  }', '}', 'stop', '@enduml'], { A: 3, C: 5 }],
    [['@startuml', 'start', 'partition "製造 工程" #EEEEFF {', '  :投入;', '}', 'partition 検査 {', '  :外観検査;', '}', 'stop', '@enduml'],
      { '製造 工程': 3, '検査': 6 }],
  ];
  for (const [dsl, want] of cases) {
    await typeDsl(page, dsl.join('\n'));
    await expect(page.locator('#overlay-layer rect[data-src-kind="partition"][data-hit-kind="container"]'))
      .toHaveCount(Object.keys(want).length, { timeout: 20000 });
    const parts = await points();
    expect(parts.map((p) => p.name).sort(), '描いた partition').toEqual(Object.keys(want).sort());
    for (const part of parts) {
      for (const [where, x, y] of part.pts) {
        await page.mouse.move(3, 3);
        await page.mouse.move(x, y);
        await expect.poll(hovered, part.name + ' の' + where + 'にホバーすると partition の行の枠').toBe('source-line@' + want[part.name]);
      }
      const head = part.pts[0];
      await page.mouse.click(3, 3);
      await page.mouse.click(head[1], head[2]);
      await expect.poll(caretLine, part.name + ' の見出しを押すと partition の行').toBe(want[part.name]);
      await expect(page.locator('#src-line-props')).toHaveAttribute('data-line', String(want[part.name]));
    }
  }
  await expect(page.locator('#overlay-warning')).toBeHidden();
});

// BLK-owner-20260926-1628-1: 当て方を変えるたびに、migrator が枠 ok と記録した実物の図が退行し、マージの後の手の測り直しで
// 見つかっていた。progress.md で描画 ok・枠 ok の実物の図を、migrator と同じ道 (ファイルを開く → Fit → 要素を指す) で測り、
// 基準 (tests/e2e/hit-baseline/plantuml-{版}.json) で枠が出ていた点が「枠なし」「別の行の枠」になったら赤にする。
// 当て方を変えた変更は、この test を同じ変更の中で通す。直しで点の答えが意図して変わったときは
// `PUA_HIT_WRITE=1` を付けて回すと基準を書き直す (差分の点を BLK に書く)。コーパスが無い環境では skip。
test('migrator 手順 4 — 枠 ok と記録した実物の図は、基準で枠が出ていた点で今も同じ枠が出る (当て方の回帰)', async ({ page }) => {
  const HB = require('../hit-baseline');
  test.skip(!HB.corpusAvailable(HB.CORPUS_DIR), 'コーパス (persona-data の migrator) が無い環境');
  test.setTimeout(8 * 60 * 1000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(HB.watchRenders);
  await bootPlain(page);
  const env = await page.evaluate(() => fetch('/env').then((r) => r.json()));
  const version = env.jarVersion;
  expect(version, 'plantuml.jar の版が分かる').toBeTruthy();

  const writing = !!process.env.PUA_HIT_WRITE;
  let base = HB.readBaseline(version);
  let otherVersion = null;
  if (!base && !writing) {
    const other = HB.latestOtherBaseline(version);
    if (other) { base = other.data; otherVersion = other.version; }
  }
  let targets;
  if (writing) {
    const names = HB.okNamesFromProgress(fs.readFileSync(path.join(HB.CORPUS_DIR, 'progress.md'), 'utf8'));
    targets = HB.resolveNames(names, HB.CORPUS_DIR).found;
  } else {
    expect(base, 'hit-baseline に基準がある (PUA_HIT_WRITE=1 で作る)').toBeTruthy();
    targets = Object.keys(base.files);
  }

  const current = {};
  for (const rel of targets) {
    const abs = path.join(HB.CORPUS_DIR, rel);
    if (!fs.existsSync(abs)) { current[rel] = { error: 'ファイルが無い' }; continue; }
    const prev = await page.evaluate(() => window.__hitDoc());
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 20000 }),
      page.evaluate(() => { document.getElementById('file-input').click(); }),
    ]);
    await chooser.setFiles(abs);
    // 本文が変わったことと、その本文の描画が出たことを待つ (前の図の遅れた描画を取り違えない)。
    const done = await page.waitForFunction((p) => {
      const d = window.__hitDoc();
      return (d.name !== p.name || d.text !== p.text) && window.__hitSettled();
    }, prev, { timeout: 30000 }).then(() => true, () => false);
    if (!done) { current[rel] = { error: '描画が終わらない' }; continue; }
    if ((await page.locator('#render-status').textContent()) === 'ERROR') { current[rel] = { error: 'ERROR' }; continue; }
    // 手順 4 の「幅合わせ」。点の名前は SVG 座標なので倍率に依らないが、細い要素の当たりは倍率で変わるため毎回そろえる。
    await page.evaluate(() => { document.getElementById('btn-zoom-fit').click(); });
    await page.waitForTimeout(200);
    current[rel] = { points: await page.evaluate(HB.probeInPage) };
  }

  if (writing) {
    const files = {}, excluded = {};
    Object.keys(current).forEach((rel) => {
      if (current[rel].error) excluded[rel] = current[rel].error;
      else files[rel] = current[rel].points;
    });
    const p = HB.writeBaseline(version, files, excluded,
      'progress.md の描画 ok・枠 ok の図。値は指した点に出る枠の data-type:data-line (- は枠なし)');
    console.log('hit-baseline を書いた: ' + p + ' (' + Object.keys(files).length + ' 枚、除外 ' + Object.keys(excluded).length + ')');
    return;
  }

  const r = HB.compare(base.files, current);
  const lines = HB.formatReport(r, 60);
  const outDir = path.join(__dirname, '..', '..', '..', 'test-results');
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'hit-baseline-report.json'), JSON.stringify({
      plantuml: version, baseline: otherVersion || version, failed: r.failed,
      lost: r.lost, changed: r.changed, unrendered: r.unrendered, gained: r.gained, perFile: r.perFile,
    }, null, 1), 'utf8');
  } catch (e) {}
  if (r.gained.length) console.log('基準で枠なしだった点に枠が出た: ' + r.gained.length + ' 点 (PUA_HIT_WRITE=1 で基準に取り込める)');
  if (otherVersion) {
    // 版の違う基準との差は、PlantUML の描き方の違いと当て方の退行を分けられないので赤にしない。
    console.log('PlantUML ' + version + ' の基準が無いので ' + otherVersion + ' の基準と比べた (版の違い、赤にしない)。'
      + ' 違い ' + r.failed + ' 点。PUA_HIT_WRITE=1 で ' + version + ' の基準を作る\n  ' + lines.slice(0, 20).join('\n  '));
    test.info().annotations.push({ type: 'hit-baseline', description: '版の違い ' + otherVersion + ' → ' + version });
    return;
  }
  expect(lines, '基準より当たりが減った点 (test-results/hit-baseline-report.json)').toEqual([]);
});

// BLK-migrator-20260929-1155: 日本語名の状態と [*] を含む state 図 (corpus の state-12〜16) で、遷移の線・矢じり・ラベルに
// 枠が出なかった。状態の名前を ASCII でしか読まず遷移が 1 本も読めていなかったのと、PlantUML 1.2026.8 が修飾名の日本語を `.` に
// 置き換える (`待機` → `..`) ためで、遷移は描いた側の行 (data-source-line) で、名前の壊れた状態は描いた文字と包む複合状態で当てる。
test('migrator 手順 4 — 日本語名の状態と [*] の state 図で、遷移の線・矢じり・ラベルと状態に本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  // 描いた遷移の線の途中 (長さの 4 割の点) と矢じりの中心を、画面の座標で返す。
  const linkPoints = (i) => page.evaluate((k) => {
    const g = document.querySelectorAll('#preview-svg svg g.link')[k];
    const p = g.querySelector('path');
    const m = p.getScreenCTM();
    const at = p.getPointAtLength(p.getTotalLength() * 0.4);
    const head = g.querySelector('polygon').getBoundingClientRect();
    return { line: { x: at.x * m.a + m.e, y: at.y * m.d + m.f }, head: { x: head.left + head.width / 2, y: head.top + head.height / 2 } };
  }, i);
  const hitAt = async (pt) => {
    let hit = null;
    for (let i = 0; i < 5 && !(hit && hit.hover); i++) {
      await page.mouse.move(3, 3);
      await page.mouse.move(pt.x + (i % 2), pt.y);
      await page.waitForTimeout(100 + i * 100);
      hit = await page.evaluate(() => {
        const r = document.querySelector('#overlay-layer rect.hit-hover');
        return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line'), hover: true } : null;
      });
    }
    return hit ? hit.type + '@' + hit.line : 'なし';
  };

  await typeDsl(page, '@startuml\n[*] --> 待機\n待機 --> B : go\n@enduml');
  await expect(page.locator('#overlay-layer rect[data-type="transition"]').first()).toBeAttached({ timeout: 20000 });
  for (const [i, line] of [[0, '2'], [1, '3']]) {
    const pts = await linkPoints(i);
    expect(await hitAt(pts.line), '遷移 ' + i + ' の線').toBe('transition@' + line);
    expect(await hitAt(pts.head), '遷移 ' + i + ' の矢じり').toBe('transition@' + line);
  }
  const go = await hoverHit(page, 'go');
  expect(go.hit && go.hit.type + '@' + go.hit.line).toBe('transition@3');
  const st = await hoverHit(page, '待機');
  expect(st.hit && st.hit.type + '@' + st.hit.line).toBe('state@2');

  // 複合状態の名前も中の状態も日本語 (修飾名は `.` / `...A` / `...start..`)
  await typeDsl(page, '@startuml\nstate 親 {\n  [*] --> 子A\n  子A --> 子B : 行く\n}\n[*] --> 親\n@enduml');
  await expect(page.locator('#overlay-layer rect[data-type="transition"]')).not.toHaveCount(0, { timeout: 20000 });
  const lbl = await hoverHit(page, '行く');
  expect(lbl.hit && lbl.hit.type + '@' + lbl.hit.line).toBe('transition@4');
  const child = await hoverHit(page, '子B');
  expect(child.hit && child.hit.type + '@' + child.hit.line).toBe('state@4');
  // 中の開始は複合状態 親 の開始 (最上位の開始と取り違えない)
  await expect(page.locator('#overlay-layer rect[data-type="pseudo"][data-id="start@親"]')).toHaveCount(1);
  await expect(page.locator('#overlay-layer rect[data-type="pseudo"][data-id="start@"]')).toHaveCount(1);
});

// BLK-migrator-20260929-1611: メンバーを指す note (`note right of Filter::apply`) は、紙と対象へ伸びる楔を 1 本の path で描く
// (接続線を別の線として持たない)。楔の上 (線の 25%・50% の点) に枠が 0 個だった。楔の形の当たりを全図種共通の 1 か所で置き、
// 楔のどこを指しても note 全体の枠が出て、押すと note の行が選ばれる。クラスを指す note・状態を指す note も同じ道を通る。
test('migrator 手順 4 — メンバー・クラス・状態を指す note の楔の上でも note の枠が出て、押すと note の行が選ばれる', async ({ page }) => {
  await bootPlain(page);
  const cases = [
    { dsl: ['@startuml', 'class Filter {', '  + apply(v : int) : int', '}', 'note right of Filter::apply', '  移動平均', 'end note', '@enduml'], line: '5' },
    { dsl: ['@startuml', 'class Filter {', '  + apply(v : int) : int', '}', 'note left of Filter', '  平滑化', 'end note', '@enduml'], line: '5' },
    { dsl: ['@startuml', '[*] --> Idle', 'Idle --> Run', 'note right of Idle', '  待機', 'end note', '@enduml'], line: '4' },
  ];
  for (const c of cases) {
    await typeDsl(page, c.dsl.join(String.fromCharCode(10)));
    // 数えるのは当たりの枠 (selectable)。楔込みの見た目だけの枠 (rect.note-frame) は数えない。
    await expect(page.locator('#overlay-layer rect.selectable[data-type="note"]')).toHaveCount(1, { timeout: 20000 });
    // 紙の外形の path から、紙の矩形の外へ飛び出した頂点 (楔の先) と前後の縁の頂点を取る。
    const pts = await page.evaluate(() => {
      const svg = document.querySelector('#preview-svg svg');
      const OB = window.MA.overlayBuilder;
      const paper = OB.notePapers(svg)[0];
      const tail = paper && OB.noteTails(paper)[0];
      if (!tail) return null;
      const ctm = paper.el.getScreenCTM();
      const toScr = (q) => { const p = new DOMPoint(q[0], q[1]).matrixTransform(ctm); return { x: p.x, y: p.y }; };
      const a = tail[0], tip = tail[1], b = tail[tail.length - 1];
      const base = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const at = (t) => toScr([base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t]);
      return [at(0.25), at(0.5), at(0.75)];
    });
    expect(pts, c.dsl[4] + ' の note に楔がある').not.toBeNull();
    for (const p of pts) {
      await page.mouse.move(p.x, p.y);
      const lit = await page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
        .map((r) => r.getAttribute('data-type') + ':' + r.getAttribute('data-line')));
      expect(lit, c.dsl[4] + ' の楔を指して note の枠が出る').toEqual(['note:' + c.line]);
      // 再確認 2: 光った枠は楔を含む紙の外形を包み、指した点が枠の内側 (8px 以内) にある。
      const out = await page.evaluate((q) => {
        const b = document.querySelector('#overlay-layer rect.hit-hover').getBoundingClientRect();
        return Math.max(b.left - q.x, q.x - b.right, b.top - q.y, q.y - b.bottom, 0);
      }, p);
      expect(out, c.dsl[4] + ' の楔の点が光った枠の内側').toBeLessThanOrEqual(8);
    }
    // 差し戻し 1 回目: 楔の縁そのもの (図の上では note から伸びる線に見える所) の上。対象の枠の外にある縁の点は note の枠が出る。
    const edgePts = await page.evaluate(() => {
      const svg = document.querySelector('#preview-svg svg');
      const OB = window.MA.overlayBuilder;
      const paper = OB.notePapers(svg)[0];
      const tail = OB.noteTails(paper)[0];
      const ctm = paper.el.getScreenCTM();
      const others = Array.from(document.querySelectorAll('#overlay-layer rect.selectable[data-type]'))
        .filter((r) => r.getAttribute('data-type') !== 'note' && !/overlay-background/.test(r.getAttribute('class') || ''))
        .map((r) => r.getBoundingClientRect());
      const out = [];
      [tail[0], tail[tail.length - 1]].forEach((end) => {
        const tip = tail[1];
        [0.2, 0.3, 0.45].forEach((t) => {
          const p = new DOMPoint(end[0] + (tip[0] - end[0]) * t, end[1] + (tip[1] - end[1]) * t).matrixTransform(ctm);
          if (others.some((b) => p.x >= b.left - 4 && p.x <= b.right + 4 && p.y >= b.top - 4 && p.y <= b.bottom + 4)) return;
          out.push({ x: p.x, y: p.y });
        });
      });
      return out;
    });
    expect(edgePts.length, c.dsl[4] + ' の楔の縁に対象の枠の外の点がある').toBeGreaterThan(0);
    for (const p of edgePts) {
      await page.mouse.move(p.x, p.y);
      const lit = await page.evaluate(() => Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
        .map((r) => r.getAttribute('data-type') + ':' + r.getAttribute('data-line')));
      expect(lit, c.dsl[4] + ' の楔の縁を指して note の枠が出る').toEqual(['note:' + c.line]);
    }
    await page.mouse.click(pts[1].x, pts[1].y);
    await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => s.type + ':' + s.line)))
      .toEqual(['note:' + c.line]);
    // 次の図の下ごしらえ: 選択を外す (同じ id の note を押し直すと選択が外れる作りのため)。
    await page.evaluate(() => window.MA.selection.clearSelection());
  }
});

// BLK-migrator-20260930-0157: 複合状態に付けた note (`note top of 運転`) の文字・点線の接続線に枠が出ず、それがあると同じ図の
// 別の note (`note right of 警戒`) の枠まで消えた (state は宣言の並び順で SVG の note と組にしていた)。note の枠は note 自身の行・
// 紙・接続線で全図種共通の 1 か所で当て、1 つの note の当て損ねが他の note の枠を消さない。
test('migrator 手順 4 — 複合状態に付けた note と中の状態の note の文字・点線の接続線・楔に本人の枠が出て、押すと note の行', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, ['@startuml', 'state 運転 {', '  [*] --> 通常', '  通常 --> 警戒', '}',
    'note top of 運転 : 複合の上', 'note right of 警戒 : 内側', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect.selectable[data-type="note"]:not([data-hit-kind])')).toHaveCount(2, { timeout: 20000 });
  const lit = async (pt) => {
    await page.mouse.move(3, 3);
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(100);
    // 光るのは同じ note の紙と接続線の枠 (同じ種類・行)。種類と行の組を 1 つずつ数える。
    return page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
      .map((r) => r.getAttribute('data-type') + ':' + r.getAttribute('data-line')))).join(','));
  };
  const textPt = (l) => page.evaluate((w) => {
    const t = Array.prototype.find.call(document.querySelectorAll('#preview-svg svg text'), (n) => (n.textContent || '').trim() === w);
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, l);
  // 接続線 (note の <g> を端に持つ点線) の長さの半分の点。楔 (紙の外形から対象へ伸びる尖り) の中ほどの点。
  const pts = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    const toScr = (el, x, y) => { const q = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()); return { x: q.x, y: q.y }; };
    const link = svg.querySelector('g.link path[style*="dasharray"]');
    const mid = link.getPointAtLength(link.getTotalLength() / 2);
    const OB = window.MA.overlayBuilder;
    const paper = OB.notePapers(svg).filter((p) => OB.noteTails(p).length)[0];
    const tail = OB.noteTails(paper)[0];
    const a = tail[0], tip = tail[1], b = tail[tail.length - 1];
    const bx = (a[0] + b[0]) / 2, by = (a[1] + b[1]) / 2;
    return { line: toScr(link, mid.x, mid.y), tail: toScr(paper.el, bx + (tip[0] - bx) * 0.4, by + (tip[1] - by) * 0.4) };
  });
  expect(await lit(await textPt('複合の上')), 'note top of 運転 の文字').toBe('note:6');
  expect(await lit(pts.line), 'note top of 運転 の点線の接続線').toBe('note:6');
  expect(await lit(await textPt('内側')), 'note right of 警戒 の文字').toBe('note:7');
  expect(await lit(pts.tail), 'note right of 警戒 の楔').toBe('note:7');
  // 押すと note の行が選ばれる。
  const top = await textPt('複合の上');
  await page.evaluate(() => window.MA.selection.setSelected([]));
  await page.mouse.click(top.x, top.y);
  await expect.poll(() => page.evaluate(() => (window.MA.selection.getSelected() || []).map((s) => s.type + ':' + s.line)))
    .toEqual(['note:6']);
});

// BLK-migrator-20260930-0323: 手続き (!procedure) が描いた遷移は、SVG の線の行が手続きの本文を指し、パーサの遷移 (呼んだ行) と
// 組にならず線・矢じり・ラベルに枠が出なかった (state-22)。行で組にならない線は両端の名前で遷移に当てる。
test('migrator 手順 4 — !procedure が描いた state 図の遷移の線・矢じり・ラベルに、呼んだ行の遷移の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, ['@startuml', '!procedure $ok($from, $to)', '  $from --> $to : 成功', '!endprocedure',
    'state V', 'state C', '$ok(V, C)', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="transition"]').first()).toBeAttached({ timeout: 20000 });
  const pts = await page.evaluate(() => {
    const g = document.querySelector('#preview-svg svg g.link');
    const p = g.querySelector('path');
    const at = p.getPointAtLength(p.getTotalLength() / 2);
    const q = new DOMPoint(at.x, at.y).matrixTransform(p.getScreenCTM());
    const hb = g.querySelector('polygon').getBoundingClientRect();
    return { line: { x: q.x, y: q.y }, head: { x: hb.left + hb.width / 2, y: hb.top + hb.height / 2 } };
  });
  for (const [what, pt] of [['線', pts.line], ['矢じり', pts.head]]) {
    await page.mouse.move(3, 3);
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(100);
    const lit = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('#overlay-layer rect.hit-hover'))
      .map((r) => r.getAttribute('data-type') + '@' + r.getAttribute('data-line')))).join(','));
    expect(lit, what).toBe('transition@7');
  }
  const lbl = await hoverHit(page, '成功');
  expect(lbl.hit && lbl.hit.type + '@' + lbl.hit.line).toBe('transition@7');
});

// BLK-migrator-20260929-1651: 古い skinparam (ParticipantPadding) を使うと PlantUML は図の先頭に警告の帯を描き、
// 1 番目の box の当たりがその帯に置かれて、見出しの文字にホバーしても枠が出なかった。囲みはライフラインの上端を包む rect で見分ける。
test('migrator 手順 4 — ParticipantPadding のあるシーケンス図でも box の見出しを指すと box の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, ['@startuml', 'skinparam ParticipantPadding 30', 'box "受注系" #EEF6FF', 'participant 画面',
    'participant 受注API', 'end box', '画面 -> 受注API : 登録', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="box"]')).toHaveCount(1, { timeout: 20000 });
  const h = await hoverHit(page, '受注系');
  expect(h.hit && h.hit.type + '@' + h.hit.line).toBe('box@3');
});

// BLK-migrator-20260929-2003: 矢印の線の中の書式 `[…]` を「最初の - の直後の #色」しか読まず、`-[bold]>` `-[dashed]>` `-[#red,bold]>`
// `--[#green]>` のメッセージに枠が出なかった。書式だけの図では参加者まで全要素が枠なし。書式は全図種共通の 1 か所で読む。
test('migrator 手順 4 — 矢印に書式 [bold] [dashed] [#red,bold] --[#green] を書いたシーケンス図でも、参加者とメッセージに本人の枠が出る', async ({ page }) => {
  await bootPlain(page);
  await typeDsl(page, ['@startuml', 'A -[bold]> B : 太', '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(1, { timeout: 20000 });
  for (const [label, want] of [['太', 'message@2'], ['A', 'participant@2'], ['B', 'participant@2']]) {
    const h = await hoverHit(page, label);
    expect(h.hit && h.hit.type + '@' + h.hit.line, label).toBe(want);
  }
  await typeDsl(page, ['@startuml', 'A -> B : x', 'B --[#green]> A : 残数', 'A -[#red,bold]> B : 赤太', 'A -[dashed]> B : 破',
    '@enduml'].join(String.fromCharCode(10)));
  await expect(page.locator('#overlay-layer rect[data-type="message"]')).toHaveCount(4, { timeout: 20000 });
  for (const [label, want] of [['x', 'message@2'], ['残数', 'message@3'], ['赤太', 'message@4'], ['破', 'message@5']]) {
    const h = await hoverHit(page, label);
    expect(h.hit && h.hit.type + '@' + h.hit.line, label).toBe(want);
  }
});
