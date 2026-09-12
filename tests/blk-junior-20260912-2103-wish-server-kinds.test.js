'use strict';
// BLK-junior-20260912-2103-wish: 保存したときの図種を server が控え (_kinds.json)、
// 一覧と一緒に返す。本文からの判定 (dsl_kind) と別枠であることを、実際に
// server を起こして確かめる (紛らわしい書き方の図で両者が食い違う)。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, shutil, tempfile, threading, urllib.request',
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
    '    req = urllib.request.Request(base + "/autosave", data=json.dumps(payload).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))',
    'def listing():',
    '    url = base + "/autosave?dir=" + urllib.parse.quote(tmp)',
    '    return json.loads(urllib.request.urlopen(url, timeout=10).read().decode("utf-8"))',
    'import urllib.parse',
  ].concat(body).concat([
    'server.shutdown()',
    'shutil.rmtree(tmp, ignore_errors=True)',
  ]).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

// junior が詰まった実物: actor を持ち、ラベルに括弧の付くシーケンス。
const SEQ_RAW = [
  '@startuml', 'title TIMER初期化', 'actor Dev', 'participant Timer_Driver',
  'Dev -> Timer_Driver : Timer_Init(cfg)', '@enduml',
].join('\n');
// Python の文字列リテラルに埋めるので JSON で書く (生の改行が入るとソースが壊れる)。
const SEQ = JSON.stringify(SEQ_RAW);

describe('server の図種の控え (_kinds.json)', () => {
  test('保存で送った図種が控えられ、一覧で返る', () => {
    const out = JSON.parse(runPython([
      `res = post({"type": "timer_init", "dsl": ${SEQ}, "dir": tmp, "kind": "sequence"})`,
      'data = listing()',
      'entry = [e for e in data["entries"] if e["name"] == "timer_init"][0]',
      'print(json.dumps({"savedKind": res.get("savedKind"), "kinds": data.get("kinds"),',
      '                  "entrySaved": entry.get("savedKind"), "entryGuess": entry.get("kind"),',
      '                  "hasFile": os.path.exists(os.path.join(tmp, "_kinds.json"))}))',
    ]));
    expect(out.savedKind).toBe('sequence');
    expect(out.kinds).toEqual({ timer_init: 'sequence' });
    expect(out.entrySaved).toBe('sequence');
    expect(out.hasFile).toBe(true);
    // 控えは本文判定の置き換えではない。判定は判定のまま返る (この図では別の値)。
    expect(out.entryGuess).toBe('sequence');
  });

  test('図種を送らない保存は前の控えを消さない', () => {
    const out = JSON.parse(runPython([
      `post({"type": "timer_init", "dsl": ${SEQ}, "dir": tmp, "kind": "sequence"})`,
      `post({"type": "timer_init", "dsl": ${SEQ}, "dir": tmp})`,
      'print(json.dumps(listing().get("kinds")))',
    ]));
    expect(out).toEqual({ timer_init: 'sequence' });
  });

  test('知らない図種は控えない', () => {
    const out = JSON.parse(runPython([
      `post({"type": "timer_init", "dsl": ${SEQ}, "dir": tmp, "kind": "../evil"})`,
      'print(json.dumps(listing().get("kinds")))',
    ]));
    expect(out).toEqual({});
  });

  test('本文からの判定は控えに入れない (外れた判定を焼き付けない)', () => {
    // このシーケンスは本文判定ではユースケースに倒れる。判定を控えてしまうと、
    // 次に開くときもユースケースで開くので、直す前と同じ遠回りに戻る。
    const out = JSON.parse(runPython([
      `res = post({"type": "timer_init", "dsl": ${SEQ}, "dir": tmp})`,
      'data = listing()',
      'entry = [e for e in data["entries"] if e["name"] == "timer_init"][0]',
      'print(json.dumps({"kinds": data.get("kinds"), "guess": entry.get("kind")}))',
    ]));
    expect(out.kinds).toEqual({});
    expect(typeof out.guess).toBe('string');
  });

  test('控えが無いフォルダでも一覧は空の控えを返す', () => {
    const out = JSON.parse(runPython([
      `post({"type": "timer_init", "dsl": ${SEQ}, "dir": tmp})`,
      'print(json.dumps(listing().get("kinds")))',
    ]));
    expect(out).toEqual({});
  });
});
