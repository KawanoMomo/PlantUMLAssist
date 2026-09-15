'use strict';
// BLK-primary-20260915-2240-friction: 仕様突合の項目が design/README.md の「対象の仕様」
// 6 ファイルのうち 2 ファイルぶんしか無く、残り 4 ファイルは結局 .dc.html を grep して
// 読むことになっていた (手順 11 の手作業が半分残る)。
//
// ここで固定するのは 3 つ:
//   1. 6 ファイル全部に突合項目がある (網羅の穴が無い)。穴があれば coverageText が名指しする
//   2. その場面でだけ出る部品 (設定モーダル・State 図) を「出ていない = 仕様後退」と
//      数えない。数えると突合を開くたびに嘘の仕様後退が並び、判定が使われなくなる
//   3. 本物の plantuml-assist.html を測ると、増やした項目が全部「一致」になる
//      (id を消した・改名した変更をここで捕まえる)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

describe('BLK-primary-2240-friction 仕様突合の網羅', function() {
  test('design/README.md の「対象の仕様」6 ファイル全部に突合項目がある', function() {
    assert.strictEqual(DC.SPECS.length, 6);
    const rows = DC.run(docOf(''), () => null);
    const cov = DC.coverage(rows);
    const empty = cov.filter((c) => !c.total).map((c) => c.spec);
    assert.deepStrictEqual(empty, [], '突合項目の無い出典: ' + empty.join(' / '));
    assert.strictEqual(cov.length, 6);
  });

  test('網羅の穴は coverageText が出典名で名指しする', function() {
    const only = DC.run(docOf(''), () => null)
      .filter((r) => r.spec === DC.SPECS[0]);
    const text = DC.coverageText(only);
    assert.ok(text.indexOf('6 ファイル中 1 ファイル') >= 0, text);
    assert.ok(text.indexOf(DC.SPECS[5]) >= 0, text);
  });

  test('穴が無ければ「手で読む必要のあるファイルは無い」と言い切る', function() {
    const text = DC.coverageText(DC.run(docOf(''), () => null));
    assert.ok(text.indexOf('grep で読む必要のあるファイルは無い') >= 0, text);
  });

  test('その場面でだけ出る項目は scope=context で、測り方が行に付く', function() {
    const rows = DC.run(docOf(''), () => null);
    const ctx = rows.filter((r) => r.scope === 'context');
    assert.ok(ctx.length >= 8, 'context の項目が少なすぎる: ' + ctx.length);
    ctx.forEach((r) => {
      assert.ok(r.scopeText.indexOf('その場面でだけ出る') >= 0, r.id + ': ' + r.scopeText);
    });
    rows.filter((r) => r.scope === 'always').forEach((r) => {
      assert.ok(r.scopeText.indexOf('常に出ている') >= 0, r.id + ': ' + r.scopeText);
    });
  });

  test('並びは 判定 → README の出典順 → 案番号', function() {
    const rows = DC.sortRows(DC.run(docOf(''), () => null));
    const order = { gap: 0, setting: 1, ok: 2 };
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      const key = (r) => [order[r.verdict], r.specIndex, r.plan].join('/');
      assert.ok(key(a) <= key(b), key(a) + ' が ' + key(b) + ' より後ろに来ている');
    }
  });

  test('仕様後退の BLK 本文には測り方が入る (組み込みの有無なのか、出ているかなのか)', function() {
    const row = DC.run(docOf(''), () => null).find((r) => r.id === '5d-element-coverage');
    assert.strictEqual(row.verdict, 'gap');
    const draft = DC.blockerDraft(row);
    assert.ok(draft.indexOf('測り方: ') >= 0, draft);
    assert.ok(draft.indexOf('その場面でだけ出る') >= 0, draft);
  });

  // ---- 本物の画面で測る --------------------------------------------------
  // 設定モーダルや State 図の部品は画面を開かないと出ないので、ここが id の正本の見張り。
  const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

  test('本物の plantuml-assist.html では、増やした項目が全部「一致」になる', function() {
    const jsdom = require('jsdom');
    const doc = new jsdom.JSDOM(HTML).window.document;
    const added = ['2a-palette-footnote', '2c-export-menu', '3d-diagram-settings-tab',
      '4c-state-transition-table', '5a-render-editor-settings', '5b-shortcut-table',
      '5c-insert-guide', '5d-element-coverage'];
    const rows = DC.run(doc, () => null).filter((r) => added.indexOf(r.id) >= 0);
    assert.strictEqual(rows.length, added.length);
    const bad = rows.filter((r) => r.verdict !== 'ok');
    assert.deepStrictEqual(bad.map((r) => r.id + ': ' + r.actual), []);
  });

  test('Ctrl+K の脚注から語が 1 つ落ちたら仕様後退として拾う', function() {
    const doc = docOf('<div id="cp-foot">↑↓ 選択 · Enter 実行 · Esc 閉じる</div>');
    const row = DC.run(doc, () => null).find((r) => r.id === '2a-palette-footnote');
    assert.strictEqual(row.verdict, 'gap');
    assert.ok(row.actual.indexOf('Tab') >= 0, row.actual);
  });

  test('Export メニューが 4 項目を割ったら仕様後退として拾う', function() {
    const doc = docOf('<div id="export-menu"><button></button><button></button></div>');
    const row = DC.run(doc, () => null).find((r) => r.id === '2c-export-menu');
    assert.strictEqual(row.verdict, 'gap');
    assert.ok(row.actual.indexOf('2 項目') >= 0, row.actual);
  });

  test('欠けた部品は id を名指しするので、直す場所が本文から分かる', function() {
    const doc = docOf('<div id="cfg-cv-list"></div><div id="cfg-cv-search"></div>');
    const row = DC.run(doc, () => null).find((r) => r.id === '5d-element-coverage');
    assert.strictEqual(row.verdict, 'gap');
    assert.ok(row.actual.indexOf('cfg-cv-legend') >= 0, row.actual);
  });
});
