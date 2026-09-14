'use strict';
var dslUtils = (typeof window !== 'undefined' && window.MA && window.MA.dslUtils)
  || (global.window && global.window.MA && global.window.MA.dslUtils);

describe('dslUtils.unquote', function() {
  test('removes surrounding double quotes', function() {
    expect(dslUtils.unquote('"hello"')).toBe('hello');
  });
  test('returns string unchanged if not quoted', function() {
    expect(dslUtils.unquote('hello')).toBe('hello');
  });
  test('returns empty/null/undefined unchanged', function() {
    expect(dslUtils.unquote('')).toBe('');
    expect(dslUtils.unquote(null)).toBe(null);
    expect(dslUtils.unquote(undefined)).toBe(undefined);
  });
  test('does not remove single quote on only one side', function() {
    expect(dslUtils.unquote('"hello')).toBe('"hello');
    expect(dslUtils.unquote('hello"')).toBe('hello"');
  });
});

describe('dslUtils.quote', function() {
  test('wraps with double quotes', function() {
    expect(dslUtils.quote('hello world')).toBe('"hello world"');
  });
  test('does not double-wrap already-quoted string', function() {
    expect(dslUtils.quote('"hello"')).toBe('"hello"');
  });
});

describe('dslUtils.escapeForRegex', function() {
  test('escapes regex metacharacters', function() {
    expect(dslUtils.escapeForRegex('a.b*c+d')).toBe('a\\.b\\*c\\+d');
  });
  test('returns plain identifier unchanged', function() {
    expect(dslUtils.escapeForRegex('Alice')).toBe('Alice');
  });
});

describe('dslUtils.isPlantumlComment', function() {
  test("detects single-quote comment", function() {
    expect(dslUtils.isPlantumlComment("' this is comment")).toBe(true);
    expect(dslUtils.isPlantumlComment("  ' indented")).toBe(true);
  });
  test('rejects non-comment line', function() {
    expect(dslUtils.isPlantumlComment('actor Alice')).toBe(false);
    expect(dslUtils.isPlantumlComment('')).toBe(false);
  });
});

// FEAT-080 [AC-1] [AC-2] [AC-3]: Ctrl+/ の行コメント トグル (純関数層)。
// FEAT-080 の「テスト量と [I3] の +200 行上限」節の指定に従い、AC-1/2/3 は本単体層で判定する。
describe('dslUtils.toggleLineComment', function() {
  var TXT = '@startuml\nAlice -> Bob : hi\nBob -> Alice : ok\n@enduml';

  test('[AC-1] caret on a line comments that line out', function() {
    var caret = TXT.indexOf('Alice -> Bob') + 3;
    var r = dslUtils.toggleLineComment(TXT, caret, caret);
    expect(r.value).toBe("@startuml\n'Alice -> Bob : hi\nBob -> Alice : ok\n@enduml");
    expect(r.selectionStart).toBe(caret + 1);
    expect(r.selectionEnd).toBe(caret + 1);
  });

  test('[AC-2] pressing again on the same line restores the original text', function() {
    var caret = TXT.indexOf('Alice -> Bob') + 3;
    var once = dslUtils.toggleLineComment(TXT, caret, caret);
    var twice = dslUtils.toggleLineComment(once.value, once.selectionStart, once.selectionEnd);
    expect(twice.value).toBe(TXT);
    expect(twice.selectionStart).toBe(caret);
  });

  test('[AC-3] a selection spanning lines comments every line it touches', function() {
    var from = TXT.indexOf('Alice -> Bob');
    var to = TXT.indexOf('Bob -> Alice') + 3;
    var r = dslUtils.toggleLineComment(TXT, from, to);
    expect(r.value).toBe("@startuml\n'Alice -> Bob : hi\n'Bob -> Alice : ok\n@enduml");
    expect(r.selectionStart).toBe(TXT.indexOf('Alice -> Bob'));
  });

  // FEAT-132 (resolves UI-015): 混在選択で既コメント行に二重マーカーが付く欠陥の是正に伴い、
  // 本ケースの mixed の期待値を "''a\n'b" (欠陥の固定) から "'a\n'b" (行ごと判定) へ改める。
  // アサーションの緩和ではなく、UI-015 が Major と判定した誤挙動を期待値から取り除く強化である。
  test('[AC-3] uncomments only when every touched line is a comment', function() {
    var all = "'a\n'b";
    expect(dslUtils.toggleLineComment(all, 0, all.length).value).toBe('a\nb');
    var mixed = "'a\nb";
    expect(dslUtils.toggleLineComment(mixed, 0, mixed.length).value).toBe("'a\n'b");
  });

  test('[AC-3] preserves indentation when commenting and uncommenting', function() {
    var ind = '  Alice -> Bob : hi';
    var on = dslUtils.toggleLineComment(ind, 0, ind.length);
    expect(on.value).toBe("'  Alice -> Bob : hi");
    expect(dslUtils.toggleLineComment(on.value, 0, on.value.length).value).toBe(ind);
  });

  test('returns null for a non-string value', function() {
    expect(dslUtils.toggleLineComment(null, 0, 0)).toBe(null);
  });

  // FEAT-132 (resolves UI-015): コメント化側を「選択全体が全部コメントか」の 1 ビット判定から
  // 行ごとの判定へ変える。AC タグは LOOP-437 (i) に従い本ファイル内で一意な別名を用いる
  // (既存の [AC-1] [AC-2] [AC-3] は FEAT-080 のものであり重複させない)。
  // フィクスチャは UI-015「再現」節の逐語 "' foo\nbar" をそのまま用いる。
  var MIXED = "' foo\nbar";

  test('[FEAT-132 AC-1] mixed selection leaves an already-commented line untouched', function() {
    var r = dslUtils.toggleLineComment(MIXED, 0, MIXED.length);
    expect(r.value).toBe("' foo\n'bar");
    // UI-015「効果測定」の逐語要求: 既コメント行の ' の個数が変化しない (1 個のまま)。
    expect(r.value.split('\n')[0].split("'").length - 1).toBe(1);
    expect(r.value.split('\n')[1]).toBe("'bar");
  });

  test('[FEAT-132 AC-2] all-comment selection still strips one quote per line', function() {
    var allc = "'x\n'y";
    expect(dslUtils.toggleLineComment(allc, 0, allc.length).value).toBe('x\ny');
  });

  test('[FEAT-132 AC-3] all-plain selection still adds one quote per line', function() {
    var plain = 'x\ny';
    expect(dslUtils.toggleLineComment(plain, 0, plain.length).value).toBe("'x\n'y");
  });

  test('[FEAT-132 AC-4] toggling the mixed result again uncomments every line (asymmetric by design)', function() {
    var once = dslUtils.toggleLineComment(MIXED, 0, MIXED.length);
    var twice = dslUtils.toggleLineComment(once.value, once.selectionStart, once.selectionEnd);
    // 往路で 1 行目は変化しないため、復路は元の "' foo\nbar" には戻らない。
    // 1 行目の ' の直後の空白は元の本文の一部であり剥がれない (実測値)。
    expect(twice.value).toBe(' foo\nbar');
    expect(twice.value).not.toBe(MIXED);
  });

  test('[FEAT-132 AC-5] selection range of the mixed case stays inside the new value', function() {
    var r = dslUtils.toggleLineComment(MIXED, 0, MIXED.length);
    expect(r.selectionStart).toBe(0);
    expect(r.selectionEnd).toBe(r.value.length);
  });
});

