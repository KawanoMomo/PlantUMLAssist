'use strict';
// BLK-builder-20260907-1243-1 / design 4a「その他（constructor / static / abstract /
// ジェネリクス / 内部クラス）」。constructor と内部クラスを DSL 側で担保する。

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
  '../src/core/relation-options.js',
  '../src/modules/class.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;

describe('class.classNameAt', () => {
  test('宣言行からクラス名を読む', () => {
    expect(clMod.classNameAt('@startuml\nclass Circle {\n}\n@enduml', 2)).toBe('Circle');
  });

  test('ジェネリクス付きの宣言でも型引数は落として名前だけ返す', () => {
    expect(clMod.classNameAt('@startuml\nclass Box<T> {\n}\n@enduml', 2)).toBe('Box');
  });

  test('クラス宣言でない行は null', () => {
    expect(clMod.classNameAt('@startuml\nA <|-- B\n@enduml', 2)).toBe(null);
    expect(clMod.classNameAt('@startuml\nclass Foo\n@enduml', 99)).toBe(null);
  });
});

describe('class.addConstructor', () => {
  test('クラス名と同じ名前・戻り型なしのメソッドを足す', () => {
    const out = clMod.addConstructor('@startuml\nclass Circle {\n}\n@enduml', 2, '+', 'radius : double');
    expect(out).toBe('@startuml\nclass Circle {\n  + Circle(radius : double)\n}\n@enduml');
  });

  test('引数なしでも括弧だけを出す', () => {
    const out = clMod.addConstructor('@startuml\nclass Circle {\n}\n@enduml', 2, '-', '');
    expect(out).toBe('@startuml\nclass Circle {\n  - Circle()\n}\n@enduml');
  });

  test('本体の無いクラスにも足せる (ensureBlock 経由)', () => {
    const out = clMod.addConstructor('@startuml\nclass Adc_Driver\n@enduml', 2, '+', '');
    expect(out).toBe('@startuml\nclass Adc_Driver {\n  + Adc_Driver()\n}\n@enduml');
  });

  test('足した constructor はメソッドとして読み戻せる', () => {
    const out = clMod.addConstructor('@startuml\nclass Circle {\n}\n@enduml', 2, '+', 'r : double');
    const circle = clMod.parse(out).elements.filter((e) => e.id === 'Circle')[0];
    expect(circle.members.length).toBe(1);
    expect(circle.members[0].kind).toBe('method');
    expect(circle.members[0].name).toBe('Circle');
    expect(circle.members[0].type || '').toBe('');   // 戻り型を持たない
  });

  test('クラス宣言でない行を渡されたら何も変えない', () => {
    const src = '@startuml\nA <|-- B\n@enduml';
    expect(clMod.addConstructor(src, 2, '+', '')).toBe(src);
  });
});

describe('class.addNestedClass', () => {
  test('内部クラスの宣言と +-- の関連が入る', () => {
    const out = clMod.addNestedClass('@startuml\nclass Outer {\n}\n@enduml', 'Outer', 'Builder');
    expect(out).toBe('@startuml\nclass Outer {\n}\nclass Builder {\n}\nOuter +-- Builder\n@enduml');
  });

  test('足した内部クラスと関連をパーサが読める', () => {
    const out = clMod.addNestedClass('@startuml\nclass Outer {\n}\n@enduml', 'Outer', 'Builder');
    const parsed = clMod.parse(out);
    expect(parsed.elements.map((e) => e.id).sort()).toEqual(['Builder', 'Outer']);
    expect(parsed.relations.length).toBe(1);
    expect(parsed.relations[0].kind).toBe('nested');
    expect(parsed.relations[0].from).toBe('Outer');
    expect(parsed.relations[0].to).toBe('Builder');
  });

  test('入れ子の関連は fmtRelation / updateRelation でも +-- を保つ', () => {
    expect(clMod.fmtRelation('nested', 'Outer', 'Builder', null)).toBe('Outer +-- Builder');
    const src = '@startuml\nOuter *-- Builder\n@enduml';
    expect(clMod.updateRelation(src, 2, 'kind', 'nested')).toBe('@startuml\nOuter +-- Builder\n@enduml');
  });

  test('名前が空なら何も変えない', () => {
    const src = '@startuml\nclass Outer {\n}\n@enduml';
    expect(clMod.addNestedClass(src, 'Outer', '')).toBe(src);
    expect(clMod.addNestedClass(src, '', 'Builder')).toBe(src);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
