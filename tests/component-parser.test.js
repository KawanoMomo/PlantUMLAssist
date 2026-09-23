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

// BLK-migrator-20260923-1409: 波括弧を伴わない要素宣言 (agent / node / cloud / ...)。
// aws-icons-for-plantuml の `examples__Basic Usage.puml` がこの形で、読めないと
// 部品が要素の一覧から落ち、ホバーの選択枠が 1 つも出なかった。
describe('parseComponent 波括弧の無い要素宣言', function() {
  test('agent "ラベル" as 別名 を部品として読む', function() {
    var r = co.parse('@startuml\nagent "Published Event" as event\n@enduml');
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].kind).toBe('component');
    expect(r.elements[0].id).toBe('event');
    expect(r.elements[0].label).toBe('Published Event');
  });
  test('別名の無い node / cloud / artifact も読む', function() {
    ['node', 'cloud', 'artifact', 'storage', 'card', 'person'].forEach(function(kw) {
      var r = co.parse('@startuml\n' + kw + ' Server\n@enduml');
      expect(r.elements.length).toBe(1);
      expect(r.elements[0].kind).toBe('component');
      expect(r.elements[0].id).toBe('Server');
      expect(r.elements[0].label).toBe('Server');
    });
  });
  test('ステレオタイプ付きも読む', function() {
    var r = co.parse('@startuml\nnode Server <<physical>>\n@enduml');
    expect(r.elements[0].id).toBe('Server');
    expect(r.elements[0].stereotype).toBe('physical');
  });
  test('波括弧つきの同じ語は今までどおり境界のまま', function() {
    var r = co.parse('@startuml\nnode Server {\ncomponent App\n}\n@enduml');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('package');
    expect(r.groups[0].label).toBe('Server');
    // 中身の component は今までどおり部品として出る (境界を部品に格下げしない)。
    expect(r.elements.map(function(e) { return e.id; })).toEqual(['App']);
  });
});
