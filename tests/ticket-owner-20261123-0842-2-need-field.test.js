'use strict';
// TICKET-owner-20261123-0842-2: 空のまま確定した欄の知らせは、画面に無い語 (Alias / ID / Target) でなく
// 欄の見出しの語で、6 図種同じ文で言う。
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
// 他の test が global.window を入れ替えても影響されないよう、自分の window で terms.js と properties.js を読む。
var P = (function() {
  var win = { addEventListener: function() {} };
  var doc = { getElementById: function() { return null; }, querySelector: function() { return null; },
    addEventListener: function() {}, createElement: function() { return { style: {}, addEventListener: function() {} }; } };
  ['src/ui/terms.js', 'src/ui/properties.js'].forEach(function(rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    new Function('window', 'document', 'alert', code)(win, doc, function() {});
  });
  return win.MA.properties;
})();

describe('知らせの文 (欄の見出しの語で言う)', function() {
  test('打つ欄は「「見出し」を入れてください」', function() {
    expect(P.needFieldText('名前')).toBe('「名前」を入れてください');
    expect(P.needFieldText(' 名前 (識別子) ')).toBe('「名前 (識別子)」を入れてください');
  });
  test('選ぶ欄は「「見出し」を選んでください」', function() {
    expect(P.needFieldText('付ける相手', true)).toBe('「付ける相手」を選んでください');
  });
});

describe('6 図種のモジュールに画面に無い語の知らせが残っていない', function() {
  ['sequence', 'usecase', 'component', 'class', 'activity', 'state'].forEach(function(m) {
    test(m + '.js に「Alias 必須」「ID 必須」「Target 必須」「Label 必須」「Alias を変更」が無い', function() {
      var src = fs.readFileSync(path.join(ROOT, 'src', 'modules', m + '.js'), 'utf8');
      expect(/alert\('(Alias|ID|Target|Label) 必須|Alias を変更してから|Alias は必須/.test(src)).toBe(false);
    });
  });
});
