'use strict';
// TICKET-owner-20261115-1827-1: 保存先 (利用者の Git 作業木) には .puml だけを書く。
// 図種の控え (_kinds.json)・最後の保存 (_meta.json)・版の控え (_versions/) は設定の置き場
// (DATA_ROOT/folders/<保存先ごと>) に持つ。保存先に前からある控えは読めるまま、消さない・動かさない。
// 実際に server を起こして、保存・上書き・版の一覧を通して確かめる。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, shutil, tempfile, threading, urllib.request, urllib.parse',
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
    '    req = urllib.request.Request(base + "/autosave", data=json.dumps(payload).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))',
    'def get(route):',
    '    return json.loads(urllib.request.urlopen(base + route, timeout=10).read().decode("utf-8"))',
    'q = urllib.parse.quote(tmp)',
    'def files(d):',
    '    out = []',
    '    for root, dirs, fs in os.walk(d):',
    '        for f in fs:',
    '            out.append(os.path.relpath(os.path.join(root, f), d).replace(os.sep, "/"))',
    '    return sorted(out)',
  ].concat(body).concat([
    'server.shutdown()',
    'shutil.rmtree(str(srv.folder_state_dir(tmp)), ignore_errors=True)',
    'shutil.rmtree(tmp, ignore_errors=True)',
  ]).join('\n');
  return JSON.parse(execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim());
}

describe('TICKET-owner-20261115-1827-1 保存先には .puml だけを書く', () => {
  test('保存・上書き・上書きを繰り返しても、保存先のファイルは .puml 1 枚だけ', () => {
    const out = runPython([
      'post({"type": "seq-1", "dsl": "@startuml\\nA -> B : x\\n@enduml\\n", "dir": tmp, "kind": "sequence"})',
      'post({"type": "seq-1", "dsl": "@startuml\\nA -> B : x\\nB -> A : y\\n@enduml\\n", "dir": tmp, "kind": "sequence"})',
      'post({"type": "seq-1", "dsl": "@startuml\\nA -> B : x\\n@enduml\\n", "dir": tmp, "kind": "sequence"})',
      'vs = get("/autosave-versions?dir=" + q + "&type=seq-1")',
      'lst = get("/autosave?dir=" + q)',
      'state = files(str(srv.folder_state_dir(tmp)))',
      'print(json.dumps({"saveDir": files(tmp), "versions": len(vs.get("versions", [])),',
      '                  "kinds": lst.get("kinds"), "state": state}))',
    ]);
    expect(out.saveDir).toEqual(['seq-1.puml']);
    // 版の控えも図種も、設定の置き場の側にあって今までどおり読める。
    expect(out.versions).toBe(2);
    expect(out.kinds).toEqual({ 'seq-1': 'sequence' });
    expect(out.state).toContain('_kinds.json');
    expect(out.state).toContain('_meta.json');
    expect(out.state.filter((f) => f.indexOf('_versions/seq-1--') === 0).length).toBe(2);
  });

  test('保存先に前からある控えは読めるまま、足さず・消さず・動かさない', () => {
    const out = runPython([
      'os.makedirs(os.path.join(tmp, "_versions"))',
      'open(os.path.join(tmp, "_versions", "a--20260101-000000.puml"), "w", encoding="utf-8").write("@startuml\\nclass Old\\n@enduml\\n")',
      'open(os.path.join(tmp, "_kinds.json"), "w", encoding="utf-8").write(json.dumps({"kinds": {"a": "class"}}))',
      'open(os.path.join(tmp, "a.puml"), "w", encoding="utf-8").write("@startuml\\nclass V1\\n@enduml\\n")',
      'before = files(tmp)',
      'post({"type": "a", "dsl": "@startuml\\nclass V2\\n@enduml\\n", "dir": tmp})',
      'vs = get("/autosave-versions?dir=" + q + "&type=a")',
      'old = urllib.request.urlopen(base + "/autosave-versions?dir=" + q + "&type=a&stamp=20260101-000000", timeout=10).read().decode("utf-8")',
      'lst = get("/autosave?dir=" + q)',
      'print(json.dumps({"before": before, "after": files(tmp), "versions": len(vs.get("versions", [])),',
      '                  "old": old, "kinds": lst.get("kinds"),',
      '                  "legacyKinds": open(os.path.join(tmp, "_kinds.json"), encoding="utf-8").read()}))',
    ]);
    expect(out.after).toEqual(out.before);
    // 前からある版 1 つ + 上書きで控えた V1 の版 1 つ。
    expect(out.versions).toBe(2);
    expect(out.old).toContain('class Old');
    expect(out.kinds).toEqual({ a: 'class' });
    expect(JSON.parse(out.legacyKinds)).toEqual({ kinds: { a: 'class' } });
  });
});
