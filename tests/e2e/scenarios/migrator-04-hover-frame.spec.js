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
  let y = null;
  for (let yy = Math.max(lb.y, grp.y) + 4; yy < Math.min(lb.y + lb.height, grp.y + grp.height) - 4; yy += 3) {
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
      const r = els.find((e) => e.tagName.toLowerCase() === 'rect' && e.closest('#overlay-layer') &&
        !/overlay-background/.test(e.getAttribute('class') || ''));
      return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line'),
        hover: /hit-hover/.test(r.getAttribute('class') || '') } : null;
    }, { x: box.x + (i % 2), y: box.y });
    if (hit && hit.hover) break;
  }
  return { box, hit };
}

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
  expect(await page.evaluate(() => document.getElementById('preview-svg').offsetTop)).toBeLessThan(40);
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
    const texts = page.locator('#preview-svg svg g.participant text', { hasText: name });
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
    const ls = Array.from(document.querySelectorAll('#preview-svg svg g.participant-lifeline[data-qualified-name="User"] line'))
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
    const ln = document.querySelector('#preview-svg svg g.participant-lifeline[data-qualified-name="B"] line').getBoundingClientRect();
    const msg = document.querySelector('#overlay-layer rect[data-type="message"][data-line="11"]').getBoundingClientRect();
    const arrow = document.querySelectorAll('#preview-svg svg g.message')[0].querySelector('line').getBoundingClientRect();
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
  const SEL = 'g.entity[data-qualified-name] > rect, g.entity[data-qualified-name] > polygon, g.start_entity > ellipse, g.end_entity > ellipse, g.link text, rect[fill="#555555"]';
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
