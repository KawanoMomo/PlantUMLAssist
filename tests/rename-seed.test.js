'use strict';
// BLK-primary-20260914-1106-friction (差し戻し): 開いた時点で前回の組を欄に入れる。
// 打ち直す 17 打を消し、利用者が選んだものは上書きしないことを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/rename-seed.js')]; } catch (e) {}
require('../src/core/rename-seed.js');
var RS = global.window.MA.renameSeed;

// renameRedo.pairs() の戻りの形 (新しい順)。
var DONE = { from: 'SpiDrv', to: 'Spi_Driver', state: 'done', remaining: 0 };
var PENDING = { from: 'AdcDrv', to: 'Adc_Driver', state: 'pending', remaining: 3 };

describe('renameSeed.pick', () => {
  test('旧称が残っている組を先に出す (今日直すのはその組だから)', () => {
    expect(RS.pick([DONE, PENDING])).toEqual(
      { from: 'AdcDrv', to: 'Adc_Driver', state: 'pending', remaining: 3 });
  });

  test('残りが無ければ直近に当てた組を出す (確かめ直す回)', () => {
    expect(RS.pick([DONE])).toEqual(
      { from: 'SpiDrv', to: 'Spi_Driver', state: 'done', remaining: 0 });
  });

  test('組を 1 つも知らなければ何も出さない (空欄を偽の答えで埋めない)', () => {
    expect(RS.pick([])).toBe(null);
    expect(RS.pick(null)).toBe(null);
  });

  test('逆向きの組は落とす (当てた結果が残っているだけで直す先が無い)', () => {
    var rows = [{ from: 'Spi_Driver', to: 'SpiDrv', state: 'pending', remaining: 9 }, DONE];
    // 新しい行 (Spi_Driver→SpiDrv) 自体は残り、その後ろの逆向きだけが落ちる。
    expect(RS.live(rows).length).toBe(1);
    expect(RS.pick(rows).from).toBe('Spi_Driver');
  });

  test('from / to が欠けた行は使わない', () => {
    expect(RS.pick([{ from: 'SpiDrv', to: '', state: 'pending' }])).toBe(null);
  });
});

describe('renameSeed.seed', () => {
  test('両欄が空のときだけ入れる', () => {
    expect(RS.seed([DONE], { from: '', to: '' })).not.toBe(null);
  });

  test('利用者が選んだ部品が入っていれば触らない (指示を上書きしない)', () => {
    expect(RS.seed([DONE], { from: 'CanDrv', to: '' })).toBe(null);
    expect(RS.seed([DONE], { from: '', to: 'Can_Driver' })).toBe(null);
  });
});

describe('入れた理由の 1 行', () => {
  test('残っている組は件数を言い、そのまま置換できると言う', () => {
    var t = RS.noteText(RS.pick([PENDING]));
    expect(t).toContain('AdcDrv → Adc_Driver');
    expect(t).toContain('残り 3 件');
    expect(RS.noteTone(RS.pick([PENDING]))).toBe('pending');
  });

  test('適用済みの組は「ヒット 0 件なら済んでいる」と読めるように言う', () => {
    var t = RS.noteText(RS.pick([DONE]));
    expect(t).toContain('前回はこれで当てました');
    expect(t).toContain('ヒット 0 件');
    expect(RS.noteTone(RS.pick([DONE]))).toBe('done');
  });

  test('組が無ければ何も言わない', () => {
    expect(RS.noteText(null)).toBe('');
    expect(RS.noteTone(null)).toBe('');
  });
});
