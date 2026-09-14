'use strict';
// BLK-primary-20260908-1203-wish: 提出用 zip に詰める図を、その場で
// 「変更図のみ / 要修正のみ」に絞り込んで選ぶ。判断だけを純関数として持つ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/export-select.js')]; } catch (e) {}
require('../src/core/export-select.js');
var ES = global.window.MA.exportSelect;

var DOCS = [
  { id: 'd1', name: 'Gpio', dsl: '@startuml\nA -> B: x\n@enduml', diagramType: 'plantuml-sequence' },
  { id: 'd2', name: 'Can', dsl: '@startuml\nC -> D: y\n@enduml', diagramType: 'plantuml-sequence' },
  { id: 'd3', name: 'Spi', dsl: '@startuml\nE -> F: z\n@enduml', diagramType: 'plantuml-sequence' },
  { id: 'd4', name: 'Empty', dsl: '   ', diagramType: 'plantuml-sequence' },
];

// Gpio=変更あり / Can=変更なしだが要修正 2 件 / Spi=基準なし(新規)
var DEPS = {
  statusOf: function(name) {
    if (name === 'Gpio') return 'changed';
    if (name === 'Can') return 'same';
    return 'new';
  },
  fixCountOf: function(name) { return name === 'Can' ? 2 : 0; },
};

function names(list) { return list.map(function(x) { return x.name; }); }
function selectedNames(list) {
  return list.filter(function(x) { return x.selected; }).map(function(x) { return x.name; });
}

describe('exportSelect.buildList', () => {
  test('DSL が空の図は候補から外す', () => {
    expect(names(ES.buildList(DOCS, DEPS))).toEqual(['Gpio', 'Can', 'Spi']);
  });

  test('基準との差と要修正の件数を 1 行に載せる', () => {
    var list = ES.buildList(DOCS, DEPS);
    function shape(x) { return { name: x.name, status: x.status, changed: x.changed, fix: x.fix }; }
    expect(shape(list[0])).toEqual({ name: 'Gpio', status: 'changed', changed: true, fix: 0 });
    expect(shape(list[1])).toEqual({ name: 'Can', status: 'same', changed: false, fix: 2 });
    expect(shape(list[2])).toEqual({ name: 'Spi', status: 'new', changed: true, fix: 0 });
  });

  test('既定は全部選択', () => {
    expect(selectedNames(ES.buildList(DOCS, DEPS))).toEqual(['Gpio', 'Can', 'Spi']);
  });

  test('判定の材料が無くても図は落とさない', () => {
    var list = ES.buildList(DOCS, {});
    expect(names(list)).toEqual(['Gpio', 'Can', 'Spi']);
    expect(selectedNames(list)).toEqual(['Gpio', 'Can', 'Spi']);
  });

  test('docs が配列でなければ空', () => {
    expect(ES.buildList(null, DEPS)).toEqual([]);
  });
});

describe('exportSelect.applyMode', () => {
  var list = ES.buildList(DOCS, DEPS);

  test('変更図のみ — 変更ありと新規が残る', () => {
    expect(selectedNames(ES.applyMode(list, 'changed'))).toEqual(['Gpio', 'Spi']);
  });

  test('要修正のみ — 印の付いた図だけが残る', () => {
    expect(selectedNames(ES.applyMode(list, 'fix'))).toEqual(['Can']);
  });

  test('全部に戻せる', () => {
    var narrowed = ES.applyMode(list, 'fix');
    expect(selectedNames(ES.applyMode(narrowed, 'all'))).toEqual(['Gpio', 'Can', 'Spi']);
  });

  test('知らない絞り込みは全部扱い', () => {
    expect(selectedNames(ES.applyMode(list, 'nope'))).toEqual(['Gpio', 'Can', 'Spi']);
  });

  test('元の配列は書き換えない', () => {
    ES.applyMode(list, 'fix');
    expect(selectedNames(list)).toEqual(['Gpio', 'Can', 'Spi']);
  });
});

describe('exportSelect.setSelected', () => {
  test('1 枚だけ外せる', () => {
    var list = ES.buildList(DOCS, DEPS);
    expect(selectedNames(ES.setSelected(list, 'd2', false))).toEqual(['Gpio', 'Spi']);
  });

  test('外した 1 枚を戻せる', () => {
    var list = ES.setSelected(ES.applyMode(ES.buildList(DOCS, DEPS), 'fix'), 'd1', true);
    expect(selectedNames(list)).toEqual(['Gpio', 'Can']);
  });
});

describe('exportSelect.selectedDocs', () => {
  test('選んだ図だけを bulkExport に渡す形にする', () => {
    var docs = ES.selectedDocs(ES.applyMode(ES.buildList(DOCS, DEPS), 'fix'));
    expect(docs).toEqual([{ id: 'd2', name: 'Can', dsl: DOCS[1].dsl, diagramType: 'plantuml-sequence' }]);
  });

  test('1 枚も選ばなければ空', () => {
    var list = ES.buildList(DOCS, DEPS).map(function(x) { x.selected = false; return x; });
    expect(ES.selectedDocs(list)).toEqual([]);
  });
});

