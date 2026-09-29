'use strict';
// BLK-owner-20260930-0311-1: ＋ で開いたシーケンス図に actor を先に 1 人足すと本文はユースケースと読まれ、
// 続けて participant を足すと「図種が替わった」として `{名前}_sequence.puml` へ回され、タブ名が黙って替わり
// actor 1 行の `{名前}.puml` が残った。タブの名前と書き先は本文の図種の読みが替わっても変えない。
//   - 同じタブ (docId) が書いた続きで、その後に外で書き換わっていなければ別名へ回さない
//   - 印の無い書き込み・別のタブの書き込み・外で書き換わったファイルは今までどおり回す (BLK-junior-20260908-2003)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const ACTOR = ['@startuml', 'actor P4', '@enduml'].join('\n');
const SEQ = ['@startuml', 'actor P4', 'participant Q4', '@enduml'].join('\n');

// steps: ['post', name, dsl, docId] / ['touch', name, dsl] (外で書き換える)
function run(dir, steps) {
  const script = [
    'import importlib.util, json, os, threading, urllib.parse, urllib.request, time',
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
    `steps = ${JSON.stringify(steps)}`,
    `d = ${JSON.stringify(dir)}`,
    'out = []',
    'for s in steps:',
    '    if s[0] == "touch":',
    '        time.sleep(0.05)',
    '        p = os.path.join(d, s[1] + ".puml")',
    '        open(p, "w", encoding="utf-8").write(s[2])',
    '        st = os.stat(p)',
    '        os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 5000000))',
    '        continue',
    '    body = {"type": s[1], "dsl": s[2], "dir": d}',
    '    if len(s) > 3 and s[3]: body["docId"] = s[3]',
    '    req = urllib.request.Request(base + "/autosave", data=json.dumps(body).encode(),',
    '                                 headers={"Content-Type": "application/json"})',
    '    out.append(json.loads(urllib.request.urlopen(req, timeout=10).read()))',
    'listing = json.loads(urllib.request.urlopen(',
    '    base + "/autosave?dir=" + urllib.parse.quote(d), timeout=10).read())',
    'server.shutdown()',
    'print(json.dumps({"saves": out, "files": sorted(listing["files"])}))',
  ].join('\n');
  return JSON.parse(execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim());
}

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-keep-')); }

describe('タブが書いた続きは、図種の読みが替わっても別名へ回さない (BLK-owner-20260930-0311-1)', () => {
  test('actor → participant の順に足しても、書くファイルは 1 枚で名前は変わらない', () => {
    const dir = tmpDir();
    const res = run(dir, [['post', 'diagram13', ACTOR, 'tab-1'], ['post', 'diagram13', SEQ, 'tab-1']]);
    expect(res.files).toEqual(['diagram13']);
    expect(res.saves[1].savedAs).toBe('diagram13');
    expect(res.saves[1].renamedFrom).toBe(undefined);
    expect(fs.readFileSync(path.join(dir, 'diagram13.puml'), 'utf8')).toContain('participant Q4');
  });

  test('印の無い書き込みは今までどおり別名へ回す (前の周の図を潰さない)', () => {
    const dir = tmpDir();
    const res = run(dir, [['post', 'diagram13', ACTOR], ['post', 'diagram13', SEQ]]);
    expect(res.files).toEqual(['diagram13', 'diagram13_sequence']);
    expect(res.saves[1].renamedFrom).toBe('diagram13');
  });

  test('別のタブが書いたファイルには、図種が違えば書かずに別名へ回す', () => {
    const dir = tmpDir();
    const res = run(dir, [['post', 'diagram13', ACTOR, 'tab-1'], ['post', 'diagram13', SEQ, 'tab-2']]);
    expect(res.files).toEqual(['diagram13', 'diagram13_sequence']);
    expect(fs.readFileSync(path.join(dir, 'diagram13.puml'), 'utf8')).not.toContain('participant');
  });

  test('書いた後に外で書き換わったファイルは、同じタブでも今までどおり回す', () => {
    const dir = tmpDir();
    const res = run(dir, [
      ['post', 'diagram13', ACTOR, 'tab-1'],
      ['touch', 'diagram13', ['@startuml', 'actor Other', '@enduml'].join('\n')],
      ['post', 'diagram13', SEQ, 'tab-1'],
    ]);
    expect(res.files).toEqual(['diagram13', 'diagram13_sequence']);
    expect(fs.readFileSync(path.join(dir, 'diagram13.puml'), 'utf8')).toContain('actor Other');
  });
});

// client 側: 自動保存と保存 (workspace.saveToFile) の両方が書いたタブの印を載せる。
if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/regex-parts.js', '../src/core/parser-utils.js', '../src/core/workspace.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });

describe('保存フォルダへ書くとき、書いたタブの印を載せる', () => {
  test('workspace.saveToFile は doc.id を docId で送る', () => {
    let body = null;
    global.window.fetch = function(url, opt) { body = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
    global.window.MA.workspace.saveToFile({ id: 'd7', name: 'diagram13', dsl: 'x' }, './d');
    expect(body.docId).toBe('d7');
  });
  test('id の無い書き戻し (一括など) には載せない', () => {
    let body = null;
    global.window.fetch = function(url, opt) { body = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
    global.window.MA.workspace.saveToFile({ name: 'diagram13', dsl: 'x' }, './d');
    expect(body.docId).toBe(undefined);
  });
});
