'use strict';
// BLK-migrator-20260923-1909 差し戻し 1 回目: 当たり判定の層 (#overlay-layer / #hover-layer) は
// 図 (#preview-svg) が余白 16px の位置にあると決め打ちしていた。保存の帯 (保存の記録・突合など) が
// 図の上に流れで入って図を下へ押すと、枠が帯の高さだけ上にずれてホバーしても本人の枠が出なかった。
// 層の原点を図の実際の位置に合わせ直す関数 (app.js の syncOverlayOrigin) を jsdom で確かめる。

var fs = require('fs');
var path = require('path');

var APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');

function extract(name) {
  var start = APP.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' が app.js に無い');
  var depth = 0, i = APP.indexOf('{', start);
  for (; i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}') { depth--; if (depth === 0) break; }
  }
  return APP.slice(start, i + 1);
}

function setup(top, left) {
  var doc = global.document;
  doc.body.innerHTML =
    '<div id="preview-container">' +
    '  <div id="save-swap-overlay"></div>' +
    '  <div id="preview-svg"></div>' +
    '  <svg id="overlay-layer"></svg>' +
    '  <svg id="hover-layer" style="position:absolute;top:16px;left:16px"></svg>' +
    '</div>';
  var host = doc.getElementById('preview-svg');
  Object.defineProperty(host, 'offsetTop', { configurable: true, get: function() { return top.v; } });
  Object.defineProperty(host, 'offsetLeft', { configurable: true, get: function() { return left.v; } });
  // eslint-disable-next-line no-new-func
  // BLK-builder-20260926-1010-1: syncOverlayOrigin は先に図をズーム帯の下へ下げる (syncFigureBelowHud)。帯の無い DOM では何もしない。
  var fn = new Function('previewSvgEl', 'document', extract('syncFigureBelowHud') + '\n' + extract('syncOverlayOrigin') + '\nreturn syncOverlayOrigin;');
  return fn(host, doc);
}

describe('当たり判定の層の原点は図の実際の位置に合わせる', function() {
  test('帯が無いときは余白どおり 16px', function() {
    var top = { v: 16 }, left = { v: 16 };
    var sync = setup(top, left);
    sync();
    expect(document.getElementById('overlay-layer').style.top).toBe('16px');
    expect(document.getElementById('hover-layer').style.left).toBe('16px');
  });

  test('帯が図を 140px 下へ押したら、2 つの層とも同じだけ下がる', function() {
    var top = { v: 16 }, left = { v: 16 };
    var sync = setup(top, left);
    sync();
    top.v = 156;
    sync();
    expect(document.getElementById('overlay-layer').style.top).toBe('156px');
    expect(document.getElementById('hover-layer').style.top).toBe('156px');
    expect(document.getElementById('overlay-layer').style.left).toBe('16px');
  });

  test('帯が消えたら元の位置へ戻る', function() {
    var top = { v: 156 }, left = { v: 16 };
    var sync = setup(top, left);
    sync();
    top.v = 16;
    sync();
    expect(document.getElementById('overlay-layer').style.top).toBe('16px');
  });
});

describe('合わせ直す時機', function() {
  test('描き直しで枠を作る直前と、ズームのたびに合わせ直す', function() {
    var render = extract('renderSvg');
    expect(render.indexOf('syncOverlayOrigin()')).toBeGreaterThan(-1);
    expect(render.indexOf('syncOverlayOrigin()')).toBeLessThan(render.indexOf('currentModule.buildOverlay(svgEl'));
    expect(extract('setZoom').indexOf('syncOverlayOrigin()')).toBeGreaterThan(-1);
  });

  test('図より前の帯の出入り・高さの変化を ResizeObserver で追う (層そのものは見ない)', function() {
    var s = extract('setupOverlayOriginSync');
    expect(s.indexOf('ResizeObserver')).toBeGreaterThan(-1);
    expect(s.indexOf('overlay-layer')).toBeGreaterThan(-1);
    expect(APP.indexOf('setupOverlayOriginSync();')).toBeGreaterThan(-1);
  });
});
