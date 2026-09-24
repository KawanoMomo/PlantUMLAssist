'use strict';
// BLK-owner-20260923-2332-2: クラス図・コンポーネント図・ユースケース図の「追加する位置」。
// 境界をフォームで作っても中が空のままで、要素を入れる手段が本文欄しか無かった。
// run-tests.js が src/core/group-place.js と各図種モジュールを sandbox.window に読み込む。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var GP = W.MA.groupPlace;
var co = W.MA.modules.plantumlComponent;
var uc = W.MA.modules.plantumlUsecase;
var cl = W.MA.modules.plantumlClass;

var CO = [
  '@startuml',
  'component SpiDrv',
  'package "Mcal" {',
  '}',
  '@enduml',
].join('\n');

describe('groupPlace.options', function() {
  test('境界が無ければ「図の末尾」だけ', function() {
    var p = co.parse('@startuml\ncomponent A\n@enduml');
    expect(GP.options(p.groups)).toEqual([{ value: 'end', label: '図の末尾' }]);
  });

  test('境界は「境界『名前』の中」、入れ子は 外 › 内 で並ぶ', function() {
    var p = co.parse('@startuml\npackage "Mcal" {\n  node "Spi" {\n  }\n}\n@enduml');
    var labels = GP.options(p.groups).map(function(o) { return o.label; });
    expect(labels).toEqual(['図の末尾', '境界『Mcal』の中', '境界『Mcal › Spi』の中']);
  });
});

describe('groupPlace.placeAdded — 足した行を境界の中へ入れる', function() {
  test('コンポーネント: 末尾に足した component を空の package の中へ', function() {
    var p = co.parse(CO);
    var added = co.addComponent(CO, 'Port', 'Port', '');
    var out = GP.placeAdded(CO, added, p.groups[0]);
    expect(out).toBe([
      '@startuml',
      'component SpiDrv',
      'package "Mcal" {',
      '  component Port',
      '}',
      '@enduml',
    ].join('\n'));
    var q = co.parse(out);
    var port = q.elements.filter(function(e) { return e.id === 'Port'; })[0];
    expect(port.parentPackageId).toBe(q.groups[0].id);
  });

  test('ユースケース: rectangle の中へ usecase。ほかの行は動かない', function() {
    var src = '@startuml\nactor Dev\nrectangle "SPI" {\n  usecase Init\n}\nDev --> Init\n@enduml';
    var p = uc.parse(src);
    var out = GP.placeAdded(src, uc.addUsecase(src, 'Send', '送信'), p.groups[0]);
    expect(out).toBe('@startuml\nactor Dev\nrectangle "SPI" {\n  usecase Init\n  usecase "送信" as Send\n}\nDev --> Init\n@enduml');
  });

  test('クラス: 複数行の enum も字下げをそろえて丸ごと入る', function() {
    var src = '@startuml\npackage "domain" {\n}\n@enduml';
    var p = cl.parse(src);
    var out = GP.placeAdded(src, cl.addEnum(src, 'Mode', 'Mode', ['A', 'B']), p.groups[0]);
    expect(out.split('\n').slice(1, 7)).toEqual([
      'package "domain" {', '  enum Mode {', '    A', '    B', '  }', '}',
    ]);
    var q = cl.parse(out);
    expect(q.elements[0].parentPackageId).toBe(q.groups[0].id);
  });

  test('入れ子の内側の境界を選べば、その内側へ入る', function() {
    var src = '@startuml\npackage "Mcal" {\n  node "Spi" {\n  }\n}\n@enduml';
    var p = co.parse(src);
    var out = GP.placeAdded(src, co.addComponent(src, 'X', 'X', ''), p.groups[1]);
    expect(out).toBe('@startuml\npackage "Mcal" {\n  node "Spi" {\n    component X\n  }\n}\n@enduml');
  });

  test('位置が無ければ (末尾) 足したままを返す', function() {
    var added = co.addComponent(CO, 'X', 'X', '');
    expect(GP.placeAdded(CO, added, null)).toBe(added);
  });
});

describe('groupPlace.moveInto / moveOut — 右パネルから移す', function() {
  test('境界の外の component を中へ移す (行を移すだけ)', function() {
    var p = co.parse(CO);
    var out = GP.moveInto(CO, 2, p.groups, p.groups[0].id);
    expect(out).toBe('@startuml\npackage "Mcal" {\n  component SpiDrv\n}\n@enduml');
  });

  test('中身を持つ component (port 入り) はブロックごと移る', function() {
    var src = '@startuml\ncomponent A {\n  port p1\n}\npackage "Mcal" {\n}\n@enduml';
    var p = co.parse(src);
    var a = p.elements.filter(function(e) { return e.id === 'A'; })[0];
    var out = GP.moveInto(src, a.line, p.groups, p.groups[0].id);
    expect(out).toBe('@startuml\npackage "Mcal" {\n  component A {\n    port p1\n  }\n}\n@enduml');
  });

  test('境界の中の要素を外へ出すと、閉じ括弧の直後に並ぶ', function() {
    var src = '@startuml\nrectangle "SPI" {\n  usecase Init\n  usecase Send\n}\nDev --> Init\n@enduml';
    var p = uc.parse(src);
    var out = GP.moveOut(src, 3, p.groups);
    expect(out).toBe('@startuml\nrectangle "SPI" {\n  usecase Send\n}\nusecase Init\nDev --> Init\n@enduml');
  });

  test('後ろにある要素を前の境界へ移しても、境界の閉じの位置を取り違えない', function() {
    var src = '@startuml\npackage "domain" {\n  class A\n}\nclass B {\n  +x : int\n}\n@enduml';
    var p = cl.parse(src);
    var b = p.elements.filter(function(e) { return e.id === 'B'; })[0];
    var out = GP.moveInto(src, b.line, p.groups, p.groups[0].id);
    expect(out).toBe('@startuml\npackage "domain" {\n  class A\n  class B {\n    +x : int\n  }\n}\n@enduml');
  });

  test('右パネルの候補: 今居る境界は「外へ出す」、ほかの境界は「中へ移す」', function() {
    var src = '@startuml\npackage "Mcal" {\n  component A\n}\npackage "Ecual" {\n}\n@enduml';
    var p = co.parse(src);
    var labels = GP.moveOptions(p.groups, 3).map(function(o) { return o.label; });
    expect(labels).toEqual(['境界へ入れる / 出す…', '境界『Mcal』の外へ出す', '境界『Ecual』の中へ移す']);
  });
});

describe('groupPlace.preferred — 作った直後の境界を次の既定にする', function() {
  test('覚えた名前の境界 (同名なら後ろ) を返し、無ければ末尾', function() {
    var src = '@startuml\npackage "Mcal" {\n}\npackage "Mcal" {\n}\n@enduml';
    var p = co.parse(src);
    GP.remember('test-kind', 'Mcal');
    expect(GP.preferred('test-kind', p.groups)).toBe(p.groups[1].id);
    GP.remember('test-kind', 'Nope');
    expect(GP.preferred('test-kind', p.groups)).toBe('end');
    GP.forget('test-kind');
    expect(GP.preferred('test-kind', p.groups)).toBe('end');
  });
});
