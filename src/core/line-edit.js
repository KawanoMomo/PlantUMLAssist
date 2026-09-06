'use strict';
window.MA = window.MA || {};

// line-edit — 1 枚の図の中の「特定の 1 行」だけを対象に書換・挿入・削除する。
//
// 一括置換 (bulk-rename) は識別子を図をまたいで一斉に直すためのもので、
// 「この図のこのメッセージ名だけ」「3 本目と 4 本目の間に 1 本」といった
// 単一図の部分編集には使えない。エディタで直そうとすると全選択して図全体を
// 打ち直すことになり、1 語の修正でも手数が図のテキスト量に比例して増える。
//
// ここでは DSL を行の列として扱い、行番号 (0 始まり) を指定して 1 行だけを
// 差し替える純関数を置く。DOM には触らない。
window.MA.lineEdit = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 行末の '\r' (CRLF) を落とした表示用テキスト。
  function _strip(line) {
    return line.charAt(line.length - 1) === '\r' ? line.slice(0, -1) : line;
  }

  // 元の行が CRLF なら書き戻すときも CRLF に揃える (改行コードを混ぜない)。
  function _cr(line) {
    return line.charAt(line.length - 1) === '\r' ? '\r' : '';
  }

  function _split(dsl) {
    return _s(dsl).split('\n');
  }

  // 行の性格。一覧の見出しと絞り込みに使う。
  // arrow: メッセージ・遷移・関連 (ラベルを直したい行はほぼこれ)
  // decl : participant / class / state などの宣言
  // block: alt / loop / opt / group / else / end などの構造行
  // meta : @startuml / skinparam / title など図全体の設定
  // note : ノート
  var DECL_RE = /^(?:abstract\s+class|participant|actor|boundary|control|entity|database|collections|queue|class|interface|enum|struct|state|component|node|package|folder|rectangle|usecase)\b/i;
  var BLOCK_RE = /^(?:alt|else|opt|loop|par|group|critical|break|end|activate|deactivate|if|elseif|endif|fork|split|while|endwhile|repeat)\b/i;
  var META_RE = /^(?:@start|@end|!|skinparam|title\b|header\b|footer\b|hide\b|show\b|scale\b|left to right\b|top to bottom\b|autonumber\b)/i;
  var NOTE_RE = /^(?:note|end note|legend|endlegend)\b/i;
  var ARROW_RE = /(?:-{1,}\s*>{1,}|<{1,}\s*-{1,}|\.{2,}\s*>|<\s*\.{2,}|-{2,}|\.{2,})/;

  function kindOf(text) {
    var t = _s(text).trim();
    if (!t) return 'blank';
    if (t.charAt(0) === "'" || t.slice(0, 2) === '/*') return 'comment';
    if (META_RE.test(t)) return 'meta';
    if (NOTE_RE.test(t)) return 'note';
    if (DECL_RE.test(t)) return 'decl';
    if (BLOCK_RE.test(t)) return 'block';
    if (ARROW_RE.test(t)) return 'arrow';
    return 'other';
  }

  // 一覧に出す行。空行・コメント・@startuml などの meta は編集対象として
  // 意味が薄いので既定では落とす (opts.all で全部出せる)。
  // index は元の DSL 上の行番号なので、絞り込んでも書換先はずれない。
  function entries(dsl, opts) {
    var all = !!(opts && opts.all);
    var out = [];
    _split(dsl).forEach(function(raw, i) {
      var text = _strip(raw);
      var kind = kindOf(text);
      if (!all && (kind === 'blank' || kind === 'comment' || kind === 'meta')) return;
      out.push({ index: i, text: text, kind: kind });
    });
    return out;
  }

  // 絞り込み。大小を無視した部分一致。query が空なら素通し。
  function filter(list, query) {
    var q = _s(query).trim().toLowerCase();
    if (!q) return (list || []).slice();
    return (list || []).filter(function(e) {
      return e && _s(e.text).toLowerCase().indexOf(q) >= 0;
    });
  }

  function _validIndex(lines, index) {
    return typeof index === 'number' && isFinite(index) &&
      Math.floor(index) === index && index >= 0 && index < lines.length;
  }

  // 元の行の字下げ。alt の中のメッセージを直しても崩れないようにする。
  function indentOf(text) {
    var m = _s(text).match(/^[ \t]*/);
    return m ? m[0] : '';
  }

  // index の行を text へ差し替える。text が字下げを持たなければ元の字下げを継ぐ。
  // 不正な index や text が非文字列なら元の DSL をそのまま返す (呼び出し側で
  // 分岐を書かなくて済むように throw しない)。
  function replaceLine(dsl, index, text) {
    var lines = _split(dsl);
    if (!_validIndex(lines, index) || typeof text !== 'string') return _s(dsl);
    var body = text.replace(/[\r\n]+/g, ' ').replace(/\s+$/, '');
    if (!body.trim()) return _s(dsl);
    var next = /^[ \t]/.test(body) ? body : indentOf(_strip(lines[index])) + body.replace(/^\s+/, '');
    lines[index] = next + _cr(lines[index]);
    return lines.join('\n');
  }

  // index の行の直後 (before=true なら直前) に 1 行入れる。字下げは index の行に合わせる。
  function _insert(dsl, index, text, before) {
    var lines = _split(dsl);
    if (!_validIndex(lines, index) || typeof text !== 'string') return _s(dsl);
    var body = text.replace(/[\r\n]+/g, ' ').replace(/\s+$/, '');
    if (!body.trim()) return _s(dsl);
    var line = /^[ \t]/.test(body) ? body : indentOf(_strip(lines[index])) + body.replace(/^\s+/, '');
    lines.splice(before ? index : index + 1, 0, line + _cr(lines[index]));
    return lines.join('\n');
  }

  function insertAfter(dsl, index, text) { return _insert(dsl, index, text, false); }
  function insertBefore(dsl, index, text) { return _insert(dsl, index, text, true); }

  // index の行を delta 行だけ上下に動かす。既にある 2 行の順序を入れ替えるのに
  // 「削除して末尾に足し直す」しか無いと、途中に戻す手が無く全文を打ち直すことに
  // なるため、隣の行との入れ替えとして 1 手で扱えるようにする。
  // 端を越える移動と不正な index は何もしない (元の DSL と index をそのまま返す)。
  function moveLine(dsl, index, delta) {
    var lines = _split(dsl);
    var d = typeof delta === 'number' && isFinite(delta) ? Math.round(delta) : 0;
    var to = index + d;
    if (!_validIndex(lines, index) || d === 0 || !_validIndex(lines, to)) {
      return { text: _s(dsl), index: index };
    }
    // 動かす行と、その行が入る先の字下げをそろえる。alt ブロックの内と外を
    // またいで動かしたときに字下げだけが取り残されないようにする。
    // 改行コードは行ではなく位置に付いている (最終行だけ CR が無いなど) ので、
    // 並べ替えたあとに元の位置の CR を貼り直す。
    var crs = lines.map(_cr);
    var moving = _strip(lines[index]);
    var target = _strip(lines[to]);
    var body = moving.replace(/^[ \t]*/, '');
    lines.splice(index, 1);
    lines.splice(to, 0, indentOf(target) + body);
    return {
      text: lines.map(function(l, i) { return _strip(l) + crs[i]; }).join('\n'),
      index: to,
    };
  }

  function removeLine(dsl, index) {
    var lines = _split(dsl);
    if (!_validIndex(lines, index)) return _s(dsl);
    lines.splice(index, 1);
    return lines.join('\n');
  }

  // 一覧の 1 行に出す短い見出し。長い行は途中で切る。
  function summarize(text, max) {
    var t = _s(text).trim();
    var n = typeof max === 'number' && max > 3 ? max : 48;
    return t.length <= n ? t : t.slice(0, n - 1) + '…';
  }

  return {
    kindOf: kindOf,
    entries: entries,
    filter: filter,
    indentOf: indentOf,
    replaceLine: replaceLine,
    insertAfter: insertAfter,
    insertBefore: insertBefore,
    moveLine: moveLine,
    removeLine: removeLine,
    summarize: summarize,
  };
})();
