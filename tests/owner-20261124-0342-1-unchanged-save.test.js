'use strict';
// TICKET-owner-20261124-0342-1: 書き出した後に本文を直さず Ctrl+S・自動保存・タブの切り替えをしても、
// Export ▾ の「書き出し先:」の行が「…は保存後に直した本文より古い」と言わない。
// 古さは GET /export-file が .puml と画像の更新時刻で決めるので、POST /autosave は中身が 1 バイトも
// 違わなければ .puml を書き直さない (更新時刻を進めない)。直して保存したときは今どおり書いて古いと言う。
// 実マウスの確かめは tests/scenarios/owner-20261124-0342-1.spec.js。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const work = path.join(projectRoot, 'test-results', 'unit-unchanged-save');

function runServer(lines) {
  const script = [
    'import importlib.util, json, os, threading, time, urllib.request, urllib.error, urllib.parse',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'class H(srv.Handler):',
    '    def log_message(self, *a): pass',
    'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
    'server.daemon_threads = True',
    'threading.Thread(target=server.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % server.server_address[1]',
    'def save(body):',
    '    req = urllib.request.Request(base + "/autosave", data=json.dumps(body).encode("utf-8"),',
    '                                 headers={"Content-Type": "application/json"}, method="POST")',
    '    r = urllib.request.urlopen(req, timeout=10)',
    '    return json.loads(r.read())',
    'def stale(d, name):',
    '    r = urllib.request.urlopen(base + "/export-file?" + urllib.parse.urlencode({"dir": d, "name": name, "sub": ""}), timeout=10)',
    '    b = json.loads(r.read())',
    '    return sorted(e["kind"] for e in b["exports"] if e["exists"] and e["stale"])',
    'def mt(p):',
    '    return os.stat(p).st_mtime_ns',
    'def raw(p):',
    '    with open(p, "rb") as f:',
    '        return f.read().hex()',
    'out = {}',
  ].concat(lines, ['server.shutdown()', 'print(json.dumps(out))']).join('\n');
  return JSON.parse(execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim());
}

function hex(s) { return Buffer.from(s, 'utf8').toString('hex'); }

describe('POST /autosave: 中身が同じ保存は .puml を書き直さない (書き出しを古いと言わない)', function() {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const dir = work.replace(/\\/g, '/');
  const lf = '@startuml\nA -> B : ok2\n@enduml\n';
  const crlf = '@startuml\r\nA -> B : x\r\n@enduml\r\n';
  const bom = '﻿@startuml\nA -> B : y\n@enduml\n';
  fs.writeFileSync(path.join(work, 'a.puml'), lf);
  fs.writeFileSync(path.join(work, 'a.svg'), '<svg/>');
  fs.writeFileSync(path.join(work, 'a.png'), 'PNG');
  fs.writeFileSync(path.join(work, 'c.puml'), crlf);
  fs.writeFileSync(path.join(work, 'b.puml'), bom);
  const res = runServer([
    `d = r"${dir}"`,
    'A = os.path.join(d, "a.puml")',
    'C = os.path.join(d, "c.puml")',
    'B = os.path.join(d, "b.puml")',
    // 書き出した後 (画像が .puml より新しい) に、直さずに保存する
    'os.utime(A, (2000, 2000))',
    'os.utime(os.path.join(d, "a.svg"), (3000, 3000))',
    'os.utime(os.path.join(d, "a.png"), (3000, 3000))',
    'os.utime(C, (2000, 2000))',
    'os.utime(B, (2000, 2000))',
    'out["staleBefore"] = stale(d, "a")',
    `r1 = save({"type": "a", "dir": d, "dsl": ${JSON.stringify(lf)}, "eol": "lf"})`,
    `r1b = save({"type": "a", "dir": d, "dsl": ${JSON.stringify(lf)}})`,
    'out["same"] = {"ok": r1["ok"], "written": r1["written"], "written2": r1b["written"], "mtime": mt(A), "raw": raw(A), "stale": stale(d, "a")}',
    // 改行 (CRLF) と BOM を引き継ぐ図も、中身が同じなら書かない
    `r2 = save({"type": "c", "dir": d, "dsl": ${JSON.stringify(crlf.replace(/\r\n/g, '\n'))}})`,
    'out["crlf"] = {"written": r2["written"], "eol": r2["eol"], "mtime": mt(C), "raw": raw(C)}',
    `r3 = save({"type": "b", "dir": d, "dsl": ${JSON.stringify(bom.replace(/^﻿/, ''))}})`,
    'out["bom"] = {"written": r3["written"], "bom": r3["bom"], "mtime": mt(B), "raw": raw(B)}',
    // 1 字直して保存すると書き、書き出しは古いと言う
    `r4 = save({"type": "a", "dir": d, "dsl": ${JSON.stringify(lf.replace('ok2', 'ok3'))}, "eol": "lf"})`,
    'out["edited"] = {"written": r4["written"], "newer": mt(A) > 3000 * 10**9, "raw": raw(A), "stale": stale(d, "a")}',
    // 改行の指定だけが違う (LF の図を CRLF で書く) のは中身の違い: 書く
    `r5 = save({"type": "c", "dir": d, "dsl": ${JSON.stringify(crlf.replace(/\r\n/g, '\n'))}, "eol": "lf"})`,
    'out["eolChange"] = {"written": r5["written"], "raw": raw(C)}',
  ]);

  test('書き出した直後は古くない', function() {
    expect(res.staleBefore).toEqual([]);
  });
  test('直さずに保存 (Ctrl+S・自動保存・タブの切り替え) は保存済みのまま .puml の更新時刻を進めず、古いと言わない', function() {
    expect(res.same.ok).toBe(true);
    expect(res.same.written).toBe(false);
    expect(res.same.written2).toBe(false);
    expect(res.same.mtime).toBe(2000 * 1e9);
    expect(res.same.raw).toBe(hex(lf));
    expect(res.same.stale).toEqual([]);
  });
  test('CRLF・BOM の図も中身が同じなら書かない (バイトはそのまま)', function() {
    expect(res.crlf.written).toBe(false);
    expect(res.crlf.eol).toBe('crlf');
    expect(res.crlf.mtime).toBe(2000 * 1e9);
    expect(res.crlf.raw).toBe(hex(crlf));
    expect(res.bom.written).toBe(false);
    expect(res.bom.bom).toBe(true);
    expect(res.bom.mtime).toBe(2000 * 1e9);
    expect(res.bom.raw).toBe(hex(bom));
  });
  test('直して保存すると書き、SVG · PNG は古いと言う', function() {
    expect(res.edited.written).toBe(true);
    expect(res.edited.newer).toBe(true);
    expect(res.edited.raw).toBe(hex(lf.replace('ok2', 'ok3')));
    expect(res.edited.stale).toEqual(['png', 'svg']);
  });
  test('バイトが変わる保存 (改行の指定が違う) は書く', function() {
    expect(res.eolChange.written).toBe(true);
    expect(res.eolChange.raw).toBe(hex(crlf.replace(/\r\n/g, '\n')));
  });
});
