'use strict';
// BLK-primary-20260923-2312-friction —「末尾に追加」フォームは確定で描き直しても、
// 種別チップ・親・From・関係の種類を前回のまま出す。図種・タブが替わったときだけ既定に戻る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/tail-memory.js')]; } catch (e) {}
require('../src/core/tail-memory.js');
try { delete require.cache[require.resolve('../src/core/tail-kind-chips.js')]; } catch (e) {}
require('../src/core/tail-kind-chips.js');
var TM = global.window.MA.tailMemory;
var chips = global.window.MA.tailKindChips;

var ctxKey = 'plantuml-state|tab1';
function useKey(k) { ctxKey = k; }

function formHtml(selectId, values, selected) {
  var opts = values.map(function(v) {
    return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>';
  }).join('');
  return '<div><div><label>種類</label><select id="' + selectId + '">' + opts + '</select></div></div>';
}

function change(el) {
  var ev = document.createEvent('Event');
  ev.initEvent('change', true, false);
  el.dispatchEvent(ev);
}

describe('tail-memory —「末尾に追加」の前回の選択 (BLK-primary-20260923-2312-friction)', () => {
  beforeEach(() => {
    TM.setKeyFn(function() { return ctxKey; });
    useKey('plantuml-state|tab1');
    TM.sync();
    TM.reset();
    document.body.innerHTML = '';
  });

  test('種別を覚え、同じ図種・タブのうちは返す', () => {
    TM.setKind('st-tail-kind', 'transition');
    expect(TM.kind('st-tail-kind')).toBe('transition');
    expect(TM.kind('uc-tail-kind')).toBe(null);
  });

  test('図種が替わると覚えを捨てる', () => {
    TM.setKind('st-tail-kind', 'child');
    TM.setField('st-tail-where-target', 'Error');
    useKey('plantuml-sequence|tab1');
    expect(TM.kind('st-tail-kind')).toBe(null);
    expect(TM.hasField('st-tail-where-target')).toBe(false);
  });

  test('タブが替わると覚えを捨て、onReset の聞き手を呼ぶ', () => {
    var called = 0;
    TM.onReset(function() { called++; });
    TM.setKind('st-tail-kind', 'transition');
    useKey('plantuml-state|tab2');
    expect(TM.sync()).toBe(true);
    expect(called).toBe(1);
    expect(TM.kind('st-tail-kind')).toBe(null);
    // 同じ組のうちは捨てない。
    expect(TM.sync()).toBe(false);
    expect(called).toBe(1);
  });

  test('bindSelect: 覚えた値が選択肢にあれば戻し、選び直しを覚える', () => {
    TM.setField('st-tail-where-target', 'Error');
    document.body.innerHTML = formHtml('st-tail-where-target', ['Idle', 'Busy', 'Error'], 'Idle');
    var sel = document.getElementById('st-tail-where-target');
    expect(TM.bindSelect('st-tail-where-target')).toBe(true);
    expect(sel.value).toBe('Error');
    sel.value = 'Busy';
    change(sel);
    expect(TM.field('st-tail-where-target')).toBe('Busy');
  });

  test('bindSelect: 覚えた値が選択肢に無ければ (消した親など) 既定のまま', () => {
    TM.setField('st-tail-where-target', 'Gone');
    document.body.innerHTML = formHtml('st-tail-where-target', ['Idle', 'Busy'], 'Idle');
    expect(TM.bindSelect('st-tail-where-target')).toBe(false);
    expect(document.getElementById('st-tail-where-target').value).toBe('Idle');
  });

  test('forget: 覚えた欄を捨てる', () => {
    TM.setField('seq-tail-from', 'Drv');
    TM.forget('seq-tail-from');
    expect(TM.hasField('seq-tail-from')).toBe(false);
  });

  test('nextMessageEnds: From は直前の To、To は空欄', () => {
    expect(TM.nextMessageEnds('App', 'Drv')).toEqual({ from: 'Drv', to: '' });
    expect(TM.nextMessageEnds('App', '')).toEqual({ from: 'App', to: '' });
    expect(TM.nextMessageEnds(null, null)).toEqual({ from: '', to: '' });
  });

  test('tailKindChips.mount: 描き直した select を前回の種別にして、そのチップを当てる', () => {
    document.body.innerHTML = formHtml('st-tail-kind', ['state', 'child', 'transition'], 'state');
    chips.mount('st-tail-kind');
    var sel = document.getElementById('st-tail-kind');
    // チップで遷移を選ぶ → 覚える。
    document.getElementById('st-tail-kind-chip-transition').click();
    expect(sel.value).toBe('transition');
    expect(TM.kind('st-tail-kind')).toBe('transition');
    // 確定で右ペインが描き直される (select は既定の state で作り直される)。
    document.body.innerHTML = formHtml('st-tail-kind', ['state', 'child', 'transition'], 'state');
    chips.mount('st-tail-kind');
    sel = document.getElementById('st-tail-kind');
    expect(sel.value).toBe('transition');
    expect(document.getElementById('st-tail-kind-chip-transition').getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('st-tail-kind-chip-state').getAttribute('aria-pressed')).toBe('false');
  });

  test('tailKindChips.mount: 図種が替わった後の描き直しは既定のまま', () => {
    document.body.innerHTML = formHtml('seq-tail-kind', ['message', 'participant'], 'message');
    chips.mount('seq-tail-kind');
    document.getElementById('seq-tail-kind-chip-participant').click();
    useKey('plantuml-usecase|tab1');
    useKey('plantuml-sequence|tab1');
    document.body.innerHTML = formHtml('seq-tail-kind', ['message', 'participant'], 'message');
    chips.mount('seq-tail-kind');
    expect(document.getElementById('seq-tail-kind').value).toBe('message');
  });

  test('tailKindChips.mount: 描き直しで change を投げない (図種側の続きの状態を動かさない)', () => {
    TM.setKind('st-tail-kind', 'transition');
    document.body.innerHTML = formHtml('st-tail-kind', ['state', 'transition'], 'state');
    var sel = document.getElementById('st-tail-kind');
    var fired = 0;
    sel.addEventListener('change', function() { fired++; });
    chips.mount('st-tail-kind');
    expect(sel.value).toBe('transition');
    expect(fired).toBe(0);
  });

  // ランナーは全テストを 1 プロセスで動かすので、覚えと出どころの差し替えを残さない。
  test('後片付け: 覚えを空にし、図種 + タブの出どころを既定に戻す', () => {
    TM.reset();
    TM.setKeyFn(null);
    document.body.innerHTML = '';
    expect(TM.kind('st-tail-kind')).toBe(null);
  });
});
