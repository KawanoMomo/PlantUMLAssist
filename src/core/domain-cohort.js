'use strict';
window.MA = window.MA || {};

// domain-cohort — 同じドメインの図を、フォルダ (ペルソナ) をまたいで並べる。
//
// BLK-reviewer-20260909-0403-wish: 対象を junior の図に広げたとき、GPIO 系統で
// junior/primary 双方の init_sequence・state が別物 (部品名・状態名・遷移ラベルとも
// 不一致) と分かるまでに、`persona-data\junior\` と `persona-data\primary\` の
// 該当ファイルを名前で推測して 4 枚個別に開き、テキストを見比べるしかなかった。
// 「同じドメイン名 (gpio 等) の図を他フォルダから見つけて並べる」手段が無い。
//
// family-audit は系統 (ドメイン) でまとめるがフォルダを意図的に捨てる
// (BLK-reviewer-20260907-1803)。ここは逆に、フォルダを軸として残したまま
// 同じドメイン・同じ図種の組だけを突き合わせる。突合そのもの (名前の正規化・
// 動作名の拾い方) は name-audit / family-audit をそのまま呼ぶので、
// GUI と CLI と既存監査で「同じ名前」の判定がずれない。
//
// DOM も fetch も触らない。描画は app.js、ファイル収集は tools/audit-report.js。
window.MA.domainCohort = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _fa() { return window.MA.familyAudit; }
  function _na() { return window.MA.nameAudit; }

  // `junior/gpio_state.puml` → `junior`。フォルダの無い名前は '' (= 分類なし)。
  // 深い階層は先頭 1 段だけを見る。ペルソナ = 保存フォルダ 1 段という置き方に合わせる。
  function folderOf(docName) {
    var s = _s(docName).split('\\').join('/');
    var i = s.indexOf('/');
    return i < 0 ? '' : s.slice(0, i);
  }

  // 表示に使うファイル名 (拡張子なし)。
  function baseOf(docName) {
    var s = _s(docName).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // ドメイン名。family-audit の系統キーと同じ規則にする
  // (CLI の「系統」と画面の「ドメイン」が別物に見えると突合の話が通じない)。
  function domainOf(docName) {
    var fa = _fa();
    return fa ? fa.familyKeyOf(docName) : baseOf(docName).split(/[\s_\-.]+/)[0].toLowerCase();
  }

  function kindOf(doc) {
    var fa = _fa();
    return fa ? fa.viewKindOf(doc) : '';
  }

  // 開始・終了擬似状態と組んだ遷移。`[*] --> Ready` の Ready は矢印の片側が
  // 識別子でないので name-audit の矢印規則には掛からない。状態遷移図では
  // 初期遷移でしか出てこない状態がふつうにあり (junior の gpio_state がそれ)、
  // 拾わないと「状態名の食い違い」がその 1 つ分だけ静かに消える。
  var PSEUDO_RE = /^\s*(?:\[\*\]\s*(?:-+>+|\.+>)\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)|([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|\.+>)\s*\[\*\])/;

  // 図 1 枚に出てくる部品名 (participant / component / state / class …)。
  // 宣言と矢印の両端をまとめて拾う name-audit の collect をそのまま使う。
  function namesOf(doc) {
    var na = _na();
    if (!na) return [];
    var dsl = _dsl(doc);
    var out = [];
    var seen = {};
    function push(name) {
      var v = _s(name);
      if (!v) return;
      var key = na.normalizeKey(v);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({ name: v, key: key });
    }
    (na.collect([{ name: _s(doc && doc.name), dsl: dsl }]) || []).forEach(function(e) {
      push(e && e.name);
    });
    dsl.split(/\r?\n/).forEach(function(line) {
      if (/^\s*(?:'|@)/.test(line)) return;
      var m = line.match(PSEUDO_RE);
      if (m) push(m[1] || m[2]);
    });
    out.sort(function(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    return out;
  }

  // 矢印ラベル (シーケンスのメッセージ / 状態遷移の遷移ラベル)。
  function labelsOf(doc) {
    var fa = _fa();
    return fa ? fa.actionsOf(_dsl(doc)) : [];
  }

  function _dsl(doc) {
    var du = window.MA.dslUtils;
    if (du && du.docDsl) return du.docDsl(doc);
    return _s(doc && doc.dsl);
  }

  // ── 集約 ────────────────────────────────────────────────────────────
  // ドメイン → そのドメインの図 (フォルダ付き)。並びはドメイン名順、
  // 同じドメイン内はフォルダ名 → ファイル名の順。画面の列とも CLI の行とも
  // この順で一致させる。
  function groups(docs) {
    var byKey = {};
    var order = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var key = domainOf(d.name);
      if (!key) return;
      if (!byKey[key]) { byKey[key] = { domain: key, entries: [], folders: [] }; order.push(key); }
      var g = byKey[key];
      var folder = folderOf(d.name);
      var entry = {
        doc: d,
        name: _s(d.name),
        base: baseOf(d.name),
        folder: folder,
        kind: kindOf(d),
      };
      g.entries.push(entry);
      if (g.folders.indexOf(folder) < 0) g.folders.push(folder);
    });
    order.sort();
    return order.map(function(k) {
      var g = byKey[k];
      g.folders.sort();
      g.entries.sort(function(a, b) {
        if (a.folder !== b.folder) return a.folder < b.folder ? -1 : 1;
        return a.base < b.base ? -1 : a.base > b.base ? 1 : 0;
      });
      g.crossFolder = g.folders.length >= 2;
      return g;
    });
  }

  // 2 フォルダ以上にまたがるドメインだけ。1 フォルダにしか無いドメインは
  // 「並べて比べる」対象にならない (比べる相手がいない)。
  function crossFolder(list) {
    return (list || []).filter(function(g) { return g && g.crossFolder; });
  }

  // ── 突合 ────────────────────────────────────────────────────────────
  function _split(a, b, keyOf, labelOf) {
    var ka = {}, kb = {};
    (a || []).forEach(function(x) { ka[keyOf(x)] = labelOf(x); });
    (b || []).forEach(function(x) { kb[keyOf(x)] = labelOf(x); });
    var both = [], onlyA = [], onlyB = [];
    Object.keys(ka).sort().forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(kb, k)) {
        // 綴りが割れている (Gpio_Driver / GpioDrv) ときは両方を見せる。
        both.push(ka[k] === kb[k] ? ka[k] : (ka[k] + ' / ' + kb[k]));
      } else onlyA.push(ka[k]);
    });
    Object.keys(kb).sort().forEach(function(k) {
      if (!Object.prototype.hasOwnProperty.call(ka, k)) onlyB.push(kb[k]);
    });
    return { both: both, onlyA: onlyA, onlyB: onlyB };
  }

  function _id(x) { return x.key; }
  function _label(x) { return x.name || x.label; }

  // 図 2 枚の差分。部品名と矢印ラベルを別々に出す
  // (直し方が違う: 名前は改名、ラベルは書き漏らしか架空の遷移)。
  function diff(a, b) {
    var names = _split(namesOf(a), namesOf(b), _id, _label);
    var labels = _split(labelsOf(a), labelsOf(b), _id, _label);
    var gaps = names.onlyA.length + names.onlyB.length + labels.onlyA.length + labels.onlyB.length;
    return {
      names: names,
      labels: labels,
      gaps: gaps,
      // 共有が 1 つも無い組は「食い違い」ではなく別物 (対象ドメインが同名なだけ)。
      shared: names.both.length + labels.both.length,
      matched: gaps === 0,
    };
  }

  // 同じドメインの、フォルダの違う、同じ図種の組。
  // 図種が違う 2 枚 (シーケンス × 状態遷移) は family/trace の職掌なのでここでは組まない。
  function pairsFor(group) {
    var entries = (group && group.entries) || [];
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      for (var j = i + 1; j < entries.length; j++) {
        var a = entries[i], b = entries[j];
        if (a.folder === b.folder) continue;
        if (!a.kind || a.kind !== b.kind) continue;
        out.push({ kind: a.kind, a: a, b: b });
      }
    }
    return out;
  }

  function compare(group) {
    var pairs = pairsFor(group).map(function(p) {
      p.diff = diff(p.a.doc, p.b.doc);
      return p;
    });
    return {
      domain: group.domain,
      folders: group.folders,
      entries: group.entries,
      pairs: pairs,
      // 突き合わせた組のうち、片方にしか無い名前・ラベルを持つ組の数。
      mismatched: pairs.filter(function(p) { return !p.diff.matched; }).length,
      // 同じドメイン名だが図種が噛み合わず比べられなかったフォルダ跨ぎの枚数。
      // 0 件を「揃っている」と読み違えないために別に数える。
      unpaired: group.crossFolder && pairs.length === 0,
    };
  }

  // 監査の入口。tools/audit-report.js の AUDITS.cohort から呼ばれる。
  function audit(docs) {
    var all = groups(docs);
    var cross = crossFolder(all).map(compare);
    return {
      groups: cross,
      // 1 フォルダにしか無いドメイン = 相手がいないので比べていない。
      soloDomains: all.filter(function(g) { return !g.crossFolder; })
        .map(function(g) { return g.domain; }),
      domains: all.length,
    };
  }

  function summaryLine(result) {
    var r = result || {};
    var g = r.groups || [];
    if (!g.length) {
      return 'ドメイン突合: フォルダをまたぐドメインがありません (全 ' + (r.domains | 0) + ' ドメイン)';
    }
    var bad = g.filter(function(x) { return x.mismatched > 0; });
    var unpaired = g.filter(function(x) { return x.unpaired; }).map(function(x) { return x.domain; });
    var tail = unpaired.length
      ? ' (図種が噛み合わず比べられないドメイン ' + unpaired.length + ' 件: ' + unpaired.join(', ') + ')'
      : '';
    if (!bad.length) {
      return 'ドメイン突合: フォルダをまたぐ ' + g.length + ' ドメインは名前もラベルも揃っている' + tail;
    }
    return 'ドメイン突合: ' + g.length + ' ドメイン中 ' + bad.length + ' 件が食い違い ('
      + bad.map(function(x) { return x.domain + ' [' + x.folders.join(' × ') + ']'; }).join(', ') + ')' + tail;
  }

  // 画面の行。左が自分のフォルダ、右が相手。押せば peek でその図を開ける。
  function rows(result) {
    var out = [];
    ((result && result.groups) || []).forEach(function(g) {
      g.pairs.forEach(function(p) {
        out.push({
          domain: g.domain,
          kind: p.kind,
          left: p.a.folder + ' / ' + p.a.base,
          right: p.b.folder + ' / ' + p.b.base,
          leftName: p.a.name,
          rightName: p.b.name,
          gaps: p.diff.gaps,
          matched: p.diff.matched,
          diff: p.diff,
        });
      });
    });
    return out;
  }

  return {
    folderOf: folderOf,
    baseOf: baseOf,
    domainOf: domainOf,
    namesOf: namesOf,
    labelsOf: labelsOf,
    groups: groups,
    crossFolder: crossFolder,
    pairsFor: pairsFor,
    diff: diff,
    compare: compare,
    audit: audit,
    rows: rows,
    summaryLine: summaryLine,
  };
})();
