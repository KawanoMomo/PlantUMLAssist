'use strict';
// BLK-primary-20260914-1206-wish: ⇄ 一括置換・🔖 指摘から選ぶの [適用] は保存フォルダへ
// 直接書くので、before-snapshot (その図をエディタで開いていたセッションの控え) では
// 開き直した後に前後を出せなかった。書き込み操作 1 回ぶんを前後の本文ごと控え、
// 後からいつでも「今日のこの回」を選んで並べられるようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/write-history.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/compare-view.js')]; } catch (e) {}
require('../src/core/write-history.js');
require('../src/core/compare-view.js');
var WH = global.window.MA.writeHistory;
var cv = global.window.MA.compareView;

function fakeStore(broken) {
  var data = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function(k, v) { if (broken) throw new Error('quota'); data[k] = v; },
    _data: data,
  };
}

var DIR = './autosave';
var BEFORE = '@startuml\nSpiDrv -> A : go\n@enduml';
var AFTER = '@startuml\nSpi_Driver -> A : go\n@enduml';
var AT = '2026-09-14T12:30:00.000Z';

function entry(at, files, meta) {
  return WH.makeEntry('rename', meta || { from: 'SpiDrv', to: 'Spi_Driver' }, files, at);
}

describe('writeHistory — 保存フォルダへ書いた回を前後ごと控える', () => {
  test('1 回の操作で当たった図の前後がまとめて 1 件になる', () => {
    var st = fakeStore();
    WH.record(st, DIR, entry(AT, [
      { name: 'spi_init_sequence', before: BEFORE, after: AFTER },
      { name: 'spi_state', before: BEFORE, after: AFTER },
    ]));
    var list = WH.list(st, DIR);
    expect(list.length).toBe(1);
    expect(list[0].files.length).toBe(2);
    expect(WH.pairOf(list[0], 'spi_state').before).toBe(BEFORE);
    expect(WH.pairOf(list[0], 'spi_state').after).toBe(AFTER);
    expect(WH.pairOf(list[0], 'いない図')).toBe(null);
  });

  test('前後が同じ図は落とす。1 枚も変わらなければ控え自体を作らない', () => {
    expect(entry(AT, [{ name: 'a', before: BEFORE, after: BEFORE }])).toBe(null);
    var e = entry(AT, [
      { name: 'a', before: BEFORE, after: BEFORE },
      { name: 'b', before: BEFORE, after: AFTER },
    ]);
    expect(e.files.length).toBe(1);
    expect(e.files[0].name).toBe('b');
  });

  test('同じ図が 2 度挙がっても 1 行にまとめる', () => {
    var e = entry(AT, [
      { name: 'a', before: BEFORE, after: AFTER },
      { name: 'a', before: BEFORE, after: AFTER },
    ]);
    expect(e.files.length).toBe(1);
  });

  test('名前の無い行は捨てる', () => {
    expect(entry(AT, [{ name: '', before: BEFORE, after: AFTER }])).toBe(null);
  });

  test('新しい順に並び、同じ id は置き換える (押し直しで 2 行に割れない)', () => {
    var st = fakeStore();
    var e1 = entry('2026-09-14T10:00:00.000Z', [{ name: 'a', before: BEFORE, after: AFTER }]);
    var e2 = entry('2026-09-14T12:00:00.000Z', [{ name: 'b', before: BEFORE, after: AFTER }]);
    WH.record(st, DIR, e1);
    WH.record(st, DIR, e2);
    WH.record(st, DIR, e1);
    var list = WH.list(st, DIR);
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(e1.id);
  });

  test('溜め込まない (MAX 件を超えたら古い回から落ちる)', () => {
    var st = fakeStore();
    for (var i = 0; i < WH.MAX + 5; i++) {
      WH.record(st, DIR, WH.makeEntry('rename', { from: 'X' + i, to: 'Y' + i },
        [{ name: 'a', before: BEFORE, after: AFTER + i }],
        '2026-09-14T12:' + (10 + i) + ':00.000Z'));
    }
    expect(WH.list(st, DIR).length).toBe(WH.MAX);
  });

  test('フォルダごとに別の記録になる (会議の一覧と混ざらない)', () => {
    var st = fakeStore();
    WH.record(st, DIR, entry(AT, [{ name: 'a', before: BEFORE, after: AFTER }]));
    expect(WH.list(st, './other').length).toBe(0);
    expect(WH.list(st, DIR).length).toBe(1);
  });

  test('その図が入っている回だけを引ける', () => {
    var st = fakeStore();
    WH.record(st, DIR, entry('2026-09-14T10:00:00.000Z',
      [{ name: 'spi_state', before: BEFORE, after: AFTER }]));
    WH.record(st, DIR, entry('2026-09-14T12:00:00.000Z',
      [{ name: 'can_state', before: BEFORE, after: AFTER }]));
    expect(WH.forDoc(st, DIR, 'spi_state').length).toBe(1);
    expect(WH.forDoc(st, DIR, '').length).toBe(0);
  });

  test('1 回だけ捨てられる / まとめて空にできる', () => {
    var st = fakeStore();
    var e1 = entry('2026-09-14T10:00:00.000Z', [{ name: 'a', before: BEFORE, after: AFTER }]);
    var e2 = entry('2026-09-14T12:00:00.000Z', [{ name: 'b', before: BEFORE, after: AFTER }]);
    WH.record(st, DIR, e1);
    WH.record(st, DIR, e2);
    WH.drop(st, DIR, e1.id);
    expect(WH.list(st, DIR).length).toBe(1);
    WH.clear(st, DIR);
    expect(WH.list(st, DIR).length).toBe(0);
  });

  test('localStorage が使えなくても落ちない (書き込み自体は通す)', () => {
    var st = fakeStore(true);
    expect(function() {
      WH.record(st, DIR, entry(AT, [{ name: 'a', before: BEFORE, after: AFTER }]));
    }).not.toThrow();
    expect(WH.list(st, DIR).length).toBe(0);
    expect(WH.list(null, DIR).length).toBe(0);
  });

  test('一覧の文言に「いつ・何を・何枚」が入る', () => {
    var e = entry(AT, [
      { name: 'a', before: BEFORE, after: AFTER },
      { name: 'b', before: BEFORE, after: AFTER },
    ]);
    var label = WH.label(e);
    expect(label).toContain('2026-09-14 12:30');
    expect(label).toContain('一括置換');
    expect(label).toContain('SpiDrv → Spi_Driver');
    expect(label).toContain('2 枚');
  });

  test('候補の文言は「その図の・その回の前」と読める', () => {
    var e = entry(AT, [{ name: 'spi_state', before: BEFORE, after: AFTER }]);
    var label = WH.optionLabel(e, 'spi_state');
    expect(label).toContain('spi_state');
    expect(label).toContain('の前');
  });

  test('操作の種類ごとに言い方が変わる (どの画面で当てた回か分かる)', () => {
    expect(WH.kindLabel('rename')).toContain('一括置換');
    expect(WH.kindLabel('note-rename')).toContain('指摘から選ぶ');
    expect(WH.kindLabel('note-verdict')).toContain('指摘から選ぶ');
    expect(WH.kindLabel('なにか')).toBe('書き込み');
  });
});

