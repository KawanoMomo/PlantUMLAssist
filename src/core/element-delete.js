'use strict';
window.MA = window.MA || {};

// element-delete — 線・メッセージ・note の付いた要素を消す共通部 (TICKET-owner-20261124-0422-3)。
// 宣言の行だけを消すと、関係・メッセージ・note の行が元の名前で要素を描き直し、「はい」と答えても要素が図に残った。
// 6 図種の「✕ 削除」と Delete キーは、ここで消える行を集め、アプリ内の 1 つの窓で本数を言ってから一緒に消す
// (クラス図の形。ブラウザの confirm は使わない。Enter で削除・Esc で何も変えず閉じる。Ctrl+Z 1 回で全部戻る)。
//   plan(parts)            : 図種が集めた行の範囲から、消す範囲 (重なりをまとめ降順) と本数を作る
//   apply(text, plan)      : 範囲を消す (行末の \r はそのまま)
//   message(label, id, plan, relWord) : 窓の文 (「部品 Bus を削除します。関係 1 本とnote 1 つも消えます。」)
//   notesOf(text, id)      : `note … of X` / `note over X, Y` (1 行・複数行) のうち X を対象に持つものの範囲
//   ask(opts)              : 窓を出す。Enter / 「削除する」で opts.ctx の本文から plan を消す
window.MA.elementDelete = (function() {

  function _range(r) {
    var s = r.start | 0, e = (r.end | 0) || s;
    return { start: s, end: e < s ? s : e };
  }

  // parts: { decl: [{start,end}], relations: [{start,end}], notes: [{start,end}], others: [{start,end}] }
  // 本数は重ならない範囲の数で数える (同じ行を 2 回数えない)。
  function plan(parts) {
    var p = parts || {};
    var all = [], seen = {};
    var counts = { relations: 0, notes: 0, others: 0 };
    function add(list, key) {
      (list || []).forEach(function(r) {
        if (!r || !r.start) return;
        var rr = _range(r);
        var k = rr.start + ':' + rr.end;
        if (seen[k]) return;
        seen[k] = true;
        all.push(rr);
        if (key) counts[key]++;
      });
    }
    add(p.decl, null);
    add(p.relations, 'relations');
    add(p.notes, 'notes');
    add(p.others, 'others');
    all.sort(function(a, b) { return a.start - b.start; });
    var merged = [];
    all.forEach(function(r) {
      var last = merged[merged.length - 1];
      if (last && r.start <= last.end) {
        if (r.end > last.end) last.end = r.end;
        return;
      }
      merged.push({ start: r.start, end: r.end });
    });
    merged.sort(function(a, b) { return b.start - a.start; });
    return {
      ranges: merged,
      relations: counts.relations, notes: counts.notes, others: counts.others,
      decl: (p.decl || []).length,
    };
  }

  function attached(pl) {
    return !!pl && (pl.relations + pl.notes + pl.others) > 0;
  }

  function apply(text, pl) {
    if (!pl || !pl.ranges || !pl.ranges.length) return text;
    var lines = String(text).split('\n');
    pl.ranges.forEach(function(r) {
      var s = r.start - 1, e = r.end - 1;
      if (s < 0 || s >= lines.length) return;
      if (e >= lines.length) e = lines.length - 1;
      lines.splice(s, e - s + 1);
    });
    return lines.join('\n');
  }

  // relWord: 「関係」「メッセージ」「遷移」。othersWord: その他の行 (activate 等) の呼び名。
  function message(label, id, pl, relWord, othersWord) {
    var extra = [];
    var rw = relWord || '関係';
    if (pl && pl.relations) extra.push(rw + ' ' + pl.relations + ' 本');
    if (pl && pl.notes) extra.push('note ' + pl.notes + ' つ');
    if (pl && pl.others) extra.push((othersWord || 'そのほかの行') + ' ' + pl.others + ' 行');
    return (label ? label + ' ' : '') + id + ' を削除します。'
      + (extra.length ? extra.join('と') + 'も消えます。' : '繋がる' + rw + 'と note はありません。');
  }

  var NOTE_HEAD_RE = /^\s*[rh]?note\s+(?:(?:left|right|top|bottom)\s+of|over)\s+(.+)$/i;
  var NOTE_END_RE = /^\s*end\s*[rh]?note\b/i;

  function _unq(s) {
    var v = String(s).trim();
    return (v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') ? v.slice(1, -1) : v;
  }

  // 対象に id を持つ note の範囲。`note over A, B` も A を消すと A が描き直されるので含める。
  function notesOf(text, id) {
    var lines = String(text == null ? '' : text).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = NOTE_HEAD_RE.exec(lines[i].replace(/\r$/, ''));
      if (!m) continue;
      var rest = m[1];
      var colon = -1, inQ = false;
      for (var c = 0; c < rest.length; c++) {
        var ch = rest.charAt(c);
        if (ch === '"') inQ = !inQ;
        else if (ch === ':' && !inQ) { colon = c; break; }
      }
      var head = (colon >= 0 ? rest.slice(0, colon) : rest).replace(/#\S+/g, '').trim();
      var targets = head.split(',').map(_unq);
      var end = i;
      if (colon < 0) {
        for (var j = i + 1; j < lines.length; j++) {
          if (NOTE_END_RE.test(lines[j])) { end = j; break; }
        }
      }
      if (targets.indexOf(id) >= 0) out.push({ start: i + 1, end: end + 1 });
      i = end;
    }
    return out;
  }

  // opts: { prefix, title, message, plan, ctx, onDone }
  // 窓の id は `{prefix}-del-modal` / `-message` / `-confirm` / `-cancel` (クラス図は cl)。
  function ask(opts) {
    var o = opts || {};
    var prefix = o.prefix || 'el';
    var ctx = o.ctx;
    var old = document.getElementById(prefix + '-del-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var back = document.activeElement;
    var wrap = document.createElement('div');
    wrap.id = prefix + '-del-modal';
    wrap.className = 'el-del-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;');
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', o.title || '削除');
    box.setAttribute('style', 'background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;padding:14px 16px;min-width:300px;max-width:440px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4);');
    var msg = document.createElement('p');
    msg.id = prefix + '-del-message';
    msg.className = 'el-del-message';
    msg.setAttribute('style', 'margin:0 0 12px;line-height:1.6;');
    msg.textContent = o.message || '';
    box.appendChild(msg);
    var row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;justify-content:flex-end;');
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = prefix + '-del-cancel';
    cancel.textContent = '取り消し';
    cancel.setAttribute('style', 'background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border);padding:5px 12px;border-radius:4px;font-size:12px;cursor:pointer;');
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.id = prefix + '-del-confirm';
    ok.className = 'el-del-confirm';
    ok.textContent = '削除する';
    ok.setAttribute('style', 'background:var(--accent-red);color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:12px;cursor:pointer;');
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(row);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    var done = false;
    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (back && back.focus && back.isConnected !== false) { try { back.focus(); } catch (e) {} }
    }
    function doDelete() {
      if (done) return;
      done = true;
      close();
      window.MA.history.pushHistory();
      ctx.setMmdText(apply(ctx.getMmdText(), o.plan));
      if (window.MA.selection && window.MA.selection.clearSelection) window.MA.selection.clearSelection();
      ctx.onUpdate();
      if (typeof o.onDone === 'function') o.onDone();
    }
    ok.addEventListener('click', doDelete);
    cancel.addEventListener('click', close);
    wrap.addEventListener('click', function(e) { if (e.target === wrap) close(); });
    wrap.addEventListener('keydown', function(e) {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Enter' && document.activeElement !== cancel) { e.preventDefault(); e.stopPropagation(); doDelete(); }
    });
    try { ok.focus(); } catch (e) {}
    return wrap;
  }

  return {
    plan: plan,
    attached: attached,
    apply: apply,
    message: message,
    notesOf: notesOf,
    ask: ask,
  };
})();
