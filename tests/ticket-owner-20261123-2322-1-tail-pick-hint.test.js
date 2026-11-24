'use strict';
// TICKET-owner-20261123-2322-1: シーケンス図を開いた直後の「末尾に追加」(メッセージ) の案内が
// 「To は図の参加者を押すか選んでください」と言うのに、開いた直後の図の参加者の押下は参加者を選ぶ手のまま
// (data-pick-armed が 0) で To に入らなかった。
// 期待: 押す手が効かない間 (開いた直後・タブを替えた直後) の案内と To の空欄の行は一覧で選ぶ手だけを言い、
// フォームの欄に触れて押す手が効いた時に「図の参加者を押す」に言い替える。案内が押す手を言っている間に
// 図の参加者を押すと必ず To に入る。直しを外す (開いた直後から「押す」を言う) と赤。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var W = dom.window;
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
  } catch (e) { /* 画面に要らない部品の読み失敗はこの票の関心ではない */ }
});
var MA = W.MA;
var TM = MA.tailMemory;
var SEQ = MA.modules.plantumlSequence;
var tabKey = 'sequence|hint';
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
function head(id) {
  var r = W.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('data-type', 'participant');
  r.setAttribute('data-id', id);
  return r;
}
var SEQ_TEXT = ['@startuml', 'participant A', 'participant B', 'participant C', 'A -> B : start()', '@enduml'].join('\n');
var PRESS = '図の参加者を押す';

describe('TICKET-owner-20261123-2322-1 案内の語と図を押す手を一致させる', function() {
  test('toPickHint / toPickPlaceholder: 押す手が効く間だけ「図の参加者を押す」を言う', function() {
    expect(TM.toPickHint(false)).toBe('To は一覧で選んでください');
    expect(TM.toPickHint(false)).not.toContain(PRESS);
    expect(TM.toPickHint(true)).toBe('To は図の参加者を押すか選んでください');
    expect(TM.toPickPlaceholder(false)).toBe('（一覧から選ぶ）');
    expect(TM.toPickPlaceholder(true)).toBe('（図の参加者を押すか選ぶ）');
  });

  test('openMessageNote: armed を省くと (開いた直後) 押す手を言わない', function() {
    var n = TM.openMessageNote({ from: 'B', source: 'last' });
    expect(n).toBe('本文の最後のメッセージの送り先 B から続けます。To は一覧で選んでください');
    expect(TM.openMessageNote({ from: 'B', source: 'last' }, null, true)).toContain(PRESS);
  });

  test('開いた直後: 案内も空欄の行も押す手を言わず、図の参加者を押しても To は空のまま (選択の手)', function() {
    tabKey = 'sequence|hint-open';
    MA.selectedEndpoints.clear();
    harness(SEQ_TEXT);
    var note = $('seq-tail-endpoint-note').textContent;
    var ph = $('seq-tail-to').options[0].textContent;
    expect(note).toContain('B');
    expect(note).not.toContain(PRESS);
    expect(ph).not.toContain('押す');
    expect(SEQ.handleOverlayPick(head('C'))).toBe(false);
    expect($('seq-tail-to').value).toBe('');
  });

  test('欄に触れると案内と空欄の行が「図の参加者を押す」に替わり、その間に押すと必ず To に入る', function() {
    tabKey = 'sequence|hint-arm';
    MA.selectedEndpoints.clear();
    harness(SEQ_TEXT);
    W.document.querySelector('#seq-tail-label-rle .rle-textarea').dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    expect($('seq-tail-endpoint-note').textContent).toBe('本文の最後のメッセージの送り先 B から続けます。To は図の参加者を押すか選んでください');
    expect($('seq-tail-to').options[0].textContent).toBe('（図の参加者を押すか選ぶ）');
    expect(SEQ.handleOverlayPick(head('C'))).toBe(true);
    expect($('seq-tail-to').value).toBe('C');
  });

  test('案内が「図の参加者を押す」と言っている間は、押す手が効く (語と働きが食い違わない)', function() {
    tabKey = 'sequence|hint-inv';
    MA.selectedEndpoints.clear();
    harness(SEQ_TEXT);
    var armed = $('seq-tail-to').getAttribute('data-pick-armed') === '1';
    expect($('seq-tail-endpoint-note').textContent.indexOf(PRESS) >= 0).toBe(armed);
  });
});

TM.setKeyFn(null);
