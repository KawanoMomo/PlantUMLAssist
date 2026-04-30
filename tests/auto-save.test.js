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
