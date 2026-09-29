'use strict';
// BLK-migrator-20260918-0549: 書式指定つき autonumber を使う実物の sequence 図。
//
// migrator の実物 (seq-05-autonumber-format.puml) は `autonumber 10 5 "<b>[000]"` の形で
// 採番している。GUI はこの行を採番行として読めておらず、
//   - 図の設定は「(番号なし)」と出る (実際は採番されている)
//   - そこで「番号を振る」を触ると 2 本目の `autonumber` 行が入り、実物の採番が勝手に変わる
// という状態だった。ここでは書式つきの行を読めること、開始・増分を触っても書式が
// 消えないこと、そしてこの図でホバーの選択枠が全要素に出ることを守る。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// 既に window があるならそれを使う。差し替えると、先に require 済みのモジュールが
// 古い window に登録されたままになり、この後に走るテストが window.MA.* を見失う。
if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
}

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var AN = global.window.MA.sequenceAutonumber;
var seq = global.window.MA.modules.plantumlSequence;
var overlay = global.window.MA.sequenceOverlay;

var FMT = 'autonumber 10 5 "<b>[000]"';

describe('書式指定つき autonumber を採番行として読む', function() {
  test('開始・増分・書式を読む', function() {
    var r = AN.read('@startuml\n' + FMT + '\nA -> B : x\n@enduml');
    expect(r.on).toBe(true);
    expect(r.start).toBe(10);
    expect(r.step).toBe(5);
    expect(r.format).toBe('<b>[000]');
    expect(r.line).toBe(2);
  });

  test('書式だけの `autonumber "..."` も読む', function() {
    var r = AN.read('@startuml\nautonumber "<b>[000]"\n@enduml');
    expect(r.on).toBe(true);
    expect(r.start).toBe(1);
    expect(r.step).toBe(1);
    expect(r.format).toBe('<b>[000]');
  });

  test('書式の無い今までの形は今まで通り読める', function() {
    expect(AN.read('@startuml\nautonumber\n@enduml').format).toBe('');
    var r = AN.read('@startuml\nautonumber 10 5\n@enduml');
    expect(r.start).toBe(10);
    expect(r.step).toBe(5);
    expect(r.format).toBe('');
  });

  test('stop / resume / inc は設定行として拾わない', function() {
    ['autonumber stop', 'autonumber resume', 'autonumber inc A'].forEach(function(l) {
      expect(AN.isAutonumberLine(l)).toBe(false);
    });
    expect(AN.isAutonumberLine(FMT)).toBe(true);
  });
});

describe('書式は触らない限り消えない', function() {
  var DSL = '@startuml\n' + FMT + '\nparticipant App\nApp -> Rte : x\n@enduml';

  test('開始番号を変えても書式はそのまま残る', function() {
    var out = AN.apply(DSL, { on: true, start: 20, step: 5 });
    expect(out).toContain('autonumber 20 5 "<b>[000]"');
    // 行は 1 本のまま。2 本目が入ると実物の採番が変わる
    expect(out.split('\n').filter(function(l) { return /^\s*autonumber\b/.test(l); }).length).toBe(1);
  });

  test('書式つきの図で「番号を振る」が既に入だと分かる (2 本目を足さない)', function() {
    // on のまま何も変えなければ DSL は 1 文字も動かない
    expect(AN.apply(DSL, { on: true, start: 10, step: 5 })).toBe(DSL);
  });

  test('明示的に書式を外したいときは空文字で外せる', function() {
    var out = AN.apply(DSL, { on: true, start: 10, step: 5, format: '' });
    expect(out).toContain('autonumber 10 5\n');
    expect(out).not.toContain('<b>[000]');
  });

  test('off にすれば書式つきの行ごと消える', function() {
    var out = AN.apply(DSL, { on: false });
    expect(out).not.toContain('autonumber');
  });

  test('fmtLine は書式を末尾に付ける', function() {
    expect(AN.fmtLine(10, 5, '<b>[000]')).toBe('autonumber 10 5 "<b>[000]"');
    expect(AN.fmtLine(1, 1, '<b>[000]')).toBe('autonumber "<b>[000]"');
    expect(AN.fmtLine(10, 1, '')).toBe('autonumber 10');
    expect(AN.fmtLine(1, 1)).toBe('autonumber');
  });
});

