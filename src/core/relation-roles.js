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
// PlantUML では、どの種類も左 (From) が矢の根元・被継承側・全体側になる。
// 呼び名だけが種類ごとに変わる。
window.MA.relationRoles = (function() {

  var ROLES = {
    'inheritance':    { label: '継承', from: '親', to: '子', arrow: '<|--' },
    'implementation': { label: '実装', from: 'インタフェース', to: '実装クラス', arrow: '<|..' },
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

  // フォームの見出し。従来の From / To も残す (DSL の並びと対応が取れる)。
  function fieldLabel(kind, side) {
    var r = of(kind);
    return (side === 'to' ? r.to : r.from) + ' (' + (side === 'to' ? 'To' : 'From') + ')';
  }

  // 「押すとこう入る」の 1 行。記法と呼び名を並べて出し、追加する前に
  // 親子が入れ替わっていないかを目で確かめられるようにする。
  function preview(kind, from, to) {
    var r = of(kind);
    var f = from == null || from === '' ? '?' : String(from);
    var t = to == null || to === '' ? '?' : String(to);
    return f + ' ' + r.arrow + ' ' + t + '   （' + r.from + ': ' + f + ' / ' + r.to + ': ' + t + '）';
  }

  return {
    ROLES: ROLES,
    of: of,
    fieldLabel: fieldLabel,
    preview: preview,
  };
})();
