'use strict';
// TICKET-junior-20261122-1520-wish: 書き出した SVG / PNG が、保存後に直した本文 (.puml) より古いかを
// Export ▾ の「書き出し先:」の行に語で出す。言い方 (src/core/export-dest.js) と、
// server の GET /export-file (ディスクの更新時刻だけで判定する・読むだけで保存先に何も書かない) を確かめる。
// 実マウスの確かめは tests/scenarios/junior-2-s4.spec.js。
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

describe('exportDest: 古い書き出しの言い方', function() {
  test('古いものが無ければ何も言わない', function() {
    expect(ED.staleLabel(null)).toBe('');
    expect(ED.staleLabel({ ok: false, exports: [] })).toBe('');
    expect(ED.staleLabel({ ok: true, exports: [
      { kind: 'svg', exists: true, stale: false },
      { kind: 'png', exists: false, stale: false },
    ] })).toBe('');
  });
  test('古い種類だけを SVG · PNG · PNG（透過背景）の順に言う', function() {
    expect(ED.staleLabel({ ok: true, exports: [
      { kind: 'png', exists: true, stale: true },
      { kind: 'svg', exists: true, stale: true },
      { kind: 'png-transparent', exists: true, stale: false },
    ] })).toBe('SVG · PNG は保存後に直した本文より古い');
    expect(ED.staleLabel({ ok: true, exports: [{ kind: 'png-transparent', exists: true, stale: true }] }))
      .toBe('PNG（透過背景） は保存後に直した本文より古い');
  });
  test('無いファイル・知らない種類は数えない', function() {
    expect(ED.staleKinds({ ok: true, exports: [
      { kind: 'svg', exists: false, stale: true },
      { kind: 'exe', exists: true, stale: true },
    ] })).toEqual([]);
  });
  test('問い合わせの URL は dir / name / sub だけ (kind を持たない GET)', function() {
    expect(ED.statusUrl('E:/w', 'a b', 'out\\img')).toBe('/export-file?dir=E%3A%2Fw&name=a%20b&sub=out%2Fimg');
    expect(ED.statusUrl('E:/w', 'd1', '..')).toBe('/export-file?dir=E%3A%2Fw&name=d1&sub=');
  });
});

// --- server の GET /export-file -----------------------------------------------------------
const projectRoot = path.resolve(__dirname, '..');
const work = path.join(projectRoot, 'test-results', 'unit-export-stale');

function runServer(lines) {
  const script = [
    'import importlib.util, json, os, threading, time, urllib.request, urllib.error, urllib.parse',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % server.server_address[1]',
    'def get(q):',
    '    r = urllib.request.urlopen(base + "/export-file?" + urllib.parse.urlencode(q), timeout=10)',
    '    return {"status": r.status, "body": json.loads(r.read())}',
    'def listing(d):',
    '    out = {}',
    '    for root, dirs, files in os.walk(d):',
    '        for f in files:',
    '            p = os.path.join(root, f)',
    '            out[os.path.relpath(p, d)] = os.stat(p).st_mtime_ns',
    '    return out',
    'out = []',
  ].concat(lines, ['server.shutdown()', 'print(json.dumps(out))']).join('\n');
  return JSON.parse(execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim());
}

function byKind(body) {
  const m = {};
  (body.exports || []).forEach(function(e) { m[e.kind] = e; });
  return m;
}

describe('server GET /export-file (古いかを答える・読むだけ)', function() {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'out'), { recursive: true });
  const dir = work.replace(/\\/g, '/');
  // .puml (新しい) / svg (古い) / png (新しい) / out の透過 png (古い)。更新時刻は os.utime で決める。
  fs.writeFileSync(path.join(work, 'd1.puml'), '@startuml\nA -> B\n@enduml\n');
  fs.writeFileSync(path.join(work, 'd1.svg'), '<svg/>');
  fs.writeFileSync(path.join(work, 'd1.png'), 'PNG');
  fs.writeFileSync(path.join(work, 'out', 'd1.transparent.png'), 'PNGT');
  const res = runServer([
    `d = r"${dir}"`,
    'os.utime(os.path.join(d, "d1.svg"), (1000, 1000))',
    'os.utime(os.path.join(d, "d1.puml"), (2000, 2000))',
    'os.utime(os.path.join(d, "d1.png"), (3000, 3000))',
    'os.utime(os.path.join(d, "out", "d1.transparent.png"), (1500, 1500))',
    'before = listing(d)',
    'out.append(get({"dir": d, "name": "d1", "sub": ""}))',
    'out.append(get({"dir": d, "name": "d1", "sub": "out"}))',
    'out.append(get({"dir": d, "name": "nofile", "sub": ""}))',
    'out.append(get({"dir": d, "name": "d1", "sub": "../escape"}))',
    'out.append(get({"dir": "", "name": "d1", "sub": ""}))',
    'out.append({"same": listing(d) == before})',
  ]);

  test('図と同じフォルダ: .puml より前の SVG は古い、後の PNG は古くない、無い透過 PNG は無い', function() {
    expect(res[0].status).toBe(200);
    expect(res[0].body.ok).toBe(true);
    const k = byKind(res[0].body);
    expect(k.svg).toEqual({ kind: 'svg', rel: 'd1.svg', exists: true, stale: true });
    expect(k.png).toEqual({ kind: 'png', rel: 'd1.png', exists: true, stale: false });
    expect(k['png-transparent'].exists).toBe(false);
    expect(k['png-transparent'].stale).toBe(false);
    expect(ED.staleLabel(res[0].body)).toBe('SVG は保存後に直した本文より古い');
  });
  test('置き場 (sub) の書き出しを .puml と比べる', function() {
    const k = byKind(res[1].body);
    expect(k['png-transparent']).toEqual({ kind: 'png-transparent', rel: 'out/d1.transparent.png', exists: true, stale: true });
    expect(k.svg.exists).toBe(false);
  });
  test('.puml の無い図・保存先の外・保存先の無い問い合わせは答えない (ok: false)', function() {
    expect(res[2].body).toEqual({ ok: false, exports: [] });
    expect(res[3].body).toEqual({ ok: false, exports: [] });
    expect(res[4].body).toEqual({ ok: false, exports: [] });
  });
  test('問い合わせで保存先に何も書かない (ファイルの数も更新時刻も変わらない)', function() {
    expect(res[5].same).toBe(true);
  });
});