describe('パーサも書式つきを採番ありとして読む', function() {
  test('meta.autonumber が開始・増分・書式を持つ', function() {
    var p = seq.parseSequence('@startuml\n' + FMT + '\nparticipant App\nApp -> Rte : x\n@enduml');
    expect(!!p.meta.autonumber).toBe(true);
    expect(p.meta.autonumber.start).toBe(10);
    expect(p.meta.autonumber.step).toBe(5);
    expect(p.meta.autonumber.format).toBe('<b>[000]');
  });

  test('`autonumber stop` は採番なし、`resume` は採番あり', function() {
    var stop = seq.parseSequence('@startuml\nautonumber stop\nA -> B : x\n@enduml');
    expect(stop.meta.autonumber).toBe(false);
    var res = seq.parseSequence('@startuml\nautonumber resume\nA -> B : x\n@enduml');
    expect(!!res.meta.autonumber).toBe(true);
  });
});

describe('書式指定つき autonumber の図でも選択枠が出る', function() {
  // migrator の実物 seq-05-autonumber-format.puml をそのまま使う。
  function loadFixture(name) {
    var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
    var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8');
    var div = document.createElement('div');
    div.innerHTML = svgText;
    return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText) };
  }

  test('参加者・ライフライン・メッセージの枠が 1 件も欠けない', function() {
    var f = loadFixture('sequence-autonumber-format');
    var out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, out);

    var parts = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    var msgs = f.parsed.relations.length;
    expect(parts.length).toBe(2);
    expect(msgs).toBe(8);

    // 参加者は head + tail の 2 枠ずつ。data-id の unique 数で人数を見る
    var partShapes = out.querySelectorAll('[data-type="participant"]');
    var ids = {};
    Array.prototype.forEach.call(partShapes, function(s) { ids[s.getAttribute('data-id')] = true; });
    expect(Object.keys(ids).length).toBe(parts.length);

    // メッセージは 1 本につき 1 枠。書式つきの番号 ([010]) があっても取りこぼさない
    expect(out.querySelectorAll('[data-type="message"]').length).toBe(msgs);
    expect(out.querySelectorAll('[data-type="lifeline"]:not([data-front])').length).toBe(parts.length);
  });

  test('枠はどれも行番号を持ち、押せば DSL の行に戻れる', function() {
    var f = loadFixture('sequence-autonumber-format');
    var out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, out);
    var msgShapes = out.querySelectorAll('[data-type="message"]');
    expect(msgShapes.length).toBeGreaterThan(0);
    Array.prototype.forEach.call(msgShapes, function(s) {
      var ln = parseInt(s.getAttribute('data-line'), 10);
      expect(isNaN(ln)).toBe(false);
      expect(ln).toBeGreaterThan(0);
    });
  });
});

// このファイルは他のテストより先に走り、sequence 系のモジュールを require する。
// require キャッシュに残したままだと、後から自前の window を作るテスト
// (sequence-overlay.test.js) で IIFE が再実行されず window.MA.* が空になる。
// 使い終わったらキャッシュを落とし、次のファイルが自分の window に登録し直せるようにする。
[
  'core/html-utils', 'core/dsl-utils', 'core/note-edit', 'core/regex-parts',
  'core/id-normalizer', 'core/dsl-updater', 'core/text-updater', 'core/parser-utils',
  'core/line-resolver', 'core/overlay-builder', 'core/selection-router',
  'core/sequence-participant-zone', 'core/sequence-autonumber',
  'modules/sequence', 'ui/sequence-overlay',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/' + m + '.js')]; } catch (e) {}
});
