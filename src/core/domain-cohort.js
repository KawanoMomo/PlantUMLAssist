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
  function _scope() { return window.MA.auditScope; }

  // BLK-reviewer-20260909-0503-wish: 突合を GPIO の外へ広げた回、`plantuml`
  // ドメインが junior/primary/reviewer の 3 フォルダで「食い違い」と出た。中身は
  // plantuml-sequence.puml 等のアプリ同梱テンプレ (Sample Sequence / User→System→DB) を
  // 各自が独立に複製しただけの練習用で、GPIO のような業務上の名前空間衝突ではない。
  // テンプレ由来と業務データを同じ「食い違い」件数に混ぜると、reviewer は毎回
  // puml の中身を読んで「これはテンプレか」を手で選り分けることになる。
  //
  // 分類は audit-scope の実データ / テンプレ判定をそのまま使う (CLI の --summary の
  // 「内訳: 実データ n 枚 / テンプレ n 枚」と画面の除外が同じ規則になる)。
  // 名前で決める判定なので、本文をまだ読んでいない一覧の段階でも効く。
  // 返り値はテンプレなら理由の文字列、実データなら ''。
  function templateReasonOf(docName) {
    var as = _scope();
    if (!as || !as.classify) return '';
    var c = as.classify(docName);
    return c && c.kind === 'template' ? (c.reason || 'テンプレ') : '';
  }

  function isTemplate(docName) { return templateReasonOf(docName) !== ''; }

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
      var reason = templateReasonOf(d.name);
      var entry = {
        doc: d,
        name: _s(d.name),
        base: baseOf(d.name),
        folder: folder,
        kind: kindOf(d),
        template: reason !== '',
        templateReason: reason,
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
      // 業務データだけで数え直した姿。テンプレを混ぜたまま「3 フォルダに
      // またがる」と言うと、除外した後で比べる相手がいなくなる組が残る。
      g.dataEntries = g.entries.filter(function(e) { return !e.template; });
      g.templateEntries = g.entries.filter(function(e) { return e.template; });
      g.dataFolders = [];
      g.dataEntries.forEach(function(e) {
        if (g.dataFolders.indexOf(e.folder) < 0) g.dataFolders.push(e.folder);
      });
      g.dataFolders.sort();
      // 1 枚も業務データが無いドメイン = テンプレを各自が複製しただけの雑音。
      g.templateOnly = g.dataEntries.length === 0;
      g.crossFolderData = g.dataFolders.length >= 2;
      return g;
    });
  }

  // 2 フォルダ以上にまたがるドメインだけ。1 フォルダにしか無いドメインは
  // 「並べて比べる」対象にならない (比べる相手がいない)。
  // テンプレ由来だけのドメインは既定で落とす (opts.includeTemplates で戻せる)。
  function crossFolder(list, opts) {
    var inc = !!(opts && opts.includeTemplates);
    return (list || []).filter(function(g) {
      if (!g) return false;
      return inc ? g.crossFolder : (!g.templateOnly && g.crossFolderData);
    });
  }

  // 除外したテンプレ由来のドメイン。件数を黙って減らすと「食い違いが消えた」と
  // 読めてしまうので、何を外したかを必ず数えられるようにする。
  function templateOnly(list) {
    return (list || []).filter(function(g) { return g && g.templateOnly && g.crossFolder; });
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

  // ── 宣言を読む (BLK-reviewer-20260909-0703-wish) ────────────────────────
  // 「この図は向こうのフォルダの同名ドメインとは別物」という判断は、図の中の
  // `' domain-verdict: ...` 行に残っている。これまで突合はその行を一切見なかったので、
  // reviewer は突合が出した食い違いを 1 件ずつ grep で「決定済みか」確かめ直していた。
  // ここで組ごとに宣言を読み、突合の結果を 3 つに分ける:
  //   - 宣言なしの食い違い … これから判断すべきもの (従来の「食い違い」)
  //   - 宣言どおり         … 見なくてよいもの
  //   - 宣言と実体の食い違い … 宣言が現実と合っていないもの (reviewer が見るべき本命)
  function _verdictOf(doc, otherFolder) {
    var dv = window.MA.domainVerdict;
    if (!dv || !dv.readVerdict) return null;
    return dv.readVerdict(_dsl(doc), otherFolder);
  }

  // 組 1 つの宣言。どちらのフォルダが宣言したかも残す (片方しか書いていない図を
  // 「両方が決めた」と読ませない)。
  function verdictFor(pair) {
    var a = pair && pair.a, b = pair && pair.b;
    if (!a || !b) return { kind: '', by: [], conflict: '', text: '' };
    var va = _verdictOf(a.doc, b.folder);
    var vb = _verdictOf(b.doc, a.folder);
    var by = [];
    if (va) by.push(a.folder);
    if (vb) by.push(b.folder);
    var kind = '', conflict = '';
    if (va && vb && va.kind !== vb.kind) {
      // 両者が逆のことを宣言している。どちらかが古いので、機械では決められない。
      kind = '';
      conflict = 'declaration';
    } else {
      kind = (va && va.kind) || (vb && vb.kind) || '';
    }
    var matched = !!(pair.diff && pair.diff.matched);
    if (!conflict && kind === 'separate' && matched) conflict = 'separate-but-same';
    if (!conflict && kind === 'shared' && !matched) conflict = 'shared-but-differs';
    return { kind: kind, by: by, conflict: conflict, text: verdictText(kind, conflict, by) };
  }

  function verdictText(kind, conflict, by) {
    var who = (by || []).length ? ' (' + by.join(', ') + ' が宣言)' : '';
    if (conflict === 'declaration') return '宣言が食い違う: 同一と別物が両方書かれている' + who;
    if (conflict === 'separate-but-same') return '宣言と実体の食い違い: 別物と宣言されているのに中身が揃っている' + who;
    if (conflict === 'shared-but-differs') return '宣言と実体の食い違い: 同一と宣言されているのに中身が食い違う' + who;
    if (kind === 'separate') return '別ドメインと宣言済み' + who;
    if (kind === 'shared') return '同一ドメインと宣言済み' + who;
    return '';
  }

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
  // テンプレ由来の図は既定で組まない。同じテンプレの複製どうしは「揃っていて
  // 当たり前」なので、揃っていれば水増し、題材語を替えてあれば偽の食い違いになる。
  function pairsFor(group, opts) {
    var inc = !!(opts && opts.includeTemplates);
    var entries = (group && (inc ? group.entries : group.dataEntries || group.entries)) || [];
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

  function compare(group, opts) {
    var inc = !!(opts && opts.includeTemplates);
    var pairs = pairsFor(group, opts).map(function(p) {
      p.diff = diff(p.a.doc, p.b.doc);
      p.verdict = verdictFor(p);
      return p;
    });
    // 宣言どおりの組は「食い違い」から外す。外した数は必ず残す
    // (黙って減らすと、前回の件数と比べたときに「直った」と読めてしまう)。
    var declared = pairs.filter(function(p) { return p.verdict.kind && !p.verdict.conflict; });
    var conflicts = pairs.filter(function(p) { return !!p.verdict.conflict; });
    return {
      domain: group.domain,
      folders: inc ? group.folders : (group.dataFolders || group.folders),
      entries: group.entries,
      // 突合から外したテンプレ由来の枚数。0 でない行は「全部は比べていない」。
      templates: (group.templateEntries || []).length,
      includedTemplates: inc,
      pairs: pairs,
      // 突き合わせた組のうち、まだ判断されていない食い違いの数。
      // 「別物と宣言済み」の組はここに数えない (決定済みを毎回見せない)。
      mismatched: pairs.filter(function(p) {
        return !p.diff.matched && p.verdict.kind !== 'separate' && !p.verdict.conflict;
      }).length,
      // 宣言どおりで見なくてよい組と、宣言が現実と合っていない組。
      declared: declared.length,
      conflicts: conflicts.length,
      conflictPairs: conflicts,
      // 同じドメイン名だが図種が噛み合わず比べられなかったフォルダ跨ぎの枚数。
      // 0 件を「揃っている」と読み違えないために別に数える。
      unpaired: (inc ? group.crossFolder : group.crossFolderData) && pairs.length === 0,
    };
  }

  // 監査の入口。tools/audit-report.js の AUDITS.cohort から呼ばれる。
  function audit(docs, opts) {
    var inc = !!(opts && opts.includeTemplates);
    var all = groups(docs);
    var cross = crossFolder(all, opts).map(function(g) { return compare(g, opts); });
    var tpl = templateOnly(all);
    return {
      groups: cross,
      // 1 フォルダにしか無いドメイン = 相手がいないので比べていない。
      soloDomains: all.filter(function(g) {
        if (inc) return !g.crossFolder;
        return !g.templateOnly && !g.crossFolderData;
      }).map(function(g) { return g.domain; }),
      // 突合から外したテンプレ由来のドメイン。0 件を「食い違いなし」と読ませない
      // ために、除外そのものを結果に残す (画面でも --summary でも出す)。
      templateDomains: tpl.map(function(g) {
        return {
          domain: g.domain,
          folders: g.folders,
          files: g.entries.length,
          reason: (g.entries[0] && g.entries[0].templateReason) || 'テンプレ',
        };
      }),
      // 宣言済みで突合から降りた組と、宣言が実体と合っていない組 (BLK-reviewer-20260909-0703-wish)。
      // reviewer が見るべきは conflicts と、宣言なしの食い違い (groups[].mismatched) だけ。
      declared: cross.reduce(function(n, g) { return n + (g.declared | 0); }, 0),
      conflicts: cross.reduce(function(n, g) { return n + (g.conflicts | 0); }, 0),
      templateFiles: all.reduce(function(n, g) { return n + (g.templateEntries || []).length; }, 0),
      includedTemplates: inc,
      domains: all.length,
    };
  }

  // 除外したテンプレを言う尾。「テンプレも数えた件数」との差が読めないと、
  // 前回の run と件数を比べたときに「直った」と読み違える。
  function templateNote(result) {
    var tpl = (result && result.templateDomains) || [];
    if (result && result.includedTemplates) {
      return tpl.length ? ' (テンプレ由来 ' + tpl.length + ' ドメインも含めている)' : '';
    }
    if (!tpl.length) return '';
    return ' (テンプレ由来 ' + tpl.length + ' ドメインは除外: '
      + tpl.map(function(t) { return t.domain; }).join(', ') + ')';
  }

  // 宣言を数えた尾 (BLK-reviewer-20260909-0703-wish)。宣言済みを黙って外すと
  // 件数の減りが「直った」に見えるので、外した数と、宣言が実体と合っていない数を必ず言う。
  function verdictNote(result) {
    var r = result || {};
    var parts = [];
    if (r.declared) parts.push('宣言済み ' + r.declared + ' 組は除外');
    if (r.conflicts) parts.push('宣言と実体の食い違い ' + r.conflicts + ' 組');
    return parts.length ? ' (' + parts.join(' / ') + ')' : '';
  }

  // 宣言が実体と合っていない組だけを並べる。reviewer が手順 4.7 で最初に見る一覧。
  function conflictRows(result) {
    var out = [];
    ((result && result.groups) || []).forEach(function(g) {
      (g.conflictPairs || []).forEach(function(p) {
        out.push({
          domain: g.domain,
          kind: p.kind,
          left: p.a.folder + ' / ' + p.a.base,
          right: p.b.folder + ' / ' + p.b.base,
          leftName: p.a.name,
          rightName: p.b.name,
          conflict: p.verdict.conflict,
          text: p.verdict.text,
        });
      });
    });
    return out;
  }

  function summaryLine(result) {
    var r = result || {};
    var g = r.groups || [];
    var note = verdictNote(r) + templateNote(r);
    if (!g.length) {
      return 'ドメイン突合: フォルダをまたぐドメインがありません (全 ' + (r.domains | 0) + ' ドメイン)' + note;
    }
    var bad = g.filter(function(x) { return x.mismatched > 0; });
    var unpaired = g.filter(function(x) { return x.unpaired; }).map(function(x) { return x.domain; });
    var tail = unpaired.length
      ? ' (図種が噛み合わず比べられないドメイン ' + unpaired.length + ' 件: ' + unpaired.join(', ') + ')'
      : '';
    if (!bad.length) {
      return 'ドメイン突合: フォルダをまたぐ ' + g.length + ' ドメインは名前もラベルも揃っている' + tail + note;
    }
    return 'ドメイン突合: ' + g.length + ' ドメイン中 ' + bad.length + ' 件が食い違い ('
      + bad.map(function(x) { return x.domain + ' [' + x.folders.join(' × ') + ']'; }).join(', ') + ')' + tail + note;
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
          // 宣言済みの組は行に印が出る。「決定済みかどうか」を grep で確かめ直さない。
          verdict: p.verdict || { kind: '', by: [], conflict: '', text: '' },
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
    templateOnly: templateOnly,
    templateReasonOf: templateReasonOf,
    isTemplate: isTemplate,
    templateNote: templateNote,
    verdictFor: verdictFor,
    verdictText: verdictText,
    verdictNote: verdictNote,
    conflictRows: conflictRows,
    pairsFor: pairsFor,
    diff: diff,
    compare: compare,
    audit: audit,
    rows: rows,
    summaryLine: summaryLine,
  };
})();
