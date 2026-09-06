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

  // 変わった行だけを拾う。パネルに「どこが変わったか」を 1 行で出すため。
  function changedLines(name, dsl) {
    var b = baselineOf(name);
    var now = normalize(dsl).split('\n');
    var before = b ? b.dsl.split('\n') : [];
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
    forget: forget,
    baselineOf: baselineOf,
    markedAt: markedAt,
    statusOf: statusOf,
    isDirty: isDirty,
    changedLines: changedLines,
    summary: summary,
    badgeText: badgeText,
    reset: reset,
  };
})();
