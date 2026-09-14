'use strict';
// sequence-autonumber — シーケンス図のメッセージ通し番号 (design 5b の網羅表)。
//
// PlantUML の `autonumber` は @startuml の直後に置く図全体の指定で、
// `autonumber`(1 から 1 ずつ) / `autonumber 10`(開始番号) / `autonumber 10 5`(開始と増分)
// の 3 つの形をとる。読み書きの判断をここに 1 つだけ置く。DOM には依存しない。
window.MA = window.MA || {};
window.MA.sequenceAutonumber = (function() {

  // 開始・増分は正の整数だけ。空欄や不正値は既定 (1) に落とす。
  function _num(v, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return fallback;
    return n;
  }

  var LINE_RE = /^\s*autonumber(?:\s+(\d+)(?:\s+(\d+))?)?\s*$/i;
  // `autonumber stop` / `resume` は本モジュールが書く行ではないので触らない。
  var CONTROL_RE = /^\s*autonumber\s+(stop|resume)\b/i;

  function isAutonumberLine(line) {
    return typeof line === 'string' && LINE_RE.test(line);
  }

  // fmtLine: 既定 (1, 1) なら `autonumber` とだけ書く。設計の意図が読める最短の形にする。
  function fmtLine(start, step) {
    var s = _num(start, 1), st = _num(step, 1);
    if (s === 1 && st === 1) return 'autonumber';
    if (st === 1) return 'autonumber ' + s;
    return 'autonumber ' + s + ' ' + st;
  }

  // read: 今の DSL の状態。行が無ければ { on: false, start: 1, step: 1 }。
  function read(dsl) {
    var lines = String(dsl == null ? '' : dsl).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (CONTROL_RE.test(lines[i])) continue;
      var m = lines[i].match(LINE_RE);
      if (m) return { on: true, start: _num(m[1], 1), step: _num(m[2], 1), line: i + 1 };
    }
    return { on: false, start: 1, step: 1, line: null };
  }

  // apply: on なら @startuml の直後に 1 行だけ置く。off なら消す。
  // 既にある行は書き換えるだけで、位置は動かさない (利用者が動かした場所を尊重する)。
  function apply(dsl, opts) {
    var text = String(dsl == null ? '' : dsl);
    var o = opts || {};
    var lines = text.split('\n');
    var at = -1;
    for (var i = 0; i < lines.length; i++) {
      if (CONTROL_RE.test(lines[i])) continue;
      if (LINE_RE.test(lines[i])) { at = i; break; }
    }

    if (!o.on) {
      if (at < 0) return text;
      lines.splice(at, 1);
      return lines.join('\n');
    }

    var want = fmtLine(o.start, o.step);
    if (at >= 0) {
      var indent = lines[at].match(/^(\s*)/)[1];
      if (lines[at] === indent + want) return text;
      lines[at] = indent + want;
      return lines.join('\n');
    }
    // @startuml の直後。見つからなければ先頭に置く。
    var insertAt = 0;
    for (var j = 0; j < lines.length; j++) {
      if (window.MA.regexParts.isStartUml(lines[j])) { insertAt = j + 1; break; }
    }
    lines.splice(insertAt, 0, want);
    return lines.join('\n');
  }

  return {
    isAutonumberLine: isAutonumberLine,
    fmtLine: fmtLine,
    read: read,
    apply: apply,
  };
})();
