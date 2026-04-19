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
    var result = { meta: { title: '', autonumber: null, startUmlLine: null }, elements: [], relations: [], groups: [] };
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
      if (/^@startuml/.test(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (/^@enduml/.test(trimmed)) continue;

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

      var partTrimmed = trimmed.replace(/\s+#[0-9A-Fa-f]{6}\s*$/, '');
      var pm = partTrimmed.match(PART_RE);
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

  function bindActionBar(propsEl, ctx) {
    var P = window.MA.properties;
    P.bindAllByClass(propsEl, 'seq-insert-msg-before', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showInsertForm(ctx, ln, 'before', 'message');
    });
    P.bindAllByClass(propsEl, 'seq-insert-msg-after', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showInsertForm(ctx, ln, 'after', 'message');
    });
    P.bindAllByClass(propsEl, 'seq-insert-note-after', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showInsertForm(ctx, ln, 'after', 'note');
    });
    P.bindAllByClass(propsEl, 'seq-wrap-block', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      var kind = prompt('ブロック種類 (alt/opt/loop/par)', 'alt');
      if (!kind) return;
      var label = prompt('Label/Condition', '');
      window.MA.history.pushHistory();
      ctx.setMmdText(wrapWith(ctx.getMmdText(), ln, ln, kind, label || ''));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-move-up', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(moveMessage(ctx.getMmdText(), ln, -1));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-move-down', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(moveMessage(ctx.getMmdText(), ln, 1));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-delete-line', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), ln));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    // C3: participant 左右挿入 (participant 選択時のみ描画される)
    P.bindAllByClass(propsEl, 'seq-insert-part-before', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      var alias = prompt('新しい参加者の Alias');
      if (!alias) return;
      var ptype = prompt('Type (participant/actor/database/boundary/control/entity/queue/collections)', 'participant');
      window.MA.history.pushHistory();
      ctx.setMmdText(insertBefore(ctx.getMmdText(), ln, 'participant', { ptype: ptype || 'participant', alias: alias }));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-insert-part-after', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      var alias = prompt('新しい参加者の Alias');
      if (!alias) return;
      var ptype = prompt('Type (participant/actor/database/boundary/control/entity/queue/collections)', 'participant');
      window.MA.history.pushHistory();
      ctx.setMmdText(insertAfter(ctx.getMmdText(), ln, 'participant', { ptype: ptype || 'participant', alias: alias }));
      ctx.onUpdate();
    });
    // C9: メッセージ選択時、対応する activate/deactivate を推論挿入
    P.bindAllByClass(propsEl, 'seq-infer-activation', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(inferActivations(ctx.getMmdText(), ln));
      ctx.onUpdate();
    });
  }

  function _showInsertForm(ctx, line, position, kind) {
    var modal = document.getElementById('seq-modal');
    var content = document.getElementById('seq-modal-content');
    var P = window.MA.properties;
    var parsed = parseSequence(ctx.getMmdText());
    var participants = parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
    if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者なし）' }];
    // message 時のみ '+ 新規追加…' option を付与 (tail-add と同パターン)
    var partOptsWithNew = partOpts.slice();
    partOptsWithNew.push({ value: '__new__', label: '+ 新規追加…' });

    var title = (position === 'before' ? '前に' : '後に') + (kind === 'message' ? 'メッセージを挿入' : '注釈を挿入');
    var html = '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">' + title + '</h3>';
    if (kind === 'message') {
      var arrowOpts = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === '->' }; });
      html +=
        P.selectFieldHtml('From', 'seq-mod-from', partOptsWithNew) +
        P.selectFieldHtml('Arrow', 'seq-mod-arrow', arrowOpts) +
        P.selectFieldHtml('To', 'seq-mod-to', partOptsWithNew) +
        '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-mod-label-rle"></div></div>';
    } else if (kind === 'note') {
      var posOpts = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === 'over' }; });
      html +=
        P.selectFieldHtml('Position', 'seq-mod-npos', posOpts) +
        P.selectFieldHtml('Target', 'seq-mod-ntarget', partOpts) +
        '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-mod-ntext-rle"></div></div>';
    }
    if (kind === 'message') {
      html +=
        '<div id="seq-mod-new-inline" style="display:none;margin-top:6px;padding:8px;background:var(--bg-tertiary);border-left:3px solid var(--accent-green);border-radius:3px;">' +
          '<label style="display:block;font-size:10px;color:var(--accent-green);margin-bottom:4px;">新しい参加者を作成</label>' +
          '<input id="seq-mod-new-alias" type="text" placeholder="Alias (必須)" style="width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;margin-bottom:4px;">' +
          '<select id="seq-mod-new-ptype" style="width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;">' +
            PARTICIPANT_TYPES.map(function(pt) { return '<option value="' + pt + '">' + pt + '</option>'; }).join('') +
          '</select>' +
        '</div>';
    }
    html +=
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="seq-mod-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="seq-mod-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    content.innerHTML = html;
    modal.style.display = 'flex';

    var rleObj = null;
    if (kind === 'message') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-mod-label-rle'), '');
    else if (kind === 'note') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-mod-ntext-rle'), '');

    // From/To で '__new__' が選ばれたら inline 入力を表示/非表示
    if (kind === 'message') {
      var inlineEl = document.getElementById('seq-mod-new-inline');
      function maybeShowInline() {
        var frSel = document.getElementById('seq-mod-from');
        var toSel = document.getElementById('seq-mod-to');
        if (!frSel || !toSel || !inlineEl) return;
        inlineEl.style.display = (frSel.value === '__new__' || toSel.value === '__new__') ? 'block' : 'none';
      }
      var frSel = document.getElementById('seq-mod-from');
      var toSel = document.getElementById('seq-mod-to');
      if (frSel) frSel.addEventListener('change', maybeShowInline);
      if (toSel) toSel.addEventListener('change', maybeShowInline);
    }

    document.getElementById('seq-mod-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
    });
    document.getElementById('seq-mod-confirm').addEventListener('click', function() {
      var t = ctx.getMmdText();
      var insertFn = position === 'before' ? insertBefore : insertAfter;
      if (kind === 'message') {
        var fr = document.getElementById('seq-mod-from').value;
        var to = document.getElementById('seq-mod-to').value;
        if (fr === '__new__' || to === '__new__') {
          var al = document.getElementById('seq-mod-new-alias').value.trim();
          if (!al) { alert('新しい参加者の Alias は必須です'); return; }
          var ptype = document.getElementById('seq-mod-new-ptype').value;
          window.MA.history.pushHistory();
          t = addParticipant(t, ptype, al, al);
          if (fr === '__new__') fr = al;
          if (to === '__new__') to = al;
        } else {
          window.MA.history.pushHistory();
        }
        t = insertFn(t, line, 'message', {
          from: fr,
          to: to,
          arrow: document.getElementById('seq-mod-arrow').value,
          label: rleObj ? rleObj.getValue() : '',
        });
      } else if (kind === 'note') {
        window.MA.history.pushHistory();
        t = insertFn(t, line, 'note', {
          position: document.getElementById('seq-mod-npos').value,
          targets: [document.getElementById('seq-mod-ntarget').value],
          text: rleObj ? rleObj.getValue() : '',
        });
      }
      ctx.setMmdText(t);
      modal.style.display = 'none';
      ctx.onUpdate();
    });
  }

  // renameWithRefs: participant の id (alias) を別名へ。本文中の参照
  // (message from/to, activate/deactivate target, note target など) も
  // 単語境界 \b で同時更新する。コメント行 (' 始まり) と "..." 内のラベル
  // 文字列は保護 (alias != label のとき label が誤置換されるのを防ぐ)。
  // PlantUML identifier は ASCII 英数 + _ を想定 (\b で十分)。
  function renameWithRefs(text, oldId, newId) {
    if (!oldId || !newId || oldId === newId) return text;
    var escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var pattern = new RegExp('\\b' + escaped + '\\b', 'g');
    return text.split('\n').map(function(line) {
      if (/^\s*'/.test(line)) return line;
      // "..." の中身は temporarily 取り除いて置換、最後に復元 (label 保護)。
      // sentinel は制御文字 \u0001 \u0002 で囲み \b 境界に晒さない (識別子と
      // 衝突しないため、ユーザが「\u0001 を含む alias を使う」現実離れした
      // ケース以外で安全)。
      var quoted = [];
      var stripped = line.replace(/"[^"]*"/g, function(m) {
        quoted.push(m);
        return '\u0001' + (quoted.length - 1) + '\u0002';
      });
      var replaced = stripped.replace(pattern, newId);
      return replaced.replace(/\u0001(\d+)\u0002/g, function(_, idx) {
        return quoted[parseInt(idx, 10)];
      });
    }).join('\n');
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

  function duplicateRange(text, startLine, endLine, insertAfterLine) {
    // 範囲 [startLine, endLine] (1-based, inclusive) を複製し、
    // insertAfterLine の後ろ (= splice index = insertAfterLine) に挿入する。
    // insertAfterLine === 0 は先頭挿入。range 内/重複位置への挿入も許容
    // (元 lines のスナップショットを slice 後に splice するため安全)。
    var lines = text.split('\n');
    if (startLine < 1 || endLine > lines.length || startLine > endLine) return text;
    if (insertAfterLine < 0 || insertAfterLine > lines.length) return text;
    var copy = lines.slice(startLine - 1, endLine).slice();
    Array.prototype.splice.apply(lines, [insertAfterLine, 0].concat(copy));
    return lines.join('\n');
  }

  function inferActivations(text, msgLine) {
    // 指定行のメッセージ (from -> to) について、
    //   1) 直後に `activate <to>` を挿入
    //   2) 同じ to から from への dashed reply (--/-->/-->>/<--/<<--) があれば
    //      その直後に `deactivate <to>` を挿入
    // re-parse コスト: O(N) 1 回。activate 挿入で行番号が +1 ずれるので、
    // 元 parsed の reply.line に +1 して挿入位置を合わせる (再 parse はしない)。
    var parsed = parseSequence(text);
    var msg = null;
    for (var i = 0; i < parsed.relations.length; i++) {
      if (parsed.relations[i].line === msgLine) { msg = parsed.relations[i]; break; }
    }
    if (!msg) return text;
    var out = window.MA.textUpdater.insertAfterLine(text, msgLine, fmtActivation('activate', msg.to));
    var replyLine = null;
    for (var j = 0; j < parsed.relations.length; j++) {
      var r = parsed.relations[j];
      if (r.line <= msgLine) continue;
      if (r.from === msg.to && r.to === msg.from && /^--/.test(r.arrow)) {
        replyLine = r.line + 1; // activate 挿入で 1 行ずれた
        break;
      }
    }
    if (replyLine !== null) {
      out = window.MA.textUpdater.insertAfterLine(out, replyLine, fmtActivation('deactivate', msg.to));
    }
    return out;
  }

  function moveParticipant(text, alias, newIndex) {
    if (!alias) return text;
    var lines = text.split('\n');
    var partIndexes = [];
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      // color suffix を除去してから match
      var withoutColor = trimmed.replace(/\s+#[0-9A-Fa-f]{6}\s*$/, '');
      var m = withoutColor.match(PART_RE);
      if (m) {
        var al = (m[2] !== undefined) ? m[3] : m[4];
        partIndexes.push({ lineIdx: i, alias: al });
      }
    }
    var from = -1;
    for (var j = 0; j < partIndexes.length; j++) {
      if (partIndexes[j].alias === alias) { from = j; break; }
    }
    if (from < 0) return text;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= partIndexes.length) newIndex = partIndexes.length - 1;
    if (from === newIndex) return text;
    var fromLineIdx = partIndexes[from].lineIdx;
    var lineContent = lines[fromLineIdx];
    lines.splice(fromLineIdx, 1);
    var remaining = partIndexes.filter(function(p, idx) { return idx !== from; });
    var toLineIdx;
    if (newIndex >= remaining.length) {
      toLineIdx = remaining[remaining.length - 1].lineIdx + 1;
      if (fromLineIdx < toLineIdx) toLineIdx--;
    } else {
      toLineIdx = remaining[newIndex].lineIdx;
      if (fromLineIdx < toLineIdx) toLineIdx--;
    }
    lines.splice(toLineIdx, 0, lineContent);
    return lines.join('\n');
  }

  function setParticipantColor(text, alias, hex) {
    if (!alias) return text;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var trimmed = ln.trim();
      // match: line ends with optional #HEX, strip first
      var withoutColor = trimmed.replace(/\s+#[0-9A-Fa-f]{6}\s*$/, '');
      var m = withoutColor.match(PART_RE);
      if (!m) continue;
      var aliasInLine = (m[2] !== undefined) ? m[3] : m[4];
      if (aliasInLine !== alias) continue;
      // 既存の末尾 #HEX を除去
      var indent = ln.match(/^(\s*)/)[1];
      var base = indent + withoutColor;
      if (hex) {
        lines[i] = base + ' ' + hex;
      } else {
        lines[i] = base;
      }
      break;
    }
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
    renameWithRefs: renameWithRefs,
    duplicateRange: duplicateRange,
    inferActivations: inferActivations,
    setParticipantColor: setParticipantColor,
    moveParticipant: moveParticipant,
    showInsertForm: function(ctx, line, position, kind) {
      _showInsertForm(ctx, line, position, kind);
    },
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
      if (window.MA.sequenceOverlay && window.MA.sequenceOverlay.buildSequenceOverlay) {
        return window.MA.sequenceOverlay.buildSequenceOverlay(svgEl, parsedData, overlayEl);
      }
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
        var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
        var autonumChecked = parsedData.meta.autonumber ? 'checked' : '';
        propsEl.innerHTML =
          '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Sequence Diagram</div>' +
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
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
            P.selectFieldHtml('種類', 'seq-tail-kind', [
              { value: 'message', label: 'メッセージ', selected: true },
              { value: 'participant', label: '参加者' },
              { value: 'note', label: '注釈 (note)' },
              { value: 'block', label: 'ブロック (alt/loop/...)' },
              { value: 'activation', label: 'ライフライン (activate/deactivate)' },
            ]) +
            '<div id="seq-tail-detail" style="margin-top:6px;"></div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">' +
            'プレビュー上で要素をクリックすると編集パネルが開きます' +
          '</div>';

        // Title button
        P.bindEvent('seq-set-title', 'click', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('seq-title').value.trim()));
          ctx.onUpdate();
        });
        // autonumber checkbox
        P.bindEvent('seq-autonumber', 'change', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(toggleAutonumber(ctx.getMmdText()));
          ctx.onUpdate();
        });
        // 末尾追加: 種類 select で詳細フォーム切替
        var renderTailDetail = function() {
          var kind = document.getElementById('seq-tail-kind').value;
          var detailEl = document.getElementById('seq-tail-detail');
          var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
          if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者なし）' }];
          var html = '';
          if (kind === 'message') {
            var arrowOpts = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === '->' }; });
            var partOptsWithNew = partOpts.slice();
            partOptsWithNew.push({ value: '__new__', label: '+ 新規追加…' });
            html =
              P.selectFieldHtml('From', 'seq-tail-from', partOptsWithNew) +
              P.selectFieldHtml('Arrow', 'seq-tail-arrow', arrowOpts) +
              P.selectFieldHtml('To', 'seq-tail-to', partOptsWithNew) +
              '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-tail-label-rle"></div></div>';
            html +=
              '<div id="seq-tail-new-inline" style="display:none;margin-top:6px;padding:8px;background:var(--bg-tertiary);border-left:3px solid var(--accent-green);border-radius:3px;">' +
                '<label style="display:block;font-size:10px;color:var(--accent-green);margin-bottom:4px;">新しい参加者を作成</label>' +
                '<input id="seq-tail-new-alias" type="text" placeholder="Alias (必須)" style="width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;margin-bottom:4px;">' +
                '<select id="seq-tail-new-ptype" style="width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;">' +
                  PARTICIPANT_TYPES.map(function(pt) { return '<option value="' + pt + '">' + pt + '</option>'; }).join('') +
                '</select>' +
              '</div>';
            html += P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'participant') {
            var pTypeOpts = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === 'participant' }; });
            html =
              P.selectFieldHtml('Type', 'seq-tail-ptype', pTypeOpts) +
              P.fieldHtml('Alias', 'seq-tail-alias', '', '例: user1') +
              P.fieldHtml('Label', 'seq-tail-plabel', '', '省略可') +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'note') {
            var posOpts = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === 'over' }; });
            html =
              P.selectFieldHtml('Position', 'seq-tail-npos', posOpts) +
              P.selectFieldHtml('Target', 'seq-tail-ntarget', partOpts) +
              '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Text</label><div id="seq-tail-ntext-rle"></div></div>' +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'block') {
            var bkOpts = GROUP_KINDS.map(function(k) { return { value: k, label: k, selected: k === 'alt' }; });
            html =
              P.selectFieldHtml('Kind', 'seq-tail-bkind', bkOpts) +
              P.fieldHtml('Label', 'seq-tail-blabel', '', '例: x > 0') +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'activation') {
            html =
              P.selectFieldHtml('Action', 'seq-tail-aact', [
                { value: 'activate', label: 'activate', selected: true },
                { value: 'deactivate', label: 'deactivate' },
              ]) +
              P.selectFieldHtml('Target', 'seq-tail-atgt', partOpts) +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          }
          detailEl.innerHTML = html;
          var rleObj = null;
          if (kind === 'message') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-tail-label-rle'), '');
          else if (kind === 'note') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-tail-ntext-rle'), '');
          if (kind === 'message') {
            var inline = document.getElementById('seq-tail-new-inline');
            function maybeShowInline() {
              var frSel = document.getElementById('seq-tail-from');
              var toSel = document.getElementById('seq-tail-to');
              if (!frSel || !toSel) return;
              inline.style.display = (frSel.value === '__new__' || toSel.value === '__new__') ? 'block' : 'none';
            }
            var frSel = document.getElementById('seq-tail-from');
            var toSel = document.getElementById('seq-tail-to');
            if (frSel) frSel.addEventListener('change', maybeShowInline);
            if (toSel) toSel.addEventListener('change', maybeShowInline);
          }
          P.bindEvent('seq-tail-add', 'click', function() {
            var t = ctx.getMmdText();
            var out;
            if (kind === 'message') {
              var fr = document.getElementById('seq-tail-from').value;
              var to = document.getElementById('seq-tail-to').value;
              var arrow = document.getElementById('seq-tail-arrow').value;
              var labelVal = (rleObj ? rleObj.getValue() : '').trim();
              if (fr === '__new__' || to === '__new__') {
                var al = document.getElementById('seq-tail-new-alias').value.trim();
                if (!al) { alert('新しい参加者の Alias は必須です'); return; }
                var ptype = document.getElementById('seq-tail-new-ptype').value;
                window.MA.history.pushHistory();
                t = addParticipant(t, ptype, al, al);
                if (fr === '__new__') fr = al;
                if (to === '__new__') to = al;
              } else {
                window.MA.history.pushHistory();
              }
              out = addMessage(t, fr, to, arrow, labelVal);
            } else if (kind === 'participant') {
              var al = document.getElementById('seq-tail-alias').value.trim();
              if (!al) { alert('Alias 必須'); return; }
              window.MA.history.pushHistory();
              out = addParticipant(t, document.getElementById('seq-tail-ptype').value, al, document.getElementById('seq-tail-plabel').value.trim() || al);
            } else if (kind === 'note') {
              var ntg = document.getElementById('seq-tail-ntarget').value;
              if (!ntg) { alert('Target 必須'); return; }
              window.MA.history.pushHistory();
              out = addNote(t, document.getElementById('seq-tail-npos').value, [ntg], (rleObj ? rleObj.getValue() : '').trim());
            } else if (kind === 'block') {
              window.MA.history.pushHistory();
              out = addGroup(t, document.getElementById('seq-tail-bkind').value, document.getElementById('seq-tail-blabel').value.trim());
            } else if (kind === 'activation') {
              var atg = document.getElementById('seq-tail-atgt').value;
              if (!atg) { alert('Target 必須'); return; }
              window.MA.history.pushHistory();
              out = addActivation(t, document.getElementById('seq-tail-aact').value, atg);
            }
            ctx.setMmdText(out);
            ctx.onUpdate();
          });
        };
        renderTailDetail();
        P.bindEvent('seq-tail-kind', 'change', renderTailDetail);
        return;
      }

      if (selData.length === 1) {
        var sel = selData[0];

        // ヘルパ: 共通の挿入アクションバー (要素の line を起点)
        // kind: 'message' | 'participant' | 'note' | 'activation'
        //   - 'participant': 参加者左右挿入ボタンを前置
        //   - 'message': ライフライン推論ボタンを末尾に追加
        function actionBarHtml(line, kind) {
          var partInsert = '';
          if (kind === 'participant') {
            partInsert =
              '<button class="seq-insert-part-before" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">← 左に参加者追加</button>' +
              '<button class="seq-insert-part-after" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">→ 右に参加者追加</button>';
          }
          var msgOnlyButtons = '';
          if (kind === 'message') {
            msgOnlyButtons =
              '<button class="seq-infer-activation" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">⚡ ライフライン推論 (activate/deactivate)</button>';
          }
          return '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">この位置に挿入</label>' +
            partInsert +
            '<button class="seq-insert-msg-before" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">↑ この前にメッセージ追加</button>' +
            '<button class="seq-insert-msg-after" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">↓ この後にメッセージ追加</button>' +
            '<button class="seq-insert-note-after" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">↓ この後に注釈追加</button>' +
            '<button class="seq-wrap-block" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">⌗ alt/loop で囲む…</button>' +
            msgOnlyButtons +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;display:flex;gap:4px;">' +
            '<button class="seq-move-up" data-line="' + line + '" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
            '<button class="seq-move-down" data-line="' + line + '" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
            '<button class="seq-delete-line" data-line="' + line + '" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
          '</div>';
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
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(mm.from + ' ' + mm.arrow + ' ' + mm.to) + '</strong><br><span style="color:var(--text-secondary);">Message · L' + mm.line + '</span></div>' +
            P.selectFieldHtml('From', 'seq-edit-from', fromOpts) +
            P.selectFieldHtml('Arrow', 'seq-edit-arrow', arrowOpts2) +
            P.selectFieldHtml('To', 'seq-edit-to', toOpts) +
            '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-edit-msg-label-rle"></div></div>' +
            actionBarHtml(mm.line, 'message');
          var mln = mm.line;
          ['from', 'arrow', 'to'].forEach(function(f) {
            document.getElementById('seq-edit-' + f).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, f, this.value));
              ctx.onUpdate();
            });
          });
          // C20: rich-label-editor の onChange は input ごとに発火するため、
          // 最初の変更時のみ pushHistory (1 edit session = 1 undo entry)
          var _msgLabelPushed = false;
          window.MA.richLabelEditor.mount(document.getElementById('seq-edit-msg-label-rle'), mm.label, function(v) {
            if (!_msgLabelPushed) { window.MA.history.pushHistory(); _msgLabelPushed = true; }
            ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, 'label', v));
            ctx.onUpdate();
          });
        }
        else if (sel.type === 'participant') {
          var pp = null;
          for (var ii = 0; ii < participants.length; ii++) if (participants[ii].id === sel.id) { pp = participants[ii]; break; }
          if (!pp) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">参加者が見つかりません</p>'; return; }
          var pOpts2 = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === pp.ptype }; });
          var colors = ['#FFAAAA', '#FFD700', '#AAEEAA', '#AACCFF', '#E0AAFF', '#FFB88C', '#D3D3D3'];
          var currentColor = null;
          var pLine = ctx.getMmdText().split('\n')[pp.line - 1];
          var cm = pLine && pLine.match(/#[0-9A-Fa-f]{6}/);
          if (cm) currentColor = cm[0];
          var paletteHtml = '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">色</label>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
              '<button class="seq-color-swatch" data-color="" title="色なし" style="width:22px;height:22px;background:transparent;border:1px dashed var(--text-secondary);border-radius:4px;cursor:pointer;' + (currentColor === null ? 'box-shadow:0 0 0 2px var(--accent);' : '') + '"></button>' +
              colors.map(function(c) {
                var selStyle = (currentColor && currentColor.toLowerCase() === c.toLowerCase()) ? 'box-shadow:0 0 0 2px var(--accent);border-color:#fff;' : '';
                return '<button class="seq-color-swatch" data-color="' + c + '" title="' + c + '" style="width:22px;height:22px;background:' + c + ';border:2px solid var(--bg-secondary);border-radius:4px;cursor:pointer;' + selStyle + '"></button>';
              }).join('') +
            '</div>' +
          '</div>';
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(pp.label) + '</strong><br><span style="color:var(--text-secondary);">' + pp.ptype + ' · L' + pp.line + '</span></div>' +
            P.selectFieldHtml('Type', 'seq-edit-ptype', pOpts2) +
            P.fieldHtml('Alias', 'seq-edit-alias', pp.id) +
            '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Label</label><div id="seq-edit-label-rle"></div></div>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-primary);margin:8px 0;"><input id="seq-edit-rename-refs" type="checkbox" checked> Alias 変更時に他要素の参照も追従</label>' +
            paletteHtml +
            actionBarHtml(pp.line, 'participant');
          var ln = pp.line;
          document.getElementById('seq-edit-ptype').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateParticipant(ctx.getMmdText(), ln, 'ptype', this.value));
            ctx.onUpdate();
          });
          document.getElementById('seq-edit-alias').addEventListener('change', function() {
            var newAlias = this.value;
            var oldAlias = pp.id;
            window.MA.history.pushHistory();
            var t = ctx.getMmdText();
            if (document.getElementById('seq-edit-rename-refs').checked && oldAlias !== newAlias) {
              t = renameWithRefs(t, oldAlias, newAlias);
            } else {
              t = updateParticipant(t, ln, 'alias', newAlias);
            }
            ctx.setMmdText(t);
            ctx.onUpdate();
          });
          // C20: 同上 (participant label edit)
          var _partLabelPushed = false;
          window.MA.richLabelEditor.mount(document.getElementById('seq-edit-label-rle'), pp.label, function(v) {
            if (!_partLabelPushed) { window.MA.history.pushHistory(); _partLabelPushed = true; }
            ctx.setMmdText(updateParticipant(ctx.getMmdText(), ln, 'label', v));
            ctx.onUpdate();
          });
          // C19: color palette click handlers
          P.bindAllByClass(propsEl, 'seq-color-swatch', function(btn) {
            var c = btn.getAttribute('data-color');
            window.MA.history.pushHistory();
            ctx.setMmdText(setParticipantColor(ctx.getMmdText(), pp.id, c || null));
            ctx.onUpdate();
          });
        }
        else if (sel.type === 'note') {
          var nn2 = parsedData.elements.filter(function(e) { return e.kind === 'note' && e.id === sel.id; })[0];
          if (!nn2) return;
          var posOpts2 = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === nn2.position }; });
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(nn2.text || '(empty)') + '</strong><br><span style="color:var(--text-secondary);">Note · ' + nn2.position + ' · L' + nn2.line + '</span></div>' +
            P.selectFieldHtml('Position', 'seq-edit-npos', posOpts2) +
            P.fieldHtml('Targets', 'seq-edit-ntargets', nn2.targets.join(', ')) +
            '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Text</label><div id="seq-edit-ntext-rle"></div></div>' +
            actionBarHtml(nn2.line, 'note');
          var nln = nn2.line;
          [['npos', 'position'], ['ntargets', 'targets']].forEach(function(pair) {
            document.getElementById('seq-edit-' + pair[0]).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateNote(ctx.getMmdText(), nln, pair[1], this.value));
              ctx.onUpdate();
            });
          });
          // C20: 同上 (note text edit)
          var _noteTextPushed = false;
          window.MA.richLabelEditor.mount(document.getElementById('seq-edit-ntext-rle'), nn2.text, function(v) {
            if (!_noteTextPushed) { window.MA.history.pushHistory(); _noteTextPushed = true; }
            ctx.setMmdText(updateNote(ctx.getMmdText(), nln, 'text', v));
            ctx.onUpdate();
          });
        }
        else if (sel.type === 'activation') {
          var aLine = sel.line;
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>Activation</strong><br><span style="color:var(--text-secondary);">L' + aLine + '</span></div>' +
            actionBarHtml(aLine, 'activation');
        }

        // 共通: action bar の click ハンドラ
        bindActionBar(propsEl, ctx);
        return;
      }

      if (selData.length > 1) {
        var range = window.MA.selection.getRange();
        if (!range) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">範囲取得失敗</p>'; return; }
        propsEl.innerHTML =
          '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;">' +
            '<strong>' + selData.length + ' 件選択中</strong><br>' +
            '<span style="color:var(--text-secondary);">L' + range.start + ' 〜 L' + range.end + '</span>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">一括アクション</label>' +
            GROUP_KINDS.map(function(k) {
              return '<button class="seq-bulk-wrap" data-kind="' + k + '" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">⌗ ' + k + ' で囲む</button>';
            }).join('') +
            '<button class="seq-bulk-duplicate" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">📋 範囲を複製</button>' +
            '<button class="seq-bulk-delete" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--accent-red);border:none;color:#fff;padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 範囲を一括削除</button>' +
          '</div>';

        var P = window.MA.properties;
        P.bindAllByClass(propsEl, 'seq-bulk-wrap', function(btn) {
          var k = btn.getAttribute('data-kind');
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          var label = prompt(k + ' のラベル', '');
          window.MA.history.pushHistory();
          ctx.setMmdText(wrapWith(ctx.getMmdText(), s, e, k, label || ''));
          window.MA.selection.clearSelection();
          ctx.onUpdate();
        });
        P.bindAllByClass(propsEl, 'seq-bulk-duplicate', function(btn) {
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          window.MA.history.pushHistory();
          ctx.setMmdText(duplicateRange(ctx.getMmdText(), s, e, e));
          ctx.onUpdate();
        });
        P.bindAllByClass(propsEl, 'seq-bulk-delete', function(btn) {
          if (!confirm('選択範囲を一括削除しますか？')) return;
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          window.MA.history.pushHistory();
          var lines = ctx.getMmdText().split('\n');
          lines.splice(s - 1, e - s + 1);
          ctx.setMmdText(lines.join('\n'));
          window.MA.selection.clearSelection();
          ctx.onUpdate();
        });
        return;
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
