'use strict';
window.MA = window.MA || {};

// delivery-package — 顧客に渡す最終成果物 (納品パッケージ) を 1 つの zip に組み立てる。
//
// BLK-primary-20260907-1703-wish: 14 枚を「全図 SVG で保存」で zip にしたあと、
// 表紙 (図一覧・版数・提出前チェック結果) と変更履歴 (前回提出からの差分一覧) を
// 人手で別ファイルとして作り、zip に足していた。材料はどれも GUI の中にあるのに、
// 「提出物として組み立てる」ところだけが画面の外にあった。
//
// ここは表紙・目次・提出前チェック結果・前回提出からの差分要約・全図 SVG を
// 1 枚の index.html に焼き、SVG 一式と一緒に zip にする。あわせて「いつ・どの版で
// 何を出したか」を控えとして持ち、次に作るときの差分の基準にする。
//
// 判定と HTML の組み立てだけを置く。図の SVG 化と zip 化 (bulk-export.buildZip)、
// ダウンロードは呼び出し側の職掌。控えの入れ物として localStorage だけを使う。
window.MA.deliveryPackage = (function() {

  var KEY = 'pua.delivery.baseline';

  function esc(s) {
    if (window.MA.htmlUtils && window.MA.htmlUtils.escHtml) return window.MA.htmlUtils.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _pad(n) { return (n < 10 ? '0' : '') + n; }

  function _norm(dsl) {
    var SD = window.MA.saveDiff;
    if (SD && SD.normalize) return SD.normalize(dsl);
    return String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function _nowIso() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function stamp(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate())
      + ' ' + _pad(d.getHours()) + ':' + _pad(d.getMinutes());
  }

  function dateStamp(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
  }

  // 添付として見分けが付くよう日時を入れる (handoff-package.packageName と同じ形)。
  function packageName(now) {
    var d = now || new Date();
    return 'delivery-' + d.getFullYear() + _pad(d.getMonth() + 1) + _pad(d.getDate())
      + '-' + _pad(d.getHours()) + _pad(d.getMinutes()) + '.zip';
  }

  // ── 提出の控え ────────────────────────────────────────────────────────────
  // 前回「提出した」時点の DSL。± 差分の基準 (save-diff) とは別に持つ。
  // 保存のたびに動く基準では「前回顧客に出した版からの差分」にならないため。

  var _rec = null;

  function _loadRecord() {
    if (_rec) return _rec;
    _rec = { marks: {}, title: '', revision: '', at: '' };
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw != null) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object') {
          _rec.title = typeof v.title === 'string' ? v.title : '';
          _rec.revision = typeof v.revision === 'string' ? v.revision : '';
          _rec.at = typeof v.at === 'string' ? v.at : '';
          if (v.marks && typeof v.marks === 'object') {
            for (var k in v.marks) {
              if (!Object.prototype.hasOwnProperty.call(v.marks, k)) continue;
              var m = v.marks[k];
              if (!m || typeof m.dsl !== 'string') continue;
              _rec.marks[k] = { dsl: m.dsl, at: typeof m.at === 'string' ? m.at : '' };
            }
          }
        }
      }
    } catch (e) { /* 壊れていたら「まだ 1 度も出していない」から始める */ }
    return _rec;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(_loadRecord()));
      return true;
    } catch (e) { return false; }
  }

  // 前回提出した版の情報。まだ 1 度も出していなければ at が ''。
  function lastDelivery() {
    var r = _loadRecord();
    return { title: r.title, revision: r.revision, at: r.at, count: Object.keys(r.marks).length };
  }

  // change-board.build にそのまま渡せる形 (save-diff.baselineOf と同じ)。
  function baselineOf(name) {
    var r = _loadRecord();
    var m = r.marks[name];
    return m ? { dsl: m.dsl, at: m.at } : null;
  }

  // 出した時点を控える。次に作るときはここからの差分になる。
  function markDelivered(docs, meta, at) {
    var r = _loadRecord();
    var o = meta || {};
    var when = at || _nowIso();
    r.marks = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || !d.name) return;
      r.marks[d.name] = { dsl: _norm(d.dsl), at: when };
    });
    r.title = String(o.title == null ? '' : o.title);
    r.revision = String(o.revision == null ? '' : o.revision);
    r.at = when;
    _persist();
    return lastDelivery();
  }

  function reset() {
    _rec = { marks: {}, title: '', revision: '', at: '' };
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  }

  // 版数の既定。前回が 1.0 なら 1.1、まだ無ければ 1.0。
  // 数字で終わらない書き方 (A 版 など) は数えようが無いのでそのまま返す。
  function nextRevision(prev) {
    var s = String(prev == null ? '' : prev).trim();
    if (s === '') return '1.0';
    var m = s.match(/^(.*?)(\d+)$/);
    if (!m) return s;
    return m[1] + String(parseInt(m[2], 10) + 1);
  }

  // ── 節 ────────────────────────────────────────────────────────────────────

  // 提出前チェックの結果。submit-check.check の戻りをそのまま受ける。
  function submitSection(result) {
    if (!result) return { ok: false, ran: false, count: 0, line: '提出前チェックを実行していません', rows: [] };
    var flagged = result.flagged || [];
    return {
      ok: flagged.length === 0,
      ran: true,
      count: flagged.length,
      line: (result.docs || []).length + ' 枚 / 見た行 ' + (result.rows || []).length + ' 件 — '
        + (flagged.length === 0 ? '要確認 0 件' : '要確認 ' + flagged.length + ' 件'),
      rows: flagged,
    };
  }

  // 前回提出からの差分一覧。change-board.build の戻り (includeSame: true) を受ける。
  function changeSection(board, last) {
    var b = board || { entries: [], total: 0, changedCount: 0, added: 0, removed: 0 };
    var l = last || {};
    var entries = (b.entries || []).map(function(e) {
      return {
        name: e.name, diagramType: e.diagramType || '', status: e.status,
        added: e.added, removed: e.removed,
      };
    });
    var isFirst = !l.at;
    var newCount = entries.filter(function(e) { return e.status === 'new'; }).length;
    var changed = entries.filter(function(e) { return e.status === 'changed'; }).length;
    var line;
    if (isFirst) line = '初回提出 (' + entries.length + ' 枚すべて新規)';
    else if (changed === 0 && newCount === 0) line = '前回提出 (' + l.at.replace('T', ' ').slice(0, 16) + ') から変わった図はありません';
    else line = '変更 ' + changed + ' 枚 ・ 新規 ' + newCount + ' 枚 ・ +' + b.added + ' −' + b.removed + ' 行';
    return {
      first: isFirst, entries: entries, changed: changed, added: newCount,
      addedLines: b.added, removedLines: b.removed,
      since: l.at || '', sinceRevision: l.revision || '',
      line: line,
    };
  }

  // ── 対象の図 ──────────────────────────────────────────────────────────────
  // BLK-primary-20260908-1903: 対象の既定が「今開いているタブ」だったので、
  // 14 枚あるフォルダで 5 枚しかタブを開いていないと、残り 9 枚が黙って
  // zip から落ちた。モーダルも「5 / 5 枚」としか出さないので欠落に気づけない。
  // 提出物の的は保存フォルダ全体であって、たまたま開いているタブではない。

  // candidates — 開いているタブ + 保存フォルダを 1 本の候補一覧にする。
  // 同名は開いているタブが勝つ (未保存の編集分が入っているのはこちら)。
  // テンプレ (file-role の template) は納品物ではないので既定から外すが、
  // 一覧には残す (外したことが見えないと「消えた」と同じになる)。
  // detectType はフォルダから読んだ図の種類を推測する関数 (workspace.detectType)。
  function candidates(openDocs, fileDocs, roles, detectType) {
    var rmap = roles && typeof roles === 'object' ? roles : {};
    var det = typeof detectType === 'function' ? detectType : function() { return ''; };
    function role(name) {
      var rec = rmap[name];
      var r = rec && typeof rec === 'object' ? String(rec.role == null ? '' : rec.role) : String(rec == null ? '' : rec);
      return (r === 'data' || r === 'template') ? r : 'unset';
    }
    var out = [];
    var seen = {};
    function push(d, open) {
      if (!d) return;
      var name = String(d.name == null ? '' : d.name);
      if (!name || seen[name]) return;
      seen[name] = true;
      var r = role(name);
      var dsl = String(d.dsl == null ? '' : d.dsl);
      out.push({
        id: open ? d.id : 'file:' + name,
        name: name,
        dsl: dsl,
        diagramType: d.diagramType || det(dsl) || '',
        open: !!open,
        role: r,
        deliverable: r !== 'template',
      });
    }
    (Array.isArray(openDocs) ? openDocs : []).forEach(function(d) { push(d, true); });
    (Array.isArray(fileDocs) ? fileDocs : []).forEach(function(d) { push(d, false); });
    return out;
  }

  // 既定で対象にする図の名前。テンプレ以外の全部 — フォルダ全体が的になる。
  function defaultPicks(cands) {
    return (Array.isArray(cands) ? cands : [])
      .filter(function(c) { return c && c.deliverable; })
      .map(function(c) { return c.name; });
  }

  // coverage — 「全体の何枚を出そうとしているか」と、落ちている図の内訳。
  // warn が true のとき、納品物のはずの図が対象から外れている。
  function coverage(cands, pickedNames) {
    var list = Array.isArray(cands) ? cands : [];
    var pick = {};
    (Array.isArray(pickedNames) ? pickedNames : []).forEach(function(n) { pick[String(n)] = true; });
    var c = { total: list.length, picked: 0, missing: 0, missingUnopened: 0, template: 0, line: '', warn: false };
    var names = [];
    list.forEach(function(d) {
      if (!d) return;
      if (pick[d.name]) { c.picked++; return; }
      if (!d.deliverable) { c.template++; return; }
      c.missing++;
      if (!d.open) c.missingUnopened++;
      if (names.length < 5) names.push(d.name);
    });
    c.warn = c.missing > 0;
    c.line = c.picked + ' / ' + c.total + ' 枚';
    if (c.template > 0) c.line += '（テンプレ ' + c.template + ' 枚は対象外）';
    if (c.missing > 0) {
      c.line += ' — ' + c.missing + ' 枚が対象から外れています'
        + (c.missingUnopened > 0 ? '（うち ' + c.missingUnopened + ' 枚はタブを開いていない図）' : '')
        + ': ' + names.join(', ') + (c.missing > names.length ? ' ほか' : '');
    }
    return c;
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

  // buildPackage — 表紙・目次・チェック結果・差分要約・図一式のモデル。
  // input = { docs, svgs, title, revision, submit, board, last, now }
  function buildPackage(input) {
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
      };
    });
    var submit = submitSection(o.submit);
    var change = changeSection(o.board, o.last);
    var failed = diagrams.filter(function(d) { return !d.rendered; }).length;
    var title = String(o.title == null || o.title === '' ? '設計書 図面集' : o.title);
    var revision = String(o.revision == null || o.revision === '' ? '1.0' : o.revision);
    return {
      title: title,
      revision: revision,
      date: dateStamp(o.now),
      createdAt: stamp(o.now),
      total: diagrams.length,
      renderedCount: diagrams.length - failed,
      diagrams: diagrams,
      submit: submit,
      change: change,
      // 表紙の 1 行。出す側が最後に読んで、出してよいかを決める。
      verdict: (submit.ok ? diagrams.length + ' 枚 ・ 提出前チェック 要確認 0 件'
                          : diagrams.length + ' 枚 ・ 要確認 ' + submit.count + ' 件')
        + ' ・ ' + change.line,
    };
  }

  // ── index.html ───────────────────────────────────────────────────────────
  // 顧客が開くものなので、外部ファイルもスクリプトも要らない 1 枚にする。

  var CSS = [
    'body{font-family:system-ui,"Segoe UI",sans-serif;margin:0;padding:0;background:#f5f5f7;color:#1d1d20;}',
    'main{max-width:1000px;margin:0 auto;padding:24px;}',
    '.cover{background:#fff;border:1px solid #d5d5da;border-radius:6px;padding:32px;margin-bottom:24px;}',
    '.cover h1{font-size:26px;margin:0 0 12px;}',
    '.cover dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:13px;margin:0 0 16px;}',
    '.cover dt{color:#6a6a72;}.cover dd{margin:0;}',
    'h2{font-size:16px;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid #d5d5da;}',
    'h3{font-size:13px;margin:16px 0 6px;font-weight:600;}',
    'h3 small{font-weight:400;color:#6a6a72;margin-left:6px;}',
    '.badge{display:inline-block;font-size:11px;padding:1px 8px;border-radius:10px;margin-left:8px;}',
    '.badge.ok{background:#d6f5e0;color:#116634;}',
    '.badge.warn{background:#fde8d0;color:#8a4b06;}',
    'table{border-collapse:collapse;font-size:12px;background:#fff;margin:6px 0 12px;width:100%;}',
    'th,td{border:1px solid #d5d5da;padding:3px 8px;text-align:left;}',
    'td.num{text-align:right;font-variant-numeric:tabular-nums;}',
    'tr.warn-row{background:#fdf3e6;}',
    'tr.new-row{background:#eaf4fd;}',
    'ol.toc{font-size:13px;padding-left:20px;}ol.toc li{margin:2px 0;}',
    'a{color:#1a4f9c;}',
    '.fig{background:#fff;border:1px solid #d5d5da;border-radius:4px;padding:10px;overflow-x:auto;margin-bottom:12px;}',
    '.fig svg{max-width:100%;height:auto;}',
    '.muted{color:#6a6a72;font-size:12px;}',
    'footer{margin-top:32px;font-size:11px;color:#6a6a72;}',
    '@media print{body{background:#fff;}.cover{page-break-after:always;}.fig{page-break-inside:avoid;}}',
  ].join('\n');

  function _badge(ok) {
    return ok ? '<span class="badge ok">問題なし</span>' : '<span class="badge warn">要確認</span>';
  }

  function _anchor(i) { return 'fig-' + (i + 1); }

  function _coverHtml(p) {
    var rows = '';
    p.diagrams.forEach(function(d, i) {
      rows += '<li><a href="#' + _anchor(i) + '">' + esc(d.name) + '</a>'
        + '<small> ' + esc(String(d.diagramType || '').replace('plantuml-', '')) + '</small></li>';
    });
    return [
      '<section class="cover">',
      '<h1>' + esc(p.title) + '</h1>',
      '<dl>',
      '<dt>版数</dt><dd>' + esc(p.revision) + '</dd>',
      '<dt>作成日</dt><dd>' + esc(p.date) + '</dd>',
      '<dt>図</dt><dd>' + esc(String(p.total)) + ' 枚'
        + (p.renderedCount === p.total ? '' : '（SVG 化できたのは ' + esc(String(p.renderedCount)) + ' 枚）') + '</dd>',
      '<dt>提出前チェック</dt><dd>' + esc(p.submit.line) + _badge(p.submit.ok) + '</dd>',
      '<dt>前回提出からの差分</dt><dd>' + esc(p.change.line) + '</dd>',
      '</dl>',
      '<h3>目次</h3>',
      '<ol class="toc">' + (rows || '<li class="muted">図がありません</li>') + '</ol>',
      '</section>',
    ].join('\n');
  }

  function _submitHtml(sec) {
    if (!sec.ran) return '<p class="muted">提出前チェックを実行していません。</p>';
    if (sec.ok) return '<p class="muted">社内略語・一時識別子は残っていません。</p>';
    var SC = window.MA.submitCheck;
    var out = '<table><thead><tr><th>図</th><th>種別</th><th>内容</th><th>当たった語</th></tr></thead><tbody>';
    sec.rows.forEach(function(r) {
      var kind = (SC && SC.kindLabel) ? SC.kindLabel(r.kind) : r.kind;
      out += '<tr class="warn-row"><td>' + esc(r.doc) + '</td><td>' + esc(kind) + '</td>'
        + '<td>' + esc(r.text) + '</td><td>' + esc((r.hits || []).join(', ')) + '</td></tr>';
    });
    return out + '</tbody></table>';
  }

  function _changeHtml(sec) {
    if (sec.entries.length === 0) return '<p class="muted">対象の図がありません。</p>';
    var out = '<table><thead><tr><th>図</th><th>前回提出から</th><th>+ 行</th><th>− 行</th></tr></thead><tbody>';
    sec.entries.forEach(function(e) {
      var label = e.status === 'new' ? '新規' : (e.status === 'changed' ? '変更' : '変更なし');
      var cls = e.status === 'new' ? ' class="new-row"' : (e.status === 'changed' ? ' class="warn-row"' : '');
      out += '<tr' + cls + '><td>' + esc(e.name) + '</td><td>' + esc(label) + '</td>'
        + '<td class="num">' + (e.status === 'same' ? '' : '+' + e.added) + '</td>'
        + '<td class="num">' + (e.status === 'same' ? '' : '−' + e.removed) + '</td></tr>';
    });
    return out + '</tbody></table>';
  }

  function _diagramsHtml(p) {
    var out = '';
    p.diagrams.forEach(function(d, i) {
      out += '<h3 id="' + _anchor(i) + '">' + esc(String(i + 1)) + '. ' + esc(d.name)
        + ' <small>' + esc(String(d.diagramType || '').replace('plantuml-', '')) + ' · ' + esc(d.filename) + '</small></h3>';
      out += d.rendered ? '<div class="fig">' + d.svg + '</div>'
        : '<p class="muted">この図は書き出せませんでした。</p>';
    });
    return out || '<p class="muted">図がありません。</p>';
  }

  function renderIndexHtml(pkg) {
    var p = pkg || {};
    return [
      '<!DOCTYPE html>',
      '<html lang="ja"><head><meta charset="utf-8">',
      '<title>' + esc(p.title) + ' ' + esc(p.revision) + '</title>',
      '<style>' + CSS + '</style>',
      '</head><body><main>',
      _coverHtml(p),
      '<h2>1. 提出前チェック結果' + _badge(p.submit && p.submit.ok) + '</h2>',
      '<p>' + esc(p.submit ? p.submit.line : '') + '</p>',
      _submitHtml(p.submit || {}),
      '<h2>2. 前回提出からの差分</h2>',
      '<p>' + esc(p.change ? p.change.line : '')
        + (p.change && p.change.since
            ? '（基準: ' + esc(p.change.sinceRevision || '前回') + ' ' + esc(p.change.since.replace('T', ' ').slice(0, 16)) + '）'
            : '') + '</p>',
      _changeHtml(p.change || { entries: [] }),
      '<h2>3. 図面</h2>',
      _diagramsHtml(p),
      '<footer>' + esc(p.title) + ' ' + esc(p.revision) + ' ・ 作成 ' + esc(p.createdAt)
        + ' ・ PlantUMLAssist の「納品パッケージ」が生成。個々の SVG は同じ zip の svg/ にあります。</footer>',
      '</main></body></html>',
    ].join('\n');
  }

  // files(pkg) — bulk-export.buildZip にそのまま渡せる形。
  function files(pkg) {
    var p = pkg || {};
    var out = [{ name: 'index.html', content: renderIndexHtml(p) }];
    (p.diagrams || []).forEach(function(d) {
      if (d.rendered) out.push({ name: d.filename, content: d.svg });
    });
    return out;
  }

  return {
    packageName: packageName,
    stamp: stamp,
    dateStamp: dateStamp,
    nextRevision: nextRevision,
    lastDelivery: lastDelivery,
    baselineOf: baselineOf,
    markDelivered: markDelivered,
    reset: reset,
    candidates: candidates,
    defaultPicks: defaultPicks,
    coverage: coverage,
    svgFileNames: svgFileNames,
    submitSection: submitSection,
    changeSection: changeSection,
    buildPackage: buildPackage,
    renderIndexHtml: renderIndexHtml,
    files: files,
  };
})();