describe('compareView — 書き込み履歴の回を並べる相手として選べる', () => {
  var docs = [{ id: 'd1', name: 'spi_state', diagramType: 'plantuml-state', dsl: AFTER }];
  var hist = [{ id: 'h1', name: 'spi_state', dsl: BEFORE, label: 'spi_state (12:30 ⇄ 一括置換 の前)' }];

  test('タブが 1 枚でも、履歴の回が候補に出る', () => {
    var opts = cv.options(docs, 'd1', null, hist);
    expect(opts.length).toBe(1);
    expect(opts[0].id).toBe(cv.HIST_PREFIX + 'h1');
    expect(opts[0].isHistory).toBe(true);
    expect(opts[0].isBefore).toBe(true);
    expect(cv.canCompare(docs, 'd1', null, hist)).toBe(true);
  });

  test('本文の無い回は候補にしない (並べても何も見えない)', () => {
    expect(cv.options(docs, 'd1', null, [{ id: 'h2', name: 'spi_state', dsl: '' }]).length).toBe(0);
  });

  test('選んだ回の本文が、編集中の図の名前・図種のまま返る', () => {
    var ref = cv.doc(docs, cv.HIST_PREFIX + 'h1', 'd1', null, hist);
    expect(ref.dsl).toBe(BEFORE);
    expect(ref.diagramType).toBe('plantuml-state');
    expect(ref.isHistory).toBe(true);
    expect(cv.doc(docs, cv.HIST_PREFIX + 'none', 'd1', null, hist)).toBe(null);
  });

  test('見出しは「変更前」と言い切る (別の図と読み違えない)', () => {
    var ref = cv.doc(docs, cv.HIST_PREFIX + 'h1', 'd1', null, hist);
    expect(cv.headerLabel(ref)).toContain('変更前');
    expect(cv.headerLabel(ref)).toContain('一括置換');
  });

  test('選んでいた回はタブを行き来しても選ばれたまま', () => {
    var ref = cv.pick(docs, 'd1', cv.HIST_PREFIX + 'h1', null, hist);
    expect(ref.id).toBe(cv.HIST_PREFIX + 'h1');
  });

  test('履歴を渡さない従来の呼び方は今までどおり', () => {
    expect(cv.options(docs, 'd1', null).length).toBe(0);
    expect(cv.canCompare(docs, 'd1', null)).toBe(false);
  });
});
