'use strict';
// BLK-builder-20260925-0305-1: 関係の枠を、SVG の線が持つ両端 (data-entity-1 / -2) で当てる。
// `!pragma layout smetana` の SVG は線に行の情報を付けず、関連クラス `(A, B) . C` があると A→B の線は
// 名前の無い中継点で 2 本に割れる。並び順で当てていたので、矢じりの側の線に枠が無く、
// 矢じりを指すと行き先のクラスが選ばれていた (web/plantuml の group2712 の 4 枚)。
// あわせて、置き方の指示 (`-down->`) や短い線 (`->` / `<|-`) の関係行を class / usecase でも読む。
// fixtures/svg/class-0305-assoc-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/modules/class.js',
  '../src/modules/usecase.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { require(m); });

var OB = window.MA.overlayBuilder;
var RO = window.MA.relationOptions;
var CL = window.MA.modules.plantumlClass;
var UC = window.MA.modules.plantumlUsecase;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/class-0305-assoc-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/class-0305-assoc-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText.replace(/<\?[^>]*\?>/g, '');
  var svgEl = div.querySelector('svg');
  var parsed = CL.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  CL.buildOverlay(svgEl, parsed, overlayEl);
  return { svgEl: svgEl, parsed: parsed, overlayEl: overlayEl };
}
function rectsOf(f, type) {
  return Array.prototype.filter.call(f.overlayEl.querySelectorAll('rect.selectable'), function(r) {
    return r.getAttribute('data-type') === type;
  });
}
function num(r, k) { return parseFloat(r.getAttribute(k)); }
function contains(r, x, y) {
  return num(r, 'x') <= x && x <= num(r, 'x') + num(r, 'width') && num(r, 'y') <= y && y <= num(r, 'y') + num(r, 'height');
}
// 矢じり (<polygon>) の中心
function headCenter(f) {
  var pg = f.svgEl.querySelector('g.link polygon');
  var nums = pg.getAttribute('points').split(/[\s,]+/).map(parseFloat);
  var xs = [], ys = [];
  for (var i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  return { x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, y: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 };
}

describe('class 図: smetana + 関連クラスの線 (group2712)', function() {
  ['down', 'left', 'default'].forEach(function(name) {
    test(name + ': 関係 chases → dog の枠が中継点の両側の線に付き、矢じりの上に関係の枠がある', function() {
      var f = load(name);
      expect(f.parsed.relations.length).toBe(1);
      expect(f.parsed.relations[0].from + '>' + f.parsed.relations[0].to).toBe('chases>dog');
      var rel = rectsOf(f, 'relation');
      var lines = {};
      rel.forEach(function(r) { lines[r.getAttribute('data-line')] = true; });
      expect(Object.keys(lines)).toEqual([String(f.parsed.relations[0].line)]);
      var h = headCenter(f);
      var heads = rel.filter(function(r) { return r.getAttribute('data-hit-kind') === 'linkhead'; });
      expect(heads.length).toBe(1);
      expect(contains(heads[0], h.x, h.y)).toBe(true);
    });

    test(name + ': 関連クラスの点線 (中継点 → annotation) に、その行を指す枠が出る', function() {
      var f = load(name);
      expect(f.parsed.assocClasses).toEqual([{ a: 'chases', b: 'dog', cls: 'annotation', line: f.parsed.relations[0].line + 1 }]);
      var src = rectsOf(f, 'source-line').filter(function(r) { return /^src:assoc@/.test(r.getAttribute('data-id')); });
      expect(src.length).toBe(1);
      expect(src[0].getAttribute('data-line')).toBe(String(f.parsed.relations[0].line + 1));
    });
  });
});

describe('overlay-builder.matchLinksByLine: 行が無い線を両端で当てる', function() {
  function svg(inner) {
    var div = document.createElement('div');
    div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
    return div.querySelector('svg');
  }
  function ent(id, name) {
    return '<g class="entity" id="' + id + '" data-qualified-name="' + name + '"><rect x="0" y="0" width="10" height="10"/></g>';
  }
  function link(id, a, b, line) {
    return '<g class="link" id="' + id + '" data-entity-1="' + a + '" data-entity-2="' + b + '"' +
      (line ? ' data-source-line="' + (line - 1) + '"' : '') + '><path d="M0,0 L10,10"/></g>';
  }

  test('並び順ではなく両端の名前で当てる (SVG の線の順と本文の関係の順が違っても)', function() {
    var s = svg(ent('e1', 'A') + ent('e2', 'B') + ent('e3', 'C') + link('l1', 'e2', 'e3') + link('l2', 'e1', 'e2'));
    var out = OB.matchLinksByLine(s, [{ from: 'A', to: 'B', line: 2 }, { from: 'B', to: 'C', line: 3 }]);
    expect(out.map(function(g) { return g.id; })).toEqual(['l2', 'l1']);
  });

  test('名前の無い中継点を挟む 2 本は 1 つの関係 (残りは parts)', function() {
    var s = svg(ent('e1', 'A') + ent('e2', 'B') + ent('e3', 'C') +
      link('l1', 'e1', 'j9') + link('l2', 'j9', 'e2') + link('l3', 'j9', 'e3'));
    var out = OB.matchLinksByLine(s, [{ from: 'A', to: 'B', line: 2 }]);
    expect(out[0].id).toBe('l1');
    expect(out.parts[0].map(function(g) { return g.id; })).toEqual(['l2']);
    expect(OB.junctionBetween(s, 'A', 'B')).toBe('j9');
    expect(OB.linkFromJunction(s, 'j9', 'C').id).toBe('l3');
  });

  test('行で当たる線は今までどおり行で当てる', function() {
    var s = svg(ent('e1', 'A') + ent('e2', 'B') + link('l1', 'e1', 'e2', 5) + link('l2', 'e1', 'e2', 4));
    var out = OB.matchLinksByLine(s, [{ from: 'A', to: 'B', line: 4 }, { from: 'A', to: 'B', line: 5 }]);
    expect(out.map(function(g) { return g.id; })).toEqual(['l2', 'l1']);
  });

  test('修飾名 (Pkg.A) の要素にも名前の末尾で当たる', function() {
    var s = svg(ent('e1', 'Pkg.A') + ent('e2', 'B') + link('l1', 'e2', 'e1'));
    var out = OB.matchLinksByLine(s, [{ from: 'A', to: 'B', line: 3 }]);
    expect(out[0].id).toBe('l1');
  });
});

describe('relation-options: 置き方の指示と短い線', function() {
  test('readableLine は長さを 2 に揃え、置き方の指示と色を外す', function() {
    expect(RO.readableLine('a -down-> b')).toBe('a --> b');
    expect(RO.readableLine('a -[#red]up-> b : x')).toBe('a --> b : x');
    expect(RO.readableLine('a .l.> b')).toBe('a ..> b');
    expect(RO.readableLine('a -> b')).toBe('a --> b');
    expect(RO.readableLine('a <|- b')).toBe('a <|-- b');
    expect(RO.readableLine('a <|--- b')).toBe('a <|-- b');
    expect(RO.readableLine('a --> b')).toBe('a --> b');
    expect(RO.readableLine('title x')).toBe('title x');
  });

  test('applyDecorations は元の線の形 (長さ・指示) と色・多重度を戻す', function() {
    var deco = RO.decorationsOf('a "1" -[#red]down-> "*" b');
    expect(deco.shape).toEqual({ pre: 1, dir: 'down', post: 1 });
    expect(RO.applyDecorations('a --> b : x', deco)).toBe('a "1" -[#red]down-> "*" b : x');
    expect(RO.applyDecorations('a <|-- b', RO.decorationsOf('a <|- b'))).toBe('a <|- b');
    expect(RO.decorationsOf('a --> b').shape).toBe(null);
  });
});

describe('class / usecase: 置き方の指示を付けた関係行を読み、書き直しても形を保つ', function() {
  test('class: -down-> / -> / .up.> / <|- を関係として読む', function() {
    var p = CL.parse('@startuml\nclass a\nclass b\na -down-> b\na -> b\na .up.> b\na <|- b\n@enduml');
    expect(p.relations.map(function(r) { return r.kind + ':' + r.from + '>' + r.to + '@' + r.line; })).toEqual([
      'association:a>b@4', 'association:a>b@5', 'dependency:a>b@6', 'inheritance:a>b@7',
    ]);
  });
  test('class: ラベルを直しても -[#red]down- の形と色は残る', function() {
    var t = '@startuml\nclass a\nclass b\na <|-[#red]down- b : x\n@enduml';
    expect(CL.updateRelation(t, 4, 'label', 'y').split('\n')[3]).toBe('a <|-[#red]down- b : y');
  });
  test('usecase: -right-> を関係として読み、ラベルを足しても形を保つ', function() {
    var u = '@startuml\nactor a\nusecase b\na -right-> b\n@enduml';
    var p = UC.parse(u);
    expect(p.relations.length).toBe(1);
    expect(p.relations[0].from + '>' + p.relations[0].to + '@' + p.relations[0].line).toBe('a>b@4');
    expect(UC.updateRelation(u, 4, 'label', 'go').split('\n')[3]).toBe('a -right-> b : go');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
