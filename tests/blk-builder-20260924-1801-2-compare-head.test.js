'use strict';
// BLK-builder-20260924-1801-2 (design 9a / 10c): 右の枠の見出しを押し縮めて 2 行に折らない。
// 初めて開いたときの説明は、9a が外した「手本」「先輩」の前提を持ち込まない。
// TICKET-owner-20261115-2141-prune: 右の枠に出るのは読むだけのフォルダの図 1 枚と、この図の履歴の版だけ
// (フォルダの選択・相手の選び直しは外した)。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SP = require('../src/core/senior-pane');

const html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
function rule(sel) {
  const i = html.indexOf(sel + ' {');
  assert.ok(i >= 0, sel);
  return html.slice(i, html.indexOf('}', i));
}

describe('右の枠の説明 (design 9a / 10c)', function() {
  test('「手本」「先輩」と言わず、出るもの (読むだけのフォルダの図・この図の履歴) を挙げる', function() {
    const t = SP.firstOpenNote({ open: true, seen: false });
    assert.ok(t.indexOf('手本') < 0, t);
    assert.ok(t.indexOf('先輩') < 0, t);
    ['読むだけのフォルダ', 'この図の履歴', '読むだけ', '×'].forEach(function(w) {
      assert.ok(t.indexOf(w) >= 0, w + ': ' + t);
    });
  });
});

describe('右の枠の見出しの列 (design 9a / 10c)', function() {
  test('見出しは折り返さず、狭いときは Git の見出しが次の行へ回る', function() {
    assert.ok(/white-space:\s*nowrap/.test(rule('#senior-head > strong')));
    assert.ok(/flex-shrink:\s*0/.test(rule('#senior-head > strong')));
    assert.ok(/flex-wrap:\s*wrap/.test(rule('#senior-head')));
  });
  test('閉じる × は枠の右上に留まり、フォルダの選択欄は無い', function() {
    assert.ok(/position:\s*absolute/.test(rule('#senior-head > #senior-close')));
    assert.ok(html.indexOf('id="senior-dir"') < 0);
    assert.ok(html.indexOf('id="senior-mode"') < 0);
    assert.ok(html.indexOf('id="senior-target"') < 0);
  });
});
