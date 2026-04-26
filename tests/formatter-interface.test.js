'use strict';
var FI = (typeof window !== 'undefined' && window.MA && window.MA.formatterInterface)
  || (global.window && global.window.MA && global.window.MA.formatterInterface);

describe('formatterInterface.assertFormatterContract', function() {
  test('passes for well-formed formatter', function() {
    var fn = function(props) { return 'Alice -> Bob'; };
    expect(function() { FI.assertFormatterContract(fn, 'fmtMessage'); }).not.toThrow();
  });

  test('throws for non-function', function() {
    expect(function() { FI.assertFormatterContract(42, 'fmtFoo'); }).toThrow();
    expect(function() { FI.assertFormatterContract(null, 'fmtFoo'); }).toThrow();
  });
});

describe('formatterInterface.validateOutput', function() {
  test('empty string means no-op insertion (allowed)', function() {
    expect(FI.validateOutput('', 'fmtMessage')).toBe(true);
  });

  test('non-empty string allowed', function() {
    expect(FI.validateOutput('Alice -> Bob', 'fmtMessage')).toBe(true);
  });

  test('rejects non-string output', function() {
    expect(FI.validateOutput(42, 'fmtMessage')).toBe(false);
    expect(FI.validateOutput(null, 'fmtMessage')).toBe(false);
    expect(FI.validateOutput({}, 'fmtMessage')).toBe(false);
  });

  test('rejects string containing newline (formatters emit single line)', function() {
    expect(FI.validateOutput('line1\nline2', 'fmtMessage')).toBe(false);
  });
});
