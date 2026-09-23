'use strict';
// BLK-human-20260924-0900
// ハーネスや E2E が起こした server は、ブラウザを閉じるたびに届く POST /shutdown で
// 約 2 秒後に落ち、空いたポートを別の server が取って他人の作業木を測っていた。
// PUA_NO_IDLE_EXIT=1 なら /shutdown は何もせず、無音で落ちる安全弁は 3 時間に延びることを、
// 実際に server を起こして確かめる。未設定なら今までどおり 300 秒・停止の予約あり。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(noIdleExit) {
  const script = [
    'import importlib.util, json, threading, time, urllib.request',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'port = server.server_address[1]',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'srv._last_heartbeat = time.time()',
    'before = srv._last_heartbeat',
    'req = urllib.request.Request("http://127.0.0.1:%d/shutdown" % port, data=b"", method="POST")',
    'status = urllib.request.urlopen(req, timeout=10).status',
    'rewound = srv._last_heartbeat < before - 1',
    'server.shutdown()',
    'print(json.dumps({"flag": srv.NO_IDLE_EXIT, "status": status, "rewound": rewound,',
    '                  "limit": srv._idle_limit_sec(), "shutdown_started": srv._shutdown_started}))',
  ].join('\n');
  const env = Object.assign({}, process.env);
  if (noIdleExit) env.PUA_NO_IDLE_EXIT = '1';
  else delete env.PUA_NO_IDLE_EXIT;
  return JSON.parse(execFileSync('python', ['-c', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60000,
    env,
  }).trim());
}

describe('PUA_NO_IDLE_EXIT (BLK-human-20260924-0900)', () => {
  test('設定ありなら /shutdown は 204 を返すだけで、安全弁は 3 時間', () => {
    const out = runPython(true);
    expect(out.flag).toBe(true);
    expect(out.status).toBe(204);
    expect(out.rewound).toBe(false);
    expect(out.limit).toBe(3 * 60 * 60);
    expect(out.shutdown_started).toBe(false);
  });

  test('未設定なら /shutdown は今までどおり停止を予約する', () => {
    const out = runPython(false);
    expect(out.flag).toBe(false);
    expect(out.status).toBe(204);
    expect(out.rewound).toBe(true);
    expect(out.limit).toBe(300);
  });

  test('E2E が起こす server にも PUA_NO_IDLE_EXIT を渡す', () => {
    const src = require('fs').readFileSync(path.join(projectRoot, 'tests', 'e2e', 'servers.js'), 'utf8');
    expect(src).toContain("PUA_NO_IDLE_EXIT: '1'");
  });

  test('Windows アプリ (app.py) は設定しない', () => {
    const src = require('fs').readFileSync(path.join(projectRoot, 'app.py'), 'utf8');
    expect(src).not.toContain('PUA_NO_IDLE_EXIT');
  });
});
