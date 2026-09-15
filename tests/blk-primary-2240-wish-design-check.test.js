'use strict';
// BLK-primary-20260915-2240-wish: design の仕様と GUI の現在値を突き合わせる画面が無く、
// 手順 11 は「食い違って見えるが、仕様後退なのか設定差なのか判定できない」で止まっていた。
// ここで固定するのは「不一致は必ず設定差か仕様後退のどちらかに落ちる」こと。
const assert = require('assert');

if (typeof global.document === 'undefined') {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
const DC = require('../src/core/design-check');

function docOf(html) {
  const jsdom = require('jsdom');
  return new jsdom.JSDOM('<!DOCTYPE html><html><body>' + html + '</body></html>').window.document;
}

// 7b どおりの静かなタブ列 (機能ボタンは畳まれている)。
const QUIET_BAR = [
  '<div id="tab-bar" class="tools-folded tools-quiet tools-hide-tool-btn">',
  '  <button class="tab-tool" id="btn-tab-new">＋</button>'.replace('class="tab-tool"', 'class="tab-tool" hidden'),
  '  <button class="tab-tool tool-folded" id="btn-tab-cross">▦</button>',
  '  <button class="tab-tool tab-tool-mini" id="btn-tab-tools-mini">他 25 件</button>',
  '</div>',
].join('');

// BLK-primary-20260915-2240-friction で突合項目が 6 項目から 15 項目に増えた
// (design/README.md の「対象の仕様」6 ファイル全部を見るようにしたため)。
// 「仕様どおりの画面」の見本なので、増えた項目のぶんもここに揃える。
const CONTEXT_PARTS = [
  '<div id="cp-foot">↑↓ 選択 · Enter 実行 · Tab 種別で絞り込み · Esc 閉じる</div>',
  '<div id="export-menu">' + [1, 2, 3, 4].map(() => '<button></button>').join('') + '</div>',
  '<button id="props-tab-settings">図の設定</button><div id="diagram-settings-content" hidden></div>',
  '<div id="state-table-panel" hidden><button id="btn-state-table-toggle"></button>'
    + '<button id="btn-state-table-csv"></button></div>',
  '<div id="cfg-render-modes"></div><input id="cfg-render-debounce"><input id="cfg-render-error-overlay">',
  '<input id="cfg-editor-indent"><input id="cfg-editor-font"><input id="cfg-editor-click-to-line">',
  '<div id="cfg-shortcuts-list"></div><input id="cfg-sc-search"><button id="cfg-sc-reset"></button>',
  '<div id="line-numbers">1</div><div id="insert-marker" hidden></div><div id="props-insert-hint" hidden></div>',
  '<div id="cfg-cv-list"></div><input id="cfg-cv-search"><div id="cfg-cv-legend"></div>',
].join('');

const FULL_APP = QUIET_BAR
  + '<div id="editor-pane"></div><div id="preview-pane"></div><div id="props-pane"></div>'
  + '<div id="cp-modal"></div>'
  + '<div id="rail-types">'
  + [1, 2, 3, 4, 5, 6].map(() => '<button class="rail-btn"></button>').join('')
  + '</div>'
  + CONTEXT_PARTS;

describe('BLK-primary-2240 仕様突合の判定', function() {
  test('仕様どおりなら一致と言い切る', function() {
    const rows = DC.run(docOf(FULL_APP), () => null);
    const verdicts = rows.map((r) => r.verdict);
    assert.ok(verdicts.every((v) => v === 'ok'), JSON.stringify(rows.filter((r) => r.verdict !== 'ok')));
    assert.strictEqual(DC.summary(rows).gap, 0);
  });

  test('設定を自分で変えている環境の不一致は「設定差」になる (仕様後退にしない)', function() {
    // 「ツール ▾ をタブ列に出す」を押した人 = quiet が '0'。機能ボタンが並ぶ。
    const doc = docOf(FULL_APP.replace('tools-folded tools-quiet tools-hide-tool-btn', ''));
    const rows = DC.run(doc, (k) => (k === 'plantuml-tools-quiet' ? '0' : null));
    const tab = rows.filter((r) => r.id === '7b-tab-bar-diagrams-only')[0];
    assert.strictEqual(tab.verdict, 'setting');
    assert.ok(tab.reason.indexOf('既定に戻せば') >= 0, tab.reason);
    // 設定差の行は BLK の下書きにしない (BLK にする値打ちがあるのは仕様後退だけ)。
    assert.strictEqual(DC.blockerDraft(tab), '');
  });

  // 1 つの項目に効く設定は 1 つとは限らない。畳みを解いただけの環境 (E2E の下ごしらえや、
  // 自分で「ツール ▾」を出した人) を仕様後退と読み違えると、この画面は信用されなくなる。
  test('別の設定 (畳む) を変えただけでも、タブ列の不一致は「設定差」になる', function() {
    const doc = docOf(FULL_APP.replace('tools-folded tools-quiet tools-hide-tool-btn', 'tools-quiet'));
    const rows = DC.run(doc, (k) => (k === 'plantuml-tools-folded' ? '0' : null));
    const tab = rows.filter((r) => r.id === '7b-tab-bar-diagrams-only')[0];
    assert.strictEqual(tab.verdict, 'setting');
    assert.ok(tab.settingKeys.indexOf('plantuml-tools-folded') >= 0, JSON.stringify(tab.settingKeys));
  });

  test('設定が既定なのに満たしていなければ「仕様後退」と言い切る', function() {
    const doc = docOf(FULL_APP.replace('tools-folded tools-quiet tools-hide-tool-btn', ''));
    const rows = DC.run(doc, () => null);
    const tab = rows.filter((r) => r.id === '7b-tab-bar-diagrams-only')[0];
    assert.strictEqual(tab.verdict, 'gap');
    assert.ok(tab.reason.indexOf('仕様後退') >= 0, tab.reason);
  });

  test('仕様後退は、そのまま BLK 本文にできる文になる (期待・現在・切り分けが揃う)', function() {
    const doc = docOf(FULL_APP.replace('tools-folded tools-quiet tools-hide-tool-btn', ''));
    const rows = DC.run(doc, () => null);
    const draft = DC.blockerDraft(rows.filter((r) => r.verdict === 'gap')[0]);
    assert.ok(draft.indexOf('期待:') >= 0, draft);
    assert.ok(draft.indexOf('現在:') >= 0, draft);
    assert.ok(draft.indexOf('設定差ではなく') >= 0, draft);
    assert.ok(draft.indexOf('実装現況') >= 0, draft);
  });

  test('画面ごと欠けていても測れなかったで止まらず、仕様後退として出る', function() {
    const rows = DC.run(docOf(''), () => null);
    const panes = rows.filter((r) => r.id === '1a-three-panes')[0];
    assert.strictEqual(panes.verdict, 'gap');
    assert.ok(panes.actual.indexOf('editor-pane') >= 0, panes.actual);
  });

  test('並びは 仕様後退 → 設定差 → 一致 (直すべきものが上に来る)', function() {
    const doc = docOf(FULL_APP.replace('tools-folded tools-quiet tools-hide-tool-btn', '')
      .replace('<div id="cp-modal"></div>', ''));
    const rows = DC.sortRows(DC.run(doc, (k) => (k === 'plantuml-tools-folded' ? '0' : null)));
    const idx = (v) => rows.map((r) => r.verdict).indexOf(v);
    assert.ok(idx('gap') === 0, JSON.stringify(rows.map((r) => r.verdict)));
    if (idx('setting') >= 0 && idx('ok') >= 0) assert.ok(idx('setting') < idx('ok'));
  });

  test('要約は「BLK にすべき件数」を先に言う', function() {
    const doc = docOf(FULL_APP.replace('<div id="cp-modal"></div>', ''));
    const rows = DC.run(doc, () => null);
    const text = DC.summaryText(rows);
    assert.ok(text.indexOf('仕様後退 1 件') >= 0, text);
  });

  test('すべて仕様どおりなら、そう言い切る', function() {
    assert.strictEqual(DC.summaryText(DC.run(docOf(FULL_APP), () => null)),
      DC.CHECKS.length + ' 項目すべて仕様どおり');
  });

  test('仕様項目はどれも出典 (ファイル名と案番号) を持つ', function() {
    DC.checks().forEach((c) => {
      assert.ok(c.spec.indexOf('.dc.html') > 0, c.id);
      assert.ok(!!c.plan, c.id);
      assert.strictEqual(typeof c.probe, 'function');
    });
  });
});
