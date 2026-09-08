'use strict';
window.MA = window.MA || {};

// dep-graph — 部品名の依存を図をまたいだ有向グラフとして持ち、
// 「この名前を触ると、どの図のどこまで影響が届くか」を出す。
//
// BLK-primary-20260908-2003-wish: ⇄一括置換の「▤ 影響を見る」は、ヒットした行を
// 図ごとにテキストで並べるだけで、どの図がどの図を参照して連鎖しているかは見えない。
// 今は置換の前に各図を開いて「この部品名はどの図の participant / state / class から
// 参照されているか」を目視で推測している。名前を 1 つ選ぶだけで参照元・参照先が
// 矢印で読めれば、影響が及ぶ図の見落とし (直し漏れ) を機械的に防げる。
//
// impact-scan は「1 つの名前が各図に何件出るか」を数えるもので、名前と名前の
// 繋がりは持たない。xref-graph は「同じ名前が何枚に出るか」で図と図を結ぶが、
// 向きが無い。ここが足すのは向き (誰が誰を参照しているか) と、隣の名前を経由した
// 図の連鎖 (hop)。DOM も fetch も触らない。描画は app.js。
window.MA.depGraph = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // 関係行の両端に立てる名前。`[*]` は擬似状態なので部品ではない。
  var NAME = '(?:"[^"]+"|\\[\\*\\]|[A-Za-z0-9_぀-ヿ一-鿿][A-Za-z0-9_.぀-ヿ一-鿿-]*)';
  // 矢印。向きの印 (`<` `<|` `>` `|>` `*` `o` `x`)、線の種類 (`--` `..`)、
  // 方向指定 (`-left->`)、色指定 (`-[#red]->`) を 1 つの塊として拾う。
  var ARROW = '(?:<\\||<|\\*|o|x)?(?:--?|\\.\\.?)(?:\\[[^\\]]*\\])?(?:left|right|up|down)?(?:--?|\\.\\.?)?(?:\\|>|>|\\*|o|x)?';
  var REL_RE = new RegExp('(' + NAME + ')\\s*(' + ARROW + ')\\s*(' + NAME + ')\\s*(?::\\s*(.*))?$');

  // 関係とは読まない行。ノートやスタイルの中の `--` を線に数えると、
  // 実体の無いノードがグラフに並んで読めなくなる。
  var SKIP_RE = /^\s*(?:'|@|!|note\b|end\s+note|legend\b|end\s*legend|skinparam\b|title\b|header\b|footer\b|hide\b|show\b|scale\b|caption\b)/i;

  function _unquote(s) {
    var t = _s(s).trim();
    if (t.length >= 2 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') {
      return t.slice(1, -1).trim();
    }
    return t;
  }

  // 矢印の向き。左向きの印があれば両端を入れ替える (`A <|-- B` は B が A を参照)。
  // どちらの印も無い素の線 (`A -- B`) は向き無しとして、書いた順のまま持つ。
  function arrowDir(arrow) {
    var a = _s(arrow);
    var left = /^(?:<\||<|\*|o|x)/.test(a);
    var right = /(?:\|>|>|\*|o|x)$/.test(a);
    if (left && !right) return 'back';
    if (right && !left) return 'forward';
    if (left && right) return 'both';
    return 'none';
  }

  // 1 本の DSL から関係行を取り出す。
  // → [{ from, to, arrow, dir, label, line, text }]
  function relations(dsl) {
    var out = [];
    var lines = _s(dsl).split('\n');
    lines.forEach(function(raw, i) {
      var line = _s(raw);
      if (!line.trim() || SKIP_RE.test(line)) return;
      var m = line.match(REL_RE);
      if (!m) return;
      var a = _unquote(m[1]);
      var b = _unquote(m[3]);
      if (!a || !b || a === '[*]' || b === '[*]') return;
      var dir = arrowDir(m[2]);
      var from = dir === 'back' ? b : a;
      var to = dir === 'back' ? a : b;
      out.push({
        from: from, to: to, arrow: m[2], dir: dir,
        label: _s(m[4]).trim(), line: i + 1, text: line.trim(),
      });
    });
    return out;
  }

  // 宣言行の頭。矢印を 1 本も持たない図 (クラス図に class SpiDrv と書いてあるだけ)
  // でも、その名前を改名すればその図は直す対象になる。関係行だけを見ていると
  // その図が「影響が届く図」から落ちるので、宣言も出現として数える。
  var DECL_RE = new RegExp(
    '^\\s*(?:participant|actor|boundary|control|entity|database|collections|queue'
    + '|abstract\\s+class|abstract|class|interface|enum|struct|state|component|node'
    + '|package|folder|rectangle|cloud|storage|usecase)\\s+(' + NAME + ')');

  // その図で宣言されている部品名。
  function declared(dsl) {
    var out = [];
    _s(dsl).split('\n').forEach(function(raw) {
      var line = _s(raw);
      if (!line.trim() || SKIP_RE.test(line)) return;
      var m = line.match(DECL_RE);
      if (!m) return;
      var nm = _unquote(m[1]);
      if (nm && nm !== '[*]' && out.indexOf(nm) < 0) out.push(nm);
    });
    return out;
  }

  // docs: [{ id, name, dsl }] → 図をまたいだ 1 枚の有向グラフ。
  // ノードは部品名、辺は「どの図の何行目でその参照が書かれているか」を持つ。
  function build(docs) {
    var list = Array.isArray(docs) ? docs : [];
    var nodes = {};
    var edges = [];

    function node(name) {
      if (!nodes[name]) nodes[name] = { name: name, docs: [], outDeg: 0, inDeg: 0 };
      return nodes[name];
    }
    function touch(name, docName) {
      var n = node(name);
      if (n.docs.indexOf(docName) < 0) n.docs.push(docName);
      return n;
    }

    list.forEach(function(d) {
      if (!d) return;
      var docName = _s(d.name);
      var dsl = window.MA.dslUtils ? window.MA.dslUtils.docDsl(d) : _s(d.dsl);
      relations(dsl).forEach(function(r) {
        touch(r.from, docName);
        touch(r.to, docName);
        nodes[r.from].outDeg++;
        nodes[r.to].inDeg++;
        edges.push({
          from: r.from, to: r.to, dir: r.dir, label: r.label,
          doc: docName, docId: d.id, line: r.line, text: r.text,
        });
      });
      // 宣言だけの出現。既に関係で立っているノードにその図を足すのが主で、
      // 矢印を 1 本も持たない名前もここで選べるようになる (degree 0)。
      declared(dsl).forEach(function(nm) { touch(nm, docName); });
    });

    return { nodes: nodes, edges: edges, docs: list.length };
  }

  // 選べる部品名。参照の本数が多い順 — 影響が大きいものから見たい。
  function names(graph) {
    var nodes = (graph && graph.nodes) || {};
    return Object.keys(nodes).map(function(k) {
      var n = nodes[k];
      return { name: n.name, docs: n.docs.slice(), degree: n.outDeg + n.inDeg,
               outDeg: n.outDeg, inDeg: n.inDeg };
    }).sort(function(a, b) {
      return b.degree - a.degree || b.docs.length - a.docs.length
        || a.name.localeCompare(b.name);
    });
  }

  function _group(edges, key) {
    var acc = {};
    var order = [];
    edges.forEach(function(e) {
      var k = e[key];
      if (!acc[k]) { acc[k] = { name: k, count: 0, refs: [] }; order.push(k); }
      acc[k].count++;
      acc[k].refs.push({ doc: e.doc, docId: e.docId, line: e.line, label: e.label, text: e.text });
    });
    return order.map(function(k) { return acc[k]; }).sort(function(a, b) {
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  }

  // 名前 1 つぶんの読み方。
  // outgoing = この名前が参照している先、incoming = この名前を参照している元。
  function forName(graph, name) {
    var key = _s(name);
    var nodes = (graph && graph.nodes) || {};
    if (!key || !nodes[key]) return null;
    var edges = (graph && graph.edges) || [];
    var out = edges.filter(function(e) { return e.from === key && e.to !== key; });
    var inc = edges.filter(function(e) { return e.to === key && e.from !== key; });
    return {
      name: key,
      docs: nodes[key].docs.slice(),
      outgoing: _group(out, 'to'),
      incoming: _group(inc, 'from'),
    };
  }

  // 影響が及ぶ図。hop 0 = その名前が出る図、hop 1 = 隣の名前が出る図…。
  // 「置換や仕様変更で見落とす図」はここまでで尽きる — 直接の図だけ直して
  // 隣を素通りするのが直し漏れの正体なので、経由した名前 (via) も一緒に返す。
  function impactDocs(graph, name, maxHops) {
    var view = forName(graph, name);
    if (!view) return [];
    var hops = maxHops == null ? 2 : Math.max(0, maxHops);
    var seenName = {};
    var docHop = {};
    var docVia = {};
    var frontier = [_s(name)];
    seenName[_s(name)] = true;

    for (var h = 0; h <= hops && frontier.length; h++) {
      var next = [];
      frontier.forEach(function(nm) {
        var node = graph.nodes[nm];
        if (!node) return;
        node.docs.forEach(function(dn) {
          if (docHop[dn] == null) { docHop[dn] = h; docVia[dn] = []; }
          if (docHop[dn] === h && docVia[dn].indexOf(nm) < 0) docVia[dn].push(nm);
        });
        graph.edges.forEach(function(e) {
          var other = e.from === nm ? e.to : (e.to === nm ? e.from : null);
          if (!other || seenName[other]) return;
          seenName[other] = true;
          next.push(other);
        });
      });
      frontier = next;
    }

    return Object.keys(docHop).map(function(dn) {
      return { doc: dn, hop: docHop[dn], via: docVia[dn] };
    }).sort(function(a, b) {
      return a.hop - b.hop || a.doc.localeCompare(b.doc);
    });
  }

  // 見出し 1 行。「まだ開いて確かめる図が残っているか」がここだけで分かる。
  function summaryText(view, impact) {
    if (!view) return '部品名を選ぶと、参照元・参照先の図を矢印で出します';
    var t = view.name + ': 参照先 ' + view.outgoing.length + ' / 参照元 '
      + view.incoming.length + ' / 出現 ' + view.docs.length + ' 図';
    var list = Array.isArray(impact) ? impact : [];
    var far = list.filter(function(r) { return r.hop > 0; }).length;
    if (far > 0) t += ' / 連鎖で影響 ' + far + ' 図';
    return t;
  }

  // 画面に置く座標。中央がその名前、左が参照元、右が参照先。
  // 位置決めをここに置くのは、矢印の向きが逆に描かれていないかを
  // 画面を開かずに固定できるようにするため。
  function layout(view, opts) {
    var o = opts || {};
    var colW = o.colW || 200;
    var rowH = o.rowH || 34;
    var padY = o.padY || 20;
    if (!view) return { width: colW * 3, height: padY * 2, nodes: [], edges: [] };

    var rows = Math.max(view.incoming.length, view.outgoing.length, 1);
    var height = padY * 2 + rows * rowH;
    var mid = height / 2;
    var nodes = [];
    var edges = [];

    function place(list, side, x) {
      var top = mid - ((list.length - 1) * rowH) / 2;
      list.forEach(function(r, i) {
        nodes.push({ name: r.name, side: side, x: x, y: top + i * rowH, count: r.count });
      });
    }
    place(view.incoming, 'in', colW * 0.5);
    place(view.outgoing, 'out', colW * 2.5);
    nodes.push({ name: view.name, side: 'center', x: colW * 1.5, y: mid, count: 0 });

    nodes.forEach(function(n) {
      if (n.side === 'in') edges.push({ x1: n.x, y1: n.y, x2: colW * 1.5, y2: mid, from: n.name, to: view.name });
      if (n.side === 'out') edges.push({ x1: colW * 1.5, y1: mid, x2: n.x, y2: n.y, from: view.name, to: n.name });
    });

    return { width: colW * 3, height: height, nodes: nodes, edges: edges };
  }

  return {
    relations: relations,
    declared: declared,
    arrowDir: arrowDir,
    build: build,
    names: names,
    forName: forName,
    impactDocs: impactDocs,
    summaryText: summaryText,
    layout: layout,
  };
})();
