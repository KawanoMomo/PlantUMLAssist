'use strict';
// BLK-migrator-20260924-1132: `!include` した手続き (C4_Sequence の Container / Component / Rel …) を呼ぶだけで
// 書いたシーケンス図。手続きの名前は覚えず、呼び出しの形 (別名, "表示名" / 別名, 別名, "文字") で読む。

var W = (typeof window !== 'undefined' && window) || global.window;
var SEQ = W.MA.modules.plantumlSequence;

var DSL = [
  '@startuml',
  '!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Sequence.puml',
  'Container(c1, "Single-Page Application", "JavaScript and Angular", "Provides, all")',
  'Container_Boundary(b, "API Application")',
  '  Component(c2, "Sign In Controller", "Spring MVC Rest Controller")',
  'Boundary_End()',
  'ContainerDb(c4, "Database", "Relational Database Schema")',
  'Rel(c1, c2, "Submits credentials to", "JSON/HTTPS")',
  'Rel(c2, c4, "select * from users where username = ?", "JDBC")',
  'SHOW_LEGEND()',
  '@enduml',
].join('\n');

describe('手続きを呼ぶだけのシーケンス図', function() {
  test('別名と "表示名" で呼ぶ行は参加者 (表示名は SVG の頭に出る文字)', function() {
    var p = SEQ.parse(DSL);
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return e.id; })).toEqual(['c1', 'b', 'c2', 'c4']);
    expect(parts[0].label).toBe('Single-Page Application');
    expect(parts[0].line).toBe(3);
  });

  test('参加者 2 人と "文字" で呼ぶ行はメッセージ', function() {
    var p = SEQ.parse(DSL);
    expect(p.relations.map(function(r) { return [r.from, r.to, r.label, r.line]; })).toEqual([
      ['c1', 'c2', 'Submits credentials to', 8],
      ['c2', 'c4', 'select * from users where username = ?', 9],
    ]);
  });

  test('引数の無い手続き (Boundary_End / SHOW_LEGEND) は何も足さない', function() {
    var p = SEQ.parse('@startuml\nBoundary_End()\nSHOW_LEGEND()\n@enduml');
    expect(p.elements.length).toBe(0);
    expect(p.relations.length).toBe(0);
  });
});
