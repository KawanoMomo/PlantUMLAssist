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

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

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

      var m;
      // component keyword
      m = trimmed.match(COMPONENT_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'component', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: null });
        continue;
      }
      // component short [X] / [Label] as Alias
      m = trimmed.match(COMPONENT_SHORT_RE);
      if (m) {
        var label2 = m[1].trim();
        var id2 = m[2] || label2;
        result.elements.push({ kind: 'component', id: id2, label: label2, stereotype: null, line: lineNum, parentPackageId: null });
        continue;
      }
      // interface keyword
      m = trimmed.match(INTERFACE_KW_RE);
      if (m) {
        var id3, label3;
        if (m[2] !== undefined) { id3 = m[2]; label3 = m[1]; }
        else { id3 = m[3]; label3 = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'interface', id: id3, label: label3, stereotype: null, line: lineNum, parentPackageId: null });
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
        result.elements.push({ kind: 'interface', id: realId, label: realLabel, stereotype: null, line: lineNum, parentPackageId: null });
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
  };
})();
