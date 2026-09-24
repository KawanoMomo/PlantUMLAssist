'use strict';
window.MA = window.MA || {};

// state-svg-map — 状態遷移図の選択枠を、PlantUML が SVG に残した要素情報から当てる
// (BLK-migrator-20260923-2312)。
//
// 以前は DSL を読み直した結果 (状態の宣言・遷移の数) と SVG の図形の数・順番を突き合わせていたので、
// 宣言の無い状態 (`[*] --> State1` だけの図)、並行領域の子、`<<choice>>` / fork / join / 入口・出口、
// `->` や `--->` の遷移が 1 つ混ざるだけで数が合わず、枠がほぼ全部落ちた。
// ここは SVG だけを見て枠の置き場所を決め、DSL (parse の結果) は「その枠を選んだとき
// どの行を開くか」を引くためだけに使う:
//   - 状態 / 複合状態 / 開始・終了: `<g class="entity|cluster|start_entity|end_entity" data-qualified-name>`
//   - 遷移: `<g class="link" data-source-line>` (線・矢じり・ラベルの和集合)
//   - fork / join の棒、入口・出口の丸 (名前の付いた <g> を持たない図形):
//     遷移の線の端がその図形に触れていれば、`<!--link A to B-->` の名前をその図形の名前にする
window.MA.stateSvgMap = (function() {
  function _s(v) { return v == null ? '' : String(v); }
  function _num(el, a) { return parseFloat(el.getAttribute(a)) || 0; }

  // 並行領域は SVG の修飾名に `CONC2` のような仮の段を挟む (`Active.CONC2.CapsLockOn`)。
  function normalizeName(qn) {
    return _s(qn).split('.').filter(function(seg) { return seg && !/^CONC\d+$/.test(seg); }).join('.');
  }
  function shortName(qn) {
    var s = _s(qn);
    return s.indexOf('.') >= 0 ? s.slice(s.lastIndexOf('.') + 1) : s;
  }

  // 開始・終了の修飾名: `.start.` (最上位) / `Idle..start.Idle` / `Active.CONC2..start.CONC2`。
  // `state end3 <<end>>` のように名前の付いた終了は、ここでは開始・終了ではなく状態として扱う。
  function pseudoOf(qn, cls) {
    var m = /\.(start|end)\.(.*)$/.exec(_s(qn));
    if (m) {
      var scope = m[2];
      var head = _s(qn).slice(0, m.index).replace(/\.$/, '');
      // 並行領域の開始は、その複合状態の開始として読む。
      if (/^CONC\d+$/.test(scope)) scope = normalizeName(head);
      return { kind: m[1], scope: normalizeName(scope) };
    }
    if (!_s(qn) && /(start|end)_entity/.test(_s(cls))) return { kind: /start/.test(cls) ? 'start' : 'end', scope: '' };
    return null;
  }

  // ── 図形の外接矩形 (jsdom でも動くよう属性から) ─────────────────────────
  function shapeBox(el) {
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'rect') return { x: _num(el, 'x'), y: _num(el, 'y'), width: _num(el, 'width'), height: _num(el, 'height') };
    if (tag === 'ellipse' || tag === 'circle') {
      var rx = tag === 'circle' ? _num(el, 'r') : _num(el, 'rx');
      var ry = tag === 'circle' ? _num(el, 'r') : _num(el, 'ry');
      return { x: _num(el, 'cx') - rx, y: _num(el, 'cy') - ry, width: rx * 2, height: ry * 2 };
    }
    if (tag === 'path') {
      // 円弧 (smetana の複合状態の見出し) の半径・フラグを座標に混ぜないよう、コマンドを読む。
      var OB = window.MA.overlayBuilder;
      if (OB && OB.pathBox) return OB.pathBox(el.getAttribute('d'));
    }
    if (tag === 'polygon' || tag === 'polyline' || tag === 'path') {
      var src = tag === 'path' ? el.getAttribute('d') : el.getAttribute('points');
      var nums = (_s(src).match(/-?\d+(?:\.\d+)?/g) || []).map(parseFloat);
      if (nums.length < 2) return null;
      var xs = [], ys = [];
      for (var i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
      var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
      return { x: x0, y: y0, width: Math.max.apply(null, xs) - x0, height: Math.max.apply(null, ys) - y0 };
    }
    if (tag === 'text') {
      var fs = _num(el, 'font-size') || 14;
      var w = _num(el, 'textLength') || _s(el.textContent).length * fs * 0.6;
      return { x: _num(el, 'x'), y: _num(el, 'y') - fs, width: w, height: fs * 1.25 };
    }
    return null;
  }

  function union(boxes) {
    var bs = boxes.filter(function(b) { return b; });
    if (!bs.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    bs.forEach(function(b) {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    });
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function pad(b, p) {
    return b ? { x: b.x - p, y: b.y - p, width: b.width + 2 * p, height: b.height + 2 * p } : null;
  }

  function _inside(pt, b, tol) {
    return pt && b && pt.x >= b.x - tol && pt.x <= b.x + b.width + tol && pt.y >= b.y - tol && pt.y <= b.y + b.height + tol;
  }

  // 実体の枠: 状態の角丸矩形があればそれ (本体)、無ければ図形の和集合 (choice の菱形・終了の丸)。
  function _entityBox(g) {
    var rect = g.querySelector('rect');
    if (rect) return shapeBox(rect);
    var shapes = Array.prototype.map.call(g.querySelectorAll('polygon, ellipse, circle, path'), shapeBox);
    return pad(union(shapes), 2);
  }

  // ── 遷移の線の両端と、その端の名前 ───────────────────────────────────
  function _pathEnds(g) {
    var p = g.querySelector('path');
    if (!p) return null;
    var nums = (_s(p.getAttribute('d')).match(/-?\d+(?:\.\d+)?/g) || []).map(parseFloat);
    if (nums.length < 4) return null;
    return { a: { x: nums[0], y: nums[1] }, b: { x: nums[nums.length - 2], y: nums[nums.length - 1] } };
  }

  var LINK_COMMENT_RE = /^\s*link\s+(.+?)\s+to\s+(.+?)\s*$/;
  function _commentNames(node) {
    var m = LINK_COMMENT_RE.exec(_s(node && node.nodeValue));
    return m ? { a: m[1], b: m[2] } : null;
  }

  // 各 <g class="link"> の両端の名前。直前の `<!--link A to B-->` を優先し、
  // 無ければ同じ数だけあるコメントを順に当てる。
  function linkNames(svgEl, links) {
    var out = links.map(function(g) {
      var n = g.previousSibling;
      while (n && n.nodeType === 3 && !_s(n.nodeValue).trim()) n = n.previousSibling;
      return n && n.nodeType === 8 ? _commentNames(n) : null;
    });
    if (out.every(function(x) { return x; })) return out;
    var all = [];
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 8) { var cn = _commentNames(c); if (cn) all.push(cn); }
        else if (c.nodeType === 1) walk(c);
      }
    })(svgEl);
    if (all.length === links.length) return all;
    return out;
  }

  // ── DSL 側で「選んだらどの行を開くか」を引く ──────────────────────────
  function _findState(parsed, name) {
    var states = (parsed && parsed.states) || [];
    for (var i = 0; i < states.length; i++) if (states[i].id === name) return states[i];
    var short = shortName(name), hit = null;
    for (var j = 0; j < states.length; j++) {
      if (shortName(states[j].id) === short) { if (hit) return null; hit = states[j]; }
    }
    return hit;
  }

  function _bareEnd(v) { return shortName(_s(v).replace(/\[H\*?\]$/, '')); }

  // 宣言の無い状態 (遷移にだけ出てくる) は、最初に出てくる遷移の行。
  function resolveState(parsed, qn) {
    var name = normalizeName(qn);
    var st = _findState(parsed, name);
    if (st) return { id: st.id, line: st.line, declared: true };
    var short = shortName(name), line = null;
    ((parsed && parsed.transitions) || []).forEach(function(tr) {
      if (_bareEnd(tr.from) === short || _bareEnd(tr.to) === short) {
        if (line === null || tr.line < line) line = tr.line;
      }
    });
    return { id: name, line: line, declared: false };
  }

  function _classOf(g) { return _s(g.getAttribute('class')); }

  // 名前の付いた <g> (entity / cluster / link / title …) の外に直に置かれた図形か。
  function _isOrphan(el) {
    for (var n = el.parentNode; n && n.getAttribute; n = n.parentNode) {
      if ((n.tagName || '').toLowerCase() === 'svg') return true;
      if ((n.tagName || '').toLowerCase() === 'g' && _classOf(n)) return false;
    }
    return true;
  }

  // 遷移の data-source-line は 0 始まり。念のため DSL の遷移行と最も多く合うずれを選ぶ。
  function _lineOffset(links, parsed) {
    var lines = {};
    ((parsed && parsed.transitions) || []).forEach(function(tr) { lines[tr.line] = true; });
    var best = 1, bestN = -1;
    [1, 0, 2].forEach(function(off) {
      var n = 0;
      links.forEach(function(g) {
        var sl = parseInt(g.getAttribute('data-source-line'), 10);
        if (!isNaN(sl) && lines[sl + off]) n++;
      });
      if (n > bestN) { bestN = n; best = off; }
    });
    return best;
  }

  // 枠の一覧を返す。各要素 { type, id, line, box | link, composite }。
  //   type: 'state' | 'pseudo' | 'transition'
  // linksReady: 遷移の <g class="link"> が全部 data-source-line を持っていたか (持たない SVG は呼び手が旧来の当て方に落とす)。
  function collect(svgEl, parsed) {
    var frames = [];
    if (!svgEl) return { frames: frames, linksReady: false };
    var seenState = {};

    // 1. 名前の付いた実体
    Array.prototype.forEach.call(svgEl.querySelectorAll('g[data-qualified-name]'), function(g) {
      var cls = _classOf(g);
      var qn = g.getAttribute('data-qualified-name') || '';
      var isCluster = /(^|\s)cluster(\s|$)/.test(cls);
      if (!isCluster && !/(^|\s)(entity|start_entity|end_entity)(\s|$)/.test(cls)) return;
      if (/^GMN/.test(qn)) return;   // 注記は呼び手が別に当てる
      var ps = isCluster ? null : pseudoOf(qn, cls);
      if (ps) {
        var ells = Array.prototype.map.call(g.querySelectorAll('ellipse, circle'), shapeBox);
        var pb = union(ells);
        if (!pb) return;
        var sl = parseInt(g.getAttribute('data-source-line'), 10);
        frames.push({ type: 'pseudo', id: ps.kind + '@' + ps.scope, line: isNaN(sl) ? null : sl + 1, box: pad(pb, 3) });
        return;
      }
      var r = resolveState(parsed, qn);
      var box;
      if (isCluster) {
        box = union(Array.prototype.map.call(g.querySelectorAll('rect, path'), shapeBox));
      } else {
        box = _entityBox(g);
      }
      if (!box) return;
      seenState[r.id] = true;
      frames.push({ type: 'state', id: r.id, line: r.line, box: box, composite: isCluster, declared: r.declared });
    });

    // 2. 遷移
    var links = Array.prototype.slice.call(svgEl.querySelectorAll('g.link'));
    var linksReady = links.length > 0 && links.every(function(g) { return g.hasAttribute('data-source-line'); });
    var names = linkNames(svgEl, links);
    if (linksReady) {
      var off = _lineOffset(links, parsed);
      var trs = (parsed && parsed.transitions) || [];
      links.forEach(function(g) {
        var line = parseInt(g.getAttribute('data-source-line'), 10) + off;
        var tr = null;
        for (var i = 0; i < trs.length; i++) if (trs[i].line === line) { tr = trs[i]; break; }
        if (!tr) return;
        frames.push({ type: 'transition', id: tr.id, line: line, link: g });
      });
    }

    // 3. 名前の付いた <g> を持たない図形 (fork / join の棒、入口・出口の丸)
    var orphanShapes = Array.prototype.filter.call(svgEl.querySelectorAll('rect, ellipse, circle, polygon'), function(el) {
      if (!_isOrphan(el)) return false;
      var fill = _s(el.getAttribute('fill')).toLowerCase();
      if ((el.tagName || '').toLowerCase() === 'rect' && (fill === 'none' || fill === '')) return false;   // 複合状態の外枠
      return true;
    });
    var byName = {};
    var order = [];
    orphanShapes.forEach(function(el) {
      var b = shapeBox(el);
      if (!b) return;
      var hit = null;
      links.forEach(function(g, i) {
        if (hit || !names[i]) return;
        var ends = _pathEnds(g);
        if (!ends) return;
        if (_inside(ends.a, b, 6) && !/^\*/.test(names[i].a)) hit = names[i].a;
        else if (_inside(ends.b, b, 6) && !/^\*/.test(names[i].b)) hit = names[i].b;
      });
      // 行き先の側は線が矢じりの手前で切れる (出口・履歴・pin の小さな丸や四角では 6px より離れる)。
      // 線の終わりに付いた矢じりがその図形に触れていれば、行き先の名前にする。
      if (!hit) {
        links.forEach(function(g, i) {
          if (hit || !names[i] || /^\*/.test(names[i].b)) return;
          var ends = _pathEnds(g);
          if (!ends) return;
          Array.prototype.forEach.call(g.querySelectorAll('polygon'), function(pg) {
            var hb = shapeBox(pg);
            if (hit || !hb || !_inside({ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, pad(b, 0), 14)) return;
            if (_inside(ends.b, hb, 14)) hit = names[i].b;
          });
        });
      }
      // どの遷移にもつながらない pin (`state x <<inputPin>>`) は、すぐ脇に書かれた名前の文字で名前にする。
      // 名前は DSL に宣言のある状態だけ (履歴の「H」のような記号は拾わない)。
      if (!hit) {
        var near = pad(b, 14), bestD = Infinity;
        Array.prototype.forEach.call(svgEl.querySelectorAll('text'), function(t) {
          if (!_isOrphan(t)) return;
          var name = _s(t.textContent).trim();
          if (!name || !_findState(parsed, name)) return;
          var tb = shapeBox(t);
          if (!tb || tb.x > near.x + near.width || tb.x + tb.width < near.x || tb.y > near.y + near.height || tb.y + tb.height < near.y) return;
          var d = Math.abs(tb.x + tb.width / 2 - (b.x + b.width / 2)) + Math.abs(tb.y + tb.height / 2 - (b.y + b.height / 2));
          if (d < bestD) { bestD = d; hit = name; }
        });
      }
      if (!hit) return;
      if (!byName[hit]) { byName[hit] = []; order.push(hit); }
      byName[hit].push(b);
    });
    var orphanTexts = Array.prototype.filter.call(svgEl.querySelectorAll('text'), _isOrphan);
    order.forEach(function(name) {
      var r = resolveState(parsed, name);
      if (seenState[r.id]) return;
      var boxes = byName[name].slice();
      orphanTexts.forEach(function(t) { if (_s(t.textContent).trim() === name) boxes.push(shapeBox(t)); });
      seenState[r.id] = true;
      frames.push({ type: 'state', id: r.id, line: r.line, box: pad(union(boxes), 2), composite: false, declared: r.declared });
    });

    // 並びは 状態 → 遷移 → 開始・終了、それぞれ DSL の行の順 (SVG の描画順は配置で入れ替わるので使わない)。
    var rank = { state: 0, transition: 1, pseudo: 2 };
    frames.forEach(function(f, i) { f._i = i; });
    frames.sort(function(a, b) {
      if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type];
      var la = a.line == null ? Infinity : a.line, lb = b.line == null ? Infinity : b.line;
      return la !== lb ? la - lb : a._i - b._i;
    });
    frames.forEach(function(f) { delete f._i; });
    return { frames: frames, linksReady: linksReady };
  }

  return {
    normalizeName: normalizeName,
    shortName: shortName,
    pseudoOf: pseudoOf,
    shapeBox: shapeBox,
    linkNames: linkNames,
    resolveState: resolveState,
    collect: collect,
  };
})();
