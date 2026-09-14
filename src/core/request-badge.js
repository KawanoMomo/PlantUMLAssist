'use strict';
window.MA = window.MA || {};

// request-badge — 指摘.md に書かれた依頼の「未解消 何件 / 最長 何 tick 継続」を
// 画面の下端に出すための文字を作る。
//
// BLK-reviewer-20260914-2006: 依頼の継続 tick 数は `npm run requests` で追えるように
// なったが、それは reviewer 側の CLI であって、直す側 (primary) の画面には何も出ない。
// primary は業務の手順を始める前に指摘.md を GUI の外で開いて読むしかなく、読み忘れた
// 回はそのまま 1 tick 放置になる。件数と最長継続 tick 数が常に下端に出ていれば、
// 「今日は未着手の依頼が何件あるか」を確かめる動作そのものが要らなくなる。
//
// 数え方は request-ledger (CLI と同じ純関数) の rows() に任せ、ここはその行を
// 1 つの短い文字列に落とすだけ。DOM にもファイルにも触らない。
window.MA.requestBadge = (function() {

  var VERSION = 1;
  // 吹き出しに出す依頼の数。長い一覧は吹き出しでは読めないので上位だけ出す
  // (rows() は放置の長い順に並んでいる)。
  var TIP_ROWS = 5;

  function _s(v) { return v == null ? '' : String(v); }

  // 控えの置き場所。保存フォルダごとに分ける (別のフォルダを開いたら別の台帳)。
  function storageKey(dir) {
    return 'ma.request-badge.' + _s(dir);
  }

  // 1 tick = 指摘.md の 1 版。reviewer は run ごとに指摘.md を上書きするので、
  // 本文が同じ間は何度読み直しても同じ tick になる (画面を開き直すだけで
  // 継続 tick 数が伸びると、放置の長さが測れなくなる)。
  // 指紋は本文そのものから取る。requestLedger.hash は「同じ依頼か」を見るために
  // 括弧と空白を落とすので、扱いだけを書き替えた版が前の版と同じ tick になってしまう。
  // 版の見分けには書き替えを全部拾う必要がある。
  function _rawHash(text) {
    var s = _s(text);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function tickLabel(text) {
    var t = _s(text);
    if (!t.trim()) return '';
    return 'note-' + _rawHash(t);
  }

  // summarize — rows() の行を、下端に出す 1 行ぶんの数に畳む。
  function summarize(rows) {
    var rs = Array.isArray(rows) ? rows : [];
    var open = rs.filter(function(r) { return r && r.open; });
    var stalled = 0, regressed = 0, worst = 0;
    open.forEach(function(r) {
      if (r.status === 'stalled') stalled++;
      if (r.regressed) regressed++;
      var n = Number(r.streak) || 0;
      if (n > worst) worst = n;
    });
    return {
      total: rs.length,
      open: open.length,
      stalled: stalled,
      regressed: regressed,
      resolved: rs.length - open.length,
      worst: worst,
    };
  }

  // 下端に出す文字。まだ指摘.md を読めていない回は数を騙らず「−」を出す。
  function badgeText(sum) {
    if (!sum) return '継続依頼 −';
    if (!sum.open) return '継続依頼 0';
    return '継続依頼 ' + sum.open + ' (最長 ' + sum.worst + ' tick)';
  }

  // 0 件・未読のときは目を引かせない (statusCounters と同じ約束)。
  function isActive(sum) {
    return !!(sum && sum.open);
  }

  // 未着手が混ざっている回だけ、色をもう 1 段強くする。
  function tone(sum) {
    if (!sum || !sum.open) return 'none';
    if (sum.stalled || sum.regressed) return 'stalled';
    return 'working';
  }

  // 吹き出し。押す前に「何件がどの状況で、どれが何 tick 放置か」まで読めるようにする。
  function titleText(rows, sum) {
    var RL = window.MA.requestLedger;
    var s = sum || summarize(rows);
    if (!s.total) return '指摘.md の依頼はまだ読めていません (隣の reviewer フォルダを見ます)';
    if (!s.open) return '未解消の依頼はありません (解消済み ' + s.resolved + ' 件)';
    var head = '未解消 ' + s.open + ' 件 (未着手 ' + s.stalled + ' 件)'
      + (s.regressed ? ' ・ 再発 ' + s.regressed + ' 件' : '')
      + ' ・ 最長 ' + s.worst + ' tick 継続';
    var body = (Array.isArray(rows) ? rows : [])
      .filter(function(r) { return r && r.open; })
      .slice(0, TIP_ROWS)
      .map(function(r) {
        var label = RL ? RL.statusLabel(r.status) : _s(r.status);
        return '・[' + label + '] ' + _s(r.text) + ' — 連続 ' + (Number(r.streak) || 0) + ' tick';
      });
    var rest = s.open - body.length;
    if (rest > 0) body.push('・ほか ' + rest + ' 件');
    return [head].concat(body).join('\n');
  }

  return {
    VERSION: VERSION,
    storageKey: storageKey,
    tickLabel: tickLabel,
    summarize: summarize,
    badgeText: badgeText,
    isActive: isActive,
    tone: tone,
    titleText: titleText,
  };
})();
