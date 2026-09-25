'use strict';
// BLK-migrator-20260925-1800: 途中で `create` / `**` した参加者のある sequence 図で、その参加者の頭より上のメッセージの文字に
// 枠が出なかった (corpus の seq-11 の internal_alloc()・force_cleanup()・done、seq-12 の validate()・new(config))。
// 1.2026.8 からは sequence 図が全て class の無い SVG で描かれ、メッセージの文字を探す床を「全参加者の頭の下端の最大」で
// 決めていた。途中で作られた参加者の頭はそのメッセージの高さに描かれるので床が下がり、それより上の文字が拾われなかった。
// 直し方: 床は最初の矢印より上にある頭の下端だけで決める。
// fixtures/svg/seq-created-head-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar (1.2026.8) で描いたもの
// (11 / 12 = persona-data の corpus/seq-11-activate-deactivate-destroy.puml / seq-12-return-and-create.puml)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
var document = dom.window.document;

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber', 'sequence-activation-insert',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
['../src/modules/sequence.js', '../src/ui/sequence-overlay.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});

var W = global.window;
var seq = W.MA.modules.plantumlSequence;
var SO = W.MA.sequenceOverlay;

function build(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures', 'svg', name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures', 'dsl', name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var host = document.createElement('div');
  host.innerHTML = svgText.replace(/^<\?[^>]*\?>/, '');
  var svgEl = host.querySelector('svg');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = SO.buildSequenceOverlay(svgEl, seq.parseSequence(dsl), overlayEl, dsl);
  return { svgEl: svgEl, overlayEl: overlayEl, res: res };
}
// 描かれた文字 (label) の中ほどを指したとき、一番手前にあるメッセージの枠の行。
function msgLineAtLabel(f, label) {
  var t = Array.prototype.find.call(f.svgEl.querySelectorAll('text'), function(n) { return n.textContent.trim() === label; });
  if (!t) return 'no-text:' + label;
  var x = parseFloat(t.getAttribute('x')) + (parseFloat(t.getAttribute('textLength')) || 10) / 2;
  var y = parseFloat(t.getAttribute('y')) - 4;
  var hit = null;
  Array.prototype.forEach.call(f.overlayEl.querySelectorAll('rect[data-type="message"]'), function(r) {
    var rx = parseFloat(r.getAttribute('x')), ry = parseFloat(r.getAttribute('y'));
    var rw = parseFloat(r.getAttribute('width')), rh = parseFloat(r.getAttribute('height'));
    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) hit = Number(r.getAttribute('data-line'));
  });
  return hit;
}

describe('BLK-migrator-20260925-1800: 途中で作られた参加者の頭より上のメッセージの文字にも本人の枠', function() {
  test('seq-12 (create participant): validate() と new(config) を含む全メッセージの文字に本人の行の枠', function() {
    var f = build('seq-created-head-12');
    expect(f.res.unmatched.message).toBe(0);
    [['validate()', 4], ['new(config)', 6], ['ok', 7], ['start()', 8], ['stop()', 12]].forEach(function(p) {
      expect(p[0] + '=' + msgLineAtLabel(f, p[0])).toBe(p[0] + '=' + p[1]);
    });
  });
  test('seq-11 (!! / destroy / create / **): internal_alloc()・force_cleanup()・done に本人の行の枠', function() {
    var f = build('seq-created-head-11');
    expect(f.res.unmatched.message).toBe(0);
    [['Session_Open()', 5], ['internal_alloc()', 6], ['handle', 7], ['Session_Close()', 8], ['force_cleanup()', 9],
      ['done', 11], ['Session_Reopen()', 13]].forEach(function(p) {
      expect(p[0] + '=' + msgLineAtLabel(f, p[0])).toBe(p[0] + '=' + p[1]);
    });
  });
  test('最初のメッセージが `**` で参加者を作る図・表示名つきの create でも、全メッセージの文字に本人の行の枠', function() {
    var f = build('seq-created-head-short');
    expect(f.res.unmatched.message).toBe(0);
    [['new()', 3], ['init()', 4], ['run()', 5], ['make()', 7], ['ready', 8]].forEach(function(p) {
      expect(p[0] + '=' + msgLineAtLabel(f, p[0])).toBe(p[0] + '=' + p[1]);
    });
  });
});

if (_prevWindow) global.window = _prevWindow;
if (_prevDocument) global.document = _prevDocument;
