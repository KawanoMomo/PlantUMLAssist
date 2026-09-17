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
    var hasAbstractClassKw = false;
    var hasEnumKw = false;
    var hasClassRelation = false;
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
      if (/^abstract\s+class\s/.test(t)) hasAbstractClassKw = true;
      if (/^enum\s/.test(t)) hasEnumKw = true;
      if (/\s(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o)\s/.test(t)) hasClassRelation = true;
      if (/^state\b|^\[\*\]/.test(t)) hasStateKw = true;
      if (/^(start|stop)\b|^:.+;|^if\s+\(|^fork\b/.test(t)) hasActivityKw = true;
      if (/^component\b/.test(t)) hasComponentKw = true;
      if (/^\[[^\]*][^\]]*\]/.test(t)) hasComponentBracket = true;
      if (/\s(->|-->|->>|-->>|<-|<--|<<-|<<--)\s/.test(t)) hasMessageArrow = true;
    }

    // Activity: start keyword + action `:` syntax + control keywords
    // Disambiguate from class/component by absence of those keywords.
    var hasActivityStart = /^\s*start\s*$/m.test(text);
    var hasAction = /^\s*:[^:]+;\s*$/m.test(text);
    var hasActivityKw2 = /^\s*(endif|endwhile|end\s+fork|fork|while|repeat)\s*(\(|$)/m.test(text);
    var hasSwimlane = /^\s*\|[^|]+\|\s*$/m.test(text);
    if ((hasActivityStart || hasAction) && (hasActivityKw2 || hasAction || hasActivityStart || hasSwimlane)) {
      if (!hasClassKw && !hasComponentKw) return 'plantuml-activity';
    }

    // BLK-migrator-20260917-2349: 旧記法 activity (`(*) --> "x"` / `if "c" then` / `-->[label]`)。
    // `(*)` は usecase の短縮形 `(name)` にも当たるので、usecase 判定より前に拾う。
    var hasLegacyActivity = /\(\*(top)?\)\s*-+>|-+>\s*\(\*\)|^\s*if\s+"[^"]*"\s+then/m.test(text);
    if (hasLegacyActivity && !hasClassKw && !hasComponentKw && !hasParticipantSeqOnly) return 'plantuml-activity';

    // State: 'state X' keyword OR '[*] -->' pseudo-state
    var hasStateKwExplicit = /^\s*state\s+\w/m.test(text);
    var hasInitialPseudo = /^\s*\[\*\]\s*-->/m.test(text);
    var hasFinalPseudo = /-->\s*\[\*\]/m.test(text);
    if ((hasStateKwExplicit || hasInitialPseudo || hasFinalPseudo) && !hasClassKw && !hasComponentKw) {
      return 'plantuml-state';
    }

    // Priority: most-specific keywords first
    // Component takes priority over Class because Component diagrams legally
    // contain `interface` (which would otherwise match hasClassKw).
    if (hasComponentKw) return 'plantuml-component';
    if (hasAbstractClassKw || hasEnumKw || hasClassRelation) return 'plantuml-class';
    if (hasClassKw) return 'plantuml-class';
    if (hasStateKw) return 'plantuml-state';
    if (hasActivityKw) return 'plantuml-activity';
    if (hasUsecaseKw || hasUsecaseShort || (hasActor && hasPackage)) return 'plantuml-usecase';
    if (hasComponentBracket) return 'plantuml-component';
    if (hasParticipantSeqOnly) return 'plantuml-sequence';
    if (hasActor) {
      // actor alone could be either sequence or usecase; message arrow disambiguates to sequence
      if (hasMessageArrow) return 'plantuml-sequence';
      return 'plantuml-usecase';
    }
    if (hasMessageArrow) return 'plantuml-sequence';
    return null;
  }

  // `actor A` だけの図は Sequence にも UseCase にもなり得る。detectDiagramType は
  // 従来どおり usecase を返すが、これは当て推量なので、図種を自分で選んで
  // 組み立てている最中(空のシーケンス図に参加者を 1 人足した直後など)に
  // モジュールを勝手に載せ替えてはならない。この関数が true を返す間は
  // 呼び出し側が現在の図種を保つ。
  function isAmbiguousType(text) {
    if (!text || !text.trim()) return true;
    var lines = text.split('\n');
    var inBlock = false;
    var hasActor = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.indexOf("'") === 0) continue;
      if (window.MA.regexParts.isStartUml(t)) { inBlock = true; continue; }
      if (window.MA.regexParts.isEndUml(t)) break;
      if (!inBlock) continue;
      if (/^actor\b/.test(t)) { hasActor = true; continue; }
      // actor 以外の実質的な行が 1 つでもあれば、その行が図種を決める
      if (!/^(@|skinparam\b|title\b|hide\b|show\b|scale\b|autonumber\b)/.test(t)) return false;
    }
    // 中身が無い、または actor 宣言しか無い
    return true;
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

  // FEAT-177 (resolves HFR-042): 宣言されているが 1 度も参照されない participant を返す。
  // 入力は sequence モジュールの parseSequence(text) の返り値と同じ形の
  // { elements: [...], relations: [...] } である (生テキストは受け取らない)。
  // message の from/to・activation の target・note の targets のいずれにも現れない
  // participant を「未使用」とみなす。引数オブジェクトは変更しない。
  function findUnusedParticipants(parsed) {
    if (!parsed || !parsed.elements) return [];
    var used = {};
    function mark(name) {
      if (name == null) return;
      var k = String(name).trim();
      if (k !== '') used[k] = true;
    }
    var rels = parsed.relations || [];
    for (var i = 0; i < rels.length; i++) {
      if (rels[i] && rels[i].kind === 'message') { mark(rels[i].from); mark(rels[i].to); }
    }
    for (var j = 0; j < parsed.elements.length; j++) {
      var el = parsed.elements[j];
      if (!el) continue;
      if (el.kind === 'activation') mark(el.target);
      if (el.kind === 'note' && el.targets) {
        for (var t = 0; t < el.targets.length; t++) mark(el.targets[t]);
      }
    }
    var out = [];
    for (var k2 = 0; k2 < parsed.elements.length; k2++) {
      var p = parsed.elements[k2];
      if (p && p.kind === 'participant' && !used[String(p.id).trim()]) out.push(p);
    }
    return out;
  }

  return {
    detectDiagramType: detectDiagramType,
    isAmbiguousType: isAmbiguousType,
    splitLinesWithMeta: splitLinesWithMeta,
    findUnusedParticipants: findUnusedParticipants,
  };
})();
