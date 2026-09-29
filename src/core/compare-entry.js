'use strict';
window.MA = window.MA || {};

// compare-entry — 「2 つを左右に置いて見比べる」入口を 1 つの語彙にまとめる判断。
//
// BLK-owner-20260923-1509-prune: 同じことをする入口が 5 つあり、うち 2 つ
// (`並べて比較` と `⇔ 並べて見る`) はタブ列で隣り合って名前では区別できなかった。
// Ctrl+K でもどちらも `compare` / `ならべて` で引けるので、選ぶ手掛かりが無い。
//
// 入口を「どの画面を開くか」ではなく「**誰と並べるか**」で 1 本にする。
// 面は 1 つ (並べて比較の枠) で、相手を枠の中で選ぶ:
//   folder … 別のフォルダの図   (読むだけ。図を切り替えると相手も入れ替わる)
//   tabs   … 別タブの図         (旧 ⇔ 並べて見る)
//   before … この図の前回保存版 (旧 ± 差分の前回保存版・旧「前回保存版と今回保存版」)
// 「人に見せる面」は ▤ 変更サマリボードが持つので、ここには入れない。
//
// DOM も通信も触らない。どのボタンを鳴らすかの対応表と名前だけを持ち、
// 実際に開くのは app.js。
window.MA.compareEntry = (function() {

  function _s(v) { return typeof v === 'string' ? v : ''; }

  // 相手の 3 種。label は画面の札、title はその相手を選ぶと何が起きるか。
  // button は app.js がその相手に切り替えるときに鳴らす既存の入口 (id を変えない
  // ので、呼び出し側と台本が同じ操作を同じ id で指せる)。
  var TARGETS = [
    {
      id: 'folder',
      label: '別のフォルダの図',
      title: '別の保存フォルダの同じ図を右に並べます (読むだけ。保存先は変わりません)',
      button: 'btn-tab-senior',
    },
    {
      id: 'tabs',
      label: '別タブの図',
      title: 'いま開いている別のタブの図を右に並べます',
      button: 'btn-tab-compare',
    },
    {
      id: 'before',
      label: 'この図の前回保存版',
      title: 'この図の前回保存した中身を右に並べます (ソースと図の両方)',
      button: 'btn-tab-compare',
      mode: 'diff',
    },
  ];

  function targets() {
    return TARGETS.map(function(t) {
      var o = { id: t.id, label: t.label, title: t.title, button: t.button };
      if (t.mode) o.mode = t.mode;
      return o;
    });
  }

  function _find(id) {
    var key = _s(id);
    for (var i = 0; i < TARGETS.length; i++) {
      if (TARGETS[i].id === key) return TARGETS[i];
    }
    return null;
  }

  function isTarget(id) { return !!_find(id); }

  function labelOf(id) { var t = _find(id); return t ? t.label : ''; }
  function titleOf(id) { var t = _find(id); return t ? t.title : ''; }

  // その相手に切り替えるとき、どの入口を鳴らし、どのモードで開くか。
  function routeOf(id) {
    var t = _find(id);
    if (!t) return null;
    return { target: t.id, button: t.button, mode: t.mode || 'ref' };
  }

  // 既定の相手。枠を「相手を決めずに」開いたときは、いちばん外 (別のフォルダ) から
  // 見せる。ここだけは図を切り替えても相手が追従するので、開きっぱなしで役に立つ。
  var DEFAULT_TARGET = 'folder';

  function defaultTarget() { return DEFAULT_TARGET; }

  // 旧称の言い換え。Ctrl+K は入口が減っても旧称で引けなければならない
  // (使う人の頭の中の名前は入口の統合では変わらない)。
  var ALIASES = {
    folder: ['並べて比較', '先輩', 'senior', 'せんぱい', 'ひかく', 'べつのふぉるだ'],
    tabs: ['並べて見る', '⇔ 並べて見る', 'compare', 'ならべて', 'みくらべ', 'べつたぶ'],
    before: ['前回保存版', '変更前後を見比べる', '前回保存版と今回保存版', 'ぜんかいほぞん', 'さぶん'],
  };

  function aliasesOf(id) {
    var a = ALIASES[_s(id)];
    return a ? a.slice() : [];
  }

  // Ctrl+K の 1 項目ぶん。入口は 1 つに畳んだが、引ける名前は 3 つとも残す。
  function paletteItems() {
    return TARGETS.map(function(t) {
      return {
        id: 'compare-' + t.id,
        title: '並べて比較 (' + t.label + ')',
        hint: 'Compare',
        target: t.id,
        keywords: ['compare', 'ならべて', 'ひかく'].concat(aliasesOf(t.id)),
      };
    });
  }

  // 下端の札から開くときの相手。札の名前は変えずに、押すと同じ 1 つの枠が開く。
  var BADGES = {
    'status-senior': 'folder',
    'status-livediff': 'before',
  };

  function targetForBadge(id) {
    return BADGES[_s(id)] || '';
  }

  // 畳んだ入口。ここに載っているものは「タブ列に別の入口として並べない」。
  // 値は畳んだ先の相手。台帳と design-check がこの表を読む。
  var FOLDED = {
    'btn-tab-compare': 'tabs',
    'dp-review': 'before',
  };

  function foldedInto(id) { return FOLDED[_s(id)] || ''; }
  function foldedIds() { return Object.keys(FOLDED); }

  return {
    targets: targets,
    isTarget: isTarget,
    labelOf: labelOf,
    titleOf: titleOf,
    routeOf: routeOf,
    defaultTarget: defaultTarget,
    aliasesOf: aliasesOf,
    paletteItems: paletteItems,
    targetForBadge: targetForBadge,
    foldedInto: foldedInto,
    foldedIds: foldedIds,
  };
})();
