'use strict';
// relation-options: design 3c「関係のその他の設定」。
//
// UseCase / Component / Class の 3 図種は、関係行の書き方 (左 [多重度] 矢印 [多重度] 右 : ラベル)
// が共通なので、向き入替 / 矢印なし / 多重度 / 線の色 / 線へのノートの判断はここに 1 つだけ置く。
// すべて「行の文字列を受け取って行の文字列を返す」純関数で、図種のパーサには依存しない。
// 関係行として読めない行を渡されたら、どの関数も入力をそのまま返す (壊さない)。
window.MA = window.MA || {};
window.MA.relationOptions = (function() {

  // 矢印トークン: 先頭の飾り + 線 (- または .、途中に [#色]) + 末尾の飾り。
  // 例: --> / <|-- / ..> / *-- / o--> / -[#red]> / <|.. / --
  // BLK-migrator-20260918-0249: 線の途中には置き方の指示 (up/down/left/right、
  // 1 文字の u/d/l/r) も書ける (`-up->` `-[#red]right->`)。これを読めないと
  // 方向を付けた行がまるごと関係行でなくなり、選択枠も出なくなる。
  var _DIR = (window.MA.regexParts && window.MA.regexParts.ARROW_DIRECTION)
    || '(?:up|down|left|right|u|d|l|r)';
  var ARROW_RE = new RegExp(
    '^([<>|*o+^]{0,2})((?:-|\\.){1,2}(?:\\[#[^\\]\\s]+\\])?' + _DIR + '?(?:\\[#[^\\]\\s]+\\])?(?:-|\\.){0,2})([<>|*o+^]{0,2})$'
  );
  var MULT_RE = /^"[^"]*"$/;

  function isArrow(tok) {
    if (!tok) return false;
    var m = tok.match(ARROW_RE);
    if (!m) return false;
    return /[-.]/.test(m[2]);
  }

  // parseLine: 関係行を部品に分ける。関係行でなければ null。
  // { indent, left, leftMult, arrow, rightMult, right, label }
  // 多重度は引用符ごと ('"1"') 保持せず中身だけを持つ (無ければ '')。
  function parseLine(line) {
    if (typeof line !== 'string') return null;
    var indent = line.match(/^(\s*)/)[1];
    var body = line.slice(indent.length);
    if (!body || /^[@'!]/.test(body)) return null;

    var label = '';
    var colon = _labelColonIndex(body);
    if (colon >= 0) {
      label = body.slice(colon + 1).trim();
      body = body.slice(0, colon);
    }
    var toks = body.trim().split(/\s+/).filter(function(t) { return t.length > 0; });
    var at = -1;
    for (var i = 0; i < toks.length; i++) {
      if (isArrow(toks[i])) { at = i; break; }
    }
    if (at < 1 || at > 2 || at === toks.length - 1) return null;

    var lefts = toks.slice(0, at);
    var rights = toks.slice(at + 1);
    if (lefts.length > 2 || rights.length > 2) return null;
    if (lefts.length === 2 && !MULT_RE.test(lefts[1])) return null;
    if (rights.length === 2 && !MULT_RE.test(rights[0])) return null;

    return {
      indent: indent,
      left: lefts[0],
      leftMult: lefts.length === 2 ? lefts[1].slice(1, -1) : '',
      arrow: toks[at],
      rightMult: rights.length === 2 ? rights[0].slice(1, -1) : '',
      right: rights[rights.length - 1],
      label: label,
    };
  }

  // ラベル区切りの `:` は、引用名やステレオタイプの中の `:` と区別する。
  function _labelColonIndex(body) {
    var inQuote = false;
    for (var i = 0; i < body.length; i++) {
      var c = body.charAt(i);
      if (c === '"') inQuote = !inQuote;
      else if (c === ':' && !inQuote) return i;
    }
    return -1;
  }

  function formatLine(p) {
    var s = p.indent + p.left;
    if (p.leftMult) s += ' "' + p.leftMult + '"';
    s += ' ' + p.arrow;
    if (p.rightMult) s += ' "' + p.rightMult + '"';
    s += ' ' + p.right;
    if (p.label) s += ' : ' + p.label;
    return s;
  }

  // ─── 向き / Direction ──────────────────────────────────────────────────
  // 矢の先 (<, >, |) だけを動かす。集約・合成の菱形 (*, o) は元の側に残す。
  function _splitArrow(arrow) {
    var m = arrow.match(ARROW_RE);
    if (!m) return null;
    return { lead: m[1], body: m[2], tail: m[3] };
  }
  function _heads(s) { return s.replace(/[^<>|]/g, ''); }
  function _deco(s) { return s.replace(/[<>|]/g, ''); }

  function direction(line) {
    var p = parseLine(line);
    if (!p) return null;
    return _directionOfArrow(p.arrow);
  }
  function _directionOfArrow(arrow) {
    var a = _splitArrow(arrow);
    if (!a) return null;
    if (_heads(a.tail)) return 'forward';
    if (_heads(a.lead)) return 'backward';
    return 'none';
  }

  function _headForm(heads) {
    // '<|' / '|>' は継承の三角、'<' / '>' は普通の矢。
    return /\|/.test(heads) ? 'tri' : (heads ? 'plain' : '');
  }

  function setDirection(line, dir) {
    var p = parseLine(line);
    if (!p) return line;
    var a = _splitArrow(p.arrow);
    if (!a) return line;
    var form = _headForm(_heads(a.lead) + _heads(a.tail));
    if (!form && dir !== 'none') form = 'plain';
    var lead = _deco(a.lead), tail = _deco(a.tail);
    if (dir === 'forward') tail = tail + (form === 'tri' ? '|>' : form ? '>' : '');
    else if (dir === 'backward') lead = (form === 'tri' ? '<|' : form ? '<' : '') + lead;
    else if (dir !== 'none') return line;
    p.arrow = lead + a.body + tail;
    return formatLine(p);
  }

  // ─── 多重度 / Multiplicity ────────────────────────────────────────────
  function multiplicity(line) {
    var p = parseLine(line);
    if (!p) return null;
    return { left: p.leftMult, right: p.rightMult };
  }
  function setMultiplicity(line, left, right) {
    var p = parseLine(line);
    if (!p) return line;
    p.leftMult = (left || '').trim();
    p.rightMult = (right || '').trim();
    return formatLine(p);
  }

  // ─── 線の色 / Line color ──────────────────────────────────────────────
  // PlantUML は色を線の中に書く: `-[#red]>` / `-[#red]->`。
  var COLORS = [
    { value: '',       label: '既定',   swatch: '#111114' },
    { value: 'red',    label: '赤',     swatch: '#f87171' },
    { value: 'orange', label: '橙',     swatch: '#fbbf24' },
    { value: 'green',  label: '緑',     swatch: '#6ee7a8' },
    { value: 'blue',   label: '青',     swatch: '#38bdf8' },
    { value: 'violet', label: '紫',     swatch: '#a78bfa' },
  ];

  function lineColor(line) {
    var p = parseLine(line);
    if (!p) return null;
    var m = p.arrow.match(/\[#([^\]\s]+)\]/);
    return m ? m[1] : '';
  }

  function setLineColor(line, color) {
    var p = parseLine(line);
    if (!p) return line;
    var a = _splitArrow(p.arrow);
    if (!a) return line;
    var dashes = a.body.replace(/\[#[^\]\s]+\]/, '');
    var c = (color || '').trim().replace(/^#/, '');
    var body = c ? dashes.charAt(0) + '[#' + c + ']' + dashes.slice(1) : dashes;
    p.arrow = a.lead + body + a.tail;
    return formatLine(p);
  }

  // ─── この線にノートを添える ───────────────────────────────────────────
  // 関係行の直後の `note on link` ブロックを線のノートとして扱う。
  function _noteBlockAt(lines, idx) {
    var i = idx + 1;
    if (i >= lines.length) return null;
    if (!/^\s*note\s+(?:left\s+|right\s+|top\s+|bottom\s+)?on\s+link\s*$/.test(lines[i])) return null;
    for (var j = i + 1; j < lines.length; j++) {
      if (/^\s*end\s*note\s*$/.test(lines[j])) {
        return { start: i, end: j, text: lines.slice(i + 1, j).map(function(s) { return s.trim(); }).join('\n') };
      }
    }
    return null;
  }

  function noteAt(text, lineNum) {
    var lines = String(text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return null;
    if (!parseLine(lines[idx])) return null;
    var b = _noteBlockAt(lines, idx);
    return b ? b.text : null;
  }

  // setNoteAt: noteText が空 / null ならノートを外す。既にあれば中身を差し替える。
  function setNoteAt(text, lineNum, noteText) {
    var lines = String(text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    if (!parseLine(lines[idx])) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var b = _noteBlockAt(lines, idx);
    var body = (noteText == null ? '' : String(noteText)).trim();
    if (!body) {
      if (!b) return text;
      lines.splice(b.start, b.end - b.start + 1);
      return lines.join('\n');
    }
    var block = [indent + 'note on link']
      .concat(body.split('\n').map(function(s) { return indent + '  ' + s.trim(); }))
      .concat([indent + 'end note']);
    if (b) lines.splice(b.start, b.end - b.start + 1);
    lines.splice.apply(lines, [idx + 1, 0].concat(block));
    return lines.join('\n');
  }

  // ─── 図種パーサとの橋渡し ─────────────────────────────────────────────
  // 3 図種のパーサは「左 矢印 右 : ラベル」しか読まないので、多重度と線の色を
  // 剥がした形を渡してやる。関係行でなければ入力をそのまま返すので、
  // パーサ側は `RO.plainLine(trimmed).match(RELATION_RE)` と書けばよい。
  function plainLine(line) {
    var p = parseLine(line);
    if (!p) return line;
    var a = _splitArrow(p.arrow);
    if (!a) return line;
    p.arrow = a.lead + a.body.replace(/\[#[^\]\s]+\]/, '') + a.tail;
    p.leftMult = '';
    p.rightMult = '';
    p.indent = '';
    return formatLine(p);
  }

  // decorationsOf / applyDecorations: 種別やラベルを書き換えて行を作り直すとき、
  // 多重度と線の色を落とさないための持ち運び。
  function decorationsOf(line) {
    var p = parseLine(line);
    if (!p) return { leftMult: '', rightMult: '', color: '' };
    return { leftMult: p.leftMult, rightMult: p.rightMult, color: lineColor(line) || '' };
  }

  function applyDecorations(line, deco) {
    if (!deco) return line;
    var out = setMultiplicity(line, deco.leftMult, deco.rightMult);
    return setLineColor(out, deco.color);
  }

  // ─── 行番号を指定して当てる (図種モジュールからの入口) ─────────────────
  function _at(text, lineNum, fn) {
    var lines = String(text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var out = fn(lines[idx]);
    if (out === lines[idx]) return text;
    lines[idx] = out;
    return lines.join('\n');
  }

  function optionsAt(text, lineNum) {
    var lines = String(text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return null;
    var line = lines[idx];
    if (!parseLine(line)) return null;
    var mult = multiplicity(line);
    return {
      direction: direction(line),
      leftMult: mult.left,
      rightMult: mult.right,
      color: lineColor(line),
      note: noteAt(text, lineNum),
    };
  }

  return {
    parseLine: parseLine,
    formatLine: formatLine,
    isArrow: isArrow,
    direction: direction,
    setDirection: setDirection,
    multiplicity: multiplicity,
    setMultiplicity: setMultiplicity,
    lineColor: lineColor,
    setLineColor: setLineColor,
    COLORS: COLORS,
    plainLine: plainLine,
    decorationsOf: decorationsOf,
    applyDecorations: applyDecorations,
    noteAt: noteAt,
    setNoteAt: setNoteAt,
    optionsAt: optionsAt,
    setDirectionAt: function(text, n, dir) { return _at(text, n, function(l) { return setDirection(l, dir); }); },
    setMultiplicityAt: function(text, n, a, b) { return _at(text, n, function(l) { return setMultiplicity(l, a, b); }); },
    setLineColorAt: function(text, n, c) { return _at(text, n, function(l) { return setLineColor(l, c); }); },
  };
})();
