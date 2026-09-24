'use strict';
window.MA = window.MA || {};

// file-menu (UI) — FILES ツリーの右クリック・キーボード・ドラッグ (design 10b)。
//
// BLK-human-20260923-1701: ファイル 1 枚に対する操作 (一時控え・並べて比較・前回保存版・
// 変遷・名前変更・削除…) がタブ列・ツール ▾・下端の札に散らばっていた。ツリーの
// ファイルを右クリックすれば全部そこにある、を作る。中身 (どの操作を並べるか・キーの
// 読み替え・名前の組み立て) は src/core/file-menu.js、ここは DOM と結線だけ。
//
// 操作の実体は app.js の既存の道 (openFromFolderByName / openCompareTarget /
// toggleCompareView / exportSVG / _draftToggleName / タブのダブルクリック改名) を
// そのまま呼ぶ。同じ操作を 2 通りに実装しない。
window.MA.fileMenuUi = (function() {
  var ROW_SEL = '.files-sec-head, .files-row, .files-part-head, .files-part-file, .files-ro-folder, .files-ro-file, #folder-panel .folder-item[data-file-name]';
  var FILE_SEL = '.files-row, .files-part-file, #folder-panel .folder-item[data-file-name]';
  var DRAG_TYPE = 'application/x-pua-file';

  var panel = null;
  var menu = null;
  var menuItems = [];
  var menuCtx = null;
  var menuActive = -1;
  var returnFocus = null;

  function $(id) { return document.getElementById(id); }
  function FM() { return window.MA.fileMenu; }
  function WS() { return window.MA.workspace; }
  function _dir() {
    try { return typeof window._wsFileDir === 'function' ? window._wsFileDir() : './autosave'; } catch (e) { return './autosave'; }
  }
  function toast(msg) {
    try { if (window.MA.toast) window.MA.toast.show(msg); } catch (e) {}
    try { if (typeof window.setSaveStatus === 'function') window.setSaveStatus(msg); } catch (e) {}
  }

  // ── 行の読み取り ───────────────────────────────────────────────────────
  function rowOf(el) {
    return el && el.closest ? el.closest(ROW_SEL) : null;
  }

  function isFileRow(row) { return !!(row && row.matches && row.matches(FILE_SEL)); }

  function fileNameOf(row) {
    if (!row) return '';
    var n = row.getAttribute('data-file-name');
    if (n) return n;
    var id = row.getAttribute('data-doc-id');
    var ws = WS();
    if (id && ws && ws.list) {
      var docs = ws.list();
      for (var i = 0; i < docs.length; i++) if (String(docs[i].id) === id) return docs[i].name;
    }
    return '';
  }

  // フォルダの種類。部品のフォルダは名前で束ねた見出し、保存先・読むだけは実在のフォルダ。
  function folderOf(el) {
    if (!el || !el.closest) return null;
    var part = el.closest('.files-part-head');
    if (part) return { kind: 'part', part: part.getAttribute('data-part') || '', el: part };
    var target = el.closest('#btn-tab-folder, #top-save-target');
    if (target) return { kind: 'target', el: target };
    // design 10a (BLK-builder-20260924-1749-3): 読むだけの節の中のフォルダの行 (と、その中の図の行)。
    var roRow = el.closest('.files-ro-folder, .files-ro-file');
    if (roRow) {
      return { kind: 'readonly', dir: roRow.getAttribute('data-ro-dir') || '',
        name: roRow.getAttribute('data-ro-name') || '', el: roRow };
    }
    var ro = el.closest('#files-sec-readonly');
    if (ro) return { kind: 'readonly', el: ro };
    return null;
  }

  function visibleRows() {
    if (!panel) return [];
    return Array.prototype.filter.call(panel.querySelectorAll(ROW_SEL), function(el) {
      return el.offsetParent !== null && !el.disabled;
    });
  }

  // ── 図を開く (開いていればそのタブへ) ────────────────────────────────
  function findDoc(name) {
    var ws = WS();
    return ws && ws.findByName ? ws.findByName(name) : null;
  }

  function ensureOpen(name) {
    var ws = WS();
    var d = findDoc(name);
    if (d) {
      if (typeof window.switchToDoc === 'function') window.switchToDoc(d.id);
      return Promise.resolve(true);
    }
    if (typeof window.openFromFolderByName === 'function') window.openFromFolderByName(name);
    return new Promise(function(resolve) {
      var t0 = Date.now();
      (function poll() {
        var a = ws && ws.getActive ? ws.getActive() : null;
        if (a && a.name === name) { resolve(true); return; }
        if (Date.now() - t0 > 4000) { resolve(false); return; }
        window.setTimeout(poll, 60);
      })();
    });
  }

  function fileOp(body) {
    return window.fetch('/file-op', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) {
      return r.json().catch(function() { return {}; }).then(function(j) {
        return { ok: !!(r.ok && j && j.ok), status: r.status, data: j || {} };
      });
    }).catch(function() { return { ok: false, status: 0, data: { error: '保存フォルダに届きませんでした' } }; });
  }

  function refreshLists() {
    try { if (typeof window.refreshFolderPanelNow === 'function') window.refreshFolderPanelNow(); } catch (e) {}
    try { if (window.MA.filesPanel) window.MA.filesPanel.refresh(); } catch (e) {}
  }

  function folderFileNames() {
    var ws = WS();
    if (!ws || !ws.listFiles) return Promise.resolve([]);
    return Promise.resolve(ws.listFiles(_dir())).then(function(names) {
      return (names || []).map(function(n) { return String(n).replace(/\.puml$/i, ''); });
    });
  }

  // ── ファイルの操作 ───────────────────────────────────────────────────
  function openSide(name) {
    var ws = WS();
    var prev = ws && ws.getActiveId ? ws.getActiveId() : null;
    return ensureOpen(name).then(function(ok) {
      var d = findDoc(name);
      if (!ok || !d) return;
      if (prev != null && prev !== d.id && typeof window.switchToDoc === 'function') {
        window.switchToDoc(prev);
      }
      if (prev == null || prev === d.id) return;
      window._compareRefId = d.id;
      if (typeof window.toggleCompareView === 'function') window.toggleCompareView(true, 'ref');
    });
  }

  function renameFile(name) {
    var ws = WS();
    var d = findDoc(name);
    // 開いている図は、タブのダブルクリックと同じ道を通す (レビューの基準・継承元・
    // 前の名前のファイルの付け替えまで同じ 1 本で済ませる)。
    if (d) {
      var tab = document.querySelector('#tab-bar .tab[data-doc-id="' + d.id + '"]');
      if (tab) {
        tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        window.setTimeout(refreshLists, 300);
        return Promise.resolve();
      }
    }
    // design 10b (BLK-builder-20260924-1917-1): 開いていない図は、ツリーのその行の名前がその場で入力欄になる
    // (エクスプローラの F2 と同じ)。以前はブラウザの入力窓が画面の上端に出て、どの行を直しているか読めなかった。
    var row = treeFileRow(name);
    if (row) return renameInline(row, name);
    var rule = ws && ws.nameRuleText ? ws.nameRuleText() : '新しい名前';
    return commitRename(name, FM().cleanName(window.prompt(rule, name), name));
  }

  function commitRename(name, next) {
    if (!next) return Promise.resolve(false);
    return fileOp({ op: 'rename', dir: _dir(), name: name, to: next }).then(function(r) {
      if (!r.ok) { toast('名前を変えられませんでした: ' + (r.data.error || r.status)); return false; }
      if (window.MA.reviewDesk) { try { window.MA.reviewDesk.renameBaseline(name, next); } catch (e) {} }
      if (window.MA.lineage) { try { window.MA.lineage.rename(name, next); } catch (e) {} }
      toast('「' + name + '」を「' + next + '」に変えました');
      refreshLists();
      return true;
    });
  }

  function treeFileRow(name) {
    if (!panel) return null;
    var rows = panel.querySelectorAll('.files-part-file[data-file-name]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-file-name') === name && rows[i].offsetParent !== null) return rows[i];
    }
    return null;
  }

  // 行を隠し、同じ位置に名前の入力欄を置く (ボタンの中に入力欄は置けない)。
  // Enter で確定・Esc で取り消し・欄の外を押すと確定。決まりに合わない名前は欄の下に理由を 1 行出し、欄は開いたまま。
  function renameInline(row, name) {
    var old = document.getElementById('files-rename-box');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.id = 'files-rename-box';
    box.className = 'files-rename-box';
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'files-rename-input';
    input.className = 'files-rename-input';
    input.value = name;
    input.setAttribute('aria-label', name + ' の新しい名前 (Enter で確定・Esc で取り消し)');
    input.setAttribute('data-rename-of', name);
    var note = document.createElement('div');
    note.id = 'files-rename-note';
    note.className = 'files-rename-note';
    note.hidden = true;
    box.appendChild(input);
    box.appendChild(note);
    row.parentNode.insertBefore(box, row.nextSibling);
    // 行は display: flex を持つので hidden 属性では消えない。
    row.style.display = 'none';
    var done = false;
    var busy = false;
    function close(focusRow) {
      if (done) return;
      done = true;
      if (box.parentNode) box.parentNode.removeChild(box);
      row.style.display = '';
      if (focusRow && document.body.contains(row)) row.focus();
    }
    function commit() {
      if (done || busy) return Promise.resolve(false);
      var ws = WS();
      var raw = input.value;
      var next = FM().cleanName(raw, name);
      if (!next) { close(true); return Promise.resolve(false); }
      var why = FM().renameProblem(next, ws && ws.isValidName ? ws.isValidName : null,
        ws && ws.nameRuleText ? ws.nameRuleText() : '');
      if (why) {
        note.textContent = why;
        note.hidden = false;
        input.focus();
        return Promise.resolve(false);
      }
      busy = true;
      return commitRename(name, next).then(function(ok) {
        busy = false;
        if (ok) { close(false); return true; }
        note.textContent = '名前を変えられませんでした (同じ名前の図が無いか確かめてください)';
        note.hidden = false;
        input.focus();
        return false;
      });
    }
    input.addEventListener('keydown', function(ev) {
      if (ev.isComposing) return;
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commit(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(true); }
    });
    input.addEventListener('input', function() { note.hidden = true; });
    input.addEventListener('blur', function() {
      // 理由を出している間は開いたまま (外を押して消えると、何が悪かったか読めない)。
      window.setTimeout(function() { if (!done && note.hidden) commit(); }, 0);
    });
    input.focus();
    // 拡張子は出していないので、名前の全体を選ぶ (打てばそのまま置き換わる)。
    try { input.setSelectionRange(0, input.value.length); } catch (e) {}
    return Promise.resolve(true);
  }

  function copyFile(name) {
    return folderFileNames().then(function(names) {
      var to = FM().copyName(name, names);
      return fileOp({ op: 'copy', dir: _dir(), name: name, to: to }).then(function(r) {
        if (!r.ok) { toast('複製できませんでした: ' + (r.data.error || r.status)); return; }
        toast('「' + to + '」として複製しました');
        refreshLists();
      });
    });
  }

  function moveFile(name) {
    var to = window.prompt('移動先のフォルダ (絶対パス)', '');
    if (to == null || !String(to).trim()) return Promise.resolve();
    return fileOp({ op: 'move', dir: _dir(), name: name, toDir: String(to).trim() }).then(function(r) {
      if (!r.ok) { toast('移動できませんでした: ' + (r.data.error || r.status)); return; }
      toast('「' + name + '」を ' + r.data.dir + ' へ移しました');
      refreshLists();
    });
  }

  // BLK-builder-20260924-1831-2 (design 10b): 移動の行き先の一覧から選んだ隣の保存フォルダへ移す。
  function moveToDir(name, dir) {
    if (!dir) return Promise.resolve();
    return fileOp({ op: 'move', dir: _dir(), name: name, toDir: dir }).then(function(r) {
      if (!r.ok) { toast('移動できませんでした: ' + (r.data.error || r.status)); return; }
      toast('「' + name + '」を ' + (r.data.dir || dir) + ' へ移しました');
      refreshLists();
    });
  }

  // 行き先の候補: ツリーに並んでいる部品のフォルダと、読むだけの節に並ぶ隣の保存フォルダ。
  function moveCandidates() {
    var parts = [];
    var dirs = [];
    if (panel) {
      Array.prototype.forEach.call(panel.querySelectorAll('.files-part-head[data-part]'), function(h) {
        var p = h.getAttribute('data-part') || '';
        if (p) parts.push({ part: p, label: p.toUpperCase() });
      });
      Array.prototype.forEach.call(panel.querySelectorAll('.files-ro-folder[data-ro-dir]'), function(h) {
        dirs.push({ path: h.getAttribute('data-ro-dir') || '', name: h.getAttribute('data-ro-name') || '' });
      });
    }
    return { parts: parts, dirs: dirs };
  }

  function renameToPart(name, part) {
    var to = FM().renameForPart(name, part);
    if (!to) return Promise.resolve();
    return fileOp({ op: 'rename', dir: _dir(), name: name, to: to }).then(function(r) {
      if (!r.ok) { toast('移せませんでした: ' + (r.data.error || r.status)); return; }
      if (window.MA.lineage) { try { window.MA.lineage.rename(name, to); } catch (e) {} }
      toast('「' + name + '」を ' + String(part).toUpperCase() + ' へ移しました (' + to + ')');
      refreshLists();
    });
  }

  function toggleDraft(name) {
    if (typeof window._draftToggleName !== 'function') return;
    var on = window._draftToggleName(name);
    try { if (typeof window.syncDraftButton === 'function') window.syncDraftButton(); } catch (e) {}
    toast(on ? '「' + name + '」を一時控えにしました' : '「' + name + '」の一時控えを外しました');
    refreshLists();
  }

  function deleteFile(name) {
    if (!window.confirm('「' + name + '」を保存フォルダから削除します。過去版は残ります。よろしいですか?')) {
      return Promise.resolve();
    }
    var ws = WS();
    if (!ws || !ws.deleteFile) return Promise.resolve();
    return Promise.resolve(ws.deleteFile(name, _dir())).then(function(r) {
      if (!r || !r.ok) { toast('削除できませんでした: ' + ((r && r.error) || '')); return; }
      toast('「' + name + '」を削除しました (過去版は残っています)');
      refreshLists();
    });
  }

  function reveal(name) {
    return fileOp({ op: 'reveal', dir: _dir(), name: name }).then(function(r) {
      if (!r.ok) { toast('場所を開けませんでした: ' + (r.data.error || r.status)); return; }
      toast(r.data.opened ? 'エクスプローラで開きました: ' + r.data.path : '場所: ' + r.data.path);
    });
  }

  function clickId(id) { var b = $(id); if (b) b.click(); }

  // 保存先が Git のとき (10c の GIT 欄が出ているとき) だけ「過去のコミットと比較…」を押せる。
  function _isGit() {
    var g = window.MA.gitUi;
    try { return !!(g && g.isRepo && g.isRepo()); } catch (e) { return false; }
  }


  function runFile(action, name) {
    switch (action) {
      case 'open': return ensureOpen(name);
      case 'open-side': return openSide(name);
      case 'cmp-readonly':
        return ensureOpen(name).then(function() { if (typeof window.openCompareTarget === 'function') window.openCompareTarget('folder'); });
      case 'cmp-saved':
        return ensureOpen(name).then(function() { if (typeof window.openCompareTarget === 'function') window.openCompareTarget('before'); });
      case 'history':
        return ensureOpen(name).then(function() { clickId('btn-tab-versions'); });
      case 'cmp-commit':
        return ensureOpen(name).then(function() {
          var g = window.MA.gitUi;
          if (g && g.openPicker) g.openPicker(document.getElementById('files-sec-git'));
        });
      case 'rename': return renameFile(name);
      case 'copy': return copyFile(name);
      case 'move': return moveFile(name);
      case 'draft': toggleDraft(name); return Promise.resolve();
      case 'export-svg':
        return ensureOpen(name).then(function() { if (typeof window.exportSVG === 'function') window.exportSVG(); });
      case 'reveal': return reveal(name);
      case 'delete': return deleteFile(name);
      default: return Promise.resolve();
    }
  }

  function runMove(it, name) {
    if (!it) return Promise.resolve();
    if (it.id === 'move-part') return renameToPart(name, it.part);
    if (it.id === 'move-dir') return moveToDir(name, it.dir);
    if (it.id === 'move-path') return moveFile(name);
    return Promise.resolve();
  }

  function runFolder(action, folder) {
    switch (action) {
      case 'compare':
        if (folder && folder.dir && typeof window.compareReadonlyFolder === 'function') window.compareReadonlyFolder(folder.dir);
        else clickId('btn-tab-senior');
        break;
      case 'new-doc': clickId('btn-tab-new'); break;
      case 'new-part':
        clickId('btn-tab-part');
        // 部品のフォルダから起こすときは、部品名を打ち直させない。
        if (folder && folder.part) {
          window.setTimeout(function() {
            var inp = document.querySelector('#part-subject');
            if (inp && !inp.value) {
              inp.value = String(folder.part).toUpperCase();
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 50);
        }
        break;
      case 'set-target': clickId('top-save-target'); break;
      // BLK-owner-20260924-1836-prune: 読むだけのフォルダの道具 (部品ビュー・指摘から選ぶ…) は、
      // ツリーで選んだそのフォルダを開いた状態で覗く窓に出す。窓の中でフォルダを選び直させない。
      case 'peek':
        if (typeof window.openPeekFolder === 'function') window.openPeekFolder({ dir: folder && folder.dir });
        break;
      // 「読むだけにする」は覗く窓を開かない (名前と違うことをしない)。保存先では押せない (folderItems)。
      case 'set-readonly': break;
      case 'open-list':
        if (typeof window._openFolderListView === 'function') window._openFolderListView();
        break;
    }
  }

  // ── メニュー ─────────────────────────────────────────────────────────
  function closeMenu(restore) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menuCtx = null;
    menuItems = [];
    menuActive = -1;
    var back = returnFocus;
    returnFocus = null;
    if (restore && back && back.focus && document.body.contains(back)) back.focus();
  }

  function paintActive() {
    if (!menu) return;
    Array.prototype.forEach.call(menu.querySelectorAll('.files-ctx-item'), function(b) {
      var on = Number(b.getAttribute('data-index')) === menuActive;
      b.classList.toggle('is-active', on);
      if (on) b.focus();
    });
  }

  function openMenu(ctx, x, y) {
    if (!menu) return;
    menuCtx = ctx;
    var draft = false;
    if (ctx.type === 'file' && typeof window._draftHas === 'function') {
      try { draft = !!window._draftHas(ctx.name); } catch (e) {}
    }
    if (ctx.type === 'move') {
      var cand = moveCandidates();
      menuItems = FM().moveTargets(ctx.name, cand.parts, cand.dirs);
    } else {
      menuItems = ctx.type === 'file'
        ? FM().fileItems({ git: _isGit(), draft: draft })
        : FM().folderItems({ kind: ctx.folder.kind });
    }
    menu.textContent = '';
    menu.setAttribute('data-menu-kind', ctx.type);
    var title = document.createElement('div');
    title.className = 'files-ctx-title';
    title.textContent = ctx.type === 'move' ? ctx.name + ' の移動先'
      : ctx.type === 'file' ? ctx.name
      : (ctx.folder.kind === 'part' ? String(ctx.folder.part).toUpperCase()
        : ctx.folder.kind === 'target' ? '保存先' : (ctx.folder.name || '読むだけ'));
    menu.appendChild(title);
    menuItems.forEach(function(it, i) {
      if (it.sep) {
        var s = document.createElement('div');
        s.className = 'files-ctx-sep';
        s.setAttribute('role', 'separator');
        menu.appendChild(s);
        return;
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'files-ctx-item' + (it.danger ? ' is-danger' : '');
      b.setAttribute('role', 'menuitem');
      b.setAttribute('data-action', it.id);
      b.setAttribute('data-index', String(i));
      b.tabIndex = -1;
      if (it.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      if (it.title) b.title = it.title;
      var lab = document.createElement('span');
      lab.className = 'files-ctx-label';
      lab.textContent = it.label;
      b.appendChild(lab);
      if (it.tag || it.key) {
        var k = document.createElement('span');
        k.className = it.tag ? 'files-ctx-tag' : 'files-ctx-key';
        k.textContent = it.tag || it.key;
        b.appendChild(k);
      }
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var c = menuCtx;
        // design 10b (BLK-builder-20260924-1831-2): 「別のフォルダへ移動…」は閉じずに、
        // 同じメニューの中を行き先の一覧に替える (パスを打たせる前に、見えている行き先を選ばせる)。
        if (c && c.type === 'file' && it.id === 'move') {
          openMenu({ type: 'move', name: c.name, row: c.row },
            parseFloat(menu.style.left) || 4, parseFloat(menu.style.top) || 4);
          return;
        }
        closeMenu(false);
        if (!c) return;
        if (c.type === 'move') runMove(it, c.name);
        else if (c.type === 'file') runFile(it.id, c.name);
        else runFolder(it.id, c.folder);
      });
      b.addEventListener('mouseenter', function() { menuActive = i; paintActive(); });
      menu.appendChild(b);
    });
    menu.hidden = false;
    // 画面の外へはみ出さないように寄せる。
    var w = menu.offsetWidth || 240;
    var h = menu.offsetHeight || 300;
    var vw = window.innerWidth || 1280;
    var vh = window.innerHeight || 800;
    menu.style.left = Math.max(4, Math.min(x, vw - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, vh - h - 4)) + 'px';
    menuActive = FM().nextIndex(menuItems, -1, 1);
    paintActive();
  }

  function contextFor(el) {
    var row = rowOf(el);
    if (isFileRow(row)) {
      var name = fileNameOf(row);
      if (name) return { type: 'file', name: name, row: row };
    }
    var folder = folderOf(el);
    if (folder) return { type: 'folder', folder: folder, row: folder.el };
    return null;
  }

  function onContextMenu(ev) {
    var ctx = contextFor(ev.target);
    if (!ctx) return;
    ev.preventDefault();
    ev.stopPropagation();
    returnFocus = ctx.row;
    openMenu(ctx, ev.clientX, ev.clientY);
  }

  function openMenuForRow(row) {
    var ctx = contextFor(row);
    if (!ctx) return;
    var r = row.getBoundingClientRect();
    returnFocus = row;
    openMenu(ctx, r.left + 16, r.bottom);
  }

  function onMenuKey(ev) {
    if (!menu || menu.hidden) return;
    var k = ev.key;
    if (k === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      ev.preventDefault();
      menuActive = FM().nextIndex(menuItems, menuActive, k === 'ArrowUp' ? -1 : 1);
      paintActive();
      return;
    }
    if (k === 'Tab') { ev.preventDefault(); closeMenu(true); }
  }

  // ── ツリーのキーボード ────────────────────────────────────────────────
  function rowKind(row) {
    if (isFileRow(row)) return 'file';
    if (row.classList.contains('files-part-head') || row.classList.contains('files-ro-folder')) return 'folder';
    if (row.classList.contains('files-ro-file')) return 'rofile';
    return 'section';
  }

  function parentRow(row) {
    var body = row.closest('.files-part-body, .files-ro-body');
    if (body) {
      var head = body.previousElementSibling;
      if (head && (head.classList.contains('files-part-head') || head.classList.contains('files-ro-folder'))) return head;
    }
    var sec = row.closest('.files-sec');
    return sec ? sec.querySelector('.files-sec-head') : null;
  }

  function onTreeKey(ev) {
    if (ev.defaultPrevented || ev.isComposing) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    var row = rowOf(ev.target);
    if (!row || row !== ev.target) return;   // 行の中の入力欄・小ボタンでは動かさない
    var key = ev.key;
    if (key === 'F10' && ev.shiftKey) key = 'ContextMenu';
    else if (ev.shiftKey) return;
    var kind = rowKind(row);
    var expanded = row.getAttribute('aria-expanded') === 'true';
    var act = FM().keyAction(key, kind === 'rofile' ? 'file' : kind, expanded);
    if (!act) return;
    // 読むだけのフォルダの図は名前を変えたり消したりしない (編集はできない)。
    if (kind === 'rofile' && (act === 'rename' || act === 'delete')) return;
    var rows, i;
    switch (act) {
      case 'down':
      case 'up':
        ev.preventDefault();
        rows = visibleRows();
        i = FM().moveInTree(rows.length, rows.indexOf(row), act === 'up' ? -1 : 1);
        if (rows[i]) rows[i].focus();
        return;
      case 'expand':
      case 'collapse':
        ev.preventDefault();
        row.click();
        return;
      case 'parent':
        ev.preventDefault();
        var p = parentRow(row);
        if (p && p !== row) p.focus();
        return;
      case 'rename':
        ev.preventDefault();
        runFile('rename', fileNameOf(row));
        return;
      case 'delete':
        ev.preventDefault();
        runFile('delete', fileNameOf(row));
        return;
      case 'menu':
        ev.preventDefault();
        openMenuForRow(row);
        return;
      default:
        // open / toggle は行そのもの (button) の Enter = click に任せる。
        return;
    }
  }

  // ── ドラッグ ─────────────────────────────────────────────────────────
  function hasFiles(dt) {
    if (!dt || !dt.types) return false;
    return Array.prototype.indexOf.call(dt.types, 'Files') >= 0;
  }
  function hasOurs(dt) {
    if (!dt || !dt.types) return false;
    return Array.prototype.indexOf.call(dt.types, DRAG_TYPE) >= 0;
  }

  function markDraggable() {
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll('.files-part-file'), function(el) {
      if (el.getAttribute('draggable') !== 'true') el.setAttribute('draggable', 'true');
    });
  }

  // part: 落とした先の部品フォルダ (無ければ保存先の直下へ元の名前で)。
  function importFiles(list, part) {
    var items = FM().importables(list);
    if (!items.length) { toast('取り込めるのは .puml / .plantuml / .uml / .txt です'); return Promise.resolve(); }
    var ws = WS();
    if (!ws || !ws.saveToFile) return Promise.resolve();
    var dir = _dir();
    var where = part ? String(part).toUpperCase() : '保存先';
    return folderFileNames().then(function(names) {
      var have = {};
      names.forEach(function(n) { have[n] = true; });
      var done = [], skipped = [];
      return items.reduce(function(p, it) {
        var name = part ? FM().importNameForPart(it.name, part) : it.name;
        return p.then(function() {
          if (have[name] || !ws.isValidName(name)) { skipped.push(name); return null; }
          return it.file.text().then(function(text) {
            return ws.saveToFile({ name: name, dsl: String(text).replace(/^﻿/, '') }, dir);
          }).then(function(ok) { if (ok) { done.push(name); have[name] = true; } else skipped.push(name); });
        });
      }, Promise.resolve()).then(function() {
        var msg = done.length + ' 枚を' + where + 'へ取り込みました';
        if (part && done.length) msg += ' (' + done.join(', ') + ')';
        if (skipped.length) msg += ' (同じ名前があるなどで取り込まなかった図: ' + skipped.join(', ') + ')';
        toast(msg);
        refreshLists();
      });
    });
  }

  // 落とした先の部品フォルダ。見出しでも、開いた中の行でも、その部品に落としたことにする。
  function dropPartHead(target) {
    if (!target || !target.closest || !panel) return null;
    var head = target.closest('.files-part-head');
    if (head) return head;
    var body = target.closest('.files-part-body');
    if (!body) return null;
    var part = body.getAttribute('data-part-body');
    if (!part) return null;
    var prev = body.previousElementSibling;
    return (prev && prev.classList.contains('files-part-head')) ? prev : null;
  }

  function clearDropMarks() {
    Array.prototype.forEach.call(panel.querySelectorAll('.files-part-head.is-drop'), function(h) { h.classList.remove('is-drop'); });
  }

  function bindDrag() {
    panel.addEventListener('dragstart', function(ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.files-part-file') : null;
      if (!el || !ev.dataTransfer) return;
      ev.dataTransfer.setData(DRAG_TYPE, el.getAttribute('data-file-name') || '');
      ev.dataTransfer.setData('text/plain', el.getAttribute('data-file-name') || '');
      ev.dataTransfer.effectAllowed = 'move';
    });
    panel.addEventListener('dragover', function(ev) {
      var dt = ev.dataTransfer;
      if (hasOurs(dt)) {
        var head = ev.target.closest ? ev.target.closest('.files-part-head') : null;
        if (!head) return;
        ev.preventDefault();
        dt.dropEffect = 'move';
        head.classList.add('is-drop');
        return;
      }
      if (hasFiles(dt)) {
        ev.preventDefault();
        ev.stopPropagation();
        dt.dropEffect = 'copy';
        panel.classList.add('is-drop');
        // 外からのドラッグでも、どの部品に入るかを見出しで示す。
        var ph = dropPartHead(ev.target);
        clearDropMarks();
        if (ph) ph.classList.add('is-drop');
      }
    });
    panel.addEventListener('dragleave', function(ev) {
      var head = ev.target && ev.target.closest ? ev.target.closest('.files-part-head') : null;
      if (head) head.classList.remove('is-drop');
      if (ev.target === panel) panel.classList.remove('is-drop');
    });
    panel.addEventListener('drop', function(ev) {
      var dt = ev.dataTransfer;
      panel.classList.remove('is-drop');
      clearDropMarks();
      if (hasOurs(dt)) {
        var head = ev.target.closest ? ev.target.closest('.files-part-head') : null;
        if (!head) return;
        ev.preventDefault();
        renameToPart(dt.getData(DRAG_TYPE), head.getAttribute('data-part'));
        return;
      }
      if (dt && dt.files && dt.files.length) {
        ev.preventDefault();
        ev.stopPropagation();
        var ph = dropPartHead(ev.target);
        importFiles(dt.files, ph ? ph.getAttribute('data-part') : '');
      }
    });
  }

  // ── Ctrl+P: ファイル名から開く ─────────────────────────────────────
  function openFilePalette() {
    return folderFileNames().then(function(names) {
      if (typeof window.MA.openCommandPalette === 'function') {
        window.MA.openCommandPalette({ group: 'file', files: names });
      }
    });
  }

  function init() {
    panel = $('files-panel');
    if (!panel || !FM()) return;
    menu = document.createElement('div');
    menu.id = 'files-ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.appendChild(menu);

    panel.addEventListener('contextmenu', onContextMenu);
    panel.addEventListener('keydown', onTreeKey);
    menu.addEventListener('keydown', onMenuKey);
    document.addEventListener('mousedown', function(ev) {
      if (menu.hidden) return;
      if (ev.target && menu.contains(ev.target)) return;
      closeMenu(false);
    }, true);
    window.addEventListener('blur', function() { closeMenu(false); });
    window.addEventListener('resize', function() { closeMenu(false); });

    bindDrag();
    markDraggable();
    if (window.MutationObserver) {
      new window.MutationObserver(markDraggable).observe(panel, { childList: true, subtree: true });
    }

    document.addEventListener('keydown', function(ev) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
      if (String(ev.key || '').toLowerCase() !== 'p') return;
      ev.preventDefault();
      openFilePalette();
    });
  }

  return {
    init: init,
    openMenuForRow: openMenuForRow,
    closeMenu: closeMenu,
    runFile: runFile,
    runFolder: runFolder,
    importFiles: importFiles,
    openFilePalette: openFilePalette,
  };
})();
