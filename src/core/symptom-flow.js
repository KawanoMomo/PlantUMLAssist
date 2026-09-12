'use strict';
window.MA = window.MA || {};

// symptom-flow — 症状検索で当たった図どうしを、その場で突き合わせる
// (BLK-primary-20260909-0703-wish)。
//
// 症状文を貼ると 6 図が当たる。しかし当たった先でやることは毎回同じで、
// 「シーケンスの Spi_TransmitDma に対応する状態が、状態遷移図にちゃんとあるか」
// を 1 枚ずつ開いて目で突き合わせることだった。6 図あれば 6 回開く。
// 矛盾が無い図まで開くので、確認の手数は当たった枚数に比例して増える。
//
// 既存の依存グラフ・命名突合は「部品名が図をまたいで一致しているか」は見るが、
// 見ているのは名前の集合であって、1 つの症状に絡む複数図の「流れ」ではない。
// ここでは当たった語をキーに、シーケンス図のメッセージと状態遷移図の
// 状態名・遷移ラベルだけを取り出して突き合わせ、
// **対応の付かない流れを持つ図だけを浮かせる**。
// 対応が全部付いた図は開かなくてよい図なので、そう名指しする。
//
// 突合の単位を「当たった語に絡む流れ」に絞るのは、症状と無関係な行の食い違い
// (図の粒度の差) まで挙げると、浮いた図が全部になって選別にならないため。
window.MA.symptomFlow = (function() {

  var ARROW_RE = /(?:<--|-->|<-|->|\.\.>|<\.\.)/;

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 名前の正規化。大小・区切り記号の違いは別名ではない。
  function normalize(name) {
    return _s(name).toLowerCase().replace(/[\s_\-.()]+/g, '');
  }

  // 語に割る。CamelCase / snake_case のどちらで書かれていても同じ語列にする。
  function words(name) {
    var s = _s(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return s.split(/[\s_\-.()/]+/)
      .map(function(w) { return w.toLowerCase(); })
      .filter(function(w) { return w !== ''; });
  }

  // どの部品にも付く一般動詞。この語を共有するだけでは対応の根拠にならない
  // (Spi_Init と Can_Init は別の流れ)。共有で結んでよいのは部品・動作を
  // 名指しする語 (Transmit / Fault / Watchdog …) だけ。
  var GENERIC = {
    init: 1, start: 1, stop: 1, done: 1, ready: 1, idle: 1, wait: 1, exit: 1,
    open: 1, close: 1, read: 1, write: 1, send: 1, recv: 1, reset: 1, error: 1,
    enter: 1, leave: 1, state: 1, event: 1, main: 1, call: 1, retn: 1, sync: 1,
    enable: 1, disable: 1, update: 1, notify: 1, request: 1, response: 1,
    complete: 1, finish: 1, begin: 1, run: 1, proc: 1, handler: 1, callback: 1,
  };

  // 同じ流れを指しているか。名前の形だけで決める (意味は見ない)。
  //   完全一致 / 片方がもう片方を含む (4 文字以上) / 特徴語を共有する
  // 「特徴語」は 4 文字以上で GENERIC でない語。
  function same(a, b) {
    var na = normalize(a), nb = normalize(b);
    if (na === '' || nb === '') return false;
    if (na === nb) return true;
    if (na.length >= 4 && nb.indexOf(na) >= 0) return true;
    if (nb.length >= 4 && na.indexOf(nb) >= 0) return true;
    var wa = words(a), wb = words(b);
    for (var i = 0; i < wa.length; i++) {
      if (wa[i].length < 4 || GENERIC[wa[i]]) continue;
      for (var j = 0; j < wb.length; j++) if (wa[i] === wb[j]) return true;
    }
    return false;
  }

  // シーケンス図のメッセージ。ラベルがあればラベル、無ければ受け手の名前を
  // その 1 本の呼び名にする (`A -> B` だけの行も流れではある)。
  function messages(dsl) {
    var out = [];
    String(dsl == null ? '' : dsl).split('\n').forEach(function(line, i) {
      var raw = String(line);
      if (/^\s*'/.test(raw) || /^\s*@/.test(raw)) return;
      if (/^\s*(?:state|class|interface|enum|usecase|component|node|rectangle|folder)\s/.test(raw)) return;
      if (!ARROW_RE.test(raw)) return;
      var head = raw.split(':')[0];
      var label = raw.split(':').slice(1).join(':').trim();
      var sides = head.split(ARROW_RE).map(function(s) {
        return s.trim().replace(/^"|"$/g, '');
      });
      var name = label || _s(sides[1]);
      if (!name) return;
      out.push({ name: name, line: i + 1, from: _s(sides[0]), to: _s(sides[1]) });
    });
    return out;
  }

  // 状態遷移図の「対応先になりうるもの」= 状態名と遷移ラベル。
  // シーケンスのメッセージは、状態遷移図では遷移ラベルにも状態名にもなる
  // (Spi_TransmitDma → Transmitting_Dma)。どちらも候補にする。
  function statePoints(dsl) {
    var out = [];
    String(dsl == null ? '' : dsl).split('\n').forEach(function(line, i) {
      var raw = String(line);
      if (/^\s*'/.test(raw) || /^\s*@/.test(raw)) return;
      var st = raw.match(/^\s*state\s+"?([^"\n{]+?)"?\s*(?:as\s+(\w+))?\s*(?:\{|:|$)/);
      if (st) {
        out.push({ name: _s(st[1]), line: i + 1, role: 'state' });
        if (st[2]) out.push({ name: _s(st[2]), line: i + 1, role: 'state' });
        return;
      }
      if (!/-+>/.test(raw)) return;
      var head = raw.split(':')[0];
      var label = raw.split(':').slice(1).join(':').trim();
      head.split(/-+>/).forEach(function(side) {
        var nm = _s(side).replace(/^"|"$/g, '');
        if (nm && nm !== '[*]') out.push({ name: nm, line: i + 1, role: 'state' });
      });
      if (label) out.push({ name: label, line: i + 1, role: 'transition' });
    });
    return out;
  }

  // 当たった語に絡む流れかどうか。照合の規則は symptomSearch と同じ
  // (粒の完全一致、無ければ 3 文字以上の部分一致)。同じ規則にしないと
  // 「症状検索では当たったのに突合では無視される」行ができる。
  function relatedTerms(name, termList) {
    var ss = window.MA && window.MA.symptomSearch;
    var ps = ss ? ss.parts(name) : words(name);
    var text = _s(name).toLowerCase();
    var out = [];
    (termList || []).forEach(function(term) {
      var t = String(term).toLowerCase();
      if (!t) return;
      var hit = false;
      for (var i = 0; i < ps.length; i++) {
        if (String(ps[i]).toLowerCase() === t) { hit = true; break; }
      }
      if (!hit && t.length >= 3 && text.indexOf(t) >= 0) hit = true;
      if (hit) out.push(term);
    });
    return out;
  }

  var KIND_NOTE = {
    class: 'クラス図 (流れを持たないので突合しません)',
    component: 'コンポーネント図 (流れを持たないので突合しません)',
    usecase: 'ユースケース図 (流れを持たないので突合しません)',
    activity: 'アクティビティ図 (流れを持たないので突合しません)',
    other: 'その他 (流れを持たないので突合しません)',
  };

  function _skip(p, note) {
    return {
      id: p.id, name: p.name, kind: p.kind, kindLabel: p.kindLabel,
      status: 'skip', gaps: [], ok: [], gapCount: 0, okCount: 0, note: note,
    };
  }

  // docs: [{ id, name, dsl }] / text: 症状文
  // → { rows, gapDocs, okDocs, skipped, terms, seqCount, stateCount }
  //   rows[i] = { id, name, kind, kindLabel, status: 'gap'|'ok'|'skip',
  //               gaps: [{ name, line, terms }],
  //               ok: [{ name, line, to, toLine, toDoc, toId }],
  //               gapCount, okCount, note }
  // rows は「浮かせる」順: 対応の無い流れがある図が先、次に対応済み、最後に対象外。
  function cross(docs, text) {
    var ss = window.MA && window.MA.symptomSearch;
    var is = window.MA && window.MA.impactScan;
    var termList = ss ? ss.terms(text) : [];
    var hitRows = ss ? ss.search(docs, text) : [];
    var byId = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) { if (d) byId[String(d.id)] = d; });

    var picked = hitRows.map(function(r) {
      var d = byId[String(r.id)];
      var kind = r.kind || (is ? is.detectKind(d && d.dsl) : 'other');
      return {
        id: r.id, name: r.name, dsl: d ? d.dsl : '', kind: kind,
        kindLabel: r.kindLabel || (is ? (is.KIND_LABEL[kind] || 'その他') : 'その他'),
        score: r.score,
      };
    });
    var seqDocs = picked.filter(function(p) { return p.kind === 'sequence'; });
    var stateDocs = picked.filter(function(p) { return p.kind === 'state'; });

    // 突合の相手側。シーケンスの相手は状態遷移図、状態遷移図の相手はシーケンス。
    var statePool = stateDocs.map(function(p) {
      return { doc: p, points: statePoints(p.dsl) };
    });
    var seqPool = seqDocs.map(function(p) {
      return { doc: p, points: messages(p.dsl) };
    });

    function check(items, pool, selfId) {
      var gaps = [], oks = [];
      items.forEach(function(it) {
        var terms = relatedTerms(it.name, termList);
        if (!terms.length) return;
        var found = null;
        for (var i = 0; i < pool.length && !found; i++) {
          if (String(pool[i].doc.id) === String(selfId)) continue;
          for (var j = 0; j < pool[i].points.length; j++) {
            if (same(it.name, pool[i].points[j].name)) {
              found = { doc: pool[i].doc, point: pool[i].points[j] };
              break;
            }
          }
        }
        if (found) {
          oks.push({
            name: it.name, line: it.line, terms: terms,
            to: found.point.name, toLine: found.point.line,
            toDoc: found.doc.name, toId: found.doc.id,
          });
        } else {
          gaps.push({ name: it.name, line: it.line, terms: terms });
        }
      });
      return { gaps: gaps, oks: oks };
    }

    var rows = [];
    picked.forEach(function(p) {
      var r;
      if (p.kind === 'sequence') {
        if (!statePool.length) {
          rows.push(_skip(p, '相手になる状態遷移図が当たっていません'));
          return;
        }
        r = check(messages(p.dsl), statePool, p.id);
      } else if (p.kind === 'state') {
        if (!seqPool.length) {
          rows.push(_skip(p, '相手になるシーケンス図が当たっていません'));
          return;
        }
        // 状態遷移図の側は遷移ラベルだけを見る。状態名はシーケンスに
        // メッセージとして現れないのが普通で、全部を欠落にすると選別にならない。
        r = check(statePoints(p.dsl).filter(function(x) { return x.role === 'transition'; }), seqPool, p.id);
      } else {
        rows.push(_skip(p, KIND_NOTE[p.kind] || KIND_NOTE.other));
        return;
      }
      rows.push({
        id: p.id, name: p.name, kind: p.kind, kindLabel: p.kindLabel,
        status: r.gaps.length ? 'gap' : 'ok',
        gaps: r.gaps, ok: r.oks,
        gapCount: r.gaps.length, okCount: r.oks.length,
        note: r.gaps.length
          ? r.gaps.length + ' 件が相手の図に見当たりません'
          : (r.oks.length ? '当たった語の流れは全部対応しています (開かなくてよい)'
                          : '当たった語に絡む流れがありません'),
      });
    });

    var ORDER = { gap: 0, ok: 1, skip: 2 };
    rows.sort(function(a, b) {
      return ORDER[a.status] - ORDER[b.status] || b.gapCount - a.gapCount;
    });

    return {
      rows: rows,
      terms: termList,
      gapDocs: rows.filter(function(r) { return r.status === 'gap'; }).length,
      okDocs: rows.filter(function(r) { return r.status === 'ok'; }).length,
      skipped: rows.filter(function(r) { return r.status === 'skip'; }).length,
      seqCount: seqDocs.length,
      stateCount: stateDocs.length,
    };
  }

  // 見出し。開かなくてよい図の枚数をそのまま言う (それが手順 4 の短縮分)。
  function headline(x) {
    if (!x || !x.rows.length) return '症状を貼ると、当たった図どうしの流れを突き合わせます';
    if (x.seqCount === 0 || x.stateCount === 0) {
      return 'シーケンス図と状態遷移図の両方が当たっていないので突合できません';
    }
    var txt = x.rows.length + ' 図中 ' + x.gapDocs + ' 図に対応の無い流れ';
    if (x.okDocs) txt += ' / ' + x.okDocs + ' 図は対応済み (開かなくてよい)';
    if (x.skipped) txt += ' / ' + x.skipped + ' 図は対象外';
    return txt;
  }

  return {
    normalize: normalize,
    words: words,
    same: same,
    messages: messages,
    statePoints: statePoints,
    relatedTerms: relatedTerms,
    cross: cross,
    headline: headline,
  };
})();
