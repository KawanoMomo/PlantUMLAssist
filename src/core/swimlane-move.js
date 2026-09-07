'use strict';
window.MA = window.MA || {};

// swimlane-move — アクティビティ図で、選んだアクションの所属スイムレーンを変える。
//
// design「1a 図種展開 2」4b の右ペインは「スイムレーン / Swimlane」を
// 「（なし）/ Server」のチップで選ばせる。PlantUML のスイムレーンは
// `|レーン|` という印を書いた時点から次の印までが 1 レーン、という並び順の規則なので、
// 「この行の所属だけを変える」には印を入れ直す必要がある:
//   - アクション行の直前に移動先の印を入れる
//   - 後ろの行が元のレーンに残るよう、アクション行の直後に元のレーンの印を戻す
//   - その結果、中身のない印が連続したら畳む(掛け直すたびに印が積み上がらない)
//
// DOM に触らない純関数だけを置く。行番号は 1 始まり (activity.js の node.line と同じ)。
window.MA.swimlaneMove = (function() {
  var SWIMLANE_RE = /^\|(?:#[^|]+\|)?\s*([^|]+?)\s*\|$/;
  var SKIP_RE = /^(?:@startuml|@enduml)\b/i;

  function _split(dsl) {
    var du = window.MA && window.MA.dslUtils;
    if (du && typeof du.splitLines === 'function') return du.splitLines(dsl);
    return String(dsl == null ? '' : dsl).split('\n');
  }

  function _isComment(line) {
    return /^\s*'/.test(String(line || ''));
  }

  // 流れとして意味のある行か (空行・コメント・@start/@end は数えない)。
  function _isFlow(line) {
    var t = String(line || '').trim();
    if (t === '') return false;
    if (_isComment(line)) return false;
    if (SKIP_RE.test(t)) return false;
    return true;
  }

  function markerLabel(line) {
    var m = String(line || '').trim().match(SWIMLANE_RE);
    return m ? m[1].trim() : null;
  }

  function _indentOf(line) {
    var m = String(line || '').match(/^\s*/);
    return m ? m[0] : '';
  }

  function _markerLine(label, indent) {
    return (indent || '') + '|' + label + '|';
  }

  // DSL 中のスイムレーン名を出てくる順に (重複なしで) 返す。
  function swimlanes(dsl) {
    var lines = _split(dsl);
    var seen = {}, out = [];
    for (var i = 0; i < lines.length; i++) {
      var label = markerLabel(lines[i]);
      if (label && !seen[label]) { seen[label] = 1; out.push(label); }
    }
    return out;
  }

  // その行が属しているレーン。最初の印より前なら '' (＝どのレーンでもない)。
  function laneAt(dsl, line) {
    var lines = _split(dsl);
    var idx = (parseInt(line, 10) || 0) - 1;
    if (idx < 0) return '';
    var lane = '';
    for (var i = 0; i < lines.length && i < idx; i++) {
      var label = markerLabel(lines[i]);
      if (label !== null) lane = label;
    }
    return lane;
  }

  // 中身の無い印を畳む。印の次の「流れとして意味のある行」がまた印なら、
  // 前の印は誰も持たないので消す。末尾に残った印も同じく消す。
  function _collapse(lines) {
    var out = lines.slice();
    for (var i = out.length - 1; i >= 0; i--) {
      if (markerLabel(out[i]) === null) continue;
      var next = -1;
      for (var j = i + 1; j < out.length; j++) { if (_isFlow(out[j])) { next = j; break; } }
      if (next === -1 || markerLabel(out[next]) !== null) out.splice(i, 1);
    }
    return out;
  }

  // アクション行 (line..endLine) の所属を target に変える。
  // target が '' (レーンなし) は PlantUML に印が無いので表せない ⇒ そのまま返す。
  function setSwimlane(dsl, line, target, endLine) {
    var lines = _split(dsl);
    var start = (parseInt(line, 10) || 0) - 1;
    var end = (parseInt(endLine, 10) || parseInt(line, 10) || 0) - 1;
    if (start < 0 || start >= lines.length) return String(dsl == null ? '' : dsl);
    if (end < start) end = start;
    var to = String(target == null ? '' : target).trim();
    var cur = laneAt(dsl, line);
    if (to === '' || to === cur) return lines.join('\n');

    var indent = _indentOf(lines[start]);
    var out = lines.slice();

    // 後続の流れが元のレーンに残るよう、アクションの直後に元の印を戻す。
    // 元がレーンなし ('') のときは戻す印が無いので、後ろも移動先のレーンになる。
    var nextFlow = -1;
    for (var j = end + 1; j < out.length; j++) { if (_isFlow(out[j])) { nextFlow = j; break; } }
    if (cur !== '' && nextFlow !== -1 && markerLabel(out[nextFlow]) === null) {
      out.splice(end + 1, 0, _markerLine(cur, indent));
    }
    out.splice(start, 0, _markerLine(to, indent));

    return _collapse(out).join('\n');
  }

  // 右ペインのチップ。（なし）は今そこに居るときだけ選べる形で出す
  // (PlantUML には「レーンから外す」印が無いため)。
  function chips(dsl, line) {
    var cur = laneAt(dsl, line);
    var list = [{ id: '', label: '（なし）', selectable: cur === '', checked: cur === '' }];
    swimlanes(dsl).forEach(function(name) {
      list.push({ id: name, label: name, selectable: true, checked: name === cur });
    });
    return list;
  }

  return {
    swimlanes: swimlanes,
    laneAt: laneAt,
    markerLabel: markerLabel,
    setSwimlane: setSwimlane,
    chips: chips,
  };
})();
