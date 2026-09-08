'use strict';
// BLK-junior-20260909-0003: 手順4「タイトルの末尾に (資料用) を付け足し、図をこの名前で
// 保存する」で、タイトル欄と図名欄を別々に書き換えていた。末尾を足した / 外しただけの
// 編集はもう片方にも同じことをする。ここでは「どこまでを連動と見なすか」を固定する。

const L = require('../src/core/name-title-link');

describe('name-title-link — 図名とタイトルの末尾の連動', function() {
  test('末尾を足した編集は付け足しとして読む', function() {
    expect(L.suffixEdit('GPIOドライバ状態遷移', 'GPIOドライバ状態遷移(資料用)'))
      .toEqual({ add: '(資料用)' });
  });

  test('末尾を外した編集は取り外しとして読む', function() {
    expect(L.suffixEdit('GPIO初期化 (レビュー反映)', 'GPIO初期化'))
      .toEqual({ remove: ' (レビュー反映)' });
  });

  test('名前ごと入れ替えたときは連動しない', function() {
    expect(L.suffixEdit('GPIO初期化', 'UART送信シーケンス')).toBe(null);
    // 先頭に足しただけのものも末尾の編集ではない
    expect(L.suffixEdit('GPIO初期化', '(資料用)GPIO初期化')).toBe(null);
  });

  test('空から書き始めたときは連動しない (図名を巻き込まない)', function() {
    expect(L.suffixEdit('', 'GPIOドライバ状態遷移')).toBe(null);
    expect(L.suffixEdit('GPIO初期化', '')).toBe(null);
    expect(L.suffixEdit('GPIO初期化', 'GPIO初期化')).toBe(null);
  });

  test('付け足しはもう片方の末尾に付く', function() {
    expect(L.applyEdit('GPIOドライバ状態遷移', { add: '(資料用)' }))
      .toBe('GPIOドライバ状態遷移(資料用)');
    // 土台が違っていても末尾だけ揃える
    expect(L.applyEdit('gpio-state', { add: '(資料用)' })).toBe('gpio-state(資料用)');
  });

  test('もう片方に既にその末尾があれば何もしない', function() {
    expect(L.applyEdit('GPIO状態遷移(資料用)', { add: '(資料用)' })).toBe(null);
  });

  test('取り外しは末尾が一致するときだけ', function() {
    expect(L.applyEdit('GPIO初期化 (レビュー反映)', { remove: ' (レビュー反映)' }))
      .toBe('GPIO初期化');
    expect(L.applyEdit('GPIO初期化 (資料用)', { remove: ' (レビュー反映)' })).toBe(null);
    // 外すと空になるものは外さない (名前の無いファイルを作らない)
    expect(L.applyEdit('(資料用)', { remove: '(資料用)' })).toBe(null);
  });

  test('もう片方が空なら付け足す先が無い', function() {
    expect(L.applyEdit('', { add: '(資料用)' })).toBe(null);
    expect(L.applyEdit(null, { add: '(資料用)' })).toBe(null);
  });

  test('何をしたかを言う文言を持つ', function() {
    const t = L.noticeText('図名 / File name', 'GPIO状態遷移', 'GPIO状態遷移(資料用)');
    expect(t).toContain('図名 / File name');
    expect(t).toContain('GPIO状態遷移(資料用)');
  });
});

// BLK-junior-20260909-0103: 新規タブでは図名が既定名 (diagram2_sequence-3 など) のままで、
// 末尾だけを移すと「diagram2_sequence-3(資料用)」になり本体が食い違った。
// 既定名の間はタイトルの全体を図名にする。
describe('name-title-link — 既定名のタブはタイトルごと引き継ぐ', function() {
  test('既定名を見分ける', function() {
    expect(L.isAutoName('diagram1')).toBe(true);
    expect(L.isAutoName('diagram2_sequence-3')).toBe(true);
    expect(L.isAutoName('diagram')).toBe(true);
    expect(L.isAutoName('GpioDrv派生クラス図')).toBe(false);
    expect(L.isAutoName('diagram_gpio状態')).toBe(false);
    expect(L.isAutoName('')).toBe(false);
  });

  test('既定名のタブはタイトルの全体が図名になる', function() {
    expect(L.titleSync('', 'GpioDrv派生クラス図(資料用)', 'diagram2_sequence-3'))
      .toEqual({ name: 'GpioDrv派生クラス図(資料用)', whole: true });
    // 本体を書いた後に末尾を足す入力でも、図名はタイトルの全体に揃う
    expect(L.titleSync('GpioDrv派生クラス図', 'GpioDrv派生クラス図(資料用)', 'diagram1'))
      .toEqual({ name: 'GpioDrv派生クラス図(資料用)', whole: true });
  });

  test('人が名前を付けた図では末尾だけを移す', function() {
    expect(L.titleSync('GPIO状態遷移', 'GPIO状態遷移(資料用)', 'gpio-state'))
      .toEqual({ name: 'gpio-state(資料用)', whole: false });
    // 名前ごと入れ替えたときは図名を巻き込まない
    expect(L.titleSync('GPIO状態遷移', 'UART送信', 'gpio-state')).toBe(null);
  });

  test('タイトルが空 / 同じなら何もしない', function() {
    expect(L.titleSync('', '', 'diagram1')).toBe(null);
    expect(L.titleSync('diagram1', 'diagram1', 'diagram1')).toBe(null);
  });
});
