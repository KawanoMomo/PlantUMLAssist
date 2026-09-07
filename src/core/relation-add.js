'use strict';
window.MA = window.MA || {};

// relation-add — 2 要素を選んだときの「関係を追加 / Add relation」パネル (design 3a)。
//
// 従来の Connect フォームは `Association (-->)` のような UML 名 + 記法だけを並べていた。
// これは PlantUML の記法を知っている人にしか読めない。design 3a は
// 「UML の名称を主、意味の説明を副として並べ、矢印の見本を添える」と定める。
// ここは DOM に触らない純関数だけを置き、描画と結線は各図種モジュール。
window.MA.relationAdd = (function() {

  // 図種ごとの関係カタログ。value は既存の fmtRelation / addRelation に渡す kind。
  // name = UML 名称 (主)、desc = 意味の説明 (副)、sample = 矢印の見本。
  var CATALOG = {
    usecase: [
      { value: 'association',    name: '関連 / association',        desc: 'アクターがユースケースを利用する',   sample: '──▶' },
      { value: 'include',        name: '包含 / include',            desc: '実行時に必ず呼び出される',           sample: '┄┄▶' },
      { value: 'extend',         name: '拡張 / extend',             desc: '条件を満たすときだけ実行される',     sample: '┄┄▶' },
      { value: 'generalization', name: '汎化 / generalization',     desc: '一方がもう一方の特化である',         sample: '──▷' },
    ],
    component: [
      { value: 'association',    name: '関連 / association',        desc: '部品どうしが接続されている',         sample: '──▶' },
      { value: 'dependency',     name: '依存 / dependency',         desc: '一方が他方を利用している',           sample: '┄┄▶' },
      { value: 'provides',       name: '提供 / provides',           desc: '部品がインターフェースを提供する',   sample: '─()' },
      { value: 'requires',       name: '要求 / requires',           desc: '部品がインターフェースを必要とする', sample: ')─' },
    ],
  };

  function kinds(diagramKind) {
    var list = CATALOG[diagramKind] || [];
    return list.map(function(k) {
      return { value: k.value, name: k.name, desc: k.desc, sample: k.sample };
    });
  }

  function findKind(diagramKind, value) {
    var list = CATALOG[diagramKind] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === value) return list[i];
    }
    return null;
  }

  function defaultKind(diagramKind) {
    var list = CATALOG[diagramKind] || [];
    return list.length > 0 ? list[0].value : '';
  }

  // From / To の入替。選択順そのものは触らず、どちらを起点にするかだけを返す。
  function orient(selData, swapped) {
    if (!selData || selData.length < 2) return null;
    var a = selData[0], b = selData[1];
    return swapped ? { from: b, to: a } : { from: a, to: b };
  }

  // 「追加される行」。実際に書き込む関数 (fmtRelation) をそのまま使うので、
  // プレビューと DSL が食い違うことがない。
  function previewLine(fmtRelation, kind, fromId, toId, label) {
    if (typeof fmtRelation !== 'function' || !fromId || !toId) return '';
    try {
      return String(fmtRelation(kind, fromId, toId, label || '')).trim();
    } catch (e) {
      return '';
    }
  }

  // キャンバス上部に出す注記。0 / 1 件では出さない (null)。
  function noticeText(count) {
    var n = Number(count) || 0;
    if (n === 2) return '2 つ選択中 — 関係を追加できます';
    if (n >= 3) return n + ' つ選択中 — 関係を追加できるのは 2 つまでです';
    return null;
  }

  // ラジオ 1 件ぶんの HTML。UML 名称を主、説明を副、右端に矢印の見本。
  function optionHtml(idPrefix, opt, checked) {
    var esc = (window.MA.htmlUtils && window.MA.htmlUtils.escHtml)
      ? window.MA.htmlUtils.escHtml
      : function(s) { return String(s); };
    return '<label class="rel-opt" data-value="' + esc(opt.value) + '">'
      + '<input type="radio" name="' + esc(idPrefix) + '-kind"'
      + ' id="' + esc(idPrefix) + '-kind-' + esc(opt.value) + '"'
      + ' value="' + esc(opt.value) + '"' + (checked ? ' checked' : '') + '>'
      + '<span class="rel-opt-text">'
      + '<span class="rel-opt-name">' + esc(opt.name) + '</span>'
      + '<span class="rel-opt-desc">' + esc(opt.desc) + '</span>'
      + '</span>'
      + '<span class="rel-opt-sample">' + esc(opt.sample) + '</span>'
      + '</label>';
  }

  function optionsHtml(diagramKind, idPrefix, selectedValue) {
    var list = kinds(diagramKind);
    var sel = selectedValue || defaultKind(diagramKind);
    return list.map(function(opt) {
      return optionHtml(idPrefix, opt, opt.value === sel);
    }).join('');
  }

  return {
    kinds: kinds,
    findKind: findKind,
    defaultKind: defaultKind,
    orient: orient,
    previewLine: previewLine,
    noticeText: noticeText,
    optionHtml: optionHtml,
    optionsHtml: optionsHtml,
  };
})();
