'use strict';
// BLK-builder-20260924-1415-4 (design 7a / 9a): 空の画面の入口「ファイルを開く(.puml)」は残すが、
// 見本の図の上に重ねない。図のすぐ下に流れで置き、拡大 (transform: scale) しても図の下へずらす。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
try { delete require.cache[require.resolve('../src/core/file-open.js')]; } catch (e) {}
require('../src/core/file-open.js');
var FO = global.window.MA.fileOpen;

describe('入口と図の間 (emptyHintGap)', function() {
  test('等倍なら base だけ空ける', function() {
    expect(FO.emptyHintGap(344, 1)).toBe(16);
    expect(FO.emptyHintGap(344, 1, 24)).toBe(24);
  });
  test('拡大した分 (見た目の高さ - 流れの高さ) だけ下げる', function() {
    expect(FO.emptyHintGap(344, 1.4)).toBe(Math.round(16 + 344 * 0.4));
    expect(FO.emptyHintGap(100, 2, 0)).toBe(100);
  });
  test('縮小のときは下げない (図の下端より上に上がらない位置のまま)', function() {
    expect(FO.emptyHintGap(344, 0.5)).toBe(16);
  });
  test('値が無くても落ちない', function() {
    expect(FO.emptyHintGap(undefined, undefined)).toBe(16);
    expect(FO.emptyHintGap(null, 'x', null)).toBe(16);
  });
});

describe('入口の置き方 (plantuml-assist.html)', function() {
  var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8');
  var m = /#open-empty-hint\s*\{([^}]*)\}/.exec(html);
  test('プレビュー中央に絶対配置で重ねない (流れの中に置く)', function() {
    expect(!!m).toBe(true);
    expect(/position:\s*absolute/.test(m[1])).toBe(false);
    expect(/top:\s*40%/.test(m[1])).toBe(false);
    expect(/position:\s*relative/.test(m[1])).toBe(true);
  });
  test('拡大のたびに入口の位置を合わせ直す (setZoom から呼ぶ)', function() {
    var app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf-8');
    var z = /function setZoom\(z\) \{[\s\S]*?\n\}/.exec(app);
    expect(!!z).toBe(true);
    expect(/syncOpenEmptyHint\(\)/.test(z[0])).toBe(true);
  });
});
