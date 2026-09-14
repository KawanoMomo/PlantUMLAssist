'use strict';
// BLK-junior-20260908-2003: 同じ名前に別の図を保存すると前の中身が消えるため、
// server が上書き直前に控えた版を一覧に出す。ここはその一覧を「いつの版か・
// 何の図だったか」に直す部分だけを見る (fetch と描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/version-history.js')]; } catch (e) {}
require('../src/core/version-history.js');
var vh = global.window.MA.versionHistory;

describe('versionHistory.stampToDate', () => {
  test('刻印は UTC として読む', () => {
    var d = vh.stampToDate('20260908-120513');
    expect(d.toISOString()).toBe('2026-09-08T12:05:13.000Z');
  });

  test('同じ秒の 2 本目 (.1) も読める', () => {
    var d = vh.stampToDate('20260908-120513.1');
    expect(d.toISOString()).toBe('2026-09-08T12:05:13.000Z');
  });

  test('読めない刻印は null', () => {
    expect(vh.stampToDate('')).toBe(null);
    expect(vh.stampToDate('kinou')).toBe(null);
    expect(vh.stampToDate(null)).toBe(null);
  });
});

describe('versionHistory.label', () => {
  test('MM/DD HH:MM で出す', () => {
    expect(/^\d{2}\/\d{2} \d{2}:\d{2}$/.test(vh.label('20260908-120513'))).toBe(true);
  });

  test('読めない刻印はそのまま出す (行を隠さない)', () => {
    expect(vh.label('kinou')).toBe('kinou');
  });
});

describe('versionHistory.kindOf', () => {
  test('状態遷移図を見分ける', () => {
    expect(vh.kindOf('state IDLE')).toBe('状態遷移');
    expect(vh.kindOf('[*] --> IDLE')).toBe('状態遷移');
  });

  test('シーケンス図を見分ける', () => {
    expect(vh.kindOf('participant Driver')).toBe('シーケンス');
    expect(vh.kindOf('actor User')).toBe('シーケンス');
  });

  test('クラス図・コンポーネント図を見分ける', () => {
    expect(vh.kindOf('class GpioDriver')).toBe('クラス');
    expect(vh.kindOf('component MCU')).toBe('コンポーネント');
    expect(vh.kindOf('[App] as app')).toBe('コンポーネント');
  });

  test('当てられない行は空 (嘘の図種を出さない)', () => {
    expect(vh.kindOf('')).toBe('');
    expect(vh.kindOf('skinparam monochrome true')).toBe('');
  });
});

describe('versionHistory.rows', () => {
  var payload = {
    name: 'diagram1',
    versions: [
      { stamp: '20260908-120513', lines: 12, head: 'state IDLE' },
      { stamp: '20260907-090000', lines: 8, head: 'participant Driver' },
    ],
  };

  test('server の並び (新しい順) を崩さない', () => {
    var r = vh.rows(payload);
    expect(r.map(x => x.stamp)).toEqual(['20260908-120513', '20260907-090000']);
  });

  test('各行に図種と行数が付く', () => {
    var r = vh.rows(payload);
    expect(r[0].kind).toBe('状態遷移');
    expect(r[0].lines).toBe(12);
    expect(r[1].kind).toBe('シーケンス');
  });

  test('版が無ければ空', () => {
    expect(vh.rows(null)).toEqual([]);
    expect(vh.rows({ versions: [] })).toEqual([]);
  });
});

describe('versionHistory.openName', () => {
  test('版を開いても今の図を上書きしない名前になる', () => {
    expect(vh.openName('diagram1', '20260908-120513')).toBe('diagram1@20260908-120513');
  });
});

describe('versionHistory.countLabel', () => {
  test('版があるときだけ文字を返す', () => {
    expect(vh.countLabel(3)).toBe('履歴 3');
    expect(vh.countLabel(0)).toBe('');
    expect(vh.countLabel(null)).toBe('');
  });
});

describe('versionHistory.goneRows', () => {
  test('本体が消えて版だけ残っている図を名前と版数で返す', () => {
    var r = vh.goneRows({ gone: [{ name: 'gpio_state', versions: 2 }] });
    expect(r).toEqual([{ name: 'gpio_state', versions: 2 }]);
  });

  test('名前の無い項目は捨てる', () => {
    expect(vh.goneRows({ gone: [{ versions: 2 }] })).toEqual([]);
    expect(vh.goneRows(null)).toEqual([]);
  });
});

// BLK-primary-20260913-0306-friction: 版は「別タブで開く」ことしかできず、壊れた図を
// 直すには開いた版を全文選択して打ち直すしかなかった (59 行・約 1000 字を 1 手順で
// 打ち直した run がある)。一覧の版に「戻す」を出すための文言をここに置く。
describe('versionHistory の「戻す」', () => {
  test('ボタンの文言は短く 1 語', () => {
    expect(vh.restoreLabel()).toBe('戻す');
  });

  test('説明は、どの図をいつの版に戻すかと、取り消せることを言う', () => {
    var t = vh.restoreTitle('driver_common_class', '20260913-031500');
    expect(t).toContain('driver_common_class を');
    expect(t).toContain(vh.label('20260913-031500'));
    expect(t).toContain('Ctrl+Z');
  });

  test('戻したあとの 1 行は、戻した先の版を名指しする', () => {
    expect(vh.restoredLine('diagram1', '20260913-031500'))
      .toBe('diagram1 を ' + vh.label('20260913-031500') + ' の版に戻しました（Ctrl+Z で取り消せます）');
  });

  test('同じ中身の版に押したときは、何も起きなかったように見せない', () => {
    expect(vh.unchangedLine('diagram1', '20260913-031500'))
      .toContain('既に');
  });
});
