'use strict';
// BLK-junior-20260908-0203 / 「保存」ボタンが複数あって設定ダイアログの確定ボタンを
// 文言だけで探せない。
//
// 仕様: 画面上のボタンの文言は、他のボタンの文言に含まれてはならない。
// 「保存」が「SVGとして保存」「保存データを全削除」等に含まれてしまうと、
// 文言で探す利用者はダイアログの位置関係を目で追う必要が出る。

var fs = require('fs');
var path = require('path');

function html() {
  return fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf-8');
}

// <button ...>ラベル</button> のうち、子要素を持たない素のテキストだけを拾う。
function buttonLabels(src) {
  var out = [];
  var re = /<button\b([^>]*)>([^<]*)<\/button>/g;
  var m;
  while ((m = re.exec(src)) !== null) {
    var attrs = m[1];
    var text = m[2].replace(/\s+/g, ' ').trim();
    if (!text) continue;
    var id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || '';
    out.push({ id: id, text: text });
  }
  return out;
}

describe('ボタンの文言は一意に指す (BLK-junior-20260908-0203)', function() {
  test('設定ダイアログの確定ボタンは「設定を保存」と読める', function() {
    var cfgOk = buttonLabels(html()).filter(function(b) { return b.id === 'cfg-ok'; })[0];
    expect(cfgOk.text).toBe('設定を保存');
  });

  test('確定ボタンの文言は他のどのボタンの文言にも含まれない', function() {
    var labels = buttonLabels(html());
    var cfgOk = labels.filter(function(b) { return b.id === 'cfg-ok'; })[0];
    var collide = labels.filter(function(b) {
      return b.id !== 'cfg-ok' && b.text.indexOf(cfgOk.text) >= 0;
    }).map(function(b) { return b.id + ':' + b.text; });
    expect(collide.join(', ')).toBe('');
  });

  // 同じ 1 つの窓を開く別の場所の入口は、同じ語で出す (principles「同じ操作は同じ語」)。
  // TICKET-owner-20261122-1240-1: Import ▾ と ⚙ 設定の「保存先のフォルダを選ぶ…」は同じ窓 (#target-pick) を開く。
  var SAME_OP = [['imp-target', 'cfg-file-dir-pick']];
  function sameOp(a, b) {
    if (a.text !== b.text) return false;
    return SAME_OP.some(function(g) { return g.indexOf(a.id) >= 0 && g.indexOf(b.id) >= 0; });
  }

  test('同じ操作の入口として許した組は、本当に同じ語である', function() {
    var labels = buttonLabels(html());
    SAME_OP.forEach(function(g) {
      var texts = g.map(function(id) { return (labels.filter(function(b) { return b.id === id; })[0] || {}).text; });
      expect(!!texts[0]).toBe(true);
      expect(texts[1]).toBe(texts[0]);
    });
  });

  test('「保存」を含むボタンどうしで、片方が他方の部分文字列にならない', function() {
    var labels = buttonLabels(html()).filter(function(b) { return b.text.indexOf('保存') >= 0; });
    var bad = [];
    labels.forEach(function(a) {
      labels.forEach(function(b) {
        if (a === b || sameOp(a, b)) return;
        if (b.text.indexOf(a.text) >= 0) bad.push(a.id + '「' + a.text + '」 ⊂ ' + b.id + '「' + b.text + '」');
      });
    });
    expect(bad.join(' / ')).toBe('');
  });
});
