'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlUsecase = (function() {
  var DU = window.MA.dslUtils;
  var RP = window.MA.regexParts;

  // ─── Regex 構築 ─────────────────────────────────────────────────────────
  var ID = RP.IDENTIFIER;             // [A-Za-z_][A-Za-z0-9_]*
  var QN = RP.QUOTED_NAME;            // "[^"]+"
  // Note: RP.QUOTED_NAME ('"[^"]+"') is non-capturing; for actor/usecase keyword
  // forms we need to capture the inner label, so we inline `"([^"]+)"` here.

  // actor: `actor X` / `actor "L" as X` / `actor X as "L"`
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var ACTOR_KW_RE = new RegExp(
    '^actor\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // actor short: `:X:` / `:Label: as Alias`
  var ACTOR_SHORT_RE = /^:([^:]+):(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  // usecase: `usecase X` / `usecase "L" as X` / `usecase X as "L"`
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var USECASE_KW_RE = new RegExp(
    '^usecase\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // usecase short: `(Label)` / `(Label) as Alias`
  var USECASE_SHORT_RE = /^\(([^)]+)\)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  // package open: `package "Label" {` / `package L {` / `rectangle "Label" {` / `rectangle L {`
  var PACKAGE_OPEN_RE = new RegExp(
    '^(?:package|rectangle)\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );
  var PACKAGE_CLOSE_RE = /^\s*\}\s*$/;

  // Relation arrows (longest first to avoid prefix matches):
  // <|-- / --|>  → generalization
  // ..> / <..    → dotted (association unless include/extend stereotype)
  // --> / <--    → solid association
  // -- / -       → undirected
  var RELATION_RE = new RegExp(
    '^(' + ID + '|' + QN + ')\\s+(<\\|--|--\\|>|\\.\\.>|<\\.\\.|-->|<--|--|<-)\\s+(' + ID + '|' + QN + ')(?:\\s*:\\s*(.+))?$'
  );

  // ─── Formatters (canonical emit, ADR-105 keyword-first) ───────────────
  function fmtActor(id, label) {
    if (label && label !== id) return 'actor "' + label + '" as ' + id;
    return 'actor ' + id;
  }
  function fmtUsecase(id, label) {
    if (label && label !== id) return 'usecase "' + label + '" as ' + id;
    return 'usecase ' + id;
  }
  function fmtPackage(label) {
    return 'package "' + label + '" {';
  }
  function fmtRelation(kind, from, to, label) {
    var lbl = label || '';
    if (kind === 'generalization') return from + ' <|-- ' + to;
    if (kind === 'include') return from + ' ..> ' + to + ' : <<include>>';
    if (kind === 'extend') return from + ' ..> ' + to + ' : <<extend>>';
    // association (default)
    return from + ' --> ' + to + (lbl ? ' : ' + lbl : '');
  }

  // ─── Add operations (pure: text + args → text) ────────────────────────
  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (RP.isEndUml(lines[i])) { endIdx = i; break; }
    }
    if (endIdx < 0) {
      var insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, newLine);
    } else {
      lines.splice(endIdx, 0, newLine);
    }
    return lines.join('\n');
  }

  function addActor(text, id, label) { return insertBeforeEnd(text, fmtActor(id, label || id)); }
  function addUsecase(text, id, label) { return insertBeforeEnd(text, fmtUsecase(id, label || id)); }
  function addPackage(text, label) {
    var open = fmtPackage(label);
    return insertBeforeEnd(insertBeforeEnd(text, open), '}');
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }

  // ─── Update operations (pure: text + lineNum + field/value → text) ───
  function updateActor(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(ACTOR_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(ACTOR_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtActor(id, label);
    return lines.join('\n');
  }

  function updateUsecase(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(USECASE_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(USECASE_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtUsecase(id, label);
    return lines.join('\n');
  }

  function updateRelation(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var m = trimmed.match(RELATION_RE);
    if (!m) return text;
    var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
    var from = DU.unquote(fromRaw), to = DU.unquote(toRaw);
    var kind = 'association';
    if (arrow === '<|--' || arrow === '--|>') kind = 'generalization';
    else if (lbl === '<<include>>') kind = 'include';
    else if (lbl === '<<extend>>') kind = 'extend';

    if (field === 'kind') {
      kind = value;
      // When changing kind, also reset label appropriately
      if (kind === 'include') lbl = '<<include>>';
      else if (kind === 'extend') lbl = '<<extend>>';
      else if (kind === 'association') lbl = '';
    } else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') lbl = value;

    lines[idx] = indent + fmtRelation(kind, from, to, lbl);
    return lines.join('\n');
  }

  // ─── Line operations (delete / move / setTitle) ────────────────────────
  function deleteLine(text, lineNum) {
    return window.MA.textUpdater.deleteLine(text, lineNum);
  }

  function moveLineUp(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx <= 0 || idx >= lines.length) return text;
    var tmp = lines[idx];
    lines[idx] = lines[idx - 1];
    lines[idx - 1] = tmp;
    return lines.join('\n');
  }

  function moveLineDown(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length - 1) return text;
    var tmp = lines[idx];
    lines[idx] = lines[idx + 1];
    lines[idx + 1] = tmp;
    return lines.join('\n');
  }

  function setTitle(text, newTitle) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+/.test(lines[i])) {
        var indent = lines[i].match(/^(\s*)/)[1];
        lines[i] = indent + 'title ' + newTitle;
        return lines.join('\n');
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (RP.isStartUml(lines[j])) {
        lines.splice(j + 1, 0, 'title ' + newTitle);
        return lines.join('\n');
      }
    }
    return text;
  }

  // ─── Parser ─────────────────────────────────────────────────────────────
  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    var packageStack = [];
    var packageCounter = 0;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;

      // package open
      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var label0 = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var parent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', id: pkgId, label: label0, startLine: lineNum, endLine: 0, parentId: parent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }
      // package close
      if (PACKAGE_CLOSE_RE.test(lines[i])) {
        if (packageStack.length > 0) {
          var closing = packageStack.pop();
          closing.endLine = lineNum;
        }
        continue;
      }

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;

      var m;
      var id, label;
      // actor keyword form
      m = trimmed.match(ACTOR_KW_RE);
      if (m) {
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'actor', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // actor short form
      m = trimmed.match(ACTOR_SHORT_RE);
      if (m) {
        label = m[1].trim();
        id = m[2] || label;
        result.elements.push({ kind: 'actor', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // usecase keyword form
      m = trimmed.match(USECASE_KW_RE);
      if (m) {
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'usecase', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // usecase short form
      m = trimmed.match(USECASE_SHORT_RE);
      if (m) {
        label = m[1].trim();
        id = m[2] || label;
        result.elements.push({ kind: 'usecase', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // relation
      m = trimmed.match(RELATION_RE);
      if (m) {
        var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
        var from = DU.unquote(fromRaw);
        var to = DU.unquote(toRaw);
        var kind = 'association';
        if (arrow === '<|--' || arrow === '--|>') {
          kind = 'generalization';
          // canonicalize direction: parent <|-- child (swap if --|>)
          if (arrow === '--|>') { var tmp = from; from = to; to = tmp; arrow = '<|--'; }
        } else if (lbl === '<<include>>') {
          kind = 'include';
        } else if (lbl === '<<extend>>') {
          kind = 'extend';
        }
        result.relations.push({
          id: '__r_' + result.relations.length,
          kind: kind, from: from, to: to, arrow: arrow, label: lbl, line: lineNum,
        });
        continue;
      }
    }
    return result;
  }

  return {
    type: 'plantuml-usecase',
    displayName: 'UseCase',
    parse: parse,
    fmtActor: fmtActor,
    fmtUsecase: fmtUsecase,
    fmtPackage: fmtPackage,
    fmtRelation: fmtRelation,
    addActor: addActor,
    addUsecase: addUsecase,
    addPackage: addPackage,
    addRelation: addRelation,
    updateActor: updateActor,
    updateUsecase: updateUsecase,
    updateRelation: updateRelation,
    deleteLine: deleteLine,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-usecase'; },
    template: function() {
      return [
        '@startuml',
        'title Sample UseCase',
        'actor User',
        'usecase Login',
        '',
        'User --> Login',
        '@enduml',
      ].join('\n');
    },
  };
})();
