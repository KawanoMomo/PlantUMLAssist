'use strict';
// BLK-junior-20260925-1732-friction: タイトル欄を変えた直後 (自動保存の debounce の間) にタブ名を変えると、
// 待っていた自動保存が前の名前で後から書かれ、改名の後始末が済んだ後に前の名前のファイルが
// 今の図と同じ中身で保存フォルダに戻っていた。改名の後始末は autoSave.settle() で待っている保存を
// 先に書き切らせてから前の名前のファイルを読む。ここでは settle の同期の部分 (その場で書きに出る・
// 書き先は打った時点の名前・待つための Promise を返す) を守る。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

(function() {
  var store = {};
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
  } });
})();

var depPaths = ['../src/core/auto-save.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var as = global.window.MA.autoSave;

describe('BLK-junior-20260925-1732 改名の前に待っている自動保存を書き切る (autoSave.settle)', function() {
  var posts, name;
  beforeEach(function() {
    global.window.localStorage.clear();
    posts = [];
    name = 'dma_usecase';
    global.window.fetch = function(url, opts) {
      if (opts && opts.method === 'POST' && url === '/autosave') posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
    };
    as.setConfig({ enabled: true, backend: 'file', fileDir: './x', debounceMs: 60000 });
    as.setFileNameResolver(function() { return { name: name }; });
  });

  test('API として公開されている', function() {
    expect(typeof as.settle).toBe('function');
  });

  test('debounce 中の保存はその場で書きに出て、書き先は打った時点の名前 (改名後の名前ではない)', function() {
    as.scheduleSave('plantuml-usecase', '@startuml\ntitle DMAドライバ利用ユースケース図\n@enduml');
    expect(posts.length).toBe(0);
    name = 'DMAドライバ利用ユースケース図';   // タブ名を変えた
    var p = as.settle();
    expect(posts.length).toBe(1);
    expect(posts[0].type).toBe('dma_usecase');
    expect(posts[0].dsl).toContain('title DMAドライバ利用ユースケース図');
    expect(typeof p.then).toBe('function');
    // 書き切った後は 1 秒後に同じ保存がもう一度前の名前で書かれることは無い
    as.flush();
    expect(posts.length).toBe(1);
  });

  test('待っている保存が無ければ何も書かず、待つための Promise だけ返す', function() {
    var p = as.settle();
    expect(posts.length).toBe(0);
    expect(typeof p.then).toBe('function');
  });
});

as.setFileNameResolver(null);
as.setConfig({ debounceMs: 1000, backend: 'localStorage' });
delete global.window.fetch;
global.window = prevWindow;
global.document = prevDocument;
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
