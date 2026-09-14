'use strict';

// version-diff — 保存フォルダの図と、その図の「直前の退避版」を突き合わせる。
//
// BLK-reviewer-20260913-0306-wish: server は上書きの直前に `_versions/` へ控えを
// 取っているが、それを読めるのは GUI の一覧 (「履歴 N」→ 別タブで開く) だけで、
// 「いまの中身は直前の版から何が変わったのか」を言う口がどこにも無い。
// 保存直後の複数ファイルが同じ中身に収束して正しい内容がどこにも残らない事故が
// 起きたとき、reviewer は「どのファイルが最新の正か」を過去 run の控えを漁って
// 推測するしかなかった。控えは既に足元にあるので、要るのは版を読む口ではなく
// 「直前版とのdiff」そのものになる。
//
// ここに置くのは純関数だけ (fs も DOM も見ない)。ファイルを読むのは
// tools/audit.js、画面に出すのは app.js。
(function() {
  // 「中身が失われた疑い」と言う行数差の下限。1〜4 行の増減は普通の書き足し・
  // 消し込みで、事故ではない。twin-restore の MIN_GAIN と同じ下限を使う
  // (同じ事故を 2 つの規約で判定しない)。
  var MIN_LOST = 5;

  // 退避版のファイル名。server の VERSION_SEP / VERSIONS_DIRNAME と同じ綴り。
  var SEP = '--';
  var DIRNAME = '_versions';

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 改行と行末の空白だけの差は「変わった」に数えない (整形差で事故を埋めない)。
  function normalize(dsl) {
    return _s(dsl).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function lines(dsl) {
    var t = normalize(dsl);
    return t === '' ? [] : t.split('\n');
  }

  // `{name}--{YYYYMMDD-HHMMSS}[.n].puml` → { name, stamp }。読めなければ null。
  // 図名そのものに `--` を含められるので、区切りは末尾側から探す。
  function parseVersionFile(fileName) {
    var s = _s(fileName);
    if (!/\.puml$/i.test(s)) return null;
    var stem = s.slice(0, -5);
    var i = stem.lastIndexOf(SEP);
    if (i <= 0) return null;
    var name = stem.slice(0, i);
    var stamp = stem.slice(i + SEP.length);
    if (!/^\d{8}-\d{6}(?:\.\d+)?$/.test(stamp)) return null;
    return { name: name, stamp: stamp };
  }

  // 刻印は固定桁 + 任意の `.n` なので、文字列の大小がそのまま新旧になる
  // (`.10` が `.2` より小さくなるのは同秒 10 本目という稀な場合だけで、
  //  どちらも「その秒の版」なので直前版の判定は変わらない)。
  function newestStamp(stamps) {
    var out = null;
    _list(stamps).forEach(function(s) {
      var v = _s(s);
      if (!v) return;
      if (out === null || v > out) out = v;
    });
    return out;
  }

  // 退避版のファイル名の一覧 → 図名ごとの「直前版」。
  // { name: { stamp, file, count } }
  function latestByName(fileNames) {
    var acc = {};
    _list(fileNames).forEach(function(f) {
      var p = parseVersionFile(f);
      if (!p) return;
      var cur = acc[p.name];
      if (!cur) { acc[p.name] = { stamp: p.stamp, file: _s(f), count: 1 }; return; }
      cur.count += 1;
      if (p.stamp > cur.stamp) { cur.stamp = p.stamp; cur.file = _s(f); }
    });
    return acc;
  }

  // 刻印 (UTC) → 読み手の時計の「MM/DD HH:MM」。読めなければ刻印のまま。
  // version-history.label と同じ見え方にする (GUI と CLI で時刻がずれない)。
  function label(stamp) {
    var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/.exec(_s(stamp));
    if (!m) return _s(stamp);
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    if (isNaN(d.getTime())) return _s(stamp);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 行単位の LCS。図は数十〜数百行なので素直な表で足りる。
  // 返すのは { kind: 'same'|'del'|'add', before, after, text } の並び
  // (before/after は 1 始まりの行番号。存在しない側は null)。
  function diffLines(beforeText, afterText) {
    var a = lines(beforeText), b = lines(afterText);
    var n = a.length, m = b.length;
    var lcs = [];
    for (var i = 0; i <= n; i++) lcs.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ kind: 'same', before: i + 1, after: j + 1, text: a[i] }); i++; j++; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'del', before: i + 1, after: null, text: a[i] }); i++; }
      else { out.push({ kind: 'add', before: null, after: j + 1, text: b[j] }); j++; }
    }
    while (i < n) { out.push({ kind: 'del', before: i + 1, after: null, text: a[i] }); i++; }
    while (j < m) { out.push({ kind: 'add', before: null, after: j + 1, text: b[j] }); j++; }
    return out;
  }

  // 差分のうち動いた行だけ。指摘に写すのはここだけで足りる。
  function changedOnly(diff) {
    return _list(diff).filter(function(d) { return d.kind !== 'same'; });
  }

  // 戻し先を指すときの図の名前。server の `type` と GUI のタブ名は拡張子を持たない。
  function stem(name) {
    return _s(name).replace(/\.puml$/i, '');
  }

  // `title Xxx` の題。図の入れ替わりは題が丸ごと変わるので、行数と並べて見る。
  function titleOf(dsl) {
    var m = /^\s*title\s+(.+?)\s*$/m.exec(_s(dsl));
    return m ? m[1] : '';
  }

  // 1 枚の判定。
  //   no-version — 控えがまだ無い (このフォルダで初めての保存)
  //   same       — 直前版と中身が同じ (整形差だけを含む)
  //   edited     — 普通の書き足し・直し
  //   lost       — MIN_LOST 行以上減った。上書きで中身が失われた疑い
  //   replaced   — 残った行がほぼ無く、題まで変わった。別の図で塗り潰された疑い
  // lost / replaced が「直前版に戻すべき」候補。
  function compare(entry) {
    var e = entry || {};
    var name = _s(e.name);
    var current = _s(e.current);
    var hasPrev = e.previous != null;
    var previous = _s(e.previous);
    var before = lines(previous).length;
    var after = lines(current).length;
    var res = {
      name: name,
      stamp: _s(e.stamp),
      label: label(e.stamp),
      beforeLines: before,
      afterLines: after,
      lost: Math.max(0, before - after),
      titleBefore: titleOf(previous),
      titleAfter: titleOf(current),
      diff: [],
      changed: 0,
      verdict: 'no-version',
    };
    if (!hasPrev) return res;
    res.diff = diffLines(previous, current);
    var moved = changedOnly(res.diff);
    res.changed = moved.length;
    var kept = res.diff.length - moved.length;
    if (!moved.length) { res.verdict = 'same'; return res; }
    // 前の中身がほとんど残っておらず、題まで変わっていれば別の図で塗られている。
    if (before > 0 && kept <= 2 && res.titleBefore !== res.titleAfter) res.verdict = 'replaced';
    else if (res.lost >= MIN_LOST) res.verdict = 'lost';
    else res.verdict = 'edited';
    return res;
  }

  // 疑いのある版だけを先に読みたいので、判定の重い順に並べ替える。
  var ORDER = { replaced: 0, lost: 1, edited: 2, same: 3, 'no-version': 4 };

  function rank(verdict) {
    var v = ORDER[verdict];
    return typeof v === 'number' ? v : 9;
  }

  function report(entries) {
    var rows = _list(entries).map(compare);
    rows.sort(function(x, y) {
      var d = rank(x.verdict) - rank(y.verdict);
      return d !== 0 ? d : (x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
    });
    var suspects = rows.filter(function(r) { return r.verdict === 'lost' || r.verdict === 'replaced'; });
    return { rows: rows, suspects: suspects, total: rows.length };
  }

  var VERDICT_LABEL = {
    'no-version': '控えなし（このフォルダで初めての保存）',
    same: '直前版と同じ',
    edited: '書き足し・直し',
    lost: '中身が失われた疑い',
    replaced: '別の図で塗り潰された疑い',
  };

  // 指摘.md にそのまま貼れる要約。`max` は 1 枚あたりに出す差分行の数 (0 で全部)。
  function formatSummary(rep, max) {
    var r = rep || { rows: [], suspects: [], total: 0 };
    var cap = typeof max === 'number' ? max : 6;
    var out = ['版との差分（直前の退避版 ⇔ いまの中身）'];
    if (!r.rows.length) {
      out.push('  対象の .puml がありません');
      return out.join('\n');
    }
    r.rows.forEach(function(row) {
      var mark = (row.verdict === 'lost' || row.verdict === 'replaced') ? '⚠' : '・';
      var head = '  ' + mark + ' ' + row.name + '  ' + VERDICT_LABEL[row.verdict];
      if (row.verdict !== 'no-version') {
        head += '  ' + row.label + ' の版から ' + row.beforeLines + ' → ' + row.afterLines + ' 行';
      }
      out.push(head);
      if (row.verdict === 'no-version' || row.verdict === 'same') return;
      var moved = changedOnly(row.diff);
      var shown = cap > 0 ? moved.slice(0, cap) : moved;
      shown.forEach(function(d) {
        var no = d.kind === 'del' ? d.before : d.after;
        out.push('      ' + (d.kind === 'del' ? '-' : '+') + ' ' + no + '  ' + d.text);
      });
      if (cap > 0 && moved.length > cap) out.push('      … 他 ' + (moved.length - cap) + ' 行');
    });
    out.push('  疑い ' + r.suspects.length + ' 件 / ' + r.total + ' 枚'
      + (r.suspects.length ? '（戻すなら ' + r.suspects.map(function(s) { return stem(s.name) + '@' + s.stamp; }).join(', ') + '）' : ''));
    return out.join('\n');
  }

  var api = {
    MIN_LOST: MIN_LOST, SEP: SEP, DIRNAME: DIRNAME, VERDICT_LABEL: VERDICT_LABEL,
    normalize: normalize, lines: lines,
    parseVersionFile: parseVersionFile, newestStamp: newestStamp, latestByName: latestByName,
    label: label, diffLines: diffLines, changedOnly: changedOnly, titleOf: titleOf,
    stem: stem, rank: rank, compare: compare, report: report, formatSummary: formatSummary,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.versionDiff = api;
  }
})();
