'use strict';
// BLK-migrator-20260929-1611: 対象を指す note の紙は、対象へ伸びる楔を含めて 1 本の path で描かれる (接続線は別に無い)。
// 楔の形の当たりを、紙の外形の path から全図種共通の 1 か所 (overlay-builder の addNoteTails) で置き、
// 楔の上を指しても note の枠 (同じ data-type / data-id / data-line) に当たる。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/overlay-builder.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var OB = global.window.MA.overlayBuilder;
var SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(html) {
  document.body.innerHTML = '';
  var div = document.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + html + '</svg>';
  document.body.appendChild(div);
  return div.querySelector('svg');
}

// PlantUML 1.2026.8 が `note right of Filter::apply` に出す裸の紙 (座標は実物から)。
var MEMBER_NOTE =
  '<g class="entity" data-qualified-name="Filter" data-source-line="1">' +
    '<rect x="7" y="7" width="128.703" height="65.609" fill="#F1F1F1"/>' +
  '</g>' +
  '<path d="M171,22 L171,31.176 L129.703,59.805 L171,39.176 L171,48.352 A0,0 0 0 0 171,48.352 L244,48.352 ' +
    'A0,0 0 0 0 244,48.352 L244,32 L234,22 L171,22 A0,0 0 0 0 171,22" fill="#FEFFDD"/>' +
  '<path d="M234,22 L234,32 L244,32 L234,22" fill="#FEFFDD"/>' +
  '<text x="177" y="40.495" font-size="13">移動平均</text>';

function overlayWith(rects) {
  var ov = document.createElementNS(SVG_NS, 'svg');
  rects.forEach(function(r) { OB.addRect(ov, r[0], r[1], r[2], r[3], r[4]); });
  return ov;
}

