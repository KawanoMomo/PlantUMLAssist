'use strict';
window.MA = window.MA || {};

// map-align — 対応表で組になった「綴りの違う 2 つ」を、相手の綴りに揃える組の一覧にする。
//
// BLK-primary-20260925-0932-wish: 「{相手フォルダ} の「X」に揃える」は、名前の形で自動に結べた
// 綴り違いにしか出なかった。部品名が総入れ替えの 2 枚 (Clock_Controller / Clock_Ctrl、
// Irq_Controller / IRQCtrl) は組が 1 つもできず、揃える行が出ない。
// ここは対応表の行 (機械が組んだ行も、人が「同じもの」「対応を選ぶ」で決めた行も) から、
// 自分の図の名前を相手の名前に書き替える組を作る。書き替えるのは自分の図だけ。
//
// DOM も書き込みも持たない。組を当てるのは app.js (⇄ 一括置換と同じ道)。
window.MA.mapAlign = (function() {
  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 識別子として当てられる綴りか (bulk-rename と同じ条件。空白や記号を含む名前は当てない)。
  function _ident(name) { return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(_s(name)); }

  // map: state-map / class-map / seq-map の build の戻り。
  // 返すのは [{key, type, from, to, fromName, toName, decided}]。
  // 対象は要素の行 (状態・参加者・クラス) で、両側があり、id が違う行。
  function candidates(map) {
    var out = [];
    var seen = {};
    ((map && map.states) || []).forEach(function(row) {
      if (!row || !row.ref || !row.mine) return;
      if (row.match === 'ref-only' || row.match === 'mine-only') return;
      var from = _s(row.mineId) || _s(row.mine);
      var to = _s(row.refId) || _s(row.ref);
      if (!from || !to || from === to) return;
      if (!_ident(from) || !_ident(to)) return;
      if (seen[from]) return;
      seen[from] = true;
      out.push({
        key: (row.type || 'state') + ':' + from,
        type: row.type || 'state',
        from: from, to: to,
        fromName: _s(row.mine), toName: _s(row.ref),
        decided: !!row.decided,
      });
    });
    return out;
  }

  // チェックの付いた組だけを { from, to } にする。checked は { key: bool }。
  // 覚えの無い組は既定で入れる (揃えずに残す組だけ外す)。
  function pairsOf(cands, checked) {
    var c = checked || {};
    return (cands || []).filter(function(x) { return c[x.key] !== false; })
      .map(function(x) { return { from: x.from, to: x.to }; });
  }

  // 押す前のボタンの文言。folder は相手の置き場所 (フォルダ名、無ければ図の名前)。
  function buttonLabel(folder, n) {
    var who = _s(folder) || '相手';
    return n > 0 ? (who + ' の綴りに揃える (' + n + ' 組)') : (who + ' の綴りに揃える');
  }

  // 1 行の説明: 自分の綴り → 相手の綴り。
  function rowText(c) {
    return c.fromName + ' → ' + c.toName + (c.decided ? ' (手で対応)' : '');
  }

  // 当てたあとの 1 行。
  function doneMessage(res, docName) {
    if (!res || !res.total) return '揃える綴りが本文に見当たりません';
    return res.total + ' 箇所を相手の綴りに揃えました (' + (docName || 'この図') + ')。元に戻すは Ctrl+Z';
  }

  var api = {
    candidates: candidates,
    pairsOf: pairsOf,
    buttonLabel: buttonLabel,
    rowText: rowText,
    doneMessage: doneMessage,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
