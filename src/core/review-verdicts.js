'use strict';
window.MA = window.MA || {};

// review-verdicts — 変更サマリボードの差分行に「済 / 要修正」のレビュー結果を付けて残す。
//
// BLK-primary-20260908-0823-wish: レビュー会議で変更サマリボードを開き、変わった図の
// 変更前後を 1 画面で見せられるようになったが、会議で出た「この行は OK」「ここは直して」
// という結果はどこにも残らず、聞いた側がメモを取るしかない。
//
// ここでは差分行ごとに結果を持たせ、その図を次に開いた人に「要修正 N 件」を帯で出す。
// 行の識別は「行の種類 + 行の文字列」で持つ。行番号ではないのは、他の行を直すと番号が
// ずれて印が別の行に付け替わってしまうため。同じ文字列の行が同じ図に複数あると 1 つの
// 印を共有するが、DSL では同一図内の同一行は同じ意味なので、まとめて扱ってよい。
// 印は基準 (save-diff の baseline) を取り直しても消えない。「直した」判断は人が行う。
// このモジュールは DOM に触らない。描画は app.js の職掌。
window.MA.reviewVerdicts = (function() {
  var KEY = 'plantuml-review-verdicts';
  var DONE = '済';
  var FIX = '要修正';

  var _all = null;   // { docName: { rowKey: { verdict, at } } }

  function _now() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  // 行の識別子。前後の空白は落とす (インデントだけの違いで印が外れないように)。
  function rowKey(row) {
    if (!row || typeof row !== 'object') return '';
    var kind = String(row.kind || '');
    if (kind !== 'add' && kind !== 'del') return '';   // 同じ行・省略行には印を付けない
    var text = (kind === 'add') ? row.after : row.before;
    text = String(text == null ? '' : text).trim();
    if (!text) return '';
    return kind + '|' + text;
  }

  function isVerdict(v) { return v === DONE || v === FIX; }

  function _sanitizeDoc(v) {
    if (!v || typeof v !== 'object') return null;
    var out = {};
    var n = 0;
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var r = v[k];
      if (!r || typeof r !== 'object' || !isVerdict(r.verdict)) continue;
      out[k] = { verdict: r.verdict, at: typeof r.at === 'string' ? r.at : '' };
      n++;
    }
    return n ? out : null;
  }

  // 保存形式。壊れた行は落として残りを活かす (印は 1 件ずつ独立)。
  function parse(raw) {
    var out = {};
    if (raw == null || raw === '') return out;
    var v;
    try { v = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return out; }
    var src = (v && typeof v === 'object' && v.docs && typeof v.docs === 'object') ? v.docs : null;
    if (!src) return out;
    for (var name in src) {
      if (!Object.prototype.hasOwnProperty.call(src, name)) continue;
      var d = _sanitizeDoc(src[name]);
      if (d) out[name] = d;
    }
    return out;
  }

  function serialize(all) {
    return JSON.stringify({ docs: all || {} });
  }

  function _load() {
    if (_all) return _all;
    _all = {};
    try { _all = parse(window.localStorage.getItem(KEY)); } catch (e) { _all = {}; }
    return _all;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, serialize(_load()));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 印を付ける。空文字・未知の値を渡すと印を外す (取り消しの操作を分けない)。
  function set(name, key, verdict, at) {
    var doc = String(name == null ? '' : name);
    var k = String(key == null ? '' : key);
    if (!doc || !k) return null;
    var all = _load();
    if (!isVerdict(verdict)) {
      if (all[doc]) {
        delete all[doc][k];
        if (Object.keys(all[doc]).length === 0) delete all[doc];
      }
      _persist();
      return null;
    }
    if (!all[doc]) all[doc] = {};
    all[doc][k] = { verdict: verdict, at: at || _now() };
    _persist();
    return all[doc][k];
  }

  // 同じ印をもう一度押したら外す (会議中の押し間違いを 1 回で戻せるように)。
  function toggle(name, key, verdict, at) {
    var cur = get(name, key);
    if (cur && cur.verdict === verdict) return set(name, key, '');
    return set(name, key, verdict, at);
  }

  function get(name, key) {
    var d = _load()[String(name == null ? '' : name)];
    if (!d) return null;
    return d[String(key == null ? '' : key)] || null;
  }

  function verdictOf(name, key) {
    var r = get(name, key);
    return r ? r.verdict : '';
  }

  // その図に付いた印。新しい順 (会議で最後に付けたものから潰す)。
  function listFor(name) {
    var d = _load()[String(name == null ? '' : name)];
    if (!d) return [];
    var out = [];
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      out.push({ key: k, verdict: d[k].verdict, at: d[k].at, text: k.slice(k.indexOf('|') + 1) });
    }
    out.sort(function(a, b) {
      if (a.at === b.at) return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
      return a.at < b.at ? 1 : -1;
    });
    return out;
  }

  function counts(name) {
    var out = { done: 0, fix: 0 };
    listFor(name).forEach(function(r) {
      if (r.verdict === DONE) out.done++;
      else if (r.verdict === FIX) out.fix++;
    });
    return out;
  }

  // 印の付いた図の一覧。要修正が残っている図を先に出す (それが次の仕事なので)。
  function docs() {
    var all = _load();
    var out = [];
    for (var name in all) {
      if (!Object.prototype.hasOwnProperty.call(all, name)) continue;
      var c = counts(name);
      out.push({ name: name, done: c.done, fix: c.fix });
    }
    out.sort(function(a, b) {
      if (a.fix !== b.fix) return b.fix - a.fix;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return out;
  }

  function totals() {
    var out = { done: 0, fix: 0, docs: 0 };
    docs().forEach(function(d) { out.done += d.done; out.fix += d.fix; out.docs++; });
    return out;
  }

  // ボードの見出しに足す 1 行。0 件なら空文字 (何も足さない)。
  function summaryText() {
    var t = totals();
    if (t.done + t.fix === 0) return '';
    return 'レビュー結果 要修正 ' + t.fix + ' 件 / 済 ' + t.done + ' 件';
  }

  // 図を開いた人に出す 1 行。要修正が残っていなければ空文字 (帯を出さない)。
  function bannerText(name) {
    var c = counts(name);
    if (c.fix === 0) return '';
    return 'レビュー結果: 要修正 ' + c.fix + ' 件'
      + (c.done ? ' (済 ' + c.done + ' 件)' : '')
      + ' — 変更サマリボードで印の付いた行を直す';
  }

  // 引き継ぎパッケージに焼く用。図ごとに平たい行にする。
  function digestLines() {
    var out = [];
    docs().forEach(function(d) {
      out.push(d.name + ': 要修正 ' + d.fix + ' 件 / 済 ' + d.done + ' 件');
      listFor(d.name).forEach(function(r) {
        out.push('  [' + r.verdict + '] ' + r.text);
      });
    });
    return out;
  }

  function clearDoc(name) {
    var all = _load();
    var doc = String(name == null ? '' : name);
    if (!Object.prototype.hasOwnProperty.call(all, doc)) return false;
    delete all[doc];
    _persist();
    return true;
  }

  function clear() { _all = {}; _persist(); }

  // テスト用。localStorage を差し替えたあとに読み直させる。
  function _reset() { _all = null; }

  return {
    KEY: KEY,
    DONE: DONE,
    FIX: FIX,
    rowKey: rowKey,
    isVerdict: isVerdict,
    parse: parse,
    serialize: serialize,
    set: set,
    toggle: toggle,
    get: get,
    verdictOf: verdictOf,
    listFor: listFor,
    counts: counts,
    docs: docs,
    totals: totals,
    summaryText: summaryText,
    bannerText: bannerText,
    digestLines: digestLines,
    clearDoc: clearDoc,
    clear: clear,
    _reset: _reset,
  };
})();
