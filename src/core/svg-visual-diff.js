'use strict';
window.MA = window.MA || {};

// svg-visual-diff — 保存中の SVG と、今の puml を描き直した SVG を、
// 「目に見えるもの」だけで突き合わせる。
//
// BLK-reviewer-20260914-2106-wish: stale (印の不一致) が出た図について、
// 可視内容が本当にずれているのか、コメント行の追加や埋め込みソースの符号化差分
// だけの見かけ上の stale なのかを、reviewer が 1 枚ずつ /render を叩いて
// `<?plantuml-src …?>` を取り除いた文字列 diff で裏取りしていた。
// 図が増えるほどこの手作業が線形に増える。
//
// 既にある判定との違い:
//   svg-freshness   — 印 (sha1) の突合。「違う」としか言えず、体裁差でも違うと出る
//   svg-diff-summary— puml の本文と SVG の文字列の突合。旧名の残り・欠落を名指しする
//   ここ            — 旧 SVG と新 SVG を、描かれている文字とその座標・図形で突き合わせる
// 文字が同じでも座標が動いていれば「レイアウトが動いた」と言える。これは
// 上の 2 つがどちらも言えなかったところで、手順6 (レイアウト崩れ確認) が要るのはここ。
//
// 答えは 3 つだけ。
//   same    — 描かれる文字も図形も座標まで一致。差は埋め込みソース・体裁だけ
//             (= 再エクスポートすれば消える。指摘には「内容一致」と書いてよい)
//   moved   — 同じものが描かれているが、位置が動いた (レイアウト崩れ)
//   changed — 描かれるものが増えた / 減った (実質的な内容変更)
// 読めない SVG は unknown。分からないことを same と言わない。
window.MA.svgVisualDiff = (function() {

  // 座標の差がこの値以下なら「動いていない」とみなす。PlantUML の描画は決定的なので
  // 本来は 0 だが、書き出し経路で小数の丸めが変わることがあるぶんだけ許す。
  var MOVE_TOL = 1.5;

  function _num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // SVG の属性を 1 つ取り出す。属性の順序・引用符の種類に依らないように見る。
  function _attr(tagText, name) {
    var m = tagText.match(new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"'))
      || tagText.match(new RegExp("\\s" + name + "\\s*=\\s*'([^']*)'"));
    return m ? m[1] : '';
  }

  function _decode(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // 描かれる文字。<text> の中身を、入れ子の <tspan> ごと 1 つの文字列にする
  // (PlantUML は装飾のたびに tspan で分けるので、分けたまま比べると
  //  「装飾が変わっただけ」が「文字が変わった」に見える)。
  // 座標は <text> 自身の x/y を採る。
  function labels(svgText) {
    var out = [];
    var re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    var m;
    while ((m = re.exec(String(svgText == null ? '' : svgText))) !== null) {
      var inner = m[2].replace(/<[^>]*>/g, '');
      var text = _decode(inner).replace(/\s+/g, ' ').trim();
      if (text === '') continue;
      out.push({ text: text, x: _num(_attr(m[1], 'x')), y: _num(_attr(m[1], 'y')) });
    }
    return out;
  }

  // 描かれる図形。線・枠・楕円・多角形・パス。
  // sig は「同じ形か」を言うための指紋 (大きさ・長さ) で、位置は別に持つ。
  // 大きさを指紋に入れるのは、箱が 1 つ増えたのと箱が広がったのを分けるため。
  var SHAPE_RE = /<(line|rect|ellipse|circle|polygon|path|polyline)\b([^>]*)\/?>/g;

  function _round(n) { return Math.round(n * 10) / 10; }

  function shapes(svgText) {
    var out = [];
    var s = String(svgText == null ? '' : svgText);
    var m;
    SHAPE_RE.lastIndex = 0;
    while ((m = SHAPE_RE.exec(s)) !== null) {
      var tag = m[1];
      var a = m[2];
      var x = 0, y = 0, sig = tag;
      if (tag === 'line') {
        var x1 = _num(_attr(a, 'x1')), y1 = _num(_attr(a, 'y1'));
        var x2 = _num(_attr(a, 'x2')), y2 = _num(_attr(a, 'y2'));
        x = x1; y = y1;
        sig = 'line:' + _round(x2 - x1) + 'x' + _round(y2 - y1);
      } else if (tag === 'rect') {
        x = _num(_attr(a, 'x')); y = _num(_attr(a, 'y'));
        sig = 'rect:' + _round(_num(_attr(a, 'width'))) + 'x' + _round(_num(_attr(a, 'height')));
      } else if (tag === 'ellipse' || tag === 'circle') {
        x = _num(_attr(a, 'cx')); y = _num(_attr(a, 'cy'));
        sig = tag + ':' + _round(_num(_attr(a, tag === 'circle' ? 'r' : 'rx')))
          + 'x' + _round(_num(_attr(a, tag === 'circle' ? 'r' : 'ry')));
      } else if (tag === 'polygon' || tag === 'polyline') {
        var pts = _attr(a, 'points').trim().split(/[\s,]+/).map(_num);
        x = pts.length > 1 ? pts[0] : 0;
        y = pts.length > 1 ? pts[1] : 0;
        // 先頭からの相対座標を指紋にする。図形ごと平行移動しただけなら指紋は変わらない。
        var rel = [];
        for (var i = 0; i + 1 < pts.length; i += 2) {
          rel.push(_round(pts[i] - x) + ',' + _round(pts[i + 1] - y));
        }
        sig = 'polygon:' + rel.join(' ');
      } else {
        // path は d の数値を落として形だけを見る。数値まで入れると
        // 平行移動が別の形に見え、「動いた」が「増えた/減った」に化ける。
        var d = _attr(a, 'd');
        var head = d.match(/^\s*[Mm]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
        x = head ? _num(head[1]) : 0;
        y = head ? _num(head[2]) : 0;
        sig = 'path:' + d.replace(/-?[\d.]+/g, '#').replace(/\s+/g, ' ').trim();
      }
      out.push({ tag: tag, sig: sig, x: x, y: y });
    }
    return out;
  }

  // 同じ鍵を持つものどうしを、出てくる順に組にする。
  // 組にならずに残ったものが「増えた」「減った」。
  function _bucket(rows, keyOf) {
    var map = {};
    rows.forEach(function(r) {
      var k = keyOf(r);
      (map[k] = map[k] || []).push(r);
    });
    return map;
  }

  function _pairUp(oldRows, newRows, keyOf) {
    var ob = _bucket(oldRows, keyOf);
    var nb = _bucket(newRows, keyOf);
    var pairs = [], added = [], removed = [];
    Object.keys(ob).forEach(function(k) {
      var o = ob[k], n = nb[k] || [];
      var i = 0;
      for (; i < o.length && i < n.length; i++) pairs.push({ old: o[i], now: n[i] });
      for (; i < o.length; i++) removed.push(o[i]);
    });
    Object.keys(nb).forEach(function(k) {
      var n = nb[k], o = ob[k] || [];
      for (var i = o.length; i < n.length; i++) added.push(n[i]);
    });
    return { pairs: pairs, added: added, removed: removed };
  }

  function _moved(pairs) {
    return pairs.filter(function(p) {
      return Math.abs(p.old.x - p.now.x) > MOVE_TOL || Math.abs(p.old.y - p.now.y) > MOVE_TOL;
    });
  }

  function _isSvg(s) {
    return typeof s === 'string' && /<svg[\s>]/i.test(s);
  }

  // 旧 SVG (保存中のもの) と新 SVG (今の puml を描き直したもの) を突き合わせる。
  function compare(oldSvg, newSvg) {
    if (!_isSvg(oldSvg) || !_isSvg(newSvg)) {
      return {
        verdict: 'unknown', addedLabels: [], removedLabels: [], movedLabels: [],
        addedShapes: 0, removedShapes: 0, movedShapes: 0, sameLabels: 0,
      };
    }
    var lp = _pairUp(labels(oldSvg), labels(newSvg), function(r) { return r.text; });
    var sp = _pairUp(shapes(oldSvg), shapes(newSvg), function(r) { return r.sig; });
    var movedL = _moved(lp.pairs);
    var movedS = _moved(sp.pairs);
    var changed = lp.added.length || lp.removed.length || sp.added.length || sp.removed.length;
    var verdict = changed ? 'changed' : ((movedL.length || movedS.length) ? 'moved' : 'same');
    return {
      verdict: verdict,
      addedLabels: lp.added.map(function(r) { return r.text; }),
      removedLabels: lp.removed.map(function(r) { return r.text; }),
      movedLabels: movedL.map(function(p) {
        return { text: p.old.text, dx: _round(p.now.x - p.old.x), dy: _round(p.now.y - p.old.y) };
      }),
      addedShapes: sp.added.length,
      removedShapes: sp.removed.length,
      movedShapes: movedS.length,
      sameLabels: lp.pairs.length - movedL.length,
    };
  }

  var VERDICT_TEXT = {
    same: '可視内容は同一 — 再エクスポートだけで済みます',
    moved: 'レイアウトだけが動きました — 描かれるものは同じです',
    changed: '可視内容がずれています — 実質的な内容変更です',
    unknown: '比べられませんでした（SVG を読めません）',
  };

  var VERDICT_TITLE = {
    same: '保存中の SVG と、今の puml を描き直した SVG で、描かれる文字・図形が座標まで一致しました。'
      + '違いは埋め込みソース (コメント行など) と体裁だけなので、指摘には「内容一致」と書けます',
    moved: '描かれる文字・図形は増減していませんが、位置が動いています。'
      + 'レイアウトが崩れていないかをこの画面で見比べてください',
    changed: '描かれる文字・図形が増減しています。コメントの差ではなく、図の中身が変わっています',
    unknown: 'SVG を読めなかったので、一致するとも食い違うとも言えません',
  };

  function verdictText(result) {
    return VERDICT_TEXT[(result && result.verdict) || 'unknown'] || VERDICT_TEXT.unknown;
  }

  function verdictTitle(result) {
    return VERDICT_TITLE[(result && result.verdict) || 'unknown'] || VERDICT_TITLE.unknown;
  }

  // 画面に出す件数の 1 行。0 件のものは書かない (0 が並ぶと読む所が増える)。
  function countsText(result) {
    if (!result || result.verdict === 'unknown') return '';
    var p = [];
    if (result.addedLabels.length) p.push('文字 追加 ' + result.addedLabels.length);
    if (result.removedLabels.length) p.push('文字 削除 ' + result.removedLabels.length);
    if (result.movedLabels.length) p.push('文字 移動 ' + result.movedLabels.length);
    if (result.addedShapes) p.push('図形 追加 ' + result.addedShapes);
    if (result.removedShapes) p.push('図形 削除 ' + result.removedShapes);
    if (result.movedShapes) p.push('図形 移動 ' + result.movedShapes);
    return p.length ? p.join(' / ') : '差分なし（文字 ' + result.sameLabels + ' 件が同じ位置）';
  }

  // 指摘文。そのまま primary に渡せる形にする。
  function report(name, result) {
    var lines = [name + ': ' + verdictText(result)];
    var c = countsText(result);
    if (c) lines.push('  ' + c);
    (result && result.addedLabels || []).slice(0, 20).forEach(function(t) {
      lines.push('  + ' + t);
    });
    (result && result.removedLabels || []).slice(0, 20).forEach(function(t) {
      lines.push('  - ' + t);
    });
    (result && result.movedLabels || []).slice(0, 20).forEach(function(m) {
      lines.push('  ~ ' + m.text + ' (' + (m.dx >= 0 ? '+' : '') + m.dx
        + ', ' + (m.dy >= 0 ? '+' : '') + m.dy + ')');
    });
    return lines.join('\n');
  }

  return {
    labels: labels,
    shapes: shapes,
    compare: compare,
    verdictText: verdictText,
    verdictTitle: verdictTitle,
    countsText: countsText,
    report: report,
    MOVE_TOL: MOVE_TOL,
  };
})();
