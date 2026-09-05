'use strict';
// FEAT-185 (resolves HFR-089): DSL の行番号を #editor のキャレット範囲 (文字オフセット) へ
// 変換する純関数 caretRangeForLine。
// 検証層は E1 のみ (DOM / SVG / プレビュー描画を一切要さない — FEAT-185 §6)。
var lr = (typeof window !== 'undefined' && window.MA && window.MA.lineResolver)
  || (global.window && global.window.MA && global.window.MA.lineResolver);

var LF = '@startuml\nA -> B\n@enduml';
var CRLF = '@startuml\r\nA -> B\r\n@enduml';

describe('FEAT-185 caretRangeForLine', function() {
  test('[AC-1] window.MA.lineResolver.caretRangeForLine is a function', function() {
    expect(typeof lr.caretRangeForLine).toBe('function');
  });

  test('[AC-2] line 1 of a 3-line LF text yields { start: 10, end: 16 }', function() {
    expect(lr.caretRangeForLine(LF, 1)).toEqual({ start: 10, end: 16 });
    expect(LF.substring(10, 16)).toBe('A -> B');
  });

  test('[AC-3] line 0 starts at offset 0 and ends at the first line length', function() {
    expect(lr.caretRangeForLine(LF, 0)).toEqual({ start: 0, end: 9 });
    expect(LF.substring(0, 9)).toBe('@startuml');
  });

  test('[AC-4] the last line (no trailing newline) ends at text.length', function() {
    var r = lr.caretRangeForLine(LF, 2);
    expect(r.end).toBe(LF.length);
    expect(LF.substring(r.start, r.end)).toBe('@enduml');
  });

  test('[AC-5] CRLF input: end excludes the carriage return', function() {
    var r = lr.caretRangeForLine(CRLF, 1);
    expect(CRLF.substring(r.start, r.end)).toBe('A -> B');
    expect(CRLF.substring(r.start, r.end)).not.toContain('\r');
  });

  test('[AC-6] out-of-range and malformed input all return null without throwing', function() {
    expect(lr.caretRangeForLine(LF, -1)).toBeNull();
    expect(lr.caretRangeForLine(LF, 3)).toBeNull();
    expect(lr.caretRangeForLine(null, 0)).toBeNull();
    expect(lr.caretRangeForLine(LF, 1.5)).toBeNull();
    expect(function() { lr.caretRangeForLine(LF, -1); }).not.toThrow();
    expect(function() { lr.caretRangeForLine(null, 0); }).not.toThrow();
  });

  // (b) 回帰ガード / 非退行テスト (E5 [R-1](b) として分類・事前 PASS を許す)
  test('[AC-7] the 3 pre-existing exports are still functions', function() {
    ['matchByDataSourceLine', 'matchByOrder', 'pickBestOffset'].forEach(function(n) {
      expect(typeof lr[n]).toBe('function');
    });
  });
});
