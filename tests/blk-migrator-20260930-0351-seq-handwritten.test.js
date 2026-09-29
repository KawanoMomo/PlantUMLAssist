'use strict';
// BLK-migrator-20260930-0351: 手書き風 (`skinparam handwritten true` / `!option handwritten true`) のシーケンス図は、
// PlantUML が線を揺らして描く (<line> → 頂点の多い <path>、<rect> → 頂点の多い <polygon>)。形の種類で探す当て方が
// 全部外れ、参加者・ライフライン・メッセージ・枠のどれにも選択枠が出なかった。当て方を描いた図形の外形で読むように直した:
// 揺れた同じ図は、揺らさない同じ図と同じ種類・同じ行の枠を持つ。
// fixtures/svg/v1-2026-8-seq-handwritten*.svg は同名の fixtures/dsl/*.puml を PlantUML 1.2026.8 で描いたもの
// (-plain は同じ図から handwritten の行だけを除いたもの)。
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
  '../src/core/sequence-activation-insert.js', '../src/core/app-bridge.js',
  '../src/modules/sequence.js', '../src/ui/sequence-overlay.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { try { require(m); } catch (e) {} });

var window = global.window;
var document = global.document;
var SEQ = window.MA.modules.plantumlSequence;
var SO = window.MA.sequenceOverlay;
var FIX = path.join(__dirname, 'fixtures');

function build(name) {
  var dsl = fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-' + name + '.svg'), 'utf8');
  var svgEl = div.querySelector('svg');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = SO.buildSequenceOverlay(svgEl, SEQ.parseSequence(dsl), overlayEl, dsl);
  return { svgEl: svgEl, overlayEl: overlayEl, res: res, dsl: dsl };
}
// 枠の「種類:行」を数える (手前に出す補助の枠と、位置を持たない仮の枠は数えない)。
// shift: 手書き風の図は handwritten の行が 1 行多い。その行より後ろの行番号を 1 つ引いて、揺らさない図と比べる。
function kinds(f, hwLine) {
  var out = {};
  Array.prototype.forEach.call(f.overlayEl.querySelectorAll('rect[data-type], path[data-type]'), function(r) {
    if (r.hasAttribute('data-front')) return;
    if (r.tagName.toLowerCase() === 'rect' && !(parseFloat(r.getAttribute('width')) > 1)) return;
    var line = parseInt(r.getAttribute('data-line'), 10);
    if (hwLine && line > hwLine) line -= 1;
    var k = r.getAttribute('data-type') + ':' + line;
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}
function lineOf(dsl, re) {
  var ls = dsl.split('\n');
  for (var i = 0; i < ls.length; i++) if (re.test(ls[i])) return i + 1;
  return 0;
}

describe('手書き風のシーケンス図も、揺らさない同じ図と同じ枠を持つ', function() {
  test('seq-45 (monochrome・roundcorner・title・alt・note over): 参加者・ライフライン・メッセージ・alt・注釈の全部に枠', function() {
    var f = build('seq-handwritten');
    expect(f.res.unmatched).toEqual({ participant: 0, message: 0, note: 0, activation: 0, group: 0 });
    var k = kinds(f);
    ['participant:7', 'participant:8', 'lifeline:7', 'lifeline:8', 'message:9', 'message:11', 'message:13', 'group:10', 'note:15']
      .forEach(function(key) { expect(k[key] > 0).toBe(true); });
  });
  test('seq-45 の枠の種類と行は、handwritten を外した同じ図と一致する', function() {
    var hw = build('seq-handwritten');
    var plain = build('seq-handwritten-plain');
    expect(kinds(hw, lineOf(hw.dsl, /handwritten/))).toEqual(kinds(plain));
  });
  test('box・actor〜queue・帯・自分宛て・開いた矢じり・×・3 種の注釈・区切り・遅延・ref・loop・alt・create でも、揺らさない図と一致する', function() {
    var hw = build('seq-handwritten-rich');
    var plain = build('seq-handwritten-rich-plain');
    expect(hw.res.unmatched).toEqual(plain.res.unmatched);
    expect(kinds(hw, lineOf(hw.dsl, /handwritten/))).toEqual(kinds(plain));
  });
  test('!option handwritten true (案内文の帯なし) の最小の図でも、参加者 2 人・ライフライン・メッセージに枠', function() {
    var f = build('seq-handwritten-option');
    var k = kinds(f);
    expect(k['participant:3'] > 0 && k['participant:4'] > 0).toBe(true);
    expect(k['lifeline:3'] > 0 && k['lifeline:4'] > 0).toBe(true);
    expect(k['message:5']).toBe(1);
  });
  test('ライフラインの枠は揺れた点線の上端から下端まで (列の x に中心がある)', function() {
    var f = build('seq-handwritten-option');
    var r = f.overlayEl.querySelector('rect[data-type="lifeline"][data-line="3"]');
    var x = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
    var dashed = Array.prototype.filter.call(f.svgEl.querySelectorAll('path'), function(p) {
      return /dasharray/.test(p.getAttribute('style') || '');
    })[0];
    var x0 = parseFloat(/^M\s*(-?[\d.]+)/.exec(dashed.getAttribute('d'))[1]);
    expect(Math.abs(x - x0) < 0.01).toBe(true);
  });
  test('揺れた図形の無いふつうの図は、要素をそのまま読む (代わりの要素を作らない)', function() {
    var f = build('seq-handwritten-plain');
    var proxied = Array.prototype.filter.call(f.svgEl.querySelectorAll('*'), function(el) { return !!el.__puaProxy; });
    expect(proxied.length).toBe(0);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
