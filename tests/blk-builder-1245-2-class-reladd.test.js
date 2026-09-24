'use strict';
// BLK-builder-20260924-1245-2 (design 4a「関係を追加」): 選んだクラスを一端にして関係を 1 本引く。
// 選んだクラスがどちらの端になるかは種類で既定が変わる — 継承・実現は「選んだクラスが子
// (実装側)」、それ以外は「選んだクラスが根元」。⇄ で入れ替えられる。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var cl = W.MA.modules.plantumlClass;

describe('class.relationEnds — 選んだクラスがどちらの端になるか', function() {
  test('関連・依存・合成は選んだクラスが根元 (From)', function() {
    expect(cl.relationEnds('association', 'Circle', 'Shape', false)).toEqual({ from: 'Circle', to: 'Shape' });
    expect(cl.relationEnds('dependency', 'Circle', 'Logger', false)).toEqual({ from: 'Circle', to: 'Logger' });
    expect(cl.relationEnds('composition', 'Car', 'Wheel', false)).toEqual({ from: 'Car', to: 'Wheel' });
  });

  test('継承・実現は選んだクラスが子 (To) — 「Circle は Shape を継承する」', function() {
    expect(cl.relationEnds('inheritance', 'Circle', 'Shape', false)).toEqual({ from: 'Shape', to: 'Circle' });
    expect(cl.relationEnds('implementation', 'Circle', 'Drawable', false)).toEqual({ from: 'Drawable', to: 'Circle' });
  });

  test('⇄ で入れ替えると反対の端になる', function() {
    expect(cl.relationEnds('inheritance', 'Shape', 'Circle', true)).toEqual({ from: 'Shape', to: 'Circle' });
    expect(cl.relationEnds('association', 'Circle', 'Shape', true)).toEqual({ from: 'Shape', to: 'Circle' });
  });

  test('組み立てた両端で書くと、親 <|-- 子 の行になる', function() {
    var src = '@startuml\nabstract class Shape\nclass Circle\n@enduml';
    var e = cl.relationEnds('inheritance', 'Circle', 'Shape', false);
    var out = cl.addRelation(src, 'inheritance', e.from, e.to, null);
    expect(out).toBe('@startuml\nabstract class Shape\nclass Circle\nShape <|-- Circle\n@enduml');
    var rel = cl.parse(out).relations[0];
    expect(rel.kind).toBe('inheritance');
  });
});
