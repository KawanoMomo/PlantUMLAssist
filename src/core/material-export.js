'use strict';
window.MA = window.MA || {};

// material-export — 「資料化」。部品名と図種を選ぶと、その図種に決まっている
// 書き出し形式・題名の (資料用)・提出物庫への控え・一覧への反映までを 1 回で行う。
//
// BLK-junior-20260908-2303-wish: 設計書に貼る資料を作る場面は「題名に (資料用) を
// 付けて保存」「図種に合わせた形式で Export」「保存先確認」「一覧から開き直す」の
// 4 操作に分かれていて、しかも正しい形式 (状態遷移図 = SVG、他 = PNG 透過) を
// 利用者が覚えて選ぶ。覚え違いは PNG/SVG を逆に選ぶ手戻りとして実際に起きている。
// 形式の決まりは図種で一意に決まるのだから、利用者に覚えさせるのではなく
// ここに 1 か所だけ持ち、選ぶのは「どの部品の・どの図種か」だけにする。
//
// 図種の語彙と部品の切り方は componentPack に任せる (二重に持つと、まとめ資料化
// と 1 枚の資料化で部品の括りがずれる)。DOM・fetch・localStorage には触らない。
window.MA.materialExport = (function() {

  var SUFFIX = '(資料用)';

  // 形式の決まり。設計書に貼ったあとで拡大される図 (状態遷移図は遷移ラベルが
  // 小さく、印刷でも読めないと差し戻される) はベクタで出す。それ以外は
  // 背景を持たない PNG — 設計書の地色に載せて浮かないため。
  var SVG_KINDS = ['状態遷移図'];

  var FORMATS = {
    'svg': { id: 'svg', label: 'SVG', ext: '.svg' },
    'png-transparent': { id: 'png-transparent', label: 'PNG（透過背景）', ext: '.png' },
  };

  function _s(v) { return v == null ? '' : String(v); }
  function _cp() { return window.MA.componentPack; }

  // formatFor(kind) — 図種に決まっている書き出し形式。図種が分からないときは
  // PNG 透過 (設計書に貼る既定。SVG は貼り先を選ぶので、当てずっぽうにはしない)。
  function formatFor(kind) {
    return SVG_KINDS.indexOf(_s(kind)) >= 0 ? 'svg' : 'png-transparent';
  }

  function formatLabel(format) {
    var f = FORMATS[_s(format)] || FORMATS['png-transparent'];
    return f.label;
  }

  function formatExt(format) {
    var f = FORMATS[_s(format)] || FORMATS['png-transparent'];
    return f.ext;
  }

  // なぜその形式なのかを 1 行で言う。押す前に読めないと、決まりを覚えていない
  // 利用者は「勝手に選ばれた」と思って結局手で選び直す。
  function formatReason(kind) {
    if (formatFor(kind) === 'svg') {
      return _s(kind) + ' は拡大しても遷移ラベルが読めるように SVG で出します';
    }
    var k = _s(kind);
    return (k ? k : 'この図') + ' は設計書の地色に載せられるように PNG（透過背景）で出します';
  }

  // materialTitle(name) — 題名の末尾に (資料用) を付ける。既に付いていれば
  // そのまま (押すたびに「(資料用)(資料用)」と伸びない)。拡張子は落とす。
  function materialTitle(name) {
    var base = _s(name).replace(/\.[A-Za-z0-9]+$/, '').trim();
    if (base === '') return SUFFIX;
    if (/[(（]\s*資料用\s*[)）]$/.test(base)) return base;
    return base + SUFFIX;
  }

  // applyTitle(dsl, title) — DSL の title 行を差し替える。無ければ @startuml の
  // 直後に足す (題名の無い図でも、資料には図名が要る)。
  function applyTitle(dsl, title) {
    var text = _s(dsl);
    var t = _s(title);
    if (t === '') return text;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s/i.test(lines[i]) || /^\s*title$/i.test(lines[i])) {
        lines[i] = lines[i].replace(/^(\s*)title\b.*$/i, '$1title ' + t);
        return lines.join('\n');
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (/^\s*@startuml/i.test(lines[j])) {
        lines.splice(j + 1, 0, 'title ' + t);
        return lines.join('\n');
      }
    }
    return 'title ' + t + '\n' + text;
  }

  // components(files) — 選べる部品。まとめ資料化と同じ括り方。
  function components(files) {
    var cp = _cp();
    if (!cp) return [];
    return cp.groupByComponent(files || []).map(function(g) {
      return { component: g.component, files: g.files, kinds: kindsOf(g.files) };
    }).filter(function(g) { return g.kinds.length > 0; });
  }

  function _group(files, component) {
    var list = components(files);
    var want = _s(component);
    for (var i = 0; i < list.length; i++) if (list[i].component === want) return list[i];
    return null;
  }

  // kindsOf(files) — その部品にある図種。図種を読めないファイルは選択肢に出さない
  // (形式を決められないものを「資料化」に並べると、決まりの無い書き出しになる)。
  function kindsOf(files) {
    var cp = _cp();
    if (!cp) return [];
    var out = [];
    (Array.isArray(files) ? files : []).forEach(function(f) {
      var k = cp.kindOf(f);
      if (k && out.indexOf(k) < 0) out.push(k);
    });
    return out;
  }

  // kindsFor(files, component) — 画面の図種プルダウンに出す行 (形式も一緒に見せる)。
  function kindsFor(files, component) {
    var g = _group(files, component);
    if (!g) return [];
    return g.kinds.map(function(k) {
      return { kind: k, format: formatFor(k), formatLabel: formatLabel(formatFor(k)) };
    });
  }

  // 同じ部品・同じ図種のファイルが複数あるとき、どれを資料の元にするか。
  // 既に (資料用) が付いた版ではなく元の版を選ぶ — 資料は元から作り直す。
  function pickSource(files, kind) {
    var cp = _cp();
    if (!cp) return '';
    var hits = (Array.isArray(files) ? files : []).filter(function(f) {
      return cp.kindOf(f) === _s(kind);
    });
    if (!hits.length) return '';
    hits.sort(function(a, b) {
      var va = cp.variantOf(a) ? 1 : 0;
      var vb = cp.variantOf(b) ? 1 : 0;
      if (va !== vb) return va - vb;
      if (a.length !== b.length) return a.length - b.length;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return hits[0];
  }

  // BLK-junior-20260929-0854: 同じ部品・図種にファイルが複数あると、部品と図種の 2 欄だけでは
  // 開いている図と別の (名前の短い古い) 図が資料化され、GUI から選び直せなかった。
  // sourcesFor(files, component, kind) — その部品・図種で元にできるファイル。並びは pickSource と同じ
  // (先頭が既定)。(資料用) の版は元にしない (元の版が 1 枚も無いときだけ残す)。
  function sourcesFor(files, component, kind) {
    var cp = _cp();
    var g = _group(files, component);
    if (!cp || !g) return [];
    var k = _s(kind);
    var hits = g.files.filter(function(f) { return cp.kindOf(f) === k; });
    var plain = hits.filter(function(f) { return !cp.variantOf(f); });
    var list = plain.length ? plain : hits;
    var first = pickSource(list, k);
    return first ? [first].concat(list.filter(function(f) { return f !== first; })) : [];
  }

  function _bare(name) { return _s(name).replace(/\.puml$/i, ''); }

  // sourceOf(files, name) — 開いている図の名前から、資料化の部品・図種・元のファイルを引く。
  // 開いているのが (資料用) の版なら、同じ名前の元の版を元にする。引けなければ null。
  function sourceOf(files, name) {
    var cp = _cp();
    var want = _bare(name).trim();
    if (!cp || want === '') return null;
    var base = want.replace(/[(（]\s*資料用\s*[)）]$/, '');
    var list = components(files);
    // 資料用の版を開いているなら元の版を先に探し、無ければ資料用の版そのものを元にする。
    var tries = base !== want ? [base, want] : [want];
    for (var t = 0; t < tries.length; t++) {
      for (var i = 0; i < list.length; i++) {
        for (var j = 0; j < list[i].files.length; j++) {
          var f = list[i].files[j];
          var k = cp.kindOf(f);
          if (k && _bare(f) === tries[t]) return { component: list[i].component, kind: k, source: f };
        }
      }
    }
    return null;
  }

  // plan(files, component, kind, source) — 押したら何が起きるかの全部。
  // 元にするファイル / 形式 / 付ける題名 / 書き出すファイル名 / 保存する名前。
  // source を渡すと、その部品・図種の候補にある限りそれを元にする (名前と題もそこから作る)。
  function plan(files, component, kind, source) {
    var g = _group(files, component);
    if (!g) return null;
    var k = _s(kind);
    if (g.kinds.indexOf(k) < 0) return null;
    var cands = sourcesFor(files, g.component, k);
    var want = _s(source);
    var picked = '';
    for (var c = 0; c < cands.length && want !== ''; c++) {
      if (cands[c] === want || _bare(cands[c]) === _bare(want)) picked = cands[c];
    }
    var src = picked || cands[0] || pickSource(g.files, k);
    if (!src) return null;
    var format = formatFor(k);
    var title = materialTitle(src);
    return {
      component: g.component,
      kind: k,
      source: src,
      format: format,
      formatLabel: formatLabel(format),
      title: title,
      docName: title,
      filename: title + formatExt(format),
      reason: formatReason(k),
      others: Math.max(0, cands.length - 1),
    };
  }

  // planText(p) — 実行ボタンの上に出す 1 行。押す前に「何が・どの形式で・どの名前で」
  // 出るかが読めること。
  function planText(p) {
    if (!p) return '部品と図種を選ぶと、書き出す形式と名前がここに出ます。';
    var more = p.others > 0 ? '（同じ部品・図種にほかに ' + p.others + ' 枚。図種の欄でファイルを選べます）' : '';
    return p.source + ' → ' + p.filename + '（' + p.formatLabel + '）' + more + '／ ' + p.reason;
  }

  function emptyText(files) {
    var n = components(files).length;
    if (n === 0) return '保存フォルダに図がありません。図を保存すると資料化できます。';
    return '';
  }

  // doneMessage(p) — 済んだあとに何が残ったかを言う。書き出しただけでは
  // 「保存フォルダにも入ったのか」が分からず、結局一覧を開いて確かめていた。
  // BLK-junior-20260928-2255: done (runMaterialPlan の結果 { imageSize, vault }) があれば、書けたことを
  // 確かめた所だけを言う。画像の大きさは保存フォルダに書けた後の実物の大きさ。庫に入れていなければ庫とは言わない。
  function doneMessage(p, done) {
    if (!p) return '資料化できませんでした';
    if (!done) return '' + p.title + ' を ' + p.formatLabel + ' で書き出し、保存フォルダと提出物庫に入れました';
    var where = done.vault ? '保存フォルダと提出物庫' : '保存フォルダ';
    var size = Number(done.imageSize);
    return '' + p.filename + '（' + p.formatLabel + (size > 0 ? '・' + size + ' バイト' : '') + '）を'
      + where + 'に書き出しました';
  }

  // 画像の実体を書けなかったときの理由。「成功」とは言わず、どこに・なぜ書けなかったかを言う。
  function imageFailText(p, where, why) {
    var name = p && p.filename ? p.filename : '画像';
    return '画像 ' + name + ' を' + _s(where) + 'に書けませんでした' + (why ? '（' + _s(why) + '）' : '');
  }

  function failMessage(p, err) {
    var e = _s(err && err.message ? err.message : err);
    return '資料化できませんでした（' + (p ? p.source : '対象なし') + '）' + (e ? '：' + e : '');
  }

  return {
    SUFFIX: SUFFIX,
    SVG_KINDS: SVG_KINDS,
    FORMATS: FORMATS,
    formatFor: formatFor,
    formatLabel: formatLabel,
    formatExt: formatExt,
    formatReason: formatReason,
    materialTitle: materialTitle,
    applyTitle: applyTitle,
    components: components,
    kindsOf: kindsOf,
    kindsFor: kindsFor,
    pickSource: pickSource,
    sourcesFor: sourcesFor,
    sourceOf: sourceOf,
    plan: plan,
    planText: planText,
    emptyText: emptyText,
    doneMessage: doneMessage,
    imageFailText: imageFailText,
    failMessage: failMessage,
  };
})();
