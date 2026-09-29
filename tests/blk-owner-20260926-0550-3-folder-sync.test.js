'use strict';
// BLK-owner-20260926-0550-3: 自動保存・Ctrl+S で新しく書いた図が FILES ツリーの保存先に読み込み直すまで
// 出ず、外で消えた図の行も残った。書いた後・フォーカスが戻った時に「並べている顔ぶれ」と
// 「ディスクの顔ぶれ」を比べ、違えば一覧を読み直す。比べる値はここで作る。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;

describe('保存先の一覧の顔ぶれ (BLK-owner-20260926-0550-3)', function() {
  test('server の一覧の行 ({type} / {name}) と名前の文字列を同じ値にする', function() {
    var a = FT.nameSig([{ type: 'spi_state', mtime: 1 }, { type: 'adc_state', mtime: 2 }]);
    var b = FT.nameSig(['adc_state', { name: 'spi_state' }]);
    expect(a).toBe(b);
  });

  test('並びの順・重複では変わらない。増えた・消えたら変わる', function() {
    var base = FT.nameSig(['a', 'b', 'c']);
    expect(FT.nameSig(['c', 'a', 'b', 'a'])).toBe(base);
    expect(FT.nameSig(['a', 'b', 'c', 'diagram3'])).not.toBe(base);
    expect(FT.nameSig(['a', 'c'])).not.toBe(base);
  });

  test('空・未指定でも落ちない', function() {
    expect(FT.nameSig([])).toBe('');
    expect(FT.nameSig(null)).toBe('');
    expect(FT.nameSig([null, {}, ''])).toBe('');
  });

  test('書いた名前が並べている顔ぶれに入っているか (入っていれば読み直さない)', function() {
    var sig = FT.nameSig(['spi_state', 'adc_state']);
    expect(FT.sigHas(sig, 'spi_state')).toBe(true);
    expect(FT.sigHas(sig, 'diagram3')).toBe(false);
    // 名前の一部だけが一致しても入っていない扱い
    expect(FT.sigHas(sig, 'spi')).toBe(false);
    expect(FT.sigHas('', 'x')).toBe(false);
  });
});
