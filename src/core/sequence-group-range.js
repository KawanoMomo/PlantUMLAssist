'use strict';
// BLK-human-20260916-0901: シーケンス図の alt/loop/opt/par で「どこからどこまで」を囲む範囲の計算。
//   - wrapRange:  選んだ行範囲を、帯 (activate〜deactivate)・既存ブロック・複数行 note を
//                 途中で切らない形へ丸める (丸めたらその旨の文を返す)
//   - moveEdge:   囲んだ後のブロックの始点 / 終点を「1 本ずつ」伸縮する (end 行・開始行を動かす)
//   - describe:   範囲に入るメッセージを「N 本のメッセージ (A→B … C→D)」の文にする
// DOM に触らない純関数だけを置く (tests/blk-human-20260916-0901-group-range.test.js)。
window.MA = window.MA || {};
window.MA.sequenceGroupRange = (function() {

  var OPEN_RE = /^(alt|opt|loop|par|break|critical|group)(?:\s+.*)?$/;
  var ELSE_RE = /^else(?:\s+.*)?$/;
  var END_RE = /^end$/;
  var NOTE_START_RE = /^(?:[hr]?note|ref)\b/i;
  var NOTE_END_RE = /^end\s*(?:[hr]?note|ref)$/i;
  var ACT_RE = /^(activate|deactivate|destroy)\s+("[^"]+"|\S+)/;
  var KEYWORD_RE = /^(?:participant|actor|boundary|control|entity|database|collections|queue|title|autonumber|skinparam|hide|show|box|end\s+box|return|create|activate|deactivate|destroy|newpage|@)/;
  var ARROW_RE = /(?:<<?-{1,2}|-{1,2}(?:>>?|\\\\?|\/\/?|x|o)|<-{1,2}>)/;
  var MSG_RE = /^("[^"]+"|[^\s\-<>"]+)\s*(<<?-{1,2}|-{1,2}(?:>>?|\\\\?|\/\/?|x|o)?(?:\[[^\]]*\])?(?:>>?)?)\s*("[^"]+"|[^\s:+\-"]+)/;

  function unq(s) { return String(s || '').replace(/^"|"$/g, ''); }

  function classify(raw) {
    var t = String(raw || '').trim();
    if (!t || t.charAt(0) === "'") return { kind: 'other' };
    if (OPEN_RE.test(t)) return { kind: 'open' };
    if (ELSE_RE.test(t)) return { kind: 'else' };
    if (END_RE.test(t)) return { kind: 'end' };
    if (NOTE_END_RE.test(t)) return { kind: 'noteEnd' };
    if (NOTE_START_RE.test(t)) return { kind: t.indexOf(':') >= 0 ? 'note' : 'noteStart' };
    var am = t.match(ACT_RE);
    if (am) return { kind: am[1] === 'activate' ? 'act' : 'deact', who: unq(am[2]) };
    if (/^@startuml/.test(t)) return { kind: 'start' };
    if (/^@enduml/.test(t)) return { kind: 'stop' };
    if (KEYWORD_RE.test(t)) return { kind: 'other' };
    if (ARROW_RE.test(t)) {
      var mm = t.match(MSG_RE);
      return { kind: 'msg', from: mm ? unq(mm[1]) : '', to: mm ? unq(mm[3]) : '' };
    }
    return { kind: 'other' };
  }

  // 行ごとの分類・入れ子の親 (container)・対になる行 (pairs) を作る。
  function analyze(lines) {
    var info = lines.map(classify);
    var container = [];
    var blockEnd = {};
    var pairs = [];
    var stack = [];
    var noteOpen = -1;
    var acts = {};
    for (var i = 0; i < lines.length; i++) {
      var c = info[i];
      container[i] = stack.length ? stack[stack.length - 1] : -1;
      if (noteOpen >= 0) {
        if (c.kind === 'noteEnd') { pairs.push({ a: noteOpen, b: i, kind: 'note' }); blockEnd[noteOpen] = i; noteOpen = -1; }
        info[i] = c.kind === 'noteEnd' ? c : { kind: 'noteBody' };
        continue;
      }
      if (c.kind === 'noteStart') { noteOpen = i; continue; }
      if (c.kind === 'open') { stack.push(i); continue; }
      if (c.kind === 'end' && stack.length) {
        var o = stack.pop();
        container[i] = stack.length ? stack[stack.length - 1] : -1;
        pairs.push({ a: o, b: i, kind: 'block' });
        blockEnd[o] = i;
        continue;
      }
      if (c.kind === 'act') { (acts[c.who] = acts[c.who] || []).push(i); continue; }
      if (c.kind === 'deact') {
        var st = acts[c.who];
        if (st && st.length) pairs.push({ a: st.pop(), b: i, kind: 'band', who: c.who });
      }
    }
    // else 行はそのブロックの開始・終了と組にする (else だけが範囲に入ると枠が壊れる)。
    for (var k = 0; k < lines.length; k++) {
      if (info[k].kind === 'else' && container[k] >= 0 && blockEnd[container[k]] != null) {
        pairs.push({ a: container[k], b: k, kind: 'block' });
      }
    }
    return { info: info, container: container, blockEnd: blockEnd, pairs: pairs };
  }

  // container 直下の「1 本」= メッセージ / ブロック丸ごと / note 丸ごと。
  function unitsOf(an, C) {
    var units = [];
    for (var i = 0; i < an.info.length; i++) {
      if (an.container[i] !== C) continue;
      var k = an.info[i].kind;
      if (k === 'msg' || k === 'note') units.push({ start: i, end: i });
      else if ((k === 'open' || k === 'noteStart') && an.blockEnd[i] != null) {
        units.push({ start: i, end: an.blockEnd[i] });
        i = an.blockEnd[i];
      }
    }
    return units;
  }

  function bodyBounds(an, C) {
    if (C >= 0) return { lo: C + 1, hi: an.blockEnd[C] - 1 };
    var lo = 0, hi = an.info.length - 1;
    for (var i = 0; i < an.info.length; i++) if (an.info[i].kind === 'start') { lo = i + 1; break; }
    for (var j = an.info.length - 1; j >= 0; j--) if (an.info[j].kind === 'stop') { hi = j - 1; break; }
    return { lo: lo, hi: hi };
  }

  // 範囲 [a,b] (0-based) を、対の片側だけを含まない形まで広げる。
  function normalize(an, a, b) {
    var reasons = {};
    var changed = true;
    while (changed) {
      changed = false;
      for (var p = 0; p < an.pairs.length; p++) {
        var pr = an.pairs[p];
        var inA = pr.a >= a && pr.a <= b;
        var inB = pr.b >= a && pr.b <= b;
        if (inA === inB) continue;
        if (pr.a < a) a = pr.a;
        if (pr.b > b) b = pr.b;
        reasons[pr.kind === 'band' ? 'band:' + pr.who : pr.kind] = true;
        changed = true;
      }
    }
    return { a: a, b: b, reasons: Object.keys(reasons) };
  }

  function reasonText(reasons) {
    if (!reasons.length) return '';
    var parts = reasons.map(function(r) {
      if (r.indexOf('band:') === 0) return r.slice(5) + ' の帯 (activate〜deactivate)';
      if (r === 'block') return '既にある枠';
      return '注釈';
    });
    return parts.join('・') + 'を途中で切らないよう、範囲をその端まで広げました';
  }

  function validRange(an, a, b) {
    if (a > b) return '範囲が空です';
    var C = an.container[a];
    var bb = bodyBounds(an, C);
    if (a < bb.lo || b > bb.hi) return '枠の外まで範囲が広がるので囲めません';
    for (var i = a; i <= b; i++) {
      if (an.info[i].kind === 'else' && an.container[i] === C) return 'else を跨ぐので囲めません';
      if (an.info[i].kind === 'start' || an.info[i].kind === 'stop') return '図の外まで範囲が広がるので囲めません';
    }
    return '';
  }

  // 1-based の [startLine, endLine] を囲める形に丸める。
  function wrapRange(text, startLine, endLine) {
    var lines = String(text).split('\n');
    var s = Math.min(startLine, endLine) - 1, e = Math.max(startLine, endLine) - 1;
    if (s < 0 || e >= lines.length) return { ok: false, error: '範囲が図の外です' };
    var an = analyze(lines);
    var n = normalize(an, s, e);
    var err = validRange(an, n.a, n.b);
    if (err) return { ok: false, error: err };
    return {
      ok: true, start: n.a + 1, end: n.b + 1,
      rounded: n.a !== s || n.b !== e, note: reasonText(n.reasons),
    };
  }

  // 既存ブロック (openLine〜endLine, 1-based) の端を 1 本動かす。
  //   edge: 'start' | 'end'、dir: -1 (上へ) | +1 (下へ)
  function moveEdge(text, openLine, endLine, edge, dir) {
    var lines = String(text).split('\n');
    var oi = openLine - 1, ei = endLine - 1;
    if (oi < 0 || ei >= lines.length || oi >= ei) return { ok: false, error: 'ブロックの範囲を読み取れません' };
    if (classify(lines[oi]).kind !== 'open' || classify(lines[ei]).kind !== 'end') {
      return { ok: false, error: 'ブロックの開始行と end 行を読み取れません' };
    }
    var openText = lines[oi], endText = lines[ei];
    var L = lines.slice(0, oi).concat(lines.slice(oi + 1, ei), lines.slice(ei + 1));
    var a = oi, b = ei - 2;                         // L 上の中身の範囲
    var an = analyze(L);
    var C = a < L.length ? an.container[a] : -1;
    var units = unitsOf(an, C);
    var inner = units.filter(function(u) { return u.start >= a && u.end <= b; });
    var na = a, nb = b, grow = false;
    if (edge === 'end' && dir > 0) {
      var next = units.filter(function(u) { return u.start > b; })[0];
      if (!next) return { ok: false, error: 'この後ろに伸ばせるメッセージがありません' };
      nb = next.end; grow = true;
    } else if (edge === 'end' && dir < 0) {
      if (inner.length <= 1) return { ok: false, error: 'これ以上縮められません (中身が 1 本です)' };
      nb = inner[inner.length - 1].start - 1;
    } else if (edge === 'start' && dir < 0) {
      var prev = units.filter(function(u) { return u.end < a; });
      if (!prev.length) return { ok: false, error: 'この前に広げられるメッセージがありません' };
      na = prev[prev.length - 1].start; grow = true;
    } else if (edge === 'start' && dir > 0) {
      if (inner.length <= 1) return { ok: false, error: 'これ以上縮められません (中身が 1 本です)' };
      na = inner[0].end + 1;
    } else {
      return { ok: false, error: '動かし方が不正です' };
    }
    var n = normalize(an, na, nb);
    if (!grow && n.a <= a && n.b >= b) {
      return { ok: false, error: reasonText(n.reasons).replace(/を途中で切らないよう.*$/, '') + 'を途中で切るので縮められません' };
    }
    var err = validRange(an, n.a, n.b);
    if (err) return { ok: false, error: err };
    var out = L.slice(0, n.a).concat([openText], L.slice(n.a, n.b + 1), [endText], L.slice(n.b + 1));
    return {
      ok: true, text: out.join('\n'), openLine: n.a + 1, endLine: n.b + 3,
      note: (n.a !== na || n.b !== nb) ? reasonText(n.reasons) : '',
    };
  }

  function describe(text, startLine, endLine) {
    var lines = String(text).split('\n');
    var msgs = [];
    for (var i = Math.max(0, startLine - 1); i <= Math.min(lines.length - 1, endLine - 1); i++) {
      var c = classify(lines[i]);
      if (c.kind === 'msg') msgs.push(c.from + '→' + c.to);
    }
    if (!msgs.length) return 'メッセージ 0 本';
    var span = msgs.length === 1 ? msgs[0] : msgs[0] + ' … ' + msgs[msgs.length - 1];
    return msgs.length + ' 本のメッセージ (' + span + ')';
  }

  // 1 本目と Shift+クリックした 2 本目の間にあるメッセージ行を全部返す。
  function messageLinesBetween(text, lineA, lineB) {
    var lines = String(text).split('\n');
    var lo = Math.min(lineA, lineB), hi = Math.max(lineA, lineB), out = [];
    for (var i = lo; i <= hi; i++) if (classify(lines[i - 1]).kind === 'msg') out.push(i);
    return out;
  }

  return {
    classify: classify, wrapRange: wrapRange, moveEdge: moveEdge,
    describe: describe, messageLinesBetween: messageLinesBetween,
  };
})();
