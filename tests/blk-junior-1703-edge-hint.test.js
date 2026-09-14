'use strict';
// BLK-junior-20260908-1703: GpioDrv から出る 4 本 (実線 2・点線 2) は色も太さも
// 同じで、点線どうしの見分けが付かなかった。1 本クリックしては右パネルの
// From/To を読み、違えばもう 1 本、という当て物になる。乗せた時点で相手が
// 読めれば当て物は消える。ここでは出す文言と、rect に持たせる属性を固定する。

const EH = require('../src/core/edge-hint');

describe('edge-hint — 矢印に乗せたときの「From → To」', function() {
  test('書かれた矢印記号のまま、相手と種類と行番号を 1 行で出す', function() {
    expect(EH.hintText({ from: 'GpioDrv', to: 'IrqCtrl', arrow: '..>', kind: 'dependency', line: 12 }))
      .toBe('GpioDrv ..> IrqCtrl（依存 / L12）');
  });

  test('同じ部品から出る 2 本の点線が、相手の名前で区別できる', function() {
    const a = EH.hintText({ from: 'GpioDrv', to: 'IrqCtrl', arrow: '..>', kind: 'dependency', line: 12 });
    const b = EH.hintText({ from: 'GpioDrv', to: 'Power_Ctrl', arrow: '..>', kind: 'dependency', line: 13 });
    expect(a).not.toBe(b);
    expect(b).toContain('Power_Ctrl');
  });

  test('ラベル付きの関係は、ラベルまで出す', function() {
    expect(EH.hintText({ from: 'A', to: 'B', arrow: '-->', kind: 'association', label: 'uses', line: 3 }))
      .toBe('A --> B : uses（関連 / L3）');
  });

  test('arrow が無ければ種類から記号を補う (種類だけでも読める)', function() {
    expect(EH.arrowOf({ kind: 'dependency' })).toBe('..>');
    expect(EH.arrowOf({ kind: 'provides' })).toBe('-()');
    // 知らない種類でも空欄にはしない
    expect(EH.arrowOf({ kind: 'unknown-kind' })).toBe('--');
    expect(EH.hintText({ from: 'A', to: 'B', kind: 'dependency' })).toBe('A ..> B（依存）');
  });

  test('相手が分からない関係には吹き出しを出さない (空の枠を出さない)', function() {
    expect(EH.hintText({})).toBe('');
    expect(EH.hintText(null)).toBe('');
    expect(EH.hintAttrs({})).toEqual({});
  });

  test('rect に持たせるのは文言と From/To の 3 つ', function() {
    const a = EH.hintAttrs({ from: 'GpioDrv', to: 'IrqCtrl', arrow: '..>', kind: 'dependency', line: 12 });
    expect(a['data-from']).toBe('GpioDrv');
    expect(a['data-to']).toBe('IrqCtrl');
    expect(a['data-hint']).toBe('GpioDrv ..> IrqCtrl（依存 / L12）');
  });

  test('クラス図の種類も日本語で読める (同じ道具を他の図種でも使う)', function() {
    expect(EH.kindLabel('inheritance')).toBe('継承');
    expect(EH.kindLabel('composition')).toBe('合成');
    expect(EH.kindLabel('')).toBe('');
  });
});
