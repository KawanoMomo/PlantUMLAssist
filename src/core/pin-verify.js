'use strict';
window.MA = window.MA || {};

// pin-verify — 指摘 1 件を「puml で何が変わったか」+「それが SVG に出ているか」の
// 1 つの判定にまとめる。
//
// BLK-reviewer-20260908-1903-wish: 依頼が本当に直ったかを確かめるのに、
// puml の差分・label-position 監査・/render 再描画・/verify-svg の labels/shape 突合を
// 別々に回し、最後にその 4 つを自分で結び付けて「この依頼はもう直った」と判定していた。
// 指摘の文面 (自然文) と機械監査が別々の入口にあることが、pin-progress の札が付いても
// reviewer が puml と SVG を読み直す二度手間の根本原因だった。
//
// 着手状況 (pin-progress) が言えるのは puml 側だけである。「直した」と分かっても、
// 客が見るのは書き出された SVG なので、SVG が追いついていなければ依頼は終わっていない。
// ここは 2 つの観測を 1 つの札にする:
//   未対応     — puml がまだ動いていない (SVG を見るまでもない)
//   SVG 未反映 — puml は直ったが、保存中の SVG は今の puml を描いた結果ではない
//   反映済み   — puml が直り、SVG も今の puml と一致している。依頼は終わっている
//   確かめられず — SVG 側を確かめていない / 確かめられなかった。分からないことを
//                  「反映済み」とは言わない (この道具の意味が無くなる)
//
// DOM にもサーバにも触らない。走査と /verify-svg の呼び出しは app.js。
window.MA.pinVerify = (function() {

  var VERDICT = {
    open: {
      key: 'open', label: '未対応', done: false,
      title: 'puml がまだ直っていません',
    },
    'puml-only': {
      key: 'puml-only', label: 'SVG 未反映', done: false,
      title: 'puml は直りましたが、保存中の SVG は今の puml を描いた結果ではありません',
    },
    reflected: {
      key: 'reflected', label: '反映済み', done: true,
      title: 'puml が直り、SVG も今の puml と一致しています',
    },
    unknown: {
      key: 'unknown', label: '確かめられず', done: false,
      title: 'SVG 側を確かめていないので、反映されたとは言えません',
    },
  };

  var ORDER = ['open', 'puml-only', 'unknown', 'reflected'];

  function _s(v) { return v == null ? '' : String(v); }

  // ---- puml 側 -------------------------------------------------------------

  // 指摘した行がどうなったか。判断は pin-progress の観測をそのまま使う
  // (同じことを 2 か所で決めると、札と本文が食い違う)。
  // diff は review-diff.compare の結果 (前回控えとの行差分)。あれば「変更点」を数で添える。
  function pumlSide(entry, diff) {
    var status = entry ? _s(entry.status) : '';
    var fixed = status === 'resolved';
    var text;
    if (fixed) text = _s(entry.why) || '指摘した行が書き換わりました';
    else if (status === 'started') text = '図は書き換わりましたが、指摘した行はそのままです';
    else text = '指摘のあと、この図は書き換わっていません';
    var stat = '';
    var RD = window.MA.reviewDiff;
    if (diff && diff.hasBefore && RD && RD.statsText) stat = RD.statsText(diff.stats);
    return { fixed: fixed, status: status || 'untouched', text: text, change: stat };
  }

  // ---- SVG 側 --------------------------------------------------------------

  // res は /verify-svg の 1 図ぶんの結果 {status: 'match'|'differ'|'missing'|'error'}。
  // diff は svg-diff-summary.compare の結果 (differ のときだけ来る)。
  // 何も渡されなければ 'unchecked'。「確かめていない」を「一致」と言わない。
  function svgSide(res, diff) {
    var st = res ? _s(res.status) : '';
    if (st === 'match') {
      return { state: 'match', ok: true, text: 'SVG は今の puml を描いた結果と一致しています' };
    }
    if (st === 'differ') {
      var SD = window.MA.svgDiffSummary;
      var why = (diff && SD) ? SD.summary(diff) : '';
      return {
        state: 'differ', ok: false,
        text: 'SVG は今の puml と食い違っています' + (why ? '（' + why + '）' : ''),
      };
    }
    if (st === 'missing') {
      return { state: 'missing', ok: false, text: 'この図の SVG が保存フォルダにありません' };
    }
    if (st === 'error') {
      return {
        state: 'error', ok: false,
        text: 'SVG を確かめられませんでした' + (res && res.error ? '（' + _s(res.error) + '）' : ''),
      };
    }
    return { state: 'unchecked', ok: false, text: 'SVG 側はまだ確かめていません' };
  }

  // ---- 1 件の判定 ----------------------------------------------------------

  // entry: pin-progress.observe が返した 1 件
  // ctx: { diff, svg, svgDiff }
  //   diff    — その図の review-diff.compare の結果 (無くてよい)
  //   svg     — その図の /verify-svg の結果 (無くてよい)
  //   svgDiff — その図の svg-diff-summary.compare の結果 (differ のときだけ)
  function judge(entry, ctx) {
    var c = ctx || {};
    var puml = pumlSide(entry, c.diff);
    var svg = svgSide(c.svg, c.svgDiff);
    var key;
    if (!puml.fixed) key = 'open';
    else if (svg.ok) key = 'reflected';
    else if (svg.state === 'differ' || svg.state === 'missing') key = 'puml-only';
    else key = 'unknown';
    var v = VERDICT[key];
    return {
      key: key,
      entry: entry || null,
      item: (entry && entry.item) || null,
      label: v.label,
      title: v.title,
      done: v.done,
      puml: puml,
      svg: svg,
    };
  }

  // まとめて。svgs / diffs / svgDiffs は図名で引ける入れ物。
  //   judgeAll(entries, { svgs: {name: result}, diffs: {name: cmp}, svgDiffs: {name: diff} })
  function judgeAll(entries, ctx) {
    var c = ctx || {};
    var svgs = c.svgs || {};
    var diffs = c.diffs || {};
    var sds = c.svgDiffs || {};
    return (Array.isArray(entries) ? entries : []).map(function(e) {
      var doc = (e && e.item) ? _s(e.item.doc) : '';
      var j = judge(e, {
        diff: Object.prototype.hasOwnProperty.call(diffs, doc) ? diffs[doc] : null,
        svg: Object.prototype.hasOwnProperty.call(svgs, doc) ? svgs[doc] : null,
        svgDiff: Object.prototype.hasOwnProperty.call(sds, doc) ? sds[doc] : null,
      });
      j.doc = doc;
      j.key2 = doc + '#' + (e && e.item ? _s(e.item.id) : '');
      return j;
    });
  }

  // 確かめる図の名前。指摘の付いている図だけを渡す
  // (描き直しは 1 枚あたり数百 ms かかる。指摘の無い図まで回すと箱が開かなくなる)。
  function docsOf(entries) {
    var seen = {}, out = [];
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      var doc = (e && e.item) ? _s(e.item.doc) : '';
      if (!doc || seen[doc]) return;
      seen[doc] = true;
      out.push(doc);
    });
    return out;
  }

  // ---- 表示用 --------------------------------------------------------------

  // 1 件の本文。札 1 つと根拠 2 行 — これが「1 つの判定」の中身。
  function rowText(j) {
    if (!j) return '';
    var parts = [j.label];
    if (j.puml) parts.push('puml: ' + j.puml.text + (j.puml.change ? '（' + j.puml.change + '）' : ''));
    if (j.svg) parts.push('SVG: ' + j.svg.text);
    return parts.join(' · ');
  }

  function summary(list) {
    var sum = { total: 0, open: 0, 'puml-only': 0, reflected: 0, unknown: 0, done: 0, left: 0 };
    (Array.isArray(list) ? list : []).forEach(function(j) {
      if (!j || !VERDICT[j.key]) return;
      sum.total += 1;
      sum[j.key] += 1;
      if (VERDICT[j.key].done) sum.done += 1; else sum.left += 1;
    });
    return sum;
  }

  // 帯の 1 行。reviewer の手順 8 (前回指摘の反映確認) はこの 1 行で終わる。
  function headText(sum) {
    var s = sum || summary([]);
    if (!s.total) return '判定する指摘はありません';
    var t = '反映済み ' + s.reflected + ' · SVG 未反映 ' + s['puml-only'] + ' · 未対応 ' + s.open;
    if (s.unknown) t += ' · 確かめられず ' + s.unknown;
    return t;
  }

  // 反映済みでないものだけ。今日まだ見なければならない依頼がこれで引ける。
  function leftOnly(list) {
    return (Array.isArray(list) ? list : []).filter(function(j) {
      return j && VERDICT[j.key] && !VERDICT[j.key].done;
    });
  }

  // 並べ替え: 未対応 → SVG 未反映 → 確かめられず → 反映済み。
  // 同じ札なら図名、次に指摘 id。
  function sort(list) {
    return (Array.isArray(list) ? list : []).slice().sort(function(a, b) {
      var ai = ORDER.indexOf(a.key), bi = ORDER.indexOf(b.key);
      if (ai !== bi) return ai - bi;
      if (a.doc !== b.doc) return a.doc < b.doc ? -1 : 1;
      return a.key2 < b.key2 ? -1 : (a.key2 > b.key2 ? 1 : 0);
    });
  }

  return {
    VERDICT: VERDICT,
    pumlSide: pumlSide,
    svgSide: svgSide,
    judge: judge,
    judgeAll: judgeAll,
    docsOf: docsOf,
    rowText: rowText,
    summary: summary,
    headText: headText,
    leftOnly: leftOnly,
    sort: sort,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MA.pinVerify;
