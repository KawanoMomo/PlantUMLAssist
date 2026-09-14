'use strict';
// BLK-primary-20260907-0923-wish: 変わった図を全件、変更前後で 1 画面に並べる
// 「変更サマリボード」の組み立て。判断だけを純関数として持つ (描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/change-board.js')]; } catch (e) {}
require('../src/core/change-board.js');
var cb = global.window.MA.changeBoard;

function kinds(rows) { return rows.map(function(r) { return r.kind; }).join(''); }

describe('changeBoard.diffRows', () => {
  test('同じなら全部 same で増減 0', () => {
    var d = cb.diffRows('a\nb\nc', 'a\nb\nc');
    expect(kinds(d.rows)).toBe('samesamesame');
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
  });

  test('置き換えた行は del と add で並ぶ', () => {
    var d = cb.diffRows('a\nCanDrv\nc', 'a\nXxx_Driver\nc');
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    var del = d.rows.filter(function(r) { return r.kind === 'del'; })[0];
    var add = d.rows.filter(function(r) { return r.kind === 'add'; })[0];
    expect(del.before).toBe('CanDrv');
    expect(add.after).toBe('Xxx_Driver');
  });

  test('行番号は変更前後それぞれの元の位置を指す', () => {
    var d = cb.diffRows('a\nb', 'a\nx\nb');
    var add = d.rows.filter(function(r) { return r.kind === 'add'; })[0];
    expect(add.afterNo).toBe(2);
    expect(add.beforeNo).toBe(0);
    var last = d.rows[d.rows.length - 1];
    expect(last.beforeNo).toBe(2);
    expect(last.afterNo).toBe(3);
  });

  test('基準が空 (新規の図) なら全行が add', () => {
    var d = cb.diffRows('', '@startuml\n@enduml');
    expect(d.removed).toBe(0);
    expect(d.added).toBe(2);
  });

  test('改行コードの違いは差分にしない', () => {
    var d = cb.diffRows('a\r\nb', 'a\nb');
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
  });
});

describe('changeBoard.collapse', () => {
  test('変更から遠い同じ行は gap 1 行にまとまる', () => {
    var before = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].join('\n');
    var after = ['1', '2', '3', '4', 'X', '6', '7', '8', '9'].join('\n');
    var rows = cb.collapse(cb.diffRows(before, after).rows, 1);
    var gaps = rows.filter(function(r) { return r.kind === 'gap'; });
    expect(gaps.length).toBe(2);
    expect(gaps[0].count).toBe(3);
    expect(rows.filter(function(r) { return r.kind === 'del'; }).length).toBe(1);
  });

  test('前後の文脈は残る', () => {
    var rows = cb.collapse(cb.diffRows('1\n2\n3\n4\n5', '1\n2\nX\n4\n5').rows, 1);
    var sames = rows.filter(function(r) { return r.kind === 'same'; });
    expect(sames.map(function(r) { return r.before; })).toEqual(['2', '4']);
  });
});

