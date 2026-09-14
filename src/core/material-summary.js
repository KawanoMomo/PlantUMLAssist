'use strict';
window.MA = window.MA || {};

// material-summary — 「部品サマリカード」。1 部品の図種を、資料用の絵と保存日時ごと
// 1 画面に並べる。
//
// BLK-junior-20260915-0206-wish: 資料化そのものは行まるごと 1 押しでできるように
// なったが (BLK-junior-20260915-0106-wish)、書き出し終えたあとに「6 図種とも
// 揃っているか」を見返す手立てが無く、部品名で一覧をフィルタして 1 枚ずつ開き、
// 題名の (資料用) と保存日時を目で追っていた。揃っているかは「何枚あるか」では
// なく「どの図種が・いつの絵で揃っているか」なので、図種ごとの絵と日時を並べる。
//
// 状態 (未 / 古 / 済) の判定は materialBoard が持つ —— ここは持たない。表と
// カードで「資料用なし」の判定がずれると、表で済と読んだ図種がカードでは
// 抜けている、が起きる。DOM・fetch には触らない (絵を出すのは app 側)。
window.MA.materialSummary = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _MB() { return window.MA.materialBoard; }
  function _p(n) { return ('0' + n).slice(-2); }

  // 保存日時。分まで (秒は資料が揃ったかの判断に効かない)。日時を取れない
  // 一覧しか返らない環境では黙らず「日時不明」と言う —— 空欄だと「まだ無い」と
  // 読み違える。
  function timeText(at) {
    if (at == null || at === '') return '日時不明';
    var n = (typeof at === 'number') ? at : Date.parse(at);
    if (!isFinite(n)) return '日時不明';
    var d = new Date(n);
    return d.getFullYear() + '-' + _p(d.getMonth() + 1) + '-' + _p(d.getDate())
      + ' ' + _p(d.getHours()) + ':' + _p(d.getMinutes());
  }

  // 1 図種ぶんのカード。絵にするのは資料用の版 (それが設計書に貼るもの)。
  // 資料用がまだ無い図種は元の図を薄く出す —— 何の図が抜けているのかは、
  // 名前だけより絵のほうが速く分かる。
  function card(row) {
    if (!row) return null;
    var has = row.status !== 'none';
    return {
      kind: row.kind,
      status: row.status,
      mark: row.statusMark,
      statusLabel: row.statusLabel,
      source: row.source,
      sourceAt: row.sourceAt,
      material: row.material,
      materialAt: row.materialAt,
      // 絵の元にする .puml。資料用があればそれ、無ければ元の図。
      preview: has ? row.material : row.source,
      isMaterial: has,
      format: row.format,
      formatLabel: row.formatLabel,
      filename: row.filename,
      savedText: has ? ('資料用 ' + timeText(row.materialAt)) : '資料用なし',
      sourceText: '元の図 ' + timeText(row.sourceAt),
      needsWork: row.needsWork,
    };
  }

  // cards(entries, component) — 並びは図番号の順 (materialBoard.rows のまま)。
  // 揃っているかを読むカードなので、状態で並べ替えない —— 設計書に貼る順に
  // 並んでいてこそ「4 枚目が抜けている」と読める。
  function cards(entries, component) {
    var MB = _MB();
    if (!MB) return [];
    return MB.rows(entries, component).map(card).filter(function(c) { return !!c; });
  }

  // カード 1 枚の説明 (絵の下と title に出す)。
  function cardText(component, c) {
    if (!c) return '';
    var head = _s(component) + ' / ' + c.kind + ' — ';
    if (c.status === 'none') return head + '資料用がまだありません（' + c.filename + ' として出せます）';
    if (c.status === 'stale') return head + c.material + ' は ' + timeText(c.materialAt)
      + ' の資料用で、元の図（' + timeText(c.sourceAt) + '）のほうが新しい';
    return head + c.material + '（' + timeText(c.materialAt) + '）が最新の資料用';
  }

  // 見出しの 1 行。「6 枚とも揃っているか」に、数えずに答える。
  function summaryText(component, list) {
    var cs = Array.isArray(list) ? list : [];
    if (!cs.length) return _s(component) + ' に資料化できる図がありません。';
    var n = { none: 0, stale: 0, fresh: 0 };
    cs.forEach(function(c) { n[c.status] = (n[c.status] || 0) + 1; });
    var head = _s(component) + ': ' + cs.length + ' 図種中 ' + n.fresh + ' 図種が資料化済み';
    if (n.none + n.stale === 0) return head + '（すべて揃っています）';
    var lack = [];
    if (n.none) lack.push('資料用なし ' + n.none);
    if (n.stale) lack.push('元が新しい ' + n.stale);
    return head + '（' + lack.join('・') + '）';
  }

  // 揃っていない図種の名前。見出しの次に「どれが抜けているか」を名指しする
  // (カードを目で走査させない)。
  function missingKinds(list) {
    return (Array.isArray(list) ? list : [])
      .filter(function(c) { return c && c.needsWork; })
      .map(function(c) { return c.kind; });
  }

  function missingText(list) {
    var ks = missingKinds(list);
    if (!ks.length) return '';
    return '足りないのは ' + ks.join('・') + ' です';
  }

  // 資料用の日時の幅。同じ日に一式を作ったのか、何周ぶんか混ざっているのかは
  // 設計書に貼る前に知りたい (古い絵が 1 枚だけ混ざるのが一番こわい)。
  function spanText(list) {
    var ts = (Array.isArray(list) ? list : [])
      .filter(function(c) { return c && c.isMaterial && c.materialAt != null; })
      .map(function(c) { return c.materialAt; });
    if (!ts.length) return '';
    var lo = Math.min.apply(null, ts);
    var hi = Math.max.apply(null, ts);
    if (lo === hi) return '資料用はすべて ' + timeText(lo) + ' のものです';
    return '資料用の日時は ' + timeText(lo) + ' 〜 ' + timeText(hi) + ' です';
  }

  function title(component) {
    return _s(component) + ' の資料サマリ';
  }

  return {
    timeText: timeText,
    card: card,
    cards: cards,
    cardText: cardText,
    summaryText: summaryText,
    missingKinds: missingKinds,
    missingText: missingText,
    spanText: spanText,
    title: title,
  };
})();