describe('BLK-migrator-20260929-1611 note の楔の当たり', function() {
  test('noteTails: 紙の矩形の外へ飛び出した頂点と、その前後の縁の頂点で楔の多角形を返す', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var paper = OB.notePapers(svg)[0];
    expect(!!paper).toBe(true);
    var tails = OB.noteTails(paper);
    expect(tails.length).toBe(1);
    expect(tails[0].map(function(q) { return [Math.round(q[0]), Math.round(q[1])]; }))
      .toEqual([[171, 31], [130, 60], [171, 39]]);
  });

  test('addNoteTails: 紙の枠 (本文だけの矩形) と同じ data-* を持つ楔の当たりを置き、楔の上の点がその note に当たる', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [7, 7, 128.703, 65.609, { 'data-type': 'class', 'data-id': 'Filter', 'data-line': '2' }],
      [171, 22, 73, 26.352, { 'data-type': 'note', 'data-id': '__n_0', 'data-line': '5', 'data-target-id': 'Filter' }],
    ]);
    expect(OB.addNoteTails(svg, ov)).toBe(1);
    var t = ov.querySelector('path.note-tail');
    expect(t.getAttribute('data-type')).toBe('note');
    expect(t.getAttribute('data-id')).toBe('__n_0');
    expect(t.getAttribute('data-line')).toBe('5');
    expect(t.getAttribute('data-target-id')).toBe('Filter');
    // 楔の根元と先の中ほど (起票の 25%・50% の点) は note、紙から離れた空所は当たらない
    var hit = OB.hitTestTopmost(ov, 160.7, 42.3);
    expect(hit && hit.getAttribute('data-type')).toBe('note');
    hit = OB.hitTestTopmost(ov, 150.4, 47.5);
    expect(hit && hit.getAttribute('data-type')).toBe('note');
    expect(OB.hitTestTopmost(ov, 150, 25)).toBeNull();
    // 細く伸びた楔の先の脇 (縁から 1px 外) は楔ではなくクラス
    hit = OB.hitTestTopmost(ov, 133.8, 55.4);
    expect(hit && hit.getAttribute('data-type')).toBe('class');
    // クラスの中 (楔の先から離れた所) は今までどおりクラス
    hit = OB.hitTestTopmost(ov, 60, 30);
    expect(hit && hit.getAttribute('data-type')).toBe('class');
  });

  test('addNoteTails: 楔が枠の中に収まっている note (枠が尖りまで覆う) には置かない', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [129.703, 22, 114.297, 37.805, { 'data-type': 'note', 'data-id': '__n_0', 'data-line': '5' }],
    ]);
    expect(OB.addNoteTails(svg, ov)).toBe(0);
  });

  test('addNoteTails: 紙に当てた枠が無ければ置かない (入れ物や図全体の枠を紙の枠と取り違えない)', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [0, 0, 400, 200, { 'data-type': 'package', 'data-id': 'P', 'data-line': '1' }],
    ]);
    expect(OB.addNoteTails(svg, ov)).toBe(0);
  });

  test('raiseSmallestLast: 楔の当たりも面積で並べ、覆う大きな枠より手前に置く', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [171, 22, 73, 26.352, { 'data-type': 'note', 'data-id': '__n_0', 'data-line': '5' }],
    ]);
    OB.addNoteTails(svg, ov);
    OB.addRect(ov, 100, 0, 200, 100, { 'data-type': 'package', 'data-id': 'P', 'data-line': '1' });
    OB.raiseSmallestLast(ov);
    var kids = Array.prototype.slice.call(ov.children);
    var iPkg = kids.findIndex(function(e) { return e.getAttribute('data-type') === 'package'; });
    var iTail = kids.findIndex(function(e) { return e.getAttribute('data-hit-kind') === 'notetail'; });
    expect(iTail > iPkg).toBe(true);
    // 縁の帯は並べ直しても最も奥 (背景の次)
    var iEdge = kids.findIndex(function(e) { return e.getAttribute('data-hit-kind') === 'notetailedge'; });
    expect(iEdge < iPkg).toBe(true);
  });

  // 差し戻し 1 回目: 楔の縁 (線に見える所) の上を指すと、内側の判定の境目で当たらなかった (class-19 の 25% の点)。
  test('縁の帯: 楔の縁に沿った細い帯を最も奥に置き、縁の上の点 (クラスの外) は note に当たる', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [7, 7, 128.703, 65.609, { 'data-type': 'class', 'data-id': 'Filter', 'data-line': '2' }],
      [171, 22, 73, 26.352, { 'data-type': 'note', 'data-id': '__n_0', 'data-line': '5' }],
    ]);
    OB.addBackground(ov);
    OB.addNoteTails(svg, ov);
    var edge = ov.querySelector('path[data-hit-kind="notetailedge"]');
    expect(!!edge).toBe(true);
    expect(edge.getAttribute('data-line')).toBe('5');
    expect(edge.getAttribute('fill')).toBe('none');
    expect(edge.style.pointerEvents).toBe('stroke');
    expect(edge.previousElementSibling.classList.contains('overlay-background')).toBe(true);
    // 縁の上ちょうど (171,31.176)→(129.703,59.805) の 25% の点
    var x = 171 + (129.703 - 171) * 0.25, y = 31.176 + (59.805 - 31.176) * 0.25;
    var hit = OB.hitTestTopmost(ov, x, y + 0.9);
    expect(hit && hit.getAttribute('data-type')).toBe('note');
    // 縁がクラスの枠に重なる所は今までどおりクラス (帯は奥なので勝たない)
    hit = OB.hitTestTopmost(ov, 131, 58.4);
    expect(hit && hit.getAttribute('data-type')).toBe('class');
    // 縁から離れた空所は当たらない
    expect(OB.hitTestTopmost(ov, 150, 25)).toBeNull();
  });

  // 再確認 2: 楔の上を指すと note 本体だけの枠が光り、指した点 (楔の 15%〜35%) が枠の外 30〜120px だった。
  test('枠: 楔込みの紙の外形を包む見た目だけの矩形を 1 枚置き、ホバーでは紙の枠の代わりにそれを光らせる (当たりは変えない)', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [7, 7, 128.703, 65.609, { 'data-type': 'class', 'data-id': 'Filter', 'data-line': '2' }],
      [171, 22, 73, 26.352, { 'data-type': 'note', 'data-id': '__n_0', 'data-line': '5' }],
    ]);
    OB.addNoteTails(svg, ov);
    var frames = ov.querySelectorAll('rect.note-frame');
    expect(frames.length).toBe(1);
    var f = frames[0];
    var box = ['x', 'y', 'width', 'height'].map(function(a) { return Math.round(parseFloat(f.getAttribute(a))); });
    // 楔の先 (129.703, 59.805) から紙の右下 (244, 48.352) まで
    expect(box).toEqual([130, 22, 114, 38]);
    expect(f.getAttribute('data-type')).toBe('note');
    expect(f.getAttribute('data-line')).toBe('5');
    expect(f.style.pointerEvents).toBe('none');
    expect(f.classList.contains('selectable')).toBe(false);
    // 楔の 15%・25%・35% の点が枠の内側
    [0.15, 0.25, 0.35].forEach(function(t) {
      var x = 171 + (129.703 - 171) * t, y = 35.176 + (59.805 - 35.176) * t;
      expect(x >= box[0] - 1 && x <= box[0] + box[2] + 1 && y >= box[1] - 1 && y <= box[1] + box[3] + 1).toBe(true);
    });
    // 当たりは今までどおり (枠は selectable でないので hitTestTopmost に出ない)
    var hit = OB.hitTestTopmost(ov, 60, 30);
    expect(hit && hit.getAttribute('data-type')).toBe('class');
    expect(OB.hitTestTopmost(ov, 150, 25)).toBeNull();
    // 光らせる矩形: 紙の枠を渡すと楔込みの枠に置き換わる。クラスの枠はそのまま
    var body = ov.querySelector('rect.selectable[data-type="note"]');
    var cls = ov.querySelector('rect.selectable[data-type="class"]');
    expect(OB.litRects(ov, [body])).toEqual([f]);
    expect(OB.litRects(ov, [cls])).toEqual([cls]);
    // 件数を数える selectable の note の枠は 1 枚のまま
    expect(ov.querySelectorAll('rect.selectable[data-type="note"]').length).toBe(1);
  });

  test('枠: 楔が紙の枠に収まる note には置かない', function() {
    var svg = makeSvg(MEMBER_NOTE);
    var ov = overlayWith([
      [129.703, 22, 114.297, 37.805, { 'data-type': 'note', 'data-id': '__n_0', 'data-line': '5' }],
    ]);
    OB.addNoteTails(svg, ov);
    expect(ov.querySelectorAll('rect.note-frame').length).toBe(0);
    var body = ov.querySelector('rect.selectable[data-type="note"]');
    expect(OB.litRects(ov, [body])).toEqual([body]);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
