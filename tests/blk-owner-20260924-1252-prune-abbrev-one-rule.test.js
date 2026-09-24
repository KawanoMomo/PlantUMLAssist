'use strict';
// BLK-owner-20260924-1252-prune: 社内略語の見分け方を glossary の 1 本にする。
// 📤 提出前チェックは自前の辞書で略語を決めず、glossary で数えた語 (🔤 表記統一の略語欄と同じ語) を当てる。
// 辞書は「略語以外で出したくない語」の欄で、前の既定 (Drv / Ctrl / Mgr / Cfg) は入れない。
if (!global.window) global.window = global;
['../src/core/bulk-rename.js', '../src/core/glossary.js', '../src/core/submit-check.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var W = global.window;
var G = W.MA.glossary;
var SC = W.MA.submitCheck;

var DOCS = [
  { id: 'd1', name: 'spi_init_sequence', dsl: [
    '@startuml', 'title SPI 初期化 (暫定)', 'participant SpiDrv', 'participant IsrHdlr',
    'SpiDrv -> IsrHdlr : enable', '@enduml'].join('\n') },
  // 宣言が無く、メッセージにだけ出る略語 (提出前チェックの表の行には出ない)。
  { id: 'd2', name: 'dma_init_sequence', dsl: [
    '@startuml', 'DmaCtrl -> Hal : ready', '@enduml'].join('\n') },
];

function abbrevsOf(docs) { return G.scan(docs).map(function(r) { return r.term; }); }

describe('BLK-owner-20260924-1252-prune 既定の辞書から略語を外す', function() {
  test('Drv / Ctrl / Mgr / Cfg は既定に無く、出したくない語は残る', function() {
    ['Drv', 'Ctrl', 'Mgr', 'Cfg'].forEach(function(t) { expect(SC.DEFAULT_TERMS.indexOf(t)).toBe(-1); });
    ['TBD', 'FIXME', '仮', '暫定'].forEach(function(t) { expect(SC.DEFAULT_TERMS.indexOf(t) >= 0).toBe(true); });
  });

  test('保存済みの辞書に残った短縮語 (glossary の語尾表) は使わない', function() {
    var suffixes = G.SUFFIXES.map(function(x) { return x[0]; });
    expect(SC.dropAbbrevWords(['Drv', 'TBD', 'Ctrl', '暫定', 'Hdlr'], suffixes)).toEqual(['TBD', '暫定']);
  });
});

describe('BLK-owner-20260924-1252-prune 略語は glossary の語で当てる', function() {
  test('略語の数は glossary.scan と同じ (メッセージにだけ出る略語も数える)', function() {
    var ab = abbrevsOf(DOCS);
    var res = SC.check(DOCS, SC.DEFAULT_TERMS, { abbrevs: ab });
    expect(res.abbrevs.length).toBe(G.scan(DOCS).length);
    expect(res.abbrevs.indexOf('DmaCtrl') >= 0).toBe(true);
    expect(res.abbrevs.indexOf('IsrHdlr') >= 0).toBe(true);
  });

  test('Hdlr のように前の既定の辞書に無かった略語も行が赤くなる', function() {
    var res = SC.check(DOCS, SC.DEFAULT_TERMS, { abbrevs: abbrevsOf(DOCS) });
    var row = res.rows.filter(function(r) { return r.text === 'IsrHdlr'; })[0];
    expect(row.flagged).toBe(true);
    expect(row.abbrevs).toEqual(['IsrHdlr']);
    expect(row.hits).toEqual(['IsrHdlr']);
  });

  test('略語と出したくない語は分けて持ち、hits は 略語 → 語 の順', function() {
    var res = SC.check(DOCS, SC.DEFAULT_TERMS, { abbrevs: abbrevsOf(DOCS) });
    var t = res.rows.filter(function(r) { return r.kind === 'title'; })[0];
    expect(t.abbrevs).toEqual([]);
    expect(t.words).toEqual(['暫定']);
  });

  test('登録簿で揃える先が決まった語は呼び出し側が外して渡す (渡さなければ数えない)', function() {
    var ab = abbrevsOf(DOCS).filter(function(t) { return t !== 'SpiDrv'; });
    var res = SC.check(DOCS, SC.DEFAULT_TERMS, { abbrevs: ab });
    var row = res.rows.filter(function(r) { return r.text === 'SpiDrv'; })[0];
    expect(row.flagged).toBe(false);
  });

  test('要約と略語の行は 🔤 表記統一と同じ言い方で件数を言う', function() {
    var res = SC.check(DOCS, SC.DEFAULT_TERMS, { abbrevs: abbrevsOf(DOCS) });
    var n = G.scan(DOCS).length;
    expect(SC.summaryLine(res).indexOf('社内略語 ' + n + ' 語') >= 0).toBe(true);
    expect(SC.abbrevLine(res).indexOf(n + ' 件の社内略語が全図に残っています') === 0).toBe(true);
    var none = SC.check(DOCS, SC.DEFAULT_TERMS, { abbrevs: [] });
    expect(SC.abbrevLine(none)).toBe('社内略語は残っていません');
  });

  test('略語が残っていれば clean ではない (表の行に出ない略語でも)', function() {
    var only = [{ id: 'x', name: 'x', dsl: '@startuml\ntitle 構成\nDmaCtrl -> Hal : go\n@enduml' }];
    var res = SC.check(only, SC.DEFAULT_TERMS, { abbrevs: abbrevsOf(only) });
    expect(res.flagged.length).toBe(0);
    expect(res.clean).toBe(false);
  });
});
