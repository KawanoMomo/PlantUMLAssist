// @ts-check
// primary 台本 手順9.5: SPI 状態遷移に「Fault からの復帰」を足す。遷移 4 本と子状態 1 つを
// 遷移フォーム (右ペイン「追加」) だけで入れ、本文欄には触らない。1 本あたり 3 クリック以下。
// BLK-primary-20260923-2312-friction: 確定のたびに種別チップが「状態」に、親が先頭に、
// From が先頭に戻り、1 本ごとに [チップ]→[From]→[To]→[追加] の 4 クリックが要っていた。
// 到達条件は「確定しても種別チップ・親・From・関係の種類が前回のまま」で、図種を替えたときだけ既定に戻ること。
// ユースケース図の関係、シーケンス図の参加者・メッセージも同じ「末尾に追加」フォームなので同じ扱いを確かめる。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

const SPI_STATE = [
  '@startuml',
  'title SPIドライバ状態遷移',
  'state Idle',
  'state Busy',
  'state Error',
  'state Diagnosing',
  '[*] --> Idle',
  'Idle --> Busy : Spi_Transmit',
  'Busy --> Idle : Spi_Complete',
  'Busy --> Error : Spi_Fault',
  '@enduml',
].join('\n');

const UC = [
  '@startuml',
  'actor Dev',
  'actor Rtos',
  'usecase "初期化" as UC1',
  'usecase "送信" as UC2',
  'usecase "受信" as UC3',
  '@enduml',
].join('\n');

const SEQ = [
  '@startuml',
  'participant App',
  'participant Spi_Driver',
  'participant SpiRegs',
  'App -> Spi_Driver : Spi_Init',
  '@enduml',
].join('\n');

async function dsl(page) {
  return page.locator('#editor').inputValue();
}

async function kindOf(page, prefix) {
  return page.locator('#' + prefix + '-tail-kind').inputValue();
}

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickOverlay(page, type, id) {
  const hit = page.locator('#overlay-layer [data-type="' + type + '"][data-id="' + id + '"]').first();
  await expect(hit).toBeAttached({ timeout: 15000 });
  const box = await hit.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + type + ' ' + id);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitRendered(page, text) {
  await expect.poll(async () => (await dsl(page)).includes(text), { timeout: 10000 }).toBe(true);
  await page.waitForTimeout(600);
}

test('手順9.5 子状態 1 つと遷移 4 本を、確定のたびに種別・親を選び直さずに入れられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, SPI_STATE);
  await page.waitForTimeout(800);

  // 子状態: チップ「状態」→ 追加する位置「Error の中」→ 名前 → 追加 (BLK-owner-20260925-0312-3: 親は位置の 1 欄で選ぶ)。
  let clicks = 0;
  await page.locator('#st-tail-kind-chip-state').click(); clicks++;
  await page.locator('#st-tail-where').selectOption({ label: 'Error の中' }); clicks++;
  await page.locator('#st-tail-id').fill('Retrying');
  // BLK-owner-20260924-2232-4: 名前の欄で Enter を押せば「+ 追加 (Enter)」を押したのと同じ (マウスに持ち替えない)。
  await expect(page.locator('#st-tail-add')).toBeVisible();
  await page.locator('#st-tail-id').press('Enter');
  await waitRendered(page, 'state Retrying');
  expect(clicks).toBeLessThanOrEqual(3);
  // 確定後も「子状態」のまま、親は Error のまま (次の子は名前を打つだけ)。
  expect(await kindOf(page, 'st')).toBe('state');
  await expect(page.locator('#st-tail-where')).toHaveValue('in:Error');

  // 遷移 4 本。From は直前の To を引き継ぎ、To は図の状態を押す。種別チップは最初の 1 回だけ。
  const perTx = [];
  // 1 本目: Error → Retrying
  clicks = 0;
  await page.locator('#st-tail-kind-chip-transition').click(); clicks++;
  await page.locator('#st-tail-from').selectOption('Error'); clicks++;
  await clickOverlay(page, 'state', 'Error.Retrying'); clicks++;
  await expect(page.locator('#st-tail-to')).toHaveValue('Error.Retrying');
  await page.locator('#st-tail-trig').fill('Spi_Retry');
  await page.locator('#st-tail-trig').press('Enter');
  await waitRendered(page, ': Spi_Retry');
  perTx.push(clicks);
  expect(await kindOf(page, 'st')).toBe('transition');
  await expect(page.locator('#st-tail-from')).toHaveValue('Error.Retrying');

  // 2 本目: Retrying → Diagnosing (From は引き継いだまま)
  clicks = 0;
  await clickOverlay(page, 'state', 'Diagnosing'); clicks++;
  await page.locator('#st-tail-trig').fill('Spi_Diag');
  await page.locator('#st-tail-trig').press('Enter');
  await waitRendered(page, ': Spi_Diag');
  perTx.push(clicks);
  expect(await kindOf(page, 'st')).toBe('transition');

  // 3 本目: Retrying → Idle (From を選び直す)
  clicks = 0;
  await page.locator('#st-tail-from').selectOption('Error.Retrying'); clicks++;
  await clickOverlay(page, 'state', 'Idle'); clicks++;
  await page.locator('#st-tail-trig').fill('Spi_Recovered');
  await page.locator('#st-tail-trig').press('Enter');
  await waitRendered(page, ': Spi_Recovered');
  perTx.push(clicks);

  // 4 本目: Diagnosing → Retrying
  clicks = 0;
  await page.locator('#st-tail-from').selectOption('Diagnosing'); clicks++;
  await clickOverlay(page, 'state', 'Error.Retrying'); clicks++;
  await page.locator('#st-tail-trig').fill('Spi_Retry');
  await page.locator('#st-tail-trig').press('Enter');
  await expect.poll(async () => ((await dsl(page)).match(/: Spi_Retry/g) || []).length, { timeout: 10000 }).toBe(2);
  perTx.push(clicks);

  // 到達条件: 4 本とも入り、どの 1 本も 3 クリック以下。
  const parsed = await page.evaluate((t) => {
    const p = window.MA.modules.plantumlState.parse(t);
    return p.transitions.map((x) => x.from + '>' + x.to);
  }, await dsl(page));
  for (const pair of ['Error>Retrying', 'Retrying>Diagnosing', 'Retrying>Idle', 'Diagnosing>Retrying']) {
    expect(parsed).toContain(pair);
  }
  for (const c of perTx) expect(c).toBeLessThanOrEqual(3);
  expect(await kindOf(page, 'st')).toBe('transition');
});

