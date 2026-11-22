'use strict';
// BLK-reviewer-20260914-1606 「POST /verify-svg のエラー応答が読めない」。
// /verify-svg は TICKET-owner-20261116-0241-prune で外したので、JSON の仕様を返す GET /render で確かめる。
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
    const got = fetchRaw('/render');
    expect(got.status).toBe(200);
    expect(declared(got.ctype)).toBe('utf-8');
    const text = got.bytes.toString('utf8');
    expect(JSON.parse(text).endpoint).toBe('POST /render');
    // 日本語がそのまま入っている (\uXXXX に潰していない)。
    expect(/[぀-ヿ一-龯]/.test(text)).toBe(true);
  });

  test('?charset=ascii は us-ascii を名乗り、実バイト列に非 ASCII が 1 バイトも無い', function() {
    const got = fetchRaw('/render?charset=ascii');
    expect(got.status).toBe(200);
    expect(declared(got.ctype)).toBe('us-ascii');
    expect(got.bytes.every(function(b) { return b < 0x80; })).toBe(true);
    // 逃がしても中身は同じ。日本語は \uXXXX から戻る。
    const doc = JSON.parse(got.bytes.toString('ascii'));
    expect(doc.endpoint).toBe('POST /render');
    expect(/[぀-ヿ一-龯]/.test(doc.request.fields.text)).toBe(true);
  });

  test('Accept-Charset: shift_jis は Shift_JIS を名乗り、実バイト列も cp932 である', function() {
    const got = fetchRaw('/render', { 'Accept-Charset': 'shift_jis' });
    expect(declared(got.ctype)).toBe('shift_jis');
    // utf-8 では読めない (= 本当に cp932 で返っている)。
    expect(got.bytes.every(function(b) { return b < 0x80; })).toBe(false);
    expect(got.bytes.toString('utf8')).toContain('�');
  });

  test('知らない charset は utf-8 に落ちる (宣言と実体は食い違わない)', function() {
    const got = fetchRaw('/render?charset=ebcdic');
    expect(declared(got.ctype)).toBe('utf-8');
    expect(JSON.parse(got.bytes.toString('utf8')).endpoint).toBe('POST /render');
  });
});
