'use strict';
// BLK-junior-20260908-1303 — 同じ台本から起こした 2 枚 (UART 版 / CAN 版) の見比べ。
// 並びも構造も同じで、違うのはドメインの語だけ。名前が 1 つも一致しないため
// 「対応する要素が 1 つもない = 別の粒度」と診断されていたが、実際は逆で、
// 「後から作った方にだけある要素」は 1 つも無い。骨格が一致するならそう言い切る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
require('../src/core/dsl-utils.js');
require('../src/core/outline.js');
try { delete require.cache[require.resolve('../src/core/cross-ref-diff.js')]; } catch (e) {}
require('../src/core/cross-ref-diff.js');
var CRD = global.window.MA.crossRefDiff;

// 先に起こした UART 版
var UART = [
  '@startuml',
  'start',
  ':UARTクロック有効化;',
  ':ボーレート設定;',
  ':割り込み設定;',
  ':送受信有効化;',
  'if (初期化失敗?) then (異常)',
  'else (正常)',
  'endif',
  'stop',
  '@enduml',
].join('\n');

// 後で起こした CAN 版。語だけが違う
var CAN = [
  '@startuml',
  'start',
  ':CANクロック有効化;',
  ':ビットレート設定;',
  ':割り込み設定;',
  ':送受信有効化;',
  'if (初期化失敗?) then (異常)',
  'else (正常)',
  'endif',
  'stop',
  '@enduml',
].join('\n');

describe('骨格が同じで語だけ違う 2 枚 (BLK-junior-20260908-1303)', function() {
  test('要素単位では、語の違う 2 箇所が「相手だけ / 自分だけ」に落ちる', function() {
    // ここが起票の問題。並びは同じで語が違うだけなのに、要素単位の突き合わせは
    // 「後から作った方にだけある要素 2 件」を出してしまい、取り込む 1 個を選べない。
    var res = CRD.diff(UART, CAN, null);
    expect(res.onlyRef.length).toBe(2);
    expect(res.onlySelf.length).toBe(2);
    expect(res.common).toBe(2);
  });

  test('種別の並びが位置ごとに一致すれば「同じ骨格」と判定する', function() {
    var par = CRD.parallel(UART, CAN);
    expect(par.aligned).toBe(true);
    expect(par.count).toBe(4);      // 動作 4 件 (start/stop/if は骨組みとして数えない)
    expect(par.differing).toBe(2);  // クロック有効化 と ボーレート/ビットレート設定
    expect(par.same).toBe(2);
  });

  test('位置で対応させた語の組を返す', function() {
    var par = CRD.parallel(UART, CAN);
    expect(par.pairs[0].self.label).toBe('UARTクロック有効化');
    expect(par.pairs[0].ref.label).toBe('CANクロック有効化');
    expect(par.pairs[0].same).toBe(false);
    expect(par.pairs[2].same).toBe(true);   // 割り込み設定
    expect(par.pairs[0].label).toBe('動作');
  });

  test('見出しは「取り込む要素はない」まで言い切る', function() {
    var par = CRD.parallel(UART, CAN);
    expect(CRD.parallelSummary(par)).toContain('骨格は同じで、語だけが違います (4 箇所中 2 箇所)');
    expect(CRD.parallelSummary(par)).toContain('片方にだけある要素はありません');
  });

  test('語も全部同じなら、その旨を出す', function() {
    var par = CRD.parallel(UART, UART);
    expect(par.differing).toBe(0);
    expect(CRD.parallelSummary(par)).toBe('要素の並びも語も同じです (4 箇所)。取り込む要素はありません');
  });

  test('骨格が違えば aligned にしない (件数が違う / 種別の並びが違う)', function() {
    var SHORT = ['@startuml', 'start', ':A;', 'stop', '@enduml'].join('\n');
    expect(CRD.parallel(UART, SHORT).aligned).toBe(false);
    var CLS = ['@startuml', 'class A', 'class B', 'class C', 'class D', '@enduml'].join('\n');
    expect(CRD.parallel(UART, CLS).aligned).toBe(false);
    expect(CRD.parallel('', '').aligned).toBe(false);
  });

  test('対応表は申し送りに貼れる形で取り出せる', function() {
    var text = CRD.parallelText(CRD.parallel(UART, CAN), 'can_init', 'uart_init');
    expect(text).toContain('骨格は同じで語だけが違う 2 箇所 (can_init ↔ uart_init)');
    expect(text).toContain('- 動作: UARTクロック有効化 ↔ CANクロック有効化');
    expect(text).not.toContain('割り込み設定 ↔ 割り込み設定');   // 同じ語は並べない
  });
});

describe('言い換えと「1 行だけ直した」の見分け (BLK-junior-20260908-1303)', function() {
  var A = ['@startuml', 'start', ':A;', ':B;', ':C;', ':D;', 'stop', '@enduml'].join('\n');

  test('半分の語が入れ替わっていれば言い換えとして扱う', function() {
    var B = ['@startuml', 'start', ':A2;', ':B2;', ':C;', ':D;', 'stop', '@enduml'].join('\n');
    expect(CRD.isRephrase(CRD.parallel(A, B))).toBe(true);
  });

  test('1 箇所だけ違うのは「相手が後から直した 1 行」なので言い換えにしない', function() {
    var B = ['@startuml', 'start', ':A;', ':B;', ':C;', ':D2;', 'stop', '@enduml'].join('\n');
    var par = CRD.parallel(A, B);
    expect(par.aligned).toBe(true);
    expect(CRD.isRephrase(par)).toBe(false);
  });

  test('語が 1 つも共通しないなら言い換えにしない (別の粒度で描いた 2 枚)', function() {
    // BLK-junior-20260908-0823 の 2 枚は数が揃って並びも合うが、共有する語が無い。
    var B = ['@startuml', 'start', ':A2;', ':B2;', ':C2;', ':D2;', 'stop', '@enduml'].join('\n');
    var par = CRD.parallel(A, B);
    expect(par.aligned).toBe(true);
    expect(par.same).toBe(0);
    expect(CRD.isRephrase(par)).toBe(false);
  });

  test('全部同じ・骨格が違うときも言い換えにしない', function() {
    expect(CRD.isRephrase(CRD.parallel(A, A))).toBe(false);
    expect(CRD.isRephrase(CRD.parallel(A, '@startuml\nstart\n:A;\nstop\n@enduml'))).toBe(false);
    expect(CRD.isRephrase(null)).toBe(false);
  });
});
