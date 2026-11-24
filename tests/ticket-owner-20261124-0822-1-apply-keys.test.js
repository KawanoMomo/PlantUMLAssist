'use strict';
// TICKET-owner-20261124-0822-1: 右パネルの「名前 (id)」に打って Enter を押しても class・component・state・usecase では
// 何も起きず、図の別の要素を押すと打った名前が黙って捨てられた。sequence の参加者には「変更を反映」が無かった。
// 共通部 (src/ui/properties.js) が 5 図種で同じ形にする: Enter =「変更を反映」、離れたときも反映、同じ組の欄へは反映しない。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

function boot() {
  var W = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props-content"></div><button id="outside">x</button></body></html>').window;
  ['src/ui/terms.js', 'src/core/html-utils.js', 'src/ui/properties.js'].forEach(function(rel) {
    new Function('window', 'document', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(W, W.document);
  });
  var P = W.MA.properties;
  var T = W.MA.terms;
  var root = W.document.getElementById('props-content');
  root.innerHTML = P.fieldHtml(T.id, 'x-id', 'Bus') + P.fieldHtml(T.label, 'x-label', 'Bus') +
    P.renameRefsCheckHtml('x-refs') + P.primaryButtonHtml('x-apply', T.apply) +
    P.fieldHtml('ラベル', 'x-other', '') + P.primaryButtonHtml('x-other-apply', T.apply);
  var clicks = [];
  W.document.getElementById('x-apply').addEventListener('click', function() { clicks.push('apply:' + W.document.getElementById('x-id').value); });
  W.document.getElementById('x-other-apply').addEventListener('click', function() { clicks.push('other'); });
  return { W: W, clicks: clicks, el: function(id) { return W.document.getElementById(id); } };
}
function key(W, el, k) {
  var e = new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}
function leave(W, el, to) {
  el.dispatchEvent(new W.FocusEvent('focusout', { bubbles: true, relatedTarget: to || null }));
}

describe('右パネルの欄の確定: Enter は「変更を反映」と同じ', function() {
  test('名前 (id)・表示名の欄は印を持ち、「変更を反映」も印を持つ', function() {
    var r = boot();
    expect(r.el('x-id').getAttribute('data-apply-field')).toBe('1');
    expect(r.el('x-label').getAttribute('data-apply-field')).toBe('1');
    expect(r.el('x-other').getAttribute('data-apply-field')).toBe(null);
    expect(r.el('x-apply').getAttribute('data-apply')).toBe('1');
  });
  test('打って Enter → 欄の後ろの「変更を反映」が 1 回押される', function() {
    var r = boot();
    r.el('x-id').value = 'Bus2';
    var e = key(r.W, r.el('x-id'), 'Enter');
    expect(r.clicks).toEqual(['apply:Bus2']);
    expect(e.defaultPrevented).toBe(true);
  });
  test('表示名の欄の Enter でも同じ組の改名が入る。打っていなければ押さない', function() {
    var r = boot();
    key(r.W, r.el('x-label'), 'Enter');
    expect(r.clicks).toEqual([]);
    r.el('x-id').value = 'Bus3';
    key(r.W, r.el('x-label'), 'Enter');
    expect(r.clicks).toEqual(['apply:Bus3']);
  });
  test('IME 変換中の Enter と、印の無い欄の Enter は押さない', function() {
    var r = boot();
    r.el('x-id').value = 'Bus2';
    r.el('x-id').dispatchEvent(new r.W.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    key(r.W, r.el('x-other'), 'Enter');
    expect(r.clicks).toEqual([]);
  });
});

describe('右パネルの欄の確定: 打った字を黙って捨てない', function() {
  test('打ったまま図の別の要素を押す (パネルの外へ離れる) と反映する', function() {
    var r = boot();
    r.el('x-id').value = 'Bus2';
    leave(r.W, r.el('x-id'), null);
    expect(r.clicks).toEqual(['apply:Bus2']);
    r.el('x-id').value = 'Bus4';
    leave(r.W, r.el('x-id'), r.el('outside'));
    expect(r.clicks).toEqual(['apply:Bus2', 'apply:Bus4']);
  });
  test('同じ組の欄・チェック・「変更を反映」へ移るときは反映しない (続けて打てる・二重にしない)', function() {
    var r = boot();
    r.el('x-id').value = 'Bus2';
    leave(r.W, r.el('x-id'), r.el('x-label'));
    leave(r.W, r.el('x-id'), r.el('x-refs'));
    leave(r.W, r.el('x-id'), r.el('x-apply'));
    expect(r.clicks).toEqual([]);
  });
  test('反映した後に同じ欄を離れても二重に押さない', function() {
    var r = boot();
    r.el('x-id').value = 'Bus2';
    key(r.W, r.el('x-id'), 'Enter');
    leave(r.W, r.el('x-id'), null);
    expect(r.clicks).toEqual(['apply:Bus2']);
  });
});

describe('5 図種のパネルが共通部を使う (図種ごとに Enter・離れたときの処理を持たない)', function() {
  var src = function(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
  test('sequence の参加者のパネルに「変更を反映」があり、名前 (id) の change で改名しない', function() {
    var s = src('src/modules/sequence.js');
    expect(s).toContain("P.primaryButtonHtml('seq-edit-apply', window.MA.terms.apply)");
    expect(s).toContain("P.bindEvent('seq-edit-apply', 'click'");
    expect(s.indexOf("getElementById('seq-edit-alias').addEventListener('change'")).toBe(-1);
  });
  [['class', 'cl-edit'], ['component', 'co-edit'], ['usecase', 'uc-edit'], ['state', 'st-']].forEach(function(c) {
    test(c[0] + '.js は名前 (id) の欄に Enter の処理を足していない', function() {
      var s = src('src/modules/' + c[0] + '.js');
      expect(/(cl-edit-id|co-edit-id|uc-edit-id|st-id)['"]\)\.addEventListener\('keydown'/.test(s)).toBe(false);
    });
  });
});
