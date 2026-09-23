'use strict';
// BLK-builder-20260924-0752-2b-red: 保存先の一覧は、庫 (提出物) と札を読み終えた時点で
// 丸ごと描き直す。その前に「履歴 N」を押して開いた版の一覧は、描き直しで黙って消えていた
// (読み込みが遅い回ほど、押した後に描き直しが来る)。描き直す直前に開いていた版の一覧を
// 控え、描き直した一覧の同じ図の「履歴」をもう一度開く部分だけを見る (fetch と描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/version-history.js')]; } catch (e) {}
require('../src/core/version-history.js');
var vh = global.window.MA.versionHistory;
// 一覧の DOM は手元の jsdom で組む (run-tests の window は document を持たないことがある)。
var doc = new (require('jsdom').JSDOM)('<!DOCTYPE html><html><body></body></html>').window.document;

function panelWith(html) {
  var el = doc.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('versionHistory.openListNames', () => {
  test('開いている版の一覧の図名を、並びどおりに返す', () => {
    var p = panelWith(
      '<div class="folder-row"><button data-versions-name="gpio_state">履歴 1</button></div>'
      + '<div class="folder-version-list" data-version-list="gpio_state"></div>'
      + '<div class="folder-row"><button data-versions-name="spi_seq">履歴 2</button></div>'
      + '<div class="folder-version-list" data-version-list="spi_seq"></div>');
    expect(vh.openListNames(p)).toEqual(['gpio_state', 'spi_seq']);
  });

  test('何も開いていなければ空、panel が無くても空', () => {
    expect(vh.openListNames(panelWith('<button data-versions-name="a">履歴 1</button>'))).toEqual([]);
    expect(vh.openListNames(null)).toEqual([]);
  });
});

describe('versionHistory.reopenLists', () => {
  test('描き直した一覧の同じ図の「履歴」ボタンで、もう一度開く', () => {
    var p = panelWith(
      '<button data-versions-name="gpio_state">履歴 1</button>'
      + '<button data-versions-name="spi_seq">履歴 2</button>');
    var calls = [];
    var n = vh.reopenLists(p, ['spi_seq'], function(name, btn) { calls.push([name, btn.textContent]); });
    expect(n).toBe(1);
    expect(calls).toEqual([['spi_seq', '履歴 2']]);
  });

  test('描き直しで版が無くなった図 (ボタンが無い) は開かない', () => {
    var p = panelWith('<button data-versions-name="gpio_state">履歴 1</button>');
    var calls = [];
    expect(vh.reopenLists(p, ['gone_one'], function(name) { calls.push(name); })).toBe(0);
    expect(calls).toEqual([]);
  });

  test('既に開いている図は開き直さない (押すと閉じる作りなので 2 度押さない)', () => {
    var p = panelWith(
      '<button data-versions-name="gpio_state">履歴 1</button>'
      + '<div data-version-list="gpio_state"></div>');
    var calls = [];
    expect(vh.reopenLists(p, ['gpio_state'], function(name) { calls.push(name); })).toBe(0);
    expect(calls).toEqual([]);
  });

  test('引用符や括弧を含む図名でも、名前をそのまま比べて見つける', () => {
    var p = panelWith('<button>x</button>');
    var b = doc.createElement('button');
    b.setAttribute('data-versions-name', 'a"b[1]');
    p.appendChild(b);
    var calls = [];
    expect(vh.reopenLists(p, ['a"b[1]'], function(name) { calls.push(name); })).toBe(1);
    expect(calls).toEqual(['a"b[1]']);
  });
});
