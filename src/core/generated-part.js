'use strict';
window.MA = window.MA || {};

// generated-part — 選んだ部品が「その部品 1 つだけを書いた行」から描かれたものかを見分ける。
//
// BLK-owner-20260929-2131-1: !while で 3 人作った参加者の 1 人の名前を右パネルで直すと、ひな形の行
// (`participant "サービス$i" as S$i`) が書き換わって 3 人とも同じ名前になり、Alias を直すとメッセージの参照だけが
// 替わって宣言の無い参加者が増えた。!procedure の呼び出し (RETRY(B)) の矢印は本文を直しても何も書かれなかった。
// 1 つの部品の欄を直す形は、1 部品 1 行の行にしか効かない。それ以外の行から描かれた部品は、右パネル・キー操作・
// ドラッグで書き換えず、どの行が作っているかを 1 行で言う (app.js の _generatedOfSelection)。
//
// 見分け方は描いた側と本文の行の対応で行い、記法ごとの例外は足さない:
//   - その行が !while / !foreach の中 (1 行が繰り返しの回数だけ部品を描く)
//   - その行が !procedure / !function / !definelong の中身 (呼んだ所に描かれる型紙)
//   - その行が本文で定義した手続き・引数つき !define を呼んでいる (呼んだ行が中身の部品を描く)
//   - その行の名前・文言が $変数 や %関数 で決まる (欄は展開前の字面、図は展開後の値)
//   - 部品が展開後の行から読まれている (preproc-expand が element.expanded を付けた。本文の字面と欄の値が違う)
//   - 展開が手元にあり、その行の展開結果が字面と違い、しかも $ / % を含む (!include した先の変数など)
// どれでもない行 (1 部品 1 行の普通の行) は今までどおり直せる。
window.MA.generatedPart = (function() {
  var LOOP_OPEN_RE = /^!(while|foreach)\b/i;
  var LOOP_END_RE = /^!end(?:while|for|foreach)\b/i;
  var BODY_OPEN_RE = /^!(?:unquoted\s+)?(procedure|function|definelong)\s+([$A-Za-z_][\w$]*)/i;
  var BODY_END_RE = /^!end(?:procedure|function|definelong)\b/i;
  var DEFINE_ARGS_RE = /^!define\s+([$A-Za-z_][\w$]*)\s*\(/i;
  var VAR_DECL_RE = /^!(?:(?:global|local)\s+)?(\$[A-Za-z_]\w*)\s*\??=/i;
  var FOREACH_VAR_RE = /^!foreach\s+(\$[A-Za-z_]\w*)/i;
  var FN_CALL_RE = /%[A-Za-z_]\w*\s*\(/;
  var VAR_USE_RE = /\$[A-Za-z_]\w*/g;

  function _lines(text) { return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n'); }
  function _escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  var _memo = { text: null, scan: null };

  // 本文の骨組み: 各行がどの繰り返し・どの手続きの中にあるか、本文で定義した手続きと変数。
  function scan(text) {
    text = String(text == null ? '' : text);
    if (_memo.text === text) return _memo.scan;
    var lines = _lines(text);
    var loopOf = {}, bodyOf = {}, procs = {}, vars = {};
    var loops = [], body = null;
    for (var i = 0; i < lines.length; i++) {
      var L = i + 1, t = lines[i].trim();
      if (body) {
        if (BODY_END_RE.test(t)) { body.end = L; body = null; continue; }
        bodyOf[L] = body;
        continue;
      }
      var mb = t.match(BODY_OPEN_RE);
      if (mb && !/!return\b/i.test(t)) {
        body = { at: L, end: 0, name: mb[2], word: '!' + mb[1].toLowerCase() };
        procs[mb[2]] = body;
        continue;
      }
      if (mb) { procs[mb[2]] = { at: L, end: L, name: mb[2], word: '!' + mb[1].toLowerCase() }; continue; }
      var md = t.match(DEFINE_ARGS_RE);
      if (md) { procs[md[1]] = { at: L, end: L, name: md[1], word: '!define' }; continue; }
      var mv = t.match(VAR_DECL_RE);
      if (mv && !vars[mv[1]]) vars[mv[1]] = L;
      var mf = t.match(FOREACH_VAR_RE);
      if (mf && !vars[mf[1]]) vars[mf[1]] = L;
      if (LOOP_OPEN_RE.test(t)) {
        loops.push({ at: L, end: 0, word: '!' + t.match(LOOP_OPEN_RE)[1].toLowerCase() });
        continue;
      }
      if (LOOP_END_RE.test(t)) {
        var lp = loops.pop();
        if (lp) lp.end = L;
        continue;
      }
      if (loops.length) loopOf[L] = loops[0];   // 入れ子の繰り返しは外側で言う (外側を直せば全部が変わる)
    }
    var res = { lines: lines, loopOf: loopOf, bodyOf: bodyOf, procs: procs, vars: vars };
    _memo = { text: text, scan: res };
    return res;
  }

  function _callee(sc, t) {
    var names = Object.keys(sc.procs);
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var re = new RegExp((n.charAt(0) === '$' ? '' : '(^|[^\\w$%])') + _escRe(n) + '\\s*\\(');
      if (re.test(t)) return sc.procs[n];
    }
    return null;
  }

  function _varUse(sc, t) {
    var m = t.match(VAR_USE_RE) || [];
    for (var i = 0; i < m.length; i++) if (sc.vars[m[i]]) return { name: m[i], at: sc.vars[m[i]] };
    var f = t.match(FN_CALL_RE);
    if (f) return { name: f[0].replace(/\s*\($/, '()'), at: 0 };
    return null;
  }

  function _range(a, b) { return b && b !== a ? 'L' + a + '〜L' + b : 'L' + a; }

  // text の line 行目から描かれた部品が、1 部品 1 行の行でないなら { kind, line, at, message } を返す。普通の行は null。
  // el: パース結果の部品 (expanded を見る)。opts.callLines: 展開で字面が変わった行 ({L: true}。preproc-expand)。
  function of(text, line, el, opts) {
    line = Number(line) || 0;
    if (line < 1) return null;
    var sc = scan(text);
    var raw = sc.lines[line - 1];
    if (raw == null) return null;
    var t = raw.trim();
    if (!t || t.charAt(0) === '!' || t.charAt(0) === "'" || /^@(start|end)/i.test(t)) {
      if (!(el && el.expanded)) return null;
    }
    var lp = sc.loopOf[line];
    if (lp) {
      return { kind: 'loop', line: line, at: lp.at, end: lp.end,
        message: 'この部品は L' + lp.at + ' の繰り返し (' + lp.word + ') が作っています。直すには本文の L' + line +
          ' を直す (繰り返しで作られる部品がそろって変わります)' };
    }
    var bd = sc.bodyOf[line];
    if (bd) {
      return { kind: 'body', line: line, at: bd.at, end: bd.end, name: bd.name,
        message: 'この部品は L' + bd.at + ' の手続き ' + bd.name + ' の中身が作っています。直すには本文の L' + line +
          ' を直す (' + bd.name + ' を呼んだ所がそろって変わります)' };
    }
    var ce = _callee(sc, t);
    if (ce) {
      return { kind: 'call', line: line, at: ce.at, end: ce.end, name: ce.name,
        message: 'この部品は L' + line + ' で呼んだ手続き ' + ce.name + ' が作っています。直すには本文の L' + line +
          ' (呼び方) か ' + _range(ce.at, ce.end) + ' (' + ce.name + ' の中身) を直す' };
    }
    var vu = _varUse(sc, t);
    var changed = !!(opts && opts.callLines && opts.callLines[line]);
    if (!vu && changed && /[$%]/.test(t)) vu = { name: (t.match(/[$%][A-Za-z_]\w*/) || ['変数'])[0], at: 0 };
    if (vu) {
      return { kind: 'var', line: line, at: vu.at, name: vu.name,
        message: 'この部品の名前・文言は L' + line + ' の ' + vu.name + (vu.at ? ' (L' + vu.at + ' で決まる)' : '') +
          ' が決めています。直すには本文の L' + line + (vu.at ? ' か L' + vu.at : '') + ' を直す' };
    }
    if (el && el.expanded) {
      var mn = t.match(/^([$A-Za-z_][\w$]*)\s*\(/);
      return { kind: 'macro', line: line, at: line, name: mn ? mn[1] : '',
        message: 'この部品は L' + line + ' の' + (mn ? '呼び出し ' + mn[1] : 'マクロ (!define など)') +
          ' を PlantUML が展開して作っています。直すには本文の L' + line + ' を直す' };
    }
    return null;
  }

  // 右パネルの ctx を、本文を書き換えない ctx に包む (書き換えようとしたら onRefuse(gen) を呼んで何もしない)。
  function guard(ctx, gen, onRefuse) {
    if (!gen || !ctx) return ctx;
    var out = {};
    Object.keys(ctx).forEach(function(k) { out[k] = ctx[k]; });
    out.setMmdText = function(s) {
      if (s === ctx.getMmdText()) return;
      if (typeof onRefuse === 'function') onRefuse(gen);
    };
    return out;
  }

  // 右パネルの欄とボタンを読むだけにし、見出しの下に理由を 1 行出す。
  function lock(propsEl, gen) {
    if (!propsEl || !gen) return null;
    Array.prototype.forEach.call(propsEl.querySelectorAll('input, select, textarea, button'), function(c) {
      c.disabled = true;
      c.setAttribute('data-generated-lock', '1');
    });
    Array.prototype.forEach.call(propsEl.querySelectorAll('[contenteditable]'), function(c) {
      c.setAttribute('contenteditable', 'false');
    });
    var doc = propsEl.ownerDocument;
    var note = doc.createElement('div');
    note.id = 'generated-part-note';
    note.setAttribute('role', 'note');
    note.setAttribute('data-kind', gen.kind);
    note.setAttribute('data-line', String(gen.line));
    note.style.cssText = 'font-size:11px;line-height:1.5;margin:0 0 10px 0;padding:6px 8px;' +
      'border-left:3px solid var(--accent-orange, #f0a030);background:var(--bg-tertiary);color:var(--text-primary);';
    note.textContent = gen.message;
    var head = propsEl.firstElementChild;
    propsEl.insertBefore(note, head ? head.nextSibling : null);
    return note;
  }

  return { scan: scan, of: of, guard: guard, lock: lock };
})();
