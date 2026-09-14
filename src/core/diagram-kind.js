'use strict';
window.MA = window.MA || {};

// diagram-kind — 保存フォルダの図を「図種」で見分ける。
//
// BLK-junior-20260908-2003: 保存は「図の名前 = ファイル名」なので、名前を既定の
// diagram1 のままにして図種だけ変えて周を重ねると、前の周に完走した図が次の周の
// 保存で黙って消える。server は図種の変わる保存を `{名前}_{図種}` へ回すように
// なったので、ここはその結果を画面の言葉にする (どう回されたか / 一覧に何の図種が
// 揃っていて何が無いか)。判定そのものは server がしている (一覧の entry.kind)。
window.MA.diagramKind = (function() {

  var LABELS = {
    state: '状態遷移',
    sequence: 'シーケンス',
    'class': 'クラス',
    usecase: 'ユースケース',
    component: 'コンポーネント',
    activity: 'アクティビティ',
  };
  // 一覧の要約に出す並び。台本で使う順 (最初に開くものから)。
  var ORDER = ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];

  function _s(v) { return v == null ? '' : String(v); }

  function label(slug) {
    var k = _s(slug);
    return LABELS[k] || '';
  }

  // 保存先の図 → 図種ごとの枚数。図種の分からない図は 'その他' に寄せず数えない
  // (数えると「状態遷移図が無い」がぼやける)。
  function counts(entries) {
    var out = {};
    var list = entries || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var k = _s(e.kind);
      if (!k || !LABELS[k]) continue;
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  // 図種ごとの枚数を 1 行に。0 枚の図種も「0」で出す
  // (junior の手順 1 は「自分の状態遷移図を開く」で、無いと分かることが答えになる)。
  function summaryLine(entries) {
    var c = counts(entries);
    var parts = [];
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i];
      parts.push(LABELS[k] + ' ' + (c[k] || 0));
    }
    return '図種: ' + parts.join(' / ');
  }

  // その図種の図が 1 枚も無いか。
  function missing(entries, slug) {
    return !(counts(entries)[_s(slug)] > 0);
  }

  // 名前で探すのではなく図種で探す。新しく保存された順ではなく名前順のまま返す。
  function namesOf(entries, slug) {
    var out = [];
    var list = entries || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      if (e.name && _s(e.kind) === _s(slug)) out.push(_s(e.name));
    }
    return out;
  }

  // server が別ファイルへ回したときの知らせ。回されていなければ null。
  // res は POST /autosave の答え。
  function renameNotice(res) {
    if (!res || !res.renamedFrom || !res.savedAs) return null;
    var from = _s(res.renamedFrom);
    var to = _s(res.savedAs);
    if (from === to) return null;
    var prev = label(res.prevKind);
    var now = label(res.kind);
    var text = from + ' は' + (prev ? prev + '図' : '別の図')
      + 'なので、' + (now ? now + '図' : 'この図') + 'は ' + to + ' として保存しました'
      + '（' + from + ' は消していません）';
    return { from: from, to: to, text: text };
  }

  return {
    LABELS: LABELS,
    ORDER: ORDER,
    label: label,
    counts: counts,
    summaryLine: summaryLine,
    missing: missing,
    namesOf: namesOf,
    renameNotice: renameNotice,
  };
})();
