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

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
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
