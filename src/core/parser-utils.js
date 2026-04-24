'use strict';
window.MA = window.MA || {};
window.MA.parserUtils = (function() {
  function detectDiagramType(text) {
    if (!text || !text.trim()) return null;
    var lines = text.split('\n');
    var inBlock = false;
    var hasParticipantSeqOnly = false;
    var hasActor = false;
    var hasUsecaseShort = false;
    var hasUsecaseKw = false;
    var hasPackage = false;
    var hasClassKw = false;
    var hasStateKw = false;
    var hasActivityKw = false;
    var hasComponentKw = false;
    var hasComponentBracket = false;
    var hasMessageArrow = false;

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.indexOf("'") === 0) continue;
      if (window.MA.regexParts.isStartUml(t)) { inBlock = true; continue; }
      if (window.MA.regexParts.isEndUml(t)) break;
      if (!inBlock) continue;

      if (/^(participant|boundary|control|entity|database|queue|collections)\b/.test(t)) hasParticipantSeqOnly = true;
      if (/^actor\b/.test(t)) hasActor = true;
      if (/^\(.+\)/.test(t)) hasUsecaseShort = true;
      if (/^usecase\b/.test(t)) hasUsecaseKw = true;
      if (/^(package|rectangle)\b.*\{/.test(t)) hasPackage = true;
      if (/^(class|interface|abstract|enum)\b/.test(t)) hasClassKw = true;
      if (/^state\b|^\[\*\]/.test(t)) hasStateKw = true;
      if (/^(start|stop)\b|^:.+;|^if\s+\(|^fork\b/.test(t)) hasActivityKw = true;
      if (/^component\b/.test(t)) hasComponentKw = true;
      if (/^\[[^\]*][^\]]*\]/.test(t)) hasComponentBracket = true;
      if (/\s(->|-->|->>|-->>|<-|<--|<<-|<<--)\s/.test(t)) hasMessageArrow = true;
    }

    // Priority: most-specific keywords first
    if (hasClassKw) return 'plantuml-class';
    if (hasStateKw) return 'plantuml-state';
    if (hasActivityKw) return 'plantuml-activity';
    if (hasUsecaseKw || hasUsecaseShort || (hasActor && hasPackage)) return 'plantuml-usecase';
    if (hasComponentKw || hasComponentBracket) return 'plantuml-component';
    if (hasParticipantSeqOnly) return 'plantuml-sequence';
    if (hasActor) {
      // actor alone could be either sequence or usecase; message arrow disambiguates to sequence
      if (hasMessageArrow) return 'plantuml-sequence';
      return 'plantuml-usecase';
    }
    if (hasMessageArrow) return 'plantuml-sequence';
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
