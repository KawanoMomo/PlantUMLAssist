'use strict';
// BLK-primary-20260914-1306-friction: 組は保存フォルダ (_renames/pairs.json) の持ち物。
// ブラウザを変えても残ること・同じ組が 1 行にまとまることを、実際に server を
// 起こして確かめる。
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
  ].concat(body).concat([
    'server.shutdown()',
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
});
