'use strict';
window.MA = window.MA || {};

// dsl-visible-diff — 2 つの DSL の差が「描かれるもの」に届いているかを言う。
//
// BLK-reviewer-20260914-2106: `diagram1.puml` に `domain-verdict` コメント行が
// 復元されただけで `diagram1.svg` の sha1 スタンプが不一致になり、stale と出た。
// これが「コメント追加による埋め込みソースの符号化差分だけ」なのか
// 「participant / 矢印 / ラベルの可視内容が実際にずれている」のかは、
// audit.js の出力 (「SVG が古い」件数のみ) からは分からず、reviewer は毎回
// render API を呼んで文字列 diff を取る使い捨てスクリプトを書いていた。
// 図が増えるほどこの手作業が線形に増える。
//
// SVG には書き出したときの DSL が畳まれている (`<?plantuml-src …?>`)。
// その DSL と今の .puml を、描かれない行を落としてから突き合わせれば、
// 描き直さずに (Java も server も要らずに) 白黒が付く。
//   same   — 描かれる行は同じ。差はコメント・空行・行末空白だけ (= 見かけ上の stale)
//   differ — 描かれる行が違う (= 可視内容の食い違い。作り直しが要る)
//
// 落とすのは「PlantUML が絵に出さない行」だけにする。skinparam や title は
// 絵に出るので落とさない (落とすと「色が変わっただけ」を同じと言ってしまう)。
window.MA.dslVisibleDiff = (function() {

  // 行コメント。PlantUML は行頭の `'` を注釈として読む。
  var LINE_COMMENT = /^\s*'/;
  // ブロックコメント `/' … '/`。開いた行から閉じた行までを落とす。
  var BLOCK_OPEN = /\/'/;
  var BLOCK_CLOSE = /'\//;

  // 描かれる行だけを、突き合わせられる形にそろえて返す。
  // 埋め込みには `@startuml` / `@enduml` が無く行末の空白も落ちているので、
  // そこも揃える (揃えないと、同じ図でも「別物」と言ってしまう)。
  function visibleLines(text) {
    var out = [];
    var inBlock = false;
    String(text == null ? '' : text)
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      .forEach(function(raw) {
        var line = raw.replace(/\s+$/, '');
        if (inBlock) {
          if (BLOCK_CLOSE.test(line)) inBlock = false;
          return;
        }
        if (BLOCK_OPEN.test(line)) {
          // 1 行で閉じるブロックコメントもある。閉じていなければ次行から続く。
          if (!BLOCK_CLOSE.test(line.slice(line.search(BLOCK_OPEN) + 2))) inBlock = true;
          return;
        }
        if (line.trim() === '') return;
        if (LINE_COMMENT.test(line)) return;
        var low = line.trim().toLowerCase();
        if (low.indexOf('@startuml') === 0 || low.indexOf('@enduml') === 0) return;
        out.push(line);
      });
    return out;
  }

  function _counts(lines) {
    var m = {};
    lines.forEach(function(l) { m[l] = (m[l] || 0) + 1; });
    return m;
  }

  // 旧 DSL (SVG に畳まれていたもの) と今の DSL を突き合わせる。
  function compare(oldText, newText) {
    var o = visibleLines(oldText);
    var n = visibleLines(newText);
    var oc = _counts(o), nc = _counts(n);
    var added = [], removed = [];
    Object.keys(nc).forEach(function(k) {
      for (var i = (oc[k] || 0); i < nc[k]; i++) added.push(k);
    });
    Object.keys(oc).forEach(function(k) {
      for (var i = (nc[k] || 0); i < oc[k]; i++) removed.push(k);
    });
    return {
      verdict: (added.length || removed.length) ? 'differ' : 'same',
      added: added,
      removed: removed,
      visibleLines: n.length,
    };
  }

  var VERDICT_TEXT = {
    same: 'コメント等ソース変化のみ（描かれるものは同じ）',
    differ: '可視内容の食い違い（作り直しが要る）',
    unknown: '畳まれた DSL が無く、中身では言えない',
  };

  function verdictText(verdict) { return VERDICT_TEXT[verdict] || VERDICT_TEXT.unknown; }

  return {
    visibleLines: visibleLines,
    compare: compare,
    verdictText: verdictText,
  };
})();
