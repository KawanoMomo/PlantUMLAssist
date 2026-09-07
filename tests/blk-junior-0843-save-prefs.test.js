'use strict';
// BLK-junior-20260907-0843: 保存先ディレクトリが新しいタブで既定へ戻る。
// 保存先は server 側の prefs に覚え、localStorage に指定が無いときだけ引き継ぐ。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
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

// fetch を差し替えて server の応答を作る。呼ばれた内容も記録する。
var fetchLog = [];
var serverPrefs = {};
Object.defineProperty(global.window, 'fetch', {
  configurable: true,
  writable: true,
  value: function(url, opts) {
    fetchLog.push({ url: url, opts: opts });
    if (url === '/prefs' && (!opts || !opts.method || opts.method === 'GET')) {
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve(serverPrefs); } });
    }
    if (url === '/prefs' && opts && opts.method === 'POST') {
      var body = JSON.parse(opts.body);
      Object.keys(body).forEach(function(k) { serverPrefs[k] = body[k]; });
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve(serverPrefs); } });
    }
    // /autosave の一覧。file backend の init が呼ぶ。
    return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ files: [], meta: null }); } });
  },
});

['../src/core/save-prefs.js', '../src/core/auto-save.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var SP = global.window.MA.savePrefs;
var as = global.window.MA.autoSave;

function reset() {
  global.window.localStorage.__reset();
  fetchLog = [];
  serverPrefs = {};
}

describe('savePrefs — 保存先に関わるキーだけを扱う', function() {
  beforeEach(reset);

  test('pick は backend / fileDir だけを残す', function() {
    var out = SP.pick({ backend: 'file', fileDir: 'E:/persona-data/junior', enabled: true, debounceMs: 500 });
    expect(out).toEqual({ backend: 'file', fileDir: 'E:/persona-data/junior' });
  });

  test('pick は空文字と非文字列を落とす', function() {
    expect(SP.pick({ backend: '', fileDir: 5 })).toEqual({});
    expect(SP.pick(null)).toEqual({});
  });

  test('applicable — localStorage に指定が無ければ server の値を引き継ぐ', function() {
    var out = SP.applicable({}, { backend: 'file', fileDir: 'E:/persona-data/junior' });
    expect(out).toEqual({ backend: 'file', fileDir: 'E:/persona-data/junior' });
  });

  test('applicable — このブラウザの指定がある側は上書きしない', function() {
    var out = SP.applicable(
      { backend: 'localStorage' },
      { backend: 'file', fileDir: 'E:/persona-data/junior' });
    expect(out).toEqual({ fileDir: 'E:/persona-data/junior' });
  });

  test('applicable — server 側が空なら何も引き継がない', function() {
    expect(SP.applicable({}, {})).toEqual({});
  });
});

describe('autoSave — 保存先の引き継ぎ', function() {
  beforeEach(reset);

  test('setConfig は保存先を server にも書き写す', function() {
    as.setConfig({ backend: 'file', fileDir: 'E:/persona-data/junior', debounceMs: 2000 });
    var posts = fetchLog.filter(function(f) { return f.opts && f.opts.method === 'POST'; });
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0].opts.body)).toEqual({ backend: 'file', fileDir: 'E:/persona-data/junior' });
  });

  test('新しいタブ (localStorage 空) では server の保存先が効く', function() {
    serverPrefs = { backend: 'file', fileDir: 'E:/persona-data/junior' };
    expect(as.getConfig().fileDir).toBe('./autosave');
    return as.hydrateFromServer().then(function(applied) {
      expect(applied).toEqual({ backend: 'file', fileDir: 'E:/persona-data/junior' });
      var cfg = as.getConfig();
      expect(cfg.backend).toBe('file');
      expect(cfg.fileDir).toBe('E:/persona-data/junior');
      // 引き継いだ値は localStorage にも書き戻され、次回以降は fetch を待たない。
      expect(SP.applicable(JSON.parse(global.window.localStorage.getItem('plantuml-autosave-config')), serverPrefs))
        .toEqual({});
    });
  });

  test('このブラウザで設定済みなら server の値で上書きしない', function() {
    as.setConfig({ backend: 'file', fileDir: 'E:/persona-data/reviewer' });
    serverPrefs = { backend: 'file', fileDir: 'E:/persona-data/junior' };
    return as.hydrateFromServer().then(function(applied) {
      expect(applied).toEqual({});
      expect(as.getConfig().fileDir).toBe('E:/persona-data/reviewer');
    });
  });

  test('init は引き継ぎ後の保存先で file backend を起こす', function() {
    serverPrefs = { backend: 'file', fileDir: 'E:/persona-data/junior' };
    return Promise.resolve(as.init()).then(function() {
      var list = fetchLog.filter(function(f) {
        return typeof f.url === 'string' && f.url.indexOf('/autosave?') === 0;
      });
      expect(list.length).toBeGreaterThan(0);
      expect(decodeURIComponent(list[0].url)).toContain('E:/persona-data/junior');
    });
  });

  test('引き継ぎの通信中に設定画面から保存された値を上書きしない', function() {
    // /prefs の応答を握っておき、その間に設定画面の保存 (setConfig) を走らせる。
    var release;
    var saved = global.window.fetch;
    global.window.fetch = function(url, opts) {
      if (url === '/prefs' && (!opts || !opts.method || opts.method === 'GET')) {
        return new Promise(function(res) {
          release = function() {
            res({ ok: true, json: function() {
              return Promise.resolve({ backend: 'file', fileDir: 'E:/persona-data/junior' });
            } });
          };
        });
      }
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
    };
    var p = as.hydrateFromServer();
    as.setConfig({ backend: 'file', fileDir: 'E:/persona-data/reviewer' });
    release();
    return p.then(function() {
      expect(as.getConfig().fileDir).toBe('E:/persona-data/reviewer');
      global.window.fetch = saved;
    }, function(err) { global.window.fetch = saved; throw err; });
  });

  test('server が居なくても getConfig は既定のまま動く', function() {
    var saved = global.window.fetch;
    global.window.fetch = function() { return Promise.reject(new Error('ECONNREFUSED')); };
    return as.hydrateFromServer().then(function(applied) {
      expect(applied).toEqual({});
      expect(as.getConfig().fileDir).toBe('./autosave');
      global.window.fetch = saved;
    }, function(err) {
      global.window.fetch = saved;
      throw err;
    });
  });
});

global.window = prevWindow;
global.document = prevDocument;
