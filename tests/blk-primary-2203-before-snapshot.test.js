'use strict';
// BLK-primary-20260908-2203-wish: レビュー会議で「置換前はこうで、今はこうです」を
// 1 画面に並べて見せる。一括置換を当てた瞬間の本文を控え、並べる相手の候補に
// 「(この図の変更前)」を足す。Ctrl+Z で戻して見せてまた進める往復を無くす。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/before-snapshot.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/compare-view.js')]; } catch (e) {}
require('../src/core/before-snapshot.js');
require('../src/core/compare-view.js');
var BS = global.window.MA.beforeSnapshot;
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

describe('beforeSnapshot — 置換前の本文を図ごとに控える', () => {
  test('置換で当たった図だけ控え、置換の前後の名前と時刻を持つ', () => {
    var st = fakeStore();
    BS.capture(st, DIR, [{ name: 'spi_init_sequence', dsl: BEFORE }],
      { from: 'SpiDrv', to: 'Spi_Driver' }, '2026-09-08T22:30:00.000Z');
    var s = BS.get(st, DIR, 'spi_init_sequence');
    expect(s.dsl).toBe(BEFORE);
    expect(s.from).toBe('SpiDrv');
    expect(s.to).toBe('Spi_Driver');
    expect(BS.get(st, DIR, 'diagram1')).toBe(null);
  });

  test('同じ図を続けて置換しても、最初の控えが残る', () => {
    // 会議で見せたいのは「今日の作業を始める前」であって「1 手前」ではない。
    // 1 手前は Ctrl+Z で足りるので、上書きすると元の姿が永久に失われる。
    var st = fakeStore();
    BS.capture(st, DIR, [{ name: 'a', dsl: BEFORE }], { from: 'SpiDrv', to: 'X' });
    BS.capture(st, DIR, [{ name: 'a', dsl: AFTER }], { from: 'X', to: 'Y' });
    expect(BS.get(st, DIR, 'a').dsl).toBe(BEFORE);
    expect(BS.get(st, DIR, 'a').from).toBe('SpiDrv');
  });

  test('控えは保存フォルダごとに分かれ、壊れた値でも空として読む', () => {
    var st = fakeStore();
    BS.capture(st, DIR, [{ name: 'a', dsl: BEFORE }], {});
    expect(BS.get(st, 'D:/other', 'a')).toBe(null);
    var broken = {
      _v: 'not json',
      getItem: function() { return this._v; },
      setItem: function(k, v) { this._v = v; },
    };
    expect(BS.load(broken, DIR)).toEqual({});
    expect(BS.get(null, DIR, 'a')).toBe(null);
  });

  test('localStorage が使えなくても投げない (置換自体は通す)', () => {
    expect(function() {
      BS.capture(fakeStore(true), DIR, [{ name: 'a', dsl: BEFORE }], {});
    }).not.toThrow();
  });

  test('捨てるとその図の控えだけが消える', () => {
    var st = fakeStore();
    BS.capture(st, DIR, [{ name: 'a', dsl: BEFORE }, { name: 'b', dsl: BEFORE }], {});
    BS.drop(st, DIR, 'a');
    expect(BS.get(st, DIR, 'a')).toBe(null);
    expect(BS.get(st, DIR, 'b')).not.toBe(null);
    BS.drop(st, DIR);
    expect(BS.get(st, DIR, 'b')).toBe(null);
  });

  test('見出しは「いつの・どの置換の前か」を言う', () => {
    var s = { at: '2026-09-08T22:30:00.000Z', from: 'SpiDrv', to: 'Spi_Driver', dsl: BEFORE };
    expect(BS.label(s)).toContain('(この図の変更前)');
    expect(BS.label(s)).toContain('SpiDrv → Spi_Driver');
    expect(BS.label(s)).toContain('2026-09-08 22:30');
    expect(BS.label(null)).toBe('');
  });

  test('isSame: 控えと今が同じなら「変更前」を出す意味が無い', () => {
    expect(BS.isSame({ dsl: BEFORE }, BEFORE)).toBe(true);
    expect(BS.isSame({ dsl: BEFORE }, AFTER)).toBe(false);
    expect(BS.isSame(null, BEFORE)).toBe(false);
  });
});

describe('compareView — 同じ図の変更前を並べる', () => {
  var DOCS = [
    { id: 'd1', name: 'spi_init_sequence', diagramType: 'plantuml-sequence', dsl: AFTER },
    { id: 'd2', name: 'diagram1', diagramType: 'plantuml-class', dsl: '@startuml\nclass B\n@enduml' },
  ];
  var SNAP = { name: 'spi_init_sequence', dsl: BEFORE, at: '2026-09-08T22:30:00.000Z',
    from: 'SpiDrv', to: 'Spi_Driver' };

  test('控えがあると、編集中の図自身が先頭の候補に出る', () => {
    var o = cv.options(DOCS, 'd1', SNAP);
    expect(o[0].id).toBe(cv.BEFORE_ID);
    expect(o[0].isBefore).toBe(true);
    expect(o[0].name).toBe('spi_init_sequence (変更前)');
    // 別の図の候補は消えない (今までどおり別の図とも並べられる)
    expect(o.map(function(x) { return x.id; })).toEqual([cv.BEFORE_ID, 'd2']);
  });

  test('控えが無ければ今までどおり (編集中のタブは候補にしない)', () => {
    expect(cv.options(DOCS, 'd1').map(function(x) { return x.id; })).toEqual(['d2']);
    expect(cv.options(DOCS, 'd1', null).map(function(x) { return x.id; })).toEqual(['d2']);
  });

  test('控えが今の本文と同じなら候補に出さない', () => {
    var same = { name: 'spi_init_sequence', dsl: AFTER, at: '', from: '', to: '' };
    expect(cv.options(DOCS, 'd1', same).map(function(x) { return x.id; })).toEqual(['d2']);
  });

  test('doc は控えの本文を、編集中の図の図種のまま返す', () => {
    var d = cv.doc(DOCS, cv.BEFORE_ID, 'd1', SNAP);
    expect(d.dsl).toBe(BEFORE);
    expect(d.diagramType).toBe('plantuml-sequence');
    expect(d.isBefore).toBe(true);
    // 控えが無ければ引けない (前の選択が残っていても落ちない)
    expect(cv.doc(DOCS, cv.BEFORE_ID, 'd1', null)).toBe(null);
    expect(cv.doc(DOCS, cv.BEFORE_ID)).toBe(null);
  });

  test('タブが 1 枚でも、控えがあれば並べられる', () => {
    var one = [DOCS[0]];
    expect(cv.canCompare(one, 'd1')).toBe(false);
    expect(cv.canCompare(one, 'd1', SNAP)).toBe(true);
  });

  test('見出しは「参照」ではなく「変更前」と言い切る', () => {
    var d = cv.doc(DOCS, cv.BEFORE_ID, 'd1', SNAP);
    expect(cv.headerLabel(d)).toBe('変更前: spi_init_sequence (sequence)');
    expect(cv.headerLabel(DOCS[1])).toBe('参照: diagram1 (class)');
  });

  test('pick は控えを既定で選ぶが、別の図を選んでいればそれを保つ', () => {
    expect(cv.pick(DOCS, 'd1', null, SNAP).id).toBe(cv.BEFORE_ID);
    expect(cv.pick(DOCS, 'd1', 'd2', SNAP).id).toBe('d2');
    // 控えを捨てたあとに古い選択が残っていても、実在の候補へ落ちる
    expect(cv.pick(DOCS, 'd1', cv.BEFORE_ID, null).id).toBe('d2');
  });
});
