'use strict';
window.MA = window.MA || {};

// note-block — `note left of X : ...` と `note left of X` … `end note` を
// 読み書きする純関数。図種に依存しない。
//
// BLK-builder-20260907-1358-1 (design 5d): UseCase の「その他パレット」に
// ノートが挙がっているのに、src/modules/usecase.js には note の語が 1 つも無く、
// ユースケース図に注釈を付ける手段が GUI に無かった。
// 注釈の書式は図種で変わらないので、図種ごとに書き分ける理由がない。
//
// class.js は同じ処理を自前で持っている (クラス本体 `{ ... }` の内側かどうかで
// 扱いが変わるため、パーサがクラスの状態と絡んでいる)。そちらの移植はこの
// 課題の範囲外なので、ここでは「クラス本体のような入れ子を持たない図種」が
// 使う入口として置く。
window.MA.noteBlock = (function() {

  var POSITIONS = ['left', 'right', 'top', 'bottom'];

  // `note left of X : text` の 1 行形。
  var INLINE_RE = /^note\s+(left|right|top|bottom)\s+of\s+([A-Za-z0-9_][A-Za-z0-9_.-]*|"[^"]+")\s*:\s*(.*)$/i;
  // `note left of X` (次行から本文、`end note` で閉じる)。
  var BLOCK_OPEN_RE = /^note\s+(left|right|top|bottom)\s+of\s+([A-Za-z0-9_][A-Za-z0-9_.-]*|"[^"]+")\s*$/i;
  var BLOCK_END_RE = /^end\s+note\s*$/i;

  function _s(v) { return v == null ? '' : String(v); }

  function normalizePosition(p) {
    var v = _s(p).toLowerCase();
    return POSITIONS.indexOf(v) >= 0 ? v : 'left';
  }

  // 本文に改行があればブロック形、無ければ 1 行形。1 行形で書ける注釈を
  // わざわざ 3 行にしないのは、DSL を読む側の行数を増やさないため。
  function format(position, targetId, text) {
    var pos = normalizePosition(position);
    var body = _s(text);
    var head = 'note ' + pos + ' of ' + _s(targetId);
    if (body.indexOf('\n') < 0) return [head + ' : ' + body];
    return [head].concat(body.split('\n')).concat(['end note']);
  }

  // 1 行を見て、注釈の始まりならその形を返す。呼ぶ側は行を跨ぐ状態
  // (openNote) を自分で持つ。
  function matchOpen(trimmedLine) {
    var line = _s(trimmedLine);
    var m = line.match(INLINE_RE);
    if (m) {
      return { block: false, position: m[1].toLowerCase(), targetId: _unq(m[2]), text: m[3] };
    }
    m = line.match(BLOCK_OPEN_RE);
    if (m) {
      return { block: true, position: m[1].toLowerCase(), targetId: _unq(m[2]), text: '' };
    }
    return null;
  }

  function isEnd(trimmedLine) {
    return BLOCK_END_RE.test(_s(trimmedLine));
  }

  function _unq(s) {
    var v = _s(s);
    return (v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') ? v.slice(1, -1) : v;
  }

  // DSL 全体から注釈を拾う。id は出現順 (`__n_0`)。
  // 閉じられていないブロックは、そこまでを 1 件として拾う (書きかけの図でも
  // 注釈が一覧から消えない)。
  function collect(text) {
    var lines = window.MA.dslUtils.splitLines(text);
    var out = [];
    var open = null;
    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (open) {
        if (isEnd(trimmed)) {
          open.note.text = open.body.join('\n');
          open.note.endLine = lineNum;
          out.push(open.note);
          open = null;
        } else {
          open.body.push(lines[i].replace(/^ {2}/, ''));
        }
        continue;
      }
      var m = matchOpen(trimmed);
      if (!m) continue;
      var note = {
        kind: 'note', id: '__n_' + out.length,
        position: m.position, targetId: m.targetId, text: m.text,
        line: lineNum, endLine: lineNum,
      };
      if (!m.block) { out.push(note); continue; }
      open = { note: note, body: [] };
    }
    if (open) {
      // 末尾の空行は本文ではなく「ファイル末の改行」なので落とす。
      while (open.body.length && open.body[open.body.length - 1].trim() === '') open.body.pop();
      open.note.text = open.body.join('\n');
      open.note.endLine = lines.length;
      out.push(open.note);
    }
    return out;
  }

  // 既存の注釈を position / text だけ差し替える。target は動かさない
  // (付け替えは「別の注釈」なので、消して足す操作にする)。
  function update(text, startLine, endLine, fields) {
    var lines = window.MA.dslUtils.splitLines(text);
    var startIdx = startLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;
    var cur = matchOpen(lines[startIdx].trim());
    if (!cur) return text;
    var f = fields || {};
    var body = f.text != null ? f.text : _bodyOf(lines, startIdx, endLine - 1, cur);
    var replacement = format(
      f.position != null ? f.position : cur.position,
      cur.targetId,
      body
    );
    var tail = lines.slice(Math.max(endLine, startLine));
    return lines.slice(0, startIdx).concat(replacement, tail).join('\n');
  }

  function _bodyOf(lines, startIdx, endIdx, cur) {
    if (!cur.block) return cur.text;
    var body = [];
    for (var k = startIdx + 1; k < endIdx; k++) body.push(lines[k].replace(/^ {2}/, ''));
    return body.join('\n');
  }

  function remove(text, startLine, endLine) {
    var lines = window.MA.dslUtils.splitLines(text);
    var startIdx = startLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;
    return lines.slice(0, startIdx).concat(lines.slice(Math.max(endLine, startLine))).join('\n');
  }

  return {
    POSITIONS: POSITIONS,
    normalizePosition: normalizePosition,
    format: format,
    matchOpen: matchOpen,
    isEnd: isEnd,
    collect: collect,
    update: update,
    remove: remove,
  };
})();
