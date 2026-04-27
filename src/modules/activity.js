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

  function parse(text) {
    var result = {
      meta: { title: '', startUmlLine: null },
      nodes: [],
      swimlanes: [],
      notes: [],
    };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var nodeCounter = 0;
    var openAction = null;  // { startLine, bodyLines }

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var rawLine = lines[i];
      var trimmed = rawLine.trim();

      // Inside multi-line action: collect until semicolon
      if (openAction) {
        // Append the current line (with original indentation stripped)
        var endsWithSemi = /;\s*$/.test(trimmed);
        var bodyTextLine = endsWithSemi ? trimmed.replace(/;\s*$/, '') : trimmed;
        openAction.bodyLines.push(bodyTextLine);
        if (endsWithSemi) {
          result.nodes.push({
            kind: 'action',
            id: '__a_' + (nodeCounter++),
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

      if (START_RE.test(trimmed)) {
        result.nodes.push({ kind: 'start', id: '__a_' + (nodeCounter++), line: lineNum, endLine: lineNum, swimlaneId: null });
        continue;
      }
      if (STOP_RE.test(trimmed)) {
        result.nodes.push({ kind: 'stop', id: '__a_' + (nodeCounter++), line: lineNum, endLine: lineNum, swimlaneId: null });
        continue;
      }
      if (END_RE.test(trimmed)) {
        result.nodes.push({ kind: 'end', id: '__a_' + (nodeCounter++), line: lineNum, endLine: lineNum, swimlaneId: null });
        continue;
      }

      // Action: starts with ':', ends with ';' (single-line) or starts multi-line collection
      if (trimmed.charAt(0) === ':') {
        var closedMatch = trimmed.match(ACTION_CLOSED_RE);
        if (closedMatch) {
          result.nodes.push({
            kind: 'action',
            id: '__a_' + (nodeCounter++),
            text: closedMatch[1],
            line: lineNum,
            endLine: lineNum,
            swimlaneId: null,
          });
          continue;
        }
        // Multi-line action open: strip leading ':'
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
