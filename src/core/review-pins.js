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
//
// BLK-junior-20260908-0103-wish: 「読んだ (read)」と「直した (done)」が同じ印だったため、
// 反映済みかどうかはファイル名末尾の「(レビュー反映)」で管理されていた。そのうえ直すと
// anchor の行が書き換わって指摘が迷子になり、どの指摘にどの修正が対応するかが図に残らない。
// 対応済み (done) を state に足し、そのとき anchor を修正後の行へ貼り替え、
// 修正前の行を 7 番目のフィールドに残す。1 行の中に「指摘 → 修正前 → 修正後」が揃う。
//   ' @pin 1|done|reviewer|...|Idle --> Busy : Timer_Ack|...|Idle --> Busy : Timer_StartConv
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

  function normState(s) {
    return (s === 'read' || s === 'done') ? s : 'open';
  }

  // 修正前の行 (before) は対応済みにしたときだけ書く。まだ直していない指摘の行に
  // 空の 7 番目を足すと、既存の図の差分が意味なく増える。
  function formatPin(pin) {
    var f = [
      _esc(pin.id), _esc(normState(pin.state)), _esc(pin.author || ''),
      _esc(pin.at || ''), _esc(pin.anchor || ''), _esc(pin.text || ''),
    ];
    if (pin.before) f.push(_esc(pin.before));
    return PREFIX + f.join('|');
  }

  function parsePinLine(line) {
    if (!isPinLine(line)) return null;
    var body = String(line).trim().slice(PREFIX.trim().length).replace(/^\s+/, '');
    var f = _splitFields(body);
    if (!f[0]) return null;
    return {
      id: f[0],
      state: normState(f[1]),
      author: f[2] || '',
      at: f[3] || '',
      anchor: f[4] || '',
      text: f[5] || '',
      before: f[6] || '',
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
    var s = normState(state);
    return _rewrite(dsl, id, function(p) { p.state = s; return p; });
  }

  // 未読 ⇄ 既読 だけを往復する。対応済みは修正の記録を持つので toggle では動かさない
  // (押し間違いで「どの修正が対応するか」を消さない)。戻すのは reopen。
  function toggleState(dsl, id) {
    return _rewrite(dsl, id, function(p) {
      if (p.state === 'done') return p;
      p.state = (p.state === 'read') ? 'open' : 'read';
      return p;
    });
  }

  // markDone: 「この指摘は直した」を記録する。opts.line に修正後の対象行を渡すと、
  // anchor をその行へ貼り替え、指摘した時点の行を before に残す。行を渡さなければ
  // anchor はそのまま (行を書き換えずに済んだ指摘)。
  // 貼り替えるので、直した指摘が迷子 (stale) にならず一覧に残り続ける。
  function markDone(dsl, id, opts) {
    var o = opts || {};
    var lines = _lines(dsl);
    var text = null;
    if (typeof o.line === 'number' && o.line >= 1 && o.line <= lines.length) {
      var l = lines[o.line - 1];
      if (!isPinLine(l) && l.trim()) text = l.trim();
    } else if (typeof o.anchor === 'string' && o.anchor.trim()) {
      text = o.anchor.trim();
    }
    return _rewrite(dsl, id, function(p) {
      if (text && text !== p.anchor) { p.before = p.anchor; p.anchor = text; }
      p.state = 'done';
      return p;
    });
  }

  // reopen: 修正が足りなかったときに未読へ戻す。before は残す
  // (何をどう直したかの記録を、差し戻しのたびに失わない)。
  function reopen(dsl, id) {
    return _rewrite(dsl, id, function(p) { p.state = 'open'; return p; });
  }

  function remove(dsl, id) {
    return _rewrite(dsl, id, function() { return null; });
  }

  // pending は「まだ直っていない指摘」= 対応済み以外。未読か既読かに関わらず、
  // 直すべき件数はこれで数える (ファイル名末尾の「(レビュー反映)」の代わり)。
  function summary(pins) {
    var s = { total: 0, open: 0, read: 0, done: 0, pending: 0, stale: 0 };
    (Array.isArray(pins) ? pins : []).forEach(function(p) {
      s.total++;
      if (p.state === 'done') s.done++;
      else if (p.state === 'read') s.read++;
      else s.open++;
      if (p.stale) s.stale++;
    });
    s.pending = s.total - s.done;
    return s;
  }

  function stateLabel(state) {
    if (state === 'done') return '対応済み';
    return (state === 'read') ? '既読' : '未読';
  }

  // badgeText: タブの道具ボタンに出す 1 行。未対応 (= 対応済み以外) が一目で分かる形。
  function badgeText(sum) {
    if (!sum || !sum.total) return '📌 指摘 −';
    var pending = (typeof sum.pending === 'number') ? sum.pending : sum.open;
    return '📌 指摘 ' + pending + '/' + sum.total;
  }

  // markerLabel: 図の上に置く印。未読は番号、既読はチェック、対応済みは「済」。
  function markerLabel(pin) {
    if (pin && pin.state === 'done') return '済';
    return (pin && pin.state === 'read') ? '✓' : String((pin && pin.id) || '');
  }

  function markerColor(pin) {
    if (pin && pin.state === 'done') return '#16a34a';
    return (pin && pin.state === 'read') ? '#6b7280' : '#ef4444';
  }

  // fixText: どの指摘にどの修正が対応するか。対応済みで行を書き替えた指摘だけが持つ。
  function fixText(pin) {
    if (!pin || pin.state !== 'done' || !pin.before) return '';
    return '修正: ' + pin.before + ' → ' + pin.anchor;
  }

  // rowText: 一覧に出す 1 行。行が見つからない指摘は、探し直せるよう anchor を見せる。
  function rowText(pin) {
    if (!pin) return '';
    var head = pin.stale ? '行が見つかりません' : ('L' + pin.line);
    var fix = fixText(pin);
    return '#' + pin.id + ' ' + head + ' ' + stateLabel(pin.state)
      + ' ・ ' + pin.text + (fix ? ' ・ ' + fix : '');
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
    markDone: markDone,
    reopen: reopen,
    remove: remove,
    summary: summary,
    stateLabel: stateLabel,
    badgeText: badgeText,
    markerLabel: markerLabel,
    markerColor: markerColor,
    fixText: fixText,
    rowText: rowText,
  };
})();
