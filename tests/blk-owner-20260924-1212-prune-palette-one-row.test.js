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

var IDS = ['name-search', 'tab-versions', 'tab-audit-timeline', 'tab-lineage', 'tab-symptom', 'tab-blame', 'part-board', 'tab-senior'];
function items() {
  return CP.buildItems(IDS.map(commandOf).filter(Boolean), '');
}

describe('BLK-owner-20260924-1212-prune ▤ 影響を見る は Ctrl+K に 1 行', function() {
  test('旧名の行 (依存グラフ / 参照関係) はコマンド表に無い', function() {
    expect(SRC.indexOf("{ id: 'dep-graph'")).toBe(-1);
    expect(SRC.indexOf("{ id: 'tab-xref'")).toBe(-1);
  });

  test('▤ 影響を見る を開くコマンドは表に 1 つだけ', function() {
    var n = SRC.split('run: function() { openImpactScreen(_nameSearchSeed()); } }').length - 1;
    expect(n).toBe(1);
  });

  test('行の名前は画面の名前 (影響を見る) で、分類は 探す', function() {
    var it = items().filter(function(i) { return /name-search$/.test(i.id); })[0];
    expect(it.title.indexOf('影響を見る')).toBe(0);
    expect(it.group).toBe('find');
    expect(it.badge).toBe('探す');
    expect(it.hint).toBe('');
  });

  ['影響', '依存', '依存グラフ', '参照関係', '名前で図', '名前で図を探す', '図をまたいで', 'xref', 'impact'].forEach(function(q) {
    test('「' + q + '」で打つと 影響を見る の行が先頭に 1 行だけ出る', function() {
      var got = CP.filter(items(), q);
      var impact = got.filter(function(i) { return /影響を見る/.test(i.title + ' ' + i.hint); });
      expect(impact.length).toBe(1);
      expect(/name-search$/.test(got[0].id)).toBe(true);
    });
  });

  test('ツール ▾ の案内行 (→ ▤ 影響を見る) の文字は Ctrl+K の行に出ない', function() {
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
  test('行名に「先輩」が無く、先輩で打っても引ける', function() {
    var it = items().filter(function(i) { return /part-board$/.test(i.id); })[0];
    expect(it.title.indexOf('先輩')).toBe(-1);
    var got = CP.filter(items(), '先輩');
    expect(/part-board/.test(got.map(function(i) { return i.id; }).join(' '))).toBe(true);
  });
});
