'use strict';
// BLK-builder-20260924-1823-2 (design 10c): コミットと比較している間、図そのものに差の色を付ける。
// 左のプレビュー = そのコミットに無い文字 (緑)、右の枠のコミット時点の図 = 作業中に無い文字 (赤)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
try { delete require.cache[require.resolve('../src/core/svg-text-diff.js')]; } catch (e) {}
require('../src/core/svg-text-diff.js');
var TD = global.window.MA.svgTextDiff;
// 図は手元の jsdom で組む (走らせ方によって global.document が無いことがある)。
var DOC = new (require('jsdom').JSDOM)('<!DOCTYPE html><html><body></body></html>').window.document;

function svgOf(texts) {
  var host = DOC.createElement('div');
  host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">'
    + texts.map(function(t) { return '<text>' + t + '</text>'; }).join('') + '</svg>';
  return host.querySelector('svg');
}
function marked(svg, cls) {
  return Array.prototype.map.call(svg.querySelectorAll('text.' + cls), function(e) { return e.textContent; });
}

describe('描かれている文字 (texts)', function() {
  test('上から順に、空白を詰めて、空は除く', function() {
    var s = svgOf(['SPI  初期化', ' ', 'App', 'SpiDrv']);
    expect(TD.texts(s)).toEqual(['SPI 初期化', 'App', 'SpiDrv']);
  });
  test('svg が無くても落ちない', function() {
    expect(TD.texts(null)).toEqual([]);
  });
});

describe('片方にしか無い文字に印を付ける (mark)', function() {
  // 初版: App -> SpiDrv : Spi_Init()。作業中: Ack を足し、Spi_Init() を Spi_Init(cfg) に直した。
  var OLD = ['SPI 初期化', 'App', 'SpiDrv', 'Spi_Init()', 'App', 'SpiDrv'];
  var NOW = ['SPI 初期化', 'App', 'SpiDrv', 'Spi_Init(cfg)', 'Ack', 'App', 'SpiDrv'];

  test('左 (作業中) には、そのコミットに無い文字 (増えた・変わった) に緑の印', function() {
    var left = svgOf(NOW);
    var hit = TD.mark(left, OLD, TD.CLS_ADD);
    expect(hit).toEqual(['Spi_Init(cfg)', 'Ack']);
    expect(marked(left, TD.CLS_ADD)).toEqual(['Spi_Init(cfg)', 'Ack']);
  });
  test('右 (コミット時点) には、作業中に無い文字 (消えた・変わった) に赤の印', function() {
    var right = svgOf(OLD);
    var hit = TD.mark(right, NOW, TD.CLS_DEL);
    expect(hit).toEqual(['Spi_Init()']);
    expect(marked(right, TD.CLS_DEL)).toEqual(['Spi_Init()']);
  });
  test('同じ文字は個数で突き合わせる (相手より多い分だけに印)', function() {
    var left = svgOf(['A', 'A', 'A', 'B']);
    expect(TD.mark(left, ['A', 'B'], TD.CLS_ADD)).toEqual(['A', 'A']);
  });
  test('同じ図なら印は付かない', function() {
    var left = svgOf(OLD);
    expect(TD.mark(left, OLD, TD.CLS_ADD)).toEqual([]);
  });
  test('外すと印は残らない (コミットを送る・比較をやめるとき)', function() {
    var left = svgOf(NOW);
    TD.mark(left, OLD, TD.CLS_ADD);
    expect(TD.unmark(left, TD.CLS_ADD)).toBe(2);
    expect(marked(left, TD.CLS_ADD)).toEqual([]);
    expect(TD.unmark(null)).toBe(0);
  });
});

describe('色の意味の 1 行 (legend)', function() {
  test('増えた・消えたの数を言う', function() {
    var s = TD.legend(['Ack', 'x'], ['Spi_Init()']);
    expect(s).toContain('緑');
    expect(s).toContain('左の図 2 か所');
    expect(s).toContain('赤');
    expect(s).toContain('右の図 1 か所');
  });
  test('0 件の側は言わない', function() {
    var s = TD.legend(['Ack'], []);
    expect(s).toContain('緑');
    expect(s).not.toContain('赤');
  });
  test('差が無ければ同じと言う', function() {
    expect(TD.legend([], [])).toContain('同じ');
  });
});

describe('画面への組み込み (plantuml-assist.html / app.js)', function() {
  var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8');
  var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf-8');
  test('部品を読み込み、枠の見出しに色の意味の行を持つ', function() {
    expect(html).toContain('<script src="src/core/svg-text-diff.js"></script>');
    expect(/id="senior-git"[\s\S]*?id="senior-git-legend"/.test(html)).toBe(true);
  });
  test('色は左のプレビューが緑 (gd-add)、右の枠が赤 (gd-del)', function() {
    expect(/#preview-svg svg text\.gd-add\s*\{[^}]*fill:/.test(html)).toBe(true);
    expect(/#senior-svg svg text\.gd-del\s*\{[^}]*fill:/.test(html)).toBe(true);
  });
  test('右の図を描いたとき・左の図を描き直したとき・比較をやめたときに付け直す', function() {
    var calls = app.split('syncGitDiagramDiff()').length - 1;
    expect(calls >= 4).toBe(true);
    expect(/function clearSeniorGit\(\)[\s\S]*?syncGitDiagramDiff\(\);[\s\S]*?\n\}/.test(app)).toBe(true);
  });
});
