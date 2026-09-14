'use strict';
window.MA = window.MA || {};

// save-diff — 「前回保存した時点」からの変更の有無を図ごとに持つ。
//
// BLK-reviewer-20260907-0803: レビューのたびに全図を tmp/ の控えと diff して
// 変わっていないことを確かめていた。保存した時点の DSL を基準 (baseline) として
// 覚えておけば、今の中身と比べるだけで「変更あり/なし」が出る。
// レビューは変更ありの図だけを読めばよく、書いた側も保存時に自分の変更有無を
// その場で確認できる。ここは DOM に触らない純関数だけを置き、描画は app.js。
window.MA.saveDiff = (function() {
  var KEY = 'plantuml-save-baseline';

  var _marks = null;   // { name: { dsl, at } }

  // 改行コードと行末の空白、末尾の空行は差分と見なさない。
  // エディタや保存経路で混ざるだけで、図の中身は変わっていないため。
  function normalize(dsl) {
    var s = String(dsl == null ? '' : dsl);
    s = s.replace(/\r\n?/g, '\n');
    s = s.replace(/[ \t]+$/gm, '');
    s = s.replace(/\n+$/, '');
    return s;
  }

  function _load() {
    if (_marks) return _marks;
    _marks = {};
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw != null) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object' && v.marks && typeof v.marks === 'object') {
          for (var k in v.marks) {
            if (!Object.prototype.hasOwnProperty.call(v.marks, k)) continue;
            var m = v.marks[k];
            if (!m || typeof m.dsl !== 'string') continue;
            _marks[k] = { dsl: m.dsl, at: typeof m.at === 'string' ? m.at : '' };
          }
        }
      }
    } catch (e) { /* 壊れていたら基準なしから始める */ }
    return _marks;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ marks: _load() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function _now() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  // この図の今の中身を「基準」にする。保存が成功したときに呼ぶ。
  function mark(name, dsl, at) {
    if (!name) return null;
    var m = _load();
    m[name] = { dsl: normalize(dsl), at: at || _now() };
    _persist();
    return { dsl: m[name].dsl, at: m[name].at };
  }

  // 開いている図をまとめて基準にする ([今を基準にする] ボタン)。
  function markAll(docs, at) {
    var stamp = at || _now();
    var names = [];
    (docs || []).forEach(function(d) {
      if (!d || !d.name) return;
      mark(d.name, d.dsl, stamp);
      names.push(d.name);
    });
    return names;
  }

  function forget(name) {
    var m = _load();
    if (!Object.prototype.hasOwnProperty.call(m, name)) return false;
    delete m[name];
    _persist();
    return true;
  }

  function baselineOf(name) {
    var m = _load()[name];
    return m ? { dsl: m.dsl, at: m.at } : null;
  }

  function markedAt(name) {
    var b = baselineOf(name);
    return b ? b.at : '';
  }

  // 'new'     … 基準がまだ無い (保存していない新しい図)
  // 'changed' … 基準と中身が違う
  // 'same'    … 基準と同じ
  function statusOf(name, dsl) {
    var b = baselineOf(name);
    if (!b) return 'new';
    return normalize(dsl) === b.dsl ? 'same' : 'changed';
  }

  function isDirty(name, dsl) {
    return statusOf(name, dsl) !== 'same';
  }

  // この図にまだ基準が無いときだけ、渡した本文を基準にする
  // (BLK-primary-20260914-1206)。⇄ 一括置換・🔖 [適用] は保存フォルダへ直接書くので、
  // 書いた後の本文を基準にすると「変更なし」になり、直した前後が出せなくなる。
  // 書き込む **前** の本文を基準に置けば、その操作がそのまま差分として読める。
  // 既に基準があるときは動かさない (前回保存時点という意味を壊さない)。
  function markIfAbsent(name, dsl, at) {
    if (!name) return null;
    var b = baselineOf(name);
    if (b) return b;
    return mark(name, dsl, at);
  }

  // 変わった行だけを拾う。パネルに「どこが変わったか」を 1 行で出すため。
  // 基準を外から渡す形 (countBetween) と、この図の基準を使う形 (changedLines) の 2 つを出す。
  // 保存フォルダへ直接書いた回の控え (write-history) と比べるときは前者を使う。
  function countBetween(beforeDsl, dsl) {
    var now = normalize(dsl).split('\n');
    var bs = beforeDsl == null ? '' : normalize(beforeDsl);
    var before = bs === '' ? [] : bs.split('\n');   // 基準が無いときは全行が追加
    var added = 0, removed = 0;
    var beforeCount = {};
    before.forEach(function(l) { beforeCount[l] = (beforeCount[l] || 0) + 1; });
    now.forEach(function(l) {
      if (beforeCount[l]) beforeCount[l]--;
      else added++;
    });
    for (var k in beforeCount) {
      if (Object.prototype.hasOwnProperty.call(beforeCount, k)) removed += beforeCount[k];
    }
    return { added: added, removed: removed };
  }

  function changedLines(name, dsl) {
    var b = baselineOf(name);
    return countBetween(b ? b.dsl : '', dsl);
  }

  // BLK-primary-20260909-0303-wish: 会議で「この図、変わった?」に答えるには件数では足りず、
  // どの行が消えてどの行が入ったかを見せる必要がある。基準と今の本文を行単位で並べる。
  // 変わっていない行は前後 ctx 行だけ残す (全文を出すと変更点が埋もれる)。
  function diffBetween(beforeDsl, dsl, ctx) {
    var now = normalize(dsl).split('\n');
    var bs = beforeDsl == null ? '' : normalize(beforeDsl);
    var before = bs === '' ? [] : bs.split('\n');   // 基準が無いときは全行が追加
    var keep = (ctx == null) ? 1 : Math.max(0, ctx);

    // 共通部分列 (LCS) の長さ表。図 1 枚の行数なので素直に組む。
    var n = before.length, m = now.length;
    var lcs = [];
    for (var i = 0; i <= n; i++) lcs.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        lcs[i][j] = before[i] === now[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    var all = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (before[i] === now[j]) { all.push({ mark: ' ', text: before[i] }); i++; j++; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { all.push({ mark: '-', text: before[i] }); i++; }
      else { all.push({ mark: '+', text: now[j] }); j++; }
    }
    while (i < n) { all.push({ mark: '-', text: before[i] }); i++; }
    while (j < m) { all.push({ mark: '+', text: now[j] }); j++; }

    // 変更が 1 行も無ければ空にする (「変わっていない」を件数 0 で言い切れる)。
    var changed = all.some(function(r) { return r.mark !== ' '; });
    if (!changed) return [];

    // 変更行の前後 keep 行だけを残す。落とした区間は 1 行にまとめる。
    var near = all.map(function() { return false; });
    all.forEach(function(r, k) {
      if (r.mark === ' ') return;
      for (var t = k - keep; t <= k + keep; t++) if (t >= 0 && t < all.length) near[t] = true;
    });
    var out = [];
    var skipped = 0;
    all.forEach(function(r, k) {
      if (near[k]) {
        if (skipped) { out.push({ mark: '…', text: '変更なし ' + skipped + ' 行' }); skipped = 0; }
        out.push(r);
      } else skipped++;
    });
    if (skipped) out.push({ mark: '…', text: '変更なし ' + skipped + ' 行' });
    return out;
  }

  function diffLines(name, dsl, ctx) {
    var b = baselineOf(name);
    return diffBetween(b ? b.dsl : '', dsl, ctx);
  }

  // 開いている全図の内訳。reviewer はこれ 1 つで読む要否を判断する。
  function summary(docs) {
    var out = { total: 0, changed: [], added: [], same: [], changedCount: 0, hasChange: false, markedAt: '' };
    var latest = '';
    (docs || []).forEach(function(d) {
      if (!d || !d.name) return;
      out.total++;
      var st = statusOf(d.name, d.dsl);
      if (st === 'new') out.added.push(d.name);
      else if (st === 'changed') out.changed.push(d.name);
      else out.same.push(d.name);
      var at = markedAt(d.name);
      if (at && at > latest) latest = at;
    });
    out.changedCount = out.changed.length + out.added.length;
    out.hasChange = out.changedCount > 0;
    out.markedAt = latest;
    return out;
  }

  // バッジの文字。基準が 1 つも無いうちは件数を出しても意味がないので分ける。
  function badgeText(sum) {
    if (!sum || !sum.total) return '± 差分 −';
    if (sum.same.length === 0 && sum.changed.length === 0 && sum.added.length === sum.total) {
      return '± 基準なし';
    }
    if (!sum.hasChange) return '± 変更なし';
    return '± 変更 ' + sum.changedCount + '/' + sum.total;
  }

  function reset() {
    _marks = {};
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  }

  return {
    normalize: normalize,
    mark: mark,
    markAll: markAll,
    markIfAbsent: markIfAbsent,
    countBetween: countBetween,
    diffBetween: diffBetween,
    forget: forget,
    baselineOf: baselineOf,
    markedAt: markedAt,
    statusOf: statusOf,
    isDirty: isDirty,
    changedLines: changedLines,
    diffLines: diffLines,
    summary: summary,
    badgeText: badgeText,
    reset: reset,
  };
})();
