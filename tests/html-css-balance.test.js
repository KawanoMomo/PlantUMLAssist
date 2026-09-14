'use strict';
// BLK-primary-20260907-1203-design: plantuml-assist.html の <style> の波括弧が
// 釣り合っていること。
//
// マージのコンフリクト解消で閉じ括弧を 1 つ落とすと、そのルール以降の CSS が
// 丸ごと 1 つのルールの中身として飲み込まれ、画面のほぼ全部が素の見た目に戻る。
// ブラウザは黙って読み飛ばすので unit も E2E も緑のまま通ってしまい、
// 気づけるのはスクリーンショットを人が見たときだけだった。ここで数える。
var fs = require('fs');
var path = require('path');

var HTML_PATH = path.join(__dirname, '..', 'plantuml-assist.html');

// 文字列・コメントの中の括弧は数えない。CSS の `content: "}"` などを誤検出しない。
function stripNoise(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

function styleBlocks(html) {
  var out = [];
  var re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  var m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function braceBalance(css) {
  var clean = stripNoise(css);
  var open = (clean.match(/\{/g) || []).length;
  var close = (clean.match(/\}/g) || []).length;
  return { open: open, close: close };
}

describe('plantuml-assist.html の <style>', function() {
  var html = fs.readFileSync(HTML_PATH, 'utf8');
  var blocks = styleBlocks(html);

  test('<style> ブロックがある', function() {
    expect(blocks.length).toBeGreaterThan(0);
  });

  test('波括弧の数が釣り合っている (閉じ忘れでルールが飲み込まれない)', function() {
    blocks.forEach(function(css) {
      var b = braceBalance(css);
      expect(b.open).toBe(b.close);
    });
  });

  test('入れ子が途中で負にならない (閉じすぎていない)', function() {
    blocks.forEach(function(css) {
      var clean = stripNoise(css);
      var depth = 0;
      var min = 0;
      for (var i = 0; i < clean.length; i++) {
        if (clean[i] === '{') depth++;
        else if (clean[i] === '}') { depth--; if (depth < min) min = depth; }
      }
      expect(min).toBe(0);
    });
  });

  test('マージのコンフリクト印が残っていない', function() {
    expect(/^<<<<<<< /m.test(html)).toBe(false);
    expect(/^>>>>>>> /m.test(html)).toBe(false);
  });

  // 落としたときに落ちることの確認。上の検査が実際に働くことを固定する。
  test('閉じ括弧を 1 つ落とした CSS は検出できる', function() {
    var broken = '.a { color: red;\n.b { color: blue; }\n';
    var b = braceBalance(broken);
    expect(b.open).not.toBe(b.close);
  });

  test('文字列の中の括弧は数えない', function() {
    var css = '.a::after { content: "}"; }\n';
    var b = braceBalance(css);
    expect(b.open).toBe(b.close);
  });
});
