'use strict';
window.MA = window.MA || {};

// review-diff — 「前回見た版」の DSL 本文を控え、今の本文と行単位で突き合わせて
// 左右に並べる行を作る。
//
// BLK-reviewer-20260907-1803-wish: review-watch は「変わったか」までは出せるが、
// 控えているのが指紋 (sha1) だけなので「どこが変わったか」は出せず、結局
// 自作の diff スクリプトで旧版と見比べていた。本文そのものを控えれば、
// 変更図を開かずに旧DSL/新DSL を並べて読める。
//
// DOM には触らない。描画は app.js。
window.MA.reviewDiff = (function() {
  var KEY_PREFIX = 'pua.review.body:';

  // 控えは保存フォルダごと。review-watch の指紋と同じ区切り方にする。
  function storageKey(fileDir) {
    return KEY_PREFIX + String(fileDir == null || fileDir === '' ? './autosave' : fileDir);
  }

  // 改行コードと行末の空白は差分にしない (save-diff と同じ扱い)。
  function normalize(dsl) {
    var s = String(dsl == null ? '' : dsl);
    s = s.replace(/\r\n?/g, '\n');
    s = s.replace(/[ \t]+$/gm, '');
    s = s.replace(/\n+$/, '');
    return s;
  }

  function _lines(dsl) {
    var s = normalize(dsl);
    return s === '' ? [] : s.split('\n');
  }

  // 最長共通部分列。図の DSL はせいぜい数百行なので素直な DP でよい。
  // 万一大きすぎるときは全置換として返す (画面が固まる方が困る)。
  var MAX_CELLS = 4000000;

  function _lcs(a, b) {
    var n = a.length, m = b.length;
    if (n * m > MAX_CELLS) return null;
    var dp = [];
    for (var i = 0; i <= n; i++) {
      var row = new Array(m + 1);
      for (var j = 0; j <= m; j++) row[j] = 0;
      dp.push(row);
    }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1
          : (dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1]);
      }
    }
    return dp;
  }

  // 旧 → 新 の行を左右に並べる。
  // kind は same / del (旧だけ) / add (新だけ) / change (差し替わった 1 行)。
  // 番号は 1 始まり。無い側は null。
  function align(oldDsl, newDsl) {
    var a = _lines(oldDsl), b = _lines(newDsl);
    var dp = _lcs(a, b);
    var rows = [];
    if (!dp) {
      for (var k = 0; k < a.length; k++) rows.push({ kind: 'del', left: a[k], right: null, leftNo: k + 1, rightNo: null });
      for (k = 0; k < b.length; k++) rows.push({ kind: 'add', left: null, right: b[k], leftNo: null, rightNo: k + 1 });
      return _pairUp(rows);
    }
    var i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        rows.push({ kind: 'same', left: a[i], right: b[j], leftNo: i + 1, rightNo: j + 1 });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        rows.push({ kind: 'del', left: a[i], right: null, leftNo: i + 1, rightNo: null });
        i++;
      } else {
        rows.push({ kind: 'add', left: null, right: b[j], leftNo: null, rightNo: j + 1 });
        j++;
      }
    }
    while (i < a.length) { rows.push({ kind: 'del', left: a[i], right: null, leftNo: i + 1, rightNo: null }); i++; }
    while (j < b.length) { rows.push({ kind: 'add', left: null, right: b[j], leftNo: null, rightNo: j + 1 }); j++; }
    return _pairUp(rows);
  }

  // 削除の直後に来る追加は「書き換え」として同じ行に並べる。
  // 1 行の語尾を直しただけのとき、左右がずれずに読めるようにするため。
  function _pairUp(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind !== 'del') { out.push(r); continue; }
      var dels = [];
      while (i < rows.length && rows[i].kind === 'del') { dels.push(rows[i]); i++; }
      var adds = [];
      while (i < rows.length && rows[i].kind === 'add') { adds.push(rows[i]); i++; }
      i--;
      var n = Math.max(dels.length, adds.length);
      for (var k = 0; k < n; k++) {
        var d = dels[k] || null, ad = adds[k] || null;
        if (d && ad) out.push({ kind: 'change', left: d.left, right: ad.right, leftNo: d.leftNo, rightNo: ad.rightNo });
        else if (d) out.push(d);
        else out.push(ad);
      }
    }
    return out;
  }

  function stats(rows) {
    var out = { same: 0, added: 0, removed: 0, changed: 0 };
    (rows || []).forEach(function(r) {
      if (!r) return;
      if (r.kind === 'same') out.same++;
      else if (r.kind === 'add') out.added++;
      else if (r.kind === 'del') out.removed++;
      else if (r.kind === 'change') out.changed++;
    });
    return out;
  }

  function statsText(s) {
    if (!s) return '差分なし';
    if (!s.added && !s.removed && !s.changed) return '差分なし';
    var parts = [];
    if (s.changed) parts.push('書換 ' + s.changed + ' 行');
    if (s.added) parts.push('追加 ' + s.added + ' 行');
    if (s.removed) parts.push('削除 ' + s.removed + ' 行');
    return parts.join(' / ');
  }

  // 変わっていない行が延々続くと目が滑るので、変更行の前後 context 行だけ残して
  // 間を「… n 行同じ」の 1 行 (kind: 'skip') に畳む。
  function fold(rows, context) {
    var list = rows || [];
    var ctx = typeof context === 'number' && context >= 0 ? context : 2;
    var keep = [];
    var i;
    for (i = 0; i < list.length; i++) keep.push(list[i] && list[i].kind !== 'same');
    for (i = 0; i < list.length; i++) {
      if (!list[i] || list[i].kind === 'same') continue;
      for (var d = 1; d <= ctx; d++) {
        if (i - d >= 0) keep[i - d] = true;
        if (i + d < list.length) keep[i + d] = true;
      }
    }
    var out = [];
    i = 0;
    while (i < list.length) {
      if (keep[i]) { out.push(list[i]); i++; continue; }
      var n = 0;
      while (i < list.length && !keep[i]) { n++; i++; }
      out.push({ kind: 'skip', count: n, left: null, right: null, leftNo: null, rightNo: null });
    }
    return out;
  }

  // ---- 控え (図名 → 本文) の出し入れ ----

  function load(storage, fileDir) {
    if (!storage || !storage.getItem) return {};
    var raw = null;
    try { raw = storage.getItem(storageKey(fileDir)); } catch (e) { return {}; }
    if (!raw) return {};
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { return {}; }
    if (!obj || typeof obj !== 'object' || typeof obj.length === 'number') return {};
    var out = {};
    Object.keys(obj).forEach(function(k) {
      if (typeof obj[k] === 'string') out[k] = obj[k];
    });
    return out;
  }

  function save(storage, fileDir, bodies) {
    if (!storage || !storage.setItem) return false;
    var clean = {};
    var src = bodies && typeof bodies === 'object' ? bodies : {};
    Object.keys(src).forEach(function(k) {
      if (typeof src[k] === 'string') clean[k] = normalize(src[k]);
    });
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(clean));
      return true;
    } catch (e) { return false; }
  }

  function bodyOf(bodies, name) {
    var b = bodies && typeof bodies === 'object' ? bodies : {};
    return typeof b[name] === 'string' ? b[name] : null;
  }

  // 控えが無い図 (初回・新規) は「旧版なし」。左を空にして全行 add で出す。
  function compare(bodies, name, nowDsl) {
    var before = bodyOf(bodies, name);
    var rows = align(before == null ? '' : before, nowDsl);
    return { hasBefore: before != null, rows: rows, stats: stats(rows) };
  }

  return {
    storageKey: storageKey,
    normalize: normalize,
    align: align,
    stats: stats,
    statsText: statsText,
    fold: fold,
    load: load,
    save: save,
    bodyOf: bodyOf,
    compare: compare,
  };
})();
