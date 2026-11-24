'use strict';
// TICKET-primary-20261115-2240-wish: 保存先から開いた図の書き出しを保存先の中へ書く。
// 置き場 (保存先の下のフォルダ) の読み書き・書いた結果の言い方 (src/core/export-dest.js) と、
// server の POST /export-file (押した 1 ファイルだけを書く・.puml に触らない・保存先の外へ出ない) を確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try { delete require.cache[require.resolve('../src/core/export-dest.js')]; } catch (e) {}
require('../src/core/export-dest.js');
var ED = global.window.MA.exportDest;

function memStorage() {
  var m = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function(k, v) { m[k] = String(v); },
    removeItem: function(k) { delete m[k]; },
    _m: m,
  };
}

describe('exportDest の置き場', function() {
  test('空は図と同じフォルダ、区切りは / に揃える', function() {
    expect(ED.normSub('')).toBe('');
    expect(ED.normSub(null)).toBe('');
    expect(ED.normSub(' out ')).toBe('out');
    expect(ED.normSub('out\\img/')).toBe('out/img');
  });

  test('保存先の外へ出る・隠しフォルダ・使えない字は使わない', function() {
    expect(ED.normSub('..')).toBeNull();
    expect(ED.normSub('out/../..')).toBeNull();
    expect(ED.normSub('.git')).toBeNull();
    expect(ED.normSub('a:b')).toBeNull();
    expect(ED.normSub('out?')).toBeNull();
  });

  test('置き場は保存先ごとに覚え、空に戻すと記憶を消す', function() {
    var s = memStorage();
    expect(ED.loadSub(s, 'C:/a')).toBe('');
    expect(ED.saveSub(s, 'C:/a', 'out')).toBe('out');
    expect(ED.loadSub(s, 'C:/a')).toBe('out');
    expect(ED.loadSub(s, 'C:/b')).toBe('');
    expect(ED.saveSub(s, 'C:/a', '')).toBe('');
    expect(Object.keys(s._m)).toEqual([]);
    expect(ED.saveSub(s, 'C:/a', '../x')).toBeNull();
    expect(ED.loadSub(s, 'C:/a')).toBe('');
  });

  test('通常の PNG と透過 PNG は別の名前', function() {
    expect(ED.kindOf('svg')).toBe('svg');
    expect(ED.kindOf('png', false)).toBe('png');
    expect(ED.kindOf('png', true)).toBe('png-transparent');
    expect(ED.fileName('hand-seq', 'svg')).toBe('hand-seq.svg');
    expect(ED.fileName('hand-seq', 'png')).toBe('hand-seq.png');
    expect(ED.fileName('hand-seq', 'png-transparent')).toBe('hand-seq.transparent.png');
  });

  test('URL は保存先・名前・種類・置き場を渡す', function() {
    expect(ED.url('C:/w d', 'a b', 'png', 'out')).toBe('/export-file?dir=C%3A%2Fw%20d&name=a%20b&kind=png&sub=out');
    expect(ED.url('C:/w', 'a', 'svg', '..')).toBe('/export-file?dir=C%3A%2Fw&name=a&kind=svg&sub=');
  });

  test('書いた結果は名前・置き場・バイト数・新規 / 上書きを言う', function() {
    var m1 = ED.message({ rel: 'hand-seq.svg', bytes: 1234, existed: false, path: 'C:/w/hand-seq.svg' }, '');
    expect(m1).toBe('書き出しました: hand-seq.svg → 図と同じフォルダ · 1234 バイト · 新規（C:/w/hand-seq.svg）');
    var m2 = ED.message({ rel: 'out/hand-seq.png', bytes: 9, existed: true }, 'out');
    expect(m2).toBe('書き出しました: hand-seq.png → 保存先の「out」フォルダ · 9 バイト · 上書き');
  });
});

// --- server の POST /export-file ---------------------------------------------------------
const projectRoot = path.resolve(__dirname, '..');
const work = path.join(projectRoot, 'test-results', 'unit-export-dest');

