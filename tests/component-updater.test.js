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
