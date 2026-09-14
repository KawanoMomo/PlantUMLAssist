'use strict';
window.MA = window.MA || {};
// label-colors — design 2b「本文 / Label」の色パネル。
//
// 色は毎回使うものではないのに、今までツールバーに 7 個の見本が並びっぱなしで、
// 280px の右パネルではツールバーが 2 段に折り返していた。design 2b は色を `···` の
// 内側に畳み、パネルの中に「文字色 / Text color」「最近使った色」「色を外す」を置く。
//
// ここには「最近使った色」の出し入れと色の妥当性判定だけを置く (DOM に触らない)。
window.MA.labelColors = (function() {
  // 既定の見本。今までツールバーに出ていた 7 色をそのまま持つ (見た目を変えない)。
  var PALETTE = [
    { value: '#f74a4a', label: '赤' },
    { value: '#ffa657', label: '橙' },
    { value: '#f1e05a', label: '黄' },
    { value: '#7ee787', label: '緑' },
    { value: '#7c8cf8', label: '青' },
    { value: '#d2a8ff', label: '紫' },
    { value: '#8b949e', label: '灰' },
  ];

  var RECENT_KEY = 'pua.label.recentColors';
  var RECENT_MAX = 5;

  // PlantUML の `<color:...>` に入れてよい形。`#rgb` / `#rrggbb` と色名を許す。
  function isColor(v) {
    if (typeof v !== 'string') return false;
    var s = v.trim();
    if (!s) return false;
    if (/^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s)) return true;
    return /^[A-Za-z]+$/.test(s);
  }

  // 使った色を先頭に積む。同じ色は 1 つに畳み、max 件で切る。
  // 元の配列は変えない (呼び出し側が古い配列を持ったままでも壊れない)。
  function push(recent, color, max) {
    var cap = typeof max === 'number' && max > 0 ? max : RECENT_MAX;
    if (!isColor(color)) return (recent || []).slice(0, cap);
    var out = [color];
    (recent || []).forEach(function(c) {
      if (c !== color && isColor(c) && out.length < cap) out.push(c);
    });
    return out;
  }

  // 保存されている値を読む。壊れていれば空配列 (色を使えなくはしない)。
  function load(storage, key) {
    if (!storage || !storage.getItem) return [];
    var raw = null;
    try { raw = storage.getItem(key || RECENT_KEY); } catch (e) { return []; }
    if (!raw) return [];
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!arr || typeof arr.length !== 'number') return [];
    var out = [];
    for (var i = 0; i < arr.length && out.length < RECENT_MAX; i++) {
      if (isColor(arr[i]) && out.indexOf(arr[i]) === -1) out.push(arr[i]);
    }
    return out;
  }

  function save(storage, key, list) {
    if (!storage || !storage.setItem) return;
    try { storage.setItem(key || RECENT_KEY, JSON.stringify(list || [])); } catch (e) { /* 使えなくても色は選べる */ }
  }

  // 選択範囲から色指定だけを剥がす (「色を外す」)。
  function stripColor(s) {
    return String(s == null ? '' : s)
      .replace(/<color:[^>]*>/g, '')
      .replace(/<\/color>/g, '');
  }

  return {
    PALETTE: PALETTE,
    RECENT_KEY: RECENT_KEY,
    RECENT_MAX: RECENT_MAX,
    isColor: isColor,
    push: push,
    load: load,
    save: save,
    stripColor: stripColor,
  };
})();
