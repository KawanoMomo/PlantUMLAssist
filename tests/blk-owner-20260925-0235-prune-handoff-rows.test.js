'use strict';
// BLK-owner-20260925-0235-prune: 引き継ぎ zip の対象確認をチェックリストの窓に畳み、行の頭で入る / 入らないを切り替える。
// ここでは行ごとの上書き (overrides) の判定を確かめる (窓の結線は app.js、E2E は primary-04-rename-history)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var depPaths = ['../src/core/export-target.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ET = global.window.MA.exportTarget;

function folder() {
  return [
    { name: 'a', dsl: '@startuml\n@enduml' },
    { name: 'b', dsl: '@startuml\n@enduml' },
    { name: 'b-編集中', dsl: '@startuml\n@enduml' },
    { name: 'c', dsl: '@startuml\n@enduml' },
  ];
}
function names(m) { return m.targets.map(function(d) { return d.name; }); }

describe('export-target overrides: 行の頭で入る / 入らないを切り替える', function() {
  test('上書きが無ければ今までどおり (保存フォルダ全体・未確定は外す)', function() {
    var m = ET.model({ openDocs: [], folderDocs: folder(), folderAvailable: true });
    expect(names(m)).toEqual(['a', 'b', 'c']);
    expect(m.missing).toBe(0);
  });

  test('外した行は対象から抜け、外れた数と行に出る', function() {
    var m = ET.model({ openDocs: [], folderDocs: folder(), folderAvailable: true, overrides: { b: false } });
    expect(names(m)).toEqual(['a', 'c']);
    expect(m.count).toBe(2);
    expect(m.missing).toBe(1);
    expect(m.line).toContain('1 枚が対象から外れています');
  });

  test('未確定の行も、押せば 1 枚だけ入れられる (全部の未確定を入れなくてよい)', function() {
    var m = ET.model({ openDocs: [], folderDocs: folder(), folderAvailable: true, overrides: { 'b-編集中': true } });
    expect(names(m)).toEqual(['a', 'b', 'b-編集中', 'c']);
    expect(m.missing).toBe(0);
  });

  test('開いているタブだけの的でも、タブに無い行を押せば入る', function() {
    var m = ET.model({ openDocs: [{ id: 't1', name: 'a', dsl: '@startuml\n@enduml' }], folderDocs: folder(),
      folderAvailable: true, mode: 'open', overrides: { c: true } });
    expect(names(m)).toEqual(['a', 'c']);
    expect(m.missing).toBe(1);
  });

  test('全部外すと書き出せない', function() {
    var m = ET.model({ openDocs: [], folderDocs: folder(), folderAvailable: true, overrides: { a: false, b: false, c: false } });
    expect(m.count).toBe(0);
    expect(m.canBuild).toBe(false);
  });
});

global.window = prevWindow;
global.document = prevDocument;
