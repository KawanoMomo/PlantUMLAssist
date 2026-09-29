const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('../helpers');

// 保存先の一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開き、開くたびに読み直す
// (BLK-owner-20260924-0637-1。scenarios/_scenario.js の openFolder と同じ経路)。
async function openFolder(page) {
  await require('../scenarios/_scenario').openFolder(page);
}

// BLK-reviewer-20260908-0923-wish の画面写真。📂一覧に「直近 5 分に更新された図」の
// 印と名前が出て、「更新中を除いて選ぶ」が並んでいるところを撮る。
const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-reviewer-0923-wish.png');

const A1 = '@startuml\n[*] --> Idle\nIdle --> Busy : Timer_StartConv\nBusy --> Idle : 完了\n@enduml';
const B1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';

test('shot: 書き込み中かもしれない図の印', async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
  for (const [name, dsl] of [['adc_state', A1], ['spi_seq', B1], ['timer_state', A1]]) {
    await page.evaluate(async (a) => {
      await fetch('/autosave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
      });
    }, { name, dsl, dir: DIR });
  }
  // 写真の中で「落ち着いている図」と「更新中の図」が両方見えるようにする。
  // 5 分待つ代わりに、一覧の答えの更新時刻だけを差し替える (判定は本番の道を通る)。
  await page.route('**/autosave?*', async (route, request) => {
    if (request.method() !== 'GET') return route.continue();
    const resp = await route.fetch();
    const body = await resp.json();
    (body.entries || []).forEach((e) => {
      if (e.name === 'spi_seq') { e.mtime = '2026-09-07T01:12:00Z'; e.svgMtime = null; }
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await openFolder(page);
  await page.waitForSelector('#folder-panel.open .folder-item');
  await page.waitForSelector('#folder-panel .folder-write-badge');
  await page.waitForTimeout(300);
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
