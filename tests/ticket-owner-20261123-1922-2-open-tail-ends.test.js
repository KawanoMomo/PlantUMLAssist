'use strict';
// TICKET-owner-20261123-1922-2: シーケンス図を開いた直後の「末尾に追加」(メッセージ) が From = To = 先頭の参加者で始まり、
// 本文だけ打って Enter を押すと選んでいない自己メッセージ (`Ctl -> Ctl`) が入った。
// 期待: 開いた直後・タブを替えた直後・白紙で参加者を足した直後も、確定した後と同じく To は空欄で始まり、
// From は本文の最後のメッセージの送り先 (無ければ先頭の参加者)。To を選ばずに押すと行を足さず、
// To の欄の見出しの語で知らせて手を To に入れる。
// 直しを外す (openMessageEnds を呼ばない / To に先頭の参加者が入る) と赤。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var W = dom.window;
var alerts = [];
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
       function(m) { alerts.push(String(m)); }, function() { return true; }, function() { return null; });
  } catch (e) { /* 画面に要らない部品の読み失敗はこの票の関心ではない */ }
});
var MA = W.MA;
var TM = MA.tailMemory;
var SEQ = MA.modules.plantumlSequence;
var tabKey = 'sequence|t1';
TM.setKeyFn(function() { return tabKey; });

function harness(text) {
  W.document.body.innerHTML = '';
  var el = W.document.createElement('div');
  el.id = 'props-content';
  W.document.body.appendChild(el);
  var h = { text: text, parsed: SEQ.parse(text), el: el };
  var ctx = {
    getMmdText: function() { return h.text; },
    setMmdText: function(s) { h.text = s; h.parsed = SEQ.parse(s); },
    onUpdate: function() { SEQ.renderProps([], h.parsed, el, ctx); },
  };
  SEQ.renderProps([], h.parsed, el, ctx);
  return h;
}
function $(id) { return W.document.getElementById(id); }
function fill(sel, v) {
  var e = $(sel) || W.document.querySelector(sel);
  if (!e) throw new Error('no ' + sel);
  e.value = v;
  e.dispatchEvent(new W.Event('input', { bubbles: true }));
  e.dispatchEvent(new W.Event('change', { bubbles: true }));
}
function pick(id, v) {
  var e = $(id);
  e.value = v;
  e.dispatchEvent(new W.Event('change', { bubbles: true }));
}

var HAND = ['@startuml', 'participant Ctl', 'participant CtlMon', 'participant Bus',
  'Ctl -> CtlMon : start()', 'CtlMon -> Bus : Poll()', '@enduml'].join('\n');

