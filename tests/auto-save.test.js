'use strict';
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Stub localStorage on the jsdom window for deterministic tests
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
  // jsdom 29 localStorage has only a getter (configurable:true, no setter),
  // so direct assignment throws — use Object.defineProperty instead.
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: stub });
})();

var depPaths = ['../src/core/auto-save.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var as = global.window.MA.autoSave;

describe('autoSave skeleton', function() {
  beforeEach(function() { global.window.localStorage.__reset(); });
  test('exports the public API', function() {
    expect(typeof as.init).toBe('function');
    expect(typeof as.scheduleSave).toBe('function');
    expect(typeof as.flush).toBe('function');
    expect(typeof as.restoreFor).toBe('function');
    expect(typeof as.hasSavedFor).toBe('function');
    expect(typeof as.getMeta).toBe('function');
    expect(typeof as.clearAll).toBe('function');
    expect(typeof as.getConfig).toBe('function');
    expect(typeof as.setConfig).toBe('function');
    expect(typeof as.isAvailable).toBe('function');
    expect(typeof as.onSave).toBe('function');
  });
  test('isAvailable returns true when localStorage works', function() {
    expect(as.isAvailable()).toBe(true);
  });
});

describe('autoSave config', function() {
  beforeEach(function() { global.window.localStorage.__reset(); });
  test('getConfig returns defaults when nothing saved', function() {
    var c = as.getConfig();
    expect(c.enabled).toBe(true);
    expect(c.debounceMs).toBe(1000);
    expect(c.restoreMode).toBe('confirm');
  });
  test('setConfig persists and merges with existing', function() {
    as.setConfig({ debounceMs: 2000 });
    var c = as.getConfig();
    expect(c.debounceMs).toBe(2000);
    expect(c.enabled).toBe(true);
    expect(c.restoreMode).toBe('confirm');
  });
  test('setConfig persists across reads via localStorage', function() {
    as.setConfig({ enabled: false, restoreMode: 'auto' });
    var raw = global.window.localStorage.getItem('plantuml-autosave-config');
    expect(raw).not.toBe(null);
    var parsed = JSON.parse(raw);
    expect(parsed.enabled).toBe(false);
    expect(parsed.restoreMode).toBe('auto');
  });
  test('getConfig falls back to defaults if stored JSON is corrupt', function() {
    global.window.localStorage.setItem('plantuml-autosave-config', '{not-json');
    var c = as.getConfig();
    expect(c.enabled).toBe(true);
    expect(c.debounceMs).toBe(1000);
  });
  test('getConfig falls back per-field when restoreMode is invalid, leaving other fields intact', function() {
    global.window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({ enabled: false, debounceMs: 2000, restoreMode: 'banana' }));
    var c = as.getConfig();
    expect(c.restoreMode).toBe('confirm'); // default
    expect(c.enabled).toBe(false);          // preserved
    expect(c.debounceMs).toBe(2000);        // preserved
  });
  test('getConfig falls back per-field when debounceMs is below 100, leaving other fields intact', function() {
    global.window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({ enabled: false, debounceMs: 50, restoreMode: 'auto' }));
    var c = as.getConfig();
    expect(c.debounceMs).toBe(1000);  // default
    expect(c.enabled).toBe(false);    // preserved
    expect(c.restoreMode).toBe('auto'); // preserved
  });
});

