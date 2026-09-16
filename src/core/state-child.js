'use strict';
window.MA = window.MA || {};

// state-child — 状態の中に子状態を足す (BLK-human-20260915-1206)。
//
// 中身を持つ状態 (`state A { ... }`) は前からあったが、GUI から作る道は
// 「+ Convert to composite」→「末尾に state を足す」→「Move into: A」の
// 3 手に散らばっていて、どれも「子状態」とは名乗っていなかった。人間は
// 入口を見つけられなかった。ここは「親を選んで子を足す」1 手に畳む。
//
// 行の位置は parse() の結果 (line / endLine / parentId) だけから決める。
// 親がまだ中身を持たない単純な状態なら `{` `}` に開いてから入れる。
// DOM に触らない純関数だけ。画面は modules/state.js。
window.MA.stateChild = (function() {
  function _s(v) { return v == null ? '' : String(v).trim(); }

  function _byId(parsed, id) {
    var ss = (parsed && parsed.states) || [];
    for (var i = 0; i < ss.length; i++) if (ss[i].id === id) return ss[i];
    return null;
  }

  // 疑似状態 (choice / fork / join / history / 入口・出口) は中を持てない。
  // 見た目が状態でも、PlantUML は中身を描かない。
  var PSEUDO = {
    choice: 1, fork: 1, join: 1, history: 1, historydeep: 1,
    entrypoint: 1, exitpoint: 1,
  };

  function canHaveChild(state) {
    if (!state) return false;
    if (state.stereotype && PSEUDO[String(state.stereotype).toLowerCase()]) return false;
    return true;
  }

  // 親に選べる状態。中身を持つかどうかで分けない — 持たない状態も
  // その場で開くので、利用者から見れば「どの状態にも足せる」。
  function parentCandidates(parsed) {
    return ((parsed && parsed.states) || []).filter(canHaveChild);
  }

  function parentOptions(parsed) {
    return parentCandidates(parsed).map(function(s) {
      return { value: s.id, label: breadcrumbText(parsed, s.id) || s.label || s.id };
    });
  }

  // 入れ子のどこに居るかを根から並べる。id は `親.子` の形なので、
  // 親を辿って表示名 (label) に直す。
  function breadcrumb(parsed, stateId) {
    var out = [];
    var cur = _byId(parsed, stateId);
    var guard = 0;
    while (cur && guard++ < 50) {
      out.unshift(cur.label || cur.id);
      cur = cur.parentId ? _byId(parsed, cur.parentId) : null;
    }
    return out;
  }

  function breadcrumbText(parsed, stateId) {
    return breadcrumb(parsed, stateId).join(' › ');
  }

  // 「この状態はどの親の中に居るか」の 1 行。根なら図そのものを指す。
  function placeText(parsed, stateId) {
    var trail = breadcrumb(parsed, stateId);
    if (trail.length <= 1) return '図の直下';
    return trail.slice(0, -1).join(' › ') + ' の中';
  }

  function _idsOf(parsed) {
    var taken = {};
    ((parsed && parsed.states) || []).forEach(function(s) {
      taken[s.id] = 1;
      var bare = s.id.indexOf('.') >= 0 ? s.id.split('.').pop() : s.id;
      taken[bare] = 1;
    });
    return taken;
  }

  // 同じ名前を 2 つ作らない。`Sub` が埋まっていれば `Sub2`、`Sub3`…。
  function uniqueChildId(parsed, base) {
    var b = _s(base) || 'Sub';
    var taken = _idsOf(parsed);
    if (!taken[b]) return b;
    for (var n = 2; n < 1000; n++) if (!taken[b + n]) return b + n;
    return b + Date.now();
  }

  function _indentOf(line) { return (String(line || '').match(/^\s*/) || [''])[0]; }

  function _declLine(id, label) {
    var lbl = _s(label);
    return (lbl && lbl !== id) ? 'state "' + lbl + '" as ' + id : 'state ' + id;
  }

  // 親の中に子状態を 1 つ足す。
  //   中身を持つ親 … 閉じ `}` の直前へ (既にある子の後ろ)
  //   単純な親     … その行を `{` で開き、子と `}` を足す
  // 親に出入りする遷移 (`親 --> X`) は行を触らないので壊れない。
  function addChild(text, parsed, parentId, childId, label) {
    var id = _s(childId);
    if (!id) return text;
    var parent = _byId(parsed, parentId);
    if (!parent || !canHaveChild(parent)) return text;
    var lines = String(text).split('\n');
    var declIdx = parent.line - 1;
    if (declIdx < 0 || declIdx >= lines.length) return text;

    if (parent.endLine > parent.line) {
      var closeIdx = parent.endLine - 1;
      if (closeIdx < 0 || closeIdx >= lines.length) return text;
      var inner = _indentOf(lines[closeIdx]) + '  ';
      lines.splice(closeIdx, 0, inner + _declLine(id, label));
      return lines.join('\n');
    }

    var indent = _indentOf(lines[declIdx]);
    lines[declIdx] = lines[declIdx].replace(/\s*$/, '') + ' {';
    lines.splice(declIdx + 1, 0,
      indent + '  ' + _declLine(id, label),
      indent + '}');
    return lines.join('\n');
  }

  // 子を 2 つ足して、その間に遷移を引くまでを 1 手で。
  // 台本の「親状態に子状態を 2 つ足し、子の間に遷移を引く」がこれ 1 つで済む。
  function addChildPair(text, parsed, parentId, firstId, secondId) {
    var a = _s(firstId);
    var b = _s(secondId);
    if (!a || !b || a === b) return text;
    var parent = _byId(parsed, parentId);
    if (!parent || !canHaveChild(parent)) return text;
    var lines = String(text).split('\n');
    var declIdx = parent.line - 1;
    if (declIdx < 0 || declIdx >= lines.length) return text;
    var body = [_declLine(a, ''), _declLine(b, ''), a + ' --> ' + b];

    if (parent.endLine > parent.line) {
      var closeIdx = parent.endLine - 1;
      var inner = _indentOf(lines[closeIdx]) + '  ';
      lines.splice.apply(lines, [closeIdx, 0].concat(body.map(function(l) {
        return inner + l;
      })));
      return lines.join('\n');
    }
    var indent = _indentOf(lines[declIdx]);
    lines[declIdx] = lines[declIdx].replace(/\s*$/, '') + ' {';
    lines.splice.apply(lines, [declIdx + 1, 0].concat(
      body.map(function(l) { return indent + '  ' + l; }), [indent + '}']));
    return lines.join('\n');
  }

  return {
    canHaveChild: canHaveChild,
    parentCandidates: parentCandidates,
    parentOptions: parentOptions,
    breadcrumb: breadcrumb,
    breadcrumbText: breadcrumbText,
    placeText: placeText,
    uniqueChildId: uniqueChildId,
    addChild: addChild,
    addChildPair: addChildPair,
  };
})();
