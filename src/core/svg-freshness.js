'use strict';
window.MA = window.MA || {};

// svg-freshness — 保存フォルダの {name}.svg が {name}.puml に追いついているか。
//
// BLK-reviewer-20260908-0103: 図を読む前に「この SVG は今の puml から作られたものか」を
// 確かめるのに、`ls -l` で puml と svg のタイムスタンプを 1 枚ずつ突き合わせていた。
// 22 枚ぶん目で比べる作業なので、1 枚見落とすと「古いレイアウトを今の図として読む」
// ことに気付けない。判定はここに置き、一覧が答えを出せるようにする。
//
// 判定は 3 つだけ。
//   fresh   — svg が puml と同じかそれより新しい
//   stale   — svg の方が古い (作り直しが要る)
//   missing — svg が無い
// 時刻が取れない図は unknown。分からないことを fresh と言わない
// (「確かめた」と「確かめられなかった」を混ぜると、この道具の意味が無くなる)。
window.MA.svgFreshness = (function() {

  function _time(v) {
    if (typeof v !== 'string' || v === '') return null;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }

  function statusOf(entry) {
    if (!entry) return 'unknown';
    var svg = _time(entry.svgMtime);
    if (svg === null) return 'missing';
    var puml = _time(entry.mtime);
    if (puml === null) return 'unknown';
    // 同時刻は追いついているものとして扱う (保存と描き出しが 1 秒に収まる)。
    return svg >= puml ? 'fresh' : 'stale';
  }

  var BADGES = {
    fresh: { mark: '', title: 'SVG は今の puml から作られています' },
    stale: { mark: 'SVG 古', title: 'SVG が puml より古い。作り直すまでは前のレイアウトです' },
    missing: { mark: 'SVG 無', title: 'この図の SVG が保存フォルダにありません' },
    unknown: { mark: 'SVG ?', title: '時刻が取れず、SVG が今の内容かどうか分かりません' },
  };

  function badge(status) {
    return BADGES[status] || BADGES.unknown;
  }

  // 一覧ぶんの判定。作り直しが要るものを needsRender にまとめる。
  function scan(entries) {
    var rows = (Array.isArray(entries) ? entries : []).map(function(e) {
      return { name: e && e.name, status: statusOf(e), mtime: e && e.mtime, svgMtime: e && e.svgMtime };
    }).filter(function(r) { return typeof r.name === 'string' && r.name !== ''; });
    var counts = { fresh: 0, stale: 0, missing: 0, unknown: 0 };
    rows.forEach(function(r) { counts[r.status]++; });
    return {
      rows: rows,
      counts: counts,
      // unknown は作り直しても「分からない」が消える保証が無いが、作り直せば
      // 必ず今の内容になるので対象に入れる。
      needsRender: rows.filter(function(r) { return r.status !== 'fresh'; })
        .map(function(r) { return r.name; }),
    };
  }

  function statusMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.status; });
    return out;
  }

  function summary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var c = scanned.counts;
    if (c.stale === 0 && c.missing === 0 && c.unknown === 0) {
      return 'SVG は ' + c.fresh + ' 枚とも puml に追いついています';
    }
    var parts = [];
    if (c.stale) parts.push('古い ' + c.stale + ' 枚');
    if (c.missing) parts.push('無い ' + c.missing + ' 枚');
    if (c.unknown) parts.push('不明 ' + c.unknown + ' 枚');
    return 'SVG: ' + parts.join(' / ');
  }

  // BLK-reviewer-20260908-0823-wish: 「無い N 枚」だけでは、どの図を書き出し忘れたかを
  // 一覧の行から目で探すことになる (17 枚の突合で 1 枚見つけた、が偶然だった原因)。
  // 直し方ごとに名前を束ねて返し、一覧がそのまま名前を出せるようにする。
  // fresh と unknown は入れない — 前者は直す必要が無く、後者は名前を出しても
  // 「何をすればよいか」が決まらないため (要約の件数としては残る)。
  var SHORTFALL = [
    { status: 'missing', label: 'SVG が無い', title: 'この図の SVG が保存フォルダにありません。書き出すと消えます' },
    { status: 'stale', label: 'SVG が古い', title: 'SVG が puml より古い。作り直すまでは前のレイアウトです' },
  ];

  function shortfall(scanned) {
    var rows = (scanned && scanned.rows) || [];
    var out = [];
    SHORTFALL.forEach(function(g) {
      var names = rows.filter(function(r) { return r.status === g.status; })
        .map(function(r) { return r.name; });
      if (names.length) out.push({ status: g.status, label: g.label, title: g.title, names: names });
    });
    return out;
  }

  // 作り直しボタンの文言。0 枚なら押させない。
  function renderLabel(scanned) {
    var n = (scanned && scanned.needsRender.length) || 0;
    return n === 0 ? '古い SVG はありません' : '古い SVG を作り直す（' + n + ' 枚）';
  }

  return {
    statusOf: statusOf,
    badge: badge,
    scan: scan,
    statusMap: statusMap,
    summary: summary,
    shortfall: shortfall,
    renderLabel: renderLabel,
  };
})();
