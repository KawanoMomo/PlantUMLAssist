'use strict';

// finding-tracker — 指摘 1 件を「id を持つ 1 行」にして、tick をまたいで
// 状態 (新規 / 継続 N tick / 部分解消 / 再発 / 解消) を持ち越す控え。
//
// BLK-reviewer-20260914-2206-wish: 指摘.md は毎 tick 全文を上書きする 1 枚の
// Markdown なので、「puml 側は解消・svg の再エクスポートだけ継続」のような
// 複合の判断はその回の文面にしか残らない。次の tick で監査が同じ論点を別カテゴリ
// (svg-stale 等) で拾うと、過去の判断が失われて「再発」に見える。
//
// finding-ledger は監査スナップショットから 初出 / 解消 を数えるが、状態は
// 出た・出ないの 2 値で、人が下した「部分解消」を憶える場所が無い。ここは
//   ・指摘ごとに短い id (F-01) を振り、初出 tick と連続 tick 数を控えに持つ
//   ・人の判断 (verdict) を行に貼り付け、以後の tick はその判断を上書きしない
// の 2 つを足す。reviewer は手順7〜8 で全文を書き直す代わりに、該当行の状態を
// 1 つ更新すればよくなる。
//
// 判断を貼った行は、監査から消えても勝手に「解消」にしない。消えたのは
// カテゴリが移っただけのことがあり、そこで自動的に解消にすると次の tick で
// また出て「再発」になる — この wish が潰したい往復そのものだから。
// 解消にするのは人が `resolved` を貼ったときだけ。
//
// DOM にもファイルにも触らない。控えの読み書きは呼ぶ側 (tools/findings.js) の職掌。
(function() {
  var TL = (typeof require !== 'undefined')
    ? require('./audit-timeline')
    : (typeof window !== 'undefined' && window.MA ? window.MA.auditTimeline : null);

  var VERSION = 1;

  // 人が貼れる判断。open は「判断を剥がす」= 監査の出欠に従わせる指示。
  var VERDICT = {
    open: { label: '判断なし', pin: false },
    partial: { label: '部分解消', pin: true },
    resolved: { label: '解消', pin: true },
    wontfix: { label: '対象外', pin: true },
  };

  // 行に出る状態。pin された判断が無いときは監査の出欠から決まる。
  var STATE = {
    fresh: '新規',
    carried: '継続',
    regressed: '再発',
    partial: '部分解消',
    resolved: '解消',
    wontfix: '対象外',
    // 監査が「見ないことにした」箱へ移した指摘 (応答として除外・粒度違い等)。
    // 解消ではないので消さずに残し、既定の一覧からだけ外す。
    excluded: '除外',
  };

  // BLK-reviewer-20260915-0307-wish: 「意図して省略する」と図の側で述べてあるか。
  // 監査は述べてあるものもいないものも同じカテゴリで出すので、この区別は
  // reviewer が puml の note を人力で読んで指摘.md に手書きするしかなかった。
  // 値は omit-method が貼る印 ('tag' / 'note' / 空) とそのまま対応する。
  var INTENT_LABEL = {
    tag: '意図明記済み(タグ)',
    note: '意図明記済み(note)',
    '': '未対応',
  };

  // BLK-reviewer-20260917-0023-wish: id はこれまで全カテゴリ通しの `F-nn` だったので、
  // 指摘.md に ID を書き写していたのは「メソッド不一致 F-01〜F-06」だけで、
  // 表記揺れ・SVG・命名規約・未使用participant・章立て対応は自由文のまま残った。
  // replies.js は語の照合しかできず、primary が答えていても「判定できない」に落ちる。
  // id にカテゴリの頭文字を付け、カテゴリごとに採番すると、指摘.md の全項目が
  // 最初から ID 付きになり、返却も解消判定も ID に対して機械的に行える。
  var PREFIX = {
    'method.issues': 'F',
    'consistency.methods': 'F',
    'consistency.methodReplies': 'F',
    'name.variants': 'N',
    'name.undeclared': 'N',
    'consistency.naming': 'N',
    'consistency.unused': 'U',
    'svg.missing': 'S',
    'svg.stale': 'S',
    'svg.staleSettled': 'S',
    'trace.missing': 'T',
    'trace.outOfScope': 'T',
    'consistency.granularity': 'C',
    'consistency.events': 'C',
    'family.mismatches': 'C',
  };

  // 1 件が複数カテゴリに跨るとき、どの頭文字で呼ぶか。先に出た方を採る。
  // (メソッドは突合と整合の 2 カテゴリに同時に出るのが普通なので、F を先頭に置く)
  var PREFIX_ORDER = ['F', 'N', 'U', 'S', 'T', 'C'];
  var DEFAULT_PREFIX = 'F';

  function prefixOf(kinds) {
    var have = {};
    (kinds || []).forEach(function(k) { var p = PREFIX[k]; if (p) have[p] = true; });
    for (var i = 0; i < PREFIX_ORDER.length; i++) {
      if (have[PREFIX_ORDER[i]]) return PREFIX_ORDER[i];
    }
    return DEFAULT_PREFIX;
  }

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  function emptyState() {
    return { version: VERSION, seq: 0, ticks: [], findings: {}, origin: [] };
  }

  // BLK-reviewer-20260917-0223: 控えは persona ごとに同じ名前 (.findings-state.json) で
  // 存在するので、`--state` にどれを渡したかを人が取り違えても文法は通り、
  // 「中身が薄い」結果が黙って返る。控え自身に「どの対象を見た記録か」を持たせ、
  // 読み手が渡した対象と突き合わせられるようにする。
  function originOf(state) {
    var st = (state && typeof state === 'object') ? state : {};
    return Array.isArray(st.origin) ? st.origin.map(_s).filter(Boolean) : [];
  }

  function readState(v) {
    if (!v || typeof v !== 'object') return emptyState();
    if (v.version !== VERSION) return emptyState();
    return migrateIds({
      version: VERSION,
      seq: typeof v.seq === 'number' ? v.seq : 0,
      // カテゴリ頭文字ごとの採番。旧版の控えには無いので、読んだ時点で空から始める
      // (既に振った id は findings 側に残っているので、採番は衝突を避けて進む)。
      seqs: (v.seqs && typeof v.seqs === 'object') ? v.seqs : {},
      ticks: Array.isArray(v.ticks) ? v.ticks.slice() : [],
      findings: (v.findings && typeof v.findings === 'object') ? v.findings : {},
      // どの対象を見た控えか。古い控えには無いので空のまま (突き合わせは黙って省かれる)。
      origin: originOf(v),
    });
  }

  // BLK-reviewer-20260917-0123: 0023 より前の控えは全カテゴリが通しの F-nn なので、
  // 表記揺れ・SVG・章立て対応の既存行は新規に出直さない限り F のまま残り、
  // 指摘.md に ID を書けなかった。読んだ時点でカテゴリ (kinds) の頭文字に振り直す。
  // 旧 id は formerIds に残し、--set や本文の旧表記でも引けるようにする。
  // kinds を持たない行 (さらに古い控え) は判定できないので触らない。何度読んでも同じ結果。
  function migrateIds(st) {
    var keys = Object.keys(st.findings);
    var used = {};
    keys.forEach(function(k) { var f = st.findings[k]; if (f && f.id) used[_s(f.id).toUpperCase()] = true; });
    var num = function(id) { var m = /-(\d+)$/.exec(_s(id)); return m ? +m[1] : 0; };
    keys.filter(function(k) {
      var f = st.findings[k];
      if (!f || !f.id || !Array.isArray(f.kinds) || !f.kinds.length) return false;
      var cur = _s(f.id).charAt(0).toUpperCase();
      return cur === DEFAULT_PREFIX && prefixOf(f.kinds) !== DEFAULT_PREFIX;
    }).sort(function(a, b) { return num(st.findings[a].id) - num(st.findings[b].id); })
      .forEach(function(k) {
        var f = st.findings[k];
        var id = nextId(st, prefixOf(f.kinds), used);
        used[id] = true;
        f.formerIds = (f.formerIds || []).concat([f.id]);
        f.id = id;
      });
    return st;
  }

  // F-01, N-02, S-03, ... カテゴリの頭文字 + 連番。
  // 控えが消えない限り同じ指摘は同じ id のまま。
  function makeId(n, prefix) {
    var s = String(n);
    while (s.length < 2) s = '0' + s;
    return (prefix || DEFAULT_PREFIX) + '-' + s;
  }

  // その頭文字の次に空いている番号。旧版が振った id (全部 F-nn) とぶつからないよう、
  // 控えに既に居る id を避けて進む。
  function nextId(st, prefix, used) {
    var p = prefix || DEFAULT_PREFIX;
    var n = (typeof st.seqs[p] === 'number' ? st.seqs[p] : 0) + 1;
    while (used[makeId(n, p)]) n++;
    st.seqs[p] = n;
    return makeId(n, p);
  }

  // 監査結果 (audit.js の JSON) → 実体ごとに 1 件へ畳んだ今回の指摘。
  // 同じ実体が複数カテゴリに出ても 1 行 (カテゴリの移動を増減として数えない)。
  function itemsOf(audits) {
    var list = TL ? TL.itemsOf(audits) : [];
    var by = {};
    var out = [];
    list.forEach(function(it) {
      var cur = by[it.entity];
      if (!cur) {
        cur = by[it.entity] = {
          entity: it.entity, title: it.title, cats: [], kinds: [], docs: [], excluded: true,
          intent: '', intentReason: '', intentDoc: '',
        };
        out.push(cur);
      }
      if (cur.cats.indexOf(it.category) < 0) cur.cats.push(it.category);
      // kind は監査側の機械的なカテゴリ名。id の頭文字はこちらで決める
      // (cats は人が読む和名なので、表示の都合で変わりうる)。
      if (it.kind && cur.kinds.indexOf(it.kind) < 0) cur.kinds.push(it.kind);
      (it.docs || []).forEach(function(d) { if (cur.docs.indexOf(d) < 0) cur.docs.push(d); });
      // 意図の明記はカテゴリを跨いで 1 件に付く。タグが note より強い。
      if (it.intent && (!cur.intent || (cur.intent !== 'tag' && it.intent === 'tag'))) {
        cur.intent = it.intent;
        cur.intentReason = _s(it.intentReason);
        cur.intentDoc = _s(it.intentDoc);
      }
      // 全部が除外バケツのときだけ除外扱い。1 つでも生きていれば指摘。
      if (!it.excluded) cur.excluded = false;
    });
    return out;
  }

  // ---- tick を 1 つ進める ---------------------------------------------------

  // state に今回の監査を足す。同じ label で 2 度呼んでも tick は増えない
  // (requests.js と同じ約束。叩き直しで継続 tick 数が水増しされない)。
  // opts: { audits | items, label, at }
  function update(prev, opts) {
    var o = opts || {};
    var st = readState(prev);
    var label = _s(o.label) || _s(o.at) || new Date().toISOString();
    var items = o.items || itemsOf(o.audits);

    var idx = -1;
    for (var i = 0; i < st.ticks.length; i++) {
      if (st.ticks[i].label === label) { idx = i; break; }
    }
    var replay = idx >= 0;
    if (!replay) {
      idx = st.ticks.length;
      st.ticks.push({ label: label, at: _s(o.at) || new Date().toISOString() });
    }

    // 既に使われている id。旧版の控え (全部 F-nn) と番号がぶつからないようにする。
    var used = {};
    Object.keys(st.findings).forEach(function(k) {
      var id = st.findings[k] && st.findings[k].id;
      if (id) used[_s(id).toUpperCase()] = true;
    });

    var seen = {};
    items.forEach(function(it) {
      seen[it.entity] = true;
      var f = st.findings[it.entity];
      if (!f) {
        st.seq += 1;
        var id = nextId(st, prefixOf(it.kinds), used);
        used[id.toUpperCase()] = true;
        f = st.findings[it.entity] = {
          id: id, entity: it.entity, title: it.title,
          since: label, sinceIndex: idx, marks: [], verdict: null,
          cats: [], kinds: [], docs: [],
        };
      }
      f.title = it.title || f.title;
      f.cats = it.cats.slice();
      f.kinds = (it.kinds || []).slice();
      f.excluded = !!it.excluded;
      // 意図の明記は「今回の図にそう書いてあるか」なので、毎回上書きする
      // (note を消せば未対応に戻る。人が貼った verdict とは別物)。
      f.intent = _s(it.intent);
      f.intentReason = _s(it.intentReason);
      f.intentDoc = _s(it.intentDoc);
      it.docs.forEach(function(d) { if (f.docs.indexOf(d) < 0) f.docs.push(d); });
      f.marks[idx] = 1;
      f.lastIndex = idx;
    });

    // 今回出なかった指摘。marks に穴を空けるだけで、判断には触らない。
    Object.keys(st.findings).forEach(function(k) {
      var f = st.findings[k];
      if (!seen[k]) f.marks[idx] = 0;
      for (var j = 0; j <= idx; j++) if (!f.marks[j]) f.marks[j] = 0;
      f.marks.length = idx + 1;
    });

    // 今回どこを見たかを控えに焼き付ける (渡されたときだけ。JSON 監査からの更新など
    // 対象フォルダが決まらない回は前回の記録をそのまま残す)。
    var org = (o.origin || []).map(_s).filter(Boolean);
    if (org.length) st.origin = org;

    return st;
  }

  // 控えの記録と今回の対象が食い違っていないか。食い違っていれば
  // { ok:false, origin:[...], targets:[...] } を返す。
  // 片方が空 (古い控え / 対象なしの読み出し) なら判定できないので ok:true。
  function _key(p) { return _s(p).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase(); }

  function originCheck(state, targets) {
    var org = originOf(readState(state));
    var tgt = (targets || []).map(_s).filter(Boolean);
    if (!org.length || !tgt.length) return { ok: true, origin: org, targets: tgt };
    var have = {};
    org.forEach(function(p) { have[_key(p)] = true; });
    var hit = tgt.filter(function(p) { return have[_key(p)]; });
    return { ok: hit.length > 0, origin: org, targets: tgt };
  }

  // ---- 行 -------------------------------------------------------------------

  // 末尾から数えた連続出現数。今回出ていなければ 0。
  function _streak(marks) {
    var n = 0;
    for (var i = marks.length - 1; i >= 0; i--) {
      if (!marks[i]) break;
      n++;
    }
    return n;
  }

  // 初出のあと 1 度でも欠けたか (= 退行の材料)。
  function _hasGap(marks, sinceIndex) {
    var gap = false;
    for (var i = sinceIndex; i < marks.length; i++) if (!marks[i]) gap = true;
    return gap;
  }

  function rows(state) {
    var st = readState(state);
    var last = st.ticks.length - 1;
    var out = [];
    Object.keys(st.findings).forEach(function(k) {
      var f = st.findings[k];
      var marks = (f.marks || []).map(function(m) { return m ? 1 : 0; });
      var present = !!marks[last];
      var streak = _streak(marks);
      var seen = marks.filter(function(m) { return m; }).length;
      var v = f.verdict;
      var pinned = !!(v && VERDICT[v.state] && VERDICT[v.state].pin);

      var state2;
      if (pinned) state2 = v.state === 'partial' ? 'partial' : (v.state === 'wontfix' ? 'wontfix' : 'resolved');
      else if (!present) state2 = 'resolved';
      else if (f.excluded) state2 = 'excluded';
      else if (_hasGap(marks, f.sinceIndex)) state2 = 'regressed';
      else if (streak >= 2) state2 = 'carried';
      else state2 = 'fresh';

      out.push({
        id: f.id, formerIds: (f.formerIds || []).slice(), entity: f.entity, title: f.title,
        state: state2, label: STATE[state2],
        since: f.since, sinceIndex: f.sinceIndex,
        lastSeen: st.ticks[f.lastIndex] ? st.ticks[f.lastIndex].label : f.since,
        present: present, streak: streak, seen: seen,
        open: state2 !== 'resolved' && state2 !== 'wontfix' && state2 !== 'excluded',
        excluded: !!f.excluded,
        cats: (f.cats || []).slice(), docs: (f.docs || []).slice(),
        intent: _s(f.intent), intentLabel: INTENT_LABEL[_s(f.intent)] || INTENT_LABEL[''],
        intentReason: _s(f.intentReason), intentDoc: _s(f.intentDoc),
        declared: !!f.intent,
        verdict: v ? v.state : null,
        note: v ? _s(v.note) : '',
        verdictAt: v ? _s(v.tick) : '',
        pinned: pinned,
        marks: marks,
        spark: marks.map(function(m) { return m ? '●' : '○'; }).join(''),
      });
    });
    // 古い指摘を上に、同じ初出なら未解消を先に、あとは id 順。
    out.sort(function(a, b) {
      if (a.sinceIndex !== b.sinceIndex) return a.sinceIndex - b.sinceIndex;
      if (a.open !== b.open) return a.open ? -1 : 1;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    return out;
  }

  // ---- 判断を 1 行だけ更新する ---------------------------------------------

  // 指摘.md を書き直す代わりに呼ぶ入口。id (F-01) でも実体 id でも引ける。
  // 返すのは { ok, row, reason }。存在しない id は黙って作らない。
  function setVerdict(state, id, verdict, note, tick) {
    var st = readState(state);
    var key = null;
    var want = _s(id).toUpperCase();
    Object.keys(st.findings).forEach(function(k) {
      var f = st.findings[k];
      if (key) return;
      if (_s(f.id).toUpperCase() === want || k === _s(id)
        || (f.formerIds || []).some(function(x) { return _s(x).toUpperCase() === want; })) key = k;
    });
    if (!key) return { ok: false, reason: 'no-such-finding', state: st };
    if (!VERDICT[verdict]) return { ok: false, reason: 'no-such-verdict', state: st };
    var f = st.findings[key];
    if (verdict === 'open') f.verdict = null;
    else f.verdict = { state: verdict, note: _s(note), tick: _s(tick) || (st.ticks.length ? st.ticks[st.ticks.length - 1].label : '') };
    return { ok: true, state: st, id: f.id, entity: key };
  }

  // ---- 読む ----------------------------------------------------------------

  function statusText(r) {
    if (!r) return '';
    if (r.state === 'carried') return STATE.carried + ' ' + r.streak + ' tick 目';
    if (r.state === 'partial') return STATE.partial + (r.streak >= 2 ? '（継続 ' + r.streak + ' tick 目）' : '');
    if (r.state === 'regressed') return STATE.regressed + '（' + r.seen + ' tick 出ています）';
    if (r.state === 'resolved' && r.pinned) return STATE.resolved + '（判断）';
    return STATE[r.state] || r.state;
  }

  // 意図の札。未対応の行では何も言わない (未解消の一覧に「未対応」が並んでも
  // 情報が増えないため。仕分けは summary と表の列で読む)。
  function intentText(r) {
    if (!r || !r.intent) return '';
    var s = INTENT_LABEL[r.intent] || INTENT_LABEL[''];
    if (r.intentDoc) s += ' — ' + r.intentDoc;
    return s;
  }

  function rowText(r) {
    var s = r.id + ' [' + statusText(r) + '] ' + r.title;
    s += '｜初出 ' + r.since;
    if (r.cats.length) s += '｜' + r.cats.join('+');
    if (r.docs.length) s += '｜' + r.docs.join(', ');
    var it = intentText(r);
    if (it) s += '｜' + it;
    if (r.note) s += '｜' + r.note;
    return s;
  }

  function counts(list) {
    var c = { total: list.length, fresh: 0, carried: 0, regressed: 0, partial: 0, resolved: 0,
              wontfix: 0, excluded: 0, open: 0, declared: 0, undeclared: 0 };
    list.forEach(function(r) {
      c[r.state] = (c[r.state] || 0) + 1;
      if (r.open) c.open++;
      if (!r.open) return;
      if (r.declared) c.declared++; else c.undeclared++;
    });
    return c;
  }

  function summaryText(list) {
    var c = counts(list);
    return '指摘 ' + c.total + ' 件 / 未解消 ' + c.open + ' 件（新規 ' + c.fresh + ' / 継続 ' + c.carried
      + ' / 部分解消 ' + c.partial + ' / 再発 ' + c.regressed + '）/ 解消 ' + c.resolved
      + ' 件 / 除外 ' + c.excluded + ' 件';
  }

  // 未解消の中の仕分け。0 件のときは何も言わない (行を増やさない)。
  function intentSummaryText(list) {
    var c = counts(list);
    if (!c.declared && !c.undeclared) return '';
    return '未解消の内訳: 意図明記済み ' + c.declared + ' 件 / 未対応 ' + c.undeclared + ' 件';
  }

  // 指摘.md にそのまま貼れる表。全文の書き直しではなく、この表を貼り替える。
  function markdown(state, title) {
    var st = readState(state);
    var list = rows(st);
    var lines = ['# ' + (title || '指摘トラッカー'), '', summaryText(list)];
    var isum = intentSummaryText(list);
    if (isum) lines.push('', isum);
    lines.push('');
    if (!st.ticks.length) {
      lines.push('記録がありません（監査を 1 回記録すると台帳が立ち上がります）');
      return lines.join('\n');
    }
    lines.push('記録した tick: ' + st.ticks.map(function(t) { return t.label; }).join(' → '));
    lines.push('');
    // 「意図」の列が、reviewer が手で書いていた 対応済み / 未対応 の表そのもの。
    lines.push('| id | 状態 | 意図 | 初出 | 対象 | 分類 | 備考 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    list.forEach(function(r) {
      lines.push('| ' + r.id + ' | ' + statusText(r) + ' | '
        + (INTENT_LABEL[r.intent] || INTENT_LABEL['']) + ' | ' + r.since + ' | '
        + (r.docs.join(', ') || '—') + ' | ' + (r.cats.join('+') || '—') + ' | '
        + (r.note || '') + ' |');
    });
    var declared = list.filter(function(r) { return r.open && r.declared; });
    if (declared.length) {
      lines.push('');
      lines.push('意図明記済みの理由（図に書かれている文言）');
      declared.forEach(function(r) {
        lines.push('- ' + r.id + ' ' + r.title + ' — ' + (r.intentReason || '理由の記載なし')
          + (r.intentDoc ? '（' + r.intentDoc + '）' : ''));
      });
    }
    lines.push('');
    lines.push('出欠（' + st.ticks.map(function(t) { return t.label; }).join(' / ') + '）');
    list.forEach(function(r) { lines.push('- ' + r.spark + ' ' + r.id + ' ' + r.title); });
    return lines.join('\n');
  }

  // sections(state, opts) — 指摘.md にそのまま貼れる `## ID 見出し` の並び。
  //
  // BLK-reviewer-20260917-0023-wish: markdown() は 1 枚の表なので、指摘.md の
  // 見出し (`## `) にはならない。replies.js は `## ` 見出し 1 つを 1 項目として
  // 読むので、表を貼っただけでは全カテゴリの項目が replies の突合に乗らない。
  // ここは 1 件 = 1 節で出し、節の中に ID をバッククォートで置く
  // (replies.js が「応答を探す語」として拾う形そのもの)。
  // opts.all で解消・対象外も出す。
  function sections(state, opts) {
    var o = opts || {};
    var list = rows(state);
    // 対象外でも今回の監査に出ている行は 指摘.md に「変化なし」として書かれるので既定で出す。
    var shown = o.all ? list : list.filter(function(r) { return r.open || (r.excluded && r.present); });
    if (!shown.length) return '出ている指摘はありません。';
    var lines = [];
    shown.forEach(function(r) {
      lines.push('## ' + r.id + ' ' + r.title);
      var head = '`' + r.id + '` ' + statusText(r) + '｜初出 ' + r.since;
      if (r.formerIds && r.formerIds.length) head += '｜旧 ' + r.formerIds.join(', ');
      if (r.cats.length) head += '｜' + r.cats.join('+');
      lines.push(head);
      if (r.docs.length) lines.push('対象: ' + r.docs.join(', '));
      var it = intentText(r);
      if (it) lines.push('意図: ' + it + (r.intentReason ? ' — ' + r.intentReason : ''));
      if (r.note) lines.push('備考: ' + r.note);
      lines.push('');
    });
    return lines.join('\n').replace(/\n+$/, '');
  }

  // isJunkPath(p) — シェルの事故で出来た名前かどうか。
  //
  // BLK-reviewer-20260915-0007: 監査の対象フォルダに
  // `prev"cp -r E:01_Looppersona-dataprimary. …"` のような、コマンド文字列が
  // そのままフォルダ名になった残骸が出来ていた。中身は元フォルダの写しなので、
  // 同じ図が二重に数えられ、控えにも入って毎回「新規」で出続ける。
  // 図の名前として有り得ない字 (引用符・パイプ・`<>*?`) と、コマンドの形
  // (` -r ` / ` cp `) を持つものを事故と見なす。普通の日本語名は当たらない。
  function isJunkPath(p) {
    var s = _s(p);
    if (!s) return false;
    if (/["|<>*?\r\n\t]/.test(s)) return true;
    if (/(^|[\\/\s])(cp|mv|rm|xcopy|robocopy)\s/i.test(s)) return true;
    if (/\s-[a-z]{1,2}(\s|$)/i.test(s)) return true;
    if (/\$[A-Za-z_]/.test(s)) return true;          // `prev$f` のような展開し損ね
    return false;
  }

  // pruneBroken(state) — 事故で出来た名前の図だけを対象にしている控えを落とす。
  //
  // 控えは「同じ指摘に同じ id を持ち越す」ためにあるので、消してよいのは
  // もう指し先が無い行だけ。残骸のフォルダを読み飛ばすようにしても、既に
  // 入ってしまった行は残り続けるため、読むときに一度だけ落とす。
  // 人が付けた判断 (verdict) のある行は落とさない (判断は取り消さない)。
  function pruneBroken(state) {
    var st = readState(state);
    var keep = {};
    var dropped = [];
    Object.keys(st.findings).forEach(function(k) {
      var f = st.findings[k] || {};
      var docs = Array.isArray(f.docs) ? f.docs : [];
      var bad = docs.length > 0 && docs.every(isJunkPath);
      if (bad && !f.verdict) {
        dropped.push({ id: f.id || '', title: f.title || k, docs: docs.slice() });
        return;
      }
      if (docs.length && docs.some(isJunkPath)) {
        // 一部だけ残骸なら、行は残して指し先だけ掃除する
        // (同じ図が正しいフォルダにもあるので、id は持ち越したい)。
        f = JSON.parse(JSON.stringify(f));
        f.docs = docs.filter(function(d) { return !isJunkPath(d); });
      }
      keep[k] = f;
    });
    st.findings = keep;
    return { state: st, dropped: dropped };
  }

  var api = {
    VERSION: VERSION, VERDICT: VERDICT, STATE: STATE, INTENT_LABEL: INTENT_LABEL,
    intentText: intentText, intentSummaryText: intentSummaryText,
    PREFIX: PREFIX, PREFIX_ORDER: PREFIX_ORDER, prefixOf: prefixOf, sections: sections,
    emptyState: emptyState, readState: readState, makeId: makeId,
    isJunkPath: isJunkPath, pruneBroken: pruneBroken,
    itemsOf: itemsOf, update: update, rows: rows, setVerdict: setVerdict,
    originOf: originOf, originCheck: originCheck,
    statusText: statusText, rowText: rowText, counts: counts,
    summaryText: summaryText, markdown: markdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.findingTracker = api;
  }
})();
