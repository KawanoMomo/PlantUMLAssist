'use strict';
window.MA = window.MA || {};
// review-watch — 保存フォルダの図が「前回見た版」から変わったかを憶えておく。
//
// BLK-reviewer-20260907-1403: レビューは今まで、変更が無い日でも 17 枚を全部読み込んで
// name-audit / method-audit / consistency / render を回して、初めて「今回は変更なし」と
// 言えていた。どれが変わったかは自分でファイルを控えて diff を取るしかなかった。
//
// ここには「前回見た版」の控え (図名 → 指紋) の出し入れと突き合わせだけを置く (DOM に触らない)。
// 指紋は server.py が返す本文の sha1。時刻ではなく中身で見るので、
// 保存し直しただけで中身が同じ図は「変更なし」のままになる。
window.MA.reviewWatch = (function() {
  var KEY_PREFIX = 'pua.review.seen:';

  // 控えは保存フォルダごとに分ける (別のフォルダを見ても前のフォルダの控えは消えない)。
  function storageKey(fileDir) {
    return KEY_PREFIX + String(fileDir == null || fileDir === '' ? './autosave' : fileDir);
  }

  function _entryList(entries) {
    if (!entries || typeof entries.length !== 'number') return [];
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e) continue;
      if (typeof e === 'string') { out.push({ name: e, hash: null, mtime: null }); continue; }
      if (typeof e.name !== 'string' || !e.name) continue;
      out.push({
        name: e.name,
        hash: typeof e.hash === 'string' && e.hash ? e.hash : null,
        mtime: typeof e.mtime === 'string' && e.mtime ? e.mtime : null,
      });
    }
    return out;
  }

  // 今の一覧を「見た版」の控えの形にする。
  function snapshot(entries) {
    var out = {};
    _entryList(entries).forEach(function(e) { out[e.name] = e.hash; });
    return out;
  }

  // 控えと今の一覧を突き合わせる。返すのは一覧と同じ並びの
  // {name, status, hash, mtime}。status は new / changed / unchanged。
  //
  // 指紋が取れなかった図 (読めない・古い server) は unchanged と言い切れないので
  // changed 側に倒す。見落とすより読み直す方が安全。
  function diff(seen, entries) {
    var prev = seen && typeof seen === 'object' ? seen : {};
    return _entryList(entries).map(function(e) {
      var status;
      if (!Object.prototype.hasOwnProperty.call(prev, e.name)) status = 'new';
      else if (e.hash && prev[e.name] === e.hash) status = 'unchanged';
      else status = 'changed';
      return { name: e.name, status: status, hash: e.hash, mtime: e.mtime };
    });
  }

  // 控えにあったのに今は無い図 (先輩が消したもの)。読む対象ではないが黙って消えると困る。
  function removed(seen, entries) {
    var now = {};
    _entryList(entries).forEach(function(e) { now[e.name] = true; });
    return Object.keys(seen && typeof seen === 'object' ? seen : {})
      .filter(function(n) { return !now[n]; })
      .sort();
  }

  var BADGE = {
    'new': { mark: '＋', label: '新規', title: '前回見たときには無かった図です' },
    changed: { mark: '●', label: '変更', title: '前回見た版から中身が変わっています' },
    unchanged: { mark: '', label: '', title: '前回見た版から変わっていません' },
  };

  function badge(status) {
    return BADGE[status] || BADGE.unchanged;
  }

  // 「バッジが変化した図だけ読む」ための一言。0 件なら読むものが無いと言い切る。
  function summary(rows) {
    var list = rows || [];
    var n = 0, c = 0;
    list.forEach(function(r) {
      if (!r) return;
      if (r.status === 'new') n++;
      else if (r.status === 'changed') c++;
    });
    if (!list.length) return '保存フォルダに図がありません';
    if (!n && !c) return list.length + ' 枚すべて前回見た版のままです';
    var parts = [];
    if (c) parts.push('変更 ' + c + ' 枚');
    if (n) parts.push('新規 ' + n + ' 枚');
    return parts.join(' / ') + '（残り ' + (list.length - n - c) + ' 枚は変更なし）';
  }

  // 読むべき図だけを名前で返す (機械監査を回す対象)。
  function toReview(rows) {
    return (rows || [])
      .filter(function(r) { return r && (r.status === 'new' || r.status === 'changed'); })
      .map(function(r) { return r.name; });
  }

  // 最終保存時刻の見せ方。ISO8601(UTC) を地元時刻の「MM/DD HH:MM」にする。
  function formatMtime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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
      if (typeof obj[k] === 'string' || obj[k] === null) out[k] = obj[k];
    });
    return out;
  }

  function save(storage, fileDir, seen) {
    if (!storage || !storage.setItem) return false;
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(seen || {}));
      return true;
    } catch (e) { return false; }
  }

  // 控えが一度も無いとき (初回) は全部 new になる。それは正しい。
  function hasSeen(storage, fileDir) {
    if (!storage || !storage.getItem) return false;
    try { return !!storage.getItem(storageKey(fileDir)); } catch (e) { return false; }
  }

  return {
    storageKey: storageKey,
    snapshot: snapshot,
    diff: diff,
    removed: removed,
    badge: badge,
    summary: summary,
    toReview: toReview,
    formatMtime: formatMtime,
    load: load,
    save: save,
    hasSeen: hasSeen,
  };
})();
