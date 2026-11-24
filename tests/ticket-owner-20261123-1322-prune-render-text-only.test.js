'use strict';
// TICKET-owner-20261123-1322-prune: POST /render の入力の名前は text の 1 つだけ。
// 別名 (dsl / source / uml / puml / diagram) の受理、それを知らせる X-PlantUMLAssist-Warning ヘッダ、
// GET /render の仕様の aliases 欄を外した。text が無い body は 400 で、text と受け取ったフィールドを名指しする。
// 実際に server を起こして確かめる (jar か Java が無い機械では 200 の描画の段を飛ばす)。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function runPython(withRender) {
  const script = [
    'import importlib.util, json, threading, urllib.request, urllib.error',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(ROOT, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'base = "http://127.0.0.1:%d" % server.server_address[1]',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'def post(body):',
    '    req = urllib.request.Request(base + "/render", data=json.dumps(body).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    try:',
    '        r = urllib.request.urlopen(req, timeout=120)',
    '        return r.status, dict((k.lower(), v) for k, v in r.headers.items()), r.read()',
    '    except urllib.error.HTTPError as e:',
    '        return e.code, dict((k.lower(), v) for k, v in e.headers.items()), e.read()',
    'DSL = "@startuml\\nA -> B : hi\\n@enduml\\n"',
    'out = {}',
    'doc = json.loads(urllib.request.urlopen(base + "/render", timeout=10).read())',
    'out["docRequestKeys"] = sorted(doc["request"].keys())',
    'out["docFields"] = sorted(doc["request"]["fields"].keys())',
    'out["docText"] = json.dumps(doc, ensure_ascii=False)',
    'for name in ("dsl", "source", "uml", "puml", "diagram"):',
    '    s, h, b = post({name: DSL})',
    '    out["alias_" + name] = [s, json.loads(b)["error"], "x-plantumlassist-warning" in h]',
    's, h, b = post({"text": ""})',
    'out["empty"] = [s, json.loads(b)["error"]]',
    's, h, b = post({"text": 5})',
    'out["notstr"] = [s, json.loads(b)["error"]]',
    'if ' + (withRender ? 'True' : 'False') + ':',
    '    s, h, b = post({"text": DSL})',
    '    out["ok"] = [s, h.get("content-type"), "x-plantumlassist-warning" in h, b"<svg" in b]',
    'server.shutdown()',
    'srv._shutdown_daemon()',
    'print("OUT" + json.dumps(out, ensure_ascii=True))',
  ].join('\n');
  const raw = execFileSync('python', ['-c', script], { cwd: ROOT, encoding: 'utf8', timeout: 150000 });
  const line = raw.split(/\r?\n/).filter((l) => l.indexOf('OUT') === 0).pop();
  return JSON.parse(line.slice(3));
}

const hasJar = fs.existsSync(path.join(ROOT, 'lib', 'plantuml.jar'));
let javaOk = true;
try { execFileSync('java', ['-version'], { stdio: 'ignore', timeout: 20000 }); } catch (e) { javaOk = false; }

describe('TICKET-owner-20261123-1322-prune POST /render は text だけを受ける', () => {
  const out = runPython(hasJar && javaOk);

  test('別名 (dsl ほか 4 つ) は 400 で、text と受け取ったフィールドを名指しし、warning ヘッダは無い', () => {
    ['dsl', 'source', 'uml', 'puml', 'diagram'].forEach((name) => {
      const r = out['alias_' + name];
      expect(r[0]).toBe(400);
      expect(r[1]).toContain("required field 'text' is missing");
      expect(r[1]).toContain('受け取ったフィールド: ' + name);
      expect(r[1]).toContain('GET /render で仕様を返します');
      expect(r[2]).toBe(false);
    });
  });

  test('text の空・文字列でないは今までどおり 400', () => {
    expect(out.empty[0]).toBe(400);
    expect(out.empty[1]).toContain("'text' is empty");
    expect(out.notstr[0]).toBe(400);
    expect(out.notstr[1]).toContain("'text' must be a string");
  });

  test('GET /render の仕様に aliases が無く、text / mode / dir が並ぶ', () => {
    expect(out.docRequestKeys).not.toContain('aliases');
    expect(out.docFields).toEqual(['dir', 'mode', 'text']);
    expect(out.docText).not.toContain('aliases');
    expect(out.docText).not.toContain('X-PlantUMLAssist-Warning');
    expect(out.docText).not.toContain('別名');
  });

  if (hasJar && javaOk) {
    test('{ text } は 200 の SVG で、X-PlantUMLAssist-Warning ヘッダは無い', () => {
      expect(out.ok[0]).toBe(200);
      expect(out.ok[1]).toBe('image/svg+xml');
      expect(out.ok[2]).toBe(false);
      expect(out.ok[3]).toBe(true);
    });
  }

  test('server.py と docs/api.md に別名の痕跡が無い', () => {
    ['server.py', path.join('docs', 'api.md')].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).not.toContain('DSL_FIELD_ALIASES');
      expect(src).not.toContain('X-PlantUMLAssist-Warning');
      expect(src).not.toContain('aliases');
    });
  });
});
