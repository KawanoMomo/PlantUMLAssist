'use strict';
window.MA = window.MA || {};

// fix-walk — 影響が届く図の一覧を「1 枚ずつ順に手当てする列」として持つ。
//
// BLK-primary-20260914-2206-wish: 依存グラフの各行から図は開けるが、開いた瞬間に
// モーダルが閉じて一覧が消える。6 図あれば「◈依存グラフを開く → 行を探す → 開く」を
// 6 回繰り返すことになり、確認 (依存グラフ) と反映 (図の編集) の経路が分断されたままだった。
// ここが持つのは並び・今どこ・直した印だけで、図を開く手段も DOM も持たない (描画は app.js)。
//
// change-ticket は同じ一覧を保存フォルダに残して run をまたぐためのもので、
// 「今この run で何枚目を触っているか」は持たない。札から始めた列は ticketId を
// 覚えておき、印を立てたら札にも書き戻せるようにしてある。
window.MA.fixWalk = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  function _item(r) {
    return {
      doc: _s(r && r.doc),
      hop: (r && typeof r.hop === 'number') ? r.hop : 0,
      via: (r && Array.isArray(r.via)) ? r.via.slice() : [],
      done: !!(r && r.done),
    };
  }

  // rows: 依存グラフの影響一覧 / 変更チケットの items。opts.startDoc から始める
  // (行の「この図を開く」を押したときは、その行が 1 枚目)。
  function start(subject, rows, opts) {
    var o = opts || {};
    var list = (Array.isArray(rows) ? rows : []).map(_item).filter(function(it) {
      return !!it.doc;
    });
    var idx = 0;
    if (o.startDoc) {
      var at = indexOf({ items: list }, o.startDoc);
      if (at >= 0) idx = at;
    }
    return {
      subject: _s(subject),
      items: list,
      index: list.length ? idx : -1,
      ticketId: _s(o.ticketId),
      hops: (typeof o.hops === 'number') ? o.hops : 2,
    };
  }

  function _items(walk) { return (walk && Array.isArray(walk.items)) ? walk.items : []; }

  function indexOf(walk, doc) {
    var key = _s(doc);
    var list = _items(walk);
    for (var i = 0; i < list.length; i++) if (list[i].doc === key) return i;
    return -1;
  }

  function current(walk) {
    var list = _items(walk);
    if (!walk || walk.index < 0 || walk.index >= list.length) return null;
    return list[walk.index];
  }

  function _with(walk, index, items) {
    return {
      subject: walk.subject, items: items || _items(walk).slice(),
      index: index, ticketId: walk.ticketId, hops: walk.hops,
    };
  }

  // 端で止める。行き止まりで先頭へ回ると「1 周したことに気付かないまま同じ図を
  // 直し直す」ので、巻き戻さない。
  function go(walk, delta) {
    var list = _items(walk);
    if (!list.length) return _with(walk, -1);
    var n = (walk.index < 0 ? 0 : walk.index) + (delta || 0);
    if (n < 0) n = 0;
    if (n > list.length - 1) n = list.length - 1;
    return _with(walk, n);
  }

  function toDoc(walk, doc) {
    var at = indexOf(walk, doc);
    return at < 0 ? _with(walk, walk ? walk.index : -1) : _with(walk, at);
  }

  function setDone(walk, doc, done) {
    var key = _s(doc);
    var items = _items(walk).map(function(it) {
      if (it.doc !== key) return it;
      var next = _item(it);
      next.done = !!done;
      return next;
    });
    return _with(walk, walk.index, items);
  }

  // 今より後ろで、まだ直していない最初の図。無ければ前に戻って探す
  // (飛ばした図が残っていることに気付けるように、-1 は「全部済んだ」だけにする)。
  function nextUndone(walk) {
    var list = _items(walk);
    var from = walk ? walk.index : -1;
    var i;
    for (i = from + 1; i < list.length; i++) if (!list[i].done) return i;
    for (i = 0; i <= from && i < list.length; i++) if (!list[i].done) return i;
    return -1;
  }

  // 「直した · 次へ」1 回ぶん。印を立ててから、まだの図へ進む。
  // 全部済んだら index はその場に残す (バーが消えて何が起きたか分からなくならない)。
  function doneNext(walk) {
    var cur = current(walk);
    if (!cur) return _with(walk, walk ? walk.index : -1);
    var next = setDone(walk, cur.doc, true);
    var at = nextUndone(next);
    return at < 0 ? next : _with(next, at);
  }

  function progress(walk) {
    var list = _items(walk);
    var done = list.filter(function(it) { return it.done; }).length;
    return {
      done: done, total: list.length, remaining: list.length - done,
      complete: list.length > 0 && done === list.length,
      position: (walk && walk.index >= 0) ? walk.index + 1 : 0,
    };
  }

  function hopText(item) {
    if (!item) return '';
    return item.hop === 0 ? '直接' : '連鎖 ' + item.hop + ' 段';
  }

  // バー 1 行。ここだけ読めば「何枚目 / 残り何枚 / 今の図はどう届いているか」が分かる。
  function labelText(walk) {
    var p = progress(walk);
    if (!p.total) return '手当てする図がありません';
    var cur = current(walk);
    if (p.complete) return walk.subject + ': ' + p.total + ' 図すべて手当て済み';
    var t = walk.subject ? walk.subject + ' の影響 ' : '影響 ';
    t += p.position + ' / ' + p.total + ' 図';
    if (cur) t += ' · ' + cur.doc + ' (' + hopText(cur) + ')';
    t += ' · 残り ' + p.remaining;
    return t;
  }

  return {
    start: start,
    current: current,
    indexOf: indexOf,
    go: go,
    toDoc: toDoc,
    setDone: setDone,
    nextUndone: nextUndone,
    doneNext: doneNext,
    progress: progress,
    hopText: hopText,
    labelText: labelText,
  };
})();
