'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlClass = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
  var ID = RP.IDENTIFIER;

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    return result;  // implemented in Phase A
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
