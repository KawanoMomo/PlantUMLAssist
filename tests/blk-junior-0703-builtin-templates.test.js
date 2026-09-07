'use strict';
// BLK-junior-20260907-0703: コンポーネント図 (部品 4 つ・依存 6 本) を 1 枚目から作るとき、
// 写す元の図が無いため一括欄に構文込みで 184 字を打つことになっていた。
// 組み込みの雛形を持てば「雛形を選ぶ → 作る部品名を 1 語打つ」で済む。

var TN = (typeof window !== 'undefined' && window.MA && window.MA.templateNew)
  || (global.window && global.window.MA && global.window.MA.templateNew);

function countLines(dsl, re) {
  return dsl.split('\n').filter(function(l) { return re.test(l.trim()); }).length;
}

describe('組み込みの雛形', function() {
  test('図種ごとに雛形がある (component / sequence / state / class)', function() {
    var types = TN.builtins().map(function(b) { return b.type; });
    ['plantuml-component', 'plantuml-sequence', 'plantuml-state', 'plantuml-class']
      .forEach(function(t) { expect(types.indexOf(t) >= 0).toBe(true); });
  });

  test('今の図種の雛形が先頭に来る', function() {
    expect(TN.builtins('plantuml-component')[0].type).toBe('plantuml-component');
    expect(TN.builtins('plantuml-state')[0].type).toBe('plantuml-state');
  });

  test('図種を渡さなければ定義順のまま', function() {
    expect(TN.builtins()[0].id).toBe('component-driver');
  });

  test('どの雛形も部品名が置換元の 1 語で始まる', function() {
    TN.builtins().forEach(function(b) {
      expect(b.placeholder).toBe(TN.PLACEHOLDER);
      expect(b.dsl.indexOf(TN.PLACEHOLDER) >= 0).toBe(true);
    });
  });

  test('どの雛形も @startuml / @enduml で閉じている', function() {
    TN.builtins().forEach(function(b) {
      expect(b.dsl.split('\n')[0]).toBe('@startuml');
      expect(b.dsl.trim().slice(-7)).toBe('@enduml');
    });
  });

  test('builtin(id) で 1 つ引ける / 無い id は null', function() {
    expect(TN.builtin('component-driver').type).toBe('plantuml-component');
    expect(TN.builtin('nope')).toBe(null);
  });
});

describe('コンポーネント図の雛形 (BLK-junior-20260907-0703 の業務)', function() {
  var b = TN.builtin('component-driver');

  test('部品 4 つ・依存 6 本を持つ (先輩の図と同じ規模)', function() {
    expect(countLines(b.dsl, /^component\s/)).toBe(4);
    expect(countLines(b.dsl, /\.\.>/)).toBe(6);
  });

  test('作る部品名を 1 語入れるだけで、全部の名前がその系統になる', function() {
    var out = TN.instantiate(b.dsl, b.placeholder, 'Gpio');
    expect(out).toContain('component "Gpio ドライバ" as GpioDrv');
    expect(out).toContain('GpioApp ..> GpioDrv');
    expect(out).toContain('title Gpio ドライバ構成');
    // 元の系統の名前が 1 つも残らない
    expect(out.indexOf(TN.PLACEHOLDER)).toBe(-1);
    expect(TN.remainingNames(b.dsl, out).length).toBe(0);
  });

  test('作る部品名は打った 1 語ぶんだけ (キー入力 50 未満)', function() {
    // 雛形は選ぶだけ、置換元は雛形が決める。打つのは置換先の 1 語。
    expect('Gpio'.length).toBeLessThan(50);
    expect(TN.suggestName(b.name, b.placeholder, 'Gpio')).toBe('Gpio-component');
  });

  test('大小の綴りも族ごと替わる', function() {
    var out = TN.instantiate(b.dsl.replace('title Xxx', 'title XXX'), b.placeholder, 'Gpio');
    expect(out).toContain('title GPIO');
  });
});
