'use strict';
// TICKET-owner-20261115-2100-2: README が外した CLI (監査・指摘ピン・依頼の台帳) を載せない。
// README に書いた `npm run <名前>` は package.json の scripts にあり、`tools/<名前>.js` は実在する。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
var SCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};

function npmNames(text) {
  var out = [], m, re = /npm run ([A-Za-z0-9:_-]+)/g;
  while ((m = re.exec(text))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
function toolFiles(text) {
  var out = [], m, re = /tools\/([A-Za-z0-9_-]+)(\.js)?/g;
  while ((m = re.exec(text))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

describe('README の CLI の記述', function() {
  test('README の npm run の名前は package.json の scripts に全部ある', function() {
    var missing = npmNames(README).filter(function(n) { return !Object.prototype.hasOwnProperty.call(SCRIPTS, n); });
    expect(missing).toEqual([]);
  });

  test('README の tools/ のファイルは全部実在する', function() {
    var missing = toolFiles(README).filter(function(n) { return !fs.existsSync(path.join(ROOT, 'tools', n + '.js')); });
    expect(missing).toEqual([]);
  });

  test('外した CLI の名前が README に無い', function() {
    ['npm run audit', 'npm run pins', 'npm run requests', 'npm run findings', 'npm run replies', 'npm run blk-triage',
      'audit-runtime', '監査 CLI', '依頼の台帳 CLI'].forEach(function(w) {
      expect(README).not.toContain(w);
    });
  });

  test('読み方は外した名前を拾う (変異で落ちる)', function() {
    expect(npmNames('npm run audit -- a\nnpm run test:unit')).toEqual(['audit', 'test:unit']);
    expect(toolFiles('node tools/pins.js x; require("./tools/audit-runtime")')).toEqual(['pins', 'audit-runtime']);
  });
});
