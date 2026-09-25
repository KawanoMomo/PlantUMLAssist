// @ts-check
// BLK-releaser-20260908-2030-1/-3 — シナリオ spec 共通の下ごしらえ。
// ペルソナが毎時走らせている Playwright スクリプトの操作をそのまま使えるようにする。
const path = require('path');
const { gotoApp, saveDirFor } = require('../helpers');

// 台本の「保存先」に相当する、spec ごとに独立したフォルダ。
function dirFor(file) { return saveDirFor(file); }
function absDirFor(file) {
  return path.join(__dirname, '..', '..', '..', dirFor(file).replace(/^\.\//, ''));
}

// 「覚えているか」を見る手順のための逃がし鍵。これが立っている間は開き直しても記憶を消さない
// (addInitScript は再読み込みのたびに走るので、素の reload では毎回まっさらになる)。
const KEEP_KEY = 'pua.e2e.keep';

// アプリを開き直す (利用者がアプリを閉じてまた開いたのと同じ)。記憶は消さない。
async function reopenApp(page) {
  await page.evaluate((k) => { try { window.localStorage.setItem(k, '1'); } catch (e) {} }, KEEP_KEY);
  await page.reload();
  // #editor は HTML の骨格にあり、init (保存先の取り込みを待って走る) より先に現れる。
  // それを待って押すと、ボタンに手が付く前のクリックになって何も起きない
  // (全体実行で /prefs が遅い回に junior-09 の「開き直してから並べて比較」が落ちていた)。
  await page.waitForSelector('html[data-app-ready="1"]');
  await page.evaluate((k) => { try { window.localStorage.removeItem(k); } catch (e) {} }, KEEP_KEY);
}

// 保存先を設定済みにして開く (junior 手順 3・primary が毎回している状態)。
// opts はそのまま gotoApp へ渡す。`{ foldedTools: true }` を渡すと helper が
// 畳み方の設定に触らないので、アプリ自身の既定 (design 7a/7b) がそのまま出る
// (仕様と現在値を突き合わせる手順 11 は、helper の都合を既定と読み違えてはいけない)。
async function bootWithSaveDir(page, dir, opts) {
  await page.addInitScript((d) => {
    try {
      if (window.localStorage.getItem('pua.e2e.keep')) return;
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d,
      }));
    } catch (e) {}
  }, dir);
  await gotoApp(page, opts);
}

// 保存先を未設定 (ダウンロード) のまま開く。
async function bootPlain(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
}

// 保存先をまだ決めていない状態 (= 保存するとダウンロードになる)。
// prevDir: ダウンロードのまま控えている保存フォルダ (既定は ./autosave)。前に使っていたフォルダに
// 図が残っている状態から保存先を変える手順は、test-results 配下のフォルダを渡して作る。
async function bootDownloadMode(page, prevDir) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: d,
      }));
    } catch (e) {}
  }, prevDir || './autosave');
  await gotoApp(page);
}

// 保存フォルダに図を置く / 読む / 消す (ペルソナの前周までの成果物に相当)。
async function putDoc(page, dir, name, dsl) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
    return r.ok;
  }, { dir, name, dsl });
}

async function readDoc(page, dir, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave?type=' + encodeURIComponent(a.name) + '&dir=' + encodeURIComponent(a.dir));
    if (!r.ok) return null;
    // type 指定の GET は .puml の本文をそのまま text/plain で返す。
    return r.text();
  }, { dir, name });
}

async function listDir(page, dir) {
  return page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    if (!r.ok) return [];
    const j = await r.json();
    return (j.entries || []).map((e) => e.type || e.name);
  }, dir);
}

async function clearDir(page, dir) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, dir);
}

// 変更チケット (BLK-primary-20260909-0603-wish) は clearDir では消えない
// (仕様変更は図を作り直しても続いているため)。下ごしらえでは明示して消す。
async function clearTickets(page, dir) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?tickets=1&dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, dir);
}

// 📂 一覧 から名前で開く (junior 手順 1・8、primary の openFolderItem と同じ経路)。
// BLK-owner-20260924-0637-1: 旧 📂 一覧 (点検の部品ごと) は FILES ツリーの「保存先」節には出さず、
// 保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。開くたびに読み直すので、
// 台本が後から置いたファイルも出る (以前の「畳んでから開き直す」はこの 1 回で済む)。
async function openFolder(page) {
  await closeFolderList(page);
  await page.locator('#btn-tab-folder').click({ button: 'right' });
  await page.locator('#files-ctx-menu [data-action="open-list"]').click();
  await page.waitForSelector('#folder-panel.open.is-list');
}

