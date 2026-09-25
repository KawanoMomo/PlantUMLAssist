'use strict';
// BLK-human-20260925-1150 / BLK-owner-20260925-1132-1: 保存先を別のフォルダに替えても、
// 開いているタブは開いたときのファイルを指し続ける。書き先のフォルダはタブごと (workspace の dir)。
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

['../src/core/workspace.js', '../src/core/auto-save.js', '../src/core/source-lock.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var WS = global.window.MA.workspace;
var AS = global.window.MA.autoSave;
var SL = global.window.MA.sourceLock;

describe('workspace: タブの書き先のフォルダ', function() {
  beforeEach(function() {
    global.window.localStorage.__reset();
    WS.reset();
    WS.init({ name: 'diagram1', dsl: '@startuml\nA -> B\n@enduml' });
  });

  test('留めていないタブは今の保存先に従う (dirOf は fallback を返す)', function() {
    var d = WS.getActive();
    expect(d.dir).toBe(undefined);
    expect(WS.dirOf(d.id, 'C:/B')).toBe('C:/B');
  });

  test('holdDir: 開いているタブを前の保存先に留める。留めたタブは保存先を替えても前のフォルダを返す', function() {
    var d1 = WS.getActive();
    var d2 = WS.open({ name: 'ok_class', dsl: '@startuml\nclass A\n@enduml', diagramType: 'plantuml-class' });
    expect(WS.holdDir('C:/A')).toBe(2);
    expect(WS.dirOf(d1.id, 'C:/B')).toBe('C:/A');
    expect(WS.dirOf(d2.id, 'C:/B')).toBe('C:/A');
    expect(WS.getActive().dir).toBe('C:/A');
    // 後から開いたタブは今の保存先に従う
    var d3 = WS.open({ name: 'new1', dsl: 'x' });
    expect(WS.dirOf(d3.id, 'C:/B')).toBe('C:/B');
  });

  test('holdDir: 既に留めてあるタブは付け替えない / skip が真のタブは留めない', function() {
    var d1 = WS.getActive();
    WS.holdDir('C:/A');
    var d2 = WS.open({ name: 'blank', dsl: '' });
    var n = WS.holdDir('C:/B', function(d) { return d.name === 'blank'; });
    expect(n).toBe(0);
    expect(WS.dirOf(d1.id, 'C:/C')).toBe('C:/A');
    expect(WS.dirOf(d2.id, 'C:/C')).toBe('C:/C');
  });

  test('留めたフォルダは localStorage から読み直しても残る', function() {
    var id = WS.getActive().id;
    WS.holdDir('C:/A');
    // モジュールを読み直して手元の状態を捨て、同じ localStorage から init し直す
    delete require.cache[require.resolve('../src/core/workspace.js')];
    require('../src/core/workspace.js');
    WS = global.window.MA.workspace;
    WS.init({});
    expect(WS.getActive().id).toBe(id);
    expect(WS.dirOf(id, 'C:/B')).toBe('C:/A');
  });

  test('setDir で空を渡すと留めを外す', function() {
    var d1 = WS.getActive();
    WS.setDir(d1.id, 'C:/A');
    expect(WS.dirOf(d1.id, 'C:/B')).toBe('C:/A');
    WS.setDir(d1.id, '');
    expect(WS.dirOf(d1.id, 'C:/B')).toBe('C:/B');
  });

  test('openOrActivate: 留めたタブと同じ名前のファイルを今の保存先から中身ごと開くと、そのタブは今の保存先のファイルになる', function() {
    var d1 = WS.getActive();
    WS.holdDir('C:/A');
    var again = WS.openOrActivate({ name: 'diagram1', dsl: '@startuml\nX -> Y\n@enduml' });
    expect(again.id).toBe(d1.id);
    expect(again.dir).toBe(undefined);
    expect(WS.dirOf(d1.id, 'C:/B')).toBe('C:/B');
  });

  test('openOrActivate: 中身を渡さず名前で移るだけなら留めたまま (前のフォルダの中身を今の保存先へ流さない)', function() {
    var d1 = WS.getActive();
    WS.open({ name: 'other', dsl: 'y' });
    WS.holdDir('C:/A');
    var again = WS.openOrActivate({ name: 'diagram1' });
    expect(again.id).toBe(d1.id);
    expect(WS.dirOf(d1.id, 'C:/B')).toBe('C:/A');
  });
});

describe('auto-save: 書き先のフォルダは解決器がタブごとに返す', function() {
  // fetch の差し替えは 1 件ごとに戻す (同じプロセスで走る他のテストへ漏らさない)
  function withPosts(fn) {
    global.window.localStorage.__reset();
    var posts = [];
    var savedFetch = global.window.fetch;
    global.window.fetch = function(url, opts) {
      if (opts && opts.method === 'POST' && url === '/autosave') posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, text: function() { return Promise.resolve(''); }, json: function() { return Promise.resolve({}); } });
    };
    try { fn(posts); }
    finally {
      AS.setFileNameResolver(null);
      global.window.fetch = savedFetch;
    }
  }

  test('解決器が dir を返せば、保存先ではなくそのフォルダへ書く', function() {
    withPosts(function(posts) {
      AS.setConfig({ backend: 'file', fileDir: 'C:/B' });
      AS.setFileNameResolver(function() { return { name: 'diagram1', dir: 'C:/A' }; });
      AS.scheduleSave('plantuml-sequence', 'A-BODY');
      AS.flush();
      expect(posts.length).toBe(1);
      expect(posts[0].type).toBe('diagram1');
      expect(posts[0].dir).toBe('C:/A');
    });
  });

  test('dir を返さなければ従来どおり保存先へ書く', function() {
    withPosts(function(posts) {
      AS.setConfig({ backend: 'file', fileDir: 'C:/B' });
      AS.setFileNameResolver(function() { return 'diagram1'; });
      AS.scheduleSave('plantuml-sequence', 'B-BODY');
      AS.flush();
      expect(posts.length).toBe(1);
      expect(posts[0].dir).toBe('C:/B');
    });
  });

  test('書き先のフォルダは打った時点で決まる (debounce の間に保存先を替えても流れない)', function() {
    withPosts(function(posts) {
      AS.setConfig({ backend: 'file', fileDir: 'C:/A' });
      var dir = 'C:/A';
      AS.setFileNameResolver(function() { return { name: 'diagram1', dir: dir }; });
      AS.scheduleSave('plantuml-sequence', 'TYPED-IN-A');
      dir = 'C:/B';
      AS.setConfig({ backend: 'file', fileDir: 'C:/B' });
      AS.flush();
      expect(posts.length).toBe(1);
      expect(posts[0].dir).toBe('C:/A');
    });
  });
});

describe('source-lock: 確認の窓はどのフォルダのファイルかも言う', function() {
  test('dir を渡すとフォルダ名が本文に入る', function() {
    var t = SL.askText('ok_class', 'C:/work/diff-B/');
    expect(t.body).toContain('ok_class.puml');
    expect(t.body).toContain('C:/work/diff-B の中');
  });
  test('dir を渡さなければ従来の本文', function() {
    var t = SL.askText('ok_class');
    expect(t.body).not.toContain('の中）');
  });
});

// 後続のテストは共有の window を使う。差し替えた window を戻し、読み直したモジュールの控えも落とす。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
['../src/core/workspace.js', '../src/core/auto-save.js', '../src/core/source-lock.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
