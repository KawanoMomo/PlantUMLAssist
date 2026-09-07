'use strict';
// BLK-builder-20260907-1346-2 / design 5c「Sequence — 途中に挿入」。
//
// 仕様: 挿入メニューを開いている間、「DSL の何行目に入るかも同時に示す」。
// 画面では DSL の対象行に `← 8 行目に挿入` が出て、右パネルは
// 「いまは挿入位置を選んでいます。Esc で取り消し」になる。

var W = (typeof window !== 'undefined' && window) || global.window;
var IM = W.MA.insertMarker;

describe('挿入先の行番号', function() {
  test('before はその行、after は次の行', function() {
    expect(IM.targetLine(8, 'before')).toBe(8);
    expect(IM.targetLine(8, 'after')).toBe(9);
  });

  test('行番号が数でなければ null (印を出さない)', function() {
    expect(IM.targetLine(null, 'before')).toBe(null);
    expect(IM.targetLine('abc', 'after')).toBe(null);
  });

  test('文字列の行番号も受ける (data 属性から来る)', function() {
    expect(IM.targetLine('7', 'after')).toBe(8);
  });
});

describe('ラベルの文言', function() {
  test('design 5c と同じ `← N 行目に挿入`', function() {
    expect(IM.labelText(8)).toBe('← 8 行目に挿入');
  });

  test('挿入先が無ければ空文字', function() {
    expect(IM.labelText(null)).toBe('');
  });

  test('右パネルの案内は design 5c の文言', function() {
    expect(IM.HINT_TEXT).toBe('いまは挿入位置を選んでいます。Esc で取り消し');
  });
});

describe('印を置く位置', function() {
  test('1 行目はエディタの上余白の位置', function() {
    expect(IM.offsetTop(1, 0)).toBe(IM.PAD_TOP);
  });

  test('N 行目は行の高さ × (N-1) だけ下', function() {
    expect(IM.offsetTop(3, 0)).toBe(IM.PAD_TOP + 2 * IM.LINE_HEIGHT);
  });

  test('スクロールした分だけ上に戻る', function() {
    expect(IM.offsetTop(3, 20)).toBe(IM.PAD_TOP + 2 * IM.LINE_HEIGHT - 20);
  });
});

describe('見えているかどうか', function() {
  test('編集領域に収まっていれば見えている', function() {
    expect(IM.isRowVisible(2, 0, 400)).toBe(true);
  });

  test('上に流れて隠れた行は見えていない', function() {
    expect(IM.isRowVisible(1, 200, 400)).toBe(false);
  });

  test('下にはみ出た行は見えていない', function() {
    expect(IM.isRowVisible(100, 0, 400)).toBe(false);
  });

  test('挿入先が無ければ見えていない扱い', function() {
    expect(IM.isRowVisible(null, 0, 400)).toBe(false);
  });
});

describe('挿入先を見える位置へ持ってくる', function() {
  test('既に見えているならスクロールしない', function() {
    expect(IM.scrollTopFor(2, 0, 400)).toBe(0);
  });

  test('上に隠れているなら行の頭まで戻す', function() {
    expect(IM.scrollTopFor(1, 300, 400)).toBe(0);
  });

  test('下に隠れているなら領域の中ほどへ', function() {
    var t = IM.scrollTopFor(100, 0, 400);
    expect(t).toBeGreaterThan(0);
    expect(IM.isRowVisible(100, t, 400)).toBe(true);
  });

  test('負のスクロール位置は作らない', function() {
    expect(IM.scrollTopFor(1, 0, 400)).toBe(0);
  });
});

describe('行番号ガター', function() {
  var esc = W.MA.htmlUtils.escHtml;

  test('挿入先の行だけ目印の class が付く', function() {
    var html = IM.gutterHtml(3, 2, esc);
    expect(html).toBe('1\n<span class="ln-insert-target">2</span>\n3');
  });

  test('挿入先が無ければ素の番号列 (今までと同じ見た目)', function() {
    expect(IM.gutterHtml(3, null, esc)).toBe('1\n2\n3');
  });

  test('挿入先が行数を超えていても番号列は壊れない', function() {
    expect(IM.gutterHtml(2, 9, esc)).toBe('1\n2');
  });
});
