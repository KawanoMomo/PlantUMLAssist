'use strict';
window.MA = window.MA || {};

// seq-place — シーケンス図の「追加する位置」(BLK-owner-20260924-2232-3)。
//
// alt に else を足すと end の直前に空の else が入るだけで、else 側へメッセージを
// 入れる手段がフォームに無かった (空の else は描かれず押せない)。状態遷移・クラス・
// コンポーネントの追加フォームと同じ名前の「追加する位置」を置き、枠ごと・分岐ごとの
// 末尾を選べるようにする。
//
// 分岐 (branch) は枠の頭の行 (alt / else) から次の else か end までの区間。
// 足す本体は groupPlace.placeAdded に任せ、分岐を「頭の行 = startLine、閉じの行 =
// endLine」の仮の境界として渡す (閉じの行の直前へ、頭の行の 1 段内側で入る)。
window.MA.seqPlace = (function() {
  var END = 'end';
  var ELSE_RE = /^else(?:\s+(.*))?$/;

  function _s(v) { return v == null ? '' : String(v); }

  function _usable(groups) {
    return (groups || []).filter(function(g) { return g && g.line > 0 && g.endLine > g.line; });
  }

  function _byId(groups, id) {
    var gs = groups || [];
    for (var i = 0; i < gs.length; i++) if (gs[i] && gs[i].id === id) return gs[i];
    return null;
  }

  function _head(g) { return _s(g.gtype) + (g.label ? '『' + _s(g.label) + '』' : ''); }

  // 入れ子の枠は「外 › 内」で出す。
  function pathOf(groups, g) {
    var names = [];
    var cur = g;
    var guard = 0;
    while (cur && guard++ < 50) {
      names.unshift(_head(cur));
      cur = cur.parentId ? _byId(groups, cur.parentId) : null;
    }
    return names.join(' › ');
  }

  // 枠 g の分岐。g の直下の else だけを数える (内側の枠の else は内側のもの)。
  // 返す各分岐: { index, head (1 始まりの頭の行), close (次の else か end の行), label }
  function branchesOf(text, groups, g) {
    var lines = _s(text).split('\n');
    var inner = _usable(groups).filter(function(h) { return h !== g && h.line > g.line && h.endLine < g.endLine; });
    var heads = [{ line: g.line, label: null }];
    for (var ln = g.line + 1; ln < g.endLine; ln++) {
      var m = _s(lines[ln - 1]).trim().match(ELSE_RE);
      if (!m) continue;
      var nested = inner.some(function(h) { return h.line < ln && ln < h.endLine; });
      if (nested) continue;
      heads.push({ line: ln, label: (m[1] || '').trim() });
    }
    return heads.map(function(h, i) {
      return {
        index: i, head: h.line, label: h.label,
        close: i + 1 < heads.length ? heads[i + 1].line : g.endLine,
      };
    });
  }

  function _branchLabel(groups, g, br, count) {
    var base = pathOf(groups, g);
    if (br.index === 0) return base + 'の中';
    if (br.label) return base + 'の else『' + br.label + '』側';
    return base + 'の else 側' + (count > 2 ? ' (' + br.index + ' つ目)' : '');
  }

  // 追加フォームの候補。value は「枠の出てくる順 : 分岐の順」(行番号は使わない。
  // 同じ追加で参加者の行が前に入っても指す先がずれない)。
  function options(text, groups) {
    var out = [{ value: END, label: '図の末尾' }];
    var all = groups || [];
    all.forEach(function(g, gi) {
      if (!g || !(g.line > 0 && g.endLine > g.line)) return;
      var brs = branchesOf(text, all, g);
      brs.forEach(function(br) {
        out.push({ value: 'g' + gi + ':' + br.index, label: _branchLabel(all, g, br, brs.length) });
      });
    });
    return out;
  }

  // 候補の value から、placeAdded に渡す仮の境界を作る。
  function rangeOf(text, groups, value) {
    var m = _s(value).match(/^g(\d+):(\d+)$/);
    if (!m) return null;
    var g = (groups || [])[parseInt(m[1], 10)];
    if (!g || !(g.line > 0 && g.endLine > g.line)) return null;
    var br = branchesOf(text, groups, g)[parseInt(m[2], 10)];
    if (!br) return null;
    return { startLine: br.head, endLine: br.close };
  }

  // before → after で末尾に入った塊を、選んだ分岐の末尾へ移す。
  function place(before, after, groups, value) {
    if (!value || value === END) return after;
    var r = rangeOf(before, groups, value);
    if (!r || !window.MA.groupPlace) return after;
    return window.MA.groupPlace.placeAdded(before, after, r);
  }

  // ── フォームの状態 ──────────────────────────────────────────────
  // 分岐へ足した直後・else を足した直後は、次の追加も同じ分岐を既定にする。
  // 候補の見出しで覚え、同じ見出しが複数あれば後ろ (最後に作った方) を選ぶ。
  var _remembered = null;

  function remember(label) { _remembered = label == null ? null : _s(label); }
  function forget() { _remembered = null; }

  function preferred(text, groups) {
    if (_remembered == null) return END;
    var hit = END;
    options(text, groups).forEach(function(o) { if (o.label === _remembered) hit = o.value; });
    return hit;
  }

  // else を足した後の本文で、その else 側の見出しを覚える (次の 1 本をそのまま入れられる)。
  function rememberElse(text, groups, groupLine, elseLine) {
    var all = groups || [];
    for (var gi = 0; gi < all.length; gi++) {
      var g = all[gi];
      if (!g || g.line !== groupLine) continue;
      var brs = branchesOf(text, all, g);
      for (var i = 0; i < brs.length; i++) {
        if (brs[i].head === elseLine) { remember(_branchLabel(all, g, brs[i], brs.length)); return true; }
      }
    }
    return false;
  }

  function labelOf(text, groups, value) {
    var opts = options(text, groups);
    for (var i = 0; i < opts.length; i++) if (opts[i].value === value) return opts[i].label;
    return null;
  }

  // 追加フォームの欄。枠が 1 つも無ければ出さない (選べるものが「末尾」だけ)。
  function fieldHtml(idPrefix, text, groups) {
    var P = window.MA.properties;
    var opts = options(text, groups);
    if (opts.length <= 1 || !P) return '';
    var cur = preferred(text, groups);
    return '<div id="' + idPrefix + '-place-box">' +
      P.selectFieldHtml('追加する位置', idPrefix + '-place', opts.map(function(o) {
        return { value: o.value, label: o.label, selected: o.value === cur };
      })) + '</div>';
  }

  // 追加ボタンの後処理。t は足す前の本文 (新しい参加者を先に足したならその後)。
  function applyAdd(idPrefix, parse, before, after) {
    var el = document.getElementById(idPrefix + '-place');
    var v = el ? el.value : END;
    if (!v || v === END) { forget(); return after; }
    var groups = (parse(before) || {}).groups || [];
    remember(labelOf(before, groups, v));
    return place(before, after, groups, v);
  }

  return {
    END: END,
    pathOf: pathOf,
    branchesOf: branchesOf,
    options: options,
    rangeOf: rangeOf,
    place: place,
    remember: remember,
    forget: forget,
    preferred: preferred,
    rememberElse: rememberElse,
    labelOf: labelOf,
    fieldHtml: fieldHtml,
    applyAdd: applyAdd,
  };
})();
