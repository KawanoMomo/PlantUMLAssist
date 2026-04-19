'use strict';
var tu = (typeof window !== 'undefined' && window.MA && window.MA.textUpdater)
  || (global.window && global.window.MA && global.window.MA.textUpdater);

describe('insertAtLine', function() {
  test('inserts a line at the given 1-based position', function() {
    var out = tu.insertAtLine('a\nb\nc', 2, 'X');
    expect(out).toBe('a\nX\nb\nc');
  });

  test('insert at line 1 puts the new line at the top', function() {
    var out = tu.insertAtLine('a\nb', 1, 'X');
    expect(out).toBe('X\na\nb');
  });

  test('insert past last line appends', function() {
    var out = tu.insertAtLine('a\nb', 99, 'X');
    expect(out).toBe('a\nb\nX');
  });

  test('inserts a multi-line block', function() {
    var out = tu.insertAtLine('a\nc', 2, 'b1\nb2');
    expect(out).toBe('a\nb1\nb2\nc');
  });

  test('insertAtLine clamps lineNum < 1 to head', function() {
    expect(tu.insertAtLine('a\nb', 0, 'X')).toBe('X\na\nb');
    expect(tu.insertAtLine('a\nb', -5, 'X')).toBe('X\na\nb');
  });

  test('insertAtLine on empty string treats it as a single empty line', function() {
    // 空文字列は split('\n') で [''] になる。lineNum=1 で clamped=1、insertBefore で先頭に挿入
    expect(tu.insertAtLine('', 1, 'X')).toBe('X\n');
  });
});

describe('insertAfterLine', function() {
  test('inserts after the given 1-based line', function() {
    var out = tu.insertAfterLine('a\nb\nc', 2, 'X');
    expect(out).toBe('a\nb\nX\nc');
  });

  test('insertAfterLine clamps negative lineNum to head (after offset+1)', function() {
    // lineNum=0 → insertAtLine(text, 1, ...) → 先頭挿入
    expect(tu.insertAfterLine('a\nb', 0, 'X')).toBe('X\na\nb');
  });

  test('insertAfterLine past last line appends', function() {
    expect(tu.insertAfterLine('a\nb', 99, 'X')).toBe('a\nb\nX');
  });
});
