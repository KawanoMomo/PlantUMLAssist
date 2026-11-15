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

// アプリを開き、本文を流し込んで描かれるのを待つ (ペルソナが既存の図を開いた状態)。
async function bootWith(page, dsl) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  if (dsl != null) await setText(page, dsl);
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

module.exports = {
  FIXTURES, fixture, diffLines, removedLines, annotate,
  bootWith, setText, svgText, waitDrawn, measure, expectRendered, getEditorText,
};
