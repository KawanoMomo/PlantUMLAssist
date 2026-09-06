'use strict';
window.MA = window.MA || {};

// template-new — 既存の図をテンプレートにして、部品名を 1 か所変えるだけで
// 同じ構成の図を新規作成する。
//
// BLK-junior-20260907-0803-wish: 先輩の図と同じ構成の図を作るとき、今は
// 相手の図を開いて構造を覚え、自分の図をゼロから打ち直す (実質は模写) しか
// なく、写し間違いと typo がそこで生まれていた。「元の図 + 置換元語 +
// 置換先語」から新しい DSL を作れば、模写の工程そのものが無くなる。
//
// 置換は綴りの大小の族ごと (UART / Uart / uart) に行う。ドライバの図は
// 型名 UartDrv・状態名 UART_Idle・タイトル「UART 受信」のように同じ語が
// 別の大小で現れるため、1 つの綴りだけ直すと図の中で綴りが割れてしまう。
window.MA.templateNew = (function() {
  var WORD = /[A-Za-z0-9_]/;

  function _s(v) { return v == null ? '' : String(v); }

  function escapeRe(s) {
    return _s(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 語の頭での置換。bulk-rename (識別子まるごと一致) とは規則が違う。
  // テンプレートで替えたいのは Uart_Idle / UartDrv / UART_START のような
  // 「同じ部品名で始まる名前の一族」であり、識別子まるごと一致に限ると
  // 一族のほとんどが取り残されて図の中で綴りが割れる。
  // 頭は語境界 (前が [A-Za-z0-9_] でない) を必ず要求し、後ろは
  // 区切り (_ / 大文字 / 数字 / 語末) だけを認める。こうすれば Uart は
  // UartDrv を巻き込む一方、Uartlet や MyUartX は巻き込まない。
  var TAIL_OK = /[_A-Z0-9]/;

  function _replaceHead(text, from, to) {
    var src = _s(text);
    var needle = _s(from);
    if (!needle) return src;
    var re = new RegExp(escapeRe(needle), 'g');
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(src)) !== null) {
      var s = m.index;
      var e = s + m[0].length;
      var beforeOk = s === 0 || !WORD.test(src.charAt(s - 1));
      var afterOk = e >= src.length || !WORD.test(src.charAt(e)) || TAIL_OK.test(src.charAt(e));
      if (beforeOk && afterOk) {
        out += src.slice(last, s) + _s(to);
        last = e;
      }
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out + src.slice(last);
  }

  function _cap(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  // 大小の族。打った綴りをそのまま先に当て、続けて UPPER / lower / Capitalized。
  // 同じ綴りが 2 度出ないよう畳む。
  function caseVariants(from, to) {
    var f = _s(from), t = _s(to);
    if (!f || !t) return [];
    var pairs = [
      [f, t],
      [f.toUpperCase(), t.toUpperCase()],
      [f.toLowerCase(), t.toLowerCase()],
      [_cap(f), _cap(t)],
    ];
    var seen = {};
    var out = [];
    pairs.forEach(function(p) {
      if (seen[p[0]]) return;
      seen[p[0]] = true;
      out.push({ from: p[0], to: p[1] });
    });
    return out;
  }

  // テンプレート DSL から新しい図の DSL を作る。
  function instantiate(dsl, from, to) {
    var text = _s(dsl);
    caseVariants(from, to).forEach(function(v) {
      text = _replaceHead(text, v.from, v.to);
    });
    return text;
  }

  // 置換で何行が変わるか。確定前に「どこが変わるか」を見せるために使う。
  // 変わる行だけを返す (line は 1 始まり)。
  function previewLines(dsl, from, to) {
    var before = _s(dsl).split('\n');
    var after = instantiate(dsl, from, to).split('\n');
    var out = [];
    for (var i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) {
        out.push({ line: i + 1, before: before[i], after: after[i] });
      }
    }
    return out;
  }

  // テンプレートの中で「部品名らしい語」を出現数の多い順に挙げる。
  // 置換元の欄を空から埋めるための候補。
  //  - 識別子として現れる語だけを見る (記号・数字始まりは除く)
  //  - PlantUML の構文語は除く
  //  - 2 回以上出る語を先に置く (1 回しか出ない語はテンプレートの主役ではない)
  var STOPWORDS = /^(?:startuml|enduml|title|participant|actor|boundary|control|entity|database|collections|queue|class|abstract|interface|enum|state|component|node|package|folder|rectangle|cloud|storage|usecase|note|left|right|over|of|as|is|end|alt|else|opt|loop|par|break|critical|group|ref|activate|deactivate|return|start|stop|if|then|while|repeat|fork|split|hide|show|skinparam|header|footer|legend|top|bottom|caption|autonumber|newpage|scale|up|down)$/i;

  function candidates(dsl) {
    var text = _s(dsl);
    var re = /[A-Za-z_][A-Za-z0-9_]*/g;
    var counts = {};
    var order = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      var w = m[0];
      if (STOPWORDS.test(w)) continue;
      if (w.length < 2) continue;
      if (!counts[w]) { counts[w] = 0; order.push(w); }
      counts[w]++;
    }
    // 部品名の一族の共通の頭 (Uart_Idle / Uart_Busy / UartDrv → Uart) も候補にする。
    // テンプレートで替えたいのはたいていこの頭のほうで、Uart_Idle を選んで
    // しまうと残りの名前が置き換わらないため、2 語以上に共通する頭を上に出す。
    var prefixCount = {};
    var prefixWords = {};
    order.forEach(function(w) {
      var p = _headSegment(w);
      if (!p || p === w) return;
      if (!prefixCount[p]) { prefixCount[p] = 0; prefixWords[p] = {}; }
      prefixCount[p] += counts[w];
      prefixWords[p][w] = true;
    });

    var items = order.map(function(w, i) {
      return { name: w, count: counts[w], i: i };
    });
    Object.keys(prefixCount).forEach(function(p) {
      if (Object.keys(prefixWords[p]).length < 2) return;   // 一族と呼べない
      if (counts[p]) return;                                // 単独でも出る語は上で数え済み
      items.push({ name: p, count: prefixCount[p], i: -1 });
    });

    return items
      .sort(function(a, b) { return b.count - a.count || a.i - b.i; })
      .map(function(x) { return { name: x.name, count: x.count }; });
  }

  // 識別子の頭のひとかたまり。Uart_Idle / UartDrv → Uart、UART_START → UART、
  // uart_done → uart。区切りが無い語 (Idle) は頭だけを取り出せないので空。
  function _headSegment(word) {
    var m = word.match(/^([A-Z][a-z0-9]+)(?=[_A-Z])/)
      || word.match(/^([A-Z0-9]+?)(?=_)/)
      || word.match(/^([a-z][a-z0-9]*)(?=[_A-Z])/);
    return m ? m[1] : '';
  }

  // 新しい図の名前。元の名前の中の置換元語を置換先語に替える。
  // 語が入っていなければ末尾に置換先語を足して、元と別名にする。
  function suggestName(templateName, from, to) {
    var base = _s(templateName).replace(/\.puml$/i, '');
    var t = _s(to);
    if (!t) return base;
    var renamed = instantiate(base, from, t);
    if (renamed !== base) return renamed;
    return base ? base + '-' + t : t;
  }

  // ── 残った部品名の検出 (BLK-primary-20260907-0803-wish) ──────────────────
  // テンプレートを複製したあと、置換しそこねた部品名 (Spi_Driver のような
  // 元の系統の名前) がそのまま残ると、レビューで毎回同じ指摘を受ける。
  // 「複製した図に、テンプレートと同じ宣言名がまだ何個残っているか」を
  // 機械的に出して、確定の前に必ず片付けさせる。
  var DECL_RE = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue|abstract\s+class|class|interface|enum|state|component|node|package|folder|rectangle|cloud|storage|usecase)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][\w.-]*)|"([^"]+)"|([A-Za-z0-9_][\w.-]*))/;

  // 宣言行に出てくる名前 (別名 as があればその別名)。出現順、重複なし。
  function declaredNames(dsl) {
    var lines = _s(dsl).split('\n');
    var seen = {};
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(DECL_RE);
      if (!m) continue;
      var name = m[2] || m[1] || m[3] || m[4];
      if (!name || seen[name]) continue;
      seen[name] = true;
      out.push(name);
    }
    return out;
  }

  // テンプレートと複製後の両方に同じ綴りで残っている宣言名。
  // ここが空でなければ「元の系統の名前が残ったまま」ということ。
  function remainingNames(templateDsl, resultDsl) {
    var after = {};
    declaredNames(resultDsl).forEach(function(n) { after[n] = true; });
    return declaredNames(templateDsl).filter(function(n) { return after[n]; });
  }

  // 置換の組を順に当てる。1 語目のあとに残った名前を個別に直すために使う。
  // pairs: [{ from, to }]。to が空の組は飛ばす。
  function instantiateAll(dsl, pairs) {
    var text = _s(dsl);
    (pairs || []).forEach(function(p) {
      if (!p || !p.from || !p.to) return;
      text = instantiate(text, p.from, p.to);
    });
    return text;
  }

  return {
    declaredNames: declaredNames,
    remainingNames: remainingNames,
    instantiateAll: instantiateAll,
    caseVariants: caseVariants,
    instantiate: instantiate,
    previewLines: previewLines,
    candidates: candidates,
    suggestName: suggestName,
  };
})();
