'use strict';
// TICKET-roadmap-20261123-0226-4: サブフォルダの図にも、保存の入れ替わりの検知と版の通し (この図の履歴) が
// 直下の図と同じに効く。直下とサブフォルダの同じ名前の図は、版の控えも検知も別の図として扱う。
// 実マウスの確かめは tests/scenarios/roadmap-20261123-0226-4.spec.js。ここは
//   - saveSwap.placed: 直下の図は今までどおり直下の図とだけ比べ、サブフォルダの図は道付きの名前で全部と比べる
//   - 直下に同じ名前・同じ中身の図があれば、サブフォルダの図の保存は入れ替わりとして知らせる (自分とは数えない)
//   - versionTimeline は居場所の鍵 ('sub:{フォルダ}|{名前}') で積み、直下の同じ名前の図の版と混ざらない
//   - app.js が保存のたびに積む鍵・入れ替わりの検知を居場所で分けている (サブフォルダの図を外していない)
// を守る。
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
(function() {
  var store = {};
  var stub = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: stub });
})();
['../src/core/save-diff.js', '../src/core/save-swap.js', '../src/core/version-timeline.js', '../src/core/twin-restore.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var fs = require('fs');
var path = require('path');
var SS = window.MA.saveSwap;
var VT = window.MA.versionTimeline;
var TR = window.MA.twinRestore;

var SPI = '@startuml\nX -> Y : spi\n@enduml\n';
var BIG = '@startuml\nA -> B : 1\nA -> B : 2\nA -> B : 3\nA -> B : 4\nA -> B : 5\nA -> B : 6\nA -> B : 7\n@enduml\n';
var TPL = '@startuml\nAlice -> Bob : hello\n@enduml\n';
var DOCS = [
  { name: 'spi', dsl: SPI },
  { name: 'top', dsl: TPL },
  { name: 'spi', dsl: BIG, rel: 'design', dir: 'C:/x/design' },
  { name: 'gpio', dsl: '@startuml\nG -> H\n@enduml\n', rel: 'design/api', dir: 'C:/x/design/api' },
];

describe('突き合わせる相手 (saveSwap.placed)', function() {
  test('直下の図は今までどおり直下の図とだけ比べ、名前もそのまま', function() {
    var p = SS.placed({ name: 'spi', rel: '' }, DOCS);
    expect(p.name).toBe('spi');
    expect(p.folderDocs.map(function(d) { return d.name; })).toEqual(['spi', 'top']);
  });
  test('サブフォルダの図は道付きの名前で名指しし、直下と全部のサブフォルダの図と比べる', function() {
    var p = SS.placed({ name: 'spi', rel: 'design' }, DOCS);
    expect(p.name).toBe('design/spi');
    expect(p.folderDocs.map(function(d) { return d.name; })).toEqual(['spi', 'top', 'design/spi', 'design/api/gpio']);
  });
  test('道の区切り (\\ ・前後の /) は揃えて名指しする', function() {
    expect(SS.placed({ name: 'gpio', rel: '\\design\\api\\' }, DOCS).name).toBe('design/api/gpio');
  });
});

describe('サブフォルダの図の保存の入れ替わり (inspect と組み合わせ)', function() {
  test('サブフォルダの図の中身が直下の同じ名前の図と同じになったら、その図と入れ替わったと言う (自分とは数えない)', function() {
    var p = SS.placed({ name: 'spi', rel: 'design' }, DOCS);
    var res = SS.inspect({ name: p.name, dsl: SPI, prev: BIG, folderDocs: p.folderDocs });
    expect(res.twins).toEqual(['spi']);
    expect(res.warn).toBe(true);
    expect(SS.summaryLine(res)).toContain('design/spi');
    // 行の激減も直下の図と同じに言う
    expect(res.shrink).toEqual({ before: 9, after: 3, lost: 6 });
  });
  test('自分のファイル (同じ道・同じ名前) と同じ中身なのは入れ替わりではない', function() {
    var p = SS.placed({ name: 'spi', rel: 'design' }, DOCS);
    var res = SS.inspect({ name: p.name, dsl: BIG, prev: BIG, folderDocs: p.folderDocs });
    expect(res.twins).toEqual([]);
    expect(res.warn).toBe(false);
  });
  test('直下の図は、サブフォルダの図と同じ中身になっても今までどおり数えない (直下の挙動は変えない)', function() {
    var p = SS.placed({ name: 'top', rel: '' }, DOCS);
    var res = SS.inspect({ name: p.name, dsl: BIG, prev: null, folderDocs: p.folderDocs });
    expect(res.twins).toEqual([]);
  });
  test('一致した組は道付きの名前で並び、保存したサブフォルダの図が組に入る (戻すを出す相手)', function() {
    var p = SS.placed({ name: 'spi', rel: 'design' }, DOCS);
    var gs = TR.groups(p.folderDocs.concat([{ name: p.name, dsl: SPI }]));
    expect(TR.groupFor(gs, 'design/spi')).toBeTruthy();
    expect(TR.groupFor(gs, 'design/spi').names).toEqual(['design/spi', 'spi']);
  });
});

describe('版の通し (versionTimeline) は居場所の鍵で分ける', function() {
  test('直下の spi とサブフォルダの spi の版は混ざらない', function() {
    VT.reset();
    var subKey = 'sub:c:/x/design|spi';
    VT.push('spi', SPI);
    VT.push(subKey, BIG);
    VT.push(subKey, BIG.replace('7\n', '7\nA -> B : 8\n'));
    expect(VT.rows('spi').length).toBe(1);
    expect(VT.rows(subKey).length).toBe(2);
    expect(VT.rows(subKey).some(function(r) { return r.dsl === VT.normalize(SPI); })).toBe(false);
    expect(VT.rows('spi').some(function(r) { return r.dsl === VT.normalize(BIG); })).toBe(false);
  });
});

describe('app.js の結線 (保存のたびに居場所で分ける)', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  function has(re) { return re.test(src); }
  test('保存のたびに積む版の鍵は図の居場所 (_diffName)。名前だけで積む所が残っていない', function() {
    expect(has(/versionTimeline\.push\((doc|out)\.name/)).toBe(false);
    expect((src.match(/versionTimeline\.push\(_diffName\(/g) || []).length).toBe(3);
  });
  test('手で押した保存の入れ替わり検知はサブフォルダの図を外さず、図を渡して居場所で分ける', function() {
    expect(has(/if \(!\(doc && doc\.sub\)\) runSaveSwapCheck/)).toBe(false);
    expect(has(/runSaveSwapCheck\(doc && doc\.name, doc && doc\.dsl, doc\)/)).toBe(true);
    expect(has(/SS\.placed\(\{ name: docName, rel: rel \}/)).toBe(true);
    expect(has(/_sswPrev\[key\]/)).toBe(true);
  });
  test('「この図の履歴」の変遷はサブフォルダの図の鍵で引き、窓の名前は道付き', function() {
    expect(has(/VT\.summaryLine\(vtKey\)/)).toBe(true);
    expect(has(/_renderVtTimelineRows\(body, vtKey, only\)/)).toBe(true);
    expect(has(/VT\.forget\(_vtKeyOf\(_vtFile\)\)/)).toBe(true);
  });
});
