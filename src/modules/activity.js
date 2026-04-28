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

  // Closing tokens: indent should be inherited from PREVIOUS line, not these.
  var CLOSING_TOKEN_RE = /^(endif|endwhile|repeat\s+while|else|elseif|end\s+fork|fork\s+again|end\s+note)/i;

  function _resolveInsertIndent(lines, targetIdx) {
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx >= lines.length) targetIdx = lines.length - 1;
    var src = lines[targetIdx] || '';
    var trimmed = src.trim();
    // If target is a closing token, use previous line's indent
    if (CLOSING_TOKEN_RE.test(trimmed) && targetIdx > 0) {
      src = lines[targetIdx - 1] || src;
    }
    return (src.match(/^(\s*)/) || ['', ''])[1];
  }

  // Insert an action `:text;` before or after the specified line, preserving
  // surrounding indent so the new action stays inside the same control block.
  function addActionAtLine(text, lineNum, position, actionText) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indent = _resolveInsertIndent(lines, Math.min(targetIdx, lines.length - 1));
    var newLine = indent + ':' + (actionText || '') + ';';
    lines.splice(targetIdx, 0, newLine);
    return lines.join('\n');
  }

  // Insert a control structure (if/while/repeat/fork) before/after lineNum,
  // with indent inherited from target line and inner placeholder `:;`.
  // fields: { cond, thenLabel, elseLabel } for if; { cond, label } for while/repeat; { branchCount } for fork
  function addControlAtLine(text, lineNum, position, kind, fields) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indent = _resolveInsertIndent(lines, Math.min(targetIdx, lines.length - 1));
    var inner = indent + '  ';
    var block = [];
    fields = fields || {};
    if (kind === 'if') {
      block.push(indent + fmtIf(fields.cond || '', fields.thenLabel || 'yes'));
      block.push(inner + ':;');
      if (fields.elseLabel) {
        block.push(indent + fmtElse(fields.elseLabel));
        block.push(inner + ':;');
      }
      block.push(indent + 'endif');
    } else if (kind === 'while') {
      block.push(indent + fmtWhile(fields.cond || '', fields.label || 'yes'));
      block.push(inner + ':;');
      block.push(indent + 'endwhile');
    } else if (kind === 'repeat') {
      block.push(indent + 'repeat');
      block.push(inner + ':;');
      block.push(indent + fmtRepeatWhile(fields.cond || '', fields.label || 'yes'));
    } else if (kind === 'fork') {
      var n = Math.max(2, fields.branchCount || 2);
      block.push(indent + 'fork');
      block.push(inner + ':;');
      for (var i = 1; i < n; i++) {
        block.push(indent + 'fork again');
        block.push(inner + ':;');
      }
      block.push(indent + 'end fork');
    } else {
      return text;
    }
    // Splice block into lines
    var args = [targetIdx, 0].concat(block);
    Array.prototype.splice.apply(lines, args);
    return lines.join('\n');
  }

  function addSwimlaneAtLine(text, lineNum, position, name) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indent = _resolveInsertIndent(lines, Math.min(targetIdx, lines.length - 1));
    lines.splice(targetIdx, 0, indent + fmtSwimlane(name || ''));
    return lines.join('\n');
  }

  function addNoteAtLine(text, lineNum, position, fields) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indent = _resolveInsertIndent(lines, Math.min(targetIdx, lines.length - 1));
    fields = fields || {};
    var formatted = fmtNote(fields.position || 'right', fields.text || '');
    var newLines = Array.isArray(formatted) ? formatted : [formatted];
    var indented = newLines.map(function(l) { return indent + l; });
    var args = [targetIdx, 0].concat(indented);
    Array.prototype.splice.apply(lines, args);
    return lines.join('\n');
  }

  // Find the line index of the matching endif for an `if` at ifLine (1-based).
  // Returns 0-based index of endif line, or -1 if not found / invalid ifLine.
  function _findMatchingEndif(lines, ifLine) {
    if (ifLine < 1 || ifLine > lines.length) return -1;
    var depth = 0;
    for (var i = ifLine - 1; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (IF_OPEN_RE.test(trimmed)) depth++;
      else if (ENDIF_RE.test(trimmed)) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  // Find the first else-line at the same depth between ifLine and endif.
  // Returns 0-based index of else line, or -1 if not found.
  function _findElseLine(lines, ifLine, endifIdx) {
    var depth = 0;
    for (var i = ifLine - 1; i <= endifIdx; i++) {
      var trimmed = lines[i].trim();
      if (IF_OPEN_RE.test(trimmed)) {
        depth++;
        if (depth === 1) continue;  // outer if entry
      } else if (ENDIF_RE.test(trimmed)) {
        depth--;
        if (depth === 0) break;
      } else if (depth === 1 && ELSE_RE.test(trimmed)) {
        return i;
      }
    }
    return -1;
  }

  function addElseifBranch(text, ifLine, condition, label) {
    var lines = text.split('\n');
    var endifIdx = _findMatchingEndif(lines, ifLine);
    if (endifIdx < 0) return text;
    var elseIdx = _findElseLine(lines, ifLine, endifIdx);
    var insertAt = elseIdx >= 0 ? elseIdx : endifIdx;
    var ifIndent = (lines[ifLine - 1].match(/^(\s*)/) || ['', ''])[1];
    var inner = ifIndent + '  ';
    var block = [
      ifIndent + fmtElseif(condition || '', label || 'yes'),
      inner + ':;'
    ];
    var args = [insertAt, 0].concat(block);
    Array.prototype.splice.apply(lines, args);
    return lines.join('\n');
  }

  function addElseBranch(text, ifLine, label) {
    var lines = text.split('\n');
    var endifIdx = _findMatchingEndif(lines, ifLine);
    if (endifIdx < 0) return text;
    var elseIdx = _findElseLine(lines, ifLine, endifIdx);
    if (elseIdx >= 0) return text;  // else already exists, no-op
    var ifIndent = (lines[ifLine - 1].match(/^(\s*)/) || ['', ''])[1];
    var inner = ifIndent + '  ';
    var block = [
      ifIndent + fmtElse(label || 'no'),
      inner + ':;'
    ];
    var args = [endifIdx, 0].concat(block);
    Array.prototype.splice.apply(lines, args);
    return lines.join('\n');
  }

  // Find the line index of the matching `end fork` for a fork at forkLine.
  function _findMatchingEndFork(lines, forkLine) {
    if (forkLine < 1 || forkLine > lines.length) return -1;
    var depth = 0;
    for (var i = forkLine - 1; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (FORK_OPEN_RE.test(trimmed)) depth++;
      else if (END_FORK_RE.test(trimmed)) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function addForkBranch(text, forkLine) {
    var lines = text.split('\n');
    var endForkIdx = _findMatchingEndFork(lines, forkLine);
    if (endForkIdx < 0) return text;
    var forkIndent = (lines[forkLine - 1].match(/^(\s*)/) || ['', ''])[1];
    var inner = forkIndent + '  ';
    var block = [
      forkIndent + 'fork again',
      inner + ':;'
    ];
    var args = [endForkIdx, 0].concat(block);
    Array.prototype.splice.apply(lines, args);
    return lines.join('\n');
  }

  // Delete a single branch (elseif | else | fork again) at branchLine,
  // including its body up to (but excluding) the next branch line or
  // endif/end fork. The structure itself is preserved.
  function deleteBranchAt(text, branchLine) {
    var lines = text.split('\n');
    var idx = branchLine - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var trimmed = lines[idx].trim();
    var isElseif = ELSEIF_RE.test(trimmed);
    var isElse = ELSE_RE.test(trimmed) && !isElseif;
    var isForkAgain = FORK_AGAIN_RE.test(trimmed);
    if (!isElseif && !isElse && !isForkAgain) return text;

    // Find end-of-branch: next line at same depth that is elseif/else/endif
    // (for if-branches) or fork again/end fork (for fork-branches).
    var depth = 0;
    var endIdx = lines.length;  // exclusive
    for (var i = idx + 1; i < lines.length; i++) {
      var t2 = lines[i].trim();
      if (isForkAgain) {
        if (FORK_OPEN_RE.test(t2)) depth++;
        else if (END_FORK_RE.test(t2)) {
          if (depth === 0) { endIdx = i; break; }
          depth--;
        } else if (FORK_AGAIN_RE.test(t2) && depth === 0) {
          endIdx = i; break;
        }
      } else {
        // elseif or else
        if (IF_OPEN_RE.test(t2)) depth++;
        else if (ENDIF_RE.test(t2)) {
          if (depth === 0) { endIdx = i; break; }
          depth--;
        } else if ((ELSEIF_RE.test(t2) || ELSE_RE.test(t2)) && depth === 0) {
          endIdx = i; break;
        }
      }
    }
    var before = lines.slice(0, idx);
    var after = lines.slice(endIdx);
    return before.concat(after).join('\n');
  }

  // Map a click/hover position (in SVG/overlay coordinates) to the nearest
  // rect by Euclidean distance, then determine before/after by Y relative to
  // the rect center. X is honored for branch disambiguation in if/fork composites.
  function resolveInsertLine(overlayEl, x, y) {
    if (!overlayEl) return null;
    var rects = overlayEl.querySelectorAll(
      'rect[data-type="action"], rect[data-type="decision"], rect[data-type="start"],' +
      'rect[data-type="stop"], rect[data-type="end"], rect[data-type="fork"]'
    );
    if (rects.length === 0) return null;
    var best = null;
    var bestDist = Infinity;
    Array.prototype.forEach.call(rects, function(r) {
      var rx = parseFloat(r.getAttribute('x'));
      var ry = parseFloat(r.getAttribute('y'));
      var rw = parseFloat(r.getAttribute('width'));
      var rh = parseFloat(r.getAttribute('height'));
      var cx = rx + rw / 2;
      var cy = ry + rh / 2;
      var dx = x - cx;
      var dy = y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = {
          line: parseInt(r.getAttribute('data-line'), 10),
          cy: cy,
          rx: rx,
          rw: rw,
        };
      }
    });
    if (!best) return null;
    return {
      line: best.line,
      position: y < best.cy ? 'before' : 'after',
      rectX: best.rx,
      rectWidth: best.rw,
    };
  }

  // Open a modal popup to insert a new node before/after the resolved line.
  // Supports all 7 kinds: action / if / while / repeat / fork / swimlane / note
  function showInsertForm(ctx, line, position, kind) {
    var modal = document.getElementById('act-modal');
    var content = document.getElementById('act-modal-content');
    if (!modal || !content) {
      // Fallback: prompt() for action only
      var t = window.prompt((position === 'before' ? '前に' : '後に') + 'アクションを挿入: テキスト', '');
      if (t === null) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(addActionAtLine(ctx.getMmdText(), line, position, t));
      ctx.onUpdate();
      return;
    }
    var P = window.MA.properties;
    var defaultKind = kind || 'action';
    var title = '(L' + line + ' の ' + (position === 'before' ? '前' : '後') + ') に挿入';
    content.innerHTML =
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">' + title + '</h3>' +
      P.selectFieldHtml('種類', 'act-mod-kind', [
        { value: 'action', label: 'Action', selected: defaultKind === 'action' },
        { value: 'if', label: 'If decision', selected: defaultKind === 'if' },
        { value: 'while', label: 'While loop', selected: defaultKind === 'while' },
        { value: 'repeat', label: 'Repeat loop', selected: defaultKind === 'repeat' },
        { value: 'fork', label: 'Fork', selected: defaultKind === 'fork' },
        { value: 'swimlane', label: 'Swimlane', selected: defaultKind === 'swimlane' },
        { value: 'note', label: 'Note', selected: defaultKind === 'note' }
      ]) +
      '<div id="act-mod-fields" style="margin-top:8px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="act-mod-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="act-mod-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function renderFields() {
      var k = document.getElementById('act-mod-kind').value;
      var fEl = document.getElementById('act-mod-fields');
      var html = '';
      if (k === 'action') {
        html = '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">アクション本文 (改行可)</label>' +
               '<textarea id="act-mod-text" style="width:100%;min-height:60px;font-family:inherit;font-size:12px;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:3px;"></textarea>';
      } else if (k === 'if') {
        html = P.fieldHtml('Condition', 'act-mod-cond', '', '例: 認証成功?') +
               P.fieldHtml('Then label', 'act-mod-thenlbl', 'yes') +
               P.fieldHtml('Else label (空で else 省略)', 'act-mod-elselbl', 'no');
      } else if (k === 'while') {
        html = P.fieldHtml('Condition', 'act-mod-cond', '') +
               P.fieldHtml('Label', 'act-mod-lbl', 'yes');
      } else if (k === 'repeat') {
        html = P.fieldHtml('Repeat-while condition', 'act-mod-cond', '') +
               P.fieldHtml('Label', 'act-mod-lbl', 'yes');
      } else if (k === 'fork') {
        html = P.fieldHtml('Branches', 'act-mod-bcount', '2');
      } else if (k === 'swimlane') {
        html = P.fieldHtml('Name', 'act-mod-name', '');
      } else if (k === 'note') {
        html = P.selectFieldHtml('Position', 'act-mod-notepos', [
          { value: 'right', label: 'right', selected: true },
          { value: 'left', label: 'left' }
        ]) +
        '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-top:6px;margin-bottom:2px;">Text (改行可)</label>' +
        '<textarea id="act-mod-text" style="width:100%;min-height:50px;font-family:inherit;font-size:12px;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:3px;"></textarea>';
      }
      fEl.innerHTML = html;
    }
    renderFields();
    P.bindEvent('act-mod-kind', 'change', renderFields);

    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    P.bindEvent('act-mod-cancel', 'click', close);
    P.bindEvent('act-mod-confirm', 'click', function() {
      var k = document.getElementById('act-mod-kind').value;
      var src = ctx.getMmdText();
      var out = src;
      if (k === 'action') {
        var txt = (document.getElementById('act-mod-text') || {}).value || '';
        out = addActionAtLine(src, line, position, txt);
      } else if (k === 'if') {
        out = addControlAtLine(src, line, position, 'if', {
          cond: document.getElementById('act-mod-cond').value,
          thenLabel: document.getElementById('act-mod-thenlbl').value || 'yes',
          elseLabel: document.getElementById('act-mod-elselbl').value
        });
      } else if (k === 'while') {
        out = addControlAtLine(src, line, position, 'while', {
          cond: document.getElementById('act-mod-cond').value,
          label: document.getElementById('act-mod-lbl').value || 'yes'
        });
      } else if (k === 'repeat') {
        out = addControlAtLine(src, line, position, 'repeat', {
          cond: document.getElementById('act-mod-cond').value,
          label: document.getElementById('act-mod-lbl').value || 'yes'
        });
      } else if (k === 'fork') {
        var n = parseInt(document.getElementById('act-mod-bcount').value, 10) || 2;
        out = addControlAtLine(src, line, position, 'fork', { branchCount: n });
      } else if (k === 'swimlane') {
        out = addSwimlaneAtLine(src, line, position, document.getElementById('act-mod-name').value);
      } else if (k === 'note') {
        out = addNoteAtLine(src, line, position, {
          position: document.getElementById('act-mod-notepos').value,
          text: (document.getElementById('act-mod-text') || {}).value || ''
        });
      }
      if (out !== src) {
        window.MA.history.pushHistory();
        ctx.setMmdText(out);
        ctx.onUpdate();
      }
      close();
    });
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

  function _parsePoints(el) {
    var raw = (el.getAttribute('points') || '').trim();
    var nums = raw.split(/[\s,]+/).filter(function(s) { return s !== ''; });
    var pts = [];
    for (var i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) });
    }
    return pts;
  }

  // Classify a single SVG primitive into a node-kind string,
  // OR return an ellipse descriptor for post-processing (pair grouping).
  // Returns null for shapes that should be ignored (arrow heads, merge markers, container rects).
  function _classifyShape(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
      var rx = parseFloat(el.getAttribute('rx')) || 0;
      var h = parseFloat(el.getAttribute('height')) || 0;
      // Fork bar: PlantUML uses height ≈ 6, fill #555555. Discriminate by height.
      if (h > 0 && h < 12) return 'fork-bar';
      // Action: rounded rect with sufficient height (PlantUML uses rx ≈ 12.5, h ≈ 30+)
      if (rx >= 8 && h >= 20) return 'action';
      return null;
    }
    if (tag === 'polygon') {
      var pts = _parsePoints(el);
      // Decision (if/while/repeat header): 7-point hexagonal polygon (PlantUML 1.2026.x)
      if (pts.length === 7) return 'decision';
      // 4-point polygons are arrow heads (always small) — ignore
      // 5-point polygons are endif/endwhile merge markers (no model node) — ignore
      // 8-point polygons are reserved for future activity action variants — ignore for now
      return null;
    }
    if (tag === 'ellipse') {
      var rxe = parseFloat(el.getAttribute('rx')) || 0;
      if (rxe < 5) return null;  // tiny decoration ellipse
      var fill = (el.getAttribute('fill') || '').toLowerCase();
      var hasFill = fill && fill !== 'none' && fill !== 'transparent';
      // Return descriptor for post-process pair grouping
      return {
        kind: 'ellipse-raw',
        cx: parseFloat(el.getAttribute('cx')) || 0,
        cy: parseFloat(el.getAttribute('cy')) || 0,
        rx: rxe,
        hasFill: hasFill,
      };
    }
    return null;
  }

  // Post-process raw shape list: group adjacent same-center ellipses as 'stop-or-end' (paired),
  // single filled ellipses as 'start', single unfilled as 'stop-or-end'.
  function _groupShapes(raw) {
    var matched = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      var c = item.classification;
      if (typeof c === 'string') {
        matched.push({ el: item.el, kind: c });
        continue;
      }
      // ellipse-raw: check next item for pair
      var paired = false;
      if (i + 1 < raw.length) {
        var next = raw[i + 1];
        if (next.classification && typeof next.classification === 'object' &&
            next.classification.kind === 'ellipse-raw' &&
            Math.abs(next.classification.cx - c.cx) < 2 &&
            Math.abs(next.classification.cy - c.cy) < 2) {
          // Pair = stop. Use outer (larger rx) as the primary el for bbox.
          var outerEl = c.rx >= next.classification.rx ? item.el : next.el;
          matched.push({ el: outerEl, kind: 'stop-or-end' });
          i++;  // skip the inner ellipse
          paired = true;
        }
      }
      if (!paired) {
        matched.push({ el: item.el, kind: c.hasFill ? 'start' : 'stop-or-end' });
      }
    }
    return matched;
  }

  function _polygonBBox(el) {
    var pts = _parsePoints(el);
    if (pts.length === 0) return null;
    var xs = pts.map(function(p) { return p.x; });
    var ys = pts.map(function(p) { return p.y; });
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

    // Walk SVG, classify each primitive, then post-process to group ellipse pairs as 'stop-or-end'.
    var shapeNodes = svgEl.querySelectorAll('rect, polygon, ellipse');
    var raw = [];
    Array.prototype.forEach.call(shapeNodes, function(s) {
      var c = _classifyShape(s);
      if (c) raw.push({ el: s, classification: c });
    });
    var matched = _groupShapes(raw);

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

    // Notes: match 5-point polygons in document order, excluding closed-diamond merge markers (endif/endwhile).
    // A folded-corner rect (note) has 5 distinct points; a closed diamond merge marker repeats the first point.
    var notes = parsedData.notes || [];
    if (notes.length > 0) {
      var allPolys = svgEl.querySelectorAll('polygon');
      var notePolys = [];
      Array.prototype.forEach.call(allPolys, function(p) {
        var pts = _parsePoints(p);
        if (pts.length === 5) {
          var first = pts[0], last = pts[4];
          if (first.x !== last.x || first.y !== last.y) notePolys.push(p);
        }
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
      if (sel.type === 'decision' || sel.type === 'fork') return _renderControlEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'start' || sel.type === 'stop' || sel.type === 'end') return _renderTerminatorEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'note') return _renderNoteEdit(sel, parsedData, propsEl, ctx);
      if (sel.type === 'swimlane') return _renderSwimlaneEdit(sel, parsedData, propsEl, ctx);
    }
    propsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">複数選択は未対応 (Activity)</div>';
  }

  function _renderTerminatorEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var node = _findNodeById(parsedData.nodes, sel.id);
    if (!node) { propsEl.innerHTML = ''; return; }
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">' + node.kind + ' (L' + node.line + ')</div>' +
      '<div style="font-size:11px;margin-bottom:8px;color:var(--text-secondary);">この ' + node.kind + ' ノードは編集項目がありません。</div>' +
      P.primaryButtonHtml('ac-term-delete', '✕ 削除');
    propsEl.innerHTML = html;
    P.bindEvent('ac-term-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), node.line, node.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
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

  function _findNodeById(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.id === id) return n;
      if (n.branches) {
        for (var j = 0; j < n.branches.length; j++) {
          var found = _findNodeById(n.branches[j].body, id);
          if (found) return found;
        }
      }
      if (n.body) {
        var found2 = _findNodeById(n.body, id);
        if (found2) return found2;
      }
    }
    return null;
  }

  function _renderActionEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var node = _findNodeById(parsedData.nodes, sel.id);
    if (!node) { propsEl.innerHTML = ''; return; }
    var attachedNotes = [];
    var allNotes = parsedData.notes || [];
    for (var ai = 0; ai < allNotes.length; ai++) {
      if (allNotes[ai].attachedNodeId === node.id) attachedNotes.push(allNotes[ai]);
    }
    var swimlane = null;
    var sws = parsedData.swimlanes || [];
    for (var si = 0; si < sws.length; si++) {
      if (sws[si].id === node.swimlaneId) { swimlane = sws[si]; break; }
    }
    var swimLabel = swimlane ? swimlane.label : '(なし)';

    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Action (L' + node.line + ')</div>' +
      '<div style="margin-bottom:6px;font-size:11px;"><b>Swimlane:</b> ' + window.MA.htmlUtils.escHtml(swimLabel) + ' <span style="color:var(--text-secondary);">(read-only)</span></div>' +
      '<div style="margin-bottom:6px;">' +
        '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label>' +
        '<textarea id="ac-action-text" style="width:100%;min-height:60px;">' + window.MA.htmlUtils.escHtml(node.text || '') + '</textarea>' +
      '</div>' +
      P.primaryButtonHtml('ac-action-update', '更新') +
      '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">' +
        '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Notes</div>';
    if (attachedNotes.length === 0) {
      html += '<div style="font-size:11px;color:var(--text-secondary);font-style:italic;">（このアクションに note なし）</div>';
    } else {
      for (var ni = 0; ni < attachedNotes.length; ni++) {
        var n = attachedNotes[ni];
        var preview = (n.text || '').replace(/\n/g, ' ⏎ ').slice(0, 40);
        html += '<div style="font-size:11px;margin-bottom:2px;">' +
                  n.position + ' "' + window.MA.htmlUtils.escHtml(preview) + '" (L' + n.line + ')' +
                  ' <button id="ac-note-edit-' + ni + '" data-id="' + n.id + '" data-line="' + n.line + '">edit</button>' +
                  ' <button id="ac-note-del-' + ni + '" data-start="' + n.line + '" data-end="' + n.endLine + '">✕</button>' +
                '</div>';
      }
    }
    html += '<div id="ac-add-note-form" style="margin-top:6px;"></div>' +
            '<button id="ac-add-note-btn" style="margin-top:4px;">+ Note 追加</button>' +
          '</div>' +
          '<div style="margin-top:10px;">' +
            P.primaryButtonHtml('ac-action-delete', '✕ 削除') +
          '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('ac-action-update', 'click', function() {
      var newText = document.getElementById('ac-action-text').value;
      window.MA.history.pushHistory();
      ctx.setMmdText(updateAction(ctx.getMmdText(), node.line, node.endLine, newText));
      ctx.onUpdate();
    });
    P.bindEvent('ac-action-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), node.line, node.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    for (var bi = 0; bi < attachedNotes.length; bi++) {
      (function(idx) {
        P.bindEvent('ac-note-edit-' + idx, 'click', function(e) {
          var btn = e.currentTarget;
          window.MA.selection.setSelected([{ type: 'note', id: btn.getAttribute('data-id'), line: parseInt(btn.getAttribute('data-line'), 10) }]);
        });
        P.bindEvent('ac-note-del-' + idx, 'click', function(e) {
          var btn = e.currentTarget;
          var sl = parseInt(btn.getAttribute('data-start'), 10);
          var el = parseInt(btn.getAttribute('data-end'), 10);
          window.MA.history.pushHistory();
          ctx.setMmdText(deleteNode(ctx.getMmdText(), sl, el));
          ctx.onUpdate();
        });
      })(bi);
    }
    P.bindEvent('ac-add-note-btn', 'click', function() {
      var f = document.getElementById('ac-add-note-form');
      f.innerHTML =
        P.selectFieldHtml('Position', 'ac-new-npos', [
          { value: 'right', label: 'Right', selected: true },
          { value: 'left', label: 'Left' }
        ]) +
        '<div style="margin-bottom:6px;">' +
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label>' +
          '<textarea id="ac-new-ntext" style="width:100%;min-height:50px;"></textarea>' +
        '</div>' +
        P.primaryButtonHtml('ac-new-nadd', '+ 追加');
      P.bindEvent('ac-new-nadd', 'click', function() {
        var pos = document.getElementById('ac-new-npos').value;
        var txt = document.getElementById('ac-new-ntext').value;
        window.MA.history.pushHistory();
        ctx.setMmdText(addNote(ctx.getMmdText(), node.endLine, pos, txt));
        ctx.onUpdate();
      });
    });
  }
  function _renderControlEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var node = _findNodeById(parsedData.nodes, sel.id);
    if (!node) { propsEl.innerHTML = ''; return; }
    var html = '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">' + node.kind + ' (L' + node.line + ')</div>';

    if (node.kind === 'if') {
      html += P.fieldHtml('Condition', 'ac-if-cond', node.condition || '');
      html += '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
                '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Branches</div>';
      var brs = node.branches || [];
      var hasElse = false;
      for (var bi = 0; bi < brs.length; bi++) {
        var b = brs[bi];
        if (b.kind === 'else') hasElse = true;
        var deleteBtn = '';
        if (b.kind === 'elseif' || b.kind === 'else') {
          deleteBtn = ' <button id="ac-branch-del-' + bi + '" data-line="' + b.line + '" title="この branch を削除" style="background:var(--accent-red);border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✕</button>';
        }
        html += '<div style="font-size:11px;margin-bottom:2px;">' +
                  '▸ ' + b.kind + ' (' + window.MA.htmlUtils.escHtml(b.label || '') + ')' + (b.condition ? ' cond: ' + window.MA.htmlUtils.escHtml(b.condition) : '') + ' (L' + b.line + ')' +
                  ' <button id="ac-branch-edit-' + bi + '" data-line="' + b.line + '">edit label</button>' +
                  deleteBtn +
                '</div>';
      }
      // Branch add buttons
      html += '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">' +
                '<button id="ac-add-elseif" style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">+ elseif 追加</button>' +
                (hasElse
                  ? '<button id="ac-add-else" disabled style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-secondary);border-radius:3px;cursor:not-allowed;opacity:0.5;">+ else 追加 (既に存在)</button>'
                  : '<button id="ac-add-else" style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">+ else 追加</button>'
                ) +
              '</div>';
      html += '</div>';
    } else if (node.kind === 'while') {
      html += P.fieldHtml('Condition', 'ac-while-cond', node.condition || '');
      html += P.fieldHtml('Label', 'ac-while-lbl', node.label || 'yes');
    } else if (node.kind === 'repeat') {
      html += P.fieldHtml('Repeat-while condition', 'ac-rep-cond', node.condition || '');
      html += P.fieldHtml('Label', 'ac-rep-lbl', node.label || 'yes');
    } else if (node.kind === 'fork') {
      var fbrs = node.branches || [];
      html += '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Branches (' + fbrs.length + ')</div>';
      for (var fbi = 0; fbi < fbrs.length; fbi++) {
        var fb = fbrs[fbi];
        if (fbi === 0) {
          html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:2px;">▸ branch 1 (L' + fb.line + ')</div>';
        } else {
          html += '<div style="font-size:11px;margin-bottom:2px;">' +
                    '▸ branch ' + (fbi + 1) + ' (fork again, L' + fb.line + ')' +
                    ' <button id="ac-fork-branch-del-' + fbi + '" data-line="' + fb.line + '" title="この branch を削除" style="background:var(--accent-red);border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✕</button>' +
                  '</div>';
        }
      }
      html += '<button id="ac-add-fork-again" style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">+ fork again 追加</button>';
    }
    html += P.primaryButtonHtml('ac-ctrl-update', '更新') +
            P.primaryButtonHtml('ac-ctrl-delete', '✕ 構造ごと削除');
    propsEl.innerHTML = html;

    P.bindEvent('ac-ctrl-update', 'click', function() {
      var t = ctx.getMmdText();
      var out = t;
      if (node.kind === 'if') {
        var c = document.getElementById('ac-if-cond').value;
        out = updateIfCondition(t, node.line, c);
      } else if (node.kind === 'while') {
        out = updateWhileCondition(t, node.line, document.getElementById('ac-while-cond').value);
        var lines = out.split('\n');
        var idx = node.line - 1;
        var indent = lines[idx].match(/^(\s*)/)[1];
        lines[idx] = indent + fmtWhile(document.getElementById('ac-while-cond').value, document.getElementById('ac-while-lbl').value);
        out = lines.join('\n');
      } else if (node.kind === 'repeat') {
        var lines2 = t.split('\n');
        var idx2 = node.endLine - 1;
        var indent2 = lines2[idx2].match(/^(\s*)/)[1];
        lines2[idx2] = indent2 + fmtRepeatWhile(document.getElementById('ac-rep-cond').value, document.getElementById('ac-rep-lbl').value);
        out = lines2.join('\n');
      }
      if (out !== t) {
        window.MA.history.pushHistory();
        ctx.setMmdText(out);
        ctx.onUpdate();
      }
    });
    P.bindEvent('ac-ctrl-delete', 'click', function() {
      if (!confirm('構造ごと削除します (' + node.kind + ')。続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), node.line, node.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    if (node.kind === 'if') {
      var brs2 = node.branches || [];
      for (var bj = 0; bj < brs2.length; bj++) {
        (function(b) {
          var bIdx = brs2.indexOf(b);
          P.bindEvent('ac-branch-edit-' + bIdx, 'click', function() {
            var newLabel = prompt('Branch label:', b.label || '');
            if (newLabel === null) return;
            window.MA.history.pushHistory();
            ctx.setMmdText(updateBranchLabel(ctx.getMmdText(), b.line, newLabel));
            ctx.onUpdate();
          });
          if (b.kind === 'elseif' || b.kind === 'else') {
            P.bindEvent('ac-branch-del-' + bIdx, 'click', function() {
              if (!confirm(b.kind + ' を削除します。続行しますか？')) return;
              window.MA.history.pushHistory();
              ctx.setMmdText(deleteBranchAt(ctx.getMmdText(), b.line));
              window.MA.selection.clearSelection();
              ctx.onUpdate();
            });
          }
        })(brs2[bj]);
      }
      P.bindEvent('ac-add-elseif', 'click', function() {
        var cond = window.prompt('elseif condition:', '');
        if (cond === null) return;
        var lbl = window.prompt('elseif label (default: yes):', 'yes') || 'yes';
        window.MA.history.pushHistory();
        ctx.setMmdText(addElseifBranch(ctx.getMmdText(), node.line, cond, lbl));
        ctx.onUpdate();
      });
      P.bindEvent('ac-add-else', 'click', function() {
        var lbl = window.prompt('else label (default: no):', 'no') || 'no';
        window.MA.history.pushHistory();
        ctx.setMmdText(addElseBranch(ctx.getMmdText(), node.line, lbl));
        ctx.onUpdate();
      });
    }
    if (node.kind === 'fork') {
      var fbrs2 = node.branches || [];
      for (var fbj = 1; fbj < fbrs2.length; fbj++) {
        (function(b, fIdx) {
          P.bindEvent('ac-fork-branch-del-' + fIdx, 'click', function() {
            if (!confirm('fork branch を削除します。続行しますか？')) return;
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteBranchAt(ctx.getMmdText(), b.line));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
        })(fbrs2[fbj], fbj);
      }
      P.bindEvent('ac-add-fork-again', 'click', function() {
        window.MA.history.pushHistory();
        ctx.setMmdText(addForkBranch(ctx.getMmdText(), node.line));
        ctx.onUpdate();
      });
    }
  }
  function _renderSwimlaneEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var sw = null;
    var sws = parsedData.swimlanes || [];
    for (var i = 0; i < sws.length; i++) {
      if (sws[i].id === sel.id) { sw = sws[i]; break; }
    }
    if (!sw) { propsEl.innerHTML = ''; return; }
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Swimlane "' + window.MA.htmlUtils.escHtml(sw.label) + '" (L' + sw.line + ')</div>' +
      P.fieldHtml('Name', 'ac-sw-name', sw.label) +
      P.primaryButtonHtml('ac-sw-update', '更新') +
      P.primaryButtonHtml('ac-sw-delete', '✕ swimlane 解除');
    propsEl.innerHTML = html;

    P.bindEvent('ac-sw-update', 'click', function() {
      var newLabel = document.getElementById('ac-sw-name').value;
      window.MA.history.pushHistory();
      ctx.setMmdText(updateSwimlane(ctx.getMmdText(), sw.line, newLabel));
      ctx.onUpdate();
    });
    P.bindEvent('ac-sw-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), sw.line, sw.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderNoteEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var note = null;
    var notes = parsedData.notes || [];
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === sel.id) { note = notes[i]; break; }
    }
    if (!note) { propsEl.innerHTML = ''; return; }
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Note (L' + note.line + ')</div>' +
      P.selectFieldHtml('Position', 'ac-note-pos', [
        { value: 'right', label: 'Right', selected: note.position === 'right' },
        { value: 'left', label: 'Left', selected: note.position === 'left' }
      ]) +
      '<div style="margin-bottom:6px;">' +
        '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label>' +
        '<textarea id="ac-note-text" style="width:100%;min-height:80px;">' + window.MA.htmlUtils.escHtml(note.text || '') + '</textarea>' +
      '</div>' +
      P.primaryButtonHtml('ac-note-update', '更新') +
      P.primaryButtonHtml('ac-note-delete', '✕ 削除');
    propsEl.innerHTML = html;

    P.bindEvent('ac-note-update', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateNote(ctx.getMmdText(), note.line, note.endLine, {
        position: document.getElementById('ac-note-pos').value,
        text: document.getElementById('ac-note-text').value
      }));
      ctx.onUpdate();
    });
    P.bindEvent('ac-note-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNode(ctx.getMmdText(), note.line, note.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function template() {
    return '@startuml\nstart\n:Hello world;\nstop\n@enduml';
  }

  return {
    type: 'plantuml-activity',
    parse: parse,
    buildOverlay: buildOverlay,
    renderProps: renderProps,
    template: template,
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
    addActionAtLine: addActionAtLine,
    addControlAtLine: addControlAtLine,
    addSwimlaneAtLine: addSwimlaneAtLine,
    addNoteAtLine: addNoteAtLine,
    addElseifBranch: addElseifBranch,
    addElseBranch: addElseBranch,
    addForkBranch: addForkBranch,
    deleteBranchAt: deleteBranchAt,
    _resolveInsertIndent: _resolveInsertIndent,
    resolveInsertLine: resolveInsertLine,
    showInsertForm: showInsertForm,
    defaultInsertKind: 'action',
    capabilities: {
      overlaySelection: true,
      hoverInsert: true,
      participantDrag: false,
      showInsertForm: true,
      multiSelectConnect: false,
    },
  };
})();
