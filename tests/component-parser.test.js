'use strict';
// Read plantumlComponent from whatever global.window is current. run-tests.js
// loads src/modules/component.js into sandbox.window via new Function(), so the
// IIFE registers window.MA.modules.plantumlComponent there. We avoid require()
// here because component-parser.test.js runs alphabetically before
// sequence-overlay.test.js, and require()-caching the core deps from this file
// would prevent sequence-overlay.test.js's required IIFEs from re-executing
// against its fresh jsdom window.
var co = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlComponent);

describe('parseComponent component element', function() {
  test('parses bare component', function() {
    var r = co.parse('@startuml\ncomponent WebApp\n@enduml');
    expect(r.elements[0].kind).toBe('component');
    expect(r.elements[0].id).toBe('WebApp');
  });
  test('parses component with quoted label and as alias', function() {
    var r = co.parse('@startuml\ncomponent "Web App" as WebApp\n@enduml');
    expect(r.elements[0].id).toBe('WebApp');
    expect(r.elements[0].label).toBe('Web App');
  });
  test('parses [X] short form', function() {
    var r = co.parse('@startuml\n[WebApp]\n@enduml');
    expect(r.elements[0].kind).toBe('component');
    expect(r.elements[0].id).toBe('WebApp');
  });
  test('parses [Label] as Alias', function() {
    var r = co.parse('@startuml\n[Web App] as WebApp\n@enduml');
    expect(r.elements[0].id).toBe('WebApp');
    expect(r.elements[0].label).toBe('Web App');
  });
});

describe('parseComponent interface element', function() {
  test('parses bare interface', function() {
    var r = co.parse('@startuml\ninterface IAuth\n@enduml');
    expect(r.elements[0].kind).toBe('interface');
    expect(r.elements[0].id).toBe('IAuth');
  });
  test('parses interface with quoted label as alias', function() {
    var r = co.parse('@startuml\ninterface "Authentication" as IAuth\n@enduml');
    expect(r.elements[0].id).toBe('IAuth');
    expect(r.elements[0].label).toBe('Authentication');
  });
  test('parses () X short form', function() {
    var r = co.parse('@startuml\n() IAuth\n@enduml');
    expect(r.elements[0].kind).toBe('interface');
    expect(r.elements[0].id).toBe('IAuth');
  });
});

describe('parseComponent relations', function() {
  test('parses association --', function() {
    var r = co.parse('@startuml\nA -- B\n@enduml');
    expect(r.relations[0].kind).toBe('association');
    expect(r.relations[0].arrow).toBe('--');
  });
  test('parses dependency ..>', function() {
    var r = co.parse('@startuml\nA ..> B\n@enduml');
    expect(r.relations[0].kind).toBe('dependency');
    expect(r.relations[0].arrow).toBe('..>');
  });
  test('parses lollipop provides component -() interface', function() {
    var r = co.parse('@startuml\nWebApp -() IAuth\n@enduml');
    expect(r.relations[0].kind).toBe('provides');
    expect(r.relations[0].from).toBe('WebApp');
    expect(r.relations[0].to).toBe('IAuth');
  });
  test('parses lollipop provides reverse interface ()- component', function() {
    var r = co.parse('@startuml\nIAuth ()- WebApp\n@enduml');
    expect(r.relations[0].kind).toBe('provides');
    expect(r.relations[0].from).toBe('WebApp');
    expect(r.relations[0].to).toBe('IAuth');
  });
  test('parses lollipop requires interface )- component', function() {
    var r = co.parse('@startuml\nIAuth )- WebApp\n@enduml');
    expect(r.relations[0].kind).toBe('requires');
    expect(r.relations[0].from).toBe('IAuth');
    expect(r.relations[0].to).toBe('WebApp');
  });
});

describe('parseComponent port', function() {
  test('parses port directly after component', function() {
    var r = co.parse('@startuml\ncomponent WebApp\nport p1\n@enduml');
    var port = r.elements.find(function(e) { return e.kind === 'port'; });
    expect(port).toBeDefined();
    expect(port.id).toBe('p1');
    expect(port.parentComponentId).toBe('WebApp');
  });
  test('parses port with quoted label as alias', function() {
    var r = co.parse('@startuml\ncomponent WebApp\nport "Port One" as p1\n@enduml');
    var port = r.elements.find(function(e) { return e.kind === 'port'; });
    expect(port.label).toBe('Port One');
    expect(port.id).toBe('p1');
  });
  test('port not preceded by component has parentComponentId null', function() {
    var r = co.parse('@startuml\nport orphan\n@enduml');
    var port = r.elements[0];
    expect(port.kind).toBe('port');
    expect(port.parentComponentId).toBe(null);
  });
});

describe('parseComponent package', function() {
  test('parses single package with quoted label', function() {
    var r = co.parse('@startuml\npackage "Backend" {\ncomponent WebApp\n}\n@enduml');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('package');
    expect(r.groups[0].label).toBe('Backend');
    expect(r.groups[0].startLine).toBe(2);
    expect(r.groups[0].endLine).toBe(4);
  });
  test('assigns parentPackageId to elements inside package', function() {
    var r = co.parse('@startuml\npackage "Backend" {\ncomponent WebApp\n}\n@enduml');
    var c = r.elements.find(function(e) { return e.kind === 'component'; });
    expect(c.parentPackageId).toBe(r.groups[0].id);
  });
  test('folder/frame/node/rectangle all normalize to package kind', function() {
    var r1 = co.parse('@startuml\nfolder "F" {\ncomponent A\n}\n@enduml');
    var r2 = co.parse('@startuml\nframe "Fr" {\ncomponent B\n}\n@enduml');
    var r3 = co.parse('@startuml\nnode "N" {\ncomponent C\n}\n@enduml');
    var r4 = co.parse('@startuml\nrectangle "R" {\ncomponent D\n}\n@enduml');
    expect(r1.groups[0].kind).toBe('package');
    expect(r2.groups[0].kind).toBe('package');
    expect(r3.groups[0].kind).toBe('package');
    expect(r4.groups[0].kind).toBe('package');
  });
});
