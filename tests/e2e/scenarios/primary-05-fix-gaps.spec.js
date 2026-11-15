// @ts-check
// primary 台本 手順5: 並べた変更のうち、既存の reviewer 指摘と符合する欠落があれば直す。
// 直し漏れがあれば直す(漏れが無ければ「反映済み」を run ログに残す)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5 直し漏れ(旧名の残存)が横断で見つかり、その場で直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // spi_init_sequence だけ直っていて、spi_state と共通クラス図に旧名が残っている = 直し漏れ。
  await S.putDoc(page, DIR, 'spi_init_sequence', S.docFor('spi_init_sequence'));
  for (const n of ['spi_state', 'driver_common_class']) {
    await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  }
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(1200);

  // 到達条件その1: 旧名の宣言が残っている図が、件数つきで名指しで出る。
  const folder = page.locator('#rename-folder');
  await expect(folder).toContainText('driver_common_class');
  const listed = (await folder.textContent()) || '';
  expect(listed).toMatch(/driver_common_class\s*1\s*件/);

  // 到達条件その2: すでに直っている図は 0 件と出て、直す対象から外れる。
  expect(listed).toMatch(/spi_init_sequence(開いている)?\s*0\s*件/);

  // 到達条件その3: 漏れが残っているあいだは適用に進める。
  // (適用そのものが保存先へ書き戻ることは 手順2 の spec が受け持つ)
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
});

// BLK-owner-20260924-0637-2: 手順5 (図を直す) のうち、シーケンス図の alt 枠に else を足す直し。
// 札「alt」は帯・ライフラインの上に描かれ、押すとライフライン選択や帯の「ここに挿入」に吸われて
// 枠が選べず、else を足す入口 (枠を選んだ右パネル) にたどり着けなかった。札・条件の文字・枠線の
// どれを押しても枠が選ばれ、右パネルの見出しは日本語 (種類 / 条件) で読める。
test('手順5 シーケンスの alt 枠は左上の札を押して選べ、右パネルから else を足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  await S.typeDsl(page, ['@startuml', 'participant App', 'participant Drv', 'participant Reg',
    'App -> Drv : Spi_Init()', 'activate App', 'alt 成功', 'App -> Reg : write(CR1)', 'Reg --> App : Ack',
    'end', 'deactivate App', '@enduml'].join(NL));
  await page.waitForTimeout(1500);
  const center = async (label) => {
    const b = await page.locator('#preview-svg svg text', { hasText: label }).first().boundingBox();
    expect(b).toBeTruthy();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const frame = page.locator('#overlay-layer rect[data-type="group"]').first();
  await expect(frame).toHaveCount(1);

  // 札の上に乗るとその枠が光る (ホバーでも同じ範囲)。
  const tab = await center('alt');
  await page.mouse.move(tab.x, tab.y);
  await expect(frame).toHaveClass(/hit-hover/);

  // 札を押すと枠が選ばれ、挿入メニューは開かない。
  await page.mouse.click(tab.x, tab.y);
  await expect(page.locator('#seq-edit-add-else')).toBeVisible();
  await expect(page.locator('#props-pane')).toContainText('条件 / Condition');
  await expect(page.locator('#props-pane')).toContainText('種類 / Type');

  // 右パネルから else を足す。
  await page.locator('#seq-edit-else-cond').fill('失敗');
  await page.locator('#seq-edit-add-else').click();
  await page.waitForTimeout(600);
  expect(await page.locator('#editor').inputValue()).toMatch(/^\s*else 失敗$/m);

  // BLK-owner-20260924-2232-3: 空の else は図に描かれず押せない。else を足したら追加フォームへ戻り、
  // 「追加する位置」が今足した else 側になっていて、次の 1 本をそのまま else 側へ入れられる。
  const place = page.locator('#seq-tail-place');
  await expect(place).toBeVisible();
  await expect(place.locator('option:checked')).toHaveText('alt『成功』の else『失敗』側');
  await page.locator('#seq-tail-kind-chip-message').click();
  await page.locator('#seq-tail-from').selectOption('Reg');
  await page.locator('#seq-tail-to').selectOption('App');
  await page.locator('#seq-tail-add').click();
  await expect.poll(async () => page.locator('#editor').inputValue()).toMatch(/^else 失敗\n\s+Reg -> App\s*\nend$/m);
  // 続けて足す 1 本も同じ else 側が既定のまま。
  await expect(page.locator('#seq-tail-place option:checked')).toHaveText('alt『成功』の else『失敗』側');
  await page.waitForTimeout(1200);

  // 成功側のメッセージは「↓ 下へ」で else を 1 段越えて else 側の先頭へ移る (止まって何も起きない、にしない)。
  await page.mouse.click((await center('Ack')).x, (await center('Ack')).y);
  await page.locator('#props-pane .seq-move-down').first().click();
  await expect.poll(async () => page.locator('#editor').inputValue()).toMatch(/^else 失敗\n\s*Reg --> App : Ack\n\s+Reg -> App\s*\nend$/m);
  await page.waitForTimeout(1200);

  // 条件の文字・左の枠線を押しても同じ枠が選ばれる。
  for (const pt of [await center('[成功]'), null]) {
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.MA.selection.clearSelection());
    let x, y;
    if (pt) { x = pt.x; y = pt.y; } else {
      const b = await page.locator('#overlay-layer rect[data-type="group"]').first().boundingBox();
      x = b.x + 2; y = b.y + b.height / 2;
    }
    await page.mouse.click(x, y);
    await expect(page.locator('#seq-edit-add-else')).toBeVisible();
    const sel = await page.evaluate(() => window.MA.selection.getSelected().map((s) => s.type));
    expect(sel).toEqual(['group']);
  }
});

