'use strict';
// BLK-builder-20260907-1418-3 / design 5d 網羅表「Sequence のその他パレット: par / break / critical」。
//
// 仕様: par / break / critical はパレットの行として出す。2d/5c の書き方に従い、
// 各行は「何が起きるか」が主で、記法 (par … end) は従。ブロックの Kind を選ぶ
// select にも同じ説明を出し、`alt` `par` の記法だけが並ぶ状態にしない。

var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

describe('「その他」のブロック行', function() {
  test('5d が挙げる par / break / critical が行として並ぶ', function() {
    var vals = seq.otherInsertKinds().map(function(o) { return o.value; });
    ['block:par', 'block:break', 'block:critical'].forEach(function(v) {
      expect(vals.indexOf(v) >= 0).toBe(true);
    });
  });

  test('常時表示の alt / loop はパレットに重複して出さない', function() {
    var vals = seq.otherInsertKinds().map(function(o) { return o.value; });
    expect(vals.indexOf('block:alt')).toBe(-1);
    expect(vals.indexOf('block:loop')).toBe(-1);
  });

  test('「その他のブロック」という行き止まりの 1 行は残っていない', function() {
    var vals = seq.otherInsertKinds().map(function(o) { return o.value; });
    expect(vals.indexOf('block')).toBe(-1);
  });

  test('各行は「何が起きるか」が主で、記法が従', function() {
    seq.otherInsertKinds().forEach(function(o) {
      if (String(o.value).indexOf('block:') !== 0) return;
      var kind = String(o.value).slice('block:'.length);
      // ラベルに記法をそのまま書かない (説明が主)。
      expect(o.label.indexOf(kind)).toBe(-1);
      expect(o.label.length > 0).toBe(true);
      // 記法は hint 側に置く。
      expect(o.hint.indexOf(kind)).toBe(0);
    });
  });
});

describe('groupLabel', function() {
  test('記法だけでなく何が起きるかを添える', function() {
    expect(seq.groupLabel('par')).toBe('並行して進む (par)');
    expect(seq.groupLabel('break')).toBe('途中で抜ける (break)');
    expect(seq.groupLabel('critical')).toBe('割り込まれては困る区間 (critical)');
    expect(seq.groupLabel('alt')).toBe('条件で分かれる (alt)');
  });

  test('7 種すべてに説明がある', function() {
    seq.groupKinds().forEach(function(k) {
      expect(seq.groupLabel(k)).toBe(seq.groupLabel(k));
      expect(seq.groupLabel(k).length > k.length + 3).toBe(true);
      expect(seq.groupLabel(k).indexOf('(' + k + ')') > 0).toBe(true);
    });
  });

  test('知らない種別は記法のまま返す', function() {
    expect(seq.groupLabel('unknown')).toBe('unknown');
  });
});

describe('選んだ行がそのままブロックの種別になる', function() {
  var BASE = [
    '@startuml',
    'actor User',
    'participant System',
    'User -> System : Request',
    '@enduml',
  ].join('\n');

  test('addGroup は par / break / critical の枠を書ける', function() {
    var out = seq.addGroup(BASE, 'par', '並行');
    expect(out).toContain('par 並行');
    expect(out).toContain('end');
    var parsed = seq.parse(out);
    var g = (parsed.groups || []).filter(function(x) { return x.gtype === 'par'; });
    expect(g.length).toBe(1);
  });

  test('critical も枠として読み返せる', function() {
    var out = seq.addGroup(BASE, 'critical', '排他区間');
    var parsed = seq.parse(out);
    var g = (parsed.groups || []).filter(function(x) { return x.gtype === 'critical'; });
    expect(g.length).toBe(1);
    expect(g[0].label).toBe('排他区間');
  });
});
