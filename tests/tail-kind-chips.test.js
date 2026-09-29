'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
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

var SEQ_KINDS = [
  { value: 'message', label: 'メッセージ' },
  { value: 'participant', label: '参加者' },
  { value: 'note', label: '注釈 (note)' },
  { value: 'block', label: 'ブロック (alt/loop/...)' },
  { value: 'activation', label: 'ライフライン (activate/deactivate)' },
  { value: 'bulk', label: 'まとめて (複数行)' },
];

describe('tail-kind-chips — 「末尾に追加」の種別チップ (design 2b)', () => {
  test('shortLabel: 末尾の括弧書きは落とす', () => {
    expect(chips.shortLabel('注釈 (note)')).toBe('注釈');
    expect(chips.shortLabel('ブロック (alt/loop/...)')).toBe('ブロック');
    expect(chips.shortLabel('一括 (複数行)')).toBe('一括');
    expect(chips.shortLabel('ライフライン (activate/deactivate)')).toBe('ライフライン');
  });

  test('shortLabel: 括弧が無ければそのまま。空にはしない', () => {
    expect(chips.shortLabel('メッセージ')).toBe('メッセージ');
    expect(chips.shortLabel('  参加者  ')).toBe('参加者');
    expect(chips.shortLabel('(only)')).toBe('(only)');
    expect(chips.shortLabel('')).toBe('');
    expect(chips.shortLabel(null)).toBe('');
    expect(chips.shortLabel(undefined)).toBe('');
  });

  test('idPart: id に使えない文字を潰す', () => {
    expect(chips.idPart('message')).toBe('message');
    expect(chips.idPart('alt/loop')).toBe('alt_loop');
    expect(chips.idPart('a b.c')).toBe('a_b_c');
    expect(chips.idPart('')).toBe('');
  });

  test('chipModels: 現在値のチップだけ active。ラベルは短縮し title に原文を残す', () => {
    var m = chips.chipModels(SEQ_KINDS, 'note');
    expect(m.length).toBe(6);
    expect(m.map(function(x) { return x.value; }).join(',')).toBe('message,participant,note,block,activation,bulk');
    expect(m.filter(function(x) { return x.active; }).map(function(x) { return x.value; }).join(',')).toBe('note');
    expect(m[2].label).toBe('注釈');
    expect(m[2].title).toBe('注釈 (note)');
  });

  test('chipModels: 現在値が選択肢に無ければどれも active にしない', () => {
    var m = chips.chipModels(SEQ_KINDS, 'nosuch');
    expect(m.filter(function(x) { return x.active; }).length).toBe(0);
  });

  test('chipModels: 空・未指定でも落ちない', () => {
    expect(chips.chipModels([], 'message').length).toBe(0);
    expect(chips.chipModels(null, 'message').length).toBe(0);
  });

  test('chipsHtml: 値ごとに id が付き、active は aria-pressed=true / tabindex=0', () => {
    var html = chips.chipsHtml('seq-tail-kind', chips.chipModels(SEQ_KINDS, 'message'));
    expect(html.indexOf('id="seq-tail-kind-chips"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="seq-tail-kind-chip-message"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="seq-tail-kind-chip-bulk"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-pressed="true"')).toBeGreaterThan(-1);
    expect((html.match(/aria-pressed="true"/g) || []).length).toBe(1);
    expect((html.match(/tabindex="0"/g) || []).length).toBe(1);
    expect((html.match(/class="prop-seg/g) || []).length).toBe(6);
  });

  test('chipsHtml: ラベルはエスケープする', () => {
    var html = chips.chipsHtml('x', chips.chipModels([{ value: '<v>', label: '<b>&' }], '<v>'));
    expect(html.indexOf('<b>&')).toBe(-1);
    expect(html.indexOf('&lt;b&gt;')).toBeGreaterThan(-1);
    expect(html.indexOf('id="x-chip-_v_"')).toBeGreaterThan(-1);
  });

  test('moveIndex: → で次、← で前、端は巻き戻る', () => {
    expect(chips.moveIndex(6, 0, 1)).toBe(1);
    expect(chips.moveIndex(6, 5, 1)).toBe(0);
    expect(chips.moveIndex(6, 0, -1)).toBe(5);
    expect(chips.moveIndex(6, 3, -1)).toBe(2);
  });

  test('moveIndex: 現在値が不明なら先頭。要素が無ければ -1', () => {
    expect(chips.moveIndex(6, -1, 1)).toBe(0);
    expect(chips.moveIndex(6, 99, -1)).toBe(0);
    expect(chips.moveIndex(0, 0, 1)).toBe(-1);
  });
});

describe('tail-kind-chips — mount (select が値の持ち主のまま)', () => {
  function setup(current) {
    var d = global.document;
    d.body.innerHTML =
      '<div id="pane"><div id="wrap"><label>種類</label>' +
      '<select id="seq-tail-kind">' +
      SEQ_KINDS.map(function(k) {
        return '<option value="' + k.value + '"' + (k.value === current ? ' selected' : '') + '>' + k.label + '</option>';
      }).join('') +
      '</select></div></div>';
    var changes = [];
    d.getElementById('seq-tail-kind').addEventListener('change', function(e) { changes.push(e.target.value); });
    var el = chips.mount('seq-tail-kind');
    return { d: d, changes: changes, chipsEl: el, sel: d.getElementById('seq-tail-kind') };
  }

  test('チップ列は select を包む div の直前に入り、選択肢と同じ数だけ並ぶ', () => {
    var s = setup('message');
    expect(s.chipsEl === null).toBe(false);
    expect(s.chipsEl.id).toBe('seq-tail-kind-chips');
    expect(s.chipsEl.nextSibling.id).toBe('wrap');
    expect(s.chipsEl.querySelectorAll('.prop-seg').length).toBe(6);
    expect(s.d.getElementById('seq-tail-kind-chip-message').getAttribute('aria-pressed')).toBe('true');
  });

  test('チップを押すと select の値が変わり change が 1 回だけ飛ぶ', () => {
    var s = setup('message');
    s.d.getElementById('seq-tail-kind-chip-bulk').click();
    expect(s.sel.value).toBe('bulk');
    expect(s.changes.join(',')).toBe('bulk');
    expect(s.d.getElementById('seq-tail-kind-chip-bulk').getAttribute('aria-pressed')).toBe('true');
    expect(s.d.getElementById('seq-tail-kind-chip-message').getAttribute('aria-pressed')).toBe('false');
  });

  test('今 active のチップを押しても change は飛ばない (無駄な再描画をしない)', () => {
    var s = setup('message');
    s.d.getElementById('seq-tail-kind-chip-message').click();
    expect(s.sel.value).toBe('message');
    expect(s.changes.length).toBe(0);
  });

  test('select 側から値を変えてもチップの当たりが追随する (従来経路を壊さない)', () => {
    var s = setup('message');
    s.sel.value = 'note';
    s.sel.dispatchEvent(new global.window.Event('change'));
    expect(s.d.getElementById('seq-tail-kind-chip-note').getAttribute('aria-pressed')).toBe('true');
    expect(s.d.getElementById('seq-tail-kind-chip-message').getAttribute('aria-pressed')).toBe('false');
  });

  test('→ / ← で隣の種別に移り、端では巻き戻る', () => {
    var s = setup('message');
    var right = new global.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    s.d.getElementById('seq-tail-kind-chip-message').dispatchEvent(right);
    expect(s.sel.value).toBe('participant');
    var left = new global.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    s.d.getElementById('seq-tail-kind-chip-participant').dispatchEvent(left);
    expect(s.sel.value).toBe('message');
    s.d.getElementById('seq-tail-kind-chip-message').dispatchEvent(left);
    expect(s.sel.value).toBe('bulk');
  });

  test('2 回 mount しても列は 1 つだけ (ペインは選択のたびに作り直される)', () => {
    var s = setup('message');
    chips.mount('seq-tail-kind');
    expect(s.d.querySelectorAll('#seq-tail-kind-chips').length).toBe(1);
    expect(s.d.getElementById('pane').querySelectorAll('.prop-seg').length).toBe(6);
  });

  test('select が無ければ何もせず null を返す', () => {
    global.document.body.innerHTML = '<div></div>';
    expect(chips.mount('nosuch-tail-kind')).toBe(null);
  });

  // BLK-owner-20260923-2332-prune: 同じ選択肢を同じ順で並べた「種類」プルダウンは画面から外す。
  // 値の持ち主なので要素は残し、見えない・Tab で止まらない形にする。
  test('「種類」プルダウンは包む div ごと画面から外れ、Tab でも止まらない', () => {
    var s = setup('message');
    var wrap = s.d.getElementById('wrap');
    expect(wrap.getAttribute('data-tail-kind-select')).toBe('1');
    expect(wrap.getAttribute('aria-hidden')).toBe('true');
    expect(wrap.style.position).toBe('absolute');
    expect(wrap.style.overflow).toBe('hidden');
    expect(s.sel.getAttribute('tabindex')).toBe('-1');
    // 隠しても値の受け渡しはそのまま (チップ → select → change)。
    s.d.getElementById('seq-tail-kind-chip-note').click();
    expect(s.sel.value).toBe('note');
    expect(s.changes.join(',')).toBe('note');
  });

  test('まとめて足す入口はチップ列の 1 つだけ (呼び込みの枠は出さない)', () => {
    var s = setup('message');
    expect(s.d.getElementById('seq-tail-kind-bulk-promo')).toBe(null);
    expect(s.d.getElementById('pane').querySelectorAll('[data-value="bulk"]').length).toBe(1);
  });
});
