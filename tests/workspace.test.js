'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

(function() {
  var store = {};
  var stub = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
    __reset: function() { store = {}; },
  };
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: stub });
})();

try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
require('../src/core/workspace.js');
var ws = global.window.MA.workspace;

function fresh() {
  global.window.localStorage.__reset();
  ws.reset();
  return ws.init({ diagramType: 'plantuml-sequence', dsl: '@startuml\n@enduml', name: 'SPI_seq' });
}

describe('workspace public API', function() {
  test('exports the documented API', function() {
    ['init', 'list', 'getActive', 'setActive', 'open', 'openOrActivate', 'close', 'rename',
     'updateActive', 'persist', 'sanitizeName', 'saveToFile', 'listFiles', 'loadFile', 'detectType']
      .forEach(function(k) { expect(typeof ws[k]).toBe('function'); });
  });
});

describe('workspace init', function() {
  beforeEach(function() { fresh(); });
  test('starts with exactly one active document', function() {
    expect(ws.count()).toBe(1);
    expect(ws.getActive().name).toBe('SPI_seq');
    expect(ws.getActive().dsl).toBe('@startuml\n@enduml');
  });
  test('restores docs and the active tab from localStorage', function() {
    ws.open({ name: 'CAN_state', diagramType: 'plantuml-state', dsl: 'S' });
    var activeId = ws.getActiveId();
    // simulate reload: drop in-memory state but keep localStorage
    var saved = global.window.localStorage.getItem('plantuml-workspace');
    ws.reset();
    global.window.localStorage.setItem('plantuml-workspace', saved);
    ws.init({ diagramType: 'plantuml-sequence', dsl: 'ignored' });
    expect(ws.count()).toBe(2);
    expect(ws.getActiveId()).toBe(activeId);
    expect(ws.getActive().name).toBe('CAN_state');
  });
});

describe('workspace tabs', function() {
  beforeEach(function() { fresh(); });
  test('open adds a tab and makes it active', function() {
    var d = ws.open({ name: 'CAN_seq', diagramType: 'plantuml-sequence', dsl: 'X' });
    expect(ws.count()).toBe(2);
    expect(ws.getActiveId()).toBe(d.id);
  });
  test('each tab keeps its own DSL across switches', function() {
    var first = ws.getActiveId();
    var second = ws.open({ name: 'CAN_seq', dsl: 'B' });
    ws.updateActive({ dsl: 'B-edited' });
    ws.setActive(first);
    expect(ws.getActive().dsl).toBe('@startuml\n@enduml');
    ws.setActive(second.id);
    expect(ws.getActive().dsl).toBe('B-edited');
  });
  test('each tab keeps its own diagram type', function() {
    var first = ws.getActiveId();
    var second = ws.open({ name: 'CAN_state', diagramType: 'plantuml-state', dsl: 'S' });
    expect(ws.getActive().diagramType).toBe('plantuml-state');
    ws.setActive(first);
    expect(ws.getActive().diagramType).toBe('plantuml-sequence');
    ws.setActive(second.id);
    expect(ws.getActive().diagramType).toBe('plantuml-state');
  });
  test('duplicate names are made unique', function() {
    ws.open({ name: 'SPI_seq' });
    expect(ws.getActive().name).toBe('SPI_seq-2');
  });
  test('openOrActivate reuses the tab with the same name', function() {
    var id = ws.getActiveId();
    ws.open({ name: 'CAN_seq' });
    var d = ws.openOrActivate({ name: 'SPI_seq', dsl: 'from-folder' });
    expect(d.id).toBe(id);
    expect(ws.count()).toBe(2);
    expect(ws.getActive().dsl).toBe('from-folder');
  });
  test('close removes the tab and activates a neighbour', function() {
    var a = ws.getActiveId();
    var b = ws.open({ name: 'CAN_seq' });
    ws.close(b.id);
    expect(ws.count()).toBe(1);
    expect(ws.getActiveId()).toBe(a);
  });
  test('closing the last remaining tab is refused', function() {
    expect(ws.close(ws.getActiveId())).toBeNull();
    expect(ws.count()).toBe(1);
  });
  test('setActive with an unknown id is a no-op', function() {
    var a = ws.getActiveId();
    expect(ws.setActive('nope')).toBeNull();
    expect(ws.getActiveId()).toBe(a);
  });
  test('rename sanitizes and keeps names unique', function() {
    var a = ws.getActiveId();
    ws.open({ name: 'CAN_seq' });
    expect(ws.rename(a, 'SPI シーケンス').name).toBe('SPI');
    expect(ws.rename(a, 'CAN_seq').name).toBe('CAN_seq-2');
  });
  test('findByName locates a tab', function() {
    ws.open({ name: 'CAN_seq', dsl: 'C' });
    expect(ws.findByName('CAN_seq').dsl).toBe('C');
    expect(ws.findByName('missing')).toBeNull();
  });
});

describe('workspace name sanitisation', function() {
  test('maps unsafe characters onto the server filename charset', function() {
    expect(ws.sanitizeName('SPI シーケンス')).toBe('SPI');
    expect(ws.sanitizeName('CAN/state.puml')).toBe('CAN_state');
    expect(ws.sanitizeName('   ')).toBe('diagram');
    expect(ws.sanitizeName('a b c')).toBe('a_b_c');
  });
  test('isValidName accepts only the server-safe charset', function() {
    expect(ws.isValidName('CAN_state-2')).toBe(true);
    expect(ws.isValidName('CAN state')).toBe(false);
    expect(ws.isValidName('')).toBe(false);
  });
});

describe('workspace detectType', function() {
  test('recognises state, class and sequence DSL', function() {
    expect(ws.detectType('@startuml\n[*] --> Idle\nIdle --> Busy\n@enduml')).toBe('plantuml-state');
    expect(ws.detectType('@startuml\nclass Spi {\n}\n@enduml')).toBe('plantuml-class');
    expect(ws.detectType('@startuml\nparticipant A\nA -> B: go\n@enduml')).toBe('plantuml-sequence');
  });
  test('returns null when nothing matches', function() {
    expect(ws.detectType('@startuml\n@enduml')).toBeNull();
  });
});

describe('workspace file folder bridge', function() {
  beforeEach(function() { fresh(); });
  test('listFiles asks the server for the given folder', function() {
    var seen = null;
    global.window.fetch = function(url) {
      seen = url;
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ files: [] }); } });
    };
    ws.listFiles('./diagrams');
    expect(seen).toContain('/autosave?dir=');
    expect(seen).toContain(encodeURIComponent('./diagrams'));
  });
  test('loadFile fetches one diagram by name', function() {
    var seen = null;
    global.window.fetch = function(url) {
      seen = url;
      return Promise.resolve({ ok: true, text: function() { return Promise.resolve('dsl'); } });
    };
    ws.loadFile('CAN_seq', './diagrams');
    expect(seen).toContain('type=CAN_seq');
  });
  test('saveToFile refuses a name the server would reject', function() {
    var called = false;
    global.window.fetch = function() { called = true; return Promise.resolve({ ok: true }); };
    ws.saveToFile({ name: 'bad name', dsl: 'x' }, './d');
    expect(called).toBe(false);
  });
  test('saveToFile posts the document under its own filename', function() {
    var body = null;
    global.window.fetch = function(url, opt) { body = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
    ws.saveToFile({ name: 'CAN_seq', dsl: 'hello' }, './diagrams');
    expect(body.type).toBe('CAN_seq');
    expect(body.dsl).toBe('hello');
    expect(body.dir).toBe('./diagrams');
  });
});
