'use strict';
// BLK-junior-20260908-1403: 台本の手順 2 は「後で作った方にだけある要素を見つけて
// 取り込む」だが、UART 版と CAN 版の 2 枚比べでは「片方にだけある要素は無い」と
// しか出ず、取り込む対象がどこにあるのか / 本当にどこにも無いのかが分からない。
//
// 見たいこと:
//   - 3 枚以上を一度に並べ、行ごとにどの図にあるかが出る
//   - 1 枚にだけある行 (取り込み候補) を名指しできる
//   - 固有の行が 1 つも無いときは「N 枚とも同じ雛形の複製」と言い切る
//   - 題材語は 3 枚以上でも取り違えない (相手 1 枚ではなく残り全部と比べる)
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/template-diff.js',
  '../src/core/template-cohort.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const tc = global.window.MA.templateCohort;

const GPIO = [
  '@startuml',
  'title GPIO初期化',
  'start',
  ':GPIOクロックを有効化;',
  ':GPIO_Configureを呼ぶ;',
  ':GPIO割込みを有効化;',
  'if (成功?) then (yes)',
  ':完了;',
  'else (no)',
  ':エラー;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

const UART = GPIO.split('GPIO').join('UART');
const CAN = GPIO.split('GPIO').join('CAN');

function docs(list) { return list; }

describe('系統ぜんぶと比べる (BLK-junior-20260908-1403)', function() {

  test('題材語だけが違う 3 枚は「同じ雛形の複製」と言い切る', function() {
    var r = tc.build(docs([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: CAN },
    ]));
    expect(tc.count(r, 'only')).toBe(0);
    expect(tc.count(r, 'some')).toBe(0);
    expect(tc.count(r, 'all')).toBeGreaterThan(0);
    expect(tc.summary(r)).toContain('3 枚は同じ雛形の複製です');
  });

  test('1 枚にだけある行を名指しできる', function() {
    var can = CAN.replace(':CAN割込みを有効化;',
      ':CAN割込みを有効化;\n:CANビットレートを設定;');
    var r = tc.build(docs([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: can },
    ]));
    expect(tc.count(r, 'only')).toBe(1);
    var mine = tc.uniqueTo(r, 'can.puml');
    expect(mine.length).toBe(1);
    expect(mine[0].sample).toBe(':CANビットレートを設定;');
    expect(mine[0].owner).toBe('can.puml');
    expect(tc.uniqueTo(r, 'uart.puml').length).toBe(0);
  });

  test('2 枚だけにある行は「一部だけ」で、欠けている図を言う', function() {
    var uart = UART.replace(':完了;', ':完了;\n:UART統計を記録;');
    var can = CAN.replace(':完了;', ':完了;\n:CAN統計を記録;');
    var r = tc.build(docs([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: uart },
      { name: 'can.puml', dsl: can },
    ]));
    expect(tc.count(r, 'some')).toBe(1);
    var row = r.rows.filter(function(x) { return x.kind === 'some'; })[0];
    expect(row.missing).toEqual(['gpio.puml']);
    expect(tc.whereLabel(row, 3)).toContain('無: gpio.puml');
  });

  test('取り込む対象が無いことを判定として言う (台本の手順 2 の答え)', function() {
    var r = tc.build(docs([
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: CAN },
    ]));
    expect(tc.verdict(r, 'can.puml')).toContain('取り込む対象はありません');
    expect(tc.verdict(r, 'can.puml')).toContain('同じ雛形の複製');
  });

  test('自分に固有の行があれば取り込む対象として言う', function() {
    var can = CAN.replace(':CAN割込みを有効化;',
      ':CAN割込みを有効化;\n:CANビットレートを設定;');
    var r = tc.build(docs([
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: can },
    ]));
    expect(tc.verdict(r, 'can.puml')).toContain('1 件');
    expect(tc.verdict(r, 'can.puml')).toContain('取り込む対象');
  });

  test('固有の行が相手の側にあるときは「他の図の側にある」と言う', function() {
    var uart = UART.replace(':完了;', ':完了;\n:UART統計を記録;');
    var r = tc.build(docs([
      { name: 'uart.puml', dsl: uart },
      { name: 'can.puml', dsl: CAN },
    ]));
    expect(tc.verdict(r, 'can.puml')).toContain('他の図の側');
  });

  test('題材語は 3 枚でも取り違えない', function() {
    var subs = tc.subjects([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: CAN },
    ]);
    expect(subs).toEqual(['GPIO', 'UART', 'CAN']);
    var r = tc.build([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: CAN },
    ]);
    expect(tc.subjectNote(r)).toContain('can.puml: CAN');
  });

  test('固有の行が先に並ぶ (共通は後ろ)', function() {
    var can = CAN.replace(':完了;', ':完了;\n:CAN統計を記録;');
    var r = tc.build([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: can },
    ]);
    expect(r.rows[0].kind).toBe('only');
    expect(r.rows[r.rows.length - 1].kind).toBe('all');
  });

  test('並び替えただけの図は差分にしない', function() {
    var shuffled = [
      '@startuml',
      'title CAN初期化',
      'start',
      ':CAN割込みを有効化;',
      ':CANクロックを有効化;',
      ':CAN_Configureを呼ぶ;',
      'if (成功?) then (yes)',
      ':完了;',
      'else (no)',
      ':エラー;',
      'endif',
      'stop',
      '@enduml',
    ].join('\n');
    var r = tc.build([
      { name: 'gpio.puml', dsl: GPIO },
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: shuffled },
    ]);
    expect(tc.count(r, 'only')).toBe(0);
    expect(tc.count(r, 'some')).toBe(0);
  });

  test('飾りの行 (skinparam / title) は比べない', function() {
    var can = CAN.replace('@startuml', '@startuml\nskinparam monochrome true');
    var r = tc.build([
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: can },
    ]);
    expect(tc.count(r, 'only')).toBe(0);
  });

  test('1 枚しか渡さなければ比べられないと言う', function() {
    var r = tc.build([{ name: 'can.puml', dsl: CAN }]);
    expect(tc.isComparable(r)).toBe(false);
    expect(tc.summary(r)).toContain('1 枚しかありません');
    expect(tc.verdict(r, 'can.puml')).toBe('');
  });

  test('図が無ければ空で答える (落ちない)', function() {
    var r = tc.build([]);
    expect(r.rows).toEqual([]);
    expect(tc.summary(r)).toBe('並べる図がありません');
    expect(tc.summary(null)).toBe('並べる図がありません');
    expect(tc.count(null, 'only')).toBe(0);
    expect(tc.uniqueTo(null, 'x')).toEqual([]);
    expect(tc.whereLabel(null, 3)).toBe('');
  });

  test('名前が無い図にも番号を振って区別する', function() {
    var list = tc.normalizeDocs([{ dsl: UART }, { dsl: CAN }, null]);
    expect(list.length).toBe(2);
    expect(list[0].name).toBe('図 1');
    expect(list[1].name).toBe('図 2');
  });

  test('同じ行が 1 枚の中に 2 度出ても 1 回と数える', function() {
    var can = CAN.replace(':完了;', ':完了;\n:完了;');
    var r = tc.build([
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: can },
    ]);
    var row = r.rows.filter(function(x) { return x.sample === ':完了;'; })[0];
    expect(row.docs.length).toBe(2);
    expect(tc.count(r, 'only')).toBe(0);
  });

  test('全部にある行の所在は「N 枚すべて」と出す', function() {
    var r = tc.build([
      { name: 'uart.puml', dsl: UART },
      { name: 'can.puml', dsl: CAN },
    ]);
    var row = r.rows.filter(function(x) { return x.kind === 'all'; })[0];
    expect(tc.whereLabel(row, 2)).toBe('2 枚すべて');
    expect(tc.kindLabel('all')).toBe('共通');
    expect(tc.kindLabel('only')).toBe('1 枚だけ');
  });

});
