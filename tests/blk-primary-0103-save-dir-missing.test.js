'use strict';
// BLK-primary-20260908-0103 「保存先が違うと 📂一覧が黙って空になる」。
//
// 保存先の綴りを 1 文字誤っただけでも一覧は「保存フォルダに図がありません」と
// しか言わず、間違いに気づけないまま作業が止まっていた。server は実在するかを
// 返し、workspace.listFolder はそれを呼び出し側へそのまま渡す。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

(function() {
  var store = {};
  Object.defineProperty(global.window, 'localStorage', {
    configurable: true,
    value: {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function(k, v) { store[k] = String(v); },
      removeItem: function(k) { delete store[k]; },
      clear: function() { store = {}; },
      key: function(i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; },
    },
  });
})();

try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
require('../src/core/workspace.js');
var ws = global.window.MA.workspace;

// runner の test は同期なので、fetch の返しを同期で解ける thenable にする。
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
function stubFetch(payload, ok) {
  global.window.fetch = function() {
    return syncThenable({ ok: ok !== false, json: function() { return syncThenable(payload); } });
  };
}

describe('workspace listFolder — 保存先が実在するか (BLK-primary-20260908-0103)', function() {
  test('API として公開されている', function() {
    expect(typeof ws.listFolder).toBe('function');
  });

  test('実在しない保存先は exists:false で、解決されたパスも返す', function() {
    stubFetch({ files: [], entries: [], exists: false, dir: 'E:\\nope\\here' });
    var got = null;
    ws.listFolder('E:/nope/here').then(function(v) { got = v; });
    expect(got.exists).toBe(false);
    expect(got.entries).toEqual([]);
    expect(got.dir).toBe('E:\\nope\\here');
  });

  test('実在して 0 件なら exists:true (「まだ 1 枚も無い」と区別できる)', function() {
    stubFetch({ files: [], entries: [], exists: true, dir: './autosave' });
    var got = null;
    ws.listFolder('./autosave').then(function(v) { got = v; });
    expect(got.exists).toBe(true);
    expect(got.entries).toEqual([]);
  });

  test('図があれば entries をそのまま返す', function() {
    stubFetch({ files: ['a'], entries: [{ name: 'a', mtime: null, hash: 'h1' }], exists: true, dir: './autosave' });
    var got = null;
    ws.listFolder('./autosave').then(function(v) { got = v; });
    expect(got.entries.length).toBe(1);
    expect(got.entries[0].hash).toBe('h1');
  });

  test('entries を返さない古い server でも名前だけの entry に落とす', function() {
    stubFetch({ files: ['a', 'b'], exists: true });
    var got = null;
    ws.listFolder('./autosave').then(function(v) { got = v; });
    expect(got.entries.length).toBe(2);
    expect(got.entries[0].name).toBe('a');
  });

  test('exists を返さない古い server では判定しない (null。誤って「無い」と言わない)', function() {
    stubFetch({ files: [], entries: [] });
    var got = null;
    ws.listFolder('./autosave').then(function(v) { got = v; });
    expect(got.exists).toBeNull();
  });

  test('server が落ちていれば判定しない (null) で、問い合わせたパスを返す', function() {
    stubFetch(null, false);
    var got = null;
    ws.listFolder('./autosave').then(function(v) { got = v; });
    expect(got.exists).toBeNull();
    expect(got.entries).toEqual([]);
    expect(got.dir).toBe('./autosave');
  });

  test('保存フォルダを問い合わせ先に載せる', function() {
    var seen = null;
    global.window.fetch = function(url) {
      seen = url;
      return syncThenable({ ok: true, json: function() { return syncThenable({ files: [], exists: true }); } });
    };
    ws.listFolder('E:/01_Loop/persona-data/primary');
    expect(seen).toContain('/autosave?dir=');
    expect(seen).toContain(encodeURIComponent('E:/01_Loop/persona-data/primary'));
  });
});

// 後続のテストファイルが共有の window を見るので、必ず戻す。
global.window = prevWindow;
global.document = prevDocument;
