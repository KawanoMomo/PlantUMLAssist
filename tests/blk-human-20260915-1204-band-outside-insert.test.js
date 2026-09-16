'use strict';
// BLK-human-20260915-1204: 実行中の帯 (activate〜deactivate) の「下」を押してメッセージを
// 足すと、帯が新しい矢印まで伸びて重なっていた。押した場所が帯の矩形の内か外かで
// 挿入先を変える。
//   - 帯の矩形の中を押した  → 今までどおり deactivate の前 (帯の中)
//   - 矩形より下のライフライン線を押した → deactivate を残したまま、その次の行
// 行番号だけでは両者が同じ行に見えるので、当たり判定 (hint) を resolve に渡して決める。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var prevWindow = global.window;
var prevDocument = global.document;
global.window = dom.window;
global.document = dom.window.document;

var SRC = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js',
  '../src/ui/properties.js',
  '../src/core/sequence-marks.js',
  '../src/core/sequence-activation-insert.js',
  '../src/modules/sequence.js',
  '../src/ui/sequence-overlay.js',
];
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var AI = window.MA.sequenceActivationInsert;
var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

//  1 @startuml
//  2 participant A
//  3 participant B
//  4 participant C
//  5 A -> B : req      ← 帯の trigger
//  6 activate B
//  7 B -> C : work
//  8 B --> A : res     ← 帯の中の最後のメッセージ
//  9 deactivate B
// 10 A -> B : next
// 11 @enduml
var BAND = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/sequence-band.puml'), 'utf8');

function svgFixture() {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(__dirname, 'fixtures/svg/sequence-band.svg'), 'utf8');
  return div.querySelector('svg');
}

function buildOverlayEl() {
  var svgEl = svgFixture();
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(svgEl, seq.parseSequence(BAND), overlayEl, BAND);
  return overlayEl;
}

describe('帯の矩形を SVG から拾う', function() {
  test('PlantUML が 2 回描く帯の矩形を 1 つに畳み、participant 名を持つ', function() {
    var bars = overlay.collectActivationBars(svgFixture());
    expect(bars.length).toBe(1);
    expect(bars[0].part).toBe('B');
    expect(bars[0].w).toBe(10);
  });

  test('ライフラインの当たり矩形と participant の頭/尻は帯に数えない', function() {
    var bars = overlay.collectActivationBars(svgFixture());
    bars.forEach(function(b) { expect(b.h > 20).toBe(true); });
  });

  test('拾った矩形を DSL の帯 (activate 6 / deactivate 9) に結び付ける', function() {
    var zones = overlay.bandZones(svgFixture(), BAND);
    expect(zones.length).toBe(1);
    expect(zones[0].band.activateLine).toBe(6);
    expect(zones[0].band.deactivateLine).toBe(9);
  });

  test('DSL を渡さなければ帯の枠を作らない (従来の呼び方を壊さない)', function() {
    var svgEl = svgFixture();
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svgEl, seq.parseSequence(BAND), el);
    expect(el.querySelectorAll('rect[data-type="band-zone"]').length).toBe(0);
  });

  test('帯の枠はクリックを取らない (帯の中でも挿入メニューが開く)', function() {
    var el = buildOverlayEl();
    var zones = el.querySelectorAll('rect[data-type="band-zone"]');
    expect(zones.length).toBe(1);
    expect(zones[0].style.pointerEvents).toBe('none');
    expect(zones[0].classList.contains('selectable')).toBe(false);
  });
});

