// @ts-check
// junior 台本 手順4: 日本語タイトルの末尾に「(資料用)」を付け足し、図(.puml)をこの名前で保存する。
// BLK-junior-20260909-0003: 付け足す先が「タイトル / Title」と「図名 / File name」の 2 か所に
// 分かれていて、毎回両方を書き換えていた。末尾の付け足しは片方だけで済む。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const BASE = 'GPIOドライバ状態遷移';
const NAME = BASE + '(資料用)';

// 図の設定タブを開き、タイトル欄の末尾に付け足す (書き換えるのはここ 1 か所だけ)。
async function appendToTitle(page, suffix) {
  await page.locator('#props-tab-settings').click();
  const title = page.locator('#ds-title');
  await title.fill((await title.inputValue()) + suffix);
  await title.dispatchEvent('change');
  await page.waitForTimeout(500);
}

test('手順4 タイトル末尾に (資料用) を付けて、その名前で保存フォルダに書ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);

  // 前周までの図を開いた状態 = タイトルと図名が base で揃っている。
  await S.renameActive(page, BASE);
  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').fill(BASE);
  await page.locator('#ds-title').dispatchEvent('change');
  await page.waitForTimeout(500);

  // 末尾を足すのはタイトル欄だけ。図名は連動して付く。
  await appendToTitle(page, '(資料用)');
  expect(await page.locator('#editor').inputValue()).toContain('(資料用)');
  expect(await page.locator('#ds-docname').inputValue()).toBe(NAME);
  await expect(page.locator('#ds-link-notice')).toContainText('図名 / File name');

  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);

  // 到達条件: その名前の .puml が保存先にある。
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
});

test('手順4 図名の末尾を足してもタイトルが追いつく (逆向き)', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);

  await S.renameActive(page, BASE);
  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').fill(BASE);
  await page.locator('#ds-title').dispatchEvent('change');
  await page.waitForTimeout(500);

  const name = page.locator('#ds-docname');
  await name.fill(NAME);
  await name.dispatchEvent('change');
  await page.waitForTimeout(600);

  expect(await page.locator('#ds-title').inputValue()).toBe(NAME);
  expect(await page.locator('#editor').inputValue()).toContain('(資料用)');
});

// BLK-junior-20260909-0203: 活動図の実体が手元にも先輩側にも無く、先輩のシーケンス図を
// 見ながら新規に組み立てた場面。雛形の Hello world を消しても既定の stop が残り、自分の
// アクション列が stop の後ろの孤立フローになっていた。工程名も全部打ち直していた。
test('手順4 先輩のシーケンス図から活動図を組み立て、(資料用) を付けて保存できる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 先輩の図が一覧にあり、タブに開いてある (台本 手順1 の状態)。
  await S.putDoc(page, DIR, 'gpio_init_sequence', S.GPIO_SEQ);
  await S.openFolderItem(page, 'gpio_init_sequence');

  // 新しいタブを活動図にすると、出るのは骨格 (start / stop) だけ。
  // BLK-junior-20260909-0703: 以前はここに :Hello world; というサンプルの工程が
  // 入っており、手本を持っている人は打ち始める前に消す一手間が要った。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await page.waitForTimeout(600);
  const fresh = await page.locator('#editor').inputValue();
  expect(fresh).not.toContain('Hello world');
  expect(fresh).toContain('start');
  expect(fresh).toContain('stop');

  // 工程名は先輩の図の矢印ラベルから借りる (打ち直さない)。
  // BLK-owner-20260925-0341-prune: 1 行 1 アクションの欄と「⧉ 他の図から取り込む」は種別チップ「まとめて」の中。
  await page.locator('#ac-tail-kind-chip-bulk').click();
  await page.locator('#ac-tail-reuse').click();
  await page.waitForSelector('#reuse-modal');
  await page.locator('#reuse-all').click();
  await page.locator('#reuse-confirm').click();
  await page.waitForTimeout(200);
  expect(await page.locator('#ac-tail-bulk').inputValue()).toContain('Gpio_Init');

  await page.locator('#ac-tail-add').click();
  await page.waitForTimeout(600);

  // 到達条件: Hello world は残らず、足した工程は start と stop の間に並ぶ。
  const dsl = await page.locator('#editor').inputValue();
  expect(dsl).not.toContain('Hello world');
  const body = dsl.split('\n').map((l) => l.trim()).filter((l) => l && !/^@/.test(l));
  expect(body[0]).toBe('start');
  expect(body[body.length - 1]).toBe('stop');
  expect(body).toContain(':Gpio_Init;');
  expect(body).toContain(':Gpio_Done;');

  const title = page.locator('#props-tab-settings');
  await title.click();
  const t = page.locator('#ds-title');
  await t.fill('GPIOドライバ初期化フロー(資料用)');
  await t.dispatchEvent('change');
  await page.waitForTimeout(600);

  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);
  const saved = await S.readDoc(page, DIR, 'GPIOドライバ初期化フロー(資料用)');
  expect(saved).not.toBeNull();
  expect(saved).toContain(':Gpio_Init;');
  expect(saved).not.toContain('Hello world');
});

