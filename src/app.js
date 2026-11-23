'use strict';

var modules = {};
function _registerModules() {
  var mm = window.MA.modules || {};
  var keys = Object.keys(mm);
  for (var i = 0; i < keys.length; i++) {
    var mod = mm[keys[i]];
    var key = (mod && mod.type) ? mod.type : keys[i];
    _wrapParseWithExpansion(mod);
    if (!modules[key]) {
      modules[key] = mod;
    } else {
      for (var prop in mod) {
        if (Object.prototype.hasOwnProperty.call(mod, prop) && !(prop in modules[key])) {
          modules[key][prop] = mod[prop];
        }
      }
    }
  }
}

// どの図種のパーサも、PlantUML のプリプロセッサが展開した行
// (src/core/preproc-expand.js。マクロを呼んだ行が生んだ行はその行番号) を読む。展開が手元に無ければ元の読み方。
function _wrapParseWithExpansion(mod) {
  if (!mod || typeof mod.parse !== 'function' || mod.parse.__puaExpand) return;
  var orig = mod.parse;
  var wrapped = function(text) {
    var PE = window.MA.preprocExpand;
    var self = this;
    var run = function(t) { return orig.call(self, t); };
    return PE ? PE.parseWith(run, text) : run(text);
  };
  wrapped.__puaExpand = true;
  mod.parse = wrapped;
}

// 描画が返ったとき、展開が届いていれば今の本文を展開後の行で読み直し、下端の件数もそれで数え直す
// (当て方と帯はこの読みで数える)。右パネルは組み直さない (打ちかけの欄を消さない)。
function _adoptExpansion() {
  var PE = window.MA.preprocExpand;
  if (!PE || !currentModule || !PE.has(mmdText)) return;
  if (currentParsed && currentParsed.meta && currentParsed.meta.expanded && currentParsed.meta.expandedFor === mmdText) return;
  try { currentParsed = currentModule.parse(mmdText); } catch (e) { return; }
  if (currentParsed && currentParsed.meta && currentParsed.meta.expanded) currentParsed.meta.expandedFor = mmdText;
  try {
    statusInfoEl.textContent = window.MA.outline.countLabel(
      window.MA.outline.build(PE.splicedText(mmdText) || mmdText).counts, currentDiagramType);
  } catch (e) {}
}

// Feature #10: online モードの外部送信警告バナー表示/非表示
function updateOnlineWarning() {
  var warnEl = document.getElementById('online-warning');
  var modeEl = document.getElementById('render-mode');
  if (!warnEl || !modeEl) return;
  warnEl.style.display = (modeEl.value === 'online') ? 'block' : 'none';
}

var editorEl, previewSvgEl, propsEl, statusParseEl, statusInfoEl, renderStatusEl, lineNumbersEl, zoomDisplayEl;
// design 1a: 上部バーに残す「編集中のファイル名」と「{モード} · {所要ms}」
var topFileNameEl, topRenderStatusEl;

// updateTopFileName: アクティブなタブの名前を上部バーに映す。
// タブの追加・切替・名前変更のたびに renderTabs() から呼ばれる。
function updateTopFileName() {
  if (!topFileNameEl || !window.MA.topStatus) return;
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  var name = window.MA.topStatus.fileName(doc ? doc.name : '');
  topFileNameEl.textContent = name;
  topFileNameEl.title = name;
  updateTopSaveTarget();
}

// 保存先はサーバ側 (.assist-prefs.json) に覚えられて
// いるのに、画面のどこにも出ないので「設定済みであること」に気づけず、図種を
// 変えるたびに ⚙設定 → ファイル → パス再入力 → OK を習慣で打ち直していた。
// 上部バーのファイル名の隣に保存先を常時出し、押せば設定へ入れるようにする。
// チップではなくパンくずの左半分。
// フォルダ名を押すと保存先を変えられる。絵文字は使わず文字だけで出す。
function updateTopSaveTarget() {
  var el = document.getElementById('top-save-target');
  var ST = window.MA.saveTarget;
  if (!el || !ST) return;
  var doc = null;
  try { doc = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { doc = null; }
  // FILES ツリーの保存先の行は今の保存先。
  var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
  var bc = ST.breadcrumb(cfg, doc, '(無題)');
  el.textContent = bc.folder;
  el.title = bc.folderTitle;
  el.setAttribute('data-mode', bc.mode);
  if (bc.configured) el.classList.add('configured');
  else el.classList.remove('configured');
  // 上部バーのパンくずはそのタブのファイルの場所 (保存先を替える前に開いたタブは開いたフォルダ)。
  updateTopCrumbs(ST.breadcrumb(_cfgForDoc(doc), doc, '(無題)'), doc);
  updateTopSaveButton();
}

// design 10a / 9a: 上部バー左のパンくずのフォルダの段。
// 「{保存先} / 」を #top-file-name の左に出す (ファイル名から部品を読んで段を足すことはしない)。
// 段を押すと FILES ツリーでそのフォルダを見せる (保存先を変える入口はツリーの保存先の行)。
function updateTopCrumbs(bc, doc) {
  var host = document.getElementById('top-crumbs');
  var TS = window.MA.topStatus;
  if (!host || !TS || !TS.crumbs) return;
  var folder = (bc && bc.mode === 'file') ? bc.folder : '';
  // サブフォルダの図は、保存先の段の後にそこからの道を 1 段ずつ (TICKET-roadmap-20261122-0855-2)。
  var subRel = _docSubRel(doc);
  if (subRel && window.MA.saveTarget) {
    var cfg0 = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    folder = window.MA.saveTarget.breadcrumb(cfg0, doc, '(無題)').folder;
  }
  var list = TS.crumbs(folder, subRel ? subRel.split('/') : null);
  // 保存先を替える前に開いたタブは、そのファイルのフォルダを段に出し、今の保存先ではないことを添える。
  var held = !!(folder && doc && !subRel && _docHeldElsewhere(doc));
  if (held && list[0]) {
    list[0].held = true;
    list[0].title = _docDir(doc) + ' (このタブのファイルの場所。保存先を替える前に開いたので、このタブはここに保存します。今の保存先は '
      + _wsFileDir() + ')';
  }
  var key = JSON.stringify(list);
  if (host.getAttribute('data-key') === key) return;
  host.setAttribute('data-key', key);
  host.textContent = '';
  list.forEach(function(c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'top-crumb';
    b.setAttribute('data-crumb', c.kind);
    if (c.held) b.setAttribute('data-held', '1');
    b.textContent = c.label;
    b.title = c.title;
    b.addEventListener('click', function() {
      if (window.MA.filesPanel && window.MA.filesPanel.reveal) window.MA.filesPanel.reveal(c.kind);
    });
    host.appendChild(b);
    var sep = document.createElement('span');
    sep.className = 'top-crumb-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '/';
    host.appendChild(sep);
  });
  host.hidden = !list.length;
}

// 保存だけがボタンを持たず、Ctrl+K で「ファイルを保存」と
// 打つ経路しか無かった。文言は保存先によって変わる (フォルダ運用なら上書き保存)。
function updateTopSaveButton() {
  var btn = document.getElementById('top-save');
  var ST = window.MA.saveTarget;
  if (!btn || !ST || !ST.saveButton) return;
  var doc = null;
  try { doc = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { doc = null; }
  var cfg = _cfgForDoc(doc);   // 書き先はそのタブのフォルダ
  // design 9a: 未保存のときだけ ● とキーを出し、保存済みは淡色の「保存済み」に落とす。
  // 保存の有無は下端の札と同じ判定 (前回保存版といまの中身) を使い、2 つの言い分を作らない。
  // 判定はタブの ●/○ と同じ 1 つ (docSaveStatus)。
  // live-diff の行比べで別に判定すると、タブは ● なのに「保存済み」、自動保存の後も「● 保存」が残った。
  var dirty = false;
  try {
    var st = doc ? docSaveStatus(doc.id) : 'same';
    dirty = st === 'changed' || (st === 'new' && !!(mmdText && mmdText.trim()));
  } catch (e) { dirty = false; }
  var fallback = (currentParsed && currentParsed.meta && currentParsed.meta.title) || '';
  var info = ST.saveState ? ST.saveState(cfg, doc, dirty, fallback)
                          : ST.saveButton(cfg, doc, fallback);
  btn.textContent = info.text;
  btn.title = info.title;
  btn.setAttribute('data-mode', ST.decide(cfg, doc, fallback).mode);
  if (info.state) btn.setAttribute('data-save-state', info.state);
  // キーは文字を消してから足し直す (textContent の代入で子ごと消えるため)。
  var keyEl = document.createElement('span');
  keyEl.id = 'top-save-key';
  keyEl.textContent = info.key || '';
  btn.appendChild(keyEl);
}

// ── Ctrl+Z の行き先 (TICKET-owner-20261115-1900-1) ──────────────────
// 「末尾に追加」で足した直後、欄にまだ打っていない間の Ctrl+Z / Ctrl+Y は図の履歴へ。判定は undo-route。
var _undoRouteState = window.MA.undoRoute ? window.MA.undoRoute.create() : null;

// 右パネル (追加フォーム・図の設定) の中か。
function _inPropsPane(el) {
  var pane = document.getElementById('props-pane');
  return !!(pane && el && el !== document.body && pane.contains(el));
}

// ── 開いたファイルの錠 ──────────────────
// 一覧から開いて眺めるだけの回 (本文が開いたときのまま) は書き戻さない。確認の窓は出さない。

// 開いて作った / 読み直したタブに、開いたときの本文を憶えさせる。
// 既に同じ名前のタブが開いていれば、それは「今この瞬間に開いたファイル」ではないので憶えない。
function openExistingFile(spec, opts) {
  var WS = window.MA.workspace;
  var already = false;
  try { already = !!(WS.findByName && WS.findByName(WS.sanitizeName(spec.name || ''))); } catch (e) {}
  // 保存先ツリーの行の 1 回押しは仮のタブで開く (次の 1 回押しで入れ替わる)。
  var doc = (opts && opts.preview && WS.openPreview) ? WS.openPreview(spec) : WS.openOrActivate(spec);
  if (!already) markOpenedSource(doc);
  return doc;
}

// 一覧から開いたファイルは、開いたときの本文を憶える。読むだけの回 (本文が開いたときのまま) は
// 書き戻さない。本文を変えたら、ほかの図と同じく Ctrl+S と自動保存でそのファイルに書く。
function markOpenedSource(doc) {
  if (!doc || !window.MA.sourceLock) return;
  try { window.MA.sourceLock.mark(doc.id, doc.name, doc.dsl); } catch (e) {}
}

// updateTopRenderStatus: レンダリングの相と所要時間を上部バーに映す。
function updateTopRenderStatus(phase, ms) {
  if (!topRenderStatusEl || !window.MA.topStatus) return;
  var modeEl = document.getElementById('render-mode');
  var mode = (modeEl && modeEl.value) || 'local';
  topRenderStatusEl.textContent = window.MA.topStatus.render({ mode: mode, phase: phase, ms: ms });
  if (window.MA.topStatus.isError(phase)) topRenderStatusEl.classList.add('error');
  else topRenderStatusEl.classList.remove('error');
}
var mmdText = '';
// エディタに今入っている図 (タブ) の id。元に戻す履歴の引き分けに使う。
var _historyDocId = null;
var currentDiagramType = 'plantuml-sequence';
var currentModule = null;
var currentParsed = { meta: {}, elements: [], relations: [], groups: [] };
var suppressSync = false;
// 図種レールのハイライトを現在の図種に合わせ直す。setupDiagramRail が実体を入れる
// (レールが無い環境でも呼び出し側が分岐を書かずに済むよう既定は no-op)。
var syncRail = function() {};
// キャンバス上のズーム帯を現在の倍率・図種に合わせ直す。setupZoomHud が実体を入れる。
var syncZoomHud = function() {};
// 状態バーの 💾 を引き直す。setupAutoSaveStatus が実体を入れる
// (保存が届いた先は図を替えても言い続ける)。
var renderAutoSaveStatus = function() {};
// design 5a: エディタの見た目と「図クリック→該当行へ移動」の指定。設定モーダルの
// 「保存」と起動時の applyEditorPrefs が唯一の書き手で、選択のたびにここを読む
// (localStorage を選択ごとに読み直さないため)。
var currentEditorPrefs = null;
// design 5a: Tab / Shift+Tab が入れ外しする単位。設定を開かない回でも効くよう、
// 保存済みの指定は init で currentEditorPrefs に載る。
function currentIndentId() {
  var EI = window.MA.editorIndent;
  if (!EI) return '2';
  return EI.normalize(currentEditorPrefs && currentEditorPrefs.indent);
}
// design 5a: 描画に失敗したとき、直前の図を残してエラーを重ねるか。
var currentErrorOverlay = true;
var syncStateTable = function() {};
var renderTimer = null;
var RENDER_DEBOUNCE_MS = 150;
// design 5a: 設定「レンダリング」に出す材料。
// _renderEnv    … GET /env の答え (Java の検出結果)。開くまで取りに行かない。
// _renderTimings… モードごとの直近の実測 ms。どちらが速いかを設定画面で比べる。
var _renderEnv = null;
var _renderEnvLoading = false;
var _renderTimings = {};
var zoom = 1.0;
var isFirstRender = true;
// renderGen monotonically increases for each renderSvg() invocation. Stale
// fetch responses (request older than the latest) are discarded so a slow
// older render cannot overwrite the SVG produced by a newer request — which
// previously caused newly added shapes to disappear from the preview when
// the user issued multiple edits in quick succession.
var renderGen = 0;

function moduleHas(cap) {
  return !!(currentModule && currentModule.capabilities && currentModule.capabilities[cap]);
}

function init() {
  editorEl = document.getElementById('editor');
  previewSvgEl = document.getElementById('preview-svg');
  propsEl = document.getElementById('props-content');
  // 右パネルの手で組んだ見出しも欄に結び付ける (描き直すたび。TICKET-owner-20261116-1221-1)
  if (propsEl && window.MA.properties && window.MA.properties.watchFieldLabels) window.MA.properties.watchFieldLabels(propsEl);
  statusParseEl = document.getElementById('status-parse');
  statusInfoEl = document.getElementById('status-info');
  renderStatusEl = document.getElementById('render-status');
  lineNumbersEl = document.getElementById('line-numbers');
  zoomDisplayEl = document.getElementById('zoom-display');
  // design 5c: 挿入位置を選んでいる間の DSL 行マーカーと右パネルの案内
  if (window.MA.insertMarker) {
    window.MA.insertMarker.init({
      wrap: document.getElementById('editor-wrap'),
      editor: editorEl,
      gutter: lineNumbersEl,
      marker: document.getElementById('insert-marker'),
      hint: document.getElementById('props-insert-hint'),
    });
  }
  // design 1a: 上部バーに残す 2 つの表示
  topFileNameEl = document.getElementById('top-file-name');
  topRenderStatusEl = document.getElementById('top-render-status');
  updateTopRenderStatus('idle');
  // モードを変えたくなるのは状態表示を見た
  // ときなので、その表示自体を設定の「レンダリング」タブへの入口にする。
  if (topRenderStatusEl) {
    topRenderStatusEl.addEventListener('click', function() {
      if (window.MA.openSettingsTab) window.MA.openSettingsTab('render');
    });
  }

  _registerModules();

  var savedMode = localStorage.getItem('plantuml-render-mode') || 'local';
  document.getElementById('render-mode').value = savedMode;
  updateOnlineWarning();

  // Use the last-active diagram-type if persisted, otherwise default to
  // sequence. This pairs with the autoSave per-type restore below so a
  // crash-then-reload lands on the same type the user was working in.
  var lastDiagramType = (function() {
    try { return window.localStorage.getItem('plantuml-diagram-type') || 'plantuml-sequence'; }
    catch (e) { return 'plantuml-sequence'; }
  })();
  if (!modules[lastDiagramType]) lastDiagramType = 'plantuml-sequence';
  currentDiagramType = lastDiagramType;
  currentModule = modules[lastDiagramType];
  mmdText = currentModule.template();
  editorEl.value = mmdText;
  // Keep the <select> in sync with the active type.
  var dtSelect = document.getElementById('diagram-type');
  if (dtSelect) dtSelect.value = lastDiagramType;

  // ── Workspace: 複数の図をタブで同時に開く ───────────────────────────
  // 保存済みのワークスペースがあればそれを復元する。無ければ今の
  // (種類ごとの) 1 枚を最初のタブとして採用する。復元できた場合は
  // 従来の「前回の DSL を復元しますか？」は出さない — タブが既に
  // 前回の内容を持っているため。
  var hadWorkspace = false;
  try { hadWorkspace = window.localStorage.getItem('plantuml-workspace') != null; } catch (e) {}
  // 復元モード none は「起動時に前回の内容を持ち越さない」設定なので、
  // タブ構成も持ち越さずまっさらな 1 枚から始める。
  if (window.MA.workspace && window.MA.autoSave) {
    try {
      var asCfg = window.MA.autoSave.getConfig();
      if (!asCfg.enabled || asCfg.restoreMode === 'none') {
        window.MA.workspace.reset();
        hadWorkspace = false;
      }
    } catch (e) {}
  }
  if (window.MA.workspace) {
    var active = window.MA.workspace.init({
      name: 'diagram1',
      diagramType: currentDiagramType,
      dsl: mmdText,
    });
    if (active) {
      if (modules[active.diagramType]) {
        currentDiagramType = active.diagramType;
        currentModule = modules[active.diagramType];
        if (dtSelect) dtSelect.value = currentDiagramType;
      }
      mmdText = active.dsl;
      editorEl.value = mmdText;
    }
  }

  // ── Auto-save: boot-time restore ────────────────────────────────────
  // Per spec: 'auto' silently loads, 'confirm' asks via native dialog,
  // 'none' leaves the template alone. Skip restore if the saved DSL is
  // identical to the current template (nothing meaningful to recover).
  // The init() call may return a Promise when the file backend needs to
  // hydrate localStorage from disk first; we wait for it before doing
  // the restore lookup so the disk-resident DSL is in localStorage.
  (function bootRestore() {
    var as = window.MA.autoSave;
    if (!as || !as.isAvailable()) return;
    // ワークスペースを復元したなら各タブが自分の DSL を持っている。
    if (hadWorkspace) return;
    function doRestore() {
      var cfg = as.getConfig();
      if (!cfg.enabled) return;
      // 保存フォルダに、開いているタブと同じ名前の図が
      // あるなら、そのタブの中身はその図そのものでなければならない。ここで図種の
      // 下書き (plantuml-sequence 等の鍵) を当てると、diagram1 のタブに別の図の
      // 下書きが入り、そのまま保存すると diagram1.puml がその下書きで潰れる。
      // ディスクの本文は init() が localStorage に写しているので、図名で引ける。
      if (cfg.backend === 'file' && window.MA.workspace) {
        var act = null;
        try { act = window.MA.workspace.getActive(); } catch (e) { act = null; }
        var onDisk = (act && act.name) ? as.restoreFor(act.name) : null;
        if (onDisk != null && _isUntouchedDoc(act)) {
          // 見本のままのタブに、同じ名前のディスクの本文を載せるだけ。利用者の
          // 打った中身は 1 文字も無いので、聞かずに載せてよい (聞いて「いいえ」だと
          // 見本のまま開いたことになり、そのあとの保存でディスクが潰れる)。
          mmdText = onDisk;
          suppressSync = true;
          editorEl.value = mmdText;
          suppressSync = false;
          var det = window.MA.workspace.detectType(mmdText);
          if (det && modules[det]) {
            currentDiagramType = det;
            currentModule = modules[det];
            if (dtSelect) dtSelect.value = det;
          }
          try { window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType }); } catch (e) {}
          return;
        }
      }
      var saved = as.restoreFor(lastDiagramType);
      if (saved == null || saved === mmdText) return;
      var apply = false;
      if (cfg.restoreMode === 'auto') apply = true;
      else if (cfg.restoreMode === 'confirm') apply = window.confirm('前回編集中の DSL が見つかりました。 復元しますか？');
      if (apply) {
        mmdText = saved;
        suppressSync = true;
        editorEl.value = mmdText;
        suppressSync = false;
        // Trigger a refresh now that mmdText changed — the rest of init
        // will not re-run but scheduleRefresh below uses the new mmdText.
      }
    }
    // server から保存先を引き継いだ直後にも上部バーを
    // 引き直す。ここを通さないと「覚えられているのに画面に出ない」が残る。
    function doRestoreAndSync() { doRestore(); updateTopSaveTarget(); }
    var p = as.init();
    if (p && typeof p.then === 'function') {
      p.then(doRestoreAndSync, doRestoreAndSync);
    } else {
      doRestoreAndSync();
    }
  })();

  // 上部バーの Import ▾。入れる・出すを対で並べる。
  // 中身は既にある入口 (.puml を開く / クリップボード / 保存フォルダの一覧) を叩くだけで、
  // 新しい読み込み経路は作らない。
  (function setupImportMenu() {
    var btn = document.getElementById('btn-import');
    var menu = document.getElementById('import-menu');
    if (!btn || !menu) return;
    function close() {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) close();
    });
    // Esc は Export ▾ と同じく document で受ける。マウスで開いた直後は手が
    // #btn-import にあり、メニューの中の keydown だけでは Esc が届かないため。
    // 図のドラッグ中の Esc (並び替えの中断) を先に通すので、そのときは何もしない。
    document.addEventListener('keydown', function(ev) {
      if (ev.key !== 'Escape' || ev.isComposing) return;
      if (dragState && dragState.dragging) return;
      if (!menu.classList.contains('open')) return;
      ev.preventDefault();
      close();
      btn.focus();
    });
    [['imp-file', 'btn-open-file'], ['imp-folder', 'btn-tab-folder']].forEach(function(p) {
      var item = document.getElementById(p[0]);
      if (!item) return;
      item.addEventListener('click', function() {
        close();
        if (p[1] === 'btn-tab-folder') { _ensureFolderListOpen(); return; }
        var target = document.getElementById(p[1]);
        if (target) target.click();
      });
    });
    var clip = document.getElementById('imp-clipboard');
    if (clip) clip.addEventListener('click', function() {
      close();
      openFromClipboard();
    });
    // 保存先を決める・替える窓 (FILES の右クリック・Ctrl+K・⚙ 設定と同じ 1 つ)。
    var tgt = document.getElementById('imp-target');
    if (tgt) tgt.addEventListener('click', function() {
      close();
      openChangeTarget();
    });
  })();

  // 上部バーのパンくずのフォルダ名。押したら設定を開く (保存先を変えられる)。
  (function setupTopSaveTarget() {
    var el = document.getElementById('top-save-target');
    if (!el) return;
    el.addEventListener('click', function() {
      var btn = document.getElementById('btn-config');
      if (btn) btn.click();
    });
    // 保存先の隣の [💾 保存]。押す先は Ctrl+K の
    // 「ファイルを保存」と同じ 1 本 (#btn-save) にして、経路を 2 つに分けない。
    var save = document.getElementById('top-save');
    if (save) save.addEventListener('click', function() {
      var btn = document.getElementById('btn-save');
      if (btn) btn.click();
    });
    updateTopSaveTarget();
  })();

  editorEl.addEventListener('input', function() {
    if (suppressSync) return;
    window.MA.history.pushHistory();
    mmdText = editorEl.value;
    clearJumpBand();   // 本文を打つと行がずれるので、図で選んだ行の帯は下ろす
    updateLineNumbers();
    // タブの本文 (workspace)・自動保存・差分の印・指摘の引き直しは scheduleRefresh の
    // syncEditedText が、フォームや窓からの書き換えと同じ 1 本の経路で行う。
    scheduleRefresh();
  });

  editorEl.addEventListener('scroll', function() {
    if (lineNumbersEl) lineNumbersEl.scrollTop = editorEl.scrollTop;
    // design 5c: 挿入先マーカーはエディタの座標で置くので、追随させる。
    if (window.MA.insertMarker) window.MA.insertMarker.sync();
    syncJumpBand();   // 図で選んだ行の帯も追随させる
  });

  // ── 選ぶ前の対応表示 (peek) ──
  // 遷移ラベルを直すとき、いちばん手間なのは「どの矢印が DSL の何行目か」を
  // 目で探す段階だった。overlay の rect は data-line を持っているので、
  // DSL 側のキャレット行と、行番号にマウスが乗った行を、そのまま図形に映す。
  setupLinePeek();

  initPaneResizers();

  // ── Hover 挿入ガイド ──
  var previewContainerForHover = document.getElementById('preview-container');
  var hoverEl = document.getElementById('hover-layer');
  var overlayElForHover = document.getElementById('overlay-layer');

  function clearHoverGuide() {
    if (!hoverEl) return;
    while (hoverEl.firstChild) hoverEl.removeChild(hoverEl.firstChild);
  }

  function drawHoverGuide(y, rectX, rectWidth, labelText) {
    clearHoverGuide();
    if (!overlayElForHover) return;
    var w = parseFloat(overlayElForHover.getAttribute('width')) || 800;
    var h = parseFloat(overlayElForHover.getAttribute('height')) || 400;
    var PADDING = 10;
    // When rectX/rectWidth are provided, constrain the guide span to the
    // resolved rect's column (with padding). Otherwise span the full overlay.
    var x1 = (typeof rectX === 'number' && typeof rectWidth === 'number')
      ? Math.max(0, rectX - PADDING)
      : 0;
    var x2 = (typeof rectX === 'number' && typeof rectWidth === 'number')
      ? Math.min(w, rectX + rectWidth + PADDING)
      : w;
    var lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('x1', x1);
    lineEl.setAttribute('y1', y);
    lineEl.setAttribute('x2', x2);
    lineEl.setAttribute('y2', y);
    lineEl.setAttribute('class', 'hover-guide');
    hoverEl.appendChild(lineEl);
    var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x1 + 4);
    text.setAttribute('y', y - 3);
    text.setAttribute('class', 'hover-label');
    // ガイド線にも「DSL の何行目に入るか」を出す。
    // 解決できなかった場合 (labelText 無し) は従来どおりの汎用文言。
    text.textContent = labelText || '+ ここに挿入';
    hoverEl.appendChild(text);
    hoverEl.setAttribute('width', overlayElForHover.getAttribute('width') || w);
    hoverEl.setAttribute('height', overlayElForHover.getAttribute('height') || h);
    var vb = overlayElForHover.getAttribute('viewBox');
    if (vb) hoverEl.setAttribute('viewBox', vb);
    hoverEl.style.transform = overlayElForHover.style.transform;
  }

  // ガイド線のラベル。挿入先の DSL 行番号を module に計算させる (module が
  // insertTargetLine を持たない場合は汎用文言に落ちる)。
  // プレビューの当たり判定が決めた「帯の内側 / 外側」。
  // 押した点が帯の矩形の中か、その下のライフライン線かは DSL の行番号には現れない。
  function _zoneHintOf(res) {
    return (res && res.zone) ? { zone: res.zone, bandLine: res.bandLine } : null;
  }

  function _insertGuideLabel(res) {
    if (!res || !currentModule) return null;
    // 帯 (activate/deactivate) の内側 / 外側までガイドに出す。
    // module に describeInsertGuide があれば、現在の DSL を渡してそちらに任せる。
    if (typeof currentModule.describeInsertGuide === 'function') {
      var label = currentModule.describeInsertGuide(res.line, res.position, mmdText, _zoneHintOf(res));
      if (label) return label;
    }
    if (typeof currentModule.insertTargetLine !== 'function') return null;
    var target = currentModule.insertTargetLine(res.line, res.position, mmdText, _zoneHintOf(res));
    if (target === null || typeof target === 'undefined') return null;
    return '+ DSL ' + target + ' 行目に挿入';
  }

  // 差し戻し: 実マウスでは帯の周りを押すと overlay の
  // ライフラインの当たり矩形 (data-type="lifeline") に当たり、ライフライン選択に吸われて
  // 挿入ピッカーが開かなかった。帯の矩形の中 / 帯より下のライフライン線を押したときは、
  // ライフライン選択より先に「帯の内側 / 外側」の挿入として解決する。
  // 帯の上端より上 (参加者との間) と Ctrl/Shift/Meta 付きクリックはこれまでどおり選択。
  function _bandInsertAt(e) {
    if (!e || e.ctrlKey || e.metaKey || e.shiftKey) return null;
    var t = e.target;
    var tType = t && t.getAttribute ? t.getAttribute('data-type') : null;
    if (tType !== 'lifeline' && tType !== 'message') return null;
    if (!moduleHas('insertPicker') || !currentModule || typeof currentModule.showInsertPicker !== 'function') return null;
    var SO = window.MA.sequenceOverlay;
    if (!SO || typeof SO.resolveBandZone !== 'function' || typeof SO.resolveInsertLine !== 'function') return null;
    var ov = document.getElementById('overlay-layer');
    if (!ov) return null;
    var rect = ov.getBoundingClientRect();
    var z = zoom || 1;
    var x = (e.clientX - rect.left) / z;
    var y = (e.clientY - rect.top) / z;
    if (!SO.resolveBandZone(ov, x, y)) return null;
    // 帯のすぐ下に次のメッセージがあると、その当たり矩形 (矢印の上のラベル分の高さ) が
    // ライフライン線を覆う。矢印の線より上を帯の列で押したときだけ挿入として扱い、
    // 矢印そのもの (中心線付近) を押したときはこれまでどおりメッセージを選ぶ。
    if (tType === 'message') {
      var my = parseFloat(t.getAttribute('y')) + parseFloat(t.getAttribute('height')) / 2;
      if (isNaN(my) || y >= my - 3) return null;
    }
    var res = SO.resolveInsertLine(ov, x, y);
    if (!res || !res.zone) return null;
    res.clickY = y;
    return res;
  }

  // 帯・帯下のライフラインを押すと挿入ピッカーは開くが、
  // 図の上には何の跡も残らない (選択は意図的に外す) ので、押した場所が効いたのか、
  // どちらの側に入るのかが図を見ても分からなかった。押して決まった帯の内側 / 外側を
  // そのまま図の上に塗り、ピッカーを閉じるまで残す。
  function _clearBandPickMark() {
    _resetPickerPlacement();
    var ov = document.getElementById('overlay-layer');
    if (!ov) return;
    Array.prototype.slice.call(ov.querySelectorAll('[data-type="band-pick"]')).forEach(function(n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  function _markBandPick(res) {
    _clearBandPickMark();
    if (!res || !res.zone) return;
    var ov = document.getElementById('overlay-layer');
    if (!ov) return;
    var zone = ov.querySelector('rect[data-type="band-zone"][data-line="' + res.bandLine + '"]');
    if (!zone) return;
    var zx = parseFloat(zone.getAttribute('x'));
    var zy = parseFloat(zone.getAttribute('y'));
    var zw = parseFloat(zone.getAttribute('width'));
    var zh = parseFloat(zone.getAttribute('height'));
    if (isNaN(zx) || isNaN(zy) || isNaN(zw) || isNaN(zh)) return;
    var PAD = 4;
    var x = zx - PAD;
    var w = zw + PAD * 2;
    var y, h, label;
    if (res.zone === 'inside') {
      y = zy - PAD; h = zh + PAD * 2; label = '帯の内側に挿入';
    } else {
      // 帯を抜けた先。帯の下端から押した点までのライフラインを塗る。
      y = zy + zh;
      h = Math.max(12, (typeof res.clickY === 'number' ? res.clickY : y + 12) - y + PAD);
      label = '帯の外側 (帯の下) に挿入';
    }
    var NS = 'http://www.w3.org/2000/svg';
    var r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('data-type', 'band-pick');
    r.setAttribute('data-zone', res.zone);
    r.setAttribute('class', 'band-pick');
    r.style.pointerEvents = 'none';
    ov.appendChild(r);
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x + w + 6);
    t.setAttribute('y', y + Math.min(h, 14));
    t.setAttribute('data-type', 'band-pick');
    t.setAttribute('class', 'band-pick-label');
    t.style.pointerEvents = 'none';
    t.textContent = label;
    ov.appendChild(t);
  }

  // 中央に出るピッカーは、押した帯そのものを覆い隠す (跡を付けても見えない)。
  // 押した点と反対側の半分に寄せ、帯と跡を見ながら選べるようにする。
  function _placePickerAside(clientX) {
    var m = document.getElementById('seq-modal');
    if (!m) return;
    m.style.justifyContent = (clientX < window.innerWidth / 2) ? 'flex-end' : 'flex-start';
    m.style.padding = '0 24px';
  }

  function _resetPickerPlacement() {
    var m = document.getElementById('seq-modal');
    if (!m) return;
    m.style.justifyContent = 'center';
    m.style.padding = '';
  }

  // ピッカーを閉じたら跡も消す (確定した場合は描き直しで overlay ごと作り直される)。
  // 押したボタンが窓を閉じた後では窓が開いているかを読めないので、捕捉の段 (ボタンの処理より前) で見る
  // (Esc で窓の「キャンセル」が押されたときも同じ。TICKET-owner-20261122-0301-1)。
  document.addEventListener('click', function(e) {
    var m = document.getElementById('seq-modal');
    if (!m || m.style.display === 'none') return;
    if (m.contains(e.target)) setTimeout(_clearBandPickMark, 0);
  }, true);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') _clearBandPickMark();
  }, false);

  // ── 矢印に乗せたときの相手表示 ──
  // 同じ部品から出る点線が 2 本あると色も太さも同じで、
  // 1 本クリックしては右パネルの From/To を読み、違えばもう 1 本、という当て物に
  // なっていた。overlay の rect が持つ data-hint を、乗せた位置に出すだけ。
  // 選択も再描画もしないので、目的の線が分かってからクリックすれば 1 回で当たる。
  var edgeHintEl = document.getElementById('edge-hint');

  function hideEdgeHint() {
    if (!edgeHintEl) return;
    edgeHintEl.hidden = true;
    edgeHintEl.textContent = '';
  }

  function showEdgeHint(text, clientX, clientY) {
    if (!edgeHintEl || !previewContainerForHover) return;
    edgeHintEl.textContent = text;
    edgeHintEl.hidden = false;
    var box = previewContainerForHover.getBoundingClientRect();
    // 線そのものを隠さないよう、カーソルの少し右下に置く。右端では左へ寄せる。
    var x = clientX - box.left + previewContainerForHover.scrollLeft + 12;
    var y = clientY - box.top + previewContainerForHover.scrollTop + 16;
    var w = edgeHintEl.offsetWidth || 0;
    if (x + w > previewContainerForHover.scrollLeft + box.width) {
      x = Math.max(0, previewContainerForHover.scrollLeft + box.width - w - 4);
    }
    edgeHintEl.style.left = x + 'px';
    edgeHintEl.style.top = y + 'px';
  }

  if (overlayElForHover && edgeHintEl) {
    overlayElForHover.addEventListener('mousemove', function(e) {
      var t = e.target;
      var hint = t && t.getAttribute && t.getAttribute('data-hint');
      if (!hint) { hideEdgeHint(); return; }
      showEdgeHint(hint, e.clientX, e.clientY);
    });
    overlayElForHover.addEventListener('mouseleave', hideEdgeHint);
    // 図を描き直すと rect ごと作り直されるので、残った吹き出しを消す。
    overlayElForHover.addEventListener('click', hideEdgeHint);
  }

  // 1 つの要素・関係の当たり判定は複数の rect に分かれる
  // (関係なら「線と矢じりとラベルを囲う箱」+「ラベルごとの小さい箱」)。CSS の :hover は
  // マウスの下の 1 枚しか光らせないので、ラベルに乗せるとラベルの分だけが枠になり、
  // 「どこまで押せば同じものを選べるか」が枠から読めない。同じ data-type / data-id を
  // 持つ rect を全部まとめて光らせ、枠 = 当たり判定の範囲、を図種によらず成り立たせる。
  if (overlayElForHover) {
    var _hoverPeerKey = null;
    function _rectBox(r) {
      var x = parseFloat(r.getAttribute('x')), y = parseFloat(r.getAttribute('y'));
      var w = parseFloat(r.getAttribute('width')), h = parseFloat(r.getAttribute('height'));
      return (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) ? null : { x: x, y: y, w: w, h: h };
    }
    function _boxesTouch(a, b) {
      if (!a || !b) return true;
      return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
    }
    function _clearHoverPeers() {
      if (!_hoverPeerKey) return;
      Array.prototype.forEach.call(
        overlayElForHover.querySelectorAll('rect.hit-hover'),
        function(r) { r.classList.remove('hit-hover'); });
      _hoverPeerKey = null;
    }
    overlayElForHover.addEventListener('mousemove', function(e) {
      var t = e.target;
      var type = t && t.getAttribute && t.getAttribute('data-type');
      var id = type ? t.getAttribute('data-id') : null;
      if (!type || id == null) { _clearHoverPeers(); return; }
      var key = type + '\u0000' + id;
      // 同じ要素でも、光っていない rect (離れた所に描いた頭と足の片方) へ移ったら光らせ直す。
      if (key === _hoverPeerKey && t.classList && t.classList.contains('hit-hover')) return;
      _clearHoverPeers();
      _hoverPeerKey = key;
      // data-id は利用者が付けた名前なので、セレクタに埋めず属性を直接見比べる。
      // まとめて光らせるのは、指した rect と重なる仲間だけ
      // (関係の箱とその中のラベルの箱)。シーケンスの参加者の頭と足のように、同じ要素を
      // 離れた所にもう一度描いた rect は別の当たり判定なので、指していない側は光らせない。
      // 折れた矢印は区間ごとの枠が端で重なって続くので、重なりをたどった全部を光らせる。
      var peers = Array.prototype.filter.call(
        overlayElForHover.querySelectorAll('rect.selectable[data-type]'),
        function(r) { return r.getAttribute('data-type') === type && r.getAttribute('data-id') === id; });
      var lit = [t];
      if (_rectBox(t)) {
        for (var li = 0; li < lit.length; li++) {
          var lb = _rectBox(lit[li]);
          peers.forEach(function(r) {
            if (lit.indexOf(r) < 0 && _boxesTouch(lb, _rectBox(r))) lit.push(r);
          });
        }
      } else {
        lit = peers;
      }
      lit = lit.filter(function(r) { return peers.indexOf(r) >= 0; });
      // 楔を持つ note は紙の枠の代わりに楔込みの枠を光らせる (当たりは変えない)。
      var OBh = window.MA.overlayBuilder;
      if (OBh && OBh.litRects) lit = OBh.litRects(overlayElForHover, lit);
      lit.forEach(function(r) { r.classList.add('hit-hover'); });
    });
    overlayElForHover.addEventListener('mouseleave', _clearHoverPeers);
  }

  // 図の中に挿入先の目印 (メッセージ) がまだ無いとき (＋ で開いた白紙など) は、
  // 図の末尾に入れる。ガイド線だけ出て押しても何も開かない、を無くす。
  function _tailInsertRes() {
    if (!currentModule || typeof currentModule.resolveTailInsert !== 'function') return null;
    try { return currentModule.resolveTailInsert(mmdText); } catch (e) { return null; }
  }

  // 選択中は hover-insert ガイドと挿入 popup を両方抑制する。
  // 理由: 選択 = 編集モードでユーザーは選択項目を扱っており、別の箇所への
  // 挿入を示唆する点線ガイドは視覚ノイズになる。また空白クリックは選択解除に
  // 使われる (overlay click handler 側で処理) ため、click で popup まで開くと
  // 解除と挿入が同時に起きて混乱する。
  function _hasSelection() {
    return !!(window.MA && window.MA.selection
      && window.MA.selection.getSelected
      && window.MA.selection.getSelected().length > 0);
  }

  if (previewContainerForHover && hoverEl && overlayElForHover) {
    previewContainerForHover.addEventListener('mousemove', function(e) {
      // 挿入クリックを処理できるモジュール (= hoverInsert capability) でなければガイドも出さない。
      // 出すと「+ ここに挿入」が見えるのにクリックしても何も起きない誤誘導になる。
      if (!moduleHas('hoverInsert')) {
        clearHoverGuide();
        return;
      }
      // 選択中は挿入ガイドを出さない
      if (_hasSelection()) {
        clearHoverGuide();
        return;
      }
      var target = e.target;
      // 帯の中 / 帯の下のライフライン線は挿入先として枠を出す。
      var bandRes = _bandInsertAt(e);
      if (bandRes) {
        drawHoverGuide(bandRes.clickY, bandRes.rectX, bandRes.rectWidth, _insertGuideLabel(bandRes));
        return;
      }
      // overlay rect 上にマウス → guide 非表示 (既存選択を優先)
      if (target.getAttribute && target.getAttribute('data-type')) {
        clearHoverGuide();
        return;
      }
      var rect = overlayElForHover.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        clearHoverGuide();
        return;
      }
      var z = zoom || 1;
      var x = (e.clientX - rect.left) / z;
      var y = (e.clientY - rect.top) / z;
      // Resolve via current module to obtain the column bounds (rectX/rectWidth)
      var resolver = (currentModule && typeof currentModule.resolveInsertLine === 'function')
        ? currentModule.resolveInsertLine
        : null;
      if (resolver) {
        var res = resolver(overlayElForHover, x, y) || _tailInsertRes();
        if (res) {
          drawHoverGuide(y, res.rectX, res.rectWidth, _insertGuideLabel(res));
          return;
        }
      }
      drawHoverGuide(y);
    });

    previewContainerForHover.addEventListener('mouseleave', clearHoverGuide);

    // FEAT-009 (resolves UI-003): 空白クリックは先に overlay の click ハンドラ
    // (selectionRouter = 選択解除) を通ってから ここへ bubble するため、下の
    // handler の時点では選択が既に空で、_hasSelection() だけでは「解除」と
    // 「挿入 popup」が 1 クリックで同時に起きる。click 時点の選択状態を capture
    // 段階で記録し、bubble 側はその値で判定する。
    var hadSelectionAtClick = false;
    previewContainerForHover.addEventListener('click', function() {
      hadSelectionAtClick = _hasSelection();
    }, true);

    previewContainerForHover.addEventListener('click', function(e) {
      // drag 終了直後の click は無視 (participant drag と挿入 popup の競合回避)
      if (Date.now() - justDraggedAt < DRAG_CLICK_SUPPRESS_MS) return;
      // 選択中は挿入 popup を開かない (overlay click が選択解除を担当)
      if (hadSelectionAtClick || _hasSelection()) return;
      var target = e.target;
      if (target.getAttribute && target.getAttribute('data-type')) return;  // overlay click は既存 handler が処理
      if (!moduleHas('showInsertForm')) return;
      // Resolve insert line via current module (v0.5.0 overlay-driven contract)
      // Falls back to sequence-overlay for backward compat with sequence module.
      var resolver = (currentModule && typeof currentModule.resolveInsertLine === 'function')
        ? function(ovEl, xx, yy) { return currentModule.resolveInsertLine(ovEl, xx, yy); }
        : (window.MA.sequenceOverlay && window.MA.sequenceOverlay.resolveInsertLine
          ? window.MA.sequenceOverlay.resolveInsertLine
          : null);
      if (!resolver) return;
      var rect = overlayElForHover.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      var z = zoom || 1;
      var x = (e.clientX - rect.left) / z;
      var y = (e.clientY - rect.top) / z;
      var res = resolver(overlayElForHover, x, y) || _tailInsertRes();
      if (!res) return;
      var insertCtx = _editCtx(false);
      // insertPicker を持つ module は、まず「何を挿入するか」
      // (メッセージ/note/alt/loop/activate/その他) のメニューを出す。
      // 持たない module は従来どおり単一種別のフォームを直接開く。
      if (moduleHas('insertPicker') && typeof currentModule.showInsertPicker === 'function') {
        currentModule.showInsertPicker(insertCtx, res.line, res.position, _zoneHintOf(res));
        clearHoverGuide();
        return;
      }
      var insertKind = (currentModule && currentModule.defaultInsertKind) || 'message';
      currentModule.showInsertForm(insertCtx, res.line, res.position, insertKind);
      clearHoverGuide();
    });
  }

  // ── Participant drag 並び替え (Sprint 10 C19) ──
  var dragState = null;
  // drag 完了直後は click event も発火するため、hover-insert や overlay-click
  // と競合してメッセージ挿入 popup が意図せず開く。mouseup 時刻を記録し、
  // 一定時間以内の click は「drag 由来の残響」と判定して無視する。
  var justDraggedAt = 0;
  var DRAG_CLICK_SUPPRESS_MS = 300;

  // Feature #7 で lifeline rect を追加した結果、同一 participant が head /
  // tail / lifeline の 3 つの rect で表現され、それぞれ微妙に異なる x を
  // 持つようになった。旧来の「x を小数2桁で丸めて dedupe」では 3 つが
  // 同一視されず、gap 数が水増しされて drop 位置判定が壊れる。
  // data-id 基準で dedupe し、1 participant = 1 center に戻す。
  function _participantCenters(overlayD) {
    var partRects = overlayD.querySelectorAll('rect[data-type="participant"]');
    var centerById = {};
    Array.prototype.forEach.call(partRects, function(r) {
      var id = r.getAttribute('data-id');
      if (!id) return;
      var cx = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
      if (!(id in centerById)) centerById[id] = cx;
    });
    var centers = [];
    for (var k in centerById) {
      if (Object.prototype.hasOwnProperty.call(centerById, k)) centers.push(centerById[k]);
    }
    centers.sort(function(a, b) { return a - b; });
    return centers;
  }

  function drawDropIndicator(clientX) {
    var hoverElD = document.getElementById('hover-layer');
    var overlayD = document.getElementById('overlay-layer');
    if (!hoverElD || !overlayD) return;
    var old = hoverElD.querySelector('.drop-indicator');
    if (old) old.parentNode.removeChild(old);
    var centers = _participantCenters(overlayD);
    if (centers.length === 0) return;
    var rectBBox = overlayD.getBoundingClientRect();
    var z = zoom || 1;
    var localX = (clientX - rectBBox.left) / z;
    // Bug A1/A2: sentinel gap が overlay 描画範囲外に置かれると hover-layer
    // の viewBox/clip で見えなくなり、両端 drop が不可視になる。
    // overlay width / 0 の範囲内に clamp。
    var overlayW = parseFloat(overlayD.getAttribute('width'))
      || parseFloat(overlayD.getAttribute('viewBox') && overlayD.getAttribute('viewBox').split(/\s+/)[2])
      || 800;
    var leftSentinel = Math.max(5, centers[0] - 40);
    var rightSentinel = Math.min(overlayW - 5, centers[centers.length - 1] + 40);
    var gaps = [];
    gaps.push(leftSentinel);
    for (var i = 0; i < centers.length - 1; i++) {
      gaps.push((centers[i] + centers[i + 1]) / 2);  // 2 participants の中点
    }
    gaps.push(rightSentinel);
    var bestX = gaps[0];
    var bestDist = Infinity;
    for (var ii = 0; ii < gaps.length; ii++) {
      var d = Math.abs(localX - gaps[ii]);
      if (d < bestDist) { bestDist = d; bestX = gaps[ii]; }
    }
    var h = parseFloat(overlayD.getAttribute('height')) || 400;
    // Bug A1/A2: hover-layer が width=0/height=0 のままだと SVG 自体がクリップ
    // されて drop-indicator が表示されない。overlay-layer に合わせて都度同期。
    hoverElD.setAttribute('width', overlayD.getAttribute('width') || overlayW);
    hoverElD.setAttribute('height', overlayD.getAttribute('height') || h);
    var vb = overlayD.getAttribute('viewBox');
    if (vb) hoverElD.setAttribute('viewBox', vb);
    hoverElD.style.transform = overlayD.style.transform;
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', bestX);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', bestX);
    line.setAttribute('y2', h);
    line.setAttribute('class', 'drop-indicator');
    hoverElD.appendChild(line);
  }

  function clearDropIndicator() {
    var hoverElD = document.getElementById('hover-layer');
    if (!hoverElD) return;
    var old = hoverElD.querySelector('.drop-indicator');
    if (old) old.parentNode.removeChild(old);
  }

  function computeDropIndex(clientX) {
    var overlayD = document.getElementById('overlay-layer');
    if (!overlayD) return null;
    var centers = _participantCenters(overlayD);
    if (centers.length === 0) return null;
    var rectBBox = overlayD.getBoundingClientRect();
    var z = zoom || 1;
    var localX = (clientX - rectBBox.left) / z;
    // Bug 3: drawDropIndicator と同じ「中点 gap」で index 計算に統一。
    // localX に最も近い gap index = 新 index (0 = 先頭、N = 末尾)。
    var overlayW = parseFloat(overlayD.getAttribute('width'))
      || parseFloat(overlayD.getAttribute('viewBox') && overlayD.getAttribute('viewBox').split(/\s+/)[2])
      || 800;
    var leftSentinel = Math.max(5, centers[0] - 40);
    var rightSentinel = Math.min(overlayW - 5, centers[centers.length - 1] + 40);
    var gaps = [leftSentinel];
    for (var i = 0; i < centers.length - 1; i++) {
      gaps.push((centers[i] + centers[i + 1]) / 2);
    }
    gaps.push(rightSentinel);
    var bestIdx = 0;
    var bestDist = Infinity;
    for (var j = 0; j < gaps.length; j++) {
      var d = Math.abs(localX - gaps[j]);
      if (d < bestDist) { bestDist = d; bestIdx = j; }
    }
    return bestIdx;
  }

  var ovForDrag = document.getElementById('overlay-layer');
  if (ovForDrag) {
    ovForDrag.addEventListener('mousedown', function(e) {
      if (!moduleHas('participantDrag')) return;
      var target = e.target;
      if (!target.getAttribute) return;
      if (target.getAttribute('data-type') !== 'participant') return;
      var id = target.getAttribute('data-id');
      dragState = { id: id, startX: e.clientX, startY: e.clientY, ghostEl: null, dragging: false };
    });
  }

  document.addEventListener('mousemove', function(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (!dragState.dragging && dist > 4) {
      dragState.dragging = true;
      var g = document.createElement('div');
      g.className = 'seq-drag-ghost';
      g.textContent = dragState.id;
      g.style.left = e.clientX + 'px';
      g.style.top = e.clientY + 'px';
      document.body.appendChild(g);
      dragState.ghostEl = g;
    }
    if (dragState.dragging) {
      dragState.ghostEl.style.left = e.clientX + 'px';
      dragState.ghostEl.style.top = e.clientY + 'px';
      drawDropIndicator(e.clientX);
    }
  });

  document.addEventListener('mouseup', function(e) {
    if (!dragState) return;
    if (dragState.dragging) {
      var newIndex = computeDropIndex(e.clientX);
      if (newIndex !== null && currentModule) {
        var seqMod = window.MA.modules && window.MA.modules.plantumlSequence;
        var genP = _generatedOf({ type: 'participant', id: dragState.id });   //
        if (genP) { _refuseGenerated(genP); seqMod = null; }
        if (seqMod && seqMod.moveParticipant) {
          // Bug 4: newIndex === 現在位置の no-op で履歴だけ積まれると
          // Ctrl+Z が「同じ text に戻る」無駄な 1 step になり、体感的に
          // undo が効かない。text が実際に変わった時のみ pushHistory。
          var newText = seqMod.moveParticipant(mmdText, dragState.id, newIndex);
          if (newText !== mmdText) {
            window.MA.history.pushHistory();
            mmdText = newText;
            suppressSync = true;
            editorEl.value = mmdText;
            suppressSync = false;
            scheduleRefresh();
          }
        }
      }
      if (dragState.ghostEl && dragState.ghostEl.parentNode) dragState.ghostEl.parentNode.removeChild(dragState.ghostEl);
      clearDropIndicator();
      justDraggedAt = Date.now();
    }
    dragState = null;
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && dragState && dragState.dragging) {
      if (dragState.ghostEl && dragState.ghostEl.parentNode) dragState.ghostEl.parentNode.removeChild(dragState.ghostEl);
      clearDropIndicator();
      dragState = null;
    }
  });

  // Overlay click → selection (Phase A: selection-router へ移譲)
  var overlayEl = document.getElementById('overlay-layer');
  if (overlayEl) {
    // 枠が今の本文より古い (打った直後で描き直しが届いていない) 間は、押した枠をその場で使わない。
    // 枠の id は前の本文の順番なので、今の本文で引くと押していない要素に当たる
    // (TICKET-owner-20261116-0121-1)。押した枠の行は憶え、描き直しが届いたら同じ行を選ぶ。
    // ほかのどの手 (ドラッグ・帯への挿入・囲むの終点) よりも先に取る (capture で最初に登録)。
    var _staleOverlayGuard = function(e) {
      var SO = window.MA.staleOverlay;
      if (!SO || !SO.isStale(_overlayBuiltFrom, mmdText)) return;
      e.stopImmediatePropagation();
      // mousedown の既定 (本文の欄から焦点を外す) は残す。残さないと、続けて押した Delete が本文の 1 字を消す。
      if (e.type !== 'mousedown') e.preventDefault();
      if (e.type !== 'click') return;
      _noteStaleOverlayClick(e);
    };
    ['mousedown', 'click', 'dblclick', 'contextmenu'].forEach(function(t) {
      overlayEl.addEventListener(t, _staleOverlayGuard, true);
    });
    // drag suppress: participant drag 直後の click は無視 (capture phase で先取り)
    overlayEl.addEventListener('click', function(e) {
      if (Date.now() - justDraggedAt < DRAG_CLICK_SUPPRESS_MS) {
        e.stopImmediatePropagation();
      }
    }, true);
    // 「⌗ 囲む…」の終点待ちの間は、押したメッセージを選択ではなく終点に使う。
    overlayEl.addEventListener('click', function(e) {
      if (currentModule && typeof currentModule.handleOverlayPick === 'function'
        && currentModule.handleOverlayPick(e.target)) {
        e.stopImmediatePropagation();
      }
    }, true);
    // 差し戻し: 帯の中 / 帯の下のライフライン線を実マウスで押したら、
    // ライフライン選択ではなく「帯の内側 / 外側」で挿入ピッカーを開く (capture で router より先に取る)。
    overlayEl.addEventListener('click', function(e) {
      if (Date.now() - justDraggedAt < DRAG_CLICK_SUPPRESS_MS) return;
      var res = _bandInsertAt(e);
      if (!res) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (window.MA.selection && window.MA.selection.clearSelection) window.MA.selection.clearSelection();
      var insertCtx = _editCtx(false);
      _markBandPick(res);
      currentModule.showInsertPicker(insertCtx, res.line, res.position, _zoneHintOf(res));
      _placePickerAside(e.clientX);
      if (typeof clearHoverGuide === 'function') clearHoverGuide();
    }, true);
    window.MA.selectionRouter.bind(overlayEl, {
      expandShift: function(current, item) {
        if (!currentModule || typeof currentModule.expandShiftSelection !== 'function') return null;
        try { return currentModule.expandShiftSelection(mmdText, current, item); } catch (err) { return null; }
      },
    });
  }

  // FEAT-080: Ctrl+/ (Cmd+/) で選択行の PlantUML 行コメント ' をトグルする。
  // Tab / Shift+Tab と同じ作法 (selectionStart/End の文字列操作 + input イベント) に
  // そろえ、DSL 反映と履歴記録は既存の input 経路 (scheduleRefresh / MA.history) に委ねる。
  // 日本語配列等で e.key が '/' にならない場合に備え e.code === 'Slash' も見る (FEAT-080「不利な事実」)。
  editorEl.addEventListener('keydown', function(e) {
    if (e.isComposing) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key !== '/' && e.code !== 'Slash') return;
    var res = window.MA.dslUtils.toggleLineComment(this.value, this.selectionStart, this.selectionEnd);
    if (!res) return;
    e.preventDefault();
    this.value = res.value;
    this.selectionStart = res.selectionStart;
    this.selectionEnd = res.selectionEnd;
    this.dispatchEvent(new Event('input'));
  });

  // FEAT-116 (resolves HFR-033): Alt+↑ / Alt+↓ で DSL エディタのカーソル行を上下に移動する。
  // Tab / FEAT-080 と同じ作法 (textarea の value を直接書き換え + input イベント) にそろえ、
  // DSL 反映と履歴記録は既存の input 経路 (scheduleRefresh / MA.history) に委ねる。
  // 入替の純関数は src/core/dsl-updater.js の moveLineUp / moveLineDown を再利用する
  // (端の行では text をそのまま返す = [AC-3] の境界処理は純関数側が持つ)。
  // Alt 付きは :500 の history ルーターと :553 の選択ルーターがいずれも明示的に除外しており、
  // 本ハンドラと競合しない。
  editorEl.addEventListener('keydown', function(e) {
    if (e.isComposing) return;
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var up = e.key === 'ArrowUp';
    if (!up && e.key !== 'ArrowDown') return;
    var lineNum = this.value.substring(0, this.selectionStart).split('\n').length;
    var DUR = window.MA.dslUpdater;
    // 選択が複数行にまたがるときは、選んだ行の塊をまとめて動かし、選択は塊に付いていく
    // (TICKET-junior-20261122-1001-wish。終わりが行頭ちょうどの行は選んだ行に数えない)。
    var selStart = this.selectionStart, selEnd = this.selectionEnd;
    var endLine = this.value.substring(0, selEnd).split('\n').length;
    if (selEnd > selStart && endLine > lineNum && this.value.charAt(selEnd - 1) === '\n') endLine -= 1;
    if (endLine > lineNum) {
      var all = this.value.split('\n');
      var blk = up ? DUR.moveLinesUp(this.value, lineNum, endLine) : DUR.moveLinesDown(this.value, lineNum, endLine);
      e.preventDefault();
      if (blk === this.value) return;   // 端: DSL は 1 バイトも変えない
      // 塊の隣の 1 行 (と改行 1 字) ぶんだけ選択をずらす。
      var shift = (up ? all[lineNum - 2] : all[endLine]).length + 1;
      this.value = blk;
      this.selectionStart = up ? selStart - shift : selStart + shift;
      this.selectionEnd = up ? selEnd - shift : selEnd + shift;
      this.dispatchEvent(new Event('input'));
      return;
    }
    var next = up ? DUR.moveLineUp(this.value, lineNum) : DUR.moveLineDown(this.value, lineNum);
    e.preventDefault();
    if (next === this.value) return;   // 端の行: DSL は 1 バイトも変えない
    this.value = next;
    // カーソルは移動した行の行頭に残す ([AC-4]: 連打で 2 行以上動かせる)。
    var moved = up ? lineNum - 1 : lineNum + 1;
    var pos = next.split('\n').slice(0, moved - 1).join('\n').length + (moved > 1 ? 1 : 0);
    this.selectionStart = this.selectionEnd = pos;
    this.dispatchEvent(new Event('input'));
  });

  editorEl.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab' || e.isComposing) return;
    e.preventDefault();
    // design 5a: 入れ外しする単位は設定の「インデント幅」に従う。
    var EI = window.MA.editorIndent;
    var indentId = currentIndentId();
    var start = this.selectionStart, end = this.selectionEnd;
    var r = e.shiftKey ? EI.applyOutdent(this.value, start, indentId)
                       : EI.applyIndent(this.value, start, end, indentId);
    if (r.changed === false) return;
    this.value = r.text;
    this.selectionStart = this.selectionEnd = r.caret;
    this.dispatchEvent(new Event('input'));
  });

  document.getElementById('render-mode').addEventListener('change', function() {
    localStorage.setItem('plantuml-render-mode', this.value);
    updateOnlineWarning();
    // 上部バーの状態表示はモード名を含むので、描画を待たずに切り替えを映す。
    updateTopRenderStatus('idle');
    scheduleRefresh();
  });

  document.getElementById('btn-render').addEventListener('click', scheduleRefresh);
  document.getElementById('btn-undo').addEventListener('click', function() { window.MA.history.undo(); });
  document.getElementById('btn-redo').addEventListener('click', function() { window.MA.history.redo(); });

  // userissue v1.2.4: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (Cmd on Mac) を MA.history
  // にルーティング。 textarea のネイティブ undo は setMmdText の programmatic
  // 上書きで壊れるため、 アプリ全体で 1 系統の history に統一する。
  // 右パネルのフォーム入力 (Title/Alias 等) では native undo を温存したいので
  // activeElement が editor 以外の input/textarea/select の時はスルー。
  // ただし「末尾に追加」で足した直後 (欄にまだ 1 字も打っていない間) は図の履歴に回す
  // (TICKET-owner-20261115-1900-1。判定は src/core/undo-route.js)。
  document.addEventListener('input', function(e) {
    var t = e.target;
    if (!t || t === editorEl) return;
    var UR = window.MA.undoRoute;
    if (UR) UR.onFieldInput(_undoRouteState);
  }, true);
  document.addEventListener('keydown', function(e) {
    if (e.isComposing) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var key = (e.key || '').toLowerCase();
    var isUndo = key === 'z' && !e.shiftKey;
    var isRedo = key === 'y' || (key === 'z' && e.shiftKey);
    if (!isUndo && !isRedo) return;
    var ae = document.activeElement;
    var tag = ae ? ae.tagName : '';
    var ctx = {
      inEditor: !!ae && ae === editorEl,
      inField: !!ae && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!ae.isContentEditable),
      inForm: _inPropsPane(ae),
    };
    var UR = window.MA.undoRoute;
    var where = UR ? UR.route(_undoRouteState, ctx) : ((ctx.inEditor || !ctx.inField) ? 'history' : 'native');
    if (where !== 'history') return;
    e.preventDefault();
    if (isUndo) window.MA.history.undo();
    else window.MA.history.redo();
  });

  // FEAT-012 / FEAT-017 / FEAT-014: 選択中のキーボード操作ルーター。
  //   ArrowUp / ArrowDown → DSL 上の前後のメッセージへ選択を移す (FEAT-012)
  //   Enter               → 選択行の直後を挿入位置として挿入 modal を開く (FEAT-017)
  //   Delete / Backspace  → 選択中の message の行を削除する (FEAT-014 / UI-002 / HFR-001)
  // 設計上の約束:
  //  - 入力中のキーは決して奪わない。IME 変換中 (isComposing / keyCode 229) と
  //    input / textarea / select / contenteditable にフォーカスがある間は素通しする。
  //    DSL エディタ textarea のカーソル移動と改行は本ルーターの対象外である。
  //  - 修飾キー付きは対象外。Alt 付きは FEAT-013 の行移動に予約し、Ctrl/Meta 付きは
  //    上の history ルーターの領分である。素の矢印キー = 選択移動とし、
  //    誤操作で図が壊れない側をテキストエディタの慣習どおり素のキーに割り当てる。
  //  - 単独選択された message のときだけ発火する (0件 / 複数 / message 以外は無反応)。
  function _kbdInTypingTarget() {
    var ae = document.activeElement;
    if (!ae) return false;
    var tag = ae.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!ae.isContentEditable;
  }

  // FEAT-109 [AC-5]: 図種ごとの挿入 modal をすべて見る (従来は seq-modal のみ)。
  var KBD_MODAL_IDS = ['seq-modal', 'st-modal'];
  function _kbdModalOpen() {
    for (var i = 0; i < KBD_MODAL_IDS.length; i++) {
      var m = document.getElementById(KBD_MODAL_IDS[i]);
      if (m && m.style.display && m.style.display !== 'none') return true;
    }
    return false;
  }

  // 図で 1 つだけ選んでいる部品 (↑↓ の候補に入らない参加者なども含む)。
  function _kbdSingleSelected() {
    var sel = (window.MA.selection && window.MA.selection.getSelected)
      ? (window.MA.selection.getSelected() || []) : [];
    return sel.length === 1 ? sel[0] : null;
  }

  // ↑↓ の候補に入らない部品 (シーケンス図の参加者) を図で押して Delete を
  // 押したら、右パネルの「✕ 削除」と同じことをする (宣言の行が無い参加者の断り・元に戻すトーストもボタンの側が持つ)。
  function _kbdDeleteViaPanel() {
    var one = _kbdSingleSelected();
    if (!one || one.type !== 'participant') return false;
    var btn = document.querySelector('#props-content .seq-delete-line');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }

  // FEAT-109: キーボード選択の対象要素を DSL 行順で返す。
  // 図種モジュールが任意実装 kbdSelectables(parsed) を持てばそれに委譲し、
  // 無ければ従来どおり relations の kind==='message' にフォールバックする。
  function _kbdSelectables() {
    var items;
    if (currentModule && typeof currentModule.kbdSelectables === 'function') {
      items = currentModule.kbdSelectables(currentParsed) || [];
    } else {
      items = ((currentParsed && currentParsed.relations) || [])
        .filter(function(r) { return r.kind === 'message'; })
        .map(function(r) { return { type: 'message', id: r.id, line: r.line }; });
    }
    return items
      .filter(function(it) { return it && typeof it.line === 'number'; })
      .sort(function(a, b) { return a.line - b.line; });
  }

  // 単独選択が指す要素を現在の parse 結果から解決する。
  // 0件選択 / 複数選択 / 対象外の選択では null を返す。
  function _kbdSelectedItem() {
    var sel = (window.MA.selection && window.MA.selection.getSelected)
      ? (window.MA.selection.getSelected() || []) : [];
    if (sel.length !== 1) return null;
    var items = _kbdSelectables();
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === sel[0].id) return items[i];
    }
    return null;
  }

  // 繰り返し・手続きが作った部品 (src/core/generated-part.js) は、キーでも消さない・
  // 矢印を替えない・挿入しない・複製しない・並べ替えない。下の各ルーターより先に (window の capture で) 断る。
  window.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229 || e.shiftKey) return;
    var k = e.key, plain = !(e.ctrlKey || e.metaKey || e.altKey);
    var edits = (plain && (k === 'Delete' || k === 'Backspace' || k === 'd' || k === 'Enter'))
      || ((e.ctrlKey || e.metaKey) && !e.altKey && (k || '').toLowerCase() === 'd')
      || (e.altKey && !e.ctrlKey && !e.metaKey && (k === 'ArrowUp' || k === 'ArrowDown'));
    if (!edits || _kbdInTypingTarget() || _kbdModalOpen()) return;
    // 参加者のように ↑↓ の候補に入らない部品も、図で押して選んでいれば断る
    var cur = _kbdSelectedItem() || _kbdSingleSelected();
    var gen = cur ? _generatedOf(cur) : null;
    if (!gen) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    _refuseGenerated(gen);
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var key = e.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Enter'
      && key !== 'Delete' && key !== 'Backspace' && key !== 'd') return;
    if (_kbdInTypingTarget()) return;
    // modal 表示中は二重発火させない (FEAT-017 [AC-5])。
    if (_kbdModalOpen()) return;
    var cur = _kbdSelectedItem();
    if (!cur) {
      if ((key === 'Delete' || key === 'Backspace') && _kbdDeleteViaPanel()) e.preventDefault();
      return;
    }

    // FEAT-138 (UI-016 / HFR-073): 選択中 message の矢印を 1 打で `->` / `-->` に切り替える。
    // ARROWS の順序・剰余には依存せず、`-->` を既定の相手とする 2 値切替である。
    if (key === 'd') {
      if (cur.type !== 'message') return;
      if (!currentModule || typeof currentModule.updateMessage !== 'function') return;
      var rels = (currentParsed && currentParsed.relations) || [];
      var rel = null;
      for (var k = 0; k < rels.length; k++) { if (rels[k].id === cur.id) { rel = rels[k]; break; } }
      if (!rel) return;
      var toggled = currentModule.updateMessage(mmdText, cur.line, 'arrow',
        rel.arrow === '-->' ? '->' : '-->');
      if (toggled === mmdText) return; // 空振りで undo 段を増やさない
      e.preventDefault();
      window.MA.history.pushHistory();
      mmdText = toggled;
      suppressSync = true;
      editorEl.value = toggled;
      suppressSync = false;
      scheduleRefresh();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      // FEAT-014: 右パネルの「✕ 削除」と同じ削除本体 (module 側) を呼ぶ。
      // ガード (IME / 修飾キー / 入力欄 / modal / 単独選択の message) は
      // FEAT-012 / FEAT-017 と完全に共有しており、本経路のためのゆるめはしていない。
      if (!moduleHas('deleteSelectedLine')) return;
      e.preventDefault();
      currentModule.deleteSelectedLine(_editCtx(false), cur.line);
      return;
    }

    if (key === 'Enter') {
      // FEAT-017: ホバー経由と同一の入口 (showInsertForm) を position='after' で呼ぶ。
      // From/To/Arrow の既定値ロジック (FEAT-001 / FEAT-002) と
      // 本文欄への初期フォーカス (FEAT-004) はこの経路の内側で共有される。
      if (!moduleHas('showInsertForm')) return;
      e.preventDefault();
      currentModule.showInsertForm({
        getMmdText: function() { return mmdText; },
        setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; },
        onUpdate: function() { scheduleRefresh(); },
      }, cur.line, 'after',
        (currentModule && currentModule.defaultInsertKind) || 'message');
      return;
    }

    // FEAT-012 / FEAT-109: DSL 行順で前後の選択対象へ移す。note / group / participant は
    // 候補列に現れないため自然に飛ばされる。
    var msgs = _kbdSelectables();
    var idx = -1;
    for (var j = 0; j < msgs.length; j++) {
      if (msgs[j].id === cur.id) { idx = j; break; }
    }
    if (idx < 0) return;
    e.preventDefault();
    var next = msgs[idx + (key === 'ArrowDown' ? 1 : -1)];
    // 端では選択を変えず、DSL も書き換えない (FEAT-012 [AC-2])。
    if (!next) return;
    // FEAT-109: type をハードコードせず要素の実 type を使う (state / transition の再解決)。
    kbdSetSelected([{ type: next.type || 'message', id: next.id, line: next.line }]);
  });

  // FEAT-076 (HFR-003): Ctrl+D で単独選択された message を直後に複製する。
  // 上の FEAT-012 / FEAT-017 ルーターは修飾キー付きを一律除外するため、Ctrl 系である
  // 本機能は Ctrl+Z / Ctrl+Y の history ルーターと同じ形の独立ハンドラで受け、ガードだけを
  // 共有する。複製は入力を要さないので modal は開かない。書き換えは pushHistory →
  // setMmdText の 1 系統に載せるため、直後の Ctrl+Z 1 回で複製前に戻る ([AC-2])。
  document.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if ((e.key || '').toLowerCase() !== 'd') return;
    // 入力中はブラウザ既定を通す ([AC-3])。modal 表示中は発火しない ([AC-5])。
    if (_kbdInTypingTarget() || _kbdModalOpen()) return;
    // FEAT-126 (UI-012): ここで Ctrl+D は「本アプリが引き受けたキー」と確定している。
    // 以降の早期 return は「複製が成立しなかった」だけであり、ブラウザ既定(ブックマーク
    // 追加ダイアログ)を通す理由にはならない。よって preventDefault() は成立判定より前、
    // 引受確定の直後に呼ぶ。同ファイルの history ルーター(Ctrl+Z / Ctrl+Y)が isUndo /
    // isRedo の確定後に preventDefault() を呼ぶのと同じ型である。
    // 🔴 入力中 ([AC-3]) と modal 表示中 ([AC-5]) は直前の行で return 済みであり、
    //    それらの経路では従来どおりブラウザ既定が通る(引き受けていない)。
    e.preventDefault();
    // 0 件 / 複数 / message 以外の選択では null が返り、DSL は変化しない ([AC-4])。
    // FEAT-179 (UI-019): FEAT-109 のリネーム前の旧名を呼んでいて未定義だったため、
    // 既存の _kbdSelectedItem() に是正する(旧名は本ファイルに 1 件も残さない [AC-5])。
    // _kbdSelectedItem() は図種モジュールの kbdSelectables() 由来の message 以外の要素も
    // 返しうるため、type を明示的に検査して複製対象を message に限定する ([AC-6])。
    var cur = _kbdSelectedItem();
    if (!cur || cur.type !== 'message') return;
    if (!currentModule || typeof currentModule.duplicateMessage !== 'function') return;
    var dup = currentModule.duplicateMessage(mmdText, cur.line);
    if (dup === mmdText) return; // 空振りで undo 段を増やさない
    // FEAT-126 (UI-012): preventDefault() は引受確定の直後へ移した(上記)。
    window.MA.history.pushHistory();
    mmdText = dup;
    suppressSync = true;
    editorEl.value = dup;
    suppressSync = false;
    // FEAT-127 (UI-013 / HFR-063): 複製直後、選択を「複製で生まれた新しい行」へ移す。
    // 🔴 複製前の id を保持してはならない: parseSequence は message の id を文書順の連番
    //    (src/modules/sequence.js:215 の `id: '__m_' + (msgCounter++)`) で採番するため、
    //    複製行より後ろの message は id が振り直される。よって新しい選択は
    //    **複製後の再パース結果に対して行番号から引き直す** (UI-013 の指摘どおり)。
    // 🔴 Ctrl+D 経路には renderProps() の setMmdText(:1312 の逐語コメント
    //    "Re-parse synchronously so any setSelected() that fires right ...") のような
    //    同期再パースが無く、currentParsed は scheduleRefresh() の非同期の描き直しまで古いままである。
    //    そのため _kbdSelectables() を使う前にここで同期再パースする (同 :1317-1319 と同じ形)。
    if (currentModule && typeof currentModule.parse === 'function') {
      try { currentParsed = currentModule.parse(mmdText); } catch (err) { /* leave stale */ }
    }
    // duplicateMessage は insertAfterLine (src/core/text-updater.js:67) で複製元の直後へ
    // 1 行だけ挿入するため、新しい行は cur.line + 1 である。
    var dupLine = cur.line + 1;
    var after = _kbdSelectables();
    for (var n = 0; n < after.length; n++) {
      if (after[n].line === dupLine) {
        // FEAT-109 と同じく type はハードコードせず要素の実 type を使う。
        kbdSetSelected(
          [{ type: after[n].type || 'message', id: after[n].id, line: after[n].line }]);
        break;
      }
    }
    scheduleRefresh();
  });

  // 図形を選んでいるときの Alt+↑ / Alt+↓ で、
  // 同じ親の中の前後の兄弟と入れ替える。DSL エディタ側の同じキー (FEAT-116) は
  // テキスト欄にカーソルがあるときだけ効くので、_kbdInTypingTarget() の除外で棲み分く。
  // 入れ替えの純関数は src/core/selection-reorder.js が持ち、親の境界 (else / endif /
  // start / stop / @enduml など) に当たったら DSL を 1 バイトも変えない。
  document.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var up = e.key === 'ArrowUp';
    if (!up && e.key !== 'ArrowDown') return;
    if (_kbdInTypingTarget() || _kbdModalOpen()) return;
    var SR = window.MA.selectionReorder;
    if (!SR) return;
    var cur = _kbdSelectedItem();
    if (!cur) return;
    e.preventDefault();
    var dir = up ? -1 : 1;
    var moved = SR.move(mmdText, cur.line, dir);
    if (moved === mmdText) return;      // 端 / 親の境界: 履歴も積まない
    var newLine = SR.movedLine(mmdText, cur.line, dir);
    window.MA.history.pushHistory();
    mmdText = moved;
    suppressSync = true;
    editorEl.value = moved;
    suppressSync = false;
    // Ctrl+D と同じ形で同期再パースし、行番号から選択を引き直す
    // (要素 id は文書順の連番なので、並び替えで振り直される)。
    if (currentModule && typeof currentModule.parse === 'function') {
      try { currentParsed = currentModule.parse(mmdText); } catch (err) { /* leave stale */ }
    }
    var after = _kbdSelectables();
    for (var i = 0; i < after.length; i++) {
      if (after[i].line === newLine) {
        kbdSetSelected(
          [{ type: after[i].type || 'message', id: after[i].id, line: after[i].line }]);
        break;
      }
    }
    scheduleRefresh();
  });

  // Ctrl+Enter で右ペインの「末尾に追加」を開く。
  // 行き先はコマンドパレットの「図に足す」(openTailForm) と同じ、無選択時の右ペインに出る
  // 種類 select (#{prefix}-tail-kind) である。ADD_KINDS / openTailForm は別スコープなので、
  // ここは図種の prefix を持たずに DOM から引く (種別は各 module の既定のまま)。
  document.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key !== 'Enter') return;
    // design 5b は Ctrl+Enter を「図の編集（図形を選んでいるとき）」に置く。図形を選ぶと
    // 右ペインの入力欄にフォーカスが移っているので、_kbdInTypingTarget() で外すと
    // 肝心の場面で効かない。Ctrl+Enter は入力欄でも既定の意味を持たないため奪ってよい
    // (素の Enter を扱う FEAT-017 の経路とは別ハンドラで、そちらの除外はそのまま)。
    if (_kbdModalOpen()) return;
    e.preventDefault();
    // 選択があると tail フォームは DOM に無いので、まず選択を外して描き直す。
    if (window.MA.selection) window.MA.selection.clearSelection();
    renderProps();
    var sel = document.querySelector('[id$="-tail-kind"]');
    if (!sel) return;
    if (sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    sel.focus();
  });

  // ── 図種レール (design 1a): 左端の SEQ/UC/CMP/CLS/ACT/ST ─────────────
  // レールは <select id="diagram-type"> の別経路であり、切り替えそのものは
  // 従来どおり select の change ハンドラ 1 本が行う (自動保存・履歴・タブの
  // 種類差し替えがそこに集約されているため、二重実装にしない)。
  (function setupDiagramRail() {
    var host = document.getElementById('rail-types');
    var sel = document.getElementById('diagram-type');
    var rail = window.MA.diagramRail;
    if (!host || !sel || !rail) return;

    // 現在の図種に合わせてレールを描き直す。
    syncRail = function() {
      host.innerHTML = rail.buildRailHtml(sel.value);
    };
    syncRail();

    host.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest ? e.target.closest('.rail-btn') : null;
      if (!btn) return;
      var t = btn.getAttribute('data-type');
      // 同じ図種の押し直しは何もしない。ただし右パネルが別の図種の追加フォームに
      // なっているときは、押した図種の追加フォームへ戻す。
      if (!t) return;
      if (t === sel.value && (!currentModule || currentModule.type === t || !modules[t])) return;
      sel.value = t;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      syncRail();
    });

    // select 側から変えられたときもハイライトを追随させる。
    sel.addEventListener('change', function() { syncRail(); syncZoomHud(); });

    var cfg = document.getElementById('rail-config');
    var cfgBtn = document.getElementById('btn-config');
    // design 7a: 最下段の設定も線画 + 略号 CFG に差し替える。絵文字 ⚙ だと
    // 大きさも色も図種ボタンと揃わないため (HTML 側は fallback として残す)。
    if (cfg && rail.buildConfigHtml) cfg.outerHTML = rail.buildConfigHtml();
    cfg = document.getElementById('rail-config');
    if (cfg && cfgBtn) cfg.addEventListener('click', function() { cfgBtn.click(); });
    // design 10a / 7a: FILES の印も同じ線画にする。ボタンごと差し替えると files-panel の
    // 押下の結線が外れるので、印の span だけを入れ替える。
    var filesGlyph = document.querySelector('#rail-files .rail-glyph');
    var filesSvg = rail.glyphSvg ? rail.glyphSvg('files') : '';
    if (filesGlyph && filesSvg) filesGlyph.outerHTML = filesSvg;
  })();

  // ── ツールメニュー (design 7a): 道具の 1 段の一覧 ────────────────
  // 入口はタブ列の右端の「ツール ▾」1 つ。項目は道具の名前 (tool-*) を持ち、押すと
  // runTool が窓を開く (Ctrl+K・Ctrl+H・ファイルの右クリックと同じ関数)。
  // タブ列に道具のボタンを並べる切り替え (畳む / 畳まない・ツール ▾ の置き場) は
  // TICKET-owner-20261123-0222-prune で外した。以前に切り替えた人の localStorage の値は読まない
  // (その人も既定と同じタブ列で開く)。
  (function setupToolMenu() {
    var btn = document.getElementById('btn-tab-tools');
    var menu = document.getElementById('tool-menu');
    var tm = window.MA.toolMenu;
    if (!btn || !menu || !tm) return;

    function setExpanded(v) {
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    }

    function close() {
      menu.hidden = true;
      setExpanded(false);
    }

    function open() {
      // 件数を持つ道具は今は無いので、件数の札は渡さない。
      menu.innerHTML = tm.buildMenuHtml({});
      menu.hidden = false;
      setExpanded(true);
      // 開いたらそのまま打てる。
      markCurrent(null);
      var f = menu.querySelector('#tool-menu-filter');
      if (f) f.focus();
    }

    // ── 1 段の一覧の絞り込み・キーボード ────────────
    // いま見えている項目 (絞り込み中はその結果)。↑↓ と Enter はこれを辿る。
    function visibleItems() {
      return Array.prototype.filter.call(
        menu.querySelectorAll('.tool-menu-items .tool-menu-item'),
        function(b) { return b.offsetParent !== null || !b.closest('[hidden]'); });
    }

    function markCurrent(item) {
      Array.prototype.forEach.call(menu.querySelectorAll('.tool-menu-item[aria-current]'),
        function(b) { b.removeAttribute('aria-current'); });
      if (item) item.setAttribute('aria-current', 'true');
    }

    function currentItem() {
      return menu.querySelector('.tool-menu-items .tool-menu-item[aria-current="true"]');
    }

    function moveItem(step) {
      var list = visibleItems();
      if (!list.length) return;
      var i = list.indexOf(currentItem());
      i = (i < 0) ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length;
      markCurrent(list[i]);
    }

    // 絞り込み: 一覧の代わりに候補を出す。空に戻すと一覧に帰る。
    function applyFilter(q) {
      var hits = menu.querySelector('.tool-menu-hits');
      var list = menu.querySelector('.tool-menu-list');
      if (!hits) return;
      var on = String(q || '').trim() !== '';
      if (list) list.hidden = on;
      hits.hidden = !on;
      if (on) {
        hits.innerHTML = tm.buildHitsHtml(q, {});
        markCurrent(hits.querySelector('.tool-menu-item'));
      } else {
        hits.innerHTML = '';
        markCurrent(null);
      }
    }

    menu.addEventListener('input', function(e) {
      if (!e.target || e.target.id !== 'tool-menu-filter') return;
      applyFilter(e.target.value);
    });

    menu.addEventListener('keydown', function(e) {
      if (menu.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveItem(-1); return; }
      if (e.key === 'Enter') {
        var cur = currentItem();
        if (cur) { e.preventDefault(); cur.click(); }
      }
    });

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });

    menu.addEventListener('click', function(e) {
      var item = e.target && e.target.closest ? e.target.closest('.tool-menu-item') : null;
      if (!item) return;
      var targetId = item.getAttribute('data-target');
      // 入口がモーダルの中にしか無いものは、先にその
      // 画面を開いてから道具を呼ぶ (メニューを開いた時点ではまだ DOM に無い)。
      var openerId = item.getAttribute('data-opener');
      close();
      // パネル類は「外側の click で閉じる」を document に付けているので、
      // 今の click を配り終えてから開く (同期だと開いた直後に閉じる)。
      setTimeout(function() {
        if (openerId) {
          var opener = document.getElementById(openerId);
          if (opener) opener.click();
        }
        // 開いた画面が中身を描くのを待ってから道具を呼ぶ。
        setTimeout(function() { runTool(targetId); }, openerId ? 60 : 0);
      }, 0);
    });

    document.addEventListener('click', function(e) {
      if (menu.hidden) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !menu.hidden) close();
    });
  })();

  // ── 下端の件数表示 (design 7a / 7b) ─────────────────────────────────────
  // 差分の件数はタブ列のボタン文字にしか出ておらず、ツールを畳むと
  // 画面から消える。件数は状態表示なので下端に寄せ、押したら従来と同じパネルを開く。
  // 数え直しはそれぞれの render*Badge が持っているので、ここはタブ列のボタン文字を
  // 写すだけにする (二重に数えて食い違うのを避ける)。
  (function setupStatusCounters() {
    var SC = window.MA.statusCounters;
    if (!SC) return;
    SC.items().forEach(function(it) {
      var out = document.getElementById(it.id);
      var src = document.getElementById(it.src);
      if (!out || !src) return;

      function sync() {
        var tok = SC.countToken(src.textContent);
        var n = /^[0-9]+$/.test(tok) ? parseInt(tok, 10) : null;
        out.classList.toggle('has-open', SC.isActive(src.textContent));
        out.title = src.title || it.title;
        applyStatusBadge(out, it.prefix, n, 'warn');
      }
      // パネル類は「外側の click で閉じる」を document に付けている。ここで同期に
      // src.click() を鳴らすと、開いた直後に今の click がそのまま document へ上がり、
      // 外側クリック扱いで閉じてしまう。今の click を配り終えてから鳴らす。
      out.addEventListener('click', function() {
        setTimeout(function() { src.click(); }, 0);
      });
      if (typeof MutationObserver === 'function') {
        new MutationObserver(sync).observe(src, {
          childList: true, characterData: true, subtree: true, attributes: true,
          attributeFilter: ['title'],
        });
      }
      sync();
    });
  })();

  // Open / Save
  document.getElementById('btn-open').addEventListener('click', openFile);
  document.getElementById('btn-save').addEventListener('click', saveFile);
  document.getElementById('file-input').addEventListener('change', onFilePicked);
  var btnOpenFile = document.getElementById('btn-open-file');
  if (btnOpenFile) btnOpenFile.addEventListener('click', openFile);
  setupFileDrop();
  try { renderOpenEmptyHint(); } catch (e) {}
  editorEl.addEventListener('input', function() {
    var h = document.getElementById('open-empty-hint');
    if (h) h.hidden = true;
  });

  // ── Settings modal (auto-save config) ────────────────────────────────
  (function setupConfigModal() {
    var btn = document.getElementById('btn-config');
    var modal = document.getElementById('cfg-modal');
    if (!btn || !modal) return;

    function fmtDate(iso) {
      if (!iso) return '(未保存)';
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '(不明)';
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
          + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      } catch (e) { return '(不明)'; }
    }

    function refreshMetaInfo() {
      var info = document.getElementById('cfg-meta-info');
      if (!info) return;
      var as = window.MA.autoSave;
      if (!as) { info.textContent = ''; return; }
      if (!as.isAvailable()) {
        info.textContent = '⚠ localStorage が使えないため自動保存は無効です';
        return;
      }
      var meta = as.getMeta();
      info.textContent = '最終保存: ' + fmtDate(meta && meta.lastSavedAt) +
        (meta && meta.lastSavedType ? ' (' + meta.lastSavedType.replace('plantuml-', '') + ')' : '');
    }

    function applyBackendVisibility(backend) {
      var dirRow = document.getElementById('cfg-file-dir-row');
      var AO0 = window.MA.autosaveOptions;
      var show = AO0 ? AO0.needsFileDir(backend) : (backend === 'file');
      if (dirRow) dirRow.style.display = show ? 'block' : 'none';
      showCfgFileDir();
    }

    // ── design 1a: 自動保存タブの中身 ────────────────────────────────
    // レンダリングタブと同じ語彙 (セグメント + カード) に揃える。値の並びと
    // 既定は MA.autosaveOptions が持ち、ここは DOM を作るだけ。
    var AO = window.MA.autosaveOptions;

    // 選択肢ごとに説明の付くカード 1 枚。renderModeCards と同じ見た目を使う。
    function buildOptionCard(radioName, card, onPick) {
      var label = document.createElement('label');
      label.className = 'cfg-mode-card';
      label.dataset.value = card.id;
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = radioName;
      radio.value = card.id;
      radio.checked = !!card.checked;
      radio.addEventListener('change', function() {
        if (this.checked && onPick) onPick(this.value);
      });
      var body = document.createElement('div');
      body.className = 'cfg-mode-body';
      var head = document.createElement('div');
      head.className = 'cfg-mode-head';
      var title = document.createElement('span');
      title.className = 'cfg-mode-title';
      title.textContent = card.title;
      head.appendChild(title);
      if (card.badge) {
        var badge = document.createElement('span');
        badge.className = 'cfg-mode-badge ' + card.badge.tone;
        badge.textContent = card.badge.text;
        head.appendChild(badge);
      }
      body.appendChild(head);
      if (card.desc) {
        var d = document.createElement('div');
        d.className = 'cfg-mode-privacy';
        d.textContent = card.desc;
        body.appendChild(d);
      }
      label.appendChild(radio);
      label.appendChild(body);
      return label;
    }

    function renderRestoreCards(selected) {
      var wrap = document.getElementById('cfg-restore-cards');
      if (!wrap || !AO) return;
      wrap.innerHTML = '';
      AO.restoreCards(selected).forEach(function(c) {
        wrap.appendChild(buildOptionCard('cfg-restore-mode', c, null));
      });
    }

    function renderBackendCards(selected) {
      var wrap = document.getElementById('cfg-backend-cards');
      if (!wrap || !AO) return;
      wrap.innerHTML = '';
      AO.backendCards(selected).forEach(function(c) {
        // 保存先ディレクトリ欄の出し入れはカードを選んだ瞬間に効かせる。
        wrap.appendChild(buildOptionCard('cfg-backend', c, applyBackendVisibility));
      });
    }

    function renderAutosaveDebounce(current) {
      var wrap = document.getElementById('cfg-debounce');
      if (!wrap || !AO) return;
      var cur = AO.normalizeDebounce(current);
      wrap.innerHTML = '';
      AO.DEBOUNCE_CHOICES.forEach(function(c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cfg-seg' + (c.value === cur ? ' active' : '');
        b.dataset.debounce = String(c.value);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', c.value === cur ? 'true' : 'false');
        b.textContent = c.label;
        b.addEventListener('click', function() {
          wrap.dataset.pending = String(c.value);
          Array.prototype.forEach.call(wrap.children, function(el) {
            var on = el === b;
            el.classList.toggle('active', on);
            el.setAttribute('aria-checked', on ? 'true' : 'false');
          });
        });
        wrap.appendChild(b);
      });
      wrap.dataset.pending = String(cur);
    }

    // ── design 1a: 5 タブ ───────────────────────────────────────────
    var ST = window.MA.settingsTabs;
    var RM = window.MA.renderModes;
    var _cfgMode = null;   // 設定モーダルの中で選ばれているモード (保存まで確定しない)
    var TAB_KEY = 'plantuml-settings-tab';
    var EDITOR_PREFS_KEY = 'plantuml-editor-prefs';
    var RENDER_DEBOUNCE_KEY = 'plantuml-render-debounce';
    var ERROR_OVERLAY_KEY = 'plantuml-render-error-overlay';

    function readErrorOverlay() {
      if (!RM) return true;
      var stored = null;
      try { stored = localStorage.getItem(ERROR_OVERLAY_KEY); } catch (e) {}
      return RM.normalizeErrorOverlay(stored);
    }
    // 保存済みの指定は設定モーダルを開かない回でも効かせる。
    currentErrorOverlay = readErrorOverlay();

    // 未保存なら現行の RENDER_DEBOUNCE_MS を一番近い選択肢に丸めて見せる
    // (既定の 150ms は利用者から見れば「即時」)。
    function readRenderDebounce() {
      if (!RM) return 300;
      var stored = null;
      try { stored = localStorage.getItem(RENDER_DEBOUNCE_KEY); } catch (e) {}
      return RM.normalizeDebounce(stored === null ? RENDER_DEBOUNCE_MS : stored);
    }

    // 保存済みの指定は、設定モーダルを開かない回でも効かせる。
    (function applyStoredDebounce() {
      if (!RM) return;
      var stored = null;
      try { stored = localStorage.getItem(RENDER_DEBOUNCE_KEY); } catch (e) {}
      if (stored !== null) RENDER_DEBOUNCE_MS = RM.normalizeDebounce(stored);
    })();

    function readEditorPrefs() {
      if (!ST) return { fontSize: 13, wrap: false };
      try {
        return ST.normalizeEditorPrefs(JSON.parse(localStorage.getItem(EDITOR_PREFS_KEY) || '{}'));
      } catch (e) { return ST.normalizeEditorPrefs(null); }
    }

    // 保存された見た目を textarea に当てる。設定モーダルを開かずに起動した回でも
    // 前回の指定が効いている必要があるので、結線時に 1 度呼ぶ。
    function applyEditorPrefs(prefs) {
      if (!ST) return;
      currentEditorPrefs = ST.normalizeEditorPrefs(prefs);
      if (!editorEl) return;
      var s = ST.editorStyleFor(prefs);
      editorEl.style.fontSize = s.fontSize;
      editorEl.style.whiteSpace = s.whiteSpace;
      editorEl.style.overflowX = s.overflowX;
    }

    function currentRenderMode() {
      var sel = document.getElementById('render-mode');
      return ST ? ST.normalizeRenderMode(sel && sel.value) : 'local';
    }

    // 注記はラジオの選択を写す。ツールバーの select は「保存」まで動かさないので、
    // ここで select を読むと online を選んでも local の注記が出たままになる。
    function checkedRenderMode() {
      var radios = document.getElementsByName('cfg-render-mode');
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
      return _cfgMode || currentRenderMode();
    }

    function showTab(id) {
      if (!ST) return;
      var active = ST.normalizeTab(id);
      var ids = ST.tabIds();
      for (var i = 0; i < ids.length; i++) {
        var pane = document.getElementById('cfg-pane-' + ids[i]);
        if (pane) pane.hidden = (ids[i] !== active);
        var tab = document.getElementById('cfg-tab-' + ids[i]);
        if (tab) {
          tab.classList.toggle('active', ids[i] === active);
          tab.setAttribute('aria-selected', ids[i] === active ? 'true' : 'false');
        }
      }
      try { localStorage.setItem(TAB_KEY, active); } catch (e) {}
    }

    function renderTabBar(active) {
      var bar = document.getElementById('cfg-tabs');
      if (!bar || !ST) return;
      bar.innerHTML = ST.buildTabsHtml(active);
      var btns = bar.querySelectorAll('[data-cfg-tab]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function() { showTab(this.getAttribute('data-cfg-tab')); });
      }
    }

    function refreshRenderNote() {
      var note = document.getElementById('cfg-render-note');
      if (note && ST) note.textContent = ST.renderModeNote(checkedRenderMode());
      var warn = document.getElementById('cfg-render-warning');
      if (warn && RM) {
        warn.textContent = RM.warningFor(checkedRenderMode(), _renderEnv);
        warn.style.display = warn.textContent ? 'block' : 'none';
      }
    }

    // ── 描画方法の 3 択カード (design 5a) ──────────────────────────────
    // 速度と外部送信の 2 点、それに Java の検出結果をカードの上に出す。
    // 選択そのものは従来どおり name="cfg-render-mode" のラジオが持ち、
    // 「保存」で #render-mode に流す既存経路をそのまま使う。
    function renderModeCards() {
      var wrap = document.getElementById('cfg-render-modes');
      if (!wrap || !RM) return;
      var selected = checkedRenderMode();
      wrap.innerHTML = '';
      RM.cards(_renderEnv, _renderTimings, selected).forEach(function(c) {
        var label = document.createElement('label');
        label.className = 'cfg-mode-card' + (c.selectable ? '' : ' disabled');
        label.dataset.modeId = c.id;
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'cfg-render-mode';
        radio.value = c.id;
        radio.checked = !!c.checked;
        radio.disabled = !c.selectable;
        radio.addEventListener('change', function() {
          _cfgMode = this.value;
          refreshRenderNote();
          renderModeCards();
        });
        var body = document.createElement('div');
        body.className = 'cfg-mode-body';
        var head = document.createElement('div');
        head.className = 'cfg-mode-head';
        var title = document.createElement('span');
        title.className = 'cfg-mode-title';
        title.textContent = c.title;
        head.appendChild(title);
        if (c.badge) {
          var badge = document.createElement('span');
          badge.className = 'cfg-mode-badge ' + c.badge.tone;
          badge.textContent = c.badge.text;
          head.appendChild(badge);
        }
        body.appendChild(head);
        [['cfg-mode-speed', c.speed], ['cfg-mode-privacy', c.privacy], ['cfg-mode-note', c.note]]
          .forEach(function(pair) {
            if (!pair[1]) return;
            var d = document.createElement('div');
            d.className = pair[0];
            d.textContent = pair[1];
            body.appendChild(d);
          });
        label.appendChild(radio);
        label.appendChild(body);
        wrap.appendChild(label);
      });
    }

    function renderDebounceChoices() {
      var wrap = document.getElementById('cfg-render-debounce');
      if (!wrap || !RM) return;
      var cur = readRenderDebounce();
      wrap.innerHTML = '';
      RM.DEBOUNCE_CHOICES.forEach(function(c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cfg-seg' + (c.value === cur ? ' active' : '');
        b.dataset.debounce = String(c.value);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', c.value === cur ? 'true' : 'false');
        b.textContent = c.label;
        b.addEventListener('click', function() {
          wrap.dataset.pending = String(c.value);
          Array.prototype.forEach.call(wrap.children, function(el) {
            var on = el === b;
            el.classList.toggle('active', on);
            el.setAttribute('aria-checked', on ? 'true' : 'false');
          });
        });
        wrap.appendChild(b);
      });
      wrap.dataset.pending = String(cur);
    }

    // design 5a: インデント幅の 3 択。debounce と同じセグメント。
    function renderIndentChoices(current) {
      var wrap = document.getElementById('cfg-editor-indent');
      var EI = window.MA.editorIndent;
      if (!wrap || !EI) return;
      var cur = EI.normalize(current);
      wrap.innerHTML = '';
      EI.CHOICES.forEach(function(c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cfg-seg' + (c.id === cur ? ' active' : '');
        b.dataset.indent = c.id;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', c.id === cur ? 'true' : 'false');
        b.textContent = c.label;
        b.addEventListener('click', function() {
          wrap.dataset.pending = c.id;
          Array.prototype.forEach.call(wrap.children, function(el) {
            var on = el === b;
            el.classList.toggle('active', on);
            el.setAttribute('aria-checked', on ? 'true' : 'false');
          });
        });
        wrap.appendChild(b);
      });
      wrap.dataset.pending = cur;
    }

    // Java の検出は server に 1 回だけ聞く。落ちても設定画面は開けるようにする。
    function loadRenderEnv() {
      if (_renderEnv || _renderEnvLoading) { renderModeCards(); return; }
      _renderEnvLoading = true;
      fetch('/env').then(function(r) { return r.json(); }).then(function(j) {
        _renderEnv = j;
      }).catch(function() {
        _renderEnv = { java: { found: false, version: null, major: null }, jar: true };
      }).then(function() {
        _renderEnvLoading = false;
        if (window.MA.appBridge) window.MA.appBridge.setEnv(_renderEnv);
        renderModeCards();
        refreshRenderNote();
        refreshEngineSection();
      });
    }

    // ── 描画エンジン ────────────────────────────
    // 配布物に plantuml.jar も Java も同梱しない。「どこにあるか」「入っているか」を
    // 設定のレンダリングタブに常時出し、足りなければこの場で入れられるようにする。
    // 判定と文言は src/core/app-bridge.js、ここは結線だけ。
    function refreshEngineSection() {
      var AB = window.MA.appBridge;
      if (!AB) return;
      var env = _renderEnv || {};
      var jar = AB.jarStatus(env);
      var java = AB.javaStatus(env);
      var jarEl = document.getElementById('cfg-jar-status');
      if (jarEl) {
        jarEl.textContent = jar.text;
        jarEl.style.color = jar.ok ? 'var(--text-secondary)' : 'var(--accent-red)';
      }
      // 「使用中 / 推奨」の版。違えば「取得し直す」、並行領域を描けない古い版ならその 1 行。
      var verRow = document.getElementById('cfg-jar-version-row');
      var verEl = document.getElementById('cfg-jar-version');
      var warnEl = document.getElementById('cfg-jar-version-warn');
      var refetchBtn = document.getElementById('cfg-jar-refetch');
      if (verRow) verRow.hidden = !jar.versionText;
      if (verEl) {
        verEl.textContent = jar.versionText || '';
        verEl.setAttribute('data-outdated', jar.outdated ? '1' : '0');
        verEl.setAttribute('data-differs', jar.differs ? '1' : '0');
        verEl.style.color = jar.differs ? 'var(--accent-red)' : 'var(--text-secondary)';
      }
      if (warnEl) {
        warnEl.textContent = jar.versionWarn || '';
        warnEl.hidden = !jar.versionWarn;
      }
      // 取得の入口は 1 つ (jar が無ければ「公式から取得」、あれば版の行の「取得し直す」)。
      var entries = AB.fetchEntries ? AB.fetchEntries(env) : { fetch: true, refetch: !!(jar.differs && jar.canFetch) };
      if (refetchBtn) refetchBtn.hidden = !entries.refetch;
      var pathEl = document.getElementById('cfg-jar-path');
      if (pathEl && document.activeElement !== pathEl) pathEl.value = env.jarPath || '';
      var javaEl = document.getElementById('cfg-java-status');
      if (javaEl) {
        javaEl.textContent = java.text;
        javaEl.style.color = java.ok ? 'var(--text-secondary)' : 'var(--accent-red)';
        if (!java.ok && java.url) {
          javaEl.textContent = java.text + ' — ';
          var link = document.createElement('a');
          link.href = java.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.id = 'cfg-java-link';
          link.textContent = 'Temurin を入手';
          javaEl.appendChild(link);
        }
      }
      var fetchBtn = document.getElementById('cfg-jar-fetch');
      if (fetchBtn) {
        fetchBtn.disabled = !jar.canFetch;
        fetchBtn.hidden = !entries.fetch;
      }
      var pickBtn = document.getElementById('cfg-jar-pick');
      // Web 版にはネイティブのダイアログが無いので、パス欄に打って反映させる。
      if (pickBtn) pickBtn.textContent = AB.isApp(env) ? 'jar を選ぶ' : 'このパスを使う';
    }

    // 取得中 / 完了 / 失敗を同じ 1 行で言い、失敗のときだけ
    // 「もう一度取得」を出す。文言と出し分けは appBridge.engineProgress が決める。
    function setEngineProgress(prog) {
      var el = document.getElementById('cfg-engine-note');
      var retry = document.getElementById('cfg-jar-retry');
      if (el) {
        el.textContent = prog.text || '';
        el.style.color = prog.bad ? 'var(--accent-red)' : 'var(--text-secondary)';
        el.setAttribute('data-engine-phase', prog.phase || '');
      }
      if (retry) retry.hidden = !prog.retry;
      var fetchBtn = document.getElementById('cfg-jar-fetch');
      var pickBtn = document.getElementById('cfg-jar-pick');
      if (fetchBtn) fetchBtn.disabled = !!prog.busy || !(window.MA.appBridge
        && window.MA.appBridge.jarStatus(_renderEnv || {}).canFetch);
      var refetch = document.getElementById('cfg-jar-refetch');
      if (refetch) refetch.disabled = !!prog.busy;
      if (pickBtn) pickBtn.disabled = !!prog.busy;
    }

    // jar が入った瞬間に、警告を出したままの図を描き直す。
    // ここを呼ばないと「設定は済んでいるのに画面は jar が無いと言い続ける」状態が
    // 残り、利用者はアプリを起動し直すしかなくなる。
    function refreshPreviewAfterEngineReady() {
      try { clearRenderError(); } catch (e) {}
      try { renderSvg(); } catch (e) {}
    }

    function afterEngineChange(res) {
      var AB = window.MA.appBridge;
      if (!AB) return;
      var before = _renderEnv;
      var phase = AB.phaseOf(res);
      if (phase === 'done') _renderEnv = (res && res.env) || _renderEnv;
      setEngineProgress(AB.engineProgress(phase, res));
      renderModeCards();
      refreshRenderNote();
      refreshEngineSection();
      if (AB.jarTurnedReady(before, _renderEnv)) refreshPreviewAfterEngineReady();
    }

    (function wireEngineButtons() {
      var AB = window.MA.appBridge;
      if (!AB) return;
      var doPick = function() {
        var pathEl = document.getElementById('cfg-jar-path');
        setEngineProgress(AB.engineProgress('picking'));
        if (AB.isApp(_renderEnv)) AB.pickJar().then(afterEngineChange);
        else AB.setJarPath(pathEl ? pathEl.value : '').then(afterEngineChange);
      };
      var doFetch = function() {
        setEngineProgress(AB.engineProgress('fetching'));
        AB.fetchJar().then(afterEngineChange);
      };
      var pickBtn = document.getElementById('cfg-jar-pick');
      if (pickBtn) pickBtn.addEventListener('click', doPick);
      var fetchBtn = document.getElementById('cfg-jar-fetch');
      if (fetchBtn) fetchBtn.addEventListener('click', doFetch);
      // 使用中の版が推奨版と違うときの「取得し直す」(推奨版を取って差し替える)。
      var refetchBtn = document.getElementById('cfg-jar-refetch');
      if (refetchBtn) refetchBtn.addEventListener('click', doFetch);
      // 失敗したときの再試行の入口。取得が使えない機械ではパス指定に落ちる。
      var retryBtn = document.getElementById('cfg-jar-retry');
      if (retryBtn) retryBtn.addEventListener('click', function() {
        if (AB.jarStatus(_renderEnv || {}).canFetch) doFetch();
        else doPick();
      });
    })();

    if (ST) {
      // design 5b: 「⌕ 操作名で検索」で表を絞る。打つたびに引き直すので、
      // 表そのものは 1 本の buildShortcutsHtml(query) から作る。
      var scSearch = document.getElementById('cfg-sc-search');
      // design 5b「行をクリックすると割り当てを変更」。押している間だけ id を持ち、
      // 表はその id を渡して描き直す (キー待ちの行だけ表記が変わる)。
      var scCapturing = null;
      var scNoteEl = document.getElementById('cfg-sc-note');
      var setScNote = function(text, bad) {
        if (!scNoteEl) return;
        scNoteEl.textContent = text || '';
        scNoteEl.setAttribute('data-sc-note', bad ? 'bad' : 'ok');
      };
      var drawShortcuts = function() {
        var list = document.getElementById('cfg-shortcuts-list');
        if (list) list.innerHTML = ST.buildShortcutsHtml(scSearch ? scSearch.value : '', scCapturing);
      };
      drawShortcuts();
      if (scSearch) scSearch.addEventListener('input', function() { scCapturing = null; drawShortcuts(); });

      var scList = document.getElementById('cfg-shortcuts-list');
      if (scList) {
        var startCapture = function(row) {
          if (!row || row.getAttribute('data-sc-remap') !== '1') return;
          scCapturing = row.getAttribute('data-sc-id');
          setScNote('新しいキーを押してください (Ctrl / Alt を含む組み合わせ)。Esc で取り消し。', false);
          drawShortcuts();
        };
        scList.addEventListener('click', function(e) {
          var row = e.target && e.target.closest ? e.target.closest('tr[data-sc-id]') : null;
          startCapture(row);
        });
        // キーボードだけでも行を開ける (行は tabindex="0" / role="button")。
        scList.addEventListener('keydown', function(e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          var row = e.target && e.target.closest ? e.target.closest('tr[data-sc-id]') : null;
          if (!row || row.getAttribute('data-sc-remap') !== '1') return;
          e.preventDefault();
          startCapture(row);
        });
      }

      // キー待ちの間は、押されたキーを割り当てとして食う。
      // 設定モーダルを開いている間だけの捕捉なので、他のショートカットとは競合しない。
      document.addEventListener('keydown', function(e) {
        if (!scCapturing) return;
        var KB = window.MA.keyBindings;
        if (!KB) return;
        if (e.key === 'Escape') {
          scCapturing = null;
          setScNote('取り消しました。', false);
          drawShortcuts();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        var keys = KB.format(e);
        e.preventDefault();
        e.stopPropagation();
        if (!keys) {
          // 修飾キーだけの打鍵は待ち続ける (Ctrl を押した瞬間に確定させない)。
          setScNote('Ctrl か Alt を含む組み合わせで押してください。', true);
          return;
        }
        var res = KB.setBinding(scCapturing, keys);
        if (!res.ok && res.reason === 'conflict') {
          setScNote('「' + res.conflict.desc + '」(' + res.conflict.keys + ') と重なります。別のキーを押してください。', true);
          return;
        }
        if (!res.ok) { setScNote('このキーは割り当てられません。', true); return; }
        scCapturing = null;
        setScNote(keys + ' に変更しました。', false);
        drawShortcuts();
      }, true);

      var scReset = document.getElementById('cfg-sc-reset');
      if (scReset) {
        scReset.addEventListener('click', function() {
          var KB = window.MA.keyBindings;
          if (!KB) return;
          KB.resetAll();
          scCapturing = null;
          setScNote('既定に戻しました。', false);
          drawShortcuts();
        });
      }
      applyEditorPrefs(readEditorPrefs());
    }

    function open() {
      var as = window.MA.autoSave;
      var cfg = as ? as.getConfig() : { enabled: true, debounceMs: 1000, restoreMode: 'confirm', backend: 'localStorage', fileDir: './autosave' };
      document.getElementById('cfg-enabled').checked = !!cfg.enabled;
      // セグメントとカードは開くたびに作り直す。保存済みの値がそのまま選択状態になる。
      renderAutosaveDebounce(cfg.debounceMs);
      renderRestoreCards(cfg.restoreMode);
      var backend = AO ? AO.normalizeBackend(cfg.backend) : (cfg.backend || 'localStorage');
      renderBackendCards(backend);
      applyBackendVisibility(backend);
      refreshMetaInfo();
      if (ST) {
        var mode = currentRenderMode();
        // カードは毎回作り直す。実測 ms も Java の検出結果も開くたびに変わりうる。
        _cfgMode = mode;
        renderModeCards();
        renderDebounceChoices();
        loadRenderEnv();
        refreshRenderNote();
        var prefs = readEditorPrefs();
        var fontSel = document.getElementById('cfg-editor-font');
        if (fontSel) fontSel.value = String(prefs.fontSize);
        var wrapEl = document.getElementById('cfg-editor-wrap');
        if (wrapEl) wrapEl.checked = !!prefs.wrap;
        var jumpEl = document.getElementById('cfg-editor-click-to-line');
        if (jumpEl) jumpEl.checked = !!prefs.clickToLine;
        renderIndentChoices(prefs.indent);
        var errOvEl = document.getElementById('cfg-render-error-overlay');
        if (errOvEl) errOvEl.checked = readErrorOverlay();
        var savedTab = 'autosave';
        try { savedTab = localStorage.getItem(TAB_KEY) || 'autosave'; } catch (e) {}
        renderTabBar(ST.normalizeTab(savedTab));
        showTab(savedTab);
      }
      loadVersion();
      // 閉じたら開く前の場所 (左レールの CFG など) へ手を戻す。
      _returnFocusEl = document.activeElement;
      modal.style.display = 'flex';
    }
    var _returnFocusEl = null;
    function close() { modal.style.display = 'none'; }
    function isOpen() { return modal.style.display === 'flex'; }

    // TICKET-owner-20261116-0621-1: Esc は「キャンセル」と同じ。変更を保存せずに閉じ、開く前の場所へ手を戻す
    // (他の窓・メニューと同じ)。ショートカットのキー待ち中の Esc はその取り消しだけ (そちらが preventDefault する)。
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      // キー待ちの行があればその取り消しが先 (窓は閉じない)。
      var capturing = !!modal.querySelector('.cfg-sc-capturing');
      var ST0 = window.MA.settingsTabs;
      var closes = ST0 && ST0.escClosesSettings
        ? ST0.escClosesSettings(e, isOpen(), capturing)
        : (!e.isComposing && !e.defaultPrevented && isOpen() && !capturing);
      if (!closes) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      var back = _returnFocusEl;
      _returnFocusEl = null;
      if (back && back.focus && back !== document.body && document.body.contains(back)) back.focus();
    });

    btn.addEventListener('click', open);

    // 上部バーからモードの select を外した
    // 代わりに、状態表示から設定の「レンダリング」タブへ直接開ける口を出す。
    // タブ指定で開けるようにしておくと、他の入口も同じ経路を使える。
    // 設定 → 情報 に版を出す。server が git tag から返す。
    var _versionLine = '';
    // 「更新を確認」。押したとき (と、利用者が入れたときだけ起動時) に 1 回確かめる。
    // 新版があれば版・変更点・インストーラへのリンクを出す。落とさない・実行しない。
    (function wireUpdateCheck() {
      var UC = window.MA.updateCheck;
      var btnCheck = document.getElementById('cfg-update-check');
      if (!UC || !btnCheck) return;
      var st = document.getElementById('cfg-update-status');
      var box = document.getElementById('cfg-update-result');
      var auto = document.getElementById('cfg-update-auto');
      var last = null;
      function openUrl(url) {
        if (!url || !UC.isRepoUrl(url)) return;
        fetch('/open-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }) })
          .then(function(r) { if (!r.ok) throw new Error(); })
          .catch(function() { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* 開けなくても画面は動く */ } });
      }
      function check(quiet) {
        if (st && !quiet) st.textContent = '確認中…';
        return fetch('/update-check').then(function(r) { return r.json(); })
          .catch(function(e) { return { error: '通信できません' }; })
          .then(function(resp) {
            last = UC.evaluate(resp);
            if (st && (!quiet || last.status === 'newer')) st.textContent = last.message;
            if (box) box.style.display = last.status === 'newer' ? 'flex' : 'none';
            var rail = document.getElementById('rail-config');
            if (rail && last.status === 'newer') rail.setAttribute('title', '設定 — ' + last.message);
            return last;
          });
      }
      btnCheck.addEventListener('click', function() { check(false); });
      var notes = document.getElementById('cfg-update-notes');
      if (notes) notes.addEventListener('click', function() { if (last) openUrl(last.notesUrl); });
      var get = document.getElementById('cfg-update-get');
      if (get) get.addEventListener('click', function() { if (last) openUrl(last.installerUrl); });
      var stored = null;
      try { stored = window.localStorage.getItem(UC.AUTO_KEY); } catch (e) { /* 読めなければ既定の切 */ }
      if (auto) {
        auto.checked = UC.autoCheckEnabled(stored);
        auto.addEventListener('change', function() {
          try { window.localStorage.setItem(UC.AUTO_KEY, auto.checked ? '1' : '0'); } catch (e) { /* 保存できなくても画面は動く */ }
        });
      }
      if (UC.autoCheckEnabled(stored)) check(true);
    })();
    function loadVersion() {
      var el = document.getElementById('cfg-version');
      var AV = window.MA.appVersion;
      if (!el || !AV || _versionLine) return;
      fetch('/version').then(function(r) { return r.ok ? r.json() : {}; })
        .catch(function() { return {}; })
        .then(function(info) {
          _versionLine = AV.formatLine(info);
          el.textContent = _versionLine;
        });
    }
    (function wireVersionCopy() {
      var b = document.getElementById('cfg-version-copy');
      if (!b) return;
      b.addEventListener('click', function() {
        var el = document.getElementById('cfg-version');
        var text = (el && el.textContent) || '';
        var st = document.getElementById('cfg-version-status');
        function done(ok) { if (st) st.textContent = ok ? '複製しました' : '複製できませんでした (文字列を選んでコピーしてください)'; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() { done(true); }, function() { done(fallbackCopy(text)); });
        } else {
          done(fallbackCopy(text));
        }
      });
      function fallbackCopy(text) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch (e) { return false; }
      }
    })();

    window.MA.openSettingsTab = function(tabId) {
      open();
      if (tabId && ST) {
        var t = ST.normalizeTab(tabId);
        renderTabBar(t);
        showTab(t);
      }
    };
    document.getElementById('cfg-cancel').addEventListener('click', close);
    // 保存先のフォルダは FILES・Import ▾・Ctrl+K と同じ 1 つの窓で辿って選ぶ。
    // 設定の窓は保存せずに閉じてから開く (設定の「保存」が選んだ保存先を前の値で上書きしないように)。
    var pickDir = document.getElementById('cfg-file-dir-pick');
    if (pickDir) pickDir.addEventListener('click', function() {
      close();
      openChangeTarget();
    });
    var closeX = document.getElementById('cfg-close');
    if (closeX) closeX.addEventListener('click', close);
    document.getElementById('cfg-ok').addEventListener('click', function() {
      var enabled = document.getElementById('cfg-enabled').checked;
      var dbSeg = document.getElementById('cfg-debounce');
      var debounceMs = AO ? AO.normalizeDebounce(dbSeg && dbSeg.dataset.pending)
                          : parseInt((dbSeg && dbSeg.dataset.pending) || '1000', 10);
      var radios = document.getElementsByName('cfg-restore-mode');
      var restoreMode = 'confirm';
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) { restoreMode = radios[i].value; break; }
      var backendRadios = document.getElementsByName('cfg-backend');
      var backend = 'localStorage';
      for (var j = 0; j < backendRadios.length; j++) if (backendRadios[j].checked) { backend = backendRadios[j].value; break; }
      // TICKET-owner-20261122-1240-1: 保存先のフォルダは ⚙ では打たない (窓の中の 1 か所で選ぶ)。
      // 「設定を保存」は今の保存先をそのまま使う。窓で決めた保存先を前の値で上書きしない。
      var fileDir = _cfgCurrentFileDir();
      // 前の版で ⚙ の欄に打った \ 区切りの値は、直せる崩れなら / に直して保存する (直せない値は触らない)。
      var SDH = window.MA.saveDirCheck;
      if (SDH && backend === 'file') {
        var chk = SDH.check(fileDir);
        if (chk.ok) fileDir = chk.value;
      }
      if (window.MA.autoSave) {
        var prevCfg = window.MA.autoSave.getConfig() || {};
        // 開いているタブは前の保存先のファイルを指し続ける。
        _holdOpenDocsBeforeTargetChange(prevCfg, backend, fileDir);
        window.MA.autoSave.setConfig({
          enabled: enabled,
          debounceMs: debounceMs,
          restoreMode: restoreMode,
          backend: backend,
          fileDir: fileDir,
        });
        // 保存先を変えたらすぐ上部バーに映す (次に開くまで古い表示を残さない)。
        updateTopSaveTarget();
        // 保存先の一覧 (FILES の部品フォルダ・上部バーの部品の段が読む)
        // も新しいフォルダで読み直す。読み直さないと前のフォルダの図 (diagram1 など) が残り、
        // 新しい保存先の下に前のフォルダの部品 (DIAGRAM1) が並び、パンくずにもその段が出た。
        if (prevCfg.fileDir !== fileDir || prevCfg.backend !== backend) {
          try { reloadFolderListNow(); } catch (e) {}
        }
      }
      // レンダリングモードとエディタの見た目も同じ「保存」で確定する。
      // モード切替は既存の #render-mode を唯一の窓口に保ち、change を投げて
      // 再描画・localStorage 保存の既存経路に載せる。
      if (ST) {
        var modeRadios2 = document.getElementsByName('cfg-render-mode');
        var mode2 = 'local';
        for (var m = 0; m < modeRadios2.length; m++) if (modeRadios2[m].checked) { mode2 = modeRadios2[m].value; break; }
        var modeSel = document.getElementById('render-mode');
        if (modeSel && modeSel.value !== ST.normalizeRenderMode(mode2)) {
          modeSel.value = ST.normalizeRenderMode(mode2);
          modeSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // design 5a: 入力を止めてから描画するまでの間隔。
        var dbWrap = document.getElementById('cfg-render-debounce');
        if (dbWrap && RM) {
          var db = RM.normalizeDebounce(dbWrap.dataset.pending);
          try { localStorage.setItem(RENDER_DEBOUNCE_KEY, String(db)); } catch (e) {}
          RENDER_DEBOUNCE_MS = db;
        }
        var fontSel2 = document.getElementById('cfg-editor-font');
        var wrapEl2 = document.getElementById('cfg-editor-wrap');
        var jumpEl2 = document.getElementById('cfg-editor-click-to-line');
        var indentWrap = document.getElementById('cfg-editor-indent');
        var prefs2 = ST.normalizeEditorPrefs({
          fontSize: fontSel2 ? fontSel2.value : undefined,
          wrap: wrapEl2 ? wrapEl2.checked : false,
          clickToLine: jumpEl2 ? jumpEl2.checked : true,
          indent: indentWrap ? indentWrap.dataset.pending : undefined,
        });
        // design 5a: 描画エラーの出し方。
        var errOvEl2 = document.getElementById('cfg-render-error-overlay');
        if (errOvEl2 && RM) {
          currentErrorOverlay = RM.normalizeErrorOverlay(errOvEl2.checked);
          try { localStorage.setItem(ERROR_OVERLAY_KEY, String(currentErrorOverlay)); } catch (e) {}
        }
        try { localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(prefs2)); } catch (e) {}
        applyEditorPrefs(prefs2);
      }
      // 初回起動で jar を入れた回は、まだ「jar がない」と
      // 言ったままの図が残っている。保存した時点で描き直し、再起動を要らなくする。
      var AB2 = window.MA.appBridge;
      var banner = document.getElementById('render-error-overlay');
      var showingError = !!(banner && !banner.hidden)
        || (renderStatusEl && renderStatusEl.textContent === 'ERROR');
      if (AB2 && AB2.jarReady(_renderEnv) && showingError) refreshPreviewAfterEngineReady();
      close();
    });
    document.getElementById('cfg-clear-all').addEventListener('click', function() {
      if (!window.confirm('保存中の全 DSL とエディタの編集中内容を消去し、 デフォルトテンプレに戻します。 続行しますか？')) return;
      if (window.MA.autoSave) window.MA.autoSave.clearAll();
      // Reset editor + mmdText to the current type's template, so the
      // in-memory DSL doesn't immediately re-save on the next input/
      // type-switch/beforeunload (clearAll already cancels the pending
      // debounce timer, but leaving stale mmdText would still let the
      // very next save trigger re-create the keys we just deleted).
      try { window.localStorage.removeItem('plantuml-diagram-type'); } catch (e) {}
      // 開いていたタブも全部畳んで 1 枚に戻す。
      if (window.MA.workspace) {
        try {
          window.MA.workspace.reset();
          window.MA.workspace.init({ name: 'diagram1', diagramType: currentDiagramType, dsl: currentModule.template() });
          renderTabs();
        } catch (e) {}
      }
      mmdText = currentModule.template();
      suppressSync = true;
      editorEl.value = mmdText;
      suppressSync = false;
      try { currentParsed = currentModule.parse(mmdText); } catch (e) { currentParsed = null; }
      window.MA.selection.clearSelection();
      isFirstRender = true;
      scheduleRefresh();
      refreshMetaInfo();
    });
    // 保存先ディレクトリ欄の出し入れは renderBackendCards がカードごとに結線する
    // (カードは open() のたびに作り直されるので、ここで静的に拾うことはできない)。
  })();

  // Zoom
  document.getElementById('btn-zoom-in').addEventListener('click', function() { setZoom(zoom + 0.1); });
  document.getElementById('btn-zoom-out').addEventListener('click', function() { setZoom(zoom - 0.1); });
  document.getElementById('btn-zoom-fit').addEventListener('click', zoomToFit);

  // ── キャンバス上に浮くズーム帯 (design 1a) ───────────────────────────
  // 倍率の適用そのものは従来どおり setZoom / zoomToFit の 1 本で、帯はその
  // 呼び出し口をキャンバスの上へ持ってきただけ。表示は setZoom 内の
  // syncZoomHud() が一括で更新するので、ツールバー・ホイール・パレットの
  // どこから倍率が変わっても帯が古い値のまま残らない。
  (function setupZoomHud() {
    var host = document.getElementById('zoom-hud');
    var hud = window.MA.zoomHud;
    if (!host || !hud) return;

    // 帯はキャンバス (#preview-container) の右上に置く。状態遷移図では
    // キャンバスの上に状態遷移表の見出しが出るので、固定の top: 40px のままだと
    // 帯がその見出し (▾ で畳むボタン) に重なって押せない。見出しの下 = キャンバスの上端に下ろす。
    function placeHud() {
      var pane = document.getElementById('preview-pane');
      var cont = document.getElementById('preview-container');
      if (!pane || !cont) return;
      var top = cont.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      if (!(top > 0)) return;   // 画面に出ていない (幅 0 など) ときは触らない
      host.style.top = Math.max(40, Math.round(top) + 8) + 'px';
    }
    syncZoomHud = function() {
      host.innerHTML = hud.buildHudHtml(currentDiagramType, zoom);
      placeHud();
    };
    syncZoomHud();
    // 見出しの開け閉め・図種の切り替えでキャンバスの上端が動くと、キャンバスの高さも変わる。
    if (typeof window.ResizeObserver === 'function') {
      try {
        var ro = new window.ResizeObserver(function() { placeHud(); });
        var contEl = document.getElementById('preview-container');
        if (contEl) ro.observe(contEl);
        ['state-table-panel', 'overlay-warning'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) ro.observe(el);
        });
      } catch (e) { /* 無くても既定の位置で動く */ }
    }
    window.addEventListener('resize', placeHud);

    host.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest ? e.target.closest('.hud-btn') : null;
      if (!btn || btn.disabled) return;
      if (btn.id === 'hud-zoom-in') setZoom(hud.stepZoom(zoom, 1));
      else if (btn.id === 'hud-zoom-out') setZoom(hud.stepZoom(zoom, -1));
      else if (btn.id === 'hud-zoom-fit') zoomToFit();
    });
  })();

  // ── 状態遷移表 (design 4c) ───────────────────────────────────────────────
  // 表と図は同じ currentParsed から作るので、片方だけが古くなることはない。
  // 表そのものの組み立ては state-table.js の純関数で、ここは DOM への
  // 差し込みとクリックの行き先だけを持つ。
  (function setupStateTable() {
    var panel = document.getElementById('state-table-panel');
    var body = document.getElementById('state-table-body');
    var toggle = document.getElementById('btn-state-table-toggle');
    var ST = window.MA.stateTable;
    if (!panel || !body || !toggle || !ST) return;

    var open = false;
    var sttCollapsed = {};

    function currentTable() {
      try { return ST.build(currentParsed); } catch (e) { return { triggers: [], rows: [] }; }
    }

    function tableHtml(table) {
      var esc = window.MA.htmlUtils.escHtml;
      var selIds = {};
      window.MA.selection.getSelected().forEach(function(s) { selIds[s.id] = true; });
      var html = '<table><thead><tr><th>現在の状態 \\ きっかけ</th>';
      table.triggers.forEach(function(t) { html += '<th>' + esc(t) + '</th>'; });
      html += '</tr></thead><tbody>';
      table.rows.forEach(function(row) {
        // 入れ子の子は親の下に字下げして出し、親の行を畳めば隠れる。
        var anc = ST.ancestorsOf(row.stateId, currentParsed);
        for (var ai = 0; ai < anc.length; ai++) if (sttCollapsed[anc[ai]]) return;
        var twisty = row.hasChildren
          ? '<button type="button" class="stt-twisty" data-stt-fold="' + esc(row.stateId) + '" title="' +
              (sttCollapsed[row.stateId] ? '中の状態を出す' : '中の状態を畳む') + '">' +
              (sttCollapsed[row.stateId] ? '▸' : '▾') + '</button> '
          : '';
        html += '<tr data-stt-row="' + esc(row.stateId) + '" data-depth="' + (row.depth || 0) + '">' +
          '<th style="padding-left:' + (6 + 14 * (row.depth || 0)) + 'px">' + twisty + esc(row.label) + '</th>';
        row.cells.forEach(function(cell, j) {
          var attrs = ' class="stt-cell' + (cell ? '' : ' stt-empty') +
            (cell && selIds[cell.transitionId] ? ' stt-selected' : '') + '"' +
            ' data-state-id="' + esc(row.stateId) + '"' +
            ' data-trigger="' + esc(table.triggers[j]) + '"' +
            (cell ? ' data-transition-id="' + esc(cell.transitionId) + '"' +
                    ' data-line="' + cell.line + '"' : '') +
            ' title="' + (cell ? 'この遷移を選択' : 'ここに遷移を追加') + '"';
          html += '<td' + attrs + '>' + esc(cell ? cell.text : ST.EMPTY_CELL) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table>' +
        '<div id="state-table-summary">' + esc(ST.summaryText(table)) +
        ' — セルをクリックすると該当の遷移を選択します。空欄をクリックすると遷移を新規追加します。</div>';
      return html;
    }

    syncStateTable = function() {
      var isState = currentDiagramType === 'plantuml-state';
      panel.hidden = !isState;
      if (!isState) { body.hidden = true; return; }
      body.hidden = !open;
      if (open) body.innerHTML = tableHtml(currentTable());
    };

    toggle.addEventListener('click', function() {
      open = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = '状態遷移表 / State transition table ' + (open ? '⌃' : '⌄');
      syncStateTable();
    });

    body.addEventListener('click', function(e) {
      var fold = e.target && e.target.closest ? e.target.closest('[data-stt-fold]') : null;
      if (fold) {
        var fid = fold.getAttribute('data-stt-fold');
        sttCollapsed[fid] = !sttCollapsed[fid];
        syncStateTable();
        return;
      }
      var td = e.target && e.target.closest ? e.target.closest('td.stt-cell') : null;
      if (!td) return;
      var tid = td.getAttribute('data-transition-id');
      if (tid) {
        // 埋まっているセル: その遷移を選ぶ。右パネルは通常の遷移編集が開く。
        window.MA.selection.setSelected([{
          type: 'transition', id: tid, line: Number(td.getAttribute('data-line')),
        }]);
        return;
      }
      // 空欄: 行 (from) と列 (trigger) を入れた遷移追加フォームを開く。
      if (typeof currentModule.showAddTransitionModal !== 'function') return;
      currentModule.showAddTransitionModal(_editCtx(false), currentParsed, td.getAttribute('data-state-id'), {
        trigger: td.getAttribute('data-trigger') === window.MA.stateTable.NO_TRIGGER
          ? '' : td.getAttribute('data-trigger'),
      });
    });

    syncStateTable();
  })();

  // 右パネルの「Properties / 図の設定」タブ。
  var tabProps = document.getElementById('props-tab-props');
  var tabSettings = document.getElementById('props-tab-settings');
  if (tabProps && tabSettings) {
    tabProps.addEventListener('click', function() { showPropsTab('props'); });
    tabSettings.addEventListener('click', function() { showPropsTab('settings'); });
  }

  // Export menu
  var btnExport = document.getElementById('btn-export');
  var exportMenu = document.getElementById('export-menu');
  btnExport.addEventListener('click', function(e) {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
    if (exportMenu.classList.contains('open')) refreshExportDest();
  });
  // TICKET-primary-20261115-2240-wish: 書き出し先の行の「替える…」(Export ▾ の項目ではない)。
  var expDestChange = document.getElementById('export-dest-change');
  if (expDestChange) {
    expDestChange.addEventListener('click', function(e) {
      e.stopPropagation();
      exportMenu.classList.remove('open');
      openExportDestPick();
    });
  }
  var expDestBox = document.getElementById('export-dest');
  if (expDestBox) expDestBox.addEventListener('click', function(e) { e.stopPropagation(); });
  document.addEventListener('click', function() { exportMenu.classList.remove('open'); });
  document.getElementById('exp-svg').addEventListener('click', function() { exportMenu.classList.remove('open'); exportSVG(); });
  document.getElementById('exp-png').addEventListener('click', function() { exportMenu.classList.remove('open'); exportPNG(false); });
  document.getElementById('exp-png-transparent').addEventListener('click', function() { exportMenu.classList.remove('open'); exportPNG(true); });
  document.getElementById('exp-clipboard').addEventListener('click', function() { exportMenu.classList.remove('open'); exportClipboard(); });
  // 開いている図すべての zip・名前を付けた図の組・Export ▾ の「渡す」見出しは TICKET-owner-20261116-0140-prune で外した。
  // Export ▾ は 1 枚の図の SVG / PNG / 透過 PNG / クリップボードの 4 項目。

  // FEAT-117 (resolves HFR-046 前半): Ctrl+E でエクスポートメニューを開き、先頭項目へ
  // フォーカスを移してキーボードだけで形式を選べるようにする。
  // 履歴ルーター (Ctrl+Z / Ctrl+Y) の早期 return の意味を壊さないため、そちらに相乗りせず
  // Export menu ブロック内に専用のリスナを足す。Ctrl+Shift+E / Ctrl+Alt+E は将来の割当の
  // ために発火させない。
  // FEAT-165 (resolves UI-017): Ctrl+E 押下直前のフォーカス元を保存し、Esc での復帰に使う。
  var exportReturnFocusEl = null;
  document.addEventListener('keydown', function(e) {
    var KB = window.MA.keyBindings;
    if (!KB || !KB.matches('export-menu', e)) return;
    e.preventDefault();
    exportReturnFocusEl = document.activeElement;
    exportMenu.classList.add('open');
    refreshExportDest();
    var firstItem = document.getElementById('exp-svg');
    if (firstItem) firstItem.focus();
  });

  // design 2c: よく使う 2 つ (SVG 保存 / クリップボードにコピー) はメニューを開かずに
  // 1 発で出せる。当たり判定は export-shortcuts が唯一の規約で、メニュー行に出る
  // キー表示も同じ表から引くので、表示と挙動が食い違わない。
  //
  // Shift 必須なので、ブラウザの Ctrl+S (ページ保存) や textarea の Ctrl+C は奪わない。
  // 入力欄にフォーカスがあっても発火してよい (文字入力を潰さない組み合わせのため)。
  document.addEventListener('keydown', function(e) {
    var ES = window.MA.exportShortcuts;
    var KB = window.MA.keyBindings;
    if (!ES) return;
    // 当たり判定は key-bindings (差し替え済みのキーを含む) を先に見て、
    // まだ読み込まれていないときだけ export-shortcuts の既定に落ちる。
    var targetId = KB ? KB.matchEvent(e) : ES.matchEvent(e);
    if (targetId !== 'exp-svg' && targetId !== 'exp-clipboard') return;
    var btn = document.getElementById(targetId);
    if (!btn) return;
    e.preventDefault();
    exportMenu.classList.remove('open');
    btn.click();
  });

  // メニュー行の右にキー割り当てを出す (design 2c)。
  (function paintExportKeyHints() {
    var ES = window.MA.exportShortcuts;
    if (!ES) return;
    var list = ES.bindings();
    for (var i = 0; i < list.length; i++) {
      var row = document.getElementById(list[i].id);
      if (!row) continue;
      var hint = document.createElement('span');
      hint.className = 'exp-key';
      hint.textContent = list[i].keys;
      row.appendChild(hint);
    }
  })();

  // FEAT-165 (resolves UI-017): Esc でエクスポートメニューを閉じ、Ctrl+E 押下前の要素へ
  // フォーカスを戻す。既存の click による close 経路と、既存の Escape (participant ドラッグ
  // 中断) は変更せず、後者を優先するためドラッグ中は何もしない。
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (dragState && dragState.dragging) return;
    if (!exportMenu.classList.contains('open')) return;
    exportMenu.classList.remove('open');
    var back = exportReturnFocusEl;
    exportReturnFocusEl = null;
    if (back && back.focus && document.body.contains(back)) back.focus();
  });

  // design 5c: 挿入位置を選んでいる間の「Esc で取り消し」。右パネルにそう出す以上、
  // Esc で挿入メニューが閉じて印も消えるところまでを 1 つの動きにする。
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' || e.isComposing) return;
    var IM = window.MA.insertMarker;
    if (!IM || IM.getTarget() === null) return;
    // 種別を選ぶ段 (ピッカー) だけを対象にする。入力を始めた後のフォームで
    // Esc が閉じない挙動は FEAT-017 [AC-6] で決まっているので触らない。
    var closed = false;
    [['seq-modal', 'seq-pick-cancel'], ['act-modal', 'act-pick-cancel']].forEach(function(pair) {
      var m = document.getElementById(pair[0]);
      if (!m || m.style.display !== 'flex') return;
      if (!document.getElementById(pair[1])) return;
      m.style.display = 'none';
      var c = document.getElementById(pair[0] + '-content');
      if (c) c.innerHTML = '';
      closed = true;
    });
    if (!closed) return;
    IM.hide();
    e.preventDefault();
    e.stopPropagation();
  });

  // design 5b: 設定のショートカット表に載せた「全体」「表示」のキーを効かせる。
  // 表に載っていて効かないキーは「無い」と読めてしまうので、表と実装をここで揃える。
  //
  // 作法は既存の history ルーター (:653) にそろえる:
  //  - IME 変換中は素通しする
  //  - Alt / Shift 付きは別物 (Ctrl+Shift+S は Export の SVG 保存に予約済み)
  //  - フォーム入力中は奪わない。ただし DSL エディタは例外で、ここのキーはどれも
  //    「今の図」に対する操作 (再描画・保存・倍率・図種) なので、DSL を書きながらでも
  //    効いた方が台本の往復に合う。design 5b でも「表示」に但し書きが無い
  // Ctrl+R / Ctrl+S: ブラウザ既定 (再読み込み / ページ保存) を奪う。図の再描画と
  // ファイル保存はこのアプリで最も繰り返す 2 つで、既定の方が事故が大きい。
  //
  // design 5b の「行をクリックすると割り当てを変更」で差し替えられる 2 つなので、
  // キーの判定は key-bindings に聞く (下の倍率・図種は範囲の割り当てで差し替え対象外)。
  document.addEventListener('keydown', function(e) {
    var KB = window.MA.keyBindings;
    if (!KB) return;
    var hit = null;
    if (KB.matches('render', e)) hit = 'render';
    else if (KB.matches('save', e)) hit = 'save';
    // 一括置換。既定でタブ列から畳まれているツールなので、
    // メニューを辿らず / Ctrl+K でコマンド名を打たずに開ける道を 1 本用意する。
    else if (KB.matches('bulk-rename', e)) hit = 'bulk-rename';
    if (!hit) return;
    if (e.isComposing || e.keyCode === 229) return;
    var ae0 = document.activeElement;
    var inField0 = ae0 && ae0 !== editorEl
      && (ae0.tagName === 'INPUT' || ae0.tagName === 'TEXTAREA' || ae0.tagName === 'SELECT' || ae0.isContentEditable);
    // Ctrl+S (保存) と Ctrl+H (一括置換) は、どの入力欄に
    // カーソルがあっても効かせる (Ctrl+K / Ctrl+P と同じ。VS Code の Ctrl+H も入力欄を選ばない)。
    // FILES の絞り込み欄に焦点があると開かず、Ctrl+K で名前を打つ迂回 (2 → 11 打鍵) になっていた。
    // 再描画 (Ctrl+R) だけは従来どおり、フォーム入力中は奪わない。
    if (inField0 && hit === 'render') return;
    e.preventDefault();
    if (hit === 'render') { scheduleRefresh(); return; }
    if (hit === 'bulk-rename') {
      var renamePanel = document.getElementById('rename-panel');
      // 一括置換の枠の中の入力欄で押したときは閉じない (開いたまま置換前の欄へ戻る)。
      if (inField0 && renamePanel && renamePanel.classList.contains('open') && renamePanel.contains(ae0)) {
        var rf = document.getElementById('rename-from');
        if (rf) rf.focus();
        return;
      }
      runTool('tool-rename');
      return;
    }
    // フォームの欄で打ちかけの値は change (欄を離れたとき) で図に入る。先に欄を離れてから保存する。
    if (inField0 && typeof ae0.blur === 'function') ae0.blur();
    var saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.click();
  });

  document.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    var key = String(e.key || '');

    var ae = document.activeElement;
    var inField = ae && ae !== editorEl
      && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);

    if (inField) return;

    // Ctrl+ + / − / 0。'+' はレイアウトによって '=' や ';' で来るので e.code も見る。
    if (key === '+' || key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault(); setZoom(zoom + 0.1); return;
    }
    if (key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault(); setZoom(zoom - 0.1); return;
    }
    if (key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
      e.preventDefault(); zoomToFit(); return;
    }

    // Ctrl+1 … Ctrl+6 は左レールの並び (SEQ / UC / CMP / CLS / ACT / ST) と同じ順。
    if (key >= '1' && key <= '6') {
      var rail = window.MA.diagramRail;
      var sel = document.getElementById('diagram-type');
      if (!rail || !sel) return;
      var item = rail.items()[Number(key) - 1];
      if (!item) return;
      e.preventDefault();
      if (item.type === sel.value) return;   // 同じ図種の押し直しは何もしない
      sel.value = item.type;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // design 5b「選択解除 — Esc」。モーダル / メニュー / ドラッグを閉じる既存の Esc は
  // どれも先に自分で処理して止まるので、ここは「他に閉じるものが無いとき」だけ効く。
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (dragState && dragState.dragging) return;
    var ae = document.activeElement;
    // DSL エディタは例外にする。design 5a が図のクリックで focus をここへ移すので、
    // textarea を一律に除外すると「図で選んで Esc」が効かなくなる。
    // textarea 内の Esc にブラウザ既定の意味は無いため、奪っても入力の邪魔にならない。
    if (ae && ae !== editorEl
      && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    var sel = window.MA.selection;
    if (!sel || typeof sel.getSelected !== 'function') return;
    if ((sel.getSelected() || []).length === 0) return;
    e.preventDefault();
    sel.clearSelection();
  });

  // Ctrl+wheel zoom, Shift+wheel horizontal scroll on preview
  var previewContainer = document.getElementById('preview-container');
  previewContainer.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      var delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom(zoom + delta);
    } else if (e.shiftKey && !e.ctrlKey) {
      previewContainer.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  document.getElementById('diagram-type').addEventListener('change', function() {
    var t = this.value;
    var mod = modules[t];
    if (!mod) return;
    // 今の図種を選び直しただけなら、本文を入れ替えない
    // (本文から図種をそろえた後に同じ図種を選ぶと、見本や下書きで本文が潰れる)。
    if (t === currentDiagramType && currentModule === mod) {
      syncRail();
      syncZoomHud();
      return;
    }
    // 図種はそのままで右パネルだけが別の図種 (本文や描画の
    // 当て推量) になっているときに同じ図種を選び直したら、本文は入れ替えずに、利用者が
    // 選んだ図種の追加フォームに戻す。本文に決め手の語が出れば従来どおり本文に従う。
    if (t === currentDiagramType) {
      _svgKindFix = null;
      currentModule = mod;
      try { currentParsed = currentModule.parse(mmdText); } catch (e) { /* leave stale */ }
      window.MA.selection.clearSelection();
      try { renderProps(currentParsed); } catch (e) {}
      syncRail();
      syncZoomHud();
      scheduleRefresh();
      return;
    }
    // 図種を選ぶ操作 (レール・図種欄・Ctrl+1〜6・コマンド) は、
    // 本文が空か見本のままのタブにだけ効く。利用者の行があるタブの本文は替えず、押した図種の
    // 新しいタブを開く (draw.io・VS Code と同じく、図種やテンプレートの選択は新しいファイルを作る)。
    // 替えると、タブ名とファイル名はそのままで本文だけが見本になり、Ctrl+S で保存済みの図を潰していた。
    var BDu = window.MA.blankDoc;
    var curTpl = '';
    try { curTpl = currentModule && currentModule.template ? currentModule.template() : ''; } catch (e) { curTpl = ''; }
    var untouchedNow = !!(BDu && (BDu.isUntouched(mmdText, curTpl, currentDiagramType)
      || _isUntouchedDoc({ dsl: mmdText, diagramType: currentDiagramType })));
    if (!untouchedNow && window.MA.workspace) {
      openTypeInNewTab(t);
      return;
    }
    // 見本・白紙のままのタブは、出ていく図種の本文をディスクへ書かない (書くと `{名前}.puml` が
    // 見本で作られ、次の保存で図種が替わったとして `{名前}_{図種}.puml` が別に増えていた)。
    // 保存を待っている打鍵があればそれだけ先に流す。
    if (window.MA.autoSave) {
      try { window.MA.autoSave.flush(); } catch (e) { /* never block type switch */ }
    }
    // Persist the active type so the next page load can restore it.
    try { window.localStorage.setItem('plantuml-diagram-type', t); } catch (e) { /* private mode etc */ }
    // タブごとに図の種類を持つ: 現在のタブの種類を差し替える。DSL は
    // 下で新しい種類の内容に入れ替わるので、そちらは後段で書き戻す。
    var wsDoc = null;
    if (window.MA.workspace) {
      try { wsDoc = window.MA.workspace.updateActive({ dsl: mmdText, diagramType: t }); } catch (e) {}
    }
    // 切り替える前の図が白紙・見本のままだったかを
    // 見てから差し替える (白紙のタブで図種を選び直しただけの人に見本を出さない)。
    var prevType = currentDiagramType;
    var prevTemplate = currentModule && currentModule.template ? currentModule.template() : '';
    currentDiagramType = t;
    window.MA.history.pushHistory();
    currentModule = mod;  // explicit user choice overrides auto-detection
    // 図種別の控え (autoSave の図種ごとの最後の本文) は入れない。
    // タブごとに図を持つので、控えは別のタブの図の写しであり、白紙のタブに入れると同じ図が
    // 別の名前でもう 1 枚できる。ここに来るのは白紙・見本のタブだけなので、切り替え先の白紙にする。
    var savedForType = null;
    var BDs = window.MA.blankDoc;
    mmdText = BDs
      ? BDs.dslForTypeSwitch(mmdText, savedForType, mod.template(), prevTemplate,
          { fromType: prevType, toType: t })
      : ((savedForType != null && savedForType !== '') ? savedForType : mod.template());
    suppressSync = true;
    editorEl.value = mmdText;
    suppressSync = false;
    if (window.MA.workspace && wsDoc) {
      try { window.MA.workspace.updateActive({ dsl: mmdText, diagramType: t }); } catch (e) {}
    }
    // 見本・図種別の下書きを入れたのは利用者の編集ではない。次の描画で自動保存に載せない
    // (前の図のファイル名へ見本を書かない。)。
    markTextSynced();
    if (typeof renderTabs === 'function') renderTabs();
    // Reparse with the new module BEFORE clearSelection() so that the
    // selection callback's renderProps() sees a parsedData shape matching
    // the new module. Otherwise the previous module's parsedData (e.g.
    // state's {states, transitions, notes}) leaks into the new module's
    // renderProps which expects a different shape (e.g. sequence's
    // {elements, relations, groups}) and throws — preventing the next
    // scheduleRefresh() from running and leaving the preview stuck on
    // the previous diagram.
    try { currentParsed = currentModule.parse(mmdText); } catch (e) { /* leave stale */ }
    window.MA.selection.clearSelection();
    isFirstRender = true;
    scheduleRefresh();
  });

  window.MA.history.init({
    // Ctrl+Z の行き先の判定 (undo-route) に「この操作は右パネルから来たか」を控える。
    onPush: function() {
      var UR = window.MA.undoRoute;
      if (UR) UR.onPush(_undoRouteState, _inPropsPane(document.activeElement));
    },
    getMmdText: function() { return mmdText; },
    setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; scheduleRefresh(); },
    onUpdate: function() { updateUndoRedoButtons(); },
    // 履歴は図 (タブ) ごと。エディタに入っている図の id で引き分ける。
    getKey: function() {
      if (_historyDocId) return _historyDocId;
      try { return window.MA.workspace ? window.MA.workspace.getActiveId() : ''; } catch (e) { return ''; }
    },
    // 元に戻した本文で図種の判定が替わっても、次の自動保存でタブ名・ファイル名を付け替えない
    // (名前を変えるのは F2 と図の設定の図名だけ)。
    onRestore: function() {
      try {
        var d = window.MA.workspace ? window.MA.workspace.getActive() : null;
        if (d && d.name && window.MA.autoSave && window.MA.autoSave.keepNameOnce) window.MA.autoSave.keepNameOnce(d.name);
      } catch (e) {}
    },
  });

  window.MA.selection.init(function() {
    var ovEl = document.getElementById('overlay-layer');
    var sel = window.MA.selection.getSelected() || [];
    if (moduleHas('overlaySelection') && ovEl) {
      window.MA.selectionRouter.applyHighlight(ovEl, sel);
    }
    // 選択状態に入ったらその瞬間に hover ガイドを消す (mousemove を待たない)
    if (sel.length > 0) clearHoverGuide();
    // design 5a: 図で選んだものの DSL 行へエディタを動かす。
    jumpEditorToSelection(sel);
    updateSelectionNotice(sel);
    renderProps();
    // 表の選択枠を図・右パネルと同じ選択に合わせる。
    syncStateTable();
  });

  setupTabs();
  setupBulkRename();
  renderDiffBadge();
  setupLiveDiffGuard();
  setupSaveSwap();
  setupOverlayOriginSync();
  setupVersionTimeline();
  setupSeniorPane();
  setupSeniorGit();
  setupLineEdit();
  setupCompareView();

  setZoom(1.0);
  updateLineNumbers();
  scheduleRefresh();
  // ── Auto-save: best-effort flush on tab hide / unload ───────────────
  // visibilitychange catches user switching tabs / OS minimize.
  // beforeunload catches tab close / reload / navigation. Both are wrapped
  // in try/catch so a flush failure can never block tab teardown.
  if (window.MA.autoSave) {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        try { window.MA.autoSave.flush(); } catch (e) {}
      }
    });
    window.addEventListener('beforeunload', function() {
      try { window.MA.autoSave.flush(); } catch (e) {}
    });
  }

  // ── Auto-save: status indicator ─────────────────────────────────────
  // Render「13:31 に自動保存」(design 9c、絵文字なし) in #status-autosave, refreshed on
  // every successful flush AND every 5 seconds (so the relative-time
  // text stays current without requiring another flush).
  (function setupAutoSaveStatus() {
    var span = document.getElementById('status-autosave');
    if (!span || !window.MA.autoSave || !window.MA.autoSave.onSave) return;

    function relTime(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
      if (sec < 5) return 'たった今';
      if (sec < 60) return sec + '秒前';
      if (sec < 3600) return Math.floor(sec / 60) + '分前';
      return Math.floor(sec / 3600) + '時間前';
    }
    // 直近の記録をどのタブの図の回かで分けて持つ (札は今のタブの図の回を言う)。
    var _asSeen = null;
    var _asByDoc = {};
    function update() {
      if (!window.MA.autoSave.isAvailable()) {
        span.textContent = '';
        return;
      }
      var meta = window.MA.autoSave.getMeta();
      var AST = window.MA.autosaveStatus;
      if (!meta || !AST) { span.textContent = ''; return; }
      var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
      var last = window.MA.autoSave.getLastWrite ? window.MA.autoSave.getLastWrite() : null;
      // 札は今のタブのファイルを指す (前のタブで書いた記録を名乗らない)。
      // 新しい記録はその時のタブの図の回 (書くのは今のタブ。切り替えの前に flush する)。
      if (last && (!_asSeen || _asSeen.at !== last.at || _asSeen.fileName !== last.fileName || _asSeen.where !== last.where || _asSeen.reason !== last.reason)) {
        _asSeen = last;
        if (doc) _asByDoc[doc.id] = last;
      }
      var _fa = (AST.forActive && doc) ? AST.forActive(_asByDoc[doc.id] || null, last) : { last: last, at: null };
      last = _fa.last;
      // design 9c: 時刻は HH:MM の 1 形で渡す (秒まで出す機械的な形にしない)。
      var _savedAt = _fa.at || meta.lastSavedAt;
      var _sd = _savedAt ? new Date(_savedAt) : null;
      var _clock = (_sd && !isNaN(_sd.getTime()))
        ? (('0' + _sd.getHours()).slice(-2) + ':' + ('0' + _sd.getMinutes()).slice(-2)) : '';
      var d = AST.describe(meta, last, relTime(meta.lastSavedAt), doc && doc.name, _clock);
      span.textContent = d.text;
      span.title = d.title;
    }
    renderAutoSaveStatus = update;
    window.MA.autoSave.onSave(function() { update(); });
    update();
    setInterval(update, 5000);
  })();

  initCommandPalette();

  // design 10a: 保存先の節は既定で開いた状態で出す (復元した保存先を読んでから描く)。
  try { _openFolderListAtBoot(); } catch (e) {}

  startHeartbeat();
  // init は保存先の取り込み (/prefs の応答、最大 3 秒) を待ってから走る。それまでの画面は
  // 骨格だけで、下端の札やボタンを押しても何も起きない。押せるようになった印を 1 つ立てる
  // (読み込み直した直後に押す台本は、この印を待ってから押す)。
  try { document.documentElement.setAttribute('data-app-ready', '1'); } catch (e) {}
}

// 行番号から要素を選ぶ。プレビュー上の座標は
// 遷移を 1 本足すだけで動くが、行番号は再レイアウトで動かない。
// Ctrl+K のジャンプと構造タブの行クリックがここを共有する。
function selectElementAtLine(line) {
  if (!window.MA.selection || !currentModule) return false;
  var SAL = window.MA.selectAtLine;
  var list = (typeof currentModule.kbdSelectables === 'function')
    ? (currentModule.kbdSelectables(currentParsed) || [])
    : SAL.messageSelectables(currentParsed);
  var hit = SAL.pick(list, line);
  if (!hit) return false;
  window.MA.selection.setSelected([hit]);
  return true;
}

// ── Command palette (design 1a) ───────────────
// design「リデザイン案」1a は「ツールバーのボタンを目で探す」代わりに
// Ctrl+K で名前を打ってコマンドを実行する経路を求める。コマンドの中身は
// 既存のツールバー要素を click / change するだけにしてある。挙動を 1 つの
// 経路に保つためで、ボタン側の実装が変わってもパレットが古びない。
// 絞り込み・並び・カーソル移動は MA.commandPalette (unit テスト済み) が持つ。
function initCommandPalette() {
  var CP = window.MA.commandPalette;
  var modal = document.getElementById('cp-modal');
  var input = document.getElementById('cp-input');
  var listEl = document.getElementById('cp-list');
  var emptyEl = document.getElementById('cp-empty');
  var footEl = document.getElementById('cp-foot');
  var openBtn = document.getElementById('btn-command-palette');
  if (!CP || !modal || !input || !listEl) return;

  var items = [];       // 絞り込み前
  var shown = [];       // 絞り込み後 (画面の並びと同じ)
  var active = -1;
  var returnFocusEl = null;
  var groupFilter = null;   // Tab で絞った種別。null なら全部

  function clickById(id) {
    var el = document.getElementById(id);
    if (el) el.click();
  }
  function selectValue(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var DIAGRAMS = [
    { value: 'plantuml-sequence', label: 'Sequence / シーケンス図' },
    { value: 'plantuml-usecase', label: 'UseCase / ユースケース図' },
    { value: 'plantuml-component', label: 'Component / コンポーネント図' },
    { value: 'plantuml-class', label: 'Class / クラス図' },
    { value: 'plantuml-activity', label: 'Activity / アクティビティ図' },
    { value: 'plantuml-state', label: 'State / 状態遷移図' },
  ];

  function commands() {
    var list = [
      { id: 'open', title: 'ファイルを開く / Open', hint: 'File', keywords: ['open', 'file', 'ひらく'], run: function() { clickById('btn-open'); } },
      // 「保存」の一語で名指しできるのはこれ。
      // 「保存フォルダの図を一覧」「前回保存からの差分」「保存先のフォルダを選ぶ…」にも
      // その 2 文字は入っているので、完全一致のキーワードで本命を先頭に出す。
      { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', keywords: ['保存', 'save', 'file', 'ほぞん'], run: function() { clickById('btn-save'); } },
      // タブバーの道具はどれもパレットに無く、design 1a で
      // ペインが狭くなった後は潰れたラベルを目で数えて押すしか経路が無かった。
      // タブ列から「ツール ▾」も消えるので、
      // ツールの一覧そのものを引く経路をここに置く (メニューは画面左上に開く)。
      { id: 'tab-tools', title: 'ツールの一覧を開く / Tools', hint: 'Tabs', keywords: ['tool', 'menu', 'つーる', 'どうぐ', 'ぶんるい', 'めにゅー'], run: function() { setTimeout(function() { clickById('btn-tab-tools'); }, 0); } },
      { id: 'tab-new', title: '新しい図を開く / New diagram', hint: 'Tabs', keywords: ['new', 'tab', 'あたらしい', 'ず'], button: 'btn-tab-new', run: function() { clickById('btn-tab-new'); } },
      // 保存先の行の右クリック・Import ▾・⚙ 設定と同じ窓を、窓の見出しと同じ語で出す (TICKET-owner-20261122-1240-1)。
      // 前の名前「別のフォルダを保存先にする」「保存先を変える」と英語は検索語に残す。
      { id: 'change-target', title: '保存先のフォルダを選ぶ…', hint: 'Files', keywords: ['別のフォルダを保存先にする', '保存先を変える', 'べつのフォルダ', '別のフォルダ', '保存先', 'ほぞんさき', 'えらぶ', '選ぶ', 'かえる', '変える', '自動保存', 'じどうほぞん', 'change save folder', 'save', 'folder', 'autosave', 'target'], run: function() { setTimeout(openChangeTarget, 0); } },
      // 保存先の一覧を開く入口 (FILES の保存先の右クリック・Import ▾・Ctrl+K) は同じ語で出す (TICKET-owner-20261123-1202-1)。
      // 前の語「FILES: 保存先を開く」「保存フォルダの図を開く（一覧）」と英語は検索語に残す。
      { id: 'tab-folder', title: '保存先の一覧を開く', hint: 'Files', keywords: ['保存先の一覧', '一覧', 'FILES: 保存先を開く', '保存先を開く', '保存フォルダの図を開く（一覧）', '保存フォルダの図', 'Files: save folder', 'folder', 'files', 'tree', 'list', 'いちらん', 'ふぉるだ', 'ほぞんさき'], button: 'btn-tab-folder', run: function() { _ensureFolderListOpen(); } },
      { id: 'tab-rename', title: '部品名を一括置換 / Bulk rename', hint: 'Tabs', keywords: ['rename', 'replace', 'いっかつ', 'ちかん'], button: 'tool-rename', run: function() { runTool('tool-rename'); } },
      // 題はツール ▾ の語と同じ (右端に前の名前「行編集」を並べない。TICKET-owner-20261123-1242-1)。前の名前は検索語に残す。
      { id: 'tab-lines', title: '行を書き換える', hint: 'Tabs', keywords: ['行編集', '行編集を開く', 'Line edit', 'line', 'edit', 'ぎょう', 'へんしゅう'], button: 'tool-lines', run: function() { runTool('tool-lines'); } },
      // design 9a: 手元の .puml を開く入口は上部バーの Import ▾ へ移した。
      { id: 'import-clipboard', title: 'クリップボードの DSL から開く / Open from clipboard', hint: 'File', keywords: ['clipboard', 'paste', 'import', 'くりっぷ', 'はりつけ', 'ひらく'], run: function() { clickById('imp-clipboard'); } },
      // この図の履歴 を開く行は FILES のファイルの右クリックと同じ「この図の履歴を表示」1 行 (TICKET-owner-20261123-1242-1)。
      // 前の語「この図の履歴を見る」と旧名「変遷」は語に落とす。
      // 「前回保存からの差分」の行は TICKET-owner-20261115-2141-prune で外し、その語はこの行で引く
      // (前回保存版と比べる入口は「この図の履歴」の行の「比較」1 つ)。
      { id: 'tab-versions', title: 'この図の履歴を表示', hint: 'Tabs', keywords: ['履歴を表示', 'この図の履歴を見る', 'Version history', 'version', 'timeline', 'history', 'へんせん', 'りれき', '変遷', 'この図の変遷', '履歴', '保存した版', 'diff', 'さぶん', '差分', '前回保存', 'ぜんかいほぞん'], button: 'tool-versions', run: function() { runTool('tool-versions'); } },
      { id: 'settings', title: '設定を開く / Settings', hint: 'Ctrl', keywords: ['settings', 'config', 'せってい'], run: function() { clickById('btn-config'); } },
      { id: 'undo', title: '元に戻す / Undo', hint: 'Ctrl+Z', keywords: ['undo', 'もどす'], run: function() { clickById('btn-undo'); } },
      { id: 'redo', title: 'やり直す / Redo', hint: 'Ctrl+Y', keywords: ['redo', 'やりなおす'], run: function() { clickById('btn-redo'); } },
      { id: 'zoom-in', title: '拡大 / Zoom in', hint: 'View', keywords: ['zoom', 'かくだい'], run: function() { clickById('btn-zoom-in'); } },
      { id: 'zoom-out', title: '縮小 / Zoom out', hint: 'View', keywords: ['zoom', 'しゅくしょう'], run: function() { clickById('btn-zoom-out'); } },
      { id: 'zoom-fit', title: '幅に合わせる / Fit', hint: 'View', keywords: ['zoom', 'fit'], run: function() { clickById('btn-zoom-fit'); } },
      { id: 'render', title: '再描画 / Render', hint: 'View', keywords: ['render', 'refresh', 'さいびょうが'], run: function() { clickById('btn-render'); } },
      // 書き出しの 3 行は Export ▾ の項目・FILES の右クリックと同じ語で出す (TICKET-owner-20261122-2242-2)。
      // 前の語「SVG として保存」と英語は検索語に残す。
      { id: 'export-svg', title: 'SVG で書き出す', hint: 'Export', keywords: ['export', 'svg', 'かきだす', 'SVG として保存', 'Export SVG'], run: function() { clickById('exp-svg'); } },
      { id: 'export-png', title: 'PNG で書き出す', hint: 'Export', keywords: ['export', 'png', 'かきだす', 'PNG として保存', 'Export PNG'], run: function() { clickById('exp-png'); } },
      { id: 'export-png-t', title: 'PNG（透過背景）で書き出す', hint: 'Export', keywords: ['export', 'png', 'transparent', 'かきだす', 'とうか', 'Export PNG transparent'], run: function() { clickById('exp-png-transparent'); } },
      { id: 'export-clip', title: 'クリップボードにコピー / Copy image', hint: 'Export', keywords: ['export', 'clipboard', 'copy'], run: function() { clickById('exp-clipboard'); } },
      { id: 'mode-local', title: 'レンダリング: local (Java)', hint: 'Render', keywords: ['render', 'mode', 'local'], run: function() { selectValue('render-mode', 'local'); } },
      { id: 'mode-online', title: 'レンダリング: online (plantuml.com)', hint: 'Render', keywords: ['render', 'mode', 'online'], run: function() { selectValue('render-mode', 'online'); } },
    ];
    DIAGRAMS.forEach(function(d) {
      list.push({
        id: 'diagram-' + d.value,
        title: '図種を切り替え: ' + d.label,
        hint: 'Diagram',
        keywords: ['diagram', d.value, d.label],
        run: function() { selectValue('diagram-type', d.value); },
      });
    });
    // 直前に開いた図は、📂 一覧を開いて名前を目で探さなくても
    // ここから直接戻れる。新しい順に並べるので、出戻り先はたいてい先頭にいる。
    var RFC = window.MA.recentFiles;
    if (RFC) {
      recentOpenedNames().forEach(function(name) {
        list.push({
          id: 'recent:' + name,
          title: RFC.paletteTitle(name),
          hint: 'File',
          keywords: ['recent', 'reopen', name, RFC.label(name), 'さいきん', 'もどる', 'ひらきなおす'],
          run: function() { openFromFolderByName(name); },
        });
      });
    }
    return list;
  }

  // ── 図に足す / Add ─────────────────────────────────────────────────────
  // design「1a 展開」2a は、パレットを開いた直後に「図に足せるもの」を先頭に
  // 並べることを求める。行き先は右ペインの「末尾に追加」フォームの種類 select
  // (#{prefix}-tail-kind) で、値は各 module の option とそろえてある。
  // 選択があるときは tail フォームが DOM に無いので、まず選択を外して描き直す。
  var ADD_KINDS = {
    'plantuml-sequence': { prefix: 'seq', kinds: [
      { value: 'message', label: 'メッセージ' },
      { value: 'participant', label: '参加者' },
      { value: 'note', label: '注釈' },
      { value: 'block', label: '条件分岐・繰り返しの枠 (alt/loop)' },
      { value: 'activation', label: '実行中の帯 (activate)' },
      { value: 'bulk', label: '一括 (複数行)' },
    ] },
    'plantuml-usecase': { prefix: 'uc', kinds: [
      { value: 'actor', label: 'アクター' },
      { value: 'usecase', label: 'ユースケース' },
      { value: 'package', label: 'Package 境界' },
      { value: 'relation', label: '関係' },
      { value: 'bulk', label: '一括 (複数行)' },
    ] },
    'plantuml-component': { prefix: 'co', kinds: [
      { value: 'component', label: 'コンポーネント' },
      { value: 'interface', label: 'インタフェース' },
      { value: 'port', label: 'ポート' },
      { value: 'package', label: 'Package 境界' },
      { value: 'relation', label: '依存関係' },
      { value: 'bulk', label: '一括 (複数行)' },
    ] },
    'plantuml-class': { prefix: 'cl', kinds: [
      { value: 'class', label: 'クラス' },
      { value: 'interface', label: 'インタフェース' },
      { value: 'abstract', label: '抽象クラス' },
      { value: 'enum', label: '列挙' },
      { value: 'package', label: 'Package 境界' },
      { value: 'namespace', label: 'Namespace' },
      { value: 'relation', label: '関連' },
      { value: 'note', label: '注釈' },
      // 種別チップ「まとめて」と同じく、クラス構成の窓まで開く。
      { value: 'bulk', label: '一括 (複数行)', then: 'cl-scaffold-open' },
    ] },
    'plantuml-activity': { prefix: 'ac', kinds: [
      { value: 'action', label: 'アクション' },
      { value: 'start', label: '開始' },
      { value: 'stop', label: '停止' },
      { value: 'if', label: '条件分岐 (if)' },
      { value: 'while', label: '繰り返し (while)' },
      { value: 'end', label: '終了' },
      { value: 'repeat', label: '後判定の繰り返し (repeat)' },
      { value: 'fork', label: '並行 (fork)' },
      { value: 'swimlane', label: 'レーン (swimlane)' },
      { value: 'note', label: '注釈' },
      { value: 'other', label: '中断・切り離し・打ち切り (break / detach / kill)' },
      { value: 'bulk', label: '一括 (複数行)' },
    ] },
    'plantuml-state': { prefix: 'st', kinds: [
      { value: 'state', label: '状態' },
      // 子状態は種別「状態」+ 追加する位置「{親} の中」。検索語は残し、同じフォームへ連れていく。
      { value: 'child', label: '子状態 (状態の中に入れる)', kind: 'state', place: 'inside' },
      { value: 'composite', label: '複合状態' },
      { value: 'transition', label: '遷移' },
      { value: 'note', label: '注釈' },
      { value: 'bulk', label: '一括 (複数行)' },
    ] },
  };

  function openTailForm(prefix, kindValue, place) {
    if (window.MA.selection) window.MA.selection.clearSelection();
    renderProps();
    var sel = document.getElementById(prefix + '-tail-kind');
    if (!sel) return;
    sel.value = kindValue;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    // 「中に入れる」入口は「追加する位置」を「{親} の中」にして、その欄へ連れていく。
    var whereEl = place === 'inside' ? document.getElementById(prefix + '-tail-where') : null;
    if (whereEl) {
      if (String(whereEl.value).indexOf('in:') !== 0) {
        for (var i = 0; i < whereEl.options.length; i++) {
          if (String(whereEl.options[i].value).indexOf('in:') === 0) {
            whereEl.value = whereEl.options[i].value;
            whereEl.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }
      whereEl.focus();
      return;
    }
    sel.focus();
  }

  function addCommands() {
    var typeEl = document.getElementById('diagram-type');
    var spec = ADD_KINDS[typeEl ? typeEl.value : ''];
    if (!spec) return [];
    // 用語 (子状態・複合状態) を知らない人は、
    // 正しい語を打てないので入口に届かない。「入れ子」「中に入れる」のような
    // 知っている言葉からも同じ入口に来られるようにする。
    var AKV = window.MA.addKindVocab;
    var dtype = typeEl ? typeEl.value : '';
    return spec.kinds.map(function(k) {
      var plain = AKV ? AKV.words(dtype, k.value) : [];
      return {
        id: 'add-' + spec.prefix + '-' + k.value,
        group: 'add',
        title: k.label,
        hint: '追加',
        // 追加フォームを 1 つにし確定ボタンを「+ 追加」にそろえたので、
        // 旧名 (末尾に追加 / この位置に挿入 / Action 追加 …) で覚えた人もここから同じ入口に来られるようにする。
        keywords: ['add', 'ついか', k.value, k.label, '末尾に追加', 'この位置に挿入', 'ここに挿入', 'insert',
          k.value + ' 追加', k.value.charAt(0).toUpperCase() + k.value.slice(1) + ' 追加'].concat(plain),
        run: function() { openTailForm(spec.prefix, k.kind || k.value, k.place); if (k.then) clickById(k.then); },
      };
    });
  }

  // ── 選択中の要素に対して / Selected ────────────────────────────────────
  // 右ペインに今出ている操作ボタンをそのまま候補にする。図種ごとに固有の
  // ボタン (⚡ ライフライン推論 / ⌗ alt/loop で囲む…) を列挙し直さずに済み、
  // モジュール側でボタンが増えてもパレットが古びない。
  function selectedCommands() {
    var sel = (window.MA.selection && window.MA.selection.getSelected)
      ? (window.MA.selection.getSelected() || []) : [];
    if (!sel.length || !propsEl) return [];
    var out = [];
    Array.prototype.forEach.call(propsEl.querySelectorAll('button'), function(btn, i) {
      var label = (btn.textContent || '').trim();
      if (!label || btn.disabled) return;
      // 値を選ぶボタン (矢印の種類・関係の種類のカード、その開閉) は「操作」では
      // ないので候補にしない。design 2a の Selected は「呼び出しの開始・終了を
      // 自動で入れる」「条件分岐・繰り返しの枠で囲む」のような操作だけを並べる。
      // 入れてしまうと矢印 20 種で上限が埋まり、肝心の操作が 1 つも出ない。
      if (btn.hasAttribute('data-value') || btn.hasAttribute('aria-controls')) return;
      // 本文欄の書式ボタン (B / I / U / 色) も、単体で選んでも意味が無いので外す。
      if (/(^|\s)rle-/.test(btn.className || '')) return;
      // design 2a: 候補名は「何が起きるか」、記法は右に小さく (hint)。
      // ボタンの文字そのままだと「⚡ ライフライン推論 (activate/deactivate)」に
      // なり、図種の語彙を知っている人にしか読み取れない。
      var d = window.MA.commandPalette.describeAction(label);
      out.push({
        id: 'sel-' + i,
        group: 'selected',
        title: d.title,
        hint: d.hint,
        keywords: ['selected', 'せんたく', label, d.title, d.hint],
        run: function() { btn.click(); },
      });
    });
    return out.slice(0, 20);
  }

  // jump 候補を選んだとき、その行の要素を右ペインでも選択状態にする
  // (design 2a「選ぶとその行を選択し、右パネルで編集できます」)。
  function selectAtLine(line) { return selectElementAtLine(line); }

  // element を選んだらエディタの該当行へキャレットを置き、その行が見える位置へ送る。
  function gotoLine(line) {
    if (!editorEl) return;
    var lines = editorEl.value.split('\n');
    var offset = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
    editorEl.focus();
    editorEl.setSelectionRange(offset, offset + (lines[line - 1] || '').length);
    var lineHeight = editorEl.scrollHeight / Math.max(1, lines.length);
    editorEl.scrollTop = Math.max(0, (line - 3) * lineHeight);
  }

  function render() {
    listEl.innerHTML = '';
    var lastGroup = null;
    shown.forEach(function(item, i) {
      var g = item.group || 'command';
      if (g !== lastGroup) {
        lastGroup = g;
        var head = document.createElement('div');
        head.className = 'cp-group';
        head.dataset.cpGroup = g;
        head.textContent = CP.groupLabel(g);
        listEl.appendChild(head);
        var note = CP.groupNote(g);
        if (note) {
          var noteEl = document.createElement('div');
          noteEl.className = 'cp-group-note';
          noteEl.textContent = note;
          listEl.appendChild(noteEl);
        }
      }
      var row = document.createElement('div');
      row.className = 'cp-item' + (i === active ? ' active' : '');
      row.setAttribute('role', 'option');
      row.dataset.cpId = item.id;
      var kind = document.createElement('span');
      kind.className = 'cp-kind';
      kind.textContent = item.badge || (item.kind === 'element' ? '要素' : 'コマンド');
      var title = document.createElement('span');
      title.className = 'cp-title';
      title.textContent = item.title;
      var hint = document.createElement('span');
      hint.className = 'cp-hint';
      hint.textContent = CP.shortcutHint(item, window.MA.keyBindings && window.MA.keyBindings.keysFor);
      row.appendChild(kind); row.appendChild(title); row.appendChild(hint);
      row.addEventListener('click', function() { active = i; execute(); });
      listEl.appendChild(row);
      if (i === active && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    });
    if (emptyEl) emptyEl.style.display = shown.length ? 'none' : 'block';
    if (footEl) {
      footEl.textContent = '↑↓ 選択 · Enter 実行 · Tab 種別で絞り込み' +
        (groupFilter ? ' (' + CP.groupLabel(groupFilter) + ')' : '') + ' · Esc 閉じる';
    }
  }

  function refilter() {
    shown = CP.filter(CP.filterByGroup(items, groupFilter), input.value);
    active = shown.length ? 0 : -1;
    render();
  }

  // Ctrl+P は同じ検索欄を「ファイル名」に絞って開く。
  // opts.files は保存先の図の名前 (FILES ツリーの右クリックと同じ「開く」の道で開く)。
  // サブフォルダの図 ({ name, dir, rel }) は「フォルダ/名前」で出し、そのフォルダのファイルを開く
  // (直下の同じ名前の図とフォルダで見分ける。TICKET-roadmap-20261122-0855-2)。
  function fileCommands(files) {
    return (files || []).map(function(name) {
      if (name && typeof name === 'object') {
        var f = name;
        var full = f.rel + '/' + f.name;
        return {
          id: 'sub:' + full, group: 'file', badge: 'ファイル', title: full, hint: f.rel,
          keywords: [f.name, full, f.rel, 'file', 'open', 'ふぁいる', 'ひらく'],
          run: function() { if (window.openFromSubFolder) window.openFromSubFolder(f.name, f.dir, { pin: true }); },
        };
      }
      return {
        id: name, group: 'file', badge: 'ファイル', title: name, hint: '保存先',
        keywords: [name, 'file', 'open', 'ふぁいる', 'ひらく'],
        run: function() { openFromFolderByName(name); },
      };
    });
  }

  function open(opts) {
    var o = (opts && typeof opts === 'object' && !opts.type) ? opts : {};
    returnFocusEl = document.activeElement;
    // add / selected は「今の図種」「今の選択」で中身が変わるので、開くたびに作り直す。
    items = CP.buildItems(
      addCommands().concat(selectedCommands()).concat(commands()).concat(fileCommands(o.files)),
      editorEl ? editorEl.value : '');
    input.value = '';
    groupFilter = o.group || null;
    modal.classList.add('open');
    refilter();
    input.focus();
  }

  function close() {
    modal.classList.remove('open');
    var back = returnFocusEl;
    returnFocusEl = null;
    if (back && back.focus && document.body.contains(back)) back.focus();
  }

  function execute() {
    var item = shown[active];
    if (!item) return;
    close();
    if (item.group === 'jump') { gotoLine(item.line); selectAtLine(item.line); }
    else if (typeof item.run === 'function') item.run();
  }

  if (openBtn) openBtn.addEventListener('click', function() { open(); });
  window.MA.openCommandPalette = function(opts) { open(opts); };

  // キーの判定は key-bindings に聞く (design 5b で差し替えられる)。
  document.addEventListener('keydown', function(e) {
    var KB = window.MA.keyBindings;
    if (!KB || !KB.matches('palette', e)) return;
    e.preventDefault();
    if (modal.classList.contains('open')) close(); else open();
  });

  input.addEventListener('input', refilter);

  input.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = CP.moveIndex(active, 1, shown.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = CP.moveIndex(active, -1, shown.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); execute(); }
    else if (e.key === 'Tab') {
      // design 2a: Tab は種別 (図に足す / 移動 / 選択中 / コマンド) を巡回して絞る。
      // 一周すると全部に戻る。パレットの中に他のフォーカス先は無いので奪ってよい。
      e.preventDefault();
      groupFilter = CP.cycleGroup(groupFilter, CP.groupsOf(items), e.shiftKey ? -1 : 1);
      refilter();
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });

  modal.addEventListener('click', function(e) {
    if (e.target === modal) close();
  });
}

// ── Auto-shutdown heartbeat ─────────────────────────────────────────────────
// Pings /heartbeat every 5s so the Python server knows the tab is alive.
// On close/unload, fires sendBeacon('/shutdown') for an immediate kill.
// If the browser crashes without firing unload events, the server's
// watchdog (IDLE_SHUTDOWN_SEC in server.py) catches it.
//
// Playwright/automation is detected via navigator.webdriver and skips the
// shutdown beacon so tests don't kill the shared server between cases.
function startHeartbeat() {
  function ping() {
    fetch('/heartbeat', { method: 'POST', keepalive: true }).catch(function() {});
  }
  ping();
  setInterval(ping, 5000);
  if (navigator.webdriver) return;  // automated browser: heartbeat only, no shutdown beacon
  function shutdown() {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/shutdown', new Blob([], { type: 'text/plain' }));
      } else {
        fetch('/shutdown', { method: 'POST', keepalive: true }).catch(function() {});
      }
    } catch (e) {}
  }
  window.addEventListener('pagehide', shutdown);
  window.addEventListener('beforeunload', shutdown);
}

function updateUndoRedoButtons() {
  var hist = window.MA.history;
  if (!hist || !hist.canUndo) return;
  var btnUndo = document.getElementById('btn-undo');
  var btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = !hist.canUndo();
  if (btnRedo) btnRedo.disabled = !hist.canRedo();
}

// DSL 行 ⇄ SVG 図形の「選ぶ前の対応表示」。
// キャレット行を既定の peek にし、行番号にマウスが乗っている間はその行を優先する
// (マウスを外せばキャレット行に戻る)。選択 (selected) には触らない。
var _peekHoverLine = null;

function currentPeekLine() {
  if (_peekHoverLine !== null) return _peekHoverLine;
  if (!editorEl) return null;
  var LP = window.MA.linePeek;
  return LP ? LP.lineAtCaret(editorEl.value, editorEl.selectionStart) : null;
}

function refreshLinePeek() {
  var LP = window.MA.linePeek;
  if (!LP) return 0;
  var line = currentPeekLine();
  var n = LP.apply(document.getElementById('overlay-layer'), line);
  if (lineNumbersEl) {
    var marked = lineNumbersEl.querySelectorAll('.ln.ln-peek');
    Array.prototype.forEach.call(marked, function(el) { el.classList.remove('ln-peek'); });
    // 図形に当たった行だけ番号も光らせる。当たらない行 (title 行など) は素のまま
    // にして、「この行には対応する図形が無い」ことが番号の側からも分かるようにする。
    if (n > 0 && line !== null) {
      var el = lineNumbersEl.querySelector('.ln[data-line="' + line + '"]');
      if (el) el.classList.add('ln-peek');
    }
  }
  return n;
}

function setupLinePeek() {
  if (!editorEl || !window.MA.linePeek) return;
  ['keyup', 'click', 'input', 'focus', 'select'].forEach(function(ev) {
    editorEl.addEventListener(ev, function() { refreshLinePeek(); });
  });
  if (lineNumbersEl) {
    lineNumbersEl.addEventListener('mousemove', function(e) {
      var t = e.target;
      var n = (t && t.getAttribute) ? parseInt(t.getAttribute('data-line'), 10) : NaN;
      var next = isNaN(n) ? null : n;
      if (next === _peekHoverLine) return;
      _peekHoverLine = next;
      refreshLinePeek();
    });
    lineNumbersEl.addEventListener('mouseleave', function() {
      if (_peekHoverLine === null) return;
      _peekHoverLine = null;
      refreshLinePeek();
    });
  }
}

function updateLineNumbers() {
  if (!lineNumbersEl || !editorEl) return;
  var count = (editorEl.value.match(/\n/g) || []).length + 1;
  // design 5c: 挿入位置を選んでいる間はその行を強調したいので、行番号は
  // insert-marker に組ませる (表示中でなければ target は null で素の番号列)。
  var IM = window.MA.insertMarker;
  if (IM) {
    lineNumbersEl.innerHTML = IM.gutterHtml(count, IM.getTarget(),
      window.MA.htmlUtils && window.MA.htmlUtils.escHtml);
    _markJumpGutter();
    return;
  }
  var out = '';
  for (var i = 1; i <= count; i++) out += (i === 1 ? '' : '\n') + i;
  lineNumbersEl.textContent = out;
}

function initPaneResizers() {
  var main = document.getElementById('main');
  var editorPane = document.getElementById('editor-pane');
  var propsPane = document.getElementById('props-pane');

  function attach(handle, pane, side) {
    if (!handle || !pane) return;
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      handle.classList.add('dragging');
      var rect = main.getBoundingClientRect();
      function onMove(ev) {
        var w;
        if (side === 'left') {
          w = Math.max(180, ev.clientX - rect.left);
        } else {
          w = Math.max(200, rect.right - ev.clientX);
        }
        pane.style.width = w + 'px';
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  attach(document.getElementById('resizer-left'), editorPane, 'left');
  attach(document.getElementById('resizer-right'), propsPane, 'right');

  // 右に並ぶ読み専用の枠 (参照ペイン・先輩の図) も、
  // 境目をドラッグして幅を変えられ、その幅を覚える。丸めは side-pane が持つ。
  attachSidePaneResizer('resizer-compare', 'compare-pane', COMPARE_PANE_KEY);
  attachSidePaneResizer('resizer-senior', 'senior-pane', window.MA.seniorPane
    && window.MA.seniorPane.STORE_KEY);
}

// 右側の枠 1 つ分の「幅を変える取っ手」。key に幅を書き戻す (state の他の項目は残す)。
function attachSidePaneResizer(handleId, paneId, key) {
  var handle = document.getElementById(handleId);
  var pane = document.getElementById(paneId);
  var main = document.getElementById('main');
  var SD = window.MA.sidePane;
  if (!handle || !pane || !SD) return;
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    handle.classList.add('dragging');
    var rect = main ? main.getBoundingClientRect() : { right: window.innerWidth, width: window.innerWidth };
    function onMove(ev) {
      var w = SD.clampWidth(rect.right - ev.clientX, rect.width);
      pane.style.width = w + 'px';
    }
    function onUp() {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveSidePaneWidth(key, parseInt(pane.style.width, 10));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// 覚えている幅を枠に当て、取っ手を枠と一緒に出し入れする。
function applySidePaneWidth(paneId, handleId, key) {
  var pane = document.getElementById(paneId);
  var handle = document.getElementById(handleId);
  var SD = window.MA.sidePane;
  if (!pane) return;
  if (handle) handle.hidden = !!pane.hidden;
  if (!SD || !key) return;
  var main = document.getElementById('main');
  var avail = main ? main.getBoundingClientRect().width : NaN;
  var st = _sidePaneRaw(key);
  // 一度も動かしていない枠は CSS の既定幅のままにする (参照ペインは 34%)。
  if (st.width === undefined || st.width === null || st.width === '') return;
  pane.style.width = SD.clampWidth(st.width, avail) + 'px';
}

// 幅だけを書き戻す (先輩の枠は dir/name も同じ鍵に入っているので消さない)。
function _sidePaneRaw(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
}

function saveSidePaneWidth(key, width) {
  var SD = window.MA.sidePane;
  if (!SD || !key || !width) return;
  var raw = _sidePaneRaw(key);
  raw.width = SD.clampWidth(width);
  try { localStorage.setItem(key, JSON.stringify(raw)); } catch (e) { /* 保存できなくても画面は動く */ }
}

// ── Zoom ───────────────────────────────────────────────────────────────────
function setZoom(z) {
  zoom = Math.max(0.1, Math.min(5.0, Math.round(z * 100) / 100));
  if (zoomDisplayEl) zoomDisplayEl.textContent = Math.round(zoom * 100) + '%';
  syncZoomHud();
  if (previewSvgEl) {
    previewSvgEl.style.transform = 'scale(' + zoom + ')';
    previewSvgEl.style.transformOrigin = '0 0';
  }
  // overlay-layer にも同じ transform を当てないとクリック座標と SVG 位置がズレる
  var overlayEl = document.getElementById('overlay-layer');
  if (overlayEl) {
    overlayEl.style.transform = 'scale(' + zoom + ')';
    overlayEl.style.transformOrigin = '0 0';
  }
  syncOverlayOrigin();
  syncOpenEmptyHint();
}

// 空の画面の入口は図のすぐ下に置く。
// 図の拡大は transform なので流れの高さが変わらない。見た目の高さの分だけ下げて重ねない。
function syncOpenEmptyHint() {
  var h = document.getElementById('open-empty-hint');
  var FO = window.MA.fileOpen;
  if (!h || !previewSvgEl || !FO || !FO.emptyHintGap) return;
  h.style.marginTop = FO.emptyHintGap(previewSvgEl.offsetHeight, zoom) + 'px';
}

// 当たり判定の層 (#overlay-layer / #hover-layer) は
// #preview-container の中の絶対配置で、図 (#preview-svg) が余白 16px の位置に
// あると決め打ちしていた。保存のたびに出る帯 (突合・衝突・入れ替わり・逸れ) は
// 図の上に流れで入って図を下へ押すので、帯が出ている間は枠が帯の高さだけ上に
// ずれ、ホバーしても本人の枠が出なかった (保存したあとに開いた図が全部そうなる)。
// 層の原点を図の実際の位置に合わせ直す。
function syncOverlayOrigin() {
  var host = previewSvgEl || document.getElementById('preview-svg');
  if (!host) return;
  syncFigureBelowHud(host);
  var top = host.offsetTop + 'px';
  var left = host.offsetLeft + 'px';
  ['overlay-layer', 'hover-layer'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.style.top !== top) el.style.top = top;
    if (el.style.left !== left) el.style.left = left;
  });
}

// 右上に浮くズーム帯 (#zoom-hud) のボタンが図の上端に重なり、header の文字や
// 右端の参加者・部品の頭にホバーしても枠が出ず押せなかった。図の上端 (スクロール 0 の位置) が帯の下端より
// 上に来るときだけ、その差ぶん図を下げる。保存の帯・エラーの帯が図を帯より下へ押しているときは下げない。
function syncFigureBelowHud(host) {
  var hudEl = document.getElementById('zoom-hud');
  var container = document.getElementById('preview-container');
  var ZH = window.MA && window.MA.zoomHud;
  if (!hudEl || !container || !ZH || !ZH.figureGap) return;
  var cur = parseFloat(host.style.marginTop) || 0;
  var hr = hudEl.getBoundingClientRect();
  var gap = 0;
  if (hr && hr.height > 0 && container.contains(host)) {
    var cr = container.getBoundingClientRect();
    var naturalTop = cr.top + container.clientTop + host.offsetTop - cur;
    gap = ZH.figureGap(hr.bottom, naturalTop);
  }
  var want = gap ? gap + 'px' : '';
  if (host.style.marginTop !== want) host.style.marginTop = want;
}

// 図より前にある帯が出る・消える・高さが変わるたびに合わせ直す。
function setupOverlayOriginSync() {
  syncOverlayOrigin();
  var container = document.getElementById('preview-container');
  if (!container || typeof ResizeObserver !== 'function') return;
  var ro = new ResizeObserver(function() { syncOverlayOrigin(); });
  Array.prototype.forEach.call(container.children, function(c) {
    if (c.id === 'overlay-layer' || c.id === 'hover-layer') return;
    ro.observe(c);
  });
}

function zoomToFit() {
  var svgEl = previewSvgEl ? previewSvgEl.querySelector('svg') : null;
  var previewContainer = document.getElementById('preview-container');
  if (!svgEl || !previewContainer) return;
  var naturalW = parseFloat(svgEl.getAttribute('width')) || 800;
  var containerW = previewContainer.clientWidth - 32;
  var fitZoom = containerW / naturalW;
  setZoom(fitZoom);
}

// Normalize PlantUML SVG: ensure width/height attributes are pure pixel numbers.
// PlantUML renders use inline style="width:Xpx;height:Ypx;" — Image() can't size off those.
function normalizeSvgSize(svgEl) {
  function parsePx(v) {
    if (!v) return 0;
    var m = String(v).match(/([0-9.]+)/);
    return m ? parseFloat(m[1]) : 0;
  }
  var w = parsePx(svgEl.getAttribute('width'));
  var h = parsePx(svgEl.getAttribute('height'));
  if (!w || !h) {
    var style = svgEl.getAttribute('style') || '';
    var mw = style.match(/width\s*:\s*([0-9.]+)/);
    var mh = style.match(/height\s*:\s*([0-9.]+)/);
    if (mw) w = parseFloat(mw[1]);
    if (mh) h = parseFloat(mh[1]);
  }
  if (!w || !h) {
    var vb = svgEl.getAttribute('viewBox');
    if (vb) {
      var parts = vb.split(/\s+/);
      if (parts.length >= 4) { w = parseFloat(parts[2]); h = parseFloat(parts[3]); }
    }
  }
  if (w && h) {
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));
  }
  // TICKET-reviewer-20261115-2300: PlantUML が style に書いた背景 (既定は白) は下で style ごと消えるので、
  // 「SVG として保存」が書き出しに戻せるよう要素に控える (属性にしないので書き出しにもプレビューにも出ない)。
  svgEl.__puaBackground = window.MA.svgExport ? window.MA.svgExport.backgroundOf(svgEl.getAttribute('style')) : '';
  svgEl.removeAttribute('style');
  // FEAT-033 (resolves UI-010): 図を縦横同率で表示する。
  // plantuml-assist.html の `#preview-svg svg { max-width: 100% }` は幅だけを
  // コンテナ幅に丸め、height は原寸のまま残すため非一様スケーリングになり、
  // ラベルが横方向に潰れて重なる。原寸表示に戻し、はみ出しは
  // `#preview-container { overflow: auto }` の横スクロールで読む。
  // 全体俯瞰は既存の Fit / ズーム (一様倍率の transform: scale()) が担う。
  // 🔴 本来の修正箇所は plantuml-assist.html:290-293 の CSS 規則そのものであるが、
  //    同ファイルは feature_implementer の write_scope 外であるため、
  //    ここからインラインスタイル (CSS 詳細度で stylesheet に優先) で上書きしている。
  //    これは技術的負債である。CSS 側を直せるようになった時点で本行は撤去してよい。
  svgEl.style.maxWidth = 'none';
  return { w: w || 800, h: h || 400 };
}

// ── File Open / Save ───────────────────────────────────────────────────────
// ── Diagram tabs ───────────────────────────────────────────────────────────
// 複数の図を同時に開き、タブで行き来する。1 タブ = workspace の 1 ドキュメント。
// タブを離れるときにその時点の DSL と図の種類を書き戻すので、戻ってくれば
// 続きから編集できる。保存フォルダ (autoSave の fileDir) にある .puml は
// 「一覧」から選んでタブとして開ける。

function _wsFileDir() {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    return (cfg && cfg.fileDir) || './autosave';
  } catch (e) { return './autosave'; }
}

// ── タブの書き先のフォルダ ─────────────────────────
// 保存先を別のフォルダに替えると、開いているタブの書き先まで新しいフォルダへ付け替わり、
// 元のファイルは直らず、新しいフォルダに同じ名前の別の図があればそれを上書きしていた。
// タブは開いたときのファイルを指し続ける (VS Code・IntelliJ と同じ)。保存先を替える直前に
// 開いているタブを前の保存先に留め (workspace.holdDir)、自動保存・Ctrl+S・パンくず・
// 未保存の印はそのタブのフォルダで決める。留めていないタブは今の保存先に従う。
function _docDir(doc) {
  var cur = _wsFileDir();
  var WS = window.MA.workspace;
  if (!doc || !doc.id || !WS || !WS.dirOf) return cur;
  return WS.dirOf(doc.id, cur) || cur;
}

// 前回保存版 (save-diff) を引く名前。サブフォルダの図は、直下の同じ名前の図と基準を分ける
// (TICKET-roadmap-20261122-0855-2。分けないと、片方を開いただけでもう片方の ● が狂う)。
function _diffName(doc) {
  if (!doc) return '';
  if (!doc.sub || !doc.dir) return doc.name;
  return 'sub:' + String(doc.dir).split(String.fromCharCode(92)).join('/').toLowerCase() + '|' + doc.name;
}

// 「この図の履歴」(版の控え) を読むフォルダ。今開いているサブフォルダの図ならそのフォルダ、ほかは今の保存先
// (TICKET-roadmap-20261122-0855-3。前はサブフォルダの図でも直下の同じ名前の図の版を読んでいた)。
function _histDirFor(name) {
  var a = null;
  try { a = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { a = null; }
  if (a && a.sub && a.dir && a.name === String(name == null ? '' : name)) return a.dir;
  return _wsFileDir();
}

// サブフォルダの図の、保存先から見たフォルダの道 ('docs/api')。サブフォルダの図でなければ ''。
function _docSubRel(doc) {
  if (!doc || !doc.sub || !doc.dir) return '';
  var FT = window.MA.fileTree;
  var FP = window.MA.filesPanel;
  // 保存先の設定は相対のこともあるので、server が解いた絶対パス (ツリーを読んだ時の root) と比べる。
  var root = (FP && FP.subRoot && FP.subRoot()) || _wsFileDir();
  var seg = FT && FT.relSegments ? FT.relSegments(root, doc.dir) : null;
  return seg && seg.length ? seg.join('/') : '';
}

// そのタブが今の保存先とは別のフォルダに留めてあるか。
function _docHeldElsewhere(doc) {
  var PF = window.MA.peekFolder;
  var d = _docDir(doc), cur = _wsFileDir();
  if (d === cur) return false;
  return !(PF && PF.samePath && PF.samePath(d, cur));
}

// 保存の判定 (save-target) に渡す設定。保存先がフォルダなら、書き先をそのタブのフォルダにする。
function _cfgForDoc(doc) {
  var cfg = null;
  try { cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfg = null; }
  if (!cfg || cfg.backend !== 'file' || !doc) return cfg;
  var out = {};
  for (var k in cfg) if (Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = cfg[k];
  out.fileDir = _docDir(doc);
  return out;
}

// 保存先を替える直前に呼ぶ。開いているタブを前の保存先に留める。
// 見本・白紙のままのタブ (まだ何も書いていない) と手元から開いたファイル (元の場所へ書く) は留めない。
function _holdOpenDocsBeforeTargetChange(prevCfg, nextBackend, nextDir) {
  var WS = window.MA.workspace;
  if (!WS || !WS.holdDir || !prevCfg || prevCfg.backend !== 'file') return 0;
  var prevDir = prevCfg.fileDir || './autosave';
  if (nextBackend === 'file' && prevDir === nextDir) return 0;
  try { saveActiveDoc(); } catch (e) {}
  return WS.holdDir(prevDir, function(d) {
    if (_sourcePathOf(d.id)) return true;
    var live = d;
    if (d.id === WS.getActiveId()) live = { id: d.id, name: d.name, diagramType: currentDiagramType, dsl: mmdText };
    return _isUntouchedDoc(live);
  });
}

// 保存先ごとの小さな控え (過去の置換の組・変更前の控えなど) の置き場。使えない環境でもフォルダ一覧は出る。
function _reviewStore() {
  try { return window.localStorage || null; } catch (e) { return null; }
}

// まだ見本 (または白紙) のままのタブを、保存フォルダへ
// 自動で書き戻さないための門。起動すると既定のタブ `diagram1` が図種の見本で作られ、
// 画面のバッジ (整合・⇄ イベント・指摘・書き出し一覧) は数を出すために saveActiveDoc()
// を通る。その結果、利用者が 1 文字も打っていないのに見本が `diagram1.puml` として
// ディスクへ書かれ、同じ名前で保存してあった本物の図が見本で丸ごと潰れていた
// (primary の diagram1.puml から domain-verdict 宣言行が消え、開き直すたびに再発)。
// 見本・白紙には利用者の成果が 1 文字も無い。書かなくても失うものは無く、書くと
// 既にある図を壊すことがあるので書かない。見本をわざとファイルに落としたいときは、
// 手で押す [💾 保存] が別経路で書く (止めるのは自動の書き戻しだけ)。
// 判定そのものは blankDoc が持つ (見本・白紙の定義を 2 か所に置かない)。
function _isUntouchedDoc(doc) {
  var BD = window.MA.blankDoc;
  if (!BD || !doc) return false;
  var mod = modules[doc.diagramType];
  var tpl = '';
  try { tpl = mod && mod.template ? mod.template() : ''; } catch (e) { tpl = ''; }
  try { return BD.isUntouched(doc.dsl, tpl, doc.diagramType); } catch (e) { return false; }
}

// 一括置換・改名の後始末が、開いているタブを丸ごと
// 保存フォルダへ書き戻していた。そこには今回の置換が 1 文字も当たっていない図が混ざり、
// タブが持っている本文で元ファイルを潰すので、見比べのために開いた完了物の中身が別の図の本文に入れ替わった
// (reviewer の言う「内容シャッフル」)。
//
// 保存フォルダへ書くのはこの 1 か所だけにして、書いてよいかの判定を saveActiveDoc と
// 同じにする。戻り値は書いたかどうか。
function writeDocToFolder(doc, fileDir) {
  if (!doc || !window.MA.workspace) return false;
  if (_sourcePathOf(doc.id)) return false;  // 手元から開いたファイルは元の場所にだけ書く
  if (_docWriteHeld(doc.id)) return false;  // 移動・名前変更の途中
  // まだ見本のままのタブは書かない。
  if (_isUntouchedDoc(doc)) return false;
  // 開いたときのまま (読むだけ) なら、書き戻す中身は元ファイルと同じ。何もしない。
  var SL = window.MA.sourceLock;
  if (SL && SL.decide(doc.id, doc.dsl).action === 'skip') return false;
  var out = doc;
  window.MA.workspace.saveToFile(_withSourceEol(out), fileDir);
  if (window.MA.autoSave && window.MA.autoSave.noteFileWritten) {
    window.MA.autoSave.noteFileWritten(out.name, out.diagramType);
  }
  if (window.MA.saveDiff) window.MA.saveDiff.mark(_diffName(out), out.dsl);
  if (window.MA.versionTimeline) window.MA.versionTimeline.push(_diffName(out), out.dsl);
  return true;
}

// 置換・改名の後始末。**変えた図だけ**を書き戻す (list() を丸ごと書かない)。
function writeChangedToFolder(changed) {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (!cfg || cfg.backend !== 'file') return;
    var byId = {};
    (window.MA.workspace ? window.MA.workspace.list() : []).forEach(function(d) { byId[d.id] = d; });
    (changed || []).forEach(function(c) {
      var d = byId[c && c.id];
      if (d) writeDocToFolder(d, _docDir(d));
    });
  } catch (e) {}
}

// アクティブなタブの現在の編集内容を workspace に書き戻す。

function saveActiveDoc() {
  if (!window.MA.workspace) return null;
  var doc = window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType });
  // 手元から開いたファイルは保存先フォルダへ複製しない
  // (書き戻しは手で押す保存が元のファイルへ行う)。
  if (doc && _sourcePathOf(doc.id)) {
    try { renderDiffBadge(); } catch (e) {}
    return doc;
  }
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    // まだ見本・白紙のままのタブは、自動の書き戻しではディスクへ書かない
    // (起動しただけで既存の図が見本で潰れる)。
    if (doc && cfg && cfg.backend === 'file' && _isUntouchedDoc(doc)) {
      renderDiffBadge();
      try { renderLiveDiffChip(); } catch (e) {}
      return doc;
    }
    if (doc && cfg && cfg.backend === 'file' && _docWriteHeld(doc.id)) {
      // FILES の右クリックで移動・名前変更している途中 (付け替えが済むまで前の場所へ書かない)。
      renderDiffBadge();
      return doc;
    }
    if (doc && cfg && cfg.backend === 'file') {
      // 一覧から開いて眺めるだけの回は書かない (本文は開いたときのままで、元ファイルは既にこの内容)。
      var SL = window.MA.sourceLock;
      if (SL && SL.decide(doc.id, doc.dsl).action === 'skip') {
        renderDiffBadge();
        try { renderLiveDiffChip(); } catch (e) {}
        return doc;
      }
      // 書き先はそのタブのフォルダ (保存先を替える前に開いたタブは開いたフォルダ)。
      window.MA.workspace.saveToFile(_withSourceEol(doc), _docDir(doc));
      // 保存先が Git なら、変更 (M / A) の数え直しを予約する (design 10c)。
      try { if (window.MA.gitUi) window.MA.gitUi.refreshSoon(); } catch (e) {}
      // 届いた先を状態バーにも揃える。
      if (window.MA.autoSave && window.MA.autoSave.noteFileWritten) {
        window.MA.autoSave.noteFileWritten(doc.name, doc.diagramType);
      }
      // 保存した時点を差分の基準にする。
      if (window.MA.saveDiff) window.MA.saveDiff.mark(_diffName(doc), doc.dsl);
      // 保存のたびに版を積む。基準 1 点だけでは
      // A → B → A の往復が見えないので、通しで並べられるよう履歴に残す。
      // 積む先は図の居場所 (サブフォルダの図は直下の同じ名前の図と分ける。_vtKeyOf と同じ鍵)。
      if (window.MA.versionTimeline) window.MA.versionTimeline.push(_diffName(doc), doc.dsl);
    }
  } catch (e) { /* 保存フォルダへの書き出しは best-effort */ }
  renderDiffBadge();
  try { renderLiveDiffChip(); } catch (e) {}
  return doc;
}

// タブの内容をエディタ・プレビューに反映する。
function applyActiveDoc() {
  if (!window.MA.workspace) return;
  var doc = window.MA.workspace.getActive();
  if (!doc) return;
  // 保存時チェックの帯は保存した図のもの。別の図に移っても残ると
  // 図の上端を覆い、そこにある要素へホバー・クリックが届かない。
  hideSaveSwapIfOtherDoc(doc.id);
  _svgKindFix = null;  // SVG に合わせた図種は前の図のもの
  var mod = modules[doc.diagramType] || modules[currentDiagramType];
  if (mod) {
    currentModule = mod;
    currentDiagramType = mod.type || doc.diagramType;
    var dtSel = document.getElementById('diagram-type');
    if (dtSel) dtSel.value = currentDiagramType;
    syncRail();  // タブ切替は select を直接書き換えるので change が飛ばない
    syncZoomHud();
    try { window.localStorage.setItem('plantuml-diagram-type', currentDiagramType); } catch (e) {}
  }
  mmdText = doc.dsl;
  _historyDocId = doc.id;  // 以後の元に戻す / やり直しはこの図の履歴
  suppressSync = true;
  editorEl.value = mmdText;
  suppressSync = false;
  markTextSynced();  // タブの中身を出しただけ。書き直さない
  try { currentParsed = currentModule.parse(mmdText); } catch (e) { /* leave stale */ }
  if (window.MA.selection) window.MA.selection.clearSelection();
  updateLineNumbers();
  updateUndoRedoButtons();
  isFirstRender = true;
  scheduleRefresh();
  renderTabs();
  // 保存が届いた先も図ごとに違う。
  try { renderAutoSaveStatus(); } catch (e) {}
  // 改行・文字コードの 1 語もこのタブのもの。
  try { renderFileFormat(); } catch (e) {}
  // 開いたファイルの未対応記法と、起動直後の入口。
  try { renderUnsupportedPanel(); } catch (e) {}
  try { renderOpenEmptyHint(); } catch (e) {}
}

function switchToDoc(id) {
  if (!window.MA.workspace) return;
  if (id === window.MA.workspace.getActiveId()) return;
  saveActiveDoc();
  if (window.MA.autoSave) { try { window.MA.autoSave.flush(); } catch (e) {} }
  if (!window.MA.workspace.setActive(id)) return;
  // ここで履歴を積むと、前のタブの本文が次のタブの履歴に入り、
  // Ctrl+Z で別のタブの本文が出ていた。履歴はタブごとに持つので、切り替えでは積まない。
  applyActiveDoc();
}

// 利用者の行があるタブで図種を選んだら、そのタブは替えずに
// 押した図種の新しいタブへ移る。同じ図種の白紙・見本のままのタブが既にあればそこへ移る
// (押すたびにタブを増やさない)。新しいタブは見本入り (中身のある図から図種を替えた人への
// 手がかり)。見本のままのタブはディスクへ書かないので、行を足すか Ctrl+S を押すまでファイルは増えない。
function openTypeInNewTab(t) {
  var WS = window.MA.workspace;
  var mod = modules[t];
  if (!WS || !mod) return null;
  var activeId = WS.getActiveId();
  var BD = window.MA.blankDoc;
  var tpl = '';
  try { tpl = mod.template ? mod.template() : ''; } catch (e) { tpl = ''; }
  var reuse = null;
  WS.list().forEach(function(d) {
    if (reuse || !d || d.id === activeId || d.diagramType !== t) return;
    if (_sourcePathOf(d.id)) return;  // 手元から開いたファイルは白紙でも使い回さない
    if (BD && BD.isUntouched(d.dsl, tpl, t)) reuse = d;
  });
  if (reuse) {
    switchToDoc(reuse.id);
    return WS.getActive();
  }
  saveActiveDoc();
  if (window.MA.autoSave) { try { window.MA.autoSave.flush(); } catch (e) {} }
  openNewDocTab(t, tpl || (BD ? BD.blankDsl(t) : '@startuml\n@enduml'));
  applyActiveDoc();
  return WS.getActive();
}

// タブの図の名前を聞いて変える (タブ名のダブルクリック・新しい図の名前が保存先の図と重なったとき)。
// message を渡すと、名前の規則の前にその 1 行を添えて聞く。
function promptRenameDoc(docId, message, suggest) {
  var WS = window.MA.workspace;
  var doc = null;
  (WS.list() || []).forEach(function(d) { if (d && d.id === docId) doc = d; });
  if (!doc) return null;
  // サブフォルダの図の名前の変更はまだ受けない (前の名前のファイルの付け替えは保存先の直下を相手にするので、
  // 直下の同じ名前の図を消してしまう)。TICKET-roadmap-20261122-0855-2。
  if (doc.sub) {
    var msg0 = 'サブフォルダの図 (' + doc.name + '.puml) の名前はここでは変えられません';
    if (window.MA.toast) window.MA.toast.show(msg0);
    else setSaveStatus(msg0);
    return null;
  }
  var ask = (message ? message + '\n' : '') + WS.nameRuleText();
  var next = window.prompt(ask, suggest || doc.name);
  if (next == null) return null;
  var before = doc.name;
  var renamed = WS.rename(doc.id, next);
  // 図名欄で名前を変え終えたら、開いた元ファイルの錠は用済み。
  if (window.MA.sourceLock) { try { window.MA.sourceLock.release(doc.id); } catch (e) {} }
  if (window.MA.autoSave && window.MA.autoSave.resetFileBlocked) {
    try { window.MA.autoSave.resetFileBlocked('conflict:' + before); } catch (e) {}
  }
  // 前の名前のファイルは残さず付け替える。
  // 開いているタブの本文は、active なら editor の内容が正 (まだ保存前の編集が入る)。
  // まだ 1 度も書いていない新しい図には前の名前のファイルが無い
  // (同じ名前のファイルは別の図)。付け替えの後始末はしない。
  var isActive = doc.id === WS.getActiveId();
  if (renamed && renamed.name && renamed.name !== before && !doc.fresh) {
    var body = isActive ? mmdText : String(renamed.dsl == null ? '' : renamed.dsl);
    // 付け替えは前の自動保存を書き切ってから終わるので、その間に押した Ctrl+S の
    // 「…に保存しました」より後に届く。上書きすると保存したことが下端から消えるので後ろに足す。
    _sweepRenamedFile(before, renamed.name, body).then(function(text) {
      if (text) appendSaveStatus(text);
    });
  }
  renderTabs();
  // 図の設定の「図名 / File name」欄も新しい名前に揃える
  // (前の名前のまま残ると、その欄を触ったときに前の名前へ戻してしまう)。
  try { renderDiagramSettings(true); } catch (e) {}
  // 新しい名前で書き直す (名前を選び直した新しい図は、ここで初めてファイルになる)。
  if (renamed && renamed.fresh && isActive) { try { saveActiveDoc(); } catch (e) {} }
  return renamed;
}

// 「＋ 新しい図」のタブを開く。名前 diagramN は開いているタブに加えて
// 保存先にある .puml の名前とも重ならないものにし (diagram2.puml が在れば diagram3)、
// 1 度書けるまで「新しい図」の印を付ける (印のある図は既にある別のファイルを書き換えない)。
// subDir (任意): 保存先の下のサブフォルダに作る (TICKET-roadmap-20261122-0855-3。FILES のサブフォルダの右クリック「新しい図」)。
// その図はそのフォルダを居場所に持ち、1 度書けた時点でそのフォルダに 1 枚できる。
function openNewDocTab(diagramType, dsl, subDir) {
  var WS = window.MA.workspace;
  var dir = subDir || _wsFileDir();
  var name = WS.newDocName ? WS.newDocName(dir) : 'diagram' + (WS.count() + 1);
  var spec = { name: name, diagramType: diagramType, dsl: dsl, fresh: true };
  if (subDir) { spec.sub = true; spec.dir = subDir; }
  var doc = WS.open(spec);
  _recheckNewDocName(doc && doc.id, dir);
  return doc;
}

// FILES のサブフォルダの右クリック「新しい図」。＋ と同じく白紙で作り、そのフォルダを書き先にする。
window.openNewDocInSubFolder = function(subDir) {
  if (!subDir) return null;
  saveActiveDoc();
  var BD = window.MA.blankDoc;
  var doc = openNewDocTab(currentDiagramType, BD ? BD.blankDsl(currentDiagramType) : '@startuml\n@enduml', subDir);
  applyActiveDoc();
  return doc;
};

// ── 書いている途中の図の居場所を替える (TICKET-roadmap-20261122-0855-3) ──
// FILES の右クリックで開いているタブの図を移動・名前変更するとき、ディスクの付け替えの間はそのタブを書かない
// (自動保存が前の場所へ書き戻すと 2 枚になる)。付け替えが済んだらタブの名前・居場所・前回保存版の基準を
// 新しい場所へ移す。未保存の本文はタブに残したまま (以後の Ctrl+S・自動保存は新しい場所だけに書く)。
var _docWriteHold = {};
function _docWriteHeld(id) { return !!(id && _docWriteHold[id]); }
window.MA.holdDocWrites = function(id, on) {
  if (!id) return;
  if (on) _docWriteHold[id] = true; else delete _docWriteHold[id];
};
// to: { name?, dir?, sub? }。dir を渡すと居場所を替える (sub が偽なら今の保存先に従うタブに戻す)。
window.MA.retargetDoc = function(id, to) {
  var WS = window.MA.workspace;
  var SD = window.MA.saveDiff;
  if (!WS || !id || !to) return null;
  var d = null;
  (WS.list() || []).forEach(function(x) { if (x && x.id === id) d = x; });
  if (!d) return null;
  var base = SD ? SD.baselineOf(_diffName(d)) : null;
  if (to.dir !== undefined && WS.setPlace) WS.setPlace(id, to.dir, !!to.sub);
  if (to.name && to.name !== d.name) WS.rename(id, to.name);
  var now = null;
  (WS.list() || []).forEach(function(x) { if (x && x.id === id) now = x; });
  if (now && SD && base && typeof base.dsl === 'string') {
    try { SD.mark(_diffName(now), base.dsl); } catch (e) {}
  }
  try { renderTabs(); } catch (e) {}
  try { updateTopSaveTarget(); } catch (e) {}
  return now;
};

// 保存先の一覧をまだ読んでいなかった (覚えている名前が古い) ときのために、開いた後に読み直し、
// 付けた名前が保存先の図と重なっていれば、まだ書いていないうちに次の空いた番号へ替える。
function _recheckNewDocName(id, dir) {
  var WS = window.MA.workspace;
  if (!id || !WS || !WS.listFiles || !WS.knownInFolder) return;
  WS.listFiles(dir).then(function() {
    var d = null;
    (WS.list() || []).forEach(function(x) { if (x && x.id === id) d = x; });
    if (!d || !d.fresh || !/^diagram\d+$/.test(d.name) || !WS.knownInFolder(d.name, dir)) return;
    WS.rename(id, WS.newDocName(dir));
    renderTabs();
    try { renderDiagramSettings(true); } catch (e) {}
  }).catch(function() {});
}

// 仮のタブ (保存先ツリーの 1 回押しで開いたタブ) を固定にする。まだ読み込み中なら読み終えてから固定にする。
function pinDocByName(name, tries) {
  var WS = window.MA.workspace;
  var d = WS && WS.findByName ? WS.findByName(WS.sanitizeName(name)) : null;
  if (!d) {
    if ((tries || 0) < 20) window.setTimeout(function() { pinDocByName(name, (tries || 0) + 1); }, 100);
    return;
  }
  if (d.preview && WS.pin) { WS.pin(d.id); renderTabs(); }
}

function renderTabs() {
  var bar = document.getElementById('tab-bar');
  if (!bar || !window.MA.workspace) return;
  var docs = window.MA.workspace.list();
  var activeId = window.MA.workspace.getActiveId();
  updateTopFileName();
  syncSeniorPane();
  var tabs = bar.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) bar.removeChild(tabs[i]);
  var firstTool = bar.querySelector('.tab-tool');
  // TICKET-owner-20261122-2322-3: 同じ名前の図が 2 枚以上開いているときだけ、タブにフォルダの道を添える。
  var FTH = window.MA.fileTree;
  var dirHints = FTH && FTH.sameNameHints ? FTH.sameNameHints(docs, _docSubRel) : {};
  docs.forEach(function(doc) {
    var el = document.createElement('div');
    el.className = 'tab' + (doc.id === activeId ? ' active' : '') + (doc.preview ? ' preview' : '');
    el.setAttribute('data-doc-id', doc.id);
    if (doc.preview) el.setAttribute('data-preview', '1');
    el.setAttribute('data-doc-name', doc.name);
    el.title = doc.name + ' (' + doc.diagramType.replace('plantuml-', '')
      + ') — ダブルクリックで名前変更';
    // サブフォルダの図は、直下の同じ名前の図と見分けられるようにフォルダの道を添える。
    var subRel = _docSubRel(doc);
    if (subRel) {
      el.setAttribute('data-sub-rel', subRel);
      el.title = subRel + '/' + doc.name + '.puml (' + doc.diagramType.replace('plantuml-', '') + ')';
    }
    // タブの右クリックで ± 差分を開く入口は TICKET-owner-20261115-2141-prune で外した
    // (前回保存版と比べる入口は「この図の履歴」の行の「比較」1 つ)。
    // 前回保存時点から変わっている図にだけ印を付ける。
    var st = window.MA.saveDiff ? window.MA.saveDiff.statusOf(_diffName(doc), doc.dsl) : 'same';
    if (st !== 'same') {
      el.className += ' dirty';
      var dot = document.createElement('span');
      dot.className = 'tab-dot';
      dot.setAttribute('data-diff-status', st);
      dot.textContent = st === 'new' ? '○' : '●';
      dot.title = st === 'new' ? 'まだ保存していない' : '前回保存時点から変更あり';
      el.appendChild(dot);
    }
    var label = document.createElement('span');
    label.className = 'tab-label';
    // design 7a / 7b / 10a: タブは保存されるファイル名 ({name}.puml) で出す。
    // 上部バーと同じ規則。data-doc-name・名前変更は拡張子なしの図名のまま。
    label.textContent = window.MA.topStatus && window.MA.topStatus.fileName
      ? window.MA.topStatus.fileName(doc.name) : doc.name;
    el.appendChild(label);
    if (dirHints[doc.id]) {
      var hint = document.createElement('span');
      hint.className = 'tab-dir';
      hint.textContent = dirHints[doc.id];
      el.appendChild(hint);
    }
    if (docs.length > 1) {
      var close = document.createElement('button');
      close.className = 'tab-close';
      close.setAttribute('data-doc-id', doc.id);
      close.title = 'このタブを閉じる';
      close.textContent = '×';
      close.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var wasActive = doc.id === window.MA.workspace.getActiveId();
        if (wasActive) saveActiveDoc();
        if (window.MA.sourceLock) { try { window.MA.sourceLock.release(doc.id); } catch (e) {} }
        if (window.MA.workspace.close(doc.id)) {
          // 閉じた図の履歴は持ち越さない (VS Code と同じ)。
          if (window.MA.history && window.MA.history.forget) window.MA.history.forget(doc.id);
          if (wasActive) applyActiveDoc(); else renderTabs();
        }
      });
      el.appendChild(close);
    }
    el.addEventListener('click', function() { switchToDoc(doc.id); });
    el.addEventListener('dblclick', function(ev) {
      ev.preventDefault();
      // 仮のタブのタブ名をダブルクリックすると固定のタブになる (名前の変更は固定のタブで)。
      if (doc.preview && window.MA.workspace.pin) {
        window.MA.workspace.pin(doc.id);
        renderTabs();
        return;
      }
      promptRenameDoc(doc.id);
    });
    bar.insertBefore(el, firstTool);
  });
  renderDiffBadge();
  try { renderLiveDiffChip(); } catch (e) {}
  // 今の本文をタブに控える (以前は外した「整合」の札の数え直しがここで控えていた)。
  try { saveActiveDoc(); } catch (e) {}
  // 統一バッジ。旧称が残っているかは図の中身で
  // 決まるので、タブを組み立て直す機会に数え直す。
  try { renderRenameBadge(); refreshRenameBadge(); } catch (e) {}
  // FILES ツリー (design 10a) の「開いている図」もタブと同じ機会に合わせる。
  try { if (window.MA.filesPanel) window.MA.filesPanel.refresh(); } catch (e) {}
  // 「この図の履歴」は開いている図で変わる (design 10c)。
  try { if (window.MA.gitUi) window.MA.gitUi.onActiveChanged(); } catch (e) {}
  // design 10a: 選ばれているタブを「＋」「ツール ▾」の下に潜らせない。
  try { revealActiveTab(bar); } catch (e) {}
}

// タブ列を横に送り、選ばれているタブを全部見える所に出す (もう見えていれば動かさない)。
// 右端の「＋」「ツール ▾」は position: sticky で中身の上に貼り付くので、その幅を隠れる幅として差し引く。
function revealActiveTab(bar) {
  var TR = window.MA.tabReveal;
  if (!bar || !TR) return;
  var tab = bar.querySelector('.tab.active');
  if (!tab || !bar.clientWidth) return;
  var br = bar.getBoundingClientRect();
  var viewRight = br.left + bar.clientLeft + bar.clientWidth;
  var stickLeft = viewRight;
  Array.prototype.forEach.call(bar.querySelectorAll('#btn-tab-new, #btn-tab-tools'), function(el) {
    if (!el.offsetParent || window.getComputedStyle(el).position !== 'sticky') return;
    var r = el.getBoundingClientRect();
    if (r.width > 0 && r.left < stickLeft) stickLeft = r.left;
  });
  var tr = tab.getBoundingClientRect();
  var next = TR.scrollFor({
    scrollLeft: bar.scrollLeft,
    viewWidth: bar.clientWidth,
    contentWidth: bar.scrollWidth,
    itemLeft: tr.left - (br.left + bar.clientLeft) + bar.scrollLeft,
    itemWidth: tr.width,
    reserveRight: viewRight - stickLeft,
  });
  if (Math.abs(next - bar.scrollLeft) >= 1) bar.scrollLeft = next;
}

// ── 前回保存時点との差分 ──────────────────────────────
// 何か変わったかを知るのに控えとの全文 diff を毎回
// 取っていた。保存した時点の DSL を基準に持てば、バッジを見るだけで
// 「読む必要がある図」が分かる。変更 0 件ならその回 は図を開かなくてよい。

// エディタの未確定分を含めた現在の全図。
function _diffDocs() {
  if (!window.MA.workspace) return [];
  var docs = window.MA.workspace.list();
  var activeId = window.MA.workspace.getActiveId();
  return docs.map(function(d) {
    // 居場所 (サブフォルダの図の dir・sub) も渡す。前回保存版の基準を直下の同じ名前の図と分けて引く (_diffName)。
    return (d.id === activeId) ? { id: d.id, name: d.name, dsl: mmdText, dir: d.dir, sub: d.sub } : d;
  });
}

// 未保存の印の判定を 1 つにする。
// タブの ●/○・上部バーの保存ボタン・FILES ツリーの行は、どれも前回保存時点の基準 (save-diff) と
// いまの本文 (開いている図はエディタの未確定分を含む) を照らしたこの値だけを読む。
// 'same' = 前回保存と同じ / 'changed' = 変わった (●) / 'new' = まだ保存していない (○)
function docSaveStatus(id) {
  var SD = window.MA.saveDiff;
  if (!SD) return 'same';
  var docs = _diffDocs();
  for (var i = 0; i < docs.length; i++) {
    if (docs[i].id === id) return SD.statusOf(_diffName(docs[i]), docs[i].dsl);
  }
  return 'same';
}
// 名前で引く版 (保存先の行は図の名前しか持たない)。その名前の図が開いていなければ 'same'。
function docSaveStatusByName(name) {
  var SD = window.MA.saveDiff;
  if (!SD || !name) return 'same';
  var docs = _diffDocs();
  for (var i = 0; i < docs.length; i++) {
    // 保存先の行は今の保存先のファイル。別のフォルダに留めたタブ (同じ名前の別のファイル) の印は付けない。
    if (String(docs[i].name || '') === String(name) && !_docHeldElsewhere(docs[i])) return SD.statusOf(docs[i].name, docs[i].dsl);
  }
  return 'same';
}
window.MA.docSaveStatus = docSaveStatus;
window.MA.docSaveStatusByName = docSaveStatusByName;

// タブの印を今の中身に合わせ直す。編集のたびにタブを組み立て直すと
// クリック中のタブが差し替わるので、印だけを付け外しする。
function syncTabDirtyMarks(docs) {
  var SD = window.MA.saveDiff;
  var bar = document.getElementById('tab-bar');
  if (!SD || !bar) return;
  docs.forEach(function(d) {
    var el = bar.querySelector('.tab[data-doc-id="' + d.id + '"]');
    if (!el) return;
    var st = SD.statusOf(_diffName(d), d.dsl);
    var dot = el.querySelector('.tab-dot');
    if (st === 'same') {
      el.className = el.className.replace(/\s*\bdirty\b/, '');
      if (dot) el.removeChild(dot);
      return;
    }
    if (el.className.indexOf('dirty') < 0) el.className += ' dirty';
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'tab-dot';
      el.insertBefore(dot, el.firstChild);
    }
    dot.setAttribute('data-diff-status', st);
    dot.textContent = st === 'new' ? '○' : '●';
    dot.title = st === 'new' ? 'まだ保存していない' : '前回保存時点から変更あり';
  });
}

// 未保存の印 (タブの ●/○・上部バーの保存ボタン・FILES ツリーの行) を今の中身に合わせ直す。
// タブ列の「± 差分」ボタンとその一覧は TICKET-owner-20261115-2141-prune で外した
// (前回保存版と比べる入口は「この図の履歴」の行の「比較」1 つ)。印を合わせ直す役だけ残す。
function renderDiffBadge() {
  var SD = window.MA.saveDiff;
  if (!SD) return null;
  var docs = _diffDocs();
  syncTabDirtyMarks(docs);
  // 上部バーの保存ボタンと FILES ツリーの印も
  // タブの印と同じ機会 (打つたび・保存のたび) に合わせ直す。
  try { updateTopSaveButton(); } catch (e) {}
  try { if (window.MA.filesPanel && window.MA.filesPanel.syncMarks) window.MA.filesPanel.syncMarks(); } catch (e) {}
  return SD.summary(docs);
}

// ── 前回保存版といまの中身 ────────────────
// ± 差分 は「どの図が変わったか」までで、開いている図の中身がどう変わるかは
// 出ていない。reviewer が 77 行 → 4 行の内容消失を掘り起こせたのは手で diff を
// 打ったからで、書いた本人の画面には保存を押すまで何の数字も出ていなかった。
// 状態バーに常時 ＋a −b を出し、押せば前回保存版と現在を全文で並べる。
function _liveDiffPair() {
  var SD = window.MA.saveDiff;
  var name = _activeDocName();
  if (!SD || !name) return null;
  // baselineOf は { dsl, at }。dsl は save-diff の規約で正規化済みなので、
  // ここで整形し直さない (同じ図を 2 つの規約で比べない)。
  var act = null;
  try { act = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { act = null; }
  var b = SD.baselineOf(act && act.name === name ? _diffName(act) : name);
  return { name: name, before: (b && typeof b.dsl === 'string') ? b.dsl : '',
           now: mmdText, has: !!(b && typeof b.dsl === 'string') };
}

// 下端の件数表示を 1 種類の形に揃える (design 9c)。
// 札ごとに文字色・枠を変える代わりに「● 名前 N」だけを出し、色を持つのは点だけにする。
// 0 件 (と、まだ数えていない) 項目は出さない。title は呼ぶ側が従来どおり付ける。
function applyStatusBadge(el, name, count, tone) {
  var SB = window.MA.statusBadges;
  if (!el || !SB) return;
  var n = (typeof count === 'number' && isFinite(count)) ? count : null;
  if (!SB.isVisible(n)) {
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('data-dot');
    return;
  }
  el.hidden = false;
  el.setAttribute('data-dot', SB.toneOf(tone));
  var dot = document.createElement('span');
  dot.className = 'sb-dot';
  dot.textContent = SB.DOT;
  el.textContent = '';
  el.appendChild(dot);
  el.appendChild(document.createTextNode(' ' + SB.label(name) + ' ' + String(n)));
}

// 下端の「● 前回保存版 ＋a −b」(変わった行数を常時出す比較の入口) とタブ列の「± 差分」は
// TICKET-owner-20261115-2141-prune で外した (前回保存版と比べる入口は「この図の履歴」の行の「比較」1 つ)。
// ただし「保存すると内容が大きく消える」形 (77 行 → 4 行の事故) の警告は、図を失わないための守りなので残す:
// 消える向きのときだけ札を出し、押すと ± 差分タブ (消える行の名指しと「前回保存版に戻す」) が開く。
// それ以外では札を出さない (件数を見せる比較の入口にはしない)。
function renderLiveDiffChip() {
  var pane = document.getElementById('compare-pane');
  if (pane && !pane.hidden && _compareMode === 'diff') renderCompareDiffView();
  var el = document.getElementById('status-livediff');
  var LD = window.MA.liveDiff;
  if (!el || !LD) return null;
  var p = _liveDiffPair();
  var v = p ? LD.verdict(p.before, p.now, p.has) : 'none';
  el.setAttribute('data-livediff', v);
  if (v !== 'shrink') {
    applyStatusBadge(el, '前回保存版', 0, 'ok');
    el.title = '';
    return v;
  }
  var sh = LD.shrink(p.before, p.now);
  var removed = (sh && Number(sh.lost) > 0) ? Number(sh.lost) : 1;
  applyStatusBadge(el, '前回保存版', removed, 'bad');
  el.title = LD.warnText(p.name, p.before, p.now) + ' (押すと消える行と「前回保存版に戻す」が出ます)';
  return v;
}

function setupLiveDiffGuard() {
  var el = document.getElementById('status-livediff');
  if (!el) return;
  el.addEventListener('click', function() {
    toggleSeniorPane(false);
    toggleCompareView(true, 'diff');
  });
  renderLiveDiffChip();
}

// 「変更前 = 前回保存 (09/23 21:51)」。± 差分タブ・比較の枠の見出しで基準を言う。
function _savedHeadLabel(at) {
  return '変更前 = 前回保存 (' + String(at || '').replace('T', ' ').slice(0, 16) + ')';
}

function _activeDocName() {
  if (!window.MA.workspace) return '';
  var d = window.MA.workspace.getActive();
  return d ? d.name : '';
}

// GIT 節の「この図の履歴」と比較が引く図のフォルダ。サブフォルダの図はそのフォルダ
// (保存先で引くと直下の同じ名前の図の履歴になる)、ほかは保存先。Git の状態 (変更の行) は保存先全体で読む。
function _gitDocDir() {
  var d = window.MA.workspace ? window.MA.workspace.getActive() : null;
  return (d && d.sub && d.dir) ? d.dir : _wsFileDir();
}

// ── 変遷履歴 ─────────────────────────────
// save-diff は「前回保存した 1 点」しか持たないので、A → B → A と書き換えが
// 往復しても毎回「変わりました」としか出ず、往復そのものが見えなかった。
// ここでは図ごとに積んだ版を新しい順に並べ、前の版に戻った版へ印を付ける。
var _vtFile = '';
var _vtSavedGen = 0;

function _vtCurrentName() {
  try {
    var a = window.MA.workspace.getActive();
    return a && a.name ? a.name : '';
  } catch (e) { return ''; }
}

// 今開いているサブフォルダの図で、名前が name のもの (無ければ null)。
// 「この図の履歴」の name はファイルの名前で、版の控え (server) は _histDirFor が同じ規則でそのフォルダから読む。
function _vtActiveSub(name) {
  try {
    var a = window.MA.workspace.getActive();
    if (a && a.sub && a.dir && a.name === String(name == null ? '' : name)) return a;
  } catch (e) {}
  return null;
}

// このブラウザで積んだ変遷 (versionTimeline) を引く鍵。サブフォルダの図は直下の同じ名前の図と分ける
// (保存のたびに積む側と同じ _diffName。TICKET-roadmap-20261123-0226-4)。
function _vtKeyOf(name) {
  var a = _vtActiveSub(name);
  return a ? _diffName(a) : String(name == null ? '' : name);
}

// 窓に出す図の名前。サブフォルダの図は保存先からの道を付ける ('design/api/spi')。
function _vtLabelOf(name) {
  var a = _vtActiveSub(name);
  var rel = a ? _docSubRel(a) : '';
  return rel ? rel + '/' + a.name : String(name == null ? '' : name);
}

function renderVersionTimeline() {
  var VT = window.MA.versionTimeline;
  var body = document.getElementById('vt-body');
  var sel = document.getElementById('vt-file');
  var sum = document.getElementById('vt-summary');
  if (!VT || !body) return;
  var esc = window.MA.htmlUtils.escHtml;

  // 選べるのは直下の図の名前と、今開いているサブフォルダの図 (道付きで出す)。サブフォルダの図の
  // 鍵 ('sub:…') は選択肢に並べない。今の図がサブフォルダの図なら、直下の同じ名前は選択肢から外す
  // (同じ値の行が 2 つ並ぶと、どちらの図の履歴かが分からない)。
  var names = VT.names().filter(function(k) { return String(k).indexOf('sub:') !== 0; });
  if (sel) {
    // 開いている図に履歴がまだ無くても選べるようにしておく
    // (「この図の履歴はまだありません」を名指しで出すため)。
    var cur = _vtFile || _vtCurrentName();
    var opts = names.slice();
    if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
    if (!cur && opts.length) cur = opts[0];
    _vtFile = cur;
    sel.innerHTML = opts.map(function(n) {
      return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(_vtLabelOf(n)) + '</option>';
    }).join('');
  }
  var name = _vtFile;
  var vtKey = _vtKeyOf(name);
  if (sum) sum.textContent = name ? VT.summaryLine(vtKey) : '図がありません';

  var onlyEl = document.getElementById('vt-only-revisit');
  var only = !!(onlyEl && onlyEl.checked);
  // 保存先がフォルダなら、行は保存した版 (server の控え)。
  // 版がまだ 1 つも無い図と、フォルダに保存していないときは、このブラウザで積んだ変遷を出す。
  var api = _versionsApi;
  var gen = ++_vtSavedGen;
  if (name && api && _fiFolderMode()) {
    body.innerHTML = '<div class="vt-empty">読み込み中…</div>';
    Promise.all([api.load(name), api.lineCount(name)]).then(function(got) {
      if (gen !== _vtSavedGen) return;
      var saved = got[0] || [];
      if (!saved.length) { _renderVtTimelineRows(body, vtKey, only); return; }
      _renderVtSavedRows(body, sum, name, saved, got[1], only, api);
    }, function() {
      if (gen !== _vtSavedGen) return;
      _renderVtTimelineRows(body, vtKey, only);
    });
    return;
  }
  _renderVtTimelineRows(body, vtKey, only);
}

// 保存した版の行。各行に「開く」(別タブ)・「比較」(今の図の右に並べる)・「この版に戻す」、
// 前の版と同じ中身に戻った版には「往復」、中身が減った保存には戻す先を名指しする警告を出す
// (⟲ 変遷と保存先一覧の [履歴 N] が別々に持っていたものを 1 つの一覧に寄せた)。
function _renderVtSavedRows(body, sum, name, saved, nowLines, only, api) {
  var VH = window.MA.versionHistory;
  var rows = VH.markRevisits(saved);
  var revisits = rows.filter(function(r) { return r.revisit; }).length;
  if (sum) {
    sum.textContent = _vtLabelOf(name) + ': 保存した版 ' + rows.length
      + (revisits ? '（往復 ' + revisits + '）' : '');
  }
  // 「この図の履歴を消す」はこのブラウザで積んだ変遷だけを消す。保存した版は消さないので出さない。
  var forget = document.getElementById('vt-forget');
  if (forget) forget.hidden = true;
  body.textContent = '';
  var box = document.createElement('div');
  box.className = 'folder-version-list vt-saved';
  box.setAttribute('data-version-list', name);
  function act(fn) {
    return function(ev) {
      ev.stopPropagation();
      toggleVersionTimeline(false);
      fn();
    };
  }
  // 空洞化を直す側は、同じ見た目の一覧から「どれに戻せば直るか」を
  // 当てられない。行数で分かるので、戻す先を名指しして先頭に出す。減っていなければそう言う。
  var notice = VH.shrinkNotice ? VH.shrinkNotice(name, rows, nowLines) : null;
  if (notice) {
    var nb = document.createElement('div');
    nb.className = 'folder-version-shrink';
    nb.setAttribute('data-version-shrink', name);
    var nt = document.createElement('div');
    nt.className = 'folder-version-shrink-text';
    nt.textContent = notice.text;
    nt.title = notice.detail;
    nb.appendChild(nt);
    var nbtn = document.createElement('button');
    nbtn.type = 'button';
    nbtn.className = 'folder-version-shrink-restore';
    nbtn.setAttribute('data-version-shrink-restore', notice.stamp);
    nbtn.textContent = notice.restoreLabel;
    nbtn.title = notice.detail;
    nbtn.addEventListener('click', act(function() { api.restore(name, notice.stamp); }));
    nb.appendChild(nbtn);
    box.appendChild(nb);
  } else {
    var st = VH.statusNotice ? VH.statusNotice(name, rows, nowLines) : null;
    if (st) {
      var sb = document.createElement('div');
      sb.className = 'folder-version-status';
      sb.setAttribute('data-version-status', name);
      sb.textContent = st.text;
      sb.title = st.detail;
      box.appendChild(sb);
    }
  }
  var shown = only ? rows.filter(function(r) { return r.revisit; }) : rows;
  if (!shown.length) {
    var none = document.createElement('div');
    none.className = 'vt-empty';
    none.id = 'vt-empty';
    none.textContent = '往復した版はありません';
    box.appendChild(none);
  }
  shown.forEach(function(r) {
    var line = document.createElement('div');
    line.className = 'folder-version-row vt-row' + (r.revisit ? ' vt-revisit' : '');
    line.setAttribute('data-vt-revisit', r.revisit ? '1' : '0');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-version';
    if (notice && r.stamp === notice.stamp) b.setAttribute('data-version-best', '1');
    b.setAttribute('data-version-stamp', r.stamp);
    b.setAttribute('data-version-of', name);
    b.textContent = r.label + (r.kind ? '  ' + r.kind : '')
      + (r.lines != null ? '  ' + r.lines + ' 行' : '');
    b.title = r.head || 'この版を別のタブで開く（今の図は上書きしません）';
    b.addEventListener('click', act(function() { api.open(name, r.stamp); }));
    line.appendChild(b);
    if (r.revisit) {
      var badge = document.createElement('span');
      badge.className = 'vt-badge';
      badge.textContent = '往復';
      badge.title = r.revisitOf + ' の版と同じ中身に戻っています';
      line.appendChild(badge);
    }
    var cb = document.createElement('button');
    cb.type = 'button';
    cb.className = 'folder-version-compare';
    cb.setAttribute('data-version-compare', r.stamp);
    cb.setAttribute('data-version-of', name);
    cb.textContent = '比較';
    cb.title = 'この版を今の図の右に並べる（今の図は上書きしません）';
    cb.addEventListener('click', act(function() { api.compare(name, r.stamp); }));
    line.appendChild(cb);
    var rb = document.createElement('button');
    rb.type = 'button';
    rb.className = 'folder-version-restore';
    rb.setAttribute('data-version-restore', r.stamp);
    rb.setAttribute('data-version-of', name);
    rb.textContent = VH.restoreLabel();
    rb.title = VH.restoreTitle(name, r.stamp);
    rb.addEventListener('click', act(function() { api.restore(name, r.stamp); }));
    line.appendChild(rb);
    box.appendChild(line);
    if (r.revisit) {
      var why = document.createElement('div');
      why.className = 'vt-why';
      why.textContent = r.revisitOf + ' の版と同じ中身に戻っています';
      box.appendChild(why);
    }
  });
  body.appendChild(box);
}

// このブラウザで保存のたびに積んだ変遷 (フォルダに保存していないとき・版がまだ無いとき)。
function _renderVtTimelineRows(body, name, only) {
  var VT = window.MA.versionTimeline;
  var forget = document.getElementById('vt-forget');
  if (forget) forget.hidden = false;
  var esc = window.MA.htmlUtils.escHtml;
  var rows = name ? VT.rows(name) : [];
  if (only) rows = rows.filter(function(r) { return r.revisit; });

  if (!rows.length) {
    body.innerHTML = '<div class="vt-empty" id="vt-empty">'
      + (only ? '往復した版はありません' : 'この図の履歴はまだありません。保存すると 1 版ずつ積まれます')
      + '</div>';
    return;
  }

  body.innerHTML = rows.map(function(r) {
    var d = r.first ? null : VT.diffLines(name, r.rev - 1, r.rev);
    var head = '<div class="vt-line">'
      + '<span class="vt-rev">v' + r.rev + '</span>'
      + '<span class="vt-at">' + esc(r.at || '') + '</span>'
      + (r.first
          ? '<span class="vt-first">最初の版</span>'
          : '<span class="vt-delta"><span class="vt-add">+' + r.added + '</span> '
            + '<span class="vt-del">-' + r.removed + '</span></span>')
      + '<span class="vt-lines">' + r.lines + ' 行</span>'
      + (r.revisit ? '<span class="vt-badge">往復</span>' : '')
      + '</div>';
    var why = r.revisit
      ? '<div class="vt-why">v' + r.revisitOf + ' と同じ中身に戻っています</div>' : '';
    var diff = '';
    if (d && (d.added.length || d.removed.length)) {
      diff = '<div class="vt-diff">'
        + d.removed.slice(0, 6).map(function(l) { return '<span class="vt-d-del">- ' + esc(l) + '</span>'; }).join('')
        + d.added.slice(0, 6).map(function(l) { return '<span class="vt-d-add">+ ' + esc(l) + '</span>'; }).join('')
        + '</div>';
    }
    return '<div class="vt-row' + (r.revisit ? ' vt-revisit' : '') + '" data-vt-rev="' + r.rev + '"'
      + ' data-vt-revisit="' + (r.revisit ? '1' : '0') + '">' + head + why + diff + '</div>';
  }).join('');
}

// ── 道具の窓を開く 1 本の関数 ─────────────────────────────────────────────
// ツール ▾ の行・Ctrl+K・Ctrl+H・ファイルの右クリック「この図の履歴」がどれもこれを呼ぶ
// (タブ列の ⇄ 一括置換・✎ 行編集・⟲ 変遷 のボタンを押させる経路は
// TICKET-owner-20261123-0222-prune でボタンごと外した)。一括置換・行を書き換えるの窓は、
// もう開いていれば閉じる (前のボタンと同じ働き)。
var _toolRunners = {};
// 道具を開いたのと同じ click が document まで届いて「外側の click」で窓を閉じないよう、
// 開いた直後の 1 巡だけ印を立てる。
var _toolJustOpened = false;
function runTool(id) {
  var fn = _toolRunners[id];
  if (!fn) return false;
  _toolJustOpened = true;
  setTimeout(function() { _toolJustOpened = false; }, 0);
  fn();
  return true;
}
window.MA.runTool = runTool;

// この図の履歴。保存先が Git 管理下なら GIT 節の履歴に置き換える (入口は同じ)。
function openVersionHistory() {
  var G = window.MA.gitUi;
  try {
    if (G && G.isRepo && G.isRepo()) { G.showHistory(); return; }
  } catch (e) {}
  toggleVersionTimeline(true);
}

// name: 保存先一覧の [履歴 N] から開くときの図名 (開いている図でなくてもその図の履歴を出す)。
function toggleVersionTimeline(open, name) {
  var modal = document.getElementById('vt-modal');
  if (!modal) return;
  if (open) {
    _vtFile = name || _vtCurrentName() || _vtFile;
    renderVersionTimeline();
  }
  modal.style.display = open ? 'flex' : 'none';
}

function setupVersionTimeline() {
  var modal = document.getElementById('vt-modal');
  var VT = window.MA.versionTimeline;
  if (!modal || !VT) return;
  _toolRunners['tool-versions'] = openVersionHistory;

  var closeBtn = document.getElementById('vt-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleVersionTimeline(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleVersionTimeline(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleVersionTimeline(false);
  });

  var sel = document.getElementById('vt-file');
  if (sel) sel.addEventListener('change', function() { _vtFile = this.value; renderVersionTimeline(); });
  var only = document.getElementById('vt-only-revisit');
  if (only) only.addEventListener('change', renderVersionTimeline);
  var forget = document.getElementById('vt-forget');
  if (forget) {
    forget.addEventListener('click', function() {
      if (!_vtFile) return;
      VT.forget(_vtKeyOf(_vtFile));
      _vtFile = '';
      renderVersionTimeline();
    });
  }
}

// ── 他フォルダの閲覧 ───────────────────────────────────────────────────────
// 先輩の図を読むためだけに、設定ダイアログで保存先を
// フルパスで打ち替え、読んだ後また打ち戻していた (往復 60 字超)。戻し忘れると
// 自分の図が他人のフォルダに紛れ込む。読むだけなら保存先は動かさなくていい。
// 隣のフォルダを一覧から選び、その場で図を出す。設定には一切書かない。
var _peekDirs = [];
// ── 部品名の統一バッジ ────────────────
// 「今日の統一は済んでいるか」を確かめるだけの回でも、⇄ 一括置換を開き、置換前・
// 置換後を打ち、ヒット 0 件を見る空打ちが要っていた (clicks=4 / keys=16)。
// 過去に当てた組の残存件数を下端で常時数え、残り 0 なら「統一 済」と言い切る。
// 残っているときだけ押せば、その組が入った状態でパネルが開く (打鍵ゼロ)。
var _rbSum = null;
var _rbWired = false;
var _rbBusy = false;

// バッジは自前でフォルダを読む。⇄ 一括置換の読み込み (_fiFileDocs / _fiSeq) は
// 「パネルを開いている間の的」で、置換の書き戻し先でもある。常時動くバッジが
// その世代を横から進めると、開いた側が読み終える前に的が入れ替わる。
var _rbFiles = [];
var _rbDir = null;
var _rbSeq = 0;

function _rbLoadFiles() {
  var WS = window.MA.workspace;
  if (!WS || !WS.listFolder) return Promise.resolve(false);
  var dir = _wsFileDir();
  var seq = ++_rbSeq;
  return WS.listFolder(dir).then(function(info) {
    var names = ((info && info.entries) || []).map(function(e) {
      return e && typeof e === 'object' ? e.name : e;
    }).filter(function(n) { return n; });
    return Promise.all(names.map(function(n) {
      return WS.loadFile(n, dir).then(function(text) {
        return typeof text === 'string' ? { name: n, dsl: text } : null;
      }, function() { return null; });
    })).then(function(docs) {
      if (seq !== _rbSeq) return false;
      _rbFiles = docs.filter(function(d) { return d; });
      _rbDir = dir;
      return true;
    });
  }).catch(function() { return false; });
}

// 数える的。保存フォルダ運用なら未オープンの図も含める (開いている図だけで
// 「済」と言うと、開いていない図に旧称が残っていても済に見える)。
// パネル側が既に同じフォルダを読んでいればそれを使う (二重に数えない)。
function _renameBadgeDocs() {
  var FI = window.MA.folderImpact;
  var WS = window.MA.workspace;
  if (!_fiFolderMode() || !FI || !WS) return _renameDocs();
  if (_fiDir === _wsFileDir() && !_fiLoading) return _fiRows();
  var activeId = WS.getActiveId();
  var open = WS.list().map(function(d) {
    return d.id === activeId ? { id: d.id, name: d.name, dsl: mmdText } : d;
  });
  return FI.merge(open, _rbDir === _wsFileDir() ? _rbFiles : []);
}

function refreshRenameBadge(force) {
  var RB = window.MA.renameBadge;
  var RR = window.MA.renameRedo;
  if (!RB || !RR) return Promise.resolve(false);
  if (_rbBusy) return Promise.resolve(false);
  _rbBusy = true;
  var folder = _fiFolderMode();
  return Promise.all([
    folder ? loadRenamePairs(force) : Promise.resolve([]),
    folder ? _rbLoadFiles() : Promise.resolve(false),
  ]).then(function() {
    _rbSum = RB.summarize(RR.pairs(_renameRedoPairs(), _renameBadgeDocs()));
    renderRenameBadge();
    return true;
  }).catch(function() { return false; }).then(function(v) { _rbBusy = false; return v; });
}

function renderRenameBadge() {
  var RB = window.MA.renameBadge;
  var btn = document.getElementById('status-rename');
  if (!RB || !btn) return;
  btn.classList.toggle('has-open', RB.isActive(_rbSum));
  btn.setAttribute('data-tone', RB.tone(_rbSum));
  // 残りが無ければ (統一済み) 出さない。残っている組の数だけを出す。
  applyStatusBadge(btn, '統一', _rbSum ? _rbSum.remaining : null, 'warn');
  btn.setAttribute('data-pairs', _rbSum ? String(_rbSum.pairs) : '');
  btn.setAttribute('data-pending', _rbSum ? String(_rbSum.pending) : '');
  btn.setAttribute('data-remaining', _rbSum ? String(_rbSum.remaining) : '');
  btn.setAttribute('data-pair-states', RB.pairStates ? RB.pairStates(_rbSum) : '');
  btn.title = RB.titleText(null, _rbSum);
  if (_rbWired) return;
  _rbWired = true;
  // 押したら ⇄ 一括置換を開く。残っている組があればその組を入れておく
  // (バッジから置換に進む間に打つものを無くす)。
  btn.addEventListener('click', function() {
    try {
      var panel = document.getElementById('rename-panel');
      if (panel && !panel.classList.contains('open')) runTool('tool-rename');
      var next = _rbSum && _rbSum.next;
      if (next) {
        var f = document.getElementById('rename-from');
        var t = document.getElementById('rename-to');
        if (f) f.value = next.from;
        if (t) t.value = next.to;
        updateRenamePreview();
      }
    } catch (e) {}
  });
}
// FILES「読むだけ」のそのフォルダの行を見せる (覗く窓・参照ペインの相手フォルダ名から)。
function revealReadonlyDirInTree(dir) {
  var FP = window.MA.filesPanel;
  var PF = window.MA.peekFolder;
  if (FP) { try { FP.setOpen(true); FP.setSec('readonly', true); } catch (e) {} }
  return Promise.resolve(refreshReadonlyTree(false)).then(function() {
    var rows = document.querySelectorAll('#files-panel .files-ro-folder[data-ro-dir]');
    for (var i = 0; i < rows.length; i++) {
      if (PF && PF.samePath(rows[i].getAttribute('data-ro-dir'), dir)) {
        try { rows[i].scrollIntoView({ block: 'nearest' }); } catch (e) {}
        rows[i].focus();
        return true;
      }
    }
    return false;
  });
}

// FILES「読むだけ」節を開いて見出しへ移る (保存先の一覧の案内・Ctrl+K「参照」から)。
// 隣のフォルダを読む入口はこの節 1 か所。節を開くたびに隣のフォルダを取り直す (起動後に増えたフォルダも並ぶ)。
function revealReadonlySection() {
  var FP = window.MA.filesPanel;
  if (FP) { try { FP.setOpen(true); FP.setSec('readonly', true); } catch (e) {} }
  return Promise.resolve(refreshReadonlyTree(true)).then(function() {
    var head = document.getElementById('files-sec-readonly');
    if (!head) return false;
    try { head.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    head.focus();
    return true;
  });
}
window.revealReadonlySection = revealReadonlySection;
// 覗ける行き先の一覧。覗く画面を開かないまま指摘.md を読む画面 (📂一覧) のために、
// 一度だけ取りに行く。
// force: 手元の控えがあっても取り直す。保存先の一覧は起動時に開いて (design 10a)
// ここを先に呼ぶので、後から隣に増えたフォルダを「読むだけ」節が知らないままになる。
// 「読むだけ」節の並び = 保存先の隣のフォルダ + 以前「＋参照」で足したフォルダ。
// 参照タブ列を外しても、利用者が足したフォルダ (localStorage の控え) は並びに残す (隣でなくなっても消えない)。
function _peekDirsUrl(dir) {
  var RF = window.MA.refFolders;
  var kept = '';
  try { kept = RF ? RF.keepQuery(RF.load(window.localStorage), dir) : ''; } catch (e) {}
  return '/peek-dirs?dir=' + encodeURIComponent(dir) + kept;
}

function _ensurePeekDirs(force) {
  var PF = window.MA.peekFolder;
  if (!force && _peekDirs && _peekDirs.length) return Promise.resolve(true);
  if (!PF || !window.fetch) return Promise.resolve(false);
  return fetch(_peekDirsUrl(_wsFileDir()))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data) _peekDirs = PF.choices(data);
      return true;
    }).catch(function() { return false; });
}
// ── 右の枠 (読むだけ) ────────────────────────────
// 「読むだけ」節で押した隣のフォルダの図を 1 枚、書かずに右の枠に出す。
// GIT 節の「この図の履歴」の版も同じ枠に出る (下の _seniorGit)。
// 図を切り替えても、出している 1 枚は替えない。図を切り替えるたびに相手を名前で選び直す追従・
// 据え置く / 1 回だけ・共通図からの抜き出し・自分の他部品の見本・相手の選び直しの列は
// TICKET-owner-20261115-2141-prune で外した (2 枚を比べるのは「この図の履歴」の版との比較だけ)。
var _seniorName = '';    // いま右に出している図
var _seniorDir = '';     // その図のフォルダ

function _seniorEls() {
  return {
    pane: document.getElementById('senior-pane'),
    title: document.getElementById('senior-title'),
    notice: document.getElementById('senior-notice'),
    svg: document.getElementById('senior-svg'),
    dsl: document.getElementById('senior-dsl'),
  };
}

function _seniorState() {
  var SP = window.MA.seniorPane;
  return SP ? SP.load() : { open: false, dir: '', name: '' };
}

function _seniorSave(over) {
  var SP = window.MA.seniorPane;
  if (!SP) return null;
  var cur = SP.load();
  return SP.save({
    open: over && over.open !== undefined ? over.open : cur.open,
    dir: over && over.dir !== undefined ? over.dir : cur.dir,
    name: over && over.name !== undefined ? over.name : cur.name,
    width: over && over.width !== undefined ? over.width : cur.width,
    seen: over && over.seen !== undefined ? over.seen : cur.seen,
  });
}

// 右の枠に 1 枚出す。読むだけなので workspace には入れず、そのフォルダにも保存先にも書かない。
function showSeniorFile(name, dir) {
  var el = _seniorEls();
  var WS = window.MA.workspace;
  var SP = window.MA.seniorPane;
  if (!WS || !el.dsl || !dir || !name) return Promise.resolve(false);
  _seniorName = name;
  _seniorDir = dir;
  _seniorSave({ dir: dir, name: name });
  if (el.notice) el.notice.textContent = SP ? SP.noticeText(dir, name) : name;
  el.dsl.textContent = '読み込み中…';
  if (el.svg) el.svg.textContent = '';
  return WS.loadFile(name, dir).then(function(text) {
    if (name !== _seniorName || dir !== _seniorDir) return false;
    if (typeof text !== 'string') {
      el.dsl.textContent = '読めませんでした';
      return false;
    }
    el.dsl.textContent = text;
    if (!el.svg) return true;
    return renderDslToSvg(text).then(function(svg) {
      if (name !== _seniorName || dir !== _seniorDir || !el.svg) return false;
      el.svg.innerHTML = svg;
      return true;
    }).catch(function() {
      if (el.svg) el.svg.textContent = '図の描画に失敗しました (本文は下に出ています)';
      return false;
    });
  }).catch(function() {
    el.dsl.textContent = '読めませんでした';
    return false;
  });
}

// ── FILES「読むだけ」節 (design 10a) ─────────────
// 隣の保存フォルダを 1 行ずつ出す。図を押すとその 1 枚が右の枠 (senior-pane) に出る。
function renderReadonlyTree() {
  var FP = window.MA.filesPanel;
  if (!FP || !FP.renderReadonly) return;
  FP.renderReadonly(_peekDirs);
}

function refreshReadonlyTree(force) {
  return _ensurePeekDirs(!!force).then(function() { renderReadonlyTree(); return true; });
}

// ── 保存先のフォルダを選ぶ (design 10a / 10b) ─────────
// 保存先の行・「保存先」見出しの右クリック・Import ▾・Ctrl+K・⚙ 設定の 4 つの入口が、同じ語
// 「保存先のフォルダを選ぶ…」で同じ 1 つの窓を開く (TICKET-owner-20261122-1240-1)。
// パスを打つ所は窓の中の 1 か所だけ。書く値は autoSave の fileDir (⚙ 設定は今の値を見せるだけ)。

// ⚙ 設定の「設定を保存」が使う保存先 = 今の設定の値 (⚙ には打つ欄が無い)。
function _cfgCurrentFileDir() {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    var d = cfg && cfg.fileDir ? String(cfg.fileDir).trim() : '';
    return d || './autosave';
  } catch (e) { return './autosave'; }
}
// ⚙ 設定の自動保存に、今の保存先のフォルダを文字で見せる (打つ欄ではない)。
function showCfgFileDir() {
  var el = document.getElementById('cfg-file-dir-cur');
  if (!el) return;
  var d = _cfgCurrentFileDir();
  el.textContent = '今の保存先: ' + d;
  el.title = d;
}

function changeSaveTarget(dir) {
  var v = String(dir == null ? '' : dir).trim();
  if (!v) return Promise.resolve({ ok: false, reason: 'フォルダを選ぶか、パスを入れてください' });
  var SDH = window.MA.saveDirCheck;
  if (SDH) {
    var chk = SDH.check(v);
    if (!chk.ok) return Promise.resolve({ ok: false, reason: chk.reason });
    v = chk.value;
  }
  var AS = window.MA.autoSave;
  if (!AS) return Promise.resolve({ ok: false, reason: '自動保存が使えません' });
  var prev = AS.getConfig() || {};
  // 開いているタブは前の保存先のファイルを指し続ける (書き先を新しいフォルダへ付け替えない)。
  _holdOpenDocsBeforeTargetChange(prev, 'file', v);
  AS.setConfig({ backend: 'file', fileDir: v });
  showCfgFileDir();
  updateTopSaveTarget();
  // 保存先の一覧 (見出しの件数・部品のフォルダ) を替えた先で読み直す。前の保存先は「読むだけ」に並ぶ。
  if (prev.fileDir !== v || prev.backend !== 'file') { try { reloadFolderListNow(); } catch (e) {} }
  return refreshReadonlyTree(true).then(function() { return { ok: true, dir: v }; });
}

function _closeChangeTarget() {
  var m = document.getElementById('target-pick');
  if (m) m.parentNode.removeChild(m);
}
// 窓が開いている間の Esc は、手が窓の外 (右クリックのメニューが手を戻した行など) にあっても窓を閉じる。
// 先に受けて止めるので、背後の選択を外す Esc などは動かない。
window.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape' || e.isComposing) return;
  if (!document.getElementById('target-pick')) return;
  e.preventDefault();
  e.stopPropagation();
  _closeChangeTarget();
}, true);

// TICKET-roadmap-20261122-0855-1: 保存先を決める・替える窓は 1 つ (FILES の右クリック・Import ▾・Ctrl+K・⚙ 設定)。
// 窓の中でフォルダを辿り (子へ・親へ・ドライブ・最近使ったフォルダ)、今いるフォルダを保存先にする。
// 辿る・選ぶだけではどのフォルダにも何も書かない (/browse-dir は読むだけ)。パスを打って決めることもできる。
function _fileBackendDir() {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    return cfg && cfg.backend === 'file' && cfg.fileDir ? String(cfg.fileDir) : '';
  } catch (e) { return ''; }
}

function openChangeTarget() {
  _closeChangeTarget();
  var PF = window.MA.peekFolder;
  var FB = window.MA.folderBrowse;
  var m = document.createElement('div');
  m.id = 'target-pick';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', '保存先のフォルダを選ぶ');
  var box = document.createElement('div');
  box.className = 'target-pick-box';
  var h = document.createElement('div');
  h.className = 'target-pick-title';
  h.textContent = '保存先のフォルダを選ぶ';
  var cur = document.createElement('div');
  cur.className = 'target-pick-cur';
  var curDir = _fileBackendDir();
  cur.textContent = curDir
    ? '今の保存先: ' + curDir + '（替えると「読むだけ」に並びます。開いているタブは開いたファイルに保存します）'
    : '保存先はまだ決まっていません。フォルダを辿って「このフォルダを保存先にする」を押します';
  var nav = document.createElement('div');
  nav.className = 'target-pick-nav';
  nav.id = 'target-pick-nav';
  var up = document.createElement('button');
  up.type = 'button';
  up.id = 'target-pick-up';
  up.textContent = '↑ 親へ';
  nav.appendChild(up);
  var recentBox = document.createElement('div');
  recentBox.className = 'target-pick-nav';
  recentBox.id = 'target-pick-recent';
  var here = document.createElement('div');
  here.className = 'target-pick-here';
  var herePath = document.createElement('div');
  herePath.className = 'target-pick-here-path';
  herePath.id = 'target-pick-here';
  var hereOk = document.createElement('button');
  hereOk.type = 'button';
  hereOk.id = 'target-pick-here-ok';
  hereOk.textContent = 'このフォルダを保存先にする';
  here.appendChild(herePath); here.appendChild(hereOk);
  var list = document.createElement('div');
  list.className = 'target-pick-list';
  list.id = 'target-pick-list';
  var msg = document.createElement('div');
  msg.className = 'target-pick-msg';
  msg.id = 'target-pick-msg';
  var row = document.createElement('div');
  row.className = 'target-pick-row';
  var path = document.createElement('input');
  path.type = 'text';
  path.id = 'target-pick-path';
  path.spellcheck = false;
  path.placeholder = 'フォルダのパス (例: C:/work/diagrams)';
  path.setAttribute('aria-label', '保存先にするフォルダのパス');
  var ok = document.createElement('button');
  ok.type = 'button';
  ok.id = 'target-pick-ok';
  ok.textContent = '保存先にする';
  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'target-pick-cancel';
  cancel.textContent = 'やめる';
  row.appendChild(path); row.appendChild(ok); row.appendChild(cancel);
  box.appendChild(h); box.appendChild(cur); box.appendChild(nav); box.appendChild(recentBox);
  box.appendChild(here); box.appendChild(list); box.appendChild(row); box.appendChild(msg);
  m.appendChild(box);
  document.body.appendChild(m);

  var view = null;   // 今いるフォルダ (/browse-dir の答え)
  function alive() { return document.getElementById('target-pick') === m; }

  function apply(dir) {
    msg.textContent = '';
    return changeSaveTarget(dir).then(function(r) {
      if (!r.ok) { msg.textContent = '⚠ ' + r.reason; return r; }
      if (FB) {
        try { FB.saveRecent(window.localStorage, FB.pushRecent(FB.loadRecent(window.localStorage), r.dir)); } catch (e) {}
      }
      _closeChangeTarget();
      setSaveStatus('保存先を ' + (PF ? PF.baseName(r.dir) : r.dir) + ' にしました（前の保存先は「読むだけ」に並びます）');
      return r;
    });
  }
  function fetchView(dir) {
    if (!FB || !window.fetch) return Promise.resolve({ ok: false, error: 'フォルダを辿れません', path: String(dir || '') });
    return fetch(FB.browseUrl(dir))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { return FB.view(data); })
      .catch(function() { return FB.view(null); });
  }
  // dir へ移る。読めない・存在しないフォルダには移らず、理由を出す (今いるフォルダのまま)。
  function go(dir) {
    msg.textContent = '';
    return fetchView(dir).then(function(v) {
      if (!alive()) return v;
      if (!v.ok) { msg.textContent = '⚠ ' + v.error + (v.path ? ': ' + v.path : ''); return v; }
      view = v;
      render();
      return v;
    });
  }
  function render() {
    herePath.textContent = FB ? FB.hereText(view) : (view ? view.path : '');
    herePath.title = view ? view.path : '';
    hereOk.disabled = !view;
    up.disabled = !(view && view.parent);
    // ドライブ (試験の PUA_DATA_ROOT では出さない)。
    Array.prototype.slice.call(nav.querySelectorAll('.target-pick-drive')).forEach(function(b) { nav.removeChild(b); });
    (view && view.drives || []).forEach(function(d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'target-pick-drive';
      b.textContent = d;
      b.addEventListener('click', function() { go(d); });
      nav.appendChild(b);
    });
    recentBox.innerHTML = '';
    var recent = FB ? FB.loadRecent(window.localStorage) : [];
    if (recent.length) {
      var lab = document.createElement('span');
      lab.className = 'target-pick-sub';
      lab.textContent = '最近使ったフォルダ:';
      recentBox.appendChild(lab);
      recent.forEach(function(d) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'target-pick-recent';
        b.title = d;
        b.setAttribute('data-dir', d);
        b.textContent = FB.baseName(d);
        b.addEventListener('click', function() { go(d); });
        recentBox.appendChild(b);
      });
    }
    list.innerHTML = '';
    var dirs = view ? view.dirs : [];
    if (!dirs.length) {
      var none = document.createElement('div');
      none.className = 'target-pick-none';
      none.textContent = view ? 'この下にフォルダはありません' : 'フォルダを読み込み中…';
      list.appendChild(none);
      return;
    }
    dirs.forEach(function(d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'target-pick-dir';
      b.setAttribute('data-dir', d.path);
      b.title = d.path;
      b.textContent = FB.dirLabel(d);
      b.addEventListener('click', function() { go(d.path); });
      list.appendChild(b);
    });
  }
  // 打ったパスも、辿れる (存在して読める) フォルダだけを保存先にする。
  function applyTyped() {
    var v = String(path.value || '').trim();
    if (!v) { msg.textContent = '⚠ フォルダを選ぶか、パスを入れてください'; path.focus(); return Promise.resolve(null); }
    // パスを打つ所はこの欄 1 か所 (TICKET-owner-20261122-1240-1 で ⚙ 設定の欄を外した)。
    // 直せる崩れ (\ 区切り・引用符) は直し、直せない崩れ (制御文字・区切りの落ちた値) は理由を出して断る。
    var SDH = window.MA.saveDirCheck;
    if (SDH) {
      var chk = SDH.check(v);
      if (!chk.ok) { msg.textContent = '⚠ ' + chk.reason; path.focus(); return Promise.resolve(null); }
      v = chk.value;
    }
    return go(v).then(function(r) {
      if (!r || !r.ok) { path.focus(); return r; }
      return apply(r.path);
    });
  }
  up.addEventListener('click', function() { if (view && view.parent) go(view.parent); });
  hereOk.addEventListener('click', function() { if (view) apply(view.path); });
  ok.addEventListener('click', applyTyped);
  cancel.addEventListener('click', _closeChangeTarget);
  m.addEventListener('mousedown', function(e) { if (e.target === m) _closeChangeTarget(); });
  m.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _closeChangeTarget(); }
    else if (e.key === 'Enter' && e.target === path) { e.preventDefault(); applyTyped(); }
  });
  render();
  // 保存先があればその親 (隣のフォルダが並ぶ) から、無ければ server の既定 (ホーム / 試験用のフォルダ) から辿る。
  fetchView(curDir).then(function(v) {
    if (!alive()) return;
    if (v.ok && curDir && v.parent) return go(v.parent);
    if (v.ok) { view = v; render(); return; }
    return go('');
  });
  hereOk.focus();
  return m;
}
window.openChangeTarget = openChangeTarget;
window.changeSaveTarget = changeSaveTarget;

// 「読むだけ」節で押した図を右の枠に 1 枚出す (files-panel から)。
// 図を切り替えてもこの 1 枚のまま。そのフォルダにも保存先にも何も書かない。
function showReadonlyFile(dir, name) {
  if (!dir || !name) return Promise.resolve(false);
  clearSeniorGit();
  // 右に 2 枚重ねない (どちらが効いているか読めなくなる)。
  toggleCompareView(false);
  return Promise.resolve(toggleSeniorPane(true)).then(function() {
    return showSeniorFile(name, dir);
  });
}
window.showReadonlyFile = showReadonlyFile;
window.refreshReadonlyTree = refreshReadonlyTree;

function toggleSeniorPane(open) {
  var el = _seniorEls();
  if (!el.pane) return Promise.resolve(false);
  el.pane.hidden = !open;
  // 幅と取っ手は枠の出し入れと一緒に動かす。
  applySidePaneWidth('senior-pane', 'resizer-senior',
    window.MA.seniorPane && window.MA.seniorPane.STORE_KEY);
  if (open) showSeniorFirstNote();
  _seniorSave({ open: !!open });
  if (!open) {
    clearSeniorGit();
    _seniorName = '';
    _seniorDir = '';
    return Promise.resolve(true);
  }
  if (_seniorGit) return Promise.resolve(renderSeniorGit());
  return Promise.resolve(true);
}

// 初めて開いたときだけ「この枠は何か」を 1 行出す。読んだら二度と出さない。
function showSeniorFirstNote() {
  var SP = window.MA.seniorPane;
  var note = document.getElementById('senior-first-note');
  if (!SP || !note) return;
  var text = SP.firstOpenNote(_seniorState());
  if (!text) { note.hidden = true; return; }
  note.textContent = text;
  var ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = '分かった';
  ok.addEventListener('click', function() {
    _seniorSave({ seen: true });
    note.hidden = true;
  });
  note.appendChild(ok);
  note.hidden = false;
  _seniorSave({ seen: true });
}

// 図を切り替えたとき (renderTabs から)。読むだけの図は 1 枚のまま替えない。
// Git の版を出している間だけ、同じ版の「今開いている図」へ入れ替える。
function syncSeniorPane() {
  var el = _seniorEls();
  if (!el.pane || el.pane.hidden) return;
  if (_seniorGit && _seniorGit.name !== _activeDocName()) renderSeniorGit();
}

function setupSeniorPane() {
  var el = _seniorEls();
  if (!el.pane || !window.MA.seniorPane) return;
  var close = document.getElementById('senior-close');
  if (close) close.addEventListener('click', function() { toggleSeniorPane(false); });
  // 前回 1 枚を出したまま閉じたなら、次に開いたときも同じ 1 枚を出す。
  var st = _seniorState();
  if (st.open && st.dir && st.name) showReadonlyFile(st.dir, st.name);
  else if (st.open) _seniorSave({ open: false });
}

// ── Git のコミットを比較相手にする (design 10c) ─────
// 保存先が Git のとき、FILES ツリーの「この図の履歴」の「比較」や「比較する相手を選ぶ」で
// 選んだコミット時点の図を、読むだけのフォルダと同じ右の枠 (#senior-pane) に並べる。
// 見出しの相手名を押すと相手選びがその場で開き、◀ ▶ で 1 コミットずつ送れる。
// 送ると枠の中の差分の色付けもそのコミットとの差に変わる。
var _seniorGit = null;  // { commits, hash, name, diffOnly, text }

function _seniorGitEls() {
  return {
    box: document.getElementById('senior-git'),
    pick: document.getElementById('senior-git-pick'),
    prev: document.getElementById('senior-git-prev'),
    next: document.getElementById('senior-git-next'),
    sides: document.getElementById('senior-git-sides'),
    diffOnly: document.getElementById('senior-git-diffonly'),
    sbs: document.getElementById('senior-git-sbs'),
  };
}

function _seniorGitCommit() {
  var GP = window.MA.gitPanel;
  if (!_seniorGit || !GP) return null;
  if (!_seniorGit.hash) return { hash: '', short: '作業中', message: '今の編集内容' };
  var i = GP.indexOf(_seniorGit.commits, _seniorGit.hash);
  if (i >= 0) return _seniorGit.commits[i];
  // 控えの行 は ◀ ▶ で送るコミットの並びに無い。押した行そのものを使う。
  if (_seniorGit.row && _seniorGit.row.hash === _seniorGit.hash) return _seniorGit.row;
  return { hash: _seniorGit.hash, short: _seniorGit.hash.slice(0, 7), message: '' };
}

// 枠の見出しを Git の相手用に切り替える。
function _seniorGitHead(on) {
  var g = _seniorGitEls();
  var el = _seniorEls();
  if (g.box) g.box.hidden = !on;
  if (el.title) el.title.textContent = on ? 'この図の履歴' : '読むだけ';
  if (el.pane) el.pane.setAttribute('data-compare', on ? 'git' : 'folder');
}

function clearSeniorGit() {
  if (!_seniorGit) return;
  _seniorGit = null;
  _seniorGitHead(false);
  var el = _seniorEls();
  if (el.dsl) el.dsl.textContent = '';
  if (el.svg) el.svg.textContent = '';
  if (el.notice) el.notice.textContent = '';
  _seniorName = '';
  _seniorDir = '';
  syncGitDiagramDiff();
}

// 「コミットを送ると、図の上の差分の色付けも
// そのコミットとの差に変わります」。コミットと比較している間だけ、左のプレビューの図には
// そのコミットに無い文字 (増えた・変わった) に緑、右の枠のコミット時点の図には作業中に無い
// 文字 (消えた・変わった) に赤の印を付ける。比べるのは描かれている文字 (svg-text-diff)。
// 右の図を描いたとき・左の図を描き直したとき・比較をやめたときに呼ぶ。
function syncGitDiagramDiff() {
  var TD = window.MA.svgTextDiff;
  if (!TD) return null;
  var el = _seniorEls();
  var left = previewSvgEl ? previewSvgEl.querySelector('svg') : null;
  var right = el.svg ? el.svg.querySelector('svg') : null;
  var legend = document.getElementById('senior-git-legend');
  if (left) TD.unmark(left, TD.CLS_ADD);
  if (right) TD.unmark(right, TD.CLS_DEL);
  var on = !!(_seniorGit && _seniorGit.hash && _seniorGit.text && el.pane && !el.pane.hidden && left && right);
  if (!on) {
    if (legend) legend.textContent = '';
    return null;
  }
  var leftTexts = TD.texts(left);
  var rightTexts = TD.texts(right);
  var added = TD.mark(left, rightTexts, TD.CLS_ADD);
  var removed = TD.mark(right, leftTexts, TD.CLS_DEL);
  if (legend) legend.textContent = TD.legend(added, removed);
  return { added: added, removed: removed };
}

// commit: 比べるコミット (hash が空なら作業中)。commits: ◀ ▶ で送る並び (この図の履歴)。
function showSeniorGitRev(commit, commits) {
  var el = _seniorEls();
  if (!el.pane) return Promise.resolve(false);
  _seniorGit = {
    commits: Array.isArray(commits) ? commits : (_seniorGit ? _seniorGit.commits : []),
    hash: (commit && commit.hash) || '',
    row: commit || null,
    name: '',
    diffOnly: _seniorGit ? _seniorGit.diffOnly : false,
    text: '',
  };
  if (el.pane.hidden) return toggleSeniorPane(true);
  return Promise.resolve(renderSeniorGit());
}

function _seniorGitLines(commitText) {
  var LD = window.MA.liveDiff;
  var rows = LD ? LD.rows(commitText, mmdText) : [];
  return rows;
}

function renderSeniorGit() {
  var el = _seniorEls();
  var g = _seniorGitEls();
  var GP = window.MA.gitPanel;
  if (!_seniorGit || !GP) return Promise.resolve(false);
  _seniorGitHead(true);
  var c = _seniorGitCommit();
  var name = _activeDocName();
  var stem = String(name || '').replace(/\.puml$/i, '');
  _seniorGit.name = name;
  _seniorName = '';
  if (g.pick) {
    g.pick.textContent = GP.paneTitle(c) + ' ▾';
    g.pick.setAttribute('data-hash', c.hash || '');
  }
  if (g.sides) g.sides.textContent = GP.sidesLabel(c);
  if (g.prev) g.prev.disabled = !c.hash || !GP.step(_seniorGit.commits, c.hash, -1);
  if (g.next) g.next.disabled = !c.hash || !GP.step(_seniorGit.commits, c.hash, 1);
  _paintSeniorGitView();
  var want = _seniorGit.hash;
  if (el.notice) {
    el.notice.textContent = c.version
      ? ('保存した版の控え ' + (c.label || c.version) + ' の ' + (name || '図') + '（読むだけ）')
      : c.hash
      ? ('コミット ' + GP.paneTitle(c) + ' 時点の ' + (name || '図') + '（読むだけ）')
      : ('作業中の ' + (name || '図') + '（未コミット）');
  }
  if (el.dsl) el.dsl.textContent = '読み込み中…';
  // GIT 節の履歴に混ぜた控えの行は、server の _versions から読む。
  var load = !c.hash
    ? Promise.resolve(mmdText)
    : c.version
    ? window.fetch('/autosave-versions?dir=' + encodeURIComponent(_wsFileDir()) + '&type=' + encodeURIComponent(stem) + '&stamp=' + encodeURIComponent(c.version))
      .then(function(r) { return r.ok ? r.text() : null; })
      .catch(function() { return null; })
    : window.fetch('/git-show?dir=' + encodeURIComponent(_gitDocDir()) + '&file=' + encodeURIComponent(stem)
        + '&rev=' + encodeURIComponent(c.hash))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { return d && typeof d.text === 'string' ? d.text : null; })
      .catch(function() { return null; });
  return load.then(function(text) {
    if (!_seniorGit || _seniorGit.hash !== want) return false;
    if (typeof text !== 'string') {
      _seniorGit.text = '';
      if (el.dsl) {
        el.dsl.textContent = c.version ? 'この控えを読めませんでした'
          : 'このコミットには ' + (name || 'この図') + ' がありません';
      }
      if (el.svg) el.svg.textContent = '';
      try { syncGitDiagramDiff(); } catch (e) {}
      return false;
    }
    _seniorGit.text = text;
    renderSeniorGitDsl();
    if (!el.svg) return true;
    return renderDslToSvg(text).then(function(svg) {
      if (!_seniorGit || _seniorGit.hash !== want || !el.svg) return false;
      el.svg.innerHTML = svg;
      try { syncGitDiagramDiff(); } catch (e) {}
      return true;
    }).catch(function() {
      if (el.svg) el.svg.textContent = '図の描画に失敗しました (本文は下に出ています)';
      return false;
    });
  });
}

// 本文に作業中との差を色で付ける (このコミットにだけある行 = 赤、作業中にだけある行 = 緑)。
// 「差分だけ」では変わった行だけを出す。
function renderSeniorGitDsl() {
  var el = _seniorEls();
  if (!el.dsl || !_seniorGit) return;
  var rows = _seniorGitLines(_seniorGit.text);
  el.dsl.textContent = '';
  var shown = 0;
  rows.forEach(function(r) {
    if (_seniorGit.diffOnly && r.kind === 'same') return;
    if (!_seniorGit.diffOnly && r.kind === 'add') return;
    var line = document.createElement('div');
    line.className = 'sg-line sg-' + r.kind;
    line.textContent = (r.kind === 'del' ? '− ' : (r.kind === 'add' ? '+ ' : '  ')) + r.text;
    el.dsl.appendChild(line);
    shown++;
  });
  if (!shown) el.dsl.textContent = _seniorGit.diffOnly ? '作業中と同じ本文です' : '';
}

function stepSeniorGit(dir) {
  var GP = window.MA.gitPanel;
  if (!_seniorGit || !GP) return Promise.resolve(false);
  var n = GP.step(_seniorGit.commits, _seniorGit.hash, dir);
  if (!n) return Promise.resolve(false);
  _seniorGit.hash = n.hash;
  return renderSeniorGit();
}

// 見出しの「差分だけ / 全体」。押している方だけ地色。
// 差分だけ = 作業中と違う行だけ、全体 = 本文の全部と図。
function _paintSeniorGitView() {
  var g = _seniorGitEls();
  var on = !!(_seniorGit && _seniorGit.diffOnly);
  if (g.diffOnly) g.diffOnly.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (g.sbs) g.sbs.setAttribute('aria-pressed', on ? 'false' : 'true');
}

function setSeniorGitView(diffOnly) {
  if (!_seniorGit) return;
  _seniorGit.diffOnly = !!diffOnly;
  _paintSeniorGitView();
  renderSeniorGitDsl();
}

function setupSeniorGit() {
  var g = _seniorGitEls();
  if (g.prev) g.prev.addEventListener('click', function() { stepSeniorGit(-1); });
  if (g.next) g.next.addEventListener('click', function() { stepSeniorGit(1); });
  // design 10c: 「差分だけ / 全体」の 2 択。押した方にする (裏返さない)。
  if (g.diffOnly) g.diffOnly.addEventListener('click', function() { setSeniorGitView(true); });
  if (g.sbs) g.sbs.addEventListener('click', function() { setSeniorGitView(false); });
  // 相手の名前を押すと、相手選びがその場で開く (git-ui が持つ)。
  if (g.pick) {
    g.pick.addEventListener('click', function() {
      if (window.MA.gitUi) window.MA.gitUi.openPicker(g.pick);
    });
  }
  // 打つたびに色付けを追う (相手は動かない、こちらが動く)。
  window.MA.appGit = {
    compare: showSeniorGitRev,
    clear: clearSeniorGit,
    step: stepSeniorGit,
    current: function() { return _seniorGit ? { hash: _seniorGit.hash, name: _seniorGit.name } : null; },
    activeName: _activeDocName,
    fileDir: _wsFileDir,
    docDir: _gitDocDir,
    workingText: function() { return mmdText; },
    refreshDiff: function() { if (_seniorGit && _seniorGit.text) renderSeniorGitDsl(); },
    diagramDiff: syncGitDiagramDiff,
    // GIT 節の「この図の履歴」に控え (server の _versions) も混ぜる。
    versions: function(name) { return _versionsApi ? _versionsApi.load(name) : Promise.resolve([]); },
    lineCount: function(name) { return _versionsApi ? _versionsApi.lineCount(name) : Promise.resolve(null); },
    restoreVersion: function(name, stamp) { return _versionsApi ? _versionsApi.restore(name, stamp) : null; },
  };
  // 保存先が決まった後で GIT 欄を読む (FILES の骨格は init より先に出ている)。
  try { if (window.MA.gitUi) window.MA.gitUi.refresh(); } catch (e) {}
}

// setupTabs の中の一覧を外から開く口 (design 10a)。
var _ensureFolderListOpen = function() {};
var _openFolderListAtBoot = function() {};
// 保存先の一覧 (旧 📂 一覧の点検の部品ごと) を中央の枠に開く。
// FILES ツリーの「保存先」節はファイルの行と札だけにし、一覧はここからだけ開く。
var _openFolderListView = function() {};

function setupTabs() {
  if (!window.MA.workspace) return;
  renderTabs();

  var btnNew = document.getElementById('btn-tab-new');
  if (btnNew) {
    btnNew.addEventListener('click', function() {
      saveActiveDoc();
      // 新規タブは白紙で作る。手本を持っている人には
      // 雛形のサンプル (Class なら User / IAuth) は打ち始める前に全消去する
      // 一手間にしかならない。見本が要る人には無選択時の右ペインに
      // 「まとめて追加」「白紙から: ひな形」があり、そちらから入れられる。
      var BD = window.MA.blankDoc;
      openNewDocTab(currentDiagramType, BD ? BD.blankDsl(currentDiagramType) : '@startuml\n@enduml');
      applyActiveDoc();
      // 新規タブも作った時点でフォルダに現れる。
      saveActiveDoc();
    });
  }

  var panel = document.getElementById('folder-panel');
  var btnFolder = document.getElementById('btn-tab-folder');
  if (!panel || !btnFolder) return;

  // 一覧を中央の枠に開いている間 (is-list) は、閉じると枠だけを下げて
  // ツリーの「保存先」節は開いたままにする (図を 1 枚開くたびに節まで畳まない)。
  function closePanel() {
    if (panel.classList.contains('is-list')) { panel.classList.remove('is-list'); return; }
    panel.classList.remove('open');
  }

  // 隣のフォルダを読むのは FILES の「読むだけ」節 1 か所。一覧の頭の案内は
  // TICKET-owner-20261115-2141-prune で外した。

  // 一覧に印を付けて、まとめてタブで開く。
  // 印はパネルを開いている間だけ持つ (次に開いたときは白紙から選ぶ)。
  var folderPicked = [];
  var folderNames = [];
  // 名前での絞り込み。一覧は 20 枚超の行が縦に並び、
  // 行ごとに印・役割・差分のボタンが付くので、目的の 1 枚を一発で押し分けにくい。
  var folderQuery = '';
  var folderFocusFilter = false;   // 一覧を開いた直後だけ絞り込み欄にカーソルを置く
  // 図名 → 上書き前に控えてある版の数と、本体がもう
  // 無いのに版だけ残っている図。server が一覧と同じ呼び出しで返す。
  var versionCounts = {};
  // 図名 → いまの本文の行数。
  var versionNowLines = {};

  // いま保存されている中身の行数。開いているタブがあればそちらを優先する
  // (一覧を出したあとに直した分まで数に入れる)。無ければ保存フォルダから読む。
  // 読めなければ null (空洞化の判定をやめる。当てずっぽうで戻す先を勧めない)。
  function _folderLineCount(name) {
    try {
      // 今開いているサブフォルダの図なら、直下の同じ名前のタブではなくその図の行数 (TICKET-roadmap-20261123-0226-4)。
      var asub = _vtActiveSub(name);
      if (asub && typeof asub.dsl === 'string') return Promise.resolve(asub.dsl.split('\n').length);
      var WS = window.MA.workspace;
      var list = (WS && WS.list) ? WS.list() : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].name === name && typeof list[i].dsl === 'string') {
          return Promise.resolve(list[i].dsl.split('\n').length);
        }
      }
    } catch (e) {}
    if (typeof versionNowLines[name] === 'number') {
      return Promise.resolve(versionNowLines[name]);
    }
    // 版の一覧を開いたときだけ読む (一覧の応答に全図の本文を積まない)。
    return Promise.resolve(window.MA.workspace.loadFile(name, _wsFileDir()))
      .then(function(text) {
        if (typeof text !== 'string') return null;
        versionNowLines[name] = text.split('\n').length;
        return versionNowLines[name];
      }, function() { return null; });
  }
  var goneVersions = [];
  // 図名 → 図種。「自分の状態遷移図が無い」を、
  // 22 枚を 1 枚ずつ開いて確かめるのではなく一覧の時点で言うため。
  var kindByName = {};
  var kindEntries = [];
  // 図名 → 保存したときの図種 (server の _kinds.json)。
  // 本文からの判定 (kindByName) と違い、保存した側が知っている図種なので、
  // 「別図種と紛らわしい書き方」をしていても開くときに図種が入れ替わらない。
  var savedKindByName = {};
  var savedKindsLoaded = false;
  // 行の 🗑 を 1 回押した名前 (2 回目で消す)。描き直すと白紙に戻る。
  var deleteArmed = '';

  // フォルダから開くときの図種。
  // 控え (保存したときの図種) > 本文からの判定 > 今の図種。
  function _folderOpenType(name, text) {
    var SK = window.MA.savedKind;
    if (!SK) {
      var d0 = window.MA.workspace.detectType(text);
      return (d0 && modules[d0]) ? d0 : currentDiagramType;
    }
    return SK.resolveType({
      savedKind: SK.pick(savedKindByName, name),
      dsl: text,
      detectType: window.MA.workspace.detectType,
      known: modules,
      fallback: currentDiagramType,
    });
  }

  // 一覧をまだ一度も読んでいないときだけ控えを取りに行く
  // (開くたびに読み直すと、一覧から連続で開く手が毎回 1 往復ぶん待たされる)。
  function _ensureSavedKinds(dir) {
    if (savedKindsLoaded || !window.MA.workspace.listFolder) return Promise.resolve();
    return window.MA.workspace.listFolder(dir).then(function(res) {
      savedKindByName = (res && res.kinds && typeof res.kinds === 'object') ? res.kinds : {};
      savedKindsLoaded = true;
    }, function() {});
  }

  function _openDocNames() {
    if (!window.MA.workspace) return [];
    return window.MA.workspace.list().map(function(d) { return d.name; });
  }

  // 選んだ順ではなく一覧の順に、1 枚ずつ読んでタブにする。
  // 途中で読めない図があっても残りは開く (1 枚のために全部が止まらない)。
  function openManyFromFolder(names) {
    var FS = window.MA.folderSelect;
    var dir = _wsFileDir();
    // これから読み直す図を先に書き戻すと、保存の確認に
    // ならない (必ず一致する)。開く対象に入っていない図だけ書き戻す。
    var act = window.MA.workspace.getActive();
    if (!(act && names.indexOf(act.name) >= 0)) saveActiveDoc();
    var queue = names.slice();
    function step() {
      if (queue.length === 0) {
        applyActiveDoc();
        renderTabs();
        return;
      }
      var name = queue.shift();
      window.MA.workspace.loadFile(name, dir).then(function(text) {
        if (text != null) {
          // ディスクにある中身が、その図の「前回保存版」そのもの。ここで基準を
          // 置かないと一覧から開いた図は比べる相手を持たず、前回保存版との増減を
          // 出せない。
          if (window.MA.saveDiff) { try { window.MA.saveDiff.mark(name, text); } catch (e) {} }
          openExistingFile({
            name: name,
            dsl: text,
            diagramType: _folderOpenType(name, text),
          });
        }
        step();
      }, step);
    }
    if (FS) step();
  }

  // 開いた図を憶えておく置き場。localStorage が使えない
  // 環境でも一覧は今までどおり出る (履歴だけが空になる)。
  var RECENT_KEY = 'plantuml-recent-files';
  function recentList() {
    var raw = null;
    try { raw = localStorage.getItem(RECENT_KEY); } catch (e) { return []; }
    if (!raw) return [];
    var v = null;
    try { v = JSON.parse(raw); } catch (e) { return []; }
    return (v && v.length) ? v : [];
  }
  function recentSave(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list || [])); } catch (e) {}
  }
  function recentPush(name) {
    var RF = window.MA.recentFiles;
    if (!RF || !name) return;
    recentSave(RF.push(recentList(), name));
  }
  recentOpenedNames = function() { return recentList(); };

  openFromFolderByName = function(name) { openFromFolder(name); };

  // TICKET-roadmap-20261122-0855-2: 保存先の下のサブフォルダの図を、そのフォルダのファイルとして開く。
  // タブはそのフォルダを持ち (workspace の sub・dir)、Ctrl+S・自動保存・!include・パンくずはそのフォルダで決まる。
  // 直下に同じ名前の図があっても別のタブ (名前を付け替えない)。保存先の一覧と「最近開いた図」は直下の図だけを
  // 並べるので、ここでは積まない (名前だけの履歴から開くと直下の同じ名前の図を開いてしまう)。
  // 開いただけでは書かない (開いたときの本文を錠に憶え、変えるまで書き戻さない)。
  function openFromSubFolder(name, dir, opts) {
    var WS = window.MA.workspace;
    if (!WS || !name || !dir) return Promise.resolve(false);
    var spec0 = { name: name, sub: true, dir: dir };
    var active = WS.getActive();
    var sameTab = !!(active && active.sub && active.name === name && WS.samePath && WS.samePath(active.dir, dir));
    if (!sameTab) saveActiveDoc();
    var already = WS.findOpen ? WS.findOpen(spec0) : null;
    if (already) {
      if (opts && opts.pin && WS.pin) WS.pin(already.id);
      if (typeof window.switchToDoc === 'function') window.switchToDoc(already.id);
      else { WS.setActive(already.id); applyActiveDoc(); }
      if (opts && opts.pin && typeof window.renderTabs === 'function') window.renderTabs();
      return Promise.resolve(true);
    }
    return WS.loadFile(name, dir).then(function(text) {
      if (text == null) {
        if (window.MA.toast) window.MA.toast.show(name + '.puml を読めませんでした (' + dir + ')');
        return false;
      }
      // ディスクにある中身が、その図の「前回保存版」(未保存の ○ / ● を付けない)。基準は直下の同じ名前の図と分ける。
      if (window.MA.saveDiff) { try { window.MA.saveDiff.mark(_diffName({ name: name, sub: true, dir: dir }), text); } catch (e) {} }
      var d0 = WS.detectType(text);
      var spec = { name: name, sub: true, dir: dir, dsl: text,
                   diagramType: (d0 && modules[d0]) ? d0 : currentDiagramType };
      var doc = (opts && opts.preview && WS.openPreview) ? WS.openPreview(spec) : WS.openOrActivate(spec);
      if (opts && opts.pin && WS.pin) WS.pin(doc.id);
      markOpenedSource(doc);
      applyActiveDoc();
      try { renderLiveDiffChip(); } catch (e) {}
      return true;
    });
  }
  window.openFromSubFolder = openFromSubFolder;
  refreshFolderPanelNow = function() { if (panel.classList.contains('open')) renderFolderPanel(); };

  // 自動保存・Ctrl+S で新しく書いた図が、FILES ツリーの保存先に読み込み直すまで
  // 出なかった (外で消えた図の行も残った)。保存先の一覧は開いた時に 1 回読むだけだったため。
  // 書いた・消した知らせ (workspace の pua:folder-changed) と、ウィンドウにフォーカスが戻った時・FILES を
  // 開き直した時に、ディスクの顔ぶれと並べている顔ぶれを比べ、違えば一覧を読み直す
  // (VS Code・IntelliJ のエクスプローラと同じ)。同じなら読み直さない (打つたびの自動保存で一覧を組み直さない)。
  var _folderShown = null;       // { dir, sig } 最後に並べた保存先と顔ぶれ
  var _folderSyncTimer = null;
  var _folderSyncBusy = false;
  var _folderSyncAgain = false;   // 比べている最中に来た知らせは、終わってからもう 1 回比べる
  var _folderSyncOnClose = false; // 中央の枠を開いている間に来た知らせは、枠を閉じてから比べる
  function _folderSyncable() {
    if (!_folderShown) return false;              // まだ一度も並べていない (開いた時に読む)
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    return !!(cfg && cfg.backend === 'file');
  }
  function _sameDir(a, b) {
    if (a === b) return true;
    var PF = window.MA.peekFolder;
    return !!(PF && PF.samePath && PF.samePath(a, b));
  }
  syncFolderListNow = function() {
    if (_folderSyncBusy) { _folderSyncAgain = true; return Promise.resolve(false); }
    if (!_folderSyncable()) return Promise.resolve(false);
    var WS = window.MA.workspace;
    var FT = window.MA.fileTree;
    if (!WS || !WS.listFileEntries || !FT || !FT.nameSig) return Promise.resolve(false);
    var dir = _wsFileDir();
    // 一覧を中央の枠に開いている間は組み直さない (押そうとした行が手の下で作り直され、押しても開かない)。
    // 枠は開くたびに読み直すので、閉じた時に比べ直す。
    if (panel.classList.contains('is-list')) { _folderSyncOnClose = true; return Promise.resolve(false); }
    _folderSyncBusy = true;
    function done() {
      _folderSyncBusy = false;
      if (_folderSyncAgain) { _folderSyncAgain = false; _folderSyncSoon(50); }
    }
    return WS.listFileEntries(dir).then(function(entries) {
      done();
      if (!_folderSyncable() || _wsFileDir() !== dir) return false;
      var sig = FT.nameSig(entries);
      if (_folderShown && _folderShown.dir === dir && _folderShown.sig === sig) return false;
      if (panel.classList.contains('is-list')) { _folderSyncOnClose = true; return false; }
      renderFolderPanel();
      return true;
    }, function() { done(); return false; });
  };
  function _folderSyncSoon(ms) {
    if (_folderSyncTimer) clearTimeout(_folderSyncTimer);
    _folderSyncTimer = setTimeout(function() { _folderSyncTimer = null; syncFolderListNow(); }, ms || 250);
  }
  window.addEventListener('pua:folder-changed', function(ev) {
    var d = (ev && ev.detail) || {};
    if (!_folderSyncable() || !_sameDir(String(d.dir || ''), _wsFileDir())) return;
    var FT = window.MA.fileTree;
    var has = FT && FT.sigHas ? FT.sigHas(_folderShown.sig, d.name) : false;
    // 並べている図を書き直しただけなら顔ぶれは変わらない。新しい名前・消した名前のときだけ比べに行く。
    if (d.what === 'written' && has) return;
    if (d.what === 'deleted' && !has) return;
    _folderSyncSoon(150);
  });
  // 外で増えた・消えた図は、ウィンドウにフォーカスが戻った時・タブが見えるようになった時に拾う。
  window.addEventListener('focus', function() { _folderSyncSoon(100); });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') _folderSyncSoon(100);
  });
  if (window.MutationObserver) {
    new window.MutationObserver(function() {
      if (_folderSyncOnClose && !panel.classList.contains('is-list')) {
        _folderSyncOnClose = false;
        _folderSyncSoon(100);
      }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
  // FILES を開き直した時 (レールの FILES・保存先の行の ▸) も拾う。
  ['rail-files', 'files-target-caret'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { _folderSyncSoon(50); });
  });
  // 保存先を変えたときは畳んでいても読み直す (FILES の部品フォルダと
  // 上部バーの部品の段はこの一覧を読むので、閉じたままだと前のフォルダの図が残る)。
  reloadFolderListNow = function() { renderFolderPanel(); };

  // 開いているタブと同じ名前を一覧から押したときに
  // 画面が何も動かないと、「保存できている」のか「一覧が効いていない」のかが
  // 分からない。同じ名前なら (1) 編集中の本文をそのファイルへ書き戻さずに読み、
  // (2) 読んだ結果を必ず言葉で返す。書き戻してから読むと、保存の確認そのものが
  // 成り立たない (いつ押しても必ず一致する)。
  function openFromFolder(name, opts) {
    // 1 回押しの仮開きはツリーを開いたままにする (次の図を続けて押せる・ダブルクリックで固定にできる)。
    if (!(opts && opts.preview)) closePanel();
    var dir = _wsFileDir();
    var active = window.MA.workspace.getActive();
    // サブフォルダの図 (sub) は同じ名前でも別のファイル。そのタブを「同じ図の読み直し」と取り違えない。
    var sameTab = !!(active && active.name === name && !active.sub);
    if (!sameTab) saveActiveDoc();
    _ensureSavedKinds(dir).then(function() {
    window.MA.workspace.loadFile(name, dir).then(function(text) {
      var FR = window.MA.folderReopen;
      var before = mmdText;
      var info = FR
        ? FR.describe(name, text, before, sameTab)
        : { kind: text == null ? 'missing' : 'opened', changed: text != null, message: '' };
      if (text != null) {
        // ディスクにある中身が、その図の「前回保存版」そのもの
        if (window.MA.saveDiff) { try { window.MA.saveDiff.mark(name, text); } catch (e) {} }
        openExistingFile({
          name: name,
          dsl: text,
          diagramType: _folderOpenType(name, text),
        }, opts);
        applyActiveDoc();
        try { renderLiveDiffChip(); } catch (e) {}
        // 読めた図だけを履歴に積む (読めなかった名前を「最近」に出さない)。
        recentPush(name);
      }
      if (window.MA.toast && info.message) {
        if (info.kind === 'replaced') {
          window.MA.toast.show(info.message, '元に戻す', function() {
            window.MA.workspace.updateActive({ dsl: before });
            applyActiveDoc();
          });
        } else {
          window.MA.toast.show(info.message);
        }
      }
    });
    });
  }

  btnFolder.addEventListener('click', function() {
    if (panel.classList.contains('open')) {
      panel.classList.remove('is-list');
      closePanel();
      _rememberTargetSec(false);
      return;
    }
    _rememberTargetSec(true);
    openFolderList(true);
  });

  // design 10a: 「保存先」節は既定で開いておく (FILES ツリーの節の既定)。
  // 見出しを押して畳んだら次の起動でも畳んだまま出す (覚えるのは開閉だけ)。
  function _rememberTargetSec(on) {
    try { window.localStorage.setItem('pua.files.sec.target', on ? '1' : '0'); } catch (e) {}
  }
  // focus: 開いた直後に絞り込み欄へカーソルを置くか。起動時に既定で開くときは
  // 置かない (エディタに打ち始めた文字が絞り込み欄へ吸われる)。
  var _peekDirsFromBoot = false;
  function openFolderList(focus) {
    // 起動時に既定で開いた一覧は、隣のフォルダ (参照タブ・読むだけの行き先) を
    // 起動した時点の姿で控えている。人が初めて押して開くときに 1 度だけ取り直す
    // (既定で開く前は、この最初の 1 押しが取りに行く時点だった)。
    // 空にせず取り直し、届いたら一覧を描き直す。
    if (focus && _peekDirsFromBoot) {
      _peekDirsFromBoot = false;
      _ensurePeekDirs(true).then(function() { try { refreshFolderPanelNow(); } catch (e) {} });
    }
    // 一覧を開くだけでは保存フォルダへ書き出さない。
    // ここで書き出すと、保存できたかを一覧から確かめようとするたびに編集中の本文で
    // ファイルが上書きされ、「開き直したら必ず一致する」ので確認にならなかった。
    // タブの控え (workspace) だけ今の本文にそろえる。
    if (window.MA.workspace) {
      window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType });
    }
    folderQuery = '';           // 絞り込みは開き直すたびに白紙に戻す
    folderFocusFilter = !!focus;   // 押して開いたらそのまま名前を打ち始められる
    panel.textContent = '';
    var loading = document.createElement('div');
    loading.className = 'folder-empty';
    loading.textContent = '読み込み中…';
    panel.appendChild(loading);
    panel.classList.add('open');
    // design 10a: ツリーの中では節の中身としてそのまま流れるので座標は置かない。
    if (!panel.closest || !panel.closest('#files-panel')) {
      var rect = btnFolder.getBoundingClientRect();
      panel.style.left = rect.left + 'px';
      panel.style.top = (rect.bottom + 2) + 'px';
    }
    renderFolderPanel();
  }
  // 他の入口 (取り込み ▾ の「フォルダ」、名前の衝突の札、Ctrl+K) は「開く」だけ。
  // 既定で開いている節を、開くつもりで押して畳んでしまわない。
  _ensureFolderListOpen = function() {
    _openFolderListView();
  };
  // 保存先の一覧を中央の枠に開く。開くたびに読み直す (台本・人が後から置いたファイルも出す)。
  _openFolderListView = function() {
    if (!panel.classList.contains('open')) _rememberTargetSec(true);
    panel.classList.add('is-list');
    // Ctrl+K の行・Import ▾ の項目を押して開くと、その同じクリックが
    // document まで上がって「枠の外を押した」と読まれ、開いた瞬間に閉じていた。
    // 開いたクリックが上がりきるまで (同じ処理の中) は外側クリックとして数えない。
    _listOpening = true;
    setTimeout(function() { _listOpening = false; }, 0);
    openFolderList(true);
  };
  var _listOpening = false;
  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape' || !panel.classList.contains('is-list')) return;
    panel.classList.remove('is-list');
  });
  _openFolderListAtBoot = function() {
    if (panel.classList.contains('open')) return;
    var FT = window.MA.fileTree;
    var def = FT ? FT.defaultOpen('target') : true;
    var saved = null;
    try { saved = window.localStorage.getItem('pua.files.sec.target'); } catch (e) {}
    if (saved === null ? def : saved === '1') { openFolderList(false); _peekDirsFromBoot = true; }
  };


  // 一覧の描画は listFolder を待つので、先に頼んだ描画が後から届くことがある
  // (起動時に既定で開いた描画の返事が、人が押して開き直した描画の後に着く)。
  // 最後に頼んだ描画だけを画面に出す。
  // 中央の枠に開いたときの見出しと閉じる ✕ (Esc・枠の外を押しても閉じる)。ツリーの節は畳まない。
  function appendListHead(host) {
    var head = document.createElement('div');
    head.className = 'folder-list-head';
    var t = document.createElement('span');
    t.className = 'folder-list-title';
    var cfgH = null;
    try { cfgH = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfgH = null; }
    var ST = window.MA.saveTarget;
    t.textContent = '保存先の一覧 — ' + ((ST && ST.listDir) ? (ST.listDir(cfgH) || '保存先は未設定') : _wsFileDir());
    head.appendChild(t);
    var x = document.createElement('button');
    x.type = 'button';
    x.id = 'folder-list-close';
    x.className = 'folder-list-close';
    x.textContent = '✕';
    x.title = '一覧を閉じる (Esc)。ツリーの保存先は開いたまま';
    x.setAttribute('aria-label', '保存先の一覧を閉じる');
    x.addEventListener('click', function(ev) { ev.stopPropagation(); panel.classList.remove('is-list'); });
    head.appendChild(x);
    host.appendChild(head);
  }

  var _folderRenderGen = 0;
  // 保存フォルダの外にある手元の .puml を開く入口を一覧の頭に置く。
  function appendOpenHead(host) {
    var openHead = document.createElement('button');
    openHead.type = 'button';
    openHead.className = 'folder-open-file';
    openHead.id = 'folder-open-file';
    openHead.textContent = 'ファイルを開く(.puml)';
    openHead.title = '保存フォルダの外にある .puml を開きます (複数可・ドラッグ&ドロップでも開けます)';
    openHead.addEventListener('click', function() { closePanel(); openFile(); });
    host.appendChild(openHead);
  }

  // TICKET-owner-20261123-1922-1: 保存先を決めていない (保存がダウンロードの) ときは図を並べず、案内だけを出す。
  // 一覧に並べたフォルダと、そこから開いた図の Ctrl+S・書き出し・`!include` の場所を食い違わせない。
  function renderFolderUnset() {
    _folderShown = { dir: '', sig: '' };
    setFolderNames([]);
    kindEntries = [];
    kindByName = {};
    versionCounts = {};
    versionNowLines = {};
    goneVersions = [];
    panel.textContent = '';
    appendListHead(panel);
    appendOpenHead(panel);
    var h = window.MA.saveTarget.unsetHint();
    var msg = document.createElement('div');
    msg.className = 'folder-empty folder-unset';
    msg.id = 'folder-unset';
    msg.textContent = h.text;
    panel.appendChild(msg);
    var how = document.createElement('div');
    how.className = 'folder-empty';
    how.id = 'folder-unset-hint';
    how.textContent = h.how;
    panel.appendChild(how);
  }

  function renderFolderPanel() {
    var myGen = ++_folderRenderGen;
    var ST = window.MA.saveTarget;
    var cfgNow = null;
    try { cfgNow = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfgNow = null; }
    if (ST && ST.listDir && !ST.listDir(cfgNow)) { renderFolderUnset(); return; }
    var dir = _wsFileDir();
    window.MA.workspace.listFolder(dir).then(function(res) {
      if (myGen !== _folderRenderGen) return;
      var entries = (res && res.entries) || [];
      // 並べた顔ぶれを控える (書いた後・フォーカスが戻った時にディスクと比べる)。
      _folderShown = { dir: dir, sig: window.MA.fileTree ? window.MA.fileTree.nameSig(entries) : '' };
      panel.textContent = '';
      appendListHead(panel);
      appendOpenHead(panel);
      // 保存先の綴りを 1 文字誤っただけでも一覧は
      // 「図がありません」としか言わず、間違いに気づけないまま作業が止まっていた。
      // 実在しない保存先は「無い」と名指しで言い、直す場所まで書く。
      if (res && res.exists === false) {
        var gone = document.createElement('div');
        gone.className = 'folder-empty folder-missing';
        gone.id = 'folder-missing';
        gone.textContent = '保存先フォルダが見つかりません: ' + (res.dir || dir);
        panel.appendChild(gone);
        var how = document.createElement('div');
        how.className = 'folder-empty';
        how.id = 'folder-missing-hint';
        how.textContent = '⚙設定 → 自動保存 →「保存先のフォルダを選ぶ…」で選び直してください。';
        panel.appendChild(how);
        return;
      }
      if (entries.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.textContent = '保存フォルダに図がありません';
        panel.appendChild(empty);
        return;
      }
      // 保存先の一覧は 並べる・絞る・印を付けてまとめて開く・最近開いた図 だけ。
      // SVG の鮮度・前回控えとの比較・中身が同じ図の統合・反映状況・直近の更新・下書きの印での仕分けは
      // TICKET-owner-20261116-0241-prune で外した (保存先に前の版が書いた控えが残っていても読まない)。
      // 実データ / テンプレの分類 (行の役の印・汚染の赤・保存先に書いた宣言の JSON) は
      // TICKET-owner-20261122-1140-prune で外した。前の版が置いた宣言は読まず・書かず・消さない。
      // 上書きで消えた中身の控え。一覧の時点で
      // 「この図には前の版がある」「本体は消えたが版は残っている」を出す。
      versionCounts = {};
      versionNowLines = {};
      entries.forEach(function(e) {
        if (e && e.name && typeof e.versions === 'number') versionCounts[e.name] = e.versions;
        // 「いま何行か」は空洞化を見分ける物差し。
        // 版の一覧を開くたびに本文を読み直さずに済むよう、一覧の時点で控える。
        if (e && e.name && typeof e.lines === 'number') versionNowLines[e.name] = e.lines;
      });
      goneVersions = window.MA.versionHistory
        ? window.MA.versionHistory.goneRows(res) : [];

      kindEntries = entries;
      kindByName = {};
      entries.forEach(function(e) {
        if (e && e.name) kindByName[e.name] = e.kind || '';
      });
      savedKindByName = (res && res.kinds && typeof res.kinds === 'object') ? res.kinds : {};
      savedKindsLoaded = true;

      setFolderNames(entries);
      appendRecentSection(panel, entries);
      panel.appendChild(folderFilterBar());
      panel.appendChild(folderPickBar());
      appendKindSummary(panel);
      entries.forEach(function(e) { panel.appendChild(folderRow(e.name || e)); });
      appendGoneVersionsSection(panel);
      raiseRowsInTree();
      syncFolderPickUi();
      applyFolderFilter();
      focusFolderFilter();
    });
  }

  // 一覧を開いた直後だけ絞り込み欄にカーソルを置く。行のボタンを押しての
  // 再描画では奇うことをしない (押した場所から手が飛ばない)。
  // 開いた直後に後追いの描き直し (庫・札の読み込み待ち) が来ると、置いたカーソルの
  // 欄ごと入れ替わって行き場を失う。開いてすぐの間にカーソルがどこにも無ければ置き直す。
  var _folderFocusUntil = 0;
  function focusFolderFilter() {
    var ae = document.activeElement;
    var lost = !ae || ae === document.body;
    if (!folderFocusFilter && !(lost && Date.now() < _folderFocusUntil)) return;
    if (folderFocusFilter) _folderFocusUntil = Date.now() + 2000;
    folderFocusFilter = false;
    var input = panel.querySelector('.folder-filter');
    if (input && input.focus) { try { input.focus(); } catch (e) {} }
  }

  // 一覧の「選ぶ」対象は、一覧に並べた図。
  function setFolderNames(entries) {
    folderNames = (entries || []).map(function(e) { return e.name || e; });
    if (window.MA.folderSelect) {
      folderPicked = window.MA.folderSelect.keepExisting(folderPicked, folderNames);
    }
  }

  // FILES ツリーの「保存先」節 (幅 208px) では、ファイルの行を入口
  // (ファイルを開く・保存先タブ・絞り込み) のすぐ下へ上げる。棚 (選ぶバー・図種の内訳…) はその下。
  // 要素・id は動かすだけで作り直さない。
  function raiseRowsInTree() {
    if (!panel || !panel.closest || !panel.closest('#files-panel')) return;
    var kids = Array.prototype.slice.call(panel.children);
    var anchor = null;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains('folder-filterbar')) { anchor = kids[i]; break; }
    }
    if (!anchor) return;
    var ref = anchor.nextSibling;
    kids.forEach(function(c) {
      var cl = c.classList;
      if (!cl) return;
      if (cl.contains('folder-row') ||
          (cl.contains('folder-item') && c.hasAttribute('data-file-name'))) {
        panel.insertBefore(c, ref);
      }
    });
  }

  // ── 1 枚だけの削除 ── 消した図の過去版は server に残るので、取り違えても版から戻せる。
  // 名前を順に消す。1 枚しくじっても残りは続ける (途中で止まると、
  // どこまで消えたのかを保存フォルダで数え直すことになる)。
  function deleteFolderFiles(names, dir) {
    var WS = window.MA.workspace;
    if (!WS || !WS.deleteFile || !names || !names.length) return Promise.resolve([]);
    var results = [];
    var chain = Promise.resolve();
    names.forEach(function(n) {
      chain = chain.then(function() {
        return Promise.resolve(WS.deleteFile(n, dir)).then(function(r) {
          results.push({ name: n, ok: !!(r && r.ok), error: (r && r.error) || '' });
        });
      });
    });
    return chain.then(function() {
      var ok = results.filter(function(r) { return r.ok; });
      var ng = results.filter(function(r) { return !r.ok; });
      if (window.MA.toast) {
        var msg = ok.length ? ok.map(function(r) { return r.name; }).join('・') + ' を消しました（過去版は残っています）'
                            : '';
        if (ng.length) msg += (msg ? ' / ' : '') + ng[0].name + ' を消せませんでした: ' + ng[0].error;
        window.MA.toast.show(msg);
      }
      deleteArmed = '';
      renderFolderPanel();
      return results;
    });
  }

  // 行ごとの「1 枚だけ消す」。重複していない図も消せる (⚙設定の全削除しか
  // 無かったので、1 枚を消すには保存フォルダを直接触るしかなかった)。
  // 1 回目は身構えるだけ、2 回目で消す (押し間違いで図が消えない)。
  function folderDeleteButton(name) {
    var WS = window.MA.workspace;
    if (!WS || !WS.deleteFile) return null;
    var armed = deleteArmed === name;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-delete' + (armed ? ' folder-delete-armed' : '');
    b.setAttribute('data-delete-name', name);
    b.textContent = armed ? '本当に消す' : '消す';
    b.title = armed
      ? name + ' を保存フォルダから消します（過去版は残るので戻せます）'
      : name + ' を保存フォルダから消す（もう一度押すと消えます）';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      if (!armed) { deleteArmed = name; renderFolderPanel(); return; }
      b.disabled = true;
      deleteFolderFiles([name], _wsFileDir());
    });
    return b;
  }

  // ── 自動保存の書き先を「図の名前」にする ─────
  // 自動保存は図種 (plantuml-sequence 等) を鍵にディスクへ写していたため、
  // driver_common_class を打てば plantuml-class.puml が、diagram1 を打てば
  // plantuml-sequence.puml が、開いてもいないのに同じ中身へ書き換わっていた。
  // Ctrl+S (saveTarget) は既に図の名前で書いているので、自動保存の書き先も
  // そちらに揃える。名前が付いていない・ファイル名にできないタブは書かない。
  (function setupAutosaveFileName() {
    var AS = window.MA.autoSave;
    if (!AS || !AS.setFileNameResolver) return;
    // 書かなかったときは **訳も返す**。訳が無いと
    // 状態バーは「書けなかった」と「書く必要が無かった」を区別できず、💾 が
    // 「たった今」と出たまま保存フォルダの .puml は何時間でも変わらない。
    AS.setFileNameResolver(function(diagramType, dsl) {
      var WS = window.MA.workspace;
      if (!WS || !WS.getActive) return { name: '', reason: 'no-name' };
      var doc = WS.getActive();
      var name = (doc && doc.name) || '';
      if (!name) return { name: '', reason: 'no-name' };
      if (WS.isValidName && !WS.isValidName(name)) return { name: '', reason: 'no-name' };
      // ＋ で開いただけのタブ・図種を選んだだけのタブ (見本・白紙のまま) は
      // ディスクへ書かない (手で押す保存と同じ門。saveActiveDoc の)。
      // 書くと空の .puml が保存フォルダに並び、次に図種が替わると `{名前}_{図種}.puml` が別に増える。
      if (typeof dsl === 'string' && _isUntouchedDoc({ dsl: dsl, diagramType: diagramType || currentDiagramType })) {
        return { name: '', reason: 'untouched' };
      }
      // 一覧から開いたままの本文は書かない (開いたときのまま。元ファイルは既にこの内容)。
      var SL = window.MA.sourceLock;
      if (SL && doc && SL.decide(doc.id, doc.dsl).action === 'skip') return { name: '', reason: 'unchanged' };
      // FILES の右クリックで移動・名前変更している途中のタブは書かない (前の場所へ書き戻さない)。
      if (doc && _docWriteHeld(doc.id)) return { name: '', reason: 'moving' };
      // 書き先のフォルダもタブごと (保存先を替える前に開いたタブは開いたフォルダ)。
      // まだ 1 度も書いていない新しい図は印を添える (既にある別の図へは書かない)。
      // 書いたタブの印も添える (自分で書いた続きは図種の読みが替わっても別名へ回さない)。
      return doc.fresh ? { name: name, dir: _docDir(doc), freshId: doc.id, docId: doc.id }
        : { name: name, dir: _docDir(doc), docId: doc.id };
    });

    // 新しい図の名前が保存先の別の図と重なった。書かずに名前を選ばせる。
    if (AS.onFileConflict) {
      AS.onFileConflict(function(info) {
        var WS = window.MA.workspace;
        var target = null;
        (WS.list() || []).forEach(function(d) {
          if (target || !d) return;
          if (info.id ? d.id === info.id : d.name === info.name) target = d;
        });
        try { renderAutoSaveStatus(); } catch (e) {}
        if (!target) return;
        var dir = _docDir(target);
        if (WS.noteFolderName) WS.noteFolderName(dir, target.name);   // 次の名前の候補から外す
        var msg = info.reason || ('同じ名前の図が保存先にあります (' + target.name + '.puml)');
        if (window.MA.toast) {
          try {
            window.MA.toast.show(msg, '名前を選ぶ', function() {
              promptRenameDoc(target.id, msg, WS.newDocName ? WS.newDocName(dir) : '');
            });
          } catch (e) {}
        }
        try { setSaveStatus(msg); } catch (e) {}
      });
    }
    if (AS.onFreshWritten) {
      AS.onFreshWritten(function(info) {
        var WS = window.MA.workspace;
        if (info && info.id && WS.markWritten) WS.markWritten(info.id);
      });
    }

  })();

  // ── 図種が変わって別ファイルへ回された保存の後始末 ──────────────
  // (保存フォルダの「テンプレ」宣言で自動保存を止める門は TICKET-owner-20261122-1140-prune で外した)
  (function setupAutosaveRenamedNotice() {
    var AS = window.MA.autoSave;
    if (!AS) return;

    // 図種が変わる保存は server が `{名前}_{図種}` へ回す。
    // 画面の図名をその先に合わせないと、次の保存も回り続け、図名と実ファイルが
    // ずれたまま「どこに保存されたか分からない」になる。
    if (AS.onFileRenamed) {
      AS.onFileRenamed(function(info) {
        var DK = window.MA.diagramKind;
        var notice = DK ? DK.renameNotice(info) : null;
        if (!notice) return;
        try {
          var docs = window.MA.workspace.list() || [];
          for (var i = 0; i < docs.length; i++) {
            if (docs[i].name !== notice.from) continue;
            window.MA.workspace.rename(docs[i].id, notice.to);
            if (window.MA.saveDiff) window.MA.saveDiff.mark(notice.to, docs[i].dsl);
            renderTabs();
            break;
          }
        } catch (e) {}
        if (window.MA.toast) { try { window.MA.toast.show(notice.text); } catch (e) {} }
      });
    }
  })();

  function folderRow(name) {
    var FS = window.MA.folderSelect;
    var b = folderButton(name);
    if (!FS) return b;
    var row = document.createElement('div');
    row.className = 'folder-row';
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'folder-pick';
    box.setAttribute('data-pick-name', name);
    box.checked = FS.has(folderPicked, name);
    box.title = 'まとめて開く図に印を付ける';
    box.addEventListener('click', function(ev) {
      ev.stopPropagation();   // パネルを閉じずに印だけ変える
      folderPicked = FS.toggle(folderPicked, name);
      syncFolderPickUi();
    });
    row.appendChild(box);
    row.appendChild(b);
    var kb = folderKindBadge(name);
    if (kb) row.appendChild(kb);
    // 本文から読んだ図種を行に持たせる。FILES ツリーは名前に図種が無い図にも
    // これで行頭の図種の線画を付ける。
    // 保存したときの図種の控え (_kinds.json) があればそれを先に使う
    // (行のバッジと同じ順。actor で始まるユースケース図は本文判定だとシーケンスに倒れる)。
    var ckSaved = window.MA.savedKind ? window.MA.savedKind.pick(savedKindByName, name) : '';
    var ck = ckSaved || kindByName[name];
    if (ck) b.setAttribute('data-content-kind', ck);
    var vb = folderVersionButton(name);
    if (vb) row.appendChild(vb);
    var xb = folderDeleteButton(name);
    if (xb) row.appendChild(xb);
    return row;
  }

  // この保存先に何の図種が何枚あるか。0 枚の図種も出す。
  // 「前の周に作ったはずの状態遷移図が見当たらない」を、一覧を目で舐めるのではなく
  // この 1 行で終わらせる (無いなら無いと分かるのが手順 1 の答えになる)。
  function appendKindSummary(host) {
    var DK = window.MA.diagramKind;
    if (!DK) return;
    var line = document.createElement('div');
    line.className = 'folder-summary folder-kinds';
    line.id = 'folder-kinds';
    line.textContent = DK.summaryLine(kindEntries);
    line.title = '図種は保存された本文から判定しています。0 の図種はこの保存先に 1 枚もありません';
    host.appendChild(line);
    // TICKET-owner-20261122-2242-1: 一覧・件数・図種・まとめて書き出すは保存先の直下の図だけを扱う。黙って外さず、そう書く。
    var scope = document.createElement('div');
    scope.className = 'folder-summary folder-scope';
    scope.id = 'folder-scope';
    scope.textContent = '保存先の直下の図だけを並べます（サブフォルダの図は FILES のツリーから開いて書き出します）';
    host.appendChild(scope);
  }

  // 行に付く図種のバッジ。名前が diagram1 でも何の図かがその場で分かる。
  function folderKindBadge(name) {
    var DK = window.MA.diagramKind;
    var SK = window.MA.savedKind;
    if (!DK) return null;
    // 控えがあれば、それをこのまま開く図種として出す。
    // 控えの無い図だけ、今までどおり本文からの判定を出す。
    var saved = SK ? SK.pick(savedKindByName, name) : '';
    var badge = saved && SK ? SK.badge(saved) : null;
    var label = badge ? badge.label : DK.label(kindByName[name]);
    if (!label) return null;
    var el = document.createElement('span');
    el.className = 'folder-kind';
    el.setAttribute('data-kind-of', name);
    el.setAttribute('data-kind-source', badge ? 'saved' : 'guess');
    if (badge) el.setAttribute('data-saved-kind', saved);
    el.textContent = badge ? (badge.mark + ' ' + badge.label) : label;
    el.title = badge ? badge.title : 'この図の図種（本文から判定）';
    if (badge) {
      // 印そのものを押しても開く (「それをクリックするとその図種のまま開く」)。
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(ev) {
        ev.stopPropagation();
        openFromFolder(name);
      });
    }
    return el;
  }

  // 同じ名前に別の図を保存すると前の中身は消える。
  // server は上書きの直前に控えを取るので、その版を一覧から開けるようにする。
  // 版が無い図にはボタンを出さない (押しても何も無い行を増やさない)。
  function folderVersionButton(name) {
    var VH = window.MA.versionHistory;
    if (!VH) return null;
    var label = VH.countLabel(versionCounts[name]);
    if (!label) return null;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-versions';
    b.setAttribute('data-versions-name', name);
    b.textContent = label;
    b.title = 'この図の履歴を開く (この名前で上書きされる前の中身。図種を変えて保存し直した前の図もここに残っています)';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      // 保存先が Git なら「この図の履歴」は FILES の GIT 節の 1 つ
      // (コミットと控えが同じ一覧に並ぶ)。その図を開いてから GIT 節の履歴へ移り、窓は開かない。
      var gu = window.MA.gitUi;
      var fm = window.MA.fileMenuUi;
      if (gu && gu.isRepo && gu.isRepo() && fm && fm.runFile) {
        fm.runFile('history', name);
        return;
      }
      // この一覧は直下の図。今開いているのがサブフォルダの同じ名前の図なら、直下の図を開いてから
      // その図の履歴を出す (開いたままだとサブフォルダの図の版を出してしまう。TICKET-roadmap-20261123-0226-4)。
      if (_vtActiveSub(name) && fm && fm.runFile) {
        fm.runFile('history', name);
        return;
      }
      // 版の一覧は一覧の中に開かず、「この図の履歴」1 つに寄せる。
      toggleVersionTimeline(true, name);
    });
    return b;
  }

  function loadVersions(name) {
    var VH = window.MA.versionHistory;
    var url = '/autosave-versions?dir=' + encodeURIComponent(_histDirFor(name))
      + '&type=' + encodeURIComponent(name);
    return window.fetch(url)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { return VH ? VH.rows(data) : []; });
  }

  // 版を開く。タブ名に刻印を付けるので、開いたまま自動保存が走っても
  // 今の {name}.puml を過去の中身で塗り潰さない。
  function openVersion(name, stamp) {
    var VH = window.MA.versionHistory;
    var url = '/autosave-versions?dir=' + encodeURIComponent(_histDirFor(name))
      + '&type=' + encodeURIComponent(name) + '&stamp=' + encodeURIComponent(stamp);
    window.fetch(url).then(function(r) { return r.ok ? r.text() : null; }).then(function(text) {
      if (text == null) {
        if (window.MA.toast) window.MA.toast.show('この版を読めませんでした');
        return;
      }
      closePanel();
      saveActiveDoc();
      var detected = window.MA.workspace.detectType(text);
      openExistingFile({
        name: VH ? VH.openName(name, stamp) : (name + '@' + stamp),
        dsl: text,
        diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
      });
      applyActiveDoc();
      if (window.MA.toast) {
        window.MA.toast.show(name + ' の ' + (VH ? VH.label(stamp) : stamp)
          + ' の版を別タブで開きました（今の図はそのままです）');
      }
    });
  }

  // 版を今の図に流し込む。
  // 開いていない図なら先に開いてから当てる — 当てる先がタブとして見えていないと、
  // 「戻した」のがどの図なのかが画面のどこにも出ない。
  // 当てるのは _applyLineEditText なので、undo 1 手で戻せて保存フォルダにも書かれる
  // (server は上書きの手前で今の中身を控えるので、戻し自体も失われない)。
  function restoreVersionInto(name, stamp) {
    var VH = window.MA.versionHistory;
    var dir = _histDirFor(name);
    var url = '/autosave-versions?dir=' + encodeURIComponent(dir)
      + '&type=' + encodeURIComponent(name) + '&stamp=' + encodeURIComponent(stamp);

    function finish(text) {
      if (!_applyLineEditText(text)) {
        // 消した図をタブが開いたまま戻すときは、版の中身とタブの本文が同じ (本文は動かない)。
        // ファイルが無ければ、その中身でファイルを書き直す (TICKET-roadmap-20261122-0855-3。前は「同じ」と言うだけで戻らなかった)。
        window.MA.workspace.loadFile(name, dir).then(function(cur) {
          if (cur == null) {
            saveFile();
            if (window.MA.toast) window.MA.toast.show(VH.restoredLine(name, stamp));
            appendSaveStatus(VH.restoredLine(name, stamp));
            return;
          }
          if (window.MA.toast) window.MA.toast.show(VH.unchangedLine(name, stamp));
        });
        return;
      }
      if (window.MA.toast) window.MA.toast.show(VH.restoredLine(name, stamp));
      appendSaveStatus(VH.restoredLine(name, stamp));
    }

    window.fetch(url).then(function(r) { return r.ok ? r.text() : null; }).then(function(text) {
      if (text == null) {
        if (window.MA.toast) window.MA.toast.show('この版を読めませんでした');
        return;
      }
      var active = window.MA.workspace.getActive();
      if (active && active.name === name) {
        closePanel();
        finish(text);
        return;
      }
      saveActiveDoc();
      _ensureSavedKinds(dir).then(function() {
        window.MA.workspace.loadFile(name, dir).then(function(cur) {
          closePanel();
          var base = cur == null ? text : cur;
          openExistingFile({ name: name, dsl: base, diagramType: _folderOpenType(name, base) });
          applyActiveDoc();
          finish(text);
        }, function() { closePanel(); });
      }, function() { closePanel(); });
    });
  }

  // 版を今の図の右に並べる。版は刻印付きの別タブとして
  // 開き (今の図を過去の中身で塗り潰さない)、今の図に戻ってから参照ペインの相手に据える。
  function compareVersion(name, stamp) {
    var VH = window.MA.versionHistory;
    var WS = window.MA.workspace;
    var dir = _histDirFor(name);
    var url = '/autosave-versions?dir=' + encodeURIComponent(dir)
      + '&type=' + encodeURIComponent(name) + '&stamp=' + encodeURIComponent(stamp);
    return window.fetch(url).then(function(r) { return r.ok ? r.text() : null; }).then(function(text) {
      if (text == null) {
        if (window.MA.toast) window.MA.toast.show('この版を読めませんでした');
        return false;
      }
      saveActiveDoc();
      var active = WS.getActive();
      var ready = (active && active.name === name) ? Promise.resolve(active)
        : _ensureSavedKinds(dir).then(function() { return WS.loadFile(name, dir); }).then(function(cur) {
          var base = cur == null ? text : cur;
          openExistingFile({ name: name, dsl: base, diagramType: _folderOpenType(name, base) });
          applyActiveDoc();
          return WS.getActive();
        });
      return ready.then(function(baseDoc) {
        if (!baseDoc) return false;
        var ver = openExistingFile({
          name: VH ? VH.openName(name, stamp) : (name + '@' + stamp),
          dsl: text,
          diagramType: baseDoc.diagramType,
        });
        WS.setActive(baseDoc.id);
        applyActiveDoc();
        _compareRefId = ver.id;
        clearSeniorGit();
        toggleSeniorPane(false);
        toggleCompareView(true, 'ref');
        if (window.MA.toast) {
          window.MA.toast.show(name + ' の ' + (VH ? VH.label(stamp) : stamp)
            + ' の版を右に並べました（今の図はそのままです）');
        }
        return true;
      });
    });
  }
  _versionsApi = {
    load: loadVersions,
    open: openVersion,
    restore: restoreVersionInto,
    compare: compareVersion,
    lineCount: _folderLineCount,
  };

  // 本体が消えて版だけ残っている図。junior の状態遷移図のように、
  // 同じ名前へ別の図を保存し続けて実体が無くなったものはここにだけ出る。
  function appendGoneVersionsSection(host) {
    if (!goneVersions.length) return;
    var head = document.createElement('div');
    head.className = 'folder-summary folder-gone-versions-head';
    head.id = 'folder-gone-versions';
    head.textContent = '今は無いが前の版が残っている図（' + goneVersions.length + ' 件）';
    host.appendChild(head);
    goneVersions.forEach(function(g) {
      var row = document.createElement('div');
      row.className = 'folder-row folder-gone-row';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'folder-gone-name';
      b.setAttribute('data-gone-name', g.name);
      b.textContent = g.name;
      b.title = 'この名前の図はもうありませんが、上書きされる前の中身が残っています';
      row.appendChild(b);
      versionCounts[g.name] = g.versions;
      var vb = folderVersionButton(g.name);
      if (vb) row.appendChild(vb);
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        toggleVersionList(g.name, vb || b);
      });
      host.appendChild(row);
    });
  }

  // 名前で絞り込む欄。数文字打てば候補がその 1 枚になり、Enter でそのまま開ける。
  // 一覧の上端に「最近開いた図」を置く。同じ図への出戻りは
  // 20 枚超の行から名前を目で探すのではなく、ここを 1 回押せば済む。
  // 履歴が空のとき (その run で初めて一覧を開いたとき) は行ごと出さないので、
  // 普段の一覧は今までのまま。
  function appendRecentSection(host, entries) {
    var RF = window.MA.recentFiles;
    if (!RF) return;
    var names = RF.visible(recentList(), entries);
    // 保存フォルダから消えた図は履歴からも落とす (押せない行を残さない)。
    var all = recentList();
    if (names.length !== all.length) recentSave(RF.prune(all, entries));
    if (!names.length) return;
    var bar = document.createElement('div');
    bar.className = 'folder-recent-bar';
    bar.id = 'folder-recent';
    var label = document.createElement('span');
    label.className = 'folder-recent-label';
    label.textContent = '最近開いた図';
    label.title = 'この画面で開いた図を新しい順に ' + RF.LIMIT + ' 件まで。同じ図に戻るのに名前を探し直さなくて済みます';
    bar.appendChild(label);
    names.forEach(function(name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'folder-recent-item';
      b.setAttribute('data-recent-name', name);
      b.textContent = RF.label(name);
      b.title = name + ' を開く';
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        openFromFolder(name);
      });
      bar.appendChild(b);
    });
    host.appendChild(bar);
  }

  function folderFilterBar() {
    var bar = document.createElement('div');
    bar.className = 'folder-filterbar';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-filter';
    input.id = 'folder-filter';
    input.value = folderQuery;
    input.placeholder = '名前で絞り込む (Enter で 1 枚なら開く)';
    input.title = '図の名前の一部を打つと、あてはまる行だけが残る。空白で区切るとその語を全部含む図だけになる';
    input.addEventListener('click', function(ev) { ev.stopPropagation(); });
    input.addEventListener('input', function() {
      folderQuery = input.value;
      applyFolderFilter();
    });
    input.addEventListener('keydown', function(ev) {
      // 空の欄での Esc は一覧を閉じる側へ通す (中央の枠に開いた一覧)。
      if (ev.key === 'Escape') {
        if (!input.value) return;
        ev.stopPropagation(); input.value = ''; folderQuery = ''; applyFolderFilter(); return;
      }
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var FF = window.MA.folderFilter;
      var only = FF ? FF.soleMatch(folderNames, folderQuery) : '';
      if (only) openFromFolder(only);
    });
    bar.appendChild(input);
    var state = document.createElement('span');
    state.className = 'folder-filter-state';
    state.id = 'folder-filter-state';
    bar.appendChild(state);
    return bar;
  }

  // 行を元の順 (data-ff-order) に戻してから、完全一致の行を同じ親の中で先頭の行の前へ動かす。
  // 見出しなど行以外の子は動かさない (行どうしの並びだけを入れ替える)。
  function _folderExactFirst(rows) {
    var byParent = [];
    for (var i = 0; i < rows.length; i++) {
      var el = rows[i];
      var host = (el.parentNode && el.parentNode.className === 'folder-row') ? el.parentNode : el;
      var p = host.parentNode;
      if (!p) continue;
      var g = null;
      for (var k = 0; k < byParent.length; k++) if (byParent[k].p === p) { g = byParent[k]; break; }
      if (!g) { g = { p: p, hosts: [] }; byParent.push(g); }
      if (g.hosts.indexOf(host) < 0) g.hosts.push(host);
    }
    byParent.forEach(function(g) {
      var slots = g.hosts.slice().sort(function(a, b) {
        return Array.prototype.indexOf.call(g.p.childNodes, a) - Array.prototype.indexOf.call(g.p.childNodes, b);
      });
      var want = g.hosts.slice().sort(function(a, b) {
        var ea = a.getAttribute('data-exact') ? 0 : 1, eb = b.getAttribute('data-exact') ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return (+a.getAttribute('data-ff-order')) - (+b.getAttribute('data-ff-order'));
      });
      var same = true;
      for (var s = 0; s < slots.length; s++) if (slots[s] !== want[s]) { same = false; break; }
      if (same) return;
      // 行が占めていた位置 (印) を残し、望む順で差し替える。
      var marks = slots.map(function(h) {
        var m = document.createComment('ff');
        g.p.insertBefore(m, h);
        return m;
      });
      marks.forEach(function(m, idx) { g.p.insertBefore(want[idx], m); g.p.removeChild(m); });
    });
  }

  // 絞り込みを今の行に当てる。一覧を作り直さずに表示を消すだけなので、
  // 印を付けた図・役割の印は絞り込んでも残る。
  function applyFolderFilter() {
    var FF = window.MA.folderFilter;
    if (!FF) return;
    var shown = 0;
    var rows = panel.querySelectorAll('[data-file-name]');
    for (var i = 0; i < rows.length; i++) {
      var el = rows[i];
      var name = el.getAttribute('data-file-name');
      var host = (el.parentNode && el.parentNode.className === 'folder-row') ? el.parentNode : el;
      var on = FF.match(name, folderQuery);
      host.style.display = on ? '' : 'none';
      if (on) shown++;
      // 打った名前と丸ごと同じ図は「完全一致」の印を付けて先頭に出す
      // (同じ接頭辞で後ろに語が続く名前より上。部分一致の行は消さずに下に残す)。
      if (host.getAttribute('data-ff-order') == null) host.setAttribute('data-ff-order', String(i));
      var ex = on && FF.exactMatch && FF.exactMatch(name, folderQuery);
      if (ex) { host.setAttribute('data-exact', '1'); el.title = el.title || '打った名前と完全一致'; }
      else host.removeAttribute('data-exact');
    }
    _folderExactFirst(rows);
    var state = panel.querySelector('.folder-filter-state');
    if (state) state.textContent = FF.summaryText(shown, rows.length, folderQuery);
  }

  function folderPickBar() {
    var bar = document.createElement('div');
    bar.className = 'folder-pickbar';
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'folder-pick-all';
    all.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var FS = window.MA.folderSelect;
      if (!FS) return;
      folderPicked = FS.allPicked(folderPicked, folderNames) ? FS.clear() : FS.selectAll(folderNames);
      syncFolderPickUi();
    });
    bar.appendChild(all);
    // 一覧は長いと縦にスクロールする。開くボタンを末尾に置くと 14 枚のときに
    // 画面の外へ出るので、印を付ける行の上に固定して常に見えるようにする。
    bar.appendChild(folderOpenButton());
    // 印を付けた図を開かずに zip にする「選んだ図を SVG で書き出す」は TICKET-owner-20261116-0140-prune で外した
    // (zip はやらない)。TICKET-roadmap-20261122-0855-5: 代わりに、印を付けた図を選んだ形式で、1 枚ずつの書き出しと
    // 同じ置き場・同じ名前で保存先へまとめて書く (タブで開く行の並び。新しい窓は出さない)。
    var ED = window.MA.exportDest;
    if (ED && ED.batchLabel) {
      var kind = document.createElement('select');
      kind.className = 'folder-export-kind';
      kind.id = 'folder-export-kind';
      kind.title = 'まとめて書き出す形式';
      kind.setAttribute('aria-label', 'まとめて書き出す形式');
      ED.BATCH_KINDS.forEach(function(k) {
        var o = document.createElement('option');
        o.value = k;
        o.textContent = ED.kindLabel(k);
        kind.appendChild(o);
      });
      kind.addEventListener('click', function(ev) { ev.stopPropagation(); });
      bar.appendChild(kind);
      bar.appendChild(folderExportButton(kind));
      var result = document.createElement('span');
      result.className = 'folder-export-result';
      result.id = 'folder-export-result';
      result.setAttribute('role', 'status');
      bar.appendChild(result);
    }
    return bar;
  }

  var _folderExporting = false;
  function folderExportButton(kindEl) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-export-many';
    b.id = 'folder-export-many';
    b.title = '印を付けた図を、選んだ形式で保存先へまとめて書き出す (1 枚ずつの書き出しと同じ置き場・同じ名前。タブは開かない)';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var FS = window.MA.folderSelect;
      if (!FS || _folderExporting) return;
      var names = FS.selectAll(folderNames).filter(function(n) { return FS.has(folderPicked, n); });
      if (names.length === 0) return;
      var kind = kindEl.value || 'svg';
      var result = panel.querySelector('.folder-export-result');
      _folderExporting = true;
      b.disabled = true;
      exportManyToFolder(names, kind, _wsFileDir(), function(i, n) {
        b.textContent = '書き出しています… (' + (i + 1) + ' / ' + n + ')';
      }).then(function(out) {
        _folderExporting = false;
        syncFolderPickUi();
        if (!out) return;
        var done = out.results.filter(function(r) { return r.ok; });
        var fail = out.results.filter(function(r) { return !r.ok; });
        if (result) {
          result.textContent = out.msg;
          result.setAttribute('data-done', String(done.length));
          result.setAttribute('data-failed', fail.map(function(r) { return r.name; }).join('/'));
          result.setAttribute('data-seq', String(Number(result.getAttribute('data-seq') || 0) + 1));
        }
        setSaveStatus(out.msg);
      });
    });
    return b;
  }

  function folderOpenButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-open-many';
    b.title = '印を付けた図を、一覧の並びのまま全部タブで開く';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var FS = window.MA.folderSelect;
      if (!FS) return;
      var names = FS.toOpen(folderPicked, folderNames, _openDocNames());
      if (names.length === 0) return;
      closePanel();
      openManyFromFolder(names);
    });
    return b;
  }

  // 印の付き外れに合わせて、2 つのボタンの文言と使える・使えないを引き直す。
  // 一覧そのものは作り直さない (14 個の行を毎回作り直すと印を打つ手が重くなる)。
  function syncFolderPickUi() {
    var FS = window.MA.folderSelect;
    if (!FS) return;
    Array.prototype.forEach.call(panel.querySelectorAll('.folder-pick'), function(box) {
      box.checked = FS.has(folderPicked, box.getAttribute('data-pick-name'));
    });
    var all = panel.querySelector('.folder-pick-all');
    if (all) {
      all.textContent = FS.allPicked(folderPicked, folderNames)
        ? '印を全部外す' : '全部選ぶ（' + folderNames.length + ' 枚）';
    }
    var open = panel.querySelector('.folder-open-many');
    if (open) {
      open.textContent = FS.openLabel(folderPicked, folderNames, _openDocNames());
      open.disabled = FS.toOpen(folderPicked, folderNames, _openDocNames()).length === 0;
    }
    var exp = panel.querySelector('.folder-export-many');
    if (exp && window.MA.exportDest && !_folderExporting) {
      var picked = FS.selectAll(folderNames).filter(function(n) { return FS.has(folderPicked, n); }).length;
      exp.textContent = window.MA.exportDest.batchLabel(picked);
      exp.disabled = picked === 0;
    }
  }

  function folderButton(name) {
    var b = document.createElement('button');
    b.className = 'folder-item';
    b.setAttribute('data-file-name', name);
    var label = document.createElement('span');
    label.className = 'folder-name';
    label.textContent = name;
    b.appendChild(label);
    // 1 回押しは仮のタブで開き (見て回るだけならタブが積もらない)、
    // ダブルクリックで固定のタブにする。
    b.addEventListener('click', function() { openFromFolder(name, { preview: true }); });
    b.addEventListener('dblclick', function() { pinDocByName(name); });
    return b;
  }

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (_listOpening) return;   // 一覧を開いたクリックそのもの
    if (panel.contains(ev.target) || ev.target === btnFolder) return;
    // design 10a: 一覧はレール右のツリーの中にある。ツリーの他の節を押した
    // だけで畳むと、「開いている図」を 1 つ選ぶたびに保存先を開き直すことになる。
    if (ev.target && ev.target.closest && ev.target.closest('#files-panel')) return;
    closePanel();
  });
}

// 一覧のパネルは自前の関数で図を開く。パネルの外からも同じ道で開けるように、
// パネル側で実体を差し込む (パネルを作る前に押される画面は無い)。
var openFromFolderByName = function() {};
// パネルの外で保存フォルダを書き換える操作から一覧を描き直すための口
// パネルを開いていなければ何もしない。
var refreshFolderPanelNow = function() {};
// 保存先を変えた直後に、開閉に関わらず一覧を新しいフォルダで読み直す口。
var reloadFolderListNow = function() {};
// 保存先の一覧に並べた顔ぶれがディスクと違えば読み直す口。
var syncFolderListNow = function() { return Promise.resolve(false); };
// 保存先の版 (server の _versions) を読む・開く・並べる・戻す道具。「この図の履歴」が使う
// 保存先の一覧の結線 (setupTabs) で入る。
var _versionsApi = null;
// 直前に開いた図の名前 (新しい順)。Ctrl+K からも
// 一覧を開かずに同じ図へ戻れるように、パネルの外へ読み口だけ出す。
var recentOpenedNames = function() { return []; };

// ── 一括置換 ───────────────────────────────────────────────────────────────
// 部品名は複数の図に同じ綴りで現れる。図ごとに全文を打ち直すと手数が枚数に
// 比例して増えるので、置換前・置換後を 1 度だけ入力して開いている図すべてに
// 適用する。アクティブな図はエディタにも即座に反映する。

// 現在の編集内容を含んだドキュメント一覧。書き戻してから読むので
// エディタの未確定分も置換対象になる。
function _renameDocs() {
  saveActiveDoc();
  return window.MA.workspace ? window.MA.workspace.list() : [];
}

// エディタのその行を選ぶ (行番号は 1 始まり。editor-jump が範囲を決める)。
function _traceScrollToLine(line) {
  var EJ = window.MA.editorJump;
  var el = editorEl || document.getElementById('editor');
  if (!EJ || !el) return;
  var range = EJ.lineRange(el.value, line);
  if (!range) return;
  try {
    el.focus();
    el.setSelectionRange(range.start, range.end);
  } catch (e) { /* 表示のためだけなので、選択できない環境では黙る */ }
}

// 影響範囲プレビューの行から、その図のその行へ運ぶ。図を切り替えてから
// エディタのキャレットを置くので、押した先で編集をそのまま続けられる。
function jumpToDocLine(docId, line) {
  if (!window.MA.workspace) return;
  if (docId !== window.MA.workspace.getActiveId()) {
    saveActiveDoc();
    if (!window.MA.workspace.setActive(docId)) return;
    applyActiveDoc();
  }
  _traceScrollToLine(line);
}

// ── 開いていない図も含めた影響範囲 ─────────────────────────────────────────
// ヒット数が今開いているタブ分しか出ないので、
// 「仕様変更が全図に及んだか」を確かめるには残りを 1 枚ずつ開き直すしかなかった。
// 保存フォルダを先に全部数え、ヒットした図・しなかった図を一覧で出す。
// 置換もこの一覧の的にそのまま当てるので、開き直す手順が要らない。
var _fiFileDocs = [];    // 保存フォルダのファイル [{ name, dsl }]
var _fiDir = null;       // _fiFileDocs を読んだフォルダ
var _fiLoading = false;
var _fiSeq = 0;          // 読み込みの世代 (古い応答で新しい一覧を上書きしない)

// 保存フォルダ運用のときだけ数える。localStorage 運用では「保存フォルダの
// 全ファイル」という的が無く、勝手にフォルダへ書き戻すと保存先が二重になる。
function _fiFolderMode() {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    return !!(cfg && cfg.backend === 'file');
  } catch (e) { return false; }
}

function _fiEnabled() {
  var el = document.getElementById('rename-scan-folder');
  return !!(el && el.checked) && _fiFolderMode();
}

// 保存フォルダの全ファイルを読む。フォルダが変わるまでは読み直さない。
function loadFolderImpact(force) {
  var WS = window.MA.workspace;
  if (!WS || !WS.listFolder) return Promise.resolve(false);
  var dir = _wsFileDir();
  if (!force && _fiDir === dir && !_fiLoading) return Promise.resolve(true);
  var seq = ++_fiSeq;
  _fiLoading = true;
  renderRenameFolder();
  // 直下の図に加えて、保存先の下の木 (サブフォルダ) の図も読む (TICKET-roadmap-20261123-0226-1)。
  // サブフォルダの図は { rel: 'docs/api', dir: 絶対パス, key } を持ち、直下の同じ名前の図とは別の行になる。
  var treeP = WS.listTree ? WS.listTree(dir).catch(function() { return null; }) : Promise.resolve(null);
  return Promise.all([WS.listFolder(dir), treeP]).then(function(got) {
    var info = got[0];
    var tree = got[1];
    var names = ((info && info.entries) || []).map(function(e) {
      return e && typeof e === 'object' ? e.name : e;
    }).filter(function(n) { return n; });
    var reads = names.map(function(n) {
      return WS.loadFile(n, dir).then(function(text) {
        return typeof text === 'string' ? { name: n, dsl: text } : null;
      }, function() { return null; });
    });
    var FI0 = window.MA.folderImpact;
    ((tree && tree.dirs) || []).forEach(function(d) {
      if (!d || !d.path || !d.rel) return;
      (d.files || []).forEach(function(n) {
        reads.push(WS.loadFile(n, d.path).then(function(text) {
          if (typeof text !== 'string') return null;
          return { name: n, dsl: text, rel: d.rel, dir: d.path,
                   key: FI0 ? FI0.keyOf(n, d.path) : (d.rel + '/' + n) };
        }, function() { return null; }));
      });
    });
    return Promise.all(reads).then(function(docs) {
      if (seq !== _fiSeq) return false;
      _fiFileDocs = docs.filter(function(d) { return d; });
      _fiDir = dir;
      _fiLoading = false;
      renderRenameFolder();
      return true;
    });
  }).catch(function() {
    if (seq === _fiSeq) { _fiLoading = false; renderRenameFolder(); }
    return false;
  });
}

// 開いているタブ (未保存の編集を含む) + 保存フォルダ。同名は開いている方が勝つ。
function _fiRows() {
  var FI = window.MA.folderImpact;
  if (!FI) return [];
  return FI.merge(_fiOpenDocs(), _fiFileDocs);
}

// 開いているタブを、保存先の図と同じ「居場所の鍵」で並べる (サブフォルダの図は道付き)。
// 鍵が同じファイルは開いている方 (未保存の編集を含む) が勝つ。直下とサブフォルダの同じ名前は別の行。
function _fiOpenDocs() {
  var FI = window.MA.folderImpact;
  var WS = window.MA.workspace;
  var activeId = WS ? WS.getActiveId() : null;
  return (WS ? WS.list() : []).map(function(d) {
    var sub = !!(d.sub && d.dir);
    var rel = sub ? _docSubRel(d) : '';
    return {
      id: d.id, name: d.name, dsl: d.id === activeId ? mmdText : d.dsl,
      key: FI ? FI.keyOf(d.name, sub ? d.dir : null) : d.name,
      rel: rel, dir: sub ? d.dir : null,
      label: rel ? rel + '/' + d.name : d.name,
    };
  });
}

// 開いているタブの鍵の集合。開いていない図への書き戻しから、開いている図を外す。
function _fiOpenKeys() {
  var keys = {};
  _fiOpenDocs().forEach(function(d) { keys[d.key] = true; });
  return keys;
}

// 置換を当てる直前の本文を、当たった図だけ控える。
// docs は置換前の [{ id, name, dsl }]、changed は置換で変わった [{ id, dsl }]。
function _captureBeforeRename(from, to, docs, changed) {
  var BS = window.MA.beforeSnapshot;
  if (!BS) return;
  var hit = {};
  (changed || []).forEach(function(c) { if (c && c.id != null) hit[c.id] = true; });
  var entries = (docs || []).filter(function(d) { return d && hit[d.id]; })
    .map(function(d) { return { name: d.name, dsl: d.dsl }; });
  if (!entries.length) return;
  try {
    BS.capture(_reviewStore(), _wsFileDir(), entries, { from: from, to: to },
      new Date().toISOString());
  } catch (e) { /* 控えが残せなくても置換自体は通す */ }
}

// ── 過去の置換の組 ─────────────────────
// ヒット件数は置換前・置換後を打ち終えてからしか出ないので、同じ組を当て直す
// 運用では「もう残っていないこと」を確かめるためだけに毎回打ち直していた。
// パネルを開いた時点で、過去の組と今の残存件数を並べる。残っている組を押せば
// 置換前・置換後がそのまま入る (打鍵ゼロで置換に進める)。
function _renameRedoDocs() {
  return _fiEnabled() ? _fiRows() : _renameDocs();
}

// 保存フォルダ運用では組をフォルダ側に置く。ブラウザが変わっても、同じ組を
// 週をまたいで当て直すときに from/to を打ち直さずに済む。
var _rpRows = [];
var _rpDir = null;
var _rpLoading = false;

// 入れた組の理由を出す 1 行。黙って欄が埋まっていると、自分が打ったのか前回の
// 残りなのかを確かめられない。
var _seedRenamePairAgain = null;
var _seededPair = null;   // 入れた組。打ち替えられたら案内を消すために覚える

function renderRenameSeedNote(pair) {
  var RS = window.MA.renameSeed;
  var el = document.getElementById('rename-seed-note');
  if (!el || !RS) return;
  el.textContent = RS.noteText(pair);
  el.setAttribute('data-seed', pair ? (pair.from + '→' + pair.to) : '');
  el.setAttribute('data-seed-state', RS.noteTone(pair));
  el.style.display = pair ? '' : 'none';
}

function loadRenamePairs(force) {
  if (!_fiFolderMode()) {
    var RPL = window.MA.renamePairs;
    _rpRows = RPL ? RPL.loadLocal(_reviewStore(), _wsFileDir()) : [];
    _rpDir = null;
    return Promise.resolve(_rpRows);
  }
  var dir = _wsFileDir();
  // 読み込み中は待つ。描画のたびに往復すると、パネルを開いた直後に同じ GET が
  // 何本も飛ぶ。
  if (_rpLoading) return Promise.resolve(_rpRows);
  if (!force && _rpDir === dir) return Promise.resolve(_rpRows);
  _rpLoading = true;
  return window.fetch('/rename-pairs?dir=' + encodeURIComponent(dir))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      var RP = window.MA.renamePairs;
      _rpRows = RP ? RP.normalize(data && data.pairs) : [];
      _rpDir = dir;
      _rpLoading = false;
      if (typeof renderRenameRedo === 'function') renderRenameRedo();
      // フォルダ側の組はここで初めて届く。開いた時点で欄が空のままだったなら、
      // 届いた組で入れ直す (前の run が別のブラウザでも打ち直させない)。
      if (typeof _seedRenamePairAgain === 'function') _seedRenamePairAgain();
      return _rpRows;
    }, function() {
      // 読めなくても「読んだ」ことにする (毎描画で往復し続けるのを避ける)。
      _rpDir = dir;
      _rpLoading = false;
      return _rpRows;
    });
}

// 打った組を覚える。当たらなかった組 (hits 0) も残すのは、「もう残っていない」
// と分かったこと自体が、次の run で打ち直さずに済む知識だから。
// applied は [置換] で当たった回だけ true。開いた時に欄へ入れる「前回の組」は
// 当てた組に限る ので、打っただけの組と分けて残す。
function rememberRenamePair(from, to, hits, applied) {
  var RP = window.MA.renamePairs;
  if (!RP || !RP.shouldRemember(from, to)) return Promise.resolve(null);
  var now = new Date().toISOString();
  var row = { from: String(from).trim(), to: String(to).trim(), at: now,
    appliedAt: applied ? now : '' };
  // 保存フォルダを使わない運用では、組はこのブラウザに保存先ごとに残す。
  _rpRows = _fiFolderMode() ? RP.merge([row], _rpRows)
    : RP.rememberLocal(_reviewStore(), _wsFileDir(), row);
  if (typeof renderRenameRedo === 'function') renderRenameRedo();
  // 組が増えた・当たった直後は下端の統一バッジも数え直す (次に開くまで
  // 「統一 −」のままだと、済んだことをパネルでしか確かめられない)。
  if (typeof refreshRenameBadge === 'function') refreshRenameBadge(true);
  if (!_fiFolderMode()) return Promise.resolve(null);
  return window.fetch('/rename-pairs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir: _wsFileDir(), from: row.from, to: row.to, hits: Number(hits || 0),
      applied: !!applied }),
  }).then(function(r) { return r.ok ? r.json() : null; }, function() { return null; });
}

// renameRedo に渡す組 (保存フォルダの組か、このブラウザに残した組)。
function _renameRedoPairs() {
  return _rpRows;
}

function renderRenameRedo() {
  var box = document.getElementById('rename-redo');
  var RR = window.MA.renameRedo;
  if (!box || !RR) return;
  box.textContent = '';
  // フォルダ側の組をまだ読んでいなければ読んでから描き直す (読めた時点で
  // loadRenamePairs がここを呼び直す)。
  loadRenamePairs(false);
  var rows = RR.pairs(_renameRedoPairs(), _renameRedoDocs());

  var sum = document.createElement('div');
  sum.className = 'rr-summary ' + RR.summaryClass(rows);
  sum.id = 'rename-redo-summary';
  sum.setAttribute('data-rr-pairs', String(rows.length));
  sum.setAttribute('data-rr-pending', String(rows.filter(function(r) {
    return r.state === 'pending';
  }).length));
  sum.textContent = RR.summary(rows);
  box.appendChild(sum);
  if (!rows.length) return;

  var host = document.createElement('div');
  host.className = 'rr-rows';
  host.id = 'rename-redo-rows';
  rows.forEach(function(r) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rr-row';
    b.setAttribute('data-state', r.state);
    b.setAttribute('data-from', r.from);
    b.setAttribute('data-to', r.to);
    b.setAttribute('data-remaining', String(r.remaining));
    b.title = RR.title(r);
    var pair = document.createElement('span');
    pair.className = 'rr-pair';
    pair.textContent = r.from + ' → ' + r.to;
    var st = document.createElement('span');
    st.className = 'rr-state';
    st.textContent = RR.stateText(r);
    b.appendChild(pair);
    b.appendChild(st);
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var f = document.getElementById('rename-from');
      var t = document.getElementById('rename-to');
      if (f) f.value = r.from;
      if (t) t.value = r.to;
      updateRenamePreview();
    });
    host.appendChild(b);
  });
  box.appendChild(host);
}

function renderRenameFolder() {
  var box = document.getElementById('rename-folder');
  var FI = window.MA.folderImpact;
  if (!box || !FI) return;
  box.textContent = '';
  if (!_fiEnabled()) return;

  var head = document.createElement('div');
  head.className = 'folder-head';
  head.id = 'rename-folder-head';
  box.appendChild(head);
  if (_fiLoading) {
    head.textContent = '保存フォルダを読み込み中…';
    head.setAttribute('data-loading', '1');
    return;
  }
  head.setAttribute('data-loading', '0');

  var from = (document.getElementById('rename-from') || {}).value || '';
  var pv = FI.preview(_fiRows(), from);
  var s = FI.summarize(pv);
  head.textContent = from ? FI.summaryText(s) : (s.files + ' 枚を対象にできます');
  head.setAttribute('data-files', String(s.files));
  head.setAttribute('data-hit-docs', String(s.hitDocs));
  head.setAttribute('data-total', String(s.total));
  head.setAttribute('data-unopened-hit-docs', String(s.unopenedHitDocs));
  head.setAttribute('data-apply-docs', String(s.applyDocs));
  if (!from || s.files === 0) return;

  var rows = document.createElement('div');
  rows.className = 'folder-rows';
  FI.sortForDisplay(pv).forEach(function(r) {
    var row = document.createElement('div');
    row.className = 'folder-row' + (r.count === 0 ? ' zero' : '');
    // サブフォルダの図は道付き (docs/api/Foo)。直下の同じ名前の図と見分ける。
    row.setAttribute('data-doc-name', r.label || r.name);
    row.setAttribute('data-doc-rel', r.rel || '');
    row.setAttribute('data-count', String(r.count));
    row.setAttribute('data-open', r.open ? '1' : '0');
    row.setAttribute('data-target', r.target ? '1' : '0');
    var n = document.createElement('span');
    n.className = 'folder-name';
    n.textContent = r.label || r.name;
    n.title = r.label || r.name;
    row.appendChild(n);
    // 「開いている」だけを印にする。未オープンの図が無印なのは、
    // それが置換の既定の的だから (印は例外にだけ付ける)。
    if (r.open) {
      var tag = document.createElement('span');
      tag.className = 'folder-tag';
      tag.textContent = '開いている';
      row.appendChild(tag);
    }
    var c = document.createElement('span');
    c.className = 'folder-count';
    c.textContent = r.count + ' 件';
    row.appendChild(c);
    rows.appendChild(row);
  });
  box.appendChild(rows);
}

// 開いていない図のうち、置換の的になるぶん (ヒット 0 を除く)。
function _fiFolderApply(from) {
  var FI = window.MA.folderImpact;
  var br = window.MA.bulkRename;
  var out = { docs: 0, total: 0 };
  if (!FI || !br || !_fiEnabled() || !from || !window.MA.workspace) return out;
  var openKeys = _fiOpenKeys();
  FI.applyTargets(FI.merge([], _fiFileDocs).filter(function(r) {
    return !openKeys[r.key];
  }), from).forEach(function(r) {
    out.docs++;
    out.total += br.countIn(r.dsl, from);
  });
  return out;
}

// 開いていない図への置換。タブを開かずに保存フォルダへ直接書き戻す
// (開いてから直すのでは、枚数ぶんのタブを開く手順が残ってしまう)。
function applyRenameToUnopenedFiles(from, to) {
  var FI = window.MA.folderImpact;
  var br = window.MA.bulkRename;
  var WS = window.MA.workspace;
  var empty = { docs: 0, total: 0, failed: 0, rows: [] };
  if (!FI || !br || !WS || !_fiEnabled() || !from || !br.isValidTarget(to) || from === to) {
    return Promise.resolve(empty);
  }
  var dir = _wsFileDir();
  var openKeys = _fiOpenKeys();
  var rows = FI.merge([], _fiFileDocs).filter(function(r) { return !openKeys[r.key]; });
  var targets = FI.applyTargets(rows, from);
  if (targets.length === 0) return Promise.resolve(empty);
  var res = { docs: 0, total: 0, failed: 0, rows: [] };
  return Promise.all(targets.map(function(r) {
    var next = br.replaceIn(r.dsl, from, to);
    var n = br.countIn(r.dsl, from);
    // サブフォルダの図はそのフォルダへ書く (直下の同じ名前の図には触れない)。
    var at = r.dir || dir;
    return WS.saveToFile({ name: r.name, dsl: next }, at).then(function(ok) {
      if (!ok) { res.failed++; return; }
      res.docs++;
      res.total += n;
      res.rows.push({ name: r.name, label: r.label, key: r.key, dir: at, count: n, before: r.dsl, after: next });
      // 読み込み済みの控えも進めておく。次のプレビューが古い本文を数えないように。
      _fiSetFileDsl(r.key, next);
      // 書いた後を基準にすると「変更なし」になり、
      // 後から開いたときに直した前後が出せない。基準がまだ無い図は書く **前** を
      // 基準にする (この置換がそのまま ± 差分として読める)。
      var diffKey = r.dir ? _diffName({ name: r.name, sub: true, dir: r.dir }) : r.name;
      if (window.MA.saveDiff) { try { window.MA.saveDiff.markIfAbsent(diffKey, r.dsl); } catch (e) {} }
    });
  })).then(function() {
    // 開いていない図はタブの Ctrl+Z が効かないので、書いた前後をここに残し、
    // 窓の「置換前に戻す」で 1 回で戻せるようにする (保存先には何も置かない)。
    _renameUndoRows = res.rows.slice();
    return res;
  });
}

function _fiSetFileDsl(key, dsl) {
  _fiFileDocs.forEach(function(d) { if ((d.key || d.name) === key) d.dsl = dsl; });
}

// ── 開いていない図への置換を戻す ─────────────
// 直前の [置換] で書いた開いていない図 [{ name, label, key, dir, before, after }]。
// 戻すのは、書いた後に誰も書き換えていない図だけ (今のファイルが after と同じ)。
// 後から直された図を置換前で潰すと、その直しが黙って消える。
var _renameUndoRows = [];

function revertUnopenedRename() {
  var WS = window.MA.workspace;
  var rows = _renameUndoRows.slice();
  var out = { reverted: 0, skipped: [], failed: 0 };
  if (!WS || !rows.length) return Promise.resolve(out);
  return Promise.all(rows.map(function(r) {
    return WS.loadFile(r.name, r.dir).then(function(cur) {
      if (typeof cur !== 'string' || cur !== r.after) { out.skipped.push(r.label || r.name); return; }
      return WS.saveToFile({ name: r.name, dsl: r.before }, r.dir).then(function(ok) {
        if (!ok) { out.failed++; return; }
        out.reverted++;
        _fiSetFileDsl(r.key, r.before);
      });
    }, function() { out.failed++; });
  })).then(function() {
    _renameUndoRows = [];
    return out;
  });
}

// ── 直前の置換を 1 押しで全部戻す (TICKET-owner-20261123-0742-1) ─────────────
// 直前の [置換] で書き換えた開いている図 [{ id, name, label, before, after }] (renameUndo.openRows)。
// 開いていない図の控え (_renameUndoRows) と合わせて、窓の「置換前に戻す」1 押しで戻す。
var _renameUndoOpen = [];
// 置換の窓の「置換前に戻す」を今の状態で描き直す口 (setupBulkRename が入れる)。
var _renderRenameRevertNow = function() {};

// 開いている図の今の本文 (開いている図はエディタの未確定分を含む)。
function _renameCurrentOpen() {
  var out = {};
  _diffDocs().forEach(function(d) { if (d && d.id != null) out[d.id] = d.dsl; });
  return out;
}

function _renameUndoPlan() {
  var RU = window.MA.renameUndo;
  if (!RU) return { open: [], already: [], changedAfter: [], unopened: _renameUndoRows.length, total: _renameUndoRows.length };
  return RU.plan(_renameUndoOpen, _renameCurrentOpen(), _renameUndoRows);
}

// 開いている図は、今の本文が置換の直後のままのものだけを置換前に戻す。開いている図 (選んでいるタブ) は
// エディタの履歴に 1 操作として積む (Ctrl+Z でこの戻しを取り消せ、Ctrl+Y と食い違わない)。
// 先に Ctrl+Z で戻した図は二重に戻さず、置換の後に書き換わった図は戻さず名前を返す。
function revertRename() {
  var WS = window.MA.workspace;
  var p = _renameUndoPlan();
  var res = { open: 0, unopened: 0, skipped: p.changedAfter.slice(), failed: 0 };
  if (WS) {
    var activeId = WS.getActiveId();
    p.open.forEach(function(r) {
      if (r.id === activeId) {
        if (_applyLineEditText(r.before)) res.open++;
        return;
      }
      WS.updateDoc(r.id, { dsl: r.before });
      var d = null;
      WS.list().forEach(function(x) { if (x.id === r.id) d = x; });
      if (d) {
        try {
          var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
          if (cfg && cfg.backend === 'file') writeDocToFolder(d, _docDir(d));
        } catch (e) {}
      }
      res.open++;
    });
    try { renderTabs(); } catch (e) {}
  }
  _renameUndoOpen = [];
  return revertUnopenedRename().then(function(u) {
    res.unopened = u.reverted;
    res.skipped = res.skipped.concat(u.skipped);
    res.failed += u.failed;
    return res;
  });
}

// 直近のプレビューで数えた総ヒット数。組を覚えるときの hits に使う
// (0 件だったことも覚える値なので、数えた側で持つ)。
var _renameGrand = 0;
function _renameGrandTotal() { return _renameGrand; }

function updateRenamePreview() {
  var br = window.MA.bulkRename;
  var hits = document.getElementById('rename-hits');
  var summary = document.getElementById('rename-summary');
  var applyBtn = document.getElementById('btn-rename-apply');
  if (!br || !hits || !summary || !applyBtn) return;
  var from = (document.getElementById('rename-from') || {}).value || '';
  var to = (document.getElementById('rename-to') || {}).value || '';
  var allDocs = (document.getElementById('rename-all-docs') || {}).checked;
  var docs = window.MA.workspace ? window.MA.workspace.list() : [];
  var activeId = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
  // 表示中の候補は「今の editor の中身」を反映させたいのでアクティブ分だけ差し替える。
  docs = docs.map(function(d) {
    return d.id === activeId ? { id: d.id, name: d.name, dsl: mmdText } : d;
  });
  if (!allDocs) docs = docs.filter(function(d) { return d.id === activeId; });

  hits.textContent = '';
  var rows = br.preview(docs, from);
  // サブフォルダの図のタブは道付きで出す (直下の同じ名前のタブと見分ける)。
  var labelById = {};
  _fiOpenDocs().forEach(function(d) { labelById[d.id] = d.label; });
  // 保存フォルダの図も数えている間は、開いている図も下の一覧に「開いている」の札付きで 1 行ずつ出る。
  // ここにも並べると同じ図が 2 行になるので、一覧は 1 つにする (TICKET-owner-20261123-0742-1)。
  var oneList = !!allDocs && _fiEnabled();
  hits.setAttribute('data-merged', oneList ? '1' : '0');
  var total = 0;
  rows.forEach(function(r) {
    total += r.count;
    if (oneList) return;
    var row = document.createElement('div');
    row.className = 'hit' + (r.count === 0 ? ' zero' : '');
    row.setAttribute('data-doc-name', labelById[r.id] || r.name);
    var n = document.createElement('span');
    n.textContent = labelById[r.id] || r.name;
    var c = document.createElement('span');
    c.className = 'hit-count';
    c.textContent = r.count + ' 件';
    row.appendChild(n);
    row.appendChild(c);
    hits.appendChild(row);
  });

  renderRenameFolder();
  renderRenameRedo();

  // 開いていない図しか当たらない語でも置換できるようにする。フォルダを数えて
  // いるのにボタンが押せないのでは、結局その図を開く手順が残る。
  var openDocs = rows.filter(function(r) { return r.count > 0; }).length;
  var folder = _fiFolderApply(from);
  var grand = total + folder.total;
  var grandDocs = openDocs + folder.docs;

  var ok = !!from && br.isValidTarget(to) && from !== to && grand > 0;
  if (!from) summary.textContent = '置換前の部品名を入力してください';
  else if (grand === 0) summary.textContent = '「' + from + '」は見つかりません';
  else if (!to) summary.textContent = '置換後の名前を入力してください';
  else if (!br.isValidTarget(to)) summary.textContent = '置換後は英数字・_ ・- ・. のみ';
  else if (from === to) summary.textContent = '置換前と置換後が同じです';
  else {
    summary.textContent = grand + ' 件 / ' + grandDocs + ' 枚を置換します'
      + (folder.docs > 0 ? ' (うち開いていない ' + folder.docs + ' 枚)' : '');
  }
  _renameGrand = grand;
  summary.setAttribute('data-total', String(total));
  summary.setAttribute('data-grand-total', String(grand));
  summary.setAttribute('data-unopened-docs', String(folder.docs));
  applyBtn.disabled = !ok;
  var hitsLabel = document.getElementById('rename-hits-label');
  if (hitsLabel) {
    hitsLabel.textContent = from ? ('ヒット ' + grand + ' 件 / ' + grandDocs + ' 枚') : 'ヒット';
    hitsLabel.setAttribute('data-grand-total', String(grand));
    hitsLabel.setAttribute('data-docs', String(grandDocs));
  }
  // 開いている図で先に Ctrl+Z を押した後に開き直したら、ボタンは残りの図の枚数を言う。
  _renderRenameRevertNow();
}

// 置換前・置換後を決めたあとの共通処理。一括置換パネルと名前突合の
// 「統一」ボタンが同じ経路を通るようにここへ出す。
function renameAcrossDocs(from, to, docs) {
  return renamePairsAcrossDocs([{ from: from, to: to }], docs);
}

// 複数の組を 1 回で当てる (の「揃える」もこの道を通る)。
// 1 組のときは従来の ⇄ 一括置換と同じ結果になる。
function renamePairsAcrossDocs(pairs, docs) {
  var br = window.MA.bulkRename;
  if (!br || !window.MA.workspace) return null;
  var activeId = window.MA.workspace.getActiveId();
  var list = (pairs || []).filter(function(p) { return p && p.from; });
  if (!list.length) return null;
  var from = list.map(function(p) { return p.from; }).join(', ');
  var to = list.map(function(p) { return p.to; }).join(', ');

  var res = list.length === 1 ? br.apply(docs, list[0].from, list[0].to) : br.applyMany(docs, list);
  if (res.changed.length === 0) return res;

  // 当てる前の本文を図ごとに控える。
  // レビュー会議で「置換前はこうで、今はこうです」を 1 画面に並べられるように
  // する (Ctrl+Z で戻すと変更後が消えるので、往復では見せられない)。
  _captureBeforeRename(from, to, docs, res.changed);

  // アクティブな図はエディタごと差し替える。undo は 1 手で戻せるようにする。
  if (window.MA.history) window.MA.history.pushHistory();
  res.changed.forEach(function(c) {
    if (c.id === activeId) {
      mmdText = c.dsl;
      suppressSync = true;
      editorEl.value = mmdText;
      suppressSync = false;
    }
    window.MA.workspace.updateDoc(c.id, { dsl: c.dsl });
  });
  // タブ名自体が旧名なら追随させる (SpiDrv.puml → Spi_Driver.puml)。
  window.MA.workspace.list().forEach(function(d) {
    list.forEach(function(p) {
      if (d.name === p.from && br.isValidTarget(p.to)) window.MA.workspace.rename(d.id, p.to);
    });
  });

  if (window.MA.selection) window.MA.selection.clearSelection();
  updateLineNumbers();
  scheduleRefresh();
  renderTabs();
  // 保存フォルダ運用時は、置換が当たった図だけを書き出す。
  writeChangedToFolder(res.changed);
  return res;
}

function applyBulkRename() {
  if (!window.MA.workspace) return null;
  var from = (document.getElementById('rename-from') || {}).value || '';
  var to = (document.getElementById('rename-to') || {}).value || '';
  var allDocs = (document.getElementById('rename-all-docs') || {}).checked;
  var docs = _renameDocs();
  var activeId = window.MA.workspace.getActiveId();
  if (!allDocs) docs = docs.filter(function(d) { return d.id === activeId; });
  return renameAcrossDocs(from, to, docs);
}


function setupBulkRename() {
  var panel = document.getElementById('rename-panel');
  if (!panel || !window.MA.bulkRename) return;
  var fromEl = document.getElementById('rename-from');
  var toEl = document.getElementById('rename-to');
  var allEl = document.getElementById('rename-all-docs');
  var cancel = document.getElementById('btn-rename-cancel');
  var applyBtn = document.getElementById('btn-rename-apply');
  var summary = document.getElementById('rename-summary');

  // 閉じるときも組を覚える。欄から離れずに Esc・[閉じる] で終える打ち方
  // (ヒット 0 件で [適用] が押せないときの普通の終わり方) だと blur が来ず、
  // 打った組がどこにも残らないままになる。
  function closePanel() {
    panel.classList.remove('open');
    rememberRenamePair(fromEl && fromEl.value, toEl && toEl.value, _renameGrandTotal());
    // 当てずに閉じた組は欄に残さない。残すと次に開いたとき「前回の組」の代わりに
    // その組が居座り、本来の組を確かめるたびに消して打ち直すことになる
    // 打った組は上の行で過去の置換の組に残るので、
    // 要るときは行を 1 回押せば戻る。
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    _seededPair = null;
    renderRenameSeedNote(null);
  }

  function fillCandidates() {
    var dl = document.getElementById('rename-candidates');
    if (!dl) return;
    dl.textContent = '';
    window.MA.bulkRename.identifiers(_renameDocs()).forEach(function(name) {
      var o = document.createElement('option');
      o.value = name;
      dl.appendChild(o);
    });
  }

  // ツール ▾「部品名を一括置換する」・Ctrl+H・Ctrl+K・下端の統一バッジが runTool から呼ぶ。
  _toolRunners['tool-rename'] = function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    fillCandidates();
    // 選択中の部品があればそれを置換前の初期値にする (入力ゼロで始められる)。
    var sel = (window.MA.selection && window.MA.selection.getSelected()) || [];
    if (sel.length === 1 && sel[0] && typeof sel[0].id === 'string' && !fromEl.value) {
      fromEl.value = sel[0].id;
    }
    // DSL エディタで部品名を選んでから開いた (Ctrl+H) なら、それを置換前に入れる。
    if (!fromEl.value && editorEl && typeof editorEl.selectionStart === 'number') {
      fromEl.value = window.MA.bulkRename.seedFromSelection(
        editorEl.value.slice(editorEl.selectionStart, editorEl.selectionEnd));
    }
    // 前回の組を入れておく。過去の組の行は在るのに、焦点が空欄に入るので利用者は
    // 打ち始めてしまう —— 打ち直す 17 打を開いた時点で消す
    if (!fromEl.value && !toEl.value) { _seededPair = null; renderRenameSeedNote(null); }
    _seedArmed = true;
    // 過去の組はフォルダ側にも溜まっている。開いた時点で読み直す
    // (前の run が別のブラウザ・別のプロファイルでも、組はここに残っている)。
    // フォルダを使わない運用ではこのブラウザの組をその場で読むので、入れる組にすぐ間に合う。
    loadRenamePairs(true);
    seedRenamePair();
    // タブ列の下へ出す (何にも紐付かないまま画面の隅に貼り付いた板にしない)。
    var tabs = document.getElementById('tab-bar');
    var anchor = tabs ? tabs.getBoundingClientRect() : { left: 0, bottom: 0 };
    panel.style.left = Math.max(4, anchor.left + 8) + 'px';
    panel.style.top = (anchor.bottom + 2) + 'px';
    panel.classList.add('open');
    // 保存フォルダ運用でなければ、その的が無いのでチェック欄ごと出さない。
    var scanRow = document.getElementById('rename-scan-folder');
    if (scanRow && scanRow.parentNode) {
      scanRow.parentNode.style.display = _fiFolderMode() ? '' : 'none';
    }
    updateRenamePreview();
    // 保存フォルダは開いた時点で数え始める。押してから待たせると、
    // 「まず全ファイルを数えさせる」ための 1 手が増えるだけになる。
    if (_fiEnabled()) loadFolderImpact(true).then(updateRenamePreview);
    fromEl.focus();
    // 入れた組は選んだ状態で渡す。そのまま置換に進めるし、別の組を打つ回は
    // 1 文字目でまるごと置き換わる (入れておくことが打ち直しの邪魔にならない)。
    if (fromEl.value) { try { fromEl.select(); } catch (e) {} }
  };

  // 前回の組を欄に入れる。フォルダ側の組は非同期に届くので、届いた後にもう一度試す
  // (開いた瞬間は先に読めている組だけで決まる)。
  function seedRenamePair() {
    var RS = window.MA.renameSeed;
    var RR = window.MA.renameRedo;
    if (!RS || !RR || !fromEl || !toEl) return null;
    var pair = RS.seed(RR.pairs(_renameRedoPairs(), _renameRedoDocs()),
      { from: fromEl.value, to: toEl.value });
    // 入れられなかった回 (既に何か入っている) は、前に入れた案内を消さない。
    // 消すのは利用者が組を打ち替えたときだけ (下の input)。
    if (!pair) return null;
    fromEl.value = pair.from;
    toEl.value = pair.to;
    _seededPair = pair;
    renderRenameSeedNote(pair);
    updateRenamePreview();
    return pair;
  }

  // 開き直すまでの間に [置換] で当てたら、もう入れ直さない。当てた直後は下端のバッジの
  // 数え直しが組を読み直してここへ来るので、空にした欄へ今当てた組を戻して
  // 「N 件 / M 枚を置換しました」を「見つかりません」で上書きしてしまう。
  var _seedArmed = false;
  _seedRenamePairAgain = function() {
    if (!panel.classList.contains('open') || !_seedArmed) return;
    var p = seedRenamePair();
    if (p && document.activeElement === fromEl) { try { fromEl.select(); } catch (e) {} }
  };

  [fromEl, toEl].forEach(function(el) {
    if (!el) return;
    // 打ち替えたらその案内はもう自分の組の話ではない。描き直しより先に印を落とす
    // (後に回すと、その回の描き直しだけが「入れただけ」の扱いのまま残る)。
    el.addEventListener('input', function() {
      if (!_seededPair) return;
      if (fromEl.value === _seededPair.from && toEl.value === _seededPair.to) return;
      // 片側だけ打ち替えられたら、もう片側に残った前回の値は捨てる。
      // 「SpiDrv → Spi_Driver」を入れた欄で置換前だけ CanDrv に打ち替えた回に
      // Spi_Driver が残っていると、押した瞬間に別物へ改名してしまう。
      var other = (el === fromEl) ? toEl : fromEl;
      var seededOther = (el === fromEl) ? _seededPair.to : _seededPair.from;
      if (other.value === seededOther) other.value = '';
      _seededPair = null;
      renderRenameSeedNote(null);
    });
    el.addEventListener('input', updateRenamePreview);
    // 組は「打ち終わった時点」で覚える。ヒット 0 件だと [適用] は押せないまま
    // なので、適用のときだけ覚えていては、空打ちの組が永久に残らない
    // 打ち終わり = 欄から離れたとき。
    el.addEventListener('blur', function() {
      // こちらが入れておいた組は「打った組」ではない。覚え直すと、確かめただけの
      // 回が新しい置換として過去の組の先頭に積まれる。
      if (_seededPair && fromEl.value === _seededPair.from && toEl.value === _seededPair.to) return;
      rememberRenamePair(fromEl.value, toEl.value, _renameGrandTotal());
    });
    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' && !applyBtn.disabled) { ev.preventDefault(); doApply(); }
      if (ev.key === 'Escape') { ev.preventDefault(); closePanel(); }
    });
  });
  if (allEl) allEl.addEventListener('change', updateRenamePreview);
  var scanEl = document.getElementById('rename-scan-folder');
  if (scanEl) scanEl.addEventListener('change', function() {
    if (scanEl.checked) loadFolderImpact(true).then(updateRenamePreview);
    else updateRenamePreview();
  });

  function doApply() {
    var from = fromEl.value;
    var to = toEl.value;
    _seedArmed = false;
    // 戻せるのは直前の 1 回の置換だけ (前の回の控えを次の置換の後まで持ち越さない)。
    _renameUndoRows = [];
    _renameUndoOpen = [];
    // 開いている図の当てる前の本文を控える (「置換前に戻す」1 押しで開いている図も戻すため)。
    var beforeById = {}, nameById = {}, labelById = {};
    try {
      saveActiveDoc();
      _diffDocs().forEach(function(d) { beforeById[d.id] = d.dsl; nameById[d.id] = d.name; });
      _fiOpenDocs().forEach(function(d) { labelById[d.id] = d.label || d.name; });
    } catch (e) {}
    var res = applyBulkRename();
    if (res && res.changed && window.MA.renameUndo) {
      _renameUndoOpen = window.MA.renameUndo.openRows(beforeById, res.changed, labelById, nameById);
    }
    var openTotal = (res && res.total) || 0;
    var openDocs = (res && res.docs) || 0;
    // 開いていない図はタブを開かずに保存フォルダへ書き戻す。書き終えてから
    // 件数を足すので、表示された枚数は「実際に書けた枚数」になる。
    applyRenameToUnopenedFiles(from, to).then(function(f) {
      var total = openTotal + f.total;
      var docs = openDocs + f.docs;
      // 当たっても当たらなくても組は覚える。次の run はこの行を押すだけで済む。
      rememberRenamePair(from, to, total, total > 0);
      renderRenameRevert();
      if (total === 0) return;
      fromEl.value = '';
      toEl.value = '';
      // 欄を空けたら「前回の組を入れました」も下ろす (空の欄の上に残すと食い違う)。
      _seededPair = null;
      renderRenameSeedNote(null);
      fillCandidates();
      updateRenamePreview();
      var msg = total + ' 件 / ' + docs + ' 枚を置換しました';
      if (f.docs > 0) msg += ' (開いていない ' + f.docs + ' 枚を含む)';
      if (f.failed > 0) msg += ' / ' + f.failed + ' 枚は書き込めませんでした';
      summary.textContent = msg;
      summary.setAttribute('data-applied', String(total));
      summary.setAttribute('data-applied-unopened', String(f.docs));
      renderRenameRevert();
    });
  }

  // 「置換前に戻す」は直前の置換で書いた図 (開いている図・開いていない図) のうち、まだ戻せるものがあるときだけ出す。
  // 1 押しで全部を置換前に戻す。開いている図で先に Ctrl+Z を押した後は、残りの図の枚数を言う
  // (TICKET-owner-20261123-0742-1。前は開いていない図だけを戻し、開いている図は Ctrl+Z 任せで半分だけ戻った)。
  var revertBtn = document.getElementById('btn-rename-revert');
  function renderRenameRevert() {
    if (!revertBtn) return;
    var RU = window.MA.renameUndo;
    var p = _renameUndoPlan();
    var n = p.total;
    revertBtn.style.display = n > 0 ? '' : 'none';
    revertBtn.textContent = RU ? RU.buttonLabel(p) : ('置換前に戻す (' + n + ' 枚)');
    if (RU) revertBtn.title = RU.buttonTitle(p);
    revertBtn.setAttribute('data-docs', String(n));
    revertBtn.setAttribute('data-open-docs', String(p.open.length));
    revertBtn.setAttribute('data-unopened-docs', String(p.unopened));
  }
  _renderRenameRevertNow = renderRenameRevert;
  if (revertBtn) revertBtn.addEventListener('click', function() {
    revertBtn.disabled = true;
    revertRename().then(function(r) {
      revertBtn.disabled = false;
      renderRenameRevert();
      updateRenamePreview();
      var RU = window.MA.renameUndo;
      var n = r.open + r.unopened;
      summary.textContent = RU ? RU.doneText(r) : (n + ' 枚を置換前に戻しました');
      summary.setAttribute('data-reverted', String(n));
      summary.setAttribute('data-reverted-open', String(r.open));
      summary.setAttribute('data-reverted-unopened', String(r.unopened));
      summary.setAttribute('data-revert-skipped', String(r.skipped.length));
    });
  });

  if (applyBtn) applyBtn.addEventListener('click', doApply);
  if (cancel) cancel.addEventListener('click', closePanel);

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    // 開いたのと同じ click (Ctrl+K の行・下端の統一バッジ) では閉じない。
    if (panel.contains(ev.target) || _toolJustOpened) return;
    if (ev.target && ev.target.id === 'status-rename') return;
    closePanel();
  });
}

// ── 行編集 ─────────────────────────────────────────────────────────────────
// 一括置換は「図をまたいで識別子を一斉に」直すもので、レビュー指摘のような
// 「この図のこのメッセージ名だけ」「3 本目と 4 本目の間に 1 本」には使えない。
// エディタで直すと全選択して図全体を打ち直すことになり、1 語の修正でも手数が
// 図のテキスト量に比例して増える。ここでは行を一覧から選び、その 1 行だけを
// 書き換える・上下に挿す・消す経路を用意する。

var _lineEditIndex = null;   // 選択中の行番号 (0 始まり、DSL 上の実位置)

// 行の編集結果をエディタ・プレビュー・workspace へ流す共通経路。
// undo は 1 手で戻せるようにここで履歴を積む。
function _applyLineEditText(next) {
  if (typeof next !== 'string' || next === mmdText) return false;
  if (window.MA.history) window.MA.history.pushHistory();
  mmdText = next;
  suppressSync = true;
  editorEl.value = mmdText;
  suppressSync = false;
  if (window.MA.selection) window.MA.selection.clearSelection();
  updateLineNumbers();
  saveActiveDoc();
  scheduleRefresh();
  return true;
}

function renderLineEditList() {
  var le = window.MA.lineEdit;
  var list = document.getElementById('lines-list');
  if (!le || !list) return;
  var q = (document.getElementById('lines-filter') || {}).value || '';
  var rows = le.filter(le.entries(mmdText), q);

  list.textContent = '';
  if (rows.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'line-empty';
    empty.textContent = q ? '「' + q + '」に一致する行はありません' : '編集できる行がありません';
    list.appendChild(empty);
  }
  rows.forEach(function(e) {
    var row = document.createElement('div');
    row.className = 'line-row' + (e.index === _lineEditIndex ? ' selected' : '');
    row.setAttribute('data-line-index', String(e.index));
    row.setAttribute('data-line-kind', e.kind);
    var no = document.createElement('span');
    no.className = 'line-no';
    no.textContent = String(e.index + 1);
    var kind = document.createElement('span');
    kind.className = 'line-kind';
    kind.textContent = e.kind;
    var text = document.createElement('span');
    text.className = 'line-text';
    text.textContent = le.summarize(e.text, 60);
    row.appendChild(no);
    row.appendChild(kind);
    row.appendChild(text);
    row.addEventListener('click', function() { selectLineEditRow(e.index); });
    list.appendChild(row);
  });
  updateLineEditState();
}

// 行を選ぶと、その行の全文が入力欄に入る。直したい 1 語だけを打ち替えれば済む。
function selectLineEditRow(index) {
  var le = window.MA.lineEdit;
  var input = document.getElementById('lines-text');
  if (!le || !input) return;
  var lines = String(mmdText || '').split('\n');
  if (index == null || index < 0 || index >= lines.length) return;
  _lineEditIndex = index;
  input.value = String(lines[index]).replace(/\r$/, '');
  input.disabled = false;
  Array.prototype.forEach.call(document.querySelectorAll('#lines-list .line-row'), function(r) {
    var hit = Number(r.getAttribute('data-line-index')) === index;
    if (hit) r.classList.add('selected'); else r.classList.remove('selected');
  });
  updateLineEditState();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function updateLineEditState() {
  var input = document.getElementById('lines-text');
  var summary = document.getElementById('lines-summary');
  var apply = document.getElementById('btn-lines-apply');
  var before = document.getElementById('btn-lines-insert-before');
  var after = document.getElementById('btn-lines-insert-after');
  var del = document.getElementById('btn-lines-delete');
  if (!input || !summary || !apply) return;
  var picked = _lineEditIndex != null;
  var text = input.value || '';
  var lines = String(mmdText || '').split('\n');
  var current = picked && _lineEditIndex < lines.length
    ? String(lines[_lineEditIndex]).replace(/\r$/, '') : null;

  apply.disabled = !picked || !text.trim() || text === current;
  if (before) before.disabled = !picked || !text.trim();
  if (after) after.disabled = !picked || !text.trim();
  if (del) del.disabled = !picked;
  // 移動は入力欄の中身に関係なく、行が選ばれていて動かす先がある間だけ押せる。
  var up = document.getElementById('btn-lines-move-up');
  var down = document.getElementById('btn-lines-move-down');
  if (up) up.disabled = !picked || _lineEditIndex <= 0;
  if (down) down.disabled = !picked || _lineEditIndex >= lines.length - 1;

  if (!picked) summary.textContent = '一覧から行を選んでください';
  else if (!text.trim()) summary.textContent = '行の内容を入力してください';
  else if (text === current) summary.textContent = (_lineEditIndex + 1) + ' 行目 (変更なし)';
  else summary.textContent = (_lineEditIndex + 1) + ' 行目を書き換えます';
  summary.setAttribute('data-line', picked ? String(_lineEditIndex + 1) : '');
}

function setupLineEdit() {
  var le = window.MA.lineEdit;
  var panel = document.getElementById('lines-panel');
  if (!le || !panel) return;
  var filterEl = document.getElementById('lines-filter');
  var textEl = document.getElementById('lines-text');
  var summary = document.getElementById('lines-summary');

  function closePanel() { panel.classList.remove('open'); }

  function reselectAfter(nextIndex) {
    _lineEditIndex = null;
    if (textEl) { textEl.value = ''; textEl.disabled = true; }
    renderLineEditList();
    if (nextIndex != null) selectLineEditRow(nextIndex);
  }

  function doReplace() {
    if (_lineEditIndex == null) return;
    var idx = _lineEditIndex;
    if (!_applyLineEditText(le.replaceLine(mmdText, idx, textEl.value))) return;
    renderLineEditList();
    selectLineEditRow(idx);
    summary.textContent = (idx + 1) + ' 行目を書き換えました';
    summary.setAttribute('data-applied', String(idx + 1));
  }

  function doInsert(before) {
    if (_lineEditIndex == null) return;
    var idx = _lineEditIndex;
    var next = before ? le.insertBefore(mmdText, idx, textEl.value)
                      : le.insertAfter(mmdText, idx, textEl.value);
    if (!_applyLineEditText(next)) return;
    var added = before ? idx : idx + 1;
    reselectAfter(added);
    summary.textContent = (added + 1) + ' 行目に挿入しました';
    summary.setAttribute('data-applied', String(added + 1));
  }

  // 選んだ行を 1 つ上/下へ動かす。動かした行を選び直したまま残すので、
  // 続けて押せば何行でも運べる (2 行の入れ替えなら 1 手)。
  function doMove(delta) {
    if (_lineEditIndex == null) return;
    var moved = le.moveLine(mmdText, _lineEditIndex, delta);
    if (moved.text === mmdText) return;
    if (!_applyLineEditText(moved.text)) return;
    reselectAfter(moved.index);
    summary.textContent = (moved.index + 1) + ' 行目へ移動しました';
    summary.setAttribute('data-applied', String(moved.index + 1));
  }

  function doDelete() {
    if (_lineEditIndex == null) return;
    var idx = _lineEditIndex;
    if (!_applyLineEditText(le.removeLine(mmdText, idx))) return;
    reselectAfter(null);
    summary.textContent = (idx + 1) + ' 行目を削除しました';
    summary.setAttribute('data-applied', String(idx + 1));
  }

  // ツール ▾「行を書き換える」・Ctrl+K が runTool から呼ぶ。
  _toolRunners['tool-lines'] = function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    _lineEditIndex = null;
    if (textEl) { textEl.value = ''; textEl.disabled = true; }
    // 置き場は前と同じ (タブ列のボタンが見えていない既定の画面の位置)。
    panel.style.left = '4px';
    panel.style.top = '2px';
    panel.classList.add('open');
    renderLineEditList();
    // 選択中の要素があればその行を初期選択にする (探す手数をゼロにする)。
    var sel = (window.MA.selection && window.MA.selection.getSelected()) || [];
    if (sel.length === 1 && sel[0] && typeof sel[0].line === 'number') {
      selectLineEditRow(sel[0].line);
    } else if (filterEl) {
      filterEl.focus();
    }
  };

  if (filterEl) {
    filterEl.addEventListener('input', renderLineEditList);
    filterEl.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closePanel(); }
    });
  }
  if (textEl) {
    textEl.addEventListener('input', updateLineEditState);
    textEl.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); doReplace(); }
      if (ev.key === 'Escape') { ev.preventDefault(); closePanel(); }
      // Alt+↑↓ で連続して動かせる。入力欄から手を離さずに順序を直せる。
      if (ev.altKey && ev.key === 'ArrowUp') { ev.preventDefault(); doMove(-1); }
      if (ev.altKey && ev.key === 'ArrowDown') { ev.preventDefault(); doMove(1); }
    });
  }
  var applyBtn = document.getElementById('btn-lines-apply');
  if (applyBtn) applyBtn.addEventListener('click', doReplace);
  var beforeBtn = document.getElementById('btn-lines-insert-before');
  if (beforeBtn) beforeBtn.addEventListener('click', function() { doInsert(true); });
  var afterBtn = document.getElementById('btn-lines-insert-after');
  if (afterBtn) afterBtn.addEventListener('click', function() { doInsert(false); });
  var upBtn = document.getElementById('btn-lines-move-up');
  if (upBtn) upBtn.addEventListener('click', function() { doMove(-1); });
  var downBtn = document.getElementById('btn-lines-move-down');
  if (downBtn) downBtn.addEventListener('click', function() { doMove(1); });
  var delBtn = document.getElementById('btn-lines-delete');
  if (delBtn) delBtn.addEventListener('click', doDelete);
  var closeBtn = document.getElementById('btn-lines-close');
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
}

// ── 参照ペイン (2 枚の図を並べて見比べる) ────────────────────────────────
// 先輩の図を真似て書くとき、タブを行き来して記憶する往復が要らないように、
// 別のタブの図を右に出したまま編集を続けられるようにする。
// 参照側は読むだけ (選択・編集はしない)。スクロールは主プレビューと独立。

var _compareOpen = false;
// 参照ペインの幅も覚える (先輩の枠と同じ規則。)。
var COMPARE_PANE_KEY = 'pua.compare.pane';
var _compareRefId = null;    // 選んでいる参照図の doc id
var _compareShownDsl = null; // 直近に描いた DSL (同じなら描き直さない)

function _compareDocs() {
  if (!window.MA.workspace) return [];
  // 編集中の内容を workspace に載せてから読む (参照側が古い DSL にならない)。
  saveActiveDoc();
  try { return window.MA.workspace.list() || []; } catch (e) { return []; }
}

// 「この図の変更前後」と「他の図との見比べ」は
// 同じ 1 つの業務 (会議で変わったところを見せる) の裏表なので、同じペインの
// タブにする。開いたまま切り替えられれば、外れた方を閉じ直す往復が消える。
var _compareMode = 'ref';   // 'ref' … 他の図/変更前と並べる, 'diff' … 前回保存との差分

function toggleCompareView(open, mode) {
  var pane = document.getElementById('compare-pane');
  if (!pane) return;
  // モード指定つきで呼ばれたときは、開いているなら閉じずにそのタブへ切り替える。
  if (mode && _compareOpen && open !== false) { setCompareMode(mode); return; }
  _compareOpen = (open == null) ? !_compareOpen : !!open;
  pane.hidden = !_compareOpen;
  applySidePaneWidth('compare-pane', 'resizer-compare', COMPARE_PANE_KEY);
  if (_compareOpen) {
    _compareShownDsl = null;   // 開き直したら必ず描く
    setCompareMode(mode || _compareMode);
  }
}

function setCompareMode(mode) {
  var pane = document.getElementById('compare-pane');
  if (!pane) return;
  _compareMode = (mode === 'diff') ? 'diff' : 'ref';
  pane.classList.toggle('mode-diff', _compareMode === 'diff');
  [['compare-mode-ref', 'ref'], ['compare-mode-diff', 'diff']].forEach(function(p) {
    var b = document.getElementById(p[0]);
    if (!b) return;
    b.classList.toggle('active', _compareMode === p[1]);
    b.setAttribute('aria-selected', _compareMode === p[1] ? 'true' : 'false');
  });
  if (_compareMode === 'diff') renderCompareDiffView();
  else { _compareShownDsl = null; renderCompareView(); }
}

// 「± 差分」タブ: 編集中の図の前回保存時点からの行差分と、他に変わった図の一覧。
function renderCompareDiffView() {
  var view = document.getElementById('compare-diff-view');
  var SD = window.MA.saveDiff;
  if (!view || !SD) return;
  var esc = window.MA.htmlUtils.escHtml;
  var docs = _diffDocs();
  var activeId = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
  var active = null;
  docs.forEach(function(d) { if (d && d.id === activeId) active = d; });

  var html = '';
  if (!active) {
    html = '<div class="cd-head" id="compare-diff-empty">図を開くと、前回保存時点との差分が出ます。</div>';
  } else {
    var dn = _diffName(active);
    var st = SD.statusOf(dn, active.dsl);
    var at = SD.markedAt(dn);
    var c = SD.changedLines(dn, active.dsl);
    var head = esc(active.name) + ' ・ ';
    if (st === 'new') head += 'まだ保存していない (基準なし)';
    else if (st === 'same') head += '前回保存時点から変更なし';
    else head += '前回保存時点から +' + c.added + ' −' + c.removed;
    if (at) head += ' ・ ' + esc(_savedHeadLabel(at));
    // 下端の札から寄せてきた分 (消える向きの警告と
     // 「前回保存版に戻す」) は、この ± 差分タブが引き受ける。別の比較画面を開かせない。
    var LDm = window.MA.liveDiff;
    var pair = _liveDiffPair();
    var warn = (LDm && pair && pair.has && LDm.verdict(pair.before, pair.now, pair.has) === 'shrink')
      ? LDm.warnText(pair.name, pair.before, pair.now) : '';
    html += '<div class="cd-head" id="compare-diff-head"'
      + ' data-vd-warn="' + (warn ? '1' : '0') + '"'
      + ' data-vd-added="' + (st === 'changed' ? c.added : 0) + '"'
      + ' data-vd-removed="' + (st === 'changed' ? c.removed : 0) + '"'
      + '>' + (warn ? esc(warn) + ' / ' : '') + head + '</div>';
    if (LDm && pair && pair.has && LDm.canRestore(pair.before, pair.now, pair.has)) {
      html += '<button type="button" id="btn-compare-restore" class="cd-restore" title="'
        + esc(LDm.restoreTitle(pair.name, pair.before, pair.now)) + '">'
        + esc(LDm.restoreLabel()) + '</button>';
    }
    var rowsOut = st === 'changed' ? SD.diffLines(dn, active.dsl) : [];
    rowsOut.forEach(function(r) {
      var cls = r.mark === '+' ? 'add' : (r.mark === '-' ? 'del' : (r.mark === '…' ? 'skip' : ''));
      html += '<div class="cd-line ' + cls + '">' + esc(r.mark + ' ' + r.text) + '</div>';
    });
  }

  var others = docs.filter(function(d) {
    return d && d.id !== activeId && SD.statusOf(_diffName(d), d.dsl) !== 'same';
  });
  html += '<div class="cd-others" id="compare-diff-others">';
  html += others.length
    ? '他に変わった図 ' + others.length + ' 件'
    : '他に変わった図はありません';
  others.forEach(function(d) {
    html += '<div class="cd-other" data-doc-id="' + esc(d.id) + '">' + esc(d.name) + '</div>';
  });
  html += '</div>';
  view.innerHTML = html;

  // 「前回保存版に戻す」。当てるのは版一覧の「戻す」と同じ _applyLineEditText なので、
  // undo 1 手で取り消せて、戻した結果も次の保存で控えが取られる。
  var resBtn = document.getElementById('btn-compare-restore');
  if (resBtn) resBtn.addEventListener('click', function() {
    var LD = window.MA.liveDiff;
    var p = _liveDiffPair();
    if (!LD || !p || !p.has) return;
    if (!_applyLineEditText(p.before)) {
      if (window.MA.toast) window.MA.toast.show(LD.unchangedLine(p.name));
      return;
    }
    var line = LD.restoredLine(p.name, p.before, p.now);
    if (window.MA.toast) window.MA.toast.show(line);
    appendSaveStatus(line);
    // 戻した直後の画面が「差が 0」をそのまま映す (確かめ直しに別の画面を開かせない)。
    renderLiveDiffChip();
    renderCompareDiffView();
  });

  var rows = view.querySelectorAll('.cd-other');
  for (var i = 0; i < rows.length; i++) {
    (function(row) {
      row.addEventListener('click', function() {
        switchToDoc(row.getAttribute('data-doc-id'));
        renderCompareDiffView();
      });
    })(rows[i]);
  }
}

// 編集中の図の「変更前スナップショット」。
// 一括置換を当てたときにだけ控えられる。今の本文と同じなら null を返す
// (並べても何も見えない候補を選択肢に出さない)。
function _activeBeforeSnapshot(docs, activeId) {
  var BS = window.MA.beforeSnapshot;
  if (!BS || activeId == null) return null;
  var active = null;
  (docs || []).forEach(function(d) { if (d && d.id === activeId) active = d; });
  if (!active) return null;
  try {
    var snap = BS.get(_reviewStore(), _wsFileDir(), active.name);
    if (!snap || BS.isSame(snap, active.dsl)) return null;
    return snap;
  } catch (e) { return null; }
}

// 変更前を出しているときだけ「いつの・どの置換の前か」と「捨てる」を添える。
// 何日も前の控えを今日の変更前だと思って会議で見せてしまわないようにする。
function _renderCompareBeforeNote(snap, ref) {
  var pane = document.getElementById('compare-pane');
  var sel = document.getElementById('compare-select');
  if (!pane || !sel) return;
  var note = document.getElementById('compare-before-note');
  var showing = !!(snap && ref && ref.isBefore);
  if (!showing) { if (note) note.remove(); return; }
  if (!note) {
    note = document.createElement('div');
    note.id = 'compare-before-note';
    note.style.cssText = 'font-size:10px;color:var(--text-secondary);padding:3px 8px;'
      + 'display:flex;align-items:center;gap:6px;flex-shrink:0;'
      + 'border-bottom:1px solid var(--border);';
    var txt = document.createElement('span');
    txt.id = 'compare-before-label';
    var drop = document.createElement('button');
    drop.id = 'btn-compare-before-drop';
    drop.type = 'button';
    drop.textContent = '控えを捨てる';
    drop.style.cssText = 'font-size:10px;padding:1px 5px;cursor:pointer;';
    drop.addEventListener('click', function() {
      var BS = window.MA.beforeSnapshot;
      var docs = _compareDocs();
      var activeId = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
      var active = null;
      docs.forEach(function(d) { if (d && d.id === activeId) active = d; });
      if (BS && active) {
        try { BS.drop(_reviewStore(), _wsFileDir(), active.name); } catch (e) {}
      }
      _compareRefId = null;
      _compareShownDsl = null;
      renderCompareView();
    });
    note.appendChild(txt);
    note.appendChild(drop);
    // 見出しの行は横並びの flex なので、その中に入れると幅 0 に潰れて押せない。
    // 見出しの「次の行」として置く。
    var head = document.getElementById('compare-pane-header');
    if (head && head.parentNode) head.parentNode.insertBefore(note, head.nextSibling);
    else sel.parentNode.insertBefore(note, sel.nextSibling);
  }
  var label = document.getElementById('compare-before-label');
  if (label) label.textContent = window.MA.beforeSnapshot.label(snap);
}

// 参照図の選択肢を出し直し、選ばれている図を描く。
function renderCompareView() {
  var cv = window.MA.compareView;
  var sel = document.getElementById('compare-select');
  var status = document.getElementById('compare-status');
  var host = document.getElementById('compare-svg');
  if (!cv || !sel || !host || !_compareOpen) return;

  var docs = _compareDocs();
  var activeId = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
  var snap = _activeBeforeSnapshot(docs, activeId);
  var ref = cv.pick(docs, activeId, _compareRefId, snap);
  var opts = cv.options(docs, activeId, snap);

  sel.textContent = '';
  opts.forEach(function(o) {
    var op = document.createElement('option');
    op.value = String(o.id);
    // 「変更前」の候補は図種を添えない。名前に既に (変更前) が入っており、
    // 図種まで並ぶと別の図と読み違える。
    op.textContent = o.isBefore ? o.name
      : o.name + ' (' + String(o.diagramType || '').replace('plantuml-', '') + ')';
    if (o.isBefore) op.setAttribute('data-before', '1');
    if (o.isVersion) op.setAttribute('data-version', '1');
    if (ref && o.id === ref.id) op.selected = true;
    sel.appendChild(op);
  });
  _renderCompareBeforeNote(snap, ref);

  if (!ref) {
    _compareRefId = null;
    _compareShownDsl = null;
    host.textContent = '';
    if (status) status.textContent = '';
    var msg = document.createElement('div');
    msg.id = 'compare-empty';
    msg.style.cssText = 'font-size:11px;color:var(--text-secondary);';
    // 2 枚を比べるのは「この図の履歴」の版との比較だけ (TICKET-owner-20261115-2141-prune)。
    msg.textContent = '比べる版がありません。FILES のファイルを右クリック →「この図の履歴を表示」の行の'
      + '「比較」で、前の版を右に並べます。';
    host.appendChild(msg);
    return;
  }

  _compareRefId = ref.id;
  var full = cv.doc(docs, ref.id, activeId, snap) || {};
  var dsl = full.dsl || '';
  if (dsl === _compareShownDsl) return;   // 中身が変わっていなければ描き直さない
  _compareShownDsl = dsl;
  if (status) status.textContent = '描画中…';
  renderDslToSvg(dsl).then(function(svg) {
    // 描いている間に参照図が切り替わっていたら捨てる (遅れて届いた結果で上書きしない)
    if (!_compareOpen || _compareShownDsl !== dsl) return;
    host.innerHTML = svg;
    if (status) {
      status.textContent = full.isBefore ? '変更前 (読むだけ)' : '前の版 (読むだけ)';
    }
  }).catch(function(err) {
    if (!_compareOpen || _compareShownDsl !== dsl) return;
    host.textContent = '';
    var e = document.createElement('div');
    e.style.cssText = 'font-size:11px;color:var(--accent-orange);';
    e.textContent = '描画に失敗: ' + (err && err.message ? err.message : err);
    host.appendChild(e);
    if (status) status.textContent = 'エラー';
  });
}

// 2 枚を比べるのは「この図の履歴」の版との比較だけ (参照ペインの別フォルダとの突き合わせは持たない)。
function setupCompareView() {
  var btn = document.getElementById('btn-tab-compare');
  var sel = document.getElementById('compare-select');
  var close = document.getElementById('btn-compare-close');
  if (btn) btn.addEventListener('click', function() { toggleCompareView(null, 'ref'); });
  if (close) close.addEventListener('click', function() { toggleCompareView(false); });
  var mRef = document.getElementById('compare-mode-ref');
  var mDiff = document.getElementById('compare-mode-diff');
  if (mRef) mRef.addEventListener('click', function() { setCompareMode('ref'); });
  if (mDiff) mDiff.addEventListener('click', function() { setCompareMode('diff'); });
  if (sel) {
    sel.addEventListener('change', function() {
      _compareRefId = sel.value;
      _compareShownDsl = null;
      renderCompareView();
    });
  }
}

// ── 手元の .puml を開く ──────────────────────────
// 入口は「📄 ファイルを開く(.puml)」(タブ列・📂 一覧の頭・起動直後の空の画面) と
// エディタ/プレビューへのドラッグ&ドロップ。複数枚はタブで全部開く。
// 開いたファイルの場所・文字コード・改行は doc id ごとに覚え、上書き保存は元のファイルへ
// 同じ文字コード・改行で戻す (保存先フォルダへ複製しない。複製は別名保存で)。
var _openedSources = {};

function _openedSourceOf(docId) {
  return (docId && _openedSources[docId]) || null;
}

function _sourcePathOf(docId) {
  var m = _openedSourceOf(docId);
  return (m && m.path) || '';
}

// 保存フォルダへ書く経路 (別名保存・自動保存) にも、
// 開いたときの改行を持たせる。元が LF のファイルが、開いて保存するだけで
// 全行 CRLF に書き換わっていた (server は付いていなければ既定のまま書く)。
function _withSourceEol(doc) {
  var m = _openedSourceOf(doc && doc.id);
  var eol = m && m.eol;
  if (!doc || (eol !== 'lf' && eol !== 'crlf')) return doc;
  // BOM も開いたときのまま (付けないと server は保存先の同名ファイルの BOM を引き継ぐ)。
  return { id: doc.id, name: doc.name, diagramType: doc.diagramType, dsl: doc.dsl, eol: eol, bom: !!m.bom };
}

// 今のタブのファイルの改行・文字コード。元のファイルへ書き戻す図は開いたときの値
// (書き戻しもその値で行う)、保存先の図は server が読んだ・書いたときに言ったディスクの値。
// まだどこにも書いていない新しい図は null (下端に何も出さない)。
function _docFormat(doc) {
  if (!doc) return null;
  var src = _openedSourceOf(doc.id);
  if (src && src.path) return src;
  var WS = window.MA.workspace;
  var f = (WS && WS.fileFormatOf) ? WS.fileFormatOf(doc.name, _docDir(doc)) : null;
  return f || src || null;
}

// 下端の 1 語 (例: CRLF · UTF-8 BOM)。タブを替えたとき・保存先へ書いたときに描き直す。
function renderFileFormat() {
  var el = document.getElementById('status-format');
  if (!el) return;
  var FO = window.MA.fileOpen;
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  var t = (FO && FO.formatLabel) ? FO.formatLabel(_docFormat(doc)) : '';
  el.textContent = t;
  el.hidden = !t;
}
window.addEventListener('pua:folder-changed', function() {
  try { renderFileFormat(); } catch (e) {}
});

function openFile() {
  var AB = window.MA.appBridge;
  var input = document.getElementById('file-input');
  if (AB && AB.isApp && AB.isApp() && window.fetch) {
    window.fetch('/native-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(j) {
        if (!j) { if (input) input.click(); return; }
        if (j.canceled) return;
        openSourceFiles((j.files || []).map(function(f) {
          return { name: f.name, text: f.text, error: f.error,
                   meta: { path: f.path, encoding: f.encoding, bom: !!f.bom, eol: f.eol } };
        }), []);
      })
      .catch(function() { if (input) input.click(); });
    return;
  }
  if (input) input.click();
}

// File (ブラウザの File) の並びを読んで {name, text, meta} にする。
// pywebview のドロップは File に実際のパスを持たせてくる (pywebviewFullPath)。
function readLocalFiles(files) {
  var FO = window.MA.fileOpen;
  var part = FO ? FO.partition(files) : { ok: files, skipped: [] };
  var reads = part.ok.map(function(f) {
    var path = String(f.pywebviewFullPath || f.path || '');
    var viaBuf = (typeof f.arrayBuffer === 'function')
      ? f.arrayBuffer()
      : new Promise(function(res, rej) {
        var fr = new FileReader();
        fr.onload = function() { res(fr.result); };
        fr.onerror = rej;
        fr.readAsArrayBuffer(f);
      });
    return viaBuf.then(function(buf) {
      var d = FO ? FO.decode(new Uint8Array(buf)) : { text: '', encoding: 'utf-8', bom: false, eol: 'lf' };
      return { name: f.name, text: d.text, meta: { path: path, encoding: d.encoding, bom: d.bom, eol: d.eol } };
    }).catch(function(e) { return { name: f.name, error: String((e && e.message) || e) }; });
  });
  return Promise.all(reads).then(function(items) { return { items: items, skipped: part.skipped }; });
}

function onFilePicked(e) {
  var files = Array.prototype.slice.call((e.target && e.target.files) || []);
  if (e.target) e.target.value = '';
  if (!files.length) return;
  readLocalFiles(files).then(function(r) { openSourceFiles(r.items, r.skipped); });
}

// 読んだファイルをタブで開く。最後に開いた 1 枚を前に出す。
// Import ▾ の「クリップボードの DSL から開く」。
// 他ツールや課題票から貼られた DSL は、今まで新しいタブを作って貼り付ける 2 手だった。
// 読み込む経路は openSourceFiles 1 本のままにして、入口だけを足す。
function openFromClipboard() {
  var nav = window.navigator;
  if (!nav || !nav.clipboard || !nav.clipboard.readText) {
    if (window.MA.toast) window.MA.toast.show('この画面ではクリップボードを読めません (貼り付けで開いてください)');
    return Promise.resolve([]);
  }
  return nav.clipboard.readText().then(function(text) {
    var body = String(text == null ? '' : text);
    if (!body.trim()) {
      if (window.MA.toast) window.MA.toast.show('クリップボードが空です');
      return [];
    }
    // 名前は貼られた DSL の title から採る。無ければ日付の付いた仮の名前にする。
    var m = /^\s*title\s+(.+)$/m.exec(body);
    var name = m ? m[1].trim() : ('clipboard-' + new Date().toISOString().slice(0, 10));
    return openSourceFiles([{ name: name, text: body }], []);
  }, function() {
    if (window.MA.toast) window.MA.toast.show('クリップボードを読めませんでした');
    return [];
  });
}

function openSourceFiles(items, skipped) {
  var WS = window.MA.workspace;
  var FO = window.MA.fileOpen;
  var ok = (items || []).filter(function(it) { return it && !it.error; });
  var bad = (items || []).filter(function(it) { return it && it.error; });
  if (!ok.length) {
    var why = bad.map(function(b) { return b.name + ': ' + b.error; })
      .concat((skipped || []).map(function(n) { return n + ': .puml / .plantuml / .uml / .txt ではありません'; }));
    if (why.length && window.MA.toast) window.MA.toast.show('開けませんでした — ' + why.join(' / '));
    return [];
  }
  window.MA.history.pushHistory();
  if (!WS) {
    mmdText = ok[ok.length - 1].text;
    suppressSync = true;
    editorEl.value = mmdText;
    suppressSync = false;
    updateLineNumbers();
    isFirstRender = true;
    scheduleRefresh();
    return [];
  }
  saveActiveDoc();
  var opened = [];
  ok.forEach(function(it) {
    var detected = WS.detectType(it.text);
    var type = (detected && modules[detected]) ? detected : currentDiagramType;
    var name = WS.sanitizeName(FO ? FO.baseName(it.name) : it.name);
    var same = WS.findByName ? WS.findByName(name) : null;
    var samePath = same && it.meta && it.meta.path && _sourcePathOf(same.id) === it.meta.path;
    var doc;
    if (same && _openedSourceOf(same.id) && !samePath) {
      // 別の場所の同名ファイルは、前に開いた方を潰さず別タブにする。
      doc = WS.open({ name: name, dsl: it.text, diagramType: type });
    } else {
      doc = openExistingFile({ name: name, dsl: it.text, diagramType: type });
    }
    _openedSources[doc.id] = it.meta || { path: '', encoding: 'utf-8', bom: false, eol: 'lf' };
    opened.push(doc);
  });
  WS.setActive(opened[opened.length - 1].id);
  applyActiveDoc();
  if (window.MA.toast) {
    var msg = opened.length + ' 枚を開きました';
    if (skipped && skipped.length) msg += ' (開かなかったもの: ' + skipped.join(', ') + ')';
    if (bad.length) msg += ' (読めなかったもの: ' + bad.map(function(b) { return b.name; }).join(', ') + ')';
    window.MA.toast.show(msg);
  }
  return opened;
}

// 未対応記法の一覧。開いたファイルのタブでだけ出す (自分で書いた図に口を出さない)。
function renderUnsupportedPanel() {
  var FO = window.MA.fileOpen;
  var pane = document.getElementById('preview-pane');
  if (!FO || !pane || !window.MA.workspace) return;
  var panel = document.getElementById('unsupported-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'unsupported-panel';
    panel.hidden = true;
    var header = document.getElementById('preview-pane-header');
    if (header && header.nextSibling) pane.insertBefore(panel, header.nextSibling);
    else pane.appendChild(panel);
  }
  var doc = window.MA.workspace.getActive();
  if (!doc || !_openedSourceOf(doc.id)) { panel.hidden = true; panel.setAttribute('data-count', '0'); return; }
  // 描いた図種に合わせて読み直した図は、その図種として読めない行を出す。
  var kind = (_svgKindFix && currentModule && currentModule.type) ? currentModule.type : doc.diagramType;
  // 行ごとの正規表現では決めない。今の本文に対するエンジンの答えがあるときだけ、
  // その答え (エラー行・落ちた理由・閉じない枠) を理由つきで出す。答えの無い本文 (描く前・描けなかった) には出さない。
  var dsl = (doc.id === window.MA.workspace.getActiveId() && typeof mmdText === 'string') ? mmdText : doc.dsl;
  var verdict = (_engineVerdict && _engineVerdict.text === dsl) ? _engineVerdict : null;
  var rows = FO.bannerRows ? FO.bannerRows(dsl, kind, verdict) : [];
  panel.setAttribute('data-count', String(rows.length));
  panel.textContent = '';
  if (!rows.length) { panel.hidden = true; return; }
  panel.hidden = false;
  var head = document.createElement('div');
  head.id = 'unsupported-summary';
  // 見出しは何がどこか (理由の頭) だけを言い、理由の全文は下の行ごとに書く。
  var unclosed = rows[0].cause === 'unclosed';
  var what = unclosed ? '閉じていない枠が ' + rows.length + ' 個'
    : 'PlantUML が ' + FO.kindLabel(kind) + 'として読めない行が ' + rows.length + ' 行';
  var where = unclosed ? rows[0].line + ' 行目の ' + String(rows[0].text).trim().split(/\s+/)[0] + ' に end がありません'
    : String(rows[0].reason).split(/:\s/)[0];
  head.textContent = '⚠ ' + what + 'あります (' + where + (rows.length > 1 ? ' ほか' : '')
    + ')。本文の編集とプレビューはそのまま使えます';
  var copy = document.createElement('button');
  copy.type = 'button';
  copy.id = 'btn-unsupported-copy';
  copy.textContent = '報告用に複製';
  copy.title = '識別子・ラベル・本文・ファイル名を伏せた記法の骨格と行数だけをクリップボードに入れます (外部へは送りません)';
  copy.addEventListener('click', function() {
    var live = window.MA.workspace.getActive();
    var text = FO.report(live ? (live.id === doc.id ? mmdText : live.dsl) : '', live ? live.diagramType : null,
      live && live.id === doc.id ? rows : null);
    var done = function() { copy.textContent = '複製しました'; copy.setAttribute('data-copied', '1'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function() { _copyByTextarea(text); done(); });
    } else { _copyByTextarea(text); done(); }
  });
  // 右上にはズームの HUD が重なるので、押す所は左端に置く。
  head.insertBefore(copy, head.firstChild);
  panel.appendChild(head);
  var ul = document.createElement('ul');
  ul.id = 'unsupported-list';
  rows.slice(0, 100).forEach(function(r) {
    var li = document.createElement('li');
    li.className = 'unsupported-row';
    li.setAttribute('data-line', String(r.line));
    li.setAttribute('data-reason', r.reason);
    li.textContent = r.line + ' 行目: ' + String(r.text).trim().slice(0, 120) + ' — ' + r.reason;
    ul.appendChild(li);
  });
  panel.appendChild(ul);
}

function _copyByTextarea(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

// 起動直後の空の画面 (見本・白紙のタブが 1 枚だけ) に入口を出す。
function renderOpenEmptyHint() {
  var host = document.getElementById('preview-container');
  var WS = window.MA.workspace;
  if (!host || !WS) return;
  var hint = document.getElementById('open-empty-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'open-empty-hint';
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'btn-open-file-empty';
    b.textContent = 'ファイルを開く(.puml)';
    b.addEventListener('click', function() { openFile(); });
    var p = document.createElement('div');
    p.textContent = 'またはここへ .puml をドラッグ&ドロップ (複数枚はタブで開きます)';
    hint.appendChild(b);
    hint.appendChild(p);
    host.appendChild(hint);
  }
  var docs = WS.list ? WS.list() : [];
  var active = WS.getActive();
  var empty = docs.length <= 1 && !!active && !_openedSourceOf(active.id) && _isUntouchedDoc(active);
  hint.hidden = !empty;
  if (empty) syncOpenEmptyHint();
}

function setupFileDrop() {
  var depth = 0;
  function hasFiles(ev) {
    var t = ev.dataTransfer && ev.dataTransfer.types;
    return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0;
  }
  document.addEventListener('dragenter', function(ev) {
    if (!hasFiles(ev)) return;
    depth++;
    document.body.classList.add('file-dragging');
  });
  document.addEventListener('dragleave', function(ev) {
    if (!hasFiles(ev)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('file-dragging');
  });
  document.addEventListener('dragover', function(ev) {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', function(ev) {
    depth = 0;
    document.body.classList.remove('file-dragging');
    var files = Array.prototype.slice.call((ev.dataTransfer && ev.dataTransfer.files) || []);
    if (!files.length) return;
    ev.preventDefault();  // テキストエリアにファイル名が挿入されないように
    readLocalFiles(files).then(function(r) { openSourceFiles(r.items, r.skipped); });
  });
}

// 開いた元のファイルへ書き戻す。戻り値は Promise<{ok, path, error}>。
function writeBackToSource(doc) {
  var FO = window.MA.fileOpen;
  var meta = _openedSourceOf(doc && doc.id);
  if (!FO || !meta || !meta.path || !window.fetch) return Promise.resolve({ ok: false, error: '元のファイルの場所が分かりません' });
  return window.fetch('/native-write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(FO.writeBody(meta.path, doc.dsl, meta)),
  }).then(function(r) {
    return r.json().then(function(j) { return r.ok ? { ok: true, path: j.path } : { ok: false, error: j.error || ('HTTP ' + r.status) }; });
  }).catch(function(e) { return { ok: false, error: String((e && e.message) || e) }; });
}

// 保存先ディレクトリを設定していても「保存」は
// ダウンロードしか起こさず、フォルダに .puml ができなかった。保存先を設定して
// いる間は、保存先へ書くのが「保存」である。判定は save-target が唯一の規約。

// 手で押した保存が書けたら、その中身を
// 「前回保存版」にして未保存の印 (タブ・上部バー・FILES の行) を同じ時に消し、保存ボタンの隣に
// 時刻と書いた先を数秒出す。以前は自動の書き戻し (saveActiveDoc) だけが基準を更新していたので、
// 書き戻しを見送る見本のままのタブや、ダウンロード保存では、ファイルが書けても ○ / ● が残った。
var _saveFlashTimer = null;
function _afterManualSave(doc, target, writtenToFolder) {
  if (!doc || !doc.name) return;
  try { if (window.MA.saveDiff) window.MA.saveDiff.mark(_diffName(doc), doc.dsl); } catch (e) {}
  if (writtenToFolder) {
    try { if (window.MA.versionTimeline) window.MA.versionTimeline.push(_diffName(doc), doc.dsl); } catch (e) {}
    // 下端の札も書けた回に揃える (「見本のまま · 書いていません」を書いた後に残さない)。
    try {
      if (window.MA.autoSave && window.MA.autoSave.noteFileWritten) {
        window.MA.autoSave.noteFileWritten(doc.name, doc.diagramType);
      }
    } catch (e) {}
  }
  try { renderDiffBadge(); } catch (e) {}
  try { renderLiveDiffChip(); } catch (e) {}
  var ST = window.MA.saveTarget;
  var el = document.getElementById('top-save-flash');
  var f = (ST && ST.savedFlash) ? ST.savedFlash(target) : null;
  if (!el || !f) return;
  el.textContent = f.text;
  el.title = f.title;
  // 保存ボタンの真下に出す (上部バーの並びには入れない)。
  var btn = document.getElementById('top-save');
  var r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
  if (r && r.width > 0) {
    el.style.left = Math.max(4, Math.round(r.left)) + 'px';
    el.style.top = Math.round(r.bottom + 4) + 'px';
  }
  el.hidden = false;
  if (_saveFlashTimer) clearTimeout(_saveFlashTimer);
  _saveFlashTimer = setTimeout(function() { el.hidden = true; _saveFlashTimer = null; }, 4000);
}

function saveFile() {
  var title = (currentParsed && currentParsed.meta && currentParsed.meta.title) || 'untitled';
  // 押した時点の編集内容を workspace のアクティブなドキュメントに書き戻してから
  // 保存する (打った直後に押しても最後の 1 文字が落ちない)。
  var doc = saveActiveDoc();
  // saveActiveDoc は錠が効いたとき控えの名前を持つ doc を返す。
  // そのまま錠に問い直すと「名前が変わった」と見えて錠が外れ、逸れたことも言えなくなる。
  // 画面で開いている図の名前は workspace から取り直す。
  var openName = doc ? doc.name : '';
  try {
    var live = window.MA.workspace ? window.MA.workspace.getActive() : null;
    if (live && live.name) openName = live.name;
  } catch (e) {}
  if (doc && openName && doc.name !== openName) {
    doc = { id: doc.id, name: openName, diagramType: doc.diagramType, dsl: doc.dsl,
            dir: doc.dir, sub: doc.sub };
  }
  // 手元から開いたファイルの上書き保存は、元のファイルへ戻す。
  if (doc && _sourcePathOf(doc.id)) {
    writeBackToSource(doc).then(function(res) {
      var st = document.getElementById('status-save-result');
      if (st) st.setAttribute('data-source-write', res.ok ? 'ok' : 'error');
      if (res.ok) {
        setSaveStatus('上書き保存しました: ' + res.path);
        var sp = String(res.path || '');
        var cut = Math.max(sp.lastIndexOf('/'), sp.lastIndexOf('\\'));
        _afterManualSave(doc, { mode: 'file', name: doc.name, dir: cut > 0 ? sp.slice(0, cut) : sp }, false);
      } else {
        setSaveStatus('⚠ 元のファイルに書けませんでした: ' + res.error);
        if (window.MA.toast) window.MA.toast.show('⚠ 元のファイルに書けませんでした: ' + res.error);
      }
    });
    return;
  }
  var cfg = null;
  try { cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfg = null; }
  // 手で押した保存は、本文が開いたときのままでもそのファイルへ書く (利用者が自分で押している)。
  if (doc && window.MA.sourceLock) { try { window.MA.sourceLock.release(doc.id); } catch (e) {} }

  var ST = window.MA.saveTarget;
  // 書き先はそのタブのフォルダ。保存先を替えても、前に開いたタブは開いたファイルへ書く。
  var target = ST ? ST.decide(_cfgForDoc(doc) || cfg, doc, title) : { mode: 'download', name: title };

  if (target.mode === 'file') {
    // saveActiveDoc() が既に書き出しているが、ここでは結果を待って利用者に伝える。
    window.MA.workspace.saveToFile(_withSourceEol(doc), target.dir).then(function(ok) {
      setSaveStatus(ST.messageFor(target, ok));
      if (ok) {
        _afterManualSave(doc, target, true);
        // この保存で中身が別名の図と入れ替わっていないか。サブフォルダの図も同じに見る
        // (道付きの名前で名指しし、直下の同じ名前の図とは別の図として比べる。TICKET-roadmap-20261123-0226-4)
        runSaveSwapCheck(doc && doc.name, doc && doc.dsl, doc);
      }
    });
    return;
  }

  downloadBlob(target.name + '.puml', new Blob([mmdText], { type: 'text/plain' }));
  if (ST) setSaveStatus(ST.messageFor(target, true));
  // ダウンロードした中身を前回保存版にする (書いたファイルと画面の印を食い違わせない)。
  if (doc) _afterManualSave({ id: doc.id, name: doc.name, diagramType: doc.diagramType, dsl: mmdText }, target, false);
  runSaveSwapCheck(doc && doc.name, doc && doc.dsl);
}

// ── 保存の入れ替わり検知 ──────────────────
// 「この保存で図の中身が別名の図と入れ替わっていないか」を保存のその場で言い、
// 保存操作そのものをファイル名込みで控える。判定は src/core/save-swap.js。
//
// 直前の中身は、この画面がその図を最後に保存したときのものを覚えておく
// (server 側の _versions/ は中身は残るが「どの操作で」が残らない)。
var _sswPrev = {};       // 図の居場所 (_diffName) → この画面が最後に保存した中身
var _sswLogOpen = false;

function _sswFolderDocs() {
  // 保存フォルダを読んであれば、その一覧 (直下の図と、rel を持つサブフォルダの図) と突き合わせる。
  // 読んでいないときは開いているタブどうしで突き合わせる (何とも比べずに黙るより手掛かりになる)。
  // どの図と比べるか (直下の図は直下とだけ、サブフォルダの図は道付きで全部と) は saveSwap.placed が決める。
  var all = (_fiFileDocs || []).filter(function(d) { return d && d.name; });
  if (all.some(function(d) { return !d.rel; })) return all;
  return _diffDocs().map(function(d) {
    if (!(d && d.sub && d.dir)) return d;
    return { name: d.name, dsl: d.dsl, rel: _docSubRel(d) || String(d.dir) };
  }).concat(all);
}

function hideSaveSwap() {
  var el = document.getElementById('save-swap-overlay');
  if (el) el.hidden = true;
}

// 「保存の記録」の帯 (一致した組の一覧) は保存した図のもの。
// 別の図に移っても出たままだと図を帯の高さだけ下へ押し、縦に長い図の下の方が画面の外へ
// 出てホバーが届かない。保存時チェックの帯と同じく、次の図を開いたら引っ込める
// (次の保存でまた出る)。記録を自分で開いているときは追跡の最中なので残す。
function hideSaveSwapIfOtherDoc(activeId) {
  var el = document.getElementById('save-swap-overlay');
  if (!el || el.hidden || _sswLogOpen) return;
  if (el.getAttribute('data-doc-id') !== String(activeId)) el.hidden = true;
}

function renderSaveSwapLog() {
  var SS = window.MA.saveSwap;
  var box = document.getElementById('ssw-log');
  if (!SS || !box) return;
  box.hidden = !_sswLogOpen;
  if (!_sswLogOpen) return;
  var esc = window.MA.htmlUtils.escHtml;
  var log = SS.load(_reviewStore(), _wsFileDir());
  if (!log.entries.length) {
    box.innerHTML = '<li>この保存フォルダへの保存の記録はまだありません</li>';
    return;
  }
  var html = '';
  log.entries.forEach(function(e) {
    html += '<li>' + esc(SS.logLine(e)) + '</li>';
  });
  box.innerHTML = html;
}

function renderSaveSwap(res) {
  var SS = window.MA.saveSwap;
  var el = document.getElementById('save-swap-overlay');
  if (!SS || !el) return;
  var esc = window.MA.htmlUtils.escHtml;
  var sum = document.getElementById('ssw-summary');
  var list = document.getElementById('ssw-list');
  if (sum) sum.textContent = res ? SS.summaryLine(res) : '';
  if (list) {
    var html = '';
    if (res) res.lines.forEach(function(t) { html += '<li>' + esc(t) + '</li>'; });
    list.innerHTML = html;
    list.hidden = !html;
  }
  renderTwinRestore(res);
  el.setAttribute('data-warn', res && res.warn ? '1' : '0');
  try {
    var wsA = window.MA.workspace;
    if (wsA) el.setAttribute('data-doc-id', String(wsA.getActiveId()));
  } catch (e) {}
  // 警告が無いときは帯を出さない。ただし記録を開いているなら出したままにする
  // (事故を追っている最中に、次の保存で画面が消えないようにする)。
  el.hidden = !(res && res.warn) && !_sswLogOpen && !_trGroups.length;
  renderSaveSwapLog();
}

// ── 一致した組の一覧と 1 操作の復元 ────────
// save-swap は「いま保存した 1 枚」の相手しか言わない。3 枚が同時に雛形へ落ちた
// primary の事故では、保存した 1 枚を直しても残りが黙って壊れたままになる。
// ここはフォルダ全体の一致した組を並べ、保存した図には「戻す」を 1 つ出す。
// 判定は src/core/twin-restore.js。ここは結線だけ。

var _trGroups = [];      // フォルダ全体で中身が一致した組
var _trPick = null;      // 保存した図の戻し先 { stamp, label, lines }
var _trName = '';        // 戻す対象の図の名指し (サブフォルダの図は道付き)
var _trFile = null;      // 戻す対象のファイル { name, dir } (dir が null なら保存先の直下)

function renderTwinRestore(res) {
  var TR = window.MA.twinRestore;
  var box = document.getElementById('ssw-twins');
  var btn = document.getElementById('btn-ssw-restore');
  if (!TR) return;
  if (box) {
    var esc = window.MA.htmlUtils.escHtml;
    var html = '';
    TR.groupLines(_trGroups).forEach(function(t) { html += '<li>' + esc(t) + '</li>'; });
    box.innerHTML = html;
    box.hidden = !html;
  }
  if (btn) {
    btn.hidden = !_trPick;
    if (_trPick) {
      btn.textContent = TR.restoreLabel(_trPick);
      btn.title = _trName + ' を、上書きされる前のこの版に戻します（保存フォルダにも書き戻します）';
    }
  }
}

// 保存した図の戻し先を `_versions/` の一覧から選ぶ。版が読めない・戻せる版が
// 無いときは何も出さない (中身の分からない版を押し付けない)。
// file: 戻す対象のファイル { name, dir } (サブフォルダの図は版の控えをそのフォルダから読む)。
function _trLoadPick(name, dsl, file) {
  var TR = window.MA.twinRestore, VH = window.MA.versionHistory;
  _trPick = null;
  _trName = String(name == null ? '' : name);
  _trFile = file && file.name ? { name: String(file.name), dir: file.dir || null }
    : { name: _trName, dir: null };
  if (!TR || !VH || !_trName) return Promise.resolve(null);
  var url = '/autosave-versions?dir=' + encodeURIComponent(_trFile.dir || _histDirFor(_trFile.name))
    + '&type=' + encodeURIComponent(_trFile.name);
  return window.fetch(url)
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      _trPick = TR.pickVersion(VH.rows(data), { currentLines: TR.lineCount(dsl) });
      return _trPick;
    })
    .catch(function() { _trPick = null; return null; });
}

// 戻す。エディタ・プレビュー・保存フォルダを 1 手で揃え、undo 1 回で取り消せる
// ようにする (_applyLineEditText が履歴を 1 手だけ積む)。
function restoreTwinDoc() {
  var TR = window.MA.twinRestore;
  if (!TR || !_trPick || !_trName) return;
  var f = _trFile || { name: _trName, dir: null };
  var url = '/autosave-versions?dir=' + encodeURIComponent(f.dir || _histDirFor(f.name))
    + '&type=' + encodeURIComponent(f.name) + '&stamp=' + encodeURIComponent(_trPick.stamp);
  var pick = _trPick, name = _trName;
  window.fetch(url).then(function(r) { return r.ok ? r.text() : null; }).then(function(text) {
    if (text == null) {
      if (window.MA.toast) window.MA.toast.show('この版を読めませんでした');
      return;
    }
    if (!_applyLineEditText(text)) return;
    _trPick = null;
    renderTwinRestore(null);
    if (window.MA.toast) window.MA.toast.show(TR.restoredLine(name, pick));
    appendSaveStatus(TR.restoredLine(name, pick));
  });
}

// 保存のたびに呼ぶ。判定が落ちても保存そのものは成立させる。
// doc: 保存した図 (サブフォルダの図なら dir・sub を持つ)。直前の中身と名指しを居場所で分ける
// (直下とサブフォルダの同じ名前の図を 1 つに混ぜない。TICKET-roadmap-20261123-0226-4)。
function runSaveSwapCheck(docName, dsl, doc) {
  var SS = window.MA.saveSwap;
  if (!SS || !docName) return null;
  var isSub = !!(doc && doc.sub && doc.dir);
  var key = isSub ? _diffName(doc) : docName;
  var rel = isSub ? (_docSubRel(doc) || String(doc.dir)) : '';
  var file = { name: docName, dir: isSub ? doc.dir : null };
  var prev = _sswPrev[key] || null;
  _sswPrev[key] = String(dsl == null ? '' : dsl);

  function evaluate() {
    var res = null;
    var place = SS.placed ? SS.placed({ name: docName, rel: rel }, _sswFolderDocs())
      : { name: docName, folderDocs: _sswFolderDocs() };
    var label = place.name;
    var docs = place.folderDocs;
    try {
      res = SS.inspect({ name: label, dsl: dsl, prev: prev, folderDocs: docs });
    } catch (e) { res = null; }
    // フォルダ全体の一致した組は、保存した図が入っていなくても挙げる
    // (3 枚目に気付けるのはここだけ)。判定が落ちても保存は成立させる。
    try {
      var TR = window.MA.twinRestore;
      _trGroups = TR ? TR.groups(docs.concat([{ name: label, dsl: dsl }])) : [];
    } catch (e) { _trGroups = []; }
    if (!res) { hideSaveSwap(); return null; }
    // 巻き込まれた図にだけ「戻す」を出す。版の一覧は読めてから帯に足す。
    if (_trGroups.length && window.MA.twinRestore
        && window.MA.twinRestore.groupFor(_trGroups, label)) {
      _trLoadPick(label, dsl, file).then(function() {
        try { renderTwinRestore(res); } catch (e) {}
      });
    } else {
      _trPick = null;
    }
    try {
      SS.save(_reviewStore(), _wsFileDir(),
        SS.record(SS.load(_reviewStore(), _wsFileDir()), res,
          new Date().toISOString(), SS.lineCount(dsl)));
    } catch (e) {}
    try { renderSaveSwap(res); } catch (e) {}
    return res;
  }

  // 突き合わせる相手は保存フォルダの全ファイル。入れ替わりの相手は開いていない
  // ことのほうが多い (雛形はふつう開かない) ので、判定の直前に一覧を取り直す。
  if (_fiFolderMode()) {
    loadFolderImpact(true).then(evaluate, evaluate);
    return null;
  }
  return evaluate();
}

function setupSaveSwap() {
  var el = document.getElementById('save-swap-overlay');
  if (el) el.addEventListener('click', function(ev) { ev.stopPropagation(); });
  var close = document.getElementById('btn-ssw-close');
  if (close) close.addEventListener('click', function() {
    _sswLogOpen = false;
    hideSaveSwap();
  });
  var restore = document.getElementById('btn-ssw-restore');
  if (restore) restore.addEventListener('click', function(ev) {
    ev.stopPropagation();
    restoreTwinDoc();
  });
  var log = document.getElementById('btn-ssw-log');
  if (log) log.addEventListener('click', function() {
    _sswLogOpen = !_sswLogOpen;
    if (el) el.hidden = false;
    renderSaveSwapLog();
  });
}

// 保存の結果をステータスバーに数秒だけ出す。押しても何も起きないように
// 見える状態を作らないための表示で、通常の自動保存表示は上書きしない。
var _saveStatusTimer = null;
// 下端は 1 行。見せるのは短い形 (ファイル名に保存 · 衝突なし)
// で、パス・内訳を含む全文は title と、読み上げ・テキストとして取れる隠れた span に残す
// (全文を下端に出すと、パース OK や件数が語の途中で 2 行に折れていた)。
function setSaveStatus(msg) {
  var el = document.getElementById('status-save-result');
  if (!el || !msg) return;
  var AS = window.MA.autosaveStatus;
  var short = (AS && AS.shortResult) ? AS.shortResult(msg) : msg;
  el.textContent = '';
  var vis = document.createElement('span');
  vis.className = 'ssr-short';
  vis.setAttribute('aria-hidden', 'true');
  vis.textContent = short || msg;
  var full = document.createElement('span');
  full.className = 'ssr-full';
  full.textContent = msg;
  el.appendChild(vis);
  el.appendChild(full);
  el.setAttribute('data-full', msg);
  el.title = msg;
  if (_saveStatusTimer) clearTimeout(_saveStatusTimer);
  _saveStatusTimer = setTimeout(function() {
    el.textContent = '';
    el.removeAttribute('data-full');
    el.title = '';
  }, 6000);
}

// 保存の直後に出した「どこに書いたか」の後ろへ、突合の結果を足す。
// 保存先の文言は保存が成立したことの唯一の手掛かりなので、上書きしない。
function appendSaveStatus(msg) {
  var el = document.getElementById('status-save-result');
  if (!el || !msg) return;
  var cur = el.getAttribute('data-full') || '';
  setSaveStatus(cur ? cur + ' ／ ' + msg : msg);
}

// ── Export ─────────────────────────────────────────────────────────────────
// 1 枚書き出しの名前は .puml の保存名 (図の名前) に揃える。
// title を使うと spi_state.puml の隣に「SPI ドライバ 状態遷移.svg」が並び、
// 一覧でどれとどれが対か名前だけでは分からなくなる。
function exportFileName(ext) {
  var doc = null;
  try { doc = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { doc = null; }
  var meta = currentParsed && currentParsed.meta;
  var EN = window.MA.exportName;
  if (!EN) return ((meta && meta.title) || 'untitled') + '.' + ext;
  return EN.fileName(doc, meta, ext);
}

// ── 書き出しは押した図の今の本文の図を書く (TICKET-roadmap-20261123-0857-2 / MA.exportWait) ──────────
// プレビューの絵がどのタブのどの本文の図か (描き直しが届いたときに控える)。
var _previewPic = null;      // { key, text }
var _pendingExport = null;   // { key, text, run } 描き直しを待っている書き出し (1 つだけ。押し直したら後の方)
function _exportWhenDrawn(run) {
  var EW = window.MA.exportWait;
  if (!EW) { run(); return; }
  var key = _activeDocKey();
  var st = EW.decide({ hasSvg: !!previewSvgEl.querySelector('svg'), pic: _previewPic, key: key, text: mmdText, verdict: _engineVerdict });
  if (st === 'now') { _pendingExport = null; run(); return; }
  if (st === 'error') { _pendingExport = null; setSaveStatus('⚠ ' + EW.ERROR_MSG); return; }
  _pendingExport = { key: key, text: mmdText, run: run };
  setSaveStatus(EW.WAIT_MSG);
  var el = document.getElementById('status-save-result');
  if (el) el.setAttribute('data-export-waiting', '1');
  // 描き直しが予約されていなければ頼む (図を開いた直後など)。
  scheduleRefresh();
}
// 描き直しが届いた・描けなかったときに呼ぶ (renderSvg)。
function _flushPendingExport(ok, renderKey, renderText) {
  var p = _pendingExport;
  var EW = window.MA.exportWait;
  if (!p || !EW) return;
  var r = EW.onRendered(p, { ok: ok, key: renderKey, text: renderText, activeKey: _activeDocKey(), activeText: mmdText });
  if (r === 'keep') return;
  _pendingExport = null;
  var el = document.getElementById('status-save-result');
  if (el) el.removeAttribute('data-export-waiting');
  if (r === 'run') { p.run(); return; }
  setSaveStatus('⚠ ' + (r === 'cancel' ? EW.CANCEL_MSG : EW.ERROR_MSG));
}

function exportSVG() { _exportWhenDrawn(_exportSvgNow); }
function _exportSvgNow() {
  var svgEl = previewSvgEl.querySelector('svg');
  if (!svgEl) return;
  var clone = svgEl.cloneNode(true);
  var svgOut = new XMLSerializer().serializeToString(clone);
  // 画面に入れた時点で `<?plantuml-src …?>` はコメントに
  // 化けており、畳んだ文字列に `--` があると保存した svg が XML として壊れる。
  // 埋め込みは差分・突き合わせが読むので落とさず、元の処理命令に戻す。
  // TICKET-reviewer-20261115-2300: プレビューの整えで落ちた PlantUML の背景 (既定は白) も根に戻す。
  // 透明の図 (skinparam backgroundColor transparent) は控えが空なので透明のまま。
  if (window.MA.svgExport) svgOut = window.MA.svgExport.forSave(svgOut, svgEl.__puaBackground);
  deliverExport('svg', exportFileName('svg'),
    new Blob([svgOut], { type: 'image/svg+xml' }));
}

// ── 書き出しを保存先の中へ (TICKET-primary-20261115-2240-wish) ──────────────────
// 保存先から開いた図の書き出しは、ブラウザのダウンロードではなく保存先の中 (既定は図と同じフォルダ、
// 替えた置き場は保存先の下の別のフォルダ) に図の名前で書き、どこに・何という名前で・何バイト・新規か上書きかを出す。
// 保存先の無い図 (Import ▾ で開いただけの図・保存前の新しい図・ブラウザ内保存) は今までどおりダウンロード。
// .puml・本文・設定には触らない (server は押した 1 ファイルだけを書く)。
function _exportTarget() {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (!cfg || cfg.backend !== 'file') return null;
    var WS = window.MA.workspace;
    var doc = WS ? WS.getActive() : null;
    if (!doc || !doc.name || _sourcePathOf(doc.id)) return null;
    if (WS.isValidName && !WS.isValidName(doc.name)) return null;
    var dir = _docDir(doc);
    if (!dir) return null;
    // TICKET-owner-20261122-2242-1: サブフォルダの図は、保存先から見た図のフォルダの道 (folder) と保存先 (root) も持つ。
    // 置き場は図のフォルダ (dir) ごとに覚える。画面はサブフォルダを「保存先」と呼ばず、保存先と図のフォルダを分けて言う。
    var FP = window.MA.filesPanel;
    var root = (FP && FP.subRoot && FP.subRoot()) || _wsFileDir() || dir;
    return { dir: String(dir), name: String(doc.name), folder: _docSubRel(doc), root: String(root) };
  } catch (e) { return null; }
}

function _exportStorage() {
  try { return window.localStorage; } catch (e) { return null; }
}

var _lastExport = null;   // { dir, name, msg } 前回保存先へ書いた結果 (Export ▾ の行に出す)

// Export ▾ を開くたびに、今の図の書き出し先と前回の結果を書き直す (保存先の無い図では行を出さない)。
function refreshExportDest() {
  var box = document.getElementById('export-dest');
  if (!box) return;
  var ED = window.MA.exportDest;
  var t = _exportTarget();
  if (!t || !ED) { box.hidden = true; return; }
  box.hidden = false;
  var sub = ED.loadSub(_exportStorage(), t.dir);
  var place = document.getElementById('export-dest-place');
  if (place) { place.textContent = ED.placeLabel(sub, t.folder); place.title = ED.slashPath(t.dir) + (sub ? '/' + sub : ''); }
  var last = document.getElementById('export-dest-last');
  if (last) {
    var mine = _lastExport && _lastExport.dir === t.dir && _lastExport.name === t.name ? _lastExport : null;
    last.textContent = mine ? '前回: ' + mine.msg : '';
  }
  _refreshExportStale(t, sub);
}

// TICKET-junior-20261122-1520-wish: 置き場の SVG / PNG / 透過 PNG が、保存後に直した本文 (保存先の .puml) より
// 古いかを「書き出し先:」の行に語で出す。判定は server がディスクの更新時刻で行う (読むだけ。何も書かない)。
// 古いものが無ければ何も出さない。書き出し直すと deliverExport が行を書き直すので消える。
var _exportStaleSeq = 0;
function _refreshExportStale(t, sub) {
  var el = document.getElementById('export-dest-stale');
  var ED = window.MA.exportDest;
  if (!el || !ED || !ED.statusUrl || !window.fetch) return;
  var seq = ++_exportStaleSeq;
  fetch(ED.statusUrl(t.dir, t.name, sub))
    .then(function(r) { return r.ok ? r.json() : null; })
    .catch(function() { return null; })
    .then(function(res) {
      if (seq !== _exportStaleSeq) return;   // 後から開き直した回の答えを古い答えで上書きしない
      var cur = _exportTarget();
      if (!cur || cur.dir !== t.dir || cur.name !== t.name) { el.textContent = ''; return; }
      el.textContent = ED.staleLabel(res);
    });
}

function deliverExport(kind, downloadName, blob) {
  var ED = window.MA.exportDest;
  var t = _exportTarget();
  if (!t || !ED || !window.fetch) { downloadBlob(downloadName, blob); return Promise.resolve(null); }
  var sub = ED.loadSub(_exportStorage(), t.dir);
  return fetch(ED.url(t.dir, t.name, kind, sub), {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob,
  }).then(function(r) {
    return r.json().catch(function() { return {}; }).then(function(j) { return { status: r.status, j: j || {} }; });
  }).then(function(res) {
    if (res.status === 200 && res.j.ok) {
      var msg = ED.message(res.j, sub, t.folder);
      _lastExport = { dir: t.dir, name: t.name, msg: msg, res: res.j };
      setSaveStatus(msg);
      var el = document.getElementById('status-save-result');
      if (el) {
        el.setAttribute('data-export-path', res.j.path || '');
        el.setAttribute('data-export-bytes', String(res.j.bytes || 0));
        el.setAttribute('data-export-existed', res.j.existed ? '1' : '0');
        // 何回目の書き出しか (同じ図を続けて書き出しても、前の回の表示と取り違えない)。
        el.setAttribute('data-export-seq', String(Number(el.getAttribute('data-export-seq') || 0) + 1));
      }
      refreshExportDest();
      return res.j;
    }
    // その図が保存先に無い (保存前の新しい図) ときは今までどおりダウンロード。
    if (res.j && res.j.fallback) { downloadBlob(downloadName, blob); return null; }
    setSaveStatus('⚠ 書き出せませんでした: ' + (res.j.error || ('HTTP ' + res.status)));
    return null;
  }).catch(function(err) {
    setSaveStatus('⚠ 書き出せませんでした: ' + (err && err.message ? err.message : err));
    return null;
  });
}

// 「替える…」: 保存先の下のフォルダを選ぶ窓。今のフォルダ (図と同じ) か、その下のフォルダか、名前を打った新しいフォルダ。
// 選ぶだけでは何も書かない (フォルダは次の書き出しで作る)。Esc・やめるで変えずに閉じる。
function _closeExportDestPick() {
  var m = document.getElementById('export-dest-pick');
  if (m && m.parentNode) m.parentNode.removeChild(m);
}
function openExportDestPick() {
  _closeExportDestPick();
  var ED = window.MA.exportDest;
  var t = _exportTarget();
  if (!t || !ED) return null;
  var storage = _exportStorage();
  var cur = ED.loadSub(storage, t.dir);
  var m = document.createElement('div');
  m.id = 'export-dest-pick';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', '書き出し先のフォルダを選ぶ');
  var box = document.createElement('div');
  box.className = 'edp-box';
  var h = document.createElement('div');
  h.className = 'edp-title';
  h.textContent = '書き出し先のフォルダを選ぶ';
  var curEl = document.createElement('div');
  curEl.className = 'edp-cur';
  // 「保存先:」は保存先のフォルダを指す (サブフォルダの図でも図のフォルダを保存先と呼ばない)。区切りは / に揃える。
  curEl.textContent = '保存先: ' + ED.slashPath(t.root) +
    (t.folder ? ' ／ この図のフォルダ: ' + t.folder : '') +
    ' ／ 今の書き出し先: ' + ED.placeLabel(cur, t.folder);
  var note = null;
  if (t.folder) {
    note = document.createElement('div');
    note.className = 'edp-cur';
    note.id = 'export-dest-note';
    note.textContent = '書き出し先は図のフォルダごとに覚えます（保存先の直下の図で替えた書き出し先は、この図には効きません）';
  }
  var row = document.createElement('div');
  row.className = 'edp-row';
  var input = document.createElement('input');
  input.type = 'text';
  input.id = 'export-dest-new';
  input.spellcheck = false;
  input.placeholder = '新しいフォルダの名前 (例: out)';
  input.setAttribute('aria-label', '保存先の下に作る書き出し先のフォルダの名前');
  var ok = document.createElement('button');
  ok.type = 'button';
  ok.id = 'export-dest-new-ok';
  ok.textContent = 'このフォルダにする';
  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'export-dest-cancel';
  cancel.textContent = 'やめる';
  row.appendChild(input); row.appendChild(ok); row.appendChild(cancel);
  var list = document.createElement('div');
  list.className = 'edp-list';
  list.id = 'export-dest-list';
  var msg = document.createElement('div');
  msg.className = 'edp-msg';
  msg.id = 'export-dest-msg';
  box.appendChild(h); box.appendChild(curEl); if (note) box.appendChild(note);
  box.appendChild(list); box.appendChild(row); box.appendChild(msg);
  m.appendChild(box);
  document.body.appendChild(m);

  function choose(sub) {
    var n = ED.saveSub(storage, t.dir, sub);
    if (n === null) {
      msg.textContent = '⚠ 保存先の下のフォルダの名前を入れてください (.. や . で始まる名前・\\ / 以外の記号 < > : " | ? * は使えません)';
      input.focus();
      return;
    }
    _closeExportDestPick();
    refreshExportDest();
    setSaveStatus('書き出し先を ' + ED.placeLabel(n, t.folder) + ' にしました');
  }
  function addChoice(label, sub) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'edp-choice';
    b.setAttribute('data-sub', sub);
    if (sub === cur) b.setAttribute('aria-current', 'true');
    b.textContent = label;
    b.addEventListener('click', function() { choose(sub); });
    list.appendChild(b);
  }
  addChoice(ED.sameFolderChoice(t.folder), '');
  var FB = window.MA.folderBrowse;
  if (FB && window.fetch) {
    fetch(FB.browseUrl(t.dir)).then(function(r) { return r.ok ? r.json() : null; }).then(function(data) {
      if (!document.body.contains(m)) return;
      var v = FB.view(data);
      (v && v.ok ? v.dirs : []).forEach(function(d) {
        if (ED.normSub(d.name)) addChoice(ED.subChoice(d.name, t.folder), d.name);
      });
    }).catch(function() {});
  }
  ok.addEventListener('click', function() {
    var v = String(input.value || '').trim();
    if (!v) { msg.textContent = '⚠ フォルダの名前を入れるか、上の一覧から選んでください'; input.focus(); return; }
    choose(v);
  });
  cancel.addEventListener('click', _closeExportDestPick);
  m.addEventListener('mousedown', function(e) { if (e.target === m) _closeExportDestPick(); });
  m.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _closeExportDestPick(); }
    else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); ok.click(); }
  });
  input.focus();
  return m;
}
window.openExportDestPick = openExportDestPick;

// 図が増えるほど「タブ切替 → Export → SVG」の 3 クリックが
// 枚数分積み上がっていた。ここではタブを切り替えず、各ドキュメントの DSL を /render に
// 直接投げて保存するので、何枚でも Export を開く → この項目を押す の 2 クリックで済む。
// 保存はブラウザの複数ダウンロードを 1 件ずつ直列に走らせる。
// dir は相対の !include を探す起点 (その図の .puml のあるフォルダ)。
// 渡さなければ今の保存先 (保存フォルダの図を描き直す経路が大半のため)。
function renderDslToSvg(dsl, dir) {
  var mode = (document.getElementById('render-mode') || {}).value || 'local';
  var body = { text: dsl, mode: mode };
  var base = (dir === undefined || dir === null) ? _renderSaveDir() : dir;
  if (base) body.dir = base;
  return fetch('/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function(resp) {
    if (!resp.ok) {
      return resp.json().then(function(err) { throw new Error(err.error || ('HTTP ' + resp.status)); });
    }
    return resp.text();
  });
}

function browserDownload(filename, blob) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
}


// アプリ版 (pywebview) にはブラウザのダウンロード先が無く、
// a[download] を押しても何も起きない。アプリ版のときだけネイティブの保存ダイアログに
// 回し、断られた・使えないときは従来どおりダウンロードに落ちる (Web 版は素通り)。
function downloadBlob(filename, blob) {
  var AB = window.MA && window.MA.appBridge;
  if (!AB || !AB.isApp() || typeof FileReader !== 'function') {
    browserDownload(filename, blob);
    return;
  }
  var fr = new FileReader();
  fr.onload = function() {
    var b64 = String(fr.result || '').split(',')[1] || '';
    AB.nativeSave(filename, { base64: b64 }).then(function(res) {
      if (res && res.fallback) browserDownload(filename, blob);
      else if (res && res.path) setSaveStatus(res.path + ' に書き出しました');
    });
  };
  fr.onerror = function() { browserDownload(filename, blob); };
  fr.readAsDataURL(blob);
}



function svgToCanvas(transparent, callback) {
  var svgEl = previewSvgEl.querySelector('svg');
  if (!svgEl) return;
  var clone = svgEl.cloneNode(true);
  // PlantUML が末尾に埋める <?plantuml-src ...?> は
  // innerHTML を通るとコメントに化け、中身に `--` があると XML として壊れる。
  // 描画に関わらないので書き出す前に落とす。
  if (window.MA.svgExport) window.MA.svgExport.stripNonRendered(clone);
  var w = parseFloat(clone.getAttribute('width')) || 800;
  var h = parseFloat(clone.getAttribute('height')) || 400;
  var svgData = new XMLSerializer().serializeToString(clone);
  var img = new Image();
  img.onload = function() {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, w, h);
    callback(canvas);
  };
  img.onerror = function() {
    // 「SVG読み込みエラー」だけで終わらせず、何が読めなかったかを名指しする。
    var why = window.MA.svgExport ? window.MA.svgExport.reasonFor(svgData) : '';
    alert('PNG エクスポートに失敗しました' + (why ? '\n' + why : ' (SVG 読み込みエラー)'));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
}

function exportPNG(transparent) { _exportWhenDrawn(function() { _exportPngNow(transparent); }); }
function _exportPngNow(transparent) {
  svgToCanvas(transparent, function(canvas) {
    canvas.toBlob(function(blob) {
      if (!blob) return;
      deliverExport(transparent ? 'png-transparent' : 'png', exportFileName('png'), blob);
    });
  });
}

// ── 保存先の一覧で印を付けた図をまとめて書き出す (TICKET-roadmap-20261122-0855-5) ──────────
// 1 枚ずつの書き出し (deliverExport) と同じ置き場 (保存先ごとに覚えた書き出し先)・同じ名前 ({名前}.svg /
// {名前}.png / {名前}.transparent.png) で、印を付けた図を一覧の並びのまま 1 枚ずつ描いて保存先へ書く。
// タブは開かず、今の図・本文・.puml には触れない。描けない図 (PlantUML の文法エラー) は書かずに名前を返す
// (空の画像・直前の図を書かない)。zip・控えは作らない。

// server が描いた SVG の文字列を、画面の図と同じ整え (寸法を属性へ・style を外す・埋め込みの元 DSL を落とす) にする。
function _svgTextForImage(svgText) {
  var doc = null;
  try { doc = new DOMParser().parseFromString(String(svgText || ''), 'image/svg+xml'); } catch (e) { doc = null; }
  var root = doc && doc.documentElement;
  if (!root || String(root.nodeName).toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  var size = normalizeSvgSize(root);
  if (window.MA.svgExport) window.MA.svgExport.stripNonRendered(root);
  return { text: new XMLSerializer().serializeToString(root), w: size.w, h: size.h };
}

// SVG の文字列を PNG の Blob にする (1 枚ずつの svgToCanvas と同じく、透過でなければ白で塗ってから描く)。
function _svgTextToPngBlob(svgText, transparent) {
  return new Promise(function(resolve) {
    var s = _svgTextForImage(svgText);
    if (!s) { resolve(null); return; }
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = s.w;
      canvas.height = s.h;
      var ctx = canvas.getContext('2d');
      if (!transparent) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, s.w, s.h);
      canvas.toBlob(function(blob) { resolve(blob || null); });
    };
    img.onerror = function() { resolve(null); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.text);
  });
}

// その図の本文。保存先の直下の図をタブで開いていればタブの本文 (1 枚ずつの書き出しと同じく、画面の図を書く)、
// 開いていなければ保存先のファイル。
function _batchExportDsl(name, dir) {
  var WS = window.MA.workspace;
  var doc = WS && WS.findByName ? WS.findByName(name) : null;
  if (doc && (!WS.dirOf || !WS.samePath || WS.samePath(WS.dirOf(doc.id, dir), dir))) {
    var act = WS.getActive();
    if (act && act.id === doc.id && editorEl) return Promise.resolve(editorEl.value);
    if (typeof doc.dsl === 'string') return Promise.resolve(doc.dsl);
  }
  return WS ? WS.loadFile(name, dir) : Promise.resolve(null);
}

function _batchExportOne(name, dir, kind, sub) {
  var ED = window.MA.exportDest;
  function fail(why) { return { name: name, ok: false, error: why }; }
  return _batchExportDsl(name, dir).then(function(dsl) {
    if (dsl == null || !String(dsl).trim()) return fail('読めません');
    return renderDslToSvg(String(dsl), dir).then(function(svg) {
      if (!svg || String(svg).indexOf('<svg') < 0) return fail('描けません');
      var made = kind === 'svg'
        ? Promise.resolve(new Blob([String(svg)], { type: 'image/svg+xml' }))
        : _svgTextToPngBlob(svg, kind === 'png-transparent');
      return made.then(function(blob) {
        if (!blob || !blob.size) return fail('画像にできません');
        return fetch(ED.url(dir, name, kind, sub), {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob,
        }).then(function(r) {
          return r.json().catch(function() { return {}; }).then(function(j) {
            if (r.status === 200 && j && j.ok) return { name: name, ok: true, res: j };
            return fail((j && j.error) || ('HTTP ' + r.status));
          });
        });
      });
    }, function() { return fail('描けません'); });
  }).catch(function(e) { return fail(String((e && e.message) || e || '書けません')); });
}

// names を一覧の並びのまま 1 枚ずつ書く。onStep(i, n) で進み具合を返す。
// 結果は { results: [{ name, ok, error?, res? }], sub, msg }。
function exportManyToFolder(names, kind, dir, onStep) {
  var ED = window.MA.exportDest;
  if (!ED || !dir || !window.fetch) return Promise.resolve(null);
  var sub = ED.loadSub(_exportStorage(), dir);
  var list = (names || []).slice();
  var results = [];
  function step(i) {
    if (i >= list.length) {
      return { results: results, sub: sub, msg: ED.batchMessage(results, kind, sub) };
    }
    if (onStep) { try { onStep(i, list.length); } catch (e) {} }
    return _batchExportOne(list[i], dir, kind, sub).then(function(r) { results.push(r); return step(i + 1); });
  }
  return Promise.resolve().then(function() { return step(0); });
}
window.exportManyToFolder = exportManyToFolder;

function exportClipboard() {
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert('クリップボード API が利用できません');
    return;
  }
  svgToCanvas(false, function(canvas) {
    canvas.toBlob(function(blob) {
      if (!blob) return;
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(function(err) {
        alert('クリップボードコピー失敗: ' + err);
      });
    });
  });
}

// 指定の行へ飛ぶ。エディタのキャレットをその行に置き、行が見えるまでスクロールする。
function jumpToLine(line) {
  if (!editorEl || !line) return;
  var r = window.MA.lineResolver.caretRangeForLine(editorEl.value, line - 1);
  if (!r) return;
  editorEl.focus();
  editorEl.selectionStart = r.start;
  editorEl.selectionEnd = r.end;
  editorEl.scrollTop = Math.max(0, (line - 3) * 18);
}

// ── Render pipeline ────────────────────────────────────────────────────────
function scheduleRefresh() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(refresh, RENDER_DEBOUNCE_MS);
  pinPreviewIfEdited();
  syncEditedText();
}

// 本文を書き換えた後始末の 1 本道。本文欄で打っても、フォーム・選択パネル・
// 窓・一括操作・元に戻すで書き換えても、本文を書き換えた側は mmdText を入れて scheduleRefresh() を
// 呼ぶ (ctx.onUpdate もそれ)。ここでタブの本文 (workspace)・自動保存・タブの印・上部バーの保存状態を
// 同じ時にそろえて追わせる。経路を図種ごとに足さない。判定は MA.textSync (タブを替えた・開いただけは書かない)。
var _textSyncLast = null;
function syncEditedText() {
  var WS = window.MA.workspace;
  var TS = window.MA.textSync;
  if (!WS || !TS) return;
  var doc = null;
  try { doc = WS.getActive(); } catch (e) { doc = null; }
  var d = TS.decide(_textSyncLast, doc, mmdText);
  _textSyncLast = d.next;
  if (d.writeDoc) {
    try { WS.updateActive({ dsl: mmdText, diagramType: currentDiagramType }); } catch (e) {}
  }
  if (!d.save) return;
  // 自動保存より **前** に workspace を書き戻すこと (自動保存は書き先を
  // 決めるのに「タブの本文が開いたときから変わったか」を見る)。
  if (window.MA.autoSave) {
    try { window.MA.autoSave.scheduleSave(currentDiagramType, mmdText); } catch (e) {}
  }
  // 前回保存時点との差分 (タブの ● ・上部バーの保存・下端の差分) を追従させる。
  try { renderDiffBadge(); } catch (e) {}
  // 前回保存版との ＋a −b は、保存を押す前に気付けることが値打ち。
  try { renderLiveDiffChip(); } catch (e) {}
  // Git のコミットを並べている間は、作業中との色付けも追う (design 10c)。
  try { if (window.MA.appGit) window.MA.appGit.refreshDiff(); } catch (e) {}
  // 今の本文をタブ (workspace) に控える。以前は下端の「整合」の札を数え直すついでに
  // ここで控えていて、右パネルのフォームだけで足した行もこれでタブ・自動保存・タブの印に届いていた。
  // 札は TICKET-owner-20261115-1841-prune で外したので、控えだけを明示して残す。
  try { saveActiveDoc(); } catch (e) {}
}

// 本文を入れ替えたが利用者の編集ではない経路 (図種の切り替えで見本・下書きを入れた) が、
// 次の scheduleRefresh で自動保存に載らないよう、今の本文を基準として控える。
function markTextSynced() {
  var WS = window.MA.workspace;
  var TS = window.MA.textSync;
  if (!WS || !TS) return;
  var doc = null;
  try { doc = WS.getActive(); } catch (e) { doc = null; }
  _textSyncLast = TS.baseline(doc, mmdText);
}

// 仮のタブで本文や図を 1 か所でも直したら、その場で固定のタブにする
// (次の 1 回押しで入れ替わって、直した中身がタブ列から消えない)。
function pinPreviewIfEdited() {
  var WS = window.MA.workspace;
  if (!WS || !WS.pin) return;
  var d = WS.getActive();
  if (!d || !d.preview || String(mmdText) === String(d.dsl)) return;
  WS.pin(d.id);
  try { renderTabs(); } catch (e) {}
}

// 本文から決まった図種を、図種を名乗る所 (currentDiagramType・上端の図種欄・
// 左レール・ズームの帯・タブ) にそろえる。本文は書き換えない (図種欄の change は鳴らさない。
// 鳴らすと図種の切り替えとして本文が見本や下書きに入れ替わる)。
// 起動時の復元 (bootRestore) が本文から図種を当てるときと同じそろえ方。
function _adoptDetectedType(t) {
  if (!t || t === currentDiagramType || !modules[t]) return;
  currentDiagramType = t;
  var sel = document.getElementById('diagram-type');
  if (sel) sel.value = t;
  if (window.MA.workspace) {
    try { window.MA.workspace.updateActive({ diagramType: t }); } catch (e) {}
  }
  try { syncRail(); } catch (e) {}
  try { syncZoomHud(); } catch (e) {}
  try { if (typeof renderTabs === 'function') renderTabs(); } catch (e) {}
}

function refresh() {
  updateLineNumbers();
  updateUndoRedoButtons();
  // 参照ペインを開いたままタブを切り替えたら、選択肢と中身を追随させる
  // (今編集しているタブは参照の候補から外れる)。
  if (_compareOpen) renderCompareView();
  var detectedType = window.MA.parserUtils.detectDiagramType(mmdText);
  // `actor A` しか無い段階では図種を当てられない。空のシーケンス図に参加者を
  // 1 人足した直後に UseCase へ載せ替わると「末尾に追加」ペインごと消えて、
  // 2 人目が足せなくなっていた。決め手が出るまでは選んである図種を保つ。
  if (window.MA.parserUtils.isAmbiguousType(mmdText) && modules[currentDiagramType]) {
    detectedType = currentDiagramType;
  }
  // 直前の描画で PlantUML が別の図種と言った DSL は、その図種で読む
  // (手続きで宣言した部品の図を毎回シーケンスで読み直して、描画のたびに右パネルが入れ替わらないように)。
  if (_svgKindFix && _svgKindFix.from === detectedType && modules[_svgKindFix.to]) {
    detectedType = _svgKindFix.to;
  }
  var mod = detectedType ? modules[detectedType] : null;
  if (mod) currentModule = mod;
  // 右パネルと下端の件数が本文の図種に替わるなら、
  // ズームの帯・左レール・上端の図種欄・タブの図種も同じ図種にそろえる。
  if (mod) _adoptDetectedType(detectedType);

  try {
    currentParsed = currentModule.parse(mmdText);
    statusParseEl.textContent = 'パース OK';
    statusParseEl.classList.remove('error');
    statusParseEl.setAttribute('data-dot', 'ok');
  } catch (e) {
    statusParseEl.textContent = 'パース NG · ' + e.message;
    statusParseEl.classList.add('error');
    statusParseEl.setAttribute('data-dot', 'bad');
    currentParsed = { meta: {}, elements: [], relations: [], groups: [] };
  }
  // design 1a/4a/4b/4c: 下端で何を数えるかは図種で変わる (3 classes · 2 relations /
  // 3 actions · 1 branch / 2 states · 4 transitions)。Activity / State のパーサは
  // elements / relations を持たないので、モジュールの戻り値を直接数えると
  // どちらも常に 0 になっていた。構造タブと同じ outline.countLabel で数えて、
  // 同じ図の 2 か所に違う数が出ないようにする。
  // 展開が手元にある本文は、マクロを呼んだ行を展開後の行に差し替えた本文で数える。
  var _PE = window.MA.preprocExpand;
  statusInfoEl.textContent = window.MA.outline.countLabel(
    window.MA.outline.build((_PE && _PE.has(mmdText) && _PE.splicedText(mmdText)) || mmdText).counts,
    detectedType || currentDiagramType);

  // 右パネルの反映の後も、直した要素 (同じ行) を選んだままにする。
  try { _applySelectionCarry(); } catch (e) { _selCarry = null; }
  if (_propsNeedRebuild()) renderProps(currentParsed);
  syncStateTable();
  renderSvg();
}

// ── 図の設定タブ ───────────────────────────────
// 色・文字サイズ・テーマ・タイトルを変える経路が DSL の手書きしか無かった。
// 右パネルに常設のタブを置き、選ぶとその場で DSL 先頭に skinparam / title が
// 書き込まれ、書き込まれる行も同じ画面に出す。
var dsSettings = null;
// 隣のフォルダの同名ドメインと同一 / 別物を宣言する欄は TICKET-owner-20261115-2141-prune で外した。
// 既にある `' domain-verdict:` の行はただのコメントとして読み、書き換えない。

function dsApplyToDsl() {
  var ds = window.MA.diagramSettings;
  var next = ds.apply(mmdText, dsSettings, currentDiagramType);
  if (next === mmdText) return;
  if (window.MA.history) window.MA.history.pushHistory();
  mmdText = next;
  suppressSync = true;
  editorEl.value = next;
  suppressSync = false;
  scheduleRefresh();
}

function dsSet(patch) {
  for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) dsSettings[k] = patch[k];
  dsApplyToDsl();
  renderDiagramSettings(true);
}

// ── 図名 (= ファイル名) の付け替え ─────────────────────────────────────────
// 名前を変えると、前の名前のファイルは保存フォルダに
// 残る。そこに「名前を変える直前の自動保存」が入っていることがあるので
// (前周の完了物が今回の編集で上書きされる)、戻せる版があるなら戻す口を出す。

var _dsRenameNotice = null;      // { text, canRestore, from, dsl }

function _dsActiveDocName() {
  try {
    var ws = window.MA.workspace;
    if (!ws) return '';
    var id = ws.getActiveId();
    var hit = '';
    ws.list().forEach(function(d) { if (d.id === id) hit = d.name; });
    return hit;
  } catch (e) { return ''; }
}

function _dsShowRenameNotice(el) {
  var n = _dsRenameNotice;
  if (!el || !n) return;
  el.hidden = false;
  el.textContent = '';
  var msg = document.createElement('span');
  msg.id = 'ds-name-notice-text';
  msg.textContent = n.text;
  el.appendChild(msg);
  if (!n.canRestore) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-ds-name-restore';
  btn.textContent = '↩ ' + n.from + ' を直前の版に戻す';
  btn.addEventListener('click', function() {
    var ws = window.MA.workspace;
    if (!ws) return;
    btn.disabled = true;
    ws.saveToFile({ name: n.from, dsl: n.dsl }, _wsFileDir()).then(function(ok) {
      msg.textContent = ok
        ? n.from + ' を直前の版に戻しました'
        : n.from + ' を戻せませんでした (保存フォルダを確かめてください)';
      if (ok) { btn.remove(); _dsRenameNotice = null; }
      else btn.disabled = false;
    });
  });
  el.appendChild(btn);
}

// ── 改名の後始末 ────────────────────────────────
// 前の名前のファイルが今の図そのものなら、それは改名であって複製ではない。
// 新しい名前で書いてから前の名前を消す。中身が違うなら別物なので残し、
// rename-guard の知らせ (戻す口) に任せる。
// 返り値は Promise<文字列 or ''> で、呼び出し側が知らせに出す。
// out (任意) には決めた処置 (out.action = 'none' | 'move' | 'keep') を入れて返す。
function _sweepRenamedFile(from, to, dsl, out) {
  var ws = window.MA.workspace;
  var RS = window.MA.renameSweep;
  if (!ws || !RS) return Promise.resolve('');
  var cfg = null;
  try { cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfg = null; }
  var saved = !!(cfg && cfg.backend === 'file');
  if (!saved) return Promise.resolve('');
  var dir = _wsFileDir();
  var body = String(dsl == null ? '' : dsl);
  // 直前の編集 (タイトル欄など) の自動保存がまだ待っていると、
  // それは前の名前で後から書かれ、付け替えた後に前の名前のファイルが同じ中身で戻ってくる。
  // 先に書き切らせてから前の名前のファイルを読む (書き切った中身は今の図と同じなので付け替えになる)。
  var AS = window.MA.autoSave;
  var settled = (AS && AS.settle) ? AS.settle() : null;
  return Promise.resolve(settled).then(function() {
    return ws.loadFile(from, dir);
  }).then(function(oldDsl) {
    var p = RS.plan({ from: from, to: to, saved: true, oldDsl: oldDsl, currentDsl: body });
    if (out && p) out.action = p.action;
    if (!p || p.action === 'none') return '';
    if (p.action === 'keep') return p.text;
    return Promise.resolve(ws.saveToFile({ name: to, dsl: body }, dir)).then(function(ok) {
      if (!ok) return RS.resultText(p, { saved: false });
      return Promise.resolve(ws.deleteFile(from, dir)).then(function(r) {
        return RS.resultText(p, { saved: true, deleted: !!(r && r.ok), error: (r && r.error) || '' });
      });
    });
  }).catch(function() { return ''; });
}

// 図の設定から名前を変える。保存はしない (保存すると前の名前のファイルに
// 今の内容が入ってしまう。事故の元がまさにそれ)。
function _dsRenameActive(next) {
  var ws = window.MA.workspace;
  var RG = window.MA.renameGuard;
  if (!ws) return null;
  var from = _dsActiveDocName();
  var to = String(next == null ? '' : next).trim();
  // 同じ名前で確定し直したときは、直前の名前変更の知らせを消さない
  // (input の change は fill と blur の両方で飛ぶので、2 度目で消すと
  // 「戻す」ボタンが出た直後に消える)。
  if (!to || to === from) { renderDiagramSettings(true); return null; }
  if (!ws.isValidName(to)) {
    _dsRenameNotice = { text: ws.nameRuleText(), canRestore: false, from: from, dsl: '' };
    renderDiagramSettings(true);
    return null;
  }
  // サブフォルダの図の名前はまだ変えない (付け替えは保存先の直下を相手にする。promptRenameDoc と同じ門)。
  var actDoc = ws.getActive ? ws.getActive() : null;
  if (actDoc && actDoc.sub) {
    _dsRenameNotice = { text: 'サブフォルダの図 (' + from + '.puml) の名前はここでは変えられません',
                        canRestore: false, from: from, dsl: '' };
    renderDiagramSettings(true);
    return null;
  }

  // 前の名前で既にファイルが書かれているか。保存フォルダを使っていないなら
  // 残るファイルも無い。
  var cfg = null;
  try { cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfg = null; }
  var saved = !!(cfg && cfg.backend === 'file');
  var VT = window.MA.versionTimeline;
  var version = (RG && VT && saved) ? RG.previousVersion(VT.historyOf(from), mmdText) : null;

  var id = ws.getActiveId();
  ws.rename(id, to);
  var name = _dsActiveDocName();
  var note = RG ? RG.notice({ from: from, to: name, saved: saved, version: version }) : null;
  // 付け替え は前の名前のファイルが
  // 今の図と同じなら消す。そのファイルが前周の完了物に今回の編集が紛れ込んだもの
  // なら、前周の版は控えにしか残らない。付け替えた後も
  // 「直前の版に戻す」を残す。戻す口は付け替えが済んでから出す (途中で戻すと、戻した版を付け替えが消す)。
  var restorable = !!(note && note.canRestore);
  var restoreDsl = version ? version.dsl : '';
  _dsRenameNotice = note
    ? { text: note.text, canRestore: false, from: from, dsl: restoreDsl }
    : null;
  renderTabs();
  renderDiagramSettings(true);
  // 前の名前のファイルが今の図そのものなら付け替える (残して二重にしない)。
  var sweep = {};
  _sweepRenamedFile(from, name, mmdText, sweep).then(function(text) {
    // 中身が今の図と違うので残した (keep) ファイルは、今回の編集が紛れ込んだものではない
    var offer = restorable && sweep.action !== 'keep';
    if (!text) {
      if (offer && _dsRenameNotice && _dsRenameNotice.from === from) {
        _dsRenameNotice.canRestore = true;
        renderDiagramSettings(true);
      }
      return;
    }
    _dsRenameNotice = {
      text: offer
        ? text + '。名前を変える前の版を ' + from + '.puml として残すなら、下のボタンで戻せます'
        : text,
      canRestore: offer, from: from, dsl: offer ? restoreDsl : '',
    };
    // 付け替えの間に押した保存の「…に保存しました」を消さず、後ろに足す。
    appendSaveStatus(text);
    renderDiagramSettings(true);
  });
  return name;
}

// ── 図名とタイトルの末尾を連動させる ───────────────────────────────────────
// 手順4「タイトルの末尾に語を付け足して保存」は、
// 「タイトル / Title」と「図名 / File name」を別々に書き換える作業になっていた。
// 片方だけ直すとファイル名と図の見出しがずれる。末尾を足した / 外しただけの編集は
// もう片方にも同じことをして、何をしたかを欄の下に書く (黙って書き換えない)。
var _dsLinkNotice = '';

// 図名が新規タブの既定名 (diagram2_sequence-3 など) のままなら、
// 末尾を足すだけでは本体が食い違う。既定名の間はタイトルの全体を図名にする。
function _dsPropagateFromTitle(before, after) {
  var L = window.MA.nameTitleLink;
  if (!L) return;
  var cur = _dsActiveDocName();
  var sync = L.titleSync(before, after, cur);
  if (!sync) return;
  var next = sync.name;
  var ws = window.MA.workspace;
  if (ws && !ws.isValidName(next)) return;   // ファイル名に使えない名前は付けない
  if (_dsRenameActive(next)) {
    _dsLinkNotice = L.noticeText('図名 / File name', cur, _dsActiveDocName());
    renderDiagramSettings(true);
  }
}

function _dsPropagateFromName(before, after) {
  var L = window.MA.nameTitleLink;
  if (!L) return;
  var edit = L.suffixEdit(before, after);
  if (!edit) return;
  var cur = dsSettings ? (dsSettings.title || '') : '';
  var next = L.applyEdit(cur, edit);
  if (!next) return;
  _dsLinkNotice = L.noticeText('タイトル / Title', cur, next);
  dsSet({ title: next });
}

function renderDiagramSettings(keepState) {
  var host = document.getElementById('diagram-settings-content');
  var ds = window.MA.diagramSettings;
  if (!host || !ds) return;
  // タブを開いた時点の DSL を読み戻して、今の図の見た目に合わせる。
  if (!keepState || !dsSettings) { dsSettings = ds.readFrom(mmdText); _dsLinkNotice = ''; }
  var resolved = ds.resolve(dsSettings);
  // 欄の change から再描画が入れ子で走ると、先に消えた
  // 子を removeChild しようとして例外になり、change の続き (連動) が止まっていた。
  host.textContent = '';

  function group(labelText) {
    var g = document.createElement('div');
    g.className = 'ds-group';
    var l = document.createElement('span');
    l.className = 'ds-label';
    l.textContent = labelText;
    g.appendChild(l);
    host.appendChild(g);
    return g;
  }

  function choiceRow(g, items, isActive, onPick) {
    var row = document.createElement('div');
    row.className = 'ds-row';
    items.forEach(function(it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ds-choice' + (isActive(it) ? ' active' : '');
      b.textContent = it.label;
      b.setAttribute('data-ds-value', String(it.value));
      b.addEventListener('click', function() { onPick(it.value); });
      row.appendChild(b);
    });
    g.appendChild(row);
    return row;
  }

  // 図名 (= 保存されるファイル名)。
  // 台本の「タイトルの末尾に付け足す」を DSL の title 行の
  // ことだと思って editor を書き換えようとした。ファイル名を決めているのは図名の方で、
  // その対応は画面のどこにも出ていなかった。ここで並べて出し、名前もここで変える
  // (タブのダブルクリックの prompt はブラウザを止めるので、開いている間に自動保存が
  // 走ると前の名前のファイルに今回の編集が入る)。
  var gName = group('図名 / File name');
  var nameIn = document.createElement('input');
  nameIn.type = 'text';
  nameIn.id = 'ds-docname';
  nameIn.value = _dsActiveDocName();
  nameIn.title = window.MA.workspace ? window.MA.workspace.nameRuleText() : '';
  nameIn.addEventListener('change', function() {
    var before = _dsActiveDocName();
    var after = _dsRenameActive(nameIn.value);
    if (after) _dsPropagateFromName(before, after);
  });
  gName.appendChild(nameIn);
  var nameHint = document.createElement('div');
  nameHint.id = 'ds-name-hint';
  nameHint.className = 'ds-note';
  nameHint.textContent = window.MA.renameGuard
    ? window.MA.renameGuard.hintText(_dsActiveDocName(), _wsFileDir()) : '';
  gName.appendChild(nameHint);
  var nameNotice = document.createElement('div');
  nameNotice.id = 'ds-name-notice';
  nameNotice.className = 'ds-note';
  nameNotice.hidden = true;
  gName.appendChild(nameNotice);
  if (_dsRenameNotice) _dsShowRenameNotice(nameNotice);
  // 連動したことの知らせ。
  var linkNotice = document.createElement('div');
  linkNotice.id = 'ds-link-notice';
  linkNotice.className = 'ds-note';
  linkNotice.textContent = _dsLinkNotice;
  linkNotice.hidden = !_dsLinkNotice;
  gName.appendChild(linkNotice);

  // タイトル
  var gTitle = group('タイトル / Title');
  var title = document.createElement('input');
  title.type = 'text';
  title.id = 'ds-title';
  title.value = dsSettings.title || '';
  title.addEventListener('change', function() {
    var before = dsSettings.title || '';
    var after = title.value;
    try { dsSet({ title: after }); } finally { _dsPropagateFromTitle(before, after); }
  });
  gTitle.appendChild(title);
  var titleHint = document.createElement('div');
  titleHint.id = 'ds-title-hint';
  titleHint.className = 'ds-note';
  titleHint.textContent = '末尾に付け足した文字は 図名 / File name にも同じように付きます (逆も同じ)';
  gTitle.appendChild(titleHint);

  // 外観 / Theme
  var gTheme = group('外観 / Theme');
  gTheme.id = 'ds-theme-group';
  choiceRow(gTheme,
    ds.THEMES.map(function(t) { return { value: t.id, label: t.label }; }),
    function(it) { return it.value === resolved.theme; },
    // テーマを選び直したら個別の色指定は捨てる。でないと前のテーマの色が残る。
    function(v) { dsSet({ theme: v, shapeColor: null, lineColor: null, backgroundColor: null }); });

  function colorGroup(labelText, id, key, current) {
    var g = group(labelText);
    var row = document.createElement('div');
    row.className = 'ds-row';
    var input = document.createElement('input');
    input.type = 'color';
    input.id = id;
    input.value = current;
    input.addEventListener('change', function() {
      var patch = {};
      patch[key] = input.value.toUpperCase();
      dsSet(patch);
    });
    row.appendChild(input);
    var code = document.createElement('span');
    code.textContent = current;
    code.style.fontFamily = 'var(--font-mono)';
    code.style.fontSize = '11px';
    row.appendChild(code);
    g.appendChild(row);
  }

  colorGroup('図形の色 / Shape', 'ds-shape-color', 'shapeColor', resolved.shapeColor);
  colorGroup('線の色 / Line', 'ds-line-color', 'lineColor', resolved.lineColor);
  colorGroup('背景色 / Background', 'ds-background-color', 'backgroundColor', resolved.backgroundColor);

  // 文字サイズ
  var gFont = group('文字サイズ / Font size');
  gFont.id = 'ds-font-group';
  choiceRow(gFont,
    ds.FONT_SIZES.map(function(n) { return { value: n, label: String(n) }; }),
    function(it) { return Number(it.value) === Number(resolved.fontSize); },
    function(v) { dsSet({ fontSize: Number(v) }); });

  // メッセージの通し番号。
  // autonumber はシーケンス図だけの指定なので、他の図種では出さない。
  if (currentDiagramType === 'plantuml-sequence') {
    var AN = window.MA.sequenceAutonumber;
    var an = AN.read(mmdText);
    var gNum = group('メッセージの通し番号 / autonumber');
    gNum.id = 'ds-autonumber-group';
    var numRow = document.createElement('div');
    numRow.className = 'ds-row';
    var onLabel = document.createElement('label');
    onLabel.style.display = 'flex';
    onLabel.style.alignItems = 'center';
    onLabel.style.gap = '6px';
    var onBox = document.createElement('input');
    onBox.type = 'checkbox';
    onBox.id = 'ds-autonumber-on';
    onBox.checked = an.on;
    onLabel.appendChild(onBox);
    onLabel.appendChild(document.createTextNode('番号を振る'));
    numRow.appendChild(onLabel);

    function _numInput(id, value, title) {
      var el = document.createElement('input');
      el.type = 'number';
      el.min = '1';
      el.id = id;
      el.value = String(value);
      el.title = title;
      el.style.width = '56px';
      el.disabled = !an.on;
      return el;
    }
    var startEl = _numInput('ds-autonumber-start', an.start, '開始番号');
    var stepEl = _numInput('ds-autonumber-step', an.step, '増分');
    numRow.appendChild(startEl);
    numRow.appendChild(stepEl);
    gNum.appendChild(numRow);

    function applyAutonumber() {
      var next = AN.apply(mmdText, {
        on: onBox.checked,
        start: startEl.value,
        step: stepEl.value,
        // 書式は触らせない。実物の図の `"<b>[000]"` を開始番号の変更で落とさない
        // undefined を渡すと今の行の書式を引き継ぐ。
        format: undefined,
      });
      if (next === mmdText) { renderDiagramSettings(true); return; }
      if (window.MA.history) window.MA.history.pushHistory();
      mmdText = next;
      suppressSync = true;
      editorEl.value = next;
      suppressSync = false;
      scheduleRefresh();
      renderDiagramSettings(true);
    }
    onBox.addEventListener('change', applyAutonumber);
    startEl.addEventListener('change', applyAutonumber);
    stepEl.addEventListener('change', applyAutonumber);

    var numHint = document.createElement('div');
    numHint.id = 'ds-autonumber-line';
    numHint.style.fontFamily = 'var(--font-mono)';
    numHint.style.fontSize = '11px';
    numHint.style.color = 'var(--text-secondary)';
    numHint.textContent = an.on ? AN.fmtLine(an.start, an.step, an.format) : '(番号なし)';
    gNum.appendChild(numHint);
  }

  // 生成される行
  var gPrev = group('DSL 先頭に書き込まれる行');
  var pre = document.createElement('div');
  pre.id = 'ds-preview';
  var lines = ds.buildLines(dsSettings, currentDiagramType);
  if (dsSettings.title) lines = ['title ' + dsSettings.title].concat(lines);
  pre.textContent = lines.join('\n');
  gPrev.appendChild(pre);
}

function showPropsTab(which) {
  var propsBtn = document.getElementById('props-tab-props');
  var setBtn = document.getElementById('props-tab-settings');
  var propsPane = document.getElementById('props-content');
  var setPane = document.getElementById('diagram-settings-content');
  if (!propsBtn || !setBtn || !propsPane || !setPane) return;
  var settings = which === 'settings';
  propsBtn.classList.toggle('active', !settings);
  setBtn.classList.toggle('active', settings);
  propsPane.hidden = settings;
  setPane.hidden = !settings;
  if (settings) renderDiagramSettings(false);
}

// design 3a: 2 つ選ぶと「関係を追加できます」とキャンバス上に出す。右ペインは
// 視線の外にあるので、選択できた合図を図の側にも置く。
function updateSelectionNotice(sel) {
  var el = document.getElementById('selection-notice');
  if (!el) return;
  var text = moduleHas('multiSelectConnect')
    ? window.MA.relationAdd.noticeText((sel || []).length)
    : null;
  el.textContent = text || '';
  el.hidden = !text;
}

// design 5a「図をクリックしたら DSL の該当行へ移動」。
// 図と DSL は行番号でしか結ばれていないので、対応を目で数えるしかなかった。
// 設定 (エディタタブ) で切れる。DSL タブを開いていないときは動かさない
// (構造タブを見ている最中に裏で textarea だけが動いても何も起きないため)。
// キーボードで選択を移している最中かどうか。「選んだ行へ飛ぶ」はどの経路でも textarea へ
// focus を移さない ので、今は呼び出しの印として残すだけ。
var _kbdNavSelect = false;
function kbdSetSelected(items) {
  _kbdNavSelect = true;
  try { window.MA.selection.setSelected(items); }
  finally { _kbdNavSelect = false; }
}

// 図を押しても本文欄へは focus を移さず、行を選択状態にもしない。
// 以前は図のクリックのたびに textarea を focus して行全体を選んでいたので、続く Enter で行が空行 2 つに、
// 文字キーで行がその 1 文字に置き換わり、そのまま自動保存されていた (design 5b の図の編集キーは
// 「入力中」とみなされて素通しされ、効かなかった)。行はスクロールと帯 (#editor-jump-band) で見せ、
// キャレットはその行の頭に置くだけにする (本文を打ちたい人は本文欄を押せばその場にキャレットが立つ)。
var _jumpLine = null;
function _editorLineHeight() {
  var style = window.getComputedStyle(editorEl);
  var lh = parseFloat(style.lineHeight);
  if (!isFinite(lh)) lh = (parseFloat(style.fontSize) || 13) * 1.5;
  return lh;
}
function syncJumpBand() {
  var band = document.getElementById('editor-jump-band');
  var EJ = window.MA.editorJump;
  if (!band || !EJ || !editorEl) return;
  // 折り返し表示 (設定の「折り返す」) では行と高さが対応しないので、ずれた行を指す帯は出さない。
  var wrapped = window.getComputedStyle(editorEl).whiteSpace !== 'pre';
  var box = (_jumpLine === null || wrapped) ? null : EJ.bandBox(_jumpLine, {
    lineHeight: _editorLineHeight(),
    padTop: parseFloat(window.getComputedStyle(editorEl).paddingTop) || 0,
    scrollTop: editorEl.scrollTop,
    viewportHeight: editorEl.clientHeight,
  });
  if (!box || !box.visible) { band.hidden = true; return; }
  band.style.left = editorEl.offsetLeft + 'px';
  band.style.width = editorEl.clientWidth + 'px';
  band.style.top = (editorEl.offsetTop + box.top) + 'px';
  band.style.height = box.height + 'px';
  band.setAttribute('data-line', String(_jumpLine));
  band.hidden = false;
}
function _markJumpGutter() {
  if (!lineNumbersEl) return;
  var old = lineNumbersEl.querySelectorAll('.ln-jump');
  for (var i = 0; i < old.length; i++) old[i].classList.remove('ln-jump');
  if (_jumpLine === null) return;
  var ln = lineNumbersEl.querySelector('.ln[data-line="' + _jumpLine + '"]');
  if (ln) ln.classList.add('ln-jump');
}
function clearJumpBand() {
  if (_jumpLine === null) return;
  _jumpLine = null;
  syncJumpBand();
  _markJumpGutter();
}

function jumpEditorToSelection(sel) {
  var EJ = window.MA.editorJump;
  if (!EJ || !editorEl) return;
  if (currentEditorPrefs && currentEditorPrefs.clickToLine === false) { clearJumpBand(); return; }
  var line = EJ.targetLine(sel);
  if (line === null) { clearJumpBand(); return; }
  var range = EJ.lineRange(editorEl.value, line);
  if (!range) { clearJumpBand(); return; }
  editorEl.scrollTop = EJ.scrollTopFor(range.line, {
    lineHeight: _editorLineHeight(),
    viewportHeight: editorEl.clientHeight,
    scrollTop: editorEl.scrollTop,
  });
  // 本文欄で打っている最中 (focus が本文欄にある) ならキャレットは動かさない。
  // そうでなければ行の頭に置く (行全体は選ばない: 後で本文欄に入ったときの 1 打で行が消えない)。
  try {
    if (document.activeElement !== editorEl) editorEl.setSelectionRange(range.start, range.start);
  } catch (e) {}
  _jumpLine = range.line;
  updateLineNumbers();
  syncJumpBand();
}

// design 2b: 1 枚目のタブは「追加」(無選択) / 「選択中」(選択あり)。
function updatePropsTabLabel(sel) {
  var btn = document.getElementById('props-tab-props');
  var PTL = window.MA.propsTabLabel;
  if (!btn || !PTL) return;
  var n = (sel || []).length;
  btn.textContent = PTL.labelFor(n);
  btn.title = PTL.titleFor(n);
}

// 選んだ部品が「その部品 1 つだけを書いた行」から描かれていない (!while・!foreach の中、
// 手続きの中身・呼び出し、$変数・%関数で名前が決まる行、展開後の行から読んだ部品) なら、どの行が作っているかを返す
// (src/core/generated-part.js)。右パネル・キー操作・参加者のドラッグは、そういう部品を書き換えない。
function _parsedPartOf(s) {
  if (!s || !currentParsed) return null;
  var hit = null, seen = new Set();
  (function walk(o, depth) {
    if (hit && hit.line === s.line) return;
    if (!o || typeof o !== 'object' || o.nodeType || depth > 8 || seen.has(o)) return;
    seen.add(o);
    if (o.id === s.id && typeof o.line === 'number' && (o.kind || o.type)) {
      if (!hit || o.line === s.line) hit = o;
    }
    Object.keys(o).forEach(function(k) { if (o[k] && typeof o[k] === 'object') walk(o[k], depth + 1); });
  })(currentParsed, 0);
  return hit;
}
function _generatedOf(s) {
  var GP = window.MA.generatedPart;
  if (!GP || !s || s.type === 'source-line') return null;
  var el = _parsedPartOf(s);
  var line = (typeof s.line === 'number' && s.line) || (el && el.line) || 0;
  var PE = window.MA.preprocExpand;
  var cl = PE && PE.changedLines ? PE.changedLines(mmdText) : null;
  try { return GP.of(mmdText, line, el, { callLines: cl }); } catch (e) { return null; }
}
function _generatedOfSelection(sel) {
  sel = sel || (window.MA.selection ? window.MA.selection.getSelected() : []) || [];
  for (var i = 0; i < sel.length; i++) {
    var g = _generatedOf(sel[i]);
    if (g) return g;
  }
  return null;
}
// 書き換えを断ったことを言う (右パネルの 1 行を光らせ、同じ文をトーストにも出す)。
function _refuseGenerated(gen) {
  var note = document.getElementById('generated-part-note');
  if (note) {
    note.style.outline = '2px solid var(--accent-orange, #f0a030)';
    setTimeout(function() { note.style.outline = ''; }, 1500);
  }
  if (window.MA.toast) window.MA.toast.show('書き換えませんでした: ' + gen.message);
}

// 右パネルから本文を書き換えたら (「変更を反映」・種別のカード・色など)、描き直しの前に
// 右パネルを組み直すときに、選んでいた要素を新しい本文の同じ行の要素へ持ち越す (MA.selectionCarry)。
// 書き換えた側が選択を自分で替えた (削除で外した・動かした先を選んだ) ときはそちらに任せる。
var _selCarry = null;   // { text, parsed, selKey } 最初に書き換える直前の本文と選択
function _noteSelectionCarry() {
  if (_selCarry || !window.MA.selectionCarry || !window.MA.selection) return;
  var sel = window.MA.selection.getSelected() || [];
  if (sel.length !== 1) return;
  _selCarry = { text: mmdText, parsed: currentParsed, selKey: JSON.stringify(sel) };
}
function _applySelectionCarry() {
  var c = _selCarry;
  _selCarry = null;
  if (!c || !window.MA.selectionCarry || !window.MA.selection) return;
  var sel = window.MA.selection.getSelected() || [];
  if (JSON.stringify(sel) !== c.selKey) return;
  var r = window.MA.selectionCarry.carry(sel, c.parsed, c.text, currentParsed, mmdText);
  if (r.action === 'set') window.MA.selection.setSelected(r.selection);
  else if (r.action === 'clear') window.MA.selection.clearSelection();
}

// TICKET-roadmap-20261123-0857-1: 右パネルの書き換えの直後に組み直した本文・選択・図種の控え (MA.propsRebuild)。
// 右パネルが「末尾に追加」のフォームを出している間は、選択が残っていても (別のタブで選んだまま新しい図を開いた等)
// 無選択と同じに扱う (同じ本文・図種なら refresh で組み直さず、打ち始めた欄を消さない)。
var _propsBuilt = window.MA.propsRebuild.tracker(function() {
  var sel = (window.MA.selection && window.MA.selection.getSelected()) || [];
  var tail = !!(propsEl && propsEl.querySelector && propsEl.querySelector('[id$="-tail-detail"]'));
  return { text: mmdText, sel: tail ? '[]' : JSON.stringify(sel), module: currentModule };
});
function _rebuildPropsNow() {
  try { _applySelectionCarry(); } catch (e) { _selCarry = null; }
  renderProps(currentParsed);
  _propsBuilt.markBuilt(true);
}
// refresh が右パネルを組み直すか。同じ本文・選択・図種で組み直し済みなら組み直さない (MA.propsRebuild.tracker)。
function _propsNeedRebuild() { return _propsBuilt ? _propsBuilt.needRebuild() : true; }

// 図種モジュールに渡す「本文を書き換える口」(右パネル・図の行間の挿入の窓・Delete キー・状態表の遷移追加の窓)。
// 書き換えたら本文をその場で読み直し、右パネルもその場で今の読みから組み直す
// (次の手が描き直し前の古い読み・古いフォームに対して働かない)。後から来る refresh は、
// 本文と選択が変わっていなければ組み直さない (確定の直後に選んだ・打った欄を消さない)。MA.propsRebuild。
// carrySelection: 右パネルの反映の後も直した要素 (同じ行) を選んだままにする (右パネルだけ。selection-carry)。
function _editCtx(carrySelection) {
  return window.MA.propsRebuild.makeCtx({
    getText: function() { return mmdText; },
    write: function(s) {
      if (carrySelection) _noteSelectionCarry();
      mmdText = s;
      suppressSync = true;
      editorEl.value = s;
      suppressSync = false;
    },
    // Re-parse synchronously so any setSelected() that fires right
    // after sees the updated structure (cross-ported from MermaidAssist PR #1 commit a4e8410).
    reparse: function() {
      if (currentModule && currentModule.parse) {
        try { currentParsed = currentModule.parse(mmdText); } catch (e) { /* leave stale */ }
      }
    },
    rebuildNow: _rebuildPropsNow,
    schedule: scheduleRefresh,
  });
}

function renderProps(parsed) {
  _renderPropsBody(parsed);
  // 組み直した後の右パネル (末尾に追加のフォームか) で控える。
  if (_propsBuilt) _propsBuilt.markBuilt(false);
}
function _renderPropsBody(parsed) {
  if (!parsed) parsed = currentParsed;
  var sel = window.MA.selection.getSelected();
  updatePropsTabLabel(sel);
  // フォームが読めない記法の要素 (overlay-builder.addUnclaimed) は、
  // 本文のどの行に書かれているかと、フォームでは直せないことを言う (黙って空欄にしない)。
  if (sel && sel.length === 1 && sel[0].type === 'source-line' && propsEl) {
    var esc = window.MA.htmlUtils.escHtml;
    var srcLines = String(mmdText || '').split('\n');
    var ln = Number(sel[0].line) || 0;
    var raw = ln >= 1 && ln <= srcLines.length ? srcLines[ln - 1].replace(/\r$/, '') : '';
    propsEl.innerHTML =
      '<div id="src-line-props" data-line="' + ln + '" style="font-size:11px;line-height:1.6;">' +
        '<div style="color:var(--text-secondary);margin-bottom:6px;">' + (ln
          ? '本文 L' + ln + ' に書かれた要素です'
          : 'PlantUML が本文の行を示していない要素です (' + esc(String(sel[0].id || '').replace(/^src:/, '').replace(/@.*$/, '')) + ')') + '</div>' +
        (ln ? '<pre id="src-line-text" style="margin:0 0 8px 0;padding:6px;background:var(--bg-tertiary);border:1px solid var(--border);' +
          'white-space:pre-wrap;word-break:break-all;font-size:11px;">' + esc(raw.trim()) + '</pre>' : '') +
        '<div style="color:var(--text-secondary);">この記法はまだ右欄のフォームで直せません。' +
        (ln ? '本文のこの行 (左で選択中) を直接直してください。' : '本文で直接直してください。') +
        '図と本文はそのまま保たれ、保存しても書き換わりません。</div>' +
      '</div>';
    return;
  }
  // 繰り返し・手続きが作った部品の欄は読むだけ (本文を書き換えない)
  var _gen = (sel && sel.length) ? _generatedOfSelection(sel) : null;
  var _GP = window.MA.generatedPart;
  var _ctx = _editCtx(true);
  currentModule.renderProps(sel, parsed, propsEl, _gen && _GP ? _GP.guard(_ctx, _gen, _refuseGenerated) : _ctx);
  if (_gen && _GP) _GP.lock(propsEl, _gen);
}

// design 5a: 描画エラーの出し方。「図の上に重ねて表示」が入っていれば
// 直前の図を残して帯だけ重ね、外れていれば従来どおり図をエラー 1 行に差し替える。
// 「直前の図」はそのタブ自身が前に描けた図に限る。プレビューの図がどのタブのものか
// (タブの id と名前。ファイルを開いて白紙のタブに入れ替わったときも別の図と分かる。
// PlantUML の案内画面「Welcome to PlantUML!」は図に数えないので false)。
var _previewOwnerId = false;
// 描くときに相対の !include / !includesub を探すフォルダ。
// 手元から開いたファイルはそのファイルのフォルダ、保存先の図はそのタブの保存フォルダ (留めたタブは留めた先)。
// 保存先がフォルダでない (ブラウザ内) ときは渡さない。
function _renderSaveDir() {
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (!cfg || cfg.backend !== 'file') return '';
  } catch (e) { return ''; }
  return _wsFileDir();
}
function _renderDirOfDoc(doc) {
  var src = doc && doc.id ? _sourcePathOf(doc.id) : '';
  if (src) {
    var cut = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'));
    if (cut > 0) return src.slice(0, cut);
  }
  if (!_renderSaveDir()) return '';
  return doc ? _docDir(doc) : _wsFileDir();
}
function _renderDirOfActive() {
  var d = null;
  try { d = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { d = null; }
  return _renderDirOfDoc(d);
}

function _activeDocKey() {
  try {
    var d = window.MA.workspace ? window.MA.workspace.getActive() : null;
    return d ? String(d.id) + '|' + String(d.name || '') : null;
  } catch (e) { return null; }
}
function _isPlantUmlWelcome(svg) {
  return /Welcome to PlantUML!/.test(String(svg || ''));
}

function showRenderError(message) {
  var banner = document.getElementById('render-error-overlay');
  var text = 'Render error: ' + message;
  // まだ 1 枚も描けていない画面 (初回起動で jar が無い等) は、帯ではなく図の場所そのものに理由を出す。
  // 別のタブの図を外した後 (.preview-not-drawn) は帯のまま続ける。
  if (!currentErrorOverlay || !banner
      || (!previewSvgEl.querySelector('svg') && !previewSvgEl.querySelector('.preview-not-drawn'))) {
    if (banner) { banner.hidden = true; banner.textContent = ''; }
    previewSvgEl.innerHTML = '<p style="color:var(--accent-red);padding:20px;white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;">' +
      window.MA.htmlUtils.escHtml(text) + '</p>';
    return;
  }
  // 別のタブの図・案内画面は「直前の図」ではない。図を外して帯だけを出す (選択枠も前の図のものなので外す)。
  var own = !!previewSvgEl.querySelector('svg') && _previewOwnerId !== false && _previewOwnerId === _activeDocKey();
  if (!own) {
    // 空の枠だと図の場所が潰れて何も無いように見えるので、描けていないことだけを 1 行で言う (理由は帯)。
    previewSvgEl.innerHTML = '<p class="preview-not-drawn" style="color:var(--text-secondary);padding:20px;font-size:12px;">' +
      'この図はまだ描けていません (理由は上の帯)</p>';
    _previewOwnerId = false;
    var ovl = document.getElementById('overlay-layer');
    if (ovl) { while (ovl.firstChild) ovl.removeChild(ovl.firstChild); }
  }
  banner.textContent = text;
  banner.hidden = false;
}

function clearRenderError() {
  var banner = document.getElementById('render-error-overlay');
  if (banner) { banner.hidden = true; banner.textContent = ''; }
}

// `!include` した手続き (`WorkDocs(...)` など) で部品を宣言した図は、
// DSL には `actor` と `-->` しか見えないのでシーケンス図と読まれ、選択枠が 1 つも出なかった。
// 手続きの中身は展開して読まず、PlantUML が SVG に残した図種 (data-diagram-type) に合わせる。
// 合わせた結果は _svgKindFix に憶え、同じ DSL の判定が出る間は refresh() もその図種で読む。
var _svgKindFix = null;
function _reconcileKindWithSvg(svgEl) {
  var SK = window.MA.svgKind;
  var PU = window.MA.parserUtils;
  if (!SK || !PU || !currentModule) return;
  // `actor A` だけの段階は図種を決めない (空のシーケンス図に参加者を足した直後に載せ替えない)。
  if (PU.isAmbiguousType(mmdText)) return;
  var svgType = SK.of(svgEl);
  var cur = currentModule.type;
  // 図種は SVG が決める。DSL は DESCRIPTION の中の component / usecase の見分けにだけ使う。
  var want = SK.reconcile(cur, svgType, mmdText);
  var fromDsl = PU.detectDiagramType(mmdText);
  if (!want || want === cur || !modules[want]) {
    // DSL の判定だけで SVG と合うようになったら (手続きを書き換えた等)、憶えた図種は捨てる。
    if (_svgKindFix && svgType && SK.reconcile(fromDsl, svgType, mmdText) === fromDsl) _svgKindFix = null;
    // 右パネルは SVG の図種なのに、図種欄・左レール・ズームの帯・タブの図種が DSL の読みのまま残っていたら揃える。
    if (want && want === cur && modules[want] && want !== currentDiagramType) _adoptDetectedType(want);
    return;
  }
  _svgKindFix = { from: fromDsl, to: want };
  currentModule = modules[want];
  try { currentParsed = currentModule.parse(mmdText); }
  catch (e) { currentParsed = { meta: {}, elements: [], relations: [], groups: [] }; }
  // 右パネルだけでなく、図種欄・左レール・ズームの帯・タブの図種も SVG の図種にそろえる
  // (以前は右パネルだけ component に替わり、帯と左レールは Class / Sequence のまま残っていた)。
  _adoptDetectedType(want);
  try { renderProps(currentParsed); } catch (e) {}
  try { renderUnsupportedPanel(); } catch (e) {}
}

// 「読めない行」の帯はエンジンの答えで決める。最後に描いた本文と、その答え。
// { text, state: 'ok' | 'error' | 'none', line, message, crashed, noStartEnd, causeLine }
var _engineVerdict = null;
function _setEngineVerdict(text, v) {
  v.text = text;
  _engineVerdict = v;
  try { renderUnsupportedPanel(); } catch (e) {}
}

// 図の上の枠 (overlay) をどの本文から作ったか。今の本文 (mmdText) と違う間は枠が古い。
// 枠を作っていない (焦点中・描けていない) 間は null。
var _overlayBuiltFrom = null;
// 古い枠を押した回の憶え ({ type, line, text, shiftKey, at })。描き直しが届いたら引き当てる。
var _staleOverlayClick = null;
var STALE_CLICK_KEEP_MS = 15000;

function _noteStaleOverlayClick(e) {
  var SO = window.MA.staleOverlay;
  var t = e.target;
  var type = t && t.getAttribute ? t.getAttribute('data-type') : null;
  var p = (SO && type) ? SO.remember(_overlayBuiltFrom, type, t.getAttribute('data-line')) : null;
  // 押した要素はまだ選ばない。前の選択も、行がずれた本文に向けて使わせないよう外す。
  try { if (window.MA.selection && window.MA.selection.clearSelection) window.MA.selection.clearSelection(); } catch (err) {}
  if (!p) { _staleOverlayClick = null; return; }
  p.shiftKey = !!e.shiftKey;
  p.at = Date.now();
  _staleOverlayClick = p;
  if (window.MA.toast) window.MA.toast.show('図を描き直しています。届いたら押した要素を選びます');
}

// 描き直しが届いた直後に呼ぶ。押した枠と同じ種類・同じ中身の行の枠を押し直す (当たらなければ選ばない)。
function _resolveStaleOverlayClick(overlayEl) {
  var p = _staleOverlayClick;
  if (!p || !overlayEl) return;
  var SO = window.MA.staleOverlay;
  if (!SO || SO.isStale(_overlayBuiltFrom, mmdText)) return;   // まだ古い (次の描き直しを待つ)
  _staleOverlayClick = null;
  if (Date.now() - p.at > STALE_CLICK_KEEP_MS) return;
  var rects = Array.prototype.filter.call(overlayEl.querySelectorAll('[data-type][data-line]'), function(r) {
    return r.getAttribute('data-type') === p.type;
  });
  var i = SO.pick(p, mmdText, rects.map(function(r) {
    return { type: r.getAttribute('data-type'), line: r.getAttribute('data-line') };
  }));
  if (i < 0) {
    if (window.MA.toast) window.MA.toast.show('押した要素は描き直した図に無かったので、選んでいません');
    return;
  }
  rects[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: p.shiftKey }));
}

function renderSvg() {
  var mode = document.getElementById('render-mode').value || 'local';
  renderStatusEl.textContent = 'Rendering\u2026';
  renderStatusEl.classList.remove('error');
  updateTopRenderStatus('rendering');

  // design 1a: \u4e0a\u90e8\u30d0\u30fc\u306e `local \u00b7 24ms` \u306f\u3053\u306e\u5f80\u5fa9\u306b\u304b\u304b\u3063\u305f\u5b9f\u6e2c\u3092\u51fa\u3059\u3002
  var startedAt = (window.performance && performance.now) ? performance.now() : Date.now();
  var elapsed = function() {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    return now - startedAt;
  };
  var myGen = ++renderGen;
  var renderText = mmdText;
  var renderDocKey = _activeDocKey();  // この回の図がどのタブのものか
  // マクロのある本文は、描画と並べて PlantUML のプリプロセッサに展開を頼み、
  // 選択枠はその展開を読んでから当てる (展開できない・遅いときは今までの読み方で当てる)。
  var _PEx = window.MA.preprocExpand;
  // 相対の !include は、このタブの .puml のあるフォルダから探す。
  var renderDir = _renderDirOfActive();
  var expandP = _PEx ? _PEx.ensure(mmdText, null, renderDir).catch(function() { return false; }) : Promise.resolve(false);
  var renderBody = { text: renderText, mode: mode };
  if (renderDir) renderBody.dir = renderDir;
  fetch('/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(renderBody),
  }).then(function(resp) {
    var contentType = resp.headers.get('Content-Type') || '';
    if (!resp.ok) {
      return resp.json().then(function(err) {
        var e = new Error(err.error || ('HTTP ' + resp.status));
        e.renderInfo = err;  // 版・行・推測した図種 (422)
        throw e;
      });
    }
    if (contentType.indexOf('image/svg') < 0) {
      throw new Error('Unexpected content type: ' + contentType);
    }
    return resp.text();
  }).then(function(svg) {
    return expandP.then(function() { return svg; }, function() { return svg; });
  }).then(function(svg) {
    if (myGen !== renderGen) return;  // stale response \u2014 a newer renderSvg() superseded this one
    // design 5a: PlantUML \u306f\u6587\u6cd5\u30a8\u30e9\u30fc\u3067\u3082 200 + SVG \u3092\u8fd4\u3059\u3002\u305d\u306e\u307e\u307e\u6d41\u3057\u8fbc\u3080\u3068
    // \u76f4\u524d\u307e\u3067\u898b\u3048\u3066\u3044\u305f\u56f3\u304c\u300cSyntax Error?\u300d\u306e\u7d75\u306b\u4e38\u3054\u3068\u7f6e\u304d\u63db\u308f\u308b\u306e\u3067\u3001
    // \u3053\u3053\u3067\u62fe\u3063\u3066\u63cf\u753b\u30a8\u30e9\u30fc\u6271\u3044\u306b\u3057\u3001\u76f4\u524d\u306e\u56f3\u3092\u6b8b\u3057\u305f\u307e\u307e\u5e2f\u3060\u3051\u3092\u91cd\u306d\u308b\u3002
    var errInfo = window.MA.renderError.detect(svg);
    if (errInfo.isError) {
      var detectedText = window.MA.renderError.describe(errInfo);
      // 落ちた絵には行が無い。本文から落ちる原因の行を探して添える (server の 422 と同じ文)。
      var causeText = window.MA.renderError.crashCause ? window.MA.renderError.crashCause(errInfo, renderText) : '';
      if (causeText) {
        detectedText += '。' + causeText;
        errInfo.causeLine = window.MA.renderError.emptyFirstRegions(renderText)[0].line;
      }
      var detected = new Error(detectedText);
      detected.renderInfo = errInfo;
      throw detected;
    }
    clearRenderError();
    // 白紙の図は PlantUML の案内画面 (Welcome to PlantUML!) を描かず、空のキャンバスと 1 行の案内にする。
    var RE0 = window.MA.renderError;
    if (RE0.isBlankWelcome && RE0.isBlankWelcome(svg, renderText)) {
      previewSvgEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" data-blank-canvas="1" width="320" height="120" viewBox="0 0 320 120"></svg>'
        + '<p class="preview-blank-hint" style="color:var(--text-secondary);padding:8px 20px;font-size:12px;margin:0;">'
        + window.MA.htmlUtils.escHtml(RE0.BLANK_HINT) + '</p>';
    } else {
      previewSvgEl.innerHTML = svg;
    }
    _previewOwnerId = (renderDocKey === _activeDocKey() && !_isPlantUmlWelcome(svg)) ? renderDocKey : false;
    _previewPic = _previewOwnerId !== false ? { key: renderDocKey, text: renderText } : null;
    var nse = window.MA.renderError.noStartEnd ? window.MA.renderError.noStartEnd(svg) : null;
    _setEngineVerdict(renderText, nse
      ? { state: 'error', noStartEnd: true, message: nse.message, line: null }
      : { state: 'ok' });
    var svgEl = previewSvgEl.querySelector('svg');
    if (svgEl) {
      var dim = normalizeSvgSize(svgEl);
      if (isFirstRender) {
        isFirstRender = false;
        var previewContainer = document.getElementById('preview-container');
        if (previewContainer) {
          var containerW = previewContainer.clientWidth - 32;
          var fitZoom = containerW / dim.w;
          // Auto-fit: shrink oversize diagrams, but don't enlarge small ones past 100%
          fitZoom = Math.max(0.25, Math.min(1.0, fitZoom));
          setZoom(fitZoom);
        }
      } else {
        setZoom(zoom);
      }
    }
    var overlayEl = document.getElementById('overlay-layer');
    var warnEl = document.getElementById('overlay-warning');
    // Reset overlay state so leftovers from one module don't leak into another
    // (e.g. sequence block-highlight rects persisting after switching to usecase).
    if (overlayEl) {
      while (overlayEl.firstChild) overlayEl.removeChild(overlayEl.firstChild);
    }
    _overlayBuiltFrom = null;
    if (warnEl) { warnEl.style.display = 'none'; warnEl.textContent = ''; warnEl.title = ''; }
    if (svgEl) _adoptExpansion();
    if (svgEl) _reconcileKindWithSvg(svgEl);
    if (svgEl && currentModule && currentModule.buildOverlay) {
      syncOverlayOrigin();
      var report = currentModule.buildOverlay(svgEl, currentParsed, overlayEl, mmdText);
      // 図はこの回の本文 (renderText) の絵。描いている間に本文が変わっていれば、枠は絵と本文が食い違う
      // ので古い扱いにする (次の描き直しで作り直す)。
      _overlayBuiltFrom = renderText;
      // title / header / footer / caption / legend は図種を問わず同じ当て方で枠を置く。
      try { if (window.MA.overlayBuilder.addDocumentChrome) window.MA.overlayBuilder.addDocumentChrome(svgEl, overlayEl, mmdText); } catch (e) {}
      // 図種のモジュールが枠を置けなかった note の紙と接続線に、note 自身の行で枠を置く (図種を問わず 1 か所)。
      try {
        if (window.MA.overlayBuilder.addNoteFrames) {
          window.MA.overlayBuilder.addNoteFrames(svgEl, overlayEl, mmdText, (currentParsed && currentParsed.notes) || []);
        }
      } catch (e) {}
      // 対象へ伸びる note の楔の上も note の当たりにする (図種を問わず 1 か所)。
      try { if (window.MA.overlayBuilder.addNoteTails) window.MA.overlayBuilder.addNoteTails(svgEl, overlayEl); } catch (e) {}
      if (report && warnEl) {
        var u = report.unmatched || {};
        var totalUnmatched = (u.participant || 0) + (u.message || 0) + (u.note || 0) + (u.activation || 0);
        if (totalUnmatched > 0) {
          warnEl.style.display = 'block';
          // 内部の件数 (JSON) ではなく利用者の言葉で言う。内訳は title に残す。
          warnEl.textContent = '⚠ 図の要素 ' + totalUnmatched + ' 個に選択枠を当てられませんでした。本文か構造から直せます';
          warnEl.title = JSON.stringify(u);
        }
      }
      if (moduleHas('overlaySelection')) {
        var sel = window.MA.selection.getSelected() || [];
        window.MA.selectionRouter.applyHighlight(overlayEl, sel);
      }
      // 描き直しの前に押されていた枠を、この回の枠で押し直す。
      try { _resolveStaleOverlayClick(overlayEl); } catch (e) {}
      // overlay は描画のたびに作り直されるので、
      // 今のキャレット行の対応表示を引き直す (再描画で peek が消えたままにしない)。
      try { refreshLinePeek(); } catch (e) {}
    }
    // コミットと比較している間は、描き直した図にも
    // そのコミットとの差の色を付け直す (打つたびに追う)。
    try { syncGitDiagramDiff(); } catch (e) {}
    var took = elapsed();
    // 見出しは「Rendered · 32ms」。
    // 描画方法は上部バーの「local · 32ms」にあるので、ここでは title に回す。
    renderStatusEl.textContent = window.MA.topStatus
      ? window.MA.topStatus.previewHead(took) : 'Rendered';
    renderStatusEl.title = '描画: ' + mode;
    _renderTimings[mode] = took;   // design 5a: 設定画面での速度比較に使う
    updateTopRenderStatus('ok', took);
    // 描き直しを待っていた書き出しを、届いた絵で 1 回だけ書く (MA.exportWait)。
    _flushPendingExport(true, renderDocKey, renderText);
  }).catch(function(err) {
    if (myGen !== renderGen) return;  // stale failure — ignore
    var bandText = (err && err.message) || err;
    // エンジンが答えた (エラー画 / 落ちた絵) ときだけ帯の根拠にする。届かなかったときは何も言わない。
    var ri = err && err.renderInfo;
    _setEngineVerdict(renderText, ri ? {
      state: 'error', line: ri.line || null, message: ri.message || String(bandText),
      crashed: !!ri.crashed || ri.kind === 'plantuml-crash', causeLine: ri.causeLine || null,
    } : { state: 'none' });
    // PlantUML がその行で図種を見失った (本文の図種と違うものを推測した) ときは、そのことを帯に足す。
    try {
      var note = err && err.renderInfo && window.MA.renderError.kindNote
        ? window.MA.renderError.kindNote(err.renderInfo, currentModule && currentModule.type) : '';
      if (note) bandText += '。' + note;
    } catch (e) {}
    // 最初の並行領域が空で落ちた図は、直し方 (その領域に状態を置く) と、描けない間も本文は壊れないことを言う。
    if (err && err.renderInfo && err.renderInfo.causeLine) {
      bandText += '。その領域に状態を 1 つ置くと描けます (右パネルの「追加する位置」)。本文はそのまま直せ、何もせず保存しても書き換わりません';
    }
    showRenderError(bandText);
    renderStatusEl.textContent = 'ERROR';
    renderStatusEl.classList.add('error');
    updateTopRenderStatus('error');
    _flushPendingExport(false, renderDocKey, renderText);
  });
}

// 保存先 (backend / fileDir) はブラウザの好みではなく
// マシンの置き場所なので server が `.assist-prefs.json` に覚えている。だがその
// 取り込み (autoSave.init → hydrateFromServer) は「前回の DSL を復元する」処理の
// 中にあり、ワークスペースが残っているプロファイルでは丸ごと飛ばされていた。
// その結果、覚えているのに設定は既定 (localStorage / ./autosave) に戻り、
// 起動のたびに ⚙設定 → バックエンドを file → フルパスを打ち直すことになっていた。
//
// 取り込みは復元とは別の仕事なので init より前に置く。保存先は init の中で
// ワークスペース復元・自動保存の宛先として既に使われるため、後から入れ替えると
// 「最初の 1 枚だけ既定のフォルダに保存される」ずれを作る。
function bootWithSavedPrefs() {
  // FILES ツリー (design 10a) は server の応答を待たずに出す (畳んだ状態を含め
  // 画面の骨格なので、遅れて現れると押そうとした所が動く)。
  try { if (window.MA.filesPanel) window.MA.filesPanel.init(); } catch (e) {}
  try { if (window.MA.gitUi) window.MA.gitUi.init(); } catch (e) {}
  try { if (window.MA.fileMenuUi) window.MA.fileMenuUi.init(); } catch (e) {}
  var as = window.MA.autoSave;
  var started = false;
  // init が途中で投げても、押せない (html[data-app-ready] の無い) 画面のまま残さない。
  function go() {
    if (started) return;
    started = true;
    try { init(); } finally { try { document.documentElement.setAttribute('data-app-ready', '1'); } catch (e) {} }
    // FILES「読むだけ」節の行と件数 (design 10a)。保存先が決まってから隣を読む。
    try { refreshReadonlyTree(true); } catch (e) {}
  }
  if (!as || !as.hydrateFromServer) { go(); return; }
  // server が黙っていても画面は開く。3 秒でこの回は諦める (次の起動で入る)。
  var timer = window.setTimeout(go, 3000);
  function done() { window.clearTimeout(timer); go(); }
  var p;
  try { p = as.hydrateFromServer(); } catch (e) { p = null; }
  if (!p || typeof p.then !== 'function') { done(); return; }
  p.then(done, done);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWithSavedPrefs);
} else {
  bootWithSavedPrefs();
}
