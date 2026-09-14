'use strict';
// BLK-primary-20260915-0606-wish: 混入点で名指しされた版と、その直前の版の全文差分。
// 混入点は「語が当たった行」しか出さないので、原因を直すのに要る前後の文脈が読めず、
// 版を開いて前版も開いて目で照合する 2 手が積み上がっていた。ここはその突き合わせ
// (並びを保った差分・畳み・語の行拾い) を見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/version-diff.js')]; } catch (e) {}
require('../src/core/version-diff.js');
try { delete require.cache[require.resolve('../src/core/version-fulldiff.js')]; } catch (e) {}
require('../src/core/version-fulldiff.js');
var vd = global.window.MA.versionFullDiff;

function kinds(rows) { return rows.map(function(r) { return r.kind; }).join(''); }
function texts(rows, kind) {
  return rows.filter(function(r) { return r.kind === kind; })
    .map(function(r) { return r.text; });
}

describe('versionFullDiff.split', () => {
  test('末尾の改行は行を増やさない', () => {
    expect(vd.split('a\nb\n')).toEqual(['a', 'b']);
    expect(vd.split('a\nb\n\n\n')).toEqual(['a', 'b']);
  });

  test('空の本文は 0 行', () => {
    expect(vd.split('')).toEqual([]);
    expect(vd.split(null)).toEqual([]);
  });

  test('CRLF でも行が割れない', () => {
    expect(vd.split('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('versionFullDiff.rows', () => {
  test('同じ本文なら全部 same', () => {
    var r = vd.rows('@startuml\nA -> B\n@enduml', '@startuml\nA -> B\n@enduml');
    expect(kinds(r)).toBe('samesamesame');
    expect(vd.counts(r)).toEqual({ added: 0, removed: 0, same: 3 });
  });

  test('行末の空白だけの違いは差分にしない', () => {
    var r = vd.rows('A -> B  \n', 'A -> B\n');
    expect(vd.counts(r).added).toBe(0);
    expect(vd.counts(r).removed).toBe(0);
  });

  test('真ん中に 1 行挿さったら add 1 行だけで、他の行はずれない', () => {
    var before = '@startuml\nA -> B\n@enduml';
    var after = '@startuml\nA -> B\nB -> C\n@enduml';
    var r = vd.rows(before, after);
    expect(vd.counts(r)).toEqual({ added: 1, removed: 0, same: 3 });
    expect(texts(r, 'add')).toEqual(['B -> C']);
  });

  test('置換は del と add の組で出る', () => {
    var r = vd.rows('participant SpiDrv\n', 'participant Spi_Driver\n');
    expect(texts(r, 'del')).toEqual(['participant SpiDrv']);
    expect(texts(r, 'add')).toEqual(['participant Spi_Driver']);
  });

  test('行番号は前の版と この版で別に振られる', () => {
    var r = vd.rows('a\nb', 'a\nx\nb');
    var add = r.filter(function(x) { return x.kind === 'add'; })[0];
    expect(add.a).toBe(0);
    expect(add.b).toBe(2);
    var last = r[r.length - 1];
    expect(last.kind).toBe('same');
    expect(last.a).toBe(2);
    expect(last.b).toBe(3);
  });

  test('最古の版 (前が無い) は全部 add', () => {
    var r = vd.rows('', 'a\nb');
    expect(kinds(r)).toBe('addadd');
  });

  test('本文が消えた版は全部 del', () => {
    var r = vd.rows('a\nb', '');
    expect(kinds(r)).toBe('deldel');
  });

  test('並びが答えなので、同じ行が離れた場所に移っても取り違えない', () => {
    var r = vd.rows('x\na\nb\nc', 'a\nb\nc\nx');
    expect(vd.counts(r).same).toBe(3);
    expect(vd.counts(r).added).toBe(1);
    expect(vd.counts(r).removed).toBe(1);
  });
});

describe('versionFullDiff.collapse', () => {
  function sameRows(n, from) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ kind: 'same', a: from + i, b: from + i, text: 'L' + (from + i) });
    return out;
  }

  test('変わらない行が続くところは gap 1 行に畳む', () => {
    var rows = sameRows(20, 1).concat([{ kind: 'add', a: 0, b: 21, text: 'new' }]);
    var out = vd.collapse(rows, 3);
    var gaps = out.filter(function(r) { return r.kind === 'gap'; });
    expect(gaps.length).toBe(1);
    expect(gaps[0].count).toBe(17);
    // 変更の直前 3 行は残る
    expect(out[out.length - 2].text).toBe('L20');
  });

  test('先頭の同じ行は前に変更が無いので丸ごと畳む', () => {
    var rows = sameRows(10, 1).concat([{ kind: 'add', a: 0, b: 11, text: 'new' }]);
    var out = vd.collapse(rows, 3);
    expect(out[0].kind).toBe('gap');
    expect(out[0].count).toBe(7);
  });

  test('短い並びは畳まない', () => {
    var rows = [{ kind: 'add', a: 0, b: 1, text: 'x' }]
      .concat(sameRows(3, 1))
      .concat([{ kind: 'del', a: 4, b: 0, text: 'y' }]);
    var out = vd.collapse(rows, 3);
    expect(out.filter(function(r) { return r.kind === 'gap'; }).length).toBe(0);
    expect(out.length).toBe(5);
  });

  test('畳んでも変更行は 1 行も落ちない', () => {
    var rows = sameRows(30, 1)
      .concat([{ kind: 'del', a: 31, b: 0, text: 'old' }])
      .concat(sameRows(30, 32))
      .concat([{ kind: 'add', a: 0, b: 62, text: 'new' }]);
    var out = vd.collapse(rows, 3);
    expect(vd.counts(out).added).toBe(1);
    expect(vd.counts(out).removed).toBe(1);
  });
});

describe('versionFullDiff.termRows', () => {
  test('探していた語が動いた行だけを拾う (同じ行は拾わない)', () => {
    var r = vd.rows('participant SpiDrv\nA -> SpiDrv\n', 'participant Spi_Driver\nA -> SpiDrv\n');
    var hits = vd.termRows(r, ['Spi_Driver']);
    expect(hits.length).toBe(1);
    expect(hits[0].kind).toBe('add');
  });

  test('語が無ければ空', () => {
    var r = vd.rows('a', 'b');
    expect(vd.termRows(r, [])).toEqual([]);
    expect(vd.termRows(r, ['zzz'])).toEqual([]);
  });
});

describe('versionFullDiff の見出し', () => {
  test('前の版があれば前 → この版', () => {
    expect(vd.title('spi_seq', '09/15 06:00', '09/14 18:00'))
      .toBe('spi_seq — 09/14 18:00 → 09/15 06:00');
  });

  test('前の版が無ければ最古だと言う', () => {
    expect(vd.title('spi_seq', '09/15 06:00', '')).toContain('最古の版');
  });

  test('要約は増減の行数', () => {
    var r = vd.rows('a\nb', 'a\nc\nd');
    expect(vd.summaryText(r)).toBe('+2 行 / −1 行 (変わらない行 1)');
  });

  test('同じ本文ならそう言う', () => {
    expect(vd.summaryText(vd.rows('a\nb', 'a\nb'))).toBe('前の版と同じ本文です');
  });

  test('gapText は畳んだ行数を言う', () => {
    expect(vd.gapText({ kind: 'gap', count: 12 })).toBe('… 同じ行 12 行');
  });
});
