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

  // ── 内容での判定 (BLK-reviewer-20260908-1103) ─────────────────────────────
  // mtime の比較は「puml が svg より後に触られたか」しか見ていない。保存し直しただけで
  // 中身は追いついている図と、前々回の編集から追いついていない図が、同じ「古い」に見える。
  // 実際、mtime が古いと出た 16 枚のうち中身まで食い違っていたのは 7 枚だけで、
  // 残り 9 枚を確かめるのに 1 枚ずつ再描画して diff を取る手作業が要った。
  // server は svg を書き出すとき、その元になった puml の sha1 を svg の末尾に刻む
  // (entry.svgSource)。ここはその印と今の puml の sha1 (entry.hash) を突き合わせる。
  //   match      — この svg は今の puml から作られている (mtime が古くても中身は一致)
  //   differ     — 別の内容の puml から作られている (作り直しが要る。確実)
  //   missing    — svg が無い
  //   unverified — 印が無い。印を刻む前に書き出した svg なので内容では言えない
  //
  // BLK-reviewer-20260908-1103-wish: 印は「書き出した側の申告」なので、印を刻む前に
  // 置かれた svg (実データの 22 枚がそれ) については何も言えず、作り直して上書きしない限り
  // 未確認のままだった。作り直すと「今そう見える」だけで「保存されていた絵が正しかったか」は
  // 分からなくなる。そこで、上書きせずに 1 回描き直してバイト比較した結果 (records) も
  // 根拠として受け取る。records は {name: {pumlHash, svgHash, result}} で、
  // 突き合わせた 2 つの指紋が今のものと一致している間だけ有効。
  function contentOf(entry, records) {
    if (!entry) return 'unverified';
    if (_time(entry.svgMtime) === null) return 'missing';
    var hash = entry.hash;
    if (typeof hash !== 'string' || hash === '') return 'unverified';
    var stamp = entry.svgSource;
    if (typeof stamp === 'string' && stamp !== '') return stamp === hash ? 'match' : 'differ';
    var r = records && records[entry.name];
    if (!r || typeof r !== 'object') return 'unverified';
    if (r.pumlHash !== hash || r.svgHash !== entry.svgHash) return 'unverified';
    return (r.result === 'match' || r.result === 'differ') ? r.result : 'unverified';
  }

  var CONTENT_BADGES = {
    match: { mark: '内容一致', title: 'この SVG は今の puml から作られています (中身で確かめました)' },
    differ: { mark: '内容ずれ', title: 'この SVG は別の内容の puml から作られています。作り直しが要ります' },
    missing: { mark: 'SVG 無', title: 'この図の SVG が保存フォルダにありません' },
    unverified: { mark: '内容未確認', title: '元の puml の印が無く、中身が一致するかは分かりません。作り直すと印が付きます' },
  };

  function contentBadge(content) {
    return CONTENT_BADGES[content] || CONTENT_BADGES.unverified;
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
  function scan(entries, records) {
    var rows = (Array.isArray(entries) ? entries : []).map(function(e) {
      return {
        name: e && e.name, status: statusOf(e), content: contentOf(e, records),
        mtime: e && e.mtime, svgMtime: e && e.svgMtime,
      };
    }).filter(function(r) { return typeof r.name === 'string' && r.name !== ''; });
    var counts = { fresh: 0, stale: 0, missing: 0, unknown: 0 };
    var contentCounts = { match: 0, differ: 0, missing: 0, unverified: 0 };
    rows.forEach(function(r) { counts[r.status]++; contentCounts[r.content]++; });
    return {
      rows: rows,
      counts: counts,
      contentCounts: contentCounts,
      // unknown は作り直しても「分からない」が消える保証が無いが、作り直せば
      // 必ず今の内容になるので対象に入れる。
      // 内容で一致が取れている図は、mtime が古くても作り直す必要が無いので外す
      // (BLK-reviewer-20260908-1103: ここで 16 枚が 7 枚に減る)。
      needsRender: rows.filter(function(r) { return r.status !== 'fresh' && r.content !== 'match'; })
        .map(function(r) { return r.name; }),
      // 内容で言い切るために作り直しが要る図。印の無い図も入る。
      needsProof: rows.filter(function(r) { return r.content !== 'match'; })
        .map(function(r) { return r.name; }),
      // 上書きせずに確かめられる図 (svg があって、まだ内容で言い切れていないもの)。
      // 作り直しと違い、保存されていた絵をそのまま残したまま白黒が付く。
      needsVerify: rows.filter(function(r) { return r.content === 'unverified'; })
        .map(function(r) { return r.name; }),
      // BLK-reviewer-20260908-1203: 内容ずれと分かっている図。印 (svgSource) だけで
      // ずれが分かった図は、確かめ直していないので「何が食い違うか」の材料が手元に無い。
      // 中身を言うために server にもう一度突き合わせてもらう対象。
      needsDiff: rows.filter(function(r) { return r.content === 'differ'; })
        .map(function(r) { return r.name; }),
    };
  }

  function statusMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.status; });
    return out;
  }

  // BLK-primary-20260908-1303: 集計行が mtime だけを見て「SVG: 古い 2 枚」と言う一方、
  // 同じ画面の「古い SVG を作り直す」は内容一致まで見て「古い SVG はありません」と
  // 押せなかった。基準が 2 つあると、見出しからは「本当に古いのか」が分からず、
  // 「内容はすべて確かめてあります」まで開いて確かめる 1 手間が毎回要る。
  // 数える基準を needsRender と同じ (mtime が古く、かつ内容が一致していないもの) に
  // 揃え、内容一致で落ちた分は括弧で名指しして「なぜ数が減ったか」を消さない。
  function summary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var rows = scanned.rows;
    var need = { stale: 0, missing: 0, unknown: 0 };
    var settled = 0;   // mtime では古いが、中身は今の puml と一致した図
    rows.forEach(function(r) {
      if (r.status === 'fresh') return;
      if (r.content === 'match') { settled++; return; }
      need[r.status]++;
    });
    var note = settled ? '（中身が一致した ' + settled + ' 枚は作り直し不要）' : '';
    if (need.stale === 0 && need.missing === 0 && need.unknown === 0) {
      return 'SVG は ' + rows.length + ' 枚とも puml に追いついています' + note;
    }
    var parts = [];
    if (need.stale) parts.push('古い ' + need.stale + ' 枚');
    if (need.missing) parts.push('無い ' + need.missing + ' 枚');
    if (need.unknown) parts.push('不明 ' + need.unknown + ' 枚');
    return 'SVG: ' + parts.join(' / ') + note;
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
    // mtime では見つからない食い違い。svg の方が新しいのに、別の内容の puml から
    // 作られている図 — 時刻だけを見ていた頃は「追いついている」と読み違えていた。
    var differ = rows.filter(function(r) { return r.content === 'differ' && r.status === 'fresh'; })
      .map(function(r) { return r.name; });
    if (differ.length) {
      out.push({
        status: 'differ', label: 'SVG の内容が古い',
        title: 'この SVG は別の内容の puml から作られています。作り直すまでは前のレイアウトです',
        names: differ,
      });
    }
    // 内容で一致が取れた図は、mtime が古くても読める図なので名前を出さない
    // (出すと「直すもの」の一覧に、直す必要の無い図が毎回混ざる)。
    SHORTFALL.forEach(function(g) {
      var names = rows.filter(function(r) { return r.status === g.status && r.content !== 'match'; })
        .map(function(r) { return r.name; });
      if (names.length) out.push({ status: g.status, label: g.label, title: g.title, names: names });
    });
    return out;
  }

  // 内容での 1 行。mtime の要約 (summary) とは別に出す — 見ているものが違う。
  function contentSummary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var c = scanned.contentCounts || { match: 0, differ: 0, missing: 0, unverified: 0 };
    if (c.differ === 0 && c.missing === 0 && c.unverified === 0) {
      return '内容: ' + c.match + ' 枚とも今の puml から作られています';
    }
    var parts = [];
    if (c.match) parts.push('一致 ' + c.match + ' 枚');
    if (c.differ) parts.push('ずれ ' + c.differ + ' 枚');
    if (c.missing) parts.push('SVG 無 ' + c.missing + ' 枚');
    if (c.unverified) parts.push('未確認 ' + c.unverified + ' 枚');
    return '内容: ' + parts.join(' / ');
  }

  // 内容で言い切れるようにするボタンの文言。
  // 押す前に何枚を描き直して比べるかが分かるようにする (1 枚あたり数百 ms かかる)。
  function verifyLabel(scanned) {
    var n = (scanned && scanned.needsVerify && scanned.needsVerify.length) || 0;
    return n === 0 ? '中身を確かめる SVG はありません' : 'SVG の中身を確かめる（' + n + ' 枚）';
  }

  // 食い違いの中身を調べるボタンの文言 (BLK-reviewer-20260908-1203)。
  // 対象は「ずれ」と分かっている図のうち、まだ中身を出していないもの。
  function diffLabel(pending) {
    var n = (pending && pending.length) || 0;
    return n === 0 ? '食い違いの中身は調べてあります' : '食い違いの中身を調べる（' + n + ' 枚）';
  }

  function proofLabel(scanned) {
    var n = (scanned && scanned.needsProof && scanned.needsProof.length) || 0;
    return n === 0 ? '内容はすべて確かめてあります' : '内容を確かめる（' + n + ' 枚を作り直す）';
  }

  // BLK-primary-20260908-1203: 「古い SVG を作り直す」は古い・無い・内容ずれを
  // まとめて作り直すので、reviewer に名指しされた 5 枚だけを狙えず、1 枚ずつ開いて
  // ⟳Render → Export▾ → SVG を 5 回繰り返すことになっていた。
  // 名前の行 (SVG が無い / SVG が古い / SVG の内容が古い) ごとに、その行の図だけを
  // 作り直せる文言を返す。行に並んでいる名前がそのまま作り直す対象になる。
  function groupRenderLabel(group) {
    var n = (group && Array.isArray(group.names) && group.names.length) || 0;
    return n === 0 ? '' : 'この ' + n + ' 枚だけ作り直す';
  }

  // その行の作り直しが何をするかの説明。行によって「無い図を書き出す」「古い図を
  // 描き直す」と中身が違うので、行の label をそのまま織り込む。
  function groupRenderTitle(group) {
    var label = (group && group.label) || '';
    var n = (group && Array.isArray(group.names) && group.names.length) || 0;
    return '「' + label + '」に並んでいる ' + n + ' 枚だけを puml から作り直す。'
      + 'ほかの図と puml には触らない';
  }

  // 作り直しボタンの文言。0 枚なら押させない。
  function renderLabel(scanned) {
    var n = (scanned && scanned.needsRender.length) || 0;
    return n === 0 ? '古い SVG はありません' : '古い SVG を作り直す（' + n + ' 枚）';
  }

  function contentMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.content; });
    return out;
  }

  return {
    statusOf: statusOf,
    contentOf: contentOf,
    badge: badge,
    contentBadge: contentBadge,
    scan: scan,
    statusMap: statusMap,
    contentMap: contentMap,
    summary: summary,
    contentSummary: contentSummary,
    shortfall: shortfall,
    renderLabel: renderLabel,
    groupRenderLabel: groupRenderLabel,
    groupRenderTitle: groupRenderTitle,
    proofLabel: proofLabel,
    diffLabel: diffLabel,
    verifyLabel: verifyLabel,
  };
})();
