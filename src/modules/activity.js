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

  function _newId(state) { return '__a_' + (state.counter++); }

  function _appendNode(state, node) {
    var top = state.stack[state.stack.length - 1];
    top.target.push(node);
  }

  function parse(text) {
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

      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;
      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

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

  function buildOverlay(svgEl, parsedData, overlayEl) {
    // Phase B で実装
  }

  function renderProps(selData, parsedData, propsEl, ctx) {
    // Phase B で実装
    if (propsEl) propsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">Activity Diagram (renderProps wip)</div>';
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
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,
    },
  };
})();
