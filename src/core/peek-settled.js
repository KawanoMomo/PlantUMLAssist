'use strict';
window.MA = window.MA || {};

// peek-settled — 「この相手のこの図種は手本なし」と一度確定したら、二度と聞かない
// (BLK-junior-20260916-2314-wish)。
//
// 👀他フォルダの「相手に ○○ は 0 枚です。対応不要として控えますか」の答えは、開いている
// 1 枚の図の中 (@peek 行) にしか残らなかった。周が替わって別の図を開くと、答えが何周も
// 変わらないのに同じ質問が図種の数だけ出る。確定は保存フォルダの決めごととして
// server (GET/POST /peek-settled) に置き、ここはその一覧を扱う純関数だけを持つ。
window.MA.peekSettled = (function() {

  function _s(v) { return v == null ? '' : String(v).trim(); }

  function find(rows, peer, kind) {
    rows = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && _s(rows[i].peer) === _s(peer) && _s(rows[i].kind) === _s(kind)) return rows[i];
    }
    return null;
  }

  function normalize(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function(r) {
      if (!r || !_s(r.peer) || !_s(r.kind)) return;
      if (find(out, r.peer, r.kind)) return;       // 先に来た (新しい) 方を採る
      var n = parseInt(r.count, 10);
      out.push({ peer: _s(r.peer), kind: _s(r.kind), count: isNaN(n) ? 0 : n, at: _s(r.at) });
    });
    return out;
  }

  function has(rows, peer, kind) { return !!find(rows, peer, kind); }

  function add(rows, rec) {
    var rest = normalize(rows).filter(function(r) {
      return !(r.peer === _s(rec && rec.peer) && r.kind === _s(rec && rec.kind));
    });
    return normalize([rec].concat(rest));
  }

  function remove(rows, peer, kind) {
    return normalize(rows).filter(function(r) { return !(r.peer === _s(peer) && r.kind === _s(kind)); });
  }

  // 相手に図が増えたら、確定は古い。そのときだけ聞き直す。
  function isStale(rec, nowCount) {
    return !!rec && Number(nowCount || 0) > 0;
  }

  // 1 行にまとめる:「✓ primary は手本なしで確定: ユースケース / コンポーネント（以後は聞きません）」
  function summaryText(peer, kinds) {
    if (!kinds || !kinds.length) return '';
    return '✓ ' + (_s(peer) || '相手') + ' は手本なしで確定: ' + kinds.join(' / ') + '（以後は聞きません）';
  }

  function staleText(peer, kind, count) {
    return '要確認 ' + kind + ': 手本なしで確定していましたが、' + (_s(peer) || '相手')
      + ' に ' + Number(count || 0) + ' 枚増えました';
  }

  return {
    normalize: normalize, find: find, has: has, add: add, remove: remove,
    isStale: isStale, summaryText: summaryText, staleText: staleText,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MA.peekSettled;
