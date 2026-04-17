'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlSequence = (function() {
  var PARTICIPANT_TYPES = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'queue', 'collections'];
  var ARROWS = ['->', '-->', '->>', '-->>', '<-', '<--', '<<-', '<<--', '<->', '<-->'];

  var PART_RE = new RegExp('^(' + PARTICIPANT_TYPES.join('|') + ')\\s+(?:"([^"]+)"\\s+as\\s+(\\S+)|(\\S+)(?:\\s+as\\s+"([^"]+)")?)\\s*$');
  var MSG_RE_FROM = '([A-Za-z_][A-Za-z0-9_]*|"[^"]+")';
  var MSG_RE = new RegExp('^' + MSG_RE_FROM + '\\s+(->|-->|->>|-->>|<-|<--|<<-|<<--|<->|<-->)\\s+' + MSG_RE_FROM + '(?:\\s*:\\s*(.+))?$');

  function unquote(s) {
    if (!s) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  function parseSequence(text) {
    var result = { meta: { title: '' }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var msgCounter = 0;
    var participantMap = {};

    function ensurePart(name) {
      var clean = unquote(name);
      if (!participantMap[clean]) {
        participantMap[clean] = {
          kind: 'participant', id: clean, label: clean, ptype: 'participant', line: 0,
        };
        result.elements.push(participantMap[clean]);
      }
      return clean;
    }

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || trimmed.indexOf("'") === 0) continue;
      if (/^@startuml/.test(trimmed) || /^@enduml/.test(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      var pm = trimmed.match(PART_RE);
      if (pm) {
        var ptype = pm[1];
        var alias, label;
        if (pm[2] !== undefined) {
          alias = pm[3];
          label = pm[2];
        } else {
          alias = pm[4];
          label = pm[5] !== undefined ? pm[5] : pm[4];
        }
        if (!participantMap[alias]) {
          participantMap[alias] = {
            kind: 'participant', id: alias, label: label, ptype: ptype, line: lineNum,
          };
          result.elements.push(participantMap[alias]);
        } else {
          participantMap[alias].ptype = ptype;
          participantMap[alias].label = label;
          participantMap[alias].line = lineNum;
        }
        continue;
      }

      var mm = trimmed.match(MSG_RE);
      if (mm) {
        var from = ensurePart(mm[1]);
        var arrow = mm[2];
        var to = ensurePart(mm[3]);
        var label = mm[4] || '';
        if (!participantMap[from].line) participantMap[from].line = lineNum;
        if (!participantMap[to].line) participantMap[to].line = lineNum;
        result.relations.push({
          kind: 'message', id: '__m_' + (msgCounter++),
          from: from, to: to, arrow: arrow, label: label, line: lineNum,
        });
      }
    }
    return result;
  }

  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml/.test(lines[i])) { endIdx = i; break; }
    }
    if (endIdx < 0) {
      var insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, newLine);
    } else {
      lines.splice(endIdx, 0, newLine);
    }
    return lines.join('\n');
  }

  function addParticipant(text, ptype, alias, label) {
    var line;
    if (label && label !== alias) {
      line = ptype + ' "' + label + '" as ' + alias;
    } else {
      line = ptype + ' ' + alias;
    }
    return insertBeforeEnd(text, line);
  }

  function addMessage(text, from, to, arrow, label) {
    var line = from + ' ' + (arrow || '->') + ' ' + to + (label ? ' : ' + label : '');
    return insertBeforeEnd(text, line);
  }

  function deleteLine(text, lineNum) {
    return window.MA.textUpdater.deleteLine(text, lineNum);
  }

  function updateParticipant(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(PART_RE);
    if (!m) return text;
    var ptype = m[1];
    var alias, label, labelImplicit = false;
    if (m[2] !== undefined) { alias = m[3]; label = m[2]; }
    else {
      alias = m[4];
      if (m[5] !== undefined) { label = m[5]; }
      else { label = m[4]; labelImplicit = true; }
    }
    if (field === 'ptype') ptype = value;
    else if (field === 'id' || field === 'alias') {
      if (labelImplicit) label = value;
      alias = value;
    }
    else if (field === 'label') label = value;
    var out = label && label !== alias ? (ptype + ' "' + label + '" as ' + alias) : (ptype + ' ' + alias);
    lines[idx] = indent + out;
    return lines.join('\n');
  }

  function updateMessage(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(MSG_RE);
    if (!m) return text;
    var from = unquote(m[1]), arrow = m[2], to = unquote(m[3]), label = m[4] || '';
    if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'arrow') arrow = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + from + ' ' + arrow + ' ' + to + (label ? ' : ' + label : '');
    return lines.join('\n');
  }

  function setTitle(text, newTitle) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+/.test(lines[i])) {
        var indent = lines[i].match(/^(\s*)/)[1];
        lines[i] = indent + 'title ' + newTitle;
        return lines.join('\n');
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (/^\s*@startuml/.test(lines[j])) {
        lines.splice(j + 1, 0, 'title ' + newTitle);
        return lines.join('\n');
      }
    }
    return text;
  }

  return {
    type: 'plantuml-sequence',
    displayName: 'Sequence',
    PARTICIPANT_TYPES: PARTICIPANT_TYPES,
    ARROWS: ARROWS,
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-sequence'; },
    parse: parseSequence,
    parseSequence: parseSequence,
    addParticipant: addParticipant,
    addMessage: addMessage,
    deleteLine: deleteLine,
    updateParticipant: updateParticipant,
    updateMessage: updateMessage,
    setTitle: setTitle,
    template: function() {
      return [
        '@startuml',
        'title Sample Sequence',
        'actor User',
        'participant System',
        'database DB',
        '',
        'User -> System : Request',
        'System -> DB : Query',
        'DB --> System : Result',
        'System --> User : Response',
        '@enduml',
      ].join('\n');
    },
    buildOverlay: function(svgEl, parsedData, overlayEl) {
      if (!overlayEl) return;
      while (overlayEl.firstChild) overlayEl.removeChild(overlayEl.firstChild);
      if (!svgEl) return;
      var viewBox = svgEl.getAttribute('viewBox');
      if (viewBox) overlayEl.setAttribute('viewBox', viewBox);
    },
    renderProps: function(selData, parsedData, propsEl, ctx) {
      if (propsEl) propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">Sequence (実装中)</p>';
    },
    operations: {
      add: function(text, kind, props) {
        if (kind === 'participant') return addParticipant(text, props.ptype || 'participant', props.alias, props.label);
        if (kind === 'message') return addMessage(text, props.from, props.to, props.arrow, props.label);
        return text;
      },
      delete: function(text, lineNum) { return deleteLine(text, lineNum); },
      update: function(text, lineNum, field, value, opts) {
        opts = opts || {};
        if (field === 'title') return setTitle(text, value);
        if (opts.kind === 'message') return updateMessage(text, lineNum, field, value);
        return updateParticipant(text, lineNum, field, value);
      },
      moveUp: function(text, lineNum) {
        if (lineNum <= 1) return text;
        return window.MA.textUpdater.swapLines(text, lineNum, lineNum - 1);
      },
      moveDown: function(text, lineNum) {
        var total = text.split('\n').length;
        if (lineNum >= total) return text;
        return window.MA.textUpdater.swapLines(text, lineNum, lineNum + 1);
      },
      connect: function(text, fromName, toName, props) {
        props = props || {};
        return addMessage(text, fromName, toName, props.arrow || '->', props.label);
      },
    },
  };
})();
