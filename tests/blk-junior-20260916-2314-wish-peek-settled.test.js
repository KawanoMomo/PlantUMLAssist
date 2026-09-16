'use strict';
// BLK-junior-20260916-2314-wish: 「相手 × 図種は手本なし」を一度確定したら二度と聞かない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
try { delete require.cache[require.resolve('../src/core/peek-settled.js')]; } catch (e) {}
require('../src/core/peek-settled.js');
var PS = global.window.MA.peekSettled;
var ROOT = path.join(__dirname, '..');

describe('手本なしの確定リスト (BLK-junior-20260916-2314-wish)', function() {
  test('足した組は相手と図種の両方が合うときだけ確定済み', function() {
    var rows = PS.add([], { peer: 'primary', kind: 'アクティビティ', count: 0 });
    expect(PS.has(rows, 'primary', 'アクティビティ')).toBe(true);
    expect(PS.has(rows, 'primary', 'ユースケース')).toBe(false);
    expect(PS.has(rows, 'reviewer', 'アクティビティ')).toBe(false);
  });
  test('同じ組を足し直しても 1 行、新しい方が先頭', function() {
    var rows = PS.add([], { peer: 'primary', kind: 'A', at: '1' });
    rows = PS.add(rows, { peer: 'primary', kind: 'B', at: '2' });
    rows = PS.add(rows, { peer: 'primary', kind: 'A', at: '3' });
    expect(rows.map(function(r) { return r.kind + r.at; })).toEqual(['A3', 'B2']);
  });
  test('外すとその組だけが消える', function() {
    var rows = PS.add(PS.add([], { peer: 'p', kind: 'A' }), { peer: 'p', kind: 'B' });
    rows = PS.remove(rows, 'p', 'A');
    expect(PS.has(rows, 'p', 'A')).toBe(false);
    expect(PS.has(rows, 'p', 'B')).toBe(true);
  });
  test('壊れた行は捨てる', function() {
    expect(PS.normalize([null, {}, { peer: 'p' }, { peer: 'p', kind: 'K', count: 'x' }]))
      .toEqual([{ peer: 'p', kind: 'K', count: 0, at: '' }]);
    expect(PS.normalize('nope')).toEqual([]);
  });
  test('相手に図が増えたら確定は古い', function() {
    var rec = { peer: 'p', kind: 'K' };
    expect(PS.isStale(rec, 0)).toBe(false);
    expect(PS.isStale(rec, 2)).toBe(true);
    expect(PS.isStale(null, 2)).toBe(false);
  });
  test('確定済みの図種を 1 行にまとめ、以後聞かないと言う', function() {
    expect(PS.summaryText('primary', ['ユースケース', 'アクティビティ']))
      .toBe('✓ primary は手本なしで確定: ユースケース / アクティビティ（以後は聞きません）');
    expect(PS.summaryText('primary', [])).toBe('');
    expect(PS.staleText('primary', 'クラス', 2)).toContain('2 枚増えました');
  });
  test('server はフォルダ側に置き、API 索引と docs に載る', function() {
    var src = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    expect(src.indexOf("PEEK_SETTLED_DIRNAME = '_peek'")).not.toBe(-1);
    expect(src.indexOf("'GET /peek-settled'")).not.toBe(-1);
    var md = fs.readFileSync(path.join(ROOT, 'docs', 'api.md'), 'utf8');
    expect(md.indexOf('POST /peek-settled')).not.toBe(-1);
  });
});
