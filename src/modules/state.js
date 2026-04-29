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

  var DESCRIPTION_RE = new RegExp(
    '^(' + ID + ')\\s*:\\s*(?:(entry|exit|do)\\s*/\\s*)?(.+)$',
    'i'
  );

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
          entry: null,
          do: null,
          exit: null,
          descriptions: [],
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

      var dm = trimmed.match(DESCRIPTION_RE);
      if (dm) {
        var dTargetId = dm[1];
        var dKind = dm[2] ? dm[2].toLowerCase() : null;
        var dValue = dm[3];
        // Find the state with matching id (consider parent qualification)
        var targetState = null;
        for (var ds = result.states.length - 1; ds >= 0; ds--) {
          var cand = result.states[ds];
          var bareId = cand.id.indexOf('.') >= 0 ? cand.id.split('.').pop() : cand.id;
          if (cand.id === dTargetId || bareId === dTargetId) {
            targetState = cand; break;
          }
        }
        if (targetState) {
          // Use `\\n` (literal 2-char escape) to join multi-occurrence values so they
          // round-trip through Task 3's `<input>` fields (which strip real newlines).
          if (dKind === 'entry') targetState.entry = (targetState.entry ? targetState.entry + '\\n' : '') + dValue;
          else if (dKind === 'exit') targetState.exit = (targetState.exit ? targetState.exit + '\\n' : '') + dValue;
          else if (dKind === 'do') targetState.do = (targetState.do ? targetState.do + '\\n' : '') + dValue;
          else targetState.descriptions.push(dValue);
          continue;
        }
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

  function setStateBehavior(text, stateId, kind, value) {
    if (kind !== 'entry' && kind !== 'exit' && kind !== 'do') return text;
    var lines = text.split('\n');
    // Multi-line value: encode newlines as backslash-n for PlantUML rendering
    var encodedValue = (typeof value === 'string') ? value.replace(/\n/g, '\\n') : '';
    // Find the bare id (after dot for nested states)
    var bareId = stateId.indexOf('.') >= 0 ? stateId.split('.').pop() : stateId;
    // Find existing description line for this kind
    var existingIdx = -1;
    var insertAfterIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      var dm = trimmed.match(/^(\w+)\s*:\s*(entry|exit|do)\s*\/\s*(.+)$/i);
      if (dm && (dm[1] === stateId || dm[1] === bareId) && dm[2].toLowerCase() === kind) {
        existingIdx = i;
        break;
      }
      // Track the state declaration line as fallback insertion point
      var sm = trimmed.match(/^state\s+(?:"[^"]+"\s+as\s+(\w+)|(\w+))/);
      if (sm && (sm[1] === bareId || sm[2] === bareId)) {
        insertAfterIdx = i;
      }
    }
    if (existingIdx >= 0) {
      if (encodedValue === '') {
        lines.splice(existingIdx, 1);
      } else {
        var indent = (lines[existingIdx].match(/^(\s*)/) || ['', ''])[1];
        lines[existingIdx] = indent + bareId + ' : ' + kind + ' / ' + encodedValue;
      }
    } else if (encodedValue !== '' && insertAfterIdx >= 0) {
      var indent2 = (lines[insertAfterIdx].match(/^(\s*)/) || ['', ''])[1];
      lines.splice(insertAfterIdx + 1, 0, indent2 + bareId + ' : ' + kind + ' / ' + encodedValue);
    }
    return lines.join('\n');
  }

  // Find the line index (0-based) of "state STATE_ID" declaration matching id (qualified or bare).
  // Returns -1 if not found.
  function _findStateDeclLine(lines, stateId) {
    var bareId = stateId.indexOf('.') >= 0 ? stateId.split('.').pop() : stateId;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      var m = trimmed.match(STATE_RE);
      if (!m) continue;
      var declId = m[2] !== undefined ? m[2] : m[3];
      if (declId === stateId || declId === bareId) return i;
    }
    return -1;
  }

  // Find the line index of the matching closing brace for a composite that opens at openLineIdx.
  function _findMatchingBrace(lines, openLineIdx) {
    var depth = 0;
    for (var i = openLineIdx; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed.match(STATE_RE) && /\{\s*$/.test(trimmed)) depth++;
      else if (trimmed === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function convertToComposite(text, stateId) {
    var lines = text.split('\n');
    var idx = _findStateDeclLine(lines, stateId);
    if (idx < 0) return text;
    if (/\{\s*$/.test(lines[idx])) return text;  // already composite
    var indent = (lines[idx].match(/^(\s*)/) || ['', ''])[1];
    lines[idx] = lines[idx].replace(/\s*$/, '') + ' {';
    lines.splice(idx + 1, 0, indent + '}');
    return lines.join('\n');
  }

  function dissolveComposite(text, stateId) {
    var lines = text.split('\n');
    var idx = _findStateDeclLine(lines, stateId);
    if (idx < 0) return text;
    if (!/\{\s*$/.test(lines[idx])) return text;  // not a composite
    var closeIdx = _findMatchingBrace(lines, idx);
    if (closeIdx < 0) return text;
    var bodyLines = lines.slice(idx + 1, closeIdx);
    // Reduce indent of body lines by 2 spaces (leading 2 spaces removed)
    var dedented = bodyLines.map(function(l) {
      return l.replace(/^  /, '');
    });
    var before = lines.slice(0, idx);
    var after = lines.slice(closeIdx + 1);
    return before.concat(dedented).concat(after).join('\n');
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

    var doDisplay = (st.do || '').replace(/\\n/g, '\n');
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
      // Behaviors section (StableState style: entry/exit single-line, do multi-line)
      '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
        '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Behaviors</div>' +
        '<div style="margin-bottom:5px;">' +
          '<input id="st-entry" placeholder="entry" value="' + window.MA.htmlUtils.escHtml(st.entry || '') + '" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:11px;">' +
        '</div>' +
        '<div style="margin-bottom:5px;">' +
          '<textarea id="st-do" placeholder="do" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:11px;min-height:40px;resize:vertical;line-height:1.4;white-space:pre;">' + window.MA.htmlUtils.escHtml(doDisplay) + '</textarea>' +
        '</div>' +
        '<div style="margin-bottom:5px;">' +
          '<input id="st-exit" placeholder="exit" value="' + window.MA.htmlUtils.escHtml(st.exit || '') + '" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:11px;">' +
        '</div>' +
      '</div>' +
      // Composite ops (kind-aware buttons)
      (st.endLine && st.endLine > st.line
        ? '<button id="st-dissolve" style="font-size:11px;padding:4px 10px;background:var(--accent-red);border:none;color:#fff;border-radius:3px;cursor:pointer;margin-bottom:4px;">✕ Dissolve composite</button>'
        : '<button id="st-convert" style="font-size:11px;padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;margin-bottom:4px;">+ Convert to composite</button>'
      ) +
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
      var newId = document.getElementById('st-id').value;
      var src = ctx.getMmdText();
      var out = updateState(src, st.line, {
        id: newId,
        label: document.getElementById('st-label').value,
        stereotype: document.getElementById('st-stereo').value || null
      });
      // Apply Behaviors. Use the (possibly renamed) id.
      var bareId = newId.indexOf('.') >= 0 ? newId.split('.').pop() : newId;
      var oldBareId = st.id.indexOf('.') >= 0 ? st.id.split('.').pop() : st.id;
      // If state id was renamed, clean up orphan description lines under the
      // old bare id first to avoid leaving stale entry/do/exit lines pointing
      // to a now-nonexistent identifier.
      if (oldBareId !== bareId) {
        out = setStateBehavior(out, oldBareId, 'entry', '');
        out = setStateBehavior(out, oldBareId, 'do', '');
        out = setStateBehavior(out, oldBareId, 'exit', '');
      }
      var entryVal = document.getElementById('st-entry').value;
      var doVal = document.getElementById('st-do').value;
      var exitVal = document.getElementById('st-exit').value;
      out = setStateBehavior(out, bareId, 'entry', entryVal);
      out = setStateBehavior(out, bareId, 'do', doVal);
      out = setStateBehavior(out, bareId, 'exit', exitVal);
      ctx.setMmdText(out);
      ctx.onUpdate();
    });
    P.bindEvent('st-delete', 'click', function() {
      if (!confirm('この state と紐付く transition / note も削除します。続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteStateWithRefs(ctx.getMmdText(), st.id));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindEvent('st-convert', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(convertToComposite(ctx.getMmdText(), st.id));
      ctx.onUpdate();
    });
    P.bindEvent('st-dissolve', 'click', function() {
      if (!confirm('composite を解体し、 子要素を top-level に出します。 続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(dissolveComposite(ctx.getMmdText(), st.id));
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
    var P = window.MA.properties;
    var H = window.MA.htmlUtils;
    var note = null;
    for (var i = 0; i < (parsedData.notes || []).length; i++) {
      if (parsedData.notes[i].id === sel.id) { note = parsedData.notes[i]; break; }
    }
    if (!note) { propsEl.innerHTML = ''; return; }
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Note (target: ' + H.escHtml(note.targetId) + ', L' + note.line + ')</div>' +
      P.selectFieldHtml('Position', 'st-note-pos', [
        { value: 'right', label: 'Right', selected: note.position === 'right' },
        { value: 'left', label: 'Left', selected: note.position === 'left' }
      ]) +
      '<div style="margin-bottom:6px;"><label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label><textarea id="st-note-text" style="width:100%;min-height:80px;">' + H.escHtml(note.text || '') + '</textarea></div>' +
      P.primaryButtonHtml('st-note-update', '更新') +
      P.primaryButtonHtml('st-note-delete', '✕ 削除');
    propsEl.innerHTML = html;

    P.bindEvent('st-note-update', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateNote(ctx.getMmdText(), note.line, note.endLine, {
        position: document.getElementById('st-note-pos').value,
        text: document.getElementById('st-note-text').value
      }));
      ctx.onUpdate();
    });
    P.bindEvent('st-note-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), note.line, note.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function resolveInsertLine(overlayEl, x, y) {
    // x is accepted for signature parity with activity module; state's
    // overlay-rect layout (composite-state nesting) does not currently use
    // X for branch disambiguation. Reserved for future v1.0.3+ branch-aware
    // insertion in composite states.
    if (!overlayEl) return null;
    var rects = overlayEl.querySelectorAll('rect[data-type="state"]');
    if (rects.length === 0) return null;
    var items = Array.prototype.map.call(rects, function(r) {
      return {
        line: parseInt(r.getAttribute('data-line'), 10),
        y: parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2
      };
    }).sort(function(a, b) { return a.y - b.y; });
    for (var i = items.length - 1; i >= 0; i--) {
      if (y > items[i].y) return { line: items[i].line, position: 'after' };
    }
    return { line: items[0].line, position: 'before' };
  }

  function showInsertForm(ctx, line, position, kind) {
    var modal = document.getElementById('st-modal');
    var content = document.getElementById('st-modal-content');
    if (!modal || !content) {
      var t = window.prompt((position === 'before' ? '前に' : '後に') + 'state を挿入: ID', '');
      if (!t) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(addStateAtLine(ctx.getMmdText(), line, position, t, null));
      ctx.onUpdate();
      return;
    }
    var P = window.MA.properties;
    var parsed = parse(ctx.getMmdText());
    var stateOpts = (parsed.states || []).map(function(s) { return { value: s.id, label: s.label || s.id }; });
    var stateOptsWithPseudo = [{ value: '[*]', label: '[*]' }].concat(stateOpts);
    var title = (position === 'before' ? '前に' : '後に') + '挿入 (L' + line + ')';
    content.innerHTML =
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">' + title + '</h3>' +
      P.selectFieldHtml('Kind', 'st-mod-kind', [
        { value: 'state', label: 'State', selected: true },
        { value: 'transition', label: 'Transition' }
      ]) +
      '<div id="st-mod-detail" style="margin-top:8px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="st-mod-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="st-mod-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function renderDetail() {
      var k = document.getElementById('st-mod-kind').value;
      var detail = document.getElementById('st-mod-detail');
      if (k === 'state') {
        detail.innerHTML = P.fieldHtml('ID', 'st-mod-id', '');
      } else {
        detail.innerHTML =
          P.selectFieldHtml('From', 'st-mod-from', stateOptsWithPseudo) +
          P.selectFieldHtml('To', 'st-mod-to', stateOptsWithPseudo) +
          P.fieldHtml('Trigger', 'st-mod-trig', '') +
          P.fieldHtml('Guard', 'st-mod-guard', '') +
          P.fieldHtml('Action', 'st-mod-act', '');
      }
    }
    renderDetail();
    P.bindEvent('st-mod-kind', 'change', renderDetail);

    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    P.bindEvent('st-mod-cancel', 'click', close);
    P.bindEvent('st-mod-confirm', 'click', function() {
      var k = document.getElementById('st-mod-kind').value;
      var t = ctx.getMmdText();
      var out = t;
      if (k === 'state') {
        var id = (document.getElementById('st-mod-id') || {}).value || '';
        if (!id) { alert('ID 必須'); return; }
        out = addStateAtLine(t, line, position, id, null);
      } else {
        out = addTransitionAtLine(t, line, position,
          document.getElementById('st-mod-from').value,
          document.getElementById('st-mod-to').value,
          document.getElementById('st-mod-trig').value || null,
          document.getElementById('st-mod-guard').value || null,
          document.getElementById('st-mod-act').value || null
        );
      }
      window.MA.history.pushHistory();
      ctx.setMmdText(out);
      ctx.onUpdate();
      close();
    });
  }

  function template() {
    return '@startuml\n[*] --> Idle\nstate Idle\nstate Active\nIdle --> Active : start\nActive --> [*]\n@enduml';
  }

  return {
    type: 'plantuml-state',
    parse: parse,
    buildOverlay: buildOverlay,
    renderProps: renderProps,
    template: template,
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
    setStateBehavior: setStateBehavior,
    convertToComposite: convertToComposite,
    dissolveComposite: dissolveComposite,
    deleteNode: deleteNode,
    deleteStateWithRefs: deleteStateWithRefs,
    resolveInsertLine: resolveInsertLine,
    showInsertForm: showInsertForm,
    defaultInsertKind: 'state',
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,
    },
  };
})();
