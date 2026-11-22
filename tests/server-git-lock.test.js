'use strict';
// TICKET-releaser-20261116-0101-1: 保存先が Git のとき、画面は保存のたびに変更を数え直す (git status)。
// status が .git/index.lock を一瞬取った時にコミットを押すと「index.lock: File exists」で落ち、
// junior-09 の「この図の履歴」の test が全体実行の負荷で赤になっていた。
// (1) 読むだけの命令には索引の錠を取らせない (GIT_OPTIONAL_LOCKS=0)。
// (2) 別の git が錠を持っている間は、少し待って打ち直す (錠で落ちた回は何も書いていない)。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, threading, time, subprocess',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim();
}

function freshRepo(name) {
  const dir = path.join(projectRoot, 'test-results', 'unit-git-lock', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'unit');
  git('config', 'user.email', 'unit@example.invalid');
  git('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'a.puml'), '@startuml\nA -> B\n@enduml\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'v1');
  return { dir, git };
}

describe('server.py の git — 索引の錠で コミットが落ちない', function() {
  test('git には GIT_OPTIONAL_LOCKS=0 を渡す (status が索引の錠を取らない)', function() {
    const out = runPython([
      'seen = {}',
      'real = subprocess.run',
      'def fake(cmd, **kw):',
      '    seen["env"] = kw.get("env") or {}',
      '    return real(cmd, **kw)',
      'srv.subprocess.run = fake',
      'r = srv.run_git(".", ["--version"])',
      'print(json.dumps({"rc": r[0], "opt": seen["env"].get("GIT_OPTIONAL_LOCKS")}))',
    ]);
    const j = JSON.parse(out.split('\n').pop());
    expect(j.rc).toBe(0);
    expect(j.opt).toBe('0');
  });

  test('別の git が index.lock を持っている間に押したコミットも、錠が外れたら通る', function() {
    const { dir, git } = freshRepo('busy');
    fs.writeFileSync(path.join(dir, 'a.puml'), '@startuml\nA -> B\nB --> A : ack\n@enduml\n');
    const lock = path.join(dir, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    const out = runPython([
      `lock = r"${lock}"`,
      'threading.Thread(target=lambda: (time.sleep(0.6), os.remove(lock)), daemon=True).start()',
      `ok, info = srv.git_commit(r"${dir}", "ack を足した")`,
      'print(json.dumps({"ok": ok, "info": info}, ensure_ascii=True))',
    ]);
    const j = JSON.parse(out.split('\n').pop());
    expect(j.ok).toBe(true);
    expect(git('log', '--format=%s')).toContain('ack を足した');
  });

  test('錠が外れないままなら、打ち直しを打ち切って理由を返す (固まらない)', function() {
    const { dir } = freshRepo('stuck');
    fs.writeFileSync(path.join(dir, 'a.puml'), '@startuml\nA -> C\n@enduml\n');
    const lock = path.join(dir, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    const out = runPython([
      'srv.GIT_LOCK_WAIT_SEC = 0.05',
      't0 = time.time()',
      `ok, info = srv.git_commit(r"${dir}", "x")`,
      'print(json.dumps({"ok": ok, "lock": "index.lock" in info.get("error", ""), "sec": time.time() - t0}))',
    ]);
    fs.rmSync(lock, { force: true });
    const j = JSON.parse(out.split('\n').pop());
    expect(j.ok).toBe(false);
    expect(j.lock).toBe(true);
    expect(j.sec).toBeLessThan(10);
  });

  test('錠と関係の無い失敗は打ち直さない', function() {
    const out = runPython([
      'calls = []',
      'real = subprocess.run',
      'def fake(cmd, **kw):',
      '    calls.append(1)',
      '    return real(cmd, **kw)',
      'srv.subprocess.run = fake',
      'r = srv.run_git(".", ["no-such-subcommand-xyz"])',
      'print(json.dumps({"rc": r[0], "n": len(calls)}))',
    ]);
    const j = JSON.parse(out.split('\n').pop());
    expect(j.rc).not.toBe(0);
    expect(j.n).toBe(1);
  });
});
