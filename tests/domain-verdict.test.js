'use strict';
// BLK-primary-20260909-0503-wish: レビュー指摘「junior の GPIO 図と primary の GPIO 図が
// 別物」を反映するとき、突合で差分は見えても、見た後に「共有ドメインとして統一する」か
// 「別物として title に明示する」かをその場で決めて自分の図に反映する手段が無かった。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
[
  '../src/core/dsl-utils.js',
  '../src/core/parser-utils.js',
  '../src/core/name-audit.js',
  '../src/core/scope-decl.js',
  '../src/core/family-audit.js',
  '../src/core/bulk-rename.js',
  '../src/core/domain-cohort.js',
  '../src/core/domain-verdict.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var dv = global.window.MA.domainVerdict;

var MINE = {
  name: 'primary/gpio_init_sequence.puml',
  dsl: ['@startuml', 'title GPIO 初期化', 'participant Gpio_Driver', 'participant Hw_Ctrl',
    'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n'),
};
var OTHER = {
  name: 'junior/gpio_init_sequence.puml',
  dsl: ['@startuml', 'participant GpioDrv', 'participant Hw_Ctrl', 'participant Nvic',
    'GpioDrv -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n'),
};

describe('domainVerdict の統一案', function() {
  test('同じ部品の綴り違いだけを置換にする', function() {
    var plan = dv.unifyPlan(MINE, OTHER);
    expect(plan.renames.length).toBe(1);
    expect(plan.renames[0].from).toBe('Gpio_Driver');
    expect(plan.renames[0].to).toBe('GpioDrv');
    expect(plan.renames[0].count).toBe(2);
  });

  test('片方にしか無い名前は置換にせず別に出す', function() {
    var plan = dv.unifyPlan(MINE, OTHER);
    expect(plan.missing).toEqual(['Nvic']);
    expect(plan.extra).toEqual([]);
  });

  test('綴りが揃っていれば置換は 0 件', function() {
    expect(dv.unifyPlan(MINE, MINE).renames.length).toBe(0);
  });

  test('applyUnify は識別子単位で置換する', function() {
    var src = '@startuml\nparticipant Gpio_Driver\nGpio_Driver -> X : Gpio_DriverInit\n@enduml';
    var out = dv.applyUnify(src, [{ from: 'Gpio_Driver', to: 'GpioDrv' }]);
    expect(out).toContain('participant GpioDrv');
    expect(out).toContain('GpioDrv -> X');
    expect(out).toContain('Gpio_DriverInit');   // 巻き込まない
  });
});

describe('domainVerdict の別物明示', function() {
  test('既存 title に但し書きを足す', function() {
    var plan = dv.distinguishPlan(MINE, { domain: 'gpio', otherFolder: 'junior' });
    expect(plan.hadTitle).toBe(true);
    expect(plan.to).toBe('GPIO 初期化 (junior の gpio とは別のドメイン)');
    var out = dv.applyDistinguish(MINE.dsl, plan);
    expect(out).toContain('title GPIO 初期化 (junior の gpio とは別のドメイン)');
  });

  test('二度実行しても但し書きは重ならない', function() {
    var p1 = dv.distinguishPlan(MINE, { domain: 'gpio', otherFolder: 'junior' });
    var once = dv.applyDistinguish(MINE.dsl, p1);
    var p2 = dv.distinguishPlan({ name: MINE.name, dsl: once }, { domain: 'gpio', otherFolder: 'junior' });
    var twice = dv.applyDistinguish(once, p2);
    expect(twice).toBe(once);
  });

  test('title が無ければファイル名を土台に @startuml の直後へ作る', function() {
    var doc = { name: 'primary/gpio_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' };
    var plan = dv.distinguishPlan(doc, { domain: 'gpio', otherFolder: 'junior' });
    expect(plan.hadTitle).toBe(false);
    expect(plan.to).toBe('gpio_state (junior の gpio とは別のドメイン)');
    var lines = dv.applyDistinguish(doc.dsl, plan).split('\n');
    expect(lines[1]).toBe('title gpio_state (junior の gpio とは別のドメイン)');
  });
});

describe('domainVerdict の印', function() {
  test('印を読み書きでき、相手ごとに 1 本だけ残る', function() {
    var out = dv.applyMark(MINE.dsl, 'separate', 'gpio', 'junior');
    expect(dv.readVerdict(out, 'junior')).toEqual({ kind: 'separate', domain: 'gpio', other: 'junior' });
    var again = dv.applyMark(out, 'shared', 'gpio', 'junior');
    expect(again.split('\n').filter(function(l) { return /domain-verdict/.test(l); }).length).toBe(1);
    expect(dv.readVerdict(again, 'junior').kind).toBe('shared');
  });

  test('別の相手についての印は消さない', function() {
    var out = dv.applyMark(dv.applyMark(MINE.dsl, 'shared', 'gpio', 'junior'),
      'separate', 'gpio', 'reviewer');
    expect(dv.readVerdict(out, 'junior').kind).toBe('shared');
    expect(dv.readVerdict(out, 'reviewer').kind).toBe('separate');
  });

  test('印が無ければ null', function() {
    expect(dv.readVerdict(MINE.dsl, 'junior')).toBe(null);
  });
});

describe('domainVerdict.apply', function() {
  test('shared は綴りを寄せて印を足す', function() {
    var r = dv.apply('shared', MINE, OTHER, { domain: 'gpio', otherFolder: 'junior' });
    expect(r.changed).toBe(true);
    expect(r.dsl).toContain('participant GpioDrv');
    expect(r.dsl).not.toContain('Gpio_Driver');
    expect(dv.readVerdict(r.dsl, 'junior').kind).toBe('shared');
    expect(dv.summaryLine(r)).toContain('Gpio_Driver → GpioDrv');
  });

  test('separate は title だけを変えて部品名は触らない', function() {
    var r = dv.apply('separate', MINE, OTHER, { domain: 'gpio', otherFolder: 'junior' });
    expect(r.dsl).toContain('participant Gpio_Driver');
    expect(r.dsl).toContain('とは別のドメイン)');
    expect(dv.readVerdict(r.dsl, 'junior').kind).toBe('separate');
  });

  test('shared の後に突合すると部品名の食い違いが消える', function() {
    var dc = global.window.MA.domainCohort;
    var before = dc.diff(MINE, OTHER);
    expect(before.names.onlyA.length).toBe(1);
    var r = dv.apply('shared', MINE, OTHER, { domain: 'gpio', otherFolder: 'junior' });
    var after = dc.diff({ name: MINE.name, dsl: r.dsl }, OTHER);
    expect(after.names.onlyA.length).toBe(0);
    expect(after.names.onlyB).toEqual(['Nvic']);   // 相手にしかない participant は残る
  });

  test('知らない判断は null', function() {
    expect(dv.apply('maybe', MINE, OTHER, {})).toBe(null);
  });
});
