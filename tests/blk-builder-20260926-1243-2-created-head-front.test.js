'use strict';
// BLK-builder-20260926-1243-2: `create` / `**` で作った参加者の頭は、それを作るメッセージの高さに描かれ、
// メッセージの枠 (矢印と文言の和) の中に入る。メッセージの枠が手前にあったため、作った参加者の頭
// (corpus seq-11 の 2 度目の「Session Manager」、seq-12 の「Instance」) を指すとメッセージの枠が出ていた。
// メッセージの枠と重なる参加者の枠だけをメッセージより手前 (後) に置く。重ならない頭は動かさない。
var fs = require('fs');
var path = require('path');
if (!global.window || !global.document) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'sequence-overlay.js'), 'utf-8');
function extract(name) {
  var start = SRC.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' が sequence-overlay.js に無い');
  var depth = 0, i = SRC.indexOf('{', start);
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}
// eslint-disable-next-line no-new-func
var raise = new Function(extract('_raiseHeadsOverMessages') + '\nreturn _raiseHeadsOverMessages;')();

function overlay(rects) {
  var doc = global.document || global.window.document;
  var ov = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rects.forEach(function(a) {
    var r = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('data-type', a[0]);
    r.setAttribute('data-id', a[1]);
    r.setAttribute('x', a[2]); r.setAttribute('y', a[3]); r.setAttribute('width', a[4]); r.setAttribute('height', a[5]);
    ov.appendChild(r);
  });
  return ov;
}
function order(ov) {
  return Array.prototype.map.call(ov.children, function(r) { return r.getAttribute('data-type') + ':' + r.getAttribute('data-id'); });
}

describe('_raiseHeadsOverMessages — 作った参加者の頭はメッセージより手前', function() {
  test('メッセージの枠と重なる頭 (create した参加者) だけがメッセージより後ろ (手前) へ移る', function() {
    // seq-12 の形: Factory の頭は上端、Inst の頭はメッセージ new(config) の高さに描かれ、矢印と文言の枠が頭に食い込む
    var ov = overlay([
      ['participant', 'Factory', 40, 10, 60, 30],
      ['participant', 'Inst', 250, 120, 70, 32],
      ['lifeline', 'Factory', 64, 40, 12, 300],
      ['message', '__m_1', 70, 120, 200, 33],
      ['message', '__m_2', 70, 170, 230, 33],
    ]);
    raise(ov);
    expect(order(ov)).toEqual([
      'participant:Factory', 'lifeline:Factory', 'message:__m_1', 'message:__m_2', 'participant:Inst',
    ]);
  });

  test('メッセージと重ならない頭は元の位置のまま (メッセージが無ければ何もしない)', function() {
    var ov = overlay([
      ['participant', 'A', 0, 0, 50, 30],
      ['participant', 'B', 100, 0, 50, 30],
      ['message', '__m_1', 20, 60, 110, 30],
    ]);
    raise(ov);
    expect(order(ov)).toEqual(['participant:A', 'participant:B', 'message:__m_1']);
    var none = overlay([['participant', 'A', 0, 0, 50, 30], ['lifeline', 'A', 20, 30, 12, 100]]);
    raise(none);
    expect(order(none)).toEqual(['participant:A', 'lifeline:A']);
  });
});
