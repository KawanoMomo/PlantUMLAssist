'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/file-role.js')]; } catch (e) {}
require('../src/core/file-role.js');

var FR = window.MA.fileRole;

function e(name, hash) { return { name: name, hash: hash }; }

var TEMPLATES = {
  'plantuml-sequence': { role: 'template', baseline: 'aaa1' },
  'diagram1': { role: 'template', baseline: 'bbb2' },
  'plantuml-usecase': { role: 'template', baseline: 'ccc3' },
};

describe('fileRole.parse — 保存フォルダの宣言を読む', function() {
  test('roles を包んだ形でも生の辞書でも読める', function() {
    expect(FR.roleOf(FR.parse({ version: 1, roles: TEMPLATES }), 'diagram1')).toBe('template');
    expect(FR.roleOf(FR.parse(TEMPLATES), 'diagram1')).toBe('template');
  });
  test('宣言が無いファイルは unset（実データと混ぜない）', function() {
    expect(FR.roleOf(FR.parse(TEMPLATES), 'dma_transfer_sequence')).toBe('unset');
  });
  test('知らない役割の行は捨てる', function() {
    expect(FR.roleOf(FR.parse({ x: { role: 'whatever' } }), 'x')).toBe('unset');
  });
  test('壊れた JSON でも空の宣言として扱う', function() {
    expect(Object.keys(FR.parse(null)).length).toBe(0);
    expect(Object.keys(FR.parse('nonsense')).length).toBe(0);
  });
});

describe('fileRole.statusOf — テンプレの汚染', function() {
  test('宣言時と同じ指紋なら clean', function() {
    expect(FR.statusOf(e('diagram1', 'bbb2'), TEMPLATES.diagram1)).toBe('clean');
  });
  test('指紋が変わっていれば dirty（テンプレが書き換わった）', function() {
    expect(FR.statusOf(e('diagram1', 'zzz9'), TEMPLATES.diagram1)).toBe('dirty');
  });
  test('指紋が取れなければ unknown（分からないことを clean と言わない）', function() {
    expect(FR.statusOf(e('diagram1', null), TEMPLATES.diagram1)).toBe('unknown');
    expect(FR.statusOf(e('diagram1', 'bbb2'), { role: 'template', baseline: null })).toBe('unknown');
  });
  test('実データと未分類は中身が変わっても none', function() {
    expect(FR.statusOf(e('a', 'x'), { role: 'data', baseline: null })).toBe('none');
    expect(FR.statusOf(e('a', 'x'), null)).toBe('none');
  });
});

describe('fileRole.scan — 一覧ぶんの内訳', function() {
  var entries = [
    e('plantuml-sequence', 'CHANGED'),   // 汚染
    e('diagram1', 'bbb2'),               // きれい
    e('plantuml-usecase', 'OTHER'),      // 汚染
    e('dma_transfer_sequence', 'd1'),    // 未分類
    e('gpio_class', 'd2'),
  ];
  var roles = FR.setRole(TEMPLATES, e('gpio_class', 'd2'), 'data', '2026-09-08T02:30:00Z');
  var sc = FR.scan(entries, roles);

  test('汚染したテンプレだけを名指しする', function() {
    expect(sc.dirty.join(',')).toBe('plantuml-sequence,plantuml-usecase');
  });
  test('役割ごとの枚数を数える', function() {
    expect(sc.counts.template).toBe(3);
    expect(sc.counts.data).toBe(1);
    expect(sc.counts.unset).toBe(1);
    expect(sc.counts.dirty).toBe(2);
  });
  test('要約は汚染枚数を先に言う', function() {
    expect(FR.summary(sc).indexOf('テンプレ 2 枚の中身が変わっています')).toBe(0);
  });
  test('汚染が無ければ内訳だけを言う', function() {
    var clean = FR.scan([e('diagram1', 'bbb2')], TEMPLATES);
    expect(FR.summary(clean)).toBe('実データ 0 / テンプレ 1 / 未分類 0');
  });
  test('早見表は名前から役割と状態を引ける', function() {
    var m = FR.statusMap(sc);
    expect(m['plantuml-sequence'].status).toBe('dirty');
    expect(m['gpio_class'].role).toBe('data');
    expect(m['dma_transfer_sequence'].role).toBe('unset');
  });
});

describe('fileRole.badge — 一覧に出る印', function() {
  test('汚染したテンプレの印は他と違う（赤にできる）', function() {
    expect(FR.badge('template', 'dirty').cls).toBe('role-dirty');
    expect(FR.badge('template', 'dirty').mark).toBe('テ 汚染');
  });
  test('きれいなテンプレと実データは別の印', function() {
    expect(FR.badge('template', 'clean').cls).toBe('role-template');
    expect(FR.badge('data', 'none').cls).toBe('role-data');
  });
  test('未分類は印を持たない', function() {
    expect(FR.badge('unset', 'none').mark).toBe('');
  });
});

describe('fileRole.setRole / nextRole / accept', function() {
  test('押すたびに 未分類 → 実データ → テンプレ → 未分類', function() {
    expect(FR.nextRole('unset')).toBe('data');
    expect(FR.nextRole('data')).toBe('template');
    expect(FR.nextRole('template')).toBe('unset');
  });
  test('テンプレにした瞬間の指紋が baseline になる', function() {
    var m = FR.setRole({}, e('diagram1', 'bbb2'), 'template', '2026-09-08T02:30:00Z');
    expect(m.diagram1.baseline).toBe('bbb2');
    expect(FR.statusOf(e('diagram1', 'bbb2'), m.diagram1)).toBe('clean');
  });
  test('実データに戻すと baseline を持たない', function() {
    var m = FR.setRole(TEMPLATES, e('diagram1', 'zzz'), 'data', null);
    expect(m.diagram1.baseline).toBe(null);
  });
  test('未分類に戻すと宣言そのものが消える', function() {
    var m = FR.setRole(TEMPLATES, e('diagram1', 'zzz'), 'unset', null);
    expect(m.diagram1).toBe(undefined);
  });
  test('accept は今の中身を正として赤を消す', function() {
    var m = FR.accept(TEMPLATES, e('diagram1', 'zzz9'), null);
    expect(FR.statusOf(e('diagram1', 'zzz9'), m.diagram1)).toBe('clean');
  });
  test('accept はテンプレ以外を勝手にテンプレにしない', function() {
    var m = FR.accept(TEMPLATES, e('dma_transfer_sequence', 'q'), null);
    expect(FR.roleOf(m, 'dma_transfer_sequence')).toBe('unset');
  });
  test('元の宣言は書き換えない（呼び出し側が古い表を持ち続けない）', function() {
    FR.setRole(TEMPLATES, e('diagram1', 'zzz'), 'data', null);
    expect(TEMPLATES.diagram1.baseline).toBe('bbb2');
  });
});

describe('fileRole.keepExisting — 消えた図の宣言は残さない', function() {
  test('保存フォルダに無い名前の宣言は捨てる', function() {
    var m = FR.keepExisting(TEMPLATES, [e('diagram1', 'bbb2')]);
    expect(Object.keys(m).join(',')).toBe('diagram1');
  });
});

describe('fileRole.serialize — 保存する形', function() {
  test('version と roles を持つ', function() {
    var out = FR.serialize(TEMPLATES);
    expect(out.version).toBe(1);
    expect(out.roles.diagram1.role).toBe('template');
  });
});
