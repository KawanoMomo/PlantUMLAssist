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

  // BLK-migrator-20260929-1051: DESCRIPTION (component / usecase / deployment をまとめた図種) の中の見分け。
  // 図種そのものは SVG が決め、DSL の語はこの中でどちらかを選ぶのにだけ使う。
  // DSL の判定が component / usecase のどちらかならそれ。それ以外 (class / sequence と読んだ・読めない) は
  // ユースケースそのものの印 (usecase 宣言・`(名前)`・矢印の先の `(名前)`・`as (名前)`) があれば usecase、無ければ component。
  // actor だけでは決めない (AWS・C4 の部品図も人物を actor で描く)。
  var USECASE_MARK_RE = /^\s*(usecase\b|\([^()*][^()]*\))|(-+>|<-+|\.+>|<\.+|--|\.\.)\s*\([^()*][^()]*\)|\bas\s+\([^()]+\)/m;
  function descriptionKind(dsl) {
    var PU = window.MA.parserUtils;
    var byDsl = null;
    try { byDsl = PU && PU.detectDiagramType ? PU.detectDiagramType(String(dsl || '')) : null; } catch (e) { byDsl = null; }
    if (byDsl === 'plantuml-component' || byDsl === 'plantuml-usecase') return byDsl;
    return USECASE_MARK_RE.test(String(dsl || '')) ? 'plantuml-usecase' : 'plantuml-component';
  }

  // 今の図種 current が SVG の図種 svgType と食い違っていれば、使うべき図種を返す。
  // 合っている・SVG が図種を言わない・このツールに無い図種 (timing / mindmap …) なら current のまま。
  // dsl を渡すと、DESCRIPTION の中の component / usecase を本文で選ぶ (渡さなければ component)。
  function reconcile(current, svgType, dsl) {
    var cands = MAP[String(svgType || '').toUpperCase()];
    if (!cands) return current || null;
    if (current && cands.indexOf(current) !== -1) return current;
    if (cands.length > 1 && typeof dsl === 'string') return descriptionKind(dsl);
    return cands[0];
  }

  return { of: of, reconcile: reconcile, descriptionKind: descriptionKind, MAP: MAP };
})();
