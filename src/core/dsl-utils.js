'use strict';
window.MA = window.MA || {};
window.MA.dslUtils = (function() {

  // DSL を行に割る唯一の入口。改行は CRLF / CR / LF のどれでも来る
  // (Windows のエディタで保存した .puml、persona-data 配下の図はすべて CRLF)。
  // 素の split('\n') だと各行の末尾に CR が残り、`/...(.+)$/` のように
  // 行末を見る正規表現が一切マッチしなくなる (`.` は CR にマッチせず、
  // `$` は /m 無しでは文字列末尾しか指さない)。突合や構造一覧が「1 件も
  // 見つからない」=「問題なし」に化けて黙って通ってしまうので、
  // 行に割る側で改行を吸収する。
  function splitLines(text) {
    return String(text == null ? '' : text).split(/\r\n|\r|\n/);
  }

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

  // FEAT-187 (resolves UI-021): @startuml / @enduml の境界行かどうかを判定する。
  // 境界行をコメント化すると PlantUML が図として解釈できなくなり、Ctrl+/ が
  // 無警告で DSL を壊す (UI-021 Major)。大文字小文字は区別しない —
  // src/core/dsl-updater.js の /^\s*@startuml\b/i の先例に揃えた規約である。
  function isPlantumlBoundary(line) {
    if (typeof line !== 'string') return false;
    return /^\s*@(startuml|enduml)\b/i.test(line);
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
      // FEAT-187: 境界行は判定母集団から外す。数えると「全行コメント」が
      // 境界行の存在で恒常的に偽になり、既存の解除動作が壊れる。
      if (isPlantumlBoundary(lines[i])) continue;
      if (!isPlantumlComment(lines[i])) { uncomment = false; break; }
    }
    var firstDelta = 0;
    var out = lines.map(function(line, idx) {
      var next;
      // FEAT-187: 境界行はコメント化も解除もせず素通しする。
      if (isPlantumlBoundary(line)) {
        next = line;
      } else if (uncomment) {
        next = line.replace(/^(\s*)'/, '$1');
      } else {
        // FEAT-132 (resolves UI-015): コメント化側を行ごとの判定にする。
        // 既にコメント行である行へ ' を重ねると "' foo" が "'' foo" になり、
        // ユーザーが手で書いたコメントを無警告で改変してしまう (UI-015 Major)。
        next = isPlantumlComment(line) ? line : "'" + line;
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
    splitLines: splitLines,
    unquote: unquote,
    quote: quote,
    escapeForRegex: escapeForRegex,
    isPlantumlComment: isPlantumlComment,
    isPlantumlBoundary: isPlantumlBoundary,
    toggleLineComment: toggleLineComment,
  };
})();
