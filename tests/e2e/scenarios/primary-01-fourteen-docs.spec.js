// @ts-check
// primary 台本 手順1: 横断対象の 14 枚を用意する(無ければ作る)。保存先は persona-data\primary。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順1 14 枚が保存先に揃い、一覧から数えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 用意されていない図は作る、が台本。ここでは 13 枚だけ置いて 1 枚足りない状態から始める。
  const missing = S.PRIMARY_DOCS[S.PRIMARY_DOCS.length - 1];
  for (const n of S.PRIMARY_DOCS.slice(0, -1)) await S.putDoc(page, DIR, n, S.docFor(n));
  expect((await S.listDir(page, DIR)).length).toBe(13);

  // 足りない 1 枚 (ADC 状態遷移) を作って保存する。
  await S.putDoc(page, DIR, missing, S.docFor(missing));

  // 到達条件: 14 枚すべてが保存先にあり、一覧に名前で並ぶ。
  const names = await S.listDir(page, DIR);
  expect(names.length).toBe(14);
  for (const n of S.PRIMARY_DOCS) expect(names).toContain(n);

  await S.openFolder(page);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="adc_state"]')).toBeVisible();
});

// BLK-reviewer-20260914-1406-wish: 手順1 で揃えた図のうち 1 枚の中身が、別の図の
// 複製で丸ごと塗り潰されていても、一覧は名前と枚数しか言わなかった。事故が見つかったのは
// reviewer が 31 枚の DSL を 1 枚ずつ読んだ後で、primary は保存直後には気付けない。
// 「名乗っている図種」と「本文が描く図種」の食い違いが一覧に出ることを到達条件にする。
test('手順1 中身が別の図で塗り潰された 1 枚を、全文を読まずに一覧で見つけられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n));
  // 事故そのもの: ユースケース図のファイルに、別の図 (SPI 初期化シーケンス) の本文が丸ごと入る。
  await S.putDoc(page, DIR, 'plantuml-usecase', S.docFor('spi_init_sequence'));
  // 正しいユースケース図。server の図種判定は `actor` をシーケンスと読むので、
  // ここが赤くなると印が毎回出て役に立たなくなる (疑いの出た図は本文まで見る)。
  await S.putDoc(page, DIR, 'driver_use_case', ['@startuml', 'left to right direction',
    'actor 開発者', '(ドライバを設定する)', '開発者 --> (ドライバを設定する)', '@enduml'].join('\n'));

  await S.openFolder(page);
  // 到達条件 1: 一覧の 1 行が、食い違った図を名指しする (枚数も出るので、
  // 「0 件」が照合できていないだけなのかどうかも読める)。
  const line = page.locator('#folder-kind-mismatch');
  await expect(line).toBeVisible();
  await expect(line).toContainText('図種ずれ: 1 件');
  await expect(line).toContainText('plantuml-usecase');

  // 到達条件 2: その図の行にだけ印が付き、名乗りと本文の両方がその場で読める。
  const badge = page.locator('#folder-panel [data-kind-mismatch="plantuml-usecase"]');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('名乗り ユースケース');
  await expect(badge).toContainText('本文 シーケンス');
  // 到達条件 3: 正しいユースケース図は赤くならない (印が付くのは事故の 1 枚だけ)。
  await expect(page.locator('#folder-panel [data-kind-mismatch="driver_use_case"]')).toHaveCount(0);
  expect(await page.locator('#folder-panel [data-kind-mismatch]').count()).toBe(1);
});

