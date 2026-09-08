'use strict';
// BLK-reviewer-20260909-0603-wish: 覗いたフォルダの一覧に SVG の鮮度を出す。
// 判定そのものは svg-freshness の担当なので、ここで守るのは覗く側の見せ方 —
// 一致にも印を出すこと、作り直しではなく「確かめる」だけを勧めること。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/svg-freshness.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/peek-freshness.js')]; } catch (e) {}
require('../src/core/svg-freshness.js');
require('../src/core/peek-freshness.js');

var PFR = window.MA.peekFreshness;

var T_PUML = '2026-09-09T05:00:00Z';
var T_SVG = '2026-09-09T05:01:00Z';

// name / 今の puml の sha1 / svg に刻まれた印。印が null なら未刻印。
function entry(name, hash, stamp, opts) {
  var o = opts || {};
  return {
    name: name,
    mtime: T_PUML,
    svgMtime: o.noSvg ? null : T_SVG,
    hash: hash,
    svgSource: stamp,
    svgHash: o.svgHash || ('svghash-' + name),
  };
}

function folder(entries, verified) {
  return { entries: entries, verified: verified || {} };
}

describe('peekFreshness.rowBadge — 覗いた一覧の行に出す印', function() {
  test('印が今の puml と一致する図にも「内容一致」を出す (無印にしない)', function() {
    var s = PFR.scan(folder([entry('diagram1', 'aaa', 'aaa')]));
    var b = PFR.rowBadge(s, 'diagram1');
    expect(b.content).toBe('match');
    expect(b.mark).toBe('内容一致');
    expect(b.alert).toBe(false);
  });

  test('印が違う図は「内容ずれ」で名指しする', function() {
    var s = PFR.scan(folder([entry('diagram1', 'aaa', 'bbb')]));
    var b = PFR.rowBadge(s, 'diagram1');
    expect(b.content).toBe('differ');
    expect(b.mark).toBe('内容ずれ');
    expect(b.alert).toBe(true);
  });

  test('印の無い図は「未刻印」。ずれと同じ赤にはしない', function() {
    var s = PFR.scan(folder([entry('diagram1', 'aaa', null)]));
    var b = PFR.rowBadge(s, 'diagram1');
    expect(b.content).toBe('unverified');
    expect(b.mark).toBe('未刻印');
    expect(b.alert).toBe(false);
  });

  test('svg が無い図は「SVG 無」', function() {
    var s = PFR.scan(folder([entry('diagram1', 'aaa', null, { noSvg: true })]));
    expect(PFR.rowBadge(s, 'diagram1').mark).toBe('SVG 無');
    expect(PFR.rowBadge(s, 'diagram1').alert).toBe(true);
  });

  test('描き直して比べた控えがあれば体裁差を「体裁差のみ」と言い分ける', function() {
    var e = entry('diagram1', 'aaa', 'bbb');
    var s = PFR.scan(folder([e], {
      diagram1: { pumlHash: 'aaa', svgHash: e.svgHash, result: 'differ-format' },
    }));
    var b = PFR.rowBadge(s, 'diagram1');
    expect(b.content).toBe('format');
    expect(b.mark).toBe('体裁差のみ');
    expect(b.alert).toBe(false);
  });

  test('一覧に無い名前には何も言わない', function() {
    var s = PFR.scan(folder([entry('diagram1', 'aaa', 'aaa')]));
    expect(PFR.rowBadge(s, 'diagram2')).toBeNull();
  });
});

describe('peekFreshness.verifyTargets — 上書きせずに白黒を付けられる図', function() {
  test('未刻印と、印だけで出たずれが対象になる', function() {
    var s = PFR.scan(folder([
      entry('ok', 'aaa', 'aaa'),
      entry('raw', 'bbb', null),
      entry('drift', 'ccc', 'zzz'),
    ]));
    expect(PFR.verifyTargets(s).sort()).toEqual(['drift', 'raw']);
    expect(PFR.verifyLabel(s)).toBe('SVG の中身を確かめる（2 枚）');
  });

  test('確かめ終わった図しか無ければ押させない', function() {
    var s = PFR.scan(folder([entry('ok', 'aaa', 'aaa')]));
    expect(PFR.verifyTargets(s)).toEqual([]);
    expect(PFR.verifyLabel(s)).toBe('中身を確かめる SVG はありません');
  });
});

describe('peekFreshness.summary — 見出しの 1 行', function() {
  test('ずれがあれば件数を言い、直すものがあると分かる', function() {
    var s = PFR.scan(folder([entry('a', 'aaa', 'aaa'), entry('b', 'bbb', 'zzz')]));
    expect(PFR.summary(s)).toBe('内容: 一致 1 枚 / ずれ 1 枚');
    expect(PFR.hasIssue(s)).toBe(true);
  });

  test('全部一致なら直すものは無い', function() {
    var s = PFR.scan(folder([entry('a', 'aaa', 'aaa')]));
    expect(PFR.summary(s)).toBe('内容: 1 枚とも今の puml から作られています');
    expect(PFR.hasIssue(s)).toBe(false);
  });

  test('空のフォルダでは何も言わない', function() {
    expect(PFR.summary(PFR.scan(folder([])))).toBe('');
  });
});
