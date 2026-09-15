'use strict';
window.MA = window.MA || {};

// change-stamp — 前回控えから 1 バイトも変わっていない図に「変化なし」の印を出す。
//
// BLK-reviewer-20260916-0426-wish: review-watch は変わった図に ＋ / ● を付けるが、
// 変わっていない図には何も付けない。印が無い状態は「変わっていない」と
// 「まだ確かめていない (控えが無い・指紋が取れない)」の両方を意味するので、
// reviewer は毎 tick `audit.js --since-files` をフルスキャンで打ち直して
// 「前回から変化なし」を確かめ直していた。図が増えるほどその時間が延びる。
//
// ここが出すのは「言い切れるときだけ出す印」。指紋が今の控えと一致している図にだけ
// 印を付け、何回連続で変わっていないか (runs) と、いつの控えからか (since) を添える。
// 印が付いた図は前回の指摘をそのまま転記でき、付いていない図だけを読めばよくなる。
//
// DOM にも fetch にも触らない (描画と結線は app.js)。
window.MA.changeStamp = (function() {
  var KEY_PREFIX = 'pua.review.stamp:';

  // 控えは保存フォルダごと。review-watch / review-carry と同じ区切り方にする。
  function storageKey(fileDir) {
    return KEY_PREFIX + String(fileDir == null || fileDir === '' ? './autosave' : fileDir);
  }

  function _s(v) { return v == null ? '' : String(v); }

  function _rec(v) {
    if (!v || typeof v !== 'object') return null;
    var hash = typeof v.hash === 'string' && v.hash ? v.hash : null;
    if (!hash) return null;
    var runs = typeof v.runs === 'number' && isFinite(v.runs) && v.runs > 0 ? Math.floor(v.runs) : 1;
    return { hash: hash, runs: runs, since: _s(v.since) };
  }

  // 「ここまで見たことにする」で控えを取り直したときに呼ぶ。
  // unchanged だった図は連続回数を 1 つ増やし、最初にその中身になった時刻 (since) を保つ。
  // 変わった図・新しい図はそこで数え直す (runs = 1、since = 今)。
  // 指紋が取れない図は数えない — 「変わっていない」と言い切れないものに印を出さない。
  function advance(prev, rows, at) {
    var old = prev && typeof prev === 'object' ? prev : {};
    var now = _s(at);
    var out = {};
    (rows || []).forEach(function(r) {
      if (!r || typeof r.name !== 'string' || !r.name) return;
      var hash = typeof r.hash === 'string' && r.hash ? r.hash : null;
      if (!hash) return;
      var was = _rec(old[r.name]);
      if (r.status === 'unchanged' && was && was.hash === hash) {
        out[r.name] = { hash: hash, runs: was.runs + 1, since: was.since || now };
      } else {
        out[r.name] = { hash: hash, runs: 1, since: now };
      }
    });
    return out;
  }

  // 何回連続で変わっていないか。控えの指紋が今の指紋と食い違っていれば数えない。
  function runsOf(store, name, hash) {
    var was = _rec((store && typeof store === 'object' ? store : {})[name]);
    if (!was) return 0;
    if (hash && was.hash !== hash) return 0;
    return was.runs;
  }

  var MARK = '＝';
  var TEXT = '変化なし';

  // 行に出す印。unchanged 以外には出さない (印を全行に配ると印でなくなる)。
  // 控えを一度も取っていない図 (runs 0) にも出さない — その図について
  // 言えるのは「今回の控えと同じ」までで、「前回から変化なし」ではない。
  function stamp(store, row, formatTime) {
    if (!row || row.status !== 'unchanged') return null;
    var hash = typeof row.hash === 'string' && row.hash ? row.hash : null;
    if (!hash) return null;
    var runs = runsOf(store, row.name, hash);
    if (runs < 1) return null;
    var was = _rec((store && typeof store === 'object' ? store : {})[row.name]);
    var since = was ? was.since : '';
    var shownSince = typeof formatTime === 'function' ? _s(formatTime(since)) : since;
    var title = '前回控え'
      + (shownSince ? '（' + shownSince + '）' : '')
      + 'から 1 バイトも変わっていません'
      + (runs > 1 ? '（' + runs + ' 回連続）' : '')
      + '。前回の指摘をそのまま転記できます';
    // 行は名前・SVG の印・時刻が並んで既に詰まっているので、行に置くのは
    // 「＝」と連続回数だけ (short)。言葉は説明 (title) と一覧の頭の要約に出す。
    return {
      mark: MARK,
      short: runs > 1 ? MARK + runs : MARK,
      text: runs > 1 ? TEXT + ' ×' + runs : TEXT,
      label: TEXT,
      runs: runs,
      since: since,
      title: title,
    };
  }

  // 印の付く図の名前 (前回の指摘をそのまま転記してよい図)。
  function stampedNames(store, rows) {
    return (rows || []).filter(function(r) { return !!stamp(store, r); })
      .map(function(r) { return r.name; });
  }

  // 一覧の頭に置く 1 行。読む枚数が「印の付いていない図」であることを言う。
  function summary(store, rows) {
    var list = rows || [];
    if (!list.length) return '';
    var n = stampedNames(store, list).length;
    if (!n) return '変化なしの図はありません（' + list.length + ' 枚とも読み直しが要ります）';
    return '変化なし ' + n + ' 枚（前回の指摘を転記可）/ 読むのは ' + (list.length - n) + ' 枚';
  }

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
      var r = _rec(obj[k]);
      if (r) out[k] = r;
    });
    return out;
  }

  function save(storage, fileDir, store) {
    if (!storage || !storage.setItem) return false;
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(store || {}));
      return true;
    } catch (e) { return false; }
  }

  return {
    storageKey: storageKey,
    advance: advance,
    runsOf: runsOf,
    stamp: stamp,
    stampedNames: stampedNames,
    summary: summary,
    load: load,
    save: save,
  };
})();
