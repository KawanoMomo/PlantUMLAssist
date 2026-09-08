'use strict';
// BLK-junior-20260908-2303-wish: 「資料化」— 部品名と図種を選ぶだけで、図種に
// 決まっている書き出し形式・題名の (資料用)・保存・庫への控えまでが 1 回で済む。
// 形式の決まりを利用者が覚えなくてよいこと (PNG/SVG の取り違えが起きないこと) を固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var ME = global.window.MA.materialExport;

var FILES = [
  'GPIOドライバ状態遷移.puml',
  'GPIOドライバ初期化シーケンス.puml',
  'GPIOドライバクラス.puml',
  'GPIOドライバ状態遷移(資料用).puml',
  'UARTドライバ状態遷移.puml',
];

describe('資料化 — 形式は図種で決まる', function() {
  test('状態遷移図は SVG、他の図種は PNG（透過背景）', function() {
    expect(ME.formatFor('状態遷移図')).toBe('svg');
    expect(ME.formatFor('シーケンス図')).toBe('png-transparent');
    expect(ME.formatFor('クラス図')).toBe('png-transparent');
    expect(ME.formatLabel(ME.formatFor('状態遷移図'))).toBe('SVG');
    expect(ME.formatLabel(ME.formatFor('クラス図'))).toBe('PNG（透過背景）');
  });

  test('図種が分からないときは PNG（透過背景）に倒す（SVG は貼り先を選ぶ）', function() {
    expect(ME.formatFor('')).toBe('png-transparent');
    expect(ME.formatFor(null)).toBe('png-transparent');
  });

  test('なぜその形式かを押す前に読める', function() {
    expect(ME.formatReason('状態遷移図')).toContain('SVG');
    expect(ME.formatReason('シーケンス図')).toContain('PNG');
  });

  test('拡張子は形式に従う', function() {
    expect(ME.formatExt('svg')).toBe('.svg');
    expect(ME.formatExt('png-transparent')).toBe('.png');
  });
});

describe('資料化 — 題名の (資料用)', function() {
  test('末尾に付き、拡張子は落ちる', function() {
    expect(ME.materialTitle('GPIOドライバ状態遷移.puml')).toBe('GPIOドライバ状態遷移(資料用)');
  });

  test('すでに付いていれば伸ばさない', function() {
    expect(ME.materialTitle('GPIOドライバ状態遷移(資料用)')).toBe('GPIOドライバ状態遷移(資料用)');
    expect(ME.materialTitle('GPIOドライバ状態遷移（資料用）')).toBe('GPIOドライバ状態遷移（資料用）');
  });

  test('空の名前でも壊れない', function() {
    expect(ME.materialTitle('')).toBe('(資料用)');
  });

  test('applyTitle は title 行を差し替える', function() {
    var dsl = ['@startuml', 'title GPIOドライバ状態遷移', '[*] --> Uninit', '@enduml'].join('\n');
    var out = ME.applyTitle(dsl, 'GPIOドライバ状態遷移(資料用)');
    expect(out).toContain('title GPIOドライバ状態遷移(資料用)');
    expect(out.split('\n').filter(function(l) { return /^title /.test(l); }).length).toBe(1);
    expect(out).toContain('[*] --> Uninit');
  });

  test('title 行が無ければ @startuml の直後に足す', function() {
    var dsl = ['@startuml', '[*] --> Uninit', '@enduml'].join('\n');
    var out = ME.applyTitle(dsl, 'GPIO(資料用)').split('\n');
    expect(out[0]).toBe('@startuml');
    expect(out[1]).toBe('title GPIO(資料用)');
  });
});

describe('資料化 — 部品と図種の選択肢', function() {
  test('保存フォルダのファイルから部品が並ぶ', function() {
    var names = ME.components(FILES).map(function(c) { return c.component; });
    expect(names).toContain('GPIOドライバ');
    expect(names).toContain('UARTドライバ');
  });

  test('図種には形式が添う（利用者が覚えなくてよい）', function() {
    var kinds = ME.kindsFor(FILES, 'GPIOドライバ');
    var byKind = {};
    kinds.forEach(function(k) { byKind[k.kind] = k; });
    expect(Object.keys(byKind).sort()).toEqual(['クラス図', 'シーケンス図', '状態遷移図']);
    expect(byKind['状態遷移図'].formatLabel).toBe('SVG');
    expect(byKind['シーケンス図'].formatLabel).toBe('PNG（透過背景）');
  });

  test('資料の元には (資料用) ではなく元の版を選ぶ', function() {
    expect(ME.pickSource(['GPIOドライバ状態遷移(資料用).puml', 'GPIOドライバ状態遷移.puml'], '状態遷移図'))
      .toBe('GPIOドライバ状態遷移.puml');
  });

  test('図が 1 枚も無ければその旨を言う', function() {
    expect(ME.emptyText([])).toContain('図がありません');
    expect(ME.emptyText(FILES)).toBe('');
  });
});

describe('資料化 — 実行前に全部が決まる', function() {
  test('状態遷移図を選ぶと SVG の計画になる', function() {
    var p = ME.plan(FILES, 'GPIOドライバ', '状態遷移図');
    expect(p).not.toBeNull();
    expect(p.source).toBe('GPIOドライバ状態遷移.puml');
    expect(p.format).toBe('svg');
    expect(p.title).toBe('GPIOドライバ状態遷移(資料用)');
    expect(p.filename).toBe('GPIOドライバ状態遷移(資料用).svg');
    expect(p.docName).toBe('GPIOドライバ状態遷移(資料用)');
  });

  test('シーケンス図を選ぶと PNG の計画になる', function() {
    var p = ME.plan(FILES, 'GPIOドライバ', 'シーケンス図');
    expect(p.format).toBe('png-transparent');
    expect(p.filename).toBe('GPIOドライバ初期化シーケンス(資料用).png');
  });

  test('その部品に無い図種は計画にならない', function() {
    expect(ME.plan(FILES, 'UARTドライバ', 'クラス図')).toBeNull();
    expect(ME.plan(FILES, '無い部品', '状態遷移図')).toBeNull();
  });

  test('計画の 1 行に、形式・出力名・理由が全部出る', function() {
    var p = ME.plan(FILES, 'GPIOドライバ', '状態遷移図');
    var t = ME.planText(p);
    expect(t).toContain('GPIOドライバ状態遷移(資料用).svg');
    expect(t).toContain('SVG');
    expect(ME.planText(null)).toContain('部品と図種');
  });

  test('済んだあとに、保存フォルダと庫に入ったことを言う', function() {
    var p = ME.plan(FILES, 'GPIOドライバ', '状態遷移図');
    var m = ME.doneMessage(p);
    expect(m).toContain('GPIOドライバ状態遷移(資料用)');
    expect(m).toContain('SVG');
    expect(m).toContain('提出物庫');
    expect(ME.failMessage(p, new Error('描画に失敗'))).toContain('描画に失敗');
  });
});
