'use strict';
// BLK-primary-20260909-0003-wish: 「いつ・どの版で何を客先に出したか」の控えを
// 保存フォルダに置き、次に出すときの差分の基準にする。判断だけを純関数で持つ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/export-log.js')]; } catch (e) {}
require('../src/core/export-log.js');
var EL = global.window.MA.exportLog;

var A1 = '@startuml\nA -> B: x\n@enduml';
var A2 = '@startuml\nA -> B: x\nA -> B: y\n@enduml';
var B1 = '@startuml\nstate Idle\n@enduml';

function docs(list) { return list; }

describe('exportLog.parse', () => {
  test('空・壊れた JSON は「まだ 1 度も出していない」控えになる', () => {
    [null, '', '{{{', 'null', '[]'].forEach(function(raw) {
      var log = EL.parse(raw);
      expect(EL.entries(log, 'delivery')).toEqual([]);
      expect(EL.latest(log, 'delivery').at).toBe('');
    });
  });

  test('文字列でもオブジェクトでも同じ控えになる', () => {
    var log = EL.record(EL.empty(), 'delivery', {
      at: '2026-09-09T00:03:00', title: '図面集', revision: '1.0', file: 'd.zip',
      docs: docs([{ name: 'Gpio', dsl: A1 }]),
    });
    var text = EL.serialize(log);
    expect(EL.latest(EL.parse(text), 'delivery').revision).toBe('1.0');
    expect(EL.latest(EL.parse(JSON.parse(text)), 'delivery').count).toBe(1);
  });

  test('channel ごとに別の控えになる', () => {
    var log = EL.record(EL.empty(), 'svg', { at: '2026-09-09T01:00:00', docs: docs([{ name: 'Gpio', dsl: A1 }]) });
    expect(EL.latest(log, 'svg').at).toBe('2026-09-09T01:00:00');
    expect(EL.latest(log, 'delivery').at).toBe('');
  });
});

describe('exportLog.record', () => {
  test('新しい順に積まれ、本文を持つのは直近の 1 件だけ', () => {
    var log = EL.record(EL.empty(), 'delivery', {
      at: '2026-09-08T10:00:00', revision: '1.0', file: 'a.zip', docs: docs([{ name: 'Gpio', dsl: A1 }]),
    });
    log = EL.record(log, 'delivery', {
      at: '2026-09-09T10:00:00', revision: '1.1', file: 'b.zip', docs: docs([{ name: 'Gpio', dsl: A2 }]),
    });
    var list = EL.entries(log, 'delivery');
    expect(list.length).toBe(2);
    expect(list[0].file).toBe('b.zip');
    expect(Object.keys(list[0].marks)).toEqual(['Gpio']);
    // 古い件は「いつ・何枚出したか」だけ残る (23 枚分の本文を何世代も持たない)
    expect(Object.keys(list[1].marks)).toEqual([]);
    expect(list[1].count).toBe(1);
    expect(list[1].names).toEqual(['Gpio']);
  });

  test('控えは MAX_ENTRIES 件で打ち切る', () => {
    var log = EL.empty();
    for (var i = 0; i < EL.MAX_ENTRIES + 5; i++) {
      log = EL.record(log, 'delivery', { at: '2026-09-09T00:0' + (i % 10) + ':00', docs: docs([{ name: 'Gpio', dsl: A1 }]) });
    }
    expect(EL.entries(log, 'delivery').length).toBe(EL.MAX_ENTRIES);
  });
});

describe('exportLog.statusOf / changedNames', () => {
  var log = EL.record(EL.empty(), 'delivery', {
    at: '2026-09-08T19:03:00', revision: '1.0', file: 'delivery-20260908-1903.zip',
    docs: docs([{ name: 'Gpio', dsl: A1 }, { name: 'Spi', dsl: B1 }]),
  });

  test('出した版と同じなら same、違えば changed、出していなければ new', () => {
    expect(EL.statusOf(log, 'delivery', 'Gpio', A1)).toBe('same');
    expect(EL.statusOf(log, 'delivery', 'Gpio', A2)).toBe('changed');
    expect(EL.statusOf(log, 'delivery', 'Can', A1)).toBe('new');
  });

  test('末尾の空白・改行だけの差は same (保存のたびの揺れで差分にしない)', () => {
    expect(EL.statusOf(log, 'delivery', 'Gpio', A1 + '\n\n')).toBe('same');
  });

  test('前回提出以降に変わった図・増えた図だけを名前で返す', () => {
    var names = EL.changedNames(log, 'delivery', docs([
      { name: 'Gpio', dsl: A2 }, { name: 'Spi', dsl: B1 }, { name: 'Can', dsl: A1 },
    ]));
    expect(names).toEqual(['Gpio', 'Can']);
  });

  test('控えが無ければ全部 new (出していないものを黙って落とさない)', () => {
    var names = EL.changedNames(EL.empty(), 'delivery', docs([{ name: 'Gpio', dsl: A1 }]));
    expect(names).toEqual(['Gpio']);
  });
});

describe('exportLog.baselineOf', () => {
  test('直近に出した版の DSL を基準として返す', () => {
    var log = EL.record(EL.empty(), 'delivery', { at: '2026-09-08T19:03:00', docs: docs([{ name: 'Gpio', dsl: A1 }]) });
    expect(EL.baselineOf(log, 'delivery', 'Gpio').dsl).toBe(A1);
    expect(EL.baselineOf(log, 'delivery', 'Gpio').at).toBe('2026-09-08T19:03:00');
    expect(EL.baselineOf(log, 'delivery', 'Can')).toBe(null);
  });
});

describe('exportLog の 1 行', () => {
  var log = EL.record(EL.empty(), 'delivery', {
    at: '2026-09-08T19:03:00', revision: '1.0', file: 'delivery-20260908-1903.zip',
    docs: docs([{ name: 'Gpio', dsl: A1 }, { name: 'Spi', dsl: B1 }]),
  });

  test('履歴の行に日時・版数・枚数・zip 名が並ぶ', () => {
    var line = EL.historyLine(EL.latest(log, 'delivery'), 'delivery');
    expect(line).toContain('2026-09-08 19:03');
    expect(line).toContain('1.0');
    expect(line).toContain('2 枚');
    expect(line).toContain('delivery-20260908-1903.zip');
  });

  test('出したことがあれば「初回提出」ではなく基準の日時を言う', () => {
    var line = EL.sinceLine(log, 'delivery', docs([{ name: 'Gpio', dsl: A2 }, { name: 'Spi', dsl: B1 }, { name: 'Can', dsl: A1 }]));
    expect(line).toContain('2026-09-08 19:03');
    expect(line).toContain('変更 1 枚');
    expect(line).toContain('新規 1 枚');
    expect(line).not.toContain('初回');
  });

  test('全部前回同一ならその旨だけを言う', () => {
    var line = EL.sinceLine(log, 'delivery', docs([{ name: 'Gpio', dsl: A1 }, { name: 'Spi', dsl: B1 }]));
    expect(line).toContain('変わった図はありません');
  });

  test('控えが無いときだけ「初回」と言う', () => {
    expect(EL.sinceLine(EL.empty(), 'svg', docs([{ name: 'Gpio', dsl: A1 }]))).toContain('初回');
  });
});