function runServer(lines) {
  const script = [
    'import importlib.util, json, threading, urllib.request, urllib.error, urllib.parse',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % server.server_address[1]',
    'def post(q, data):',
    '    req = urllib.request.Request(base + "/export-file?" + urllib.parse.urlencode(q), data=data, method="POST")',
    '    try:',
    '        r = urllib.request.urlopen(req, timeout=10)',
    '        return {"status": r.status, "body": json.loads(r.read())}',
    '    except urllib.error.HTTPError as e:',
    '        return {"status": e.code, "body": json.loads(e.read())}',
    'out = []',
  ].concat(lines, ['server.shutdown()', 'print(json.dumps(out))']).join('\n');
  return JSON.parse(execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim());
}

describe('server POST /export-file', function() {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const puml = Buffer.from('@startuml\r\nA -> B : x\r\n@enduml\r\n');
  fs.writeFileSync(path.join(work, 'd1.puml'), puml);
  const dir = work.replace(/\\/g, '/');
  const res = runServer([
    `d = r"${dir}"`,
    'out.append(post({"dir": d, "name": "d1", "kind": "svg", "sub": ""}, b"<svg>1</svg>"))',
    'out.append(post({"dir": d, "name": "d1", "kind": "svg", "sub": ""}, b"<svg>22</svg>"))',
    'out.append(post({"dir": d, "name": "d1", "kind": "png", "sub": ""}, b"PNG"))',
    'out.append(post({"dir": d, "name": "d1", "kind": "png-transparent", "sub": "out"}, b"PNGT"))',
    'out.append(post({"dir": d, "name": "nofile", "kind": "svg", "sub": ""}, b"<svg/>"))',
    'out.append(post({"dir": d, "name": "d1", "kind": "svg", "sub": "../escape"}, b"<svg/>"))',
    'out.append(post({"dir": d, "name": "d1", "kind": "exe", "sub": ""}, b"x"))',
  ]);

  test('図と同じフォルダに図の名前で書き、バイト数と新規を返す', function() {
    expect(res[0].status).toBe(200);
    expect(res[0].body.rel).toBe('d1.svg');
    expect(res[0].body.bytes).toBe(12);
    expect(res[0].body.existed).toBe(false);
  });

  test('同じ図をもう一度書き出すと同じ名前を上書きし、上書きと返す', function() {
    expect(res[1].status).toBe(200);
    expect(res[1].body.existed).toBe(true);
    expect(fs.readFileSync(path.join(work, 'd1.svg'), 'utf8')).toBe('<svg>22</svg>');
  });

  test('通常の PNG と透過 PNG は別の名前、置き場は保存先の下のフォルダ', function() {
    expect(res[2].body.rel).toBe('d1.png');
    expect(res[3].body.rel).toBe('out/d1.transparent.png');
    expect(fs.readFileSync(path.join(work, 'out', 'd1.transparent.png'), 'utf8')).toBe('PNGT');
  });

  test('保存先に無い図はダウンロードへ戻す (404 + fallback)', function() {
    expect(res[4].status).toBe(404);
    expect(res[4].body.fallback).toBe(true);
    expect(fs.existsSync(path.join(work, 'nofile.svg'))).toBe(false);
  });

  test('保存先の外へは書かない・知らない種類は書かない', function() {
    expect(res[5].status).toBe(400);
    expect(fs.existsSync(path.join(work, '..', 'escape'))).toBe(false);
    expect(res[6].status).toBe(400);
  });

  test('.puml は 1 バイトも変わらず、増えたのは押した書き出しだけ', function() {
    expect(Buffer.compare(fs.readFileSync(path.join(work, 'd1.puml')), puml)).toBe(0);
    expect(fs.readdirSync(work).sort()).toEqual(['d1.png', 'd1.puml', 'd1.svg', 'out']);
    expect(fs.readdirSync(path.join(work, 'out'))).toEqual(['d1.transparent.png']);
  });

  test('書き込みの窓口は _fs_lock の中で呼ばれる', function() {
    const src = fs.readFileSync(path.join(projectRoot, 'server.py'), 'utf8').replace(/\r\n/g, '\n');
    expect(/with _fs_lock:\n\s*return self\._handle_export_file_post\(\)/.test(src)).toBe(true);
  });
});
