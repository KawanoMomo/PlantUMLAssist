'use strict';
window.MA = window.MA || {};

// family-audit — 同じ系統の複数枚を横に並べ、動作名の食い違いを機械的に出す。
//
// ADC 系の init sequence / state / class が揃っているか、DMA 系の sequence の
// メッセージ列と state の遷移列の粒度が合っているかは、今は 3 枚を開いて目で
// 追うしかない。ここは「系統 (図の名前の頭を共有する複数枚)」でまとめ、
// 各図の矢印ラベル (sequence のメッセージ、state の遷移) を突き合わせて、
// どちらか一方にしか無い名前を出す。DOM には触らない。
window.MA.familyAudit = (function() {
  // 矢印行のラベル。`A -> B : Label` / `A --> B : Label` の `:` 以降を取る。
  // 左右の名前は name-audit の職掌なのでここでは見ない。
  var ARROW_LABEL_RE = /^\s*(?:"[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|<-+|\.+>|<\.+|-{2,})\s*(?:"[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+?)\s*$/;

  // 図の骨組み。ラベルとして数えない。
  var SKIP_LINE_RE = /^\s*(?:@|'|note|end|alt|else|opt|loop|par|break|critical|group|ref|activate|deactivate|title|header|footer|legend|skinparam|hide|show|autonumber|newpage|scale|caption)/i;

  // 突合キー。大小・区切り・番号付け・矢印装飾を落とすので
  // 「1. ConfigureChannel」「configure_channel」「Configure Channel()」は同じ組。
  function normalizeAction(label) {
    var s = String(label == null ? '' : label);
    s = s.replace(/^\s*\d+[.):]\s*/, '');            // 手番号「3. 」
    s = s.replace(/<<[^>]*>>/g, ' ');                 // ステレオタイプ
    s = s.replace(/\[[^\]]*\]/g, ' ');                // ガード条件 [ok]
    s = s.replace(/\([^)]*\)/g, ' ');                 // 引数リスト
    s = s.replace(/<\/?[a-z][^>]*>/gi, ' ');          // creole の色タグ等
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // 系統キー。図の名前の頭の 1 語 (Adc_Init / adc-state / AdcClass はすべて adc)。
  // camelCase の 2 語目以降は落とす。区切りも語境界も無ければ名前全体を系統とする。
  //
  // BLK-reviewer-20260907-1803: 名前がフォルダ付き (`primary/adc_state.puml`) で
  // 渡ると頭の 1 語がフォルダ名になり、そのフォルダの図が全部 1 系統に落ちていた。
  // adc の初期化手順と uart の状態遷移が同じ系統として突き合わされ、
  // 「片方にしか無い動作名」が全件出る。系統はファイル名だけで決める。
  function familyKeyOf(docName) {
    var s = String(docName == null ? '' : docName).trim();
    s = s.split(/[\/\\]/).pop();
    s = s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
    if (!s) return '';
    var head = s.split(/[\s_\-.]+/)[0];
    var camel = head.match(/^[A-Z]?[a-z0-9]+|^[A-Z]+(?![a-z])/);
    if (camel && camel[0] && camel[0].length < head.length) head = camel[0];
    return head.toLowerCase();
  }

  // 1 枚から動作名を順序どおりに拾う。同じ名前が 2 度出ても 1 件に畳む
  // (回数ではなく「その名前があるか」を突き合わせる)。
  function actionsOf(dsl) {
    var out = [];
    var seen = {};
    String(dsl == null ? '' : dsl).split(/\r?\n/).forEach(function(line) {
      if (SKIP_LINE_RE.test(line)) return;
      var m = line.match(ARROW_LABEL_RE);
      if (!m) return;
      var label = m[1].trim();
      var key = normalizeAction(label);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({ label: label, key: key });
    });
    return out;
  }

  // 系統ごとの束。2 枚以上ある系統だけを返す (1 枚では突き合わせにならない)。
  function groupFamilies(docs) {
    var byKey = {};
    var order = [];
    (docs || []).forEach(function(d) {
      var k = familyKeyOf(d && d.name);
      if (!k) return;
      if (!byKey[k]) { byKey[k] = { key: k, docs: [] }; order.push(k); }
      byKey[k].docs.push(d);
    });
    return order.map(function(k) { return byKey[k]; })
      .filter(function(g) { return g.docs.length >= 2; });
  }

  // 系統 1 つの突合表。rows は動作名 × 図の在/不在、onlyIn は 1 枚にしか
  // 無い名前 (= 粒度不一致か書き漏らしの候補)。
  function compareFamily(docs) {
    var list = (docs || []).map(function(d) {
      // id は画面が「その図へ飛ぶ」ために持ち回るだけ。突合には使わない。
      var kind = viewKindOf(d);
      return {
        id: d.id, name: d.name, diagramType: d.diagramType || '',
        kind: kind, dsl: window.MA.dslUtils.docDsl(d),
        actions: actionsOf(window.MA.dslUtils.docDsl(d)),
      };    });
    var rows = [];
    var index = {};
    list.forEach(function(doc, di) {
      doc.actions.forEach(function(a) {
        var row = index[a.key];
        if (!row) {
          row = { key: a.key, label: a.label, present: list.map(function() { return false; }) };
          index[a.key] = row;
          rows.push(row);
        }
        row.present[di] = true;
      });
    });
    // BLK-reviewer-20260907-1803: 同じ系統でも、初期化手順のシーケンス
    // (EnableClock() / WriteConfig() のレジスタ操作単位) と初期化後の状態遷移
    // (Idle / Configured / Sampling 単位) は意図して粒度が違う。語彙が 1 つも
    // 重ならない 2 枚は「書き漏らし」ではなく「別の粒度」なので、突き合わせない。
    // 突き合わせるのは語彙を共有する組だけにし、外した組は skipped に残す。
    var pairs = _comparablePairs(list);
    var partners = list.map(function() { return []; });
    pairs.comparable.forEach(function(p) {
      partners[p.a].push(p.b);
      partners[p.b].push(p.a);
    });

    rows.forEach(function(r) {
      var hits = [];
      var hitIdx = [];
      for (var i = 0; i < r.present.length; i++) {
        if (r.present[i]) { hits.push(list[i].name); hitIdx.push(i); }
      }
      r.count = hits.length;
      r.onlyIn = null;
      if (hits.length !== 1 || list.length < 2) return;
      // その名前を持つ 1 枚が、語彙を共有する相手を 1 枚でも持っているときだけ
      // 「片方にしか無い」と言える。相手がいなければ粒度違いなので黙る。
      if (partners[hitIdx[0]].length === 0) return;
      r.onlyIn = hits[0];
    });
    // 担当範囲の宣言があるなら、語彙一致率より宣言を優先する。状態遷移図に
    // しか無い動作名でも、その遷移がどのシーケンス図にも宣言されていなければ
    // 「担当外」であって書き漏らしではない。
    _applyScopeDecl(list, rows);
    var withActions = list.filter(function(d) { return d.actions.length > 0; }).length;
    return {
      docs: list,
      rows: rows,
      // 動作名を 1 つも持たない図が混ざっていると「片方にしか無い」が
      // 全件になって意味を失うので、突合が成立したかを別に持つ。
      comparable: withActions >= 2 && pairs.comparable.length > 0,
      // 粒度が違うとして突き合わせから外した組。何を見ていないかを言えるようにする。
      skipped: pairs.skipped,
      mismatches: rows.filter(function(r) { return !!r.onlyIn; }),
    };
  }

  // 宣言 (`' @covers A -> B`) による絞り込み。系統のシーケンス図が 1 枚でも
  // 宣言していれば、状態遷移図の側にしか無い動作名のうち、宣言されていない
  // 遷移から来たものを mismatch から外す (outOfScope に印を残す)。
  function _applyScopeDecl(list, rows) {
    var sd = window.MA.scopeDecl;
    var tc = window.MA.traceCoverage;
    if (!sd || !tc) return;
    var covers = [];
    list.forEach(function(d) {
      if (String(d.kind).toLowerCase().replace(/^plantuml-/, '') !== 'sequence') return;
      sd.parse(d.dsl).covers.forEach(function(c) {
        if (!covers.some(function(x) { return sd.same(x, c); })) covers.push(c);
      });
    });
    if (!covers.length) return;

    // 状態遷移図の「動作名 → その遷移が宣言されているか」。
    var declaredKey = {}, knownKey = {};
    list.forEach(function(d) {
      if (String(d.kind).toLowerCase().replace(/^plantuml-/, '') !== 'state') return;
      tc.transitionsOf(d.dsl).forEach(function(t) {
        var ok = sd.covered(covers, t);
        t.keys.forEach(function(k) {
          knownKey[k] = true;
          if (ok) declaredKey[k] = true;
        });
      });
    });

    rows.forEach(function(r) {
      if (!r.onlyIn) return;
      if (!knownKey[r.key] || declaredKey[r.key]) return;
      r.onlyIn = null;
      r.outOfScope = true;
    });
  }

  // 語彙の重なりで「突き合わせてよい組」を決める。
  //
  // 同じ図種どうし (state × state など) は同じ粒度で書かれている前提なので、
  // 1 語でも共有していれば突き合わせる (表記揺れを見つけるのがここの value)。
  // 図種が違う組 (sequence × state) は、初期化手順のレジスタ操作単位と
  // 初期化後の状態遷移単位のように、意図して粒度が違うのが普通なので、
  // 語彙がほぼ一致しているときだけ突き合わせる。
  var SHARE_RATIO = 0.25;          // 同じ図種で必要な共有率 (小さい方の枚数比)
  var CROSS_KIND_JACCARD = 0.5;    // 図種を跨ぐときに必要な語彙の一致率

  // 図の種類。呼び出し側が持っていなければ DSL から判定する
  // (audit CLI は名前と DSL しか持たないので、ここで自分で見る)。
  function viewKindOf(doc) {
    if (doc && doc.diagramType) return doc.diagramType;
    var pu = window.MA.parserUtils;
    if (!pu || !pu.detectDiagramType || !doc) return '';
    try {
      return pu.detectDiagramType(window.MA.dslUtils.docDsl(doc)) || '';
    } catch (e) { return ''; }
  }

  function _comparablePairs(list) {
    var comparable = [];
    var skipped = [];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        if (!a.actions.length || !b.actions.length) continue;   // 突合の対象外 (comparable が拾う)
        var keys = {};
        a.actions.forEach(function(x) { keys[x.key] = true; });
        var shared = 0;
        b.actions.forEach(function(x) { if (keys[x.key]) shared++; });
        var sameKind = !!a.kind && a.kind === b.kind;
        var union = a.actions.length + b.actions.length - shared;
        var ok, why;
        if (sameKind) {
          var need = Math.max(1, Math.ceil(SHARE_RATIO * Math.min(a.actions.length, b.actions.length)));
          ok = shared >= need;
          why = '同じ図種だが動作名の語彙が重ならない';
        } else {
          ok = union > 0 && (shared / union) >= CROSS_KIND_JACCARD;
          why = '図種が違い、動作名の語彙もほぼ重ならない (粒度が違う)';
        }
        if (ok) comparable.push({ a: i, b: j, shared: shared });
        else skipped.push({ a: a.name, b: b.name, shared: shared, reason: why });
      }
    }
    return { comparable: comparable, skipped: skipped };
  }

  function audit(docs) {
    return groupFamilies(docs).map(function(g) {
      var c = compareFamily(g.docs);
      c.key = g.key;
      return c;
    });
  }

  // 画面の見出し 1 行。0 件なら「揃っています」と言い切る。
  function summaryLine(family) {
    if (!family) return '';
    var skipped = (family.skipped || []).length;
    // 粒度が違うとして全部外したなら、そう言う。黙って 0 件にすると
    // 「揃っている」と読めてしまう。
    if (!family.comparable) {
      return skipped > 0
        ? '粒度が違うため突き合わせていません (' + skipped + ' 組)'
        : '突き合わせる動作名が 2 枚ぶん揃っていません';
    }
    var tail = skipped > 0 ? ' (粒度違いで除外 ' + skipped + ' 組)' : '';
    var n = family.mismatches.length;
    return (n === 0
      ? '動作名は ' + family.docs.length + ' 枚で揃っています (食い違い 0 件)'
      : '片方にしか無い動作名 ' + n + ' 件') + tail;
  }

  return {
    normalizeAction: normalizeAction,
    familyKeyOf: familyKeyOf,
    actionsOf: actionsOf,
    groupFamilies: groupFamilies,
    compareFamily: compareFamily,
    SHARE_RATIO: SHARE_RATIO,
    CROSS_KIND_JACCARD: CROSS_KIND_JACCARD,
    viewKindOf: viewKindOf,
    audit: audit,
    summaryLine: summaryLine,
  };
})();
