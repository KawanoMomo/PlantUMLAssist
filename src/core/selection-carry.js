'use strict';
// selection-carry — 右パネルの「変更を反映」などで本文を書き換えた後も、選んでいた要素を選んだままにする。
//
// 選択は { type, id, line } で持つが、id は図種によって名前 (部品・クラス) だったり
// 並びの番号 (関係 __r_2) だったりする。名前を直せば id が変わって選択が宙に浮き、
// 行がずれれば番号の id が別の要素を指す。そこで「選んでいた要素の行」を本文の差分で
// 新しい本文の行に辿り、その行にある同じ種類の要素を選び直す。辿れない (行が消えた・
// 前後がまとめて書き換わった) ときや、その行に同じ種類の要素が無いときは選ばない
// (押していない要素に次の反映・Delete が効くのは data-loss)。
// 図種ごとに直さず、どの図種の parse 結果にも同じ規則で当てる。DOM に依存しない純関数。
window.MA = window.MA || {};
window.MA.selectionCarry = (function() {

  function _lines(text) {
    return String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
  }

  function _uniqueIndex(arr, value) {
    var at = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] !== value) continue;
      if (at >= 0) return -1;
      at = i;
    }
    return at;
  }

  function _trimAll(arr) {
    return arr.map(function(s) { return String(s).trim(); });
  }

  // 最長共通部分列で a[i] と b[j] の対応を作る ([ [i, j], ... ] 昇順)。
  function _lcsPairs(a, b) {
    var n = a.length, m = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) {
      dp.push(new Array(m + 1));
      for (var z = 0; z <= m; z++) dp[i][z] = 0;
    }
    for (var x = n - 1; x >= 0; x--) {
      for (var y = m - 1; y >= 0; y--) {
        dp[x][y] = a[x] === b[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
      }
    }
    var pairs = [];
    var p = 0, q = 0;
    while (p < n && q < m) {
      if (a[p] === b[q]) { pairs.push([p, q]); p++; q++; }
      else if (dp[p + 1][q] >= dp[p][q + 1]) p++;
      else q++;
    }
    return pairs;
  }

  var LCS_LIMIT = 250000;   // 書き換わった塊の行数の積の上限 (大きい塊は辿らない)

  // 古い本文の line 行目 (1 始まり) が、新しい本文の何行目になったか。辿れなければ null。
  //   - 書き換わった塊の外の行はずれた分だけ動かす
  //   - 塊の中で同じ中身の行が 1 つだけあればそこ (並べ替え・字下げを変えた移動)
  //   - 塊の行数が変わらなければ同じ位置 (その場の書き換え)
  //   - 行数が変わる塊は、前後の変わらない行に挟まれた隙間の行数が同じとき、
  //     または選んだ行が隙間の先頭で隙間が消えていないときだけ同じ位置
  function mapLine(oldText, newText, line) {
    var a = _lines(oldText), b = _lines(newText);
    var n = a.length, m = b.length;
    var ln = parseInt(line, 10);
    if (isNaN(ln) || ln < 1 || ln > n) return null;
    if (String(oldText) === String(newText)) return ln;
    var p = 0;
    while (p < n && p < m && a[p] === b[p]) p++;
    var s = 0;
    while (s < n - p && s < m - p && a[n - 1 - s] === b[m - 1 - s]) s++;
    var i = ln - 1;
    if (i < p) return ln;
    if (i >= n - s) return ln + (m - n);
    var midA = a.slice(p, n - s), midB = b.slice(p, m - s);
    var k = i - p;
    var target = a[i];
    // 同じ中身の行が塊の前後どちらにも 1 つだけ: 並べ替えで動いた行。
    var exact = _uniqueIndex(midB, target);
    if (exact >= 0 && _uniqueIndex(midA, target) === k) return p + exact + 1;
    // 行数の変わらない塊: その場で書き換えた。
    if (midA.length === midB.length) return p + k + 1;
    // 字下げだけ変えて動いた行 (境界の中へ移す等)。
    var tA = _trimAll(midA), tB = _trimAll(midB);
    var trimmed = _uniqueIndex(tB, tA[k]);
    if (trimmed >= 0 && tA[k] !== '' && _uniqueIndex(tA, tA[k]) === k) return p + trimmed + 1;
    if (midA.length * midB.length > LCS_LIMIT) return null;
    var pairs = _lcsPairs(midA, midB);
    var prevA = -1, prevB = -1, nextA = midA.length, nextB = midB.length;
    for (var j = 0; j < pairs.length; j++) {
      var pa = pairs[j][0], pb = pairs[j][1];
      if (pa === k) return p + pb + 1;
      if (pa < k) { prevA = pa; prevB = pb; }
      else { nextA = pa; nextB = pb; break; }
    }
    var gapB = nextB - prevB - 1;
    // 隙間の行数が同じなら同じ位置。違っても、選んだ行が書き換えた塊の先頭で、塊が残っている
    // (1 行の要素を複数行に書き直した等) なら塊の先頭。塊の途中の行は辿らない。
    if (nextA - prevA !== nextB - prevB && !(k === prevA + 1 && gapB > 0)) return null;
    return p + prevB + 1 + (k - prevA - 1) + 1;
  }

  // parse 結果の配列 (elements / relations / states / transitions / nodes …) の中で
  // id と行を持つものを { bucket, item } で並べる。図種ごとの名前は知らない。
  function _entries(parsed) {
    var out = [];
    if (!parsed || typeof parsed !== 'object') return out;
    Object.keys(parsed).forEach(function(key) {
      var arr = parsed[key];
      if (!Array.isArray(arr)) return;
      arr.forEach(function(it) {
        if (!it || typeof it !== 'object') return;
        if (it.id == null || it.id === '') return;
        if (typeof it.line !== 'number') return;
        out.push({ bucket: key, item: it });
      });
    });
    return out;
  }

  function _find(parsed, sel) {
    var hits = _entries(parsed).filter(function(e) { return String(e.item.id) === String(sel.id); });
    if (!hits.length) return null;
    var byLine = hits.filter(function(e) { return e.item.line === sel.line; });
    if (byLine.length) return byLine[0];
    var byKind = hits.filter(function(e) { return e.item.kind === sel.type; });
    return byKind.length ? byKind[0] : hits[0];
  }

  // 選択 (getSelected() の配列) を、書き換えの前後の本文と parse 結果で持ち越す。
  // 返り値 { action: 'keep' } | { action: 'set', selection: [...] } | { action: 'clear' }
  //   keep  … そのままでよい (同じ id が同じ行に居る・この規則で扱えない選択)
  //   set   … 同じ行の同じ種類の要素に選び直す (名前が変わった・番号がずれた)
  //   clear … 選んでいた行が辿れない / その行に同じ種類の要素が無い
  function carry(selection, oldParsed, oldText, newParsed, newText) {
    if (!selection || selection.length !== 1) return { action: 'keep' };
    var sel = selection[0];
    if (!sel || sel.id == null) return { action: 'keep' };
    var before = _find(oldParsed, sel);
    // 選択が parse 結果の一覧に無い種類 (メンバー・本文の行・文書の飾り) は扱わない。
    if (!before) return { action: 'keep' };
    var to = mapLine(oldText, newText, before.item.line);
    if (to == null) return { action: 'clear' };
    // kind が選択の種類そのもの (message / component / class …) なら同じ kind だけを候補にする
    // (シーケンスの relations にはメッセージと note が混ざる)。kind が関係の種別 (dependency 等) なら
    // 種別を変える反映もあるので、同じ一覧の要素を候補にする。
    var kindOf = before.item.kind;
    var strictKind = kindOf != null && kindOf === sel.type;
    var cands = _entries(newParsed).filter(function(e) {
      return e.bucket === before.bucket && e.item.line === to && (!strictKind || e.item.kind === kindOf);
    });
    if (!cands.length) return { action: 'clear' };
    var same = cands.filter(function(e) { return String(e.item.id) === String(sel.id); });
    var pick = same.length ? same[0]
      : (cands.filter(function(e) { return e.item.kind === kindOf; })[0] || cands[0]);
    if (String(pick.item.id) === String(sel.id) && sel.line === to) return { action: 'keep' };
    var next = {};
    Object.keys(sel).forEach(function(k2) { next[k2] = sel[k2]; });
    next.id = pick.item.id;
    next.line = to;
    return { action: 'set', selection: [next] };
  }

  return { mapLine: mapLine, carry: carry };
})();
