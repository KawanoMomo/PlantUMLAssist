'use strict';
window.MA = window.MA || {};

// vault — 提出物庫。「画像を書き出した = その周を 1 つ完走した」瞬間の DSL を、
// ファイル名と無関係な刻印で積んだものを読む。
//
// BLK-junior-20260908-2203-wish: 保存は「図の名前 = ファイル名」なので、次の周が
// diagram1 という同じ名前で始まれば前の周の完走物は上書きで消える。_versions の
// 控えは残るが、そこに積まれるのは「上書きされた中身」であって「完走した提出物」
// ではなく、20 版の中のどれが提出物かは中身を開くまで分からない。区切りの瞬間を
// 記録していないことが根っこなので、書き出しの瞬間に庫へロックして積む。
//
// 図種は題名の言い回しではなく DSL の構造から決める (versionHistory.kindOf に
// 任せる。図種の語彙を二重に持たない)。題名を「(資料用)」と変えても、
// diagram1 のまま保存していても、状態遷移図は状態遷移図として棚卸しに立つ。
// 部品名は componentPack.baseOf — 一覧の棚卸しと同じ切り方でないと突き合わない。
// fetch と DOM には触らない (通信は app.js)。
window.MA.vault = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  function _cp() { return window.MA.componentPack; }
  function _vh() { return window.MA.versionHistory; }

  // 宣言が始まる最初の行。@startuml・title・コメントは図種を言わない。
  function headLine(dsl) {
    var lines = _s(dsl).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) continue;
      if (/^(@|'|!|title\b|header\b|footer\b|skinparam\b|hide\b|scale\b|caption\b)/i.test(t)) continue;
      return t;
    }
    return '';
  }

  // DSL の構造から図種を決める。決まらなければ題名 / ファイル名の語に落とす。
  // 棚卸しの図種名 (componentPack と同じ「〜図」) で返す。
  function kindOf(dsl, title, name) {
    var vh = _vh();
    var short = vh ? vh.kindOf(headLine(dsl)) : '';
    if (short) return short + '図';
    var cp = _cp();
    if (!cp) return '';
    return cp.kindOf(_s(title)) || cp.kindOf(_s(name)) || '';
  }

  // 部品名。題名を先に見る (ファイル名は diagram1 のままのことがある)。
  function subjectOf(title, name) {
    var cp = _cp();
    if (!cp) return '';
    var t = _s(title);
    var byTitle = t ? (cp.baseOf(t) || '') : '';
    if (byTitle) return byTitle;
    var n = _s(name);
    return n ? (cp.baseOf(n) || '') : '';
  }

  // 庫に積む 1 件ぶんの見出し。app.js はこれに dsl と dir を足して POST する。
  function entryFor(doc) {
    var d = doc || {};
    var title = _s(d.title);
    var name = _s(d.name);
    return {
      name: name,
      title: title,
      subject: subjectOf(title, name),
      kind: kindOf(_s(d.dsl), title, name),
      format: _s(d.format),
    };
  }

  // ISO8601 (UTC) → 読み手の時計で「MM/DD HH:MM」。読めなければ刻印をそのまま。
  function label(at, stamp) {
    var d = new Date(_s(at));
    if (isNaN(d.getTime())) {
      var vh = _vh();
      return vh ? vh.label(stamp) : _s(stamp);
    }
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // server の /vault の答え → 画面に出す行。新しい順。
  function rows(payload) {
    var list = (payload && payload.entries) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      out.push({
        stamp: _s(e.stamp),
        at: _s(e.at),
        label: label(e.at, e.stamp),
        subject: _s(e.subject),
        kind: _s(e.kind),
        title: _s(e.title),
        name: _s(e.name),
        format: _s(e.format),
        lines: typeof e.lines === 'number' ? e.lines : null,
      });
    }
    out.sort(function(a, b) { return a.stamp < b.stamp ? 1 : (a.stamp > b.stamp ? -1 : 0); });
    return out;
  }

  // 庫にある部品の一覧。件数の多い順ではなく名前順 — 棚卸しは名前で探す。
  function subjects(list) {
    var acc = {};
    var order = [];
    (list || []).forEach(function(r) {
      var s = r.subject || '(部品名なし)';
      if (!acc[s]) { acc[s] = { subject: s, count: 0, kinds: [] }; order.push(s); }
      acc[s].count++;
      if (r.kind && acc[s].kinds.indexOf(r.kind) < 0) acc[s].kinds.push(r.kind);
    });
    order.sort();
    return order.map(function(s) { return acc[s]; });
  }

  // subject (と kind) で絞る。どちらも空なら全部。
  function filter(list, subject, kind) {
    var s = _s(subject);
    var k = _s(kind);
    return (list || []).filter(function(r) {
      if (s && (r.subject || '(部品名なし)') !== s) return false;
      if (k && r.kind !== k) return false;
      return true;
    });
  }

  // 「GPIO × 状態遷移図 × 前回分」を 1 件で取る。back=0 が最新、1 が 1 つ前。
  // 手順 1 がこれ 1 回で終わるための入口なので、無ければ null を返して
  // 「庫にも無い」と言い切れるようにする。
  function pick(list, subject, kind, back) {
    var hits = filter(list, subject, kind);
    var n = back == null ? 0 : Math.max(0, back);
    return hits[n] || null;
  }

  // 部品の図種ごとの有無。componentInventory の行に「庫にあるか」を重ねるための形。
  // → { 図種: [row, ...] }
  function byKind(list, subject) {
    var acc = {};
    filter(list, subject, '').forEach(function(r) {
      var k = r.kind || '(図種不明)';
      if (!acc[k]) acc[k] = [];
      acc[k].push(r);
    });
    return acc;
  }

  // 見出し 1 行。「庫に何が積まれているか」がここだけで分かる。
  function summaryText(list, subject) {
    var all = list || [];
    if (!all.length) return '提出物庫は空です。画像を書き出すと、その時点の図が積まれます';
    if (!subject) {
      return all.length + ' 件 / ' + subjects(all).length + ' 部品';
    }
    var hits = filter(all, subject, '');
    if (!hits.length) return subject + ' の提出物はまだありません';
    var kinds = Object.keys(byKind(hits, subject));
    return subject + ': ' + hits.length + ' 件 / ' + kinds.length + ' 図種（最新 ' + hits[0].label + '）';
  }

  return {
    headLine: headLine,
    kindOf: kindOf,
    subjectOf: subjectOf,
    entryFor: entryFor,
    label: label,
    rows: rows,
    subjects: subjects,
    filter: filter,
    pick: pick,
    byKind: byKind,
    summaryText: summaryText,
  };
})();
