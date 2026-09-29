'use strict';
window.MA = window.MA || {};

// relation-roles — 関係の「From / To が何を指すか」を日本語で言う
// (BLK-junior-20260908-1203)。
//
// Relation 追加フォームは From / To としか書いておらず、Inheritance で
// 「From に親のつもりで子を選ぶ」取り違えが起きた。生成される行は
// `GpioDrv <|-- DriverBase` で、親子が逆のまま図が出来上がる。矢印の記法を
// 憶えている人にしか From/To の意味は読めないので、種類ごとの呼び名をここに置き、
// フォームの見出しと「こう入ります」の 1 行に使う。
//
// PlantUML では、どの種類も左 (記法の From) が被継承側・全体側になる。
//
// BLK-owner-20260929-0351-1: フォームの上の欄 (From) は、どの種類でも図に描かれる
// 矢の根元にする。継承・実現・汎化の矢は子 (実装クラス) から親 (インターフェース) へ
// 引かれるので、この 3 種だけは上の欄が記法の右 (子) に当たる。フォームの From / To と
// 記法の左右の対応は toModel / toUi が 1 か所で持つ (図種ごとに書き分けない)。
window.MA.relationRoles = (function() {

  var ROLES = {
    'inheritance':    { label: '継承', from: '親', to: '子', arrow: '<|--', rootIsTo: true, rev: '--|>' },
    'implementation': { label: '実装', from: 'インターフェース', to: '実装クラス', arrow: '<|..', rootIsTo: true, rev: '..|>' },
    // ユースケース図の汎化 (`親 <|-- 子`)。表には呼び名と向きだけを置く。
    'generalization': { label: '汎化', from: '親', to: '子', arrow: '<|--', rootIsTo: true, rev: '--|>' },
    'composition':    { label: 'コンポジション', from: '全体', to: '部分', arrow: '*--' },
    'aggregation':    { label: '集約', from: '全体', to: '部分', arrow: 'o--' },
    'nested':         { label: '入れ子', from: '外側', to: '内側', arrow: '+--' },
    'dependency':     { label: '依存', from: '使う側', to: '使われる側', arrow: '..>' },
    'association':    { label: '関連', from: '一方', to: 'もう一方', arrow: '--' },
  };

  function of(kind) {
    var k = kind == null ? '' : String(kind).trim();
    return ROLES[k] || ROLES.association;
  }

  // 上の欄 (From) が矢の根元になるよう、記法の左右を入れ替えて見せる種類か。
  function rootIsTo(kind) {
    var k = kind == null ? '' : String(kind).trim();
    return !!(ROLES[k] && ROLES[k].rootIsTo);
  }

  // フォームの欄 (side: 'from' = 上の欄 = 矢の根元 / 'to' = 下の欄 = 矢じり) が
  // 記法のどちらの端 ('from' = 左 / 'to' = 右) に当たるか。
  function modelSide(kind, side) {
    var s = side === 'to' ? 'to' : 'from';
    if (!rootIsTo(kind)) return s;
    return s === 'from' ? 'to' : 'from';
  }

  // フォームの上下の欄の値 → 記法の左右 ({from, to})。
  function toModel(kind, uiFrom, uiTo) {
    return rootIsTo(kind) ? { from: uiTo, to: uiFrom } : { from: uiFrom, to: uiTo };
  }
  // 記法の左右 → フォームの上下の欄の値 ({from, to})。toModel と同じ入れ替えなので対称。
  function toUi(kind, modelFrom, modelTo) {
    return rootIsTo(kind) ? { from: modelTo, to: modelFrom } : { from: modelFrom, to: modelTo };
  }

  // フォームの欄の呼び名 (継承なら上の欄 = 子、下の欄 = 親)。
  function roleName(kind, side) {
    var r = of(kind);
    return modelSide(kind, side) === 'to' ? r.to : r.from;
  }

  // フォームの見出し。上の欄は矢の根元の呼び名 (From)、下の欄は矢じりの呼び名 (To)。
  function fieldLabel(kind, side) {
    return roleName(kind, side) + ' (' + (side === 'to' ? 'To' : 'From') + ')';
  }

  // 本文にある継承・実現の行の書き方 (`親 <|-- 子` か `子 --|> 親`)。多い方に揃えて新しい行を書く
  // (既存の図の書き方を崩さない)。どちらも無い・同数なら従来の `親 <|-- 子`。
  var _FWD_RE = /^\s*("[^"]*"|[^\s"]+)\s+<\|(?:--|\.\.)\s+("[^"]*"|[^\s"]+)/;
  var _REV_RE = /^\s*("[^"]*"|[^\s"]+)\s+(?:--|\.\.)\|>\s+("[^"]*"|[^\s"]+)/;
  function prefersRootFirst(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var fwd = 0, rev = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^\s*'/.test(l)) continue;
      if (_REV_RE.test(l)) rev++;
      else if (_FWD_RE.test(l)) fwd++;
    }
    return rev > fwd;
  }

  // 記法の左右と書き方から、書き込む矢印と左右の並び。
  function written(kind, modelFrom, modelTo, rootFirst) {
    var r = of(kind);
    if (rootFirst && r.rev) return { left: modelTo, arrow: r.rev, right: modelFrom };
    return { left: modelFrom, arrow: r.arrow, right: modelTo };
  }

  // 「押すとこう入る」の 1 行。記法と呼び名を並べて出し、追加する前に
  // 親子が入れ替わっていないかを目で確かめられるようにする。
  // uiFrom / uiTo はフォームの上下の欄の値。呼び名もフォームの欄の順 (根元が先) で出す。
  function preview(kind, uiFrom, uiTo, rootFirst) {
    var r = of(kind);
    var f = uiFrom == null || uiFrom === '' ? '?' : String(uiFrom);
    var t = uiTo == null || uiTo === '' ? '?' : String(uiTo);
    var m = toModel(kind, f, t);
    var w = written(kind, m.from, m.to, rootFirst);
    return w.left + ' ' + w.arrow + ' ' + w.right + '   （' +
      (rootIsTo(kind) ? r.to + ': ' + f + ' / ' + r.from + ': ' + t
                      : r.from + ': ' + f + ' / ' + r.to + ': ' + t) + '）';
  }

  return {
    ROLES: ROLES,
    of: of,
    rootIsTo: rootIsTo,
    modelSide: modelSide,
    toModel: toModel,
    toUi: toUi,
    roleName: roleName,
    fieldLabel: fieldLabel,
    prefersRootFirst: prefersRootFirst,
    written: written,
    preview: preview,
  };
})();
