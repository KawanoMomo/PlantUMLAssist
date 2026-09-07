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

  // ── design 7a: 略号だけの箱をやめ、図の形の線画を添える (BLK-builder-20260908-0823-1)
  describe('図種の線画 (design 7a)', () => {
    test('glyphFor: 6 図種すべてが線画を持ち、中身が図種ごとに違う', () => {
      var seen = {};
      rail.items().forEach(function(it) {
        var g = rail.glyphFor(it.type);
        expect(g).not.toBe('');
        expect(seen[g]).toBe(undefined);
        seen[g] = it.type;
      });
      expect(Object.keys(seen).length).toBe(6);
    });

    test('glyphFor: 未知の図種は空文字 (例外を投げない)', () => {
      expect(rail.glyphFor('plantuml-unknown')).toBe('');
      expect(rail.glyphFor(undefined)).toBe('');
    });

    test('glyphSvg: 16x16・線幅 1・currentColor の <svg> で包む', () => {
      var svg = rail.glyphSvg('plantuml-usecase');
      expect(svg).toContain('viewBox="0 0 16 16"');
      expect(svg).toContain('stroke-width="1"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('fill="none"');
      // 線画は装飾なので支援技術からは隠す (ボタン本体が略号と title を持つ)
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('class="rail-glyph"');
      expect(svg.slice(-6)).toBe('</svg>');
    });

    test('glyphSvg: 未知の図種は <svg> を作らない', () => {
      expect(rail.glyphSvg('plantuml-unknown')).toBe('');
    });

    test('buildRailHtml: 各ボタンに線画 1 つと略号が入る', () => {
      var html = rail.buildRailHtml('plantuml-sequence');
      expect((html.match(/<svg/g) || []).length).toBe(6);
      expect((html.match(/class="rail-code"/g) || []).length).toBe(6);
      expect(html).toContain('<span class="rail-code">SEQ</span>');
      expect(html).toContain('<span class="rail-code">CMP</span>');
    });

    test('buildRailHtml: 略号は線画の後ろに来る (読み上げ順が 形→名前)', () => {
      var html = rail.buildRailHtml('plantuml-state');
      var btn = html.slice(html.indexOf('id="rail-st"'));
      btn = btn.slice(0, btn.indexOf('</button>'));
      expect(btn.indexOf('<svg')).toBeLessThan(btn.indexOf('rail-code'));
    });
  });
});
