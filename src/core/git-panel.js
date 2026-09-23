'use strict';
window.MA = window.MA || {};

// git-panel — FILES ツリー下端の GIT 欄と「比較する相手を選ぶ」の判断 (design 10c)。
//
// BLK-human-20260923-1702: 保存先が Git リポジトリのとき、ブランチ・変更・コミットと
// 「この図の履歴」をツリーの下端に出し、過去のコミットを並べて比較の相手に選べるようにする。
// 相手の枠は読むだけのフォルダを比べるときと同じ #senior-pane (操作を覚え直させない)。
//
// DOM も通信も触らない。server.py の /git-status・/git-log・/git-refs の返り値を
// 画面の文字と並びに直すだけ。
window.MA.gitPanel = (function() {

  function _s(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function _n(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  // Git の欄を出すか。git が無い・作業木でない保存先では節ごと出さない
  // (空の節を見せると「何かが壊れている」と読まれる)。
  function visible(status) {
    return !!(status && status.repo === true && _s(status.branch));
  }

  // 見出し行 `⎇ main ↑1 ↓0`。畳んだままでも読める。
  function headLabel(status) {
    if (!visible(status)) return '';
    return '⎇ ' + _s(status.branch) + ' ↑' + _n(status.ahead) + ' ↓' + _n(status.behind);
  }

  // 畳んだ見出しの右端 (file-tree.gitCountLabel と同じ形 `main · M 2 ↑1`)。
  function countSource(status) {
    if (!visible(status)) return {};
    return { branch: _s(status.branch), modified: (status.changes || []).length, ahead: _n(status.ahead) };
  }

  // 変更の一覧。M / A / D の順に揃え、同じ印の中は名前順。
  var ORDER = { M: 0, A: 1, D: 2 };
  function changes(status) {
    var list = (status && Array.isArray(status.changes)) ? status.changes.slice() : [];
    return list.map(function(c) {
      var code = ORDER.hasOwnProperty(_s(c.code)) ? _s(c.code) : 'M';
      return { code: code, file: _s(c.file || c.path), name: _s(c.name) };
    }).sort(function(a, b) {
      if (ORDER[a.code] !== ORDER[b.code]) return ORDER[a.code] - ORDER[b.code];
      return a.file < b.file ? -1 : (a.file > b.file ? 1 : 0);
    });
  }

  function changesLabel(status) {
    return '変更 ' + changes(status).length;
  }

  // ツリーのファイル名の右に出す M / A / D (未保存 ● とは別)。キーは拡張子を外した図の名前。
  function _stem(name) { return _s(name).replace(/\.puml$/i, ''); }

  function marksByName(status) {
    var out = {};
    changes(status).forEach(function(c) {
      var key = c.name || (c.file.indexOf('/') < 0 ? _stem(c.file) : '');
      if (key) out[key] = c.code;
    });
    return out;
  }

  function markOf(marks, name) {
    return (marks && marks[_stem(name)]) || '';
  }

  // コミットしてよいか。変更が無い・メッセージが空なら押せない (押して失敗させない)。
  function canCommit(status, message) {
    return visible(status) && changes(status).length > 0 && _s(message).trim().length > 0;
  }

  // 日付は `09-23 06:30` の形 (年は同じ画面では要らない)。
  function shortDate(iso) {
    var m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(_s(iso));
    return m ? (m[1] + '-' + m[2] + ' ' + m[3] + ':' + m[4]) : '';
  }

  // コミット 1 行の副題 `a3f91c2 · junior · 09-23 06:30 · HEAD`。タグがあれば添える。
  function commitMeta(c) {
    if (!c) return '';
    var parts = [_s(c.short || _s(c.hash).slice(0, 7))];
    if (_s(c.author)) parts.push(_s(c.author));
    var d = shortDate(c.date);
    if (d) parts.push(d);
    if (c.head) parts.push('HEAD');
    (c.tags || []).forEach(function(t) { parts.push(_s(t)); });
    return parts.join(' · ');
  }

  function commitStat(c) {
    if (!c) return '';
    var a = _n(c.added), r = _n(c.removed);
    return '+' + a + (r ? ' −' + r : ' −0');
  }

  // 絞り込み: メッセージ・作成者・ハッシュ・タグ。大小を問わない。
  function filterCommits(commits, query) {
    var q = _s(query).trim().toLowerCase();
    var list = Array.isArray(commits) ? commits : [];
    if (!q) return list.slice();
    return list.filter(function(c) {
      var hay = [c.message, c.author, c.hash, c.short].concat(c.tags || [])
        .map(function(x) { return _s(x).toLowerCase(); }).join('\n');
      return hay.indexOf(q) >= 0;
    });
  }

  function indexOf(commits, hash) {
    var h = _s(hash);
    if (!h) return -1;
    for (var i = 0; i < (commits || []).length; i++) {
      var c = commits[i];
      if (_s(c.hash) === h || _s(c.short) === h) return i;
    }
    return -1;
  }

  // ◀ は 1 つ古いコミット、▶ は 1 つ新しいコミット (履歴は新しい順に並ぶ)。
  // 端では動かない (null)。
  function step(commits, hash, dir) {
    var i = indexOf(commits, hash);
    if (i < 0) return null;
    var j = dir < 0 ? i + 1 : i - 1;
    if (j < 0 || j >= commits.length) return null;
    return commits[j];
  }

  // 右の枠の見出し `a3f91c2 · Fault 通知の応答を追記`。
  function paneTitle(c) {
    if (!c) return '';
    return _s(c.short || _s(c.hash).slice(0, 7)) + ' · ' + _s(c.message);
  }

  // 「左: 作業中 右: a3f91c2」。
  function sidesLabel(c) {
    return '左: 作業中 右: ' + (c ? _s(c.short || _s(c.hash).slice(0, 7)) : '—');
  }

  // 「比較する相手を選ぶ」のタブ。読むだけのフォルダは今までの相手 (別のフォルダの図)。
  var PICK_TABS = [
    { id: 'commits', label: 'コミット' },
    { id: 'refs', label: 'ブランチ / タグ' },
    { id: 'folder', label: '読むだけのフォルダ' },
  ];
  function pickTabs() { return PICK_TABS.map(function(t) { return { id: t.id, label: t.label }; }); }

  // ブランチ・タグを 1 本の並びに (相手として選べる形 {name, short, kind})。
  function refRows(refs, query) {
    var q = _s(query).trim().toLowerCase();
    var out = [];
    ((refs && refs.branches) || []).forEach(function(b) {
      out.push({ kind: 'branch', name: _s(b.name), short: _s(b.short), current: !!b.current });
    });
    ((refs && refs.tags) || []).forEach(function(t) {
      out.push({ kind: 'tag', name: _s(t.name), short: _s(t.short), current: false });
    });
    if (!q) return out;
    return out.filter(function(r) {
      return (r.name + '\n' + r.short).toLowerCase().indexOf(q) >= 0;
    });
  }

  // 扱う範囲の注記 (マージと衝突は外部のツール)。
  var SCOPE_NOTE = 'コミット・取得・送信・ブランチ切替まで。マージと衝突の解消は外部の Git ツールで行ってください。'
    + '取得・送信は押したときだけ通信します (認証は OS の git の設定)。';

  function emptyHistoryText(hasActive) {
    return hasActive ? 'この図に関係するコミットはまだありません' : '図を開くと、その図のコミットが並びます';
  }

  return {
    visible: visible,
    headLabel: headLabel,
    countSource: countSource,
    changes: changes,
    changesLabel: changesLabel,
    marksByName: marksByName,
    markOf: markOf,
    canCommit: canCommit,
    shortDate: shortDate,
    commitMeta: commitMeta,
    commitStat: commitStat,
    filterCommits: filterCommits,
    indexOf: indexOf,
    step: step,
    paneTitle: paneTitle,
    sidesLabel: sidesLabel,
    pickTabs: pickTabs,
    refRows: refRows,
    SCOPE_NOTE: SCOPE_NOTE,
    emptyHistoryText: emptyHistoryText,
  };
})();
