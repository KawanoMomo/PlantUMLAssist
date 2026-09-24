'use strict';
// BLK-human-20260925-0352 / BLK-owner-20260925-0312-2
// 左レールの図種を押すと、書きかけの図の本文が別の図種の見本に差し替わり (ファイル名はそのまま)、
// ＋ で開いただけのタブが `@startuml / @enduml` だけの .puml として書かれ、次に図種を替えると
// `{名前}_{図種}.puml` が別に増えていた。ここで守るのは
//   (1) 自動保存は見本・白紙のままの本文をディスクへ書かない (書き先の門に本文が届く)
//   (2) 状態バーが「見本のまま」を言い分ける
//   (3) server は白紙・骨だけのファイルを図種違いとして別名へ回さない
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
var jsdom = require('jsdom');

const projectRoot = path.resolve(__dirname, '..');

var prevWindow = global.window;
var prevDocument = global.document;
var depPaths = ['../src/core/auto-save.js', '../src/core/autosave-status.js', '../src/core/blank-doc.js'];
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
(function() {
  var store = {};
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
    __reset: function() { store = {}; },
  } });
})();
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var as = global.window.MA.autoSave;
var AST = global.window.MA.autosaveStatus;
var BD = global.window.MA.blankDoc;

describe('自動保存: 見本・白紙のままの本文はディスクへ書かない', function() {
  var posts;
  beforeEach(function() {
    global.window.localStorage.__reset();
    posts = [];
    global.window.fetch = function(url, opts) {
      if (opts && opts.method === 'POST' && url === '/autosave') posts.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
    };
    as.setFileGuard(null);
    as.setConfig({ backend: 'file', fileDir: '/test' });
    // app.js の解決器と同じ判定: 本文が白紙・骨だけなら書かない。
    as.setFileNameResolver(function(type, dsl) {
      if (typeof dsl === 'string' && BD.isUntouched(dsl, '', type)) return { name: '', reason: 'untouched' };
      return 'diagram8';
    });
  });

  test('書き先の門に図種と本文の両方が届く', function() {
    var seen = [];
    as.setFileNameResolver(function(type, dsl) { seen.push([type, dsl]); return 'diagram8'; });
    as.scheduleSave('plantuml-state', '@startuml\n[*] --> A\n@enduml');
    as.flush();
    expect(seen).toEqual([['plantuml-state', '@startuml\n[*] --> A\n@enduml']]);
  });

  test('＋ で開いただけの白紙・活動図の骨 (start / stop) は書かない', function() {
    as.scheduleSave('plantuml-component', '@startuml\n@enduml');
    as.flush();
    as.scheduleSave('plantuml-activity', '@startuml\nstart\nstop\n@enduml');
    as.flush();
    expect(posts.length).toBe(0);
    var last = as.getLastWrite();
    expect(last.where).toBe('deferred');
    expect(last.reason).toBe('untouched');
  });

  test('行を 1 本足したら書く', function() {
    as.scheduleSave('plantuml-component', '@startuml\ncomponent A\n@enduml');
    as.flush();
    expect(posts.length).toBe(1);
    expect(posts[0].type).toBe('diagram8');
  });

  test('状態バーは「見本のまま」と言い、未保存の警告 (⚠) にしない', function() {
    var st = AST.describe({ lastSavedAt: 'x', lastSavedType: 'plantuml-state' },
      { where: 'deferred', reason: 'untouched', fileName: null }, 'たった今', 'diagram8', '03:30');
    expect(st.text).toContain('見本のまま');
    expect(st.text).toContain('diagram8.puml');
    expect(st.text).not.toContain('⚠');
    expect(st.pending).toBe(false);
  });
});

function runPython(body) {
  const script = [
    'import importlib.util, json, os, threading, urllib.parse, urllib.request',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim();
}

function postAll(dir, saves) {
  return JSON.parse(runPython([
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'port = server.server_address[1]',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % port',
    `saves = ${JSON.stringify(saves)}`,
    `d = ${JSON.stringify(dir)}`,
    'out = []',
    'for s in saves:',
    '    payload = json.dumps({"type": s[0], "dsl": s[1], "dir": d}).encode()',
    '    req = urllib.request.Request(base + "/autosave", data=payload, headers={"Content-Type": "application/json"})',
    '    out.append(json.loads(urllib.request.urlopen(req, timeout=10).read()))',
    'listing = json.loads(urllib.request.urlopen(base + "/autosave?dir=" + urllib.parse.quote(d), timeout=10).read())',
    'server.shutdown()',
    'print(json.dumps({"saves": out, "files": listing["files"]}))',
  ]));
}

describe('server: 白紙・骨だけのファイルは図種違いの別名へ回さない', () => {
  test('is_skeleton_dsl は blankDoc.isBlank と同じ線を引く', () => {
    const samples = [
      '@startuml\n@enduml',
      '@startuml\n\' memo\n\n@enduml',
      '@startuml\nstart\nstop\n@enduml',
      '@startuml\nstart\n:do;\nstop\n@enduml',
      '@startuml\ncomponent A\n@enduml',
      '',
    ];
    const out = JSON.parse(runPython([`print(json.dumps([srv.is_skeleton_dsl(x) for x in ${JSON.stringify(samples)}]))`]));
    expect(out).toEqual([true, true, true, false, false, true]);
    expect(samples.map((s) => BD.isBlank(s, 'plantuml-activity'))).toEqual(out);
  });

  test('活動図の骨 (start / stop) の diagram8.puml にコンポーネント図を書くと、同じ名前に書く', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-skel-'));
    const r = postAll(dir, [
      ['diagram8', '@startuml\nstart\nstop\n@enduml'],
      ['diagram8', '@startuml\ncomponent A\ncomponent B\nA --> B\n@enduml'],
    ]);
    expect(r.saves[1].savedAs).toBe('diagram8');
    expect('renamedFrom' in r.saves[1]).toBe(false);
    expect(r.files).toEqual(['diagram8']);
    expect(fs.readFileSync(path.join(dir, 'diagram8.puml'), 'utf8')).toContain('component A');
  });

  test('中身のある図は従来どおり別名へ回す (BLK-junior-20260908-2003 を変えない)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-skel-'));
    const r = postAll(dir, [
      ['diagram8', '@startuml\nstart\n:do;\nstop\n@enduml'],
      ['diagram8', '@startuml\ncomponent A\n@enduml'],
    ]);
    expect(r.saves[1].savedAs).toBe('diagram8_component');
  });
});

// 後続テストのために window を戻す (auto-save.test.js と同じ作法)。
if (prevWindow !== undefined) global.window = prevWindow; else delete global.window;
if (prevDocument !== undefined) global.document = prevDocument; else delete global.document;
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
