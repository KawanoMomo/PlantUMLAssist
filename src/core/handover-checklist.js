'use strict';
window.MA = window.MA || {};

// handover-checklist — 引き継ぎに添える「申し送りチェックリスト」と、新人からの返信。
//
// BLK-primary-20260908-1803-wish: 申し送り (handover-notes) は変更サマリの差分行に
// 添える形なので、直した内容が基準へ取り込まれた後は書く場所が無い。渡した後も、
// 新人が読んだか・対応したかは、次にその図を開いて帯が消えているかを見るまで
// 分からない。
//
// ここでは引き継ぎを作る時点で申し送りを「チェックリスト」として固定し (以後
// 差分が消えても項目は残る)、zip の index.html で新人が項目ごとに
// 読んだ / 対応した / 分からなかった を 1 クリックで選び、返信 JSON として返す。
// 渡した側はそれを読み込み、次の起動時に「未読 N 件・要フォロー M 件」を見る。
//
// このモジュールは DOM に触らない (localStorage は handover-notes と同じ扱いで持つ)。
// 描画とファイル入出力は app.js、index.html への差し込みは handoff-package の職掌。
window.MA.handoverChecklist = (function() {

  var KEY = 'plantuml-handover-checklist';   // 渡したチェックリスト + 返信
  var READ = 'read';        // 読んだ
  var DONE = 'done';        // 対応した
  var UNCLEAR = 'unclear';  // 分からなかった

  var STATUS = [READ, DONE, UNCLEAR];
  var LABEL = {};
  LABEL[READ] = '読んだ';
  LABEL[DONE] = '対応した';
  LABEL[UNCLEAR] = '分からなかった';

  var _state = null;   // { checklist, reply }

  function esc(s) {
    if (window.MA.htmlUtils && window.MA.htmlUtils.escHtml) return window.MA.htmlUtils.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _pad(n) { return (n < 10 ? '0' : '') + n; }

  function _now() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function statusLabel(s) { return LABEL[s] || ''; }

  // 項目の id。図の名前を id に使うと返信 JSON が読める形になり、新人が
  // 「どの図の話か」をファイルのままでも分かる。衝突は連番で避ける。
  function itemId(name, used) {
    var base = String(name == null ? '' : name).trim().replace(/\s+/g, '-');
    if (!base) base = 'item';
    var id = base;
    var n = 2;
    while (used && used[id]) { id = base + '-' + n; n++; }
    if (used) used[id] = true;
    return id;
  }

  // build — 渡す時点の申し送りを項目として固定する。
  // notes は handoverNotes.list() の形 ([{ name, text, at }])。
  function build(notes, at) {
    var src = Array.isArray(notes) ? notes : [];
    var used = {};
    var items = [];
    for (var i = 0; i < src.length; i++) {
      var n = src[i] || {};
      var text = String(n.text == null ? '' : n.text).trim();
      if (!text) continue;
      items.push({
        id: itemId(n.name, used),
        name: String(n.name == null ? '' : n.name),
        text: text,
        at: typeof n.at === 'string' ? n.at : '',
      });
    }
    return { createdAt: at || _now(), items: items };
  }

  function serialize(checklist) {
    var c = checklist || {};
    return JSON.stringify({ kind: 'handover-checklist', createdAt: c.createdAt || '', items: c.items || [] }, null, 2);
  }

  function parse(raw) {
    var v = null;
    if (raw == null || raw === '') return null;
    try { v = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!v || typeof v !== 'object' || !Array.isArray(v.items)) return null;
    var items = [];
    for (var i = 0; i < v.items.length; i++) {
      var it = v.items[i] || {};
      var text = String(it.text == null ? '' : it.text).trim();
      var id = String(it.id == null ? '' : it.id).trim();
      if (!id || !text) continue;   // 壊れた行は落として残りを活かす
      items.push({ id: id, name: String(it.name == null ? '' : it.name), text: text,
        at: typeof it.at === 'string' ? it.at : '' });
    }
    return { createdAt: typeof v.createdAt === 'string' ? v.createdAt : '', items: items };
  }

  function replyFileName(now) {
    var d = now || new Date();
    return 'handover-reply-' + d.getFullYear() + _pad(d.getMonth() + 1) + _pad(d.getDate())
      + '-' + _pad(d.getHours()) + _pad(d.getMinutes()) + '.json';
  }

  function serializeReply(createdAt, replies, at) {
    var r = {};
    var src = replies || {};
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (STATUS.indexOf(src[k]) !== -1) r[k] = src[k];
    }
    return JSON.stringify({ kind: 'handover-reply', createdAt: createdAt || '', at: at || _now(), replies: r }, null, 2);
  }

  function parseReply(raw) {
    var v = null;
    if (raw == null || raw === '') return null;
    try { v = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!v || typeof v !== 'object' || !v.replies || typeof v.replies !== 'object') return null;
    var out = {};
    for (var k in v.replies) {
      if (!Object.prototype.hasOwnProperty.call(v.replies, k)) continue;
      if (STATUS.indexOf(v.replies[k]) !== -1) out[String(k)] = v.replies[k];
    }
    return {
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
      at: typeof v.at === 'string' ? v.at : '',
      replies: out,
    };
  }

  // merge — 項目に返信を重ねる。返信の無い項目は status '' (未読)。
  function merge(checklist, reply) {
    var c = checklist || {};
    var r = (reply && reply.replies) || {};
    return (c.items || []).map(function(it) {
      var s = Object.prototype.hasOwnProperty.call(r, it.id) ? r[it.id] : '';
      return { id: it.id, name: it.name, text: it.text, at: it.at,
        status: s, statusLabel: statusLabel(s) };
    });
  }

  // summary — 渡した側が最初に見る 1 行。未読 = 返信なし、要フォロー = 分からなかった。
  function summary(merged) {
    var list = Array.isArray(merged) ? merged : [];
    var unread = 0;
    var follow = 0;
    var done = 0;
    list.forEach(function(it) {
      if (!it || !it.status) { unread++; return; }
      if (it.status === UNCLEAR) follow++;
      if (it.status === DONE) done++;
    });
    var line = list.length === 0 ? ''
      : ('申し送り ' + list.length + ' 件: 未読 ' + unread + ' 件・要フォロー ' + follow + ' 件');
    return { total: list.length, unread: unread, follow: follow, done: done, line: line };
  }

  // 「分からなかった」が付いた項目。次回の教育内容をここから選ぶ。
  function followUps(merged) {
    return (Array.isArray(merged) ? merged : []).filter(function(it) {
      return it && it.status === UNCLEAR;
    });
  }

  // ── 渡した側の控え (localStorage) ─────────────────────────────────────────

  function _load() {
    if (_state) return _state;
    _state = { checklist: null, reply: null };
    try {
      var raw = window.localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && typeof v === 'object') {
        _state.checklist = parse(v.checklist);
        _state.reply = parseReply(v.reply);
      }
    } catch (e) { _state = { checklist: null, reply: null }; }
    return _state;
  }

  function _persist() {
    var s = _load();
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ checklist: s.checklist, reply: s.reply }));
      return true;
    } catch (e) { return false; }
  }

  // 渡したチェックリストを控える。渡し直したら返信は古いので捨てる。
  function issue(checklist) {
    var s = _load();
    s.checklist = checklist || null;
    s.reply = null;
    _persist();
    return s.checklist;
  }

  function issued() { return _load().checklist; }

  // 返信を取り込む。控えが無い / 中身が読めないときは null を返して何も変えない。
  function receive(raw) {
    var r = parseReply(raw);
    if (!r) return null;
    var s = _load();
    s.reply = r;
    _persist();
    return r;
  }

  function reply() { return _load().reply; }

  // 控えと返信から、いまの状態を出す。控えが無ければ空。
  function current() {
    var s = _load();
    if (!s.checklist) return { items: [], summary: summary([]) };
    var m = merge(s.checklist, s.reply);
    return { items: m, summary: summary(m), createdAt: s.checklist.createdAt,
      repliedAt: s.reply ? s.reply.at : '' };
  }

  function clear() { _state = { checklist: null, reply: null }; _persist(); }

  // ── zip の index.html に焼く節 ────────────────────────────────────────────
  // 渡された側はブラウザで開くだけ。外部ファイルを読まないよう、操作の script も
  // ここに書き込む (返信は Blob で保存させ、メールなどで返してもらう)。

  var REPLY_SCRIPT = [
    '(function(){',
    '  var box = document.getElementById("hc-list"); if (!box) return;',
    '  var state = {};',
    '  var createdAt = box.getAttribute("data-created-at") || "";',
    '  function refresh(){',
    '    var total = box.querySelectorAll("li[data-item-id]").length, answered = 0, unclear = 0;',
    '    for (var k in state) { if (state[k]) { answered++; if (state[k] === "unclear") unclear++; } }',
    '    var s = document.getElementById("hc-state");',
    '    if (s) s.textContent = "回答 " + answered + " / " + total + " 件 ・ 分からなかった " + unclear + " 件";',
    '  }',
    '  box.addEventListener("click", function(ev){',
    '    var b = ev.target && ev.target.closest ? ev.target.closest("button[data-status]") : null;',
    '    if (!b) return;',
    '    var li = b.closest("li"); var id = li && li.getAttribute("data-item-id"); if (!id) return;',
    '    var v = b.getAttribute("data-status");',
    '    state[id] = (state[id] === v) ? "" : v;',
    '    var btns = li.querySelectorAll("button[data-status]");',
    '    for (var i = 0; i < btns.length; i++) {',
    '      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-status") === state[id] ? "true" : "false");',
    '    }',
    '    refresh();',
    '  });',
    '  var save = document.getElementById("hc-save");',
    '  if (save) save.addEventListener("click", function(){',
    '    var replies = {};',
    '    for (var k in state) { if (state[k]) replies[k] = state[k]; }',
    '    var text = JSON.stringify({ kind: "handover-reply", createdAt: createdAt,',
    '      at: new Date().toISOString(), replies: replies }, null, 2);',
    '    var a = document.createElement("a");',
    '    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));',
    '    a.download = "handover-reply.json"; a.click();',
    '    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 0);',
    '  });',
    '  refresh();',
    '})();',
  ].join('\n');

  var CSS = [
    'ol.hc{list-style:none;padding:0;margin:8px 0;}',
    'ol.hc li{background:#fff;border:1px solid #d5d5da;border-radius:4px;padding:8px 10px;margin-bottom:6px;}',
    'ol.hc .hc-name{font-weight:600;font-size:12px;}',
    'ol.hc .hc-text{font-size:12px;margin:2px 0 6px;}',
    'ol.hc button{font-size:11px;margin-right:6px;padding:2px 10px;border:1px solid #b5b5bd;',
    'background:#f3f3f6;border-radius:10px;cursor:pointer;}',
    'ol.hc button[aria-pressed="true"]{background:#d6e6f5;border-color:#4a7fb5;font-weight:600;}',
    '#hc-save{font-size:12px;padding:4px 12px;}',
    '#hc-state{font-size:11px;color:#6a6a72;margin-left:8px;}',
  ].join('\n');

  function _buttons(id) {
    var out = '';
    STATUS.forEach(function(s) {
      out += '<button type="button" data-status="' + esc(s) + '" aria-pressed="false"'
        + ' id="hc-' + esc(id) + '-' + esc(s) + '">' + esc(LABEL[s]) + '</button>';
    });
    return out;
  }

  // renderHtml — index.html に差し込む節 (script は別に scriptHtml で出す)。
  function renderHtml(checklist) {
    var c = checklist || {};
    var items = c.items || [];
    if (items.length === 0) {
      return '<p class="muted">申し送りはありません。</p>';
    }
    var out = '<p class="muted">項目ごとに 1 つ選び、最後に「返信を保存」で JSON を先輩へ返してください。</p>';
    out += '<ol class="hc" id="hc-list" data-created-at="' + esc(c.createdAt || '') + '">';
    items.forEach(function(it) {
      out += '<li data-item-id="' + esc(it.id) + '">'
        + '<div class="hc-name">' + esc(it.name) + '</div>'
        + '<div class="hc-text">' + esc(it.text) + '</div>'
        + _buttons(it.id) + '</li>';
    });
    out += '</ol>';
    out += '<p><button type="button" id="hc-save">返信を保存</button><span id="hc-state"></span></p>';
    return out;
  }

  function styleCss() { return CSS; }
  function scriptHtml() { return '<script>\n' + REPLY_SCRIPT + '\n</' + 'script>'; }

  function _reset() { _state = null; }

  return {
    KEY: KEY, READ: READ, DONE: DONE, UNCLEAR: UNCLEAR, STATUS: STATUS,
    statusLabel: statusLabel,
    itemId: itemId,
    build: build,
    serialize: serialize,
    parse: parse,
    replyFileName: replyFileName,
    serializeReply: serializeReply,
    parseReply: parseReply,
    merge: merge,
    summary: summary,
    followUps: followUps,
    issue: issue,
    issued: issued,
    receive: receive,
    reply: reply,
    current: current,
    clear: clear,
    renderHtml: renderHtml,
    styleCss: styleCss,
    scriptHtml: scriptHtml,
    _reset: _reset,
  };
})();
