'use strict';
// BLK-migrator-20260918-0249: component 図で方向指定の矢印 (-right->/-left->/-up->/-down->)
// を含むと、ホバーの選択枠が 1 つも出なかった。
// 原因は 2 つ。(1) 関係行の矢印トークンに方向 (up/down/left/right) と <--> が入っておらず、
// その行が関係として読めない。(2) `[X] --> [Y]` のように角括弧だけで書かれた部品は
// どこにも `[X]` 単独の宣言が無く、要素として拾われない (PlantUML は暗黙に描く)。
// どちらも直して、方向指定の有無にかかわらず描かれている要素・関係に枠が出るようにする。
// overlay の rect は overlay-builder が `document` で作る。共通ランナーの document は
// スタブなので、この 1 ファイルの中だけ jsdom を渡して src を評価し直す。
// require は使わない (require.cache に載せると後続のテストがこちらの window に
// 載った版を掴む)。global の window/document にも触らないので外へは漏れない。
// 読む順番はランナーの sourceFiles をそのまま使い、二重管理しない。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');

var runnerSrc = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf-8');
var listBlock = runnerSrc.slice(runnerSrc.indexOf('const sourceFiles = ['));
listBlock = listBlock.slice(0, listBlock.indexOf('];'));
var envNames = ['window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame',
  'setTimeout', 'clearTimeout', 'alert', 'confirm', '__exportForTest'];
var envVals = [dom.window, dom.window.document,
  { getItem: function() { return null; }, setItem: function() {} },
  { clipboard: {} },
  function(cb) { cb(); }, function(cb) { cb(); }, function() {},
  function() {}, function() { return true; }, function() {}];
(listBlock.match(/'([^']+\.js)'/g) || []).forEach(function(q) {
  var abs = path.join(__dirname, '..', q.slice(1, -1));
  if (!fs.existsSync(abs)) return;
  try {
    var fn = Function.apply(null, envNames.concat([fs.readFileSync(abs, 'utf-8')]));
    fn.apply(null, envVals);
  } catch (e) { /* GUI 専用の script は DOM 待ちで落ちうる。parse/overlay には要らない */ }
});

var W = dom.window;
var co = W.MA.modules.plantumlComponent;
var RO = W.MA.relationOptions;
var D = dom.window.document;

var DSL = [
  '@startuml',
  '[SensorMgr] --> [FilterMgr]',
  '[FilterMgr] ..> [ActuatorMgr] : depends',
  '[ActuatorMgr] <--> [SafetyMonitor]',
  '[SafetyMonitor] -up-> [Logger]',
  '[Logger] -down-> [DiagPort]',
  '[SensorMgr] -right-> [SafetyMonitor] : 監視',
  '[DiagPort] -left-> [SensorMgr] : フィードバック',
  'note right of [SafetyMonitor] : 監視周期は5ms',
  '@enduml',
].join('\n');

function ids(parsed) {
  return parsed.elements.map(function(e) { return e.id; });
}

describe('方向指定の矢印を含む component 図', function() {
  test('角括弧だけで書かれた部品が要素として出る', function() {
    var p = co.parse(DSL);
    var got = ids(p).sort();
    expect(got).toEqual(
      ['ActuatorMgr', 'DiagPort', 'FilterMgr', 'Logger', 'SafetyMonitor', 'SensorMgr']);
    p.elements.forEach(function(e) { expect(e.kind).toBe('component'); });
  });

  test('方向指定の矢印も関係として読める', function() {
    var rels = co.parse(DSL).relations;
    expect(rels.length).toBe(7);
    var pairs = rels.map(function(r) { return r.from + '>' + r.to; });
    expect(pairs).toContain('SafetyMonitor>Logger');
    expect(pairs).toContain('Logger>DiagPort');
    expect(pairs).toContain('SensorMgr>SafetyMonitor');
    expect(pairs).toContain('DiagPort>SensorMgr');
    expect(pairs).toContain('ActuatorMgr>SafetyMonitor');
  });

  test('線の種類は方向を付けても変わらない (実線=association / 破線=dependency)', function() {
    var by = {};
    co.parse(DSL).relations.forEach(function(r) { by[r.from + '>' + r.to] = r; });
    expect(by['FilterMgr>ActuatorMgr'].kind).toBe('dependency');
    expect(by['SensorMgr>SafetyMonitor'].kind).toBe('association');
    expect(by['SensorMgr>SafetyMonitor'].label).toBe('監視');
    expect(by['DiagPort>SensorMgr'].label).toBe('フィードバック');
  });

  test('note 行は関係として読まない', function() {
    var rels = co.parse(DSL).relations;
    rels.forEach(function(r) { expect(r.from).not.toBe('note'); });
  });

  test('明示宣言があれば暗黙の要素で重複しない', function() {
    var p = co.parse('@startuml\n[GpioDriver] as Gpio\nGpio -right-> [Bus]\n@enduml');
    expect(ids(p).sort()).toEqual(['Bus', 'Gpio']);
    expect(p.elements[0].label).toBe('GpioDriver');
  });

  test('relationOptions も方向付きの矢印を関係行として読む', function() {
    var p = RO.parseLine('[A] -right-> [B] : x');
    expect(p).not.toBeNull();
    expect(p.arrow).toBe('-right->');
    expect(RO.direction('[A] -right-> [B]')).toBe('forward');
    expect(RO.plainLine('[A] -[#red]up-> "1" [B]')).toBe('[A] -up-> [B]');
  });
});

describe('overlay: 方向指定の矢印でも枠が出る', function() {
  function svgFor(idList) {
    var svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 400');
    idList.forEach(function(id, i) {
      var g = D.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'entity');
      g.setAttribute('data-qualified-name', id);
      var r = D.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', 10 + i * 50); r.setAttribute('y', 20);
      r.setAttribute('width', 40); r.setAttribute('height', 30);
      g.appendChild(r);
      svg.appendChild(g);
    });
    return svg;
  }

  test('6 要素ぶんの rect.selectable が生成される', function() {
    var parsed = co.parse(DSL);
    var svg = svgFor(ids(parsed));
    var overlay = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
    co.buildOverlay(svg, parsed, overlay);
    var rects = overlay.querySelectorAll('rect.selectable[data-type="component"]');
    expect(rects.length).toBe(6);
  });
});
