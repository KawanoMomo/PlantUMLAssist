'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/svg-freshness.js')]; } catch (e) {}
require('../src/core/svg-freshness.js');

var SF = window.MA.svgFreshness;

function e(name, puml, svg) {
  return { name: name, mtime: puml, svgMtime: svg };
}

var OLD = '2026-09-07T08:10:00Z';
var NEW = '2026-09-08T00:06:00Z';

describe('svgFreshness.statusOf — SVG が puml に追いついているか', function() {
  test('svg の方が古ければ stale', function() {
    expect(SF.statusOf(e('driver_common_class', NEW, OLD))).toBe('stale');
  });
  test('svg の方が新しければ fresh', function() {
    expect(SF.statusOf(e('a', OLD, NEW))).toBe('fresh');
  });
  test('同時刻は追いついているものとして fresh', function() {
    expect(SF.statusOf(e('a', NEW, NEW))).toBe('fresh');
  });
  test('svg が無ければ missing', function() {
    expect(SF.statusOf(e('a', NEW, null))).toBe('missing');
    expect(SF.statusOf(e('a', NEW, ''))).toBe('missing');
  });
  test('puml の時刻が取れなければ unknown (分からないことを fresh と言わない)', function() {
    expect(SF.statusOf(e('a', null, NEW))).toBe('unknown');
    expect(SF.statusOf(e('a', 'not a date', NEW))).toBe('unknown');
  });
  test('entry が無ければ unknown', function() {
    expect(SF.statusOf(null)).toBe('unknown');
  });
});

describe('svgFreshness.scan — 一覧ぶんの判定', function() {
  var entries = [
    e('spi_sequence', OLD, NEW),
    e('driver_common_class', NEW, OLD),
    e('dma_state', NEW, null),
    e('broken', null, null),
  ];

  test('状態ごとに数える', function() {
    var s = SF.scan(entries);
    expect(s.counts).toEqual({ fresh: 1, stale: 1, missing: 2, unknown: 0 });
  });

  test('作り直しが要る図の名前を並べる (fresh 以外)', function() {
    expect(SF.scan(entries).needsRender).toEqual(['driver_common_class', 'dma_state', 'broken']);
  });

  test('名前の無い entry は落とす', function() {
    expect(SF.scan([{ mtime: NEW }, e('a', NEW, NEW)]).rows.length).toBe(1);
  });

  test('entries が無くても落ちない', function() {
    expect(SF.scan(null).rows).toEqual([]);
    expect(SF.scan(null).needsRender).toEqual([]);
  });

  test('statusMap は図名から状態を引ける', function() {
    var m = SF.statusMap(SF.scan(entries));
    expect(m['driver_common_class']).toBe('stale');
    expect(m['spi_sequence']).toBe('fresh');
  });
});

describe('svgFreshness.summary / renderLabel — 画面に出す 1 行', function() {
  test('全部追いついていれば言い切る', function() {
    expect(SF.summary(SF.scan([e('a', OLD, NEW), e('b', OLD, NEW)])))
      .toBe('SVG は 2 枚とも puml に追いついています');
  });
  test('古い / 無い / 不明を分けて数える', function() {
    var s = SF.scan([e('a', NEW, OLD), e('b', NEW, null), e('c', null, NEW)]);
    expect(SF.summary(s)).toBe('SVG: 古い 1 枚 / 無い 1 枚 / 不明 1 枚');
  });
  test('図が無ければ何も言わない', function() {
    expect(SF.summary(SF.scan([]))).toBe('');
  });
  test('ボタンの文言は枚数を出し、0 枚ならそう言う', function() {
    expect(SF.renderLabel(SF.scan([e('a', NEW, OLD)]))).toBe('古い SVG を作り直す（1 枚）');
    expect(SF.renderLabel(SF.scan([e('a', OLD, NEW)]))).toBe('古い SVG はありません');
    expect(SF.renderLabel(null)).toBe('古い SVG はありません');
  });
});

describe('svgFreshness.badge — 一覧の印', function() {
  test('fresh には印を付けない (追いついている図を汚さない)', function() {
    expect(SF.badge('fresh').mark).toBe('');
  });
  test('stale / missing には理由の分かる印が付く', function() {
    expect(SF.badge('stale').mark).toBe('SVG 古');
    expect(SF.badge('stale').title).toContain('作り直す');
    expect(SF.badge('missing').mark).toBe('SVG 無');
  });
  test('知らない状態は unknown に落ちる', function() {
    expect(SF.badge('???').mark).toBe('SVG ?');
  });
});