// BLK-primary-20260914-2206: 手順5.5 (指摘反映の保存)。一覧から開いた図の DSL 欄に
// note を打っても、保存フォルダの .puml が何分待っても変わらなかった (自動保存が「開いたファイルを
// 上書きしますか」の返事を待っていた)。TICKET-owner-20261115-1829-prune で窓を外したので、
// 保存先の図はほかの図と同じく、打った内容が聞かれずにそのファイルへ入る。
test('手順5.5 一覧から開いた図に打った内容は、聞かれずに保存先のファイルへ入り、状態バーが書いた先を名乗る', async ({ page }) => {
  const DIR3 = DIR + '-pending';
  await S.bootWithSaveDir(page, DIR3);
  await S.clearDir(page, DIR3);
  const BASE = ['@startuml', 'class ClockCtrl', 'class NVIC', '@enduml'].join('\n');
  await S.putDoc(page, DIR3, 'driver_common_class', BASE);

  await S.openFolderItem(page, 'driver_common_class');
  // 依頼2 への回答を DSL 欄の末尾に打つ (ペルソナと同じ経路)。
  await S.typeDsl(page, BASE + '\nnote top of ClockCtrl : 呼び先は意図的に省略');

  // 到達条件その1: 窓は出ず、打った内容がディスクの本体に入る。控え (-編集中) は作らない。
  await expect.poll(async () => (await S.readDoc(page, DIR3, 'driver_common_class')) || '', { timeout: 10000 })
    .toContain('note top of ClockCtrl');
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);
  expect(await S.listDir(page, DIR3)).not.toContain('driver_common_class-編集中');

  // 到達条件その2: 💾 は書けた先を名乗る (design 9c: 「13:31 に自動保存 · 名前」の文字だけ)。
  const badge = page.locator('#status-autosave');
  await expect(badge).toHaveText(/^\d{2}:\d{2} に自動保存 · driver_common_class\.puml$/, { timeout: 10000 });

  // 到達条件その3: 以後の追記も黙って本体へ入る (毎回止まらない)。
  await S.typeDsl(page, BASE + '\nnote top of ClockCtrl : 呼び先は意図的に省略\nnote top of NVIC : 割り込み設定');
  await expect.poll(async () => (await S.readDoc(page, DIR3, 'driver_common_class')) || '', { timeout: 10000 })
    .toContain('note top of NVIC');
});

