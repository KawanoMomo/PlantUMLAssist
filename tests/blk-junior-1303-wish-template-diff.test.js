'use strict';
// BLK-junior-20260908-1303-wish: UART / CAN / GPIO の初期化図は同じ雛形を
// ペリフェラル名だけ変えて複製したもの。「雛形違い」という関係が GUI に無いので、
// 毎回まっさらな 2 枚として全文を読み比べていた。
//
// 見たいこと:
//   - 題材語 (UART / GPIO) だけが違う 2 枚は「雛形どおり」と言い切れる
//   - 派生図にだけある行は「この図だけ」、雛形にだけある行は「雛形だけ」に出る
//   - 行の並び替えは差分にしない
//   - 題材語は与えなくても推測でき、何を伏せたかを言う
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/template-diff.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const td = global.window.MA.templateDiff;

const TEMPLATE = [
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

// 題材語だけを差し替えた派生図 (構造は同じ)。
const UART_SAME = TEMPLATE.split('GPIO').join('UART');

describe('雛形との差分 (BLK-junior-20260908-1303-wish)', function() {

  test('題材語だけが違う 2 枚は「雛形どおり」と言い切る', function() {
    var diff = td.build(TEMPLATE, UART_SAME);
    expect(td.count(diff, 'added')).toBe(0);
    expect(td.count(diff, 'removed')).toBe(0);
    expect(td.summary(diff).indexOf('雛形どおり')).toBe(0);
  });

  test('題材語は与えなくても推測でき、何を伏せたかを言う', function() {
    var diff = td.build(TEMPLATE, UART_SAME);
    expect(diff.templateSubject).toBe('GPIO');
    expect(diff.derivedSubject).toBe('UART');
    expect(td.subjectNote(diff)).toContain('雛形 GPIO');
    expect(td.subjectNote(diff)).toContain('この図 UART');
  });

  test('派生図にだけある行は「この図だけ」に出る', function() {
    var derived = UART_SAME.replace(':UART割込みを有効化;',
      ':UART割込みを有効化;\n:UARTボーレートを設定;');
    var diff = td.build(TEMPLATE, derived);
    expect(td.count(diff, 'added')).toBe(1);
    expect(td.count(diff, 'removed')).toBe(0);
    var row = diff.rows.filter(function(r) { return r.kind === 'added'; })[0];
    expect(row.derived).toBe(':UARTボーレートを設定;');
  });

  test('雛形にだけある行は「雛形だけ」に出る', function() {
    var derived = UART_SAME.replace(':UART割込みを有効化;\n', '');
    var diff = td.build(TEMPLATE, derived);
    expect(td.count(diff, 'removed')).toBe(1);
    var row = diff.rows.filter(function(r) { return r.kind === 'removed'; })[0];
    expect(row.template).toBe(':GPIO割込みを有効化;');
  });

  test('差分の行が先に並ぶ (共通は後ろ)', function() {
    var derived = UART_SAME.replace(':完了;', ':完了;\n:UART統計を記録;');
    var diff = td.build(TEMPLATE, derived);
    expect(diff.rows[0].kind).not.toBe('same');
  });

  test('並び替えただけの図は差分にしない', function() {
    var derived = [
      '@startuml',
      'title UART初期化',
      'start',
      ':UART割込みを有効化;',
      ':UARTクロックを有効化;',
      ':UART_Configureを呼ぶ;',
      'if (成功?) then (yes)',
      ':完了;',
      'else (no)',
      ':エラー;',
      'endif',
      'stop',
      '@enduml',
    ].join('\n');
    var diff = td.build(TEMPLATE, derived);
    expect(td.count(diff, 'added')).toBe(0);
    expect(td.count(diff, 'removed')).toBe(0);
  });

  test('@startuml や skinparam は比べない (飾りは差分にしない)', function() {
    var derived = UART_SAME.replace('@startuml', '@startuml\nskinparam monochrome true');
    var diff = td.build(TEMPLATE, derived);
    expect(td.count(diff, 'added')).toBe(0);
  });

  test('題材語が見つからない図でもそのまま比べる', function() {
    var a = '@startuml\nstart\n:A;\nstop\n@enduml';
    var b = '@startuml\nstart\n:B;\nstop\n@enduml';
    var diff = td.build(a, b);
    expect(td.subjectNote(diff)).toContain('題材語は見つかりませんでした');
    expect(td.count(diff, 'added')).toBe(1);
    expect(td.count(diff, 'removed')).toBe(1);
  });

  test('同じ行が 2 度ある図は件数で数える', function() {
    var tmpl = '@startuml\nstart\n:GPIO設定;\n:GPIO設定;\nstop\n@enduml';
    var derived = '@startuml\nstart\n:UART設定;\nstop\n@enduml';
    var diff = td.build(tmpl, derived);
    expect(td.count(diff, 'same')).toBe(3);   // start / stop / 設定 1 回分
    expect(td.count(diff, 'removed')).toBe(1);
  });
});
