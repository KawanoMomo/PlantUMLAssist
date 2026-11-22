'use strict';
// BLK-primary-20260914-1306-friction: 組は保存フォルダごとの持ち物。
// ブラウザを変えても残ること・同じ組が 1 行にまとまることを、実際に server を
// 起こして確かめる。
// TICKET-owner-20261122-2322-2: 置き場は保存先ではなく設定の置き場 (folder_state_dir(保存先)/_renames/pairs.json)。
// 保存先には何も書かず、前に保存先へ書いた _renames/pairs.json は読むだけ。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, shutil, tempfile, threading, urllib.request, urllib.parse, urllib.error',
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
    '    req = urllib.request.Request(base + "/rename-pairs", data=json.dumps(payload).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))',
    'def get():',
    '    url = base + "/rename-pairs?dir=" + urllib.parse.quote(tmp)',
    '    return json.loads(urllib.request.urlopen(url, timeout=10).read().decode("utf-8"))',
    'import os',
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
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

describe('POST/GET /rename-pairs', function() {

  test('ヒット 0 件の組でも残り、GET で読み直せる', function() {
    const out = runPython([
      'post({"dir": tmp, "from": "SpiDrv", "to": "Spi_Driver", "hits": 0})',
      'rows = get()["pairs"]',
      'print(json.dumps([len(rows), rows[0]["from"], rows[0]["to"], rows[0]["hits"]]))',
    ]);
    expect(JSON.parse(out)).toEqual([1, 'SpiDrv', 'Spi_Driver', 0]);
  });

  test('同じ組を打ち直しても 1 行のまま、先頭に上がる', function() {
    const out = runPython([
      'post({"dir": tmp, "from": "SpiDrv", "to": "Spi_Driver", "hits": 0})',
      'post({"dir": tmp, "from": "CanDrv", "to": "Can_Driver", "hits": 3})',
      'post({"dir": tmp, "from": "SpiDrv", "to": "Spi_Driver", "hits": 0})',
      'rows = get()["pairs"]',
      'print(json.dumps([len(rows), [r["from"] for r in rows]]))',
    ]);
    expect(JSON.parse(out)).toEqual([2, ['SpiDrv', 'CanDrv']]);
  });

  test('from / to が空の要求は 400 で、フォルダには何も書かない', function() {
    const out = runPython([
      'code = 0',
      'try:',
      '    post({"dir": tmp, "from": "", "to": "Spi_Driver"})',
      'except urllib.error.HTTPError as e:',
      '    code = e.code',
      'print(json.dumps([code, len(get()["pairs"])]))',
    ]);
    expect(JSON.parse(out)).toEqual([400, 0]);
  });

  test('一度も打っていないフォルダは空の一覧を返す (404 にしない)', function() {
    const out = runPython([
      'print(json.dumps(get()["pairs"]))',
    ]);
    expect(JSON.parse(out)).toEqual([]);
  });

  // BLK-primary-20260914-1106-friction: 当てた組だけが applied_at を持ち、
  // 当てた後に打っただけの回が来ても当てた日時は消えない。
  test('applied: true の組だけ applied_at を持ち、打ち直しで消えない', function() {
    const out = runPython([
      'post({"dir": tmp, "from": "SpiDrv", "to": "Spi_Driver", "hits": 9, "applied": True})',
      'post({"dir": tmp, "from": "SpiRegs", "to": "Spi_Registers", "hits": 7})',
      'post({"dir": tmp, "from": "SpiDrv", "to": "Spi_Driver", "hits": 0})',
      'rows = {r["from"]: r for r in get()["pairs"]}',
      'print(json.dumps([bool(rows["SpiDrv"].get("applied_at")), "applied_at" in rows["SpiRegs"]]))',
    ]);
    expect(JSON.parse(out)).toEqual([true, false]);
  });

  test('組を覚えても保存先には何も書かず、設定の置き場の _renames/pairs.json に書く (TICKET-owner-20261122-2322-2)', function() {
    const out = runPython([
      'open(os.path.join(tmp, "a.puml"), "w").write("@startuml\\nA -> B\\n@enduml\\n")',
      'post({"dir": tmp, "from": "SpiDrv", "to": "SpiCore", "hits": 7, "applied": True})',
      'print(json.dumps([files(tmp), files(str(srv.folder_state_dir(tmp))), [r["from"] for r in get()["pairs"]]]))',
    ]);
    expect(JSON.parse(out)).toEqual([['a.puml'], ['_renames/pairs.json'], ['SpiDrv']]);
  });

  test('前に保存先へ書いた _renames/pairs.json は読めて、組を足しても中身と mtime を変えず、前の組を引き継ぐ', function() {
    const out = runPython([
      'legacy = os.path.join(tmp, "_renames", "pairs.json")',
      'os.makedirs(os.path.dirname(legacy))',
      'text = json.dumps({"pairs": [{"from": "CanDrv", "to": "Can_Driver", "at": "2026-11-01T09:00:00Z", "hits": 2}]})',
      'open(legacy, "w", encoding="utf-8").write(text)',
      'os.utime(legacy, (1700000000, 1700000000))',
      'first = [r["from"] for r in get()["pairs"]]',
      'post({"dir": tmp, "from": "SpiDrv", "to": "SpiCore", "hits": 7, "applied": True})',
      'second = [r["from"] for r in get()["pairs"]]',
      'print(json.dumps([first, second, open(legacy, encoding="utf-8").read() == text,',
      '                  int(os.path.getmtime(legacy)), files(tmp)]))',
    ]);
    expect(JSON.parse(out)).toEqual([['CanDrv'], ['SpiDrv', 'CanDrv'], true, 1700000000, ['_renames/pairs.json']]);
  });

  test('FILES のツリー (/tree-dir) は保存先の _renames を図のフォルダとして並べない', function() {
    const out = runPython([
      'os.makedirs(os.path.join(tmp, "_renames"))',
      'os.makedirs(os.path.join(tmp, "sub", "deep"))',
      'rows = json.loads(urllib.request.urlopen(base + "/tree-dir?dir=" + urllib.parse.quote(tmp), timeout=10).read().decode("utf-8"))',
      'print(json.dumps(sorted(d["rel"] for d in rows.get("dirs", []))))',
    ]);
    expect(JSON.parse(out)).toEqual(['sub', 'sub/deep']);
  });
});
