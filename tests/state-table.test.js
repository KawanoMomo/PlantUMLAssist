'use strict';
// BLK-builder-20260907-1203-4 (design 4c): 状態遷移図を「現在の状態 × きっかけ」の
// 表として見られること。表は図と同じ parsed から作るので、行・列・空欄が
// DSL とずれないことをここで固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/state-table.js')]; } catch (e) {}
require('../src/core/state-table.js');
var ST = global.window.MA.stateTable;

// design 4c のサンプルと同じ内容。
var SAMPLE = {
  states: [
    { id: 'Idle', label: 'Idle' },
    { id: 'Running', label: 'Running' },
  ],
  transitions: [
    { id: '__t_0', from: '[*]', to: 'Idle', trigger: null, guard: null, action: null, line: 3 },
    { id: '__t_1', from: 'Idle', to: 'Running', trigger: 'start', guard: null, action: null, line: 4 },
    { id: '__t_2', from: 'Running', to: 'Idle', trigger: 'stop', guard: null, action: null, line: 5 },
    { id: '__t_3', from: 'Running', to: '[*]', trigger: 'done', guard: null, action: null, line: 6 },
  ],
};

describe('triggerColumns', function() {
  test('図に出てくる trigger を出現順に一意化する', function() {
    expect(ST.triggerColumns(SAMPLE)).toEqual([ST.NO_TRIGGER, 'start', 'stop', 'done']);
  });

  test('同じ trigger は 1 列にまとまる', function() {
    var p = { states: [], transitions: [
      { id: 'a', from: 'A', to: 'B', trigger: 'go' },
      { id: 'b', from: 'B', to: 'C', trigger: 'go' },
    ] };
    expect(ST.triggerColumns(p)).toEqual(['go']);
  });

  test('遷移が無ければ列も無い', function() {
    expect(ST.triggerColumns({ states: [], transitions: [] })).toEqual([]);
  });
});

describe('rowStates', function() {
  test('[*] を先頭に、あとは宣言順', function() {
    expect(ST.rowStates(SAMPLE)).toEqual(['[*]', 'Idle', 'Running']);
  });

  test('遷移の起点にならない状態は行にしない', function() {
    var p = {
      states: [{ id: 'A' }, { id: 'B' }, { id: 'Lonely' }],
      transitions: [{ id: 't', from: 'A', to: 'B', trigger: 'x' }],
    };
    expect(ST.rowStates(p)).toEqual(['A']);
  });
});

describe('build', function() {
  var table = ST.build(SAMPLE);

  test('行数と列数がサンプルどおり', function() {
    expect(table.rows.length).toBe(3);
    expect(table.triggers.length).toBe(4);
  });

  test('[*] の行は「（開始）」、[*] へ向かうセルは「（終了）」', function() {
    expect(table.rows[0].label).toBe(ST.START_LABEL);
    var running = table.rows[2];
    var doneIdx = table.triggers.indexOf('done');
    expect(running.cells[doneIdx].text).toBe(ST.END_LABEL);
  });

  test('遷移の無いところは null (空欄)', function() {
    var idle = table.rows[1];
    expect(idle.cells[table.triggers.indexOf('stop')]).toBe(null);
    expect(idle.cells[table.triggers.indexOf('start')].to).toBe('Running');
  });

  test('セルは遷移 id と行番号を持つ (クリックで選択できる)', function() {
    var cell = table.rows[1].cells[table.triggers.indexOf('start')];
    expect(cell.transitionId).toBe('__t_1');
    expect(cell.line).toBe(4);
  });

  test('同じ状態・同じ trigger の分岐は 1 セルにまとめ、guard を併記する', function() {
    var p = {
      states: [{ id: 'Busy' }, { id: 'Stop' }, { id: 'Retry' }],
      transitions: [
        { id: 't0', from: 'Busy', to: 'Stop', trigger: 'Fault', guard: '重大', line: 5 },
        { id: 't1', from: 'Busy', to: 'Retry', trigger: 'Fault', guard: '軽微', line: 6 },
      ],
    };
    var t = ST.build(p);
    expect(t.triggers).toEqual(['Fault']);
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].cells[0].text).toBe('Stop [重大] / Retry [軽微]');
    expect(t.rows[0].cells[0].count).toBe(2);
  });

  test('状態のラベルがあれば行見出しに使う', function() {
    var p = {
      states: [{ id: 'S1', label: '待機中' }],
      transitions: [{ id: 't', from: 'S1', to: 'S1', trigger: 'x' }],
    };
    expect(ST.build(p).rows[0].label).toBe('待機中');
  });

  test('空の図でも落ちない', function() {
    expect(ST.build({ states: [], transitions: [] })).toEqual({ triggers: [], rows: [] });
    expect(ST.build(null)).toEqual({ triggers: [], rows: [] });
  });
});

describe('summaryText', function() {
  test('行・きっかけ・遷移・空欄の数を出す', function() {
    expect(ST.summaryText(ST.build(SAMPLE)))
      .toBe('3 行 · 4 きっかけ · 4 遷移 · 空欄 8');
  });
});

describe('toCsv', function() {
  var csv = ST.toCsv(ST.build(SAMPLE));
  var lines = csv.split('\r\n');

  test('1 行目は見出し', function() {
    expect(lines[0]).toBe('現在の状態 \\ きっかけ,（きっかけなし）,start,stop,done');
  });

  test('空欄は — で埋める', function() {
    expect(lines[2]).toBe('Idle,—,Running,—,—');
  });

  test('カンマ・引用符を含む値は引用する', function() {
    var p = {
      states: [{ id: 'A', label: 'a,b' }],
      transitions: [{ id: 't', from: 'A', to: 'A', trigger: 'x"y' }],
    };
    var out = ST.toCsv(ST.build(p)).split('\r\n');
    expect(out[0]).toBe('現在の状態 \\ きっかけ,"x""y"');
    expect(out[1]).toBe('"a,b","a,b"');
  });
});
