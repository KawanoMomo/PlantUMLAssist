'use strict';
window.MA = window.MA || {};
window.MA.regexParts = (function() {

  var IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*';
  var QUOTED_NAME = '"[^"]+"';
  var IDENTIFIER_OR_QUOTED = '(?:' + IDENTIFIER + '|' + QUOTED_NAME + ')';

  var START_UML_RE = /^\s*@startuml\b/;
  var END_UML_RE = /^\s*@enduml\b/;

  function isStartUml(line) {
    if (line == null) return false;
    return START_UML_RE.test(line);
  }

  function isEndUml(line) {
    if (line == null) return false;
    return END_UML_RE.test(line);
  }

  return {
    IDENTIFIER: IDENTIFIER,
    QUOTED_NAME: QUOTED_NAME,
    IDENTIFIER_OR_QUOTED: IDENTIFIER_OR_QUOTED,
    isStartUml: isStartUml,
    isEndUml: isEndUml,
  };
})();
