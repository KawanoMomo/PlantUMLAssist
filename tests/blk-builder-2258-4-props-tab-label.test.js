'use strict';
// BLK-builder-20260907-2258-4 (design 2b): 右ペイン 1 枚目のタブを中身で呼ぶ。

const PTL = () => window.MA.propsTabLabel;

describe('props-tab-label — タブの名前は選択数で決まる', () => {

  test('何も選んでいなければ「追加」', () => {
    expect(PTL().labelFor(0)).toBe('追加');
    expect(PTL().titleFor(0)).toContain('図に要素を足す');
  });

  test('1 つ選んでいれば「選択中」', () => {
    expect(PTL().labelFor(1)).toBe('選択中');
    expect(PTL().titleFor(1)).toBe('選んでいる要素を直す');
  });

  test('2 つ以上なら数を出す (関係を追加できる合図)', () => {
    expect(PTL().labelFor(2)).toBe('選択中 2');
    expect(PTL().labelFor(3)).toBe('選択中 3');
    expect(PTL().titleFor(2)).toContain('関係を追加');
  });

  test('数でない値・負の数は無選択として扱う', () => {
    expect(PTL().labelFor(null)).toBe('追加');
    expect(PTL().labelFor(undefined)).toBe('追加');
    expect(PTL().labelFor('x')).toBe('追加');
    expect(PTL().labelFor(-3)).toBe('追加');
  });

  test('英語の Properties は出さない (画面は日本語で揃える)', () => {
    [0, 1, 2, 5].forEach((n) => {
      expect(PTL().labelFor(n).indexOf('Properties')).toBe(-1);
    });
  });
});
