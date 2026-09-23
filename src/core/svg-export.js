'use strict';
window.MA = window.MA || {};

// svg-export — 画面の SVG を PNG に変換する前の下ごしらえと、失敗の名指し。
//
// BLK-junior-20260923-1409: Export ▾ →「PNG（透過背景）」が特定の 1 枚だけで
// 「SVG 読み込みエラー」になり、download が始まらなかった。
//
// 根っこは PlantUML が SVG の末尾に埋める処理命令
//   <?plantuml-src XL7TQXD1...?>
// (図の元 DSL を圧縮して持たせるもの)。この SVG を innerHTML で画面に入れると、
// HTML パーサは処理命令を知らないので **コメントノード** に化かす (bogus comment)。
// それを XMLSerializer で書き戻すと
//   <!--?plantuml-src XL7TQXD1...?-->
// になり、圧縮結果がたまたま `--` を含む図では「コメントの中の二重ハイフン」で
// XML として壊れる。data:image/svg+xml に食わせた Image は onerror になり、
// canvas に描けないので PNG が作れない。GPIO/UART/CAN などで通っていたのは、
// その図の圧縮結果に `--` が無かったからで、図の書き方の違いではない。
//
// 埋め込みの元 DSL は描画に一切関わらないので、書き出す前に落とす。
// 落とし方は文字列ではなくノードで行う (コメントの中身が `-->` を含むと
// 正規表現では切る位置を間違える)。
window.MA.svgExport = (function() {

  var COMMENT_NODE = 8;
  var PI_NODE = 7;

  // stripNonRendered(node) — コメントと処理命令を丸ごと落とす。
  // 描画に関わらないものだけを消すので、見た目は変わらない。
  // 返すのは渡されたノード自身 (呼ぶ側が clone を渡す)。
  function stripNonRendered(node) {
    if (!node || !node.childNodes) return node;
    var kids = [];
    for (var i = 0; i < node.childNodes.length; i++) kids.push(node.childNodes[i]);
    for (var j = 0; j < kids.length; j++) {
      var c = kids[j];
      if (c.nodeType === COMMENT_NODE || c.nodeType === PI_NODE) {
        if (c.parentNode) c.parentNode.removeChild(c);
      } else {
        stripNonRendered(c);
      }
    }
    return node;
  }

  // stripEmbeddedSourceText(text) — 文字列で持っている SVG (描画結果をそのまま
  // 受け取る一括書き出し) 向け。処理命令と、HTML を経由して化けたコメントの
  // どちらの形でも落とす。
  function stripEmbeddedSourceText(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/<\?plantuml-src[\s\S]*?\?>/g, '');
    s = s.replace(/<!--\?plantuml-src[\s\S]*?-->/g, '');
    return s;
  }

  // restoreEmbeddedSource(text) — 「SVG として保存」向け。
  // こちらは埋め込みの元 DSL を落としてはいけない (差分・レビュー・突き合わせが
  // 保存した svg からこれをほどいて相手を突き止める)。化けたコメントを
  // 元の処理命令 `<?plantuml-src …?>` に戻すと、XML として正しくなり、
  // 読む側 (server.py の正規表現は両方の形を受ける) もそのまま通る。
  function restoreEmbeddedSource(text) {
    var s = String(text == null ? '' : text);
    return s.replace(/<!--\?plantuml-src\s+([0-9A-Za-z_-]+)\s*\?-->/g,
      function(_, folded) { return '<?plantuml-src ' + folded + '?>'; });
  }

  // isBrokenComment(text) — XML として壊れるコメント (中に `--` がある) が
  // 残っていないか。残っていれば Image は必ず onerror になる。
  function isBrokenComment(text) {
    var s = String(text == null ? '' : text);
    var re = /<!--([\s\S]*?)-->/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      if (m[1].indexOf('--') !== -1) return true;
    }
    return false;
  }

  // reasonFor(text) — 読めなかったものを名指しする 1 行。
  // 「SVG 読み込みエラー」で終わらせないためのもの。
  function reasonFor(text) {
    var s = String(text == null ? '' : text);
    if (s.trim() === '') return '図がまだ描けていません（プレビューが空です）';
    if (isBrokenComment(s)) {
      return 'SVG の中のコメントに二重ハイフン (--) があり、XML として読めません'
        + '（PlantUML が埋め込んだ元 DSL のかけらです）';
    }
    if (s.indexOf('<?') !== -1) return 'SVG の中に処理命令 (<?...?>) が残っており、XML として読めません';
    if (s.indexOf('<svg') === -1) return 'プレビューに SVG がありません';
    return '';
  }

  // sizeOf(svgText) — width / height。px 付きでも読む。読めなければ既定値。
  function sizeOf(svgText, defW, defH) {
    var s = String(svgText == null ? '' : svgText);
    var mw = /<svg[^>]*\bwidth="([\d.]+)/.exec(s);
    var mh = /<svg[^>]*\bheight="([\d.]+)/.exec(s);
    var w = mw ? parseFloat(mw[1]) : NaN;
    var h = mh ? parseFloat(mh[1]) : NaN;
    if (!(w > 0)) w = defW > 0 ? defW : 800;
    if (!(h > 0)) h = defH > 0 ? defH : 400;
    return { w: w, h: h };
  }

  return {
    stripNonRendered: stripNonRendered,
    stripEmbeddedSourceText: stripEmbeddedSourceText,
    restoreEmbeddedSource: restoreEmbeddedSource,
    isBrokenComment: isBrokenComment,
    reasonFor: reasonFor,
    sizeOf: sizeOf,
  };
})();
