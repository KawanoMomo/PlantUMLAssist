'use strict';
window.MA = window.MA || {};
window.MA.overlayBuilder = (function() {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function addRect(overlayEl, x, y, w, h, attrs) {
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('stroke', 'none');
    rect.classList.add('selectable');
    rect.style.cursor = 'pointer';
    var isPlaceholder = (w === 1 && h === 1);
    rect.style.pointerEvents = isPlaceholder ? 'none' : 'all';
    if (attrs) {
      Object.keys(attrs).forEach(function(k) { rect.setAttribute(k, attrs[k]); });
    }
    overlayEl.appendChild(rect);
    return rect;
  }

  function syncDimensions(svgEl, overlayEl) {
    if (!svgEl || !overlayEl) return;
    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);
  }

  return {
    addRect: addRect,
    syncDimensions: syncDimensions,
  };
})();
