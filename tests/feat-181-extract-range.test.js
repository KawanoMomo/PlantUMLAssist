'use strict';
// FEAT-181: 選択範囲だけを切り出して単体でレンダリング可能な DSL を返す純関数 extractRange
// 検証層は E1 のみ (DOM / SVG / プレビュー描画を一切要さない)。
var tu = (typeof window !== 'undefined' && window.MA && window.MA.textUpdater)
  || (global.window && global.window.MA && global.window.MA.textUpdater);

var WRAPPED = [
  '@startuml',
  'A -> B: one',
  'B -> C: two',
  'C -> D: three',
  'D -> E: four',
  '@enduml',
].join('\n');

var BARE = ['A -> B: one', 'B -> C: two', 'C -> D: three'].join('\n');

describe('FEAT-181 extractRange', function() {
  test('[AC-1] window.MA.textUpdater.extractRange is a function', function() {
    expect(typeof tu.extractRange).toBe('function');
  });

  test('[AC-2] mid-range of a wrapped text is returned with @startuml/@enduml added', function() {
    expect(tu.extractRange(WRAPPED, 3, 4)).toBe('@startuml\nB -> C: two\nC -> D: three\n@enduml');
  });

  test('[AC-3] range containing @startuml does not duplicate it', function() {
    var out = tu.extractRange(WRAPPED, 1, 3);
    expect(out).toBe('@startuml\nA -> B: one\nB -> C: two\n@enduml');
    expect(out.split('@startuml').length - 1).toBe(1);
  });

  test('[AC-3] range containing @enduml does not duplicate it', function() {
    var out = tu.extractRange(WRAPPED, 5, 6);
    expect(out).toBe('@startuml\nD -> E: four\n@enduml');
    expect(out.split('@enduml').length - 1).toBe(1);
  });

  test('[AC-3] the full range yields the original text unchanged', function() {
    expect(tu.extractRange(WRAPPED, 1, 6)).toBe(WRAPPED);
  });

  test('[AC-4] a text without @startuml gets nothing added', function() {
    expect(tu.extractRange(BARE, 2, 3)).toBe('B -> C: two\nC -> D: three');
  });

  test('[AC-5] startLine greater than endLine returns an empty string', function() {
    expect(tu.extractRange(WRAPPED, 4, 2)).toBe('');
  });

  test('[AC-5] a range past the end returns only the lines that exist', function() {
    expect(tu.extractRange(BARE, 3, 99)).toBe('C -> D: three');
  });

  test('[AC-5] a range starting before line 1 does not throw and clamps to the head', function() {
    expect(tu.extractRange(BARE, -5, 1)).toBe('A -> B: one');
  });

  test('[AC-5] a range entirely past the end returns an empty string', function() {
    expect(tu.extractRange(BARE, 50, 99)).toBe('');
  });

  // (b) 回帰ガード: 既存 8 エントリが export に残っていること (AC-6)
  test('[AC-6] the 8 pre-existing exports are still present and callable', function() {
    var names = ['replaceLine', 'insertAfter', 'insertBefore', 'deleteLine',
      'swapLines', 'appendToFile', 'insertAtLine', 'insertAfterLine'];
    names.forEach(function(n) {
      expect(typeof tu[n]).toBe('function');
    });
  });
});
