'use strict';
window.MA = window.MA || {};

// file-menu (UI) — FILES ツリーの右クリック・キーボード・ドラッグ (design 10b)。
//
// ファイル 1 枚に対する操作 (変遷・名前変更・削除…) が
// タブ列・ツール ▾・下端の札に散らばっていた。ツリーの
// ファイルを右クリックすれば全部そこにある、を作る。中身 (どの操作を並べるか・キーの
// 読み替え・名前の組み立て) は src/core/file-menu.js、ここは DOM と結線だけ。
//
// 操作の実体は app.js の既存の道 (openFromFolderByName /
// exportSVG / タブのダブルクリック改名) を
// そのまま呼ぶ。同じ操作を 2 通りに実装しない。
window.MA.fileMenuUi = (function() {
  // サブフォルダの行 (.files-sub-dir / .files-sub-file) は ↑↓ で辿れるが、名前で引く操作 (名前変更・削除・移動) の
  // 相手にはしない (FILE_SEL に入れない)。名前だけで引くと直下の同じ名前の図に当たる (TICKET-roadmap-20261122-0855-2)。
  var ROW_SEL = '.files-sec-head, .files-row, .files-part-file, .files-ro-folder, .files-ro-file, .files-sub-dir, .files-sub-file, #folder-panel .folder-item[data-file-name]';
  var FILE_SEL = '.files-row, .files-part-file, #folder-panel .folder-item[data-file-name]';

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
  // 保存先を決めていない間か (一覧と同じ saveTarget.listDir から決める。TICKET-owner-20261123-2222-1)。
  function _unset() {
    var ST = window.MA.saveTarget;
    if (!ST || !ST.isUnset) return false;
    try { return ST.isUnset(window.MA.autoSave ? window.MA.autoSave.getConfig() : null); } catch (e) { return false; }
  }
  function toast(msg) {
    try { if (window.MA.toast) window.MA.toast.show(msg); } catch (e) {}
    try { if (typeof window.setSaveStatus === 'function') window.setSaveStatus(msg); } catch (e) {}
  }

  // ── 行の読み取り ───────────────────────────────────────────────────────
  function rowOf(el) {
    return el && el.closest ? el.closest(ROW_SEL) : null;
  }

  // 「開いている図」の行のうち、サブフォルダから開いた図 (名前で引くと直下の同じ名前の図に当たる)。
  function isSubDocRow(row) {
    if (!row || !row.classList || !row.classList.contains('files-row')) return false;
    var id = row.getAttribute('data-doc-id');
    var ws = WS();
    if (!id || !ws || !ws.list) return false;
    var docs = ws.list();
    for (var i = 0; i < docs.length; i++) if (String(docs[i].id) === id) return !!docs[i].sub;
    return false;
  }

  // サブフォルダの図の行の居場所 (そのフォルダの絶対パスと保存先からの道)。
  function subWhere(row) {
    return { sub: true, dir: row.getAttribute('data-sub-dir') || '', rel: row.getAttribute('data-sub-rel') || '' };
  }
  // 操作するフォルダ。where が無ければ今の保存先 (直下の図)。
  function dirOf(where) { return (where && where.sub && where.dir) ? where.dir : _dir(); }
  // その図を開いているタブ (居場所込みで引く)。
  function openDocAt(name, where) {
    var ws = WS();
    if (!ws) return null;
    if (where && where.sub) return ws.findOpen ? ws.findOpen({ name: name, sub: true, dir: where.dir }) : null;
    return findDoc(name);
  }

  function isFileRow(row) { return !!(row && row.matches && row.matches(FILE_SEL)) && !isSubDocRow(row); }

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

  // フォルダの種類。保存先・読むだけ (どちらも実在のフォルダ)。
  function folderOf(el) {
    if (!el || !el.closest) return null;
    var target = el.closest('#btn-tab-folder, #top-save-target');
    if (target) return { kind: 'target', el: target };
    // design 10a: 読むだけの節の中のフォルダの行 (と、その中の図の行)。
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
    // サブフォルダの行もディスクから読み直す (移動・名前変更・削除・複製の直後)。
    try { if (window.MA.filesPanel && window.MA.filesPanel.reloadSubTree) window.MA.filesPanel.reloadSubTree(true); } catch (e) {}
  }

  function folderFileNames() {
    var ws = WS();
    if (!ws || !ws.listFiles) return Promise.resolve([]);
    return Promise.resolve(ws.listFiles(_dir())).then(function(names) {
      return (names || []).map(function(n) { return String(n).replace(/\.puml$/i, ''); });
    });
  }

  // ── ファイルの操作 ───────────────────────────────────────────────────

  function renameFile(name, where) {
    var ws = WS();
    if (where && where.sub) {
      // サブフォルダの図は、行の名前がその場で入力欄になる。開いているタブは付け替えの後に新しい名前を指す。
      var srow = treeFileRow(name, where);
      if (srow) return renameInline(srow, name, where);
      return commitRename(name, FM().cleanName(window.prompt(ws.nameRuleText(), name), name), where);
    }
    var d = findDoc(name);
    // 開いている図は、タブのダブルクリックと同じ道を通す (前の名前のファイルの
    // 付け替えまで同じ 1 本で済ませる)。
    if (d) {
      var tab = document.querySelector('#tab-bar .tab[data-doc-id="' + d.id + '"]');
      if (tab) {
        tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        window.setTimeout(refreshLists, 300);
        return Promise.resolve();
      }
    }
    // design 10b: 開いていない図は、ツリーのその行の名前がその場で入力欄になる
    // (エクスプローラの F2 と同じ)。以前はブラウザの入力窓が画面の上端に出て、どの行を直しているか読めなかった。
    var row = treeFileRow(name);
    if (row) return renameInline(row, name);
    var rule = ws && ws.nameRuleText ? ws.nameRuleText() : '新しい名前';
    return commitRename(name, FM().cleanName(window.prompt(rule, name), name));
  }

  // 開いているタブの図をディスクで付け替える間は、そのタブを書かない (前の場所へ書き戻して 2 枚にしない)。
  // 付け替えが済んだらタブの名前・居場所を新しい場所へ移す (未保存の本文はタブに残る)。
  function withHeldDoc(doc, op, after) {
    var hold = window.MA.holdDocWrites;
    var AS = window.MA.autoSave;
    // 打った時点で書き先を決めて待っている自動保存 (debounce 中・書きに出たもの) を先に前の場所へ書き切らせる。
    // 付け替えの後に届くと、前の場所にファイルが作り直されて 2 枚になる。
    var settled = (doc && AS && AS.settle) ? Promise.resolve(AS.settle()).catch(function() {}) : Promise.resolve();
    return settled.then(function() {
      if (doc && hold) hold(doc.id, true);
      return op();
    }).then(function(r) {
      try { if (r && r.ok && doc && after) after(r); } finally { if (doc && hold) hold(doc.id, false); }
      return r;
    }, function(e) { if (doc && hold) hold(doc.id, false); throw e; });
  }

  // 付け替えた先がタブの居場所としてどこか (保存先そのものなら直下の図、その下ならサブフォルダの図)。
  function placeOf(dir) {
    var ws = WS();
    var FP = window.MA.filesPanel;
    var root = (FP && FP.subRoot && FP.subRoot()) || _dir();
    var same = ws && ws.samePath ? ws.samePath(root, dir) : root === dir;
    return same ? { dir: '', sub: false } : { dir: dir, sub: true };
  }

  function commitRename(name, next, where) {
    if (!next) return Promise.resolve(false);
    var doc = (where && where.sub) ? openDocAt(name, where) : null;
    return withHeldDoc(doc, function() {
      return fileOp({ op: 'rename', dir: dirOf(where), name: name, to: next });
    }, function() {
      if (window.MA.retargetDoc) window.MA.retargetDoc(doc.id, { name: next });
    }).then(function(r) {
      if (!r.ok) { toast('名前を変えられませんでした: ' + (r.data.error || r.status)); return false; }
      toast('「' + name + '」を「' + next + '」に変えました');
      refreshLists();
      return true;
    });
  }

  function treeFileRow(name, where) {
    if (!panel) return null;
    var sub = where && where.sub;
    var rows = panel.querySelectorAll(sub ? '.files-sub-file[data-file-name]' : '.files-part-file[data-file-name]');
    var ws = WS();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-file-name') !== name || rows[i].offsetParent === null) continue;
      if (sub && !(ws && ws.samePath && ws.samePath(rows[i].getAttribute('data-sub-dir'), where.dir))) continue;
      return rows[i];
    }
    return null;
  }

  // 行を隠し、同じ位置に名前の入力欄を置く (ボタンの中に入力欄は置けない)。
  // Enter で確定・Esc で取り消し・欄の外を押すと確定。決まりに合わない名前は欄の下に理由を 1 行出し、欄は開いたまま。
  function renameInline(row, name, where) {
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
      return commitRename(name, next, where).then(function(ok) {
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

  function copyFile(name, where) {
    var ws = WS();
    var names = (ws && ws.listFiles) ? Promise.resolve(ws.listFiles(dirOf(where))).then(function(ns) {
      return (ns || []).map(function(n) { return String(n).replace(/\.puml$/i, ''); });
    }) : folderFileNames();
    return names.then(function(names) {
      var to = FM().copyName(name, names);
      return fileOp({ op: 'copy', dir: dirOf(where), name: name, to: to }).then(function(r) {
        if (!r.ok) { toast('複製できませんでした: ' + (r.data.error || r.status)); return; }
        toast('「' + to + '」として複製しました');
        refreshLists();
      });
    });
  }

  function moveFile(name, where) {
    var to = window.prompt('移動先のフォルダ (絶対パス)', '');
    if (to == null || !String(to).trim()) return Promise.resolve();
    return moveToDir(name, String(to).trim(), where);
  }

  // 移動の行き先の一覧から選んだフォルダへ移す。開いているタブはその後、新しい場所を指す
  // (TICKET-roadmap-20261122-0855-3。前は直下の図を移してもタブが前の場所に書き戻し、2 枚になった)。
  function moveToDir(name, dir, where) {
    if (!dir) return Promise.resolve();
    var doc = openDocAt(name, where);
    return withHeldDoc(doc, function() {
      return fileOp({ op: 'move', dir: dirOf(where), name: name, toDir: dir });
    }, function(r) {
      var p = placeOf(r.data.dir || dir);
      if (window.MA.retargetDoc) window.MA.retargetDoc(doc.id, { dir: p.dir, sub: p.sub });
    }).then(function(r) {
      if (!r.ok) { toast('移動できませんでした: ' + (r.data.error || r.status)); return; }
      toast('「' + name + '」を ' + (r.data.dir || dir) + ' へ移しました');
      refreshLists();
    });
  }

  // 行き先の候補: 保存先とその下のフォルダ (図のいるフォルダは除く)、続けて読むだけの節に並ぶ隣の保存フォルダ。
  function moveCandidates(where) {
    var dirs = [];
    var ws = WS();
    var FP = window.MA.filesPanel;
    var here = dirOf(where);
    var root = (FP && FP.subRoot && FP.subRoot()) || '';
    function same(a, b) { return ws && ws.samePath ? ws.samePath(a, b) : a === b; }
    if (root && where && where.sub && !same(root, here)) {
      dirs.push({ path: root, name: (FP.targetLabel ? FP.targetLabel() : '') || '保存先', inTarget: true });
    }
    (FP && FP.subDirs ? FP.subDirs() : []).forEach(function(d) {
      if (!d || !d.path || same(d.path, here)) return;
      dirs.push({ path: d.path, name: d.rel, inTarget: true });
    });
    if (panel) {
      Array.prototype.forEach.call(panel.querySelectorAll('.files-ro-folder[data-ro-dir]'), function(h) {
        dirs.push({ path: h.getAttribute('data-ro-dir') || '', name: h.getAttribute('data-ro-name') || '' });
      });
    }
    return dirs;
  }

  function deleteFile(name, where) {
    var shown = (where && where.sub && where.rel) ? where.rel + '/' + name : name;
    if (!window.confirm('「' + shown + '」を保存フォルダから削除します。過去版は残ります。よろしいですか?')) {
      return Promise.resolve();
    }
    var ws = WS();
    if (!ws || !ws.deleteFile) return Promise.resolve();
    return Promise.resolve(ws.deleteFile(name, dirOf(where))).then(function(r) {
      if (!r || !r.ok) { toast('削除できませんでした: ' + ((r && r.error) || '')); return; }
      toast('「' + name + '」を削除しました (過去版は残っています)');
      refreshLists();
    });
  }

  function reveal(name, where) {
    return fileOp({ op: 'reveal', dir: dirOf(where), name: name }).then(function(r) {
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


  // サブフォルダの図を開く (そのフォルダのファイルとして。固定のタブ)。
  function ensureOpenAt(name, where) {
    if (!(where && where.sub)) return ensureOpen(name);
    if (typeof window.openFromSubFolder !== 'function') return Promise.resolve(false);
    return Promise.resolve(window.openFromSubFolder(name, where.dir, { pin: true }));
  }

  // where: サブフォルダの図なら { sub, dir, rel }。無ければ保存先の直下の図。
  function runFile(action, name, where) {
    switch (action) {
      case 'open': return ensureOpenAt(name, where);
      case 'history':
        return ensureOpenAt(name, where).then(function() {
          if (typeof window.MA.runTool === 'function') window.MA.runTool('tool-versions');
        });
      case 'rename': return renameFile(name, where);
      case 'copy': return copyFile(name, where);
      case 'move': return moveFile(name, where);
      case 'export-svg':
        return ensureOpenAt(name, where).then(function() { if (typeof window.exportSVG === 'function') window.exportSVG(); });
      case 'reveal': return reveal(name, where);
      case 'delete': return deleteFile(name, where);
      default: return Promise.resolve();
    }
  }

  function runMove(it, name, where) {
    if (!it) return Promise.resolve();
    if (it.id === 'move-dir') return moveToDir(name, it.dir, where);
    if (it.id === 'move-path') return moveFile(name, where);
    return Promise.resolve();
  }

  // 「新しいフォルダ」: フォルダの行の下に名前の欄を出し、Enter で実際にフォルダを作る (Esc で取り消し)。
  function newFolder(folder) {
    // 保存先を決めていない間は作らない (作っても画面のどこにも出ない既定のフォルダに増える)。
    if (!(folder && folder.kind === 'sub') && _unset()) return Promise.resolve(false);
    var parentDir = (folder && folder.kind === 'sub') ? folder.dir : ((window.MA.filesPanel && window.MA.filesPanel.subRoot && window.MA.filesPanel.subRoot()) || _dir());
    var anchor = (folder && folder.kind === 'sub') ? folder.el : $('files-target-caret');
    var host = anchor && anchor.closest ? (anchor.closest('.files-target-row') || anchor) : anchor;
    var old = document.getElementById('files-newfolder-box');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.id = 'files-newfolder-box';
    box.className = 'files-rename-box';
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'files-newfolder-input';
    input.className = 'files-rename-input';
    input.value = '';
    input.placeholder = '新しいフォルダの名前';
    input.setAttribute('aria-label', '新しいフォルダの名前 (Enter で作る・Esc で取り消し)');
    var note = document.createElement('div');
    note.id = 'files-newfolder-note';
    note.className = 'files-rename-note';
    note.hidden = true;
    box.appendChild(input);
    box.appendChild(note);
    if (host && host.parentNode) host.parentNode.insertBefore(box, host.nextSibling);
    else if (panel) panel.appendChild(box);
    var done = false;
    function close() {
      if (done) return;
      done = true;
      if (box.parentNode) box.parentNode.removeChild(box);
    }
    function commit() {
      var name = String(input.value || '').trim();
      if (!name) { close(); return; }
      fileOp({ op: 'mkdir', dir: parentDir, to: name }).then(function(r) {
        if (!r.ok) {
          note.textContent = 'フォルダを作れませんでした: ' + (r.data.error || r.status);
          note.hidden = false;
          input.focus();
          return;
        }
        close();
        toast('フォルダ「' + name + '」を作りました');
        var FP = window.MA.filesPanel;
        if (FP && FP.openSubDir && folder && folder.kind === 'sub') FP.openSubDir(folder.rel);
        if (FP && FP.reloadSubTree) FP.reloadSubTree(true);
      });
    }
    input.addEventListener('keydown', function(ev) {
      if (ev.isComposing) return;
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commit(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    });
    input.addEventListener('input', function() { note.hidden = true; });
    input.focus();
    return Promise.resolve(true);
  }

  function runFolder(action, folder) {
    switch (action) {
      case 'new-doc':
        if (folder && folder.kind === 'sub' && typeof window.openNewDocInSubFolder === 'function') {
          window.openNewDocInSubFolder(folder.dir);
          break;
        }
        clickId('btn-tab-new');
        break;
      case 'new-folder': newFolder(folder); break;
      case 'set-target': clickId('top-save-target'); break;
      case 'change-target':
        if (typeof window.openChangeTarget === 'function') window.openChangeTarget();
        break;
      // 「読むだけにする」は何も開かない (名前と違うことをしない)。保存先では押せない (folderItems)。
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
    if (ctx.type === 'move') {
      menuItems = FM().moveTargets(ctx.name, moveCandidates(ctx.where));
    } else {
      menuItems = ctx.type === 'file'
        ? FM().fileItems({ git: _isGit() })
        : FM().folderItems({ kind: ctx.folder.kind, unset: _unset() });
    }
    menu.textContent = '';
    menu.setAttribute('data-menu-kind', ctx.type);
    var title = document.createElement('div');
    title.className = 'files-ctx-title';
    title.textContent = ctx.type === 'move' ? ctx.name + ' の移動先'
      : ctx.type === 'file' ? ctx.name
      : (ctx.folder.kind === 'target' ? '保存先' : ctx.folder.kind === 'sub' ? (ctx.folder.rel || ctx.folder.name) : (ctx.folder.name || '読むだけ'));
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
        // design 10b: 「別のフォルダへ移動…」は閉じずに、
        // 同じメニューの中を行き先の一覧に替える (パスを打たせる前に、見えている行き先を選ばせる)。
        if (c && c.type === 'file' && it.id === 'move') {
          openMenu({ type: 'move', name: c.name, row: c.row, where: c.where },
            parseFloat(menu.style.left) || 4, parseFloat(menu.style.top) || 4);
          return;
        }
        closeMenu(false);
        if (!c) return;
        if (c.type === 'move') runMove(it, c.name, c.where);
        else if (c.type === 'file') runFile(it.id, c.name, c.where);
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
    // TICKET-roadmap-20261122-0855-3: サブフォルダの図・フォルダの行も、直下と同じ語・同じ場所の右クリックを持つ。
    // 名前だけで引かず、そのフォルダ (where) を持って操作する。
    if (row && row.classList && row.classList.contains('files-sub-file')) {
      var sn = row.getAttribute('data-file-name') || '';
      if (sn) return { type: 'file', name: sn, row: row, where: subWhere(row) };
    }
    if (row && row.classList && row.classList.contains('files-sub-dir')) {
      return { type: 'folder', row: row, folder: { kind: 'sub', el: row,
        dir: row.getAttribute('data-sub-dir') || '', rel: row.getAttribute('data-sub-rel') || '',
        name: (row.getAttribute('data-sub-rel') || '').split('/').pop() } };
    }
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
    if (row.classList.contains('files-ro-folder')) return 'folder';
    if (row.classList.contains('files-ro-file')) return 'rofile';
    if (row.classList.contains('files-sub-dir')) return 'folder';
    if (row.classList.contains('files-sub-file')) return 'subfile';
    if (isSubDocRow(row)) return 'rofile';
    return 'section';
  }

  function parentRow(row) {
    var body = row.closest('.files-ro-body');
    if (body) {
      var head = body.previousElementSibling;
      if (head && head.classList.contains('files-ro-folder')) return head;
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
    var act = FM().keyAction(key, (kind === 'rofile' || kind === 'subfile') ? 'file' : kind, expanded);
    var where = kind === 'subfile' ? subWhere(row) : undefined;
    if (!act) return;
    // 読むだけのフォルダの図・サブフォルダの図は、ここでは名前を変えたり消したりしない
    // (名前で引くと別の図に当たる。サブフォルダの中の操作は右クリックの票で足す)。
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
        runFile('rename', fileNameOf(row), where);
        return;
      case 'delete':
        ev.preventDefault();
        runFile('delete', fileNameOf(row), where);
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
  // 外から落とした図は保存先の直下へ元の名前で置く (ファイル名を部品名に付け替えない)。
  function importFiles(list) {
    var items = FM().importables(list);
    if (!items.length) { toast('取り込めるのは .puml / .plantuml / .uml / .txt です'); return Promise.resolve(); }
    var ws = WS();
    if (!ws || !ws.saveToFile) return Promise.resolve();
    var dir = _dir();
    return folderFileNames().then(function(names) {
      var have = {};
      names.forEach(function(n) { have[n] = true; });
      var done = [], skipped = [];
      return items.reduce(function(p, it) {
        var name = it.name;
        return p.then(function() {
          if (have[name] || !ws.isValidName(name)) { skipped.push(name); return null; }
          return it.file.text().then(function(text) {
            return ws.saveToFile({ name: name, dsl: String(text).replace(/^﻿/, '') }, dir);
          }).then(function(ok) { if (ok) { done.push(name); have[name] = true; } else skipped.push(name); });
        });
      }, Promise.resolve()).then(function() {
        var msg = done.length + ' 枚を保存先へ取り込みました';
        if (skipped.length) msg += ' (同じ名前があるなどで取り込まなかった図: ' + skipped.join(', ') + ')';
        toast(msg);
        refreshLists();
      });
    });
  }

  // 外から .puml を落とすと保存先へ取り込む。ツリーの中の図を部品のフォルダへドラッグして
  // 名前の頭を付け替える道は TICKET-owner-20261116-0321-prune で外した (移すのは右クリックの「別のフォルダへ移動…」)。
  function bindDrag() {
    panel.addEventListener('dragover', function(ev) {
      var dt = ev.dataTransfer;
      if (hasFiles(dt)) {
        ev.preventDefault();
        ev.stopPropagation();
        dt.dropEffect = 'copy';
        panel.classList.add('is-drop');
      }
    });
    panel.addEventListener('dragleave', function(ev) {
      if (ev.target === panel) panel.classList.remove('is-drop');
    });
    panel.addEventListener('drop', function(ev) {
      var dt = ev.dataTransfer;
      panel.classList.remove('is-drop');
      if (dt && dt.files && dt.files.length) {
        ev.preventDefault();
        ev.stopPropagation();
        importFiles(dt.files);
      }
    });
  }

  // ── Ctrl+P: ファイル名から開く ─────────────────────────────────────
  function openFilePalette() {
    // 保存先の直下の図に続けて、サブフォルダの図も「フォルダ/名前」で引ける (TICKET-roadmap-20261122-0855-2)。
    var FP = window.MA.filesPanel;
    var subs = Promise.resolve(FP && FP.reloadSubTree ? FP.reloadSubTree(false) : null)
      .then(function() { return FP && FP.subFiles ? FP.subFiles() : []; }, function() { return []; });
    return Promise.all([folderFileNames(), subs]).then(function(both) {
      if (typeof window.MA.openCommandPalette === 'function') {
        window.MA.openCommandPalette({ group: 'file', files: both[0].concat(both[1]) });
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
