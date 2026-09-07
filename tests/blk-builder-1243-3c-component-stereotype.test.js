'use strict';
// BLK-builder-20260907-1243-3c: design 5d の「その他パレット」—
// Component 図のステレオタイプ。付いた行が要素として読め、GUI から足す・変える・外せる。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var co = W.MA.modules.plantumlComponent;

function firstElement(dsl) { return co.parse(dsl).elements[0]; }

describe('component / interface のステレオタイプを読む', function() {
  test('component キーワード形式', function() {
    var e = firstElement('@startuml\ncomponent WebApp <<service>>\n@enduml');
    expect(e.kind).toBe('component');
    expect(e.id).toBe('WebApp');
    expect(e.stereotype).toBe('service');
  });

  test('alias 付きでも読める', function() {
    var e = firstElement('@startuml\ncomponent "Web App" as WebApp <<device>>\n@enduml');
    expect(e.id).toBe('WebApp');
    expect(e.label).toBe('Web App');
    expect(e.stereotype).toBe('device');
  });

  test('[X] の短縮形', function() {
    var e = firstElement('@startuml\n[WebApp] <<service>>\n@enduml');
    expect(e.id).toBe('WebApp');
    expect(e.stereotype).toBe('service');
  });

  test('interface キーワード形式と () 短縮形', function() {
    expect(firstElement('@startuml\ninterface IAuth <<api>>\n@enduml').stereotype).toBe('api');
    expect(firstElement('@startuml\n() IAuth <<api>>\n@enduml').stereotype).toBe('api');
  });

  test('付いていなければ null のまま', function() {
    expect(firstElement('@startuml\ncomponent WebApp\n@enduml').stereotype).toBeNull();
  });

  test('ブロック形式 (末尾の {) と併用できる', function() {
    var r = co.parse('@startuml\ncomponent WebApp <<service>> {\nport p1\n}\n@enduml');
    expect(r.elements[0].id).toBe('WebApp');
    expect(r.elements[0].stereotype).toBe('service');
    expect(r.elements[1].kind).toBe('port');
  });
});

describe('ステレオタイプを書く', function() {
  test('fmtComponent / fmtInterface は空なら書かない', function() {
    expect(co.fmtComponent('WebApp', 'WebApp')).toBe('component WebApp');
    expect(co.fmtComponent('WebApp', 'WebApp', '')).toBe('component WebApp');
    expect(co.fmtComponent('WebApp', 'WebApp', 'service')).toBe('component WebApp <<service>>');
    expect(co.fmtInterface('IAuth', 'IAuth', 'api')).toBe('interface IAuth <<api>>');
  });

  test('label 付きの並びは label → alias → ステレオタイプ', function() {
    expect(co.fmtComponent('WebApp', 'Web App', 'device'))
      .toBe('component "Web App" as WebApp <<device>>');
  });

  test('addComponent / addInterface が末尾に足す', function() {
    var out = co.addComponent('@startuml\n@enduml', 'WebApp', 'WebApp', 'service');
    expect(out).toContain('component WebApp <<service>>');
    expect(firstElement(out).stereotype).toBe('service');
  });
});

describe('ステレオタイプを変える / 外す', function() {
  var DSL = '@startuml\ncomponent WebApp <<service>>\ninterface IAuth <<api>>\n@enduml';

  test('付け替えても id と label は変わらない', function() {
    var out = co.updateComponent(DSL, 2, 'stereotype', 'device');
    expect(out).toContain('component WebApp <<device>>');
    expect(firstElement(out).id).toBe('WebApp');
  });

  test('空文字を渡すと外れる', function() {
    expect(co.updateComponent(DSL, 2, 'stereotype', '')).toContain('component WebApp\n');
  });

  test('id を変えてもステレオタイプは残る (元の名前は label に降りる — 既存の挙動)', function() {
    expect(co.updateComponent(DSL, 2, 'id', 'Web2'))
      .toContain('component "WebApp" as Web2 <<service>>');
  });

  test('interface でも同じ', function() {
    expect(co.updateInterface(DSL, 3, 'stereotype', 'rest')).toContain('interface IAuth <<rest>>');
    expect(co.updateInterface(DSL, 3, 'id', 'IAuth2')).toContain('interface IAuth2 <<api>>');
  });

  test('ブロック形式の開き括弧は残る', function() {
    var block = '@startuml\ncomponent WebApp <<service>> {\nport p1\n}\n@enduml';
    expect(co.updateComponent(block, 2, 'stereotype', 'device'))
      .toContain('component WebApp <<device>> {');
  });
});