describe('exportSelect.countText / rowLabel', () => {
  test('選んだ枚数と絞り込みの名前を出す', () => {
    var list = ES.buildList(DOCS, DEPS);
    expect(ES.countText(list, 'all')).toBe('全部：3 / 3 枚を zip に詰めます');
    expect(ES.countText(ES.applyMode(list, 'fix'), 'fix')).toBe('要修正のみ：1 / 3 枚を zip に詰めます');
  });

  test('該当が無いことが分かる', () => {
    var list = ES.buildList([DOCS[0]], { statusOf: function() { return 'same'; } });
    expect(ES.countText(ES.applyMode(list, 'fix'), 'fix')).toBe('要修正のみ：該当なし（0 / 1 枚）');
  });

  test('図が 1 枚も無いとき', () => {
    expect(ES.countText([], 'all')).toBe('書き出せる図がありません');
  });

  test('行の見出しに印が出る', () => {
    var list = ES.buildList(DOCS, DEPS);
    expect(ES.rowLabel(list[0])).toBe('Gpio（変更あり）');
    expect(ES.rowLabel(list[1])).toBe('Can（要修正 2）');
    expect(ES.rowLabel(list[2])).toBe('Spi（新規）');
  });

  test('印も変更も無ければ名前だけ', () => {
    var list = ES.buildList([DOCS[0]], { statusOf: function() { return 'same'; } });
    expect(ES.rowLabel(list[0])).toBe('Gpio');
  });
});

describe('exportSelect.counts', () => {
  test('全体・選択・変更・要修正の枚数', () => {
    // sinceChanged は「前回書き出しから変わったか」(BLK-primary-20260909-0003-wish)。
    // 基準を渡していないので 3 枚とも new = 前回書き出しから変わった扱いになる。
    expect(ES.counts(ES.buildList(DOCS, DEPS)))
      .toEqual({ total: 3, selected: 3, changed: 2, fix: 1, sinceChanged: 3 });
  });
});

// BLK-primary-20260909-0003-wish: 「前回書き出しから変わった図のみ」の絞り込み。
// save-diff の「前回保存から」とは基準が違う (出した後に保存し直しただけの図は残さない)。
describe('exportSelect since (前回書き出しから)', () => {
  var SINCE = {
    statusOf: function() { return 'same'; },
    sinceStatusOf: function(name) {
      if (name === 'Gpio') return 'changed';
      if (name === 'Can') return 'same';
      return 'new';
    },
  };

  test('前回書き出しから変わった図と、まだ出していない図だけが残る', () => {
    var picked = ES.pickedByMode(ES.buildList(DOCS, SINCE), 'since');
    expect(picked.map(function(p) { return p.name; })).toEqual(['Gpio', 'Spi']);
  });

  test('保存からの差 (changed) とは別の答えになる', () => {
    var list = ES.buildList(DOCS, SINCE);
    expect(ES.pickedByMode(list, 'changed').length).toBe(0);
    expect(ES.pickedByMode(list, 'since').length).toBe(2);
  });

  test('基準を渡さなければ全部 new (出していないものを黙って落とさない)', () => {
    var list = ES.buildList(DOCS, { statusOf: function() { return 'same'; } });
    expect(ES.pickedByMode(list, 'since').length).toBe(3);
  });

  test('絞り込みの名前が保存ボタンの脇に出る', () => {
    var list = ES.applyMode(ES.buildList(DOCS, SINCE), 'since');
    expect(ES.countText(list, 'since')).toContain('前回書き出しから変わった図のみ');
  });
});

// BLK-primary-20260908-1903-friction: Export メニューから 1 押しで
// 「指摘の付いた図だけ」を出せるようにする。
describe('exportSelect.menuLabel', () => {
  test('該当枚数が Export メニューの名前に出る', () => {
    var list = ES.buildList(DOCS, DEPS);
    expect(ES.menuLabel(list, 'fix')).toBe('要修正のみ 1 枚をSVGで保存（zip）');
    expect(ES.menuLabel(list, 'changed')).toBe('変更図のみ 2 枚をSVGで保存（zip）');
  });

  test('0 枚なら枚数ではなく「ありません」と出す', () => {
    var list = ES.buildList(DOCS, { statusOf: function() { return 'same'; } });
    expect(ES.menuLabel(list, 'fix')).toBe('要修正のみはありません');
  });
});

describe('exportSelect.pickedByMode', () => {
  test('絞り込みに合う図だけを bulkExport に渡せる形で返す', () => {
    var picked = ES.pickedByMode(ES.buildList(DOCS, DEPS), 'fix');
    expect(picked.map(function(p) { return p.name; })).toEqual(['Can']);
    expect(picked[0].dsl).toBe('@startuml\nC -> D: y\n@enduml');
  });

  test('該当が無ければ空 (全部詰めるほうへ落ちない)', () => {
    var list = ES.buildList(DOCS, { statusOf: function() { return 'same'; } });
    expect(ES.pickedByMode(list, 'fix').length).toBe(0);
  });

  test('絞り込み前の一覧は書き換わらない', () => {
    var list = ES.buildList(DOCS, DEPS);
    ES.pickedByMode(list, 'fix');
    expect(selectedNames(list)).toEqual(['Gpio', 'Can', 'Spi']);
  });
});
