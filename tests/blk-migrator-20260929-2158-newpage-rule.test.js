'use strict';
// BLK-migrator-20260929-2158: newpage のある sequence 図で、PlantUML が 1 枚目の下端に全幅で描く破線
// (ページの境目。`<line ... stroke-dasharray:2,2>`) の上ではどの枠にも当たらず、「+ DSL 14 行目に挿入」だけが出た。
// 直し方: 描かれた線のうち、どのライフラインも左右に突き抜け、枠 (alt / group) の中にも区切り (`==`) の中にも無い
// 横の破線を「図全体にかかる区切り」として拾い、箱を持たない区切りの行 (`newpage`) に当てる (== 区切り == と同じ source-line)。
// fixtures/svg は plantuml 1.2026.8 (同梱 jar) の実際の描画。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window || !global.window.document) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  var prevMA = global.window && global.window.MA;
  global.window = dom.window;
  if (prevMA) global.window.MA = prevMA;
  global.DOMParser = dom.window.DOMParser;
}
if (!global.document) global.document = global.window.document;
var document = global.window.document;

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var window = global.window;
var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = overlay.buildSequenceOverlay(svgEl, seq.parseSequence(dslText), overlayEl, dslText);
  return { svgEl: svgEl, overlayEl: overlayEl, res: res, dsl: dslText };
}
function num(el, a) { return parseFloat(el.getAttribute(a)); }
// ページの境目の破線 (横いっぱいの 2,2 の破線のうち一番長いもの)
function pageRule(svgEl) {
  var ls = Array.prototype.filter.call(svgEl.querySelectorAll('line'), function(l) {
    return /dasharray:\s*2,\s*2/.test(l.getAttribute('style') || '') && Math.abs(num(l, 'y1') - num(l, 'y2')) < 0.5;
  });
  ls.sort(function(a, b) { return Math.abs(num(b, 'x2') - num(b, 'x1')) - Math.abs(num(a, 'x2') - num(a, 'x1')); });
  return ls[0];
}
// その点で一番手前にある枠 (overlay は後に足したものが手前)
function topHit(overlayEl, x, y) {
  var rs = Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type]')).filter(function(r) {
    return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
  });
  var r = rs[rs.length - 1];
  return r ? r.getAttribute('data-type') + ':' + r.getAttribute('data-line') : null;
}

describe('BLK-migrator-20260929-2158 newpage の境目の破線に newpage の行の枠', function() {
  test('最小例: 1 枚目の下端の破線の左・中・右のどこでも newpage (3 行目) の枠', function() {
    var f = load('seq-newpage-min');
    var rule = pageRule(f.svgEl);
    expect(!!rule).toBe(true);
    var y = num(rule, 'y1'), x1 = Math.min(num(rule, 'x1'), num(rule, 'x2')), x2 = Math.max(num(rule, 'x1'), num(rule, 'x2'));
    [x1 + 2, (x1 + x2) / 2, x2 - 2].forEach(function(x) {
      expect(topHit(f.overlayEl, x, y)).toBe('source-line:3');
    });
    var r = f.overlayEl.querySelector('rect[data-src-kind="newpage"]');
    expect(r.getAttribute('data-id')).toBe('src:newpage@3');
    // メッセージの枠は今までどおり 2 行目
    expect(f.overlayEl.querySelectorAll('rect[data-type="message"][data-line="2"]').length).toBeGreaterThan(0);
  });

  test('seq-42 (見出し付き newpage・group・autonumber): 破線は 14 行目、group の中の応答の破線は 12 行目のまま', function() {
    var f = load('seq-42-autonumber-in-groups-newpage');
    var rule = pageRule(f.svgEl);
    var y = num(rule, 'y1'), x1 = Math.min(num(rule, 'x1'), num(rule, 'x2')), x2 = Math.max(num(rule, 'x1'), num(rule, 'x2'));
    [x1 + 2, (x1 + x2) / 2, x2 - 2].forEach(function(x) {
      expect(topHit(f.overlayEl, x, y)).toBe('source-line:14');
    });
    expect(f.overlayEl.querySelectorAll('rect[data-src-kind="newpage"]').length).toBe(1);
    ['7', '8', '11', '12'].forEach(function(line) {
      expect(f.overlayEl.querySelectorAll('rect[data-type="message"][data-line="' + line + '"]').length).toBeGreaterThan(0);
    });
    var u = f.res.unmatched || {};
    expect((u.participant || 0) + (u.message || 0)).toBe(0);
  });

  test('newpage の無い図・枠の else の点線・応答の破線は拾わない', function() {
    ['seq-ref-divider-delay', 'seq-definelong-retry'].forEach(function(name) {
      if (!fs.existsSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'))) return;
      var f = load(name);
      expect(f.overlayEl.querySelectorAll('rect[data-src-kind="newpage"]').length).toBe(0);
    });
    // alt / else の図: else の点線は枠の中なので区切りにしない
    var dsl = ['@startuml', 'A -> B : x', 'alt ok', 'A -> B : y', 'else ng', 'B --> A : z', 'end', 'newpage', 'A -> B : w', '@enduml'].join('\n');
    var svg = fs.readFileSync(path.join(__dirname, 'fixtures/svg/seq-newpage-alt.svg'), 'utf8');
    var div = document.createElement('div');
    div.innerHTML = svg;
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(div.querySelector('svg'), seq.parseSequence(dsl), overlayEl, dsl);
    var np = overlayEl.querySelectorAll('rect[data-src-kind="newpage"]');
    expect(np.length).toBe(1);
    expect(np[0].getAttribute('data-line')).toBe('8');
  });
});
