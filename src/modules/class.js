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

  var PACKAGE_OPEN_RE = new RegExp(
    '^package\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );

  var NAMESPACE_OPEN_RE = new RegExp(
    '^namespace\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );

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

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      // closing brace for class block
      if (trimmed === '}' && openClassStack.length > 0) {
        var closing = openClassStack.pop();
        closing.element.endLine = lineNum;
        continue;
      }
      if (trimmed === '}' && packageStack.length > 0) {
        var pkgClosing = packageStack.pop();
        pkgClosing.endLine = lineNum;
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

      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var pkgLabel = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var pkgParent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', id: pkgId, label: pkgLabel, startLine: lineNum, endLine: 0, parentId: pkgParent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }

      var nm = trimmed.match(NAMESPACE_OPEN_RE);
      if (nm) {
        var nsLabel = nm[1] !== undefined ? nm[1] : nm[2];
        var nsId = '__pkg_' + (packageCounter++);
        var nsParent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var ns = { kind: 'namespace', id: nsId, label: nsLabel, startLine: lineNum, endLine: 0, parentId: nsParent };
        result.groups.push(ns);
        packageStack.push(ns);
        continue;
      }

      var em = trimmed.match(ENUM_KW_RE);
      if (em) {
        var eid, elabel;
        if (em[2] !== undefined) { eid = em[2]; elabel = em[1]; }
        else { eid = em[3]; elabel = em[4] !== undefined ? em[4] : em[3]; }
        var eHasBlock = /\{\s*$/.test(trimmed);
        var eCurrentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var eEl = {
          kind: 'enum', id: eid, label: elabel,
          stereotype: em[5] || null, generics: null, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: eCurrentPackageId,
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
        var aCurrentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var aEl = {
          kind: 'abstract', id: aSplit.id,
          label: aSplit.generics ? aSplit.id : alabel,
          stereotype: abm[5] || null, generics: aSplit.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: aCurrentPackageId,
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
        var iCurrentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var iEl = {
          kind: 'interface', id: iSplit.id,
          label: iSplit.generics ? iSplit.id : ilabel,
          stereotype: im[5] || null, generics: iSplit.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: iCurrentPackageId,
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
        var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var el = {
          kind: 'class', id: split.id,
          label: split.generics ? split.id : label,
          stereotype: m[5] || null, generics: split.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: currentPackageId,
        };
        result.elements.push(el);
        if (hasBlock) openClassStack.push({ element: el });
        continue;
      }
    }
    return result;
  }

  function _fmtIdGenerics(id, generics) {
    return generics && generics.length > 0 ? id + '<' + generics.join(', ') + '>' : id;
  }

  function fmtClass(id, label, stereotype, generics) {
    var idPart = _fmtIdGenerics(id, generics);
    var labelPart = (label && label !== id && !generics) ? '"' + label + '" as ' + idPart : idPart;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'class ' + labelPart + stereoPart;
  }

  function fmtInterface(id, label, stereotype, generics) {
    var idPart = _fmtIdGenerics(id, generics);
    var labelPart = (label && label !== id && !generics) ? '"' + label + '" as ' + idPart : idPart;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'interface ' + labelPart + stereoPart;
  }

  function fmtAbstract(id, label, stereotype, generics) {
    var idPart = _fmtIdGenerics(id, generics);
    var labelPart = (label && label !== id && !generics) ? '"' + label + '" as ' + idPart : idPart;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'abstract class ' + labelPart + stereoPart;
  }

  function fmtEnum(id, label, stereotype) {
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + id : id;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'enum ' + labelPart + stereoPart;
  }

  function fmtRelation(kind, from, to, label) {
    var lbl = label ? ' : ' + label : '';
    if (kind === 'inheritance')   return from + ' <|-- ' + to + lbl;
    if (kind === 'implementation') return from + ' <|.. ' + to + lbl;
    if (kind === 'composition')   return from + ' *-- ' + to + lbl;
    if (kind === 'aggregation')   return from + ' o-- ' + to + lbl;
    if (kind === 'dependency')    return from + ' ..> ' + to + lbl;
    return from + ' -- ' + to + lbl;
  }

  function fmtAttribute(visibility, name, type, isStatic) {
    var v = visibility || '';
    var stat = isStatic ? '{static} ' : '';
    var typ = type ? ' : ' + type : '';
    return (v ? v + ' ' : '') + stat + name + typ;
  }

  function fmtMethod(visibility, name, params, returnType, isStatic, isAbstract) {
    var v = visibility || '';
    var mod = isStatic ? '{static} ' : (isAbstract ? '{abstract} ' : '');
    var ret = returnType ? ' : ' + returnType : '';
    return (v ? v + ' ' : '') + mod + name + '(' + (params || '') + ')' + ret;
  }

  function fmtEnumValue(name) { return name; }
  function fmtPackage(label) { return 'package "' + label + '" {'; }
  function fmtNamespace(label) { return 'namespace ' + label + ' {'; }

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function addClass(text, id, label, stereotype, generics) {
    return insertBeforeEnd(text, fmtClass(id, label || id, stereotype, generics));
  }
  function addInterface(text, id, label, stereotype, generics) {
    return insertBeforeEnd(text, fmtInterface(id, label || id, stereotype, generics));
  }
  function addAbstract(text, id, label, stereotype, generics) {
    return insertBeforeEnd(text, fmtAbstract(id, label || id, stereotype, generics));
  }
  function addEnum(text, id, label, values) {
    var lines = [fmtEnum(id, label || id) + ' {'];
    (values || []).forEach(function(v) { lines.push('  ' + v); });
    lines.push('}');
    var out = text;
    lines.forEach(function(l) { out = insertBeforeEnd(out, l); });
    return out;
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }
  function addPackage(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtPackage(label)), '}');
  }
  function addNamespace(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtNamespace(label)), '}');
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
    fmtClass: fmtClass,
    fmtInterface: fmtInterface,
    fmtAbstract: fmtAbstract,
    fmtEnum: fmtEnum,
    fmtRelation: fmtRelation,
    fmtAttribute: fmtAttribute,
    fmtMethod: fmtMethod,
    fmtEnumValue: fmtEnumValue,
    fmtPackage: fmtPackage,
    fmtNamespace: fmtNamespace,
    addClass: addClass,
    addInterface: addInterface,
    addAbstract: addAbstract,
    addEnum: addEnum,
    addRelation: addRelation,
    addPackage: addPackage,
    addNamespace: addNamespace,
  };
})();
