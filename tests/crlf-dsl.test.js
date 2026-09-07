'use strict';
// BLK-reviewer-20260907-1203: CRLF で保存された DSL でも突合・構造一覧が動くこと。
//
// persona-data 配下の .puml は Windows のエディタ由来で全て CRLF。素の
// split('\n') で行に割ると各行の末尾に CR が残り、行末を見る正規表現
// (`/... : (.+)$/` など) が一切マッチしない。突合は 0 件 = 「問題なし」を返し、
// 実際の不整合が黙って通ってしまう。同じ DSL を LF と CRLF で流して、
// 結果が一致することをここで固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/dsl-utils.js', '../src/core/method-audit.js',
 '../src/core/name-audit.js', '../src/core/outline.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});

var DU = global.window.MA.dslUtils;
var MA_ = global.window.MA.methodAudit;
var OL = global.window.MA.outline;

var STATE_DSL = [
  '@startuml',
  'state Idle',
  'state Sampling',
  '[*] --> Idle',
  'Idle --> Sampling : Timer_StartConv',
  'Sampling --> Idle : Timer_Ack',
  '@enduml',
].join('\n');

var CLASS_DSL = [
  '@startuml',
  'class Timer_Driver {',
  '  + Timer_Init() : void',
  '}',
  '@enduml',
].join('\n');

function crlf(s) { return s.replace(/\n/g, '\r\n'); }

function docs(eol) {
  return [
    { name: 'timer_state', diagramType: 'plantuml-state', dsl: eol(STATE_DSL) },
    { name: 'timer_class', diagramType: 'plantuml-class', dsl: eol(CLASS_DSL) },
  ];
}

var lf = function(s) { return s; };

describe('dslUtils.splitLines', function() {
  test('LF / CRLF / CR のどれでも同じ行に割れる', function() {
    var expected = ['a', 'b', 'c'];
    expect(DU.splitLines('a\nb\nc')).toEqual(expected);
    expect(DU.splitLines('a\r\nb\r\nc')).toEqual(expected);
    expect(DU.splitLines('a\rb\rc')).toEqual(expected);
  });

  test('行末に CR を残さない', function() {
    DU.splitLines('Idle --> Sampling : Timer_StartConv\r\n@enduml')
      .forEach(function(l) { expect(/\r/.test(l)).toBe(false); });
  });

  test('空・null でも落ちない', function() {
    expect(DU.splitLines('')).toEqual(['']);
    expect(DU.splitLines(null)).toEqual(['']);
  });
});

describe('methodAudit.stateEvents — CRLF', function() {
  test('LF と CRLF で同じイベントが取れる', function() {
    var a = MA_.stateEvents(docs(lf));
    var b = MA_.stateEvents(docs(crlf));
    expect(a.map(function(e) { return e.event; })).toEqual(['Timer_StartConv', 'Timer_Ack']);
    expect(b).toEqual(a);
  });

  test('CRLF でも 0 件にならない (これが今回の不具合)', function() {
    expect(MA_.stateEvents(docs(crlf)).length).toBe(2);
  });

  test('行番号も CRLF でずれない', function() {
    var b = MA_.stateEvents(docs(crlf));
    expect(b[0].line).toBe(5);
    expect(b[1].line).toBe(6);
  });
});

describe('methodAudit.parseStateEvent — CRLF の 1 行', function() {
  test('行末に CR が付いていてもきっかけを取れる', function() {
    expect(MA_.parseStateEvent('Idle --> Sampling : Timer_StartConv\r'))
      .toEqual({ event: 'Timer_StartConv' });
  });
});

describe('methodAudit.audit — CRLF', function() {
  test('宣言の無いイベントを CRLF でも指摘する', function() {
    var lfRes = MA_.audit(docs(lf));
    var crlfRes = MA_.audit(docs(crlf));
    expect(crlfRes.issues.length).toBe(lfRes.issues.length);
    expect(crlfRes.clean).toBe(lfRes.clean);
    // Timer_Driver に StartConv / Ack が無いので「問題なし」にはならない
    expect(crlfRes.clean).toBe(false);
  });
});

describe('outline.build — CRLF', function() {
  test('LF と CRLF で同じ構造一覧になる', function() {
    var a = OL.build(STATE_DSL);
    var b = OL.build(crlf(STATE_DSL));
    expect(b).toEqual(a);
  });

  test('CRLF でも状態を拾える', function() {
    var b = OL.build(crlf(STATE_DSL));
    var labels = b.nodes.map(function(n) { return n.label; }).join(' ');
    expect(labels).toContain('Idle');
    expect(labels).toContain('Sampling');
  });
});
