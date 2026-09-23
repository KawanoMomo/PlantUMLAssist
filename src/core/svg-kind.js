'use strict';
window.MA = window.MA || {};

// svg-kind — PlantUML が描いた SVG の図種で、DSL から当てた図種を正す。
//
// BLK-migrator-20260924-0637: `!include` した手続き (`WorkDocs(...)` / `SimpleStorageService(...)` など) は
// 中身が `rectangle ... as alias` なのに、DSL に見えるのは `actor` と `-->` だけなので、DSL の判定は
// シーケンス図と読み、選択枠が 1 つも出なかった (「⚠ Overlay マッチング失敗」)。手続きの中身は展開して
// 読まない。PlantUML は描いた図種を <svg data-diagram-type="…"> に残すので、描画のあとでそれに合わせる。
window.MA.svgKind = (function() {
  // PlantUML の図種 → このツールの図種。DESCRIPTION は component / usecase / deployment をまとめた名前。
  var MAP = {
    SEQUENCE: ['plantuml-sequence'],
    CLASS: ['plantuml-class'],
    STATE: ['plantuml-state'],
    ACTIVITY: ['plantuml-activity'],
    DESCRIPTION: ['plantuml-component', 'plantuml-usecase'],
  };

  // <svg> (または SVG の文字列) から PlantUML の図種を読む。無ければ ''。
  function of(svg) {
    if (!svg) return '';
    var v = '';
    if (typeof svg === 'string') {
      var m = svg.match(/<svg\b[^>]*\sdata-diagram-type="([^"]*)"/);
      v = m ? m[1] : '';
    } else if (svg.getAttribute) {
      v = svg.getAttribute('data-diagram-type') || '';
    }
    return String(v).toUpperCase();
  }

  // 今の図種 current が SVG の図種 svgType と食い違っていれば、使うべき図種を返す。
  // 合っている・SVG が図種を言わない・このツールに無い図種 (timing / mindmap …) なら current のまま。
  function reconcile(current, svgType) {
    var cands = MAP[String(svgType || '').toUpperCase()];
    if (!cands) return current || null;
    if (current && cands.indexOf(current) !== -1) return current;
    return cands[0];
  }

  return { of: of, reconcile: reconcile, MAP: MAP };
})();
