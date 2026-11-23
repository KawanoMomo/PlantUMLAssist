// @ts-check
// ペルソナ台本の scenario (tests/scenarios/{persona}-{手順}-{場面}.spec.js) の共通の道具。
// サーバの起こし方 (PUA_DATA_ROOT で test-results/ の下) と gotoApp は既存の e2e (tests/e2e) と同じものを使う。
// 計測値は testInfo.annotations に積み、scripts/verify-summary.js が summary.json に写す:
//   renderMs  … 操作 (クリック) から、その結果が描かれた SVG に出るまでの ms
//   diffLines … 1 操作で PlantUML 本文の動いた行数 (足した + 消した)
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../e2e/helpers');
const S = require('../e2e/scenarios/_scenario');

const FIXTURES = path.join(__dirname, 'fixtures');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

// 本文を行で比べ、動いた行数 (足した + 消した) を返す。LCS で数えるので、並びの保たれた行は数えない。
function diffLines(before, after) {
  const a = String(before).split('\n');
  const b = String(after).split('\n');
  const n = a.length, m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return (n - dp[0][0]) + (m - dp[0][0]);
}

// before にあって after に無い行 (= 消えた・書き換わった行)。並びは保つ。
function removedLines(before, after) {
  const rest = String(after).split('\n');
  const out = [];
  for (const l of String(before).split('\n')) {
    const k = rest.indexOf(l);
    if (k >= 0) rest.splice(k, 1); else out.push(l);
  }
  return out;
}

function annotate(testInfo, type, value) {
  testInfo.annotations.push({ type: type, description: String(value) });
}

// 台本の scenario は利用者の初回と同じ画面で開く (TICKET-owner-20261116-0340-1)。
// タブ列は 図のタブ・＋・右端の「ツール ▾」1 つ (TICKET-owner-20261123-0222-prune)。道具は利用者と同じ入口
// (ツール ▾・Ctrl+K・FILES の右クリック) から開く。
async function expectDefaultTabBar(page) {
  await expect(page.locator('#btn-tab-tools')).toBeVisible();
}

// アプリを開き、本文を流し込んで描かれるのを待つ (ペルソナが既存の図を開いた状態)。
async function bootWith(page, dsl) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await expectDefaultTabBar(page);
  if (dsl != null) await setText(page, dsl);
}

// 保存先を設定済みにして開く (tests/e2e/scenarios/_scenario.js の bootWithSaveDir を既定のタブ列で)。
async function bootWithSaveDir(page, dir) {
  await S.bootWithSaveDir(page, dir);
  await expectDefaultTabBar(page);
}

// 「ツール ▾」(タブ列の右端) を押して一覧を開く。
async function openToolMenu(page) {
  await page.locator('#btn-tab-tools').click();
  await page.waitForSelector('#tool-menu:not([hidden])');
}

async function setText(page, dsl) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(400);
}

// 描かれた SVG の文字 (text 要素) を全部つないだもの。
async function svgText(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    if (!svg) return '';
    return Array.from(svg.querySelectorAll('text')).map((t) => t.textContent || '').join('\n');
  });
}

// 描かれた SVG に words が全部出るまで待ち、待った ms を返す。
async function waitDrawn(page, words, timeout) {
  const t0 = Date.now();
  await page.waitForFunction((ws) => {
    const svg = document.querySelector('#preview-svg svg');
    if (!svg) return false;
    const txt = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent || '').join('\n');
    return ws.every((w) => txt.indexOf(w) >= 0);
  }, words, { timeout: timeout || 20000 });
  return Date.now() - t0;
}

// 1 操作を計る: act() の前後で本文の差分行数と、操作から描画までの ms を取り、annotation に積む。
// drawnWords は「操作の結果が描けた」と言える語 (足した名前・ラベル)。
async function measure(page, testInfo, act, drawnWords) {
  const before = await getEditorText(page);
  const t0 = Date.now();
  await act();
  let renderMs = null;
  if (drawnWords && drawnWords.length) {
    await waitDrawn(page, drawnWords);
    renderMs = Date.now() - t0;
    annotate(testInfo, 'renderMs', renderMs);
  }
  const after = await getEditorText(page);
  const d = diffLines(before, after);
  annotate(testInfo, 'diffLines', d);
  return { before, after, diffLines: d, renderMs };
}

// 描画にエラーが出ていない (構文エラーの帯・パース NG が無い)。
async function expectRendered(page) {
  await expect(page.locator('#preview-svg svg')).toHaveCount(1);
  await expect(page.locator('#status-parse')).toHaveAttribute('data-dot', 'ok');
}

// 書き出した PNG (8bit RGBA・非インターレース) を画素に戻す (場面 4「書き出し」の scenario が共用)。
function decodePng(buf) {
  const zlib = require('zlib');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const info = { w, h, depth: buf[24], ctype: buf[25], interlace: buf[28] };
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    if (buf.toString('ascii', p + 4, p + 8) === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const r = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = (x >= bpp && y > 0) ? px[(y - 1) * stride + x - bpp] : 0;
      let v = r;
      if (f === 1) v = r + a;
      else if (f === 2) v = r + b;
      else if (f === 3) v = r + ((a + b) >> 1);
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = r + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      }
      px[y * stride + x] = v & 255;
    }
  }
  return Object.assign(info, { px });
}

// 何も選ばずに書き出した PNG の倍率 (TICKET-junior-20261123-1142-wish。PNG の画素数は SVG の寸法 × これ)。
const PNG_SCALE = 2;

// 隅の色と違う画素 (線・文字・塗り) の数と、そのうち外周 1px に掛かる数。
function inkStats(img) {
  const at = (x, y) => img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
  const bg = Array.from(at(0, 0));
  let ink = 0, edge = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const v = at(x, y);
      if (v[0] === bg[0] && v[1] === bg[1] && v[2] === bg[2] && v[3] === bg[3]) continue;
      ink++;
      if (x === 0 || y === 0 || x === img.w - 1 || y === img.h - 1) edge++;
    }
  }
  return { corner: bg, ink, edge };
}

module.exports = {
  FIXTURES, fixture, diffLines, removedLines, annotate, decodePng, inkStats, PNG_SCALE,
  bootWith, bootWithSaveDir, expectDefaultTabBar, openToolMenu, setText, svgText, waitDrawn, measure, expectRendered, getEditorText,
};
