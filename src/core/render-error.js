'use strict';
window.MA = window.MA || {};

// render-error: design 5a「描画エラーを図の上に重ねて表示」。
//
// PlantUML は文法エラーでも HTTP 200 + image/svg+xml を返す。中身は図ではなく
// 「黒地に緑文字 + 赤の Syntax Error?」という別の絵で、これをそのまま
// #preview-svg に流し込むと直前まで見えていた図が消える。
// 呼び出し側はここで拾って描画エラー扱いにし、直前の図を残したまま
// 帯 (#render-error-overlay) だけを重ねる。
window.MA.renderError = (function() {
  // エラー画の目印。3 つとも揃ったときだけエラーと判定する。
  // 図の中にたまたま「Syntax Error?」という文字列があっても誤検出しないよう、
  // PlantUML がエラー画にしか使わない配色 (#33FF02 の緑) を条件に加えている。
  var RED_TEXT_RE = /<text[^>]*fill="#FF0000"[^>]*>([\s\S]*?)<\/text>/i;
  var GREEN_MARK = 'fill="#33FF02"';
  // `[From string (line 3) ]` — 何行目で転んだか。
  var LINE_RE = /\[From string \(line (\d+)\)/;

  var ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };

  function decodeEntities(s) {
    if (!s) return '';
    return String(s)
      .replace(/&#160;/g, ' ')
      .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&lt;|&gt;|&quot;|&apos;|&amp;/g, function(m) { return ENTITIES[m]; })
      .trim();
  }

  // BLK-migrator-20260924-1432: PlantUML が描いている途中で自分が落ちた (例外) ときの絵は、
  // 文法エラーの配色 (緑・赤) を使わず、白地に黒文字で「An error has occured : <例外>」
  // 「PlantUML (版) has crashed.」と書く。これを図として流し込むと、見出しが Rendered のまま
  // エラーの文言が図の代わりに並ぶ (成功のふり)。両方の文が揃ったときだけ落ちた絵と見分ける。
  var CRASH_HEAD_RE = /<text[^>]*>\s*An error has occured\s*:?\s*([\s\S]*?)<\/text>/i;
  var CRASH_MARK_RE = /<text[^>]*>\s*PlantUML \(([^)<]*)\) has crashed\.?\s*<\/text>/i;

  function detectCrash(svgText) {
    var h = svgText.match(CRASH_HEAD_RE);
    if (!h) return null;
    var c = svgText.match(CRASH_MARK_RE);
    if (!c) return null;
    var cause = decodeEntities(h[1]);
    return {
      isError: true,
      crashed: true,
      message: 'PlantUML ' + c[1] + ' が描画の途中で落ちました' + (cause ? ' (' + cause + ')' : ''),
      line: null,
    };
  }

  // detect(svgText) → { isError, message, line }
  // isError が false のときは message / line は使わない。
  function detect(svgText) {
    var none = { isError: false, message: '', line: null };
    if (!svgText || typeof svgText !== 'string') return none;
    if (svgText.indexOf(GREEN_MARK) < 0) return detectCrash(svgText) || none;
    var m = svgText.match(RED_TEXT_RE);
    if (!m) return none;
    var message = decodeEntities(m[1]);
    if (!/error/i.test(message)) return none;
    var lm = svgText.match(LINE_RE);
    return {
      isError: true,
      message: message,
      line: lm ? parseInt(lm[1], 10) : null,
    };
  }

  // 帯に出す 1 行。何行目かが分かるときは行番号を先に置く。
  function describe(info) {
    if (!info || !info.isError) return '';
    if (info.line) return info.line + ' 行目: ' + info.message;
    return info.message;
  }

  return { detect: detect, describe: describe };
})();
