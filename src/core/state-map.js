'use strict';
window.MA = window.MA || {};

// state-map — 2 枚の状態遷移図の「対応表」を作る (BLK-junior-20260908-0823-wish)。
//
// 同じ GPIO ドライバの状態遷移でも、書いた人が違えば状態名・イベント名・抽象度が
// ばらばらになる。目で読み比べて「先輩が後から足した 1 要素」を当てる作業は、
// 名前が揃っていないと成立しない。そこで名前の一致だけを機械的に取り、
// 対応が付いた組・付かなかった片側だけの要素を分けて出す。
//
// 対応の強さは 3 段。判断は名前の形だけで、意味は見ない。
//   exact   — 正規化して完全一致 (Idle と idle、Wait_Ready と wait ready)
//   partial — 片方がもう片方を含む、語を共有する、または 1〜2 文字違い
//   (無し)  — どちらか片方にしか無い。ここが「足された要素」の候補になる
//
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.stateMap = (function() {

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 正規化。大小・記号・空白の違いは「別の名前」ではないので消す。
  // 日本語はそのまま残す (漢字かなの違いは意味の違いとして扱う)。
  function normalize(name) {
    return _s(name).toLowerCase().replace(/[\s_\-.]+/g, '');
  }

  // 語に割る。CamelCase・snake_case・空白のどれで書かれていても同じ語列にする。
  function words(name) {
    var s = _s(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return s.split(/[\s_\-.]+/)
      .map(function(w) { return w.toLowerCase(); })
      .filter(function(w) { return w !== ''; });
  }

  // 編集距離。1〜2 文字違い (打ち間違い・単複) を部分一致に拾うためだけに使う。
  function editDistance(a, b) {
    var s = _s(a), t = _s(b);
    if (s === t) return 0;
    if (s === '' || t === '') return Math.max(s.length, t.length);
    var prev = [], cur = [], i, j;
    for (j = 0; j <= t.length; j++) prev[j] = j;
    for (i = 1; i <= s.length; i++) {
      cur[0] = i;
      for (j = 1; j <= t.length; j++) {
        var cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (j = 0; j <= t.length; j++) prev[j] = cur[j];
    }
    return prev[t.length];
  }

  // 2 つの名前の近さ。0 は無関係、1 は完全一致。
  // 対応表は「どれとどれを結ぶか」を決められればよいので、点数は順序付けにだけ使う。
  function score(a, b) {
    var na = normalize(a), nb = normalize(b);
    if (na === '' || nb === '') return 0;
    if (na === nb) return 1;

    var wa = words(a), wb = words(b);
    var shared = wa.filter(function(w) { return wb.indexOf(w) >= 0; });
    if (shared.length > 0) {
      // 共有した語の長さが両方に占める割合。Wait_Ready と Ready は 0.5 前後。
      var len = shared.join('').length;
      return 0.4 + 0.4 * ((len / na.length) + (len / nb.length)) / 2;
    }
    if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) {
      return 0.4 + 0.3 * (Math.min(na.length, nb.length) / Math.max(na.length, nb.length));
    }
    var d = editDistance(na, nb);
    var maxLen = Math.max(na.length, nb.length);
    // 短い名前で 2 文字違うのは別物 (on と off)。長さに応じて許す差を変える。
    var allowed = maxLen <= 4 ? 1 : 2;
    if (d <= allowed) return 0.4 + 0.2 * (1 - d / maxLen);
    return 0;
  }

  function kindOf(sc) {
    if (sc >= 1) return 'exact';
    if (sc >= 0.4) return 'partial';
    return 'none';
  }

  // 貪欲な組み合わせ。点数の高い組から順に確定し、片側が既に使われていれば飛ばす。
  // 総当たりで最適解を取ることもできるが、対応表は人が見て直すものなので、
  // 「なぜこの組になったか」を説明できる単純な規則の方が使える。
  function _pair(left, right, keyOf) {
    var cands = [];
    left.forEach(function(l, li) {
      right.forEach(function(r, ri) {
        var sc = score(keyOf(l), keyOf(r));
        if (sc > 0) cands.push({ li: li, ri: ri, score: sc });
      });
    });
    cands.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.li !== b.li) return a.li - b.li;
      return a.ri - b.ri;
    });
    var usedL = {}, usedR = {}, pairs = [];
    cands.forEach(function(c) {
      if (usedL[c.li] || usedR[c.ri]) return;
      usedL[c.li] = true;
      usedR[c.ri] = true;
      pairs.push(c);
    });
    return { pairs: pairs, usedL: usedL, usedR: usedR };
  }

  // 状態の表示名。id しか無い状態は id を名前として扱う。
  function stateName(st) {
    if (!st) return '';
    return _s(st.label) || _s(st.id);
  }

  function _states(parsed) {
    return ((parsed && parsed.states) || []).filter(function(st) {
      return st && _s(st.id) !== '' && _s(st.id) !== '[*]';
    });
  }

  // 状態の対応表。ref が参照図 (先輩)、mine が編集中の図。
  // 行は [対応が付いた組] → [参照図だけ] → [自分の図だけ] の順。
  // 「片方だけ」を下にまとめるのは、そこが選ぶ対象だから。
  function mapStates(refParsed, mineParsed) {
    var refs = _states(refParsed);
    var mines = _states(mineParsed);
    var res = _pair(refs, mines, stateName);
    var rows = [];

    res.pairs.forEach(function(p) {
      var r = refs[p.li], m = mines[p.ri];
      rows.push({
        type: 'state',
        match: kindOf(p.score),
        score: p.score,
        ref: stateName(r), refId: r.id, refLine: r.line,
        mine: stateName(m), mineId: m.id, mineLine: m.line,
      });
    });
    rows.sort(function(a, b) { return b.score - a.score; });

    refs.forEach(function(r, i) {
      if (res.usedL[i]) return;
      rows.push({
        type: 'state', match: 'ref-only', score: 0,
        ref: stateName(r), refId: r.id, refLine: r.line,
        mine: '', mineId: null, mineLine: null,
      });
    });
    mines.forEach(function(m, i) {
      if (res.usedR[i]) return;
      rows.push({
        type: 'state', match: 'mine-only', score: 0,
        ref: '', refId: null, refLine: null,
        mine: stateName(m), mineId: m.id, mineLine: m.line,
      });
    });
    return rows;
  }

  // 遷移の表示名。「From -(きっかけ)-> To」。状態は表示名に直す。
  function transitionName(tr, parsed) {
    if (!tr) return '';
    var from = _s(tr.from) === '[*]' ? '[*]' : _labelOf(tr.from, parsed);
    var to = _s(tr.to) === '[*]' ? '[*]' : _labelOf(tr.to, parsed);
    var trig = _s(tr.trigger);
    return from + ' -' + (trig ? '(' + trig + ')' : '') + '-> ' + to;
  }

  function _labelOf(id, parsed) {
    var list = _states(parsed);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === _s(id)) return stateName(list[i]);
    }
    return _s(id);
  }

  // 遷移の行に、参照図側の端点をそのまま持たせる。表示名だけだと
  // 「この遷移を自分の図にも足す」ときに、どの状態から出す遷移なのかを
  // 名前から逆に引き直すことになり、同名の状態が 2 つあると当てられない。
  function _withRefEnds(row, tr, refParsed) {
    row.refFrom = _s(tr.from);
    row.refTo = _s(tr.to);
    row.refFromName = row.refFrom === '[*]' ? '[*]' : _labelOf(tr.from, refParsed);
    row.refToName = row.refTo === '[*]' ? '[*]' : _labelOf(tr.to, refParsed);
    row.refTrigger = _s(tr.trigger);
    row.refGuard = _s(tr.guard);
    row.refAction = _s(tr.action);
    return row;
  }

  // 遷移の対応表。状態の対応が付いていれば、それを踏まえて端点を読み替えてから
  // 名前を突き合わせる。状態名が違うだけで遷移まで「片方だけ」に落ちるのを防ぐ。
  function mapTransitions(refParsed, mineParsed, stateRows) {
    var refs = ((refParsed && refParsed.transitions) || []).slice();
    var mines = ((mineParsed && mineParsed.transitions) || []).slice();

    // 参照図の状態 id → 自分の図の状態 id
    var alias = {};
    (stateRows || []).forEach(function(row) {
      if (row.refId && row.mineId) alias[row.refId] = row.mineId;
    });

    function refKey(tr) {
      var from = alias[_s(tr.from)] || _s(tr.from);
      var to = alias[_s(tr.to)] || _s(tr.to);
      return from + ' ' + _s(tr.trigger) + ' ' + to;
    }
    function mineKey(tr) {
      return _s(tr.from) + ' ' + _s(tr.trigger) + ' ' + _s(tr.to);
    }

    var cands = [];
    refs.forEach(function(r, li) {
      mines.forEach(function(m, ri) {
        var sc = score(refKey(r), mineKey(m));
        if (sc > 0) cands.push({ li: li, ri: ri, score: sc });
      });
    });
    cands.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.li !== b.li) return a.li - b.li;
      return a.ri - b.ri;
    });
    var usedL = {}, usedR = {}, rows = [];
    cands.forEach(function(c) {
      if (usedL[c.li] || usedR[c.ri]) return;
      usedL[c.li] = true; usedR[c.ri] = true;
      var r = refs[c.li], m = mines[c.ri];
      rows.push(_withRefEnds({
        type: 'transition', match: kindOf(c.score), score: c.score,
        ref: transitionName(r, refParsed), refId: r.id, refLine: r.line,
        mine: transitionName(m, mineParsed), mineId: m.id, mineLine: m.line,
      }, r, refParsed));
    });
    rows.sort(function(a, b) { return b.score - a.score; });

    refs.forEach(function(r, i) {
      if (usedL[i]) return;
      rows.push(_withRefEnds({
        type: 'transition', match: 'ref-only', score: 0,
        ref: transitionName(r, refParsed), refId: r.id, refLine: r.line,
        mine: '', mineId: null, mineLine: null,
      }, r, refParsed));
    });
    mines.forEach(function(m, i) {
      if (usedR[i]) return;
      rows.push({
        type: 'transition', match: 'mine-only', score: 0,
        ref: '', refId: null, refLine: null,
        mine: transitionName(m, mineParsed), mineId: m.id, mineLine: m.line,
      });
    });
    return rows;
  }

  // 対応表 1 回分。状態と遷移をこの順で作る (遷移は状態の対応に依存する)。
  function build(refParsed, mineParsed) {
    var states = mapStates(refParsed, mineParsed);
    var transitions = mapTransitions(refParsed, mineParsed, states);
    return { states: states, transitions: transitions };
  }

  // ── 参照図だけの行を自分の図にも足す (BLK-junior-20260908-1103-wish) ──
  //
  // 対応表は「先輩にしかない要素」を見つけるところまでしかやらず、足すのは
  // 一括入力欄に自分で書き直す作業だった。名前も抽象度も違う 2 枚を読み比べて
  // 打ち直すのは、対応表を作る前と同じ手間がそのまま残っている。
  //
  // ここは「橙の行 1 つ」から、自分の図の末尾に足す DSL を組み立てる。
  // 状態はそのまま足せる。遷移は端点が要るので、対応表で対応の付いた状態は
  // 自分の側の id に読み替え、対応が付かない端点だけを「どの状態から出すか」
  // として聞き返す (聞くのは付かなかった端点だけ。付いた端点は聞かない)。

  var NEW_STATE = '__new__';

  function _bare(id) {
    var s = _s(id);
    return s.indexOf('.') >= 0 ? s.split('.').pop() : s;
  }

  // 参照図の状態 id → 自分の図の状態 id。対応が付いた組だけ。
  function aliasMap(map) {
    var alias = {};
    ((map && map.states) || []).forEach(function(row) {
      if (row.refId && row.mineId) alias[row.refId] = row.mineId;
    });
    return alias;
  }

  // 端点に選べる自分の状態。開始・終了 (`[*]`) も端点なので混ぜる。
  function mineOptions(mineParsed) {
    var opts = [{ value: '[*]', label: '[*] (開始・終了)' }];
    _states(mineParsed).forEach(function(st) {
      opts.push({ value: st.id, label: stateName(st) });
    });
    return opts;
  }

  // 新しく作る状態の id。自分の図と、この 1 回で作る分にぶつからないものを返す。
  function _newState(name, mineParsed, taken) {
    var stateMod = window.MA.modules && window.MA.modules.plantumlState;
    var extra = (taken || []).map(function(id) { return { id: id, label: id }; });
    var parsed = { states: _states(mineParsed).concat(extra) };
    var norm = stateMod
      ? stateMod.normalizeIdInput(name, parsed)
      : { id: _bare(name), label: name };
    var id = norm.id, label = norm.label;
    var used = {};
    parsed.states.forEach(function(st) { used[_bare(st.id)] = true; });
    var base = id, n = 2;
    while (used[id]) { id = base + '_' + n; n++; }
    return { id: id, label: label };
  }

  function _endpoint(side, refId, refName, alias, mineParsed, taken) {
    var end = { side: side, name: refName || refId, resolved: null };
    if (_s(refId) === '[*]') {
      end.resolved = '[*]';
      return end;
    }
    if (alias[_s(refId)]) {
      end.resolved = alias[_s(refId)];
      return end;
    }
    // 対応表で組にならなくても、同じ名前の状態が自分の図にあればそれを使う
    // (対応表は 1 対 1 で組むので、同名が 2 つあると片方が余る)。
    var same = null;
    _states(mineParsed).forEach(function(st) {
      if (same === null && normalize(stateName(st)) === normalize(refName)) same = st.id;
    });
    if (same) { end.resolved = same; return end; }
    var made = _newState(refName || refId, mineParsed, taken);
    end.newId = made.id;
    end.newLabel = made.label;
    end.options = mineOptions(mineParsed);
    return end;
  }

  // 1 行を足す計画。ready なら押すだけで足せる。ready でなければ needs に
  // 「どの状態にするか」を聞く端点が入る。
  function adoptPlan(row, map, mineParsed) {
    if (!row || row.match !== 'ref-only') {
      return { adoptable: false, reason: '参照図だけの行しか足せません' };
    }
    if (row.type === 'state') {
      var made = _newState(row.ref, mineParsed, []);
      return {
        adoptable: true, kind: 'state', ready: true, needs: [],
        state: made,
        describe: '状態「' + (made.label || made.id) + '」を足します',
      };
    }
    var alias = aliasMap(map);
    var taken = [];
    var from = _endpoint('from', row.refFrom, row.refFromName, alias, mineParsed, taken);
    if (from.newId) taken.push(from.newId);
    var to = _endpoint('to', row.refTo, row.refToName, alias, mineParsed, taken);
    if (to.newId) taken.push(to.newId);
    var needs = [from, to].filter(function(e) { return e.resolved === null; });
    return {
      adoptable: true, kind: 'transition', ready: needs.length === 0, needs: needs,
      from: from, to: to,
      trigger: row.refTrigger || '', guard: row.refGuard || '', action: row.refAction || '',
      describe: '遷移「' + row.ref + '」を足します',
    };
  }

  // 端点 1 つを id に決める。picks が無ければ、対応が付いた側はその id、
  // 付かない側は新しく作る。picks に自分の状態が選ばれていればそれを使う。
  function _pickEnd(end, pick) {
    if (end.resolved !== null) return { id: end.resolved, create: null };
    if (pick && pick !== NEW_STATE) return { id: pick, create: null };
    return { id: end.newId, create: { id: end.newId, label: end.newLabel } };
  }

  // 末尾に 1 行足し、その行番号 (1 始まり) を返す。
  function _append(text, line) {
    var out = window.MA.dslUpdater.insertBeforeEnd(text, line);
    var lines = out.split('\n');
    for (var i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === line) return { text: out, line: i + 1 };
    }
    return { text: out, line: lines.length };
  }

  // 計画を自分の DSL に書き込む。戻り値の line は「足した本体の行」。
  // 端点を新しく作った場合はその state 行も先に足す (足りない状態だけ)。
  function applyAdopt(text, row, map, mineParsed, picks) {
    var stateMod = window.MA.modules && window.MA.modules.plantumlState;
    if (!stateMod || !window.MA.dslUpdater) return null;
    var plan = adoptPlan(row, map, mineParsed);
    if (!plan.adoptable) return null;
    var out = _s(text), res, added = [];

    if (plan.kind === 'state') {
      res = _append(out, stateMod.fmtState(plan.state.id, plan.state.label));
      added.push(plan.state.label || plan.state.id);
      return { text: res.text, line: res.line, added: added, plan: plan };
    }

    var p = picks || {};
    var from = _pickEnd(plan.from, p.from);
    var to = _pickEnd(plan.to, p.to);
    [from, to].forEach(function(e) {
      if (!e.create) return;
      res = _append(out, stateMod.fmtState(e.create.id, e.create.label));
      out = res.text;
      added.push(e.create.label || e.create.id);
    });
    res = _append(out, stateMod.fmtTransition(from.id, to.id, plan.trigger, plan.guard, plan.action));
    added.push(from.id + ' --> ' + to.id);
    return { text: res.text, line: res.line, added: added, plan: plan };
  }

  function _count(rows, match) {
    return (rows || []).filter(function(r) { return r.match === match; }).length;
  }

  // 見出し。人が最初に知りたいのは「片方にしか無いものが何件あるか」なので、
  // それを先に出す。0 件なら「対応が全部付いた」と言い切る。
  function summary(map) {
    var rows = ((map && map.states) || []).concat((map && map.transitions) || []);
    if (rows.length === 0) return '状態遷移が読めません';
    var refOnly = _count(rows, 'ref-only');
    var mineOnly = _count(rows, 'mine-only');
    var exact = _count(rows, 'exact');
    var partial = _count(rows, 'partial');
    if (refOnly === 0 && mineOnly === 0) {
      return '片方だけ 0 件 (一致 ' + exact + ' / 部分一致 ' + partial + ')';
    }
    return '参照図だけ ' + refOnly + ' / 自分だけ ' + mineOnly
      + ' (一致 ' + exact + ' / 部分一致 ' + partial + ')';
  }

  // 抽象度が違いすぎて対応が取れない状態を、行き詰まる前に言う。
  // 対応が付いた組が状態の半分に満たなければ、名前で突き合わせても意味がない。
  function abstractionWarning(map) {
    var states = (map && map.states) || [];
    if (states.length === 0) return '';
    var paired = _count(states, 'exact') + _count(states, 'partial');
    if (paired * 2 >= states.length) return '';
    return '状態名の対応が ' + paired + '/' + states.length
      + ' しか付きません。抽象度が違う図どうしの可能性があります';
  }

  var MATCH_LABEL = {
    'exact': '一致',
    'partial': '部分一致',
    'ref-only': '参照図だけ',
    'mine-only': '自分だけ',
  };

  function matchLabel(match) { return MATCH_LABEL[match] || String(match || ''); }

  return {
    normalize: normalize,
    words: words,
    editDistance: editDistance,
    score: score,
    stateName: stateName,
    transitionName: transitionName,
    mapStates: mapStates,
    mapTransitions: mapTransitions,
    build: build,
    summary: summary,
    abstractionWarning: abstractionWarning,
    matchLabel: matchLabel,
    NEW_STATE: NEW_STATE,
    aliasMap: aliasMap,
    mineOptions: mineOptions,
    adoptPlan: adoptPlan,
    applyAdopt: applyAdopt,
    sectionTitles: { states: '状態 (参照図 / 自分の図)', transitions: '遷移 (参照図 / 自分の図)' },
    emptyMessage: '状態遷移が読めません。どちらも状態遷移図にしてください。',
  };
})();
