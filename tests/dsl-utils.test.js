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

  test('[AC-3] uncomments only when every touched line is a comment', function() {
    var all = "'a\n'b";
    expect(dslUtils.toggleLineComment(all, 0, all.length).value).toBe('a\nb');
    var mixed = "'a\nb";
    expect(dslUtils.toggleLineComment(mixed, 0, mixed.length).value).toBe("''a\n'b");
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
});
