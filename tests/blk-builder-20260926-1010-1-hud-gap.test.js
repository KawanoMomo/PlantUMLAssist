'use strict';
// BLK-builder-20260926-1010-1: キャンバスの右上に浮くズーム帯 (#zoom-hud) のボタンが、図の上端
// (header の文字・右端の参加者や部品の頭) に重なり、そこにホバーしても枠が出ず押せなかった。
// 図の上端が帯の下端より上に来るときだけ、その差ぶん図を下げる。帯より下に図があれば下げない。
if (!global.window || !global.document) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/zoom-hud.js')]; } catch (e) {}
require('../src/core/zoom-hud.js');
var hud = global.window.MA.zoomHud;

describe('zoom-hud.figureGap — 図の上端を帯の下へ下げる量', () => {
  test('図の上端が帯の下端より上なら、帯の下端 + 余白 4px まで下げる', () => {
    // 実測: 帯 78〜105、図の上端 79 (sequence-ex の Page Header が Fit ボタンの下)
    expect(hud.figureGap(105, 79)).toBe(30);
  });

  test('図の上端が帯より下 (保存の帯・エラーの帯が図を押し下げている) なら下げない', () => {
    expect(hud.figureGap(105, 180)).toBe(0);
    expect(hud.figureGap(105, 109)).toBe(0);
  });

  test('帯が出ていない (高さ 0・値が無い) ときは下げない', () => {
    expect(hud.figureGap(0, 79, 0)).toBe(0);
    expect(hud.figureGap(NaN, 79)).toBe(0);
    expect(hud.figureGap(105, undefined)).toBe(0);
  });

  test('余白は指定でき、小数の座標は切り上げる', () => {
    expect(hud.figureGap(105.4, 79, 0)).toBe(27);
    expect(hud.figureGap(105, 79, 10)).toBe(36);
  });
});

describe('app.js syncFigureBelowHud — 図 (#preview-svg) を帯の下へ下げる', () => {
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
  // 帯 (#zoom-hud) の下端と、容れ物 (#preview-container) の上端・図の offsetTop を差し替えて確かめる。
  function setup(o) {
    var doc = global.document || global.window.document;
    doc.body.innerHTML = '<div id="preview-pane"><div id="preview-container"><div id="preview-svg"></div></div>' +
      '<div id="zoom-hud"></div></div>';
    var host = doc.getElementById('preview-svg');
    var cont = doc.getElementById('preview-container');
    var hudEl = doc.getElementById('zoom-hud');
    hudEl.getBoundingClientRect = function() { return { top: o.hudBottom - o.hudH, bottom: o.hudBottom, height: o.hudH }; };
    cont.getBoundingClientRect = function() { return { top: o.contTop }; };
    // offsetTop は margin-top を含む (流れの位置 + 付けた余白)
    Object.defineProperty(host, 'offsetTop', { configurable: true, get: function() { return o.flowTop + (parseFloat(host.style.marginTop) || 0); } });
    // eslint-disable-next-line no-new-func
    var fn = new Function('window', 'document', extract('syncFigureBelowHud') + '\nreturn syncFigureBelowHud;');
    return { run: function() { fn(global.window, doc)(host); }, host: host };
  }

  test('図が帯の下端より上に出ていれば、帯の下端 + 4px まで下げる (何度呼んでも同じ量)', () => {
    var o = { hudBottom: 105, hudH: 27, contTop: 63, flowTop: 16 };
    var s = setup(o);
    s.run();
    expect(s.host.style.marginTop).toBe('30px');
    s.run();
    expect(s.host.style.marginTop).toBe('30px');
  });

  test('保存の帯が図を帯より下へ押したら下げた分を外し、帯が消えたらまた下げる', () => {
    var o = { hudBottom: 105, hudH: 27, contTop: 63, flowTop: 16 };
    var s = setup(o);
    s.run();
    o.flowTop = 156;
    s.run();
    expect(s.host.style.marginTop).toBe('');
    o.flowTop = 16;
    s.run();
    expect(s.host.style.marginTop).toBe('30px');
  });

  test('帯が出ていない (高さ 0) ときは下げない', () => {
    var o = { hudBottom: 0, hudH: 0, contTop: 63, flowTop: 16 };
    var s = setup(o);
    s.run();
    expect(s.host.style.marginTop).toBe('');
  });

  test('syncOverlayOrigin は層の原点を読む前に図を下げる', () => {
    var body = extract('syncOverlayOrigin');
    expect(body.indexOf('syncFigureBelowHud(host)')).toBeGreaterThan(-1);
    expect(body.indexOf('syncFigureBelowHud(host)')).toBeLessThan(body.indexOf('offsetTop'));
  });
});
