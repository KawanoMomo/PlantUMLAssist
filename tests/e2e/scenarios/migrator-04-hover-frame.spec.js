// @ts-check
// migrator 台本 手順 4「選択枠」— 実物の .puml の要素に順にホバーし、出る枠がその要素を指す。
// BLK-migrator-20260917-2349-b: 可視性 -/#/~ 付きの C 風メンバー (`- uint8 pinState`) に枠が出なかった。
const { test, expect } = require('@playwright/test');
const { bootPlain, typeDsl } = require('./_scenario');

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
