'use strict';
// BLK-reviewer-20260914-0906-wish: {name}.svg が別の図の絵になっていた事故で、
// 一覧はどちらも「内容ずれ」としか言えず、どちらの絵かは render API を 1 枚ずつ
// 叩いて plantuml-src 埋め込みをデコードして初めて分かった。印 (svgSource) は
// 「どの puml から書き出したか」そのものなので、同じフォルダの他の図の sha1 と
// 突き合わせれば相手を名指しできる。ここはその判定だけを見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/svg-cross.js')]; } catch (e) {}
require('../src/core/svg-cross.js');
var sx = global.window.MA.svgCross;

// 事故の形: A.svg には B の絵、B.svg には A の絵が入っている。
var SWAPPED = [
  { name: 'driver_common_class', hash: 'aaa', svgSource: 'bbb' },
  { name: 'plantuml-class', hash: 'bbb', svgSource: 'aaa' },
];

describe('svgCross.scan', () => {
  test('印が自分の puml と一致する図は何も言わない', () => {
    var s = sx.scan([{ name: 'spi_state', hash: 'aaa', svgSource: 'aaa' }]);
    expect(s.rows).toEqual([]);
    expect(s.crossed).toBe(0);
  });

  test('印の無い svg は扱わない (未刻印は svg-freshness の担当)', () => {
    var s = sx.scan([
      { name: 'a', hash: 'aaa', svgSource: '' },
      { name: 'b', hash: 'bbb', svgSource: null },
    ]);
    expect(s.rows).toEqual([]);
  });

  test('ずれていても相手がこのフォルダに居なければ名指ししない', () => {
    var s = sx.scan([{ name: 'a', hash: 'aaa', svgSource: 'zzz' }]);
    expect(s.rows).toEqual([]);
  });

  test('片道のクロスは、その svg がどの図の絵かを言う', () => {
    var s = sx.scan([
      { name: 'diagram1', hash: 'ccc', svgSource: 'ddd' },
      { name: 'plantuml-sequence', hash: 'ddd', svgSource: 'ddd' },
    ]);
    expect(s.rows.length).toBe(1);
    expect(s.rows[0].name).toBe('diagram1');
    expect(s.rows[0].of).toBe('plantuml-sequence');
    expect(s.rows[0].kind).toBe('cross');
    expect(s.pairs).toEqual([]);
  });

  test('互いの絵を持っている 2 枚は入れ替わりとして 1 組にまとめる', () => {
    var s = sx.scan(SWAPPED);
    expect(s.rows.map((r) => r.kind)).toEqual(['swapped', 'swapped']);
    expect(s.pairs).toEqual([['driver_common_class', 'plantuml-class']]);
    expect(s.crossed).toBe(2);
  });

  test('入れ替わりは片道のクロスより先に並べる (組で直すものだから)', () => {
    var s = sx.scan(SWAPPED.concat([
      { name: 'diagram1', hash: 'ccc', svgSource: 'aaa' },
    ]));
    expect(s.rows[s.rows.length - 1].name).toBe('diagram1');
    expect(s.rows[s.rows.length - 1].kind).toBe('cross');
  });

  test('同じ中身の図が複数あるときは、1 つを相手にして残りも控える', () => {
    var s = sx.scan([
      { name: 'a', hash: 'aaa', svgSource: 'bbb' },
      { name: 'b1', hash: 'bbb', svgSource: 'bbb' },
      { name: 'b2', hash: 'bbb', svgSource: 'bbb' },
    ]);
    expect(s.rows[0].of).toBe('b1');
    expect(s.rows[0].others).toEqual(['b2']);
  });
});

describe('svgCross.badge', () => {
  test('片道は「他図の絵」で、相手の名前を説明に持つ', () => {
    var s = sx.scan([
      { name: 'diagram1', hash: 'ccc', svgSource: 'ddd' },
      { name: 'plantuml-sequence', hash: 'ddd', svgSource: 'ddd' },
    ]);
    var b = sx.badge(s.rows[0]);
    expect(b.mark).toBe('他図の絵');
    expect(b.title).toContain('plantuml-sequence.puml の絵です');
  });

  test('入れ替わりは「絵が入れ替わり」で、両方を書き出し直すよう言う', () => {
    var b = sx.badge(sx.scan(SWAPPED).rows[0]);
    expect(b.mark).toBe('絵が入れ替わり');
    expect(b.title).toContain('両方を開いて SVG を書き出し直して');
  });
});

describe('svgCross.summaryLine / saveLine', () => {
  test('クロスが無ければ 1 行も出さない', () => {
    var s = sx.scan([{ name: 'a', hash: 'aaa', svgSource: 'aaa' }]);
    expect(sx.summaryLine(s)).toBe('');
    expect(sx.saveLine(s, 'a')).toBe('');
  });

  test('見出しは件数と、入れ替わりの組を名指しする', () => {
    var line = sx.summaryLine(sx.scan(SWAPPED));
    expect(line).toContain('SVG の出力先クロス: 2 枚');
    expect(line).toContain('driver_common_class ⇄ plantuml-class');
  });

  test('保存した図が巻き込まれていれば、その図のことを言う', () => {
    expect(sx.saveLine(sx.scan(SWAPPED), 'plantuml-class'))
      .toBe('⚠ この図の SVG は driver_common_class と入れ替わっています');
  });

  test('保存した図が無事でも、フォルダに残るクロスの件数は言う', () => {
    expect(sx.saveLine(sx.scan(SWAPPED), 'spi_state')).toBe('⚠ SVG の出力先クロス 2 枚（保存先の一覧で確認）');
  });

  test('控えが無い (一覧をまだ読んでいない) ときは黙る', () => {
    expect(sx.saveLine(null, 'a')).toBe('');
  });
});

// BLK-reviewer-20260914-0906: 印の無い svg は、PlantUML が畳んだ元の DSL から
// 持ち主を突き止めている (server が svgSourceFrom で言う)。何を見て名指ししたのかを
// 行の側にも書く — 印があったと読まれると、reviewer は確かめ直す手間に戻る。
describe('svgCross — 名指しの根拠', () => {
  var EMBEDDED = [
    { name: 'driver_common_class', hash: 'aaa', svgSource: 'bbb', svgSourceFrom: 'embedded' },
    { name: 'plantuml-class', hash: 'bbb', svgSource: 'bbb', svgSourceFrom: 'stamp' },
  ];

  test('印から分かった行は from=stamp のまま', () => {
    var row = sx.nameOf(sx.scan(SWAPPED), 'driver_common_class');
    expect(row.from).toBe('stamp');
    expect(sx.badge(row).title).not.toContain('畳まれている元の DSL');
  });

  test('畳まれた DSL から分かった行は、印が無かったことを印に書く', () => {
    var row = sx.nameOf(sx.scan(EMBEDDED), 'driver_common_class');
    expect(row.of).toBe('plantuml-class');
    expect(row.from).toBe('embedded');
    expect(sx.badge(row).title).toContain('この SVG に印は無く、畳まれている元の DSL から判定しました');
  });
});
