'use strict';
window.MA = window.MA || {};

// selection-reorder — 図で選んでいる要素を「同じ親の中で」上下に並び替える (design 5b の
// Alt+↑ / Alt+↓)。
//
// DSL エディタ側の Alt+↑ / Alt+↓ (FEAT-116 / dsl-updater.moveLineUp) は隣の 1 行と
// 無条件に入れ替えるので、`if` の中の行を外へ押し出したり `endif` を飛び越えたりする。
// 図の側で求められているのは「同じ親の中だけ」の並び替えなので、行の入れ替えではなく
// **兄弟単位**の入れ替えとして持つ: 隣の兄弟がブロックなら、そのブロック全体を
// またいで移動する。親の境界 (else / endif / @enduml / start / stop など) に当たったら
// 何もしない。
//
// 純関数だけを置く。呼び出しと履歴は app.js の担当。
window.MA.selectionReorder = (function() {
  // ブロックを開く行。fork / if / while などの合成要素と、`{` で開く宣言。
  var OPEN_RES = [
    /^if\s*\(/i, /^while\s*\(/i, /^repeat\s*$/i, /^fork\s*$/i, /^split\s*$/i,
    /^(alt|opt|loop|par|critical|group)\b/i,
    /^partition\b/i,
    /^(package|namespace|rectangle|folder|frame|node|state|class|abstract\s+class|interface|enum|together)\b[^{]*\{\s*$/i,
    /^note\b(?![^:]*:)/i,          // note ... (次行以降が本文) は開き。`note left : text` は 1 行
  ];
  // ブロックを閉じる行。
  var CLOSE_RES = [
    /^end\s*$/i, /^endif\s*$/i, /^end\s*while\b/i, /^endwhile\b/i,
    /^end\s*fork\s*$/i, /^end\s*split\s*$/i, /^end\s*merge\s*$/i,
    /^end\s*note\s*$/i, /^end\s*package\s*$/i,
    /^repeat\s*while\b/i,
    /^\}\s*$/,
  ];
  // ブロックの途中で親が切り替わる行。ここをまたぐと「同じ親」ではなくなる。
  var MID_RES = [
    /^else\s*if\b/i, /^elseif\b/i, /^else\b/i,
    /^fork\s*again\s*$/i, /^split\s*again\s*$/i,
  ];
  // 図の骨格。ここをまたぐ移動は図を壊すので境界として扱う。
  var FENCE_RES = [
    /^@startuml/i, /^@enduml/i,
    /^start\s*$/i, /^stop\s*$/i, /^detach\s*$/i, /^kill\s*$/i,
    /^title\b/i, /^skinparam\b/i, /^!/, /^hide\b/i, /^show\b/i, /^scale\b/i,
  ];

  function _match(res, s) {
    for (var i = 0; i < res.length; i++) if (res[i].test(s)) return true;
    return false;
  }

  function _lines(dsl) {
    return String(dsl == null ? '' : dsl).split('\n');
  }

  function _t(line) { return String(line == null ? '' : line).trim(); }

  function isOpen(line)  { var s = _t(line); return !!s && _match(OPEN_RES, s); }
  function isClose(line) { var s = _t(line); return !!s && _match(CLOSE_RES, s); }
  function isMid(line)   { var s = _t(line); return !!s && _match(MID_RES, s); }
  function isFence(line) { var s = _t(line); return !!s && _match(FENCE_RES, s); }
  function isBlank(line) { return _t(line) === ''; }

  // 行 idx から始まる兄弟 1 個の範囲 [from, to] (両端含む) を返す。
  // ブロックの開き行なら対応する閉じ行まで、そうでなければその 1 行だけ。
  function _unitDown(lines, idx) {
    if (!isOpen(lines[idx])) return { from: idx, to: idx };
    var depth = 0;
    for (var i = idx; i < lines.length; i++) {
      if (isOpen(lines[i])) depth++;
      else if (isClose(lines[i])) {
        depth--;
        if (depth === 0) return { from: idx, to: i };
      }
    }
    return null;   // 閉じていない = 壊れた DSL。動かさない
  }

  // 行 idx で終わる兄弟 1 個の範囲を返す (上向きに探すとき用)。
  function _unitUp(lines, idx) {
    if (!isClose(lines[idx])) return { from: idx, to: idx };
    var depth = 0;
    for (var i = idx; i >= 0; i--) {
      if (isClose(lines[i])) depth++;
      else if (isOpen(lines[i])) {
        depth--;
        if (depth === 0) return { from: i, to: idx };
      }
    }
    return null;
  }

  // 選んでいる行が属する兄弟 1 個の範囲。ブロックの開き行を選んでいれば
  // そのブロック全体、閉じ行や途中行 (else など) を選んでいたら動かさない。
  function unitAt(dsl, lineNum) {
    var lines = _lines(dsl);
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return null;
    if (isClose(lines[idx]) || isMid(lines[idx]) || isFence(lines[idx]) || isBlank(lines[idx])) return null;
    return _unitDown(lines, idx);
  }

  // 動かせるか (端・親の境界なら false)。
  function canMove(dsl, lineNum, dir) {
    return _plan(_lines(dsl), lineNum, dir) !== null;
  }

  function _plan(lines, lineNum, dir) {
    var self = null;
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return null;
    if (isClose(lines[idx]) || isMid(lines[idx]) || isFence(lines[idx]) || isBlank(lines[idx])) return null;
    self = _unitDown(lines, idx);
    if (!self) return null;

    if (dir < 0) {
      var j = self.from - 1;
      while (j >= 0 && isBlank(lines[j])) j--;
      if (j < 0) return null;
      if (isOpen(lines[j]) || isMid(lines[j]) || isFence(lines[j])) return null;   // 親の先頭に着いた
      var up = _unitUp(lines, j);
      if (!up) return null;
      return { self: self, sib: up, dir: -1 };
    }
    var k = self.to + 1;
    while (k < lines.length && isBlank(lines[k])) k++;
    if (k >= lines.length) return null;
    if (isClose(lines[k]) || isMid(lines[k]) || isFence(lines[k])) return null;    // 親の末尾に着いた
    var down = _unitDown(lines, k);
    if (!down) return null;
    return { self: self, sib: down, dir: 1 };
  }

  // 選んでいる要素を 1 つ上 (dir < 0) / 下 (dir > 0) の兄弟と入れ替えた DSL を返す。
  // 動かせないときは受け取った DSL をそのまま返す (呼び出し側で履歴を積まないため)。
  function move(dsl, lineNum, dir) {
    var lines = _lines(dsl);
    var plan = _plan(lines, lineNum, dir);
    if (!plan) return String(dsl == null ? '' : dsl);
    var a = plan.dir < 0 ? plan.sib : plan.self;   // 上に来る側
    var b = plan.dir < 0 ? plan.self : plan.sib;   // 下に来る側
    var head = lines.slice(0, a.from);
    var mid = lines.slice(a.to + 1, b.from);       // 2 つの間 (空行など)
    var tail = lines.slice(b.to + 1);
    var A = lines.slice(a.from, a.to + 1);
    var B = lines.slice(b.from, b.to + 1);
    return head.concat(B, mid, A, tail).join('\n');
  }

  // 入れ替えた後に選択を追うための、移動先の行番号 (1 始まり)。
  function movedLine(dsl, lineNum, dir) {
    var lines = _lines(dsl);
    var plan = _plan(lines, lineNum, dir);
    if (!plan) return lineNum;
    var offset = lineNum - 1 - plan.self.from;     // 自分の中での位置
    var sibSize = plan.sib.to - plan.sib.from + 1;
    var newFrom;
    if (plan.dir < 0) {
      // 兄弟が居た場所の先頭にそのまま入る (間の空行は間のまま残す)。
      newFrom = plan.sib.from;
    } else {
      var midLen = plan.sib.from - (plan.self.to + 1);
      newFrom = plan.self.from + sibSize + midLen;
    }
    return newFrom + offset + 1;
  }

  return {
    isOpen: isOpen,
    isClose: isClose,
    isMid: isMid,
    isFence: isFence,
    unitAt: unitAt,
    canMove: canMove,
    move: move,
    movedLine: movedLine,
  };
})();
