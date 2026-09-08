'use strict';
window.MA = window.MA || {};

// change-ticket — 1 回の仕様変更で直す図の一覧を、run をまたいで持ち越すための札。
//
// BLK-primary-20260909-0603-wish: ◈依存グラフ は「今この名前から影響が届く図」を
// 一度きりの一覧として出せるが、モーダルを閉じると消える。仕様変更は数日・複数 run に
// またがるのが普通で、「15 枚のうちどこまで直したか」を頭で覚えるのは無理がある。
// 影響一覧を札 (チケット) として保存フォルダに残し、次の run は「依存グラフを開いて
// 洗い直す」ではなく「前回の札を開いて未チェックだけ直す」から始められるようにする。
//
// dep-graph は名前の繋がりを出すだけで、進捗は持たない。ここが足すのは
// 「この一覧を 1 回の変更として束ね、直した印を残す」ところだけ。
// DOM も fetch も触らない。保存は server の /tickets、描画は app.js。
window.MA.changeTicket = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  function _pad(n) { return (n < 10 ? '0' : '') + n; }

  // 札の id。刻印を名前にするので、並べ替えは名前順でよい。
  // 部品名は入れない (同じ名前で 2 回目の変更を起こしたときに衝突する)。
  function makeId(date) {
    var d = date instanceof Date ? date : new Date();
    return 'ct-' + d.getUTCFullYear() + _pad(d.getUTCMonth() + 1) + _pad(d.getUTCDate())
      + '-' + _pad(d.getUTCHours()) + _pad(d.getUTCMinutes()) + _pad(d.getUTCSeconds());
  }

  function _item(r) {
    return {
      doc: _s(r && r.doc),
      hop: (r && typeof r.hop === 'number') ? r.hop : 0,
      via: (r && Array.isArray(r.via)) ? r.via.map(_s) : [],
      done: !!(r && r.done),
      doneAt: _s(r && r.doneAt) || null,
    };
  }

  // 直す順は依存グラフの並び (直接 → 連鎖) のまま。ここで並べ替えると、
  // 一覧で見た順と札で見た順が食い違って「どれを見たか」が分からなくなる。
  function _items(impact) {
    return (Array.isArray(impact) ? impact : [])
      .filter(function(r) { return r && _s(r.doc); })
      .map(_item);
  }

  // 依存グラフの影響一覧から札を 1 枚おこす。
  function fromImpact(subject, impact, opts) {
    var o = opts || {};
    var at = _s(o.at) || new Date().toISOString();
    return {
      id: _s(o.id) || makeId(o.date),
      subject: _s(subject),
      title: _s(o.title) || (_s(subject) + ' の仕様変更'),
      note: _s(o.note),
      hops: (typeof o.hops === 'number') ? o.hops : null,
      at: at,
      updatedAt: at,
      items: _items(impact),
    };
  }

  // server から戻った 1 件を、欠けた欄を埋めて使える形にする。
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = _s(raw.id);
    if (!id) return null;
    var at = _s(raw.at) || '';
    return {
      id: id,
      subject: _s(raw.subject),
      title: _s(raw.title) || (_s(raw.subject) + ' の仕様変更'),
      note: _s(raw.note),
      hops: (typeof raw.hops === 'number') ? raw.hops : null,
      at: at,
      updatedAt: _s(raw.updatedAt) || at,
      items: _items(raw.items),
    };
  }

  // GET /tickets の戻りを一覧に。新しい札が上 (続きを直すのは普通いちばん新しい変更)。
  function rows(data) {
    var list = (data && Array.isArray(data.tickets)) ? data.tickets : [];
    return list.map(normalize).filter(function(t) { return t; }).sort(function(a, b) {
      return (b.at || '').localeCompare(a.at || '') || b.id.localeCompare(a.id);
    });
  }

  function find(list, id) {
    var key = _s(id);
    var all = Array.isArray(list) ? list : [];
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].id === key) return all[i];
    }
    return null;
  }

  // 直した印を立てる / 下ろす。札そのものを差し替える (呼ぶ側が持ち回れる)。
  function setDone(ticket, doc, done, at) {
    var t = normalize(ticket);
    if (!t) return null;
    var key = _s(doc);
    var stamp = _s(at) || new Date().toISOString();
    var hit = false;
    t.items = t.items.map(function(it) {
      if (it.doc !== key) return it;
      hit = true;
      return { doc: it.doc, hop: it.hop, via: it.via, done: !!done,
               doneAt: done ? stamp : null };
    });
    if (hit) t.updatedAt = stamp;
    return t;
  }

  // 影響を洗い直して札に取り込む。直した印は図の名前で引き継ぐ。
  // 消えた図は落とさず gone を立てる — 「一覧から黙って消える」と、
  // 直したのか図ごと消したのかが札から読めなくなる。
  function refresh(ticket, impact, at) {
    var t = normalize(ticket);
    if (!t) return null;
    var stamp = _s(at) || new Date().toISOString();
    var was = {};
    t.items.forEach(function(it) { was[it.doc] = it; });
    var seen = {};
    var next = _items(impact).map(function(it) {
      seen[it.doc] = true;
      var old = was[it.doc];
      if (old) { it.done = old.done; it.doneAt = old.doneAt; }
      return it;
    });
    t.items.forEach(function(it) {
      if (seen[it.doc]) return;
      var gone = _item(it);
      gone.gone = true;
      next.push(gone);
    });
    t.items = next;
    t.updatedAt = stamp;
    return t;
  }

  // 進み具合。残りが 0 になった札は畳んでよい、が判断できればよい。
  function progress(ticket) {
    var items = (ticket && Array.isArray(ticket.items)) ? ticket.items : [];
    var live = items.filter(function(it) { return !it.gone; });
    var done = live.filter(function(it) { return it.done; }).length;
    var total = live.length;
    return {
      done: done,
      total: total,
      remaining: total - done,
      gone: items.length - total,
      complete: total > 0 && done === total,
    };
  }

  function progressText(ticket) {
    var p = progress(ticket);
    if (!p.total) return '対象の図がありません';
    if (p.complete) return '全 ' + p.total + ' 図を直し終えています';
    return p.done + ' / ' + p.total + ' 図 済 (残り ' + p.remaining + ')';
  }

  function summaryText(ticket) {
    if (!ticket) return '札を選ぶと、その仕様変更で直す図が並びます';
    return _s(ticket.title) + ': ' + progressText(ticket);
  }

  // 一覧の見出し。「続きがある変更が何本あるか」がここだけで分かる。
  function listText(list) {
    var all = Array.isArray(list) ? list : [];
    if (!all.length) return '変更チケットはまだありません';
    var open = all.filter(function(t) { return !progress(t).complete; }).length;
    return all.length + ' 件 (未完 ' + open + ')';
  }

  // 未チェックだけ。「全図を見比べて漏れを探す」を「これだけ見る」に変える。
  function remaining(ticket) {
    var items = (ticket && Array.isArray(ticket.items)) ? ticket.items : [];
    return items.filter(function(it) { return !it.done && !it.gone; });
  }

  return {
    makeId: makeId,
    fromImpact: fromImpact,
    normalize: normalize,
    rows: rows,
    find: find,
    setDone: setDone,
    refresh: refresh,
    progress: progress,
    progressText: progressText,
    summaryText: summaryText,
    listText: listText,
    remaining: remaining,
  };
})();
