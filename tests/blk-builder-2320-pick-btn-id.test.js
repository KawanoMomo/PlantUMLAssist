'use strict';
// BLK-builder-20260907-2320-1: 挿入ピッカーのボタン id。
//
// design 5d で「その他」に par / break / critical … が並び、その kind は
// `block:par` のように `:` を含む。id にそのまま入れると CSS の id セレクタ
// (`#seq-pick-block-par`) で拾えないため、id 用に `-` へ均す。
// data-kind は元の値のまま残す (ハンドラ側が kind を復元できるように)。

var W = (typeof window !== 'undefined' && window) || global.window;
var seq = W.MA.modules.plantumlSequence;

describe('挿入ピッカーのボタン id', function() {
  test('単純な kind はそのまま', function() {
    expect(seq.pickBtnId('message')).toBe('seq-pick-message');
    expect(seq.pickBtnId('other')).toBe('seq-pick-other');
  });

  test('`:` を含む kind は `-` に均す', function() {
    expect(seq.pickBtnId('block:par')).toBe('seq-pick-block-par');
    expect(seq.pickBtnId('block:critical')).toBe('seq-pick-block-critical');
  });

  test('「その他」の全 kind が CSS の id セレクタで拾える形になる', function() {
    seq.otherInsertKinds().forEach(function(k) {
      expect(/^seq-pick-[A-Za-z0-9_-]+$/.test(seq.pickBtnId(k.value))).toBe(true);
    });
  });
});

describe('挿入先が決まらないときの説明', function() {
  test('行番号が数値でなければ空文字 (ピッカーはこの状態では開かない)', function() {
    expect(seq.insertTargetLine(NaN, 'after')).toBe(null);
    expect(seq.describeInsertTarget(undefined, 'after')).toBe('');
  });
});
