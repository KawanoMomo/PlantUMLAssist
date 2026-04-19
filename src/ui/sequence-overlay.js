'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {

  var SVG_NS = 'http://www.w3.org/2000/svg';

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
    // 1×1 placeholder (note/activation の暫定座標) は誤クリック誘発を避け pointer-events: none
    var isPlaceholder = (w === 1 && h === 1);
    rect.style.pointerEvents = isPlaceholder ? 'none' : 'all';
    Object.keys(attrs).forEach(function(k) {
      rect.setAttribute(k, attrs[k]);
    });
    overlayEl.appendChild(rect);
    return rect;
  }

  function _matchByDataSourceLine(svgEl, parsedItems, groupSelector, offset) {
    // PlantUML SVG が data-source-line を持つ <g> を検索し、
    // parsedItems の line 番号と一致する <g> を取り出す。
    // parserLine = svgLine + offset (offset = startUmlLine。@startuml 不在時は 0)
    var matches = [];
    var groups = svgEl.querySelectorAll(groupSelector + '[data-source-line]');
    var lineToItem = {};
    parsedItems.forEach(function(item) { lineToItem[item.line] = item; });
    Array.prototype.forEach.call(groups, function(g) {
      var svgLine = parseInt(g.getAttribute('data-source-line'), 10);
      var parserLine = svgLine + offset;
      var item = lineToItem[parserLine];
      if (item) {
        matches.push({ item: item, groupEl: g });
      }
    });
    return matches;
  }

  function _matchByOrder(svgEl, parsedItems, groupSelector) {
    // Fallback: v1.2026.x 以降 data-source-line が付かない <g> 向け。
    // parsedItems の順序と SVG 出現順序で 1:1 対応させる。
    var matches = [];
    var allGroups = svgEl.querySelectorAll(groupSelector);
    var n = Math.min(allGroups.length, parsedItems.length);
    for (var i = 0; i < n; i++) {
      matches.push({ item: parsedItems[i], groupEl: allGroups[i] });
    }
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

  function _pickBestOffset(svgEl, parsedItems, groupSelector, candidates) {
    // 候補 offset を順に試し、最もマッチ数が多いものを選ぶ。
    // tie の場合は配列の先頭を優先 (= 期待値順に並べておく)。
    var best = { matches: [], offset: candidates[0] };
    for (var i = 0; i < candidates.length; i++) {
      var m = _matchByDataSourceLine(svgEl, parsedItems, groupSelector, candidates[i]);
      if (m.length > best.matches.length) {
        best = { matches: m, offset: candidates[i] };
      }
    }
    // Bug B5 fix: data-source-line 無しの PlantUML 出力 (v1.2026.x 以降の
    // g.message / g.participant-*) ではどの offset でも 0 マッチになる。
    // その場合 selector + 出現順で 1:1 fallback matching を試みる。
    if (best.matches.length === 0 && parsedItems.length > 0) {
      var fb = _matchByOrder(svgEl, parsedItems, groupSelector);
      if (fb.length > 0) {
        best = { matches: fb, offset: 0, fallback: 'order' };
      }
    }
    return best;
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;

    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);

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
    var partBest = _pickBestOffset(svgEl, participants, 'g.participant-head', candidates);
    var partMatches = partBest.matches;
    partMatches.forEach(function(m) {
      var bb = _gBBox(m.groupEl);
      if (!bb) return;
      _addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    var msgBest = _pickBestOffset(svgEl, parsedData.relations, 'g.message', candidates);
    var msgMatches = msgBest.matches;
    msgMatches.forEach(function(m) {
      var bb = _gBBox(m.groupEl);
      if (!bb) return;
      _addRect(overlayEl, bb.x - 4, bb.y - 4, (bb.width || 60) + 8, (bb.height || 14) + 8, {
        'data-type': 'message',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    // Warn on silent divergence — early signal when SVG structure changes
    // (PlantUML 新版 / カスタム skin) and our selector/offset assumptions break.
    _warnIfMismatch('participant', participants.length, partMatches.length);
    _warnIfMismatch('message', parsedData.relations.length, msgMatches.length);

    // Notes: PlantUML 1.2026.x では <g class="note"> を出さず、bare <path>+<text> で描画される。
    // data-source-line も付かないため、selector マッチは成立せず placeholder rect を挿入する。
    // (overlay は data-line が正しければ click hit/jump が機能する。座標精度は後続 task で改善。)
    var notes = parsedData.elements.filter(function(e) { return e.kind === 'note'; });
    var notePicked = _pickBestOffset(svgEl, notes, 'g.note', candidates);
    if (notePicked.matches.length > 0) {
      notePicked.matches.forEach(function(m) {
        var bb = _gBBox(m.groupEl);
        if (!bb) return;
        _addRect(overlayEl, bb.x - 8, bb.y - 6, (bb.width || 60) + 16, (bb.height || 14) + 12, {
          'data-type': 'note',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });
    } else {
      notes.forEach(function(n) {
        _addRect(overlayEl, 0, 0, 1, 1, {
          'data-type': 'note',
          'data-id': n.id,
          'data-line': n.line,
        });
      });
    }
    _warnIfMismatch('note', notes.length, overlayEl.querySelectorAll('rect[data-type="note"]').length);

    // Activations: PlantUML SVG では activation バーは <g><title>...</title><rect/></g> として
    // class も data-source-line も付かない。selector が当たらないため placeholder rect 戦略で対応。
    var activations = parsedData.elements.filter(function(e) { return e.kind === 'activation'; });
    var actPicked = _pickBestOffset(svgEl, activations, 'g.activation', candidates);
    if (actPicked.matches.length > 0) {
      actPicked.matches.forEach(function(m) {
        var bb = _gBBox(m.groupEl);
        if (!bb) return;
        _addRect(overlayEl, bb.x - 4, bb.y, (bb.width || 12) + 8, (bb.height || 16), {
          'data-type': 'activation',
          'data-id': m.item.action + '-' + m.item.target + '-' + m.item.line,
          'data-line': m.item.line,
        });
      });
    } else {
      activations.forEach(function(a) {
        _addRect(overlayEl, 0, 0, 1, 1, {
          'data-type': 'activation',
          'data-id': a.action + '-' + a.target + '-' + a.line,
          'data-line': a.line,
        });
      });
    }
    _warnIfMismatch('activation', activations.length, overlayEl.querySelectorAll('rect[data-type="activation"]').length);

    var noteRectCount = overlayEl.querySelectorAll('rect[data-type="note"]').length;
    var actRectCount = overlayEl.querySelectorAll('rect[data-type="activation"]').length;
    return {
      matched: {
        participant: partMatches.length,
        message: msgMatches.length,
        note: noteRectCount,
        activation: actRectCount,
      },
      unmatched: {
        participant: participants.length - partMatches.length,
        message: parsedData.relations.length - msgMatches.length,
        note: notes.length - noteRectCount,
        activation: activations.length - actRectCount,
      },
    };
  }

  function _warnIfMismatch(kind, modelCount, matchedCount) {
    if (modelCount !== matchedCount) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[sequence-overlay] ' + kind + ' count mismatch: model=' + modelCount + ' matched=' + matchedCount);
      }
    }
  }

  function setSelectedHighlight(overlayEl, selData) {
    if (!overlayEl) return;
    var all = overlayEl.querySelectorAll('rect.seq-overlay-target');
    Array.prototype.forEach.call(all, function(r) { r.classList.remove('selected'); });
    if (!selData || selData.length === 0) return;
    selData.forEach(function(s) {
      var selector = 'rect[data-type="' + s.type + '"]';
      if (s.line !== undefined && s.line !== null) selector += '[data-line="' + s.line + '"]';
      var rects = overlayEl.querySelectorAll(selector);
      Array.prototype.forEach.call(rects, function(r) { r.classList.add('selected'); });
    });
  }

  function resolveInsertLine(overlayEl, y) {
    if (!overlayEl) return null;
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    if (msgRects.length === 0) return null;
    var items = Array.prototype.map.call(msgRects, function(r) {
      return {
        line: parseInt(r.getAttribute('data-line'), 10),
        y: parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2,
      };
    }).sort(function(a, b) { return a.y - b.y; });
    // y がどの rect の y より下か判定: 下端から遡って最初に「rect.y < y」なら after その rect
    for (var i = items.length - 1; i >= 0; i--) {
      if (y > items[i].y) return { line: items[i].line, position: 'after' };
    }
    // 全 rect より上 → 最上位 rect の before
    return { line: items[0].line, position: 'before' };
  }

  return {
    buildSequenceOverlay: buildSequenceOverlay,
    setSelectedHighlight: setSelectedHighlight,
    resolveInsertLine: resolveInsertLine,
  };
})();
