'use strict';
// BLK-builder-20260907-1243-3b: design 5d の「その他パレット」—
// Component の folder / frame / node 表記と UseCase の rectangle 表記。
// run-tests.js が src/core/group-notation.js を sandbox.window に読み込むので、
// ここは require せずにその window から取る (component-parser.test.js と同じ作法)。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var GN = W.MA.groupNotation;
var co = W.MA.modules.plantumlComponent;
var uc = W.MA.modules.plantumlUsecase;

describe('groupNotation.notationsFor', function() {
  test('Component は 5 表記', function() {
    expect(GN.notationsFor('plantuml-component').map(function(n) { return n.id; }))
      .toEqual(['package', 'folder', 'frame', 'node', 'rectangle']);
  });

  test('UseCase はパーサが読める 2 表記だけ', function() {
    expect(GN.notationsFor('plantuml-usecase').map(function(n) { return n.id; }))
      .toEqual(['package', 'rectangle']);
  });

  test('知らない図種でも package だけは返す', function() {
    expect(GN.notationsFor('plantuml-state').map(function(n) { return n.id; })).toEqual(['package']);
  });
});

describe('groupNotation.normalize', function() {
  test('その図種で読めない表記は package に落ちる', function() {
    expect(GN.normalize('folder', 'plantuml-usecase')).toBe('package');
    expect(GN.normalize('folder', 'plantuml-component')).toBe('folder');
    expect(GN.normalize(undefined, 'plantuml-component')).toBe('package');
  });
});

describe('groupNotation.fmtOpen / parseOpen', function() {
  test('選んだ表記で開き行を組む', function() {
    expect(GN.fmtOpen('node', 'Backend', 'plantuml-component')).toBe('node "Backend" {');
    expect(GN.fmtOpen('rectangle', '受付', 'plantuml-usecase')).toBe('rectangle "受付" {');
  });

  test('日本語や空白入りのラベルも 1 語として読める形になる', function() {
    var line = GN.fmtOpen('folder', 'Auth Module', 'plantuml-component');
    expect(GN.parseOpen(line)).toEqual({ indent: '', notation: 'folder', label: 'Auth Module' });
  });

  test('引用符なしの既存行も読める', function() {
    expect(GN.parseOpen('  frame Backend {')).toEqual({ indent: '  ', notation: 'frame', label: 'Backend' });
  });

  test('境界の開き行でなければ null', function() {
    expect(GN.parseOpen('component WebApp')).toBeNull();
    expect(GN.parseOpen('}')).toBeNull();
    expect(GN.notationOf('component WebApp')).toBeNull();
  });
});

describe('groupNotation.changeNotation', function() {
  var DSL = [
    '@startuml',
    'package "Backend" {',
    '  component WebApp',
    '}',
    '@enduml',
  ].join('\n');

  test('開き行だけが変わり、中身と閉じ括弧はそのまま', function() {
    var out = GN.changeNotation(DSL, 2, 'node', 'plantuml-component');
    expect(out.split('\n')).toEqual([
      '@startuml', 'node "Backend" {', '  component WebApp', '}', '@enduml',
    ]);
  });

  test('字下げは保つ', function() {
    var nested = '@startuml\n  package "In" {\n  }\n@enduml';
    expect(GN.changeNotation(nested, 2, 'frame', 'plantuml-component'))
      .toContain('  frame "In" {');
  });

  test('同じ表記なら 1 文字も変えない', function() {
    expect(GN.changeNotation(DSL, 2, 'package', 'plantuml-component')).toBe(DSL);
  });

  test('境界でない行・範囲外の行を渡されても壊さない', function() {
    expect(GN.changeNotation(DSL, 3, 'node', 'plantuml-component')).toBe(DSL);
    expect(GN.changeNotation(DSL, 99, 'node', 'plantuml-component')).toBe(DSL);
  });

  test('UseCase で folder を指しても package に落ちる (パーサが読めないため)', function() {
    expect(GN.changeNotation(DSL, 2, 'folder', 'plantuml-usecase')).toBe(DSL);
  });
});


describe('Component / UseCase から表記を選んで境界を足す', function() {
  var CO = '@startuml\ntitle T\ncomponent WebApp\n@enduml';

  test('component: 選んだ表記で開き行が書かれ、閉じ括弧も付く', function() {
    var out = co.addPackage(CO, 'Backend', 'node');
    expect(out).toContain('node "Backend" {');
    expect(out.split('\n').filter(function(l) { return l.trim() === '}'; }).length).toBe(1);
  });

  test('component: 表記を省いたら従来どおり package', function() {
    expect(co.addPackage(CO, 'Backend')).toContain('package "Backend" {');
  });

  test('component: parse が表記を持ち帰る', function() {
    var r = co.parse('@startuml\nfolder "Backend" {\ncomponent WebApp\n}\n@enduml');
    expect(r.groups[0].kind).toBe('package');
    expect(r.groups[0].notation).toBe('folder');
  });

  test('component: 表記を差し替えても中の要素はそのまま読める', function() {
    var src = '@startuml\nframe "Backend" {\ncomponent WebApp\n}\n@enduml';
    var out = co.changeGroupNotation(src, 2, 'node');
    var r = co.parse(out);
    expect(r.groups[0].notation).toBe('node');
    expect(r.groups[0].label).toBe('Backend');
    expect(r.elements.map(function(e) { return e.id; })).toContain('WebApp');
  });

  test('usecase: rectangle 表記で足せる', function() {
    var out = uc.addPackage('@startuml\nactor User\n@enduml', '受付', 'rectangle');
    expect(out).toContain('rectangle "受付" {');
    var r = uc.parse(out);
    expect(r.groups[0].notation).toBe('rectangle');
    expect(r.groups[0].label).toBe('受付');
  });

  test('usecase: パーサが読めない folder は package に落ちる', function() {
    expect(uc.addPackage('@startuml\nactor User\n@enduml', 'X', 'folder')).toContain('package "X" {');
  });
});
