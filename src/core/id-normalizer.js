'use strict';
window.MA = window.MA || {};

// Shared helper for normalizing user-typed IDs across PlantUML modules.
//
// Why this exists: each module's parser regex enforces an ASCII-only
// IDENTIFIER ([A-Za-z_][A-Za-z0-9_]*) for entity IDs, AND PlantUML itself
// strips non-ASCII characters from data-qualified-name on the rendered SVG.
// So a tail-add UI that passes a Japanese alias straight into the DSL
// produces a state/class/actor/etc that is invisible to both the parser
// and the overlay builder, making the new entity unselectable.
//
// Fix pattern: normalize() detects a non-ASCII input, generates a unique
// ASCII alias `<prefix><n>`, and returns the original string as the label.
// Callers then emit `<keyword> "<japanese>" as <ASCII alias>`, which all
// three layers (parser regex, PlantUML renderer, overlay matcher) agree on.
window.MA.idNormalizer = (function() {
  var ASCII_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  // 本文に語として出ている `<prefix><n>` を全部「使用中」とみなす。
  // 呼ぶ側の解析結果は描き直し (保存・図の更新) が届くまで古いことがあり、
  // 続けて足すと前に足した別名を数え損ねて同じ別名を 2 度書く (2 つ目が前の
  // 要素を上書きし、押していない要素が図から消える)。今の本文から数えれば重ならない。
  // ラベルや注釈の中の語も数える (飛ばして次の番号にするだけで、壊れはしない)。
  function usedInText(text, prefix) {
    var set = {};
    if (!text) return set;
    var pfx = String(prefix || 'X').replace(/[^A-Za-z0-9_]/g, '');
    var re = new RegExp('(^|[^A-Za-z0-9_])(' + pfx + '\\d+)(?![A-Za-z0-9_])', 'g');
    var m;
    while ((m = re.exec(String(text))) !== null) set[m[2]] = true;
    return set;
  }

  // existingIds is { idString: true } so callers can pass any structure.
  // prefix is the per-module letter (S for state, C for class, etc).
  // text (任意) は今の本文。渡すと、本文に出ている別名も使用中として避ける。
  function normalize(rawInput, existingIds, prefix, text) {
    var trimmed = (rawInput == null ? '' : String(rawInput)).trim();
    if (!trimmed) return { id: '', label: '', valid: false };
    if (ASCII_ID_RE.test(trimmed)) {
      return { id: trimmed, label: trimmed, valid: true };
    }
    var pfx = prefix || 'X';
    var existing = existingIds || {};
    var inText = usedInText(text, pfx);
    for (var i = 1; i < 10000; i++) {
      var candidate = pfx + i;
      if (!existing[candidate] && !inText[candidate]) {
        return { id: candidate, label: trimmed, valid: true };
      }
    }
    return { id: pfx + Date.now(), label: trimmed, valid: true };
  }

  return {
    normalize: normalize,
    usedInText: usedInText,
    ASCII_ID_RE: ASCII_ID_RE,
  };
})();
