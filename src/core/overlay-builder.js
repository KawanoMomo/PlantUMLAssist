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

  // BLK-builder-20260925-0656-2: <path d> の外接矩形をコマンドを読んで求める (jsdom には getBBox が無く、
  // 属性から枠を作る箇所が使う)。数字を 2 つずつ座標として読むと、smetana が複合状態の見出しに使う円弧
  // `A rx,ry rot large sweep x,y` の半径・フラグが座標に混ざり、枠が図の左上 (x=0) まで広がった。
  // 曲線は制御点まで含める (実際の線より少し広いが当たり判定としては安全側)。円弧は中心を求めて周上を拾う。
  var PATH_ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
  function _arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
    var cp = Math.cos(phi * Math.PI / 180), sp = Math.sin(phi * Math.PI / 180);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    var lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = Math.sqrt(Math.max(0, num / den)) * (fa === fs ? -1 : 1);
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) {
      var a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    }
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    var dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI;
    else if (fs && dt < 0) dt += 2 * Math.PI;
    var pts = [], steps = 16;
    for (var i = 1; i <= steps; i++) {
      var t = t1 + dt * i / steps;
      var ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      pts.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
    }
    pts[pts.length - 1] = [x2, y2];
    return pts;
  }
  function pathBox(d) {
    var pts = pathPoints(d);
    if (!pts || !pts.xs.length) return null;
    var xs = pts.xs, ys = pts.ys;
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, width: Math.max.apply(null, xs) - x0, height: Math.max.apply(null, ys) - y0 };
  }

  // <path d> の頂点 (円弧は周上の点) を { xs, ys } で返す。読めない d は null。
  function pathPoints(d) {
    var toks = String(d == null ? '' : d).match(/[a-df-zA-DF-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
    if (!toks) return null;
    var xs = [], ys = [];
    var cx = 0, cy = 0, sx = 0, sy = 0, cmd = null, i = 0;
    function add(x, y) { xs.push(x); ys.push(y); }
    while (i < toks.length) {
      if (/^[a-zA-Z]$/.test(toks[i])) {
        cmd = toks[i++];
        if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; add(cx, cy); continue; }
      }
      if (!cmd) return null;
      var up = cmd.toUpperCase(), n = PATH_ARITY[up];
      if (n === undefined || n === 0) return null;
      if (i + n > toks.length) break;
      var a = [];
      for (var k = 0; k < n; k++) {
        var v = parseFloat(toks[i + k]);
        if (isNaN(v)) return null;
        a.push(v);
      }
      i += n;
      var rel = cmd !== up;
      var ox = rel ? cx : 0, oy = rel ? cy : 0;
      if (up === 'H') { cx = a[0] + (rel ? cx : 0); add(cx, cy); continue; }
      if (up === 'V') { cy = a[0] + (rel ? cy : 0); add(cx, cy); continue; }
      if (up === 'A') {
        var ex = a[5] + ox, ey = a[6] + oy;
        _arcPoints(cx, cy, a[0], a[1], a[2], a[3] ? 1 : 0, a[4] ? 1 : 0, ex, ey).forEach(function(p) { add(p[0], p[1]); });
        cx = ex; cy = ey;
        continue;
      }
      for (var j = 0; j < n; j += 2) add(a[j] + ox, a[j + 1] + oy);
      cx = a[n - 2] + ox; cy = a[n - 1] + oy;
      if (up === 'M') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }   // M の後に続く組は L
    }
    return { xs: xs, ys: ys };
  }

  // BLK-migrator-20260926-1116: 注釈 (note) の紙の外形を全図種で 1 か所で求める。
  // PlantUML は note を図種によらず「塗りのある外形の path + 右上の折り返しの小さい三角の path」で描き、
  // 本文の Creole (表の罫線・箇条書きの点・リンク・区切り線) はその後ろに並べる。中身の図形から範囲を
  // 取ると (最初の rect = 箇条書きの点、最初の text = 表の 1 セル) 紙のほとんどが当たり判定から外れた。
  // 範囲は紙の外形 (対象へ伸びる吹き出しの尖りを含む、描かれた形そのもの) から取る。
  function _isFold(el) {
    if (!el || (el.tagName || '').toLowerCase() !== 'path') return null;
    var pts = pathPoints(el.getAttribute('d'));
    if (!pts || pts.xs.length !== 4) return null;
    var xs = pts.xs, ys = pts.ys, c = ys[1] - ys[0];
    if (!(c >= 2 && c <= 30)) return null;
    var near = function(a, b) { return Math.abs(a - b) < 0.6; };
    if (!near(xs[0], xs[3]) || !near(ys[0], ys[3]) || !near(xs[1], xs[0]) ||
        !near(xs[2], xs[0] + c) || !near(ys[2], ys[1])) return null;
    return { x: xs[0], y: ys[0], size: c };
  }

  function _filled(el) {
    var fill = (el.getAttribute('fill') || '').toLowerCase();
    return !!fill && fill !== 'none' && fill !== 'transparent';
  }

  // 紙の外形の頂点から、1 点だけ飛び出した頂点 (吹き出しの尖り) を除いた外接矩形 (紙そのもの)。
  function noteBodyBox(pathEl) {
    var pts = pathPoints(pathEl && pathEl.getAttribute('d'));
    if (!pts || pts.xs.length < 4) return null;
    var P = pts.xs.map(function(x, i) { return { x: x, y: pts.ys[i] }; });
    for (var guard = 0; guard < 4 && P.length > 4; guard++) {
      var dropped = false;
      [['x', Math.min], ['x', Math.max], ['y', Math.min], ['y', Math.max]].forEach(function(side) {
        if (dropped || P.length <= 4) return;
        var k = side[0];
        var ext = side[1].apply(null, P.map(function(p) { return p[k]; }));
        var at = P.filter(function(p) { return Math.abs(p[k] - ext) < 0.6; });
        if (at.length === 1) { P.splice(P.indexOf(at[0]), 1); dropped = true; }
      });
      if (!dropped) break;
    }
    var xs = P.map(function(p) { return p.x; }), ys = P.map(function(p) { return p.y; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, width: Math.max.apply(null, xs) - x0, height: Math.max.apply(null, ys) - y0 };
  }

  // root (svg または g) の中の注釈の紙を文書順に返す:
  // [{ el: 外形の path, fold: 折り返し, box: 外形の矩形 (尖りを含む), body: 紙の矩形 (尖りを除く) }]。
  // 折り返しの三角の直前にある塗りのある path で、その右上の角に折り返しが載っているものを紙とみなす。
  function notePapers(root) {
    if (!root || !root.querySelectorAll) return [];
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll('path'), function(fold) {
      var f = _isFold(fold);
      if (!f) return;
      var main = fold.previousElementSibling;
      while (main && (main.tagName || '').toLowerCase() === 'title') main = main.previousElementSibling;
      if (!main || (main.tagName || '').toLowerCase() !== 'path' || !_filled(main)) return;
      var body = noteBodyBox(main);
      var box = pathBox(main.getAttribute('d'));
      if (!body || !box) return;
      if (Math.abs(f.y - body.y) > 1 || Math.abs(f.x + f.size - (body.x + body.width)) > 1) return;
      out.push({ el: main, fold: fold, box: box, body: body });
    });
    return out;
  }

  // 要素 g の中の最初の紙の矩形 (無ければ null)。
  function notePaperBox(g) {
    var ps = notePapers(g);
    return ps.length ? ps[0].box : null;
  }

  // 点 (SVG 座標) を含む最小の紙 (無ければ null)。
  function notePaperAt(root, x, y) {
    var best = null;
    notePapers(root).forEach(function(p) {
      var b = p.box;
      if (x < b.x - 1 || x > b.x + b.width + 1 || y < b.y - 1 || y > b.y + b.height + 1) return;
      if (!best || b.width * b.height < best.box.width * best.box.height) best = p;
    });
    return best;
  }

  // 注釈本文の 1 行を、描かれた文字と比べられる形にする (Creole の表の区切り・見出し印、箇条書きの印、
  // リンクの URL、太字などの印を落とす)。描かれる文字は PlantUML がこれらを図形・書式に変えた後のもの。
  function noteLineKey(line) {
    var s = String(line == null ? '' : line);
    s = s.replace(/\[\[\s*[^\]\s|]+(?:\{[^}]*\})?\s+([^\]]+)\]\]/g, '$1')   // [[url label]] -> label
      .replace(/\[\[\s*([^\]]+)\]\]/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/^\s*[*#]+\s+/, '')
      .replace(/\|=?/g, ' ')
      .replace(/\*\*|\/\/|__|""|~~|--/g, '');
    return s.replace(/\s+/g, ' ').trim();
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
      // jsdom には getBBox が無い。d をコマンドごとに読んで外接矩形を作る (pathBox)。
      return pathBox(n.getAttribute('d'));
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
  // BLK-builder-20260925-0305-1: linkGroupEl は <g> の配列でもよい (中継点で 2 本に割れた 1 つの関係)。
  // 選択範囲は全部の和集合 1 つにし、ラベル・矢じりの小さい rect は各 <g> から置く。
  // BLK-migrator-20260925-1032: 関係の線 (<path d> / <line> / <polyline>) を折れ線の点列にする。曲線は細かく刻む。
  // 返すのは部分路ごとの点列の配列 ([[x,y], ...] の配列)。
  function linePoints(el) {
    var tag = (el && el.tagName || '').toLowerCase();
    if (tag === 'line') {
      return [[[parseFloat(el.getAttribute('x1')) || 0, parseFloat(el.getAttribute('y1')) || 0],
        [parseFloat(el.getAttribute('x2')) || 0, parseFloat(el.getAttribute('y2')) || 0]]];
    }
    if (tag === 'polyline') {
      var nums = (el.getAttribute('points') || '').split(/[\s,]+/).map(parseFloat).filter(function(v) { return !isNaN(v); });
      var pl = [];
      for (var q = 0; q + 1 < nums.length; q += 2) pl.push([nums[q], nums[q + 1]]);
      return pl.length > 1 ? [pl] : [];
    }
    if (tag !== 'path') return [];
    var toks = String(el.getAttribute('d') || '').match(/[a-df-zA-DF-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
    if (!toks) return [];
    var subs = [], cur = null;
    var cx = 0, cy = 0, sx = 0, sy = 0, lcx = null, lcy = null, cmd = null, i = 0, STEPS = 12;
    function add(x, y) { if (!cur) { cur = [[cx, cy]]; subs.push(cur); } cur.push([x, y]); }
    function cubic(x1, y1, x2, y2, x3, y3) {
      for (var s = 1; s <= STEPS; s++) {
        var t = s / STEPS, u = 1 - t;
        add(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    }
    function quad(x1, y1, x2, y2) {
      for (var s = 1; s <= STEPS; s++) {
        var t = s / STEPS, u = 1 - t;
        add(u * u * cx + 2 * u * t * x1 + t * t * x2, u * u * cy + 2 * u * t * y1 + t * t * y2);
      }
    }
    while (i < toks.length) {
      if (/^[a-zA-Z]$/.test(toks[i])) {
        cmd = toks[i++];
        if (cmd === 'Z' || cmd === 'z') { add(sx, sy); cx = sx; cy = sy; lcx = lcy = null; continue; }
      }
      if (!cmd) return [];
      var up = cmd.toUpperCase(), n = PATH_ARITY[up];
      if (!n || i + n > toks.length) break;
      var a = [];
      for (var k = 0; k < n; k++) a.push(parseFloat(toks[i + k]));
      i += n;
      var rel = cmd !== up, ox = rel ? cx : 0, oy = rel ? cy : 0;
      var nlcx = null, nlcy = null;
      if (up === 'M') {
        cx = a[0] + ox; cy = a[1] + oy; sx = cx; sy = cy; cur = null;
        cmd = rel ? 'l' : 'L';
        lcx = lcy = null;
        continue;
      }
      if (up === 'L' || up === 'T') { add(a[0] + ox, a[1] + oy); cx = a[0] + ox; cy = a[1] + oy; }
      else if (up === 'H') { add(a[0] + (rel ? cx : 0), cy); cx = a[0] + (rel ? cx : 0); }
      else if (up === 'V') { add(cx, a[0] + (rel ? cy : 0)); cy = a[0] + (rel ? cy : 0); }
      else if (up === 'C') {
        cubic(a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy);
        nlcx = a[2] + ox; nlcy = a[3] + oy; cx = a[4] + ox; cy = a[5] + oy;
      } else if (up === 'S') {
        var rx1 = lcx == null ? cx : 2 * cx - lcx, ry1 = lcy == null ? cy : 2 * cy - lcy;
        cubic(rx1, ry1, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy);
        nlcx = a[0] + ox; nlcy = a[1] + oy; cx = a[2] + ox; cy = a[3] + oy;
      } else if (up === 'Q') {
        quad(a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy);
        cx = a[2] + ox; cy = a[3] + oy;
      } else if (up === 'A') {
        var ex = a[5] + ox, ey = a[6] + oy;
        _arcPoints(cx, cy, a[0], a[1], a[2], a[3] ? 1 : 0, a[4] ? 1 : 0, ex, ey).forEach(function(p) { add(p[0], p[1]); });
        cx = ex; cy = ey;
      }
      lcx = nlcx; lcy = nlcy;
    }
    return subs.filter(function(s) { return s.length > 1; });
  }

  // BLK-migrator-20260925-1032: 関係の線に沿った当たり判定。関係の選択範囲 (線・矢じり・ラベルを囲う箱) は
  // 斜めや曲がった線では線の無い空所まで広く覆い、複合状態のような入れ物の真ん中 (空所) を指しても
  // その中を通る遷移が選ばれていた。線そのものは太い透明な線 (幅 = 余白 × 2) で当て、入れ物より手前に置く。
  // 選択範囲の箱は入れ物より後ろに下げる (raiseSmallestLast)。入れ物の外では箱が今までどおり当たる。
  function addLinkLines(overlayEl, gs, attrs, padding) {
    var n = 0;
    var pad = padding == null ? 8 : padding;
    gs.forEach(function(g) {
      Array.prototype.forEach.call(g.querySelectorAll('path, line, polyline'), function(el) {
        linePoints(el).forEach(function(pts) {
          var d = pts.map(function(p, k) { return (k ? 'L' : 'M') + (Math.round(p[0] * 100) / 100) + ' ' + (Math.round(p[1] * 100) / 100); }).join(' ');
          var path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'transparent');
          path.setAttribute('stroke-width', String(pad * 2));
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.classList.add('link-hit');
          path.style.cursor = 'pointer';
          path.style.pointerEvents = 'stroke';
          Object.keys(attrs || {}).forEach(function(k) { path.setAttribute(k, attrs[k]); });
          path.setAttribute('data-hit-kind', 'linkline');
          overlayEl.appendChild(path);
          n++;
        });
      });
    });
    return n;
  }

  // 点から折れ線までの距離 (hitTestTopmost が太い線の当たりを測る)。
  function _distToPolyline(x, y, d) {
    var nums = (String(d || '').match(/-?\d+(?:\.\d+)?/g) || []).map(parseFloat);
    var best = Infinity;
    for (var i = 0; i + 3 < nums.length; i += 2) {
      var ax = nums[i], ay = nums[i + 1], bx = nums[i + 2], by = nums[i + 3];
      var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      var t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    if (nums.length === 2) best = Math.hypot(x - nums[0], y - nums[1]);
    return best;
  }

  function addLinkRects(overlayEl, linkGroupEl, attrs, padding) {
    if (!overlayEl || !linkGroupEl) return null;
    var gs = Array.isArray(linkGroupEl) ? linkGroupEl.filter(function(g) { return g; }) : [linkGroupEl];
    if (!gs.length) return null;
    var bb = null;
    gs.forEach(function(g) {
      var b1 = extractLinkBBox(g, padding);
      if (!b1) return;
      if (!bb) { bb = b1; return; }
      var x2 = Math.max(bb.x + bb.width, b1.x + b1.width), y2 = Math.max(bb.y + bb.height, b1.y + b1.height);
      bb = { x: Math.min(bb.x, b1.x), y: Math.min(bb.y, b1.y) };
      bb.width = x2 - bb.x; bb.height = y2 - bb.y;
    });
    if (!bb) return null;
    // data-hit-kind="link" は raiseSmallestLast が「関係は要素より後ろ」に置くための印。
    var linkAttrs = {};
    Object.keys(attrs || {}).forEach(function(k) { linkAttrs[k] = attrs[k]; });
    linkAttrs['data-hit-kind'] = 'link';
    var main = addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, linkAttrs);
    addLinkLines(overlayEl, gs, attrs, padding);
    // ラベルの箱は線と同じ段 (入れ物より手前)。選択範囲の箱 (link) とは段を分ける。
    var labelAttrs = {};
    Object.keys(linkAttrs).forEach(function(k) { labelAttrs[k] = linkAttrs[k]; });
    labelAttrs['data-hit-kind'] = 'linklabel';
    var labelPad = 3;
    var texts = [], polys = [];
    gs.forEach(function(g) {
      Array.prototype.push.apply(texts, g.querySelectorAll('text'));
      Array.prototype.push.apply(polys, g.querySelectorAll('polygon'));
    });
    texts.forEach(function(t) {
      var tb = _nodeBBox(t);
      if (!tb || !tb.width) return;
      addRect(overlayEl,
        tb.x - labelPad, tb.y - labelPad,
        tb.width + 2 * labelPad, tb.height + 2 * labelPad, labelAttrs);
    });
    // BLK-migrator-20260924-0637: 矢じりは行き先の図形の縁に接して描かれ、図形の枠 (余白付き) の内側に
    // 食い込む。関係は要素より後ろなので、矢じりを指すと行き先の図形が選ばれていた。矢じり (<polygon>)
    // そのものの範囲だけは関係を手前 (data-hit-kind="linkhead") に置く。余白は付けない。
    var headAttrs = {};
    Object.keys(attrs || {}).forEach(function(k) { headAttrs[k] = attrs[k]; });
    headAttrs['data-hit-kind'] = 'linkhead';
    polys.forEach(function(pg) {
      var hb = _nodeBBox(pg);
      if (!hb || hb.width < 2 || hb.height < 2 || hb.width > 40 || hb.height > 40) return;
      addRect(overlayEl, hb.x, hb.y, hb.width, hb.height, headAttrs);
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
    var rects = Array.prototype.slice.call(overlayEl.querySelectorAll('rect.selectable, path.link-hit'));
    if (rects.length < 2) return;
    var area = function(r) {
      if ((r.tagName || '').toLowerCase() === 'path') {
        var pb = pathBox(r.getAttribute('d'));
        return pb ? Math.max(pb.width, 1) * Math.max(pb.height, 1) : 0;
      }
      return (parseFloat(r.getAttribute('width')) || 0) * (parseFloat(r.getAttribute('height')) || 0);
    };
    // BLK-migrator-20260923-2312: 入れ物 (data-hit-kind="container"、複合状態など) は関係よりさらに後ろ。
    // 入れ物の中を通る関係のラベルを押したら、入れ物ではなくその関係が選ばれる。
    // BLK-migrator-20260925-1032: 関係の選択範囲の箱 (link) は入れ物よりさらに後ろ。箱は線の無い空所も覆うので、
    // 入れ物の中の空所を指したら入れ物が選ばれる。線そのもの (linkline) とラベル (linklabel) は入れ物より手前、要素より後ろ。
    var isLink = function(r) {
      var k = r.getAttribute('data-hit-kind');
      // 矢じり (linkhead) は要素より手前。矢じりの上だけは関係が選ばれる。
      if (k === 'link') return -2;
      if (k === 'container') return -1;
      if (k === 'linkline') return 0;
      if (k === 'linklabel') return 0.5;   // ラベルの文字は他の関係の線より手前 (文字を押したらその関係)
      // BLK-migrator-20260929-0951: 1 本の線で描いた棒 (activity の split / end split) は、棒に入る・棒から出る矢印の
      // 端の枠と重なる。棒の細い帯の上は棒が選ばれる (矢じりの関係 linkhead よりは後ろ)。
      if (k === 'bar') return 1.5;
      // BLK-migrator-20260929-0952: 入れ物 (activity の partition) の枠線の細い帯と見出しの札も同じ。辺・札を横切る矢印より手前で、
      // 見出し・枠線のどこを押しても入れ物が選ばれる。
      if (k === 'frameline') return 1.5;
      return k === 'linkhead' ? 2 : 1;
    };
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

  // BLK-migrator-20260923-1409: この PlantUML は data-source-line を出さないので、
  // 行での対応は必ず失敗し matchByOrder に落ちる。順番で当てると、パーサが読めない
  // 記法が 1 行あるだけで以後の枠が全部ずれる (同じ症状がこれで 4 件目)。
  // PlantUML は参加者の <g> に data-qualified-name (= DSL の別名) を自分で残すので、
  // 描いた側の名前で当てる。行を読み直さないので記法が増えても穴が開かない。
  //
  // BLK-builder-20260925-0314-1: PlantUML は data-qualified-name の ASCII 以外の文字を 1 文字ずつ
  // `.` に置き換えて出す (`センサ制御` → `.....`、`A太郎b` → `A..b`、サロゲート対も 1 文字)。
  // 名前をそのまま比べると日本語の名前を持つ要素に枠が 1 つも出ない。同じ伏せ方をした名前で比べ、
  // 伏せた結果が重なる (`太郎` と `別名` はどちらも `..`) ときは、PlantUML が要素を作った順
  // (= 文書の順) と items の順で 1 つずつ組にする。
  function qualifiedNameKey(name) {
    var out = '';
    Array.from(String(name == null ? '' : name)).forEach(function(ch) {
      out += ch.codePointAt(0) > 0x7F ? '.' : ch;
    });
    return out;
  }
  function matchByEntityName(svgEl, items, selector) {
    if (!svgEl || !svgEl.querySelectorAll) return [];
    var groups = Array.prototype.slice.call(svgEl.querySelectorAll(selector));
    var byName = {};
    groups.forEach(function(g) {
      var nm = g.getAttribute && g.getAttribute('data-qualified-name');
      if (nm && !byName[nm]) byName[nm] = g;
    });
    var used = [];
    var found = items.map(function(item) {
      var g = (item && item.id != null) ? byName[item.id] : null;
      if (g) used.push(g);
      return g || null;
    });
    items.forEach(function(item, i) {
      if (found[i] || !item || item.id == null) return;
      var key = qualifiedNameKey(item.id);
      if (key === String(item.id)) return;   // ASCII だけの名前は伏せられないので、上で当たらなければ無い
      for (var k = 0; k < groups.length; k++) {
        var g = groups[k];
        if (used.indexOf(g) >= 0) continue;
        if ((g.getAttribute('data-qualified-name') || '') !== key) continue;
        found[i] = g; used.push(g); break;
      }
    });
    var matches = [];
    items.forEach(function(item, i) {
      if (found[i]) matches.push({ item: item, groupEl: found[i] });
    });
    return matches;
  }

  // BLK-migrator-20260923-1409: 参加者の頭は PlantUML が <rect> で実寸を描く。
  // extractBBox は最初の <text> しか見ないため、表示名が ¥n で複数行になると
  // 1 行目の上だけが当たり判定になり、2 行目以降を指しても枠が出なかった。
  // 塗りのある図形 (= 実際に描かれた箱) の和集合を取れば、行数にも装飾 (<b> 等) にも
  // 左右されない。塗りが無ければ子要素全部の和集合に落ちる。
  function extractDrawnBBox(g) {
    if (!g || !g.querySelectorAll) return null;
    var shapes = g.querySelectorAll('rect, polygon, ellipse, path');
    var minX = null, minY = null, maxX = null, maxY = null;
    Array.prototype.forEach.call(shapes, function(sh) {
      var fill = (sh.getAttribute('fill') || '').toLowerCase();
      if (!fill || fill === 'none' || fill === 'transparent') return;
      var op = parseFloat(sh.getAttribute('fill-opacity'));
      if (!isNaN(op) && op === 0) return;
      var bb = _nodeBBox(sh);
      if (!bb || (!bb.width && !bb.height)) return;
      if (minX === null || bb.x < minX) minX = bb.x;
      if (minY === null || bb.y < minY) minY = bb.y;
      if (maxX === null || bb.x + bb.width > maxX) maxX = bb.x + bb.width;
      if (maxY === null || bb.y + bb.height > maxY) maxY = bb.y + bb.height;
    });
    if (minX === null) return extractUnionBBox(g);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // BLK-migrator-20260923-1909: PlantUML が SVG に残す要素情報 (data-qualified-name /
  // data-source-line) を先に使って当てる。パーサが読めない記法 (`abstract X` / `circle` /
  // `cloud { }` / `artifact` …) が 1 つあるだけで、並び順で当てていた枠が全部ずれたり、
  // 名前が合わずに枠が出なかったりした。記法ごとに穴を塞がず、描いた側の情報で当てる。
  function _srcLine(g) {
    var n = parseInt(g && g.getAttribute ? g.getAttribute('data-source-line') : '', 10);
    return isNaN(n) ? null : n + 1;
  }

  // 名前で要素の <g> を引く。修飾名 (`Pkg.Name`) の末尾が `.{id}` のものが 1 つだけならそれ。
  function findEntityByName(svgEl, id, selector) {
    if (!svgEl || !svgEl.querySelectorAll || id == null) return null;
    var sid = String(id);
    var all = svgEl.querySelectorAll(selector || 'g.entity[data-qualified-name]');
    var suffix = [];
    for (var i = 0; i < all.length; i++) {
      var qn = all[i].getAttribute('data-qualified-name') || '';
      if (qn === sid) return all[i];
      if (qn.length > sid.length && qn.slice(-(sid.length + 1)) === '.' + sid) suffix.push(all[i]);
    }
    return suffix.length === 1 ? suffix[0] : null;
  }

  // 関係 (線) は書かれた行で当てる。行で当たらない関係は、行が 1 本も当たらなかった
  // (= SVG に行の情報が無い) ときだけ並び順で残りに当てる。戻り値は relations と同じ長さ。
  // BLK-builder-20260925-0305-1: 行で当たらない関係は、SVG の線が持つ両端 (data-entity-1 / -2 → その要素の
  // data-qualified-name) で当てる。`!pragma layout smetana` の SVG は線に行の情報を付けず、関連クラス
  // `(A, B) . C` があると A→B の線は名前の無い中継点 (junction) で 2 本に割れる。並び順で当てると
  // 前半だけ・別の線に枠が付き、矢じりを指すと行き先の要素が選ばれていた。
  // 戻り値の配列には parts (添字ごとの、同じ関係を成す残りの線の <g> の配列) を持たせる。
  function _endName(svgEl, id) {
    if (!id || !svgEl || !svgEl.querySelector) return null;
    var el = null;
    try { el = svgEl.querySelector('[id="' + String(id).replace(/"/g, '') + '"]'); } catch (e) { el = null; }
    var qn = el ? el.getAttribute('data-qualified-name') : null;
    return qn ? String(qn) : null;
  }
  function linkEnds(svgEl, g) {
    if (!g || !g.getAttribute) return null;
    var a = g.getAttribute('data-entity-1'), b = g.getAttribute('data-entity-2');
    if (!a || !b) return null;
    return { a: a, b: b, an: _endName(svgEl, a), bn: _endName(svgEl, b) };
  }
  function _sameName(qn, name) {
    if (!qn || name == null) return false;
    var n = String(name).replace(/^"|"$/g, '').replace(/^\[|\]$/g, '');
    return qn === n || (qn.length > n.length && qn.slice(-(n.length + 1)) === '.' + n);
  }
  function _endsMatch(e, from, to) {
    return (_sameName(e.an, from) && _sameName(e.bn, to)) || (_sameName(e.an, to) && _sameName(e.bn, from));
  }

  function matchLinksByLine(svgEl, relations) {
    var groups = Array.prototype.slice.call(linkGroups(svgEl));
    var out = (relations || []).map(function() { return null; });
    var parts = out.map(function() { return []; });
    out.parts = parts;
    var used = [];
    var hits = 0;
    (relations || []).forEach(function(r, i) {
      for (var k = 0; k < groups.length; k++) {
        if (used.indexOf(groups[k]) < 0 && _srcLine(groups[k]) === Number(r.line)) {
          out[i] = groups[k]; used.push(groups[k]); hits++; return;
        }
      }
    });
    // 行で当たらなかった関係を両端で当てる (直接結ぶ線 → 名前の無い中継点 1 つを挟む 2 本)。
    var ends = groups.map(function(g) { return linkEnds(svgEl, g); });
    var anyEnds = ends.some(function(e) { return e && (e.an || e.bn); });
    if (anyEnds) {
      (relations || []).forEach(function(r, i) {
        if (out[i] || r.from == null || r.to == null) return;
        var k;
        for (k = 0; k < groups.length; k++) {
          if (used.indexOf(groups[k]) < 0 && ends[k] && _endsMatch(ends[k], r.from, r.to)) {
            out[i] = groups[k]; used.push(groups[k]); return;
          }
        }
        // 中継点: 片端が名前を持たない (要素の <g> ではない) 線どうしを、同じ id でつなぐ。
        for (k = 0; k < groups.length; k++) {
          var e1 = ends[k];
          if (used.indexOf(groups[k]) >= 0 || !e1) continue;
          var here = null, j1 = null;
          if (e1.an && !e1.bn) { here = e1.an; j1 = e1.b; }
          else if (e1.bn && !e1.an) { here = e1.bn; j1 = e1.a; }
          if (!here) continue;
          var other = _sameName(here, r.from) ? r.to : (_sameName(here, r.to) ? r.from : null);
          if (other == null) continue;
          for (var m = 0; m < groups.length; m++) {
            var e2 = ends[m];
            if (m === k || used.indexOf(groups[m]) >= 0 || !e2) continue;
            if ((e2.a === j1 && !e2.an && _sameName(e2.bn, other)) ||
                (e2.b === j1 && !e2.bn && _sameName(e2.an, other))) {
              out[i] = groups[k]; parts[i] = [groups[m]];
              used.push(groups[k]); used.push(groups[m]);
              return;
            }
          }
        }
      });
    }
    // 行の情報が 1 本も無い SVG は、行でも両端でも当たらなかった残りを並び順で当てる。
    if (hits === 0) {
      var rest = groups.filter(function(g) { return used.indexOf(g) < 0; });
      out.forEach(function(g, i) { if (!g && rest.length) out[i] = rest.shift(); });
    }
    return out;
  }

  // 名前の無い中継点 (関連クラスの点) を挟んで a と b を結ぶ線があるとき、その中継点の id。
  function junctionBetween(svgEl, a, b) {
    var groups = Array.prototype.slice.call(linkGroups(svgEl));
    var touch = {};
    groups.forEach(function(g) {
      var e = linkEnds(svgEl, g);
      if (!e) return;
      if (!e.an && e.bn) (touch[e.a] = touch[e.a] || []).push(e.bn);
      if (!e.bn && e.an) (touch[e.b] = touch[e.b] || []).push(e.an);
    });
    var ids = Object.keys(touch);
    for (var i = 0; i < ids.length; i++) {
      var ns = touch[ids[i]];
      var hasA = ns.some(function(n) { return _sameName(n, a); });
      var hasB = ns.some(function(n) { return _sameName(n, b); });
      if (hasA && hasB) return ids[i];
    }
    return null;
  }

  // 中継点 junctionId と名前 name を結ぶ線の <g>。
  function linkFromJunction(svgEl, junctionId, name) {
    var groups = Array.prototype.slice.call(linkGroups(svgEl));
    for (var i = 0; i < groups.length; i++) {
      var e = linkEnds(svgEl, groups[i]);
      if (!e) continue;
      if ((e.a === junctionId && !e.an && _sameName(e.bn, name)) ||
          (e.b === junctionId && !e.bn && _sameName(e.an, name))) return groups[i];
    }
    return null;
  }

  // 入れ物 (package / node / folder …) は開始行、次に表示名で当てる。どちらも当たらず、
  // SVG に行の情報が無いときだけ並び順で当てる。戻り値は groups と同じ長さ。
  function matchClusters(svgEl, groups) {
    var cls = Array.prototype.slice.call(svgEl ? svgEl.querySelectorAll('g.cluster') : []);
    var out = (groups || []).map(function() { return null; });
    var used = [];
    function take(i, g) { out[i] = g; used.push(g); }
    (groups || []).forEach(function(gr, i) {
      var line = Number(gr.startLine != null ? gr.startLine : gr.line);
      for (var k = 0; k < cls.length; k++) {
        if (used.indexOf(cls[k]) < 0 && _srcLine(cls[k]) === line) { take(i, cls[k]); return; }
      }
    });
    (groups || []).forEach(function(gr, i) {
      if (out[i]) return;
      var label = String(gr.label || gr.id || '');
      for (var k = 0; k < cls.length; k++) {
        if (used.indexOf(cls[k]) >= 0) continue;
        var qn = cls[k].getAttribute('data-qualified-name') || '';
        if (qn === label || qn.slice(-(label.length + 1)) === '.' + label) { take(i, cls[k]); return; }
      }
    });
    var anyLine = cls.some(function(g) { return _srcLine(g) !== null; });
    if (!anyLine) {
      var rest = cls.filter(function(g) { return used.indexOf(g) < 0; });
      out.forEach(function(g, i) { if (!g && rest.length) take(i, rest.shift()); });
    }
    return out;
  }

  // どの要素にも取られなかった <g> (要素・入れ物・関係・題・凡例) にも、書かれた行を指す
  // 当たり判定を置く。フォームで直せない記法でも、指せば本文のその行へ飛び、
  // 右欄で「フォーム未対応の記法」と分かる (黙って何も出さない、をやめる)。
  // claimed: モジュールが既に当てた <g> の配列。戻り値は置いた数。
  // selector: 見る <g> を絞るとき (state 図は要素を自前で当てるので題 `g.title` だけ)。
  // BLK-migrator-20260926-1116: 複数行の note (`note right of X` … `end note`) の data-source-line は、PlantUML が
  // note の見出しの行でなく本文の 1 行目を指す。1 行上が note の見出しならその行を note の行にする
  // (押すと本文の 1 行目でなく note の行が選ばれる)。1 行の note・浮いた note は書いた行のまま。
  function _noteHeadLine(dslText, line) {
    if (dslText == null || line == null) return line;
    var ls = String(dslText).split(/\r?\n/);
    var re = /^\s*[rh]?note\b/i;
    if (re.test(ls[line - 1] || '')) return line;
    var up = ls[line - 2] || '';
    return (re.test(up) && !/:/.test(up.replace(/"[^"]*"/g, ''))) ? line - 1 : line;
  }

  function addUnclaimed(svgEl, overlayEl, claimed, selector, dslText) {
    if (!svgEl || !overlayEl || !svgEl.querySelectorAll) return 0;
    var taken = claimed || [];
    var n = 0;
    var nodes = svgEl.querySelectorAll(selector || 'g.entity, g.cluster, g.title, g.legend, g.link, g[class*="link_"]');
    Array.prototype.forEach.call(nodes, function(g) {
      if (taken.indexOf(g) >= 0) return;
      // BLK-migrator-20260925-0932: 題・凡例・見出し・脚注・説明は addDocumentChrome の 1 か所で当てる。
      if (CHROME_KINDS.indexOf((g.getAttribute('class') || '').split(/\s+/)[0]) >= 0) return;
      var line = _srcLine(g);
      var paperBox = notePaperBox(g);
      if (paperBox) line = _noteHeadLine(dslText, line);
      // 行を持たない要素 (PlantUML が `diamond` などに行を付けない) も、名前があれば枠は出す。
      if (line === null && !g.getAttribute('data-qualified-name')) return;
      var cls = (g.getAttribute('class') || '').split(/\s+/)[0];
      var qn = g.getAttribute('data-qualified-name') || cls;
      var attrs = {
        'data-type': 'source-line',
        'data-id': 'src:' + qn + '@' + (line === null ? '?' : line) + ':' + (g.getAttribute('id') || n),
        'data-src-kind': cls,
        'data-src-name': g.getAttribute('data-qualified-name') || '',
      };
      if (line !== null) attrs['data-line'] = String(line);
      if (/link/.test(cls)) {
        attrs['data-hit-kind'] = 'link';
        if (addLinkRects(overlayEl, g, attrs, 8)) n++;
        return;
      }
      // 注釈は紙の外形 (notePapers) を範囲にする (中の Creole の図形・文字から取らない)。
      var bb = paperBox || extractUnionBBox(g, 'text, line, polygon, polyline, path, rect, ellipse');
      if (!bb || !(bb.width > 0 || bb.height > 0)) return;
      var pad = cls === 'cluster' ? 2 : 4;
      addRect(overlayEl, bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2, attrs);
      n++;
    });
    if (!selector || /g\.(title|header|footer|caption|legend)/.test(selector)) n += addDocumentChrome(svgEl, overlayEl, null);
    return n;
  }

  // BLK-migrator-20260924-0752: PlantUML は旧記法のアクティビティ図 (`(*) -->` / `if "..." then` /
  // `===LABEL===`) を関係 (<g class="link">) には行つきで描くが、動作の箱・同期バーは <g> に入れず、
  // 分岐の菱形は行の無い <g class="entity"> で描く。行の無い図形は、端が触れている関係の行で当てる
  // (入ってくる関係のうち最も早く書かれた行 = その要素を初めて書いた行。無ければ出ていく関係の行)。
  // 記法を読み直さず、描いた側の線のつながりだけを使う。関係に行の情報が無い図では何もしない。
  function _pathEnds(g) {
    var p = g.querySelector('path');
    if (!p) return null;
    var nums = (p.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi);
    if (!nums || nums.length < 4) return null;
    var n = nums.map(Number);
    return { sx: n[0], sy: n[1], ex: n[n.length - 2], ey: n[n.length - 1] };
  }

  function _inBox(bb, x, y, pad) {
    return x >= bb.x - pad && x <= bb.x + bb.width + pad && y >= bb.y - pad && y <= bb.y + bb.height + pad;
  }

  function _isLooseShape(el) {
    var n = el.parentNode;
    while (n && n.tagName && n.tagName.toLowerCase() !== 'svg') {
      if (n.tagName.toLowerCase() === 'g' && n.getAttribute('class')) return false;
      n = n.parentNode;
    }
    return true;
  }

  function addLooseShapes(svgEl, overlayEl, claimed) {
    if (!svgEl || !overlayEl || !svgEl.querySelectorAll) return 0;
    var taken = claimed || [];
    var links = [];
    Array.prototype.forEach.call(linkGroups(svgEl), function(g) {
      var line = _srcLine(g);
      var ends = _pathEnds(g);
      if (line !== null && ends) links.push({ line: line, ends: ends });
    });
    if (!links.length) return 0;
    var targets = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('rect, polygon, ellipse'), function(el) {
      if (taken.indexOf(el) >= 0 || !_isLooseShape(el)) return;
      var bb = _nodeBBox(el);
      if (!bb || bb.width < 6 || bb.height < 4) return;
      targets.push({ el: el, bb: bb, kind: 'shape', name: '' });
    });
    Array.prototype.forEach.call(svgEl.querySelectorAll('g[class$="entity"]'), function(g) {
      if (taken.indexOf(g) >= 0 || _srcLine(g) !== null) return;
      var bb = extractUnionBBox(g, 'rect, polygon, ellipse, path, text');
      if (!bb || !(bb.width > 0)) return;
      targets.push({ el: g, bb: bb, kind: (g.getAttribute('class') || '').split(/\s+/)[0],
        name: g.getAttribute('data-qualified-name') || '' });
    });
    var n = 0;
    targets.forEach(function(t, i) {
      var inLine = null, outLine = null;
      links.forEach(function(l) {
        if (_inBox(t.bb, l.ends.ex, l.ends.ey, 8) && (inLine === null || l.line < inLine)) inLine = l.line;
        if (_inBox(t.bb, l.ends.sx, l.ends.sy, 3) && (outLine === null || l.line < outLine)) outLine = l.line;
      });
      var line = inLine !== null ? inLine : outLine;
      if (line === null) return;
      var pad = 2;
      addRect(overlayEl, t.bb.x - pad, t.bb.y - pad, t.bb.width + pad * 2, t.bb.height + pad * 2, {
        'data-type': 'source-line',
        'data-id': 'src:' + (t.name || t.kind) + '@' + line + ':' + i,
        'data-src-kind': t.kind,
        'data-src-name': t.name,
        'data-line': String(line),
      });
      taken.push(t.el);
      n++;
    });
    return n;
  }

  // BLK-migrator-20260923-2012: シーケンスの参加者は宣言キーワードで形が変わる
  // (actor = 棒人間の下に名前、boundary / control / entity = 円の下に名前、database = 円柱、
  // queue = 横向きの筒 …)。名前が図形の外に出る形では、塗りのある図形だけを囲むと
  // 名前の上に枠が出ない。描かれた図形と文字の和集合で囲む。キーワードごとの分岐は持たない
  // (長方形の participant は文字が箱の内側なので、囲む範囲は今までと同じ)。
  function extractFigureBBox(g) {
    var drawn = extractDrawnBBox(g);
    var texts = extractUnionBBox(g, 'text');
    if (!drawn) return texts;
    if (!texts) return drawn;
    var x = Math.min(drawn.x, texts.x);
    var y = Math.min(drawn.y, texts.y);
    return {
      x: x, y: y,
      width: Math.max(drawn.x + drawn.width, texts.x + texts.width) - x,
      height: Math.max(drawn.y + drawn.height, texts.y + texts.height) - y,
    };
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
    var rects = overlayEl.querySelectorAll('rect.selectable, path.link-hit');
    for (var i = rects.length - 1; i >= 0; i--) {
      var r = rects[i];
      if ((r.tagName || '').toLowerCase() === 'path') {
        // 太い透明な線: 線からの距離が線幅の半分以内なら当たり。
        var half = (parseFloat(r.getAttribute('stroke-width')) || 0) / 2;
        if (_distToPolyline(x, y, r.getAttribute('d')) <= half) return r;
        continue;
      }
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

  // BLK-builder-20260925-0934-3: 図の飾り (title / header / footer / caption / legend) の当て方を図種で分けない。
  // PlantUML は図種によって <g class="header"> などに入れて描く (class / component …、legend は行を持たない) か、
  // class の無い裸の <text> と <rect> で描く (sequence) ので、図種ごとのモジュールでは header・footer・caption・
  // legend に枠が出なかった。本文の行から飾りを読み、<g class="{種類}"> があればそれ、無ければ文字の一致する
  // 裸の <text> (legend は囲む箱も) に、書かれた行を指す枠を置く。既にモジュールが枠を置いたもの (sequence の題名、
  // class の題名など) は置かない。戻り値は置いた数。
  var CHROME_KINDS = ['title', 'header', 'footer', 'caption', 'legend'];

  function _chromePlain(s) {
    return String(s == null ? '' : s)
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      .replace(/\*\*|\/\/|""|__|~~/g, '')
      .replace(/\s+/g, '');
  }

  // 本文から飾りを読む: [{ kind, line (1 始まり), texts: [表示行…] }]。最初の @start〜@end の中だけ。
  function chromeEntries(text) {
    var lines = String(text == null ? '' : text).split('\n').map(function(l) { return l.replace(/\r$/, ''); });
    var s = 0, e = lines.length, i;
    for (i = 0; i < lines.length; i++) {
      if (/^\s*@start\w*/i.test(lines[i])) {
        s = i + 1;
        for (var j = s; j < lines.length; j++) { if (/^\s*@end\w*/i.test(lines[j])) { e = j; break; } }
        break;
      }
    }
    var out = [], cur = null, inStyle = false;
    for (i = s; i < e; i++) {
      var t = lines[i].trim();
      if (inStyle) { if (/<\/style>/i.test(t)) inStyle = false; continue; }
      if (/^<style\b/i.test(t)) { if (!/<\/style>/i.test(t)) inStyle = true; continue; }
      if (cur) {
        if (new RegExp('^end\\s*' + cur.kind + '\\b', 'i').test(t)) { out.push(cur); cur = null; continue; }
        cur.texts.push(t);
        continue;
      }
      // BLK-migrator-20260925-1732: `mainframe 見出し` は図全体を囲む枠と左上の札。札の文字を本文のその行に当てる。
      var mf = /^mainframe\s+(.+)$/i.exec(t);
      if (mf) { out.push({ kind: 'mainframe', line: i + 1, texts: [mf[1]] }); continue; }
      var m = /^(?:(left|right|center)\s+)?(title|header|footer|caption|legend)\b\s*(.*)$/i.exec(t);
      if (!m) continue;
      var kind = m[2].toLowerCase(), rest = m[3];
      if (m[1] && kind !== 'header' && kind !== 'footer') continue;
      if (/^[{:]/.test(rest)) continue;
      if (kind === 'legend' && /^((top|bottom|left|right|center)\s*)*$/i.test(rest)) {
        cur = { kind: kind, line: i + 1, texts: [] };
        continue;
      }
      if (rest === '' && kind !== 'caption') { cur = { kind: kind, line: i + 1, texts: [] }; continue; }
      out.push({ kind: kind, line: i + 1, texts: [rest] });
    }
    out.forEach(function(en) {
      var flat = [];
      en.texts.forEach(function(tx) { String(tx).split(/\\n/).forEach(function(p) { flat.push(p); }); });
      en.texts = flat.filter(function(p) { return _chromePlain(p) !== ''; });
    });
    return out;
  }

  // 本文の 1 行を、描かれた文字と比べる正規表現にする。%page% / $THEME / %version() / C4Version() は何にでも当てる。
  function _chromeLineRe(txt) {
    var p = _chromePlain(txt);
    var parts = p.split(/%\w+%|%\w+\([^)]*\)|\$\w+|\w+\(\)/);
    return new RegExp('^' + parts.map(function(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('.*?') + '$');
  }

  function _chromeOwner(el, svgEl) {
    var n = el.parentNode;
    while (n && n !== svgEl && n.getAttribute) {
      var c = n.getAttribute('class');
      if (c) return c.split(/\s+/)[0];
      n = n.parentNode;
    }
    return '';
  }

  function _unionBoxes(boxes) {
    var minX = null, minY = null, maxX = null, maxY = null;
    boxes.forEach(function(bb) {
      if (!bb) return;
      if (minX === null || bb.x < minX) minX = bb.x;
      if (minY === null || bb.y < minY) minY = bb.y;
      if (maxX === null || bb.x + bb.width > maxX) maxX = bb.x + bb.width;
      if (maxY === null || bb.y + bb.height > maxY) maxY = bb.y + bb.height;
    });
    return minX === null ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function _chromeCovered(overlayEl, bb) {
    var cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    var area = Math.max(bb.width * bb.height, 1);
    var rects = overlayEl.querySelectorAll('rect.selectable');
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      var x = parseFloat(r.getAttribute('x')), y = parseFloat(r.getAttribute('y'));
      var w = parseFloat(r.getAttribute('width')), h = parseFloat(r.getAttribute('height'));
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || w < 2 || h < 2) continue;
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h && w * h <= area * 4) return true;
    }
    return false;
  }

  function _placeChrome(overlayEl, kind, line, bb, pad, i) {
    if (!bb || !(bb.width > 0 || bb.height > 0)) return 0;
    if (_chromeCovered(overlayEl, bb)) return 0;
    addRect(overlayEl, bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2, {
      'data-type': 'source-line',
      'data-id': 'src:' + kind + '@' + line + ':chrome' + i,
      'data-src-kind': kind,
      'data-src-name': '',
      'data-line': String(line),
    });
    return 1;
  }

  // BLK-migrator-20260925-1732: mainframe の描いた物を探す。PlantUML は図全体を囲む裸の <rect>、左上の札の輪郭
  // (<path> 1 本: 右上から下りて斜めに左下へ)、札の文字 (<text>) を、どの <g> にも入れずに描く (6 図種とも同じ)。
  // 札の文字は本文の見出しと同じ文字の裸の <text> のうち最も上のもの、札はその文字を囲む最も小さい裸の <path>、
  // 枠はその札の左上の角に左上の角が重なる裸の <rect>。戻り値: [{ line, text, path, rect, tab: 札の矩形 }]
  function mainframeParts(svgEl, dslText, entries) {
    if (!svgEl || !svgEl.querySelectorAll || dslText == null) return [];
    var list = (entries || chromeEntries(dslText)).filter(function(en) { return en.kind === 'mainframe'; });
    if (!list.length) return [];
    function bare(sel) {
      return Array.prototype.filter.call(svgEl.querySelectorAll(sel), function(el) { return !_chromeOwner(el, svgEl); });
    }
    var texts = bare('text'), paths = bare('path'), rects = bare('rect');
    var out = [];
    list.forEach(function(en) {
      var re = _chromeLineRe(en.texts[0] || '');
      var best = null, bestBox = null;
      texts.forEach(function(t) {
        if (out.some(function(o) { return o.text === t; })) return;
        var norm = _chromePlain(t.textContent);
        if (!norm || !re.test(norm)) return;
        var bb = _nodeBBox(t);
        if (bb && (!bestBox || bb.y < bestBox.y)) { best = t; bestBox = bb; }
      });
      if (!best) return;
      var cx = bestBox.x + Math.min(bestBox.width / 2, 4), cy = bestBox.y + bestBox.height / 2;
      var tabPath = null, tabBox = null;
      paths.forEach(function(p) {
        var pb = _nodeBBox(p);
        if (!pb || cx < pb.x - 1 || cx > pb.x + pb.width + 1 || cy < pb.y - 1 || cy > pb.y + pb.height + 1) return;
        if (!tabBox || pb.width * pb.height < tabBox.width * tabBox.height) { tabPath = p; tabBox = pb; }
      });
      var frame = null;
      if (tabBox) {
        rects.forEach(function(r) {
          var rb = _nodeBBox(r);
          if (!rb || Math.abs(rb.x - tabBox.x) > 1 || Math.abs(rb.y - tabBox.y) > 1) return;
          if (rb.width < tabBox.width || rb.height < tabBox.height) return;
          if (!frame || rb.width * rb.height > frame.w * frame.h) frame = { el: r, w: rb.width, h: rb.height };
        });
      }
      out.push({
        line: en.line, text: best, path: tabPath, rect: frame ? frame.el : null,
        tab: _unionBoxes([bestBox, tabBox]),
      });
    });
    return out;
  }

  // 図全体に掛かる飾り (mainframe の札の文字・札・枠) の要素。図種のモジュールが並び順・文字で要素を当てるとき、
  // これらを数えないために使う (見出しの文字をメッセージや部品の文字と取り違えない)。
  function chromeElements(svgEl, dslText) {
    var els = [];
    try {
      mainframeParts(svgEl, dslText).forEach(function(mp) {
        [mp.text, mp.path, mp.rect].forEach(function(el) { if (el) els.push(el); });
      });
    } catch (e) {}
    return els;
  }

  // dslText を渡さないとき (図種のモジュールが本文なしで呼ぶ) は、<g class="{種類}" data-source-line> の行だけで当てる。
  // data-source-line は @startuml を 0 とするので、opts.startUmlLine (@startuml の行、既定 1) を足す。
  // 行を持たない legend と裸の文字は、本文を渡す呼び出し (app の描画のたび) が当てる。
  function addDocumentChrome(svgEl, overlayEl, dslText, opts) {
    if (!svgEl || !overlayEl || !svgEl.querySelectorAll) return 0;
    if (dslText == null) {
      var base = (opts && opts.startUmlLine) || 1;
      var placed = 0;
      CHROME_KINDS.forEach(function(kind) {
        Array.prototype.forEach.call(svgEl.querySelectorAll('g.' + kind), function(g, i) {
          var sl = parseInt(g.getAttribute('data-source-line'), 10);
          if (isNaN(sl)) return;
          placed += _placeChrome(overlayEl, kind, base + sl, extractUnionBBox(g, 'text, rect, polygon, path, line'), 2, i);
        });
      });
      return placed;
    }
    var entries = chromeEntries(dslText);
    if (!entries.length) return 0;
    var loose = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('text'), function(t) {
      var owner = _chromeOwner(t, svgEl);
      if (owner && CHROME_KINDS.indexOf(owner) < 0) return;
      var norm = _chromePlain(t.textContent);
      if (!norm) return;
      loose.push({ el: t, norm: norm, owner: owner, used: false });
    });
    var n = 0;
    mainframeParts(svgEl, dslText, entries).forEach(function(mp, i) {
      loose.forEach(function(lt) { if (lt.el === mp.text) lt.used = true; });
      n += _placeChrome(overlayEl, 'mainframe', mp.line, mp.tab, 1, i);
    });
    CHROME_KINDS.forEach(function(kind) {
      var list = entries.filter(function(en) { return en.kind === kind; });
      if (!list.length) return;
      var groups = Array.prototype.slice.call(svgEl.querySelectorAll('g.' + kind));
      var picks = [];
      function matches(en, norm) {
        for (var k = 0; k < en.texts.length; k++) {
          var lp = _chromePlain(en.texts[k]);
          if (_chromeLineRe(en.texts[k]).test(norm)) return true;
          if (norm.length >= 2 && lp.indexOf(norm) >= 0) return true;
        }
        return false;
      }
      if (groups.length) {
        // 描かれた <g> ごとに、文字の合う行 (無ければ同じ種類の最後の行) に当てる。
        groups.forEach(function(g) {
          var txt = _chromePlain(g.textContent);
          var en = null;
          for (var k = 0; k < list.length && !en; k++) {
            if (list[k].texts.some(function(tx) { var lp = _chromePlain(tx); return lp && (txt.indexOf(lp) >= 0 || _chromeLineRe(tx).test(txt)); })) en = list[k];
          }
          if (!en) en = list[list.length - 1];
          var bb = extractUnionBBox(g, 'text, rect, polygon, path, line');
          loose.forEach(function(lt) { if (lt.owner === kind && g.contains(lt.el)) lt.used = true; });
          if (bb) picks.push({ en: en, bb: bb, pad: 2 });
        });
      } else {
        list.forEach(function(en) {
          var boxes = [];
          loose.forEach(function(lt) {
            if (lt.used || lt.owner) return;
            if (!matches(en, lt.norm)) return;
            lt.used = true;
            boxes.push(_nodeBBox(lt.el));
          });
          var bb = _unionBoxes(boxes);
          if (!bb) return;
          if (kind === 'legend') {
            // 凡例は文字を囲む箱 (裸の <rect>) ごと枠にする。
            Array.prototype.forEach.call(svgEl.querySelectorAll('rect'), function(r) {
              if (_chromeOwner(r, svgEl)) return;
              var rb = _nodeBBox(r);
              if (!rb || rb.width * rb.height > bb.width * bb.height * 8) return;
              if (rb.x <= bb.x + 1 && rb.y <= bb.y + 1 && rb.x + rb.width >= bb.x + bb.width - 1 &&
                  rb.y + rb.height >= bb.y + bb.height - 1) bb = _unionBoxes([bb, rb]);
            });
          }
          picks.push({ en: en, bb: bb, pad: 3 });
        });
      }
      picks.forEach(function(p, i) { n += _placeChrome(overlayEl, kind, p.en.line, p.bb, p.pad, i); });
    });
    return n;
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
    addUnclaimed: addUnclaimed,
    addDocumentChrome: addDocumentChrome,
    chromeEntries: chromeEntries,
    mainframeParts: mainframeParts,
    chromeElements: chromeElements,
    addLooseShapes: addLooseShapes,
    findEntityByName: findEntityByName,
    matchClusters: matchClusters,
    matchLinksByLine: matchLinksByLine,
    linkEnds: linkEnds,
    junctionBetween: junctionBetween,
    linkFromJunction: linkFromJunction,
    addRect: addRect,
    closestLinkGroup: closestLinkGroup,
    dedupById: dedupById,
    extractBBox: extractBBox,
    extractEdgeBBox: extractEdgeBBox,
    extractLinkBBox: extractLinkBBox,
    linkGroups: linkGroups,
    extractUnionBBox: extractUnionBBox,
    nodeBBox: _nodeBBox,
    pathBox: pathBox,
    pathPoints: pathPoints,
    noteBodyBox: noteBodyBox,
    notePapers: notePapers,
    notePaperBox: notePaperBox,
    notePaperAt: notePaperAt,
    noteLineKey: noteLineKey,
    extractMultiLineTextBBoxes: extractMultiLineTextBBoxes,
    hitTestTopmost: hitTestTopmost,
    linePoints: linePoints,
    addLinkLines: addLinkLines,
    extractDrawnBBox: extractDrawnBBox,
    extractFigureBBox: extractFigureBBox,
    matchByEntityName: matchByEntityName,
    qualifiedNameKey: qualifiedNameKey,
    matchByDataSourceLine: matchByDataSourceLine,
    matchByOrder: matchByOrder,
    pickBestOffset: pickBestOffset,
    raiseSmallestLast: raiseSmallestLast,
    syncDimensions: syncDimensions,
    warnIfMismatch: warnIfMismatch,
  };
})();
