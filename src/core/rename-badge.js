'use strict';
window.MA = window.MA || {};

// rename-badge — 部品名の統一が済んでいるかを、下端のバッジ 1 つで言う
// (BLK-primary-20260914-1006-friction)。
//
// 過去の置換の組とその残存件数は ⇄ 一括置換のパネルにある (rename-redo) が、
// それを読むにはパネルを開く手数が要る。「今日の統一は済んでいるか」を
// 確かめるだけの回では、開いて・打って・ヒット 0 件を見る操作がまるごと空振りになる。
// 残りが 0 なら画面を開かずに「済」と言い切り、残っているならその組を名指しする。
//
// 数え方は rename-redo と同じ行 (pairs) をそのまま受ける。ここは要約の文面だけを持つ。
window.MA.renameBadge = (function() {

  // 逆向きの組は数えない。A → B を当てた後は、以前打った B → A が「B がまだ残って
  // いる」ように見え続ける (当てたその結果が残っているのだから当然で、直す先がない)。
  // 組は新しい順に並んでいるので、自分より新しい行に逆向きがあれば古い方を落とす。
  function _live(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list.filter(function(r, i) {
      if (!r) return false;
      for (var j = 0; j < i; j++) {
        var n = list[j];
        if (n && n.from === r.to && n.to === r.from) return false;
      }
      return true;
    });
  }

  // rows: renameRedo.pairs() の戻り → { pairs, pending, remaining, docs, next }
  function summarize(rows) {
    var list = _live(rows);
    var pend = list.filter(function(r) { return r && r.state === 'pending'; });
    return {
      pairs: list.length,
      pending: pend.length,
      remaining: pend.reduce(function(a, r) { return a + (Number(r.remaining) || 0); }, 0),
      docs: pend.reduce(function(a, r) { return a + (Number(r.remainingDocs) || 0); }, 0),
      next: pend.length ? { from: pend[0].from, to: pend[0].to } : null,
      // 組ごとの状態 (BLK-primary-20260917-0123-friction)。「済」だけでは
      // 確かめたい組が済んだ組の中にあるかが分からず、結局パネルを開いていた。
      list: list.map(function(r) {
        return { from: r.from, to: r.to, state: r.state, remaining: Number(r.remaining) || 0 };
      }),
    };
  }

  // 組を 1 つも知らないときは「−」。数えていないことと「済」を混ぜない。
  // 組が 1 つならその組を名指しする (開かずに「どの組が済んだか」まで読める)。
  function _pairName(r) { return r.from + '→' + r.to; }

  function badgeText(sum) {
    if (!sum || !sum.pairs) return '統一 −';
    var one = sum.pairs === 1 && sum.list && sum.list[0];
    if (!sum.pending) return '統一 済' + (one ? ' ' + _pairName(one) : ' ' + sum.pairs + '組');
    return '統一 残' + sum.remaining;
  }

  // 組ごとの状態を 1 行に並べる。data 属性とツールチップが同じものを出す。
  function pairStates(sum) {
    return ((sum && sum.list) || []).map(function(r) {
      return _pairName(r) + '=' + r.state;
    }).join(';');
  }

  function _pairLines(sum) {
    return ((sum && sum.list) || []).map(function(r) {
      var st = r.state === 'pending' ? '残り ' + r.remaining + ' 件'
        : (r.state === 'done' ? '適用済み' : '元から無し');
      return '\n・' + r.from + ' → ' + r.to + ' : ' + st;
    }).join('');
  }

  function tone(sum) {
    if (!sum || !sum.pairs) return 'idle';
    return sum.pending ? 'open' : 'done';
  }

  function isActive(sum) {
    return !!(sum && sum.pending > 0);
  }

  function titleText(rows, sum) {
    var s = sum || summarize(rows);
    if (!s.pairs) return '過去に当てた置換の組はまだありません (⇄ 一括置換を開くと組が残ります)';
    if (!s.pending) {
      return '過去の置換 ' + s.pairs + ' 組は、すべて適用済みです。'
        + '部品名の統一を確かめるために ⇄ 一括置換を開く必要はありません' + _pairLines(s);
    }
    var head = '旧称が ' + s.remaining + ' 件 / ' + s.docs + ' 枚に残っています';
    if (s.next) head += ' (次: 「' + s.next.from + '」→「' + s.next.to + '」)';
    return head + '。押すと ⇄ 一括置換がその組を入れた状態で開きます' + _pairLines(s);
  }

  return {
    summarize: summarize,
    badgeText: badgeText,
    tone: tone,
    isActive: isActive,
    titleText: titleText,
    pairStates: pairStates,
  };
})();
