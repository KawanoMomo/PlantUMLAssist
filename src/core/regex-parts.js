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

  // BLK-migrator-20260929-2003: 矢印の線の中の書式 `[…]`。PlantUML は線の中のどこにでも 1 つ置け、中身は
  // #色・bold・dashed・dotted・hidden・plain・thickness=N をカンマで並べたもの (`-[bold]>` `--[#green]>`
  // `-[#red,bold]->` `<-[dashed]-`)。図種ごとに「# の色だけ」「最初の - の直後だけ」と別々に読むと、
  // それ以外の書き方の行が要素として読めず枠が出ない。矢印を読む所 (sequence のメッセージ・state の遷移・
  // class / component / usecase の関係) はこの断片を線の中に挟み、書き戻しは下の関数で中の語を残す。
  var ARROW_STYLE = '\\[[^\\]\\r\\n]*\\]';
  var ARROW_STYLE_RE = /\[([^\]\r\n]*)\]/;

  // 矢印トークン (`-[#red,bold]->`) の書式の語。無ければ []。
  function arrowStyle(arrow) {
    var m = String(arrow == null ? '' : arrow).match(ARROW_STYLE_RE);
    if (!m) return [];
    return m[1].split(',').map(function(w) { return w.trim(); }).filter(function(w) { return w.length > 0; });
  }
  // 書式を外した矢印 (`-[#red,bold]->` → `-->`)。線の形を見るときに使う。
  function stripArrowStyle(arrow) {
    return String(arrow == null ? '' : arrow).replace(ARROW_STYLE_RE, '');
  }
  // 書式の語を丸ごと差し替える。書式があればその場所で、無ければ最初の線 (- / .) の直後に置く。
  // 語が空なら `[]` ごと外す。
  function setArrowStyle(arrow, words) {
    var a = String(arrow == null ? '' : arrow);
    var ws = (words || []).filter(function(w) { return w && String(w).trim(); });
    var body = ws.length ? '[' + ws.join(',') + ']' : '';
    var m = a.match(ARROW_STYLE_RE);
    if (m) return a.slice(0, m.index) + body + a.slice(m.index + m[0].length);
    if (!body) return a;
    var i = a.search(/[-.]/);
    if (i < 0) return a;
    return a.slice(0, i + 1) + body + a.slice(i + 1);
  }
  // 書式の中の色 (`#` を除く)。無ければ ''。
  function arrowStyleColor(arrow) {
    var ws = arrowStyle(arrow);
    for (var i = 0; i < ws.length; i++) if (ws[i].charAt(0) === '#') return ws[i].slice(1);
    return '';
  }
  // 色だけを差し替える。bold・dashed などの他の語と、書式の置き場所はそのまま残す。
  function setArrowStyleColor(arrow, color) {
    var c = String(color == null ? '' : color).trim().replace(/^#/, '');
    var ws = arrowStyle(arrow), out = [], put = false;
    ws.forEach(function(w) {
      if (w.charAt(0) !== '#') { out.push(w); return; }
      if (c && !put) { out.push('#' + c); put = true; }
    });
    if (c && !put) out.unshift('#' + c);
    return setArrowStyle(arrow, out);
  }
  // 矢印の形を選び直したとき、元の矢印の書式 (色も bold も) を新しい形へ運ぶ。
  // 新しい形が自分の色を持つ (`-[#red]>` を選んだ) ときはその色を優先し、他の語は元から運ぶ。
  function carryArrowStyle(toArrow, fromArrow) {
    var own = arrowStyleColor(toArrow);
    var out = setArrowStyle(stripArrowStyle(toArrow), arrowStyle(fromArrow));
    return own ? setArrowStyleColor(out, own) : out;
  }

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
    ARROW_STYLE: ARROW_STYLE,
    arrowStyle: arrowStyle,
    stripArrowStyle: stripArrowStyle,
    setArrowStyle: setArrowStyle,
    arrowStyleColor: arrowStyleColor,
    setArrowStyleColor: setArrowStyleColor,
    carryArrowStyle: carryArrowStyle,
    isStartUml: isStartUml,
    isEndUml: isEndUml,
  };
})();
