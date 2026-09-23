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
  var KEY_PIN = 'pua.files.pinned';       // ダブルクリックで固定した図

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
  var pinned = {};

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
      if (pinned[String(doc.id)]) b.setAttribute('data-pinned', '1');
      var name = document.createElement('span');
      name.className = 'files-row-name';
      name.textContent = String(doc.name || '(無題)');
      b.appendChild(name);
      var mark = _marks(doc);
      if (mark || pinned[String(doc.id)]) {
        var m = document.createElement('span');
        m.className = 'files-row-mark';
        m.textContent = (pinned[String(doc.id)] ? '📌 ' : '') + mark;
        b.appendChild(m);
      }
      b.addEventListener('click', function() { _openDoc(doc.id); });
      b.addEventListener('dblclick', function() {
        pinned[String(doc.id)] = true;
        _set(KEY_PIN, JSON.stringify(Object.keys(pinned)));
        renderOpen();
      });
      body.appendChild(b);
    });
    var c = $('files-count-open');
    if (c) c.textContent = docs.length ? String(docs.length) : '';
    var head = $('files-sec-open');
    if (head) {
      var lb = head.querySelector('.files-sec-label');
      if (lb) lb.textContent = '開いている図' + (docs.length ? '（' + docs.length + '）' : '');
    }
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
      if (n) out.push({ name: n });
    });
    return out;
  }

  function _clickFolderItem(name) {
    var it = document.querySelector('#folder-panel .folder-item[data-file-name="' + name + '"]');
    if (it) it.click();
  }

  function renderParts() {
    var host = $('files-parts');
    if (!host) return;
    var FT = window.MA.fileTree;
    var entries = _folderNames();
    if (!FT || !entries.length) { host.textContent = ''; return; }
    var groups = FT.groups(FT.filter(entries, _query()));
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
      host.appendChild(head);

      var body = document.createElement('div');
      body.className = 'files-part-body';
      body.setAttribute('data-part-body', g.part);
      body.hidden = !open;
      g.files.forEach(function(f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'files-part-file';
        b.setAttribute('data-file-name', f.name);
        b.textContent = f.name;
        b.addEventListener('click', function() { _clickFolderItem(f.name); });
        body.appendChild(b);
      });
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
    var c = $('files-count-target');
    if (c) c.textContent = groups.length ? String(entries.length) : '';
    _gitMarks();
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

  // 下端の「12 図 未反映 1 控え 1」は、開いている図から数えてこの 1 行に出す。
  function refreshSummary() {
    var docs = _docs();
    var un = 0, dr = 0;
    docs.forEach(function(d) {
      if (d.reviewPending) un++;
      if (d.draft) dr++;
    });
    setSummary({ total: docs.length, unapplied: un, draft: dr });
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

    try { (JSON.parse(_get(KEY_PIN, '[]')) || []).forEach(function(k) { pinned[k] = true; }); } catch (e) { pinned = {}; }

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
      var def = FT ? FT.defaultOpen(id) : (id === 'open');
      // 10a は「読むだけ」も既定で畳むが、畳むと中の入口 (👀 他フォルダ /
      // 並べて比較) が押せなくなり、台本がその 2 つを手順の途中で押している。
      // 台本を「節を開いてから押す」に直すまでは開いたまま出す
      // (GIT は中に入口を持たないので 10a どおり畳む)。
      if (id === 'readonly') def = true;
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
  };
})();
