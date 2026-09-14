'use strict';
// FEAT-180 (resolves HFR-041): applySkinparamPreset の単体テスト。
// 既存 tests/dsl-updater.test.js への末尾追記は他 FEAT との衝突要因になるため
// 新規ファイルとする(FEAT-180 §3-2)。
var DUR = (typeof window !== 'undefined' && window.MA && window.MA.dslUpdater)
  || (global.window && global.window.MA && global.window.MA.dslUpdater);

describe('dslUpdater.applySkinparamPreset', function() {
  test('[AC-1] inserts preset lines right after @startuml', function() {
    var t = '@startuml\nA -> B : x\n@enduml';
    expect(DUR.applySkinparamPreset(t, ['skinparam monochrome true']))
      .toBe('@startuml\nskinparam monochrome true\nA -> B : x\n@enduml');
  });

  test('[AC-2] replaces existing skinparam lines with the new preset', function() {
    var t = '@startuml\nskinparam backgroundColor #EEE\nA -> B : x\n@enduml';
    var out = DUR.applySkinparamPreset(t, ['skinparam monochrome true', 'skinparam shadowing false']);
    var skin = out.split('\n').filter(function(l) { return /^\s*skinparam/i.test(l); });
    expect(skin).toEqual(['skinparam monochrome true', 'skinparam shadowing false']);
    expect(out.indexOf('backgroundColor')).toBe(-1);
  });

  test('[AC-3] removes indented skinparam lines', function() {
    var t = '@startuml\n  skinparam shadowing false\nA -> B : x\n@enduml';
    expect(DUR.applySkinparamPreset(t, []))
      .toBe('@startuml\nA -> B : x\n@enduml');
  });

  test('[AC-4] removal is case-insensitive', function() {
    var t = '@startuml\nSkinParam monochrome true\nA -> B : x\n@enduml';
    expect(DUR.applySkinparamPreset(t, []))
      .toBe('@startuml\nA -> B : x\n@enduml');
  });

  test('[AC-5] empty / null / undefined presetLines removes only, inserts nothing', function() {
    var t = '@startuml\nskinparam monochrome true\nA -> B : x\n@enduml';
    var expected = '@startuml\nA -> B : x\n@enduml';
    expect(DUR.applySkinparamPreset(t, [])).toBe(expected);
    expect(DUR.applySkinparamPreset(t, null)).toBe(expected);
    expect(DUR.applySkinparamPreset(t, undefined)).toBe(expected);
  });

  test('[AC-6] blank / whitespace-only preset entries are not inserted', function() {
    var t = '@startuml\nA -> B : x\n@enduml';
    expect(DUR.applySkinparamPreset(t, ['', '   ', 'skinparam monochrome true']))
      .toBe('@startuml\nskinparam monochrome true\nA -> B : x\n@enduml');
  });

  test('[AC-7] without @startuml the preset lines go to the top', function() {
    expect(DUR.applySkinparamPreset('A -> B : x', ['skinparam monochrome true']))
      .toBe('skinparam monochrome true\nA -> B : x');
  });

  test('[AC-8] non-skinparam lines keep their order and content', function() {
    var t = '@startuml\nparticipant A\nnote over A : hi\nA -> B : x\n@enduml';
    var out = DUR.applySkinparamPreset(t, ['skinparam monochrome true']);
    var rest = out.split('\n').filter(function(l) { return !/^\s*skinparam/i.test(l); });
    expect(rest).toEqual(['@startuml', 'participant A', 'note over A : hi', 'A -> B : x', '@enduml']);
  });

  test('[AC-9] null text returns empty string without throwing', function() {
    expect(DUR.applySkinparamPreset(null, ['x'])).toBe('');
  });

  test('[AC-10] the presetLines argument array is not mutated', function() {
    var arg = ['skinparam monochrome true', '', 'skinparam shadowing false'];
    DUR.applySkinparamPreset('@startuml\n@enduml', arg);
    expect(arg).toEqual(['skinparam monochrome true', '', 'skinparam shadowing false']);
  });

  test('[AC-11] skinparamFoo is not removed (word boundary)', function() {
    var t = '@startuml\nskinparamFoo bar\nA -> B : x\n@enduml';
    expect(DUR.applySkinparamPreset(t, []))
      .toBe('@startuml\nskinparamFoo bar\nA -> B : x\n@enduml');
  });

  test('[AC-2/effect] applying a preset twice does not accumulate skinparam lines', function() {
    var t = '@startuml\nA -> B : x\n@enduml';
    var once = DUR.applySkinparamPreset(t, ['skinparam monochrome true']);
    var twice = DUR.applySkinparamPreset(once, ['skinparam monochrome true']);
    expect(twice).toBe(once);
  });
});
