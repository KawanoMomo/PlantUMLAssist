// @ts-check
// BLK-reviewer-20260908-1603: 遷移密度が uart を外れ値と名指ししたが、これは粒度の崩れではなく
// UART が TX/RX 双方向を持つという構造の違いだった。原因は分母 (初期化シーケンスの
// メッセージ = Uart_Init() の中身) と分子 (状態機械全体) が別のものを数えていること。
// 分母が状態機械と同じ粒度でない系統は数えず、そのことを画面で言う、を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// 初期化の「中身」を描いたシーケンス図 (実データの *_init_sequence.puml と同じ形)。
function initSeq(prefix) {
  return [
    '@startuml', 'actor App', 'participant ' + prefix + '_Driver',
    'App -> ' + prefix + '_Driver : ' + prefix + '_Init()',
    prefix + '_Driver -> ClockCtrl : EnableClock()',
    prefix + '_Driver -> ' + prefix + 'Regs : WriteConfig()',
    prefix + '_Driver --> App : InitDone',
    '@enduml',
  ].join('\n');
}

function stateDsl(pairs) {
  return ['@startuml', '[*] --> Idle']
    .concat(pairs.map((p) => p[0] + ' --> ' + p[1] + ' : ' + p[2]))
    .concat(['@enduml']).join('\n');
}

function uni(key) {
  const cap = key[0].toUpperCase() + key.slice(1);
  return [
    [key + '_state', stateDsl([
      ['Idle', 'Configured', cap + '_Init'],
      ['Configured', 'Busy', cap + '_Transmit'],
      ['Busy', 'Configured', 'TransferComplete'],
    ])],
    [key + '_init_sequence', initSeq(cap)],
  ];
}

// TX/RX を持つ双方向の系統。粒度は他と同じ 1 操作 1 遷移だが、状態機械は広い。
const UART = [
  ['uart_state', stateDsl([
    ['Idle', 'Configured', 'Uart_Init'],
    ['Configured', 'Transmitting', 'Uart_Send'],
    ['Configured', 'Receiving', 'Uart_Recv'],
    ['Transmitting', 'Configured', 'TxDone'],
    ['Receiving', 'Configured', 'RxDone'],
    ['Transmitting', 'Fault', 'FramingError'],
    ['Fault', 'Idle', 'Uart_Reset'],
  ])],
  ['uart_init_sequence', initSeq('Uart')],
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
  await page.waitForTimeout(80);
}

async function setup(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  const docs = [].concat(uni('spi'), uni('can'), UART);
  let first = true;
  for (const [name, dsl] of docs) { await addDoc(page, name, dsl, first); first = false; }
  await page.locator('#btn-tab-family').click();
  await expect(page.locator('#fa-modal')).toBeVisible();
}

test.describe('BLK-reviewer-1603: 分母が状態機械と同じ粒度かを先に見る', () => {
  test('双方向系統が外れ値として名指しされない', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#fd-table .fd-row[data-key="uart"]')).toHaveCount(1);
    await expect(page.locator('#fd-table .fd-outlier')).toHaveCount(0);
    await expect(page.locator('#fd-summary')).not.toContainText('外れた系統');
  });

  test('数えなかった理由を行に書き、密度は「—」にする', async ({ page }) => {
    await setup(page);
    const row = page.locator('#fd-table .fd-row[data-key="uart"]');
    await expect(row.locator('.fd-density')).toHaveText('—');
    await expect(row.locator('.fd-why')).toContainText('シーケンス図が状態機械と同じ粒度ではありません');
    // 4 メッセージのうち遷移に対応するのは Uart_Init() だけ
    await expect(row.locator('.fd-matched')).toHaveText('1');
  });

  test('見出しが「数えていない系統」を名指しする', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#fd-summary')).toContainText('同じ粒度でない系統 3 件');
    await expect(page.locator('#fd-summary')).toContainText('uart');
  });
});
