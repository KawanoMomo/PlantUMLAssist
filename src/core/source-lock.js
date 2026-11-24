'use strict';
window.MA = window.MA || {};

// source-lock — 一覧から開いたファイルを「読むだけの回」に書き戻さない。
//
// 保存先の図を開いて眺めるだけなら、本文は開いたときのままで、ファイルは既にその内容。
// そこへ自動保存が書くと、改行コードや最終更新が動くだけで得るものが無い。
// 開いたときの本文の指紋を憶え、本文が同じ間は書かない (skip)。本文を変えたら錠を外し、
// 以後はほかの図と同じく Ctrl+S と自動保存でそのファイルへ書く (確認の窓は出さない)。
// DOM にも fetch にも触らない。実行は app.js。
window.MA.sourceLock = (function() {
  var KEY = 'plantuml-source-lock';

  function _read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw == null) return {};
      var v = JSON.parse(raw);
      return (v && typeof v === 'object') ? v : {};
    } catch (e) {
      return {};
    }
  }
  function _write(map) {
    try { window.localStorage.setItem(KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }
  }

  // 開いたときの本文の指紋。FNV-1a 32bit (要るのは「同じ本文なら同じ値」だけ)。
  // 改行コードの違いは同じ本文とみなす。
  function fingerprint(dsl) {
    var s = String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  // mark(docId, originName, originDsl) — 既存ファイルを開いて作った / 読み直したタブに錠をかける。
  // 同じファイルで既に錠があれば上書きしない。
  function mark(docId, originName, originDsl) {
    if (!docId || !originName) return null;
    var map = _read();
    if (map[docId] && map[docId].origin === originName) return map[docId];
    map[docId] = { origin: originName, opened: originDsl == null ? null : fingerprint(originDsl) };
    _write(map);
    return map[docId];
  }

  function release(docId) {
    if (!docId) return false;
    var map = _read();
    if (!(docId in map)) return false;
    delete map[docId];
    _write(map);
    return true;
  }

  function clearAll() { _write({}); }

  // decide(docId, dsl) — 自動保存・書き戻しが今書いてよいか。
  //   { action: 'skip' }  … 開いたときの本文のまま。書かない
  //   { action: 'write' } … 書く (本文を変えたので錠を外す。以後は聞かずに書く)
  function decide(docId, dsl) {
    var e = docId ? _read()[docId] : null;
    if (!e) return { action: 'write' };
    if (typeof dsl === 'string' && e.opened && fingerprint(dsl) === e.opened) {
      return { action: 'skip', reason: 'unchanged' };
    }
    release(docId);
    return { action: 'write' };
  }

  // isUnchanged(docId, dsl) — 開いたときの本文のままか (錠は外さない。読むだけ)。
  // タブの × が「開いて眺めただけの図」を聞かずに閉じるのに使う (ファイルは既にこの内容)。
  function isUnchanged(docId, dsl) {
    var e = docId ? _read()[docId] : null;
    return !!(e && e.opened && typeof dsl === 'string' && fingerprint(dsl) === e.opened);
  }

  return {
    mark: mark,
    fingerprint: fingerprint,
    release: release,
    clearAll: clearAll,
    decide: decide,
    isUnchanged: isUnchanged,
  };
})();
