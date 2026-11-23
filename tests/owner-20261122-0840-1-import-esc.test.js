'use strict';
// TICKET-owner-20261122-0840-1: Import ▾ をマウスで開くと Esc で閉じなかった。
// 実マウスの確かめは tests/scenarios/owner-20261122-0840.spec.js。ここは文書の入口の語を守る:
// README と製品仕様書は、最近開いた図の入口を画面に無い「Import ▾ の 🕘 最近開いた図」と書かず、
// 画面の Import ▾ の項目「保存フォルダの図を開く（一覧）」の上端として書く。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
var SPEC = fs.readFileSync(path.join(ROOT, 'docs', 'spec', 'product-spec.md'), 'utf8');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');

function importMenuItems() {
  var m = /<div[^>]*id="import-menu"[^>]*>([\s\S]*?)<\/div>/.exec(HTML);
  if (!m) throw new Error('#import-menu が無い');
  var out = [];
  var re = /<button[^>]*>([^<]*)/g, r;
  while ((r = re.exec(m[1]))) out.push(r[1].trim());
  return out;
}

describe('最近開いた図の入口は画面どおりに書く (TICKET-owner-20261122-0840-1)', function() {
  test('Import ▾ に最近開いた図の項目は無い', function() {
    var items = importMenuItems();
    expect(items.length).toBeGreaterThanOrEqual(3);
    items.forEach(function(t) { expect(t.indexOf('最近開いた図') < 0).toBe(true); });
  });
  test('README と製品仕様書に「🕘 最近開いた図」「Import ▾ の 🕘」の語が無い', function() {
    [README, SPEC].forEach(function(doc) {
      expect(doc.indexOf('🕘 最近開いた図') < 0).toBe(true);
      expect(doc.indexOf('Import ▾ の 🕘') < 0).toBe(true);
    });
  });
  test('README と製品仕様書は、最近開いた図を Import ▾ の一覧を開く項目 (#imp-folder) の上端と書く', function() {
    // 項目の語は TICKET-owner-20261123-1202-1 で「保存先の一覧を開く」に揃えた。語は画面の #imp-folder から読む。
    var item = (/<button id="imp-folder">([^<]*)/.exec(HTML) || [])[1];
    expect(item).toBe('保存先の一覧を開く');
    expect(!!item).toBe(true);
    [README, SPEC].forEach(function(doc) {
      expect(doc.indexOf('「' + item + '」)の「最近開いた図」') >= 0).toBe(true);
    });
  });
});
