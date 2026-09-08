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

// BLK-reviewer-20260908-1103: mtime だけでは「見た目が読めるか」を保証できない。
// server が svg の末尾に刻んだ元 puml の sha1 (svgSource) と、今の puml の sha1 (hash) の突合。
function c(name, puml, svg, hash, source) {
  return { name: name, mtime: puml, svgMtime: svg, hash: hash, svgSource: source };
}
var H1 = 'a'.repeat(40);
var H2 = 'b'.repeat(40);

describe('svgFreshness.contentOf — 内容で一致しているか', function() {
  test('刻んだ sha1 が今の puml と同じなら match', function() {
    expect(SF.contentOf(c('a', NEW, OLD, H1, H1))).toBe('match');
  });
  test('mtime が古くても、内容が一致していれば match', function() {
    expect(SF.statusOf(c('a', NEW, OLD, H1, H1))).toBe('stale');
    expect(SF.contentOf(c('a', NEW, OLD, H1, H1))).toBe('match');
  });
  test('別の puml から作られていれば differ', function() {
    expect(SF.contentOf(c('a', NEW, OLD, H1, H2))).toBe('differ');
  });
  test('印が無ければ unverified (分からないことを match と言わない)', function() {
    expect(SF.contentOf(c('a', NEW, NEW, H1, null))).toBe('unverified');
    expect(SF.contentOf(c('a', NEW, NEW, H1, ''))).toBe('unverified');
  });
  test('puml の sha1 が取れなければ unverified', function() {
    expect(SF.contentOf(c('a', NEW, NEW, null, H1))).toBe('unverified');
  });
  test('svg が無ければ missing', function() {
    expect(SF.contentOf(c('a', NEW, null, H1, null))).toBe('missing');
  });
  test('entry が無くても落ちない', function() {
    expect(SF.contentOf(null)).toBe('unverified');
  });
});

describe('svgFreshness.scan — 内容の判定を持つ', function() {
  var entries = [
    c('match_but_stale', NEW, OLD, H1, H1),   // mtime は古いが内容は一致
    c('really_stale', NEW, OLD, H1, H2),      // 内容までずれている
    c('unstamped', OLD, NEW, H1, null),       // 印が無い
    c('no_svg', NEW, null, H1, null),
  ];

  test('内容ごとに数える', function() {
    expect(SF.scan(entries).contentCounts)
      .toEqual({ match: 1, differ: 1, missing: 1, unverified: 1 });
  });

  test('内容が一致した図は、mtime が古くても作り直しの対象から外す', function() {
    expect(SF.scan(entries).needsRender).toEqual(['really_stale', 'no_svg']);
  });

  test('内容で言い切れない図は needsProof に入る', function() {
    expect(SF.scan(entries).needsProof).toEqual(['really_stale', 'unstamped', 'no_svg']);
  });

  test('contentMap は図名から内容の判定を引ける', function() {
    var m = SF.contentMap(SF.scan(entries));
    expect(m['match_but_stale']).toBe('match');
    expect(m['really_stale']).toBe('differ');
  });

  test('内容が一致した図は、直すものの一覧から外れる', function() {
    var short = SF.shortfall(SF.scan(entries));
    var stale = short.filter(function(g) { return g.status === 'stale'; })[0];
    expect(stale.names).toEqual(['really_stale']);
  });

  test('mtime では見つからない食い違い (svg の方が新しいのに内容が違う) を名指しする', function() {
    var short = SF.shortfall(SF.scan([c('looks_fresh', OLD, NEW, H1, H2)]));
    var differ = short.filter(function(g) { return g.status === 'differ'; })[0];
    expect(differ.names).toEqual(['looks_fresh']);
    expect(differ.label).toBe('SVG の内容が古い');
  });
});

describe('svgFreshness.contentSummary / proofLabel', function() {
  test('全部一致していれば言い切る', function() {
    expect(SF.contentSummary(SF.scan([c('a', NEW, NEW, H1, H1), c('b', NEW, NEW, H2, H2)])))
      .toBe('内容: 2 枚とも今の puml から作られています');
  });
  test('一致 / ずれ / 未確認を分けて数える', function() {
    var s = SF.scan([c('a', NEW, NEW, H1, H1), c('b', NEW, OLD, H1, H2), c('c', NEW, NEW, H1, null)]);
    expect(SF.contentSummary(s)).toBe('内容: 一致 1 枚 / ずれ 1 枚 / 未確認 1 枚');
  });
  test('図が無ければ何も言わない', function() {
    expect(SF.contentSummary(SF.scan([]))).toBe('');
  });
  test('ボタンの文言は枚数を出し、0 枚ならそう言う', function() {
    expect(SF.proofLabel(SF.scan([c('a', NEW, NEW, H1, null)])))
      .toBe('内容を確かめる（1 枚を作り直す）');
    expect(SF.proofLabel(SF.scan([c('a', NEW, NEW, H1, H1)])))
      .toBe('内容はすべて確かめてあります');
    expect(SF.proofLabel(null)).toBe('内容はすべて確かめてあります');
  });
});

describe('svgFreshness.contentBadge — 一覧の印', function() {
  test('内容がずれている図は理由の分かる印', function() {
    expect(SF.contentBadge('differ').mark).toBe('内容ずれ');
    expect(SF.contentBadge('differ').title).toContain('作り直し');
  });
  test('一致した図は「内容一致」と言い切れる', function() {
    expect(SF.contentBadge('match').mark).toBe('内容一致');
  });
  test('知らない状態は unverified に落ちる', function() {
    expect(SF.contentBadge('???').mark).toBe('内容未確認');
  });
});
