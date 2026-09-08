'use strict';
// BLK-primary-20260908-1903-wish 「提出前レビュー画面（変更前後を並べて出す）」。
//
// 願望: 納品パッケージが出すのは提出前チェックの件数と差分の行数だけで、
// 実際にどこが変わったかはタブを 1 枚ずつ切り替えて見比べるしかなかった。
// ここでは判断側の純関数 — 前回提出の SVG と今の SVG の突き合わせ、
// 見比べる順、見出しの言い方 — を検証する (描画は app.js の職掌)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var depPaths = ['../src/core/delivery-review.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var DR = global.window.MA.deliveryReview;

function svg(texts, extra) {
  var body = texts.map(function(t) {
    return '<text x="10" y="20" fill="#000">' + t + '</text>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg">' + body + (extra || '') + '</svg>';
}

describe('delivery-review — 提出前レビュー', function() {

  test('SVG に書かれている文字を、描かれた順のまま拾う', function() {
    var s = svg(['App', 'Spi', 'init()']);
    expect(DR.labelsOf(s)).toEqual(['App', 'Spi', 'init()']);
  });

  test('実体参照とタグ入りの文字も読める', function() {
    var s = '<svg><text><tspan>&lt;&lt;service&gt;&gt;</tspan> Adc</text></svg>';
    expect(DR.labelsOf(s)).toEqual(['<<service>> Adc']);
  });

  test('図形の数をタグごとに数える', function() {
    var s = svg(['A'], '<path d="M0 0"/><path d="M1 1"/><polygon points="0,0"/>');
    var shape = DR.shapeOf(s);
    expect(shape.path).toBe(2);
    expect(shape.polygon).toBe(1);
    expect(shape.text).toBe(1);
  });

  test('増えた文字・消えた文字を名指しする', function() {
    var d = DR.diff(svg(['App', 'Spi', '古い名前']), svg(['App', 'Spi', '新しい名前']));
    expect(d.kind).toBe('changed');
    expect(d.added).toEqual(['新しい名前']);
    expect(d.removed).toEqual(['古い名前']);
    expect(d.keptCount).toBe(2);
  });

  test('文字が同じでも図形の数が動いていれば「変わっている」と言う', function() {
    var before = svg(['App', 'Spi'], '<path d="M0 0"/>');
    var after = svg(['App', 'Spi'], '<path d="M0 0"/><path d="M1 1"/>');
    var d = DR.diff(before, after);
    expect(d.kind).toBe('changed');
    expect(d.added).toEqual([]);
    expect(d.shape.length).toBe(1);
    expect(d.shape[0].tag).toBe('path');
    expect(d.shape[0].was).toBe(1);
    expect(d.shape[0].now).toBe(2);
  });

  test('番号や記号だけの文字は名指ししない (毎回混ざるため)', function() {
    var d = DR.diff(svg(['App', '1']), svg(['App', '2']));
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.kind).toBe('same');
  });

  test('前回提出に無い図は new、同じなら same', function() {
    expect(DR.diff(null, svg(['App'])).kind).toBe('new');
    expect(DR.diff(svg(['App']), svg(['App'])).kind).toBe('same');
    expect(DR.diff(svg(['App']), '').kind).toBe('unknown');
  });

  test('1 行の言い方が、増減の件数を出す', function() {
    var d = DR.diff(svg(['App', '旧名']), svg(['App', '新名']));
    var line = DR.summaryLine(d);
    expect(line).toContain('見た目が変わっています');
    expect(line).toContain('増えた文字 1 個');
    expect(line).toContain('消えた文字 1 個');
    expect(DR.summaryLine(DR.diff(svg(['App']), svg(['App'])))).toContain('前回提出と同じ');
    expect(DR.summaryLine(null)).toBe('見比べていません');
  });

  test('見比べる順は 変更 → 新規 → 変更なし', function() {
    var rows = DR.plan([
      { name: 'c', status: 'same' },
      { name: 'a', status: 'new' },
      { name: 'b', status: 'changed' },
      { name: 'd', status: 'changed' },
    ]);
    expect(rows.map(function(r) { return r.name; })).toEqual(['b', 'd', 'a', 'c']);
    expect(DR.firstOf([{ name: 'x', status: 'same' }, { name: 'y', status: 'changed' }])).toBe('y');
    expect(DR.firstOf([])).toBe(null);
  });

  test('見出しは、何枚のうち何枚を見比べるのかを開いた瞬間に言う', function() {
    expect(DR.headline([
      { name: 'a', status: 'changed' }, { name: 'b', status: 'new' }, { name: 'c', status: 'same' },
    ])).toBe('3 枚のうち 変更 1 枚 ・ 新規 1 枚 を見比べます');
    expect(DR.headline([{ name: 'a', status: 'same' }])).toContain('変わっていません');
    expect(DR.headline([])).toBe('対象の図がありません');
  });

  test('並べる / 重ねるはボタン 1 つで往復する', function() {
    expect(DR.toggleMode('side')).toBe('overlay');
    expect(DR.toggleMode('overlay')).toBe('side');
    expect(DR.modeLabel('overlay')).toContain('重ねて');
    expect(DR.modeLabel('side')).toContain('並べて');
    expect(DR.overlayCss()).toContain('.dr-stack');
  });
});

global.window = prevWindow;
global.document = prevDocument;
