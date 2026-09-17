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
  var ARROW = /(<\|?|<<?|\*|\bo|#|\+|\^|\bx)?(-+|\.{2,}|=+)(\[[^\]]*\])?(up|down|left|right|u|d|l|r)?(-*|\.*)(\|?>|>>?|\*|o\b|#|\+|\^|x\b|\\\\|\/\/)|(<\|?|<<?|\*|o|#|\+|x)(-+|\.{2,})|--|\.\./i;

  var KIND = {
    'plantuml-sequence': [
      /^(participant|actor|boundary|control|entity|database|collections|queue)\b/i,
      /^(alt|else|opt|loop|par|par2|break|critical|group|end|activate|deactivate|destroy|create|return|autonumber|ref|autoactivate|mainframe)\b/i,
      /^==.*==$/, /^\.\.\.(.*\.\.\.)?$/, /^\|\|\d*\|\|$/, /^delay\b/i,
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

  // 未対応の行の一覧。複数行の note / legend / クラスの中身 / 複数行 Action は読み飛ばす。
  function unsupported(text, kind) {
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var inNote = false;
    var inBlockComment = false;
    var braceDepth = 0;   // class / enum の { } の中はメンバ
    var inAction = false; // activity の複数行 :...;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (inBlockComment) { if (/'\/\s*$/.test(s)) inBlockComment = false; continue; }
      if (/^\/'/.test(s) && !/'\/\s*$/.test(s)) { inBlockComment = true; continue; }
      if (inNote) { if (/^end\s*(note|legend)\b|^endlegend\b|^end\s*(title|header|footer)\b/i.test(s)) inNote = false; continue; }
      if (/^(note|rnote|hnote|legend|floating\s+note)\b/i.test(s) && !/:/.test(s)) { inNote = true; continue; }
      if (/^(title|header|footer)\s*$/i.test(s)) { inNote = true; continue; }
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
  function report(text, kind) {
    var total = String(text || '').replace(/\r\n/g, '\n').split('\n').length;
    var rows = unsupported(text, kind);
    var head = 'PlantUMLAssist 未対応記法の報告 (' + kindLabel(kind) + ' / 全 ' + total + ' 行 / 未対応 ' + rows.length + ' 行)';
    return [head].concat(rows.map(function(r) { return 'L' + r.line + ': ' + skeleton(r.text); })).join('\n');
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
    skeleton: skeleton,
    kindLabel: kindLabel,
    report: report,
  };
})();
