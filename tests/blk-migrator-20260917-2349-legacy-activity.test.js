'use strict';
// BLK-migrator-20260917-2349: 旧記法 activity は usecase と判定されてはならない。
var parserUtils = (typeof window !== 'undefined' && window.MA && window.MA.parserUtils)
  || (global.window && global.window.MA && global.window.MA.parserUtils);

var LEGACY = '@startuml\n(*) --> "電源投入"\n"電源投入" --> "自己診断"\nif "診断結果" then\n  -->[OK] "通常起動"\nelse\n  -->[NG] "エラー処理"\nendif\n@enduml';

describe('detectDiagramType — 旧記法 activity', function() {
  test('(*) と if "..." then の図は activity', function() {
    expect(parserUtils.detectDiagramType(LEGACY)).toBe('plantuml-activity');
  });
  test('終端 --> (*) だけでも activity', function() {
    expect(parserUtils.detectDiagramType('@startuml\n"A" --> "B"\n"B" --> (*)\n@enduml')).toBe('plantuml-activity');
  });
  test('(*top) 始点も activity', function() {
    expect(parserUtils.detectDiagramType('@startuml\n(*top) --> "A"\n@enduml')).toBe('plantuml-activity');
  });
  test('usecase の短縮形は従来どおり usecase', function() {
    expect(parserUtils.detectDiagramType('@startuml\nactor User\n(Login)\n@enduml')).toBe('plantuml-usecase');
  });
});
