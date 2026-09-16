'use strict';
window.MA = window.MA || {};

// state-tree — 状態の入れ子を階層ツリーで見て、選んだ階層だけを図に出す
// (BLK-junior-20260916-0526-wish)。
//
// 子状態を足す口 (state-child) は 1 手に畳んだが、足した後に「今どの階層に
// 何があるか」を見る画面が無く、確かめられるのは元の 1 枚のズーム図の中だけ
// だった。親が増え、子が孫を持つようになると、図の中の入れ子は小さく潰れて
// 追えなくなる。ここは入れ子そのものを木として出し、選んだ階層だけを
// 図に大きく描き直すための素材を作る。
//
//   rows()     … 親→子→孫を出現順に並べた行 (深さ付き)。左の木はこれで描く
//   subtree()  … ある階層に属する状態 (自分と子孫)
//   focusDsl() … その階層だけの @startuml。図をそのまま大きく描ける
//
// 遷移は `Sub1 --> Sub2` のように親を省いて書かれるので、id の突合は
// 完全修飾 (`Parent.Sub1`) と末尾 (`Sub1`) の両方で行う。
// DOM にも fetch にも触らない純関数だけ。画面は app.js / modules/state.js。
window.MA.stateTree = (function() {

  function _s(v) { return v == null ? '' : String(v).trim(); }

  function _states(parsed) { return (parsed && parsed.states) || []; }
  function _transitions(parsed) { return (parsed && parsed.transitions) || []; }

  function _bare(id) {
    var s = _s(id);
    return s.indexOf('.') >= 0 ? s.split('.').pop() : s;
  }

  function byId(parsed, id) {
    var ss = _states(parsed);
    var target = _s(id);
    for (var i = 0; i < ss.length; i++) if (ss[i].id === target) return ss[i];
    return null;
  }

  function childrenOf(parsed, id) {
    var pid = id == null ? null : _s(id);
    return _states(parsed).filter(function(s) {
      var p = s.parentId == null ? null : _s(s.parentId);
      return p === pid;
    });
  }

  // 自分と子孫の id。階層を丸ごと扱う操作 (焦点・数え上げ) の土台。
  function subtree(parsed, id) {
    var root = byId(parsed, id);
    if (!root) return [];
    var out = [root.id];
    childrenOf(parsed, root.id).forEach(function(c) {
      out = out.concat(subtree(parsed, c.id));
    });
    return out;
  }

  function depthOf(parsed, id) {
    var cur = byId(parsed, id);
    var d = 0;
    var guard = 0;
    while (cur && cur.parentId && guard++ < 50) {
      d++;
      cur = byId(parsed, cur.parentId);
    }
    return d;
  }

  // 木の行。親のすぐ後ろにその子を並べるので、そのまま上から描けば
  // 親→子→孫の形になる。閉じた親の下は畳めるよう childCount を持たせる。
  function rows(parsed) {
    var out = [];
    function walk(parentId, depth) {
      childrenOf(parsed, parentId).forEach(function(s) {
        var kids = childrenOf(parsed, s.id);
        out.push({
          id: s.id,
          bareId: _bare(s.id),
          label: _s(s.label) || _bare(s.id),
          parentId: s.parentId == null ? null : _s(s.parentId),
          depth: depth,
          line: s.line,
          endLine: s.endLine,
          stereotype: s.stereotype || null,
          childCount: kids.length,
          descendantCount: Math.max(0, subtree(parsed, s.id).length - 1),
          hasChildren: kids.length > 0,
        });
        walk(s.id, depth + 1);
      });
    }
    walk(null, 0);
    return out;
  }

  function maxDepth(parsed) {
    var m = 0;
    rows(parsed).forEach(function(r) { if (r.depth > m) m = r.depth; });
    return m;
  }

  // 入れ子を持つ状態だけ。「広げて中を見る」対象になるのはここだけなので、
  // 焦点の候補もこれで作る。
  function compositeRows(parsed) {
    return rows(parsed).filter(function(r) { return r.hasChildren; });
  }

  function breadcrumb(parsed, id) {
    var out = [];
    var cur = byId(parsed, id);
    var guard = 0;
    while (cur && guard++ < 50) {
      out.unshift(_s(cur.label) || _bare(cur.id));
      cur = cur.parentId ? byId(parsed, cur.parentId) : null;
    }
    return out;
  }

  function breadcrumbText(parsed, id) {
    return breadcrumb(parsed, id).join(' › ');
  }

  // 下端の 1 行。木を開いた人が最初に知りたいのは「どこまで深いか」。
  function summaryText(parsed) {
    var all = rows(parsed);
    var comps = all.filter(function(r) { return r.hasChildren; });
    return '状態 ' + all.length + ' · 入れ子の親 ' + comps.length +
      ' · 最も深い階層 ' + (maxDepth(parsed) + (all.length ? 1 : 0)) + ' 段';
  }

  // 遷移の端が、この階層 (自分と子孫) の中を指しているか。
  // 遷移は親を省いて書かれるので末尾でも突合する。`[*]` は階層の中でも使える。
  function _inSet(ids, endpoint) {
    var e = _s(endpoint);
    if (!e) return false;
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] === e || _bare(ids[i]) === e) return true;
    }
    return false;
  }

  // その階層に閉じている遷移。両端が中にある (片端が `[*]` なら中の開始・終了)。
  function transitionsIn(parsed, id) {
    var ids = subtree(parsed, id);
    if (!ids.length) return [];
    return _transitions(parsed).filter(function(t) {
      var from = _s(t.from), to = _s(t.to);
      var fIn = from === '[*]' || _inSet(ids, from);
      var tIn = to === '[*]' || _inSet(ids, to);
      if (from === '[*]' && to === '[*]') return false;
      return fIn && tIn;
    });
  }

  // その階層の外と行き来する遷移。焦点の図には描けないので、
  // 「この階層は外と 2 本つながっている」と数だけ伝えるために使う。
  function boundaryTransitions(parsed, id) {
    var ids = subtree(parsed, id);
    if (!ids.length) return [];
    return _transitions(parsed).filter(function(t) {
      var from = _s(t.from), to = _s(t.to);
      var fIn = _inSet(ids, from);
      var tIn = _inSet(ids, to);
      return (fIn && !tIn && to !== '[*]') || (!fIn && tIn && from !== '[*]');
    });
  }

  function _minIndent(lines) {
    var min = null;
    lines.forEach(function(l) {
      if (!_s(l)) return;
      var n = (l.match(/^\s*/) || [''])[0].length;
      if (min === null || n < min) min = n;
    });
    return min || 0;
  }

  // 選んだ階層だけの図。元の行をそのまま持ってくるので、entry/do/exit・note・
  // 色・並行領域 (`--`) といった中身の書き方は一切変換せずに残る。
  // 親の宣言ごと持ってくるのは、焦点の図でも「どの状態の中を見ているか」の
  // 枠が要るため (中身だけにすると根無しの図になる)。
  function focusDsl(text, parsed, id) {
    var st = byId(parsed, id);
    if (!st) return '';
    var lines = String(text == null ? '' : text).split('\n');
    var from = st.line - 1;
    var to = (st.endLine || st.line) - 1;
    if (from < 0 || from >= lines.length) return '';
    if (to < from || to >= lines.length) to = from;
    var block = lines.slice(from, to + 1);
    var cut = _minIndent(block);
    block = block.map(function(l) { return l.slice(cut); });

    var out = ['@startuml'];
    var title = parsed && parsed.meta && _s(parsed.meta.title);
    var trail = breadcrumbText(parsed, id);
    out.push('title ' + (title ? title + ' — ' : '') + trail);
    out = out.concat(block);

    // ブロックの外に書かれた、この階層に閉じた遷移も入れる
    // (`Parent.Sub1 --> Parent.Sub2` を外で書く人が居る)。
    var inBlock = {};
    for (var i = from; i <= to; i++) inBlock[i + 1] = true;
    transitionsIn(parsed, id).forEach(function(t) {
      if (inBlock[t.line]) return;
      var raw = lines[t.line - 1];
      if (raw != null) out.push(_s(raw));
    });
    out.push('@enduml');
    return out.join('\n');
  }

  // 焦点の見出し。「どこを見ているか」と「外とのつながりが何本あるか」。
  // 外との線は焦点の図に出ないので、数を言わないと消えたように見える。
  function focusLabel(parsed, id) {
    var st = byId(parsed, id);
    if (!st) return '';
    var kids = childrenOf(parsed, id).length;
    var bt = boundaryTransitions(parsed, id).length;
    var text = breadcrumbText(parsed, id) + ' の中だけを表示中 · 子状態 ' + kids +
      ' · 内部の遷移 ' + transitionsIn(parsed, id).length;
    if (bt) text += ' · 外と ' + bt + ' 本つながっています (この図には出ません)';
    return text;
  }

  return {
    byId: byId,
    childrenOf: childrenOf,
    subtree: subtree,
    depthOf: depthOf,
    rows: rows,
    maxDepth: maxDepth,
    compositeRows: compositeRows,
    breadcrumb: breadcrumb,
    breadcrumbText: breadcrumbText,
    summaryText: summaryText,
    transitionsIn: transitionsIn,
    boundaryTransitions: boundaryTransitions,
    focusDsl: focusDsl,
    focusLabel: focusLabel,
  };
})();
