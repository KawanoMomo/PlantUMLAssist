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
try { delete require.cache[require.resolve('../src/core/zoom-hud.js')]; } catch (e) {}
require('../src/core/zoom-hud.js');
var hud = global.window.MA.zoomHud;

describe('zoom-hud — キャンバス上に浮くズーム帯 (design 1a)', () => {
  test('clampZoom: app.js の setZoom と同じ 0.1〜5.0 / 小数 2 桁に丸める', () => {
    expect(hud.clampZoom(1)).toBe(1);
    expect(hud.clampZoom(0.05)).toBe(0.1);
    expect(hud.clampZoom(9)).toBe(5);
    expect(hud.clampZoom(1.234)).toBe(1.23);
  });

  test('clampZoom: 数値でない入力でも例外を投げず 1 に落とす', () => {
    expect(hud.clampZoom(undefined)).toBe(1);
    expect(hud.clampZoom(NaN)).toBe(1);
    expect(hud.clampZoom(Infinity)).toBe(1);
    expect(hud.clampZoom('abc')).toBe(1);
  });

  test('formatPercent: 百分率の整数で出す', () => {
    expect(hud.formatPercent(1)).toBe('100%');
    expect(hud.formatPercent(0.5)).toBe('50%');
    expect(hud.formatPercent(1.25)).toBe('125%');
  });

  test('stepZoom: 押下 1 回で 0.1 動き、端では止まる', () => {
    expect(hud.stepZoom(1, 1)).toBe(1.1);
    expect(hud.stepZoom(1, -1)).toBe(0.9);
    expect(hud.stepZoom(5, 1)).toBe(5);
    expect(hud.stepZoom(0.1, -1)).toBe(0.1);
  });

  test('stepZoom: 浮動小数の誤差が表示に漏れない', () => {
    var z = 1;
    for (var i = 0; i < 3; i++) z = hud.stepZoom(z, 1);
    expect(z).toBe(1.3);
    expect(hud.formatPercent(z)).toBe('130%');
  });

  test('isMin / isMax: 端に達したかを答える', () => {
    expect(hud.isMin(0.1)).toBe(true);
    expect(hud.isMin(0.2)).toBe(false);
    expect(hud.isMax(5)).toBe(true);
    expect(hud.isMax(4.9)).toBe(false);
  });

  test('hudLabel: 図種名と倍率を「Sequence · 100%」の形で並べる', () => {
    expect(hud.hudLabel('plantuml-sequence', 1)).toBe('Sequence · 100%');
    expect(hud.hudLabel('plantuml-class', 1.5)).toBe('Class · 150%');
  });

  test('hudLabel: 未知の図種なら倍率だけを出す', () => {
    expect(hud.hudLabel('plantuml-unknown', 1)).toBe('100%');
  });

  test('buildHudHtml: − / ＋ / Fit と倍率表示を持つ', () => {
    var html = hud.buildHudHtml('plantuml-sequence', 1);
    expect(html).toContain('id="hud-zoom-out"');
    expect(html).toContain('id="hud-zoom-in"');
    expect(html).toContain('id="hud-zoom-fit"');
    expect(html).toContain('>100%<');
    expect(html).toContain('Sequence · 100%');
  });

  test('buildHudHtml: 端では対応するボタンだけ disabled になる', () => {
    var atMax = hud.buildHudHtml('plantuml-sequence', 5);
    expect((atMax.match(/disabled/g) || []).length).toBe(1);
    expect(atMax.indexOf('id="hud-zoom-in" title="拡大" disabled')).toBeGreaterThan(-1);

    var atMin = hud.buildHudHtml('plantuml-sequence', 0.1);
    expect((atMin.match(/disabled/g) || []).length).toBe(1);
    expect(atMin.indexOf('id="hud-zoom-out" title="縮小" disabled')).toBeGreaterThan(-1);

    var mid = hud.buildHudHtml('plantuml-sequence', 1);
    expect((mid.match(/disabled/g) || []).length).toBe(0);
  });
});
