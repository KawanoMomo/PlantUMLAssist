'use strict';
window.MA = window.MA || {};

// change-board — 変わった図を全部まとめて 1 画面に並べるための組み立て。
//
// BLK-primary-20260907-0923-wish: レビュー会議で「今日どこを直したか」を見せるのに、
// 「± 差分」で名前を確かめ、タブを開き、「⇔ 並べて見る」で 2 枚ずつ突き合わせる、を
// 図の枚数だけ繰り返していた。変わった図の変更前 DSL と変更後 DSL を全件、
// 上から順に読める形に組み立てておけば、1 画面をスクロールして見せるだけで済む。
// ここは DOM に触らない純関数だけを置き、描画は app.js。
window.MA.changeBoard = (function() {

  // 空文字は「0 行」とみなす。基準の無い新しい図を並べたときに、
  // 空行 1 行が消えたことにならないようにする。
  function _lines(s) {
    var t = String(s == null ? '' : s).replace(/\r\n?/g, '\n');
    return t === '' ? [] : t.split('\n');
  }

  // 行単位の突き合わせ。共通の先頭・末尾を先に落としてから、残りだけ LCS を取る。
  // DSL は大半が同じ行なので、これで比較する範囲がふつう数行まで縮む。
  function _lcs(a, b) {
    var n = a.length, m = b.length;
    var i, j;
    var table = new Array(n + 1);
    for (i = 0; i <= n; i++) {
      table[i] = new Array(m + 1);
      for (j = 0; j <= m; j++) table[i][j] = 0;
    }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        table[i][j] = (a[i] === b[j])
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    return table;
  }

  // 変更前後を並べた行の列。kind は 'same' / 'del' (前だけ) / 'add' (後だけ)。
  // beforeNo / afterNo はそれぞれの元の行番号 (1 始まり、無い側は 0)。
  function diffRows(beforeDsl, afterDsl) {
    var a = _lines(beforeDsl), b = _lines(afterDsl);
    var rows = [];
    var added = 0, removed = 0;
    var head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    var tail = 0;
    while (tail < (a.length - head) && tail < (b.length - head)
           && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

    var i;
    for (i = 0; i < head; i++) {
      rows.push({ kind: 'same', before: a[i], after: b[i], beforeNo: i + 1, afterNo: i + 1 });
    }

    var midA = a.slice(head, a.length - tail);
    var midB = b.slice(head, b.length - tail);
    var table = _lcs(midA, midB);
    var x = 0, y = 0;
    while (x < midA.length && y < midB.length) {
      if (midA[x] === midB[y]) {
        rows.push({ kind: 'same', before: midA[x], after: midB[y],
                    beforeNo: head + x + 1, afterNo: head + y + 1 });
        x++; y++;
      } else if (table[x + 1][y] >= table[x][y + 1]) {
        rows.push({ kind: 'del', before: midA[x], after: null, beforeNo: head + x + 1, afterNo: 0 });
        removed++; x++;
      } else {
        rows.push({ kind: 'add', before: null, after: midB[y], beforeNo: 0, afterNo: head + y + 1 });
        added++; y++;
      }
    }
    while (x < midA.length) {
      rows.push({ kind: 'del', before: midA[x], after: null, beforeNo: head + x + 1, afterNo: 0 });
      removed++; x++;
    }
    while (y < midB.length) {
      rows.push({ kind: 'add', before: null, after: midB[y], beforeNo: 0, afterNo: head + y + 1 });
      added++; y++;
    }

    for (i = 0; i < tail; i++) {
      var ai = a.length - tail + i, bi = b.length - tail + i;
      rows.push({ kind: 'same', before: a[ai], after: b[bi], beforeNo: ai + 1, afterNo: bi + 1 });
    }
    return { rows: rows, added: added, removed: removed };
  }

  // 変わっていない行が続くところを畳む。レビュー会議では変更行とその前後だけ
  // 見えればよく、全文を出すと 1 画面に何枚も並ばない。
  // 畳んだ位置には { kind: 'gap', count: n } を 1 行だけ挟む。
  function collapse(rows, context) {
    var ctx = (context == null) ? 2 : Math.max(0, context);
    var keep = [];
    var i, j;
    for (i = 0; i < rows.length; i++) keep.push(rows[i].kind !== 'same');
    for (i = 0; i < rows.length; i++) {
      if (rows[i].kind === 'same') continue;
      for (j = Math.max(0, i - ctx); j <= Math.min(rows.length - 1, i + ctx); j++) keep[j] = true;
    }
    var out = [];
    var run = 0;
    for (i = 0; i < rows.length; i++) {
      if (keep[i]) {
        if (run > 0) { out.push({ kind: 'gap', count: run }); run = 0; }
        out.push(rows[i]);
      } else {
        run++;
      }
    }
    if (run > 0) out.push({ kind: 'gap', count: run });
    return out;
  }

  // 1 枚ぶんの見出し。何行増えて何行減ったかを名前の横に出す。
  function entryLabel(entry) {
    if (!entry) return '';
    if (entry.status === 'new') return entry.name + ' (新規 +' + entry.added + ')';
    return entry.name + ' (+' + entry.added + ' −' + entry.removed + ')';
  }

  // ボードの中身。baselineOf(name) は save-diff の baselineOf をそのまま渡す。
  // opts.includeSame を立てると変わっていない図も並ぶ (既定は変わった図だけ)。
  // opts.context は畳むときの前後行数。opts.collapse=false で全文。
  function build(docs, baselineOf, opts) {
    var o = opts || {};
    var get = (typeof baselineOf === 'function') ? baselineOf : function() { return null; };
    var out = { entries: [], total: 0, changedCount: 0, hasChange: false, added: 0, removed: 0, markedAt: '' };
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || !d.name) return;
      out.total++;
      var base = get(d.name);
      var beforeDsl = base ? base.dsl : '';
      var status = !base ? 'new' : (_norm(beforeDsl) === _norm(d.dsl) ? 'same' : 'changed');
      if (base && base.at && base.at > out.markedAt) out.markedAt = base.at;
      if (status === 'same' && !o.includeSame) return;
      var df = diffRows(beforeDsl, d.dsl);
      var rows = (o.collapse === false) ? df.rows : collapse(df.rows, o.context);
      var entry = {
        id: d.id, name: d.name, diagramType: d.diagramType || '',
        status: status, before: beforeDsl, after: String(d.dsl == null ? '' : d.dsl),
        markedAt: base ? (base.at || '') : '',
        rows: rows, allRows: df.rows, added: df.added, removed: df.removed,
      };
      out.entries.push(entry);
      if (status !== 'same') {
        out.changedCount++;
        out.added += df.added;
        out.removed += df.removed;
      }
    });
    out.hasChange = out.changedCount > 0;
    return out;
  }

  function _norm(dsl) {
    var s = String(dsl == null ? '' : dsl);
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
    return s;
  }

  // ボード全体の 1 行見出し。会議の冒頭で「今日は 4 枚」と言うための数。
  function summaryText(board) {
    if (!board || !board.hasChange) return '変わった図はありません';
    return '変わった図 ' + board.changedCount + '/' + board.total
      + ' 枚 ・ +' + board.added + ' −' + board.removed + ' 行';
  }

  // BLK-primary-20260908-1103-wish: 引き継ぎでは「要修正」の行だけを渡したい。
  // build() の結果から、印 (済 / 要修正) の付いた行だけを残したボードを作る。
  // 印の持ち主は review-verdicts だが、ここは DOM も localStorage も見ないので
  // 行の鍵と印を引く関数を opts で受け取る (テストでも差し替えられる)。
  // 元のボードは書き換えない (絞り込みを外したら全行に戻るため)。
  function filterVerdict(board, opts) {
    var o = opts || {};
    var out = { entries: [], matched: 0, filtered: true, verdict: o.verdict || '',
      total: board ? board.total : 0, changedCount: 0, hasChange: false,
      added: board ? board.added : 0, removed: board ? board.removed : 0,
      markedAt: board ? board.markedAt : '' };
    if (!board || !Array.isArray(board.entries)
      || typeof o.rowKeyOf !== 'function' || typeof o.verdictOf !== 'function') return out;
    board.entries.forEach(function(e) {
      var rows = (Array.isArray(e.rows) ? e.rows : []).filter(function(r) {
        if (!r || (r.kind !== 'add' && r.kind !== 'del')) return false;   // gap / same は印を持てない
        var key = o.rowKeyOf(r);
        return !!key && o.verdictOf(e.name, key) === o.verdict;
      });
      if (rows.length === 0) return;
      var copy = {};
      for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) copy[k] = e[k]; }
      copy.rows = rows;
      copy.matched = rows.length;
      out.entries.push(copy);
      out.matched += rows.length;
    });
    out.changedCount = out.entries.length;
    out.hasChange = out.matched > 0;
    return out;
  }

  // 絞り込み中の 1 行見出し。何行 / 何枚を新人に渡すのかが分かればよい。
  function filterText(filtered) {
    if (!filtered || !filtered.matched) {
      return (filtered && filtered.verdict ? filtered.verdict : '要修正') + 'の印が付いた行はありません';
    }
    return filtered.verdict + 'のみ ' + filtered.matched + ' 行 / ' + filtered.entries.length + ' 枚';
  }

  return {
    diffRows: diffRows,
    filterVerdict: filterVerdict,
    filterText: filterText,
    collapse: collapse,
    entryLabel: entryLabel,
    build: build,
    summaryText: summaryText,
  };
})();
