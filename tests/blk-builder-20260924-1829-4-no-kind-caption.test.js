'use strict';
// BLK-builder-20260924-1829-4 (design 7a / 2b): 右ペインの頭に英語の図種名 (Sequence Diagram 等) の行を出さない。
// 図種は左レールとズーム HUD (「Sequence · 100%」) が言う。7a の追加タブはタブの下がすぐ「末尾に追加」。
const fs = require('fs');
const path = require('path');

describe('右ペインに英語の図種名の行が無い (design 7a / 2b)', function() {
  ['sequence', 'state', 'class', 'component', 'activity', 'usecase'].forEach(function(m) {
    test(m + '.js', function() {
      var src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'modules', m + '.js'), 'utf8');
      expect(/>(Sequence|State|Class|Component|Activity|UseCase) Diagram<\/div>/.test(src)).toBe(false);
    });
  });
});
