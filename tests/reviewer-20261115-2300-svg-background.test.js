'use strict';
// TICKET-reviewer-20261115-2300: Export ▾「SVGとして保存」の SVG に背景が無く (透明)、暗い地に貼ると線・文字が見えなかった。
// PlantUML が描いた SVG は根の style に `background:#FFFFFF` を持つが、プレビューの整え
// (app.js normalizeSvgSize の removeAttribute('style')) で消え、exportSVG はその DOM を写していた。
// 直し: 消す前に背景を控え、書き出す文字列の根に戻す。透明の図 (backgroundColor transparent) は透明のまま。
const fs = require('fs');
const path = require('path');
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/svg-export.js')]; } catch (e) {}
require('../src/core/svg-export.js');
var sx = global.window.MA.svgExport;
var XMLSerializer = dom.window.XMLSerializer;
var DOMParser = dom.window.DOMParser;

// plantuml.jar -tsvg の根の形 (既定の図)。末尾に埋め込みの元 DSL (`--` 入り) を持つ。
var FOLDED = 'XL7TQXD1--4BtFuMfAA--9m1x';
function plantumlSvg(style) {
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"'
    + ' data-diagram-type="SEQUENCE" style="' + style + '" width="78px" height="134px" viewBox="0 0 78 134">'
    + '<g><rect fill="#E2E2F0" height="30" width="40" x="5" y="5"/><text fill="#181818" x="10" y="20">Drv</text></g>'
    + '<?plantuml-src ' + FOLDED + '?>'
    + '</svg>';
}

// app.js と同じ経路: innerHTML で画面に入れ、背景を控えてから style を外し、clone を XMLSerializer で書き戻す。
function exportLikeApp(svgText) {
  var host = dom.window.document.createElement('div');
  host.innerHTML = svgText;
  var el = host.querySelector('svg');
  var bg = sx.backgroundOf(el.getAttribute('style'));
  el.removeAttribute('style');
  el.style.maxWidth = 'none';
  var out = new XMLSerializer().serializeToString(el.cloneNode(true));
  return { out: sx.forSave(out, bg), raw: out };
}

function rootStyle(text) {
  var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror').length).toBe(0);
  return doc.documentElement.getAttribute('style') || '';
}

describe('backgroundOf は PlantUML が根の style に書いた背景を読む', () => {
  test('既定の図は #FFFFFF', () => {
    expect(sx.backgroundOf('width:78px;height:134px;background:#FFFFFF;')).toBe('#FFFFFF');
  });
  test('skinparam backgroundColor の色はその色', () => {
    expect(sx.backgroundOf('width:78px;height:134px;background:#222222;')).toBe('#222222');
  });
  test('transparent の図 (背景を書かない) は空', () => {
    expect(sx.backgroundOf('width:78px;height:134px;')).toBe('');
    expect(sx.backgroundOf(null)).toBe('');
  });
  test('色らしくない値は拾わない (属性を壊さない)', () => {
    expect(sx.backgroundOf('background:url("x")')).toBe('');
  });
});

describe('「SVGとして保存」の文字列は PlantUML の背景を根に持つ', () => {
  test('整えで style が落ちても、書き出しの根は白地', () => {
    var r = exportLikeApp(plantumlSvg('width:78px;height:134px;background:#FFFFFF;'));
    expect(r.raw).not.toContain('background');
    expect(rootStyle(r.out)).toContain('background:#FFFFFF');
  });
  test('埋め込みの元 DSL は処理命令のまま残り、XML として読める', () => {
    var r = exportLikeApp(plantumlSvg('width:78px;height:134px;background:#FFFFFF;'));
    expect(r.out).toContain('<?plantuml-src ' + FOLDED + '?>');
    expect(sx.isBrokenComment(r.out)).toBe(false);
    rootStyle(r.out);
  });
  test('図形・文字・寸法は書き出し前と同じ (根の style 以外は 1 字も変えない)', () => {
    var r = exportLikeApp(plantumlSvg('width:78px;height:134px;background:#FFFFFF;'));
    var strip = function(s) { return sx.restoreEmbeddedSource(s).replace(/\sstyle="[^"]*"/, ''); };
    expect(strip(r.out)).toBe(strip(r.raw));
    expect(r.out).toContain('width="78px"');
    expect(r.out).toContain('<text fill="#181818" x="10" y="20">Drv</text>');
  });
  test('skinparam の背景色はその色で戻す', () => {
    var r = exportLikeApp(plantumlSvg('width:78px;height:134px;background:#222222;'));
    expect(rootStyle(r.out)).toContain('background:#222222');
  });
  test('transparent の図は透明のまま (背景を足さない)', () => {
    var r = exportLikeApp(plantumlSvg('width:78px;height:134px;'));
    expect(r.out).not.toContain('background');
  });
  test('根に style が無くても足せ、既にある背景は重ねない', () => {
    var a = sx.withBackground('<svg xmlns="http://www.w3.org/2000/svg" width="10"><g/></svg>', '#FFFFFF');
    expect(rootStyle(a)).toBe('background:#FFFFFF;');
    var b = sx.withBackground('<svg style="background:#000000;"><g style="x"/></svg>', '#FFFFFF');
    expect(b).toBe('<svg style="background:#000000;"><g style="x"/></svg>');
  });
});

describe('app.js がこの経路を使う', () => {
  var app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  test('normalizeSvgSize は style を外す前に背景を控える', () => {
    var body = app.slice(app.indexOf('function normalizeSvgSize'), app.indexOf('function normalizeSvgSize') + 2500);
    var keep = body.indexOf('backgroundOf(svgEl.getAttribute(\'style\'))');
    var drop = body.indexOf('svgEl.removeAttribute(\'style\')');
    expect(keep > 0 && drop > keep).toBe(true);
  });
  test('exportSVG は控えた背景で forSave を通す', () => {
    var body = app.slice(app.indexOf('function exportSVG'), app.indexOf('function exportSVG') + 1200);
    expect(/svgExport\.forSave\(svgOut,\s*svgEl\.__puaBackground\)/.test(body)).toBe(true);
  });
});
