'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/svg-visual-diff.js')]; } catch (e) {}
require('../src/core/svg-visual-diff.js');

var VD = window.MA.svgVisualDiff;

// BLK-reviewer-20260914-2106-wish: stale と出た図について、可視内容が本当にずれて
// いるのか、コメント行の追加や埋め込みソースの符号化差分だけなのかを機械で言う。
function svg(body) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">' + body + '</svg>';
}

var BODY = [
  '<rect x="10" y="10" width="100" height="40"/>',
  '<text x="20" y="30">Spi_Driver</text>',
  '<line x1="60" y1="50" x2="60" y2="150"/>',
  '<text x="70" y="100">init</text>',
  '<polygon points="60,150 55,140 65,140"/>',
].join('');

describe('svgVisualDiff.compare — 埋め込みソースだけの差は「可視内容は同一」', function() {
  test('末尾の <?plantuml-src ?> と印コメントが違っても same', function() {
    var a = svg(BODY + '<?plantuml-src AAAA?>') + '\n<!-- @pua-source-sha1 ' + 'a'.repeat(40) + ' -->';
    var b = svg(BODY + '<?plantuml-src BBBBBBBB?>');
    var r = VD.compare(a, b);
    expect(r.verdict).toBe('same');
    expect(VD.verdictText(r)).toContain('可視内容は同一');
    // 「差分なし」と言うからには、何件を突き合わせたのかを出す。
    expect(VD.countsText(r)).toContain('差分なし');
  });

  test('HTML コメントに包まれた形 (<!--?plantuml-src ?-->) でも same', function() {
    var a = svg(BODY + '<!--?plantuml-src AAAA?-->');
    var b = svg(BODY + '<?plantuml-src ZZZZ?>');
    expect(VD.compare(a, b).verdict).toBe('same');
  });

  test('ヘッダ属性・XML 宣言の書式だけの差でも same', function() {
    var a = '<svg xmlns="http://www.w3.org/2000/svg" contentStyleType="text/css" width="300">'
      + BODY + '</svg>';
    var b = svg(BODY);
    expect(VD.compare(a, b).verdict).toBe('same');
  });
});

describe('svgVisualDiff.compare — 描かれるものが増減したら changed', function() {
  test('participant 名が変わったら、消えた名前と増えた名前を両方名指しする', function() {
    var a = svg(BODY);
    var b = svg(BODY.replace('Spi_Driver', 'Spi_Drv'));
    var r = VD.compare(a, b);
    expect(r.verdict).toBe('changed');
    expect(r.removedLabels).toEqual(['Spi_Driver']);
    expect(r.addedLabels).toEqual(['Spi_Drv']);
    expect(VD.verdictText(r)).toContain('可視内容がずれています');
  });

  test('矢印が 1 本増えたら、文字が同じでも changed', function() {
    var a = svg(BODY);
    var b = svg(BODY + '<line x1="60" y1="160" x2="200" y2="160"/>');
    var r = VD.compare(a, b);
    expect(r.verdict).toBe('changed');
    expect(r.addedShapes).toBe(1);
    expect(r.addedLabels).toEqual([]);
  });

  test('指摘文には増減した名前がそのまま並ぶ', function() {
    var r = VD.compare(svg(BODY), svg(BODY.replace('init', 'initialize')));
    var text = VD.report('spi_init_sequence', r);
    expect(text).toContain('spi_init_sequence');
    expect(text).toContain('+ initialize');
    expect(text).toContain('- init');
  });
});

describe('svgVisualDiff.compare — 位置だけが動いたら moved', function() {
  test('同じ文字・同じ図形が動いただけなら moved (same にしない)', function() {
    var a = svg(BODY);
    var b = svg(BODY.replace('<text x="70" y="100">init</text>', '<text x="70" y="140">init</text>'));
    var r = VD.compare(a, b);
    expect(r.verdict).toBe('moved');
    expect(r.movedLabels.length).toBe(1);
    expect(r.movedLabels[0].text).toBe('init');
    expect(r.movedLabels[0].dy).toBe(40);
    expect(VD.verdictText(r)).toContain('レイアウトだけが動きました');
  });

  test('丸めの範囲 (1.5 以内) の揺れは動いたと言わない', function() {
    var a = svg(BODY);
    var b = svg(BODY.replace('<text x="70" y="100">', '<text x="70.5" y="101">'));
    expect(VD.compare(a, b).verdict).toBe('same');
  });
});

describe('svgVisualDiff — 読めないものを一致と言わない', function() {
  test('SVG でない文字列は unknown', function() {
    var r = VD.compare('not an svg', svg(BODY));
    expect(r.verdict).toBe('unknown');
    expect(VD.verdictText(r)).toContain('比べられませんでした');
  });
});

describe('svgVisualDiff.labels — tspan で分けられた文字を 1 つとして読む', function() {
  test('装飾で分かれていても 1 つの文字として拾う', function() {
    var rows = VD.labels(svg('<text x="1" y="2"><tspan>Spi</tspan><tspan>_Driver</tspan></text>'));
    expect(rows.length).toBe(1);
    expect(rows[0].text).toBe('Spi_Driver');
  });

  test('実体参照は戻してから比べる', function() {
    var rows = VD.labels(svg('<text x="1" y="2">a &amp; b</text>'));
    expect(rows[0].text).toBe('a & b');
  });
});
