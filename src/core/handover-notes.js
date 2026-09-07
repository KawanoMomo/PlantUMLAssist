'use strict';
window.MA = window.MA || {};

// handover-notes — 変更サマリの 1 行に「なぜ直したか」を添えて残す申し送り。
//
// BLK-primary-20260907-2303-wish: 変更サマリボードは「前回保存時点からの差分」を
// 開くたびに計算し直すので、レビュー会議が終わると画面ごと消える。新人へ引き継ぐ
// 場面では「Adc_Driver に Adc_Ack() を足したのは adc_state の Done→Configured に
// 対応するメソッドが無かったから」を口頭で説明するしかなく、図の枚数ぶん繰り返す。
//
// ここでは図ごとに一言メモを持たせ、その図を次に開いた人に出す。メモは基準
// (save-diff の baseline) を取り直しても消えない。差分は計算し直されるが、
// 「なぜ直したか」は取り直しでは変わらないため。
// このモジュールは DOM に触らない。描画は app.js の職掌。
window.MA.handoverNotes = (function() {
  var KEY = 'plantuml-handover-notes';
  var MAX = 200;   // 一言メモ。長文の設計書はここではなく図のノートへ書く

  var _notes = null;   // { name: { text, at, added, removed, status } }

  // 改行で分けて書かれても 1 行として出す (ボードの行に添える一言のため)。
  function normalizeText(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ');
    t = t.split('\n').map(function(x) { return x.trim(); })
      .filter(function(x) { return x !== ''; }).join(' / ');
    if (t.length > MAX) t = t.slice(0, MAX);
    return t.trim();
  }

  function _now() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function _sanitize(v) {
    if (!v || typeof v !== 'object') return null;
    var text = normalizeText(v.text);
    if (!text) return null;
    return {
      text: text,
      at: typeof v.at === 'string' ? v.at : '',
      added: typeof v.added === 'number' ? v.added : 0,
      removed: typeof v.removed === 'number' ? v.removed : 0,
      status: typeof v.status === 'string' ? v.status : '',
    };
  }

  // 保存形式。壊れていた行は落として残りを活かす (申し送りは 1 件ずつ独立)。
  function parse(raw) {
    var out = {};
    if (raw == null || raw === '') return out;
    var v;
    try { v = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return out; }
    var src = (v && typeof v === 'object' && v.notes && typeof v.notes === 'object') ? v.notes : null;
    if (!src) return out;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var n = _sanitize(src[k]);
      if (n) out[k] = n;
    }
    return out;
  }

  function serialize(notes) {
    return JSON.stringify({ notes: notes || {} });
  }

  function _load() {
    if (_notes) return _notes;
    _notes = {};
    try { _notes = parse(window.localStorage.getItem(KEY)); } catch (e) { _notes = {}; }
    return _notes;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, serialize(_load()));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 図に一言を添える。空文字を渡すと申し送りを消す (取り消しの操作を分けない)。
  // meta は変更サマリの entry ({ added, removed, status }) をそのまま渡せる。
  function set(name, text, meta, at) {
    var key = String(name == null ? '' : name);
    if (!key) return null;
    var notes = _load();
    var t = normalizeText(text);
    if (!t) { delete notes[key]; _persist(); return null; }
    var m = meta || {};
    notes[key] = {
      text: t,
      at: at || _now(),
      added: typeof m.added === 'number' ? m.added : 0,
      removed: typeof m.removed === 'number' ? m.removed : 0,
      status: typeof m.status === 'string' ? m.status : '',
    };
    _persist();
    return notes[key];
  }

  function get(name) {
    var n = _load()[String(name == null ? '' : name)];
    return n || null;
  }

  function remove(name) {
    var notes = _load();
    var key = String(name == null ? '' : name);
    if (!Object.prototype.hasOwnProperty.call(notes, key)) return false;
    delete notes[key];
    _persist();
    return true;
  }

  // 新しい順。引き継ぎでは「今日書いたもの」から見せるため。
  function list() {
    var notes = _load();
    var out = [];
    for (var k in notes) {
      if (!Object.prototype.hasOwnProperty.call(notes, k)) continue;
      out.push({ name: k, text: notes[k].text, at: notes[k].at,
        added: notes[k].added, removed: notes[k].removed, status: notes[k].status });
    }
    out.sort(function(a, b) {
      if (a.at === b.at) return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      return a.at < b.at ? 1 : -1;
    });
    return out;
  }

  function count() { return list().length; }

  function clear() { _notes = {}; _persist(); }

  // 図を開いた人に出す 1 行。日付は「いつの申し送りか」を判断するために要る。
  function bannerText(note) {
    if (!note || !note.text) return '';
    var when = String(note.at || '').replace('T', ' ').slice(0, 16);
    return '申し送り' + (when ? ' (' + when + ')' : '') + ': ' + note.text;
  }

  // ボードの見出しに足す 1 行。0 件なら空文字 (何も足さない)。
  function summaryText(notes) {
    var n = Array.isArray(notes) ? notes.length : count();
    if (n === 0) return '';
    return '申し送り ' + n + ' 件';
  }

  // 引き継ぎパッケージに焼く用。名前と一言だけの平たい行にする。
  function digestLines(notes) {
    var src = Array.isArray(notes) ? notes : list();
    return src.map(function(n) {
      var when = String(n.at || '').replace('T', ' ').slice(0, 16);
      return n.name + ': ' + n.text + (when ? ' (' + when + ')' : '');
    });
  }

  // テスト用。localStorage を差し替えたあとに読み直させる。
  function _reset() { _notes = null; }

  return {
    KEY: KEY,
    MAX: MAX,
    normalizeText: normalizeText,
    parse: parse,
    serialize: serialize,
    set: set,
    get: get,
    remove: remove,
    list: list,
    count: count,
    clear: clear,
    bannerText: bannerText,
    summaryText: summaryText,
    digestLines: digestLines,
    _reset: _reset,
  };
})();
