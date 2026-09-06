'use strict';
// BLK-primary-20260907-0803 / design 4a「Class — メンバー編集」
// 種別 (class / abstract class / interface / enum) の切り替えと、
// 本体 { } を持たないクラスへのメンバー追加を DSL 側で担保する。

var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/class.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;

describe('class.ensureBlock', () => {
  test('本体を持たない class に { } を開く', () => {
    const out = clMod.ensureBlock('@startuml\nclass Foo\n@enduml', 2);
    expect(out).toBe('@startuml\nclass Foo {\n}\n@enduml');
  });

  test('既に本体があるなら何も変えない', () => {
    const src = '@startuml\nclass Foo {\n  - a : int\n}\n@enduml';
    expect(clMod.ensureBlock(src, 2)).toBe(src);
  });

  test('字下げされた宣言では } も同じ字下げで閉じる', () => {
    const out = clMod.ensureBlock('@startuml\npackage P {\n  class Foo\n}\n@enduml', 3);
    expect(out).toBe('@startuml\npackage P {\n  class Foo {\n  }\n}\n@enduml');
  });

  test('クラス宣言でない行は変えない', () => {
    const src = '@startuml\nA <|-- B\n@enduml';
    expect(clMod.ensureBlock(src, 2)).toBe(src);
    expect(clMod.ensureBlock(src, 99)).toBe(src);
  });

  test('interface / abstract / enum でも開く', () => {
    expect(clMod.ensureBlock('@startuml\ninterface ICan\n@enduml', 2))
      .toBe('@startuml\ninterface ICan {\n}\n@enduml');
    expect(clMod.ensureBlock('@startuml\nabstract class Base\n@enduml', 2))
      .toBe('@startuml\nabstract class Base {\n}\n@enduml');
    expect(clMod.ensureBlock('@startuml\nenum Mode\n@enduml', 2))
      .toBe('@startuml\nenum Mode {\n}\n@enduml');
  });
});

describe('class.addAttribute / addMethod on a bodyless class', () => {
  test('本体の無いクラスにも属性を足せる (従来は無反応だった)', () => {
    const out = clMod.addAttribute('@startuml\nclass Adc_Driver\n@enduml', 2, '-', 'channel', 'uint8', false);
    expect(out).toBe('@startuml\nclass Adc_Driver {\n  - channel : uint8\n}\n@enduml');
  });

  test('本体の無いクラスにもメソッドを足せる', () => {
    const out = clMod.addMethod('@startuml\nclass Uart_Driver\n@enduml', 2, '+', 'init', 'cfg : Cfg', 'void', false, false);
    expect(out).toBe('@startuml\nclass Uart_Driver {\n  + init(cfg : Cfg) : void\n}\n@enduml');
  });

  test('本体の無い enum にも値を足せる', () => {
    const out = clMod.addEnumValue('@startuml\nenum Mode\n@enduml', 2, 'IDLE');
    expect(out).toBe('@startuml\nenum Mode {\n  IDLE\n}\n@enduml');
  });

  test('続けて足すと宣言順に並ぶ', () => {
    let t = '@startuml\nclass Timer_Driver\n@enduml';
    t = clMod.addAttribute(t, 2, '-', 'period', 'uint32', false);
    t = clMod.addMethod(t, 2, '+', 'start', '', 'void', false, false);
    expect(t.split('\n')).toEqual([
      '@startuml', 'class Timer_Driver {', '  - period : uint32', '  + start() : void', '}', '@enduml',
    ]);
  });

  test('本体があるクラスの従来の挙動は変わらない', () => {
    const out = clMod.addAttribute('@startuml\nclass Foo {\n  - a : int\n}\n@enduml', 2, '+', 'b', 'str', false);
    expect(out).toBe('@startuml\nclass Foo {\n  - a : int\n  + b : str\n}\n@enduml');
  });
});

describe('class.changeKind', () => {
  test('class を interface に変えても本体は残る', () => {
    const out = clMod.changeKind('@startuml\nclass Foo {\n  + run() : void\n}\n@enduml', 2, 'interface');
    expect(out).toBe('@startuml\ninterface Foo {\n  + run() : void\n}\n@enduml');
  });

  test('class を abstract class に変えられる', () => {
    expect(clMod.changeKind('@startuml\nclass Shape\n@enduml', 2, 'abstract'))
      .toBe('@startuml\nabstract class Shape\n@enduml');
  });

  test('interface から class に戻せる', () => {
    expect(clMod.changeKind('@startuml\ninterface ICan\n@enduml', 2, 'class'))
      .toBe('@startuml\nclass ICan\n@enduml');
  });

  test('表示名 as Alias とステレオタイプを保つ', () => {
    const out = clMod.changeKind('@startuml\nclass "CAN ドライバ" as CanDrv <<driver>>\n@enduml', 2, 'interface');
    expect(out).toContain('interface');
    expect(out).toContain('CanDrv');
    expect(out).toContain('CAN ドライバ');
    expect(out).toContain('<<driver>>');
  });

  test('ジェネリクスを保つ', () => {
    const out = clMod.changeKind('@startuml\nclass Box<T> {\n}\n@enduml', 2, 'abstract');
    expect(out).toContain('abstract class Box<T>');
    expect(out).toContain('{');
  });

  test('enum にするときはジェネリクスを落とす (PlantUML が解釈しないため)', () => {
    const out = clMod.changeKind('@startuml\nclass Box<T>\n@enduml', 2, 'enum');
    expect(out).toBe('@startuml\nenum Box\n@enduml');
  });

  test('同じ種別・未知の種別・クラス以外の行は変えない', () => {
    const src = '@startuml\nclass Foo\n@enduml';
    expect(clMod.changeKind(src, 2, 'class')).toBe(src);
    expect(clMod.changeKind(src, 2, 'struct')).toBe(src);
    expect(clMod.changeKind('@startuml\nA <|-- B\n@enduml', 2, 'interface'))
      .toBe('@startuml\nA <|-- B\n@enduml');
    expect(clMod.changeKind(src, 99, 'interface')).toBe(src);
  });

  test('切り替えた結果を parse し直すと種別が変わっている', () => {
    const out = clMod.changeKind('@startuml\nclass Foo {\n  + run() : void\n}\n@enduml', 2, 'interface');
    const parsed = clMod.parse(out);
    const foo = parsed.elements.filter((e) => e.id === 'Foo')[0];
    expect(foo.kind).toBe('interface');
    expect(foo.members.length).toBe(1);
    expect(foo.members[0].name).toBe('run');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