describe('autoSave save/restore', function() {
  beforeEach(function() { global.window.localStorage.__reset(); });

  test('flush() writes the pending DSL to per-type key', function() {
    as.scheduleSave('plantuml-state', '@startuml\nstate A\n@enduml');
    as.flush();
    expect(global.window.localStorage.getItem('plantuml-autosave-dsl-plantuml-state')).toBe('@startuml\nstate A\n@enduml');
  });

  test('restoreFor returns saved DSL', function() {
    as.scheduleSave('plantuml-class', '@startuml\nclass X\n@enduml');
    as.flush();
    expect(as.restoreFor('plantuml-class')).toBe('@startuml\nclass X\n@enduml');
  });

  test('restoreFor returns null when no save', function() {
    expect(as.restoreFor('plantuml-state')).toBe(null);
  });

  test('hasSavedFor reflects presence', function() {
    expect(as.hasSavedFor('plantuml-state')).toBe(false);
    as.scheduleSave('plantuml-state', 'x');
    as.flush();
    expect(as.hasSavedFor('plantuml-state')).toBe(true);
  });

  test('flush updates meta with timestamp + diagramType', function() {
    var t0 = Date.now();
    as.scheduleSave('plantuml-state', 'x');
    as.flush();
    var meta = as.getMeta();
    expect(meta).not.toBe(null);
    expect(meta.lastSavedType).toBe('plantuml-state');
    expect(typeof meta.lastSavedAt).toBe('string');
    expect(new Date(meta.lastSavedAt).getTime()).toBeGreaterThan(t0 - 1000);
  });

  test('per-type isolation: state save does not affect class', function() {
    as.scheduleSave('plantuml-state', 'STATE_DSL');
    as.flush();
    as.scheduleSave('plantuml-class', 'CLASS_DSL');
    as.flush();
    expect(as.restoreFor('plantuml-state')).toBe('STATE_DSL');
    expect(as.restoreFor('plantuml-class')).toBe('CLASS_DSL');
  });

  test('clearAll removes dsl keys and meta but keeps config', function() {
    as.setConfig({ debounceMs: 2000 });
    as.scheduleSave('plantuml-state', 'X');
    as.flush();
    as.clearAll();
    expect(as.restoreFor('plantuml-state')).toBe(null);
    expect(as.getMeta()).toBe(null);
    expect(as.getConfig().debounceMs).toBe(2000);
  });

  test('clearAll cancels pending debounced save (no immediate re-write)', function() {
    // Schedule a save with the default debounce (1000ms). The timer is
    // pending — clearAll should cancel it so a subsequent flush() finds
    // nothing to write and the cleared keys stay cleared.
    as.scheduleSave('plantuml-state', 'PENDING_DSL');
    as.clearAll();
    as.flush();
    expect(as.restoreFor('plantuml-state')).toBe(null);
  });

  test('disabled config: scheduleSave + flush are no-ops', function() {
    as.setConfig({ enabled: false });
    as.scheduleSave('plantuml-state', 'X');
    as.flush();
    expect(as.restoreFor('plantuml-state')).toBe(null);
  });

  test('save throws → does not propagate (quota exceeded simulation)', function() {
    var origSet = global.window.localStorage.setItem;
    global.window.localStorage.setItem = function(k, v) {
      if (k.indexOf('plantuml-autosave-dsl-') === 0) throw new Error('QuotaExceeded');
      return origSet.call(this, k, v);
    };
    expect(function() { as.scheduleSave('plantuml-state', 'X'); as.flush(); }).not.toThrow();
    global.window.localStorage.setItem = origSet;
  });

  test('onSave listener fires after successful flush with meta', function() {
    var calls = [];
    as.onSave(function(meta) { calls.push(meta); });
    as.scheduleSave('plantuml-state', 'X');
    as.flush();
    expect(calls.length).toBe(1);
    expect(calls[0].lastSavedType).toBe('plantuml-state');
  });
});

describe('autoSave file backend', function() {
  var savedFetch;
  var capturedRequests;
  beforeEach(function() {
    global.window.localStorage.__reset();
    capturedRequests = [];
    savedFetch = global.window.fetch;
    global.window.fetch = function(url, opts) {
      capturedRequests.push({ url: url, method: (opts && opts.method) || 'GET', body: opts && opts.body });
      return Promise.resolve({
        ok: true,
        text: function() { return Promise.resolve(''); },
        json: function() { return Promise.resolve({ files: [], meta: null, dir: '/test' }); },
      });
    };
  });

  test('file backend mirrors writes to /autosave POST', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.scheduleSave('plantuml-state', '@startuml\n@enduml');
    as.flush();
    var post = capturedRequests.find(function(r) { return r.method === 'POST' && r.url === '/autosave'; });
    expect(post).toBeDefined();
    var body = JSON.parse(post.body);
    expect(body.type).toBe('plantuml-state');
    expect(body.dir).toBe('/test');
    expect(body.dsl).toContain('@startuml');
    if (savedFetch !== undefined) global.window.fetch = savedFetch;
    else delete global.window.fetch;
  });

  test('localStorage backend does NOT call fetch', function() {
    as.setConfig({ backend: 'localStorage' });
    as.scheduleSave('plantuml-state', 'X');
    as.flush();
    expect(capturedRequests.length).toBe(0);
    if (savedFetch !== undefined) global.window.fetch = savedFetch;
    else delete global.window.fetch;
  });

  test('clearAll with file backend issues DELETE /autosave', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.clearAll();
    var del = capturedRequests.find(function(r) { return r.method === 'DELETE'; });
    expect(del).toBeDefined();
    expect(del.url).toContain('dir=');
    if (savedFetch !== undefined) global.window.fetch = savedFetch;
    else delete global.window.fetch;
  });
});

