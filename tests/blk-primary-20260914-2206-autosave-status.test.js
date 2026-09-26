'use strict';
// BLK-primary-20260914-2206: 一覧から開いた図に note を打っても保存フォルダの .puml が
// 変わらない。自動保存は錠の返事待ちで 1 度もディスクへ写していなかったのに、状態バーの
// 💾 は「たった今」と出続けていた。ここで守るのは
//   (1) 書かなかった回は「どこまで届いたか」と訳が残ること
//   (2) 返事待ち (ask) は黙って落とさず知らせること
//   (3) 状態バーの文言が「ブラウザにのみ」と「ファイルに書いた」を言い分けること
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

var depPaths = ['../src/core/auto-save.js', '../src/core/autosave-status.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var as = global.window.MA.autoSave;
var AST = global.window.MA.autosaveStatus;

describe('自動保存が「どこまで届いたか」を残す', function() {
  var posts;
  beforeEach(function() {
    global.window.localStorage.__reset();
    posts = [];
    global.window.fetch = function(url, opts) {
      if (opts && opts.method === 'POST' && url === '/autosave') posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
    };
    as.setFileNameResolver(null);
    as.setFileGuard(null);
  });

  test('ファイルへ書いた回は where=file と書き先の名前が残る', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return 'driver_common_class'; });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    var last = as.getLastWrite();
    expect(last.where).toBe('file');
    expect(last.fileName).toBe('driver_common_class');
    expect(posts.length).toBe(1);
  });

  test('錠の返事待ちは書かず、where=deferred / reason=ask が残る', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return { name: '', reason: 'ask' }; });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    expect(posts.length).toBe(0);
    var last = as.getLastWrite();
    expect(last.where).toBe('deferred');
    expect(last.reason).toBe('ask');
    // 打った内容そのものは失われない (ブラウザ側には残る)。
    expect(as.restoreFor('plantuml-class')).toBe('BODY');
  });

  test('返事待ちは黙って落とさず知らせる (打っても何も起きない状態を続けない)', function() {
    var heard = [];
    as.onFileDeferred(function(info) { heard.push(info); });
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return { name: '', reason: 'ask' }; });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    expect(heard.length).toBe(1);
    expect(heard[0].reason).toBe('ask');
  });

  test('開いたときのまま (unchanged) も deferred だが訳が違う', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return { name: '', reason: 'unchanged' }; });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    expect(as.getLastWrite().reason).toBe('unchanged');
  });

  test('名前の文字列だけを返す従来の解決器もそのまま動く', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return ''; });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    expect(posts.length).toBe(0);
    expect(as.getLastWrite().reason).toBe('no-name');
  });

  test('手で押した保存 (別経路) が書いたら記録も届いた先に揃う', function() {
    as.setConfig({ backend: 'file', fileDir: '/test' });
    as.setFileNameResolver(function() { return { name: '', reason: 'ask' }; });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    expect(as.getLastWrite().where).toBe('deferred');
    as.noteFileWritten('driver_common_class', 'plantuml-class');
    expect(as.getLastWrite().where).toBe('file');
    expect(as.getLastWrite().fileName).toBe('driver_common_class');
  });

  test('保存先がダウンロードなら where=local (ファイルの話はしない)', function() {
    as.setConfig({ backend: 'localStorage' });
    as.scheduleSave('plantuml-class', 'BODY');
    as.flush();
    expect(as.getLastWrite().where).toBe('local');
  });
});

describe('状態バーの が届いた先を言い分ける', function() {
  var meta = { lastSavedAt: '2026-09-14T22:00:00.000Z', lastSavedType: 'plantuml-class' };

  test('ファイルに書けた回は書き先の .puml を名乗る', function() {
    var d = AST.describe(meta, { where: 'file', fileName: 'driver_common_class' }, 'たった今', 'driver_common_class');
    expect(d.text).toContain('driver_common_class.puml');
    expect(d.pending).toBe(false);
  });

  test('返事待ちは「たった今」と言わず、未保存と名指しして押せる', function() {
    var d = AST.describe(meta, { where: 'deferred', reason: 'ask' }, 'たった今', 'driver_common_class');
    expect(d.text).not.toContain('たった今');
    expect(d.text).toContain('未保存');
    expect(d.text).toContain('driver_common_class.puml');
    expect(d.pending).toBe(true);
  });

  test('控えへ逸れた回は控えの名前が出る (本体が変わったと読めない)', function() {
    var d = AST.describe(meta, { where: 'file', fileName: 'driver_common_class-編集中' }, 'たった今', 'driver_common_class');
    expect(d.text).toContain('driver_common_class-編集中.puml');
  });

  test('開いたときのままは警告にしない (読むだけの回を騒がせない)', function() {
    var d = AST.describe(meta, { where: 'deferred', reason: 'unchanged' }, 'たった今', 'driver_common_class');
    expect(d.pending).toBe(false);
    expect(d.text).not.toContain('未保存');
  });

  test('書き込みを止めてあるファイルはその旨を出す', function() {
    var d = AST.describe(meta, { where: 'blocked', fileName: 'tpl', reason: 'テンプレです' }, 'たった今', 'tpl');
    expect(d.text).toContain('書き込み停止中');
  });

  test('名前が付いていない図は「書けません」と訳まで出す', function() {
    var d = AST.describe(meta, { where: 'deferred', reason: 'no-name' }, 'たった今', '');
    expect(d.text).toContain('書けません');
    expect(d.title).toContain('図名');
  });

  test('保存がまだ 1 度も無ければ何も出さない', function() {
    expect(AST.describe(null, null, '', '').text).toBe('');
  });
});

// 後続テストのために window を戻す (auto-save.test.js と同じ作法)。
if (prevWindow !== undefined) global.window = prevWindow; else delete global.window;
if (prevDocument !== undefined) global.document = prevDocument; else delete global.document;
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
