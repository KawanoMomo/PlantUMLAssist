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
    // BLK-junior-20260907-1203: 日本語名はそのまま残す (以前は 'SPI' に削られていた)。
    expect(ws.rename(a, 'SPI シーケンス').name).toBe('SPI シーケンス');
    expect(ws.rename(a, 'CAN_seq').name).toBe('CAN_seq-2');
  });
  test('findByName locates a tab', function() {
    ws.open({ name: 'CAN_seq', dsl: 'C' });
    expect(ws.findByName('CAN_seq').dsl).toBe('C');
    expect(ws.findByName('missing')).toBeNull();
  });
});

describe('workspace name sanitisation', function() {
  // BLK-junior-20260907-1203: 日本語名の図がこのプロジェクトの大半なので、
  // 「ASCII 以外は落とす」から「ファイル名として危ないものだけ潰す」に変えた。
  test('危ない文字だけを潰し、日本語・空白はそのまま残す', function() {
    expect(ws.sanitizeName('SPI シーケンス')).toBe('SPI シーケンス');
    expect(ws.sanitizeName('GPIOドライバユースケース.puml')).toBe('GPIOドライバユースケース');
    expect(ws.sanitizeName('CAN/state.puml')).toBe('CAN_state');
    expect(ws.sanitizeName('a<b>c:d|e?f*g')).toBe('a_b_c_d_e_f_g');
    expect(ws.sanitizeName('   ')).toBe('diagram');
    expect(ws.sanitizeName('a b c')).toBe('a b c');
    // 末尾のドット・空白は Windows が落とすので先に落とす
    expect(ws.sanitizeName('report. ')).toBe('report');
    // Windows の予約デバイス名はそのままではファイルにできない
    expect(ws.sanitizeName('CON')).toBe('CON_');
  });
  test('isValidName はファイル名にできる名前だけ通す', function() {
    expect(ws.isValidName('CAN_state-2')).toBe(true);
    expect(ws.isValidName('CAN state')).toBe(true);
    expect(ws.isValidName('GPIOドライバユースケース')).toBe(true);
    expect(ws.isValidName('CAN/state')).toBe(false);
    expect(ws.isValidName('a:b')).toBe(false);
    expect(ws.isValidName('nul')).toBe(false);
    expect(ws.isValidName('report. ')).toBe(false);
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
    ws.saveToFile({ name: 'bad/name', dsl: 'x' }, './d');
    expect(called).toBe(false);
  });
  test('saveToFile は日本語名の図もそのまま送る', function() {
    var body = null;
    global.window.fetch = function(url, opt) { body = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
    ws.saveToFile({ name: 'GPIOドライバユースケース', dsl: 'x' }, './d');
    expect(body.type).toBe('GPIOドライバユースケース');
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

// BLK-reviewer-20260907-1403: 一覧に最終保存時刻と本文の指紋を載せる。
// runner の test は同期なので、fetch の返しを同期で解ける thenable にして中身を見る。
function syncThenable(value) {
  return {
    then: function(cb) {
      var next = cb ? cb(value) : value;
      // 返り値がまた thenable なら畳む (Promise と同じ振る舞い)
      return (next && typeof next.then === 'function') ? next : syncThenable(next);
    },
    catch: function() { return syncThenable(value); },
  };
}

describe('workspace listFileEntries', function() {
  beforeEach(function() { fresh(); });

  test('API として公開されている', function() {
    expect(typeof ws.listFileEntries).toBe('function');
  });

  test('server の entries をそのまま返す', function() {
    global.window.fetch = function() {
      return syncThenable({ ok: true, json: function() {
        return syncThenable({ files: ['a'], entries: [{ name: 'a', mtime: '2026-09-07T05:00:00Z', hash: 'h1' }] });
      } });
    };
    var got = null;
    ws.listFileEntries('./diagrams').then(function(v) { got = v; });
    expect(got.length).toBe(1);
    expect(got[0].name).toBe('a');
    expect(got[0].hash).toBe('h1');
  });

  test('entries を返さない古い server では名前だけの entry に落とす', function() {
    global.window.fetch = function() {
      return syncThenable({ ok: true, json: function() { return syncThenable({ files: ['a', 'b'] }); } });
    };
    var got = null;
    ws.listFileEntries('./diagrams').then(function(v) { got = v; });
    expect(got.length).toBe(2);
    expect(got[0].name).toBe('a');
    expect(got[0].hash).toBeNull();
  });

  test('server が落ちていても空配列で返す (一覧が消えるだけ)', function() {
    global.window.fetch = function() {
      return syncThenable({ ok: false, json: function() { return syncThenable(null); } });
    };
    var got = null;
    ws.listFileEntries('./diagrams').then(function(v) { got = v; });
    expect(got).toEqual([]);
  });

  test('保存フォルダを問い合わせ先に載せる', function() {
    var seen = null;
    global.window.fetch = function(url) {
      seen = url;
      return syncThenable({ ok: true, json: function() { return syncThenable({ files: [] }); } });
    };
    ws.listFileEntries('./diagrams');
    expect(seen).toContain('/autosave?dir=');
    expect(seen).toContain(encodeURIComponent('./diagrams'));
  });
});
