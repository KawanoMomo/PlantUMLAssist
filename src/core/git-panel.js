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

  // BLK-builder-20260924-1808-1 (design 10c): 変更の行に出す名前。すぐ上のツリーの行と同じ
  // 拡張子なしの図の名前にする (「spi_transfer_sequence  M」)。保存先の下のフォルダにある図は
  // そのフォルダ名を残す (10c の「SPI/spi_init_sequence」)。
  function changeName(c) {
    if (!c) return '';
    return _stem(c.file || c.path);
  }

  // 「この図の履歴 spi_init_sequence」。どの図の履歴かを見出しで言う (件数では言わない)。
  function historyLabel(activeName) {
    var n = _stem(activeName);
    return n ? 'この図の履歴 ' + n : 'この図の履歴';
  }

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

  // コミット 1 行の副題 `a3f91c2 · junior · 09-23 06:30 · HEAD`。
  // BLK-builder-20260924-2246-1 (design 10c): タグは副題に足さず、メッセージの横の札に置く
  // (「初版 [v1.2]」。GIT 欄の「この図の履歴」の行と同じ形。札は commitTags)。
  function commitMeta(c) {
    if (!c) return '';
    var parts = [_s(c.short || _s(c.hash).slice(0, 7))];
    if (_s(c.author)) parts.push(_s(c.author));
    var d = shortDate(c.date);
    if (d) parts.push(d);
    if (c.head) parts.push('HEAD');
    return parts.join(' · ');
  }

  // メッセージの横に出す札 (タグ)。空の名前は落とす。
  function commitTags(c) {
    return (c && Array.isArray(c.tags) ? c.tags : []).map(_s).filter(function(t) { return !!t; });
  }

  // 右端の行数 `+3 −1` / `+2 −0`。図を作ったコミット (server の created: そのコミットで
  // 生まれたファイルだけ) は削る行がそもそも無いので `+12` だけ (design 10c の「初版 +12」)。
  function commitStat(c) {
    if (!c) return '';
    var a = _n(c.added), r = _n(c.removed);
    if (c.created && !r) return '+' + a;
    return '+' + a + (r ? ' −' + r : ' −0');
  }

  // BLK-builder-20260924-1835-1 (design 10c): 「この図の履歴」の行は 1 行 1 コミット
  // (「CR1 書き込みを追加  09-21」「初版 [v1.2]  09-10」)。右端は日付 `MM-DD` だけで、
  // ハッシュ・作成者・時刻・HEAD は行の title で読む (以前は 2 行目に詰めて幅 190px で切れていた)。
  function dayLabel(iso) {
    var m = /^\d{4}-(\d{2})-(\d{2})/.exec(_s(iso));
    return m ? (m[1] + '-' + m[2]) : '';
  }

  function historyRow(c) {
    if (!c) return { message: '', tags: [], date: '', title: '' };
    var msg = _s(c.message);
    var tags = (Array.isArray(c.tags) ? c.tags : []).map(_s).filter(function(t) { return !!t; });
    if (c.version) {
      return {
        message: msg,
        tags: tags,
        date: dayLabel(c.date),
        title: (msg ? msg + ' — ' : '') + '自動保存の控え (上書きされる前の中身。コミットではない)',
      };
    }
    return {
      message: msg,
      tags: tags,
      date: dayLabel(c.date),
      title: (msg ? msg + ' — ' : '') + commitMeta(c),
    };
  }

  // ── コミットと控えを 1 本の「この図の履歴」に (BLK-owner-20260924-2157-prune) ─────
  // 保存先が Git のとき、server が上書きの手前に取る控え (`_versions/`) も GIT 節の同じ一覧に
  // 時刻順で混ぜ、行に「控え」の札を付ける (VS Code の Timeline と同じ形)。同じ名前の一覧を 2 つ持たない。
  //   commits  … /git-log のコミット (新しい順)
  //   versions … version-history の rows() (+ markRevisits の revisit / revisitOf)
  // 控えの行: { hash: 'v:{stamp}', version, short: '控え', label, message, date (読み手の時計), tags, lines }
  function _stampDate(stamp) {
    var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(_s(stamp));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return isNaN(d.getTime()) ? null : d;
  }

  function _localIso(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function versionRow(v) {
    var d = _stampDate(v && v.stamp);
    var label = _s(v && v.label) || _s(v && v.stamp);
    var lines = v && typeof v.lines === 'number' ? v.lines : null;
    var tags = ['控え'];
    if (v && v.revisit) tags.push('往復');
    return {
      hash: 'v:' + _s(v && v.stamp),
      version: _s(v && v.stamp),
      short: '控え',
      label: label,
      message: '保存 ' + label + (lines != null ? ' · ' + lines + ' 行' : ''),
      date: d ? _localIso(d) : '',
      tags: tags,
      lines: lines,
    };
  }

  function timeline(commits, versions) {
    var list = [];
    (Array.isArray(commits) ? commits : []).forEach(function(c, i) {
      var t = Date.parse(_s(c && c.date));
      list.push({ row: c, t: isFinite(t) ? t : -Infinity, i: i });
    });
    var n = list.length;
    (Array.isArray(versions) ? versions : []).forEach(function(v, i) {
      var d = _stampDate(v && v.stamp);
      list.push({ row: versionRow(v), t: d ? d.getTime() : -Infinity, i: n + i });
    });
    list.sort(function(a, b) {
      if (a.t !== b.t) return a.t > b.t ? -1 : 1;
      return a.i - b.i;
    });
    return list.map(function(e) { return e.row; });
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
    if (c && c.version) return '左: 作業中 右: 控え ' + _s(c.label);
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

  // BLK-builder-20260924-1818-1 (design 10c): 「比較する相手を選ぶ」の窓の置き場所。
  // FILES 下端の「相手を選ぶ…」から下へ開くと窓の下半分が画面の外に出ていた。
  // 下に余裕 (320px か 60vh の小さい方) があれば今までどおりボタンの下、無ければ上と下の広い側へ開き、
  // 入る高さ (上限 60vh) まで縮める。上へ開くときは窓の下端をボタンの 4px 上に置く (bottom で指す)。
  //   r … ボタンの getBoundingClientRect()、vw / vh … 窓の幅と高さ
  // 返り値 { top, bottom, left, maxHeight } (top / bottom は使わない側が null)
  function pickerPlace(r, vw, vh) {
    var GAP = 4, MARGIN = 8;
    var cap = Math.round(vh * 0.6);
    var below = Math.floor(vh - r.bottom - GAP - MARGIN);
    var above = Math.floor(r.top - GAP - MARGIN);
    var left = Math.max(MARGIN, Math.round(Math.min(r.left, vw - 380)));
    if (below >= Math.min(cap, 320) || below >= above) {
      return { top: Math.round(r.bottom + GAP), bottom: null, left: left, maxHeight: Math.max(0, Math.min(cap, below)) };
    }
    return { top: null, bottom: Math.round(vh - r.top + GAP), left: left, maxHeight: Math.max(0, Math.min(cap, above)) };
  }

  function emptyHistoryText(hasActive) {
    return hasActive ? 'この図に関係するコミットはまだありません' : '図を開くと、その図のコミットが並びます';
  }

  return {
    visible: visible,
    headLabel: headLabel,
    countSource: countSource,
    changes: changes,
    changesLabel: changesLabel,
    changeName: changeName,
    historyLabel: historyLabel,
    marksByName: marksByName,
    markOf: markOf,
    canCommit: canCommit,
    shortDate: shortDate,
    commitMeta: commitMeta,
    commitStat: commitStat,
    commitTags: commitTags,
    dayLabel: dayLabel,
    historyRow: historyRow,
    timeline: timeline,
    filterCommits: filterCommits,
    indexOf: indexOf,
    step: step,
    paneTitle: paneTitle,
    sidesLabel: sidesLabel,
    pickTabs: pickTabs,
    refRows: refRows,
    SCOPE_NOTE: SCOPE_NOTE,
    emptyHistoryText: emptyHistoryText,
    pickerPlace: pickerPlace,
  };
})();
