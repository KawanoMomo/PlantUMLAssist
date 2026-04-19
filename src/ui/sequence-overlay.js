'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // PlantUML SVG の data-source-line は @startuml を含まない 0-origin (= parser line - 1)。
  // 内部では parser の lineNum (1-origin, @startuml=1) を真とするため、
  // 突合時のみ -1 オフセットして SVG 側のキーに揃える。
  var PLANTUML_LINE_OFFSET = 1;

  function _clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function _addRect(overlayEl, x, y, w, h, attrs) {
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('stroke', 'none');
    rect.setAttribute('class', 'seq-overlay-target');
    rect.style.cursor = 'pointer';
    rect.style.pointerEvents = 'all';
    Object.keys(attrs).forEach(function(k) {
      rect.setAttribute(k, attrs[k]);
    });
    overlayEl.appendChild(rect);
    return rect;
  }

  function _matchByDataSourceLine(svgEl, parsedItems, groupSelector) {
    // PlantUML SVG が data-source-line を持つ <g> を検索し、
    // parsedItems の line 番号 (offset 補正後) と一致する <g> を取り出す。
    var matches = [];
    var groups = svgEl.querySelectorAll(groupSelector + '[data-source-line]');
    var lineToItem = {};
    parsedItems.forEach(function(item) {
      lineToItem[item.line - PLANTUML_LINE_OFFSET] = item;
    });
    Array.prototype.forEach.call(groups, function(g) {
      var line = parseInt(g.getAttribute('data-source-line'), 10);
      var item = lineToItem[line];
      if (item) {
        matches.push({ item: item, groupEl: g });
      }
    });
    return matches;
  }

  function _gBBox(g) {
    // <g> の中の最初の <text> 要素の bbox を採用 (jsdom 互換 fallback あり)。
    var t = g.querySelector('text');
    if (!t) return null;
    if (typeof t.getBBox === 'function') {
      try { return t.getBBox(); } catch (e) { /* jsdom: fall through */ }
    }
    return {
      x: parseFloat(t.getAttribute('x')) || 0,
      y: parseFloat(t.getAttribute('y')) || 0,
      width: parseFloat(t.getAttribute('textLength')) || parseFloat(t.getAttribute('width')) || 0,
      height: 14, // PlantUML default font height fallback
    };
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;

    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);

    var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
    var partMatches = _matchByDataSourceLine(svgEl, participants, 'g.participant-head');
    partMatches.forEach(function(m) {
      var bb = _gBBox(m.groupEl);
      if (!bb) return;
      _addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    var msgMatches = _matchByDataSourceLine(svgEl, parsedData.relations, 'g.message');
    msgMatches.forEach(function(m) {
      var bb = _gBBox(m.groupEl);
      if (!bb) return;
      _addRect(overlayEl, bb.x - 4, bb.y - 4, (bb.width || 60) + 8, (bb.height || 14) + 8, {
        'data-type': 'message',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });
  }

  return { buildSequenceOverlay: buildSequenceOverlay };
})();
