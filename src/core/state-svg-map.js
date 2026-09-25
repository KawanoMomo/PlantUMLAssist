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

  // BLK-human-20260925-1500: PlantUML 1.2026.7 からは複合状態も <g class="entity" data-qualified-name> になり、
  // 中の状態・遷移・fork の棒をその <g> の中に入れて描く (1.2026.6 までは名前の無い <g> と外枠の rect)。
  // 中に名前の付いた <g> を持つ entity を複合状態と見る。
  function _isComposite(g) {
    if (!/(^|\s)entity(\s|$)/.test(_classOf(g))) return false;
    var inner = g.querySelectorAll('g');
    for (var i = 0; i < inner.length; i++) if (_classOf(inner[i])) return true;
    return false;
  }
  function _ownShapes(g, sel) {
    return Array.prototype.filter.call(g.children || [], function(c) {
      return sel.indexOf((c.tagName || '').toLowerCase()) >= 0;
    });
  }

  // 名前の付いた <g> (entity / cluster / link / title …) の外に直に置かれた図形か。
  // 複合状態の <g> は入れ物なので、その中に直に置かれた図形 (fork の棒など) も名前の無い図形として扱う。
  function _isOrphan(el) {
    for (var n = el.parentNode; n && n.getAttribute; n = n.parentNode) {
      if ((n.tagName || '').toLowerCase() === 'svg') return true;
      if ((n.tagName || '').toLowerCase() === 'g' && _classOf(n) && !_isComposite(n)) return false;
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

  // 名前の無い図形の種類。履歴の丸 (中に「H」/「H*」の文字)、fork / join の棒 (塗りのある細長い矩形)。
  // それ以外 (入口・出口・pin は脇に名前の文字がある) は null。
  function _glyphKind(el, b, texts) {
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'ellipse' || tag === 'circle') {
      for (var i = 0; i < texts.length; i++) {
        var s = _s(texts[i].t.textContent).trim();
        if (s !== 'H' && s !== 'H*') continue;
        var tb = texts[i].b;
        if (tb && _inside({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }, b, 2)) {
          return { kind: s === 'H' ? 'history' : 'history*', text: tb };
        }
      }
      return null;
    }
    if (tag === 'rect' && b.width > 0 && b.height > 0 && (b.width >= 6 * b.height || b.height >= 6 * b.width)) {
      return { kind: 'bar', text: null };
    }
    return null;
  }
  function _isHistoryKind(g) { return !!(g && (g.kind === 'history' || g.kind === 'history*')); }

  // 宣言の側の種類 (_glyphKind と同じ語)。
  function _declKind(st) {
    var k = _s(st.stereotype).toLowerCase();
    if (k === 'history') return 'history';
    if (k === 'history*') return 'history*';
    if (k === 'fork' || k === 'join') return 'bar';
    return null;
  }

  // 遷移の線の端か矢じりが触れている図形か。触れていれば { from: 始点が触れる, to: 終点 (か矢じり) が触れる }。
  function _linkTouch(g, b) {
    var ends = _pathEnds(g);
    if (!ends) return null;
    var from = _inside(ends.a, b, 6), to = _inside(ends.b, b, 6);
    if (!to) {
      to = Array.prototype.some.call(g.querySelectorAll('polygon'), function(pg) {
        var hb = shapeBox(pg);
        return hb && _inside({ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, b, 14) && _inside(ends.b, hb, 14);
      });
    }
    return from || to ? { from: from, to: to } : null;
  }
  function _touchedByLink(b, links) {
    return links.some(function(g) { return !!_linkTouch(g, b); });
  }

  // 図形の入れ物: その中心を含む複合状態の枠のうち最も小さいもの (最上位は '')。
  function _scopeFinder(frames) {
    var comps = frames.filter(function(f) { return f.type === 'state' && f.composite && f.box; });
    return function(b) {
      var c = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, best = null;
      comps.forEach(function(f) {
        if (!_inside(c, f.box, 0)) return;
        if (!best || f.box.width * f.box.height < best.box.width * best.box.height) best = f;
      });
      return best ? best.id : '';
    };
  }

  // 遷移の端からも脇の文字からも名前が引けない図形を、形 (種類) と入れ物の組で「まだ枠の無い宣言」に描いた順 = 宣言順で当てる。
  // glyphs: [{ kind, box, scope }]。数が合わない組は当てない (取り違えない)。
  function _frameByKindAndScope(glyphs, parsed, frames, seenState) {
    var byKey = {};
    glyphs.forEach(function(g) {
      var key = g.kind + '|' + g.scope;
      (byKey[key] = byKey[key] || []).push(g);
    });
    var decls = {};
    ((parsed && parsed.states) || []).forEach(function(st) {
      var k = _declKind(st);
      if (!k || seenState[st.id]) return;
      var key = k + '|' + _s(st.parentId);
      (decls[key] = decls[key] || []).push(st);
    });
    Object.keys(byKey).forEach(function(key) {
      var gs = byKey[key], ds = (decls[key] || []).slice().sort(function(a, c) { return a.line - c.line; });
      if (gs.length !== ds.length) return;
      gs.forEach(function(g, i) {
        seenState[ds[i].id] = true;
        frames.push({ type: 'state', id: ds[i].id, line: ds[i].line, box: pad(g.box, 2), composite: false, declared: true });
      });
    });
  }

  // fork / join の棒のうち、遷移の端からも名前が引けなかったもの (BLK-migrator-20260925-1932)。
  function _frameUnnamedBars(orphanShapes, byName, frames, seenState, links, texts, parsed) {
    var named = [];
    Object.keys(byName).forEach(function(k) { named = named.concat(byName[k]); });
    var sameBox = function(a, c) {
      return a && c && Math.abs(a.x - c.x) < 0.01 && Math.abs(a.y - c.y) < 0.01 && Math.abs(a.width - c.width) < 0.01 && Math.abs(a.height - c.height) < 0.01;
    };
    var scopeOf = _scopeFinder(frames);
    var glyphs = [];
    orphanShapes.forEach(function(el) {
      var b = shapeBox(el);
      if (!b || named.some(function(n) { return sameBox(n, b); })) return;
      if (_touchedByLink(b, links)) return;
      var g = _glyphKind(el, b, texts);
      if (!g || g.kind !== 'bar') return;
      glyphs.push({ kind: g.kind, box: b, scope: scopeOf(b) });
    });
    _frameByKindAndScope(glyphs, parsed, frames, seenState);
  }

  // 遷移の端に書いた履歴の書き方 `[H]` / `[H*]` / `Comp[H]` / `Comp[H*]` を { kind: 'history' | 'historyDeep', scope } に読む。
  // `[H]` は書かれた { } の中 (tr.scope)、`Comp[H]` は名指した Comp。履歴でない端は null。
  var HIST_END_RE = /\[H(\*?)\]$/;
  function historyEnd(end, tr, parsed) {
    var m = HIST_END_RE.exec(_s(end));
    if (!m) return null;
    var head = _s(end).slice(0, m.index);
    var scope = _s(tr && tr.scope);
    if (head) {
      var st = _findState(parsed, head);
      scope = st ? st.id : head;
    }
    return { kind: m[1] ? 'historyDeep' : 'history', scope: scope };
  }

  // BLK-migrator-20260926-0550: 履歴の丸と「H」/「H*」は、宣言の有無・遷移の有無・入れ物に依らずここ 1 か所で当てる。
  // PlantUML は履歴を名前の付いた <g> も名前の文字も無しに「H」/「H*」の丸で描く。丸ごとに次の順で持ち主を決める:
  //   (1) 丸に遷移の端 (線の端か矢じり) が触れていれば、その側の端の DSL の書き方で決める。
  //       `[H]` / `Comp[H*]` と書いた端 → 開始・終了と同じ 'pseudo' の枠 (id `history@Comp` / `historyDeep@`、行は最初に使う遷移)。
  //       `state DeepHist <<history*>>` の名前を書いた端 → その宣言の 'state' の枠 (行は宣言)。
  //       遷移の行が分からない古い SVG は `<!--link A to B-->` の名前で宣言だけを引く。
  //   (2) どの遷移も触れない丸 (宣言だけの履歴) は、形 (H / H*) と入れ物の組で、まだ枠の無い宣言に宣言順で当てる。
  function _frameHistories(orphanShapes, linkInfo, parsed, frames, seenState, texts) {
    var scopeOf = _scopeFinder(frames);
    var pseudo = {}, pseudoOrder = [], declared = {}, declOrder = [], loose = [];
    orphanShapes.forEach(function(el) {
      var b = shapeBox(el);
      if (!b) return;
      var g = _glyphKind(el, b, texts);
      if (!_isHistoryKind(g)) return;
      var box = union([b, g.text]);
      var wantEnd = g.kind === 'history' ? 'history' : 'historyDeep';
      var touched = false, hit = null, lines = [];
      linkInfo.forEach(function(li) {
        var t = _linkTouch(li.g, b);
        if (!t) return;
        touched = true;
        var sides = [];
        if (t.from) sides.push(li.tr ? li.tr.from : li.names && li.names.a);
        if (t.to) sides.push(li.tr ? li.tr.to : li.names && li.names.b);
        sides.forEach(function(end) {
          if (!end || /^\*/.test(end)) return;
          var h = li.tr ? historyEnd(end, li.tr, parsed) : null;
          if (h) {
            if (h.kind !== wantEnd) return;
            if (!hit) hit = { pseudo: h.kind + '@' + h.scope };
            if (hit.pseudo === h.kind + '@' + h.scope) lines.push(li.tr.line);
            return;
          }
          if (hit) return;
          var st = _findState(parsed, end);
          if (st && _declKind(st) === g.kind) hit = { state: st };
        });
      });
      if (hit && hit.pseudo) {
        if (!pseudo[hit.pseudo]) { pseudo[hit.pseudo] = { boxes: [], lines: [] }; pseudoOrder.push(hit.pseudo); }
        pseudo[hit.pseudo].boxes.push(box);
        pseudo[hit.pseudo].lines = pseudo[hit.pseudo].lines.concat(lines);
      } else if (hit && hit.state) {
        if (!declared[hit.state.id]) { declared[hit.state.id] = { st: hit.state, boxes: [] }; declOrder.push(hit.state.id); }
        declared[hit.state.id].boxes.push(box);
      } else if (!touched) {
        loose.push({ kind: g.kind, box: box, scope: scopeOf(b) });
      }
    });
    pseudoOrder.forEach(function(id) {
      var e = pseudo[id];
      frames.push({ type: 'pseudo', id: id, line: Math.min.apply(null, e.lines), box: pad(union(e.boxes), 3) });
    });
    declOrder.forEach(function(id) {
      var e = declared[id];
      if (seenState[id]) return;
      seenState[id] = true;
      frames.push({ type: 'state', id: id, line: e.st.line, box: pad(union(e.boxes), 2), composite: false, declared: true });
    });
    _frameByKindAndScope(loose, parsed, frames, seenState);
  }

  // 枠の一覧を返す。各要素 { type, id, line, box | link, composite }。
  //   type: 'state' | 'pseudo' | 'transition'
  // linksReady: 遷移の <g class="link"> が全部 data-source-line を持っていたか (持たない SVG は呼び手が旧来の当て方に落とす)。
  function collect(svgEl, parsed) {
    var frames = [];
    if (!svgEl) return { frames: frames, linksReady: false };
    var seenState = {};
    // 遷移の <g> と、data-source-line を DSL の行にするずれ (@startuml の前に行がある図でも開始・終了の行を合わせる)。
    var links = Array.prototype.slice.call(svgEl.querySelectorAll('g.link'));
    var off = _lineOffset(links, parsed);

    // 1. 名前の付いた実体
    Array.prototype.forEach.call(svgEl.querySelectorAll('g[data-qualified-name]'), function(g) {
      var cls = _classOf(g);
      var qn = g.getAttribute('data-qualified-name') || '';
      var isCluster = /(^|\s)cluster(\s|$)/.test(cls) || _isComposite(g);
      if (!isCluster && !/(^|\s)(entity|start_entity|end_entity)(\s|$)/.test(cls)) return;
      if (/^GMN/.test(qn)) return;   // 注記は呼び手が別に当てる
      var ps = isCluster ? null : pseudoOf(qn, cls);
      if (ps) {
        var ells = Array.prototype.map.call(g.querySelectorAll('ellipse, circle'), shapeBox);
        var pb = union(ells);
        if (!pb) return;
        var sl = parseInt(g.getAttribute('data-source-line'), 10);
        frames.push({ type: 'pseudo', id: ps.kind + '@' + ps.scope, line: isNaN(sl) ? null : sl + off, box: pad(pb, 3) });
        return;
      }
      var r = resolveState(parsed, qn);
      var box;
      if (isCluster) {
        // 入れ物自身の外枠と見出し (直の子) だけ。中の状態・遷移まで和集合に入れない。
        var own = /(^|\s)cluster(\s|$)/.test(cls) ? g.querySelectorAll('rect, path') : _ownShapes(g, ['rect', 'path']);
        box = union(Array.prototype.map.call(own, shapeBox));
      } else {
        box = _entityBox(g);
      }
      if (!box) return;
      seenState[r.id] = true;
      frames.push({ type: 'state', id: r.id, line: r.line, box: box, composite: isCluster, declared: r.declared });
    });

    // 2. 遷移
    var linksReady = links.length > 0 && links.every(function(g) { return g.hasAttribute('data-source-line'); });
    var names = linkNames(svgEl, links);
    var trOf = [];
    if (linksReady) {
      var trs = (parsed && parsed.transitions) || [];
      links.forEach(function(g) {
        var line = parseInt(g.getAttribute('data-source-line'), 10) + off;
        var tr = null;
        for (var i = 0; i < trs.length; i++) if (trs[i].line === line) { tr = trs[i]; break; }
        if (!tr) return;
        trOf[links.indexOf(g)] = tr;
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
    // 丸の中の「H」/「H*」を見分けるための、名前の付いた <g> の外の文字。
    var glyphTexts = Array.prototype.filter.call(svgEl.querySelectorAll('text'), _isOrphan).map(function(t) {
      return { t: t, b: shapeBox(t) };
    });
    var byName = {};
    var order = [];
    orphanShapes.forEach(function(el) {
      var b = shapeBox(el);
      if (!b) return;
      if (_isHistoryKind(_glyphKind(el, b, glyphTexts))) return;   // 履歴の丸は 5. で 1 か所で当てる
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

    // 4. BLK-migrator-20260925-1932: 名前の付かなかった fork / join の棒 (どの遷移にもつながらない)。
    // PlantUML は fork / join を名前の無い棒で描き、名前の文字を添えない。遷移の端からも脇の文字からも名前が引けないので、
    // 棒と入れ物 (どの複合状態の中か) の組で、同じ組の「まだ枠の無い宣言」に描いた順 = 宣言順で当てる。数が合わない組は当てない。
    _frameUnnamedBars(orphanShapes, byName, frames, seenState, links, glyphTexts, parsed);

    // 5. 履歴の丸と「H」/「H*」(宣言した履歴・遷移の端に書いた `[H]` / `Comp[H*]`・宣言だけの履歴のすべて)。
    var linkInfo = links.map(function(g, i) { return { g: g, tr: trOf[i] || null, names: names[i] || null }; });
    _frameHistories(orphanShapes, linkInfo, parsed, frames, seenState, glyphTexts);

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
    historyEnd: historyEnd,
    collect: collect,
  };
})();