describe('changeBoard.build', () => {
  var BASE = {
    can_init_sequence: { dsl: '@startuml\nCanDrv -> A : init\n@enduml', at: '2026-09-07T08:00:00Z' },
    driver_common_class: { dsl: '@startuml\nclass GpioDrv\n@enduml', at: '2026-09-07T08:00:00Z' },
    gpio_init_sequence: { dsl: '@startuml\nGpioDrv -> A : init\n@enduml', at: '2026-09-07T08:10:00Z' },
    untouched: { dsl: '@startuml\nclass Keep\n@enduml', at: '2026-09-07T08:00:00Z' },
  };
  function baselineOf(name) { return BASE[name] || null; }
  var DOCS = [
    { id: 'd1', name: 'can_init_sequence', dsl: '@startuml\nXxx_Driver -> A : init\n@enduml' },
    { id: 'd2', name: 'driver_common_class', dsl: '@startuml\nclass Xxx_Driver\n@enduml' },
    { id: 'd3', name: 'gpio_init_sequence', dsl: '@startuml\nXxx_Driver -> A : init\n@enduml' },
    { id: 'd4', name: 'timer_state', dsl: '@startuml\n[*] --> Idle\n@enduml' },
    { id: 'd5', name: 'untouched', dsl: '@startuml\nclass Keep\n@enduml' },
  ];

  test('変わった図だけがタブの順で全件並ぶ', () => {
    var b = cb.build(DOCS, baselineOf);
    expect(b.entries.map(function(e) { return e.name; }))
      .toEqual(['can_init_sequence', 'driver_common_class', 'gpio_init_sequence', 'timer_state']);
    expect(b.changedCount).toBe(4);
    expect(b.total).toBe(5);
    expect(b.hasChange).toBe(true);
  });

  test('基準の無い図は新規として並ぶ', () => {
    var b = cb.build(DOCS, baselineOf);
    var e = b.entries.filter(function(x) { return x.name === 'timer_state'; })[0];
    expect(e.status).toBe('new');
    expect(e.before).toBe('');
    expect(e.removed).toBe(0);
  });

  test('各図が変更前 DSL と変更後 DSL の両方を持つ', () => {
    var e = cb.build(DOCS, baselineOf).entries[0];
    expect(e.before).toBe(BASE.can_init_sequence.dsl);
    expect(e.after).toBe(DOCS[0].dsl);
    expect(e.added).toBe(1);
    expect(e.removed).toBe(1);
  });

  test('includeSame で変わっていない図も並ぶ', () => {
    var b = cb.build(DOCS, baselineOf, { includeSame: true });
    expect(b.entries.length).toBe(5);
    expect(b.changedCount).toBe(4);
    var same = b.entries.filter(function(e) { return e.status === 'same'; })[0];
    expect(same.name).toBe('untouched');
  });

  test('collapse:false なら全行が残る', () => {
    var b = cb.build(DOCS, baselineOf, { collapse: false });
    expect(b.entries[0].rows.length).toBe(b.entries[0].allRows.length);
    expect(b.entries[0].rows.some(function(r) { return r.kind === 'gap'; })).toBe(false);
  });

  test('基準がひとつも無ければ全部が新規で、基準時刻は空', () => {
    var b = cb.build(DOCS, function() { return null; });
    expect(b.entries.length).toBe(5);
    expect(b.markedAt).toBe('');
    expect(b.entries.every(function(e) { return e.status === 'new'; })).toBe(true);
  });

  test('基準時刻はいちばん新しいものを出す', () => {
    expect(cb.build(DOCS, baselineOf).markedAt).toBe('2026-09-07T08:10:00Z');
  });

  test('docs が空でも落ちない', () => {
    var b = cb.build(null, baselineOf);
    expect(b.entries).toEqual([]);
    expect(b.hasChange).toBe(false);
  });
});

describe('changeBoard の見出し', () => {
  test('summaryText は枚数と行の増減を出す', () => {
    var b = { hasChange: true, changedCount: 4, total: 5, added: 7, removed: 3 };
    expect(cb.summaryText(b)).toBe('変わった図 4/5 枚 ・ +7 −3 行');
  });

  test('変更が無ければその旨を出す', () => {
    expect(cb.summaryText({ hasChange: false })).toBe('変わった図はありません');
    expect(cb.summaryText(null)).toBe('変わった図はありません');
  });

  test('entryLabel は新規と変更で書き分ける', () => {
    expect(cb.entryLabel({ name: 'a', status: 'new', added: 3, removed: 0 })).toBe('a (新規 +3)');
    expect(cb.entryLabel({ name: 'b', status: 'changed', added: 2, removed: 1 })).toBe('b (+2 −1)');
  });
});