// BLK-primary-20260913-0306 — 自動保存の書き先は図種ではなく図の名前。
// 図種を鍵にしたまま写すと、diagram1 を打つだけで plantuml-sequence.puml が
// diagram1 の中身に入れ替わる (開いてもいない図が別の図になる)。
describe('autoSave file name resolver', function() {
  var savedFetch;
  var posts;
  function postBodies() {
    return posts.map(function(b) { return JSON.parse(b); });
  }
  beforeEach(function() {
    global.window.localStorage.__reset();
    posts = [];
    as.setFileNameResolver(null);
    savedFetch = global.window.fetch;
    global.window.fetch = function(url, opts) {
      if (opts && opts.method === 'POST' && url === '/autosave') posts.push(opts.body);
      return Promise.resolve({
        ok: true,
        text: function() { return Promise.resolve(''); },
        json: function() { return Promise.resolve({}); },
      });
    };
  });
  function restore() {
    as.setFileNameResolver(null);
    if (savedFetch !== undefined) global.window.fetch = savedFetch;
    else delete global.window.fetch;
  }

  test('書き先は解決器が返した図の名前になる (図種ではない)', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return 'driver_common_class'; });
    as.scheduleSave('plantuml-class', '@startuml\nclass Driver_Common\n@enduml');
    as.flush();
    var bodies = postBodies();
    expect(bodies.length).toBe(1);
    expect(bodies[0].type).toBe('driver_common_class');
    // 図種の名前のファイルには一切触らない。
    expect(bodies.some(function(b) { return b.type === 'plantuml-class'; })).toBe(false);
    restore();
  });

  test('localStorage 側の鍵は図種のまま (図種ごとの復元を壊さない)', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return 'diagram1'; });
    as.scheduleSave('plantuml-sequence', 'SEQ-BODY');
    as.flush();
    expect(as.restoreFor('plantuml-sequence')).toBe('SEQ-BODY');
    restore();
  });

  test('名前を持たないタブはディスクへ写さない (別の図を潰すより書かない)', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return ''; });
    as.scheduleSave('plantuml-sequence', 'X');
    as.flush();
    expect(posts.length).toBe(0);
    expect(as.restoreFor('plantuml-sequence')).toBe('X');
    restore();
  });

  test('書き先は打った時点で決まる (debounce 中にタブを替えても流れ込まない)', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    var active = 'diagram1';
    as.setFileNameResolver(function() { return active; });
    as.scheduleSave('plantuml-sequence', 'DIAGRAM1-BODY');
    active = 'plantuml-sequence';   // 1 秒の間にタブを切り替えた
    as.flush();
    expect(postBodies()[0].type).toBe('diagram1');
    restore();
  });

  test('解決器が無ければ従来どおり図種で書く', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.scheduleSave('plantuml-state', 'S');
    as.flush();
    expect(postBodies()[0].type).toBe('plantuml-state');
    restore();
  });
});

// jsdom window を run-tests.js が用意した sandbox window に戻す。
// これをしないと後続 test ファイル (class-*, component-*, regex-parts 等) が
// window.MA.* を見失って失敗する。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;

// require.cache を落とすことで、後続テストが各モジュールを
// 自分の sandbox window 上で再実行できるようにする。
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