// BLK-primary-20260924-0805-design (design 10a): 14 枚を次々見て回るとき、1 回押しただけの図がタブ列に積もっていた。
// 保存先ツリーの行の 1 回押しは仮のタブ (斜体) で開き、次の 1 回押しで中身が入れ替わる。
// ダブルクリック・本文を 1 か所直す で固定のタブになる (実マウスの click / dblclick)。
test('手順1 14 枚を 1 回押しで見て回ってもタブは 1 枚だけ増え、ダブルクリックか編集で固定になる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n));
  await S.openFolder(page);
  const tabs = page.locator('#tab-bar .tab');
  const before = await tabs.count();
  const row = (n) => page.locator('#folder-panel .folder-item[data-file-name="' + n + '"]');
  const [a, b, c, d] = S.PRIMARY_DOCS;

  // 1 回押しを 3 枚続けても、増えるタブは仮の 1 枚だけ (中身が入れ替わる)。
  for (const n of [a, b, c]) {
    await row(n).click();
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', n);
    await expect(tabs).toHaveCount(before + 1);
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-preview', '1');
  }
  await expect(page.locator('#tab-bar .tab[data-doc-name="' + a + '"]')).toHaveCount(0);
  // 仮のタブは斜体で固定のタブと見分けが付く。
  await expect(page.locator('#tab-bar .tab.active .tab-label')).toHaveCSS('font-style', 'italic');

  // ダブルクリックで固定。次の 1 回押しでは入れ替わらず、仮のタブが別に 1 枚増える。
  await row(c).dblclick();
  await expect(page.locator('#tab-bar .tab[data-doc-name="' + c + '"]')).not.toHaveAttribute('data-preview', '1');
  await row(d).click();
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', d);
  await expect(tabs).toHaveCount(before + 2);
  await expect(page.locator('#tab-bar .tab[data-doc-name="' + c + '"]')).toHaveCount(1);

  // 仮のタブで本文を 1 か所直すと、その場で固定のタブになる。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type("\n' 見直し");
  await expect(page.locator('#tab-bar .tab[data-doc-name="' + d + '"]')).not.toHaveAttribute('data-preview', '1');
  // 一覧から開いた図を書き換えるので、上書きの問いに答える (BLK-owner-20260924-0637-1: 一覧は中央の枠に
  // 開くようになり、答えずに残した問いの枠が一覧の行に重なる)。
  const lock = page.locator('#source-lock-modal');
  await page.waitForTimeout(900);
  if (await lock.isVisible().catch(() => false)) await page.locator('#source-lock-overwrite').click();
  // 本文を押すと一覧は畳まれる (今までどおり)。開き直して次の図へ。
  await S.openFolder(page);
  await row(a).click();
  await expect(tabs).toHaveCount(before + 3);

  // 既にタブのある図を 1 回押すと、そのタブへ移るだけ (増えない・仮にならない)。
  await row(c).click();
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', c);
  await expect(tabs).toHaveCount(before + 3);
  await expect(page.locator('#tab-bar .tab.active')).not.toHaveAttribute('data-preview', '1');

  // BLK-builder-20260924-1743-1 (design 10a): 普段見て回る FILES ツリーの保存先の行でも同じ。
  // 1 回押しは仮のタブ、ダブルクリックで固定のタブ。
  await S.closeFolderList(page);
  const gpio = page.locator('#files-parts .files-part-head[data-part="gpio"]');
  if ((await gpio.getAttribute('aria-expanded')) !== 'true') await gpio.click();
  const treeRow = (n) => page.locator('#files-parts .files-part-file[data-file-name="' + n + '"]');
  await treeRow('gpio_state').click();
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'gpio_state');
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-preview', '1');
  await treeRow('gpio_state').dblclick();
  await expect(page.locator('#tab-bar .tab[data-doc-name="gpio_state"]')).not.toHaveAttribute('data-preview', '1');
  await expect(page.locator('#tab-bar .tab[data-doc-name="gpio_state"] .tab-label')).toHaveCSS('font-style', 'normal');

  // BLK-builder-20260924-2325-2 (design 10a): タブが増えてタブ列が横に流れても、開いた図のタブは右端に貼り付いた
  // 「＋」「ツール ▾」の下に潜らず全部見える。前のタブへ戻ったときも同じ (タブ列がそのタブまで送られる)。
  // 見えている右端は、タブ列の右端と、右端に貼り付いた (sticky の) ボタンの左端のうち手前の方。
  const activeTabSeen = () => page.evaluate(() => {
    const bar = document.getElementById('tab-bar');
    const br = bar.getBoundingClientRect();
    const t = bar.querySelector('.tab.active').getBoundingClientRect();
    let visRight = br.left + bar.clientLeft + bar.clientWidth;
    bar.querySelectorAll('#btn-tab-new, #btn-tab-tools-mini').forEach((el) => {
      if (!el.offsetParent || getComputedStyle(el).position !== 'sticky') return;
      visRight = Math.min(visRight, el.getBoundingClientRect().left);
    });
    return { overflow: bar.scrollWidth > bar.clientWidth, left: t.left, right: t.right, visLeft: br.left, visRight };
  });
  let seen = await activeTabSeen();
  expect(seen.overflow, 'タブ列が横に流れている').toBe(true);
  expect(seen.right, '開いた図のタブがタブ列の外や「＋」「ツール ▾」の下に潜らない').toBeLessThanOrEqual(seen.visRight + 0.5);
  expect(seen.left).toBeGreaterThanOrEqual(seen.visLeft - 0.5);
  await page.locator('#files-body-open .files-row').first().click();
  await expect(page.locator('#tab-bar .tab.active')).not.toHaveAttribute('data-doc-name', 'gpio_state');
  seen = await activeTabSeen();
  expect(seen.left, '先頭のタブへ戻ると左端まで送り返す').toBeGreaterThanOrEqual(seen.visLeft - 0.5);
  expect(seen.right).toBeLessThanOrEqual(seen.visRight + 0.5);
});