// BLK-primary-20260908-1103-wish: 引き継ぎでは「要修正」の行だけを渡したい。
// 304 行のボードから印の付いた行だけを抜き出す絞り込み。
describe('changeBoard.filterVerdict — 印の付いた行だけに絞る', () => {
  function boardOf() {
    return {
      total: 3, changedCount: 2, hasChange: true, added: 3, removed: 1, markedAt: '2026-09-08T10:00',
      entries: [
        { name: 'a', status: 'changed', added: 2, removed: 1, rows: [
          { kind: 'del', before: 'x', beforeNo: 1 },
          { kind: 'add', after: 'y', afterNo: 1 },
          { kind: 'gap', count: 4 },
          { kind: 'add', after: 'z', afterNo: 5 },
        ] },
        { name: 'b', status: 'changed', added: 1, removed: 0, rows: [
          { kind: 'add', after: 'q', afterNo: 2 },
          { kind: 'same', before: 's', after: 's' },
        ] },
      ],
    };
  }
  var marks = { 'a': { 'add|y': '要修正', 'del|x': '済' }, 'b': { 'add|q': '済' } };
  var opts = {
    verdict: '要修正',
    rowKeyOf: function(r) {
      if (r.kind === 'add') return 'add|' + String(r.after).trim();
      if (r.kind === 'del') return 'del|' + String(r.before).trim();
      return '';
    },
    verdictOf: function(name, key) { return (marks[name] || {})[key] || ''; },
  };

  test('印の付いた行だけを残し、印の無い図はボードから消える', () => {
    var f = cb.filterVerdict(boardOf(), opts);
    expect(f.entries.length).toBe(1);
    expect(f.entries[0].name).toBe('a');
    expect(f.entries[0].rows.length).toBe(1);
    expect(f.entries[0].rows[0].after).toBe('y');
    expect(f.matched).toBe(1);
  });

  test('省略行 (gap) と同じ行は絞り込みでは出さない', () => {
    var f = cb.filterVerdict(boardOf(), opts);
    var kindsOut = [];
    f.entries.forEach(function(e) { e.rows.forEach(function(r) { kindsOut.push(r.kind); }); });
    expect(kindsOut).not.toContain('gap');
    expect(kindsOut).not.toContain('same');
  });

  test('図ごとの件数を entry.matched に持つ', () => {
    var f = cb.filterVerdict(boardOf(), opts);
    expect(f.entries[0].matched).toBe(1);
  });

  test('「済」でも同じ形で絞れる', () => {
    var f = cb.filterVerdict(boardOf(), { verdict: '済', rowKeyOf: opts.rowKeyOf, verdictOf: opts.verdictOf });
    expect(f.matched).toBe(2);
    expect(f.entries.map(function(e) { return e.name; })).toEqual(['a', 'b']);
  });

  test('印が 1 つも無ければ空のボードになる (元のボードは壊さない)', () => {
    var src = boardOf();
    var f = cb.filterVerdict(src, { verdict: '要修正', rowKeyOf: opts.rowKeyOf, verdictOf: function() { return ''; } });
    expect(f.entries.length).toBe(0);
    expect(f.matched).toBe(0);
    expect(f.hasChange).toBe(false);
    expect(src.entries.length).toBe(2);
    expect(src.entries[0].rows.length).toBe(4);
  });

  test('board や opts が足りなくても例外を投げない', () => {
    expect(cb.filterVerdict(null, opts).entries).toEqual([]);
    expect(cb.filterVerdict(boardOf(), null).entries).toEqual([]);
    expect(cb.filterVerdict(boardOf(), { verdict: '要修正' }).entries).toEqual([]);
  });

  test('filterText: 絞り込み中の見出しは残った行数と枚数を出す', () => {
    var f = cb.filterVerdict(boardOf(), opts);
    expect(cb.filterText(f)).toBe('要修正のみ 1 行 / 1 枚');
    var none = cb.filterVerdict(boardOf(), { verdict: '要修正', rowKeyOf: opts.rowKeyOf, verdictOf: function() { return ''; } });
    expect(cb.filterText(none)).toBe('要修正の印が付いた行はありません');
  });
});