// FEAT-187 (resolves UI-021): Ctrl+/ が @startuml / @enduml 境界行をコメント化して
// DSL を無警告で壊す欠陥の是正。境界行は素通し (コメント化も解除もしない)。
// 判定規約: 先頭空白を除去した後 @startuml / @enduml で始まる行を境界行とする。
// 大文字小文字は区別しない (src/core/dsl-updater.js:87 の /^\s*@startuml\b/i の先例に揃えた)。
describe('dslUtils.toggleLineComment @startuml/@enduml guard (FEAT-187)', function() {
  var DOC = '@startuml\nUser -> System : Request\n@enduml';
  var COMMENTED = "@startuml\n'User -> System : Request\n@enduml";

  test('[FEAT-187 AC-1] caret on the @startuml line is a no-op', function() {
    var r = dslUtils.toggleLineComment(DOC, 2, 2);
    expect(r.value).toBe(DOC);
    expect(r.selectionStart).toBe(2);
    expect(r.selectionEnd).toBe(2);
  });

  test('[FEAT-187 AC-1b] caret on the @enduml line is a no-op', function() {
    var caret = DOC.length - 2;
    var r = dslUtils.toggleLineComment(DOC, caret, caret);
    expect(r.value).toBe(DOC);
  });

  test('[FEAT-187 AC-2] select-all comments only the body line', function() {
    var r = dslUtils.toggleLineComment(DOC, 0, DOC.length);
    expect(r.value).toBe(COMMENTED);
    expect(r.value).not.toBe(DOC);
  });

  test('[FEAT-187 AC-3] toggling the AC-2 result again restores the input exactly', function() {
    var once = dslUtils.toggleLineComment(DOC, 0, DOC.length);
    expect(once.value).toBe(COMMENTED);
    var twice = dslUtils.toggleLineComment(once.value, once.selectionStart, once.selectionEnd);
    expect(twice.value).toBe(DOC);
  });

  test('[FEAT-187 AC-5] a boundary line with leading whitespace is still skipped', function() {
    var src = '  @startuml\nfoo\n  @enduml';
    var r = dslUtils.toggleLineComment(src, 0, src.length);
    expect(r.value).toBe("  @startuml\n'foo\n  @enduml");
  });

  test('[FEAT-187 AC-5b] case-insensitive boundary keywords are skipped', function() {
    var src = '@startUML\nfoo\n@endUML';
    var r = dslUtils.toggleLineComment(src, 0, src.length);
    expect(r.value).toBe("@startUML\n'foo\n@endUML");
  });

  test('[FEAT-187 AC-6] selecting only boundary lines leaves the range inside the value', function() {
    var r = dslUtils.toggleLineComment(DOC, 0, 9);
    expect(r.value).toBe(DOC);
    expect(r.selectionStart).toBe(0);
    expect(r.selectionEnd).toBe(9);
    expect(r.value.length).toBe(DOC.length);
  });
});
