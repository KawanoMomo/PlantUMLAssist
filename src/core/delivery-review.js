'use strict';
window.MA = window.MA || {};

// delivery-review — 納品パッケージを出す前に「客に何を見せることになるか」を絵で見る。
//
// BLK-primary-20260908-1903-wish: 納品パッケージのモーダルが出すのは提出前チェックの
// 件数と差分の行数だけで、実際にどこが変わったかはタブを 1 枚ずつ切り替えて目で
// 見比べるしかなかった。行数は「変わった量」は言えるが「客の目に何が違って見えるか」は
// 言わない。前回提出時点の puml を描き直した SVG と、今の SVG を、
//   並べる (side)   — 左に前回・右に今
//   重ねる (overlay) — 前回を薄い色で下に敷き、今を上に重ねる
// の 2 通りで出し、増えた文字・消えた文字・図形の数の動きを添える。
//
// ここは判断と組み立てだけを持つ。描画 (render) と DOM は app.js の職掌。
window.MA.deliveryReview = (function() {

  function _list(v) { return Array.isArray(v) ? v : []; }

  function _str(v) { return String(v == null ? '' : v); }

  // ── SVG の中身を読む ──────────────────────────────────────────────────
  // DOM を使わず文字列のまま拾う。unit テストからも同じ関数を通す。

  var TEXT_RE = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  var TAG_RE = /<(path|polygon|line|rect|ellipse|circle|polyline|text)\b/g;

  function _unescape(s) {
    return _str(s)
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // SVG に実際に書かれている文字。並び順は描かれた順のまま残す
  // (同じ文字が 2 度出る図もあるので、ここでは重複を潰さない)。
  function labelsOf(svg) {
    var out = [];
    var s = _str(svg);
    var m;
    TEXT_RE.lastIndex = 0;
    while ((m = TEXT_RE.exec(s)) !== null) {
      var t = _unescape(m[1]).trim();
      if (t) out.push(t);
    }
    return out;
  }

  // 図形の数。文字が 1 つも変わらないまま構造だけ動いた差はここにしか出ない。
  function shapeOf(svg) {
    var counts = {};
    var s = _str(svg);
    var m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(s)) !== null) {
      counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    return counts;
  }

  // ── 差 ────────────────────────────────────────────────────────────────

  // 飾りや行番号は名指ししない (svg-diff-summary と同じ考え方)。
  function _ignorable(s) {
    var t = _str(s).trim();
    if (t.length < 2) return true;
    if (/^[\s0-9.,:;|()\[\]{}<>*+\-_=\/\\#"']+$/.test(t)) return true;
    return false;
  }

  function _bag(labels) {
    var b = {};
    _list(labels).forEach(function(s) {
      var t = _str(s).trim();
      if (!t) return;
      b[t] = (b[t] || 0) + 1;
    });
    return b;
  }

  var SHAPE_LABEL = {
    path: '線・曲線', polygon: '矢印の先端など', line: '直線', rect: '四角の枠',
    ellipse: '楕円', circle: '円', text: '文字', polyline: '折れ線',
  };

  function shapeLabel(tag) { return SHAPE_LABEL[tag] || tag; }

  function _shapeRows(before, after) {
    var o = before && typeof before === 'object' ? before : {};
    var n = after && typeof after === 'object' ? after : {};
    var tags = {};
    Object.keys(o).forEach(function(k) { tags[k] = true; });
    Object.keys(n).forEach(function(k) { tags[k] = true; });
    var rows = [];
    Object.keys(tags).sort().forEach(function(tag) {
      var was = o[tag] || 0, now = n[tag] || 0;
      if (was === now) return;
      rows.push({ tag: tag, label: shapeLabel(tag), was: was, now: now, delta: now - was });
    });
    return rows;
  }

  // 前回提出時点の SVG と今の SVG を突き合わせる。
  // before が null (初回提出・前回に入っていなかった図) なら kind: 'new'。
  function diff(beforeSvg, afterSvg) {
    var hasBefore = _str(beforeSvg) !== '';
    var hasAfter = _str(afterSvg) !== '';
    var bl = labelsOf(beforeSvg), al = labelsOf(afterSvg);
    var bb = _bag(bl), ab = _bag(al);
    var addedLabels = [], removedLabels = [], keptLabels = [];
    Object.keys(ab).forEach(function(t) {
      if (!bb[t]) { if (!_ignorable(t)) addedLabels.push(t); }
      else keptLabels.push(t);
    });
    Object.keys(bb).forEach(function(t) {
      if (!ab[t] && !_ignorable(t)) removedLabels.push(t);
    });
    addedLabels.sort();
    removedLabels.sort();
    var shape = _shapeRows(shapeOf(beforeSvg), shapeOf(afterSvg));
    var kind;
    if (!hasAfter) kind = 'unknown';
    else if (!hasBefore) kind = 'new';
    else if (addedLabels.length === 0 && removedLabels.length === 0 && shape.length === 0) kind = 'same';
    else kind = 'changed';
    return {
      kind: kind,
      added: addedLabels, removed: removedLabels,
      keptCount: keptLabels.length,
      shape: shape,
      beforeLabelCount: bl.length, afterLabelCount: al.length,
    };
  }

  // 1 行の言い方。モーダルにそのまま出す。
  function summaryLine(d) {
    if (!d) return '見比べていません';
    if (d.kind === 'unknown') return '今の図を描けませんでした（見比べられません）';
    if (d.kind === 'new') return '新規の図です（前回提出には入っていません）・文字 ' + d.afterLabelCount + ' 個';
    if (d.kind === 'same') return '前回提出と同じに見えます（文字・図形の数に差なし）';
    var parts = [];
    if (d.added.length) parts.push('増えた文字 ' + d.added.length + ' 個');
    if (d.removed.length) parts.push('消えた文字 ' + d.removed.length + ' 個');
    if (d.shape.length) {
      var n = 0;
      d.shape.forEach(function(r) { n += Math.abs(r.delta); });
      parts.push('図形の数 ' + n + ' か所');
    }
    return '見た目が変わっています — ' + parts.join(' ・ ');
  }

  // ── 見比べる対象 ────────────────────────────────────────────────────
  // change-board 由来の entries (name/status) から、見比べる価値のある順に並べる。
  // 変更 → 新規 → 変更なし。「何を客に見せることになるか」は変更から見る。
  var ORDER = { changed: 0, new: 1, same: 2 };

  function plan(entries) {
    var rows = [];
    _list(entries).forEach(function(e) {
      if (!e || !e.name) return;
      var st = _str(e.status) || 'same';
      rows.push({
        name: e.name, status: st, diagramType: e.diagramType || '',
        order: ORDER[st] == null ? 3 : ORDER[st],
      });
    });
    rows.sort(function(a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return rows;
  }

  // 「1 枚目に開く図」。変更のある図があればそれ、無ければ先頭。
  function firstOf(entries) {
    var rows = plan(entries);
    return rows.length ? rows[0].name : null;
  }

  // 見比べる前に出す見出し。何枚のうち何枚が変更かを、開いた瞬間に言う。
  function headline(entries) {
    var rows = plan(entries);
    var ch = rows.filter(function(r) { return r.status === 'changed'; }).length;
    var nw = rows.filter(function(r) { return r.status === 'new'; }).length;
    if (rows.length === 0) return '対象の図がありません';
    if (ch === 0 && nw === 0) return rows.length + ' 枚すべて前回提出から変わっていません';
    return rows.length + ' 枚のうち 変更 ' + ch + ' 枚 ・ 新規 ' + nw + ' 枚 を見比べます';
  }

  // ── 重ね表示 ──────────────────────────────────────────────────────────
  // 前回を薄い赤、今を通常色で重ねる。SVG そのものは触らず、包む側で色を作る
  // (PlantUML の SVG は色指定を持つので、filter で上から染める方が確実)。
  var BEFORE_FILTER = 'grayscale(1) sepia(1) saturate(6) hue-rotate(310deg) opacity(0.45)';

  function overlayCss() {
    return '.dr-stack{position:relative;}'
      + '.dr-stack .dr-before{position:absolute;left:0;top:0;filter:' + BEFORE_FILTER + ';pointer-events:none;}'
      + '.dr-stack .dr-after{position:relative;}'
      + '.dr-side{display:flex;gap:10px;align-items:flex-start;}'
      + '.dr-side>div{flex:1;min-width:0;overflow:auto;}';
  }

  // モード名の行き来。ボタン 1 つで往復させる。
  function toggleMode(mode) { return mode === 'overlay' ? 'side' : 'overlay'; }

  function modeLabel(mode) { return mode === 'overlay' ? '重ねて表示中' : '並べて表示中'; }

  return {
    labelsOf: labelsOf,
    shapeOf: shapeOf,
    shapeLabel: shapeLabel,
    diff: diff,
    summaryLine: summaryLine,
    plan: plan,
    firstOf: firstOf,
    headline: headline,
    overlayCss: overlayCss,
    toggleMode: toggleMode,
    modeLabel: modeLabel,
  };
})();
