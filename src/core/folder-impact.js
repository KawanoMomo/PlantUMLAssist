'use strict';
window.MA = window.MA || {};

// folder-impact — 一括置換の影響範囲を「開いていない図も含めて」数える。
//
// ⇄一括置換のヒット数は今開いているタブしか
// 数えないので、22 枚のうち 1 枚を開いたまま置換すると、残り 21 枚に同じ名前が
// 何件あるかは分からない。仕様変更が全図に及んだかを確かめるには、結局 15 枚を
// 1 枚ずつ開き直して目で見るしかなかった。
//
// 保存フォルダの全ファイルを先に数えて「ヒットした図 / しなかった図」を
// 一覧で出せば、開き直す手順そのものが要らなくなる。
//
// ヒットした図は全部が置換の的 (保存先の「テンプレ」宣言で的から外す分岐は
// TICKET-owner-20261122-1140-prune で外した。見本の図を守るのは Git と FILES の「読むだけ」)。
//
// DOM も fetch も触らない。読み込みは app.js。
window.MA.folderImpact = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 開いているタブと保存フォルダのファイルを 1 本の一覧にする。
  // 同名なら開いているタブを採る — 未保存の編集分が入っているのはこちら。
  // 並びは「開いている図が先、その後フォルダの順」。置換の主語は今の作業画面で、
  // フォルダは影響範囲としてその後ろに続く、という読み順に合わせる。
  //
  // 保存先の下の木 (サブフォルダ) の図も数える (TICKET-roadmap-20261123-0226-1)。
  // 同じ名前の図が直下と docs/api にあれば別の図なので、名前では畳まず「居場所の鍵」で畳む。
  // 鍵は keyOf: 直下の図は名前そのまま (今までの一覧・過去の置換の組と同じ)、サブフォルダの図は
  // フォルダの絶対パスと名前。行の見出し (label) はサブフォルダの図だけ道付き (docs/api/Foo)。
  function _normDir(p) {
    return _s(p).split(String.fromCharCode(92)).join('/').replace(/\/+$/, '').toLowerCase();
  }
  function keyOf(name, subDir) {
    var n = _s(name);
    return subDir ? 'sub:' + _normDir(subDir) + '|' + n : n;
  }
  function _row(d, open) {
    var name = _s(d.name);
    var rel = _s(d.rel);
    return {
      id: open ? d.id : 'file:' + _s(d.key || name),
      key: _s(d.key || name),
      name: name,
      label: _s(d.label || (rel ? rel + '/' + name : name)),
      rel: rel,
      dir: d.dir || null,
      dsl: _s(d.dsl),
      open: open,
    };
  }
  function merge(openDocs, fileDocs) {
    var out = [];
    var seen = {};
    (Array.isArray(openDocs) ? openDocs : []).forEach(function(d) {
      if (!d) return;
      var key = _s(d.key || d.name);
      if (!_s(d.name) || seen[key]) return;
      seen[key] = true;
      out.push(_row(d, true));
    });
    (Array.isArray(fileDocs) ? fileDocs : []).forEach(function(d) {
      if (!d) return;
      var key = _s(d.key || d.name);
      if (!_s(d.name) || seen[key]) return;
      seen[key] = true;
      out.push(_row(d, false));
    });
    return out;
  }

  // 置換の的になるか。一覧に載った図は全部が的。
  function isTarget(row) {
    return !!row;
  }

  // merge した一覧 → [{ id, name, count, open, target }]
  // count は bulkRename と同じ識別子単位の数え方 (SpiDrv は SpiDrvTest を含まない)。
  function preview(rows, from) {
    var br = window.MA.bulkRename;
    if (!br || !Array.isArray(rows)) return [];
    return rows.map(function(r) {
      return {
        id: r && r.id,
        name: r && r.name,
        key: r && (r.key || r.name),
        label: r && (r.label || r.name),
        rel: (r && r.rel) || '',
        count: from ? br.countIn(r && r.dsl, from) : 0,
        open: !!(r && r.open),
        target: isTarget(r),
      };
    });
  }

  // 一覧の読み方を 1 行にする。「何枚見て、何枚に当たったか」。
  function summarize(pv) {
    var s = { files: 0, hitDocs: 0, missDocs: 0, total: 0, openHitDocs: 0,
              unopenedHitDocs: 0, applyDocs: 0, applyTotal: 0 };
    (Array.isArray(pv) ? pv : []).forEach(function(r) {
      if (!r) return;
      s.files++;
      if (r.count > 0) {
        s.hitDocs++;
        s.total += r.count;
        if (r.open) s.openHitDocs++; else s.unopenedHitDocs++;
        if (r.target) { s.applyDocs++; s.applyTotal += r.count; }
      } else {
        s.missDocs++;
      }
    });
    return s;
  }

  function summaryText(s) {
    if (!s || s.files === 0) return '保存フォルダを読み込んでいません';
    if (s.hitDocs === 0) return s.files + ' 枚を調べて出現なし';
    var t = s.files + ' 枚中 ' + s.hitDocs + ' 枚に ' + s.total + ' 件';
    if (s.unopenedHitDocs > 0) t += ' (未オープン ' + s.unopenedHitDocs + ' 枚を含む)';
    return t;
  }

  // ヒットした図 → ヒットしなかった図の順。ヒット内は件数の多い順、
  // 同数なら一覧の並び順のまま (どこを先に見ればよいかが上から決まる)。
  function sortForDisplay(pv) {
    var list = (Array.isArray(pv) ? pv : []).slice();
    return list.map(function(r, i) { return { r: r, i: i }; }).sort(function(a, b) {
      var ah = a.r && a.r.count > 0 ? 1 : 0;
      var bh = b.r && b.r.count > 0 ? 1 : 0;
      if (ah !== bh) return bh - ah;
      if (ah === 1 && a.r.count !== b.r.count) return b.r.count - a.r.count;
      return a.i - b.i;
    }).map(function(x) { return x.r; });
  }

  // 置換の的になる行だけ (ヒット 0 を落とす)。apply へ渡す。
  function applyTargets(rows, from) {
    var br = window.MA.bulkRename;
    if (!br || !Array.isArray(rows) || !from) return [];
    return rows.filter(function(r) {
      return isTarget(r) && br.countIn(r && r.dsl, from) > 0;
    });
  }

  return {
    merge: merge,
    keyOf: keyOf,
    isTarget: isTarget,
    preview: preview,
    summarize: summarize,
    summaryText: summaryText,
    sortForDisplay: sortForDisplay,
    applyTargets: applyTargets,
  };
})();
