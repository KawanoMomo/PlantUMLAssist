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

  var NOTE_INLINE_RE = new RegExp(
    '^note\\s+(left|right|top|bottom)\\s+of\\s+(' + ID + ')\\s*:\\s*(.*)$',
    'i'
  );

  var NOTE_BLOCK_OPEN_RE = new RegExp(
    '^note\\s+(left|right|top|bottom)\\s+of\\s+(' + ID + ')\\s*$',
    'i'
  );
  var END_NOTE_RE = /^end\s+note\s*$/i;

  // Relation arrow tokens, longest first to avoid prefix matches
  var RELATION_RE = new RegExp(
    '^(' + ID_WITH_GENERICS + '|"[^"]+")\\s+' +
    '(<\\|--|--\\|>|<\\|\\.\\.|\\.\\.\\|>|\\*--|--\\*|o--|--o|\\.\\.>|<\\.\\.|--)\\s+' +
    '(' + ID_WITH_GENERICS + '|"[^"]+")(?:\\s*:\\s*(.+))?\\s*$'
  );

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [], notes: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var openClassStack = [];
    var packageStack = [];
    var packageCounter = 0;
    var openNote = null;  // { startLine, position, targetId, bodyLines: [] }

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var rawLine = lines[i];
      var trimmed = rawLine.trim();

      // Inside multi-line note block: handle BEFORE empty/comment skip
      if (openNote) {
        if (END_NOTE_RE.test(trimmed)) {
          result.notes.push({
            kind: 'note',
            id: '__n_' + result.notes.length,
            position: openNote.position,
            targetId: openNote.targetId,
            text: openNote.bodyLines.join('\n'),
            line: openNote.startLine,
            endLine: lineNum,
          });
          openNote = null;
          continue;
        }
        openNote.bodyLines.push(rawLine.replace(/^  /, ''));
        continue;
      }

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
        var noteMatch = trimmed.match(NOTE_INLINE_RE);
        if (noteMatch) {
          result.notes.push({
            kind: 'note',
            id: '__n_' + result.notes.length,
            position: noteMatch[1].toLowerCase(),
            targetId: noteMatch[2],
            text: noteMatch[3],
            line: lineNum,
            endLine: lineNum,
          });
          continue;
        }
        var blockMatch = trimmed.match(NOTE_BLOCK_OPEN_RE);
        if (blockMatch) {
          openNote = {
            startLine: lineNum,
            position: blockMatch[1].toLowerCase(),
            targetId: blockMatch[2],
            bodyLines: [],
          };
          continue;
        }
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

  function fmtNote(position, targetId, text) {
    var pos = (position || 'left').toLowerCase();
    if (typeof text !== 'string') text = '';
    if (text.indexOf('\n') < 0) {
      return 'note ' + pos + ' of ' + targetId + ' : ' + text;
    }
    var bodyLines = text.split('\n');
    var out = ['note ' + pos + ' of ' + targetId];
    bodyLines.forEach(function(l) { out.push(l); });
    out.push('end note');
    return out;
  }

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
  function addNote(text, targetId, position, noteText) {
    var pos = position || 'left';
    var formatted = fmtNote(pos, targetId, noteText || '');
    if (Array.isArray(formatted)) {
      var out = text;
      formatted.forEach(function(l) { out = insertBeforeEnd(out, l); });
      return out;
    }
    return insertBeforeEnd(text, formatted);
  }

  function _parseSingleLine(line) {
    var trimmed = line.trim();
    var indent = line.match(/^(\s*)/)[1];
    var match;
    if ((match = trimmed.match(ABSTRACT_KW_RE)))
      return { kind: 'abstract', indent: indent, match: match };
    if ((match = trimmed.match(INTERFACE_KW_RE)))
      return { kind: 'interface', indent: indent, match: match };
    if ((match = trimmed.match(ENUM_KW_RE)))
      return { kind: 'enum', indent: indent, match: match };
    if ((match = trimmed.match(CLASS_KW_RE)))
      return { kind: 'class', indent: indent, match: match };
    return null;
  }

  function updateClass(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var info = _parseSingleLine(lines[idx]);
    if (!info) return text;
    var m = info.match;
    var rawId, label, stereotype;
    if (m[2] !== undefined) { rawId = m[2]; label = m[1]; }
    else { rawId = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
    var split = _splitIdGenerics(rawId);
    var id = split.id, generics = split.generics;
    stereotype = m[5] || null;
    var wasBareLabel = (label === split.id);

    if (field === 'id') { id = value; if (wasBareLabel) label = value; }
    else if (field === 'label') label = value;
    else if (field === 'stereotype') stereotype = value || null;
    else if (field === 'generics') generics = value && value.length > 0 ? value : null;

    var hasBlock = /\{\s*$/.test(lines[idx]);
    var openBrace = hasBlock ? ' {' : '';
    var fmtFn;
    if (info.kind === 'interface') fmtFn = fmtInterface;
    else if (info.kind === 'abstract') fmtFn = fmtAbstract;
    else if (info.kind === 'enum') fmtFn = function(i, l, s) { return fmtEnum(i, l, s); };
    else fmtFn = fmtClass;
    lines[idx] = info.indent + fmtFn(id, label, stereotype, generics) + openBrace;
    return lines.join('\n');
  }

  function _findClassEndLine(lines, classLineIdx) {
    if (!/\{\s*$/.test(lines[classLineIdx])) return -1;
    for (var i = classLineIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '}') return i;
    }
    return -1;
  }

  function addAttribute(text, classLineNum, visibility, name, type, isStatic) {
    var lines = text.split('\n');
    var classIdx = classLineNum - 1;
    var closeIdx = _findClassEndLine(lines, classIdx);
    if (closeIdx < 0) return text;
    var indent = lines[classIdx].match(/^(\s*)/)[1] + '  ';
    lines.splice(closeIdx, 0, indent + fmtAttribute(visibility, name, type, isStatic));
    return lines.join('\n');
  }

  function addMethod(text, classLineNum, visibility, name, params, returnType, isStatic, isAbstract) {
    var lines = text.split('\n');
    var classIdx = classLineNum - 1;
    var closeIdx = _findClassEndLine(lines, classIdx);
    if (closeIdx < 0) return text;
    var indent = lines[classIdx].match(/^(\s*)/)[1] + '  ';
    lines.splice(closeIdx, 0, indent + fmtMethod(visibility, name, params, returnType, isStatic, isAbstract));
    return lines.join('\n');
  }

  function addEnumValue(text, enumLineNum, name) {
    var lines = text.split('\n');
    var enumIdx = enumLineNum - 1;
    var closeIdx = _findClassEndLine(lines, enumIdx);
    if (closeIdx < 0) return text;
    var indent = lines[enumIdx].match(/^(\s*)/)[1] + '  ';
    lines.splice(closeIdx, 0, indent + name);
    return lines.join('\n');
  }

  function updateAttribute(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var am = trimmed.match(ATTRIBUTE_RE);
    if (!am) return text;
    var visibility = am[1] || null;
    var isStatic = am[2] === 'static';
    var name = am[3];
    var type = am[4] ? am[4].trim() : '';
    if (field === 'visibility') visibility = value;
    else if (field === 'name') name = value;
    else if (field === 'type') type = value;
    else if (field === 'static') isStatic = !!value;
    lines[idx] = indent + fmtAttribute(visibility, name, type, isStatic);
    return lines.join('\n');
  }

  function updateMethod(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var mm = trimmed.match(METHOD_RE);
    if (!mm) return text;
    var visibility = mm[1] || null;
    var isStatic = mm[2] === 'static';
    var isAbstract = mm[2] === 'abstract';
    var name = mm[3];
    var params = mm[4] || '';
    var returnType = mm[5] ? mm[5].trim() : '';
    if (field === 'visibility') visibility = value;
    else if (field === 'name') name = value;
    else if (field === 'params') params = value;
    else if (field === 'type') returnType = value;
    else if (field === 'static') { isStatic = !!value; if (isStatic) isAbstract = false; }
    else if (field === 'abstract') { isAbstract = !!value; if (isAbstract) isStatic = false; }
    lines[idx] = indent + fmtMethod(visibility, name, params, returnType, isStatic, isAbstract);
    return lines.join('\n');
  }

  function deleteMember(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    lines.splice(idx, 1);
    return lines.join('\n');
  }

  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

  function deleteLine(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    lines.splice(idx, 1);
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

  function updateRelation(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var rm = trimmed.match(RELATION_RE);
    if (!rm) return text;
    var arrow = rm[2];
    var from = rm[1].replace(/^"|"$/g, '');
    var to = rm[3].replace(/^"|"$/g, '');
    var label = rm[4] || null;
    var kind;
    if (arrow === '<|--' || arrow === '--|>') kind = 'inheritance';
    else if (arrow === '<|..' || arrow === '..|>') kind = 'implementation';
    else if (arrow === '*--' || arrow === '--*') kind = 'composition';
    else if (arrow === 'o--' || arrow === '--o') kind = 'aggregation';
    else if (arrow === '..>' || arrow === '<..') kind = 'dependency';
    else kind = 'association';
    if (arrow === '--|>' || arrow === '..|>' || arrow === '--*' || arrow === '--o' || arrow === '<..') {
      var tmp = from; from = to; to = tmp;
    }

    if (field === 'kind') kind = value;
    else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') label = value;
    else if (field === 'swap') { var s = from; from = to; to = s; }

    lines[idx] = indent + fmtRelation(kind, from, to, label);
    return lines.join('\n');
  }

  function updateNote(text, startLine, endLine, fields) {
    var lines = text.split('\n');
    var startIdx = startLine - 1;
    var endIdx = endLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;

    // Parse current note state from start line
    var startTrimmed = lines[startIdx].trim();
    var inlineMatch = startTrimmed.match(NOTE_INLINE_RE);
    var blockMatch = startTrimmed.match(NOTE_BLOCK_OPEN_RE);
    var current = null;
    if (inlineMatch) {
      current = { position: inlineMatch[1].toLowerCase(), targetId: inlineMatch[2], text: inlineMatch[3] };
    } else if (blockMatch) {
      var bodyLines = [];
      for (var k = startIdx + 1; k <= endIdx - 1; k++) {
        bodyLines.push(lines[k].replace(/^  /, ''));
      }
      current = { position: blockMatch[1].toLowerCase(), targetId: blockMatch[2], text: bodyLines.join('\n') };
    }
    if (!current) return text;

    var newPos = fields.position != null ? fields.position : current.position;
    var newText = fields.text != null ? fields.text : current.text;

    var formatted = fmtNote(newPos, current.targetId, newText);
    var newLines;
    if (Array.isArray(formatted)) {
      newLines = formatted;
    } else {
      newLines = [formatted];
    }

    // Replace [startIdx..endIdx] with newLines
    var before = lines.slice(0, startIdx);
    var after = lines.slice(endIdx + 1);
    return before.concat(newLines).concat(after).join('\n');
  }

  function deleteNote(text, startLine, endLine) {
    var lines = text.split('\n');
    var startIdx = startLine - 1;
    var endIdx = endLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;
    var before = lines.slice(0, startIdx);
    var after = lines.slice(endIdx + 1);
    return before.concat(after).join('\n');
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
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(p, e) { _renderNoSelection(p, e, ctx); },
      onElement: function(elt, p, e) { _renderElementEdit(elt, p, e, ctx); },
      onRelation: function(rel, p, e) { _renderRelationEdit(rel, p, e, ctx); },
      onGroup: function(grp, p, e) { _renderGroupReadOnly(grp, p, e, ctx); },
      onMultiSelectConnect: function(s, p, e) { _renderMultiSelectConnect(s, p, e, ctx); },
      onMultiSelect: function(s, p, e) { _renderMultiSelect(s, p, e); },
    });
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var elements = parsedData.elements || [];
    var allOpts = elements.map(function(e) { return { value: e.id, label: e.label || e.id }; });
    if (allOpts.length === 0) allOpts = [{ value: '', label: '（要素なし）' }];

    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
        P.fieldHtml('Title', 'cl-title', parsedData.meta.title) +
        P.primaryButtonHtml('cl-set-title', 'Title 適用') +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'cl-tail-kind', [
          { value: 'class',     label: 'Class', selected: true },
          { value: 'interface', label: 'Interface' },
          { value: 'abstract',  label: 'Abstract Class' },
          { value: 'enum',      label: 'Enum' },
          { value: 'package',   label: 'Package境界' },
          { value: 'namespace', label: 'Namespace' },
          { value: 'relation',  label: 'Relation (関係)' },
        ]) +
        '<div id="cl-tail-detail" style="margin-top:6px;"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('cl-set-title', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('cl-title').value.trim()));
      ctx.onUpdate();
    });

    var renderTailDetail = function() {
      var kind = document.getElementById('cl-tail-kind').value;
      var detailEl = document.getElementById('cl-tail-detail');
      var html2 = '';
      if (kind === 'class' || kind === 'interface' || kind === 'abstract') {
        html2 =
          P.fieldHtml('Alias', 'cl-tail-alias', '', '例: User') +
          P.fieldHtml('Label', 'cl-tail-label', '', '省略可') +
          P.fieldHtml('Stereotype', 'cl-tail-stereo', '', '<<X>> の X 部分のみ') +
          P.fieldHtml('Generics (カンマ区切り)', 'cl-tail-generics', '', '例: T,K,V') +
          P.primaryButtonHtml('cl-tail-add', '+ ' + kind + ' 追加');
      } else if (kind === 'enum') {
        html2 =
          P.fieldHtml('Alias', 'cl-tail-alias', '', '例: Color') +
          P.fieldHtml('値 (改行区切り)', 'cl-tail-values', '', 'RED\\nGREEN\\nBLUE') +
          P.primaryButtonHtml('cl-tail-add', '+ enum 追加');
      } else if (kind === 'package' || kind === 'namespace') {
        html2 =
          P.fieldHtml('Label', 'cl-tail-label', '', '例: domain') +
          P.primaryButtonHtml('cl-tail-add', '+ ' + kind + ' 追加');
      } else if (kind === 'relation') {
        html2 =
          P.selectFieldHtml('Kind', 'cl-tail-rkind', [
            { value: 'association',    label: 'Association (--)', selected: true },
            { value: 'inheritance',    label: 'Inheritance (<|--)' },
            { value: 'implementation', label: 'Implementation (<|..)' },
            { value: 'composition',    label: 'Composition (*--)' },
            { value: 'aggregation',    label: 'Aggregation (o--)' },
            { value: 'dependency',     label: 'Dependency (..>)' },
          ]) +
          P.selectFieldHtml('From', 'cl-tail-from', allOpts) +
          P.selectFieldHtml('To', 'cl-tail-to', allOpts) +
          P.fieldHtml('Label', 'cl-tail-rlabel', '', '任意') +
          P.primaryButtonHtml('cl-tail-add', '+ Relation 追加');
      }
      detailEl.innerHTML = html2;

      P.bindEvent('cl-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var out = t;
        var k = document.getElementById('cl-tail-kind').value;
        if (k === 'class' || k === 'interface' || k === 'abstract') {
          var al = document.getElementById('cl-tail-alias').value.trim();
          if (!al) { alert('Alias 必須'); return; }
          var lbl = document.getElementById('cl-tail-label').value.trim() || al;
          var st = document.getElementById('cl-tail-stereo').value.trim() || null;
          var genStr = document.getElementById('cl-tail-generics').value.trim();
          var gen = genStr ? genStr.split(',').map(function(s) { return s.trim(); }) : null;
          window.MA.history.pushHistory();
          if (k === 'class') out = addClass(t, al, lbl, st, gen);
          else if (k === 'interface') out = addInterface(t, al, lbl, st, gen);
          else out = addAbstract(t, al, lbl, st, gen);
        } else if (k === 'enum') {
          var al2 = document.getElementById('cl-tail-alias').value.trim();
          if (!al2) { alert('Alias 必須'); return; }
          var valsStr = document.getElementById('cl-tail-values').value;
          var vals = valsStr.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(function(s) { return s; });
          window.MA.history.pushHistory();
          out = addEnum(t, al2, al2, vals);
        } else if (k === 'package' || k === 'namespace') {
          var lbl3 = document.getElementById('cl-tail-label').value.trim();
          if (!lbl3) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          out = k === 'package' ? addPackage(t, lbl3) : addNamespace(t, lbl3);
        } else if (k === 'relation') {
          var fr = document.getElementById('cl-tail-from').value;
          var to = document.getElementById('cl-tail-to').value;
          if (!fr || !to) { alert('From/To 必須 (先に要素を追加)'); return; }
          var rkind = document.getElementById('cl-tail-rkind').value;
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, fr, to, document.getElementById('cl-tail-rlabel').value.trim() || null);
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('cl-tail-kind').addEventListener('change', renderTailDetail);
    renderTailDetail();
  }

  function _renderElementEdit(element, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    if (element.kind === 'enum') return _renderEnumEdit(element, parsedData, propsEl, ctx);

    var kindLabel = element.kind === 'interface' ? 'Interface'
                  : element.kind === 'abstract' ? 'Abstract Class'
                  : 'Class';
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
        kindLabel + ' (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'cl-edit-id', element.id) +
        P.fieldHtml('Label', 'cl-edit-label', element.label || '') +
        P.fieldHtml('Stereotype', 'cl-edit-stereo', element.stereotype || '') +
        P.fieldHtml('Generics (カンマ区切り)', 'cl-edit-generics', (element.generics || []).join(',')) +
        P.primaryButtonHtml('cl-edit-apply', '変更を反映') +
        ' ' + P.primaryButtonHtml('cl-rename-refs', 'Alias 変更を関連 Relation にも追従') +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
          '<button id="cl-move-up" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
          '<button id="cl-move-down" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
          '<button id="cl-delete" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';

    if (element.members && element.members.length > 0) {
      var attrs = element.members.filter(function(m) { return m.kind === 'attribute'; });
      var methods = element.members.filter(function(m) { return m.kind === 'method'; });
      html += '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">' +
              '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Attributes</label>';
      attrs.forEach(function(a) {
        html += '<div style="font-size:11px;margin:3px 0;">' +
                window.MA.htmlUtils.escHtml((a.visibility || '') + ' ' + (a.static ? '{static} ' : '') + a.name + (a.type ? ' : ' + a.type : '')) +
                ' <button class="cl-mem-del" data-line="' + a.line + '" style="background:var(--accent-red);color:#fff;border:none;padding:2px 6px;font-size:10px;border-radius:3px;cursor:pointer;">✕</button>' +
                '</div>';
      });
      html += '<button id="cl-add-attr" style="font-size:11px;padding:4px 10px;margin-top:4px;">+ Attribute 追加</button>' +
              '<div id="cl-add-attr-form" style="display:none;margin-top:6px;"></div>' +
              '<label style="display:block;font-size:10px;color:var(--accent);margin:10px 0 4px;font-weight:bold;">Methods</label>';
      methods.forEach(function(m) {
        html += '<div style="font-size:11px;margin:3px 0;">' +
                window.MA.htmlUtils.escHtml((m.visibility || '') + ' ' + (m.static ? '{static} ' : (m.abstract ? '{abstract} ' : '')) + m.name + '(' + (m.params || '') + ')' + (m.type ? ' : ' + m.type : '')) +
                ' <button class="cl-mem-del" data-line="' + m.line + '" style="background:var(--accent-red);color:#fff;border:none;padding:2px 6px;font-size:10px;border-radius:3px;cursor:pointer;">✕</button>' +
                '</div>';
      });
      html += '<button id="cl-add-method" style="font-size:11px;padding:4px 10px;margin-top:4px;">+ Method 追加</button>' +
              '<div id="cl-add-method-form" style="display:none;margin-top:6px;"></div></div>';
    } else {
      html += '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">' +
              '<button id="cl-add-attr" style="font-size:11px;padding:4px 10px;">+ Attribute 追加</button> ' +
              '<button id="cl-add-method" style="font-size:11px;padding:4px 10px;">+ Method 追加</button>' +
              '<div id="cl-add-attr-form" style="display:none;margin-top:6px;"></div>' +
              '<div id="cl-add-method-form" style="display:none;margin-top:6px;"></div></div>';
    }

    propsEl.innerHTML = html;

    P.bindEvent('cl-edit-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newId = document.getElementById('cl-edit-id').value.trim();
      var newLabel = document.getElementById('cl-edit-label').value.trim();
      var newStereo = document.getElementById('cl-edit-stereo').value.trim() || null;
      var genStr = document.getElementById('cl-edit-generics').value.trim();
      var newGen = genStr ? genStr.split(',').map(function(s) { return s.trim(); }) : null;
      if (newId !== element.id) t = updateClass(t, element.line, 'id', newId);
      if (newLabel !== element.label) t = updateClass(t, element.line, 'label', newLabel);
      if (newStereo !== element.stereotype) t = updateClass(t, element.line, 'stereotype', newStereo);
      var oldGen = (element.generics || []).join(',');
      if (genStr !== oldGen) t = updateClass(t, element.line, 'generics', newGen);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('cl-rename-refs', 'click', function() {
      var newId = document.getElementById('cl-edit-id').value.trim();
      if (!newId || newId === element.id) { alert('Alias を変更してから実行してください'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(renameWithRefs(ctx.getMmdText(), element.id, newId));
      ctx.onUpdate();
    });
    P.bindEvent('cl-move-up', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineUp(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('cl-move-down', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineDown(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('cl-delete', 'click', function() {
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), element.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'cl-mem-del', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteMember(ctx.getMmdText(), ln));
      ctx.onUpdate();
    });
    P.bindEvent('cl-add-attr', 'click', function() {
      document.getElementById('cl-add-attr-form').style.display = 'block';
      document.getElementById('cl-add-attr-form').innerHTML =
        P.selectFieldHtml('Visibility', 'cl-aa-vis', [
          { value: '+', label: '+ public', selected: true },
          { value: '-', label: '- private' },
          { value: '#', label: '# protected' },
          { value: '~', label: '~ package' },
        ]) +
        '<label style="font-size:11px;"><input type="checkbox" id="cl-aa-static"> static</label>' +
        P.fieldHtml('Name', 'cl-aa-name', '', '例: count') +
        P.fieldHtml('Type', 'cl-aa-type', '', '例: int') +
        P.primaryButtonHtml('cl-aa-go', '追加');
      P.bindEvent('cl-aa-go', 'click', function() {
        var vis = document.getElementById('cl-aa-vis').value;
        var stat = document.getElementById('cl-aa-static').checked;
        var name = document.getElementById('cl-aa-name').value.trim();
        var typ = document.getElementById('cl-aa-type').value.trim();
        if (!name) { alert('Name 必須'); return; }
        window.MA.history.pushHistory();
        ctx.setMmdText(addAttribute(ctx.getMmdText(), element.line, vis, name, typ, stat));
        ctx.onUpdate();
      });
    });
    P.bindEvent('cl-add-method', 'click', function() {
      document.getElementById('cl-add-method-form').style.display = 'block';
      document.getElementById('cl-add-method-form').innerHTML =
        P.selectFieldHtml('Visibility', 'cl-am-vis', [
          { value: '+', label: '+ public', selected: true },
          { value: '-', label: '- private' },
          { value: '#', label: '# protected' },
          { value: '~', label: '~ package' },
        ]) +
        '<label style="font-size:11px;"><input type="checkbox" id="cl-am-static"> static</label>' +
        '<label style="font-size:11px;"><input type="checkbox" id="cl-am-abstract"> abstract</label>' +
        P.fieldHtml('Name', 'cl-am-name', '', '例: login') +
        P.fieldHtml('Params', 'cl-am-params', '', '例: a : int, b : str') +
        P.fieldHtml('Return type', 'cl-am-ret', '', '例: void') +
        P.primaryButtonHtml('cl-am-go', '追加');
      P.bindEvent('cl-am-go', 'click', function() {
        var vis = document.getElementById('cl-am-vis').value;
        var stat = document.getElementById('cl-am-static').checked;
        var abs = document.getElementById('cl-am-abstract').checked;
        var name = document.getElementById('cl-am-name').value.trim();
        var params = document.getElementById('cl-am-params').value.trim();
        var ret = document.getElementById('cl-am-ret').value.trim();
        if (!name) { alert('Name 必須'); return; }
        window.MA.history.pushHistory();
        ctx.setMmdText(addMethod(ctx.getMmdText(), element.line, vis, name, params, ret, stat, abs));
        ctx.onUpdate();
      });
    });
  }

  function _renderEnumEdit(element, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Enum (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'cl-edit-id', element.id) +
        P.fieldHtml('Stereotype', 'cl-edit-stereo', element.stereotype || '') +
        P.primaryButtonHtml('cl-edit-apply', '変更を反映') +
        '<button id="cl-delete" style="margin-left:8px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Values</label>';
    (element.members || []).forEach(function(v) {
      html += '<div style="font-size:11px;margin:3px 0;">• ' + window.MA.htmlUtils.escHtml(v.name) +
              ' <button class="cl-mem-del" data-line="' + v.line + '" style="background:var(--accent-red);color:#fff;border:none;padding:2px 6px;font-size:10px;border-radius:3px;cursor:pointer;">✕</button></div>';
    });
    html += P.fieldHtml('新しい値', 'cl-add-val-name', '', '例: PURPLE') +
            P.primaryButtonHtml('cl-add-val', '+ Value 追加') +
            '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('cl-edit-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newId = document.getElementById('cl-edit-id').value.trim();
      var newStereo = document.getElementById('cl-edit-stereo').value.trim() || null;
      if (newId !== element.id) t = updateClass(t, element.line, 'id', newId);
      if (newStereo !== element.stereotype) t = updateClass(t, element.line, 'stereotype', newStereo);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('cl-delete', 'click', function() {
      if (!confirm('この enum を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), element.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindEvent('cl-add-val', 'click', function() {
      var name = document.getElementById('cl-add-val-name').value.trim();
      if (!name) { alert('値 必須'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(addEnumValue(ctx.getMmdText(), element.line, name));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'cl-mem-del', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteMember(ctx.getMmdText(), ln));
      ctx.onUpdate();
    });
  }

  function _renderRelationEdit(relation, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
        P.selectFieldHtml('Kind', 'cl-rel-kind', [
          { value: 'association',    label: 'Association (--)', selected: relation.kind === 'association' },
          { value: 'inheritance',    label: 'Inheritance (<|--)', selected: relation.kind === 'inheritance' },
          { value: 'implementation', label: 'Implementation (<|..)', selected: relation.kind === 'implementation' },
          { value: 'composition',    label: 'Composition (*--)', selected: relation.kind === 'composition' },
          { value: 'aggregation',    label: 'Aggregation (o--)', selected: relation.kind === 'aggregation' },
          { value: 'dependency',     label: 'Dependency (..>)', selected: relation.kind === 'dependency' },
        ]) +
        P.fieldHtml('From', 'cl-rel-from', relation.from) +
        '<button id="cl-rel-swap" type="button" style="font-size:11px;padding:4px 10px;margin:4px 0;cursor:pointer;">⇄ From/To 入替</button>' +
        P.fieldHtml('To', 'cl-rel-to', relation.to) +
        P.fieldHtml('Label', 'cl-rel-label', relation.label || '') +
        P.primaryButtonHtml('cl-rel-apply', '変更を反映') +
        ' <button id="cl-rel-delete" type="button" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('cl-rel-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newKind = document.getElementById('cl-rel-kind').value;
      var newFrom = document.getElementById('cl-rel-from').value.trim();
      var newTo = document.getElementById('cl-rel-to').value.trim();
      var newLabel = document.getElementById('cl-rel-label').value.trim() || null;
      if (newKind !== relation.kind) t = updateRelation(t, relation.line, 'kind', newKind);
      if (newFrom !== relation.from) t = updateRelation(t, relation.line, 'from', newFrom);
      if (newTo !== relation.to) t = updateRelation(t, relation.line, 'to', newTo);
      if (newLabel !== relation.label) t = updateRelation(t, relation.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('cl-rel-swap', 'click', function() {
      var f = document.getElementById('cl-rel-from');
      var to = document.getElementById('cl-rel-to');
      var tmp = f.value; f.value = to.value; to.value = tmp;
    });
    P.bindEvent('cl-rel-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), relation.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderGroupReadOnly(group, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
        (group.kind === 'namespace' ? 'NAMESPACE' : 'PACKAGE') +
        ' (L' + group.startLine + '-' + group.endLine + ')</label>' +
        P.fieldHtml('Label', 'cl-grp-label', group.label) +
        P.primaryButtonHtml('cl-grp-apply', '変更を反映') +
        ' <button id="cl-grp-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 境界削除</button>' +
      '</div>';
    propsEl.innerHTML = html;
    P.bindEvent('cl-grp-apply', 'click', function() {
      var newLabel = document.getElementById('cl-grp-label').value.trim();
      if (!newLabel) { alert('Label 必須'); return; }
      window.MA.history.pushHistory();
      var lines = ctx.getMmdText().split('\n');
      var openIdx = group.startLine - 1;
      var indent = lines[openIdx].match(/^(\s*)/)[1];
      lines[openIdx] = indent + (group.kind === 'namespace' ? fmtNamespace(newLabel) : fmtPackage(newLabel));
      ctx.setMmdText(lines.join('\n'));
      ctx.onUpdate();
    });
    P.bindEvent('cl-grp-delete', 'click', function() {
      if (!confirm('この境界を削除しますか？(中身は保持)')) return;
      window.MA.history.pushHistory();
      var lines = ctx.getMmdText().split('\n');
      lines.splice(group.endLine - 1, 1);
      lines.splice(group.startLine - 1, 1);
      ctx.setMmdText(lines.join('\n'));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderMultiSelectConnect(selData, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var allElements = (parsedData.elements || []);
    var nameById = {};
    var typeById = {};
    allElements.forEach(function(e) { nameById[e.id] = e.label || e.id; typeById[e.id] = e.kind; });
    var fromOpt = nameById[selData[0].id] || selData[0].id;
    var toOpt = nameById[selData[1].id] || selData[1].id;

    propsEl.innerHTML =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class - Connect 2 elements</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<div style="margin:8px 0;">' +
          'From: <strong id="cl-conn-from">' + window.MA.htmlUtils.escHtml(fromOpt) + '</strong> ' +
          '<button id="cl-conn-swap" type="button">⇄ swap</button> ' +
          'To: <strong id="cl-conn-to">' + window.MA.htmlUtils.escHtml(toOpt) + '</strong>' +
        '</div>' +
        P.selectFieldHtml('Kind', 'cl-conn-kind', [
          { value: 'association',    label: 'Association (--)', selected: true },
          { value: 'inheritance',    label: 'Inheritance (<|--, parent <|-- child)' },
          { value: 'implementation', label: 'Implementation (<|.., interface <|.. class)' },
          { value: 'composition',    label: 'Composition (*--, container *-- contained)' },
          { value: 'aggregation',    label: 'Aggregation (o--, container o-- part)' },
          { value: 'dependency',     label: 'Dependency (..>)' },
        ]) +
        P.fieldHtml('Label', 'cl-conn-label', '', '任意') +
        P.primaryButtonHtml('cl-conn-create', '+ Connect') +
      '</div>';

    var swapped = false;
    function _doSwap() {
      swapped = !swapped;
      var f = document.getElementById('cl-conn-from');
      var to = document.getElementById('cl-conn-to');
      var tmp = f.textContent; f.textContent = to.textContent; to.textContent = tmp;
    }
    P.bindEvent('cl-conn-swap', 'click', _doSwap);

    P.bindEvent('cl-conn-kind', 'change', function() {
      var k = document.getElementById('cl-conn-kind').value;
      if (k !== 'implementation') return;
      var fromId = swapped ? selData[1].id : selData[0].id;
      var fromType = typeById[fromId];
      if (fromType !== 'interface') {
        var otherId = swapped ? selData[0].id : selData[1].id;
        if (typeById[otherId] === 'interface') _doSwap();
      }
    });

    P.bindEvent('cl-conn-create', 'click', function() {
      window.MA.history.pushHistory();
      var fromId = swapped ? selData[1].id : selData[0].id;
      var toId = swapped ? selData[0].id : selData[1].id;
      var kind = document.getElementById('cl-conn-kind').value;
      var label = document.getElementById('cl-conn-label').value.trim() || null;
      ctx.setMmdText(addRelation(ctx.getMmdText(), kind, fromId, toId, label));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderMultiSelect(selData, parsedData, propsEl) {
    propsEl.innerHTML =
      '<div style="padding:12px;color:var(--text-secondary);font-size:11px;">' +
      selData.length + ' elements selected。Connect は 2 elements まで。' +
      'Shift+クリックで解除できます。</div>';
  }

  return {
    type: 'plantuml-class',
    displayName: 'Class',
    parse: parse,
    template: template,
    renderProps: renderProps,
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: true,
    },

    buildOverlay: function(svgEl, parsedData, overlayEl) {
      if (!svgEl || !overlayEl) return { matched: {}, unmatched: {} };
      var OB = window.MA.overlayBuilder;
      OB.syncDimensions(svgEl, overlayEl);

      function _entityBBox(g) {
        if (!g) return null;
        if (typeof g.getBBox === 'function') {
          try { var bb = g.getBBox(); if (bb && (bb.width > 0 || bb.height > 0)) return bb; }
          catch (e) { /* jsdom fallback */ }
        }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var found = false;
        Array.prototype.forEach.call(g.querySelectorAll('ellipse, rect, text'), function(el) {
          var x, y, w, h;
          if (el.tagName.toLowerCase() === 'rect') {
            x = parseFloat(el.getAttribute('x')) || 0;
            y = parseFloat(el.getAttribute('y')) || 0;
            w = parseFloat(el.getAttribute('width')) || 0;
            h = parseFloat(el.getAttribute('height')) || 0;
          } else if (el.tagName.toLowerCase() === 'ellipse') {
            var cx = parseFloat(el.getAttribute('cx')) || 0;
            var cy = parseFloat(el.getAttribute('cy')) || 0;
            var rx = parseFloat(el.getAttribute('rx')) || 0;
            var ry = parseFloat(el.getAttribute('ry')) || 0;
            x = cx - rx; y = cy - ry; w = rx * 2; h = ry * 2;
          } else {
            x = parseFloat(el.getAttribute('x')) || 0;
            y = parseFloat(el.getAttribute('y')) || 0;
            w = parseFloat(el.getAttribute('textLength')) || 0;
            h = 14;
          }
          if (w === 0 && h === 0) return;
          found = true;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        });
        if (!found) return null;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }

      var matched = { class: 0, interface: 0, abstract: 0, enum: 0, relation: 0, package: 0 };

      (parsedData.elements || []).forEach(function(el) {
        var g = svgEl.querySelector('g.entity[data-qualified-name="' + el.id + '"]');
        if (!g) return;
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 6, bb.width + 12, bb.height + 12, {
          'data-type': el.kind,
          'data-id': el.id,
          'data-line': el.line,
        });
        matched[el.kind]++;
      });

      // package + namespace
      var packages = (parsedData.groups || []);
      var pkgGroups = svgEl.querySelectorAll('g.cluster');
      var pkgN = Math.min(packages.length, pkgGroups.length);
      for (var pi = 0; pi < pkgN; pi++) {
        var pg = pkgGroups[pi];
        var pkgRect = pg.querySelector('rect');
        if (!pkgRect) continue;
        OB.addRect(overlayEl,
          (parseFloat(pkgRect.getAttribute('x')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('y')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('width')) || 0) + 4,
          (parseFloat(pkgRect.getAttribute('height')) || 0) + 4, {
            'data-type': 'package',
            'data-id': packages[pi].id,
            'data-line': packages[pi].startLine,
          });
        matched.package++;
      }

      // relations
      var relations = parsedData.relations || [];
      var linkGroups = svgEl.querySelectorAll('g.link, g[class*="link_"]');
      var relN = Math.min(relations.length, linkGroups.length);
      for (var ri = 0; ri < relN; ri++) {
        var lg = linkGroups[ri];
        var lineEl = lg.querySelector('line, path');
        if (!lineEl) continue;
        var bb2 = OB.extractEdgeBBox(lineEl, 8);
        if (!bb2) continue;
        OB.addRect(overlayEl, bb2.x, bb2.y, bb2.width, bb2.height, {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        });
        matched.relation++;
      }

      return { matched: matched, unmatched: {} };
    },
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
    fmtNote: fmtNote,
    addClass: addClass,
    addInterface: addInterface,
    addAbstract: addAbstract,
    addEnum: addEnum,
    addRelation: addRelation,
    addPackage: addPackage,
    addNamespace: addNamespace,
    addNote: addNote,
    updateClass: updateClass,
    updateInterface: updateClass,
    updateAbstract: updateClass,
    updateEnum: updateClass,
    updateRelation: updateRelation,
    updateNote: updateNote,
    deleteNote: deleteNote,
    addAttribute: addAttribute,
    addMethod: addMethod,
    addEnumValue: addEnumValue,
    updateAttribute: updateAttribute,
    updateMethod: updateMethod,
    deleteMember: deleteMember,
    deleteLine: deleteLine,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    renameWithRefs: renameWithRefs,
  };
})();
