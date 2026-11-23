'use strict';
// TICKET-owner-20261122-2322-1 (data-loss): 試験のサーバ (PUA_DATA_ROOT) でも、画面の既定の保存先 `./autosave`
// (と相対の道) をサーバの作業フォルダ (製品のチェックアウト) から解いていた。チェックアウトの autosave/ は
// ソースから起こす利用者の本物の既定の保存先で、試験はそこの図を一覧に読み (＋ の新しい図が diagram76 から
// 数えられた)、同じ名前の図を書いていた。
// 本物の server.py を「チェックアウトに見立てた作業フォルダ (autosave/ に利用者の図がある)」から起こし、
// 一覧・保存・tree-dir・peek-dirs・browse-dir が DATA_ROOT の下を指し、作業フォルダの autosave/ が変わらないことを確かめる。
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const SERVER = path.join(projectRoot, 'server.py');

function runPython(lines, cwd, env) {
  const script = [
    'import importlib.util, json, os, threading, urllib.request, urllib.parse',
    'from pathlib import Path',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${SERVER}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(lines).join('\n');
  const e = Object.assign({}, process.env);
  delete e.PUA_DATA_ROOT;
  return execFileSync('python', ['-c', script], {
    cwd: cwd, encoding: 'utf8', timeout: 60000, env: Object.assign(e, env || {}),
  }).trim();
}

function kv(out) {
  return Object.fromEntries(out.split(/\r?\n/).map((l) => {
    const p = l.split(' ');
    return [p[0], p.slice(1).join(' ')];
  }));
}

function snapshot(dir) {
  return fs.readdirSync(dir).sort().map((n) => {
    const st = fs.statSync(path.join(dir, n));
    if (st.isDirectory()) return n + '/:' + fs.readdirSync(path.join(dir, n)).sort().join(',');
    return n + ':' + st.mtimeMs + ':' + fs.readFileSync(path.join(dir, n), 'utf8');
  }).join('|');
}

describe('試験のサーバは既定の保存先を PUA_DATA_ROOT の下に解く (TICKET-owner-20261122-2322-1)', function() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-2322-'));
  const checkout = path.join(base, 'checkout');           // サーバの作業フォルダ (利用者のチェックアウト)
  const userAutosave = path.join(checkout, 'autosave');   // 利用者の本物の既定の保存先
  const sandbox = path.join(base, 'data');                // 試験の PUA_DATA_ROOT
  fs.mkdirSync(userAutosave, { recursive: true });
  for (let i = 1; i <= 3; i++) {
    fs.writeFileSync(path.join(userAutosave, 'diagram' + i + '.puml'), '@startuml\nA -> B : user' + i + '\n@enduml\n');
  }
  fs.mkdirSync(path.join(userAutosave, 'sub'));
  fs.writeFileSync(path.join(userAutosave, 'probe.puml'), '@startuml\nUser -> Mine\n@enduml\n');
  const before = snapshot(userAutosave);

  const out = kv(runPython([
    'httpd = srv.ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)',
    'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    'b = "http://127.0.0.1:%d" % httpd.server_address[1]',
    'q = urllib.parse.quote("./autosave")',
    'def get(p): return json.loads(urllib.request.urlopen(b + p).read())',
    'body = json.dumps({"type": "probe", "dsl": "@startuml\\nT -> S : test\\n@enduml\\n", "dir": "./autosave"}).encode()',
    'urllib.request.urlopen(urllib.request.Request(b + "/autosave", data=body, headers={"Content-Type": "application/json"}, method="POST")).read()',
    'lst = get("/autosave?dir=" + q)',
    'tree = get("/tree-dir?dir=" + q)',
    'peek = get("/peek-dirs?dir=" + q)',
    'brw = get("/browse-dir?dir=" + q)',
    'httpd.shutdown()',
    'root = Path(os.environ["PUA_DATA_ROOT"]).resolve()',
    'print("list", ",".join(lst["files"]))',
    'print("tree", Path(tree["root"]) == root / "autosave")',
    'print("peek", Path(peek["current"]) == root / "autosave")',
    'print("browse", Path(brw["path"]) == root / "autosave")',
    'print("written", (root / "autosave" / "probe.puml").read_text(encoding="utf-8").count("T -> S"))',
    'print("default", srv.resolve_save_dir("./autosave") == srv.AUTOSAVE_DEFAULT_DIR)',
    'print("rel", srv.resolve_save_dir("team/a") == root / "team" / "a")',
    'print("tr", srv.resolve_save_dir("./test-results/autosave/x") == (Path.cwd() / "test-results" / "autosave" / "x").resolve())',
    'print("trnear", srv.resolve_save_dir("./test-resultsX/y") == root / "test-resultsX" / "y")',
    'absd = Path(os.environ["PUA_ABS"])',
    'print("abs", srv.resolve_save_dir(str(absd)) == absd.resolve())',
    'print("render", srv.render_base_dir("./autosave") == root / "autosave")',
  ], checkout, { PUA_DATA_ROOT: sandbox, PUA_ABS: userAutosave }));

  test('一覧は DATA_ROOT の下の図だけを返す (チェックアウトの autosave/ の図を読まない)', function() {
    expect(out.list).toBe('probe');
  });

  test('保存は DATA_ROOT の下に書く', function() {
    expect(out.written).toBe('1');
  });

  test('tree-dir・peek-dirs・browse-dir・include の起点も DATA_ROOT の下を指す', function() {
    expect(out.tree).toBe('True');
    expect(out.peek).toBe('True');
    expect(out.browse).toBe('True');
    expect(out.render).toBe('True');
  });

  test('相対の道は DATA_ROOT の下、利用者が選んだ絶対パスはそのまま', function() {
    expect(out.default).toBe('True');
    expect(out.rel).toBe('True');
    expect(out.abs).toBe('True');
  });

  test('試験の置き場 (作業フォルダの test-results/ の下) を指す相対の道だけは作業フォルダから解く', function() {
    expect(out.tr).toBe('True');
    expect(out.trnear).toBe('True');
  });

  test('チェックアウトの autosave/ (利用者の本物の既定の保存先) の中身と mtime は変わらない', function() {
    expect(snapshot(userAutosave)).toBe(before);
  });

  test('PUA_DATA_ROOT の無い利用者のサーバは今のまま作業フォルダから解く', function() {
    const plain = kv(runPython([
      'print("default", srv.resolve_save_dir("./autosave") == (Path.cwd() / "autosave").resolve())',
      'print("sandbox", bool(srv.SANDBOX_DATA_ROOT))',
    ], checkout));
    expect(plain.default).toBe('True');
    expect(plain.sandbox).toBe('False');
  });

  try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) {}
});
