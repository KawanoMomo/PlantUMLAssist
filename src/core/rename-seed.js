'use strict';
window.MA = window.MA || {};

// rename-seed — ⇄ 一括置換を開いた時点で、置換前・置換後の欄に入れておく組を選ぶ。
//
// BLK-primary-20260914-1106-friction (差し戻し): 過去に当てた組は既にパネルの中に
// 並んでいて (rename-redo)、その行を押せば両欄が埋まる。それでも手順 2 の手数は
// clicks=3 / keys=21 のまま動かない —— 打鍵のほとんどは「SpiDrv」「Spi_Driver」を
// 打ち直す 17 打で、開いた瞬間に焦点が空の置換前欄に入るので、利用者は行を探すより先に
// 打ち始めてしまう。省力ルートは在るのに、画面がそこへ連れて行っていない。
//
// ここが決めるのは「開いた瞬間に何を入れておくか」だけ。
//   - 旧称がまだ残っている組があれば、それを入れる (今日直す組がそれだから)
//   - 無ければ直近に当てた組を入れる (確かめ直す回はこれ。ヒット 0 件で「済んでいる」と読める)
//   - 組を 1 つも知らなければ何も入れない (空の欄を偽の答えで埋めない)
// 利用者が選んだもの (図の選択・エディタの選択) は組より強い。そちらが入っている
// ときは触らない —— これは「打ち直しを省く」機能であって、指示を上書きする機能ではない。
//
// DOM に触らない。欄に入れるのと文面を出すのは app.js の職掌。
window.MA.renameSeed = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 逆向きの組を落とす数え方は renameBadge と同じ (A→B を当てた後の B→A は、
  // 当てた結果が残っているだけで直す先が無い)。
  function live(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list.filter(function(r, i) {
      if (!r || !_s(r.from) || !_s(r.to)) return false;
      for (var j = 0; j < i; j++) {
        var n = list[j];
        if (n && n.from === r.to && n.to === r.from) return false;
      }
      return true;
    });
  }

  // pick(rows) — 入れておく組。rows は renameRedo.pairs() の戻り (新しい順)。
  function pick(rows) {
    var list = live(rows);
    for (var i = 0; i < list.length; i++) {
      if (list[i].state === 'pending') {
        return { from: list[i].from, to: list[i].to, state: 'pending',
          remaining: Number(list[i].remaining) || 0 };
      }
    }
    if (!list.length) return null;
    return { from: list[0].from, to: list[0].to, state: 'done', remaining: 0 };
  }

  // seed(rows, current) — 今の欄の中身を見て、入れるべきなら組を返す。
  // current は { from, to }。どちらかが埋まっていれば何も返さない。
  function seed(rows, current) {
    var c = current || {};
    if (_s(c.from) || _s(c.to)) return null;
    return pick(rows);
  }

  // 入れた理由を 1 行で言う。黙って欄が埋まっていると、利用者は自分が打ったのか
  // 前回の残りなのかを確かめるために結局履歴を開くことになる。
  function noteText(pair) {
    if (!pair) return '';
    var name = pair.from + ' → ' + pair.to;
    if (pair.state === 'pending') {
      return '前回の組 ' + name + ' を入れました（旧称が残り ' + pair.remaining
        + ' 件。打ち直さずそのまま置換できます）';
    }
    return '前回の組 ' + name + ' を入れました（前回はこれで当てました。ヒット 0 件なら統一は済んでいます）';
  }

  function noteTone(pair) {
    if (!pair) return '';
    return pair.state === 'pending' ? 'pending' : 'done';
  }

  return {
    live: live,
    pick: pick,
    seed: seed,
    noteText: noteText,
    noteTone: noteTone,
  };
})();
