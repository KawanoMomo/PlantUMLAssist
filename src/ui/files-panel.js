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
  var KEY_TARGET_PARTS = 'pua.files.targetParts';   // 保存先のフォルダの下 (部品のフォルダ) の開閉

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

  // design 10a (BLK-builder-20260924-1923-4): 保存先のフォルダの行の ▾ / ▸。
  // その下の部品のフォルダ・直下の図をまとめて畳む / 開く。開閉は次回も覚える。
  function setTargetParts(on) {
    var host = $('files-parts');
    var btn = $('files-target-caret');
    if (host) host.hidden = !on;
    if (btn) {
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      var c = btn.querySelector('.files-caret');
      if (c) c.textContent = on ? '▾' : '▸';
    }
    _set(KEY_TARGET_PARTS, on ? '1' : '0');
  }

  function targetPartsOpen() {
    var host = $('files-parts');
    return !!host && !host.hidden;
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
  // BLK-builder-20260924-1741-2 (design 9a / 10a): 未保存の印はタブと同じ判定 (app.js の docSaveStatus) を読む。
  // 以前は doc.dirty を読んでいたが、この値はどこでも立たず、ツリーに ● が出たことが無かった。
  function _saveMark(doc) {
    var f = window.MA.docSaveStatus;
    var st = (typeof f === 'function' && doc) ? f(doc.id) : 'same';
    return st === 'changed' ? '●' : (st === 'new' ? '○' : '');
  }

  function _marks(doc) {
    var out = [];
    var sm = _saveMark(doc);
    if (sm) out.push(sm);
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

  // BLK-builder-20260924-2316-3 (design 10b): 描き直しで、フォーカスのあった行が作り直されても
  // 同じ行へフォーカスを戻す (図を Enter / クリックで開いた後も、続けて ↑↓ → ← Enter F2 が効く)。
  // 描き直す前にフォーカスが host の中の行に無ければ何もしない (利用者が他所を押した後に奪わない)。
  function _focusKeep(host) {
    var FM = window.MA.fileMenu;
    var a = document.activeElement;
    if (!host || !a || !FM || !FM.rowKey || !host.contains(a)) return null;
    return FM.rowKey(a);
  }
  function _focusBack(host, key) {
    var FM = window.MA.fileMenu;
    if (!key || !host || !FM || !FM.findRow) return;
    var a = document.activeElement;
    // 描き直しで行が外れると body に落ちる。それ以外 (本文欄・窓など) にあるなら動かさない。
    if (a && a !== document.body && a !== document.documentElement && a.isConnected !== false) return;
    var el = FM.findRow(key, host.querySelectorAll('button'));
    if (!el || (el.closest && el.closest('[hidden]'))) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function renderOpen() {
    var body = secBody('open');
    if (!body) return;
    var keep = _focusKeep(body);
    _renderOpen(body);
    _focusBack(body, keep);
  }

  function _renderOpen(body) {
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
    // 保存先の行: その名前の図が開いていて、前回保存から変わっていれば ● (タブと同じ判定)。
    var byName = window.MA.docSaveStatusByName;
    if (typeof byName === 'function' && byName(name) === 'changed') st.dirty = true;
    _docs().forEach(function(d) {
      if (String(d.name || '') !== name) return;
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
    // design 10a (BLK-builder-20260924-1743-1): ダブルクリックでタブとして固定する。1 回押しは仮のタブのまま。
    // 固定の道は保存先の一覧の行のダブルクリックと同じ 1 本 (その行へ渡す)。
    b.addEventListener('dblclick', function() { _dblclickFolderItem(f.name); });
    return b;
  }

  function _clickFolderItem(name) {
    var it = document.querySelector(_itemSel(name));
    if (it) it.click();
  }

  // design 10a (BLK-builder-20260924-1735-3): 「＋ 未作成 2 図種（UC・ACT）」。
  // 「展開すると、まだ作っていない図種が薄い文字で出て、押すとその場で作れます」。
  // 前は行を押すと 🧩 部品ビュー (読むだけの他フォルダの比較枠) が開くだけで、作るには
  // ➕ 部品を起こす で部品名を打ち直していた。略号を押せばその図種を、＋ で未作成をまとめて作る。
  function _missingRow(g) {
    var FT = window.MA.fileTree;
    var mp = FT && FT.missingParts ? FT.missingParts(g) : null;
    var row = document.createElement('div');
    row.className = 'files-part-missing';
    row.setAttribute('data-part', g.part);
    if (!mp) { row.textContent = g.missingLabel; return row; }
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'files-part-missing-all';
    all.setAttribute('data-part', g.part);
    all.textContent = '＋';
    all.title = mp.allTitle;
    all.setAttribute('aria-label', mp.allTitle);
    all.addEventListener('click', function(ev) {
      ev.stopPropagation();
      _createKinds(g.part, g.missing);
    });
    row.appendChild(all);
    row.appendChild(document.createTextNode(mp.head));
    mp.kinds.forEach(function(k, i) {
      if (i) row.appendChild(document.createTextNode('・'));
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'files-part-missing-kind';
      b.setAttribute('data-part', g.part);
      b.setAttribute('data-kind', k.kind);
      b.textContent = k.abbr;
      b.title = k.title;
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        _createKinds(g.part, [k.kind]);
      });
      row.appendChild(b);
    });
    row.appendChild(document.createTextNode(mp.tail));
    return row;
  }

  function _createKinds(part, kinds) {
    if (typeof window.createPartKinds !== 'function') return;
    var names = _folderNames().map(function(e) { return e.name; });
    window.createPartKinds(part, kinds, names);
  }

  function _dblclickFolderItem(name) {
    var it = document.querySelector(_itemSel(name));
    if (!it) return;
    var ev;
    try { ev = new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }); }
    catch (e) { ev = document.createEvent('MouseEvents'); ev.initEvent('dblclick', true, true); }
    it.dispatchEvent(ev);
  }

  // 部品のフォルダも直下の図も無い (ダウンロード保存・空のフォルダ) ときは、畳む印を出さない。
  function _syncTargetRow() {
    var host = $('files-parts');
    var btn = $('files-target-caret');
    var row = btn ? btn.parentNode : null;
    if (row) row.setAttribute('data-empty', host && host.firstChild ? '0' : '1');
  }

  function renderParts() {
    var host = $('files-parts');
    if (!host) return;
    var keep = _focusKeep(host);
    _renderParts(host);
    _focusBack(host, keep);
  }

  function _renderParts(host) {
    var FT = window.MA.fileTree;
    var entries = _folderNames();
    if (!FT || !entries.length) {
      host.textContent = '';
      // BLK-owner-20260926-0550-3: 最後の 1 枚が消えた後も前の件数が見出しに残らないように消す。
      var c0 = $('files-count-target');
      if (c0) c0.textContent = '';
      _syncTargetRow();
      refreshSummary();
      if (typeof window.MA.refreshTopCrumbs === 'function') window.MA.refreshTopCrumbs();
      return;
    }
    var shown = FT.filter(entries, _query());
    var lay = FT.layout ? FT.layout(shown) : { groups: FT.groups(shown), loose: [] };
    var groups = lay.groups;
    host.textContent = '';
    groups.forEach(function(g) {
      var stored = _get(KEY_PART + g.part, '0') === '1';
      var open = FT.partOpen ? FT.partOpen(stored, _query()) : stored;
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
      if (g.missingLabel) body.appendChild(_missingRow(g));
      host.appendChild(body);

      head.addEventListener('click', function() {
        var on = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', on ? 'true' : 'false');
        caret.textContent = on ? '▾' : '▸';
        body.hidden = !on;
        // 絞り込み中に開閉しても、覚えている開閉は書き換えない (絞り込みを消すと元に戻る)。
        if (!String(_query() || '').trim()) _set(KEY_PART + g.part, on ? '1' : '0');
      });
    });
    // 図種を読めない図は部品のフォルダに分けず、保存先の直下にファイル行で並べる。
    lay.loose.forEach(function(f) { host.appendChild(_fileButton(f, true)); });
    _syncTargetRow();
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
      if (!targetPartsOpen()) setTargetParts(true);
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
  function setReadonlyCount(comparing, total) {
    var FT = window.MA.fileTree;
    var c = $('files-count-readonly');
    if (c && FT) c.textContent = FT.readonlyCountLabel(comparing, total);
  }

  // ── 読むだけのフォルダ (design 10a、BLK-builder-20260924-1749-3) ─────────
  // 「読むだけのフォルダ（先輩・過去の版）は下に分けて置き、右クリックから「並べて比較」できます」
  // 「右の枠に並べている間は「比較中」と出ます。編集はできません」。
  // 前は節を開いても説明の 1 行だけで、隣の保存フォルダが 1 行も並ばず、見出しに件数も出なかった。
  // dirs は /peek-dirs の選択肢 (peek-folder.choices)、comparingDir は右の枠に並べている相手。
  // 行を押すと開閉し、そのフォルダの図が並ぶ。図を押すとその 1 枚を右の枠に並べる (読むだけ)。
  var KEY_RO_DIR = 'pua.files.ro.';

  function _roFill(box, path) {
    var WS = window.MA.workspace;
    var FT = window.MA.fileTree;
    if (!WS || !WS.listFolder) return;
    var keep = _focusKeep(box);
    box.textContent = '';
    var wait = document.createElement('div');
    wait.className = 'files-empty';
    wait.textContent = '読み込み中…';
    box.appendChild(wait);
    var got = WS.listFolder(path);
    if (!got || typeof got.then !== 'function') got = Promise.resolve(got);
    got.then(function(info) {
      var entries = ((info && info.entries) || []).filter(function(e) { return e && (e.name || e.type); });
      box.textContent = '';
      if (!entries.length) {
        var none = document.createElement('div');
        none.className = 'files-empty';
        none.textContent = '図がありません';
        box.appendChild(none);
        return;
      }
      entries.map(function(e) { return { name: String(e.name || e.type), kind: e.kind || '' }; })
        .sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; })
        .forEach(function(f) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'files-ro-file';
          b.setAttribute('data-ro-dir', path);
          b.setAttribute('data-file-name', f.name);
          b.title = f.name + ' を右の枠に並べる (読むだけ)';
          b.appendChild(_glyphEl(FT && FT.fileKind ? FT.fileKind(f.name, f.kind) : f.kind));
          var nm = document.createElement('span');
          nm.className = 'files-row-name';
          nm.textContent = f.name;
          b.appendChild(nm);
          b.addEventListener('click', function() {
            if (typeof window.compareReadonlyFolder === 'function') window.compareReadonlyFolder(path, f.name);
          });
          box.appendChild(b);
        });
      _focusBack(box, keep);
      var host = box.parentNode;
      if (host && host._pendingFocus) {
        var pk = host._pendingFocus;
        host._pendingFocus = null;
        _focusBack(host, pk);
      }
    }).catch(function() {
      box.textContent = '';
      var bad = document.createElement('div');
      bad.className = 'files-empty';
      bad.textContent = '読めませんでした';
      box.appendChild(bad);
    });
  }

  function renderReadonly(dirs, comparingDir) {
    var body = $('files-body-readonly');
    var FT = window.MA.fileTree;
    if (!body || !FT || !FT.readonlyRows) return;
    var rows = FT.readonlyRows(dirs, comparingDir);
    setReadonlyCount(rows.filter(function(r) { return r.comparing; }).length, rows.length);
    var host = $('files-ro-list');
    if (!host) {
      host = document.createElement('div');
      host.id = 'files-ro-list';
      body.insertBefore(host, body.firstChild);
    }
    var hint = $('files-ro-hint');
    if (hint) hint.hidden = rows.length > 0;
    // 並べて比較の枠は図を切り替えるたびに状態を描き直す。行が同じなら作り直さない
    // (開いているフォルダの中身を毎回読み直さない)。
    var sig = JSON.stringify(rows);
    if (host.getAttribute('data-sig') === sig && host.childNodes.length === rows.length * 2) return;
    host.setAttribute('data-sig', sig);
    var keep = _focusKeep(host);
    host.textContent = '';
    rows.forEach(function(r) {
      var open = _get(KEY_RO_DIR + r.name, '0') === '1';
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'files-ro-folder';
      head.setAttribute('data-ro-dir', r.path);
      head.setAttribute('data-ro-name', r.name);
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (r.comparing) head.setAttribute('data-comparing', '1');
      head.title = r.path + ' (読むだけ。右クリックで並べて比較)';
      var caret = document.createElement('span');
      caret.className = 'files-caret';
      caret.setAttribute('aria-hidden', 'true');
      caret.textContent = open ? '▾' : '▸';
      head.appendChild(caret);
      var lab = document.createElement('span');
      lab.className = 'files-part-label';
      lab.textContent = r.name;
      head.appendChild(lab);
      if (r.comparing) {
        var tag = document.createElement('span');
        tag.className = 'files-ro-tag';
        tag.textContent = '比較中';
        head.appendChild(tag);
      }
      var cnt = document.createElement('span');
      cnt.className = 'files-sec-count';
      cnt.textContent = String(r.files);
      head.appendChild(cnt);
      host.appendChild(head);
      var box = document.createElement('div');
      box.className = 'files-ro-body';
      box.setAttribute('data-ro-body', r.path);
      box.hidden = !open;
      if (open) _roFill(box, r.path);
      host.appendChild(box);
      head.addEventListener('click', function() {
        var on = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', on ? 'true' : 'false');
        caret.textContent = on ? '▾' : '▸';
        box.hidden = !on;
        _set(KEY_RO_DIR + r.name, on ? '1' : '0');
        if (on) _roFill(box, r.path);
      });
    });
    // 図の行 (読むだけのフォルダの中) は _roFill が後から埋めるので、そこでも戻す。
    _focusBack(host, keep);
    host._pendingFocus = (keep && !host.contains(document.activeElement)) ? keep : null;
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

  // 打つたび・保存のたびに、行を組み直さずに未保存の印だけを付け直す (タブの印と同じ機会。
  // 行を描き直すとツリーの開閉やフォーカスが揺れる)。
  function _setMark(row, text) {
    var m = row.querySelector('.files-row-mark');
    if (!text) {
      if (m) row.removeChild(m);
      row.removeAttribute('data-marks');
      return;
    }
    if (!m) {
      m = document.createElement('span');
      m.className = 'files-row-mark';
      var nm = row.querySelector('.files-row-name');
      if (nm && nm.nextSibling) row.insertBefore(m, nm.nextSibling);
      else row.appendChild(m);
    }
    if (m.textContent !== text) m.textContent = text;
    if (row.classList.contains('files-part-file')) row.setAttribute('data-marks', text);
  }

  function syncMarks() {
    if (!panel) return;
    var FT = window.MA.fileTree;
    var byId = {};
    _docs().forEach(function(d) { byId[String(d.id)] = d; });
    Array.prototype.forEach.call(panel.querySelectorAll('.files-row[data-doc-id]'), function(row) {
      var d = byId[row.getAttribute('data-doc-id')];
      if (d) _setMark(row, _marks(d));
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.files-part-file[data-file-name]'), function(row) {
      var st = _fileState(row.getAttribute('data-file-name'));
      _setMark(row, FT && FT.fileMarks ? FT.fileMarks(st) : '');
    });
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
      if (head) head.addEventListener('click', function() {
        setSec(id, !secOpen(id));
        // 読むだけを開いたら隣のフォルダを取り直す (起動後に増えたフォルダも並ぶ)。
        if (id === 'readonly' && secOpen(id) && typeof window.refreshReadonlyTree === 'function') {
          window.refreshReadonlyTree(true);
        }
      });
    });

    setTargetParts(_get(KEY_TARGET_PARTS, '1') !== '0');
    _syncTargetRow();
    var tc = $('files-target-caret');
    if (tc) tc.addEventListener('click', function() { setTargetParts(!targetPartsOpen()); });

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
        // 絞り込んだ図が畳んだ部品のフォルダの奥に隠れないよう、保存先の下を開く。
        if (filter.value && !targetPartsOpen()) setTargetParts(true);
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
    syncMarks: syncMarks,
    isOpen: isOpen,
    setOpen: setOpen,
    toggle: toggle,
    setSec: setSec,
    secOpen: secOpen,
    setReadonlyCount: setReadonlyCount,
    renderReadonly: renderReadonly,
    setGitCount: setGitCount,
    setSummary: setSummary,
    renderParts: renderParts,
    folderEntries: _folderNames,
    reveal: reveal,
    setTargetParts: setTargetParts,
    targetPartsOpen: targetPartsOpen,
  };
})();
