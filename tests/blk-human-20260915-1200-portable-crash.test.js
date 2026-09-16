'use strict';
// BLK-human-20260915-1200: portable zip 版だけが起動直後にエラーのプロンプトを
// 出して終了し、`console=False` なので理由がどこにも残らなかった。
//   1. app.py が起動の失敗を必ず crash.log に残し、次にすることが読める日本語を返すこと
//   2. 同梱ファイルが揃っていないとき (zip を展開せずに exe を叩いた形) を名指しで案内すること
//   3. zip が「フォルダごと」詰められ、展開 → 起動のスモークテストが workflow にあること
// を、実際に app.py を読み込んで・workflow を読んで確かめる。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const appPy = path.join(projectRoot, 'app.py');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, sys, tempfile',
    'from pathlib import Path',
    // crash.log の行き先を一時フォルダに逃がす (本物の %LOCALAPPDATA% を汚さない)。
    'tmp = tempfile.mkdtemp()',
    'os.environ["LOCALAPPDATA"] = tmp',
    `spec = importlib.util.spec_from_file_location("puaapp", r"${appPy}")`,
    'app = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(app)',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

// ── crash.log ────────────────────────────────────────────────────────────
// 失敗したら必ず書かれ、環境 (展開先・APPDATA・欠けている同梱物) と
// トレースバックが 1 件として残る。追記なので 2 回目も前の記録を消さない。
const log = runPython([
  'p1 = app.write_crash_log("こわれた", "Traceback: boom")',
  'print("path_under_localappdata", str(p1).startswith(tmp))',
  'print("named", p1.name == "crash.log")',
  'p2 = app.write_crash_log("2 回目", "Traceback: again")',
  'text = p2.read_text(encoding="utf-8")',
  'print("appends", text.count("====") == 2)',
  'print("keeps_first", "boom" in text and "again" in text)',
  'print("has_env", "app_root" in text and "LOCALAPPDATA" in text and "missing" in text)',
]);
assert.ok(/path_under_localappdata True/.test(log), 'crash.log は %LOCALAPPDATA%\\PlantUMLAssist に置く');
assert.ok(/named True/.test(log), 'ファイル名は crash.log');
assert.ok(/appends True/.test(log), '2 回目の失敗も追記される');
assert.ok(/keeps_first True/.test(log), '前の記録を消さない');
assert.ok(/has_env True/.test(log), '展開先と環境変数と欠けた同梱物を残す');

// 書けない場所でも例外にせず、パスを返すか None を返して先へ進む。
const fallback = runPython([
  'os.environ["LOCALAPPDATA"] = str(Path(tmp) / "nope.txt")',
  'Path(os.environ["LOCALAPPDATA"]).write_text("x")',  // mkdir できない
  'print("no_raise", app.crash_log_path() is not None)',
]);
assert.ok(/no_raise True/.test(fallback), '書けない環境でも crash_log_path は落ちない');

// ── 文面 ─────────────────────────────────────────────────────────────────
// 「原因」と「次にすること」と記録の場所が、そのまま読める日本語で並ぶ。
const msg = runPython([
  'm = app.failure_message("同梱ファイルが見つかりません: src\\\\app.js", "展開してください", Path(tmp) / "crash.log")',
  'print(json.dumps(m))',
]);
const text = JSON.parse(msg);
assert.ok(text.includes('原因:'), '原因を書く');
assert.ok(text.includes('次にすること:'), '次にすることを書く');
assert.ok(text.includes('crash.log'), '記録の場所を書く');
assert.ok(/[ぁ-んァ-ン一-龥]/.test(text), '日本語で書く');

// 記録が書けなかったときも、書けなかったことが分かる文面になる。
const noLog = JSON.parse(runPython([
  'print(json.dumps(app.failure_message("x", "y", None)))',
]));
assert.ok(noLog.includes('見つかりませんでした'), '記録できなかったことを伝える');

