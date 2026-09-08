'use strict';

// save-check — 「保存」を押したその場で突合ボードと同じ突合を掛け、
// いま保存した図に**新しく生えた**不一致だけを図の上に出す。
//
// BLK-reviewer-20260908-1503-wish: 突合そのもの (name-audit / consistency /
// trace-coverage / svg-freshness) は既にあり、audit-board が 1 本の一覧に
// 揃えている。ただし一覧は reviewer が突合ボードを開いたときにしか読まれず、
// 保存した本人は次の tick で指摘.md が届くまで自分が何を壊したかを知らない。
//
// ここは audit-board の行を「前回この図を保存した時点の控え」と突き合わせ、
// 増えた行 (added) と、警告済みなのに残っている行 (repeated、無視回数つき) に
// 分ける。突合も DOM も持たない (描画と結線は app.js)。node からも require できる。
(function() {
  var KEY_PREFIX = 'pua.savecheck:';

  // 控えは保存フォルダごとに分ける (別のフォルダを開いても前の控えは消えない)。
  function storageKey(fileDir) {
    return KEY_PREFIX + String(fileDir == null || fileDir === '' ? './autosave' : fileDir);
  }

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 行の同一性。同じ図の同じカテゴリの同じ対象なら、文面が変わっても同じ指摘。
  function keyOf(row) {
    if (!row) return '';
    return _s(row.kind) + '|' + _s(row.doc) + '|' + _s(row.title);
  }

  // いま保存した図に関わる行。図をまたぐ指摘 (表記揺れなど) も、その図が
  // 巻き込まれているなら出す (「自分は関係ない」と読める行を作らない)。
  function rowsFor(board, doc) {
    var name = _s(doc);
    return _list(board && board.rows).filter(function(r) {
      if (!name) return false;
      if (_s(r.doc) === name) return true;
      return _list(r.docs).indexOf(name) >= 0;
    });
  }

  function _seen(state) {
    return (state && state.seen && typeof state.seen === 'object') ? state.seen : {};
  }

  // board と控えから、この保存で出す警告を決める。控えを書き換えはしない。
  // opts: { doc: 図名, state: 控え }
  function evaluate(board, opts) {
    var o = opts || {};
    var doc = _s(o.doc);
    var seen = _seen(o.state);
    var rows = rowsFor(board, doc);
    var added = [], repeated = [], maxIgnored = 0;

    rows.forEach(function(r) {
      var k = keyOf(r);
      var prev = seen[k] && typeof seen[k].count === 'number' ? seen[k].count : 0;
      var item = { row: r, key: k, ignored: prev };
      if (prev > 0) {
        repeated.push(item);
        if (prev > maxIgnored) maxIgnored = prev;
      } else {
        added.push(item);
      }
    });

    // 前回はこの図に出ていて、今回は消えた指摘。直したことが分かる数。
    var resolved = 0;
    Object.keys(seen).forEach(function(k) {
      if (_s(seen[k] && seen[k].doc) !== doc) return;
      for (var i = 0; i < rows.length; i++) { if (keyOf(rows[i]) === k) return; }
      resolved++;
    });

    return {
      doc: doc, rows: rows, added: added, repeated: repeated,
      total: rows.length, resolved: resolved, maxIgnored: maxIgnored,
      // 見た突合の名前。突合が動かなかったときに「0 件」と言わないため。
      seen: _list(board && board.seen),
    };
  }

  // 警告を出したあとの控え。今回出した行は無視回数を 1 増やし、消えた行は落とす
  // (他の図の控えはそのまま残す)。
  function advance(state, res, at) {
    var seen = _seen(state);
    var doc = _s(res && res.doc);
    var next = {};
    Object.keys(seen).forEach(function(k) {
      if (_s(seen[k] && seen[k].doc) === doc) return;  // この図の分は下で作り直す
      next[k] = seen[k];
    });
    _list(res && res.rows).forEach(function(r) {
      var k = keyOf(r);
      var prev = seen[k] && typeof seen[k].count === 'number' ? seen[k].count : 0;
      next[k] = { count: prev + 1, doc: doc, at: _s(at) || new Date().toISOString() };
    });
    return { seen: next };
  }

  // 図の上に出す 1 行。警告が無いときも「見た」ことは言う
  // (押しても何も起きなかったのか、指摘が無かったのかを潰さない)。
  function summaryLine(res) {
    var r = res || { added: [], repeated: [], resolved: 0, seen: [] };
    var added = _list(r.added).length, rep = _list(r.repeated).length;
    var parts = [];
    if (added) parts.push('新しい不一致 ' + added + ' 件');
    if (rep) {
      parts.push('未解消 ' + rep + ' 件'
        + (r.maxIgnored > 1 ? '（最長 ' + r.maxIgnored + ' 回そのまま保存）' : ''));
    }
    if (!parts.length) {
      if (r.resolved) return '保存しました。この図の不一致 ' + r.resolved + ' 件が解消しました';
      return _list(r.seen).length
        ? '保存しました。' + _list(r.seen).join('・') + ' を見て、この図に不一致はありません'
        : '保存しました。突合は動きませんでした';
    }
    if (r.resolved) parts.push('解消 ' + r.resolved + ' 件');
    return '保存しました。' + parts.join(' / ');
  }

  // 帯を出すか。新しい不一致か、未解消が残っているときだけ。
  function shouldWarn(res) {
    return _list(res && res.added).length > 0 || _list(res && res.repeated).length > 0;
  }

  // 帯に並べる行 (新しい方を先に、無視回数の多い順)。
  function lines(res) {
    var out = [];
    _list(res && res.added).forEach(function(it) {
      out.push({ key: it.key, isNew: true, ignored: 0, doc: _s(it.row.doc),
        text: _s(it.row.category) + '：' + _s(it.row.title) + ' — ' + _s(it.row.detail) });
    });
    _list(res && res.repeated).sort(function(a, b) { return b.ignored - a.ignored; })
      .forEach(function(it) {
        out.push({ key: it.key, isNew: false, ignored: it.ignored, doc: _s(it.row.doc),
          text: _s(it.row.category) + '：' + _s(it.row.title) + ' — ' + _s(it.row.detail) });
      });
    return out;
  }

  function load(store, fileDir) {
    if (!store) return { seen: {} };
    try {
      var raw = store.getItem(storageKey(fileDir));
      if (!raw) return { seen: {} };
      var v = JSON.parse(raw);
      return { seen: _seen(v) };
    } catch (e) { return { seen: {} }; }
  }

  function save(store, fileDir, state) {
    if (!store) return false;
    try {
      store.setItem(storageKey(fileDir), JSON.stringify({ seen: _seen(state) }));
      return true;
    } catch (e) { return false; }
  }

  var api = {
    storageKey: storageKey, keyOf: keyOf, rowsFor: rowsFor,
    evaluate: evaluate, advance: advance,
    summaryLine: summaryLine, shouldWarn: shouldWarn, lines: lines,
    load: load, save: save,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MA = window.MA || {}; window.MA.saveCheck = api; }
})();
