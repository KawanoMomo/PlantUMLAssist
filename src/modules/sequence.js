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

  function unquote(s) {
    if (!s) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
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
      var messages = parsedData.relations;

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

        var mList = '';
        for (var j = 0; j < messages.length; j++) {
          var m = messages[j];
          mList += P.listItemHtml({
            label: m.from + ' ' + m.arrow + ' ' + m.to + (m.label ? ' : ' + m.label : ''),
            selectClass: 'seq-select-msg', deleteClass: 'seq-delete-msg',
            dataElementId: m.id, dataLine: m.line, mono: true,
          });
        }
        if (!mList) mList = P.emptyListHtml('（メッセージなし）');

        var autonumChecked = parsedData.meta.autonumber ? 'checked' : '';
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
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">参加者一覧</label>' +
            '<div>' + pList + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">メッセージ一覧</label>' +
            '<div>' + mList + '</div>' +
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

        P.bindSelectButtons(propsEl, 'seq-select-part', 'participant');
        P.bindSelectButtons(propsEl, 'seq-select-msg', 'message');
        P.bindDeleteButtons(propsEl, 'seq-delete-part', ctx, deleteLine);
        P.bindDeleteButtons(propsEl, 'seq-delete-msg', ctx, deleteLine);
        return;
      }

      if (selData.length === 1) {
        var sel = selData[0];
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