// 中央の枠に開いた保存先の一覧を閉じる (ツリーの保存先節は開いたまま)。
async function closeFolderList(page) {
  if (await page.locator('#folder-panel.is-list').count()) {
    await page.locator('#folder-list-close').click();
    await page.waitForSelector('#folder-panel:not(.is-list)', { state: 'attached' });
  }
}

// 1 回押しは仮のタブ (次の 1 回押しで中身が入れ替わる)。何枚もタブに並べておく手順は
// opts.pin でダブルクリックし、固定のタブにする (BLK-primary-20260924-0805-design)。
async function openFolderItem(page, name, opts) {
  await openFolder(page);
  const filter = page.locator('#folder-filter');
  if (await filter.count()) await filter.fill('');
  const item = page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]').first();
  if (opts && opts.pin) await item.dblclick();
  else await item.click();
  await page.waitForTimeout(900);
}

// BLK-owner-20260924-1836-prune: 隣の保存フォルダを覗く窓は、FILES「読むだけ」のそのフォルダの行の
// 右クリック「このフォルダの図を調べる…」で、そのフォルダを開いた状態で出る (窓の中でフォルダを選ばない)。
async function peekFolder(page, dirName) {
  const head = page.locator('#files-sec-readonly');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  const row = page.locator('#files-panel .files-ro-folder[data-ro-name="' + dirName + '"]');
  await row.waitFor();
  await row.click({ button: 'right' });
  await page.locator('#files-ctx-menu [data-action="peek"]').click();
  await page.waitForSelector('#peek-modal');
  await page.waitForFunction((n) => {
    const b = document.getElementById('peek-dir-name');
    return b && b.textContent === n;
  }, dirName);
}

// FILES「読むだけ」のフォルダを右クリック →「並べて比較」で比較中にする (相手のフォルダを選ぶ道はこの 1 本。
// BLK-owner-20260924-2135-prune)。参照ペインの増分の取り込みも、このフォルダを相手にする。
async function compareFolder(page, dirName) {
  const head = page.locator('#files-sec-readonly');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  const row = page.locator('#files-panel .files-ro-folder[data-ro-name="' + dirName + '"]');
  await row.waitFor();
  await row.click({ button: 'right' });
  await page.locator('#files-ctx-menu [data-action="compare"]').click();
  await page.waitForSelector('#files-panel .files-ro-folder[data-ro-name="' + dirName + '"][data-comparing="1"]');
}

// 一覧から開いた図は錠がかかっている。直す目的で開いたときは「このファイルを書き換える」を選ぶ。
// 錠は最初の書き戻しの直前に一度だけ聞くので、1 文字足して問いを出してから答える。
async function overwriteOpenedFile(page) {
  const current = await page.locator('#editor').inputValue();
  await typeDsl(page, current + "\n' review");
  await page.waitForTimeout(900);
  const modal = page.locator('#source-lock-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(1200);
  }
  await typeDsl(page, current);
  await page.waitForTimeout(600);
}

// エディタに DSL を流し込む (ペルソナが GUI で書き上げた状態の代わり)。
async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(400);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
  await page.waitForTimeout(200);
}

