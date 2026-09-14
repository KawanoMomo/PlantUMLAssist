'use strict';
// BLK-junior-20260909-0503-wish: 他フォルダで読むだけで見た先輩の図は、画面上の
// テキストのままで自分のタブへ引き継がれず、見た構成を覚えて新規タブに打ち直して
// いた (実測 360 字)。覗いた 1 枚をそのままテンプレート新規作成の材料にする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/peek-folder.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/template-new.js')]; } catch (e) {}
require('../src/core/peek-folder.js');
require('../src/core/template-new.js');
var pf = global.window.MA.peekFolder;
var tn = global.window.MA.templateNew;

var DIR = 'E:\\01_Loop\\persona-data\\primary';
var DSL = [
  '@startuml',
  'title Timer 初期化',
  'actor App',
  'participant TimerDrv',
  'participant TimerHal',
  'App -> TimerDrv : Timer_Init()',
  'TimerDrv -> TimerHal : Timer_HalInit()',
  'TimerHal --> TimerDrv : OK',
  'TimerDrv --> App : OK',
  '@enduml',
].join('\n');

describe('peekFolder.templateSeed', function() {
  test('覗いている図をテンプレートの材料にできる', function() {
    var seed = pf.templateSeed(DIR, 'timer_init_sequence.puml', DSL);
    expect(seed).not.toBe(null);
    expect(seed.folder).toBe('primary');
    expect(seed.name).toBe('timer_init_sequence.puml');
    expect(seed.dsl).toBe(DSL);
  });

  test('どのフォルダの図かが選択肢の表示で分かる', function() {
    var seed = pf.templateSeed(DIR, 'timer_init_sequence.puml', DSL);
    expect(seed.label).toContain('primary');
    expect(seed.label).toContain('timer_init_sequence.puml');
  });

  test('value はフォルダ込みで、保存フォルダの同名ファイルと衝突しない', function() {
    var a = pf.templateSeed(DIR, 'x.puml', DSL);
    var b = pf.templateSeed('E:\\01_Loop\\persona-data\\junior', 'x.puml', DSL);
    expect(a.value).not.toBe(b.value);
    expect(a.value.indexOf('file:')).toBe(-1);
  });

  test('まだ 1 枚も選んでいない / 中身が空なら材料にしない', function() {
    expect(pf.templateSeed(DIR, '', DSL)).toBe(null);
    expect(pf.templateSeed(DIR, 'x.puml', '')).toBe(null);
    expect(pf.templateSeed(DIR, 'x.puml', '   \n  ')).toBe(null);
  });

  test('seedNotice は選ぶ前と後で違うことを言う', function() {
    var seed = pf.templateSeed(DIR, 'x.puml', DSL);
    expect(pf.seedNotice(null)).toContain('選ぶ');
    expect(pf.seedNotice(seed)).toContain('primary');
  });
});

describe('覗いた図をそのまま置換できる', function() {
  test('部品名を替えれば打ち直しなしで同じ構成の図になる', function() {
    var seed = pf.templateSeed(DIR, 'timer_init_sequence.puml', DSL);
    var out = tn.instantiate(seed.dsl, 'Timer', 'Can');
    expect(out).toContain('participant CanDrv');
    expect(out).toContain('CanDrv -> CanHal : Can_HalInit()');
    expect(out).not.toContain('Timer');
    // 行数 (= 構成) は元のまま。写し違いが起きる余地がない
    expect(out.split('\n').length).toBe(DSL.split('\n').length);
  });

  test('置換元の候補が本文から出るので、覗いた図でも部品名を選ぶだけで済む', function() {
    var seed = pf.templateSeed(DIR, 'timer_init_sequence.puml', DSL);
    var names = tn.candidates(seed.dsl).map(function(c) { return c.name; });
    expect(names).toContain('Timer');
    expect(names).toContain('TimerDrv');
    expect(names.length).toBeGreaterThan(0);
  });
});

describe('peekFolder.seedHint', function() {
  var CANDS = [
    { name: 'App', count: 2 },
    { name: 'Timer', count: 2 },
    { name: 'TimerDrv', count: 1 },
  ];

  test('ファイル名に出てくる語を置換元にする (出現数で勝つ App を選ばない)', function() {
    expect(pf.seedHint('timer_init_sequence.puml', CANDS)).toBe('Timer');
  });

  test('大小の綴りが違っても当てる', function() {
    expect(pf.seedHint('TIMER_init.puml', CANDS)).toBe('Timer');
  });

  test('ファイル名に手がかりが無ければ出現数の 1 位に落とす', function() {
    expect(pf.seedHint('sequence1.puml', CANDS)).toBe('App');
  });

  test('候補が無ければ空文字 (置換元の欄を汚さない)', function() {
    expect(pf.seedHint('x.puml', [])).toBe('');
    expect(pf.seedHint('x.puml', null)).toBe('');
  });
});
