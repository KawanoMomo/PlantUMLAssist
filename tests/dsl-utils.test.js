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