// コマンドパレット経由 (primary が手数を数えている経路)。
async function runCommand(page, query) {
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill(query);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

// Export メニューから 1 項目を選び、download を受け取る。
async function exportVia(page, itemId, timeout) {
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  const dl = page.waitForEvent('download', { timeout: timeout || 20000 }).catch(() => null);
  await page.locator('#' + itemId).click();
  return dl;
}

// ペルソナが毎周使っている GPIO の図 (junior/primary の persona-data の形をそのまま縮めたもの)。
const GPIO_STATE = [
  '@startuml',
  'title GPIOドライバ状態遷移',
  '[*] --> Uninit',
  'Uninit --> Ready : Gpio_Init',
  'Ready --> Busy : Gpio_Write',
  'Busy --> Ready : Gpio_Done',
  'Ready --> Uninit : Gpio_DeInit',
  '@enduml',
].join('\n');

// BLK-junior-20260923-1409: junior の手順4で書き出せなかった 1 枚 (IRQ 初期化シーケンス)。
// PlantUML が svg 末尾に畳む元 DSL が、この図ではちょうど `--` を含む文字列になる。
// 画面に入れた時点でその処理命令はコメントに化けるので、書き戻すと XML として壊れ、
// PNG 変換の Image が onerror になっていた。**この DSL はそのままにしておくこと**
// (1 行変えると畳んだ文字列が変わり、再現しなくなる)。
const IRQ_SEQ_FOLDED_DASH = [
  "@startuml",
  "skinparam backgroundColor #FFFFFF",
  "skinparam defaultFontSize 12",
  "skinparam defaultFontColor #000000",
  "skinparam ArrowColor #181818",
  "skinparam sequenceParticipantBackgroundColor #E3E3F7",
  "skinparam sequenceParticipantBorderColor #181818",
  "title IRQドライバ初期化シーケンス",
  "actor App",
  "participant Spi_Driver",
  "participant IRQCtrl",
  "participant NVIC",
  "note over IRQCtrl : IRQ系統はClockCtrl/Regsを持たない\\n(IRQCtrlがドライバ層と制御層を兼ねる意図的な構成。\\nreviewer指摘2への回答)",
  "App -> IRQCtrl : Irq_Init()",
  "IRQCtrl -> NVIC : SetPriority()",
  "IRQCtrl -> NVIC : EnableVector()",
  "NVIC --> IRQCtrl : Ack",
  "IRQCtrl --> Spi_Driver : Ready",
  "Spi_Driver --> App : InitDone",
  "' @pin 1|open|reviewer|2026-09-14T18:09|participant NVIC|NVIC.EnableVector/SetPriority がクラス図に無い(F-02/F-03継続3tick目)",
  "@enduml",
].join('\n');

const GPIO_SEQ = [
  '@startuml',
  'title GPIOドライバ初期化シーケンス',
  'participant Gpio_Driver',
  'participant Port_Ctrl',
  'Gpio_Driver -> Port_Ctrl : Gpio_Init',
  'Port_Ctrl --> Gpio_Driver : Gpio_Done',
  '@enduml',
].join('\n');

// primary が横断している 14 枚 (台本 手順1 の固定枚数)。
const PRIMARY_DOCS = [
  'spi_init_sequence', 'spi_state', 'can_init_sequence', 'can_state', 'driver_common_class',
  'gpio_init_sequence', 'gpio_state', 'irq_init_sequence', 'irq_state',
  'uart_init_sequence', 'uart_state', 'timer_init_sequence', 'adc_init_sequence', 'adc_state',
];

// 14 枚の中身。spi の 2 枚と共通クラス図だけが SpiDrv/Spi_Driver を持ち、
// 置換の対象がどこかを spec 側から数えられるようにしてある。
function docFor(name, spiName) {
  const spi = spiName || 'Spi_Driver';
  const drv = name.replace(/_(init_sequence|state)$/, '');
  if (name === 'driver_common_class') {
    return ['@startuml', 'title ドライバ共通クラス図',
      'class ' + spi + ' {', '  + Init() : void', '  + Write(d) : void', '}',
      'class Can_Driver', 'class Gpio_Driver', '@enduml'].join('\n');
  }
  const who = drv === 'spi' ? spi : drv.charAt(0).toUpperCase() + drv.slice(1) + '_Driver';
  if (/_state$/.test(name)) {
    return ['@startuml', 'title ' + drv.toUpperCase() + ' 状態遷移',
      '[*] --> Uninit', 'Uninit --> Ready : ' + who + '_Init',
      'Ready --> Busy : ' + who + '_Write', 'Busy --> Ready : ' + who + '_Done', '@enduml'].join('\n');
  }
  return ['@startuml', 'title ' + drv.toUpperCase() + ' 初期化シーケンス',
    'participant ' + who, 'participant Hw_Ctrl',
    who + ' -> Hw_Ctrl : ' + who + '_Init',
    'Hw_Ctrl --> ' + who + ' : ' + who + '_Done', '@enduml'].join('\n');
}


// BLK-human-20260912-0900: シーケンスのメッセージは、ステレオタイプ・autonumber を
// 付けても「矢印・ラベル・番号・ステレオタイプのどこを押しても」同じメッセージが選ばれる。
// g.message の中の押されうる点 (各 text の中心と矢印の中点) の画面座標を集める。
async function messageClickPoints(page, msgIndex) {
  return page.evaluate((i) => {
    const gs = document.querySelectorAll('#preview-container svg g.message');
    const g = gs[i];
    if (!g) {
      // BLK-human-20260925-1500: PlantUML 1.2026.7 からメッセージは g.message に入らない (teoz の描き方)。
      // 上から i 本目の横向きの矢印の線と、その線の上 (1 本前の矢印より下) に書かれた文字をそのメッセージとする。
      const svg = document.querySelector('#preview-container svg');
      if (!svg) return null;
      const lines = Array.from(svg.querySelectorAll('line')).filter((l) => {
        if (/dasharray:\s*5/.test(l.getAttribute('style') || '')) return false;   // ライフライン
        const dx = Math.abs(parseFloat(l.getAttribute('x2')) - parseFloat(l.getAttribute('x1')));
        const dy = Math.abs(parseFloat(l.getAttribute('y2')) - parseFloat(l.getAttribute('y1')));
        return dy < 0.5 && dx > 16;
      }).sort((a, b) => parseFloat(a.getAttribute('y1')) - parseFloat(b.getAttribute('y1')));
      const line = lines[i];
      if (!line) return null;
      const lr = line.getBoundingClientRect();
      // 1 本目の上限はライフラインの上端 (参加者の頭の文字を拾わない)。
      const lifeTops = Array.from(svg.querySelectorAll('line')).filter((l) => /dasharray:\s*5/.test(l.getAttribute('style') || ''))
        .map((l) => l.getBoundingClientRect().top);
      const prev = i > 0 ? lines[i - 1].getBoundingClientRect().bottom : (lifeTops.length ? Math.min(...lifeTops) : -Infinity);
      const out = [];
      svg.querySelectorAll('text').forEach((t) => {
        const r = t.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        if (r.width > 0 && cy > prev && cy < lr.y && cx >= lr.x - 20 && cx <= lr.right + 20) {
          out.push({ x: cx, y: cy, what: 'text:' + t.textContent });
        }
      });
      out.push({ x: lr.x + lr.width / 2, y: lr.y + lr.height / 2, what: 'arrow' });
      return out;
    }
    const pts = [];
    g.querySelectorAll('text').forEach((t) => {
      const r = t.getBoundingClientRect();
      if (r.width > 0) pts.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, what: 'text:' + t.textContent });
    });
    const line = g.querySelector('line');
    if (line) {
      const r = line.getBoundingClientRect();
      pts.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, what: 'arrow' });
    }
    return pts;
  }, msgIndex);
}

