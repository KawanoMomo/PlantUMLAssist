'use strict';
window.MA = window.MA || {};

// template-map — テンプレートに出てくる部品を「対応表」の形で 1 度に置き換える。
//
// BLK-junior-20260907-0943-wish: 先輩の図を流用するとき、⧉ 取り込み → ⇄ 一括置換 を
// 手で組み合わせていた。この 2 つは毎回セットで使うのに独立していて、間に
// 「置換元の名前を含まない宣言行まで壊れる」余地があった。
// テンプレートに宣言されている部品を全部並べ、それぞれの新しい名前を 1 画面で
// 埋めてから複製すれば、取り込みとリネームが 1 操作になる。
//
// 置換は文字列一致ではなく「宣言済みの部品名の付け替え」として行う。
//  - 対応表に出せるのは宣言行に現れた名前だけ
//  - 本文では識別子まるごと一致した所だけを差し替える (部分一致では動かない)
//  - 引用符の中 (ラベル) は本文の一部として素直に差し替える。構文語の位置は動かさない
// これで「置換元の名前を含まない interface 宣言が壊れる」形の事故が原理的に起きない。
window.MA.templateMap = (function() {

  // 宣言行。別名 (as X) があればそれが部品名、無ければ書かれた名前そのもの。
  // ラベル ("GPIO制御") は部品名と別に覚えておく。
  var DECL_RE = new RegExp(
    '^\\s*(participant|actor|boundary|control|entity|database|collections|queue'
    + '|abstract\\s+class|class|interface|enum|state|component|node|package|folder'
    + '|rectangle|cloud|storage|usecase|object)\\s+'
    + '(?:"([^"]*)"\\s+as\\s+([A-Za-z0-9_][\\w.-]*)'
    + '|([A-Za-z0-9_][\\w.-]*)\\s+as\\s+([A-Za-z0-9_][\\w.-]*)'
    + '|"([^"]*)"'
    + '|([A-Za-z0-9_][\\w.-]*))'
  );

  var ID_OK = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
  var BOUND = /[A-Za-z0-9_.-]/;

  function _s(v) { return v == null ? '' : String(v); }

  // 宣言行の一覧。id は本文で参照される名前、label は引用符の中の見出し。
  // 引用名だけの宣言 ("GPIO制御" だけ) は本文から識別子として参照できないので
  // id を持たない (対応表には出さない)。
  function declarations(dsl) {
    var lines = _s(dsl).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(DECL_RE);
      if (!m) continue;
      var kind = m[1].replace(/\s+/g, ' ');
      var id = m[3] || m[5] || m[7] || '';
      var label = m[2] != null ? m[2] : (m[6] != null ? m[6] : (m[4] || ''));
      if (m[4] && m[5]) label = m[4];
      out.push({ line: i + 1, kind: kind, id: id, label: label });
    }
    return out;
  }

  // 対応表に出す部品名。宣言された順、重複なし。
  function declaredIds(dsl) {
    var seen = {};
    var out = [];
    declarations(dsl).forEach(function(d) {
      if (!d.id || seen[d.id]) return;
      seen[d.id] = true;
      out.push(d.id);
    });
    return out;
  }

  // 対応表の行。rename(name) には「系統の置換」を渡す (無ければ素通し)。
  // 系統の置換で既に新しい名前になっている行は resolved になり、
  // 残りだけを利用者が埋めればよい。
  function mapRows(dsl, rename) {
    var fn = (typeof rename === 'function') ? rename : function(n) { return n; };
    var byId = {};
    declarations(dsl).forEach(function(d) {
      if (d.id && !byId[d.id]) byId[d.id] = d;
    });
    return declaredIds(dsl).map(function(id) {
      var to = _s(fn(id));
      return {
        from: id,
        to: (to && to !== id) ? to : '',
        kind: byId[id] ? byId[id].kind : '',
        label: byId[id] ? byId[id].label : '',
        resolved: !!(to && to !== id),
      };
    });
  }

  // まだ新しい名前が決まっていない行。keep が立っている行は決まったものとして扱う。
  function unresolved(rows) {
    return (rows || []).filter(function(r) {
      return r && !r.keep && !_s(r.to).trim();
    });
  }

  // 置換に使える組だけを取り出す。同じ名前に戻す組と、
  // DSL を壊す綴り (空白・記号入り) の組は落とす。
  function usablePairs(rows) {
    var out = [];
    var seen = {};
    (rows || []).forEach(function(r) {
      if (!r || r.keep) return;
      var from = _s(r.from).trim();
      var to = _s(r.to).trim();
      if (!from || !to || from === to) return;
      if (!ID_OK.test(to)) return;
      if (seen[from]) return;
      seen[from] = true;
      out.push({ from: from, to: to });
    });
    return out;
  }

  // 置換先の綴りとして使えるか。使えない綴りは画面で弾いて理由を出す。
  function isValidTarget(name) {
    return ID_OK.test(_s(name).trim());
  }

  // 同じ名前に 2 つの部品を寄せてしまう組。図の中で別物が 1 つに潰れるので警告する。
  function collisions(rows) {
    var byTo = {};
    var out = [];
    usablePairs(rows).forEach(function(p) {
      if (!byTo[p.to]) byTo[p.to] = [];
      byTo[p.to].push(p.from);
    });
    Object.keys(byTo).forEach(function(to) {
      if (byTo[to].length > 1) out.push({ to: to, from: byTo[to] });
    });
    return out;
  }

  // 行を引用符の内と外に割る。引用符の外だけが「構文の位置」で、
  // 部品名はそこにしか現れない。
  function _spans(line) {
    var out = [];
    var buf = '';
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') {
        out.push({ quoted: quoted, text: buf });
        out.push({ quote: true, text: '"' });
        buf = '';
        quoted = !quoted;
        continue;
      }
      buf += ch;
    }
    out.push({ quoted: quoted, text: buf });
    return out;
  }

  // 引用符の外での識別子まるごと一致の差し替え。
  // 前後が [A-Za-z0-9_.-] でない位置だけを拾うので、SpiDrv を置換しても
  // SpiDrvTest や mySpiDrv は動かない。
  function _replaceIds(text, map) {
    var out = '';
    var i = 0;
    while (i < text.length) {
      if (BOUND.test(text.charAt(i))) {
        var s = i;
        while (i < text.length && BOUND.test(text.charAt(i))) i++;
        var word = text.slice(s, i);
        out += Object.prototype.hasOwnProperty.call(map, word) ? map[word] : word;
        continue;
      }
      out += text.charAt(i);
      i++;
    }
    return out;
  }

  // 引用符の中 (ラベル) は自由文なので素直に差し替える。
  // 構文の位置ではないため、ここを触っても宣言の形は壊れない。
  function _replaceLabel(text, pairs) {
    var t = text;
    pairs.forEach(function(p) {
      t = t.split(p.from).join(p.to);
    });
    return t;
  }

  // 対応表を DSL に当てる。宣言されている名前だけが対象。
  function apply(dsl, rows) {
    var pairs = usablePairs(rows);
    if (!pairs.length) return _s(dsl);
    var declared = {};
    declaredIds(dsl).forEach(function(id) { declared[id] = true; });
    var live = pairs.filter(function(p) { return declared[p.from]; });
    if (!live.length) return _s(dsl);
    var map = {};
    live.forEach(function(p) { map[p.from] = p.to; });

    return _s(dsl).split('\n').map(function(line) {
      return _spans(line).map(function(sp) {
        if (sp.quote) return sp.text;
        return sp.quoted ? _replaceLabel(sp.text, live) : _replaceIds(sp.text, map);
      }).join('');
    }).join('\n');
  }

  // 変わる行だけ (line は 1 始まり)。確定の前に見せるため。
  function previewLines(dsl, rows) {
    var before = _s(dsl).split('\n');
    var after = apply(dsl, rows).split('\n');
    var out = [];
    for (var i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) out.push({ line: i + 1, before: before[i], after: after[i] });
    }
    return out;
  }

  return {
    declarations: declarations,
    declaredIds: declaredIds,
    mapRows: mapRows,
    unresolved: unresolved,
    usablePairs: usablePairs,
    isValidTarget: isValidTarget,
    collisions: collisions,
    apply: apply,
    previewLines: previewLines,
  };
})();
