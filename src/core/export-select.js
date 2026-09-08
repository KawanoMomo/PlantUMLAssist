'use strict';
window.MA = window.MA || {};

// export-select — 提出用 zip に詰める図を、その場で絞り込んで選ぶ。
//
// BLK-primary-20260908-1203-wish: 「全図をSVGで保存（zip）」は開いている図を無条件に
// 全部詰めるだけで、▤ 変更サマリボードで付けた [要修正] の印も「前回提出後に変わったか」も
// 使われない。見比べた結果をいったん頭か別メモに落としてから Export に戻って選び直す、
// という二度手間になっていた。
//
// ここではボードと同じ「変更図のみ / 要修正のみ」の絞り込みを持ち、選んだ図だけを
// zip に渡せる形にする。判定の材料 (基準との差 / 印の件数) は外から関数で受け取るので、
// このモジュールは DOM も localStorage も見ない。描画は app.js の職掌。
window.MA.exportSelect = (function() {

  var MODES = ['all', 'changed', 'fix', 'since'];
  var MODE_LABEL = { all: '全部', changed: '変更図のみ', fix: '要修正のみ',
                     since: '前回書き出しから変わった図のみ' };

  function normalizeMode(mode) {
    return MODES.indexOf(mode) >= 0 ? mode : 'all';
  }

  // buildList(docs, deps) — 開いている図を 1 行 1 図の候補にする。
  // deps.statusOf(name, dsl) は save-diff の statusOf ('new' / 'changed' / 'same')。
  // deps.sinceStatusOf(name, dsl) は export-log の statusOf (前回この zip を
  // 書き出した時点との差)。save-diff の「前回保存から」とは基準が違う
  // (BLK-primary-20260909-0003-wish: 客先に出した版からの差でなければ、
  //  出し直す図を絞れない)。
  // deps.fixCountOf(name) は review-verdicts の [要修正] 件数。どれも無ければ
  // 「基準が分からない」ものとして status='new'、fix=0 として扱う (絞り込みで
  //  黙って落とさない。落とすと提出物から図が欠ける)。
  function buildList(docs, deps) {
    var d = deps || {};
    var statusOf = (typeof d.statusOf === 'function') ? d.statusOf : function() { return 'new'; };
    var fixOf = (typeof d.fixCountOf === 'function') ? d.fixCountOf : function() { return 0; };
    var sinceOf = (typeof d.sinceStatusOf === 'function') ? d.sinceStatusOf : function() { return 'new'; };
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(doc) {
      if (!doc || typeof doc.dsl !== 'string' || doc.dsl.trim() === '') return;   // 空の図は書き出せない
      var name = String(doc.name == null || doc.name === '' ? 'diagram' : doc.name);
      var status = statusOf(name, doc.dsl);
      if (status !== 'changed' && status !== 'same') status = 'new';
      var fix = Number(fixOf(name)) || 0;
      var since = sinceOf(name, doc.dsl);
      if (since !== 'changed' && since !== 'same') since = 'new';
      out.push({
        id: doc.id, name: name, dsl: doc.dsl,
        diagramType: doc.diagramType || '',
        status: status,
        sinceStatus: since,
        sinceChanged: since !== 'same',
        changed: status !== 'same',
        fix: fix < 0 ? 0 : fix,
        selected: true,
      });
    });
    return out;
  }

  // matches(item, mode) — その図が絞り込みに残るか。
  // 'changed' は前回提出時の基準と中身が違う図 (基準の無い新しい図も含む。
  //  提出したことが無い図は「新しく渡すもの」なので差し替え対象に入る)。
  function matches(item, mode) {
    if (!item) return false;
    switch (normalizeMode(mode)) {
      case 'changed': return !!item.changed;
      case 'fix': return item.fix > 0;
      case 'since': return !!item.sinceChanged;
      default: return true;
    }
  }

  // applyMode(list, mode) — 絞り込みに合う図だけを選択状態にした新しい配列を返す。
  // 元の配列は書き換えない (絞り込みを外したら手で外したチェックも含めて
  //  やり直しになるが、ここは「選び直す」操作なのでそれでよい)。
  function applyMode(list, mode) {
    var m = normalizeMode(mode);
    return (Array.isArray(list) ? list : []).map(function(it) {
      var copy = {};
      for (var k in it) { if (Object.prototype.hasOwnProperty.call(it, k)) copy[k] = it[k]; }
      copy.selected = matches(it, m);
      return copy;
    });
  }

  // setSelected(list, id, on) — 1 行のチェックだけを差し替える (絞り込みの後の微調整)。
  function setSelected(list, id, on) {
    return (Array.isArray(list) ? list : []).map(function(it) {
      var copy = {};
      for (var k in it) { if (Object.prototype.hasOwnProperty.call(it, k)) copy[k] = it[k]; }
      if (copy.id === id) copy.selected = !!on;
      return copy;
    });
  }

  // selectedDocs(list) — bulkExport.run にそのまま渡せる形。
  function selectedDocs(list) {
    return (Array.isArray(list) ? list : []).filter(function(it) { return it && it.selected; })
      .map(function(it) { return { id: it.id, name: it.name, dsl: it.dsl, diagramType: it.diagramType }; });
  }

  function counts(list) {
    var out = { total: 0, selected: 0, changed: 0, fix: 0, sinceChanged: 0 };
    (Array.isArray(list) ? list : []).forEach(function(it) {
      if (!it) return;
      out.total++;
      if (it.selected) out.selected++;
      if (it.changed) out.changed++;
      if (it.sinceChanged) out.sinceChanged++;
      if (it.fix > 0) out.fix++;
    });
    return out;
  }

  // countText(list, mode) — 保存ボタンの脇に出す 1 行。「何枚を提出用に詰めるのか」が
  // 分かればよいので、絞り込みの名前と選択件数だけを出す。
  function countText(list, mode) {
    var c = counts(list);
    var label = MODE_LABEL[normalizeMode(mode)];
    if (c.total === 0) return '書き出せる図がありません';
    if (c.selected === 0) return label + '：該当なし（0 / ' + c.total + ' 枚）';
    return label + '：' + c.selected + ' / ' + c.total + ' 枚を zip に詰めます';
  }

  // rowLabel(item) — 一覧の 1 行の見出し。印と変更の有無を同じ行で見せる。
  function rowLabel(item) {
    if (!item) return '';
    var marks = [];
    if (item.status === 'new') marks.push('新規');
    else if (item.status === 'changed') marks.push('変更あり');
    if (item.fix > 0) marks.push('要修正 ' + item.fix);
    return marks.length ? (item.name + '（' + marks.join(' ・ ') + '）') : item.name;
  }

  // menuLabel(list, mode) — Export メニューに直接置く 1 行。
  //
  // BLK-primary-20260908-1903-friction: 「指摘で名指しされた数枚だけ」を出すのに
  // 図を 1 枚ずつ開いて Export する (図の数だけ 3 クリック) か、全部詰めるかの
  // 二択になっていた。絞り込みの画面は既にあるが、Export メニューからは
  // 「全部」しか見えないので指摘対応の場面で見つからない。何枚該当するのかを
  // 名前に出して、メニューから 1 押しでその枚数だけ出せるようにする。
  function menuLabel(list, mode) {
    var m = normalizeMode(mode);
    var n = 0;
    (Array.isArray(list) ? list : []).forEach(function(it) { if (matches(it, m)) n++; });
    if (n === 0) return MODE_LABEL[m] + 'はありません';
    return MODE_LABEL[m] + ' ' + n + ' 枚をSVGで保存（zip）';
  }

  // pickedByMode(list, mode) — 絞り込みに合う図だけを bulkExport に渡せる形で返す。
  function pickedByMode(list, mode) {
    return selectedDocs(applyMode(list, mode));
  }

  return {
    menuLabel: menuLabel,
    pickedByMode: pickedByMode,
    MODES: MODES,
    MODE_LABEL: MODE_LABEL,
    normalizeMode: normalizeMode,
    buildList: buildList,
    matches: matches,
    applyMode: applyMode,
    setSelected: setSelected,
    selectedDocs: selectedDocs,
    counts: counts,
    countText: countText,
    rowLabel: rowLabel,
  };
})();
