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
