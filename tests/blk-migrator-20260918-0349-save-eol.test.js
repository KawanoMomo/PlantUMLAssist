'use strict';
// BLK-migrator-20260918-0349: 元が LF の .puml を開いて保存フォルダへ保存すると、
// 保存先が CRLF になり元とバイト単位で一致しなかった。原因は server の書き込みが
// テキストモードの既定 (Windows では \n → \r\n) だったこと。
//   - client は開いたときの改行 ('lf' / 'crlf') を /autosave の body に載せる
//   - server はその改行でそのまま書く。付いていなければこれまでどおり
// 本文は常に LF で運ぶ (控え・版・hash の比較を CRLF で壊さない)。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// ── client 側 (workspace.saveToFile の body) ────────────────────────────────
if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
if (!global.window.localStorage) {
  let store = {};
  Object.defineProperty(global.window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { store = {}; },
      key: (i) => Object.keys(store)[i] || null,
      get length() { return Object.keys(store).length; },
    },
  });
}
['../src/core/regex-parts.js', '../src/core/parser-utils.js', '../src/core/workspace.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
const ws = global.window.MA.workspace;

function bodyOf(doc) {
  let body = null;
  global.window.fetch = function(url, opt) { body = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
  ws.saveToFile(doc, './d');
  return body;
}

describe('保存フォルダへ書くとき、開いたときの改行を一緒に送る', function() {
  test('元が LF の図は eol: lf を載せる', function() {
    expect(bodyOf({ name: 'A', dsl: 'x\ny', eol: 'lf' }).eol).toBe('lf');
  });
  test('元が CRLF の図は eol: crlf を載せる', function() {
    expect(bodyOf({ name: 'A', dsl: 'x\ny', eol: 'crlf' }).eol).toBe('crlf');
  });
  test('開いた元を持たない図には載せない (server の既定のまま)', function() {
    expect(bodyOf({ name: 'A', dsl: 'x\ny' }).eol).toBe(undefined);
    expect(bodyOf({ name: 'A', dsl: 'x\ny', eol: 'mac' }).eol).toBe(undefined);
  });
  test('本文は LF のまま運ぶ (改行を二重に書き換えない)', function() {
    expect(bodyOf({ name: 'A', dsl: 'x\ny', eol: 'crlf' }).dsl).toBe('x\ny');
  });
});

// ── server 側 (/autosave が書いたバイト列) ─────────────────────────────────
function runPython(body) {
  const script = [
    'import importlib.util, json, shutil, tempfile, threading, urllib.request, urllib.parse',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'port = server.server_address[1]',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % port',
    'tmp = tempfile.mkdtemp()',
    'import pathlib',
    'def post(payload):',
    '    payload = dict(payload, dir=tmp)',
    '    req = urllib.request.Request(base + "/autosave", data=json.dumps(payload).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    urllib.request.urlopen(req, timeout=10).read()',
    'def raw(name):',
    '    return pathlib.Path(tmp, name + ".puml").read_bytes()',
  ].concat(body).concat([
    'server.shutdown()',
    'shutil.rmtree(tmp, ignore_errors=True)',
  ]).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

describe('/autosave は指定された改行でそのまま書く', function() {
  test('eol: lf なら LF のまま書く (元が LF のファイルが CRLF にならない)', function() {
    const out = runPython([
      'post({"type": "A", "dsl": "@startuml\\ncomponent \\"A\\" as A\\n@enduml\\n", "eol": "lf"})',
      'print(raw("A").decode("utf-8").count("\\r"))',
    ]);
    expect(out).toBe('0');
  });
  test('eol: crlf なら CRLF で書く', function() {
    const out = runPython([
      'post({"type": "B", "dsl": "@startuml\\n@enduml\\n", "eol": "crlf"})',
      'b = raw("B")',
      'print(b.count(b"\\r\\n"), b.count(b"\\r\\r"))',
    ]);
    expect(out).toBe('2 0');
  });
  test('本文が CRLF で届いても \\r\\r\\n にしない', function() {
    const out = runPython([
      'post({"type": "C", "dsl": "@startuml\\r\\n@enduml\\r\\n", "eol": "crlf"})',
      'b = raw("C")',
      'print(b.count(b"\\r\\n"), b.count(b"\\r\\r"))',
    ]);
    expect(out).toBe('2 0');
  });
  test('LF で書いた図は読み直しても本文が変わらない', function() {
    const out = runPython([
      'post({"type": "D", "dsl": "@startuml\\nA --> B\\n@enduml\\n", "eol": "lf"})',
      'print(raw("D").decode("utf-8") == "@startuml\\nA --> B\\n@enduml\\n")',
    ]);
    expect(out).toBe('True');
  });
});
