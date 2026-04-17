'use strict';
window.MA = window.MA || {};
window.MA.parserUtils = (function() {
  function detectDiagramType(text) {
    if (!text || !text.trim()) return null;
    var lines = text.split('\n');
    var inBlock = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.indexOf("'") === 0) continue;
      if (/^@startuml/.test(t)) { inBlock = true; continue; }
      if (/^@enduml/.test(t)) break;
      if (!inBlock) continue;
      if (/^(actor|participant|boundary|control|entity|database|queue|collections)\b/.test(t)) return 'plantuml-sequence';
      if (/^usecase\b|\bas\s+\(/.test(t)) return 'plantuml-usecase';
      if (/^(class|interface|abstract|enum)\b/.test(t)) return 'plantuml-class';
      if (/^(start|stop|:.+;|if\s+\(|fork)/.test(t)) return 'plantuml-activity';
      if (/^\[[^\]]+\]/.test(t) || /^(component|package)\b/.test(t)) return 'plantuml-component';
      if (/^(state|\[\*\])/.test(t)) return 'plantuml-state';
      if (/\s(->|-->|<-|<--|<->|\.\.>)\s/.test(t)) return 'plantuml-sequence';
      return 'plantuml-sequence';
    }
    return null;
  }

  function splitLinesWithMeta(text) {
    if (!text) return [];
    var lines = text.split('\n');
    var result = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var trimmed = raw.trim();
      result.push({
        lineNum: i + 1,
        raw: raw,
        trimmed: trimmed,
        isComment: trimmed.indexOf("'") === 0,
        isBlank: trimmed === '',
      });
    }
    return result;
  }

  return {
    detectDiagramType: detectDiagramType,
    splitLinesWithMeta: splitLinesWithMeta,
  };
})();
