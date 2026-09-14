'use strict';
window.MA = window.MA || {};

// handoff-package — 引き継ぎに要る確認結果を 1 つのスナップショットに固める。
//
// BLK-primary-20260907-1303-wish: 新人に引き継ぐとき、⇉系統チェック・🔍名前突合・
// ▤変更サマリを別々のタブで開いて中身を見せ、「問題なし」を口頭で伝えていた。
// 引き継ぎのたびに 3 つのタブを開いて見せ回す必要があり、渡された側は後から同じ
// 状態を再現できない (見た人の記憶に依存する)。
//
// ここでは 4 つ (系統チェック結果 / 名前突合結果 / 直近の変更サマリ / SVG 一式) を
// 1 枚の HTML に焼き、SVG 一式と一緒に zip にする。渡された側は index.html を
// 開くだけで、先輩がその時点で見たものをそのまま見られる。
//
// このモジュールは DOM にもブラウザ API にも触らない。監査結果と SVG は
// 呼び出し側が集めて渡す。zip 化は bulk-export.buildZip の職掌。
window.MA.handoffPackage = (function() {

  function esc(s) {
    if (window.MA.htmlUtils && window.MA.htmlUtils.escHtml) return window.MA.htmlUtils.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _pad(n) { return (n < 10 ? '0' : '') + n; }

  // 添付ファイルとして見分けが付くよう日時を入れる (bulk-export.zipName と同じ形)。
  function packageName(now) {
    var d = now || new Date();
    return 'handoff-' + d.getFullYear() + _pad(d.getMonth() + 1) + _pad(d.getDate())
      + '-' + _pad(d.getHours()) + _pad(d.getMinutes()) + '.zip';
  }

  function stamp(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate())
      + ' ' + _pad(d.getHours()) + ':' + _pad(d.getMinutes());
  }

  // zip の中の SVG 名。bulk-export.plan と同じ一意化 (-2, -3 …) をする。
  function svgFileNames(docs) {
    var list = Array.isArray(docs) ? docs : [];
    var used = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i] || {};
      var base = String(d.name == null || d.name === '' ? 'diagram' : d.name);
      var name = base;
      var n = 2;
      while (used[name]) { name = base + '-' + n; n++; }
      used[name] = true;
      out.push({ id: d.id, name: base, filename: 'svg/' + name + '.svg' });
    }
    return out;
  }

  // ── 4 つの節の判定 ────────────────────────────────────────────────────────
  // どの節も「見出しの 1 行」と「ok かどうか」を持つ。ok は口頭で伝えていた
  // 「問題なし」に当たるもので、渡された側はこの 1 行だけ見れば済む。

  function familySection(families) {
    var list = Array.isArray(families) ? families : [];
    var comparable = list.filter(function(f) { return f && f.comparable; });
    var bad = 0;
    comparable.forEach(function(f) { bad += (f.mismatches || []).length; });
    var line;
    if (list.length === 0) line = '突き合わせる系統がありません (同じ頭の名前の図が 2 枚以上必要)';
    else if (comparable.length === 0) line = '突き合わせが成立した系統がありません';
    else if (bad === 0) line = comparable.length + ' 系統すべてで動作名が揃っています (食い違い 0 件)';
    else line = '片方にしか無い動作名 ' + bad + ' 件 (' + comparable.length + ' 系統中)';
    return { ok: comparable.length > 0 && bad === 0, count: bad, line: line, families: list };
  }

  function nameSection(names) {
    var a = names || {};
    var variants = a.variants || [];
    var undeclared = a.undeclared || [];
    var line;
    if (variants.length === 0 && undeclared.length === 0) line = '表記揺れ 0 件 ・ 宣言もれ 0 件';
    else line = '表記揺れ ' + variants.length + ' 件 ・ 宣言もれ ' + undeclared.length + ' 件';
    return {
      ok: variants.length === 0 && undeclared.length === 0,
      line: line, variants: variants, undeclared: undeclared,
    };
  }

  function changeSection(board) {
    var b = board || {};
    var CB = window.MA.changeBoard;
    var line = (CB && CB.summaryText) ? CB.summaryText(b)
      : (b.hasChange ? '変わった図 ' + b.changedCount + '/' + b.total + ' 枚' : '変わった図はありません');
    return { ok: true, line: line, board: b };
  }

  // buildSnapshot — 4 節ぶんをまとめた、HTML にも判定にも使えるモデル。
  // input = { docs, families, names, board, svgs, now }
  //   docs   = [{ id, name, diagramType, dsl }] (workspace.list() の形)
  //   svgs   = { <doc id>: '<svg …>' }。無い図は「書き出せませんでした」と出す
  //   notes  = handoverNotes.list() の形。渡す時点で申し送りをチェックリストに固定する
  //            (BLK-primary-20260908-1803-wish。差分が消えた後も項目は残る)
  function buildSnapshot(input) {
    var o = input || {};
    var docs = Array.isArray(o.docs) ? o.docs : [];
    var svgs = o.svgs || {};
    var placed = svgFileNames(docs);
    var diagrams = docs.map(function(d, i) {
      var svg = svgs[d && d.id];
      return {
        id: d.id, name: d.name, diagramType: (d && d.diagramType) || '',
        filename: placed[i].filename,
        svg: (typeof svg === 'string' && svg) ? svg : '',
        rendered: !!(typeof svg === 'string' && svg),
        dsl: (d && d.dsl) || '',
      };
    });
    var family = familySection(o.families);
    var name = nameSection(o.names);
    var change = changeSection(o.board);
    var HC = window.MA.handoverChecklist;
    var checklist = HC ? HC.build(o.notes, o.checklistAt) : { createdAt: '', items: [] };
    var failed = diagrams.filter(function(d) { return !d.rendered; }).length;
    // BLK-primary-20260914-1906-wish: 材料の前に「今日どの図の何を・なぜ直したか」を置く。
    var HS = window.MA.handoffSummary;
    var summary = HS ? HS.build({ diagrams: diagrams, board: o.board, verdicts: o.verdicts }) : null;
    return {
      createdAt: stamp(o.now),
      total: diagrams.length,
      renderedCount: diagrams.length - failed,
      diagrams: diagrams,
      summary: summary,
      family: family,
      names: name,
      change: change,
      checklist: checklist,
      // 引き継ぎ 1 行。渡す側も渡された側もまずここを読む。
      verdict: (family.ok && name.ok)
        ? diagrams.length + ' 枚 ・ 系統チェックと名前突合はどちらも問題なし'
        : diagrams.length + ' 枚 ・ 要確認: ' + family.line + ' / ' + name.line,
    };
  }

  // ── index.html ───────────────────────────────────────────────────────────
  // 受け取った側はブラウザで開くだけ。外部ファイルもスクリプトも要らないよう、
  // CSS は中に書き、SVG も中に埋める (svg/ にも同じものを別ファイルで置く)。

  function _badge(ok) {
    return ok
      ? '<span class="badge ok">問題なし</span>'
      : '<span class="badge warn">要確認</span>';
  }

  function _familyHtml(sec) {
    var out = '';
    (sec.families || []).forEach(function(f) {
      var FA = window.MA.familyAudit;
      var head = (FA && FA.summaryLine) ? FA.summaryLine(f) : '';
      out += '<h3>' + esc(f.key) + ' 系統 <small>' + esc(head) + '</small></h3>';
      var names = (f.docs || []).map(function(d) { return d.name; });
      out += '<table><thead><tr><th>動作名</th>';
      names.forEach(function(n) { out += '<th>' + esc(n) + '</th>'; });
      out += '</tr></thead><tbody>';
      (f.rows || []).forEach(function(r) {
        out += '<tr' + (r.onlyIn ? ' class="warn-row"' : '') + '><td>' + esc(r.label) + '</td>';
        (r.present || []).forEach(function(p) { out += '<td class="mark">' + (p ? '●' : '−') + '</td>'; });
        out += '</tr>';
      });
      out += '</tbody></table>';
    });
    return out || '<p class="muted">表に出す系統がありません。</p>';
  }

  function _namesHtml(sec) {
    var out = '';
    if ((sec.variants || []).length > 0) {
      out += '<h3>表記揺れ</h3><ul>';
      sec.variants.forEach(function(v) {
        var forms = (v.members || []).map(function(m) { return m && m.name; })
          .filter(function(n) { return !!n; });
        out += '<li>' + esc(forms.join(' / '))
          + ' <small>これに統一: ' + esc(v.suggested || '') + '</small></li>';
      });
      out += '</ul>';
    }
    if ((sec.undeclared || []).length > 0) {
      out += '<h3>宣言もれ (矢印にだけ出てくる名前)</h3><ul>';
      sec.undeclared.forEach(function(u) {
        out += '<li>' + esc(u.name) + ' <small>' + esc((u.docs || []).join(', ')) + '</small></li>';
      });
      out += '</ul>';
    }
    return out || '<p class="muted">揺れも宣言もれもありません。</p>';
  }

  function _changeHtml(sec) {
    var entries = (sec.board && sec.board.entries) || [];
    if (entries.length === 0) return '<p class="muted">前回保存した時点から変わった図はありません。</p>';
    var out = '';
    entries.forEach(function(e) {
      var CB = window.MA.changeBoard;
      var label = (CB && CB.entryLabel) ? CB.entryLabel(e) : e.name;
      out += '<h3>' + esc(label) + '</h3><pre class="diff">';
      (e.rows || []).forEach(function(r) {
        if (r.kind === 'gap') { out += '<span class="gap">  … ' + r.count + ' 行省略 …</span>\n'; return; }
        // add は after 行、del は before 行、same はどちらも同じ内容。
        var sign = r.kind === 'add' ? '+' : (r.kind === 'del' ? '-' : ' ');
        var text = r.kind === 'del' ? r.before : r.after;
        out += '<span class="' + esc(r.kind) + '">' + sign + ' ' + esc(text == null ? '' : text) + '</span>\n';
      });
      out += '</pre>';
    });
    return out;
  }

  function _diagramsHtml(snapshot) {
    var out = '';
    snapshot.diagrams.forEach(function(d) {
      out += '<h3>' + esc(d.name) + ' <small>' + esc(d.diagramType) + ' · ' + esc(d.filename) + '</small></h3>';
      out += d.rendered
        ? '<div class="fig">' + d.svg + '</div>'
        : '<p class="muted">この図は書き出せませんでした。</p>';
    });
    return out || '<p class="muted">図がありません。</p>';
  }

  // BLK-primary-20260914-1906-wish: 材料の前に置く「今日どの図の何を・なぜ直したか」。
  // 1 枚につき 変更点 → なぜ (反映した指摘) → 図 の順で、同じ塊に並べる。
  // 新人はここを上から読むだけで済み、渡す側の口頭説明が要らなくなる。
  function _summaryHtml(sum) {
    var s = sum || {};
    var changed = s.changed || [];
    var out = '';
    if (changed.length === 0) {
      out += '<p class="muted">今回変更した図はありません。下の「図一式」をそのまま見てください。</p>';
    }
    changed.forEach(function(d) {
      out += '<div class="sum">';
      out += '<h3>' + esc(d.name) + ' <small>' + esc(d.diagramType) + ' · ' + esc(d.changeLine) + '</small></h3>';
      if (d.reasons.length > 0) {
        out += '<p class="why-head">なぜ直したか (反映した指摘 ' + d.reasons.length + ' 件)</p><ul class="why">';
        d.reasons.forEach(function(r) { out += '<li>' + esc(r) + '</li>'; });
        out += '</ul>';
      } else {
        out += '<p class="muted">この図に紐づく指摘はありません (指摘によらない変更)。</p>';
      }
      if (d.openPins.length > 0) {
        out += '<p class="why-head">まだ直していない指摘 ' + d.openPins.length + ' 件 (引き継ぐ宿題)</p><ul class="todo">';
        d.openPins.forEach(function(t) { out += '<li>' + esc(t) + '</li>'; });
        out += '</ul>';
      }
      if (d.fixCount) {
        out += '<p class="muted">変更サマリで「要修正」の印が ' + d.fixCount + ' 行に残っています。</p>';
      }
      out += '<pre class="diff">';
      (d.diffRows || []).forEach(function(r) {
        if (r.kind === 'gap') { out += '<span class="gap">  … ' + r.count + ' 行省略 …</span>\n'; return; }
        var sign = r.kind === 'add' ? '+' : (r.kind === 'del' ? '-' : ' ');
        var text = r.kind === 'del' ? r.before : r.after;
        out += '<span class="' + esc(r.kind) + '">' + sign + ' ' + esc(text == null ? '' : text) + '</span>\n';
      });
      out += '</pre>';
      out += d.rendered
        ? '<div class="fig">' + d.svg + '</div>'
        : '<p class="muted">この図は書き出せませんでした。</p>';
      out += '</div>';
    });
    // 未対応の指摘は、変えていない図に残っていることもある。宿題を落とさない。
    var restTodo = (s.rest || []).filter(function(d) { return d.openPins.length > 0; });
    if (restTodo.length > 0) {
      out += '<h3>今回は変えていないが、指摘が残っている図</h3><ul class="todo">';
      restTodo.forEach(function(d) {
        d.openPins.forEach(function(t) { out += '<li>' + esc(d.name) + ': ' + esc(t) + '</li>'; });
      });
      out += '</ul>';
    }
    return out;
  }

  function _summaryLine(snapshot) {
    var HS = window.MA.handoffSummary;
    var s = snapshot && snapshot.summary;
    if (!HS || !s) return '';
    return HS.summaryLine(s);
  }

  function _checklistHtml(snapshot) {
    var HC = window.MA.handoverChecklist;
    if (!HC) return '<p class="muted">申し送りはありません。</p>';
    return HC.renderHtml(snapshot && snapshot.checklist);
  }

  var CSS = [
    'body{font-family:system-ui,"Segoe UI",sans-serif;margin:0;padding:24px;background:#f5f5f7;color:#1d1d20;}',
    'main{max-width:1000px;margin:0 auto;}',
    'h1{font-size:20px;margin:0 0 4px;}',
    'h2{font-size:16px;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid #d5d5da;}',
    'h3{font-size:13px;margin:16px 0 6px;font-weight:600;}',
    'h3 small,header small{font-weight:400;color:#6a6a72;margin-left:6px;}',
    '.verdict{background:#fff;border:1px solid #d5d5da;border-radius:6px;padding:12px 14px;margin:12px 0 4px;}',
    '.badge{display:inline-block;font-size:11px;padding:1px 8px;border-radius:10px;margin-left:8px;}',
    '.badge.ok{background:#d6f5e0;color:#116634;}',
    '.badge.warn{background:#fde8d0;color:#8a4b06;}',
    'table{border-collapse:collapse;font-size:12px;background:#fff;margin:6px 0 12px;}',
    'th,td{border:1px solid #d5d5da;padding:3px 8px;text-align:left;}',
    'td.mark{text-align:center;}',
    'tr.warn-row{background:#fdf3e6;}',
    'pre.diff{background:#fff;border:1px solid #d5d5da;border-radius:4px;padding:8px 10px;',
    'font-family:Consolas,monospace;font-size:11px;overflow-x:auto;margin:4px 0 12px;}',
    'pre.diff .add{color:#116634;}pre.diff .del{color:#98181b;}pre.diff .gap{color:#9a9aa2;}',
    '.fig{background:#fff;border:1px solid #d5d5da;border-radius:4px;padding:10px;overflow-x:auto;margin-bottom:12px;}',
    '.fig svg{max-width:100%;height:auto;}',
    '.muted{color:#6a6a72;font-size:12px;}',
    '.sum{background:#fff;border:1px solid #d5d5da;border-radius:6px;padding:10px 14px;margin:10px 0 16px;}',
    '.sum h3{margin-top:4px;}',
    '.why-head{font-size:12px;font-weight:600;margin:10px 0 2px;}',
    'ul.why,ul.todo{margin:2px 0 10px;padding-left:20px;font-size:12px;}',
    'ul.why li{margin:2px 0;}',
    'ul.todo li{margin:2px 0;color:#8a4b06;}',
    'footer{margin-top:32px;font-size:11px;color:#6a6a72;}',
  ].join('\n');

  function _checklistCss() {
    var HC = window.MA.handoverChecklist;
    return HC ? HC.styleCss() : '';
  }

  function _checklistScript() {
    var HC = window.MA.handoverChecklist;
    return HC ? HC.scriptHtml() : '';
  }

  // 節の 1 行。渡された側が「何件返すのか」をここだけで分かるようにする。
  function _checklistLine(snapshot) {
    var items = (snapshot && snapshot.checklist && snapshot.checklist.items) || [];
    if (items.length === 0) return '申し送りはありません。';
    return '申し送り ' + items.length + ' 件。読んだ / 対応した / 分からなかった を選んで返信してください。';
  }

  function renderIndexHtml(snapshot) {
    var s = snapshot || {};
    return [
      '<!DOCTYPE html>',
      '<html lang="ja"><head><meta charset="utf-8">',
      '<title>引き継ぎパッケージ ' + esc(s.createdAt) + '</title>',
      '<style>' + CSS + '\n' + _checklistCss() + '</style>',
      '</head><body><main>',
      '<header><h1>引き継ぎパッケージ</h1>',
      '<small>作成 ' + esc(s.createdAt) + ' ・ 図 ' + esc(String(s.total)) + ' 枚'
        + (s.renderedCount === s.total ? '' : '（SVG 化できたのは ' + esc(String(s.renderedCount)) + ' 枚）')
        + '</small></header>',
      '<p class="verdict"><strong>' + esc(s.verdict) + '</strong></p>',

      '<h2>1. 今回の変更と、その理由</h2>',
      '<p>' + esc(_summaryLine(s)) + '</p>',
      _summaryHtml(s.summary),

      '<h2>2. 系統チェック結果' + _badge(s.family && s.family.ok) + '</h2>',
      '<p>' + esc(s.family ? s.family.line : '') + '</p>',
      _familyHtml(s.family || {}),

      '<h2>3. 名前突合結果' + _badge(s.names && s.names.ok) + '</h2>',
      '<p>' + esc(s.names ? s.names.line : '') + '</p>',
      _namesHtml(s.names || {}),

      '<h2>4. 直近の変更サマリ</h2>',
      '<p>' + esc(s.change ? s.change.line : '') + '</p>',
      _changeHtml(s.change || {}),

      '<h2>5. 申し送りチェックリスト</h2>',
      '<p>' + esc(_checklistLine(s)) + '</p>',
      _checklistHtml(s),

      '<h2>6. 図一式</h2>',
      _diagramsHtml(s),

      '<footer>PlantUMLAssist の「引き継ぎパッケージ」が作成。この HTML 1 枚で、作成時点の'
        + '確認結果と図をそのまま見られます。個々の SVG は同じ zip の svg/ にあります。</footer>',
      _checklistScript(),
      '</main></body></html>',
    ].join('\n');
  }

  // files(snapshot) — bulk-export.buildZip にそのまま渡せる形。
  // index.html は単体で開けるよう SVG を埋め込んであり、svg/ には同じものを
  // 別ファイルでも置く (図だけ資料に貼りたいときのため)。
  function files(snapshot) {
    var s = snapshot || {};
    var out = [{ name: 'index.html', content: renderIndexHtml(s) }];
    var HC = window.MA.handoverChecklist;
    if (HC && s.checklist && (s.checklist.items || []).length > 0) {
      // 返信 JSON と突き合わせるための控え。渡した側も同じものを手元に持つ。
      out.push({ name: 'handover-checklist.json', content: HC.serialize(s.checklist) });
    }
    (s.diagrams || []).forEach(function(d) {
      if (d.rendered) out.push({ name: d.filename, content: d.svg });
    });
    return out;
  }

  return {
    packageName: packageName,
    stamp: stamp,
    svgFileNames: svgFileNames,
    familySection: familySection,
    nameSection: nameSection,
    changeSection: changeSection,
    buildSnapshot: buildSnapshot,
    renderIndexHtml: renderIndexHtml,
    checklistLine: _checklistLine,
    summaryLine: _summaryLine,
    files: files,
  };
})();
