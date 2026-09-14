'use strict';
// BLK-junior-20260907-1903: 「一括 (複数行)」は種別の並びの最後で、チップにすると
// 「一括」の 2 字。4 部品 + 6 関係を 1 件ずつ足し切ってから存在に気付く、が起きた。
// 種別の列とは別に「まとめて入れられる」ことだけを言う 1 行を常に出し、
// どの種別を選んでいても 1 クリックで一括欄に入れる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/tail-kind-chips.js')]; } catch (e) {}
require('../src/core/tail-kind-chips.js');
var chips = global.window.MA.tailKindChips;

var CO_KINDS = [
  { value: 'component', label: 'Component' },
  { value: 'interface', label: 'Interface' },
  { value: 'port', label: 'Port' },
  { value: 'package', label: '境界 (package / folder / frame / node / rectangle)' },
  { value: 'relation', label: 'Relation (関係)' },
  { value: 'bulk', label: '一括 (複数行)' },
];

describe('tail-kind-chips — 一括入力の呼び込み (BLK-junior-1903)', () => {
  test('promoModel: 一括を選んでいなくても出る。何ができるかを文で言う', () => {
    var m = chips.promoModel(CO_KINDS, 'component');
    expect(m === null).toBe(false);
    expect(m.value).toBe('bulk');
    expect(m.active).toBe(false);
    expect(m.label.indexOf('まとめて入れる')).toBeGreaterThan(-1);
    expect(m.hint.indexOf('1 行 1 件')).toBeGreaterThan(-1);
  });

  test('promoModel: 一括を選んでいる間は「選択中」と書き、文言も入力の案内に変わる', () => {
    var m = chips.promoModel(CO_KINDS, 'bulk');
    expect(m.active).toBe(true);
    expect(m.label.indexOf('選択中')).toBeGreaterThan(-1);
    expect(m.hint.indexOf('末尾に追加')).toBeGreaterThan(-1);
  });

  test('promoModel: 一括の選択肢が無い種別では出さない (呼び込む先が無い)', () => {
    var noBulk = CO_KINDS.filter(function(k) { return k.value !== 'bulk'; });
    expect(chips.promoModel(noBulk, 'component')).toBe(null);
    expect(chips.promoModel([], 'component')).toBe(null);
    expect(chips.promoHtml('co-tail-kind', null)).toBe('');
  });

  test('promoHtml: id は {prefix}-bulk-promo。押せるボタンとして出る', () => {
    var html = chips.promoHtml('co-tail-kind', chips.promoModel(CO_KINDS, 'component'));
    expect(html.indexOf('id="co-tail-kind-bulk-promo"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-value="bulk"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-pressed="false"')).toBeGreaterThan(-1);
  });
});

describe('tail-kind-chips — 呼び込みの mount (BLK-junior-1903)', () => {
  function setup(current, kinds) {
    var list = kinds || CO_KINDS;
    var d = global.document;
    d.body.innerHTML =
      '<div id="pane"><div id="wrap"><label>種類</label>' +
      '<select id="co-tail-kind">' +
      list.map(function(k) {
        return '<option value="' + k.value + '"' + (k.value === current ? ' selected' : '') + '>' + k.label + '</option>';
      }).join('') +
      '</select></div></div>';
    var changes = [];
    d.getElementById('co-tail-kind').addEventListener('change', function(e) { changes.push(e.target.value); });
    chips.mount('co-tail-kind');
    return { d: d, changes: changes, sel: d.getElementById('co-tail-kind') };
  }

  test('呼び込みはチップ列の上に入り、既定の Component 選択でも見えている', () => {
    var s = setup('component');
    var promo = s.d.getElementById('co-tail-kind-bulk-promo');
    expect(promo === null).toBe(false);
    expect(promo.nextSibling.id).toBe('co-tail-kind-chips');
    expect(promo.textContent.indexOf('まとめて入れる')).toBeGreaterThan(-1);
  });

  test('1 クリックで一括に入る。change は 1 回だけ飛ぶ', () => {
    var s = setup('component');
    s.d.getElementById('co-tail-kind-bulk-promo').click();
    expect(s.sel.value).toBe('bulk');
    expect(s.changes.join(',')).toBe('bulk');
    expect(s.d.getElementById('co-tail-kind-chip-bulk').getAttribute('aria-pressed')).toBe('true');
  });

  test('一括に入ったあとは呼び込みが「選択中」になり、二度押しでは change が増えない', () => {
    var s = setup('component');
    var promo = s.d.getElementById('co-tail-kind-bulk-promo');
    promo.click();
    expect(promo.getAttribute('aria-pressed')).toBe('true');
    expect(promo.textContent.indexOf('選択中')).toBeGreaterThan(-1);
    promo.click();
    expect(s.changes.length).toBe(1);
  });

  test('select 側から値が戻れば呼び込みの当たりも戻る', () => {
    var s = setup('bulk');
    var promo = s.d.getElementById('co-tail-kind-bulk-promo');
    expect(promo.getAttribute('aria-pressed')).toBe('true');
    s.sel.value = 'relation';
    var ev = s.d.createEvent('Event');
    ev.initEvent('change', true, false);
    s.sel.dispatchEvent(ev);
    expect(promo.getAttribute('aria-pressed')).toBe('false');
    expect(promo.textContent.indexOf('選択中')).toBe(-1);
  });

  test('mount を掛け直しても呼び込みは 1 つのまま', () => {
    var s = setup('component');
    chips.mount('co-tail-kind');
    chips.mount('co-tail-kind');
    expect(s.d.querySelectorAll('#co-tail-kind-bulk-promo').length).toBe(1);
  });

  test('一括の選択肢を持たない select には呼び込みを出さない', () => {
    var s = setup('component', CO_KINDS.filter(function(k) { return k.value !== 'bulk'; }));
    expect(s.d.getElementById('co-tail-kind-bulk-promo')).toBe(null);
    expect(s.d.getElementById('co-tail-kind-chips') === null).toBe(false);
  });
});
