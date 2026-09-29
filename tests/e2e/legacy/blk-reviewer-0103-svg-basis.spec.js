// @ts-check
// BLK-reviewer-20260908-0103 (1403 追記): 手順 6 で render API に puml を渡して再描画し、
// 保存中の svg とバイト比較したところ実データ 17 枚全てが不一致に見えた。原因は保存時に付く
// `<!-- @pua-source-sha1 ... -->` が再描画結果には付かないこと。reviewer は server.py の
// SVG_STAMP_PREFIX を読んで初めて気付いた。一覧と render API の応答の両方で
// 「この判定は印の突合であって生のバイト比較ではない」と分かるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';

async function bootWithDir(page) {
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
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

async function putSvg(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
    });
    return r.status;
  }, { name, dir: DIR });
}

// 保存先の一覧は FILES の保存先の右クリック「保存先の一覧を開く」で中央の枠に開く
// (BLK-owner-20260924-0637-1。scenarios/_scenario.js の openFolder と同じ経路)。旧経路 (保存先の
// 見出しを畳んで開き直す) は FILES の節を開くだけで、一覧の枠は見えないまま待ち続けた。
// 開くたびに読み直すので、後から置いたファイルも出る。
async function openFolder(page) {
  await require('../scenarios/_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open.is-list .folder-item');
  // 開いた直後は FILES ツリーの読み直しが続けて一覧を 1 回描き直す。その間に押すと
  // 描き直しで消えた古いボタンに当たることがあるので、描き直しが 400ms 止むまで待つ。
  await page.evaluate(() => new Promise((resolve) => {
    const el = document.getElementById('folder-panel');
    let t = null;
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 400); });
    function done() { mo.disconnect(); resolve(); }
    mo.observe(el, { childList: true });
    t = setTimeout(done, 400);
  }));
}

test.describe('BLK-reviewer-0103: 内容判定の根拠を画面と API で言う', () => {
  test('一覧が「印の突合である」と言い、バイト比較が必ず食い違うことまで書く', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103b_one', A1);
    expect(await putSvg(page, 'R0103b_one')).toBe(200);

    await openFolder(page);
    await expect(page.locator('#folder-svg-content')).toContainText('今の puml から作られています');
    const basis = page.locator('#folder-svg-basis');
    await expect(basis).toBeVisible();
    await expect(basis).toContainText('判定の根拠: 印 (@pua-source-sha1) の突合 1 枚');
    await expect(basis).toContainText('/render の応答とそのままバイト比較すると必ず食い違います');
  });

  test('印の無い図しか無ければ、根拠は「まだ内容で判定していない」と出る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103b_nostamp', A1);
    await openFolder(page);
    await expect(page.locator('#folder-svg-basis'))
      .toContainText('まだ 1 枚も内容で判定していません');
  });

  test('POST /render の応答が「この応答に印は付かない」と自分で言う', async ({ page }) => {
    await bootWithDir(page);
    const info = await page.evaluate(async (dsl) => {
      const r = await fetch('/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: dsl, mode: 'local' }),
      });
      const body = await r.text();
      return { status: r.status, stamp: r.headers.get('X-PlantUMLAssist-Svg-Stamp'), body: body.slice(-300) };
    }, A1);
    expect(info.status).toBe(200);
    expect(info.stamp).toContain('@pua-source-sha1');
    expect(info.stamp).toContain('byte-comparing them always differs');
    // 応答そのものには印が無い (これが「全件不一致」に見えた原因)
    expect(info.body).not.toContain('@pua-source-sha1');
  });

  test('GET /render の仕様に、比べ方の正しい入口が書いてある', async ({ page }) => {
    await bootWithDir(page);
    const doc = await page.evaluate(async () => (await fetch('/render')).json());
    expect(doc.comparison.note).toContain('生のバイト比較は内容が同じでも必ず食い違う');
    expect(doc.comparison.how).toContain('svgSource');
    expect(doc.comparison.how).toContain('/verify-svg');
    expect(doc.comparison.header).toBe('X-PlantUMLAssist-Svg-Stamp');
  });
});

// BLK-reviewer-20260909-0403: /verify-svg の要求の形が呼び出し側 (src/app.js) にしか無く、
// curl / node から叩くと `{puml, svg}` を渡して 400 を 2 回踏み、grep で形を探していた。
// 窓口自身が仕様を返し、400 も「何を期待しているか」を連れてくることを確かめる。
test.describe('BLK-reviewer-0403: /verify-svg の形を窓口自身が言う', () => {

  test('GET /api が全窓口の索引を返し、/verify-svg の要求の形をそこで名指しする', async ({ page }) => {
    await bootWithDir(page);
    const doc = await page.evaluate(async () => (await fetch('/api')).json());
    const eps = doc.endpoints.map((e) => e.endpoint);
    expect(eps).toContain('POST /verify-svg');
    expect(eps).toContain('POST /render');
    expect(eps).toContain('GET /autosave');
    const v = doc.endpoints.filter((e) => e.endpoint === 'POST /verify-svg')[0];
    expect(v.request).toContain('dir');
    expect(v.request).toContain('types');
  });

  test('GET /verify-svg が仕様を返し、puml / svg は渡さないと言う', async ({ page }) => {
    await bootWithDir(page);
    const doc = await page.evaluate(async () => (await fetch('/verify-svg')).json());
    expect(doc.endpoint).toBe('POST /verify-svg');
    expect(Object.keys(doc.request.fields).sort()).toEqual(['dir', 'mode', 'types']);
    expect(doc.request.note).toContain('puml / svg そのものは受け取らない');
    expect(doc.example).toContain('/verify-svg');
    expect(doc.status['differ-format']).toContain('体裁');
  });

  test('`{puml, svg}` で叩いた 1 回目の 400 が、正しい形と実例を連れてくる', async ({ page }) => {
    await bootWithDir(page);
    const res = await page.evaluate(async (dsl) => {
      const r = await fetch('/verify-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puml: dsl, svg: '<svg/>' }),
      });
      return { status: r.status, body: await r.json() };
    }, A1);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("'types'");
    expect(Object.keys(res.body.expected.fields).sort()).toEqual(['dir', 'mode', 'types']);
    expect(res.body.expected.doc).toBe('GET /verify-svg');
    expect(res.body.expected.example).toContain('curl');
  });

  test('mode を間違えた 400 も同じ形を連れてくる (2 回目の往復を作らない)', async ({ page }) => {
    await bootWithDir(page);
    const res = await page.evaluate(async (d) => {
      const r = await fetch('/verify-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: d, types: ['R0403_x'], mode: 'offline' }),
      });
      return { status: r.status, body: await r.json() };
    }, DIR);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('unknown mode');
    expect(res.body.expected.doc).toBe('GET /verify-svg');
  });

  test('索引どおりの形で叩けば 200 で判定が返る (grep の往復が要らない)', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0403_one', A1);
    const res = await page.evaluate(async (d) => {
      const r = await fetch('/verify-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: d, types: ['R0403_one'], mode: 'local' }),
      });
      return { status: r.status, body: await r.json() };
    }, DIR);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // svg をまだ保存していないので missing。形が通ったことが分かればよい。
    expect(res.body.results.R0403_one.status).toBe('missing');
  });
});

