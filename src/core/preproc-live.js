'use strict';
window.MA = window.MA || {};

// preproc-live — プリプロセッサの条件 (!ifdef / !ifndef / !if / !elseif / !else / !endif) を
// 本文の上で解き、PlantUML が描かない枝の行を言う純関数。
//
// BLK-migrator-20260929-1300: `!ifdef U … !else … !endif` の両枝に `A -> B` があると、描かれるのは
// 片方だけなのに、当て方と下端の件数は両方を数えていた。描かれない枝の行は枠が無いのが正しいので、
// 当て損ねとして帯を出さず、件数にも入れない。
//
// 解けない条件 (!include した先の定義に頼る名前、知らない関数、式の形) は「どちらとも言えない」とし、
// その枝の行は描かれる側に置く (今までどおり)。言い切れる枝だけを「描かれない」と言う。
window.MA.preprocLive = (function() {
  var UNK = { unknown: true };   // 値が分からない印

  var BODY_OPEN_RE = /^!(?:unquoted\s+)?(?:procedure|function|definelong)\b/i;
  var BODY_END_RE = /^!end(?:procedure|function|definelong)\b/i;
  var INCLUDE_RE = /^!(?:include\w*|import)\b/i;
  var DEFINE_RE = /^!define\s+([A-Za-z_][A-Za-z0-9_]*)/i;
  var UNDEF_RE = /^!undef\s+([A-Za-z_$][A-Za-z0-9_]*)/i;
  var IFDEF_RE = /^!(ifdef|ifndef)\s+([A-Za-z_$][A-Za-z0-9_]*)\s*$/i;
  var IF_RE = /^!if\s+(.+)$/i;
  var ELSEIF_RE = /^!elseif\s+(.+)$/i;
  var ELSE_RE = /^!else\s*$/i;
  var ENDIF_RE = /^!endif\s*$/i;
  var ASSIGN_RE = /^!(?:(?:local|global)\s+)?(\$[A-Za-z_][A-Za-z0-9_]*)\s*(\?)?=\s*(.*)$/i;

  // ── 式 ──────────────────────────────────────────────────────────────
  // 分からないものに出会ったら UNK を投げ、呼んだ側がその条件を「どちらとも言えない」にする。
  function _tokens(src) {
    var out = [];
    var s = String(src);
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (/\s/.test(ch)) { i++; continue; }
      var two = s.substr(i, 2);
      if (two === '&&' || two === '||' || two === '==' || two === '!=' || two === '<=' || two === '>=') {
        out.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('()<>!,'.indexOf(ch) >= 0) { out.push({ t: 'op', v: ch }); i++; continue; }
      if (ch === '"' || ch === "'") {
        var j = s.indexOf(ch, i + 1);
        if (j < 0) throw UNK;
        out.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      var m = s.slice(i).match(/^-?\d+(?:\.\d+)?/);
      if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = s.slice(i).match(/^[%$]?[A-Za-z_][A-Za-z0-9_]*/);
      if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      throw UNK;
    }
    return out;
  }

  function _truthy(v) {
    if (v === UNK) throw UNK;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'boolean') return v;
    // 文字の真偽は版で扱いが揺れるので言い切らない
    throw UNK;
  }

  function _eval(src, env) {
    var toks = _tokens(src);
    var p = 0;
    function peek() { return toks[p]; }
    function isOp(v) { return toks[p] && toks[p].t === 'op' && toks[p].v === v; }
    function expect(v) { if (!isOp(v)) throw UNK; p++; }

    function primary() {
      var tk = toks[p++];
      if (!tk) throw UNK;
      if (tk.t === 'num' || tk.t === 'str') return tk.v;
      if (tk.t === 'op' && tk.v === '(') { var v = orExpr(); expect(')'); return v; }
      if (tk.t === 'op' && tk.v === '!') return _truthy(primary()) ? 0 : 1;
      if (tk.t === 'id') {
        var name = tk.v;
        if (name.charAt(0) === '%') {
          expect('(');
          var args = [];
          if (!isOp(')')) {
            args.push(orExpr());
            while (isOp(',')) { p++; args.push(orExpr()); }
          }
          expect(')');
          return _call(name.toLowerCase(), args, env);
        }
        if (name.charAt(0) === '$') {
          var val = env.vars[name];
          if (val === undefined || val === UNK) throw UNK;
          return val;
        }
        throw UNK;   // 裸の名前 (マクロの展開) は解かない
      }
      throw UNK;
    }
    function cmp() {
      var a = primary();
      var tk = peek();
      if (tk && tk.t === 'op' && /^(==|!=|<|>|<=|>=)$/.test(tk.v)) {
        p++;
        var b = primary();
        if (a === UNK || b === UNK) throw UNK;
        if (typeof a !== typeof b) {
          // 数と数字の文字は数として比べる (PlantUML の比較と同じ)
          var na = Number(a), nb = Number(b);
          if (isNaN(na) || isNaN(nb)) throw UNK;
          a = na; b = nb;
        }
        switch (tk.v) {
          case '==': return a === b ? 1 : 0;
          case '!=': return a !== b ? 1 : 0;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          default: return a >= b ? 1 : 0;
        }
      }
      return a;
    }
    function andExpr() {
      var v = cmp();
      while (isOp('&&')) { p++; var r = cmp(); v = (_truthy(v) && _truthy(r)) ? 1 : 0; }
      return v;
    }
    function orExpr() {
      var v = andExpr();
      while (isOp('||')) { p++; var r = andExpr(); v = (_truthy(v) || _truthy(r)) ? 1 : 0; }
      return v;
    }
    var v = orExpr();
    if (p !== toks.length) throw UNK;
    return v;
  }

  function _call(name, args, env) {
    if (name === '%true' && args.length === 0) return 1;
    if (name === '%false' && args.length === 0) return 0;
    if (name === '%not' && args.length === 1) return _truthy(args[0]) ? 0 : 1;
    if ((name === '%variable_exists' || name === '%defined') && args.length === 1 && typeof args[0] === 'string') {
      var d = _isDefined(env, args[0]);
      if (d === UNK) throw UNK;
      return d ? 1 : 0;
    }
    if (name === '%strlen' && args.length === 1 && typeof args[0] === 'string') return args[0].length;
    throw UNK;
  }

  // 定義されているか。true / false / UNK。
  function _isDefined(env, name) {
    var key = String(name);
    if (key.charAt(0) === '$') {
      var v = env.vars[key];
      if (v === undefined) return env.tainted ? UNK : false;
      if (v === UNK) return env.varKnown[key] ? true : UNK;
      return true;
    }
    var d = env.defs[key];
    if (d === undefined) return env.tainted ? UNK : false;
    return d;
  }

  // ── 本文を上から読む ──────────────────────────────────────────────────
  // 条件の段ごとに { cur: true|false|UNK (今の枝が描かれるか), taken: true|false|UNK (前の枝で済んだか) }。
  // 行が描かれないのは、どこかの段の cur が false のとき。UNK の段の中は「どちらとも言えない」。
  function analyze(text) {
    var lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);   // dsl-utils.splitLines と同じ割り方
    var env = { defs: {}, vars: {}, varKnown: {}, tainted: false };
    var stack = [];
    var dead = {};
    var count = 0;
    var inBody = false;

    function state() {
      var s = true;
      for (var k = 0; k < stack.length; k++) {
        if (stack[k].cur === false) return false;
        if (stack[k].cur === UNK) s = UNK;
      }
      return s;
    }
    function cond(fn) {
      try { return _truthy(fn()) ; } catch (e) { if (e === UNK) return UNK; throw e; }
    }
    // 前の枝で済んだかと今の条件から、この枝が描かれるかを決める
    function branch(frame, c) {
      if (frame.taken === true) { frame.cur = false; return; }
      if (frame.taken === UNK) {
        // 前の枝が済んだかは分からない。この枝も描かれるかは言えないが、この枝が真なら
        // (前の枝が済んでいてもいなくても) 後ろの枝は描かれない。
        frame.cur = (c === false) ? false : UNK;
        if (c === true) frame.taken = true;
        return;
      }
      frame.cur = c;
      frame.taken = (c === true) ? true : (c === UNK ? UNK : false);
    }

    for (var i = 0; i < lines.length; i++) {
      var ln = i + 1;
      var t = lines[i].trim();
      if (inBody) {
        if (BODY_END_RE.test(t)) inBody = false;
        if (state() === false) { dead[ln] = true; count++; }
        continue;
      }
      var m;
      if ((m = t.match(IFDEF_RE))) {
        var parent = state();
        var frame = { cur: false, taken: true };
        if (parent !== false) {
          var d = _isDefined(env, m[2]);
          var c = (d === UNK) ? UNK : (m[1].toLowerCase() === 'ifdef' ? d : !d);
          frame = { cur: false, taken: false };
          branch(frame, c);
        }
        stack.push(frame);
        continue;
      }
      if ((m = t.match(IF_RE))) {
        var parent2 = state();
        var frame2 = { cur: false, taken: true };
        if (parent2 !== false) {
          var src = m[1];
          frame2 = { cur: false, taken: false };
          branch(frame2, cond(function() { return _eval(src, env); }));
        }
        stack.push(frame2);
        continue;
      }
      if ((m = t.match(ELSEIF_RE)) && stack.length) {
        var top = stack[stack.length - 1];
        var src2 = m[1];
        branch(top, top.taken === true ? false : cond(function() { return _eval(src2, env); }));
        continue;
      }
      if (ELSE_RE.test(t) && stack.length) {
        var top2 = stack[stack.length - 1];
        branch(top2, true);
        continue;
      }
      if (ENDIF_RE.test(t) && stack.length) {
        stack.pop();
        continue;
      }

      var st = state();
      if (st === false) {
        if (t !== '') { dead[ln] = true; count++; }
        continue;
      }
      if (BODY_OPEN_RE.test(t)) { inBody = true; continue; }
      if (INCLUDE_RE.test(t)) { env.tainted = true; continue; }
      if ((m = t.match(DEFINE_RE))) { env.defs[m[1]] = (st === true) ? true : UNK; continue; }
      if ((m = t.match(UNDEF_RE))) {
        if (m[1].charAt(0) === '$') { env.vars[m[1]] = (st === true) ? undefined : UNK; }
        else env.defs[m[1]] = (st === true) ? false : UNK;
        continue;
      }
      if ((m = t.match(ASSIGN_RE))) {
        var name = m[1];
        if (m[2] && env.vars[name] !== undefined && env.vars[name] !== UNK) continue;   // ?= は既にあれば何もしない
        var val = UNK;
        if (st === true) {
          try { val = _eval(m[3], env); } catch (e) { if (e !== UNK) throw e; val = UNK; }
        }
        env.vars[name] = val;
        // 値は分からなくても、描かれる側で代入したなら「在る」ことは言える
        env.varKnown[name] = (st === true);
        continue;
      }
    }
    return { dead: dead, count: count };
  }

  // 描かれない枝の行 (1 始まり) を { 行: true } で返す。無ければ空のオブジェクト。
  function deadLines(text) {
    if (!/^\s*!(?:if|ifdef|ifndef)\b/im.test(String(text == null ? '' : text))) return {};
    return analyze(text).dead;
  }

  return { deadLines: deadLines, analyze: analyze };
})();
