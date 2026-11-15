'use strict';
// TICKET-owner-20261115-1829-prune: 保存先の図を開いて直したときの「開いたファイルを上書きしますか」の窓・
// -編集中 の控え・まとめて当てるを外した。錠に残るのは「開いたときの本文のままなら書かない」だけ。
// 本文を変えたら聞かずに書く (write)。BLK-junior-20260914-0906 の「読むだけの回は書かない」は保つ。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
// 共有の window の localStorage は使えないことがあるので、このファイルの間だけ差し替える (末尾で戻す)。
var prevLS = Object.getOwnPropertyDescriptor(global.window, 'localStorage');
(function() {
  var store = {};
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
  } });
})();
try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
require('../src/core/source-lock.js');
var SL = global.window.MA.sourceLock;

var OPENED = ['@startuml', 'state Uninit', 'Uninit --> Ready : Gpio_Init', '@enduml'].join('\n');
var EDITED = OPENED.replace('Gpio_Init', 'Gpio_Init2');

describe('source-lock — 開いたままなら書かず、変えたら聞かずに書く', function() {
  beforeEach(function() { SL.clearAll(); });

  test('開いたときの本文のままなら書かない (skip)', function() {
    SL.mark('d1', 'gpio_state', OPENED);
    expect(SL.decide('d1', OPENED).action).toBe('skip');
    expect(SL.decide('d1', OPENED).action).toBe('skip');
  });

  test('改行の書き方が違うだけでは「変わった」に数えない', function() {
    SL.mark('d1', 'gpio_state', OPENED.replace(/\n/g, '\r\n'));
    expect(SL.decide('d1', OPENED).action).toBe('skip');
  });

  test('1 文字でも変えたら、聞かずに書く (ask も控えの名前も返さない)', function() {
    SL.mark('d1', 'gpio_state', OPENED);
    var d = SL.decide('d1', EDITED);
    expect(d).toEqual({ action: 'write' });
  });

  test('一度書いたら、本文を開いたときに戻しても書く (ファイルはもう変わっている)', function() {
    SL.mark('d1', 'gpio_state', OPENED);
    SL.decide('d1', EDITED);
    expect(SL.decide('d1', OPENED).action).toBe('write');
  });

  test('錠の無い図 (自分で作ったタブ) と、外した錠はいつも書く', function() {
    expect(SL.decide('free', OPENED).action).toBe('write');
    SL.mark('d2', 'x', OPENED);
    expect(SL.release('d2')).toBe(true);
    expect(SL.decide('d2', OPENED).action).toBe('write');
  });

  test('同じファイルで開き直しても錠を掛け直さない / 指紋は本文で決まる', function() {
    SL.mark('d1', 'gpio_state', OPENED);
    SL.mark('d1', 'gpio_state', EDITED);
    expect(SL.decide('d1', OPENED).action).toBe('skip');
    expect(SL.fingerprint(OPENED)).toBe(SL.fingerprint(OPENED));
    expect(SL.fingerprint(OPENED)).not.toBe(SL.fingerprint(EDITED));
  });

  test('窓・札・控えの道具は持たない', function() {
    ['answer', 'askText', 'answeredText', 'label', 'copyName', 'setDefault', 'defaultChoice', 'COPY_SUFFIX']
      .forEach(function(k) { expect(typeof SL[k]).toBe('undefined'); });
  });
});

if (prevLS) Object.defineProperty(global.window, 'localStorage', prevLS);
else { try { delete global.window.localStorage; } catch (e) {} }
