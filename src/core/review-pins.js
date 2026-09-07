'use strict';
window.MA = window.MA || {};

// review-pins — レビューの指摘を「図の該当行」に貼り付けておく。
//
// BLK-reviewer-20260907-1203-wish: 指摘は毎回 `指摘.md` に文章で書き直され、読む側は
// 「どの図の何行目か」を自分で探し直していた。指摘が着手されたのか見落とされたのかも
// 区別が付かない。指摘を図の行そのものに結び付け、未読 / 既読 を持たせれば、
// 図を開いた時点で該当箇所が光り、既読の印で反映確認ができる。
//
// 保存先は DSL 自身 (PlantUML の行コメント)。正本はテキストであり、外部に別ファイルを
// 作ると図と指摘がすぐ離れてしまう。コメントなので描画には出ない。
//   ' @pin 1|open|reviewer|2026-09-07T12:03|Idle --> Busy : Timer_StartConv|対応する method が無い
// 行番号ではなく「その行の文字列」で結び付ける。上に行が増えても指摘は付いて回り、
// 指摘先の行が書き換わったときだけ迷子 (stale) として残る。
window.MA.reviewPins = (function() {

  var PREFIX = "' @pin ";

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  }

  // '|' で割る。ただし '\|' は中身の '|' なので割らない。
  function _splitFields(s) {
    var out = [], cur = '', i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\' && i + 1 < s.length) { cur += s.charAt(i + 1); i += 2; continue; }
      if (c === '|') { out.push(cur); cur = ''; i++; continue; }
      cur += c; i++;
    }
    out.push(cur);
    return out;
  }

  function isPinLine(line) {
    return String(line == null ? '' : line).trim().indexOf(PREFIX.trim()) === 0
      && String(line).trim().indexOf("' @pin") === 0;
  }

  function _lines(dsl) {
    return String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n').split('\n');
  }

  // 元の DSL の改行 (CRLF / LF) を保ったまま書き戻す。
  function _join(lines, dsl) {
    return lines.join(/\r\n/.test(String(dsl == null ? '' : dsl)) ? '\r\n' : '\n');
  }

  function formatPin(pin) {
    return PREFIX + [
      _esc(pin.id), _esc(pin.state || 'open'), _esc(pin.author || ''),
      _esc(pin.at || ''), _esc(pin.anchor || ''), _esc(pin.text || ''),
    ].join('|');
  }

  function parsePinLine(line) {
    if (!isPinLine(line)) return null;
    var body = String(line).trim().slice(PREFIX.trim().length).replace(/^\s+/, '');
    var f = _splitFields(body);
    if (!f[0]) return null;
    return {
      id: f[0],
      state: (f[1] === 'read') ? 'read' : 'open',
      author: f[2] || '',
      at: f[3] || '',
      anchor: f[4] || '',
      text: f[5] || '',
    };
  }

  // anchor と同じ内容の行を探す。指摘行 (コメント) 自身は対象にしない。
  // 見つからなければ line=0 / stale=true。行が書き換わったことを画面で言うために残す。
  function resolveLine(dsl, anchor) {
    var a = String(anchor == null ? '' : anchor).trim();
    if (!a) return { line: 0, stale: true };
    var lines = _lines(dsl);
    for (var i = 0; i < lines.length; i++) {
      if (isPinLine(lines[i])) continue;
      if (lines[i].trim() === a) return { line: i + 1, stale: false };
    }
    return { line: 0, stale: true };
  }

  // list: DSL に書かれている指摘を、指摘先の現在行を解決したうえで返す。
  function list(dsl) {
    var lines = _lines(dsl);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parsePinLine(lines[i]);
      if (!p) continue;
      var r = resolveLine(dsl, p.anchor);
      p.line = r.line;
      p.stale = r.stale;
      p.pinLine = i + 1;
      out.push(p);
    }
    out.sort(function(x, y) {
      if (x.stale !== y.stale) return x.stale ? 1 : -1;
      return x.line - y.line;
    });
    return out;
  }

  function byLine(dsl) {
    var map = {};
    list(dsl).forEach(function(p) {
      if (!p.line) return;
      if (!map[p.line]) map[p.line] = [];
      map[p.line].push(p);
    });
    return map;
  }

  function nextId(dsl) {
    var max = 0;
    list(dsl).forEach(function(p) {
      var n = parseInt(p.id, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return String(max + 1);
  }

  // add: 指摘を 1 件足す。line は指摘先の行番号 (1 始まり)。その行の内容を anchor にする。
  // 指摘行は @enduml の直前に置く (図の途中に挟むと行編集の邪魔になる)。
  function add(dsl, opts) {
    var o = opts || {};
    var lines = _lines(dsl);
    var idx = (typeof o.line === 'number' ? o.line : 0) - 1;
    if (idx < 0 || idx >= lines.length) return String(dsl == null ? '' : dsl);
    if (isPinLine(lines[idx])) return String(dsl == null ? '' : dsl);
    var pin = {
      id: o.id || nextId(dsl),
      state: 'open',
      author: o.author || 'reviewer',
      at: o.at || '',
      anchor: lines[idx].trim(),
      text: o.text || '',
    };
    var at = lines.length;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@end/.test(lines[i])) { at = i; break; }
    }
    lines.splice(at, 0, formatPin(pin));
    return _join(lines, dsl);
  }

  function _rewrite(dsl, id, fn) {
    var lines = _lines(dsl);
    var changed = false;
    for (var i = 0; i < lines.length; i++) {
      var p = parsePinLine(lines[i]);
      if (!p || p.id !== String(id)) continue;
      var next = fn(p);
      if (next === null) { lines.splice(i, 1); } else { lines[i] = formatPin(next); }
      changed = true;
      break;
    }
    return changed ? _join(lines, dsl) : String(dsl == null ? '' : dsl);
  }

  function setState(dsl, id, state) {
    var s = (state === 'read') ? 'read' : 'open';
    return _rewrite(dsl, id, function(p) { p.state = s; return p; });
  }

  function toggleState(dsl, id) {
    return _rewrite(dsl, id, function(p) {
      p.state = (p.state === 'read') ? 'open' : 'read';
      return p;
    });
  }

  function remove(dsl, id) {
    return _rewrite(dsl, id, function() { return null; });
  }

  function summary(pins) {
    var s = { total: 0, open: 0, read: 0, stale: 0 };
    (Array.isArray(pins) ? pins : []).forEach(function(p) {
      s.total++;
      if (p.state === 'read') s.read++; else s.open++;
      if (p.stale) s.stale++;
    });
    return s;
  }

  // badgeText: タブの道具ボタンに出す 1 行。未読が 0 でないことが一目で分かる形にする。
  function badgeText(sum) {
    if (!sum || !sum.total) return '📌 指摘 −';
    return '📌 指摘 ' + sum.open + '/' + sum.total;
  }

  // markerLabel: 図の上に置く印。未読は番号、既読はチェック。
  function markerLabel(pin) {
    return (pin && pin.state === 'read') ? '✓' : String((pin && pin.id) || '');
  }

  function markerColor(pin) {
    return (pin && pin.state === 'read') ? '#6b7280' : '#ef4444';
  }

  // rowText: 一覧に出す 1 行。行が見つからない指摘は、探し直せるよう anchor を見せる。
  function rowText(pin) {
    if (!pin) return '';
    var head = pin.stale ? '行が見つかりません' : ('L' + pin.line);
    return '#' + pin.id + ' ' + head + ' ' + (pin.state === 'read' ? '既読' : '未読')
      + ' ・ ' + pin.text;
  }

  return {
    PREFIX: PREFIX,
    isPinLine: isPinLine,
    formatPin: formatPin,
    parsePinLine: parsePinLine,
    resolveLine: resolveLine,
    list: list,
    byLine: byLine,
    nextId: nextId,
    add: add,
    setState: setState,
    toggleState: toggleState,
    remove: remove,
    summary: summary,
    badgeText: badgeText,
    markerLabel: markerLabel,
    markerColor: markerColor,
    rowText: rowText,
  };
})();
