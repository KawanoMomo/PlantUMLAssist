'use strict';
window.MA = window.MA || {};

// part-focus — 相乗り図を 1 枚のまま、選んだ部品だけ浮かび上がらせる。
//
// BLK-junior-20260915-0506-wish: 先輩の `driver_common_class.puml` は
// SPI/CAN/GPIO/UART/TIMER/ADC/IRQCtrl が 1 枚に相乗りしており、新部品 (SPI) を
// 起こすとき手本にすべきクラスを自分で読み分けるしかなかった。切り出し
// (part-slice) は「その部品だけの別の 1 枚」を作るので、相乗り図のどこに自分の
// 部品が居て、どのクラスと線でつながっているのかという元の絵は失われる。
// 手順 1 で junior がしたいのは新しい図を作ることではなく、先輩の 1 枚を
// 「フィルタして眺める」ことなので、ここは絵をそのままにして色だけ落とす。
//
//   dim  … 関係しないクラス・関連線を淡色にする (位置関係が残る)
//   hide … 関係しない所を落とす (part-slice.slice をそのまま使う。
//           「何を関係とみなすか」の規則を 2 つ持たないため)
//
// 関係する範囲は part-slice と同じ「部品 + 継承の元 + 直接つながる相手 1 段」。
// DOM も fetch も触らない (DSL の組み替えだけ)。表示は app.js。
window.MA.partFocus = (function() {

  // 淡色。白地に薄く残る灰色 (消すのではなく「そこに在るが今は用がない」)。
  var DIM = '#DDDDDD';
  // 選んだ部品そのものの背景。1 枚の中で目が最初に行く所。
  var FOCUS = '#FFF3B0';

  var CLASS_RE = /^\s*(?:abstract\s+|static\s+)?(?:class|entity|interface|abstract)\s+([A-Za-z0-9_]+)/;
  var REL_RE = /^\s*([A-Za-z0-9_]+)\s*([-.|<>o*+#]{2,})\s*([A-Za-z0-9_]+)\s*(?::.*)?$/;

  function _s(v) { return v == null ? '' : String(v); }
  function _lines(dsl) { return _s(dsl).split(/\r?\n/); }
  function _ps() { return window.MA.partSlice; }

  function parts(dsl) {
    var PS = _ps();
    return PS ? PS.parts(dsl) : [];
  }

  function isComposite(dsl) {
    var PS = _ps();
    return !!(PS && PS.isComposite(dsl));
  }

  // ── 関係する範囲 ──────────────────────────────────────────────────────
  // part-slice の切り出しと同じ数え方 (部品 + 継承の元をたどれるだけ + 直接の相手)。
  function related(dsl, part) {
    var PS = _ps();
    if (!PS) return null;
    var target = PS.findPart(dsl, part);
    if (!target) return null;
    var cls = PS.classesOf(dsl);
    var rels = PS.relationsOf(dsl);

    var keep = {};
    keep[target.name] = true;
    var moved = true;
    while (moved) {
      moved = false;
      rels.forEach(function(r) {
        if (r.kind !== 'extends') return;
        if (keep[r.from] && !keep[r.to]) { keep[r.to] = true; moved = true; }
      });
    }
    rels.forEach(function(r) {
      if (r.kind === 'extends') return;
      if (r.from === target.name) keep[r.to] = true;
      if (r.to === target.name) keep[r.from] = true;
    });

    var kept = [], others = [];
    cls.forEach(function(c) { (keep[c.name] ? kept : others).push(c.name); });
    var relKept = [], relOthers = [];
    rels.forEach(function(r) {
      (keep[r.from] && keep[r.to] ? relKept : relOthers).push(r);
    });
    return {
      part: target, keep: keep, classes: cls, relations: rels,
      kept: kept, others: others, relKept: relKept, relOthers: relOthers,
    };
  }

  // ── 行の色分け ────────────────────────────────────────────────────────
  // 本文 (peek-dsl) の各行が、選んだ部品に関係するかどうか。
  // 'keep' = 関係する / 'dim' = 関係しない / '' = どちらでもない行 (@startuml 等)。
  function lineFlags(dsl, part) {
    var res = related(dsl, part);
    var out = _lines(dsl).map(function() { return ''; });
    if (!res) return out;
    res.classes.forEach(function(c) {
      var f = res.keep[c.name] ? 'keep' : 'dim';
      for (var i = c.start; i <= c.end; i++) out[i] = f;
    });
    res.relations.forEach(function(r) {
      out[r.line] = (res.keep[r.from] && res.keep[r.to]) ? 'keep' : 'dim';
    });
    return out;
  }

  // ── 淡色化 ────────────────────────────────────────────────────────────
  // クラス宣言の行に色を足す。既に色が付いていれば置き換える
  // (先輩の色をそのままにすると、淡くしたはずのクラスが浮いたままになる)。
  function _paint(line, color) {
    var brace = /\{\s*$/.test(line) ? ' {' : '';
    var body = line.replace(/\s*\{\s*$/, '').replace(/\s+#[^\s{]+/g, '');
    return body + ' ' + color + brace;
  }

  // 関連線に色を足す。`A --> B` → `A -[#DDDDDD]-> B`、
  // `Base <|-- Drv` → `Base <|-[#DDDDDD]- Drv`。
  // 色は線の部分 (`-` `.`) の中に入れる決まりなので、最初の線文字の直後に差す
  // (矢尻 `>` `|>` `*` の側に差すと PlantUML が線として読まない)。
  function _paintRel(line, color) {
    var m = line.match(REL_RE);
    if (!m) return line;
    var arrow = m[2];
    if (arrow.length < 2) return line;
    if (arrow.indexOf('[') >= 0) return line;
    var cut = arrow.search(/[-.]/);
    if (cut < 0) return line;
    var painted = arrow.slice(0, cut + 1) + '[' + color + ']' + arrow.slice(cut + 1);
    var at = line.indexOf(arrow);
    return line.slice(0, at) + painted + line.slice(at + arrow.length);
  }

  // mode: 'dim'(既定) / 'hide'。part が図に無ければ null。
  function focus(dsl, part, mode) {
    var res = related(dsl, part);
    if (!res) return null;
    var m = mode === 'hide' ? 'hide' : 'dim';
    if (m === 'hide') {
      var PS = _ps();
      var sliced = PS ? PS.slice(dsl, part) : null;
      if (!sliced) return null;
      return {
        mode: 'hide', dsl: sliced.dsl, part: res.part,
        kept: res.kept, others: res.others,
        relKept: res.relKept.length, relOthers: res.relOthers.length,
      };
    }
    var dimClass = {}, focusClass = {}, dimRel = {};
    res.classes.forEach(function(c) {
      if (c.name === res.part.name) focusClass[c.start] = true;
      else if (!res.keep[c.name]) dimClass[c.start] = true;
    });
    res.relOthers.forEach(function(r) { dimRel[r.line] = true; });

    var out = _lines(dsl).map(function(line, i) {
      if (focusClass[i]) return _paint(line, FOCUS);
      if (dimClass[i]) return _paint(line, DIM);
      if (dimRel[i]) return _paintRel(line, DIM);
      return line;
    });
    return {
      mode: 'dim', dsl: out.join('\n'), part: res.part,
      kept: res.kept, others: res.others,
      relKept: res.relKept.length, relOthers: res.relOthers.length,
    };
  }

  // 何が浮いて何が落ちたかを 1 行で言う (押した結果を数で確かめられるように)。
  function focusLabel(res) {
    if (!res) return '';
    var verb = res.mode === 'hide' ? '非表示' : '淡色';
    return res.part.name + ' に関係する ' + res.kept.length + ' クラス・'
      + res.relKept + ' 関連を残し、他の ' + res.others.length + ' クラス・'
      + res.relOthers + ' 関連を' + verb + 'にしました';
  }

  // フィルタを掛ける前に「この図には何部品が相乗りしているか」を言う。
  function compositeLabel(dsl) {
    var list = parts(dsl);
    if (list.length < 2) return '';
    return 'この図は ' + list.length + ' 部品の相乗りです。部品を押すと、その部品に関係するクラス・関連だけが浮かびます';
  }

  return {
    DIM: DIM,
    FOCUS: FOCUS,
    parts: parts,
    isComposite: isComposite,
    related: related,
    lineFlags: lineFlags,
    focus: focus,
    focusLabel: focusLabel,
    compositeLabel: compositeLabel,
  };
})();
