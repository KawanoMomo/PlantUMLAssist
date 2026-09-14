'use strict';
// BLK-reviewer-20260914-1806-wish: 下書き (`-編集中`) と本体の差し替え待ちキュー。
// 守るのは 2 つ。
//   (1) 反映漏れの無い下書き (中身が本体と同じ = もう消してよい) もキューに載ること。
//       sync-state はそれを名指ししないので、載せないと「下書きが何枚あるか」が読めず、
//       reviewer は結局 ls して目で拾うことになる。
//   (2) ファイル名 1 つから「本体 / 差し替え待ち / 削除予定」が言えること。
//       手順1 は名前の末尾を読んで役割を推測しない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
['../src/core/svg-freshness.js', '../src/core/sync-state.js', '../src/core/swap-queue.js']
  .forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
require('../src/core/svg-freshness.js');
require('../src/core/sync-state.js');
require('../src/core/swap-queue.js');

var SQ = window.MA.swapQueue;

function ent(name, at, hash) {
  return { name: name, mtime: at, hash: hash, svgMtime: at, svgSource: hash };
}

// 本体 3 枚。下書きは 3 つの形を揃える:
//   usecase … 下書きが新しい (直した内容が本体に入っていない) = 反映待ち
//   spi     … 中身が同じ                                       = 削除予定
//   can     … 本体の方が新しい (下書きが取り残された)           = 削除予定
var ENTRIES = [
  ent('plantuml-usecase', '2026-09-14T10:00:00', 'h1'),
  ent('plantuml-usecase-編集中', '2026-09-14T12:00:00', 'h2'),
  ent('spi_state', '2026-09-14T10:00:00', 'h3'),
  ent('spi_state-編集中', '2026-09-14T09:00:00', 'h3'),
  ent('can_state', '2026-09-14T12:00:00', 'h4'),
  ent('can_state-編集中', '2026-09-14T10:00:00', 'h5'),
  ent('gpio_state', '2026-09-14T10:00:00', 'h6'),
];

describe('swapQueue.build — 下書きの台帳', function() {
  test('下書きのある図だけが載り、反映漏れの無い下書きも落ちない', function() {
    var q = SQ.build(ENTRIES, {});
    expect(q.counts.total).toBe(3);
    expect(q.rows.map(function(r) { return r.name; }))
      .toEqual(['plantuml-usecase', 'can_state', 'spi_state']);
    // 下書きを持たない図はキューに載らない (載せると台帳が一覧の写しになる)。
    expect(q.byName.gpio_state).toBe(undefined);
  });

  test('一手が下書きの前後から決まる', function() {
    var q = SQ.build(ENTRIES, {});
    expect(q.byName['plantuml-usecase'].action).toBe('apply');
    expect(q.byName.spi_state.action).toBe('drop');
    expect(q.byName.spi_state.reason).toBe('本体と中身が同じ');
    expect(q.byName.can_state.action).toBe('drop');
    expect(q.byName.can_state.reason).toBe('本体の方が新しい');
    expect(q.counts).toEqual({ total: 3, apply: 1, restore: 0, check: 0, drop: 2 });
  });

  test('本体が消えた下書きは「本体が無い」として別扱いになる', function() {
    var q = SQ.build([ent('orphan_seq-編集中', '2026-09-14T10:00:00', 'x')], {});
    expect(q.rows[0].action).toBe('restore');
    expect(q.rows[0].baseMissing).toBe(true);
    expect(q.counts.restore).toBe(1);
  });

  test('反映待ちは削除予定を含まない', function() {
    var pend = SQ.pending(SQ.build(ENTRIES, {}));
    expect(pend.map(function(r) { return r.name; })).toEqual(['plantuml-usecase']);
  });
});

describe('swapQueue.fileState — 手順1 の役割', function() {
  test('本体・差し替え待ち・削除予定を名前だけで返す', function() {
    var q = SQ.build(ENTRIES, {});
    expect(SQ.fileState(q, 'plantuml-usecase').state).toBe('本体');
    expect(SQ.fileState(q, 'plantuml-usecase-編集中').state).toBe('差し替え待ち');
    expect(SQ.fileState(q, 'spi_state-編集中').state).toBe('削除予定');
    // 拡張子を付けて渡しても同じ答え (一覧の名前と puml のパスを呼び分けない)。
    expect(SQ.fileState(q, 'spi_state-編集中.puml').state).toBe('削除予定');
  });

  test('下書きの無い図は本体と言い切る (無印にしない)', function() {
    var q = SQ.build(ENTRIES, {});
    expect(SQ.fileState(q, 'gpio_state').state).toBe('本体');
    expect(SQ.fileState(q, 'gpio_state').title).toContain('下書きがありません');
  });
});

describe('swapQueue.report — 手順7 の文面', function() {
  test('ファイル名と行き先と一手が 1 行に揃う', function() {
    var txt = SQ.reportText(SQ.build(ENTRIES, {}));
    expect(txt).toContain('下書き 3 枚（本体へ差し替え待ち 1 枚・削除予定 2 枚）');
    expect(txt).toContain('plantuml-usecase-編集中.puml → plantuml-usecase.puml … 本体へ差し替え待ち');
    expect(txt).toContain('spi_state-編集中.puml → spi_state.puml … 削除予定（本体と中身が同じ）');
  });

  test('下書きが 0 枚でも黙らない', function() {
    var q = SQ.build([ent('gpio_state', '2026-09-14T10:00:00', 'h6')], {});
    expect(SQ.summary(q)).toBe('編集中の下書きはありません');
    expect(SQ.report(q)).toEqual(['編集中の下書きはありません']);
  });
});
