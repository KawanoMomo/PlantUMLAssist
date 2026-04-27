'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlState = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
  var OB = window.MA.overlayBuilder;
  var ID = RP.IDENTIFIER;

  var STATE_RE = new RegExp(
    '^state\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*(\\{)?\\s*$'
  );

  var TRANSITION_RE = new RegExp(
    '^(\\[\\*\\]|' + ID + ')\\s*-->\\s*(\\[\\*\\]|' + ID + ')(?:\\s*:\\s*(.*))?\\s*$'
  );

  var NOTE_INLINE_RE = new RegExp(
    '^note\\s+(left|right)\\s+of\\s+(' + ID + ')\\s*:\\s*(.*)$',
    'i'
  );
  var NOTE_BLOCK_OPEN_RE = new RegExp(
    '^note\\s+(left|right)\\s+of\\s+(' + ID + ')\\s*$',
    'i'
  );
  var END_NOTE_RE = /^end\s+note\s*$/i;

  function _parseTransitionLabel(label) {
    if (!label) return { trigger: null, guard: null, action: null };
    var trimmed = label.trim();
    var actionMatch = trimmed.match(/^(.*?)\s*\/\s*(.+)$/);
    var action = null;
    var rest = trimmed;
    if (actionMatch) {
      action = actionMatch[2].trim();
      rest = actionMatch[1].trim();
    }
    var guardMatch = rest.match(/^(.*?)\s*\[(.+?)\]\s*$/);
    var guard = null;
    var trigger = rest;
    if (guardMatch) {
      guard = guardMatch[2].trim();
      trigger = guardMatch[1].trim();
    }
    return {
      trigger: trigger || null,
      guard: guard || null,
      action: action || null,
    };
  }

  function parse(text) {
    var result = {
      meta: { title: '', startUmlLine: null },
      states: [],
      transitions: [],
      notes: [],
    };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var openCompositeStack = [];
    var openNote = null;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var rawLine = lines[i];
      var trimmed = rawLine.trim();

      if (openNote) {
        if (END_NOTE_RE.test(trimmed)) {
          result.notes.push({
            kind: 'note',
            id: '__n_' + result.notes.length,
            position: openNote.position,
            targetId: openNote.targetId,
            text: openNote.bodyLines.join('\n'),
            line: openNote.startLine,
            endLine: lineNum,
          });
          openNote = null;
          continue;
        }
        openNote.bodyLines.push(rawLine.replace(/^  /, ''));
        continue;
      }

      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;
      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      // Closing brace for composite
      if (trimmed === '}' && openCompositeStack.length > 0) {
        var closing = openCompositeStack.pop();
        closing.endLine = lineNum;
        continue;
      }

      var sm = trimmed.match(STATE_RE);
      if (sm) {
        var sid, slabel;
        if (sm[2] !== undefined) { sid = sm[2]; slabel = sm[1]; }
        else { sid = sm[3]; slabel = sm[4] !== undefined ? sm[4] : sm[3]; }
        var stereotype = sm[5] ? sm[5].toLowerCase() : null;
        var hasBlock = !!sm[6];
        var parentId = openCompositeStack.length > 0
          ? openCompositeStack[openCompositeStack.length - 1].id : null;
        var qid = parentId ? parentId + '.' + sid : sid;
        var st = {
          kind: stereotype === 'choice' ? 'choice'
            : stereotype === 'history' ? 'history'
            : stereotype === 'historydeep' ? 'historyDeep'
            : 'state',
          id: qid,
          label: slabel,
          stereotype: stereotype,
          parentId: parentId,
          line: lineNum,
          endLine: lineNum,
        };
        result.states.push(st);
        if (hasBlock) openCompositeStack.push(st);
        continue;
      }

      var tmt = trimmed.match(TRANSITION_RE);
      if (tmt) {
        var lbl = tmt[3] ? tmt[3].trim() : null;
        var parts = _parseTransitionLabel(lbl);
        result.transitions.push({
          id: '__t_' + result.transitions.length,
          from: tmt[1],
          to: tmt[2],
          label: lbl,
          trigger: parts.trigger,
          guard: parts.guard,
          action: parts.action,
          line: lineNum,
        });
        continue;
      }

      var nim = trimmed.match(NOTE_INLINE_RE);
      if (nim) {
        result.notes.push({
          kind: 'note',
          id: '__n_' + result.notes.length,
          position: nim[1].toLowerCase(),
          targetId: nim[2],
          text: nim[3],
          line: lineNum,
          endLine: lineNum,
        });
        continue;
      }
      var nbm = trimmed.match(NOTE_BLOCK_OPEN_RE);
      if (nbm) {
        openNote = {
          startLine: lineNum,
          position: nbm[1].toLowerCase(),
          targetId: nbm[2],
          bodyLines: [],
        };
        continue;
      }
    }
    return result;
  }

  function fmtState(id, label, stereotype) {
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + id : id;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'state ' + labelPart + stereoPart;
  }

  function fmtTransition(from, to, trigger, guard, action) {
    var labelParts = [];
    if (trigger) labelParts.push(trigger);
    if (guard) labelParts.push('[' + guard + ']');
    if (action) labelParts.push('/ ' + action);
    var labelStr = labelParts.length > 0 ? ' : ' + labelParts.join(' ') : '';
    return from + ' --> ' + to + labelStr;
  }

  function fmtNote(position, targetId, text) {
    var pos = (position || 'right').toLowerCase();
    if (typeof text !== 'string') text = '';
    if (text.indexOf('\n') < 0) return 'note ' + pos + ' of ' + targetId + ' : ' + text;
    var out = ['note ' + pos + ' of ' + targetId];
    text.split('\n').forEach(function(l) { out.push(l); });
    out.push('end note');
    return out;
  }

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function addState(text, id, label, stereotype) {
    return insertBeforeEnd(text, fmtState(id, label || id, stereotype));
  }
  function addCompositeState(text, id) {
    var out = insertBeforeEnd(text, 'state ' + id + ' {');
    out = insertBeforeEnd(out, '}');
    return out;
  }
  function addTransition(text, from, to, trigger, guard, action) {
    return insertBeforeEnd(text, fmtTransition(from, to, trigger, guard, action));
  }
  function addNote(text, targetId, position, noteText) {
    var formatted = fmtNote(position || 'right', targetId, noteText || '');
    if (Array.isArray(formatted)) {
      var out = text;
      formatted.forEach(function(l) { out = insertBeforeEnd(out, l); });
      return out;
    }
    return insertBeforeEnd(text, formatted);
  }
  function addStateAtLine(text, lineNum, position, id, stereotype) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indentSrc = lines[Math.min(targetIdx, lines.length - 1)] || lines[Math.max(0, targetIdx - 1)] || '';
    var indent = (indentSrc.match(/^(\s*)/) || ['', ''])[1];
    var newLine = indent + fmtState(id, id, stereotype || null);
    lines.splice(targetIdx, 0, newLine);
    return lines.join('\n');
  }
  function addTransitionAtLine(text, lineNum, position, from, to, trigger, guard, action) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indentSrc = lines[Math.min(targetIdx, lines.length - 1)] || '';
    var indent = (indentSrc.match(/^(\s*)/) || ['', ''])[1];
    var newLine = indent + fmtTransition(from, to, trigger, guard, action);
    lines.splice(targetIdx, 0, newLine);
    return lines.join('\n');
  }

  function updateState(text, lineNum, fields) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var trimmed = lines[idx].trim();
    var m = trimmed.match(STATE_RE);
    if (!m) return text;
    var indent = (lines[idx].match(/^(\s*)/) || ['', ''])[1];
    var hasBlock = !!m[6];
    var id, label, stereotype, labelExplicit;
    if (m[2] !== undefined) { id = m[2]; label = m[1]; labelExplicit = true; }
    else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; labelExplicit = m[4] !== undefined; }
    stereotype = m[5] ? m[5].toLowerCase() : null;
    if (fields.id != null) {
      if (!labelExplicit && fields.label == null) label = fields.id;
      id = fields.id;
    }
    if (fields.label != null) label = fields.label;
    if (fields.stereotype !== undefined) stereotype = fields.stereotype;
    var openBrace = hasBlock ? ' {' : '';
    lines[idx] = indent + fmtState(id, label, stereotype) + openBrace;
    return lines.join('\n');
  }

  function updateTransition(text, lineNum, fields) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var trimmed = lines[idx].trim();
    var m = trimmed.match(TRANSITION_RE);
    if (!m) return text;
    var indent = (lines[idx].match(/^(\s*)/) || ['', ''])[1];
    var from = m[1], to = m[2];
    var lbl = m[3] ? m[3].trim() : null;
    var parts = _parseTransitionLabel(lbl);
    if (fields.from != null) from = fields.from;
    if (fields.to != null) to = fields.to;
    if (fields.trigger !== undefined) parts.trigger = fields.trigger;
    if (fields.guard !== undefined) parts.guard = fields.guard;
    if (fields.action !== undefined) parts.action = fields.action;
    lines[idx] = indent + fmtTransition(from, to, parts.trigger, parts.guard, parts.action);
    return lines.join('\n');
  }

  function updateNote(text, startLine, endLine, fields) {
    var lines = text.split('\n');
    var idx = startLine - 1;
    var trimmed = lines[idx].trim();
    var inlineM = trimmed.match(NOTE_INLINE_RE);
    var blockM = trimmed.match(NOTE_BLOCK_OPEN_RE);
    var current = null;
    if (inlineM) {
      current = { position: inlineM[1].toLowerCase(), targetId: inlineM[2], text: inlineM[3] };
    } else if (blockM) {
      var bodyLines = [];
      for (var k = idx + 1; k <= endLine - 2; k++) bodyLines.push(lines[k].replace(/^  /, ''));
      current = { position: blockM[1].toLowerCase(), targetId: blockM[2], text: bodyLines.join('\n') };
    }
    if (!current) return text;
    var newPos = fields.position != null ? fields.position : current.position;
    var newText = fields.text != null ? fields.text : current.text;
    var formatted = fmtNote(newPos, current.targetId, newText);
    var newLines = Array.isArray(formatted) ? formatted : [formatted];
    var before = lines.slice(0, idx);
    var after = lines.slice(endLine);
    return before.concat(newLines).concat(after).join('\n');
  }

  function deleteNode(text, startLine, endLine) {
    var lines = text.split('\n');
    var startIdx = startLine - 1;
    var endIdx = endLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;
    var before = lines.slice(0, startIdx);
    var after = lines.slice(endIdx + 1);
    return before.concat(after).join('\n');
  }

  function deleteStateWithRefs(text, stateId) {
    var parsed = parse(text);
    var elt = null;
    for (var i = 0; i < parsed.states.length; i++) {
      if (parsed.states[i].id === stateId) { elt = parsed.states[i]; break; }
    }
    if (!elt) return text;
    var ranges = [];
    ranges.push({ start: elt.line, end: elt.endLine && elt.endLine > elt.line ? elt.endLine : elt.line });
    parsed.transitions.forEach(function(tr) {
      if (tr.from === stateId || tr.to === stateId) {
        ranges.push({ start: tr.line, end: tr.line });
      }
    });
    parsed.notes.forEach(function(n) {
      if (n.targetId === stateId) {
        ranges.push({ start: n.line, end: n.endLine });
      }
    });
    ranges.sort(function(a, b) { return b.start - a.start; });
    var lines = text.split('\n');
    ranges.forEach(function(r) {
      var startIdx = r.start - 1;
      var endIdx = r.end - 1;
      lines.splice(startIdx, endIdx - startIdx + 1);
    });
    return lines.join('\n');
  }

  function _entityBBox(g) {
    if (!g) return null;
    var rect = g.querySelector('rect');
    if (rect) {
      return {
        x: parseFloat(rect.getAttribute('x')) || 0,
        y: parseFloat(rect.getAttribute('y')) || 0,
        width: parseFloat(rect.getAttribute('width')) || 0,
        height: parseFloat(rect.getAttribute('height')) || 0,
      };
    }
    if (typeof g.getBBox === 'function') {
      try { return g.getBBox(); } catch (e) {}
    }
    return null;
  }

  function _detectCompositeRects(svgEl, ents) {
    var rects = svgEl.querySelectorAll('rect[rx="12.5"]');
    var entRects = {};
    ents.forEach(function(g) {
      var r = g.querySelector('rect[rx="12.5"]');
      if (r) entRects[r.getAttribute('x') + ',' + r.getAttribute('y')] = true;
    });
    var composites = [];
    Array.prototype.forEach.call(rects, function(r) {
      var fill = (r.getAttribute('fill') || '').toLowerCase();
      var key = r.getAttribute('x') + ',' + r.getAttribute('y');
      if (fill === 'none' && !entRects[key]) {
        composites.push(r);
      }
    });
    return composites;
  }

  function buildOverlay(svgEl, parsedData, overlayEl) {
    if (!svgEl || !overlayEl) return;
    OB.syncDimensions(svgEl, overlayEl);
    while (overlayEl.firstChild) overlayEl.removeChild(overlayEl.firstChild);

    // 1. Match entity-wrapped states (simple states + child states inside composite)
    var ents = svgEl.querySelectorAll('g.entity');
    var byName = {};
    Array.prototype.forEach.call(ents, function(g) {
      var qn = g.getAttribute('data-qualified-name');
      if (qn) byName[qn] = g;
    });
    var entArr = Array.prototype.slice.call(ents);

    var simpleStates = (parsedData.states || []).filter(function(s) {
      return s.endLine === s.line || s.endLine === undefined;
    });
    var compositeStates = (parsedData.states || []).filter(function(s) {
      return s.endLine && s.endLine > s.line;
    });

    simpleStates.forEach(function(st) {
      var g = byName[st.id];
      if (!g) return;
      var bb = _entityBBox(g);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
        'data-type': 'state',
        'data-id': st.id,
        'data-line': String(st.line),
      });
    });

    // 2. Composite container: standalone <rect fill="none" rx="12.5">
    var compRects = _detectCompositeRects(svgEl, entArr);
    if (compositeStates.length > 0 && compRects.length === compositeStates.length) {
      compositeStates.forEach(function(st, idx) {
        var r = compRects[idx];
        OB.addRect(overlayEl,
          parseFloat(r.getAttribute('x')) || 0,
          parseFloat(r.getAttribute('y')) || 0,
          parseFloat(r.getAttribute('width')) || 0,
          parseFloat(r.getAttribute('height')) || 0,
          {
            'data-type': 'state',
            'data-id': st.id,
            'data-line': String(st.line),
            'data-composite': '1',
          }
        );
      });
    } else if (compositeStates.length > 0 && typeof console !== 'undefined' && console.warn) {
      console.warn('[state.buildOverlay] composite count mismatch: model=' + compositeStates.length + ' svg=' + compRects.length);
    }

    // 3. Transitions: match arrow polygons in document order
    var transitions = parsedData.transitions || [];
    if (transitions.length > 0) {
      var allPolys = svgEl.querySelectorAll('polygon');
      var arrowHeads = [];
      Array.prototype.forEach.call(allPolys, function(p) {
        var pts = (p.getAttribute('points') || '').trim().split(/[\s,]+/).filter(function(s) { return s !== ''; });
        if (pts.length >= 8 && pts.length <= 12) arrowHeads.push(p);
      });
      if (arrowHeads.length === transitions.length) {
        transitions.forEach(function(tr, idx) {
          var p = arrowHeads[idx];
          var ptsStr = (p.getAttribute('points') || '').trim().split(/[\s,]+/).filter(function(s) { return s !== ''; });
          var xs = [], ys = [];
          for (var i = 0; i + 1 < ptsStr.length; i += 2) {
            xs.push(parseFloat(ptsStr[i])); ys.push(parseFloat(ptsStr[i + 1]));
          }
          if (xs.length === 0) return;
          var minX = Math.min.apply(null, xs);
          var minY = Math.min.apply(null, ys);
          var maxX = Math.max.apply(null, xs);
          var maxY = Math.max.apply(null, ys);
          OB.addRect(overlayEl, minX - 8, minY - 8, (maxX - minX) + 16, (maxY - minY) + 16, {
            'data-type': 'transition',
            'data-id': tr.id,
            'data-line': String(tr.line),
          });
        });
      } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('[state.buildOverlay] transition arrow mismatch: model=' + transitions.length + ' svg=' + arrowHeads.length);
      }
    }

    // 4. Notes: match by entity wrapper (note has its own g.entity[data-qualified-name=GMN_])
    var notes = parsedData.notes || [];
    if (notes.length > 0) {
      var noteEnts = [];
      Array.prototype.forEach.call(ents, function(g) {
        var qn = g.getAttribute('data-qualified-name') || '';
        if (qn.indexOf('GMN') === 0) noteEnts.push(g);
      });
      if (noteEnts.length === notes.length) {
        notes.forEach(function(n, idx) {
          var g = noteEnts[idx];
          var bb = _entityBBox(g);
          if (!bb) {
            // Note path-based shapes may not have a rect; use getBBox or skip
            return;
          }
          OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': String(n.line),
          });
        });
      }
    }
  }

  function renderProps(selData, parsedData, propsEl, ctx) {
    if (!propsEl) return;
    if (!selData || selData.length === 0) {
      _renderNoSelection(parsedData, propsEl, ctx);
      return;
    }
    if (selData.length === 1) {
      var sel = selData[0];
      if (sel.type === 'state') return _renderStateEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'transition') return _renderTransitionEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'note') return _renderNoteEdit(sel, parsedData, propsEl, ctx);
    }
    propsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">複数選択は未対応 (State)</div>';
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var allStates = parsedData.states || [];
    var stateOpts = allStates.map(function(s) { return { value: s.id, label: s.label || s.id }; });
    if (stateOpts.length === 0) stateOpts = [{ value: '', label: '（state なし）' }];
    var stateOptsWithPseudo = [{ value: '[*]', label: '[*] (initial/final)' }].concat(stateOpts);

    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">State Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'st-tail-kind', [
          { value: 'state', label: 'State', selected: true },
          { value: 'composite', label: 'Composite State' },
          { value: 'transition', label: 'Transition' },
          { value: 'note', label: 'Note' }
        ]) +
        '<div id="st-tail-detail" style="margin-top:6px;"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    var renderTailDetail = function() {
      var kind = document.getElementById('st-tail-kind').value;
      var detailEl = document.getElementById('st-tail-detail');
      var html2 = '';
      if (kind === 'state') {
        html2 =
          P.fieldHtml('ID', 'st-tail-id', '', '例: Idle') +
          P.selectFieldHtml('Stereotype', 'st-tail-stereo', [
            { value: '', label: '(none)', selected: true },
            { value: 'choice', label: 'choice' },
            { value: 'history', label: 'history' },
            { value: 'historyDeep', label: 'historyDeep' }
          ]) +
          P.primaryButtonHtml('st-tail-add', '+ State 追加');
      } else if (kind === 'composite') {
        html2 =
          P.fieldHtml('ID', 'st-tail-id', '', '例: Outer') +
          P.primaryButtonHtml('st-tail-add', '+ Composite 追加');
      } else if (kind === 'transition') {
        html2 =
          P.selectFieldHtml('From', 'st-tail-from', stateOptsWithPseudo) +
          P.selectFieldHtml('To', 'st-tail-to', stateOptsWithPseudo) +
          P.fieldHtml('Trigger', 'st-tail-trig', '') +
          P.fieldHtml('Guard', 'st-tail-guard', '') +
          P.fieldHtml('Action', 'st-tail-act', '') +
          P.primaryButtonHtml('st-tail-add', '+ Transition 追加');
      } else if (kind === 'note') {
        html2 =
          P.selectFieldHtml('Target', 'st-tail-target', stateOpts) +
          P.selectFieldHtml('Position', 'st-tail-pos', [
            { value: 'right', label: 'Right', selected: true },
            { value: 'left', label: 'Left' }
          ]) +
          '<div style="margin-bottom:6px;"><label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label><textarea id="st-tail-ntext" style="width:100%;min-height:50px;"></textarea></div>' +
          P.primaryButtonHtml('st-tail-add', '+ Note 追加');
      }
      detailEl.innerHTML = html2;

      P.bindEvent('st-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var k = document.getElementById('st-tail-kind').value;
        var out = t;
        if (k === 'state') {
          var id = document.getElementById('st-tail-id').value.trim();
          if (!id) { alert('ID 必須'); return; }
          var st = document.getElementById('st-tail-stereo').value || null;
          out = addState(t, id, id, st);
        } else if (k === 'composite') {
          var cid = document.getElementById('st-tail-id').value.trim();
          if (!cid) { alert('ID 必須'); return; }
          out = addCompositeState(t, cid);
        } else if (k === 'transition') {
          var fr = document.getElementById('st-tail-from').value;
          var to = document.getElementById('st-tail-to').value;
          out = addTransition(t, fr, to,
            document.getElementById('st-tail-trig').value || null,
            document.getElementById('st-tail-guard').value || null,
            document.getElementById('st-tail-act').value || null);
        } else if (k === 'note') {
          var tg = document.getElementById('st-tail-target').value;
          if (!tg) { alert('Target 必須'); return; }
          out = addNote(t, tg, document.getElementById('st-tail-pos').value, document.getElementById('st-tail-ntext').value);
        }
        if (out !== t) {
          window.MA.history.pushHistory();
          ctx.setMmdText(out);
          ctx.onUpdate();
        }
      });
    };
    P.bindEvent('st-tail-kind', 'change', renderTailDetail);
    renderTailDetail();
  }

  function _selectedOpt(o, sel) { return { value: o.value, label: o.label, selected: o.value === sel }; }

  function _renderStateEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var st = null;
    for (var i = 0; i < parsedData.states.length; i++) {
      if (parsedData.states[i].id === sel.id) { st = parsedData.states[i]; break; }
    }
    if (!st) { propsEl.innerHTML = ''; return; }
    var related = (parsedData.transitions || []).filter(function(tr) { return tr.from === st.id || tr.to === st.id; });
    var notes = (parsedData.notes || []).filter(function(n) { return n.targetId === st.id; });

    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">' +
      (st.stereotype ? st.stereotype + ' ' : '') + 'State (L' + st.line + ')</div>' +
      P.fieldHtml('ID', 'st-id', st.id) +
      P.fieldHtml('Label', 'st-label', st.label || '') +
      P.selectFieldHtml('Stereotype', 'st-stereo', [
        { value: '', label: '(none)', selected: !st.stereotype },
        { value: 'choice', label: 'choice', selected: st.stereotype === 'choice' },
        { value: 'history', label: 'history', selected: st.stereotype === 'history' },
        { value: 'historyDeep', label: 'historyDeep', selected: st.stereotype === 'historydeep' }
      ]) +
      '<div style="font-size:11px;margin:4px 0;color:var(--text-secondary);">Parent: ' + (st.parentId || '(root)') + '</div>' +
      P.primaryButtonHtml('st-update', '更新');
    if (related.length > 0) {
      html += '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
              '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Transitions</div>';
      related.forEach(function(tr) {
        html += '<div style="font-size:11px;margin-bottom:2px;">' + tr.from + ' → ' + tr.to + (tr.label ? ' : ' + tr.label : '') + ' (L' + tr.line + ')</div>';
      });
      html += '</div>';
    }
    if (notes.length > 0) {
      html += '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
              '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Notes</div>';
      notes.forEach(function(n, idx) {
        var preview = (n.text || '').replace(/\n/g, ' ⏎ ').slice(0, 30);
        html += '<div style="font-size:11px;margin-bottom:2px;">' + n.position + ' "' + preview + '" (L' + n.line + ') <button id="st-note-del-' + idx + '" data-start="' + n.line + '" data-end="' + n.endLine + '">✕</button></div>';
      });
      html += '</div>';
    }
    html +=
      '<div style="margin-top:10px;display:flex;gap:6px;">' +
      P.primaryButtonHtml('st-delete', '✕ 削除 (cascade)') +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('st-update', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateState(ctx.getMmdText(), st.line, {
        id: document.getElementById('st-id').value,
        label: document.getElementById('st-label').value,
        stereotype: document.getElementById('st-stereo').value || null
      }));
      ctx.onUpdate();
    });
    P.bindEvent('st-delete', 'click', function() {
      if (!confirm('この state と紐付く transition / note も削除します。続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteStateWithRefs(ctx.getMmdText(), st.id));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    notes.forEach(function(n, idx) {
      P.bindEvent('st-note-del-' + idx, 'click', function(e) {
        var btn = e.currentTarget;
        var sl = parseInt(btn.getAttribute('data-start'), 10);
        var el = parseInt(btn.getAttribute('data-end'), 10);
        window.MA.history.pushHistory();
        ctx.setMmdText(deleteNode(ctx.getMmdText(), sl, el));
        ctx.onUpdate();
      });
    });
  }

  function _renderTransitionEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var tr = null;
    for (var i = 0; i < parsedData.transitions.length; i++) {
      if (parsedData.transitions[i].id === sel.id) { tr = parsedData.transitions[i]; break; }
    }
    if (!tr) { propsEl.innerHTML = ''; return; }
    var stateOpts = (parsedData.states || []).map(function(s) { return { value: s.id, label: s.label || s.id }; });
    var stateOptsWithPseudo = [{ value: '[*]', label: '[*]' }].concat(stateOpts);
    var fromOpts = stateOptsWithPseudo.map(function(o) { return _selectedOpt(o, tr.from); });
    var toOpts = stateOptsWithPseudo.map(function(o) { return _selectedOpt(o, tr.to); });
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Transition (L' + tr.line + ')</div>' +
      P.selectFieldHtml('From', 'st-tr-from', fromOpts) +
      P.selectFieldHtml('To', 'st-tr-to', toOpts) +
      P.fieldHtml('Trigger', 'st-tr-trig', tr.trigger || '') +
      P.fieldHtml('Guard', 'st-tr-guard', tr.guard || '') +
      P.fieldHtml('Action', 'st-tr-act', tr.action || '') +
      P.primaryButtonHtml('st-tr-update', '更新') +
      P.primaryButtonHtml('st-tr-delete', '✕ 削除');
    propsEl.innerHTML = html;

    P.bindEvent('st-tr-update', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateTransition(ctx.getMmdText(), tr.line, {
        from: document.getElementById('st-tr-from').value,
        to: document.getElementById('st-tr-to').value,
        trigger: document.getElementById('st-tr-trig').value || null,
        guard: document.getElementById('st-tr-guard').value || null,
        action: document.getElementById('st-tr-act').value || null
      }));
      ctx.onUpdate();
    });
    P.bindEvent('st-tr-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), tr.line, tr.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderNoteEdit(sel, parsedData, propsEl, ctx) {
    propsEl.innerHTML = '<div>Note edit (Task 13)</div>';
  }

  function template() {
    return '@startuml\n[*] --> Idle\nstate Idle\nstate Active\nIdle --> Active : start\nActive --> [*]\n@enduml';
  }

  return {
    type: 'plantuml-state',
    parse: parse,
    fmtState: fmtState,
    fmtTransition: fmtTransition,
    fmtNote: fmtNote,
    addState: addState,
    addCompositeState: addCompositeState,
    addTransition: addTransition,
    addNote: addNote,
    addStateAtLine: addStateAtLine,
    addTransitionAtLine: addTransitionAtLine,
    updateState: updateState,
    updateTransition: updateTransition,
    updateNote: updateNote,
    deleteNode: deleteNode,
    deleteStateWithRefs: deleteStateWithRefs,
    buildOverlay: buildOverlay,
    renderProps: renderProps,
    template: template,
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,
    },
  };
})();
