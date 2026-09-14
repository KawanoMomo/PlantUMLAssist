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
    if (tag === 'ellipse') {
      var cx = parseFloat(n.getAttribute('cx')) || 0;
      var cy = parseFloat(n.getAttribute('cy')) || 0;
      var rx = parseFloat(n.getAttribute('rx')) || 0;
      var ry = parseFloat(n.getAttribute('ry')) || 0;
      return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
    }
    if (tag === 'path') {
      // jsdom には getBBox が無い。d から座標を拾って外接矩形を作る
      // (曲線の制御点も含むので実際の線より少し広いが、当たり判定としては安全側)。
      var dnums = (n.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g);
      if (!dnums || dnums.length < 2) return null;
      var pxs = [], pys = [];
      for (var di = 0; di + 1 < dnums.length; di += 2) {
        pxs.push(parseFloat(dnums[di])); pys.push(parseFloat(dnums[di + 1]));
      }
      return {
        x: Math.min.apply(null, pxs), y: Math.min.apply(null, pys),
        width: Math.max.apply(null, pxs) - Math.min.apply(null, pxs),
        height: Math.max.apply(null, pys) - Math.min.apply(null, pys),
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

  // BLK-human-20260912-2130: 関係 (遷移・関連・依存・矢印) の当たり判定を全図種で 1 つに寄せる。
  // PlantUML は <g class="link"> の中に 線 (path/line) + 矢じり (polygon) +
  // ラベル・ガード・多重度 (text) をまとめて置く。シーケンスのメッセージ (extractUnionBBox) と
  // 同じ考え方で子要素全部の和集合を 1 つの当たり判定にし、図種ごとに別実装しない。
  // ラベルだけ・矢印だけを押しても同じ関係が選ばれ、hover の枠でその範囲が見える。
  function extractLinkBBox(linkGroupEl, padding) {
    var pad = padding == null ? 8 : padding;
    var bb = extractUnionBBox(linkGroupEl, 'path, line, polygon, polyline, text, rect, ellipse');
    if (!bb) return null;
    return {
      x: bb.x - pad, y: bb.y - pad,
      width: bb.width + 2 * pad, height: bb.height + 2 * pad,
    };
  }

  // BLK-human-20260912-2130: 関係 1 本ぶんの当たり判定を置く。全図種でここだけを呼ぶ。
  //  1. 和集合の rect …… 線・矢じり・ラベル・ガード・多重度を囲う「選択範囲」。
  //     hover の枠がこれで出るので、押す前にどこまでが同じ関係か見て分かる。
  //  2. ラベル (<text>) ごとの小さい rect …… 同じ data-id / data-type を持つ。
  //     斜めの関係どうしは 1. の箱が重なりうる。ラベルの上だけは必ず自分の関係が
  //     選ばれるよう、小さい箱を手前 (raiseSmallestLast) に重ねて取りこぼしを防ぐ。
  // どちらを押しても選ばれる関係は同じなので、利用者から見た当たり判定は 1 つ。
  function addLinkRects(overlayEl, linkGroupEl, attrs, padding) {
    if (!overlayEl || !linkGroupEl) return null;
    var bb = extractLinkBBox(linkGroupEl, padding);
    if (!bb) return null;
    // data-hit-kind="link" は raiseSmallestLast が「関係は要素より後ろ」に置くための印。
    var linkAttrs = {};
    Object.keys(attrs || {}).forEach(function(k) { linkAttrs[k] = attrs[k]; });
    linkAttrs['data-hit-kind'] = 'link';
    var main = addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, linkAttrs);
    var labelPad = 3;
    Array.prototype.forEach.call(linkGroupEl.querySelectorAll('text'), function(t) {
      var tb = _nodeBBox(t);
      if (!tb || !tb.width) return;
      addRect(overlayEl,
        tb.x - labelPad, tb.y - labelPad,
        tb.width + 2 * labelPad, tb.height + 2 * labelPad, linkAttrs);
    });
    return main;
  }

  // 関係を表す <g> の集合。図種ごとにセレクタを書き分けない。
  function linkGroups(svgEl) {
    if (!svgEl) return [];
    return svgEl.querySelectorAll('g.link, g[class*="link_"]');
  }

  // 矢じり等の子要素から、それを含む関係の <g> を遡って探す。
  function closestLinkGroup(el) {
    var n = el;
    while (n && n.getAttribute) {
      var cls = n.getAttribute('class') || '';
      if (n.tagName && n.tagName.toLowerCase() === 'g' && /(^|\s|_)link(_|\s|$)/.test(cls)) return n;
      n = n.parentNode;
    }
    return null;
  }

  // BLK-human-20260912-2130: 当たり判定を広げると、大きい箱 (斜めの関係・入れ物) が
  // 小さい箱 (状態・クラス・部品) を覆い隠し、押しても手前の大きい方が選ばれてしまう。
  // 前後関係を 2 段で決める。hitTestTopmost もブラウザの pointer-events も
  // 「後ろの子が手前」なので、これ 1 つで「枠内のどこを押してもその要素が選べる」が
  // 図種によらず成り立つ。
  //  1. 関係 (data-hit-kind="link") は要素より必ず後ろ。関係の箱は線の周りに
  //     余白を取るので端が要素に食い込む。食い込んだ所は要素が勝つ ——
  //     図形の上を押したら図形、というのが利用者の期待。
  //  2. 同じ段の中では面積の大きい順 = 小さい (より具体的な) 当たり判定が手前。
  //     入れ物 (パッケージ・合成状態) の中の要素が押せなくならない。
  // 背景 rect (overlay-background) は選択解除のため必ず最背面に残す。
  function raiseSmallestLast(overlayEl) {
    if (!overlayEl) return;
    var rects = Array.prototype.slice.call(overlayEl.querySelectorAll('rect.selectable'));
    if (rects.length < 2) return;
    var area = function(r) {
      return (parseFloat(r.getAttribute('width')) || 0) * (parseFloat(r.getAttribute('height')) || 0);
    };
    var isLink = function(r) { return r.getAttribute('data-hit-kind') === 'link' ? 0 : 1; };
    // 元の並び順を保つ安定ソート (面積が同じものの前後関係を変えない)
    rects.forEach(function(r, i) { r.__ovIdx = i; });
    rects.sort(function(a, b) {
      var k = isLink(a) - isLink(b);
      if (k !== 0) return k;
      var d = area(b) - area(a);
      return d !== 0 ? d : a.__ovIdx - b.__ovIdx;
    });
    rects.forEach(function(r) { delete r.__ovIdx; overlayEl.appendChild(r); });
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
    addLinkRects: addLinkRects,
    addRect: addRect,
    closestLinkGroup: closestLinkGroup,
    dedupById: dedupById,
    extractBBox: extractBBox,
    extractEdgeBBox: extractEdgeBBox,
    extractLinkBBox: extractLinkBBox,
    linkGroups: linkGroups,
    extractUnionBBox: extractUnionBBox,
    extractMultiLineTextBBoxes: extractMultiLineTextBBoxes,
    hitTestTopmost: hitTestTopmost,
    matchByDataSourceLine: matchByDataSourceLine,
    matchByOrder: matchByOrder,
    pickBestOffset: pickBestOffset,
    raiseSmallestLast: raiseSmallestLast,
    syncDimensions: syncDimensions,
    warnIfMismatch: warnIfMismatch,
  };
})();