// BLK-junior-20260909-0103: 新規タブ (図名が既定名 diagram2 … のまま) にタイトルを書いたとき、
// 末尾だけの連動では図名が「既定名 + (資料用)」になり、意図したファイル名にならなかった。
test('手順4 新規タブでもタイトルを書けば図名がその名前になる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // BLK-owner-20260929-1111-1: 保存先に前から diagram2.puml がある。新しいタブはその名前で開かず、
  // 打っても既存の図を書き換えない。
  const KEEP = '@startuml\nAlice -> Bob : ORIGINAL_KEEP_ME\n@enduml\n';
  await S.putDoc(page, DIR, 'diagram2', KEEP);

  // 新しいタブを開く = 図名は既定名 (diagram3 など。保存先の diagram2 とは重ならない)、タイトルは空。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await S.typeDsl(page, S.GPIO_STATE);
  await page.locator('#props-tab-settings').click();
  const auto = await page.locator('#ds-docname').inputValue();
  expect(auto).toMatch(/^diagram/);
  expect(auto).not.toBe('diagram2');

  // 書くのはタイトル 1 か所だけ。
  const title = page.locator('#ds-title');
  await title.fill(NAME);
  await title.dispatchEvent('change');
  await page.waitForTimeout(600);

  expect(await page.locator('#ds-docname').inputValue()).toBe(NAME);
  expect(auto === NAME).toBe(false);

  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
  const kept = await S.readDoc(page, DIR, 'diagram2');
  expect(kept).toContain('ORIGINAL_KEEP_ME');
  expect(kept).not.toContain('Gpio');
});

// BLK-junior-20260909-0203-wish: 6 周目のアクティビティ図では、処理順が先輩の
// シーケンス図に既にあるのに、アクティビティ図側に取り込む口が無く、同じ順序の
// Action を手で打ち直していた。手順4 が「取り込む → (資料用) を付けて保存」で
// 済むこと (打ち直しが 0 打鍵になること) をここで固定する。
const GPIO_INIT_SEQ = [
  '@startuml',
  'title GPIO_Init_Sequence',
  'actor App',
  'participant Gpio_Driver',
  'participant GpioRegs',
  'participant ClockCtrl',
  'participant IRQCtrl',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver -> ClockCtrl : EnableClock()',
  'Gpio_Driver -> GpioRegs : WriteConfig()',
  'Gpio_Driver -> IRQCtrl : EnableIrq()',
  'IRQCtrl --> Gpio_Driver : Ack',
  'Gpio_Driver --> App : InitDone',
  '@enduml',
].join('\n');

const ACT_NAME = 'GPIOドライバ初期化アクティビティ図(資料用)';
