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
    // BLK-junior-20260908-1703: data-hint を持つ rect には SVG の <title> も付ける。
    // 画面の吹き出し (#edge-hint) が出ない場面 (SVG を書き出して別のビューアで
    // 開く、ブラウザ既定のツールチップに頼る) でも相手が読めるようにする。
    var hint = attrs && attrs['data-hint'];
    if (hint) {
      var titleEl = document.createElementNS(SVG_NS, 'title');
      titleEl.textContent = hint;
      rect.appendChild(titleEl);
    }
    overlayEl.appendChild(rect);
    return rect;
  }

  function extractBBox(g, opts) {
    if (!g) return null;
    var t = g.querySelector('text');
    if (t) {
      if (typeof t.getBBox === 'function') {
        try { return t.getBBox(); } catch (e) { /* jsdom fallback */ }
      }
      return {
        x: parseFloat(t.getAttribute('x')) || 0,
        y: parseFloat(t.getAttribute('y')) || 0,
        width: parseFloat(t.getAttribute('textLength')) || parseFloat(t.getAttribute('width')) || 0,
        height: 14,
      };
    }
    var line = g.querySelector('line');
    if (line) {
      var x1 = parseFloat(line.getAttribute('x1')) || 0;
      var x2 = parseFloat(line.getAttribute('x2')) || 0;
      var y1 = parseFloat(line.getAttribute('y1')) || 0;
      var y2 = parseFloat(line.getAttribute('y2')) || 0;
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2) - 6,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1) + 12,
      };
    }
    return null;
  }

  // BLK-human-20260912-0900: g.message は「矢印 (line/polygon) + ラベル + 番号
  // (autonumber) + ステレオタイプ」を子に持ち、何を付けたかで <text> の並びが変わる。
  // extractBBox は最初の <text> しか見ないため、autonumber を付けると番号の上、
  // ステレオタイプを付けるとステレオタイプの上だけがクリックに反応していた。
  // 子要素全部の和集合を取り、設定に関わらず同じ当たり判定にする。
  function _nodeBBox(n) {
    var tag = (n.tagName || '').toLowerCase();
    if (typeof n.getBBox === 'function') {
      try {
        var bb = n.getBBox();
        if (bb && (bb.width || bb.height)) {
          return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
        }
      } catch (e) { /* jsdom fallback */ }
    }
    if (tag === 'text') {
      var tx = parseFloat(n.getAttribute('x')) || 0;
      var ty = parseFloat(n.getAttribute('y')) || 0;  // baseline
      var tw = parseFloat(n.getAttribute('textLength'))
        || parseFloat(n.getAttribute('width'))
        || (n.textContent || '').length * 7;
      var fsz = parseFloat(n.getAttribute('font-size')) || 13;
      return { x: tx, y: ty - fsz, width: tw, height: fsz + 4 };
    }
    if (tag === 'line') {
      var x1 = parseFloat(n.getAttribute('x1')) || 0;
      var x2 = parseFloat(n.getAttribute('x2')) || 0;
      var y1 = parseFloat(n.getAttribute('y1')) || 0;
      var y2 = parseFloat(n.getAttribute('y2')) || 0;
      return {
        x: Math.min(x1, x2), y: Math.min(y1, y2),
        width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
      };
    }
    if (tag === 'polygon' || tag === 'polyline') {
      var nums = (n.getAttribute('points') || '').split(/[\s,]+/)
        .map(parseFloat).filter(function(v) { return !isNaN(v); });
      if (nums.length < 2) return null;
      var xs = [], ys = [];
      for (var i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
      return {
        x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
        width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
        height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
      };
    }
    if (tag === 'rect') {
      return {
        x: parseFloat(n.getAttribute('x')) || 0,
        y: parseFloat(n.getAttribute('y')) || 0,
        width: parseFloat(n.getAttribute('width')) || 0,
        height: parseFloat(n.getAttribute('height')) || 0,
      };
    }
    return null;
  }

  function extractUnionBBox(g, selector) {
    if (!g) return null;
    var nodes = g.querySelectorAll(selector || 'text, line, polygon, polyline, path, rect');
    var minX = null, minY = null, maxX = null, maxY = null;
    Array.prototype.forEach.call(nodes, function(n) {
      var bb = _nodeBBox(n);
      if (!bb) return;
      if (minX === null || bb.x < minX) minX = bb.x;
      if (minY === null || bb.y < minY) minY = bb.y;
      if (maxX === null || bb.x + bb.width > maxX) maxX = bb.x + bb.width;
      if (maxY === null || bb.y + bb.height > maxY) maxY = bb.y + bb.height;
    });
    if (minX === null) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function extractEdgeBBox(pathEl, padding) {
    var pad = padding || 8;
    if (!pathEl) return null;
    if (pathEl.tagName.toLowerCase() === 'line') {
      var x1 = parseFloat(pathEl.getAttribute('x1')) || 0;
      var x2 = parseFloat(pathEl.getAttribute('x2')) || 0;
      var y1 = parseFloat(pathEl.getAttribute('y1')) || 0;
      var y2 = parseFloat(pathEl.getAttribute('y2')) || 0;
      return {
        x: Math.min(x1, x2) - pad,
        y: Math.min(y1, y2) - pad,
        width: Math.abs(x2 - x1) + 2 * pad,
        height: Math.abs(y2 - y1) + 2 * pad,
      };
    }
    if (typeof pathEl.getBBox === 'function') {
      try {
        var bb = pathEl.getBBox();
        return { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
      } catch (e) { /* jsdom: fall through */ }
    }
    return null;
  }

  function extractMultiLineTextBBoxes(g, opts) {
    if (!g) return [];
    var mode = (opts && opts.mode) || 'text-per-line';
    var nodes = mode === 'tspan-per-line'
      ? g.querySelectorAll('text tspan')
      : g.querySelectorAll('text');
    var lines = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var bb = null;
      if (typeof n.getBBox === 'function') {
        try { bb = n.getBBox(); } catch (e) { /* jsdom fallback */ }
      }
      if (!bb || (!bb.width && !bb.height)) {
        bb = {
          x: parseFloat(n.getAttribute('x')) || 0,
          y: parseFloat(n.getAttribute('y')) || 0,
          width: parseFloat(n.getAttribute('textLength')) || (n.textContent || '').length * 7,
          height: 14,
        };
      }
      lines.push({ text: (n.textContent || '').trim(), bbox: bb, lineIndex: i });
    }
    return lines;
  }

  function matchByDataSourceLine(svgEl, items, selector, offset) {
    var groups = svgEl.querySelectorAll(selector);
    var byLine = {};
    Array.prototype.forEach.call(groups, function(g) {
      var sl = parseInt(g.getAttribute('data-source-line'), 10);
      if (!isNaN(sl)) byLine[sl + offset] = g;
    });
    var matches = [];
    items.forEach(function(item) {
      if (item.line != null && byLine[item.line]) {
        matches.push({ item: item, groupEl: byLine[item.line] });
      }
    });
    return matches;
  }

  function matchByOrder(svgEl, items, selector) {
    var groups = svgEl.querySelectorAll(selector);
    var n = Math.min(items.length, groups.length);
    var matches = [];
    for (var i = 0; i < n; i++) {
      matches.push({ item: items[i], groupEl: groups[i] });
    }
    return matches;
  }

  function pickBestOffset(svgEl, items, selector, candidates) {
    var best = { offset: candidates[0], matches: [] };
    candidates.forEach(function(off) {
      var m = matchByDataSourceLine(svgEl, items, selector, off);
      if (m.length > best.matches.length) {
        best = { offset: off, matches: m };
      }
    });
    if (best.matches.length === 0) {
      best = { offset: null, matches: matchByOrder(svgEl, items, selector) };
    }
    return best;
  }

  function hitTestTopmost(overlayEl, x, y) {
    var rects = overlayEl.querySelectorAll('rect.selectable');
    for (var i = rects.length - 1; i >= 0; i--) {
      var r = rects[i];
      var rx = parseFloat(r.getAttribute('x')) || 0;
      var ry = parseFloat(r.getAttribute('y')) || 0;
      var rw = parseFloat(r.getAttribute('width')) || 0;
      var rh = parseFloat(r.getAttribute('height')) || 0;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
        return r;
      }
    }
    return null;
  }

  function dedupById(rects) {
    var seen = {};
    var unique = [];
    rects.forEach(function(r) {
      var id = r.getAttribute('data-id');
      if (!id || seen[id]) return;
      seen[id] = true;
      unique.push(r);
    });
    return unique;
  }

  function warnIfMismatch(kind, modelCount, matched) {
    if (modelCount !== matched && typeof console !== 'undefined' && console.warn) {
      console.warn('[overlay-builder] ' + kind + ' mismatch: model=' + modelCount + ' matched=' + matched);
    }
  }

  // FEAT-009 (resolves UI-003): 図の空白クリックで選択を解除する。#overlay-layer は
  // pointer-events:none で当たり判定を持つのは子要素だけのため、空白のクリックが
  // selectionRouter.bind() に届かず README.md:256 の挙動が成立していなかった。
  // 最背面に透明な背景 rect を敷いて当たり判定を与える。data-type を持たないので
  // selectionRouter は「空白」と解釈して clearSelection() し、app.js の hover 挿入
  // ガイド／挿入 popup も data-type の有無で分岐するため発火条件は変わらない。
  function addBackground(overlayEl) {
    if (!overlayEl) return null;
    var existing = overlayEl.querySelector('rect.overlay-background');
    if (existing) return existing;
    // viewBox がある場合はユーザー単位系が width/height 属性と異なりうる。
    // 図全体を覆うには viewBox の寸法を使う。
    var w = 0, h = 0;
    var vb = overlayEl.getAttribute('viewBox');
    if (vb) {
      var parts = String(vb).split(/[\s,]+/);
      if (parts.length >= 4) { w = parseFloat(parts[2]) || 0; h = parseFloat(parts[3]) || 0; }
    }
    if (!w || !h) {
      w = parseFloat(overlayEl.getAttribute('width')) || 0;
      h = parseFloat(overlayEl.getAttribute('height')) || 0;
    }
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('stroke', 'none');
    rect.classList.add('overlay-background');
    rect.style.pointerEvents = 'all';
    if (overlayEl.firstChild) overlayEl.insertBefore(rect, overlayEl.firstChild);
    else overlayEl.appendChild(rect);
    return rect;
  }

  function syncDimensions(svgEl, overlayEl) {
    if (!svgEl || !overlayEl) return;
    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);
    // 全モジュールの buildOverlay が overlay をクリアした直後に本関数を呼ぶ。
    // ここで敷けば背景 rect は必ず最背面 (先頭の子) になる。
    addBackground(overlayEl);
  }

  return {
    addBackground: addBackground,
    addRect: addRect,
    dedupById: dedupById,
    extractBBox: extractBBox,
    extractEdgeBBox: extractEdgeBBox,
    extractUnionBBox: extractUnionBBox,
    extractMultiLineTextBBoxes: extractMultiLineTextBBoxes,
    hitTestTopmost: hitTestTopmost,
    matchByDataSourceLine: matchByDataSourceLine,
    matchByOrder: matchByOrder,
    pickBestOffset: pickBestOffset,
    syncDimensions: syncDimensions,
    warnIfMismatch: warnIfMismatch,
  };
})();
