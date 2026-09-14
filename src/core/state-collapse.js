'use strict';
window.MA = window.MA || {};

// state-collapse — 連なった遷移を 1 本にまとめる (BLK-primary-20260908-1403)。
//
// レビュー指摘「dma_state.puml だけ 1 メッセージが 4 遷移に分解されている。
// Idle→Configured→SrcDstSet→DmaReqEnabled→Transferring_Active を 1 遷移
// (Dma_Configure) にまとめる」を GUI で当てる口が無く、state 3 行 + 遷移 4 行を
// DSL エディタで選び直して打ち直していた。
//
// ここは「始点から終点までが 1 本道なら、その道を 1 本の遷移に畳む」だけを持つ。
// 畳むと途中の状態は行き場を失うので、他から参照されていないものだけ宣言ごと消す
// (どこかから来る道が残っている状態を消すと、図が壊れて指摘の解決にならない)。
// stateInsert.splitTransition の逆向きの操作。DOM には触らない。
window.MA.stateCollapse = (function() {

  function _s(v) { return v == null ? '' : String(v).trim(); }

  function _transitions(parsed) { return (parsed && parsed.transitions) || []; }
  function _states(parsed) { return (parsed && parsed.states) || []; }

  // 途中に置ける状態か。始点・終点そのものと `[*]` は途中に来ない。
  function _isPseudo(id) { return _s(id) === '[*]'; }

  // 始点から出る道を 1 本ずつたどる。途中で道が分かれる (出口が 2 本ある) か、
  // 途中の状態に別の入口があれば、そこで打ち切る — 分かれ道を畳むと、
  // 畳んだ先に行けなくなる枝ができる。
  function chainFrom(parsed, fromId) {
    var start = _s(fromId);
    var ts = _transitions(parsed);
    if (!start) return [];
    var out = [];
    var seen = {};
    seen[start] = true;
    var cur = start;
    for (;;) {
      // 途中まで来た状態から先へ延ばすには、その状態に別の入口が無いこと。
      // 入口が 2 本ある状態を途中に含めて畳むと、もう片方の道の行き先が消える。
      // (終点になる分には構わないので、この確かめは「先へ延ばす」ときだけ行う)
      if (out.length > 0) {
        var ins = ts.filter(function(x) { return _s(x.to) === cur; });
        if (ins.length !== 1) break;
      }
      var outs = ts.filter(function(t) { return _s(t.from) === cur; });
      if (outs.length !== 1) break;                 // 分かれ道は畳まない
      var t = outs[0];
      var next = _s(t.to);
      if (!next || seen[next]) break;               // 輪になっている道は畳まない
      out.push(t);
      seen[next] = true;
      cur = next;
      if (_isPseudo(next)) break;                   // 終端まで来たら終わり
    }
    return out;
  }

  // 「どこまでまとめられるか」の選択肢。始点から 2 本以上たどれる先だけを出す
  // (1 本しか無いものを「まとめる」と言われても何も変わらない)。
  function endOptions(parsed, fromId) {
    var chain = chainFrom(parsed, fromId);
    var out = [];
    for (var i = 1; i < chain.length; i++) {
      out.push({ value: _s(chain[i].to), label: _s(chain[i].to) + ' まで (' + (i + 1) + ' 遷移)' });
    }
    return out;
  }

  // まとめられる始点。1 本道が 2 遷移以上続く状態だけ。
  function startOptions(parsed) {
    var out = [];
    var seen = {};
    _transitions(parsed).forEach(function(t) {
      var id = _s(t.from);
      if (!id || seen[id]) return;
      seen[id] = true;
      if (chainFrom(parsed, id).length >= 2) out.push({ value: id, label: id });
    });
    return out;
  }

  // 始点から終点までの遷移。1 本道でつながっていなければ空。
  function pathBetween(parsed, fromId, toId) {
    var chain = chainFrom(parsed, fromId);
    var to = _s(toId);
    for (var i = 0; i < chain.length; i++) {
      if (_s(chain[i].to) === to) return chain.slice(0, i + 1);
    }
    return [];
  }

  // 畳むと消える状態 (始点と終点の間)。
  function droppedStates(parsed, fromId, toId) {
    var path = pathBetween(parsed, fromId, toId);
    var out = [];
    for (var i = 0; i < path.length - 1; i++) {
      var id = _s(path[i].to);
      if (id && !_isPseudo(id)) out.push(id);
    }
    return out;
  }

  // ラベルの下書き。畳む前の道が持っていたきっかけを順に並べる。
  // 何も無ければ空 (人が名前を入れる)。
  function suggestLabel(parsed, fromId, toId) {
    var path = pathBetween(parsed, fromId, toId);
    var parts = [];
    path.forEach(function(t) {
      var l = _s(t.label);
      if (l && parts.indexOf(l) < 0) parts.push(l);
    });
    return parts.join(' / ');
  }

  // 畳んだ結果の言い分。押す前に「何行消えて何が残るか」が見えるようにする。
  function preview(parsed, fromId, toId, label) {
    var path = pathBetween(parsed, fromId, toId);
    if (path.length < 2) {
      return { ok: false, text: '始点から終点までが 1 本道になっていません (分かれ道は畳めません)' };
    }
    var dropped = droppedStates(parsed, fromId, toId);
    var kept = dropped.filter(function(id) { return _referencedElsewhere(parsed, id, path); });
    var removed = dropped.filter(function(id) { return kept.indexOf(id) < 0; });
    var lbl = _s(label);
    return {
      ok: true,
      transitions: path.length,
      dropped: dropped,
      removedStates: removed,
      keptStates: kept,
      line: _s(fromId) + ' --> ' + _s(toId) + (lbl ? ' : ' + lbl : ''),
      text: path.length + ' 遷移を 1 本にまとめ、途中の状態 ' + removed.length + ' 個の宣言を消します'
        + (kept.length ? ' (' + kept.join(' / ') + ' は他からも使われているので残します)' : ''),
    };
  }

  // 畳む道の外にその状態を指すものがあるか (遷移・ノート・複合状態の親子)。
  function _referencedElsewhere(parsed, id, path) {
    var inPath = {};
    path.forEach(function(t) { inPath[t.id] = true; });
    var hit = _transitions(parsed).some(function(t) {
      if (inPath[t.id]) return false;
      return _s(t.from) === id || _s(t.to) === id;
    });
    if (hit) return true;
    if (((parsed && parsed.notes) || []).some(function(n) { return _s(n.targetId) === id; })) return true;
    // 中身を持つ状態 (複合状態) と、その中に子を持つ状態は宣言を消さない。
    return _states(parsed).some(function(s) {
      if (_s(s.parentId) === id) return true;
      return _s(s.id) === id && s.endLine > s.line;
    });
  }

  // 畳む。始点の遷移行を新しい 1 本に置き換え、残りの遷移行と
  // 消える状態の宣言行を消す。行番号の大きい方から消して番号のずれを避ける。
  function collapse(text, parsed, fromId, toId, label) {
    var pv = preview(parsed, fromId, toId, label);
    if (!pv.ok) return text;
    var path = pathBetween(parsed, fromId, toId);
    var lines = String(text).split('\n');
    var firstIdx = path[0].line - 1;
    if (firstIdx < 0 || firstIdx >= lines.length) return text;
    var indent = (lines[firstIdx].match(/^\s*/) || [''])[0];

    var drop = [];
    for (var i = 1; i < path.length; i++) drop.push(path[i].line - 1);
    pv.removedStates.forEach(function(id) {
      _states(parsed).forEach(function(s) {
        if (_s(s.id) !== id) return;
        // 説明行 (`Foo : entry / ...`) も一緒に消えるように、宣言から endLine まで。
        for (var n = s.line; n <= s.endLine; n++) drop.push(n - 1);
      });
      // `Foo : ...` の説明行は state 行と別に置かれることもある。
      lines.forEach(function(l, n) {
        var m = String(l).trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
        if (m && m[1] === id && drop.indexOf(n) < 0 && n !== firstIdx) drop.push(n);
      });
    });

    var lbl = _s(label);
    lines[firstIdx] = indent + _s(fromId) + ' --> ' + _s(toId) + (lbl ? ' : ' + lbl : '');

    drop.sort(function(a, b) { return b - a; }).forEach(function(n, i, arr) {
      if (i > 0 && arr[i - 1] === n) return;     // 同じ行を 2 度消さない
      if (n === firstIdx) return;
      if (n >= 0 && n < lines.length) lines.splice(n, 1);
    });
    return lines.join('\n');
  }

  return {
    chainFrom: chainFrom,
    startOptions: startOptions,
    endOptions: endOptions,
    pathBetween: pathBetween,
    droppedStates: droppedStates,
    suggestLabel: suggestLabel,
    preview: preview,
    collapse: collapse,
  };
})();
