'use strict';
window.MA = window.MA || {};

// folder-impact — 一括置換の影響範囲を「開いていない図も含めて」数える。
//
// BLK-primary-20260908-0723-wish: ⇄一括置換のヒット数は今開いているタブしか
// 数えないので、22 枚のうち 1 枚を開いたまま置換すると、残り 21 枚に同じ名前が
// 何件あるかは分からない。仕様変更が全図に及んだかを確かめるには、結局 15 枚を
// 1 枚ずつ開き直して目で見るしかなかった。
//
// 保存フォルダの全ファイルを先に数えて「ヒットした図 / しなかった図」を
// 一覧で出せば、開き直す手順そのものが要らなくなる。
//
// テンプレ (file-role の template) は中身が変わらないはずのものなので、
// 数えはするが置換の的からは外す。ここで混ぜると一括置換がテンプレ汚染の
// 発生源になり、reviewer が毎 run 手動 diff で切り分ける仕事に戻る。
//
// DOM も fetch も触らない。読み込みは app.js。
window.MA.folderImpact = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 開いているタブと保存フォルダのファイルを 1 本の一覧にする。
  // 同名なら開いているタブを採る — 未保存の編集分が入っているのはこちら。
  // 並びは「開いている図が先、その後フォルダの順」。置換の主語は今の作業画面で、
  // フォルダは影響範囲としてその後ろに続く、という読み順に合わせる。
  function merge(openDocs, fileDocs, roles) {
    var out = [];
    var seen = {};
    var rmap = roles && typeof roles === 'object' ? roles : {};
    function role(name) {
      var rec = rmap[name];
      var r = rec && typeof rec === 'object' ? _s(rec.role) : _s(rec);
      return (r === 'data' || r === 'template') ? r : 'unset';
    }
    (Array.isArray(openDocs) ? openDocs : []).forEach(function(d) {
      if (!d) return;
      var name = _s(d.name);
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push({ id: d.id, name: name, dsl: _s(d.dsl), open: true, role: role(name) });
    });
    (Array.isArray(fileDocs) ? fileDocs : []).forEach(function(d) {
      if (!d) return;
      var name = _s(d.name);
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push({ id: 'file:' + name, name: name, dsl: _s(d.dsl), open: false, role: role(name) });
    });
    return out;
  }

  // 置換の的になるか。テンプレは数えるだけで書き換えない。
  function isTarget(row) {
    return !!row && row.role !== 'template';
  }

  // merge した一覧 → [{ id, name, count, open, role, target }]
  // count は bulkRename と同じ識別子単位の数え方 (SpiDrv は SpiDrvTest を含まない)。
  function preview(rows, from) {
    var br = window.MA.bulkRename;
    if (!br || !Array.isArray(rows)) return [];
    return rows.map(function(r) {
      return {
        id: r && r.id,
        name: r && r.name,
        count: from ? br.countIn(r && r.dsl, from) : 0,
        open: !!(r && r.open),
        role: (r && r.role) || 'unset',
        target: isTarget(r),
      };
    });
  }

  // 一覧の読み方を 1 行にする。「何枚見て、何枚に当たって、何枚は的から外れたか」。
  function summarize(pv) {
    var s = { files: 0, hitDocs: 0, missDocs: 0, total: 0, openHitDocs: 0,
              unopenedHitDocs: 0, templateHitDocs: 0, applyDocs: 0, applyTotal: 0 };
    (Array.isArray(pv) ? pv : []).forEach(function(r) {
      if (!r) return;
      s.files++;
      if (r.count > 0) {
        s.hitDocs++;
        s.total += r.count;
        if (r.open) s.openHitDocs++; else s.unopenedHitDocs++;
        if (r.role === 'template') s.templateHitDocs++;
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
    if (s.templateHitDocs > 0) t += ' / テンプレ ' + s.templateHitDocs + ' 枚は置換しない';
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

  // 置換の的になる行だけ (テンプレとヒット 0 を落とす)。apply へ渡す。
  function applyTargets(rows, from) {
    var br = window.MA.bulkRename;
    if (!br || !Array.isArray(rows) || !from) return [];
    return rows.filter(function(r) {
      return isTarget(r) && br.countIn(r && r.dsl, from) > 0;
    });
  }

  return {
    merge: merge,
    isTarget: isTarget,
    preview: preview,
    summarize: summarize,
    summaryText: summaryText,
    sortForDisplay: sortForDisplay,
    applyTargets: applyTargets,
  };
})();
