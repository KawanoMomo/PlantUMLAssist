'use strict';
// BLK-junior-20260907-2009-wish: やり直しの練習で残す控え (*_TYPO_interim) が
// 保存フォルダに溜まり、📂 一覧で本物の成果物と同じ並びに混ざっていた。
// 名前ではなく利用者が付けた印で「一時控え」を判定し、一覧で畳めるようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/draft-mark.js')]; } catch (e) {}
require('../src/core/draft-mark.js');
var DM = global.window.MA.draftMark;

// localStorage の代わり。保存できない環境でも一覧が出ることを見るために、
// setItem が投げる版も用意する。
function fakeStore() {
  var data = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function(k, v) { data[k] = String(v); },
    _data: data,
  };
}

describe('draft-mark — 一時控えの印 (BLK-junior-2009-wish)', () => {
  test('印は保存フォルダごとに分かれる', () => {
    expect(DM.storageKey('./autosave')).not.toBe(DM.storageKey('./other'));
    // フォルダ未設定は既定のフォルダと同じ扱い (印が迷子にならない)
    expect(DM.storageKey('')).toBe(DM.storageKey('./autosave'));
    expect(DM.storageKey(null)).toBe(DM.storageKey('./autosave'));
  });

  test('toggle: 印は 1 クリックで付き、もう 1 回で外れる', () => {
    var m = DM.toggle([], 'GPIO_TYPO_interim');
    expect(DM.has(m, 'GPIO_TYPO_interim')).toBe(true);
    m = DM.toggle(m, 'GPIO_TYPO_interim');
    expect(DM.has(m, 'GPIO_TYPO_interim')).toBe(false);
    // 空の名前では印が増えない (名前の無いタブを押しても何も起きない)
    expect(DM.toggle(['a'], '')).toEqual(['a']);
  });

  test('normalize: 重複と空文字は落ち、並びは保たれる', () => {
    expect(DM.normalize(['b', 'a', 'b', '', null, 'c'])).toEqual(['b', 'a', 'c']);
  });

  test('split: 一覧を成果物と一時控えに分ける。どちらも一覧の並びのまま', () => {
    var entries = [
      { name: 'CANドライバユースケース' },
      { name: 'GPIO_TYPO_interim' },
      { name: 'UARTシーケンス' },
      { name: 'UART_TYPO_interim' },
    ];
    var sp = DM.split(entries, ['GPIO_TYPO_interim', 'UART_TYPO_interim']);
    expect(sp.items.map(function(e) { return e.name; }))
      .toEqual(['CANドライバユースケース', 'UARTシーケンス']);
    expect(sp.drafts.map(function(e) { return e.name; }))
      .toEqual(['GPIO_TYPO_interim', 'UART_TYPO_interim']);
  });

  test('split: 文字列だけの一覧でも同じように分かれる', () => {
    var sp = DM.split(['a', 'b', 'c'], ['b']);
    expect(sp.items).toEqual(['a', 'c']);
    expect(sp.drafts).toEqual(['b']);
  });

  test('split: 印が無ければ全部が成果物 (今までの一覧と同じ)', () => {
    var sp = DM.split(['a', 'b'], []);
    expect(sp.items).toEqual(['a', 'b']);
    expect(sp.drafts).toEqual([]);
  });

  test('keepExisting: 消えた控えの印は捨てる', () => {
    var kept = DM.keepExisting(['old_interim', 'GPIO_TYPO_interim'],
                               [{ name: 'GPIO_TYPO_interim' }, { name: '成果物' }]);
    expect(kept).toEqual(['GPIO_TYPO_interim']);
  });

  test('summary / toggleLabel: 畳んだ枚数を必ず言葉にする', () => {
    expect(DM.summary(12, true)).toBe('一時控え 12 件を畳んでいます');
    expect(DM.summary(12, false)).toBe('一時控え 12 件を出しています');
    expect(DM.summary(0, true)).toBe('一時控えはありません');
    expect(DM.toggleLabel(12, true)).toBe('一時控え 12 件を出す');
    expect(DM.toggleLabel(12, false)).toBe('一時控え 12 件を畳む');
  });

  test('行と上部バーの文言は、今の状態と押した後を取り違えない', () => {
    expect(DM.rowLabel(true)).toBe('控え');
    expect(DM.rowLabel(false)).toBe('控えにする');
    expect(DM.rowTitle(false)).toContain('印を付けて');
    expect(DM.rowTitle(true)).toContain('印を外して');
    expect(DM.activeLabel(true)).toBe('🗂 一時控え中');
    expect(DM.activeLabel(false)).toBe('🗂 一時控え');
    expect(DM.activeMessage('GPIO_TYPO_interim', true)).toContain('畳まれます');
    expect(DM.activeMessage('GPIO_TYPO_interim', false)).toContain('成果物として出ます');
  });

  test('load / save: 印は次に開いたときも残る', () => {
    var st = fakeStore();
    expect(DM.load(st, './autosave')).toEqual([]);
    expect(DM.save(st, './autosave', ['a', 'a', 'b'])).toBe(true);
    expect(DM.load(st, './autosave')).toEqual(['a', 'b']);
    // 別フォルダの印は混ざらない
    expect(DM.load(st, './other')).toEqual([]);
  });

  test('load: 壊れた控え・別の型でも一覧は出る (空として扱う)', () => {
    var st = fakeStore();
    st.setItem(DM.storageKey('./autosave'), '{ not json');
    expect(DM.load(st, './autosave')).toEqual([]);
    st.setItem(DM.storageKey('./autosave'), '{"a":1}');
    expect(DM.load(st, './autosave')).toEqual([]);
    expect(DM.load(null, './autosave')).toEqual([]);
    expect(DM.save(null, './autosave', ['a'])).toBe(false);
  });

  test('save: 置き場が書けなくても落ちない', () => {
    var st = { getItem: function() { return null; }, setItem: function() { throw new Error('full'); } };
    expect(DM.save(st, './autosave', ['a'])).toBe(false);
  });
});
