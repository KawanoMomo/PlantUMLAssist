// @ts-check
// migrator 台本 手順 4「選択枠」— 実物の .puml の要素に順にホバーし、出る枠がその要素を指す。
// BLK-migrator-20260917-2349-b: 可視性 -/#/~ 付きの C 風メンバー (`- uint8 pinState`) に枠が出なかった。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { bootPlain, typeDsl, dirFor, absDirFor } = require('./_scenario');

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
