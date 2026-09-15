'use strict';
// BLK-reviewer-20260915-2346-wish: 前回保存版といまの中身の差を、保存する前に
// 常時 1 行で言う。reviewer が手で diff を打って見つけた内容消失 (77 行 → 4 行) を、
// 書いた本人が保存を押す前に画面で気付けるようにするための判定。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/save-diff.js', '../src/core/version-diff.js',
 '../src/core/version-fulldiff.js', '../src/core/save-swap.js',
 '../src/core/live-diff.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ld = global.window.MA.liveDiff;

// reviewer が見つけた事故の形。77 行の中身と、雛形に戻った 4 行。
function bigDoc() {
  var out = ['@startuml', 'title driver_common_class'];
  for (var i = 0; i < 25; i++) out.push('class C' + i + ' {\n  +Init()\n}');
  out.push('@enduml');
  return out.join('\n');
}
var TEMPLATE = ['@startuml', 'class Foo', 'note left: 雛形', '@enduml'].join('\n');

describe('liveDiff.verdict', () => {
  test('まだ一度も保存していない図は、比べる相手が無いので none', () => {
    expect(ld.verdict('', bigDoc(), false)).toBe('none');
    expect(ld.verdict('', bigDoc(), true)).toBe('none');
  });

  test('前回保存版と同じ中身は same (行末の空白だけの差は同じに数える)', () => {
    var doc = bigDoc();
    expect(ld.verdict(doc, doc, true)).toBe('same');
    // 行末の空白だけを足した整形差は「変更あり」に数えない。数えると、
    // エディタが勝手に付けた空白で ± の数字が動き、常時出ている行が信用されなくなる。
    var cosmetic = doc.split('\n').map(function(l) { return l + '  '; }).join('\n');
    expect(ld.verdict(doc, cosmetic, true)).toBe('same');
    expect(ld.shrink(doc, cosmetic)).toBe(null);
  });

  test('1 行直しただけなら changed', () => {
    var doc = bigDoc();
    expect(ld.verdict(doc, doc.replace('+Init()', '+Start()'), true)).toBe('changed');
  });

  test('雛形に戻ってしまった中身は shrink (保存前に言い当てる)', () => {
    expect(ld.verdict(bigDoc(), TEMPLATE, true)).toBe('shrink');
  });

  test('激減の閾値は save-swap と同じものを使う (保存前と保存後で判定が食い違わない)', () => {
    var doc = bigDoc();
    var sh = ld.shrink(doc, TEMPLATE);
    var viaSwap = global.window.MA.saveSwap.inspect({
      name: 'driver_common_class', dsl: TEMPLATE, prev: doc, folderDocs: [] }).shrink;
    expect(sh).toEqual(viaSwap);
  });
});

describe('liveDiff.counts', () => {
  test('増えた行と消える行を別々に数える', () => {
    var before = ['@startuml', 'a', 'b', 'c', '@enduml'].join('\n');
    var now = ['@startuml', 'a', 'x', '@enduml'].join('\n');
    var c = ld.counts(ld.rows(before, now));
    expect(c.removed).toBe(2);   // b c が消える
    expect(c.added).toBe(1);     // x が増える
  });
});

describe('liveDiff.chipText', () => {
  test('比べる相手が無いときは数字を出さない', () => {
    expect(ld.chipText('', 'x', false)).toBe('前回保存版 —');
  });

  test('同じなら短く言う', () => {
    var doc = bigDoc();
    expect(ld.chipText(doc, doc, true)).toBe('前回保存版 と同じ');
  });

  test('増減は ＋ と − の両方を出す', () => {
    var before = ['@startuml', 'a', 'b', '@enduml'].join('\n');
    var now = ['@startuml', 'a', 'x', 'y', '@enduml'].join('\n');
    expect(ld.chipText(before, now, true)).toBe('前回保存版 ＋2 −1');
  });

  test('激減のときだけ ⚠ が付く', () => {
    expect(ld.chipText(bigDoc(), TEMPLATE, true).indexOf('⚠')).toBe(0);
  });
});

describe('liveDiff.warnText', () => {
  test('何行から何行に減るかをファイル名込みで言う', () => {
    var t = ld.warnText('driver_common_class', bigDoc(), TEMPLATE);
    expect(t).toContain('driver_common_class');
    expect(t).toContain('行に減ります');
    expect(t).toContain('いま保存すると');
  });

  test('激減でなければ何も言わない (全行に警告が出ると警告でなくなる)', () => {
    var doc = bigDoc();
    expect(ld.warnText('x', doc, doc.replace('+Init()', '+Start()'))).toBe('');
    expect(ld.warnText('x', '', doc)).toBe('');
  });
});

describe('liveDiff.title', () => {
  test('並べている 2 つが何と何かを言う', () => {
    expect(ld.title('spi_state')).toBe('spi_state — 前回保存版 → いまの中身 (未保存)');
  });
});
