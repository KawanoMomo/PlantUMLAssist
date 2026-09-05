'use strict';
window.MA = window.MA || {};
window.MA.lineResolver = (function() {

  function matchByDataSourceLine(svgEl, parsedItems, groupSelector, offset) {
    var matches = [];
    if (!svgEl || !parsedItems || !groupSelector) return matches;
    var groups = svgEl.querySelectorAll(groupSelector + '[data-source-line]');
    var lineToItem = {};
    parsedItems.forEach(function(item) {
      if (item && item.line != null) lineToItem[item.line] = item;
    });
    Array.prototype.forEach.call(groups, function(g) {
      var svgLine = parseInt(g.getAttribute('data-source-line'), 10);
      if (isNaN(svgLine)) return;
      var parserLine = svgLine + offset;
      var item = lineToItem[parserLine];
      if (item) {
        matches.push({ item: item, groupEl: g });
      }
    });
    return matches;
  }

  function matchByOrder(svgEl, parsedItems, groupSelector) {
    var matches = [];
    if (!svgEl || !parsedItems || !groupSelector) return matches;
    var allGroups = svgEl.querySelectorAll(groupSelector);
    var n = Math.min(allGroups.length, parsedItems.length);
    for (var i = 0; i < n; i++) {
      matches.push({ item: parsedItems[i], groupEl: allGroups[i] });
    }
    return matches;
  }

  function pickBestOffset(svgEl, parsedItems, groupSelector, candidates) {
    var best = { matches: [], offset: candidates[0] };
    for (var i = 0; i < candidates.length; i++) {
      var m = matchByDataSourceLine(svgEl, parsedItems, groupSelector, candidates[i]);
      if (m.length > best.matches.length) {
        best = { matches: m, offset: candidates[i] };
      }
    }
    if (best.matches.length === 0 && parsedItems.length > 0) {
      var fb = matchByOrder(svgEl, parsedItems, groupSelector);
      if (fb.length > 0) {
        best = { matches: fb, offset: null, usedOrderFallback: true };
      }
    }
    return best;
  }

  // FEAT-185 (resolves HFR-089): DSL の行番号 (0 始まり) を #editor のキャレット範囲
  // (文字オフセット) へ変換する純関数。DOM には一切触れない。
  // 配線 (選択イベントから本関数を呼び #editor へ適用する) は FEAT-186 の職掌であり、
  // 本 FEAT は src/** 内に呼出元を 1 箇所も作らない。
  // 不正入力は throw せず null を返す (同一ファイル内の既存 3 関数の防御的 early-return に揃える)。
  function caretRangeForLine(text, lineIndex) {
    if (typeof text !== 'string') return null;
    if (typeof lineIndex !== 'number' || !isFinite(lineIndex)) return null;
    if (Math.floor(lineIndex) !== lineIndex || lineIndex < 0) return null;
    var lines = text.split('\n');
    if (lineIndex >= lines.length) return null;
    var start = 0;
    for (var i = 0; i < lineIndex; i++) {
      start += lines[i].length + 1; // +1 は分割で失われた '\n'
    }
    var line = lines[lineIndex];
    var end = start + line.length;
    // CRLF: 末尾の '\r' は行の内容に含めない
    if (line.charAt(line.length - 1) === '\r') end -= 1;
    return { start: start, end: end };
  }

  return {
    matchByDataSourceLine: matchByDataSourceLine,
    matchByOrder: matchByOrder,
    pickBestOffset: pickBestOffset,
    caretRangeForLine: caretRangeForLine,
  };
})();
