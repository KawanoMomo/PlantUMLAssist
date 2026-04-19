'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {

  var SVG_NS = 'http://www.w3.org/2000/svg';

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

  function _bbox(el) {
    if (!el) return null;
    if (typeof el.getBBox === 'function') {
      try { return el.getBBox(); } catch (e) {}
    }
    // jsdom fallback: getBBox 不在のため属性 fallback
    return {
      x: parseFloat(el.getAttribute('x')) || 0,
      y: parseFloat(el.getAttribute('y')) || 0,
      width: parseFloat(el.getAttribute('width')) || 0,
      height: parseFloat(el.getAttribute('height')) || 0,
    };
  }

  function _matchParticipants(svgEl, participants) {
    var texts = svgEl.querySelectorAll('text');
    var matches = [];
    var labelToParticipants = {};
    participants.forEach(function(p) {
      labelToParticipants[p.label] = labelToParticipants[p.label] || [];
      labelToParticipants[p.label].push(p);
    });
    Array.prototype.forEach.call(texts, function(t) {
      var content = (t.textContent || '').trim();
      var pool = labelToParticipants[content];
      if (pool && pool.length > 0) {
        var p = pool.shift();
        matches.push({ participant: p, textEl: t });
      }
    });
    return matches;
  }

  function _matchMessages(svgEl, messages) {
    var texts = svgEl.querySelectorAll('text');
    var labelEls = [];
    messages.forEach(function(m, idx) {
      if (!m.label) return;
      Array.prototype.forEach.call(texts, function(t) {
        if ((t.textContent || '').trim() === m.label) {
          labelEls.push({ idx: idx, msg: m, textEl: t, y: _bbox(t).y });
        }
      });
    });
    var assigned = [];
    var consumed = {};
    messages.forEach(function(m) {
      if (!m.label) return;
      var candidates = labelEls.filter(function(le) {
        return le.msg === m && !consumed[le.textEl.id || le.y + ':' + le.textEl.textContent];
      });
      candidates.sort(function(a, b) { return a.y - b.y; });
      if (candidates.length > 0) {
        var pick = candidates[0];
        consumed[pick.textEl.id || pick.y + ':' + pick.textEl.textContent] = true;
        assigned.push({ message: m, textEl: pick.textEl });
      }
    });
    return assigned;
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;

    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);

    var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
    var partMatches = _matchParticipants(svgEl, participants);
    partMatches.forEach(function(m) {
      var bb = _bbox(m.textEl);
      _addRect(overlayEl, bb.x - 8, bb.y - 4, bb.width + 16, bb.height + 8, {
        'data-type': 'participant',
        'data-id': m.participant.id,
        'data-line': m.participant.line,
      });
    });

    var msgMatches = _matchMessages(svgEl, parsedData.relations);
    msgMatches.forEach(function(m) {
      var bb = _bbox(m.textEl);
      _addRect(overlayEl, bb.x - 4, bb.y - 4, bb.width + 8, bb.height + 8, {
        'data-type': 'message',
        'data-id': m.message.id,
        'data-line': m.message.line,
      });
    });
  }

  return { buildSequenceOverlay: buildSequenceOverlay };
})();
