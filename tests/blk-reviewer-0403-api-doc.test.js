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

  test('GET /api が索引を返す分岐を持つ', function() {
    expect(SERVER).toContain("if self.path.split('?')[0] == '/api':");
    expect(SERVER).toContain('return self._send_json(200, API_INDEX)');
  });

  // 保存中の svg を描き直して比べる窓口 (/verify-svg) は TICKET-owner-20261116-0241-prune で外した。
  // 窓口・仕様・索引のどこにも残さない (隠して残さない)。
  test('/verify-svg の窓口・仕様・索引が残っていない', function() {
    expect(routes().indexOf('/verify-svg')).toBe(-1);
    expect(SERVER).not.toContain('VERIFY_SVG_API_DOC');
    expect(SERVER).not.toContain('_handle_verify_svg_post');
    expect(indexBlock()).not.toContain('/verify-svg');
  });
});
