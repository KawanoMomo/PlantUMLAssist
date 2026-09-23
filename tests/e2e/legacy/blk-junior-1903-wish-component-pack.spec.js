// @ts-check
// BLK-junior-20260908-1903-wish 部品の図をまとめて資料化 — 設計書には同じ部品の
// 全図種を並べて貼るのに、Export は 1 回 1 枚しか出せず「開き直す → Export → PNG」を
// 図種の数だけ繰り返していた。保存フォルダから部品ごとに図を集め、図番号を振った
// PNG セットを 1 回の操作で出せることを確かめる。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const DIR_REL = './test-results/autosave/cpack/blk-junior-1903-wish';
const DIR_ABS = path.join(__dirname, '..', '..', '..', 'test-results', 'autosave', 'cpack', 'blk-junior-1903-wish');

function seq(n) {
  return '@startuml\nparticipant ' + n + 'Drv\nparticipant ' + n + 'Hw\n' + n + 'Drv -> ' + n + 'Hw: init\n@enduml\n';
}
function state(n) {
  return '@startuml\n[*] --> Idle\nIdle --> Ready : ' + n + '_init\nReady --> [*]\n@enduml\n';
}
function usecase(n) {
  return '@startuml\nactor User\nUser --> (' + n + ' init)\n@enduml\n';
}

// zip は無圧縮 (store)。名前と中身の先頭バイトを拾う。
function readZip(buf) {
  const u16 = (o) => buf.readUInt16LE(o);
  const u32 = (o) => buf.readUInt32LE(o);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = u16(eocd + 10);
  const out = [];
  let p = u32(eocd + 16);
  for (let n = 0; n < count; n++) {
    const nameLen = u16(p + 28);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const size = u32(p + 24);
    const local = u32(p + 42);
    const dataAt = local + 30 + u16(local + 26) + u16(local + 28);
    out.push({ name, size, head: buf.slice(dataAt, dataAt + 8) });
    p += 46 + nameLen + u16(p + 30) + u16(p + 32);
  }
  return out;
}

function seedFolder() {
  fs.mkdirSync(DIR_ABS, { recursive: true });
  for (const f of fs.readdirSync(DIR_ABS)) fs.unlinkSync(path.join(DIR_ABS, f));
  // GPIO ドライバの 3 図種 (図種は名前でしか分からない) と、別部品の 1 枚。
  fs.writeFileSync(path.join(DIR_ABS, 'GPIOドライバユースケース.puml'), usecase('GPIO'), 'utf8');
  fs.writeFileSync(path.join(DIR_ABS, 'GPIOドライバ初期化シーケンス.puml'), seq('GPIO'), 'utf8');
  fs.writeFileSync(path.join(DIR_ABS, 'GPIOドライバ状態遷移.puml'), state('GPIO'), 'utf8');
  fs.writeFileSync(path.join(DIR_ABS, 'CANドライバ初期化シーケンス.puml'), seq('CAN'), 'utf8');
}

async function openApp(page) {
  await page.addInitScript((dir) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: dir }));
    } catch (e) {}
  }, DIR_REL);
  await gotoApp(page);
  await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
}

async function openPack(page) {
  await page.locator('#btn-export').click();
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-scope', { state: 'visible' });
  await page.locator('#dsc-parts').click();
  await expect(page.locator('#cpack-modal')).toBeVisible();
  await expect(page.locator('#cpack-body label.cpack-row')).not.toHaveCount(0, { timeout: 15000 });
}

test.beforeEach(() => { seedFolder(); });

test('保存フォルダの図が部品ごとにまとまって出る', async ({ page }) => {
  await openApp(page);
  await openPack(page);
  const names = await page.locator('#cpack-body .cpack-name').allInnerTexts();
  // GPIO は 3 図種が 1 部品にまとまる (図種の語が違っても同じ部品)
  expect(names).toContain('GPIOドライバ');
  const rows = await page.locator('#cpack-body label.cpack-row').allInnerTexts();
  expect(rows.filter((r) => r.includes('GPIOドライバ') && r.includes('3 枚')).length).toBe(1);
  // 別部品の CAN は GPIO に混ざらず、独立した 1 枚の部品として並ぶ
  const can = rows.filter((r) => r.startsWith('CANドライバ'));
  expect(can.length).toBe(1);
  expect(can[0]).toContain('1 枚');
});

test('部品を選ぶと、振られる図番号が押す前に見える', async ({ page }) => {
  await openApp(page);
  await openPack(page);
  await page.locator('#cpack-body input.cpack-radio[value="GPIOドライバ"]').check();
  const figs = await page.locator('#cpack-preview .cpack-fig').allInnerTexts();
  // 設計書の読み順 (用途 → 動き → 状態) で通し番号が振られる
  expect(figs).toEqual([
    '図1 GPIOドライバ ユースケース図',
    '図2 GPIOドライバ シーケンス図',
    '図3 GPIOドライバ 状態遷移図',
  ]);
});

test('1 回の操作で、図番号付き PNG と図一覧が 1 つの zip で出る', async ({ page }) => {
  await openApp(page);
  await openPack(page);
  await page.locator('#cpack-body input.cpack-radio[value="GPIOドライバ"]').check();

  const waitDownload = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('#cpack-run').click();
  const download = await waitDownload;
  expect(download.suggestedFilename()).toContain('GPIOドライバ-資料-');

  const entries = readZip(fs.readFileSync(await download.path()));
  const names = entries.map((e) => e.name).sort();
  expect(names).toEqual([
    '図1_GPIOドライバ_ユースケース図.png',
    '図2_GPIOドライバ_シーケンス図.png',
    '図3_GPIOドライバ_状態遷移図.png',
    '図一覧.md',
  ].sort());

  // PNG は文字列に潰れず、バイト列のまま入っている
  for (const e of entries) {
    if (!e.name.endsWith('.png')) continue;
    expect(e.size).toBeGreaterThan(100);
    expect(Array.from(e.head.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }

  await expect(page.locator('#cpack-state')).toContainText('3 枚を PNG で書き出しました', { timeout: 15000 });
});
