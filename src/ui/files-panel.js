'use strict';
window.MA = window.MA || {};

// files-panel — レール右の FILES ツリーを結線する (design 10a)。
//
// BLK-human-20260923-1700: 「保存先チップ」「📂 一覧」「📄 開く」「⇔ 先輩」の 4 つが
// 別々の入口になっていて、どこに何があるかを入口ごとに覚え直していた。
// ここはその 4 つを 1 本のツリーに畳んだ後の、節の開閉・絞り込み・件数・
// 「開いている図」の行を受け持つ。
//
// 引っ越してきた入口 (#btn-tab-folder / #top-save-target / #btn-tab-peek /
// #btn-tab-senior) の中身そのものは app.js に残っていて、ここでは触らない。
// 置き場所だけがツリーの中に変わる (呼び出し側と台本が同じ id で同じ操作を指せる)。
window.MA.filesPanel = (function() {
  var KEY_OPEN = 'pua.files.open';        // パネルそのものの開閉
  var KEY_SEC = 'pua.files.sec.';         // 節ごとの開閉
  var KEY_RO = 'pua.files.readonly';      // 「読むだけを表示 / 隠す」

  function _ls() { try { return window.localStorage; } catch (e) { return null; } }
  function _get(k, d) {
    var s = _ls();
    if (!s) return d;
    try { var v = s.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function _set(k, v) {
    var s = _ls();
    if (!s) return;
    try { s.setItem(k, String(v)); } catch (e) { /* 使えなくても画面は動く */ }
  }
  function $(id) { return document.getElementById(id); }

  var panel = null;

  // ── パネルの開閉 ──────────────────────────────────────────────────────
  function isOpen() { return !!panel && !panel.classList.contains('collapsed'); }

  function setOpen(on) {
    if (!panel) return;
    panel.classList.toggle('collapsed', !on);
    var railBtn = $('rail-files');
    if (railBtn) railBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    _set(KEY_OPEN, on ? '1' : '0');
  }

  function toggle() { setOpen(!isOpen()); }

  // ── 節の開閉 ─────────────────────────────────────────────────────────
  // 「保存先」だけは節の中身 (#folder-panel) が自前の open クラスを持つので、
  // 見出しの ▸▾ はそちらに合わせる (開閉の主は今までどおり #btn-tab-folder)。
  // 既定で開くのは app.js (起動の最後に、復元した保存先を読んでから描く)。
  function secBody(id) { return $('files-body-' + id); }

  function setSec(id, on) {
    var head = $('files-sec-' + id);
    var body = secBody(id);
    if (!head || !body) return;
    body.hidden = !on;
    head.setAttribute('aria-expanded', on ? 'true' : 'false');
    var caret = head.querySelector('.files-caret');
    if (caret) caret.textContent = on ? '▾' : '▸';
    _set(KEY_SEC + id, on ? '1' : '0');
  }

  function secOpen(id) {
    var head = $('files-sec-' + id);
    return !!head && head.getAttribute('aria-expanded') === 'true';
  }

  function syncTargetCaret() {
    var head = $('btn-tab-folder');
    var fp = $('folder-panel');
    if (!head || !fp) return;
    var on = /\bopen\b/.test(fp.className || '');
    head.setAttribute('aria-expanded', on ? 'true' : 'false');
    var caret = head.querySelector('.files-caret');
    if (caret) caret.textContent = on ? '▾' : '▸';
  }

  // ── 開いている図 ─────────────────────────────────────────────────────
  function _docs() {
    var ws = window.MA.workspace;
    return ws && ws.list ? ws.list() : [];
  }

  function _query() {
    var f = $('files-filter');
    return f ? f.value : '';
  }

  // 未保存 ● / 指摘が未反映 / 一時控え。印の内容は 📂 一覧のバッジと同じものを読む。
  function _marks(doc) {
    var out = [];
    if (doc.dirty) out.push('●');
    if (doc.reviewPending) out.push('未反映');
    if (doc.draft) out.push('控え');
    return out.join(' ');
  }

  // design 10a: ファイル行の頭の図種の線画。読めない図種でも同じ幅の空きを置いて名前の頭を揃える。
  function _glyphEl(kind) {
    var FT = window.MA.fileTree;
    var g = document.createElement('span');
    g.className = 'files-row-glyph';
    g.setAttribute('aria-hidden', 'true');
    var t = FT && FT.glyphType ? FT.glyphType(kind) : '';
    if (t) {
      g.setAttribute('data-kind', t);
      g.innerHTML = FT.glyphSvg(kind);
    }
    return g;
  }

  function _pinDoc(id) {
    var ws = window.MA.workspace;
    if (ws && ws.pin) ws.pin(id);
    // タブ列を描き直すと、この一覧もそこから描き直される (renderTabs → refresh)。
    if (typeof window.renderTabs === 'function') window.renderTabs();
    else renderOpen();
  }

  function renderOpen() {
    var body = secBody('open');
    if (!body) return;
    var FT = window.MA.fileTree;
    var docs = _docs();
    var shown = FT ? FT.filter(docs, _query()) : docs;
    var ws = window.MA.workspace;
    var activeId = ws && ws.getActiveId ? ws.getActiveId() : null;
    body.textContent = '';
    if (!shown.length) {
      var empty = document.createElement('div');
      empty.className = 'files-empty';
      empty.textContent = docs.length ? '絞り込みに当たる図がありません' : '開いている図はありません';
      body.appendChild(empty);
    }
    shown.forEach(function(doc) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'files-row' + (doc.id === activeId ? ' is-active' : '');
      b.setAttribute('data-doc-id', String(doc.id));
      b.setAttribute('data-file-name', String(doc.name || ''));
      // design 10a (BLK-builder-20260924-1701-1): 仮のタブの図は、行の名前もタブと同じく斜体で出す。
      if (doc.preview) b.setAttribute('data-preview', '1');
      b.appendChild(_glyphEl(doc.diagramType));
      var name = document.createElement('span');
      name.className = 'files-row-name';
      // design 10a (BLK-builder-20260924-1636-1): 開いている図はタブ・上部バーと同じファイル名 ({name}.puml) で出す。
      var TS = window.MA.topStatus;
      name.textContent = doc.name && TS && TS.fileName ? TS.fileName(String(doc.name)) : String(doc.name || '(無題)');
      b.appendChild(name);
      var mark = _marks(doc);
      if (mark) {
        var m = document.createElement('span');
        m.className = 'files-row-mark';
        m.textContent = mark;
        b.appendChild(m);
      }
      b.addEventListener('click', function() { _openDoc(doc.id); });
      // design 10a: ダブルクリックでタブとして固定する (保存先の行のダブルクリックと同じ workspace.pin)。
      // 以前は FILES だけの覚え書きに 📌 を付けるだけで、タブは仮 (斜体) のまま残っていた。
      b.addEventListener('dblclick', function() { _pinDoc(doc.id); });
      body.appendChild(b);
    });
    var c = $('files-count-open');
    if (c) c.textContent = docs.length ? String(docs.length) : '';
    // design 10a (BLK-builder-20260924-1350-3): 見出しは「開いている図」+ 右端の件数の 1 回だけ。
    // 名前に括弧で同じ数を足さない (「開いている図（1）  1」と 2 回出ていた)。
  }

  // タブ列の実体を押す (図の切り替えは今までどおりタブ側の 1 本道を通る)。
  function _openDoc(id) {
    var tab = document.querySelector('#tab-bar .tab[data-doc-id="' + id + '"]');
    if (tab) { tab.click(); return; }
    var ws = window.MA.workspace;
    if (ws && ws.setActive) ws.setActive(id);
  }

  // ── 保存先の下の「部品ごとのフォルダ」(design 10a) ───────────────────
  // 一覧の実体は #folder-panel が持っているので、束ねるのもそこから読む
  // (同じ図を 2 か所から数えると、片方だけが古くなる)。
  // 6 図種の済/未の表そのものは 🧩 部品ビューの職掌なので
  // (BLK-owner-20260918-0049-prune)、ここは `SPI 4 / 6` と未作成の件数まで。
  var KEY_PART = 'pua.files.part.';

  function _folderNames() {
    var out = [];
    var items = document.querySelectorAll('#folder-panel .folder-item[data-file-name]');
    Array.prototype.forEach.call(items, function(el) {
      var n = el.getAttribute('data-file-name');
      // 本文から読んだ図種 (保存先の一覧が判定済みなら)。名前に図種が無い図を部品の側で数えるのに使う。
      if (n) out.push({ name: n, kind: el.getAttribute('data-content-kind') || '' });
    });
    return out;
  }

  function _itemSel(name) {
    var n = String(name);
    var q = (window.CSS && window.CSS.escape) ? window.CSS.escape(n) : n.replace(/(["\\])/g, '\\$1');
    return '#folder-panel .folder-item[data-file-name="' + q + '"]';
  }

  // BLK-owner-20260924-0637-1: ツリーのファイル行の札。保存先の一覧の行のバッジと同じ事実を読む
  // (数える所を 2 つにしない)。開いている図の未保存 ● は作業中のタブから読む。
  function _fileState(name) {
    var st = { dirty: false, unapplied: false, draft: false, svgStale: false };
    _docs().forEach(function(d) {
      if (String(d.name || '') !== name) return;
      if (d.dirty) st.dirty = true;
      if (d.reviewPending) st.unapplied = true;
      if (d.draft) st.draft = true;
    });
    var it = document.querySelector(_itemSel(name));
    if (it) {
      var row = (it.closest && it.closest('.folder-row')) || it;
      var rb = it.querySelector('.folder-review-badge');
      if (rb && rb.getAttribute('data-review-state') !== 'applied') st.unapplied = true;
      if (row.classList && row.classList.contains('folder-row-draft')) st.draft = true;
      if (it.querySelector('[data-svg-status="stale"], .folder-svg-content-badge[data-svg-content="differ"]')) st.svgStale = true;
      // BLK-junior-20260924-1632-wish: 指摘.md の反映状況の札。確かめられない指摘がある図だけ
      // (対象外・反映済みの図には札を出さない)。語・見出しは保存先の一覧の行のものをそのまま読む。
      var nb = row.querySelector ? row.querySelector('.folder-note-badge[data-note-status="todo"]') : null;
      if (nb) {
        st.note = {
          mark: nb.textContent || '',
          head: nb.getAttribute('data-note-head') || '',
          term: nb.getAttribute('data-note-term') || '',
          open: Number(nb.getAttribute('data-note-open')) || 1,
        };
      }
    }
    return st;
  }

  // 札の title: 指摘の 1 行目 (見出し) を出す。何件あるかと、押すと何が起きるかを添える。
  function _noteTitle(note) {
    var t = '指摘: ' + (note.head || '(見出しなし)');
    if (note.open > 1) t += ' ほか ' + (note.open - 1) + ' 件';
    t += note.term ? '（押すと図を開いて「' + note.term + '」を選びます）' : '（押すと図を開きます）';
    return t;
  }

  function _noteEl(name, note) {
    var n = document.createElement('span');
    n.className = 'files-row-note';
    n.setAttribute('role', 'button');
    n.setAttribute('data-note-of', name);
    n.setAttribute('data-note-status', 'todo');
    if (note.term) n.setAttribute('data-note-term', note.term);
    n.textContent = note.mark;
    n.title = _noteTitle(note);
    n.addEventListener('click', function(ev) {
      ev.stopPropagation();
      if (typeof window.MA.openNoteFinding === 'function') window.MA.openNoteFinding(name, note.term);
      else _clickFolderItem(name);
    });
    return n;
  }

  // 部品のフォルダの見出しに出す札の数。図 1 枚は 1 回だけ数える
  // (指摘の札が付いた図は ⚠ の側で数え、同じ図を 未反映 でもう 1 回数えない)。
  function _partNotes(files) {
    var note = 0, unapplied = 0, mark = '';
    files.forEach(function(f) {
      var st = _fileState(f.name);
      if (st.note) { note++; if (!mark) mark = st.note.mark; }
      else if (st.unapplied) unapplied++;
    });
    var parts = [];
    if (note) parts.push(mark + ' ' + note);
    if (unapplied) parts.push('未反映 ' + unapplied);
    return parts.join(' · ');
  }

  function _fileButton(f, loose) {
    var FT = window.MA.fileTree;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'files-part-file' + (loose ? ' files-loose-file' : '');
    b.setAttribute('data-file-name', f.name);
    b.appendChild(_glyphEl(FT && FT.fileKind ? FT.fileKind(f.name, f.kind) : f.kind));
    var nm = document.createElement('span');
    nm.className = 'files-row-name';
    nm.textContent = f.name;
    b.appendChild(nm);
    var st = _fileState(f.name);
    var mk = FT && FT.fileMarks ? FT.fileMarks(st) : '';
    if (mk) {
      var m = document.createElement('span');
      m.className = 'files-row-mark';
      m.textContent = mk;
      b.appendChild(m);
      b.setAttribute('data-marks', mk);
    }
    if (st.note) b.appendChild(_noteEl(f.name, st.note));
    b.addEventListener('click', function() { _clickFolderItem(f.name); });
    return b;
  }

  function _clickFolderItem(name) {
    var it = document.querySelector(_itemSel(name));
    if (it) it.click();
  }

  function renderParts() {
    var host = $('files-parts');
    if (!host) return;
    var FT = window.MA.fileTree;
    var entries = _folderNames();
    if (!FT || !entries.length) {
      host.textContent = '';
      refreshSummary();
      if (typeof window.MA.refreshTopCrumbs === 'function') window.MA.refreshTopCrumbs();
      return;
    }
    var shown = FT.filter(entries, _query());
    var lay = FT.layout ? FT.layout(shown) : { groups: FT.groups(shown), loose: [] };
    var groups = lay.groups;
    host.textContent = '';
    groups.forEach(function(g) {
      var open = _get(KEY_PART + g.part, '0') === '1';
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'files-part-head';
      head.setAttribute('data-part', g.part);
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      var caret = document.createElement('span');
      caret.className = 'files-caret';
      caret.setAttribute('aria-hidden', 'true');
      caret.textContent = open ? '▾' : '▸';
      head.appendChild(caret);
      var lab = document.createElement('span');
      lab.className = 'files-part-label';
      lab.textContent = g.countLabel;
      head.appendChild(lab);
      // BLK-junior-20260924-1632-wish: 部品のフォルダにも、札の付いた図の数を同じ語で出す
      // (畳んだままでも、どの部品に開く図があるかが読める)。
      var pn = _partNotes(g.files);
      if (pn) {
        var pm = document.createElement('span');
        pm.className = 'files-part-note';
        pm.textContent = pn;
        head.appendChild(pm);
        head.setAttribute('data-part-notes', pn);
      }
      host.appendChild(head);

      var body = document.createElement('div');
      body.className = 'files-part-body';
      body.setAttribute('data-part-body', g.part);
      body.hidden = !open;
      g.files.forEach(function(f) { body.appendChild(_fileButton(f, false)); });
      if (g.missingLabel) {
        var m = document.createElement('button');
        m.type = 'button';
        m.className = 'files-part-missing';
        m.setAttribute('data-part', g.part);
        m.textContent = g.missingLabel;
        m.title = '🧩 部品ビューで、まだ無い図種をその場で起こせます';
        m.addEventListener('click', function(ev) {
          ev.stopPropagation();
          var link = $('folder-board-link');
          if (link) link.click();
        });
        body.appendChild(m);
      }
      host.appendChild(body);

      head.addEventListener('click', function() {
        var on = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', on ? 'true' : 'false');
        caret.textContent = on ? '▾' : '▸';
        body.hidden = !on;
        _set(KEY_PART + g.part, on ? '1' : '0');
      });
    });
    // 図種を読めない図は部品のフォルダに分けず、保存先の直下にファイル行で並べる。
    lay.loose.forEach(function(f) { host.appendChild(_fileButton(f, true)); });
    var c = $('files-count-target');
    if (c) c.textContent = entries.length ? String(entries.length) : '';
    refreshSummary();
    _gitMarks();
    // 上部バーのパンくずの部品の段は、このツリーの束ね方を読む (BLK-builder-20260924-1715-1)。
    if (typeof window.MA.refreshTopCrumbs === 'function') window.MA.refreshTopCrumbs();
  }

  // ── パンくずから見せる (design 10a、BLK-builder-20260924-1715-1) ──────────
  // kind: 'target' = 保存先のフォルダの行 / 'part' = 部品のフォルダの見出し。
  // パネルと保存先の節が畳まれていれば開き、部品のフォルダは中身まで開いて、行へ移して縁取る。
  function reveal(kind, part, _retried) {
    if (!panel) return false;
    if (!isOpen()) setOpen(true);
    var fp = $('folder-panel');
    if (fp && !/\bopen\b/.test(fp.className || '')) {
      var head = $('btn-tab-folder');
      if (head) head.click();
    }
    var el = null;
    if (kind === 'part' && part) {
      var q = (window.CSS && window.CSS.escape) ? window.CSS.escape(String(part)) : String(part);
      el = document.querySelector('#files-parts .files-part-head[data-part="' + q + '"]');
      if (el && el.getAttribute('aria-expanded') !== 'true') el.click();
      // 節を開いた直後は一覧を読み直している最中で、部品の見出しがまだ無いことがある。1 度だけ待つ。
      if (!el && !_retried) {
        window.setTimeout(function() { reveal(kind, part, true); }, 400);
        return true;
      }
    }
    if (!el) el = $('top-save-target');
    if (!el) return false;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    el.classList.add('files-revealed');
    window.setTimeout(function() { el.classList.remove('files-revealed'); }, 1500);
    return true;
  }

  // ── 件数 (畳んだままでも読める) ───────────────────────────────────────
  function setReadonlyCount(comparing) {
    var FT = window.MA.fileTree;
    var c = $('files-count-readonly');
    if (c && FT) c.textContent = FT.readonlyCountLabel(comparing);
  }

  function setGitCount(git) {
    var FT = window.MA.fileTree;
    var c = $('files-count-git');
    if (c && FT) c.textContent = FT.gitCountLabel(git);
  }

  function setSummary(sum) {
    var FT = window.MA.fileTree;
    var s = $('files-summary');
    if (s && FT) s.textContent = FT.summaryLine(sum);
  }

  // 下端の「12 図 未反映 1 控え 1」(design 10a)。保存先があればその図を、ツリーのファイル行の札と
  // 同じ事実 (_fileState) で数える。保存先を決めていない (ダウンロードの) ときは開いている図を数える。
  function refreshSummary() {
    var FT = window.MA.fileTree;
    if (!FT || !FT.summaryOf) return;
    var entries = _folderNames();
    if (entries.length) {
      setSummary(FT.summaryOf(entries.map(function(e) { return _fileState(e.name); })));
      return;
    }
    setSummary(FT.summaryOf(_docs().map(function(d) {
      return { unapplied: !!d.reviewPending, draft: !!d.draft };
    })));
  }

  function refresh() {
    if (!panel) return;
    renderOpen();
    renderParts();
    refreshSummary();
    syncTargetCaret();
    _gitMarks();
  }

  // 保存先が Git なら、行を描き直すたびにファイル名の右の M / A を付け直す (design 10c)。
  function _gitMarks() {
    try { if (window.MA.gitUi) window.MA.gitUi.applyMarks(); } catch (e) { /* 印が無くても一覧は動く */ }
  }

  // ── 初期化 ───────────────────────────────────────────────────────────
  function init() {
    panel = $('files-panel');
    if (!panel) return;

    setOpen(_get(KEY_OPEN, '1') !== '0');

    var railBtn = $('rail-files');
    if (railBtn) railBtn.addEventListener('click', toggle);
    var collapse = $('files-collapse');
    if (collapse) collapse.addEventListener('click', function() { setOpen(false); });

    // Ctrl+B で畳む / 開く。入力中でも効く (文字は入らない)。
    document.addEventListener('keydown', function(ev) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
      if (String(ev.key || '').toLowerCase() !== 'b') return;
      ev.preventDefault();
      toggle();
    });

    var FT = window.MA.fileTree;
    ['open', 'readonly', 'git'].forEach(function(id) {
      // 10a どおり: 開いている図 = 開く、読むだけ・GIT = 畳む。
      // 「読むだけ」の入口 (👀 / ⇔) は見出しの行に置いてあるので、畳んだままでも押せる。
      var def = FT ? FT.defaultOpen(id) : (id === 'open');
      setSec(id, _get(KEY_SEC + id, def ? '1' : '0') === '1');
      var head = $('files-sec-' + id);
      if (head) head.addEventListener('click', function() { setSec(id, !secOpen(id)); });
    });

    // 「読むだけを表示 / 隠す」。隠している間は節ごと出さない。
    var ro = $('files-show-readonly');
    var roSec = panel.querySelector('[data-files-section="readonly"]');
    function applyRo(on) {
      if (roSec) roSec.hidden = !on;
      if (ro) ro.setAttribute('aria-pressed', on ? 'true' : 'false');
      _set(KEY_RO, on ? '1' : '0');
    }
    applyRo(_get(KEY_RO, '1') !== '0');
    if (ro) {
      ro.addEventListener('click', function() {
        applyRo(ro.getAttribute('aria-pressed') !== 'true');
      });
    }

    var newDoc = $('files-new-doc');
    if (newDoc) {
      newDoc.addEventListener('click', function() {
        var b = $('btn-tab-new');
        if (b) b.click();
      });
    }
    // 「新しいフォルダ」は保存先を選び直す入口と同じ道を通る
    // (保存先を作る / 変えるの 2 本を画面に並べない)。
    var newFolder = $('files-new-folder');
    if (newFolder) {
      newFolder.addEventListener('click', function() {
        var b = $('top-save-target');
        if (b) b.click();
      });
    }

    var filter = $('files-filter');
    if (filter) {
      filter.addEventListener('input', function() {
        renderOpen();
        renderParts();
        // 保存先の絞り込みは #folder-panel 側の入力に渡す (数える所を 2 つにしない)。
        var ff = document.querySelector('#folder-panel input.folder-filter');
        if (ff) {
          ff.value = filter.value;
          ff.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    // 「保存先」の見出しは #btn-tab-folder そのもの。押した後に ▸▾ を合わせる。
    var target = $('btn-tab-folder');
    if (target) {
      target.addEventListener('click', function() { window.setTimeout(syncTargetCaret, 0); });
    }

    // 一覧は非同期に描き直る (listFolder)。描き直るたびに部品の束ねも追う。
    var fp = $('folder-panel');
    if (fp && window.MutationObserver) {
      var mo = new window.MutationObserver(function() { renderParts(); });
      mo.observe(fp, { childList: true, subtree: true });
      // 一覧は見出し以外 (図を開いた・外を押した・起動時の既定) でも開閉するので、
      // ▸▾ は #folder-panel の open クラスそのものに合わせる。
      var moOpen = new window.MutationObserver(function() { syncTargetCaret(); });
      moOpen.observe(fp, { attributes: true, attributeFilter: ['class'] });
    }

    refresh();
  }

  return {
    init: init,
    refresh: refresh,
    isOpen: isOpen,
    setOpen: setOpen,
    toggle: toggle,
    setSec: setSec,
    secOpen: secOpen,
    setReadonlyCount: setReadonlyCount,
    setGitCount: setGitCount,
    setSummary: setSummary,
    renderParts: renderParts,
    folderEntries: _folderNames,
    reveal: reveal,
  };
})();
