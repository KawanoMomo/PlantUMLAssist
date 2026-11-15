'use strict';
// BLK-owner-20260924-1212-prune: 1 画面に寄せた機能が Ctrl+K に旧名の行を残していた
// (「影響」で ▤ 影響を見る を開く行が 3 つ、「履歴」で この図の履歴 の行に旧名「変遷」が並ぶ)。
// Ctrl+K は 1 画面 1 行 (画面の名前) にし、旧名は同じ行の検索語に落とす。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
['../src/core/tool-menu.js', '../src/core/command-palette.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var CP = global.window.MA.commandPalette;
var SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

// app.js のコマンド表から 1 行を読む (表は app.js の中にしか無い)。
function commandOf(id) {
  var at = SRC.indexOf("{ id: '" + id + "'");
  if (at < 0) return null;
  var body = SRC.slice(at, SRC.indexOf('run:', at));
  var title = body.match(/title: '([^']*)'/)[1];
  var g = body.match(/group: '([^']*)'/);
  var b = body.match(/button: '([^']*)'/);
  var kw = body.slice(body.indexOf('keywords: [') + 'keywords: ['.length, body.indexOf('],', body.indexOf('keywords: [')));
  var keywords = kw.split(',').map(function(s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
  var c = { id: id, title: title, keywords: keywords, run: function() {} };
  if (g) c.group = g[1];
  if (b) c.button = b[1];
  return c;
}

// part-board・tab-senior は TICKET-owner-20261115-2141-prune で外した (commandOf が null を返し filter で落ちる)。
var IDS = ['tab-versions', 'part-board', 'tab-senior', 'tab-rename'];
function items() {
  return CP.buildItems(IDS.map(commandOf).filter(Boolean), '');
}

// TICKET-owner-20261115-2140-prune: 図をまたぐ調べ物 (▤ 影響を見る・症状検索・混入点・呼び出しグラフ・
// 継承元・変更チケット) を外した。図をまたぐ操作は ⇄ 一括置換の 1 行だけが残る。
describe('TICKET-owner-20261115-2140-prune 図をまたぐ調べ物の行は Ctrl+K に無い', function() {
  ['name-search', 'dep-graph', 'tab-xref', 'tab-symptom', 'tab-blame', 'tab-lineage', 'call-graph', 'change-ticket'].forEach(function(id) {
    test(id + ' の行はコマンド表に無い', function() {
      expect(SRC.indexOf("{ id: '" + id + "'")).toBe(-1);
    });
  });

  test('⇄ 一括置換の行は残る', function() {
    expect(commandOf('tab-rename').button).toBe('btn-tab-rename');
  });

  test('ツール ▾ の案内行の文字 (→) は Ctrl+K の行に出ない', function() {
    items().forEach(function(i) {
      expect((i.title + i.hint).indexOf('→')).toBe(-1);
    });
  });
});

describe('BLK-owner-20260924-1212-prune この図の履歴 は Ctrl+K に 1 行', function() {
  ['履歴', '変遷', 'この図の変遷', 'version'].forEach(function(q) {
    test('「' + q + '」で この図の履歴を見る の行が 1 行、旧名「変遷」は行に出ない', function() {
      var got = CP.filter(items(), q);
      var v = got.filter(function(i) { return /tab-versions$/.test(i.id); });
      expect(v.length).toBe(1);
      expect(v[0].title).toBe('この図の履歴を見る');
      expect(v[0].hint).toBe('');
      got.forEach(function(i) { expect((i.title + i.hint).indexOf('変遷')).toBe(-1); });
    });
  });

});

describe('BLK-owner-20260924-1212-prune 部品ビュー の行名に立場の語を出さない', function() {
  // 🧩 部品ビューは TICKET-owner-20261115-2141-prune で外した。Ctrl+K にも行が無い。
  test('部品ビューの行は無い', function() {
    expect(items().filter(function(i) { return /part-board$/.test(i.id); }).length).toBe(0);
  });
});
