'use strict';
// BLK-primary-20260914-2106-wish: 納品履歴の 1 回を選んで「その回と今で
// どの図が変わったか」を出す。本文の控えを持たない古い回は、増減までしか言わない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/export-log.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/delivery-history.js')]; } catch (e) {}
require('../src/core/export-log.js');
require('../src/core/delivery-history.js');
var EL = global.window.MA.exportLog;
var DH = global.window.MA.deliveryHistory;

var A1 = '@startuml\nA -> B: x\n@enduml';
var A2 = '@startuml\nA -> B: x\nA -> B: y\n@enduml';
var B1 = '@startuml\nstate Idle\n@enduml';

function rec(log, at, revision, docs) {
  return EL.record(log, 'delivery', { at: at, title: '図面集', revision: revision,
                                      file: 'delivery-' + revision + '.zip', docs: docs });
}

function statusOf(res, name) {
  var out = '';
  res.rows.forEach(function(r) { if (r.name === name) out = r.status; });
  return out;
}

describe('deliveryHistory.compare', () => {
  test('控えが 1 件も無ければ found が false', () => {
    var res = DH.compare(EL.empty(), 'delivery', 0, [{ name: 'Spi', dsl: A1 }]);
    expect(res.found).toBe(false);
    expect(res.rows).toEqual([]);
  });

  test('前回の版と今を図ごとに突き合わせる', () => {
    var log = rec(EL.empty(), '2026-09-14T21:00:00', '1.0',
                  [{ name: 'Spi', dsl: A1 }, { name: 'Can', dsl: B1 }]);
    var res = DH.compare(log, 'delivery', 0,
                         [{ name: 'Spi', dsl: A2 }, { name: 'Can', dsl: B1 }, { name: 'Adc', dsl: A1 }]);
    expect(res.found).toBe(true);
    expect(res.exact).toBe(true);
    expect(statusOf(res, 'Spi')).toBe('changed');
    expect(statusOf(res, 'Can')).toBe('same');
    expect(statusOf(res, 'Adc')).toBe('new');
    expect(res.counts).toEqual({ new: 1, changed: 1, same: 1, removed: 0, kept: 0 });
    expect(res.line).toContain('変更 1 枚');
  });

  test('その回に渡して今は無い図も行に出る', () => {
    var log = rec(EL.empty(), '2026-09-14T21:00:00', '1.0',
                  [{ name: 'Spi', dsl: A1 }, { name: 'Old', dsl: B1 }]);
    var res = DH.compare(log, 'delivery', 0, [{ name: 'Spi', dsl: A1 }]);
    expect(statusOf(res, 'Old')).toBe('removed');
    expect(res.counts.removed).toBe(1);
    expect(res.line).toContain('今は無い 1 枚');
  });

  test('変わっていなければそう言い切る', () => {
    var log = rec(EL.empty(), '2026-09-14T21:00:00', '1.0', [{ name: 'Spi', dsl: A1 }]);
    var res = DH.compare(log, 'delivery', 0, [{ name: 'Spi', dsl: A1 }]);
    expect(res.line).toBe('この回から変わった図はありません');
  });

  test('本文の控えを持たない古い回は、変更の有無を「変更なし」と言わない', () => {
    var log = rec(EL.empty(), '2026-09-13T10:00:00', '1.0',
                  [{ name: 'Spi', dsl: A1 }, { name: 'Old', dsl: B1 }]);
    log = rec(log, '2026-09-14T21:00:00', '1.1', [{ name: 'Spi', dsl: A1 }]);
    var res = DH.compare(log, 'delivery', 1, [{ name: 'Spi', dsl: A2 }, { name: 'Adc', dsl: A1 }]);
    expect(res.exact).toBe(false);
    expect(statusOf(res, 'Spi')).toBe('kept');
    expect(statusOf(res, 'Adc')).toBe('new');
    expect(statusOf(res, 'Old')).toBe('removed');
    expect(res.line).toContain('変更の有無は不明');
    expect(res.line).not.toContain('変更 ');
  });

  test('見出しは何回前かと版数を言う', () => {
    var log = rec(EL.empty(), '2026-09-13T10:00:00', '1.0', [{ name: 'Spi', dsl: A1 }]);
    log = rec(log, '2026-09-14T21:00:00', '1.1', [{ name: 'Spi', dsl: A1 }]);
    expect(DH.compare(log, 'delivery', 0, []).label).toContain('前回');
    var prev = DH.compare(log, 'delivery', 1, []).label;
    expect(prev).toContain('2 回前');
    expect(prev).toContain('1.0');
  });
});

describe('deliveryHistory.pickNames', () => {
  test('その回から変わった図と増えた図だけを返す', () => {
    var log = rec(EL.empty(), '2026-09-14T21:00:00', '1.0',
                  [{ name: 'Spi', dsl: A1 }, { name: 'Can', dsl: B1 }, { name: 'Old', dsl: A1 }]);
    var res = DH.compare(log, 'delivery', 0,
                         [{ name: 'Spi', dsl: A2 }, { name: 'Can', dsl: B1 }, { name: 'Adc', dsl: A1 }]);
    expect(DH.pickNames(res).sort()).toEqual(['Adc', 'Spi']);
  });

  test('本文の控えが無い回は、増えた図だけを返す（不明を変更と言わない）', () => {
    var log = rec(EL.empty(), '2026-09-13T10:00:00', '1.0', [{ name: 'Spi', dsl: A1 }]);
    log = rec(log, '2026-09-14T21:00:00', '1.1', [{ name: 'Spi', dsl: A1 }]);
    var res = DH.compare(log, 'delivery', 1, [{ name: 'Spi', dsl: A2 }, { name: 'Adc', dsl: A1 }]);
    expect(DH.pickNames(res)).toEqual(['Adc']);
  });
});
