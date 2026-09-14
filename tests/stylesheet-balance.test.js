'use strict';
// plantuml-assist.html の <style> が閉じ切れているかを見る。
//
// なぜ要るか: 2026-09-07 の run で、隣り合う 2 つの機能が同じ位置に CSS を足した
// マージの結果、片方の規則の閉じ括弧 } が 1 つ消えた。CSS は壊れても例外を出さず、
// その規則より後ろの宣言が丸ごと「1 つの規則の中身」として無視されるだけなので、
// unit も E2E も全部緑のまま画面の見た目だけが崩れた。
// 括弧の釣り合いは目視で気づけないので、ここで数える。
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '../plantuml-assist.html'), 'utf8');

function styleBlocks(html) {
  var out = [];
  var re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  var m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// 文字列・コメントの中の括弧は数えない (content: "{" のような書き方に備える)。
function stripNoise(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

describe('plantuml-assist.html の <style> が閉じ切れている', () => {
  test('{ と } の数が釣り合う', () => {
    styleBlocks(HTML).forEach(function(css) {
      var c = stripNoise(css);
      expect((c.match(/\{/g) || []).length).toBe((c.match(/\}/g) || []).length);
    });
  });

  test('途中で深さが負にならず、最後は深さ 0 に戻る', () => {
    styleBlocks(HTML).forEach(function(css) {
      var depth = 0;
      var lines = stripNoise(css).split('\n');
      for (var i = 0; i < lines.length; i++) {
        depth += (lines[i].match(/\{/g) || []).length;
        depth -= (lines[i].match(/\}/g) || []).length;
        expect(depth < 0).toBe(false);
      }
      expect(depth).toBe(0);
    });
  });

  // 深さ 2 は @media / @supports の中でだけ起きる。素の規則が入れ子になっていたら、
  // それは直前の規則の } が抜けている合図。
  test('入れ子は @ 規則の中だけ', () => {
    styleBlocks(HTML).forEach(function(css) {
      var depth = 0;
      var atDepth = [];
      var lines = stripNoise(css).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var opens = (line.match(/\{/g) || []).length;
        var closes = (line.match(/\}/g) || []).length;
        for (var o = 0; o < opens; o++) {
          atDepth[depth] = /@(media|supports|container|layer|scope)/.test(line);
          depth++;
          expect(depth === 1 || atDepth[depth - 2] === true).toBe(true);
        }
        depth -= closes;
      }
    });
  });
});
