'use strict';
window.MA = window.MA || {};

// dupe-merge — 保存フォルダの中で中身が byte 単位で同じ図を束ね、
// 「どれを残してどれを消すか」まで決める (BLK-primary-20260914-1306-wish)。
//
// 指摘.md が毎回「-編集中 が本体と同一のまま」の整理を求めるのに、📂一覧には
// 開く・名前を変えるしか無く、重複を片付けるには保存フォルダを直接触るしかなかった。
// 束ねる判定は一覧が既に持っている hash (本文の sha1) だけで済む —— 本文を
// 取り直さないので、一覧を開いた時点で「同じ中身が 2 枚ある」と言い切れる。
//
// ここは DOM に触らない純関数だけ。実際の削除と描き直しは app.js。
window.MA.dupeMerge = (function() {

  // 「作業用の写し」を示す接尾辞。本体と写しが同じ中身なら、消すのは写しの方。
  var COPY_MARKS = ['-編集中', '-編集用', '-copy', '-コピー', '-作業中', '-bak', '-old'];

  function nameOf(entry) {
    if (entry == null) return '';
    return typeof entry === 'string' ? entry : String(entry.name == null ? '' : entry.name);
  }

  // 残す 1 枚を選ぶ物差し。小さいほど残る。
  //   1. 他の候補の名前をそのまま頭に持つ名前 (= 本体から派生した写し) は後ろ
  //   2. 写しの接尾辞が付く名前は後ろ
  //   3. 名前が短い方、同じなら辞書順 (毎回同じ答えを返す)
  function rank(name, names) {
    var derived = names.some(function(other) {
      return other !== name && other.length < name.length && name.indexOf(other) === 0;
    });
    var marked = COPY_MARKS.some(function(m) { return name.indexOf(m) >= 0; });
    return [derived ? 1 : 0, marked ? 1 : 0, name.length, name];
  }

  function less(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      return a[i] < b[i];
    }
    return false;
  }

  // scan — 一覧の entries から重複の束を作る。
  // 返り値: [{ hash, names, keep, drop }]。中身が同じ 2 枚以上の束だけ。
  // hash を持たない図 (読めなかった図) は束ねない —— 読めないものを
  // 「同じ」と言ってしまうと、消してはいけない図が消える。
  function scan(entries) {
    var byHash = {};
    var order = [];
    (entries || []).forEach(function(e) {
      var name = nameOf(e);
      var hash = (e && typeof e === 'object' && e.hash) ? String(e.hash) : '';
      if (!name || !hash) return;
      if (!byHash[hash]) { byHash[hash] = []; order.push(hash); }
      if (byHash[hash].indexOf(name) < 0) byHash[hash].push(name);
    });
    var groups = [];
    order.forEach(function(hash) {
      var names = byHash[hash];
      if (names.length < 2) return;
      var keep = names[0];
      names.forEach(function(n) {
        if (less(rank(n, names), rank(keep, names))) keep = n;
      });
      groups.push({
        hash: hash,
        names: names.slice(),
        keep: keep,
        drop: names.filter(function(n) { return n !== keep; }),
      });
    });
    return groups;
  }

  // 一覧の頭に出す 1 行。0 件のときは空文字 (何も出さない)。
  function summary(groups) {
    if (!groups || !groups.length) return '';
    var extra = groups.reduce(function(n, g) { return n + g.drop.length; }, 0);
    return '中身が同じ図が ' + groups.length + ' 組（消せる写し ' + extra + ' 枚）';
  }

  // 1 組ぶんの説明。残す名前と消す名前をそのまま読ませる。
  function label(group) {
    if (!group) return '';
    return group.keep + ' ← ' + group.drop.join('・') + '（中身が同じ）';
  }

  // 行に付く印。その図が束の「残す側」か「消せる写し」かを一覧の行で言う。
  // 返り値: null | { kind: 'keep'|'copy', mark, title, of }
  function badge(groups, name) {
    var found = null;
    (groups || []).forEach(function(g) {
      if (found) return;
      if (g.keep === name) found = { kind: 'keep', mark: '⧉本体', of: g.drop.join('・') };
      else if (g.drop.indexOf(name) >= 0) found = { kind: 'copy', mark: '⧉写し', of: g.keep };
    });
    if (!found) return null;
    found.title = found.kind === 'keep'
      ? found.of + ' と中身が同じです（残す側）'
      : found.of + ' と中身が同じです（消しても失うものはありません）';
    return found;
  }

  return { scan: scan, summary: summary, label: label, badge: badge, COPY_MARKS: COPY_MARKS };
})();
