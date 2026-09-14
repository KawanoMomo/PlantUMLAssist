'use strict';
// BLK-reviewer-20260908-2003-wish — 図一覧の 1 行に「puml 変更 / SVG 書き出し / labels 一致」を
// 並べる。reviewer は手順4.10・6 でこの 3 つを毎回 render + 手作業の突合で作っていた。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/svg-freshness.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/svg-compare-row.js')]; } catch (e) {}
require('../src/core/svg-freshness.js');
require('../src/core/svg-compare-row.js');

var SCR = window.MA.svgCompareRow;

function e(over) {
  var base = {
    name: 'spi_state', mtime: '2026-09-08T10:00:00', svgMtime: '2026-09-08T10:00:05',
    hash: 'aaa', svgSource: 'aaa', svgHash: 'sss',
  };
  Object.keys(over || {}).forEach(function(k) { base[k] = over[k]; });
  return base;
}

describe('svgCompareRow.row — 1 行ぶんの 3 つの値', function() {
  test('印が今の puml と一致していれば labels 一致', function() {
    var r = SCR.row(e());
    expect(r.labels).toBe('match');
    expect(r.labelsText).toBe('labels 一致');
    expect(r.tone).toBe('ok');
  });

  test('印が食い違えば labels 不一致', function() {
    var r = SCR.row(e({ svgSource: 'bbb' }));
    expect(r.labels).toBe('differ');
    expect(r.tone).toBe('bad');
  });

  test('体裁だけの差は labels としては一致に入れる (作り直しを促さない)', function() {
    var rec = { spi_state: { pumlHash: 'aaa', svgHash: 'sss', result: 'differ-format' } };
    var r = SCR.row(e({ svgSource: '' }), rec);
    expect(r.content).toBe('format');
    expect(r.labels).toBe('match');
    expect(r.title).toContain('体裁');
  });

  test('印が無ければ未刻印。手で確かめる対象はこの図だけ', function() {
    var r = SCR.row(e({ svgSource: '' }));
    expect(r.stamped).toBe(false);
    expect(r.unstamped).toBe(true);
    expect(r.labels).toBe('unknown');
    expect(r.labelsText).toBe('labels 未確認');
  });

  test('SVG が無い図は未刻印と言わない (書き出す対象であって確かめる対象ではない)', function() {
    var r = SCR.row(e({ svgMtime: '', svgSource: '' }));
    expect(r.labels).toBe('missing');
    expect(r.unstamped).toBe(false);
  });

  test('2 つの時刻を同じ書式で並べ、SVG が puml より前なら印を立てる', function() {
    var r = SCR.row(e({ mtime: '2026-09-08T10:00:00', svgMtime: '2026-09-08T09:00:00' }));
    expect(r.puml).toBe('09/08 10:00');
    expect(r.svg).toBe('09/08 09:00');
    expect(r.svgOlder).toBe(true);
    expect(SCR.text(r)).toBe('puml 09/08 10:00 / SVG 09/08 09:00 / labels 一致');
  });

  test('行の説明には 3 つの値が並ぶ', function() {
    var title = SCR.rowTitle(SCR.row(e()));
    expect(title).toContain('puml の最終更新');
    expect(title).toContain('SVG の書き出し');
    expect(title).toContain('文字');
  });

  test('未刻印の図の説明には、描き直して突き合わせる必要があることが出る', function() {
    var title = SCR.rowTitle(SCR.row(e({ svgSource: '' })));
    expect(title).toContain('@pua-source-sha1');
  });
});

describe('svgCompareRow — 一覧ぶんの集計', function() {
  test('名前で引ける形にまとめられる', function() {
    var m = SCR.map([e(), e({ name: 'uart_state', svgSource: '' })]);
    expect(Object.keys(m).sort().join(',')).toBe('spi_state,uart_state');
    expect(m.uart_state.unstamped).toBe(true);
  });

  test('全部一致なら枚数で言い切る', function() {
    var rows = SCR.rows([e(), e({ name: 'uart_state' })]);
    expect(SCR.summary(rows)).toBe('labels: 2 枚とも今の puml と一致しています');
  });

  test('不一致・SVG 無・未確認を分けて数え、名前も返す', function() {
    var rows = SCR.rows([
      e(),
      e({ name: 'uart_state', svgSource: 'zzz' }),
      e({ name: 'can_state', svgSource: '' }),
      e({ name: 'adc_state', svgMtime: '', svgSource: '' }),
    ]);
    expect(SCR.summary(rows)).toBe('labels: 一致 1 枚 / 不一致 1 枚 / SVG 無 1 枚 / 未確認 1 枚');
    expect(SCR.differNames(rows).join(',')).toBe('uart_state');
    expect(SCR.unstampedNames(rows).join(',')).toBe('can_state');
  });

  test('印の要約は、確かめる対象が何枚かを言う', function() {
    expect(SCR.stampSummary(SCR.rows([e(), e({ name: 'uart_state' })]))).toContain('未刻印なし');
    expect(SCR.stampSummary(SCR.rows([e(), e({ name: 'uart_state', svgSource: '' })]))).toContain('未刻印 1 枚');
  });

  test('名前の無い entry は行にしない', function() {
    expect(SCR.rows([e(), { mtime: '2026-09-08T10:00:00' }]).length).toBe(1);
  });

  test('中身のない入力でも落ちない', function() {
    expect(SCR.summary([])).toBe('');
    expect(SCR.rows(null).length).toBe(0);
    expect(SCR.formatTime('not a time')).toBe('');
    expect(SCR.text(null)).toBe('');
    expect(SCR.rowTitle(null)).toBe('');
    expect(SCR.stampSummary([])).toBe('');
  });
});
