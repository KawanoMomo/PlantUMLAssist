'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlState = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
  var OB = window.MA.overlayBuilder;
  var ID = RP.IDENTIFIER;

  // BLK-builder-20260907-1306-2 (design 5d): 状態行の色 (`state Foo #red`) を読む。
  // 色はステレオタイプの後・`{` の前に置く (PlantUML の並び)。
  // 6 = 色 (`#` を除いた中身)、7 = composite の `{`。
  var STATE_RE = new RegExp(
    '^state\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*(?:#([A-Za-z0-9]+)\\s*)?(\\{)?\\s*$'
  );

  function _existingIdSet(parsed) {
    var set = {};
    var states = (parsed && parsed.states) || [];
    states.forEach(function(s) {
      var bare = s.id.indexOf('.') >= 0 ? s.id.split('.').pop() : s.id;
      set[bare] = true;
    });
    return set;
  }

  function normalizeIdInput(rawInput, parsed) {
    return window.MA.idNormalizer.normalize(rawInput, _existingIdSet(parsed), 'S');
  }

  // BLK-builder-20260907-1306-2 (design 5d): 遷移行の線の色 (`A -[#red]-> B`) を読む。
  // 1 = from、2 = 色 (`#` を除いた中身)、3 = to、4 = ラベル。
  var TRANSITION_RE = new RegExp(
    '^(\\[\\*\\]|' + ID + ')\\s*-(?:\\[#([A-Za-z0-9]+)\\])?->\\s*(\\[\\*\\]|' + ID + ')(?:\\s*:\\s*(.*))?\\s*$'
  );

  // その他パレットに出す色。src/core/relation-options.js の COLORS と同じ並びにして、
  // 図種をまたいでも同じ色・同じ順序で選べるようにする。
  function colors() {
    var RO = window.MA.relationOptions;
    return (RO && RO.COLORS) ? RO.COLORS : [{ value: '', label: '既定', swatch: '#111114' }];
  }

  var NOTE_INLINE_RE = new RegExp(
    '^note\\s+(left|right)\\s+of\\s+(' + ID + ')\\s*:\\s*(.*)$',
    'i'
  );
  var NOTE_BLOCK_OPEN_RE = new RegExp(
    '^note\\s+(left|right)\\s+of\\s+(' + ID + ')\\s*$',
    'i'
  );
  var END_NOTE_RE = /^end\s+note\s*$/i;

  // design 5d「UML 要素の網羅一覧」State 行の「その他パレット」:
  // fork / join、入口・出口ポイント、並行領域。いずれも PlantUML では
  // ステレオタイプ付きの state (と複合状態の中の `--`) として書く。
  var PSEUDO_KIND_BY_STEREOTYPE = {
    'choice': 'choice',
    'history': 'history',
    'historydeep': 'historyDeep',
    'fork': 'fork',
    'join': 'join',
    'entrypoint': 'entryPoint',
    'exitpoint': 'exitPoint',
  };
  // 複合状態の中の並行領域の区切り。PlantUML は `--` と `||` の両方を受ける。
  var REGION_SEP_RE = /^(--+|\|\|+)$/;

  var DESCRIPTION_RE = new RegExp(
    '^(' + ID + ')\\s*:\\s*(?:(entry|exit|do)\\s*/\\s*)?(.+)$',
    'i'
  );

  // ラベルの分解・組み立ては state-transition に一本化してある。
  // プレビュー (UI) と実際に書き込む行が同じ関数から出るようにするため。
  function _parseTransitionLabel(label) {
    return window.MA.stateTransition.parseLabel(label);
  }

  function parse(text) {
    var result = {
      meta: { title: '', startUmlLine: null },
      states: [],
      transitions: [],
      notes: [],
      // design 5d: 複合状態の中の並行領域の区切り (`--`)。
      regions: [],
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

      // 並行領域の区切りは複合状態の中にしか置けない。外側の `--` は
      // skinparam 等の区切り線として書かれることがあるので拾わない。
      if (REGION_SEP_RE.test(trimmed) && openCompositeStack.length > 0) {
        result.regions.push({
          kind: 'region',
          id: '__r_' + result.regions.length,
          parentId: openCompositeStack[openCompositeStack.length - 1].id,
          line: lineNum,
        });
        continue;
      }

      var sm = trimmed.match(STATE_RE);
      if (sm) {
        var sid, slabel;
        if (sm[2] !== undefined) { sid = sm[2]; slabel = sm[1]; }
        else { sid = sm[3]; slabel = sm[4] !== undefined ? sm[4] : sm[3]; }
        var stereotype = sm[5] ? sm[5].toLowerCase() : null;
        var scolor = sm[6] || '';
        var hasBlock = !!sm[7];
        var parentId = openCompositeStack.length > 0
          ? openCompositeStack[openCompositeStack.length - 1].id : null;
        var qid = parentId ? parentId + '.' + sid : sid;
        var st = {
          kind: PSEUDO_KIND_BY_STEREOTYPE[stereotype] || 'state',
          id: qid,
          label: slabel,
          stereotype: stereotype,
          color: scolor,
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
        var lbl = tmt[4] ? tmt[4].trim() : null;
        var parts = _parseTransitionLabel(lbl);
        result.transitions.push({
          id: '__t_' + result.transitions.length,
          from: tmt[1],
          to: tmt[3],
          color: tmt[2] || '',
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

  function fmtState(id, label, stereotype, color) {
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + id : id;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    var colorPart = color ? ' #' + color : '';
    return 'state ' + labelPart + stereoPart + colorPart;
  }

  function fmtTransition(from, to, trigger, guard, action, color) {
    var label = window.MA.stateTransition.composeLabel(trigger, guard, action);
    var arrow = color ? '-[#' + color + ']->' : '-->';
    return from + ' ' + arrow + ' ' + to + (label ? ' : ' + label : '');
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
  function addCompositeState(text, id, label) {
    var head = (label && label !== id)
      ? 'state "' + label + '" as ' + id + ' {'
      : 'state ' + id + ' {';
    var out = insertBeforeEnd(text, head);
    out = insertBeforeEnd(out, '}');
    return out;
  }
  // design 5d: 並行領域の区切り (`--`) を、指定した複合状態の閉じ `}` の直前に置く。
  // 複合状態でないもの (単純 state) を渡された場合は何もしない。
  function addRegionSeparator(text, compositeId, parsed) {
    if (!compositeId) return text;
    var target = null;
    var states = (parsed && parsed.states) || [];
    for (var i = 0; i < states.length; i++) {
      if (states[i].id === compositeId) { target = states[i]; break; }
    }
    if (!target || target.endLine <= target.line) return text;
    var lines = text.split('\n');
    var closeIdx = target.endLine - 1;
    if (closeIdx < 0 || closeIdx >= lines.length) return text;
    var indent = (lines[closeIdx].match(/^\s*/) || [''])[0] + '  ';
    lines.splice(closeIdx, 0, indent + '--');
    return lines.join('\n');
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
  // BLK-junior-20260907-0443: state と transition をまとめて末尾に追加する。
  // 1 件ずつのフォーム (種類選択 → 入力 → 追加ボタン) だと state4 + transition6 で
  // クリックが 10 を超え、結局 DSL を手書きすることになっていた。他図種
  // (usecase / component / class / activity) と同じ「一括 (複数行)」の流儀に揃える。
  //
  // 1 行 1 件:
  //   Idle                       → state
  //   state Active               → state
  //   Error : 異常検知            → ラベル付き state
  //   Choice1 <<choice>>         → ステレオタイプ付き state
  //   [*] --> Idle               → 遷移
  //   Idle --> Active : start    → トリガ付き遷移
  //   Active --> Error : fail [retry > 3] / log()  → トリガ + ガード + アクション
  var ST_BULK_ARROW_RE = /-->/;
  var ST_STEREO_RE = /<<\s*([A-Za-z][A-Za-z0-9_]*)\s*>>/;

  function parseBulkLines(block) {
    var out = [];
    if (!block) return out;
    var lines = String(block).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s || s.indexOf("'") === 0 || s.indexOf('#') === 0) continue;
      if (/^@(startuml|enduml)\b/i.test(s)) continue;
      if (ST_BULK_ARROW_RE.test(s)) {
        var pos = s.indexOf('-->');
        var from = s.slice(0, pos).trim();
        var rest = s.slice(pos + 3);
        var label = '';
        var ci = rest.indexOf(':');
        if (ci >= 0) { label = rest.slice(ci + 1).trim(); rest = rest.slice(0, ci); }
        var to = rest.trim();
        if (!from || !to) continue;
        var parts = _parseTransitionLabel(label);
        out.push({ op: 'transition', from: from, to: to,
          trigger: parts.trigger, guard: parts.guard, action: parts.action });
        continue;
      }
      var body = s.replace(/^state\s+/i, '');
      var stereo = null;
      var sm = body.match(ST_STEREO_RE);
      if (sm) { stereo = sm[1]; body = body.replace(ST_STEREO_RE, '').trim(); }
      var lbl = '';
      var ci2 = body.indexOf(':');
      if (ci2 >= 0) { lbl = body.slice(ci2 + 1).trim(); body = body.slice(0, ci2); }
      var id = body.replace(/^"(.*)"$/, '$1').trim();
      if (!id) continue;
      out.push({ op: 'state', id: id, label: lbl, stereotype: stereo });
    }
    return out;
  }

  // state を先に全部宣言してから遷移を並べるので、入力順は問わない。
  // 既に宣言済みの state は宣言し直さず、遷移からの参照だけにする。
  function addBulk(text, block, parsed) {
    var ops = parseBulkLines(block);
    var out = text;
    var idMap = {};
    var taken = _existingIdSet(parsed || { states: [] });
    var i;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.op !== 'state') continue;
      if (taken[o.id]) { idMap[o.id] = o.id; continue; }
      var norm = window.MA.idNormalizer.normalize(o.id, taken, 'S');
      if (!norm.valid) continue;
      idMap[o.id] = norm.id;
      taken[norm.id] = true;
      out = addState(out, norm.id, o.label || norm.label || o.id, o.stereotype);
    }
    for (i = 0; i < ops.length; i++) {
      var t = ops[i];
      if (t.op !== 'transition') continue;
      var from = t.from === '[*]' ? '[*]' : (idMap[t.from] || t.from);
      var to = t.to === '[*]' ? '[*]' : (idMap[t.to] || t.to);
      out = addTransition(out, from, to, t.trigger, t.guard, t.action);
    }
    return out;
  }

  function addStateAtLine(text, lineNum, position, id, stereotype, label) {
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indentSrc = lines[Math.min(targetIdx, lines.length - 1)] || lines[Math.max(0, targetIdx - 1)] || '';
    var indent = (indentSrc.match(/^(\s*)/) || ['', ''])[1];
    var newLine = indent + fmtState(id, label != null ? label : id, stereotype || null);
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
    var hasBlock = !!m[7];
    var id, label, stereotype, labelExplicit;
    if (m[2] !== undefined) { id = m[2]; label = m[1]; labelExplicit = true; }
    else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; labelExplicit = m[4] !== undefined; }
    stereotype = m[5] ? m[5].toLowerCase() : null;
    // 色は ID / ラベル / ステレオタイプの書き換えでは失われない (design 3c と同じ扱い)。
    var color = m[6] || '';
    if (fields.color !== undefined) color = fields.color || '';
    if (fields.id != null) {
      if (!labelExplicit && fields.label == null) label = fields.id;
      id = fields.id;
    }
    if (fields.label != null) label = fields.label;
    if (fields.stereotype !== undefined) stereotype = fields.stereotype;
    var openBrace = hasBlock ? ' {' : '';
    lines[idx] = indent + fmtState(id, label, stereotype, color) + openBrace;
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
    var from = m[1], to = m[3];
    // 線の色は from / to / trigger / guard / action の書き換えでは失われない。
    var color = m[2] || '';
    var lbl = m[4] ? m[4].trim() : null;
    var parts = _parseTransitionLabel(lbl);
    if (fields.from != null) from = fields.from;
    if (fields.to != null) to = fields.to;
    if (fields.color !== undefined) color = fields.color || '';
    if (fields.trigger !== undefined) parts.trigger = fields.trigger;
    if (fields.guard !== undefined) parts.guard = fields.guard;
    if (fields.action !== undefined) parts.action = fields.action;
    lines[idx] = indent + fmtTransition(from, to, parts.trigger, parts.guard, parts.action, color);
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

  function moveStateIntoComposite(text, stateId, targetCompositeId) {
    var lines = text.split('\n');
    var targetIdx = _findStateDeclLine(lines, targetCompositeId);
    if (targetIdx < 0) return text;
    if (!/\{\s*$/.test(lines[targetIdx])) return text;  // target is not a composite
    var stateIdx = _findStateDeclLine(lines, stateId);
    if (stateIdx < 0 || stateIdx === targetIdx) return text;
    // Extract the state line, indent +2 spaces, insert right after target's open brace.
    var stateLine = lines[stateIdx].trim();
    var targetIndent = (lines[targetIdx].match(/^(\s*)/) || ['', ''])[1];
    var newLine = targetIndent + '  ' + stateLine;
    // Remove state line first, then re-insert at adjusted target idx
    lines.splice(stateIdx, 1);
    var newTargetIdx = stateIdx < targetIdx ? targetIdx - 1 : targetIdx;
    lines.splice(newTargetIdx + 1, 0, newLine);
    return lines.join('\n');
  }

  function moveStateOutOfComposite(text, stateId) {
    var lines = text.split('\n');
    var stateIdx = _findStateDeclLine(lines, stateId);
    if (stateIdx < 0) return text;
    // Find the enclosing composite: scan back for the most recent `state X {` whose matching brace is AFTER stateIdx.
    var enclosingIdx = -1;
    for (var i = stateIdx - 1; i >= 0; i--) {
      var t1 = lines[i].trim();
      if (t1.match(STATE_RE) && /\{\s*$/.test(t1)) {
        var closeIdx = _findMatchingBrace(lines, i);
        if (closeIdx >= 0 && closeIdx > stateIdx) {
          enclosingIdx = i;
          break;
        }
      }
    }
    if (enclosingIdx < 0) return text;  // not inside any composite
    var compositeCloseIdx = _findMatchingBrace(lines, enclosingIdx);
    if (compositeCloseIdx < 0) return text;
    // Dedent the state line and move it to AFTER the closing brace.
    var stateLine = lines[stateIdx].trim();
    var compositeIndent = (lines[enclosingIdx].match(/^(\s*)/) || ['', ''])[1];
    var newLine = compositeIndent + stateLine;
    lines.splice(stateIdx, 1);  // remove from inside
    var insertIdx = compositeCloseIdx; // closeIdx shifted by -1 after splice
    lines.splice(insertIdx + 1, 0, newLine);  // insert after closing brace
    return lines.join('\n');
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

  // 遷移行 (1 始まり) の直後に `note on link` ブロックがあれば、その `end note` の
  // 行番号を返す。無ければ遷移行そのもの。
  function _linkNoteEndLine(lines, lineNum) {
    var i = lineNum;   // lineNum は 1 始まりなので、これが「次の行」の添字
    if (i >= lines.length) return lineNum;
    if (!/^\s*note\s+(?:left\s+|right\s+|top\s+|bottom\s+)?on\s+link\s*$/i.test(lines[i])) return lineNum;
    for (var j = i + 1; j < lines.length; j++) {
      if (/^\s*end\s*note\s*$/i.test(lines[j])) return j + 1;
    }
    return lineNum;
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
    var srcLines = text.split('\n');
    parsed.transitions.forEach(function(tr) {
      if (tr.from === stateId || tr.to === stateId) {
        // 遷移に添えたノート (`note on link`) は遷移の一部。行き先を失った
        // ノートが残らないよう、同じ範囲で消す (BLK-builder-20260907-1737-2)。
        ranges.push({ start: tr.line, end: _linkNoteEndLine(srcLines, tr.line) });
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
          // BLK-human-20260912-2130: 矢じりだけだと当たり判定が 16px 角しかなく、
          // 遷移ラベル (start [ready] / init) を押しても何も選べなかった。
          // PlantUML は線・矢じり・ラベルを同じ <g class="link"> に入れるので、
          // その和集合を当たり判定にして「線・矢じり・ラベル・ガードのどこでも選べる」に統一する。
          var trAttrs = {
            'data-type': 'transition',
            'data-id': tr.id,
            'data-line': String(tr.line),
          };
          var lg = OB.closestLinkGroup(p);
          if (!lg || !OB.addLinkRects(overlayEl, lg, trAttrs, 8)) {
            OB.addRect(overlayEl, minX - 8, minY - 8,
              (maxX - minX) + 16, (maxY - minY) + 16, trAttrs);
          }
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

    // BLK-human-20260912-2130: 小さい当たり判定を手前に。共通実装 (src/core)
    OB.raiseSmallestLast(overlayEl);
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

  // design 5d:「その他パレット」の 1 ボタン。1 クリックで 1 要素が入る形に揃える。
  function _otherBtnHtml(id, label) {
    return '<button id="' + id + '" style="font-size:11px;padding:4px 8px;' +
      'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);' +
      'border-radius:3px;cursor:pointer;">' + label + '</button>';
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var allStates = parsedData.states || [];
    var stateOpts = allStates.map(function(s) { return { value: s.id, label: s.label || s.id }; });
    if (stateOpts.length === 0) stateOpts = [{ value: '', label: '（state なし）' }];
    var stateOptsWithPseudo = [{ value: '[*]', label: '[*] (initial/final)' }].concat(stateOpts);
    var trSummaries = window.MA.stateTransition.summaries(parsedData);
    // design 5d: 並行領域は複合状態 (`{` を持つ state) の中にしか置けない。
    var compositeOpts = allStates.filter(function(s) { return s.endLine > s.line; })
      .map(function(s) { return { value: s.id, label: s.label || s.id }; });

    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">State Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        // design 4c: 置く場所を選べるようになったので、見出しは「末尾」を名乗らない。
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">追加 / Add</label>' +
        P.selectFieldHtml('種類', 'st-tail-kind', [
          { value: 'state', label: 'State', selected: true },
          { value: 'child', label: '子状態 (選んだ状態の中に入れる)' },
          { value: 'composite', label: 'Composite State' },
          { value: 'transition', label: 'Transition' },
          { value: 'note', label: 'Note' },
          { value: 'bulk', label: '一括 (複数行)' },
          // design 5d: 常時は出さず、ここに畳む要素 (fork / join / 入口・出口ポイント / 並行領域)。
          { value: 'other', label: 'その他' }
        ]) +
        '<div id="st-tail-detail" style="margin-top:6px;"></div>' +
      '</div>' +
      // 遷移一覧。図の矢印を正確にクリックしなくても遷移を選べるようにする。
      // 選ぶと trigger / guard / action の 3 欄を持つ編集フォームが開く。
      P.sectionHeaderHtml('遷移を選ぶ') +
        (trSummaries.length === 0
          ? P.emptyListHtml('遷移がありません')
          : trSummaries.map(function(s) {
              return P.listItemHtml({
                label: s.text, sublabel: 'L' + s.line, mono: true,
                selectClass: 'st-tr-pick', dataElementId: s.id, dataLine: s.line,
              });
            }).join('')) +
      P.sectionFooterHtml() +
      // BLK-primary-20260908-1403: レビュー指摘「この 4 遷移を 1 遷移にまとめる」を
      // 当てる口。始点と終点を選ぶだけで、途中の状態の宣言ごと 1 本に畳む。
      _collapseSectionHtml(parsedData) +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<button id="st-branch-open" style="width:100%;font-size:11px;padding:5px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">⑂ 分岐 (choice) を追加</button>' +
      '</div>';
    propsEl.innerHTML = html;
    _bindCollapse(parsedData, ctx);

    Array.prototype.forEach.call(propsEl.querySelectorAll('.st-tr-pick'), function(btn) {
      btn.addEventListener('click', function() {
        window.MA.selection.setSelected([{
          type: 'transition',
          id: btn.getAttribute('data-element-id'),
          line: parseInt(btn.getAttribute('data-line'), 10),
        }]);
      });
    });

    P.bindEvent('st-branch-open', 'click', function() {
      _showAddBranchModal('', parsedData, ctx);
    });

    // design 4c:「追加する位置」。state / composite だけが末尾以外へ置ける
    // (遷移とノートは相手の行が決まるので位置を選ばせる意味がない)。
    // composite に「この遷移の途中」は出さない — 中身の無い箱を遷移の間に
    // 挟んでも、そのあと必ず中を作る手が要る。
    var SI = window.MA.stateInsert;
    function placeHtml(kind) {
      var opts = SI.positions(parsedData).filter(function(p) {
        return !(kind === 'composite' && p.value === 'transition');
      });
      if (opts.length <= 1) return '';
      return '<div id="st-tail-place">' +
        P.selectFieldHtml('追加する位置', 'st-tail-where', opts.map(function(p, i) {
          return { value: p.value, label: p.label, selected: i === 0 };
        })) +
        '<div id="st-tail-where-detail"></div>' +
      '</div>';
    }

    // 位置を選ぶと相手 (どの遷移 / どの複合状態) の欄が要る。
    function renderWhereDetail() {
      var box = document.getElementById('st-tail-where-detail');
      var whereEl = document.getElementById('st-tail-where');
      if (!box || !whereEl) return;
      if (whereEl.value === 'transition') {
        box.innerHTML = P.selectFieldHtml('間に挟む遷移', 'st-tail-where-target',
          SI.transitionOptions(parsedData));
      } else if (whereEl.value === 'inside') {
        box.innerHTML = P.selectFieldHtml('中に入れる複合状態', 'st-tail-where-target',
          SI.compositeOptions(parsedData));
      } else {
        box.innerHTML = '';
      }
    }

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
          placeHtml('state') +
          P.primaryButtonHtml('st-tail-add', '+ State 追加');
      } else if (kind === 'child') {
        // BLK-human-20260915-1206: 「どの状態の中に入れるか」を先に選ばせる。
        // 親が中身を持たなければその場で `{ }` に開くので、変換の手は要らない。
        var SC = window.MA.stateChild;
        var parentOpts = SC.parentOptions(parsedData);
        html2 = parentOpts.length === 0
          ? '<div style="font-size:11px;color:var(--text-secondary);">親にできる状態がまだありません。先に状態を 1 つ追加してください。</div>'
          : P.selectFieldHtml('親にする状態', 'st-tail-where-target', parentOpts) +
            P.fieldHtml('子状態の名前', 'st-tail-id', '', '例: Warmup (空なら Sub)') +
            '<input type="hidden" id="st-tail-where" value="inside">' +
            P.primaryButtonHtml('st-tail-add', '＋ 子状態を追加') +
            '<div id="st-tail-child-hint" style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
              '選んだ状態の中に入れます (DSL は <code>state 親 { state 子 }</code>)。' +
              '中身をまだ持たない状態でも、その場で中を開くので変換は要りません。' +
              '子状態を選び直せば孫も同じ手で足せます。' +
              '図の中の状態を押して選んでからでも、右パネルの「＋ 子状態を追加」で足せます。' +
            '</div>';
      } else if (kind === 'composite') {
        html2 =
          P.fieldHtml('ID', 'st-tail-id', '', '例: Outer') +
          placeHtml('composite') +
          P.primaryButtonHtml('st-tail-add', '+ Composite 追加');
      } else if (kind === 'transition') {
        html2 =
          P.selectFieldHtml('From', 'st-tail-from', stateOptsWithPseudo) +
          P.selectFieldHtml('To', 'st-tail-to', stateOptsWithPseudo) +
          P.fieldHtml('きっかけ / trigger', 'st-tail-trig', '', '例: start') +
          P.vocabPickerHtml('st-tail-trig-vocab', { roles: ['method', 'event'] }) +
          P.fieldHtml('条件 / guard', 'st-tail-guard', '', '例: retry > 3') +
          P.fieldHtml('実行する処理 / action', 'st-tail-act', '', '例: log()') +
          P.vocabPickerHtml('st-tail-act-vocab', { roles: ['method'] }) +
          _previewBoxHtml('st-tail-preview') +
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
      } else if (kind === 'bulk') {
        html2 =
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">state と遷移を 1 行 1 件で</label>' +
          window.MA.reuseModal.buttonHtml('st-tail-reuse') +
          '<textarea id="st-tail-bulk" style="width:100%;min-height:90px;font-family:inherit;font-size:12px;"></textarea>' +
          P.primaryButtonHtml('st-tail-add', '+ まとめて末尾に追加') +
          '<div id="st-tail-bulk-hint" style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
            'Idle / state Active / Error : 異常検知 / Sel &lt;&lt;choice&gt;&gt; (state) /<br>' +
            '[*] --&gt; Idle / Idle --&gt; Active : start / Active --&gt; Error : fail [retry &gt; 3] / log()。' +
            '空行は無視されます</div>';
      } else if (kind === 'other') {
        // design 5d:「その他パレット」。1 行 1 種で、名前を入れて右のボタンを押すだけ。
        html2 =
          '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;line-height:1.5;">' +
            'よく使わない擬似状態をここに畳んでいます。</div>' +
          P.fieldHtml('名前', 'st-other-id', '', '例: Split1') +
          '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">' +
            _otherBtnHtml('st-other-fork', '⑂ fork') +
            _otherBtnHtml('st-other-join', '⑃ join') +
            _otherBtnHtml('st-other-entry', '⊕ 入口ポイント') +
            _otherBtnHtml('st-other-exit', '⊖ 出口ポイント') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:8px;">' +
            (compositeOpts.length === 0
              ? '<div style="font-size:10px;color:var(--text-secondary);">' +
                  '並行領域を置くには複合状態 (Composite State) が要ります</div>'
              : P.selectFieldHtml('並行領域を足す複合状態', 'st-other-composite', compositeOpts) +
                _otherBtnHtml('st-other-region', '— 並行領域の区切りを足す')) +
          '</div>';
      }
      detailEl.innerHTML = html2;
      // 一括欄は「既に他の図にある行」を打ち直させないためのボタンを持つ。
      window.MA.reuseModal.bindButton('st-tail-reuse', 'plantuml-state', 'st-tail-bulk');
      renderWhereDetail();
      P.bindEvent('st-tail-where', 'change', renderWhereDetail);

      if (kind === 'other') {
        var addPseudo = function(stereo, fallbackPrefix) {
          var raw = document.getElementById('st-other-id').value;
          if (!raw || !raw.trim()) raw = fallbackPrefix;
          var norm = normalizeIdInput(raw, parsedData);
          if (!norm.valid) { alert('名前 必須'); return; }
          var t0 = ctx.getMmdText();
          var out0 = addState(t0, norm.id, norm.label, stereo);
          if (out0 === t0) return;
          window.MA.history.pushHistory();
          ctx.setMmdText(out0);
          ctx.onUpdate();
        };
        P.bindEvent('st-other-fork', 'click', function() { addPseudo('fork', 'Fork'); });
        P.bindEvent('st-other-join', 'click', function() { addPseudo('join', 'Join'); });
        P.bindEvent('st-other-entry', 'click', function() { addPseudo('entryPoint', 'In'); });
        P.bindEvent('st-other-exit', 'click', function() { addPseudo('exitPoint', 'Out'); });
        P.bindEvent('st-other-region', 'click', function() {
          var selEl = document.getElementById('st-other-composite');
          if (!selEl) return;
          var t1 = ctx.getMmdText();
          var out1 = addRegionSeparator(t1, selEl.value, parsedData);
          if (out1 === t1) { alert('複合状態が見つかりません'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(out1);
          ctx.onUpdate();
        });
      }

      if (kind === 'transition') {
        var tailPreview = _bindPreview({
          preview: 'st-tail-preview', from: 'st-tail-from', to: 'st-tail-to',
          trigger: 'st-tail-trig', guard: 'st-tail-guard', action: 'st-tail-act',
        });
        P.bindVocabPicker('st-tail-trig-vocab', 'st-tail-trig', tailPreview);
        P.bindVocabPicker('st-tail-act-vocab', 'st-tail-act', tailPreview);
      }

      P.bindEvent('st-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var k = document.getElementById('st-tail-kind').value;
        var out = t;
        // design 4c: 位置の欄が出ていなければ従来どおり末尾。
        var whereEl = document.getElementById('st-tail-where');
        var where = whereEl ? whereEl.value : 'end';
        var tgtEl = document.getElementById('st-tail-where-target');
        var whereTarget = tgtEl ? tgtEl.value : '';
        if (k === 'state' || k === 'child') {
          var rawId = document.getElementById('st-tail-id').value;
          var normSt = normalizeIdInput(rawId, parsedData);
          // BLK-human-20260915-1206: 子状態は名前を思いつかないまま押せる方が
          // 早い。空なら空いている名前 (Sub / Sub2 …) を当てる。
          if (!normSt.valid && k === 'child') {
            normSt = { valid: true, id: window.MA.stateChild.uniqueChildId(parsedData, 'Sub'), label: '' };
          }
          if (!normSt.valid) { alert('ID 必須'); return; }
          var stereoEl = document.getElementById('st-tail-stereo');
          var st = (stereoEl && stereoEl.value) || null;
          if (where === 'transition') {
            out = SI.splitTransition(t, parsedData, whereTarget, normSt.id, st, normSt.label);
            if (out === t) { alert('挟む遷移を選んでください'); return; }
          } else if (where === 'inside') {
            out = SI.insertInside(t, parsedData, whereTarget,
              fmtState(normSt.id, normSt.label || normSt.id, st));
            if (out === t) { alert('入れる複合状態を選んでください'); return; }
          } else {
            out = addState(t, normSt.id, normSt.label, st);
          }
        } else if (k === 'composite') {
          var rawCid = document.getElementById('st-tail-id').value;
          var normC = normalizeIdInput(rawCid, parsedData);
          if (!normC.valid) { alert('ID 必須'); return; }
          if (where === 'inside') {
            var head = (normC.label && normC.label !== normC.id)
              ? 'state "' + normC.label + '" as ' + normC.id + ' {'
              : 'state ' + normC.id + ' {';
            out = SI.insertInside(t, parsedData, whereTarget, [head, '}']);
            if (out === t) { alert('入れる複合状態を選んでください'); return; }
          } else {
            out = addCompositeState(t, normC.id, normC.label);
          }
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
        } else if (k === 'bulk') {
          var block = document.getElementById('st-tail-bulk').value;
          var bulkOut = addBulk(t, block, parsedData);
          if (bulkOut === t) { alert('追加できる行がありません'); return; }
          out = bulkOut;
        }
        if (out !== t) {
          window.MA.history.pushHistory();
          ctx.setMmdText(out);
          ctx.onUpdate();
        }
      });
    };
    P.bindEvent('st-tail-kind', 'change', renderTailDetail);
    // design 2b: 種別はチップ 1 クリックで決める。値の持ち主は上の select のまま。
    window.MA.tailKindChips.mount('st-tail-kind');
    renderTailDetail();
  }

  // ── 遷移をまとめる (BLK-primary-20260908-1403) ────────────────────────────
  // 「Idle→Configured→SrcDstSet→DmaReqEnabled→Transferring_Active の 4 遷移を
  // 1 遷移 (Dma_Configure) にまとめる」というレビュー指摘を当てる口が無く、
  // state 3 行 + 遷移 4 行を DSL エディタで選び直して打ち直していた。
  // 始点と終点を選び、残す 1 本の名前を入れて押すだけで済ませる。
  // まとめられる連なりが無い図では、この欄自体を出さない。
  function _collapseSectionHtml(parsedData) {
    var SC = window.MA.stateCollapse;
    var P = window.MA.properties;
    if (!SC || !P) return '';
    var starts = SC.startOptions(parsedData);
    if (starts.length === 0) return '';
    var from = starts[0].value;
    var ends = SC.endOptions(parsedData, from);
    return '<div id="st-collapse" style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:10px;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">遷移をまとめる / Collapse</label>' +
      '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;line-height:1.5;">' +
        '1 本道に並んだ遷移を 1 本に畳みます (途中の状態の宣言も消えます)。</div>' +
      P.selectFieldHtml('始点', 'st-cl-from', starts.map(function(o) {
        return { value: o.value, label: o.label, selected: o.value === from };
      })) +
      P.selectFieldHtml('終点', 'st-cl-to', ends.map(function(o, i) {
        return { value: o.value, label: o.label, selected: i === ends.length - 1 };
      })) +
      P.fieldHtml('まとめた遷移の名前', 'st-cl-label', '', '例: Dma_Configure') +
      _previewBoxHtml('st-cl-preview') +
      '<div id="st-cl-note" style="font-size:10px;color:var(--text-secondary);margin:-4px 0 8px 0;line-height:1.5;"></div>' +
      P.primaryButtonHtml('st-cl-run', '⇒ 1 本にまとめる') +
    '</div>';
  }

  function _bindCollapse(parsedData, ctx) {
    var SC = window.MA.stateCollapse;
    var P = window.MA.properties;
    if (!SC || !P || !document.getElementById('st-collapse')) return;
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

    // 終点の選択肢は始点で決まる。始点を変えたら並べ直し、いちばん遠い先を既定にする
    // (指摘は「この一続きを 1 本に」なので、いちばん多く畳む先が当たりやすい)。
    function renderEnds() {
      var sel = document.getElementById('st-cl-to');
      if (!sel) return;
      var ends = SC.endOptions(parsedData, val('st-cl-from'));
      sel.innerHTML = ends.map(function(o, i) {
        return '<option value="' + window.MA.htmlUtils.escHtml(o.value) + '"' +
          (i === ends.length - 1 ? ' selected' : '') + '>' +
          window.MA.htmlUtils.escHtml(o.label) + '</option>';
      }).join('');
    }

    // 名前は畳む前のきっかけを並べた下書きを入れておく。人が打ち直せば上書きされる
    // (打ち直しても 1 語で済むので、指摘の反映で 50 打を超えない)。
    var labelTouched = false;
    function refresh() {
      var from = val('st-cl-from'), to = val('st-cl-to');
      var labelEl = document.getElementById('st-cl-label');
      if (labelEl && !labelTouched) labelEl.value = SC.suggestLabel(parsedData, from, to);
      var pv = SC.preview(parsedData, from, to, labelEl ? labelEl.value : '');
      var box = document.getElementById('st-cl-preview');
      var note = document.getElementById('st-cl-note');
      if (box) box.textContent = pv.ok ? pv.line : '';
      if (note) note.textContent = pv.text;
      var btn = document.getElementById('st-cl-run');
      if (btn) btn.disabled = !pv.ok;
    }

    P.bindEvent('st-cl-from', 'change', function() { renderEnds(); labelTouched = false; refresh(); });
    P.bindEvent('st-cl-to', 'change', function() { labelTouched = false; refresh(); });
    var labelEl = document.getElementById('st-cl-label');
    if (labelEl) {
      labelEl.addEventListener('input', function() { labelTouched = true; refresh(); });
      // 下書きはあくまで下書き。触った時点で全選択しておき、指摘の名前
      // (Dma_Configure) を打てばそのまま置き換わるようにする
      // (下書きを消す手が要ると、まとめる操作より消す方が長くなる)。
      labelEl.addEventListener('focus', function() { try { labelEl.select(); } catch (e) {} });
    }

    P.bindEvent('st-cl-run', 'click', function() {
      var t = ctx.getMmdText();
      var out = SC.collapse(t, parsedData, val('st-cl-from'), val('st-cl-to'), val('st-cl-label'));
      if (out === t) { alert('まとめられる 1 本道がありません'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(out);
      ctx.onUpdate();
    });

    refresh();
  }

  function _selectedOpt(o, sel) { return { value: o.value, label: o.label, selected: o.value === sel }; }

  // 「組み立てられる行」— 3 要素の入力から出来る DSL 行をその場に出す。
  // 構文 (`: trigger [guard] / action`) を覚えていなくても、確定前に
  // 何が書き込まれるか読めるようにするための表示。
  function _previewBoxHtml(id) {
    return '<div style="margin:8px 0 8px 0;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:2px;font-weight:bold;">組み立てられる行</label>' +
      '<pre id="' + id + '" style="margin:0;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;padding:5px 6px;font-family:var(--font-mono),Consolas,monospace;font-size:11px;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;min-height:15px;"></pre>' +
    '</div>';
  }

  // ids: { preview, from, to, trigger, guard, action }
  // 入力のたびに再描画する。要素が無い場合は何もしない (フォーム差替え中)。
  function _bindPreview(ids) {
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function refresh() {
      var box = document.getElementById(ids.preview);
      if (!box) return;
      box.textContent = window.MA.stateTransition.previewLine(
        val(ids.from), val(ids.to), val(ids.trigger), val(ids.guard), val(ids.action));
    }
    ['from', 'to', 'trigger', 'guard', 'action'].forEach(function(k) {
      var el = document.getElementById(ids[k]);
      if (!el) return;
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    });
    refresh();
    return refresh;
  }

  // design 4c: 状態遷移表の空欄を押したときの入口。行 (from) と列 (trigger) は
  // 押したセルで決まっているので、フォームにはその 2 つを入れた状態で開く。
  // 表からも右パネルからも同じフォームが出るように、既存のモーダルへ prefill を
  // 足しただけにしてある。
  function showAddTransitionModal(ctx, parsedData, fromId, prefill) {
    _showAddTransitionModal(fromId, parsedData, ctx, prefill);
  }

  function _showAddTransitionModal(fromId, parsedData, ctx, prefill) {
    var modal = document.getElementById('st-tx-modal');
    var content = document.getElementById('st-tx-modal-content');
    if (!modal || !content) return;
    var P = window.MA.properties;
    var stateOpts = (parsedData.states || []).map(function(s) { return { value: s.id, label: s.label || s.id }; });
    var stateOptsWithPseudo = [{ value: '[*]', label: '[*]' }].concat(stateOpts);
    content.innerHTML =
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">Outgoing transition from ' + window.MA.htmlUtils.escHtml(fromId) + '</h3>' +
      P.selectFieldHtml('Target state', 'st-tx-to', stateOptsWithPseudo) +
      P.fieldHtml('Trigger', 'st-tx-trig', (prefill && prefill.trigger) || '') +
      P.fieldHtml('Guard', 'st-tx-guard', (prefill && prefill.guard) || '') +
      P.fieldHtml('Action', 'st-tx-act', (prefill && prefill.action) || '') +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="st-tx-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="st-tx-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';
    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    P.bindEvent('st-tx-cancel', 'click', close);
    P.bindEvent('st-tx-confirm', 'click', function() {
      var to = document.getElementById('st-tx-to').value;
      var trig = document.getElementById('st-tx-trig').value || null;
      var guard = document.getElementById('st-tx-guard').value || null;
      var action = document.getElementById('st-tx-act').value || null;
      if (!to) { close(); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(addTransition(ctx.getMmdText(), fromId, to, trig, guard, action));
      ctx.onUpdate();
      close();
    });
  }

  // 分岐 (choice + 複数のガード付き遷移) を 1 つのフォームで組む。
  // Transition 追加フォームを枝の数だけ開き直すと、DSL を直接打った方が
  // 早くなってしまうため、枝を行として並べて一括で確定する。
  function _showAddBranchModal(fromId, parsedData, ctx) {
    var modal = document.getElementById('st-br-modal');
    var content = document.getElementById('st-br-modal-content');
    if (!modal || !content) return;
    var SB = window.MA.stateBranch;
    var esc = window.MA.htmlUtils.escHtml;
    var P = window.MA.properties;

    var stateNames = (parsedData.states || []).map(function(s) { return s.id; });
    stateNames.push('[*]');
    var datalist = '<datalist id="st-br-states">' +
      stateNames.map(function(n) { return '<option value="' + esc(n) + '"></option>'; }).join('') +
      '</datalist>';

    var INPUT = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;';

    function rowHtml(i) {
      return '<div class="st-br-row" data-i="' + i + '" style="display:flex;gap:6px;margin-bottom:5px;align-items:center;">' +
        '<input id="st-br-guard-' + i + '" list="" type="text" placeholder="ガード (例: 重大)" style="flex:1;' + INPUT + '">' +
        '<span style="color:var(--text-secondary);font-size:12px;">→</span>' +
        '<input id="st-br-to-' + i + '" list="st-br-states" type="text" placeholder="遷移先" style="flex:1;' + INPUT + '">' +
        '<input id="st-br-act-' + i + '" type="text" placeholder="アクション" style="flex:1;' + INPUT + '">' +
        '<button id="st-br-del-' + i + '" title="この枝を削除" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 7px;">✕</button>' +
      '</div>';
    }

    var rowCount = 2;
    content.innerHTML = datalist +
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">分岐 (choice) を追加' +
        (fromId ? ' — ' + esc(fromId) + ' から' : '') + '</h3>' +
      P.fieldHtml('分岐 (choice) 状態の名前', 'st-br-id', '', '例: AnomalyCheck') +
      (fromId ? P.fieldHtml('分岐に入るトリガー', 'st-br-trigger', '', '例: Fault') : '') +
      // BLK-junior-20260907-0803: 枝ごとに 3 欄をクリックして回ると手数が枝の本数に比例する。
      // 1 行 1 枝でまとめて打てる欄を上に置き、下の行はその結果として自動で並ぶ。
      '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 4px 0;">枝をまとめて入力 (1 行 1 枝)</div>' +
      '<textarea id="st-br-bulk" rows="4" placeholder="重大 -> Error / notify&#10;軽微 -> Idle" ' +
        'style="width:100%;box-sizing:border-box;' + INPUT + 'font-family:Consolas,monospace;resize:vertical;"></textarea>' +
      '<div style="font-size:10px;color:var(--text-secondary);margin:3px 0 0 0;">' +
        '書き方: <code>ガード -&gt; 遷移先 / アクション</code>。ガードもアクションも省けます。下の欄と両方向で同期します。</div>' +
      '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 4px 0;">枝 (ガード → 遷移先)</div>' +
      '<div id="st-br-rows">' + rowHtml(0) + rowHtml(1) + '</div>' +
      '<button id="st-br-add-row" style="font-size:11px;padding:3px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">＋ 枝を追加</button>' +
      '<div id="st-br-replaced" style="font-size:11px;color:var(--text-secondary);margin-top:10px;"></div>' +
      '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 4px 0;">追加される行</div>' +
      '<pre id="st-br-preview" style="margin:0;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;padding:6px;font-family:Consolas,monospace;font-size:11px;color:var(--text-primary);white-space:pre-wrap;min-height:34px;"></pre>' +
      '<div id="st-br-errors" style="font-size:11px;color:var(--accent-red);margin-top:6px;min-height:14px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="st-br-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="st-br-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

    function collectSpec() {
      var branches = [];
      var rows = content.querySelectorAll('.st-br-row');
      for (var i = 0; i < rows.length; i++) {
        var idx = rows[i].getAttribute('data-i');
        branches.push({
          guard: val('st-br-guard-' + idx),
          to: val('st-br-to-' + idx),
          action: val('st-br-act-' + idx),
        });
      }
      return {
        source: fromId || '',
        trigger: val('st-br-trigger'),
        choiceId: val('st-br-id'),
        branches: branches,
      };
    }

    // 一括入力欄 → 行。行は毎回組み直すので、枝が増えても手で足す必要がない。
    function rowsFromBranches(branches) {
      var host = document.getElementById('st-br-rows');
      if (!host) return;
      var list = (branches && branches.length) ? branches : [{}, {}];
      if (list.length < 2) list = list.concat([{}]);
      var html = '';
      var idx = [];
      list.forEach(function() { idx.push(rowCount++); });
      list.forEach(function(b, k) { html += rowHtml(idx[k]); });
      host.innerHTML = html;
      list.forEach(function(b, k) {
        setVal('st-br-guard-' + idx[k], b.guard || '');
        setVal('st-br-to-' + idx[k], b.to || '');
        setVal('st-br-act-' + idx[k], b.action || '');
        bindRow(idx[k]);
      });
    }

    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }

    // 行 → 一括入力欄。入力中の欄は上書きしない (打っている途中で消えない)。
    function syncBulkFromRows(spec) {
      var ta = document.getElementById('st-br-bulk');
      if (!ta || document.activeElement === ta) return;
      ta.value = SB.formatBranchLines(spec.branches);
    }

    function refresh() {
      var spec = collectSpec();
      var text = ctx.getMmdText();
      var lines = SB.preview(text, spec);
      var pre = document.getElementById('st-br-preview');
      if (pre) pre.textContent = lines.join('\n');
      // 置き換え元の直接遷移は黙って消さず、消える行として見せる。
      var repl = SB.replacedTransitions(text, spec);
      var replEl = document.getElementById('st-br-replaced');
      if (replEl) {
        replEl.textContent = repl.length
          ? '確定すると消える行 (同じ遷移元・同じトリガーの直接遷移): '
            + repl.map(function(r) { return r.line + ' 行目 ' + r.text; }).join(' / ')
          : '';
      }
      var v = SB.validate(spec, text);
      var errEl = document.getElementById('st-br-errors');
      if (errEl) errEl.textContent = v.errors.join(' / ');
      var confirmBtn = document.getElementById('st-br-confirm');
      if (confirmBtn) {
        confirmBtn.disabled = !v.ok;
        confirmBtn.style.opacity = v.ok ? '1' : '0.5';
        confirmBtn.style.cursor = v.ok ? 'pointer' : 'not-allowed';
      }
      syncBulkFromRows(spec);
    }

    function bindRow(i) {
      ['st-br-guard-' + i, 'st-br-to-' + i, 'st-br-act-' + i].forEach(function(id) {
        P.bindEvent(id, 'input', refresh);
      });
      P.bindEvent('st-br-del-' + i, 'click', function() {
        var rows = content.querySelectorAll('.st-br-row');
        if (rows.length <= 1) return;   // 最低 1 行は残す
        for (var k = 0; k < rows.length; k++) {
          if (rows[k].getAttribute('data-i') === String(i)) { rows[k].parentNode.removeChild(rows[k]); break; }
        }
        refresh();
      });
    }

    bindRow(0);
    bindRow(1);
    P.bindEvent('st-br-id', 'input', refresh);
    P.bindEvent('st-br-trigger', 'input', refresh);
    P.bindEvent('st-br-bulk', 'input', function() {
      var ta = document.getElementById('st-br-bulk');
      rowsFromBranches(SB.parseBranchLines(ta ? ta.value : ''));
      refresh();
    });
    P.bindEvent('st-br-add-row', 'click', function() {
      var rows = document.getElementById('st-br-rows');
      if (!rows) return;
      var i = rowCount++;
      rows.insertAdjacentHTML('beforeend', rowHtml(i));
      bindRow(i);
      var el = document.getElementById('st-br-guard-' + i);
      if (el && el.focus) el.focus();
      refresh();
    });

    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    P.bindEvent('st-br-cancel', 'click', close);
    P.bindEvent('st-br-confirm', 'click', function() {
      var spec = collectSpec();
      var text = ctx.getMmdText();
      if (!SB.validate(spec, text).ok) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(SB.apply(text, spec));
      ctx.onUpdate();
      close();
    });
    refresh();
    var first = document.getElementById('st-br-id');
    if (first && first.focus) first.focus();
  }

  function _renderStateEdit(sel, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var st = null;
    for (var i = 0; i < parsedData.states.length; i++) {
      if (parsedData.states[i].id === sel.id) { st = parsedData.states[i]; break; }
    }
    if (!st) { propsEl.innerHTML = ''; return; }
    var related = (parsedData.transitions || []).filter(function(tr) { return tr.from === st.id || tr.to === st.id; });
    var notes = (parsedData.notes || []).filter(function(n) { return n.targetId === st.id; });

    // Compute candidate composites for "Move into" (exclude self and descendants)
    var moveCandidates = (parsedData.states || []).filter(function(other) {
      if (other.id === st.id) return false;
      if (!(other.endLine && other.endLine > other.line)) return false;  // only composites
      if (other.id.indexOf(st.id + '.') === 0) return false;  // exclude descendants
      return true;
    });
    var moveIntoHtml = '';
    if (!st.parentId && moveCandidates.length > 0) {
      var moveOpts = '<option value="">-- 選択 --</option>';
      for (var mci = 0; mci < moveCandidates.length; mci++) {
        var mco = moveCandidates[mci];
        moveOpts += '<option value="' + window.MA.htmlUtils.escHtml(mco.id) + '">' + window.MA.htmlUtils.escHtml(mco.label || mco.id) + '</option>';
      }
      moveIntoHtml =
        '<div style="margin-top:4px;font-size:11px;display:flex;align-items:center;gap:4px;">' +
          '<span style="color:var(--text-secondary);">Move into:</span>' +
          '<select id="st-move-target" style="flex:1;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:11px;">' + moveOpts + '</select>' +
          '<button id="st-move-into" style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">Move</button>' +
        '</div>';
    }
    var moveOutHtml = '';
    if (st.parentId) {
      moveOutHtml = '<button id="st-move-out" style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;margin-top:4px;display:block;">↑ Move out of ' + window.MA.htmlUtils.escHtml(st.parentId) + '</button>';
    }

    var doDisplay = (st.do || '').replace(/\\n/g, '\n');
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">' +
      (st.stereotype ? st.stereotype + ' ' : '') + 'State (L' + st.line + ')</div>' +
      P.fieldHtml('ID', 'st-id', st.id) +
      // BLK-junior-20260915-0406-wish: 状態名も同じ部品の他の図と揃える。
      P.vocabPickerHtml('st-id-vocab', { roles: ['state'] }) +
      P.fieldHtml('Label', 'st-label', st.label || '') +
      P.selectFieldHtml('Stereotype', 'st-stereo', [
        { value: '', label: '(none)', selected: !st.stereotype },
        { value: 'choice', label: 'choice', selected: st.stereotype === 'choice' },
        { value: 'history', label: 'history', selected: st.stereotype === 'history' },
        { value: 'historyDeep', label: 'historyDeep', selected: st.stereotype === 'historydeep' },
        // design 5d: fork / join / 入口・出口ポイントも同じ 1 つの欄で選べるようにする。
        { value: 'fork', label: 'fork', selected: st.stereotype === 'fork' },
        { value: 'join', label: 'join', selected: st.stereotype === 'join' },
        { value: 'entryPoint', label: 'entryPoint', selected: st.stereotype === 'entrypoint' },
        { value: 'exitPoint', label: 'exitPoint', selected: st.stereotype === 'exitpoint' }
      ]) +
      // BLK-human-20260915-1206: 入れ子の中の状態を選んだとき、どの親の中に
      // 居るかが「Parent: Outer」だけでは孫の代で読み取れない。根から並べる。
      '<div style="font-size:11px;margin:4px 0;color:var(--text-secondary);">居場所: ' +
        window.MA.htmlUtils.escHtml(window.MA.stateChild.placeText(parsedData, st.id)) +
        ' <span style="opacity:.7;">(' +
        window.MA.htmlUtils.escHtml(window.MA.stateChild.breadcrumbText(parsedData, st.id)) +
        ')</span></div>' +
      // BLK-human-20260915-1206: 子状態を足す入口。中身を持たない状態でも
      // その場で `{ }` に開くので、「まず composite に変換」を知らなくてよい。
      (window.MA.stateChild.canHaveChild(st)
        ? '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
            '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">子状態 — この状態の中に状態を入れる（入れ子）</div>' +
            '<div style="display:flex;gap:4px;align-items:center;">' +
              '<input id="st-child-id" placeholder="子状態の名前 (例: Warmup)" style="flex:1;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:11px;">' +
              '<button id="st-add-child" title="選んだ状態の中に、もう 1 つ状態を入れます（入れ子にする）" style="font-size:11px;padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;white-space:nowrap;">＋ 子状態を追加</button>' +
            '</div>' +
            '<button id="st-add-child-pair" title="選んだ状態の中に状態を 2 つ入れて、その間を矢印でつなぎます（入れ子）" style="font-size:11px;padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;margin-top:4px;display:block;">＋ 子状態を 2 つ足して遷移でつなぐ</button>' +
          '</div>'
        : '') +
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
      // BLK-builder-20260907-1306-2 (design 5d): 色は常時表示にせず「その他… ▾」に畳む。
      P.colorPaletteHtml('st-more', {
        title: 'その他（色）… ',
        label: '色 / Color',
        notation: 'state X #red',
        colors: colors(),
        current: st.color || '',
      }) +
      // Composite ops (kind-aware buttons)
      (st.endLine && st.endLine > st.line
        ? '<button id="st-dissolve" style="font-size:11px;padding:4px 10px;background:var(--accent-red);border:none;color:#fff;border-radius:3px;cursor:pointer;margin-bottom:4px;">✕ Dissolve composite</button>'
        : '<button id="st-convert" style="font-size:11px;padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;margin-bottom:4px;">+ Convert to composite</button>'
      ) +
      moveIntoHtml +
      moveOutHtml +
      '<button id="st-add-tx" style="font-size:11px;padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;margin-top:4px;display:block;">+ Outgoing transition</button>' +
      '<button id="st-add-branch" style="font-size:11px;padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;margin-top:4px;display:block;">⑂ 分岐 (choice) を追加</button>' +
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

    P.bindVocabPicker('st-id-vocab', 'st-id');

    P.bindEvent('st-update', 'click', function() {
      window.MA.history.pushHistory();
      var rawId = document.getElementById('st-id').value;
      var rawLabel = document.getElementById('st-label').value;
      // If user typed a non-ASCII id (e.g. Japanese), promote it to the label
      // and synthesize a fresh ASCII alias so parser+PlantUML stay in sync.
      var freshParsed = parse(ctx.getMmdText());
      var renameNorm = normalizeIdInput(rawId, freshParsed);
      var newId = renameNorm.id;
      var newLabel = (renameNorm.id !== renameNorm.label) ? renameNorm.label : rawLabel;
      var src = ctx.getMmdText();
      var out = updateState(src, st.line, {
        id: newId,
        label: newLabel,
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
    // 色は「更新」を待たずに押した時点で DSL へ入れる (design 3c と同じ即時反映)。
    P.bindColorPalette('st-more', function(value) {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateState(ctx.getMmdText(), st.line, { color: value }));
      ctx.onUpdate();
    });
    P.bindEvent('st-delete', 'click', function() {
      if (!confirm('この state と紐付く transition / note も削除します。続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteStateWithRefs(ctx.getMmdText(), st.id));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    // BLK-human-20260915-1206: 親を選んで子を足す 1 手。名前を空で押しても
    // 迷わないように、その場で空いている名前 (Sub / Sub2 …) を当てる。
    P.bindEvent('st-add-child', 'click', function() {
      var el = document.getElementById('st-child-id');
      var fresh = parse(ctx.getMmdText());
      var norm = normalizeIdInput(el ? el.value : '', fresh);
      var id = window.MA.stateChild.uniqueChildId(fresh, norm.id || 'Sub');
      window.MA.history.pushHistory();
      ctx.setMmdText(window.MA.stateChild.addChild(
        ctx.getMmdText(), fresh, st.id, id, norm.label));
      if (el) el.value = '';
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindEvent('st-add-child-pair', 'click', function() {
      var fresh = parse(ctx.getMmdText());
      var a = window.MA.stateChild.uniqueChildId(fresh, 'Sub');
      var b = window.MA.stateChild.uniqueChildId(
        { states: (fresh.states || []).concat([{ id: a }]) }, 'Sub');
      window.MA.history.pushHistory();
      ctx.setMmdText(window.MA.stateChild.addChildPair(
        ctx.getMmdText(), fresh, st.id, a, b));
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
    if (!st.parentId) {
      P.bindEvent('st-move-into', 'click', function() {
        var targetSel = document.getElementById('st-move-target');
        if (!targetSel) return;
        var target = targetSel.value;
        if (!target) return;
        window.MA.history.pushHistory();
        ctx.setMmdText(moveStateIntoComposite(ctx.getMmdText(), st.id, target));
        window.MA.selection.clearSelection();
        ctx.onUpdate();
      });
    }
    if (st.parentId) {
      P.bindEvent('st-move-out', 'click', function() {
        window.MA.history.pushHistory();
        ctx.setMmdText(moveStateOutOfComposite(ctx.getMmdText(), st.id));
        window.MA.selection.clearSelection();
        ctx.onUpdate();
      });
    }
    P.bindEvent('st-add-tx', 'click', function() {
      _showAddTransitionModal(st.id, parsedData, ctx);
    });
    P.bindEvent('st-add-branch', 'click', function() {
      _showAddBranchModal(st.id, parsedData, ctx);
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
      '<button id="st-tr-swap" title="From と To を入れ替える" style="width:100%;font-size:11px;padding:3px 8px;margin-bottom:8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">⇄ 向きを入れ替え</button>' +
      P.selectFieldHtml('To', 'st-tr-to', toOpts) +
      P.fieldHtml('きっかけ / trigger', 'st-tr-trig', tr.trigger || '', '例: start') +
      // BLK-junior-20260915-0406-wish: きっかけの綴りは同じ部品のシーケンス図と
      // 揃っていなければならない。名前帳から選べば、先輩の図を別に開かずに揃う。
      P.vocabPickerHtml('st-tr-trig-vocab', { roles: ['method', 'event'] }) +
      P.fieldHtml('条件 / guard', 'st-tr-guard', tr.guard || '', '例: retry > 3') +
      P.fieldHtml('実行する処理 / action', 'st-tr-act', tr.action || '', '例: log()') +
      P.vocabPickerHtml('st-tr-act-vocab', { roles: ['method'] }) +
      _previewBoxHtml('st-tr-preview') +
      // BLK-builder-20260907-1306-2 (design 5d): 線の色も「その他… ▾」に畳む。
      P.colorPaletteHtml('st-tr-more', {
        title: 'その他（線の色）… ',
        label: '線の色 / Line color',
        notation: '-[#red]->',
        colors: colors(),
        current: tr.color || '',
      }) +
      // BLK-builder-20260907-1737-2 (design 4c):「この遷移にノートを添える」。
      // UseCase / Component / Class の関係には 3c で入っているのに、遷移だけ
      // `note on link` を DSL に手で書くしかなかった。
      P.linkNoteHtml('st-tr-note', {
        label: 'この遷移にノートを添える',
        note: window.MA.relationOptions.noteAt(ctx.getMmdText(), tr.line) || '',
        placeholder: '例: リトライ上限を超えた場合のみ',
      }) +
      P.primaryButtonHtml('st-tr-update', '更新') +
      P.primaryButtonHtml('st-tr-delete', '✕ 削除');
    propsEl.innerHTML = html;

    P.bindLinkNote('st-tr-note', function(noteText) {
      window.MA.history.pushHistory();
      ctx.setMmdText(window.MA.relationOptions.setNoteAt(ctx.getMmdText(), tr.line, noteText));
      ctx.onUpdate();
    });

    var refreshPreview = _bindPreview({
      preview: 'st-tr-preview', from: 'st-tr-from', to: 'st-tr-to',
      trigger: 'st-tr-trig', guard: 'st-tr-guard', action: 'st-tr-act',
    });

    P.bindVocabPicker('st-tr-trig-vocab', 'st-tr-trig', refreshPreview);
    P.bindVocabPicker('st-tr-act-vocab', 'st-tr-act', refreshPreview);

    P.bindEvent('st-tr-swap', 'click', function() {
      var fromEl = document.getElementById('st-tr-from');
      var toEl = document.getElementById('st-tr-to');
      if (!fromEl || !toEl) return;
      var f = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = f;
      refreshPreview();
    });

    P.bindColorPalette('st-tr-more', function(value) {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateTransition(ctx.getMmdText(), tr.line, { color: value }));
      ctx.onUpdate();
    });

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
      // 添えたノートは遷移の一部なので、遷移を消すときに一緒に消す。
      // 残すと行き先を失った `note on link` が DSL に取り残される。
      var out = window.MA.relationOptions.setNoteAt(ctx.getMmdText(), tr.line, null);
      ctx.setMmdText(deleteNode(out, tr.line, tr.line));
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

  // FEAT-109: ↑↓ でキーボード選択を移す対象を DSL 行順で返す。
  // states と transitions のみを対象とし、notes は含めない。
  function kbdSelectables(parsed) {
    if (!parsed) return [];
    var out = [];
    var sts = parsed.states || [];
    for (var i = 0; i < sts.length; i++) {
      out.push({ type: 'state', id: sts[i].id, line: sts[i].line });
    }
    var trs = parsed.transitions || [];
    for (var j = 0; j < trs.length; j++) {
      out.push({ type: 'transition', id: trs[j].id, line: trs[j].line });
    }
    return out
      .filter(function(it) { return typeof it.line === 'number'; })
      .sort(function(a, b) { return a.line - b.line; });
  }

  function showInsertForm(ctx, line, position, kind) {
    var modal = document.getElementById('st-modal');
    var content = document.getElementById('st-modal-content');
    if (!modal || !content) {
      var t = window.prompt((position === 'before' ? '前に' : '後に') + 'state を挿入: ID', '');
      if (!t) return;
      var promptParsed = parse(ctx.getMmdText());
      var promptNorm = normalizeIdInput(t, promptParsed);
      if (!promptNorm.valid) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(addStateAtLine(ctx.getMmdText(), line, position, promptNorm.id, null, promptNorm.label));
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
        var modNorm = normalizeIdInput(id, parsed);
        if (!modNorm.valid) { alert('ID 必須'); return; }
        out = addStateAtLine(t, line, position, modNorm.id, null, modNorm.label);
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
    addRegionSeparator: addRegionSeparator,
    addTransition: addTransition,
    addNote: addNote,
    addStateAtLine: addStateAtLine,
    addTransitionAtLine: addTransitionAtLine,
    parseBulkLines: parseBulkLines,
    addBulk: addBulk,
    normalizeIdInput: normalizeIdInput,
    updateState: updateState,
    updateTransition: updateTransition,
    updateNote: updateNote,
    setStateBehavior: setStateBehavior,
    convertToComposite: convertToComposite,
    dissolveComposite: dissolveComposite,
    moveStateIntoComposite: moveStateIntoComposite,
    moveStateOutOfComposite: moveStateOutOfComposite,
    deleteNode: deleteNode,
    deleteStateWithRefs: deleteStateWithRefs,
    resolveInsertLine: resolveInsertLine,
    showInsertForm: showInsertForm,
    showAddTransitionModal: showAddTransitionModal,
    kbdSelectables: kbdSelectables,
    defaultInsertKind: 'state',
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: true,
      multiSelectConnect: false,
    },
  };
})();
