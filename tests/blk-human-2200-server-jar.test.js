'use strict';
// BLK-human-20260909-2200: 配布先には PlantUML も Java も無い。exe 版では
// plantuml.jar を利用者が選ぶことになり、その場所は `.assist-prefs.json` の
// jarPath に残って次の起動でも効く必要がある。描画に使うパスが設定を見ること、
// ネイティブ保存が Web 版では閉じていること (勝手にサーバがファイルを書かない) を
// 実際に server.py を読み込んで確かめる。
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, tempfile, urllib.request, urllib.error, threading',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'from pathlib import Path',
    // 本物の .assist-prefs.json を汚さない。
    'tmp = tempfile.mkdtemp()',
    'srv.PREFS_PATH = Path(tmp) / ".assist-prefs.json"',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

// ── jar_path / use_jar ───────────────────────────────────────────────────
// 設定が空なら従来どおり lib/plantuml.jar。選べばそれが効き、設定ファイルに残る。
const out = runPython([
  'print("default", srv.jar_path() == srv.DEFAULT_JAR_PATH)',
  'picked = Path(tmp) / "plantuml.jar"',
  'picked.write_bytes(b"PK")',
  'ok, msg = srv.use_jar(str(picked))',
  'print("set", ok, srv.jar_path() == picked)',
  'print("persisted", json.loads(srv.PREFS_PATH.read_text(encoding="utf-8"))["jarPath"] == str(picked))',
  // 無いファイル・jar でないものは受け取らない (描画時まで気付けなくなるため)。
  'print("missing", srv.use_jar(str(Path(tmp) / "nope.jar"))[0])',
  'notjar = Path(tmp) / "x.txt"',
  'notjar.write_text("x")',
  'print("notjar", srv.use_jar(str(notjar))[0])',
  'print("empty", srv.use_jar("")[0])',
  // 弾いたあとも設定は前のまま (壊れた指定で描画を止めない)。
  'print("kept", srv.jar_path() == picked)',
  // /env は設定した場所をそのまま言い、Java の案内先を必ず持つ。
  'env = srv.detect_env()',
  'print("envjar", env["jar"], env["jarPath"] == str(picked))',
  'print("envjava", "adoptium" in env["javaUrl"], env["app"])',
]);
const lines = Object.fromEntries(out.split(/\r?\n/).map(l => {
  const p = l.split(' ');
  return [p[0], p.slice(1).join(' ')];
}));
assert.strictEqual(lines.default, 'True', '設定が空なら lib/plantuml.jar');
assert.strictEqual(lines.set, 'True True', '選んだ jar が効く');
assert.strictEqual(lines.persisted, 'True', '選んだ場所が .assist-prefs.json に残る');
assert.strictEqual(lines.missing, 'False', '無いファイルは受け取らない');
assert.strictEqual(lines.notjar, 'False', '.jar でないものは受け取らない');
assert.strictEqual(lines.empty, 'False', '空のパスは受け取らない');
assert.strictEqual(lines.kept, 'True', '弾いても前の設定を壊さない');
assert.strictEqual(lines.envjar, 'True True', '/env が jar の場所を言う');
assert.strictEqual(lines.envjava, 'True False', '/env が Temurin の URL を持ち、Web 版は app:false');

// ── /native-save ─────────────────────────────────────────────────────────
// Web 版 (NATIVE_DIALOG が無い) では 409。ここが開いていると、ブラウザから
// 任意のパスに書ける窓口になってしまう。
const saved = runPython([
  'srv.NATIVE_DIALOG = None',
  'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)',
  'server.daemon_threads = True',
  'port = server.server_address[1]',
  'threading.Thread(target=server.serve_forever, daemon=True).start()',
  'def post(path, body):',
  '    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=json.dumps(body).encode(),',
  '                                 headers={"Content-Type": "application/json"}, method="POST")',
  '    try:',
  '        with urllib.request.urlopen(req, timeout=10) as r: return r.status, json.loads(r.read())',
  '    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())',
  'print("websave", post("/native-save", {"fileName": "a.svg", "text": "x"})[0])',
  'print("webpick", post("/pick-jar", {})[0])',
  // アプリ版を模したダイアログを差すと、選ばれた場所へ実際に書く。
  'target = Path(tmp) / "out.svg"',
  'class D:',
  '    def open_file(self, title, file_types=()): return ""',
  '    def save_file(self, name): return str(target)',
  'srv.NATIVE_DIALOG = D()',
  'code, body = post("/native-save", {"fileName": "a.svg", "text": "<svg/>"})',
  'print("appsave", code, target.read_text(encoding="utf-8") == "<svg/>")',
  // base64 はバイト列のまま書く (PNG が壊れない)。
  'png = Path(tmp) / "out.png"',
  'class D2(D):',
  '    def save_file(self, name): return str(png)',
  'srv.NATIVE_DIALOG = D2()',
  'code2, _ = post("/native-save", {"fileName": "a.png", "base64": "AAEC"})',
  'print("appb64", code2, png.read_bytes() == bytes([0, 1, 2]))',
  // ダイアログで「やめる」を押したらファイルは増えない。
  'class D3(D):',
  '    def save_file(self, name): return ""',
  'srv.NATIVE_DIALOG = D3()',
  'print("cancel", post("/native-save", {"fileName": "a.svg", "text": "y"})[1].get("canceled"))',
  // アプリ版では /env が app:true になる (画面側の分岐はこの 1 個で決まる)。
  'srv._env_cache = None',
  'print("appenv", srv.detect_env()["app"])',
]);
const s = Object.fromEntries(saved.split(/\r?\n/).map(l => {
  const p = l.split(' ');
  return [p[0], p.slice(1).join(' ')];
}));
assert.strictEqual(s.websave, '409', 'Web 版ではネイティブ保存を開かない');
assert.strictEqual(s.webpick, '409', 'Web 版ではファイルダイアログを開かない');
assert.strictEqual(s.appsave, '200 True', 'アプリ版は選ばれた場所へ書く');
assert.strictEqual(s.appb64, '200 True', 'base64 はバイト列のまま書く');
assert.strictEqual(s.cancel, 'True', 'やめたらファイルを作らない');
assert.strictEqual(s.appenv, 'True', 'アプリ版は /env が app:true');

console.log('    ✓ BLK-human-20260909-2200 server jar / native-save');
