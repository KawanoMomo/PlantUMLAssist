'use strict';
window.MA = window.MA || {};

// side-by-side — 同じファイル名を持つ 2 人のペルソナの図を、左右に並べて読む。
//
// BLK-reviewer-20260912-2206-wish: junior/primary の `gpio_init_sequence.puml` で
// participant 名 (`Gpio` vs `Gpio_Driver`) と粒度が食い違っているのを見つけたが、
// GUI にはこの 2 枚を並べて見る手段が無く、reviewer は persona-data の 2 フォルダから
// 同名ファイルを自分でテキストとして開いて読み比べるしかなかった。
//
// domain-cohort は同じドメイン (系統) の図を突き合わせ、片方にしか無い名前を
// チップで並べる。それは「どの名前が食い違うか」までで、「どの行のどの語か」は
// 本文を自分で開き直さないと分からない。ここは逆に本文そのものを 2 列に並べ、
// 食い違う語だけに印を付ける。突合の判定 (名前の正規化・動作名の拾い方) は
// domain-cohort / name-audit をそのまま呼ぶので、チップと本文で「同じ名前」の
// 判定がずれない。
//
// 組み方の軸もドメインではなくファイル名にする。reviewer が突き合わせるのは
// 「同じ名前のファイルを 2 人が別々に書いたもの」で、ドメイン名が同じでも
// 別ファイル名なら比べる相手ではない。
//
// DOM も fetch も触らない (並べ方と印の付け方だけ)。描画は app.js。
window.MA.sideBySide = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _dc() { return window.MA.domainCohort; }
  function _na() { return window.MA.nameAudit; }

  function _dsl(doc) {
    var du = window.MA.dslUtils;
    if (du && du.docDsl) return du.docDsl(doc);
    return _s(doc && doc.dsl);
  }

  function _key(name) {
    var na = _na();
    if (na && na.normalizeKey) return na.normalizeKey(name);
    return _s(name).toLowerCase().replace(/[\s_\-.]+/g, '');
  }

  // ── 組み方 ────────────────────────────────────────────────────────────
  // `junior/gpio_init_sequence.puml` → `gpio_init_sequence`。
  function baseOf(docName) {
    var dc = _dc();
    if (dc && dc.baseOf) return dc.baseOf(docName);
    var s = _s(docName).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  function folderOf(docName) {
    var dc = _dc();
    if (dc && dc.folderOf) return dc.folderOf(docName);
    var s = _s(docName).split('\\').join('/');
    var i = s.indexOf('/');
    return i < 0 ? '' : s.slice(0, i);
  }

  function _isTemplate(docName) {
    var dc = _dc();
    return dc && dc.isTemplate ? dc.isTemplate(docName) : false;
  }

  // 同じファイル名で、フォルダの違う 2 枚の組。フォルダ名順に左右を決める
  // (開くたびに左右が入れ替わると、前回どちらを直すと決めたかが読めなくなる)。
  // テンプレ由来は既定で組まない (同じ雛形の複製どうしは揃っていて当たり前)。
  function pairsByFile(docs, opts) {
    var inc = !!(opts && opts.includeTemplates);
    var byBase = {};
    var order = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var name = _s(d.name);
      if (!name) return;
      if (!inc && _isTemplate(name)) return;
      var base = baseOf(name);
      var folder = folderOf(name);
      if (!base || !folder) return;
      if (!byBase[base]) { byBase[base] = []; order.push(base); }
      byBase[base].push({ doc: d, name: name, base: base, folder: folder });
    });
    order.sort();
    var out = [];
    order.forEach(function(base) {
      var list = byBase[base].slice().sort(function(a, b) {
        return a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0;
      });
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          if (list[i].folder === list[j].folder) continue;
          out.push({ base: base, a: list[i], b: list[j] });
        }
      }
    });
    return out;
  }

  // ── 印 ────────────────────────────────────────────────────────────────
  // 2 枚に出てくる語を突き合わせ、語ごとの状態を決める。
  //  same     … 綴りまで同じ (印を付けない。全部光ると差分が読めない)
  //  spelling … 同じものを指しているのに綴りが違う (Gpio vs Gpio_Driver)
  //  only     … 片方にしか無い
  // 返すのは「その側の綴り → 状態」の引き。行の中の語を引くのに使う。
  function marks(a, b) {
    var dc = _dc();
    if (!dc) return { left: {}, right: {}, names: [], labels: [] };
    var out = { left: {}, right: {}, names: [], labels: [] };

    function pass(listA, listB, group) {
      var ka = {}, kb = {};
      (listA || []).forEach(function(x) { ka[x.key] = _s(x.name || x.label); });
      (listB || []).forEach(function(x) { kb[x.key] = _s(x.name || x.label); });
      var keys = {};
      Object.keys(ka).forEach(function(k) { keys[k] = true; });
      Object.keys(kb).forEach(function(k) { keys[k] = true; });
      var rows = [];
      Object.keys(keys).sort().forEach(function(k) {
        var la = ka[k], rb = kb[k];
        var status = la == null ? 'only' : rb == null ? 'only' : (la === rb ? 'same' : 'spelling');
        rows.push({ key: k, group: group, status: status,
                    left: la == null ? '' : la, right: rb == null ? '' : rb,
                    by: status === 'spelling' ? 'key' : '' });
      });
      _reconcile(rows, group);
      rows.forEach(function(row) {
        if (row.left) out.left[row.left] = row;
        if (row.right) out.right[row.right] = row;
        out[group].push(row);
      });
    }

    pass(dc.namesOf(a), dc.namesOf(b), 'names');
    pass(_labels(a), _labels(b), 'labels');
    return out;
  }

  // 片方にしか無い語どうしを、もう一度だけ突き合わせる。
  //
  // name-audit の正規化は大文字小文字と `_ - . 空白` を落とすだけなので、
  // `Gpio` と `Gpio_Driver` は別の語になる。reviewer が実際に突き当たったのは
  // まさにこの形 (junior が `Gpio`、primary が `Gpio_Driver`) で、
  // 「片方にしか無い語が 2 つある」と出されると、どれとどれが同じものを
  // 指しているのかは結局本文を読んで決めることになる。
  //
  // 片方の key がもう片方の key の頭か尻に丸ごと含まれるなら、同じものを
  // 別の粒度で書いた候補として組む (`gpio` ⊂ `gpiodriver`)。言い切らずに
  // by='部分一致' を残し、画面は「対応候補」と出す。3 文字未満の語は組まない
  // (`hw` が何にでも当たる)。1 対 1 になる組だけを採り、候補が 2 つ以上ある
  // 語は組まない (どちらと対応するかは機械では決められない)。
  function _reconcile(rows, group) {
    var lefts = rows.filter(function(r) { return r.status === 'only' && r.left; });
    var rights = rows.filter(function(r) { return r.status === 'only' && r.right; });
    if (!lefts.length || !rights.length) return;

    function touches(x, y) {
      if (x.length < 3 || y.length < 3) return false;
      var lo = x.length <= y.length ? x : y;
      var hi = x.length <= y.length ? y : x;
      if (lo === hi) return false;
      return hi.indexOf(lo) === 0 || hi.lastIndexOf(lo) === hi.length - lo.length;
    }

    var cand = {};
    lefts.forEach(function(l) {
      cand[l.key] = rights.filter(function(r) { return touches(l.key, r.key); });
    });
    lefts.forEach(function(l) {
      var hits = cand[l.key];
      if (!hits || hits.length !== 1) return;
      var r = hits[0];
      if (r.status !== 'only') return;              // 先の語に取られている
      // 相手から見ても候補が自分 1 つでなければ組まない。
      var back = lefts.filter(function(x) { return x.status === 'only' && touches(x.key, r.key); });
      if (back.length !== 1) return;
      l.status = 'spelling';
      l.by = '部分一致';
      l.right = r.right;
      r.status = 'merged';
      r.into = l;
    });
    // 吸収された側は行として残さない (同じ語が 2 行に出ると件数が二重になる)。
    // 組んだ行が左右どちらの綴りも持っているので、引きの表はそれで埋まる。
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].status === 'merged') rows.splice(i, 1);
    }
  }

  // 矢印ラベルは key を持たないことがある (family-audit の actionsOf は
  // { name, key } を返すが、実装が変わっても引けるように補う)。
  function _labels(doc) {
    var dc = _dc();
    var list = (dc && dc.labelsOf ? dc.labelsOf(doc) : []) || [];
    return list.map(function(x) {
      var name = _s(x && (x.name || x.label));
      return { name: name, key: _s(x && x.key) || _key(name) };
    });
  }

  // 食い違っている語だけ。チップの一覧と同じ順で並べる。
  function gaps(m) {
    var out = [];
    ['names', 'labels'].forEach(function(g) {
      ((m && m[g]) || []).forEach(function(r) {
        if (r.status !== 'same') out.push(r);
      });
    });
    return out;
  }

  // ── 行 ────────────────────────────────────────────────────────────────
  // 本文 1 行を「ただの文字」と「印の付く語」に切り分ける。語の切り出しは
  // 識別子と、`:` の後ろのラベル全体の両方を見る (メッセージ名は空白を含む)。
  function segments(line, m, side) {
    var text = _s(line);
    var table = (m && m[side]) || {};
    if (!text) return [{ text: '', mark: null }];

    // 長い綴りから先に当てる (Gpio より Gpio_Driver を先に取らないと、
    // Gpio_Driver が Gpio + _Driver に割れて印が半分になる)。
    var words = Object.keys(table).filter(function(w) { return w; });
    words.sort(function(x, y) { return y.length - x.length; });
    if (!words.length) return [{ text: text, mark: null }];

    var out = [];
    var i = 0;
    while (i < text.length) {
      var hit = null;
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (text.substr(i, word.length) !== word) continue;
        // 識別子の途中に埋まっている一致は語ではない (Gpio が Gpio_Driver の
        // 頭に当たるのを、前後が識別子文字かどうかで弾く)。
        var before = i > 0 ? text.charAt(i - 1) : '';
        var after = text.charAt(i + word.length);
        if (/[A-Za-z0-9_]/.test(before) && /^[A-Za-z0-9_]/.test(word)) continue;
        if (/[A-Za-z0-9_]/.test(after) && /[A-Za-z0-9_]$/.test(word)) continue;
        hit = word;
        break;
      }
      if (!hit) {
        if (!out.length || out[out.length - 1].mark) out.push({ text: '', mark: null });
        out[out.length - 1].text += text.charAt(i);
        i++;
        continue;
      }
      var row = table[hit];
      // 綴りまで同じ語には印を付けない。
      if (row.status === 'same') {
        if (!out.length || out[out.length - 1].mark) out.push({ text: '', mark: null });
        out[out.length - 1].text += hit;
      } else {
        out.push({ text: hit, mark: row.status, group: row.group, key: row.key,
                   left: row.left, right: row.right });
      }
      i += hit.length;
    }
    return out.length ? out : [{ text: text, mark: null }];
  }

  // 左右の行を突き合わせて並べる。行そのものの一致は、印の付く語を正規化した
  // 姿で見る (`Gpio -> Hw : Init` と `Gpio_Driver -> Hw : Init` は綴り違いの
  // 同じ行として同じ段に並べたい。別の段に落とすと、綴り違いが行の増減に見える)。
  function _shape(line, m, side) {
    return segments(line, m, side).map(function(s) {
      if (!s.mark) return s.text;
      return '\u0001' + s.key;
    }).join('').replace(/\s+/g, ' ').trim();
  }

  // 最長共通部分列で段を合わせる。図の DSL は数十行なので素直な DP でよい。
  function rows(a, b) {
    var m = marks(a, b);
    var la = _dsl(a).split(/\r?\n/);
    var lb = _dsl(b).split(/\r?\n/);
    var sa = la.map(function(l) { return _shape(l, m, 'left'); });
    var sb = lb.map(function(l) { return _shape(l, m, 'right'); });

    var n = la.length, k = lb.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Array(k + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (var j = k - 1; j >= 0; j--) {
        dp[i][j] = (sa[i] === sb[j] && sa[i] !== '')
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < k) {
      if (sa[i] === sb[j] && sa[i] !== '') {
        out.push(_row(la[i], lb[j], m, i + 1, j + 1));
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push(_row(la[i], null, m, i + 1, null));
        i++;
      } else {
        out.push(_row(null, lb[j], m, null, j + 1));
        j++;
      }
    }
    while (i < n) { out.push(_row(la[i], null, m, i + 1, null)); i++; }
    while (j < k) { out.push(_row(null, lb[j], m, null, j + 1)); j++; }
    return out;
  }

  function _row(left, right, m, lineA, lineB) {
    var ls = left == null ? null : segments(left, m, 'left');
    var rs = right == null ? null : segments(right, m, 'right');
    var marked = (ls || []).concat(rs || []).some(function(s) { return s.mark; });
    var kind;
    if (left == null) kind = 'only-right';
    else if (right == null) kind = 'only-left';
    else kind = marked ? 'changed' : 'same';
    return {
      kind: kind,
      lineA: lineA, lineB: lineB,
      left: left, right: right,
      leftSegments: ls, rightSegments: rs,
    };
  }

  // ── 見出し ────────────────────────────────────────────────────────────
  // 「この 2 枚は何が違うのか」を 1 行で。0 件を「読まなくていい」と言い切れる
  // 言い方にする (件数だけ出すと、0 件でも本文を開いて確かめることになる)。
  function summaryLine(a, b) {
    var m = marks(a, b);
    var g = gaps(m);
    if (!g.length) return '部品名・メッセージ名とも一致しています (綴りまで同じ)';
    var spell = g.filter(function(r) { return r.status === 'spelling'; });
    var only = g.filter(function(r) { return r.status === 'only'; });
    var parts = [];
    if (spell.length) {
      var byPart = spell.filter(function(r) { return r.by === '部分一致'; }).length;
      parts.push('綴り違い ' + spell.length + ' 件 ('
        + spell.slice(0, 3).map(function(r) { return r.left + ' / ' + r.right; }).join('、')
        + (byPart ? '。うち ' + byPart + ' 件は対応候補' : '') + ')');
    }
    if (only.length) {
      parts.push('片方にしか無い語 ' + only.length + ' 件 ('
        + only.slice(0, 3).map(function(r) { return r.left || r.right; }).join('、') + ')');
    }
    return parts.join(' / ');
  }

  // 組 1 つぶんの見出し。どちらのフォルダが左かを取り違えないようにする。
  function headerLabel(pair) {
    if (!pair || !pair.a || !pair.b) return '';
    return pair.base + ': ' + pair.a.folder + ' ⇔ ' + pair.b.folder;
  }

  // 「どちらの綴りに揃えるか」の選択肢。すり合わせはこの 2 つしかない。
  function choicesFor(row, aFolder, bFolder) {
    if (!row || row.status !== 'spelling') return [];
    return [
      { folder: _s(aFolder), name: row.left, key: row.key },
      { folder: _s(bFolder), name: row.right, key: row.key },
    ];
  }

  return {
    baseOf: baseOf,
    folderOf: folderOf,
    pairsByFile: pairsByFile,
    marks: marks,
    gaps: gaps,
    segments: segments,
    rows: rows,
    summaryLine: summaryLine,
    headerLabel: headerLabel,
    choicesFor: choicesFor,
  };
})();
