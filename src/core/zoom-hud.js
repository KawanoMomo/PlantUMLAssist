'use strict';
window.MA = window.MA || {};

// zoom-hud — キャンバス上に浮くズーム操作帯 (design 1a)。
//
// ズームは上部ツールバーに置かれていて、図を見ている視線の位置から遠い。
// design 1a はこれをプレビューの上に浮かせ、「図種 · 倍率」と − / % / + / Fit を
// 一箇所にまとめる。ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.zoomHud = (function() {
  // app.js の setZoom と同じ丸め・クランプ。ここを唯一の規約とし、HUD の表示と
  // 実際にかかる倍率が食い違わないようにする。
  var MIN = 0.1;
  var MAX = 5.0;
  var STEP = 0.1;

  function clampZoom(z) {
    var n = Number(z);
    if (!isFinite(n)) n = 1;
    return Math.max(MIN, Math.min(MAX, Math.round(n * 100) / 100));
  }

  function formatPercent(z) {
    return Math.round(clampZoom(z) * 100) + '%';
  }

  // − / + の押下 1 回ぶん。端では止まる (巻き戻らない)。
  function stepZoom(z, dir) {
    return clampZoom(clampZoom(z) + (dir > 0 ? STEP : -STEP));
  }

  function isMin(z) { return clampZoom(z) <= MIN; }
  function isMax(z) { return clampZoom(z) >= MAX; }

  // 帯の左端に出す「Sequence · 100%」。図種が不明なら倍率だけを出す。
  function hudLabel(diagramType, z) {
    var name = (window.MA.diagramRail && window.MA.diagramRail.labelFor)
      ? window.MA.diagramRail.labelFor(diagramType) : '';
    var pct = formatPercent(z);
    return name ? (name + ' · ' + pct) : pct;
  }

  // BLK-builder-20260926-1010-1: 帯はキャンバスの右上に浮くので、図の上端が帯の下端より上にあると
  // 図の右上 (header の文字・右端の参加者や部品の頭) が帯のボタンの下に隠れ、ホバーも押下も届かない。
  // 図を下げる量を返す: 図の上端 (下げる前) が帯の下端 + 余白より上ならその差、下なら 0。
  // 帯が出ていない (下端が数値でない・0 以下) ときも 0。
  function figureGap(hudBottom, figureTop, pad) {
    var hb = Number(hudBottom), ft = Number(figureTop);
    if (!isFinite(hb) || hb <= 0 || !isFinite(ft)) return 0;
    var need = hb + (pad == null ? 4 : Number(pad) || 0) - ft;
    return need > 0 ? Math.ceil(need) : 0;
  }

  function buildHudHtml(diagramType, z) {
    var esc = (window.MA.htmlUtils && window.MA.htmlUtils.escHtml)
      ? window.MA.htmlUtils.escHtml
      : function(s) { return String(s); };
    return '<span id="hud-label">' + esc(hudLabel(diagramType, z)) + '</span>'
      + '<button type="button" class="hud-btn" id="hud-zoom-out" title="縮小"'
      + (isMin(z) ? ' disabled' : '') + '>−</button>'
      + '<span id="hud-percent">' + esc(formatPercent(z)) + '</span>'
      + '<button type="button" class="hud-btn" id="hud-zoom-in" title="拡大"'
      + (isMax(z) ? ' disabled' : '') + '>＋</button>'
      + '<button type="button" class="hud-btn" id="hud-zoom-fit" title="幅に合わせる">Fit</button>';
  }

  return {
    MIN: MIN,
    MAX: MAX,
    STEP: STEP,
    clampZoom: clampZoom,
    formatPercent: formatPercent,
    stepZoom: stepZoom,
    isMin: isMin,
    isMax: isMax,
    hudLabel: hudLabel,
    buildHudHtml: buildHudHtml,
    figureGap: figureGap,
  };
})();
