'use strict';
window.MA = window.MA || {};

// state-table — 状態遷移図を「現在の状態 × きっかけ」の表として見る (design 4c)。
//
// 図だけを見ていると、ある状態がどのきっかけを受け取らないのかが分からない。
// 表にすると空欄がそのまま「未定義の遷移」として目に入る。図と表は同じ
// parsed から作るので、片方だけが古くなることはない。
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.stateTable = (function() {
  var START_LABEL = '（開始）';
  var END_LABEL = '（終了）';
  var NO_TRIGGER = '（きっかけなし）';
  var EMPTY_CELL = '—';

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 表示名。`[*]` は行では「（開始）」、セル (遷移先) では「（終了）」。
  // 同じ記号が位置で意味を変えるので、呼ぶ側に判断を残さず 2 つに分ける。
  function fromLabel(id, states) {
    if (_s(id) === '[*]') return START_LABEL;
    return _stateLabel(id, states);
  }

  function toLabel(id, states) {
    if (_s(id) === '[*]') return END_LABEL;
    return _stateLabel(id, states);
  }

  function _stateLabel(id, states) {
    var target = _s(id);
    var list = states || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === target) return _s(list[i].label) || target;
    }
    return target;
  }

  // 列見出し。図に出てくる trigger を出現順に一意化する。ラベルの無い遷移
  // ([*] --> Idle など) も列を 1 つ持たせないと表から消えてしまうため、
  // 「（きっかけなし）」という列にまとめる。
  function triggerColumns(parsed) {
    var transitions = (parsed && parsed.transitions) || [];
    var seen = {};
    var cols = [];
    transitions.forEach(function(tr) {
      var key = _s(tr.trigger) || NO_TRIGGER;
      if (seen[key]) return;
      seen[key] = true;
      cols.push(key);
    });
    return cols;
  }

  // BLK-human-20260923-2001: 入れ子 (`state P { state C ... }`) の子は parse() で `P.C` の
  // id を持つが、遷移の行には `C` と素の名前で書かれる。遷移が書かれた複合状態 (scope)
  // の中から引き、無ければ同じ素の名前の状態を探す。`[*]` は scope ごとに別の開始・終了。
  function _bare(id) { var t = _s(id); return t.indexOf('.') >= 0 ? t.split('.').pop() : t; }

  function _byId(states) {
    var m = {};
    (states || []).forEach(function(s) { m[s.id] = s; });
    return m;
  }

  // 遷移の端 (from / to) を表の行 id にする。`[*]` は scope つきの開始行 id。
  function resolveEnd(name, scope, states) {
    var n = _s(name);
    var sc = _s(scope);
    if (n === '[*]') return sc ? '[*]@' + sc : '[*]';
    var map = _byId(states);
    if (sc && map[sc + '.' + n]) return sc + '.' + n;
    if (map[n]) return n;
    var list = states || [];
    for (var i = 0; i < list.length; i++) if (_bare(list[i].id) === n) return list[i].id;
    // BLK-owner-20260923-2332-1: `親.子` と修飾して書かれた端 (他ツールや手書きの図の記法)。
    // 入れ子の途中を省いた書き方 (`子.孫`) も、id の後ろが一致すれば同じ状態として引く。
    if (n.indexOf('.') >= 0) {
      for (var j = 0; j < list.length; j++) {
        var id = _s(list[j].id);
        if (id.length > n.length && id.slice(-(n.length + 1)) === '.' + n) return id;
      }
    }
    return n;
  }

  function _startScope(rowId) {
    var r = _s(rowId);
    if (r === '[*]') return '';
    return r.indexOf('[*]@') === 0 ? r.slice(4) : null;
  }

  // 行の見出し。子は `親 / 子`、scope の開始は `親 / （開始）`。
  function rowLabel(rowId, states) {
    var sc = _startScope(rowId);
    if (sc === '') return START_LABEL;
    if (sc) return _pathLabel(sc, states) + ' / ' + START_LABEL;
    return _pathLabel(rowId, states);
  }

  function _pathLabel(id, states) {
    var map = _byId(states);
    var parts = [];
    var cur = map[id];
    var guard = 0;
    if (!cur) return _stateLabel(id, states);
    while (cur && guard++ < 50) {
      parts.unshift(_s(cur.label) || _bare(cur.id));
      cur = cur.parentId ? map[cur.parentId] : null;
    }
    return parts.join(' / ');
  }

  function _depthOf(id, states) {
    var map = _byId(states);
    var d = 0;
    var cur = map[id];
    while (cur && cur.parentId && d < 50) { d++; cur = map[cur.parentId]; }
    return d;
  }

  // 行見出し。最上位の開始 → 状態を木の順 (親の直後にその中の開始、続けて子) で並べる。
  // 入れ子の子も全部行にする (遷移の起点になっていない状態も、空欄から遷移を足せるように出す)。
  // 宣言の無い名前 (遷移の行にしか出てこない状態) は最後に足す。
  function rowStates(parsed) {
    var transitions = (parsed && parsed.transitions) || [];
    var states = (parsed && parsed.states) || [];
    var usedStart = {};
    var fromIds = [];
    transitions.forEach(function(tr) {
      var f = resolveEnd(tr.from, tr.scope, states);
      if (_s(tr.from) === '[*]') usedStart[_s(tr.scope)] = true;
      fromIds.push(f);
    });

    var rows = [];
    var seen = {};
    function push(id) { if (!seen[id]) { seen[id] = true; rows.push(id); } }
    if (usedStart['']) push('[*]');
    var children = {};
    var roots = [];
    states.forEach(function(s) {
      if (s.parentId) (children[s.parentId] = children[s.parentId] || []).push(s);
      else roots.push(s);
    });
    function walk(s) {
      push(s.id);
      if (usedStart[s.id]) push('[*]@' + s.id);
      (children[s.id] || []).forEach(walk);
    }
    roots.forEach(walk);
    // 親が見つからない子 (壊れた入力) も落とさない
    states.forEach(function(s) { push(s.id); });
    fromIds.forEach(function(f) { if (f) push(f); });
    return rows;
  }

  // 表の本体。cells[i][j] は null (未定義の遷移) か、遷移 1 本ぶんの情報。
  // 同じ状態・同じ trigger の遷移が複数あるとき (guard で分かれる分岐) は
  // 1 セルにまとめ、guard を併記する。分岐を「重複」として捨てない。
  // 行は { stateId, label, depth, parentId, hasChildren, cells }。
  function build(parsed) {
    var states = (parsed && parsed.states) || [];
    var transitions = (parsed && parsed.transitions) || [];
    var cols = triggerColumns(parsed);
    var rowIds = rowStates(parsed);
    var map = _byId(states);

    var index = {};
    transitions.forEach(function(tr) {
      var key = resolveEnd(tr.from, tr.scope, states) + '\u0000' + (_s(tr.trigger) || NO_TRIGGER);
      (index[key] = index[key] || []).push(tr);
    });

    var hasKids = {};
    states.forEach(function(s) { if (s.parentId) hasKids[s.parentId] = true; });

    var rows = rowIds.map(function(id) {
      var cells = cols.map(function(col) {
        var hits = index[id + '\u0000' + col];
        if (!hits || hits.length === 0) return null;
        return {
          transitionId: hits[0].id,
          line: hits[0].line,
          to: resolveEnd(hits[0].to, hits[0].scope, states),
          text: hits.map(function(tr) {
            var label = _s(tr.to) === '[*]' ? END_LABEL : _pathLabel(resolveEnd(tr.to, tr.scope, states), states);
            var g = _s(tr.guard);
            return g ? label + ' [' + g + ']' : label;
          }).join(' / '),
          count: hits.length,
        };
      });
      var sc = _startScope(id);
      var parentId = sc === null ? ((map[id] && map[id].parentId) || null) : (sc || null);
      var depth = sc === null ? _depthOf(id, states) : (sc ? _depthOf(sc, states) + 1 : 0);
      return {
        stateId: id, label: rowLabel(id, states), cells: cells,
        depth: depth, parentId: parentId, hasChildren: !!hasKids[id],
      };
    });

    return { triggers: cols, rows: rows };
  }

  // 行 id の祖先 (畳んだ親の中の行を隠すため)。
  function ancestorsOf(rowId, parsed) {
    var states = (parsed && parsed.states) || [];
    var map = _byId(states);
    var sc = _startScope(rowId);
    var cur = sc === null ? (map[rowId] && map[rowId].parentId) : (sc || null);
    var out = [];
    var guard = 0;
    while (cur && guard++ < 50) { out.push(cur); cur = map[cur] ? map[cur].parentId : null; }
    return out;
  }

  // 表を数える。表の下に出す「2 states · 4 transitions」相当の要約。
  function summaryText(table) {
    var t = table || { triggers: [], rows: [] };
    var filled = 0;
    t.rows.forEach(function(r) {
      r.cells.forEach(function(c) { if (c) filled += c.count; });
    });
    var total = t.rows.length * t.triggers.length;
    return t.rows.length + ' 行 · ' + t.triggers.length + ' きっかけ · ' +
      filled + ' 遷移 · 空欄 ' + (total - filled);
  }

  // CSV。Excel で開いて仕様書に貼れる形。`,` `"` 改行を含む値は引用する。
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(table) {
    var t = table || { triggers: [], rows: [] };
    var lines = [];
    lines.push([csvCell('現在の状態 \\ きっかけ')].concat(
      t.triggers.map(csvCell)).join(','));
    t.rows.forEach(function(r) {
      lines.push([csvCell(r.label)].concat(r.cells.map(function(c) {
        return csvCell(c ? c.text : EMPTY_CELL);
      })).join(','));
    });
    return lines.join('\r\n');
  }

  return {
    START_LABEL: START_LABEL,
    END_LABEL: END_LABEL,
    NO_TRIGGER: NO_TRIGGER,
    EMPTY_CELL: EMPTY_CELL,
    fromLabel: fromLabel,
    toLabel: toLabel,
    triggerColumns: triggerColumns,
    rowStates: rowStates,
    resolveEnd: resolveEnd,
    rowLabel: rowLabel,
    ancestorsOf: ancestorsOf,
    build: build,
    summaryText: summaryText,
    toCsv: toCsv,
  };
})();
