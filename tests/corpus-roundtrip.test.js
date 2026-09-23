'use strict';
// BLK-human-20260923-1500: コーパス往復テスト。
//
// migrator は 1 run に 5 枚しか実物を見ないので、他ツールの .puml を壊す退行が入ってから
// 見つかるまで 1 周遅れる。ここでは persona-data のコーパス全枚を、GUI の「ファイルを開く」
// と同じ経路で読み、
//   (1) 図種判定が例外を出さない
//   (2) 何も変えずに保存の直列化を通すと、元のバイト列と完全に一致する
//       (改行コード・BOM・タブ・行末空白・コメントを含む)
//   (3) 最初の要素の宣言行を core の編集関数で 1 文字だけ変えると、差分がその行だけ
// を機械で確かめる。コーパスが無い環境では skip する (CI・他人の作業機)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
}

var CORE = [
  'html-utils', 'dsl-utils', 'regex-parts', 'parser-utils',
  'text-updater', 'file-open', 'workspace',
];
CORE.forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});

var FO = global.window.MA.fileOpen;
var WS = global.window.MA.workspace;
var TU = global.window.MA.textUpdater;

// ── 対象ファイル ───────────────────────────────────────────────────────
var CORPUS_DIR = process.env.PUA_CORPUS_DIR || 'E:\\01_Loop\\persona-data\\migrator';

function listPuml(dir, recurse) {
  var out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) { if (recurse) out = out.concat(listPuml(p, true)); return; }
    if (!/\.puml$/i.test(e.name)) return;
    // 壊れた図はわざと壊してあるので往復の対象にしない。
    if (e.name.indexOf('-broken') >= 0) return;
    out.push(p);
  });
  return out;
}

var FILES = listPuml(path.join(CORPUS_DIR, 'web'), true)
  .concat(listPuml(path.join(CORPUS_DIR, 'corpus'), false))
  .sort();

// 初回実装の時点で既に落ちる枚。ここに足せるのはこの BLK の初回実装時だけで、
// 以後の builder は足してはならない (減らす方向のみ)。対応する migrator の BLK を添える。
var KNOWN_FAIL_FILE = path.join(__dirname, 'corpus-known-fail.txt');
var KNOWN_FAIL = {};
if (fs.existsSync(KNOWN_FAIL_FILE)) {
  fs.readFileSync(KNOWN_FAIL_FILE, 'utf8').split('\n').forEach(function(l) {
    var s = l.replace(/#.*$/, '').trim();
    if (s) KNOWN_FAIL[s] = true;
  });
}

function relName(p) {
  return path.relative(CORPUS_DIR, p).split(path.sep).join('/');
}

// ── 開く / 書き戻す (GUI と同じ関数) ───────────────────────────────────
// TextDecoder は Node の実装を使う。file-open は decoderFor を差し替えられる。
function decoderFor(label, fatal) {
  return new (require('util').TextDecoder)(label, { fatal: !!fatal });
}

function openBytes(bytes) {
  return FO.decode(bytes, decoderFor);
}

// restoreText で戻した本文を、開いたときの文字コード・BOM でバイト列に戻す。
function writeBytes(text, meta) {
  var body = FO.writeBody('x.puml', text, meta);
  if (body.encoding !== 'utf-8') return null;   // sjis はここでは組み立てない
  var buf = Buffer.from(body.text, 'utf8');
  return body.bom ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buf]) : buf;
}

// 図の最初の「名前を持つ宣言行」を探す。参加者 / 状態 / クラスのどれか。
// 実物は `participant App as A` / `class Foo {` / `state "待機" as Idle` のように
// 別名・波括弧・引用符が続くので、名前の後ろは何が来てもよい。
var DECL_RE = new RegExp(
  '^(\\s*)(participant|actor|boundary|control|entity|database|collections|queue|' +
  'abstract\\s+class|class|interface|enum|struct|state|component|usecase|object|rectangle|node)' +
  '(\\s+)([A-Za-z_][A-Za-z0-9_]*)(\\b.*)$', 'i');

function firstDecl(text) {
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(DECL_RE);
    if (m) return { line: i + 1, m: m, raw: lines[i] };
  }
  return null;
}

