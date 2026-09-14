'use strict';
window.MA = window.MA || {};

// write-activity — 保存フォルダの図が「たった今も書き換えられている最中か」。
//
// BLK-reviewer-20260908-0923-wish: reviewer は tick 開始時点の状態を読んでいる
// つもりだが、実際には同じ tick の中で primary が persona-data\primary\ に
// 書き込み続けている。「今読んでいる内容が、読み始めた瞬間のものか、
// 読んでいる最中に変わったものか」を見分ける手段が無く、古い版と新しい版が
// 混ざった指摘を書いてしまう恐れがある。
//
// 判定は 3 つだけ。
//   active   — 直近 N 分以内に更新された (まだ書き込み中かもしれない)
//   settled  — N 分より前が最後の更新 (読んで差し支えない)
//   unknown  — 時刻が取れず判定できない
// 分からないことを settled と言わない (「確かめた」と「確かめられなかった」を
// 混ぜると、この印の意味が無くなる)。
//
// 時刻の突き合わせは server の時計で行う。ファイルの mtime は server の
// 時計で刻まれるので、閲覧している端末の時計と比べると数分ずれるだけで
// 「全部書き込み中」にも「全部落ち着いている」にもなりうる。
window.MA.writeActivity = (function() {
  // 既定の窓。ペルソナの 1 tick (20 分) より十分に短く、図を 1 枚保存して
  // SVG を書き出すまでの間 (数十秒) より十分に長い幅を取る。
  var DEFAULT_MINUTES = 5;

  function _time(v) {
    if (typeof v !== 'string' || v === '') return null;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }

  // その図が最後に触られた時刻。puml と隣の svg のうち新しい方を採る
  // (SVG だけ書き出している最中も「書き込み中」であることに変わりはない)。
  function touchedAt(entry) {
    if (!entry) return null;
    var a = _time(entry.mtime);
    var b = _time(entry.svgMtime);
    if (a === null) return b;
    if (b === null) return a;
    return a > b ? a : b;
  }

  function _now(now) {
    var t = _time(now);
    if (t !== null) return t;
    if (typeof now === 'number' && isFinite(now)) return now;
    return null;
  }

  function _windowMs(minutes) {
    var m = (typeof minutes === 'number' && isFinite(minutes) && minutes > 0)
      ? minutes : DEFAULT_MINUTES;
    return m * 60 * 1000;
  }

  // 経過時間 (ms)。now か mtime が取れなければ null。
  function ageOf(entry, now) {
    var t = touchedAt(entry);
    var n = _now(now);
    if (t === null || n === null) return null;
    return n - t;
  }

  function statusOf(entry, now, minutes) {
    var age = ageOf(entry, now);
    if (age === null) return 'unknown';
    // 未来の時刻は時計のずれか、書き込みが今まさに進んでいるかのどちらか。
    // どちらにせよ「落ち着いている」とは言えないので active に倒す。
    if (age < 0) return 'active';
    return age <= _windowMs(minutes) ? 'active' : 'settled';
  }

  var BADGES = {
    active: { mark: '書込中?', title: '直近の窓の中で更新されました。読んでいる最中にも変わりうるので、後回しにするか取り直してください' },
    settled: { mark: '', title: '窓より前が最後の更新です。読み始めた版のまま読めます' },
    unknown: { mark: '時刻?', title: '更新時刻が取れず、書き込み中かどうか分かりません' },
  };

  function badge(status) {
    return BADGES[status] || BADGES.unknown;
  }

  // 経過時間の言い方。件数だけでなく「何分前か」が要る
  // (5 分前と 30 秒前では、後回しにするか取り直すかの判断が変わる)。
  function ageText(age) {
    if (age === null || age === undefined) return '';
    if (age < 0) return 'これから';
    var sec = Math.floor(age / 1000);
    if (sec < 60) return sec + ' 秒前';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + ' 分前';
    return Math.floor(min / 60) + ' 時間前';
  }

  function scan(entries, now, minutes) {
    var rows = (Array.isArray(entries) ? entries : []).map(function(e) {
      return {
        name: e && e.name,
        status: statusOf(e, now, minutes),
        age: ageOf(e, now),
        mtime: e && e.mtime,
      };
    }).filter(function(r) { return typeof r.name === 'string' && r.name !== ''; });
    var counts = { active: 0, settled: 0, unknown: 0 };
    rows.forEach(function(r) { counts[r.status]++; });
    return {
      rows: rows,
      counts: counts,
      minutes: (typeof minutes === 'number' && isFinite(minutes) && minutes > 0)
        ? minutes : DEFAULT_MINUTES,
      // 新しい順。一番あやしい図を先頭に出す。
      activeNames: rows.filter(function(r) { return r.status === 'active'; })
        .sort(function(a, b) { return (a.age === null ? 0 : a.age) - (b.age === null ? 0 : b.age); })
        .map(function(r) { return r.name; }),
    };
  }

  function statusMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.status; });
    return out;
  }

  function ageMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.age; });
    return out;
  }

  // 「後回しにしない図」= 今すぐ読んでよい図。unknown は入れない
  // (判定できていないものを「読んでよい」側に入れない)。
  function settledNames(scanned) {
    return ((scanned && scanned.rows) || [])
      .filter(function(r) { return r.status === 'settled'; })
      .map(function(r) { return r.name; });
  }

  function summary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var c = scanned.counts;
    var m = scanned.minutes;
    if (c.active === 0 && c.unknown === 0) {
      return '直近 ' + m + ' 分に更新された図はありません（' + c.settled + ' 枚とも読み始めた版のまま読めます）';
    }
    var parts = [];
    if (c.active) parts.push('更新中の可能性 ' + c.active + ' 枚');
    if (c.unknown) parts.push('時刻不明 ' + c.unknown + ' 枚');
    return '直近 ' + m + ' 分: ' + parts.join(' / ');
  }

  return {
    DEFAULT_MINUTES: DEFAULT_MINUTES,
    touchedAt: touchedAt,
    ageOf: ageOf,
    statusOf: statusOf,
    badge: badge,
    ageText: ageText,
    scan: scan,
    statusMap: statusMap,
    ageMap: ageMap,
    settledNames: settledNames,
    summary: summary,
  };
})();
