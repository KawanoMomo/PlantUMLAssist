'use strict';
// BLK-junior-20260907-0943: 他の図から取り込んだ行に `interface "GPIO制御" as IGpio` が
// あると、取り込みが `interface ""GPIO制御" as IGpio" as C1` という壊れた行を書き出した。
// 宣言の `"表示名" as Alias` / `Alias as "表示名"` を名前と表示名に分けて読む。

var comp = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlComponent);

var EMPTY = ['@startuml', '@enduml'].join('\n');

describe('component 一括取り込み: 別名つきの宣言', function() {
  test('`interface "表示名" as Alias` を名前と表示名に分けて読む', function() {
    var ops = comp.parseBulkLines('interface "GPIO制御" as IGpio');
    expect(ops.length).toBe(1);
    expect(ops[0].op).toBe('interface');
    expect(ops[0].id).toBe('IGpio');
    expect(ops[0].label).toBe('GPIO制御');
  });

  test('`component "表示名" as Alias` も同じ', function() {
    var ops = comp.parseBulkLines('component "GPIOドライバ" as GpioDrv');
    expect(ops[0].op).toBe('component');
    expect(ops[0].id).toBe('GpioDrv');
    expect(ops[0].label).toBe('GPIOドライバ');
  });

  test('`Alias as "表示名"` の並びでも読む', function() {
    var ops = comp.parseBulkLines('component GpioDrv as "GPIOドライバ"');
    expect(ops[0].id).toBe('GpioDrv');
    expect(ops[0].label).toBe('GPIOドライバ');
  });

  test('取り込んだ行が壊れた DSL にならない (二重引用符も C1 も出ない)', function() {
    var out = comp.addBulk(EMPTY, 'interface "GPIO制御" as IGpio', comp.parse(EMPTY));
    expect(out).toContain('interface "GPIO制御" as IGpio');
    expect(out).not.toContain('""');
    expect(out).not.toContain('as C1');
  });

  test('取り込んだ図をもう一度読むと、元と同じ名前と表示名になる', function() {
    var out = comp.addBulk(EMPTY, 'interface "GPIO制御" as IGpio', comp.parse(EMPTY));
    var el = comp.parse(out).elements.filter(function(e) { return e.kind === 'interface'; })[0];
    expect(el.id).toBe('IGpio');
    expect(el.label).toBe('GPIO制御');
  });

  test('起票の再現: 部品 + 別名つき interface + 関係をまとめて取り込む', function() {
    var block = [
      'component "GPIOドライバ" as GpioDrv',
      'interface "GPIO制御" as IGpio',
      'GpioDrv ..> IGpio',
    ].join('\n');
    var out = comp.addBulk(EMPTY, block, comp.parse(EMPTY));
    expect(out).toContain('component "GPIOドライバ" as GpioDrv');
    expect(out).toContain('interface "GPIO制御" as IGpio');
    expect(out).not.toContain('""');
    var parsed = comp.parse(out);
    var ids = parsed.elements.map(function(e) { return e.id; });
    expect(ids.indexOf('GpioDrv') >= 0).toBe(true);
    expect(ids.indexOf('IGpio') >= 0).toBe(true);
    expect(parsed.relations.length).toBe(1);
  });

  test('別名を持たない従来の行の読み方は変わらない', function() {
    var ops = comp.parseBulkLines(['component Web', 'interface IApi', '[Db]', '() IPort'].join('\n'));
    expect(ops.map(function(o) { return o.id; }).join(' ')).toBe('Web IApi Db IPort');
    expect(ops.map(function(o) { return o.op; }).join(' ')).toBe('component interface component interface');
  });

  test('`名前 : 表示名` の書き方も従来どおり', function() {
    var ops = comp.parseBulkLines('component Web : ウェブ');
    expect(ops[0].id).toBe('Web');
    expect(ops[0].label).toBe('ウェブ');
  });
});
