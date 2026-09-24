'use strict';
// BLK-owner-20260924-2232-1 / BLK-human-20260924-2355: 元に戻す / やり直しの履歴が全タブで 1 本だった。
// あるタブで Ctrl+Z を押すと別のタブの本文が入り、図種の判定が替わって自動保存が別名の .puml を書いた。
// 履歴は図 (タブ) ごとに持ち、元に戻した本文の保存は名前を回さない。
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
  } });
})();

['../src/core/history.js', '../src/core/auto-save.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var H = global.window.MA.history;
var AS = global.window.MA.autoSave;

// app.js と同じ形: エディタの本文 1 つと、今どのタブかを持つ小さな作業場。
// 履歴はモジュールに残るので、test ごとに別のタブ id (n-t1 / n-t2) を使う。
var _appSeq = 0;
function makeApp() {
  _appSeq++;
  var p = _appSeq + '-';
  var docs = {};
  docs[p + 't1'] = 'seq-0';
  docs[p + 't2'] = 'state-0';
  var app = { active: p + 't1', text: 'seq-0', restored: [] };
  app.switchTo = function(id) { docs[app.active] = app.text; app.active = p + id; app.text = docs[p + id]; };
  app.edit = function(t) { H.pushHistory(); app.text = t; };
  H.init({
    getMmdText: function() { return app.text; },
    setMmdText: function(s) { app.text = s; },
    onUpdate: function() {},
    getKey: function() { return app.active; },
    onRestore: function(kind) { app.restored.push(app.active + ':' + kind); },
  });
  return app;
}

describe('元に戻す / やり直しは図 (タブ) ごとの履歴', function() {
  test('タブ 2 枚で交互に編集し、片方で undo を尽くしても、もう片方の本文は入らない', function() {
    var app = makeApp();
    app.edit('seq-1');
    app.switchTo('t2');
    app.edit('state-1');
    app.edit('state-2');
    app.switchTo('t1');
    app.edit('seq-2');
    for (var i = 0; i < 6; i++) H.undo();
    expect(app.text).toBe('seq-0');
    expect(H.canUndo()).toBe(false);
    for (var j = 0; j < 6; j++) H.redo();
    expect(app.text).toBe('seq-2');
    expect(H.canRedo()).toBe(false);
    app.switchTo('t2');
    expect(H.canUndo()).toBe(true);
    H.undo();
    expect(app.text).toBe('state-1');
    H.undo(); H.undo(); H.undo();
    expect(app.text).toBe('state-0');
  });

  test('↶ ↷ の効く / 効かないは今のタブの履歴で決まる', function() {
    var app = makeApp();
    app.switchTo('t2');
    app.edit('state-1');
    expect(H.canUndo()).toBe(true);
    app.switchTo('t1');
    expect(H.canUndo()).toBe(false);
    expect(H.canRedo()).toBe(false);
  });

  test('同じ本文を続けて積んでも、Ctrl+Z 1 回で本文が 1 つ前に戻る (何も起きない押下を作らない)', function() {
    var app = makeApp();
    H.pushHistory();
    H.pushHistory();
    app.edit('seq-1');
    H.pushHistory();
    H.undo();
    expect(app.text).toBe('seq-0');
  });

  test('閉じたタブの履歴は持ち越さない', function() {
    var app = makeApp();
    app.switchTo('t2');
    app.edit('state-1');
    H.forget(app.active);
    expect(H.canUndo()).toBe(false);
    H.undo();
    expect(app.text).toBe('state-1');
  });

  test('元に戻す / やり直しで本文を入れるたびに onRestore が呼ばれる (名前を回さない印を付ける口)', function() {
    var app = makeApp();
    app.edit('seq-1');
    H.undo();
    H.redo();
    expect(app.restored).toEqual([app.active + ':undo', app.active + ':redo']);
  });
});

describe('元に戻した本文の保存は名前を回さない (keepName)', function() {
  test('keepNameOnce を付けた名前の次の 1 回の書き込みだけ keepName: true を送る', function() {
    var posts = [];
    var savedFetch = global.window.fetch;
    global.window.fetch = function(url, opts) {
      if (opts && opts.method === 'POST') posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
    };
    AS.setFileNameResolver(null);
    AS.setConfig({ enabled: true, backend: 'file', fileDir: '/test' });
    AS.keepNameOnce('diagram2');
    AS.scheduleSave('diagram2', '@startuml\n[*] --> A\n@enduml');
    AS.flush();
    AS.scheduleSave('diagram2', '@startuml\n[*] --> B\n@enduml');
    AS.flush();
    expect(posts.length).toBe(2);
    expect(posts[0].keepName).toBe(true);
    expect(posts[1].keepName === undefined).toBe(true);
    if (savedFetch !== undefined) global.window.fetch = savedFetch; else delete global.window.fetch;
  });

  test('server: keepName の保存は図種が替わっても同じ名前に書き、renamedFrom を返さない', function() {
    var projectRoot = path.resolve(__dirname, '..');
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-keep-'));
    var SEQ = '@startuml\\nparticipant Drv\\nDrv -> HW: init\\n@enduml';
    var STATE = '@startuml\\n[*] --> Idle\\nIdle --> Run\\n@enduml';
    var script = [
      'import importlib.util, json, threading, urllib.request',
      'spec = importlib.util.spec_from_file_location("puaserver", r"' + path.join(projectRoot, 'server.py') + '")',
      'srv = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(srv)',
      'class H(srv.Handler):',
      '    def log_message(self, *a): pass',
      'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
      'server.daemon_threads = True',
      'threading.Thread(target=server.serve_forever, daemon=True).start()',
      'base = "http://127.0.0.1:%d" % server.server_address[1]',
      'def post(p):',
      '    req = urllib.request.Request(base + "/autosave", data=json.dumps(p).encode(), headers={"Content-Type": "application/json"})',
      '    return json.loads(urllib.request.urlopen(req, timeout=10).read())',
      'd = r"' + dir + '"',
      'out = [post({"type": "diagram2", "dsl": "' + SEQ + '", "dir": d}),',
      '       post({"type": "diagram2", "dsl": "' + STATE + '", "dir": d, "keepName": True}),',
      '       post({"type": "diagram3", "dsl": "' + SEQ + '", "dir": d}),',
      '       post({"type": "diagram3", "dsl": "' + STATE + '", "dir": d})]',
      'server.shutdown()',
      'print(json.dumps([[o.get("savedAs"), o.get("renamedFrom")] for o in out]))',
    ].join('\n');
    var got = JSON.parse(execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim());
    // keepName: 同じ名前のまま / 付けない保存は今までどおり {名前}_{図種} へ回る
    expect(got).toEqual([['diagram2', null], ['diagram2', null], ['diagram3', null], ['diagram3_state', 'diagram3']]);
    expect(fs.readFileSync(path.join(dir, 'diagram2.puml'), 'utf8')).toContain('Idle --> Run');
  });
});

global.window = prevWindow;
global.document = prevDocument;