describe('当たり判定 — 押した点が帯の内か外か', function() {
  // 帯の矩形: x 60.24 / y 69.96 / w 10 / h 60.70 → 下端 130.66。B のライフラインは y 179 まで。
  test('帯の矩形の中を押したら内側', function() {
    var z = overlay.resolveBandZone(buildOverlayEl(), 65, 100);
    expect(z.zone).toBe('inside');
    expect(z.bandLine).toBe(6);
  });

  test('矩形より下のライフライン線を押したら外側', function() {
    var z = overlay.resolveBandZone(buildOverlayEl(), 65, 150);
    expect(z.zone).toBe('outside');
    expect(z.bandLine).toBe(6);
  });

  test('矩形より上を押したら帯とは結び付けない', function() {
    expect(overlay.resolveBandZone(buildOverlayEl(), 65, 50)).toBe(null);
  });

  test('別の participant の列を押したら帯とは結び付けない', function() {
    expect(overlay.resolveBandZone(buildOverlayEl(), 15, 150)).toBe(null);
  });

  test('resolveInsertLine が当たり判定を hit に載せて返す', function() {
    var el = buildOverlayEl();
    var below = overlay.resolveInsertLine(el, 65, 150);
    expect(below.zone).toBe('outside');
    expect(below.bandLine).toBe(6);
    var within = overlay.resolveInsertLine(el, 65, 100);
    expect(within.zone).toBe('inside');
  });
});

describe('resolve — 帯の下を押したら帯を伸ばさない', function() {
  test('外側の hint があれば deactivate の後ろに入る', function() {
    var r = AI.resolve(BAND, 8, 'after', { zone: 'outside', bandLine: 6 });
    expect(r.target).toBe(10);
    expect(r.zone).toBe('outside');
    expect(r.part).toBe('B');
    expect(r.needsClose).toBe(false);
  });

  test('内側の hint なら今までどおり deactivate の前に入る', function() {
    var r = AI.resolve(BAND, 8, 'after', { zone: 'inside', bandLine: 6 });
    expect(r.target).toBe(9);
    expect(r.zone).toBe('inside');
  });

  test('hint が無いときの答えは変えない (DSL だけの呼び手を壊さない)', function() {
    expect(AI.resolve(BAND, 8, 'after').target).toBe(9);
    expect(AI.resolve(BAND, 8, 'after').zone).toBe('inside');
  });

  test('帯の末尾クリック・return 直後・入れ子のどれも hint で外へ抜ける', function() {
    // 入れ子: 2 つ目の帯 (C) の下を押しても、抜けるのは C の帯だけで B の帯には残る。
    var t = [
      '@startuml',      // 1
      'A -> B : req',   // 2
      'activate B',     // 3
      'B -> C : work',  // 4
      'activate C',     // 5
      'C --> B : ok',   // 6
      'deactivate C',   // 7
      'B --> A : res',  // 8
      'deactivate B',   // 9
      '@enduml',        // 10
    ].join('\n');
    var r = AI.resolve(t, 6, 'after', { zone: 'outside', bandLine: 5 });
    expect(r.target).toBe(8);     // deactivate C (7) の後ろ = まだ B の帯の中
    expect(r.part).toBe('C');
  });

  test('destroy で閉じた帯も閉じたまま、その後ろに入る', function() {
    var t = ['@startuml', 'A -> B : req', 'activate B', 'B -> B : work', 'destroy B', 'A -> C : next', '@enduml'].join('\n');
    var bands = AI.parseBands(t);
    expect(bands[0].closedBy).toBe('destroy');
    var r = AI.resolve(t, 4, 'after', { zone: 'outside', bandLine: 3 });
    expect(r.target).toBe(6);
    expect(r.zone).toBe('outside');
  });

  test('帯から離れた所を押した (hint 無し) なら行をずらさない', function() {
    var r = AI.resolve(BAND, 2, 'before');
    expect(r.zone).toBe('none');
    expect(r.moved).toBe(false);
  });
});

