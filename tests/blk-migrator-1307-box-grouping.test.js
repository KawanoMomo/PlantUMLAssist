'use strict';
// BLK-migrator-20260923-1307: 実物の sequence 図は `box "ECU本体" #LightYellow` …
// `end box` で参加者を装置ごとに囲む。囲みの行はパーサが読み飛ばすだけで、囲み自体は
// 図に描かれているのに要素として存在せず、見出しにホバーしても何も指さなかった。
// ここでは囲みを 1 つの要素として読むこと、囲まれた参加者と以後のメッセージが
// 今までどおり拾えること、名前を直しても色と字下げが残ることを守る。
var jsdom = require('jsdom');

if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
}

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');

var seq = global.window.MA.modules.plantumlSequence;

// migrator の実物 seq-10-box-grouping.puml と同じ形 (先頭のコメント・字下げ・色つき)。
var DSL = [
  "' 狙い: box によるparticipantのグルーピング",  // 1
  '@startuml',                                    // 2
  'box "ECU本体" #LightYellow',                   // 3
  '  participant App',                            // 4
  '  participant Rte',                            // 5
  'end box',                                      // 6
  'box "外部装置"',                                // 7
  '  participant Tester',                         // 8
  'end box',                                      // 9
  'Tester -> App : 診断リクエスト',                 // 10
  'App -> Rte : データ取得',                       // 11
  'Rte --> App : データ',                          // 12
  'App --> Tester : 診断レスポンス',                // 13
  '@enduml',                                      // 14
].join('\n');

describe('box で囲まれた図を読む', function() {
  var p = seq.parseSequence(DSL);

  test('囲みを 2 つ、名前・色・範囲つきで読む', function() {
    expect(p.boxes.length).toBe(2);
    expect(p.boxes[0].label).toBe('ECU本体');
    expect(p.boxes[0].color).toBe('#LightYellow');
    expect(p.boxes[0].line).toBe(3);
    expect(p.boxes[0].endLine).toBe(6);
    expect(p.boxes[1].label).toBe('外部装置');
    expect(p.boxes[1].color).toBe('');
    expect(p.boxes[1].line).toBe(7);
    expect(p.boxes[1].endLine).toBe(9);
  });

  test('囲まれた参加者は今までどおり拾え、宣言行を指す', function() {
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return e.id; })).toEqual(['App', 'Rte', 'Tester']);
    expect(parts.map(function(e) { return e.line; })).toEqual([4, 5, 8]);
  });

  test('どの参加者がどの囲みの中かが分かる', function() {
    expect(p.boxes[0].members).toEqual(['App', 'Rte']);
    expect(p.boxes[1].members).toEqual(['Tester']);
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts[0].boxId).toBe(p.boxes[0].id);
    expect(parts[2].boxId).toBe(p.boxes[1].id);
  });

  test('囲みの後のメッセージも今までどおり 4 本読める', function() {
    expect(p.relations.length).toBe(4);
    expect(p.relations.map(function(r) { return r.line; })).toEqual([10, 11, 12, 13]);
    expect(p.relations[0].from).toBe('Tester');
    expect(p.relations[0].label).toBe('診断リクエスト');
  });

  test('`end box` を alt/loop の `end` と取り違えない', function() {
    expect(p.groups.length).toBe(0);
  });

  test('囲みの中に alt があっても、それぞれの終わりを取り違えない', function() {
    var q = seq.parseSequence([
      '@startuml',
      'box "ECU"',      // 2
      'participant App',
      'end box',        // 4
      'alt 正常',        // 5
      'App -> App : ok',
      'end',            // 7
      '@enduml',
    ].join('\n'));
    expect(q.boxes.length).toBe(1);
    expect(q.boxes[0].endLine).toBe(4);
    expect(q.groups.length).toBe(1);
    expect(q.groups[0].gtype).toBe('alt');
    expect(q.groups[0].line).toBe(5);
    expect(q.groups[0].endLine).toBe(7);
  });

  test('名前を書かない `box` も読む', function() {
    var q = seq.parseSequence('@startuml\nbox\nparticipant A\nend box\n@enduml');
    expect(q.boxes.length).toBe(1);
    expect(q.boxes[0].label).toBe('');
    expect(q.boxes[0].members).toEqual(['A']);
  });
});

describe('囲みの名前を直す', function() {
  test('色と字下げを残したまま名前だけ変わる', function() {
    var out = seq.renameBox('@startuml\n  box "ECU本体" #LightYellow\nend box\n@enduml', 2, '車体側');
    expect(out.split('\n')[1]).toBe('  box "車体側" #LightYellow');
  });

  test('色の無い囲みは色を足さない', function() {
    var out = seq.renameBox('@startuml\nbox "外部装置"\nend box\n@enduml', 2, '計測器');
    expect(out.split('\n')[1]).toBe('box "計測器"');
  });

  test('名前を空にすると名前なしの囲みになる', function() {
    var out = seq.renameBox('@startuml\nbox "外部装置"\nend box\n@enduml', 2, '');
    expect(out.split('\n')[1]).toBe('box');
  });

  test('囲みでない行を指されたら何もしない', function() {
    var src = '@startuml\nparticipant A\n@enduml';
    expect(seq.renameBox(src, 2, 'x')).toBe(src);
    expect(seq.renameBox(src, 99, 'x')).toBe(src);
  });

  test('直した後も読み直せる (往復しても壊れない)', function() {
    var out = seq.renameBox(DSL, 3, '車体側');
    var q = seq.parseSequence(out);
    expect(q.boxes[0].label).toBe('車体側');
    expect(q.boxes[0].color).toBe('#LightYellow');
    expect(q.boxes[0].members).toEqual(['App', 'Rte']);
    expect(q.relations.length).toBe(4);
  });
});
