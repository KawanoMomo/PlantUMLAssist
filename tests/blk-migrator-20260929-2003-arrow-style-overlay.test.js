'use strict';
// BLK-migrator-20260929-2003: 書式付きの矢印 (`-[bold]>` `-[dashed]>` `-[#red,bold]>` `--[#green]>`) のメッセージに枠が出ない。
// 書式だけの図では参加者を含む全要素に枠が出なかった (読めない 1 行にしか出てこない参加者が一覧から消えていた)。
// fixtures は同梱 jar (1.2026.8) の出力そのもの。描かれた文字ごとに、その上で出る枠を確かめる。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window || !global.window.document) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
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
  'sequence-autonumber', 'sequence-activation-insert',
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

function svgOf(name) {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  return div.querySelector('svg');
}
function dslOf(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8').split(String.fromCharCode(13)).join('');
}
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function covers(r, x, y) {
  return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
}
function hitAt(o, x, y) {
  var all = Array.prototype.slice.call(o.querySelectorAll('rect[data-type]')).filter(function(r) {
    return !r.hasAttribute('data-front') && covers(r, x, y);
  });
  var r = all.length ? all[all.length - 1] : null;
  return r ? r.getAttribute('data-type') + '@' + r.getAttribute('data-line') : 'none';
}
// 描かれた文字ごとに「文字=出る枠」。同じ文字が 2 つ (参加者の頭と足) あれば両方並ぶ。
function hits(name) {
  var svgEl = svgOf(name), dsl = dslOf(name);
  var o = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(svgEl, seq.parseSequence(dsl), o, dsl);
  return Array.prototype.map.call(svgEl.querySelectorAll('text'), function(t) {
    return t.textContent + '=' + hitAt(o, num(t, 'x') + 3, num(t, 'y') - 4);
  });
}

// 横の線 (メッセージの矢印の線) の中点で出る枠。自分へのメッセージは線が 2 本。
function lineHits(name) {
  var svgEl = svgOf(name), dsl = dslOf(name);
  var o = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(svgEl, seq.parseSequence(dsl), o, dsl);
  return Array.prototype.filter.call(svgEl.querySelectorAll('line'), function(l) { return num(l, 'y1') === num(l, 'y2'); })
    .map(function(l) { return hitAt(o, (num(l, 'x1') + num(l, 'x2')) / 2, num(l, 'y1')); });
}

describe('BLK-migrator-20260929-2003: 書式付きの矢印のメッセージと、その図の参加者に枠が出る', function() {
  var HEADS = ['A=participant@2', 'B=participant@2', 'A=participant@2', 'B=participant@2'];
  test('最小再現 -[bold]> / -[dashed]> / -[#red,bold]> だけの図: 参加者の頭・足と本文・線のすべてに枠', function() {
    expect(hits('arrow-style-bold')).toEqual(HEADS.concat(['太=message@2']));
    expect(hits('arrow-style-dashed')).toEqual(HEADS.concat(['破=message@2']));
    expect(hits('arrow-style-red-bold')).toEqual(HEADS.concat(['赤太=message@2']));
    ['arrow-style-bold', 'arrow-style-dashed', 'arrow-style-red-bold'].forEach(function(n) {
      expect(lineHits(n)).toEqual(['message@2']);
    });
  });
  test('最小再現 --[#green]> (2 本目の - の後ろの色): 残数の文字と線に 3 行目の枠', function() {
    expect(hits('arrow-style-green-second')).toEqual(HEADS.concat(['x=message@2', '残数=message@3']));
    expect(lineHits('arrow-style-green-second')).toEqual(['message@2', 'message@3']);
  });
  test('seq-38 (実物): 題・参加者・全メッセージの文字と線に本人の行の枠', function() {
    expect(hits('seq-38-incoming-outgoing-color')).toEqual([
      '受注 API の外部入出力=title@3', '受注 API=participant@4', '在庫 DB=participant@5', '受注 API=participant@4', '在庫 DB=participant@5',
      'POST /orders=message@6', '在庫確認=message@8', '残数 12=message@9', '引当=message@10', '監査ログ出力=message@11',
      '統計更新=message@12', '202 Accepted=message@13', '非同期通知の予約=message@14',
    ]);
    expect(lineHits('seq-38-incoming-outgoing-color')).toEqual([
      'message@6', 'message@8', 'message@9', 'message@10', 'message@11', 'message@12', 'message@13', 'message@14', 'message@14',
    ]);
  });
});