describe('省略記法 (++ / --) の帯も帯として読む', function() {
  //  1 @startuml
  //  2 A -> B ++ : req    ← activate の行が無い暗黙の帯
  //  3 B -> C : work
  //  4 B --> A -- : res   ← ここで閉じる
  //  5 A -> B : next
  //  6 @enduml
  var T = ['@startuml', 'A -> B ++ : req', 'B -> C : work', 'B --> A -- : res', 'A -> B : next', '@enduml'].join('\n');

  test('parseMessageLine が from / to と記法を読む', function() {
    var m = AI.parseMessageLine('A -> B ++ : req');
    expect(m.from).toBe('A');
    expect(m.to).toBe('B');
    expect(m.marks).toEqual(['++']);
    expect(AI.parseMessageLine('B --> A -- : res').marks).toEqual(['--']);
    expect(AI.parseMessageLine('A ->> B ++').to).toBe('B');
    expect(AI.parseMessageLine('A -> B : ふつうの本文').marks.length).toBe(0);
    expect(AI.parseMessageLine('activate B')).toBe(null);
  });

  test('++ の行が帯の始まり、-- の行が終わりになる', function() {
    var bands = AI.parseBands(T);
    expect(bands.length).toBe(1);
    expect(bands[0].target).toBe('B');
    expect(bands[0].activateLine).toBe(2);
    expect(bands[0].deactivateLine).toBe(4);
    expect(bands[0].shorthand).toBe(true);
  });

  test('省略記法の帯の下を押しても帯を伸ばさない', function() {
    var r = AI.resolve(T, 3, 'after', { zone: 'outside', bandLine: 2 });
    expect(r.target).toBe(5);
    expect(r.zone).toBe('outside');
  });
});

describe('閉じ忘れの帯 (deactivate が無い) の外側', function() {
  //  1 @startuml
  //  2 A -> B : req
  //  3 activate B
  //  4 B -> C : work
  //  5 @enduml
  var T = ['@startuml', 'A -> B : req', 'activate B', 'B -> C : work', '@enduml'].join('\n');

  test('@enduml の直前に置き、帯を閉じる必要があると伝える', function() {
    var r = AI.resolve(T, 4, 'after', { zone: 'outside', bandLine: 3 });
    expect(r.target).toBe(5);
    expect(r.needsClose).toBe(true);
    expect(r.part).toBe('B');
  });

  test('内側なら閉じる必要は出さない', function() {
    expect(AI.resolve(T, 4, 'after', { zone: 'inside', bandLine: 3 }).needsClose).toBe(false);
  });
});

describe('sequence モジュールの挿入行 (hint 付き)', function() {
  test('insertTargetLine が hint を見る', function() {
    expect(seq.insertTargetLine(8, 'after', BAND, { zone: 'outside', bandLine: 6 })).toBe(10);
    expect(seq.insertTargetLine(8, 'after', BAND, { zone: 'inside', bandLine: 6 })).toBe(9);
    expect(seq.insertTargetLine(8, 'after', BAND)).toBe(9);
  });

  test('ガイド線が押す前に「帯の内側 / 外側」を出し分ける', function() {
    expect(seq.describeInsertGuide(8, 'after', BAND, { zone: 'outside', bandLine: 6 }))
      .toBe('+ DSL 10 行目に挿入（帯の外側 · B）');
    expect(seq.describeInsertGuide(8, 'after', BAND, { zone: 'inside', bandLine: 6 }))
      .toBe('+ DSL 9 行目に挿入（帯の内側 · B）');
  });

  test('ピッカーの見出しにも同じ行き先が出る', function() {
    expect(seq.describeInsertTarget(8, 'after', BAND, { zone: 'outside', bandLine: 6 }))
      .toBe('DSL 10 行目に挿入（8 行目の後） · 帯の外側 · B');
  });
});

