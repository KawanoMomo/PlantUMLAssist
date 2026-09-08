'use strict';
// BLK-primary-20260908-1303: 集計行とボタンが違う基準で数えていた。
// 集計行は mtime だけを見て「SVG: 古い 2 枚」と言い、同じ画面の
// 「古い SVG を作り直す」は内容一致まで見て「古い SVG はありません」で押せない。
// 見出しからは「本当に古いのか」が読めず、下まで開いて確かめる手間が毎回要る。
// 数える基準を needsRender と揃え、内容一致で落ちた分は括弧で名指しする。

var W = (typeof window !== 'undefined' && window) || global.window;
var SF = W.MA.svgFreshness;

var NEW = '2026-09-08T12:00:00';
var OLD = '2026-09-08T11:00:00';

function e(name, mtime, svgMtime, hash, svgSource) {
  return { name: name, mtime: mtime, svgMtime: svgMtime, hash: hash, svgSource: svgSource };
}

// mtime では古いが、svg に刻まれた印が今の puml と同じ図 (= 作り直し不要)。
function settled(name) {
  return e(name, NEW, OLD, 'aaa', 'aaa');
}
// mtime も古く、中身も食い違う図 (= 作り直しが要る)。
function reallyStale(name) {
  return e(name, NEW, OLD, 'bbb', 'ccc');
}

describe('集計行はボタンと同じ基準で数える', function() {
  test('中身が一致した図は「古い」に数えず、なぜ減ったかを添える', function() {
    var s = SF.scan([settled('a'), settled('b')]);
    expect(s.needsRender).toEqual([]);
    expect(SF.renderLabel(s)).toBe('古い SVG はありません');
    expect(SF.summary(s))
      .toBe('SVG は 2 枚とも puml に追いついています（中身が一致した 2 枚は作り直し不要）');
  });

  test('本当に古い図だけが件数に残る', function() {
    var s = SF.scan([settled('a'), reallyStale('b')]);
    expect(s.needsRender).toEqual(['b']);
    expect(SF.renderLabel(s)).toBe('古い SVG を作り直す（1 枚）');
    expect(SF.summary(s)).toBe('SVG: 古い 1 枚（中身が一致した 1 枚は作り直し不要）');
  });

  test('集計行の件数とボタンの件数はいつも同じ', function() {
    [[settled('a')], [reallyStale('a')], [settled('a'), reallyStale('b')],
      [e('a', NEW, null), settled('b')]].forEach(function(entries) {
      var s = SF.scan(entries);
      var n = s.needsRender.length;
      var text = SF.summary(s);
      var said = /古い (\d+) 枚/.exec(text);
      var missing = /無い (\d+) 枚/.exec(text);
      var unknown = /不明 (\d+) 枚/.exec(text);
      var total = (said ? +said[1] : 0) + (missing ? +missing[1] : 0) + (unknown ? +unknown[1] : 0);
      expect(total).toBe(n);
    });
  });

  test('SVG が無い図は内容一致になりようがないので、そのまま数える', function() {
    var s = SF.scan([e('a', NEW, null)]);
    expect(SF.summary(s)).toBe('SVG: 無い 1 枚');
    expect(s.needsRender).toEqual(['a']);
  });

  test('内容一致が無ければ括弧は付かない (今までの文言のまま)', function() {
    expect(SF.summary(SF.scan([e('a', OLD, NEW), e('b', OLD, NEW)])))
      .toBe('SVG は 2 枚とも puml に追いついています');
    expect(SF.summary(SF.scan([e('a', NEW, OLD), e('b', NEW, null), e('c', null, NEW)])))
      .toBe('SVG: 古い 1 枚 / 無い 1 枚 / 不明 1 枚');
  });

  test('図が無ければ何も言わない', function() {
    expect(SF.summary(SF.scan([]))).toBe('');
    expect(SF.summary(null)).toBe('');
  });
});
