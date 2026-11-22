'use strict';
window.MA = window.MA || {};

// stale-overlay — 図の上の選択枠 (overlay) が、今の本文より古い本文から作られている間の押し方。
//
// 枠は描き直しのたびに作り直され、その回の本文の行番号と、本文での順番の id (`__m_0` など) を持つ。
// 本文を打った直後、描き直しが届く前に枠を押すと、枠の id を今の本文で引くことになり、
// 順番の前に行が入っていれば押していない別の要素が選ばれ、右パネルの操作や Delete がその行を書き換えていた
// (TICKET-owner-20261116-0121-1)。
// 古い枠を押した回は、その場では何も選ばない。押した枠の行の中身を憶え、描き直しが届いたら
// 新しい枠のうち同じ種類・同じ中身の行 (元の行番号に最も近いもの) を選ぶ。当たらなければ選ばない。
// DOM には触らない (実行は app.js)。
window.MA.staleOverlay = (function() {
  function _lines(dsl) {
    return String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n').split('\n');
  }

  function isStale(builtFrom, current) {
    if (builtFrom == null) return false;          // まだ枠を作っていない (押せる枠も無い)
    return String(builtFrom) !== String(current == null ? '' : current);
  }

  // 押した枠の憶え。line は枠を作った本文での行番号 (1 始まり)。
  function remember(builtFrom, type, line) {
    var n = parseInt(line, 10);
    if (!type || isNaN(n) || n < 1) return null;
    var text = _lines(builtFrom)[n - 1];
    if (text == null || !text.trim()) return null;
    return { type: String(type), line: n, text: text.trim() };
  }

  // pick(pending, newDsl, candidates) — 新しい枠のうち、押した枠に当たるものの添字。無ければ -1。
  //   candidates: [{ type, line }] (新しい枠。line は今の本文での行番号)
  // 同じ種類で、今の本文のその行の中身が押した行の中身と同じもの。複数あれば元の行番号に最も近いもの
  // (同じ近さなら前のもの)。
  function pick(pending, newDsl, candidates) {
    if (!pending || !candidates || !candidates.length) return -1;
    var lines = _lines(newDsl);
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c || c.type !== pending.type) continue;
      var n = parseInt(c.line, 10);
      if (isNaN(n) || n < 1) continue;
      var t = lines[n - 1];
      if (t == null || t.trim() !== pending.text) continue;
      var d = Math.abs(n - pending.line);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  }

  return { isStale: isStale, remember: remember, pick: pick };
})();
