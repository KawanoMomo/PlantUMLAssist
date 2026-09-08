'use strict';
window.MA = window.MA || {};

// material-board — 「部品の資料一式」。設計書に貼る資料は 1 部品の複数図種で 1 組
// なのに、資料化は 1 枚ずつ (部品と図種を選んで押す) しかできなかった。どの図種の
// 資料用がまだ無いか・元の図が資料用より新しくなっていないかは、保存フォルダの
// 名前と日時を人が読み比べないと分からず、開いてから初めて気付いていた。
//
// BLK-junior-20260909-0003-wish: 部品を選ぶと、その部品の図種を全部並べ、
// 「資料用なし / 元が新しい / 最新」を行ごとに出し、手当てが要る図種だけを
// まとめて 1 回で書き出せるようにする。
//
// 形式の決まり (状態遷移図 = SVG、他 = PNG 透過) と題名の (資料用) は
// materialExport が持つ。ここは持たない — 2 か所に置くと 1 枚の資料化と
// まとめの資料化で形式がずれる。部品の括りと図種は componentPack に任せる。
// DOM・fetch・localStorage には触らない。
window.MA.materialBoard = (function() {

  var STATUS = {
    none: { id: 'none', label: '資料用なし', mark: '未', rank: 0 },
    stale: { id: 'stale', label: '元が新しい', mark: '古', rank: 1 },
    fresh: { id: 'fresh', label: '最新', mark: '済', rank: 2 },
  };

  function _s(v) { return v == null ? '' : String(v); }
  function _cp() { return window.MA.componentPack; }
  function _me() { return window.MA.materialExport; }

  // entries は listFileEntries の {name, mtime} でも、listFiles の文字列配列でもよい
  // (呼ぶ側が日時を取れないときは日時なしで並べ、鮮度だけ「分からない」に倒す)。
  function _norm(entries) {
    var out = [];
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      if (typeof e === 'string') { if (e !== '') out.push({ name: e, mtime: null }); return; }
      if (e && typeof e.name === 'string' && e.name !== '') {
        out.push({ name: e.name, mtime: e.mtime == null ? null : e.mtime });
      }
    });
    return out;
  }

  function _names(entries) {
    return _norm(entries).map(function(e) { return e.name; });
  }

  function _time(v) {
    if (v == null || v === '') return null;
    var n = (typeof v === 'number') ? v : Date.parse(v);
    return isFinite(n) ? n : null;
  }

  // 資料用の版かどうか。componentPack の版表記 ((資料用) など) で見る。
  function isMaterial(name) {
    var cp = _cp();
    if (!cp) return false;
    return /資料用/.test(cp.variantOf(name));
  }

  function components(entries) {
    var me = _me();
    if (!me) return [];
    return me.components(_names(entries));
  }

  function _group(entries, component) {
    var list = components(entries);
    var want = _s(component);
    for (var i = 0; i < list.length; i++) if (list[i].component === want) return list[i];
    return null;
  }

  // 図種の並びは設計書に貼る順 (componentPack の並び) に合わせる。
  // 資料をこの順に作れば、そのまま設計書の図番号の順になる。
  function _rank(kind) {
    var cp = _cp();
    var order = (cp && cp.KIND_ORDER) ? cp.KIND_ORDER : [];
    var at = order.indexOf(_s(kind));
    return at < 0 ? order.length : at;
  }

  // rows(entries, component) — 画面に出す 1 部品ぶんの表。
  // 図種ごとに「元の図 / 資料用の版 / 形式 / 状態」を 1 行にする。
  function rows(entries, component) {
    var me = _me();
    var cp = _cp();
    var g = _group(entries, component);
    if (!me || !cp || !g) return [];

    var byName = {};
    _norm(entries).forEach(function(e) { byName[e.name] = e.mtime; });

    var out = g.kinds.map(function(kind) {
      var mine = g.files.filter(function(f) { return cp.kindOf(f) === kind; });
      var source = me.pickSource(mine.filter(function(f) { return !isMaterial(f); }), kind);
      // 元の版が無く資料用しか残っていないなら、その資料用を元として扱う
      // (作り直しの元がそれしかない)。
      if (!source) source = me.pickSource(mine, kind);
      var materials = mine.filter(isMaterial).sort();
      var material = materials.length ? materials[materials.length - 1] : '';
      var format = me.formatFor(kind);
      var srcAt = _time(byName[source]);
      var matAt = _time(byName[material]);

      var status = 'none';
      if (material) {
        // 日時が取れないときは「最新」に倒さない — 古い資料を最新と言い切ると、
        // 直したはずの図が古いまま設計書に貼られる。
        status = (srcAt != null && matAt != null && srcAt > matAt) ? 'stale' : 'fresh';
      }
      return {
        kind: kind,
        source: source,
        material: material,
        format: format,
        formatLabel: me.formatLabel(format),
        filename: me.materialTitle(source) + me.formatExt(format),
        sourceAt: srcAt,
        materialAt: matAt,
        status: status,
        statusLabel: STATUS[status].label,
        statusMark: STATUS[status].mark,
        needsWork: status !== 'fresh',
      };
    }).filter(function(r) { return r.source !== ''; });

    out.sort(function(a, b) {
      var d = _rank(a.kind) - _rank(b.kind);
      return d !== 0 ? d : (a.kind < b.kind ? -1 : (a.kind > b.kind ? 1 : 0));
    });
    return out;
  }

  // pendingKinds(rows) — 開いた時点で選ばれている図種 (手当てが要るものだけ)。
  // 最新の図種まで既定で選ぶと、変わっていない図まで毎回描き直すことになる。
  function pendingKinds(list) {
    return (Array.isArray(list) ? list : [])
      .filter(function(r) { return r && r.needsWork; })
      .map(function(r) { return r.kind; });
  }

  // summaryText(rows) — 見出しの 1 行。数えるのは人ではなくここ。
  function summaryText(list) {
    var rs = Array.isArray(list) ? list : [];
    if (!rs.length) return 'この部品には資料化できる図がありません。';
    var n = { none: 0, stale: 0, fresh: 0 };
    rs.forEach(function(r) { n[r.status] = (n[r.status] || 0) + 1; });
    var head = rs.length + ' 図種／資料用なし ' + n.none + '・元が新しい ' + n.stale + '・最新 ' + n.fresh;
    if (n.none + n.stale === 0) return head + '（すべて最新です）';
    return head + '（' + (n.none + n.stale) + ' 図種の資料化が要ります）';
  }

  // rowText(row) — 行の説明。何が元で、何の形式で、何という名前で出るか。
  function rowText(r) {
    if (!r) return '';
    if (r.status === 'none') return r.source + ' の資料用がまだありません → ' + r.filename;
    if (r.status === 'stale') return r.material + ' より ' + r.source + ' が新しいので作り直します';
    return r.material + ' は元の図より新しい（作り直し不要）';
  }

  // plans(entries, component, kinds) — 押したら順に流す計画。1 枚の資料化と同じ
  // materialExport.plan を使う (形式・題名の決まりを 1 か所に保つ)。
  function plans(entries, component, kinds) {
    var me = _me();
    if (!me) return [];
    var names = _names(entries);
    var want = (Array.isArray(kinds) ? kinds : []).map(_s);
    var order = rows(entries, component);
    var out = [];
    order.forEach(function(r) {
      if (want.indexOf(r.kind) < 0) return;
      var p = me.plan(names, component, r.kind);
      if (p) out.push(p);
    });
    return out;
  }

  function runText(list) {
    var n = (Array.isArray(list) ? list : []).length;
    if (!n) return '資料化する';
    return '選んだ ' + n + ' 図種を資料化する';
  }

  function emptyText(entries) {
    if (!components(entries).length) {
      return '保存フォルダに図がありません。図を保存すると資料一式を作れます。';
    }
    return '';
  }

  // doneMessage(results) — 何枚出て、何が失敗したか。まとめて流すので、
  // 「全部できた」か「どれが落ちたか」を 1 行で言えないと確かめ直しになる。
  function doneMessage(results) {
    var rs = Array.isArray(results) ? results : [];
    var ok = rs.filter(function(r) { return r && r.ok; });
    var ng = rs.filter(function(r) { return !r || !r.ok; });
    if (!rs.length) return '資料化する図種が選ばれていません';
    if (!ng.length) return '📚 ' + ok.length + ' 図種を資料化しました（保存フォルダと提出物庫にも入れました）';
    var names = ng.map(function(r) { return (r && r.kind) ? r.kind : '不明'; }).join('・');
    return '📚 ' + ok.length + ' 図種を資料化しましたが、' + ng.length + ' 図種が失敗しました：' + names;
  }

  return {
    STATUS: STATUS,
    isMaterial: isMaterial,
    components: components,
    rows: rows,
    pendingKinds: pendingKinds,
    summaryText: summaryText,
    rowText: rowText,
    plans: plans,
    runText: runText,
    emptyText: emptyText,
    doneMessage: doneMessage,
  };
})();
