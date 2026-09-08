const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('./helpers');

// BLK-reviewer-20260908-1703 の画面写真。整合性チェックに「ラベル位置の慣習ズレ」が
// 並び、dma だけが末尾を指していることが 18 枚を開かずに読めるところを撮る。
function stateDsl(to, label) {
  return ['@startuml', '[*] --> Idle', 'Idle --> ' + to + ' : ' + label, '@enduml'].join('\n');
}
function seqDsl(msgs) {
  return ['@startuml', 'actor App', 'participant Drv']
    .concat(msgs.map((m) => 'App -> Drv : ' + m)).concat(['@enduml']).join('\n');
}
function headFamily(key, entry) {
  return [
    [key + '_state', stateDsl('Configured', entry)],
    [key + '_init_sequence', seqDsl([entry, 'EnableClock', 'WriteConfig'])],
  ];
}
const DMA = [
  ['dma_state', stateDsl('Armed', 'ArmChannel')],
  ['dma_transfer_sequence', seqDsl(['SetSrcDst', 'WriteConfig', 'ArmChannel'])],
];

async function addDoc(page, name, dsl, first) {
  if (!first) await page.locator('#btn-tab-new').click();
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
  await page.waitForTimeout(60);
}

test('shot: 整合性チェックにラベル位置の慣習ズレが並ぶ', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  let docs = [];
  ['adc', 'gpio', 'timer', 'uart', 'spi'].forEach((k) => {
    docs = docs.concat(headFamily(k, k.charAt(0).toUpperCase() + k.slice(1) + '_Init'));
  });
  docs = docs.concat(DMA);
  let first = true;
  for (const [name, dsl] of docs) { await addDoc(page, name, dsl, first); first = false; }
  await page.evaluate(() => window.renderConsistencyBadge && window.renderConsistencyBadge());
  await page.locator('#status-consistency').click();
  await page.waitForSelector('#ck-labelpos .ck-row');
  await page.waitForTimeout(300);
  await page.locator('#ck-modal-content').screenshot({ path: shotOut('shot-blk-reviewer-1703.png') });
});
