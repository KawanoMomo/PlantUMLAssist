'use strict';
// BLK-builder-20260924-1818-1 (design 10c): 「比較する相手を選ぶ」の窓を必ず画面の中に収める。
// FILES 下端の GIT「相手を選ぶ…」(y≈835) から開くと、ボタンの下へ開いて窓の下半分が画面の外に出ていた。

var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var GP = W.MA.gitPanel;

function rect(top, left, h, w) { return { top: top, bottom: top + (h || 20), left: left, right: left + (w || 70) }; }

describe('比較する相手を選ぶ の置き場所 (design 10c)', function() {
  test('下に余裕があれば、今までどおりボタンの下に開く', function() {
    var p = GP.pickerPlace(rect(100, 960), 1600, 1000);
    expect(p.top).toBe(124);
    expect(p.bottom).toBe(null);
    expect(p.left).toBe(960);
    expect(p.maxHeight).toBe(600);   // 60vh
  });

  test('下が足りない (FILES 下端のボタン) ならボタンの上へ開き、上の余白に収める', function() {
    var p = GP.pickerPlace(rect(826, 183, 18), 1600, 1000);
    expect(p.top).toBe(null);
    expect(p.bottom).toBe(1000 - 826 + 4);   // 窓の下端はボタンの 4px 上
    expect(p.maxHeight).toBeLessThanOrEqual(826 - 4 - 8);
    expect(p.maxHeight).toBe(600);
  });

  test('上も下も狭い窓では、広い側に入る高さまで縮める (はみ出さない)', function() {
    var p = GP.pickerPlace(rect(200, 100, 20), 1600, 400);
    // 下 = 400 - 220 - 4 - 8 = 168、上 = 200 - 4 - 8 = 188 → 上へ 188
    expect(p.top).toBe(null);
    expect(p.maxHeight).toBe(188);
    var q = GP.pickerPlace(rect(150, 100, 20), 1600, 400);
    // 下 = 400 - 170 - 12 = 218、上 = 150 - 12 = 138 → 下へ 218
    expect(q.top).toBe(174);
    expect(q.maxHeight).toBe(218);
  });

  test('右端のボタンでも窓は横にはみ出さない', function() {
    var p = GP.pickerPlace(rect(100, 1500), 1600, 1000);
    expect(p.left).toBe(1600 - 380);
    expect(GP.pickerPlace(rect(100, -20), 1600, 1000).left).toBe(8);
  });

  test('git-ui の openPicker は pickerPlace の結果で top / bottom / max-height を決める', function() {
    var ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'git-ui.js'), 'utf8');
    var body = ui.slice(ui.indexOf('function openPicker'), ui.indexOf('function closePicker'));
    expect(body).toContain('pickerPlace(');
    expect(body).toContain('m.style.bottom');
    expect(body).toContain('m.style.maxHeight');
    expect(body).not.toContain("m.style.top = Math.round(r.bottom + 4) + 'px';");
  });

  test('縮めた窓では一覧がスクロールする (flex の中で縮める)', function() {
    var html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');
    var i = html.indexOf('#git-pick-modal #git-pick-list {');
    var rule = html.slice(i, html.indexOf('}', i));
    expect(rule).toContain('overflow-y: auto');
    expect(rule).toContain('min-height: 0');
  });
});
