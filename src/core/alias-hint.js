'use strict';
window.MA = window.MA || {};

// alias-hint — Alias 欄に打った文字が DSL でどう扱われるかを、打っている最中に見せる。
//
// idNormalizer は日本語の Alias を「表示名」に回し、識別子は U1 のような
// ASCII を自動採番する。図の見た目は正しく出るので、打った人は自分の名前が
// 識別子として残っていないことに気付けない。あとで関係の To を選び直すとき、
// プルダウンの表示 (ラベル) と DSL の実体 (U1) が同じものか確信が持てなくなる。
//
// ここは判定そのものは idNormalizer に任せ、その結果を日本語の 1 行にする。
// 文言と挙動が食い違わないよう、文言は必ず normalize() の戻り値から作る。
window.MA.aliasHint = (function() {
  // rawInput: Alias 欄の生文字列 / existingIds: { id: true } / prefix: 'U' など
  // → { kind: 'empty'|'ascii'|'auto', id, label, text }
  function hintFor(rawInput, existingIds, prefix) {
    var norm = window.MA.idNormalizer.normalize(rawInput, existingIds, prefix);
    if (!norm.valid) {
      return { kind: 'empty', id: '', label: '', text: '' };
    }
    if (norm.id === norm.label) {
      return {
        kind: 'ascii', id: norm.id, label: norm.label,
        text: '識別子 ' + norm.id + ' として DSL に書きます。表示名を変えたいときは下の Label 欄へ。',
      };
    }
    return {
      kind: 'auto', id: norm.id, label: norm.label,
      text: '「' + norm.label + '」は表示名として扱い、識別子は ' + norm.id +
            ' を自動で割り当てます (DSL: "' + norm.label + '" as ' + norm.id + ')。',
    };
  }

  // プルダウンや一覧で 1 件を指す文字列。ラベルと識別子がずれているときだけ
  // 識別子を併記する。「表示は日本語だが実体は U1」を目で確かめられるようにする。
  function optionLabel(id, label) {
    var i = id == null ? '' : String(id);
    var l = label == null ? '' : String(label);
    if (!l) return i;
    if (!i || l === i) return l;
    return l + ' (' + i + ')';
  }

  return {
    hintFor: hintFor,
    optionLabel: optionLabel,
  };
})();
