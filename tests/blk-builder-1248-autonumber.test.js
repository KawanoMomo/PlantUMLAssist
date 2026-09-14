'use strict';
// BLK-builder-20260907-1248-2 / design 5b の網羅表「Sequence のその他パレット: autonumber」。
//
// 仕様: シーケンス図のメッセージに通し番号を振れる。PlantUML の `autonumber` は
// @startuml の直後に置く図全体の指定で、開始番号と増分を伴える。

var fs = require('fs');
var path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var AN = W.MA.sequenceAutonumber;

var BASE = ['@startuml', 'actor User', 'participant System',
            'User -> System : Request', '@enduml'].join('\n');

function src(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8'); }

describe('autonumber 行の書き方', function() {
  test('既定 (1 から 1 ずつ) は `autonumber` とだけ書く', function() {
    expect(AN.fmtLine(1, 1)).toBe('autonumber');
  });

  test('開始番号だけ変えたら `autonumber 10`', function() {
    expect(AN.fmtLine(10, 1)).toBe('autonumber 10');
  });

  test('増分も変えたら `autonumber 10 5`', function() {
    expect(AN.fmtLine(10, 5)).toBe('autonumber 10 5');
  });

  test('空欄や 0 以下を渡されても既定に落ちる (壊れた行を書かない)', function() {
    expect(AN.fmtLine('', '')).toBe('autonumber');
    expect(AN.fmtLine(0, -3)).toBe('autonumber');
    expect(AN.fmtLine('abc', null)).toBe('autonumber');
  });
});

describe('今の DSL の状態を読む', function() {
  test('行が無ければ off・1 から 1 ずつ', function() {
    expect(AN.read(BASE)).toEqual({ on: false, start: 1, step: 1, line: null });
  });

  test('`autonumber` を読む', function() {
    var r = AN.read(BASE.replace('actor User', 'autonumber\nactor User'));
    expect(r.on).toBe(true);
    expect(r.start).toBe(1);
    expect(r.step).toBe(1);
    expect(r.line).toBe(2);
  });

  test('`autonumber 10 5` を読む', function() {
    var r = AN.read(BASE.replace('actor User', 'autonumber 10 5\nactor User'));
    expect(r.start).toBe(10);
    expect(r.step).toBe(5);
  });

  test('`autonumber stop` / `resume` は設定行として拾わない', function() {
    var t = BASE.replace('User -> System : Request',
      'autonumber stop\nUser -> System : Request\nautonumber resume');
    expect(AN.read(t).on).toBe(false);
  });

  test('isAutonumberLine は設定行だけを true にする', function() {
    expect(AN.isAutonumberLine('autonumber')).toBe(true);
    expect(AN.isAutonumberLine('autonumber 3 2')).toBe(true);
    expect(AN.isAutonumberLine('autonumber stop')).toBe(false);
    expect(AN.isAutonumberLine('User -> System : x')).toBe(false);
  });
});

describe('DSL に当てる', function() {
  test('付けると @startuml の直後に 1 行だけ入る', function() {
    var out = AN.apply(BASE, { on: true }).split('\n');
    expect(out[0]).toBe('@startuml');
    expect(out[1]).toBe('autonumber');
    expect(out[2]).toBe('actor User');
  });

  test('付けても他の行は 1 バイトも変わらない', function() {
    var before = BASE.split('\n'), after = AN.apply(BASE, { on: true }).split('\n');
    expect(after.length).toBe(before.length + 1);
    expect(after[0]).toBe(before[0]);
    for (var i = 1; i < before.length; i++) expect(after[i + 1]).toBe(before[i]);
  });

  test('開始番号と増分を変えると行だけが書き換わる (行数は増えない)', function() {
    var on = AN.apply(BASE, { on: true });
    var out = AN.apply(on, { on: true, start: 10, step: 5 });
    expect(out.split('\n')[1]).toBe('autonumber 10 5');
    expect(out.split('\n').length).toBe(on.split('\n').length);
  });

  test('外すと行が消え、元の DSL に戻る', function() {
    expect(AN.apply(AN.apply(BASE, { on: true }), { on: false })).toBe(BASE);
  });

  test('もともと無い状態で外しても DSL は変わらない', function() {
    expect(AN.apply(BASE, { on: false })).toBe(BASE);
  });

  test('同じ値を当て直しても DSL は変わらない (履歴を汚さない)', function() {
    var on = AN.apply(BASE, { on: true });
    expect(AN.apply(on, { on: true, start: 1, step: 1 })).toBe(on);
  });

  test('利用者が動かした行の位置は動かさない', function() {
    var t = BASE.replace('participant System', 'participant System\nautonumber');
    var out = AN.apply(t, { on: true, start: 3, step: 1 });
    expect(out.split('\n')[3]).toBe('autonumber 3');
    expect(out.split('\n')[1]).toBe('actor User');
  });

  test('`autonumber stop` は触らない', function() {
    var t = BASE.replace('User -> System : Request', 'autonumber stop\nUser -> System : Request');
    var out = AN.apply(t, { on: true });
    expect(out).toContain('autonumber stop');
    expect(out.split('\n')[1]).toBe('autonumber');
  });

  test('@startuml が無ければ先頭に置く', function() {
    expect(AN.apply('actor User', { on: true }).split('\n')[0]).toBe('autonumber');
  });
});

describe('図の設定タブへの配線', function() {
  var app = src('src/app.js');

  test('シーケンス図のときだけ出す', function() {
    expect(app).toContain("if (currentDiagramType === 'plantuml-sequence') {");
    expect(app).toContain("gNum.id = 'ds-autonumber-group'");
  });

  test('番号の有無・開始番号・増分の 3 つを操作できる', function() {
    ['ds-autonumber-on', 'ds-autonumber-start', 'ds-autonumber-step']
      .forEach(function(id) { expect(app).toContain("'" + id + "'"); });
  });

  test('書式の判断を app.js に書き写していない', function() {
    expect(app).not.toContain("'autonumber '");
    expect(app).toContain('window.MA.sequenceAutonumber');
  });

  test('本体 HTML が core モジュールを読み込む', function() {
    expect(src('plantuml-assist.html')).toContain('src/core/sequence-autonumber.js');
  });
});