// ── 実行 ───────────────────────────────────────────────────────────────
var report = { total: FILES.length, passed: 0, edited: 0, failed: [] };

function record(file, step, detail) {
  report.failed.push({ file: file, step: step, detail: detail });
}

describe('コーパス往復テスト (実物の .puml を壊さない)', function() {
  if (FILES.length === 0) {
    test('コーパスが無い環境では skip する', function() {
      expect(FILES.length).toBe(0);
    });
  }

  test('全枚が「開く → 無変更保存 → バイト一致」「1 行編集 → 他の行は不変」を通る', function() {
    var hardFails = [];
    var edited = 0;

    FILES.forEach(function(p) {
      var name = relName(p);
      var bytes = new Uint8Array(fs.readFileSync(p));
      var failedHere = null;

      // (1) 開く: 復号と図種判定が例外を出さない
      var opened = null;
      try {
        opened = openBytes(bytes);
        WS.detectType(opened.text);
      } catch (e) {
        failedHere = ['open', String((e && e.message) || e)];
      }

      // (2) 無変更保存でバイト一致
      if (!failedHere) {
        try {
          var back = writeBytes(opened.text, opened);
          if (back === null) {
            // utf-8 以外は本文の同一性で見る (再符号化器を持たないため)
            var restored = FO.restoreText(opened.text, opened);
            var raw = openBytes(bytes).text;
            if (FO.restoreText(raw, opened) !== restored) {
              failedHere = ['roundtrip', '非 utf-8 の本文が往復で変わった'];
            }
          } else if (Buffer.compare(back, Buffer.from(bytes)) !== 0) {
            failedHere = ['roundtrip', 'バイト列が元と違う (' + bytes.length + ' → ' + back.length + ')'];
          }
        } catch (e2) {
          failedHere = ['roundtrip', String((e2 && e2.message) || e2)];
        }
      }

      // (3) 1 か所編集で、その行だけが変わる
      if (!failedHere) {
        try {
          var d = firstDecl(opened.text);
          if (d) {
            edited++;
            var newName = d.m[4] + 'X';
            var editedText = TU.replaceLine(opened.text, d.line,
              d.m[1] + d.m[2] + d.m[3] + newName + d.m[5]);
            // 編集したものを保存の直列化に通し、開き直して比べる。
            // (直列化がファイル全体を書き直していれば、ここで全行が動いて出る)
            var eb = writeBytes(editedText, opened);
            var reopened = eb === null ? editedText : openBytes(eb).text;
            var a = opened.text.split('\n');
            var b = reopened.split('\n');
            if (a.length !== b.length) {
              failedHere = ['edit', '行数が変わった (' + a.length + ' → ' + b.length + ')'];
            } else {
              var moved = [];
              for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) moved.push(i + 1);
              if (moved.length !== 1 || moved[0] !== d.line) {
                failedHere = ['edit', d.line + ' 行目だけのはずが ' + moved.join(',') + ' 行目が動いた'];
              }
            }
          }
        } catch (e3) {
          failedHere = ['edit', String((e3 && e3.message) || e3)];
        }
      }

      if (!failedHere) {
        report.passed++;
        return;
      }
      record(name, failedHere[0], failedHere[1]);
      // known-fail に載っている枚は数えるだけで赤にしない
      if (!KNOWN_FAIL[name]) hardFails.push(name + ' [' + failedHere[0] + '] ' + failedHere[1]);
    });

    report.edited = edited;
    // 1 行編集の確認が空振りしていないこと (宣言行を 1 つも見つけられていない = 守れていない)
    if (FILES.length > 0) expect(edited).toBeGreaterThan(0);

    // metrics.py が読む
    var outDir = path.join(__dirname, '..', 'test-results');
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'corpus-roundtrip.json'),
        JSON.stringify(report, null, 1), 'utf8');
    } catch (e) {}

    if (hardFails.length) {
      throw new Error('コーパス ' + hardFails.length + ' 枚が往復で壊れた:\n  '
        + hardFails.slice(0, 20).join('\n  '));
    }
    expect(hardFails.length).toBe(0);
  });
});
