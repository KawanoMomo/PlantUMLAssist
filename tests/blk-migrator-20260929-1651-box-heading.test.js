'use strict';
// BLK-migrator-20260929-1651: `skinparam ParticipantPadding` のあるシーケンス図で、box「受注系」の見出しにホバーしても枠が出なかった。
// PlantUML は古い skinparam を使うと図の先頭に警告の帯 (枠線つきの rect +「Please use CSS style instead of skinparam …」) を描く。
// 囲みの rect を「参加者より前に出る枠線つきの rect」の並び順で DSL の box に対応させていたので、1 番目の box の当たりが
// 警告の帯 (y=8〜26) に置かれ、見出しの文字 (y≈34〜48) から外れていた。囲みはライフラインの上端を包む rect として見分ける。
// fixtures/svg/v1-2026-8-seq-box-*.svg は同名の fixtures/dsl/*.puml を PlantUML 1.2026.8 で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var MODS = [
  '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/note-edit.js', '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js', '../src/core/dsl-updater.js', '../src/core/text-updater.js',
  '../src/core/parser-utils.js', '../src/core/line-resolver.js', '../src/core/overlay-builder.js',
  '../src/core/selection-router.js', '../src/core/sequence-participant-zone.js', '../src/core/sequence-autonumber.js',
  '../src/core/sequence-activation-insert.js', '../src/modules/sequence.js', '../src/ui/sequence-overlay.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { try { require(m); } catch (e) {} });

var SEQ = global.window.MA.modules.plantumlSequence;
var SO = global.window.MA.sequenceOverlay;
var FIX = path.join(__dirname, 'fixtures');

function boxRects(name) {
  var dsl = fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-seq-box-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = global.document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-seq-box-' + name + '.svg'), 'utf8');
  var ov = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  SO.buildSequenceOverlay(div.querySelector('svg'), SEQ.parseSequence(dsl), ov, dsl);
  return Array.prototype.map.call(ov.querySelectorAll('rect[data-type="box"]'), function(r) {
    return { y: parseFloat(r.getAttribute('y')), h: parseFloat(r.getAttribute('height')), line: r.getAttribute('data-line') };
  });
}

describe('BLK-migrator-20260929-1651 囲みの見出しは警告の帯でなく囲みに当てる', function() {
  test('ParticipantPadding あり: box の当たりは囲みの rect (y=34.057) から始まり、見出しの文字 (基線 y=47.552) を覆う', function() {
    var r = boxRects('pad');
    expect(r.length).toBe(1);
    expect(r[0].line).toBe('3');
    expect(Math.abs(r[0].y - 34.057) < 0.01).toBe(true);
    expect(r[0].y + r[0].h > 47.552).toBe(true);
  });
  test('ParticipantPadding なし: 今までどおり囲みの上端に当たる', function() {
    var r = boxRects('nopad');
    expect(r.length).toBe(1);
    expect(r[0].line).toBe('2');
    var svg = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-seq-box-nopad.svg'), 'utf8');
    var m = svg.match(/<rect x="[\d.]+" y="([\d.]+)"[^>]*fill="#EEF6FF"/);
    expect(!!m).toBe(true);
    expect(Math.abs(r[0].y - parseFloat(m[1])) < 0.01).toBe(true);
  });
});

if (_prevWindow !== undefined) global.window = _prevWindow;
if (_prevDocument !== undefined) global.document = _prevDocument;
