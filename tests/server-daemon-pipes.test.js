'use strict';
// BLK-builder-20260907-2249-1
// server.py の PlantUML daemon まわり。E2E が 3 spec 目あたりから全部
// ERR_CONNECTION_REFUSED になっていた原因は、daemon の stderr を誰も読まず
// パイプが詰まり、JVM が System.err への write で永久にブロックしたこと。
// 単スレッドの HTTPServer は /render の中で止まり、以後 accept しなくなる。
//
// server.py は Python なので、python 側の関数を偽の Popen に対して同期実行して
// 確かめる (Java も plantuml.jar も要らない)。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, io, json, sys, threading, time',
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

describe('server.py PlantUML daemon のパイプ', () => {
  test('stderr は drain され、最後の行が daemon_log_tail で読める', () => {
    const out = runPython([
      'class FakeProc:',
      '    def __init__(self, data): self.stderr = io.BytesIO(data)',
      'lines = b"".join(("warn %d\\n" % i).encode() for i in range(500))',
      'srv._drain_daemon_stderr(FakeProc(lines))',
      'tail = srv.daemon_log_tail(3)',
      'print(json.dumps(tail))',
    ]);
    expect(JSON.parse(out)).toEqual(['warn 497', 'warn 498', 'warn 499']);
  });

  test('daemon_log_tail は上限付きで、無制限には溜めない', () => {
    const out = runPython([
      'class FakeProc:',
      '    def __init__(self, data): self.stderr = io.BytesIO(data)',
      'lines = b"".join(("x %d\\n" % i).encode() for i in range(5000))',
      'srv._drain_daemon_stderr(FakeProc(lines))',
      'print(len(srv._daemon_log))',
    ]);
    expect(Number(out)).toBeLessThan(1000);
  });

  test('答えない daemon は例外になり、呼び出し側を永久にブロックしない', () => {
    const out = runPython([
      'class DeadStdout:',
      '    def read(self, n):',
      '        time.sleep(30)',
      '        return b""',
      'class FakeProc:',
      '    stdout = DeadStdout()',
      'started = time.time()',
      'try:',
      '    srv._read_daemon_reply(FakeProc(), 0.5)',
      '    print("no-raise")',
      'except EOFError as e:',
      '    print("EOFError %.1f" % (time.time() - started))',
    ]);
    expect(out).toContain('EOFError');
    // 0.5s の timeout で戻る (30s の read を待たない)
    expect(Number(out.split(' ')[1])).toBeLessThan(5);
  });

  test('普通に答える daemon の返事はそのまま読める', () => {
    const out = runPython([
      'class FakeProc:',
      '    def __init__(self):',
      '        body = b"<svg/>"',
      '        self.stdout = io.BytesIO(b"\\x00\\x00\\x00\\x00" + len(body).to_bytes(4, "big") + body)',
      'status, body = srv._read_daemon_reply(FakeProc(), 5)',
      'print(json.dumps([status, body.decode()]))',
    ]);
    expect(JSON.parse(out)).toEqual([0, '<svg/>']);
  });
});
