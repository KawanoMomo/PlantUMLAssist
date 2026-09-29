'use strict';
// BLK-human-20260925-1250: 保存先の一覧 (FILES ツリー) から開いた LF の .puml を 1 行直して
// 保存すると、全行が CRLF で書き直されていた。一覧から開いた図は client が開いたときの
// 改行 (eol) を知らず、server が Windows の既定の改行で書いていたため。
//   - eol の指定が無い保存は、上書きする相手のファイルの改行を引き継ぐ
//   - 図種が替わって名前を回すときは、元の図の改行を引き継ぐ
//   - 相手が無い新しい図はこれまでどおり (既定の改行)
//   - eol の指定があればそれが優先 (手元から開いた図)
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

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
    '    urllib.request.urlopen(req, timeout=10).read()',
    'def get(name):',
    '    q = urllib.parse.urlencode({"dir": tmp, "type": name})',
    '    return urllib.request.urlopen(base + "/autosave?" + q, timeout=10).read().decode("utf-8")',
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
  }).trim();
}

describe('一覧から開いた図 (eol の指定なし) は元のファイルの改行を保って書く', function() {
  test('LF のファイルを開いて 1 行直して保存しても LF のまま、直した行だけが変わる', function() {
    const out = runPython([
      'orig = b"@startuml\\nclass Same\\nclass Other\\n@enduml\\n"',
      'put("Same_Class", orig)',
      'text = get("Same_Class")',
      'post({"type": "Same_Class", "dsl": text.replace("class Other", "class Other2")})',
      'b = raw("Same_Class")',
      'print(b.count(b"\\r"), b == orig.replace(b"class Other", b"class Other2"))',
    ]);
    expect(out).toBe('0 True');
  });
  test('LF のファイルの無変更保存はバイト一致', function() {
    const out = runPython([
      'orig = b"@startuml\\nA --> B\\n@enduml\\n"',
      'put("A", orig)',
      'post({"type": "A", "dsl": get("A")})',
      'print(raw("A") == orig)',
    ]);
    expect(out).toBe('True');
  });
  test('CRLF のファイルの無変更保存もバイト一致 (\\r\\r\\n にしない)', function() {
    const out = runPython([
      'orig = b"@startuml\\r\\nA --> B\\r\\n@enduml\\r\\n"',
      'put("C", orig)',
      'post({"type": "C", "dsl": get("C")})',
      'print(raw("C") == orig)',
    ]);
    expect(out).toBe('True');
  });
  test('図種が替わって名前を回すときも元の図の改行を引き継ぐ', function() {
    const out = runPython([
      'put("D", b"@startuml\\nclass A\\n@enduml\\n")',
      'post({"type": "D", "dsl": "@startuml\\nactor U\\nU -> S : hi\\n@enduml\\n"})',
      'names = sorted(p.name for p in pathlib.Path(tmp).glob("*.puml"))',
      'print(len(names) >= 1, all(pathlib.Path(tmp, n).read_bytes().count(b"\\r") == 0 for n in names))',
    ]);
    expect(out).toBe('True True');
  });
  test('eol の指定があればそれが優先 (手元から開いた CRLF の図を LF の同名へ書く)', function() {
    const out = runPython([
      'put("E", b"@startuml\\nA --> B\\n@enduml\\n")',
      'post({"type": "E", "dsl": "@startuml\\nA --> B\\n@enduml\\n", "eol": "crlf"})',
      'print(raw("E").count(b"\\r\\n"))',
    ]);
    expect(out).toBe('3');
  });
  test('相手の無い新しい図はこれまでどおり既定の改行で書く', function() {
    const out = runPython([
      'post({"type": "F", "dsl": "@startuml\\nA --> B\\n@enduml\\n"})',
      'print(raw("F") == "@startuml\\nA --> B\\n@enduml\\n".replace("\\n", os.linesep).encode("utf-8"))',
    ]);
    expect(out).toBe('True');
  });
});
