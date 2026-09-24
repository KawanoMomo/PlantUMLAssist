'use strict';
window.MA = window.MA || {};

// svg-text-diff — 2 枚の図 (PlantUML の SVG) を「描かれている文字」で突き合わせ、
// 片方にしか無い文字の <text> に印 (class) を付ける。
//
// BLK-builder-20260924-1823-2 (design 10c): コミットと比較している間、
// 左のプレビューでは「そのコミットに無い文字」(増えた・変わった) を、
// 右の枠のコミット時点の図では「作業中に無い文字」(消えた・変わった) を色で示す。
// 色は CSS (plantuml-assist.html) が持ち、ここは印を付け外しするだけ。
//
// 同じ文字が何度も出る図 (参加者名は上下 2 回描かれる等) があるので、
// 相手の文字は個数で持ち、出てきた順に 1 つずつ消し込む (相手より多い分だけに印が付く)。
window.MA.svgTextDiff = (function() {
  var CLS_ADD = 'gd-add';
  var CLS_DEL = 'gd-del';

  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function _textEls(svg) {
    if (!svg || !svg.querySelectorAll) return [];
    var out = [];
    var list = svg.querySelectorAll('text');
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  // svg に描かれている文字を上から順に (空は除く)。
  function texts(svg) {
    var out = [];
    _textEls(svg).forEach(function(el) {
      var t = norm(el.textContent);
      if (t) out.push(t);
    });
    return out;
  }

  function _bag(list) {
    var bag = Object.create(null);
    (list || []).forEach(function(t) {
      var k = norm(t);
      if (!k) return;
      bag[k] = (bag[k] || 0) + 1;
    });
    return bag;
  }

  // 相手 (other: 文字の並び) に無い文字の <text> に cls を付ける。付けた文字を返す。
  function mark(svg, other, cls) {
    var c = cls || CLS_ADD;
    var bag = _bag(other);
    var hit = [];
    _textEls(svg).forEach(function(el) {
      var t = norm(el.textContent);
      if (!t) return;
      if (bag[t] > 0) { bag[t]--; return; }
      if (el.classList) el.classList.add(c);
      hit.push(t);
    });
    return hit;
  }

  function unmark(svg, cls) {
    var c = cls || CLS_ADD;
    if (!svg || !svg.querySelectorAll) return 0;
    var list = svg.querySelectorAll('text.' + c);
    for (var i = 0; i < list.length; i++) list[i].classList.remove(c);
    return list.length;
  }

  // 枠の中の 1 行。増えた・消えた文字の数を言う (0 件の側は言わない)。
  function legend(added, removed) {
    var a = (added && added.length) || 0;
    var r = (removed && removed.length) || 0;
    if (!a && !r) return '図の色: このコミットと作業中で、図に描かれている文字は同じです';
    var parts = [];
    if (a) parts.push('緑 = このコミットの後に増えた・変わった文字 (左の図 ' + a + ' か所)');
    if (r) parts.push('赤 = このコミットにだけある文字 (右の図 ' + r + ' か所)');
    return '図の色: ' + parts.join(' / ');
  }

  return {
    CLS_ADD: CLS_ADD,
    CLS_DEL: CLS_DEL,
    norm: norm,
    texts: texts,
    mark: mark,
    unmark: unmark,
    legend: legend,
  };
})();
