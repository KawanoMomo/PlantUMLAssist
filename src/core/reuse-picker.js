'use strict';
window.MA = window.MA || {};

// reuse-picker — 既に描いた図の行を、別の図の一括入力欄へ持ち込む。
//
// 一括入力欄は「1 手で 10 件入る」ようにはしたが、入る中身は利用者が全部
// 打つ設計のままなので、要素が少し増えるだけで入力量が増え続ける。実際の
// 仕事は「先輩の図を真似て自分の図を作る」ことが多く、そこで打ち直している
// のは既にどこかの図にある行 (participant 宣言・矢印・アクション) である。
//
// ここでは開いている全部の図から「その図種の一括欄にそのまま書ける行」を
// 集め、重複を落として候補として返す。選んだ候補を行のかたまりに組み直す
// ところまでが担当で、DOM には触らない。
window.MA.reusePicker = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // 図種ごとに「一括欄が受け付ける行」だけを拾う。構造行 (alt/end)、
  // @startuml、コメント、設定行は持ち込んでも意味が無いので落とす。
  var PICKABLE = {
    'plantuml-sequence': ['decl', 'arrow'],
    'plantuml-state': ['decl', 'arrow'],
    'plantuml-component': ['decl', 'arrow'],
    'plantuml-usecase': ['decl', 'arrow'],
    'plantuml-class': ['decl', 'arrow'],
    'plantuml-activity': ['action'],
  };

  // アクティビティ図の一括欄は「1 行 1 アクション」でラベルだけを書く欄なので、
  // `:ラベル;` から中身だけを取り出す。
  function _actionLabel(line) {
    var m = _s(line).trim().match(/^:(.*);$/);
    return m ? m[1].trim() : null;
  }

  function kindOfLine(diagramType, line) {
    var t = _s(line).trim();
    if (!t) return null;
    if (diagramType === 'plantuml-activity') {
      var label = _actionLabel(t);
      return label ? 'action' : null;
    }
    var k = window.MA.lineEdit.kindOf(t);
    var allowed = PICKABLE[diagramType] || ['decl', 'arrow'];
    return allowed.indexOf(k) >= 0 ? k : null;
  }

  // 一括欄に貼れる形にした 1 行。activity はラベルだけ、他は行そのまま。
  function lineFor(diagramType, line) {
    if (diagramType === 'plantuml-activity') return _actionLabel(line);
    return _s(line).trim();
  }

  // docs: workspace.list() が返す [{ id, name, diagramType, dsl }]。
  // diagramType が同じ図だけを見る (シーケンスの行を state 図へは持ち込めない)。
  // exceptId は「いま編集している図」で、自分自身は候補にしない。
  function collect(docs, diagramType, exceptId) {
    var out = [];
    var seen = {};
    (docs || []).forEach(function(d) {
      if (!d || d.diagramType !== diagramType) return;
      if (exceptId != null && d.id === exceptId) return;
      _s(d.dsl).split('\n').forEach(function(raw) {
        var kind = kindOfLine(diagramType, raw);
        if (!kind) return;
        var text = lineFor(diagramType, raw);
        if (!text || seen[text]) return;
        seen[text] = true;
        out.push({ text: text, kind: kind, from: _s(d.name) });
      });
    });
    return out;
  }

  // 宣言を先に、矢印を後に並べる。一括欄はこの順で読むのが自然で、
  // 貼ったあと並べ替える手間が要らない。
  function toBlock(items) {
    var decl = [], rest = [];
    (items || []).forEach(function(it) {
      if (!it || !it.text) return;
      (it.kind === 'decl' ? decl : rest).push(it.text);
    });
    return decl.concat(rest).join('\n');
  }

  // 既にある入力に足す。空行だけの欄なら置き換える。重複行は入れない。
  function appendTo(current, block) {
    var cur = _s(current).replace(/\s+$/, '');
    if (!_s(block).trim()) return cur;
    if (!cur.trim()) return block;
    var have = {};
    cur.split('\n').forEach(function(l) { have[l.trim()] = true; });
    var add = block.split('\n').filter(function(l) { return !have[l.trim()]; });
    return add.length === 0 ? cur : cur + '\n' + add.join('\n');
  }

  return {
    kindOfLine: kindOfLine,
    lineFor: lineFor,
    collect: collect,
    toBlock: toBlock,
    appendTo: appendTo,
  };
})();
