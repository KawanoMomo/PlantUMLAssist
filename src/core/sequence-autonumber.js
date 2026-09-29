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

  // BLK-migrator-20260918-0549: 実物の図は書式指定つきの autonumber を使う
  // (`autonumber 10 5 "<b>[000]"` / `autonumber "<b>[000]"`)。書式を読めないと
  // 「番号なし」と出てしまい、そこで番号を触ると 2 本目の autonumber 行が入って
  // 実物の採番が勝手に変わる。書式もここで読み、書き戻すときはそのまま残す。
  var LINE_RE = /^\s*autonumber(?:\s+(\d+)(?:\s+(\d+))?)?(?:\s+"((?:[^"\\]|\\.)*)")?\s*$/i;
  // `autonumber stop` / `resume` / `inc` は本モジュールが書く行ではないので触らない。
  var CONTROL_RE = /^\s*autonumber\s+(stop|resume|inc)\b/i;

  function isAutonumberLine(line) {
    if (typeof line !== 'string') return false;
    if (CONTROL_RE.test(line)) return false;
    return LINE_RE.test(line);
  }

  function _fmt(v) {
    return (typeof v === 'string' && v !== '') ? v : '';
  }

  // fmtLine: 既定 (1, 1) なら `autonumber` とだけ書く。設計の意図が読める最短の形にする。
  // 書式を渡されたらそのまま末尾に付ける (PlantUML の `autonumber [開始 [増分]] ["書式"]`)。
  function fmtLine(start, step, format) {
    var s = _num(start, 1), st = _num(step, 1);
    var head;
    if (s === 1 && st === 1) head = 'autonumber';
    else if (st === 1) head = 'autonumber ' + s;
    else head = 'autonumber ' + s + ' ' + st;
    var f = _fmt(format);
    return f ? head + ' "' + f + '"' : head;
  }

  // read: 今の DSL の状態。行が無ければ { on: false, start: 1, step: 1, format: '' }。
  function read(dsl) {
    var lines = String(dsl == null ? '' : dsl).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (CONTROL_RE.test(lines[i])) continue;
      var m = lines[i].match(LINE_RE);
      if (m) {
        return { on: true, start: _num(m[1], 1), step: _num(m[2], 1),
                 format: _fmt(m[3]), line: i + 1 };
      }
    }
    return { on: false, start: 1, step: 1, format: '', line: null };
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

    // 書式は指定されなければ今の行のものを引き継ぐ。開始・増分を触っただけで
    // 実物の書式指定が消えると、図の見た目が勝手に変わる。
    var format = o.format;
    if (format === undefined && at >= 0) {
      var cur = lines[at].match(LINE_RE);
      format = cur ? _fmt(cur[3]) : '';
    }
    var want = fmtLine(o.start, o.step, format);
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
