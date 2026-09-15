'use strict';
window.MA = window.MA || {};

// version-history — 保存フォルダに残っている「上書きされる前の版」を読む。
//
// BLK-junior-20260908-2003: 保存は「図の名前 = ファイル名」なので、名前を既定の
// diagram1 のままにしたまま図種だけ変えて作業を続けると、前の周に完走した図が
// 次の周の保存で黙って消える。junior の persona-data には 6 図種を完走したはずの
// 周のあとも 3 枚しか残っておらず、状態遷移図の実体が無かった。
//
// server は上書きの直前に前の中身を `_versions/{name}--{stamp}.puml` へ退避する。
// ここはその一覧を「いつの版か・何の図だったか」に直すだけの純関数を置く
// (fetch と DOM は app.js)。
window.MA.versionHistory = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 刻印 `YYYYMMDD-HHMMSS` (同秒の 2 本目は `.1` が付く) → Date。
  // 刻印は UTC で打たれている (server は time.gmtime)。読めなければ null。
  function stampToDate(stamp) {
    var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/.exec(_s(stamp));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return isNaN(d.getTime()) ? null : d;
  }

  // 一覧に出す時刻。読み手の時計 (ローカル時間) で「MM/DD HH:MM」。
  // 刻印が読めない版でも行は出す (開けば中身は読めるので、隠す方が損)。
  function label(stamp) {
    var d = stampToDate(stamp);
    if (!d) return _s(stamp);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 版の最初の中身の行 (server が head で返す) から図種を当てる。
  // 「消えたのは状態遷移図」を開く前に言うためのもの。当てられなければ ''。
  function kindOf(head) {
    var s = _s(head).trim();
    if (!s) return '';
    if (/^(state\b|\[\*\]\s*-->)/i.test(s)) return '状態遷移';
    if (/^(participant|actor|boundary|control|entity|database|collections|queue)\b/i.test(s)) return 'シーケンス';
    if (/^(class|interface|abstract|enum)\b/i.test(s)) return 'クラス';
    if (/^(usecase|rectangle|:.*:\s*as\b)/i.test(s)) return 'ユースケース';
    if (/^(component|\[.+\]\s*(as\b|$))/i.test(s)) return 'コンポーネント';
    if (/^(start\b|:.*;$|if\s*\()/i.test(s)) return 'アクティビティ';
    return '';
  }

  // server の /autosave-versions の答え → 画面に出す行。新しい順のまま。
  function rows(payload) {
    var list = (payload && payload.versions) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i] || {};
      out.push({
        stamp: _s(v.stamp),
        label: label(v.stamp),
        kind: kindOf(v.head),
        head: _s(v.head),
        lines: typeof v.lines === 'number' ? v.lines : null,
      });
    }
    return out;
  }

  // ── 空洞化した図を、どの版に戻せばいいか ────────────────────────────────
  //
  // BLK-primary-20260916-0100: 指摘の反映で空洞化 (中身がほとんど消えた状態) を
  // 直そうとすると、一覧の版は 20 行ぜんぶが同じ見た目で並ぶ。新しい方はもう
  // 空洞化した後の中身なので、「戻しても直らない」で手が止まる。どれに戻せば
  // いいかは行数で機械的に分かるので、画面が数えて名指しする。
  //
  // 「充実している」の判定: いま出ている中身の行数より目立って大きい版。
  // 目立って = 1.5 倍以上かつ 5 行以上多い (1〜2 行の増減は編集の揺れなので
  // 空洞化とは呼ばない)。該当する版のうち **一番新しいもの** を勧める
  // (一番大きい版ではない。空洞化の直前まで進めた作業を捨てないため)。
  var SHRINK_RATIO = 1.5;
  var SHRINK_MIN_LINES = 5;

  function isFuller(rowLines, nowLines) {
    if (typeof rowLines !== 'number' || typeof nowLines !== 'number') return false;
    return rowLines >= nowLines * SHRINK_RATIO && rowLines - nowLines >= SHRINK_MIN_LINES;
  }

  // bestRestore(rows, nowLines) — 勧める版 (rows は rows() の並び = 新しい順)。
  // 戻す先が無ければ null。
  function bestRestore(rows, nowLines) {
    var list = rows || [];
    for (var i = 0; i < list.length; i++) {
      if (isFuller(list[i].lines, nowLines)) return list[i];
    }
    return null;
  }

  // 一覧の先頭に出す 1 行。空洞化していなければ何も言わない (null)。
  function shrinkNotice(name, rows, nowLines) {
    var best = bestRestore(rows, nowLines);
    if (!best) return null;
    return {
      stamp: best.stamp,
      text: _s(name) + ' はいま ' + nowLines + ' 行。'
        + best.label + ' の版は ' + best.lines + ' 行あります',
      detail: '中身が減ったまま保存された可能性があります。'
        + 'この行の［戻す］で ' + best.label + ' の版の中身に戻せます'
        + '（今の中身は控えに残り、Ctrl+Z でも取り消せます）',
      restoreLabel: best.label + ' の版に戻す',
    };
  }

  // 版を開いたときのタブ名。元の名前を上書きしないよう刻印を付ける
  // (開いてそのまま保存しても、今の図を消さない)。
  function openName(name, stamp) {
    return _s(name) + '@' + _s(stamp);
  }

  // ── 版を今の図に流し込む (BLK-primary-20260913-0306-friction) ────────────
  // 版は「別タブで開く」ことしかできず、内容が壊れた図を直すには開いた版を全文
  // 選択して元の図に打ち直すしかなかった (59 行・約 1000 字を 1 手順で打ち直した
  // run がある)。一覧の版に「戻す」を付け、打鍵ではなく 1 クリックで戻せるようにする。
  // 直前の中身は server が上書きの手前で退避するので、戻し自体も取り消せる。
  function restoreLabel() { return '戻す'; }

  function restoreTitle(name, stamp) {
    return _s(name) + ' を ' + label(stamp) + ' の版の中身に戻します'
      + '（今の中身は控えに残り、Ctrl+Z でも取り消せます）';
  }

  function restoredLine(name, stamp) {
    return _s(name) + ' を ' + label(stamp) + ' の版に戻しました（Ctrl+Z で取り消せます）';
  }

  // 同じ中身の版に「戻す」を押したとき。何も起きなかったように見せない。
  function unchangedLine(name, stamp) {
    return _s(name) + ' は既に ' + label(stamp) + ' の版と同じ中身です';
  }

  // 一覧のボタンに出す「履歴 N」。0 のときはボタン自体を出さない。
  function countLabel(n) {
    var c = typeof n === 'number' && n > 0 ? n : 0;
    return c > 0 ? '履歴 ' + c : '';
  }

  // 現存する図と、本体が消えて版だけ残っている図。
  // server の一覧の `gone` をそのまま名前順で返す。
  function goneRows(payload) {
    var list = (payload && payload.gone) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i] || {};
      if (!g.name) continue;
      out.push({ name: _s(g.name), versions: typeof g.versions === 'number' ? g.versions : 0 });
    }
    return out;
  }

  return {
    stampToDate: stampToDate,
    label: label,
    kindOf: kindOf,
    rows: rows,
    openName: openName,
    restoreLabel: restoreLabel, restoreTitle: restoreTitle,
    restoredLine: restoredLine, unchangedLine: unchangedLine,
    countLabel: countLabel,
    goneRows: goneRows,
    isFuller: isFuller,
    bestRestore: bestRestore,
    shrinkNotice: shrinkNotice,
  };
})();
