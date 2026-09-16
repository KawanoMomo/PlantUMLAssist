'use strict';

// call-graph — 図の束を「ファイルの並び」ではなく「呼び出し関係のグラフ」として引く。
//
// BLK-reviewer-20260917-0323-wish:
// 突合の答えは ClockCtrl.EnableClock のような **メソッド 1 個** に付いているのに、
// 手掛かりはファイル単位 (24 枚) でしか返らないため、読む側は
// 「この名前はどの図に出るか」を毎回シーケンス図 5〜6 枚を開いて頭の中で組み直していた。
// ここはその組み直しを 1 度だけ機械で行う。シーケンス図のメッセージ・状態遷移図の
// 遷移ラベル・クラス図のメソッド宣言を同じ `Owner.Method` の鍵に寄せ、
// 鍵ごとに「どの図のどの行から呼ばれているか」「宣言はどこにあるか」を持つ節点にする。
// 同じ指摘が複数図に散っているケースは、節点 1 個の refs がそのまま散り具合になる。
//
// DOM に触らない純関数。GUI (呼び出しグラフ画面) と node (tools/call-graph.js) が同じ答えを見る。
(function() {
  // 図の種類。宣言の読み方が種類ごとに違うので先に決める。
  function docKind(text) {
    var t = String(text || '');
    if (/^\s*class\s+\S|^\s*(?:abstract|interface|enum)\s+\S/m.test(t)) return 'class';
    if (/^\s*\[\*\]\s*-+>|^\s*state\s+\S/m.test(t)) return 'state';
    if (/^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+\S/m.test(t)) return 'sequence';
    return 'other';
  }

  // ドメイン。primary の保存名は `adc_init_sequence.puml` のように先頭が領域名。
  // 区切りが無い名前 (`can.puml`) は名前そのものが領域。
  function domainOf(name) {
    var base = String(name || '').replace(/\.[A-Za-z0-9]+$/, '');
    var head = base.split(/[_\-. ]/)[0] || base;
    return head.toLowerCase();
  }

  // 制御構文・骨組み。呼び出し先として数えない。
  var STOP = /^(?:alt|else|elseif|opt|loop|par|break|critical|group|ref|end|activate|deactivate|return|note|hide|show|skinparam|title|header|footer|legend|autonumber|newpage|scale|if|while|start|stop|fork|split)$/i;

  var NAME = '(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.]*))';
  // `A -> B : msg` / `A --> B : msg` / `A <- B : msg`。矢印の向きで呼ぶ側と呼ばれる側が入れ替わる。
  var MSG_RE = new RegExp('^\\s*' + NAME + '\\s*(<?-{1,2}(?:\\[[^\\]]*\\])?-*>?>?)\\s*' + NAME + '\\s*:\\s*(.+?)\\s*$');
  // 状態遷移。`[*]` を含む行も拾う (開始遷移にラベルが付くことがある)。
  var TR_RE = /^\s*(\[\*\]|"[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)\s*-+(?:\[[^\]]*\])?(?:up|down|left|right)?-*>\s*(\[\*\]|"[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)\s*:\s*(.+?)\s*$/;
  // クラス本体のメソッド行 `+ Init() : void` と 1 行形式 `Spi_Driver : + Init()`。
  var METHOD_RE = /^\s*[+\-#~]?\s*(?:\{\w+\}\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?::\s*(\S+))?\s*$/;
  var CLASS_OPEN_RE = /^\s*(?:abstract\s+class|abstract|class|interface|enum|struct)\s+(?:"([^"]+)"\s+as\s+([A-Za-z_][A-Za-z0-9_.]*)|"([^"]+)"|([A-Za-z_][A-Za-z0-9_.]*))(?:\s*<<[^>]*>>)?\s*\{?/;
  var CLASS_MEMBER_RE = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*(.+?)\s*$/;

  function _unq(a, b) { return (a || b || '').trim(); }

  // ラベルからメソッド名を取る。`EnableClock()` も `EnableClock` も `Adc_Init(cfg) : ok` も同じ名前に寄せる。
  // 日本語の説明だけのラベル (「初期化する」) は名前を持たないので null。
  function methodOf(label) {
    var s = String(label || '').trim();
    s = s.replace(/^\s*(?:\d+[.)]\s*)/, '');            // autonumber の残り
    s = s.replace(/^<[^>]+>\s*/, '');                    // <<create>> など
    var m = s.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (m) return m[1];
    m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)/);
    if (m && !STOP.test(m[1])) return m[1];
    return null;
  }

  function _pushRef(node, ref) {
    node.refs.push(ref);
    if (node.docs.indexOf(ref.doc) < 0) node.docs.push(ref.doc);
    if (ref.domain && node.domains.indexOf(ref.domain) < 0) node.domains.push(ref.domain);
    if (ref.from && node.callers.indexOf(ref.from) < 0) node.callers.push(ref.from);
  }

  // docs: [{ name, text }] → グラフ。
  function build(docs) {
    var list = (docs || []).filter(function(d) { return d && d.name; });
    var index = {};
    var order = [];
    var bare = [];      // 持ち主の分からない参照 (状態遷移のラベル)。後で寄せる
    var files = [];

    function slot(owner, method) {
      var key = owner ? owner + '.' + method : method;
      if (!index[key]) {
        index[key] = {
          key: key, owner: owner || '', method: method,
          declared: [], refs: [], docs: [], domains: [], callers: [],
        };
        order.push(key);
      }
      return index[key];
    }

    list.forEach(function(d) {
      var text = String(d.text == null ? '' : d.text);
      var kind = docKind(text);
      var domain = domainOf(d.name);
      files.push({ name: d.name, kind: kind, domain: domain });
      var lines = text.split(/\r?\n/);
      var klass = null;
      var depth = 0;

      lines.forEach(function(raw, i) {
        var line = raw.replace(/\s+$/, '');
        var no = i + 1;
        if (/^\s*'/.test(line) || /^\s*@/.test(line)) return;

        // ── クラス図: メソッド宣言 ────────────────────────────────
        var co = line.match(CLASS_OPEN_RE);
        if (co) {
          klass = co[2] || co[4] || co[1] || co[3];
          depth = /\{\s*$/.test(line) ? 1 : 0;
          return;
        }
        if (depth > 0) {
          if (/^\s*\}\s*$/.test(line)) { depth = 0; klass = null; return; }
          var mm = line.match(METHOD_RE);
          if (klass && mm) {
            slot(klass, mm[1]).declared.push({
              doc: d.name, domain: domain, line: no, text: line.trim(),
              args: (mm[2] || '').trim(), ret: mm[3] || '',
            });
          }
          return;
        }
        var cm = kind === 'class' ? line.match(CLASS_MEMBER_RE) : null;
        if (cm && !MSG_RE.test(line)) {
          var m1 = cm[2].match(METHOD_RE);
          if (m1) {
            slot(cm[1], m1[1]).declared.push({
              doc: d.name, domain: domain, line: no, text: line.trim(),
              args: (m1[2] || '').trim(), ret: m1[3] || '',
            });
          }
          return;
        }

        // ── シーケンス図: メッセージ = 呼び出し ──────────────────
        var msg = line.match(MSG_RE);
        if (msg && kind !== 'state') {
          var left = _unq(msg[1], msg[2]);
          var right = _unq(msg[4], msg[5]);
          var back = /^</.test(msg[3]);
          var from = back ? right : left;
          var to = back ? left : right;
          var label = msg[6];
          var name = methodOf(label);
          if (!name || STOP.test(to) || STOP.test(from)) return;
          // `-->` は返信。呼び出しではないので「宣言なし」には数えない
          // (返り値 InitDone をクラス図に宣言しろ、という空振りの指摘を作らない)。
          _pushRef(slot(to, name), {
            doc: d.name, domain: domain, docKind: kind, line: no,
            kind: /--/.test(msg[3]) ? 'reply' : 'message',
            from: from, to: to, label: label, text: line.trim(),
          });
          return;
        }

        // ── 状態遷移図: 遷移ラベル。持ち主は書かれていない ──────
        if (kind === 'state') {
          var tr = line.match(TR_RE);
          if (!tr) return;
          var tname = methodOf(tr[3]);
          if (!tname) return;
          bare.push({
            method: tname,
            ref: {
              doc: d.name, domain: domain, docKind: kind, line: no,
              kind: 'transition', from: tr[1], to: tr[2], label: tr[3], text: line.trim(),
            },
          });
        }
      });
    });

    // 遷移ラベルを持ち主に寄せる。同じメソッド名を持つ持ち主が 1 人なら
    // その節点の参照として数え (ClockCtrl.EnableClock と EnableClock を分けない)、
    // 複数いれば曖昧なので持ち主なしの節点に置いて候補を並べる。
    bare.forEach(function(b) {
      var owners = order.filter(function(k) { return index[k].method === b.method && index[k].owner; });
      if (owners.length === 1) { _pushRef(index[owners[0]], b.ref); return; }
      var node = slot('', b.method);
      if (owners.length > 1) {
        node.ambiguous = owners.map(function(k) { return index[k].owner; });
      }
      _pushRef(node, b.ref);
    });

    var nodes = order.map(function(k) {
      var n = index[k];
      n.refCount = n.refs.length;
      n.docCount = n.docs.length;
      n.calls = n.refs.filter(function(r) { return r.kind !== 'reply'; }).length;
      n.replyOnly = n.calls === 0 && n.refs.length > 0;
      n.undeclared = n.declared.length === 0 && n.calls > 0;
      n.crossDomain = n.domains.length > 1;
      return n;
    });
    nodes.sort(function(a, b) {
      if (b.docCount !== a.docCount) return b.docCount - a.docCount;
      return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
    });

    var domains = [];
    files.forEach(function(f) { if (domains.indexOf(f.domain) < 0) domains.push(f.domain); });
    domains.sort();

    return { files: files, nodes: nodes, index: index, domains: domains };
  }

  function node(graph, key) {
    return (graph && graph.index && graph.index[key]) || null;
  }

  // 1 つの鍵から辿れるもの全部。GUI の右側と CLI の 1 件表示はこれを描く。
  function walk(graph, key) {
    var n = node(graph, key);
    if (!n) return null;
    var byDomain = [];
    var seen = {};
    n.refs.forEach(function(r) {
      if (!seen[r.domain]) { seen[r.domain] = { domain: r.domain, refs: [] }; byDomain.push(seen[r.domain]); }
      seen[r.domain].refs.push(r);
    });
    byDomain.sort(function(a, b) { return a.domain < b.domain ? -1 : 1; });
    return {
      key: n.key, owner: n.owner, method: n.method,
      declared: n.declared, undeclared: n.undeclared,
      ambiguous: n.ambiguous || null,
      replyOnly: !!n.replyOnly, calls: n.calls,
      callers: n.callers.slice(), docs: n.docs.slice(),
      domains: n.domains.slice(), byDomain: byDomain,
      refs: n.refs.slice(), crossDomain: n.crossDomain,
      // 1 回の探索で確定できる指摘か。散っている図の枚数がそのまま指摘の広さ。
      spread: n.docs.length,
    };
  }

  // 名前の部分一致。持ち主・メソッドのどちらでも引ける。
  function search(graph, q) {
    var s = String(q == null ? '' : q).trim().toLowerCase();
    var nodes = (graph && graph.nodes) || [];
    if (!s) return nodes.slice();
    return nodes.filter(function(n) { return n.key.toLowerCase().indexOf(s) >= 0; });
  }

  // 先に見る節点。宣言が無いもの → 散っている枚数の多い順。
  // F-01 のように「同じ指摘が複数図に散っている」ものが自然に頭へ来る。
  function hotspots(graph, limit) {
    var nodes = ((graph && graph.nodes) || []).filter(function(n) {
      return (n.undeclared || n.docCount > 1) && !n.replyOnly;
    });
    nodes = nodes.slice().sort(function(a, b) {
      if (a.undeclared !== b.undeclared) return a.undeclared ? -1 : 1;
      if (b.docCount !== a.docCount) return b.docCount - a.docCount;
      return a.key < b.key ? -1 : 1;
    });
    return typeof limit === 'number' ? nodes.slice(0, limit) : nodes;
  }

  function summary(graph) {
    var nodes = (graph && graph.nodes) || [];
    var und = nodes.filter(function(n) { return n.undeclared; });
    return {
      files: ((graph && graph.files) || []).length,
      symbols: nodes.length,
      undeclared: und.length,
      crossDomain: nodes.filter(function(n) { return n.crossDomain; }).length,
      domains: ((graph && graph.domains) || []).slice(),
      worst: und.length ? und.slice().sort(function(a, b) { return b.docCount - a.docCount; })[0].key : '',
    };
  }

  // run ログ・指摘.md へそのまま貼れる 1 件分の文面。
  function refText(graph, key) {
    var w = walk(graph, key);
    if (!w) return '';
    var out = [w.key + (w.undeclared ? '（クラス図に宣言なし）' : '（宣言 ' + w.declared.length + ' 件）')];
    w.byDomain.forEach(function(g) {
      g.refs.forEach(function(r) {
        out.push('  ' + g.domain + '\t' + r.doc + ':' + r.line + '\t'
          + (r.kind === 'message' ? r.from + ' -> ' + r.to : '遷移') + '\t' + r.label);
      });
    });
    return out.join('\n');
  }

  var api = {
    docKind: docKind, domainOf: domainOf, methodOf: methodOf,
    build: build, node: node, walk: walk, search: search,
    hotspots: hotspots, summary: summary, refText: refText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.callGraph = api;
  }
})();