// BLK-primary-20260929-2056-friction: 無い系統 (PWM) を作るとき、シーケンス・状態遷移の 2 枚はできても、共通クラス図に
// Pwm_Driver / PwmRegs とメソッド・関係を足すのに参加者名・呼び出し名・きっかけを打ち直していた (クリック 28・キー入力 72)。
// 「⌗ クラス構成をまとめて追加」の窓の「⧉ 他の図から取り込む」で、開いている 2 枚から打ち直さずに持ち込む。
test('手順1 無い系統のクラスを、開いているシーケンス図・状態遷移図から打ち直さずにクラス図へ足す (クリック 10・キー 50 以内)', async ({ page }) => {
  const fs = require('fs');
  const path = require('path');
  await S.bootPlain(page);
  const dir = S.absDirFor(__filename);
  fs.mkdirSync(dir, { recursive: true });
  const NL = String.fromCharCode(10);
  const files = {
    pwm_init_sequence: ['@startuml', 'actor App', 'participant Pwm_Driver', 'participant PwmRegs', 'participant Irq_Controller',
      'App -> Pwm_Driver : Pwm_Init()', 'Pwm_Driver -> PwmRegs : WriteConfig()', 'Pwm_Driver -> Irq_Controller : EnableIrq()',
      'Irq_Controller --> Pwm_Driver : Ack', 'Pwm_Driver --> App : InitDone', '@enduml'],
    pwm_state: ['@startuml', '[*] --> Idle', 'Idle --> Pwm_Ready : Pwm_Init', 'Pwm_Ready --> Pwm_Running : Pwm_Start',
      'Pwm_Running --> Idle : Pwm_Stop', '@enduml'],
    driver_common_class: ['@startuml', 'class Driver_Common {', '  + Init() : void', '}', 'class Spi_Driver {', '  + Spi_Init() : void', '}',
      'class Can_Driver {', '  + Can_Init() : void', '}', 'class Irq_Controller {', '  + EnableIrq() : void', '}',
      'Spi_Driver --|> Driver_Common', 'Can_Driver --|> Driver_Common', 'Spi_Driver -- Irq_Controller', '@enduml'],
  };
  for (const name of Object.keys(files)) {
    const f = path.join(dir, name + '.puml');
    fs.writeFileSync(f, files[name].join(NL));
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.evaluate(() => { document.getElementById('file-input').click(); }),
    ]);
    await chooser.setFiles(f);
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', name, { timeout: 20000 });
  }
  await expect(page.locator('#cl-scaffold-open')).toBeVisible({ timeout: 20000 });

  let clicks = 0, keys = 0;
  await page.locator('#cl-scaffold-open').click(); clicks++;
  await page.locator('#cl-sc-reuse').click(); clicks++;
  // 候補: 参加者 → クラス、受ける呼び出し → メソッド、きっかけ → 頭が同じクラスのメソッド、呼び出し → 関連。
  // クラス図にもう有るメソッド (Irq_Controller.EnableIrq) と応答 (Ack / InitDone) は出ない。
  const rows = await page.locator('#reuse-list .reuse-row').allTextContents();
  const joined = rows.join(NL);
  for (const w of ['Pwm_Driver : + Pwm_Init() : void', 'Pwm_Driver : + Pwm_Start() : void', 'Pwm_Driver : + Pwm_Stop() : void',
    'PwmRegs : + WriteConfig() : void', 'Pwm_Driver -- Irq_Controller']) expect(joined).toContain(w);
  expect(joined).not.toContain('EnableIrq');
  expect(joined).not.toContain('Ack');
  expect(joined).not.toContain('InitDone');
  await page.keyboard.type('Pwm'); keys += 3;   // 絞り込み欄は開いた時から選ばれている
  await page.locator('#reuse-all').click(); clicks++;
  await page.locator('.reuse-row', { hasText: 'Pwm_Driver -- PwmRegs' }).locator('.reuse-check').click(); clicks++;
  await page.locator('#reuse-confirm').click(); clicks++;
  // 窓の欄に入る: 親は兄弟 (Spi_Driver / Can_Driver) と同じ Driver_Common、Pwm_Driver は継承、PwmRegs は結ばない。
  await expect(page.locator('#cl-sc-parent')).toHaveValue('Driver_Common');
  await page.keyboard.press('Enter'); keys++;   // 確定は窓の既存のボタン 1 つ (フォーカスが載っている)
  await expect(page.locator('#cl-sc-modal')).toBeHidden();
  const dsl = await page.locator('#editor').inputValue();
  expect(dsl).toContain(['class Pwm_Driver {', '  + Pwm_Init() : void', '  + Pwm_Start() : void', '  + Pwm_Stop() : void', '}'].join(NL));
  expect(dsl).toContain(['class PwmRegs {', '  + WriteConfig() : void', '}'].join(NL));
  // 継承は図の書き方 (子 --|> 親) に揃う。
  expect(dsl).toContain('Pwm_Driver --|> Driver_Common');
  expect(dsl).not.toContain('Driver_Common <|-- Pwm_Driver');
  expect(dsl).toContain('Pwm_Driver -- Irq_Controller');
  expect(dsl).not.toContain('PwmRegs --|>');
  expect(clicks, 'クリック数').toBeLessThanOrEqual(10);
  expect(keys, 'キー入力数').toBeLessThanOrEqual(50);
});
