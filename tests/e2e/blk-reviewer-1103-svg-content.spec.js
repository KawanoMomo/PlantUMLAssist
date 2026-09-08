const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

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

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
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
    // mtime では stale だが、内容が一致しているので印も名指しも出ない。
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1103_touched"] .folder-svg-badge'))
      .toHaveCount(0);
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
