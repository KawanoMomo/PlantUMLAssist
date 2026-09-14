'use strict';
window.MA = window.MA || {};

// pin-place — 指摘を「対象の要素名」で図に貼る。
//
// BLK-reviewer-20260915-0206-wish: 指摘を図に結び付ける仕組み (review-pins) は
// 行番号を受け取る。画面では選んだ箱から行が決まるので入力は要らないが、
// ブラウザを開かない reviewer には決める術がなく、結局 `指摘.md` に
// 「[図名] 行N 内容」と書き写す運用が残っていた。行番号は図が 1 行増えるだけで
// ずれるので、reviewer は毎回数え直し、primary は puml を開いて探し直す。
//
// ここは「名前 → 貼る行」だけを決める。名前の出現は semantic-refs が
// 役割 (宣言 / 遷移の端点 / メッセージ名 …) 付きで返すので、そのうち
// 「その要素そのもの」に最も近い出現を選ぶ。participant/class/state の宣言が
// あれば宣言行、無ければ (状態図の暗黙の状態のように) 最初の出現。
// 候補が複数あるときも 1 つ選んだうえで残りを返す — reviewer に選ばせるために
// コマンドを 2 度打たせない。選び直したいときだけ行を指定する。
window.MA.pinPlace = (function() {

  // 「その要素そのもの」に近い順。同じ順位の出現が複数あるときだけ迷う。
  var RANK = [
    'decl', 'method', 'field',
    'stateNode', 'participantRef', 'inherit', 'compose', 'depend', 'relate',
    'event', 'message', 'linkLabel',
    'note', 'title',
  ];

  // 指摘を貼れない出現。コメント行・@ 指示行は図の要素ではない。
  function _rankOf(role) {
    var i = RANK.indexOf(role);
    return i < 0 ? RANK.length : i;
  }

  function _isPinLine(line) {
    return window.MA.reviewPins ? window.MA.reviewPins.isPinLine(line) : false;
  }

  // 同じ行に同じ名前が何度出ても、貼る先は行 1 つ。最も近い役割を代表にする。
  function _byLine(refs) {
    var seen = {}, out = [];
    refs.forEach(function(r) {
      var cur = seen[r.line];
      if (cur && _rankOf(cur.role) <= _rankOf(r.role)) return;
      if (cur) { out[out.indexOf(cur)] = r; seen[r.line] = r; return; }
      seen[r.line] = r;
      out.push(r);
    });
    return out;
  }

  function _cand(r) {
    return { line: r.line, text: String(r.text).trim(), role: r.role, label: r.label };
  }

  // resolve: 名前から貼る行を決める。
  //   { ok, line, text, role, label, ambiguous, candidates, reason }
  // reason: 'no-name' 引数なし / 'not-found' 図にその名前が無い /
  //         'only-comment' コメント・@ 行にしか出ない / 'no-line' 指定行にその名前が無い
  function resolve(dsl, name, opts) {
    var o = opts || {};
    var needle = String(name == null ? '' : name).trim();
    if (!needle) return { ok: false, reason: 'no-name', candidates: [] };
    var SR = window.MA.semanticRefs;
    if (!SR) return { ok: false, reason: 'not-found', candidates: [] };

    var refs = SR.scanDoc(dsl, needle).refs.filter(function(r) {
      return !_isPinLine(r.text);
    });
    if (!refs.length) return { ok: false, reason: 'not-found', candidates: [] };

    var lines = _byLine(refs).filter(function(r) { return _rankOf(r.role) < RANK.length; });
    if (!lines.length) return { ok: false, reason: 'only-comment', candidates: [] };

    lines.sort(function(a, b) {
      var d = _rankOf(a.role) - _rankOf(b.role);
      return d !== 0 ? d : a.line - b.line;
    });

    var pick = lines[0];
    if (o.line) {
      var want = null;
      for (var i = 0; i < lines.length; i++) if (lines[i].line === o.line) want = lines[i];
      if (!want) {
        return { ok: false, reason: 'no-line', candidates: lines.map(_cand) };
      }
      pick = want;
    }

    var top = _rankOf(pick.role);
    var rest = lines.filter(function(r) { return r.line !== pick.line; });
    return {
      ok: true,
      line: pick.line,
      text: String(pick.text).trim(),
      role: pick.role,
      label: pick.label,
      // 迷いがあるのは「同じ近さの出現が他にもある」ときだけ。
      // 宣言が 1 本あってあとは参照、という普通の図では迷わない。
      ambiguous: rest.some(function(r) { return _rankOf(r.role) === top; }),
      candidates: lines.map(_cand),
    };
  }

  // place: 名前で貼り先を決めて、その行に指摘を 1 件足した DSL を返す。
  //   opts: { name, text, author, at, line, id }
  //   → { ok, dsl, pin, resolved, reason }
  function place(dsl, opts) {
    var o = opts || {};
    var RP = window.MA.reviewPins;
    var src = String(dsl == null ? '' : dsl);
    if (!RP) return { ok: false, reason: 'not-found', dsl: src, resolved: null };
    var r = resolve(src, o.name, { line: o.line });
    if (!r.ok) return { ok: false, reason: r.reason, dsl: src, resolved: r };

    var id = o.id || RP.nextId(src);
    var next = RP.add(src, {
      id: id, line: r.line, text: o.text, author: o.author, at: o.at,
    });
    if (next === src) return { ok: false, reason: 'not-added', dsl: src, resolved: r };

    var pin = null;
    RP.list(next).forEach(function(p) { if (p.id === String(id)) pin = p; });
    return { ok: true, dsl: next, pin: pin, resolved: r, reason: '' };
  }

  function reasonText(reason, name) {
    var n = String(name == null ? '' : name);
    if (reason === 'no-name') return '指摘を貼る相手 (participant / class / state の名前) がありません';
    if (reason === 'not-found') return '「' + n + '」はこの図に出てきません';
    if (reason === 'only-comment') return '「' + n + '」はコメントにしか出てこないので貼り先になりません';
    if (reason === 'no-line') return '指定した行に「' + n + '」はありません';
    if (reason === 'not-added') return '「' + n + '」の行に指摘を足せませんでした';
    return '指摘を貼れませんでした';
  }

  // 貼った先を 1 行で言う。行番号を「書く」ためではなく「確かめる」ために出す。
  function describe(res) {
    if (!res || !res.ok) return '';
    return res.line + ' 行目 (' + res.label + '): ' + res.text;
  }

  return {
    RANK: RANK,
    resolve: resolve,
    place: place,
    reasonText: reasonText,
    describe: describe,
  };
})();
