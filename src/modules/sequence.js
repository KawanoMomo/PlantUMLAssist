'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlSequence = (function() {
  // FEAT-015: 削除確認ダイアログの代替。削除は即実行し、直後に「元に戻す」付きトーストを出す。
  // FEAT-104 (resolves UI-011): 取り消しをグローバル undo スタックの pop から、
  // 「削除直前のテキストのスナップショットへの直接復元」に変える。
  // 旧実装は MA.history.undo() を呼んでおり、トースト表示中 (HIDE_MS=6000ms) に
  // pushHistory を伴う編集が 1 つでも起きると undoStack の先頭が置き換わり、
  // 「元に戻す」が削除ではなくその編集を取り消していた (表示と実体の乖離)。
  // ctx は本関数のスコープからは見えない (各 bind 関数の引数) ため第 3 引数で受け取る。
  function _toastUndo(msg, snapshot, ctx) {
    if (!window.MA || !window.MA.toast) return;
    window.MA.toast.show(msg, '元に戻す', function() {
      window.MA.history.pushHistory();   // 復元操作自体も undo 可能にする
      ctx.setMmdText(snapshot);
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  var PARTICIPANT_TYPES =['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'queue', 'collections'];
  var ARROWS = ['->', '-->', '->>', '-->>', '->x', '-->x', '<-', '<--', '<<-', '<<--', '<->', '<-->',
                '->o', '->\\', '-[#red]>'];
  // design 1a の右ペインで分節ボタンに出す 4 種。
  // 残りは design 2d の「その他の矢印…」パレットから選ぶ。
  var QUICK_ARROWS = ['->', '-->', '->>', '->x'];
  // design 2d と同じく、常時出す 4 種も「何が起きるか」を主に、記法を従に置く。
  var QUICK_ARROW_DESC = { '->': '同期', '-->': '応答・戻り', '->>': '非同期', '->x': '届かない' };

  // design 2d「矢印のその他パレット」:
  //   「各項目は『何が起きるか』を先に書き、記法は右に小さく置く」
  // 各行は行をどう書き換えるかを持つ。arrow だけ変えるものと、
  // 図の外 (`[` / `]`) を相手にすえるものがある。
  var OTHER_ARROWS = [
    { desc: '両方向のやり取り',         arrow: '<->' },
    { desc: '図の外から入ってくる',     arrow: '->',  from: '[', notation: '[->' },
    { desc: '図の外へ出ていく',         arrow: '->',  to: ']',   notation: '->]' },
    { desc: '相手の手前で止まる',       arrow: '->o' },
    { desc: '片羽根 (返り値の表現)',   arrow: '->\\' },
    { desc: '線の色を変える',           arrow: '-[#red]>' },
    { desc: '同期 (逆向き)',           arrow: '<-' },
    { desc: '応答・戻り (逆向き)',     arrow: '<--' },
    { desc: '非同期 (逆向き)',         arrow: '<<-' },
    { desc: '非同期の応答 (逆向き)',   arrow: '<<--' },
    { desc: '非同期の応答',             arrow: '-->>' },
    { desc: '届かない応答',             arrow: '-->x' },
    { desc: '両方向の応答',             arrow: '<-->' },
  ];
  // パレットの行を 1 つに定める key。notation があればそれ (`[->`)、
  // 無ければ arrow そのもの。DOM の data-value と spec を紐付ける。
  function arrowSpecKey(spec) { return spec.notation || spec.arrow; }
  // 図の外を表す疑似端点。参加者ではないので participants には入れない。
  function isOuterEnd(name) { return name === '[' || name === ']'; }
  // P.arrowPickerHtml に渡す 2 つのリスト。
  function quickArrowOptions() {
    return QUICK_ARROWS.map(function(a) {
      return { value: a, label: QUICK_ARROW_DESC[a] || a, sub: a, title: arrowLabel(a) };
    });
  }
  function otherArrowOptions() {
    return OTHER_ARROWS.map(function(sp) {
      return { value: arrowSpecKey(sp), desc: sp.desc, notation: arrowSpecKey(sp) };
    });
  }
  function findArrowSpec(key) {
    for (var i = 0; i < OTHER_ARROWS.length; i++) {
      if (arrowSpecKey(OTHER_ARROWS[i]) === key) return OTHER_ARROWS[i];
    }
    return null;
  }
  // 行の現状 (from/to/arrow) から、どのパレット行が選ばれているかを戻す。
  function activeArrowKey(from, to, arrow) {
    if (from === '[') return '[->';
    if (to === ']') return '->]';
    return arrow;
  }
  // Display labels: UML 有識者が形で思い出せる最小の注釈を添える。
  // 形: -> 実線 / --> 破線 / ->> 開矢印 (async) / -->> 破線+開矢印 (async return)
  var ARROW_META = {
    '->':    '->    同期メッセージ (実線)',
    '-->':   '-->   返信/戻り (破線)',
    '->>':   '->>   非同期メッセージ (開矢印)',
    '-->>':  '-->>  非同期返信 (破線+開矢印)',
    '->x':   '->x   届かない (ロスト)',
    '-->x':  '-->x  届かない返信 (破線)',
    '<-':    '<-    同期 (逆向き)',
    '<--':   '<--   返信 (逆向き)',
    '<<-':   '<<-   非同期 (逆向き)',
    '<<--':  '<<--  非同期返信 (逆向き)',
    '<->':   '<->   双方向 同期',
    '<-->':  '<-->  双方向 返信',
    '->o':   '->o   相手の手前で止まる',
    '->\\':  '->\\   片羽根 (返り値の表現)',
    '-[#red]>': '-[#red]>  線の色を変える',
  };
  function arrowLabel(a) { return ARROW_META[a] || a; }

  var PART_RE = new RegExp('^(' + PARTICIPANT_TYPES.join('|') + ')\\s+(?:"([^"]+)"\\s+as\\s+(\\S+)|(\\S+)(?:\\s+as\\s+"([^"]+)")?)\\s*$');
  // design 2d: 図の外とのやり取り (`[-> System` / `System ->]`) を読めるように、
  // 端点に疑似参加者 `[` `]` を許す。これらは矢印と空白無しで
  // 接するので、区切りは `\s*` である必要がある。
  var MSG_RE_FROM = '(\\[|\\]|[A-Za-z_][A-Za-z0-9_]*|"[^"]+")';
  // design 5d「Sequence のその他パレット: 線色」: 色は矢印の最初の `-` の直後に
  // `[#色]` として入る (`-[#red]->` / `<-[#red]--`)。矢印の形はそのまま残るので、
  // 読む側は「色を挟んだ形」も同じ矢印として認識できる必要がある。
  var ARROW_COLOR_PART = '(?:\\[#[A-Za-z0-9_]+\\])?';
  function _reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // 1 つの矢印トークンを「色を挟んでもよい」正規表現の断片にする。
  function _arrowAlt(a) {
    var i = a.indexOf('-');
    if (i < 0) return _reEsc(a);
    return _reEsc(a.slice(0, i + 1)) + ARROW_COLOR_PART + _reEsc(a.slice(i + 1));
  }
  // 長いトークンから並べる (`->o` `->\` を `->` より先に)。
  var MSG_ARROW_ALT = ARROWS
    .filter(function(a) { return a.indexOf('[#') < 0; })
    .slice()
    .sort(function(a, b) { return b.length - a.length; })
    .map(_arrowAlt)
    .join('|');
  var MSG_RE = new RegExp('^' + MSG_RE_FROM + '\\s*(' + MSG_ARROW_ALT + ')\\s*' + MSG_RE_FROM + '(?:\\s*:\\s*(.+))?$');

  var GROUP_KINDS = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group'];
  // design 2d/5c:「各項目は『何が起きるか』を先に書き、記法は右に小さく置く」。
  // ブロックの枠も同じ流儀で読めるよう、記法ごとに何が起きるかを 1 箇所に持つ。
  var GROUP_DESC = {
    alt:      '条件で分かれる',
    opt:      '条件を満たすときだけ行う',
    loop:     '繰り返す',
    par:      '並行して進む',
    'break':  '途中で抜ける',
    critical: '割り込まれては困る区間',
    group:    'ひとまとまりとして囲む',
  };
  function groupLabel(kind) {
    return GROUP_DESC[kind] ? GROUP_DESC[kind] + ' (' + kind + ')' : kind;
  }
  // 「その他」の 2 段目に出すブロック。常時出す alt / loop は 1 段目にあるので除く。
  var OTHER_GROUP_KINDS = ['par', 'break', 'critical', 'opt', 'group'];
  var GROUP_OPEN_RE = new RegExp('^(' + GROUP_KINDS.join('|') + ')(?:\\s+(.*))?$');
  var GROUP_ELSE_RE = /^else(?:\s+(.*))?$/;
  var GROUP_END_RE = /^end$/;

  var NOTE_POSITIONS = ['left of', 'right of', 'over'];
  var NOTE_RE = /^note\s+(left of|right of|over)\s+([^:]+?)(?:\s*:\s*(.*))?$/i;

  var ACTIVATION_ACTIONS = ['activate', 'deactivate', 'create', 'destroy'];
  var ACTIVATION_RE = new RegExp('^(' + ACTIVATION_ACTIONS.join('|') + ')\\s+(\\S+)$');

  var unquote = window.MA.dslUtils.unquote;

  // Pure formatters — used by both add* (末尾追加) and _formatLine (位置駆動挿入)
  // 同一形式を一箇所で管理 (parser-format drift を防ぐ)
  function fmtMessage(from, to, arrow, label) {
    var a = arrow || '->';
    // design 2d: 図の外とのやり取りは PlantUML の書き方に合わせ、
    // `[-> System` / `System ->]` と空白無しで接す。
    var head = from === '[' ? '[' + a : from + ' ' + a;
    var body = to === ']' ? head + ']' : head + ' ' + to;
    return body + (label ? ' : ' + label : '');
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

  function _existingParticipantIdSet(parsed) {
    var set = {};
    var elts = (parsed && parsed.elements) || [];
    elts.forEach(function(e) {
      if (e && e.kind === 'participant' && e.id) set[e.id] = true;
    });
    return set;
  }

  // MSG_RE only accepts ASCII identifiers in `from`/`to` positions (line 25
  // above). A Japanese-aliased participant declaration parses (PART_RE is
  // permissive) but messages referencing it fail to match, so the new
  // participant becomes an isolated lifeline. Normalize alias to ASCII
  // (P1, P2, ...) and keep the typed string as the display label.
  function normalizeIdInput(rawInput, parsed) {
    return window.MA.idNormalizer.normalize(rawInput, _existingParticipantIdSet(parsed), 'P');
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
      if (!trimmed || window.MA.dslUtils.isPlantumlComment(trimmed)) continue;
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
        // design 2d: `[` / `]` は「図の外」を表す疑似端点であり、参加者ではない。
        // 参加者一覧に混ぜると左レールや Outline に `[` が並んでしまう。
        var from = isOuterEnd(mm[1]) ? mm[1] : ensurePart(mm[1]);
        var arrow = mm[2];
        var to = isOuterEnd(mm[3]) ? mm[3] : ensurePart(mm[3]);
        var label = mm[4] || '';
        if (participantMap[from] && !participantMap[from].line) participantMap[from].line = lineNum;
        if (participantMap[to] && !participantMap[to].line) participantMap[to].line = lineNum;
        result.relations.push({
          kind: 'message', id: '__m_' + (msgCounter++),
          from: from, to: to, arrow: arrow, label: label, line: lineNum,
        });
      }
    }
    return result;
  }

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function addParticipant(text, ptype, alias, label) {
    return insertBeforeEnd(text, fmtParticipant(ptype, alias, label));
  }

  function addMessage(text, from, to, arrow, label) {
    return insertBeforeEnd(text, fmtMessage(from, to, arrow, label));
  }

  // ─── Bulk tail add (参加者 + メッセージをまとめて末尾に追加) ───
  // 1 件ずつの挿入フォームだと参加者 5 + メッセージ 6 で手数が 10 を超えるため、
  // DSL そのままの書き方で貼れる入口を用意する。
  var SEQ_BULK_ARROW_RE = new RegExp('\\s(' + ARROWS.slice().sort(function(a, b) {
    return b.length - a.length;
  }).map(function(a) {
    return a.replace(/[-\\^$*+?.()|[\]{}<>]/g, '\\$&');
  }).join('|') + ')\\s');

  function _seqStripDeco(s) {
    var t = String(s || '').trim();
    return t.replace(/^"(.*)"$/, '$1').trim();
  }

  function parseBulkLines(block) {
    var out = [];
    if (!block) return out;
    var lines = String(block).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s || s.indexOf("'") === 0 || s.indexOf('#') === 0) continue;
      if (/^@(start|end)uml\b/i.test(s)) continue;
      var am = s.match(SEQ_BULK_ARROW_RE);
      if (am) {
        var pos = s.indexOf(am[0]);
        var left = s.slice(0, pos);
        var rest = s.slice(pos + am[0].length);
        var lbl = '';
        var ci = rest.indexOf(':');
        if (ci >= 0) { lbl = rest.slice(ci + 1).trim(); rest = rest.slice(0, ci); }
        var from = _seqStripDeco(left);
        var to = _seqStripDeco(rest);
        if (!from || !to) continue;
        out.push({ op: 'message', from: from, to: to, arrow: am[1], label: lbl });
        continue;
      }
      // 参加者宣言。`participant "表示名" as Alias` と `actor Dev : 表示名` の両方を受ける。
      var ptype = 'participant';
      var body = s;
      var km = body.match(new RegExp('^(' + PARTICIPANT_TYPES.join('|') + ')\\s+(.*)$', 'i'));
      if (km) { ptype = km[1].toLowerCase(); body = km[2].trim(); }
      var label = '';
      var asm = body.match(/^(.*?)\s+as\s+(\S+)$/i);
      if (asm) {
        label = _seqStripDeco(asm[1]);
        body = asm[2];
      } else {
        var ci2 = body.indexOf(':');
        if (ci2 >= 0) { label = body.slice(ci2 + 1).trim(); body = body.slice(0, ci2); }
      }
      var id = _seqStripDeco(body);
      if (!id) continue;
      out.push({ op: 'participant', ptype: ptype, id: id, label: label });
    }
    return out;
  }

  // 参加者を先に全部宣言してからメッセージを並べるので、入力順は問わない。
  function addBulk(text, block, parsed) {
    var ops = parseBulkLines(block);
    var out = text;
    var idMap = {};
    var taken = _existingParticipantIdSet(parsed || { elements: [] });
    var i;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.op !== 'participant') continue;
      var norm = window.MA.idNormalizer.normalize(o.id, taken, 'P');
      if (!norm.valid) continue;
      idMap[o.id] = norm.id;
      // 既に宣言済みの参加者は重複宣言せず、メッセージ側の参照先としてだけ使う。
      if (taken[norm.id]) continue;
      taken[norm.id] = true;
      out = addParticipant(out, o.ptype, norm.id, o.label || norm.label || o.id);
    }
    for (i = 0; i < ops.length; i++) {
      var m = ops[i];
      if (m.op !== 'message') continue;
      out = addMessage(out, idMap[m.from] || m.from, idMap[m.to] || m.to, m.arrow, m.label);
    }
    return out;
  }

  function deleteLine(text, lineNum) {
    return window.MA.textUpdater.deleteLine(text, lineNum);
  }

  // FEAT-014 (resolves UI-002 / HFR-001): 行削除を「履歴 → 本文 → 選択解除 → 再描画」の
  // 1 単位としてまとめた入口。app.js の Delete / Backspace ルーターから呼ばれる。
  // 右パネルの「✕ 削除」ボタン (seq-delete-line) は FEAT-015 が確認ダイアログの置換を
  // 担当中であり、その差分と衝突させないため本 run では書き換えない (「ついでに直さない」)。
  // undo はアプリ共通の単一スタック (window.MA.history) に載る。取り消し対象は常に
  // 「直前の 1 操作」であり、キー操作の UI 上もそれ以上の約束をしない (UI-011 の教訓)。
  function deleteSelectedLine(ctx, lineNum) {
    window.MA.history.pushHistory();
    ctx.setMmdText(deleteLine(ctx.getMmdText(), lineNum));
    window.MA.selection.clearSelection();
    ctx.onUpdate();
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

  // design 1a: From と To の間の ⇄ 。向きを逆にするのに select を
  // 2 往復させず、両端をその場で入れ替える。矢印の種類と本文は変えない。
  function swapMessageEnds(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(MSG_RE);
    if (!m) return text;
    var label = m[4] || '';
    // design 2d: 図の外 (`[` / `]`) を入れ替えるときは向きに合う側の記号にする。
    var swapEnd = function(e) { return e === '[' ? ']' : (e === ']' ? '[' : e); };
    lines[idx] = indent + fmtMessage(swapEnd(m[3]), swapEnd(m[1]), m[2], label);
    return lines.join('\n');
  }

  // ─── design 5d: 線の色 / Line color ─────────────────────────────────
  // UseCase / Component / Class の「その他の設定」と同じ 6 色を、Sequence の
  // メッセージにも出す。色は矢印の形 (`-->` / `->>` …) を壊さずに差し替える。
  var ARROW_COLOR_RE = /\[#([A-Za-z0-9_]+)\]/;
  function stripArrowColor(arrow) { return String(arrow == null ? '' : arrow).replace(ARROW_COLOR_RE, ''); }
  function arrowColor(arrow) {
    var m = String(arrow == null ? '' : arrow).match(ARROW_COLOR_RE);
    return m ? m[1] : '';
  }
  // 片羽根 `->\` だけは PlantUML が `-[#red]>\` を受け付けない (構文エラー)。
  // 色を付けられない矢印はパレットを閉じ、理由をその場に出す。
  function arrowSupportsColor(arrow) { return stripArrowColor(arrow).indexOf('\\') < 0; }
  function setArrowColor(arrow, color) {
    var base = stripArrowColor(arrow);
    var c = String(color == null ? '' : color).trim().replace(/^#/, '');
    if (!c || !arrowSupportsColor(base)) return base;
    var i = base.indexOf('-');
    if (i < 0) return base;
    return base.slice(0, i + 1) + '[#' + c + ']' + base.slice(i + 1);
  }
  // 色見本は他図種と同じ 6 色 (relation-options が正本)。読み込み順に依存しないよう
  // 呼ばれた時点で引き、無ければ同じ内容の控えを使う。
  var FALLBACK_COLORS = [
    { value: '',       label: '既定',   swatch: '#111114' },
    { value: 'red',    label: '赤',     swatch: '#f87171' },
    { value: 'orange', label: '橙',     swatch: '#fbbf24' },
    { value: 'green',  label: '緑',     swatch: '#6ee7a8' },
    { value: 'blue',   label: '青',     swatch: '#38bdf8' },
    { value: 'violet', label: '紫',     swatch: '#a78bfa' },
  ];
  function _lineColors() {
    var ro = window.MA.relationOptions;
    return (ro && ro.COLORS ? ro.COLORS : FALLBACK_COLORS).slice();
  }

  // 色見本の 1 行。UseCase / Component / Class の「その他の設定」と同じ見た目。
  function lineColorRowHtml(idPrefix, current, supported) {
    var esc = window.MA.htmlUtils.escHtml;
    if (!supported) {
      return '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);' +
        'margin-bottom:2px;">線の色 / Line color</label>' +
        '<div id="' + idPrefix + '-unsupported" style="font-size:10px;color:var(--text-secondary);">' +
        'この矢印 (片羽根) は色を指定できません</div></div>';
    }
    var html = '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);' +
      'margin-bottom:2px;">線の色 / Line color</label><div style="display:flex;gap:4px;flex-wrap:wrap;">';
    _lineColors().forEach(function(c) {
      var on = (c.value || '') === (current || '');
      html += '<button type="button" class="' + idPrefix + '-swatch" id="' + idPrefix + '-' + (c.value || 'default') + '"' +
        ' data-color="' + esc(c.value) + '" title="' + esc(c.label) + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
        ' style="width:22px;height:22px;background:' + c.swatch + ';border:1px solid var(--border);border-radius:4px;' +
        'cursor:pointer;' + (on ? 'box-shadow:0 0 0 2px var(--accent);' : '') + '"></button>';
    });
    return html + '</div></div>';
  }

  // 行から読む / 行へ書く。書き戻しは updateMessage を通すので書式は 1 箇所のまま。
  function messageColor(text, lineNum) {
    var lines = String(text == null ? '' : text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return '';
    var m = lines[idx].trim().match(MSG_RE);
    return m ? arrowColor(m[2]) : '';
  }
  function setMessageColor(text, lineNum, color) {
    var lines = String(text == null ? '' : text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var m = lines[idx].trim().match(MSG_RE);
    if (!m) return text;
    return updateMessage(text, lineNum, 'arrow', setArrowColor(m[2], color));
  }

  // design 2d:「その他の矢印」パレットの 1 行を、選択中のメッセージ行に適用する。
  // 矢印だけを変える行と、相手を図の外 (`[` / `]`) に付け替える行がある。
  // 図の外に付け替えたあと通常の矢印を選び直すと、外れていた側は元の相手に戻す。
  function applyArrowSpec(text, lineNum, key) {
    var spec = findArrowSpec(key);
    // 分節ボタン (色を持たない 4 種) は、いま付いている線の色を引き継ぐ。
    if (!spec) return updateMessage(text, lineNum, 'arrow', setArrowColor(key, messageColor(text, lineNum)));
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(MSG_RE);
    if (!m) return text;
    var from = unquote(m[1]), to = unquote(m[3]), label = m[4] || '';
    from = spec.from || (isOuterEnd(from) ? outerFallback(text, lineNum, 'from') : from);
    to = spec.to || (isOuterEnd(to) ? outerFallback(text, lineNum, 'to') : to);
    // design 5d: 形を選び直しても線の色は保つ (色は別のパレットの持ち物)。
    var specArrow = arrowColor(spec.arrow) ? spec.arrow : setArrowColor(spec.arrow, arrowColor(m[2]));
    lines[idx] = indent + fmtMessage(from, to, specArrow, label);
    return lines.join('\n');
  }

  // 図の外を外したときに置く相手。図に宣言されている参加者の先頭を使い、
  // 1 人も居なければ相手側と同じにはできないので 'Participant' を作る。
  function outerFallback(text, lineNum, side) {
    var parsed = parseSequence(text);
    for (var i = 0; i < parsed.elements.length; i++) {
      if (parsed.elements[i].kind === 'participant') return parsed.elements[i].id;
    }
    return 'Participant';
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
    lines[idx] = indent + fmtMessage(from, to, arrow, label);
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

  // Feature #8: alt ブロック内に else/elseif 行を挿入する。
  //   groupStartLine: alt 行 (1-based)
  //   groupEndLine:   end 行 (1-based)
  // end 行の直前に `else <condition>` (condition は任意) を挿入。
  // groupStartLine のインデントを継承する (nested block でも揃う)。
  function insertElseIntoGroup(text, groupStartLine, groupEndLine, condition) {
    var lines = text.split('\n');
    if (groupStartLine < 1 || groupEndLine > lines.length || groupStartLine >= groupEndLine) return text;
    var openLine = lines[groupStartLine - 1] || '';
    var indentMatch = openLine.match(/^(\s*)/);
    var indent = indentMatch ? indentMatch[1] : '';
    var condStr = (condition == null ? '' : String(condition)).trim();
    var elseLine = indent + 'else' + (condStr ? ' ' + condStr : '');
    // end 行 (groupEndLine) の 1 つ前 (= index groupEndLine - 1) に挿入すると end の直前に入る。
    lines.splice(groupEndLine - 1, 0, elseLine);
    return lines.join('\n');
  }

  function updateGroup(text, lineNum, field, value) {
    // field: 'gtype' | 'label'
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var gm = trimmed.match(GROUP_OPEN_RE);
    if (!gm) return text;
    var gtype = gm[1];
    var label = (gm[2] || '').trim();
    if (field === 'gtype') gtype = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + (label ? gtype + ' ' + label : gtype);
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

  // userissue v1.2.7: メッセージラベルから <<stereotype>> 部を抽出 / 合成する
  // pure 関数。 canonical 形式は <color:#32CD32><<X>></color>\n<plain> で、
  // 色タグ無しの bare <<X>>\n<plain> も受理 (parser 寛容性)。 \n は PlantUML
  // が改行と解釈する 2 文字 (バックスラッシュ + n) リテラル。
  var STEREOTYPE_COLOR = '#32CD32';
  function extractStereotype(label) {
    if (label == null) return { stereotype: '', label: '' };
    var s = String(label);
    var m = s.match(/^<color:[^>]+><<([^<>]+)>><\/color>\\n([\s\S]*)$/);
    if (m) return { stereotype: m[1], label: m[2] };
    var m2 = s.match(/^<<([^<>]+)>>\\n([\s\S]*)$/);
    if (m2) return { stereotype: m2[1], label: m2[2] };
    var m3 = s.match(/^<color:[^>]+><<([^<>]+)>><\/color>$/);
    if (m3) return { stereotype: m3[1], label: '' };
    var m4 = s.match(/^<<([^<>]+)>>$/);
    if (m4) return { stereotype: m4[1], label: '' };
    return { stereotype: '', label: s };
  }
  function formatLabelWithStereotype(stereotype, label) {
    var st = (stereotype || '').trim().replace(/^<<+/, '').replace(/>>+$/, '').trim();
    var lb = label != null ? String(label) : '';
    if (!st) return lb;
    if (!lb) return '<color:' + STEREOTYPE_COLOR + '><<' + st + '>></color>';
    return '<color:' + STEREOTYPE_COLOR + '><<' + st + '>></color>\\n' + lb;
  }

  // userissue v1.2.3: lifeline 選択時の「activation 全削除」用。 対象 participant
  // ID にマッチする activate / deactivate / create / destroy 行を一括除去。
  // メッセージ参照 (User -> System) は activation ではないので残す。
  function deleteActivationsFor(text, participantId) {
    if (!participantId) return text;
    var escaped = window.MA.dslUtils.escapeForRegex(participantId);
    var lineRe = new RegExp('^\\s*(' + ACTIVATION_ACTIONS.join('|') + ')\\s+' + escaped + '\\s*$');
    var lines = text.split('\n');
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      if (lineRe.test(lines[i])) continue;
      kept.push(lines[i]);
    }
    return kept.join('\n');
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
    // design 5c: 区切り線 / 遅延 / 参照 の書式は core/sequence-marks.js が持つ。
    if (window.MA.sequenceMarks.isMarkKind(kind)) {
      return window.MA.sequenceMarks.formatLine(kind, props);
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

  // BLK-human-20260912-0901: 挿入の確定で使う関数を、帯を見て決める。
  // 帯が絡まないときは従来の insertBefore / insertAfter と同じ行に入る。
  function _activationAwareInsertFn(text, line, position, kind) {
    var plain = position === 'before' ? insertBefore : insertAfter;
    if (kind === 'activation' || kind === 'participant') return plain;
    var res = _resolveInsert(text, line, position);
    if (!res) return plain;
    var target = res.target;
    return function(t, _line, k, props) { return insertBefore(t, target, k, props); };
  }

  // FEAT-076 (HFR-003): lineNum の message 行を、同一の from / to / arrow / label で
  // **その直後**に 1 行だけ複製する。生成は _formatLine / 挿入は insertAfter の再利用であり
  // 挿入 modal の確定処理と同一経路。message でない行・不在行では text を 1 文字も変えない。
  function duplicateMessage(text, lineNum) {
    var rels = (parseSequence(text).relations) || [];
    for (var i = 0; i < rels.length; i++) {
      var r = rels[i];
      if (r.kind === 'message' && r.line === lineNum) {
        return insertAfter(text, lineNum, 'message',
          { from: r.from, to: r.to, arrow: r.arrow, label: r.label });
      }
    }
    return text;
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
    // FEAT-114 / HFR-060: 2 連 prompt() を seq-modal の 1 枚フォームへ置き換える。
    P.bindAllByClass(propsEl, 'seq-wrap-block', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showWrapForm(ctx, ln, ln);
    });
    function _moveAndReselect(ln, direction) {
      var oldText = ctx.getMmdText();
      var newLine = _findMessageSwapTargetLine(oldText, ln, direction);
      if (newLine < 0) return;
      var newText = moveMessage(oldText, ln, direction);
      if (newText === oldText) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(newText);
      try {
        var p = parseSequence(newText);
        for (var i = 0; i < p.relations.length; i++) {
          var r = p.relations[i];
          if (r.kind === 'message' && r.line === newLine) {
            window.MA.selection.setSelected([{ type: 'message', id: r.id, line: r.line }]);
            break;
          }
        }
      } catch (e) { /* keep prior selection */ }
      ctx.onUpdate();
    }
    P.bindAllByClass(propsEl, 'seq-move-up', function(btn) {
      _moveAndReselect(parseInt(btn.getAttribute('data-line'), 10), -1);
    });
    P.bindAllByClass(propsEl, 'seq-move-down', function(btn) {
      _moveAndReselect(parseInt(btn.getAttribute('data-line'), 10), 1);
    });
    P.bindAllByClass(propsEl, 'seq-delete-line', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      // FEAT-015: 削除の確認ダイアログを廃し、削除後の「元に戻す」トーストで代替する。
      // FEAT-104: 削除直前のテキストを捕捉し、トーストの復元先として渡す。
      var _snap = ctx.getMmdText();
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), ln));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
      _toastUndo('1 件削除しました', _snap, ctx);
    });
    // C3: participant 左右挿入 (participant 選択時のみ描画される)
    // FEAT-142 / HFR-075: 2 連 prompt() を seq-modal の 1 枚フォームへ置き換える
    // (FEAT-114 / HFR-060 の _showWrapForm と同じ作法)。挿入本体・pushHistory()・
    // onUpdate() の並びは変えず、変えるのは値の取得手段だけである。
    P.bindAllByClass(propsEl, 'seq-insert-part-before', function(btn) {
      _showPartForm(ctx, parseInt(btn.getAttribute('data-line'), 10), 'before');
    });
    P.bindAllByClass(propsEl, 'seq-insert-part-after', function(btn) {
      _showPartForm(ctx, parseInt(btn.getAttribute('data-line'), 10), 'after');
    });
    // C9: メッセージ選択時、対応する activate/deactivate を推論挿入
    P.bindAllByClass(propsEl, 'seq-infer-activation', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(inferActivations(ctx.getMmdText(), ln));
      ctx.onUpdate();
    });
  }

  // FEAT-001: 挿入位置のアンカー行 (line が指す message relation) を返す。
  // 該当する message が無い場合 (先頭挿入・participant 行など) は null。
  function resolveAnchor(parsed, line) {
    if (!parsed || !parsed.relations) return null;
    for (var i = 0; i < parsed.relations.length; i++) {
      var r = parsed.relations[i];
      if (r.kind === 'message' && r.line === line) return r;
    }
    return null;
  }

  // FEAT-001: selectFieldHtml 用 option 配列に selected を付与した新しい配列を返す。
  // 元配列は破壊しない。value が null/undefined なら selected は 1件も立たない。
  function withSelected(options, value) {
    return options.map(function(o) {
      return { value: o.value, label: o.label, selected: o.value === value };
    });
  }

  // FEAT-114 / HFR-060: 「ブロックで囲む」の 2 連 prompt() を 1 枚のフォームにまとめる。
  // 種類は 4 択のドロップダウンに限定し、任意文字列が DSL に入る経路を塞ぐ ([AC-4])。
  var WRAP_KINDS = ['alt', 'opt', 'loop', 'par'];

  function wrapFormHtml(selectedKind) {
    var P = window.MA.properties;
    var kind = selectedKind || WRAP_KINDS[0];
    var opts = WRAP_KINDS.map(function(k) {
      return { value: k, label: k, selected: k === kind };
    });
    return '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">ブロックで囲む</h3>' +
      P.selectFieldHtml('ブロック種類', 'seq-wrap-kind', opts) +
      '<div style="margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Label/Condition</label>' +
        '<input id="seq-wrap-label" type="text" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="seq-wrap-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="seq-wrap-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
  }

  function _showWrapForm(ctx, startLine, endLine) {
    var modal = document.getElementById('seq-modal');
    var content = document.getElementById('seq-modal-content');
    content.innerHTML = wrapFormHtml(WRAP_KINDS[0]);
    modal.style.display = 'flex';
    var labelEl = document.getElementById('seq-wrap-label');
    if (labelEl && labelEl.focus) labelEl.focus();
    // [AC-3] キャンセルは DSL を 1 バイトも変えず pushHistory() も呼ばない。
    document.getElementById('seq-wrap-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
    });
    // [AC-2] 書き戻しは既存の wrapWith をそのまま呼ぶ (出力はバイト単位で従来と同一)。
    // [AC-5] pushHistory() は書き戻しの直前に 1 回だけ = Ctrl+Z 1 回で戻る。
    document.getElementById('seq-wrap-confirm').addEventListener('click', function() {
      var kind = document.getElementById('seq-wrap-kind').value;
      var label = document.getElementById('seq-wrap-label').value;
      window.MA.history.pushHistory();
      ctx.setMmdText(wrapWith(ctx.getMmdText(), startLine, endLine, kind, label || ''));
      modal.style.display = 'none';
      ctx.onUpdate();
    });
  }

  // FEAT-142 / HFR-075: participant 左右挿入の 2 連 prompt() を 1 枚のフォームにまとめる。
  // Type は PARTICIPANT_TYPES の 8 択のドロップダウンに限定し、旧 prompt が通していた
  // 任意文字列が DSL に入る経路を塞ぐ ([AC-2])。既定値は 'participant'。
  function partFormHtml(position) {
    var P = window.MA.properties;
    var opts = PARTICIPANT_TYPES.map(function(pt) {
      return { value: pt, label: pt, selected: pt === 'participant' };
    });
    return '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">参加者を' +
        (position === 'before' ? '左' : '右') + 'に追加</h3>' +
      '<div style="margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Alias</label>' +
        '<input id="seq-part-alias" type="text" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
      '</div>' +
      P.selectFieldHtml('Type', 'seq-part-type', opts) +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="seq-part-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="seq-part-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
  }

  function _showPartForm(ctx, line, position) {
    var modal = document.getElementById('seq-modal');
    var content = document.getElementById('seq-modal-content');
    content.innerHTML = partFormHtml(position);
    modal.style.display = 'flex';
    var aliasEl = document.getElementById('seq-part-alias');
    if (aliasEl && aliasEl.focus) aliasEl.focus();
    // [AC-6] キャンセルは DSL を 1 バイトも変えず pushHistory() も呼ばない。
    document.getElementById('seq-part-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
    });
    document.getElementById('seq-part-confirm').addEventListener('click', function() {
      var alias = document.getElementById('seq-part-alias').value;
      // [AC-5] Alias 未入力では旧 prompt 経路の `if (!alias) return;` と同じく何もしない。
      if (!alias) return;
      var ptype = document.getElementById('seq-part-type').value;
      // [AC-3] [AC-4] 書き戻しは既存の insertBefore / insertAfter をそのまま呼ぶ
      // (出力はバイト単位で従来と同一)。
      window.MA.history.pushHistory();
      var text = ctx.getMmdText();
      var opt = { ptype: ptype || 'participant', alias: alias };
      ctx.setMmdText(position === 'before'
        ? insertBefore(text, line, 'participant', opt)
        : insertAfter(text, line, 'participant', opt));
      modal.style.display = 'none';
      ctx.onUpdate();
    });
  }

  // BLK-primary-20260907-0356 (design 5c): プレビュー上の挿入ガイドをクリックしたとき、
  // 「メッセージだけ」ではなく挿入できる要素種別のメニューを出す。
  // value は _showInsertForm の kind に対応する。alt / loop は block の preset。
  var INSERT_KINDS = [
    { value: 'message', label: 'メッセージ', hint: 'A -> B : 本文' },
    { value: 'note', label: '注釈 (note)', hint: 'note over A : 本文' },
    { value: 'alt', label: '条件分岐 (alt)', hint: 'alt … end' },
    { value: 'loop', label: '繰り返し (loop)', hint: 'loop … end' },
    { value: 'activation', label: '実行中の帯 (activate)', hint: 'activate A' },
    // design 5c: 最後は「その他（区切り線 / 遅延 / 参照）」で、押すと下位メニューが開く。
    { value: 'other', label: 'その他（区切り線 / 遅延 / 参照）', hint: '▸' },
  ];

  // 「その他」を開いたときに並ぶもの。区切り線 / 遅延 / 参照 (design 5c・5b の網羅表)
  // に、従来の「その他のブロック」を続ける。
  function otherInsertKinds() {
    var marks = window.MA.sequenceMarks.marks().map(function(m) {
      return { value: m.value, label: m.label, hint: m.hint };
    });
    // design 5d: par / break / critical もパレットの行として並べる
    // (フォームの select を開くまで見つからない状態にしない)。
    return marks.concat(OTHER_GROUP_KINDS.map(function(k) {
      return { value: 'block:' + k, label: GROUP_DESC[k], hint: k + ' … end' };
    }));
  }

  function insertKindOptions() {
    return INSERT_KINDS.map(function(k) { return { value: k.value, label: k.label, hint: k.hint }; });
  }

  // BLK-human-20260912-0901: activate / deactivate の帯を見て挿入行を決める。
  // text を渡せなかった (= 帯が分からない) ときだけ、従来の素朴な前/後に落ちる。
  function _resolveInsert(text, line, position) {
    var ai = window.MA.sequenceActivationInsert;
    if (!ai || typeof text !== 'string') return null;
    return ai.resolve(text, line, position);
  }

  // 挿入結果が DSL の何行目になるか。text があれば帯を避けた行、無ければ
  // before は line そのもの、after は line の次。
  function insertTargetLine(line, position, text) {
    var n = parseInt(line, 10);
    if (isNaN(n)) return null;
    var res = _resolveInsert(text, n, position);
    if (res) return res.target;
    return position === 'before' ? n : n + 1;
  }

  // ピッカー / フォームの見出しに出す「どこに入るか」の 1 行説明。
  // 帯の内側 / 外側が決まっているときは、それも添える。
  function describeInsertTarget(line, position, text) {
    var target = insertTargetLine(line, position, text);
    if (target === null) return '';
    var base = 'DSL ' + target + ' 行目に挿入（' + line + ' 行目の' + (position === 'before' ? '前' : '後') + '）';
    var res = _resolveInsert(text, line, position);
    var zone = res ? window.MA.sequenceActivationInsert.zoneLabel(res) : '';
    return zone ? base + ' · ' + zone : base;
  }

  // ガイド線に出す 1 行。帯の内側 / 外側まで見せて、クリック前に行き先が分かるようにする。
  function describeInsertGuide(line, position, text) {
    var target = insertTargetLine(line, position, text);
    if (target === null) return null;
    var res = _resolveInsert(text, line, position);
    var zone = res ? window.MA.sequenceActivationInsert.zoneLabel(res) : '';
    return '+ DSL ' + target + ' 行目に挿入' + (zone ? '（' + zone + '）' : '');
  }

  // design 5c: 挿入メニューを開いている間、DSL の入る行に印を出す / 消す。
  function _markerShow(line, position, text) {
    if (!window.MA.insertMarker) return;
    window.MA.insertMarker.show(line, position, insertTargetLine(line, position, text));
  }
  function _markerHide() {
    if (window.MA.insertMarker) window.MA.insertMarker.hide();
  }

  // kind 引数を _showInsertForm 用の (kind, opts) に正規化する。
  function _resolvePickedKind(picked) {
    if (picked === 'alt' || picked === 'loop') return { kind: 'block', opts: { blockKind: picked } };
    // design 5d: パレットの `block:par` などは、その種別を選んだ状態でフォームを開く。
    if (String(picked).indexOf('block:') === 0) {
      return { kind: 'block', opts: { blockKind: String(picked).slice('block:'.length) } };
    }
    return { kind: picked, opts: {} };
  }

  // _showInsertPicker は kinds を差し替えて 2 段目 (その他) にも使う。
  function _showOtherPicker(ctx, line, position) {
    _renderPicker(ctx, line, position, otherInsertKinds(), 'その他', true);
  }

  function _showInsertPicker(ctx, line, position) {
    _renderPicker(ctx, line, position, INSERT_KINDS, 'ここに挿入', false);
  }

  // ボタンの id。kind には `block:par` のように CSS の id セレクタで拾えない
  // 文字が混ざるので、id 用に `-` へ均す (data-kind は元の値のまま)。
  function pickBtnId(kind) {
    return 'seq-pick-' + String(kind).replace(/[^A-Za-z0-9_-]+/g, '-');
  }

  function _renderPicker(ctx, line, position, kinds, title, isOther) {
    var modal = document.getElementById('seq-modal');
    var content = document.getElementById('seq-modal-content');
    if (!modal || !content) return;
    // 挿入先の行が決まらないうちは開かない (見出しが空のピッカーを出さない)。
    var pickText = ctx && ctx.getMmdText ? ctx.getMmdText() : null;
    if (insertTargetLine(line, position, pickText) === null) return;
    var esc = window.MA.htmlUtils.escHtml;
    var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">' + esc(title) + '</h3>' +
      '<div id="seq-pick-target" style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">' +
        esc(describeInsertTarget(line, position, pickText)) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">';
    kinds.forEach(function(k) {
      html += '<button id="' + pickBtnId(k.value) + '" data-kind="' + k.value + '" class="seq-pick-btn" ' +
        'style="text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);' +
        'padding:8px 10px;border-radius:4px;cursor:pointer;font-size:12px;">' +
        esc(k.label) +
        '<span style="color:var(--text-secondary);font-size:10px;margin-left:8px;">' + esc(k.hint) + '</span>' +
        '</button>';
    });
    html += '</div>';
    if (isOther) {
      html += '<button id="seq-pick-back" style="width:100%;margin-top:12px;background:var(--bg-tertiary);' +
        'border:1px solid var(--border);color:var(--text-secondary);padding:6px;border-radius:4px;cursor:pointer;font-size:11px;">' +
        '← 種別を選び直す</button>';
    }
    html += '<button id="seq-pick-cancel" style="width:100%;margin-top:8px;background:var(--bg-tertiary);' +
      'border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>';
    content.innerHTML = html;
    modal.style.display = 'flex';
    _markerShow(line, position, pickText);

    Array.prototype.forEach.call(content.querySelectorAll('.seq-pick-btn'), function(btn) {
      btn.addEventListener('click', function() {
        var kindAttr = btn.getAttribute('data-kind');
        // design 5c: 「その他」は form ではなく 2 段目のメニューを開く。
        if (kindAttr === 'other') { _showOtherPicker(ctx, line, position); return; }
        var picked = _resolvePickedKind(kindAttr);
        picked.opts.fromPicker = true;
        if (isOther) picked.opts.fromOther = true;
        _showInsertForm(ctx, line, position, picked.kind, picked.opts);
      });
    });
    if (isOther) {
      document.getElementById('seq-pick-back').addEventListener('click', function() {
        _showInsertPicker(ctx, line, position);
      });
    }
    document.getElementById('seq-pick-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
      _markerHide();
    });
  }

  function _showInsertForm(ctx, line, position, kind, opts) {
    opts = opts || {};
    var modal = document.getElementById('seq-modal');
    // FEAT-123 (resolves UI-014 / HFR-064): フォームを開く直前の選択を退避し、
    // 「キャンセル」で閉じたときに復帰する ([F123-AC-1])。
    // getSelected() は slice() 済みの複製を返すが、参照を共有しないことを
    // 呼出側でも明示するため slice() を重ねる。
    var prevSelection = (window.MA.selection && window.MA.selection.getSelected)
      ? window.MA.selection.getSelected().slice()
      : [];
    var content = document.getElementById('seq-modal-content');
    var P = window.MA.properties;
    var parsed = parseSequence(ctx.getMmdText());
    var participants = parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
    if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者なし）' }];
    // message 時のみ '+ 新規追加…' option を付与 (tail-add と同パターン)
    var partOptsWithNew = partOpts.slice();
    partOptsWithNew.push({ value: '__new__', label: '+ 新規追加…' });

    var KIND_TITLE = {
      message: 'メッセージを挿入',
      note: '注釈を挿入',
      block: 'ブロックを挿入',
      activation: '実行中の帯を挿入',
      // design 5c の「その他」
      separator: '区切り線を挿入',
      delay: '遅延を挿入',
      ref: '参照を挿入',
    };
    var title = (position === 'before' ? '前に' : '後に') + (KIND_TITLE[kind] || 'メッセージを挿入');
    var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">' + title + '</h3>' +
      // BLK-primary-20260907-0356: フォームでも「DSL の何行目に入るか」を示し続ける。
      '<div id="seq-mod-target" style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">' +
        window.MA.htmlUtils.escHtml(describeInsertTarget(line, position, ctx && ctx.getMmdText ? ctx.getMmdText() : null)) + '</div>';
    if (kind === 'message') {
      var arrowOpts = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === '->' }; });
      // FEAT-001: From はアンカー行の from を初期選択する (アンカー不在時は従来どおり先頭)。
      var anchorRel = resolveAnchor(parsed, line);
      var fromOpts = withSelected(partOptsWithNew, anchorRel ? anchorRel.from : null);
      // FEAT-002: To もアンカー行の to を初期選択する (アンカー不在時は従来どおり先頭)。
      var toOpts = withSelected(partOptsWithNew, anchorRel ? anchorRel.to : null);
      html +=
        P.selectFieldHtml('From', 'seq-mod-from', fromOpts) +
        P.selectFieldHtml('Arrow', 'seq-mod-arrow', arrowOpts) +
        P.selectFieldHtml('To', 'seq-mod-to', toOpts) +
        // userissue v1.2.7+: 「ここに挿入」 modal にも Stereotype 入力欄を追加。
        '<div style="margin-bottom:8px;">' +
          '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Stereotype <span style="color:#32CD32;">&lt;&lt; &gt;&gt;</span> <span style="color:var(--text-secondary);font-weight:normal;">(任意・上段にライムグリーンで表示)</span></label>' +
          '<input id="seq-mod-stereotype" type="text" placeholder="例: async / sync / important" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-mod-label-rle"></div></div>';
    } else if (kind === 'note') {
      var posOpts = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === 'over' }; });
      html +=
        P.selectFieldHtml('Position', 'seq-mod-npos', posOpts) +
        P.selectFieldHtml('Target', 'seq-mod-ntarget', partOpts) +
        '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-mod-ntext-rle"></div></div>';
    } else if (kind === 'block') {
      // alt / loop / opt / par / break / critical / group。空ブロック (opener + end) を
      // 挿入位置に置く。中身は挿入後に既存の行編集/挿入で足す (末尾追加の block と同じ形)。
      var bkSel = opts.blockKind || 'alt';
      var bkOpts = GROUP_KINDS.map(function(k) { return { value: k, label: groupLabel(k), selected: k === bkSel }; });
      html +=
        P.selectFieldHtml('Kind', 'seq-mod-bkind', bkOpts) +
        P.fieldHtml('Label', 'seq-mod-blabel', '', '例: x > 0');
    } else if (kind === 'separator' || kind === 'delay') {
      // design 5c: どちらも本文 1 つだけ。記法は placeholder で見せる。
      html += P.fieldHtml('本文（任意）', 'seq-mod-mtext', '',
        kind === 'separator' ? '例: 初期化ここまで' : '例: 応答待ち');
    } else if (kind === 'ref') {
      html +=
        P.selectFieldHtml('かかる参加者 / Over', 'seq-mod-rtarget', partOpts) +
        P.fieldHtml('本文', 'seq-mod-mtext', '', '例: 認証シーケンス参照');
    } else if (kind === 'activation') {
      html +=
        P.selectFieldHtml('Action', 'seq-mod-aact', [
          { value: 'activate', label: 'activate', selected: true },
          { value: 'deactivate', label: 'deactivate' },
        ]) +
        P.selectFieldHtml('Target', 'seq-mod-atgt', withSelected(partOpts, (resolveAnchor(parsed, line) || {}).to));
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
    if (opts.fromPicker) {
      html += '<button id="seq-mod-back" style="width:100%;margin-top:12px;background:var(--bg-tertiary);' +
        'border:1px solid var(--border);color:var(--text-secondary);padding:6px;border-radius:4px;cursor:pointer;font-size:11px;">' +
        '← 種別を選び直す</button>';
    }
    html +=
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="seq-mod-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="seq-mod-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    content.innerHTML = html;
    modal.style.display = 'flex';
    _markerShow(line, position, ctx && ctx.getMmdText ? ctx.getMmdText() : null);

    var rleObj = null;
    if (kind === 'message') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-mod-label-rle'), '');
    else if (kind === 'note') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-mod-ntext-rle'), '');
    // FEAT-004: message 種別に限り、modal 表示直後に本文 textarea へフォーカスする。
    if (kind === 'message' && rleObj && rleObj.element) rleObj.element.focus();

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

    if (opts.fromPicker) {
      document.getElementById('seq-mod-back').addEventListener('click', function() {
        if (opts.fromOther) _showOtherPicker(ctx, line, position);
        else _showInsertPicker(ctx, line, position);
      });
    }
    document.getElementById('seq-mod-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
      _markerHide();
      // FEAT-123 [F123-AC-1] / [F123-AC-3]: 退避した選択が空でなければ復帰する。
      // 空のときは setSelected を呼ばない (選択を新たに作らない)。
      if (prevSelection.length && window.MA.selection && window.MA.selection.setSelected) {
        window.MA.selection.setSelected(prevSelection);
      }
    });
    document.getElementById('seq-mod-confirm').addEventListener('click', function() {
      var t = ctx.getMmdText();
      // BLK-human-20260912-0901: 帯 (activate/deactivate) を見て行を決め直す。
      // activation / participant 自体の挿入は帯の内外という概念を持たないので素通し。
      var insertFn = _activationAwareInsertFn(t, line, position, kind);
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
        // userissue v1.2.7+: stereotype 入力があれば canonical 形式で合成する。
        var modStereoEl = document.getElementById('seq-mod-stereotype');
        var modStereo = modStereoEl ? modStereoEl.value : '';
        var modPlain = rleObj ? rleObj.getValue() : '';
        t = insertFn(t, line, 'message', {
          from: fr,
          to: to,
          arrow: document.getElementById('seq-mod-arrow').value,
          label: formatLabelWithStereotype(modStereo, modPlain),
        });
      } else if (kind === 'note') {
        window.MA.history.pushHistory();
        t = insertFn(t, line, 'note', {
          position: document.getElementById('seq-mod-npos').value,
          targets: [document.getElementById('seq-mod-ntarget').value],
          text: rleObj ? rleObj.getValue() : '',
        });
      } else if (kind === 'block') {
        window.MA.history.pushHistory();
        t = insertFn(t, line, 'block', {
          kind: document.getElementById('seq-mod-bkind').value,
          label: document.getElementById('seq-mod-blabel').value.trim(),
        });
      } else if (kind === 'separator' || kind === 'delay') {
        window.MA.history.pushHistory();
        t = insertFn(t, line, kind, { text: document.getElementById('seq-mod-mtext').value });
      } else if (kind === 'ref') {
        var rtgt = document.getElementById('seq-mod-rtarget').value;
        if (!rtgt) { alert('かかる参加者は必須です'); return; }
        window.MA.history.pushHistory();
        t = insertFn(t, line, 'ref', {
          targets: [rtgt],
          text: document.getElementById('seq-mod-mtext').value,
        });
      } else if (kind === 'activation') {
        var atgt = document.getElementById('seq-mod-atgt').value;
        if (!atgt) { alert('Target 必須'); return; }
        window.MA.history.pushHistory();
        t = insertFn(t, line, 'activation', {
          action: document.getElementById('seq-mod-aact').value,
          target: atgt,
        });
      }
      ctx.setMmdText(t);
      modal.style.display = 'none';
      _markerHide();
      ctx.onUpdate();
    });
  }

  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

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

  // _isMessageLineForMove: a line is "another message" if it contains an
  // arrow token with content before it. Notes, block keywords (alt/opt/
  // loop/par/end/else/activate/etc.), participant declarations, and
  // structural markers are NOT message lines. The previous implementation
  // claimed via comment to "stop at group boundaries and notes" but
  // actually only checked @startuml / @enduml, so a message adjacent to
  // a Note or alt line could silently swap with it (visible UX bug).
  function _isMessageLineForMove(trimmed) {
    if (!trimmed) return false;
    if (window.MA.dslUtils.isPlantumlComment(trimmed)) return false;
    if (/^(@startuml|@enduml|note\b|end\b|alt\b|opt\b|loop\b|par\b|else\b|elseif\b|and\b|group\b|critical\b|break\b|title\b|autonumber\b|participant\b|actor\b|database\b|queue\b|collections\b|control\b|entity\b|boundary\b|activate\b|deactivate\b|destroy\b|return\b|skinparam\b|hide\b|show\b|!)/i.test(trimmed)) return false;
    return /[-=<]-?[>x]|->>?|<<?-/.test(trimmed) && /\S+\s*[-=<]/.test(trimmed);
  }

  function moveMessage(text, lineNum, direction) {
    // direction: -1 = up, +1 = down. Stops at any non-message structural
    // line so up/down never visibly rearranges unrelated elements.
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var target = idx + direction;
    while (target >= 0 && target < lines.length) {
      var t = lines[target].trim();
      if (!t || window.MA.dslUtils.isPlantumlComment(t)) { target += direction; continue; }
      if (_isMessageLineForMove(t)) break;
      return text;  // structural line — no-op
    }
    if (target < 0 || target >= lines.length) return text;
    var tmp = lines[idx];
    lines[idx] = lines[target];
    lines[target] = tmp;
    return lines.join('\n');
  }

  // _findMessageSwapTargetLine: mirror of moveMessage's target search so
  // callers can re-select the moved message by its new 1-based line.
  function _findMessageSwapTargetLine(text, lineNum, direction) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return -1;
    var target = idx + direction;
    while (target >= 0 && target < lines.length) {
      var t = lines[target].trim();
      if (!t || window.MA.dslUtils.isPlantumlComment(t)) { target += direction; continue; }
      if (_isMessageLineForMove(t)) return target + 1;
      return -1;
    }
    return -1;
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

  // newIndex is a GAP index in the pre-move participant array, range [0, N].
  //   0 = before all, k (1..N-1) = between the (k-1)-th and k-th participant,
  //   N = after all. Gaps immediately adjacent to the dragged participant
  //   (`from` and `from+1`) are treated as no-op since the participant would
  //   end up in the same slot. Matches the gap-indicator semantics used by
  //   app.js drawDropIndicator / computeDropIndex so that a drop at the
  //   visible dotted line ends up at exactly that position.
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
    var N = partIndexes.length;
    if (newIndex < 0) newIndex = 0;
    if (newIndex > N) newIndex = N;
    if (newIndex === from || newIndex === from + 1) return text;
    // Remove the dragged participant and translate gap index → insertion
    // index in the `remaining` array. Gaps strictly after `from` shift left
    // by one because removal collapsed one slot.
    var fromLineIdx = partIndexes[from].lineIdx;
    var lineContent = lines[fromLineIdx];
    lines.splice(fromLineIdx, 1);
    var remaining = partIndexes.filter(function(p, idx) { return idx !== from; });
    var targetIdx = (newIndex <= from) ? newIndex : newIndex - 1;
    var toLineIdx;
    if (targetIdx >= remaining.length) {
      toLineIdx = remaining[remaining.length - 1].lineIdx + 1;
      if (fromLineIdx < toLineIdx) toLineIdx--;
    } else {
      toLineIdx = remaining[targetIdx].lineIdx;
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

  // BLK-junior-20260906-2143: 参加者数人 + メッセージ数本を 1 つのフォームで組む。
  // 「末尾に追加」は 1 件ごとに種類 select を選び直し、逃げ道の「一括 (複数行)」は
  // 矢印構文ごと打たせるため、どちらも DSL エディタに直接打つのと手数が変わらない。
  // class-scaffold と同じく、名前・本文という短い値だけを受け取って構文は自動生成する。
  function _showSeqScaffoldModal(parsedData, ctx) {
    var modal = document.getElementById('seq-sc-modal');
    var content = document.getElementById('seq-sc-modal-content');
    if (!modal || !content) return;
    var SS = window.MA.sequenceScaffold;
    var esc = window.MA.htmlUtils.escHtml;
    var P = window.MA.properties;

    var existing = (parsedData.elements || [])
      .filter(function(e) { return e.kind === 'participant'; })
      .map(function(e) { return e.label || e.id; });

    var INPUT = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;';
    var ARROW_OPTS = [
      ['sync', '同期 ->'],
      ['async', '非同期 ->>'],
      ['reply', '応答 -->'],
      ['asyncReply', '非同期応答 -->>'],
      ['lost', '消失 ->x'],
    ];

    var datalist = '<datalist id="seq-sc-names">' +
      existing.map(function(n) { return '<option value="' + esc(n) + '"></option>'; }).join('') +
      '</datalist>';

    function partRowHtml(i) {
      return '<div class="seq-sc-row" data-i="' + i + '" style="display:flex;gap:6px;margin-bottom:5px;align-items:center;">' +
        '<select id="seq-sc-ptype-' + i + '" style="' + INPUT + '">' +
          SS.PARTICIPANT_TYPES.map(function(t) {
            return '<option value="' + t + '"' + (t === 'participant' ? ' selected' : '') + '>' + t + '</option>';
          }).join('') +
        '</select>' +
        '<input id="seq-sc-pname-' + i + '" list="seq-sc-names" type="text" placeholder="参加者名 (例: TIMER ドライバ)" style="flex:1;' + INPUT + '">' +
        '<button id="seq-sc-pdel-' + i + '" title="この行を削除" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 7px;">✕</button>' +
      '</div>';
    }

    // メッセージの From / To は参加者行と図の既存参加者からの選択にする。
    // 名前を打ち直す手が要らず、綴り違いで別人が生まれることもない。
    function namePickHtml(id) {
      return '<select id="' + id + '" class="seq-sc-name-pick" style="flex:1;' + INPUT + '">' +
        '<option value="">（選ぶ）</option></select>';
    }

    function msgRowHtml(j) {
      return '<div class="seq-sc-msg-row" data-j="' + j + '" style="display:flex;gap:6px;margin-bottom:5px;align-items:center;">' +
        namePickHtml('seq-sc-mfrom-' + j) +
        '<select id="seq-sc-marrow-' + j + '" style="' + INPUT + '">' +
          ARROW_OPTS.map(function(o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') +
        '</select>' +
        namePickHtml('seq-sc-mto-' + j) +
        '<input id="seq-sc-mtext-' + j + '" type="text" placeholder="本文 (例: Timer_Init())" style="flex:2;' + INPUT + '">' +
        '<button id="seq-sc-mdel-' + j + '" title="この行を削除" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 7px;">✕</button>' +
      '</div>';
    }

    var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 4px 0;';
    var pRows = '', mRows = '', ri;
    for (ri = 0; ri < 4; ri++) pRows += partRowHtml(ri);
    for (ri = 0; ri < 4; ri++) mRows += msgRowHtml(ri);
    content.innerHTML = datalist +
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">シーケンス構成をまとめて追加</h3>' +
      '<div style="' + SECTION + '">タイトル (省略可)</div>' +
      '<input id="seq-sc-title" type="text" placeholder="例: TIMER ドライバ初期化" style="width:100%;box-sizing:border-box;' + INPUT + '">' +
      '<div style="' + SECTION + '">参加者 (種類 / 名前)</div>' +
      '<div id="seq-sc-rows">' + pRows + '</div>' +
      '<button id="seq-sc-add-row" style="font-size:11px;padding:3px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">＋ 参加者を追加</button>' +
      '<div style="' + SECTION + '">メッセージ (From / 矢印 / To / 本文)</div>' +
      '<div id="seq-sc-msg-rows">' + mRows + '</div>' +
      '<button id="seq-sc-add-msg" style="font-size:11px;padding:3px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">＋ メッセージを追加</button>' +
      '<div style="' + SECTION + '">追加される行</div>' +
      '<pre id="seq-sc-preview" style="margin:0;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;padding:6px;font-family:Consolas,monospace;font-size:11px;color:var(--text-primary);white-space:pre-wrap;min-height:34px;"></pre>' +
      '<div id="seq-sc-errors" style="font-size:11px;color:var(--accent-red);margin-top:6px;min-height:14px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="seq-sc-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="seq-sc-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

    function collectSpec() {
      var participants = [];
      var rows = content.querySelectorAll('.seq-sc-row');
      for (var i = 0; i < rows.length; i++) {
        var idx = rows[i].getAttribute('data-i');
        participants.push({ name: val('seq-sc-pname-' + idx), type: val('seq-sc-ptype-' + idx) });
      }
      var messages = [];
      var mrows = content.querySelectorAll('.seq-sc-msg-row');
      for (var j = 0; j < mrows.length; j++) {
        var jdx = mrows[j].getAttribute('data-j');
        messages.push({
          from: val('seq-sc-mfrom-' + jdx),
          to: val('seq-sc-mto-' + jdx),
          arrow: val('seq-sc-marrow-' + jdx),
          text: val('seq-sc-mtext-' + jdx),
        });
      }
      return { title: val('seq-sc-title'), participants: participants, messages: messages };
    }

    // From / To の選択肢は「今この画面で打っている参加者名 + 図に既にある参加者」。
    // 打ちながら増えるので、行を足すたびに選び直しに戻らずに済む。
    function candidateNames() {
      var names = [], seen = {};
      function push(v) {
        var t = (v || '').trim();
        if (!t || seen[t]) return;
        seen[t] = true; names.push(t);
      }
      var rows = content.querySelectorAll('.seq-sc-row');
      for (var i = 0; i < rows.length; i++) push(val('seq-sc-pname-' + rows[i].getAttribute('data-i')));
      existing.forEach(push);
      return names;
    }

    function refreshPicks() {
      var names = candidateNames();
      var picks = content.querySelectorAll('.seq-sc-name-pick');
      for (var i = 0; i < picks.length; i++) {
        var cur = picks[i].value;
        picks[i].innerHTML = '<option value="">（選ぶ）</option>' +
          names.map(function(n) {
            return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
          }).join('');
        if (cur && names.indexOf(cur) < 0) picks[i].value = '';
      }
    }

    function refresh() {
      refreshPicks();
      var spec = collectSpec();
      var text = ctx.getMmdText();
      var pre = document.getElementById('seq-sc-preview');
      if (pre) pre.textContent = SS.preview(text, spec).join('\n');
      var res = SS.validate(spec, text);
      var errEl = document.getElementById('seq-sc-errors');
      if (errEl) errEl.textContent = res.ok ? '' : res.errors.join(' / ');
      var confirmBtn = document.getElementById('seq-sc-confirm');
      if (confirmBtn) {
        confirmBtn.disabled = !res.ok;
        confirmBtn.style.opacity = res.ok ? '1' : '0.5';
        confirmBtn.style.cursor = res.ok ? 'pointer' : 'not-allowed';
      }
    }

    function bindRemovable(btnId, rowSel, key, keyVal) {
      P.bindEvent(btnId, 'click', function() {
        var rows = content.querySelectorAll(rowSel);
        if (rows.length <= 1) return;
        for (var k = 0; k < rows.length; k++) {
          if (rows[k].getAttribute(key) === String(keyVal)) {
            rows[k].parentNode.removeChild(rows[k]);
            break;
          }
        }
        refresh();
      });
    }

    function bindPartRow(i) {
      P.bindEvent('seq-sc-pname-' + i, 'input', refresh);
      P.bindEvent('seq-sc-ptype-' + i, 'change', refresh);
      bindRemovable('seq-sc-pdel-' + i, '.seq-sc-row', 'data-i', i);
    }
    function bindMsgRow(j) {
      P.bindEvent('seq-sc-mtext-' + j, 'input', refresh);
      ['seq-sc-mfrom-' + j, 'seq-sc-mto-' + j, 'seq-sc-marrow-' + j].forEach(function(id) {
        P.bindEvent(id, 'change', refresh);
      });
      bindRemovable('seq-sc-mdel-' + j, '.seq-sc-msg-row', 'data-j', j);
    }
    for (ri = 0; ri < 4; ri++) { bindPartRow(ri); bindMsgRow(ri); }
    P.bindEvent('seq-sc-title', 'input', refresh);

    var nextPart = 4, nextMsg = 4;
    P.bindEvent('seq-sc-add-row', 'click', function() {
      var rows = document.getElementById('seq-sc-rows');
      if (!rows) return;
      var i = nextPart++;
      rows.insertAdjacentHTML('beforeend', partRowHtml(i));
      bindPartRow(i);
      var el = document.getElementById('seq-sc-pname-' + i);
      if (el && el.focus) el.focus();
      refresh();
    });
    P.bindEvent('seq-sc-add-msg', 'click', function() {
      var rows = document.getElementById('seq-sc-msg-rows');
      if (!rows) return;
      var j = nextMsg++;
      rows.insertAdjacentHTML('beforeend', msgRowHtml(j));
      bindMsgRow(j);
      refresh();
      var el = document.getElementById('seq-sc-mfrom-' + j);
      if (el && el.focus) el.focus();
    });

    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    P.bindEvent('seq-sc-cancel', 'click', close);
    P.bindEvent('seq-sc-confirm', 'click', function() {
      var spec = collectSpec();
      var text = ctx.getMmdText();
      if (!SS.validate(spec, text).ok) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(SS.apply(text, spec));
      ctx.onUpdate();
      close();
    });

    refresh();
    // 開いた直後はタイトルから打ち始めるので、最初からフォーカスを載せる。
    var first = document.getElementById('seq-sc-title');
    if (first && first.focus) first.focus();
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
    normalizeIdInput: normalizeIdInput,
    addMessage: addMessage,
    parseBulkLines: parseBulkLines,
    addBulk: addBulk,
    deleteLine: deleteLine,
    deleteSelectedLine: deleteSelectedLine,
    updateParticipant: updateParticipant,
    updateMessage: updateMessage,
    swapMessageEnds: swapMessageEnds,
    quickArrows: function() { return QUICK_ARROWS.slice(); },
    // design 2d: 「その他の矢印」パレット
    otherArrows: function() { return OTHER_ARROWS.slice(); },
    // design 5d: ブロックの枠 (par / break / critical …) を「何が起きるか」で出す
    groupKinds: function() { return GROUP_KINDS.slice(); },
    groupLabel: groupLabel,
    applyArrowSpec: applyArrowSpec,
    activeArrowKey: activeArrowKey,
    // design 5d: 線の色
    lineColors: function() { return _lineColors(); },
    stripArrowColor: stripArrowColor,
    arrowColor: arrowColor,
    arrowSupportsColor: arrowSupportsColor,
    setArrowColor: setArrowColor,
    messageColor: messageColor,
    setMessageColor: setMessageColor,
    setTitle: setTitle,
    toggleAutonumber: toggleAutonumber,
    addGroup: addGroup,
    deleteGroup: deleteGroup,
    insertElseIntoGroup: insertElseIntoGroup,
    updateGroup: updateGroup,
    wrapWith: wrapWith,
    WRAP_KINDS: WRAP_KINDS,
    wrapFormHtml: wrapFormHtml,
    partFormHtml: partFormHtml,
    unwrap: unwrap,
    addNote: addNote,
    updateNote: updateNote,
    moveMessage: moveMessage,
    addActivation: addActivation,
    deleteActivationsFor: deleteActivationsFor,
    extractStereotype: extractStereotype,
    formatLabelWithStereotype: formatLabelWithStereotype,
    insertBefore: insertBefore,
    insertAfter: insertAfter,
    duplicateMessage: duplicateMessage,
    resolveAnchor: resolveAnchor,
    withSelected: withSelected,
    renameWithRefs: renameWithRefs,
    duplicateRange: duplicateRange,
    inferActivations: inferActivations,
    setParticipantColor: setParticipantColor,
    moveParticipant: moveParticipant,
    showInsertForm: function(ctx, line, position, kind) {
      _showInsertForm(ctx, line, position, kind);
    },
    showInsertPicker: function(ctx, line, position) {
      _showInsertPicker(ctx, line, position);
    },
    insertKindOptions: insertKindOptions,
    pickBtnId: pickBtnId,
    otherInsertKinds: otherInsertKinds,
    insertTargetLine: insertTargetLine,
    describeInsertTarget: describeInsertTarget,
    describeInsertGuide: describeInsertGuide,
    // design 5c: hover ガイドも「DSL の何行目に入るか」を出す。app.js の hover 側は
    // currentModule.resolveInsertLine しか見ないので、click 側と同じ解決を module から
    // 公開する (無いと汎用の「+ ここに挿入」に落ち、行番号も列も出ない)。
    resolveInsertLine: function(overlayEl, x, y) {
      if (!window.MA.sequenceOverlay || !window.MA.sequenceOverlay.resolveInsertLine) return null;
      return window.MA.sequenceOverlay.resolveInsertLine(overlayEl, x, y);
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
    capabilities: {
      overlaySelection: true,
      hoverInsert: true,
      participantDrag: true,
      showInsertForm: true,
      insertPicker: true,
      deleteSelectedLine: true,
      multiSelectConnect: false,
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
      // Defense-in-depth: parsedData may transiently lack the sequence shape
      // when other modules' parsedData is still in-flight (e.g. during a
      // diagram-type switch where clearSelection() fires renderProps before
      // app.js finishes the reparse). Coalesce missing fields rather than
      // throwing on `parsedData.elements.filter`.
      if (!parsedData) parsedData = { meta: {}, elements: [], relations: [], groups: [] };
      if (!parsedData.meta) parsedData.meta = {};
      var elements = parsedData.elements || [];
      var participants = elements.filter(function(e) { return e.kind === 'participant'; });
      var notes = elements.filter(function(e) { return e.kind === 'note'; });
      var activations = elements.filter(function(e) { return e.kind === 'activation'; });
      var messages = parsedData.relations || [];
      var groups = parsedData.groups || [];

      if (!selData || selData.length === 0) {
        var participants = elements.filter(function(e) { return e.kind === 'participant'; });
        var autonumChecked = parsedData.meta.autonumber ? 'checked' : '';
        propsEl.innerHTML =
          '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Sequence Diagram</div>' +
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
              { value: 'bulk', label: '一括 (複数行)' },
            ]) +
            '<div id="seq-tail-detail" style="margin-top:6px;"></div>' +
          '</div>' +
          // BLK-junior-20260906-2143: 参加者とメッセージをまとめて組む入口。
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<button id="seq-scaffold-open" style="width:100%;font-size:11px;padding:5px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">⌗ シーケンス構成をまとめて追加</button>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">' +
            'プレビュー上で要素をクリックすると編集パネルが開きます' +
          '</div>';

        P.bindEvent('seq-scaffold-open', 'click', function() {
          _showSeqScaffoldModal(parsedData, ctx);
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
            var partOptsWithNew = partOpts.slice();
            partOptsWithNew.push({ value: '__new__', label: '+ 新規追加…' });
            // BLK-junior-20260907-2203: 直前に選んだメッセージの当事者を初期値にする。
            // 応答を 1 本足すたびに From / To を選び直さずに済む。憶えが無いとき
            // (何も選ばずに開いたとき) はこれまでどおり先頭の参加者のまま。
            var SE = window.MA.selectedEndpoints;
            var tailDef = SE ? SE.defaultsFor(participants.map(function(p) { return p.id; })) : { source: 'none' };
            var fromOptsT = tailDef.from ? withSelected(partOptsWithNew, tailDef.from) : partOptsWithNew;
            var toOptsT = tailDef.to ? withSelected(partOptsWithNew, tailDef.to) : partOptsWithNew;
            var tailNote = SE ? SE.noteText(tailDef, function(id) {
              for (var i = 0; i < participants.length; i++) if (participants[i].id === id) return participants[i].label;
              return id;
            }) : '';
            html =
              (tailNote ? '<div id="seq-tail-endpoint-note" style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;">'
                + window.MA.htmlUtils.escHtml(tailNote) + '</div>' : '') +
              P.selectFieldHtml('From', 'seq-tail-from', fromOptsT) +
              // design 2d: 末尾追加でも同じ矢印パレットから選ぶ。
              // 現在値は hidden #seq-tail-arrow が持つ。
              P.arrowPickerHtml('矢印の種類 / Arrow', 'seq-tail-arrow',
                quickArrowOptions(), otherArrowOptions(), '->') +
              // design 5d: 末尾追加でも線の色を先に決められる。
              lineColorRowHtml('seq-tail-color', '', true) +
              '<input type="hidden" id="seq-tail-color" value="">' +
              P.selectFieldHtml('To', 'seq-tail-to', toOptsT) +
              // userissue v1.2.7+: 末尾追加でも Stereotype を入力できるように。
              '<div style="margin-bottom:8px;">' +
                '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Stereotype <span style="color:#32CD32;">&lt;&lt; &gt;&gt;</span> <span style="color:var(--text-secondary);font-weight:normal;">(任意・上段にライムグリーンで表示)</span></label>' +
                '<input id="seq-tail-stereotype" type="text" placeholder="例: async / sync / important" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
              '</div>' +
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
            var bkOpts = GROUP_KINDS.map(function(k) { return { value: k, label: groupLabel(k), selected: k === 'alt' }; });
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
          } else if (kind === 'bulk') {
            html =
              '<div style="margin-bottom:4px;font-size:10px;color:var(--text-secondary);">1 行 1 件。参加者とメッセージを混ぜて書けます</div>' +
              window.MA.reuseModal.buttonHtml('seq-tail-reuse') +
              '<textarea id="seq-tail-bulk" style="width:100%;min-height:90px;font-family:inherit;font-size:12px;"></textarea>' +
              P.primaryButtonHtml('seq-tail-add', '+ まとめて末尾に追加') +
              '<div id="seq-tail-bulk-hint" style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
                'actor Dev / participant "SPI ドライバ" as SpiDrv / DB : データベース → 参加者<br>' +
                'Dev -&gt; SpiDrv : Spi_Init() → メッセージ (矢印は -&gt; --&gt; -&gt;&gt; など)<br>' +
                '参加者は書いた順に宣言され、メッセージは後ろにまとまります' +
              '</div>';
          }
          detailEl.innerHTML = html;
          // 一括欄は「既に他の図にある行」を打ち直させないためのボタンを持つ。
          window.MA.reuseModal.bindButton('seq-tail-reuse', 'plantuml-sequence', 'seq-tail-bulk');
          var rleObj = null;
          if (kind === 'message') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-tail-label-rle'), '');
          else if (kind === 'note') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-tail-ntext-rle'), '');
          if (kind === 'message') {
            // design 5d: 末尾追加の色見本。選んだ色は hidden #seq-tail-color が持つ。
            var tColorBtns = detailEl.querySelectorAll('.seq-tail-color-swatch');
            for (var tci = 0; tci < tColorBtns.length; tci++) {
              (function(b) {
                b.addEventListener('click', function() {
                  var hid = document.getElementById('seq-tail-color');
                  if (hid) hid.value = b.getAttribute('data-color');
                  for (var k = 0; k < tColorBtns.length; k++) {
                    var on = tColorBtns[k] === b;
                    tColorBtns[k].setAttribute('aria-pressed', on ? 'true' : 'false');
                    tColorBtns[k].style.boxShadow = on ? '0 0 0 2px var(--accent)' : '';
                  }
                });
              })(tColorBtns[tci]);
            }
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
            // design 2d: 矢印パレットの選択を hidden #seq-tail-arrow に反映する。
            // 図の外を選んだときは、その側の From/To を伏せる。
            P.bindArrowPicker('seq-tail-arrow', function(v) {
              var sp = findArrowSpec(v);
              var frWrap = document.getElementById('seq-tail-from');
              var toWrap = document.getElementById('seq-tail-to');
              if (frWrap) frWrap.disabled = !!(sp && sp.from);
              if (toWrap) toWrap.disabled = !!(sp && sp.to);
            });
          }
          P.bindEvent('seq-tail-add', 'click', function() {
            var t = ctx.getMmdText();
            var out;
            if (kind === 'message') {
              var fr = document.getElementById('seq-tail-from').value;
              var to = document.getElementById('seq-tail-to').value;
              // design 2d: パレットの行は `[->` のように相手も決めるので、
              // spec を引いて from/to を差し替えてから書式化する。
              var arrowKey = document.getElementById('seq-tail-arrow').value;
              var arrowSpec = findArrowSpec(arrowKey);
              var arrow = arrowSpec ? arrowSpec.arrow : arrowKey;
              // design 5d: 色見本で選んだ色を、矢印の形を保ったまま載せる。
              var tailColorEl = document.getElementById('seq-tail-color');
              if (tailColorEl && tailColorEl.value && !arrowColor(arrow)) {
                arrow = setArrowColor(arrow, tailColorEl.value);
              }
              if (arrowSpec && arrowSpec.from) fr = arrowSpec.from;
              if (arrowSpec && arrowSpec.to) to = arrowSpec.to;
              var labelVal = (rleObj ? rleObj.getValue() : '').trim();
              if (fr === '__new__' || to === '__new__') {
                var rawNewAl = document.getElementById('seq-tail-new-alias').value;
                var inlineNorm = normalizeIdInput(rawNewAl, parsedData);
                if (!inlineNorm.valid) { alert('新しい参加者の Alias は必須です'); return; }
                var ptype = document.getElementById('seq-tail-new-ptype').value;
                window.MA.history.pushHistory();
                t = addParticipant(t, ptype, inlineNorm.id, inlineNorm.label);
                if (fr === '__new__') fr = inlineNorm.id;
                if (to === '__new__') to = inlineNorm.id;
              } else {
                window.MA.history.pushHistory();
              }
              // userissue v1.2.7+: stereotype 入力があれば canonical 形式で合成。
              var tailStereoEl = document.getElementById('seq-tail-stereotype');
              var tailStereo = tailStereoEl ? tailStereoEl.value : '';
              var combinedLabel = formatLabelWithStereotype(tailStereo, labelVal);
              out = addMessage(t, fr, to, arrow, combinedLabel);
            } else if (kind === 'participant') {
              var rawAl = document.getElementById('seq-tail-alias').value;
              var partNorm = normalizeIdInput(rawAl, parsedData);
              if (!partNorm.valid) { alert('Alias 必須'); return; }
              var rawPlbl = document.getElementById('seq-tail-plabel').value.trim();
              window.MA.history.pushHistory();
              out = addParticipant(t, document.getElementById('seq-tail-ptype').value, partNorm.id, rawPlbl || partNorm.label);
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
            } else if (kind === 'bulk') {
              var block = document.getElementById('seq-tail-bulk').value;
              var bulkOut = addBulk(t, block, parsedData);
              if (bulkOut === t) { alert('追加できる行がありません'); return; }
              window.MA.history.pushHistory();
              out = bulkOut;
            }
            ctx.setMmdText(out);
            ctx.onUpdate();
          });
        };
        renderTailDetail();
        P.bindEvent('seq-tail-kind', 'change', renderTailDetail);
        // design 2b: 種別はチップ 1 クリックで決める。値の持ち主は上の select のまま。
        window.MA.tailKindChips.mount('seq-tail-kind');
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
          // BLK-junior-20260907-2203: 選んだ行の当事者を憶えておき、選択を外して
          // 「末尾に追加」を開いたときの From / To の初期値にする。
          if (window.MA.selectedEndpoints) window.MA.selectedEndpoints.remember(mm);
          var partOpts2 = participants.map(function(p) { return { value: p.id, label: p.label }; });
          var fromOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.from }; });
          var toOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.to }; });
          // design 2d: 図の外が相手のときは、その旨を From/To にも出す
          // (選択肢に無いと select が先頭の参加者を指してしまう)。
          if (mm.from === '[') fromOpts.unshift({ value: '[', label: '（図の外）', selected: true });
          if (mm.to === ']') toOpts.unshift({ value: ']', label: '（図の外）', selected: true });
          // userissue v1.2.7: 既存ラベルから <<stereotype>> 部を分離して個別フィールドへ。
          var msgParts = extractStereotype(mm.label);
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(mm.from + ' ' + mm.arrow + ' ' + mm.to) + '</strong><br><span style="color:var(--text-secondary);">Message · L' + mm.line + '</span></div>' +
            // design 1a: From ⇄ To を横並びにし、間の ⇄ で 1 クリック入替。
            '<div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:8px;">' +
              '<div style="flex:1;min-width:0;">' + P.selectFieldHtml('From', 'seq-edit-from', fromOpts) + '</div>' +
              '<button type="button" id="seq-edit-swap" title="From と To を入れ替える" ' +
                'style="flex:0 0 28px;height:24px;margin-bottom:8px;background:var(--bg-tertiary);border:1px solid var(--border);' +
                'color:var(--text-primary);border-radius:3px;font-size:12px;cursor:pointer;">⇄</button>' +
              '<div style="flex:1;min-width:0;">' + P.selectFieldHtml('To', 'seq-edit-to', toOpts) + '</div>' +
            '</div>' +
            // design 2d: よく使う 4 種は常時、残りは「その他の矢印… ▾」のパレットに。
            P.arrowPickerHtml('矢印の種類 / Arrow', 'seq-edit-arrow',
              quickArrowOptions(), otherArrowOptions(),
              activeArrowKey(mm.from, mm.to, stripArrowColor(mm.arrow))) +
            // design 5d: 線色。矢印の形はそのままに色だけ差し替える。
            lineColorRowHtml('seq-edit-color', arrowColor(mm.arrow), arrowSupportsColor(mm.arrow)) +
            '<div style="margin-bottom:8px;">' +
              '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Stereotype <span style="color:#32CD32;">&lt;&lt; &gt;&gt;</span> <span style="color:var(--text-secondary);font-weight:normal;">(任意・上段にライムグリーンで表示)</span></label>' +
              '<input id="seq-edit-stereotype" type="text" value="' + escHtml(msgParts.stereotype) + '" placeholder="例: async / sync / important" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
            '</div>' +
            '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-edit-msg-label-rle"></div></div>' +
            actionBarHtml(mm.line, 'message');
          var mln = mm.line;
          var swapBtn = document.getElementById('seq-edit-swap');
          if (swapBtn) {
            swapBtn.addEventListener('click', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(swapMessageEnds(ctx.getMmdText(), mln));
              ctx.onUpdate();
            });
          }
          // design 2d: 分節ボタンもパレットも押した瞬間に確定する。
          // パレットの行は矢印だけでなく相手 (図の外) も変えるので applyArrowSpec を通す。
          // design 5d: 色見本を押した時点で確定する (他図種の「その他の設定」と同じ)。
          var mColorBtns = propsEl.querySelectorAll('.seq-edit-color-swatch');
          for (var ci = 0; ci < mColorBtns.length; ci++) {
            (function(b) {
              b.addEventListener('click', function() {
                window.MA.history.pushHistory();
                ctx.setMmdText(setMessageColor(ctx.getMmdText(), mln, b.getAttribute('data-color')));
                ctx.onUpdate();
              });
            })(mColorBtns[ci]);
          }
          P.bindArrowPicker('seq-edit-arrow', function(v) {
            window.MA.history.pushHistory();
            ctx.setMmdText(applyArrowSpec(ctx.getMmdText(), mln, v));
            ctx.onUpdate();
          });
          ['from', 'to'].forEach(function(f) {
            document.getElementById('seq-edit-' + f).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, f, this.value));
              ctx.onUpdate();
            });
          });
          // userissue v1.2.7: stereotype と本文を合成して 1 つの label として書き戻す。
          // どちらが変わっても extracted の他方を保持して再合成する。
          var _msgLabelPushed = false;
          var rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-edit-msg-label-rle'), msgParts.label, function(v) {
            if (!_msgLabelPushed) { window.MA.history.pushHistory(); _msgLabelPushed = true; }
            var stereo = (document.getElementById('seq-edit-stereotype') || { value: '' }).value;
            var combined = formatLabelWithStereotype(stereo, v);
            ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, 'label', combined));
            ctx.onUpdate();
          });
          var _stereoPushed = false;
          document.getElementById('seq-edit-stereotype').addEventListener('change', function() {
            if (!_stereoPushed) { window.MA.history.pushHistory(); _stereoPushed = true; }
            var plain = rleObj && rleObj.getValue ? rleObj.getValue() : msgParts.label;
            var combined = formatLabelWithStereotype(this.value, plain);
            ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, 'label', combined));
            ctx.onUpdate();
          });
        }
        else if (sel.type === 'participant') {
          var pp = null;
          for (var ii = 0; ii < participants.length; ii++) if (participants[ii].id === sel.id) { pp = participants[ii]; break; }
          if (!pp) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">参加者が見つかりません</p>'; return; }
          var pOpts2 = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === pp.ptype }; });
          // userissue v1.2.5: 設計ドキュメント向けに Material Design 100 シェード
          // ベースの 10 色パレットへ拡張。 ロール想起 (User=Blue / Service=Green
          // / DB=Teal / External=Orange / Critical=Red 等) を意図したセマンティック
          // 配色。 行頭から虹順 + 末尾に gray 系を並べる。
          var colorPalette = [
            { hex: '#FFCDD2', name: 'Red — エラー / 重要' },
            { hex: '#FFE0B2', name: 'Orange — 外部 / 3rd-party' },
            { hex: '#FFF9C4', name: 'Yellow — Note / Queue' },
            { hex: '#C8E6C9', name: 'Green — Service / 正常系' },
            { hex: '#B2DFDB', name: 'Teal — DB / Storage' },
            { hex: '#BBDEFB', name: 'Blue — User / 主役' },
            { hex: '#D1C4E9', name: 'Purple — 抽象 / 特殊' },
            { hex: '#F8BBD0', name: 'Pink — Test / Optional' },
            { hex: '#D7CCC8', name: 'Brown — Legacy / Deprecated' },
            { hex: '#CFD8DC', name: 'Grey — Infra / Util' },
          ];
          var colors = colorPalette.map(function(c) { return c.hex; });
          var colorTitle = {};
          colorPalette.forEach(function(c) { colorTitle[c.hex] = c.name; });
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
                var titleAttr = (colorTitle[c] || c) + ' (' + c + ')';
                return '<button class="seq-color-swatch" data-color="' + c + '" title="' + escHtml(titleAttr) + '" style="width:22px;height:22px;background:' + c + ';border:2px solid var(--bg-secondary);border-radius:4px;cursor:pointer;' + selStyle + '"></button>';
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
            var rawNewAlias = this.value;
            // Non-ASCII alias would break MSG_RE matching for any subsequent
            // message referencing this participant. Force ASCII alias and
            // promote the typed string to label via updateParticipant.
            var freshParsed = parseSequence(ctx.getMmdText());
            var renameNorm = window.MA.idNormalizer.normalize(rawNewAlias, _existingParticipantIdSet(freshParsed), 'P');
            var newAlias = renameNorm.valid ? renameNorm.id : rawNewAlias;
            var promotedLabel = (renameNorm.valid && renameNorm.id !== renameNorm.label) ? renameNorm.label : null;
            var oldAlias = pp.id;
            window.MA.history.pushHistory();
            var t = ctx.getMmdText();
            if (document.getElementById('seq-edit-rename-refs').checked && oldAlias !== newAlias) {
              t = renameWithRefs(t, oldAlias, newAlias);
            } else {
              t = updateParticipant(t, ln, 'alias', newAlias);
            }
            if (promotedLabel != null) {
              t = updateParticipant(t, ln, 'label', promotedLabel);
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
        else if (sel.type === 'lifeline') {
          // userissue v1.2.3: lifeline 選択 = 対象 participant の activation を編集する
          // 専用パネル。 head/tail とは独立した selection type で highlight も
          // lifeline rect だけにかかる。
          // userissue v1.2.6: activation を 1 行ずつ選択削除できるよう、 lifeline
          // パネル内に個別 ✕ 付きリストを追加。 PlantUML SVG では activation バーに
          // class が付かず click overlay を貼れないため、 panel UI で代替する。
          var lpp = null;
          for (var lii = 0; lii < participants.length; lii++) if (participants[lii].id === sel.id) { lpp = participants[lii]; break; }
          if (!lpp) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">参加者が見つかりません</p>'; return; }
          var lifelineActs = activations.filter(function(a) { return a.target === lpp.id; })
            .slice().sort(function(a, b) { return (a.line || 0) - (b.line || 0); });
          var actCount = lifelineActs.length;
          var listHtml = '';
          if (actCount === 0) {
            listHtml = '<div style="padding:8px;text-align:center;color:var(--text-secondary);font-size:11px;">' +
              '(この participant に紐付く activation 行はありません)</div>';
          } else {
            listHtml = lifelineActs.map(function(a) {
              return '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:2px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:3px;font-size:11px;">' +
                '<span style="color:var(--text-secondary);min-width:36px;font-family:var(--font-mono);">L' + a.line + '</span>' +
                '<span style="flex:1;color:var(--text-primary);"><strong>' + escHtml(a.action) + '</strong> ' + escHtml(a.target) + '</span>' +
                '<button class="seq-lifeline-delete-one" data-line="' + a.line + '" data-action="' + escHtml(a.action) + '" title="この行のみ削除" style="flex:0 0 auto;background:var(--accent-red);color:#fff;border:none;padding:3px 8px;border-radius:3px;font-size:11px;cursor:pointer;">✕</button>' +
              '</div>';
            }).join('');
          }
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(lpp.label) + ' のライフライン</strong><br><span style="color:var(--text-secondary);">Lifeline · participant ' + escHtml(lpp.id) + '</span></div>' +
            '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:6px;">' +
              '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">activate / deactivate / create / destroy 行 (' + actCount + ' 件)</label>' +
              listHtml +
            '</div>' +
            '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
              '<button id="seq-lifeline-delete-acts" style="width:100%;background:' + (actCount > 0 ? 'var(--accent-red)' : 'var(--bg-tertiary)') + ';color:#fff;border:' + (actCount > 0 ? 'none' : '1px solid var(--border)') + ';padding:6px;border-radius:4px;font-size:11px;cursor:' + (actCount > 0 ? 'pointer' : 'not-allowed') + ';"' + (actCount === 0 ? ' disabled' : '') + '>✕ ' + escHtml(lpp.label) + ' の activation を全削除 (' + actCount + ' 件)</button>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--text-secondary);margin-top:6px;">participant 宣言行を消したい場合は actor の頭をクリックしてください。</div>';
          var lid = lpp.id;
          // 個別 ✕ — 行ごと削除。 削除後は line 番号がシフトするので selection を
          // クリアし render に refresh を委譲。
          P.bindAllByClass(propsEl, 'seq-lifeline-delete-one', function(btn) {
            var ln = parseInt(btn.getAttribute('data-line'), 10);
            if (isNaN(ln)) return;
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteLine(ctx.getMmdText(), ln));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
          // 全削除はそのまま維持
          P.bindEvent('seq-lifeline-delete-acts', 'click', function() {
            if (actCount === 0) return;
            if (!confirm(lpp.label + ' の activate/deactivate/create/destroy 行を ' + actCount + ' 件削除します。 続行しますか?')) return;
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteActivationsFor(ctx.getMmdText(), lid));
            window.MA.selection.clearSelection();
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
        else if (sel.type === 'group') {
          // Feature #8: group block 選択 → gtype/label 編集 + else 追加 + 削除
          var gg = null;
          for (var gk = 0; gk < groups.length; gk++) {
            if (groups[gk].id === sel.id || groups[gk].line === sel.line) { gg = groups[gk]; break; }
          }
          if (!gg) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">ブロックが見つかりません</p>'; return; }
          var gtypeOpts = GROUP_KINDS.map(function(k) { return { value: k, label: groupLabel(k), selected: k === gg.gtype }; });
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(gg.gtype + (gg.label ? ' ' + gg.label : '')) + '</strong><br><span style="color:var(--text-secondary);">Block · L' + gg.line + (gg.endLine ? '–L' + gg.endLine : '') + '</span></div>' +
            P.selectFieldHtml('Type', 'seq-edit-gtype', gtypeOpts) +
            P.fieldHtml('Label/Condition', 'seq-edit-glabel', gg.label || '') +
            '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
              '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">else 追加 (alt/critical)</label>' +
              '<input id="seq-edit-else-cond" type="text" placeholder="else の条件 (省略可)" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;margin-bottom:4px;box-sizing:border-box;">' +
              '<button id="seq-edit-add-else" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">+ else 行を追加</button>' +
            '</div>' +
            '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;display:flex;gap:4px;">' +
              '<button id="seq-edit-group-delete" style="flex:1;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除 (中身保持)</button>' +
            '</div>';
          var gLine = gg.line;
          var gEnd = gg.endLine;
          document.getElementById('seq-edit-gtype').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateGroup(ctx.getMmdText(), gLine, 'gtype', this.value));
            ctx.onUpdate();
          });
          document.getElementById('seq-edit-glabel').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateGroup(ctx.getMmdText(), gLine, 'label', this.value));
            ctx.onUpdate();
          });
          document.getElementById('seq-edit-add-else').addEventListener('click', function() {
            if (!gEnd) { alert('対応する end 行を検出できません'); return; }
            var cond = document.getElementById('seq-edit-else-cond').value;
            window.MA.history.pushHistory();
            ctx.setMmdText(insertElseIntoGroup(ctx.getMmdText(), gLine, gEnd, cond));
            ctx.onUpdate();
          });
          document.getElementById('seq-edit-group-delete').addEventListener('click', function() {
            // FEAT-015: 削除の確認ダイアログを廃し、削除後の「元に戻す」トーストで代替する。
            // FEAT-104: 削除直前のテキストを捕捉し、トーストの復元先として渡す。
            var _snap = ctx.getMmdText();
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteGroup(ctx.getMmdText(), gLine, gEnd || gLine + 1));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
            _toastUndo('ブロックの開始行と end 行を削除しました (中身は保持)', _snap, ctx);
          });
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
              return '<button class="seq-bulk-wrap" data-kind="' + k + '" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">⌗ ' + groupLabel(k) + ' で囲む</button>';
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
          // FEAT-015: 削除の確認ダイアログを廃し、削除後の「元に戻す」トーストで代替する。
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          // FEAT-104: 削除直前のテキストを捕捉し、トーストの復元先として渡す。
          var _snap = ctx.getMmdText();
          window.MA.history.pushHistory();
          var lines = ctx.getMmdText().split('\n');
          var removed = e - s + 1;
          lines.splice(s - 1, removed);
          ctx.setMmdText(lines.join('\n'));
          window.MA.selection.clearSelection();
          ctx.onUpdate();
          _toastUndo(removed + ' 件削除しました', _snap, ctx);
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
