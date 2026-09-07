'use strict';
window.MA = window.MA || {};

// key-bindings — ショートカットの割り当てを差し替える (design 5b)。
//
// design 5b は一覧を出すだけでなく「行をクリックすると割り当てを変更」と
// 「既定に戻す」を求める。キーの覚え方は人によって違い、既に体に入っている
// 別ツールの割り当てに寄せられないと、Ctrl+K に集約した意味が薄れる。
//
// 差し替えの対象は「全体」グループの修飾キー付き 1 打鍵だけにする。
// ↑ / ↓ や Ctrl+1 … Ctrl+6 のような範囲・素キーの行は、押した 1 つのキーでは
// 表せず、衝突判定も成り立たないため remap: false のまま一覧に残す。
//
// ここは DOM に触らない純関数と localStorage だけ。表の描画は settings-tabs、
// 実際のキー処理の結線は app.js。
window.MA.keyBindings = (function() {
  var STORAGE_KEY = 'plantuml-assist-shortcuts';

  // 押されたキーを一覧の表記 (`Ctrl+Shift+S`) にそろえる。
  // 修飾キーだけの打鍵と、修飾なしの打鍵は割り当てとして受けない
  // (素の文字キーを奪うと DSL が打てなくなる)。
  var NAMED = {
    ' ': 'Space', 'Spacebar': 'Space',
    'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    'Escape': 'Esc', 'Esc': 'Esc',
    'Enter': 'Enter', 'Tab': 'Tab', 'Delete': 'Delete', 'Backspace': 'Backspace',
  };
  var MODIFIER_KEYS = { Control: 1, Shift: 1, Alt: 1, Meta: 1, OS: 1, CapsLock: 1 };

  function keyName(raw) {
    var k = String(raw == null ? '' : raw);
    if (NAMED[k]) return NAMED[k];
    if (k.length === 1) return k.toUpperCase();
    return k;
  }

  // e → 'Ctrl+Shift+S'。受けられない打鍵は null。
  function format(e) {
    if (!e) return null;
    if (e.isComposing || e.keyCode === 229) return null;
    var raw = String(e.key || '');
    if (!raw || MODIFIER_KEYS[raw]) return null;
    var ctrl = !!(e.ctrlKey || e.metaKey);
    var alt = !!e.altKey;
    var shift = !!e.shiftKey;
    if (!ctrl && !alt) return null;   // 修飾なし / Shift だけは受けない
    var parts = [];
    if (ctrl) parts.push('Ctrl');
    if (alt) parts.push('Alt');
    if (shift) parts.push('Shift');
    parts.push(keyName(raw));
    return parts.join('+');
  }

  // ── 保存 ────────────────────────────────────────────────────────────
  // localStorage は使えないことがある (about:blank / プライベートウィンドウ)。
  // 差し替えはその場では必ず効かせたいので、正本はメモリに置き、
  // localStorage は「次回起動でも効かせる」ための書き写しとして扱う。
  var _cache = null;

  function _load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return {};
      var out = {};
      Object.keys(obj).forEach(function(id) {
        if (typeof obj[id] === 'string' && obj[id]) out[id] = obj[id];
      });
      return out;
    } catch (err) { return {}; }
  }

  function readOverrides() {
    if (!_cache) _cache = _load();
    var out = {};
    Object.keys(_cache).forEach(function(id) { out[id] = _cache[id]; });
    return out;
  }

  function writeOverrides(map) {
    var next = {};
    Object.keys(map || {}).forEach(function(id) { next[id] = map[id]; });
    _cache = next;
    try {
      if (Object.keys(next).length === 0) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) { /* 保存できなくてもその場の割り当ては効かせる */ }
    return next;
  }

  // ── 既定 ────────────────────────────────────────────────────────────
  // 既定の一覧は settings-tabs が持つ 1 本 (表と割り当てで 2 箇所に書かない)。
  function defaultRows() {
    var ST = window.MA.settingsTabs;
    return (ST && ST.defaultRows) ? ST.defaultRows() : [];
  }

  function rowById(id) {
    var rows = defaultRows();
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function isRemappable(id) {
    var r = rowById(id);
    return !!(r && r.remap);
  }

  // いま効いているキー。差し替えが無ければ既定。
  function keysFor(id, overrides) {
    var ov = overrides || readOverrides();
    if (ov[id] && isRemappable(id)) return ov[id];
    var r = rowById(id);
    return r ? r.keys : '';
  }

  // 同じキーを持つ別の操作。衝突していなければ null。
  function conflictOf(id, keys, overrides) {
    var ov = overrides || readOverrides();
    var rows = defaultRows();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) continue;
      if (keysFor(rows[i].id, ov) === keys) return rows[i];
    }
    return null;
  }

  // 割り当てを差し替える。衝突していれば書かずに相手を返す。
  function setBinding(id, keys, overrides) {
    var ov = overrides || readOverrides();
    if (!isRemappable(id)) return { ok: false, reason: 'not-remappable', overrides: ov };
    if (!keys) return { ok: false, reason: 'empty', overrides: ov };
    var hit = conflictOf(id, keys, ov);
    if (hit) return { ok: false, reason: 'conflict', conflict: hit, overrides: ov };
    var next = {};
    Object.keys(ov).forEach(function(k) { next[k] = ov[k]; });
    var def = rowById(id);
    if (def && def.keys === keys) delete next[id];   // 既定に戻ったら覚えない
    else next[id] = keys;
    writeOverrides(next);
    return { ok: true, overrides: next, keys: keys };
  }

  function resetAll() {
    writeOverrides({});
    return {};
  }

  // keydown がその操作に当たるか。
  function matches(id, e) {
    var k = format(e);
    return !!k && k === keysFor(id);
  }

  // 当たった操作の id。全体グループの割り当ては 1 箇所でここに聞く。
  function matchEvent(e) {
    var k = format(e);
    if (!k) return null;
    var ov = readOverrides();
    var rows = defaultRows();
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].remap) continue;
      if (keysFor(rows[i].id, ov) === k) return rows[i].id;
    }
    return null;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    format: format,
    keyName: keyName,
    readOverrides: readOverrides,
    writeOverrides: writeOverrides,
    defaultRows: defaultRows,
    rowById: rowById,
    isRemappable: isRemappable,
    keysFor: keysFor,
    conflictOf: conflictOf,
    setBinding: setBinding,
    resetAll: resetAll,
    matches: matches,
    matchEvent: matchEvent,
  };
})();
