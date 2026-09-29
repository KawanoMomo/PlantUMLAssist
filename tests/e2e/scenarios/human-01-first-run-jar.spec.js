// @ts-check
// BLK-human-20260915-1201 — 人間の台本 手順 1「初回起動で描けるようにする」。
//
// 配布物には plantuml.jar を同梱しないので、初回起動の画面は必ず「jar がない」から
// 始まる。⚙設定 → レンダリング で jar を入れたら、その場で警告が消えて図が出ること
// (= アプリを起動し直さなくてよいこと) がこの手順の到達条件。
//
// 取得はネットに出さない。`/env` `/render` `/fetch-jar` `/jar-path` を差し替えて
// 「jar が無い機械」を作り、取得の答えにはこのリポジトリの lib/plantuml.jar を返す。
const { test, expect } = require('@playwright/test');
const path = require('path');
const { gotoApp } = require('../helpers');

const LOCAL_JAR = path.join(__dirname, '..', '..', '..', 'lib', 'plantuml.jar');

const NO_JAR_ENV = {
  app: false,
  jar: false,
  jarPath: '',
  canFetchJar: true,
  java: { found: true, version: '21.0.1', major: 21 },
  javaUrl: 'https://adoptium.net/temurin/releases/',
};

const READY_ENV = {
  app: false,
  jar: true,
  jarPath: LOCAL_JAR,
  canFetchJar: true,
  java: { found: true, version: '21.0.1', major: 21 },
  javaUrl: 'https://adoptium.net/temurin/releases/',
};

// jar が入るまでの `/env` と `/render` を差し替える。`state.hasJar` を立てた後は
// 素の server に戻すので、そこから先は本物の PlantUML が描く。
async function bootWithoutJar(page, state) {
  await page.route('**/env', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.hasJar ? READY_ENV : NO_JAR_ENV),
    });
  });
  await page.route('**/render', async (route) => {
    if (state.hasJar) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'plantuml.jar not found at lib/plantuml.jar. '
          + '設定 → レンダリング で jar を選ぶか「公式から取得」を押してください',
      }),
    });
  });
  await gotoApp(page);
}

async function openRenderTab(page) {
  // ⚙ は畳んだ道具立ての中にいることがあるので、他の spec と同じく直接叩く。
  await page.locator('#btn-config').dispatchEvent('click');
  await page.click('[data-cfg-tab="render"]');
  await expect(page.locator('#cfg-engine')).toBeVisible();
}

