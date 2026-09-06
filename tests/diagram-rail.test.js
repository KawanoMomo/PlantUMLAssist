'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/diagram-rail.js')]; } catch (e) {}
require('../src/core/diagram-rail.js');
var rail = global.window.MA.diagramRail;

describe('diagram-rail — 左端の図種レール (design 1a)', () => {
  test('items: design の並び順 SEQ/UC/CMP/CLS/ACT/ST で 6 図種を返す', () => {
    expect(rail.items().map(it => it.code)).toEqual(['SEQ', 'UC', 'CMP', 'CLS', 'ACT', 'ST']);
    expect(rail.items().map(it => it.type)).toEqual([
      'plantuml-sequence', 'plantuml-usecase', 'plantuml-component',
      'plantuml-class', 'plantuml-activity', 'plantuml-state',
    ]);
  });

  test('items: 返り値を書き換えても内部の並びは壊れない', () => {
    var a = rail.items();
    a[0].code = 'XXX';
    a.length = 1;
    expect(rail.items().length).toBe(6);
    expect(rail.items()[0].code).toBe('SEQ');
  });

  test('codeFor / labelFor: 図種から短縮名と表示名を引ける', () => {
    expect(rail.codeFor('plantuml-class')).toBe('CLS');
    expect(rail.labelFor('plantuml-class')).toBe('Class');
    expect(rail.codeFor('plantuml-state')).toBe('ST');
    expect(rail.labelFor('plantuml-sequence')).toBe('Sequence');
  });

  test('未知の図種でも例外を投げず空文字を返す', () => {
    expect(rail.codeFor('plantuml-unknown')).toBe('');
    expect(rail.labelFor(undefined)).toBe('');
    expect(rail.isKnownType('plantuml-unknown')).toBe(false);
    expect(rail.isKnownType('plantuml-sequence')).toBe(true);
    expect(rail.indexOfType('plantuml-nope')).toBe(-1);
  });

  test('stepType: 隣の図種へ進み、端では巻き戻る', () => {
    expect(rail.stepType('plantuml-sequence', 1)).toBe('plantuml-usecase');
    expect(rail.stepType('plantuml-usecase', -1)).toBe('plantuml-sequence');
    expect(rail.stepType('plantuml-state', 1)).toBe('plantuml-sequence');
    expect(rail.stepType('plantuml-sequence', -1)).toBe('plantuml-state');
  });

  test('stepType: 未知の図種は先頭起点として扱う', () => {
    expect(rail.stepType('plantuml-unknown', 1)).toBe('plantuml-usecase');
  });

  test('buildRailHtml: 6 つのボタンを出し、現在の図種にだけ active を付ける', () => {
    var html = rail.buildRailHtml('plantuml-activity');
    expect((html.match(/<button/g) || []).length).toBe(6);
    expect(html).toContain('data-type="plantuml-activity"');
    expect((html.match(/class="rail-btn active"/g) || []).length).toBe(1);
    expect((html.match(/aria-pressed="true"/g) || []).length).toBe(1);
    // active が付いているのは activity のボタン (同じ <button ...> の中にある)
    var activeIdx = html.indexOf('class="rail-btn active"');
    var actIdx = html.indexOf('data-type="plantuml-activity"');
    expect(activeIdx).toBeLessThan(actIdx);
    expect(actIdx - activeIdx).toBeLessThan(60);
  });

  test('buildRailHtml: 未知の図種なら active はどれにも付かない', () => {
    var html = rail.buildRailHtml('plantuml-unknown');
    expect((html.match(/class="rail-btn active"/g) || []).length).toBe(0);
    expect((html.match(/<button/g) || []).length).toBe(6);
    expect(html).not.toContain('aria-pressed="true"');
  });

  test('buildRailHtml: ボタンは id と title を持つ', () => {
    var html = rail.buildRailHtml('plantuml-sequence');
    expect(html).toContain('id="rail-seq"');
    expect(html).toContain('id="rail-cls"');
    expect(html).toContain('title="クラス図 (Class)"');
  });
});
