'use strict';
// BLK-owner-20260926-0550-7 (data-loss): E2E が起こす server.py がリポジトリ直下の .assist-prefs.json
// (保存先の設定) を読み書きし、同じチェックアウトから起こした利用者のアプリの保存先へテストの図を書いた。
// E2E のサーバは PUA_DATA_ROOT (test-results/ の下) に設定と既定の保存先を置き、
// 利用者の .assist-prefs.json を読まない・書かないことを、本物の server.py と servers.js で確かめる。
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const USER_PREFS = path.join(projectRoot, '.assist-prefs.json');

function readUserPrefs() {
  try { return fs.readFileSync(USER_PREFS, 'utf8'); } catch (e) { return null; }
}

function runPython(lines, env) {
  const script = [
    'import importlib.util, json, os, threading, urllib.request',
    'from pathlib import Path',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(lines).join('\n');
  const e = Object.assign({}, process.env);
  delete e.PUA_DATA_ROOT;
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000, env: Object.assign(e, env || {}),
  }).trim();
}

function kv(out) {
  return Object.fromEntries(out.split(/\r?\n/).map((l) => {
    const p = l.split(' ');
    return [p[0], p.slice(1).join(' ')];
  }));
}

describe('E2E のサーバは利用者の設定と保存先に触れない (BLK-owner-20260926-0550-7)', function() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-data-root-'));
  const userBefore = readUserPrefs();

  // 本物の server.py を PUA_DATA_ROOT 付きで読み込み、窓口 (HTTP) から保存先の設定を書く。
  const out = kv(runPython([
    'httpd = srv.ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)',
    'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % httpd.server_address[1]',
    'req = urllib.request.Request(base + "/prefs", data=json.dumps({"fileDir": "E:/elsewhere/diagrams"}).encode(), headers={"Content-Type": "application/json"}, method="POST")',
    'urllib.request.urlopen(req).read()',
    'info = json.loads(urllib.request.urlopen(base + "/data-root").read())',
    'got = json.loads(urllib.request.urlopen(base + "/prefs").read())',
    'httpd.shutdown()',
    'root = Path(os.environ["PUA_DATA_ROOT"]).resolve()',
    'print("dataroot", srv.DATA_ROOT == root)',
    'print("prefs", srv.PREFS_PATH == root / ".assist-prefs.json")',
    'print("autosave", srv.AUTOSAVE_DEFAULT_DIR == root / "autosave")',
    'print("written", json.loads((root / ".assist-prefs.json").read_text(encoding="utf-8"))["fileDir"])',
    'print("readback", got.get("fileDir"))',
    'print("info", info["sandbox"], Path(info["dataRoot"]) == root)',
  ], { PUA_DATA_ROOT: sandbox }));

  test('PUA_DATA_ROOT を渡すと設定と既定の保存先がそこに置かれる', function() {
    expect(out.dataroot).toBe('True');
    expect(out.prefs).toBe('True');
    expect(out.autosave).toBe('True');
  });

  test('POST /prefs は PUA_DATA_ROOT の .assist-prefs.json に書き、GET /prefs はそこから読む', function() {
    expect(out.written).toBe('E:/elsewhere/diagrams');
    expect(out.readback).toBe('E:/elsewhere/diagrams');
  });

  test('リポジトリ直下の .assist-prefs.json (利用者の設定) は前後で変わらない', function() {
    expect(readUserPrefs()).toBe(userBefore);
  });

  test('GET /data-root はテスト用のサーバであることと置き場所を言う', function() {
    expect(out.info).toBe('True True');
  });

  test('PUA_DATA_ROOT が無ければ従来どおりチェックアウト直下 (利用者のアプリ)', function() {
    const plain = kv(runPython([
      'print("dataroot", srv.DATA_ROOT == Path(r"' + projectRoot + '"))',
      'print("sandbox", bool(srv.SANDBOX_DATA_ROOT))',
    ]));
    expect(plain.dataroot).toBe('True');
    expect(plain.sandbox).toBe('False');
  });

  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) {}
});

// servers.js (globalSetup) の側: 起こすサーバに PUA_DATA_ROOT を渡し、再利用するのはテスト用のサーバだけ。
function runNode(body) {
  const script = [
    "const cp = require('child_process');",
    'const seen = [];',
    'cp.spawn = function(cmd, args, opts) { seen.push(opts); return { pid: 0, unref() {} }; };',
    `const servers = require(${JSON.stringify(path.join(projectRoot, 'tests', 'e2e', 'servers.js'))});`,
    "const http = require('http');",
    'function fake(handler) { return new Promise((r) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => r(s)); }); }',
    '(async () => {',
  ].concat(body, ['})().catch((e) => { console.log("error " + e.message); process.exit(1); });']).join('\n');
  return execFileSync(process.execPath, ['-e', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim();
}

describe('globalSetup のサーバ (tests/e2e/servers.js)', function() {
  const out = kv(runNode([
    'servers.spawnServer(47123);',
    'const env = seen[0].env;',
    "require('fs').rmSync(servers.dataRootFor(47123), { recursive: true, force: true });",
    "const rel = require('path').relative(require('path').join(" + JSON.stringify(projectRoot) + ", 'test-results'), env.PUA_DATA_ROOT);",
    'console.log("spawnenv " + (!!env.PUA_DATA_ROOT && !rel.startsWith("..")) + " " + (env.PUA_DATA_ROOT === servers.dataRootFor(47123)));',
    'const inside = servers.dataRootFor(1);',
    'const cases = [',
    '  ["inside", { sandbox: true, dataRoot: inside }],',
    '  ["notsandbox", { sandbox: false, dataRoot: inside }],',
    '  ["outside", { sandbox: true, dataRoot: ' + JSON.stringify(path.join(projectRoot)) + ' }],',
    '  ["old", null],',
    '];',
    'for (const [name, body] of cases) {',
    '  const s = await fake((req, res) => {',
    '    if (req.url === "/data-root" && body) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }',
    '    else { res.writeHead(404); res.end(); }',
    '  });',
    '  console.log(name + " " + (await servers.isSandboxServer(s.address().port)));',
    '  s.close();',
    '}',
    'const p = await servers.ephemeralPort();',
    'console.log("ephemeral " + (p >= 1024 && (p < 8700 || p > 8899)));',
  ]));

  test('起こすサーバに test-results/ の下の PUA_DATA_ROOT を渡す', function() {
    expect(out.spawnenv).toBe('true true');
  });

  test('PUA_PORT の既存サーバを再利用するのは、設定が test-results/ の下にあるテスト用のサーバだけ', function() {
    expect(out.inside).toBe('true');
    expect(out.notsandbox).toBe('false');
    expect(out.outside).toBe('false');
    expect(out.old).toBe('false');
  });

  test('再利用できないときに起こすサーバのポートはループの帯 (87xx〜88xx) を踏まない', function() {
    expect(out.ephemeral).toBe('true');
  });
});