test.describe('人間 手順 1 — 初回起動で jar を入れたら、その場で描ける', () => {
  test('公式から取得 → 設定を保存で、再起動せずに図が出る', async ({ page }) => {
    const state = { hasJar: false };
    // 「取得」はネットに出ず、この機械にある jar を答えるだけにする。
    await page.route('**/fetch-jar', async (route) => {
      state.hasJar = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jarPath: LOCAL_JAR, env: READY_ENV }),
      });
    });

    await bootWithoutJar(page, state);

    // 1. 初回起動: jar が無いので図は出ず、理由が図の場所に出ている
    //    (まだ 1 枚も描けていないので、帯ではなくプレビューそのものが理由になる)。
    const preview = page.locator('#preview-svg');
    await expect(preview).toContainText('plantuml.jar');
    await expect(page.locator('#preview-svg svg')).toHaveCount(0);

    // 2. ⚙設定 → レンダリング。jar が無いことと、入れる 2 つの道が出ている。
    await openRenderTab(page);
    await expect(page.locator('#cfg-jar-status')).toContainText('plantuml.jar がありません');
    await expect(page.locator('#cfg-jar-fetch')).toBeEnabled();

    // 3. 「公式から取得」を押す。取得中 → 完了が同じ画面で分かる。
    await page.click('#cfg-jar-fetch');
    const note = page.locator('#cfg-engine-note');
    await expect(note).toHaveAttribute('data-engine-phase', 'done');
    await expect(note).toContainText('再起動せず');
    await expect(page.locator('#cfg-jar-status')).toContainText(LOCAL_JAR);

    // BLK-owner-20260925-1932-2: jar が入ったら「公式から取得」は引っ込む (取り直すのは版の行の「取得し直す」だけ)。
    await expect(page.locator('#cfg-jar-fetch')).toBeHidden();
    // 4. 到達条件: 設定を閉じる前に、もう警告は消えて図が描かれている。
    await expect(page.locator('#preview-svg svg')).toHaveCount(1);
    await expect(preview).not.toContainText('plantuml.jar');
    await expect(page.locator('#render-error-overlay')).toBeHidden();

    // 5. 設定を保存して閉じても、図はそのまま (起動し直さない)。
    await page.click('#cfg-ok');
    await expect(page.locator('#cfg-modal')).toBeHidden();
    await expect(page.locator('#preview-svg svg')).toHaveCount(1);
  });

  test('取得に失敗したら理由が出て、その場で再試行できる', async ({ page }) => {
    const state = { hasJar: false };
    let attempt = 0;
    await page.route('**/fetch-jar', async (route) => {
      attempt += 1;
      if (attempt === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ error: '取得元に届きませんでした (HTTP 403)' }),
        });
      }
      state.hasJar = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jarPath: LOCAL_JAR, env: READY_ENV }),
      });
    });

    await bootWithoutJar(page, state);
    await openRenderTab(page);

    // 1 回目: 失敗。理由と、次に何をすればよいかが同じ画面に出る。
    await page.click('#cfg-jar-fetch');
    const note = page.locator('#cfg-engine-note');
    await expect(note).toHaveAttribute('data-engine-phase', 'error');
    await expect(note).toContainText('HTTP 403');
    const retry = page.locator('#cfg-jar-retry');
    await expect(retry).toBeVisible();
    // 失敗しても図は出ないままで、嘘の「描けた」には変わらない。
    await expect(page.locator('#preview-svg svg')).toHaveCount(0);

    // 2 回目: 再試行の入口から入れ直せば、そこから描ける。
    await retry.click();
    await expect(note).toHaveAttribute('data-engine-phase', 'done');
    await expect(retry).toBeHidden();
    await expect(page.locator('#render-error-overlay')).toBeHidden();
    await expect(page.locator('#preview-svg svg')).toHaveCount(1);
  });

  test('パスを直接入れる道でも、その場で描けるようになる', async ({ page }) => {
    const state = { hasJar: false };
    await page.route('**/jar-path', async (route) => {
      state.hasJar = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jarPath: LOCAL_JAR, env: READY_ENV }),
      });
    });

    await bootWithoutJar(page, state);
    await openRenderTab(page);

    // Web 版にはネイティブのダイアログが無いので、欄に打って「このパスを使う」。
    await expect(page.locator('#cfg-jar-pick')).toHaveText('このパスを使う');
    await page.fill('#cfg-jar-path', LOCAL_JAR);
    await page.click('#cfg-jar-pick');

    await expect(page.locator('#cfg-engine-note')).toHaveAttribute('data-engine-phase', 'done');
    await expect(page.locator('#render-error-overlay')).toBeHidden();
    await expect(page.locator('#preview-svg svg')).toHaveCount(1);
  });

  // BLK-human-20260925-1500: 1.2026.3〜.6 は並行領域 (`--`) を持つ複合状態で最初の領域しか描かない。
  // レンダリング欄に「使用中: 版 / 推奨: 版」(推奨は lib/PLANTUML_VERSION の 1 か所) を並べ、違えば隣の「取得し直す」で
  // 推奨版を取り直せる。並行領域を描けない古い版なら、その旨も 1 行出す (版は jar のマニフェストから。通信しない)。
  test('使用中と推奨の PlantUML の版が並び、違えば「取得し直す」で推奨版に替えられる', async ({ page }) => {
    // 本物の server: 同梱の jar は推奨版そのもの。取得し直す必要は無い。
    await gotoApp(page);
    await openRenderTab(page);
    const ver = page.locator('#cfg-jar-version');
    const refetch = page.locator('#cfg-jar-refetch');
    const warn = page.locator('#cfg-jar-version-warn');
    await expect(ver).toBeVisible();
    await expect(ver).toHaveText('使用中: 1.2026.8 / 推奨: 1.2026.8');
    await expect(ver).toHaveAttribute('data-differs', '0');
    await expect(refetch).toBeHidden();
    await expect(warn).toBeHidden();
    // BLK-owner-20260925-1932-2: 同じ取得をする「公式から取得」を下の行に並べない (下の行はパス欄と「jar を選ぶ」だけ)。
    const fetchBtn = page.locator('#cfg-jar-fetch');
    await expect(fetchBtn).toBeHidden();
    await expect(page.locator('#cfg-jar-pick')).toBeVisible();
    const env = await (await page.request.get('/env')).json();
    expect(env.jarRecommended, '推奨版は lib/PLANTUML_VERSION の 1 か所').toBe('1.2026.8');

    // 古い jar (1.2026.3) を指している機械: 版が並び、並行領域が描かれない旨と「取得し直す」が出る。
    const state = { refetched: false };
    const OLD_ENV = Object.assign({}, READY_ENV, {
      jarVersion: '1.2026.3', jarRecommended: '1.2026.8', jarMinSafe: '1.2026.7', jarOutdated: true,
    });
    const NEW_ENV = Object.assign({}, READY_ENV, {
      jarVersion: '1.2026.8', jarRecommended: '1.2026.8', jarMinSafe: '1.2026.7', jarOutdated: false,
    });
    await page.route('**/env', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(state.refetched ? NEW_ENV : OLD_ENV) });
    });
    // 取得はネットに出ず、この機械にある jar を答えるだけにする。
    await page.route('**/fetch-jar', async (route) => {
      state.refetched = true;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ jarPath: LOCAL_JAR, env: NEW_ENV }) });
    });
    await page.reload();
    await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
    await openRenderTab(page);
    await expect(ver).toHaveText('使用中: 1.2026.3 / 推奨: 1.2026.8');
    await expect(ver).toHaveAttribute('data-differs', '1');
    await expect(warn).toBeVisible();
    await expect(warn).toHaveText('並行領域が描かれない不具合があります。取得し直してください');
    await expect(refetch).toBeVisible();
    // 取得の入口は版の行の「取得し直す」1 つ。
    await expect(fetchBtn).toBeHidden();
    await expect(page.locator('#cfg-engine button:visible', { hasText: /取得/ })).toHaveCount(1);

    // 隣の「取得し直す」を押すと推奨版に替わり、注意とボタンが引っ込む。
    await refetch.click();
    await expect(page.locator('#cfg-engine-note')).toHaveAttribute('data-engine-phase', 'done');
    await expect(ver).toHaveText('使用中: 1.2026.8 / 推奨: 1.2026.8');
    await expect(warn).toBeHidden();
    await expect(refetch).toBeHidden();
  });

  test('Java が無い機械では、同じ画面で入手先まで案内する', async ({ page }) => {
    const state = { hasJar: false };
    await page.route('**/env', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(Object.assign({}, NO_JAR_ENV, { java: { found: false, version: null, major: null } })),
      });
    });
    await page.route('**/render', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'plantuml.jar not found at lib/plantuml.jar.' }),
      });
    });
    await gotoApp(page);
    await openRenderTab(page);

    await expect(page.locator('#cfg-java-status')).toContainText('Java がありません');
    await expect(page.locator('#cfg-java-link')).toHaveAttribute('href', /adoptium\.net/);
  });
});
