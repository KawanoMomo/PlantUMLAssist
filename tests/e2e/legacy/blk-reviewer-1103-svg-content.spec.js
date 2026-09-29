const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-reviewer-20260908-1103: mtime の比較 (svg-freshness) だけでは
// 「その SVG が今の DSL から作られたか」は言えない。mtime が古いと出た 16 枚のうち
// 実際に中身まで食い違っていたのは 7 枚で、残りは保存し直しただけだった。
// それを確かめるのに 22 回の curl + diff を毎回やっていた。
// server が svg の末尾に元 puml の sha1 を刻み、一覧が内容で答えることを確かめる。
const DIR = saveDirFor(__filename);

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

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function entryOf(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(a.dir));
    const j = await r.json();
    return (j.entries || []).filter((e) => e.name === a.name)[0] || null;
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

const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';
const A2 = '@startuml\nparticipant A\nA -> B: go\nB -> C: next\n@enduml';

test.describe('BLK-reviewer-20260908-1103: SVG が今の DSL から作られたかを内容で言う', () => {
  test('書き出した SVG は元の puml の sha1 を持ち、一覧が内容で突き合わせる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103_same', A1);
    expect(await putSvg(page, 'R1103_same')).toBe(200);

    const entry = await entryOf(page, 'R1103_same');
    expect(entry.svgSource).toMatch(/^[0-9a-f]{40}$/);
    // 刻んだ印は、その時の puml の sha1 と同じもの。
    expect(entry.svgSource).toBe(entry.hash);

    await openFolder(page);
    await expect(page.locator('#folder-svg-content')).toContainText('1 枚とも今の puml から作られています');
    await expect(page.locator('#folder-svg-proof')).toBeDisabled();
  });

  test('保存し直しただけで中身が同じ図は、mtime が古くても「直すもの」に出さない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103_touched', A1);
    expect(await putSvg(page, 'R1103_touched')).toBe(200);
    // mtime は秒精度。同じ中身で puml を保存し直し、svg より新しくする
    // (reviewer が「mtime は古いが中身は一致」と実測した 10 枚と同じ状態)。
    await page.waitForTimeout(1200);
    await putFile(page, 'R1103_touched', A1);

    const entry = await entryOf(page, 'R1103_touched');
    expect(Date.parse(entry.mtime)).toBeGreaterThan(Date.parse(entry.svgMtime));
    expect(entry.svgSource).toBe(entry.hash);

    await openFolder(page);
    // mtime では stale だが、内容が一致しているので「作り直し要」の印も名指しも出ない。
    // 行には「mtime だけ古い (中身は追いついている)」の第三の印だけが付く (BLK-reviewer-20260915-0406-wish)。
    const row = page.locator('#folder-panel .folder-item[data-file-name="R1103_touched"]');
    await expect(row.locator('.folder-svg-badge:not([data-svg-status="stale-settled"])')).toHaveCount(0);
    await expect(row.locator('.folder-svg-badge[data-svg-status="stale-settled"]')).toHaveCount(1);
    await expect(page.locator('#folder-panel .folder-svg-names')).toHaveCount(0);
    await expect(page.locator('#folder-svg-content')).toContainText('今の puml から作られています');
  });

  test('中身まで食い違っている図は「内容ずれ」で名指しされる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103_differ', A1);
    expect(await putSvg(page, 'R1103_differ')).toBe(200);
    await page.waitForTimeout(1200);
    await putFile(page, 'R1103_differ', A2);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1103_differ"] .folder-svg-content-badge'))
      .toHaveText('内容ずれ');
    await expect(page.locator('#folder-svg-content')).toContainText('ずれ 1 枚');
  });

  // BLK-reviewer-20260908-1103 (2103 差し戻し): 印は puml のバイト列が変われば
  // 体裁だけの書き換えでも食い違うので、描かれる中身は同じ図まで「内容ずれ」に出て、
  // しかも「上書きせずに確かめる」の対象から外れていた。reviewer は同じ 6 枚を毎回
  // /render + labels 突合で切り分け直していた。
  test('印だけでずれと出た図を、上書きせずに 1 押しで確かめられる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103_stampdiff', A1);
    // 実際に描いた svg を保存する (印はこの時の puml のもの)。
    const svg = await page.evaluate(async (a) => {
      const r = await fetch('/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: a.dsl, mode: 'local' }),
      });
      return r.ok ? await r.text() : null;
    }, { dsl: A1 });
    expect(svg).toContain('<svg');
    const put = await page.evaluate(async (a) => {
      const r = await fetch('/autosave-svg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'R1103_stampdiff', dir: a.dir, svg: a.svg }),
      });
      return r.status;
    }, { dir: DIR, svg });
    expect(put).toBe(200);

    // 描かれるものは変わらない書き換え (コメント行の追加) で puml を保存し直す。
    await page.waitForTimeout(1200);
    await putFile(page, 'R1103_stampdiff', A1.replace('@enduml', "' 覚え書き\n@enduml"));

    const entry = await entryOf(page, 'R1103_stampdiff');
    expect(entry.svgSource).not.toBe(entry.hash);   // 印は食い違う

    await openFolder(page);
    const row = page.locator('#folder-panel .folder-item[data-file-name="R1103_stampdiff"] .folder-svg-content-badge');
    await expect(row).toHaveText('内容ずれ');
    // 印だけの判定なので「作り直しが要る」とは言い切らない。
    await expect(row).toHaveAttribute('title', /SVG の中身を確かめる/);

    // 上書きせずに確かめるボタンがこの図を対象にしている (以前は 0 枚で押せなかった)。
    const verify = page.locator('#folder-svg-verify');
    await expect(verify).toContainText('SVG の中身を確かめる（1 枚）');
    await expect(verify).toBeEnabled();
    await verify.click();

    // 描き直して比べた結果が印より優先され、名指しから外れる。
    await expect(page.locator('#folder-svg-content')).not.toContainText('ずれ 1 枚', { timeout: 60000 });
    await expect(row).not.toHaveText('内容ずれ');
    await expect(page.locator('#folder-svg-verify')).toContainText('中身を確かめる SVG はありません');
    // 保存されていた svg はそのまま (作り直していない)。
    const after = await entryOf(page, 'R1103_stampdiff');
    expect(after.svgHash).toBe(entry.svgHash);
  });

  test('内容で言い切れない図は 1 押しで作り直され、印が付く', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103_a', A1);
    await putFile(page, 'R1103_b', A2);

    await openFolder(page);
    const proof = page.locator('#folder-svg-proof');
    await expect(proof).toContainText('内容を確かめる（2 枚を作り直す）');
    await proof.click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('2 枚とも今の puml から作られています', { timeout: 60000 });
    await expect(page.locator('#folder-svg-proof')).toContainText('内容はすべて確かめてあります');

    // 作り直した svg には元の puml の印が入っている。
    const entry = await entryOf(page, 'R1103_b');
    expect(entry.svgSource).toBe(entry.hash);
  });
});
