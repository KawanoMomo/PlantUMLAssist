// scaffold-notice — まとめて追加系フォームの「止める / 知らせる」の出し分け。
//
// BLK-human-20260923-1330: PlantUML として正当な入力を GUI が拒まないようにするため、
// validate は errors (本当に生成できない) と warnings (生成はできるが意図を確かめたい) を返す。
// ここは、その 2 つを同じ見た目で出すための 1 か所。errors は赤、warnings は橙の ⚠ で出し、
// 確定ボタンの可否は errors だけで決まる (呼び手は v.ok をそのまま使う)。
(function() {
  'use strict';
  window.MA = window.MA || {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // validate の返り値をそのまま渡す。warnings を持たない古い返り値でも落ちない。
  function html(v) {
    var res = v || {};
    var errors = res.errors || [];
    var warnings = res.warnings || [];
    var parts = [];
    if (errors.length) {
      parts.push('<span class="scaffold-error" style="color:var(--accent-red);">'
        + esc(errors.join(' / ')) + '</span>');
    }
    if (warnings.length) {
      parts.push('<span class="scaffold-warn" style="color:var(--accent-orange);">⚠ '
        + esc(warnings.join(' / ')) + '</span>');
    }
    return parts.join('<br>');
  }

  window.MA.scaffoldNotice = { html: html };
})();
