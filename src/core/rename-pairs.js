'use strict';
window.MA = window.MA || {};

// rename-pairs — 「過去に打った置換の組」を保存フォルダ側の持ち物にする
// (BLK-primary-20260914-1306-friction)。
//
// 組の記憶は localStorage の改名履歴にしか無かった。履歴は置換が当たったとき
// (docs が 1 枚以上) にだけ増えるので、
//   ・当たらなかった組 (もう全部置換済みで、それを確かめたかっただけの組)
//   ・ブラウザやプロファイルが変わった後
// のどちらでも組は消え、同じ SpiDrv → Spi_Driver を毎回打ち直すことになる。
// 図が保存フォルダの持ち物である以上、その図に当てた組もフォルダの持ち物なので、
// server 側 (`_renames/pairs.json`) に置いて run をまたいで残す。
//
// ここは組の並べ方だけを持つ。保存は server、表示は rename-redo の職掌。
window.MA.renamePairs = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _time(at) {
    var t = Date.parse(_s(at));
    return isNaN(t) ? 0 : t;
  }

  // normalize(pairs) — server から来た組を、履歴と同じ形 {from, to, at} にする。
  // from か to が欠けたものは組ではないので落とす。
  // appliedAt は [置換] で当てた最後の日時 (BLK-primary-20260914-1106-friction)。
  // 打っただけで当てなかった組は空のまま。server の applied_at も同じ意味で読む。
  function normalize(pairs) {
    return (Array.isArray(pairs) ? pairs : []).map(function(p) {
      return { from: _s(p && p.from), to: _s(p && p.to), at: _s(p && p.at),
        appliedAt: _s(p && (p.appliedAt || p.applied_at)) };
    }).filter(function(p) { return p.from !== '' && p.to !== ''; });
  }

  // merge(folder, history) — フォルダの組と localStorage の改名履歴を 1 本にする。
  // 同じ組は新しい方の日時だけを残し、日時の新しい順に並べる
  // (日時を持たない記録は最後尾。順序が消えるだけで、組そのものは残す)。
  function merge(folder, history) {
    var rows = normalize(folder).concat(normalize(history));
    var seen = {};
    var out = [];
    rows.forEach(function(r) {
      var key = r.from + '\u0000' + r.to;
      var prev = seen[key];
      if (prev) {
        if (_time(r.at) > _time(prev.at)) prev.at = r.at;
        if (_time(r.appliedAt) > _time(prev.appliedAt)) prev.appliedAt = r.appliedAt;
        return;
      }
      var row = { from: r.from, to: r.to, at: r.at, appliedAt: r.appliedAt };
      seen[key] = row;
      out.push(row);
    });
    out.sort(function(a, b) { return _time(b.at) - _time(a.at); });
    return out;
  }

  // shouldRemember(from, to) — 覚える価値のある組か。
  // 空・同名は組ではない。当たったかどうかは問わない (0 件と分かったこと自体が、
  // 次の run で打ち直さずに済む知識なので覚える)。
  function shouldRemember(from, to) {
    var f = _s(from).trim();
    var t = _s(to).trim();
    return f !== '' && t !== '' && f !== t;
  }

  return {
    normalize: normalize,
    merge: merge,
    shouldRemember: shouldRemember,
  };
})();
