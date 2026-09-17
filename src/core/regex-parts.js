'use strict';
window.MA = window.MA || {};
window.MA.regexParts = (function() {

  var IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*';
  var QUOTED_NAME = '"[^"]+"';
  var IDENTIFIER_OR_QUOTED = '(?:' + IDENTIFIER + '|' + QUOTED_NAME + ')';
  // BLK-migrator-20260918-0249: PlantUML は矢印の中に置き方の指示を書ける
  // (`-up->` `-right->` と 1 文字の `-u->` `-r->`)。線の意味は変わらず、
  // 図の中でどちらへ伸ばすかだけが変わる。矢印トークンを読むところは
  // 図種によらずここを使い、方向語を落とさない。長い綴りを先に並べる。
  var ARROW_DIRECTION = '(?:up|down|left|right|u|d|l|r)';

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
    ARROW_DIRECTION: ARROW_DIRECTION,
    isStartUml: isStartUml,
    isEndUml: isEndUml,
  };
})();
