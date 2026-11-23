'use strict';
// TICKET-roadmap-20261123-0857-1 (roadmap v8.0 必須 2): 右パネルから本文を書き換えた直後 (描き直し・refresh の前) に
// 次の手を打っても、その手は今の本文の読みに対して働き、確定の直後に打った・選んだ欄は後から来る組み直しで消えない。
// 共通部 MA.propsRebuild (ctx.setMmdText で読み直し、ctx.onUpdate でその場で組み直し、後の refresh は同じ本文なら組み直さない)
// を、画面 (src/app.js の renderProps) と同じ組み方で 6 図種の本物の右パネルに繋いで確かめる。
// 直しを外す (onUpdate がその場で組み直さない / setMmdText が読み直さない / refresh が控えを見ない) と赤。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var W = dom.window;
var loadErrors = [];
// 画面と同じ順で、部品 (src/core・src/ui) と図種モジュールを読む (src/app.js は読まない)。
var list = [];
fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8').replace(/<script src="(src\/(?:core|ui|modules)\/[^"]+\.js)"/g, function(_, s) {
  list.push(s); return _;
});
list.forEach(function(rel) {
  var p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', fs.readFileSync(p, 'utf-8'));
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var MA = W.MA;
var BLANK = '@startuml\n@enduml';

// 画面の renderProps と同じ繋ぎ方 (src/app.js): 本文・読み・右パネル・後から来る refresh。
function harness(mod, text) {
  W.document.body.innerHTML = '';
  var el = W.document.createElement('div');
  el.id = 'props-content';
  W.document.body.appendChild(el);
  var h = { text: text, parsed: mod.parse(text), pending: 0, el: el };
  var tr = MA.propsRebuild.tracker(function() { return { text: h.text, sel: '[]', module: mod }; });
  var ctx;
  function rebuild() { tr.markBuilt(false); mod.renderProps([], h.parsed, el, ctx); }
  ctx = MA.propsRebuild.makeCtx({
    getText: function() { return h.text; },
    write: function(s) { h.text = s; },
    reparse: function() { h.parsed = mod.parse(h.text); },
    rebuildNow: function() { rebuild(); tr.markBuilt(true); },
    schedule: function() { h.pending++; },
  });
  // 描き直しの待ち (150ms〜1s) の後に来る refresh。
  h.refresh = function() {
    h.pending = 0;
    h.parsed = mod.parse(h.text);
    if (tr.needRebuild()) rebuild();
  };
  rebuild();
  return h;
}
function $(id) { return W.document.getElementById(id); }
function click(id) { var e = $(id); if (!e) throw new Error('no #' + id); e.click(); }
function fill(id, v) {
  var e = $(id) || W.document.querySelector(id);
  if (!e) throw new Error('no ' + id);
  e.value = v;
  e.dispatchEvent(new W.Event('input', { bubbles: true }));
  e.dispatchEvent(new W.Event('change', { bubbles: true }));
}
function pick(id, v) {
  var e = $(id);
  if (!e) throw new Error('no #' + id);
  var ok = Array.prototype.some.call(e.options, function(o) { return o.value === v; });
  if (!ok) throw new Error('#' + id + ' に ' + v + ' の候補が無い (' + Array.prototype.map.call(e.options, function(o) { return o.value; }).join(',') + ')');
  e.value = v;
  e.dispatchEvent(new W.Event('change', { bubbles: true }));
}
function optionValues(id) { return Array.prototype.map.call($(id).options, function(o) { return o.value; }); }
function linesOf(t, re) { return t.split('\n').filter(function(l) { return re.test(l); }); }

// 要素を足した直後 (refresh の前) に次の名前を打ち、refresh が来てから「+ 追加」を押す (起票の (c))。
// その後 refresh の前に関係の種類へ替え、今足した要素が始点・終点の候補に出て 1 本足せる (古い読みを使わない)。
function elemThenRelation(mod, p, chip, decl, names) {
  var h = harness(MA.modules[mod], BLANK);
  click(p + '-tail-kind-chip-' + chip);
  fill(p + '-tail-alias', names[0]);
  click(p + '-tail-add');
  expect(h.pending).toBe(1);
  fill(p + '-tail-alias', names[1]);
  h.refresh();
  click(p + '-tail-add');
  names.slice(0, 2).forEach(function(n) {
    expect(linesOf(h.text, new RegExp('^\\s*' + decl + '\\s+' + n + '\\s*$')).length).toBe(1);
  });
  // refresh を待たずに関係へ。
  click(p + '-tail-kind-chip-relation');
  expect(optionValues(p + '-tail-from')).toContain(names[1]);
  pick(p + '-tail-from', names[0]);
  pick(p + '-tail-to', names[1]);
  click(p + '-tail-add');
  expect(linesOf(h.text, new RegExp('^\\s*' + names[0] + '\\s*\\S+\\s*' + names[1] + '\\s*$')).length).toBe(1);
  return h;
}

describe('TICKET-roadmap-20261123-0857-1 右パネルの書き換えの直後の次の手 (MA.propsRebuild)', function() {
  test('読み込み (共通部と 6 図種のモジュール)', function() {
    expect(typeof MA.propsRebuild.makeCtx).toBe('function');
    ['plantumlSequence', 'plantumlState', 'plantumlComponent', 'plantumlUsecase', 'plantumlClass', 'plantumlActivity'].forEach(function(m) {
      expect(MA.modules[m] ? m : m + ' 無し (' + loadErrors.join(' | ') + ')').toBe(m);
    });
  });

  test('tracker: 無選択は同じ本文・図種なら refresh で組み直さない。本文・図種が替われば組み直す', function() {
    var k = { text: 'a', sel: '[]', module: 'm' };
    var t = MA.propsRebuild.tracker(function() { return k; });
    expect(t.needRebuild()).toBe(true);
    t.markBuilt(false);
    expect(t.needRebuild()).toBe(false);
    expect(t.needRebuild()).toBe(false);
    k = { text: 'b', sel: '[]', module: 'm' };
    expect(t.needRebuild()).toBe(true);
    t.markBuilt(true);
    k = { text: 'b', sel: '[]', module: 'n' };
    expect(t.needRebuild()).toBe(true);
  });

  test('tracker: 選んだ要素の右パネルは書き換えの直後の 1 回だけ組み直さない', function() {
    var k = { text: 'a', sel: '[{"id":"X"}]', module: 'm' };
    var t = MA.propsRebuild.tracker(function() { return k; });
    t.markBuilt(true);
    expect(t.needRebuild()).toBe(false);
    expect(t.needRebuild()).toBe(true);
    t.markBuilt(false);
    expect(t.needRebuild()).toBe(true);
    t.markBuilt(true);
    k = { text: 'a', sel: '[{"id":"Y"}]', module: 'm' };
    expect(t.needRebuild()).toBe(true);
  });

  test('画面 (app.js) は右パネルの ctx を MA.propsRebuild で作り、refresh は控えを見る', function() {
    var app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf-8');
    expect(app).toContain('window.MA.propsRebuild.makeCtx(');
    expect(app).toContain('if (_propsNeedRebuild()) renderProps(currentParsed);');
    expect(app).toContain('if (_propsBuilt) _propsBuilt.markBuilt(false);');
  });

  test('component: 要素を続けて足し、refresh 前に関係へ替えても今足した要素から引ける', function() {
    elemThenRelation('plantumlComponent', 'co', 'component', 'component', ['Ca', 'Cb']);
  });

  test('class: 要素を続けて足し、refresh 前に関係へ替えても今足した要素から引ける', function() {
    elemThenRelation('plantumlClass', 'cl', 'class', 'class', ['Ka', 'Kb']);
  });

  test('usecase: 要素を続けて足し、refresh 前に関係へ替えても今足した要素から引ける', function() {
    elemThenRelation('plantumlUsecase', 'uc', 'usecase', 'usecase', ['Ua', 'Ub']);
  });

  test('sequence: 参加者を続けて足し、refresh 前にメッセージへ替えても今足した参加者から引ける', function() {
    var h = harness(MA.modules.plantumlSequence, BLANK);
    click('seq-tail-kind-chip-participant');
    fill('seq-tail-alias', 'Pa');
    click('seq-tail-add');
    fill('seq-tail-alias', 'Pb');
    h.refresh();
    click('seq-tail-add');
    expect(linesOf(h.text, /^\s*participant\s+Pa\s*$/).length).toBe(1);
    expect(linesOf(h.text, /^\s*participant\s+Pb\s*$/).length).toBe(1);
    click('seq-tail-kind-chip-message');
    pick('seq-tail-from', 'Pa');
    pick('seq-tail-to', 'Pb');
    fill('#seq-tail-label-rle .rle-textarea', 'm1');
    click('seq-tail-add');
    expect(linesOf(h.text, /^\s*Pa\s*->\s*Pb\s*:\s*m1\s*$/).length).toBe(1);
  });

  test('state: 状態を続けて足し、refresh 前に遷移へ替えても今足した状態から引ける', function() {
    var h = harness(MA.modules.plantumlState, BLANK);
    click('st-tail-kind-chip-state');
    fill('st-tail-id', 'Sa');
    click('st-tail-add');
    fill('st-tail-id', 'Sb');
    h.refresh();
    click('st-tail-add');
    expect(linesOf(h.text, /^\s*state\s+Sa\b/).length).toBe(1);
    expect(linesOf(h.text, /^\s*state\s+Sb\b/).length).toBe(1);
    click('st-tail-kind-chip-transition');
    pick('st-tail-from', 'Sa');
    pick('st-tail-to', 'Sb');
    click('st-tail-add');
    expect(linesOf(h.text, /^\s*Sa\s*-+>\s*Sb\s*$/).length).toBe(1);
  });

  test('activity: アクションを足した直後に次を打ち、refresh が来てから足しても入る', function() {
    var h = harness(MA.modules.plantumlActivity, BLANK);
    click('ac-tail-kind-chip-action');
    fill('ac-tail-text', 'Aa');
    click('ac-tail-add');
    fill('ac-tail-text', 'Ab');
    h.refresh();
    click('ac-tail-add');
    expect(linesOf(h.text, /^\s*:Aa;\s*$/).length).toBe(1);
    expect(linesOf(h.text, /^\s*:Ab;\s*$/).length).toBe(1);
  });

  test('まとめて (activity): 種別を選んで打ち始めた欄は、本文の変わらない refresh (図種を選んだ後・描き直しの後) で消えない', function() {
    var h = harness(MA.modules.plantumlActivity, '@startuml\nstart\nstop\n@enduml');
    click('ac-tail-kind-chip-bulk');
    fill('ac-tail-bulk', '受付する\n確認する');
    h.refresh();
    expect($('ac-tail-bulk').value).toBe('受付する\n確認する');
    click('ac-tail-add');
    expect(linesOf(h.text, /^\s*:受付する;\s*$/).length).toBe(1);
    expect(linesOf(h.text, /^\s*:確認する;\s*$/).length).toBe(1);
  });

  test('まとめて (state): 1 回目の直後に 2 回目を打ち、refresh が来てから確定しても両方入り別名が重ならない', function() {
    var h = harness(MA.modules.plantumlState, BLANK);
    click('st-tail-kind-chip-bulk');
    fill('st-tail-bulk', '待機\n初期化中');
    click('st-tail-add');
    fill('st-tail-bulk', '完了\n異常');
    h.refresh();
    click('st-tail-add');
    ['待機', '初期化中', '完了', '異常'].forEach(function(n) { expect(linesOf(h.text, new RegExp(n)).length).toBe(1); });
    var al = {};
    h.text.replace(/\bas\s+(S\d+)\b/g, function(_, a) { al[a] = (al[a] || 0) + 1; return _; });
    expect(Object.keys(al).filter(function(a) { return al[a] > 1; })).toEqual([]);
  });
});