// BLK-owner-20260926-0550-2: 状態を選んだ右パネルの「→ ここから遷移」も、種別チップ「遷移」と同じ連続入力フォームを開く。
// 種別の覚えが「状態」(子状態を足した直後・回を閉じた直後) のとき、このボタンの道だけ右パネルが「状態」の追加フォームに戻り、
// 次に図で押した状態はただ選ばれていた。子状態から始めても、回を閉じて別の状態から始め直しても、次に図で押した状態が To に入る。
test('手順9.5 状態を選んだ右パネルの「→ ここから遷移」から、図で押した状態へ遷移を続けて入れられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, SPI_STATE);
  await page.waitForTimeout(800);

  // 子状態を 1 つ足しておく (種別の覚えが「状態」になる)。
  await page.locator('#st-tail-kind-chip-state').click();
  await page.locator('#st-tail-where').selectOption({ label: 'Error の中' });
  await page.locator('#st-tail-id').fill('Retrying');
  await page.locator('#st-tail-id').press('Enter');
  await waitRendered(page, 'state Retrying');
  expect(await kindOf(page, 'st')).toBe('state');

  // 子状態 Retrying を図で選び「→ ここから遷移」→ 図で Idle → きっかけ + Enter (クリック 3)。
  let clicks = 0;
  await clickOverlay(page, 'state', 'Error.Retrying'); clicks++;
  await page.locator('#st-add-tx').click(); clicks++;
  expect(await kindOf(page, 'st')).toBe('transition');
  await expect(page.locator('#st-tail-from')).toHaveValue('Error.Retrying');
  await expect(page.locator('#st-tail-to')).toHaveValue('');
  await expect(page.locator('#st-tx-hint')).toContainText('遷移先');
  await clickOverlay(page, 'state', 'Idle'); clicks++;
  await expect(page.locator('#st-tail-to')).toHaveValue('Idle');
  await expect(page.locator('#st-tail-trig')).toBeFocused();
  await page.keyboard.type('Spi_Recovered');
  await page.keyboard.press('Enter');
  await waitRendered(page, ': Spi_Recovered');
  expect(clicks).toBeLessThanOrEqual(3);
  // フォームは開いたまま。次の From は直前の To。
  expect(await kindOf(page, 'st')).toBe('transition');
  await expect(page.locator('#st-tail-from')).toHaveValue('Idle');
  await expect(page.locator('#st-tx-count')).toContainText('1');

  // 回を閉じる (種別は「状態」に戻り、覚えも「状態」)。
  await page.locator('#st-tx-close').click();
  expect(await kindOf(page, 'st')).toBe('state');

  // 閉じた後 (覚えが「状態」) に別の状態から始め直しても同じ。
  await clickOverlay(page, 'state', 'Diagnosing');
  await page.waitForTimeout(300);
  await page.locator('#st-add-tx').click();
  expect(await kindOf(page, 'st')).toBe('transition');
  await expect(page.locator('#st-tail-from')).toHaveValue('Diagnosing');
  await clickOverlay(page, 'state', 'Busy');
  await expect(page.locator('#st-tail-to')).toHaveValue('Busy');
  await page.keyboard.type('Spi_Rediag');
  await page.keyboard.press('Enter');
  await waitRendered(page, ': Spi_Rediag');

  const parsed = await page.evaluate((t) => {
    const p = window.MA.modules.plantumlState.parse(t);
    return p.transitions.map((x) => x.from + '>' + x.to + ':' + (x.trigger || x.label || ''));
  }, await dsl(page));
  expect(parsed.some((x) => /Retrying>Idle/.test(x))).toBe(true);
  expect(parsed.some((x) => /^Diagnosing>Busy/.test(x))).toBe(true);
});

