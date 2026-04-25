'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlComponent = (function() {
  var DU = window.MA.dslUtils;
  var RP = window.MA.regexParts;
  var ID = RP.IDENTIFIER;

  // component: keyword form (with capturing label group inlined since RP.QUOTED_NAME is non-capturing)
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var COMPONENT_KW_RE = new RegExp(
    '^component\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // component: [X] / [Label] as Alias
  var COMPONENT_SHORT_RE = /^\[([^\]]+)\](?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  // interface: keyword form
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var INTERFACE_KW_RE = new RegExp(
    '^interface\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // interface: () X / () X as I
  var INTERFACE_SHORT_RE = /^\(\)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  var PACKAGE_OPEN_RE = new RegExp(
    '^(?:package|folder|frame|node|rectangle)\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );
  var PACKAGE_CLOSE_RE = /^\s*\}\s*$/;

  var PORT_KW_RE = new RegExp(
    '^port\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );

  var RELATION_RE = new RegExp(
    '^(' + ID + '|"[^"]+")\\s+(-\\(\\)|\\(\\)-|\\)-|-\\(|\\.\\.>|<\\.\\.|-->|<--|--|<-|->)\\s+(' + ID + '|"[^"]+")(?:\\s*:\\s*(.+))?$'
  );

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function fmtComponent(id, label) {
    if (label && label !== id) return 'component "' + label + '" as ' + id;
    return 'component ' + id;
  }
  function fmtInterface(id, label) {
    if (label && label !== id) return 'interface "' + label + '" as ' + id;
    return 'interface ' + id;
  }
  function fmtPort(id, label) {
    if (label && label !== id) return 'port "' + label + '" as ' + id;
    return 'port ' + id;
  }
  function fmtPackage(label) {
    return 'package "' + label + '" {';
  }
  function fmtRelation(kind, from, to, label) {
    var lbl = label || '';
    if (kind === 'dependency') return from + ' ..> ' + to + (lbl ? ' : ' + lbl : '');
    if (kind === 'provides') return from + ' -() ' + to;
    if (kind === 'requires') return from + ' )- ' + to;
    return from + ' -- ' + to + (lbl ? ' : ' + lbl : '');
  }

  function addComponent(text, id, label) { return insertBeforeEnd(text, fmtComponent(id, label || id)); }
  function addInterface(text, id, label) { return insertBeforeEnd(text, fmtInterface(id, label || id)); }
  function addPort(text, id, label) { return insertBeforeEnd(text, fmtPort(id, label || id)); }
  function addPackage(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtPackage(label)), '}');
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }

  function updateComponent(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(COMPONENT_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(COMPONENT_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtComponent(id, label);
    return lines.join('\n');
  }

  function updateInterface(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label, labelImplicit = false;
    var km = trimmed.match(INTERFACE_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else {
        id = km[3];
        if (km[4] !== undefined) { label = km[4]; }
        else { label = km[3]; labelImplicit = true; }
      }
    } else {
      var sm = trimmed.match(INTERFACE_SHORT_RE);
      if (!sm) return text;
      // () X / () X as I:  m[1] = X (token), m[2] = I (alias)
      var firstToken = sm[1].trim();
      id = sm[2] || firstToken;
      label = firstToken;
    }
    if (field === 'id') {
      id = value;
      if (labelImplicit) label = value;
    } else if (field === 'label') label = value;
    lines[idx] = indent + fmtInterface(id, label);
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
    if (arrow === '-()' || arrow === '()-') kind = 'provides';
    else if (arrow === ')-' || arrow === '-(') kind = 'requires';
    else if (arrow === '..>' || arrow === '<..' || arrow === '.>') kind = 'dependency';

    if (field === 'kind') kind = value;
    else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') lbl = value;

    lines[idx] = indent + fmtRelation(kind, from, to, lbl);
    return lines.join('\n');
  }

  function deleteLine(text, lineNum) { return window.MA.textUpdater.deleteLine(text, lineNum); }
  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

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

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    var packageStack = [];
    var packageCounter = 0;
    var lastComponentId = null;

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

      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var pkgLabel = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var parent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', id: pkgId, label: pkgLabel, startLine: lineNum, endLine: 0, parentId: parent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }
      if (PACKAGE_CLOSE_RE.test(lines[i])) {
        if (packageStack.length > 0) {
          var closing = packageStack.pop();
          closing.endLine = lineNum;
        }
        continue;
      }
      var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;

      var m;
      // component keyword
      m = trimmed.match(COMPONENT_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'component', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = id;  // track for port adjacency
        continue;
      }
      // component short [X] / [Label] as Alias
      m = trimmed.match(COMPONENT_SHORT_RE);
      if (m) {
        var label2 = m[1].trim();
        var id2 = m[2] || label2;
        result.elements.push({ kind: 'component', id: id2, label: label2, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = id2;  // track for port adjacency
        continue;
      }
      // interface keyword
      m = trimmed.match(INTERFACE_KW_RE);
      if (m) {
        var id3, label3;
        if (m[2] !== undefined) { id3 = m[2]; label3 = m[1]; }
        else { id3 = m[3]; label3 = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'interface', id: id3, label: label3, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = null;  // interface breaks component adjacency
        continue;
      }
      // interface short () X / () X as I
      // - `() X`        → id=X, label=X  (no `as` clause)
      // - `() X as I`   → id=I, label=X  (alias replaces id; first token becomes label)
      m = trimmed.match(INTERFACE_SHORT_RE);
      if (m) {
        var firstTok = m[1].trim();
        var alias = m[2];
        var realId = alias || firstTok;
        var realLabel = firstTok;
        result.elements.push({ kind: 'interface', id: realId, label: realLabel, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = null;  // interface breaks component adjacency
        continue;
      }
      // port (keyword form): port ID | port "Label" as ID | port ID as "Label"
      m = trimmed.match(PORT_KW_RE);
      if (m) {
        var portId, portLabel;
        if (m[2] !== undefined) { portId = m[2]; portLabel = m[1]; }
        else { portId = m[3]; portLabel = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({
          kind: 'port', id: portId, label: portLabel,
          parentComponentId: lastComponentId,
          line: lineNum, parentPackageId: currentPackageId
        });
        // port does NOT reset lastComponentId — multiple ports can follow
        continue;
      }
      // relations: --, -->, ..>, lollipop -()/()-/)-/-(, with optional ": label"
      m = trimmed.match(RELATION_RE);
      if (m) {
        var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
        var from = DU.unquote(fromRaw);
        var to = DU.unquote(toRaw);
        var kind = 'association';

        if (arrow === '-()') {
          kind = 'provides';
        } else if (arrow === '()-') {
          kind = 'provides';
          var tmp = from; from = to; to = tmp; arrow = '-()';
        } else if (arrow === ')-') {
          kind = 'requires';
        } else if (arrow === '-(') {
          kind = 'requires';
          var tmp2 = from; from = to; to = tmp2; arrow = ')-';
        } else if (arrow === '..>' || arrow === '.>') {
          kind = 'dependency';
        } else if (arrow === '<..') {
          kind = 'dependency';
          var tmp3 = from; from = to; to = tmp3; arrow = '..>';
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
    type: 'plantuml-component',
    displayName: 'Component',
    parse: parse,
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-component'; },
    template: function() {
      return [
        '@startuml',
        'title Sample Component',
        'component WebApp',
        'interface IAuth',
        '',
        'WebApp -() IAuth',
        '@enduml',
      ].join('\n');
    },
    fmtComponent: fmtComponent,
    fmtInterface: fmtInterface,
    fmtPort: fmtPort,
    fmtPackage: fmtPackage,
    fmtRelation: fmtRelation,
    addComponent: addComponent,
    addInterface: addInterface,
    addPort: addPort,
    addPackage: addPackage,
    addRelation: addRelation,
    updateComponent: updateComponent,
    updateInterface: updateInterface,
    updateRelation: updateRelation,
    deleteLine: deleteLine,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    renameWithRefs: renameWithRefs,
  };
})();