async function selectedMessageLine(page) {
  return page.evaluate(() => {
    const r = document.querySelector('#overlay-layer rect.selectable.selected[data-type="message"]');
    return r ? r.getAttribute('data-line') : null;
  });
}

// dsl を読み込み、msgIndex 番目のメッセージのどの点を押しても同じ行が選ばれることを確かめる。
// 戻り値は押した点の数 (= クリック数の実測に使う)。
async function expectMessageHitUniform(page, expectFn, dsl, msgIndex) {
  await typeDsl(page, dsl);
  await page.waitForTimeout(1200);
  const pts = await messageClickPoints(page, msgIndex);
  expectFn(pts && pts.length >= 2).toBe(true);
  let line = null;
  for (const pt of pts) {
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(150);
    const got = await selectedMessageLine(page);
    expectFn(got === null ? 'none (' + pt.what + ')' : got).not.toBe('none (' + pt.what + ')');
    if (line === null) line = got;
    expectFn(got + ' @' + pt.what).toBe(line + ' @' + pt.what);
    // 同じ rect をもう一度押すと選択が外れる仕様なので、次の点の前に解除しておく。
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(100);
  }
  return pts.length;
}

module.exports = {
  PRIMARY_DOCS, docFor,
  dirFor, absDirFor, bootWithSaveDir, bootPlain, bootDownloadMode, reopenApp,
  putDoc, readDoc, listDir, clearDir, clearTickets,
  openFolder, closeFolderList, openFolderItem, overwriteOpenedFile, peekFolder, compareFolder, typeDsl, renameActive, runCommand, exportVia,
  GPIO_STATE, GPIO_SEQ, IRQ_SEQ_FOLDED_DASH,
  messageClickPoints, selectedMessageLine, expectMessageHitUniform,
};
