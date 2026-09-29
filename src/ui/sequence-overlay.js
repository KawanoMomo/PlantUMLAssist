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
  // BLK-migrator-20260926-1116: 1 行目は Creole の印 (表の `|=` `|`・箇条書きの `*` `#`・リンクの URL) を落として比べ
  // (OB.noteLineKey)、文字が注釈の紙 (折り返し角の path) の上なら紙の外形を返す (中の表・点の図形を範囲にしない)。
  function _findNoteShape(svgEl, note, usedTexts, usedPapers) {
    var key = OB.noteLineKey || function(l) { return String(l).replace(/<[^>]*>|\*\*|\/\/|__|""/g, '').trim(); };
    var first = String(note.text || '').split('\n').map(key).filter(function(l) { return l; })[0];
    if (!first || !svgEl.querySelectorAll) return null;
    var texts = _q(svgEl, 'text');
    var shapes = null;
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (usedTexts.indexOf(t) >= 0) continue;
      if ((t.textContent || '').trim() !== first && !_lineStartsAt(texts, i, first)) continue;
      var tb = _bbox(t);
      if (!tb) continue;
      var paper = OB.notePaperAt ? OB.notePaperAt(svgEl, tb.x + tb.width / 2, tb.y + tb.height / 2) : null;
      if (paper && usedPapers && usedPapers.indexOf(paper.el) >= 0) continue;
      if (paper) {
        usedTexts.push(t);
        if (usedPapers) usedPapers.push(paper.el);
        return paper.box;
      }
      if (!shapes) shapes = _q(svgEl, 'path, polygon, rect');
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

  // BLK-migrator-20260929-0459: 注釈の紙は DSL の読み取りが注釈と認めたかどうかに関係なく枠にする。
  // 本文の `note` / `hnote` / `rnote` で始まる行のうち、パーサが注釈の要素にしなかった行 (読めない書き方) を
  // 注釈の行として拾う。本文は `:` の後ろか、`end note` までの行。行は 1 始まり、描かれる範囲
  // (@startuml … 最初の @enduml、newpage より前) だけ。読んだ注釈の行の範囲 (見出し … end) は除く。
  var _NOTE_OPEN_RE = /^(note|hnote|rnote)\b(.*)$/i;
  var _NOTE_END_RE = /^end\s*(note|hnote|rnote)\s*$/i;
  function _unparsedNoteLines(dslText, notes, meta) {
    if (!dslText) return [];
    var lines = String(dslText).split('\n');
    var covered = {};
    (notes || []).forEach(function(n) {
      for (var l = n.line; l <= (n.endLine || n.line); l++) covered[l] = true;
    });
    var from = (meta && meta.startUmlLine) || 1;
    var stop = (meta && meta.newpageLine) || Infinity;
    var out = [];
    for (var i = from - 1; i < lines.length; i++) {
      var ln = i + 1;
      if (ln >= stop) break;
      var t = lines[i].trim();
      if (ln > from && /^@enduml/i.test(t)) break;
      if (covered[ln]) continue;
      if (meta && meta.deadLines && meta.deadLines[ln]) continue;   // 描かれない枝の注釈
      var m = t.match(_NOTE_OPEN_RE);
      if (!m) continue;
      var rest = m[2];
      var colon = rest.indexOf(':');
      var text, endLine = ln;
      if (colon >= 0) text = rest.slice(colon + 1).trim();
      else {
        var body = [];
        var j = i + 1;
        for (; j < lines.length; j++) {
          if (_NOTE_END_RE.test(lines[j].trim())) break;
          body.push(lines[j].trim());
        }
        if (j >= lines.length) { text = ''; }
        else { text = body.join('\n'); endLine = j + 1; i = j; }
      }
      out.push({ kind: 'note', id: '__nx_' + ln, line: ln, endLine: endLine, text: text, targets: [], unparsed: true });
    }
    return out;
  }

  // 囲み (box) の rect を SVG から拾う。PlantUML は class を付けないので、
  // 「最初の participant-head より前に出る、塗りと細い枠を持つ rect」で見分ける
  // (ライフラインの帯は塗りだけで style を持たない)。描画順は DSL の box 順。
  function _boxRectsInSvg(svgEl) {
    if (!svgEl || !svgEl.querySelectorAll) return [];
    var all = _q(svgEl, 'rect');
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
    var headTop = _firstHeadTop(svgEl);
    // BLK-migrator-20260929-1651: 囲みは参加者の頭を上下にまたぐ rect (頭より上で始まり、頭より下まで続く)。
    // 頭より前に出る枠線つきの rect には、囲みでないもの (PlantUML の警告の帯 — 古い skinparam を使うと図の先頭に
    // 「Please use CSS style instead of skinparam …」を描く) もあり、並び順だけで対応させると 1 番目の囲みの当たりが
    // 図の上端の帯に置かれ、見出しの文字から外れていた。skinparam の名前ごとの補正は足さず、囲みの形で見分ける。
    // 1.2026.7 以降は参加者の頭に class が無いので、ライフライン (点線の line) の上端を包むかで見る。
    var lifelines = _q(svgEl, 'line').filter(function(l) {
      return /stroke-dasharray/.test(l.getAttribute('style') || '');
    }).map(function(l) {
      return { x: parseFloat(l.getAttribute('x1')), y: Math.min(parseFloat(l.getAttribute('y1')), parseFloat(l.getAttribute('y2'))) };
    }).filter(function(p) { return !isNaN(p.x) && !isNaN(p.y); });
    var rects = _boxRectsInSvg(svgEl).filter(function(r) {
      if (lifelines.length) {
        return lifelines.some(function(p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; });
      }
      return isNaN(headTop) || (r.y < headTop && r.y + r.h > headTop);
    });
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
    // BLK-migrator-20260925-0752: PlantUML 1.2026.3 以降は <title> を出さず、題名を
    // <g class="title" data-source-line> (@startuml を 0 とする行) に包む。その行と文字をそのまま使う。
    var tg = svgEl.querySelector('g.title[data-source-line]');
    if (tg) {
      var sl = parseInt(tg.getAttribute('data-source-line'), 10);
      var bbT = OB.extractUnionBBox(tg);
      if (!isNaN(sl) && bbT) {
        var line = sl + 1;
        var hit = null;
        for (var j = 0; j < tls.length; j++) if (tls[j].line === line) { hit = tls[j]; break; }
        OB.addRect(overlayEl, bbT.x - 4, bbT.y - 3, bbT.width + 8, bbT.height + 6, {
          'data-type': 'title',
          'data-id': '__title',
          'data-line': (hit || tls[tls.length - 1]).line,
        });
        return;
      }
    }
    var tEl = svgEl.querySelector('title');
    var drawn = tEl ? String(tEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (!drawn) return;
    var pick = tls[tls.length - 1];
    for (var i = 0; i < tls.length; i++) {
      if (tls[i].text.replace(/\s+/g, ' ').trim() === drawn) { pick = tls[i]; break; }
    }
    var texts = _q(svgEl, 'text');
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
  // procMsgs: class の無い SVG で当てたメッセージ ({ box, parts })。BLK-human-20260925-1500: 1.2026.7 からは全部がこちら。
  // BLK-builder-20260926-1243-2: `create` / `**` で作った参加者の頭は、それを作るメッセージの高さに描かれ、メッセージの枠
  // (矢印と文言の和) の中に入る。頭は塗りのある箱で、メッセージの矢印は頭の縁で止まる (描いた側では頭が手前)。
  // メッセージの枠と重なる参加者の枠だけを、メッセージ (とその高さで手前に出したライフライン) より手前に置く。
  function _raiseHeadsOverMessages(overlayEl) {
    function box(r) {
      return { x: parseFloat(r.getAttribute('x')), y: parseFloat(r.getAttribute('y')),
        w: parseFloat(r.getAttribute('width')), h: parseFloat(r.getAttribute('height')) };
    }
    var msgs = Array.prototype.map.call(overlayEl.querySelectorAll('rect[data-type="message"]'), box);
    if (!msgs.length) return;
    Array.prototype.forEach.call(overlayEl.querySelectorAll('rect[data-type="participant"]'), function(r) {
      var b = box(r);
      if ([b.x, b.y, b.w, b.h].some(isNaN)) return;
      var over = msgs.some(function(m) {
        return m.x < b.x + b.w && b.x < m.x + m.w && m.y < b.y + b.h && b.y < m.y + m.h;
      });
      if (over) overlayEl.appendChild(r);
    });
  }

  function _addLifelineFronts(overlayEl, msgMatches, procMsgs) {
    if (!overlayEl) return;
    var PAD = 2;
    var msgs = [];
    (procMsgs || []).forEach(function(m) {
      if (!m.parts || !m.parts.length) return;
      msgs.push({ x: m.box.x - 4, y: m.box.y - 4, w: m.box.w + 8, h: m.box.h + 8, parts: m.parts });
    });
    (msgMatches || []).forEach(function(m) {
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
  // 参加者 = 表示名と同じ文字の <text> を囲むいちばん小さい <rect>、メッセージ = 矢じり (<polygon>) の付いた線。
  // BLK-migrator-20260924-1332: alt / loop / ref / 区切り / 遅延 が混ざると線の本数が合わず全部を諦めていた。
  // 枠 (見出しの五角形が角に付いた rect)・区切り・遅延を先に見分けてその文字を除き、残りの矢印は
  // 線の上に書かれた文字とメッセージの文言の一致で当てる (本数の一致に頼らない)。
  function _num(el, a) { return parseFloat(el.getAttribute(a)); }
  // BLK-migrator-20260925-1732: mainframe の枠・札・札の文字は図全体の飾り。overlayBuilder.addDocumentChrome が
  // 先に当てるので、参加者・メッセージ・枠を描いた形から探すときは数えない (buildSequenceOverlay が描画ごとに入れ直す)。
  var _chromeSkip = [];
  function _q(root, sel) {
    return Array.prototype.filter.call(root.querySelectorAll(sel), function(n) { return _chromeSkip.indexOf(n) < 0; });
  }
  function _bareShapes(svgEl, sel) {
    return Array.prototype.filter.call(svgEl.querySelectorAll(sel), function(n) {
      if (_chromeSkip.indexOf(n) >= 0) return false;
      var anc = n.parentNode;
      while (anc && anc !== svgEl && anc.getAttribute) {
        if (anc.getAttribute('class')) return false;
        anc = anc.parentNode;
      }
      return true;
    });
  }
  // 比べるための文言: 空白・&nbsp; を落とし、SHOW_INDEX の頭の番号 (`1:`) を外す。
  // BLK-builder-20260925-1552-3: Creole の飾り (`<b>` `**` `//` `""` `__` `~~`) は描かれた文字に残らないので、
  // 本文側・SVG 側の両方から落として比べる (`... Some ~~long delay~~ ...` は「Some」「long delay」と描かれる)。
  // BLK-builder-20260925-1835-2: 改行は `\n` のほかに左寄せ `\l`・右寄せ `\r` もあり、どれも描かれた文字に残らない。
  // スプライト `<$name>` / `<$name{scale=.5}>` と OpenIconic `<&icon>` は絵として描かれ、文字に残らない。
  function _procNorm(s) {
    return String(s || '').replace(/\\[nlr]/g, '').replace(/&nbsp;/g, '').replace(/<[$&][^>]*>/g, '').replace(/<\/?[a-zA-Z][^>]*>/g, '')
      .replace(/\*\*|\/\/|""|__|~~/g, '').replace(/[\s ]+/g, '').replace(/^\d+:/, '');
  }
  function _procRects(svgEl) {
    var out = [];
    _bareShapes(svgEl, 'rect').forEach(function(r) {
      var x = _num(r, 'x'), y = _num(r, 'y'), w = _num(r, 'width'), h = _num(r, 'height');
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || w <= 10 || h <= 10) return;
      out.push({ el: r, x: x, y: y, w: w, h: h });
    });
    return out;
  }
  function _procTexts(svgEl) {
    var out = [];
    _bareShapes(svgEl, 'text').forEach(function(t) {
      var x = _num(t, 'x'), y = _num(t, 'y');
      if (isNaN(x) || isNaN(y)) return;
      var s = String(t.textContent || '').replace(/ /g, ' ');
      out.push({ el: t, x: x, y: y, s: s, w: parseFloat(t.getAttribute('textLength')) || s.length * 7 });
    });
    return out;
  }
  function _inRect(r, x, y) { return x >= r.x - 1 && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  // 矢じりの付いた線 (斜めの線も含む。点線・縦線・矢じりの無い線は除く)。上から順。
  function _procArrows(svgEl) {
    var polys = _bareShapes(svgEl, 'polygon').map(function(pg) {
      return String(pg.getAttribute('points') || '').split(/[\s,]+/).map(parseFloat);
    });
    // BLK-human-20260925-1500: 開いた矢じり (`->>`) と ×印 (`->x`) は <polygon> ではなく斜めの短い <line> 2 本で描かれる。
    var tipLines = [];
    _bareShapes(svgEl, 'line').forEach(function(l) {
      var x1 = _num(l, 'x1'), y1 = _num(l, 'y1'), x2 = _num(l, 'x2'), y2 = _num(l, 'y2');
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;
      var dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      if (dx < 3 || dy < 3 || dx > 16 || dy > 16) return;
      tipLines.push([x1, y1, x2, y2]);
    });
    function tipNear(px, py) {
      var byPoly = polys.some(function(pts) {
        for (var i = 0; i + 1 < pts.length; i += 2) {
          if (Math.abs(pts[i + 1] - py) <= 6 && Math.abs(pts[i] - px) <= 12) return true;
        }
        return false;
      });
      if (byPoly) return true;
      return tipLines.some(function(t) {
        return (Math.abs(t[1] - py) <= 6 && Math.abs(t[0] - px) <= 12) || (Math.abs(t[3] - py) <= 6 && Math.abs(t[2] - px) <= 12);
      });
    }
    var allLines = _bareShapes(svgEl, 'line').map(function(l) {
      return { x1: _num(l, 'x1'), y1: _num(l, 'y1'), x2: _num(l, 'x2'), y2: _num(l, 'y2'),
        dashed: /dasharray/.test(l.getAttribute('style') || '') };
    });
    return allLines.filter(function(a) {
      if (isNaN(a.x1) || isNaN(a.y1) || isNaN(a.x2) || isNaN(a.y2)) return false;
      if (Math.abs(a.x2 - a.x1) < 10 || Math.abs(a.y2 - a.y1) > Math.abs(a.x2 - a.x1)) return false;
      if (Math.abs(a.x2 - a.x1) <= 16 && Math.abs(a.y2 - a.y1) >= 3) return false;   // 矢じり・×印の短い斜線そのもの
      return tipNear(a.x1, a.y1) || tipNear(a.x2, a.y2);
    }).map(function(a) {
      var l = a.x1 <= a.x2 ? { x: a.x1, y: a.y1 } : { x: a.x2, y: a.y2 };
      var r = a.x1 <= a.x2 ? { x: a.x2, y: a.y2 } : { x: a.x1, y: a.y1 };
      // 矢じりの向き: 重心がこの線の範囲に掛かり、端に近い矢じりだけをその線のものと見る
      // (teoz の並んだ矢印では、隣の矢印の矢じりがこの線の始点のすぐ外にある)。
      // BLK-builder-20260925-1712-1: 自分の矢じりとして見た形の外接矩形を tips に集める (ライフラインを手前に出す高さを
      // 描いた形で決めるため)。開いた矢じり・×印の短い斜線は、端に接するものを矢じりとして数える。
      var tips = [];
      function _box(xs, ys) {
        var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        return { x: x0, y: y0, width: Math.max.apply(null, xs) - x0, height: Math.max.apply(null, ys) - y0 };
      }
      function ownTip(px, py) {
        var found = false;
        polys.forEach(function(pts) {
          var sx = 0, sy = 0, n = 0, xs = [], ys = [];
          for (var i = 0; i + 1 < pts.length; i += 2) {
            if (isNaN(pts[i]) || isNaN(pts[i + 1])) continue;
            sx += pts[i]; sy += pts[i + 1]; n++; xs.push(pts[i]); ys.push(pts[i + 1]);
          }
          if (!n) return;
          var cx = sx / n, cy = sy / n;
          if (Math.abs(cy - py) <= 6 && Math.abs(cx - px) <= 8 && cx >= l.x - 3 && cx <= r.x + 3) {
            found = true;
            tips.push(_box(xs, ys));
          }
        });
        if (!found) {
          tipLines.forEach(function(t) {
            if ((Math.abs(t[1] - py) <= 6 && Math.abs(t[0] - px) <= 12) || (Math.abs(t[3] - py) <= 6 && Math.abs(t[2] - px) <= 12)) {
              tips.push(_box([t[0], t[2]], [t[1], t[3]]));
            }
          });
        }
        return found;
      }
      var tipL = ownTip(l.x, l.y), tipR = ownTip(r.x, r.y);
      // 自分宛ての矢印は「出る線・縦の短い線・戻る線 (矢じり付き)」の 3 本。矢じりの付いた戻る線だけが矢印として残るので、
      // 縦の短い線とその先の出る線も描いた物として tips に入れる (出る線の尾もライフラインの上で線の太さだけはメッセージ)。
      [l, r].forEach(function(end) {
        allLines.forEach(function(v) {
          if (isNaN(v.x1) || isNaN(v.y1) || isNaN(v.x2) || isNaN(v.y2)) return;
          if (Math.abs(v.x1 - v.x2) > 0.5 || Math.abs(v.x1 - end.x) > 1.5) return;
          var vTop = Math.min(v.y1, v.y2), vBot = Math.max(v.y1, v.y2);
          if (vBot - vTop < 3 || vBot - vTop > 40) return;
          var far = Math.abs(vTop - end.y) <= 1.5 ? vBot : Math.abs(vBot - end.y) <= 1.5 ? vTop : null;
          if (far === null) return;
          tips.push({ x: v.x1, y: vTop, width: 0, height: vBot - vTop });
          allLines.forEach(function(h) {
            if (isNaN(h.x1) || isNaN(h.y1) || isNaN(h.x2) || isNaN(h.y2)) return;
            if (Math.abs(h.y1 - h.y2) > 0.5 || Math.abs(h.y1 - far) > 1.5) return;
            if (Math.abs(h.x1 - end.x) > 1.5 && Math.abs(h.x2 - end.x) > 1.5) return;
            tips.push({ x: Math.min(h.x1, h.x2), y: h.y1, width: Math.abs(h.x2 - h.x1), height: 0 });
          });
        });
      });
      return { x1: l.x, x2: r.x, top: Math.min(a.y1, a.y2), bottom: Math.max(a.y1, a.y2),
        tipL: tipL, tipR: tipR, tips: tips };
    }).sort(function(a, b) { return a.top - b.top; });
  }
  // BLK-human-20260925-1500: PlantUML 1.2026.7 からシーケンス図は teoz の描き方だけになり、参加者・メッセージの
  // <g class> と data-* が SVG から消えた。残るのはライフラインの `<g><title>表示名</title><rect 透明/><line 点線/></g>`
  // (表示名の ASCII 以外は '.' に伏せられる。遅延 `...` で区間ごとの <g> に分かれる)。
  // ライフラインを列の錨にして、参加者 = その列の線の上端のすぐ上 (頭) / 下端のすぐ下 (尻) に接して描かれた
  // 図形と文字のかたまり、と描いた側の配置から当てる (表示名の文字や形のキーワードに頼らない)。
  function _maskName(s) {
    return String(s || '').replace(/<[^>]*>/g, '').replace(/\*\*|__|\/\/|""/g, '').trim()
      .replace(/[^\x00-\x7f]/g, '.');
  }
  function _procLifelines(svgEl) {
    var cols = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('g'), function(g) {
      if (g.getAttribute('class')) return;
      var t = null, segs = [];
      Array.prototype.forEach.call(g.children || [], function(c) {
        var tag = (c.tagName || '').toLowerCase();
        if (tag === 'title' && !t) t = c;
        if (tag === 'line' && /dasharray/.test(c.getAttribute('style') || '')) segs.push(c);
      });
      if (!t || !segs.length) return;
      var x = _num(segs[0], 'x1');
      if (isNaN(x)) return;
      var top = Infinity, bottom = -Infinity;
      segs.forEach(function(l) {
        var y1 = _num(l, 'y1'), y2 = _num(l, 'y2');
        if (isNaN(y1) || isNaN(y2) || Math.abs(_num(l, 'x2') - _num(l, 'x1')) > 0.5) return;
        top = Math.min(top, y1, y2); bottom = Math.max(bottom, y1, y2);
      });
      if (!isFinite(top)) return;
      var name = String(t.textContent || '').trim();
      var col = null;
      cols.forEach(function(c) { if (!col && Math.abs(c.x - x) < 0.6 && c.title === name) col = c; });
      if (!col) { col = { title: name, x: x, top: top, bottom: bottom, groups: [] }; cols.push(col); }
      col.top = Math.min(col.top, top); col.bottom = Math.max(col.bottom, bottom);
      col.groups.push(g);
    });
    return cols.sort(function(a, b) { return a.x - b.x; });
  }
  // 列 → 参加者。伏せ字にした表示名 (1 行目) か別名で当て、当たらない残りは数が同じときだけ左から順に当てる。
  function _lifelineOwners(cols, participants) {
    var owner = [], used = [];
    cols.forEach(function(c, i) {
      var hits = participants.filter(function(p) {
        if (used.indexOf(p) >= 0) return false;
        var first = String(p.label || '').split(/\\n|\n/)[0];
        return c.title === p.id || c.title === _maskName(first) || c.title === _maskName(p.label);
      });
      if (hits.length === 1) { owner[i] = hits[0]; used.push(hits[0]); }
    });
    var restC = [], restP = participants.filter(function(p) { return used.indexOf(p) < 0; });
    cols.forEach(function(c, i) { if (!owner[i]) restC.push(i); });
    if (restC.length && restC.length === restP.length) restC.forEach(function(ci, k) { owner[ci] = restP[k]; });
    return owner;
  }
  // 線の端より上 (dir<0) / 下 (dir>0) にある。文字の外接矩形は字の下がりのぶん線の端を数 px 越える。
  function _onSide(s, edgeY, dir) {
    var cy = s.y + s.h / 2;
    return dir < 0 ? (cy < edgeY && s.y + s.h <= edgeY + 4) : (cy > edgeY && s.y >= edgeY - 4);
  }
  // 列の線の端 (edgeY) に接する図形・文字から始め、上下に隙間なく続き、中心がそのかたまりの幅に入るものを足す。
  function _columnCluster(shapes, col, edgeY, dir) {
    var near = shapes.filter(function(s) {
      if (col.x < s.x - 1 || col.x > s.x + s.w + 1) return false;
      if (_onSide(s, edgeY, dir) && (dir < 0 ? s.y + s.h >= edgeY - 12 : s.y <= edgeY + 12)) return true;
      // create した参加者: teoz は線を頭の上端から引き、頭の箱をその上に重ねる。
      return dir < 0 && Math.abs(s.y - edgeY) <= 1.5 && s.h < 80 && (s.el.tagName || '').toLowerCase() === 'rect';
    });
    if (!near.length) return null;
    near.sort(function(a, b) { return dir < 0 ? (b.y + b.h) - (a.y + a.h) : a.y - b.y; });
    var box = { x: near[0].x, y: near[0].y, w: near[0].w, h: near[0].h };
    var taken = [near[0]];
    for (var grew = true; grew;) {
      grew = false;
      shapes.forEach(function(s) {
        if (taken.indexOf(s) >= 0) return;
        var inside = s.x >= box.x - 0.5 && s.x + s.w <= box.x + box.w + 0.5 && s.y >= box.y - 0.5 && s.y + s.h <= box.y + box.h + 4;
        if (!inside && !_onSide(s, edgeY, dir)) return;
        var cx = s.x + s.w / 2;
        if (cx < box.x - 2 || cx > box.x + box.w + 2) return;
        if (s.y > box.y + box.h + 5 || s.y + s.h < box.y - 5) return;
        taken.push(s);
        var x2 = Math.max(box.x + box.w, s.x + s.w), y2 = Math.max(box.y + box.h, s.y + s.h);
        box.x = Math.min(box.x, s.x); box.y = Math.min(box.y, s.y);
        box.w = x2 - box.x; box.h = y2 - box.y;
        grew = true;
      });
    }
    return box;
  }
  function _procShapes(svgEl) {
    var out = [];
    _bareShapes(svgEl, 'rect, ellipse, circle, path, polygon, text').forEach(function(n) {
      var tag = (n.tagName || '').toLowerCase();
      if (tag === 'rect' && parseFloat(n.getAttribute('fill-opacity')) === 0) return;
      var anc = n.parentNode;
      if (anc && anc !== svgEl && Array.prototype.some.call(anc.children || [], function(c) {
        return (c.tagName || '').toLowerCase() === 'title';
      })) return;
      var bb = OB.nodeBBox(n);
      if (!bb || isNaN(bb.x) || isNaN(bb.y)) return;
      out.push({ el: n, x: bb.x, y: bb.y, w: bb.width || 0, h: bb.height || 0 });
    });
    return out;
  }
  // BLK-migrator-20260929-0011: destroy した名前を create し直すと、PlantUML は同じ列 (同じライフライン) の途中に
  // 頭をもう一度描く (1 回目の頭と同じ x・幅・高さの箱)。名前で 1 つに畳まず、描いた回ごとに枠を持つ。
  // 回の順 (上から) に、本文の create の行 (`create X` / `create participant … as X` / `A -> X **`) の後ろから当てる
  // (頭の数より create が少ないのは、1 回目の頭が宣言で描かれた頭のとき)。
  function _headRect(shapes, head) {
    var hr = null;
    if (!head) return null;
    shapes.forEach(function(s) {
      if ((s.el.tagName || '').toLowerCase() !== 'rect') return;
      if (s.x < head.x - 0.5 || s.x + s.w > head.x + head.w + 0.5 || s.y < head.y - 0.5 || s.y + s.h > head.y + head.h + 0.5) return;
      if (!hr || s.w * s.h > hr.w * hr.h) hr = s;
    });
    return hr;
  }
  function _sameBox(s, hr) {
    return (s.el.tagName || '').toLowerCase() === 'rect' && s !== hr &&
      Math.abs(s.x - hr.x) <= 0.6 && Math.abs(s.w - hr.w) <= 0.6 && Math.abs(s.h - hr.h) <= 0.6;
  }
  // destroy で線が途中で終わった参加者の尻は、線の端から離れた図の下端の段に描かれる。線の端の近くに尻が無ければ、
  // 頭と同じ x・幅・高さの箱を線より下で探す。
  function _farTail(shapes, col, head) {
    var hr = _headRect(shapes, head);
    if (!hr) return null;
    var below = shapes.filter(function(s) { return _sameBox(s, hr) && s.y >= col.bottom - 1; })
      .sort(function(a, b) { return a.y - b.y; });
    return below.length ? { x: below[0].x, y: below[0].y, w: below[0].w, h: below[0].h } : null;
  }
  function _reHeads(shapes, col, head, tail, item, createLines) {
    var lines = (createLines && createLines[item.id]) || [];
    if (!head || !lines.length) return [];
    var hr = _headRect(shapes, head);
    if (!hr) return [];
    var lo = head.y + head.h - 1, hi = tail ? tail.y + 1 : col.bottom + 1;
    var found = shapes.filter(function(s) {
      return _sameBox(s, hr) && s.y > lo && s.y + s.h < hi;
    }).sort(function(a, b) { return a.y - b.y; });
    return found.map(function(s, k) {
      var li = lines.length - found.length + k;
      return { item: item, box: { x: s.x, y: s.y, w: s.w, h: s.h }, col: col, line: li >= 0 ? lines[li] : item.line, reHead: true };
    });
  }
  function _procParticipantsByLifeline(svgEl, participants, createLines) {
    var cols = _procLifelines(svgEl);
    if (!cols.length) return null;
    var owner = _lifelineOwners(cols, participants);
    // box の囲み (列の線の上端から下端までを包む rect) の見出しの文字は、参加者のかたまりに入れない。
    var all = _procShapes(svgEl);
    var boxes = all.filter(function(r) {
      return (r.el.tagName || '').toLowerCase() === 'rect' && cols.some(function(c) {
        return c.x > r.x && c.x < r.x + r.w && r.y < c.top && r.y + r.h > c.bottom;
      });
    });
    var shapes = all.filter(function(s) {
      if (boxes.indexOf(s) >= 0) return false;
      return !boxes.some(function(r) {
        return (s.el.tagName || '').toLowerCase() === 'text' && s.x >= r.x - 1 && s.x <= r.x + r.w && s.y < r.y + 18 && s.y >= r.y - 1;
      });
    });
    var out = [];
    cols.forEach(function(c, i) {
      if (!owner[i]) return;
      var head = _columnCluster(shapes, c, c.top, -1);
      var tail = _columnCluster(shapes, c, c.bottom, 1) || _farTail(shapes, c, head);
      c.headBox = head;
      if (head) out.push({ item: owner[i], box: head, col: c });
      c.reHeads = _reHeads(shapes, c, head, tail, owner[i], createLines);
      c.reHeads.forEach(function(h) { out.push(h); });
      if (tail) out.push({ item: owner[i], box: tail, col: c });
    });
    return { cols: cols, owner: owner, hits: out };
  }

  function _procParticipants(svgEl, participants, arrows, createLines) {
    // ライフラインで当たった参加者はそれを採り、ライフラインを持たない参加者 (C4 の囲みなど) だけを文字で当てる。
    var byCol = _procParticipantsByLifeline(svgEl, participants, createLines);
    var colHits = byCol ? byCol.hits : [];
    if (colHits.length) {
      var done = colHits.map(function(h) { return h.item; });
      var rest = participants.filter(function(p) { return done.indexOf(p) < 0; });
      return colHits.concat(rest.length ? _procParticipantsByText(svgEl, rest, arrows) : []);
    }
    return _procParticipantsByText(svgEl, participants, arrows);
  }
  function _procParticipantsByText(svgEl, participants, arrows) {
    var texts = _procTexts(svgEl);
    var rects = _procRects(svgEl);
    var span = arrows && arrows.length ? { top: arrows[0].top, bottom: arrows[arrows.length - 1].bottom } : null;
    var hits = [];
    participants.forEach(function(p) {
      var label = String(p.label || '').trim();
      if (!label) return;
      texts.forEach(function(t) {
        if (t.s.trim() !== label) return;
        // 頭 (最初の矢印より上) と尻 (最後の矢印より下) の表示名だけ。メッセージの文字の同じ語は拾わない。
        if (span && t.y > span.top - 2 && t.y < span.bottom + 2) return;
        var best = null;
        rects.forEach(function(r) {
          if (!_inRect(r, t.x, t.y)) return;
          if (!best || r.w * r.h < best.w * best.h) best = r;
        });
        if (best) hits.push({ item: p, t: t, rect: best });
      });
    });
    return hits.map(function(h) {
      var r = h.rect;
      // 囲み (`*_Boundary(…)`) は中に別の参加者を持つ大きな枠。枠全体は覆わず (中の参加者を押せなくなる)、
      // 上端から中の参加者の頭の手前までの名札の帯だけを当てる。
      var inner = hits.filter(function(o) { return o.item !== h.item && _inRect(r, o.t.x, o.t.y); });
      if (!inner.length) return { item: h.item, box: { x: r.x, y: r.y, w: r.w, h: r.h } };
      var innerTop = Infinity;
      inner.forEach(function(o) { innerTop = Math.min(innerTop, o.rect !== r ? o.rect.y : o.t.y - 14); });
      var bottom = Math.min(r.y + r.h, Math.max(h.t.y + 6, innerTop - 8));
      return { item: h.item, box: { x: r.x, y: r.y, w: r.w, h: bottom - r.y } };
    });
  }
  // 枠 (alt / loop / ref …)・区切り (`== x ==`)・遅延 (`... x ...`) を描かれた物から見分ける。
  // claimed: それらに属する <text> (メッセージの文字に混ぜない)。
  function _procStructures(svgEl, dslText) {
    var texts = _procTexts(svgEl);
    var rects = _procRects(svgEl);
    var claimed = [];
    function claim(t) { if (claimed.indexOf(t.el) < 0) claimed.push(t.el); }
    // 見出しの五角形 (<path>) が左上の角から始まる rect が枠。同じ枠は塗りと線で 2 回描かれる。
    var starts = _bareShapes(svgEl, 'path').map(function(p) {
      var m = /^\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(p.getAttribute('d') || '');
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    }).filter(Boolean);
    var frames = [], seen = {};
    rects.forEach(function(r) {
      if (r.w < 30 || r.h < 15) return;
      if (!starts.some(function(s) { return Math.abs(s.x - r.x) < 0.6 && Math.abs(s.y - r.y) < 0.6; })) return;
      var key = Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.w) + ',' + Math.round(r.h);
      if (seen[key]) return;
      seen[key] = 1;
      frames.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    });
    frames.sort(function(a, b) { return a.y - b.y; });
    // 枠の見出しの行 (種類と条件) と、else の点線のすぐ下の条件は枠の文字。
    // 矢印を 1 本も含まない枠 (ref) は、中の文字も全部枠の文字。
    var arrows = _procArrows(svgEl);
    frames.forEach(function(f) {
      var empty = !arrows.some(function(a) { return _inRect(f, (a.x1 + a.x2) / 2, a.top); });
      texts.forEach(function(t) {
        if (t.x < f.x - 1 || t.x > f.x + f.w) return;
        if (t.y >= f.y && t.y <= (empty ? f.y + f.h : f.y + 22)) claim(t);
      });
    });
    _bareShapes(svgEl, 'line').forEach(function(l) {
      if (!/dasharray/.test(l.getAttribute('style') || '')) return;
      var y1 = _num(l, 'y1'), y2 = _num(l, 'y2'), x1 = _num(l, 'x1'), x2 = _num(l, 'x2');
      if (isNaN(y1) || Math.abs(y2 - y1) > 0.5 || Math.abs(x2 - x1) < 30) return;
      texts.forEach(function(t) {
        if (t.y > y1 && t.y <= y1 + 20 && t.x >= Math.min(x1, x2) - 1 && t.x <= Math.max(x1, x2)) claim(t);
      });
    });
    var dividers = [], delays = [];
    var usedRects = [];
    var hLines = _bareShapes(svgEl, 'line').map(function(l) {
      var y1 = _num(l, 'y1'), x1 = _num(l, 'x1'), x2 = _num(l, 'x2');
      if (isNaN(y1) || isNaN(x1) || isNaN(x2) || Math.abs(_num(l, 'y2') - y1) > 0.5) return null;
      return { y: y1, x1: Math.min(x1, x2), x2: Math.max(x1, x2), dashed: /dasharray/.test(l.getAttribute('style') || '') };
    }).filter(Boolean);
    String(dslText || '').split('\n').forEach(function(raw, i) {
      var dm = /^\s*==\s*(.*?)\s*==\s*$/.exec(raw);
      var lm = !dm && /^\s*\.\.\.\s*(.*?)\s*\.\.\.\s*$/.exec(raw);
      var label = _procNorm(dm ? dm[1] : (lm ? lm[1] : ''));
      if (!label) return;
      if (dm) {
        // 区切り: 表示名を囲む小さい rect。横いっぱいの 2 本線まで広げる。
        // BLK-builder-20260925-1552-3: 描かれた区切りの形 (rect を左右に突き抜ける横線がある) を持つ rect に限る
        // (同じ文字を持つ注釈や手続きの部品の箱を区切りと取り違えない)。
        var best = null;
        rects.forEach(function(r) {
          if (usedRects.indexOf(r) >= 0) return;
          if (!hLines.some(function(l) { return l.y >= r.y && l.y <= r.y + r.h && l.x1 < r.x - 1 && l.x2 > r.x + r.w + 1; })) return;
          var inside = texts.filter(function(t) { return _inRect(r, t.x, t.y); });
          if (!inside.length || _procNorm(inside.map(function(t) { return t.s; }).join('')) !== label) return;
          if (!best || r.w * r.h < best.w * best.h) best = r;
        });
        if (!best) return;
        usedRects.push(best);
        var x1 = best.x, x2 = best.x + best.w;
        _bareShapes(svgEl, 'line').forEach(function(l) {
          var ly = _num(l, 'y1');
          if (Math.abs(_num(l, 'y2') - ly) > 0.5 || ly < best.y || ly > best.y + best.h) return;
          x1 = Math.min(x1, _num(l, 'x1'), _num(l, 'x2'));
          x2 = Math.max(x2, _num(l, 'x1'), _num(l, 'x2'));
        });
        texts.forEach(function(t) { if (_inRect(best, t.x, t.y)) claim(t); });
        dividers.push({ line: i + 1, box: { x: x1, y: best.y, w: x2 - x1, h: best.h } });
        return;
      }
      // 遅延: 枠の無い 1 行の文字 (同じ高さに並ぶ語をつなげて表示名と一致するもの)。
      var rows = {};
      texts.forEach(function(t) {
        if (claimed.indexOf(t.el) >= 0) return;
        var k = Math.round(t.y);
        (rows[k] = rows[k] || []).push(t);
      });
      Object.keys(rows).some(function(k) {
        var row = rows[k];
        if (_procNorm(row.map(function(t) { return t.s; }).join('')) !== label) return false;
        var left = Infinity, right = -Infinity;
        row.forEach(function(t) { left = Math.min(left, t.x); right = Math.max(right, t.x + t.w); claim(t); });
        delays.push({ line: i + 1, box: { x: left, y: row[0].y - 13, w: right - left, h: 17 } });
        return true;
      });
    });
    // BLK-migrator-20260929-2158: 図全体にかかる区切りの線のうち、枠・区切り (`==`) の中に無いもの。どのライフラインも
    // 左右に突き抜ける横の破線は、メッセージ (ライフラインの上から出る) でも枠の else の点線 (枠の中) でもなく、
    // ページの境目の区切り (`newpage` が 1 枚目の下端に描く全幅の破線)。本文で箱を持たない区切りの行 (`newpage`) に
    // 上から順に当てる。本数が合わなければ当てない (推し量って別の行を指さない)。
    var lifeXs = _bareShapes(svgEl, 'line').map(function(l) {
      var x1 = _num(l, 'x1'), y1 = _num(l, 'y1'), y2 = _num(l, 'y2');
      if (isNaN(x1) || Math.abs(_num(l, 'x2') - x1) > 0.5 || Math.abs(y2 - y1) < 20) return null;
      return /dasharray/.test(l.getAttribute('style') || '') ? x1 : null;
    }).filter(function(x) { return x != null; });
    var rules = [];
    if (lifeXs.length) {
      var lxMin = Math.min.apply(null, lifeXs), lxMax = Math.max.apply(null, lifeXs);
      var wide = hLines.filter(function(l) {
        return l.x1 < lxMin - 1 && l.x2 > lxMax + 1 && l.dashed &&
          !frames.some(function(f) { return l.y > f.y + 0.5 && l.y < f.y + f.h - 0.5 && l.x1 >= f.x - 1 && l.x2 <= f.x + f.w + 1; }) &&
          !dividers.some(function(d) { return l.y >= d.box.y - 1 && l.y <= d.box.y + d.box.h + 1; });
      }).sort(function(a, b) { return a.y - b.y; });
      var ruleLines = [];
      String(dslText || '').split('\n').forEach(function(raw, i) { if (/^\s*newpage\b/i.test(raw)) ruleLines.push(i + 1); });
      // プレビューに描かれるのは 1 枚目だけなので、描かれる境目は最初の newpage の 1 本
      ruleLines = ruleLines.slice(0, 1);
      if (wide.length === ruleLines.length) {
        wide.forEach(function(l, k) { rules.push({ line: ruleLines[k], box: { x: l.x1, y: l.y - 3, w: l.x2 - l.x1, h: 6 } }); });
      }
    }
    return { frames: frames, dividers: dividers, delays: delays, rules: rules, claimed: claimed, texts: texts };
  }
  // 矢印をメッセージ行へ当てる。線の上 (前の矢印より下) に書かれた文字にメッセージの文言が含まれるものを
  // 順序を保って最大数対応させ (LCS)、文言で当たらなかった残りは前後の対応の間で本数が合うときだけ順に当てる。
  function _procMessages(svgEl, relations, floorY, scene) {
    var arrows = _procArrows(svgEl);
    var rels = relations.slice().sort(function(a, b) { return (a.line || 0) - (b.line || 0); });
    if (!arrows.length || !rels.length) return [];
    var texts = (scene && scene.texts) || _procTexts(svgEl);
    var claimed = (scene && scene.claimed) || [];
    var prevY = typeof floorY === 'number' && isFinite(floorY) ? floorY - 4 : -Infinity;
    // BLK-builder-20260925-0314-1: teoz の `&` は前の矢印と同じ高さに矢印を並べる。同じ高さの矢印どうしは
    // 同じ床 (その段より前の矢印の下端) から文字を探す (前の矢印の下端を床にすると、並んだ矢印の文字が消える)。
    var rowTop = null, rowFloor = prevY;
    var own = arrows.map(function(a) {
      if (rowTop === null || Math.abs(a.top - rowTop) > 1) { rowFloor = prevY; rowTop = a.top; }
      var floor = rowFloor;
      var mine = texts.filter(function(t) {
        if (claimed.indexOf(t.el) >= 0) return false;
        if (t.y > a.bottom || t.y <= floor + 4) return false;
        return t.x >= a.x1 - 20 && t.x <= a.x2 + 20;
      }).sort(function(p, q) { return (p.y - q.y) || (p.x - q.x); });
      prevY = Math.max(prevY, a.bottom);
      return { arrow: a, texts: mine, key: _procNorm(mine.map(function(t) { return t.s; }).join('')) };
    });
    var R = rels.length, L = own.length;
    function hit(i, j) {
      var k = _procNorm(rels[i].label);
      return !!k && own[j].key.indexOf(k) >= 0;
    }
    var dp = [], i, j;
    for (i = 0; i <= R; i++) { dp.push([]); for (j = 0; j <= L; j++) dp[i].push(0); }
    for (i = R - 1; i >= 0; i--) {
      for (j = L - 1; j >= 0; j--) {
        dp[i][j] = hit(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var pairs = [];
    i = 0; j = 0;
    while (i < R && j < L) {
      if (hit(i, j) && dp[i][j] === dp[i + 1][j + 1] + 1) { pairs.push([i, j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    // 文言で当たった組の間の区間は、残りのメッセージと矢印の数が同じときだけ順に当てる。
    var all = [];
    var pi = 0, pj = 0;
    pairs.concat([[R, L]]).forEach(function(p) {
      if (p[0] - pi === p[1] - pj) {
        for (var k = 0; k < p[0] - pi; k++) all.push([pi + k, pj + k]);
      }
      if (p[0] < R) all.push(p);
      pi = p[0] + 1; pj = p[1] + 1;
    });
    return all.map(function(p) {
      var o = own[p[1]], a = o.arrow;
      // 矢じり (<polygon>) は線の端から数 px はみ出す。矢じりのある側だけ枠を広げる
      // (両側に広げると、隣の矢印の矢じりまで覆って別のメッセージの枠が出る)。
      var top = a.top - 6, left = a.x1 - (a.tipL ? 6 : 0), right = a.x2 + (a.tipR ? 6 : 0);
      // parts: メッセージが自分で描いた所 (文字・矢印の線と矢じり)。ライフラインを手前に出す高さを決めるのに使う。
      // BLK-builder-20260925-1712-1: 線は描いた太さ (上下 1px)、矢じりはその形の外接矩形。矢印全体を上下 5px の帯 1 枚に
      // すると、ライフラインの上で線の尾 (太さ 1px) の上下 7px までがメッセージのものになり、ライフラインを指しても
      // 近くの矢印が選ばれた (class の付いた旧版の SVG は線を実際の太さで数えていた)。
      var parts = [{ x: a.x1, y: a.top - 1, width: a.x2 - a.x1, height: a.bottom - a.top + 2 }];
      (a.tips || []).forEach(function(tb) { parts.push(tb); });
      o.texts.forEach(function(t) {
        top = Math.min(top, t.y - 13);
        left = Math.min(left, t.x);
        right = Math.max(right, t.x + t.w);
        var tb = OB.nodeBBox(t.el);
        if (tb) parts.push(tb);
      });
      return { item: rels[p[0]], box: { x: left, y: top, w: right - left, h: a.bottom + 6 - top }, parts: parts };
    });
  }

  // 手続きの図の ref / 区切り / 遅延: フォームで直せない記法として、書かれた行を指す枠 (app.js が右欄に行を出す)。
  // BLK-owner-20260924-0637-2: 枠 (alt / loop / opt / par / break / critical / group) の当たり判定。
  // 枠全体を覆う rect はライフラインの当たり矩形の下にあり、左上の札「alt」はライフラインや帯の上に
  // 描かれるので、札を押すとライフライン選択か帯の「ここに挿入」に吸われていた。PlantUML が SVG に残した
  // 札の五角形 (枠の左上角から始まる path) と枠線・条件の文字を、ライフラインより手前の当たりにする。
  // 置くのは <path> (rect の数で枠を数えるテストと選択の塗りはそのまま、選ぶと枠の rect が光る)。
  var SVG_NS_HIT = 'http://www.w3.org/2000/svg';

  function _nums(str) {
    return (String(str || '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  }

  // 札の下端 (y)。札は枠の左上角から始まる五角形。見つからなければ文字 1 行ぶん (18) とみなす。
  function _frameTabBottom(svgEl, bb) {
    var best = null;
    Array.prototype.forEach.call(_q(svgEl, 'path, polygon'), function(el) {
      var n = _nums(el.getAttribute('d') || el.getAttribute('points'));
      if (n.length < 6) return;
      if (Math.abs(n[0] - bb.x) > 1.5 || Math.abs(n[1] - bb.y) > 1.5) return;
      var maxY = -Infinity;
      for (var i = 1; i < n.length; i += 2) if (n[i] > maxY) maxY = n[i];
      if (!(maxY > bb.y) || maxY - bb.y > 40) return;
      if (best === null || maxY > best) best = maxY;
    });
    return best === null ? bb.y + 18 : best;
  }

  function _addGroupHit(overlayEl, x, y, w, h, gp, part) {
    return _addFrontHit(overlayEl, x, y, w, h, { 'data-type': 'group', 'data-id': gp.id, 'data-line': gp.line }, part);
  }
  function _addFrontHit(overlayEl, x, y, w, h, attrs, part) {
    if (!(w > 0) || !(h > 0)) return null;
    var el = document.createElementNS(SVG_NS_HIT, 'path');
    el.setAttribute('d', 'M' + x + ',' + y + ' h' + w + ' v' + h + ' h' + (-w) + ' Z');
    el.setAttribute('fill', 'transparent');
    el.setAttribute('stroke', 'none');
    el.setAttribute('class', 'group-hit');
    Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
    el.setAttribute('data-hit-part', part);
    el.style.pointerEvents = 'all';
    el.style.cursor = 'pointer';
    overlayEl.appendChild(el);
    return el;
  }

  // 条件の文字 ([成功] / else の [失敗])。枠の内側にある「[...]」の文字の箱。
  function _conditionBoxes(svgEl, bb, tabBottom) {
    var out = [];
    Array.prototype.forEach.call(_q(svgEl, 'text'), function(t) {
      var s = String(t.textContent || '').trim();
      if (!/^\[.*\]$/.test(s)) return;
      var b = _bbox(t);
      if (!b) {
        var tx = parseFloat(t.getAttribute('x')), ty = parseFloat(t.getAttribute('y'));
        if (isNaN(tx) || isNaN(ty)) return;
        b = { x: tx, y: ty - 13, width: s.length * 7, height: 16 };
      }
      if (b.x < bb.x || b.x > bb.x + bb.w || b.y < tabBottom - 1 || b.y + b.height > bb.y + bb.h + 1) return;
      out.push(b);
    });
    return out;
  }

  function _addGroupHits(svgEl, overlayEl, frames) {
    var EDGE = 3;
    frames.forEach(function(f) {
      var bb = f.bb, gp = f.group;
      var tabBottom = _frameTabBottom(svgEl, bb);
      // 札と見出しの行 (札・条件の文字を含む)。
      _addGroupHit(overlayEl, bb.x - EDGE, bb.y - EDGE, bb.w + EDGE * 2, (tabBottom - bb.y) + EDGE, gp, 'head');
      // 枠線 (左・右・下)。
      _addGroupHit(overlayEl, bb.x - EDGE, bb.y, EDGE * 2, bb.h + EDGE, gp, 'edge');
      _addGroupHit(overlayEl, bb.x + bb.w - EDGE, bb.y, EDGE * 2, bb.h + EDGE, gp, 'edge');
      _addGroupHit(overlayEl, bb.x - EDGE, bb.y + bb.h - EDGE, bb.w + EDGE * 2, EDGE * 2, gp, 'edge');
      // else の条件の文字。
      _conditionBoxes(svgEl, bb, tabBottom).forEach(function(c) {
        _addGroupHit(overlayEl, c.x - 2, c.y - 1, c.width + 4, c.height + 2, gp, 'cond');
      });
    });
  }

  // BLK-builder-20260926-1010-1: 枠 (ref) の箱の中が塗られているか。描いた側の塗りで決める: 箱と同じ位置・大きさの
  // rect に塗り (fill が none でも透明でもない) があれば塗りあり。見つからなければ塗りありとみなす (これまでどおり)。
  function _framePainted(svgEl, bb) {
    var found = false, painted = false;
    _q(svgEl, 'rect').forEach(function(r) {
      if (Math.abs(_num(r, 'x') - bb.x) > 0.6 || Math.abs(_num(r, 'y') - bb.y) > 0.6) return;
      if (Math.abs(_num(r, 'width') - bb.w) > 0.6 || Math.abs(_num(r, 'height') - bb.h) > 0.6) return;
      found = true;
      var f = String(r.getAttribute('fill') || '').trim().toLowerCase();
      var op = parseFloat(r.getAttribute('fill-opacity'));
      if (f && f !== 'none' && f !== 'transparent' && op !== 0) painted = true;
    });
    return !found || painted;
  }

  // BLK-builder-20260926-1010-1: 塗りの無い ref の箱は、中を通るライフラインが透けて見える (描いた側では線が手前)。
  // 群の枠と同じく、箱全体の枠はライフラインより奥に置き、札と見出しの行・枠線・中の文字だけを一番手前にする。
  function _addFrameFronts(svgEl, overlayEl, bb, attrs) {
    var EDGE = 3;
    var tabBottom = _frameTabBottom(svgEl, bb);
    _addFrontHit(overlayEl, bb.x - EDGE, bb.y - EDGE, bb.w + EDGE * 2, (tabBottom - bb.y) + EDGE, attrs, 'head');
    _addFrontHit(overlayEl, bb.x - EDGE, bb.y, EDGE * 2, bb.h + EDGE, attrs, 'edge');
    _addFrontHit(overlayEl, bb.x + bb.w - EDGE, bb.y, EDGE * 2, bb.h + EDGE, attrs, 'edge');
    _addFrontHit(overlayEl, bb.x - EDGE, bb.y + bb.h - EDGE, bb.w + EDGE * 2, EDGE * 2, attrs, 'edge');
    _q(svgEl, 'text').forEach(function(t) {
      var b = _bbox(t);
      if (!b) return;
      if (b.x < bb.x - 1 || b.y < tabBottom - 1 || b.x + b.width > bb.x + bb.w + 1 || b.y + b.height > bb.y + bb.h + 1) return;
      _addFrontHit(overlayEl, b.x - 2, b.y - 1, b.width + 4, b.height + 2, attrs, 'text');
    });
  }

  function _addProcSourceLine(overlayEl, bb, line, kind) {
    OB.addRect(overlayEl, bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4, {
      'data-type': 'source-line',
      'data-id': 'src:' + kind + '@' + line,
      'data-src-kind': kind,
      'data-line': String(line),
    });
  }

  // BLK-builder-20260925-0314-1: 作られた参加者 (`create`) の頭。尻 (g.participant-tail) の箱と
  // 同じ x・同じ幅で、尻より上にある裸の <rect> (参加者の <g> の外) がそれ。
  function _drawnRect(g) {
    var rs = g && g.querySelectorAll ? g.querySelectorAll('rect') : [];
    for (var i = 0; i < rs.length; i++) {
      var f = (rs[i].getAttribute('fill') || '').toLowerCase();
      if (f && f !== 'none' && parseFloat(rs[i].getAttribute('fill-opacity')) !== 0) return rs[i];
    }
    return null;
  }
  function _inParticipantGroup(el, svgEl) {
    for (var n = el.parentNode; n && n !== svgEl && n.getAttribute; n = n.parentNode) {
      if (/participant/.test(n.getAttribute('class') || '')) return true;
    }
    return false;
  }
  function _createdHeads(svgEl, tailMatches, headIds) {
    var out = [];
    if (!svgEl || !svgEl.querySelectorAll) return out;
    var bare = null;
    tailMatches.forEach(function(m) {
      if (headIds[m.item.id]) return;
      var tr = _drawnRect(m.groupEl);
      if (!tr) return;
      var tx = _num(tr, 'x'), tw = _num(tr, 'width'), ty = _num(tr, 'y');
      if (isNaN(tx) || isNaN(tw) || isNaN(ty)) return;
      if (!bare) {
        bare = Array.prototype.filter.call(_q(svgEl, 'rect'), function(r) {
          return !_inParticipantGroup(r, svgEl);
        });
      }
      for (var i = 0; i < bare.length; i++) {
        var r = bare[i];
        var x = _num(r, 'x'), w = _num(r, 'width'), y = _num(r, 'y'), h = _num(r, 'height');
        if (Math.abs(x - tx) > 0.6 || Math.abs(w - tw) > 0.6 || !(y < ty - 1)) continue;
        out.push({ item: m.item, box: { x: x, y: y, width: w, height: h } });
        break;
      }
    });
    return out;
  }

  // BLK-migrator-20260925-1732: プレビューは `newpage` で分けた 1 枚目だけを描く。2 枚目以降の
  // メッセージ・注釈・帯・群は並びの照合にも数にも入れない (参加者は全ページの頭に描かれるので残す)。
  // BLK-migrator-20260929-1300: 描かれない物も並びの照合と数から外す。
  //   - `!ifdef` / `!if` の描かれない枝の行 (meta.deadLines)。参加者は、宣言の行が描かれない枝でも、
  //     描かれる枝のメッセージに出てくれば描かれるので残す
  //   - `hide unlinked` の図で、描かれるメッセージを 1 本も持たない参加者
  function _firstPage(parsedData) {
    var meta = (parsedData && parsedData.meta) || {};
    var end = meta.newpageLine;
    var dead = meta.deadLines || null;
    if (!end && !dead && !meta.hideUnlinked) return parsedData;
    function live(x) { return !dead || !x.line || !dead[x.line]; }
    function on(x) { return live(x) && (x.kind === 'participant' || !end || !x.line || x.line < end); }
    var out = {};
    Object.keys(parsedData).forEach(function(k) { out[k] = parsedData[k]; });
    ['relations', 'groups', 'returns'].forEach(function(k) {
      if (Array.isArray(parsedData[k])) out[k] = parsedData[k].filter(on);
    });
    var used = {};
    (out.relations || []).forEach(function(r) { used[r.from] = 1; used[r.to] = 1; });
    if (Array.isArray(parsedData.elements)) {
      out.elements = parsedData.elements.filter(function(x) {
        if (x.kind !== 'participant') return on(x);
        if (meta.hideUnlinked && !used[x.id]) return false;
        return live(x) || !!used[x.id];
      });
    }
    return out;
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl, dslText) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;
    parsedData = _firstPage(parsedData);
    _chromeSkip = (OB.chromeElements && dslText) ? OB.chromeElements(svgEl, dslText) : [];
    var pageEnd = (parsedData.meta && parsedData.meta.newpageLine) || Infinity;

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
    var createLines = (parsedData.meta && parsedData.meta.createLines) || null;

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

    // BLK-migrator-20260924-1332: 手続きで描いた図 (class の無い SVG) は、枠・区切り・遅延を先に見分けておく。
    var procScene = null, procArrows = null;
    if (participants.length && !svgEl.querySelector('g.participant-head') && !svgEl.querySelector('g.message')) {
      procArrows = _procArrows(svgEl);
      procScene = _procStructures(svgEl, dslText);
    }
    // BLK-builder-20260925-1552-3: ref / 区切り / 遅延は、ふつうの図 (参加者・メッセージに class が付く SVG) でも
    // class の無い <rect>/<path>/<line>/<text> で描かれる。手続きの図と同じく描かれた形から見分け、書かれた行を指す枠を置く
    // (ふつうの図では ref も区切りも遅延も枠が 1 つも出ていなかった)。枠は最後にまとめて手前に置く
    // (ref の箱・区切りの帯はライフラインの上に描かれ、先に置くとライフラインに吸われる)。
    var scene = procScene || (participants.length && dslText ? _procStructures(svgEl, dslText) : null);
    var srcHits = [];
    var partMatches = _matchParts('g.participant-head');
    if (!partMatches.length && participants.length && !svgEl.querySelector('g.participant-head')) {
      partMatches = _procParticipants(svgEl, participants, procArrows || _procArrows(svgEl), createLines);
      partMatches.forEach(function(m) {
        OB.addRect(overlayEl, m.box.x - 4, m.box.y - 4, m.box.w + 8, m.box.h + 8, {
          'data-type': 'participant', 'data-id': m.item.id, 'data-line': m.line || m.item.line,
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
    var tailMatches = _matchParts('g.participant-tail');
    tailMatches.forEach(function(m) {
      var bb = _partBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });
    // BLK-builder-20260925-0314-1: `create X` / `create participant "…" as X` の参加者は、PlantUML が
    // 頭を g.participant-head に入れず、作られたメッセージの高さに裸の <rect>+<text> で描く
    // (尻は g.participant-tail に入る)。尻と同じ幅・同じ x の箱を上に探して頭の枠にする。
    var headIds = {};
    partMatches.forEach(function(m) { headIds[m.item.id] = true; });
    var createdHeads = _createdHeads(svgEl, tailMatches, headIds);
    createdHeads.forEach(function(c) {
      OB.addRect(overlayEl, c.box.x - 8, c.box.y - 4, c.box.width + 16, c.box.height + 8, {
        'data-type': 'participant',
        'data-id': c.item.id,
        'data-line': c.item.line,
      });
    });
    // 参加者の数は「頭・尻・作られた頭のどれかで当たった人数」で数える (作られた参加者は頭の <g> を持たない)。
    var partSeen = {};
    var partHitCount = 0;
    partMatches.concat(tailMatches, createdHeads).forEach(function(m) {
      if (partSeen[m.item.id]) return;
      partSeen[m.item.id] = true; partHitCount++;
    });
    // ライフラインは頭・尻と同じ data-entity-uid を持つ。名前 (伏せ字になる日本語名) より先に uid で当てる。
    var uidToPart = {};
    partMatches.concat(tailMatches).forEach(function(m) {
      var uid = m.groupEl && m.groupEl.getAttribute && m.groupEl.getAttribute('data-entity-uid');
      if (uid && !uidToPart[uid]) uidToPart[uid] = m.item;
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
      var lgUid = lg.getAttribute && lg.getAttribute('data-entity-uid');
      if (lgUid && uidToPart[lgUid]) {
        id = uidToPart[lgUid].id;
        lineNum = uidToPart[lgUid].line;
      }
      if (id === null && lgName) {
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

    // BLK-builder-20260925-0314-1: class の無い SVG (teoz・手続きの図) もライフラインを
    // `<g><title>表示名</title><rect 透明/><line 点線/></g>` で描く。表示名か別名で参加者に当てて枠を置く。
    if (!lifelines.length) {
      // BLK-human-20260925-1500: 表示名は ASCII 以外が伏せ字になるので、列の並びも使って当てる (_lifelineOwners)。
      // create した参加者は線が頭の上端から始まるので、線の枠は頭の下から (頭を指すと参加者が選ばれる)。
      var byCol = _procParticipantsByLifeline(svgEl, participants, createLines) || { cols: [], owner: [] };
      byCol.cols.forEach(function(c, i) {
        var owner = byCol.owner[i];
        if (!owner) return;
        var top = c.headBox && c.headBox.y >= c.top - 1.5 ? c.headBox.y + c.headBox.h : c.top;
        // 作り直した頭 (_reHeads) の上は線の枠を切る (頭を指すとその回の参加者が選ばれる)。
        (c.reHeads || []).concat([{ box: { y: c.bottom, h: 0 } }]).forEach(function(h) {
          var bottom = Math.min(c.bottom, h.box.y);
          if (bottom - top >= 2) {
            OB.addRect(overlayEl, c.x - 6, top, 12, bottom - top, {
              'data-type': 'lifeline', 'data-id': owner.id, 'data-line': owner.line,
            });
          }
          top = Math.max(top, h.box.y + h.box.h);
        });
      });
    }

    // Feature #8: group block (alt/opt/loop/par/break/critical/group) の overlay rect。
    // PlantUML v1.2026.x の SVG は group 用の class を付けないが、block bbox を
    // <rect fill="none" stroke="#000000"> として描画する (同一 bbox が 2 回出る)。
    // 同一座標を de-dup して document 順に並べ、parsedData.groups と 1:1 対応させる。
    var groups = (parsedData.groups || []).slice().sort(function(a, b) {
      return (a.line || 0) - (b.line || 0);
    });
    var groupHitFrames = [];
    if (groups.length > 0) {
      var allRects = _q(svgEl, 'rect[fill="none"]');
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
        if (i + 1 < pageEnd && /^\s*ref\s+over\b/i.test(raw)) frames.push({ group: null, line: i + 1 });
      });
      frames.sort(function(a, b) { return a.line - b.line; });
      // BLK-migrator-20260924-1332: 手続きの図では ref の枠が塗り付き (skinparam) で出て、塗りなしの rect だけを
      // 数えると枠の並びがずれる。見出しの五角形が角に付いた rect を枠として数え、数が合えばそちらで当てる。
      if (procScene && procScene.frames.length === frames.length) bboxes = procScene.frames;
      else if (scene && bboxes.length !== frames.length && scene.frames.length === frames.length) bboxes = scene.frames;
      var n = Math.min(bboxes.length, frames.length);
      var emitted = 0;
      groupHitFrames = [];
      for (var gi = 0; gi < n; gi++) {
        var bb = bboxes[gi];
        var gp = frames[gi].group;
        if (!gp) {
          // ref の枠は、フォームで直せない記法としてその行を指す (黙って何も出さない、をやめる)。
          srcHits.push({ box: bb, line: frames[gi].line, kind: 'ref' });
          continue;
        }
        emitted++;
        groupHitFrames.push({ bb: bb, group: gp });
        OB.addRect(overlayEl, bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4, {
          'data-type': 'group',
          'data-id': gp.id,
          'data-line': gp.line,
        });
      }
      OB.warnIfMismatch('group', groups.length, emitted);
    } else if (scene) {
      var refLines = [];
      String(dslText || '').split('\n').forEach(function(raw, i) {
        if (i + 1 < pageEnd && /^\s*ref\s+over\b/i.test(raw)) refLines.push(i + 1);
      });
      if (refLines.length === scene.frames.length) {
        scene.frames.forEach(function(bb, i) { srcHits.push({ box: bb, line: refLines[i], kind: 'ref' }); });
      }
    }
    // BLK-migrator-20260924-1332: 区切り (`== x ==`) と遅延 (`... x ...`) にもその行を指す枠を置く。
    if (scene) {
      scene.dividers.forEach(function(d) { srcHits.push({ box: d.box, line: d.line, kind: 'divider' }); });
      scene.delays.forEach(function(d) { srcHits.push({ box: d.box, line: d.line, kind: 'delay' }); });
      // BLK-migrator-20260929-2158: ページの境目の破線 (`newpage`) も区切りと同じくその行を指す
      (scene.rules || []).forEach(function(d) { srcHits.push({ box: d.box, line: d.line, kind: 'newpage' }); });
    }
    // BLK-migrator-20260923-1409: 群の枠は内側全体を覆うので、先に置いたライフラインが
    // その下に隠れ、alt の中のライフラインを指すと alt が選ばれていた。細いライフラインを
    // 群の枠より手前に出す (メッセージ・注釈はこの後に足すので、さらに手前に来る)。
    // BLK-builder-20260926-1010-1: 塗りの無い ref の箱は群と同じくライフラインより奥 (札・枠線・文字は最後に手前へ)。
    srcHits.forEach(function(h) {
      if (h.kind !== 'ref' || _framePainted(svgEl, h.box)) return;
      _addProcSourceLine(overlayEl, h.box, h.line, h.kind);
      h.behind = true;
    });
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
      // BLK-migrator-20260925-1800: 床は最初の矢印より上にある頭 (図の上端に並ぶ頭) の下端だけで決める。`create` / `**` で
      // 途中に作られた参加者の頭は、作られたメッセージの高さに描かれる。それも床に入れると床が下がり、その頭より上の
      // メッセージの文字が拾われず枠が出なかった (1.2026.8 からは全ての sequence 図が class の無い SVG でここを通る)。
      var firstArrowTop = Infinity;
      (procArrows || _procArrows(svgEl)).forEach(function(a) { if (a.top < firstArrowTop) firstArrowTop = a.top; });
      var headFloor = -Infinity;
      partMatches.forEach(function(m) {
        if (!m.box || m.box.y + m.box.h > firstArrowTop) return;
        headFloor = Math.max(headFloor, m.box.y + m.box.h);
      });
      // BLK-builder-20260925-1835-2: `return` の矢印も並びに入れる (文言の無いメッセージと return が並ぶ区間で
      // 本数が合わず、その区間のメッセージが当たらなかった)。return の枠は出さない。
      procMsgs = _procMessages(svgEl, msgItems, headFloor, procScene).filter(function(m) { return m.item.kind !== 'return'; });
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
    _addLifelineFronts(overlayEl, msgMatches, procMsgs);
    _raiseHeadsOverMessages(overlayEl);

    // Warn on silent divergence — early signal when SVG structure changes
    // (PlantUML 新版 / カスタム skin) and our selector/offset assumptions break.
    OB.warnIfMismatch('participant', participants.length, Math.max(partMatches.length, partHitCount));
    OB.warnIfMismatch('message', parsedData.relations.length, msgMatches.length + procMsgs.length);

    // Notes: PlantUML 1.2026.x では <g class="note"> を出さず、bare <path>+<text> で描画される。
    // data-source-line も付かないため、selector マッチは成立せず placeholder rect を挿入する。
    // (overlay は data-line が正しければ click hit/jump が機能する。座標精度は後続 task で改善。)
    var notes = parsedData.elements.filter(function(e) { return e.kind === 'note'; });
    // BLK-migrator-20260929-0459: 描いた紙は、読めない書き方の注釈の行にも当てる (紙を黙って捨てない)。
    // 読んだ注釈と並べて行の順にし、文字で当て、残りの紙を並び順で残りの行に当てる。
    var extraNotes = _unparsedNoteLines(dslText, notes, parsedData.meta);
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
      var usedPapers = [];
      var boxOf = {};
      var allNotes = notes.concat(extraNotes).sort(function(a, b) { return (a.line || 0) - (b.line || 0); });
      allNotes.forEach(function(n) { boxOf[n.id] = _findNoteShape(svgEl, n, usedTexts, usedPapers); });
      // 文字で当たらない注釈 (1 行目が画像・区切り線だけ等) は、残った紙を文書順に
      var restPapers = (OB.notePapers ? OB.notePapers(svgEl) : []).filter(function(p) { return usedPapers.indexOf(p.el) < 0; });
      allNotes.forEach(function(n) {
        if (!boxOf[n.id] && restPapers.length) boxOf[n.id] = restPapers.shift().box;
      });
      // 読めない書き方の行は、紙に当たったものだけ枠にする (当たらなければ出さない。仮の枠を置かない)。
      extraNotes.forEach(function(n) {
        var eb = boxOf[n.id];
        if (!eb) return;
        OB.addRect(overlayEl, eb.x - 2, eb.y - 2, eb.width + 4, eb.height + 4, {
          'data-type': 'note', 'data-id': n.id, 'data-line': n.line,
        });
      });
      notes.forEach(function(n) {
        // BLK-human-20260916-0900: 描かれた注釈の形 (note=path / hnote=polygon / rnote=rect) を
        // 本文の 1 行目から探し、その矩形全体を当たり判定にする (どこを押しても選べる)。
        var shapeBox = boxOf[n.id];
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
    var zones = bandZones(svgEl, dslText);
    // BLK-builder-20260925-0314-1: 帯はふつうライフラインの枠の中に収まり、指すとその参加者のライフラインが出る。
    // `destroy` した参加者を `create` し直すと PlantUML は作り直した後のライフラインしか描かず、それより上の帯は
    // どの枠にも入らない。帯の矩形そのものをその参加者のライフラインの枠にする。
    var lifelineRects = Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type="lifeline"]'));
    zones.forEach(function(z) {
      var cx = z.bar.x + z.bar.w / 2, cy = z.bar.y + z.bar.h / 2;
      var covered = lifelineRects.some(function(r) {
        if (r.getAttribute('data-id') !== z.band.target) return false;
        var rx = parseFloat(r.getAttribute('x')), ry = parseFloat(r.getAttribute('y'));
        var rw = parseFloat(r.getAttribute('width')), rh = parseFloat(r.getAttribute('height'));
        return cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh;
      });
      if (covered) return;
      var owner = null;
      participants.forEach(function(p) { if (!owner && p.id === z.band.target) owner = p; });
      if (!owner) return;
      OB.addRect(overlayEl, z.bar.x - 1, z.bar.y, z.bar.w + 2, z.bar.h, {
        'data-type': 'lifeline', 'data-id': owner.id, 'data-line': owner.line,
      });
    });
    zones.forEach(function(z) {
      var r = OB.addRect(overlayEl, z.bar.x, z.bar.y, z.bar.w, z.bar.h, {
        'data-type': 'band-zone',
        'data-part': z.band.target,
        'data-line': z.band.activateLine,
        'data-band-end': z.band.deactivateLine,
      });
      r.style.pointerEvents = 'none';
      r.classList.remove('selectable');
    });

    // BLK-owner-20260924-0637-2: 枠の札・見出し・枠線・条件の文字は一番手前に置く。ライフラインの当たり
    // (メッセージの間の細い区間はメッセージより後に足される) より奥だと、札を押してもライフラインに吸われる。
    // 帯は細く中身が隠れないので、ここで塞ぐのは枠の縁 (幅 6px) と見出しの行だけ。
    srcHits.forEach(function(h) {
      if (!h.behind) { _addProcSourceLine(overlayEl, h.box, h.line, h.kind); return; }
      _addFrameFronts(svgEl, overlayEl, h.box, {
        'data-type': 'source-line', 'data-id': 'src:' + h.kind + '@' + h.line,
        'data-src-kind': h.kind, 'data-line': String(h.line),
      });
    });
    _addGroupHits(svgEl, overlayEl, groupHitFrames);
    _markStatementEnds(overlayEl, parsedData, dslText);

    var noteRectCount = overlayEl.querySelectorAll('rect[data-type="note"]').length;
    var actRectCount = overlayEl.querySelectorAll('rect[data-type="activation"]').length;
    var groupRectCount = overlayEl.querySelectorAll('rect[data-type="group"]').length;
    var groupsInModel = (parsedData.groups || []).length;
    return {
      matched: {
        // head 基準。tail rect は重複なので「何人マッチしたか」には加算しない。
        participant: Math.max(partMatches.length, partHitCount),
        message: msgMatches.length + procMsgs.length,
        note: noteRectCount,
        activation: actRectCount,
        group: groupRectCount,
      },
      unmatched: {
        participant: participants.length - Math.max(partMatches.length, partHitCount),
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
    var rects = _q(svgEl, 'rect');
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
      // BLK-builder-20260925-0314-1: `create` で作られた参加者の頭も <title> 付きの裸の <g> に入る。帯は幅 10px ほどなので、幅のある箱は帯ではない。
      if (w > 30) return;
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
    // BLK-builder-20260925-0314-1: 帯の <title> は表示名 (`participant "Session Manager" as SM` なら
    // `Session Manager`)。DSL の帯は別名で持つので、表示名から別名へ引き直す。
    var aliasOf = {};
    var SEQ = window.MA.modules && window.MA.modules.plantumlSequence;
    if (SEQ && SEQ.parseSequence) {
      (SEQ.parseSequence(dslText).elements || []).forEach(function(e) {
        if (e.kind !== 'participant' || !e.label || e.label === e.id) return;
        var lb = String(e.label).replace(/\\n/g, ' ');
        if (!byPart[e.label] && aliasOf[e.label] === undefined) aliasOf[e.label] = e.id;
        if (!byPart[lb] && aliasOf[lb] === undefined) aliasOf[lb] = e.id;
      });
    }
    // BLK-human-20260925-1500: PlantUML 1.2026.7 からは帯の <g> の <title> が空。帯の真ん中に最も近いライフラインの列
    // (列 → 参加者は _lifelineOwners) で、どの参加者の帯かを決める。
    if (bars.some(function(b) { return !b.part; }) && SEQ && SEQ.parseSequence) {
      var parts = (SEQ.parseSequence(dslText).elements || []).filter(function(e) { return e.kind === 'participant'; });
      var cols = _procLifelines(svgEl);
      var owners = _lifelineOwners(cols, parts);
      bars.forEach(function(bar) {
        if (bar.part) return;
        var cx = bar.x + bar.w / 2, best = -1, bd = Infinity;
        cols.forEach(function(c, i) { var d = Math.abs(c.x - cx); if (d < bd) { bd = d; best = i; } });
        if (best >= 0 && bd <= 24 && owners[best]) bar.part = owners[best].id;
      });
    }
    var used = {};
    var out = [];
    bars.forEach(function(bar) {
      if (!byPart[bar.part] && aliasOf[bar.part] !== undefined) bar = Object.assign({}, bar, { part: aliasOf[bar.part] });
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

  // BLK-human-20260928-2255-2: 注釈・枠 (alt など)・ref は複数行にまたがる。挿入の当たりが「その後ろ」を
  // 指すとき、始まりの行の後ろ (= 注釈や枠の中) ではなく終わりの行の後ろに入れられるよう、終わりの行を持たせる。
  function _markStatementEnds(overlayEl, parsedData, dslText) {
    var endOf = { note: {}, group: {}, 'source-line': {} };
    ((parsedData && parsedData.elements) || []).forEach(function(e) {
      if (e.kind === 'note' && e.endLine > e.line) endOf.note[e.line] = e.endLine;
    });
    ((parsedData && parsedData.groups) || []).forEach(function(g) {
      if (g.endLine > g.line) endOf.group[g.line] = g.endLine;
    });
    var lines = String(dslText || '').split('\n');
    lines.forEach(function(raw, i) {
      // 1 行の `ref over A : 本文` は終わりの行を持たない。`ref over A` … `end ref` だけ。
      if (!/^\s*ref\s+over\b/i.test(raw) || raw.indexOf(':') >= 0) return;
      for (var j = i + 1; j < lines.length; j++) {
        if (/^\s*end\s*ref\b/i.test(lines[j])) { endOf['source-line'][i + 1] = j + 1; return; }
      }
    });
    Object.keys(endOf).forEach(function(type) {
      Array.prototype.forEach.call(overlayEl.querySelectorAll('rect[data-type="' + type + '"]'), function(r) {
        var end = endOf[type][parseInt(r.getAttribute('data-line'), 10)];
        if (end) r.setAttribute('data-line-end', String(end));
      });
    });
  }

  // 挿入の当たりの目印。メッセージは矢印の高さ (枠の真ん中) を境にし、注釈・区切り線・遅延・ref・枠は
  // 描かれた箱の下端を境にする (箱の下を押したら、その後ろ = 終わりの行の後ろ)。
  var INSERT_MARK_TYPES = ['message', 'note', 'group', 'source-line'];

  function _insertMarks(overlayEl) {
    var byKey = {};
    var marks = [];
    Array.prototype.forEach.call(overlayEl.querySelectorAll('rect[data-type]'), function(r) {
      var type = r.getAttribute('data-type');
      if (INSERT_MARK_TYPES.indexOf(type) < 0) return;
      var line = parseInt(r.getAttribute('data-line'), 10);
      // data-line が付いていない rect (描き直しの途中など) は挿入先にできない。
      if (isNaN(line)) return;
      var rx = parseFloat(r.getAttribute('x')), ry = parseFloat(r.getAttribute('y'));
      var rw = parseFloat(r.getAttribute('width')), rh = parseFloat(r.getAttribute('height'));
      if (isNaN(ry) || isNaN(rh)) return;
      if (type !== 'message' && !(rw > 1 && rh > 1)) return;   // 位置の分からない注釈の 1×1 の代わり
      var end = parseInt(r.getAttribute('data-line-end'), 10);
      if (type === 'message') {
        marks.push({ line: line, endLine: line, top: ry + rh / 2, y: ry + rh / 2,
          // 隣のメッセージの矢印が占める横幅。ガイド線をこの列に収めるために返す
          // (図の端から端まで伸びる線は、どのメッセージの隙間を指しているのか読めない)。
          rectX: rx, rectWidth: rw });
        return;
      }
      // 注釈・枠は当たりが複数の rect (見出し・縁・文字) に分かれるので、1 つの箱にまとめる。
      var key = type + '@' + line;
      var m = byKey[key];
      if (!m) {
        m = byKey[key] = { line: line, endLine: isNaN(end) ? line : end, top: ry, y: ry + rh,
          x0: rx, x1: rx + rw };
        marks.push(m);
      }
      m.top = Math.min(m.top, ry);
      m.y = Math.max(m.y, ry + rh);
      if (!isNaN(rx) && !isNaN(rw)) { m.x0 = Math.min(m.x0, rx); m.x1 = Math.max(m.x1, rx + rw); }
    });
    marks.forEach(function(m) {
      if (m.rectX === undefined && !isNaN(m.x0) && !isNaN(m.x1)) { m.rectX = m.x0; m.rectWidth = m.x1 - m.x0; }
    });
    return marks;
  }

  function resolveInsertLine(overlayEl, x, y) {
    // x は activity モジュールとの signature 合わせだけでなく、帯の内外の判定
    // (resolveBandZone) にも使う。行の決定そのものは 1 列のライフラインなので y だけで足りる。
    if (!overlayEl) return null;
    var items = _insertMarks(overlayEl);
    if (items.length === 0) return null;
    var zoneHint = resolveBandZone(overlayEl, x, y);
    // BLK-human-20260928-2255-2: 押した点より上にある目印のうち、境が一番下のものの後ろ。メッセージだけを
    // 見ていたので、末尾の区切り線・注釈・遅延・ref・枠の下を押しても最後のメッセージの後ろ (それらより前) に入った。
    // 境が同じ高さなら DSL で後に書いた方 (外側の枠の end など) の後ろ。
    var below = null;
    items.forEach(function(it) {
      if (!(y > it.y)) return;
      if (!below || it.y > below.y || (it.y === below.y && it.endLine > below.endLine)) below = it;
    });
    if (below) return _hit({ line: below.endLine, rectX: below.rectX, rectWidth: below.rectWidth }, 'after', zoneHint);
    // 全部の目印より上 → 一番上の目印の前
    var top = null;
    items.forEach(function(it) {
      if (!top || it.top < top.top || (it.top === top.top && it.line < top.line)) top = it;
    });
    return _hit(top, 'before', zoneHint);
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
    markStatementEnds: _markStatementEnds,
  };
})();
