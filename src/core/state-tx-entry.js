'use strict';
window.MA = window.MA || {};

// state-tx-entry — 状態遷移を「続けて」入れるための判断。
//
// 状態機械の設計では遷移を 1 図に 10〜30 本入れる。1 本ごとにフォームが初期状態へ戻り、
// トリガは毎回手打ち、遷移先は図から選べず、続けて入れられなかった。
// ここは DOM を触らずに、
//   - 候補 (この図の遷移で使ったトリガ・ガード・アクション)
//   - 候補の絞り込み (打ち始めで絞る)
//   - 次の 1 本の from (直前の to / 直前と同じ)
//   - 書き込む位置 (同じ from の遷移の並びの末尾。無ければ同じ階層の遷移の末尾)
// を決める。
window.MA.stateTxEntry = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // `Idle.Sub` → `Sub`。擬似状態 `[*]` はそのまま。
  function shortId(qid) {
    var s = _s(qid).trim();
    if (s === '[*]' || s.indexOf('.') < 0) return s;
    return s.slice(s.lastIndexOf('.') + 1);
  }

  function _findState(parsed, qid) {
    var states = (parsed && parsed.states) || [];
    for (var i = 0; i < states.length; i++) if (states[i].id === qid) return states[i];
    // 短い名前で書かれた参照 (`Sub`) は、同じ短い名前の状態が 1 つだけなら当てる。
    var hit = null;
    for (var j = 0; j < states.length; j++) {
      if (shortId(states[j].id) === _s(qid)) { if (hit) return null; hit = states[j]; }
    }
    return hit;
  }

  // その状態が書かれている階層 (親の複合状態の id。最上位は '')。
  function scopeOf(parsed, qid) {
    var st = _findState(parsed, qid);
    return st && st.parentId ? st.parentId : '';
  }

  function _composites(parsed) {
    return ((parsed && parsed.states) || []).filter(function(s) { return s.endLine > s.line; });
  }

  // 行番号 (1 始まり) を含むいちばん内側の複合状態の id。最上位は ''。
  function scopeOfLine(parsed, line) {
    var best = null;
    _composites(parsed).forEach(function(c) {
      if (c.line < line && line < c.endLine) {
        if (!best || (c.line >= best.line && c.endLine <= best.endLine)) best = c;
      }
    });
    return best ? best.id : '';
  }

  // ── 候補 ─────────────────────────────────────────────────────────────
  function _bump(map, order, v) {
    var k = _s(v).trim();
    if (!k) return;
    if (!map.hasOwnProperty(k)) { map[k] = 0; order.push(k); }
    map[k]++;
  }

  function _ranked(map, order) {
    return order.slice().sort(function(a, b) {
      if (map[b] !== map[a]) return map[b] - map[a];
      return order.indexOf(a) - order.indexOf(b);
    });
  }

  // シーケンス図の本文からメッセージ名を拾う (`A -> B : Spi_Init(ch)` → `Spi_Init`)。
  var ARROW_RE = /-+(?:\[[^\]]*\])?-*>|<-+/;
  function messageNames(seqText) {
    var out = [];
    var seen = {};
    _s(seqText).split('\n').forEach(function(line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === "'" || /^note\b/i.test(trimmed)) return;
      var am = ARROW_RE.exec(trimmed);
      if (!am) return;
      var colon = trimmed.indexOf(':', am.index);
      if (colon < 0) return;
      var label = trimmed.slice(colon + 1).replace(/\\n.*$/, '').trim();
      var paren = label.indexOf('(');
      var name = (paren > 0 ? label.slice(0, paren) : label).trim();
      if (!name || name.length > 60 || seen[name]) return;
      seen[name] = true;
      out.push(name);
    });
    return out;
  }

  // parsed: この図 (入れ子の子状態の遷移も parse に入っている)。
  // extraTriggers: 呼び出し側が足したい名前 (後ろに足す)。画面は今の図の中の名前だけを使い、渡さない。
  function candidates(parsed, extraTriggers) {
    var tm = {}, to = [], gm = {}, go = [], am = {}, ao = [];
    ((parsed && parsed.transitions) || []).forEach(function(tr) {
      _bump(tm, to, tr.trigger);
      _bump(gm, go, tr.guard);
      _bump(am, ao, tr.action);
    });
    var triggers = _ranked(tm, to);
    var seen = {};
    triggers.forEach(function(t) { seen[t] = true; });
    (extraTriggers || []).forEach(function(n) {
      var k = _s(n).trim();
      if (k && !seen[k]) { seen[k] = true; triggers.push(k); }
    });
    var actions = _ranked(am, ao);
    var seenA = {};
    actions.forEach(function(a) { seenA[a] = true; });
    (extraTriggers || []).forEach(function(n) {
      var k = _s(n).trim();
      if (k && !seenA[k]) { seenA[k] = true; actions.push(k); }
    });
    return { triggers: triggers, guards: _ranked(gm, go), actions: actions };
  }

  // 打ち始めで絞る。前方一致を先に、途中一致を後に。大小を問わない。打った語そのものは出さない。
  function filter(list, typed, limit) {
    var q = _s(typed).trim().toLowerCase();
    var max = limit || 8;
    var arr = Array.isArray(list) ? list : [];
    if (!q) return arr.slice(0, max);
    var head = [], mid = [];
    arr.forEach(function(c) {
      var l = _s(c).toLowerCase();
      if (l === q) return;
      if (l.indexOf(q) === 0) head.push(c);
      else if (l.indexOf(q) > 0) mid.push(c);
    });
    return head.concat(mid).slice(0, max);
  }

  // ── 続けて入れる ─────────────────────────────────────────────────────
  // 確定した 1 本の後、次の from。mode: 'to' (直前の遷移先から) / 'same' (直前と同じ from)。
  // 終了 ([*] へ入った) の後は遷移元に戻す ([*] から先へは出られない)。
  function nextFrom(mode, lastFrom, lastTo) {
    if (mode === 'same') return _s(lastFrom);
    if (_s(lastTo) === '[*]') return _s(lastFrom);
    return _s(lastTo);
  }

  // 開いた直後・タブを替えた直後 (選んだ状態も確定の覚えも無いとき) の From。
  // 前は一覧の先頭の `[*]` で始まり、To だけ選んで足すと選んでいない開始の遷移
  // (`[*] --> Stop`) が入った (TICKET-owner-20261123-2322-3)。sequence の openMessageEnds と同じ形で、
  // 本文の行の順で最後の遷移の行き先から続ける。行き先が終了 `[*]` (と履歴 `[H]`) ならその遷移の始点
  // (nextFrom と同じ考え)。両端とも状態でない遷移は飛ばして前の遷移を見る。
  // resolve(name, scope) は書かれた端を選択肢の値 (入れ子は `Parent.Child`) にする口 (省くと書かれたまま)。
  // 返り値 { from, source }。source: 'last' (最後の遷移の行き先) / 'lastEnd' (行き先が終了なので始点) / 'none'。
  var _HIST_RE = /\[H\*?\]$/;
  function _isStateEnd(v) { var s = _s(v).trim(); return !!s && s !== '[*]' && !_HIST_RE.test(s); }
  function openFrom(transitions, resolve) {
    var res = typeof resolve === 'function' ? resolve : function(n) { return n; };
    var trs = (transitions || []).filter(function(tr) { return !!tr; }).map(function(tr, i) { return { tr: tr, i: i }; });
    trs.sort(function(a, b) {
      var la = typeof a.tr.line === 'number' ? a.tr.line : -1;
      var lb = typeof b.tr.line === 'number' ? b.tr.line : -1;
      return la !== lb ? la - lb : a.i - b.i;
    });
    for (var k = trs.length - 1; k >= 0; k--) {
      var tr = trs[k].tr;
      if (_isStateEnd(tr.to)) return { from: _s(res(_s(tr.to).trim(), tr.scope)), source: 'last' };
      if (_isStateEnd(tr.from)) return { from: _s(res(_s(tr.from).trim(), tr.scope)), source: 'lastEnd' };
    }
    return { from: '', source: 'none' };
  }

  // openFrom の出どころを 1 行で言う (From の欄の値と同じ名前を出す)。To を選ぶ手の案内を続ける。
  var PICK_TO_HINT = '図で遷移先の状態を押してください (同じ状態を押すと自己遷移)';
  function openFromNote(ends, labelOf) {
    var e = ends || {};
    if (!e.from) return '';
    var l = typeof labelOf === 'function' ? labelOf(e.from) : null;
    var name = _s(l || e.from);
    var head = e.source === 'lastEnd'
      ? '本文の最後の遷移の始点 ' + name + ' から続けます。'
      : '本文の最後の遷移先 ' + name + ' から続けます。';
    return head + PICK_TO_HINT;
  }

  // ── 書き込む位置 ─────────────────────────────────────────────────────
  function _indentOf(line) { return (_s(line).match(/^\s*/) || [''])[0]; }

  // 遷移行の直後に `note on link` があれば、その `end note` まで含めて 1 本とみなす。
  function _endOfTransition(lines, lineNum) {
    var i = lineNum; // 次の行 (0 始まり index で lineNum)
    if (i < lines.length && /^\s*note\s+on\s+link\b/i.test(lines[i])) {
      if (/:/.test(lines[i])) return i + 1;
      for (var j = i + 1; j < lines.length; j++) {
        if (/^\s*end\s*note\s*$/i.test(lines[j])) return j + 1;
      }
    }
    return lineNum;
  }

  // 遷移を置く階層。from / to は選択肢の値 (入れ子は `Parent.Child`、表の親の開始は `[*]@Parent`)。
  //   - `[*]@P` から → P の中
  //   - `[*]` から → to の階層 / `[*]` へ → from の階層
  //   - 状態どうし → 同じ親を持てばその中、親が違えば最上位
  function txScope(parsed, from, to) {
    var f = _s(from), t = _s(to);
    if (f.indexOf('[*]@') === 0) return f.slice(4);
    if (f === '[*]') return t === '[*]' ? '' : scopeOf(parsed, t);
    if (t === '[*]') return scopeOf(parsed, f);
    var fs = scopeOf(parsed, f), ts = scopeOf(parsed, t);
    return fs === ts ? fs : '';
  }

  // 1 本を組み立てて入れる。from / to は選択肢の値。
  // 行は短い名前で書き、txScope の階層に置く:
  //   1) 同じ階層で同じ from の遷移の並びの末尾
  //   2) 同じ階層の遷移の末尾
  //   3) 入れ子ならその複合状態の閉じ `}` の直前、最上位なら @enduml の直前
  // 返り値 { text, line }。line は入れた行 (1 始まり)。
  function insert(text, parsed, from, to, trigger, guard, action) {
    var ST = window.MA.stateTransition;
    var f = _s(from).indexOf('[*]@') === 0 ? '[*]' : shortId(from), t = shortId(to);
    if (!f || !t) return { text: text, line: 0 };
    var label = ST ? ST.composeLabel(trigger, guard, action) : _s(trigger).trim();
    var body = f + ' --> ' + t + (label ? ' : ' + label : '');
    var scope = txScope(parsed, from, to);
    var lines = _s(text).split('\n');
    var trs = ((parsed && parsed.transitions) || []).filter(function(tr) {
      return scopeOfLine(parsed, tr.line) === scope;
    });
    var same = trs.filter(function(tr) { return tr.from === f; });
    var anchor = same.length ? same[same.length - 1] : (trs.length ? trs[trs.length - 1] : null);
    var at, indent;
    if (anchor) {
      at = _endOfTransition(lines, anchor.line);
      indent = _indentOf(lines[anchor.line - 1]);
    } else if (scope) {
      var comp = _findState(parsed, scope);
      if (!comp || comp.endLine <= comp.line) return { text: text, line: 0 };
      at = comp.endLine - 1;
      indent = _indentOf(lines[at]) + '  ';
    } else {
      at = lines.length;
      for (var i = lines.length - 1; i >= 0; i--) {
        if (/^\s*@enduml\b/.test(lines[i])) { at = i; break; }
      }
      indent = '';
    }
    lines.splice(at, 0, indent + body);
    return { text: lines.join('\n'), line: at + 1 };
  }

  // 入れた本数の札。
  function countLabel(n) {
    var k = Number(n) || 0;
    return 'この回に入れた遷移: ' + k + ' 本';
  }

  return {
    shortId: shortId,
    scopeOf: scopeOf,
    scopeOfLine: scopeOfLine,
    txScope: txScope,
    messageNames: messageNames,
    candidates: candidates,
    filter: filter,
    nextFrom: nextFrom,
    openFrom: openFrom,
    openFromNote: openFromNote,
    PICK_TO_HINT: PICK_TO_HINT,
    insert: insert,
    countLabel: countLabel,
  };
})();
