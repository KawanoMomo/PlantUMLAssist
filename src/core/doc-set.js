'use strict';
window.MA = window.MA || {};

// doc-set — 「資料セット」= 名前を付けて登録した図の組。
//
// BLK-primary-20260914-2006-wish: 「全図を SVG で保存 (zip)」の対象は
// 今開いているタブだけだった。保存フォルダに 25 枚あってもタブが 1 枚なら
// zip には 1 枚しか入らず、しかも zip を開くまで気付けない。前回は一覧で
// 全部に印を付け、タブで開き直してから書き出して 24 枚を出した。
// 「開いている枚数」は資料の内容と何の関係も無いのに、書き出すたびに
// 数え直さないと事故る。
//
// 資料に入れる図の組は、タブの状態ではなく利用者の決めごとなので、名前を付けて
// 保存フォルダ側に置く (図と同じフォルダの持ち物。ブラウザやプロファイルが
// 変わっても残る)。以降は名前を選ぶだけで、常にその枚数が zip に入る。
//
// ここは組の並べ方と突き合わせだけを持つ。保存は server、描画は app.js の職掌。
window.MA.docSet = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _time(at) {
    var t = Date.parse(_s(at));
    return isNaN(t) ? 0 : t;
  }

  // 図名の並び。空と重複は落とし、登録した順を保つ
  // (並びは資料に貼る順でもあるので、名前順には並べ替えない)。
  function normalizeDocs(docs) {
    var out = [];
    (docs || []).forEach(function(d) {
      var v = _s(typeof d === 'string' ? d : (d && d.name)).trim();
      if (v !== '' && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  // normalize(sets) — server から来たセットを {name, docs, at} に揃える。
  // 名前の無いもの・図が 1 枚も無いものはセットではないので落とす
  // (空のセットを選べてしまうと、また 0 枚の zip が出る)。
  function normalize(sets) {
    var out = [];
    var seen = {};
    (Array.isArray(sets) ? sets : []).forEach(function(s) {
      var name = _s(s && s.name).trim();
      var docs = normalizeDocs(s && s.docs);
      if (name === '' || docs.length === 0 || seen[name]) return;
      seen[name] = true;
      out.push({ name: name, docs: docs, at: _s(s && s.at) });
    });
    out.sort(function(a, b) { return _time(b.at) - _time(a.at); });
    return out;
  }

  function find(sets, name) {
    var want = _s(name).trim();
    var rows = normalize(sets);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].name === want) return rows[i];
    }
    return null;
  }

  // resolve(set, folderNames) — 登録した図が今のフォルダに何枚在るか。
  // 欠けている図を名指しするのが肝で、「N 枚のはずが M 枚しか出ない」を
  // zip を開く前に言い切れるようにする。
  function resolve(set, folderNames) {
    var docs = normalizeDocs(set && set.docs);
    var have = {};
    normalizeDocs(folderNames).forEach(function(n) { have[n] = true; });
    var present = [];
    var missing = [];
    docs.forEach(function(n) { (have[n] ? present : missing).push(n); });
    return { name: _s(set && set.name), docs: docs, present: present, missing: missing,
             expected: docs.length, ready: missing.length === 0 };
  }

  // 対象が何枚かを 1 文で言う。書き出す前に必ず読ませる文なので、
  // 「揃っている」ときも枚数を言い切る (黙ると数え直しが戻ってくる)。
  function summary(res) {
    var r = res || {};
    var exp = r.expected || 0;
    if (exp === 0) return '図が登録されていません';
    if (r.missing && r.missing.length > 0) {
      return exp + ' 枚のうち ' + r.present.length + ' 枚だけが保存フォルダにあります（欠け: '
        + r.missing.join('、') + '）';
    }
    return exp + ' 枚すべてが保存フォルダにあります';
  }

  function summaryClass(res) {
    var r = res || {};
    if (!r.expected) return 'ds-empty';
    return (r.missing && r.missing.length > 0) ? 'ds-short' : 'ds-ready';
  }

  // upsert(sets, name, docs) — 同じ名前は 1 つ。上書きすると先頭に上がる。
  function upsert(sets, name, docs, at) {
    var want = _s(name).trim();
    var rows = normalizeDocs(docs);
    if (want === '' || rows.length === 0) return normalize(sets);
    var kept = normalize(sets).filter(function(s) { return s.name !== want; });
    kept.unshift({ name: want, docs: rows, at: _s(at) || new Date().toISOString() });
    return kept;
  }

  function remove(sets, name) {
    var want = _s(name).trim();
    return normalize(sets).filter(function(s) { return s.name !== want; });
  }

  // 登録するときの既定の名前。利用者に名前を考えさせずに 1 つ作れるようにする
  // (名前を要求すると「作る」の手数が増え、結局タブで開き直す方が速くなる)。
  function defaultName(sets, now) {
    var d = now instanceof Date ? now : new Date();
    var base = '資料セット '
      + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var taken = {};
    normalize(sets).forEach(function(s) { taken[s.name] = true; });
    if (!taken[base]) return base;
    for (var i = 2; i < 100; i++) {
      if (!taken[base + ' (' + i + ')']) return base + ' (' + i + ')';
    }
    return base + ' (' + Date.now() + ')';
  }

  return {
    normalize: normalize,
    normalizeDocs: normalizeDocs,
    find: find,
    resolve: resolve,
    summary: summary,
    summaryClass: summaryClass,
    upsert: upsert,
    remove: remove,
    defaultName: defaultName,
  };
})();
