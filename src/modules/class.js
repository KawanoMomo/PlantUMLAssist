'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlClass = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
  var ID = RP.IDENTIFIER;
  var ID_WITH_GENERICS = '(?:' + ID + '(?:<[^<>]*>)?)';
  var _ID_GENERICS_RE = new RegExp('^(' + ID + ')<([^<>]+)>$');
  function _splitIdGenerics(idWithGen) {
    var m = idWithGen.match(_ID_GENERICS_RE);
    if (!m) return { id: idWithGen, generics: null };
    var ids = m[2].split(',').map(function(s) { return s.trim(); });
    return { id: m[1], generics: ids };
  }

  // class declaration: keyword + id (with optional quoted label)
  // groups: 1=quoted label (with as), 2=alias ID, 3=bare ID, 4=quoted label (trailing as)
  var CLASS_KW_RE = new RegExp(
    '^class\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );

  var ATTRIBUTE_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?(' + ID + ')\\s*(?::\\s*(.+))?\\s*$'
  );

  var METHOD_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?(' + ID + ')\\s*\\(([^)]*)\\)\\s*(?::\\s*(.+))?\\s*$'
  );

  var INTERFACE_KW_RE = new RegExp(
    '^interface\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );

  var ABSTRACT_KW_RE = new RegExp(
    '^abstract\\s+class\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );

  var ENUM_KW_RE = new RegExp(
    '^enum\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );
  var ENUM_VALUE_RE = /^([A-Z_][A-Z0-9_]*)\s*;?\s*$/;

  // Relation arrow tokens, longest first to avoid prefix matches
  var RELATION_RE = new RegExp(
    '^(' + ID_WITH_GENERICS + '|"[^"]+")\\s+' +
    '(<\\|--|--\\|>|<\\|\\.\\.|\\.\\.\\|>|\\*--|--\\*|o--|--o|\\.\\.>|<\\.\\.|--)\\s+' +
    '(' + ID_WITH_GENERICS + '|"[^"]+")(?:\\s*:\\s*(.+))?\\s*$'
  );

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var openClassStack = [];

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      // closing brace for class block
      if (trimmed === '}' && openClassStack.length > 0) {
        var closing = openClassStack.pop();
        closing.element.endLine = lineNum;
        continue;
      }

      // member parsing: only inside an open class block
      if (openClassStack.length > 0) {
        var parent = openClassStack[openClassStack.length - 1].element;
        if (parent.kind === 'enum') {
          var ev = trimmed.match(ENUM_VALUE_RE);
          if (ev) {
            parent.members.push({
              kind: 'enum-value',
              visibility: null, static: false, abstract: false,
              name: ev[1], type: '', params: null, line: lineNum,
            });
            continue;
          }
        }
        var mm = trimmed.match(METHOD_RE);
        if (mm) {
          parent.members.push({
            kind: 'method',
            visibility: mm[1] || null,
            static: mm[2] === 'static',
            abstract: mm[2] === 'abstract',
            name: mm[3],
            type: mm[5] ? mm[5].trim() : '',
            params: mm[4] || '',
            line: lineNum,
          });
          continue;
        }
        var am = trimmed.match(ATTRIBUTE_RE);
        if (am && trimmed.indexOf('(') < 0) {  // method は別 regex (params にカッコ)
          parent.members.push({
            kind: 'attribute',
            visibility: am[1] || null,
            static: am[2] === 'static',
            abstract: false,
            name: am[3],
            type: am[4] ? am[4].trim() : '',
            params: null,
            line: lineNum,
          });
          continue;
        }
      }

      if (openClassStack.length === 0) {
        var rm = trimmed.match(RELATION_RE);
        if (rm) {
          var arrow = rm[2];
          var fromTok = rm[1].replace(/^"|"$/g, '');
          var toTok = rm[3].replace(/^"|"$/g, '');
          var lbl = rm[4] ? rm[4].trim() : null;
          var rkind, rfrom, rto;
          if (arrow === '<|--') { rkind = 'inheritance'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--|>') { rkind = 'inheritance'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '<|..') { rkind = 'implementation'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '..|>') { rkind = 'implementation'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '*--') { rkind = 'composition'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--*') { rkind = 'composition'; rfrom = toTok; rto = fromTok; }
          else if (arrow === 'o--') { rkind = 'aggregation'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--o') { rkind = 'aggregation'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '..>') { rkind = 'dependency'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '<..') { rkind = 'dependency'; rfrom = toTok; rto = fromTok; }
          else { rkind = 'association'; rfrom = fromTok; rto = toTok; }

          result.relations.push({
            id: '__r_' + result.relations.length,
            kind: rkind, from: rfrom, to: rto, label: lbl, line: lineNum,
          });
          continue;
        }
      }

      var em = trimmed.match(ENUM_KW_RE);
      if (em) {
        var eid, elabel;
        if (em[2] !== undefined) { eid = em[2]; elabel = em[1]; }
        else { eid = em[3]; elabel = em[4] !== undefined ? em[4] : em[3]; }
        var eHasBlock = /\{\s*$/.test(trimmed);
        var eEl = {
          kind: 'enum', id: eid, label: elabel,
          stereotype: em[5] || null, generics: null, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: null,
        };
        result.elements.push(eEl);
        if (eHasBlock) openClassStack.push({ element: eEl });
        continue;
      }

      var abm = trimmed.match(ABSTRACT_KW_RE);
      if (abm) {
        var aRawId, alabel;
        if (abm[2] !== undefined) { aRawId = abm[2]; alabel = abm[1]; }
        else { aRawId = abm[3]; alabel = abm[4] !== undefined ? abm[4] : abm[3]; }
        var aSplit = _splitIdGenerics(aRawId);
        var aHasBlock = /\{\s*$/.test(trimmed);
        var aEl = {
          kind: 'abstract', id: aSplit.id,
          label: aSplit.generics ? aSplit.id : alabel,
          stereotype: abm[5] || null, generics: aSplit.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: null,
        };
        result.elements.push(aEl);
        if (aHasBlock) openClassStack.push({ element: aEl });
        continue;
      }

      var im = trimmed.match(INTERFACE_KW_RE);
      if (im) {
        var iRawId, ilabel;
        if (im[2] !== undefined) { iRawId = im[2]; ilabel = im[1]; }
        else { iRawId = im[3]; ilabel = im[4] !== undefined ? im[4] : im[3]; }
        var iSplit = _splitIdGenerics(iRawId);
        var iHasBlock = /\{\s*$/.test(trimmed);
        var iEl = {
          kind: 'interface', id: iSplit.id,
          label: iSplit.generics ? iSplit.id : ilabel,
          stereotype: im[5] || null, generics: iSplit.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: null,
        };
        result.elements.push(iEl);
        if (iHasBlock) openClassStack.push({ element: iEl });
        continue;
      }

      var m = trimmed.match(CLASS_KW_RE);
      if (m) {
        var rawId, label;
        if (m[2] !== undefined) { rawId = m[2]; label = m[1]; }
        else { rawId = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        var split = _splitIdGenerics(rawId);
        var hasBlock = /\{\s*$/.test(trimmed);
        var el = {
          kind: 'class', id: split.id,
          label: split.generics ? split.id : label,
          stereotype: m[5] || null, generics: split.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: null,
        };
        result.elements.push(el);
        if (hasBlock) openClassStack.push({ element: el });
        continue;
      }
    }
    return result;
  }

  function template() {
    return [
      '@startuml',
      'title Sample Class',
      'class User {',
      '  - id : int',
      '  + name : String',
      '  + login() : void',
      '}',
      'interface IAuth {',
      '  + verify() : bool',
      '}',
      'User ..|> IAuth',
      '@enduml',
    ].join('\n');
  }

  function renderProps(selData, parsedData, propsEl, ctx) {
    if (!propsEl) return;
    propsEl.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:11px;">Class Diagram (Phase B で実装)</div>';
  }

  return {
    type: 'plantuml-class',
    displayName: 'Class',
    parse: parse,
    template: template,
    renderProps: renderProps,
    capabilities: {
      overlaySelection: false,  // Phase B Task 21 で true
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,  // Phase B Task 25 で true
    },
    buildOverlay: function() { /* Phase B Task 21 で実装 */ },
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-class'; },
  };
})();
