'use strict';
// BLK-primary-20260907-0723: 遷移ラベルを trigger [guard] / action の 3 要素で
// 扱えること。UI のプレビューと実際に書き込む行が同じ関数から出ることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/state-transition.js')]; } catch (e) {}
require('../src/core/state-transition.js');
var ST = global.window.MA.stateTransition;

describe('composeLabel', function() {
  test('3 要素がそろうと trigger [guard] / action', function() {
    expect(ST.composeLabel('start', 'cond', 'act')).toBe('start [cond] / act');
  });

  test('trigger だけ', function() {
    expect(ST.composeLabel('start', '', '')).toBe('start');
  });

  test('guard だけでも角括弧が付く', function() {
    expect(ST.composeLabel('', 'x > 0', null)).toBe('[x > 0]');
  });

  test('action だけならスラッシュ始まり', function() {
    expect(ST.composeLabel(null, null, 'log()')).toBe('/ log()');
  });

  test('全部空ならラベル無し', function() {
    expect(ST.composeLabel('', null, undefined)).toBe('');
  });

  test('前後の空白は落とす', function() {
    expect(ST.composeLabel('  start ', ' cond ', ' act ')).toBe('start [cond] / act');
  });
});

describe('parseLabel', function() {
  test('3 要素に分解できる', function() {
    var p = ST.parseLabel('start [cond] / act');
    expect(p.trigger).toBe('start');
    expect(p.guard).toBe('cond');
    expect(p.action).toBe('act');
  });

  test('空ラベルは全部 null', function() {
    var p = ST.parseLabel('');
    expect(p.trigger).toBeNull();
    expect(p.guard).toBeNull();
    expect(p.action).toBeNull();
  });

  test('compose の逆になる (往復)', function() {
    var cases = [
      ['fault', 'code != 0', 'log()'],
      ['start', '', ''],
      ['', 'retry > 3', ''],
      ['', '', 'reset()'],
    ];
    cases.forEach(function(c) {
      var label = ST.composeLabel(c[0], c[1], c[2]);
      var p = ST.parseLabel(label);
      expect(ST.composeLabel(p.trigger, p.guard, p.action)).toBe(label);
    });
  });
});

describe('previewLine', function() {
  test('確定後に入る行をそのまま返す', function() {
    expect(ST.previewLine('Idle', 'Running', 'start', 'cond', 'act'))
      .toBe('Idle --> Running : start [cond] / act');
  });

  test('ラベルが空なら矢印だけ', function() {
    expect(ST.previewLine('Idle', 'Running', '', '', '')).toBe('Idle --> Running');
  });

  test('From/To 未入力は ? で示す', function() {
    expect(ST.previewLine('', '', 'start', '', '')).toBe('? --> ? : start');
  });

  test('擬似状態も書ける', function() {
    expect(ST.previewLine('[*]', 'Idle', null, null, null)).toBe('[*] --> Idle');
  });
});

describe('summaries', function() {
  test('一覧に出す説明', function() {
    expect(ST.summaryText({ from: 'Idle', to: 'Running', trigger: 'start', guard: null, action: null }))
      .toBe('Idle → Running : start');
  });

  test('parse 結果から id と行番号を拾う', function() {
    var list = ST.summaries({ transitions: [
      { id: '__t_0', line: 3, from: '[*]', to: 'Idle', trigger: null, guard: null, action: null },
      { id: '__t_1', line: 4, from: 'Idle', to: 'Running', trigger: 'start', guard: 'ok', action: 'go()' },
    ] });
    expect(list.length).toBe(2);
    expect(list[0].id).toBe('__t_0');
    expect(list[1].line).toBe(4);
    expect(list[1].text).toBe('Idle → Running : start [ok] / go()');
  });

  test('transitions が無くても落ちない', function() {
    expect(ST.summaries({}).length).toBe(0);
    expect(ST.summaries(null).length).toBe(0);
  });
});
