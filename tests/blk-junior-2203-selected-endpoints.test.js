'use strict';
// BLK-junior-20260907-2203: 選んだメッセージ行の当事者を「末尾に追加」の From/To の
// 初期値にする。選び直したのに前回値のままでプルダウンを 2 つ選び直す手間をなくす。
var fs = require('fs');
var path = require('path');
var win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/selected-endpoints.js'), 'utf-8'))(win);
var SE = win.MA.selectedEndpoints;

var PARTS = ['App', 'Gpio_Driver', 'Timer'];

beforeEach(function() { SE.clear(); });

describe('selectedEndpoints.remember / get', function() {
  test('選んだメッセージの当事者を憶える', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'App', label: 'InitDone' });
    expect(SE.get()).toEqual({ from: 'Gpio_Driver', to: 'App' });
  });
  test('選び直すと上書きされる', function() {
    SE.remember({ from: 'App', to: 'Timer' });
    SE.remember({ from: 'Gpio_Driver', to: 'App' });
    expect(SE.get().from).toBe('Gpio_Driver');
  });
  test('当事者が読めないものは憶えず、前の憶えも捨てる', function() {
    SE.remember({ from: 'App', to: 'Timer' });
    expect(SE.remember({})).toBe(null);
    expect(SE.get()).toBe(null);
  });
  test('片方が図の外でも、もう片方は憶える', function() {
    SE.remember({ from: '[', to: 'App' });
    expect(SE.get()).toEqual({ from: '[', to: 'App' });
  });
});

describe('selectedEndpoints.defaultsFor', function() {
  test('両方の参加者が図にいれば両方を初期値にする', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'App' });
    expect(SE.defaultsFor(PARTS)).toEqual({ from: 'Gpio_Driver', to: 'App', source: 'selection' });
  });
  test('憶えが無ければ初期値を決めない (先頭の参加者のまま)', function() {
    expect(SE.defaultsFor(PARTS)).toEqual({ from: null, to: null, source: 'none' });
  });
  test('参加者が消えていれば、その側は初期値にしない', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'Removed' });
    expect(SE.defaultsFor(PARTS)).toEqual({ from: 'Gpio_Driver', to: null, source: 'partial' });
  });
  test('図の外は選択肢に無いので初期値にしない', function() {
    SE.remember({ from: '[', to: 'App' });
    expect(SE.defaultsFor(PARTS)).toEqual({ from: null, to: 'App', source: 'partial' });
  });
  test('別の図に移って参加者が総入れ替えなら none に落ちる', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'App' });
    expect(SE.defaultsFor(['Adc', 'Dma']).source).toBe('none');
  });
  test('憶えを直接渡して判定できる', function() {
    expect(SE.defaultsFor(PARTS, { from: 'App', to: 'Timer' }).source).toBe('selection');
    expect(SE.defaultsFor(PARTS, null).source).toBe('none');
  });
});

describe('selectedEndpoints.noteText', function() {
  test('どの行から取った初期値かを名前で言う', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'App' });
    var t = SE.noteText(SE.defaultsFor(PARTS));
    expect(t).toBe('直前に選んだ Gpio_Driver → App を初期値にしています');
  });
  test('表示名があれば表示名で言う', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'App' });
    var t = SE.noteText(SE.defaultsFor(PARTS), function(id) {
      return id === 'Gpio_Driver' ? 'GPIO ドライバ' : id;
    });
    expect(t).toContain('GPIO ドライバ → App');
  });
  test('片方しか埋められなかったら、選び直しが要ることを言う', function() {
    SE.remember({ from: 'Gpio_Driver', to: 'Removed' });
    expect(SE.noteText(SE.defaultsFor(PARTS))).toContain('選び直してください');
  });
  test('憶えが無ければ何も言わない', function() {
    expect(SE.noteText(SE.defaultsFor(PARTS))).toBe('');
    expect(SE.noteText(null)).toBe('');
  });
});
