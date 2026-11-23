'use strict';
// TICKET-owner-20261123-0642-prune: 外した監査・突合の server 側の消し残しを外す。
//   - 書き出した svg に印を足して保存先へ書く口 (POST /autosave-svg) と、保存先の親に台帳を書く口
//     (GET/POST /cohort-ack) は 404。GET /api の索引にも docs/api.md にも無い
//   - GET /autosave の一覧は隣の svg の印・時刻・指紋を返さない (読む画面が無い)。dsl・hash などは今のまま
//   - 前の版が残した {type}.svg (末尾の印つき) と保存先の親の _cohort-ack.json は、一覧を読んでも
//     読まず・書かず・消さない (バイト一致)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const GONE = ['autosave-svg', 'cohort-ack', 'cohort_ack', '_svg_stamp', 'Svg-Stamp', 'svgSource'];

function runPython(lines, env) {
  const script = [
    'import importlib.util, json, os, threading, urllib.request, urllib.error',
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

describe('server の消し残し (TICKET-owner-20261123-0642-prune)', function() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-0642-'));
  const parent = path.join(sandbox, 'work');
  const saveDir = path.join(parent, 'diagrams');
  fs.mkdirSync(saveDir, { recursive: true });
  const PUML = '@startuml\nA -> B : hello\n@enduml\n';
  const SVG = '<svg><text>old</text></svg>\n<!-- @pua-source-sha1 0123456789abcdef0123456789abcdef01234567 -->\n';
  const ACK = '{"entries": [{"key": "k1", "note": "利用者のファイル"}]}\n';
  fs.writeFileSync(path.join(saveDir, 'a.puml'), PUML);
  fs.writeFileSync(path.join(saveDir, 'a.svg'), SVG);
  fs.writeFileSync(path.join(parent, '_cohort-ack.json'), ACK);
  const before = {
    svg: fs.readFileSync(path.join(saveDir, 'a.svg')).toString('base64'),
    ack: fs.readFileSync(path.join(parent, '_cohort-ack.json')).toString('base64'),
  };

  const out = JSON.parse(runPython([
    'httpd = srv.ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)',
    'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    'base = "http://127.0.0.1:%d" % httpd.server_address[1]',
    'def code(req):',
    '    try:',
    '        return urllib.request.urlopen(req).status',
    '    except urllib.error.HTTPError as e:',
    '        return e.code',
    'def post(p, body):',
    '    return urllib.request.Request(base + p, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")',
    'd = ' + JSON.stringify(saveDir),
    'res = {}',
    'res["svgPost"] = code(post("/autosave-svg", {"type": "a", "dir": d, "svg": "<svg/>"}))',
    'res["ackGet"] = code(base + "/cohort-ack?dir=" + urllib.parse.quote(d))',
    'res["ackPost"] = code(post("/cohort-ack", {"dir": d, "entries": []}))',
    'lst = json.loads(urllib.request.urlopen(base + "/autosave?dir=" + urllib.parse.quote(d)).read())',
    'res["names"] = lst["files"]',
    'res["entry"] = lst["entries"][0]',
    'idx = json.loads(urllib.request.urlopen(base + "/api").read())',
    'res["index"] = [e["endpoint"] for e in idx["endpoints"]]',
    'rdoc = urllib.request.urlopen(base + "/render")',
    'res["renderDoc"] = json.loads(rdoc.read())',
    'httpd.shutdown()',
    'print(json.dumps(res, ensure_ascii=False))',
  ], { PUA_DATA_ROOT: path.join(sandbox, 'data') }));

  test('POST /autosave-svg・GET /cohort-ack・POST /cohort-ack は 404', function() {
    expect(out.svgPost).toBe(404);
    expect(out.ackGet).toBe(404);
    expect(out.ackPost).toBe(404);
  });

  test('前の版が残した svg (印つき) と保存先の親の _cohort-ack.json はバイト一致で残り、svg を新しく書かない', function() {
    expect(fs.readFileSync(path.join(saveDir, 'a.svg')).toString('base64')).toBe(before.svg);
    expect(fs.readFileSync(path.join(parent, '_cohort-ack.json')).toString('base64')).toBe(before.ack);
    expect(fs.readdirSync(saveDir).sort()).toEqual(['a.puml', 'a.svg']);
    expect(fs.readdirSync(parent).sort()).toEqual(['_cohort-ack.json', 'diagrams']);
  });

  test('GET /autosave の一覧は今までの欄 (name・hash・mtime) を返し、svg の印・時刻・指紋は返さない', function() {
    expect(out.names).toEqual(['a']);
    expect(out.entry.name).toBe('a');
    expect(typeof out.entry.hash).toBe('string');
    expect(out.entry.hash.length).toBe(40);
    expect(typeof out.entry.mtime).toBe('string');
    ['svgSource', 'svgSourceFrom', 'svgHash', 'svgMtime'].forEach(function(k) {
      expect(Object.prototype.hasOwnProperty.call(out.entry, k)).toBe(false);
    });
  });

  test('GET /api の索引と GET /render の仕様に、外した口と印の説明が無い', function() {
    const joined = out.index.join('\n');
    expect(joined.indexOf('/autosave-svg')).toBe(-1);
    expect(joined.indexOf('/cohort-ack')).toBe(-1);
    expect(out.index).toContain('GET /autosave');
    expect(out.index).toContain('GET /export-file');
    expect(Object.prototype.hasOwnProperty.call(out.renderDoc, 'comparison')).toBe(false);
  });

  test('server.py と docs/api.md に外した口・印の語が 0 件', function() {
    const files = ['server.py', path.join('docs', 'api.md')];
    files.forEach(function(f) {
      const src = fs.readFileSync(path.join(projectRoot, f), 'utf8');
      GONE.forEach(function(w) {
        expect(src.indexOf(w)).toBe(-1);
      });
    });
  });
});
