'use strict';
// BLK-primary-20260924-0021-wish: 「この部品を使っている図はどれか」を引く「名前で図を探す」は在るのに、
// Ctrl+K で「使っている図」と打っても 0 件で見つけられなかった。IntelliJ の Find Usages に当たる語でも引け、
// 図やエディタで部品名を選んでから開くとその名前が入る (Ctrl+H の一括置換と同じ拾い方)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
['../src/core/html-utils.js', '../src/core/bulk-rename.js', '../src/core/command-palette.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var BR = global.window.MA.bulkRename;
var CP = global.window.MA.commandPalette;

// app.js のコマンド表から「名前で図を探す」の行の語を読む (表は app.js の中にしか無い)。
function nameSearchItem() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  var at = src.indexOf("{ id: 'name-search'");
  var body = src.slice(at, src.indexOf('run:', at));
  var title = body.match(/title: '([^']*)'/)[1];
  var kw = body.slice(body.indexOf('keywords: [') + 'keywords: ['.length, body.indexOf('],', body.indexOf('keywords: [')));
  var keywords = kw.split(',').map(function(s) { return s.trim().replace(/^'|'$/g, ''); }).filter(Boolean);
  return { id: 'name-search', title: title, hint: 'Search', keywords: keywords };
}

describe('BLK-primary-20260924-0021-wish 使っている図を Ctrl+K で引く', function() {
  var item = nameSearchItem();
  var other = { id: 'x', title: '変更サマリを開く / Change board', hint: 'Tabs', keywords: ['board'] };

  ['使っている図', '使われている', '参照', 'どこで使う', '影響', 'find usages', 'references'].forEach(function(q) {
    test('「' + q + '」で名前で図を探すが出る', function() {
      var got = CP.filter([other, item], q);
      expect(got.map(function(i) { return i.id; })).toContain('name-search');
      expect(got[0].id).toBe('name-search');
    });
  });

  test('今まで引けた語 (名前・部品・どの図) もそのまま', function() {
    ['名前', '部品', 'どの図', 'search'].forEach(function(q) {
      expect(CP.filter([item], q).length).toBe(1);
    });
  });
});

describe('BLK-primary-20260924-0021-wish 選んでいた部品名を入れて開く', function() {
  test('図で 1 つ選んだ要素の名前を先に使う', function() {
    expect(BR.seedForSearch([{ id: 'Spi_Driver', type: 'participant' }], 'Can_Driver')).toBe('Spi_Driver');
  });
  test('図で選んでいなければエディタで選んだ文字', function() {
    expect(BR.seedForSearch([], '  SpiDrv ')).toBe('SpiDrv');
    expect(BR.seedForSearch(null, 'SpiDrv')).toBe('SpiDrv');
  });
  test('メッセージ等の内部 id・複数選択・名前にならない選択は拾わない', function() {
    expect(BR.seedForSearch([{ id: '__r_0', type: 'message' }], '')).toBe('');
    expect(BR.seedForSearch([{ id: '__r_0', type: 'message' }], 'SpiDrv')).toBe('SpiDrv');
    expect(BR.seedForSearch([{ id: 'A' }, { id: 'B' }], '')).toBe('');
    expect(BR.seedForSearch([], 'Spi Driver -> Can')).toBe('');
    expect(BR.seedForSearch([], '')).toBe('');
  });
});
