'use strict';
window.MA = window.MA || {};
window.MA.dslUtils = (function() {

  function unquote(s) {
    if (s == null) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  function quote(s) {
    if (s == null) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s;
    }
    return '"' + s + '"';
  }

  function escapeForRegex(s) {
    if (s == null) return s;
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isPlantumlComment(line) {
    if (line == null || line === '') return false;
    return line.replace(/^\s+/, '').indexOf("'") === 0;
  }

  // FEAT-080 (resolves UI 側 HFR-030): Ctrl+/ の行コメント トグルの純関数。
  // textarea の値と選択範囲を受け取り、キャレット行 (または選択がまたぐ全行) の
  // 行頭 PlantUML 行コメント記号 ' を付け外しした結果を返す。DOM に触れないので
  // 単体 (jsdom 不要) で境界を網羅できる。app.js の keydown ハンドラから呼ぶ。
  //  - 対象行が「すべて」コメント行のときのみ解除。1 行でも非コメント行があれば全行に付ける。
  //  - ブロックコメント /' ... '/ は扱わない (FEAT-080 の範囲外)。
  function toggleLineComment(value, selStart, selEnd) {
    if (typeof value !== 'string') return null;
    var s = Math.max(0, Math.min(selStart | 0, value.length));
    var e = Math.max(s, Math.min(selEnd | 0, value.length));
    var lineStart = value.lastIndexOf('\n', s - 1) + 1;
    var nl = value.indexOf('\n', e);
    var lineEnd = nl === -1 ? value.length : nl;
    var lines = value.substring(lineStart, lineEnd).split('\n');
    var uncomment = true;
    for (var i = 0; i < lines.length; i++) {
      if (!isPlantumlComment(lines[i])) { uncomment = false; break; }
    }
    var firstDelta = 0;
    var out = lines.map(function(line, idx) {
      var next;
      if (uncomment) {
        next = line.replace(/^(\s*)'/, '$1');
      } else {
        next = "'" + line;
      }
      if (idx === 0) firstDelta = next.length - line.length;
      return next;
    }).join('\n');
    var newValue = value.substring(0, lineStart) + out + value.substring(lineEnd);
    var caretOnly = (s === e);
    return {
      value: newValue,
      selectionStart: caretOnly ? Math.max(lineStart, s + firstDelta) : lineStart,
      selectionEnd: caretOnly ? Math.max(lineStart, s + firstDelta) : lineStart + out.length,
    };
  }

  return {
    unquote: unquote,
    quote: quote,
    escapeForRegex: escapeForRegex,
    isPlantumlComment: isPlantumlComment,
    toggleLineComment: toggleLineComment,
  };
})();
