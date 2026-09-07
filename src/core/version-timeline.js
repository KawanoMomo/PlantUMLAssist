'use strict';
window.MA = window.MA || {};

// version-timeline — 1 つの図の中身が保存のたびにどう変わったかを積んで並べる。
//
// BLK-reviewer-20260908-0723-wish: save-diff は「前回保存した 1 点」だけを基準に
// 持つので、A → B → A のように書き換えが往復しても、単発の diff では毎回
// 「変わりました」としか出ず、往復していること自体が見えない。reviewer は
// 過去の run ディレクトリを何個も遡って手で突き合わせ、初めて気付いていた。
// ここでは保存のたびのスナップショットを図ごとに積み、
//   ・前の版から何行増えて何行減ったか
//   ・その版が「前にも同じ中身だった版」に戻っていないか (往復)
// を答える。ここは DOM に触らない純関数だけを置き、描画は app.js。
window.MA.versionTimeline = (function() {
  var KEY = 'plantuml-version-timeline';
  // 1 図あたりの上限。古いものから捨てる。往復は数版のうちに現れるので、
  // 全部を持たなくても「行って戻った」は拾える。
  var MAX_PER_FILE = 30;

  var _hist = null;   // { name: [ { dsl, at, label } ] }

  // 改行コードと行末の空白、末尾の空行は変更と見なさない (save-diff と同じ基準。
  // ここが食い違うと「差分あり」と「往復」で別の答えが出てしまう)。
  function normalize(dsl) {
    if (window.MA.saveDiff && window.MA.saveDiff.normalize) {
      return window.MA.saveDiff.normalize(dsl);
    }
    var s = String(dsl == null ? '' : dsl);
    s = s.replace(/\r\n?/g, '\n');
    s = s.replace(/[ \t]+$/gm, '');
    s = s.replace(/\n+$/, '');
    return s;
  }

  function _load() {
    if (_hist) return _hist;
    _hist = {};
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw != null) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object' && v.files && typeof v.files === 'object') {
          for (var k in v.files) {
            if (!Object.prototype.hasOwnProperty.call(v.files, k)) continue;
            var list = v.files[k];
            if (!list || typeof list.length !== 'number') continue;
            var out = [];
            for (var i = 0; i < list.length; i++) {
              var e = list[i];
              if (!e || typeof e.dsl !== 'string') continue;
              out.push({
                dsl: e.dsl,
                at: typeof e.at === 'string' ? e.at : '',
                label: typeof e.label === 'string' ? e.label : '',
              });
            }
            if (out.length) _hist[k] = out;
          }
        }
      }
    } catch (e) { /* 壊れていたら履歴なしから始める */ }
    return _hist;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ files: _load() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function _now() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  // 保存のたびに呼ぶ。中身が直前の版と同じなら積まない
  // (同じ版が並ぶと「何回保存したか」の記録になってしまい、変遷が読めない)。
  function push(name, dsl, at, label) {
    if (!name) return { added: false, entry: null };
    var h = _load();
    var list = h[name] || (h[name] = []);
    var body = normalize(dsl);
    if (list.length && list[list.length - 1].dsl === body) {
      return { added: false, entry: list[list.length - 1] };
    }
    var entry = { dsl: body, at: at || _now(), label: label || '' };
    list.push(entry);
    while (list.length > MAX_PER_FILE) list.shift();
    _persist();
    return { added: true, entry: entry };
  }

  function historyOf(name) {
    var list = _load()[name] || [];
    return list.map(function(e) { return { dsl: e.dsl, at: e.at, label: e.label }; });
  }

  // 履歴を持っている図の名前。多いものから見たいので版数の多い順、
  // 同数なら名前順にする。
  function names() {
    var h = _load();
    var out = [];
    for (var k in h) {
      if (Object.prototype.hasOwnProperty.call(h, k) && h[k].length) out.push(k);
    }
    out.sort(function(a, b) {
      var d = h[b].length - h[a].length;
      return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
    });
    return out;
  }

  // 行の増減。save-diff の changedLines と同じ数え方 (行の多重集合の差)。
  function _delta(before, after) {
    var now = after.split('\n');
    var prev = before === null ? [] : before.split('\n');
    var added = 0, removed = 0;
    var count = {};
    prev.forEach(function(l) { count[l] = (count[l] || 0) + 1; });
    now.forEach(function(l) {
      if (count[l]) count[l]--;
      else added++;
    });
    for (var k in count) {
      if (Object.prototype.hasOwnProperty.call(count, k)) removed += count[k];
    }
    return { added: added, removed: removed };
  }

  // 新しい版が先頭。各版に
  //   rev      … 1 から数えた版番号 (古い方が 1)
  //   added / removed … 1 つ前の版からの増減
  //   revisit  … 直前ではない過去の版と中身が同じ = 往復して戻ってきた版
  //   revisitOf … 戻り先の版番号
  // を付ける。revisit がこの BLK の眼目で、単発 diff では見えない「行って戻った」
  // をここで名指しする。
  function rows(name) {
    var list = _load()[name] || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var d = _delta(i === 0 ? null : list[i - 1].dsl, list[i].dsl);
      var revisitOf = 0;
      for (var j = 0; j < i - 1; j++) {
        if (list[j].dsl === list[i].dsl) { revisitOf = j + 1; break; }
      }
      out.push({
        rev: i + 1,
        at: list[i].at,
        label: list[i].label,
        lines: list[i].dsl === '' ? 0 : list[i].dsl.split('\n').length,
        added: d.added,
        removed: d.removed,
        first: i === 0,
        revisit: revisitOf > 0,
        revisitOf: revisitOf,
        dsl: list[i].dsl,
      });
    }
    return out.reverse();
  }

  function revisitCount(name) {
    return rows(name).filter(function(r) { return r.revisit; }).length;
  }

  // 一覧の見出し 1 行。往復があればそれを先に言う (見逃してほしくないため)。
  function summaryLine(name) {
    var list = _load()[name] || [];
    if (!list.length) return 'この図の履歴はまだありません';
    var rv = revisitCount(name);
    var head = list.length + ' 版';
    if (rv > 0) return head + ' · 往復 ' + rv + ' 回 — 前に戻った版があります';
    return head + ' · 往復なし';
  }

  // 2 つの版の間で増えた行・減った行。行を並べて見せるため。
  function diffLines(name, revA, revB) {
    var list = _load()[name] || [];
    var a = list[revA - 1], b = list[revB - 1];
    if (!a || !b) return { added: [], removed: [] };
    var beforeCount = {};
    a.dsl.split('\n').forEach(function(l) { beforeCount[l] = (beforeCount[l] || 0) + 1; });
    var added = [];
    b.dsl.split('\n').forEach(function(l) {
      if (beforeCount[l]) beforeCount[l]--;
      else added.push(l);
    });
    var afterCount = {};
    b.dsl.split('\n').forEach(function(l) { afterCount[l] = (afterCount[l] || 0) + 1; });
    var removed = [];
    a.dsl.split('\n').forEach(function(l) {
      if (afterCount[l]) afterCount[l]--;
      else removed.push(l);
    });
    return { added: added, removed: removed };
  }

  function forget(name) {
    var h = _load();
    if (!Object.prototype.hasOwnProperty.call(h, name)) return false;
    delete h[name];
    _persist();
    return true;
  }

  function reset() {
    _hist = {};
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  }

  return {
    MAX_PER_FILE: MAX_PER_FILE,
    normalize: normalize,
    push: push,
    historyOf: historyOf,
    names: names,
    rows: rows,
    revisitCount: revisitCount,
    summaryLine: summaryLine,
    diffLines: diffLines,
    forget: forget,
    reset: reset,
  };
})();
