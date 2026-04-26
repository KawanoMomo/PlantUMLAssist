'use strict';
var RP = (typeof window !== 'undefined' && window.MA && window.MA.regexParts)
  || (global.window && global.window.MA && global.window.MA.regexParts);

describe('regexParts.IDENTIFIER', function() {
  test('matches plain identifier', function() {
    expect(new RegExp('^' + RP.IDENTIFIER + '$').test('Alice')).toBe(true);
    expect(new RegExp('^' + RP.IDENTIFIER + '$').test('user_1')).toBe(true);
  });
  test('rejects identifier starting with digit', function() {
    expect(new RegExp('^' + RP.IDENTIFIER + '$').test('1abc')).toBe(false);
  });
});

describe('regexParts.QUOTED_NAME', function() {
  test('matches "Login Server"', function() {
    expect(new RegExp('^' + RP.QUOTED_NAME + '$').test('"Login Server"')).toBe(true);
  });
  test('rejects unbalanced quotes', function() {
    expect(new RegExp('^' + RP.QUOTED_NAME + '$').test('"hello')).toBe(false);
  });
});

describe('regexParts.isStartUml / isEndUml', function() {
  test('detects @startuml with or without leading space', function() {
    expect(RP.isStartUml('@startuml')).toBe(true);
    expect(RP.isStartUml('  @startuml')).toBe(true);
    expect(RP.isStartUml('@startuml Title')).toBe(true);
  });
  test('detects @enduml', function() {
    expect(RP.isEndUml('@enduml')).toBe(true);
    expect(RP.isEndUml('  @enduml')).toBe(true);
  });
  test('rejects non-directive', function() {
    expect(RP.isStartUml('startuml')).toBe(false);
    expect(RP.isEndUml('end')).toBe(false);
  });
});

describe('regexParts.IDENTIFIER_OR_QUOTED', function() {
  test('matches both forms', function() {
    expect(new RegExp('^' + RP.IDENTIFIER_OR_QUOTED + '$').test('Alice')).toBe(true);
    expect(new RegExp('^' + RP.IDENTIFIER_OR_QUOTED + '$').test('"Alice B"')).toBe(true);
  });
});
