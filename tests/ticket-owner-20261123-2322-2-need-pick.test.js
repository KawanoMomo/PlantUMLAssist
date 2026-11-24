'use strict';
// TICKET-owner-20261123-2322-2: 「末尾に追加」で終点 (To) を選ばずに「+ 追加」を押したときの知らせが 5 図種で 4 通りだった
// (sequence は needField の知らせ・手は To、usecase・component・class は欄の下の 1 行だけ、state は語が「遷移先」で手が
// 「+ 追加」に残る)。期待: 5 図種とも共通の 1 本 (properties.needPick) を呼び、行を足さず、欄の見出しの語で知らせ、
// 手がその欄に入り、欄の下の補足も「「{欄の見出し}」を選んでください ({選び方})」の同じ組み立て。
// 直しを外す (図種ごとの文に戻す) と赤。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var W = dom.window;
var alerts = [];
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
var P = MA.properties;
var TM = MA.tailMemory;
var tabKey = 'np|0';
if (TM && TM.setKeyFn) TM.setKeyFn(function() { return tabKey; });

function $(id) { return W.document.getElementById(id); }
function harness(mod, text) {
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

var CASES = [
  { name: 'sequence', mod: 'plantumlSequence', p: 'seq', chip: 'message', hint: 'seq-tail-endpoint-note',
    how: '図の参加者を押すか、一覧で選ぶ',
    text: '@startuml\nparticipant A\nparticipant B\nA -> B : x\n@enduml' },
  { name: 'usecase', mod: 'plantumlUsecase', p: 'uc', chip: 'relation', hint: 'uc-tail-rhint', how: '一覧で選ぶ',
    text: '@startuml\nactor User\nusecase Login\nUser --> Login\n@enduml' },
  { name: 'component', mod: 'plantumlComponent', p: 'co', chip: 'relation', hint: 'co-tail-rhint', how: '一覧で選ぶ',
    text: '@startuml\ncomponent Api\ncomponent Db\nApi --> Db\n@enduml' },
  { name: 'class', mod: 'plantumlClass', p: 'cl', chip: 'relation', hint: 'cl-tail-rpreview', how: '一覧で選ぶ',
    text: '@startuml\nclass Foo\nclass Bar\nFoo --> Bar\n@enduml' },
  { name: 'state', mod: 'plantumlState', p: 'st', chip: 'transition', hint: 'st-tx-hint',
    how: '図の状態を押すか、一覧で選ぶ',
    text: '@startuml\n[*] --> Idle\nIdle --> Run : go\nstate Stop\n@enduml' },
];

describe('TICKET-owner-20261123-2322-2 To を選ばずに「+ 追加」の知らせは 5 図種で同じ共通部', function() {
  test('needPickText: 「{欄の見出し}」を選んでください ({選び方}) を 5 図種の欄の語で組み立てる', function() {
    expect(P.needPickText('終点 (To)', '図の参加者を押すか、一覧で選ぶ')).toBe('「終点 (To)」を選んでください (図の参加者を押すか、一覧で選ぶ)');
    expect(P.needPickText('終点 (To)', '一覧で選ぶ')).toBe('「終点 (To)」を選んでください (一覧で選ぶ)');
    expect(P.needPickText('親 (To)', '一覧で選ぶ')).toBe('「親 (To)」を選んでください (一覧で選ぶ)');
    expect(P.needPickText('もう一方 (To)', '一覧で選ぶ')).toBe('「もう一方 (To)」を選んでください (一覧で選ぶ)');
    expect(P.needPickText('終点 (To)', '図の状態を押すか、一覧で選ぶ')).toBe('「終点 (To)」を選んでください (図の状態を押すか、一覧で選ぶ)');
    // 知らせ (alert) と同じ頭 (needFieldText の選ぶ欄の文)。
    expect(P.needPickText('終点 (To)', '一覧で選ぶ').indexOf(P.needFieldText('終点 (To)', true))).toBe(0);
  });

  CASES.forEach(function(c, i) {
    test(c.name + ': To を選ばずに「+ 追加」→ 本文は不変、欄の見出しの語で知らせ、手は To、補足も同じ組み立て', function() {
      tabKey = 'np|' + i;
      if (MA.selectedEndpoints) MA.selectedEndpoints.clear();
      var mod = MA.modules[c.mod];
      var h = harness(mod, c.text);
      var chip = $(c.p + '-tail-kind-chip-' + c.chip);
      expect(!!chip).toBe(true);
      chip.click();
      var to = $(c.p + '-tail-to');
      expect(!!to).toBe(true);
      to.value = '';
      to.dispatchEvent(new W.Event('change', { bubbles: true }));
      var before = h.text;
      alerts.length = 0;
      $(c.p + '-tail-add').click();
      expect(h.text).toBe(before);
      // 欄の見出しの語 (画面の label の文字) で言う。
      var lab = W.document.querySelector('label[for="' + c.p + '-tail-to"]') || $(c.p + '-tail-to-label');
      var word = String(lab.textContent).trim();
      expect(/\(To\)$/.test(word)).toBe(true);
      expect(alerts).toEqual([P.needFieldText(word, true)]);
      expect(W.document.activeElement === $(c.p + '-tail-to')).toBe(true);
      expect($(c.hint).textContent).toBe(P.needPickText(word, c.how));
    });
  });
});

if (TM && TM.setKeyFn) TM.setKeyFn(null);
