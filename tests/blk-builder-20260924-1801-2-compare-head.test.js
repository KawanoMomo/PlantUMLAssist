'use strict';
// BLK-builder-20260924-1801-2 (design 9a / 10c): 比較の枠の見出し「比較相手」を押し縮めて 2 行に折らない。
// 初めて開いたときの説明は、相手が別のフォルダ・別タブ・前回保存版・過去のコミットのどれでも成り立つ言い方にし、
// 9a が外した「手本」「先輩」の前提を持ち込まない。
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

describe('比較の枠の説明 (design 9a / 10c)', function() {
  test('「手本」「先輩」と言わず、相手の種類 (フォルダ・前回保存版・コミット) を挙げる', function() {
    const t = SP.firstOpenNote({ open: true, seen: false });
    assert.ok(t.indexOf('手本') < 0, t);
    assert.ok(t.indexOf('先輩') < 0, t);
    ['別のフォルダ', '前回保存版', 'コミット', '読むだけ', '×'].forEach(function(w) {
      assert.ok(t.indexOf(w) >= 0, w + ': ' + t);
    });
  });
});

describe('比較の枠の見出しの列 (design 9a / 10c)', function() {
  test('見出しは折り返さず、狭いときは相手選びが次の行へ回る', function() {
    assert.ok(/white-space:\s*nowrap/.test(rule('#senior-head > strong')));
    assert.ok(/flex-shrink:\s*0/.test(rule('#senior-head > strong')));
    assert.ok(/flex-wrap:\s*wrap/.test(rule('#senior-head')));
  });
  test('閉じる × は枠の右上に留まり、フォルダの選択は潰れない幅を持つ', function() {
    assert.ok(/position:\s*absolute/.test(rule('#senior-head > #senior-close')));
    assert.ok(/min-width:\s*120px/.test(rule('#senior-head select')));
  });
});