// BLK-primary-20260930-0257: driver_common_class が横に伸びたので系統ごとに 2 枚へ分けたい (reviewer 指摘 3)。
// 分け方は FILES の「複製」で同じ図を 2 枚にし、それぞれで要らないクラスを「クラスを削除」で消す。
// 以前の「クラスを削除」は宣言の行だけを消し、そのクラスへの関係の行を残したので、PlantUML が関係の行から
// 同じ名前のクラスを描き直し、消したクラスが図に残った。確かめる窓もブラウザの confirm で note のことしか言わなかった。
test('手順5.5 複製してクラスを消すと、消したクラスとその関係が図と本文から無くなる', async ({ page }) => {
  const DIR4 = DIR + '-split';
  const NL = String.fromCharCode(10);
  const CLS = ['@startuml', 'title driver_common_class', 'class Driver_Common', 'interface ISpi', 'class SpiDrv',
    'interface IAdc', 'class AdcDrv', 'SpiDrv ..|> ISpi', 'AdcDrv ..|> IAdc', 'SpiDrv --|> Driver_Common',
    'AdcDrv --|> Driver_Common', 'note right of IAdc : ADC の口', '@enduml'].join(NL);
  await S.bootWithSaveDir(page, DIR4);
  await S.clearDir(page, DIR4);
  await S.putDoc(page, DIR4, 'driver_common_class', CLS);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });

  // FILES の右クリック「複製」で 2 枚にし、写しを開く。
  await S.openFolder(page);
  await S.closeFolderList(page);
  const head = page.locator('#files-parts .files-part-head[aria-expanded="false"]');
  for (let i = await head.count(); i > 0; i--) await head.first().click();
  await page.locator('#files-parts .files-part-file[data-file-name="driver_common_class"]').click({ button: 'right' });
  await page.locator('#files-ctx-menu [data-action="copy"]').click();
  const copy = page.locator('#files-parts .files-part-file[data-file-name="driver_common_class_copy"]');
  await expect(copy).toBeAttached();
  await copy.click();
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('AdcDrv');

  // ADC 系を消す (写しは SPI 系だけにする)。クラスを選んで「クラスを削除」→ 窓が消える関係と note の数を先に言う → Enter。
  const del = async (id, want) => {
    await expect(page.locator('#overlay-layer rect.selectable[data-id="' + id + '"]').first()).toBeAttached({ timeout: 10000 });
    // 図のクラス名の文字の上を押す (見出しの上。属性・メソッドの行ではなくクラスそのものが選ばれる)。
    const name = page.locator('#preview-svg svg text', { hasText: new RegExp('^' + id + '$') }).first();
    const nb = await name.boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await expect(page.locator('#cl-sel-name')).toHaveText(id);
    await page.locator('#cl-delete').click();
    await expect(page.locator('#cl-del-modal')).toBeVisible();
    await expect(page.locator('#cl-del-message')).toHaveText(want);
    await page.keyboard.press('Enter');
    await expect(page.locator('#cl-del-modal')).toHaveCount(0);
    await page.waitForTimeout(1200);
  };
  await del('AdcDrv', 'クラス AdcDrv を削除します。関係 2 本も消えます。');
  await del('IAdc', 'クラス IAdc を削除します。note 1 つも消えます。');

  // 到達条件その1: 本文にも図にも ADC 系が残らない (関係の行から描き直されない)。SPI 系と共通クラスは残る。
  const text = await page.locator('#editor').inputValue();
  expect(text).not.toContain('Adc');
  expect(text).toContain('SpiDrv ..|> ISpi');
  expect(text).toContain('SpiDrv --|> Driver_Common');
  await expect(page.locator('#preview-svg svg text', { hasText: 'AdcDrv' })).toHaveCount(0);
  await expect(page.locator('#preview-svg svg text', { hasText: 'IAdc' })).toHaveCount(0);
  await expect(page.locator('#preview-svg svg text', { hasText: 'SpiDrv' }).first()).toBeVisible();
  await expect.poll(async () => (await S.readDoc(page, DIR4, 'driver_common_class_copy')) || '').not.toContain('Adc');

  // 到達条件その2: 元の図はそのまま (両方に要る Driver_Common も残る)。Esc で取り消せば何も消えない。
  expect(await S.readDoc(page, DIR4, 'driver_common_class')).toContain('AdcDrv --|> Driver_Common');
  const hit = page.locator('#overlay-layer rect.selectable[data-type="class"][data-id="SpiDrv"]').first();
  const hb = await hit.boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + 8);
  await page.locator('#cl-delete').click();
  await expect(page.locator('#cl-del-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cl-del-modal')).toHaveCount(0);
  expect(await page.locator('#editor').inputValue()).toContain('class SpiDrv');
});
