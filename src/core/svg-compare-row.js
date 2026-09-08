'use strict';
window.MA = window.MA || {};

// svg-compare-row — 図一覧の 1 行に「puml 変更 / SVG 書き出し / labels 一致」を並べ、
// 印 (@pua-source-sha1) を持たない図に「未刻印」を出す。
//
// BLK-reviewer-20260908-2003-wish: 「puml は直っているが SVG だけ古い」を見分けるのに、
// 一覧の札 (SVG 古 / 内容ずれ / 内容未確認) だけでは「いつ書き出した SVG か」「文字は
// 一致しているのか」が行に並んでおらず、毎回 render し直して labels を手で突き合わせて
// いた。判定の材料は svg-freshness が持っているのに、行に出ているのは puml の時刻だけ。
//
// もう 1 つ残っていたのが「どの図に印が無いか」。印の無い図だけが手で確かめる対象なのに、
// それを一覧から見分ける手段が無く、reviewer は毎回 22 枚全部を /verify-svg に渡してから
// 絞り込んでいた (追記 20260909-0203)。印の有無は entry.svgSource を見るだけで分かる。
//
// ここは 1 行ぶんの値を揃えて返すだけの場所。DOM にもサーバにも触らない。
//   puml   — .puml の最終更新
//   svg    — .svg の書き出し時刻 (無ければ空)
//   labels — その SVG に描かれている文字が今の puml の描画結果と一致するか
//   印     — その SVG が「どの puml から書き出したか」を自分で名乗っているか
window.MA.svgCompareRow = (function() {

  function _time(v) {
    if (typeof v !== 'string' || v === '') return null;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }

  // 一覧の他の時刻表示 (review-watch.formatMtime) と同じ書式にする。
  // 並べて出す値の書式が違うと、それだけで見比べる手間が増える。
  function formatTime(iso) {
    var t = _time(iso);
    if (t === null) return '';
    var d = new Date(t);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // content (svg-freshness.contentOf の答え) → labels の答え。
  // 体裁だけの差 (format) は文字としては一致しているので「一致」に入れる —
  // 作り直す必要が無い図を毎回「不一致」と呼ぶと、reviewer はまた 1 枚ずつ開いて
  // 確かめ直すことになる。
  var LABELS = {
    match: 'match',
    format: 'match',
    differ: 'differ',
    missing: 'missing',
    unverified: 'unknown',
  };

  var LABEL_CELL = {
    match: { text: 'labels 一致', tone: 'ok',
      title: 'この SVG に描かれている文字は、今の puml を描いた結果と一致しています' },
    differ: { text: 'labels 不一致', tone: 'bad',
      title: 'この SVG に描かれている文字が、今の puml を描いた結果と食い違っています。作り直しが要ります' },
    missing: { text: 'SVG 無', tone: 'bad',
      title: 'この図の SVG が保存フォルダにありません' },
    unknown: { text: 'labels 未確認', tone: 'warn',
      title: '文字を突き合わせていないので、一致するとも食い違うとも言えません' },
  };

  function labelsOf(content) { return LABELS[content] || 'unknown'; }

  function cell(labels) { return LABEL_CELL[labels] || LABEL_CELL.unknown; }

  // 体裁だけが違う図は「一致」だが、バイトまで同じではない。行の説明にだけ書き足す
  // (色と文言を変えると「直すもの」に見えてしまう)。
  function noteOf(content) {
    return content === 'format'
      ? '（書き出し経路による体裁の差だけがあります。作り直さなくても読めます）' : '';
  }

  // SVG の時刻が puml より前かどうか。labels が一致していれば作り直しは要らないので、
  // 「古い」は色を変えずに時刻の説明にだけ出す。
  function svgOlder(entry) {
    var s = _time(entry && entry.svgMtime);
    var p = _time(entry && entry.mtime);
    return s !== null && p !== null && s < p;
  }

  // 印を持っているか。server は svg を書き出すとき元 puml の sha1 を末尾に刻む
  // (entry.svgSource)。印を刻む前に保存された svg にはこれが無く、その 1 枚だけが
  // 「描き直して突き合わせる」手作業の対象になる。
  function isStamped(entry) {
    var s = entry && entry.svgSource;
    return typeof s === 'string' && s !== '';
  }

  var STAMP_CELL = {
    text: '未刻印',
    tone: 'warn',
    title: 'この SVG には「どの puml から書き出したか」の印 (@pua-source-sha1) がありません。'
      + '印を刻む前に保存された図なので、中身を言い切るには描き直して突き合わせる必要があります'
      + '（作り直して保存すれば印が付きます）',
  };

  function stampCell() { return STAMP_CELL; }

  // entry: 一覧の 1 件 ({name, mtime, svgMtime, hash, svgSource, svgHash})
  // records: /verify-svg の控え ({name: {pumlHash, svgHash, result}})
  function row(entry, records) {
    var SF = window.MA.svgFreshness;
    var content = SF ? SF.contentOf(entry, records) : 'unverified';
    var labels = labelsOf(content);
    var c = cell(labels);
    var older = svgOlder(entry);
    var svgText = formatTime(entry && entry.svgMtime);
    // svg が無い図に「未刻印」は言わない — 印を刻む先そのものが無いだけで、
    // 手で確かめる対象ではなく「書き出す」対象。
    var stamped = isStamped(entry);
    var unstamped = !stamped && content !== 'missing';
    return {
      name: (entry && entry.name) || '',
      content: content,
      puml: formatTime(entry && entry.mtime),
      svg: svgText,
      labels: labels,
      labelsText: c.text,
      tone: c.tone,
      title: c.title + noteOf(content),
      stamped: stamped,
      unstamped: unstamped,
      stampText: unstamped ? STAMP_CELL.text : '',
      stampTitle: unstamped ? STAMP_CELL.title : '',
      svgOlder: older,
      svgTitle: !svgText ? 'SVG がまだ書き出されていません'
        : (older ? 'SVG の書き出しは puml の更新より前です' : 'SVG の書き出しは puml の更新以降です'),
      pumlTitle: 'puml の最終更新',
    };
  }

  // 3 つの値を 1 行に並べた文字列。行に出す文言と、説明 (title) の両方で使う。
  function text(r) {
    if (!r) return '';
    return 'puml ' + (r.puml || '—') + ' / SVG ' + (r.svg || '—') + ' / ' + r.labelsText;
  }

  function rowTitle(r) {
    if (!r) return '';
    var parts = [
      'puml の最終更新: ' + (r.puml || '（時刻が取れません）'),
      'SVG の書き出し: ' + (r.svg || '（まだ書き出されていません）') + (r.svgOlder ? '（puml より前）' : ''),
      r.title,
    ];
    if (r.unstamped) parts.push(r.stampTitle);
    return parts.join('\n');
  }

  function rows(entries, records) {
    return (Array.isArray(entries) ? entries : [])
      .map(function(e) { return row(e, records); })
      .filter(function(r) { return r.name !== ''; });
  }

  // 名前で引ける形。一覧は 1 行ずつ描くので、行ごとに scan し直さずに済むようにする。
  function map(entries, records) {
    var out = {};
    rows(entries, records).forEach(function(r) { out[r.name] = r; });
    return out;
  }

  function counts(list) {
    var out = { match: 0, differ: 0, missing: 0, unknown: 0 };
    (list || []).forEach(function(r) { out[r.labels]++; });
    return out;
  }

  // 一覧の頭の 1 行。件数だけを言う (名前は行に並んでいる)。
  function summary(list) {
    if (!list || !list.length) return '';
    var c = counts(list);
    if (c.differ === 0 && c.missing === 0 && c.unknown === 0) {
      return 'labels: ' + list.length + ' 枚とも今の puml と一致しています';
    }
    var parts = [];
    if (c.match) parts.push('一致 ' + c.match + ' 枚');
    if (c.differ) parts.push('不一致 ' + c.differ + ' 枚');
    if (c.missing) parts.push('SVG 無 ' + c.missing + ' 枚');
    if (c.unknown) parts.push('未確認 ' + c.unknown + ' 枚');
    return 'labels: ' + parts.join(' / ');
  }

  // 「不一致」と分かっている図の名前。色分けを見て次に開く図がそのまま決まる。
  function differNames(list) {
    return (list || []).filter(function(r) { return r.labels === 'differ'; })
      .map(function(r) { return r.name; });
  }

  // 印を持たない図の名前。手で確かめる対象はこれだけなので、全図を
  // /verify-svg に渡してから絞る手間がここで消える。
  function unstampedNames(list) {
    return (list || []).filter(function(r) { return r.unstamped; })
      .map(function(r) { return r.name; });
  }

  function stampSummary(list) {
    if (!list || !list.length) return '';
    var n = unstampedNames(list).length;
    if (n === 0) return '印: ' + list.length + ' 枚とも書き出した元 puml を名乗っています（未刻印なし）';
    return '印: 未刻印 ' + n + ' 枚（この ' + n + ' 枚だけが描き直しての突合が要ります）';
  }

  return {
    formatTime: formatTime,
    labelsOf: labelsOf,
    cell: cell,
    isStamped: isStamped,
    stampCell: stampCell,
    row: row,
    text: text,
    rowTitle: rowTitle,
    rows: rows,
    map: map,
    counts: counts,
    summary: summary,
    stampSummary: stampSummary,
    differNames: differNames,
    unstampedNames: unstampedNames,
  };
})();
