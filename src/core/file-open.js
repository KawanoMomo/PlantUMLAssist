'use strict';
window.MA = window.MA || {};

// file-open — 手元の .puml を開く (BLK-human-20260917-0901)。
//
// 「どこから開くのか分からない」「ドラッグで開けない」「開いたら崩れた」を 1 か所で扱う。
//   - 開ける拡張子の判定 (.puml / .plantuml / .uml / .txt)
//   - バイト列の読み: UTF-8 (BOM あり / なし) と Shift_JIS、改行 (CRLF / LF) を覚える
//   - 書き戻し: 覚えた改行・BOM に戻す (Shift_JIS のバイト化は server が行う)
//   - 未対応記法の行の一覧と、図の中身を 1 文字も含まない「骨格」の報告文
// DOM には触らない純関数だけ。
window.MA.fileOpen = (function() {
  var EXTS = ['puml', 'plantuml', 'uml', 'txt'];

  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function isOpenable(name) {
    return EXTS.indexOf(extOf(name)) >= 0;
  }

  // タブの名前。拡張子とフォルダを落とす。
  function baseName(name) {
    var s = String(name || '').replace(/^.*[\\\/]/, '');
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // ── 文字コードと改行 ─────────────────────────────────────────────────
  function detectEol(text) {
    var t = String(text || '');
    var crlf = (t.match(/\r\n/g) || []).length;
    var lf = (t.match(/\n/g) || []).length - crlf;
    return crlf > 0 && crlf >= lf ? 'crlf' : 'lf';
  }

  // bytes: Uint8Array。decoderFor(label, fatal) は TextDecoder を返す (差し替え可)。
  function decode(bytes, decoderFor) {
    var mk = decoderFor || function(label, fatal) { return new TextDecoder(label, { fatal: !!fatal }); };
    var b = bytes || new Uint8Array(0);
    var bom = b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
    var raw;
    var encoding = 'utf-8';
    if (bom) {
      raw = mk('utf-8', false).decode(b.subarray(3));
    } else {
      try {
        raw = mk('utf-8', true).decode(b);
      } catch (e) {
        encoding = 'shift_jis';
        raw = mk('shift_jis', false).decode(b);
      }
    }
    var eol = detectEol(raw);
    return { text: raw.replace(/\r\n/g, '\n'), encoding: encoding, bom: bom, eol: eol };
  }

  // エディタの本文 (LF) を、開いたときの改行・BOM に戻した文字列にする。
  function restoreText(text, meta) {
    var m = meta || {};
    var t = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    if (m.eol === 'crlf') t = t.replace(/\n/g, '\r\n');
    return t;
  }

  // server の /native-write に渡す形。
  function writeBody(path, text, meta) {
    var m = meta || {};
    return {
      path: String(path || ''),
      text: restoreText(text, m),
      encoding: m.encoding === 'shift_jis' ? 'shift_jis' : 'utf-8',
      bom: !!m.bom,
    };
  }

  // 落とされた / 選ばれたファイルを「開くもの」と「開かないもの」に分ける。
  function partition(files) {
    var ok = [];
    var skipped = [];
    (files || []).forEach(function(f) {
      if (f && isOpenable(f.name)) ok.push(f);
      else if (f) skipped.push(f.name);
    });
    return { ok: ok, skipped: skipped };
  }

  // ── 未対応記法 ───────────────────────────────────────────────────────
  var COMMON = [
    /^$/, /^'/, /^\/'/, /^@(start|end)\w*/i, /^!/, /^skinparam\b/i, /^(title|header|footer|caption|legend|endlegend|end\s*(legend|title|header|footer))\b/i,
    /^(hide|show|scale|newpage|left to right direction|top to bottom direction|allow_mixing|set\s+separator|together)\b/i,
    /^(note|rnote|hnote)\b/i, /^end\s*note\b/i, /^[{}]\s*$/, /^(package|namespace|rectangle|frame|folder|node|cloud|database|box)\b/i,
    /^end\s*box\b/i, /^<style>/i, /^<\/style>/i,
  ];
  // 半矢印 (`-\` `-/` `\-` `/-`) も矢印 (BLK-migrator-20260925-1600)。
  var ARROW = /(<\|?|<<?|\*|\bo|#|\+|\^|\bx)?(-+|\.{2,}|=+)(\[[^\]]*\])?(up|down|left|right|u|d|l|r)?(-*|\.*)(\|?>|>>?|\*|o\b|#|\+|\^|x\b|\\\\?|\/\/?)|(<\|?|<<?|\*|o|#|\+|x|\\\\?|\/\/?)(-+|\.{2,})|--|\.\./i;

  var KIND = {
    'plantuml-sequence': [
      /^(participant|actor|boundary|control|entity|database|collections|queue)\b/i,
      /^(alt|else|opt|loop|par|par2|break|critical|group|end|activate|deactivate|destroy|create|return|autonumber|ref|autoactivate|mainframe)\b/i,
      /^==.*==$/, /^\.\.\.(.*\.\.\.)?$/, /^\|\|\|$/, /^\|\|\d+\|\|$/, /^delay\b/i,
    ],
    'plantuml-class': [
      /^(abstract\s+class|abstract|class|interface|enum|annotation|entity|struct|protocol|exception|metaclass|stereotype|dataclass|record)\b/i,
      /^(remove|restore)\b/i,
    ],
    'plantuml-activity': [
      /^(start|stop|end|kill|detach|else|elseif|endif|while|endwhile|repeat|backward|fork|end\s*fork|split|end\s*split|partition|switch|case|endswitch|break|goto|label)\b/i,
      /^if\s*\(/i, /^:/, /^\|[^|]*\|/, /;$/, /^\}/, /^floating\s+note\b/i,
    ],
    'plantuml-state': [
      /^state\b/i, /^\[\*\]/, /^--+$/, /^\|\|$/, /^[\w"．.]+\s*:/,
    ],
    'plantuml-usecase': [
      /^(actor|usecase|business)\b/i, /^\(/, /^:[^:]+:/,
    ],
    'plantuml-component': [
      /^(component|interface|port|portin|portout|artifact|storage|file|queue|stack|agent|boundary|card|hexagon|label)\b/i,
      /^\[/, /^\(\)/,
    ],
  };

  // 行が今の図種で読める記法か。
  function isSupportedLine(line, kind) {
    var s = String(line || '').trim();
    var i;
    for (i = 0; i < COMMON.length; i++) if (COMMON[i].test(s)) return true;
    var pats = KIND[kind];
    if (!pats) return true;  // 図種が分からない図は判定しない (誤って並べない)
    for (i = 0; i < pats.length; i++) if (pats[i].test(s)) return true;
    if (ARROW.test(s)) return true;
    return false;
  }

  // BLK-migrator-20260925-1600: 複数行の構文はブロックとして読み飛ばし、中の行を 1 行ずつ判定しない。
  //   /' … '/、note … end note、legend、複数行の title / header / footer、ref over … end ref、
  //   skinparam { }、sprite { } / sprite <svg> … </svg>、<style> … </style>、
  //   !procedure / !function / !definelongmacro … !end…
  // 返す関数 skip(s) は、s (trim 済み) がブロックの頭・中・尻なら true。
  function blockSkipper() {
    var until = null;   // 閉じの行の正規表現 (これが来たら抜ける)
    var depth = 0;      // { } で閉じるブロックの深さ
    return function(s) {
      if (depth > 0) {
        if (/\{\s*$/.test(s)) depth++;
        if (/^\}/.test(s)) depth--;
        return true;
      }
      if (until) { if (until.test(s)) until = null; return true; }
      if (/^\/'/.test(s)) { if (!/'\/\s*$/.test(s.slice(2))) until = /'\/\s*$/; return true; }
      if (/^(note|rnote|hnote|legend|floating\s+note)\b/i.test(s) && !/:/.test(s)) {
        until = /^end\s*(note|legend|rnote|hnote)\b|^endlegend\b|^endnote\b/i; return true;
      }
      if (/^(title|header|footer)\s*$/i.test(s)) { until = /^end\s*(title|header|footer)\b/i; return true; }
      if (/^ref\s+over\b/i.test(s) && !/:/.test(s)) { until = /^end(\s*ref)?\b/i; return true; }
      if (/^skinparam\b[^{]*\{\s*$/i.test(s) || /^sprite\b[^{]*\{\s*$/i.test(s)) { depth = 1; return true; }
      if (/^sprite\b.*<svg\b/i.test(s) && !/<\/svg>\s*$/i.test(s)) { until = /<\/svg>\s*$/i; return true; }
      if (/^<style>/i.test(s) && !/<\/style>/i.test(s)) { until = /^<\/style>/i; return true; }
      if (/^!(unquoted\s+)?(procedure|function)\b/i.test(s)) { until = /^!end\s*(procedure|function)\b/i; return true; }
      if (/^!definelongmacro\b/i.test(s)) { until = /^!enddefinelongmacro\b/i; return true; }
      return false;
    };
  }

  // 未対応の行の一覧。複数行の note / legend / クラスの中身 / 複数行 Action は読み飛ばす。
  // BLK-migrator-20260925-1600: これは行ごとの推定。帯はこれ単独では出さない (bannerRows を通す)。
  function unsupported(text, kind) {
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var skip = blockSkipper();
    var braceDepth = 0;   // class / enum の { } の中はメンバ
    var inAction = false; // activity の複数行 :...;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!inAction && braceDepth === 0 && skip(s)) continue;
      if (inAction) { if (/[;|<>\]}]$/.test(s)) inAction = false; continue; }
      if (kind === 'plantuml-activity' && /^:/.test(s) && !/[;|<>\]}]$/.test(s)) { inAction = true; continue; }
      if (kind === 'plantuml-class' && braceDepth > 0) {
        if (/^\}/.test(s)) braceDepth--;
        else if (/\{\s*$/.test(s)) braceDepth++;
        continue;
      }
      if (!isSupportedLine(s, kind)) out.push({ line: i + 1, text: lines[i] });
      if (kind === 'plantuml-class' && /\{\s*$/.test(s)) braceDepth++;
    }
    return out;
  }

  // ── 帯の判定: エンジンが読めたか (BLK-migrator-20260925-1600) ─────────────
  // 行ごとの正規表現は PlantUML の文法を追い切れず、正しい図の 217 枚中 117 枚に帯を出していた。
  // 帯は PlantUML の答えで決める。
  //   engine = { state: 'ok' }                           エンジンが図 (エラー画でない SVG) を返した
  //          | { state: 'error', line, message, crashed, noStartEnd, causeLine }  エラー画 / 落ちた絵
  //          | null / { state: 'none' }                   まだ描いていない・エンジンに届かない → 帯を出さない
  // 返り値 [{ line, text, reason, cause: 'engine' | 'guess' | 'unclosed' }]。reason の無い行は返さない。

  var SEQ_GROUP_OPEN = /^(alt|opt|loop|par|par2|break|critical|group)\b/i;
  // 前処理 (手続き・マクロ・取り込み) は本文に見えない枠を作り・閉じるので、本文だけでは数えない。
  var PREPROC = /^!(include\w*|import|procedure|function|unquoted|define\w*|startsub|dynamic|foreach|while|if\w*)\b/i;

  // シーケンス図で end の来ない alt / opt / loop / par / break / critical / group。
  // PlantUML はこれを誤りにしない (1.2026.8 は図の終わりで閉じたものとして描き、後ろの行が全部その枠に入る。
  // 1.2026.3 は枠ごと黙って描かなかった)。どちらも書いた人の意図と違う図になるので、理由つきで知らせる。
  function unclosedBlocks(text, kind) {
    if (kind !== 'plantuml-sequence') return [];
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var skip = blockSkipper();
    var stack = [];
    var i;
    for (i = 0; i < lines.length; i++) if (PREPROC.test(lines[i].trim())) return [];
    for (i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s || s.charAt(0) === "'" || skip(s)) continue;
      if (SEQ_GROUP_OPEN.test(s)) { stack.push({ line: i + 1, text: lines[i], word: s.split(/\s+/)[0].toLowerCase() }); continue; }
      if (/^end\s*$/i.test(s) || /^end\s*'/.test(s)) { stack.pop(); continue; }
      if (/^@enduml\b/i.test(s)) break;
    }
    return stack;
  }

  function lineAt(lines, n) { return n >= 1 && n <= lines.length ? lines[n - 1] : ''; }

  function bannerRows(text, kind, engine) {
    var e = engine || {};
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var msg = String(e.message || '').trim();
    if (e.state === 'error') {
      if (e.line) {
        return [{ line: e.line, text: lineAt(lines, e.line), cause: 'engine', reason: 'エンジンのエラー 行 ' + e.line + ': ' + (msg || '読めません') }];
      }
      if (e.causeLine) {
        return [{ line: e.causeLine, text: lineAt(lines, e.causeLine), cause: 'engine', reason: 'エンジンが落ちました: ' + msg }];
      }
      if (e.noStartEnd) {
        var start = 0;
        var end = 0;
        lines.forEach(function(l, k) {
          if (!start && /^\s*@start\w+/i.test(l)) start = k + 1;
          if (/^\s*@end\w+/i.test(l)) end = k + 1;
        });
        if (start && !end) {
          return [{ line: start, text: lineAt(lines, start), cause: 'engine',
            reason: 'エンジンのエラー: ' + (msg || 'No valid @start/@end found') + ' — ' + start + ' 行目の ' + lines[start - 1].trim().split(/\s+/)[0] + ' を閉じる @enduml がありません' }];
        }
        return [];
      }
      // 行の分からないエラー (落ちた絵) のときだけ、行ごとの推定を補助に添える。
      return unsupported(text, kind).map(function(r) {
        return { line: r.line, text: r.text, cause: 'guess', reason: 'エンジンが落ちました (' + (msg || '行不明') + ')。行ごとの推定: ' + kindLabel(kind) + 'の記法に当たりません' };
      });
    }
    if (e.state === 'ok') {
      return unclosedBlocks(text, kind).map(function(b) {
        return { line: b.line, text: b.text, cause: 'unclosed', reason: 'エンジンは描きましたが、' + b.line + ' 行目の ' + b.word
          + ' を閉じる end がありません (PlantUML は図の終わりで閉じたものとして描くので、後ろの行もこの枠に入ります)' };
      });
    }
    return [];
  }

  // ── 報告用の骨格 ─────────────────────────────────────────────────────
  // 行頭に置かれたときだけ残す語 (記法の名前)。
  var LEAD = ('participant actor boundary control entity database collections queue alt else opt loop par break critical group end '
    + 'activate deactivate destroy create return autonumber ref class interface abstract enum annotation package namespace '
    + 'rectangle frame folder node cloud box note rnote hnote state usecase component port portin portout artifact storage '
    + 'start stop kill detach if elseif endif while endwhile repeat backward fork split partition switch case endswitch '
    + 'skinparam title header footer caption legend endlegend hide show scale newpage together left right top bottom '
    + 'direction mainframe delay label goto floating remove restore').split(' ');
  // 行の途中でも残す、記法の繋ぎの語。
  var LINK = ['as', 'over', 'of', 'on', 'is', 'end', 'note', 'box', 'extends', 'implements', 'then', 'up', 'down', 'left', 'right', 'to'];
  var MASK = '▢'; // ▢

  function skeleton(line) {
    var s = String(line || '').trim();
    if (!s) return '';
    // ':' より後ろ (メッセージ・ラベル・説明) は丸ごと伏せる。
    var tail = '';
    var colon = s.search(/\s:|:\s|:$/);
    if (colon >= 0 && !/^:/.test(s)) {
      tail = ' : ' + MASK;
      s = s.slice(0, colon);
    }
    var tokens = [];
    var re = /"[^"]*"|<<[^>]*>>|#[0-9A-Za-z_]+|[A-Za-z_-￿][\w-￿]*|\d+(\.\d+)?|\s+|./g;
    var m;
    var first = true;
    while ((m = re.exec(s))) {
      var t = m[0];
      if (/^\s+$/.test(t)) { tokens.push(' '); continue; }
      if (t.charAt(0) === '"') tokens.push(MASK);
      else if (t.slice(0, 2) === '<<') tokens.push('<<' + MASK + '>>');
      else if (t.charAt(0) === '#') tokens.push('#色'); // #色
      else if (/^[A-Za-z_-￿]/.test(t)) {
        var low = t.toLowerCase();
        if ((first && LEAD.indexOf(low) >= 0) || LINK.indexOf(low) >= 0) tokens.push(low);
        else tokens.push(MASK);
      } else if (/^\d/.test(t)) tokens.push(MASK);
      else if (/^[-.<>|*+=\[\](){},;:\/\\^~!?@&%$']$/.test(t)) tokens.push(t);
      else tokens.push(MASK);
      first = false;
    }
    var out = tokens.join('').replace(/\s+/g, ' ').trim();
    // 伏せ字が続いたら 1 つにまとめる (語の数から名前の長さを推させない)。
    out = out.replace(new RegExp(MASK + '(\\s*' + MASK + ')+', 'g'), MASK);
    return (out + tail).trim();
  }

  var KIND_LABEL = {
    'plantuml-sequence': 'シーケンス図', 'plantuml-class': 'クラス図', 'plantuml-activity': 'アクティビティ図',
    'plantuml-state': '状態遷移図', 'plantuml-usecase': 'ユースケース図', 'plantuml-component': 'コンポーネント図',
  };

  function kindLabel(kind) { return KIND_LABEL[kind] || '図種不明'; }

  // クリップボードに入れる報告文。ファイル名・本文を含めない。
  // rows を渡せばその行 (帯に出した行) を、無ければ行ごとの推定を並べる。
  function report(text, kind, rowsIn) {
    var total = String(text || '').replace(/\r\n/g, '\n').split('\n').length;
    var rows = rowsIn || unsupported(text, kind);
    var head = 'PlantUMLAssist 未対応記法の報告 (' + kindLabel(kind) + ' / 全 ' + total + ' 行 / 未対応 ' + rows.length + ' 行)';
    return [head].concat(rows.map(function(r) { return 'L' + r.line + ': ' + skeleton(r.text); })).join('\n');
  }

  // BLK-builder-20260924-1415-4 (design 7a / 9a): 空の画面の入口は図のすぐ下に流れで置く。
  // 図は transform: scale で拡大されるので、流れの上の高さ (等倍) と見た目の高さの差だけ
  // 入口を下へずらし、拡大しても図に重ねない。縮小のときは等倍の位置のまま (base だけ空ける)。
  function emptyHintGap(height, zoom, base) {
    var h = Number(height) || 0, z = Number(zoom) || 1, b = (base == null) ? 16 : Number(base) || 0;
    return Math.round(b + Math.max(0, h * (z - 1)));
  }

  return {
    EXTS: EXTS,
    extOf: extOf,
    isOpenable: isOpenable,
    baseName: baseName,
    detectEol: detectEol,
    decode: decode,
    restoreText: restoreText,
    writeBody: writeBody,
    partition: partition,
    isSupportedLine: isSupportedLine,
    unsupported: unsupported,
    unclosedBlocks: unclosedBlocks,
    bannerRows: bannerRows,
    skeleton: skeleton,
    kindLabel: kindLabel,
    report: report,
    emptyHintGap: emptyHintGap,
  };
})();
