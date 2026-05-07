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

  // existingIds is { idString: true } so callers can pass any structure.
  // prefix is the per-module letter (S for state, C for class, etc).
  function normalize(rawInput, existingIds, prefix) {
    var trimmed = (rawInput == null ? '' : String(rawInput)).trim();
    if (!trimmed) return { id: '', label: '', valid: false };
    if (ASCII_ID_RE.test(trimmed)) {
      return { id: trimmed, label: trimmed, valid: true };
    }
    var pfx = prefix || 'X';
    var existing = existingIds || {};
    for (var i = 1; i < 10000; i++) {
      var candidate = pfx + i;
      if (!existing[candidate]) {
        return { id: candidate, label: trimmed, valid: true };
      }
    }
    return { id: pfx + Date.now(), label: trimmed, valid: true };
  }

  return {
    normalize: normalize,
    ASCII_ID_RE: ASCII_ID_RE,
  };
})();
