'use strict';
// BLK-reviewer-20260914-1606 「POST /verify-svg のエラー応答が読めない」。
//
// 摩擦: cp932 のコンソールから curl / python で 400 を受けると、日本語のエラー本文・
// fields 説明・example が端末の側で化け、正しいフィールド名を知るために server.py を
// 直接読む羽目になっていた (本文自体は utf-8 で正しく、化けているのは端末)。
// 呼ぶ側が文字コードを選べるようにし、**宣言した charset で必ず decode できる**ことを守る。
//
// 実際に server を起こして応答のバイト列を見る (源文の grep では「宣言と実体の一致」は守れない)。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// server を同一プロセスで起こし、1 本の GET を投げてヘッダと生バイトを JSON で吐く。
function fetchRaw(pathAndQuery, headers) {
  const script = [
    'import importlib.util, json, threading, urllib.request',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'import http.server',
    'httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)',
    'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    'port = httpd.server_address[1]',
    `req = urllib.request.Request("http://127.0.0.1:%d${pathAndQuery}" % port)`,
    `for k, v in ${JSON.stringify(headers || {})}.items(): req.add_header(k, v)`,
    'try:',
    '    r = urllib.request.urlopen(req)',
    '    body = r.read()',
    'except urllib.error.HTTPError as e:',
    '    r, body = e, e.read()',
    'print(json.dumps({"status": r.status, "ctype": r.headers.get("Content-Type"),',
    '                  "body": list(body)}))',
  ].join('\n');
  const out = execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 60000,
  }).trim();
  const got = JSON.parse(out.split('\n').pop());
  got.bytes = Buffer.from(got.body);
  return got;
}

// Content-Type が名乗った charset を取り出す。
function declared(ctype) {
  const m = /charset=([\w-]+)/i.exec(ctype || '');
  return m ? m[1].toLowerCase() : '';
}

describe('JSON 応答の文字コードを呼ぶ側が選べる (BLK-reviewer-20260914-1606)', function() {

  test('既定は utf-8 を名乗り、実バイト列も utf-8 で読める', function() {
    const got = fetchRaw('/verify-svg');
    expect(got.status).toBe(200);
    expect(declared(got.ctype)).toBe('utf-8');
    const text = got.bytes.toString('utf8');
    expect(JSON.parse(text).endpoint).toBe('POST /verify-svg');
    // 日本語がそのまま入っている (\uXXXX に潰していない)。
    expect(/[぀-ヿ一-龯]/.test(text)).toBe(true);
  });

  test('?charset=ascii は us-ascii を名乗り、実バイト列に非 ASCII が 1 バイトも無い', function() {
    const got = fetchRaw('/verify-svg?charset=ascii');
    expect(got.status).toBe(200);
    expect(declared(got.ctype)).toBe('us-ascii');
    expect(got.bytes.every(function(b) { return b < 0x80; })).toBe(true);
    // 逃がしても中身は同じ。日本語は \uXXXX から戻る。
    const doc = JSON.parse(got.bytes.toString('ascii'));
    expect(doc.endpoint).toBe('POST /verify-svg');
    expect(/[぀-ヿ一-龯]/.test(doc.summary)).toBe(true);
  });

  test('Accept-Charset: shift_jis は Shift_JIS を名乗り、実バイト列も cp932 である', function() {
    const got = fetchRaw('/verify-svg', { 'Accept-Charset': 'shift_jis' });
    expect(declared(got.ctype)).toBe('shift_jis');
    // utf-8 では読めない (= 本当に cp932 で返っている)。
    expect(got.bytes.every(function(b) { return b < 0x80; })).toBe(false);
    expect(got.bytes.toString('utf8')).toContain('�');
  });

  test('知らない charset は utf-8 に落ちる (宣言と実体は食い違わない)', function() {
    const got = fetchRaw('/verify-svg?charset=ebcdic');
    expect(declared(got.ctype)).toBe('utf-8');
    expect(JSON.parse(got.bytes.toString('utf8')).endpoint).toBe('POST /verify-svg');
  });

  test('400 の日本語が化けても、ASCII の併記だけで正しい形が分かる', function() {
    // reviewer の手順そのもの: types を落とした POST を cp932 の端末で受ける。
    // 化けたバイト列から ASCII だけを拾っても types / dir / mode が読めること。
    const script = [
      'import importlib.util, json, threading, urllib.request, http.server',
      `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
      'srv = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(srv)',
      'httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)',
      'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
      'port = httpd.server_address[1]',
      'req = urllib.request.Request("http://127.0.0.1:%d/verify-svg" % port,',
      '                             data=json.dumps({"dir": "x"}).encode("utf-8"),',
      '                             headers={"Content-Type": "application/json"})',
      'try:',
      '    body = urllib.request.urlopen(req).read()',
      'except urllib.error.HTTPError as e:',
      '    body = e.read()',
      'print(json.dumps({"body": list(body)}))',
    ].join('\n');
    const out = execFileSync('python', ['-c', script], {
      cwd: projectRoot, encoding: 'utf8', timeout: 60000,
    }).trim();
    const bytes = Buffer.from(JSON.parse(out.split('\n').pop()).body);
    // cp932 の端末が見る「化けた文字列」を、ASCII 以外を落として再現する。
    const garbled = bytes.toString('latin1').replace(/[^\x20-\x7e]/g, '');
    expect(garbled).toContain("'types' is required");
    expect(garbled).toContain('array of diagram names');
    expect(garbled).toContain('full path');
    expect(garbled).toContain("'local' (default");
    // 打ち直しに使う example も ASCII なのでそのまま読める。
    expect(garbled).toContain('curl -sS -X POST');
  });

  test('/verify-svg の 400 はどの理由でも ASCII の言い直しを添える', function() {
    const fs = require('fs');
    const SERVER = fs.readFileSync(path.join(projectRoot, 'server.py'), 'utf8');
    const at = SERVER.indexOf('def _handle_verify_svg_post');
    const body = SERVER.slice(at, SERVER.indexOf('\n    def ', at + 10));
    const sends = body.match(/_send_json\(400,/g) || [];
    expect(sends.length).toBeGreaterThan(0);
    expect((body.match(/'errorAscii':/g) || []).length).toBe(sends.length);
  });

  test('fieldsAscii が日本語の fields と同じ項目を漏れなく持つ', function() {
    const fs = require('fs');
    const SERVER = fs.readFileSync(path.join(projectRoot, 'server.py'), 'utf8');
    ['types', 'dir', 'mode'].forEach(function(k) {
      const at = SERVER.indexOf("'fieldsAscii': {");
      const block = SERVER.slice(at, SERVER.indexOf('\n    },', at));
      expect(block).toContain("'" + k + "':");
    });
  });

  test('400 の expected に、化けたままでも読める ASCII の逃げ道が載る', function() {
    // ここは源文で見る (400 を出すには POST が要る。応答の中身の規約を守ればよい)。
    const fs = require('fs');
    const SERVER = fs.readFileSync(path.join(projectRoot, 'server.py'), 'utf8');
    const at = SERVER.indexOf('VERIFY_SVG_EXPECTED = {');
    const block = SERVER.slice(at, SERVER.indexOf('\n}\n', at));
    expect(block).toContain("'charset'");
    const line = /'charset':\s*"([^"]*)"/.exec(block)[1];
    expect(line).toContain('?charset=ascii');
    // 逃げ道の一行自体が非 ASCII を含んでいたら、化けた応答の中で読めない。
    expect(/^[\x20-\x7e]+$/.test(line)).toBe(true);
  });
});
