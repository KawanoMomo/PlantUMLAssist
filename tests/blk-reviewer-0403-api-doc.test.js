'use strict';
// BLK-reviewer-20260909-0403 「POST /verify-svg の要求の形が呼び出し側にしか無い」。
//
// 摩擦: curl / node から /verify-svg を叩く人は `{puml, svg}` を渡して 400 を 2 回踏み、
// src/app.js を grep して `{dir, types, mode}` に辿り着いていた。窓口自身が仕様を返す形
// (GET /api ・ GET /verify-svg ・ 400 に expected) にして、grep の往復を無くす。
//
// ここでは「窓口と文書が食い違わない」ことを守る。実際の応答は E2E (reviewer 4.10) で見る。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
var API_MD = fs.readFileSync(path.join(ROOT, 'docs', 'api.md'), 'utf8');

// server.py が実際に分岐しているパス。do_GET / do_POST / do_DELETE の比較から拾う。
function routes() {
  var out = {};
  var re = /self\.path(?:\.split\('\?'\)\[0\])?\s*(?:==|\.startswith\()\s*'(\/[a-z-]*)'/g;
  var m;
  while ((m = re.exec(SERVER))) { if (m[1] !== '/') out[m[1]] = true; }
  return Object.keys(out).sort();
}

function indexBlock() {
  var at = SERVER.indexOf('API_INDEX = {');
  return SERVER.slice(at, SERVER.indexOf("\n}\n", at));
}

describe('server API の窓口が自分で仕様を返す (BLK-reviewer-20260909-0403)', function() {

  test('分岐しているパスが 1 つ残らず GET /api の索引に載る', function() {
    var idx = indexBlock();
    routes().forEach(function(p) {
      // 索引は 'GET /x' 'POST /x' の形で書く。パスが出てくればよい。
      expect(idx.indexOf(" " + p + "'")).not.toBe(-1);
    });
  });

  test('分岐しているパスが 1 つ残らず docs/api.md に載る', function() {
    routes().forEach(function(p) {
      // 文書は `GET /api` のように動詞つきで書く。パスが本文に出てくればよい。
      expect(new RegExp(p + '[`\s?]').test(API_MD)).toBe(true);
    });
  });

  test('GET /api と GET /verify-svg が仕様を返す分岐を持つ', function() {
    expect(SERVER).toContain("if self.path.split('?')[0] == '/api':");
    expect(SERVER).toContain('return self._send_json(200, API_INDEX)');
    expect(SERVER).toContain("if self.path.split('?')[0] == '/verify-svg':");
    expect(SERVER).toContain('return self._send_json(200, VERIFY_SVG_API_DOC)');
  });

  test('/verify-svg の仕様が dir / types / mode を名指しし、puml と svg は渡さないと言う', function() {
    var at = SERVER.indexOf('VERIFY_SVG_API_DOC = {');
    var doc = SERVER.slice(at, SERVER.indexOf('\n}\n', at));
    expect(doc).toContain("'types'");
    expect(doc).toContain("'dir'");
    expect(doc).toContain("'mode'");
    expect(doc).toContain('puml / svg そのものは受け取らない');
    expect(doc).toContain('/verify-svg ');   // curl の例が窓口を名指しする
    expect(doc).toContain('curl -sS -X POST');
  });

  test('/verify-svg の 400 は必ず expected と example を添える (1 回目の失敗で形が分かる)', function() {
    var at = SERVER.indexOf('def _handle_verify_svg_post');
    var body = SERVER.slice(at, SERVER.indexOf('\n    def _handle_file_roles_post', at));
    var bad = body.match(/_send_json\(400, [^)]*\)/g) || [];
    expect(bad.length).toBeGreaterThan(0);
    bad.forEach(function(call) {
      expect(call).toContain('VERIFY_SVG_EXPECTED');
    });
    var exp = SERVER.slice(SERVER.indexOf('VERIFY_SVG_EXPECTED = {'));
    expect(exp).toContain("'doc': 'GET /verify-svg'");
    expect(exp).toContain("'example'");
  });

  test('docs/api.md は /verify-svg の要求の形と status の意味を書く', function() {
    expect(API_MD).toContain('{dir, types: [名前...], mode}');
    expect(API_MD).toContain('puml と svg は本文に渡さない');
    ['match', 'differ-format', 'differ-content', 'missing', 'error'].forEach(function(s) {
      expect(API_MD).toContain('`' + s + '`');
    });
  });
});
