'use strict';
window.MA = window.MA || {};

// usecase-source — ユースケース図のアクター・ユースケース候補を、同じ部品の
// シーケンス図から拾う。
//
// BLK-junior-20260909-0403-wish: コンポーネント図には「実際の呼び出し」候補
// (BLK-junior-20260909-0303-wish) が出るようになったが、ユースケース図の
// 「末尾に追加」には候補が無く、誰が使うか (アクター) も何をするか (ユースケース) も
// 白紙から考えて一括入力欄に打つしかなかった。
//
// ここが出すのは 2 種類。どちらも「同じ部品のシーケンス図に実在する」ものだけで、
// 一般論のカタログは持たない — ユースケースは題材ごとに違うので、定石を出しても
// 結局は本人が見比べることになる (component-deps の catalog とはそこが違う)。
//   アクター候補:     その図の参加者のうち部品自身でないもの。部品にメッセージを
//                     送っている参加者 (呼び出し元) を先に置く。
//   ユースケース候補: メッセージのラベル。部品宛て (公開 API として呼ばれる側) を
//                     先に、部品から出るものを後に置く。
// 呼び出し元が分かっているユースケースは、アクターと一緒に選べば関連の行も
// 一緒に書き出す — 候補を選んだあとに from/to を選び直すなら手数が減らない。
//
// 「同じ部品」の判定と表記ゆれの吸収は component-deps と同じものを使う。
// 判定が 2 つあると、コンポーネント図では同じ部品なのにユースケース図では
// 違う部品、という食い違いが起きる。DOM には触らない。表示は modules/usecase.js。
window.MA.usecaseSource = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  function _cd() { return window.MA.componentDeps; }
  function normName(s) {
    var cd = _cd();
    return cd ? cd.normName(s) : _s(s).toLowerCase();
  }
  function keyTokens(s) {
    var cd = _cd();
    return cd ? cd.keyTokens(s) : [];
  }
  function _shareToken(a, b) {
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return true;
    return false;
  }

  function _dslOf(doc) {
    return window.MA.dslUtils ? window.MA.dslUtils.docDsl(doc) : _s(doc && doc.dsl);
  }

  function _seqDocs(docs, exceptId) {
    return (docs || []).filter(function(d) {
      if (!d || d.diagramType !== 'plantuml-sequence') return false;
      if (exceptId != null && d.id === exceptId) return false;
      return !!_s(_dslOf(d)).trim();
    });
  }

  function _parseSeq(dsl) {
    var seq = window.MA.modules && window.MA.modules.plantumlSequence;
    if (!seq || !_s(dsl).trim()) return { elements: [], relations: [] };
    var p = seq.parse(_s(dsl));
    return { elements: p.elements || [], relations: p.relations || [] };
  }

  // 部品の候補。シーケンス図の名前から、部品を見分ける語を取り出して束ねる。
  // ユースケース図は白紙から起こすことが多く、図の中には手がかりが無い —
  // 起点は「どの部品のユースケース図か」であって、図に既にある要素ではない。
  function subjects(docs, exceptId) {
    var acc = {};
    var out = [];
    _seqDocs(docs, exceptId).forEach(function(d) {
      var name = _s(d.name);
      keyTokens(name).forEach(function(t) {
        if (!acc[t]) {
          acc[t] = { id: t, label: t, docs: [], count: 0 };
          out.push(acc[t]);
        }
        acc[t].count++;
        if (acc[t].docs.indexOf(name) < 0) acc[t].docs.push(name);
      });
    });
    out.forEach(function(r) {
      r.label = r.id + ' (' + r.docs.join(' / ') + ')';
    });
    out.sort(function(a, b) { return b.count - a.count || a.id.localeCompare(b.id); });
    return out;
  }

  // 既定の起点。今のユースケース図のタイトル・ファイル名と語が重なるものを選ぶ。
  // 重ならなければ、図の枚数がいちばん多い部品 — GPIO の作業中なら GPIO の
  // シーケンス図が並んでいるのが普通なので、選び直しが要らないことが多い。
  function defaultSubject(docs, exceptId, hintName) {
    var list = subjects(docs, exceptId);
    if (!list.length) return '';
    var hint = keyTokens(hintName);
    for (var i = 0; i < list.length; i++) {
      if (hint.indexOf(list[i].id) >= 0) return list[i].id;
    }
    return list[0].id;
  }

  // この図で「自分」にあたる参加者。名前の語が起点と重なるもの。
  function _selfOf(parts, subjKeys) {
    for (var i = 0; i < parts.length; i++) {
      var e = parts[i];
      if (_shareToken(keyTokens(e.id), subjKeys) || _shareToken(keyTokens(e.label), subjKeys)) return e;
    }
    return null;
  }

  // メッセージのラベルをユースケース名にする。PlantUML の装飾と autonumber、
  // 返り値の代入 (`ret = read()`) を落とす。引数の中身は題材ごとに違って
  // ユースケース名にならないので `()` に畳む。
  function usecaseLabel(raw) {
    var t = _s(raw).trim();
    t = t.replace(/^\d+[.):]?\s+/, '');            // autonumber の番号
    t = t.replace(/^""(.*)""$/, '$1').trim();
    t = t.replace(/^<[^>]+>(.*)<\/[^>]+>$/, '$1').trim(); // <b>…</b> などの装飾
    t = t.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, '');  // 返り値の代入
    t = t.replace(/\(([^)]*)\)/g, '()');
    return t.trim();
  }

  function _isPseudo(n) {
    var t = _s(n).trim();
    return !t || t === '[' || t === ']' || t === '[*]';
  }

  // 起点の部品のシーケンス図から、アクター候補とユースケース候補を集める。
  // 戻りは生の集計 (図に既にある分の除外は candidates() が行う)。
  function collect(docs, exceptId, subject) {
    var subjKeys = keyTokens(subject);
    var actorAcc = {};
    var ucAcc = {};
    var actorOut = [];
    var ucOut = [];

    _seqDocs(docs, exceptId).forEach(function(d) {
      var name = _s(d.name);
      var p = _parseSeq(_dslOf(d));
      var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
      if (!subjKeys.length) return;
      var self = _selfOf(parts, subjKeys);
      // 自分が見つからず、図の名前も部品と重ならないなら別部品の図。
      if (!self && !_shareToken(keyTokens(name), subjKeys)) return;

      var labelOf = {};
      parts.forEach(function(e) { labelOf[e.id] = e.label || e.id; });
      var ptypeOf = {};
      parts.forEach(function(e) { ptypeOf[e.id] = e.ptype || 'participant'; });

      // 部品にメッセージを送っている参加者。ユースケース図のアクターは
      // 本来これ — 使われる側 (部品) を使う人・仕組みのこと。
      var callers = {};
      p.relations.forEach(function(r) {
        if (self && r.to === self.id && !_isPseudo(r.from)) callers[r.from] = true;
      });

      function addActor(id) {
        if (_isPseudo(id)) return;
        if (self && id === self.id) return;
        var nm = labelOf[id] || id;
        if (_shareToken(keyTokens(nm), subjKeys)) return; // 部品自身の別名
        var k = normName(nm);
        if (!k) return;
        if (!actorAcc[k]) {
          actorAcc[k] = {
            key: 'actor:' + nm, kind: 'actor', name: nm,
            docs: [], calls: false, declared: false, count: 0,
          };
          actorOut.push(actorAcc[k]);
        }
        var row = actorAcc[k];
        row.count++;
        if (row.docs.indexOf(name) < 0) row.docs.push(name);
        if (callers[id]) row.calls = true;
        if (ptypeOf[id] === 'actor') row.declared = true;
      }

      parts.forEach(function(e) { addActor(e.id); });
      // 宣言なしで関係行にだけ出る参加者も図の登場人物。
      p.relations.forEach(function(r) {
        if (!labelOf[r.from]) addActor(r.from);
        if (!labelOf[r.to]) addActor(r.to);
      });

      p.relations.forEach(function(r) {
        var lbl = usecaseLabel(r.label);
        if (!lbl) return;
        var inbound = !!self && r.to === self.id;
        var outbound = !!self && r.from === self.id;
        if (self && !inbound && !outbound) return; // 部品が関わらないやり取り
        var k = normName(lbl);
        if (!k) return;
        if (!ucAcc[k]) {
          ucAcc[k] = {
            key: 'uc:' + lbl, kind: 'usecase', name: lbl,
            docs: [], inbound: false, callers: [], count: 0,
          };
          ucOut.push(ucAcc[k]);
        }
        var row = ucAcc[k];
        row.count++;
        if (row.docs.indexOf(name) < 0) row.docs.push(name);
        if (inbound) {
          row.inbound = true;
          var cn = labelOf[r.from] || r.from;
          if (!_isPseudo(cn) && row.callers.indexOf(cn) < 0) row.callers.push(cn);
        }
      });
    });

    // アクターは「呼び出し元 → actor 宣言 → その他」。呼び出し元が
    // いちばん確かなアクターなので、迷わず上から取れる順に並べる。
    actorOut.sort(function(a, b) {
      return (b.calls - a.calls) || (b.declared - a.declared)
        || (b.count - a.count) || a.name.localeCompare(b.name);
    });
    // ユースケースは公開 API (部品宛て) が先。
    ucOut.sort(function(a, b) {
      return (b.inbound - a.inbound) || (b.count - a.count) || a.name.localeCompare(b.name);
    });
    return { actors: actorOut, usecases: ucOut };
  }

  // 今のユースケース図に既にある名前。表記ゆれを吸収した形で返す。
  function namesIn(dsl) {
    var mod = window.MA.modules && window.MA.modules.plantumlUsecase;
    var out = {};
    if (!mod || !_s(dsl).trim()) return out;
    var p = mod.parse(_s(dsl));
    (p.elements || []).forEach(function(e) {
      var k1 = normName(e.id); if (k1) out[k1] = true;
      var k2 = normName(e.label); if (k2) out[k2] = true;
    });
    (p.relations || []).forEach(function(r) {
      var k3 = normName(r.from); if (k3) out[k3] = true;
      var k4 = normName(r.to); if (k4) out[k4] = true;
    });
    return out;
  }

  // 画面に出す候補。既に図にあるものは落とす — 並べても足す先が無い。
  function candidates(dsl, docs, exceptId, subject) {
    var have = namesIn(dsl);
    var raw = collect(docs, exceptId, subject);
    var actors = raw.actors.filter(function(r) { return !have[normName(r.name)]; })
      .map(function(r) {
        return {
          key: r.key, kind: 'actor', name: r.name, docs: r.docs,
          why: r.docs.join(' / ') + ' の'
            + (r.calls ? '参加者で、この部品を呼んでいます'
                       : (r.declared ? 'actor です' : '参加者です')),
        };
      });
    var usecases = raw.usecases.filter(function(r) { return !have[normName(r.name)]; })
      .map(function(r) {
        return {
          key: r.key, kind: 'usecase', name: r.name, docs: r.docs,
          callers: r.callers.slice(),
          why: r.docs.join(' / ') + ' で'
            + (r.inbound
                ? (r.callers.length
                    ? ' ' + r.callers.join('・') + ' から呼ばれています'
                    : 'この部品が呼ばれています')
                : 'この部品が呼んでいます'),
        };
      });
    return { actors: actors, usecases: usecases };
  }

  function findRow(res, key) {
    if (!res) return null;
    var all = (res.actors || []).concat(res.usecases || []);
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return null;
  }

  // 選んだ候補を一括入力の行に直す。usecase.js の parseBulkLines がそのまま読む形。
  // 選んだアクターが選んだユースケースの呼び出し元なら関連の行も出す —
  // 要素だけ足して from/to を選び直させるなら、白紙から打つのと手数が変わらない。
  function blockFor(picks) {
    var list = picks || [];
    var actorNames = {};
    var lines = [];
    list.forEach(function(r) {
      if (r && r.kind === 'actor') {
        actorNames[normName(r.name)] = r.name;
        lines.push('actor ' + r.name);
      }
    });
    list.forEach(function(r) {
      if (r && r.kind === 'usecase') lines.push('(' + r.name + ')');
    });
    list.forEach(function(r) {
      if (!r || r.kind !== 'usecase') return;
      (r.callers || []).forEach(function(c) {
        var nm = actorNames[normName(c)];
        if (nm) lines.push(nm + ' --> (' + r.name + ')');
      });
    });
    return lines.join('\n');
  }

  function summaryText(res) {
    if (!res) return '';
    var a = (res.actors || []).length;
    var u = (res.usecases || []).length;
    if (!a && !u) return 'シーケンス図から拾える候補はありません';
    return 'シーケンス図から: アクター候補 ' + a + ' 件 / ユースケース候補 ' + u + ' 件';
  }

  return {
    subjects: subjects,
    defaultSubject: defaultSubject,
    usecaseLabel: usecaseLabel,
    collect: collect,
    namesIn: namesIn,
    candidates: candidates,
    findRow: findRow,
    blockFor: blockFor,
    summaryText: summaryText,
  };
})();
