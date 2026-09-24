'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {

  var OB = window.MA.overlayBuilder;

  // PlantUML SVG の data-source-line と parser の lineNum (DSL 絶対行) の関係:
  //   parserLine = svgLine + offset
  // PlantUML のバージョン / preamble 種別で offset の挙動が異なる:
  //   - preamble なし (@startuml が line 1):    offset = 1 (= startUmlLine)
  //   - preamble が空白行のみ:                  offset = startUmlLine (推定/未検証)
  //   - preamble にコメント行 (' ...) を含む:   offset = 0 (PlantUML が絶対行を出す)
  //   - @startuml なし (snippet):               offset = 0
  // 単純な startUmlLine 利用では comment preamble case で破綻するため、
  // 候補オフセット {startUmlLine, 0, 1} を試して「最大マッチ数」を採るアダプティブ方式を取る。
  // (既存 fixture と回帰した過去版の両方を一発で吸収する。本物の SVG 1 つ取れば十分。)

  function _clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function _bbox(el) {
    if (!el || typeof el.getBBox !== 'function') return null;
    try {
      var b = el.getBBox();
      return (b && (b.width || b.height)) ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
    } catch (e) { return null; }
  }

  // BLK-migrator-20260923-1409: 左寄せ (skinparam NoteTextAlignment left など) の注釈は
  // 1 行を語ごとの <text> に分けて描く (`missing` ` ` `Accept-Version` …)。texts[i] から
  // 同じ高さに続く <text> をつないだものが 1 行目と一致するかを見る (空白は比べない)。
  function _lineStartsAt(texts, i, first) {
    var want = String(first).replace(/\s+/g, '');
    if (!want) return false;
    var y = texts[i].getAttribute('y');
    var got = '';
    for (var k = i; k < texts.length && got.length < want.length; k++) {
      if (texts[k].getAttribute('y') !== y) break;
      got += (texts[k].textContent || '').replace(/\s+/g, '');
      if (want.indexOf(got) !== 0) return false;
    }
    if (got !== want) return false;
    // 描かれた行がまだ続くなら別の (長い) 行
    for (; k < texts.length && texts[k].getAttribute('y') === y; k++) {
      if ((texts[k].textContent || '').replace(/\s+/g, '')) return false;
    }
    return true;
  }

  // 注釈本文の 1 行目を持つ <text> (未使用のもの) を探し、それを囲む塗りのある最小の図形を返す。
  // 群の枠 (alt 等) は fill="none" なので候補にならない。見つからなければ null。
  function _findNoteShape(svgEl, note, usedTexts) {
    var first = String(note.text || '').split('\n')[0].replace(/<[^>]*>|\*\*|\/\/|__|""/g, '').trim();
    if (!first || !svgEl.querySelectorAll) return null;
    var texts = svgEl.querySelectorAll('text');
    var shapes = null;
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (usedTexts.indexOf(t) >= 0) continue;
      if ((t.textContent || '').trim() !== first && !_lineStartsAt(texts, i, first)) continue;
      var tb = _bbox(t);
      if (!tb) continue;
      if (!shapes) shapes = svgEl.querySelectorAll('path, polygon, rect');
      var best = null, bestArea = Infinity;
      for (var k = 0; k < shapes.length; k++) {
        var fill = (shapes[k].getAttribute('fill') || '').toLowerCase();
        if (!fill || fill === 'none' || fill === 'transparent') continue;
        var sb = _bbox(shapes[k]);
        if (!sb) continue;
        if (sb.x > tb.x + 2 || sb.y > tb.y + 2 || sb.x + sb.width < tb.x + tb.width - 2 || sb.y + sb.height < tb.y + tb.height - 2) continue;
        var area = sb.width * sb.height;
        if (area < bestArea) { best = sb; bestArea = area; }
      }
      if (best) { usedTexts.push(t); return best; }
    }
    return null;
  }

  // 囲み (box) の rect を SVG から拾う。PlantUML は class を付けないので、
  // 「最初の participant-head より前に出る、塗りと細い枠を持つ rect」で見分ける
  // (ライフラインの帯は塗りだけで style を持たない)。描画順は DSL の box 順。
  function _boxRectsInSvg(svgEl) {
    if (!svgEl || !svgEl.querySelectorAll) return [];
    var all = svgEl.querySelectorAll('rect');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var p = r.parentNode;
      var cls = (p && p.getAttribute && p.getAttribute('class')) || '';
      // 参加者の頭・尻尾に入ったら、そこから先は囲みではない
      if (cls.indexOf('participant') !== -1) break;
      var style = r.getAttribute('style') || '';
      if (style.indexOf('stroke:') === -1) continue;
      var x = parseFloat(r.getAttribute('x'));
      var y = parseFloat(r.getAttribute('y'));
      var w = parseFloat(r.getAttribute('width'));
      var h = parseFloat(r.getAttribute('height'));
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) continue;
      out.push({ x: x, y: y, w: w, h: h });
    }
    return out;
  }

  // 参加者の頭の上端。囲みの見出しの帯は、囲みの上端からここまで。
  function _firstHeadTop(svgEl) {
    var heads = svgEl && svgEl.querySelectorAll ? svgEl.querySelectorAll('g.participant-head') : [];
    var top = NaN;
    Array.prototype.forEach.call(heads, function(g) {
      var bb = _bbox(g);
      if (!bb) return;
      if (isNaN(top) || bb.y < top) top = bb.y;
    });
    return top;
  }

  function _addBoxRects(svgEl, parsedData, overlayEl) {
    var boxes = (parsedData.boxes || []).slice();
    if (!boxes.length) return;
    var rects = _boxRectsInSvg(svgEl);
    var headTop = _firstHeadTop(svgEl);
    var n = Math.min(rects.length, boxes.length);
    for (var i = 0; i < n; i++) {
      var r = rects[i];
      var bandH = (!isNaN(headTop) && headTop > r.y) ? (headTop - r.y) : 20;
      OB.addRect(overlayEl, r.x, r.y, r.w, bandH, {
        'data-type': 'box',
        'data-id': boxes[i].id,
        'data-line': boxes[i].line,
      });
    }
    OB.warnIfMismatch('box', boxes.length, n);
  }

  // BLK-migrator-20260923-2012: 図の題名 (title)。PlantUML は SVG の <title> に題名を入れ、
  // 図の上端に class の無い <text> で描く。<title> に含まれる文字の <text> を、参加者・
  // メッセージより前 (document 順) から拾い、その和集合を枠にする。`!if` の枝ごとに
  // title 行があるときは、描かれた題名と同じ文字の行 (無ければ最後の行) に当てる。
  function _addTitleRect(svgEl, parsedData, overlayEl) {
    var tls = (parsedData.meta && parsedData.meta.titleLines) || [];
    if (!tls.length || !svgEl || !svgEl.querySelector) return;
    var tEl = svgEl.querySelector('title');
    var drawn = tEl ? String(tEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (!drawn) return;
    var pick = tls[tls.length - 1];
    for (var i = 0; i < tls.length; i++) {
      if (tls[i].text.replace(/\s+/g, ' ').trim() === drawn) { pick = tls[i]; break; }
    }
    var texts = svgEl.querySelectorAll('text');
    var minX = null, minY = null, maxX = null, maxY = null;
    for (var k = 0; k < texts.length; k++) {
      var t = texts[k];
      var anc = t.parentNode, classed = false;
      while (anc && anc !== svgEl && anc.getAttribute) {
        if (anc.getAttribute('class')) { classed = true; break; }
        anc = anc.parentNode;
      }
      // 参加者・メッセージ (class 付きの g) が出たら、そこから先は題名ではない
      if (classed) break;
      var s = String(t.textContent || '').replace(/\s+/g, ' ').trim();
      if (!s || drawn.indexOf(s) === -1) continue;
      var bb = OB.nodeBBox(t);
      if (!bb) continue;
      if (minX === null || bb.x < minX) minX = bb.x;
      if (minY === null || bb.y < minY) minY = bb.y;
      if (maxX === null || bb.x + bb.width > maxX) maxX = bb.x + bb.width;
      if (maxY === null || bb.y + bb.height > maxY) maxY = bb.y + bb.height;
    }
    if (minX === null) return;
    OB.addRect(overlayEl, minX - 4, minY - 3, (maxX - minX) + 8, (maxY - minY) + 6, {
      'data-type': 'title',
      'data-id': '__title',
      'data-line': pick.line,
    });
  }

  // BLK-migrator-20260923-2012 差し戻し: メッセージの当たり判定 (矢印とラベルの和集合の箱) の中で、
  // ライフラインの線の上にメッセージの文字・矢じり・線が無い高さを、ライフラインの手前の
  // 当たり判定にする。手前の分は .selectable を持たない (枠は元のライフラインの rect が
  // hover の仲間として出す) ので、ライフラインの rect の数・選択の見た目は変わらない。
  function _addLifelineFronts(overlayEl, msgMatches) {
    if (!overlayEl || !msgMatches || !msgMatches.length) return;
    var PAD = 2;
    var msgs = [];
    msgMatches.forEach(function(m) {
      var bb = OB.extractUnionBBox(m.groupEl) || null;
      if (!bb) return;
      var parts = [];
      Array.prototype.forEach.call(m.groupEl.querySelectorAll('text, polygon, polyline, line, path'), function(n) {
        var nb = OB.nodeBBox(n);
        if (nb) parts.push(nb);
      });
      // 当たり判定の箱は addRect と同じ余白 (4) を付けた範囲
      msgs.push({ x: bb.x - 4, y: bb.y - 4, w: bb.width + 8, h: bb.height + 8, parts: parts });
    });
    var lifelines = overlayEl.querySelectorAll('rect.selectable[data-type="lifeline"]');
    Array.prototype.forEach.call(lifelines, function(lr) {
      var lx = parseFloat(lr.getAttribute('x')), ly = parseFloat(lr.getAttribute('y'));
      var lw = parseFloat(lr.getAttribute('width')), lh = parseFloat(lr.getAttribute('height'));
      if (isNaN(lx) || isNaN(ly) || isNaN(lw) || isNaN(lh)) return;
      var cx = lx + lw / 2;
      msgs.forEach(function(mg) {
        if (mg.x > lx + lw || mg.x + mg.w < lx) return;
        var top = Math.max(mg.y, ly), bottom = Math.min(mg.y + mg.h, ly + lh);
        if (bottom - top < 2) return;
        // メッセージが自分で持つ高さ (線の真上に文字・矢じり・線がある所)
        var owned = [];
        mg.parts.forEach(function(p) {
          if (cx < p.x - PAD || cx > p.x + p.width + PAD) return;
          owned.push([p.y - PAD, p.y + p.height + PAD]);
        });
        owned.sort(function(a, b) { return a[0] - b[0]; });
        var cur = top;
        var pieces = [];
        owned.forEach(function(o) {
          if (o[0] > cur) pieces.push([cur, Math.min(o[0], bottom)]);
          if (o[1] > cur) cur = o[1];
        });
        if (cur < bottom) pieces.push([cur, bottom]);
        pieces.forEach(function(pc) {
          if (pc[1] - pc[0] < 2) return;
          var r = OB.addRect(overlayEl, lx, pc[0], lw, pc[1] - pc[0], {
            'data-type': 'lifeline',
            'data-id': lr.getAttribute('data-id'),
            'data-line': lr.getAttribute('data-line'),
            'data-front': '1',
          });
          r.classList.remove('selectable');
        });
      });
    });
  }

  // BLK-migrator-20260924-1132: `!include` した手続き (C4_Sequence など) で描いた図は、参加者の頭も
  // メッセージも class の無い <rect>/<text>/<line>/<polygon> で出る。手続きの名前は覚えず、描かれた物から当てる:
  // 参加者 = 表示名と同じ文字の <text> を囲む小さい <rect>、メッセージ = 矢じり (<polygon>) の付いた横線を上から順に。
  function _num(el, a) { return parseFloat(el.getAttribute(a)); }
  function _bareShapes(svgEl, sel) {
    return Array.prototype.filter.call(svgEl.querySelectorAll(sel), function(n) {
      var anc = n.parentNode;
      while (anc && anc !== svgEl && anc.getAttribute) {
        if (anc.getAttribute('class')) return false;
        anc = anc.parentNode;
      }
      return true;
    });
  }
  function _procParticipants(svgEl, participants) {
    var texts = _bareShapes(svgEl, 'text');
    var rects = _bareShapes(svgEl, 'rect').filter(function(r) {
      var h = _num(r, 'height'), w = _num(r, 'width');
      return !isNaN(h) && !isNaN(w) && h > 10 && h < 120 && w > 10 && r.getAttribute('fill') !== 'none';
    });
    var out = [];
    participants.forEach(function(p) {
      var label = String(p.label || '').trim();
      if (!label) return;
      texts.forEach(function(t) {
        if (String(t.textContent || '').trim() !== label) return;
        var tx = _num(t, 'x'), ty = _num(t, 'y');
        if (isNaN(tx) || isNaN(ty)) return;
        var best = null;
        rects.forEach(function(r) {
          var x = _num(r, 'x'), y = _num(r, 'y'), w = _num(r, 'width'), h = _num(r, 'height');
          if (tx < x - 1 || tx > x + w || ty < y || ty > y + h) return;
          if (!best || w * h < best.w * best.h) best = { x: x, y: y, w: w, h: h };
        });
        if (!best) {
          // 囲み (`*_Boundary(…)`) は塗りの無い大きな枠で描かれ、表示名は枠の上端に出る。
          // 枠全体は覆わず (中の参加者を押せなくなる)、表示名の帯だけを当てる。
          _bareShapes(svgEl, 'rect[fill="none"]').forEach(function(r) {
            var x = _num(r, 'x'), y = _num(r, 'y'), w = _num(r, 'width'), h = _num(r, 'height');
            if (isNaN(h) || tx < x || tx > x + w || ty < y || ty > y + 40) return;
            if (!best || w * h < best.w * best.h) best = { x: x, y: y, w: w, h: Math.min(h, ty - y + 6) };
          });
        }
        if (best) out.push({ item: p, box: best });
      });
    });
    return out;
  }
  function _procMessages(svgEl, relations, floorY) {
    var polys = _bareShapes(svgEl, 'polygon');
    var lines = _bareShapes(svgEl, 'line').filter(function(l) {
      var y1 = _num(l, 'y1'), y2 = _num(l, 'y2'), x1 = _num(l, 'x1'), x2 = _num(l, 'x2');
      if (isNaN(y1) || y1 !== y2 || Math.abs(x2 - x1) < 10) return false;
      if (/dasharray/.test(l.getAttribute('style') || '')) return false;
      // 矢じりが線の端に付いているものだけ (枠・凡例の線を拾わない)
      return polys.some(function(pg) {
        var pts = String(pg.getAttribute('points') || '').split(/[\s,]+/).map(parseFloat);
        for (var i = 0; i + 1 < pts.length; i += 2) {
          if (Math.abs(pts[i + 1] - y1) <= 6 && (Math.abs(pts[i] - x1) <= 12 || Math.abs(pts[i] - x2) <= 12)) return true;
        }
        return false;
      });
    }).sort(function(a, b) { return _num(a, 'y1') - _num(b, 'y1'); });
    var rels = relations.slice().sort(function(a, b) { return (a.line || 0) - (b.line || 0); });
    if (!lines.length || lines.length !== rels.length) return [];
    var texts = _bareShapes(svgEl, 'text');
    // 最初のメッセージの文字は参加者の頭より下にしか無い (頭の表示名をメッセージに含めない)。
    var prevY = typeof floorY === 'number' && isFinite(floorY) ? floorY - 4 : -Infinity;
    return lines.map(function(l, i) {
      var y = _num(l, 'y1');
      var x1 = Math.min(_num(l, 'x1'), _num(l, 'x2')), x2 = Math.max(_num(l, 'x1'), _num(l, 'x2'));
      var top = y - 6, left = x1, right = x2;
      texts.forEach(function(t) {
        var tx = _num(t, 'x'), ty = _num(t, 'y');
        if (isNaN(tx) || isNaN(ty) || ty > y || ty <= prevY + 4) return;
        if (tx < x1 - 20 || tx > x2 + 20) return;
        var tl = parseFloat(t.getAttribute('textLength')) || 0;
        top = Math.min(top, ty - 13);
        left = Math.min(left, tx);
        right = Math.max(right, tx + tl);
      });
      prevY = y;
      return { item: rels[i], box: { x: left, y: top, w: right - left, h: y + 6 - top } };
    });
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl, dslText) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;

    OB.syncDimensions(svgEl, overlayEl);

    // offset 候補: startUmlLine が真値の場合は最優先 (no/blank preamble に対応)、
    // 0 は comment preamble / snippet 用、1 は startUmlLine 不明時 default。
    // 重複は順序維持で去る。
    var startUml = (parsedData.meta && parsedData.meta.startUmlLine) || 0;
    var candidates = [];
    function _push(v) { if (candidates.indexOf(v) === -1) candidates.push(v); }
    if (startUml > 0) _push(startUml);
    _push(0);
    _push(1);

    var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });

    // BLK-migrator-20260923-1307: `box "…" #色` … `end box` の囲み。
    // PlantUML は囲みを、参加者より先に描く「塗りと細い枠を持つ rect」で出す
    // (class は付かない)。参加者の頭より上に出る見出しの帯だけを枠にして、
    // 見出しにホバーするとその囲みを指すようにする。囲み全体を覆うと、図の中の
    // 余白を押しただけで囲みが選ばれてしまう。
    // 参加者より先に足すので、参加者・メッセージの枠が手前に重なる。
    _addBoxRects(svgEl, parsedData, overlayEl);
    _addTitleRect(svgEl, parsedData, overlayEl);

    // BLK-migrator-20260923-1409: 参加者は PlantUML が <g> に残した名前
    // (data-qualified-name) で当てる。全員が名前で当たるときだけ採り、
    // 当たらない参加者が 1 人でもいれば今までの行/順番の当て方に落ちる。
    function _matchParts(selector) {
      var byName = OB.matchByEntityName(svgEl, participants, selector);
      if (byName.length === participants.length && participants.length > 0) return byName;
      // 名前を持つ図で一部しか当たらないときも、当たった人は名前で当てる。
      // 順番で当てると、パーサの知らない宣言が 1 つあるだけで以後の全員が 1 人ずつずれる
      // (枠が出ないより、別人の枠が出るほうが直しにくい)。
      if (byName.length > 0) return byName;
      return OB.pickBestOffset(svgEl, participants, selector, candidates).matches;
    }
    // 枠は描かれた箱 (塗りのある図形) に合わせる。複数行の表示名でも高さが合う。
    // BLK-migrator-20260923-2012: actor / boundary / control / entity / database / queue …
    // は名前が図形の外 (下や上) に出るので、図形と名前の和集合で囲む。
    function _partBox(groupEl) {
      return OB.extractFigureBBox(groupEl) || OB.extractBBox(groupEl);
    }

    var partMatches = _matchParts('g.participant-head');
    if (!partMatches.length && participants.length && !svgEl.querySelector('g.participant-head')) {
      partMatches = _procParticipants(svgEl, participants);
      partMatches.forEach(function(m) {
        OB.addRect(overlayEl, m.box.x - 4, m.box.y - 4, m.box.w + 8, m.box.h + 8, {
          'data-type': 'participant', 'data-id': m.item.id, 'data-line': m.item.line,
        });
      });
      // 数は「当たった参加者の人数」で数える (頭と尻の 2 か所に出る図でも 1 人)
      var seenP = {};
      partMatches = partMatches.filter(function(m) { if (seenP[m.item.id]) return false; seenP[m.item.id] = 1; return true; });
    }
    partMatches.forEach(function(m) {
      var bb = _partBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });
    // Bug C6 fix: PlantUML は participant を上下 (head/tail) 両方に描く。
    // tail もクリックで選択できるよう overlay rect を追加配置。
    // (data-id は head と同一なので selection は head/tail 共通で動作。)
    _matchParts('g.participant-tail').forEach(function(m) {
      var bb = _partBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    // userissue v1.2.3: lifeline は participant とは別の selectable type に分離。
    // lifeline 選択 → activate/deactivate 行を一括削除する独自オペレーションを
    // 持たせるため、 head/tail と highlight を分けるべく data-type='lifeline' で
    // emit する。 ID は対応 participant と同じなので scoped operation の引数に
    // そのまま使える。
    var lifelines = svgEl.querySelectorAll('g.participant-lifeline');
    Array.prototype.forEach.call(lifelines, function(lg) {
      // BLK-migrator-20260923-2012: 遅延 (`...`) や間隔 (`|||`) があると、PlantUML は
      // ライフラインを区間ごとの <line> に分けて描く。最初の 1 本だけを見ると、
      // 最初の区間より下のライフラインに枠が出ない。全区間の上端〜下端で囲む。
      var segs = lg.querySelectorAll('line');
      if (!segs.length) return;
      var x1 = NaN, x2 = NaN, y1 = NaN, y2 = NaN;
      Array.prototype.forEach.call(segs, function(sg) {
        var a1 = parseFloat(sg.getAttribute('x1')), a2 = parseFloat(sg.getAttribute('x2'));
        var b1 = parseFloat(sg.getAttribute('y1')), b2 = parseFloat(sg.getAttribute('y2'));
        if (isNaN(a1) || isNaN(a2) || isNaN(b1) || isNaN(b2)) return;
        if (isNaN(x1)) { x1 = a1; x2 = a2; }
        var top = Math.min(b1, b2), bottom = Math.max(b1, b2);
        if (isNaN(y1) || top < y1) y1 = top;
        if (isNaN(y2) || bottom > y2) y2 = bottom;
      });
      if (isNaN(x1) || isNaN(x2) || isNaN(y1) || isNaN(y2)) return;
      // BLK-migrator-20260923-1409: ライフラインも PlantUML の名前で当てる。
      // 頭の枠の x 範囲で当てていたため、表示名が複数行で枠がずれると
      // 隣の参加者のライフラインを掴み、別人の枠が出ていた。
      var id = null, lineNum = null;
      var lgName = lg.getAttribute && lg.getAttribute('data-qualified-name');
      if (lgName) {
        for (var pi = 0; pi < participants.length; pi++) {
          if (participants[pi].id === lgName) {
            id = participants[pi].id;
            lineNum = participants[pi].line;
            break;
          }
        }
      }
      if (id === null) {
        var cx = (x1 + x2) / 2;
        var matched = null;
        var headRects = overlayEl.querySelectorAll('rect[data-type="participant"]');
        Array.prototype.forEach.call(headRects, function(r) {
          if (matched) return;
          var rx = parseFloat(r.getAttribute('x'));
          var rw = parseFloat(r.getAttribute('width'));
          if (cx >= rx && cx <= rx + rw) matched = r;
        });
        if (!matched) return;
        id = matched.getAttribute('data-id');
        lineNum = matched.getAttribute('data-line');
      }
      OB.addRect(overlayEl,
        Math.min(x1, x2) - 6, Math.min(y1, y2),
        12, Math.abs(y2 - y1),
        { 'data-type': 'lifeline', 'data-id': id, 'data-line': lineNum });
    });

    // Feature #8: group block (alt/opt/loop/par/break/critical/group) の overlay rect。
    // PlantUML v1.2026.x の SVG は group 用の class を付けないが、block bbox を
    // <rect fill="none" stroke="#000000"> として描画する (同一 bbox が 2 回出る)。
    // 同一座標を de-dup して document 順に並べ、parsedData.groups と 1:1 対応させる。
    var groups = (parsedData.groups || []).slice().sort(function(a, b) {
      return (a.line || 0) - (b.line || 0);
    });
    if (groups.length > 0) {
      var allRects = svgEl.querySelectorAll('rect[fill="none"]');
      var seen = {};
      var bboxes = [];
      Array.prototype.forEach.call(allRects, function(r) {
        var style = (r.getAttribute('style') || '') + '';
        // group 境界 rect は枠線を持つ。lifeline の hit-area rect (fill-opacity:0) は除外。
        // BLK-migrator-20260923-1409: 枠線の色はテーマ (skinparam / strictuml) で変わる
        // (AWS の図では #7D8998)。黒に限ると枠が 1 つも拾えない。
        if (!/stroke:\s*#/.test(style)) return;
        if (r.getAttribute('fill-opacity') === '0' || parseFloat(r.getAttribute('fill-opacity')) === 0) return;
        var anc = r.parentNode;
        var inPart = false;
        while (anc && anc !== svgEl && anc.getAttribute) {
          if (/participant/.test(anc.getAttribute('class') || '')) { inPart = true; break; }
          anc = anc.parentNode;
        }
        if (inPart) return;
        var x = parseFloat(r.getAttribute('x'));
        var y = parseFloat(r.getAttribute('y'));
        var w = parseFloat(r.getAttribute('width'));
        var h = parseFloat(r.getAttribute('height'));
        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;
        var key = x + ',' + y + ',' + w + ',' + h;
        if (seen[key]) return;
        seen[key] = true;
        bboxes.push({ x: x, y: y, w: w, h: h });
      });
      // document 順 (= 上から下 = DSL 順) にすでに並んでいるので y で再 sort して安定化。
      bboxes.sort(function(a, b) { return a.y - b.y; });
      // BLK-migrator-20260923-2012: `ref over A, B` も PlantUML は同じ「塗りなし・枠線あり」の
      // rect で描く。群だけを数えて順に当てると、ref より後の群が 1 つずつずれ、alt を選ぶと
      // ref の枠が出ていた。ref も並びに入れて上から順に当て、枠は群にだけ出す。
      var frames = groups.map(function(g) { return { group: g, line: g.line || 0 }; });
      String(dslText || '').split('\n').forEach(function(raw, i) {
        if (/^\s*ref\s+over\b/i.test(raw)) frames.push({ group: null, line: i + 1 });
      });
      frames.sort(function(a, b) { return a.line - b.line; });
      var n = Math.min(bboxes.length, frames.length);
      var emitted = 0;
      for (var gi = 0; gi < n; gi++) {
        var bb = bboxes[gi];
        var gp = frames[gi].group;
        if (!gp) continue;
        emitted++;
        OB.addRect(overlayEl, bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4, {
          'data-type': 'group',
          'data-id': gp.id,
          'data-line': gp.line,
        });
      }
      OB.warnIfMismatch('group', groups.length, emitted);
    }
    // BLK-migrator-20260923-1409: 群の枠は内側全体を覆うので、先に置いたライフラインが
    // その下に隠れ、alt の中のライフラインを指すと alt が選ばれていた。細いライフラインを
    // 群の枠より手前に出す (メッセージ・注釈はこの後に足すので、さらに手前に来る)。
    Array.prototype.forEach.call(overlayEl.querySelectorAll('rect[data-type="lifeline"]'), function(r) {
      overlayEl.appendChild(r);
    });

    // BLK-migrator-20260923-1409: `return` 行も PlantUML は矢印 (g.message) を 1 本描く。
    // 順番で当てるとき return を数えないと、それ以後のメッセージの枠が 1 本ずつずれる。
    // return は並びを合わせるためだけに入れ、枠は出さない (編集対象のメッセージではない)。
    var msgItems = parsedData.relations.concat(parsedData.returns || []).sort(function(a, b) {
      return (a.line || 0) - (b.line || 0);
    });
    var msgBest = OB.pickBestOffset(svgEl, msgItems, 'g.message', candidates);
    var msgMatches = msgBest.matches.filter(function(m) { return m.item.kind !== 'return'; });
    var procMsgs = [];
    if (!msgMatches.length && parsedData.relations.length && !svgEl.querySelector('g.message')) {
      var headFloor = -Infinity;
      partMatches.forEach(function(m) { if (m.box) headFloor = Math.max(headFloor, m.box.y + m.box.h); });
      procMsgs = _procMessages(svgEl, parsedData.relations, headFloor);
      procMsgs.forEach(function(m) {
        OB.addRect(overlayEl, m.box.x - 4, m.box.y - 4, m.box.w + 8, m.box.h + 8, {
          'data-type': 'message', 'data-id': m.item.id, 'data-line': m.item.line,
        });
      });
    }
    msgMatches.forEach(function(m) {
      // BLK-human-20260912-0900: 矢印・ラベル・番号 (autonumber)・ステレオタイプの
      // どこを押しても同じメッセージが選ばれるよう、g.message の子要素全部を覆う。
      // 最初の <text> だけを見る extractBBox では、autonumber なら番号の上、
      // ステレオタイプ付きならステレオタイプの上しか反応しなかった。
      var bb = OB.extractUnionBBox(m.groupEl) || OB.extractBBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 4, bb.y - 4, (bb.width || 60) + 8, (bb.height || 14) + 8, {
        'data-type': 'message',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    // BLK-migrator-20260923-2012 差し戻し: メッセージの枠は矢印とラベルの和集合なので、
    // 長いメッセージが横切るライフラインは、ラベルも矢印も無い高さでもメッセージに吸われていた
    // (ライフラインを指すと別のメッセージの枠)。描いた側で決める: ライフラインの線の上で
    // メッセージの文字・矢じり・線が無い所は、ライフラインを手前に出す。
    _addLifelineFronts(overlayEl, msgMatches);

    // Warn on silent divergence — early signal when SVG structure changes
    // (PlantUML 新版 / カスタム skin) and our selector/offset assumptions break.
    OB.warnIfMismatch('participant', participants.length, partMatches.length);
    OB.warnIfMismatch('message', parsedData.relations.length, msgMatches.length + procMsgs.length);

    // Notes: PlantUML 1.2026.x では <g class="note"> を出さず、bare <path>+<text> で描画される。
    // data-source-line も付かないため、selector マッチは成立せず placeholder rect を挿入する。
    // (overlay は data-line が正しければ click hit/jump が機能する。座標精度は後続 task で改善。)
    var notes = parsedData.elements.filter(function(e) { return e.kind === 'note'; });
    var notePicked = OB.pickBestOffset(svgEl, notes, 'g.note', candidates);
    if (notePicked.matches.length > 0) {
      notePicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 8, bb.y - 6, (bb.width || 60) + 16, (bb.height || 14) + 12, {
          'data-type': 'note',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });
    } else {
      // Bug B4 fix: 1×1 placeholder (pointer-events:none) ではクリック不可。
      // note の target participant の既存 overlay rect の位置を参照し、その近傍に
      // クリック可能な approximate box を置く (正確座標抽出は別 sprint)。
      var usedTexts = [];
      notes.forEach(function(n) {
        // BLK-human-20260916-0900: 描かれた注釈の形 (note=path / hnote=polygon / rnote=rect) を
        // 本文の 1 行目から探し、その矩形全体を当たり判定にする (どこを押しても選べる)。
        var shapeBox = _findNoteShape(svgEl, n, usedTexts);
        if (shapeBox) {
          OB.addRect(overlayEl, shapeBox.x - 2, shapeBox.y - 2, shapeBox.width + 4, shapeBox.height + 4, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': n.line,
          });
          return;
        }
        var targets = n.targets || [];
        var targetPart = targets[0];
        var partRect = targetPart
          ? overlayEl.querySelector('rect[data-type="participant"][data-id="' + targetPart + '"]')
          : null;
        if (partRect) {
          var px = parseFloat(partRect.getAttribute('x')) || 0;
          var pw = parseFloat(partRect.getAttribute('width')) || 60;
          var py = parseFloat(partRect.getAttribute('y')) || 0;
          var ph = parseFloat(partRect.getAttribute('height')) || 20;
          // Position under the head participant rect (approximate).
          OB.addRect(overlayEl, px, py + ph + 4, pw, 20, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': n.line,
          });
        } else {
          // 最終 fallback: 参照 participant が無い (or overlay 生成失敗) 場合のみ
          // 1×1 placeholder (pointer-events:none)。
          OB.addRect(overlayEl, 0, 0, 1, 1, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': n.line,
          });
        }
      });
    }
    OB.warnIfMismatch('note', notes.length, overlayEl.querySelectorAll('rect[data-type="note"]').length);

    // Activations: PlantUML SVG では activation バーは <g><title>...</title><rect/></g> として
    // class も data-source-line も付かない。selector が当たらないため placeholder rect 戦略で対応。
    var activations = parsedData.elements.filter(function(e) { return e.kind === 'activation'; });
    var actPicked = OB.pickBestOffset(svgEl, activations, 'g.activation', candidates);
    if (actPicked.matches.length > 0) {
      actPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 4, bb.y, (bb.width || 12) + 8, (bb.height || 16), {
          'data-type': 'activation',
          'data-id': m.item.action + '-' + m.item.target + '-' + m.item.line,
          'data-line': m.item.line,
        });
      });
    } else {
      activations.forEach(function(a) {
        OB.addRect(overlayEl, 0, 0, 1, 1, {
          'data-type': 'activation',
          'data-id': a.action + '-' + a.target + '-' + a.line,
          'data-line': a.line,
        });
      });
    }
    OB.warnIfMismatch('activation', activations.length, overlayEl.querySelectorAll('rect[data-type="activation"]').length);

    // BLK-human-20260915-1204: 帯の矩形を「押した場所が帯の内か外か」を決める材料として置く。
    // 選択の当たり判定には混ぜない (pointer-events を切る) ので、帯の中を押しても
    // これまでどおり挿入メニューが開く。resolveInsertLine だけがこれを読む。
    bandZones(svgEl, dslText).forEach(function(z) {
      var r = OB.addRect(overlayEl, z.bar.x, z.bar.y, z.bar.w, z.bar.h, {
        'data-type': 'band-zone',
        'data-part': z.band.target,
        'data-line': z.band.activateLine,
        'data-band-end': z.band.deactivateLine,
      });
      r.style.pointerEvents = 'none';
      r.classList.remove('selectable');
    });

    var noteRectCount = overlayEl.querySelectorAll('rect[data-type="note"]').length;
    var actRectCount = overlayEl.querySelectorAll('rect[data-type="activation"]').length;
    var groupRectCount = overlayEl.querySelectorAll('rect[data-type="group"]').length;
    var groupsInModel = (parsedData.groups || []).length;
    return {
      matched: {
        // head 基準。tail rect は重複なので「何人マッチしたか」には加算しない。
        participant: partMatches.length,
        message: msgMatches.length + procMsgs.length,
        note: noteRectCount,
        activation: actRectCount,
        group: groupRectCount,
      },
      unmatched: {
        participant: participants.length - partMatches.length,
        message: parsedData.relations.length - msgMatches.length - procMsgs.length,
        note: notes.length - noteRectCount,
        activation: activations.length - actRectCount,
        group: groupsInModel - groupRectCount,
      },
    };
  }

  // BLK-human-20260915-1204: 実行中の帯 (activation バー) の矩形を SVG から拾う。
  // PlantUML は帯を <g><title>{participant}</title><rect fill="#FFFFFF" width="10" …/></g>
  // として描き、class も data-source-line も付けない (同じ矩形を 2 回出す)。
  // lifeline の当たり矩形は fill-opacity:0 なので、塗りと stroke で見分ける。
  function collectActivationBars(svgEl) {
    if (!svgEl || !svgEl.querySelectorAll) return [];
    var seen = {};
    var bars = [];
    var rects = svgEl.querySelectorAll('rect');
    Array.prototype.forEach.call(rects, function(r) {
      var fill = (r.getAttribute('fill') || '').toUpperCase();
      var style = (r.getAttribute('style') || '') + '';
      if (fill === 'NONE' || fill === '#000000') return;          // group 枠 / lifeline の当たり矩形
      if (style.indexOf('stroke:') === -1) return;                // 枠線の無い矩形は帯ではない
      if (parseFloat(r.getAttribute('fill-opacity')) === 0) return;
      var g = r.parentNode;
      var titleEl = g && g.querySelector ? g.querySelector('title') : null;
      if (!titleEl) return;                                       // 帯の <g> は必ず participant 名を持つ
      if (g.getAttribute && g.getAttribute('class')) return;      // head / tail は class 付きの <g> の中
      var x = parseFloat(r.getAttribute('x'));
      var y = parseFloat(r.getAttribute('y'));
      var w = parseFloat(r.getAttribute('width'));
      var h = parseFloat(r.getAttribute('height'));
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;
      var key = titleEl.textContent + '|' + x + ',' + y + ',' + w + ',' + h;
      if (seen[key]) return;                                      // 同じ帯が 2 回描かれる
      seen[key] = true;
      bars.push({ part: titleEl.textContent, x: x, y: y, w: w, h: h });
    });
    bars.sort(function(a, b) { return a.y - b.y; });
    return bars;
  }

  // 拾った帯の矩形を DSL の帯 (parseBands) に突き合わせる。data-source-line が無いので、
  // participant ごとに「上から n 番目の矩形 = n 番目の帯」で対応させる。
  function bandZones(svgEl, dslText) {
    var AI = window.MA.sequenceActivationInsert;
    if (!AI || typeof dslText !== 'string') return [];
    var bands = AI.parseBands(dslText);
    var bars = collectActivationBars(svgEl);
    var byPart = {};
    bands.forEach(function(b) {
      (byPart[b.target] = byPart[b.target] || []).push(b);
    });
    Object.keys(byPart).forEach(function(k) {
      byPart[k].sort(function(a, b) { return a.activateLine - b.activateLine; });
    });
    var used = {};
    var out = [];
    bars.forEach(function(bar) {
      var list = byPart[bar.part];
      if (!list) return;
      var i = used[bar.part] || 0;
      if (i >= list.length) return;
      used[bar.part] = i + 1;
      out.push({ bar: bar, band: list[i] });
    });
    return out;
  }

  // 押した点が帯の矩形の中か、その下のライフライン線かを決める
  // (BLK-human-20260915-1204)。返すのは resolve に渡す hint と同じ形。
  //   { zone: 'inside' | 'outside', bandLine }  … 帯が絡む
  //   null                                      … 帯から離れた所。DSL だけで決めさせる
  var BAND_X_TOLERANCE = 16;   // 帯は幅 10px ほど。ライフライン線を押しても同じ列と見なす

  function resolveBandZone(overlayEl, x, y) {
    if (!overlayEl || isNaN(x) || isNaN(y)) return null;
    var zones = Array.prototype.map.call(
      overlayEl.querySelectorAll('rect[data-type="band-zone"]'), function(r) {
        return {
          line: parseInt(r.getAttribute('data-line'), 10),
          x: parseFloat(r.getAttribute('x')),
          y: parseFloat(r.getAttribute('y')),
          w: parseFloat(r.getAttribute('width')),
          h: parseFloat(r.getAttribute('height')),
        };
      }).filter(function(z) { return !isNaN(z.line) && !isNaN(z.y) && !isNaN(z.h); });
    if (zones.length === 0) return null;
    function sameColumn(z) {
      return x >= z.x - BAND_X_TOLERANCE && x <= z.x + z.w + BAND_X_TOLERANCE;
    }
    // 1. 帯の矩形の中 → 内側。入れ子なら後に始まった帯 (内側) を採る。
    var inside = null;
    zones.forEach(function(z) {
      if (!sameColumn(z) || y < z.y || y > z.y + z.h) return;
      if (!inside || z.line > inside.line) inside = z;
    });
    if (inside) return { zone: 'inside', bandLine: inside.line };
    // 2. 同じ列で自分より上に終わっている帯があれば、その帯を抜けた先 → 外側。
    var above = null;
    zones.forEach(function(z) {
      if (!sameColumn(z) || y <= z.y + z.h) return;
      if (!above || z.y + z.h > above.y + above.h) above = z;
    });
    if (above) return { zone: 'outside', bandLine: above.line };
    return null;
  }

  function resolveInsertLine(overlayEl, x, y) {
    // x は activity モジュールとの signature 合わせだけでなく、帯の内外の判定
    // (resolveBandZone) にも使う。行の決定そのものは 1 列のライフラインなので y だけで足りる。
    if (!overlayEl) return null;
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    if (msgRects.length === 0) return null;
    var items = Array.prototype.map.call(msgRects, function(r) {
      return {
        line: parseInt(r.getAttribute('data-line'), 10),
        y: parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2,
        // 隣のメッセージの矢印が占める横幅。ガイド線をこの列に収めるために返す
        // (図の端から端まで伸びる線は、どのメッセージの隙間を指しているのか読めない)。
        rectX: parseFloat(r.getAttribute('x')),
        rectWidth: parseFloat(r.getAttribute('width')),
      };
    }).filter(function(it) {
      // data-line が付いていない rect (描き直しの途中など) は挿入先にできない。
      return !isNaN(it.line);
    }).sort(function(a, b) { return a.y - b.y; });
    if (items.length === 0) return null;
    var zoneHint = resolveBandZone(overlayEl, x, y);
    // y がどの rect の y より下か判定: 下端から遡って最初に「rect.y < y」なら after その rect
    for (var i = items.length - 1; i >= 0; i--) {
      if (y > items[i].y) return _hit(items[i], 'after', zoneHint);
    }
    // 全 rect より上 → 最上位 rect の before
    return _hit(items[0], 'before', zoneHint);
  }

  function _hit(item, position, zoneHint) {
    var res = { line: item.line, position: position };
    if (zoneHint) { res.zone = zoneHint.zone; res.bandLine = zoneHint.bandLine; }
    if (!isNaN(item.rectX) && !isNaN(item.rectWidth)) {
      res.rectX = item.rectX;
      res.rectWidth = item.rectWidth;
    }
    return res;
  }

  return {
    buildSequenceOverlay: buildSequenceOverlay,
    _lineStartsAt: _lineStartsAt,
    collectActivationBars: collectActivationBars,
    bandZones: bandZones,
    resolveBandZone: resolveBandZone,
    resolveInsertLine: resolveInsertLine,
  };
})();
