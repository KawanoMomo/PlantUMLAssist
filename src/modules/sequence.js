'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlSequence = (function() {
  var PARTICIPANT_TYPES = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'queue', 'collections'];
  var ARROWS = ['->', '-->', '->>', '-->>', '<-', '<--', '<<-', '<<--', '<->', '<-->'];
  // Display labels: UML 有識者が形で思い出せる最小の注釈を添える。
  // 形: -> 実線 / --> 破線 / ->> 開矢印 (async) / -->> 破線+開矢印 (async return)
  var ARROW_META = {
    '->':    '->    同期メッセージ (実線)',
    '-->':   '-->   返信/戻り (破線)',
    '->>':   '->>   非同期メッセージ (開矢印)',
    '-->>':  '-->>  非同期返信 (破線+開矢印)',
    '<-':    '<-    同期 (逆向き)',
    '<--':   '<--   返信 (逆向き)',
    '<<-':   '<<-   非同期 (逆向き)',
    '<<--':  '<<--  非同期返信 (逆向き)',
    '<->':   '<->   双方向 同期',
    '<-->':  '<-->  双方向 返信',
  };
  function arrowLabel(a) { return ARROW_META[a] || a; }

  var PART_RE = new RegExp('^(' + PARTICIPANT_TYPES.join('|') + ')\\s+(?:"([^"]+)"\\s+as\\s+(\\S+)|(\\S+)(?:\\s+as\\s+"([^"]+)")?)\\s*$');
  var MSG_RE_FROM = '([A-Za-z_][A-Za-z0-9_]*|"[^"]+")';
  var MSG_RE = new RegExp('^' + MSG_RE_FROM + '\\s+(->|-->|->>|-->>|<-|<--|<<-|<<--|<->|<-->)\\s+' + MSG_RE_FROM + '(?:\\s*:\\s*(.+))?$');

  var GROUP_KINDS = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group'];
  var GROUP_OPEN_RE = new RegExp('^(' + GROUP_KINDS.join('|') + ')(?:\\s+(.*))?$');
  var GROUP_ELSE_RE = /^else(?:\s+(.*))?$/;
  var GROUP_END_RE = /^end$/;

  var NOTE_POSITIONS = ['left of', 'right of', 'over'];
  var NOTE_RE = /^note\s+(left of|right of|over)\s+([^:]+?)(?:\s*:\s*(.*))?$/i;

  var ACTIVATION_ACTIONS = ['activate', 'deactivate', 'create', 'destroy'];
  var ACTIVATION_RE = new RegExp('^(' + ACTIVATION_ACTIONS.join('|') + ')\\s+(\\S+)$');

  function unquote(s) {
    if (!s) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  // Pure formatters — used by both add* (末尾追加) and _formatLine (位置駆動挿入)
  // 同一形式を一箇所で管理 (parser-format drift を防ぐ)
  function fmtMessage(from, to, arrow, label) {
    return from + ' ' + (arrow || '->') + ' ' + to + (label ? ' : ' + label : '');
  }
  function fmtNote(position, targets, text) {
    var t = Array.isArray(targets) ? targets.join(', ') : targets;
    return 'note ' + position + ' ' + t + (text ? ' : ' + text : '');
  }
  function fmtActivation(action, target) {
    return action + ' ' + target;
  }
  function fmtParticipant(ptype, alias, label) {
    return (label && label !== alias) ? ptype + ' "' + label + '" as ' + alias : ptype + ' ' + alias;
  }
  function fmtBlock(kind, label) {
    return (label ? kind + ' ' + label : kind) + '\n\nend';
  }

  function parseSequence(text) {
    var result = { meta: { title: '', autonumber: null }, elements: [], relations: [], groups: [] };
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

    var groupStack = [];
    var groupCounter = 0;
    var noteCounter = 0;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || trimmed.indexOf("'") === 0) continue;
      if (/^@startuml/.test(trimmed) || /^@enduml/.test(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      // autonumber
      if (trimmed === 'autonumber') { result.meta.autonumber = true; continue; }
      if (trimmed === 'autonumber stop' || trimmed === 'autonumber off') { result.meta.autonumber = false; continue; }
      var anMatch = trimmed.match(/^autonumber\s+(\d+)(?:\s+(\d+))?$/);
      if (anMatch) {
        result.meta.autonumber = { start: parseInt(anMatch[1], 10), step: anMatch[2] ? parseInt(anMatch[2], 10) : 1 };
        continue;
      }

      // group open (alt/opt/loop/par/break/critical/group)
      var gm = trimmed.match(GROUP_OPEN_RE);
      if (gm) {
        var g = {
          kind: 'group', gtype: gm[1], id: '__g_' + (groupCounter++),
          label: (gm[2] || '').trim(), line: lineNum, endLine: 0,
          parentId: groupStack.length > 0 ? groupStack[groupStack.length - 1].id : null,
        };
        result.groups.push(g);
        groupStack.push(g);
        continue;
      }
      if (GROUP_ELSE_RE.test(trimmed)) continue;  // else is inside alt, treat transparently
      if (GROUP_END_RE.test(trimmed)) {
        if (groupStack.length > 0) {
          var closing = groupStack.pop();
          closing.endLine = lineNum;
        }
        continue;
      }

      // activation / deactivation / create / destroy
      var am = trimmed.match(ACTIVATION_RE);
      if (am) {
        result.elements.push({
          kind: 'activation', action: am[1], target: unquote(am[2]), line: lineNum,
        });
        continue;
      }

      // note
      var nm = trimmed.match(NOTE_RE);
      if (nm) {
        var targets = nm[2].split(',').map(function(s) { return s.trim(); });
        result.elements.push({
          kind: 'note', id: '__n_' + (noteCounter++),
          position: nm[1].toLowerCase(), targets: targets,
          text: (nm[3] || '').trim(), line: lineNum,
        });
        continue;
      }

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
    return insertBeforeEnd(text, fmtParticipant(ptype, alias, label));
  }

  function addMessage(text, from, to, arrow, label) {
    return insertBeforeEnd(text, fmtMessage(from, to, arrow, label));
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

  function addGroup(text, kind, label) {
    // Insert an empty block (with "end") right before @enduml so the user
    // can move messages inside or add new ones there.
    return insertBeforeEnd(text, fmtBlock(kind, label));
  }

  function wrapWith(text, startLine, endLine, blockKind, blockLabel) {
    // Wrap an existing line range [startLine, endLine] with a block opener
    // (alt/opt/loop/...) + matching `end`. 1-based, inclusive.
    var lines = text.split('\n');
    if (startLine < 1 || endLine > lines.length || startLine > endLine) return text;
    var openLine = blockLabel ? blockKind + ' ' + blockLabel : blockKind;
    // 順序大事: 末尾を先に挿入しないと endLine のインデックスがズレる
    lines.splice(endLine, 0, 'end');
    lines.splice(startLine - 1, 0, openLine);
    return lines.join('\n');
  }

  function unwrap(text, startLine, endLine, keepInner) {
    // wrapWith の対称操作。block の開始行 / 終了行のみ削除 (中身保持) または
    // ブロック全体ごと削除 (keepInner === false 明示時のみ)。
    // startLine === endLine は無効 (block には開始と終了の2行が必要)。
    var lines = text.split('\n');
    if (startLine < 1 || endLine > lines.length || startLine >= endLine) return text;
    if (keepInner === false) {
      lines.splice(startLine - 1, endLine - startLine + 1);
    } else {
      // 順序: end 行 → open 行 (前を先に消すと endLine の index がズレる)
      lines.splice(endLine - 1, 1);
      lines.splice(startLine - 1, 1);
    }
    return lines.join('\n');
  }

  function deleteGroup(text, startLine, endLine) {
    // Remove the opening line and matching end line only — keep inner
    // contents intact so messages don't disappear.
    var lines = text.split('\n');
    if (endLine >= 1 && endLine <= lines.length) {
      lines.splice(endLine - 1, 1);
    }
    if (startLine >= 1 && startLine <= lines.length) {
      lines.splice(startLine - 1, 1);
    }
    return lines.join('\n');
  }

  function addActivation(text, action, target) {
    return insertBeforeEnd(text, fmtActivation(action, target));
  }

  function addNote(text, position, targets, noteText) {
    return insertBeforeEnd(text, fmtNote(position, targets, noteText));
  }

  // _formatLine: kind に応じて 1 行の PlantUML 文字列を生成
  //   message:     { from, to, arrow?, label? }     ← from/to 必須
  //   note:        { position, targets, text? }     ← position/targets 必須
  //   activation:  { action, target }                ← action/target 必須
  //   participant: { ptype?, alias, label? }        ← alias 必須
  //   block:       { kind, label? }                  ← props.kind は外側 kind 引数とは別 (alt/opt/loop/...)
  // 必須 props 欠落時は '' を返し、insertBefore/After 側のガードで no-op になる
  function _formatLine(kind, props) {
    if (kind === 'message') {
      if (!props.from || !props.to) return '';
      return fmtMessage(props.from, props.to, props.arrow, props.label);
    }
    if (kind === 'note') {
      if (!props.position || !props.targets || (Array.isArray(props.targets) && props.targets.length === 0)) return '';
      return fmtNote(props.position, props.targets, props.text);
    }
    if (kind === 'activation') {
      if (!props.action || !props.target) return '';
      return fmtActivation(props.action, props.target);
    }
    if (kind === 'participant') {
      if (!props.alias) return '';
      return fmtParticipant(props.ptype || 'participant', props.alias, props.label);
    }
    if (kind === 'block') {
      if (!props.kind) return '';
      return fmtBlock(props.kind, props.label);
    }
    return '';
  }

  function insertBefore(text, lineNum, kind, props) {
    var line = _formatLine(kind, props);
    if (!line) return text;
    return window.MA.textUpdater.insertAtLine(text, lineNum, line);
  }

  function insertAfter(text, lineNum, kind, props) {
    var line = _formatLine(kind, props);
    if (!line) return text;
    return window.MA.textUpdater.insertAfterLine(text, lineNum, line);
  }

  function updateNote(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(NOTE_RE);
    if (!m) return text;
    var position = m[1], targets = m[2], body = m[3] || '';
    if (field === 'position') position = value;
    else if (field === 'targets') targets = value;
    else if (field === 'text') body = value;
    lines[idx] = indent + 'note ' + position + ' ' + targets + (body ? ' : ' + body : '');
    return lines.join('\n');
  }

  function moveMessage(text, lineNum, direction) {
    // direction: -1 = up, +1 = down. Skips non-message lines (stops at
    // group boundaries and notes to keep block structure intact).
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var target = idx + direction;
    while (target >= 0 && target < lines.length) {
      var t = lines[target].trim();
      if (!t || t.indexOf("'") === 0) { target += direction; continue; }
      if (/^@startuml/.test(t) || /^@enduml/.test(t)) return text;
      break;
    }
    if (target < 0 || target >= lines.length) return text;
    var tmp = lines[idx];
    lines[idx] = lines[target];
    lines[target] = tmp;
    return lines.join('\n');
  }

  function toggleAutonumber(text) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*autonumber(\s|$)/.test(lines[i])) {
        lines.splice(i, 1);
        return lines.join('\n');
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (/^\s*@startuml/.test(lines[j])) {
        // Insert after title line if present, otherwise right after @startuml.
        var insertAt = j + 1;
        while (insertAt < lines.length && /^\s*title\s+/.test(lines[insertAt])) insertAt++;
        lines.splice(insertAt, 0, 'autonumber');
        return lines.join('\n');
      }
    }
    return text;
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
    toggleAutonumber: toggleAutonumber,
    addGroup: addGroup,
    deleteGroup: deleteGroup,
    wrapWith: wrapWith,
    unwrap: unwrap,
    addNote: addNote,
    updateNote: updateNote,
    moveMessage: moveMessage,
    addActivation: addActivation,
    insertBefore: insertBefore,
    insertAfter: insertAfter,
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
      if (!propsEl) return;
      var escHtml = window.MA.htmlUtils.escHtml;
      var P = window.MA.properties;
      var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
      var notes = parsedData.elements.filter(function(e) { return e.kind === 'note'; });
      var activations = parsedData.elements.filter(function(e) { return e.kind === 'activation'; });
      var messages = parsedData.relations;
      var groups = parsedData.groups || [];

      if (!selData || selData.length === 0) {
        var pTypeOpts = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === 'participant' }; });
        var arrowOpts = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === '->' }; });
        var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
        if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者を先に追加）' }];

        var pList = '';
        for (var i = 0; i < participants.length; i++) {
          var p = participants[i];
          pList += P.listItemHtml({
            label: p.ptype + ' ' + p.label + (p.label !== p.id ? ' (as ' + p.id + ')' : ''),
            selectClass: 'seq-select-part', deleteClass: 'seq-delete-part',
            dataElementId: p.id, dataLine: p.line,
          });
        }
        if (!pList) pList = P.emptyListHtml('（参加者なし）');

        // Message list: adds ↑/↓ buttons inline so users can reorder
        // without rewriting text by hand.
        var mList = '';
        for (var j = 0; j < messages.length; j++) {
          var m = messages[j];
          var msgLabel = m.from + ' ' + m.arrow + ' ' + m.to + (m.label ? ' : ' + m.label : '');
          mList +=
            '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;padding:3px 4px;background:var(--bg-tertiary);border-radius:3px;font-size:11px;">' +
              '<div style="flex:1;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono);">' + escHtml(msgLabel) + '</div>' +
              '<button class="seq-msg-up" data-line="' + m.line + '" title="上へ移動" style="background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">↑</button>' +
              '<button class="seq-msg-down" data-line="' + m.line + '" title="下へ移動" style="background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">↓</button>' +
              '<button class="seq-select-msg" data-element-id="' + escHtml(m.id) + '" data-line="' + m.line + '" style="background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">編集</button>' +
              '<button class="seq-delete-msg" data-line="' + m.line + '" style="background:var(--accent-red);color:#fff;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✕</button>' +
            '</div>';
        }
        if (!mList) mList = P.emptyListHtml('（メッセージなし）');

        // Group list (alt/opt/loop/par/...)
        var gList = '';
        for (var gi = 0; gi < groups.length; gi++) {
          var gr = groups[gi];
          gList += P.listItemHtml({
            label: gr.gtype + (gr.label ? ' ' + gr.label : ''),
            sublabel: 'L' + gr.line + '-' + gr.endLine,
            deleteClass: 'seq-delete-group',
            dataLine: gr.line, dataEndLine: gr.endLine, mono: true,
          });
        }
        if (!gList) gList = P.emptyListHtml('（ブロックなし）');

        // Activation list
        var aList = '';
        for (var ai = 0; ai < activations.length; ai++) {
          var ac = activations[ai];
          aList += P.listItemHtml({
            label: ac.action + ' ' + ac.target,
            deleteClass: 'seq-delete-activation',
            dataLine: ac.line, mono: true,
          });
        }
        if (!aList) aList = P.emptyListHtml('（アクティベーションなし）');

        // Note list
        var nList = '';
        for (var ni = 0; ni < notes.length; ni++) {
          var n = notes[ni];
          var nLabel = 'note ' + n.position + ' ' + n.targets.join(',') + (n.text ? ' : ' + n.text : '');
          nList += P.listItemHtml({
            label: nLabel,
            selectClass: 'seq-select-note', deleteClass: 'seq-delete-note',
            dataElementId: n.id, dataLine: n.line, mono: true,
          });
        }
        if (!nList) nList = P.emptyListHtml('（注釈なし）');

        var autonumChecked = parsedData.meta.autonumber ? 'checked' : '';
        var groupKindOpts = GROUP_KINDS.map(function(k) { return { value: k, label: k, selected: k === 'alt' }; });
        var notePosOpts = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === 'over' }; });
        var noteTargetOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
        if (noteTargetOpts.length === 0) noteTargetOpts = [{ value: '', label: '（参加者を先に追加）' }];
        var actionOpts = [
          { value: 'activate',   label: 'activate (アクティブ化)',        selected: true },
          { value: 'deactivate', label: 'deactivate (非アクティブ化)' },
          { value: 'create',     label: 'create (参加者の生成)' },
          { value: 'destroy',    label: 'destroy (参加者の破棄)' },
        ];
        propsEl.innerHTML =
          '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Sequence</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
            P.fieldHtml('Title', 'seq-title', parsedData.meta.title) +
            P.primaryButtonHtml('seq-set-title', 'Title 適用') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-primary);cursor:pointer;">' +
              '<input id="seq-autonumber" type="checkbox" ' + autonumChecked + '>' +
              ' autonumber (自動採番)' +
            '</label>' +
            '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;">有効にすると各メッセージに通し番号が付きます</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">参加者を追加</label>' +
            P.selectFieldHtml('Type', 'seq-add-ptype', pTypeOpts) +
            P.fieldHtml('Alias', 'seq-add-alias', '', '例: user1') +
            P.fieldHtml('Label (省略可)', 'seq-add-label', '') +
            P.primaryButtonHtml('seq-add-part-btn', '+ 参加者追加') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">メッセージを追加</label>' +
            P.selectFieldHtml('From', 'seq-add-from', partOpts) +
            P.selectFieldHtml('Arrow', 'seq-add-arrow', arrowOpts) +
            P.selectFieldHtml('To', 'seq-add-to', partOpts) +
            P.fieldHtml('Label', 'seq-add-msg-label', '', '省略可') +
            P.primaryButtonHtml('seq-add-msg-btn', '+ メッセージ追加') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">ブロックを追加 (alt/opt/loop/par…)</label>' +
            P.selectFieldHtml('Kind', 'seq-add-group-kind', groupKindOpts) +
            P.fieldHtml('Label/Condition', 'seq-add-group-label', '', '例: x > 0 / retry') +
            P.primaryButtonHtml('seq-add-group-btn', '+ ブロック追加') +
            '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;">空のブロックを末尾に挿入します。中身はエディタまたはメッセージ追加で入れてください。</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">ライフライン制御 (activate/deactivate)</label>' +
            P.selectFieldHtml('Action', 'seq-add-act-action', actionOpts) +
            P.selectFieldHtml('Target', 'seq-add-act-target', noteTargetOpts) +
            P.primaryButtonHtml('seq-add-act-btn', '+ ライフライン操作 追加') +
            '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;">アクティベーションバー (太い縦帯) の表示/非表示を制御します。</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">注釈 (note) を追加</label>' +
            P.selectFieldHtml('Position', 'seq-add-note-pos', notePosOpts) +
            P.selectFieldHtml('Target', 'seq-add-note-target', noteTargetOpts) +
            P.fieldHtml('Text', 'seq-add-note-text', '', '注釈本文') +
            P.primaryButtonHtml('seq-add-note-btn', '+ 注釈追加') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">参加者一覧</label>' +
            '<div>' + pList + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">メッセージ一覧 (↑↓で並び替え)</label>' +
            '<div>' + mList + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">ブロック一覧</label>' +
            '<div>' + gList + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">ライフライン操作一覧</label>' +
            '<div>' + aList + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">注釈一覧</label>' +
            '<div>' + nList + '</div>' +
          '</div>';

        P.bindEvent('seq-set-title', 'click', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('seq-title').value.trim()));
          ctx.onUpdate();
        });
        P.bindEvent('seq-autonumber', 'change', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(toggleAutonumber(ctx.getMmdText()));
          ctx.onUpdate();
        });
        P.bindEvent('seq-add-part-btn', 'click', function() {
          var pt = document.getElementById('seq-add-ptype').value;
          var al = document.getElementById('seq-add-alias').value.trim();
          var lb = document.getElementById('seq-add-label').value.trim();
          if (!al) { alert('Alias は必須です'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(addParticipant(ctx.getMmdText(), pt, al, lb || al));
          ctx.onUpdate();
        });
        P.bindEvent('seq-add-msg-btn', 'click', function() {
          var f = document.getElementById('seq-add-from').value;
          var t = document.getElementById('seq-add-to').value;
          var a = document.getElementById('seq-add-arrow').value;
          var l = document.getElementById('seq-add-msg-label').value.trim();
          if (!f || !t) { alert('From/To 必須'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(addMessage(ctx.getMmdText(), f, t, a, l));
          ctx.onUpdate();
        });

        P.bindEvent('seq-add-group-btn', 'click', function() {
          var k = document.getElementById('seq-add-group-kind').value;
          var l = document.getElementById('seq-add-group-label').value.trim();
          window.MA.history.pushHistory();
          ctx.setMmdText(addGroup(ctx.getMmdText(), k, l));
          ctx.onUpdate();
        });
        P.bindEvent('seq-add-note-btn', 'click', function() {
          var pos = document.getElementById('seq-add-note-pos').value;
          var tgt = document.getElementById('seq-add-note-target').value;
          var txt = document.getElementById('seq-add-note-text').value.trim();
          if (!tgt) { alert('Target 参加者を選択してください'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(addNote(ctx.getMmdText(), pos, [tgt], txt));
          ctx.onUpdate();
        });
        P.bindEvent('seq-add-act-btn', 'click', function() {
          var act = document.getElementById('seq-add-act-action').value;
          var tgt = document.getElementById('seq-add-act-target').value;
          if (!tgt) { alert('Target 参加者を選択してください'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(addActivation(ctx.getMmdText(), act, tgt));
          ctx.onUpdate();
        });

        P.bindSelectButtons(propsEl, 'seq-select-part', 'participant');
        P.bindSelectButtons(propsEl, 'seq-select-msg', 'message');
        P.bindSelectButtons(propsEl, 'seq-select-note', 'note');
        P.bindDeleteButtons(propsEl, 'seq-delete-part', ctx, deleteLine);
        P.bindDeleteButtons(propsEl, 'seq-delete-msg', ctx, deleteLine);
        P.bindDeleteButtons(propsEl, 'seq-delete-note', ctx, deleteLine);
        P.bindDeleteButtons(propsEl, 'seq-delete-activation', ctx, deleteLine);
        P.bindDeleteButtons(propsEl, 'seq-delete-group', ctx, deleteGroup, true);

        // Reorder buttons
        P.bindAllByClass(propsEl, 'seq-msg-up', function(btn) {
          var ln = parseInt(btn.getAttribute('data-line'), 10);
          if (isNaN(ln)) return;
          window.MA.history.pushHistory();
          ctx.setMmdText(moveMessage(ctx.getMmdText(), ln, -1));
          ctx.onUpdate();
        });
        P.bindAllByClass(propsEl, 'seq-msg-down', function(btn) {
          var ln = parseInt(btn.getAttribute('data-line'), 10);
          if (isNaN(ln)) return;
          window.MA.history.pushHistory();
          ctx.setMmdText(moveMessage(ctx.getMmdText(), ln, 1));
          ctx.onUpdate();
        });
        return;
      }

      if (selData.length === 1) {
        var sel = selData[0];
        if (sel.type === 'note') {
          var nn = null;
          for (var ki = 0; ki < parsedData.elements.length; ki++) {
            var e0 = parsedData.elements[ki];
            if (e0.kind === 'note' && e0.id === sel.id) { nn = e0; break; }
          }
          if (!nn) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">注釈が見つかりません</p>'; return; }
          var nPosOpts = NOTE_POSITIONS.map(function(pp) { return { value: pp, label: pp, selected: pp === nn.position }; });
          propsEl.innerHTML =
            P.panelHeaderHtml('Note') +
            P.selectFieldHtml('Position', 'seq-edit-note-pos', nPosOpts) +
            P.fieldHtml('Target(s)', 'seq-edit-note-targets', nn.targets.join(', '), 'Alice / Alice, Bob') +
            P.fieldHtml('Text', 'seq-edit-note-text', nn.text) +
            P.dangerButtonHtml('seq-edit-note-delete', '注釈削除');
          var nln = nn.line;
          [['pos', 'position'], ['targets', 'targets'], ['text', 'text']].forEach(function(pair) {
            document.getElementById('seq-edit-note-' + pair[0]).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateNote(ctx.getMmdText(), nln, pair[1], this.value));
              ctx.onUpdate();
            });
          });
          P.bindEvent('seq-edit-note-delete', 'click', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteLine(ctx.getMmdText(), nln));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
          return;
        }
        if (sel.type === 'participant') {
          var pp = null;
          for (var ii = 0; ii < participants.length; ii++) if (participants[ii].id === sel.id) { pp = participants[ii]; break; }
          if (!pp) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">参加者が見つかりません</p>'; return; }
          var pOpts2 = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === pp.ptype }; });
          propsEl.innerHTML =
            P.panelHeaderHtml(pp.label) +
            P.selectFieldHtml('Type', 'seq-edit-ptype', pOpts2) +
            P.fieldHtml('Alias', 'seq-edit-alias', pp.id) +
            P.fieldHtml('Label', 'seq-edit-label', pp.label) +
            P.dangerButtonHtml('seq-edit-delete', '参加者削除');
          var ln = pp.line;
          ['ptype', 'alias', 'label'].forEach(function(f) {
            document.getElementById('seq-edit-' + f).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateParticipant(ctx.getMmdText(), ln, f, this.value));
              ctx.onUpdate();
            });
          });
          P.bindEvent('seq-edit-delete', 'click', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteLine(ctx.getMmdText(), ln));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
          return;
        }
        if (sel.type === 'message') {
          var mm = null;
          for (var jj = 0; jj < messages.length; jj++) if (messages[jj].id === sel.id) { mm = messages[jj]; break; }
          if (!mm) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">メッセージが見つかりません</p>'; return; }
          var partOpts2 = participants.map(function(p) { return { value: p.id, label: p.label }; });
          var fromOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.from }; });
          var toOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.to }; });
          var arrowOpts2 = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === mm.arrow }; });
          propsEl.innerHTML =
            P.panelHeaderHtml('Message') +
            P.selectFieldHtml('From', 'seq-edit-from', fromOpts) +
            P.selectFieldHtml('Arrow', 'seq-edit-arrow', arrowOpts2) +
            P.selectFieldHtml('To', 'seq-edit-to', toOpts) +
            P.fieldHtml('Label', 'seq-edit-msg-label', mm.label) +
            P.dangerButtonHtml('seq-edit-msg-delete', 'メッセージ削除');
          var mln = mm.line;
          ['from', 'arrow', 'to'].forEach(function(f) {
            document.getElementById('seq-edit-' + f).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, f, this.value));
              ctx.onUpdate();
            });
          });
          document.getElementById('seq-edit-msg-label').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, 'label', this.value));
            ctx.onUpdate();
          });
          P.bindEvent('seq-edit-msg-delete', 'click', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteLine(ctx.getMmdText(), mln));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
          return;
        }
      }

      propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">未対応の選択状態</p>';
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
