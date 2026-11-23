'use strict';
// TICKET-owner-20261123-2322-3: 状態遷移図を開いた直後の「末尾に追加」(遷移) の始点 (From) が一覧の先頭の `[*]` で始まり、
// To だけ選んで足すと選んでいない開始の遷移 (`[*] --> Stop`) が入った。
// 期待: 開いた直後・タブを替えた直後は From が本文の行の順で最後の遷移の行き先 (終了 `[*]` ならその始点。
// 遷移が無ければ今どおり `[*]`) で始まり、案内の 1 行がその名前を言う。状態を選んで開いた・確定した後の決め方は変えない。
// 直しを外す (openFrom を呼ばない / 先頭の `[*]` に戻す) と赤。
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
var TX = MA.stateTxEntry;
var TM = MA.tailMemory;
var tabKey = 'of|0';
if (TM && TM.setKeyFn) TM.setKeyFn(function() { return tabKey; });

function $(id) { return W.document.getElementById(id); }
function harness(text) {
  var mod = MA.modules.plantumlState;
  W.document.body.innerHTML = '';
  var el = W.document.createElement('div');
  el.id = 'props-content';
  W.document.body.appendChild(el);
  var h = { text: text, parsed: mod.parse(text), el: el };
  var ctx = {
    getMmdText: function() { return h.text; },
    setMmdText: function(s) { h.text = s; h.parsed = mod.parse(s); },
    onUpdate: function() { mod.renderProps([], h.parsed, el, ctx); },
  };
  mod.renderProps([], h.parsed, el, ctx);
  return h;
}
function pick(id, v) {
  var el = $(id);
  el.value = v;
  el.dispatchEvent(new W.Event('change', { bubbles: true }));
}
function count(text, re) { return text.split('\n').filter(function(l) { return re.test(l); }).length; }

var ST = '@startuml\n[*] --> Idle\nIdle --> Run : go\nstate Stop\n@enduml';

describe('TICKET-owner-20261123-2322-3 状態遷移図を開いた直後の From は本文の最後の遷移の行き先', function() {
  test('openFrom: 本文の行の順で最後の遷移の行き先', function() {
    var e = TX.openFrom([{ from: '[*]', to: 'Idle', line: 2 }, { from: 'Idle', to: 'Run', line: 3 }]);
    expect(e.from).toBe('Run');
    expect(e.source).toBe('last');
    // 並びが行の順でなくても行の順で見る
    expect(TX.openFrom([{ from: 'Idle', to: 'Run', line: 3 }, { from: '[*]', to: 'Idle', line: 2 }]).from).toBe('Run');
  });

  test('openFrom: 行き先が終了 [*] (や履歴) ならその遷移の始点。両端とも状態でなければ前の遷移。遷移が無ければ空', function() {
    var e = TX.openFrom([{ from: '[*]', to: 'Idle', line: 2 }, { from: 'Run', to: '[*]', line: 4 }]);
    expect(e.from).toBe('Run');
    expect(e.source).toBe('lastEnd');
    expect(TX.openFrom([{ from: 'A', to: 'P[H]', line: 2 }]).from).toBe('A');
    expect(TX.openFrom([{ from: 'A', to: 'B', line: 2 }, { from: '[*]', to: '[*]', line: 3 }]).from).toBe('B');
    var none = TX.openFrom([]);
    expect(none.from).toBe('');
    expect(none.source).toBe('none');
  });

  test('openFrom: 入れ子の端は resolve で選択肢の値 (Parent.Child) にする', function() {
    var e = TX.openFrom([{ from: 'Recv', to: '[*]', line: 5, scope: 'Busy' }],
      function(n, sc) { return sc ? sc + '.' + n : n; });
    expect(e.from).toBe('Busy.Recv');
  });

  test('openFromNote: 出どころの名前を言い、To を図で押す手を続ける', function() {
    expect(TX.openFromNote({ from: 'Run', source: 'last' })).toBe('本文の最後の遷移先 Run から続けます。' + TX.PICK_TO_HINT);
    expect(TX.openFromNote({ from: 'Run', source: 'lastEnd' }, function() { return '実行中'; }))
      .toBe('本文の最後の遷移の始点 実行中 から続けます。' + TX.PICK_TO_HINT);
    expect(TX.openFromNote({ from: '', source: 'none' })).toBe('');
  });

  test('画面: 開いた直後の遷移チップは From = Run・案内が Run を言う。To だけ Stop を選んで足すと Run --> Stop だけが入る', function() {
    tabKey = 'of|1';
    var h = harness(ST);
    $('st-tail-kind-chip-transition').click();
    expect($('st-tail-from').value).toBe('Run');
    expect($('st-tx-hint').textContent).toContain('Run');
    expect($('st-tx-hint').textContent).toContain('遷移先');
    var starts0 = count(h.text, /^\s*\[\*\]\s*-->/);
    pick('st-tail-to', 'Stop');
    $('st-tail-add').click();
    expect(count(h.text, /^\s*Run\s*-->\s*Stop\s*$/)).toBe(1);
    expect(count(h.text, /^\s*\[\*\]\s*-->/)).toBe(starts0);
    // 確定した後は「直前の遷移先から」(変えない)
    expect($('st-tail-from').value).toBe('Stop');
  });

  test('画面: 遷移が無い図は今どおり [*] で始まる', function() {
    tabKey = 'of|2';
    harness('@startuml\nstate A\nstate B\n@enduml');
    $('st-tail-kind-chip-transition').click();
    expect($('st-tail-from').value).toBe('[*]');
  });

  test('画面: タブを替えた直後も、そのタブの本文の最後の遷移から始まる (前のタブの From を持ち込まない)', function() {
    tabKey = 'of|3';
    harness(ST);
    $('st-tail-kind-chip-transition').click();
    expect($('st-tail-from').value).toBe('Run');
    tabKey = 'of|4';
    harness('@startuml\n[*] --> A\nA --> B\nB --> [*]\n@enduml');
    $('st-tail-kind-chip-transition').click();
    expect($('st-tail-from').value).toBe('B');
  });
});

if (TM && TM.setKeyFn) TM.setKeyFn(null);
