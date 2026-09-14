'use strict';
window.MA = window.MA || {};

// scope-decl — シーケンス図が「どの状態遷移を担当するか」を図の中に宣言する。
//
// これまで trace-coverage と family-audit は、図の中身の語彙一致率から
// 「初期化専用シーケンス vs フル状態遷移」の粒度差を推測していた。推測なので
// 系統が増えるたびに新しい誤検出パターンが生まれる。ここでは作った側が
// 意図そのものを書く: シーケンス図の DSL に
//
//   ' @covers Idle -> Configured
//
// という行を置くと、その図は宣言された遷移だけを担当すると読む。宣言のある
// 系統では、宣言されていない遷移は突き合わせの対象外になり、漏れとして
// 数えない。正本は PlantUML テキストのままなので、保存・再読込・git diff の
// どれでも宣言が一緒に動く。
window.MA.scopeDecl = (function() {
  var MARK = '@covers';
  // `' @covers A -> B`。PlantUML のコメント (`'`) なのでレンダリングには出ない。
  var LINE_RE = /^\s*'\s*@covers\s+(.+?)\s*$/i;
  var PAIR_RE = /^\s*("[^"]*"|\[\*\]|[^\s>-][^>]*?)\s*(?:-+>+|=+>|\.+>)\s*("[^"]*"|\[\*\]|.+?)\s*$/;

  // 状態名の比較キー。引用符と大小と区切り記号の揺れを吸収する
  // (`"Idle State"` と `Idle_State` を同じものとして扱う)。
  function stateKey(name) {
    var s = String(name == null ? '' : name).trim();
    if (s === '[*]') return '[*]';
    s = s.replace(/^"(.*)"$/, '$1');
    return s.toLowerCase().replace(/[\s_\-.]+/g, '');
  }

  function _pair(text) {
    var m = String(text == null ? '' : text).match(PAIR_RE);
    if (!m) return null;
    var from = m[1].trim(), to = m[2].trim();
    if (!from || !to) return null;
    return { from: from, to: to };
  }

  // DSL に書かれた宣言。行番号も返す (画面から該当行へ飛べるように)。
  function parse(dsl) {
    var covers = [];
    var lines = [];
    String(dsl == null ? '' : dsl).split(/\r?\n/).forEach(function(line, i) {
      var m = line.match(LINE_RE);
      if (!m) return;
      lines.push(i + 1);
      m[1].split(/\s*,\s*/).forEach(function(part) {
        var p = _pair(part);
        if (!p) return;
        p.line = i + 1;
        if (!covers.some(function(c) { return same(c, p); })) covers.push(p);
      });
    });
    return { declared: lines.length > 0, covers: covers, lines: lines };
  }

  function declared(dsl) { return parse(dsl).declared; }

  function same(a, b) {
    if (!a || !b) return false;
    return stateKey(a.from) === stateKey(b.from) && stateKey(a.to) === stateKey(b.to);
  }

  // 遷移 (from/to を持つもの) が宣言のどれかに当たるか。
  function covered(covers, transition) {
    return (covers || []).some(function(c) { return same(c, transition); });
  }

  function formatLine(c) {
    return "' " + MARK + ' ' + String(c.from).trim() + ' -> ' + String(c.to).trim();
  }

  function label(c) {
    return String(c.from).trim() + ' → ' + String(c.to).trim();
  }

  // 宣言を書き直す。既存の `' @covers` 行を全部落としてから、@startuml の
  // 直後 (title 等があればその後) にまとめて置く。空配列なら宣言を消す
  // = その図は「全部が対象」に戻る。
  function apply(dsl, covers) {
    var src = String(dsl == null ? '' : dsl);
    var eol = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    var lines = src.split(/\r?\n/).filter(function(line) { return !LINE_RE.test(line); });
    var list = (covers || []).filter(function(c) { return c && c.from && c.to; });
    if (!list.length) return lines.join(eol);

    var at = 0;
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*@startuml/i.test(lines[i])) { at = i + 1; break; }
    }
    while (at < lines.length && /^\s*(?:title|header|footer|autonumber|skinparam|hide|scale)\b/i.test(lines[at])) at++;

    var block = list.map(formatLine);
    Array.prototype.splice.apply(lines, [at, 0].concat(block));
    return lines.join(eol);
  }

  return {
    MARK: MARK,
    LINE_RE: LINE_RE,
    stateKey: stateKey,
    parse: parse,
    declared: declared,
    same: same,
    covered: covered,
    formatLine: formatLine,
    label: label,
    apply: apply,
  };
})();
