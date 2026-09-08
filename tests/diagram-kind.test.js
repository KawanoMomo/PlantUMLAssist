'use strict';
// BLK-junior-20260908-2003 (差し戻し1回目)
// 「図の名前 = ファイル名」なので、名前を diagram1 のままで図種だけ変えて周を
// 重ねると、前の周に完走した図が次の周の保存で消えていた。server は図種の変わる
// 保存を `{名前}_{図種}` へ回すようになったので、ここでは
//  - その結果を画面の言葉にする部分 (どこへ回されたか)
//  - 一覧の「何の図種が何枚あるか」(0 枚も出す)
// を見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/diagram-kind.js')]; } catch (e) {}
require('../src/core/diagram-kind.js');
var DK = global.window.MA.diagramKind;

describe('diagramKind.label', () => {
  test('図種の slug を日本語にする', () => {
    expect(DK.label('state')).toBe('状態遷移');
    expect(DK.label('sequence')).toBe('シーケンス');
    expect(DK.label('class')).toBe('クラス');
  });
  test('分からない図種は空 (バッジを出さない)', () => {
    expect(DK.label('')).toBe('');
    expect(DK.label('mystery')).toBe('');
    expect(DK.label(null)).toBe('');
  });
});

describe('diagramKind.counts / summaryLine', () => {
  var entries = [
    { name: 'diagram1', kind: 'sequence' },
    { name: 'gpio_init_sequence', kind: 'sequence' },
    { name: 'plantuml-sequence', kind: 'sequence' },
    { name: 'notes', kind: '' },
  ];
  test('図種ごとに数える。判定できない図は数えない', () => {
    expect(DK.counts(entries)).toEqual({ sequence: 3 });
  });
  test('要約は 0 枚の図種も出す（無いと分かることが答えになる）', () => {
    var line = DK.summaryLine(entries);
    expect(line).toContain('シーケンス 3');
    expect(line).toContain('状態遷移 0');
    expect(line).toContain('クラス 0');
  });
  test('図が 1 枚も無い保存先でも行は出る', () => {
    expect(DK.summaryLine([])).toContain('状態遷移 0');
  });
});

describe('diagramKind.missing / namesOf', () => {
  var entries = [
    { name: 'a', kind: 'sequence' },
    { name: 'gpio_state', kind: 'state' },
    { name: 'b_state', kind: 'state' },
  ];
  test('その図種が 1 枚も無いかを言う', () => {
    expect(DK.missing(entries, 'state')).toBe(false);
    expect(DK.missing(entries, 'class')).toBe(true);
  });
  test('図種で図名を引ける（名前で探さなくてよい）', () => {
    expect(DK.namesOf(entries, 'state')).toEqual(['gpio_state', 'b_state']);
    expect(DK.namesOf(entries, 'class')).toEqual([]);
  });
});

describe('diagramKind.renameNotice', () => {
  test('回された先と、元の図が消えていないことを言う', () => {
    var n = DK.renameNotice({
      ok: true, savedAs: 'diagram1_state', renamedFrom: 'diagram1',
      kind: 'state', prevKind: 'sequence',
    });
    expect(n.from).toBe('diagram1');
    expect(n.to).toBe('diagram1_state');
    expect(n.text).toContain('diagram1_state');
    expect(n.text).toContain('シーケンス図');
    expect(n.text).toContain('状態遷移図');
    expect(n.text).toContain('消していません');
  });
  test('回されていない保存では何も言わない', () => {
    expect(DK.renameNotice({ ok: true, savedAs: 'diagram1', kind: 'state' })).toBe(null);
    expect(DK.renameNotice(null)).toBe(null);
    expect(DK.renameNotice({ savedAs: 'a', renamedFrom: 'a' })).toBe(null);
  });
});