// ── 同梱ファイルの欠けを名指しする ───────────────────────────────────────
// zip を展開せずに exe を叩くと _internal が付いてこない。そのときは
// 「展開してから実行する」という、利用者が次に打てる手を返す。
const diag = runPython([
  'app.APP_ROOT = Path(tmp)',  // 何も入っていないフォルダ = 同梱物ゼロ
  'missing = app.missing_bundled_files()',
  'print("lists_all", sorted(missing) == sorted(app.REQUIRED_FILES))',
  'summary, hint = app.diagnose(FileNotFoundError("同梱ファイルが見つかりません: server.py"))',
  'print(json.dumps({"summary": summary, "hint": hint}))',
]);
assert.ok(/lists_all True/.test(diag), '欠けた同梱物を全部数える');
const parsed = JSON.parse(diag.split('\n').pop());
assert.ok(parsed.hint.includes('展開'), 'zip を展開してから実行する、と案内する');
assert.ok(parsed.hint.includes('PlantUMLAssist.exe'), '押すものを名指しする');

// 期待する同梱物には、画面が出るのに要る 3 つが入っている。
const required = JSON.parse(runPython(['print(json.dumps(list(app.REQUIRED_FILES)))']));
assert.deepStrictEqual(
  required.map((r) => r.replace(/\\/g, '/')).sort(),
  ['plantuml-assist.html', 'server.py', 'src/app.js'],
  '画面が出るのに要るものを起動前に確かめる');

// 揃っていれば欠けは 0 件 (リポジトリ直下は当然揃っている)。
assert.ok(/none True/.test(runPython([
  'print("none", app.missing_bundled_files() == [])',
])), 'ソースから動かす分には欠けない');

// ── run() は失敗を握りつぶさない ─────────────────────────────────────────
// main() は例外を捕まえて 1 を返し、crash.log を残す (黙って消えない)。
const mainOut = runPython([
  'app.APP_ROOT = Path(tmp) / "empty"',
  '(Path(tmp) / "empty").mkdir()',
  'app.show_error = lambda m: True',  // ダイアログは出さずに走らせる
  'code = app.main()',
  'print("exit", code)',
  'print("logged", (Path(tmp) / "PlantUMLAssist" / "crash.log").exists())',
  'print("traceback", "Traceback" in (Path(tmp) / "PlantUMLAssist" / "crash.log").read_text(encoding="utf-8"))',
]);
assert.ok(/exit 1/.test(mainOut), '失敗は終了コード 1');
assert.ok(/logged True/.test(mainOut), '失敗すると crash.log が残る');
assert.ok(/traceback True/.test(mainOut), 'トレースバックまで残る');

// ── 配布の作り (workflow) ────────────────────────────────────────────────
const wf = fs.readFileSync(
  path.join(projectRoot, '.github', 'workflows', 'windows-app.yml'), 'utf8');
assert.ok(!/Compress-Archive\s+-Path\s+dist\\PlantUMLAssist\\\*/.test(wf),
  'zip の直下に exe を裸で置かない (展開せずに叩けてしまう)');
assert.ok(/Compress-Archive\s+-Path\s+dist\\PlantUMLAssist\s/.test(wf),
  'フォルダごと詰める');
assert.ok(/Expand-Archive/.test(wf), '展開して確かめる');
assert.ok(/Start-Process[\s\S]*HasExited/.test(wf), '起動して生きていることを確かめる');
assert.ok(/_internal\\src\\app\.js/.test(wf) && /_internal\\server\.py/.test(wf),
  '静的ファイルとサブフォルダの取りこぼしを見る');
assert.ok(/crash\.log/.test(wf), '落ちたら crash.log をログに出す');

// 展開前に読ませる案内が配布物に入る。
const readme = fs.readFileSync(
  path.join(projectRoot, 'packaging', 'PORTABLE-README.txt'), 'utf8');
assert.ok(readme.includes('すべて展開'), '展開の手順を書く');
assert.ok(readme.includes('crash.log'), '失敗したときの記録の場所を書く');
assert.ok(/PORTABLE-README\.txt/.test(wf), 'その案内を zip に入れる');

console.log('blk-human-20260915-1200-portable-crash: ok');
