'use strict';
var co = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlComponent);

describe('component formatters', function() {
  test('fmtComponent label==id', function() {
    expect(co.fmtComponent('WebApp', 'WebApp')).toBe('component WebApp');
  });
  test('fmtComponent label!=id', function() {
    expect(co.fmtComponent('WA', 'Web App')).toBe('component "Web App" as WA');
  });
  test('fmtInterface label==id', function() {
    expect(co.fmtInterface('IAuth', 'IAuth')).toBe('interface IAuth');
  });
  test('fmtInterface label!=id', function() {
    expect(co.fmtInterface('I1', 'Authentication')).toBe('interface "Authentication" as I1');
  });
  test('fmtPort', function() {
    expect(co.fmtPort('p1', 'p1')).toBe('port p1');
    expect(co.fmtPort('p1', 'Port One')).toBe('port "Port One" as p1');
  });
  test('fmtPackage always quotes', function() {
    expect(co.fmtPackage('Backend')).toBe('package "Backend" {');
  });
  test('fmtRelation association', function() {
    expect(co.fmtRelation('association', 'A', 'B')).toBe('A -- B');
    expect(co.fmtRelation('association', 'A', 'B', 'data')).toBe('A -- B : data');
  });
  test('fmtRelation dependency', function() {
    expect(co.fmtRelation('dependency', 'A', 'B')).toBe('A ..> B');
  });
  test('fmtRelation provides (lollipop)', function() {
    expect(co.fmtRelation('provides', 'WebApp', 'IAuth')).toBe('WebApp -() IAuth');
  });
  test('fmtRelation requires (lollipop)', function() {
    expect(co.fmtRelation('requires', 'IAuth', 'WebApp')).toBe('IAuth )- WebApp');
  });
});

describe('component add operations', function() {
  var TEMPLATE = '@startuml\ntitle T\ncomponent W\n@enduml';

  test('addComponent appends', function() {
    var out = co.addComponent(TEMPLATE, 'DB', 'DB');
    expect(out).toContain('component DB');
  });
  test('addInterface appends', function() {
    var out = co.addInterface(TEMPLATE, 'IAuth', 'Authentication');
    expect(out).toContain('interface "Authentication" as IAuth');
  });
  test('addPort appends', function() {
    var out = co.addPort(TEMPLATE, 'p1', 'p1');
    expect(out).toContain('port p1');
  });
  test('addPackage appends open + close', function() {
    var out = co.addPackage(TEMPLATE, 'Backend');
    expect(out).toContain('package "Backend" {');
    expect(out).toContain('}');
  });
  test('addRelation provides', function() {
    var out = co.addRelation(TEMPLATE, 'provides', 'W', 'IAuth');
    expect(out).toContain('W -() IAuth');
  });
});

describe('component update operations', function() {
  test('updateComponent changes label', function() {
    var t = '@startuml\ncomponent W\n@enduml';
    var out = co.updateComponent(t, 2, 'label', 'Web App');
    expect(out).toContain('component "Web App" as W');
  });
  test('updateInterface changes id', function() {
    var t = '@startuml\ninterface IAuth\n@enduml';
    var out = co.updateInterface(t, 2, 'id', 'IA');
    expect(out).toContain('interface IA');
  });
  test('updateRelation changes kind from association to dependency', function() {
    var t = '@startuml\nA -- B\n@enduml';
    var out = co.updateRelation(t, 2, 'kind', 'dependency');
    expect(out).toContain('A ..> B');
  });
  test('updateRelation changes association to provides (lollipop)', function() {
    var t = '@startuml\nA -- B\n@enduml';
    var out = co.updateRelation(t, 2, 'kind', 'provides');
    expect(out).toContain('A -() B');
  });
});

describe('component line operations', function() {
  test('deleteLine works', function() {
    var t = '@startuml\nA\nB\n@enduml';
    var out = co.deleteLine(t, 3);
    expect(out).not.toContain('B');
  });
  test('moveLineUp delegates to core', function() {
    var t = '@startuml\nA\nB\n@enduml';
    var out = co.moveLineUp(t, 3);
    expect(out.split('\n')[1]).toBe('B');
  });
  test('setTitle works', function() {
    var t = '@startuml\ncomponent A\n@enduml';
    var out = co.setTitle(t, 'My Component');
    expect(out).toContain('title My Component');
  });
});

describe('component renameWithRefs', function() {
  test('renames component and updates relation', function() {
    var t = '@startuml\ncomponent W\ninterface I\nW -() I\n@enduml';
    var out = co.renameWithRefs(t, 'W', 'WebApp');
    expect(out).toContain('component WebApp');
    expect(out).toContain('WebApp -() I');
  });
});
