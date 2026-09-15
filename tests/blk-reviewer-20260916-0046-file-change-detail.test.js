'use strict';
// BLK-reviewer-20260916-0046: `audit.js --since-files <控え>` は内容が変わった図を
// 名指しするが、何行目のどのクラス・メッセージが消えたかは出さない。指摘に
// 「クラス定義が全消え」と書くには控えのフォルダと現物を diff コマンドで
// 手作業で突き合わせるしかなく、食い違う図が増えるほどその手 diff が増える。
// 控えの本文は --since-files で既に読んでいるので、消えた行まで同じ出力に添える。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/dsl-visible-diff.js', '../src/core/file-change-detail.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var FCD = global.window.MA.fileChangeDetail;

// 事故の実物: クラス定義がまるごと消え、title だけが残った。
var FULL = ['@startuml', 'title Driver_Common_Class', 'class Driver_Common {',
  '  + Init() : void', '  + DeInit() : void', '}', 'class Spi_Driver',
  'Driver_Common <|-- Spi_Driver', '@enduml'].join('\n');
var GUTTED = ['@startuml', 'title Driver_Common_Class', '@enduml'].join('\n');
var STATE = ['@startuml', '[*] --> Idle', '@enduml'].join('\n');
var STATE_COMMENT = ['@startuml', "' 控えから復元したときのコメント", '[*] --> Idle', '@enduml'].join('\n');

var PREV = [{ name: 'driver_common_class.puml', dsl: FULL },
            { name: 'spi_state.puml', dsl: STATE }];
var CUR = [{ name: 'driver_common_class.puml', dsl: GUTTED },
           { name: 'spi_state.puml', dsl: STATE_COMMENT }];

describe('file-change-detail: 変わった図の消えた行まで出す', function() {

  test('消えた行と増えた行を数え、消えた行を持って返す', function() {
    var rows = FCD.rows(['driver_common_class.puml'], PREV, CUR);
    expect(rows.length).toBe(1);
    expect(rows[0].comparable).toBe(true);
    expect(rows[0].removedCount).toBe(6);
    expect(rows[0].addedCount).toBe(0);
    expect(rows[0].removed).toContain('class Driver_Common {');
    expect(rows[0].removed).toContain('Driver_Common <|-- Spi_Driver');
  });

  test('変わった図の指定は名前でも {name} でも受ける', function() {
    var a = FCD.rows(['driver_common_class.puml'], PREV, CUR);
    var b = FCD.rows([{ name: 'driver_common_class.puml', kind: 'data' }], PREV, CUR);
    expect(b[0].removedCount).toBe(a[0].removedCount);
  });

  test('描かれる行に差が無ければ、コメント等の変化だと言い切る', function() {
    var rows = FCD.rows(['spi_state.puml'], PREV, CUR);
    expect(rows[0].visibleSame).toBe(true);
    expect(FCD.line(rows[0])).toContain('描かれる行に差なし');
  });

  test('片側に本文が無ければ 0 行と出さず「比較できない」と言う', function() {
    var rows = FCD.rows(['new_doc.puml'], PREV, CUR.concat([{ name: 'new_doc.puml', dsl: STATE }]));
    expect(rows[0].comparable).toBe(false);
    expect(rows[0].reason).toBe('控えに本文が無い');
    expect(FCD.line(rows[0])).toContain('比較できない');
  });

  test('1 行の要約に増減と代表行が載り、打ち切ったら残り行数を言う', function() {
    var line = FCD.line(FCD.rows(['driver_common_class.puml'], PREV, CUR)[0]);
    expect(line).toContain('−6 行 / +0 行');
    expect(line).toContain('消えた行: class Driver_Common {');
    expect(line).toContain('ほか 3 行');
  });

  test('代表行の数は呼ぶ側が伸ばせる', function() {
    var row = FCD.rows(['driver_common_class.puml'], PREV, CUR)[0];
    expect(FCD.line(row, 6)).not.toContain('ほか');
    expect(FCD.line(row, 1)).toContain('ほか 5 行');
  });

  test('増えた行も出す (書き足しの回でも中身が読める)', function() {
    var line = FCD.line(FCD.rows(['a.puml'],
      [{ name: 'a.puml', dsl: STATE }],
      [{ name: 'a.puml', dsl: ['@startuml', '[*] --> Idle', 'Idle --> Busy : go', '@enduml'].join('\n') }])[0]);
    expect(line).toContain('−0 行 / +1 行');
    expect(line).toContain('増えた行: Idle --> Busy : go');
  });

  test('消えた行の多い図を先に並べる (指摘に真っ先に書くのはそれ)', function() {
    var rows = FCD.sort(FCD.rows(['spi_state.puml', 'driver_common_class.puml'], PREV, CUR));
    expect(rows.map(function(r) { return r.name; }))
      .toEqual(['driver_common_class.puml', 'spi_state.puml']);
  });

  test('lines は行ごとの要約をまとめて返す', function() {
    var out = FCD.lines(FCD.rows(['driver_common_class.puml', 'spi_state.puml'], PREV, CUR));
    expect(out.length).toBe(2);
    expect(out[0]).toContain('driver_common_class.puml');
  });
});
