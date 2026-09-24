'use strict';
window.MA = window.MA || {};

// git-ui — FILES ツリー下端の GIT 欄と「比較する相手を選ぶ」を結線する (design 10c)。
//
// BLK-human-20260923-1702: 保存先が Git リポジトリのときだけ GIT 欄を出し、
// ブランチ・変更 (M / A / D)・コミットをそこで済ませる。「この図の履歴」の行の「比較」で
// そのコミット時点の図が右の枠 (#senior-pane。読むだけのフォルダと同じ枠) に並ぶ。
// 通信 (取得・送信) とブランチ切替は、ここのボタンを人が押したときだけ呼ぶ。
// 画面の文字と並びは git-panel、右の枠の中身は app.js (window.MA.appGit) が持つ。
window.MA.gitUi = (function() {
  function $(id) { return document.getElementById(id); }
  function GP() { return window.MA.gitPanel; }
  function APP() { return window.MA.appGit; }

  var status = null;      // /git-status の返り値
  var history = [];       // この図のコミット (新しい順)
  var saved = [];         // この図の控え (server の _versions。新しい順、往復の印つき)
  var savedName = '';     // saved がどの図のものか
  var nowLines = null;    // 保存先の今の中身の行数 (空洞化の名指しに使う)
  var refs = null;        // /git-refs
  var lastDir = null;
  var lastName = null;
  var soonTimer = null;
  var pickTab = 'commits';

  function _dir() { var a = APP(); return a ? a.fileDir() : ''; }
  function _name() { var a = APP(); return a ? String(a.activeName() || '') : ''; }
  function _stem(n) { return String(n || '').replace(/\.puml$/i, ''); }

  function _getJson(url) {
    try {
      return window.fetch(url).then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function _post(path, body) {
    try {
      return window.fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(function(r) {
        return r.json().then(function(d) { return { ok: r.ok, data: d || {} }; },
          function() { return { ok: r.ok, data: {} }; });
      }).catch(function(e) { return { ok: false, data: { error: String(e) } }; });
    } catch (e) { return Promise.resolve({ ok: false, data: { error: String(e) } }); }
  }

  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function section() { return document.querySelector('#files-panel [data-files-section="git"]'); }

  // ── 読む ────────────────────────────────────────────────────────────
  function refresh() {
    // 保存先は app の init が決める。それより前 (FILES の骨格だけ出した時点) は読まない。
    if (!APP()) return Promise.resolve(false);
    var dir = _dir();
    lastDir = dir;
    return _getJson('/git-status?dir=' + encodeURIComponent(dir)).then(function(st) {
      if (dir !== _dir()) return false;
      status = st || { repo: false };
      render();
      return loadHistory(true);
    });
  }

  function refreshSoon() {
    if (soonTimer) window.clearTimeout(soonTimer);
    soonTimer = window.setTimeout(function() { soonTimer = null; refresh(); }, 400);
  }

  // BLK-owner-20260924-2157-prune: 保存先が Git のとき「この図の履歴」は GIT 節の 1 つ。
  // server が上書きの手前に取った控え (以前は窓 #vt-modal だけが出していた) も読んで同じ一覧に混ぜる。
  function loadSaved(name) {
    var a = APP();
    var VH = window.MA.versionHistory;
    if (!a || !a.versions || !name) return Promise.resolve({ rows: [], lines: null });
    return Promise.all([
      Promise.resolve(a.versions(name)).catch(function() { return []; }),
      Promise.resolve(a.lineCount ? a.lineCount(name) : null).catch(function() { return null; }),
    ]).then(function(got) {
      var rows = Array.isArray(got[0]) ? got[0] : [];
      if (VH && VH.markRevisits) rows = VH.markRevisits(rows);
      return { rows: rows, lines: typeof got[1] === 'number' ? got[1] : null };
    });
  }

  function loadHistory(force) {
    var gp = GP();
    var name = _stem(_name());
    if (!gp || !gp.visible(status)) { history = []; saved = []; renderHistory(); return Promise.resolve(false); }
    if (!force && name === lastName) return Promise.resolve(true);
    lastName = name;
    if (!name) { history = []; saved = []; renderHistory(); return Promise.resolve(true); }
    var dir = _dir();
    return Promise.all([
      _getJson('/git-log?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(name)),
      loadSaved(name),
    ]).then(function(got) {
      if (name !== _stem(_name())) return false;
      var d = got[0];
      history = (d && Array.isArray(d.commits)) ? d.commits : [];
      saved = got[1].rows;
      savedName = name;
      nowLines = got[1].lines;
      renderHistory();
      return true;
    });
  }

  // コミットと控えを時刻順に 1 本にした並び (画面の行。右の枠の ◀ ▶ はコミットだけを送る = design 10c)。
  function timelineRows() {
    var gp = GP();
    var name = _stem(_name());
    var sv = savedName === name ? saved : [];
    return gp ? gp.timeline(history, sv) : history.slice();
  }

  function onActiveChanged() {
    if (_dir() !== lastDir) { refresh(); return; }
    loadHistory(false);
    applyMarks();
  }

  // ── 描く ────────────────────────────────────────────────────────────
  function render() {
    var gp = GP();
    var sec = section();
    if (!gp || !sec) return;
    var on = gp.visible(status);
    // Git でない保存先では節ごと出さない (空の節を見せない)。
    sec.hidden = !on;
    var fp = window.MA.filesPanel;
    if (fp && fp.setGitCount) fp.setGitCount(gp.countSource(status));
    var head = $('git-branch');
    if (head) head.textContent = gp.headLabel(status);
    renderBranches();
    renderChanges();
    syncCommitBtn();
    applyMarks();
  }

  function renderBranches() {
    var sel = $('git-branch-select');
    if (!sel || !status) return;
    var cur = status.branch || '';
    sel.textContent = '';
    var names = (refs && refs.branches) ? refs.branches.map(function(b) { return b.name; }) : [];
    if (names.indexOf(cur) < 0 && cur) names.unshift(cur);
    names.forEach(function(n) {
      var o = _el('option', '', n);
      o.value = n;
      if (n === cur) o.selected = true;
      sel.appendChild(o);
    });
  }

  function renderChanges() {
    var gp = GP();
    var host = $('git-changes');
    var lab = $('git-changes-head');
    if (!host || !gp) return;
    var list = gp.changes(status);
    if (lab) lab.textContent = gp.changesLabel(status);
    host.textContent = '';
    if (!list.length) {
      host.appendChild(_el('div', 'git-empty', '変更はありません'));
      return;
    }
    list.forEach(function(c) {
      var row = _el('div', 'git-change');
      row.setAttribute('data-git-code', c.code);
      row.setAttribute('data-file', c.file);
      row.title = c.file;
      // design 10c (BLK-builder-20260924-1808-1): ツリーの行と同じ形。名前は拡張子なし、状態字は右。
      row.appendChild(_el('span', 'git-change-name', gp.changeName(c)));
      row.appendChild(_el('span', 'git-code git-code-' + c.code, c.code));
      host.appendChild(row);
    });
  }

  function syncCommitBtn() {
    var gp = GP();
    var btn = $('git-commit');
    var msg = $('git-message');
    if (!btn || !gp) return;
    btn.disabled = !gp.canCommit(status, msg ? msg.value : '');
  }

  function renderHistory() {
    var gp = GP();
    var host = $('git-history');
    if (!host || !gp) return;
    host.textContent = '';
    var lab = $('git-history-head');
    // design 10c (BLK-builder-20260924-1808-1): 見出しはどの図の履歴かを言う。件数は title に回す。
    var name = _stem(_name());
    var sv = savedName === name ? saved : [];
    var rows = timelineRows();
    if (lab) {
      lab.textContent = gp.historyLabel(_name());
      lab.title = lab.textContent + (history.length ? ' (コミット ' + history.length + ' 件)' : '')
        + (sv.length ? ' (控え ' + sv.length + ' 件)' : '');
    }
    // 空洞化した図は、戻す先の控えを名指しして先頭に出す (窓 #vt-modal と同じ名指し)。
    var VH = window.MA.versionHistory;
    var notice = (VH && VH.shrinkNotice && sv.length) ? VH.shrinkNotice(name, sv, nowLines) : null;
    if (notice) {
      var nb = _el('div', 'git-history-shrink');
      nb.setAttribute('data-version-shrink', name);
      var nt = _el('span', 'git-history-shrink-text', notice.text);
      nt.title = notice.detail;
      nb.appendChild(nt);
      var nbtn = _el('button', 'git-history-shrink-restore', notice.restoreLabel);
      nbtn.type = 'button';
      nbtn.setAttribute('data-version-shrink-restore', notice.stamp);
      nbtn.title = notice.detail;
      nbtn.addEventListener('click', function(ev) { ev.stopPropagation(); restoreSaved(name, notice.stamp); });
      nb.appendChild(nbtn);
      host.appendChild(nb);
    }
    if (!rows.length) {
      host.appendChild(_el('div', 'git-empty', gp.emptyHistoryText(!!_name())));
      return;
    }
    var cur = APP() && APP().current();
    rows.forEach(function(c) {
      var row = _el('div', 'git-commit-row' + (c.version ? ' is-version' : ''));
      row.setAttribute('data-hash', c.hash);
      if (c.version) row.setAttribute('data-version-stamp', c.version);
      if (cur && cur.hash === c.hash) row.classList.add('is-compared');
      // design 10c (BLK-builder-20260924-1835-1): 1 行 1 コミット。メッセージ・タグの札・右端に日付。
      // 「比較」は行に手を置いた・キーで来たときに日付の位置へ出る (全部の行に枠を並べない)。
      // 控えの行は「控え」の札を持ち、手を置くと「比較」と「戻す」が出る。
      var hr = gp.historyRow(c);
      row.title = hr.title;
      row.appendChild(_el('span', 'git-commit-msg', hr.message));
      hr.tags.forEach(function(t) { row.appendChild(_el('span', 'git-commit-tag', t)); });
      var end = _el('span', 'git-commit-end');
      end.appendChild(_el('span', 'git-commit-date', hr.date));
      var b = _el('button', 'git-history-compare', '比較');
      b.type = 'button';
      b.setAttribute('data-hash', c.hash);
      b.title = c.version ? 'この控えの図を右の枠に並べる (今の図は上書きしません)' : 'このコミット時点の図を右の枠に並べる';
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        compareWith(c);
      });
      if (c.version) {
        var acts = _el('span', 'git-history-acts');
        acts.appendChild(b);
        var r = _el('button', 'git-history-restore', (VH && VH.restoreLabel) ? VH.restoreLabel() : '戻す');
        r.type = 'button';
        r.setAttribute('data-version-restore', c.version);
        r.setAttribute('data-version-of', name);
        r.title = (VH && VH.restoreTitle) ? VH.restoreTitle(name, c.version) : 'この控えの中身を今の図に戻す';
        r.addEventListener('click', function(ev) {
          ev.stopPropagation();
          restoreSaved(name, c.version);
        });
        acts.appendChild(r);
        end.appendChild(acts);
      } else {
        end.appendChild(b);
      }
      row.appendChild(end);
      host.appendChild(row);
    });
  }

  function compareWith(c) {
    var a = APP();
    if (!a) return Promise.resolve(false);
    return Promise.resolve(a.compare(c, history)).then(function(r) { renderHistory(); return r; });
  }

  // 控えの中身を今の図に戻す (窓 #vt-modal の「戻す」と同じ道具)。戻した保存も控えになるので読み直す。
  function restoreSaved(name, stamp) {
    var a = APP();
    if (!a || !a.restoreVersion) return Promise.resolve(false);
    return Promise.resolve(a.restoreVersion(name, stamp)).then(function(r) {
      return loadHistory(true).then(function() { return r; });
    });
  }

  // ツリーのファイル名の右に M / A / D (未保存 ● とは別)。本文 (textContent) は変えず、
  // data-git の印を CSS で出す (名前を読む呼び出し側を揺らさない)。
  function applyMarks() {
    var gp = GP();
    if (!gp) return;
    var marks = gp.visible(status) ? gp.marksByName(status) : {};
    var rows = document.querySelectorAll('#files-panel .files-row[data-file-name], #files-panel .files-part-file[data-file-name]');
    Array.prototype.forEach.call(rows, function(r) {
      var m = gp.markOf(marks, r.getAttribute('data-file-name'));
      if (m) r.setAttribute('data-git', m);
      else r.removeAttribute('data-git');
    });
  }

  function say(text, bad) {
    var r = $('git-result');
    if (!r) return;
    r.textContent = text || '';
    r.classList.toggle('bad', !!bad);
  }

  // ── 書く (人が押したときだけ) ───────────────────────────────────────
  function commit() {
    var gp = GP();
    var msg = $('git-message');
    var text = msg ? msg.value : '';
    if (!gp || !gp.canCommit(status, text)) return Promise.resolve(false);
    say('コミット中…');
    return _post('/git-commit', { dir: _dir(), message: text }).then(function(res) {
      if (!res.ok) { say(res.data.error || 'コミットできませんでした', true); return false; }
      if (msg) msg.value = '';
      say('コミットしました ' + (res.data.short || ''));
      return refresh().then(function() { return true; });
    });
  }

  function net(op, extra) {
    var labels = { pull: '取得', push: '送信', checkout: 'ブランチ切替' };
    say(labels[op] + '中…');
    var body = { dir: _dir() };
    if (extra) for (var k in extra) body[k] = extra[k];
    return _post('/git-' + op, body).then(function(res) {
      if (!res.ok) { say(labels[op] + 'できませんでした: ' + (res.data.error || ''), true); return false; }
      say(labels[op] + 'しました');
      return loadRefs().then(refresh).then(function() { return true; });
    });
  }

  function loadRefs() {
    return _getJson('/git-refs?dir=' + encodeURIComponent(_dir())).then(function(d) {
      refs = d && d.repo ? d : null;
      renderBranches();
      return refs;
    });
  }

  // ── 比較する相手を選ぶ ──────────────────────────────────────────────
  function openPicker(anchor) {
    var m = $('git-pick-modal');
    if (!m) return Promise.resolve(false);
    m.hidden = false;
    var gp = GP();
    if (anchor && anchor.getBoundingClientRect && gp && gp.pickerPlace) {
      // design 10c (BLK-builder-20260924-1818-1): 窓は必ず画面の中。下に入りきらなければボタンの上へ開き、
      // 入る高さまで縮めて一覧をスクロールさせる (FILES 下端の「相手を選ぶ…」から下へ開くと切れていた)。
      var p = gp.pickerPlace(anchor.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      m.style.top = p.top != null ? p.top + 'px' : 'auto';
      m.style.bottom = p.bottom != null ? p.bottom + 'px' : 'auto';
      m.style.left = p.left + 'px';
      m.style.maxHeight = p.maxHeight + 'px';
    } else {
      m.style.top = '80px';
      m.style.bottom = 'auto';
      m.style.maxHeight = '';
      m.style.left = Math.max(8, Math.round(window.innerWidth / 2 - 180)) + 'px';
    }
    var f = $('git-pick-filter');
    if (f) f.value = '';
    return Promise.all([loadHistory(true), loadRefs()]).then(function() {
      renderPicker();
      if (f) f.focus();
      return true;
    });
  }

  function closePicker() {
    var m = $('git-pick-modal');
    if (m) m.hidden = true;
  }

  function _pickRow(title, meta, stat, onPick, hash) {
    var b = _el('button', 'git-pick-row');
    b.type = 'button';
    if (hash != null) b.setAttribute('data-hash', hash);
    var body = _el('span', 'git-pick-body');
    body.appendChild(_el('span', 'git-pick-title', title));
    if (meta) body.appendChild(_el('span', 'git-pick-meta', meta));
    b.appendChild(body);
    if (stat) b.appendChild(_el('span', 'git-pick-stat', stat));
    b.addEventListener('click', function() { closePicker(); onPick(); });
    return b;
  }

  function renderPicker() {
    var gp = GP();
    var list = $('git-pick-list');
    var tabs = $('git-pick-tabs');
    var title = $('git-pick-file');
    if (!gp || !list) return;
    if (title) title.textContent = _stem(_name());
    if (tabs) {
      tabs.textContent = '';
      gp.pickTabs().forEach(function(t) {
        var b = _el('button', 'git-pick-tab', t.label);
        b.type = 'button';
        b.id = 'git-pick-tab-' + t.id;
        b.setAttribute('aria-pressed', t.id === pickTab ? 'true' : 'false');
        b.addEventListener('click', function() { pickTab = t.id; renderPicker(); });
        tabs.appendChild(b);
      });
    }
    var q = ($('git-pick-filter') || {}).value || '';
    list.textContent = '';
    if (pickTab === 'folder') {
      list.appendChild(_pickRow('読むだけのフォルダの同じ図', '別の保存フォルダの図を右に並べます', '',
        function() { var a = APP(); if (a) a.openFolderCompare(); }));
      return;
    }
    if (pickTab === 'refs') {
      gp.refRows(refs, q).forEach(function(r) {
        list.appendChild(_pickRow((r.kind === 'tag' ? 'タグ ' : 'ブランチ ') + r.name, r.short + (r.current ? ' · 今のブランチ' : ''), '',
          function() { compareWith({ hash: r.short, short: r.short, message: r.name }); }, r.short));
      });
      if (!list.firstChild) list.appendChild(_el('div', 'git-empty', '当たるブランチ・タグがありません'));
      return;
    }
    list.appendChild(_pickRow('作業中（未コミット）', '今の編集内容', '',
      function() { compareWith({ hash: '' }); }, ''));
    gp.filterCommits(history, q).forEach(function(c) {
      list.appendChild(_pickRow(c.message, gp.commitMeta(c), gp.commitStat(c),
        function() { compareWith(c); }, c.hash));
    });
  }

  // ── ツール ▾ の「この図の変遷」は、Git 管理下ではこの履歴を開く ─────────
  function showHistory() {
    var fp = window.MA.filesPanel;
    if (fp) { fp.setOpen(true); fp.setSec('git', true); }
    var h = $('git-history-head');
    if (h && h.scrollIntoView) h.scrollIntoView({ block: 'nearest' });
    return loadHistory(true);
  }

  function isRepo() { var gp = GP(); return !!(gp && gp.visible(status)); }

  // ── 初期化 ───────────────────────────────────────────────────────────
  function init() {
    var sec = section();
    if (!sec) return;
    sec.hidden = true;   // 読めるまでは出さない (Git でない保存先で空の節が一瞬見えない)
    var body = $('files-body-git');
    var GPm = GP();
    var scope = $('git-scope');
    if (scope && GPm) scope.textContent = GPm.SCOPE_NOTE;

    var rf = $('git-refresh');
    if (rf) rf.addEventListener('click', function(ev) { ev.stopPropagation(); loadRefs().then(refresh); });
    var msg = $('git-message');
    if (msg) {
      msg.addEventListener('input', syncCommitBtn);
      msg.addEventListener('keydown', function(ev) {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); commit(); }
      });
    }
    var cb = $('git-commit');
    if (cb) cb.addEventListener('click', commit);
    var pull = $('git-pull');
    if (pull) pull.addEventListener('click', function() { net('pull'); });
    var push = $('git-push');
    if (push) push.addEventListener('click', function() { net('push'); });
    var sel = $('git-branch-select');
    if (sel) {
      sel.addEventListener('focus', function() { loadRefs(); });
      sel.addEventListener('change', function() {
        if (status && sel.value && sel.value !== status.branch) net('checkout', { branch: sel.value });
      });
    }
    var po = $('git-pick-open');
    if (po) po.addEventListener('click', function() { openPicker(po); });
    var pc = $('git-pick-close');
    if (pc) pc.addEventListener('click', closePicker);
    var pf = $('git-pick-filter');
    if (pf) pf.addEventListener('input', renderPicker);
    document.addEventListener('keydown', function(ev) {
      var m = $('git-pick-modal');
      if (ev.key === 'Escape' && m && !m.hidden) { ev.preventDefault(); closePicker(); }
    });
    // 「この図の変遷」は Git 管理下では履歴に置き換える (入口は残す)。
    var vt = $('btn-tab-versions');
    if (vt) {
      vt.addEventListener('click', function(ev) {
        if (!isRepo()) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        showHistory();
      }, true);
    }
    // 別のアプリで commit / checkout したときに追い付く (通信はしない。ローカルを読むだけ)。
    window.addEventListener('focus', function() { if (lastDir !== null) refreshSoon(); });
    if (body) body.setAttribute('data-git-ready', '1');
    refresh();
  }

  return {
    init: init,
    refresh: refresh,
    refreshSoon: refreshSoon,
    onActiveChanged: onActiveChanged,
    applyMarks: applyMarks,
    openPicker: openPicker,
    closePicker: closePicker,
    showHistory: showHistory,
    isRepo: isRepo,
    commit: commit,
  };
})();
