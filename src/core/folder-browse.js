'use strict';
window.MA = window.MA || {};

// folder-browse — 保存先を選ぶ窓でフォルダを辿る (TICKET-roadmap-20261122-0855-1)。
//
// 保存先を決める・替えるには ⚙ 設定でパスを手で打つか、今の保存先の隣のフォルダから選ぶしかなかった。
// 初回は隣が無く、Git 作業木の 2 階層下のフォルダを選ぶにもパスを打つしかない。
// 窓の中で子へ・親へ・ドライブ・最近使ったフォルダを辿り、そのフォルダを保存先にする。
//
// DOM も fetch も触らない (server の /browse-dir の答えの読み方と、最近使ったフォルダの控えだけ)。
window.MA.folderBrowse = (function() {
  var RECENT_KEY = 'pua-recent-save-dirs';
  var RECENT_MAX = 5;

  function _s(v) { return v == null ? '' : String(v); }

  function norm(p) { return _s(p).split('\\').join('/').replace(/\/+$/, ''); }

  // Windows のパスは大文字小文字を区別しない。区切りの向きも問わない。
  function samePath(a, b) {
    return norm(a).toLowerCase() === norm(b).toLowerCase() && norm(a) !== '';
  }

  function browseUrl(dir) {
    return '/browse-dir?dir=' + encodeURIComponent(_s(dir));
  }

  // /browse-dir の答え → 窓に出す形。読めない答えは理由つきで ok: false。
  function view(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'フォルダを読めませんでした', path: '' };
    if (!payload.ok) return { ok: false, error: _s(payload.error) || 'フォルダを読めませんでした', path: _s(payload.path) };
    var dirs = (payload.dirs || []).filter(function(d) { return d && d.path; }).map(function(d) {
      return { name: _s(d.name), path: _s(d.path), files: typeof d.files === 'number' ? d.files : 0 };
    });
    return {
      ok: true,
      path: _s(payload.path),
      parent: _s(payload.parent),
      files: typeof payload.files === 'number' ? payload.files : 0,
      dirs: dirs,
      drives: (payload.drives || []).map(_s).filter(Boolean),
    };
  }

  // 子フォルダの行の字。図の無いフォルダも選べる (行は出す)。
  function dirLabel(d) {
    var n = d && d.files > 0 ? d.files : 0;
    return _s(d && d.name) + (n ? '  ' + n + ' 図' : '');
  }

  // 今いるフォルダの見出し (「このフォルダを保存先にする」の脇に出す)。
  function hereText(v) {
    if (!v || !v.ok) return '';
    return v.path + '  (' + (v.files > 0 ? v.files + ' 図' : '図はまだありません') + ')';
  }

  function loadRecent(storage) {
    var raw = null;
    try { raw = storage && storage.getItem(RECENT_KEY); } catch (e) { raw = null; }
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(_s).filter(Boolean).slice(0, RECENT_MAX) : [];
    } catch (e) { return []; }
  }

  // 保存先にしたフォルダを先頭に足す。同じフォルダは 1 行にまとめ、RECENT_MAX 件まで。
  function pushRecent(list, dir) {
    var d = _s(dir).trim();
    var out = (list || []).filter(function(x) { return !samePath(x, d); });
    if (d) out.unshift(d);
    return out.slice(0, RECENT_MAX);
  }

  function saveRecent(storage, list) {
    try { if (storage) storage.setItem(RECENT_KEY, JSON.stringify((list || []).slice(0, RECENT_MAX))); } catch (e) {}
  }

  function baseName(dir) {
    var s = norm(dir);
    var i = s.lastIndexOf('/');
    var b = i >= 0 ? s.slice(i + 1) : s;
    return b || _s(dir);
  }

  return {
    RECENT_KEY: RECENT_KEY,
    RECENT_MAX: RECENT_MAX,
    browseUrl: browseUrl,
    view: view,
    dirLabel: dirLabel,
    hereText: hereText,
    loadRecent: loadRecent,
    pushRecent: pushRecent,
    saveRecent: saveRecent,
    samePath: samePath,
    baseName: baseName,
  };
})();
