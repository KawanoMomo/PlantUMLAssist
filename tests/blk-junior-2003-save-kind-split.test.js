'use strict';
// BLK-junior-20260908-2003 (差し戻し1回目)
// 保存は「図の名前 = ファイル名」なので、名前を既定の diagram1 のままで図種だけ
// 変えて周を重ねると、前の周に完走した図が次の周の保存で黙って消えていた。
// 控え (_versions) は消えた中身を救うだけで、「自分の状態遷移図を開く」ときには
// 版を掘らせる手順が残る。図種の変わる保存は上書きではなく `{名前}_{図種}` へ
// 回し、図種ごとに 1 枚ずつ残ることを server 側で確かめる。
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, threading, urllib.parse, urllib.request',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
}

const SEQ = ['@startuml', 'title GPIO', 'participant Drv', 'Drv -> HW: init', '@enduml'].join('\n');
const STATE = ['@startuml', 'state IDLE', 'IDLE --> RUN : start', '@enduml'].join('\n');
const CLS = ['@startuml', 'class GpioDriver', '@enduml'].join('\n');

// 実際に server を起こして /autosave を叩く (書き先の決定は handler の中にある)。
function postAll(dir, saves) {
  return JSON.parse(runPython([
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'port = server.server_address[1]',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % port',
    `saves = ${JSON.stringify(saves)}`,
    `d = ${JSON.stringify(dir)}`,
    'out = []',
    'for s in saves:',
    '    payload = json.dumps({"type": s[0], "dsl": s[1], "dir": d}).encode()',
    '    req = urllib.request.Request(base + "/autosave", data=payload,',
    '                                 headers={"Content-Type": "application/json"})',
    '    out.append(json.loads(urllib.request.urlopen(req, timeout=10).read()))',
    'listing = json.loads(urllib.request.urlopen(',
    '    base + "/autosave?dir=" + urllib.parse.quote(d), timeout=10).read())',
    'server.shutdown()',
    'print(json.dumps({"saves": out, "files": listing["files"],',
    '                  "kinds": {e["name"]: e["kind"] for e in listing["entries"]}}))',
  ]));
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-kind-'));
}

describe('図種の判定 (server.dsl_kind)', () => {
  test('本文から図種を当てる。title や skinparam は読み飛ばす', () => {
    const samples = [
      SEQ,
      STATE,
      CLS,
      ['@startuml', 'skinparam monochrome true', "' comment", '[*] --> IDLE', '@enduml'].join('\n'),
      ['@startuml', 'start', ':do;', 'stop', '@enduml'].join('\n'),
      ['@startuml', '@enduml'].join('\n'),
    ];
    const out = JSON.parse(runPython([
      `print(json.dumps([srv.dsl_kind(x) for x in ${JSON.stringify(samples)}]))`,
    ]));
    expect(out).toEqual(['sequence', 'state', 'class', 'state', 'activity', '']);
  });

  test('図種で分けた名前をもう一度分けない', () => {
    const out = JSON.parse(runPython([
      'print(json.dumps([srv.kind_base_name("diagram1_state"), srv.kind_base_name("diagram1"),',
      '                  srv.kind_base_name("_state")]))',
    ]));
    expect(out).toEqual(['diagram1', 'diagram1', '_state']);
  });
});

describe('図種が変わる保存は上書きしない (BLK-junior-20260908-2003)', () => {
  test('同じ名前で図種を変えると別ファイルになり、前の周の図が残る', () => {
    const dir = tmpDir();
    const res = postAll(dir, [['diagram1', SEQ], ['diagram1', STATE], ['diagram1', CLS]]);
    expect(res.files.slice().sort()).toEqual(['diagram1', 'diagram1_class', 'diagram1_state']);
    expect(res.kinds.diagram1).toBe('sequence');
    expect(res.kinds.diagram1_state).toBe('state');
    expect(res.kinds.diagram1_class).toBe('class');
    // 回された保存は、どこへ書いたかを答えで言う。
    expect(res.saves[1].savedAs).toBe('diagram1_state');
    expect(res.saves[1].renamedFrom).toBe('diagram1');
    expect(res.saves[1].prevKind).toBe('sequence');
    expect(res.saves[1].kind).toBe('state');
    // 1 周目のシーケンス図は手つかず。
    expect(fs.readFileSync(path.join(dir, 'diagram1.puml'), 'utf8')).toContain('participant Drv');
    expect(fs.readFileSync(path.join(dir, 'diagram1_state.puml'), 'utf8')).toContain('IDLE --> RUN');
  });

  test('同じ図種の保存は今までどおり上書き（名前を増やさない）', () => {
    const dir = tmpDir();
    const res = postAll(dir, [
      ['gpio_state', STATE],
      ['gpio_state', ['@startuml', 'state IDLE', 'IDLE --> ERROR : fail', '@enduml'].join('\n')],
    ]);
    expect(res.files).toEqual(['gpio_state']);
    expect(res.saves[1].savedAs).toBe('gpio_state');
    expect(res.saves[1].renamedFrom).toBe(undefined);
    expect(fs.readFileSync(path.join(dir, 'gpio_state.puml'), 'utf8')).toContain('ERROR');
  });

  test('回された先に同じ図種の図が既にあれば、そこへ書き足す（名前が増え続けない）', () => {
    const dir = tmpDir();
    const res = postAll(dir, [
      ['diagram1', SEQ],
      ['diagram1', STATE],
      ['diagram1', SEQ],   // タブは diagram1 のまま、また状態遷移に変えた想定
      ['diagram1', ['@startuml', 'state IDLE', 'IDLE --> DONE : ok', '@enduml'].join('\n')],
    ]);
    expect(res.files.slice().sort()).toEqual(['diagram1', 'diagram1_state']);
    expect(res.saves[3].savedAs).toBe('diagram1_state');
    expect(fs.readFileSync(path.join(dir, 'diagram1_state.puml'), 'utf8')).toContain('DONE');
  });

  test('図種が読めない本文は今までどおり上書きする（当てずっぽうで名前を増やさない）', () => {
    const dir = tmpDir();
    const res = postAll(dir, [['memo', SEQ], ['memo', ['@startuml', '@enduml'].join('\n')]]);
    expect(res.files).toEqual(['memo']);
    expect(res.saves[1].renamedFrom).toBe(undefined);
  });
});
