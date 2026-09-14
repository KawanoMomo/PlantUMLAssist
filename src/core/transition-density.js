'use strict';
window.MA = window.MA || {};

// transition-density — 系統ごとの「1 メッセージ何遷移か」を並べ、外れた系統を先に示す。
//
// レビュー指摘「dma_state だけ 1 メッセージが 4 遷移に分解されている (他系統は 1:1)」は、
// 今は指摘の文章を読む → 自分で adc_state 等を開いて見比べる → 直す、の 3 段階。
// ここは系統 (図の名前の頭) ごとに、状態遷移図の遷移数とシーケンス図のメッセージ数を
// 数えて密度 (遷移数 / メッセージ数) を出し、他系統の中央値から外れた系統を上に置く。
// 見比べる相手を自分で選ぶ手間を消すのが目的なので、DOM には触らない。
window.MA.transitionDensity = (function() {
  // 中央値の何倍離れたら「外れ値」と呼ぶか。1 メッセージ 1 遷移が揃っている中に
  // 4 遷移の系統が 1 つ混ざる、を拾える幅。狭くすると 1.0 と 1.5 が全部外れ値になる。
  var OUTLIER_RATIO = 1.5;
  // 中央値を信用するのに要る系統数。2 系統では「どちらが外れているか」を言えない。
  var MIN_FAMILIES = 3;

  // 図種。タブが持つ diagramType は選び直しても書き換わらないことがあるので、
  // DSL からの判定を先に採る (トレースカバレッジと同じ順)。
  function _kind(doc) {
    var kind = '';
    var pu = window.MA.parserUtils;
    if (pu && pu.detectDiagramType) {
      try { kind = pu.detectDiagramType(_dsl(doc)) || ''; } catch (e) { kind = ''; }
    }
    if (!kind) kind = (doc && doc.diagramType) || '';
    return String(kind).toLowerCase().replace(/^plantuml-/, '');
  }

  function _dsl(doc) {
    if (window.MA.dslUtils && window.MA.dslUtils.docDsl) return window.MA.dslUtils.docDsl(doc);
    return String((doc && doc.dsl) || '');
  }

  // 状態の宣言数。`state Foo` の明示宣言と、遷移の両端に現れた名前を合わせて数える
  // ([*] は状態ではない)。宣言を書かない流儀でも数が 0 にならないようにする。
  function statesOf(dsl) {
    var seen = {};
    var order = [];
    function add(name) {
      var s = String(name || '').replace(/^"|"$/g, '').trim();
      if (!s || s === '[*]' || seen[s]) return;
      seen[s] = true;
      order.push(s);
    }
    String(dsl == null ? '' : dsl).split(/\r?\n/).forEach(function(line) {
      var m = line.match(/^\s*state\s+(?:"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/);
      if (m) add(m[1] || m[2]);
    });
    _transitions(dsl).forEach(function(t) { add(t.from); add(t.to); });
    return order;
  }

  function _transitions(dsl) {
    var tc = window.MA.traceCoverage;
    if (tc && tc.transitionsOf) return tc.transitionsOf(dsl);
    return [];
  }

  // シーケンス図のメッセージ。動作名 (矢印ラベル) の数え方は系統チェックと同じにする
  // ——同じ画面の別の表と数が食い違うと、どちらを信じるか分からなくなる。
  function messagesOf(dsl) {
    var fa = window.MA.familyAudit;
    return fa ? fa.actionsOf(dsl) : [];
  }

  // ---- 分母が状態機械と同じ粒度かを確かめる (BLK-reviewer-20260908-1603) ----
  //
  // 密度は「遷移数 / メッセージ数」だが、この 2 つは同じものを数えているとは限らない。
  // 実際の corpus では uart_init_sequence の 6 メッセージは Uart_Init() の**中身**
  // (EnableClock / WriteConfig / EnableIrq / Ack / InitDone) であり、状態機械では
  // Idle --> Configured : Uart_Init の 1 遷移にあたる。分母が初期化 1 回の内訳、
  // 分子が状態機械全体なので、TX/RX のように状態機械が広い系統 (UART) は粒度が
  // 揃っていても必ず外れ値側に出る。5 系統を目で読み直して誤検出と判定していたのがこれ。
  //
  // そこで分母を先に検分する: シーケンス図のメッセージのうち、状態遷移のラベルと
  // 対応するものがどれだけあるか。半分に満たなければ、そのシーケンス図は状態機械と
  // 同じ粒度を描いていないので、その系統の密度は「比べられない」と言う (中央値にも
  // 外れ値の判定にも入れない)。分子側は今までどおり状態機械全体を数える。
  var MIN_MESSAGE_MATCH = 0.5;

  // 系統のメッセージのうち、状態遷移のラベルと対応する件数。
  function messageMatch(stateDsls, seqDsls) {
    var keys = {};
    (stateDsls || []).forEach(function(dsl) {
      _transitions(dsl).forEach(function(t) {
        (t.keys || []).forEach(function(k) { if (k) keys[k] = true; });
      });
    });
    var total = 0, hit = 0;
    (seqDsls || []).forEach(function(dsl) {
      messagesOf(dsl).forEach(function(a) {
        total++;
        if (a && a.key && keys[a.key]) hit++;
      });
    });
    return { total: total, matched: hit, ratio: total ? hit / total : 0 };
  }

  function _median(nums) {
    var a = nums.slice().sort(function(x, y) { return x - y; });
    if (!a.length) return null;
    var mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  // 系統ごとの 1 行。密度を出せない系統 (状態遷移図かシーケンス図が欠けている) も
  // 落とさずに返す。「欠けている」ことが指摘の材料になるため。
  function rank(docs) {
    var fa = window.MA.familyAudit;
    var byKey = {};
    var order = [];
    (docs || []).forEach(function(d) {
      var key = fa ? fa.familyKeyOf(d && d.name) : '';
      if (!key) return;
      if (!byKey[key]) {
        byKey[key] = {
          key: key, states: 0, transitions: 0, messages: 0,
          // msgMatched — 遷移のラベルと対応したメッセージの数。sameGrain — 分母が
          // 状態機械と同じ粒度か。違えば密度を出さない (数えるものが違う)。
          msgMatched: 0, sameGrain: false, docs: [],
          stateDocs: [], seqDocs: [], density: null, outlier: false, reason: '',
        };
        order.push(key);
      }
      var row = byKey[key];
      var dsl = _dsl(d);
      var kind = _kind(d);
      var ref = { id: d.id, name: d.name };
      row.docs.push(d);
      if (kind === 'state') {
        row.stateDocs.push(ref);
        row.states += statesOf(dsl).length;
        row.transitions += _transitions(dsl).length;
      } else if (kind === 'sequence') {
        row.seqDocs.push(ref);
        row.messages += messagesOf(dsl).length;
      }
    });

    var rows = order.map(function(k) { return byKey[k]; })
      .filter(function(r) { return r.stateDocs.length || r.seqDocs.length; });

    // 系統ごとに、分母 (メッセージ) が状態機械と同じ粒度かを見る。
    rows.forEach(function(r) {
      var stateDsls = [], seqDsls = [];
      r.docs.forEach(function(d) {
        var k = _kind(d);
        if (k === 'state') stateDsls.push(_dsl(d));
        else if (k === 'sequence') seqDsls.push(_dsl(d));
      });
      var m = messageMatch(stateDsls, seqDsls);
      r.msgMatched = m.matched;
      r.sameGrain = m.total > 0 && m.ratio >= MIN_MESSAGE_MATCH;
    });

    rows.forEach(function(r) {
      if (!r.stateDocs.length) { r.reason = '状態遷移図がありません'; return; }
      if (!r.seqDocs.length) { r.reason = 'シーケンス図がありません'; return; }
      if (!r.messages) { r.reason = 'メッセージにラベルがありません'; return; }
      if (!r.sameGrain) {
        // 分母が状態機械と別の粒度。数だけ出すと必ず外れ値になるので出さない。
        r.reason = 'シーケンス図が状態機械と同じ粒度ではありません ('
          + r.msgMatched + '/' + r.messages + ' メッセージだけが遷移に対応)';
        return;
      }
      r.density = r.transitions / r.messages;
    });

    var withDensity = rows.filter(function(r) { return r.density != null; });
    var median = _median(withDensity.map(function(r) { return r.density; }));
    if (median && withDensity.length >= MIN_FAMILIES) {
      withDensity.forEach(function(r) {
        var ratio = r.density / median;
        if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) {
          r.outlier = true;
          r.reason = r.density > median ? '他系統より細かく分解されています' : '他系統よりまとめられています';
        }
      });
    }

    // 外れ値を上に、次に密度の大きい順。密度を出せない系統は最後 (材料が足りない側)。
    rows.sort(function(a, b) {
      if (a.outlier !== b.outlier) return a.outlier ? -1 : 1;
      if ((a.density == null) !== (b.density == null)) return a.density == null ? 1 : -1;
      if (a.density != null && b.density !== a.density) return b.density - a.density;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

    return { rows: rows, median: median, outliers: rows.filter(function(r) { return r.outlier; }) };
  }

  // 密度の表示。1 メッセージあたり何遷移かを 2 桁で。出せないときは「—」。
  function densityText(row) {
    if (!row || row.density == null) return '—';
    return (Math.round(row.density * 100) / 100).toFixed(2);
  }

  // 担当外の遷移しか無くて数えられなかった系統。黙って落とすと「揃っています」に
  // 見えるので、summaryLine で件数を言う (BLK-reviewer-20260908-1603)。
  function _unscoped(result) {
    return (result && result.rows ? result.rows : []).filter(function(r) {
      return r.density == null && r.messages > 0 && r.stateDocs.length && !r.sameGrain;
    });
  }

  function summaryLine(result) {
    if (!result || !result.rows.length) return '系統ごとに数えられる図がありません';
    var n = result.outliers.length;
    var skipped = _unscoped(result);
    var tail = skipped.length
      ? ' (シーケンス図が状態機械と同じ粒度でない系統 ' + skipped.length + ' 件は数えていません: '
        + skipped.map(function(r) { return r.key; }).join(', ') + ')'
      : '';
    if (result.median == null) {
      // 図が片方欠けているのか、粒度が違って数えられなかったのかで言い方を変える。
      // 「両方が要ります」と言われても、図は両方あるのに数えていない系統には効かない。
      return (skipped.length
        ? '同じ粒度で比べられる系統がありません'
        : '遷移密度を出せる系統がありません (状態遷移図とシーケンス図の両方が要ります)') + tail;
    }
    var med = (Math.round(result.median * 100) / 100).toFixed(2);
    var counted = result.rows.filter(function(r) { return r.density != null; }).length;
    if (counted < MIN_FAMILIES) {
      return '遷移密度を比べられる系統が ' + counted + ' 件しかありません (中央値 ' + med + ' 遷移/メッセージ)' + tail;
    }
    if (n === 0) return '遷移密度は ' + counted + ' 系統で揃っています (中央値 ' + med + ' 遷移/メッセージ)' + tail;
    return '中央値 ' + med + ' から外れた系統 ' + n + ' 件: '
      + result.outliers.map(function(r) { return r.key; }).join(', ') + tail;
  }

  return {
    OUTLIER_RATIO: OUTLIER_RATIO,
    MIN_FAMILIES: MIN_FAMILIES,
    MIN_MESSAGE_MATCH: MIN_MESSAGE_MATCH,
    statesOf: statesOf,
    messageMatch: messageMatch,
    messagesOf: messagesOf,
    rank: rank,
    densityText: densityText,
    summaryLine: summaryLine,
  };
})();
