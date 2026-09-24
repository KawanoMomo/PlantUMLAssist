'use strict';
// BLK-owner-20260924-1332-prune: 🔍 名前突合の画面を畳み、見つけるのは ▦ 突合ボード、
// 直すのは 🔤 表記統一の 1 本ずつにする。
// - ツール ▾ / Ctrl+K に「表記揺れ」「名前突合」と打った語から、ボードを絞るカテゴリが決まる
// - ボードの「名前/表記揺れ」の行は、揃える先に選べる綴りを持つ (表記統一へ渡す材料)
// - ツール ▾ には 🔍 名前突合の行が無く、ボードの行が「表記揺れ」で当たる
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

const board = require('../src/core/audit-board');
try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');
const TM = global.window.MA.toolMenu;

function ok(result) { return { status: 'ok', result: result }; }

describe('kindForQuery — 打った語から最初に絞るカテゴリ', function() {
  test('「表記揺れ」「名前突合」「name audit」は 名前/表記揺れ', function() {
    ['表記揺れ', '名前の表記揺れ', '名前突合', 'Name audit', 'ゆれ'].forEach(function(q) {
      expect(board.kindForQuery(q)).toBe('name.variants');
    });
  });

  test('「宣言なし」は 名前/宣言なし、「メソッド突合」は メソッド', function() {
    expect(board.kindForQuery('宣言なし')).toBe('name.undeclared');
    expect(board.kindForQuery('メソッド突合')).toBe('method.issues');
  });

  test('ボードそのものの語・空は絞らない (前の絞り込みを持ち越さない)', function() {
    ['', null, undefined, '突合ボード', 'cross', '突合'].forEach(function(q) {
      expect(board.kindForQuery(q)).toBe('');
    });
  });

  test('返すカテゴリはボードの KINDS に在るもの', function() {
    var kinds = board.KINDS.map(function(k) { return k.kind; });
    ['表記揺れ', '宣言なし', 'メソッド突合'].forEach(function(q) {
      expect(kinds).toContain(board.kindForQuery(q));
    });
  });
});

describe('名前/表記揺れの行は揃える先に選べる綴りを持つ', function() {
  const b = board.build({
    audits: {
      name: ok({
        variants: [{ key: 'irqctrl', suggested: 'IRQCtrl', members: [
          { name: 'IRQCtrl', docs: ['spi_seq'], refs: 2 },
          { name: 'IrqCtrl', docs: ['can_seq'], refs: 1 },
        ] }],
        undeclared: [{ name: 'DmaCtrl', docs: ['cls'] }],
      }),
    },
  });

  test('綴りは組の全員 (多数派も含む)', function() {
    var row = board.filter(b, { kind: 'name.variants' })[0];
    expect(row.names).toEqual(['IRQCtrl', 'IrqCtrl']);
    expect(row.title).toBe('IRQCtrl');
  });

  test('宣言なしの行には綴りを付けない (揃える話ではない)', function() {
    var row = board.filter(b, { kind: 'name.undeclared' })[0];
    expect(row.names === undefined).toBe(true);
  });

  test('絞り込みは kindForQuery の結果でそのまま効く', function() {
    var rows = board.filter(b, { kind: board.kindForQuery('表記揺れ') });
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe('名前/表記揺れ');
  });
});

describe('ツール ▾ の入口は 1 つ', function() {
  test('🔍 名前突合 (btn-tab-audit) はメニューに無い', function() {
    expect(TM.groupOf('btn-tab-audit')).toBe(null);
    expect(TM.menuIds()).not.toContain('btn-tab-audit');
  });

  test('「表記揺れ」「名前突合」の絞り込みは ▦ 突合ボードの行に当たる', function() {
    ['表記揺れ', '名前突合', 'name audit'].forEach(function(q) {
      var ids = TM.filterItems(q).map(function(it) { return it.id; });
      expect(ids).toContain('btn-tab-cross');
    });
    // 直す側の 🔤 表記統一は「表記」で別の行として残る (見つける 1 本・直す 1 本)。
    var fix = TM.filterItems('表記').map(function(it) { return it.id; });
    expect(fix).toContain('btn-tab-unify');
    expect(fix).toContain('btn-tab-cross');
  });

  test('確かめるの 1 面は 14 行以内のまま (design 9b)', function() {
    expect(TM.rowCount('check')).toBeLessThanOrEqual(14);
  });
});

describe('methodDetail — 画面ではメソッド突合の全件をボードで見る', function() {
  const audits = {
    consistency: ok({ naming: [], unused: [], granularity: [],
      methods: [{ doc: 'seq', target: 'Uart_Driver', method: 'Uart_Recv' }],
      events: [] }),
    method: ok({ calls: [], issues: [
      { kind: 'no-class', method: 'Timer_Init', owner: 'Timer', docs: ['seq'] },
      { kind: 'no-method', method: 'Uart_Recv', cls: 'Uart_Driver', docs: ['seq'] },
      { kind: 'arity', method: 'Spi_Transmit', cls: 'Spi_Driver', args: 1, declaredArgs: 2, docs: ['seq'] },
    ] }),
  };

  test('CLI (既定) は consistency があればメソッド突合を出さない (従来どおり)', function() {
    const b = board.build({ audits: audits });
    expect(board.filter(b, { kind: 'method.issues' }).length).toBe(0);
    expect(board.filter(b, { kind: 'consistency.methods' }).length).toBe(1);
  });

  test('画面は 3 件ともメソッドの行に出し、同じ (クラス, メソッド) の整合の行は畳む', function() {
    const b = board.build({ audits: audits, methodDetail: true });
    const rows = board.filter(b, { kind: 'method.issues' });
    expect(rows.map(function(r) { return r.issueKind; }).sort()).toEqual(['arity', 'no-class', 'no-method']);
    expect(rows.map(function(r) { return r.method; }).sort()).toEqual(['Spi_Transmit', 'Timer_Init', 'Uart_Recv']);
    expect(board.filter(b, { kind: 'consistency.methods' }).length).toBe(0);
    expect(b.total).toBe(3);
  });
});
