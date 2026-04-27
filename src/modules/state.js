'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlState = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
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

  function buildOverlay(svgEl, parsedData, overlayEl) {
    // Phase B Task 12 で実装
  }

  function renderProps(selData, parsedData, propsEl, ctx) {
    // Phase B Task 13+ で実装
    if (propsEl) propsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">State Diagram (wip)</div>';
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
