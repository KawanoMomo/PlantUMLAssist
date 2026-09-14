'use strict';
// BLK-junior-20260907-0443: 状態遷移図で state と遷移をまとめて末尾追加する。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/id-normalizer.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;

var BASE = ['@startuml', '@enduml'].join('\n');
var EMPTY = { states: [] };

describe('state parseBulkLines', function() {
  test('裸の語は state', function() {
    expect(stMod.parseBulkLines('Idle\nstate Active')).toEqual([
      { op: 'state', id: 'Idle', label: '', stereotype: null },
      { op: 'state', id: 'Active', label: '', stereotype: null },
    ]);
  });

  test(': でラベルを付けられる', function() {
    expect(stMod.parseBulkLines('Error : 異常検知')).toEqual([
      { op: 'state', id: 'Error', label: '異常検知', stereotype: null },
    ]);
  });

  test('<<choice>> をステレオタイプとして拾う', function() {
    expect(stMod.parseBulkLines('Sel <<choice>>')).toEqual([
      { op: 'state', id: 'Sel', label: '', stereotype: 'choice' },
    ]);
  });

  test('--> は遷移', function() {
    expect(stMod.parseBulkLines('Idle --> Active')).toEqual([
      { op: 'transition', from: 'Idle', to: 'Active', trigger: null, guard: null, action: null },
    ]);
  });

  test('[*] を始端・終端として扱う', function() {
    expect(stMod.parseBulkLines('[*] --> Idle\nActive --> [*]')).toEqual([
      { op: 'transition', from: '[*]', to: 'Idle', trigger: null, guard: null, action: null },
      { op: 'transition', from: 'Active', to: '[*]', trigger: null, guard: null, action: null },
    ]);
  });

  test('トリガ・ガード・アクションを読み分ける', function() {
    expect(stMod.parseBulkLines('Active --> Error : fail [retry > 3] / log()')).toEqual([
      { op: 'transition', from: 'Active', to: 'Error', trigger: 'fail', guard: 'retry > 3', action: 'log()' },
    ]);
  });

  test('空行・コメント行・@startuml/@enduml は無視する', function() {
    expect(stMod.parseBulkLines('\nIdle\n\n\' コメント\n# メモ\n@startuml\n@enduml')).toEqual([
      { op: 'state', id: 'Idle', label: '', stereotype: null },
    ]);
  });

  test('空・null でも落ちない', function() {
    expect(stMod.parseBulkLines('')).toEqual([]);
    expect(stMod.parseBulkLines(null)).toEqual([]);
  });
});

describe('state addBulk', function() {
  var BLOCK = [
    'Idle : 待機',
    'Active',
    'Error',
    'Shutdown',
    '[*] --> Idle',
    'Idle --> Active : Gpio_Init()',
    'Active --> Error : fault [code != 0] / log()',
    'Error --> Idle : reset',
    'Active --> Shutdown : stop',
    'Shutdown --> [*]',
  ].join('\n');

  test('state 4 つと遷移 6 本が 1 回でそろう', function() {
    var out = stMod.addBulk(BASE, BLOCK, EMPTY);
    var lines = out.split('\n');
    var states = lines.filter(function(l) { return /^state\s/.test(l); });
    var trans = lines.filter(function(l) { return l.indexOf('-->') >= 0; });
    expect(states.length).toBe(4);
    expect(trans.length).toBe(6);
  });

  test('state の宣言が遷移より前に並ぶ', function() {
    var out = stMod.addBulk(BASE, BLOCK, EMPTY);
    var lines = out.split('\n');
    var lastState = -1, firstTrans = lines.length;
    lines.forEach(function(l, i) {
      if (/^state\s/.test(l)) lastState = i;
      if (l.indexOf('-->') >= 0 && i < firstTrans) firstTrans = i;
    });
    expect(lastState).toBeLessThan(firstTrans);
  });

  test('入力順は問わない (遷移を先に書いても宣言が前に来る)', function() {
    var out = stMod.addBulk(BASE, 'Idle --> Active\nIdle\nActive', EMPTY);
    var lines = out.split('\n');
    expect(lines.indexOf('Idle --> Active')).toBeGreaterThan(lines.indexOf('state Idle'));
  });

  test('ラベルとトリガ・ガード・アクションが DSL に出る', function() {
    var out = stMod.addBulk(BASE, BLOCK, EMPTY);
    expect(out).toContain('state "待機" as Idle');
    expect(out).toContain('Active --> Error : fault [code != 0] / log()');
  });

  test('[*] は state として宣言しない', function() {
    var out = stMod.addBulk(BASE, '[*] --> Idle\nIdle', EMPTY);
    expect(out).not.toContain('state [*]');
    expect(out).toContain('[*] --> Idle');
  });

  test('宣言済みの state は宣言し直さず参照だけする', function() {
    var parsed = { states: [{ id: 'Idle', label: 'Idle' }] };
    var out = stMod.addBulk(BASE, 'Idle\nActive\nIdle --> Active', parsed);
    var states = out.split('\n').filter(function(l) { return /^state\s/.test(l); });
    expect(states.length).toBe(1);
    expect(states[0]).toContain('Active');
    expect(out).toContain('Idle --> Active');
  });

  test('日本語 ID は ASCII の alias に正規化され、遷移側も追随する', function() {
    var out = stMod.addBulk(BASE, '待機中\n動作中\n待機中 --> 動作中 : start', EMPTY);
    var trans = out.split('\n').filter(function(l) { return l.indexOf('-->') >= 0; })[0];
    expect(trans).not.toContain('待機中');
    expect(out).toContain('待機中');   // ラベルとしては残る
    expect(/^[^　-鿿]+$/.test(trans)).toBe(true);
  });

  test('ステレオタイプ付きの state を宣言できる', function() {
    expect(stMod.addBulk(BASE, 'Sel <<choice>>', EMPTY)).toContain('<<choice>>');
  });

  test('追加できる行が無ければ元の DSL のまま返す', function() {
    expect(stMod.addBulk(BASE, '\n\n', EMPTY)).toBe(BASE);
  });

  test('@enduml より前に入る', function() {
    var out = stMod.addBulk(BASE, 'Idle\n[*] --> Idle', EMPTY);
    var lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('@enduml');
  });
});

global.window = prevWindow;
global.document = prevDocument;
