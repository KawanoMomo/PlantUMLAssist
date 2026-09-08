'use strict';
window.MA = window.MA || {};

// lineage — 「この図はどの図の後継か」を図ごとに 1 回だけ覚える。
//
// BLK-junior-20260908-1603-wish: 先輩の版を土台に自分の版を作る周回では、
// 毎周「先輩の同種図を探す → 開く → 記憶と見比べる」を手でやっていた。
// どの図がどの図から派生したかを画面が覚えていないので、版の連なり
// (通常 → レビュー反映 → 先輩反映) を人間の記憶だけが持っていた。
//
// ここでは子の図に対して
//   ・継承元の図 (保存フォルダと名前)
//   ・取り込んだ時点の継承元の中身 (基準)
// を持ち、いま継承元がどうなっているかを渡せば
//   「継承元が更新されています (前回取り込み時点との差分 N 行)」
// を答える。DOM にも fetch にも触らない純関数だけを置き、
// 継承元の本文を読むのと描画は app.js。
window.MA.lineage = (function() {
  var KEY = 'plantuml-lineage';

  var _map = null;   // { child: { parent, dir, base, at, adoptedAt } }

  // 版の同一判定は save-diff / version-timeline と同じ基準にする。
  // ここが食い違うと「差分あり」と「取り込み済み」で別の答えが出る。
  function normalize(dsl) {
    if (window.MA.saveDiff && window.MA.saveDiff.normalize) {
      return window.MA.saveDiff.normalize(dsl);
    }
    var s = String(dsl == null ? '' : dsl);
    s = s.replace(/\r\n?/g, '\n');
    s = s.replace(/[ \t]+$/gm, '');
    s = s.replace(/\n+$/, '');
    return s;
  }

  function _now() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function _load() {
    if (_map) return _map;
    _map = {};
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw != null) {
        var v = JSON.parse(raw);
        var src = (v && typeof v === 'object' && v.links && typeof v.links === 'object') ? v.links : null;
        for (var k in src) {
          if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
          var e = src[k];
          if (!e || typeof e.parent !== 'string' || !e.parent) continue;
          _map[k] = {
            parent: e.parent,
            dir: typeof e.dir === 'string' ? e.dir : '',
            base: typeof e.base === 'string' ? e.base : '',
            at: typeof e.at === 'string' ? e.at : '',
            adoptedAt: typeof e.adoptedAt === 'string' ? e.adoptedAt : '',
          };
        }
      }
    } catch (e) { /* 壊れていたら関係なしから始める */ }
    return _map;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ links: _load() }));
      return true;
    } catch (e) { return false; }
  }

  // 継承元を登録する。登録した時点の継承元の中身が「取り込み済みの基準」になる
  // (登録直後に「更新されています」と言われては、登録した意味がないため)。
  function set(child, parent, parentDsl, opts) {
    if (!child || !parent) return null;
    if (child === parent) return null;   // 自分は自分の継承元になれない
    opts = opts || {};
    var at = opts.at || _now();
    var rec = {
      parent: parent,
      dir: typeof opts.dir === 'string' ? opts.dir : '',
      base: normalize(parentDsl),
      at: at,
      adoptedAt: at,
    };
    _load()[child] = rec;
    _persist();
    return _copy(rec);
  }

  function _copy(rec) {
    if (!rec) return null;
    return {
      parent: rec.parent, dir: rec.dir, base: rec.base,
      at: rec.at, adoptedAt: rec.adoptedAt,
    };
  }

  function get(child) {
    if (!child) return null;
    return _copy(_load()[child] || null);
  }

  function clear(child) {
    var m = _load();
    if (!Object.prototype.hasOwnProperty.call(m, child)) return false;
    delete m[child];
    _persist();
    return true;
  }

  // 継承元を登録している図の名前 (名前順)。
  function children() {
    var m = _load();
    var out = [];
    for (var k in m) {
      if (Object.prototype.hasOwnProperty.call(m, k)) out.push(k);
    }
    out.sort();
    return out;
  }

  // 行の増減。version-timeline / save-diff と同じ数え方 (行の多重集合の差)。
  function delta(before, after) {
    var prev = String(before == null ? '' : before);
    var now = String(after == null ? '' : after);
    var prevLines = prev === '' ? [] : prev.split('\n');
    var nowLines = now === '' ? [] : now.split('\n');
    var count = {};
    prevLines.forEach(function(l) { count[l] = (count[l] || 0) + 1; });
    var added = 0;
    nowLines.forEach(function(l) {
      if (count[l]) count[l]--;
      else added++;
    });
    var removed = 0;
    for (var k in count) {
      if (Object.prototype.hasOwnProperty.call(count, k)) removed += count[k];
    }
    return { added: added, removed: removed, changed: added + removed };
  }

  // いまの継承元の本文を渡すと、取り込み時点から何行動いたかを返す。
  // currentParentDsl が null (読めなかった) と '' (空の図) は区別する。
  function status(child, currentParentDsl) {
    var rec = _load()[child];
    if (!rec) {
      return { has: false, parent: '', dir: '', known: false, updated: false,
               added: 0, removed: 0, changed: 0, at: '', adoptedAt: '' };
    }
    var known = (typeof currentParentDsl === 'string');
    var d = known ? delta(rec.base, normalize(currentParentDsl)) : { added: 0, removed: 0, changed: 0 };
    return {
      has: true,
      parent: rec.parent,
      dir: rec.dir,
      known: known,
      updated: known && d.changed > 0,
      added: d.added,
      removed: d.removed,
      changed: d.changed,
      at: rec.at,
      adoptedAt: rec.adoptedAt,
    };
  }

  // 画面に出す 1 行。更新されているときは差分の行数まで言い切る
  // (「変わりました」だけでは、結局開いて見比べることになるため)。
  function statusLine(child, currentParentDsl) {
    var s = status(child, currentParentDsl);
    if (!s.has) return '継承元は未登録です';
    if (!s.known) return '継承元 ' + s.parent + ' を読めませんでした (保存先を確かめてください)';
    if (!s.updated) return '継承元 ' + s.parent + ' は取り込み済みです (前回取り込み時点から差分なし)';
    return '継承元 ' + s.parent + ' が更新されています'
      + ' (前回取り込み時点との差分 ' + s.changed + ' 行: +' + s.added + ' -' + s.removed + ')';
  }

  // ボタンの見出し。開かなくても更新の有無が分かるようにする。
  function badgeText(child, currentParentDsl) {
    var s = status(child, currentParentDsl);
    if (!s.has) return '⇡ 継承元 −';
    if (!s.known) return '⇡ 継承元 ?';
    if (!s.updated) return '⇡ 継承元 ✓';
    return '⇡ 継承元 +' + s.added + ' -' + s.removed;
  }

  // 取り込み時点と今の継承元で、増えた行・減った行を並べる。
  function diffLines(child, currentParentDsl) {
    var rec = _load()[child];
    if (!rec || typeof currentParentDsl !== 'string') return { added: [], removed: [] };
    var before = rec.base === '' ? [] : rec.base.split('\n');
    var afterStr = normalize(currentParentDsl);
    var after = afterStr === '' ? [] : afterStr.split('\n');
    var beforeCount = {};
    before.forEach(function(l) { beforeCount[l] = (beforeCount[l] || 0) + 1; });
    var added = [];
    after.forEach(function(l) {
      if (beforeCount[l]) beforeCount[l]--;
      else added.push(l);
    });
    var afterCount = {};
    after.forEach(function(l) { afterCount[l] = (afterCount[l] || 0) + 1; });
    var removed = [];
    before.forEach(function(l) {
      if (afterCount[l]) afterCount[l]--;
      else removed.push(l);
    });
    return { added: added, removed: removed };
  }

  // 継承元の今の中身を「取り込み済み」にする。次からはここが基準になる。
  function adopt(child, currentParentDsl, at) {
    var rec = _load()[child];
    if (!rec || typeof currentParentDsl !== 'string') return false;
    rec.base = normalize(currentParentDsl);
    rec.adoptedAt = at || _now();
    _persist();
    return true;
  }

  // 図の名前を変えたら関係も付いていく (子としても継承元としても)。
  function rename(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return false;
    var m = _load();
    var touched = false;
    if (Object.prototype.hasOwnProperty.call(m, oldName)) {
      m[newName] = m[oldName];
      delete m[oldName];
      touched = true;
    }
    for (var k in m) {
      if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
      if (m[k].parent === oldName) { m[k].parent = newName; touched = true; }
    }
    if (touched) _persist();
    return touched;
  }

  function reset() {
    _map = {};
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  }

  return {
    normalize: normalize,
    set: set,
    get: get,
    clear: clear,
    children: children,
    delta: delta,
    status: status,
    statusLine: statusLine,
    badgeText: badgeText,
    diffLines: diffLines,
    adopt: adopt,
    rename: rename,
    reset: reset,
  };
})();
