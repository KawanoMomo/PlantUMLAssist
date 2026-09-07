'use strict';
window.MA = window.MA || {};

// name-audit — 開いている図をまたいで部品名を機械的に突き合わせる。
//
// 同じ部品が図ごとに IRQCtrl / IrqCtrl のように違う綴りで書かれていても、
// 図を 1 枚ずつ全文読むまで気付けない。名前を宣言行から抽出して図ごとの
// 出現表にし、正規化キー (大小・区切り記号を無視) が一致するのに綴りが
// 違うものを「表記揺れ」として並べる。宣言が 1 枚も無いのに矢印にだけ
// 現れる名前は「宣言なし」として別に出す (クラス図の書き漏らし検出)。
window.MA.nameAudit = (function() {
  // 宣言行。kind は突合の手掛かりとして持つだけで、比較そのものには使わない
  // (同じ部品がクラス図では class、シーケンス図では participant になるため)。
  var DECLS = [
    { kind: 'participant', re: /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/ },
    { kind: 'class', re: /^\s*(?:abstract\s+class|abstract|class|interface|enum|struct)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/ },
    { kind: 'state', re: /^\s*state\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/ },
    { kind: 'component', re: /^\s*(?:component|node|package|folder|rectangle|cloud|storage)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/ },
    { kind: 'usecase', re: /^\s*usecase\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/ },
  ];
  var ARROW_RE = /^\s*(?:"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*(?:-+>+|<-+|<\|-+|-+\|>|\*-+|o-+|-+\*|-+o|\.+>|<\.+|-{2,})\s*(?:"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;

  // 図の骨組みや制御構文。名前として数えない。
  var STOPWORDS = /^(?:as|is|of|to|note|end|endif|alt|else|elseif|opt|loop|par|break|critical|group|ref|activate|deactivate|return|start|stop|if|while|repeat|fork|split|hide|show|skinparam|title|header|footer|legend|left|right|up|down|over|autonumber|newpage|scale|top|bottom|caption)$/i;

  function _isName(s) {
    return !!s && !STOPWORDS.test(s);
  }

  // 比較キー。大小と _ - . 空白を落とすので IRQCtrl と Irq_Ctrl は同じ組になる。
  function normalizeKey(name) {
    return String(name == null ? '' : name).toLowerCase().replace(/[_\-.\s]/g, '');
  }

  function _declaredIn(line) {
    for (var i = 0; i < DECLS.length; i++) {
      var m = line.match(DECLS[i].re);
      if (!m) continue;
      // "表示名" as Alias なら Alias が識別子。それ以外は拾えた方。
      var name = m[2] || m[4] || m[1] || m[3];
      if (!_isName(name)) return null;
      return { kind: DECLS[i].kind, name: name };
    }
    return null;
  }

  // docs: [{ id, name, dsl }] → [{ name, kind, key, docs: [図名], declared, refs }]
  // name の昇順。declared=false は矢印にだけ出てきた名前。
  function collect(docs) {
    var byName = {};
    var order = [];
    function slot(name) {
      if (!byName[name]) {
        byName[name] = {
          name: name, kind: '', key: normalizeKey(name),
          docs: [], declared: false, refs: 0,
        };
        order.push(name);
      }
      return byName[name];
    }
    function touch(name, docName, kind) {
      var s = slot(name);
      s.refs++;
      if (kind) { s.declared = true; if (!s.kind) s.kind = kind; }
      if (s.docs.indexOf(docName) === -1) s.docs.push(docName);
    }

    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      var docName = (d && d.name) || '';
      window.MA.dslUtils.splitLines((d && d.dsl) || '').forEach(function(line) {
        if (/^\s*(?:'|@)/.test(line)) return;                 // コメント・@startuml
        var decl = _declaredIn(line);
        if (decl) { touch(decl.name, docName, decl.kind); return; }
        var a = line.match(ARROW_RE);
        if (!a) return;
        var left = a[1] || a[2];
        var right = a[3] || a[4];
        if (_isName(left)) touch(left, docName, null);
        if (_isName(right)) touch(right, docName, null);
      });
    });

    order.sort();
    return order.map(function(n) { return byName[n]; });
  }

  // 正規化キーが同じで綴りが 2 通り以上ある組。出現の多い綴りを先頭に置き、
  // それを「統一先の推奨」として使えるようにする。
  function variants(docs) {
    var rows = collect(docs);
    var byKey = {};
    var keys = [];
    rows.forEach(function(r) {
      if (!byKey[r.key]) { byKey[r.key] = []; keys.push(r.key); }
      byKey[r.key].push(r);
    });
    var out = [];
    keys.forEach(function(k) {
      var members = byKey[k];
      if (members.length < 2) return;
      members = members.slice().sort(function(a, b) {
        if (b.refs !== a.refs) return b.refs - a.refs;         // 多数派を先頭に
        if (a.declared !== b.declared) return a.declared ? -1 : 1;
        return a.name < b.name ? -1 : 1;
      });
      out.push({
        key: k,
        suggested: members[0].name,
        members: members,
        total: members.reduce(function(a, m) { return a + m.refs; }, 0),
      });
    });
    out.sort(function(a, b) { return b.total - a.total || (a.key < b.key ? -1 : 1); });
    return out;
  }

  // どの図でも宣言されず、矢印にだけ現れる名前。クラス図の書き漏らし検出用。
  function undeclared(docs) {
    return collect(docs).filter(function(r) { return !r.declared; });
  }

  // 図 × 名前の対照表。reviewer が「この部品はどの図にあるか」を一望する。
  // { docs: [図名], rows: [{ name, kind, present: [bool] }] }
  function matrix(docs) {
    var names = (Array.isArray(docs) ? docs : []).map(function(d) { return (d && d.name) || ''; });
    var rows = collect(docs).map(function(r) {
      return {
        name: r.name,
        kind: r.kind,
        declared: r.declared,
        present: names.map(function(n) { return r.docs.indexOf(n) !== -1; }),
      };
    });
    return { docs: names, rows: rows };
  }

  // 監査結果のひとまとめ。UI とテストはこれだけ見ればよい。
  function audit(docs) {
    var rows = collect(docs);
    var v = variants(docs);
    return {
      names: rows,
      variants: v,
      undeclared: rows.filter(function(r) { return !r.declared; }),
      matrix: matrix(docs),
      clean: v.length === 0 && rows.every(function(r) { return r.declared; }),
    };
  }

  return {
    normalizeKey: normalizeKey,
    collect: collect,
    variants: variants,
    undeclared: undeclared,
    matrix: matrix,
    audit: audit,
  };
})();
