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

  return {
    matchByDataSourceLine: matchByDataSourceLine,
    matchByOrder: matchByOrder,
    pickBestOffset: pickBestOffset,
  };
})();