describe('TICKET-owner-20261123-1922-2 開いた直後の「末尾に追加」の From / To', function() {
  test('openMessageEnds: From は本文の最後のメッセージの送り先、To は空欄', function() {
    var e = TM.openMessageEnds(['Ctl', 'CtlMon', 'Bus'],
      [{ from: 'Ctl', to: 'CtlMon', line: 4 }, { from: 'CtlMon', to: 'Bus', line: 5 }]);
    expect(e.from).toBe('Bus');
    expect(e.to).toBe('');
    expect(e.source).toBe('last');
  });

  test('openMessageEnds: 並びが行の順でなくても、行の順で最後のメッセージを見る', function() {
    var e = TM.openMessageEnds(['A', 'B', 'C'],
      [{ from: 'A', to: 'C', line: 9 }, { from: 'A', to: 'B', line: 3 }]);
    expect(e.from).toBe('C');
  });

  test('openMessageEnds: 送り先が図の外 (]) なら、その前のメッセージの送り先。メッセージが無ければ先頭の参加者', function() {
    expect(TM.openMessageEnds(['A', 'B'], [{ from: 'A', to: 'B', line: 2 }, { from: 'B', to: ']', line: 3 }]).from).toBe('B');
    var e = TM.openMessageEnds(['A', 'B'], []);
    expect(e.from).toBe('A');
    expect(e.to).toBe('');
    expect(e.source).toBe('first');
    expect(TM.openMessageEnds([], []).from).toBe('');
  });

  test('案内の語は From の欄の値と同じ参加者を名指しする', function() {
    expect(TM.openMessageNote({ from: 'Bus', source: 'last' })).toContain('Bus');
    // 押す手が効くかで語が替わる (TICKET-owner-20261123-2322-1)。
    expect(TM.openMessageNote({ from: 'Bus', source: 'last' }, null, true)).toContain('To は図の参加者を押すか選んでください');
    expect(TM.openMessageNote({ from: 'A', source: 'first' })).toContain('先頭の参加者 A');
  });

  test('開いた直後の右パネル: From = 最後の送り先 Bus、To は空欄の行「（一覧から選ぶ）」で、案内が Bus を言う', function() {
    tabKey = 'sequence|open-1';
    MA.selectedEndpoints.clear();
    harness(HAND);
    expect($('seq-tail-from').value).toBe('Bus');
    expect($('seq-tail-to').value).toBe('');
    // 開いた直後は図の参加者を押す手がまだ効かない (TICKET-owner-20261123-2322-1)。
    expect($('seq-tail-to').options[0].textContent).toBe('（一覧から選ぶ）');
    expect($('seq-tail-endpoint-note').textContent).toContain('Bus');
  });

  test('本文だけ打って「+ 追加」→ 行を足さず To の見出しの語で知らせ、手は To。To を選ぶと Bus -> Ctl の 1 行だけ', function() {
    tabKey = 'sequence|open-2';
    MA.selectedEndpoints.clear();
    var h = harness(HAND);
    var before = h.text;
    alerts.length = 0;
    fill('#seq-tail-label-rle .rle-textarea', 'poll');
    $('seq-tail-add').click();
    expect(h.text).toBe(before);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain('終点 (To)');
    expect(W.document.activeElement === $('seq-tail-to')).toBe(true);
    pick('seq-tail-to', 'Ctl');
    $('seq-tail-add').click();
    var added = h.text.split('\n').filter(function(l) { return before.split('\n').indexOf(l) < 0; });
    expect(added.length).toBe(1);
    expect(/^\s*Bus\s*->\s*Ctl\s*:\s*poll\s*$/.test(added[0])).toBe(true);
  });

  test('白紙で参加者を 2 人足した直後のメッセージ: From = 先頭の参加者、To は空欄 (自己メッセージにしない)', function() {
    tabKey = 'sequence|blank-1';
    MA.selectedEndpoints.clear();
    var h = harness('@startuml\n@enduml');
    $('seq-tail-kind-chip-participant').click();
    fill('seq-tail-alias', 'Pa');
    $('seq-tail-add').click();
    fill('seq-tail-alias', 'Pb');
    $('seq-tail-add').click();
    $('seq-tail-kind-chip-message').click();
    expect($('seq-tail-from').value).toBe('Pa');
    expect($('seq-tail-to').value).toBe('');
    expect(h.text).toContain('participant Pb');
  });

  test('開いた直後にフォームへ触れずに図の参加者を押すのは参加者を選ぶ手のまま。欄に触れた後は押した参加者が To に入る', function() {
    tabKey = 'sequence|pick-1';
    MA.selectedEndpoints.clear();
    harness(HAND);
    var head = W.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    head.setAttribute('data-type', 'participant');
    head.setAttribute('data-id', 'Ctl');
    expect(SEQ.handleOverlayPick(head)).toBe(false);
    expect($('seq-tail-to').value).toBe('');
    W.document.querySelector('#seq-tail-label-rle .rle-textarea').dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    expect(SEQ.handleOverlayPick(head)).toBe(true);
    expect($('seq-tail-to').value).toBe('Ctl');
  });

  test('タブを替えた直後: 前のタブで選んだ行の当事者を持ち込まず、To は空欄', function() {
    tabKey = 'sequence|tabA';
    TM.sync();
    MA.selectedEndpoints.remember({ from: 'Ctl', to: 'CtlMon' });
    tabKey = 'sequence|tabB';
    harness(HAND);
    expect($('seq-tail-to').value).toBe('');
    expect($('seq-tail-from').value).toBe('Bus');
  });
});

TM.setKeyFn(null);
