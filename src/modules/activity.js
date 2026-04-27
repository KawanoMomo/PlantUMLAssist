'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlActivity = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;

  var START_RE = /^start$/i;
  var STOP_RE = /^stop$/i;
  var END_RE = /^end$/i;
  var ACTION_OPEN_RE = /^:(.*)$/;
  var ACTION_CLOSED_RE = /^:(.*);$/;

  var IF_OPEN_RE = /^if\s*\(([^)]*)\)\s*(?:then\s*(?:\(([^)]*)\))?)?\s*$/i;
  var ELSEIF_RE = /^elseif\s*\(([^)]*)\)\s*(?:then\s*(?:\(([^)]*)\))?)?\s*$/i;
  var ELSE_RE = /^else(?:\s*\(([^)]*)\))?\s*$/i;
  var ENDIF_RE = /^endif\s*$/i;

  var WHILE_OPEN_RE = /^while\s*\(([^)]*)\)\s*(?:is\s*\(([^)]*)\))?\s*$/i;
  var ENDWHILE_RE = /^endwhile\s*$/i;

  var REPEAT_OPEN_RE = /^repeat\s*$/i;
  var REPEAT_WHILE_RE = /^repeat\s+while\s*\(([^)]*)\)\s*(?:is\s*\(([^)]*)\))?\s*$/i;

  var FORK_OPEN_RE = /^fork\s*$/i;
  var FORK_AGAIN_RE = /^fork\s+again\s*$/i;
  var END_FORK_RE = /^end\s+fork\s*$/i;

  var SWIMLANE_RE = /^\|(?:#[^|]+\|)?\s*([^|]+?)\s*\|$/;

  var NOTE_INLINE_RE = /^note\s+(right|left)\s*:\s*(.*)$/i;
  var NOTE_BLOCK_OPEN_RE = /^note\s+(right|left)\s*$/i;
  var END_NOTE_RE = /^end\s+note\s*$/i;

  var LEGACY_START_RE = /^\(\*\)\s*-->\s*:(.*);$/;
  var LEGACY_TRANSITION_RE = /^:(.*?);\s*-->\s*:(.*?);$/;
  var LEGACY_END_RE = /^:(.*?);\s*-->\s*\(\*\)$/;

  function _normalizeLegacy(text) {
    var lines = text.split('\n');
    var out = [];
    var seenStart = false;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      var m;
      if ((m = trimmed.match(LEGACY_START_RE))) {
        if (!seenStart) { out.push('start'); seenStart = true; }
        out.push(':' + m[1] + ';');
        continue;
      }
      if ((m = trimmed.match(LEGACY_END_RE))) {
        out.push(':' + m[1] + ';');
        out.push('end');
        continue;
      }
      if ((m = trimmed.match(LEGACY_TRANSITION_RE))) {
        // Both ends are actions; emit them in order (dedup later if same as previous)
        out.push(':' + m[1] + ';');
        out.push(':' + m[2] + ';');
        continue;
      }
      out.push(lines[i]);  // pass through (preserve original indent)
    }
    return out.join('\n');
  }

  function _newId(state) { return '__a_' + (state.counter++); }

  function _appendNode(state, node) {
    if (node.swimlaneId === null && state.currentSwimlaneId) {
      node.swimlaneId = state.currentSwimlaneId;
    }
    var top = state.stack[state.stack.length - 1];
    top.target.push(node);
    if (node.kind === 'action') state.lastActionId = node.id;
  }

  function parse(text) {
    text = _normalizeLegacy(text || '');
    var result = {
      meta: { title: '', startUmlLine: null },
      nodes: [],
      swimlanes: [],
      notes: [],
    };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var state = {
      counter: 0,
      currentSwimlaneId: null,
      lastActionId: null,
      openNote: null,
      // Stack frames: { type: 'root'|'if-node'|'if-branch', target: array<Node>, ifNode?, branch? }
      stack: [{ type: 'root', target: result.nodes }],
    };
    var openAction = null;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var rawLine = lines[i];
      var trimmed = rawLine.trim();

      // Multi-line action collection
      if (openAction) {
        var endsWithSemi = /;\s*$/.test(trimmed);
        var bodyTextLine = endsWithSemi ? trimmed.replace(/;\s*$/, '') : trimmed;
        openAction.bodyLines.push(bodyTextLine);
        if (endsWithSemi) {
          _appendNode(state, {
            kind: 'action',
            id: _newId(state),
            text: openAction.bodyLines.join('\n'),
            line: openAction.startLine,
            endLine: lineNum,
            swimlaneId: null,
          });
          openAction = null;
        }
        continue;
      }

      // Multi-line note collection (BEFORE empty-line skip)
      if (state.openNote) {
        if (END_NOTE_RE.test(trimmed)) {
          result.notes.push({
            kind: 'note',
            id: '__n_' + result.notes.length,
            position: state.openNote.position,
            attachedNodeId: state.openNote.attachedNodeId,
            text: state.openNote.bodyLines.join('\n'),
            line: state.openNote.startLine,
            endLine: lineNum,
          });
          state.openNote = null;
          continue;
        }
        state.openNote.bodyLines.push(rawLine.replace(/^  /, ''));
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

      // Swimlane: |name| or |#color|name|
      var swimMatch = trimmed.match(SWIMLANE_RE);
      if (swimMatch) {
        var swimId = '__sw_' + result.swimlanes.length;
        result.swimlanes.push({ id: swimId, label: swimMatch[1].trim(), line: lineNum, endLine: lineNum });
        state.currentSwimlaneId = swimId;
        continue;
      }

      // ENDWHILE — pop matching while frame
      if (ENDWHILE_RE.test(trimmed)) {
        if (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'while-node') {
          var wf = state.stack.pop();
          wf.whileNode.endLine = lineNum;
        }
        continue;
      }

      // ENDIF — pop until matching if frame
      if (ENDIF_RE.test(trimmed)) {
        // Pop branch frames until we hit if-node frame, then pop the if frame
        while (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'if-branch') {
          var branchFrame = state.stack.pop();
          branchFrame.branch.endLine = lineNum - 1;
        }
        if (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'if-node') {
          var ifFrame = state.stack.pop();
          ifFrame.ifNode.endLine = lineNum;
        }
        continue;
      }

      // ELSE / ELSEIF — close current branch, open new branch
      var elseifMatch = trimmed.match(ELSEIF_RE);
      var elseMatch = trimmed.match(ELSE_RE);
      if (elseifMatch || elseMatch) {
        // Pop current branch frame
        if (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'if-branch') {
          var prev = state.stack.pop();
          prev.branch.endLine = lineNum - 1;
        }
        var ifFrame2 = state.stack[state.stack.length - 1];
        if (!ifFrame2 || ifFrame2.type !== 'if-node') continue;  // malformed
        var newBranch;
        if (elseifMatch) {
          newBranch = {
            kind: 'elseif',
            condition: elseifMatch[1],
            label: elseifMatch[2] || 'yes',
            body: [],
            line: lineNum,
            endLine: lineNum,
          };
        } else {
          newBranch = {
            kind: 'else',
            label: (elseMatch[1] || 'no'),
            body: [],
            line: lineNum,
            endLine: lineNum,
          };
        }
        ifFrame2.ifNode.branches.push(newBranch);
        state.stack.push({ type: 'if-branch', target: newBranch.body, branch: newBranch });
        continue;
      }

      // REPEAT WHILE — close repeat frame (must check before WHILE since string contains 'while')
      var repWhileMatch = trimmed.match(REPEAT_WHILE_RE);
      if (repWhileMatch) {
        if (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'repeat-node') {
          var rf = state.stack.pop();
          rf.repeatNode.condition = repWhileMatch[1];
          rf.repeatNode.label = repWhileMatch[2] || 'yes';
          rf.repeatNode.endLine = lineNum;
        }
        continue;
      }
      if (REPEAT_OPEN_RE.test(trimmed)) {
        var repeatNode = {
          kind: 'repeat',
          id: _newId(state),
          condition: '',
          label: 'yes',
          body: [],
          line: lineNum,
          endLine: lineNum,
          swimlaneId: null,
        };
        _appendNode(state, repeatNode);
        state.stack.push({ type: 'repeat-node', repeatNode: repeatNode, target: repeatNode.body });
        continue;
      }

      // FORK — end fork (must check before fork again since 'end fork' contains 'fork')
      if (END_FORK_RE.test(trimmed)) {
        // Close current branch + fork frame
        while (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'fork-branch') {
          var fbf = state.stack.pop();
          fbf.branch.endLine = lineNum - 1;
        }
        if (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'fork-node') {
          var ff = state.stack.pop();
          ff.forkNode.endLine = lineNum;
        }
        continue;
      }
      if (FORK_AGAIN_RE.test(trimmed)) {
        // Close current branch, open new branch
        if (state.stack.length > 1 && state.stack[state.stack.length - 1].type === 'fork-branch') {
          var prevFb = state.stack.pop();
          prevFb.branch.endLine = lineNum - 1;
        }
        var fnFrame = state.stack[state.stack.length - 1];
        if (!fnFrame || fnFrame.type !== 'fork-node') continue;
        var newFb = { body: [], line: lineNum, endLine: lineNum };
        fnFrame.forkNode.branches.push(newFb);
        state.stack.push({ type: 'fork-branch', target: newFb.body, branch: newFb });
        continue;
      }
      if (FORK_OPEN_RE.test(trimmed)) {
        var forkNode = {
          kind: 'fork',
          id: _newId(state),
          branches: [],
          line: lineNum,
          endLine: lineNum,
          swimlaneId: null,
        };
        var fb = { body: [], line: lineNum, endLine: lineNum };
        forkNode.branches.push(fb);
        _appendNode(state, forkNode);
        state.stack.push({ type: 'fork-node', forkNode: forkNode });
        state.stack.push({ type: 'fork-branch', target: fb.body, branch: fb });
        continue;
      }

      // WHILE — open
      var whileMatch = trimmed.match(WHILE_OPEN_RE);
      if (whileMatch) {
        var whileNode = {
          kind: 'while',
          id: _newId(state),
          condition: whileMatch[1],
          label: whileMatch[2] || 'yes',
          body: [],
          line: lineNum,
          endLine: lineNum,
          swimlaneId: null,
        };
        _appendNode(state, whileNode);
        state.stack.push({ type: 'while-node', whileNode: whileNode, target: whileNode.body });
        continue;
      }

      // IF — open
      var ifMatch = trimmed.match(IF_OPEN_RE);
      if (ifMatch) {
        var ifNode = {
          kind: 'if',
          id: _newId(state),
          condition: ifMatch[1],
          branches: [],
          line: lineNum,
          endLine: lineNum,
          swimlaneId: null,
        };
        var thenBranch = {
          kind: 'then',
          label: ifMatch[2] || 'yes',
          body: [],
          line: lineNum,
          endLine: lineNum,
        };
        ifNode.branches.push(thenBranch);
        _appendNode(state, ifNode);
        state.stack.push({ type: 'if-node', ifNode: ifNode });
        state.stack.push({ type: 'if-branch', target: thenBranch.body, branch: thenBranch });
        continue;
      }

      if (START_RE.test(trimmed)) {
        _appendNode(state, { kind: 'start', id: _newId(state), line: lineNum, endLine: lineNum, swimlaneId: null });
        continue;
      }
      if (STOP_RE.test(trimmed)) {
        _appendNode(state, { kind: 'stop', id: _newId(state), line: lineNum, endLine: lineNum, swimlaneId: null });
        continue;
      }
      if (END_RE.test(trimmed)) {
        _appendNode(state, { kind: 'end', id: _newId(state), line: lineNum, endLine: lineNum, swimlaneId: null });
        continue;
      }

      // Note (1-line and block open) — placed BEFORE action `:` handling
      var noteInlineMatch = trimmed.match(NOTE_INLINE_RE);
      if (noteInlineMatch) {
        result.notes.push({
          kind: 'note',
          id: '__n_' + result.notes.length,
          position: noteInlineMatch[1].toLowerCase(),
          attachedNodeId: state.lastActionId,
          text: noteInlineMatch[2],
          line: lineNum,
          endLine: lineNum,
        });
        continue;
      }
      var noteBlockMatch = trimmed.match(NOTE_BLOCK_OPEN_RE);
      if (noteBlockMatch) {
        state.openNote = {
          startLine: lineNum,
          position: noteBlockMatch[1].toLowerCase(),
          attachedNodeId: state.lastActionId,
          bodyLines: [],
        };
        continue;
      }

      // Action (after control-structure tokens to avoid confusion)
      if (trimmed.charAt(0) === ':') {
        var closedMatch = trimmed.match(ACTION_CLOSED_RE);
        if (closedMatch) {
          _appendNode(state, {
            kind: 'action',
            id: _newId(state),
            text: closedMatch[1],
            line: lineNum,
            endLine: lineNum,
            swimlaneId: null,
          });
          continue;
        }
        openAction = { startLine: lineNum, bodyLines: [trimmed.substring(1)] };
        continue;
      }
    }
    return result;
  }

  function fmtAction(text) {
    return ':' + (text || '') + ';';
  }
  function fmtIf(condition, thenLabel) {
    return 'if (' + condition + ') then (' + (thenLabel || 'yes') + ')';
  }
  function fmtElseif(condition, thenLabel) {
    return 'elseif (' + condition + ') then (' + (thenLabel || 'yes') + ')';
  }
  function fmtElse(label) {
    return 'else (' + (label || 'no') + ')';
  }
  function fmtWhile(condition, label) {
    return 'while (' + condition + ') is (' + (label || 'yes') + ')';
  }
  function fmtRepeatWhile(condition, label) {
    return 'repeat while (' + condition + ') is (' + (label || 'yes') + ')';
  }
  function fmtSwimlane(label) {
    return '|' + label + '|';
  }
  function fmtNote(position, text) {
    var pos = (position || 'right').toLowerCase();
    if (typeof text !== 'string') text = '';
    if (text.indexOf('\n') < 0) return 'note ' + pos + ' : ' + text;
    var out = ['note ' + pos];
    text.split('\n').forEach(function(l) { out.push(l); });
    out.push('end note');
    return out;
  }

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function addAction(text, actionText) {
    return insertBeforeEnd(text, fmtAction(actionText || ''));
  }

  function addIf(text, condition, thenLabel, elseLabel) {
    var out = text;
    out = insertBeforeEnd(out, fmtIf(condition, thenLabel || 'yes'));
    if (elseLabel) out = insertBeforeEnd(out, fmtElse(elseLabel));
    out = insertBeforeEnd(out, 'endif');
    return out;
  }

  function addWhile(text, condition, label) {
    var out = text;
    out = insertBeforeEnd(out, fmtWhile(condition, label || 'yes'));
    out = insertBeforeEnd(out, 'endwhile');
    return out;
  }

  function addRepeat(text, condition, label) {
    var out = text;
    out = insertBeforeEnd(out, 'repeat');
    out = insertBeforeEnd(out, fmtRepeatWhile(condition, label || 'yes'));
    return out;
  }

  function addFork(text, branchCount) {
    var n = Math.max(1, branchCount || 2);
    var out = text;
    out = insertBeforeEnd(out, 'fork');
    for (var i = 1; i < n; i++) out = insertBeforeEnd(out, 'fork again');
    out = insertBeforeEnd(out, 'end fork');
    return out;
  }

  function addSwimlane(text, label) {
    return insertBeforeEnd(text, fmtSwimlane(label));
  }

  function addNote(text, afterLine, position, noteText) {
    var lines = text.split('\n');
    var idx = afterLine;
    var formatted = fmtNote(position || 'right', noteText || '');
    var newLines = Array.isArray(formatted) ? formatted : [formatted];
    var before = lines.slice(0, idx);
    var after = lines.slice(idx);
    return before.concat(newLines).concat(after).join('\n');
  }

  function updateAction(text, startLine, endLine, newText) {
    var lines = text.split('\n');
    var newBody = (newText || '').split('\n');
    var firstLine = ':' + newBody[0] + (newBody.length === 1 ? ';' : '');
    var rest = [];
    for (var i = 1; i < newBody.length; i++) {
      rest.push(i === newBody.length - 1 ? newBody[i] + ';' : newBody[i]);
    }
    var newLines = [firstLine].concat(rest);
    var before = lines.slice(0, startLine - 1);
    var after = lines.slice(endLine);
    return before.concat(newLines).concat(after).join('\n');
  }

  function updateIfCondition(text, lineNum, newCond) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var m = lines[idx].trim().match(IF_OPEN_RE);
    if (!m) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    lines[idx] = indent + fmtIf(newCond, m[2] || 'yes');
    return lines.join('\n');
  }

  function updateBranchLabel(text, lineNum, newLabel) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var trimmed = lines[idx].trim();
    var indent = lines[idx].match(/^(\s*)/)[1];
    var em;
    if ((em = trimmed.match(IF_OPEN_RE))) {
      lines[idx] = indent + fmtIf(em[1], newLabel);
    } else if ((em = trimmed.match(ELSEIF_RE))) {
      lines[idx] = indent + fmtElseif(em[1], newLabel);
    } else if ((em = trimmed.match(ELSE_RE))) {
      lines[idx] = indent + fmtElse(newLabel);
    } else {
      return text;
    }
    return lines.join('\n');
  }

  function updateWhileCondition(text, lineNum, newCond) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var m = lines[idx].trim().match(WHILE_OPEN_RE);
    if (!m) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    lines[idx] = indent + fmtWhile(newCond, m[2] || 'yes');
    return lines.join('\n');
  }

  function updateSwimlane(text, lineNum, newLabel) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var m = lines[idx].trim().match(SWIMLANE_RE);
    if (!m) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    lines[idx] = indent + fmtSwimlane(newLabel);
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
      current = { position: inlineM[1].toLowerCase(), text: inlineM[2] };
    } else if (blockM) {
      var bodyLines = [];
      for (var k = idx + 1; k <= endLine - 2; k++) bodyLines.push(lines[k].replace(/^  /, ''));
      current = { position: blockM[1].toLowerCase(), text: bodyLines.join('\n') };
    }
    if (!current) return text;
    var newPos = fields.position != null ? fields.position : current.position;
    var newText = fields.text != null ? fields.text : current.text;
    var formatted = fmtNote(newPos, newText);
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

  var OB = window.MA.overlayBuilder;

  function _flattenNodes(nodes, out) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      out.push(n);
      if (n.branches) {
        for (var j = 0; j < n.branches.length; j++) {
          var b = n.branches[j];
          if (b.body) _flattenNodes(b.body, out);
        }
      }
      if (n.body) _flattenNodes(n.body, out);
    }
    return out;
  }

  function _classifyShape(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
      var rx = parseFloat(el.getAttribute('rx')) || 0;
      var h = parseFloat(el.getAttribute('height')) || 0;
      if (rx > 0) return 'action';
      if (h > 0 && h < 12) return 'fork-bar';
      return null;
    }
    if (tag === 'polygon') {
      var pts = (el.getAttribute('points') || '').trim().split(/\s+/);
      if (pts.length === 4) return 'decision';
      if (pts.length === 5) return 'note';
    }
    if (tag === 'ellipse') {
      // Single ellipse (filled) vs nested = stop
      var fill = el.getAttribute('fill') || '';
      if (fill.toLowerCase() === '#000' || fill === 'black') return 'start';
      return 'stop-or-end';
    }
    return null;
  }

  function _polygonBBox(el) {
    var pts = (el.getAttribute('points') || '').trim().split(/\s+/);
    var xs = [], ys = [];
    for (var i = 0; i < pts.length; i++) {
      var pair = pts[i].split(',');
      var x = parseFloat(pair[0]); var y = parseFloat(pair[1]);
      if (!isNaN(x)) xs.push(x);
      if (!isNaN(y)) ys.push(y);
    }
    if (xs.length === 0) return null;
    var minX = Math.min.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxX = Math.max.apply(null, xs);
    var maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function _shapeBBox(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
      return {
        x: parseFloat(el.getAttribute('x')) || 0,
        y: parseFloat(el.getAttribute('y')) || 0,
        width: parseFloat(el.getAttribute('width')) || 0,
        height: parseFloat(el.getAttribute('height')) || 0,
      };
    }
    if (tag === 'polygon') return _polygonBBox(el);
    if (tag === 'ellipse') {
      var cx = parseFloat(el.getAttribute('cx')) || 0;
      var cy = parseFloat(el.getAttribute('cy')) || 0;
      var rx = parseFloat(el.getAttribute('rx')) || 0;
      var ry = parseFloat(el.getAttribute('ry')) || 0;
      return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
    }
    return null;
  }

  function buildOverlay(svgEl, parsedData, overlayEl) {
    if (!svgEl || !overlayEl) return;
    OB.syncDimensions(svgEl, overlayEl);
    while (overlayEl.firstChild) overlayEl.removeChild(overlayEl.firstChild);

    var flat = _flattenNodes(parsedData.nodes || [], []);
    if (flat.length === 0) return;

    // Walk SVG and classify shapes
    var shapeNodes = svgEl.querySelectorAll('rect, polygon, ellipse');
    var matched = [];
    Array.prototype.forEach.call(shapeNodes, function(s) {
      var kind = _classifyShape(s);
      if (kind) matched.push({ el: s, kind: kind });
    });

    // Map flat nodes to expected shape kind
    var expectedKind = function(n) {
      if (n.kind === 'start') return 'start';
      if (n.kind === 'stop' || n.kind === 'end') return 'stop-or-end';
      if (n.kind === 'action') return 'action';
      if (n.kind === 'if' || n.kind === 'while' || n.kind === 'repeat') return 'decision';
      if (n.kind === 'fork') return 'fork-bar';
      return null;
    };

    // Greedy match: for each flat node, find next matching shape in document order
    var shapeIdx = 0;
    flat.forEach(function(n) {
      var ek = expectedKind(n);
      if (!ek) return;
      while (shapeIdx < matched.length && matched[shapeIdx].kind !== ek) shapeIdx++;
      if (shapeIdx >= matched.length) return;
      var sh = matched[shapeIdx];
      shapeIdx++;
      var bb = _shapeBBox(sh.el);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
        'data-type': n.kind === 'if' || n.kind === 'while' || n.kind === 'repeat' ? 'decision' : n.kind,
        'data-id': n.id,
        'data-line': String(n.line),
      });
    });

    if (matched.length !== flat.filter(function(n) { return expectedKind(n); }).length) {
      OB.warnIfMismatch('activity', flat.length, matched.length);
    }

    // Notes: match 5-point polygons in document order
    var notes = parsedData.notes || [];
    if (notes.length > 0) {
      var allPolys = svgEl.querySelectorAll('polygon');
      var notePolys = [];
      Array.prototype.forEach.call(allPolys, function(p) {
        var pts = (p.getAttribute('points') || '').trim().split(/\s+/);
        if (pts.length === 5) notePolys.push(p);
      });
      if (notePolys.length === notes.length) {
        notes.forEach(function(n, idx) {
          var bb = _polygonBBox(notePolys[idx]);
          if (!bb) return;
          OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': String(n.line),
          });
        });
      } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('[activity.buildOverlay] note polygon count mismatch: model=' + notes.length + ' svg=' + notePolys.length);
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
      if (sel.type === 'action') return _renderActionEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'decision') return _renderControlEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'note') return _renderNoteEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'swimlane') return _renderSwimlaneEdit(sel, parsedData, propsEl, ctx);
    }
    propsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">複数選択は未対応 (Activity)</div>';
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Activity Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
        P.fieldHtml('Title', 'ac-title', (parsedData.meta && parsedData.meta.title) || '') +
        P.primaryButtonHtml('ac-set-title', 'Title 適用') +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'ac-tail-kind', [
          { value: 'action', label: 'Action', selected: true },
          { value: 'start', label: 'Start' },
          { value: 'stop', label: 'Stop' },
          { value: 'end', label: 'End' },
          { value: 'if', label: 'If decision' },
          { value: 'while', label: 'While loop' },
          { value: 'repeat', label: 'Repeat loop' },
          { value: 'fork', label: 'Fork' },
          { value: 'swimlane', label: 'Swimlane' }
        ]) +
        '<div id="ac-tail-detail" style="margin-top:6px;"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('ac-set-title', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(_setTitle(ctx.getMmdText(), document.getElementById('ac-title').value.trim()));
      ctx.onUpdate();
    });

    var renderTailDetail = function() {
      var kind = document.getElementById('ac-tail-kind').value;
      var detailEl = document.getElementById('ac-tail-detail');
      var html2 = '';
      if (kind === 'action') {
        html2 =
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text (改行可)</label>' +
          '<textarea id="ac-tail-text" style="width:100%;min-height:50px;font-family:inherit;font-size:12px;"></textarea>' +
          P.primaryButtonHtml('ac-tail-add', '+ Action 追加');
      } else if (kind === 'start' || kind === 'stop' || kind === 'end') {
        html2 = P.primaryButtonHtml('ac-tail-add', '+ ' + kind + ' 追加');
      } else if (kind === 'if') {
        html2 =
          P.fieldHtml('Condition', 'ac-tail-cond', '', '例: 認証成功?') +
          P.fieldHtml('Then label', 'ac-tail-thenlbl', 'yes') +
          P.fieldHtml('Else label (空で else 省略)', 'ac-tail-elselbl', 'no') +
          P.primaryButtonHtml('ac-tail-add', '+ if 追加');
      } else if (kind === 'while') {
        html2 =
          P.fieldHtml('Condition', 'ac-tail-cond', '') +
          P.fieldHtml('Label', 'ac-tail-lbl', 'yes') +
          P.primaryButtonHtml('ac-tail-add', '+ while 追加');
      } else if (kind === 'repeat') {
        html2 =
          P.fieldHtml('While condition', 'ac-tail-cond', '') +
          P.fieldHtml('Label', 'ac-tail-lbl', 'yes') +
          P.primaryButtonHtml('ac-tail-add', '+ repeat 追加');
      } else if (kind === 'fork') {
        html2 =
          P.fieldHtml('Branches', 'ac-tail-bcount', '2') +
          P.primaryButtonHtml('ac-tail-add', '+ fork 追加');
      } else if (kind === 'swimlane') {
        html2 =
          P.fieldHtml('Label', 'ac-tail-lbl', '') +
          P.primaryButtonHtml('ac-tail-add', '+ swimlane 追加');
      }
      detailEl.innerHTML = html2;

      P.bindEvent('ac-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var k = document.getElementById('ac-tail-kind').value;
        var out = t;
        if (k === 'action') {
          var txt = document.getElementById('ac-tail-text').value;
          out = addAction(t, txt);
        } else if (k === 'start') {
          out = insertBeforeEnd(t, 'start');
        } else if (k === 'stop') {
          out = insertBeforeEnd(t, 'stop');
        } else if (k === 'end') {
          out = insertBeforeEnd(t, 'end');
        } else if (k === 'if') {
          var c = document.getElementById('ac-tail-cond').value;
          var tl = document.getElementById('ac-tail-thenlbl').value || 'yes';
          var el = document.getElementById('ac-tail-elselbl').value;
          out = addIf(t, c, tl, el || null);
        } else if (k === 'while') {
          out = addWhile(t, document.getElementById('ac-tail-cond').value, document.getElementById('ac-tail-lbl').value);
        } else if (k === 'repeat') {
          out = addRepeat(t, document.getElementById('ac-tail-cond').value, document.getElementById('ac-tail-lbl').value);
        } else if (k === 'fork') {
          var n = parseInt(document.getElementById('ac-tail-bcount').value, 10) || 2;
          out = addFork(t, n);
        } else if (k === 'swimlane') {
          out = addSwimlane(t, document.getElementById('ac-tail-lbl').value);
        }
        if (out !== t) {
          window.MA.history.pushHistory();
          ctx.setMmdText(out);
          ctx.onUpdate();
        }
      });
    };
    P.bindEvent('ac-tail-kind', 'change', renderTailDetail);
    renderTailDetail();
  }

  function _setTitle(text, title) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^@startuml/.test(lines[i].trim())) {
        if (i + 1 < lines.length && /^title\s+/.test(lines[i + 1].trim())) {
          lines.splice(i + 1, 1);
        }
        if (title) lines.splice(i + 1, 0, 'title ' + title);
        return lines.join('\n');
      }
    }
    return text;
  }

  function _renderActionEdit(sel, parsedData, propsEl, ctx) {
    propsEl.innerHTML = '<div>edit (Task 16)</div>';
  }
  function _renderControlEdit(sel, parsedData, propsEl, ctx) {
    propsEl.innerHTML = '<div>edit (Task 17)</div>';
  }
  function _renderNoteEdit(sel, parsedData, propsEl, ctx) {
    propsEl.innerHTML = '<div>edit (Task 18)</div>';
  }
  function _renderSwimlaneEdit(sel, parsedData, propsEl, ctx) {
    propsEl.innerHTML = '<div>edit (Task 18)</div>';
  }

  function getTemplate() {
    return '@startuml\nstart\n:Hello world;\nstop\n@enduml';
  }

  return {
    type: 'plantuml-activity',
    parse: parse,
    buildOverlay: buildOverlay,
    renderProps: renderProps,
    getTemplate: getTemplate,
    fmtAction: fmtAction,
    fmtIf: fmtIf,
    fmtElseif: fmtElseif,
    fmtElse: fmtElse,
    fmtWhile: fmtWhile,
    fmtRepeatWhile: fmtRepeatWhile,
    fmtSwimlane: fmtSwimlane,
    fmtNote: fmtNote,
    addAction: addAction,
    addIf: addIf,
    addWhile: addWhile,
    addRepeat: addRepeat,
    addFork: addFork,
    addSwimlane: addSwimlane,
    addNote: addNote,
    updateAction: updateAction,
    updateIfCondition: updateIfCondition,
    updateBranchLabel: updateBranchLabel,
    updateWhileCondition: updateWhileCondition,
    updateSwimlane: updateSwimlane,
    updateNote: updateNote,
    deleteNode: deleteNode,
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,
    },
  };
})();