test('手順9.5 ユースケース図の関係は、確定しても種類と From が前回のまま', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, UC);
  await page.waitForTimeout(600);
  await page.locator('#uc-tail-kind-chip-relation').click();
  await page.locator('#uc-tail-rkind-cards [data-value="include"]').click();
  await page.locator('#uc-tail-from').selectOption('UC1');
  await page.locator('#uc-tail-to').selectOption('UC2');
  await page.locator('#uc-tail-add').click();
  await waitRendered(page, 'UC1 ..> UC2');
  expect(await kindOf(page, 'uc')).toBe('relation');
  await expect(page.locator('#uc-tail-rkind')).toHaveValue('include');
  await expect(page.locator('#uc-tail-from')).toHaveValue('UC1');
  // 次の 1 本は To を選ぶだけ。確定は選択欄で Enter (BLK-owner-20260924-2232-4)。
  await page.locator('#uc-tail-to').selectOption('UC3');
  await page.locator('#uc-tail-to').press('Enter');
  await waitRendered(page, 'UC1 ..> UC3');
  expect(await dsl(page)).toMatch(/UC1 \.\.> UC3 : <<include>>|UC1 \.\.> UC3/);
});

test('手順9.5 シーケンス図: 参加者は続けて足せ、メッセージは From が直前の To・To は図で押す', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, SEQ);
  await page.waitForTimeout(600);

  // 参加者を足した直後も「参加者」のまま。
  await page.locator('#seq-tail-kind-chip-participant').click();
  await page.locator('#seq-tail-alias').fill('Isr');
  // BLK-owner-20260924-2232-4: 入力欄で Enter = 「+ 追加」。
  await page.locator('#seq-tail-alias').press('Enter');
  await waitRendered(page, 'participant Isr');
  expect(await kindOf(page, 'seq')).toBe('participant');

  await page.locator('#seq-tail-kind-chip-message').click();
  await page.locator('#seq-tail-from').selectOption('App');
  await page.locator('#seq-tail-to').selectOption('SpiRegs');
  await page.locator('#seq-tail-add').click();
  await waitRendered(page, 'App -> SpiRegs');
  expect(await kindOf(page, 'seq')).toBe('message');
  // 自己メッセージ (App / App) に戻さない。From は直前の To、To は空欄。
  await expect(page.locator('#seq-tail-from')).toHaveValue('SpiRegs');
  await expect(page.locator('#seq-tail-to')).toHaveValue('');
  // To は図の参加者を押して入れる (選択は動かない)。
  await clickOverlay(page, 'participant', 'Spi_Driver');
  await expect(page.locator('#seq-tail-to')).toHaveValue('Spi_Driver');
  // BLK-owner-20260924-2232-4: 本文欄で打って Enter で足す (Shift+Enter は改行のまま、末尾の空白は書かない)。
  const tailLabel = page.locator('#seq-tail-label-rle .rle-textarea');
  await tailLabel.click();
  await page.keyboard.type('xfer  ');
  await page.keyboard.press('Enter');
  await waitRendered(page, 'SpiRegs -> Spi_Driver : xfer');
  expect(await dsl(page)).not.toMatch(/SpiRegs -> Spi_Driver : xfer[ 	]+$/m);

  // 図種を切り替えたら既定に戻る。
  await S.typeDsl(page, SPI_STATE);
  await page.waitForTimeout(600);
  expect(await kindOf(page, 'st')).toBe('state');
  await S.typeDsl(page, SEQ);
  await page.waitForTimeout(600);
  expect(await kindOf(page, 'seq')).toBe('message');
  await expect(page.locator('#seq-tail-from')).toHaveValue('App');
});
