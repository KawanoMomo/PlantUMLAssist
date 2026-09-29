'use strict';
window.MA = window.MA || {};

// note-edit — 置いた注釈の「位置・対象・上下の順」を GUI から変えるための純関数。
//
// BLK-human-20260916-0900: note を置いたあとプレビューで選んでも、文章しか直せず
// 場所 (left of / right of / over と対象参加者) を動かせなかった。複数行の
// `note ... end note`・`hnote`/`rnote`・色付き note はシーケンス図のパーサが
// 拾っておらず、選ぶことすらできなかった。
//
// 図種ごとに違うのは「取り得る位置」だけなので、行の読み書きと上下移動はここに寄せる。
window.MA.noteEdit = (function() {

  // ---- シーケンス図の注釈 ----
  var SEQ_POSITIONS = ['left of', 'right of', 'over'];
  // `note|hnote|rnote  位置  対象[, 対象]  [#色]  [: 本文]`
  var SEQ_HEAD_RE = /^(note|hnote|rnote)\s+(left of|right of|over)\s+(.+?)\s*(#[0-9A-Za-z]+)?\s*(?::\s*(.*))?$/i;
  var SEQ_END_RE = /^end\s*(note|hnote|rnote)\s*$/i;
  // BLK-migrator-20260923-1409: 直前のメッセージに付ける注釈 (`note right` / `note left : 本文`)。
  // 対象の参加者を書かない。実物の図 (AWS の構成図など) はこの形を多く使い、読めないと
  // 注釈の枠が出ない。`left of X` とは `of` の有無で見分ける。
  var SEQ_ATTACHED_RE = /^(note|hnote|rnote)\s+(left|right)\s*(#[0-9A-Za-z]+)?\s*(?::\s*(.*))?$/i;
  // BLK-migrator-20260929-0459: 全参加者にまたがる注釈 (`note across : 本文` / `hnote across #色` … `end note`)。
  // 対象の参加者を書かない。読めないと注釈の要素が作られず、描かれた紙に枠が出なかった。
  // 位置 `across` は読んだまま保ち、本文・色を直しても書き換えない (位置の選択肢には足さない)。
  var SEQ_ACROSS_RE = /^(note|hnote|rnote)\s+across\b\s*(#[0-9A-Za-z]+)?\s*(?::\s*(.*))?$/i;

  function _s(v) { return v == null ? '' : String(v); }

  function splitTargets(s) {
    return _s(s).split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  }

  // 位置ごとに対象の数を揃える。left of / right of は 1 参加者だけ、over は 1 つ以上。
  function normalizeTargets(position, targets) {
    var list = Array.isArray(targets) ? targets.slice() : splitTargets(targets);
    list = list.map(function(t) { return _s(t).trim(); }).filter(Boolean);
    var seen = {};
    list = list.filter(function(t) { if (seen[t]) return false; seen[t] = true; return true; });
    if (String(position).toLowerCase() !== 'over' && list.length > 1) list = list.slice(0, 1);
    return list;
  }

  // 1 行を見て注釈の頭なら形を返す。block=true は本文が次行から `end note` まで続く形。
  function matchSeqHead(trimmed) {
    var m = _s(trimmed).match(SEQ_HEAD_RE);
    var ac = m ? null : _s(trimmed).match(SEQ_ACROSS_RE);
    if (ac) {
      return {
        shape: ac[1].toLowerCase(),
        position: 'across',
        targets: [],
        color: ac[2] || '',
        text: ac[3] !== undefined ? ac[3].trim() : '',
        block: ac[3] === undefined,
        across: true,
      };
    }
    if (!m) {
      var a = _s(trimmed).match(SEQ_ATTACHED_RE);
      if (!a) return null;
      return {
        shape: a[1].toLowerCase(),
        position: a[2].toLowerCase(),
        targets: [],
        color: a[3] || '',
        text: a[4] !== undefined ? a[4].trim() : '',
        block: a[4] === undefined,
        attached: true,
      };
    }
    var hasColon = m[5] !== undefined;
    return {
      shape: m[1].toLowerCase(),
      position: m[2].toLowerCase(),
      targets: splitTargets(m[3]),
      color: m[4] || '',
      text: hasColon ? m[5].trim() : '',
      block: !hasColon,
    };
  }

  function isSeqEnd(trimmed) { return SEQ_END_RE.test(_s(trimmed)); }

  // lines (配列) の idx から注釈 1 件を読む。無ければ null。endIdx は最後の行 (0 始まり)。
  function readSeqNote(lines, idx) {
    var head = matchSeqHead((lines[idx] || '').trim());
    if (!head) return null;
    head.startIdx = idx;
    head.endIdx = idx;
    if (head.block) {
      var body = [];
      var j = idx + 1;
      for (; j < lines.length; j++) {
        if (isSeqEnd(lines[j].trim())) break;
        body.push(lines[j].trim());
      }
      // 閉じていない書きかけは、末尾までを本文とせず頭の 1 行だけの注釈として扱う
      // (後続のメッセージ行を本文として飲み込まない)。
      if (j >= lines.length) { head.block = false; }
      else { head.endIdx = j; head.text = body.join('\n'); }
    }
    return head;
  }

  // 注釈を行の配列で書く。本文に改行があればブロック形、無ければ 1 行形。
  function formatSeqNote(note, indent) {
    var ind = _s(indent);
    var shape = (note.shape || 'note').toLowerCase();
    var text0 = _s(note.text);
    var acrossHead = note.position === 'across';
    if (acrossHead || (note.attached && (note.position === 'left' || note.position === 'right'))) {
      var ahead = shape + ' ' + note.position + (note.color ? ' ' + note.color : '');
      if (text0.indexOf('\n') < 0 && text0) return [ind + ahead + ' : ' + text0];
      return [ind + ahead].concat(text0.split('\n').map(function(l) { return ind + '  ' + l; })).concat([ind + 'end ' + shape]);
    }
    var pos = SEQ_POSITIONS.indexOf(_s(note.position).toLowerCase()) >= 0 ? _s(note.position).toLowerCase() : 'over';
    var targets = normalizeTargets(pos, note.targets);
    var head = shape + ' ' + pos + ' ' + targets.join(', ') + (note.color ? ' ' + note.color : '');
    var text = _s(note.text);
    if (text.indexOf('\n') < 0) return [ind + head + (text ? ' : ' + text : '')];
    var inner = ind + '  ';
    return [ind + head].concat(text.split('\n').map(function(l) { return inner + l; })).concat([ind + 'end ' + shape]);
  }

  // lineNum (1 始まり) の注釈の field を変える。field: position / targets / text / color。
  // position を left/right に変えたとき対象が複数なら先頭 1 つに寄せる。
  function updateSeqNote(text, lineNum, field, value) {
    var lines = _s(text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var note = readSeqNote(lines, idx);
    if (!note) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    if (field === 'position') {
      var np = _s(value).toLowerCase();
      // メッセージに付いた注釈を参加者の横・上に移すには対象が要る。無ければ変えない。
      if (note.attached && np !== 'left' && np !== 'right') {
        if (!note.targets.length) return text;
        note.attached = false;
      }
      // 全参加者にまたがる注釈を参加者の横・上に移すにも対象が要る。
      if (note.position === 'across' && np !== 'across' && !note.targets.length) return text;
      note.position = np;
    }
    else if (field === 'targets') {
      if (note.attached) { note.attached = false; note.position = note.position + ' of'; }
      // 対象を選んだら、その参加者の上の注釈にする (across は対象を持てない)。
      if (note.position === 'across') note.position = 'over';
      var t = normalizeTargets(note.position, value);
      if (!t.length) return text;
      note.targets = t;
    }
    else if (field === 'text') note.text = _s(value);
    else if (field === 'color') note.color = _s(value);
    else return text;
    var out = formatSeqNote(note, indent);
    return lines.slice(0, idx).concat(out).concat(lines.slice(note.endIdx + 1)).join('\n');
  }

  // ---- 上下の順 (図種共通) ----
  // startLine..endLine (1 始まり、両端含む) の塊を、上 (-1) / 下 (+1) の隣の「文」と入れ替える。
  // 空行・`@startuml`/`@enduml` は越えない。隣が別の注釈ブロック (`end note` で閉じる形) なら
  // その塊ごと越える。動かせなければ null。返り値は { text, line } (移動後の開始行)。
  var FENCE_RE = /^@(start|end)\w*/i;
  var ANY_END_NOTE_RE = /^end\s*(note|hnote|rnote)\s*$/i;
  var ANY_NOTE_OPEN_RE = /^(note|hnote|rnote)\b(?!.*:)/i;

  function _neighbour(lines, startIdx, endIdx, dir) {
    var i = dir < 0 ? startIdx - 1 : endIdx + 1;
    while (i >= 0 && i < lines.length && lines[i].trim() === '') i += dir;
    if (i < 0 || i >= lines.length) return null;
    var t = lines[i].trim();
    if (FENCE_RE.test(t)) return null;
    if (dir < 0 && ANY_END_NOTE_RE.test(t)) {
      for (var k = i - 1; k >= 0; k--) {
        var tk = lines[k].trim();
        if (FENCE_RE.test(tk)) return null;
        if (ANY_NOTE_OPEN_RE.test(tk)) return { from: k, to: i };
      }
      return null;
    }
    if (dir > 0 && ANY_NOTE_OPEN_RE.test(t)) {
      for (var j = i + 1; j < lines.length; j++) {
        var tj = lines[j].trim();
        if (ANY_END_NOTE_RE.test(tj)) return { from: i, to: j };
        if (FENCE_RE.test(tj)) break;
      }
    }
    return { from: i, to: i };
  }

  function moveBlock(text, startLine, endLine, dir) {
    var lines = _s(text).split('\n');
    var s = startLine - 1, e = (endLine || startLine) - 1;
    if (s < 0 || e >= lines.length || e < s) return null;
    var nb = _neighbour(lines, s, e, dir < 0 ? -1 : 1);
    if (!nb) return null;
    var block = lines.slice(s, e + 1);
    var out, newStart;
    if (dir < 0) {
      var gapUp = lines.slice(nb.to + 1, s);
      out = lines.slice(0, nb.from).concat(block, gapUp, lines.slice(nb.from, nb.to + 1), lines.slice(e + 1));
      newStart = nb.from + 1;
    } else {
      var gapDown = lines.slice(e + 1, nb.from);
      var nbLines = lines.slice(nb.from, nb.to + 1);
      out = lines.slice(0, s).concat(nbLines, gapDown, block, lines.slice(nb.to + 1));
      newStart = s + nbLines.length + gapDown.length + 1;
    }
    return { text: out.join('\n'), line: newStart };
  }

  return {
    SEQ_POSITIONS: SEQ_POSITIONS,
    splitTargets: splitTargets,
    normalizeTargets: normalizeTargets,
    matchSeqHead: matchSeqHead,
    isSeqEnd: isSeqEnd,
    readSeqNote: readSeqNote,
    formatSeqNote: formatSeqNote,
    updateSeqNote: updateSeqNote,
    moveBlock: moveBlock,
  };
})();
