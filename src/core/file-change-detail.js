'use strict';
window.MA = window.MA || {};

// file-change-detail — 「内容が変わった図」を、名前だけでなく消えた行まで出す。
//
// BLK-reviewer-20260916-0046: `audit.js -p primary --since-files <控え>` は
// 内容が変わった図を名指しするが、そこで止まる。指摘に「クラス定義が全消え」と
// 書くには、控えのフォルダと現物を diff コマンドで突き合わせ直すしかなかった。
// 食い違う図が増えるほど、その手 diff が枚数ぶん増える。
//
// 控えのフォルダは --since-files で既に読んでいるので、本文はもう手元にある。
// 描かれる行だけを突き合わせれば (比較そのものは dsl-visible-diff の職掌)、
// 「何行消えて何行増えたか」と代表行を、追加のコマンド無しで同じ出力に添えられる。
//
// 代表行は消えた側を先に出す。増えた行は現物を開けば読めるが、消えた行は
// 控えを開かないと読めない ＝ 手 diff に戻る唯一の理由がそこにあるため。
window.MA.fileChangeDetail = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _index(docs) {
    var map = {};
    (docs || []).forEach(function(d) {
      if (d && d.name != null) map[_s(d.name)] = _s(d.dsl);
    });
    return map;
  }

  // rows(changed, prevDocs, curDocs) — 変わった図ごとの増減。
  // changed は名前の配列でも {name} の配列でもよい (呼ぶ側の持ち物に合わせる)。
  // 片側にしか本文が無い図は、増減ではなく「読めない」として残す
  // (黙って 0 行と出すと、変化が無かったのと見分けが付かない)。
  function rows(changed, prevDocs, curDocs) {
    var DV = window.MA.dslVisibleDiff;
    var prev = _index(prevDocs);
    var cur = _index(curDocs);
    var out = [];
    (changed || []).forEach(function(c) {
      var name = _s(c && typeof c === 'object' ? c.name : c);
      if (!name) return;
      var hasPrev = Object.prototype.hasOwnProperty.call(prev, name);
      var hasCur = Object.prototype.hasOwnProperty.call(cur, name);
      if (!DV || !hasPrev || !hasCur) {
        out.push({ name: name, comparable: false, removed: [], added: [],
                   removedCount: 0, addedCount: 0,
                   reason: !hasPrev ? '控えに本文が無い' : (!hasCur ? '現物の本文が無い' : '比較できない') });
        return;
      }
      var d = DV.compare(prev[name], cur[name]);
      out.push({ name: name, comparable: true,
                 removed: d.removed, added: d.added,
                 removedCount: d.removed.length, addedCount: d.added.length,
                 // 描かれる行に差が無いなら、変わったのはコメント等だけ。
                 // ここを言わないと「変わった」とだけ出て、また控えを開かせる。
                 visibleSame: d.verdict === 'same' });
    });
    return out;
  }

  // 1 行の要約。増減の数を先に出し、代表行を後ろに付ける
  // (件数だけ見たい run で、代表行が要約を押し流さないようにする)。
  function line(row, sampleMax) {
    var r = row || {};
    if (!r.comparable) return r.name + '  比較できない（' + (r.reason || '理由不明') + '）';
    if (r.visibleSame) return r.name + '  描かれる行に差なし（コメント等ソース変化のみ）';
    var head = r.name + '  −' + r.removedCount + ' 行 / +' + r.addedCount + ' 行';
    var max = sampleMax > 0 ? sampleMax : 3;
    var parts = [];
    if (r.removedCount) {
      parts.push('消えた行: ' + r.removed.slice(0, max).join(' / ')
        + (r.removedCount > max ? ' ほか ' + (r.removedCount - max) + ' 行' : ''));
    }
    if (r.addedCount) {
      parts.push('増えた行: ' + r.added.slice(0, max).join(' / ')
        + (r.addedCount > max ? ' ほか ' + (r.addedCount - max) + ' 行' : ''));
    }
    return head + (parts.length ? ' — ' + parts.join(' / ') : '');
  }

  function lines(list, sampleMax) {
    return (list || []).map(function(r) { return line(r, sampleMax); });
  }

  // 消えた行がある図を先に、消えた行数の多い順に並べる
  // (指摘に真っ先に書くのは「何が消えたか」なので、探させない)。
  function sort(list) {
    return (list || []).slice().sort(function(a, b) {
      if (b.removedCount !== a.removedCount) return b.removedCount - a.removedCount;
      if (b.addedCount !== a.addedCount) return b.addedCount - a.addedCount;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
  }

  return {
    rows: rows,
    line: line,
    lines: lines,
    sort: sort,
  };
})();