describe('実際に書き戻した DSL', function() {
  // 挿入そのものは insertBefore (text-updater) なので、resolve が返す行に
  // 素直に入ることを DSL の文字列で確かめる。
  function insertAt(text, target, line) {
    return window.MA.textUpdater.insertAtLine(text, target, line);
  }

  test('帯の下に足すと deactivate が残り、その下に新しい矢印が来る', function() {
    var r = AI.resolve(BAND, 8, 'after', { zone: 'outside', bandLine: 6 });
    var out = insertAt(BAND, r.target, 'A -> B : after').split('\n');
    expect(out[8]).toBe('deactivate B');   // 9 行目 = deactivate のまま
    expect(out[9]).toBe('A -> B : after'); // その次に新しい矢印
  });

  test('帯の中に足すと deactivate より前に入る', function() {
    var r = AI.resolve(BAND, 8, 'after', { zone: 'inside', bandLine: 6 });
    var out = insertAt(BAND, r.target, 'B -> C : more').split('\n');
    expect(out[8]).toBe('B -> C : more');
    expect(out[9]).toBe('deactivate B');
  });

  test('閉じ忘れの帯の外側は deactivate を足してから矢印を置く', function() {
    var t = ['@startuml', 'A -> B : req', 'activate B', 'B -> C : work', '@enduml'].join('\n');
    var r = AI.resolve(t, 4, 'after', { zone: 'outside', bandLine: 3 });
    expect(r.needsClose).toBe(true);
    var out = insertAt(insertAt(t, r.target, 'deactivate B'), r.target + 1, 'A -> B : next').split('\n');
    expect(out[4]).toBe('deactivate B');
    expect(out[5]).toBe('A -> B : next');
    expect(out[6]).toBe('@enduml');
  });
});

describe('BLK-human-20260915-1204 差し戻し: 帯の最後の要素の後に足すときの 2 択', function() {
  var T = ['@startuml', 'A -> B : req', 'activate B', 'B -> C : work', 'B --> A : res', 'deactivate B', '@enduml'].join('\n');
  test('帯の最後のメッセージの後ろは bandEndAfter が帯を返す', function() {
    var b = seq.bandEndAfter(T, 5);
    expect(b).not.toBe(null);
    expect(b.activateLine).toBe(3);
  });
  test('帯の途中のメッセージの後ろは 2 択にしない', function() {
    expect(seq.bandEndAfter(T, 4)).toBe(null);
  });
  test('既定 (outside) を選ぶと deactivate の後ろ、inside を選ぶと deactivate の前', function() {
    expect(AI.resolve(T, 5, 'after', { zone: 'outside', bandLine: 3 }).target).toBe(7);
    expect(AI.resolve(T, 5, 'after', { zone: 'inside', bandLine: 3 }).target).toBe(6);
  });
  test('帯が図の最後で deactivate が無いときも 2 択になり、外側は閉じてから置く', function() {
    var t = ['@startuml', 'A -> B : req', 'activate B', 'B --> A : res', '@enduml'].join('\n');
    var b = seq.bandEndAfter(t, 4);
    expect(b).not.toBe(null);
    expect(AI.resolve(t, 4, 'after', { zone: 'outside', bandLine: 3 }).needsClose).toBe(true);
  });
  test('++ の省略記法の帯も 2 択になる', function() {
    var t = ['@startuml', 'A -> B ++ : req', 'B -> C : work', 'B --> A -- : res', '@enduml'].join('\n');
    expect(seq.bandEndAfter(t, 3)).not.toBe(null);
    expect(AI.resolve(t, 3, 'after', { zone: 'outside', bandLine: 2 }).target).toBe(5);
  });
  test('return は帯を閉じる', function() {
    var t = ['@startuml', 'A -> B : req', 'activate B', 'B -> C : work', 'return done', 'A -> B : next', '@enduml'].join('\n');
    var bands = AI.parseBands(t);
    expect(bands.length).toBe(1);
    expect(bands[0].deactivateLine).toBe(5);
    expect(bands[0].closedBy).toBe('return');
    expect(seq.bandEndAfter(t, 4)).not.toBe(null);
    expect(AI.resolve(t, 4, 'after', { zone: 'outside', bandLine: 3 }).target).toBe(6);
  });
});

// sequence-activation-insert.test.js と同じ後始末。require キャッシュを落としておかないと、
// 後から走るテスト (sequence-overlay.test.js) が自分の jsdom window にモジュールを
// 登録し直せない (IIFE が再実行されない)。
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
global.window = prevWindow;
global.document = prevDocument;
