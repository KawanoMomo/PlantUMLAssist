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
  // エラー画の目印。3 つとも揃ったときだけエラーと判定する (緑の目印・赤字・出所の行か波線の行)。
  // 図の中にたまたま「Syntax Error?」という文字列があっても誤検出しないよう、
  // PlantUML がエラー画にしか使わない配色 (#33FF02 の緑) を条件に加えている。
  // BLK-human-20260925-1500: 1.2026.7 からは色を短く書く (赤は #F00)。どちらの書き方でも拾う。
  var RED_TEXT_RE = /<text[^>]*fill="#(?:FF0000|F00)"[^>]*>([\s\S]*?)<\/text>/i;
  var GREEN_MARK = 'fill="#33FF02"';
  // `[From string (line 3) ]` — 何行目で転んだか (jar に直接渡すと `[From x.puml (line 3) ]`)。
  var LINE_RE = /\[From [^\]]*?\(line (\d+)\)/;
  // BLK-migrator-20260926-1608 / BLK-owner-20260925-1932-1: 赤字の文言は「Syntax Error?」だけでなく
  // 「Illegal sequence arrow」「No such color」など error の語を含まないものもある。文言には依らず、
  // エラー画の形 (緑の目印・赤字に加え、`[From …]` の出所の行か波線の付いた行) で見分ける。
  var WHERE_RE = /\[From [^\]]*\]|text-decoration="wavy underline"/;
  var VERSION_RE = /<text[^>]*>\s*PlantUML (?:version )?([0-9][0-9A-Za-z.\-]*)/;
  var SOURCE_RE = /<text[^>]*text-decoration="wavy underline"[^>]*>([\s\S]*?)<\/text>/;
  var ASSUMED_RE = /Assumed diagram type:\s*([A-Za-z_]+)/;

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
  // 「PlantUML (版) has crashed.」と書く (1.2026.3 からは綴りが occurred。どちらも見分ける。BLK-builder-20260925-1052-4)。これを図として流し込むと、見出しが Rendered のまま
  // エラーの文言が図の代わりに並ぶ (成功のふり)。両方の文が揃ったときだけ落ちた絵と見分ける。
  var CRASH_HEAD_RE = /<text[^>]*>\s*An error has occurr?ed\s*:?\s*([\s\S]*?)<\/text>/i;
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
    if (!WHERE_RE.test(svgText)) return none;
    var message = decodeEntities(m[1]);
    var lm = svgText.match(LINE_RE);
    var info = {
      isError: true,
      message: message,
      line: lm ? parseInt(lm[1], 10) : null,
    };
    // BLK-migrator-20260925-0752: エラー画に書いてある版・波線の行・PlantUML が推測した図種。
    var vm = svgText.match(VERSION_RE);
    if (vm) info.version = vm[1];
    var sm = svgText.match(SOURCE_RE);
    if (sm) info.source = decodeEntities(sm[1]);
    var am = message.match(ASSUMED_RE);
    if (am) info.assumed = am[1].toLowerCase();
    return info;
  }

  // 帯に出す 1 行。server.py の describe_render_error と同じ文面。
  // 版が分かる文法エラーは「PlantUML {版} がこの行を読めません: N 行目 `行`」と、
  // 製品ではなく描画エンジンがその行を読めないことを先に言う (元の文言は括弧に残す)。
  function describe(info) {
    if (!info || !info.isError) return '';
    var head = info.line ? info.line + ' 行目: ' : '';
    if (info.crashed || !info.version) return head + info.message;
    var where = info.line ? info.line + ' 行目' : 'この行';
    var src = info.source ? ' `' + info.source + '`' : '';
    return 'PlantUML ' + info.version + ' がこの行を読めません: ' + where + src + ' (' + info.message + ')';
  }

  // PlantUML が推測した図種 (assumed) と、製品が本文から読んだ図種 (bodyType: 'plantuml-class' など) が
  // 食い違うときに帯へ足す 1 文。PlantUML がその行で図種を見失っただけで、本文の図種は変わらないことを言う。
  var KIND_LABEL = {
    sequence: 'シーケンス図', class: 'クラス図', usecase: 'ユースケース図', activity: 'アクティビティ図',
    state: '状態図', component: 'コンポーネント図', deployment: '配置図', object: 'オブジェクト図',
  };
  function kindNote(info, bodyType) {
    if (!info || !info.assumed || !bodyType) return '';
    var body = String(bodyType).replace(/^plantuml-/, '');
    if (!body || body === info.assumed) return '';
    var label = function(k) { return KIND_LABEL[k] || k; };
    return 'PlantUML はこの行で図種を見失い ' + label(info.assumed) + ' と推測しましたが、本文は ' + label(body) +
      ' として開いています。本文はそのまま直せ、何もせず保存しても書き換わりません (⚙ 設定 → レンダリングで別の版の plantuml.jar を入れると読めることがあります)';
  }

  // BLK-migrator-20260925-1332: smetana で描く state 図は、複合状態の最初の並行領域が空
  // (`state X {` の直後に `--` / `||`) だと PlantUML 1.2026.3 自身が IllegalArgumentException で落ちる
  // (1.2026.7 からは描けるが、同梱版を上げると sequence / state の SVG の形が変わる)。
  // 落ちた絵には行が書かれないので、本文からその区切りの行を探す。server.py の empty_first_regions と同じ規則。
  // 返り値 [{ line: 区切りの行 (1 始まり), sep: '--' | '||', openLine: `state X {` の行, name, indent }]
  var STATE_OPEN_RE = /^state\s+(?:"([^"]*)"\s+as\s+([^\s{<#]+)|([^\s{<#]+))[^{]*\{\s*$/;
  function emptyFirstRegions(text) {
    var out = [];
    var lines = String(text || '').split('\n');
    var stack = [];
    var inComment = false;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/\r$/, '');
      var t = raw.trim();
      if (inComment) { if (t.indexOf("'/") >= 0) inComment = false; continue; }
      if (t.indexOf("/'") === 0) { if (t.indexOf("'/", 2) < 0) inComment = true; continue; }
      if (!t || t.charAt(0) === "'") continue;
      var top = stack.length ? stack[stack.length - 1] : null;
      if (t === '--' || t === '||') {
        if (top && top.state && !top.sepSeen) {
          top.sepSeen = true;
          if (top.empty) {
            out.push({ line: i + 1, sep: t, openLine: top.openLine, name: top.name,
              indent: (raw.match(/^\s*/) || [''])[0] });
          }
        }
        continue;
      }
      if (t.charAt(0) === '}') { stack.pop(); continue; }
      if (top) top.empty = false;
      var m = t.match(STATE_OPEN_RE);
      if (m) {
        stack.push({ state: true, openLine: i + 1, name: m[1] || m[2] || m[3], empty: true, sepSeen: false });
      } else if (/\{\s*$/.test(t)) {
        stack.push({ state: false, empty: false, sepSeen: true });
      }
    }
    return out;
  }

  // 落ちた絵の帯に添える原因の 1 文 (「N 行目 `--` の前の並行領域が空です」)。無ければ ''。
  function crashCause(info, text) {
    if (!info || !info.crashed) return '';
    var r = emptyFirstRegions(text);
    if (!r.length) return '';
    return r[0].line + ' 行目 `' + r[0].sep + '` の前の並行領域が空です';
  }

  // BLK-migrator-20260925-1600: @enduml の無い本文に PlantUML は「No valid @start/@end found」の絵を返す。
  // 赤字を使わないので detect はエラーと見なさない (図として出す) が、帯の判定ではエンジンが読めなかった答えとして扱う。
  var NO_START_END_RE = /<text[^>]*>\s*(No valid @start\/@end found[^<]*)<\/text>/;
  function noStartEnd(svgText) {
    if (!svgText || typeof svgText !== 'string' || svgText.indexOf(GREEN_MARK) < 0) return null;
    var m = svgText.match(NO_START_END_RE);
    if (!m) return null;
    return { isError: true, noStartEnd: true, message: decodeEntities(m[1]), line: null };
  }

  return { detect: detect, describe: describe, kindNote: kindNote,
    emptyFirstRegions: emptyFirstRegions, crashCause: crashCause, noStartEnd: noStartEnd };
})();
