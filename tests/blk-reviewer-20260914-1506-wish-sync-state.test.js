'use strict';
// BLK-reviewer-20260914-1506-wish: 「本体 / 編集中の下書き / 書き出した SVG」のうち
// どれが最新でどれが取り残されているかを、一覧の値だけで言い切れること。
// ここで守るのは向きの区別 —— 「直したのに本体に入っていない」と
// 「本体を直した後で下書きが古い」を同じ『食い違い』に潰さないこと。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
['../src/core/svg-freshness.js', '../src/core/sync-state.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
require('../src/core/svg-freshness.js');
require('../src/core/sync-state.js');

var SS = window.MA.syncState;

// 一覧が返す 1 図ぶん。svg の刻印 (svgSource) が hash と一致していれば「内容一致」。
function ent(name, at, hash, opt) {
  var o = opt || {};
  return {
    name: name, mtime: at, hash: hash,
    svgMtime: o.svgAt === undefined ? at : o.svgAt,
    svgSource: o.svgSource === undefined ? hash : o.svgSource,
  };
}

describe('syncState.baseNameOf — 下書きの名前', function() {
  test('-編集中 とその同義語、末尾の連番も下書きとして本体に結び付く', function() {
    expect(SS.baseNameOf('driver_common_class-編集中')).toBe('driver_common_class');
    expect(SS.baseNameOf('spi_seq-作業中2')).toBe('spi_seq');
    expect(SS.baseNameOf('a-下書き')).toBe('a');
  });

  test('本名の途中に語があるだけの図は下書きにしない', function() {
    expect(SS.baseNameOf('編集中のしくみ')).toBe(null);
    expect(SS.baseNameOf('driver_common_class')).toBe(null);
    expect(SS.isDraftName('gpio_init_sequence')).toBe(false);
  });
});

describe('syncState.draftStatus — 本体と下書きの前後', function() {
  var base = ent('a', '2026-09-14T05:00:00Z', 'h1');

  test('中身が同じなら same (反映漏れではない)', function() {
    expect(SS.draftStatus(base, ent('a-編集中', '2026-09-14T06:00:00Z', 'h1'))).toBe('same');
  });

  test('下書きが新しく中身が違えば draft-ahead = 本体に未反映', function() {
    expect(SS.draftStatus(base, ent('a-編集中', '2026-09-14T06:00:00Z', 'h2'))).toBe('draft-ahead');
  });

  test('本体が新しければ base-ahead = 下書きが取り残されている', function() {
    expect(SS.draftStatus(base, ent('a-編集中', '2026-09-14T04:00:00Z', 'h2'))).toBe('base-ahead');
  });

  test('時刻が取れなければ unknown (分からないものを「同じ」と言わない)', function() {
    expect(SS.draftStatus(base, ent('a-編集中', null, 'h2'))).toBe('unknown');
  });

  test('下書きが無ければ none', function() {
    expect(SS.draftStatus(base, null)).toBe('none');
  });
});

describe('syncState.scan — 保存フォルダ 1 つぶん', function() {
  // 今日の事故そのもの:
  //   driver_common_class … 直した内容が下書きにしか入っていない (draft-ahead)
  //   timer_state         … 本体は直ったが svg が旧内容のまま (svg-stale)
  //   spi_seq             … 下書きが本体と同じ中身 (片付けの対象。反映漏れではない)
  //   can_seq             … 本体も svg も揃っている
  //   lost-編集中         … 本体がもう無い下書き
  var ENTRIES = [
    ent('driver_common_class', '2026-09-14T05:00:00Z', 'h1'),
    ent('driver_common_class-編集中', '2026-09-14T06:00:00Z', 'h2'),
    ent('timer_state', '2026-09-14T05:00:00Z', 'h3', { svgSource: 'old-h3' }),
    ent('spi_seq', '2026-09-14T05:00:00Z', 'h4'),
    ent('spi_seq-編集中', '2026-09-14T05:30:00Z', 'h4'),
    ent('can_seq', '2026-09-14T05:00:00Z', 'h5'),
    ent('lost-編集中', '2026-09-14T05:00:00Z', 'h6'),
  ];
  var sc = SS.scan(ENTRIES, {});

  test('下書きは独立の図として数えず、本体の行に畳む', function() {
    expect(sc.rows.map(function(r) { return r.name; }).sort())
      .toEqual(['can_seq', 'driver_common_class', 'lost', 'spi_seq', 'timer_state']);
  });

  test('直したのに本体へ入っていない図を名指しできる', function() {
    var r = SS.find(sc, 'driver_common_class');
    expect(r.issue).toBe('draft-ahead');
    expect(r.draftName).toBe('driver_common_class-編集中');
    expect(SS.issueText(r)).toContain('本体に入っていません');
  });

  test('本体は直ったが SVG が旧内容の図も同じ表に出る', function() {
    expect(SS.find(sc, 'timer_state').issue).toBe('svg-stale');
  });

  test('中身が同じ下書きは反映漏れにしない (片付けは ⧉重複の職掌)', function() {
    expect(SS.find(sc, 'spi_seq').issue).toBe('');
    expect(SS.find(sc, 'can_seq').issue).toBe('');
  });

  test('本体の無い下書きも落とさず出す', function() {
    var r = SS.find(sc, 'lost');
    expect(r.baseMissing).toBe(true);
    expect(r.issue).toBe('orphan');
  });

  test('未反映の下書きが先頭に来る (直す順に並べる)', function() {
    expect(sc.issues.map(function(r) { return r.issue; }))
      .toEqual(['draft-ahead', 'orphan', 'svg-stale']);
    expect(sc.counts.draftAhead).toBe(1);
    expect(sc.counts.svgStale).toBe(1);
    expect(sc.counts.ok).toBe(2);
  });

  test('見出しの 1 行は向きごとの枚数まで言う', function() {
    var s = SS.summary(sc);
    expect(s).toContain('反映待ち 3 枚');
    expect(s).toContain('本体に未反映の下書き 1 枚');
    expect(s).toContain('古い SVG 1 枚');
  });

  test('食い違いが無ければ「揃っている」と言い切る (黙らない)', function() {
    var clean = SS.scan([ent('a', '2026-09-14T05:00:00Z', 'h1')], {});
    expect(SS.hasIssue(clean)).toBe(false);
    expect(SS.summary(clean)).toBe('本体・編集中・SVG は 1 枚とも揃っています');
    expect(SS.summary(SS.scan([], {}))).toBe('');
  });

  test('印は本体の行にも下書きの行にも出る', function() {
    expect(SS.badge(sc, 'driver_common_class').mark).toBe('未反映');
    expect(SS.badge(sc, 'driver_common_class-編集中').mark).toBe('未反映');
    expect(SS.badge(sc, 'driver_common_class-編集中').of).toBe('driver_common_class');
    expect(SS.badge(sc, 'can_seq')).toBe(null);
  });

  test('3 つの成果物を「最新 / 古い / 無し」で並べられる', function() {
    var ls = SS.lines(SS.find(sc, 'driver_common_class'));
    expect(ls.map(function(l) { return l.label + ':' + SS.stateMark(l.state); }))
      .toEqual(['本体:古い', '編集中:最新', 'SVG:最新']);
    var none = SS.lines(SS.find(sc, 'can_seq'));
    expect(none[1].state).toBe('missing');
    expect(SS.lines(SS.find(sc, 'timer_state'))[2].state).toBe('old');
  });

  test('差分ボタンの文言は比べる相手を名指しする', function() {
    expect(SS.diffLabel(SS.find(sc, 'driver_common_class')))
      .toBe('差分（本体 ⇔ driver_common_class-編集中）');
    expect(SS.diffTitle(SS.find(sc, 'driver_common_class'))).toContain('書き換えません');
  });
});
