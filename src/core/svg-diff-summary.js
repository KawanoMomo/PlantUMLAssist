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
  function compare(pumlText, svgLabels) {
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
    return {
      missing: missing,
      leftover: leftover,
      total: missing.length + leftover.length,
      empty: missing.length === 0 && leftover.length === 0,
    };
  }

  // 1 行の要約。何枚ぶんも並ぶので、件数と種類だけを言う。
  function summary(diff) {
    if (!diff || diff.empty) {
      return '文字の上での食い違いは見つかりませんでした（描画の見た目だけの差です）';
    }
    var parts = [];
    if (diff.missing.length) parts.push('欠落 ' + diff.missing.length + ' 件');
    if (diff.leftover.length) parts.push('SVG に残る古い名前 ' + diff.leftover.length + ' 件');
    return parts.join(' / ');
  }

  // primary へそのまま渡せる指摘文。図ごとに 1 ブロック。
  function reportText(name, diff) {
    var lines = ['[' + String(name) + '] SVG が今の puml と食い違っています'];
    if (!diff || diff.empty) {
      lines.push('  - 文字の上での違いは見つかりませんでした（レイアウトだけの差です）');
      return lines.join('\n');
    }
    diff.missing.forEach(function(r) {
      lines.push('  - SVG に無い ' + kindLabel(r.kind) + ': ' + r.label);
    });
    diff.leftover.forEach(function(s) {
      lines.push('  - SVG に残っている古い文字: ' + s);
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
    reportText: reportText,
    reportAll: reportAll,
  };
})();
