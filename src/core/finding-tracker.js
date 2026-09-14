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

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  function emptyState() {
    return { version: VERSION, seq: 0, ticks: [], findings: {} };
  }

  function readState(v) {
    if (!v || typeof v !== 'object') return emptyState();
    if (v.version !== VERSION) return emptyState();
    return {
      version: VERSION,
      seq: typeof v.seq === 'number' ? v.seq : 0,
      ticks: Array.isArray(v.ticks) ? v.ticks.slice() : [],
      findings: (v.findings && typeof v.findings === 'object') ? v.findings : {},
    };
  }

  // F-01, F-02, ... 連番。控えが消えない限り同じ指摘は同じ id のまま。
  function makeId(n) {
    var s = String(n);
    while (s.length < 2) s = '0' + s;
    return 'F-' + s;
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
          entity: it.entity, title: it.title, cats: [], docs: [], excluded: true,
        };
        out.push(cur);
      }
      if (cur.cats.indexOf(it.category) < 0) cur.cats.push(it.category);
      (it.docs || []).forEach(function(d) { if (cur.docs.indexOf(d) < 0) cur.docs.push(d); });
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

    var seen = {};
    items.forEach(function(it) {
      seen[it.entity] = true;
      var f = st.findings[it.entity];
      if (!f) {
        st.seq += 1;
        f = st.findings[it.entity] = {
          id: makeId(st.seq), entity: it.entity, title: it.title,
          since: label, sinceIndex: idx, marks: [], verdict: null,
          cats: [], docs: [],
        };
      }
      f.title = it.title || f.title;
      f.cats = it.cats.slice();
      f.excluded = !!it.excluded;
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

    return st;
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
        id: f.id, entity: f.entity, title: f.title,
        state: state2, label: STATE[state2],
        since: f.since, sinceIndex: f.sinceIndex,
        lastSeen: st.ticks[f.lastIndex] ? st.ticks[f.lastIndex].label : f.since,
        present: present, streak: streak, seen: seen,
        open: state2 !== 'resolved' && state2 !== 'wontfix' && state2 !== 'excluded',
        excluded: !!f.excluded,
        cats: (f.cats || []).slice(), docs: (f.docs || []).slice(),
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
      if (_s(f.id).toUpperCase() === want || k === _s(id)) key = k;
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

  function rowText(r) {
    var s = r.id + ' [' + statusText(r) + '] ' + r.title;
    s += '｜初出 ' + r.since;
    if (r.cats.length) s += '｜' + r.cats.join('+');
    if (r.docs.length) s += '｜' + r.docs.join(', ');
    if (r.note) s += '｜' + r.note;
    return s;
  }

  function counts(list) {
    var c = { total: list.length, fresh: 0, carried: 0, regressed: 0, partial: 0, resolved: 0, wontfix: 0, excluded: 0, open: 0 };
    list.forEach(function(r) {
      c[r.state] = (c[r.state] || 0) + 1;
      if (r.open) c.open++;
    });
    return c;
  }

  function summaryText(list) {
    var c = counts(list);
    return '指摘 ' + c.total + ' 件 / 未解消 ' + c.open + ' 件（新規 ' + c.fresh + ' / 継続 ' + c.carried
      + ' / 部分解消 ' + c.partial + ' / 再発 ' + c.regressed + '）/ 解消 ' + c.resolved
      + ' 件 / 除外 ' + c.excluded + ' 件';
  }

  // 指摘.md にそのまま貼れる表。全文の書き直しではなく、この表を貼り替える。
  function markdown(state, title) {
    var st = readState(state);
    var list = rows(st);
    var lines = ['# ' + (title || '指摘トラッカー'), '', summaryText(list), ''];
    if (!st.ticks.length) {
      lines.push('記録がありません（監査を 1 回記録すると台帳が立ち上がります）');
      return lines.join('\n');
    }
    lines.push('記録した tick: ' + st.ticks.map(function(t) { return t.label; }).join(' → '));
    lines.push('');
    lines.push('| id | 状態 | 初出 | 対象 | 分類 | 備考 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    list.forEach(function(r) {
      lines.push('| ' + r.id + ' | ' + statusText(r) + ' | ' + r.since + ' | '
        + (r.docs.join(', ') || '—') + ' | ' + (r.cats.join('+') || '—') + ' | '
        + (r.note || '') + ' |');
    });
    lines.push('');
    lines.push('出欠（' + st.ticks.map(function(t) { return t.label; }).join(' / ') + '）');
    list.forEach(function(r) { lines.push('- ' + r.spark + ' ' + r.id + ' ' + r.title); });
    return lines.join('\n');
  }

  var api = {
    VERSION: VERSION, VERDICT: VERDICT, STATE: STATE,
    emptyState: emptyState, readState: readState, makeId: makeId,
    itemsOf: itemsOf, update: update, rows: rows, setVerdict: setVerdict,
    statusText: statusText, rowText: rowText, counts: counts,
    summaryText: summaryText, markdown: markdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.findingTracker = api;
  }
})();
