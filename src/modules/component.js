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
  };
})();
