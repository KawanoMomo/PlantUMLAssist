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
