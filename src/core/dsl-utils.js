'use strict';
window.MA = window.MA || {};
window.MA.dslUtils = (function() {

  // DSL を行に割る唯一の入口。改行は CRLF / CR / LF のどれでも来る
  // (Windows のエディタで保存した .puml、作業フォルダ 配下の図はすべて CRLF)。
  // 素の split('\n') だと各行の末尾に CR が残り、`/...(.+)$/` のように
  // 行末を見る正規表現が一切マッチしなくなる (`.` は CR にマッチせず、
  // `$` は /m 無しでは文字列末尾しか指さない)。突合や構造一覧が「1 件も
  // 見つからない」=「問題なし」に化けて黙って通ってしまうので、
  // 行に割る側で改行を吸収する。
  function splitLines(text) {
    return String(text == null ? '' : text).split(/\r\n|\r|\n/);
  }

  // 右パネルの 1 つの値を直して行を組み直したとき、名指ししていない部分の空白を元の行の字に戻す
  // (TICKET-owner-20261122-0720-1)。行の組み立て (fmtMessage / fmtTransition …) は語の間を空白 1 つで書くので、
  // 手で揃えた桁 (`Busy  --> Slow`)・詰めた書き方 (`A->B:x`) が値を直しただけで変わっていた。
  // orig と rebuilt の空白以外の字を最長共通部分列で突き合わせ、rebuilt の空白 1 つの隙間のうち
  // 両側の字が orig でも隣り合う (同じ 2 字の間) ものは orig の隙間の字 (幅 0 も) に置き換える。
  // protect に渡した字 (直した値) の中の隙間は触らない (値に打った空白は利用者のもの)。
  // 字下げは呼ぶ側が元の行のまま付けるので、ここは字下げの後ろ (trim した行) どうしで比べる。
  function keepSpacing(orig, rebuilt, protect) {
    orig = String(orig == null ? '' : orig);
    rebuilt = String(rebuilt == null ? '' : rebuilt);
    if (orig === rebuilt) return rebuilt;
    var oc = [], rc = [];   // { ch, pos }
    var i, j;
    for (i = 0; i < orig.length; i++) if (!/\s/.test(orig[i])) oc.push({ ch: orig[i], pos: i });
    for (i = 0; i < rebuilt.length; i++) if (!/\s/.test(rebuilt[i])) rc.push({ ch: rebuilt[i], pos: i });
    var n = oc.length, m = rc.length;
    if (!n || !m || n * m > 250000) return rebuilt;
    // 最長共通部分列 (後ろから表を作り、前から辿る)
    var dp = [];
    for (i = 0; i <= n; i++) { dp.push(new Array(m + 1)); for (j = 0; j <= m; j++) dp[i][j] = 0; }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = oc[i].ch === rc[j].ch ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var matchOf = new Array(m);   // rebuilt の字 j → orig の字の番号 (無ければ -1)
    for (j = 0; j < m; j++) matchOf[j] = -1;
    i = 0; j = 0;
    while (i < n && j < m) {
      if (oc[i].ch === rc[j].ch && dp[i][j] === dp[i + 1][j + 1] + 1) { matchOf[j] = i; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    // 直した値の範囲 (rebuilt の中の位置)。後ろに書かれる値ほど多いので後ろから探す。
    var guard = [];
    (protect || []).forEach(function(p) {
      p = String(p == null ? '' : p);
      if (!/\s/.test(p)) return;
      var at = rebuilt.lastIndexOf(p);
      if (at >= 0) guard.push([at, at + p.length]);
    });
    function guarded(pos) {
      for (var g = 0; g < guard.length; g++) if (pos > guard[g][0] && pos < guard[g][1]) return true;
      return false;
    }
    var out = rebuilt.slice(0, rc[0].pos);
    for (j = 0; j < m; j++) {
      out += rc[j].ch;
      if (j === m - 1) { out += rebuilt.slice(rc[j].pos + 1); break; }
      var gap = rebuilt.slice(rc[j].pos + 1, rc[j + 1].pos);
      var a = matchOf[j], b = matchOf[j + 1];
      if ((gap === ' ' || gap === '') && a >= 0 && b === a + 1 && !guarded(rc[j].pos + 1)) {
        var og = orig.slice(oc[a].pos + 1, oc[b].pos);
        // rebuilt が詰めて書いた 2 字 (`[->` 等、記法が空白を許さない所) は開かない。空白を足すのは 1 つの空白の所だけ。
        out += gap === '' ? '' : og;
      } else {
        out += gap;
      }
    }
    return out;
  }
  // 関係の行のラベルだけを直したとき、組み直した行の矢印を元の行の矢印の字に戻す (TICKET-owner-20261122-0720-1)。
  // 組み立ては種別の代表の矢印 (`--`) で書くので、`A --> B : x` のラベルを直すと `-->` が `--` に変わっていた。
  // 両端が元の行と同じ並びのときだけ戻す (左右を読み替えて書いた行の矢印は向きが変わるので触らない)。
  // re は [全体, 左, 矢印, 右, …] を返す関係の正規表現、read は行を正規表現に掛ける前の読み替え (多重度を外す等)。
  function keepRelationArrow(origTrimmed, rebuilt, re, read) {
    read = read || function(s) { return s; };
    var om = read(origTrimmed).match(re);
    var cm = read(rebuilt).match(re);
    if (!om || !cm || cm[2] === om[2] || cm[1] !== om[1] || cm[3] !== om[3]) return rebuilt;
    var at = rebuilt.indexOf(cm[2], rebuilt.indexOf(cm[1]) + cm[1].length);
    return at < 0 ? rebuilt : rebuilt.slice(0, at) + om[2] + rebuilt.slice(at + cm[2].length);
  }
  // 行ごと (字下げ付き) の版。字下げは新しい行のもの (呼ぶ側が元の字下げを付けている)、行末の空白は元の行のもの。
  function keepLineSpacing(origLine, newLine, protect) {
    origLine = String(origLine == null ? '' : origLine);
    newLine = String(newLine == null ? '' : newLine);
    var lead = (newLine.match(/^\s*/) || [''])[0];
    var tail = (origLine.match(/\s*$/) || [''])[0];
    var body = keepSpacing(origLine.trim(), newLine.slice(lead.length).replace(/\s+$/, ''), protect);
    return lead + body + (body ? tail.replace(/[^ \t]/g, '') : '');
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

  // 監査モジュールに渡す「図 1 枚」の DSL を取り出す。
  // 呼ぶ側が組み立てる doc は場面によって `dsl` だったり `text` だったりし、
  // 取り違えると例外ではなく**空の結果**になるので、間違いに気付けなかった。
  // どちらの綴りでも同じ図として読めるようにして、取り違え自体を無くす。
  function docDsl(doc) {
    if (!doc) return '';
    var v = doc.dsl != null ? doc.dsl : doc.text;
    return v == null ? '' : String(v);
  }

  return {
    splitLines: splitLines,
    keepSpacing: keepSpacing,
    keepLineSpacing: keepLineSpacing,
    keepRelationArrow: keepRelationArrow,
    unquote: unquote,
    quote: quote,
    docDsl: docDsl,
    escapeForRegex: escapeForRegex,
    isPlantumlComment: isPlantumlComment,
    isPlantumlBoundary: isPlantumlBoundary,
    toggleLineComment: toggleLineComment,
  };
})();
