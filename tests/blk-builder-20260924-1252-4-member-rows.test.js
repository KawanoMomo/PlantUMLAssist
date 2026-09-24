'use strict';
// BLK-builder-20260924-1252-4 (design 4a「Class — メンバー編集」): 属性・メソッドは 1 行 1 レコード。
// 閉じた行は「可視性の記号・シグネチャ・編集」だけで、並べ替えと削除は開いた行の中にある。
// 開いた行には入力に合わせて変わる「組み立てられる行」が出る。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>');
var W = dom.window;
var loadErrors = [];
[
  'src/core/html-utils.js', 'src/core/dsl-utils.js', 'src/core/regex-parts.js',
  'src/core/id-normalizer.js', 'src/core/line-resolver.js', 'src/core/formatter-interface.js',
  'src/core/dsl-updater.js', 'src/core/props-renderer.js', 'src/core/text-updater.js',
  'src/core/parser-utils.js', 'src/core/history.js', 'src/core/selection.js',
  'src/core/relation-options.js', 'src/core/relation-kind-cards.js',
  'src/core/relation-roles.js', 'src/core/group-place.js',
  'src/ui/properties.js', 'src/modules/class.js',
].forEach(function(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', code);
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var CL = W.MA && W.MA.modules && W.MA.modules.plantumlClass;

var FIXTURE = ['@startuml', 'class Circle {', '  - radius : double', '  + area() : double', '}', '@enduml'].join('\n');
var text = FIXTURE;
var ctx = {
  getMmdText: function() { return text; },
  setMmdText: function(t) { text = t; },
  onUpdate: function() {},
};

function render(sel) {
  var propsEl = W.document.getElementById('props');
  var parsed = CL.parse(text);
  var cls = parsed.elements.filter(function(e) { return e.id === 'Circle'; })[0];
  if (sel === 'class') {
    CL.renderProps([{ type: 'class', id: 'Circle', line: cls.line }], parsed, propsEl, ctx);
  } else {
    var m = cls.members[sel];
    CL.renderProps([{ type: 'member', id: 'Circle::__m_' + sel, parentId: 'Circle', parentKind: cls.kind,
      memberIndex: sel, memberKind: m.kind, line: m.line }], parsed, propsEl, ctx);
  }
  return propsEl;
}

describe('BLK-builder-20260924-1252-4 sources load', function() {
  test('読み込みエラーが無い', function() {
    expect(loadErrors).toEqual([]);
    expect(typeof CL.memberRowParts).toBe('function');
  });
});

describe('BLK-builder-20260924-1252-4 memberRowParts', function() {
  test('可視性は記号と呼び名に分け、シグネチャから可視性を除く', function() {
    var a = CL.memberRowParts({ kind: 'attribute', visibility: '-', name: 'radius', type: 'double' });
    expect(a.visMark).toBe('−');
    expect(a.visTitle).toBe('private');
    expect(a.sig).toBe('radius : double');
    var m = CL.memberRowParts({ kind: 'method', visibility: '+', name: 'area', params: '', type: 'double', static: true });
    expect(m.sig).toBe('area() : double');
    expect(m.mod).toBe('static');
  });
  test('可視性の無い行も落ちない', function() {
    var n = CL.memberRowParts({ kind: 'attribute', name: 'x' });
    expect(n.visMark).toBe('');
    expect(n.sig).toBe('x');
  });
});

describe('BLK-builder-20260924-1252-4 memberLinePreview', function() {
  test('属性: 入力どおりの 1 行を組み立てる', function() {
    expect(CL.memberLinePreview('attribute', '  - radius : double',
      { visibility: '#', name: 'r', type: 'float', isStatic: true })).toBe('# {static} r : float');
  });
  test('メソッド: 引数と abstract も入る', function() {
    expect(CL.memberLinePreview('method', '+ area() : double',
      { visibility: '+', name: 'area', params: 'int k', type: 'double', isAbstract: true })).toBe('+ {abstract} area(int k) : double');
  });
  test('型が先の書き方は型が先のまま (更新で入る行と同じ)', function() {
    expect(CL.memberLinePreview('attribute', 'double radius',
      { visibility: '-', name: 'radius', type: 'double' })).toBe('- double radius');
  });
});

describe('BLK-builder-20260924-1252-4 右パネルの行', function() {
  test('閉じた行は 記号・シグネチャ・編集 だけで、↑ ↓ ✕ は出ない', function() {
    text = FIXTURE;
    var el = render('class');
    var rows = el.querySelectorAll('.cl-member-row');
    expect(rows.length).toBe(2);
    var r0 = rows[0];
    expect(r0.querySelector('.cl-mem-vis').textContent).toBe('−');
    expect(r0.querySelector('.cl-mem-sig').textContent).toBe('radius : double');
    expect(r0.querySelector('.cl-mem-edit').textContent).toBe('編集');
    expect(el.querySelector('[id^="cl-mem-del-"]')).toBe(null);
    expect(el.querySelector('[id^="cl-mem-up-"]')).toBe(null);
  });

  test('開いた行に 組み立てられる行・削除・上へ/下へ がある', function() {
    text = FIXTURE;
    var el = render(0);
    expect(el.querySelector('#cl-mem-preview-0').textContent).toBe('- radius : double');
    expect(el.querySelector('#cl-mem-del-0').textContent).toBe('削除');
    expect(el.querySelector('#cl-mem-up-0')).not.toBe(null);
    expect(el.querySelector('#cl-mem-edit-0')).toBe(null);
    // 他の行は閉じたまま (編集が出る)
    expect(el.querySelector('#cl-mem-edit-1')).not.toBe(null);
  });

  test('名前を打つと 組み立てられる行 がその場で変わる (本文はまだ変えない)', function() {
    text = FIXTURE;
    var el = render(0);
    var name = el.querySelector('#cl-mem-name-0');
    name.value = 'diameter';
    name.dispatchEvent(new W.Event('input'));
    expect(el.querySelector('#cl-mem-preview-0').textContent).toBe('- diameter : double');
    expect(text).toBe(FIXTURE);
    var st = el.querySelector('#cl-mem-static-0');
    st.checked = true;
    st.dispatchEvent(new W.Event('change'));
    expect(el.querySelector('#cl-mem-preview-0').textContent).toBe('- {static} diameter : double');
  });

  test('開いた行の 削除 でその行が消える', function() {
    text = FIXTURE;
    var el = render(0);
    el.querySelector('#cl-mem-del-0').click();
    expect(text.indexOf('radius')).toBe(-1);
    expect(text.indexOf('area()') >= 0).toBe(true);
  });
});
