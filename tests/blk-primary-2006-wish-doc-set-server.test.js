'use strict';
// BLK-primary-20260914-2006-wish: 資料セットは保存フォルダ (_sets/sets.json) の持ち物。
// タブの状態でも localStorage でもないことを、実際に server を起こして確かめる。
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
    '    req = urllib.request.Request(base + "/doc-sets", data=json.dumps(payload).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))',
    'def get():',
    '    url = base + "/doc-sets?dir=" + urllib.parse.quote(tmp)',
    '    return json.loads(urllib.request.urlopen(url, timeout=10).read().decode("utf-8"))',
    'def delete(name):',
    '    url = base + "/doc-sets?dir=" + urllib.parse.quote(tmp) + "&name=" + urllib.parse.quote(name)',
    '    req = urllib.request.Request(url, method="DELETE")',
    '    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))',
  ].concat(body).concat([
    'server.shutdown()',
    'shutil.rmtree(tmp, ignore_errors=True)',
  ]).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

describe('POST/GET/DELETE /doc-sets', function() {

  test('登録した資料セットは GET で 14 枚のまま読み直せる (タブを開かなくても残る)', function() {
    const out = runPython([
      'names = ["d%02d" % i for i in range(14)]',
      'post({"dir": tmp, "name": "顧客資料", "docs": names})',
      'sets = get()["sets"]',
      'print(json.dumps([len(sets), sets[0]["name"], len(sets[0]["docs"]), sets[0]["docs"][0]]))',
    ]);
    expect(JSON.parse(out)).toEqual([1, '顧客資料', 14, 'd00']);
  });

  test('同じ名前で登録し直すと置き換わり、1 行のまま先頭に上がる', function() {
    const out = runPython([
      'post({"dir": tmp, "name": "顧客資料", "docs": ["a"]})',
      'post({"dir": tmp, "name": "社内", "docs": ["b"]})',
      'post({"dir": tmp, "name": "顧客資料", "docs": ["a", "b", "c"]})',
      'sets = get()["sets"]',
      'print(json.dumps([len(sets), [s["name"] for s in sets], len(sets[0]["docs"])]))',
    ]);
    expect(JSON.parse(out)).toEqual([2, ['顧客資料', '社内'], 3]);
  });

  test('図が 0 枚のセットは 400 で作らせない (また 0 枚の zip が出る道を塞ぐ)', function() {
    const out = runPython([
      'code = 0',
      'try:',
      '    post({"dir": tmp, "name": "空", "docs": []})',
      'except urllib.error.HTTPError as e:',
      '    code = e.code',
      'print(json.dumps([code, len(get()["sets"])]))',
    ]);
    expect(JSON.parse(out)).toEqual([400, 0]);
  });

  test('名前が空の要求は 400 で、フォルダには何も書かない', function() {
    const out = runPython([
      'code = 0',
      'try:',
      '    post({"dir": tmp, "name": "   ", "docs": ["a"]})',
      'except urllib.error.HTTPError as e:',
      '    code = e.code',
      'print(json.dumps([code, len(get()["sets"])]))',
    ]);
    expect(JSON.parse(out)).toEqual([400, 0]);
  });

  test('DELETE は名前の合うセットだけを消す', function() {
    const out = runPython([
      'post({"dir": tmp, "name": "顧客資料", "docs": ["a"]})',
      'post({"dir": tmp, "name": "社内", "docs": ["b"]})',
      'left = delete("顧客資料")["sets"]',
      'print(json.dumps([[s["name"] for s in left], [s["name"] for s in get()["sets"]]]))',
    ]);
    expect(JSON.parse(out)).toEqual([['社内'], ['社内']]);
  });

  test('一度も登録していないフォルダは空の一覧を返す (404 にしない)', function() {
    const out = runPython(['print(json.dumps(get()["sets"]))']);
    expect(JSON.parse(out)).toEqual([]);
  });

  test('重複した図名は 1 枚に畳まれる (枚数が実体と食い違わない)', function() {
    const out = runPython([
      'post({"dir": tmp, "name": "s", "docs": ["a", "b", "a", "", "b"]})',
      'print(json.dumps(get()["sets"][0]["docs"]))',
    ]);
    expect(JSON.parse(out)).toEqual(['a', 'b']);
  });
});
