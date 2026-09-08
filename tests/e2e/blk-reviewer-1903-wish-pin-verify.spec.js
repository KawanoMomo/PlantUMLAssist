// @ts-check
// BLK-reviewer-20260908-1903-wish: 依頼が本当に直ったかを確かめるのに、puml diff・
// label-position 監査・/render 再描画・/verify-svg を別々に回して自分で結び付けていた。
// 指摘箱を開けば 1 件ごとに「puml で何が変わり、それが SVG に出ているか」が
// 1 つの札になっている、を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);

function pin(id, anchor) {
  return "' @pin " + [id, 'open', 'reviewer', '2026-09-08T15:03', anchor,
    'このラベルはシーケンス図のどのメッセージとも対応しない'].join('|');
}

// 3 枚とも同じ形。違うのは「直したか」と「SVG を作り直したか」だけ。
function doc(title, label) {
  return [
    '@startuml', 'title ' + title, '[*] --> Idle',
    'Idle --> Busy : ' + label,
    pin('1', 'Idle --> Busy : Dma_Configure'),
    '@enduml',
  ].join('\n');
}

const OLD = 'Dma_Configure';
const NEW = 'Dma_Start';

// reflected — puml を直し、その puml から SVG を作り直した図
const D_OK = 'R1903_ok';
// puml-only — puml は直したが、SVG は直す前のまま
const D_STALE = 'R1903_stale';
// open — まだ直っていない図
const D_OPEN = 'R1903_open';

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function putFile(page, name, dsl) {
  const ok = await page.evaluate(async (a) => {
    const r = await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
    return r.ok;
  }, { name, dsl, dir: DIR });
  expect(ok).toBe(true);
}

// 保存フォルダの {name}.svg を、渡した DSL を描いた結果で書き出す
// (画面の「作り直す」と同じ経路: /render → /autosave-svg)。
async function exportSvg(page, name, dsl) {
  const ok = await page.evaluate(async (a) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: a.dsl, mode: 'local' }),
    });
    if (!r.ok) return false;
    const svg = await r.text();
    const w = await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: svg }),
    });
    return w.ok;
  }, { name, dsl, dir: DIR });
  expect(ok).toBe(true);
}

async function openInbox(page) {
  await page.locator('#btn-tab-inbox').click();
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForFunction(() => {
    const h = document.querySelector('#inbox-panel .ib-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });
  // 判定は描き直しを伴うので、帯が答えを出すまで待つ。
  await page.waitForSelector('#ib-verify-head[data-state="done"]', { timeout: 60000 });
}

function rowOf(page, name) {
  return page.locator('#inbox-panel .ib-row[data-doc="' + name + '"]').first();
}

test.describe('BLK-reviewer-1903-wish: 指摘が SVG に反映されたかの判定', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);

    // 直して SVG も作り直した図
    await putFile(page, D_OK, doc('Ok state', NEW));
    await exportSvg(page, D_OK, doc('Ok state', NEW));

    // 直したが SVG は直す前のまま (作り直しを忘れた図)
    await putFile(page, D_STALE, doc('Stale state', OLD));
    await exportSvg(page, D_STALE, doc('Stale state', OLD));
    await putFile(page, D_STALE, doc('Stale state', NEW));

    // まだ直っていない図。SVG は今の puml に追いついている
    await putFile(page, D_OPEN, doc('Open state', OLD));
    await exportSvg(page, D_OPEN, doc('Open state', OLD));

    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('1 件ごとに札が付き、帯が札ごとの件数を言う', async ({ page }) => {
    await openInbox(page);
    const head = page.locator('#ib-verify-head');
    await expect(head).toBeVisible();
    expect(await head.getAttribute('data-pumlonly')).toBe('1');
    expect(await head.getAttribute('data-open')).toBe('1');
    expect(await head.getAttribute('data-reflected')).toBe('1');
    await expect(head).toHaveText(/反映済み 1/);
    await expect(head).toHaveText(/SVG 未反映 1/);
  });

  test('puml を直しても SVG が古ければ「SVG 未反映」として箱に残る', async ({ page }) => {
    await openInbox(page);
    const row = rowOf(page, D_STALE);
    await expect(row).toBeVisible();
    expect(await row.getAttribute('data-reflect')).toBe('puml-only');
    expect(await row.getAttribute('data-svg')).toBe('differ-content');
    await expect(row.locator('.ib-verify')).toHaveText('SVG 未反映');
    // 判定の根拠は puml 側と SVG 側の両方をその場に出す
    await expect(row.locator('.ib-verify-why')).toHaveText(/puml: /);
    await expect(row.locator('.ib-verify-why')).toHaveText(/SVG は今の puml と食い違っています/);
  });

  test('まだ直っていない指摘は「未対応」', async ({ page }) => {
    await openInbox(page);
    const row = rowOf(page, D_OPEN);
    expect(await row.getAttribute('data-reflect')).toBe('open');
    await expect(row.locator('.ib-verify')).toHaveText('未対応');
    await expect(row.locator('.ib-verify-why')).toHaveText(/書き換わっていません/);
  });

  test('直して SVG も作り直した指摘は「反映済み」になり、箱から落ちる', async ({ page }) => {
    await openInbox(page);
    // 反映済み = 依頼は終わっている。未対応の箱には出さない
    await expect(rowOf(page, D_OK)).toHaveCount(0);
    // 「解消も出す」で裏を取れる
    await page.locator('#ib-resolved').check();
    await page.waitForSelector('#inbox-panel .ib-row[data-doc="' + D_OK + '"]');
    const row = rowOf(page, D_OK);
    expect(await row.getAttribute('data-reflect')).toBe('reflected');
    await expect(row.locator('.ib-verify')).toHaveText('反映済み');
    await expect(row.locator('.ib-verify-why')).toHaveText(/SVG は今の puml を描いた結果と一致しています/);
  });

  test('SVG を作り直すと「SVG 未反映」が「反映済み」に変わる', async ({ page }) => {
    await openInbox(page);
    expect(await rowOf(page, D_STALE).getAttribute('data-reflect')).toBe('puml-only');
    // 作り直して、指摘箱をもう一度開く (reviewer の次の tick)
    await page.keyboard.press('Escape');
    await exportSvg(page, D_STALE, doc('Stale state', NEW));
    await openInbox(page);
    expect(await page.locator('#ib-verify-head').getAttribute('data-reflected')).toBe('2');
    expect(await page.locator('#ib-verify-head').getAttribute('data-pumlonly')).toBe('0');
    await expect(rowOf(page, D_STALE)).toHaveCount(0);
  });
});
