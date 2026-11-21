'use strict';
// TICKET-junior-20261116-0601: 「末尾に追加」と選択パネルの欄の見出し (「始点 (From)」など) が欄に結び付いておらず、
// 見出しの語で欄を引けなかった (getByRole('combobox', { name: '始点 (From)' }) が 0 件)。
// 欄の部品 (src/ui/properties.js) の <label> が for で欄の id を指し、見出しを押すと欄にフォーカスが移る。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

function fresh() {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>');
  var W = dom.window;
  W.MA = {};
  global.window = W;
  global.document = W.document;
  ['../src/core/html-utils.js', '../src/ui/properties.js'].forEach(function(f) {
    try { delete require.cache[require.resolve(f)]; } catch (e) {}
    require(f);
  });
  return W;
}
function restore() { global.window = prevWindow; global.document = prevDocument; }

describe('欄の見出しが欄に結び付く (TICKET-junior-20261116-0601)', function() {
  test('selectFieldHtml: 見出しの for が select の id を指し、見出しの語が欄の名前になる', function() {
    var W = fresh();
    try {
      var P = W.MA.properties;
      var host = W.document.getElementById('host');
      host.innerHTML = P.selectFieldHtml('始点 (From)', 'seq-tail-from', [{ value: 'A', label: 'A', selected: true }]);
      var label = host.querySelector('label');
      expect(label.getAttribute('for')).toBe('seq-tail-from');
      var sel = W.document.getElementById('seq-tail-from');
      expect(sel.tagName).toBe('SELECT');
      expect(sel.labels.length).toBe(1);
      expect(sel.labels[0].textContent).toBe('始点 (From)');
      // 見出しの指す欄が select そのもの (見出しを押すと欄にフォーカスが移るのは e2e で見る)。
      expect(label.control === sel).toBe(true);
    } finally { restore(); }
  });

  test('fieldHtml: 見出しの for が input の id を指す', function() {
    var W = fresh();
    try {
      var host = W.document.getElementById('host');
      host.innerHTML = W.MA.properties.fieldHtml('ラベル', 'seq-tail-label', 'x', '');
      var input = W.document.getElementById('seq-tail-label');
      expect(host.querySelector('label').getAttribute('for')).toBe('seq-tail-label');
      expect(input.labels.length).toBe(1);
      expect(input.labels[0].textContent).toBe('ラベル');
    } finally { restore(); }
  });

  test('segmentedFieldHtml: ボタンの並びは見出しを名前に持つ group (id と見た目は変えない)', function() {
    var W = fresh();
    try {
      var host = W.document.getElementById('host');
      host.innerHTML = W.MA.properties.segmentedFieldHtml('矢印', 'seq-arrow', [{ value: '->', label: '->', selected: true }]);
      var group = W.document.getElementById('seq-arrow');
      expect(group.getAttribute('role')).toBe('group');
      var lab = W.document.getElementById(group.getAttribute('aria-labelledby'));
      expect(lab.tagName).toBe('LABEL');
      expect(lab.textContent).toBe('矢印');
      expect(group.querySelectorAll('button.prop-seg').length).toBe(1);
    } finally { restore(); }
  });
});
