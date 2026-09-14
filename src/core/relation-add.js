'use strict';
window.MA = window.MA || {};

// relation-add — 2 要素を選んだときの「関係を追加 / Add relation」パネル (design 3a)。
//
// 従来の Connect フォームは `Association (-->)` のような UML 名 + 記法だけを並べていた。
// これは PlantUML の記法を知っている人にしか読めない。design 3a は
// 「UML の名称を主、意味の説明を副として並べ、矢印の見本を添える」と定める。
// ここは DOM に触らない純関数だけを置き、描画と結線は各図種モジュール。
window.MA.relationAdd = (function() {

  // 関係の名称と意味の説明は relation-kind-cards が持つ (design 3c は
  // 「UseCase / Component / Class で共通」と定める)。同じ関係を追加する側と
  // 選び直す側で語彙がずれないよう、ここでは矢印の見本だけを足す。
  var SAMPLES = {
    usecase: {
      association: '──▶', include: '┄┄▶', extend: '┄┄▶', generalization: '──▷',
    },
    component: {
      association: '──▶', dependency: '┄┄▶', provides: '─()', requires: ')─',
    },
    class: {
      association: '──', inheritance: '──▷', implementation: '┄┄▷',
      composition: '◆──', aggregation: '◇──', dependency: '┄┄▶', nested: '＋──',
    },
  };

  // カタログは呼ばれたときに組む (relation-kind-cards は後から読み込まれてもよい)。
  function _catalog(diagramKind) {
    var RC = window.MA.relationKindCards;
    var list = (RC && RC.kindsOf(diagramKind)) || [];
    var samples = SAMPLES[diagramKind] || {};
    return list.map(function(k) {
      return { value: k.value, name: k.name, desc: k.desc, sample: samples[k.value] || '──▶' };
    });
  }

  function kinds(diagramKind) {
    return _catalog(diagramKind);
  }

  function findKind(diagramKind, value) {
    var list = _catalog(diagramKind);
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === value) return list[i];
    }
    return null;
  }

  function defaultKind(diagramKind) {
    var list = _catalog(diagramKind);
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
