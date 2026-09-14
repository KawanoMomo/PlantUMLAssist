'use strict';
window.MA = window.MA || {};

// svg-diff-summary — 「内容ずれ」と分かった SVG の、食い違いの中身を言う。
//
// BLK-reviewer-20260908-1203-wish: 一覧は「内容ずれ」までは言えるようになったが
// (BLK-reviewer-20260908-1103 / -1103-wish)、中身が何と何で食い違っているかは
// 出さない。そのため reviewer は食い違った図 7 枚を 1 枚ずつ開き、旧 participant 名や
// 欠けた状態・遷移を grep で手当たり次第に突き止めていた (1 枚あたり 10 行前後)。
// ここは puml の本文と、保存中の SVG に実際に書かれている文字列を突き合わせ、
//   欠落 — puml にあるのに SVG のどこにも出てこない名前・ラベル
//   残存 — SVG に出てくるのに今の puml のどこにも無い文字列 (旧名の残り)
// の 2 つに分けて返す。指摘文はここで組み立てて、そのまま primary に渡せる形にする。
//
// 突き合わせは「SVG の文字列のどこかに含まれるか」で見る。PlantUML の SVG は
// ラベルを折り返しや装飾で分割することがあり、厳密一致にすると「消えていない名前」を
// 欠落と言ってしまう。名指しの誤りは grep のやり直しより高くつくので、
// 取りこぼす側 (言わない側) に倒す。
window.MA.svgDiffSummary = (function() {

  // puml から「SVG に文字として現れるはずのもの」だけを拾う。
  // skinparam や矢印記号のような描かれない語は入れない (残存の判定を濁らせる)。
  var PARTICIPANT = /^(participant|actor|boundary|control|entity|database|collections|queue)\b\s+(.*)$/;
  var CLASS = /^(abstract\s+class|abstract|class|interface|enum|component|rectangle|package|node|folder)\b\s+(.*)$/;
  var STATE = /^state\s+(.*)$/;
  var ARROW = /\s(?:-+\[[^\]]*\]-*|-+)(?:\|>|>>|>|\*|o)?\s|\s(?:<\||<<|<|\*|o)?(?:-+\[[^\]]*\]-*|-+)\s/;

  function _strip(s) {
    var t = String(s == null ? '' : s).trim();
    // "Label" as Alias / Alias as "Label" のどちらでも、書かれている名前を両方拾う。
    return t;
  }

  function _names(decl) {
    // 宣言の後ろ側から、表示名になりうるものを取り出す。
    // `"注文サービス" as Order <<service>>` → 注文サービス と Order
    var out = [];
    var rest = _strip(decl);
    rest = rest.replace(/<<[^>]*>>/g, ' ').replace(/#[0-9a-zA-Z]+\s*$/, ' ');
    rest = rest.replace(/\{\s*$/, ' ');
    var quoted = rest.match(/"([^"]+)"/g) || [];
    quoted.forEach(function(q) { out.push(q.slice(1, -1)); });
    rest = rest.replace(/"[^"]*"/g, ' ');
    rest.split(/\s+as\s+|\s+/).forEach(function(w) {
      var t = w.trim().replace(/^[\[(]|[\])]$/g, '');
      if (t && /[^\s:{}#]/.test(t) && !/^(as|order|<<|>>)$/i.test(t)) out.push(t);
    });
    return out;
  }

  function _push(rows, seen, kind, label) {
    var t = String(label == null ? '' : label).trim();
    // 同じ文字は 1 度だけ。participant として宣言され、矢印の端点にも出る名前を
    // 2 度名指しすると、指摘文が実際より多くの食い違いがあるように読める。
    if (!t || seen[t]) return;
    seen[t] = true;
    rows.push({ kind: kind, label: t });
  }

  // puml の本文から {kind, label} の一覧を作る。kind は指摘文の言葉づかいに使う。
  function pumlLabels(text) {
    var rows = [];
    var seen = {};
    String(text == null ? '' : text).split('\n').forEach(function(raw) {
      var line = raw.trim();
      if (!line || line.charAt(0) === "'" || /^@(start|end)uml/.test(line)) return;
      if (/^(skinparam|!|hide|show|scale|title|header|footer|left to right|top to bottom|autonumber)\b/.test(line)) return;
      var m;
      if ((m = line.match(PARTICIPANT))) {
        _names(m[2]).forEach(function(n) { _push(rows, seen, 'participant', n); });
        return;
      }
      if ((m = line.match(STATE))) {
        _names(m[1]).forEach(function(n) { _push(rows, seen, 'state', n); });
        return;
      }
      if ((m = line.match(CLASS))) {
        _names(m[2]).forEach(function(n) { _push(rows, seen, 'element', n); });
        return;
      }
      if (ARROW.test(line)) {
        var head = line, label = '';
        var idx = line.indexOf(':');
        if (idx >= 0) { head = line.slice(0, idx); label = line.slice(idx + 1).trim(); }
        var ends = head.split(ARROW);
        ends.forEach(function(e) {
          var n = e.trim().replace(/^[\[(]|[\])]$/g, '').replace(/"/g, '');
          if (n && n !== '*' && !/^\[?\*\]?$/.test(n)) _push(rows, seen, 'endpoint', n);
        });
        if (label) _push(rows, seen, 'message', label);
        return;
      }
      // アクティビティの action `:やること;`
      if ((m = line.match(/^:(.+);$/))) { _push(rows, seen, 'action', m[1].trim()); return; }
    });
    return rows;
  }

  // SVG の文字列 (text 要素の中身) を 1 本につないで持つ。
  // 折り返しで分かれていても「含まれるか」で見るので、つないだ形で足りる。
  function _haystack(svgLabels) {
    return (Array.isArray(svgLabels) ? svgLabels : []).join('\n');
  }

  // 残存の候補にしない文字列。数字だけ・記号だけ・1 文字は、
  // 図の飾りや行番号であることが多く、名指しすると毎回混ざる。
  function _ignorable(s) {
    var t = String(s == null ? '' : s).trim();
    if (t.length < 2) return true;
    if (/^[\s0-9.,:;|()\[\]{}<>*+\-_=\/\\#"']+$/.test(t)) return true;
    return false;
  }

  var KIND_LABEL = {
    participant: 'participant', state: '状態', element: '要素',
    endpoint: '端点', message: 'メッセージ', action: 'アクション',
  };

  function kindLabel(kind) { return KIND_LABEL[kind] || '要素'; }

  // puml と、保存中の SVG の文字列を突き合わせる。
  // missing  — puml にあるのに SVG に無い (描き直せば増えるもの)
  // leftover — SVG にあるのに puml に無い (旧名の残り。描き直せば消えるもの)
  // BLK-reviewer-20260908-1303: 文字に現れない差の内訳。
  // 保存中の SVG と、今の puml を描き直した SVG を直に比べる。
  // 図形の数 (矢印の先端・枠・線) と、文字の並び順は、名前が 1 文字も
  // 変わらないまま構造だけ変わった差 — 矢印の向き、note の位置、要素の並び替え — で動く。
  var SHAPE_LABEL = {
    path: '線・曲線', polygon: '多角形（矢印の先端など）', line: '直線',
    rect: '四角の枠', ellipse: '楕円', circle: '円', text: '文字', polyline: '折れ線',
  };

  function shapeLabel(tag) { return SHAPE_LABEL[tag] || tag; }

  function _list(v) { return Array.isArray(v) ? v : []; }

  // 両方に出てくる文字だけを取り出し、並びが違えばそれを言う。
  // 名前が同じまま要素を入れ替えた図は、ここでしか差が出ない。
  function _orderRow(oldLabels, newLabels) {
    var inNew = {};
    _list(newLabels).forEach(function(s) { inNew[String(s)] = true; });
    var inOld = {};
    _list(oldLabels).forEach(function(s) { inOld[String(s)] = true; });
    var a = _list(oldLabels).map(String).filter(function(s) { return inNew[s]; });
    var b = _list(newLabels).map(String).filter(function(s) { return inOld[s]; });
    if (a.length < 2 || a.length !== b.length) return null;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return {
          kind: 'order',
          label: '文字の並び順',
          was: a[i], now: b[i],
          text: '文字の並び順が違います（' + (i + 1) + ' 番目が「' + a[i] + '」→「' + b[i] + '」）',
        };
      }
    }
    return null;
  }

  // 保存中の SVG と描き直した SVG の、図形の数の差。
  function _shapeRows(oldShape, newShape) {
    var o = oldShape && typeof oldShape === 'object' ? oldShape : {};
    var n = newShape && typeof newShape === 'object' ? newShape : {};
    var tags = {};
    Object.keys(o).forEach(function(k) { tags[k] = true; });
    Object.keys(n).forEach(function(k) { tags[k] = true; });
    var rows = [];
    Object.keys(tags).sort().forEach(function(tag) {
      var was = o[tag] || 0, now = n[tag] || 0;
      if (was === now) return;
      rows.push({
        kind: 'shape', label: shapeLabel(tag), was: was, now: now,
        text: shapeLabel(tag) + ' の数が違います（保存中 ' + was + ' → 描き直すと ' + now + '）',
      });
    });
    return rows;
  }

  // 保存中の SVG にしか無い / 描き直した SVG にしか無い文字。
  // puml との突き合わせ (missing / leftover) が取りこぼした文字をここで拾う。
  function _labelRows(oldLabels, newLabels, missing, leftover) {
    var said = {};
    (missing || []).forEach(function(r) { said[r.label] = true; });
    (leftover || []).forEach(function(s) { said[String(s)] = true; });
    var inOld = {}, inNew = {};
    _list(oldLabels).forEach(function(s) { inOld[String(s)] = true; });
    _list(newLabels).forEach(function(s) { inNew[String(s)] = true; });
    var rows = [];
    Object.keys(inOld).forEach(function(s) {
      if (!inNew[s] && !said[s] && !_ignorable(s)) {
        rows.push({ kind: 'label-gone', label: s, text: '描き直すと消える文字: ' + s });
      }
    });
    Object.keys(inNew).forEach(function(s) {
      if (!inOld[s] && !said[s] && !_ignorable(s)) {
        rows.push({ kind: 'label-new', label: s, text: '描き直すと増える文字: ' + s });
      }
    });
    return rows;
  }

  function compare(pumlText, svgLabels, extra) {
    var rows = pumlLabels(pumlText);
    var hay = _haystack(svgLabels);
    var puml = String(pumlText == null ? '' : pumlText);
    var missing = rows.filter(function(r) { return hay.indexOf(r.label) < 0; });
    var seen = {};
    var leftover = (Array.isArray(svgLabels) ? svgLabels : []).filter(function(s) {
      var t = String(s == null ? '' : s).trim();
      if (_ignorable(t) || seen[t]) return false;
      seen[t] = true;
      return puml.indexOf(t) < 0;
    });
    var ex = extra && typeof extra === 'object' ? extra : {};
    // 材料が来ているか。来ていなければ「構造の差は調べていない」と言う
    // (「調べたが無かった」と読ませない)。
    var hasLabels = Array.isArray(ex.drawnLabels);
    var hasShape = !!(ex.drawnShape && typeof ex.drawnShape === 'object');
    var known = hasLabels || hasShape;
    var structural = hasShape ? _shapeRows(ex.svgShape, ex.drawnShape) : [];
    if (hasLabels) {
      // 材料が無いのに「描き直すと消える文字」を並べない。
      // 空の drawnLabels を「全部消える」と読むと、毎回すべての文字を名指しする。
      structural = structural.concat(_labelRows(svgLabels, ex.drawnLabels, missing, leftover));
      var ord = _orderRow(svgLabels, ex.drawnLabels);
      if (ord) structural.push(ord);
    }
    return {
      missing: missing,
      leftover: leftover,
      total: missing.length + leftover.length,
      empty: missing.length === 0 && leftover.length === 0,
      structural: structural,
      structuralKnown: !!known,
    };
  }

  // 文字でも構造でも差が出なかったのに、バイトでは一致しない図。
  // ここで「差なし」と言い切ると primary が直さないので、必ず不一致だと言う。
  function _noTextLine(diff) {
    var st = (diff && diff.structural) || [];
    if (st.length) {
      return '文字の上での違いはありませんが、構造が違います（' + st[0].text
        + (st.length > 1 ? ' ほか ' + (st.length - 1) + ' 件' : '') + '）';
    }
    if (diff && diff.structuralKnown) {
      return '文字でも図形の数でも違いは出ませんでしたが、この SVG は今の puml を描いた結果と一致していません（座標・向きなど位置の差）';
    }
    return '文字の上での違いは見つかりませんでしたが、この SVG は今の puml を描いた結果と一致していません（構造の差は調べていません）';
  }

  // 1 行の要約。何枚ぶんも並ぶので、件数と種類だけを言う。
  function summary(diff) {
    if (!diff || diff.empty) return _noTextLine(diff);
    var parts = [];
    if (diff.missing.length) parts.push('欠落 ' + diff.missing.length + ' 件');
    if (diff.leftover.length) parts.push('SVG に残る古い名前 ' + diff.leftover.length + ' 件');
    if (diff.structural && diff.structural.length) {
      parts.push('構造の違い ' + diff.structural.length + ' 件');
    }
    return parts.join(' / ');
  }

  // primary へそのまま渡せる指摘文。図ごとに 1 ブロック。
  function reportText(name, diff) {
    var lines = ['[' + String(name) + '] SVG が今の puml と食い違っています'];
    if (!diff || diff.empty) {
      lines.push('  - ' + _noTextLine(diff));
      ((diff && diff.structural) || []).forEach(function(r) {
        lines.push('  - ' + r.text);
      });
      lines.push('  → この図の SVG を今の puml から作り直してください');
      return lines.join('\n');
    }
    diff.missing.forEach(function(r) {
      lines.push('  - SVG に無い ' + kindLabel(r.kind) + ': ' + r.label);
    });
    diff.leftover.forEach(function(s) {
      lines.push('  - SVG に残っている古い文字: ' + s);
    });
    (diff.structural || []).forEach(function(r) {
      lines.push('  - ' + r.text);
    });
    lines.push('  → この図の SVG を今の puml から作り直してください');
    return lines.join('\n');
  }

  // 複数図ぶんをまとめた指摘文。手順 6・7 はこれ 1 つをコピーして終わる。
  function reportAll(diffs) {
    var names = Object.keys(diffs || {}).sort();
    if (!names.length) return '';
    var head = 'SVG が今の puml と食い違っている図: ' + names.length + ' 枚';
    return [head].concat(names.map(function(n) { return reportText(n, diffs[n]); })).join('\n\n');
  }

  return {
    pumlLabels: pumlLabels,
    compare: compare,
    summary: summary,
    kindLabel: kindLabel,
    shapeLabel: shapeLabel,
    reportText: reportText,
    reportAll: reportAll,
  };
})();
