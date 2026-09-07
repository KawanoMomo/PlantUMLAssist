'use strict';
window.MA = window.MA || {};

// trace-coverage — 状態遷移図の遷移が、同じ系統のシーケンス図のどれかに
// 現れているかを機械的に見る。
//
// 系統チェック (family-audit) は「片方にしか無い動作名」を両方向に出す。
// レビューが実際に探しているのはそのうち片側だけで、「状態遷移図に書かれた
// 遷移が、どのシーケンス図にも一度も現れない」= 手順の書き漏らし候補である。
// 向きを 1 つに固定し、系統ごとに遷移を全件並べて、現れなかったものだけを
// 赤にする。DOM には触らない。
//
// 粒度差 (初期化専用シーケンス vs フル状態遷移) の切り方は 2 段。
// 担当範囲の宣言 (`' @covers A -> B`) があればそれを使い、無ければ
// 遷移の担当割合で推測する (BLK-reviewer-20260907-2003)。宣言が無いときに
// 何も外さないと、`*_init_sequence.puml` しか無い系統は初期化後の遷移が
// 構造的に全部 missing になる。
window.MA.traceCoverage = (function() {
  // 遷移行。`A --> B : Label` / `[*] --> Idle : PowerOn`。
  // ラベルが無い遷移は突き合わせる名前が無いので拾わない。
  var TRANSITION_RE = /^\s*("[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|\.+>)\s*("[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+?)\s*$/;

  var SKIP_LINE_RE = /^\s*(?:@|'|note|end|state\b.*\{|title|header|footer|legend|skinparam|hide|show|scale|caption)/i;

  function _fa() { return window.MA.familyAudit; }

  function _norm(s) { return _fa().normalizeAction(s); }

  // 遷移ラベルの中で「シーケンスのメッセージ名になりうる」部分。
  // `Spi_Reset`、`start [ready] / arm()` の trigger と action をそれぞれ候補にする。
  // ガード条件だけは名前ではないので候補にしない。
  function labelKeys(label) {
    var keys = [];
    function push(v) {
      var k = _norm(v);
      if (k && keys.indexOf(k) < 0) keys.push(k);
    }
    push(label);
    var st = window.MA.stateTransition;
    if (st && st.parseLabel) {
      var p = st.parseLabel(label);
      push(p.trigger);
      push(p.action);
    }
    return keys;
  }

  // 1 枚の状態遷移図から、ラベル付きの遷移を書かれた順に拾う。
  // 同じラベルが 2 度出ても両方残す (どの行が漏れているかを指したいため)。
  function transitionsOf(dsl) {
    var out = [];
    String(dsl == null ? '' : dsl).split(/\r?\n/).forEach(function(line, i) {
      if (SKIP_LINE_RE.test(line)) return;
      var m = line.match(TRANSITION_RE);
      if (!m) return;
      var label = m[3].trim();
      var keys = labelKeys(label);
      if (!keys.length) return;
      out.push({
        from: m[1], to: m[2], label: label, keys: keys, line: i + 1,
      });
    });
    return out;
  }

  // 図種は DSL の中身から決める。タブが持つ diagramType は編集フォームを
  // 選ぶための値で、状態遷移を書いても sequence のままのことがある
  // (種類プルダウンを切り替えずに書けてしまう)。突き合わせるのは
  // 「実際に何が書かれているか」なので、まず本文を見て、読めないときだけ
  // タブの値に落ちる。`plantuml-state` の頭を落として `state` にそろえる。
  function _kindOf(doc, dsl) {
    var kind = '';
    var pu = window.MA.parserUtils;
    if (pu && pu.detectDiagramType) {
      try { kind = pu.detectDiagramType(dsl) || ''; } catch (e) { kind = ''; }
    }
    if (!kind) kind = (doc && doc.diagramType) || '';
    return String(kind).toLowerCase().replace(/^plantuml-/, '');
  }

  // 部分一致とみなす最小の長さ。`arm` が `disarm` に含まれるだけで
  // 「現れている」と言い切らないための下限。
  var PARTIAL_MIN = 5;

  function _match(keys, seqKeys) {
    var exact = [];
    var partial = [];
    keys.forEach(function(k) {
      seqKeys.forEach(function(entry) {
        if (entry.key === k) { if (exact.indexOf(entry.doc) < 0) exact.push(entry.doc); return; }
        if (k.length < PARTIAL_MIN && entry.key.length < PARTIAL_MIN) return;
        if (entry.key.indexOf(k) >= 0 || k.indexOf(entry.key) >= 0) {
          if (partial.indexOf(entry.doc) < 0) partial.push(entry.doc);
        }
      });
    });
    if (exact.length) return { status: 'covered', seenIn: exact };
    if (partial.length) return { status: 'partial', seenIn: partial };
    return { status: 'missing', seenIn: [] };
  }

  // 状態遷移図 1 枚に対して「突き合わせてよいシーケンス図」を決める。
  //
  // 見るのは、その状態遷移図の遷移のうち何割をその 1 枚が担当しているか。
  // 初期化専用シーケンスは PowerOn / Configure といった初期化の遷移しか
  // 担当せず、StartConv / Transfer / Reset 等の初期化後の遷移には一度も
  // 触れない。担当が半分に満たない相手は「書き漏らし」ではなく別の粒度で
  // 書かれた図なので、突き合わせない (BLK-reviewer-20260907-2003)。
  //
  // 語彙の集合そのものの一致率 (family-audit の Jaccard) ではなく担当割合で
  // 見るのは、遷移 1〜2 本の小さな図で「語彙が 1 つずれただけ」を粒度差と
  // 取り違えないため。閾値は family-audit の CROSS_KIND_JACCARD に合わせる
  // (同じ根本原因を 2 つの数字で切ると、片方だけが誤検出を出し続ける)。
  // skipped には外した組を残す。何を見ていないかを黙らないため。
  function _grainPartners(stateDocs, seqDocs) {
    var fa = _fa();
    var need = fa.CROSS_KIND_JACCARD;
    var seqKeysOf = {};
    seqDocs.forEach(function(d) {
      seqKeysOf[d.name] = fa.actionsOf(d.dsl).map(function(a) { return { key: a.key, doc: d.name }; });
    });

    var partners = {};
    var skipped = [];
    stateDocs.forEach(function(d) {
      var trans = transitionsOf(d.dsl);
      var ok = [];
      seqDocs.forEach(function(s) {
        var keys = seqKeysOf[s.name] || [];
        var hit = 0;
        trans.forEach(function(t) {
          if (_match(t.keys, keys).status !== 'missing') hit++;
        });
        var ratio = trans.length ? hit / trans.length : 0;
        if (ratio >= need) ok.push(s);
        else skipped.push({ state: d.name, seq: s.name, covered: hit, of: trans.length });
      });
      partners[d.name] = ok;
    });

    return {
      skipped: skipped,
      partnersOf: function(name) { return partners[name] || []; },
      // 突き合わせに使うメッセージ名。相手を絞ったぶんだけキーも絞る
      // (外した図のメッセージ名で「現れている」と言わないため)。
      keysOf: function(docs) {
        var out = [];
        (docs || []).forEach(function(d) {
          (seqKeysOf[d.name] || []).forEach(function(e) { out.push(e); });
        });
        return out;
      },
    };
  }

  // 系統 1 つのカバレッジ。stateDocs の遷移 × seqDocs のメッセージ。
  function coverFamily(docs) {
    var fa = _fa();
    var list = (docs || []).map(function(d) {
      var dsl = window.MA.dslUtils.docDsl(d);
      return { id: d.id, name: d.name, dsl: dsl, kind: _kindOf(d, dsl), raw: d };
    });
    var stateDocs = list.filter(function(d) { return d.kind === 'state'; });
    var seqDocs = list.filter(function(d) { return d.kind === 'sequence'; });

    var seqKeys = [];
    seqDocs.forEach(function(d) {
      fa.actionsOf(d.dsl).forEach(function(a) { seqKeys.push({ key: a.key, doc: d.name }); });
    });

    // 担当範囲の宣言 (`' @covers A -> B`)。系統のシーケンス図が 1 枚でも
    // 宣言していれば、宣言された遷移だけを突き合わせの対象にする。
    // 「初期化専用シーケンス vs フル状態遷移」の粒度差を語彙一致率で
    // 推測せず、書かれた意図で切る。
    var sd = window.MA.scopeDecl;
    var declaredCovers = [];
    var declaredBy = [];
    if (sd) {
      seqDocs.forEach(function(d) {
        var p = sd.parse(d.dsl);
        if (!p.declared) return;
        declaredBy.push(d.name);
        p.covers.forEach(function(c) {
          if (!declaredCovers.some(function(x) { return sd.same(x, c); })) declaredCovers.push(c);
        });
      });
    }
    var hasDecl = declaredBy.length > 0;

    // BLK-reviewer-20260907-2003: 宣言が無い系統では、family-audit と同じ
    // 語彙一致率で粒度差を外す。`*_init_sequence.puml` しか持たない系統は、
    // 状態遷移図の初期化後の遷移 (StartConv / Transfer / Reset …) が構造的に
    // 全部 missing になり、8 系統ぶんを毎回「これは粒度差」と目で判定していた。
    // 突き合わせるのは、その状態遷移図と語彙を共有するシーケンス図だけにする。
    var grain = hasDecl ? null : _grainPartners(stateDocs, seqDocs);

    var rows = [];
    var outOfScope = [];
    stateDocs.forEach(function(d) {
      // 語彙を共有する相手がいない状態遷移図は、粒度が違う相手としか
      // 並んでいない。突き合わせずに「見ていない」と言う。
      var partners = grain ? grain.partnersOf(d.name) : seqDocs;
      var grainOut = !!grain && seqDocs.length > 0 && partners.length === 0;
      var keys = grain ? grain.keysOf(partners) : seqKeys;
      transitionsOf(d.dsl).forEach(function(t) {
        var base = {
          docId: d.id, docName: d.name, line: t.line,
          from: t.from, to: t.to, label: t.label, keys: t.keys,
        };
        if (hasDecl && !sd.covered(declaredCovers, t)) {
          base.status = 'out-of-scope';
          base.reason = 'declared';
          base.seenIn = [];
          outOfScope.push(base);
          return;
        }
        if (grainOut) {
          base.status = 'out-of-scope';
          base.reason = 'grain';
          base.seenIn = [];
          outOfScope.push(base);
          return;
        }
        var m = partners.length ? _match(t.keys, keys) : { status: 'unknown', seenIn: [] };
        base.status = m.status;
        base.seenIn = m.seenIn;
        rows.push(base);
      });
    });

    var missing = rows.filter(function(r) { return r.status === 'missing'; });
    var covered = rows.filter(function(r) { return r.status === 'covered'; });
    return {
      docs: list,
      stateDocs: stateDocs.map(function(d) { return { id: d.id, name: d.name }; }),
      seqDocs: seqDocs.map(function(d) { return { id: d.id, name: d.name }; }),
      rows: rows,
      missing: missing,
      partial: rows.filter(function(r) { return r.status === 'partial'; }),
      // 宣言によって対象外になった遷移。0 件にはできないが、黙って消すと
      // 「見ていない遷移」が画面から消えるので、件数と中身は残す。
      outOfScope: outOfScope,
      // 粒度が違うとして外した (状態遷移図 × シーケンス図) の組。
      grainSkipped: grain ? grain.skipped : [],
      declared: hasDecl,
      declaredBy: declaredBy,
      declaredCovers: declaredCovers,
      // 突き合わせが成立したか。状態遷移図とシーケンス図が片方でも欠けたら
      // 「漏れ 0 件」ではなく「見ていない」と言う。
      comparable: stateDocs.length > 0 && seqDocs.length > 0 && rows.length > 0,
      coverage: rows.length ? covered.length / rows.length : 0,
    };
  }

  // 状態遷移図を 1 枚でも持つ系統だけを、family-audit と同じ系統キーで返す。
  // 1 枚しか無い系統も対象にする (シーケンスが無いこと自体が指摘になる)。
  function audit(docs) {
    var fa = _fa();
    var byKey = {};
    var order = [];
    (docs || []).forEach(function(d) {
      var k = fa.familyKeyOf(d && d.name);
      if (!k) return;
      if (!byKey[k]) { byKey[k] = []; order.push(k); }
      byKey[k].push(d);
    });
    return order.map(function(k) {
      var c = coverFamily(byKey[k]);
      c.key = k;
      return c;
    }).filter(function(c) { return c.stateDocs.length > 0; });
  }

  // 画面の見出し 1 行。何を見ていないかを黙らない。
  function summaryLine(family) {
    if (!family) return '';
    if (!family.seqDocs.length) {
      return 'この系統にシーケンス図が無いため突き合わせていません';
    }
    var oos = (family.outOfScope || []).length;
    var grainPairs = (family.grainSkipped || []).length;
    var scope = family.declared
      ? ' / 宣言対象外 ' + oos + ' 件は見ていません'
      : (oos ? ' / 粒度違いで除外 ' + oos + ' 件 (' + grainPairs + ' 組)' : '');
    if (!family.rows.length) {
      if (family.declared) return '宣言された遷移がありません (宣言対象外 ' + oos + ' 件)';
      if (oos) {
        return '粒度が違うため突き合わせていません (遷移 ' + oos + ' 件 / ' + grainPairs + ' 組)'
          + '。担当範囲を宣言すると突き合わせられます';
      }
      return 'ラベルの付いた遷移がありません';
    }
    var tail = (family.partial.length ? ' (部分一致 ' + family.partial.length + ' 件)' : '') + scope;
    var n = family.missing.length;
    return (n === 0
      ? '遷移 ' + family.rows.length + ' 件はすべてシーケンスに現れています (漏れ 0 件)'
      : 'どのシーケンスにも現れない遷移 ' + n + ' 件 / ' + family.rows.length + ' 件') + tail;
  }

  // 担当範囲を宣言する画面のためのチェックボックス一覧。系統の状態遷移図に
  // 書かれた from→to を、宣言済みかどうかを付けて重複なしで返す。
  function scopeChoices(family) {
    var sd = window.MA.scopeDecl;
    if (!family || !sd) return [];
    var all = (family.rows || []).concat(family.outOfScope || []);
    var out = [];
    all.forEach(function(r) {
      var hit = null;
      for (var i = 0; i < out.length; i++) {
        if (sd.same(out[i], r)) { hit = out[i]; break; }
      }
      if (hit) { if (hit.labels.indexOf(r.label) < 0) hit.labels.push(r.label); return; }
      out.push({
        from: r.from, to: r.to, labels: [r.label],
        docName: r.docName, line: r.line,
        declared: sd.covered(family.declaredCovers || [], r),
      });
    });
    return out;
  }

  // ステータスバー等に出す全系統の合計。
  function totalMissing(families) {
    return (families || []).reduce(function(n, f) { return n + f.missing.length; }, 0);
  }

  return {
    TRANSITION_RE: TRANSITION_RE,
    PARTIAL_MIN: PARTIAL_MIN,
    labelKeys: labelKeys,
    transitionsOf: transitionsOf,
    coverFamily: coverFamily,
    audit: audit,
    summaryLine: summaryLine,
    scopeChoices: scopeChoices,
    totalMissing: totalMissing,
  };
})();
