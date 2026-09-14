'use strict';
// BLK-junior-20260914-0906: 一覧から自分の図を開き直すだけの手順 1 で、
// 「開いたファイルを上書きしますか」が毎回出ていた (過去 run が残した -編集中 の控えが
// あるため錠が ask のまま、開いた直後の自動保存がその問いに当たっていた)。
// 開いたときから本文が変わっていなければ、元ファイルは既にその内容で、
// 守るものも書くものも無い。聞かずに何もしない (action: 'skip')。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
require('../src/core/source-lock.js');
var SL = global.window.MA.sourceLock;

var OPENED = ['@startuml', 'state Uninit', 'Uninit --> Ready : Gpio_Init', '@enduml'].join('\n');
var EDITED = OPENED.replace('Gpio_Init', 'Gpio_Init2');

describe('source-lock — 読むだけで開いた回は聞かない (BLK-junior-20260914-0906)', function() {
  beforeEach(function() { SL.clearAll(); });

  test('開いたときの本文のままなら、聞かずに書かない', function() {
    SL.mark('doc1', 'GPIOドライバ状態遷移', OPENED);
    var d = SL.decide('doc1', 'GPIOドライバ状態遷移', [], OPENED);
    expect(d.action).toBe('skip');
    expect(d.reason).toBe('unchanged');
    // 書き先は元ファイル (手で押した保存はここへ書いてよい)。
    expect(d.name).toBe('GPIOドライバ状態遷移');
  });

  test('改行の書き方が違うだけでは「変わった」に数えない', function() {
    SL.mark('doc1', 'gpio_state', OPENED);
    expect(SL.decide('doc1', 'gpio_state', [], OPENED.replace(/\n/g, '\r\n')).action).toBe('skip');
  });

  test('1 文字でも編集したら、今までどおり一度だけ聞く', function() {
    SL.mark('doc1', 'gpio_state', OPENED);
    expect(SL.decide('doc1', 'gpio_state', [], EDITED))
      .toEqual({ action: 'ask', origin: 'gpio_state' });
  });

  test('編集して聞かれたあとは、答えたとおりに書く (skip に戻らない)', function() {
    SL.mark('doc1', 'gpio_state', OPENED);
    SL.answer('doc1', 'keep', []);
    // 打ち消して開いたときの本文に戻しても、答えた書き先を守る。
    expect(SL.decide('doc1', 'gpio_state', [], OPENED))
      .toEqual({ action: 'write', name: 'gpio_state-編集中' });
  });

  test('開いたときの本文を憶えていない錠 (前の版の控え) は今までどおり聞く', function() {
    SL.mark('doc1', 'gpio_state');
    expect(SL.decide('doc1', 'gpio_state', [], OPENED).action).toBe('ask');
  });

  test('dsl を渡さない呼び出しの答えは変わらない', function() {
    SL.mark('doc1', 'gpio_state', OPENED);
    expect(SL.decide('doc1', 'gpio_state').action).toBe('ask');
  });

  test('同じ本文なら同じ指紋、違えば違う指紋', function() {
    expect(SL.fingerprint(OPENED)).toBe(SL.fingerprint(OPENED));
    expect(SL.fingerprint(OPENED)).not.toBe(SL.fingerprint(EDITED));
  });

  test('確認の文言は「なぜ今聞かれるか」と「古い控えは図に入らない」を言う', function() {
    var t = SL.askText('gpio_state');
    expect(t.body).toContain('開いたときから本文が変わったので');
    expect(t.body).toContain('古い控えの中身が図に入ることはありません');
    expect(t.keep).toContain('いまの本文は gpio_state-編集中 に書く');
  });

  test('上部バーの錠は「読むだけなら書かない」と言う', function() {
    SL.mark('doc1', 'gpio_state', OPENED);
    expect(SL.label('doc1', 'gpio_state').title).toContain('読むだけなら何も書きません');
  });
});
