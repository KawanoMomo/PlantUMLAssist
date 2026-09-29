'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlActivity = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;

  var START_RE = /^start$/i;
  var STOP_RE = /^stop$/i;
  var END_RE = /^end$/i;
  // design 5d Activity「その他パレット」の色指定: `#LightBlue:保存する;` のように
  // 本文の前に色を書ける。色を読めないとその行がアクションとして見えなくなり、
  // 図の上でも右パネルでも触れなくなるので、色は本文と分けて持つ。
  var ACTION_COLOR_RE = /^(#[A-Za-z0-9_]+(?:\/#?[A-Za-z0-9_]+)?)\s*:/;
  // 同梱の plantuml.jar は前置き `#色:本文;` を deprecated として図の上に警告帯を出す。
  // 書き出しは警告の出ない後置き `:本文; <<#色>>` にするが、既存の図や手書きには
  // 前置きが残っているので、読みは両方受ける。
  var ACTION_TAIL_COLOR_RE = /;\s*<<(#[A-Za-z0-9_]+(?:\/#?[A-Za-z0-9_]+)?)>>\s*$/;

  // 1 行から色を剥がす。戻りの body は色を含まない行。
  function _splitActionColor(trimmedLine) {
    var color = null;
    var body = trimmedLine;
    var tail = body.match(ACTION_TAIL_COLOR_RE);
    if (tail) { color = tail[1]; body = body.substring(0, tail.index + 1); }
    var head = body.match(ACTION_COLOR_RE);
    if (head) { if (!color) color = head[1]; body = body.substring(head[0].length - 1); }
    return { color: color, body: body };
  }
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

  // BLK-migrator-20260929-0951: split / split again / end split は fork と同じ「枝を持つ入れ物」(棒から枝が分かれ、
  // 下の棒で合流する)。fork の閉じは `end merge` でも書ける。どちらも同じ正規表現で読み、開きの語を節点に残す。
  var FORK_OPEN_RE = /^(fork|split)\s*$/i;
  var FORK_AGAIN_RE = /^(fork|split)\s+again\s*$/i;
  var END_FORK_RE = /^end\s+(?:fork|merge|split)\s*(?:\{[^}]*\})?\s*$/i;

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
    var srcLines = String(text || '').split('\n');
    text = _normalizeLegacy(text || '');
    var result = {
      meta: { title: '', startUmlLine: null },
      nodes: [],
      swimlanes: [],
      notes: [],
    };
    if (!text || !text.trim()) return result;
    // 図の上の矢印が「どの行の後か」を引くために本文の行を持たせる (比べる対象に入らないよう列挙しない)。
    Object.defineProperty(result, 'sourceLines', { value: srcLines, enumerable: false });
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
        var closeSplit = _splitActionColor(trimmed);
        if (closeSplit.color && !openAction.color) openAction.color = closeSplit.color;
        var closeLine = closeSplit.body;
        var endsWithSemi = /;\s*$/.test(closeLine);
        var bodyTextLine = endsWithSemi ? closeLine.replace(/;\s*$/, '') : closeLine;
        openAction.bodyLines.push(bodyTextLine);
        if (endsWithSemi) {
          _appendNode(state, {
            kind: 'action',
            id: _newId(state),
            text: openAction.bodyLines.join('\n'),
            color: openAction.color || null,
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
          keyword: trimmed.match(FORK_OPEN_RE)[1].toLowerCase(),   // 'fork' | 'split'
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
      // 色つき `#色:本文;` は色を外した `:本文;` として、以降まったく同じ扱いにする。
      var split = _splitActionColor(trimmed);
      var actionColor = split.color;
      var actionBody = split.body;
      if (actionBody.charAt(0) === ':') {
        var closedMatch = actionBody.match(ACTION_CLOSED_RE);
        if (closedMatch) {
          _appendNode(state, {
            kind: 'action',
            id: _newId(state),
            text: closedMatch[1],
            color: actionColor,
            line: lineNum,
            endLine: lineNum,
            swimlaneId: null,
          });
          continue;
        }
        openAction = { startLine: lineNum, color: actionColor, bodyLines: [actionBody.substring(1)] };
        continue;
      }
    }
    return result;
  }

  function fmtAction(text, color) {
    return ':' + (text || '') + ';' + (color ? ' <<' + color + '>>' : '');
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

  // Activity では stop / end / kill / detach が流れの終端。末尾追加を @enduml の
  // 直前に置くと足した行が終端の後ろに落ち、プレビューでは前とつながらない別フローに
  // なる (気付くのに時間がかかり、直すには終端の移動か削除が要る)。
  // 末尾が終端ならその手前に入れて、流れの中に置く。
  var TERMINAL_RE = /^(stop|end|kill|detach)$/i;
  function _tailTerminalIndex(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      var s = lines[i].trim();
      if (!s || RP.isEndUml(s)) continue;
      return TERMINAL_RE.test(s) ? i : -1;
    }
    return -1;
  }
  // 流れの終端の手前に 1 行入れる。終端が無ければ従来どおり @enduml の直前。
  function insertBeforeFlowEnd(text, newLine) {
    var lines = text.split('\n');
    var idx = _tailTerminalIndex(lines);
    if (idx < 0) return insertBeforeEnd(text, newLine);
    lines.splice(idx, 0, newLine);
    return lines.join('\n');
  }

  // 新規タブの雛形 `start / :Hello world; / stop` の Hello world はプレースホルダ。
  // 最初のアクションを足した時点で落とす。残すと利用者が別途消すことになり、
  // 消し忘れると自分のアクション列が孤立フローに見える原因になる。
  // 手を入れた図を巻き込まないよう、雛形と完全一致するときだけ落とす。
  function _dropPlaceholder(text) {
    var norm = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    if (norm.trim() !== template().trim()) return text;
    return norm.split('\n').filter(function(l) {
      return l.trim() !== ':Hello world;';
    }).join('\n');
  }

  function addAction(text, actionText) {
    return insertBeforeFlowEnd(_dropPlaceholder(text), fmtAction(actionText || ''));
  }

  // 複数行テキストの 1 行 = 1 アクションとして、末尾へまとめて追加する。
  // 空行と行頭・行末の空白は捨てる。先頭の ':' と末尾の ';' が付いていても受け付ける。
  function splitActionLines(block) {
    var out = [];
    if (!block) return out;
    var lines = String(block).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;
      s = s.replace(/^:/, '').replace(/;$/, '').trim();
      if (!s) continue;
      out.push(s);
    }
    return out;
  }

  function addActions(text, block) {
    var items = splitActionLines(block);
    if (!items.length) return text;
    var out = _dropPlaceholder(text);
    for (var i = 0; i < items.length; i++) {
      out = insertBeforeFlowEnd(out, fmtAction(items[i]));
    }
    return out;
  }

  function addIf(text, condition, thenLabel, elseLabel) {
    var out = text;
    out = insertBeforeFlowEnd(out, fmtIf(condition, thenLabel || 'yes'));
    if (elseLabel) out = insertBeforeFlowEnd(out, fmtElse(elseLabel));
    out = insertBeforeFlowEnd(out, 'endif');
    return out;
  }

  function addWhile(text, condition, label) {
    var out = text;
    out = insertBeforeFlowEnd(out, fmtWhile(condition, label || 'yes'));
    out = insertBeforeFlowEnd(out, 'endwhile');
    return out;
  }

  function addRepeat(text, condition, label) {
    var out = text;
    out = insertBeforeFlowEnd(out, 'repeat');
    out = insertBeforeFlowEnd(out, fmtRepeatWhile(condition, label || 'yes'));
    return out;
  }

  function addFork(text, branchCount) {
    var n = Math.max(1, branchCount || 2);
    var out = text;
    out = insertBeforeFlowEnd(out, 'fork');
    for (var i = 1; i < n; i++) out = insertBeforeFlowEnd(out, 'fork again');
    out = insertBeforeFlowEnd(out, 'end fork');
    return out;
  }

  function addSwimlane(text, label) {
    return insertBeforeFlowEnd(text, fmtSwimlane(label));
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

  // 本文を書き換えても行に付いている色は落とさない (色は本文と別の指定なので、
  // 文言を直しただけで見た目が変わるのは意図しない副作用になる)。
  // 色は前置きなら先頭行、後置きなら閉じる行に付くので、両方の行を見る。
  function actionColorAt(text, startLine, endLine) {
    var lines = text.split('\n');
    var last = endLine == null ? startLine : endLine;
    for (var ln = startLine; ln <= last; ln++) {
      var idx = ln - 1;
      if (idx < 0 || idx >= lines.length) continue;
      var c = _splitActionColor(lines[idx].trim()).color;
      if (c) return c;
    }
    return null;
  }

  // アクションの色だけを差し替える。color が空なら色を外す。
  // 古い前置きが付いていた行は、この操作で警告の出ない後置きに揃う。
  function setActionColor(text, startLine, endLine, color) {
    var lines = text.split('\n');
    var last = endLine == null ? startLine : endLine;
    var sIdx = startLine - 1;
    var eIdx = last - 1;
    if (sIdx < 0 || eIdx >= lines.length || eIdx < sIdx) return text;
    var sIndent = lines[sIdx].match(/^(\s*)/)[1];
    var sBody = _splitActionColor(lines[sIdx].trim()).body;
    if (sBody.charAt(0) !== ':') return text;   // アクション行でなければ触らない
    lines[sIdx] = sIndent + sBody;
    var eIndent = lines[eIdx].match(/^(\s*)/)[1];
    var eBody = _splitActionColor(lines[eIdx].trim()).body;
    if (!/;$/.test(eBody)) return text;         // 閉じていないアクションには付けない
    var norm = color ? (color.charAt(0) === '#' ? color : '#' + color) : '';
    lines[eIdx] = eIndent + eBody + (norm ? ' <<' + norm + '>>' : '');
    return lines.join('\n');
  }

  function updateAction(text, startLine, endLine, newText) {
    var lines = text.split('\n');
    var keepColor = actionColorAt(text, startLine, endLine);
    var newBody = (newText || '').split('\n');
    var firstLine = ':' + newBody[0] + (newBody.length === 1 ? ';' : '');
    var rest = [];
    for (var i = 1; i < newBody.length; i++) {
      rest.push(i === newBody.length - 1 ? newBody[i] + ';' : newBody[i]);
    }
    var newLines = [firstLine].concat(rest);
    if (keepColor) newLines[newLines.length - 1] += ' <<' + keepColor + '>>';
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

  // design 5d: 分岐ラベルは prompt ではなく右ペインのフォームで直す。if / elseif は
  // 条件とラベルが同じ行に同居するので、渡されなかった側は今の値を残す。
  // fields: { condition?, label? }。else 行には condition が無いので無視する。
  function updateBranch(text, lineNum, fields) {
    var f = fields || {};
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var trimmed = lines[idx].trim();
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m;
    if ((m = trimmed.match(IF_OPEN_RE))) {
      lines[idx] = indent + fmtIf(
        f.condition === undefined ? m[1] : f.condition,
        f.label === undefined ? (m[2] || 'yes') : f.label);
    } else if ((m = trimmed.match(ELSEIF_RE))) {
      lines[idx] = indent + fmtElseif(
        f.condition === undefined ? m[1] : f.condition,
        f.label === undefined ? (m[2] || 'yes') : f.label);
    } else if ((m = trimmed.match(ELSE_RE))) {
      lines[idx] = indent + fmtElse(f.label === undefined ? (m[1] || 'no') : f.label);
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
  var CLOSING_TOKEN_RE = /^(endif|endwhile|repeat\s+while|else|elseif|end\s+(?:fork|merge|split)|(?:fork|split)\s+again|end\s+note)/i;

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

  // よく使う分岐パターンを、条件・枝ラベル・枝の中身ごと 1 手で入れる
  // (BLK-junior-20260907-1803-wish)。addControlAtLine の if は枠だけを入れて
  // 中身が `:;` のままなので、型として繰り返し使うにはここが別に要る。
  function addBranchPatternAtLine(text, lineNum, position, pattern) {
    var BP = window.MA.activityBranchPattern;
    if (!BP || !pattern) return text;
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indent = _resolveInsertIndent(lines, Math.min(targetIdx, lines.length - 1));
    var block = BP.linesFor(pattern, indent);
    if (!block.length) return text;
    Array.prototype.splice.apply(lines, [targetIdx, 0].concat(block));
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
    // PlantUML の note は DSL 上の直前 statement に attach されるため、 position
    // 引数は概念的に意味を持たない (attach target は lineNum 自身であり、 前後で
    // はない)。 position='before' で挿入すると line N-1 の action に attach されて
    // しまうバグを避けるため、 互換性のため引数は維持しつつ常に lineNum の
    // AFTER に挿入する。
    var targetIdx = lineNum;
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
    var kw = (lines[forkLine - 1].trim().match(FORK_OPEN_RE) || ['', 'fork'])[1].toLowerCase();
    var block = [
      forkIndent + kw + ' again',
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

  // design 4b: 図の隙間をクリックしたとき、まず「そこに置けるものだけ」を並べた
  // 小さなメニューを出す。今までは常に Action のフォームが直接開き、if / fork を
  // 入れるには種類セレクトを開き直す必要があった。
  // 種別を選ぶと従来の showInsertForm へ、入力の要らない break / detach / kill /
  // start / stop はその場で 1 行入れる。
  // design 5c: 挿入メニューを開いている間、DSL の入る行に印を出す / 消す。
  function _markerShow(line, position) {
    if (window.MA.insertMarker) window.MA.insertMarker.show(line, position);
  }
  function _markerHide() {
    if (window.MA.insertMarker) window.MA.insertMarker.hide();
  }

  function showInsertPicker(ctx, line, position) {
    _renderInsertPicker(ctx, line, position, false);
  }

  function _renderInsertPicker(ctx, line, position, isOther) {
    var AI = window.MA.activityInsert;
    var modal = document.getElementById('act-modal');
    var content = document.getElementById('act-modal-content');
    if (!AI || !modal || !content) {
      // modal が無い環境では従来どおり単一種別のフォーム (prompt へ落ちる) に戻す。
      showInsertForm(ctx, line, position, 'action');
      return;
    }
    var esc = window.MA.htmlUtils.escHtml;
    var groups = AI.pickerKinds(ctx.getMmdText(), line);
    var list = isOther ? groups.other : groups.primary;
    var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">' +
        (isOther ? 'その他' : '＋ ここに挿入') + '</h3>' +
      '<div id="act-pick-target" style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">' +
        esc(AI.describePoint(ctx.getMmdText(), line, position)) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">';
    list.forEach(function(k) {
      html += '<button id="act-pick-' + k.kind + '" data-kind="' + k.kind + '" class="act-pick-btn" ' +
        'style="text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);' +
        'padding:8px 10px;border-radius:4px;cursor:pointer;font-size:12px;">' +
        esc(k.label) +
        '<span style="color:var(--text-secondary);font-size:10px;margin-left:8px;">' + esc(k.hint) + '</span>' +
        '</button>';
    });
    // 分岐は「毎回同じ形」を打ち直していることが多いので、if の枠だけを入れる
    // 導線の隣に、型ごと入れる導線を出す (BLK-junior-20260907-1803-wish)。
    var canBranch = !isOther && list.some(function(k) { return k.kind === 'if'; });
    if (canBranch) {
      html += '<button id="act-pick-pattern" class="act-pick-btn2" ' +
        'style="text-align:left;background:var(--bg-tertiary);border:1px solid var(--accent);color:var(--text-primary);' +
        'padding:8px 10px;border-radius:4px;cursor:pointer;font-size:12px;">' +
        'よく使う分岐パターン' +
        '<span style="color:var(--text-secondary);font-size:10px;margin-left:8px;">条件と両枝の中身ごと入る</span>' +
        '</button>';
    }
    if (!isOther && groups.other.length) {
      html += '<button id="act-pick-other" data-kind="other" class="act-pick-btn" ' +
        'style="text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);' +
        'padding:8px 10px;border-radius:4px;cursor:pointer;font-size:12px;">' +
        'その他（repeat / break / detach / kill）…</button>';
    }
    html += '</div>';
    if (isOther) {
      html += '<button id="act-pick-back" style="width:100%;margin-top:12px;background:var(--bg-tertiary);' +
        'border:1px solid var(--border);color:var(--text-secondary);padding:6px;border-radius:4px;cursor:pointer;font-size:11px;">' +
        '← 種別を選び直す</button>';
    }
    html += '<button id="act-pick-cancel" style="width:100%;margin-top:8px;background:var(--bg-tertiary);' +
      'border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>';
    content.innerHTML = html;
    modal.style.display = 'flex';
    _markerShow(line, position);

    Array.prototype.forEach.call(content.querySelectorAll('.act-pick-btn'), function(btn) {
      btn.addEventListener('click', function() {
        var kind = btn.getAttribute('data-kind');
        if (kind === 'other') { _renderInsertPicker(ctx, line, position, true); return; }
        if (AI.isBareKind(kind)) {
          var src = ctx.getMmdText();
          var out = _insertBareAtLine(src, line, position, AI.bareLineFor(kind));
          if (out !== src) {
            window.MA.history.pushHistory();
            ctx.setMmdText(out);
            ctx.onUpdate();
          }
          modal.style.display = 'none';
          content.innerHTML = '';
          _markerHide();
          return;
        }
        showInsertForm(ctx, line, position, kind);
      });
    });
    if (canBranch) {
      document.getElementById('act-pick-pattern').addEventListener('click', function() {
        _renderPatternPicker(ctx, line, position);
      });
    }
    if (isOther) {
      document.getElementById('act-pick-back').addEventListener('click', function() {
        _renderInsertPicker(ctx, line, position, false);
      });
    }
    document.getElementById('act-pick-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
      content.innerHTML = '';
      _markerHide();
    });
  }

  // 「よく使う分岐パターン」の一覧。組み込みの型と、開いている他のアクティビティ図
  // から採った型 (先輩や自分の過去図) を並べ、1 クリックで挿入する。
  // 条件文言だけ直したいことがあるので、挿入前に条件を書き換えられる欄も置く。
  function _renderPatternPicker(ctx, line, position) {
    var BP = window.MA.activityBranchPattern;
    var AI = window.MA.activityInsert;
    var modal = document.getElementById('act-modal');
    var content = document.getElementById('act-modal-content');
    if (!BP || !modal || !content) { showInsertForm(ctx, line, position, 'if'); return; }
    var esc = window.MA.htmlUtils.escHtml;
    var ws = window.MA.workspace;
    var docs = (ws && ws.list) ? ws.list() : [];
    var activeId = (ws && ws.getActiveId) ? ws.getActiveId() : null;
    var list = BP.patterns(docs, activeId);

    var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">よく使う分岐パターン</h3>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">' +
        esc(AI ? AI.describePoint(ctx.getMmdText(), line, position) : '') + '</div>' +
      '<div id="act-pat-list" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto;">';
    list.forEach(function(p, i) {
      html += '<button class="act-pat-btn" data-i="' + i + '" id="act-pat-' + p.id + '" ' +
        'style="text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);' +
        'padding:8px 10px;border-radius:4px;cursor:pointer;font-size:12px;">' +
        '<div>' + esc(p.label) + (p.from ? '<span style="color:var(--text-secondary);font-size:10px;margin-left:8px;">' + esc(p.from) + '</span>' : '') + '</div>' +
        '<div style="color:var(--text-secondary);font-size:10px;margin-top:2px;">' + esc(BP.summary(p)) + '</div>' +
        '</button>';
    });
    html += '</div>' +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);margin:10px 0 2px 0;">条件を変える (空なら型のまま)</label>' +
      '<input id="act-pat-cond" type="text" style="width:100%;box-sizing:border-box;background:var(--bg-primary);' +
        'border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:3px;font-size:12px;">' +
      '<button id="act-pat-back" style="width:100%;margin-top:12px;background:var(--bg-tertiary);' +
        'border:1px solid var(--border);color:var(--text-secondary);padding:6px;border-radius:4px;cursor:pointer;font-size:11px;">' +
        '← 種別を選び直す</button>' +
      '<button id="act-pat-cancel" style="width:100%;margin-top:8px;background:var(--bg-tertiary);' +
        'border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>';
    content.innerHTML = html;
    modal.style.display = 'flex';
    _markerShow(line, position);

    Array.prototype.forEach.call(content.querySelectorAll('.act-pat-btn'), function(btn) {
      btn.addEventListener('click', function() {
        var p = list[parseInt(btn.getAttribute('data-i'), 10)];
        if (!p) return;
        var condEl = document.getElementById('act-pat-cond');
        var cond = condEl && condEl.value.trim();
        if (cond) { p = JSON.parse(JSON.stringify(p)); p.cond = cond; }
        var src = ctx.getMmdText();
        var out = addBranchPatternAtLine(src, line, position, p);
        if (out !== src) {
          window.MA.history.pushHistory();
          ctx.setMmdText(out);
          ctx.onUpdate();
        }
        modal.style.display = 'none';
        content.innerHTML = '';
        _markerHide();
      });
    });
    document.getElementById('act-pat-back').addEventListener('click', function() {
      _renderInsertPicker(ctx, line, position, false);
    });
    document.getElementById('act-pat-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
      content.innerHTML = '';
      _markerHide();
    });
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
    _markerShow(line, position);

    function renderFields() {
      var k = document.getElementById('act-mod-kind').value;
      var fEl = document.getElementById('act-mod-fields');
      var html = '';
      if (k === 'action') {
        html = '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">アクション本文 (改行可)</label>' +
               '<textarea id="act-mod-text" style="width:100%;min-height:60px;font-family:inherit;font-size:12px;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:3px;"></textarea>' +
               // BLK-junior-20260915-0606: 途中に挿し込むときも同じ名前帳から引ける。
               P.vocabPickerHtml('act-mod-text-vocab', { roles: ['method'], callSuffix: true });
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
      P.bindVocabPicker('act-mod-text-vocab', 'act-mod-text', null, { insert: 'caret' });
    }
    renderFields();
    P.bindEvent('act-mod-kind', 'change', renderFields);

    function close() { modal.style.display = 'none'; content.innerHTML = ''; _markerHide(); }
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

  // FEAT-115 (HFR-061): elseif の condition と label を 1 枚のフォームで入力する (3 手 → 2 手)。
  // showInsertForm と同じ作法で act-modal に描き、modal が無ければ prompt() 2 回に戻る ([AC-5])。
  function showElseifForm(ctx, node) {
    var modal = document.getElementById('act-modal');
    var content = document.getElementById('act-modal-content');
    if (!modal || !content) {
      var pCond = window.prompt('elseif condition:', '');
      if (pCond === null) return;
      var pLbl = window.prompt('elseif label (default: yes):', 'yes') || 'yes';
      window.MA.history.pushHistory();
      ctx.setMmdText(addElseifBranch(ctx.getMmdText(), node.line, pCond, pLbl));
      ctx.onUpdate();
      return;
    }
    var P = window.MA.properties;
    content.innerHTML =
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">elseif を追加</h3>' +
      P.fieldHtml('elseif condition', 'act-ei-cond', '', '例: 認証失敗?') +
      P.fieldHtml('elseif label (default: yes)', 'act-ei-lbl', 'yes') +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="act-ei-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="act-ei-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';
    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    function confirmForm() {
      var cond = document.getElementById('act-ei-cond').value;
      var lbl = document.getElementById('act-ei-lbl').value || 'yes';
      window.MA.history.pushHistory();
      ctx.setMmdText(addElseifBranch(ctx.getMmdText(), node.line, cond, lbl));
      ctx.onUpdate();
      close();
    }
    P.bindEvent('act-ei-cancel', 'click', close);
    P.bindEvent('act-ei-confirm', 'click', confirmForm);
    // 欄への明示のフォーカス移動が手数 (charter §5) に加算され旧経路より増えるのを避けるため、
    // 開いた時点で condition 欄にフォーカスを置き、どちらの欄でも Enter で確定できるようにする。
    function onEnter(e) { if (e.key === 'Enter') { e.preventDefault(); confirmForm(); } }
    P.bindEvent('act-ei-cond', 'keydown', onEnter);
    P.bindEvent('act-ei-lbl', 'keydown', onEnter);
    var condEl = document.getElementById('act-ei-cond');
    if (condEl && condEl.focus) condEl.focus();
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

  // BLK-migrator-20260929-0951: 分岐・合流の棒は、fork なら塗った細い <rect> (高さ 6 前後) で、split / end split なら
  // 横の <line> (stroke-width 1.5) で描かれる。どちらも「上下から矢印がつながる横の区間」なので、描いた側から拾う。
  // 横線のうち太さ 1.3 以上で、端点がその線に触れる縦の線 (矢印) が 1 本以上あるものを棒とする
  // (矢印の横の区間は太さ 1 なので入らない)。返り値は棒と見なした <line> の配列。
  function _barLines(svgEl) {
    if (!svgEl || !svgEl.querySelectorAll) return [];
    var all = Array.prototype.slice.call(svgEl.querySelectorAll('line'));
    function num(el, k) { return parseFloat(el.getAttribute(k)) || 0; }
    function sw(el) {
      var m = /stroke-width\s*:\s*([\d.]+)/.exec(el.getAttribute('style') || '');
      return m ? parseFloat(m[1]) : (parseFloat(el.getAttribute('stroke-width')) || 1);
    }
    var verticals = all.filter(function(l) {
      return Math.abs(num(l, 'x1') - num(l, 'x2')) < 0.5 && Math.abs(num(l, 'y1') - num(l, 'y2')) >= 4;
    });
    return all.filter(function(l) {
      if (_inDecor(l)) return false;
      var y = num(l, 'y1');
      if (Math.abs(num(l, 'y2') - y) > 0.5) return false;
      var x1 = Math.min(num(l, 'x1'), num(l, 'x2'));
      var x2 = Math.max(num(l, 'x1'), num(l, 'x2'));
      if (x2 - x1 < 8 || sw(l) < 1.3) return false;
      return verticals.some(function(v) {
        var vx = num(v, 'x1');
        if (vx < x1 - 1 || vx > x2 + 1) return false;
        return Math.abs(num(v, 'y1') - y) <= 2.5 || Math.abs(num(v, 'y2') - y) <= 2.5;
      });
    });
  }

  // 棒の上端で終わる縦の線 (上から入る矢印) の本数。合流の棒 (end fork / end split) には枝の数だけ入り、
  // 分岐の棒には 1 本だけ入る。並び順の当て方で、開きの節点が前の合流の棒を取らないように使う。
  function _barIncoming(svgEl, bb) {
    if (!bb) return 0;
    var n = 0;
    Array.prototype.forEach.call(svgEl.querySelectorAll('line'), function(v) {
      var x1 = parseFloat(v.getAttribute('x1')) || 0, x2 = parseFloat(v.getAttribute('x2')) || 0;
      var y1 = parseFloat(v.getAttribute('y1')) || 0, y2 = parseFloat(v.getAttribute('y2')) || 0;
      if (Math.abs(x1 - x2) >= 0.5 || Math.abs(y1 - y2) < 4) return;
      if (x1 < bb.x - 1 || x1 > bb.x + bb.width + 1) return;
      var top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      if (top < bb.y && Math.abs(bottom - bb.y) <= 2.5 + (bb.height / 2)) n++;
    });
    return n;
  }

  // 棒の <line> の当たり: 線の左右いっぱい、上下 3px (fork の棒の高さ 6 と揃える)。
  var BAR_LINE_HALF = 3;
  function _lineBarBBox(el) {
    var x1 = parseFloat(el.getAttribute('x1')) || 0, x2 = parseFloat(el.getAttribute('x2')) || 0;
    var y = parseFloat(el.getAttribute('y1')) || 0;
    return { x: Math.min(x1, x2), y: y - BAR_LINE_HALF, width: Math.abs(x2 - x1), height: BAR_LINE_HALF * 2 };
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
    if (tag === 'line') return _lineBarBBox(el);
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


  // 分岐の枝ラベル (「異常」「正常」など) を、DSL の並び順で集める。
  // PlantUML は枝ラベルを分岐の矢印の脇に <text> で描く。ラベルを選べるようにすると、
  // 「この側に足す」が図の上のクリックで決まる (BLK-junior-20260908-0103)。
  function _branchLabelTargets(nodes, out) {
    out = out || [];
    (nodes || []).forEach(function(n) {
      if (n.kind === 'if' && n.branches) {
        n.branches.forEach(function(b, bi) {
          var label = String(b.label == null ? '' : b.label).trim();
          if (label) out.push({ id: n.id + '#b' + bi, label: label, line: b.line, condition: n.condition });
          _branchLabelTargets(b.body, out);
        });
        return;
      }
      if (n.branches) n.branches.forEach(function(b) { _branchLabelTargets(b.body, out); });
      if (n.body) _branchLabelTargets(n.body, out);
    });
    return out;
  }

  // ラベルの文字と同じ <text> を、文書順に 1 つずつ割り当てる。
  // 見つからないラベルは飛ばす (印が 1 つ欠けるだけで、既存の選択は壊さない)。
  function _addBranchLabelRects(svgEl, parsedData, overlayEl) {
    var targets = _branchLabelTargets(parsedData.nodes || []);
    if (!targets.length) return 0;
    var texts = svgEl.querySelectorAll('text');
    var used = {};
    var added = 0;
    targets.forEach(function(t) {
      for (var i = 0; i < texts.length; i++) {
        if (used[i]) continue;
        if (String(texts[i].textContent || '').trim() !== t.label) continue;
        var bb = null;
        try { bb = texts[i].getBBox(); } catch (e) { bb = null; }
        if (!bb || !bb.width || !bb.height) {
          // jsdom / 描画前は BBox が取れない。取れないラベルは印を置かない。
          used[i] = true;
          break;
        }
        used[i] = true;
        // BLK-human-20260912-2130: 分岐ラベル (yes / no) は文字の外周ちょうどだと
        // 当たり判定が数 px しかなく、狙って押すのが難しい。他図種の関係と同じく
        // 少し広げ、hover の枠でその範囲が見えるようにする。
        var pad = 4;
        OB.addRect(overlayEl, bb.x - pad, bb.y - pad, bb.width + 2 * pad, bb.height + 2 * pad, {
          'data-type': 'branch',
          'data-id': t.id,
          'data-line': String(t.line),
        });
        added++;
        break;
      }
    });
    return added;
  }

  function _normLabel(t) {
    return String(t || '').split(/\r?\n|\\n/)[0].replace(/<[^>]+>/g, '').replace(/\*\*|\/\/|__|""|~~/g, '')
      .replace(/\s+/g, '').toLowerCase();
  }

  // 動作ノードごとに、その名前の文字を中に描いた箱 (rect) を 1 つ探す。同じ名前が複数あれば並び順。
  function _matchActionsByText(svgEl, flat) {
    var boxes = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('rect'), function(r) {
      if (_inDecor(r)) return;
      var h = parseFloat(r.getAttribute('height')) || 0;
      var w = parseFloat(r.getAttribute('width')) || 0;
      if (h < 16 || w < 10) return;
      boxes.push({ el: r, x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0, w: w, h: h, label: null });
    });
    var texts = _textsIn(svgEl);
    boxes.forEach(function(b) {
      for (var i = 0; i < texts.length; i++) {
        var t = texts[i];
        if (t.x >= b.x && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h) { b.label = _normLabel(t.s); break; }
      }
    });
    var used = [];
    var out = [];
    flat.forEach(function(n) {
      if (n.kind !== 'action') return;
      var want = _normLabel(n.text);
      if (!want) return;
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (!b.label || used.indexOf(b) >= 0) continue;
        if (b.label === want || (b.label.length >= 4 && want.indexOf(b.label) === 0)) {
          used.push(b); out.push({ node: n, el: b.el }); return;
        }
      }
    });
    return out;
  }

  // BLK-migrator-20260924-0752: レーンの見出し (`|Swimlane1|`) は、描かれた見出しの文字で当てる。
  // 押すとそのレーンを最初に書いた行が選ばれ、右欄でレーン名を直せる。
  function _addSwimlaneHeaderRects(svgEl, parsedData, overlayEl) {
    var sws = parsedData.swimlanes || [];
    if (!sws.length) return;
    var seen = {};
    var texts = Array.prototype.slice.call(svgEl.querySelectorAll('text'));
    sws.forEach(function(sw) {
      var want = _normLabel(sw.label);
      if (!want || seen[want]) return;
      seen[want] = true;
      for (var i = 0; i < texts.length; i++) {
        if (_normLabel(texts[i].textContent) !== want) continue;
        var bb = OB.nodeBBox(texts[i]);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 4, bb.y - 4, bb.width + 8, bb.height + 8, {
          'data-type': 'swimlane', 'data-id': sw.id, 'data-line': String(sw.line),
        });
        return;
      }
    });
  }

  // BLK-migrator-20260929-0952: partition (と同じ描き方の group / rectangle / card) の入れ物を本文から読む。
  // 名前・開きの行・閉じの `}` の行・入れ子の深さ。skinparam の `{ … }` と <style> の中の `}` は入れ物として数えない。
  var PARTITION_OPEN_RE = /^(partition|group|rectangle|card)\s+(.+?)\s*\{\s*$/i;
  function readPartitions(lines) {
    var out = [], stack = [], inStyle = false;
    (lines || []).forEach(function(raw, i) {
      var t = String(raw || '').trim();
      if (!t || t.charAt(0) === "'") return;
      if (inStyle) { if (/<\/style>/i.test(t)) inStyle = false; return; }
      if (/^<style>/i.test(t)) { inStyle = !/<\/style>/i.test(t); return; }
      var m = PARTITION_OPEN_RE.exec(t);
      if (m) {
        var name = m[2].replace(/<<[^>]*>>/g, ' ').replace(/\s+#[^\s"]+$/, '').replace(/^#[^\s"]+\s+/, '').trim();
        if (/^".*"$/.test(name)) name = name.slice(1, -1);
        var depth = stack.filter(function(s) { return s; }).length;
        var p = { kind: m[1].toLowerCase(), name: name, line: i + 1, endLine: null, depth: depth };
        out.push(p);
        stack.push(p);
        return;
      }
      if (/\{\s*$/.test(t)) { stack.push(null); return; }
      if (/^\}/.test(t) && stack.length) {
        var top = stack.pop();
        if (top) top.endLine = i + 1;
      }
    });
    return out;
  }

  // 描いた入れ物: 枠の <rect> (塗りの有無・角の丸みは問わない) と、その直後の見出しの札 (<path>、partition / group) と
  // 見出しの <text>。札の無い rectangle / card は、枠の上端のすぐ下に書いた見出しの文字。
  function _drawnPartitions(svgEl) {
    var out = [];
    function num(el, k) { return parseFloat(el.getAttribute(k)) || 0; }
    function next(el) { return el.nextElementSibling; }
    Array.prototype.forEach.call(svgEl.querySelectorAll('rect'), function(r) {
      var x = num(r, 'x'), y = num(r, 'y'), w = num(r, 'width'), h = num(r, 'height');
      if (w < 20 || h < 30) return;
      var tab = null, n = next(r);
      if (n && n.tagName.toLowerCase() === 'path') {
        var pts = String(n.getAttribute('d') || '').match(/-?[\d.]+(?:e-?\d+)?/gi) || [];
        var ps = [];
        for (var i = 0; i + 1 < pts.length; i += 2) ps.push({ x: parseFloat(pts[i]), y: parseFloat(pts[i + 1]) });
        var last = ps[ps.length - 1];
        if (ps.length >= 3 && Math.abs(ps[0].y - y) < 0.5 && Math.abs(last.x - x) < 0.5 && ps[0].x > x && ps[0].x <= x + w + 0.5) {
          tab = { el: n, x: x, y: y, w: ps[0].x - x, h: Math.max.apply(null, ps.map(function(q) { return q.y; })) - y };
          n = next(n);
        }
      }
      // card は見出しの下に横の区切り線 (<line>) を描く。split の棒と見なさない
      var sep = null;
      if (!tab && n && n.tagName.toLowerCase() === 'line' && num(n, 'y1') === num(n, 'y2') &&
        Math.abs(Math.min(num(n, 'x1'), num(n, 'x2')) - x) < 0.5 && num(n, 'y1') - y < 30) {
        sep = n;
        n = next(n);
      }
      var texts = [];
      while (n && n.tagName.toLowerCase() === 'text') {
        var tx = num(n, 'x'), ty = num(n, 'y');
        if (tx < x || tx > x + w || ty < y || ty > y + (tab ? tab.h + 2 : 26)) break;
        texts.push(n);
        n = next(n);
      }
      if (!texts.length) return;
      // 札の無い枠は、見出しの文字 (動作の文字より大きい) の下に中身の入る高さがあるものだけ (動作の箱を取らない)
      if (!tab && (num(texts[0], 'font-size') < 13 || h - (num(texts[0], 'y') - y) < 30)) return;
      out.push({ rect: r, tab: tab, sep: sep, texts: texts, box: { x: x, y: y, w: w, h: h },
        label: _normLabel(texts.map(function(t) { return t.textContent || ''; }).join('')) });
    });
    return out;
  }

  // 本文の入れ物と描いた入れ物を、見出しの文字 = 名前で照らして対にする (上から順)。名前で照らせない残りは、
  // 残りの数が同じときだけ並び順で対にする。
  function _matchPartitions(svgEl, lines) {
    var parts = readPartitions(lines);
    if (!parts.length) return [];
    var drawn = _drawnPartitions(svgEl);
    var pairs = [];
    var rest = [];
    parts.forEach(function(p) {
      var want = _normLabel(p.name);
      var hit = null;
      // partition / group は札のある枠、rectangle / card は札の無い枠
      var withTab = p.kind === 'partition' || p.kind === 'group';
      for (var i = 0; !hit && i < drawn.length; i++) {
        if (!drawn[i].used && want && !!drawn[i].tab === withTab && drawn[i].label === want) hit = drawn[i];
      }
      if (hit) { hit.used = true; pairs.push({ part: p, drawn: hit }); } else rest.push(p);
    });
    var left = drawn.filter(function(d) { return !d.used && d.tab; });
    rest = rest.filter(function(p) { return p.kind === 'partition' || p.kind === 'group'; });
    if (rest.length && rest.length === left.length) {
      rest.forEach(function(p, i) { pairs.push({ part: p, drawn: left[i] }); });
    }
    return pairs;
  }

  // 入れ物の枠: 見出しの札 (文字)・枠線の 4 辺のどこを押しても同じ入れ物が選ばれ、本文の開きの行を指す。
  // 中の空所は入れ物 (data-hit-kind="container" で中の部品・矢印より後ろ)。4 辺の細い帯と見出しの札 (frameline) は、
  // 辺・札を横切る矢印より手前。入れ子は小さい (内側の) 方が手前。
  function _addPartitionRects(overlayEl, pairs) {
    // 帯の幅は辺の内外 2 ずつ (辺に着く矢印の端の区間を帯で覆いすぎない)
    var pad = 2;
    pairs.forEach(function(pr) {
      var b = pr.drawn.box, line = pr.part.line;
      function attrs(kind) {
        var a = { 'data-type': 'source-line', 'data-id': 'src:partition@' + line, 'data-src-kind': 'partition',
          'data-line': String(line) };
        if (kind) a['data-hit-kind'] = kind;
        return a;
      }
      OB.addRect(overlayEl, b.x, b.y, b.w, b.h, attrs('container'));
      OB.addRect(overlayEl, b.x - pad, b.y - pad, b.w + pad * 2, pad * 2, attrs('frameline'));
      OB.addRect(overlayEl, b.x - pad, b.y + b.h - pad, b.w + pad * 2, pad * 2, attrs('frameline'));
      OB.addRect(overlayEl, b.x - pad, b.y - pad, pad * 2, b.h + pad * 2, attrs('frameline'));
      OB.addRect(overlayEl, b.x + b.w - pad, b.y - pad, pad * 2, b.h + pad * 2, attrs('frameline'));
      var head = pr.drawn.tab;
      if (!head) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        pr.drawn.texts.forEach(function(t) {
          var tb = OB.nodeBBox(t);
          if (!tb) return;
          x0 = Math.min(x0, tb.x); y0 = Math.min(y0, tb.y); x1 = Math.max(x1, tb.x + tb.width); y1 = Math.max(y1, tb.y + tb.height);
        });
        if (x0 < x1) head = { x: x0 - 3, y: y0 - 3, w: x1 - x0 + 6, h: y1 - y0 + 6 };
      }
      // 見出しの札も枠線と同じ段: 札の上を通る矢印より手前 (見出しの文字を指したら partition)
      if (head) OB.addRect(overlayEl, head.x, head.y, head.w, head.h, attrs('frameline'));
    });
  }

  // BLK-migrator-20260924-2232: 図の題・凡例・見出し・脚注・図の下の説明は、PlantUML が
  // <g class="title" data-source-line> に行を残す。本文の並びを数えず、その行で当てる
  // (題が付いても動作・分岐の対応はずれない)。data-source-line は @startuml を 0 とする。
  // BLK-migrator-20260925-0932: 当て方は全図種共通の overlayBuilder.addDocumentChrome の 1 か所に置く。
  function _addDecorRects(svgEl, parsedData, overlayEl) {
    var base = (parsedData && parsedData.meta && parsedData.meta.startUmlLine) || 1;
    OB.addDocumentChrome(svgEl, overlayEl, null, { startUmlLine: base });
  }

  // 題・凡例などの <g> の中の図形は、動作や分岐の箱として数えない。
  // BLK-migrator-20260925-1732: mainframe の枠・札・札の文字 (どの <g> にも入らない) も同じ。buildOverlay が描画ごとに入れ直す。
  var _chromeEls = [];
  function _inDecor(el) {
    if (_chromeEls.indexOf(el) >= 0) return true;
    var n = el.parentNode;
    while (n && n.tagName && n.tagName.toLowerCase() !== 'svg') {
      if (n.tagName.toLowerCase() === 'g' && /^(title|legend|caption|header|footer)$/.test(
        (n.getAttribute('class') || '').split(/\s+/)[0])) return true;
      n = n.parentNode;
    }
    return false;
  }

  function _textsIn(svgEl) {
    return Array.prototype.filter.call(svgEl.querySelectorAll('text'), function(t) { return !_inDecor(t); })
      .map(function(t) {
        return { el: t, x: parseFloat(t.getAttribute('x')) || 0, y: parseFloat(t.getAttribute('y')) || 0, s: t.textContent || '' };
      });
  }

  // 分岐 (if / elseif / while) の菱形は、中に描かれた条件の文字で先に当てる。
  // elseif の菱形は本文の並びでは数えられず (if 1 つに菱形が 2 つ描かれる)、並び順だけでは枠が出なかった。
  function _matchDecisionsByText(svgEl, flat) {
    var texts = _textsIn(svgEl);
    var polys = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('polygon'), function(p) {
      if (_inDecor(p) || _parsePoints(p).length !== 7) return;
      var bb = _polygonBBox(p);
      if (!bb) return;
      var label = '';
      texts.forEach(function(t) {
        // 文字の中央が菱形の中にあるものだけ (菱形の脇に描く枝のラベル yes / no は含めない)。
        var mid = t.x + (parseFloat(t.el.getAttribute('textLength')) || 0) / 2;
        if (mid >= bb.x && mid <= bb.x + bb.width && t.y >= bb.y && t.y <= bb.y + bb.height + 2) label += _normLabel(t.s);
      });
      polys.push({ el: p, label: label });
    });
    var wants = [];
    flat.forEach(function(n) {
      if (n.kind === 'if') {
        wants.push({ node: n, line: n.line, want: _normLabel(n.condition) });
        (n.branches || []).forEach(function(b) {
          if (b.kind === 'elseif') wants.push({ node: n, line: b.line, want: _normLabel(b.condition), extra: true });
        });
      } else if (n.kind === 'while') {
        wants.push({ node: n, line: n.line, want: _normLabel(n.condition) });
      }
    });
    var used = [];
    var out = [];
    wants.forEach(function(w) {
      if (!w.want) return;
      for (var i = 0; i < polys.length; i++) {
        var p = polys[i];
        if (!p.label || used.indexOf(p) >= 0) continue;
        if (p.label === w.want || (p.label.length >= 4 && w.want.indexOf(p.label) === 0)) {
          used.push(p); out.push({ node: w.node, line: w.line, el: p.el, extra: !!w.extra }); return;
        }
      }
    });
    return out;
  }

  // 矢印の前にある本文の行 (この矢印の上に足す = その行の後に足す)。空行・コメントは飛ばす。
  function _flowLineBefore(lines, targetLine) {
    if (!lines.length) return targetLine > 1 ? targetLine - 1 : 0;
    var t = String(lines[targetLine - 1] || '').trim();
    // elseif / else の菱形へ入る矢印は「条件が違ったとき」の道。行はその分岐の行にする。
    if (/^(elseif|else)\b/i.test(t)) return targetLine;
    for (var i = targetLine - 2; i >= 0; i--) {
      var s = String(lines[i] || '').trim();
      if (!s || s.charAt(0) === "'") continue;
      if (/^@startuml/i.test(s)) return 0;
      return i + 1;
    }
    return 0;
  }

  // BLK-migrator-20260924-2232: 新記法の矢印は PlantUML が <g> にも行にも入れず、線と矢じりだけを描く。
  // 矢じりの先が触れている要素 (無ければ線の元の要素) を描いた位置から探し、
  // 「その要素の前 (= 本文でその 1 つ前の行の後)」を指す枠を置く。押せばその位置に足せる。
  function _addFlowRects(svgEl, overlayEl, lines) {
    var frames = Array.prototype.filter.call(overlayEl.querySelectorAll('rect.selectable'), function(r) {
      // BLK-builder-20260925-1712-2: 閉じの図形 (合流の菱形・下の棒) も矢印の端として見る
      if (/^(action|decision|start|stop|end|fork|note)$/.test(r.getAttribute('data-type') || '') ||
        /^(close|loop)$/.test(r.getAttribute('data-src-kind') || '')) return true;
      // BLK-migrator-20260926-2118: switch の菱形 (文字で当てた枠) も矢印の端。入る矢印は switch の前を指す
      return r.getAttribute('data-src-kind') === 'text' &&
        /^\s*switch\s*\(/i.test(String(lines[(parseInt(r.getAttribute('data-line'), 10) || 0) - 1] || ''));
    }).map(function(r) {
      return {
        x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0,
        w: parseFloat(r.getAttribute('width')) || 0, h: parseFloat(r.getAttribute('height')) || 0,
        line: parseInt(r.getAttribute('data-line'), 10),
        close: r.getAttribute('data-src-kind') === 'close',
      };
    });
    var segs = Array.prototype.filter.call(svgEl.querySelectorAll('line'), function(l) { return !_inDecor(l); })
      .map(function(l) {
        return { x1: parseFloat(l.getAttribute('x1')) || 0, y1: parseFloat(l.getAttribute('y1')) || 0,
          x2: parseFloat(l.getAttribute('x2')) || 0, y2: parseFloat(l.getAttribute('y2')) || 0 };
      })
      // 長さ 0 の線 (折れ目に PlantUML が描く点) は道の分かれ目に数えない
      .filter(function(s) { return Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1) >= 0.5; });
    function frameAt(x, y) {
      var best = null;
      frames.forEach(function(f) {
        if (x < f.x - 2 || x > f.x + f.w + 2 || y < f.y - 2 || y > f.y + f.h + 2) return;
        if (!best || f.w * f.h < best.w * best.h) best = f;
      });
      return best;
    }
    // 既に枠のある文字 (枝のラベル・レーンの見出しなど) は矢印の文字にしない。入れ物 (partition) の中の空所は数えない。
    var placed = Array.prototype.map.call(overlayEl.querySelectorAll('rect.selectable:not([data-hit-kind="container"])'), function(r) {
      return { x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0,
        w: parseFloat(r.getAttribute('width')) || 0, h: parseFloat(r.getAttribute('height')) || 0 };
    });
    var texts = _textsIn(svgEl).filter(function(t) {
      return !placed.some(function(f) {
        return t.x + 1 >= f.x && t.x + 1 <= f.x + f.w && t.y - 3 >= f.y && t.y - 3 <= f.y + f.h;
      });
    });
    // 2 回目の呼び出し (閉じの図形を足した後) では、既に枠のある矢じりは飛ばし、番号は続きから振る
    var flowBoxes = Array.prototype.filter.call(overlayEl.querySelectorAll('rect.selectable[data-type="flow"]'), function(r) {
      return !/:label$/.test(r.getAttribute('data-id') || '');
    }).map(function(r) {
      return { x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0,
        w: parseFloat(r.getAttribute('width')) || 0, h: parseFloat(r.getAttribute('height')) || 0 };
    });
    var n = flowBoxes.length;
    function near(ax, ay, bx, by) { return Math.abs(ax - bx) < 1.5 && Math.abs(ay - by) < 1.5; }
    // 矢じり (4 点の小さい polygon) と、その矢印の最後の区間 (矢じりと同じ向きで、矢じりの先に端がある線)。
    var heads = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('polygon'), function(p) {
      if (_inDecor(p)) return;
      var pts = _parsePoints(p);
      if (pts.length !== 4) return;
      var bb = _polygonBBox(p);
      if (!bb || bb.width > 20 || bb.height > 20) return;
      var cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      var cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      var tip = pts[0], far = -1;
      pts.forEach(function(q) {
        var d = (q.x - cx) * (q.x - cx) + (q.y - cy) * (q.y - cy);
        if (d > far) { far = d; tip = q; }
      });
      var dx = tip.x - cx, dy = tip.y - cy;
      var own = segs.filter(function(s) {
        if (!near(s.x1, s.y1, tip.x, tip.y) && !near(s.x2, s.y2, tip.x, tip.y)) return false;
        var sx = s.x2 - s.x1, sy = s.y2 - s.y1;
        return Math.abs(sx * dy - sy * dx) <= 0.2 * Math.sqrt(sx * sx + sy * sy) * Math.sqrt(dx * dx + dy * dy) + 0.01;
      });
      heads.push({ bb: bb, tip: tip, dx: dx, dy: dy, own: own });
    });
    // 別の矢印の最後の区間は、その矢印のもの (たどって別の矢印へ乗り移らない)
    var lastSegs = [];
    heads.forEach(function(h) { h.own.forEach(function(s) { lastSegs.push(s); }); });
    // BLK-migrator-20260926-2118: 1 本の矢印 = 矢じりから元の要素まで、端点でつながった区間の全部。
    // 折れた矢印 (分岐の菱形から枝へ「横へ → 下へ」、枝から合流へ「下へ → 横へ」、while / repeat の戻り) は、
    // 最後の区間の遠い端から、元の要素 (行を持つ枠) に着くまで区間をたどる。分かれ道 (続きが 2 本以上) と
    // 別の矢印の最後の区間では止める。行を決める道と枠を出す区間はこの 1 つの道。
    function tracePath(s, tip) {
      var far1 = Math.abs(s.x1 - tip.x) + Math.abs(s.y1 - tip.y) > Math.abs(s.x2 - tip.x) + Math.abs(s.y2 - tip.y);
      var fx = far1 ? s.x1 : s.x2, fy = far1 ? s.y1 : s.y2;
      var path = [], seen = [s];
      var src = frameAt(fx, fy);
      for (var hop = 0; hop < 8 && !(src && src.line); hop++) {
        var cands = [];
        segs.forEach(function(q) {
          if (seen.indexOf(q) >= 0) return;
          if (near(q.x1, q.y1, fx, fy)) cands.push({ q: q, x: q.x2, y: q.y2 });
          else if (near(q.x2, q.y2, fx, fy)) cands.push({ q: q, x: q.x1, y: q.y1 });
        });
        if (cands.length !== 1 || lastSegs.indexOf(cands[0].q) >= 0) break;
        seen.push(cands[0].q);
        path.push(cands[0].q);
        fx = cands[0].x; fy = cands[0].y;
        src = frameAt(fx, fy);
      }
      return { path: path, src: src };
    }
    heads.forEach(function(h) {
      var bb = h.bb, tip = h.tip, dx = h.dx, dy = h.dy, own = h.own;
      var hx = bb.x + bb.width / 2, hy = bb.y + bb.height / 2;
      if (flowBoxes.some(function(f) { return hx >= f.x && hx <= f.x + f.w && hy >= f.y && hy <= f.y + f.h; })) return;
      var line = 0;
      var target = frameAt(tip.x, tip.y);
      // 合流へ入る矢印は、合流の前 (= 別の枝の最後) ではなく、矢印の元の要素の後を指す
      if (target && target.line && !target.close) line = _flowLineBefore(lines, target.line);
      var path = [];
      own.forEach(function(s) {
        if (path.length) return;
        var tr = tracePath(s, tip);
        path = tr.path;
        if (!line && tr.src && tr.src.line) line = tr.src.line;
      });
      if (!line) return;
      var x0 = bb.x, y0 = bb.y, x1 = bb.x + bb.width, y1 = bb.y + bb.height;
      own.forEach(function(s) {
        x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2);
        y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2);
      });
      // 線の両端は要素の縁に接するだけなので、線の向きには 1 px だけ、横 (縦) には余白を取る。
      var attrs = { 'data-type': 'flow', 'data-id': 'flow:' + line + ':' + n, 'data-line': String(line) };
      var pad = 3;
      var vertical = Math.abs(dy) >= Math.abs(dx);
      if (vertical) {
        OB.addRect(overlayEl, x0 - pad, y0 - 1, (x1 - x0) + pad * 2, Math.max(2, y1 - y0) + 2, attrs);
      } else {
        OB.addRect(overlayEl, x0 - 1, y0 - pad, Math.max(2, x1 - x0) + 2, (y1 - y0) + pad * 2, attrs);
      }
      // 折れた矢印の残りの区間にも、区間ごとの細い枠を同じ data-id で置く (L 字を外接矩形 1 つで覆わない)。
      path.forEach(function(s) {
        var sx0 = Math.min(s.x1, s.x2), sx1 = Math.max(s.x1, s.x2), sy0 = Math.min(s.y1, s.y2), sy1 = Math.max(s.y1, s.y2);
        if (sy1 - sy0 >= sx1 - sx0) OB.addRect(overlayEl, sx0 - pad, sy0 - 1, (sx1 - sx0) + pad * 2, Math.max(2, sy1 - sy0) + 2, attrs);
        else OB.addRect(overlayEl, sx0 - 1, sy0 - pad, Math.max(2, sx1 - sx0) + 2, (sy1 - sy0) + pad * 2, attrs);
      });
      // 矢印に書いた文字 (`-> 成功;`) は縦の線のすぐ右に描かれる。押せば同じ矢印が選ばれる
      // (枠は文字の上だけに出す。data-id を分け、矢印の枠と一緒には光らせない)。
      if (vertical) {
        texts.forEach(function(t) {
          if (t.claimed) return;
          if (t.y < y0 || t.y > y1 + 12 || t.x < tip.x + 1 || t.x > tip.x + 10) return;
          var tb = OB.nodeBBox(t.el);
          if (!tb) return;
          t.claimed = true;
          OB.addRect(overlayEl, tb.x - 3, tb.y - 3, tb.width + 6, tb.height + 6, {
            'data-type': 'flow', 'data-id': 'flow:' + line + ':' + n + ':label', 'data-line': String(line),
          });
        });
      }
      n++;
    });
    return n;
  }

  // BLK-migrator-20260924-2232: ここまでで枠の無い文字 (switch の条件・case、while の出口の no、
  // repeat while の yes、ノートの本文など) は、同じ文字を書いた本文の行で当てる。
  // 同じ文字が何度も出るときは、図の上の順と本文の順を 1 つずつ対にする。
  // 押すとその行が選ばれる (フォームで直せる要素ならそのフォーム、無ければ行の表示)。
  function _addTextFallback(svgEl, parsedData, overlayEl, lines) {
    if (!lines.length) return 0;
    // 入れ物 (partition) の中の空所の枠は、中の文字 (ノートの本文など) を覆ったものと見なさない
    var placed = Array.prototype.map.call(overlayEl.querySelectorAll('rect.selectable:not([data-hit-kind="container"])'), function(r) {
      return { x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0,
        w: parseFloat(r.getAttribute('width')) || 0, h: parseFloat(r.getAttribute('height')) || 0 };
    });
    function covered(x, y) {
      return placed.some(function(f) { return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h; });
    }
    var from = 0, to = lines.length;
    for (var a = 0; a < lines.length; a++) { if (/^\s*@startuml/i.test(lines[a])) { from = a + 1; break; } }
    for (var b = lines.length - 1; b >= from; b--) { if (/^\s*@enduml/i.test(lines[b])) { to = b; break; } }
    var body = [];
    for (var k = from; k < to; k++) {
      var raw = String(lines[k] || '').trim();
      if (!raw || raw.charAt(0) === "'") continue;
      body.push({ line: k + 1, norm: _normLabel(raw.replace(/\\n/g, ' ')), raw: raw });
    }
    var nextFor = {};
    var shapes = Array.prototype.filter.call(svgEl.querySelectorAll('polygon, rect'), function(el) {
      return !_inDecor(el);
    }).map(function(el) { return { el: el, bb: _shapeBBox(el) }; }).filter(function(s) { return s.bb && s.bb.width > 0; });
    // BLK-migrator-20260929-0952: PlantUML 1.2026 のノートの紙は <path>。本文と数が合わず紙で当てられなかったノート
    // (floating note など) の文字は、紙ごと囲む (入れ物の partition の枠を紙と見なさない)。
    if (OB.notePapers) {
      OB.notePapers(svgEl).forEach(function(p) {
        if (!_inDecor(p.el)) shapes.push({ el: p.el, bb: p.box });
      });
    }
    var flat = _flattenNodes(parsedData.nodes || [], []);
    var notes = parsedData.notes || [];
    var n = 0;
    _textsIn(svgEl).forEach(function(t) {
      var want = _normLabel(t.s);
      if (!want) return;
      var mid = t.x + (parseFloat(t.el.getAttribute('textLength')) || 0) / 2;
      if (covered(mid, t.y - 3)) return;
      var esc = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 2 文字以下 (yes / no など) は括弧の中に書いたものだけを同じ文字と見なす。
      var re = want.length <= 3 ? new RegExp('\\(' + esc + '\\)') : null;
      var start = nextFor[want] || 0;
      var hit = null;
      for (var i = start; i < body.length; i++) {
        if (re ? re.test(body[i].norm) : body[i].norm.indexOf(want) >= 0) { hit = body[i]; nextFor[want] = i + 1; break; }
      }
      if (!hit) return;
      var bb = OB.nodeBBox(t.el);
      if (!bb) return;
      // 文字を囲む図形 (switch の菱形・ノートの紙) があれば、その図形ごと囲む。
      var box = null;
      shapes.forEach(function(s) {
        var sb = s.bb;
        if (mid < sb.x || mid > sb.x + sb.width || t.y < sb.y || t.y > sb.y + sb.height + 2) return;
        if (covered(sb.x + sb.width / 2, sb.y + sb.height / 2) && covered(sb.x + 1, sb.y + 1)) return;
        if (sb.width * sb.height > 40000) return;
        if (!box || sb.width * sb.height < box.width * box.height) box = sb;
      });
      var r = box ? { x: box.x, y: box.y, w: box.width, h: box.height }
        : { x: bb.x - 3, y: bb.y - 3, w: bb.width + 6, h: bb.height + 6 };
      var node = null;
      flat.forEach(function(fn) { if (!node && fn.line <= hit.line && (fn.endLine || fn.line) >= hit.line && fn.kind === 'action') node = fn; });
      var note = null;
      notes.forEach(function(nt) { if (!note && nt.line <= hit.line && (nt.endLine || nt.line) >= hit.line) note = nt; });
      var attrs;
      if (note) attrs = { 'data-type': 'note', 'data-id': note.id, 'data-line': String(note.line) };
      else if (node) attrs = { 'data-type': 'action', 'data-id': node.id, 'data-line': String(node.line) };
      else attrs = { 'data-type': 'source-line', 'data-id': 'src:text@' + hit.line + ':' + n, 'data-src-kind': 'text', 'data-line': String(hit.line) };
      OB.addRect(overlayEl, r.x, r.y, r.w, r.h, attrs);
      placed.push(r);
      n++;
    });
    return n;
  }

  // BLK-builder-20260925-1712-2: 閉じの行 (endif / endswitch / end fork) が描く合流の菱形・下の棒と、repeat の入口の菱形には
  // 本文の節点が無く (節点は開きの行 1 つに 1 つ)、並び順の当て方から漏れて枠が出なかった。本文の開きと閉じを対にし、
  // 開きの図形の枠から閉じの図形を探す (内側の対から): 合流の菱形 = 開きの菱形と同じ列で下の最も近い菱形、
  // repeat の入口 = repeat while の菱形と同じ列で上の最も近い菱形、end fork の棒 = fork の棒と横が重なり下の最も近い棒。
  // 枠は閉じの行 (repeat は `repeat` の行) を指す。
  function _addClosingShapes(svgEl, overlayEl, lines) {
    if (!lines || !lines.length) return 0;
    function rbox(r) {
      return { x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0,
        w: parseFloat(r.getAttribute('width')) || 0, h: parseFloat(r.getAttribute('height')) || 0,
        line: parseInt(r.getAttribute('data-line'), 10), type: r.getAttribute('data-type') };
    }
    var framed = Array.prototype.map.call(overlayEl.querySelectorAll('rect.selectable[data-type]:not([data-src-kind="partition"])'), rbox);
    function hasFrame(b) {
      return framed.some(function(f) {
        return Math.abs(f.x - b.x) < 1.5 && Math.abs(f.y - b.y) < 1.5 && Math.abs(f.w - b.w) < 1.5 && Math.abs(f.h - b.h) < 1.5;
      });
    }
    // 行を持たない構造の図形: 文字の無い小さい菱形 (5 点 = 始点で閉じる / 7 点) と、細い棒 (fork の棒)
    var diamonds = [], bars = [];
    Array.prototype.forEach.call(svgEl.querySelectorAll('polygon'), function(p) {
      if (_inDecor(p)) return;
      var n = _parsePoints(p).length;
      if (n !== 5 && n !== 7) return;
      var bb = _polygonBBox(p);
      if (!bb || bb.width < 15 || bb.height < 15 || bb.width > 40 || bb.height > 40) return;
      var b = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      if (!hasFrame(b)) diamonds.push(b);
    });
    Array.prototype.forEach.call(svgEl.querySelectorAll('rect'), function(r) {
      if (_inDecor(r) || _classifyShape(r) !== 'fork-bar') return;
      var b = { x: parseFloat(r.getAttribute('x')) || 0, y: parseFloat(r.getAttribute('y')) || 0,
        w: parseFloat(r.getAttribute('width')) || 0, h: parseFloat(r.getAttribute('height')) || 0 };
      if (b.w > 0 && !hasFrame(b)) bars.push(b);
    });
    // split / end split の棒 (横の <line>)
    _barLines(svgEl).forEach(function(l) {
      var bb = _lineBarBBox(l);
      var b = { x: bb.x, y: bb.y, w: bb.width, h: bb.height, line: true };
      if (b.w > 0 && !hasFrame(b)) bars.push(b);
    });
    if (!diamonds.length && !bars.length) return 0;
    // 開きと閉じの対 (種類ごとに入れ子を数える)
    var OPEN = { 'if': /^if\s*\(/i, 'switch': /^switch\s*\(/i, 'repeat': /^repeat\s*$/i, 'fork': /^(?:fork|split)\s*$/i };
    var CLOSE = { 'if': /^end\s*if\b/i, 'switch': /^end\s*switch\b/i, 'repeat': /^repeat\s+while\b/i, 'fork': /^end\s*(?:fork|merge|split)\b/i };
    var stacks = { 'if': [], 'switch': [], 'repeat': [], 'fork': [] };
    var pairs = [];
    lines.forEach(function(raw, i) {
      var t = String(raw || '').trim();
      if (!t || t.charAt(0) === "'") return;
      Object.keys(OPEN).forEach(function(k) {
        if (CLOSE[k].test(t)) {
          var o = stacks[k].pop();
          if (o) pairs.push({ kind: k, open: o, close: i + 1 });
        } else if (OPEN[k].test(t)) {
          stacks[k].push(i + 1);
        }
      });
    });
    pairs.sort(function(a, b) { return a.close - b.close; });
    var n = 0;
    pairs.forEach(function(pr) {
      var isBar = pr.kind === 'fork';
      // 開きの図形の枠 (repeat の菱形は `repeat` か `repeat while` の行を指す)
      var opener = null;
      framed.forEach(function(f) {
        if (f.line !== pr.open && !(pr.kind === 'repeat' && f.line === pr.close)) return;
        if (isBar ? f.type !== 'fork' : !/^(decision|source-line)$/.test(f.type || '')) return;
        if (!isBar && (f.w < 15 || f.h < 15)) return;   // 枝のラベルの小さい枠ではなく菱形
        if (!opener || f.w * f.h > opener.w * opener.h) opener = f;
      });
      if (!opener) return;
      var cx = opener.x + opener.w / 2;
      // 閉じより後の行の菱形・棒は、同じ列ならこの閉じの図形より下にある (次の if の合流を取らない)
      var floor = Infinity;
      framed.forEach(function(f) {
        if (!(f.line > pr.close) || !/^(decision|source-line|fork)$/.test(f.type || '')) return;
        if (Math.abs(f.x + f.w / 2 - cx) > 3 || f.y <= opener.y) return;
        floor = Math.min(floor, f.y);
      });
      var pool = isBar ? bars : diamonds;
      var best = null;
      pool.forEach(function(b) {
        if (b.used) return;
        var bcx = b.x + b.w / 2;
        if (isBar) {
          if (b.x > opener.x + opener.w || b.x + b.w < opener.x) return;
        } else if (Math.abs(bcx - cx) > 3) return;
        if (pr.kind === 'repeat') {
          if (b.y + b.h > opener.y) return;
          if (!best || b.y > best.y) best = b;
        } else {
          if (b.y < opener.y + opener.h || b.y > floor) return;
          if (!best || b.y < best.y) best = b;
        }
      });
      if (!best) return;
      best.used = true;
      var line = pr.kind === 'repeat' ? pr.open : pr.close;
      var closeAttrs = {
        // repeat の入口は開きの行 (矢印の行はその前)、合流・下の棒は閉じの行 (入る矢印は元の要素の後) なので印を分ける
        'data-type': 'source-line', 'data-id': 'src:close@' + line, 'data-src-kind': pr.kind === 'repeat' ? 'loop' : 'close',
        'data-line': String(line),
      };
      if (best.line) closeAttrs['data-hit-kind'] = 'bar';   // 1 本の線の棒は、入る矢印の端より手前
      OB.addRect(overlayEl, best.x, best.y, best.w, best.h, closeAttrs);
      framed.push({ x: best.x, y: best.y, w: best.w, h: best.h, line: line, type: 'source-line' });
      n++;
    });
    return n;
  }

  function _hasLinkLines(svgEl) {
    if (!OB.linkGroups) return false;
    return Array.prototype.some.call(OB.linkGroups(svgEl), function(g) {
      return g.getAttribute('data-source-line') != null;
    });
  }

  function buildOverlay(svgEl, parsedData, overlayEl) {
    if (!svgEl || !overlayEl) return;
    _chromeEls = (OB.chromeElements && parsedData && parsedData.sourceLines)
      ? OB.chromeElements(svgEl, parsedData.sourceLines.join('\n')) : [];
    OB.syncDimensions(svgEl, overlayEl);
    while (overlayEl.firstChild) overlayEl.removeChild(overlayEl.firstChild);

    // BLK-migrator-20260924-0752: 旧記法 (`(*) -->` / `if "..." then` / `===LABEL===`) の図は、
    // PlantUML が関係 (<g class="link">) に書かれた行を残す。そのときは本文を読み直さず、
    // 描いた側の情報 (関係の行・要素の名前・線のつながり) だけで当てる。
    // 新記法 (`:Action;`) の図は SVG に行も <g> も無いので、今までどおり本文の並びで当てる。
    if (_hasLinkLines(svgEl)) {
      var claimed = _chromeEls.slice();
      if (OB.addLooseShapes) OB.addLooseShapes(svgEl, overlayEl, claimed);
      if (OB.addUnclaimed) {
        OB.addUnclaimed(svgEl, overlayEl, claimed,
          'g.entity, g[class$="_entity"], g.cluster, g.title, g.legend, g.link, g[class*="link_"]');
      }
      OB.raiseSmallestLast(overlayEl);
      return;
    }

    var flat = _flattenNodes(parsedData.nodes || [], []);
    if (flat.length === 0) return;

    // BLK-migrator-20260929-0952: partition の枠・札・見出しの文字は、動作・菱形・矢印の文字・ノートの紙として数えない
    // (並び順・文字で当てる他の当て方から外す)。枠は本文の partition の行で _addPartitionRects が置く。
    var partPairs = _matchPartitions(svgEl, parsedData.sourceLines || []);
    partPairs.forEach(function(pr) {
      _chromeEls.push(pr.drawn.rect);
      if (pr.drawn.tab) _chromeEls.push(pr.drawn.tab.el);
      if (pr.drawn.sep) _chromeEls.push(pr.drawn.sep);
      pr.drawn.texts.forEach(function(t) { _chromeEls.push(t); });
    });

    // Walk SVG, classify each primitive, then post-process to group ellipse pairs as 'stop-or-end'.
    // split の棒は横の <line> なので、棒と見なした線も文書順に混ぜる (fork の棒の rect と同じ 'fork-bar')。
    var shapeNodes = svgEl.querySelectorAll('rect, polygon, ellipse, line');
    var barLines = _barLines(svgEl);
    var raw = [];
    Array.prototype.forEach.call(shapeNodes, function(s) {
      var c = s.tagName.toLowerCase() === 'line'
        ? (barLines.indexOf(s) >= 0 ? 'fork-bar' : null)
        : _classifyShape(s);
      if (c) raw.push({ el: s, classification: c });
    });
    var matched = _groupShapes(raw);
    // 合流の棒 (上から 2 本以上入る棒) は開きの節点に当てない。枠は _addClosingShapes が閉じの行で置く。
    matched = matched.filter(function(sh) {
      return sh.kind !== 'fork-bar' || _barIncoming(svgEl, _shapeBBox(sh.el)) < 2;
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

    // BLK-migrator-20260924-0752: 動作は箱の中に描かれた文字 (= 本文の動作の名前) で先に当てる。
    // 並び順だけで当てると、レーン (`|Swimlane|`) をまたぐ図では SVG の並びがレーンごとになって
    // 枠が隣の動作にずれ、テーマ (`!include` した skin) で角の丸みが変わると箱が動作と見なされず全滅していた。
    var byText = _matchActionsByText(svgEl, flat);
    byText.forEach(function(m) {
      var bb = _shapeBBox(m.el);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
        'data-type': 'action', 'data-id': m.node.id, 'data-line': String(m.node.line),
      });
    });
    var decByText = _matchDecisionsByText(svgEl, flat);
    decByText.forEach(function(m) {
      var bb = _shapeBBox(m.el);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
        'data-type': 'decision', 'data-id': m.node.id, 'data-line': String(m.line),
      });
    });
    var textNodes = byText.map(function(m) { return m.node; })
      .concat(decByText.filter(function(m) { return !m.extra; }).map(function(m) { return m.node; }));
    var textEls = byText.map(function(m) { return m.el; }).concat(decByText.map(function(m) { return m.el; }));
    var decExtra = decByText.filter(function(m) { return m.extra; }).length;
    matched = matched.filter(function(sh) { return textEls.indexOf(sh.el) < 0 && !_inDecor(sh.el); });
    // BLK-builder-20260925-1712-2: 並び順で当てる菱形から、switch の菱形 (switch には本文の節点が無い) と、
    // 文字の無い合流の菱形 (endswitch は 7 点で描かれる) を外す。並びに残すと、後ろの repeat / while / if の節点がそこへ当たり、
    // 以後の菱形が 1 つずつずれる。switch の菱形の枠は文字で当てる _addTextFallback、合流は _addClosingShapes が置く。
    var switchConds = (parsedData.sourceLines || []).map(function(l) {
      var m = /^\s*switch\s*\((.*)\)\s*$/i.exec(String(l || ''));
      return m ? _normLabel(m[1]) : null;
    }).filter(function(s) { return s !== null; });
    var allTexts = _textsIn(svgEl);
    matched = matched.filter(function(sh) {
      if (sh.kind !== 'decision') return true;
      var bb = _shapeBBox(sh.el);
      if (!bb) return true;
      var inside = _normLabel(allTexts.filter(function(t) {
        return t.x >= bb.x && t.x <= bb.x + bb.width && t.y >= bb.y && t.y <= bb.y + bb.height + 2;
      }).map(function(t) { return t.s; }).join(''));
      if (switchConds.indexOf(inside) >= 0 && inside !== '') return false;
      // 合流の菱形は文字の無い正方の小さい菱形 (条件の分岐の菱形は文字の幅だけ横に長い)
      return !(inside === '' && bb.width <= 30 && Math.abs(bb.width - bb.height) < 2);
    });

    // Greedy match: for each flat node, find next matching shape in document order
    var shapeIdx = 0;
    flat.forEach(function(n) {
      var ek = expectedKind(n);
      if (!ek) return;
      if (textNodes.indexOf(n) >= 0) return;
      while (shapeIdx < matched.length && matched[shapeIdx].kind !== ek) shapeIdx++;
      if (shapeIdx >= matched.length) return;
      var sh = matched[shapeIdx];
      shapeIdx++;
      var bb = _shapeBBox(sh.el);
      if (!bb) return;
      var attrs = {
        'data-type': n.kind === 'if' || n.kind === 'while' || n.kind === 'repeat' ? 'decision' : n.kind,
        'data-id': n.id,
        'data-line': String(n.line),
      };
      if (sh.el.tagName.toLowerCase() === 'line') attrs['data-hit-kind'] = 'bar';   // split の棒 (1 本の線)
      OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, attrs);
    });

    // 文字で当てた動作・菱形は matched から外してあるので、数に戻して比べる。
    var byTextCount = byText.length + decByText.length - decExtra;
    if (matched.length + byTextCount !== flat.filter(function(n) { return expectedKind(n); }).length) {
      OB.warnIfMismatch('activity', flat.length, matched.length + byTextCount);
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
      var noteBoxOf = _polygonBBox;
      // BLK-migrator-20260926-1116: PlantUML 1.2026 は note を 5 点の polygon でなく、紙の外形の path と
      // 折り返しの path で描く。紙の外形 (OB.notePapers) を全図種共通の 1 か所で取り、中の Creole の表・
      // 箇条書きの文字ごとに枠を作らない。
      if (notePolys.length !== notes.length && OB.notePapers) {
        var papers = OB.notePapers(svgEl);
        if (papers.length === notes.length) {
          notePolys = papers;
          noteBoxOf = function(p) { return p.box; };
        }
      }
      if (notePolys.length === notes.length) {
        notes.forEach(function(n, idx) {
          var bb = noteBoxOf(notePolys[idx]);
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

    _addBranchLabelRects(svgEl, parsedData, overlayEl);
    _addSwimlaneHeaderRects(svgEl, parsedData, overlayEl);
    _addPartitionRects(overlayEl, partPairs);
    _addDecorRects(svgEl, parsedData, overlayEl);
    // 閉じの図形 (合流の菱形・下の棒) の枠を矢印より先に置く: 矢じりの先が触れる図形の行から矢印の行を決めるので、
    // 先に無いと合流へ入る矢印に枠が出ない。switch の菱形は文字で当てる (_addTextFallback) ので、その後にもう一度探す。
    _addClosingShapes(svgEl, overlayEl, parsedData.sourceLines || []);
    _addFlowRects(svgEl, overlayEl, parsedData.sourceLines || []);
    _addTextFallback(svgEl, parsedData, overlayEl, parsedData.sourceLines || []);
    // 2 回目は、文字で当てた switch の菱形・その後に見つかった閉じの図形を端にして、まだ枠の無い矢印だけに置く
    _addClosingShapes(svgEl, overlayEl, parsedData.sourceLines || []);
    _addFlowRects(svgEl, overlayEl, parsedData.sourceLines || []);

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
      if (sel.type === 'action') { _renderActionEdit(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
      if (sel.type === 'decision' || sel.type === 'fork') { _renderControlEdit(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
      if (sel.type === 'start' || sel.type === 'stop' || sel.type === 'end') { _renderTerminatorEdit(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
      if (sel.type === 'note') { _renderNoteEdit(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
      if (sel.type === 'swimlane') { _renderSwimlaneEdit(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
      if (sel.type === 'branch') { _renderBranchPick(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
      if (sel.type === 'flow') { _renderFlowPick(sel, parsedData, propsEl, ctx); return _appendInsertHere(sel, propsEl, ctx); }
    }
    propsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">複数選択は未対応 (Activity)</div>';
  }

  // 図の上で分岐の枝ラベル (異常 / 正常) を選んだとき。どちら側を選んだかを言い、
  // 下の「＋ ここに挿入」がその側のはじめを既定にする。
  function _renderBranchPick(sel, parsedData, propsEl, ctx) {
    var AI = window.MA.activityInsert;
    var esc = window.MA.htmlUtils.escHtml;
    var where = AI ? AI.pointLabel(ctx.getMmdText(), sel.line, 'after') : ('L' + sel.line);
    propsEl.innerHTML =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">分岐の枝 (L' + sel.line + ')</div>' +
      '<div style="font-size:11px;margin-bottom:8px;">' + esc(where) + '</div>' +
      '<div style="font-size:10px;color:var(--text-secondary);">この側に足すものを下で選びます。' +
      '枝の名前を変えるときは分岐の菱形を選んでください。</div>';
  }

  // BLK-migrator-20260924-2232: 図の上で矢印 (流れ) を選んだとき。どの行の後の流れかを言い、
  // 下の「＋ ここに挿入」がその矢印の上 (= その行の後) を既定にする。
  function _renderFlowPick(sel, parsedData, propsEl, ctx) {
    var AI = window.MA.activityInsert;
    var esc = window.MA.htmlUtils.escHtml;
    var where = AI ? AI.pointLabel(ctx.getMmdText(), sel.line, 'after') : ('L' + sel.line);
    propsEl.innerHTML =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">流れの矢印 (L' + sel.line + ' の後)</div>' +
      '<div style="font-size:11px;margin-bottom:8px;">' + esc(where) + '</div>' +
      '<div style="font-size:10px;color:var(--text-secondary);">この矢印の上に足すものを下で選びます。</div>';
  }

  // 選んだ要素のフォームの下に「＋ ここに挿入」を足す (BLK-junior-20260908-0103)。
  // 図で要素をクリックしたのに、挿入位置は右ペインの「追加」タブへ戻って
  // 行番号と生コードのプルダウンから選び直す必要があった。選んだ要素の位置を
  // 既定にして、その場で足せるようにする。位置は分岐のどちら側かで言い直す。
  function _appendInsertHere(sel, propsEl, ctx) {
    var AI = window.MA.activityInsert;
    if (!AI || !propsEl) return;
    var line = Number(sel && sel.line);
    if (!isFinite(line) || line < 1) return;
    var box = document.createElement('div');
    box.style.cssText = 'border-top:1px solid var(--border);padding-top:10px;margin-top:10px;';
    box.innerHTML =
      '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">＋ ここに挿入</label>' +
      '<div id="ac-ins-point-wrap"></div>' +
      '<div id="ac-ins-kind-wrap"></div>' +
      '<div id="ac-ins-detail" style="margin-top:6px;"></div>';
    propsEl.appendChild(box);
    _renderInsertHere(ctx, propsEl, line);
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

  // BLK-owner-20260924-2259-prune: 追加ペインのフォームは 1 つ。「末尾に追加」と
  // 「＋ この位置に挿入」が縦に 2 つ並び、同じ要素 (repeat / fork) を別の名前・別の言語で
  // 書いていたので、位置は他の図種と同じ「追加する位置」で選ぶ形に畳んだ。
  // 既定は「図の末尾」(= stop の前。従来の末尾に追加と同じ)。途中の位置は design 4b の
  // 挿入位置 (activityInsert.insertPoints) をそのまま並べ、置けない要素はそこで止める。
  var OTHER_BARE = [
    { value: 'break', label: '中断 (break)' },
    { value: 'detach', label: '切り離し (detach)' },
    { value: 'kill', label: '打ち切り (kill)' },
  ];

  // 追加する位置の候補。先頭は「図の末尾」、続けて挿入位置を構造の言葉で。
  function tailPlaceOptions(dsl) {
    var AI = window.MA.activityInsert;
    var out = [{ value: 'tail', label: '図の末尾', line: 0, position: 'tail', inFlow: true }];
    var pts = AI ? AI.insertPoints(dsl) : [];
    for (var i = 0; i < pts.length; i++) {
      out.push({
        value: 'p' + i,
        label: new Array((pts[i].depth || 0) + 1).join('　') + pts[i].label,
        line: pts[i].line,
        position: pts[i].position,
        inFlow: !!pts[i].inFlow,
      });
    }
    return out;
  }

  // その位置にその種類を置けるか。「図の末尾」は従来どおり何でも置ける。
  // 終了 (end) は停止 (stop) と同じ場所に置けるものとして扱う。
  // BLK-owner-20260925-0312-4: 開始・停止・終了はどこに置いても PlantUML が描くので止めない
  // (流れの外や 2 つ目になるときは tailKindWarning が橙で知らせる)。
  // 位置は行だけでなく「前 / 後」も見る (start の前はフローの外、start の直後はフローの先頭)。
  function tailKindAllowed(dsl, place, kind, sub) {
    if (!place || place.value === 'tail') return true;
    if (kind === 'start' || kind === 'stop' || kind === 'end') return true;
    var AI = window.MA.activityInsert;
    if (!AI) return false;
    var k = kind === 'other' ? (sub || 'break') : kind;
    return AI.isAllowed(dsl, place.line, k, place.position);
  }

  // 置けない位置で言う理由。その位置の名前で言う (「start の直後」なのに「フローの外」と言わない)。
  function tailPlaceReason(place) {
    var name = String((place && place.label) || '').trim().replace(/\s*\(L\d+\)$/, '').replace(/\s*\(フローの外\)$/, '');
    return '「' + name + '」はフローの外です。ここに置けるのはレーンと開始・停止・終了だけです (アクションや分岐は start の直後から stop の前までに置けます)';
  }

  // 開始・停止・終了が流れの外や 2 つ目になるときの橙の知らせ。無ければ ''。
  function tailKindWarning(dsl, place, kind) {
    if (kind !== 'start' && kind !== 'stop' && kind !== 'end') return '';
    var AI = window.MA.activityInsert;
    if (!AI || !AI.placementWarning) return '';
    return AI.placementWarning(dsl, addFromTailForm(dsl, place, kind, {}), kind);
  }

  // フォームの値から 1 回ぶんの書き換えを作る。place が「図の末尾」なら流れの終端の手前、
  // それ以外は選んだ位置 (その行の後 / start の前)。
  function addFromTailForm(text, place, kind, v) {
    v = v || {};
    var atTail = !place || place.value === 'tail';
    var line = atTail ? 0 : place.line;
    var pos = atTail ? 'after' : place.position;
    if (kind === 'action') {
      return atTail ? addAction(text, v.text) : addActionAtLine(text, line, pos, v.text || '');
    }
    if (kind === 'start' || kind === 'stop' || kind === 'end') {
      return atTail ? insertBeforeEnd(text, kind) : _insertBareAtLine(text, line, pos, kind);
    }
    if (kind === 'other') {
      var word = v.sub || 'break';
      return atTail ? insertBeforeFlowEnd(text, word) : _insertBareAtLine(text, line, pos, word);
    }
    if (kind === 'if') {
      if (atTail) return addIf(text, v.cond || '', v.thenLabel || 'yes', v.elseLabel || null);
      return addControlAtLine(text, line, pos, 'if', {
        cond: v.cond || '', thenLabel: v.thenLabel || 'yes', elseLabel: v.elseLabel || null,
      });
    }
    if (kind === 'while') {
      if (atTail) return addWhile(text, v.cond || '', v.label);
      return addControlAtLine(text, line, pos, 'while', { cond: v.cond || '', label: v.label || 'yes' });
    }
    if (kind === 'repeat') {
      if (atTail) return addRepeat(text, v.cond || '', v.label);
      return addControlAtLine(text, line, pos, 'repeat', { cond: v.cond || '', label: v.label || 'yes' });
    }
    if (kind === 'fork') {
      var n = parseInt(v.branchCount, 10) || 2;
      return atTail ? addFork(text, n) : addControlAtLine(text, line, pos, 'fork', { branchCount: n });
    }
    if (kind === 'swimlane') {
      return atTail ? addSwimlane(text, v.name || '') : addSwimlaneAtLine(text, line, pos, v.name || '');
    }
    if (kind === 'note') {
      if (!atTail) return addNoteAtLine(text, line, pos, { position: 'right', text: v.text || '' });
      var f = fmtNote('right', v.text || '');
      var rows = Array.isArray(f) ? f : [f];
      var out = text;
      for (var i = 0; i < rows.length; i++) out = insertBeforeFlowEnd(out, rows[i]);
      return out;
    }
    return text;
  }

  // 「各行をアクションとして一括追加」。途中の位置でも書いた順に並ぶように、
  // 1 行ずつ前の行の直後へ入れていく。
  function addActionsFromTailForm(text, place, block) {
    if (!place || place.value === 'tail') return addActions(text, block);
    var items = splitActionLines(block);
    var out = text;
    for (var i = 0; i < items.length; i++) {
      out = addActionAtLine(out, place.line + i, place.position, items[i]);
    }
    return out;
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var esc = window.MA.htmlUtils.escHtml;
    var places = tailPlaceOptions(ctx.getMmdText());
    var html =
      // design 7a / 2b (BLK-builder-20260924-1829-4): 英語の図種名の行は出さない (図種は左レールと HUD が言う)
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        // 置く場所を選べるので、見出しは「末尾」を名乗らない (状態遷移図と同じ)。
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">追加</label>' +
        P.selectFieldHtml('種類', 'ac-tail-kind', [
          { value: 'action', label: 'アクション (:…;)', selected: true },
          { value: 'start', label: '開始 (start)' },
          { value: 'stop', label: '停止 (stop)' },
          { value: 'end', label: '終了 (end)' },
          { value: 'if', label: '条件分岐 (if)' },
          { value: 'while', label: '繰り返し (while)' },
          { value: 'repeat', label: '後判定の繰り返し (repeat)' },
          { value: 'fork', label: '並行 (fork)' },
          { value: 'swimlane', label: 'レーン (swimlane)' },
          { value: 'note', label: '注釈 (note)' },
          // 置く機会の少ない 1 行 (中断・切り離し・打ち切り) はここに畳む。
          { value: 'other', label: 'その他 (中断・切り離し・打ち切り)' }
        ]) +
        '<div id="ac-tail-place">' +
          P.selectFieldHtml('追加する位置', 'ac-tail-where', places.map(function(p, i) {
            return { value: p.value, label: p.label, selected: i === 0 };
          })) +
        '</div>' +
        '<div id="ac-tail-detail" style="margin-top:6px;"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    function currentPlace() {
      var w = document.getElementById('ac-tail-where');
      var v = w ? w.value : 'tail';
      for (var i = 0; i < places.length; i++) if (places[i].value === v) return places[i];
      return places[0];
    }
    function val(id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    }
    function lbl(text) {
      return '<label style="display:block;font-size:10px;color:var(--text-secondary);">' + text + '</label>';
    }

    // 置けない位置では確定ボタンを押せなくし、理由を言う (押しても何も起きない、にしない)。
    // 置けるが流れの外になる開始・停止・終了は、押せるまま橙で知らせる。
    function paintAllowed() {
      var kind = val('ac-tail-kind');
      var place = currentPlace();
      var ok = tailKindAllowed(ctx.getMmdText(), place, kind, val('ac-tail-other'));
      var note = document.getElementById('ac-tail-where-note');
      if (note) {
        note.textContent = ok ? '' : tailPlaceReason(place);
        note.style.display = ok ? 'none' : 'block';
      }
      var warn = document.getElementById('ac-tail-where-warn');
      if (warn) {
        var w = ok ? tailKindWarning(ctx.getMmdText(), place, kind) : '';
        warn.textContent = w ? '注意: ' + w : '';
        warn.style.display = w ? 'block' : 'none';
      }
      ['ac-tail-add', 'ac-tail-add-lines'].forEach(function(id) {
        var b = document.getElementById(id);
        if (b) b.disabled = !ok;
      });
    }

    // BLK-owner-20260925-0312-4: 種別を替えても、打ちかけの欄は黙って消さない (同じ欄に戻れば戻る)。
    var drafts = {};
    function keepDrafts() {
      var box = document.getElementById('ac-tail-detail');
      if (!box) return;
      Array.prototype.forEach.call(box.querySelectorAll('input[id], textarea[id]'), function(el) {
        if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') return;
        drafts[el.id] = el.value;
      });
    }
    function restoreDrafts() {
      Object.keys(drafts).forEach(function(id) {
        var el = document.getElementById(id);
        if (el && drafts[id] !== '' && drafts[id] != null) el.value = drafts[id];
      });
    }

    var renderTailDetail = function() {
      var kind = val('ac-tail-kind');
      var detailEl = document.getElementById('ac-tail-detail');
      keepDrafts();
      var html2 = '';
      if (kind === 'action') {
        // BLK-owner-20260925-0312-4: 処理欄も他の図種と同じく Enter で確定、改行は Shift+Enter
        // (data-enter="submit" を modal-keys が見る)。複数行は Shift+Enter か「各行を一括追加」。
        html2 =
          lbl('処理 (Enter で追加 / Shift+Enter で改行)') +
          window.MA.reuseModal.buttonHtml('ac-tail-reuse') +
          '<textarea id="ac-tail-text" data-enter="submit" rows="2" style="width:100%;min-height:50px;font-family:inherit;font-size:12px;"></textarea>' +
          // BLK-junior-20260915-0606: アクション本文に打つのは先輩のクラス図にある
          // 実在メソッド名。名前帳を欄の下に出さないと、クラス図タブを別に開いて
          // 絞り込み、名前を控えてから戻るという往復が図種ごとに要る。
          P.vocabPickerHtml('ac-tail-text-vocab', { roles: ['method'], callSuffix: true });
      } else if (kind === 'if') {
        html2 =
          P.fieldHtml('条件', 'ac-tail-cond', '', '例: 認証成功?') +
          P.fieldHtml('yes のラベル', 'ac-tail-thenlbl', 'yes') +
          P.fieldHtml('no のラベル (空で no 側なし)', 'ac-tail-elselbl', 'no');
      } else if (kind === 'while') {
        html2 =
          P.fieldHtml('条件', 'ac-tail-cond', '', '例: 残りあり?') +
          P.fieldHtml('yes のラベル', 'ac-tail-lbl', 'yes');
      } else if (kind === 'repeat') {
        html2 =
          P.fieldHtml('続ける条件', 'ac-tail-cond', '', '例: 残りあり?') +
          P.fieldHtml('yes のラベル', 'ac-tail-lbl', 'yes');
      } else if (kind === 'fork') {
        html2 = P.fieldHtml('枝の数', 'ac-tail-bcount', '2');
      } else if (kind === 'swimlane') {
        html2 = P.fieldHtml('レーン名', 'ac-tail-lbl', '');
      } else if (kind === 'note') {
        html2 = lbl('注釈の本文 (Enter で追加 / Shift+Enter で改行)') +
          '<textarea id="ac-tail-ntext" data-enter="submit" style="width:100%;min-height:50px;font-family:inherit;font-size:12px;"></textarea>';
      } else if (kind === 'other') {
        html2 = P.selectFieldHtml('足すもの', 'ac-tail-other', OTHER_BARE.map(function(o, i) {
          return { value: o.value, label: o.label, selected: i === 0 };
        }));
      }
      html2 +=
        '<div id="ac-tail-where-note" style="display:none;font-size:10px;color:var(--text-secondary);margin:4px 0 6px 0;line-height:1.5;"></div>' +
        '<div id="ac-tail-where-warn" role="status" style="display:none;font-size:10px;color:var(--accent-orange, #ffa657);margin:4px 0 6px 0;line-height:1.5;"></div>' +
        P.primaryButtonHtml('ac-tail-add', '+ 追加');
      if (kind === 'action') {
        html2 +=
          P.primaryButtonHtml('ac-tail-add-lines', '+ 各行をアクションとして一括追加') +
          '<div id="ac-tail-lines-hint" style="font-size:10px;color:var(--text-secondary);margin-top:4px;">' +
            '1 行 = 1 アクション。空行は無視されます</div>';
      }
      detailEl.innerHTML = html2;
      restoreDrafts();
      // 一括欄は「既に他の図にある行」を打ち直させないためのボタンを持つ。
      window.MA.reuseModal.bindButton('ac-tail-reuse', 'plantuml-activity', 'ac-tail-text');
      // 一括追加の欄でもあるので、チップは欄を置き換えずカーソル位置に差し込む。
      P.bindVocabPicker('ac-tail-text-vocab', 'ac-tail-text', null, { insert: 'caret' });
      P.bindEvent('ac-tail-other', 'change', paintAllowed);

      function commit(out, t) {
        if (out !== t) {
          drafts = {};
          window.MA.history.pushHistory();
          ctx.setMmdText(out);
          ctx.onUpdate();
        }
      }
      P.bindEvent('ac-tail-add-lines', 'click', function() {
        var t0 = ctx.getMmdText();
        if (!tailKindAllowed(t0, currentPlace(), 'action')) return;
        commit(addActionsFromTailForm(t0, currentPlace(), val('ac-tail-text')), t0);
      });
      P.bindEvent('ac-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var k = val('ac-tail-kind');
        var place = currentPlace();
        if (!tailKindAllowed(t, place, k, val('ac-tail-other'))) return;
        commit(addFromTailForm(t, place, k, {
          text: k === 'note' ? val('ac-tail-ntext') : val('ac-tail-text'),
          cond: val('ac-tail-cond'),
          thenLabel: val('ac-tail-thenlbl'),
          elseLabel: val('ac-tail-elselbl'),
          label: val('ac-tail-lbl'),
          name: val('ac-tail-lbl'),
          branchCount: val('ac-tail-bcount'),
          sub: val('ac-tail-other'),
        }), t);
      });
      paintAllowed();
    };
    P.bindEvent('ac-tail-kind', 'change', renderTailDetail);
    P.bindEvent('ac-tail-where', 'change', paintAllowed);
    // design 2b: 種別はチップ 1 クリックで決める。値の持ち主は上の select のまま。
    window.MA.tailKindChips.mount('ac-tail-kind');
    renderTailDetail();
  }

  // design 4b「Activity — 途中に挿入」。フローのどの行間に置くかを先に選ぶと、
  // そこに置ける要素だけがメニューに残り、if / while / fork は開始と終了が対で入る。
  // 生の構文を打つ必要がないので、`start` / `:Hello world;` / `stop` しかない
  // 図にも分岐や繰り返しをその場で足せる。
  // design 5d Activityの「その他パレット」の色指定。
  // 使うのは工程図での強調がほとんどなので、名前で選べる見本を並べ、
  // それ以外は自由入力に逃がす。現在色があれば開いた状態で出す。
  var ACTION_COLORS = [
    { value: '', label: 'なし', swatch: 'transparent' },
    { value: '#LightBlue', label: 'LightBlue', swatch: '#ADD8E6' },
    { value: '#LightGreen', label: 'LightGreen', swatch: '#90EE90' },
    { value: '#Yellow', label: 'Yellow', swatch: '#FFFF00' },
    { value: '#Orange', label: 'Orange', swatch: '#FFA500' },
    { value: '#Pink', label: 'Pink', swatch: '#FFC0CB' },
  ];

  // design 4b: 選択中アクションの「スイムレーン / Swimlane」チップ。
  // 「（なし）」は今そこに居るときだけ押せる (PlantUML に外す印が無いため)。
  function _swimlaneChipsHtml(dsl, line) {
    var SM = window.MA.swimlaneMove;
    if (!SM) return '';
    var esc = window.MA.htmlUtils.escHtml;
    var list = SM.chips(dsl, line);
    var btns = '';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var dis = !c.selectable && !c.checked;
      btns += '<button type="button" class="ac-swim-chip" id="ac-swim-' + i + '"'
        + ' data-lane="' + esc(c.id) + '"'
        + ' aria-pressed="' + (c.checked ? 'true' : 'false') + '"'
        + (dis ? ' disabled' : '')
        + ' style="flex:0 0 auto;'
        + 'background:' + (c.checked ? 'var(--accent)' : 'var(--bg-tertiary)') + ';'
        + 'border:1px solid ' + (c.checked ? 'var(--accent)' : 'var(--border)') + ';'
        + 'color:' + (c.checked ? '#fff' : 'var(--text-primary)') + ';'
        + 'opacity:' + (dis ? '0.5' : '1') + ';'
        + 'font-size:11px;padding:3px 8px;border-radius:3px;cursor:' + (dis ? 'default' : 'pointer') + ';">'
        + esc(c.label) + '</button>';
    }
    return '<div id="ac-swimlane" style="margin-bottom:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">スイムレーン / Swimlane</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + btns + '</div>' +
      '</div>';
  }

  function _actionColorHtml(current) {
    var P = window.MA.properties;
    var cur = (current || '').toLowerCase();
    var known = false;
    var btns = '';
    for (var i = 0; i < ACTION_COLORS.length; i++) {
      var c = ACTION_COLORS[i];
      var on = c.value.toLowerCase() === cur;
      if (on && c.value) known = true;
      btns += '<button type="button" id="ac-color-' + i + '" data-value="' + c.value + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' style="flex:0 0 auto;display:flex;align-items:center;gap:4px;'
        + 'background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';'
        + 'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';'
        + 'color:' + (on ? '#fff' : 'var(--text-primary)') + ';'
        + 'font-size:11px;padding:3px 6px;border-radius:3px;cursor:pointer;">'
        + '<span style="width:10px;height:10px;border-radius:2px;border:1px solid var(--border);'
        + 'background:' + c.swatch + ';"></span>' + c.label + '</button>';
    }
    var open = !!current;
    return '<details' + (open ? ' open' : '') +
      ' id="ac-action-more" style="border-top:1px solid var(--border);padding-top:6px;margin-top:8px;">' +
      '<summary id="ac-action-more-summary" style="font-size:11px;color:var(--text-secondary);cursor:pointer;">' +
        'その他（色）' + (current ? ' — ' + window.MA.htmlUtils.escHtml(current) : '') +
      '</summary>' +
      '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">' + btns + '</div>' +
      '<div style="margin-top:6px;">' +
        P.fieldHtml('その他の色 (名前または #RRGGBB)', 'ac-color-custom',
          known ? '' : (current || ''), '例: #AliceBlue') +
        P.primaryButtonHtml('ac-color-go', 'この色にする') +
      '</div>' +
    '</details>';
  }

  // 図で選んでいる要素の行。overlay のクリックでも右ペインの一覧でも同じ選択を見る。
  function _selectedLine() {
    var SEL = window.MA.selection;
    if (!SEL || !SEL.getSelected) return 0;
    var sel = SEL.getSelected() || [];
    for (var i = 0; i < sel.length; i++) {
      var n = Number(sel[i] && sel[i].line);
      if (isFinite(n) && n >= 1) return n;
    }
    return 0;
  }

  function _renderInsertHere(ctx, propsEl, forcedLine) {
    var AI = window.MA.activityInsert;
    var P = window.MA.properties;
    if (!AI || !P) return;
    var pointWrap = document.getElementById('ac-ins-point-wrap');
    var kindWrap = document.getElementById('ac-ins-kind-wrap');
    var detailEl = document.getElementById('ac-ins-detail');
    if (!pointWrap || !kindWrap || !detailEl) return;

    var pts = AI.insertPoints(ctx.getMmdText());
    if (!pts.length) {
      pointWrap.innerHTML = '<div style="font-size:10px;color:var(--text-secondary);">挿入できる行がありません</div>';
      return;
    }
    // 既定は、図で要素を選んでいればその位置。選んでいなければ本体の最後。
    // BLK-junior-20260908-0103: 図形をクリックしてから「＋この位置に挿入」を開いたとき、
    // 位置をプルダウンから探し直さずに済ませる。
    var selLine = (typeof forcedLine === 'number' && forcedLine >= 1) ? forcedLine : _selectedLine();
    var defIdx = AI.defaultPointIndex(ctx.getMmdText(), selLine);
    var note = AI.pickedNote(ctx.getMmdText(), selLine);

    // 候補は行番号と生コードではなく「どの分岐のどちら側か」で並べ、入れ子は字下げする。
    pointWrap.innerHTML = P.selectFieldHtml('位置', 'ac-ins-point', pts.map(function(pt, i) {
      return {
        value: String(i),
        label: new Array((pt.depth || 0) + 1).join('　') + pt.label,
        selected: i === defIdx,
      };
    })) + (note ? '<div id="ac-ins-picked" style="font-size:10px;color:var(--accent);margin:-4px 0 6px 0;">'
      + window.MA.htmlUtils.escHtml(note) + '</div>' : '');

    function currentPoint() {
      var sel = document.getElementById('ac-ins-point');
      var i = sel ? parseInt(sel.value, 10) : defIdx;
      return pts[isNaN(i) ? defIdx : i] || pts[defIdx];
    }

    function renderKinds() {
      var pt = currentPoint();
      var allowed = AI.allowedKinds(ctx.getMmdText(), pt.line, pt.position);
      kindWrap.innerHTML = P.selectFieldHtml('要素', 'ac-ins-kind', allowed.map(function(k, i) {
        return { value: k.kind, label: k.label + '  (' + k.hint + ')', selected: i === 0 };
      })) +
      (pt.inFlow ? '' : '<div style="font-size:10px;color:var(--text-secondary);margin:-4px 0 6px 0;">'
        + 'フローの外なので、置けるのはレーンと start / stop だけです</div>');
      P.bindEvent('ac-ins-kind', 'change', renderDetail);
      renderDetail();
    }

    function renderDetail() {
      var kindSel = document.getElementById('ac-ins-kind');
      var kind = kindSel ? kindSel.value : 'action';
      var fields = AI.fieldsFor(kind);
      var h = '';
      fields.forEach(function(f) {
        h += P.fieldHtml(f.label, 'ac-ins-f-' + f.id, f.value || '', f.placeholder || '');
      });
      h += P.primaryButtonHtml('ac-ins-do', '＋ ' + AI.labelFor(kind) + ' を挿入');
      detailEl.innerHTML = h;
      P.bindEvent('ac-ins-do', 'click', doInsert);
    }

    function fieldVal(id) {
      var el = document.getElementById('ac-ins-f-' + id);
      return el ? el.value : '';
    }

    function doInsert() {
      var pt = currentPoint();
      var kindSel = document.getElementById('ac-ins-kind');
      var kind = kindSel ? kindSel.value : 'action';
      if (!AI.isAllowed(ctx.getMmdText(), pt.line, kind, pt.position)) return;
      var t = ctx.getMmdText();
      var out = t;
      if (kind === 'action') {
        out = addActionAtLine(t, pt.line, pt.position, fieldVal('text'));
      } else if (kind === 'if') {
        out = addControlAtLine(t, pt.line, pt.position, 'if', {
          cond: fieldVal('cond'), thenLabel: fieldVal('thenLabel') || 'yes',
          elseLabel: fieldVal('elseLabel') || null,
        });
      } else if (kind === 'while' || kind === 'repeat') {
        out = addControlAtLine(t, pt.line, pt.position, kind, {
          cond: fieldVal('cond'), label: fieldVal('label') || 'yes',
        });
      } else if (kind === 'fork') {
        out = addControlAtLine(t, pt.line, pt.position, 'fork', {
          branchCount: parseInt(fieldVal('branchCount'), 10) || 2,
        });
      } else if (kind === 'note') {
        out = addNoteAtLine(t, pt.line, pt.position, { position: 'right', text: fieldVal('text') });
      } else if (kind === 'swimlane') {
        out = addSwimlaneAtLine(t, pt.line, pt.position, fieldVal('name'));
      } else if (AI.isBareKind(kind)) {
        out = _insertBareAtLine(t, pt.line, pt.position, AI.bareLineFor(kind));
      }
      if (out !== t) {
        window.MA.history.pushHistory();
        ctx.setMmdText(out);
        ctx.onUpdate();
      }
    }

    P.bindEvent('ac-ins-point', 'change', renderKinds);
    renderKinds();
  }

  // break / detach / kill / start / stop のように入力の要らない 1 行を置く。
  function _insertBareAtLine(text, lineNum, position, word) {
    if (!word) return text;
    var lines = text.split('\n');
    var targetIdx = position === 'before' ? lineNum - 1 : lineNum;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > lines.length) targetIdx = lines.length;
    var indent = _resolveInsertIndent(lines, Math.min(targetIdx, lines.length - 1));
    lines.splice(targetIdx, 0, indent + word);
    return lines.join('\n');
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

  function _findNodeByLine(nodes, line) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.line === line) return n;
      if (n.branches) {
        for (var j = 0; j < n.branches.length; j++) {
          var found = _findNodeByLine(n.branches[j].body, line);
          if (found) return found;
        }
      }
      if (n.body) {
        var found2 = _findNodeByLine(n.body, line);
        if (found2) return found2;
      }
    }
    return null;
  }

  // design 4b: 選択中アクションの右ペインの「↑ ↓」。これは挿入ではなく、
  // 選んでいるアクションを**同じ親の中で**前後の兄弟と入れ替えるボタンである
  // (1a の Sequence パネルの「↑ 上へ / ↓ 下へ」と同じ位置・同じ役割)。
  // 判定と入れ替えは src/core/selection-reorder.js の純関数に任せる。親の境界
  // (else / endif / start / stop など) に当たる位置では disabled にして、
  // 「押したのに何も起きない」を作らない。
  function _reorderHtml(text, line) {
    var SR = window.MA.selectionReorder;
    if (!SR) return '';
    function btn(id, label, on, title) {
      return '<button id="' + id + '"' + (on ? '' : ' disabled') +
        ' title="' + window.MA.htmlUtils.escHtml(title) + '"' +
        ' style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);' +
        'color:var(--' + (on ? 'text-primary' : 'text-secondary') + ');padding:6px;' +
        'border-radius:4px;font-size:14px;line-height:1;cursor:' + (on ? 'pointer' : 'not-allowed') + ';' +
        // 押せない側は目で分かる程度に落とす (0.5 だと隣と見分けが付かない)。
        (on ? '' : 'opacity:0.3;') + '">' + label + '</button>';
    }
    return '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">並び替え / Reorder</label>' +
      '<div style="display:flex;gap:4px;">' +
        btn('ac-move-up', '↑', SR.canMove(text, line, -1), '同じ親の中で 1 つ上の兄弟と入れ替える (Alt+↑)') +
        btn('ac-move-down', '↓', SR.canMove(text, line, 1), '同じ親の中で 1 つ下の兄弟と入れ替える (Alt+↓)') +
      '</div>' +
    '</div>';
  }

  // design 4b: 選んだアクションの右パネルの見出し。「Action · 6 行目」と、その下に
  // 選んだものの名前 (保存する)。行番号だけでは何を選んだのか図と見比べないと分からない。
  // 複数行のラベル (PlantUML の \n 区切り・実改行) は 1 行に畳む。
  function actionPanelHeading(node) {
    var line = node && node.line;
    var text = String((node && node.text) || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    return { kind: 'Action · ' + line + ' 行目', name: text };
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
    // design 4b: 居場所は行番号ではなく構造で示す (条件分岐「有効?」の yes 側、1 番目)。
    var AI = window.MA.activityInsert;
    var place = (AI && AI.describeStructure) ? AI.describeStructure(ctx.getMmdText(), node.line) : '';
    // design 4b: 右パネルは上から 見出し (Action · N 行目 / 名前) → ラベル → スイムレーン → 位置 →
    // この位置に挿入 → ノートを添える → ↑ ↓ → 削除 の順 (BLK-builder-20260924-1252-3)。
    var esc = window.MA.htmlUtils.escHtml;
    var head = actionPanelHeading(node);
    var html =
      '<div id="ac-action-head" style="margin-bottom:10px;">' +
        '<div style="font-size:11px;color:var(--text-secondary);">' + esc(head.kind) + '</div>' +
        '<div id="ac-action-name" style="font-size:14px;font-weight:bold;color:var(--text-primary);' +
          'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(head.name) + '">' +
          esc(head.name || '(ラベルなし)') + '</div>' +
      '</div>' +
      '<div id="ac-action-label" style="margin-bottom:6px;">' +
        '<label for="ac-action-text" style="display:block;font-size:10px;color:var(--text-secondary);">ラベル / Label</label>' +
        '<textarea id="ac-action-text" style="width:100%;min-height:60px;">' + esc(node.text || '') + '</textarea>' +
      '</div>' +
      // BLK-junior-20260915-0606: 打ち直すときも同じ名前帳から引ける (綴りを揃える先が
      // 欄の下にあるので、クラス図タブへ確かめに戻らない)。
      P.vocabPickerHtml('ac-action-text-vocab', { roles: ['method'], callSuffix: true }) +
      P.primaryButtonHtml('ac-action-update', '更新') +
      _actionColorHtml(node.color || '') +
      // design 4b: スイムレーンは読むだけでなく、チップで選び直せる。
      '<div style="margin-top:10px;">' + _swimlaneChipsHtml(ctx.getMmdText(), node.line) + '</div>' +
      // design 4b: 居場所は行番号ではなく構造で示す (条件分岐「有効?」の yes 側、1 番目)。
      '<div id="ac-action-place" style="margin-bottom:8px;font-size:11px;">' +
        '<span style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">位置</span>' +
        esc(place || 'フローの外') +
      '</div>' +
      // design 4b:「この位置に挿入 / Insert here」— 選んでいるアクションの前後に足す。
      // 押すと図の隙間クリックと同じ挿入メニュー (showInsertPicker) がその位置で開く。
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">この位置に挿入 / Insert here</label>' +
        '<div style="display:flex;gap:4px;">' +
          '<button id="ac-insert-before" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 前に</button>' +
          '<button id="ac-insert-after" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 後に</button>' +
        '</div>' +
      '</div>' +
      // design 4b:「ノートを添える」。既に添えたノートはその上に並べ、直す・外すは日本語で。
      '<div id="ac-action-notes" style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">';
    for (var ni = 0; ni < attachedNotes.length; ni++) {
      var n = attachedNotes[ni];
      var preview = (n.text || '').replace(/\n/g, ' ⏎ ').slice(0, 40);
      html += '<div class="ac-note-row" style="display:flex;align-items:center;gap:4px;font-size:11px;margin-bottom:4px;">' +
                '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                  'ノート (' + (n.position === 'left' ? '左' : '右') + ') 「' + esc(preview) + '」 L' + n.line + '</span>' +
                '<button id="ac-note-edit-' + ni + '" data-id="' + n.id + '" data-line="' + n.line + '">編集</button>' +
                '<button id="ac-note-del-' + ni + '" data-start="' + n.line + '" data-end="' + n.endLine + '">削除</button>' +
              '</div>';
    }
    html += '<button id="ac-add-note-btn" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">ノートを添える</button>' +
            '<div id="ac-add-note-form" style="margin-top:6px;"></div>' +
          '</div>' +
          _reorderHtml(ctx.getMmdText(), node.line) +
          '<div style="margin-top:10px;">' +
            P.primaryButtonHtml('ac-action-delete', '削除 / Delete') +
          '</div>';
    propsEl.innerHTML = html;
    P.bindVocabPicker('ac-action-text-vocab', 'ac-action-text', null, { insert: 'caret' });

    // design 4b:「↑ ↓」— 同じ親の中の兄弟と入れ替える。行が動くので、
    // 選択は id ではなく移動先の行番号から引き直す (id は文書順の連番で振り直される)。
    function _moveAction(dir) {
      var SR = window.MA.selectionReorder;
      if (!SR) return;
      var before = ctx.getMmdText();
      var after = SR.move(before, node.line, dir);
      if (after === before) return;          // 端 / 親の境界: 履歴も積まない
      var newLine = SR.movedLine(before, node.line, dir);
      window.MA.history.pushHistory();
      ctx.setMmdText(after);
      var moved = null;
      try { moved = _findNodeByLine(parse(after).nodes, newLine); } catch (e) { moved = null; }
      if (moved) window.MA.selection.setSelected([{ type: 'action', id: moved.id, line: moved.line }]);
      else window.MA.selection.clearSelection();
      ctx.onUpdate();
    }
    P.bindEvent('ac-move-up', 'click', function() { _moveAction(-1); });
    P.bindEvent('ac-move-down', 'click', function() { _moveAction(1); });

    P.bindEvent('ac-insert-before', 'click', function() { showInsertPicker(ctx, node.line, 'before'); });
    P.bindEvent('ac-insert-after', 'click', function() { showInsertPicker(ctx, node.line, 'after'); });

    // 色を選んだ時点で DSL へ入れる (design 3c と同じ流儀)。
    for (var ci = 0; ci < ACTION_COLORS.length; ci++) {
      (function(idx) {
        P.bindEvent('ac-color-' + idx, 'click', function(e) {
          var v = e.currentTarget.getAttribute('data-value');
          var before = ctx.getMmdText();
          var after = setActionColor(before, node.line, node.endLine, v);
          if (after === before) return;
          window.MA.history.pushHistory();
          ctx.setMmdText(after);
          ctx.onUpdate();
        });
      })(ci);
    }
    P.bindEvent('ac-color-go', 'click', function() {
      var v = document.getElementById('ac-color-custom').value.trim();
      var before = ctx.getMmdText();
      var after = setActionColor(before, node.line, node.endLine, v);
      if (after === before) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(after);
      ctx.onUpdate();
    });
    // design 4b: スイムレーンのチップ。押した時点で DSL の印を入れ直す。
    (function() {
      var SM = window.MA.swimlaneMove;
      if (!SM) return;
      var wrap = document.getElementById('ac-swimlane');
      if (!wrap) return;
      Array.prototype.forEach.call(wrap.querySelectorAll('.ac-swim-chip'), function(btn) {
        btn.addEventListener('click', function() {
          if (btn.disabled) return;
          var lane = btn.getAttribute('data-lane') || '';
          var before = ctx.getMmdText();
          var after = SM.setSwimlane(before, node.line, lane, node.endLine);
          if (after === before) return;
          window.MA.history.pushHistory();
          ctx.setMmdText(after);
          // 行がずれるので選択は外す (別の要素を掴んだままにしない)。
          window.MA.selection.clearSelection();
          ctx.onUpdate();
        });
      });
    })();
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
        P.selectFieldHtml('置く側', 'ac-new-npos', [
          { value: 'right', label: '右', selected: true },
          { value: 'left', label: '左' }
        ]) +
        '<div style="margin-bottom:6px;">' +
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">ノートの本文</label>' +
          '<textarea id="ac-new-ntext" style="width:100%;min-height:50px;"></textarea>' +
        '</div>' +
        P.primaryButtonHtml('ac-new-nadd', '+ 添える');
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
    var html = '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">' + (node.keyword || node.kind) + ' (L' + node.line + ')</div>';

    if (node.kind === 'if') {
      html += P.fieldHtml('Condition', 'ac-if-cond', node.condition || '');
      // design 5d: 分岐ラベルは prompt に隠さず、条件と同じ右ペインに置いて 1 回の更新で直す。
      // then は if 行そのものなので、その label 欄も Branches の 1 行目として出す。
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
        html += '<div class="ac-branch-row" data-line="' + b.line + '" style="font-size:11px;margin-bottom:6px;">' +
                  '<div style="margin-bottom:2px;">▸ ' + b.kind + ' (L' + b.line + ')' + deleteBtn + '</div>' +
                  (b.kind === 'elseif'
                    ? P.fieldHtml('condition', 'ac-branch-cond-' + bi, b.condition || '')
                    : '') +
                  P.fieldHtml('label', 'ac-branch-lbl-' + bi, b.label || '') +
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
                    '▸ branch ' + (fbi + 1) + ' (' + (node.keyword === 'split' ? 'split' : 'fork') + ' again, L' + fb.line + ')' +
                    ' <button id="ac-fork-branch-del-' + fbi + '" data-line="' + fb.line + '" title="この branch を削除" style="background:var(--accent-red);border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✕</button>' +
                  '</div>';
        }
      }
      html += '<button id="ac-add-fork-again" style="font-size:11px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">+ ' + (node.keyword === 'split' ? 'split' : 'fork') + ' again 追加</button>';
    }
    html += P.primaryButtonHtml('ac-ctrl-update', '更新') +
            P.primaryButtonHtml('ac-ctrl-delete', '✕ 構造ごと削除');
    propsEl.innerHTML = html;

    P.bindEvent('ac-ctrl-update', 'click', function() {
      var t = ctx.getMmdText();
      var out = t;
      if (node.kind === 'if') {
        // design 5d: 条件と全分岐のラベルを 1 回の更新で書き戻す。
        // 行数は変わらないので行番号のまま順に当てられる。
        var c = document.getElementById('ac-if-cond').value;
        var ubrs = node.branches || [];
        for (var ui = 0; ui < ubrs.length; ui++) {
          var ub = ubrs[ui];
          var lblEl = document.getElementById('ac-branch-lbl-' + ui);
          var condEl = document.getElementById('ac-branch-cond-' + ui);
          var patch = {};
          if (lblEl) patch.label = lblEl.value;
          if (ub.kind === 'then') patch.condition = c;
          else if (condEl) patch.condition = condEl.value;
          out = updateBranch(out, ub.line, patch);
        }
        if (!ubrs.length) out = updateIfCondition(out, node.line, c);
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
      // FEAT-115: prompt() 2 回 → 1 枚のフォーム (showElseifForm)。
      P.bindEvent('ac-add-elseif', 'click', function() { showElseifForm(ctx, node); });
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
    actionPanelHeading: actionPanelHeading,
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
    addActions: addActions,
    splitActionLines: splitActionLines,
    addIf: addIf,
    addWhile: addWhile,
    addRepeat: addRepeat,
    addFork: addFork,
    addSwimlane: addSwimlane,
    addNote: addNote,
    updateAction: updateAction,
    actionColorAt: actionColorAt,
    setActionColor: setActionColor,
    updateIfCondition: updateIfCondition,
    updateBranchLabel: updateBranchLabel,
    updateBranch: updateBranch,
    updateWhileCondition: updateWhileCondition,
    updateSwimlane: updateSwimlane,
    updateNote: updateNote,
    deleteNode: deleteNode,
    addActionAtLine: addActionAtLine,
    addControlAtLine: addControlAtLine,
    addBranchPatternAtLine: addBranchPatternAtLine,
    insertBareAtLine: _insertBareAtLine,
    addSwimlaneAtLine: addSwimlaneAtLine,
    addNoteAtLine: addNoteAtLine,
    // BLK-owner-20260924-2259-prune: 追加ペインの 1 つのフォーム (追加する位置 + 種類)
    tailPlaceOptions: tailPlaceOptions,
    tailKindAllowed: tailKindAllowed,
    tailKindWarning: tailKindWarning,
    tailPlaceReason: tailPlaceReason,
    addFromTailForm: addFromTailForm,
    addActionsFromTailForm: addActionsFromTailForm,
    addElseifBranch: addElseifBranch,
    addElseBranch: addElseBranch,
    addForkBranch: addForkBranch,
    deleteBranchAt: deleteBranchAt,
    _resolveInsertIndent: _resolveInsertIndent,
    resolveInsertLine: resolveInsertLine,
    showInsertForm: showInsertForm,
    showInsertPicker: showInsertPicker,
    showElseifForm: showElseifForm,
    readPartitions: readPartitions,
    defaultInsertKind: 'action',
    capabilities: {
      overlaySelection: true,
      hoverInsert: true,
      participantDrag: false,
      showInsertForm: true,
      insertPicker: true,
      multiSelectConnect: false,
    },
  };
})();
