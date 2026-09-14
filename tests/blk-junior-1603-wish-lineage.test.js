'use strict';
// BLK-junior-20260908-1603-wish: 「この図はどの図の後継か」を 1 回登録すれば、
// 次に開いたとき「継承元が更新されています (差分 N 行)」と画面が言えることを見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/lineage.js')]; } catch (e) {}
require('../src/core/lineage.js');
var LG = global.window.MA.lineage;

var P1 = '@startuml\nstart\n:GPIO を初期化;\nstop\n@enduml';
var P2 = '@startuml\nstart\n:GPIO を初期化;\n:クロックを有効化;\nstop\n@enduml';

describe('lineage — 図の継承元を覚える', () => {
  beforeEach(() => { LG.reset(); });

  test('継承元を登録すると、その時点の中身が取り込み済みの基準になる', () => {
    LG.set('gpio_先輩反映.puml', 'gpio_primary.puml', P1, { dir: './autosave/primary' });
    var s = LG.status('gpio_先輩反映.puml', P1);
    expect(s.has).toBe(true);
    expect(s.parent).toBe('gpio_primary.puml');
    expect(s.dir).toBe('./autosave/primary');
    expect(s.updated).toBe(false);
    expect(s.changed).toBe(0);
  });

  test('継承元が変わったら、差分の行数まで言う', () => {
    LG.set('child.puml', 'parent.puml', P1);
    var s = LG.status('child.puml', P2);
    expect(s.updated).toBe(true);
    expect(s.added).toBe(1);
    expect(s.removed).toBe(0);
    expect(s.changed).toBe(1);
    expect(LG.statusLine('child.puml', P2)).toContain('継承元 parent.puml が更新されています');
    expect(LG.statusLine('child.puml', P2)).toContain('差分 1 行');
  });

  test('取り込み済みにすると基準が今の継承元に進み、更新は消える', () => {
    LG.set('child.puml', 'parent.puml', P1);
    expect(LG.adopt('child.puml', P2)).toBe(true);
    expect(LG.status('child.puml', P2).updated).toBe(false);
    expect(LG.statusLine('child.puml', P2)).toContain('取り込み済み');
  });

  test('増えた行・減った行を並べられる', () => {
    LG.set('child.puml', 'parent.puml', P1);
    var d = LG.diffLines('child.puml', P2);
    expect(d.added).toEqual([':クロックを有効化;']);
    expect(d.removed).toEqual([]);
  });

  test('改行コードと行末の空白だけの違いは更新と見なさない', () => {
    LG.set('child.puml', 'parent.puml', P1);
    var s = LG.status('child.puml', P1.replace(/\n/g, '\r\n') + '  \n\n');
    expect(s.updated).toBe(false);
  });

  test('継承元を読めなかったときは「更新あり」と言い切らない', () => {
    LG.set('child.puml', 'parent.puml', P1);
    var s = LG.status('child.puml', null);
    expect(s.known).toBe(false);
    expect(s.updated).toBe(false);
    expect(LG.statusLine('child.puml', null)).toContain('読めませんでした');
  });

  test('自分自身は継承元にできない', () => {
    expect(LG.set('a.puml', 'a.puml', P1)).toBe(null);
    expect(LG.get('a.puml')).toBe(null);
  });

  test('未登録なら未登録と言う。登録は外せる', () => {
    expect(LG.status('x.puml', P1).has).toBe(false);
    expect(LG.statusLine('x.puml', P1)).toBe('継承元は未登録です');
    LG.set('x.puml', 'parent.puml', P1);
    expect(LG.clear('x.puml')).toBe(true);
    expect(LG.get('x.puml')).toBe(null);
    expect(LG.clear('x.puml')).toBe(false);
  });

  test('登録した図の一覧が取れる', () => {
    LG.set('b.puml', 'p.puml', P1);
    LG.set('a.puml', 'p.puml', P1);
    expect(LG.children()).toEqual(['a.puml', 'b.puml']);
  });

  test('図の名前を変えても関係が付いていく', () => {
    LG.set('child.puml', 'parent.puml', P1);
    expect(LG.rename('parent.puml', 'parent2.puml')).toBe(true);
    expect(LG.get('child.puml').parent).toBe('parent2.puml');
    expect(LG.rename('child.puml', 'child2.puml')).toBe(true);
    expect(LG.get('child2.puml').parent).toBe('parent2.puml');
    expect(LG.get('child.puml')).toBe(null);
  });

  test('ボタンの見出しが開かずに更新の有無を言う', () => {
    expect(LG.badgeText('child.puml', P1)).toBe('⇡ 継承元 −');
    LG.set('child.puml', 'parent.puml', P1);
    expect(LG.badgeText('child.puml', P1)).toBe('⇡ 継承元 ✓');
    expect(LG.badgeText('child.puml', P2)).toBe('⇡ 継承元 +1 -0');
    expect(LG.badgeText('child.puml', null)).toBe('⇡ 継承元 ?');
  });

  test('localStorage 経由で次に開いたときも覚えている', () => {
    LG.set('child.puml', 'parent.puml', P1);
    var raw = global.window.localStorage.getItem('plantuml-lineage');
    expect(typeof raw).toBe('string');
    try { delete require.cache[require.resolve('../src/core/lineage.js')]; } catch (e) {}
    require('../src/core/lineage.js');
    var LG2 = global.window.MA.lineage;
    expect(LG2.get('child.puml').parent).toBe('parent.puml');
    expect(LG2.status('child.puml', P2).updated).toBe(true);
  });
});
