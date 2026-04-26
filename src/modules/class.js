'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlClass = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
  var ID = RP.IDENTIFIER;

  // class declaration: keyword + id (with optional quoted label)
  // groups: 1=quoted label (with as), 2=alias ID, 3=bare ID, 4=quoted label (trailing as)
  var CLASS_KW_RE = new RegExp(
    '^class\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*\\{?\\s*$'
  );

  var ATTRIBUTE_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?(' + ID + ')\\s*(?::\\s*(.+))?\\s*$'
  );

  var METHOD_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?(' + ID + ')\\s*\\(([^)]*)\\)\\s*(?::\\s*(.+))?\\s*$'
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

      var m = trimmed.match(CLASS_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        var hasBlock = /\{\s*$/.test(trimmed);
        var el = {
          kind: 'class', id: id, label: label,
          stereotype: null, generics: null, members: [],
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
