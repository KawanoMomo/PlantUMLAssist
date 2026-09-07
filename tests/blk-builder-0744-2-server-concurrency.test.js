'use strict';
// BLK-builder-20260908-0744-2-red
// server.py が単スレッドだったため、/render が daemon を掴んでいる間は
// plantuml-assist.html の GET すら順番待ちになり、playwright を --workers=N で
// 回すと「開くのが遅れただけ」の spec がまとめて赤になっていた。
// 1 接続 1 スレッドにしたこと、そしてファイルを読み書きする窓口が
// 排他されていることを、実際に server を起こして確かめる。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, threading, time, urllib.request',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60000,
  }).trim();
}

// 遅い窓口 (/render に見立てた 1.5 秒) を叩いている最中に静的ファイルを取りに行き、
// それが待たされないことを見る。単スレッドなら 1.5 秒待たされる。
const SERVE_SLOW_AND_STATIC = [
  'class H(srv.Handler):',
  '    def do_GET(self):',
  '        if self.path == "/slow":',
  '            time.sleep(1.5)',
  '            self.send_response(204); self.end_headers(); return',
  '        return srv.Handler.do_GET(self)',
  '    def log_message(self, *a): pass',
  'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
  'server.daemon_threads = True',
  'port = server.server_address[1]',
  'threading.Thread(target=server.serve_forever, daemon=True).start()',
  'base = "http://127.0.0.1:%d" % port',
  'threading.Thread(target=lambda: urllib.request.urlopen(base + "/slow", timeout=10).read(), daemon=True).start()',
  'time.sleep(0.3)',  // /slow が確実に処理中の間に測る
  'started = time.time()',
  'body = urllib.request.urlopen(base + "/", timeout=10).read()',
  'elapsed = time.time() - started',
  'server.shutdown()',
  'print(json.dumps({"elapsed": elapsed, "html": b"<html" in body.lower()}))',
];

describe('server.py の同時接続 (BLK-builder-20260908-0744-2-red)', () => {
  test('遅いリクエストの最中でも静的ファイルはすぐ返る', () => {
    const out = JSON.parse(runPython(SERVE_SLOW_AND_STATIC));
    expect(out.html).toBe(true);
    // 単スレッドなら残り ~1.2 秒待たされる。並行なら即答。
    expect(out.elapsed).toBeLessThan(1.0);
  });

  test('main が立てるのは ThreadingHTTPServer で、HTTPServer は使わない', () => {
    const src = require('fs').readFileSync(path.join(projectRoot, 'server.py'), 'utf8');
    expect(src).toContain('ThreadingHTTPServer((\'127.0.0.1\', PORT), Handler)');
    expect(/[^g]HTTPServer\(\('127\.0\.0\.1', PORT\), Handler\)/.test(src)).toBe(false);
  });

  test('ファイルを読み書きする窓口はすべて _fs_lock の中で呼ばれる', () => {
    const src = require('fs').readFileSync(path.join(projectRoot, 'server.py'), 'utf8')
      .replace(/\r\n/g, '\n');
    const guarded = [
      '_handle_autosave_get()',
      '_handle_autosave_post()',
      '_handle_autosave_svg_post()',
      '_handle_file_roles_post()',
      '_handle_prefs_post()',
    ];
    guarded.forEach((call) => {
      // 呼び出しの直前の行が `with _fs_lock:` であること
      const re = new RegExp('with _fs_lock:\\n\\s*return self\\.' + call.replace(/[()]/g, '\\$&'));
      expect(re.test(src)).toBe(true);
    });
    // GET /prefs も同じ扱い
    expect(/with _fs_lock:\n\s*return self\._send_json\(200, read_prefs\(\)\)/.test(src)).toBe(true);
  });

  test('_fs_lock は再入しない普通の Lock で、二重に取ると待つ', () => {
    const out = runPython([
      'got = srv._fs_lock.acquire(blocking=False)',
      'again = srv._fs_lock.acquire(blocking=False)',
      'srv._fs_lock.release()',
      'print(json.dumps([got, again]))',
    ]);
    expect(JSON.parse(out)).toEqual([true, false]);
  });
});
