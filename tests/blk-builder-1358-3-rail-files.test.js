'use strict';
// BLK-builder-20260924-1358-3 (design 10a / 7a): 左レールの FILES はロゴ P の直下・図種の列の上に置き、
// 印は図種・設定と同じ 16px・線幅 1 の線画にする (文字の ▤ はフォント依存で揃わない)。
var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var f = '../src/core/diagram-rail.js';
try { delete require.cache[require.resolve(f)]; } catch (e) {}
require(f);
var R = W.MA.diagramRail;
var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('レールの FILES (design 10a / 7a)', function() {
  test('FILES はロゴの直後、図種の列より上にある', function() {
    var rail = html.slice(html.indexOf('<div id="rail"'));
    var logo = rail.indexOf('class="rail-logo"');
    var files = rail.indexOf('id="rail-files"');
    var types = rail.indexOf('id="rail-types"');
    var cfg = rail.indexOf('id="rail-config"');
    expect(logo).toBeGreaterThanOrEqual(0);
    expect(files).toBeGreaterThan(logo);
    expect(types).toBeGreaterThan(files);
    expect(cfg).toBeGreaterThan(types);
  });

  test('FILES の印は図種と同じ作りの線画で、図種の巡回には入らない', function() {
    var svg = R.glyphSvg('files');
    expect(svg).toContain('<svg class="rail-glyph" viewBox="0 0 16 16" width="16" height="16"');
    expect(svg).toContain('stroke-width="1"');
    expect(R.items().map(function(it) { return it.type; })).not.toContain('files');
  });
});
