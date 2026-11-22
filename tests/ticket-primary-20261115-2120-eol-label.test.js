'use strict';
// TICKET-primary-20261115-2120-wish: 保存後に改行コード・文字コードが元のまま保たれたかを画面で確かめたい。
// 下端に今のタブのファイルの改行 (LF / CRLF) と文字コード (UTF-8 / UTF-8 BOM / Shift_JIS) の 1 語を出す。
//   - 1 語の組み立て (file-open.formatLabel)
//   - 保存先の図は server が読んだとき (GET の X-Pua-* 見出し) と書いたとき (POST の返り) の値を
//     図の場所ごとに持つ (workspace.fileFormatOf)
//   - 保存先の一覧から開いた BOM 付きの図は本文から BOM が落ちて届くので、server が上書きする相手の
//     BOM を引き継ぐ (無変更保存がバイト一致)
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
// 前の test が置いた jsdom の window は localStorage を読むだけで投げる (opaque origin)。
let hasLs = false;
try { hasLs = !!global.window.localStorage; } catch (e) { hasLs = false; }
if (!hasLs) {
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
['../src/core/regex-parts.js', '../src/core/parser-utils.js', '../src/core/workspace.js', '../src/core/file-open.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
const ws = global.window.MA.workspace;
const FO = global.window.MA.fileOpen;

describe('下端の 1 語 (改行 · 文字コード)', function() {
  test('改行と文字コードをこの順で 1 語にする', function() {
    expect(FO.formatLabel({ eol: 'crlf', encoding: 'utf-8', bom: true })).toBe('CRLF · UTF-8 BOM');
    expect(FO.formatLabel({ eol: 'lf', encoding: 'utf-8', bom: false })).toBe('LF · UTF-8');
    expect(FO.formatLabel({ eol: 'crlf', encoding: 'shift_jis', bom: false })).toBe('CRLF · Shift_JIS');
  });
  test('改行の分からない図 (まだ書いていない新しい図) は何も出さない', function() {
    expect(FO.formatLabel(null)).toBe('');
    expect(FO.formatLabel({ encoding: 'utf-8' })).toBe('');
  });
});

// この runner は test を待たないので、fetch の返りをその場で解ける then に置き換える。
function sync(v) {
  return {
    then: function(ok) { const r = ok ? ok(v) : v; return (r && typeof r.then === 'function') ? r : sync(r); },
    catch: function() { return this; },
  };
}
function fakeResponse(opts) {
  const headers = opts.headers || {};
  return {
    ok: opts.ok !== false,
    status: opts.status || 200,
    headers: { get: (k) => (Object.prototype.hasOwnProperty.call(headers, k) ? headers[k] : null) },
    text: () => sync(opts.text || ''),
    json: () => sync(opts.json || {}),
  };
}

describe('保存先の図の改行・文字コードを図の場所ごとに覚える', function() {
  test('一覧から読んだときの見出しを覚え、別のフォルダの同名の図とは分ける', function() {
    global.window.fetch = function() {
      return sync(fakeResponse({ text: 'x', headers: { 'X-Pua-Eol': 'crlf', 'X-Pua-Encoding': 'utf-8', 'X-Pua-Bom': '1' } }));
    };
    ws.loadFile('hand-class', 'C:\\save\\a');
    expect(ws.fileFormatOf('hand-class', 'c:/save/a/')).toEqual({ eol: 'crlf', encoding: 'utf-8', bom: true });
    expect(ws.fileFormatOf('hand-class', 'C:\\save\\b')).toBe(null);
  });
  test('見出しの無い返り (古い server) は覚えない', function() {
    global.window.fetch = function() { return sync(fakeResponse({ text: 'x' })); };
    ws.loadFile('old-one', './d');
    expect(ws.fileFormatOf('old-one', './d')).toBe(null);
  });
  test('書いたときの返り (savedAs の名前) で置き換える', function() {
    global.window.fetch = function() {
      return sync(fakeResponse({ text: 'x', headers: { 'X-Pua-Eol': 'crlf', 'X-Pua-Encoding': 'utf-8', 'X-Pua-Bom': '1' } }));
    };
    ws.loadFile('lf-one', './d');
    global.window.fetch = function() {
      return sync(fakeResponse({ json: { ok: true, savedAs: 'lf-one', eol: 'lf', encoding: 'utf-8', bom: false } }));
    };
    ws.saveToFile({ id: 'd1', name: 'lf-one', dsl: 'x' }, './d');
    expect(ws.fileFormatOf('lf-one', './d')).toEqual({ eol: 'lf', encoding: 'utf-8', bom: false });
  });
  test('BOM の指定は開いたときの値を載せ、無ければ載せない (server が相手のファイルから引き継ぐ)', function() {
    let body = null;
    global.window.fetch = function(url, opt) { body = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
    ws.saveToFile({ name: 'A', dsl: 'x', eol: 'crlf', bom: true }, './d');
    expect(body.bom).toBe(true);
    ws.saveToFile({ name: 'A', dsl: 'x' }, './d');
    expect(body.bom).toBe(undefined);
  });
  test('下端の枠と、タブを替えたとき・書いたときの描き直しがある', function() {
    const html = fs.readFileSync(path.join(projectRoot, 'plantuml-assist.html'), 'utf8');
    const app = fs.readFileSync(path.join(projectRoot, 'src', 'app.js'), 'utf8');
    expect(/<span id="status-format"[^>]*hidden><\/span>/.test(html)).toBe(true);
    const apply = app.slice(app.indexOf('function applyActiveDoc()'));
    expect(apply.slice(0, apply.indexOf('\n}\n')).indexOf('renderFileFormat()') > 0).toBe(true);
    expect(app).toContain("window.addEventListener('pua:folder-changed', function() {\n  try { renderFileFormat(); }");
  });
});

function runPython(body) {
  const script = [
    'import importlib.util, json, os, shutil, tempfile, threading, urllib.request, urllib.parse, pathlib',
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
    'def post(payload):',
    '    payload = dict(payload, dir=tmp)',
    '    req = urllib.request.Request(base + "/autosave", data=json.dumps(payload).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))',
    'def get(name):',
    '    q = urllib.parse.urlencode({"dir": tmp, "type": name})',
    '    r = urllib.request.urlopen(base + "/autosave?" + q, timeout=10)',
    '    t = r.read().decode("utf-8")',
    '    if t.startswith("\\ufeff"): t = t[1:]',  // fetch の text() と同じく BOM を落として受け取る
    '    return t, r.headers.get("X-Pua-Eol"), r.headers.get("X-Pua-Encoding"), r.headers.get("X-Pua-Bom")',
    'def put(name, b):',
    '    pathlib.Path(tmp, name + ".puml").write_bytes(b)',
    'def raw(name):',
    '    return pathlib.Path(tmp, name + ".puml").read_bytes()',
  ].concat(body).concat([
    'server.shutdown()',
    'shutil.rmtree(tmp, ignore_errors=True)',
  ]).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim().split(/\r?\n/);
}

describe('/autosave は保存先の図の改行・BOM を言い、BOM を保つ', function() {
  const out = runPython([
    'orig = b"\\xef\\xbb\\xbf@startuml\\r\\nclass A\\r\\n@enduml\\r\\n"',
    'put("H", orig)',
    't, e, c, b = get("H")',
    'print(e, c, b)',
    'res = post({"type": "H", "dsl": t})',
    'print(raw("H") == orig, res.get("eol"), res.get("encoding"), res.get("bom"))',
    'res = post({"type": "H", "dsl": t.replace("class A", "class A2")})',
    'print(raw("H") == orig.replace(b"class A", b"class A2"), res.get("eol"), res.get("bom"))',
    'put("L", b"@startuml\\nA --> B\\n@enduml\\n")',
    't, e, c, b = get("L")',
    'print(e, c, b)',
    'res = post({"type": "L", "dsl": t})',
    'print(raw("L") == b"@startuml\\nA --> B\\n@enduml\\n", res.get("eol"), res.get("bom"))',
    'res = post({"type": "N", "dsl": "@startuml\\nA --> B\\n@enduml\\n"})',
    'print(raw("N")[:3] == b"\\xef\\xbb\\xbf", res.get("eol") == ("crlf" if os.linesep == "\\r\\n" else "lf"), res.get("bom"))',
    'th = get("H")[0]',
    'res = post({"type": "H", "dsl": th, "bom": False, "eol": "lf"})',
    'print(raw("H")[:3] == b"\\xef\\xbb\\xbf", res.get("eol"), res.get("bom"))',
  ]);
  test('CRLF・BOM の図を読むと見出しがその値を言う', function() {
    expect(out[0]).toBe('crlf utf-8 1');
  });
  test('一覧から開いた BOM 付きの図の無変更保存はバイト一致 (BOM を落とさない)', function() {
    expect(out[1]).toBe('True crlf utf-8 True');
  });
  test('1 行直した保存も BOM と CRLF を保ち、直した行だけが変わる', function() {
    expect(out[2]).toBe('True crlf True');
  });
  test('LF・BOM 無しの図はその値を言い、そのまま書く', function() {
    expect(out[3]).toBe('lf utf-8 0');
    expect(out[4]).toBe('True lf False');
  });
  test('相手の無い新しい図は BOM を付けず、書いた改行を返す', function() {
    expect(out[5]).toBe('False True False');
  });
  test('BOM・改行の指定があればそれが優先 (手元から開いた図)', function() {
    expect(out[6]).toBe('False lf False');
  });
});
