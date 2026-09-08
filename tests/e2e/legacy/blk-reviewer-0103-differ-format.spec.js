const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-reviewer-20260908-0103 (1903 追記): dma のラベル修正が反映済みなのに
// POST /verify-svg が 7 枚とも 'differ' を返した。svgLabels/drawnLabels も
// svgShape/drawnShape も完全一致で、違うのは書き出し経路による体裁だけ
// (contentStyleType の大小・style="max-width…" の有無・XML 宣言の書式)。
// 生バイト比較のままの status を、differ-format / differ-content に分ける。
const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);

const NOW = '@startuml\nparticipant A\nparticipant B\nA -> B: go\nB -> A: done\n@enduml';
const OTHER = '@startuml\nparticipant A\nA -> B: go\n@enduml';

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

function render(page, dsl) {
  return page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, dsl);
}

// 「別の書き出し経路で保存された svg」を作る。描かれるもの (text 要素・図形の数) は
// 1 つも変えず、ヘッダの体裁だけを変える — reviewer が実データで踏んだ状態そのもの。
function reformat(svg) {
  let out = svg;
  out = out.replace('contentStyleType="text/css"', 'contentStyleType="text/CSS"');
  out = out.replace(/style="[^"]*max-width[^"]*"/, 'style=""');
  if (out.startsWith('<?xml')) out = out.replace(/^<\?xml[^>]*\?>\s*/, '<?xml version="1.0" encoding="UTF-8" ?>\n');
  else out = '<?xml version="1.0" encoding="UTF-8" ?>\n' + out;
  return out;
}

async function putRawSvg(page, name, svgText) {
  fs.writeFileSync(path.join(ABS, name + '.svg'), svgText, 'utf-8');
}

function verify(page, names) {
  return page.evaluate(async (a) => {
    const r = await fetch('/verify-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: a.dir, types: a.names, mode: 'local' }),
    });
    return r.json();
  }, { names, dir: DIR });
}

test.describe('BLK-reviewer-0103 (1903) /verify-svg の differ 誤判定', () => {
  test('体裁だけが違う SVG は differ-format、中身が違う SVG は differ-content', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await page.evaluate(async (d) => {
      await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
    }, DIR);
    await putFile(page, 'R0103f_fmt', NOW);
    await putFile(page, 'R0103f_cnt', NOW);
    const svg = await render(page, NOW);
    expect(svg).not.toBeNull();
    await putRawSvg(page, 'R0103f_fmt', reformat(svg));       // 中身は同じ、体裁だけ違う
    await putRawSvg(page, 'R0103f_cnt', await render(page, OTHER));  // 描かれるものが違う

    const res = await verify(page, ['R0103f_fmt', 'R0103f_cnt']);
    expect(res.results['R0103f_fmt'].status).toBe('differ-format');
    expect(res.results['R0103f_fmt'].contentMatch).toBe(true);
    expect(res.results['R0103f_fmt'].note).toContain('作り直さなくても読めます');
    expect(res.results['R0103f_cnt'].status).toBe('differ-content');
    expect(res.results['R0103f_cnt'].contentMatch).toBe(false);
    // 食い違った図には、中身を言うための材料がこれまでどおり添う
    expect(Array.isArray(res.results['R0103f_cnt'].svgLabels)).toBe(true);
    expect(Array.isArray(res.results['R0103f_cnt'].drawnLabels)).toBe(true);
  });

  test('一覧は体裁差を「ずれ」に数えず、作り直しの対象にもしない', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await page.evaluate(async (d) => {
      await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
    }, DIR);
    await putFile(page, 'R0103f_only', NOW);
    const svg = await render(page, NOW);
    await putRawSvg(page, 'R0103f_only', reformat(svg));

    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-panel.open .folder-item');
    await expect(page.locator('#folder-svg-content')).toContainText('未確認 1 枚');
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('体裁だけが違う', { timeout: 120000 });
    await expect(page.locator('#folder-svg-verify-note')).toContainText('体裁差のみ 1 枚');
    // 行の印は「体裁差のみ」。作り直しは要らない
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R0103f_only"] [data-svg-content="format"]'))
      .toHaveCount(1);
    await expect(page.locator('#folder-svg-render')).toHaveText(/古い SVG はありません|作り直す SVG はありません/);
  });

  test('GET /render の仕様に verify の status の意味が書いてある', async ({ page }) => {
    await gotoApp(page);
    const doc = await page.evaluate(async () => (await fetch('/render')).json());
    expect(doc.comparison.verifyStatus['differ-format']).toContain('体裁');
    expect(doc.comparison.verifyStatus['differ-content']).toContain('作り直しが要る');
  });
});
