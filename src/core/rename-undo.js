'use strict';
window.MA = window.MA || {};

// rename-undo — ⇄ 一括置換 (Ctrl+H) で 1 回に当てた置換を、窓の「置換前に戻す」1 押しで
// 開いている図も開いていない図も全部戻すための純関数 (TICKET-owner-20261123-0742-1)。
//
// 前は「置換前に戻す」が開いていない図だけを戻し、開いている図は Ctrl+Z に任せていた。
// どちらか片方の手だけでは 1 回の置換が半分だけ戻り、図の間で部品名が食い違った
// (VS Code の Replace All は Undo 1 回でファイルをまたいで全部戻る)。
//
// ここで決めるのは
//   - 置換の直後に控える開いている図の前後 (openRows)
//   - 押した時点で、どの図を戻すか (plan)。開いている図は今の本文が置換の直後のままのものだけ。
//     先に Ctrl+Z で戻した図 (今の本文が置換前) は二重に戻さず、置換の後に書き換わった図は戻さず名前を出す
//   - ボタンの語と戻した後の知らせ。枚数で言い、開いている図の札と同じ「開いている / 開いていない」の語を使う
// DOM・fetch・保存は app.js。
window.MA.renameUndo = (function() {
  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 置換の直後に呼ぶ。before: { 図の id: 当てる前の本文 }、changed: [{ id, dsl (当てた後) }]、
  // labels: { 図の id: 窓に出す名前 (サブフォルダの図は道付き) }、names: { 図の id: 図の名前 }。
  function openRows(before, changed, labels, names) {
    var b = before || {}, l = labels || {}, n = names || {};
    var out = [];
    _list(changed).forEach(function(c) {
      if (!c || c.id == null) return;
      if (!Object.prototype.hasOwnProperty.call(b, c.id)) return;
      var prev = _s(b[c.id]);
      var next = _s(c.dsl);
      if (prev === next) return;
      out.push({ id: c.id, name: _s(n[c.id]), label: _s(l[c.id] || n[c.id]), before: prev, after: next });
    });
    return out;
  }

  // 押した時点の戻し方。current: { 図の id: 今の本文 } (開いていない図は数えない。開いている図のタブが
  // 閉じていれば current に無い = 戻さない)。unopened: 開いていない図の控え [{ label, ... }]。
  // → { open: [戻す開いている図], already: [先に戻した図の名前], changedAfter: [書き換わった図の名前],
  //     unopened: 開いていない図の数, total: 戻す枚数 }
  function plan(open, current, unopened) {
    var cur = current || {};
    var out = { open: [], already: [], changedAfter: [], unopened: _list(unopened).length, total: 0 };
    _list(open).forEach(function(r) {
      if (!r || !Object.prototype.hasOwnProperty.call(cur, r.id)) return;
      var now = _s(cur[r.id]);
      if (now === r.after) out.open.push(r);
      else if (now === r.before) out.already.push(r.label || r.name);
      else out.changedAfter.push(r.label || r.name);
    });
    out.total = out.open.length + out.unopened;
    return out;
  }

  function buttonLabel(p) {
    return '置換前に戻す (' + ((p && p.total) || 0) + ' 枚)';
  }

  function buttonTitle(p) {
    var t = '直前の置換で書き換えた図を、開いている図も開いていない図も置換前の中身に戻します';
    if (p && p.already && p.already.length) {
      t += '。Ctrl+Z で先に戻した図 (' + p.already.join(', ') + ') はそのまま';
    }
    return t + ' (置換の後に書き換えた図は戻しません)';
  }

  // 戻した後の知らせ。res: { open, unopened, skipped: [名前], failed }
  function doneText(res) {
    var r = res || {};
    var o = r.open || 0, u = r.unopened || 0;
    var msg = (o + u) + ' 枚を置換前に戻しました';
    if (o && u) msg += ' (開いている ' + o + ' 枚・開いていない ' + u + ' 枚)';
    else if (o) msg += ' (開いている ' + o + ' 枚)';
    else if (u) msg += ' (開いていない ' + u + ' 枚)';
    if (_list(r.skipped).length) msg += ' / 置換の後に書き換わった図は戻していません: ' + r.skipped.join(', ');
    if (r.failed > 0) msg += ' / ' + r.failed + ' 枚は書き込めませんでした';
    return msg;
  }

  var api = { openRows: openRows, plan: plan, buttonLabel: buttonLabel, buttonTitle: buttonTitle, doneText: doneText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
