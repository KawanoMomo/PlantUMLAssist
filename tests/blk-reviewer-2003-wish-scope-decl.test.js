'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
 '../src/core/parser-utils.js', '../src/core/state-transition.js',
 '../src/core/family-audit.js', '../src/core/scope-decl.js',
 '../src/core/trace-coverage.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var sd = global.window.MA.scopeDecl;
var tc = global.window.MA.traceCoverage;
var fa = global.window.MA.familyAudit;

// BLK-reviewer-20260907-2003-wish の実例。gpio 系統は初期化専用シーケンス
// (Idle → Configured だけ) しか持たないので、状態遷移図の初期化後の遷移が
// 宣言前は全部「どこにも現れない」と出ていた。
var GPIO_STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Gpio_Init',
  'Configured --> Sampling : StartConv',
  'Sampling --> Configured : Complete',
  'Configured --> Idle : Gpio_Reset',
  '@enduml',
].join('\n');

var GPIO_SEQ = [
  '@startuml',
  'participant App',
  'participant Gpio',
  'App -> Gpio : Gpio_Init',
  '@enduml',
].join('\n');

function docs(seqDsl) {
  return [
    { id: 's1', name: 'gpio_state.puml', diagramType: 'plantuml-state', dsl: GPIO_STATE },
    { id: 'q1', name: 'gpio_init_sequence.puml', diagramType: 'plantuml-sequence', dsl: seqDsl },
  ];
}

describe('scope-decl', () => {
  test('parse: @covers 行を from/to に読む', () => {
    var p = sd.parse("@startuml\n' @covers Idle -> Configured\nA -> B : x\n@enduml");
    expect(p.declared).toBe(true);
    expect(p.covers.length).toBe(1);
    expect(p.covers[0].from).toBe('Idle');
    expect(p.covers[0].to).toBe('Configured');
    expect(p.covers[0].line).toBe(2);
  });

  test('parse: 1 行にカンマ区切りで複数書ける / [*] も読む', () => {
    var p = sd.parse("' @covers [*] -> Idle, Idle -> Configured");
    expect(p.covers.length).toBe(2);
    expect(p.covers[0].from).toBe('[*]');
    expect(p.covers[1].to).toBe('Configured');
  });

  test('parse: 宣言が無ければ declared は false', () => {
    expect(sd.parse(GPIO_SEQ).declared).toBe(false);
    expect(sd.declared(GPIO_SEQ)).toBe(false);
  });

  test('stateKey: 引用符・大小・区切りの揺れを同じものとして扱う', () => {
    expect(sd.stateKey('"Idle State"')).toBe(sd.stateKey('idle_state'));
    expect(sd.same({ from: 'Idle', to: 'Configured' }, { from: 'idle', to: '"Configured"' })).toBe(true);
    expect(sd.same({ from: 'Idle', to: 'Configured' }, { from: 'Idle', to: 'Sampling' })).toBe(false);
  });

  test('apply: @startuml の直後に宣言を置き、書き直しても重複しない', () => {
    var out = sd.apply(GPIO_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    var lines = out.split('\n');
    expect(lines[1]).toBe("' @covers Idle -> Configured");
    var again = sd.apply(out, [{ from: 'Idle', to: 'Configured' }, { from: 'Configured', to: 'Idle' }]);
    expect(sd.parse(again).covers.length).toBe(2);
    expect(again.split('\n').filter(function(l) { return /@covers/.test(l); }).length).toBe(2);
  });

  test('apply: 空配列は宣言を消す (全部が対象に戻る)', () => {
    var out = sd.apply(GPIO_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    expect(sd.declared(sd.apply(out, []))).toBe(false);
  });

  test('apply: title の後ろに置く (先頭の見出しを押しのけない)', () => {
    var src = '@startuml\ntitle GPIO 初期化\nA -> B : x\n@enduml';
    var out = sd.apply(src, [{ from: 'Idle', to: 'Configured' }]).split('\n');
    expect(out[1]).toBe('title GPIO 初期化');
    expect(out[2]).toBe("' @covers Idle -> Configured");
  });
});

describe('trace-coverage × 担当範囲の宣言', () => {
  test('宣言前: 初期化後の遷移が全部「どこにも現れない」と出る', () => {
    var f = tc.audit(docs(GPIO_SEQ))[0];
    expect(f.declared).toBe(false);
    expect(f.rows.length).toBe(4);
    expect(f.missing.length).toBe(3);
    expect(f.outOfScope.length).toBe(0);
  });

  test('宣言後: 宣言された遷移だけが対象になり、漏れは 0 件になる', () => {
    var seq = sd.apply(GPIO_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    var f = tc.audit(docs(seq))[0];
    expect(f.declared).toBe(true);
    expect(f.declaredBy).toEqual(['gpio_init_sequence.puml']);
    expect(f.rows.length).toBe(1);
    expect(f.missing.length).toBe(0);
    expect(f.outOfScope.length).toBe(3);
  });

  test('宣言後も、宣言した遷移が本当に無ければ漏れとして出る', () => {
    var seq = sd.apply(GPIO_SEQ, [{ from: 'Configured', to: 'Idle' }]);
    var f = tc.audit(docs(seq))[0];
    expect(f.missing.length).toBe(1);
    expect(f.missing[0].label).toBe('Gpio_Reset');
  });

  test('summaryLine: 対象外にした件数を黙らない', () => {
    var seq = sd.apply(GPIO_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    var f = tc.audit(docs(seq))[0];
    expect(tc.summaryLine(f)).toContain('宣言対象外 3 件');
  });

  test('scopeChoices: 全遷移を宣言済みフラグつきで返す', () => {
    var seq = sd.apply(GPIO_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    var f = tc.audit(docs(seq))[0];
    var ch = tc.scopeChoices(f);
    expect(ch.length).toBe(4);
    var on = ch.filter(function(c) { return c.declared; });
    expect(on.length).toBe(1);
    expect(on[0].labels).toEqual(['Gpio_Init']);
  });
});

describe('family-audit × 担当範囲の宣言', () => {
  test('宣言外の遷移から来た「片方にしか無い動作名」は mismatch にしない', () => {
    var before = fa.audit(docs(GPIO_SEQ))[0];
    var seq = sd.apply(GPIO_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    var after = fa.audit(docs(seq))[0];
    expect(after.mismatches.length).toBeLessThan(before.mismatches.length + 1);
    var labels = after.mismatches.map(function(m) { return m.label; });
    expect(labels).not.toContain('StartConv');
    expect(labels).not.toContain('Gpio_Reset');
  });
});
