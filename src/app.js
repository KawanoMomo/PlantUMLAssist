'use strict';

var modules = {};
function _registerModules() {
  var mm = window.MA.modules || {};
  var keys = Object.keys(mm);
  for (var i = 0; i < keys.length; i++) {
    var mod = mm[keys[i]];
    var key = (mod && mod.type) ? mod.type : keys[i];
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

// BLK-junior-20260907-2009: 保存先はサーバ側 (.assist-prefs.json) に覚えられて
// いるのに、画面のどこにも出ないので「設定済みであること」に気づけず、図種を
// 変えるたびに ⚙設定 → ファイル → パス再入力 → OK を習慣で打ち直していた。
// 上部バーのファイル名の隣に保存先を常時出し、押せば設定へ入れるようにする。
function updateTopSaveTarget() {
  var el = document.getElementById('top-save-target');
  var ST = window.MA.saveTarget;
  if (!el || !ST) return;
  var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
  var info = ST.label(cfg);
  el.textContent = info.text;
  el.title = info.title;
  el.setAttribute('data-mode', info.mode);
  if (info.configured) el.classList.add('configured');
  else el.classList.remove('configured');
  updateTopSaveButton();
}

// BLK-junior-20260913-0306: 保存だけがボタンを持たず、Ctrl+K で「ファイルを保存」と
// 打つ経路しか無かった。文言は保存先によって変わる (フォルダ運用なら上書き保存)。
function updateTopSaveButton() {
  var btn = document.getElementById('top-save');
  var ST = window.MA.saveTarget;
  if (!btn || !ST || !ST.saveButton) return;
  var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
  var doc = null;
  try { doc = window.MA.workspace ? window.MA.workspace.getActive() : null; } catch (e) { doc = null; }
  var info = ST.saveButton(cfg, doc, (currentParsed && currentParsed.meta && currentParsed.meta.title) || '');
  btn.textContent = info.text;
  btn.title = info.title;
  btn.setAttribute('data-mode', info.mode);
}

// ── 開いたファイルの錠 (BLK-junior-20260908-1803-wish) ──────────────────
// 見比べのために開いた元ファイルが、名前を変え終える前の自動保存で壊れないように、
// 開いた瞬間に錠をかけ、最初に書き戻す直前で一度だけ確認する。

// 開いて作った / 読み直したタブに錠をかける。
// 既に同じ名前のタブが開いていれば、それは「今この瞬間に開いたファイル」では
// ないので錠はかけない (自分で作って保存した図に確認を出さない)。
function openExistingFile(spec) {
  var WS = window.MA.workspace;
  var already = false;
  try { already = !!(WS.findByName && WS.findByName(WS.sanitizeName(spec.name || ''))); } catch (e) {}
  var doc = WS.openOrActivate(spec);
  if (!already) markOpenedSource(doc);
  return doc;
}

// BLK-junior-20260909-0203-wish: シーケンス図に書いてある処理順を、
// アクティビティ図側で打ち直さずにたたき台として起こす。対象は「いちばん多く
// メッセージを送っている部品」で、それがその図の主役だから (選ばせない)。
// 起こしたものはたたき台なので、別タブで開いて元の図はそのままにする。
function makeActivityFromSequence() {
  var S2A = window.MA.seqToActivity;
  var WS = window.MA.workspace;
  if (!S2A || !WS) return null;
  saveActiveDoc();
  var doc = WS.getActive();
  var dsl = doc ? doc.dsl : '';
  if (!doc || doc.diagramType !== 'plantuml-sequence') {
    if (window.MA.toast) window.MA.toast.show('シーケンス図を開いてから使ってください');
    return null;
  }
  var who = S2A.mainParticipant(dsl);
  var labels = S2A.actions(dsl, who);
  if (!labels.length) {
    if (window.MA.toast) window.MA.toast.show('この図には取り込めるメッセージがありません');
    return null;
  }
  var name = WS.sanitizeName(S2A.draftName(doc.name, who));
  openExistingFile({
    name: name,
    dsl: S2A.draft(dsl, who, name),
    diagramType: 'plantuml-activity',
  });
  applyActiveDoc();
  if (window.MA.toast) {
    window.MA.toast.show(doc.name + ' の ' + who + ' が送る ' + labels.length
      + ' 件を Action にした下書きを別タブで開きました');
  }
  return name;
}

// BLK-junior-20260912-2206-wish: 手本になるコンポーネント図が 1 枚も無い部品を、
// 部品名 1 語から起こす。本体 1 つを末尾に追加してから依存チェックの起点を選び直す
// 組み立てを、押した 1 回にまとめる。
// 起こしたものはたたき台なので、別タブで開いて今の図はそのままにする。
function makeComponentDraft(subject) {
  var CS = window.MA.componentStarter;
  var WS = window.MA.workspace;
  if (!CS || !WS) return null;
  saveActiveDoc();
  var docs = WS.list ? WS.list() : [];
  var plan = CS.plan(subject, docs);
  if (!plan) {
    if (window.MA.toast) window.MA.toast.show('部品名を入れてください (例: TIMER)');
    return null;
  }
  // 同じ名前のタブがあっても中身は上書きしない (書きかけを消さない)。
  // 下書きは常に新しいタブに出し、要らなければ閉じれば済むようにする。
  var doc = WS.open({
    name: CS.docName(subject),
    dsl: CS.dsl(subject, docs),
    diagramType: 'plantuml-component',
  });
  var name = doc.name;
  applyActiveDoc();
  if (window.MA.toast) {
    window.MA.toast.show(plan.body + ' と依存 ' + plan.rows.length
      + ' 本の下書きを別タブで開きました');
  }
  return name;
}
window.MA.makeComponentDraft = makeComponentDraft;

// パレットからの入口。図種を問わず使えるので、部品名だけその場で聞く。
function promptComponentDraft() {
  var s = window.prompt('コンポーネント図を起こす部品名 (例: TIMER)', '');
  if (s == null) return null;
  return makeComponentDraft(s);
}

function markOpenedSource(doc) {
  if (!doc || !window.MA.sourceLock) return;
  // 開いたときの本文も憶える。読むだけの回で確認が割り込まないための材料
  // (BLK-junior-20260914-0906)。
  try { window.MA.sourceLock.mark(doc.id, doc.name, doc.dsl); } catch (e) {}
  try { updateTopSourceLock(); } catch (e) {}
}

function updateTopSourceLock() {
  var el = document.getElementById('top-source-lock');
  var SL = window.MA.sourceLock;
  if (!el) return;
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  var info = (SL && doc) ? SL.label(doc.id, doc.name) : null;
  if (!info) { el.hidden = true; el.textContent = ''; el.title = ''; return; }
  el.hidden = false;
  el.textContent = info.text;
  el.title = info.title;
}

// 開いているタブの名前一覧 (控えの名前が既存タブと衝突しないように渡す)。
function _openDocNames() {
  try { return window.MA.workspace ? window.MA.workspace.list().map(function(d) { return d.name; }) : []; }
  catch (e) { return []; }
}

// 確認は 1 枚のドキュメントにつき 1 回きり。開いている間に何度も出さない。
var _sourceAskOpenFor = null;
function askSourceLock(doc) {
  var SL = window.MA.sourceLock;
  if (!SL || !doc || _sourceAskOpenFor === doc.id) return;
  if (document.getElementById('source-lock-modal')) return;
  _sourceAskOpenFor = doc.id;
  var t = SL.askText(doc.name);
  var used = _openDocNames();
  var wrap = document.createElement('div');
  wrap.id = 'source-lock-modal';
  wrap.innerHTML = '<div id="source-lock-panel" role="dialog" aria-modal="true" aria-label="' + t.title + '">'
    + '<h3 style="margin:0 0 8px;">' + t.title + '</h3>'
    + '<p id="source-lock-body" style="margin:0 0 12px;line-height:1.6;">' + t.body + '</p>'
    + '<div style="display:flex;flex-direction:column;gap:6px;">'
    + '<button type="button" id="source-lock-keep">' + t.keep + '</button>'
    + '<button type="button" id="source-lock-overwrite">' + t.overwrite + '</button>'
    + '</div>'
    // BLK-primary-20260909-0403: 開いたファイルの数だけ聞かれると、タブを切り替える
    // たびに割り込まれる。既定で「他のファイルも同じ扱い」にして 1 回で済ませる。
    + '<label id="source-lock-all-label" style="display:flex;gap:6px;align-items:center;margin-top:10px;font-size:12px;">'
    + '<input type="checkbox" id="source-lock-all" checked>' + t.all + '</label>'
    + '</div>';
  document.body.appendChild(wrap);
  function close() {
    _sourceAskOpenFor = null;
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }
  function answer(choice) {
    var allEl = wrap.querySelector('#source-lock-all');
    var all = !allEl || allEl.checked;
    var res = SL.answer(doc.id, choice, used, all);
    close();
    var also = all ? '（開いている他のファイルも同じ扱いにします）' : '';
    if (choice === 'keep' && window.MA.workspace) {
      // 控えの名前でしか書かないので、書き先が無い状態は作らない。
      setSaveStatus('🔒 ' + doc.name + '.puml は変更前のまま保ちます（' + res.name + '.puml に書きます）' + also);
    } else {
      setSaveStatus('✎ ' + res.name + '.puml を書き換えます' + also);
    }
    updateTopSourceLock();
    saveActiveDoc();
  }
  wrap.querySelector('#source-lock-keep').addEventListener('click', function() { answer('keep'); });
  wrap.querySelector('#source-lock-overwrite').addEventListener('click', function() { answer('overwrite'); });
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
var currentDiagramType = 'plantuml-sequence';
var currentModule = null;
var currentParsed = { meta: {}, elements: [], relations: [], groups: [] };
var suppressSync = false;
// 図種レールのハイライトを現在の図種に合わせ直す。setupDiagramRail が実体を入れる
// (レールが無い環境でも呼び出し側が分岐を書かずに済むよう既定は no-op)。
var syncRail = function() {};
// キャンバス上のズーム帯を現在の倍率・図種に合わせ直す。setupZoomHud が実体を入れる。
var syncZoomHud = function() {};
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
  // BLK-builder-20260907-2237-2 (design 1a): モードを変えたくなるのは状態表示を見た
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
    // BLK-junior-20260907-2009: server から保存先を引き継いだ直後にも上部バーを
    // 引き直す。ここを通さないと「覚えられているのに画面に出ない」が残る。
    function doRestoreAndSync() { doRestore(); updateTopSaveTarget(); }
    var p = as.init();
    if (p && typeof p.then === 'function') {
      p.then(doRestoreAndSync, doRestoreAndSync);
    } else {
      doRestoreAndSync();
    }
  })();

  // 上部バーの保存先チップ。押したら設定を開く (今の値を確かめて直せる)。
  (function setupTopSaveTarget() {
    var el = document.getElementById('top-save-target');
    if (!el) return;
    el.addEventListener('click', function() {
      var btn = document.getElementById('btn-config');
      if (btn) btn.click();
    });
    // 保存先の隣の [💾 保存] (BLK-junior-20260913-0306)。押す先は Ctrl+K の
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
    updateLineNumbers();
    scheduleRefresh();
    // Auto-save: schedule a debounced write of the current DSL keyed by
    // the active diagram-type (closure-tracked, kept in sync by the
    // diagram-type change handler).
    if (window.MA.autoSave) {
      window.MA.autoSave.scheduleSave(currentDiagramType, mmdText);
    }
    // アクティブなタブの中身も更新する (タブ切替とリロードで残る)。
    if (window.MA.workspace) {
      try { window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType }); } catch (e) {}
    }
    // 前回保存時点との差分バッジを追従させる。
    try { renderDiffBadge(); } catch (e) {}
    try { renderVersionBadge(); } catch (e) {}
    // BLK-junior-20260907-1403-wish: 「見てもらいながらその場で直す」ので、
    // 指摘は打つたびに引き直す。
    try { renderReviewBadge(); } catch (e) {}
    try { renderConsistencyBadge(); } catch (e) {}
    try { renderEventSyncBadge(); } catch (e) {}
    try { renderPinBadge(); } catch (e) {}
  });

  editorEl.addEventListener('scroll', function() {
    if (lineNumbersEl) lineNumbersEl.scrollTop = editorEl.scrollTop;
    // design 5c: 挿入先マーカーはエディタの座標で置くので、追随させる。
    if (window.MA.insertMarker) window.MA.insertMarker.sync();
  });

  // ── BLK-primary-20260908-1603: 選ぶ前の対応表示 (peek) ──
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
    // BLK-primary-20260907-0356: ガイド線にも「DSL の何行目に入るか」を出す。
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
  function _insertGuideLabel(res) {
    if (!res || !currentModule) return null;
    // BLK-human-20260912-0901: 帯 (activate/deactivate) の内側 / 外側までガイドに出す。
    // module に describeInsertGuide があれば、現在の DSL を渡してそちらに任せる。
    if (typeof currentModule.describeInsertGuide === 'function') {
      var label = currentModule.describeInsertGuide(res.line, res.position, mmdText);
      if (label) return label;
    }
    if (typeof currentModule.insertTargetLine !== 'function') return null;
    var target = currentModule.insertTargetLine(res.line, res.position, mmdText);
    if (target === null || typeof target === 'undefined') return null;
    return '+ DSL ' + target + ' 行目に挿入';
  }

  // ── 矢印に乗せたときの相手表示 ──
  // BLK-junior-20260908-1703: 同じ部品から出る点線が 2 本あると色も太さも同じで、
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

  // BLK-human-20260912-2130: 1 つの要素・関係の当たり判定は複数の rect に分かれる
  // (関係なら「線と矢じりとラベルを囲う箱」+「ラベルごとの小さい箱」)。CSS の :hover は
  // マウスの下の 1 枚しか光らせないので、ラベルに乗せるとラベルの分だけが枠になり、
  // 「どこまで押せば同じものを選べるか」が枠から読めない。同じ data-type / data-id を
  // 持つ rect を全部まとめて光らせ、枠 = 当たり判定の範囲、を図種によらず成り立たせる。
  if (overlayElForHover) {
    var _hoverPeerKey = null;
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
      var key = type + ' ' + id;
      if (key === _hoverPeerKey) return;
      _clearHoverPeers();
      _hoverPeerKey = key;
      // data-id は利用者が付けた名前なので、セレクタに埋めず属性を直接見比べる。
      Array.prototype.forEach.call(
        overlayElForHover.querySelectorAll('rect.selectable[data-type]'),
        function(r) {
          if (r.getAttribute('data-type') === type && r.getAttribute('data-id') === id) {
            r.classList.add('hit-hover');
          }
        });
    });
    overlayElForHover.addEventListener('mouseleave', _clearHoverPeers);
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
        var res = resolver(overlayElForHover, x, y);
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
      var res = resolver(overlayElForHover, x, y);
      if (!res) return;
      var insertCtx = {
        getMmdText: function() { return mmdText; },
        setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; },
        onUpdate: function() { scheduleRefresh(); },
      };
      // BLK-primary-20260907-0356: insertPicker を持つ module は、まず「何を挿入するか」
      // (メッセージ/note/alt/loop/activate/その他) のメニューを出す。
      // 持たない module は従来どおり単一種別のフォームを直接開く。
      if (moduleHas('insertPicker') && typeof currentModule.showInsertPicker === 'function') {
        currentModule.showInsertPicker(insertCtx, res.line, res.position);
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
    // drag suppress: participant drag 直後の click は無視 (capture phase で先取り)
    overlayEl.addEventListener('click', function(e) {
      if (Date.now() - justDraggedAt < DRAG_CLICK_SUPPRESS_MS) {
        e.stopImmediatePropagation();
      }
    }, true);
    window.MA.selectionRouter.bind(overlayEl);
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
  document.addEventListener('keydown', function(e) {
    if (e.isComposing) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var key = (e.key || '').toLowerCase();
    var isUndo = key === 'z' && !e.shiftKey;
    var isRedo = key === 'y' || (key === 'z' && e.shiftKey);
    if (!isUndo && !isRedo) return;
    var ae = document.activeElement;
    if (ae && ae !== editorEl) {
      var tag = ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return;
    }
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
    if (!cur) return;

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
      currentModule.deleteSelectedLine({
        getMmdText: function() { return mmdText; },
        setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; },
        onUpdate: function() { scheduleRefresh(); },
      }, cur.line);
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
    //    同期再パースが無く、currentParsed は scheduleRefresh() の非同期 tick まで古いままである。
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

  // BLK-builder-20260907-1346-3 (design 5b): 図形を選んでいるときの Alt+↑ / Alt+↓ で、
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

  // BLK-builder-20260907-1346-3 (design 5b): Ctrl+Enter で右ペインの「末尾に追加」を開く。
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
      if (!t || t === sel.value) return;  // 同じ図種の押し直しは何もしない
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
  })();

  // ── ツールメニュー (design 7a): 機能ボタンを 6 分類に畳む ────────────────
  // タブ列に横並びだった機能ボタンを 1 つの「ツール」に畳む。メニュー項目は
  // 既存ボタンの click を鳴らすだけで、処理そのものは元のボタン側に残す
  // (Ctrl+K のコマンドパレットと同じ経路を通す)。
  // 畳んだ状態は localStorage に憶える。既定は畳まない (今のタブ列のまま) で、
  // 「ツール ▾」の中の「タブ列から畳む / タブ列に戻す」で切り替える。
  (function setupToolMenu() {
    var btn = document.getElementById('btn-tab-tools');
    // 静かなタブ列で「ツール ▾」の代わりに出る小さな入口 (BLK-primary-20260908-1803)
    var mini = document.getElementById('btn-tab-tools-mini');
    var menu = document.getElementById('tool-menu');
    var bar = document.getElementById('tab-bar');
    var tm = window.MA.toolMenu;
    if (!btn || !menu || !bar || !tm) return;

    var FOLD_KEY = 'plantuml-tools-folded';
    // design 7b: 「ツール ▾」自体もタブ列に置かない。既定は静か。
    var QUIET_KEY = 'plantuml-tools-quiet';

    function foldable() {
      return Array.prototype.filter.call(bar.querySelectorAll('.tab-tool'), function(b) {
        return tm.isFoldable(b.id);
      });
    }

    function applyFold(folded) {
      foldable().forEach(function(b) { b.classList.add('tool-folded'); });
      bar.classList.toggle('tools-folded', !!folded);
      syncToolButton();
    }

    function isFolded() {
      return bar.classList.contains('tools-folded');
    }

    function isQuiet() {
      return bar.classList.contains('tools-quiet');
    }

    // 「ツール ▾」を出すかどうかは畳み方と静かさの組で決まる (tool-menu.js が正本)。
    function syncToolButton() {
      bar.classList.toggle('tools-hide-tool-btn',
        !tm.showsToolButton(isFolded(), isQuiet()));
      // 「ツール ▾」を出さないときは、代わりに「他 N 件」の札を出す。
      // N は今タブ列から消えているボタンの数 (メニューに載っている数と同じ)。
      bar.classList.toggle('tools-hide-mini-btn',
        !tm.showsMiniButton(isFolded(), isQuiet()));
      if (mini) mini.textContent = tm.miniLabel(foldable().length);
    }

    function applyQuiet(quiet) {
      bar.classList.toggle('tools-quiet', !!quiet);
      syncToolButton();
    }

    // タブ列のボタン文字の末尾に出る件数 (「📌 指摘 3」の 3) をメニューにも出す。
    // 「−」や 0 は数が無い印なので付けない。
    function badges() {
      var out = {};
      foldable().forEach(function(b) {
        var m = /(\d+)\s*$/.exec(b.textContent || '');
        if (m && m[1] !== '0') out[b.id] = m[1];
      });
      return out;
    }

    function setExpanded(v) {
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (mini) mini.setAttribute('aria-expanded', v ? 'true' : 'false');
    }

    function close() {
      menu.hidden = true;
      setExpanded(false);
    }

    function open() {
      menu.innerHTML = tm.buildMenuHtml(badges())
        + '<div class="tool-menu-group"><button type="button" class="tool-menu-item" id="tool-menu-fold">'
        + '<span class="tool-menu-label">'
        + (isFolded() ? 'タブ列に戻す' : 'タブ列から畳む')
        + '</span></button>'
        // design 7b: タブ列を図のタブだけにする / ツール ▾ を出す の切り替え。
        + '<button type="button" class="tool-menu-item" id="tool-menu-quiet">'
        + '<span class="tool-menu-label">'
        + (isQuiet() ? 'ツール ▾ をタブ列に出す' : 'タブ列を図のタブだけにする')
        + '</span></button></div>';
      menu.hidden = false;
      setExpanded(true);
    }

    function toggle(e) {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    }

    btn.addEventListener('click', toggle);
    if (mini) mini.addEventListener('click', toggle);

    menu.addEventListener('click', function(e) {
      var item = e.target && e.target.closest ? e.target.closest('.tool-menu-item') : null;
      if (!item) return;
      if (item.id === 'tool-menu-fold') {
        var next = !isFolded();
        // 畳み方をここで自分で選んだ人は「ツール ▾」を入口として使っている。
        // 7b の静かな既定は解いて、入口をタブ列に残す (Ctrl+K だけにしない)。
        applyQuiet(false);
        applyFold(next);
        try { localStorage.setItem(FOLD_KEY, next ? '1' : '0'); } catch (err) {}
        try { localStorage.setItem(QUIET_KEY, '0'); } catch (err) {}
        close();
        return;
      }
      if (item.id === 'tool-menu-quiet') {
        var q = !isQuiet();
        applyQuiet(q);
        try { localStorage.setItem(QUIET_KEY, q ? '1' : '0'); } catch (err) {}
        close();
        return;
      }
      var target = document.getElementById(item.getAttribute('data-target'));
      close();
      // パネル類は「外側の click で閉じる」を document に付けているので、
      // 今の click を配り終えてから鳴らす (同期だと開いた直後に閉じる)。
      if (target) setTimeout(function() { target.click(); }, 0);
    });

    document.addEventListener('click', function(e) {
      if (menu.hidden) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      if (mini && mini.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !menu.hidden) close();
    });

    // design 7a/7b: 既定は畳んだ状態。タブ列に 25 個の機能ボタンが並ぶと横スクロールが
    // 要り、「今どれを見ているか」の図タブが「何をするか」に埋もれる。畳んだ側を既定に
    // すると、タブ列は図のタブと ＋ / 一覧 / ツール ▾ だけになり、件数は下端に出る。
    // 一度でも「タブ列に戻す」を押した人はその選択が残る。
    // design 7b: さらに「ツール ▾」も置かない。タブ列は図のタブと ＋ / 一覧 だけになり、
    // 機能は Ctrl+K から引く (件数は下端の状態表示に出ている)。
    var saved = null;
    var savedQuiet = null;
    try { saved = localStorage.getItem(FOLD_KEY); } catch (err) {}
    try { savedQuiet = localStorage.getItem(QUIET_KEY); } catch (err) {}
    applyQuiet(tm.quietAtStart(savedQuiet));
    applyFold(tm.foldedAtStart(saved));
  })();

  // ── 下端の件数表示 (design 7a / 7b) ─────────────────────────────────────
  // 差分・指摘・指摘箱の件数はタブ列のボタン文字にしか出ておらず、ツールを畳むと
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
        out.textContent = SC.statusText(it.prefix, src.textContent);
        out.classList.toggle('has-open', SC.isActive(src.textContent));
        out.title = src.title || it.title;
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
    // design 5d: 網羅一覧の描き直し。結線は下の if (ST) で入れる。
    var drawCoverage = null;
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

    // ── 描画エンジン (BLK-human-20260909-2200) ────────────────────────────
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
      if (fetchBtn) fetchBtn.disabled = !jar.canFetch;
      var pickBtn = document.getElementById('cfg-jar-pick');
      // Web 版にはネイティブのダイアログが無いので、パス欄に打って反映させる。
      if (pickBtn) pickBtn.textContent = AB.isApp(env) ? 'jar を選ぶ' : 'このパスを使う';
    }

    function setEngineNote(msg, bad) {
      var el = document.getElementById('cfg-engine-note');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = bad ? 'var(--accent-red)' : 'var(--text-secondary)';
    }

    function afterEngineChange(res) {
      if (!res) return;
      if (res.canceled) { setEngineNote('選ばれませんでした'); return; }
      if (res.error) { setEngineNote(res.error, true); return; }
      _renderEnv = res.env || _renderEnv;
      setEngineNote('plantuml.jar: ' + (res.jarPath || ''));
      renderModeCards();
      refreshRenderNote();
      refreshEngineSection();
    }

    (function wireEngineButtons() {
      var AB = window.MA.appBridge;
      if (!AB) return;
      var pickBtn = document.getElementById('cfg-jar-pick');
      if (pickBtn) pickBtn.addEventListener('click', function() {
        var pathEl = document.getElementById('cfg-jar-path');
        setEngineNote('選んでいます…');
        if (AB.isApp(_renderEnv)) AB.pickJar().then(afterEngineChange);
        else AB.setJarPath(pathEl ? pathEl.value : '').then(afterEngineChange);
      });
      var fetchBtn = document.getElementById('cfg-jar-fetch');
      if (fetchBtn) fetchBtn.addEventListener('click', function() {
        setEngineNote('公式から取得しています… (数十 MB あります)');
        AB.fetchJar().then(afterEngineChange);
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

      // design 5d: UML 要素の網羅一覧。図種ごとの「常時表示 / その他パレット」の
      // 配分を 1 枚の表にして、配分そのものを指摘できるようにする。いま編集して
      // いる図種の行に「編集中」を付けるので、開いている図の配分から読み始められる。
      var cvSearch = document.getElementById('cfg-cv-search');
      drawCoverage = function() {
        var list = document.getElementById('cfg-cv-list');
        if (list) list.innerHTML = ST.buildCoverageHtml(currentDiagramType, cvSearch ? cvSearch.value : '');
        var note = document.getElementById('cfg-cv-note');
        if (note && !note.textContent) note.textContent = ST.COVERAGE_NOTE;
      };
      drawCoverage();
      if (cvSearch) cvSearch.addEventListener('input', drawCoverage);

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
      var dirInput = document.getElementById('cfg-file-dir');
      if (dirInput) dirInput.value = cfg.fileDir || './autosave';
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
        // 開くたびに引き直す (図種を替えた後も「編集中」が正しい行に付く)
        if (drawCoverage) drawCoverage();
      }
      modal.style.display = 'flex';
    }
    function close() { modal.style.display = 'none'; }

    btn.addEventListener('click', open);
    // BLK-builder-20260907-2237-2 (design 1a): 上部バーからモードの select を外した
    // 代わりに、状態表示から設定の「レンダリング」タブへ直接開ける口を出す。
    // タブ指定で開けるようにしておくと、他の入口も同じ経路を使える。
    window.MA.openSettingsTab = function(tabId) {
      open();
      if (tabId && ST) {
        var t = ST.normalizeTab(tabId);
        renderTabBar(t);
        showTab(t);
      }
    };
    document.getElementById('cfg-cancel').addEventListener('click', close);
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
      var fileDirEl = document.getElementById('cfg-file-dir');
      var fileDir = fileDirEl ? (fileDirEl.value.trim() || './autosave') : './autosave';
      // BLK-primary-20260908-0103: バックスラッシュ区切りの絶対パスは往復で
      // 壊れることがあり、壊れた値のまま保存されると 📂一覧が黙って空になる。
      // 保存する前にここで直せる崩れは直し (\ → /)、直せない崩れは保存しない。
      var dirMsgEl = document.getElementById('cfg-file-dir-msg');
      if (dirMsgEl) dirMsgEl.textContent = '';
      var SDH = window.MA.saveDirHandoff;
      if (SDH && backend === 'file') {
        var chk = SDH.check(fileDir);
        if (!chk.ok) {
          if (dirMsgEl) dirMsgEl.textContent = '⚠ ' + chk.reason;
          if (fileDirEl) fileDirEl.focus();
          return;   // 設定モーダルは閉じない。壊れた値のまま先へ進ませない
        }
        fileDir = chk.value;
        if (fileDirEl) fileDirEl.value = fileDir;
      }
      if (window.MA.autoSave) {
        window.MA.autoSave.setConfig({
          enabled: enabled,
          debounceMs: debounceMs,
          restoreMode: restoreMode,
          backend: backend,
          fileDir: fileDir,
        });
        // 保存先を変えたらすぐ上部バーに映す (次に開くまで古い表示を残さない)。
        updateTopSaveTarget();
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

    syncZoomHud = function() {
      host.innerHTML = hud.buildHudHtml(currentDiagramType, zoom);
    };
    syncZoomHud();

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
    var csvBtn = document.getElementById('btn-state-table-csv');
    var ST = window.MA.stateTable;
    if (!panel || !body || !toggle || !ST) return;

    var open = false;

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
        html += '<tr><th>' + esc(row.label) + '</th>';
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
      currentModule.showAddTransitionModal({
        getMmdText: function() { return mmdText; },
        setMmdText: function(s) {
          mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false;
        },
        onUpdate: function() { scheduleRefresh(); },
      }, currentParsed, td.getAttribute('data-state-id'), {
        trigger: td.getAttribute('data-trigger') === window.MA.stateTable.NO_TRIGGER
          ? '' : td.getAttribute('data-trigger'),
      });
    });

    if (csvBtn) {
      csvBtn.addEventListener('click', function() {
        var csv = ST.toCsv(currentTable());
        // Excel が UTF-8 と判断できるように BOM を付ける (日本語の状態名対策)。
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob('state-transition-table.csv', blob);
      });
    }

    syncStateTable();
  })();

  // BLK-primary-20260907-0703: 右パネルの「Properties / 図の設定」タブ。
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
    if (exportMenu.classList.contains('open')) refreshFixExportEntry();
  });
  document.addEventListener('click', function() { exportMenu.classList.remove('open'); });
  document.getElementById('exp-svg').addEventListener('click', function() { exportMenu.classList.remove('open'); exportSVG(); });
  document.getElementById('exp-png').addEventListener('click', function() { exportMenu.classList.remove('open'); exportPNG(false); });
  document.getElementById('exp-png-transparent').addEventListener('click', function() { exportMenu.classList.remove('open'); exportPNG(true); });
  document.getElementById('exp-clipboard').addEventListener('click', function() { exportMenu.classList.remove('open'); exportClipboard(); });
  // BLK-primary-20260907-0443: 開いている全タブを 2 クリックで SVG 保存する。
  document.getElementById('exp-svg-all').addEventListener('click', function() { exportMenu.classList.remove('open'); exportAllSVG(); });

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
    // 一括置換 (BLK-primary-20260909-0303)。既定でタブ列から畳まれているツールなので、
    // メニューを辿らず / Ctrl+K でコマンド名を打たずに開ける道を 1 本用意する。
    else if (KB.matches('bulk-rename', e)) hit = 'bulk-rename';
    if (!hit) return;
    var ae0 = document.activeElement;
    if (ae0 && ae0 !== editorEl
      && (ae0.tagName === 'INPUT' || ae0.tagName === 'TEXTAREA' || ae0.tagName === 'SELECT' || ae0.isContentEditable)) return;
    e.preventDefault();
    if (hit === 'render') { scheduleRefresh(); return; }
    if (hit === 'bulk-rename') {
      var renameBtn = document.getElementById('btn-tab-rename');
      if (renameBtn) renameBtn.click();
      return;
    }
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
    // Force-save the OUTGOING type's current editor content. We schedule
    // a save keyed to currentDiagramType (NOT the new t) and flush so even
    // if no debounce was pending, the latest mmdText is persisted before
    // we leave this type. Wrapped in try/catch — never block a type switch
    // on autosave failures.
    if (window.MA.autoSave) {
      try {
        window.MA.autoSave.scheduleSave(currentDiagramType, mmdText);
        window.MA.autoSave.flush();
      } catch (e) { /* never block type switch */ }
    }
    // Persist the active type so the next page load can restore it.
    try { window.localStorage.setItem('plantuml-diagram-type', t); } catch (e) { /* private mode etc */ }
    // タブごとに図の種類を持つ: 現在のタブの種類を差し替える。DSL は
    // 下で新しい種類の内容に入れ替わるので、そちらは後段で書き戻す。
    var wsDoc = null;
    if (window.MA.workspace) {
      try { wsDoc = window.MA.workspace.updateActive({ dsl: mmdText, diagramType: t }); } catch (e) {}
    }
    // BLK-junior-20260909-0703: 切り替える前の図が白紙・見本のままだったかを
    // 見てから差し替える (白紙のタブで図種を選び直しただけの人に見本を出さない)。
    var prevType = currentDiagramType;
    var prevTemplate = currentModule && currentModule.template ? currentModule.template() : '';
    currentDiagramType = t;
    window.MA.history.pushHistory();
    currentModule = mod;  // explicit user choice overrides auto-detection
    // Per-type restore: if a saved DSL exists for the new type, prefer it
    // over the default template. Type switch is an explicit user action so
    // we silently restore (no confirm() prompt regardless of restoreMode).
    var savedForType = window.MA.autoSave ? window.MA.autoSave.restoreFor(t) : null;
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
    getMmdText: function() { return mmdText; },
    setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; scheduleRefresh(); },
    onUpdate: function() { updateUndoRedoButtons(); },
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
  setupRenameImpact();
  setupDepGraph();
  setupTicketBoard();
  setupVault();
  setupSymptomSearch();
  setupPatternCheck();
  setupXrefGraph();
  setupBulkApply();
  setupTemplateNew();
  setupDiffPanel();
  setupReviewPanel();
  setupChangeBoard();
  setupExportPick();
  setupFixExport();
  setupComponentPack();
  setupMaterialExport();
  setupMaterialBoard();
  setupReqTrace();
  setupHandoverBanner();
  setupAuditTimeline();
  setupAuditBoard();
  setupSaveCheck();
  setupSaveSwap();
  setupVersionTimeline();
  setupLineage();
  setupPeekFolder();
  setupPinPanel();
  setupPinInbox();
  setupManualFindings();
  setupNameAudit();
  setupSubmitCheck();
  setupFamilyAudit();
  setupDriverMap();
  setupTraceCoverage();
  setupHandoffPackage();
  setupDeliveryPackage();
  setupFamilyClone();
  setupConsistencyPanel();
  setupEventSyncPanel();
  setupLineEdit();
  setupOutline();
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
  // Render `💾 N秒前` (relative time) in #status-autosave, refreshed on
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
    function update() {
      if (!window.MA.autoSave.isAvailable()) {
        span.textContent = '';
        return;
      }
      var meta = window.MA.autoSave.getMeta();
      if (!meta) { span.textContent = ''; return; }
      span.textContent = '💾 ' + relTime(meta.lastSavedAt);
      span.title = '最終保存: ' + meta.lastSavedAt + ' (' + (meta.lastSavedType || '').replace('plantuml-', '') + ')';
    }
    window.MA.autoSave.onSave(function() { update(); });
    update();
    setInterval(update, 5000);
  })();

  initCommandPalette();

  startHeartbeat();
}

// BLK-junior-20260907-2303: 行番号から要素を選ぶ。プレビュー上の座標は
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

// ── Command palette (BLK-builder-20260907-0803-1 / design 1a) ───────────────
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
      // BLK-builder-20260908-0807-2-red: 「保存」の一語で名指しできるのはこれ。
      // 「保存フォルダの図を一覧」「前回保存からの差分」「SVG として保存」にも
      // その 2 文字は入っているので、完全一致のキーワードで本命を先頭に出す。
      { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', keywords: ['保存', 'save', 'file', 'ほぞん'], run: function() { clickById('btn-save'); } },
      { id: 'consistency', title: '整合性チェックを開く / Consistency', hint: 'Review', keywords: ['consistency', 'check', 'せいごう', 'かくにん'], run: function() { clickById('status-consistency'); } },
      { id: 'eventsync', title: 'イベント整合を開く / Event sync', hint: 'Review', keywords: ['event', 'sync', 'method', 'いべんと', 'せいごう', 'めそっど'], run: function() { clickById('status-eventsync'); } },
      { id: 'family-audit', title: '系統チェックを開く / Family audit', hint: 'Tabs', keywords: ['family', 'audit', 'けいとう', 'とつごう'], button: 'btn-tab-family', run: function() { clickById('btn-tab-family'); } },
      { id: 'trace-coverage', title: 'トレースカバレッジを開く / Trace coverage', hint: 'Tabs', keywords: ['trace', 'coverage', 'とれーす', 'もれ', 'せんい'], button: 'btn-tab-trace', run: function() { clickById('btn-tab-trace'); } },
      // BLK-primary-20260907-0923: タブバーの道具はどれもパレットに無く、design 1a で
      // ペインが狭くなった後は潰れたラベルを目で数えて押すしか経路が無かった。
      // BLK-primary-20260908-0923-design (7b): タブ列から「ツール ▾」も消えるので、
      // 6 分類のメニュー自体を引く経路をここに置く (メニューは画面左上に開く)。
      { id: 'tab-tools', title: 'ツールを分類から選ぶ / Tools', hint: 'Tabs', keywords: ['tool', 'menu', 'つーる', 'どうぐ', 'ぶんるい', 'めにゅー'], run: function() { setTimeout(function() { clickById('btn-tab-tools'); }, 0); } },
      { id: 'seq-to-activity', title: 'シーケンス図からアクティビティ図を起こす / Sequence to activity', hint: 'Tabs', keywords: ['activity', 'sequence', 'draft', 'あくてぃびてぃ', 'しーけんす', 'おこす', 'したがき'], run: function() { makeActivityFromSequence(); } },
      { id: 'component-draft', title: '定石構成からコンポーネント図を起こす / Component draft', hint: 'Tabs', keywords: ['component', 'draft', 'こんぽーねんと', 'じょうせき', 'おこす', 'したがき'], run: function() { promptComponentDraft(); } },
      { id: 'tab-new', title: '新しい図を開く / New diagram', hint: 'Tabs', keywords: ['new', 'tab', 'あたらしい', 'ず'], button: 'btn-tab-new', run: function() { clickById('btn-tab-new'); } },
      { id: 'tab-folder', title: '保存フォルダの図を一覧 / Folder', hint: 'Tabs', keywords: ['folder', 'list', 'いちらん', 'ふぉるだ'], button: 'btn-tab-folder', run: function() { clickById('btn-tab-folder'); } },
      { id: 'change-ticket', title: '変更チケットを開く / Change tickets', hint: 'Tabs', keywords: ['ticket', 'change', 'impact', 'ちけっと', 'へんこう', 'つづき', 'しようへんこう'], run: function() { toggleTicketBoard(true); } },
      { id: 'vault', title: '提出物庫を開く / Deliverable vault', hint: 'Tabs', keywords: ['vault', 'export', 'ていしゅつ', 'こ', 'かこ', 'ぜんかい'], run: function() { toggleVault(true); } },
      { id: 'tab-rename', title: '部品名を一括置換 / Bulk rename', hint: 'Tabs', keywords: ['rename', 'replace', 'いっかつ', 'ちかん'], button: 'btn-tab-rename', run: function() { clickById('btn-tab-rename'); } },
      { id: 'tab-symptom', title: '症状から関連図を探す / Symptom search', hint: 'Tabs', keywords: ['symptom', 'search', 'しょうじょう', 'けんさく', 'ふぐあい'], button: 'btn-tab-symptom', run: function() { clickById('btn-tab-symptom'); } },
      { id: 'tab-pattern', title: '同じ観点で全図を棚卸し / Pattern check', hint: 'Tabs', keywords: ['pattern', 'check', 'かんてん', 'いっかつ', 'してき', 'たなおろし'], button: 'btn-tab-pattern', run: function() { clickById('btn-tab-pattern'); } },
      { id: 'tab-submit', title: '提出前チェックを開く / Submit check', hint: 'Tabs', keywords: ['submit', 'check', 'ていしゅつ', 'かくにん', '略語'], button: 'btn-tab-submit', run: function() { clickById('btn-tab-submit'); } },
      { id: 'tab-xref', title: '参照関係を開く / Cross-reference', hint: 'Tabs', keywords: ['xref', 'reference', 'project', 'さんしょう', 'かんけい'], button: 'btn-tab-xref', run: function() { clickById('btn-tab-xref'); } },
      { id: 'tab-audit', title: '名前突合を開く / Name audit', hint: 'Tabs', keywords: ['name', 'audit', 'なまえ', 'つきあわせ'], button: 'btn-tab-audit', run: function() { clickById('btn-tab-audit'); } },
      { id: 'tab-handoff', title: '引き継ぎパッケージを作る / Handoff package', hint: 'Tabs', keywords: ['handoff', 'package', 'zip', 'ひきつぎ', 'ぱっけーじ'], button: 'btn-tab-handoff', run: function() { clickById('btn-tab-handoff'); } },
      { id: 'tab-delivery', title: '納品パッケージを作る / Delivery package', hint: 'Tabs', keywords: ['delivery', 'package', 'zip', 'のうひん', 'ぱっけーじ', '提出'], button: 'btn-tab-delivery', run: function() { clickById('btn-tab-delivery'); } },
      { id: 'tab-lines', title: '行編集を開く / Line edit', hint: 'Tabs', keywords: ['line', 'edit', 'ぎょう', 'へんしゅう'], button: 'btn-tab-lines', run: function() { clickById('btn-tab-lines'); } },
      { id: 'tab-compare', title: '並べて見る / Compare', hint: 'Tabs', keywords: ['compare', 'side', 'ならべて', 'みくらべ'], button: 'btn-tab-compare', run: function() { clickById('btn-tab-compare'); } },
      { id: 'tab-template', title: 'テンプレートから新しい図を作る / Template', hint: 'Tabs', keywords: ['template', 'copy', 'てんぷれ', 'ふくせい'], button: 'btn-tab-template', run: function() { clickById('btn-tab-template'); } },
      { id: 'tab-diff', title: '前回保存からの差分 / Diff', hint: 'Tabs', keywords: ['diff', 'change', 'さぶん', 'へんこう'], button: 'btn-tab-diff', run: function() { clickById('btn-tab-diff'); } },
      { id: 'tab-pins', title: 'レビュー指摘 / Review pins', hint: 'Tabs', keywords: ['pin', 'review', 'してき', 'ぴん'], button: 'btn-tab-pins', run: function() { clickById('btn-tab-pins'); } },
      { id: 'tab-set', title: 'セット複製 / Clone a set', hint: 'Tabs', keywords: ['set', 'clone', 'family', 'せっと', 'ふくせい'], button: 'btn-tab-set', run: function() { clickById('btn-tab-set'); } },
      // design 7b: タブ列を畳むと Ctrl+K だけが手掛かりになるので、ツールメニューに
      // 載っている道具はすべてパレットからも引けなければならない。ここは
      // 「メニューにはあるがパレットに無かった」道具。題はメニューの言い換えに揃える。
      { id: 'part-starter', title: '部品を起こす (6 図種まとめて) / New part', hint: 'Tabs', keywords: ['part', 'starter', 'new', 'ぶひん', 'おこす', 'したがき', '6', 'ろく', 'ずしゅ'], button: 'btn-tab-part', run: function() { clickById('btn-tab-part'); } },
      { id: 'tab-skeleton', title: '骨格から作る / Skeleton', hint: 'Tabs', keywords: ['skeleton', 'こっかく', 'ひな形'], button: 'btn-tab-skeleton', run: function() { clickById('btn-tab-skeleton'); } },
      { id: 'tab-draft', title: '一時控えにする / Draft', hint: 'Tabs', keywords: ['draft', 'ひかえ', 'いちじ'], button: 'btn-tab-draft', run: function() { clickById('btn-tab-draft'); } },
      { id: 'tab-apply', title: '複数クラスに一括適用 / Bulk apply', hint: 'Tabs', keywords: ['apply', 'bulk', 'いっかつ', 'てきよう'], button: 'btn-tab-apply', run: function() { clickById('btn-tab-apply'); } },
      { id: 'tab-peek', title: '他の保存フォルダを覗く / Peek folder', hint: 'Tabs', keywords: ['peek', 'folder', 'ほかの', 'ふぉるだ'], button: 'btn-tab-peek', run: function() { clickById('btn-tab-peek'); } },
      { id: 'tab-drivermap', title: '系統マップを開く / Driver map', hint: 'Tabs', keywords: ['driver', 'map', 'けいとう', 'まっぷ'], button: 'btn-tab-drivermap', run: function() { clickById('btn-tab-drivermap'); } },
      { id: 'tab-cross', title: '突合ボード / Cross-check board', hint: 'Tabs', keywords: ['cross', 'board', 'audit', 'とつごう', 'ぼーど'], button: 'btn-tab-cross', run: function() { clickById('btn-tab-cross'); } },
      { id: 'tab-audit-timeline', title: '監査履歴を開く / Audit timeline', hint: 'Tabs', keywords: ['audit', 'timeline', 'かんさ', 'りれき'], button: 'btn-tab-audit-timeline', run: function() { clickById('btn-tab-audit-timeline'); } },
      { id: 'tab-review', title: '基準の図と突き合わせる / Review desk', hint: 'Tabs', keywords: ['review', 'desk', 'きじゅん', 'つきあわせ'], button: 'btn-tab-review', run: function() { clickById('btn-tab-review'); } },
      { id: 'tab-inbox', title: '図をまたぐ指摘箱 / Pin inbox', hint: 'Tabs', keywords: ['inbox', 'pin', 'してきばこ'], button: 'btn-tab-inbox', run: function() { clickById('btn-tab-inbox'); } },
      { id: 'tab-findings', title: '手動指摘の台帳 / Manual findings', hint: 'Tabs', keywords: ['findings', 'manual', 'してき', 'だいちょう'], button: 'btn-tab-findings', run: function() { clickById('btn-tab-findings'); } },
      { id: 'tab-versions', title: 'この図の変遷を見る / Version timeline', hint: 'Tabs', keywords: ['version', 'timeline', 'へんせん', 'りれき'], button: 'btn-tab-versions', run: function() { clickById('btn-tab-versions'); } },
      { id: 'tab-lineage', title: 'この図の継承元を見る / Lineage', hint: 'Tabs', keywords: ['lineage', 'parent', 'けいしょう', 'もと', 'とりこみ'], button: 'btn-tab-lineage', run: function() { clickById('btn-tab-lineage'); } },
      { id: 'tab-board', title: '変更サマリを開く / Change board', hint: 'Tabs', keywords: ['board', 'summary', 'へんこう', 'さまり'], button: 'btn-tab-board', run: function() { clickById('btn-tab-board'); } },
      // 顧客の前で開く画面 (BLK-primary-20260913-0306-wish)。ボードを開いていなければ開いてから切り替える。
      { id: 'board-svg', title: '変更前後を図で見せる / Show before-after as SVG', hint: 'Tabs', keywords: ['svg', 'customer', 'こきゃく', 'みせる', 'ずでみる'], button: 'cb-svg', run: function() {
        var modal = document.getElementById('cb-modal');
        if (!modal || modal.style.display !== 'flex') clickById('btn-tab-board');
        clickById('cb-svg');
      } },
      { id: 'settings', title: '設定を開く / Settings', hint: 'Ctrl', keywords: ['settings', 'config', 'せってい'], run: function() { clickById('btn-config'); } },
      { id: 'undo', title: '元に戻す / Undo', hint: 'Ctrl+Z', keywords: ['undo', 'もどす'], run: function() { clickById('btn-undo'); } },
      { id: 'redo', title: 'やり直す / Redo', hint: 'Ctrl+Y', keywords: ['redo', 'やりなおす'], run: function() { clickById('btn-redo'); } },
      { id: 'zoom-in', title: '拡大 / Zoom in', hint: 'View', keywords: ['zoom', 'かくだい'], run: function() { clickById('btn-zoom-in'); } },
      { id: 'zoom-out', title: '縮小 / Zoom out', hint: 'View', keywords: ['zoom', 'しゅくしょう'], run: function() { clickById('btn-zoom-out'); } },
      { id: 'zoom-fit', title: '幅に合わせる / Fit', hint: 'View', keywords: ['zoom', 'fit'], run: function() { clickById('btn-zoom-fit'); } },
      { id: 'render', title: '再描画 / Render', hint: 'View', keywords: ['render', 'refresh', 'さいびょうが'], run: function() { clickById('btn-render'); } },
      { id: 'export-svg', title: 'SVG として保存 / Export SVG', hint: 'Export', keywords: ['export', 'svg'], run: function() { clickById('exp-svg'); } },
      { id: 'export-png', title: 'PNG として保存 / Export PNG', hint: 'Export', keywords: ['export', 'png'], run: function() { clickById('exp-png'); } },
      { id: 'export-png-t', title: 'PNG（透過背景）/ Export PNG transparent', hint: 'Export', keywords: ['export', 'png', 'transparent'], run: function() { clickById('exp-png-transparent'); } },
      { id: 'export-clip', title: 'クリップボードにコピー / Copy image', hint: 'Export', keywords: ['export', 'clipboard', 'copy'], run: function() { clickById('exp-clipboard'); } },
      { id: 'export-all', title: '全図を SVG で保存（zip）', hint: 'Export', keywords: ['export', 'svg', 'zip', 'all'], run: function() { clickById('exp-svg-all'); } },
      { id: 'export-pick', title: '図を選んで SVG で保存（zip）', hint: 'Export', keywords: ['export', 'svg', 'zip', 'pick', 'select', 'changed', 'fix'], run: function() { clickById('exp-svg-pick'); } },
      { id: 'export-fix', title: '要修正のみを SVG で保存（zip）', hint: 'Export', keywords: ['export', 'svg', 'zip', 'fix', 'review'], run: function() { clickById('exp-svg-fix'); } },
      { id: 'export-material', title: '1 枚を資料化（形式は図種で自動）/ Make material', hint: 'Export', keywords: ['material', 'export', 'しりょう', '資料', 'png', 'svg'], run: function() { clickById('exp-material'); } },
      { id: 'export-pack', title: '部品の図をまとめて資料化（PNG）', hint: 'Export', keywords: ['export', 'png', 'pack', 'component', 'figure', 'zip'], run: function() { clickById('exp-png-pack'); } },
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
    ] },
    'plantuml-activity': { prefix: 'ac', kinds: [
      { value: 'action', label: 'アクション' },
      { value: 'start', label: '開始' },
      { value: 'stop', label: '停止' },
      { value: 'if', label: '条件分岐 (if)' },
      { value: 'while', label: '繰り返し (while)' },
      { value: 'repeat', label: '繰り返し (repeat)' },
      { value: 'fork', label: '並行 (fork)' },
      { value: 'swimlane', label: 'スイムレーン' },
    ] },
    'plantuml-state': { prefix: 'st', kinds: [
      { value: 'state', label: '状態' },
      { value: 'composite', label: '複合状態' },
      { value: 'transition', label: '遷移' },
      { value: 'note', label: '注釈' },
      { value: 'bulk', label: '一括 (複数行)' },
    ] },
  };

  function openTailForm(prefix, kindValue) {
    if (window.MA.selection) window.MA.selection.clearSelection();
    renderProps();
    var sel = document.getElementById(prefix + '-tail-kind');
    if (!sel) return;
    sel.value = kindValue;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    sel.focus();
  }

  function addCommands() {
    var typeEl = document.getElementById('diagram-type');
    var spec = ADD_KINDS[typeEl ? typeEl.value : ''];
    if (!spec) return [];
    return spec.kinds.map(function(k) {
      return {
        id: 'add-' + spec.prefix + '-' + k.value,
        group: 'add',
        title: k.label,
        hint: '末尾に追加',
        keywords: ['add', 'ついか', k.value, k.label],
        run: function() { openTailForm(spec.prefix, k.value); },
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
      hint.textContent = item.hint || '';
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

  function open() {
    returnFocusEl = document.activeElement;
    // add / selected は「今の図種」「今の選択」で中身が変わるので、開くたびに作り直す。
    items = CP.buildItems(
      addCommands().concat(selectedCommands()).concat(commands()),
      editorEl ? editorEl.value : '');
    input.value = '';
    groupFilter = null;
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

  if (openBtn) openBtn.addEventListener('click', open);

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

// BLK-primary-20260908-1603: DSL 行 ⇄ SVG 図形の「選ぶ前の対応表示」。
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

// 「前回見た版」の控えの置き場。使えない環境でもフォルダ一覧は出る。
function _reviewStore() {
  try { return window.localStorage || null; } catch (e) { return null; }
}

// ── 一時控えの印 (BLK-junior-20260907-2009-wish) ────────────────────────────
// やり直しの練習で作る控えが保存フォルダに溜まり、📂 一覧で成果物と同じ並びに
// 混ざっていた。印を付けた図は一覧で畳み、成果物だけが並ぶようにする。
// 印は保存フォルダごとに localStorage に持つ (判定は draft-mark が唯一の規約)。
var _draftCollapsed = true;   // 一覧を開いたときは畳んだ状態から始める

function _draftLoad() {
  var DM = window.MA.draftMark;
  return DM ? DM.load(_reviewStore(), _wsFileDir()) : [];
}

function _draftStore(names) {
  var DM = window.MA.draftMark;
  return DM ? DM.save(_reviewStore(), _wsFileDir(), names) : false;
}

function _draftHas(name) {
  var DM = window.MA.draftMark;
  return !!(DM && DM.has(_draftLoad(), name));
}

// 名前 1 つの印を裏返して控える。戻り値は裏返した後に控えかどうか。
function _draftToggleName(name) {
  var DM = window.MA.draftMark;
  if (!DM || !name) return false;
  var next = DM.toggle(_draftLoad(), name);
  _draftStore(next);
  return DM.has(next, name);
}

// 上部バーの「🗂 一時控え」。開いている図そのものに印を付ける。
// 保存の前でも後でも押せる (印は名前に付くので、次の保存にもそのまま効く)。
function toggleActiveDraft() {
  var DM = window.MA.draftMark;
  if (!DM || !window.MA.workspace) return;
  var doc = window.MA.workspace.getActive();
  if (!doc || !doc.name) return;
  var isDraft = _draftToggleName(doc.name);
  syncDraftButton();
  setSaveStatus(DM.activeMessage(doc.name, isDraft));
  if (window.MA.toast) window.MA.toast.show(DM.activeMessage(doc.name, isDraft));
}

// ボタンの文言を、今開いている図が控えかどうかに合わせる。
function syncDraftButton() {
  var DM = window.MA.draftMark;
  var btn = document.getElementById('btn-tab-draft');
  if (!btn || !DM) return;
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  var name = doc && doc.name;
  var isDraft = !!(name && _draftHas(name));
  btn.textContent = DM.activeLabel(isDraft);
  btn.setAttribute('aria-pressed', isDraft ? 'true' : 'false');
  btn.classList.toggle('tab-tool-on', isDraft);
  btn.title = name
    ? DM.rowTitle(isDraft) + '（' + name + '）'
    : 'この図に一時控え(下書き / やり直し途中)の印を付けて、📂 一覧から畳む';
}

// BLK-junior-20260908-1803: 「この名前のファイルに書いてよいか」を答える門。
// テンプレ宣言を知っている側 (一覧を持つ setupTabs の中) が起動時に差し込む。
// 書き先を持つ経路が 2 つある (auto-save.js のディスク写しと、ここの saveActiveDoc)
// ので、判断は 1 か所に置いて両方から引く。
var _fileWriteBlock = null;   // function(name) -> 理由 / null
function _blockedFileWrite(name) {
  if (!_fileWriteBlock || !name) return null;
  try { return _fileWriteBlock(String(name)) || null; } catch (e) { return null; }
}

// BLK-primary-20260913-0206: 一括置換・改名の後始末が、開いているタブを丸ごと
// 保存フォルダへ書き戻していた。そこには (a) 今回の置換が 1 文字も当たっていない図、
// (b) テンプレ宣言で書き込みを止めてある図、(c) 錠に「元のまま保つ」と答えた図が
// 混ざる。どれもタブが持っている本文で元ファイルを潰すので、見比べのために開いた
// 完了物の中身が別の図の本文に入れ替わった (reviewer の言う「内容シャッフル」)。
//
// 保存フォルダへ書くのはこの 1 か所だけにして、書いてよいかの判定を saveActiveDoc と
// 同じにする。まだ答えていない錠 (ask) は **聞かずに書かない** —— 後始末は利用者が
// 起こした操作ではないので、ここで問いを積むと操作が止まる。答えは次の編集で聞く。
// 戻り値は書いたかどうか。
function writeDocToFolder(doc, fileDir) {
  if (!doc || !window.MA.workspace) return false;
  if (_blockedFileWrite(doc.name)) {
    if (window.MA.autoSave && window.MA.autoSave.noteFileBlocked) {
      window.MA.autoSave.noteFileBlocked(doc.name, _blockedFileWrite(doc.name));
    }
    return false;
  }
  var SL = window.MA.sourceLock;
  var d = SL ? SL.decide(doc.id, doc.name, _openDocNames(), doc.dsl) : { action: 'write', name: doc.name };
  if (d.action === 'ask') return false;
  // 開いたときのまま (読むだけ) なら、書き戻す中身は元ファイルと同じ。何もしない。
  if (d.action === 'skip') return false;
  var out = (d.name === doc.name) ? doc
    : { id: doc.id, name: d.name, diagramType: doc.diagramType, dsl: doc.dsl };
  window.MA.workspace.saveToFile(out, fileDir);
  if (window.MA.saveDiff) window.MA.saveDiff.mark(out.name, out.dsl);
  if (window.MA.versionTimeline) window.MA.versionTimeline.push(out.name, out.dsl);
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
      if (d) writeDocToFolder(d, cfg.fileDir);
    });
  } catch (e) {}
}

// アクティブなタブの現在の編集内容を workspace に書き戻す。
// BLK-primary-20260914-1406-wish: 保存を試すたびに「何を・どの道で書いたか」を控える。
// 引き継ぐ前に、ここの控えとディスクを突き合わせて効いた図と効かなかった図を名指しする。
function _noteSaveVerify(doc, outcome) {
  var SV = window.MA.saveVerify;
  if (!SV || !doc || !doc.name) return;
  try { SV.note(doc.name, doc.dsl, outcome); } catch (e) {}
}

function saveActiveDoc() {
  if (!window.MA.workspace) return null;
  var doc = window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType });
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    // テンプレ宣言のあるファイルには書かない (見比べのために開いた前周の完了物が、
    // 図名を変えるまでの間に編集途中の内容で壊れる事故を止める)。
    var blocked = doc ? _blockedFileWrite(doc.name) : null;
    if (blocked) {
      if (window.MA.autoSave && window.MA.autoSave.noteFileBlocked) {
        window.MA.autoSave.noteFileBlocked(doc.name, blocked);
      }
      // BLK-primary-20260914-1406-wish: 書かなかった道もここで控える。
      // 控えないと、画面には「保存した」しか残らない。
      _noteSaveVerify(doc, 'blocked');
      renderDiffBadge();
      return doc;
    }
    if (doc && cfg && cfg.backend !== 'file') _noteSaveVerify(doc, 'download');
    if (doc && cfg && cfg.backend === 'file') {
      // BLK-junior-20260908-1803-wish: 開いたままのファイルへ最初に書き戻す前に
      // 一度だけ聞く。答えるまでは書かない (見比べ中の元ファイルを守る)。
      var SL = window.MA.sourceLock;
      var d = SL ? SL.decide(doc.id, doc.name, _openDocNames(), doc.dsl) : { action: 'write', name: doc.name };
      if (d.action === 'ask') {
        try { askSourceLock(doc); } catch (e) {}
        _noteSaveVerify(doc, 'asked');
        renderDiffBadge();
        return doc;
      }
      // BLK-junior-20260914-0906: 一覧から開いて眺めるだけの回。本文は開いたときの
      // ままなので、元ファイルは既にこの内容で、書く必要も守るものも無い。聞かない。
      if (d.action === 'skip') {
        try { updateTopSourceLock(); } catch (e) {}
        _noteSaveVerify(doc, 'skipped');
        renderDiffBadge();
        return doc;
      }
      // 既定が当たって書き先が変わることがあるので、上部バーの錠表示も合わせ直す。
      try { updateTopSourceLock(); } catch (e) {}
      if (d.name !== doc.name) doc = { id: doc.id, name: d.name, diagramType: doc.diagramType, dsl: doc.dsl };
      window.MA.workspace.saveToFile(doc, cfg.fileDir);
      // 書きに行った。効いたかどうかはディスクと突き合わせるまで分からないので、
      // 「何を書くつもりだったか」だけを控える (BLK-primary-20260914-1406-wish)。
      _noteSaveVerify(doc, 'written');
      // 保存した時点を差分の基準にする (BLK-reviewer-20260907-0803)。
      if (window.MA.saveDiff) window.MA.saveDiff.mark(doc.name, doc.dsl);
      // 保存のたびに版を積む (BLK-reviewer-20260908-0723-wish)。基準 1 点だけでは
      // A → B → A の往復が見えないので、通しで並べられるよう履歴に残す。
      if (window.MA.versionTimeline) window.MA.versionTimeline.push(doc.name, doc.dsl);
    }
  } catch (e) { /* 保存フォルダへの書き出しは best-effort */ }
  renderDiffBadge();
  renderVersionBadge();
  try { renderLineageBadge(); } catch (e) {}
  return doc;
}

// タブの内容をエディタ・プレビューに反映する。
function applyActiveDoc() {
  if (!window.MA.workspace) return;
  var doc = window.MA.workspace.getActive();
  if (!doc) return;
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
  suppressSync = true;
  editorEl.value = mmdText;
  suppressSync = false;
  try { currentParsed = currentModule.parse(mmdText); } catch (e) { /* leave stale */ }
  if (window.MA.selection) window.MA.selection.clearSelection();
  updateLineNumbers();
  isFirstRender = true;
  scheduleRefresh();
  renderTabs();
  // 指摘は図ごとに違う。タブを替えたらその図の基準で引き直す。
  try { renderReviewBadge(); } catch (e) {}
  // 継承元も図ごとに違う。開いた時点で「継承元が更新されています」と言えるよう引き直す。
  try { renderLineageBadge(); } catch (e) {}
}

function switchToDoc(id) {
  if (!window.MA.workspace) return;
  if (id === window.MA.workspace.getActiveId()) return;
  saveActiveDoc();
  if (window.MA.autoSave) { try { window.MA.autoSave.flush(); } catch (e) {} }
  if (!window.MA.workspace.setActive(id)) return;
  if (window.MA.history) window.MA.history.pushHistory();
  applyActiveDoc();
}

function renderTabs() {
  var bar = document.getElementById('tab-bar');
  if (!bar || !window.MA.workspace) return;
  var docs = window.MA.workspace.list();
  var activeId = window.MA.workspace.getActiveId();
  updateTopFileName();
  syncDraftButton();
  syncDriverMapBadge();
  var tabs = bar.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) bar.removeChild(tabs[i]);
  var firstTool = bar.querySelector('.tab-tool');
  docs.forEach(function(doc) {
    var el = document.createElement('div');
    el.className = 'tab' + (doc.id === activeId ? ' active' : '');
    el.setAttribute('data-doc-id', doc.id);
    el.setAttribute('data-doc-name', doc.name);
    el.title = doc.name + ' (' + doc.diagramType.replace('plantuml-', '')
      + ') — ダブルクリックで名前変更 / 右クリックで変更前後を見る';
    // BLK-primary-20260909-0303-wish: 会議で「この図、変わった?」と聞かれた所から
    // 1 手で入れる入口。開く先は差分タブだが、そのまま見比べへ切り替えられる。
    el.addEventListener('contextmenu', function(ev) {
      ev.preventDefault();
      switchToDoc(doc.id);
      toggleCompareView(true, 'diff');
    });
    // 前回保存時点から変わっている図にだけ印を付ける。
    var st = window.MA.saveDiff ? window.MA.saveDiff.statusOf(doc.name, doc.dsl) : 'same';
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
    label.textContent = doc.name;
    el.appendChild(label);
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
          if (wasActive) applyActiveDoc(); else renderTabs();
        }
      });
      el.appendChild(close);
    }
    el.addEventListener('click', function() { switchToDoc(doc.id); });
    el.addEventListener('dblclick', function(ev) {
      ev.preventDefault();
      var next = window.prompt(window.MA.workspace.nameRuleText(), doc.name);
      if (next == null) return;
      // 図の名前が変わってもレビューの基準は持ち越す。
      if (window.MA.reviewDesk) {
        try { window.MA.reviewDesk.renameBaseline(doc.name, next); } catch (e) {}
      }
      // 図の名前が変わっても継承元の関係は付いていく (BLK-junior-20260908-1603-wish)。
      if (window.MA.lineage) {
        try { window.MA.lineage.rename(doc.name, window.MA.workspace.sanitizeName(next)); } catch (e) {}
      }
      window.MA.workspace.rename(doc.id, next);
      // 図名欄で名前を変え終えたら、開いた元ファイルの錠は用済み (BLK-junior-20260908-1803-wish)。
      if (window.MA.sourceLock) { try { window.MA.sourceLock.release(doc.id); } catch (e) {} }
      renderTabs();
      try { updateTopSourceLock(); } catch (e) {}
      try { renderLineageBadge(); } catch (e) {}
    });
    bar.insertBefore(el, firstTool);
  });
  renderDiffBadge();
  try { updateTopSourceLock(); } catch (e) {}
  try { renderConsistencyBadge(); } catch (e) {}
  try { renderEventSyncBadge(); } catch (e) {}
  try { renderPinBadge(); } catch (e) {}
  // 参照関係でハイライトしている部品名の印は、タブを組み立て直すたびに付け直す。
  try { if (typeof _xrefSelected === 'string' && _xrefSelected) renderXrefGraph(); } catch (e) {}
  // 申し送りは開いた時点で見えていないと口頭説明の代わりにならない。
  // 復元で開いた場合も出したいので、タブを組み立て直すたびに引き直す。
  try { renderHandoverBanner(); } catch (e) {}
}

// ── 前回保存時点との差分 ──────────────────────────────
// BLK-reviewer-20260907-0803: 何か変わったかを知るのに控えとの全文 diff を毎回
// 取っていた。保存した時点の DSL を基準に持てば、バッジを見るだけで
// 「読む必要がある図」が分かる。変更 0 件ならその tick は図を開かなくてよい。

// エディタの未確定分を含めた現在の全図。
function _diffDocs() {
  if (!window.MA.workspace) return [];
  var docs = window.MA.workspace.list();
  var activeId = window.MA.workspace.getActiveId();
  return docs.map(function(d) {
    return (d.id === activeId) ? { id: d.id, name: d.name, dsl: mmdText } : d;
  });
}

// タブの印を今の中身に合わせ直す。編集のたびにタブを組み立て直すと
// クリック中のタブが差し替わるので、印だけを付け外しする。
function syncTabDirtyMarks(docs) {
  var SD = window.MA.saveDiff;
  var bar = document.getElementById('tab-bar');
  if (!SD || !bar) return;
  docs.forEach(function(d) {
    var el = bar.querySelector('.tab[data-doc-id="' + d.id + '"]');
    if (!el) return;
    var st = SD.statusOf(d.name, d.dsl);
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

function renderDiffBadge() {
  var btn = document.getElementById('btn-tab-diff');
  var SD = window.MA.saveDiff;
  if (!btn || !SD) return null;
  var docs = _diffDocs();
  syncTabDirtyMarks(docs);
  var sum = SD.summary(docs);
  btn.textContent = SD.badgeText(sum);
  // BLK-builder-20260908-1123-4: 件数の描き直しで className を丸ごと入れ替えると、
  // 「タブ列から畳む」で付けた tool-folded が消えて、畳んだはずのボタンが戻ってくる。
  // 状態を表す 1 クラスだけを付け外しする (以下の件数ボタンも同じ)。
  btn.classList.toggle('has-change', !!sum.hasChange);
  btn.title = sum.hasChange
    ? ('前回保存時点から変わった図: ' + sum.changed.concat(sum.added).join(', '))
    : '前回保存時点から変わった図はない';
  return sum;
}

function setupDiffPanel() {
  var btn = document.getElementById('btn-tab-diff');
  var panel = document.getElementById('diff-panel');
  var SD = window.MA.saveDiff;
  if (!btn || !panel || !SD) return;
  var esc = window.MA.htmlUtils.escHtml;

  function close() { panel.classList.remove('open'); }

  function render() {
    var docs = _diffDocs();
    var sum = SD.summary(docs);
    var html = '<div class="diff-head">' + esc(SD.badgeText(sum));
    if (sum.markedAt) html += ' ・ 基準 ' + esc(sum.markedAt.replace('T', ' ').slice(0, 16));
    html += '</div>';
    docs.forEach(function(d) {
      var st = SD.statusOf(d.name, d.dsl);
      var mark = st === 'same' ? '—' : (st === 'new' ? '新規' : '変更');
      if (st === 'changed') {
        var c = SD.changedLines(d.name, d.dsl);
        mark += ' +' + c.added + ' −' + c.removed;
      }
      html += '<div class="diff-row' + (st === 'same' ? '' : ' changed') + '"'
        + ' data-doc-id="' + esc(d.id) + '" data-diff-status="' + esc(st) + '">'
        + '<span>' + esc(d.name) + '</span><span>' + esc(mark) + '</span></div>';
    });
    html += '<div class="diff-actions">'
      // BLK-primary-20260909-0303-wish: 会議中はここから参照ペインへ入り、
      // 以降は「この図の前後」と「他の図と見比べ」をタブで行き来する。
      + '<button type="button" id="diff-open-pane">ペインで見る (見比べと切替)</button>'
      + '<button type="button" id="diff-open-board">変更サマリボード</button>'
      + '<button type="button" id="diff-mark-all">今の内容を基準にする</button></div>';
    panel.innerHTML = html;

    var rows = panel.querySelectorAll('.diff-row');
    for (var i = 0; i < rows.length; i++) {
      (function(row) {
        row.addEventListener('click', function() {
          close();
          switchToDoc(row.getAttribute('data-doc-id'));
        });
      })(rows[i]);
    }
    var openPane = document.getElementById('diff-open-pane');
    if (openPane) {
      openPane.addEventListener('click', function() {
        close();
        toggleCompareView(true, 'diff');
      });
    }
    var openBoard = document.getElementById('diff-open-board');
    if (openBoard) {
      openBoard.addEventListener('click', function() { close(); toggleChangeBoard(true); });
    }
    var markAll = document.getElementById('diff-mark-all');
    if (markAll) {
      markAll.addEventListener('click', function() {
        SD.markAll(_diffDocs());
        renderTabs();
        render();
      });
    }
  }

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { close(); return; }
    render();
    panel.classList.add('open');
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.right - 260) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
  });

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    close();
  });

  renderDiffBadge();
}

// ── レビュー机 (BLK-junior-20260907-1403-wish) ──────────────────────────
// 「先輩の図と同じ型のまま作る」業務では、型からのずれも、図種特有の間違い
// (choice を足したのに元の直接遷移が残る等) も、書いた本人からは見えない。
// 基準にした図を図ごとに覚えておき、打つたびに突き合わせて指摘を出す。
// 判断は review-desk が持ち、ここは並べて行へ飛ばすだけ。

function _reviewFindings() {
  var RD = window.MA.reviewDesk;
  if (!RD) return { findings: [], ok: true, summary: '' };
  var name = _activeDocName();
  var base = name ? RD.baselineOf(name) : null;
  return RD.review(mmdText, base ? base.dsl : '');
}

function _activeDocName() {
  if (!window.MA.workspace) return '';
  var d = window.MA.workspace.getActive();
  return d ? d.name : '';
}

function renderReviewBadge() {
  var btn = document.getElementById('btn-tab-review');
  var RD = window.MA.reviewDesk;
  if (!btn || !RD) return null;
  var r = _reviewFindings();
  btn.textContent = RD.badgeText(r.findings);
  btn.classList.toggle('has-finding', r.findings.length > 0);
  var name = _activeDocName();
  var base = name ? RD.baselineOf(name) : null;
  btn.title = (base ? ('基準: ' + base.ref + ' / ') : '基準の図は未選択 / ') + r.summary;
  // 開いたままなら中身も追従させる (直した指摘がその場で消える)。
  var panel = document.getElementById('review-panel');
  if (panel && panel.classList.contains('open')) renderReviewPanel();
  return r;
}

function renderReviewPanel() {
  var panel = document.getElementById('review-panel');
  var RD = window.MA.reviewDesk;
  if (!panel || !RD) return;
  var esc = window.MA.htmlUtils.escHtml;
  var name = _activeDocName();
  var base = name ? RD.baselineOf(name) : null;
  var r = _reviewFindings();

  var opts = '<option value="">(基準の図を選ぶ)</option>';
  var listed = {};
  if (window.MA.workspace) {
    window.MA.workspace.list().forEach(function(d) {
      if (d.name === name) return;   // 自分自身は基準にしない
      listed[d.name] = true;
      opts += '<option value="' + esc(d.name) + '"' + (base && base.ref === d.name ? ' selected' : '') + '>'
        + esc(d.name) + '</option>';
    });
  }
  // 基準は組み込みの雛形だったり、もう閉じた図だったりする。開いている図に無くても
  // 「いま何を基準にしているか」は出す (選び直すまで基準が空欄に見えると、
  // 何と突き合わせた指摘なのか分からなくなる)。
  if (base && base.ref && !listed[base.ref]) {
    opts += '<option value="' + esc(base.ref) + '" selected>' + esc(base.ref) + '</option>';
  }

  var html = '<div class="rv-head" data-review="' + (r.findings.length ? 'dirty' : 'clean') + '">'
    + esc(r.summary) + '</div>'
    + '<div class="rv-base"><span>基準</span><select id="rv-base-select">' + opts + '</select></div>';

  if (r.findings.length === 0) {
    html += '<div class="rv-empty" id="rv-empty">'
      + (base ? '基準「' + esc(base.ref) + '」との型のずれも、図種特有の間違いもありません。'
              : '図種特有の間違いはありません。基準の図を選ぶと、型からのずれも見ます。')
      + '</div>';
  } else {
    html += r.findings.map(function(f) {
      return '<div class="rv-row" data-review-kind="' + esc(f.kind) + '"'
        + (f.line == null ? '' : ' data-review-line="' + f.line + '"') + '>'
        + '<span class="rv-kind">' + esc(RD.kindLabel(f.kind)) + '</span>'
        + '<span class="rv-no">' + (f.line == null ? '—' : (f.line + 1)) + '</span>'
        + '<span class="rv-msg">' + esc(f.message) + '</span>'
        + '</div>';
    }).join('');
  }
  panel.innerHTML = html;

  var sel = document.getElementById('rv-base-select');
  if (sel) {
    sel.addEventListener('change', function() {
      var docName = _activeDocName();
      if (!docName) return;
      var refName = sel.value;
      var cur = RD.baselineOf(docName);
      if (!refName) { RD.clearBaseline(docName); }
      else {
        var ref = window.MA.workspace ? window.MA.workspace.findByName(refName) : null;
        if (ref) RD.setBaseline(docName, refName, ref.dsl, new Date().toISOString());
        // 開いている図に無い基準 (組み込みの雛形・閉じた図) は、覚えてある本文をそのまま使う。
        else if (cur && cur.ref === refName) RD.setBaseline(docName, refName, cur.dsl, cur.at);
      }
      renderReviewBadge();
      renderReviewPanel();
    });
  }
  var rows = panel.querySelectorAll('.rv-row[data-review-line]');
  for (var i = 0; i < rows.length; i++) {
    (function(row) {
      row.addEventListener('click', function() {
        gotoOutlineLine(parseInt(row.getAttribute('data-review-line'), 10));
      });
    })(rows[i]);
  }
}

function openReviewPanel() {
  var btn = document.getElementById('btn-tab-review');
  var panel = document.getElementById('review-panel');
  if (!btn || !panel) return;
  renderReviewPanel();
  panel.classList.add('open');
  var rect = btn.getBoundingClientRect();
  panel.style.left = Math.max(4, rect.right - 340) + 'px';
  panel.style.top = (rect.bottom + 2) + 'px';
}

function setupReviewPanel() {
  var btn = document.getElementById('btn-tab-review');
  var panel = document.getElementById('review-panel');
  if (!btn || !panel || !window.MA.reviewDesk) return;

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    openReviewPanel();
  });

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    panel.classList.remove('open');
  });

  renderReviewBadge();
}

// ── 変更サマリボード ──────────────────────────────────
// BLK-primary-20260907-0923-wish: レビュー会議で今日直した所を見せるのに、
// 「± 差分」で名前を確かめ、タブを開き、「⇔ 並べて見る」で 2 枚ずつ突き合わせる、を
// 図の枚数だけ繰り返していた。変わった図の変更前後を全件 1 画面に積んで出せば、
// 上から順にスクロールして見せるだけで済む。

var _cbFull = false;    // 全文を出すか (既定は差分行とその前後だけ)
var _cbSame = false;    // 変わっていない図も並べるか
var _cbFixOnly = false; // 「要修正」の印が付いた行だけに絞るか (BLK-primary-20260908-1103-wish)
var _cbMapPending = false; // 対応表を未対応の指摘だけに絞るか (BLK-primary-20260908-1703-wish)
// BLK-primary-20260913-0306-wish: 顧客に見せる画面。DSL を出さず、描いた図の
// 変更前後を並べる。描いた結果は鍵 (図・側・中身) で憶えておく — 顧客の前で
// 切り替えるたびに描き直すと、そのたびに数秒の空白が出る。
var _cbSvg = false;
var _cbSvgCache = {};
var _cbSvgSeq = 0;      // 描いている最中にボードが描き直されたら古い結果を捨てる

// ── 指摘と変更の対応表 (BLK-primary-20260908-1703-wish) ──────────────────
// ボードは「今回どの図が変わったか」を出すが、「この差分はどの指摘への対応か」は
// 会議直前に記憶で突き合わせるしかなかった。指摘 1 件ごとに、対応した図をその場で
// 1 クリック結び、「指摘 → 差分 / 対応なし」の一覧を会議前に自動で作る。

// 開いている図の指摘 (📌 指摘ピン) を全部集める。ボードと同じ _diffDocs() を見るので、
// 保存前の編集中の指摘もそのまま出る (受信箱のようにフォルダを読み直さない)。
function _cbFindings() {
  var PI = window.MA.pinInbox;
  if (!PI) return [];
  return PI.collect(_diffDocs().map(function(d) {
    return { name: d.name, dsl: d.dsl };
  }));
}

function _cbFindingTable(board) {
  var FL = window.MA.findingLink;
  if (!FL) return null;
  return FL.buildTable({ findings: _cbFindings(), board: board });
}

// BLK-primary-20260912-2103-wish: ボードに保存フォルダの図も入れるか。
// 既定は入。会議で見せるのは「今日この保存フォルダで更新された分」であって、
// たまたまタブを開いたままの図ではない。
var _cbFolder = true;

function _cbFolderOn() {
  var el = document.getElementById('cb-scan-folder');
  return (el ? !!el.checked : _cbFolder) && _fiFolderMode();
}

// どこから後の更新を拾うか。今日の 0 時 (手元の時計) から。
//
// 「開いている図の基準の時刻」にはしない。基準は自動保存のたびに今へ動くので、
// フォルダのファイルが基準より後になることが無くなり、拾う対象が常に空になる。
// 会議で見せたいのは「今日この保存フォルダで更新された分」なので、
// 日の変わり目という動かない線で切る。
function _cbFolderSince() {
  var n = new Date();
  try {
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
  } catch (e) { return ''; }
}

function _changeBoardModel() {
  var CB = window.MA.changeBoard;
  var SD = window.MA.saveDiff;
  if (!CB || !SD) return null;
  var docs = _diffDocs();
  if (_cbFolderOn()) {
    docs = docs.concat(CB.folderExtras(_fiFileDocs, docs, { since: _cbFolderSince() }));
  }
  return CB.build(docs, SD.baselineOf, {
    includeSame: _cbSame,
    collapse: !_cbFull,
    context: 2,
  });
}

// 見出しの 1 行。差分・基準・申し送り・レビュー結果を 1 か所で組み立てる
// (申し送りの保存後にも同じ文字列を作り直すため)。
function _cbSummaryText(board) {
  var CB = window.MA.changeBoard;
  if (!CB) return '';
  var head = CB.summaryText(board);
  if (board && board.markedAt) head += ' ・ 基準 ' + board.markedAt.replace('T', ' ').slice(0, 16);
  // 申し送り・レビュー結果は基準の取り直しでは消えないので、差分が 0 枚でも件数を出す。
  var hnSum = window.MA.handoverNotes ? window.MA.handoverNotes.summaryText() : '';
  if (hnSum) head += ' ・ ' + hnSum;
  var rvSum = window.MA.reviewVerdicts ? window.MA.reviewVerdicts.summaryText() : '';
  if (rvSum) head += ' ・ ' + rvSum;
  // 渡した申し送りチェックリストの返信状況 (BLK-primary-20260908-1803-wish)。
  var hcSum = _hcSummaryLine();
  if (hcSum) head += ' ・ ' + hcSum;
  return head;
}

// 差分行に添える「済 / 要修正」。押した印をもう一度押すと外れる。
function _cbVerdictButtonsHtml(docName, key, verdict) {
  var RV = window.MA.reviewVerdicts;
  if (!RV || !key) return '';
  var esc = window.MA.htmlUtils.escHtml;
  function btn(v, title) {
    return '<button type="button" class="cb-verdict-btn" data-doc-name="' + esc(docName) + '"'
      + ' data-row-key="' + esc(key) + '" data-verdict="' + esc(v) + '"'
      + ' aria-pressed="' + (verdict === v ? 'true' : 'false') + '"'
      + ' title="' + esc(title) + '">' + esc(v) + '</button>';
  }
  return btn(RV.DONE, 'この行は OK (もう一度押すと印を外す)')
    + btn(RV.FIX, 'この行は直す (もう一度押すと印を外す)');
}

function _wireChangeBoardVerdicts(body) {
  var RV = window.MA.reviewVerdicts;
  if (!RV || !body) return;
  var btns = body.querySelectorAll('button.cb-verdict-btn');
  for (var i = 0; i < btns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        RV.toggle(btn.getAttribute('data-doc-name'), btn.getAttribute('data-row-key'),
          btn.getAttribute('data-verdict'));
        var scroll = body.scrollTop;
        renderChangeBoard();
        renderHandoverBanner();
        var again = document.getElementById('cb-body');
        if (again) again.scrollTop = scroll;
      });
    })(btns[i]);
  }
}

// 対応表の 1 枚。ボードの先頭に置く (会議は「指摘がどう片付いたか」から入る)。
function _cbMapHtml(table) {
  var FL = window.MA.findingLink;
  if (!FL || !table) return '';
  var esc = window.MA.htmlUtils.escHtml;
  // 変更図のエントリ (.cb-entry) とは別の枠にする。ボードの「変わった図は何枚か」を
  // 数える所 (差分・絞り込みの見出し) に対応表が 1 枚として混ざらないようにする。
  var head = '<div class="cb-map"><div class="cb-map-head">'
    + '<span>指摘と変更の対応表</span>'
    + '<span class="cb-map-count">' + esc(FL.summaryText(table) || '指摘なし') + '</span></div>';
  if (!table.total) {
    return head + '<div class="cb-map-empty">開いている図に 📌 指摘ピンがありません。'
      + 'プレビューの行に指摘を付けると、その指摘がここに並びます。</div></div>';
  }
  var rows = _cbMapPending ? FL.pendingRows(table) : table.rows;
  if (rows.length === 0) {
    return head + '<div class="cb-map-empty">未対応の指摘はありません。'
      + '全 ' + table.total + ' 件に対応した図が結ばれています。</div></div>';
  }
  var html = head + '<table class="cb-map-table"><thead><tr>'
    + '<th>指摘</th><th>内容</th><th>対応</th><th>変更した図</th></tr></thead><tbody>';
  rows.forEach(function(r) {
    var where = r.doc + (r.line > 0 ? (':' + r.line) : '') + ' #' + r.id;
    var docsHtml = r.docs.length
      ? r.docs.map(function(n) {
        return '<button type="button" class="cb-map-goto" data-doc-name="' + esc(n) + '">'
          + esc(n) + '</button>';
      }).join('')
      : '<span>—</span>';
    html += '<tr data-map-status="' + esc(r.status) + '" data-pin-key="' + esc(r.key) + '">'
      + '<td class="cb-map-where">' + esc(where) + (r.done ? ' ✓' : '') + '</td>'
      + '<td class="cb-map-text">' + esc(r.text) + '</td>'
      + '<td class="cb-map-state">' + esc(FL.statusLabel(r.status)) + '</td>'
      + '<td>' + docsHtml + '</td></tr>';
  });
  return html + '</tbody></table></div>';
}

// ボードの 1 エントリに添える指摘の結び目。押した指摘がその図に結ばれる。
function _cbLinkRowHtml(docName, table) {
  var FL = window.MA.findingLink;
  if (!FL || !table || !table.total) return '';
  var esc = window.MA.htmlUtils.escHtml;
  var html = '<div class="cb-links" data-doc-name="' + esc(docName) + '"><span>対応する指摘</span>';
  // 表の並びは「対応なし」が先だが、ボタンの並びは指摘の番号順で固定する。
  // 押すたびに並びが変わると、2 件目を押すのに探し直すことになる。
  var byId = table.rows.slice().sort(function(a, b) {
    if (a.doc !== b.doc) return a.doc < b.doc ? -1 : 1;
    return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
  });
  byId.forEach(function(r) {
    var on = r.docs.indexOf(docName) >= 0;
    var label = r.doc + '#' + r.id + ' ' + (r.text || '(本文なし)');
    html += '<button type="button" class="cb-link-btn" data-doc-name="' + esc(docName) + '"'
      + ' data-pin-key="' + esc(r.key) + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
      + ' title="' + esc(label) + ' — 押すとこの図の変更を対応として結ぶ (もう一度押すと外す)">'
      + esc(label) + '</button>';
  });
  return html + '</div>';
}

function _wireChangeBoardLinks(body) {
  var FL = window.MA.findingLink;
  if (!FL || !body) return;
  var btns = body.querySelectorAll('button.cb-link-btn');
  for (var i = 0; i < btns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        FL.toggle(btn.getAttribute('data-pin-key'), btn.getAttribute('data-doc-name'));
        var scroll = body.scrollTop;
        renderChangeBoard();
        var again = document.getElementById('cb-body');
        if (again) again.scrollTop = scroll;
      });
    })(btns[i]);
  }
  // 対応表の図名を押したら、その図のエントリまで飛ぶ (会議で「これがその差分です」)。
  var gotos = body.querySelectorAll('button.cb-map-goto');
  for (var j = 0; j < gotos.length; j++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var name = btn.getAttribute('data-doc-name');
        var rows = body.querySelectorAll('.cb-links');
        for (var k = 0; k < rows.length; k++) {
          if (rows[k].getAttribute('data-doc-name') === name) {
            rows[k].parentNode.scrollIntoView();
            return;
          }
        }
      });
    })(gotos[j]);
  }
}

// BLK-primary-20260913-0306-wish: 顧客に見せる 1 枚ぶん。描く前は「描いています」を
// 置いておき、描けた順に差し替える (先に枠を出しておかないと、顧客の前で画面が飛ぶ)。
function _cbShowPanesHtml(entry) {
  var SBA = window.MA.showBeforeAfter;
  var esc = window.MA.htmlUtils.escHtml;
  if (!SBA) return '';
  var html = '<div class="cb-show" data-side="both">';
  SBA.panes(entry).forEach(function(p) {
    var key = SBA.cacheKey(entry.name, p.side, p.dsl);
    var cached = p.empty ? null : _cbSvgCache[key];
    var cls = p.empty ? ' cb-pane-empty' : (cached ? '' : ' cb-pane-wait');
    var inner = p.empty ? esc(p.emptyText) : (cached || '描いています…');
    // 差し替え先は名前と側で引く。鍵そのものは DSL を含むので属性には置かない
    // (改行を含む値はセレクタに書けない)。
    html += '<div class="cb-pane" data-side="' + esc(p.side) + '">'
      + '<div class="cb-pane-label">' + esc(p.label) + '</div>'
      + '<div class="cb-pane-body' + cls + '" data-doc="' + esc(entry.name) + '"'
      + ' data-side="' + esc(p.side) + '">' + inner + '</div>'
      + '</div>';
  });
  return html + '</div>';
}

// 「切替」を押すと 並べる → 変更前だけ → 変更後だけ と回る。顧客の前で押す
// ボタンは 1 つだけにする (どれを押すか迷わせない)。
function _wireChangeBoardFlip(body) {
  var SBA = window.MA.showBeforeAfter;
  if (!SBA) return;
  var btns = body.querySelectorAll('.cb-flip');
  for (var i = 0; i < btns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var side = SBA.nextSide(btn.getAttribute('data-side'));
        btn.setAttribute('data-side', side);
        btn.textContent = '切替: ' + SBA.sideLabel(side);
        var show = btn.parentNode.parentNode.querySelector('.cb-show');
        if (!show) return;
        show.setAttribute('data-side', side);
        var panes = show.querySelectorAll('.cb-pane');
        for (var j = 0; j < panes.length; j++) {
          panes[j].hidden = !SBA.shows(side, panes[j].getAttribute('data-side'));
        }
      });
    })(btns[i]);
  }
}

// 並んでいる図を上から順に描く。同時に何本も /render へ投げると PlantUML 側が
// 詰まって最初の 1 枚まで遅くなるので、1 枚ずつ直列に描いて出た順に差し替える。
function _cbDrawShowPanes(board) {
  var SBA = window.MA.showBeforeAfter;
  var stateEl = document.getElementById('cb-svg-state');
  if (!SBA) return Promise.resolve();
  var plan = SBA.renderPlan(board);
  var seq = ++_cbSvgSeq;
  var done = 0;
  if (stateEl) stateEl.textContent = SBA.statusText(SBA.SVG, board, 0);

  function put(item, html) {
    var body = document.getElementById('cb-body');
    if (!body) return;
    var slots = body.querySelectorAll('.cb-pane-body');
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].getAttribute('data-doc') !== item.name) continue;
      if (slots[i].getAttribute('data-side') !== item.side) continue;
      slots[i].innerHTML = html;
      slots[i].classList.remove('cb-pane-wait');
    }
  }

  function step(i) {
    if (seq !== _cbSvgSeq) return Promise.resolve();   // 描いている間にボードが変わった
    if (i >= plan.length) {
      if (stateEl) stateEl.textContent = SBA.statusText(SBA.SVG, board, plan.length);
      return Promise.resolve();
    }
    var item = plan[i];
    var cached = _cbSvgCache[item.key];
    var p = cached ? Promise.resolve(cached) : renderDslToSvg(item.dsl).then(function(svg) {
      _cbSvgCache[item.key] = svg;
      return svg;
    }, function(err) {
      // 描けない図があっても他の図は見せられる。顧客の前なので原因は短く。
      return '<span class="cb-pane-note">この図は描けませんでした ('
        + window.MA.htmlUtils.escHtml(String((err && err.message) || err)) + ')</span>';
    });
    return p.then(function(html) {
      if (seq !== _cbSvgSeq) return;
      put(item, html);
      done++;
      if (stateEl) stateEl.textContent = SBA.statusText(SBA.SVG, board, done);
      return step(i + 1);
    });
  }
  return step(0);
}

function renderChangeBoard() {
  var CB = window.MA.changeBoard;
  var body = document.getElementById('cb-body');
  var sumEl = document.getElementById('cb-summary');
  if (!CB || !body) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var RV = window.MA.reviewVerdicts;
  var board = _changeBoardModel();
  if (!board) return null;

  if (sumEl) sumEl.textContent = _cbSummaryText(board);

  // 顧客に見せる画面では申し送りの入力欄も畳む (社内の書き込み欄を客先で出さない)。
  var hoBar = document.getElementById('cb-handover-bar');
  if (hoBar) hoBar.style.display = _cbSvg ? 'none' : '';

  // 対応表は絞り込みの前の board で作る。「要修正のみ」で行を減らしても、
  // その指摘に対応した図が変わった事実は変わらない。
  var mapTable = _cbFindingTable(board);
  // 顧客に見せる画面では、社内の対応表・印・申し送りは出さない
  // (BLK-primary-20260913-0306-wish)。出すのは描いた図だけ。
  var mapHtml = _cbSvg ? '' : _cbMapHtml(mapTable);

  // 引き継ぎでは「今すぐ手を付ける行」だけを渡したいので、印の付いた行だけに
  // 絞れる (BLK-primary-20260908-1103-wish)。絞り込み中は差分の前後行・省略行は出さない。
  var filtered = null;
  if (_cbFixOnly && RV) {
    filtered = CB.filterVerdict(board, {
      verdict: RV.FIX,
      rowKeyOf: function(r) { return RV.rowKey(r); },
      verdictOf: function(name, key) { return RV.verdictOf(name, key); },
    });
    var fEl = document.getElementById('cb-filter-state');
    if (fEl) fEl.textContent = CB.filterText(filtered);
    if (filtered.entries.length === 0) {
      body.innerHTML = mapHtml + '<div class="cb-empty">' + esc(CB.filterText(filtered))
        + '。行の右端の [要修正] を押すと、その行がここに残ります。</div>';
      _wireChangeBoardLinks(body);
      return board;
    }
  } else {
    var fEl0 = document.getElementById('cb-filter-state');
    if (fEl0) fEl0.textContent = '';
  }
  if (filtered) board = filtered;

  if (board.entries.length === 0) {
    // 差分が消えても申し送りは残る (引き継ぎで読むのはこちら)。
    body.innerHTML = mapHtml + '<div class="cb-empty">前回保存した時点から変わった図はありません。'
      + '「± 差分」の [今の内容を基準にする] を押すと、そこからの変更がここに並びます。</div>'
      + _cbNotesOnlyHtml();
    _wireChangeBoardLinks(body);
    return board;
  }

  var html = mapHtml;
  board.entries.forEach(function(e) {
    var t = String(e.diagramType || '').replace('plantuml-', '');
    // 開いていない保存フォルダの図は、その旨と更新時刻を名前の横に出す
    // (会議で「14 枚の外の図」と分かる)。
    var org = (e.origin === 'folder')
      ? '<span class="cb-origin" title="開いていない保存フォルダのファイル。今日更新された分">📂 フォルダ'
        + (e.mtime ? ' ' + esc(e.mtime.replace('T', ' ').slice(0, 16)) : '') + '</span>'
      : '';
    html += '<div class="cb-entry" data-doc-id="' + esc(e.id) + '" data-doc-name="' + esc(e.name) + '"'
      + ' data-origin="' + esc(e.origin || 'open') + '">'
      + '<div class="cb-entry-head"><span>' + esc(e.name) + (t ? ' (' + esc(t) + ')' : '') + '</span>'
      + org
      + '<span class="cb-count">' + esc(_cbCountText(e)) + '</span>'
      + (_cbSvg ? '<button type="button" class="cb-flip" data-side="both"'
          + ' title="この図の見せ方を 並べる → 変更前だけ → 変更後だけ と回す">切替: 並べる</button>' : '')
      + '<button type="button" class="cb-goto">この図を開く</button></div>';
    // 顧客に見せる画面は、描いた図だけを変更前後で出す (行差分も印も出さない)。
    if (_cbSvg) {
      html += _cbShowPanesHtml(e) + '</div>';
      return;
    }
    html += '<div class="cb-cols"><span>変更前' + (e.markedAt ? ' (' + esc(e.markedAt.replace('T', ' ').slice(0, 16)) + ')' : ' (基準なし)') + '</span>'
      + '<span>変更後 (今)</span></div>'
      + '<table class="cb-diff"><tbody>';
    e.rows.forEach(function(r) {
      if (r.kind === 'gap') {
        html += '<tr class="cb-gap"><td colspan="5">⋯ 同じ行 ' + r.count + ' 行 ⋯</td></tr>';
        return;
      }
      // 会議で出た「この行は OK」「ここは直して」をその行に付ける (BLK-primary-20260908-0823-wish)。
      var vKey = RV ? RV.rowKey(r) : '';
      var v = vKey ? RV.verdictOf(e.name, vKey) : '';
      html += '<tr class="cb-' + r.kind + '"' + (v ? ' data-verdict="' + esc(v) + '"' : '') + '>'
        + '<td class="cb-no">' + (r.beforeNo || '') + '</td>'
        + '<td class="cb-before">' + esc(r.before == null ? '' : r.before) + '</td>'
        + '<td class="cb-no cb-after">' + (r.afterNo || '') + '</td>'
        + '<td>' + esc(r.after == null ? '' : r.after) + '</td>'
        + '<td class="cb-verdict">' + _cbVerdictButtonsHtml(e.name, vKey, v) + '</td></tr>';
    });
    html += '</tbody></table>';
    // この差分がどの指摘への対応かをその場で結ぶ (BLK-primary-20260908-1703-wish)。
    html += _cbLinkRowHtml(e.name, mapTable);
    // なぜ直したかを 1 行だけ添える。次にこの図を開いた人に帯で出る。
    var note = window.MA.handoverNotes ? window.MA.handoverNotes.get(e.name) : null;
    html += '<div class="cb-note-row" data-doc-name="' + esc(e.name) + '">'
      + '<span>申し送り</span>'
      + '<input type="text" class="cb-note" maxlength="' + (window.MA.handoverNotes ? window.MA.handoverNotes.MAX : 200) + '"'
      + ' placeholder="なぜ直したか (例: adc_state の Done→Configured に対応するメソッドが無かった)"'
      + ' value="' + esc(note ? note.text : '') + '">'
      + '<span class="cb-note-state">' + esc(note ? '保存済み' : '') + '</span>'
      + '</div>';
    html += '</div>';
  });
  // 絞り込み中は印の付いた行だけを見せる (ボードに出ていない図の申し送りは出さない)。
  body.innerHTML = html + ((filtered || _cbSvg) ? '' : _cbNotesOnlyHtml(board));
  if (_cbSvg) {
    _wireChangeBoardFlip(body);
    _cbDrawShowPanes(board);
  } else {
    _wireChangeBoardNotes(body);
    _wireChangeBoardVerdicts(body);
    _wireChangeBoardLinks(body);
  }

  var gotos = body.querySelectorAll('.cb-goto');
  for (var i = 0; i < gotos.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var entry = btn.parentNode.parentNode;
        toggleChangeBoard(false);
        var id = entry.getAttribute('data-doc-id');
        // 開いていない保存フォルダの図は、まず開いてから見せる
        // (BLK-primary-20260912-2103-wish)。
        if (String(id).indexOf('file:') === 0) openFromFolderByName(entry.getAttribute('data-doc-name'));
        else switchToDoc(id);
      });
    })(gotos[i]);
  }
  return board;
}

// ボードに並ばなかった図の申し送り (差分が無くなった図・既に基準を取り直した図)。
// 引き継ぎではこちらが本体なので、変更が消えても読めるようにしておく。
function _cbNotesOnlyHtml(board) {
  var HN = window.MA.handoverNotes;
  if (!HN) return '';
  var esc = window.MA.htmlUtils.escHtml;
  var shown = {};
  if (board) board.entries.forEach(function(e) { shown[e.name] = true; });
  var rest = HN.list().filter(function(n) { return !shown[n.name]; });
  if (rest.length === 0) return '';
  var html = '<div class="cb-entry cb-notes-only"><div class="cb-entry-head">'
    + '<span>この画面に出ていない図の申し送り</span>'
    + '<span class="cb-count">' + rest.length + ' 件</span></div>';
  rest.forEach(function(n) {
    html += '<div class="cb-note-row" data-doc-name="' + esc(n.name) + '">'
      + '<span>' + esc(n.name) + '</span>'
      + '<input type="text" class="cb-note" maxlength="' + HN.MAX + '" value="' + esc(n.text) + '">'
      + '<span class="cb-note-state">' + esc(String(n.at || '').replace('T', ' ').slice(0, 16)) + '</span>'
      + '</div>';
  });
  return html + '</div>';
}

// 申し送りは打ち終わり (change) で保存する。ボタンを別に置くと押し忘れが起きる。
function _wireChangeBoardNotes(body) {
  var HN = window.MA.handoverNotes;
  if (!HN || !body) return;
  var inputs = body.querySelectorAll('input.cb-note');
  for (var i = 0; i < inputs.length; i++) {
    (function(input) {
      input.addEventListener('change', function() {
        var row = input.parentNode;
        var name = row.getAttribute('data-doc-name');
        var e = null;
        var board = _changeBoardModel();
        if (board) {
          board.entries.forEach(function(x) { if (x.name === name) e = x; });
        }
        var saved = HN.set(name, input.value, e || {});
        var state = row.querySelector('.cb-note-state');
        if (state) state.textContent = saved ? '保存済み' : '';
        var sumEl = document.getElementById('cb-summary');
        if (sumEl) sumEl.textContent = _cbSummaryText(board);
        renderHandoverBanner();
      });
    })(inputs[i]);
  }
}

// ── 申し送りの帯 ────────────────────────────────────────────────────────
// 図を開いた人にその図の申し送りを出す。口頭説明の代わりなので、
// 開いた時点で見えていないと意味が無い (押して開く形にはしない)。
var _hnDismissed = {};   // この画面で閉じた図 (開き直せばまた出る)

function renderHandoverBanner() {
  var HN = window.MA.handoverNotes;
  var RV = window.MA.reviewVerdicts;
  var bar = document.getElementById('hn-banner');
  if (!bar) return null;
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  var note = (HN && doc) ? HN.get(doc.name) : null;
  // 会議で「要修正」を付けた行が残っていれば、申し送りが無くても帯を出す
  // (次に開いた人が上から潰していけるように。BLK-primary-20260908-0823-wish)。
  var fix = (RV && doc) ? RV.bannerText(doc.name) : '';
  if ((!note && !fix) || (doc && _hnDismissed[doc.name])) { bar.style.display = 'none'; return null; }
  var textEl = document.getElementById('hn-banner-text');
  var lines = [];
  if (note) lines.push(HN.bannerText(note));
  if (fix) lines.push(fix);
  if (textEl) textEl.textContent = lines.join('\n');
  bar.classList.toggle('hn-fix', !!fix);
  bar.style.display = 'flex';
  return note || { text: '', fix: fix };
}

function setupHandoverBanner() {
  var closeBtn = document.getElementById('hn-banner-close');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
    if (doc) _hnDismissed[doc.name] = true;
    var bar = document.getElementById('hn-banner');
    if (bar) bar.style.display = 'none';
  });
  var editBtn = document.getElementById('hn-banner-edit');
  if (editBtn) editBtn.addEventListener('click', function() {
    toggleChangeBoard(true);
    var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
    if (!doc) return;
    var body = document.getElementById('cb-body');
    if (!body) return;
    var rows = body.querySelectorAll('.cb-note-row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-doc-name') === doc.name) {
        var input = rows[i].querySelector('input.cb-note');
        if (input) { rows[i].scrollIntoView(); input.focus(); }
        return;
      }
    }
  });
}

function _cbCountText(e) {
  // 絞り込み中は「この図で何行渡すのか」が増減より大事 (BLK-primary-20260908-1103-wish)。
  if (e.matched) return '要修正 ' + e.matched + ' 行';
  if (e.status === 'same') return '変更なし';
  if (e.status === 'new') return '新規 +' + e.added;
  return '+' + e.added + ' −' + e.removed;
}

// ── 申し送りチェックリスト ──────────────────────────────────────────────
// BLK-primary-20260908-1803-wish: 申し送りは差分がある間しか書けず、渡した後に
// 新人が読んだかも分からなかった。引き継ぎを作る時点で申し送りを項目として固定し、
// 新人が zip の index.html で返した JSON を読み込んで未読・要フォローを見る。
// 判定は src/core/handover-checklist.js の職掌。ここは画面と入出力だけ。

function _hcSummaryLine() {
  var HC = window.MA.handoverChecklist;
  if (!HC) return '';
  var cur = HC.current();
  if (!cur.summary.total) return '';
  return '引き継ぎ ' + cur.summary.line;
}

function renderChecklistState() {
  var HC = window.MA.handoverChecklist;
  var el = document.getElementById('cb-checklist-state');
  if (!HC || !el) return null;
  var cur = HC.current();
  if (!cur.summary.total) {
    el.textContent = 'まだ引き継ぎパッケージを渡していません';
    el.title = '';
    return cur;
  }
  el.textContent = cur.summary.line;
  var fu = HC.followUps(cur.items).map(function(it) { return it.name; });
  el.title = fu.length ? ('分からなかった: ' + fu.join(', ')) : '';
  return cur;
}

// 図を選んで申し送りを足す。差分が無い図 (基準に取り込み済み) にも書けるようにする。
function renderChecklistDocOptions() {
  var sel = document.getElementById('cb-note-doc');
  if (!sel) return null;
  var docs = _renameDocs();
  var keep = sel.value;
  var esc = window.MA.htmlUtils.escHtml;
  var html = '';
  docs.forEach(function(d) {
    html += '<option value="' + esc(d.name) + '">' + esc(d.name) + '</option>';
  });
  sel.innerHTML = html;
  if (keep) sel.value = keep;
  if (!sel.value) {
    var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
    if (doc) sel.value = doc.name;
  }
  return docs;
}

function addHandoverNoteFromBar() {
  var HN = window.MA.handoverNotes;
  var sel = document.getElementById('cb-note-doc');
  var input = document.getElementById('cb-note-text');
  var state = document.getElementById('cb-note-add-state');
  if (!HN || !sel || !input) return null;
  var name = sel.value;
  var saved = HN.set(name, input.value, {});
  if (state) state.textContent = saved ? (name + ' に申し送りを足しました') : '文が空です';
  if (!saved) return null;
  input.value = '';
  renderChangeBoard();
  renderHandoverBanner();
  return saved;
}

// 新人が返した JSON を取り込む。控えが無い / 読めないときは何も変えない。
function receiveHandoverReply(text) {
  var HC = window.MA.handoverChecklist;
  var state = document.getElementById('cb-checklist-state');
  if (!HC) return null;
  var r = HC.receive(text);
  if (!r) {
    if (state) state.textContent = '返信ファイルを読めません (handover-reply.json を選んでください)';
    return null;
  }
  var cur = renderChecklistState();
  var sumEl = document.getElementById('cb-summary');
  if (sumEl) sumEl.textContent = _cbSummaryText(_changeBoardModel());
  if (window.MA.toast && cur) window.MA.toast.show('返信を読み込みました ・ ' + cur.summary.line);
  return r;
}

function setupHandoverChecklist() {
  var add = document.getElementById('cb-note-add');
  if (add) add.addEventListener('click', function() { addHandoverNoteFromBar(); });
  var input = document.getElementById('cb-note-text');
  if (input) input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); addHandoverNoteFromBar(); }
  });
  var file = document.getElementById('cb-reply-file');
  if (file) file.addEventListener('change', function() {
    var f = file.files && file.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function() { receiveHandoverReply(String(reader.result || '')); file.value = ''; };
    reader.readAsText(f);
  });
  // 起動時に「未読 N 件・要フォロー M 件」を出す。口頭で「あれ伝わった?」と
  // 聞かないための機能なので、ボードを開く前に見えている必要がある。
  var cur = window.MA.handoverChecklist ? window.MA.handoverChecklist.current() : null;
  var btn = document.getElementById('btn-tab-board');
  if (cur && cur.summary.total && btn) {
    btn.title = '変更サマリ ・ 引き継ぎ ' + cur.summary.line;
    btn.classList.add('has-handover-followup');
    if (window.MA.toast) window.MA.toast.show('引き継ぎ ' + cur.summary.line);
  }
}

function toggleChangeBoard(open) {
  var modal = document.getElementById('cb-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  modal.style.display = 'flex';
  // BLK-primary-20260912-2103-wish: フォルダの図もボードに載せるので、開くたびに
  // 一覧を取り直す (会議直前に別の経路で書き出した図を落とさないため)。
  var scan = document.getElementById('cb-scan-folder');
  if (scan) {
    var ok = _fiFolderMode();
    scan.disabled = !ok;
    var lab = scan.parentNode;
    if (lab) lab.title = ok
      ? '今日この保存フォルダで更新されたファイルも並べる (いつもの 14 枚に限らない)'
      : '保存先がフォルダのときだけ使えます (設定 → 自動保存)';
  }
  if (_cbFolderOn()) loadFolderImpact(true).then(function() { renderChangeBoard(); }, function() {});
  renderChangeBoard();
  renderChecklistDocOptions();
  renderChecklistState();
  var body = document.getElementById('cb-body');
  if (body) body.scrollTop = 0;
}

function setupChangeBoard() {
  var btn = document.getElementById('btn-tab-board');
  var modal = document.getElementById('cb-modal');
  if (!btn || !modal) return;
  btn.addEventListener('click', function() { toggleChangeBoard(true); });

  var closeBtn = document.getElementById('cb-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleChangeBoard(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleChangeBoard(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleChangeBoard(false);
  });

  // 顧客に見せる画面への切替 (BLK-primary-20260913-0306-wish)。
  // ボードを開いたまま 1 回押すだけで、DSL の行差分が描いた図の変更前後に変わる。
  var svgBtn = document.getElementById('cb-svg');
  if (svgBtn) svgBtn.addEventListener('click', function() {
    _cbSvg = !_cbSvg;
    svgBtn.setAttribute('aria-pressed', _cbSvg ? 'true' : 'false');
    svgBtn.textContent = _cbSvg ? '▤ DSLに戻す' : '🖼 SVGで見る';
    var st = document.getElementById('cb-svg-state');
    if (st && !_cbSvg) st.textContent = '';
    renderChangeBoard();
  });

  var full = document.getElementById('cb-full');
  if (full) full.addEventListener('change', function() { _cbFull = full.checked; renderChangeBoard(); });
  var same = document.getElementById('cb-same');
  if (same) same.addEventListener('change', function() { _cbSame = same.checked; renderChangeBoard(); });
  var scanFolder = document.getElementById('cb-scan-folder');
  if (scanFolder) scanFolder.addEventListener('change', function() {
    _cbFolder = scanFolder.checked;
    if (_cbFolderOn()) loadFolderImpact(true).then(function() { renderChangeBoard(); }, function() {});
    renderChangeBoard();
  });
  var fixOnly = document.getElementById('cb-fixonly');
  if (fixOnly) fixOnly.addEventListener('change', function() {
    _cbFixOnly = fixOnly.checked;
    renderChangeBoard();
  });

  // 会議メモ。会議が終わった瞬間の中身をそのまま持ち出せるようにする
  // (BLK-primary-20260908-0923-wish)。
  var minutes = document.getElementById('cb-minutes');
  if (minutes) minutes.addEventListener('click', function() { writeMeetingNotes(false); });
  var minutesCopy = document.getElementById('cb-minutes-copy');
  if (minutesCopy) minutesCopy.addEventListener('click', function() { writeMeetingNotes(true); });

  // 指摘と変更の対応表 (BLK-primary-20260908-1703-wish)。
  var mapPending = document.getElementById('cb-map-pending');
  if (mapPending) mapPending.addEventListener('change', function() {
    _cbMapPending = mapPending.checked;
    renderChangeBoard();
  });
  var mapExport = document.getElementById('cb-map-export');
  if (mapExport) mapExport.addEventListener('click', function() { writeFindingMap(); });

  setupHandoverChecklist();
}

// いまの対応表を 1 枚の Markdown にして書き出す。会議で「この差分はどの指摘か」を
// 聞かれたときに開く資料そのものなので、ボードを開いたまま押せる所に置く。
function buildFindingMap() {
  var FL = window.MA.findingLink;
  if (!FL) return null;
  var at = '';
  try { at = new Date().toISOString(); } catch (e) { at = ''; }
  var table = _cbFindingTable(_changeBoardModel());
  return { table: table, at: at, text: FL.toMarkdown(table, { at: at }), fileName: FL.fileName(at) };
}

function writeFindingMap() {
  var FL = window.MA.findingLink;
  var state = document.getElementById('cb-minutes-state');
  var res = buildFindingMap();
  if (!res) { if (state) state.textContent = '対応表を作れません'; return null; }
  downloadBlob(res.fileName, new Blob([res.text], { type: 'text/markdown' }));
  if (state) state.textContent = res.fileName + ' に書き出しました (' + (FL.summaryText(res.table) || '指摘なし') + ')';
  return res;
}

// いまのボードの中身を 1 枚の Markdown にして書き出す。copy=true ならファイルではなく
// クリップボードへ (会議のチャットにそのまま貼るため)。
function buildMeetingNotes() {
  var MN = window.MA.meetingNotes;
  if (!MN) return null;
  var at = '';
  try { at = new Date().toISOString(); } catch (e) { at = ''; }
  var board = _changeBoardModel();
  var res = MN.build({
    board: board,
    verdicts: window.MA.reviewVerdicts,
    notes: window.MA.handoverNotes,
    at: at,
  });
  // 議事録にも対応表を付ける。会議で最初に聞かれるのが「どの指摘への対応か」なので、
  // 別のファイルを開かせない (BLK-primary-20260908-1703-wish)。
  var FL = window.MA.findingLink;
  if (res && FL) {
    var table = _cbFindingTable(board);
    if (table && table.total > 0) {
      res.text = res.text + '\n\n' + FL.toMarkdown(table, { at: at });
    }
  }
  return res;
}

function writeMeetingNotes(copy) {
  var MN = window.MA.meetingNotes;
  var state = document.getElementById('cb-minutes-state');
  var res = buildMeetingNotes();
  if (!res) { if (state) state.textContent = '会議メモを作れません'; return null; }
  if (copy) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(res.text).then(function() {
        if (state) state.textContent = 'コピーしました (' + res.fixTotal + ' 件の要修正)';
      }, function() {
        if (state) state.textContent = 'コピーできません';
      });
    } else if (state) {
      state.textContent = 'コピーできません';
    }
    return res;
  }
  downloadBlob(res.fileName, new Blob([res.text], { type: 'text/markdown' }));
  if (state) state.textContent = MN.resultText(res);
  return res;
}

// ── 監査履歴 (BLK-reviewer-20260907-2303-wish) ──────────────────────────
// 監査ツールは run ごとに育つので、DSL が 1 行も変わっていなくてもカテゴリ別の
// 件数は動く。「メソッド 5 → 0」を見て直ったと思うと、実は粒度へ移っただけ、
// ということが起きる。監査を回すたびに記録を積み、欠陥の実体ごとに
// 「どの run でどのカテゴリに分類されていたか」を 1 行に並べて、
// 解消 (もう出ない) と再分類 (出るが別カテゴリ) を分けて出す。
// 判断は audit-timeline が持ち、ここは監査を回して並べるだけ。

function _atDocs() {
  if (!window.MA.workspace) return [];
  saveActiveDoc();
  return window.MA.workspace.list();
}

// いま開いている図に、CLI と同じ監査一式を掛ける。モジュールが無い監査は
// 「見ていない」として結果に載せない (0 件と区別する)。
function _atRunAudits() {
  var docs = _atDocs();
  var out = {};
  function one(key, fn) {
    try {
      var v = fn();
      if (v !== undefined) out[key] = { status: 'ok', result: v };
    } catch (e) { out[key] = { status: 'error', message: e.message }; }
  }
  one('name', function() { return window.MA.nameAudit ? window.MA.nameAudit.audit(docs) : undefined; });
  one('method', function() { return window.MA.methodAudit ? window.MA.methodAudit.audit(docs) : undefined; });
  one('consistency', function() { return window.MA.consistency ? window.MA.consistency.check(docs) : undefined; });
  one('family', function() { return window.MA.familyAudit ? window.MA.familyAudit.audit(docs) : undefined; });
  one('trace', function() { return window.MA.traceCoverage ? window.MA.traceCoverage.audit(docs) : undefined; });
  one('density', function() { return window.MA.transitionDensity ? window.MA.transitionDensity.rank(docs) : undefined; });
  return { audits: out, docs: docs.length };
}

// ── 指摘の台帳 (BLK-reviewer-20260914-1306-wish) ────────────────────────
// 帯が答えるのは「いまどのカテゴリか」だけで、指摘 1 件が「いつから出ていて
// どのファイルの何行目か、いつ消えたか」は持たない。そのため反映確認は毎回
// audit.js --summary-json を叩き直し、run ログを遡って突き合わせる作業だった。
// ここは同じ記録から台帳を組み、帯の上に置く。判断は finding-ledger が持つ。
var _flLast = null;

function _flView() {
  var FL = window.MA.findingLedger;
  var TL = window.MA.auditTimeline;
  if (!FL || !TL) return null;
  var docs = [];
  try { docs = _atDocs(); } catch (e) { docs = []; }
  _flLast = FL.build({ snapshots: TL.load(), docs: docs });
  return _flLast;
}

function _flHtml(view) {
  var FL = window.MA.findingLedger;
  var esc = window.MA.htmlUtils.escHtml;
  if (!FL || !view) return '';
  var html = '<div class="fl-head">指摘の台帳<span class="fl-sum" id="at-ledger-summary">'
    + esc(FL.summaryLine(view)) + '</span></div>';
  if (!view.rows.length) {
    return html + '<div class="fl-empty">記録した run に、クラス / メソッド / イベントの指摘はありません。</div>';
  }
  html += '<table class="fl-table"><thead><tr><th>指摘</th><th>対象ファイル:行</th>'
    + '<th>初出</th><th>解消</th><th>継続</th><th title="tick ごとの出欠 (● 出た / ○ 出ない)">出欠</th>'
    + '</tr></thead><tbody>';
  view.rows.forEach(function(r) {
    html += '<tr data-fl-open="' + (r.open ? '1' : '0') + '" data-fl-entity="' + esc(r.entity) + '">'
      + '<td class="fl-title">' + esc(r.title) + '</td>'
      + '<td class="fl-where">' + esc(FL.whereText(r)) + '</td>'
      + '<td>' + esc(r.since) + '</td>'
      + '<td class="fl-state">' + (r.open ? '未解消' : esc(r.resolvedAt || '')) + '</td>'
      + '<td>' + r.ticks + ' tick</td>'
      + '<td class="fl-spark">' + esc(r.spark) + '</td></tr>';
  });
  return html + '</tbody></table>';
}

function copyFindingLedger() {
  var FL = window.MA.findingLedger;
  var st = document.getElementById('at-summary');
  if (!FL) return null;
  var view = _flLast || _flView();
  var text = FL.markdown(view, '指摘の台帳');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (st) st.textContent = '台帳を指摘.md 用にコピーしました (' + view.rows.length + ' 件)';
    }, function() {
      if (st) st.textContent = 'コピーできません';
    });
  } else if (st) {
    st.textContent = 'コピーできません';
  }
  return text;
}

function renderAuditTimeline() {
  var body = document.getElementById('at-body');
  var sumEl = document.getElementById('at-summary');
  var TL = window.MA.auditTimeline;
  if (!body || !TL) return;
  var esc = window.MA.htmlUtils.escHtml;
  var t = TL.build(TL.load());

  if (sumEl) sumEl.textContent = TL.summaryLine(t);

  if (t.runs.length === 0) {
    body.innerHTML = '<div class="at-empty">まだ記録がありません。「いまの監査を記録」を押すと、'
      + 'この時点の指摘を 1 列として積みます。2 回目から、解消したものと分類が変わっただけのものを分けて出します。</div>';
    return;
  }

  var html = '';
  if (t.newCategories.length) {
    html += '<div class="at-note">監査カテゴリが増えた → ' + esc(t.newCategories.join('・'))
      + ' (図が変わっていなくても件数はここで動きます)</div>';
  }
  if (t.goneCategories.length) {
    html += '<div class="at-note">監査カテゴリが減った → ' + esc(t.goneCategories.join('・')) + '</div>';
  }

  // 台帳を先に出す。反映確認はここだけ見れば終わる。
  html += '<div id="at-ledger">' + _flHtml(_flView()) + '</div>';
  html += '<div id="at-band-head">カテゴリの帯 (同じ欠陥が run ごとにどこへ分類されたか)</div>';

  html += '<table class="at-table"><thead><tr><th class="at-th-item">欠陥</th>';
  t.runs.forEach(function(r) {
    html += '<th title="' + esc(r.at) + '">' + esc(r.label) + '<span class="at-th-count">'
      + r.count + ' 件</span></th>';
  });
  html += '<th class="at-th-status">いまの扱い</th></tr></thead><tbody>';

  if (t.rows.length === 0) {
    html += '<tr><td colspan="' + (t.runs.length + 2) + '" class="at-empty">記録した run に指摘はありません。</td></tr>';
  }
  t.rows.forEach(function(row) {
    html += '<tr data-at-status="' + esc(row.status) + '">'
      + '<td class="at-item" title="' + esc(row.entity) + '">' + esc(row.title) + '</td>';
    row.cells.forEach(function(c) {
      html += '<td class="at-cell">' + (c ? '<span class="at-cat">' + esc(c.text) + '</span>' : '<span class="at-none">—</span>') + '</td>';
    });
    html += '<td class="at-status"><span class="at-chip">' + esc(row.status) + '</span>'
      + (row.moves ? '<span class="at-moves">移動 ' + row.moves + ' 回</span>' : '') + '</td></tr>';
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

function toggleAuditTimeline(open) {
  var modal = document.getElementById('at-modal');
  if (!modal) return;
  if (open) renderAuditTimeline();
  modal.style.display = open ? 'flex' : 'none';
}

// ── 突合ダッシュボード (BLK-reviewer-20260908-1403-wish) ────────────────────
// 突合そのものは既にある (名前突合・整合・系統・トレース・SVG・手動指摘)。
// ただし出口がモーダルごとに分かれているので、13 枚を 1 プロジェクトとして
// 横断で見るには node で audit.js を叩き、その場のスクリプトで並べ直すしかない。
// ここは全部を 1 つの表に集め、カテゴリと図名で絞り込み、行から図へ飛ぶ。
// 並べ方と数え方は audit-board が持ち、ここは走査と画面だけ。

var _abKind = '';        // 絞り込み中のカテゴリ (空 = 全部)
var _abDoc = '';         // 絞り込み中の図名 (空 = 全部)
var _abBoard = null;     // 直近に組んだ一覧 (コピーで作り直さない)
var _abSvgScan = null;   // 📂 一覧が読んだ SVG の追いつき。開いていなければ null

function _abBuild() {
  var AB = window.MA.auditBoard;
  if (!AB) return null;
  var run = _atRunAudits();
  var findings = null;
  try { findings = _mfRows(); } catch (e) { findings = null; }
  _abBoard = AB.build({ audits: run.audits, svg: _abSvgScan, findings: findings });
  return _abBoard;
}

function renderAuditBoard() {
  var body = document.getElementById('ab-body');
  var sumEl = document.getElementById('ab-summary');
  var AB = window.MA.auditBoard;
  if (!body || !AB) return;
  var esc = window.MA.htmlUtils.escHtml;
  var b = _abBuild();
  if (sumEl) sumEl.textContent = AB.summaryLine(b);

  // 絞り込みの選択肢は、いま出ている一覧そのものから作る (空の箱を並べない)。
  function fill(id, cur, items, allLabel) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var html = '<option value="">' + allLabel + '</option>';
    items.forEach(function(it) {
      html += '<option value="' + esc(it.key) + '"' + (it.key === cur ? ' selected' : '') + '>'
        + esc(it.label) + ' (' + it.count + ')</option>';
    });
    sel.innerHTML = html;
  }
  fill('ab-kind', _abKind, b.byCategory, 'すべてのカテゴリ');
  fill('ab-doc', _abDoc, b.byDoc, 'すべての図');

  var rows = AB.filter(b, { kind: _abKind, doc: _abDoc });
  if (rows.length === 0) {
    body.innerHTML = '<div class="ab-empty">'
      + (b.total === 0
        ? '突合の指摘はありません。'
          + (b.seen.length ? '（見た突合: ' + esc(b.seen.join('・')) + '）' : '')
        : 'この絞り込みに当たる指摘はありません。')
      + '</div>';
    return;
  }

  var html = '<table class="ab-table"><thead><tr>'
    + '<th>カテゴリ</th><th>図</th><th>対象</th><th>内容</th></tr></thead><tbody>';
  rows.forEach(function(r) {
    html += '<tr class="ab-row" data-ab-kind="' + esc(r.kind) + '" data-ab-doc="' + esc(r.doc) + '"'
      + ' data-ab-line="' + r.line + '"' + (r.keep ? ' data-ab-keep="1"' : '') + '>'
      + '<td class="ab-cat">' + esc(r.category) + '</td>'
      + '<td class="ab-doc">' + esc(r.doc) + '</td>'
      + '<td class="ab-title">' + esc(r.title) + '</td>'
      + '<td class="ab-detail">' + esc(r.detail) + '</td></tr>';
  });
  html += '</tbody></table>';
  body.innerHTML = html;

  Array.prototype.forEach.call(body.querySelectorAll('.ab-row'), function(tr) {
    tr.addEventListener('click', function() {
      _abJump(tr.getAttribute('data-ab-doc'), Number(tr.getAttribute('data-ab-line')) || 1);
    });
  });
}

// 行からその図へ。開いていない図はここでは開けないので、そう言う
// (黙って何も起きないと「押しても飛ばない画面」に見える)。
function _abJump(name, line) {
  var st = document.getElementById('ab-summary');
  var AB = window.MA.auditBoard;
  if (!window.MA.workspace || !name || (AB && name === AB.CROSS)) return;
  var hit = null;
  window.MA.workspace.list().forEach(function(d) { if (d.name === name) hit = d; });
  if (!hit) {
    if (st) st.textContent = name + ' は開いていません（📂 一覧から開くと飛べます）';
    return;
  }
  jumpToDocLine(hit.id, line);
  toggleAuditBoard(false);
}

function copyAuditBoard() {
  var AB = window.MA.auditBoard;
  var st = document.getElementById('ab-summary');
  if (!AB) return null;
  var b = _abBoard || _abBuild();
  var text = AB.markdown(b, '突合ダッシュボード');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (st) st.textContent = '指摘.md 用にコピーしました (' + b.total + ' 件)';
    }, function() {
      if (st) st.textContent = 'コピーできません';
    });
  } else if (st) {
    st.textContent = 'コピーできません';
  }
  return text;
}

function toggleAuditBoard(open) {
  var modal = document.getElementById('ab-modal');
  if (!modal) return;
  if (open) renderAuditBoard();
  modal.style.display = open ? 'flex' : 'none';
}

function setupAuditBoard() {
  var btn = document.getElementById('btn-tab-cross');
  var modal = document.getElementById('ab-modal');
  if (!btn || !modal || !window.MA.auditBoard) return;
  btn.addEventListener('click', function() { toggleAuditBoard(true); });
  var close = document.getElementById('ab-close');
  if (close) close.addEventListener('click', function() { toggleAuditBoard(false); });
  var copy = document.getElementById('ab-copy');
  if (copy) copy.addEventListener('click', function() { copyAuditBoard(); });
  var kind = document.getElementById('ab-kind');
  if (kind) kind.addEventListener('change', function() { _abKind = this.value; renderAuditBoard(); });
  var doc = document.getElementById('ab-doc');
  if (doc) doc.addEventListener('change', function() { _abDoc = this.value; renderAuditBoard(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleAuditBoard(false);
  });
}

// ── 変遷履歴 (BLK-reviewer-20260908-0723-wish) ─────────────────────────────
// save-diff は「前回保存した 1 点」しか持たないので、A → B → A と書き換えが
// 往復しても毎回「変わりました」としか出ず、往復そのものが見えなかった。
// ここでは図ごとに積んだ版を新しい順に並べ、前の版に戻った版へ印を付ける。
var _vtFile = '';

function _vtCurrentName() {
  try {
    var a = window.MA.workspace.getActive();
    return a && a.name ? a.name : '';
  } catch (e) { return ''; }
}

function renderVersionTimeline() {
  var VT = window.MA.versionTimeline;
  var body = document.getElementById('vt-body');
  var sel = document.getElementById('vt-file');
  var sum = document.getElementById('vt-summary');
  if (!VT || !body) return;
  var esc = window.MA.htmlUtils.escHtml;

  var names = VT.names();
  if (sel) {
    // 開いている図に履歴がまだ無くても選べるようにしておく
    // (「この図の履歴はまだありません」を名指しで出すため)。
    var cur = _vtFile || _vtCurrentName();
    var opts = names.slice();
    if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
    if (!cur && opts.length) cur = opts[0];
    _vtFile = cur;
    sel.innerHTML = opts.map(function(n) {
      return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }
  var name = _vtFile;
  if (sum) sum.textContent = name ? VT.summaryLine(name) : '図がありません';

  var onlyEl = document.getElementById('vt-only-revisit');
  var only = !!(onlyEl && onlyEl.checked);
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

// ボタンの見出しは、開いている図に往復があるかどうかを常に言う
// (モーダルを開かないと気付けない、では手順が 1 つ増えるだけになる)。
function renderVersionBadge() {
  var btn = document.getElementById('btn-tab-versions');
  var VT = window.MA.versionTimeline;
  if (!btn || !VT) return;
  var name = _vtCurrentName();
  var n = name ? VT.revisitCount(name) : 0;
  btn.textContent = n > 0 ? ('⟲ 変遷 往復' + n) : '⟲ 変遷 −';
  btn.classList.toggle('has-change', n > 0);
  btn.title = n > 0
    ? (name + ' には前の版に戻った版が ' + n + ' 回あります')
    : 'この図が保存のたびにどう変わったかを通しで並べる。前の版に戻った「往復」には印が付く';
}

function toggleVersionTimeline(open) {
  var modal = document.getElementById('vt-modal');
  if (!modal) return;
  if (open) {
    _vtFile = _vtCurrentName() || _vtFile;
    renderVersionTimeline();
  }
  modal.style.display = open ? 'flex' : 'none';
}

function setupVersionTimeline() {
  var btn = document.getElementById('btn-tab-versions');
  var modal = document.getElementById('vt-modal');
  var VT = window.MA.versionTimeline;
  if (!btn || !modal || !VT) return;
  btn.addEventListener('click', function() { toggleVersionTimeline(true); });

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
      VT.forget(_vtFile);
      _vtFile = '';
      renderVersionTimeline();
      renderVersionBadge();
    });
  }
  renderVersionBadge();
}

// ── 継承元 (BLK-junior-20260908-1603-wish) ─────────────────────────────────
// 「この図はどの図の後継か」を画面が覚えていないので、毎周「先輩の同種図を探す →
// 開く → 記憶と見比べる」を手でやっていた。継承元を 1 回登録すれば、以後は
// 開いたときにボタンが「+3 -1」と言い、モーダルの「継承元を開く」1 クリックで
// その図に飛べる。取り込んだら基準を進める。
var _lgLast = { child: '', parent: '', dsl: null };

function _lgChildName() {
  try {
    var a = window.MA.workspace.getActive();
    return a && a.name ? a.name : '';
  } catch (e) { return ''; }
}

// 継承元の今の中身を読む。読めなければ dsl は null (「更新あり」と言い切らない)。
function _lgFetch(child, cb) {
  var LG = window.MA.lineage;
  var WS = window.MA.workspace;
  var rec = (LG && child) ? LG.get(child) : null;
  if (!rec || !WS) { cb(null, null); return; }
  var dir = rec.dir || _wsFileDir();
  try {
    WS.loadFile(rec.parent, dir).then(function(text) {
      _lgLast = { child: child, parent: rec.parent, dsl: (typeof text === 'string') ? text : null };
      cb(rec, _lgLast.dsl);
    }, function() { cb(rec, null); });
  } catch (e) { cb(rec, null); }
}

function renderLineageBadge() {
  var btn = document.getElementById('btn-tab-lineage');
  var LG = window.MA.lineage;
  if (!btn || !LG) return;
  var child = _lgChildName();
  if (!child || !LG.get(child)) {
    btn.textContent = LG.badgeText(child, null);
    btn.classList.remove('has-change');
    btn.title = 'この図の継承元 (どの図から派生したか) を 1 回登録すると、'
      + '継承元が更新されたときに差分の行数で知らせる';
    return;
  }
  _lgFetch(child, function(rec, dsl) {
    if (_lgChildName() !== child) return;   // 読んでいる間にタブが変わった
    var s = LG.status(child, dsl);
    btn.textContent = LG.badgeText(child, dsl);
    btn.classList.toggle('has-change', s.updated);
    btn.title = LG.statusLine(child, dsl);
  });
}

// 継承元を探すフォルダ。既定は自分の保存先だが、先輩の図は別フォルダに
// あることがあるので打ち替えられる (打ち替えたフォルダが関係と一緒に残る)。
function _lgDir() {
  var el = document.getElementById('lg-dir');
  var v = el ? String(el.value || '').trim() : '';
  return v || _wsFileDir();
}

var _lgFillToken = 0;
// 一覧から選んだ継承元。フォルダの読み込みが後から届いて一覧を組み直しても、
// 選んだものを見失わないために覚えておく (組み直しで選択が消え、登録が
// 空振りしたことがあった)。
var _lgParentPick = '';

function _lgFillParentOptions(child) {
  var sel = document.getElementById('lg-parent');
  var WS = window.MA.workspace;
  var LG = window.MA.lineage;
  if (!sel || !WS) return;
  var esc = window.MA.htmlUtils.escHtml;
  var rec = LG ? LG.get(child) : null;
  var cur = rec ? rec.parent : '';
  var names = [];
  try {
    WS.list().forEach(function(d) { if (d.name && d.name !== child) names.push(d.name); });
  } catch (e) {}

  function paint() {
    var seen = {};
    var opts = [];
    names.forEach(function(n) {
      if (n === child || seen[n]) return;
      seen[n] = 1;
      opts.push(n);
    });
    opts.sort();
    var keep = sel.value || _lgParentPick || cur;
    sel.innerHTML = opts.map(function(n) {
      return '<option value="' + esc(n) + '"' + (n === keep ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('') || '<option value="">(このフォルダに他の図がありません)</option>';
    if (keep && opts.indexOf(keep) >= 0) sel.value = keep;
    _lgParentPick = sel.value || '';
  }

  // まだ何も出ていないときだけ先に描く。既に出ているものをフォルダの応答より
  // 先に空へ差し替えると、選んだ直後に一覧が消える。
  if (!sel.options || sel.options.length === 0) paint();
  var token = ++_lgFillToken;
  try {
    WS.listFileEntries(_lgDir()).then(function(entries) {
      if (token !== _lgFillToken) return;   // フォルダを打ち替えた後の古い応答
      (entries || []).forEach(function(e) {
        var n = e && e.name ? e.name : e;
        if (typeof n === 'string' && n) names.push(n);
      });
      paint();
    }, function() { paint(); });
  } catch (e) { paint(); }
}

function renderLineageModal() {
  var LG = window.MA.lineage;
  var body = document.getElementById('lg-body');
  var sum = document.getElementById('lg-summary');
  var childEl = document.getElementById('lg-child');
  if (!LG || !body) return;
  var esc = window.MA.htmlUtils.escHtml;
  var child = _lgChildName();
  if (childEl) childEl.textContent = child || '(図がありません)';

  var openBtn = document.getElementById('lg-open');
  var adoptBtn = document.getElementById('lg-adopt');
  var clearBtn = document.getElementById('lg-clear');
  var markBtn = document.getElementById('lg-mark');
  var rec = child ? LG.get(child) : null;
  if (openBtn) openBtn.disabled = !rec;
  if (clearBtn) clearBtn.disabled = !rec;
  if (adoptBtn) adoptBtn.disabled = true;
  if (markBtn) markBtn.disabled = true;

  if (!rec) {
    if (sum) { sum.textContent = '継承元は未登録です'; sum.classList.remove('lg-updated'); }
    body.innerHTML = '<div class="lg-empty" id="lg-empty">'
      + 'まだ継承元がありません。下の一覧から「この図の元になった図」を選んで登録すると、'
      + '次からは開いた時点で更新の有無と差分の行数が出ます</div>';
    return;
  }

  if (sum) sum.textContent = '継承元 ' + rec.parent + ' を読んでいます…';
  _lgFetch(child, function(r, dsl) {
    if (_lgChildName() !== child) return;
    var s = LG.status(child, dsl);
    if (sum) {
      sum.textContent = LG.statusLine(child, dsl);
      sum.classList.toggle('lg-updated', s.updated);
    }
    if (adoptBtn) adoptBtn.disabled = !s.updated;
    if (markBtn) markBtn.disabled = !s.updated;
    var head = '<div class="lg-empty">継承元: ' + esc(rec.parent)
      + (rec.dir ? ' (' + esc(rec.dir) + ')' : '')
      + ' · 前回取り込み ' + esc(rec.adoptedAt || rec.at || '') + '</div>';
    if (!s.known) {
      body.innerHTML = head + '<div class="lg-empty">継承元のファイルを読めませんでした。'
        + '保存先か図の名前が変わっていないか確かめてください</div>';
      return;
    }
    if (!s.updated) {
      body.innerHTML = head + '<div class="lg-empty" id="lg-nochange">'
        + '前回取り込んだ時点から継承元は変わっていません (見比べる必要はありません)</div>';
      return;
    }
    var d = LG.diffLines(child, dsl);
    body.innerHTML = head + '<div class="lg-diff" id="lg-diff">'
      + d.removed.map(function(l) { return '<span class="lg-d-del">- ' + esc(l) + '</span>'; }).join('')
      + d.added.map(function(l) { return '<span class="lg-d-add">+ ' + esc(l) + '</span>'; }).join('')
      + '</div>';
  });
}

// 継承元を 1 クリックで開く。別のフォルダに置いてあっても登録した保存先から読む。
function openLineageParent() {
  var LG = window.MA.lineage;
  var WS = window.MA.workspace;
  var child = _lgChildName();
  var rec = (LG && child) ? LG.get(child) : null;
  if (!rec || !WS) return;
  saveActiveDoc();
  var dir = rec.dir || _wsFileDir();
  WS.loadFile(rec.parent, dir).then(function(text) {
    if (text == null) {
      var sum = document.getElementById('lg-summary');
      if (sum) sum.textContent = '継承元 ' + rec.parent + ' を読めませんでした (保存先を確かめてください)';
      return;
    }
    var detected = WS.detectType(text);
    WS.openOrActivate({
      name: rec.parent,
      dsl: text,
      diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
    });
    applyActiveDoc();
    renderTabs();
    toggleLineage(false);
  }, function() {});
}

// BLK-junior-20260908-1703-wish: 差分の行数まで出ても、増えた行が画面のどれかは
// 自分で探すしかなかった。増減行が名指している相手を鍵にして、いまの図の同じ
// 相手を指す図形を overlay 上で色付けし、当たらなかった行は図の上の帯に並べる。
function markLineageDiff() {
  var LG = window.MA.lineage;
  var LM = window.MA.lineageMark;
  var child = _lgChildName();
  if (!LG || !LM || !child) return;
  _lgFetch(child, function(rec, dsl) {
    if (!rec || dsl == null) return;
    var plan = LM.plan(LG.diffLines(child, dsl), mmdText);
    LM.apply(document.getElementById('overlay-layer'), plan.lines);
    renderLineageMarkOverlay(plan);
    toggleLineage(false);
  });
}

function renderLineageMarkOverlay(plan) {
  var box = document.getElementById('lg-mark-overlay');
  var sum = document.getElementById('lgm-summary');
  var list = document.getElementById('lgm-list');
  var LM = window.MA.lineageMark;
  if (!box || !sum || !list || !LM) return;
  box.hidden = false;
  box.setAttribute('data-marked', String(plan.lines.length));
  box.setAttribute('data-missing', String(plan.missing.length));
  sum.textContent = LM.summaryLine(plan);
  list.textContent = '';
  plan.missing.forEach(function(m) {
    var li = document.createElement('li');
    li.className = 'lgm-missing';
    li.setAttribute('data-kind', m.kind);
    li.textContent = (m.kind === 'add' ? '+ ' : '- ') + m.text.trim();
    list.appendChild(li);
  });
}

function clearLineageMarks() {
  if (window.MA.lineageMark) window.MA.lineageMark.clear(document.getElementById('overlay-layer'));
  var box = document.getElementById('lg-mark-overlay');
  if (box) {
    box.hidden = true;
    box.setAttribute('data-marked', '0');
  }
}

function toggleLineage(open) {
  var modal = document.getElementById('lg-modal');
  if (!modal) return;
  if (open) {
    var child = _lgChildName();
    var dirEl = document.getElementById('lg-dir');
    if (dirEl && !dirEl.value) {
      var rec0 = window.MA.lineage ? window.MA.lineage.get(child) : null;
      dirEl.value = (rec0 && rec0.dir) ? rec0.dir : _wsFileDir();
    }
    _lgFillParentOptions(child);
    renderLineageModal();
  }
  modal.style.display = open ? 'flex' : 'none';
}

function setupLineage() {
  var btn = document.getElementById('btn-tab-lineage');
  var modal = document.getElementById('lg-modal');
  var LG = window.MA.lineage;
  if (!btn || !modal || !LG) return;
  btn.addEventListener('click', function() { toggleLineage(true); });

  var closeBtn = document.getElementById('lg-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleLineage(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleLineage(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleLineage(false);
  });

  var dirEl = document.getElementById('lg-dir');
  if (dirEl) {
    dirEl.addEventListener('change', function() { _lgFillParentOptions(_lgChildName()); });
  }

  var parentSel = document.getElementById('lg-parent');
  if (parentSel) {
    parentSel.addEventListener('change', function() { _lgParentPick = this.value || ''; });
  }

  var setBtn = document.getElementById('lg-set');
  if (setBtn) {
    setBtn.addEventListener('click', function() {
      var sel = document.getElementById('lg-parent');
      var child = _lgChildName();
      var parent = (sel && sel.value) || _lgParentPick;
      var note = document.getElementById('lg-note');
      if (!child || !parent) return;
      var dir = _lgDir();
      // 登録した時点の継承元の中身を基準にする。読めなければ登録しない
      // (基準が空のまま登録すると、次に開いた瞬間に全行が「更新」に見える)。
      window.MA.workspace.loadFile(parent, dir).then(function(text) {
        if (text == null) {
          if (note) note.textContent = parent + ' を読めませんでした。保存してから登録してください';
          return;
        }
        LG.set(child, parent, text, { dir: dir });
        if (note) note.textContent = parent + ' を継承元にしました';
        renderLineageModal();
        renderLineageBadge();
      }, function() {});
    });
  }

  var adoptBtn = document.getElementById('lg-adopt');
  if (adoptBtn) {
    adoptBtn.addEventListener('click', function() {
      var child = _lgChildName();
      if (!child) return;
      _lgFetch(child, function(rec, dsl) {
        if (!rec || dsl == null) return;
        LG.adopt(child, dsl);
        renderLineageModal();
        renderLineageBadge();
      });
    });
  }

  var clearBtn = document.getElementById('lg-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      var child = _lgChildName();
      if (!child) return;
      LG.clear(child);
      _lgFillParentOptions(child);
      renderLineageModal();
      renderLineageBadge();
    });
  }

  var openBtn = document.getElementById('lg-open');
  if (openBtn) openBtn.addEventListener('click', openLineageParent);

  var markBtn = document.getElementById('lg-mark');
  if (markBtn) markBtn.addEventListener('click', markLineageDiff);
  var lgmClose = document.getElementById('btn-lgm-close');
  if (lgmClose) lgmClose.addEventListener('click', clearLineageMarks);

  renderLineageBadge();
}

function setupAuditTimeline() {
  var btn = document.getElementById('btn-tab-audit-timeline');
  var modal = document.getElementById('at-modal');
  var TL = window.MA.auditTimeline;
  if (!btn || !modal || !TL) return;
  btn.addEventListener('click', function() { toggleAuditTimeline(true); });

  var closeBtn = document.getElementById('at-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleAuditTimeline(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleAuditTimeline(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleAuditTimeline(false);
  });

  var rec = document.getElementById('at-record');
  if (rec) {
    rec.addEventListener('click', function() {
      var r = _atRunAudits();
      var label = document.getElementById('at-label');
      var name = label && label.value ? label.value.trim() : '';
      var snap = TL.snapshot(r.audits, { label: name, docs: r.docs });
      TL.save(TL.push(TL.load(), snap));
      if (label) label.value = '';
      renderAuditTimeline();
    });
  }
  var cp = document.getElementById('at-copy');
  if (cp) cp.addEventListener('click', function() { copyFindingLedger(); });

  var clr = document.getElementById('at-clear');
  if (clr) {
    clr.addEventListener('click', function() {
      if (!confirm('記録した監査履歴を全部消します。よろしいですか。')) return;
      TL.clear();
      renderAuditTimeline();
    });
  }
}

// ── 他フォルダの閲覧 ───────────────────────────────────────────────────────
// BLK-junior-20260908-0723: 先輩の図を読むためだけに、設定ダイアログで保存先を
// フルパスで打ち替え、読んだ後また打ち戻していた (往復 60 字超)。戻し忘れると
// 自分の図が他人のフォルダに紛れ込む。読むだけなら保存先は動かさなくていい。
// 隣のフォルダを一覧から選び、その場で図を出す。設定には一切書かない。
var _peekDirs = [];
var _peekDir = null;
var _peekNames = [];
var _peekName = null;
var _peekDsl = '';        // 今出している 1 枚の本文 (テンプレートの材料)

// BLK-reviewer-20260909-0403-wish: フォルダを 1 つ選んで 1 枚ずつ読む形だと、
// 「同じドメインの図が他のフォルダにもあるか」はファイル名を推測して開いて
// 確かめるしかなかった (GPIO の突合は 4 枚を個別に開いてテキスト比較)。
// ドメイン名でフォルダを横断して束ね、同じ図種の組の差分をその場で色分けする。
var _cohortOn = false;
var _cohortGroups = [];      // 表示中のドメイン (既定は業務データだけ)
var _cohortAllGroups = [];   // [{ domain, folders, entries }] — 本文はまだ読んでいない
var _cohortDomain = null;
var _cohortResult = null;    // 選んだドメインの compare 結果
// BLK-reviewer-20260909-0503-wish: plantuml-*.puml / diagram1.puml のような
// アプリ同梱テンプレ・既定サンプルは各自が独立に複製しただけなので、フォルダを
// またいで同名で並ぶ。突合に混ぜると本物の食い違い (GPIO) と同じ列に出て、
// 毎回 puml の中身を読んで選り分けることになる。既定で外し、押せば戻せる。
var _cohortShowTemplates = false;

// BLK-reviewer-20260909-0603-wish: 覗いたフォルダの一覧はファイル名しか出しておらず、
// 「その図の SVG が今の puml から作られたものか」は GUI からは分からなかった
// (毎回 CLI で /verify-svg を叩いて確かめていた)。一覧と同じ呼び出しで判定の材料も
// 取り、行に印を出す。
var _peekScan = null;      // svg-freshness の scan 結果 (覗いているフォルダぶん)
// BLK-junior-20260912-2206: 覗いているフォルダの一覧 entry (図種つき)。
// 名前だけの一覧では、語尾から図種を推測しながら 30 枚を上から読むことになる。
var _peekEntries = [];
var _peekVerifying = false;
// BLK-junior-20260914-1306-wish: 「先輩の図の変更を自分の図に取り込む」ときに要るのは
// 「先輩の 1 枚が前回保存からどこを変えたか」。無いと複合図を丸ごと開いて目で差分を
// 探すことになり、変わっていない図まで開いて見比べる往復が残る。
var _peekChanges = null;       // peek-changes の report (覗いているフォルダぶん)
var _peekChangedOnly = false;  // 変更のある図だけに絞っているか

function _peekEls() {
  return {
    modal: document.getElementById('peek-modal'),
    changes: document.getElementById('peek-changes'),
    dirs: document.getElementById('peek-dirs'),
    files: document.getElementById('peek-files'),
    title: document.getElementById('peek-title'),
    svg: document.getElementById('peek-svg'),
    dsl: document.getElementById('peek-dsl'),
    notice: document.getElementById('peek-notice'),
    cohort: document.getElementById('peek-cohort'),
    cohortToggle: document.getElementById('peek-cohort-toggle'),
    template: document.getElementById('peek-template'),
    compare: document.getElementById('peek-compare'),
    cohortTemplates: document.getElementById('peek-cohort-templates'),
    sbs: document.getElementById('peek-sbs'),
    sbsToggle: document.getElementById('peek-sbs-toggle'),
  };
}

// ── ドメイン横断の突合 ──
// 行き先一覧 (_peekDirs) の各フォルダのファイル名を集め、`folder/name` の形の
// 疑似 doc にしてドメインで束ねる。本文はここでは読まない (フォルダ数 × 枚数の
// 読み込みを、見る気になっていない段階で走らせない)。
function _peekIndexDocs() {
  var WS = window.MA.workspace;
  if (!WS) return Promise.resolve([]);
  var dirs = _peekDirs.slice();
  return Promise.all(dirs.map(function(d) {
    return WS.listFiles(d.path).then(function(names) {
      return { dir: d, names: (names || []).filter(function(n) { return n; }) };
    }).catch(function() { return { dir: d, names: [] }; });
  })).then(function(sets) {
    var docs = [];
    sets.forEach(function(set) {
      set.names.forEach(function(n) {
        docs.push({ name: set.dir.name + '/' + n, dsl: '', _dir: set.dir.path, _file: n });
      });
    });
    return docs;
  });
}

function _cohortLoadIndex() {
  var DC = window.MA.domainCohort;
  if (!DC) return Promise.resolve([]);
  // テンプレ込みで束ねておき、表示側で外す (押して戻すときに読み直さない)。
  return _peekIndexDocs().then(function(docs) { return DC.groups(docs); });
}

// 選んだドメインの図だけ本文を読み、突合する。
function _cohortCompare(group) {
  var WS = window.MA.workspace;
  var DC = window.MA.domainCohort;
  if (!WS || !DC || !group) return Promise.resolve(null);
  return Promise.all(group.entries.map(function(e) {
    var src = e.doc || {};
    return WS.loadFile(src._file, src._dir).then(function(text) {
      return { name: e.name, dsl: typeof text === 'string' ? text : '', _dir: src._dir, _file: src._file };
    }).catch(function() { return { name: e.name, dsl: '', _dir: src._dir, _file: src._file }; });
  })).then(function(docs) {
    var groups = DC.groups(docs);
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].domain === group.domain) {
        return DC.compare(groups[i], { includeTemplates: _cohortShowTemplates });
      }
    }
    return null;
  });
}

function _cohortChips(host, title, part, aLabel, bLabel) {
  var wrap = document.createElement('div');
  wrap.className = 'cohort-line';
  var head = document.createElement('span');
  head.className = 'cohort-line-title';
  head.textContent = title;
  wrap.appendChild(head);
  function add(list, cls, prefix) {
    (list || []).forEach(function(v) {
      var chip = document.createElement('span');
      chip.className = 'cohort-chip ' + cls;
      chip.textContent = prefix + v;
      wrap.appendChild(chip);
    });
  }
  add(part.both, 'cohort-both', '');
  add(part.onlyA, 'cohort-only-a', aLabel + ' だけ: ');
  add(part.onlyB, 'cohort-only-b', bLabel + ' だけ: ');
  if (!part.both.length && !part.onlyA.length && !part.onlyB.length) {
    var none = document.createElement('span');
    none.className = 'cohort-chip cohort-none';
    none.textContent = 'なし';
    wrap.appendChild(none);
  }
  host.appendChild(wrap);
}

function renderCohortCompare() {
  var el = _peekEls();
  var DK = window.MA.diagramKind;
  if (!el.cohort) return;
  el.cohort.textContent = '';
  if (!_cohortOn) { el.cohort.style.display = 'none'; return; }
  el.cohort.style.display = 'block';
  if (!_cohortDomain) {
    var hint = document.createElement('div');
    hint.className = 'cohort-hint';
    hint.id = 'cohort-hint';
    var exN = _cohortExcluded().length;
    var exNote = exN ? ' (テンプレ由来 ' + exN + ' ドメインは外しています)' : '';
    hint.textContent = (_cohortGroups.length
      ? 'フォルダをまたぐドメインを ' + _cohortGroups.length + ' 件見つけました。左でドメインを選んでください。'
      : 'フォルダをまたぐ同じドメイン名の図がありません。') + exNote;
    el.cohort.appendChild(hint);
    return;
  }
  var r = _cohortResult;
  if (!r) {
    var loading = document.createElement('div');
    loading.className = 'cohort-hint';
    loading.textContent = '読み込み中…';
    el.cohort.appendChild(loading);
    return;
  }
  var head = document.createElement('div');
  head.className = 'cohort-head';
  head.id = 'cohort-head';
  head.textContent = r.domain + ' — ' + r.folders.join(' × ')
    + ' (' + r.pairs.length + ' 組を突合、食い違い ' + r.mismatched + ' 組)';
  el.cohort.appendChild(head);
  if (!r.pairs.length) {
    var un = document.createElement('div');
    un.className = 'cohort-hint';
    un.id = 'cohort-unpaired';
    un.textContent = '同じ図種の組がフォルダ間にありません (片方にしか無い図種です)。下の一覧から 1 枚ずつ読んでください。';
    el.cohort.appendChild(un);
    return;
  }
  r.pairs.forEach(function(p) {
    var box = document.createElement('div');
    box.className = 'cohort-pair' + (p.diff.matched ? ' matched' : ' mismatched');
    box.setAttribute('data-cohort-kind', p.kind);
    box.setAttribute('data-cohort-matched', p.diff.matched ? '1' : '0');
    var t = document.createElement('div');
    t.className = 'cohort-pair-title';
    var kindLabel = (DK && DK.label(String(p.kind).replace(/^plantuml-/, ''))) || '';
    t.textContent = (kindLabel ? kindLabel + ' — ' : '')
      + p.a.folder + ' / ' + p.a.base + '  ×  ' + p.b.folder + ' / ' + p.b.base
      + (p.diff.matched ? '  ✓ 揃っている' : '  ✗ ' + p.diff.gaps + ' 件が片方にしかない');
    box.appendChild(t);
    _cohortChips(box, '部品名', p.diff.names, p.a.folder, p.b.folder);
    _cohortChips(box, '矢印ラベル', p.diff.labels, p.a.folder, p.b.folder);
    _cohortVerdictRow(box, r.domain, p);
    el.cohort.appendChild(box);
  });
}

// ── 判断 (統一する / 別物と明示する) ──
// BLK-primary-20260909-0503-wish: 突合で差分は見えても、見た後にできることが
// 無かった。統一するなら綴りを手で打ち替え、別物とするなら title を手で書き足す
// しかなく、決めたこと自体はどこにも残らないので次の突合で同じ食い違いがまた出る。
// 組の片方が自分の保存フォルダのときだけ、その 1 枚に書き戻す 2 つのボタンを出す。
function _myPeekDir() {
  // 覗き先の一覧が自分の保存先を current として持っている。設定の値は相対パス
  // (./autosave) のことがあり、一覧の絶対パスとは字面が合わないので、
  // 比べるのは必ず一覧の側の path にする。
  for (var i = 0; i < _peekDirs.length; i++) {
    if (_peekDirs[i].current) return _peekDirs[i].path;
  }
  return _wsFileDir();
}

function _cohortSides(p) {
  var PF = window.MA.peekFolder;
  var dir = _myPeekDir();
  if (!PF) return null;
  var a = (p.a.doc || {})._dir, b = (p.b.doc || {})._dir;
  if (PF.samePath(a, dir)) return { mine: p.a, other: p.b };
  if (PF.samePath(b, dir)) return { mine: p.b, other: p.a };
  return null;   // どちらも他人の図。読むだけ (勝手に直さない)
}

function _cohortVerdictRow(box, domain, p) {
  var DV = window.MA.domainVerdict;
  var sides = DV ? _cohortSides(p) : null;
  var row = document.createElement('div');
  row.className = 'cohort-verdict';
  if (!sides) {
    row.textContent = 'どちらも自分の保存フォルダの図ではありません (読むだけ)';
    box.appendChild(row);
    return;
  }
  var mineDoc = sides.mine.doc, otherDoc = sides.other.doc;
  var mark = DV.readVerdict(mineDoc.dsl, sides.other.folder);
  var key = sides.mine.name + '|' + sides.other.name;
  var note = document.createElement('span');
  note.className = 'cohort-verdict-note';
  note.id = 'cohort-verdict-note';
  note.textContent = _cohortVerdictMsgs[key] ? _cohortVerdictMsgs[key] : mark
    ? (mark.kind === 'shared' ? '判断済み: ' + sides.other.folder + ' と共有ドメイン'
                              : '判断済み: ' + sides.other.folder + ' とは別物')
    : sides.mine.folder + ' / ' + sides.mine.base + ' に書き戻します';
  row.appendChild(note);
  [
    { kind: 'shared', label: '共有ドメインとして統一する' },
    { kind: 'separate', label: '別物として title に明示する' },
  ].forEach(function(spec) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cohort-verdict-btn';
    b.setAttribute('data-verdict', spec.kind);
    b.textContent = spec.label;
    b.addEventListener('click', function() {
      applyCohortVerdict(spec.kind, domain, sides, note, b, key);
    });
    row.appendChild(b);
  });
  box.appendChild(row);
  if (mineDoc && otherDoc) box.setAttribute('data-cohort-mine', sides.mine.folder);
}

var _cohortVerdictMsgs = {};   // 組ごとの「直前に何をしたか」。突合し直しても残す

function applyCohortVerdict(kind, domain, sides, note, btn, key) {
  var DV = window.MA.domainVerdict;
  var WS = window.MA.workspace;
  var mine = sides.mine, other = sides.other;
  var src = mine.doc || {};
  var res = DV.apply(kind, src, other.doc, {
    domain: domain, otherFolder: other.folder, base: mine.base,
  });
  if (!res) return Promise.resolve(false);
  if (btn) btn.disabled = true;
  return WS.saveToFile({ name: src._file.replace(/\.[^.]+$/, ''), dsl: res.dsl }, src._dir)
    .then(function(ok) {
      if (btn) btn.disabled = false;
      if (!ok) { note.textContent = '書き戻せませんでした (保存先を確認してください)'; return false; }

      src.dsl = res.dsl;
      var msg = DV.summaryLine(res) + ' — ' + mine.folder + ' / ' + mine.base + ' に保存しました';
      _cohortVerdictMsgs[key] = msg;
      note.textContent = msg;
      // 突合し直す。直した結果が同じ画面にすぐ出ないと、直ったか確かめる手が増える。
      return selectCohortDomain(domain).then(function() { return true; });
    })
    .catch(function() {
      if (btn) btn.disabled = false;
      note.textContent = '書き戻せませんでした (保存先を確認してください)';
      return false;
    });
}

function renderCohortDomains() {
  var el = _peekEls();
  if (!el.dirs) return;
  el.dirs.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-head';
  head.id = 'peek-dirs-head';
  head.textContent = _cohortGroups.length
    ? 'ドメイン (' + _cohortGroups.length + ')'
    : 'フォルダをまたぐドメインがありません';
  el.dirs.appendChild(head);
  var ex = _cohortExcluded();
  if (ex.length) {
    var note = document.createElement('div');
    note.className = 'cohort-hint';
    note.id = 'cohort-excluded';
    note.setAttribute('data-excluded', String(ex.length));
    note.textContent = 'テンプレ由来 ' + ex.length + ' ドメインは外しています ('
      + ex.map(function(g) { return g.domain; }).join(', ') + ')';
    el.dirs.appendChild(note);
  }
  _cohortGroups.forEach(function(g) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-dir cohort-domain' + (g.domain === _cohortDomain ? ' selected' : '');
    b.setAttribute('data-domain', g.domain);
    b.textContent = g.domain + ' (' + g.folders.join(' × ') + ' / ' + g.entries.length + ' 枚)';
    b.addEventListener('click', function() { selectCohortDomain(g.domain); });
    el.dirs.appendChild(b);
  });
  if (el.notice) el.notice.textContent = 'ドメインで揃えています (読むだけ・保存先は動きません)';
}

// 選んだドメインの図を、フォルダ付きの名前で一覧に出す。押せば従来どおり 1 枚読む。
function renderCohortFiles() {
  var el = _peekEls();
  if (!el.files) return;
  el.files.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-head';
  head.id = 'peek-files-head';
  var group = _cohortGroupOf(_cohortDomain);
  head.textContent = group ? (group.entries.length + ' 枚') : 'ドメインを選んでください';
  el.files.appendChild(head);
  if (!group) return;
  group.entries.forEach(function(e) {
    var b = document.createElement('button');
    b.type = 'button';
    var src = e.doc || {};
    b.className = 'peek-file' + (src._file === _peekName && src._dir === _peekDir ? ' selected' : '');
    b.setAttribute('data-file-name', src._file);
    b.setAttribute('data-folder', e.folder);
    b.textContent = e.folder + ' / ' + e.base;
    b.addEventListener('click', function() {
      _peekDir = src._dir;
      showPeekFile(src._file).then(renderCohortFiles);
    });
    el.files.appendChild(b);
  });
}

// 表示するドメイン。既定はテンプレ由来を外した業務データだけ。
function _cohortVisibleGroups() {
  var DC = window.MA.domainCohort;
  if (!DC) return _cohortAllGroups.slice();
  return DC.crossFolder(_cohortAllGroups, { includeTemplates: _cohortShowTemplates });
}

// 外したテンプレ由来のドメイン。件数を黙って減らさないために画面に必ず出す。
function _cohortExcluded() {
  var DC = window.MA.domainCohort;
  if (!DC || _cohortShowTemplates) return [];
  return DC.templateOnly(_cohortAllGroups);
}

function _cohortGroupOf(domain) {
  for (var i = 0; i < _cohortGroups.length; i++) {
    if (_cohortGroups[i].domain === domain) return _cohortGroups[i];
  }
  return null;
}

function selectCohortDomain(domain) {
  _cohortDomain = domain;
  _cohortResult = null;
  renderCohortDomains();
  renderCohortFiles();
  renderCohortCompare();
  var group = _cohortGroupOf(domain);
  return _cohortCompare(group).then(function(r) {
    if (_cohortDomain !== domain) return false;   // 途中で選び直された
    _cohortResult = r;
    renderCohortCompare();
    return true;
  });
}

function setCohortMode(on) {
  var el = _peekEls();
  _cohortOn = !!on;
  // 2 つの並べ方を同時に出さない (同名で並べる方を先に畳む)。
  if (_cohortOn && _sbsOn) setSbsMode(false);
  if (el.cohortToggle) {
    el.cohortToggle.setAttribute('aria-pressed', _cohortOn ? 'true' : 'false');
    el.cohortToggle.classList.toggle('on', _cohortOn);
  }
  _syncCohortTemplateBtn();
  if (!_cohortOn) {
    _cohortDomain = null;
    _cohortResult = null;
    renderCohortCompare();
    renderPeekDirs();
    renderPeekFiles();
    return Promise.resolve(true);
  }
  // 突合に切り替えたら、前に読んでいた 1 枚は消す。別ドメインの図が下に
  // 残っていると、上の突合結果と同じドメインのものだと読み違える。
  _peekName = null;
  if (el.title) el.title.textContent = '';
  if (el.svg) { el.svg.textContent = ''; el.svg.style.display = 'none'; }
  if (el.dsl) el.dsl.textContent = '';
  renderCohortCompare();
  return _cohortLoadIndex().then(function(groups) {
    if (!_cohortOn) return false;
    _cohortAllGroups = groups;
    _cohortGroups = _cohortVisibleGroups();
    _syncCohortTemplateBtn();
    renderCohortDomains();
    renderCohortFiles();
    // 1 件しか無いなら開いておく (押して確かめる手を増やさない)。
    if (_cohortGroups.length === 1) return selectCohortDomain(_cohortGroups[0].domain);
    renderCohortCompare();
    return true;
  });
}

// テンプレ由来を含める / 外す。読み直しはしない (束ねる所まではテンプレ込み)。
function setCohortTemplates(on) {
  _cohortShowTemplates = !!on;
  _syncCohortTemplateBtn();
  _cohortGroups = _cohortVisibleGroups();
  // 外した結果、選んでいたドメインが表示から消えたら選択も解く。
  if (_cohortDomain && !_cohortGroupOf(_cohortDomain)) {
    _cohortDomain = null;
    _cohortResult = null;
  }
  renderCohortDomains();
  renderCohortFiles();
  if (!_cohortDomain) { renderCohortCompare(); return Promise.resolve(true); }
  return selectCohortDomain(_cohortDomain);
}

function _syncCohortTemplateBtn() {
  var el = _peekEls();
  if (!el.cohortTemplates) return;
  el.cohortTemplates.style.display = _cohortOn ? '' : 'none';
  el.cohortTemplates.setAttribute('aria-pressed', _cohortShowTemplates ? 'true' : 'false');
  el.cohortTemplates.classList.toggle('on', _cohortShowTemplates);
  el.cohortTemplates.textContent = _cohortShowTemplates ? '📄 テンプレも表示中' : '📄 テンプレも表示';
}

// ── 同名ファイルを左右に並べる (BLK-reviewer-20260912-2206-wish) ──
// reviewer は junior/primary の同じファイル名の図を突き合わせる。ドメイン突合は
// 「どの名前が食い違うか」をチップで出すが、どの行のどの語かは本文を自分で
// 開き直さないと分からず、2 フォルダから同名ファイルをテキストとして開いて
// 読み比べることになっていた。ここは本文そのものを 2 列に並べ、食い違う語だけを
// 光らせる。揃え方 (どちらの綴りに寄せるか) もその場で当てられる。
var _sbsOn = false;
var _sbsPairs = [];        // 同名で組めた組 (本文は未読)
var _sbsKey = null;        // 選んでいる組
var _sbsView = null;       // { pair, a, b, rows, marks, summary }
var _sbsMsg = '';          // 直前に何をしたか (揃えた結果)

function _sbsPairKey(p) { return p.base + '|' + p.a.folder + '|' + p.b.folder; }

function _sbsPairOf(key) {
  for (var i = 0; i < _sbsPairs.length; i++) {
    if (_sbsPairKey(_sbsPairs[i]) === key) return _sbsPairs[i];
  }
  return null;
}

function setSbsMode(on) {
  var el = _peekEls();
  _sbsOn = !!on;
  if (el.sbsToggle) {
    el.sbsToggle.setAttribute('aria-pressed', _sbsOn ? 'true' : 'false');
    el.sbsToggle.classList.toggle('on', _sbsOn);
  }
  if (!_sbsOn) {
    _sbsKey = null;
    _sbsView = null;
    _sbsMsg = '';
    renderSbs();
    if (el.modal && el.modal.style.display !== 'none') { renderPeekDirs(); renderPeekFiles(); }
    return Promise.resolve(true);
  }
  // 2 つの並べ方を同時に出さない。上下に別の突合が並ぶと、どちらの結果を
  // 見ているのかが画面からは決まらない。
  if (_cohortOn) setCohortMode(false);
  _peekName = null;
  if (el.title) el.title.textContent = '';
  if (el.svg) { el.svg.textContent = ''; el.svg.style.display = 'none'; }
  if (el.dsl) el.dsl.textContent = '';
  _sbsMsg = '';
  renderSbs();
  return _peekIndexDocs().then(function(docs) {
    if (!_sbsOn) return false;
    var SBS = window.MA.sideBySide;
    _sbsPairs = SBS ? SBS.pairsByFile(docs) : [];
    renderSbsPairs();
    renderSbsFiles();
    // 1 組しか無いなら開いておく (押して確かめる手を増やさない)。
    if (_sbsPairs.length === 1) return selectSbsPair(_sbsPairKey(_sbsPairs[0]));
    renderSbs();
    return true;
  });
}

// 選んだ組の本文だけを読む。一覧の段階では読まない (フォルダ数 × 枚数の
// 読み込みを、見る気になっていない段階で走らせない)。
function selectSbsPair(key) {
  var WS = window.MA.workspace;
  var SBS = window.MA.sideBySide;
  _sbsKey = key;
  _sbsView = null;
  _sbsMsg = '';
  renderSbsPairs();
  renderSbsFiles();
  renderSbs();
  var pair = _sbsPairOf(key);
  if (!pair || !WS || !SBS) { renderSbs(); return Promise.resolve(false); }
  function load(side) {
    var src = side.doc || {};
    return WS.loadFile(src._file, src._dir)
      .then(function(t) { return { name: side.name, dsl: typeof t === 'string' ? t : '', _dir: src._dir, _file: src._file }; })
      .catch(function() { return { name: side.name, dsl: '', _dir: src._dir, _file: src._file }; });
  }
  return Promise.all([load(pair.a), load(pair.b)]).then(function(both) {
    if (_sbsKey !== key) return false;   // 途中で選び直された
    _sbsView = {
      pair: pair, a: both[0], b: both[1],
      rows: SBS.rows(both[0], both[1]),
      marks: SBS.marks(both[0], both[1]),
      summary: SBS.summaryLine(both[0], both[1]),
    };
    renderSbs();
    // 指摘.md は並べる相手を選ぶのとは別の口なので、読めたら 1 行を足し直す。
    return _noteLoad().then(function() {
      if (_sbsKey === key) renderSbs();
      return true;
    });
  });
}

function renderSbsPairs() {
  var el = _peekEls();
  if (!el.dirs) return;
  el.dirs.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-head';
  head.id = 'sbs-pairs-head';
  head.textContent = _sbsPairs.length
    ? '同名ファイル (' + _sbsPairs.length + ')'
    : '同じファイル名を 2 人が持っている組がありません';
  el.dirs.appendChild(head);
  _sbsPairs.forEach(function(p) {
    var key = _sbsPairKey(p);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-dir sbs-pair' + (key === _sbsKey ? ' selected' : '');
    b.setAttribute('data-sbs-pair', p.base);
    b.textContent = p.base + ' (' + p.a.folder + ' × ' + p.b.folder + ')';
    b.addEventListener('click', function() { selectSbsPair(key); });
    el.dirs.appendChild(b);
  });
  if (el.notice) el.notice.textContent = '同名ファイルを並べています (読むだけ・保存先は動きません)';
}

// 組の 2 枚。押せば従来どおり 1 枚だけ本文と SVG で読める。
function renderSbsFiles() {
  var el = _peekEls();
  if (!el.files) return;
  el.files.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-head';
  head.id = 'sbs-files-head';
  var pair = _sbsPairOf(_sbsKey);
  head.textContent = pair ? '2 枚' : '組を選んでください';
  el.files.appendChild(head);
  if (!pair) return;
  [pair.a, pair.b].forEach(function(side) {
    var src = side.doc || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-file' + (src._file === _peekName && src._dir === _peekDir ? ' selected' : '');
    b.setAttribute('data-file-name', src._file);
    b.setAttribute('data-folder', side.folder);
    b.textContent = side.folder + ' / ' + side.base;
    b.addEventListener('click', function() {
      _peekDir = src._dir;
      showPeekFile(src._file).then(renderSbsFiles);
    });
    el.files.appendChild(b);
  });
}

// ── 複合図から部品を切り出して並べる ──
// BLK-junior-20260914-1006-wish: 先輩の該当図が GPIO 単独ではなく複合図
// (driver_common_class.puml = 共通基底 + 6 ドライバ) にしかないとき、並べて見る
// 機能はファイル名で対をなすためこの組は自動で並ばず、複合図を開いて
// Gpio_Driver を目で探すことになっていた。開いた図が複合図なら部品を並べ、
// 押した部品の所だけを切り出して、自分の同じ部品の図と左右に並べる。
var _partSel = '';

function _peekFolderName(dir) {
  var PF = window.MA.peekFolder;
  for (var i = 0; i < _peekDirs.length; i++) {
    if (PF && PF.samePath(_peekDirs[i].path, dir)) return _peekDirs[i].name;
  }
  return PF ? PF.baseName(dir) : '';
}

function renderPartChips() {
  var host = document.getElementById('peek-parts');
  var PS = window.MA.partSlice;
  if (!host) return;
  host.textContent = '';
  var list = (PS && _peekDsl && PS.isComposite(_peekDsl)) ? PS.parts(_peekDsl) : [];
  if (!list.length) { host.style.display = 'none'; _partSel = ''; return; }
  host.style.display = 'block';
  var head = document.createElement('div');
  head.className = 'peek-parts-head';
  head.id = 'peek-parts-head';
  head.textContent = 'この図は ' + list.length + ' 部品の複合図です。部品を押すと、その所だけを切り出して自分の図と並べます';
  host.appendChild(head);
  list.forEach(function(p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-part-chip' + (p.name === _partSel ? ' selected' : '');
    b.setAttribute('data-part', p.name);
    b.textContent = p.name + ' (' + p.methods + ')';
    b.addEventListener('click', function() { selectPartPair(p.name); });
    host.appendChild(b);
  });
}

// BLK-junior-20260914-1006: 自分の図と先輩の図はファイル名が対をなさないので、
// 「先輩のどの図を見ればいいのか」を覗き一覧から目で当てていた (複合図を開いて
// 中に Gpio_Driver があるかを確かめる)。今開いている自分の図の部品名で
// 覗いているフォルダの本文を引き、載っている図を名指しして、押せばそのまま
// 切り出しと並ぶ所まで行く。
function findPeekPartHome() {
  var PS = window.MA.partSlice;
  var WS = window.MA.workspace;
  var host = document.getElementById('peek-parts');
  if (!PS || !WS || !host) return Promise.resolve(false);
  var mine = WS.getActive ? WS.getActive() : null;
  var myDsl = mine ? (window.MA.dslUtils ? window.MA.dslUtils.docDsl(mine) : mine.dsl) : '';
  var myParts = myDsl ? PS.parts(myDsl).map(function(p) { return p.name; }) : [];
  var dir = _peekDir;
  host.style.display = 'block';
  host.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-parts-head';
  head.id = 'peek-find-head';
  host.appendChild(head);
  if (!myParts.length || !dir) {
    head.textContent = '今開いている図に部品 (クラス) がありません';
    return Promise.resolve(false);
  }
  head.textContent = myParts.join('・') + ' を ' + _peekFolderName(dir) + ' の中から探しています…';
  return WS.listFiles(dir).then(function(names) {
    return Promise.all((names || []).map(function(n) {
      return WS.loadFile(n, dir)
        .then(function(t) { return { name: n, dsl: typeof t === 'string' ? t : '' }; })
        .catch(function() { return { name: n, dsl: '' }; });
    }));
  }).then(function(docs) {
    var hits = PS.findInFolder(docs, myParts);
    if (!hits.length) {
      head.textContent = myParts.join('・') + ' を載せた図は ' + _peekFolderName(dir) + ' にありません';
      head.setAttribute('data-find-hits', '0');
      return false;
    }
    head.textContent = myParts.join('・') + ' を載せた先輩の図が ' + hits.length + ' 枚見つかりました';
    head.setAttribute('data-find-hits', String(hits.length));
    hits.forEach(function(h) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'peek-part-chip';
      b.setAttribute('data-find-file', h.name);
      b.setAttribute('data-find-part', h.part);
      b.textContent = PS.foundLabel(h);
      b.addEventListener('click', function() {
        // 押した先で切り出しまで進む (開き直してから部品を押し直させない)。
        showPeekFile(h.name).then(function() { return selectPartPair(h.part); });
      });
      host.appendChild(b);
    });
    return true;
  }).catch(function() {
    head.textContent = '探せませんでした';
    return false;
  });
}

// 押した部品の切り出しと、自分のフォルダの同じ部品の図を並べる。
// 読むのは候補 (名前に部品名を含む数枚) だけ。
function selectPartPair(partName) {
  var PS = window.MA.partSlice;
  var WS = window.MA.workspace;
  var SBS = window.MA.sideBySide;
  var el = _peekEls();
  if (!PS || !WS || !SBS || !_peekDsl) return Promise.resolve(false);
  var res = PS.slice(_peekDsl, partName);
  if (!res) return Promise.resolve(false);

  var key = 'part:' + _peekName + '|' + res.part.name;
  _partSel = res.part.name;
  if (_cohortOn) setCohortMode(false);
  _sbsOn = true;
  _sbsPairs = [];
  _sbsKey = key;
  _sbsView = null;
  _sbsMsg = '';
  if (el.sbsToggle) {
    el.sbsToggle.setAttribute('aria-pressed', 'true');
    el.sbsToggle.classList.add('on');
  }
  renderPartChips();
  renderSbs();

  var theirDir = _peekDir;
  var theirFile = _peekName;
  var myDir = _myPeekDir();
  var sliced = {
    name: _peekFolderName(theirDir) + '/' + theirFile,
    dsl: res.dsl, _dir: theirDir, _file: theirFile,
  };
  return WS.listFiles(myDir).then(function(names) {
    var cands = PS.candidates(names || [], res.part.name);
    return Promise.all(cands.map(function(n) {
      return WS.loadFile(n, myDir)
        .then(function(t) { return { name: n, dsl: typeof t === 'string' ? t : '', _dir: myDir, _file: n }; })
        .catch(function() { return null; });
    }));
  }).catch(function() { return []; }).then(function(docs) {
    if (_sbsKey !== key) return false;       // 途中で別の部品を押された
    var mine = PS.pickOwn((docs || []).filter(function(d) { return d; }), res.part.name);
    if (!mine) {
      mine = { name: '(該当図なし)', dsl: '', _dir: myDir, _file: '' };
      _sbsMsg = PS.sliceLabel(res) + ' / 自分の保存フォルダに ' + res.part.name
        + ' のクラス図が見つかりませんでした (切り出しだけ出しています)';
    } else {
      _sbsMsg = PS.sliceLabel(res) + ' / 自分の ' + mine._file + ' と並べています。'
        + window.MA.sideBySide.summaryLine(mine, sliced);
    }
    var pair = {
      base: res.part.name,
      a: { doc: mine, name: mine.name, base: mine._file || '(該当図なし)', folder: _peekFolderName(myDir) },
      b: { doc: sliced, name: sliced.name, base: theirFile + ' の ' + res.part.name + ' 切り出し',
           folder: _peekFolderName(theirDir) },
    };
    _sbsView = {
      pair: pair, a: mine, b: sliced,
      rows: SBS.rows(mine, sliced),
      marks: SBS.marks(mine, sliced),
      summary: SBS.summaryLine(mine, sliced),
    };
    renderSbs();
    return true;
  });
}

function _sbsSegmentSpans(host, segs, side) {
  (segs || []).forEach(function(s) {
    if (!s.mark) { host.appendChild(document.createTextNode(s.text)); return; }
    var span = document.createElement('span');
    span.className = 'sbs-mark sbs-mark-' + s.mark;
    span.setAttribute('data-sbs-mark', s.mark);
    span.setAttribute('data-sbs-side', side);
    span.textContent = s.text;
    // 相手側の綴りを添える。押さずに読んで分かるようにする。
    span.title = s.mark === 'spelling'
      ? '綴り違い: ' + s.left + ' / ' + s.right
      : 'この図にしかありません';
    host.appendChild(span);
  });
}

function renderSbs() {
  var el = _peekEls();
  if (!el.sbs) return;
  el.sbs.textContent = '';
  if (!_sbsOn) { el.sbs.style.display = 'none'; return; }
  el.sbs.style.display = 'block';

  if (!_sbsKey) {
    var hint = document.createElement('div');
    hint.className = 'sbs-hint';
    hint.id = 'sbs-hint';
    hint.textContent = _sbsPairs.length
      ? '同じファイル名を 2 人が持っている組を ' + _sbsPairs.length + ' 件見つけました。左で組を選んでください。'
      : '同じファイル名を 2 人が持っている組がありません。';
    el.sbs.appendChild(hint);
    return;
  }
  var v = _sbsView;
  if (!v) {
    var loading = document.createElement('div');
    loading.className = 'sbs-hint';
    loading.textContent = '読み込み中…';
    el.sbs.appendChild(loading);
    return;
  }
  var pair = v.pair;
  var head = document.createElement('div');
  head.className = 'sbs-head';
  head.id = 'sbs-head';
  head.textContent = window.MA.sideBySide.headerLabel(pair);
  el.sbs.appendChild(head);

  var sum = document.createElement('div');
  sum.className = 'sbs-summary';
  sum.id = 'sbs-summary';
  sum.textContent = _sbsMsg || v.summary;
  el.sbs.appendChild(sum);

  // BLK-junior-20260913-0306-wish (追記): 指摘.md にこの図の名前が挙がっているか。
  // 挙がっていなければ「指摘はありません」と言い切る (確かめるために指摘.md を
  // 全文読み直す工程を消す)。図に残る判断の注記 (domain-verdict) も添える。
  var noteText = _noteDocStatusText();
  if (noteText) {
    var ns = document.createElement('div');
    ns.className = 'sbs-summary';
    ns.id = 'sbs-note-status';
    ns.setAttribute('data-note-clear', /指摘はありません/.test(noteText) ? '1' : '0');
    ns.textContent = '🔖 ' + noteText;
    el.sbs.appendChild(ns);
  }

  var grid = document.createElement('div');
  grid.className = 'sbs-grid';
  grid.id = 'sbs-grid';
  [' ', pair.a.folder + ' / ' + pair.a.base, ' ', pair.b.folder + ' / ' + pair.b.base]
    .forEach(function(t, i) {
      var h = document.createElement('div');
      h.className = 'sbs-col-head' + (i === 0 || i === 2 ? ' sbs-ln' : '');
      h.textContent = t;
      grid.appendChild(h);
    });
  v.rows.forEach(function(r) {
    function cell(cls, text) {
      var d = document.createElement('div');
      d.className = cls;
      if (text != null) d.textContent = text;
      return d;
    }
    var rowCls = ' sbs-row-' + r.kind;
    var lnA = cell('sbs-ln' + rowCls, r.lineA == null ? '' : String(r.lineA));
    var left = cell('sbs-text sbs-text-left' + rowCls, null);
    if (r.left == null) left.classList.add('sbs-gap');
    else _sbsSegmentSpans(left, r.leftSegments, 'left');
    var lnB = cell('sbs-ln' + rowCls, r.lineB == null ? '' : String(r.lineB));
    var right = cell('sbs-text sbs-text-right' + rowCls, null);
    if (r.right == null) right.classList.add('sbs-gap');
    else _sbsSegmentSpans(right, r.rightSegments, 'right');
    left.setAttribute('data-sbs-kind', r.kind);
    right.setAttribute('data-sbs-kind', r.kind);
    grid.appendChild(lnA); grid.appendChild(left);
    grid.appendChild(lnB); grid.appendChild(right);
  });
  el.sbs.appendChild(grid);
  _renderSbsAlign(el.sbs, v);
}

// 綴り違いを「どちらに揃えるか」。書き戻せるのは自分の保存フォルダにある方だけ
// (他人の図を勝手に直さない)。
function _renderSbsAlign(host, v) {
  var SBS = window.MA.sideBySide;
  var PF = window.MA.peekFolder;
  var spell = SBS.gaps(v.marks).filter(function(r) { return r.status === 'spelling'; });
  if (!spell.length) return;
  var dir = _myPeekDir();
  var mineIsA = !!(PF && PF.samePath(v.a._dir, dir));
  var mineIsB = !!(PF && PF.samePath(v.b._dir, dir));
  spell.forEach(function(r) {
    var row = document.createElement('div');
    row.className = 'sbs-align';
    row.setAttribute('data-sbs-align', r.key);
    var note = document.createElement('span');
    note.className = 'sbs-align-note';
    note.textContent = r.left + ' / ' + r.right
      + (r.by === '部分一致' ? ' (対応候補)' : '') + ' — ';
    row.appendChild(note);
    if (!mineIsA && !mineIsB) {
      var ro = document.createElement('span');
      ro.className = 'sbs-align-note';
      ro.textContent = 'どちらも自分の保存フォルダの図ではありません (読むだけ)';
      row.appendChild(ro);
      host.appendChild(row);
      return;
    }
    // 自分の図を、相手の綴りに書き替える方だけを出す。
    var mine = mineIsA ? v.a : v.b;
    var from = mineIsA ? r.left : r.right;
    var to = mineIsA ? r.right : r.left;
    var otherFolder = mineIsA ? v.pair.b.folder : v.pair.a.folder;
    if (!from || !to) { host.appendChild(row); return; }
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sbs-align-btn';
    b.setAttribute('data-sbs-align-to', to);
    b.textContent = otherFolder + ' の「' + to + '」に揃える';
    b.addEventListener('click', function() { applySbsAlign(mine, from, to, b); });
    row.appendChild(b);
    host.appendChild(row);
  });
}

function applySbsAlign(mine, from, to, btn) {
  var BR = window.MA.bulkRename;
  var WS = window.MA.workspace;
  if (!BR || !WS) return Promise.resolve(false);
  var n = BR.countIn(mine.dsl, from);
  if (!n) { _sbsMsg = '「' + from + '」は本文に見当たりません'; renderSbs(); return Promise.resolve(false); }
  var next = BR.replaceIn(mine.dsl, from, to);
  if (btn) btn.disabled = true;
  return WS.saveToFile({ name: mine._file.replace(/\.[^.]+$/, ''), dsl: next }, mine._dir)
    .then(function(ok) {
      if (btn) btn.disabled = false;
      if (!ok) { _sbsMsg = '書き戻せませんでした (保存先を確認してください)'; renderSbs(); return false; }
      var msg = from + ' → ' + to + ' を ' + n + ' 箇所、' + mine.name + ' に保存しました';
      // 並べ直す。直った姿が同じ画面にすぐ出ないと、直ったか確かめる手が増える。
      return selectSbsPair(_sbsKey).then(function() {
        _sbsMsg = msg;
        renderSbs();
        return true;
      });
    })
    .catch(function() {
      if (btn) btn.disabled = false;
      _sbsMsg = '書き戻せませんでした (保存先を確認してください)';
      renderSbs();
      return false;
    });
}

// ── 指摘.md の 1 件から並べて見る (BLK-junior-20260913-0306-wish) ──
// junior は reviewer の指摘.md を GUI の外でテキストとして読み、そこに書かれた
// 図名を目で拾い、覗き機能で自分と先輩のフォルダから同じ名前を探し当ててから
// ようやく見比べていた。指摘 1 件を押せば、その図の組が並んだ状態で出る所まで
// 画面が連れて行く。指摘文と図の対応付けは reviewNote が持つ (ここは描画だけ)。
var _noteOn = false;
var _noteRows = [];        // reviewNote.rows の戻り
var _noteFile = null;      // 読んだ指摘.md ({folder, name, text})
var _noteKey = null;       // 選んでいる指摘の id
var _noteMsg = '';         // 押した結果 (組が無かったときの理由など)
var _notePlans = [];       // findingActions.plans の戻り (指摘 1 件 = 当てる操作 1 つ)
var _noteBusy = '';        // 当てている最中の指摘 id
// BLK-junior-20260914-1106-wish: 指摘 1 件 = 対象の図種・版 1 つ。
var _noteNames = [];       // 覗ける全フォルダにある図名 (版ぞろいを引くため)
var _noteIndex = null;     // reviewNote.index の戻り (図名 → それを持つフォルダ)
var _noteTargets = {};     // { 指摘 id: findingVariant.choose の戻り }
var _noteHit = null;       // 選んだ指摘の対象 ({id, name, family, kind}) — 📂一覧を光らせる

function _noteEls() {
  return { note: document.getElementById('peek-note'),
           noteToggle: document.getElementById('peek-note-toggle') };
}

function _noteRowOf(id) {
  for (var i = 0; i < _noteRows.length; i++) {
    if (_noteRows[i].id === id) return _noteRows[i];
  }
  return null;
}

// 指摘.md と図名の突き合わせを読む。パネルを開いているかどうかとは別に持つ
// (並べた図に「指摘なし」と言い切るのに、指摘を開いていることを条件にしない)。
var _noteLoading = null;

function _noteLoad(force) {
  var RN = window.MA.reviewNote;
  if (!RN) return Promise.resolve(false);
  if (!force && _noteFile) return Promise.resolve(true);
  if (!force && _noteLoading) return _noteLoading;
  var dir = _wsFileDir();
  // 指摘 (.md) と、突き合わせる図名の一覧を同時に取る。図名は実在するものだけを
  // 使う (本文から「それらしい語」を拾うと md5 値やコマンド名が図名として並ぶ)。
  _noteLoading = Promise.all([
    fetch('/peek-notes?dir=' + encodeURIComponent(dir))
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; }),
    _peekIndexDocs(),
  ]).then(function(both) {
    var data = both[0] || {};
    var idx = RN.index(both[1]);
    _noteFile = RN.pickNote(data.notes);
    _noteIndex = idx;
    _noteNames = idx.names.slice();
    _noteRows = _noteFile ? RN.rows(RN.parse(_noteFile.text), idx) : [];
    _notePlans = _notePlansFor(_noteRows);
    _noteTargets = _noteTargetsFor(_noteRows);
    _noteLoading = null;
    return true;
  }).catch(function() {
    _noteRows = [];
    _notePlans = [];
    _noteTargets = {};
    _noteNames = [];
    _noteIndex = null;
    _noteLoading = null;
    return false;
  });
  return _noteLoading;
}

// 並べている図に付ける 1 行。指摘.md にその図名が 1 件も挙がっていなければ
// 「指摘はありません」と言い切り、図に残る判断の注記 (domain-verdict) も添える。
function _noteDocStatusText() {
  var RN = window.MA.reviewNote;
  if (!RN || !_noteFile || !_sbsView) return '';
  var v = _sbsView;
  var docs = [
    { folder: v.pair.a.folder, dsl: v.a.dsl },
    { folder: v.pair.b.folder, dsl: v.b.dsl },
  ];
  return RN.docStatus(_noteRows, v.pair.base, docs).text;
}

function setNoteMode(on) {
  var el = _noteEls();
  _noteOn = !!on;
  if (el.noteToggle) {
    el.noteToggle.setAttribute('aria-pressed', _noteOn ? 'true' : 'false');
    el.noteToggle.classList.toggle('on', _noteOn);
  }
  _noteMsg = '';
  if (!_noteOn) {
    _noteKey = null;
    renderNotePanel();
    return Promise.resolve(true);
  }
  _noteRows = [];
  _notePlans = [];
  _noteTargets = {};
  _noteHit = null;
  _noteFile = null;
  renderNotePanel();
  return _noteLoad(true).then(function(ok) {
    if (!_noteOn) return false;
    renderNotePanel();
    return ok;
  });
}

// ── 指摘が指す図種・版 (BLK-junior-20260914-1106-wish) ──
// 指摘.md は「対象は本番用か資料用か」まで書くのに、開く側は図種単位でしか
// 見分けず、同じ枠に並ぶ (資料用) を目で読み比べて選んでいた。指摘文に書いて
// あるものを読み、対象の 1 枚を決めて、📂一覧のその行を光らせる。
function _noteTargetsFor(rows) {
  var FV = window.MA.findingVariant;
  var out = {};
  if (!FV) return out;
  (rows || []).forEach(function(r) {
    out[r.id] = FV.choose({
      bases: (r.docs || []).map(function(d) { return d.name; }),
      names: _noteNames,
      text: r.text || (r.title + '\n' + r.body),
    });
  });
  return out;
}

function _noteTargetOf(id) { return _noteTargets[id] || null; }

// 選んだ指摘の対象。📂一覧はこれを見て行を光らせる (覗く画面を閉じても残す —
// 手順 1 は覗いて終わりではなく、続けて自分の一覧から同じ版を開く)。
function noteHitOf(name) {
  if (!_noteHit || !name) return '';
  if (_noteHit.name === name) return 'target';
  return (_noteHit.family || []).indexOf(name) >= 0 ? 'family' : '';
}

// 組 (並べて見る左右) を、対象に選んだ版で取り直す。その版の組が無ければ
// 今までどおり先頭の組 (指摘が名指しした図) にする。
function _notePairFor(row, pick) {
  var pairs = (row && row.pairs) || [];
  if (pick && pick.name) {
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].base === pick.name) return pairs[i];
    }
    // 指摘文は版を言葉で指すので (「対象は資料用です」)、その版のファイル名は
    // 本文に綴られておらず、指摘が名指しした図の組には入ってこない。
    // 両方のフォルダがその版を持っているなら、組はここで作れる。
    var e = _noteIndex && _noteIndex.map ? _noteIndex.map[pick.name] : null;
    if (e && e.folders.length >= 2) {
      var fs = e.folders.slice().sort();
      return { base: pick.name, a: fs[0], b: fs[1] };
    }
  }
  return pairs.length ? pairs[0] : null;
}

// 指摘 1 件を押したときの中身。図の組が取れていれば、その組を並べて見る画面で開く。
function selectNoteFinding(id) {
  var row = _noteRowOf(id);
  var pick = _noteTargetOf(id);
  _noteKey = id;
  _noteMsg = '';
  _noteHit = (pick && pick.name)
    ? { id: id, name: pick.name, family: (pick.family || []).slice(), kind: pick.kind }
    : null;
  try { refreshFolderPanelNow(); } catch (e) {}
  if (!row) { renderNotePanel(); return Promise.resolve(false); }
  if (!row.pairs.length) {
    _noteMsg = row.docs.length
      ? '「' + row.docs[0].name + '」は ' + (row.docs[0].folders.join('・') || '—')
        + ' にしかありません (並べる相手がいません)'
      : 'この指摘には、保存フォルダにある図の名前が書かれていません';
    renderNotePanel();
    return Promise.resolve(false);
  }
  var p = _notePairFor(row, pick);
  var key = p.base + '|' + p.a + '|' + p.b;
  renderNotePanel();
  // 並べて見る画面は同名ファイルで組む。組の索引はそこが持っているので、
  // 開いてから同じ鍵で選ぶ (指摘側で組を作り直すと、左右の決め方が二重になる)。
  var open = _sbsOn ? Promise.resolve(true) : setSbsMode(true);
  return open.then(function() {
    return selectSbsPair(key);
  }).then(function(ok) {
    _noteMsg = ok
      ? p.base + ' を ' + p.a + ' ⇔ ' + p.b + ' で並べました'
      : p.base + ' の本文を読めませんでした';
    // 指摘が指した版が片方のフォルダにしか無いと、並べられるのは別の版になる。
    // 黙って別の版を並べると、その版を今回の対象だと読んでしまう。
    if (ok && pick && pick.name && pick.name !== p.base) {
      _noteMsg += '（指摘が指す ' + pick.name + ' は片方のフォルダにしかないので、'
        + '📂一覧で光らせています）';
    }
    renderNotePanel();
    return ok;
  });
}

// ── 指摘 1 件を [適用] で当てる (BLK-primary-20260914-1006-wish) ──
// 指摘.md の 1 件から図の組が並ぶ所までは来たが、そこから先の「これは ⇄一括置換 か、
// 再出力か、別ドメイン宣言か」は primary が毎回指摘文を読んで決め、対応する画面を
// 探して開いていた。手段は指摘文に書いてあるので、翻訳は findingActions に任せ、
// ここは当てるだけにする (どの画面を開くかを人が決めなくてよくする)。
function _noteMineFolder() {
  for (var i = 0; i < _peekDirs.length; i++) {
    if (_peekDirs[i] && _peekDirs[i].current) return _peekDirs[i].name;
  }
  return '';
}

function _notePlansFor(rows) {
  var FA = window.MA.findingActions;
  if (!FA) return [];
  return FA.plans(rows, { mineFolder: _noteMineFolder() });
}

function _notePlanOf(id) {
  var FA = window.MA.findingActions;
  return FA ? FA.planOf(_notePlans, id) : null;
}

// 指摘に挙がった図のうち、自分のフォルダにある実体 ({_dir, _file})。
function _noteMineFiles(plan) {
  var mine = _noteMineFolder();
  var out = [];
  (plan && plan.docs || []).forEach(function(name) {
    var row = _noteRowOf(plan.id);
    ((row && row.docs) || []).forEach(function(d) {
      if (d.name !== name) return;
      (d.docs || []).forEach(function(pd) {
        if (!pd || !pd._dir || !pd._file) return;
        if (mine && String(pd.name).indexOf(mine + '/') !== 0) return;
        out.push({ name: name, dir: pd._dir, file: pd._file });
      });
    });
  });
  return out;
}

// 再出力: 指摘の図を 1 枚ずつ描き直して保存フォルダの .svg を置き換える。
// 1 枚失敗しても残りは進める (1 枚のために全部止まると手作業に戻る)。
function _noteApplyReexport(plan) {
  var WS = window.MA.workspace;
  var files = _noteMineFiles(plan);
  if (!WS || !files.length) return Promise.resolve({ ok: false, message: '出し直せる図がありません' });
  var done = [];
  var failed = [];
  return files.reduce(function(chain, f) {
    return chain.then(function() {
      return WS.loadFile(f.file, f.dir).then(function(dsl) {
        if (dsl == null) throw new Error('読めません');
        return renderDslToSvg(dsl);
      }).then(function(svg) {
        return fetch('/autosave-svg', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: f.name, dir: f.dir, svg: svg }),
        });
      }).then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        done.push(f.name);
      }).catch(function() { failed.push(f.name); });
    });
  }, Promise.resolve()).then(function() {
    return { ok: done.length > 0, done: done,
             message: failed.length ? failed.join('・') + ' は出し直せませんでした' : '' };
  });
}

// ラベル統一: 綴りの言い換えを、指摘が名指しした図 (無ければ自分のフォルダの
// 当たる図) だけに当てる。全図に当てない (指摘は対象を絞って書かれている)。
function _noteApplyRename(plan) {
  var WS = window.MA.workspace;
  var BR = window.MA.bulkRename;
  if (!WS || !BR) return Promise.resolve({ ok: false, message: '一括置換が使えません' });
  var dir = _wsFileDir();
  var pick = plan.scope === 'folder'
    ? WS.listFiles(dir).then(function(names) {
        return (names || []).map(function(n) { return { name: n, dir: dir, file: n }; });
      })
    : Promise.resolve(_noteMineFiles(plan));
  return pick.then(function(files) {
    if (!files.length) return { ok: false, message: '当てる図がありません' };
    var done = [];
    var hits = 0;
    var pairs = [];
    return files.reduce(function(chain, f) {
      return chain.then(function() {
        return WS.loadFile(f.file, f.dir).then(function(dsl) {
          var n = dsl == null ? 0 : BR.countIn(dsl, plan.from);
          if (!n) return null;
          var next = BR.replaceIn(dsl, plan.from, plan.to);
          // 書く前を基準に置く (BLK-primary-20260914-1206)。
          if (window.MA.saveDiff) { try { window.MA.saveDiff.markIfAbsent(f.name, dsl); } catch (e) {} }
          return WS.saveToFile({ name: f.name, dsl: next }, f.dir)
            .then(function(ok) {
              if (!ok) return;
              hits += n; done.push(f.name);
              pairs.push({ name: f.name, before: dsl, after: next });
            });
        }).catch(function() { return null; });
      });
    }, Promise.resolve()).then(function() {
      // [適用] は保存フォルダへ直接書くので、ここで前後を控えないと後から出せない。
      _recordWrite('note-rename', { from: plan.from, to: plan.to }, pairs);
      return done.length
        ? { ok: true, done: done, hits: hits }
        : { ok: false, message: '「' + plan.from + '」は保存フォルダの図に見当たりません' };
    });
  });
}

// 別ドメイン明示: 相手と名前が同じでも別物、という判断を自分の図に書き残す。
// 書く形は突合の場 (domain-verdict) と同じにする (次に突合したとき判断済みと読める)。
function _noteApplyVerdict(plan) {
  var WS = window.MA.workspace;
  var DV = window.MA.domainVerdict;
  var files = _noteMineFiles(plan);
  if (!WS || !DV || !files.length) return Promise.resolve({ ok: false, message: '印を書ける図がありません' });
  var done = [];
  var pairs = [];
  return files.reduce(function(chain, f) {
    return chain.then(function() {
      return WS.loadFile(f.file, f.dir).then(function(dsl) {
        if (dsl == null) return null;
        var DC = window.MA.domainCohort;
        var domain = DC ? DC.domainOf(f.name) : f.name;
        var next = DV.applyMark(dsl, 'separate', domain, plan.otherFolder);
        if (next === dsl) { done.push(f.name); return null; }
        if (window.MA.saveDiff) { try { window.MA.saveDiff.markIfAbsent(f.name, dsl); } catch (e) {} }
        return WS.saveToFile({ name: f.name, dsl: next }, f.dir).then(function(ok) {
          if (!ok) return;
          done.push(f.name);
          pairs.push({ name: f.name, before: dsl, after: next });
        });
      }).catch(function() { return null; });
    });
  }, Promise.resolve()).then(function() {
    _recordWrite('note-verdict', { note: plan.otherFolder ? plan.otherFolder + ' とは別物' : '' }, pairs);
    return done.length ? { ok: true, done: done } : { ok: false, message: '書き戻せませんでした' };
  });
}

// 保存フォルダの図を全部読む。突合 (eventSync / methodAudit) は「状態遷移図と
// クラス図の両方」を見て初めて足す先を決められるので、指摘が名指しした図だけでは
// 足りない (指摘は「メソッドが無い」としか書かず、どのクラス図に足すかは書かない)。
function _noteFolderDocs() {
  var WS = window.MA.workspace;
  if (!WS) return Promise.resolve([]);
  var dir = _wsFileDir();
  return WS.listFiles(dir).then(function(names) {
    return (names || []).reduce(function(chain, n) {
      return chain.then(function(acc) {
        return WS.loadFile(n, dir).then(function(dsl) {
          if (dsl != null) acc.push({ id: n, name: n, dsl: dsl, _dir: dir, _file: n });
          return acc;
        }).catch(function() { return acc; });
      });
    }, Promise.resolve([]));
  }).catch(function() { return []; });
}

function _noteSaveDocs(changed) {
  var WS = window.MA.workspace;
  var done = [];
  return (changed || []).reduce(function(chain, c) {
    return chain.then(function() {
      return WS.saveToFile({ name: c.name, dsl: c.dsl }, _wsFileDir()).then(function(ok) {
        if (ok) done.push(c.name);
      }).catch(function() { return null; });
    });
  }, Promise.resolve()).then(function() { return done; });
}

// メソッド追加: 「遷移ラベルに対応するメソッドが無い」指摘を、⇄突合の画面を
// 開かずにその場で当てる (BLK-primary-20260914-1106-wish)。足す先のクラスと
// メソッド名は eventSync の突合が出すので、ここは読む → 当てる → 保存だけ。
function _noteApplyAddMethod(plan) {
  var ES = window.MA.eventSync;
  if (!ES || !window.MA.workspace) return Promise.resolve({ ok: false, message: '突合が使えません' });
  return _noteFolderDocs().then(function(docs) {
    if (!docs.length) return { ok: false, message: '保存フォルダに図がありません' };
    var built = ES.build(docs);
    // 指摘が状態遷移図を名指ししていれば、その図の遷移だけを足す。保存フォルダ全体の
    // 欠落を当てると、指摘が触れていない図の分まで黙って増える (ラベル統一と同じ約束)。
    var only = {};
    (plan.docs || []).forEach(function(n) { only[n] = true; });
    var want = built.missing.filter(function(r) {
      if (!plan.docs || !plan.docs.length) return true;
      return (r.stateDocs || []).some(function(n) { return only[n]; });
    });
    if (!want.length) {
      return { ok: false, message: '足りないメソッドはありません (突合では欠落 0 件)' };
    }
    var res = ES.apply(docs, want, 'void');
    if (!res.changed.length) return { ok: false, message: '足す先のクラスが見つかりません' };
    return _noteSaveDocs(res.changed).then(function(done) {
      return done.length
        ? { ok: true, done: done, added: res.added, hits: res.added.length }
        : { ok: false, message: '書き戻せませんでした' };
    });
  });
}

// クラス追加: 「このクラスがクラス図に不在」を、宣言だけ足して埋める。
// メンバは書かない (指摘はクラスの不在しか言っていない。想像で操作を足すと
// 実在しないメソッドが突合の「あり」側に回る)。
function _noteApplyAddClass(plan) {
  var CS = window.MA.classScaffold;
  var MAUD = window.MA.methodAudit;
  if (!CS || !MAUD || !window.MA.workspace) {
    return Promise.resolve({ ok: false, message: 'クラス図の組み立てが使えません' });
  }
  return _noteFolderDocs().then(function(docs) {
    // 足す先はクラス宣言を持つ図。複数あれば宣言の多い方 (本体のクラス図)。
    var target = null;
    var best = -1;
    docs.forEach(function(d) {
      var n = MAUD.parseClassDoc(d.dsl).classes.length;
      if (n > best) { best = n; target = d; }
    });
    if (!target || best <= 0) return { ok: false, message: '保存フォルダにクラス図がありません' };
    var declared = CS.existingIds(target.dsl);
    var want = (plan.classes || []).filter(function(c) { return !declared[c]; });
    if (!want.length) {
      return { ok: false, message: '指摘のクラスは ' + target.name + ' に宣言済みです' };
    }
    var dsl = CS.insertBeforeEnd(target.dsl, want.map(function(c) { return 'class ' + c; }));
    return _noteSaveDocs([{ name: target.name, dsl: dsl }]).then(function(done) {
      return done.length
        ? { ok: true, done: done, added: want, hits: want.length }
        : { ok: false, message: '書き戻せませんでした' };
    });
  });
}

function applyNoteFinding(id) {
  var FA = window.MA.findingActions;
  var plan = _notePlanOf(id);
  _noteKey = id;
  if (!FA || !plan || !plan.ready) {
    _noteMsg = plan ? (plan.reason || '当てられません') : '指摘が見つかりません';
    renderNotePanel();
    return Promise.resolve(false);
  }
  _noteBusy = id;
  _noteMsg = plan.text + ' …';
  renderNotePanel();
  var run = plan.kind === 'rename' ? _noteApplyRename(plan)
          : plan.kind === 'verdict' ? _noteApplyVerdict(plan)
          : plan.kind === 'addmethod' ? _noteApplyAddMethod(plan)
          : plan.kind === 'addclass' ? _noteApplyAddClass(plan)
          : _noteApplyReexport(plan);
  return run.catch(function() {
    return { ok: false, message: '当てられませんでした' };
  }).then(function(res) {
    _noteBusy = '';
    _noteMsg = FA.resultText(plan, res);
    renderNotePanel();
    return !!(res && res.ok);
  });
}

function renderNotePanel() {
  var el = _noteEls();
  var RN = window.MA.reviewNote;
  if (!el.note) return;
  el.note.textContent = '';
  if (!_noteOn) { el.note.style.display = 'none'; return; }
  el.note.style.display = 'block';

  var head = document.createElement('div');
  head.className = 'note-head';
  head.id = 'note-head';
  head.textContent = _noteFile
    ? (_noteFile.folder + ' / ' + _noteFile.name)
    : '隣のフォルダに指摘 (.md) がありません';
  el.note.appendChild(head);

  var sum = document.createElement('div');
  sum.className = 'note-summary';
  sum.id = 'note-summary';
  sum.textContent = _noteMsg || (RN ? RN.summaryText(_noteRows) : '');
  el.note.appendChild(sum);

  // 「今日 [適用] だけで済む件数」は、並べて見られる件数とは別の数なので別行にする。
  var FA = window.MA.findingActions;
  if (FA && _notePlans.length) {
    var asum = document.createElement('div');
    asum.className = 'note-summary';
    asum.id = 'note-apply-summary';
    asum.textContent = FA.summaryText(_notePlans);
    el.note.appendChild(asum);
  }

  if (!_noteRows.length) {
    var hint = document.createElement('div');
    hint.className = 'note-hint';
    hint.id = 'note-hint';
    hint.textContent = _noteFile
      ? '指摘.md に見出し (## ...) がありません'
      : '指摘は保存先の隣のフォルダ (reviewer など) の .md から読みます';
    el.note.appendChild(hint);
    return;
  }

  _noteRows.forEach(function(r) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-finding' + (r.id === _noteKey ? ' selected' : '');
    b.setAttribute('data-note-id', r.id);
    b.setAttribute('data-note-ready', r.ready ? '1' : '0');
    b.setAttribute('data-note-docs', r.docs.map(function(d) { return d.name; }).join(','));
    if (r.pairs.length) b.setAttribute('data-note-pair', r.pairs[0].base);
    r.marks.forEach(function(m) {
      var s = document.createElement('span');
      s.className = 'note-mark';
      s.textContent = m;
      b.appendChild(s);
    });
    var label = document.createElement('span');
    label.className = 'note-docs';
    label.textContent = RN ? RN.rowLabel(r) : r.title;
    b.appendChild(label);
    b.addEventListener('click', function() { selectNoteFinding(r.id); });
    el.note.appendChild(b);

    // 対象の図種・版 1 行 (BLK-junior-20260914-1106-wish)。押す前に「どの版が
    // 開くのか」が読める。同じ図の版が複数あるのに指摘が版を書いていなければ、
    // 本番用を選んだことと、ほかの版があることをその場で言う。
    var FV = window.MA.findingVariant;
    var pick = _noteTargetOf(r.id);
    if (FV && pick) {
      var tr = document.createElement('div');
      tr.className = 'note-target-row';
      tr.setAttribute('data-note-target-for', r.id);
      tr.setAttribute('data-note-target-name', pick.name || '');
      tr.setAttribute('data-note-target-variant', pick.variant || '');
      tr.setAttribute('data-note-target-kind', pick.kind || '');
      tr.setAttribute('data-note-target-by', pick.byText ? 'text' : 'default');
      tr.textContent = FV.targetText(pick);
      var amb = FV.ambiguousText(pick);
      if (amb) tr.title = amb;
      el.note.appendChild(tr);
      if (amb) {
        var ar = document.createElement('div');
        ar.className = 'note-target-alt';
        ar.setAttribute('data-note-target-alt-for', r.id);
        ar.textContent = amb;
        el.note.appendChild(ar);
      }
    }

    // 提案アクション 1 行と [適用]。押す前に「何を、どの図に」が読める。
    var plan = _notePlanOf(r.id);
    if (!plan) return;
    var row = document.createElement('div');
    row.className = 'note-action-row';
    row.setAttribute('data-note-action-for', r.id);
    row.setAttribute('data-note-action', plan.kind);
    row.setAttribute('data-note-action-ready', plan.ready ? '1' : '0');
    var what = document.createElement('span');
    what.className = 'note-action-text';
    what.textContent = plan.text;
    row.appendChild(what);
    var apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'note-apply';
    apply.setAttribute('data-note-apply', r.id);
    apply.textContent = _noteBusy === r.id ? '適用中…' : '適用';
    apply.disabled = !plan.ready || !!_noteBusy;
    apply.title = plan.ready ? plan.text : (plan.reason || '当てられません');
    apply.addEventListener('click', function(ev) {
      ev.stopPropagation();
      applyNoteFinding(r.id);
    });
    row.appendChild(apply);
    el.note.appendChild(row);
  });
}

// ── 覗いた図をテンプレートにする (BLK-junior-20260909-0503-wish) ──
// 読むだけで見た図は、そのまま「テンプレートから新規作成」の材料にできる。
// 覚えて打ち直す工程が無くなるので、写し違いが起きる余地がない。
function _peekSeed() {
  var PF = window.MA.peekFolder;
  return PF ? PF.templateSeed(_peekDir, _peekName, _peekDsl) : null;
}

function renderPeekTemplateBtn() {
  var el = _peekEls();
  var PF = window.MA.peekFolder;
  if (!el.template || !PF) return;
  var seed = _peekSeed();
  el.template.disabled = !seed;
  el.template.setAttribute('data-seed', seed ? seed.value : '');
  el.template.title = PF.seedNotice(seed);
  renderPeekCompareBtn();
}

// ── 覗いた図を手本として右に並べる (BLK-junior-20260909-0603-wish) ──
// 覗く画面は全面のモーダルなので、開いている間は自分の書きかけが見えない。
// 「テンプレートとして開く」は白紙から起こす用で、書きかけの図には使えない
// (今のタブを捨てて新しいタブを作る)。ここは書きかけをそのままに、手本だけを
// 参照図の位置へ据える。据えたあとは既にある見比べ・対応表・整合チェックが
// そのまま手本に効くので、新しい見方を覚え直さなくてよい。
function renderPeekCompareBtn() {
  var el = _peekEls();
  if (!el.compare) return;
  var ok = !!(_peekName && _peekDsl && _peekDsl.replace(/\s/g, ''));
  el.compare.disabled = !ok;
  el.compare.title = ok
    ? _peekName + ' を手本として右に並べます (保存先も今のタブも変わりません)'
    : '図を選ぶと、手本として右に並べられます';
}

function comparePeekAsRef() {
  var cv = window.MA.compareView;
  var PF = window.MA.peekFolder;
  if (!cv || !PF || !_peekName || !_peekDsl) return false;
  var set = cv.setPeek(PF.baseName(_peekDir), _peekName, _peekDsl, '');
  if (!set) return false;
  closePeekFolder();
  _compareRefId = cv.PEEK_ID;
  _compareShownDsl = null;      // 相手が変わったので必ず描き直す
  _clearCheckList();            // 前の参照図に対する食い違いを残さない
  _clearStateMap();
  toggleCompareView(true, 'ref');
  renderCompareView();
  // 手本と自分の図の対応表は、この機能の目的そのもの (どの状態・遷移が
  // 自分の図に無いかを色で出す)。押し直させずにその場で出す。
  runStateMap();
  return true;
}

// 覗いている図をテンプレートに据えて、新規作成の画面へ渡す。
// 保存先も workspace も動かさない (材料として本文を渡すだけ)。
function usePeekAsTemplate() {
  var seed = _peekSeed();
  if (!seed || !_openTemplateNew) return false;
  closePeekFolder();
  _openTemplateNew(false, seed);
  return true;
}

function closePeekFolder() {
  var el = _peekEls();
  if (el.modal) el.modal.style.display = 'none';
  _peekName = null;
  _peekDsl = '';
  // 次に開いたときは読み直す (指摘.md は reviewer が run ごとに書き替える)。
  _noteFile = null;
  _noteRows = [];
  _notePlans = [];
  _noteTargets = {};
  // 対象の印 (_noteHit) は残す。手順 1 は覗いて終わりではなく、続けて自分の
  // 📂一覧から同じ版を開く。閉じた瞬間に印が消えると、また読み比べに戻る。
  renderPeekTemplateBtn();
  setCohortMode(false);
  setSbsMode(false);
  setNoteMode(false);
}

function renderPeekDirs() {
  var el = _peekEls();
  var PF = window.MA.peekFolder;
  if (!el.dirs || !PF) return;
  el.dirs.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-head';
  head.id = 'peek-dirs-head';
  head.textContent = _peekDirs.length ? 'フォルダ' : '隣に読めるフォルダがありません';
  el.dirs.appendChild(head);
  _peekDirs.forEach(function(d) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-dir' + (d.current ? ' current' : '')
      + (PF.samePath(d.path, _peekDir) ? ' selected' : '');
    b.setAttribute('data-dir-name', d.name);
    b.setAttribute('data-current', d.current ? '1' : '0');
    b.textContent = PF.label(d);
    b.addEventListener('click', function() { selectPeekDir(d.path); });
    el.dirs.appendChild(b);
  });
  if (el.notice) el.notice.textContent = PF.noticeText(_peekDir, _wsFileDir());
}

function renderPeekFiles() {
  var el = _peekEls();
  if (!el.files) return;
  el.files.textContent = '';
  var head = document.createElement('div');
  head.className = 'peek-head';
  head.id = 'peek-files-head';
  head.textContent = _peekDir ? (_peekNames.length + ' 枚') : 'フォルダを選んでください';
  el.files.appendChild(head);
  appendPeekKindSummary(el.files);
  appendPeekVerdictOffer(el.files);
  appendPeekSvgSection(el.files);
  appendPeekChangeSection(el.files);
  peekVisibleNames().forEach(function(n) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-file' + (n === _peekName ? ' selected' : '');
    b.setAttribute('data-file-name', n);
    var label = document.createElement('span');
    label.className = 'peek-file-name';
    label.textContent = n;
    b.appendChild(label);
    appendPeekKindBadge(b, n);
    appendPeekSvgBadge(b, n);
    appendPeekChangeBadge(b, n);
    b.addEventListener('click', function() { showPeekFile(n); });
    el.files.appendChild(b);
  });
}

// ── 覗き一覧の図種 (BLK-junior-20260912-2206) ──────────────────────────────
// 自分の 📂 一覧と同じ印を覗き一覧にも出す。junior は先輩のフォルダに
// 「コンポーネント図があるか」を見に行くのに、名前だけの一覧を 30 行読んで
// 語尾から図種を推測していた。0 枚の図種も要約に出すので、
// 「1 枚も無い」が一覧を読まずに決まる。

function _peekEntryFor(name) {
  var n = String(name == null ? '' : name);
  for (var i = 0; i < _peekEntries.length; i++) {
    if (_peekEntries[i] && _peekEntries[i].name === n) return _peekEntries[i];
  }
  return null;
}

// フォルダ全体の図種の内訳。0 枚の図種も「0」で出す
// (「コンポーネント図は 1 枚も無い」と分かることが探しに来た答えになる)。
function appendPeekKindSummary(host) {
  var DK = window.MA.diagramKind;
  if (!DK || !_peekDir || !_peekEntries.length) return;
  var line = document.createElement('div');
  line.className = 'peek-kinds';
  line.id = 'peek-kinds';
  line.textContent = DK.summaryLine(_peekEntries);
  line.title = '覗いているフォルダの図種の内訳。0 の図種はこのフォルダに 1 枚もありません';
  host.appendChild(line);
}

// BLK-junior-20260914-1706-wish: 覗いた相手にその図種が 1 枚も無かったとき、
// 「対応不要（手本なし）」を今開いている自分の図の中に控える。控えないと、この確認は
// 本人の記憶にしか残らず、次に同じ図を担当するたびに 👀他フォルダからやり直しになる。
function appendPeekVerdictOffer(host) {
  var DK = window.MA.diagramKind;
  var PV = window.MA.peekVerdict;
  var PF = window.MA.peekFolder;
  var WS = window.MA.workspace;
  if (!DK || !PV || !WS || !_peekDir || !_peekEntries.length) return;
  var doc = WS.getActive();
  if (!doc) return;
  var counts = DK.counts(_peekEntries);
  var dirName = PF ? PF.baseName(_peekDir) : _peekDir;
  DK.ORDER.forEach(function(slug) {
    var n = counts[slug] || 0;
    var kind = DK.label(slug);
    var had = PV.find(doc.dsl, kind, dirName);
    if (n > 0 && !had) return;      // 取り込む変更があるうちは聞かない
    var row = document.createElement('div');
    row.className = 'peek-verdict-row';
    row.setAttribute('data-peek-verdict', kind);
    var txt = document.createElement('span');
    txt.className = 'peek-verdict-text';
    if (had) {
      var b = PV.badge(had, n);
      txt.className += b.stale ? ' is-stale' : '';
      txt.textContent = b.mark + ' ' + kind;
      txt.title = b.title;
      row.appendChild(txt);
      var off = document.createElement('button');
      off.type = 'button';
      off.className = 'peek-verdict-act';
      off.setAttribute('data-peek-verdict-clear', kind);
      off.textContent = '控えを外す';
      off.title = '確かめ直したので、この控えを ' + doc.name + ' から外します';
      off.addEventListener('click', function(ev) {
        ev.stopPropagation();
        _writePeekVerdict(PV.remove(doc.dsl, kind, dirName));
      });
      row.appendChild(off);
    } else {
      txt.textContent = PV.offerText(kind, dirName, n);
      row.appendChild(txt);
      var on = document.createElement('button');
      on.type = 'button';
      on.className = 'peek-verdict-act';
      on.setAttribute('data-peek-verdict-keep', kind);
      on.textContent = '対応不要として控える';
      on.title = doc.name + ' に「' + dirName + ' に ' + kind + ' は 0 枚」と書き残します';
      on.addEventListener('click', function(ev) {
        ev.stopPropagation();
        _writePeekVerdict(PV.write(doc.dsl, {
          kind: kind, dir: dirName, count: n, at: new Date().toISOString().slice(0, 16),
        }));
      });
      row.appendChild(on);
    }
    host.appendChild(row);
  });
}

// 控えは自分の図の本文なので、書いたらそのまま保存の道に乗せる。
function _writePeekVerdict(nextDsl) {
  var ed = document.getElementById('editor');
  if (ed) { ed.value = nextDsl; ed.dispatchEvent(new Event('input')); }
  else if (window.MA.workspace) window.MA.workspace.updateActive({ dsl: nextDsl });
  if (window.MA.toast) window.MA.toast.show('確認の結論をこの図に控えました');
  try { renderPeekFiles(); } catch (e) {}
}

// 行の図種の印。保存した図種の控えがあればそれを、無ければ本文からの判定を出す
// (📂 一覧の folderKindBadge と同じ決め方)。
function appendPeekKindBadge(host, name) {
  var PF = window.MA.peekFolder;
  var badge = PF ? PF.kindBadge(_peekEntryFor(name)) : null;
  if (!badge) return;
  var span = document.createElement('span');
  span.className = 'peek-kind';
  span.setAttribute('data-kind-of', name);
  span.setAttribute('data-kind-source', badge.source);
  span.setAttribute('data-kind', badge.slug);
  span.textContent = badge.text;
  span.title = badge.title;
  host.appendChild(span);
}

// 行の印。判定は svg-freshness、見せ方は peek-freshness に置く。
function appendPeekSvgBadge(host, name) {
  var PFR = window.MA.peekFreshness;
  if (!PFR || !_peekScan) return;
  var badge = PFR.rowBadge(_peekScan, name);
  if (!badge) return;
  var span = document.createElement('span');
  span.className = 'peek-svg-badge' + (badge.alert ? ' alert' : '');
  span.setAttribute('data-svg-content', badge.content);
  span.textContent = badge.mark;
  span.title = badge.title;
  host.appendChild(span);
}

// 一覧の見出しの下に、フォルダ全体の 1 行と「中身を確かめる」ボタンを出す。
function appendPeekSvgSection(host) {
  var PFR = window.MA.peekFreshness;
  if (!PFR || !_peekScan || !_peekScan.rows.length) return;
  var sum = document.createElement('div');
  sum.className = 'peek-svg-summary' + (PFR.hasIssue(_peekScan) ? ' has-issue' : '');
  sum.id = 'peek-svg-summary';
  sum.textContent = PFR.summary(_peekScan);
  host.appendChild(sum);
  var targets = PFR.verifyTargets(_peekScan);
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'peek-svg-verify';
  btn.id = 'peek-svg-verify';
  btn.textContent = _peekVerifying ? '確かめています…' : PFR.verifyLabel(_peekScan);
  btn.title = PFR.verifyTitle();
  btn.disabled = _peekVerifying || !targets.length;
  btn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    verifyPeekSvg();
  });
  host.appendChild(btn);
}

// ── 前回保存からの差分 (BLK-junior-20260914-1306-wish) ─────────────────────
// 先輩の図を自分の図に取り込む場面では、要るのは「どの図が変わったか」と
// 「何が増えて何が消えたか」だけ。今までは複合図 (driver_common_class 等) を
// 丸ごと開いて目で差分を探し、変わっていない図まで開いて見比べていた。

// 一覧に並べる名前。判定があれば「変更のある図が上」の順に、絞り込み中なら
// 変更のある図だけに。判定が無ければ受け取った順のまま (印の無い一覧を並べ替えない)。
function peekVisibleNames() {
  var PC = window.MA.peekChanges;
  var names = PC ? PC.visibleNames(_peekChanges, _peekChangedOnly) : null;
  return names || _peekNames;
}

// 行の印。「＋2」だけでなく内訳を title に置く (部品が増えたのか、つなぎ方が
// 変わったのかで、取り込む側の手の動かし方が変わる)。
function appendPeekChangeBadge(host, name) {
  var PC = window.MA.peekChanges;
  if (!PC || !_peekChanges) return;
  var badge = PC.rowBadge(PC.find(_peekChanges, name));
  if (!badge) return;
  var span = document.createElement('span');
  span.className = 'peek-change-badge' + (badge.changed ? ' changed' : '');
  span.setAttribute('data-change-of', name);
  span.setAttribute('data-change', badge.verdict);
  span.textContent = badge.text;
  span.title = badge.title;
  host.appendChild(span);
}

// 見出しの下の 1 行と、「変更のある図だけ」の絞り込み。
function appendPeekChangeSection(host) {
  var PC = window.MA.peekChanges;
  if (!PC || !_peekChanges || !_peekChanges.total) return;
  var sum = document.createElement('div');
  sum.className = 'peek-change-summary' + (PC.hasChanges(_peekChanges) ? ' has-changes' : '');
  sum.id = 'peek-change-summary';
  sum.textContent = PC.summary(_peekChanges);
  host.appendChild(sum);
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'peek-change-filter' + (_peekChangedOnly ? ' on' : '');
  btn.id = 'peek-change-filter';
  btn.textContent = PC.filterLabel(_peekChanges, _peekChangedOnly);
  btn.title = '前回保存から部品・関係が変わった図だけを一覧に残します';
  btn.disabled = !PC.hasChanges(_peekChanges);
  btn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    _peekChangedOnly = !_peekChangedOnly;
    renderPeekFiles();
  });
  host.appendChild(btn);
}

// 開いた 1 枚の内訳。本文 (peek-dsl) を上から読まずに、写す先が決まるようにする。
function renderPeekChangeDetail(name) {
  var el = _peekEls();
  var PC = window.MA.peekChanges;
  if (!el.changes) return;
  el.changes.textContent = '';
  var row = (PC && _peekChanges) ? PC.find(_peekChanges, name) : null;
  if (!row) { el.changes.style.display = 'none'; return; }
  el.changes.style.display = '';
  var notice = document.createElement('div');
  notice.className = 'peek-change-notice';
  notice.id = 'peek-change-notice';
  notice.textContent = PC.detailNotice(row);
  el.changes.appendChild(notice);
  PC.detailLines(row).forEach(function(d) {
    var line = document.createElement('div');
    line.className = 'peek-change-line' + (d.sign === '+' ? ' add' : ' del');
    line.setAttribute('data-change-sign', d.sign);
    line.textContent = d.sign + ' ' + d.line + ': ' + d.text;
    el.changes.appendChild(line);
  });
}

// 覗いているフォルダの判定材料を読み直す。名前の一覧とは別の呼び出しにしない
// (印の付く前の一覧が一瞬出ると、確かめてある図まで疑わせる)。
function loadPeekScan(dir) {
  var WS = window.MA.workspace;
  var PFR = window.MA.peekFreshness;
  if (!WS || !PFR || !WS.listFolder) return Promise.resolve(null);
  return WS.listFolder(dir).then(function(folder) {
    if (!window.MA.peekFolder.samePath(dir, _peekDir)) return null;   // 途中で選び直された
    _peekScan = PFR.scan(folder);
    return _peekScan;
  }).catch(function() { return null; });
}

// 上書きせずに 1 枚ずつ描き直して比べる。覗いているのは他人のフォルダなので、
// ここから作り直し (書き戻し) は決してしない。
function verifyPeekSvg() {
  var PFR = window.MA.peekFreshness;
  var dir = _peekDir;
  var targets = PFR ? PFR.verifyTargets(_peekScan) : [];
  if (!targets.length || _peekVerifying || !dir) return Promise.resolve(false);
  _peekVerifying = true;
  renderPeekFiles();
  return fetch('/verify-svg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir: dir, types: targets, mode: 'local' }),
  }).then(function(r) { return r.ok; }).catch(function() { return false; })
    .then(function(ok) {
      _peekVerifying = false;
      if (!window.MA.peekFolder.samePath(dir, _peekDir)) return false;
      return loadPeekScan(dir).then(function() { renderPeekFiles(); return ok; });
    });
}

function selectPeekDir(dir) {
  var WS = window.MA.workspace;
  if (!WS) return Promise.resolve(false);
  _peekDir = dir;
  _peekName = null;
  _peekNames = [];
  _peekEntries = [];
  _peekScan = null;
  _peekChanges = null;
  _peekChangedOnly = false;
  renderPeekDirs();
  renderPeekFiles();
  // 名前と判定を同時に取る。判定を後追いにすると、印の無い一覧が先に出て
  // 「確かめた結果うまくいっている」と読み違える余地ができる。
  // 図種は名前と同じ一覧応答に載っている (listFolder)。別呼び出しにすると
  // 印の無い一覧が先に出て、そこで「無い」と読み違える余地ができる。
  // 前回保存との差分も同じ一覧応答で受け取る (prev)。1 枚ずつ版を取りに行くと
  // 図の枚数だけ往復が増え、印の付く前の一覧が先に出る。
  return Promise.all([WS.listFolder(dir, { prev: true }), loadPeekScan(dir)]).then(function(got) {
    var info = got[0] || {};
    var entries = (info.entries || []).filter(function(e) { return e && e.name; });
    if (!window.MA.peekFolder.samePath(dir, _peekDir)) return false;   // 途中で選び直された
    _peekEntries = entries;
    _peekNames = entries.map(function(e) { return e.name; });
    _peekChanges = window.MA.peekChanges ? window.MA.peekChanges.report(entries) : null;
    renderPeekFiles();
    // 1 枚目をそのまま出す。選んだ後に「どれか押す」を挟むと、読むだけの用でも
    // クリックが 1 つ増える。変更のある図が上に来ているので、取り込む 1 枚目が最初に開く。
    var first = peekVisibleNames()[0];
    if (first) showPeekFile(first);
    return true;
  }).catch(function() { return false; });
}

// 読むだけ。ここで開いた図は workspace に入らないので、保存の対象にならない。
function showPeekFile(name) {
  var el = _peekEls();
  var WS = window.MA.workspace;
  if (!WS || !el.svg) return Promise.resolve(false);
  _peekName = name;
  _peekDsl = '';
  _partSel = '';
  renderPartChips();
  renderPeekFiles();
  renderPeekTemplateBtn();
  renderPeekChangeDetail(name);
  if (el.title) el.title.textContent = name + '（読むだけ・編集も保存もしません）';
  el.svg.style.display = '';
  el.svg.textContent = '';
  if (el.dsl) el.dsl.textContent = '読み込み中…';
  var dir = _peekDir;
  return WS.loadFile(name, dir).then(function(text) {
    if (name !== _peekName) return false;
    if (typeof text !== 'string') {
      if (el.dsl) el.dsl.textContent = '読めませんでした';
      return false;
    }
    if (el.dsl) el.dsl.textContent = text;
    _peekDsl = text;
    renderPeekTemplateBtn();
    // 開いた図が複合図なら、部品で切り出す入口をその場に出す。
    _partSel = '';
    renderPartChips();
    return renderDslToSvg(text).then(function(svg) {
      if (name !== _peekName) return false;
      el.svg.innerHTML = svg;
      return true;
    }).catch(function() {
      // 図が出せなくても本文は出す。読むこと自体は止めない。
      el.svg.textContent = '図の描画に失敗しました (本文は下に出ています)';
      return false;
    });
  });
}

function stepPeekFile(delta) {
  // ↑↓ は一覧に見えている順で送る (絞り込み中に、隠れている図へ飛ばさない)。
  var next = window.MA.peekFolder.step(peekVisibleNames(), _peekName, delta);
  if (next) showPeekFile(next);
}

// 覗ける行き先の一覧。覗く画面を開かないまま指摘.md を読む画面 (📂一覧) のために、
// 一度だけ取りに行く (BLK-junior-20260914-1206-wish)。
function _ensurePeekDirs() {
  var PF = window.MA.peekFolder;
  if (_peekDirs && _peekDirs.length) return Promise.resolve(true);
  if (!PF || !window.fetch) return Promise.resolve(false);
  return fetch('/peek-dirs?dir=' + encodeURIComponent(_wsFileDir()))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data) _peekDirs = PF.choices(data);
      return true;
    }).catch(function() { return false; });
}

function openPeekFolder() {
  var el = _peekEls();
  var PF = window.MA.peekFolder;
  if (!el.modal || !PF) return Promise.resolve(false);
  el.modal.style.display = 'flex';
  var dir = _wsFileDir();
  return fetch('/peek-dirs?dir=' + encodeURIComponent(dir))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      _peekDirs = PF.choices(data);
      renderPeekDirs();
      // 用があるのは他人のフォルダなので、隣が 1 つだけならそれを開いておく
      // (「読むだけ」の入口で自分のフォルダを選び直させない)。
      var others = PF.others(_peekDirs);
      if (others.length === 1) return selectPeekDir(others[0].path);
      renderPeekFiles();
      return true;
    }).catch(function() {
      _peekDirs = [];
      renderPeekDirs();
      return false;
    });
}

function setupPeekFolder() {
  var btn = document.getElementById('btn-tab-peek');
  var el = _peekEls();
  if (!btn || !el.modal) return;
  btn.addEventListener('click', function() { openPeekFolder(); });
  var close = closePeekFolder;
  renderPeekTemplateBtn();
  if (el.template) el.template.addEventListener('click', usePeekAsTemplate);
  if (el.compare) el.compare.addEventListener('click', comparePeekAsRef);
  var closeBtn = document.getElementById('peek-close');
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (el.cohortToggle) {
    el.cohortToggle.addEventListener('click', function() { setCohortMode(!_cohortOn); });
  }
  if (el.sbsToggle) {
    el.sbsToggle.addEventListener('click', function() { setSbsMode(!_sbsOn); });
  }
  var findPart = document.getElementById('peek-find-part');
  if (findPart) findPart.addEventListener('click', function() { findPeekPartHome(); });
  var noteToggle = document.getElementById('peek-note-toggle');
  if (noteToggle) noteToggle.addEventListener('click', function() { setNoteMode(!_noteOn); });
  if (el.cohortTemplates) {
    el.cohortTemplates.addEventListener('click', function() {
      setCohortTemplates(!_cohortShowTemplates);
    });
    _syncCohortTemplateBtn();
  }
  el.modal.addEventListener('click', function(ev) { if (ev.target === el.modal) close(); });
  var prev = document.getElementById('peek-prev');
  var next = document.getElementById('peek-next');
  if (prev) prev.addEventListener('click', function() { stepPeekFile(-1); });
  if (next) next.addEventListener('click', function() { stepPeekFile(1); });
  document.addEventListener('keydown', function(ev) {
    if (el.modal.style.display !== 'flex') return;
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); stepPeekFile(1); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); stepPeekFile(-1); }
  });
}

function setupTabs() {
  if (!window.MA.workspace) return;
  renderTabs();

  var btnNew = document.getElementById('btn-tab-new');
  if (btnNew) {
    btnNew.addEventListener('click', function() {
      saveActiveDoc();
      // BLK-junior-20260909-0703: 新規タブは白紙で作る。手本を持っている人には
      // 雛形のサンプル (Class なら User / IAuth) は打ち始める前に全消去する
      // 一手間にしかならない。見本が要る人には無選択時の右ペインに
      // 「まとめて追加」「白紙から: ひな形」があり、そちらから入れられる。
      var BD = window.MA.blankDoc;
      window.MA.workspace.open({
        name: 'diagram' + (window.MA.workspace.count() + 1),
        diagramType: currentDiagramType,
        dsl: BD ? BD.blankDsl(currentDiagramType) : '@startuml\n@enduml',
      });
      applyActiveDoc();
      // 新規タブも作った時点でフォルダに現れる (BLK-primary-20260907-0823)。
      saveActiveDoc();
    });
  }

  var panel = document.getElementById('folder-panel');
  var btnFolder = document.getElementById('btn-tab-folder');
  if (!panel || !btnFolder) return;

  function closePanel() { panel.classList.remove('open'); }

  // BLK-primary-20260907-1703: 一覧に印を付けて、まとめてタブで開く。
  // 印はパネルを開いている間だけ持つ (次に開いたときは白紙から選ぶ)。
  var folderPicked = [];
  var folderNames = [];
  // BLK-junior-20260908-1103: 名前での絞り込み。一覧は 20 枚超の行が縦に並び、
  // 行ごとに印・役割・差分のボタンが付くので、目的の 1 枚を一発で押し分けにくい。
  var folderQuery = '';
  var folderFocusFilter = false;   // 一覧を開いた直後だけ絞り込み欄にカーソルを置く
  // BLK-reviewer-20260907-1803-wish: 図名 → new/changed/unchanged。
  // 「変更のある図だけ選ぶ」と行ごとの [差分] がここを見る。
  var folderStatus = {};
  // BLK-junior-20260907-2009-wish: 一時控えの印が付いた図名。畳んでいる間は
  // folderNames に入れない (「全部選ぶ」や「変更図だけ選ぶ」が控えを掴まない)。
  var draftNames = [];
  // BLK-primary-20260908-1703: 「揃っているべき一式」として登録した図名と、
  // 今の一覧との突合結果。手順 1 の「14 枚あるか」を目で数えずに済ませる。
  var targetNames = [];
  var targetScan = null;
  // BLK-junior-20260908-2003-wish: 棚卸しで見ている部品。null は「まだ選んでいない」で、
  // このときだけ今開いている図の部品を自動で選ぶ。'' は「選択を外した」であり、
  // 自動選択で埋め直さない (外したのに別の部品が出ると、見ている棚卸しを取り違える)。
  var _invPick = null;
  // BLK-junior-20260908-2003: 図名 → 上書き前に控えてある版の数と、本体がもう
  // 無いのに版だけ残っている図。server が一覧と同じ呼び出しで返す。
  var versionCounts = {};
  var goneVersions = [];
  // BLK-junior-20260908-2003: 図名 → 図種。「自分の状態遷移図が無い」を、
  // 22 枚を 1 枚ずつ開いて確かめるのではなく一覧の時点で言うため。
  var kindByName = {};
  var kindEntries = [];
  // BLK-junior-20260914-1206-wish: 指摘.md を一覧の側から読んだ結果。
  // noteBoard は「どの図をどの指摘が指しているか」、noteBoardStatus はその 1 枚の判定。
  // 本文は対象の図だけ取り寄せる (対象外と言うために全部読むのでは往復が画面に移るだけ)。
  var noteBoard = null;
  var noteBoardStatus = {};
  var noteBoardHasFile = false;
  var noteBoardReady = false;
  var noteBoardDir = '';
  var noteBoardBusy = false;
  var noteBoardSig = null;
  // BLK-junior-20260912-2103-wish: 図名 → 保存したときの図種 (server の _kinds.json)。
  // 本文からの判定 (kindByName) と違い、保存した側が知っている図種なので、
  // 「別図種と紛らわしい書き方」をしていても開くときに図種が入れ替わらない。
  var savedKindByName = {};
  var savedKindsLoaded = false;
  // BLK-reviewer-20260908-0103: 図名 → SVG が puml に追いついているか。
  // `ls -l` で puml と svg を 1 枚ずつ突き合わせる代わりに、一覧が答える。
  var svgStatus = {};
  var svgContent = {};
  // 図名 → その内容判定の根拠 ('stamp' / 'rerender')。何を見た答えかを印にも書く。
  var svgBasis = {};
  // 図名 → 行に並べる 3 つの値 (puml 変更 / SVG 書き出し / labels 一致) と印の有無。
  var svgCompare = {};
  // BLK-reviewer-20260914-0906-wish: {name}.svg に刻まれた元 puml の sha1 が、
  // 同じフォルダの別の図のものだったとき、その相手を名指しするための判定。
  var svgCross = null;
  // BLK-reviewer-20260914-1106-wish: 部品 (クラス) ごとに図を束ねた突合の結果。
  var partCross = null;
  // 図名 → SVG の書き出し時刻 (ISO8601)。puml の保存時刻と並べて行に出す。
  var svgMtimes = {};
  var svgScan = null;
  // 作り直した結果の 1 行。一覧を開き直すまで残す (押した結果が消えない)。
  var svgRenderNote = '';
  // BLK-reviewer-20260908-1103-wish: 描き直して比べた結果の 1 行。
  var svgVerifyNote = '';
  // BLK-reviewer-20260908-1203-wish: 食い違った図の中身。図名 → svgDiffSummary.compare の結果。
  // 「ずれ」と分かった直後に材料が手に入るので、その場で持っておく
  // (もう一度描き直さないと中身が言えない、では手順が 1 つ増える)。
  var svgVerifyDiffs = {};
  // BLK-reviewer-20260908-0203-wish: 図名 → {role, status}。実データ / テンプレの宣言と、
  // テンプレの中身が宣言時から変わっていないか。22 枚を毎回同列に扱わなくて済むように。
  var fileRoles = {};        // 保存フォルダの _roles.json の中身
  var roleStatus = {};       // 一覧に配る早見表
  var roleScan = null;
  var roleEntries = [];      // 役割を決めた瞬間の指紋を取るための一覧
  var roleNote = '';
  // BLK-junior-20260908-0630-wish: 図名 → 指摘の反映状態 (未反映 / 反映済み)。
  // 「元図」と「元図(レビュー反映)」を別名で並べる代わりに、1 枚のバッジで見分ける。
  var reviewStatus = {};
  // BLK-reviewer-20260908-0923-wish: 図名 → 直近 N 分以内に更新されたか。
  // 他のペルソナが同じ tick の中で書き込み続けている図を、読む前に見分ける。
  var writeStatus = {};
  var writeAge = {};
  var writeScan = null;
  // BLK-primary-20260914-1306-wish: 中身が byte 単位で同じ図の束。
  // 「-編集中」が本体と同一のまま積み上がっても、一覧には開く・名前を変えるしか
  // 無かったので、片付けるには保存フォルダを直接触るしかなかった。
  var dupeGroups = [];
  // 行の 🗑 を 1 回押した名前 (2 回目で消す)。描き直すと白紙に戻る。
  var deleteArmed = '';

  // BLK-junior-20260912-2103-wish: フォルダから開くときの図種。
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
    // BLK-junior-20260907-1803: これから読み直す図を先に書き戻すと、保存の確認に
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

  openFromFolderByName = function(name) { openFromFolder(name); };
  refreshFolderPanelNow = function() { if (panel.classList.contains('open')) renderFolderPanel(); };

  // BLK-junior-20260907-1803: 開いているタブと同じ名前を一覧から押したときに
  // 画面が何も動かないと、「保存できている」のか「一覧が効いていない」のかが
  // 分からない。同じ名前なら (1) 編集中の本文をそのファイルへ書き戻さずに読み、
  // (2) 読んだ結果を必ず言葉で返す。書き戻してから読むと、保存の確認そのものが
  // 成り立たない (いつ押しても必ず一致する)。
  function openFromFolder(name) {
    closePanel();
    var dir = _wsFileDir();
    var active = window.MA.workspace.getActive();
    var sameTab = !!(active && active.name === name);
    if (!sameTab) saveActiveDoc();
    _ensureSavedKinds(dir).then(function() {
    window.MA.workspace.loadFile(name, dir).then(function(text) {
      var FR = window.MA.folderReopen;
      var before = mmdText;
      var info = FR
        ? FR.describe(name, text, before, sameTab)
        : { kind: text == null ? 'missing' : 'opened', changed: text != null, message: '' };
      if (text != null) {
        openExistingFile({
          name: name,
          dsl: text,
          diagramType: _folderOpenType(name, text),
        });
        applyActiveDoc();
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

  // BLK-junior-20260907-2009-wish: 上部バーの「🗂 一時控え」。
  var btnDraft = document.getElementById('btn-tab-draft');
  if (btnDraft) {
    btnDraft.addEventListener('click', function() {
      toggleActiveDraft();
      if (panel.classList.contains('open')) renderFolderPanel();
    });
    syncDraftButton();
  }

  btnFolder.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    // BLK-junior-20260907-1803: 一覧を開くだけでは保存フォルダへ書き出さない。
    // ここで書き出すと、保存できたかを一覧から確かめようとするたびに編集中の本文で
    // ファイルが上書きされ、「開き直したら必ず一致する」ので確認にならなかった。
    // タブの控え (workspace) だけ今の本文にそろえる。
    if (window.MA.workspace) {
      window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType });
    }
    svgRenderNote = '';   // 前に押した結果は持ち越さない
    svgVerifyNote = '';
    svgVerifyDiffs = {};
    roleNote = '';
    folderQuery = '';           // 絞り込みは開き直すたびに白紙に戻す
    folderFocusFilter = true;   // 開いたらそのまま名前を打ち始められる
    panel.textContent = '';
    var loading = document.createElement('div');
    loading.className = 'folder-empty';
    loading.textContent = '読み込み中…';
    panel.appendChild(loading);
    panel.classList.add('open');
    var rect = btnFolder.getBoundingClientRect();
    panel.style.left = rect.left + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    renderFolderPanel();
  });

  // BLK-reviewer-20260907-1403: 図ごとに「前回見た版から変わったか」を出す。
  // 変更が無い日に 17 枚を全部読み直さなくても、バッジの付いた図だけ読めばよくなる。
  // 提出物庫への入口。棚卸しの判定も庫を見るので、一覧を描く前に 1 回読む
  // (BLK-junior-20260908-2203-wish)。読めたら描き直す。
  function appendVaultEntry(host) {
    var V = window.MA.vault;
    if (!V) return;
    var bar = document.createElement('div');
    bar.className = 'folder-vault-bar';
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'btn-vault';
    b.className = 'folder-vault-open';
    b.textContent = '🔒 提出物庫';
    b.title = '画像を書き出した時点の図が積んである庫。あとの周が同じ名前で上書きしても消えません';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      closePanel();
      toggleVault(true);
    });
    bar.appendChild(b);
    var state = document.createElement('span');
    state.className = 'folder-vault-state';
    state.id = 'folder-vault-state';
    state.textContent = V.summaryText(_vaultRows, '');
    bar.appendChild(state);
    // 変更チケットへの入口 (BLK-primary-20260909-0603-wish)。仕様変更の続きは
    // 「どの図を開くか」から始まるので、フォルダ一覧と同じ場所に置く。
    if (window.MA.changeTicket) {
      var ct = document.createElement('button');
      ct.type = 'button';
      ct.id = 'btn-change-ticket';
      ct.className = 'folder-vault-open';
      ct.textContent = '🎫 変更チケット';
      ct.title = '仕様変更で直す図の一覧と「直した」印。前回の続きから直せます';
      ct.addEventListener('click', function(ev) {
        ev.stopPropagation();
        closePanel();
        toggleTicketBoard(true);
      });
      bar.appendChild(ct);
      var ctState = document.createElement('span');
      ctState.className = 'folder-vault-state';
      ctState.id = 'folder-ticket-state';
      ctState.textContent = window.MA.changeTicket.listText(_ctRows);
      bar.appendChild(ctState);
    }
    host.appendChild(bar);
  }

  function renderFolderPanel() {
    var dir = _wsFileDir();
    // 庫をまだ読んでいなければ読んでから描き直す。棚卸しの「あり / なし」が
    // 庫を見ずに出ると、提出済みの図種が一瞬「なし」で出る。
    if (_fiFolderMode() && _vaultDir !== dir && !_vaultLoading) {
      loadVault().then(function() { renderFolderPanel(); });
    }
    // 札の残り本数も同じ理由で先に読む (未完の変更があることに気づける)。
    if (_fiFolderMode() && _ctDir !== dir && !_ctLoading) {
      loadTickets().then(function() { renderFolderPanel(); });
    }
    var RW = window.MA.reviewWatch;
    var store = _reviewStore();
    window.MA.workspace.listFolder(dir).then(function(res) {
      var entries = (res && res.entries) || [];
      panel.textContent = '';
      // BLK-primary-20260908-0103: 保存先の綴りを 1 文字誤っただけでも一覧は
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
        how.textContent = '⚙設定 → 自動保存 → 保存先ディレクトリを確かめてください'
          + '(区切りは / が安全です)。渡された値があれば 🕸 参照関係 →「保存先を貼る」で入れられます。';
        panel.appendChild(how);
        return;
      }
      if (entries.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.textContent = '保存フォルダに図がありません';
        panel.appendChild(empty);
        // 作業ファイルが 1 枚も無くても提出物庫には残っている。ここで黙ると、
        // 「前の周の図が消えた」に見えるのが BLK-junior-20260908-2203-wish の詰まり。
        appendVaultEntry(panel);
        appendInventorySection(panel);
        return;
      }
      // 実データ / テンプレの宣言は保存フォルダに置いてある (GUI の設定ではない)。
      var FR = window.MA.fileRole;
      roleEntries = entries;
      if (FR) {
        var storedRoles = (res && res.roles) || {};
        fileRoles = FR.keepExisting(storedRoles, entries);
        // 消えた図の宣言は画面から外すだけでなく保存フォルダからも落とす。残しておくと、
        // 同じ名前で作り直した別物が前の baseline と比べられ、汚染として赤くなる。
        if (Object.keys(FR.parse(storedRoles)).length !== Object.keys(fileRoles).length) {
          saveFileRoles(dir, fileRoles);
        }
        roleScan = FR.scan(entries, fileRoles);
        roleStatus = FR.statusMap(roleScan);
      } else {
        fileRoles = {}; roleScan = null; roleStatus = {};
      }

      // SVG の追いつきは、図の中身とは別に一覧の時点で分かる。
      var SF = window.MA.svgFreshness;
      // BLK-reviewer-20260908-1103-wish: 印の無い svg でも、上書きせずに描き直して
      // 比べた控えがあれば内容で言い切れる。server が一覧と一緒に返す。
      svgScan = SF ? SF.scan(entries, (res && res.verified) || {}) : null;
      // 突合ダッシュボードの「出力物」はここで読んだ結果を使う (一覧を開くまでは見ていない)。
      _abSvgScan = svgScan;
      svgStatus = SF ? SF.statusMap(svgScan) : {};
      // BLK-reviewer-20260908-1103: mtime とは別に、内容 (svg に刻んだ元 puml の sha1) での判定。
      svgContent = SF && SF.contentMap ? SF.contentMap(svgScan) : {};
      svgBasis = SF && SF.basisMap ? SF.basisMap(svgScan) : {};
      // BLK-reviewer-20260908-2003-wish: 行に「puml 変更 / SVG 書き出し / labels 一致」を
      // 並べ、印を持たない図に「未刻印」を出すための 1 行ぶんの値。
      var SCR = window.MA.svgCompareRow;
      svgCompare = SCR ? SCR.map(entries, (res && res.verified) || {}) : {};
      // BLK-reviewer-20260914-0906-wish: 「今の puml の絵ではない」の先の
      // 「では どの図の絵なのか」。印を同じフォルダの他の図の sha1 と突き合わせる。
      var SX = window.MA.svgCross;
      svgCross = SX ? SX.scan(entries) : null;
      _svgCrossLatest = svgCross;
      // BLK-reviewer-20260914-1106-wish: 同じ部品を持つ状態遷移図・シーケンス図・
      // クラス図を束ね、遷移ラベル / メッセージ名がクラスのメソッドに無ければ
      // 名指しする。判定は method-audit と同じ規則で、見る範囲だけが
      // 「開いている図」から「保存フォルダの全部」に広がる。
      var PC = window.MA.partCross;
      partCross = PC ? PC.scan(entries) : null;
      // BLK-reviewer-20260908-2003-wish: puml の保存時刻と SVG の書き出し時刻を
      // 同じ行に並べる。片方しか出ていない間は「いつ書き出した SVG か」を
      // ls -l で見に行くことになっていた。
      svgMtimes = SF && SF.svgMtimeMap ? SF.svgMtimeMap(svgScan) : {};

      // 指摘の反映状態は server が一覧と一緒に返す pins から作る。図を開かなくても
      // 一覧の時点で「未反映が残っている図」が分かる (別名保存を続けなくてよい)。
      var RS = window.MA.reviewState;
      reviewStatus = RS ? RS.statusMap(entries) : {};

      // BLK-primary-20260914-1306-wish: 束ねる判定は一覧が既に持っている hash だけで
      // 済む (本文を取り直さないので、一覧を開いた時点で言い切れる)。
      var DPM = window.MA.dupeMerge;
      dupeGroups = DPM ? DPM.scan(entries) : [];

      // 「今読んでいる版が、読み始めた瞬間のものか」は中身では分からない。
      // server が返した「今」と各図の更新時刻の差だけで判定する。
      // BLK-junior-20260908-2003: 上書きで消えた中身の控え。一覧の時点で
      // 「この図には前の版がある」「本体は消えたが版は残っている」を出す。
      versionCounts = {};
      entries.forEach(function(e) {
        if (e && e.name && typeof e.versions === 'number') versionCounts[e.name] = e.versions;
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

      // BLK-junior-20260914-1206-wish: 指摘の判定は図の本文から出しているので、
      // 図が 1 枚でも書き換われば取り直す。一覧は描くたびに読み直されるので、
      // 「読み直した」ではなく「中身が変わった」で取り直す (毎回だと描画が回り続ける)。
      var noteSig = entries.map(function(e) {
        return (e && e.name) + '@' + ((e && e.mtime) || '');
      }).join('|');
      if (noteSig !== noteBoardSig) {
        noteBoardSig = noteSig;
        noteBoardReady = false;
      }

      var WA = window.MA.writeActivity;
      writeScan = WA ? WA.scan(entries, res && res.now) : null;
      writeStatus = WA ? WA.statusMap(writeScan) : {};
      writeAge = WA ? WA.ageMap(writeScan) : {};

      // 消えた図の一時控えの印は捨てる (印だけが残り続けないようにする)。
      var DM = window.MA.draftMark;
      draftNames = DM ? DM.keepExisting(DM.load(store, dir), entries) : [];
      if (DM) DM.save(store, dir, draftNames);

      // 対象 set は「今そこにあるもの」ではなく利用者が決めた期待値なので、
      // 消えた図の名前を落とさない (落とすと「足りない」が言えなくなる)。
      var TS = window.MA.targetSet;
      targetNames = TS ? TS.load(store, dir) : [];
      targetScan = TS ? TS.reconcile(targetNames, entries) : null;

      if (!RW) {
        var plain = DM ? DM.split(entries, draftNames) : { items: entries, drafts: [] };
        setFolderNames(plain);
        folderStatus = {};
        panel.appendChild(folderFilterBar());
        panel.appendChild(folderPickBar());
        appendTargetSection(panel, dir);
        appendVaultEntry(panel);
        appendInventorySection(panel);
        appendReviewSection(panel);
        appendNoteSection(panel, dir);
        appendRoleSection(panel, dir);
        appendSvgSection(panel, dir);
      appendPartCrossSection(panel);
        appendWriteSection(panel, dir);
        appendSaveVerifySection(panel, dir);
        appendDupeSection(panel, dir);
        appendKindSummary(panel);
        plain.items.forEach(function(e) { panel.appendChild(folderRow(e.name || e, null, null)); });
        appendDraftSection(plain.drafts, function(e) { return folderRow(e.name || e, null, null); });
        appendGoneVersionsSection(panel);
        syncFolderPickUi();
        applyFolderFilter();
        focusFolderFilter();
        return;
      }
      var seen = RW.load(store, dir);
      var first = !RW.hasSeen(store, dir);
      var rows = RW.diff(seen, entries);
      // 一時控えは成果物とは別扱い。読む枚数の要約も成果物だけで数える
      // (畳んだ控えの「変更 3 枚」を出すと、読むものが増えたように見える)。
      var sp = DM ? DM.split(rows, draftNames) : { items: rows, drafts: [] };
      setFolderNames(sp);

      var head = document.createElement('div');
      head.className = 'folder-summary';
      head.textContent = first ? '前回見た版の控えがありません（全部を新規として出しています）' : RW.summary(sp.items);
      panel.appendChild(head);
      panel.appendChild(folderFilterBar());
      panel.appendChild(folderPickBar());
      appendTargetSection(panel, dir);
      appendVaultEntry(panel);
      appendInventorySection(panel);
      appendReviewSection(panel);
      appendNoteSection(panel, dir);
      appendRoleSection(panel, dir);
      appendSvgSection(panel, dir);
      appendPartCrossSection(panel);
      appendWriteSection(panel, dir);
      appendSaveVerifySection(panel, dir);
      appendDupeSection(panel, dir);

      folderStatus = {};
      rows.forEach(function(r) { folderStatus[r.name] = r.status; });
      syncFolderPickUi();
      function rowOf(r) {
        return folderRow(r.name, RW.badge(r.status), RW.formatMtime(r.mtime), r.status);
      }
      appendKindSummary(panel);
      sp.items.forEach(function(r) { panel.appendChild(rowOf(r)); });
      appendDraftSection(sp.drafts, rowOf);
      appendGoneVersionsSection(panel);

      RW.removed(seen, entries).forEach(function(name) {
        var gone = document.createElement('div');
        gone.className = 'folder-empty folder-gone';
        gone.setAttribute('data-file-name', name);
        gone.textContent = '— ' + name + '（前回はあった図が今はありません）';
        panel.appendChild(gone);
      });

      var mark = document.createElement('button');
      mark.className = 'folder-mark-seen';
      mark.setAttribute('type', 'button');
      mark.textContent = 'ここまで見たことにする';
      mark.title = '今の一覧を「前回見た版」として控える。次に開いたときは、これ以降に変わった図だけにバッジが付く';
      mark.addEventListener('click', function(ev) {
        ev.stopPropagation();
        RW.save(store, dir, RW.snapshot(entries));
        // 指紋だけでなく本文も控える。次に開いたとき、変更図の旧DSL を
        // 取り直さずに並べて出せる (BLK-reviewer-20260907-1803-wish)。
        mark.disabled = true;
        mark.textContent = '控えを取っています…';
        saveSeenBodies(dir, folderNames).then(function() { renderFolderPanel(); },
                                              function() { renderFolderPanel(); });
      });
      panel.appendChild(mark);
      appendCarrySection(dir, sp.items);
      syncFolderPickUi();
      applyFolderFilter();
      focusFolderFilter();
    });
  }

  // 一覧を開いた直後だけ絞り込み欄にカーソルを置く。行のボタンを押しての
  // 再描画では奇うことをしない (押した場所から手が飛ばない)。
  function focusFolderFilter() {
    if (!folderFocusFilter) return;
    folderFocusFilter = false;
    var input = panel.querySelector('.folder-filter');
    if (input && input.focus) { try { input.focus(); } catch (e) {} }
  }

  // 一覧の「選ぶ」対象は、今この場に出ている図だけ。畳んでいる一時控えを
  // folderNames に入れると、「全部選ぶ」が見えていない控えまで開いてしまう。
  function setFolderNames(sp) {
    var vis = (sp.items || []).map(function(e) { return e.name || e; });
    if (!_draftCollapsed) {
      (sp.drafts || []).forEach(function(e) { vis.push(e.name || e); });
    }
    folderNames = vis;
    if (window.MA.folderSelect) {
      folderPicked = window.MA.folderSelect.keepExisting(folderPicked, folderNames);
    }
  }

  // 一時控えは成果物の下にまとめ、既定では畳む。畳んだ枚数は必ず言葉で出す
  // (一覧に出ていないことを「保存できていない」と読み違えないため)。
  function appendDraftSection(drafts, factory) {
    var DM = window.MA.draftMark;
    if (!DM || !drafts || drafts.length === 0) return;
    var bar = document.createElement('div');
    bar.className = 'folder-draft-head';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-draft-toggle';
    b.setAttribute('data-draft-count', String(drafts.length));
    b.textContent = DM.toggleLabel(drafts.length, _draftCollapsed);
    b.title = DM.summary(drafts.length, _draftCollapsed);
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      _draftCollapsed = !_draftCollapsed;
      renderFolderPanel();
    });
    bar.appendChild(b);
    panel.appendChild(bar);
    if (_draftCollapsed) return;
    drafts.forEach(function(e) {
      var row = factory(e);
      if (row && row.classList) row.classList.add('folder-row-draft');
      panel.appendChild(row);
    });
  }

  // 行ごとの「控えにする / 控え」。既に溜まっている控えも 1 クリックで畳める
  // (名前の付け方を規約にすると、規約から外れた控えを取りこぼす)。
  function folderDraftButton(name) {
    var DM = window.MA.draftMark;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-draft';
    b.setAttribute('data-draft-name', name);
    var isDraft = !!(DM && DM.has(draftNames, name));
    if (isDraft) b.classList.add('folder-draft-on');
    b.textContent = DM ? DM.rowLabel(isDraft) : '控え';
    b.title = DM ? DM.rowTitle(isDraft) : '';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      _draftToggleName(name);
      syncDraftButton();
      renderFolderPanel();
    });
    return b;
  }

  // 印を付ける欄と、名前を押して 1 枚だけ開く従来のボタンを 1 行に並べる。
  // 名前を押したときの動きは変えない (1 枚だけ開くのが今までどおり最短)。
  // BLK-reviewer-20260908-0103: SVG が puml に追いついているかの要約と、
  // 追いついていない図だけを 1 押しで作り直すボタン。
  // 22 枚全部を毎回描き直すのではなく、古い枚数だけを描き直す。
  // BLK-reviewer-20260908-0923-wish: 他のペルソナが今も書き込み中かもしれない図。
  // 読み始めた版と読み終えた版が混ざると、古い版と新しい版が混ざった指摘になる。
  // 「直近 N 分以内に更新された図」を名指しし、後回しにする / 取り直すの
  // どちらかをその場で選べるようにする。
  // BLK-reviewer-20260914-1106-wish: 状態遷移図の遷移ラベルとクラス図のメソッドの
  // 対応は、これまで tools/audit.js を実行して JSON を読み解くしかなかった。
  // 部品ごとに 3 枚を束ねた行を一覧の頭に置き、宣言の無い名前を赤字で名指しする。
  // ── この周の保存が効いたか (BLK-primary-20260914-1406-wish) ──────────────
  // 今の画面は「保存操作をした」ことしか言わず、錠の問いに答えていない・テンプレ
  // 宣言で止めている・保存先がダウンロードのまま、のどれかで黙って書かれない道が
  // いくつもある。新人に引き継ぐ前に、保存先ファイルの中身と突き合わせて
  // 「効いた図 / 効かなかった図」を名指しする。

  // 書きに行った図だけディスクを読み直して突き合わせる。読めなければ「無い」。
  function verifySaves(dir) {
    var SV = window.MA.saveVerify;
    var WS = window.MA.workspace;
    if (!SV || !WS) return Promise.resolve([]);
    var todo = SV.pending();
    var chain = Promise.resolve();
    todo.forEach(function(n) {
      chain = chain.then(function() {
        return Promise.resolve(WS.loadFile(n, dir)).then(function(text) {
          SV.applyDisk(n, text);
        }, function() { SV.applyDisk(n, null); });
      });
    });
    return chain.then(function() { return SV.rows(); });
  }

  // 効かなかった図を、控えてある「書くつもりだった本文」で書き直す。
  // 錠の問いを待たずに書く (名指しして押した 1 枚なので、守るものは無い)。
  function resaveVerified(name, dir) {
    var SV = window.MA.saveVerify;
    var WS = window.MA.workspace;
    var r = SV && SV.record(name);
    if (!r || !WS) return Promise.resolve(null);
    return Promise.resolve(WS.saveToFile({ name: name, dsl: r.dsl }, dir)).then(function() {
      SV.note(name, r.dsl, 'written');
      return Promise.resolve(WS.loadFile(name, dir)).then(function(text) {
        var st = SV.applyDisk(name, text);
        if (window.MA.toast) {
          window.MA.toast.show(st === 'ok' ? name + ' を保存し直しました（ディスクの中身が一致しました）'
                                           : name + ' は書き直してもディスクが変わりません: ' + SV.reasonText(st));
        }
        renderFolderPanel();
        return st;
      });
    });
  }

  function appendSaveVerifySection(host, dir) {
    var SV = window.MA.saveVerify;
    if (!SV) return;
    var rows = SV.rows();
    if (!rows.length) return;
    var bad = rows.filter(function(r) { return r.bad; });
    var sum = document.createElement('div');
    sum.className = 'folder-save-verify' + (bad.length ? ' has-stale' : '');
    sum.id = 'folder-save-verify';
    sum.textContent = SV.summary(rows);
    sum.title = '「保存操作をした」ではなく「保存先ファイルの中身が編集後になっているか」です。'
      + '引き継ぐ前にここが 0 枚であることを確かめます';
    host.appendChild(sum);

    var bar = document.createElement('div');
    bar.className = 'folder-save-verify-bar';
    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'folder-save-verify-check';
    check.id = 'btn-save-verify';
    check.textContent = '保存を確かめる（' + rows.length + ' 枚）';
    check.title = 'この周に保存を試した図のファイルを読み直し、編集後の中身と突き合わせます';
    check.addEventListener('click', function(ev) {
      ev.stopPropagation();
      check.disabled = true;
      check.textContent = '確かめています…';
      verifySaves(dir).then(function() { renderFolderPanel(); },
                            function() { renderFolderPanel(); });
    });
    bar.appendChild(check);
    // 引き継ぎ資料にそのまま貼れる形で写す (受け取った側が 14 枚を開き直さずに済む)。
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'folder-save-verify-check';
    copy.id = 'btn-save-verify-copy';
    copy.textContent = '引き継ぎ用に写す';
    copy.title = '効いた図 / 効かなかった図の一覧を、引き継ぎ資料に貼れる形でクリップボードへ写します';
    copy.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var text = SV.handoffText(SV.rows());
      var done = function() { if (window.MA.toast) window.MA.toast.show('引き継ぎ用の一覧を写しました'); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else { done(); }
      } catch (e) { done(); }
    });
    bar.appendChild(copy);
    host.appendChild(bar);

    rows.forEach(function(r) {
      if (!r.bad && r.status !== 'unknown') return;   // 効いた図は 1 行の要約で足りる
      var row = document.createElement('div');
      row.className = 'folder-save-verify-row';
      row.setAttribute('data-save-verify', r.name);
      row.setAttribute('data-save-status', r.status);
      var txt = document.createElement('span');
      txt.className = 'folder-save-verify-name' + (r.bad ? ' is-bad' : '');
      txt.textContent = SV.rowLabel(r) + '（' + r.reason + '）';
      row.appendChild(txt);
      // 開いて直すのか、控えてある本文で書き直すのかを、その場で選べるようにする。
      var open = document.createElement('button');
      open.type = 'button';
      open.className = 'folder-save-verify-act';
      open.setAttribute('data-save-open', r.name);
      open.textContent = '開く';
      open.addEventListener('click', function(ev) { ev.stopPropagation(); openFromFolder(r.name); });
      row.appendChild(open);
      if (r.status === 'stale' || r.status === 'missing' || r.status === 'asked') {
        var again = document.createElement('button');
        again.type = 'button';
        again.className = 'folder-save-verify-act';
        again.setAttribute('data-save-resave', r.name);
        again.textContent = '保存し直す';
        again.title = '編集後の本文をこのファイルへ書き直します（錠の問いは待ちません）';
        again.addEventListener('click', function(ev) {
          ev.stopPropagation();
          again.disabled = true;
          resaveVerified(r.name, dir);
        });
        row.appendChild(again);
      }
      host.appendChild(row);
    });
  }

  // ── 中身が同じ図の統合と、1 枚だけの削除 (BLK-primary-20260914-1306-wish) ──
  // 指摘.md は毎回「can_init_sequence-編集中 が本体と byte 単位で同一のまま」の
  // 整理を求めるのに、📂一覧には開く・名前を変えるしか無く、実現するには保存
  // フォルダを直接触るしかなかった (体験の規律で禁止)。ここで「統合」を 1 押しに
  // する。消した図の過去版は server に残るので、取り違えても版から戻せる。

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

  function appendDupeSection(host, dir) {
    var DPM = window.MA.dupeMerge;
    if (!DPM || !dupeGroups.length) return;
    var WS = window.MA.workspace;
    var sum = document.createElement('div');
    sum.className = 'folder-dupe-summary';
    sum.id = 'folder-dupe-summary';
    sum.textContent = DPM.summary(dupeGroups);
    sum.title = '保存フォルダの中で本文が byte 単位で同じ図です。'
      + '「統合」を押すと残す 1 枚だけにします（消した図の過去版は残ります）';
    host.appendChild(sum);
    dupeGroups.forEach(function(g) {
      var row = document.createElement('div');
      row.className = 'folder-dupe-row';
      row.setAttribute('data-dupe-hash', g.hash);
      var txt = document.createElement('span');
      txt.className = 'folder-dupe-label';
      txt.textContent = DPM.label(g);
      row.appendChild(txt);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'folder-dupe-merge';
      b.setAttribute('data-dupe-keep', g.keep);
      b.textContent = '統合';
      b.title = g.keep + ' を残し、' + g.drop.join('・') + ' を保存フォルダから消します';
      if (!WS || !WS.deleteFile) { b.disabled = true; b.title = 'この保存先では消せません'; }
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        b.disabled = true;
        b.textContent = '統合中…';
        deleteFolderFiles(g.drop, dir);
      });
      row.appendChild(b);
      host.appendChild(row);
    });
    if (dupeGroups.length > 1) {
      var all = document.createElement('div');
      all.className = 'folder-dupe-row';
      var ab = document.createElement('button');
      ab.type = 'button';
      ab.className = 'folder-dupe-merge';
      ab.id = 'folder-dupe-merge-all';
      var drops = dupeGroups.reduce(function(acc, g) { return acc.concat(g.drop); }, []);
      ab.textContent = 'すべて統合（' + drops.length + ' 枚を消す）';
      ab.title = drops.join('・') + ' を消します（それぞれの本体は残ります）';
      ab.addEventListener('click', function(ev) {
        ev.stopPropagation();
        ab.disabled = true;
        ab.textContent = '統合中…';
        deleteFolderFiles(drops, dir);
      });
      all.appendChild(ab);
      host.appendChild(all);
    }
  }

  // 行に付く「本体 / 写し」の印。重複のある図にしか出ない。
  function folderDupeBadge(name) {
    var DPM = window.MA.dupeMerge;
    if (!DPM || !dupeGroups.length) return null;
    var b = DPM.badge(dupeGroups, name);
    if (!b) return null;
    var el = document.createElement('span');
    el.className = 'folder-dupe-badge folder-dupe-' + b.kind;
    el.setAttribute('data-dupe-of', name);
    el.setAttribute('data-dupe-kind', b.kind);
    el.textContent = b.mark;
    el.title = b.title;
    return el;
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
    b.textContent = armed ? '本当に消す' : '🗑';
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

  function appendPartCrossSection(panel) {
    var PC = window.MA.partCross;
    if (!PC || !partCross) return;
    var line = PC.summaryLine(partCross);
    if (!line) return;
    var bad = partCross.missingTotal > 0 || partCross.orphans.length > 0;
    var sum = document.createElement('div');
    sum.className = 'folder-part-cross-summary' + (bad ? ' has-stale' : '');
    sum.id = 'folder-part-cross-summary';
    sum.textContent = line;
    sum.title = '同じ部品名のクラス図・状態遷移図・シーケンス図を束ねて突き合わせた結果です。'
      + '接頭辞を持たない UML のイベント名（Tick / Reset など）は対象外です';
    panel.appendChild(sum);
    if (!bad) return;

    partCross.parts.forEach(function(r) {
      if (!r.missing.length) return;
      var row = document.createElement('div');
      row.className = 'folder-part-cross-row';
      row.setAttribute('data-part', r.part);
      var txt = document.createElement('span');
      txt.className = 'folder-part-cross-missing';
      txt.textContent = PC.partLine(r);
      txt.title = PC.partTitle(r);
      row.appendChild(txt);
      // 束ねた 3 枚はその場で開ける。名指しの後に「どのファイルか」を
      // 一覧の中から目で探し直すなら、突き合わせの手間は残ったままになる。
      r.docs.forEach(function(name) {
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'folder-part-cross-doc';
        link.setAttribute('data-file-name', name);
        link.textContent = name;
        link.title = name + ' を開く';
        link.addEventListener('click', function(ev) {
          ev.stopPropagation();
          openFromFolder(name);
        });
        row.appendChild(link);
      });
      panel.appendChild(row);
    });

    partCross.orphans.forEach(function(o) {
      var row = document.createElement('div');
      row.className = 'folder-part-cross-row folder-part-cross-orphan';
      row.setAttribute('data-owner', o.owner);
      var txt = document.createElement('span');
      txt.className = 'folder-part-cross-missing';
      txt.textContent = PC.orphanLine(o);
      txt.title = o.docs.join(', ') + ' に出てくる名前です。クラス図にこの型がありません';
      row.appendChild(txt);
      panel.appendChild(row);
    });
  }

  function appendWriteSection(panel, dir) {
    var WA = window.MA.writeActivity;
    if (!WA || !writeScan || !writeScan.rows.length) return;
    var active = writeScan.counts.active > 0 || writeScan.counts.unknown > 0;
    var sum = document.createElement('div');
    sum.className = 'folder-write-summary' + (active ? ' has-active' : '');
    sum.id = 'folder-write-summary';
    sum.textContent = WA.summary(writeScan);
    panel.appendChild(sum);
    if (!active) return;

    // 件数だけでは「どの図を後回しにするか」が 22 行の中の目視に戻る。
    // 名前と「何分前か」を並べる (30 秒前と 5 分前では判断が変わる)。
    var names = document.createElement('div');
    names.className = 'folder-write-names';
    var label = document.createElement('span');
    label.className = 'folder-write-names-label';
    label.textContent = '更新中の可能性';
    names.appendChild(label);
    writeScan.activeNames.forEach(function(name) {
      var link = document.createElement('button');
      link.type = 'button';
      link.className = 'folder-write-name';
      link.setAttribute('data-write-name', name);
      link.textContent = name + '（' + WA.ageText(writeAge[name]) + '）';
      link.title = '今も書き込みが続いているかもしれません。後回しにするか、一覧を取り直してから読んでください';
      link.addEventListener('click', function(ev) {
        ev.stopPropagation();
        openFromFolder(name);
      });
      names.appendChild(link);
    });
    if (writeScan.activeNames.length) panel.appendChild(names);

    var bar = document.createElement('div');
    bar.className = 'folder-write-actions';

    // 「後回しにする」の実体。落ち着いている図だけに印を付ければ、
    // まとめて開く操作がそのまま「今読んでよい図だけを読む」になる。
    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'folder-write-skip';
    skip.textContent = '更新中を除いて選ぶ（' + WA.settledNames(writeScan).length + ' 枚）';
    skip.title = '直近の窓に更新された図と、時刻が取れない図を外して印を付ける。'
      + '書き込み中かもしれない図を後回しにしたまま、残りを読み進められる';
    skip.disabled = !window.MA.folderSelect || WA.settledNames(writeScan).length === 0;
    skip.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var FS = window.MA.folderSelect;
      if (!FS) return;
      folderPicked = FS.selectAll(WA.settledNames(writeScan).filter(function(n) {
        return folderNames.indexOf(n) >= 0;
      }));
      syncFolderPickUi();
    });
    bar.appendChild(skip);

    // 「取り直す」の実体。時刻は開いた瞬間のもので止まっているので、
    // 押した時点の更新時刻で判定し直す。
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'folder-write-refresh';
    again.textContent = '一覧を取り直す';
    again.title = '保存フォルダの更新時刻をもう一度読み、この印を今の時刻で付け直す';
    again.addEventListener('click', function(ev) {
      ev.stopPropagation();
      renderFolderPanel();
    });
    bar.appendChild(again);
    panel.appendChild(bar);
  }

  function appendSvgSection(panel, dir) {
    var SF = window.MA.svgFreshness;
    if (!SF || !svgScan || !svgScan.rows.length) return;
    var sum = document.createElement('div');
    var stale = svgScan.needsRender.length > 0;
    sum.className = 'folder-svg-summary' + (stale ? ' has-stale' : '');
    sum.textContent = SF.summary(svgScan);
    panel.appendChild(sum);

    // BLK-reviewer-20260908-1103: mtime の 1 行だけでは「見た目が読めるか」は言えない。
    // svg に刻んだ元 puml の sha1 と今の puml を突き合わせた結果を、その下に 1 行で出す。
    if (SF.contentSummary) {
      var csum = document.createElement('div');
      var differ = (svgScan.contentCounts && svgScan.contentCounts.differ) > 0;
      csum.className = 'folder-svg-content' + (differ ? ' has-stale' : '');
      csum.id = 'folder-svg-content';
      csum.textContent = SF.contentSummary(svgScan);
      panel.appendChild(csum);
    }

    // BLK-reviewer-20260908-0103 (1403 追記): 上の 1 行が「印の突合」で出た答えなのか
    // 「描き直してのバイト比較」で出た答えなのかが画面に無く、同じ判定を自分で
    // やろうとすると、印の付かない /render の応答とバイト比較して全件ずれに見える。
    // 何を見た答えかをその場に書く (server.py を読みに行かせない)。
    // BLK-reviewer-20260908-2003-wish: 上の 2 行は「mtime で古いか」「内容が一致するか」を
    // 別々に言う。reviewer が手順4.10・6 で毎回作っていたのは、この 2 つを図ごとに
    // 突き合わせた「labels が一致しているか」の一覧なので、その集計をそのまま 1 行にする。
    var SCR = window.MA.svgCompareRow;
    if (SCR) {
      var cmpRows = [];
      svgScan.rows.forEach(function(r) {
        var c = svgCompare[r.name];
        if (c) cmpRows.push(c);
      });
      var lsum = document.createElement('div');
      var lbad = SCR.counts(cmpRows);
      lsum.className = 'folder-svg-labels-summary' + (lbad.differ || lbad.missing ? ' has-stale' : '');
      lsum.id = 'folder-svg-labels-summary';
      lsum.textContent = SCR.summary(cmpRows);
      lsum.title = '各図の行に「puml の保存時刻 / SVG の書き出し時刻 / labels 一致」が並んでいます。'
        + '未確認の図は「未刻印」の行から確かめられます';
      panel.appendChild(lsum);
    }

    // BLK-reviewer-20260914-0906-wish: 出力先がクロスした図は、上の 3 行では
    // どれも「内容ずれ」にしか見えない。相手を名指しした 1 行をその下に出す。
    var SX2 = window.MA.svgCross;
    if (SX2 && svgCross && svgCross.rows.length) {
      var xsum = document.createElement('div');
      xsum.className = 'folder-svg-cross-summary has-stale';
      xsum.id = 'folder-svg-cross-summary';
      xsum.textContent = SX2.summaryLine(svgCross);
      xsum.title = '印 (@pua-source-sha1) が、同じフォルダの別の図の puml のものになっています。'
        + '行の「他図の絵 / 絵が入れ替わり」で相手が分かります';
      panel.appendChild(xsum);
    }

    if (SF.basisNote) {
      var bnote = document.createElement('div');
      bnote.className = 'folder-svg-basis';
      bnote.id = 'folder-svg-basis';
      bnote.textContent = SF.basisNote(svgScan);
      panel.appendChild(bnote);
    }

    // BLK-reviewer-20260908-0823-wish: 件数だけだと「どの図か」を 22 行の中から
    // 目で探すことになり、SVG の書き出し漏れに気付くのが偶然に戻る。
    // 無い図・古い図の名前をここに並べ、押せばその図を開けるようにする。
    var short = SF.shortfall ? SF.shortfall(svgScan) : [];
    short.forEach(function(g) {
      var row = document.createElement('div');
      row.className = 'folder-svg-names svg-' + g.status;
      row.setAttribute('data-svg-status', g.status);
      var label = document.createElement('span');
      label.className = 'folder-svg-names-label';
      label.textContent = g.label;
      row.appendChild(label);
      g.names.forEach(function(name) {
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'folder-svg-name';
        link.textContent = name;
        link.title = g.title;
        link.addEventListener('click', function(ev) {
          ev.stopPropagation();
          openFromFolder(name);
        });
        row.appendChild(link);
      });
      // BLK-primary-20260908-1203: 下の「古い SVG を作り直す」は古い・無い・内容ずれを
      // まとめて作り直すので、この行に名指しされた図だけを狙えない。行の末尾に
      // 「この N 枚だけ作り直す」を置き、reviewer に指摘された分だけを 1 押しで直せるようにする。
      if (SF.groupRenderLabel) {
        var only = document.createElement('button');
        only.type = 'button';
        only.className = 'folder-svg-names-render';
        only.setAttribute('data-svg-status', g.status);
        only.textContent = SF.groupRenderLabel(g);
        only.title = SF.groupRenderTitle(g);
        only.addEventListener('click', function(ev) {
          ev.stopPropagation();
          only.disabled = true;
          renderStaleSvgs(dir, g.names, only);
        });
        row.appendChild(only);
      }
      panel.appendChild(row);
    });

    // BLK-reviewer-20260908-2003-wish: 印の無い図の名前。要約の「未確認 N 枚」だけでは
    // どの 1 枚かが分からず、毎回 audit.js を挟んで突き止めていた (実データ 22 枚中 1 枚)。
    // 行末の押しでその図だけを、上書きせずに描き直して確かめる。
    var un = SF.unstamped ? SF.unstamped(svgScan) : null;
    if (un) {
      var urow = document.createElement('div');
      urow.className = 'folder-svg-names svg-unverified';
      urow.id = 'folder-svg-unstamped';
      urow.setAttribute('data-svg-status', 'unverified');
      var ulabel = document.createElement('span');
      ulabel.className = 'folder-svg-names-label';
      ulabel.textContent = un.label;
      urow.appendChild(ulabel);
      un.names.forEach(function(name) {
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'folder-svg-name';
        link.textContent = name;
        link.title = un.title;
        link.addEventListener('click', function(ev) {
          ev.stopPropagation();
          openFromFolder(name);
        });
        urow.appendChild(link);
      });
      var uonly = document.createElement('button');
      uonly.type = 'button';
      uonly.className = 'folder-svg-names-verify';
      uonly.setAttribute('data-svg-status', 'unverified');
      uonly.textContent = SF.unstampedVerifyLabel(un);
      uonly.title = 'この行の図だけを、保存中の SVG を上書きせずに 1 回描き直して比べる。'
        + '一致すれば「内容一致」になり、以後この一覧だけで判定できる';
      uonly.addEventListener('click', function(ev) {
        ev.stopPropagation();
        uonly.disabled = true;
        verifySvgContents(dir, un.names, uonly);
      });
      urow.appendChild(uonly);
      panel.appendChild(urow);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-svg-render';
    // 集計行と同じ枚数を言っているかを外から見られるようにする
    // (BLK-primary-20260908-1303: この 2 つが違う基準で数えていた)。
    btn.id = 'folder-svg-render';
    btn.textContent = SF.renderLabel(svgScan);
    btn.title = '保存フォルダの puml から SVG を描き直す。puml には触らないので、'
      + '「SVG が古い」がこの 1 押しで消える';
    if (svgRenderNote) {
      var note = document.createElement('div');
      note.className = 'folder-svg-summary folder-svg-note';
      note.textContent = svgRenderNote;
      panel.appendChild(note);
    }
    btn.disabled = !stale;
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      btn.disabled = true;
      renderStaleSvgs(dir, svgScan.needsRender, btn);
    });
    panel.appendChild(btn);

    // BLK-reviewer-20260908-1103: 印の無い svg は、mtime が揃っていても中身までは言えない。
    // 1 押しで作り直せば印が付き、以後はこの一覧だけで内容の一致を言い切れる
    // (22 枚を curl + diff で確かめ直す手順が要らなくなる)。
    if (SF.proofLabel) {
      var pbtn = document.createElement('button');
      pbtn.type = 'button';
      pbtn.className = 'folder-svg-proof-btn';
      pbtn.id = 'folder-svg-proof';
      pbtn.textContent = SF.proofLabel(svgScan);
      pbtn.title = '内容の一致を言い切れない SVG を puml から作り直し、'
        + 'どの puml から作ったかを SVG に刻む。次からは一覧を見るだけで済む';
      pbtn.disabled = !(svgScan.needsProof && svgScan.needsProof.length);
      pbtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        pbtn.disabled = true;
        renderStaleSvgs(dir, svgScan.needsProof, pbtn);
      });
      panel.appendChild(pbtn);
    }

    // BLK-reviewer-20260908-1103-wish: 作り直しは「今そう見える」に揃えるだけで、
    // 保存されていた絵が正しかったかは分からなくなる。こちらは上書きせずに
    // 裏で 1 回描き直してバイト比較し、結果だけを控える。実データ 22 枚を
    // curl と diff で 1 枚ずつ確かめ直す手順が、この 1 押しに置き換わる。
    if (SF.verifyLabel) {
      if (svgVerifyNote) {
        var vnote = document.createElement('div');
        vnote.className = 'folder-svg-summary folder-svg-verify-note';
        vnote.id = 'folder-svg-verify-note';
        vnote.textContent = svgVerifyNote;
        panel.appendChild(vnote);
      }
      var vbtn = document.createElement('button');
      vbtn.type = 'button';
      vbtn.className = 'folder-svg-verify-btn';
      vbtn.id = 'folder-svg-verify';
      vbtn.textContent = SF.verifyLabel(svgScan);
      vbtn.title = '内容で言い切れない SVG を、上書きせずに裏で 1 回描き直して'
        + 'バイト単位で比べる。食い違った図は「内容ずれ」として名指しされる';
      vbtn.disabled = !(svgScan.needsVerify && svgScan.needsVerify.length);
      vbtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        vbtn.disabled = true;
        verifySvgContents(dir, svgScan.needsVerify, vbtn);
      });
      panel.appendChild(vbtn);
    }

    // BLK-reviewer-20260908-1203: 印だけで「内容ずれ」と分かった図は、確かめ直して
    // いないので中身の材料が手元に無い。ここを押せば、その図だけをもう一度
    // (上書きせずに) 突き合わせて、何が食い違うのかまで出す。
    if (SF.diffLabel) {
      var pending = (svgScan.needsDiff || []).filter(function(n) { return !svgVerifyDiffs[n]; });
      var dbtn = document.createElement('button');
      dbtn.type = 'button';
      dbtn.className = 'folder-svg-diff-scan';
      dbtn.id = 'folder-svg-diff-scan';
      dbtn.textContent = SF.diffLabel(pending);
      dbtn.title = '内容ずれの図をもう一度描き直して、欠落した要素と SVG に残る古い名前を出す';
      dbtn.disabled = !pending.length;
      dbtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        dbtn.disabled = true;
        verifySvgContents(dir, pending, dbtn);
      });
      panel.appendChild(dbtn);
    }

    appendSvgDiffSection(panel);
  }

  // BLK-reviewer-20260908-1203-wish: 「内容ずれ」と分かった図の、食い違いの中身。
  // ここが無かった頃は、ずれた 7 枚を 1 枚ずつ開いて旧 participant 名や欠けた遷移を
  // grep で突き止めていた (1 枚あたり 10 行前後)。欠落と残存を図ごとに並べ、
  // primary へ渡す指摘文をその場でコピーできるようにする。
  function appendSvgDiffSection(panel) {
    var SD = window.MA.svgDiffSummary;
    if (!SD) return;
    var names = Object.keys(svgVerifyDiffs);
    if (!names.length) return;
    names.sort();
    var head = document.createElement('div');
    head.className = 'folder-svg-content has-stale';
    head.id = 'folder-svg-diff-head';
    head.textContent = '内容ずれの中身（' + names.length + ' 枚）';
    panel.appendChild(head);

    names.forEach(function(name) {
      var diff = svgVerifyDiffs[name];
      var box = document.createElement('div');
      box.className = 'folder-svg-diff';
      box.setAttribute('data-svg-diff', name);
      var title = document.createElement('div');
      var nm = document.createElement('span');
      nm.className = 'folder-svg-diff-name';
      nm.textContent = name;
      title.appendChild(nm);
      var sm = document.createElement('span');
      sm.className = 'folder-svg-diff-sum';
      sm.textContent = SD.summary(diff);
      title.appendChild(sm);
      box.appendChild(title);
      diff.missing.forEach(function(r) {
        var row = document.createElement('div');
        row.className = 'folder-svg-diff-row diff-missing';
        row.textContent = SD.kindLabel(r.kind) + ': ' + r.label;
        box.appendChild(row);
      });
      diff.leftover.forEach(function(s) {
        var row = document.createElement('div');
        row.className = 'folder-svg-diff-row diff-leftover';
        row.textContent = s;
        box.appendChild(row);
      });
      // BLK-reviewer-20260908-1303: 文字に現れない差 (図形の数・並び順) も並べる。
      // 「文字の上での違い無し」だけを見せると、レイアウトだけの差と誤読される。
      (diff.structural || []).forEach(function(r) {
        var row = document.createElement('div');
        row.className = 'folder-svg-diff-row diff-structural';
        row.textContent = r.text;
        box.appendChild(row);
      });
      panel.appendChild(box);
    });

    // 指摘文はコピーする前に読めるようにする。読まずに渡す文は指摘にならない。
    var report = document.createElement('textarea');
    report.className = 'folder-svg-diff-report';
    report.id = 'folder-svg-diff-report';
    report.readOnly = true;
    report.value = SD.reportAll(svgVerifyDiffs);
    report.addEventListener('click', function(ev) { ev.stopPropagation(); });
    panel.appendChild(report);

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'folder-svg-diff-copy';
    copy.id = 'folder-svg-diff-copy';
    copy.textContent = '指摘文をコピー';
    copy.title = '食い違いの一覧を primary への指摘文としてコピーする';
    copy.addEventListener('click', function(ev) {
      ev.stopPropagation();
      report.select();
      var done = function() { copy.textContent = 'コピーしました'; };
      // クリップボードが使えない場面 (権限なし・http 以外) でも、
      // 選択済みの本文が残るので手で copy すれば渡せる。
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(report.value).then(done, function() { done(); });
          return;
        }
      } catch (e) {}
      done();
    });
    panel.appendChild(copy);
  }

  // 描画は 1 枚あたり数百 ms かかる。何枚目まで進んだかを押したボタンに出しながら、
  // 10 枚ずつ server に渡す (1 枚ずつだと往復が、全部一度だと無反応が長い)。
  function verifySvgContents(dir, names, btn) {
    var queue = names.slice();
    var total = queue.length;
    var counts = { match: 0, differ: 0, missing: 0, error: 0 };
    var mode = (document.getElementById('render-mode') || {}).value || 'local';
    function step() {
      if (queue.length === 0) {
        var parts = [];
        if (counts.match) parts.push('一致 ' + counts.match + ' 枚');
        // BLK-reviewer-20260908-0103 (1903 追記): 体裁だけの差を「食い違い」に
        // 混ぜると、作り直す必要の無い図が件数を膨らませる。別の数として言う。
        if (counts['differ-format']) parts.push('体裁差のみ ' + counts['differ-format'] + ' 枚');
        if (counts['differ-content']) parts.push('食い違い ' + counts['differ-content'] + ' 枚');
        if (counts.differ) parts.push('食い違い ' + counts.differ + ' 枚');
        if (counts.missing) parts.push('SVG 無し ' + counts.missing + ' 枚');
        if (counts.error) parts.push('確かめられず ' + counts.error + ' 枚');
        svgVerifyNote = total + ' 枚を描き直して比べました（' + parts.join(' / ') + '）';
        renderFolderPanel();
        return;
      }
      var chunk = queue.splice(0, 10);
      btn.textContent = '描き直して比べています…（残り ' + queue.length + ' 枚）';
      fetch('/verify-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: dir, types: chunk, mode: mode }),
      }).then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      }).then(function(res) {
        var results = (res && res.results) || {};
        var SD = window.MA.svgDiffSummary;
        chunk.forEach(function(name) {
          var r = results[name] || {};
          var st = r.status || 'error';
          if (counts[st] === undefined) counts[st] = 0;
          counts[st]++;
          // BLK-reviewer-20260908-1203-wish: 食い違った図は、その場で中身まで言う。
          // 材料 (今の puml と svg に書かれている文字) は server が添えてくる。
          if (st === 'differ-content' && SD && typeof r.pumlText === 'string') {
            // BLK-reviewer-20260908-1303: 保存中の SVG と描き直した SVG を直に
            // 比べる材料も渡す。渡さないと「文字の上で差なし」を「差なし」と
            // 言ってしまう (render は決定的なので、バイトが違う以上 差はある)。
            svgVerifyDiffs[name] = SD.compare(r.pumlText, r.svgLabels, {
              drawnLabels: r.drawnLabels,
              svgShape: r.svgShape,
              drawnShape: r.drawnShape,
            });
          }
        });
      }).catch(function() {
        counts.error += chunk.length;
      }).then(step);
    }
    step();
  }

  // 古い SVG を 1 枚ずつ直列に作り直す。1 枚失敗しても残りは進める
  // (1 枚のために全部が止まると、結局手で確かめ直すことになる)。
  function renderStaleSvgs(dir, names, btn) {
    var queue = names.slice();
    var done = 0;
    var failed = [];
    function step() {
      if (queue.length === 0) {
        svgRenderNote = failed.length
          ? (done + ' 枚を作り直しました（' + failed.join(' / ') + ' は失敗）')
          : (done + ' 枚を作り直しました');
        renderFolderPanel();
        return;
      }
      var name = queue.shift();
      btn.textContent = '作り直しています… ' + name + '（残り ' + queue.length + ' 枚）';
      window.MA.workspace.loadFile(name, dir).then(function(dsl) {
        if (dsl === null) throw new Error('読めません');
        return renderDslToSvg(dsl);
      }).then(function(svg) {
        return fetch('/autosave-svg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: name, dir: dir, svg: svg }),
        });
      }).then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        done++;
      }).catch(function() {
        failed.push(name);
      }).then(step);
    }
    step();
  }

  // BLK-reviewer-20260908-0203-wish: 実データ / テンプレの内訳と、汚染したテンプレの名指し。
  // 「新規指摘が実データの変更かテンプレの汚染か」を、一覧を開いた時点で答える。
  function appendRoleSection(panel, dir) {
    var FR = window.MA.fileRole;
    if (!FR || !roleScan || !roleScan.rows.length) return;
    var sum = document.createElement('div');
    var dirty = roleScan.dirty.length > 0;
    sum.className = 'folder-role-summary' + (dirty ? ' has-dirty' : '');
    sum.id = 'folder-role-summary';
    sum.textContent = FR.summary(roleScan);
    panel.appendChild(sum);
    if (dirty) {
      var list = document.createElement('div');
      list.className = 'folder-role-summary has-dirty';
      list.id = 'folder-role-dirty';
      list.textContent = '汚染: ' + roleScan.dirty.join(' / ');
      panel.appendChild(list);
    }
    if (roleNote) {
      var note = document.createElement('div');
      note.className = 'folder-role-summary';
      note.id = 'folder-role-note';
      note.textContent = roleNote;
      panel.appendChild(note);
    }
  }

  function _entryOf(name) {
    var hit = null;
    (roleEntries || []).forEach(function(e) {
      if (e && e.name === name) hit = e;
    });
    return hit || { name: name, hash: null };
  }

  // 押すたびに 未分類 → 実データ → テンプレ。テンプレにした瞬間の中身が baseline になる。
  function folderRoleButton(name) {
    var FR = window.MA.fileRole;
    var b = document.createElement('button');
    b.type = 'button';
    var rs = roleStatus[name] || { role: 'unset', status: 'none' };
    var bd = FR.badge(rs.role, rs.status);
    b.className = 'folder-role ' + bd.cls;
    b.setAttribute('data-role-name', name);
    b.setAttribute('data-role', rs.role);
    b.setAttribute('data-role-status', rs.status);
    b.textContent = bd.mark || '−';
    b.title = bd.title + '（押すと ' + FR.roleLabel(FR.nextRole(rs.role)) + ' になります）';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      setFileRole(name, FR.nextRole(rs.role));
    });
    return b;
  }

  // 汚染したテンプレに付く [今の内容で更新]。自分で直したときに赤を消すための出口
  // (赤を消す手段が無いと、次からこの印そのものを見なくなる)。
  function folderRoleAcceptButton(name) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-role-accept';
    b.setAttribute('data-role-accept', name);
    b.textContent = '今の内容で更新';
    b.title = 'このテンプレを自分で直したのなら、今の中身を正として覚え直します';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      setFileRole(name, 'template');
    });
    return b;
  }

  // 宣言は保存フォルダの _roles.json に丸ごと置き換えで書く。
  function saveFileRoles(dir, roles) {
    var FR = window.MA.fileRole;
    return fetch('/file-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: dir, roles: FR.serialize(roles).roles }),
    }).then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return true;
    });
  }

  function setFileRole(name, role) {
    var FR = window.MA.fileRole;
    var dir = _wsFileDir();
    fileRoles = FR.setRole(fileRoles, _entryOf(name), role, new Date().toISOString());
    roleNote = name + ' を ' + FR.roleLabel(role) + ' にしました';
    saveFileRoles(dir, fileRoles).catch(function() {
      roleNote = name + ' の分類を保存できませんでした（この画面の中だけの印です）';
    }).then(function() {
      renderFolderPanel();
    });
  }

  // ── 自動保存の書き先を「図の名前」にする (BLK-primary-20260913-0306) ─────
  // 自動保存は図種 (plantuml-sequence 等) を鍵にディスクへ写していたため、
  // driver_common_class を打てば plantuml-class.puml が、diagram1 を打てば
  // plantuml-sequence.puml が、開いてもいないのに同じ中身へ書き換わっていた。
  // Ctrl+S (saveTarget) は既に図の名前で書いているので、自動保存の書き先も
  // そちらに揃える。名前が付いていない・ファイル名にできないタブは書かない。
  (function setupAutosaveFileName() {
    var AS = window.MA.autoSave;
    if (!AS || !AS.setFileNameResolver) return;
    AS.setFileNameResolver(function() {
      var WS = window.MA.workspace;
      if (!WS || !WS.getActive) return '';
      var doc = WS.getActive();
      var name = (doc && doc.name) || '';
      if (!name) return '';
      if (WS.isValidName && !WS.isValidName(name)) return '';
      // 見比べのために開いた元ファイルの錠も、Ctrl+S と同じように効かせる。
      // ここを素通しすると「元のまま保つ」と答えた図へ自動保存だけが書き続ける。
      var SL = window.MA.sourceLock;
      if (SL && doc) {
        var d;
        try { d = SL.decide(doc.id, doc.name, _openDocNames(), doc.dsl); } catch (e) { return ''; }
        if (!d || d.action === 'ask') return '';   // 返事を待つ間は書かない
        if (d.action === 'skip') return '';        // 開いたときのまま。書かない
        if (d.name) return d.name;                 // 控えの名前へ逃がす
      }
      return name;
    });
  })();

  // ── テンプレへの自動保存を止める (BLK-junior-20260908-1803) ──────────────
  // 見比べのために Open で開いたテンプレ (前周の完了物) へ、図名を変えるまでの間に
  // 自動保存が書き込み、編集途中の内容でテンプレが壊れる事故があった。
  // 汚染を後から赤く出す (テンプレ宣言) 仕組みは既にあるので、その宣言をそのまま
  // 「書き込ませない」に使う。編集内容は localStorage 側に残るので失われない。
  (function setupTemplateAutosaveGuard() {
    var AS = window.MA.autoSave;
    var FR = window.MA.fileRole;
    if (!AS || !FR || !AS.setFileGuard) return;

    function blockOf(diagramType) {
      var name = String(diagramType == null ? '' : diagramType);
      if (!name) return null;
      // 書き先は {図名}.puml。宣言は一覧の名前で持っている (拡張子の有無は問わない)。
      if (FR.blocksAutosave(fileRoles, name)) return FR.blockedMessage(name);
      if (FR.blocksAutosave(fileRoles, name + '.puml')) return FR.blockedMessage(name + '.puml');
      return null;
    }
    AS.setFileGuard(blockOf);
    _fileWriteBlock = blockOf;

    if (AS.onFileBlocked) {
      AS.onFileBlocked(function(info) {
        if (window.MA.toast) {
          try { window.MA.toast.show(info.reason); } catch (e) {}
        }
      });
    }

    // BLK-junior-20260908-2003: 図種が変わる保存は server が `{名前}_{図種}` へ回す。
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

    // 開き直した直後 (一覧をまだ開いていない) でも宣言を知っているようにする。
    var WS = window.MA.workspace;
    if (WS && WS.listFolder) {
      try {
        WS.listFolder(_wsFileDir()).then(function(res) {
          if (!res) return;
          // 一覧を先に開いていたらそちらが正本。ここで上書きしない。
          if (Object.keys(fileRoles).length > 0) return;
          fileRoles = FR.keepExisting((res && res.roles) || {}, res.entries || []);
        }).catch(function() {});
      } catch (e) {}
    }
  })();

  function folderRow(name, bdg, mtime, status) {
    var FS = window.MA.folderSelect;
    var b = folderButton(name, bdg, mtime, status);
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
    if (window.MA.fileRole) row.appendChild(folderRoleButton(name));
    row.appendChild(b);
    if ((roleStatus[name] || {}).status === 'dirty') row.appendChild(folderRoleAcceptButton(name));
    if (status === 'changed' || status === 'new') row.appendChild(folderDiffButton(name, status));
    if (window.MA.targetSet) row.appendChild(folderTargetButton(name));
    row.appendChild(folderDraftButton(name));
    // BLK-junior-20260914-1106-wish: 同じ図種の枠に版が並ぶようになったので、
    // 版は行の上で 1 文字で分かるようにする (名前の末尾を読み比べない)。
    var vr = folderVariantBadge(name);
    if (vr) row.appendChild(vr);
    // BLK-junior-20260914-1206-wish: 指摘.md から見たこの図の立場。
    // 対象外なら開かずに次へ進める (自分と先輩の両方を開いて突き合わせない)。
    var nb = folderNoteBadge(name);
    if (nb) row.appendChild(nb);
    var hit = noteHitOf(name);
    if (hit) {
      row.classList.add('folder-note-hit');
      row.setAttribute('data-note-hit', hit);
      if (hit === 'target') row.classList.add('folder-note-target');
    }
    var kb = folderKindBadge(name);
    if (kb) row.appendChild(kb);
    var vb = folderVersionButton(name);
    if (vb) row.appendChild(vb);
    // BLK-primary-20260914-1306-wish: 中身が同じ図の印と、1 枚だけ消すボタン。
    var db = folderDupeBadge(name);
    if (db) row.appendChild(db);
    var xb = folderDeleteButton(name);
    if (xb) row.appendChild(xb);
    return row;
  }

  // BLK-junior-20260908-2003: この保存先に何の図種が何枚あるか。0 枚の図種も出す。
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
  }

  // 行に付く版のバッジ。本番用 (無印) には付けない — 全行に印が付くと印でなくなる。
  function folderVariantBadge(name) {
    var FV = window.MA.findingVariant;
    if (!FV) return null;
    var b = FV.badge(name);
    if (!b) return null;
    var el = document.createElement('span');
    el.className = 'folder-variant' + (b.key ? ' folder-variant-' + b.key : '');
    el.setAttribute('data-variant-of', name);
    el.setAttribute('data-variant', b.key || '');
    el.textContent = b.mark;
    el.title = b.title;
    return el;
  }

  // 行に付く図種のバッジ。名前が diagram1 でも何の図かがその場で分かる。
  function folderKindBadge(name) {
    var DK = window.MA.diagramKind;
    var SK = window.MA.savedKind;
    if (!DK) return null;
    // BLK-junior-20260912-2103-wish: 控えがあれば、それをこのまま開く図種として出す。
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

  // BLK-junior-20260908-2003: 同じ名前に別の図を保存すると前の中身は消える。
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
    b.title = 'この名前で上書きされる前の中身。図種を変えて保存し直した前の図もここに残っています';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      toggleVersionList(name, b);
    });
    return b;
  }

  // 版の一覧を、押した行のすぐ下に開く / 閉じる。パネルを閉じないので、
  // 「どの版がその図だったか」を見比べてから 1 回で開ける。
  function toggleVersionList(name, btn) {
    var VH = window.MA.versionHistory;
    var host = btn.parentNode || panel;
    var open = panel.querySelector('[data-version-list="' + name + '"]');
    if (open) { open.parentNode.removeChild(open); return; }
    var box = document.createElement('div');
    box.className = 'folder-version-list';
    box.setAttribute('data-version-list', name);
    box.textContent = '読み込み中…';
    if (host.nextSibling) host.parentNode.insertBefore(box, host.nextSibling);
    else host.parentNode.appendChild(box);
    loadVersions(name).then(function(rows) {
      box.textContent = '';
      if (!rows.length) {
        box.textContent = '控えてある版がありません';
        return;
      }
      rows.forEach(function(r) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'folder-version';
        b.setAttribute('data-version-stamp', r.stamp);
        b.setAttribute('data-version-of', name);
        b.textContent = r.label + (r.kind ? '  ' + r.kind : '')
          + (r.lines != null ? '  ' + r.lines + ' 行' : '');
        b.title = r.head || 'この版を別のタブで開く（今の図は上書きしません）';
        b.addEventListener('click', function(ev) {
          ev.stopPropagation();
          openVersion(name, r.stamp);
        });
        // 版と「戻す」は 1 行に並べる (どの版に戻すのかを押す前に確かめられるように)。
        var line = document.createElement('div');
        line.className = 'folder-version-row';
        line.appendChild(b);
        // BLK-primary-20260913-0306-friction: 別タブで開いても、壊れた図を直すには
        // 開いた版を全文選択して打ち直すしかなかった。その 1 手順を 1 クリックにする。
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'folder-version-restore';
        rb.setAttribute('data-version-restore', r.stamp);
        rb.setAttribute('data-version-of', name);
        rb.textContent = VH.restoreLabel();
        rb.title = VH.restoreTitle(name, r.stamp);
        rb.addEventListener('click', function(ev) {
          ev.stopPropagation();
          restoreVersionInto(name, r.stamp);
        });
        line.appendChild(rb);
        box.appendChild(line);
      });
    }, function() { box.textContent = '版の一覧を読めませんでした'; });
  }

  function loadVersions(name) {
    var VH = window.MA.versionHistory;
    var url = '/autosave-versions?dir=' + encodeURIComponent(_wsFileDir())
      + '&type=' + encodeURIComponent(name);
    return window.fetch(url)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { return VH ? VH.rows(data) : []; });
  }

  // 版を開く。タブ名に刻印を付けるので、開いたまま自動保存が走っても
  // 今の {name}.puml を過去の中身で塗り潰さない。
  function openVersion(name, stamp) {
    var VH = window.MA.versionHistory;
    var url = '/autosave-versions?dir=' + encodeURIComponent(_wsFileDir())
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

  // 版を今の図に流し込む (BLK-primary-20260913-0306-friction)。
  // 開いていない図なら先に開いてから当てる — 当てる先がタブとして見えていないと、
  // 「戻した」のがどの図なのかが画面のどこにも出ない。
  // 当てるのは _applyLineEditText なので、undo 1 手で戻せて保存フォルダにも書かれる
  // (server は上書きの手前で今の中身を控えるので、戻し自体も失われない)。
  function restoreVersionInto(name, stamp) {
    var VH = window.MA.versionHistory;
    var dir = _wsFileDir();
    var url = '/autosave-versions?dir=' + encodeURIComponent(dir)
      + '&type=' + encodeURIComponent(name) + '&stamp=' + encodeURIComponent(stamp);

    function finish(text) {
      if (!_applyLineEditText(text)) {
        if (window.MA.toast) window.MA.toast.show(VH.unchangedLine(name, stamp));
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

  // 前回見た版から変わった図にだけ付く [差分]。押すと旧DSL/新DSL を並べて出す。
  // 図を開かずに読めるので、変更箇所の確認だけならタブを増やさずに済む。
  function folderDiffButton(name, status) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-diff';
    b.setAttribute('data-diff-name', name);
    b.textContent = '差分';
    b.title = status === 'new'
      ? '前回見たときには無かった図です。今の中身を全部追加として出します'
      : '前回見た版と今の中身を左右に並べて、変わった行だけ色を付けて出します';
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      openReviewDiff(name);
    });
    return b;
  }

  // 変更のある図の名前 (一覧の並びのまま)。
  function changedNames() {
    return folderNames.filter(function(n) {
      return folderStatus[n] === 'changed' || folderStatus[n] === 'new';
    });
  }

  // 「変更図だけ選ぶ」。無変更の図に印を付けずに済むので、
  // 変更のある図だけをまとめて開くのが 2 クリックで終わる。
  function folderChangedButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-pick-changed';
    b.textContent = '変更図だけ選ぶ（0 枚）';
    b.title = '前回見た版から変わった図と新しい図にだけ印を付ける';
    b.disabled = true;
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var FS = window.MA.folderSelect;
      if (!FS) return;
      folderPicked = FS.selectAll(changedNames());
      syncFolderPickUi();
    });
    return b;
  }

  // BLK-junior-20260908-0630-wish: 「未反映だけ選ぶ」。指摘が残っている図だけに
  // 印を付けるので、手順 9 の「一覧から名前を読み比べて探し直す」が 1 押しになる。
  function pendingNames() {
    var RS = window.MA.reviewState;
    if (!RS) return [];
    return RS.pendingNames(reviewStatus).filter(function(n) { return folderNames.indexOf(n) >= 0; });
  }

  function folderPendingButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-pick-pending';
    b.textContent = '未反映だけ選ぶ（0 枚）';
    b.title = '未対応のレビュー指摘が残っている図にだけ印を付ける';
    b.disabled = true;
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var FS = window.MA.folderSelect;
      if (!FS) return;
      folderPicked = FS.selectAll(pendingNames());
      syncFolderPickUi();
    });
    return b;
  }

  // BLK-primary-20260908-1703: 一覧を開いた瞬間に「対象 14 枚のうち何枚あるか /
  // どれが足りないか」を見出しで言う。未登録のときも黙らず、登録の入口を出す
  // (「まだ数えていない」と「揃っている」を取り違えないため)。
  function appendTargetSection(host, dir) {
    var TS = window.MA.targetSet;
    if (!TS) return;
    var rec = targetScan || TS.reconcile(targetNames, []);
    var line = document.createElement('div');
    line.className = 'folder-target-summary ' + TS.summaryClass(rec);
    line.id = 'folder-target-summary';
    line.setAttribute('data-target-expected', String(rec.expected));
    line.setAttribute('data-target-present', String(rec.present));
    line.textContent = TS.summary(rec);
    host.appendChild(line);

    var bar = document.createElement('div');
    bar.className = 'folder-target-bar';
    var set = document.createElement('button');
    set.type = 'button';
    set.className = 'folder-target-set';
    set.id = 'folder-target-set';
    set.textContent = TS.buttonLabel(rec);
    set.title = TS.buttonTitle(rec);
    set.addEventListener('click', function(ev) {
      ev.stopPropagation();
      // 一時控えは成果物ではないので対象 set に入れない (畳んだ控えが
      // 期待枚数を押し上げると、翌日の過不足が読めなくなる)。
      var DM = window.MA.draftMark;
      var pick = folderNames.filter(function(n) { return !(DM && DM.has(draftNames, n)); });
      TS.save(_reviewStore(), dir, pick);
      renderFolderPanel();
    });
    bar.appendChild(set);
    if (rec.configured) {
      var off = document.createElement('button');
      off.type = 'button';
      off.className = 'folder-target-clear';
      off.id = 'folder-target-clear';
      off.textContent = TS.clearLabel();
      off.title = 'このフォルダの対象 set を外す。見出しの過不足は出なくなる';
      off.addEventListener('click', function(ev) {
        ev.stopPropagation();
        TS.clear(_reviewStore(), dir);
        renderFolderPanel();
      });
      bar.appendChild(off);
    }
    host.appendChild(bar);
  }

  // BLK-junior-20260908-2003-wish: 部品の図種の棚卸し。
  // 資料化の周は「前周までに作った状態遷移図を開く」から始まるのに、その図が
  // 実データに残っていないことがある。今は一覧のファイル名を読み比べて初めて
  // 「無い」に気付くので、部品を選ぶと図種ごとに「あり (ファイル名) / なし」を
  // 並べ、欠けを周の頭で言い切る。「なし」の行は開くものが無いのだから、
  // ファイル名のボタンも出さない (押せないボタンで探させない)。
  function appendInventorySection(host) {
    var CI = window.MA.componentInventory;
    if (!CI) return;
    // BLK-junior-20260908-2203-wish: 作業ファイルが上書きで消えていても、
    // 提出物庫に積んであれば「あり」に数える (提出済みの図種を赤くしない)。
    var records = CI.build(folderNames, _vaultRows);

    var bar = document.createElement('div');
    bar.className = 'folder-inv-bar';
    var pick = document.createElement('select');
    pick.className = 'folder-inv-pick';
    pick.id = 'folder-inv-pick';
    pick.title = '部品を選ぶと、その部品の図種ごとの有無が出ます';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = records.length ? '部品を選ぶ…' : '部品を判別できる図がありません';
    pick.appendChild(none);
    records.forEach(function(r) {
      var o = document.createElement('option');
      o.value = r.component;
      o.textContent = r.component + '（' + r.have + '/' + r.total + '）';
      pick.appendChild(o);
    });
    // 選び直させない: まだ一度も選んでいなければ、今開いている図の部品を出す。
    if (_invPick === null) {
      var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
      var auto = CI.pickFor(records, doc ? doc.name : '');
      _invPick = auto ? auto.component : '';
    }
    var rec = _invPick ? CI.pick(records, _invPick) : null;
    if (!rec) _invPick = '';
    pick.value = _invPick;
    pick.addEventListener('change', function(ev) {
      ev.stopPropagation();
      _invPick = pick.value;
      renderFolderPanel();
    });
    bar.appendChild(pick);

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'folder-inv-copy';
    copy.id = 'folder-inv-copy';
    copy.textContent = '棚卸しを控える';
    copy.title = '図種ごとの有無の表をクリップボードに写す。周の頭のメモにそのまま貼れます';
    copy.disabled = !rec;
    copy.addEventListener('click', function(ev) {
      ev.stopPropagation();
      if (!rec) return;
      var text = CI.text(rec);
      var done = function() { if (window.MA.toast) window.MA.toast.show(rec.component + ' の棚卸しを控えました'); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
          return;
        }
      } catch (e) {}
      done();
    });
    bar.appendChild(copy);
    host.appendChild(bar);

    var line = document.createElement('div');
    line.className = 'folder-inv-summary ' + CI.summaryClass(rec);
    line.id = 'folder-inv-summary';
    if (rec) {
      line.setAttribute('data-inv-component', rec.component);
      line.setAttribute('data-inv-have', String(rec.have));
      line.setAttribute('data-inv-total', String(rec.total));
      line.setAttribute('data-inv-missing', String(rec.missing.length));
    }
    line.textContent = CI.summary(rec);
    host.appendChild(line);
    if (!rec) return;

    // 8 行は 📂 一覧 (max-height 240px) を食い尽くすので、棚卸しは自前で
    // スクロールする。図の一覧まで下ろすのに 8 行ぶん送らせない。
    var rowsHost = document.createElement('div');
    rowsHost.className = 'folder-inv-rows';
    host.appendChild(rowsHost);

    rec.rows.forEach(function(r) {
      var row = document.createElement('div');
      row.className = 'folder-inv-row ' + (r.present ? 'inv-have' : 'inv-miss');
      row.setAttribute('data-inv-kind', r.kind);
      row.setAttribute('data-inv-present', r.present ? '1' : '0');
      var kind = document.createElement('span');
      kind.className = 'folder-inv-kind';
      kind.textContent = r.kind;
      row.appendChild(kind);
      var mark = document.createElement('span');
      mark.className = 'folder-inv-mark';
      // BLK-junior-20260914-1106: 同じ図種に版が 2 つ以上並ぶ行は、「あり」ではなく
      // 並んでいる版を名指しする (どれが今回の対象かをボタンの文字から読み比べない)。
      mark.textContent = CI.markText(r);
      row.appendChild(mark);
      row.setAttribute('data-inv-variants', CI.variantsOf(r).join('/'));
      row.setAttribute('data-inv-files', String(r.files.length));
      row.setAttribute('data-inv-source', r.source || '');
      // 作業ファイルがもう無く、庫にしか残っていない図種。押せばその提出物を開く。
      // ここでファイル名のボタンだけを出すと、「あり」なのに開けない行になる。
      if (r.vault && r.vault.length) {
        var vb = document.createElement('button');
        vb.type = 'button';
        vb.className = 'folder-inv-vault';
        vb.setAttribute('data-inv-vault-kind', r.kind);
        vb.textContent = '提出物庫 ' + r.vault.length + ' 件';
        vb.title = r.kind + ' の提出物（最新 ' + r.vault[0].label + '）を開く';
        vb.addEventListener('click', function(ev) {
          ev.stopPropagation();
          // 庫の行が持っている綴りをそのまま渡す (棚卸しの部品名は
          // ファイル名から切った形なので、庫の絞り込みに一致しないことがある)。
          _vaultSubject = r.vault[0].subject;
          _vaultKind = r.kind;
          closePanel();
          toggleVault(true);
        });
        row.appendChild(vb);
      }
      r.files.forEach(function(f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'folder-inv-file';
        b.setAttribute('data-inv-file', f);
        b.setAttribute('data-inv-variant', CI.variantLabel(f));
        // 版が並ぶ行では、共通部分の長いファイル名ではなく版そのものを出す。
        b.textContent = CI.fileLabel(r, f);
        // BLK-junior-20260914-1106-wish: そのうち今回の指摘が指す 1 枚を光らせる
        // (版が読めても、今日の対象がどれかは指摘を読まないと決まらない)。
        var hit = noteHitOf(f);
        if (hit) {
          b.classList.add('folder-note-hit');
          b.setAttribute('data-note-hit', hit);
          if (hit === 'target') b.classList.add('folder-note-target');
        }
        b.title = hit === 'target'
          ? '選んでいる指摘が指す版です。押すと開きます: ' + f
          : f + ' を開く';
        b.addEventListener('click', function(ev) {
          ev.stopPropagation();
          openFromFolder(f);
        });
        row.appendChild(b);
      });
      if (_noteHit && _noteHit.kind === r.kind) row.setAttribute('data-note-kind-hit', '1');
      rowsHost.appendChild(row);
    });

    if (rec.unknown.length) {
      var un = document.createElement('div');
      un.className = 'folder-inv-unknown';
      un.id = 'folder-inv-unknown';
      un.textContent = '図種が名前から分からない図: ' + rec.unknown.join(' / ');
      host.appendChild(un);
    }
  }

  // 行ごとの「対象 / 対象にする」。取り直しをせずに 1 枚だけ足す / 外せる。
  function folderTargetButton(name) {
    var TS = window.MA.targetSet;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'folder-target';
    b.setAttribute('data-target-name', name);
    var inSet = TS.has(targetNames, name);
    if (inSet) b.classList.add('folder-target-on');
    b.textContent = TS.rowLabel(inSet);
    b.title = TS.rowTitle(inSet);
    b.addEventListener('click', function(ev) {
      ev.stopPropagation();
      targetNames = TS.toggle(targetNames, name);
      TS.save(_reviewStore(), _wsFileDir(), targetNames);
      renderFolderPanel();
    });
    return b;
  }

  // 一覧の頭に出す 1 行。0 件でも黙らない (「指摘が無い」と「数えていない」は別物)。
  // BLK-junior-20260914-1206-wish: 指摘.md を一覧の側から読み、図 1 枚ずつに
  // 対象外 / ⚠未確認 / ✅対応済み を付ける。手順 1〜2 は「対象外の行は開かず次へ」で
  // 済み、指摘の無い図ごとに自分と先輩の両方を開いて突き合わせる往復が消える。
  function appendNoteSection(host, dir) {
    var NB = window.MA.noteBoard;
    if (!NB) return;
    var line = document.createElement('div');
    line.className = 'folder-note-summary';
    line.id = 'folder-note-summary';
    line.setAttribute('data-note-ready', noteBoardReady ? '1' : '0');
    line.textContent = noteBoardReady
      ? NB.summaryText({ board: noteBoard, names: folderNoteNames(),
                         statusByName: noteBoardStatus, hasNote: noteBoardHasFile })
      : '指摘.md を読み込んでいます…';
    line.title = '指摘.md（隣の reviewer フォルダ）を、図 1 枚ずつに割り当てた結果です';
    host.appendChild(line);
    noteBoardScan(dir);
  }

  function folderNoteNames() { return (folderNames || []).slice(); }

  // 行に付く指摘のバッジ。対象外も出す — 「印が無い」は「まだ読めていない」と
  // 見分けが付かず、開かずに飛ばす根拠にならない。
  function folderNoteBadge(name) {
    var NB = window.MA.noteBoard;
    if (!NB || !noteBoardReady || !noteBoardHasFile) return null;
    var st = noteBoardStatus[name];
    if (!st) return null;
    var el = document.createElement('span');
    el.className = 'folder-note-badge folder-note-' + st.key;
    el.setAttribute('data-note-of', name);
    el.setAttribute('data-note-status', st.key);
    el.textContent = st.mark;
    el.title = st.title;
    return el;
  }

  // 指摘.md と、対象になった図の本文を取り寄せて判定する。
  // 一覧を開くたびに走るが、同じ保存先で一度読めていれば読み直さない。
  function noteBoardScan(dir) {
    var NB = window.MA.noteBoard;
    if (!NB || noteBoardBusy) return;
    if (noteBoardReady && noteBoardDir === dir) return;
    noteBoardBusy = true;
    noteBoardDir = dir;
    var sigAt = noteBoardSig;
    var names = folderNoteNames();
    _ensurePeekDirs()
      .then(function() { return _noteLoad(true); })
      .then(function() {
        noteBoardHasFile = !!_noteFile;
        noteBoard = NB.scan({
          rows: _noteRows, targets: _noteTargets, names: names,
          kindOf: function(n) { return kindByName[n] || ''; },
        });
        noteBoardStatus = NB.statusMap({ board: noteBoard, names: names, dslByName: {},
                                         mineFolder: _noteMineFolder() });
        // 対象の図だけ本文を読む。読めない図があっても残りの判定は出す。
        var WS = window.MA.workspace;
        var want = NB.pendingNames(noteBoard);
        if (!WS || !want.length) return {};
        var bodies = {};
        return Promise.all(want.map(function(n) {
          return WS.loadFile(n, dir).then(function(t) {
            if (typeof t === 'string') bodies[n] = t;
          }, function() {});
        })).then(function() { return bodies; });
      })
      .then(function(bodies) {
        noteBoardStatus = NB.statusMap({ board: noteBoard, names: names,
                                         dslByName: bodies || {}, mineFolder: _noteMineFolder() });
        // 読んでいる間に図が書き換わっていたら、出すのは今の判定ではない。
        // 次の描画で取り直させる (古い ✅ を残すと、直していない図を飛ばす)。
        noteBoardReady = (noteBoardSig === sigAt);
        noteBoardBusy = false;
        try { refreshFolderPanelNow(); } catch (e) {}
      })
      .catch(function() {
        noteBoardHasFile = false;
        noteBoardReady = true;
        noteBoardBusy = false;
        try { refreshFolderPanelNow(); } catch (e) {}
      });
  }

  function appendReviewSection(host) {
    var RS = window.MA.reviewState;
    if (!RS) return;
    var line = document.createElement('div');
    line.className = 'folder-review-summary';
    line.id = 'folder-review-summary';
    line.textContent = RS.summary(reviewStatus);
    host.appendChild(line);
  }

  // 一覧に出ている図の本文を全部読んで「前回見た版」として控える。
  function saveSeenBodies(dir, names) {
    var RD = window.MA.reviewDiff;
    if (!RD || !window.MA.workspace) return Promise.resolve(false);
    var bodies = {};
    var jobs = (names || []).map(function(n) {
      return window.MA.workspace.loadFile(n, dir).then(function(text) {
        if (typeof text === 'string') bodies[n] = text;
      }, function() {});
    });
    return Promise.all(jobs).then(function() {
      var ok = RD.save(_reviewStore(), dir, bodies);
      // 本文と一緒に「そのとき出ていた指摘一覧」と「監査の構え」も控える。
      // 次の review で図が 1 行も変わっていなければ、この一覧をそのまま
      // 今回の指摘として複製できる (BLK-reviewer-20260907-2203-wish)。
      var RC = window.MA.reviewCarry;
      if (RC) {
        RC.save(_reviewStore(), dir, RC.makeRecord(
          RC.collectPins(window.MA.reviewPins, bodies),
          RC.signature(window.MA),
          new Date().toISOString()
        ));
      }
      return ok;
    });
  }

  // 無変更確定 (BLK-reviewer-20260907-2203-wish)。
  // 「変更図 0 枚」を確かめた直後に、前回の指摘一覧をそのまま今回の指摘にする。
  // 図が無変更でも監査ツール側が変わっていれば新しい指摘が出るので、そのときは
  // 複製せずに再突合を促す。
  function appendCarrySection(dir, rows) {
    var RC = window.MA.reviewCarry;
    if (!RC) return;
    var store = _reviewStore();
    var prev = RC.load(store, dir);
    var p = RC.plan(prev, { rows: rows, signature: RC.signature(window.MA) });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-carry';
    btn.setAttribute('data-carry-ok', p.ok ? '1' : '0');
    btn.setAttribute('data-carry-reason', p.reason);
    btn.setAttribute('data-carry-count', String(p.count));
    btn.textContent = '前回の指摘をそのまま今回の指摘にする（' + p.count + ' 件）';
    btn.title = '前回 review 時点から図が 1 行も変わっていないとき、前回の指摘一覧を複製して'
      + '「' + RC.NOTE + '」を 1 行付けて確定する';
    btn.disabled = !p.ok;
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var rec = RC.carry(prev, new Date().toISOString(), RC.signature(window.MA));
      if (!rec) return;
      RC.save(store, dir, rec);
      if (window.MA.toast) window.MA.toast.show('無変更として確定しました（' + RC.statusText(rec) + '）');
      renderFolderPanel();
    });
    panel.appendChild(btn);

    var note = document.createElement('div');
    note.className = 'folder-carry-note' + (p.recheck ? ' recheck' : '');
    note.setAttribute('data-carry-reason', p.reason);
    note.textContent = (prev && prev.carriedFrom && p.ok ? '確定済み: ' + RC.statusText(prev) + ' / ' : '')
      + p.message;
    panel.appendChild(note);
  }

  // 名前で絞り込む欄。数文字打てば候補がその 1 枚になり、Enter でそのまま開ける。
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
      if (ev.key === 'Escape') { ev.stopPropagation(); input.value = ''; folderQuery = ''; applyFolderFilter(); return; }
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
    }
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
    bar.appendChild(folderChangedButton());
    bar.appendChild(folderPendingButton());
    // 一覧は長いと縦にスクロールする。開くボタンを末尾に置くと 14 枚のときに
    // 画面の外へ出るので、印を付ける行の上に固定して常に見えるようにする。
    bar.appendChild(folderOpenButton());
    return bar;
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
    var changed = panel.querySelector('.folder-pick-changed');
    if (changed) {
      var chNames = changedNames();
      changed.textContent = '変更図だけ選ぶ（' + chNames.length + ' 枚）';
      changed.disabled = chNames.length === 0;
    }
    var pending = panel.querySelector('.folder-pick-pending');
    if (pending) {
      var pNames = pendingNames();
      pending.textContent = '未反映だけ選ぶ（' + pNames.length + ' 枚）';
      pending.disabled = pNames.length === 0;
    }
    var open = panel.querySelector('.folder-open-many');
    if (open) {
      open.textContent = FS.openLabel(folderPicked, folderNames, _openDocNames());
      open.disabled = FS.toOpen(folderPicked, folderNames, _openDocNames()).length === 0;
    }
  }

  function folderButton(name, bdg, mtime, status) {
    var b = document.createElement('button');
    b.className = 'folder-item';
    b.setAttribute('data-file-name', name);
    if (status) b.setAttribute('data-review-status', status);
    if (bdg && bdg.mark) {
      var badge = document.createElement('span');
      badge.className = 'folder-badge folder-badge-' + status;
      badge.textContent = bdg.mark;
      badge.title = bdg.title;
      b.appendChild(badge);
    }
    var label = document.createElement('span');
    label.className = 'folder-name';
    label.textContent = name;
    b.appendChild(label);
    // 指摘の反映状態は図名の右に置く。名前の末尾に「(レビュー反映)」を足す
    // 代わりなので、名前の続きとして読める位置でないと読み替えが要る。
    var RS = window.MA.reviewState;
    var rc = RS && reviewStatus[name];
    if (rc && rc.kind !== 'none' && rc.kind !== 'unknown') {
      var rb = document.createElement('span');
      rb.className = 'folder-review-badge review-' + rc.kind;
      rb.setAttribute('data-review-state', rc.kind);
      rb.textContent = RS.badgeText(rc);
      rb.title = RS.badgeTitle(rc);
      b.appendChild(rb);
    }
    // BLK-reviewer-20260908-1103: 印は内容での判定を優先する。mtime が古くても
    // 中身が今の puml と一致している図は読める図なので、印を付けない
    // (逆に、内容がずれている図は mtime に関わらず名指しする)。
    var SF = window.MA.svgFreshness;
    var content = svgContent[name];
    // BLK-reviewer-20260908-2003-wish: 印の無い図 (unverified) もここに出す。
    // 出ていない間、その 1 枚がどれかは行からは分からず、audit.js を回して
    // 突き止めるしかなかった。「未刻印」は作り直しの催促ではなく、
    // 「この一覧では言えない 1 枚」の名指しとして出す。
    if (SF && (content === 'differ' || content === 'format' || content === 'unverified')) {
      var cb = SF.contentBadge(content, svgBasis[name]);
      var contentBadge = document.createElement('span');
      contentBadge.className = 'folder-svg-content-badge';
      contentBadge.setAttribute('data-svg-content', content);
      contentBadge.textContent = cb.mark;
      contentBadge.title = cb.title;
      b.appendChild(contentBadge);
    }
    if (SF && !SF.isSettled(content) && svgStatus[name] && svgStatus[name] !== 'fresh') {
      var sb = SF.badge(svgStatus[name]);
      var svgBadge = document.createElement('span');
      svgBadge.className = 'folder-svg-badge svg-' + svgStatus[name];
      svgBadge.setAttribute('data-svg-status', svgStatus[name]);
      svgBadge.textContent = sb.mark;
      svgBadge.title = sb.title;
      b.appendChild(svgBadge);
    }
    // BLK-reviewer-20260908-0923-wish: 読み始める前に、その 1 枚が今も
    // 書き換えられている最中かどうかが行の上で分かるようにする。
    var WA = window.MA.writeActivity;
    if (WA && writeStatus[name] && writeStatus[name] !== 'settled') {
      var wb = WA.badge(writeStatus[name]);
      var writeBadge = document.createElement('span');
      writeBadge.className = 'folder-write-badge write-' + writeStatus[name];
      writeBadge.setAttribute('data-write-status', writeStatus[name]);
      writeBadge.textContent = wb.mark;
      writeBadge.title = writeStatus[name] === 'active'
        ? wb.title + '（最終更新 ' + WA.ageText(writeAge[name]) + '）'
        : wb.title;
      b.appendChild(writeBadge);
    }
    if (mtime) {
      var t = document.createElement('span');
      t.className = 'folder-mtime';
      t.textContent = mtime;
      t.title = 'puml の最終保存時刻';
      b.appendChild(t);
    }
    // BLK-reviewer-20260908-2003-wish: puml の保存時刻の隣に SVG の書き出し時刻。
    // 「puml は直っているが SVG だけ古い」を、行を見るだけで言えるようにする。
    var RW = window.MA.reviewWatch;
    if (RW && RW.formatMtime) {
      var svgAt = RW.formatMtime(svgMtimes[name]);
      var st = document.createElement('span');
      st.className = 'folder-svg-mtime';
      st.setAttribute('data-svg-mtime', svgAt || '');
      st.textContent = svgAt ? 'SVG ' + svgAt : 'SVG —';
      st.title = svgAt ? 'SVG を書き出した時刻' : 'この図の SVG が保存フォルダにありません';
      b.appendChild(st);
    }
    // BLK-reviewer-20260908-2003-wish (2303/0203 追記): 2 つの時刻の隣に、その SVG の
    // 文字が今の puml と一致しているか。時刻だけでは「保存し直しただけ」と「中身が
    // 追いついていない」が同じ「古い」に見えるので、突合の答えを行に置く。
    var cmp = svgCompare[name];
    if (cmp) {
      var lb = document.createElement('span');
      lb.className = 'folder-svg-labels labels-' + cmp.labels;
      lb.setAttribute('data-svg-labels', cmp.labels);
      lb.setAttribute('data-tone', cmp.tone);
      lb.textContent = cmp.labelsText;
      // 3 つの値は行の上で 1 まとまりとして読む。説明 (title) には 3 つを並べて書く —
      // 幅の狭い行では時刻が省かれることがあるため。
      var SCR2 = window.MA.svgCompareRow;
      lb.title = SCR2 && SCR2.rowTitle ? SCR2.rowTitle(cmp) : cmp.title;
      b.appendChild(lb);
    }
    // BLK-reviewer-20260914-0906-wish: その svg が「どの図の絵か」。
    // 相手が分かる図にだけ出す (分からない図は上の「内容ずれ」のまま)。
    // BLK-reviewer-20260914-1106-wish: この図の遷移ラベル / メッセージ名で
    // クラスに宣言が無いもの。上の束ねた行と同じ答えを行の側にも置く
    // (一覧を絞り込んで読んでいるときに、束ねた行が視界の外へ出るため)。
    var PC3 = window.MA.partCross;
    var pbd = PC3 ? PC3.badge(partCross, name) : null;
    if (pbd) {
      var pb = document.createElement('span');
      pb.className = 'folder-part-cross';
      pb.setAttribute('data-part-cross', pbd.part);
      pb.textContent = pbd.mark;
      pb.title = pbd.title;
      b.appendChild(pb);
    }
    var SX3 = window.MA.svgCross;
    var xrow = SX3 ? SX3.nameOf(svgCross, name) : null;
    if (xrow) {
      var xb = document.createElement('span');
      xb.className = 'folder-svg-cross';
      xb.setAttribute('data-svg-cross', xrow.kind);
      xb.setAttribute('data-svg-cross-of', xrow.of);
      var xbd = SX3.badge(xrow);
      xb.textContent = xbd.mark;
      xb.title = xbd.title;
      b.appendChild(xb);
    }
    if (bdg && bdg.title) b.title = bdg.title + (mtime ? '（最終保存 ' + mtime + '）' : '');
    b.addEventListener('click', function() { openFromFolder(name); });
    return b;
  }

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btnFolder) return;
    closePanel();
  });
}

// ── 変更図の差分ビュー (BLK-reviewer-20260907-1803-wish) ──────────────────
// 一覧の [差分] から開く。前回「見たことにする」で控えた本文を旧版として、
// 保存フォルダの今の本文と左右に並べる。変わっていない行は畳んでおく
// (無変更の行を読み直す作業そのものを無くすのがこの画面の目的)。
var _rdFoldAll = true;
var _rdName = '';
// 一覧のパネルは自前の関数で図を開く。差分ビューからも同じ道で開けるように、
// パネル側で実体を差し込む (パネルを作る前に押される画面は無い)。
var openFromFolderByName = function() {};
// 資料化のように、パネルの外で保存フォルダを書き換える操作から一覧を描き直すための口
// (BLK-junior-20260908-2303-wish)。パネルを開いていなければ何もしない。
var refreshFolderPanelNow = function() {};

function _rdModal() { return document.getElementById('rd-modal'); }

document.addEventListener('keydown', function(ev) {
  if (ev.key !== 'Escape') return;
  var m = _rdModal();
  if (m && m.style.display === 'flex') { closeReviewDiff(); ev.stopPropagation(); }
}, true);

function closeReviewDiff() {
  var m = _rdModal();
  if (m) m.style.display = 'none';
}

function openReviewDiff(name) {
  var m = _rdModal();
  var box = document.getElementById('rd-modal-content');
  var RD = window.MA.reviewDiff;
  if (!m || !box || !RD || !window.MA.workspace) return;
  _rdName = name;
  _rdFoldAll = true;
  m.style.display = 'flex';
  if (!m.getAttribute('data-rd-bound')) {
    m.setAttribute('data-rd-bound', '1');
    m.addEventListener('click', function(ev) { if (ev.target === m) closeReviewDiff(); });
  }
  box.textContent = '';
  var loading = document.createElement('div');
  loading.className = 'rd-note';
  loading.textContent = '読み込み中…';
  box.appendChild(loading);
  var dir = _wsFileDir();
  window.MA.workspace.loadFile(name, dir).then(function(text) {
    var bodies = RD.load(_reviewStore(), dir);
    renderReviewDiff(name, RD.compare(bodies, name, text == null ? '' : text));
  }, function() {
    renderReviewDiff(name, { hasBefore: false, rows: [], stats: null });
  });
}

function renderReviewDiff(name, cmp) {
  var box = document.getElementById('rd-modal-content');
  var RD = window.MA.reviewDiff;
  if (!box || !RD) return;
  box.textContent = '';

  var head = document.createElement('div');
  head.id = 'rd-head';
  var title = document.createElement('span');
  title.className = 'rd-title';
  title.textContent = name;
  head.appendChild(title);
  var stats = document.createElement('span');
  stats.className = 'rd-stats';
  stats.textContent = cmp.hasBefore ? RD.statsText(cmp.stats) : '前回見た版の控えがありません（全部を新しい行として出しています）';
  head.appendChild(stats);
  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'rd-close';
  close.textContent = '閉じる';
  close.addEventListener('click', closeReviewDiff);
  head.appendChild(close);
  box.appendChild(head);

  var list = document.createElement('div');
  list.id = 'rd-list';
  var cols = document.createElement('div');
  cols.className = 'rd-cols';
  var l = document.createElement('span');
  l.textContent = cmp.hasBefore ? '前回見た版' : '（控えなし）';
  var r = document.createElement('span');
  r.textContent = '今の版';
  cols.appendChild(l);
  cols.appendChild(r);
  list.appendChild(cols);

  var rows = _rdFoldAll ? RD.fold(cmp.rows, 2) : cmp.rows;
  if (rows.length === 0) {
    var none = document.createElement('div');
    none.className = 'rd-skip';
    none.textContent = '中身がありません';
    list.appendChild(none);
  }
  rows.forEach(function(row) { list.appendChild(_rdRow(row)); });
  box.appendChild(list);

  var foot = document.createElement('div');
  foot.id = 'rd-foot';
  var note = document.createElement('span');
  note.className = 'rd-note';
  note.textContent = _rdFoldAll
    ? '変わった行の前後 2 行だけ出しています'
    : '同じ行も含めて全部出しています';
  foot.appendChild(note);
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rd-toggle';
  toggle.textContent = _rdFoldAll ? '同じ行も出す' : '変わった行だけにする';
  toggle.addEventListener('click', function() {
    _rdFoldAll = !_rdFoldAll;
    renderReviewDiff(name, cmp);
  });
  foot.appendChild(toggle);
  var open = document.createElement('button');
  open.type = 'button';
  open.className = 'rd-open';
  open.textContent = 'この図を開く';
  open.title = '差分で見た変更をその場で直すときに押す';
  open.addEventListener('click', function() {
    closeReviewDiff();
    openFromFolderByName(name);
  });
  foot.appendChild(open);
  box.appendChild(foot);
}

function _rdRow(row) {
  var el = document.createElement('div');
  if (row.kind === 'skip') {
    el.className = 'rd-skip';
    el.textContent = '… 同じ行 ' + row.count + ' 行';
    return el;
  }
  el.className = 'rd-row rd-row-' + row.kind;
  el.setAttribute('data-rd-kind', row.kind);
  el.appendChild(_rdSide('left', row.leftNo, row.left));
  el.appendChild(_rdSide('right', row.rightNo, row.right));
  return el;
}

function _rdSide(side, no, text) {
  var d = document.createElement('div');
  d.className = 'rd-side rd-side-' + side;
  var n = document.createElement('span');
  n.className = 'rd-no';
  n.textContent = no == null ? '' : String(no);
  var t = document.createElement('span');
  t.className = 'rd-text';
  t.textContent = text == null ? '' : text;
  d.appendChild(n);
  d.appendChild(t);
  return d;
}

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

// BLK-primary-20260907-1903-wish: 置換の前に影響範囲を読む。ヒット数だけでは
// 「この名前を変えると何が壊れるか」が分からず、置換してから全タブを開いて
// 見比べる往復が要った。図種 × 関係の内訳を置換前に出して、その往復を無くす。
function renderRenameImpact(docs, from) {
  var box = document.getElementById('rename-impact');
  var is = window.MA.impactScan;
  if (!box || !is) return;
  box.textContent = '';
  if (!from) return;

  var ov = is.overview(docs, from);
  var head = document.createElement('div');
  head.className = 'impact-head';
  head.id = 'rename-impact-head';
  if (ov.docs === 0) {
    head.textContent = '「' + from + '」の出現なし';
  } else {
    head.textContent = from + ' は ' + ov.docs + ' 図に出現 / ' + ov.summary;
  }
  head.setAttribute('data-docs', String(ov.docs));
  head.setAttribute('data-total', String(ov.total));
  box.appendChild(head);
  if (ov.docs === 0) return;

  var rows = document.createElement('div');
  rows.className = 'impact-rows';
  is.scan(docs, from).forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'impact-doc';
    item.setAttribute('data-doc-name', r.name);
    item.setAttribute('data-kind', r.kind);
    item.setAttribute('data-summary', r.summary);
    var line = document.createElement('div');
    line.className = 'impact-doc-name';
    var n = document.createElement('span');
    n.textContent = r.name;
    var k = document.createElement('span');
    k.className = 'impact-kind';
    k.textContent = r.kindLabel;
    line.appendChild(n);
    line.appendChild(k);
    var roles = document.createElement('div');
    roles.className = 'impact-roles';
    roles.textContent = r.summary;
    item.appendChild(line);
    item.appendChild(roles);
    // BLK-primary-20260907-2003-wish: 内訳だけでは「この図のどの記述が対象か」が
    // 分からず、結局タブを開いて目で探すことになる。出現行そのものを並べ、
    // 押したらその図のその行へキャレットを運ぶ。
    (r.lines || []).forEach(function(h) {
      var hit = document.createElement('div');
      hit.className = 'impact-line';
      hit.setAttribute('data-doc-id', r.id);
      hit.setAttribute('data-line', String(h.line));
      hit.title = r.name + ' の ' + h.line + ' 行目へ移動';
      var no = document.createElement('span');
      no.className = 'impact-line-no';
      no.textContent = String(h.line);
      var tx = document.createElement('span');
      tx.className = 'impact-line-text';
      tx.textContent = h.text.trim();
      hit.appendChild(no);
      hit.appendChild(tx);
      hit.addEventListener('click', function() {
        jumpToDocLine(r.id, h.line);
      });
      item.appendChild(hit);
    });
    rows.appendChild(item);
  });
  box.appendChild(rows);
}

// BLK-primary-20260909-0103-wish: 影響プレビューは行を 1 つの役割に決めるので、
// 「遷移の端点」と「遷移のイベント名」が同じ 1 本になる。壊れ方が違うのに同じ
// 数字では、置換後に開いて確かめる図を絞れない。出現 1 個ずつを意味で呼び分け、
// 役割ごとに参照元の図を並べ、押せばその行へ運ぶ。
function renderRenameSemantic(docs, from) {
  var box = document.getElementById('rename-semantic');
  var SR = window.MA.semanticRefs;
  if (!box || !SR) return;
  box.textContent = '';
  if (!from) return;

  // 影響ボードと同じ図の集合 (開いているタブ + 保存フォルダにしか無い図)。
  // 参照先は開いていない図にこそ残るので、開いているタブだけでは絞り込めない。
  var all = _renameImpactDocs(from);
  var res = SR.collect(all.length ? all : docs, from);
  var head = document.createElement('div');
  head.className = 'sr-head';
  head.id = 'rename-semantic-head';
  head.textContent = res.roles.length === 0
    ? '「' + from + '」を参照している図はありません'
    : from + ' の意味的な参照 ' + res.total + ' 件 / ' + res.roles.length + ' 種類';
  head.setAttribute('data-sr-total', String(res.total));
  head.setAttribute('data-sr-roles', String(res.roles.length));
  head.setAttribute('data-sr-docs', String(res.docs));
  box.appendChild(head);
  if (res.roles.length === 0) return;

  var sent = document.createElement('div');
  sent.className = 'sr-sentence';
  sent.id = 'rename-semantic-sentence';
  sent.textContent = res.sentence;
  box.appendChild(sent);

  var rows = document.createElement('div');
  rows.className = 'sr-rows';
  rows.id = 'rename-semantic-rows';
  res.roles.forEach(function(g) {
    var item = document.createElement('div');
    item.className = 'sr-role';
    item.setAttribute('data-sr-role', g.role);
    item.setAttribute('data-sr-count', String(g.count));
    item.setAttribute('data-sr-docs', g.docs.join(','));
    var line = document.createElement('div');
    line.className = 'sr-role-name';
    var n = document.createElement('span');
    n.textContent = g.label;
    var c = document.createElement('span');
    c.className = 'sr-role-count';
    c.textContent = g.count + ' ' + g.unit + ' / ' + g.docs.length + ' 図';
    line.appendChild(n);
    line.appendChild(c);
    item.appendChild(line);
    g.refs.forEach(function(r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sr-ref';
      b.setAttribute('data-sr-doc', r.docName);
      b.setAttribute('data-sr-line', String(r.line));
      b.title = r.docName + ' (' + r.kindLabel + ') の ' + r.line + ' 行目へ移動';
      var d = document.createElement('span');
      d.className = 'sr-ref-doc';
      d.textContent = r.docName;
      var t = document.createElement('span');
      t.className = 'sr-ref-text';
      t.textContent = r.text.trim();
      b.appendChild(d);
      b.appendChild(t);
      // 開いていない図は、まず開く (開いてからでないと行へは運べない)。
      b.addEventListener('click', function() {
        if (r.docId) jumpToDocLine(r.docId, r.line);
        else openFromFolderByName(r.docName);
      });
      item.appendChild(b);
    });
    rows.appendChild(item);
  });
  box.appendChild(rows);

  // 置換後に開いて確かめるべき図。ノートや題だけの図は挙げない
  // (綴りが変わっても図の意味は変わらないため)。
  var check = SR.docsToCheck(res);
  var foot = document.createElement('div');
  foot.className = 'sr-check';
  foot.id = 'rename-semantic-check';
  foot.setAttribute('data-sr-check', String(check.length));
  foot.textContent = check.length === 0
    ? '置換後に開いて確かめるべき図はありません'
    : '置換後に開いて確かめる図 ' + check.length + ' 枚: '
      + check.map(function(c) { return c.docName + ' (' + c.label + ')'; }).join('、');
  box.appendChild(foot);
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

// BLK-primary-20260907-2003-wish: 「戻り値型を void から StatusType に変える」
// のような仕様変更は、綴りが変わらないので一括置換では当てられない。宣言行が
// 見つかったときだけ、戻り値・引数を 1 回で全図に当てる欄を出す。
function renderSignatureApply(docs, from) {
  var wrap = document.getElementById('rename-signature');
  var SC = window.MA.signatureChange;
  if (!wrap || !SC) return;
  wrap.textContent = '';
  var hits = from ? SC.findAll(docs, from) : [];
  wrap.setAttribute('data-hits', String(hits.length));
  if (hits.length === 0) return;

  var head = document.createElement('div');
  head.className = 'sig-head';
  head.textContent = from + '() の宣言 ' + hits.length + ' 行 / 現在の戻り値: '
    + SC.returnTypes(docs, from).join('・');
  wrap.appendChild(head);

  var row = document.createElement('div');
  row.className = 'sig-row';
  var retLabel = document.createElement('label');
  retLabel.setAttribute('for', 'sig-return');
  retLabel.textContent = '戻り値';
  var ret = document.createElement('input');
  ret.id = 'sig-return';
  ret.autocomplete = 'off';
  ret.spellcheck = false;
  ret.placeholder = 'StatusType';
  ret.value = _sigReturn;
  var parLabel = document.createElement('label');
  parLabel.setAttribute('for', 'sig-params');
  parLabel.textContent = '引数';
  var par = document.createElement('input');
  par.id = 'sig-params';
  par.autocomplete = 'off';
  par.spellcheck = false;
  par.placeholder = '変更しないなら空欄';
  par.value = _sigParams;
  row.appendChild(retLabel);
  row.appendChild(ret);
  row.appendChild(parLabel);
  row.appendChild(par);
  wrap.appendChild(row);

  var preview = document.createElement('div');
  preview.className = 'sig-preview';
  wrap.appendChild(preview);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-sig-apply';
  btn.className = 'sig-apply';
  btn.textContent = 'まとめて適用';
  wrap.appendChild(btn);

  function spec() {
    var s = {};
    if (_sigReturn.trim()) s.returnType = _sigReturn.trim();
    if (_sigParams.trim()) s.params = _sigParams.trim();
    return s;
  }

  function draw() {
    preview.textContent = '';
    var sp = spec();
    var changes = 0;
    if (sp.returnType == null && sp.params == null) {
      var none = document.createElement('div');
      none.className = 'sig-note';
      none.textContent = '新しい戻り値か引数を入れると、当たる行が出ます';
      preview.appendChild(none);
    } else {
      SC.plan(docs, from, sp).forEach(function(p) {
        if (p.status !== 'change') return;
        changes++;
        var line = document.createElement('div');
        line.className = 'sig-line';
        line.setAttribute('data-doc-name', p.docName);
        line.setAttribute('data-line', String(p.line));
        line.textContent = p.docName + ':' + p.line + '  ' + p.before.trim() + ' → ' + p.after.trim();
        preview.appendChild(line);
      });
      if (changes === 0) {
        var same = document.createElement('div');
        same.className = 'sig-note';
        same.textContent = 'すべて既にその形です';
        preview.appendChild(same);
      }
    }
    preview.setAttribute('data-changes', String(changes));
    btn.disabled = changes === 0;
  }

  ret.addEventListener('input', function() { _sigReturn = ret.value; draw(); });
  par.addEventListener('input', function() { _sigParams = par.value; draw(); });
  btn.addEventListener('click', function() { applySignatureChange(from, spec()); });
  draw();
}

var _sigReturn = '';
var _sigParams = '';

// 当てたあとは一括置換と同じ経路で書き戻す (undo 1 手・保存フォルダへの書き出し)。
function applySignatureChange(name, spec) {
  var SC = window.MA.signatureChange;
  if (!SC || !window.MA.workspace) return null;
  var docs = _renameDocs();
  var activeId = window.MA.workspace.getActiveId();
  // 「開いている図すべてに適用」のチェックは一括置換と共通の的を決める。
  if (!(document.getElementById('rename-all-docs') || {}).checked) {
    docs = docs.filter(function(d) { return d.id === activeId; });
  }
  var res = SC.apply(docs, name, spec);
  if (res.changed.length === 0) return res;
  if (window.MA.history) window.MA.history.pushHistory();
  res.changed.forEach(function(c) {
    if (c.id === activeId) {
      mmdText = c.dsl;
      suppressSync = true;
      editorEl.value = c.dsl;
      suppressSync = false;
    }
    window.MA.workspace.updateDoc(c.id, { dsl: c.dsl });
  });
  updateLineNumbers();
  scheduleRefresh();
  renderTabs();
  // 保存フォルダ運用時は、置換が当たった図だけを書き出す (BLK-primary-20260913-0206)。
  writeChangedToFolder(res.changed);
  if (window.MA.toast) {
    try { window.MA.toast.show(res.updated + ' 行 / ' + res.changed.length + ' 枚に適用しました'); } catch (e) {}
  }
  updateRenamePreview();
  return res;
}

// ── 開いていない図も含めた影響範囲 ─────────────────────────────────────────
// BLK-primary-20260908-0723-wish: ヒット数が今開いているタブ分しか出ないので、
// 「仕様変更が全図に及んだか」を確かめるには残りを 1 枚ずつ開き直すしかなかった。
// 保存フォルダを先に全部数え、ヒットした図・しなかった図を一覧で出す。
// 置換もこの一覧の的 (テンプレを除く) にそのまま当てるので、開き直す手順が要らない。
var _fiFileDocs = [];    // 保存フォルダのファイル [{ name, dsl }]
var _fiRoles = {};       // name → { role } (実データ / テンプレの宣言)
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
  return WS.listFolder(dir).then(function(info) {
    var names = ((info && info.entries) || []).map(function(e) {
      return e && typeof e === 'object' ? e.name : e;
    }).filter(function(n) { return n; });
    // BLK-primary-20260912-2103-wish: 変更サマリボードが「基準より後に更新された
    // ファイル」を選ぶのに mtime が要る。一覧と同じ応答に載っているので拾っておく。
    var mtimes = {};
    ((info && info.entries) || []).forEach(function(e) {
      if (e && typeof e === 'object' && e.name) mtimes[e.name] = e.mtime || '';
    });
    var roles = (info && info.roles) || {};
    return Promise.all(names.map(function(n) {
      return WS.loadFile(n, dir).then(function(text) {
        return typeof text === 'string' ? { name: n, dsl: text } : null;
      }, function() { return null; });
    })).then(function(docs) {
      if (seq !== _fiSeq) return false;
      _fiFileDocs = docs.filter(function(d) { return d; });
      _fiFileDocs.forEach(function(d) { d.mtime = mtimes[d.name] || ''; });
      _fiRoles = roles;
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
  var WS = window.MA.workspace;
  var activeId = WS ? WS.getActiveId() : null;
  var open = (WS ? WS.list() : []).map(function(d) {
    return d.id === activeId ? { id: d.id, name: d.name, dsl: mmdText } : d;
  });
  return FI.merge(open, _fiFileDocs, _fiRoles);
}

// ── 改名履歴タイムライン (BLK-primary-20260908-2103-wish) ────────────────────
// 影響プレビューは「今」のヒット数しか出さないので、ヒット 0 件が「置換済みだから 0」
// なのか「元から無いから 0」なのかを区別できず、旧称が残っていないかを確かめるには
// 図を 1 枚ずつ開いて中身を読むしかなかった。置換したときの記録を残し、部品名で
// 引いて「いつ・どの図で・何件」を出す。開くのは名前が挙がった図だけで済む。
function _renameHistoryList() {
  var RH = window.MA.renameHistory;
  return RH ? RH.load(_reviewStore(), _wsFileDir()) : [];
}

// 置換の結果を履歴に足す。開いている図とフォルダ直書きの両方が同じ 1 件になる
// (利用者にとっては 1 回の置換なので、経路の違いで 2 行に割らない)。
function _recordRename(from, to, docs) {
  var RH = window.MA.renameHistory;
  if (!RH || !from || !to) return;
  try {
    RH.record(_reviewStore(), _wsFileDir(), RH.makeEntry(from, to, docs, new Date().toISOString()));
  } catch (e) { /* 履歴が残せなくても置換自体は通す */ }
}

// 置換を当てる直前の本文を、当たった図だけ控える (BLK-primary-20260908-2203-wish)。
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

// ── 保存フォルダへの書き込み履歴 (BLK-primary-20260914-1206-wish) ───────────
// ⇄ 一括置換・🔖 指摘から選ぶの [適用] はタブを開かずに保存フォルダへ書き戻すので、
// 「その図を開いていたセッション」の中でしか残らない変更前の控え (before-snapshot)
// では後から前後を出せない。書き込み操作 1 回ぶんを、当たった図の前後の本文ごと
// 控える。ブラウザを開き直しても、その図を一度も開いていなくても並べられる。
function _recordWrite(kind, meta, pairs) {
  var WH = window.MA.writeHistory;
  if (!WH) return null;
  try {
    var entry = WH.makeEntry(kind, meta, pairs, new Date().toISOString());
    if (!entry) return null;
    WH.record(_reviewStore(), _wsFileDir(), entry);
    if (typeof renderWriteHistory === 'function') renderWriteHistory();
    return entry;
  } catch (e) { return null; }   // 控えが残せなくても書き込み自体は通す
}

// ── 過去の置換の組 (BLK-primary-20260914-1106-friction) ─────────────────────
// ヒット件数は置換前・置換後を打ち終えてからしか出ないので、同じ組を当て直す
// 運用では「もう残っていないこと」を確かめるためだけに毎回打ち直していた。
// パネルを開いた時点で、過去の組と今の残存件数を並べる。残っている組を押せば
// 置換前・置換後がそのまま入る (打鍵ゼロで置換に進める)。
function _renameRedoDocs() {
  return _fiEnabled() ? _fiRows() : _renameDocs();
}

function renderRenameRedo() {
  var box = document.getElementById('rename-redo');
  var RR = window.MA.renameRedo;
  if (!box || !RR) return;
  box.textContent = '';
  var rows = RR.pairs(_renameHistoryList(), _renameRedoDocs());

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

function renderRenameHistory(from) {
  var box = document.getElementById('rename-history');
  var RH = window.MA.renameHistory;
  if (!box || !RH) return;
  box.textContent = '';
  var list = _renameHistoryList();
  var name = String(from == null ? '' : from);
  var rows = name ? RH.forName(list, name) : list;

  var head = document.createElement('div');
  head.className = 'rh-head';
  var label = document.createElement('span');
  label.className = 'rh-head-label';
  label.textContent = '改名履歴';
  head.appendChild(label);
  var copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'rh-copy';
  copy.id = 'btn-rename-history-copy';
  copy.textContent = '控える';
  copy.title = '改名履歴の表をクリップボードに写す。不具合票にそのまま貼れます';
  copy.disabled = !rows.length;
  copy.addEventListener('click', function(ev) {
    ev.stopPropagation();
    var text = RH.text(list, name);
    var done = function() { if (window.MA.toast) window.MA.toast.show('改名履歴を控えました'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
        return;
      }
    } catch (e) {}
    done();
  });
  head.appendChild(copy);
  box.appendChild(head);

  var sum = document.createElement('div');
  sum.className = 'rh-summary ' + RH.summaryClass(list, name);
  sum.id = 'rename-history-summary';
  sum.setAttribute('data-rh-entries', String(rows.length));
  sum.setAttribute('data-rh-docs', String(RH.docNames(rows).length));
  sum.textContent = RH.summary(list, name);
  box.appendChild(sum);
  if (!rows.length) return;

  var host = document.createElement('div');
  host.className = 'rh-rows';
  host.id = 'rename-history-rows';
  rows.forEach(function(e) {
    var entry = document.createElement('div');
    entry.className = 'rh-entry';
    entry.setAttribute('data-rh-from', e.from);
    entry.setAttribute('data-rh-to', e.to);
    var line = document.createElement('div');
    line.className = 'rh-line';
    line.textContent = RH.line(e);
    entry.appendChild(line);
    var docs = document.createElement('div');
    docs.className = 'rh-docs';
    e.docs.forEach(function(d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rh-doc';
      b.setAttribute('data-rh-doc', d.name);
      b.textContent = d.name + ' (' + d.count + ')';
      b.title = d.name + ' を開く（この図で ' + d.count + ' 件 改名しています）';
      b.addEventListener('click', function(ev) {
        ev.stopPropagation();
        openFromFolderByName(d.name);
      });
      docs.appendChild(b);
    });
    entry.appendChild(docs);
    host.appendChild(entry);
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
    row.setAttribute('data-doc-name', r.name);
    row.setAttribute('data-count', String(r.count));
    row.setAttribute('data-open', r.open ? '1' : '0');
    row.setAttribute('data-role', r.role);
    row.setAttribute('data-target', r.target ? '1' : '0');
    var n = document.createElement('span');
    n.className = 'folder-name';
    n.textContent = r.name;
    row.appendChild(n);
    // 「開いている / テンプレ (置換しない)」だけを印にする。未オープンの実データが
    // 無印なのは、それが置換の既定の的だから (印は例外にだけ付ける)。
    if (r.open || r.role === 'template') {
      var tag = document.createElement('span');
      tag.className = 'folder-tag';
      tag.textContent = r.role === 'template' ? 'テンプレ (置換しない)' : '開いている';
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

// 開いていない図のうち、置換の的になるぶん (テンプレとヒット 0 を除く)。
function _fiFolderApply(from) {
  var FI = window.MA.folderImpact;
  var br = window.MA.bulkRename;
  var out = { docs: 0, total: 0 };
  if (!FI || !br || !_fiEnabled() || !from || !window.MA.workspace) return out;
  var openNames = {};
  window.MA.workspace.list().forEach(function(d) { openNames[d.name] = true; });
  FI.applyTargets(FI.merge([], _fiFileDocs, _fiRoles).filter(function(r) {
    return !openNames[r.name];
  }), from).forEach(function(r) {
    out.docs++;
    out.total += br.countIn(r.dsl, from);
  });
  return out;
}

// ── 置換の影響ボード (BLK-primary-20260908-1303-wish) ────────────────────────
// ⇄ 一括置換はヒット件数しか出さないので、「想定外の行に当たっていないか」は
// 適用してからでないと分からず、当たっていれば巻き戻すやり直しが要る。
// 適用する前に、ヒットした図の該当行が置換でどう変わるかを ▤ 変更サマリボードと
// 同じ見た目 (行番号 + 変更前 / 変更後) で並べる。ここでは何も書き換えない。
var _riFull = false;

// ボードに載せる図。開いているタブ (未保存の編集を含む) と、保存フォルダにしか
// 無い図。パネルの「開いている図すべて」を外していれば今の図だけにする。
function _renameImpactDocs(from) {
  var WS = window.MA.workspace;
  var FI = window.MA.folderImpact;
  var docs = [];
  if (WS) {
    var activeId = WS.getActiveId();
    var allDocs = (document.getElementById('rename-all-docs') || {}).checked;
    WS.list().forEach(function(d) {
      if (!allDocs && d.id !== activeId) return;
      docs.push({ id: d.id, name: d.name, dsl: d.id === activeId ? mmdText : d.dsl });
    });
  }
  if (FI && _fiEnabled() && from) {
    var openNames = {};
    docs.forEach(function(d) { openNames[d.name] = true; });
    FI.applyTargets(FI.merge([], _fiFileDocs, _fiRoles).filter(function(r) {
      return !openNames[r.name];
    }), from).forEach(function(r) {
      docs.push({ id: '', name: r.name, dsl: r.dsl, unopened: true });
    });
  }
  return docs;
}

function renderRenameImpactBoard() {
  var br = window.MA.bulkRename;
  var CB = window.MA.changeBoard;
  var body = document.getElementById('ri-body');
  var sumEl = document.getElementById('ri-summary');
  if (!br || !CB || !body) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var from = (document.getElementById('rename-from') || {}).value || '';
  var to = (document.getElementById('rename-to') || {}).value || '';
  var res = br.impact(_renameImpactDocs(from), from, to);

  if (sumEl) sumEl.textContent = br.impactText(res, from, to);
  var applyBtn = document.getElementById('ri-apply');
  var srcApply = document.getElementById('btn-rename-apply');
  if (applyBtn) applyBtn.disabled = !res.valid || res.docs === 0 || !srcApply || srcApply.disabled;

  if (res.docs === 0) {
    body.innerHTML = '<div class="cb-empty">'
      + esc('「' + from + '」に当たる行はありません。置換前の部品名を確かめてください。')
      + '</div>';
    return res;
  }

  var html = '';
  res.entries.forEach(function(e) {
    var df = CB.diffRows(e.before, e.after);
    var rows = _riFull ? df.rows : CB.collapse(df.rows, 2);
    html += '<div class="cb-entry" data-doc-id="' + esc(e.id) + '" data-doc-name="' + esc(e.name) + '">'
      + '<div class="cb-entry-head"><span>' + esc(e.name)
      + (e.unopened ? ' (未オープン)' : '') + '</span>'
      + '<span class="cb-count">' + esc(e.count + ' 件') + '</span></div>'
      + '<div class="cb-cols"><span>今</span><span>置換後</span></div>'
      + '<table class="cb-diff"><tbody>';
    rows.forEach(function(r) {
      if (r.kind === 'gap') {
        html += '<tr class="cb-gap"><td colspan="4">⋯ 同じ行 ' + r.count + ' 行 ⋯</td></tr>';
        return;
      }
      html += '<tr class="cb-' + r.kind + '">'
        + '<td class="cb-no">' + (r.beforeNo || '') + '</td>'
        + '<td class="cb-before">' + esc(r.before == null ? '' : r.before) + '</td>'
        + '<td class="cb-no cb-after">' + (r.afterNo || '') + '</td>'
        + '<td>' + esc(r.after == null ? '' : r.after) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  });
  body.innerHTML = html;
  return res;
}

function toggleRenameImpact(open) {
  var modal = document.getElementById('ri-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  modal.style.display = 'flex';
  renderRenameImpactBoard();
  var body = document.getElementById('ri-body');
  if (body) body.scrollTop = 0;
}

function setupRenameImpact() {
  var btn = document.getElementById('btn-rename-preview');
  var modal = document.getElementById('ri-modal');
  if (!btn || !modal) return;
  btn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    toggleRenameImpact(true);
  });

  var closeBtn = document.getElementById('ri-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleRenameImpact(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleRenameImpact(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleRenameImpact(false);
  });

  var full = document.getElementById('ri-full');
  if (full) full.addEventListener('change', function() {
    _riFull = full.checked;
    renderRenameImpactBoard();
  });

  // 見て納得したらそのまま適用する。置換そのものは一括置換パネルの経路を通す
  // (適用の手順を 2 か所に持たない)。
  var apply = document.getElementById('ri-apply');
  if (apply) apply.addEventListener('click', function() {
    var src = document.getElementById('btn-rename-apply');
    toggleRenameImpact(false);
    if (src && !src.disabled) src.click();
  });
}

// ── 部品名の依存グラフ (BLK-primary-20260908-2003-wish) ──────────────────────
// ▤ 影響を見る はヒットした行を図ごとにテキストで並べるだけなので、
// 「どの図がどの図を参照して連鎖しているか」は各図を開いて目視で推測するしかない。
// 名前を 1 つ選ぶと参照元 (左) → その名前 (中央) → 参照先 (右) が矢印で並び、
// 隣の名前を経由して影響が届く図まで一覧に出る。ここでは何も書き換えない。
var _dgName = '';
var _dgHops = 2;

// グラフに載せる図。開いているタブ (未保存の編集を含む) + 保存フォルダの全ファイル。
// 置換の的と揃えるため、テンプレは除く (中身が変わらないものを連鎖に数えると
// 「直す図」の数が実際より増える)。
function _dgDocs() {
  var FI = window.MA.folderImpact;
  return _fiRows().filter(function(r) {
    return !FI || FI.isTarget(r);
  }).map(function(r) {
    return { id: r.id, name: r.name, dsl: r.dsl };
  });
}

function _dgSvgHtml(view) {
  var DG = window.MA.depGraph;
  var esc = window.MA.htmlUtils.escHtml;
  var lay = DG.layout(view);
  var boxW = 150;
  var boxH = 20;
  var html = '<svg id="dg-svg" width="' + lay.width + '" height="' + lay.height + '" '
    + 'viewBox="0 0 ' + lay.width + ' ' + lay.height + '">'
    + '<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" '
    + 'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
    + '<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" class="dg-arrow-head"/></marker></defs>';
  // 辺を先に引く。あとから箱を重ねると、線の端が名前の下に隠れて向きが読める。
  lay.edges.forEach(function(e) {
    html += '<line class="dg-edge" data-from="' + esc(e.from) + '" data-to="' + esc(e.to) + '" '
      + 'x1="' + (e.x1 + boxW / 2) + '" y1="' + e.y1 + '" '
      + 'x2="' + (e.x2 - boxW / 2) + '" y2="' + e.y2 + '" marker-end="url(#dg-arrow)"/>';
  });
  lay.nodes.forEach(function(n) {
    html += '<g class="dg-node" data-name="' + esc(n.name) + '" data-side="' + esc(n.side) + '">'
      + '<rect class="dg-box" x="' + (n.x - boxW / 2) + '" y="' + (n.y - boxH / 2) + '" '
      + 'width="' + boxW + '" height="' + boxH + '" rx="3"/>'
      + '<text x="' + n.x + '" y="' + (n.y + 4) + '" text-anchor="middle">' + esc(n.name) + '</text>';
    if (n.count) {
      html += '<text class="dg-count" x="' + n.x + '" y="' + (n.y + boxH / 2 + 11) + '" '
        + 'text-anchor="middle">' + n.count + ' 本</text>';
    }
    html += '</g>';
  });
  return html + '</svg>';
}

function _dgImpactHtml(impact) {
  var esc = window.MA.htmlUtils.escHtml;
  var list = impact || [];
  var far = list.filter(function(r) { return r.hop > 0; }).length;
  var html = '<div class="dg-impact-head"><span>影響が届く図</span>'
    + '<span id="dg-impact-count">' + list.length + ' 図 (直接 ' + (list.length - far)
    + ' / 連鎖 ' + far + ')</span></div>';
  if (list.length === 0) {
    return html + '<div class="cb-empty">部品名を選ぶと、その名前から辿れる図が並びます。</div>';
  }
  html += '<table><thead><tr><th>図</th><th>届き方</th><th>経由した部品名</th><th></th></tr></thead><tbody>';
  list.forEach(function(r) {
    html += '<tr class="dg-doc" data-doc="' + esc(r.doc) + '" data-hop="' + r.hop + '">'
      + '<td class="dg-doc-name">' + esc(r.doc) + '</td>'
      + '<td class="dg-hop">' + (r.hop === 0 ? '直接' : '連鎖 ' + r.hop + ' 段') + '</td>'
      + '<td class="dg-via">' + esc((r.via || []).join(', ')) + '</td>'
      + '<td><button type="button" class="dg-open">この図を開く</button></td></tr>';
  });
  return html + '</tbody></table>';
}

function renderDepGraph() {
  var DG = window.MA.depGraph;
  var canvas = document.getElementById('dg-canvas');
  var impactEl = document.getElementById('dg-impact');
  var sel = document.getElementById('dg-name');
  var sumEl = document.getElementById('dg-summary');
  if (!DG || !canvas || !impactEl || !sel) return null;
  var esc = window.MA.htmlUtils.escHtml;

  var graph = DG.build(_dgDocs());
  var names = DG.names(graph);
  // 名前が 1 つも無い = 関係行がまだ書かれていない。空の select を出すより、
  // 「この図の束には辿れる参照が無い」と言い切る方が次の手が決まる。
  if (names.length === 0) {
    sel.innerHTML = '';
    canvas.innerHTML = '<div class="dg-empty">参照の矢印 (A --&gt; B) を持つ図がありません。'
      + '関係を 1 本でも書くと、ここに依存が出ます。</div>';
    impactEl.innerHTML = _dgImpactHtml([]);
    if (sumEl) sumEl.textContent = DG.summaryText(null, []);
    return null;
  }

  if (!_dgName || !graph.nodes[_dgName]) _dgName = names[0].name;
  var opts = '';
  names.forEach(function(n) {
    opts += '<option value="' + esc(n.name) + '"' + (n.name === _dgName ? ' selected' : '') + '>'
      + esc(n.name) + ' (' + n.degree + ' 本 / ' + n.docs.length + ' 図)</option>';
  });
  sel.innerHTML = opts;

  var view = DG.forName(graph, _dgName);
  var impact = DG.impactDocs(graph, _dgName, _dgHops);
  canvas.innerHTML = _dgSvgHtml(view);
  impactEl.innerHTML = _dgImpactHtml(impact);
  if (sumEl) sumEl.textContent = DG.summaryText(view, impact);

  // 中央以外の名前を押すと、そこを起点に読み替える。連鎖を辿るのに
  // select を開き直させると、辿った回数だけクリックが増える。
  var nodes = canvas.querySelectorAll('.dg-node');
  for (var i = 0; i < nodes.length; i++) {
    (function(g) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', function() {
        var nm = g.getAttribute('data-name');
        if (!nm || nm === _dgName) return;
        _dgName = nm;
        renderDepGraph();
      });
    })(nodes[i]);
  }
  var opens = impactEl.querySelectorAll('.dg-open');
  for (var j = 0; j < opens.length; j++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var row = btn.parentNode.parentNode;
        toggleDepGraph(false);
        openFromFolderByName(row.getAttribute('data-doc'));
      });
    })(opens[j]);
  }
  return { graph: graph, view: view, impact: impact };
}

function toggleDepGraph(open) {
  var modal = document.getElementById('dg-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  // 置換前に打った名前をそのまま起点にする (打ち直させない)。
  var from = (document.getElementById('rename-from') || {}).value || '';
  if (from) _dgName = from;
  modal.style.display = 'flex';
  renderDepGraph();
  var body = document.getElementById('dg-body');
  if (body) body.scrollTop = 0;
}

function setupDepGraph() {
  var btn = document.getElementById('btn-rename-depgraph');
  var modal = document.getElementById('dg-modal');
  if (!btn || !modal) return;
  btn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    // 保存フォルダぶんが未読なら読んでから出す。開いているタブだけのグラフでは
    // 「開いていない図への連鎖」がそのまま抜け落ちる。
    if (_fiEnabled()) loadFolderImpact().then(function() { toggleDepGraph(true); });
    else toggleDepGraph(true);
  });

  var closeBtn = document.getElementById('dg-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleDepGraph(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleDepGraph(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleDepGraph(false);
  });

  var sel = document.getElementById('dg-name');
  if (sel) sel.addEventListener('change', function() { _dgName = sel.value; renderDepGraph(); });
  var hops = document.getElementById('dg-hops');
  if (hops) hops.addEventListener('change', function() {
    _dgHops = parseInt(hops.value, 10);
    if (isNaN(_dgHops)) _dgHops = 2;
    renderDepGraph();
  });

  // 見た名前をそのまま置換の的にする。グラフから一括置換へ戻る手が
  // 「読んで覚えて打ち直す」では、見落としを防ぐ意味が薄れる。
  // 見た影響一覧をその場で札にする。閉じてから開き直させると、
  // 「一度きりの一覧が消える」という元の困り事がそのまま残る。
  var ticket = document.getElementById('dg-ticket');
  if (ticket) ticket.addEventListener('click', function() {
    makeTicketFromDepGraph().then(function(t) {
      if (!t) return;
      toggleDepGraph(false);
      toggleTicketBoard(true);
    });
  });

  var use = document.getElementById('dg-use');
  if (use) use.addEventListener('click', function() {
    var from = document.getElementById('rename-from');
    if (from && _dgName) {
      from.value = _dgName;
      from.dispatchEvent(new Event('input'));
    }
    toggleDepGraph(false);
  });
}

// ── 変更チケット (BLK-primary-20260909-0603-wish) ────────────────────────────
// 依存グラフの影響一覧は一度きりで、モーダルを閉じると消える。仕様変更は数日・
// 複数 run にまたがるので、「15 枚のうちどこまで直したか」を持ち越す先が要る。
// 影響一覧を札にして保存フォルダ (`_tickets/`) に置き、次の run は札の未チェック
// だけを見る。ペルソナをまたぐので localStorage ではなく server に置く
// (reviewer も同じ札を読める = 指摘.md への転記が要らない)。
var _ctRows = [];
var _ctDir = null;
var _ctId = '';
var _ctLoading = false;

function loadTickets(force) {
  if (!_fiFolderMode()) { _ctRows = []; _ctDir = null; return Promise.resolve([]); }
  var dir = _wsFileDir();
  if (!force && _ctDir === dir && !_ctLoading) return Promise.resolve(_ctRows);
  _ctLoading = true;
  return window.fetch('/tickets?dir=' + encodeURIComponent(dir))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      _ctRows = window.MA.changeTicket ? window.MA.changeTicket.rows(data) : [];
      _ctDir = dir;
      _ctLoading = false;
      return _ctRows;
    }, function() {
      // 読めなくても「読んだ」ことにする (読み直しが毎描画で走り続けるのを避ける)。
      _ctDir = dir;
      _ctLoading = false;
      return _ctRows;
    });
}

// 札を 1 枚まるごと書く。手元の一覧も同じ札で差し替える (書いてから読み直すと、
// チェックを 1 個入れるたびに全件の往復が要る)。
function saveTicket(ticket) {
  var CT = window.MA.changeTicket;
  if (!CT || !ticket || !_fiFolderMode()) return Promise.resolve(null);
  return window.fetch('/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir: _wsFileDir(), ticket: ticket }),
  }).then(function(r) { return r.ok ? r.json() : null; })
    .then(function(res) {
      if (!res) return null;
      var next = _ctRows.filter(function(t) { return t.id !== ticket.id; });
      next.push(CT.normalize(ticket));
      _ctRows = CT.rows({ tickets: next });
      return res;
    }, function() { return null; });
}

function deleteTicket(id) {
  if (!id || !_fiFolderMode()) return Promise.resolve(null);
  var url = '/tickets?dir=' + encodeURIComponent(_wsFileDir()) + '&id=' + encodeURIComponent(id);
  return window.fetch(url, { method: 'DELETE' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(res) {
      _ctRows = _ctRows.filter(function(t) { return t.id !== id; });
      if (_ctId === id) _ctId = '';
      return res;
    }, function() { return null; });
}

// 今の依存グラフの影響一覧を札にする。中央の名前がそのまま変更の主題。
function makeTicketFromDepGraph() {
  var CT = window.MA.changeTicket;
  var DG = window.MA.depGraph;
  if (!CT || !DG || !_dgName) return Promise.resolve(null);
  if (!_fiFolderMode()) {
    if (window.MA.toast) {
      window.MA.toast.show('変更チケットは保存フォルダ運用のときだけ残せます（設定で保存先をフォルダにしてください）');
    }
    return Promise.resolve(null);
  }
  var graph = DG.build(_dgDocs());
  var impact = DG.impactDocs(graph, _dgName, _dgHops);
  if (!impact.length) return Promise.resolve(null);
  var ticket = CT.fromImpact(_dgName, impact, { hops: _dgHops });
  return saveTicket(ticket).then(function(res) {
    if (!res) return null;
    _ctId = ticket.id;
    if (window.MA.toast) {
      window.MA.toast.show('変更チケットにしました（' + ticket.title + ' / '
        + impact.length + ' 図）。次からは「変更チケット」を開けば続きから直せます');
    }
    return ticket;
  });
}

function _ctCurrent() {
  var CT = window.MA.changeTicket;
  if (!CT) return null;
  return CT.find(_ctRows, _ctId) || _ctRows[0] || null;
}

function _ctItemsHtml(ticket) {
  var CT = window.MA.changeTicket;
  var esc = window.MA.htmlUtils.escHtml;
  var items = (ticket && ticket.items) || [];
  if (!items.length) return '<div class="ct-empty">この札には対象の図がありません。</div>';
  var p = CT.progress(ticket);
  var pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  var html = '<div id="ct-progress"><span id="ct-progress-text">' + esc(CT.progressText(ticket))
    + '</span><span class="ct-bar"><i style="width:' + pct + '%"></i></span>'
    + '<span class="ct-note">起票 ' + esc((ticket.at || '').slice(0, 16).replace('T', ' ')) + '</span></div>';
  html += '<table class="ct-table"><thead><tr><th>直した</th><th>図</th><th>届き方</th>'
    + '<th>経由した部品名</th><th></th></tr></thead><tbody>';
  items.forEach(function(it) {
    html += '<tr class="ct-item" data-doc="' + esc(it.doc) + '" data-hop="' + it.hop + '" '
      + 'data-done="' + (it.done ? 1 : 0) + '" data-gone="' + (it.gone ? 1 : 0) + '">'
      + '<td><input type="checkbox" class="ct-done" ' + (it.done ? 'checked' : '')
      + ' aria-label="' + esc(it.doc) + ' を直した"></td>'
      + '<td class="ct-doc-name">' + esc(it.doc) + '</td>'
      + '<td class="ct-hop">' + (it.hop === 0 ? '直接' : '連鎖 ' + it.hop + ' 段') + '</td>'
      + '<td class="ct-via">' + esc((it.via || []).join(', ')) + '</td>'
      + '<td><button type="button" class="ct-open">この図を開く</button></td></tr>';
  });
  return html + '</tbody></table>';
}

function renderTicketBoard() {
  var CT = window.MA.changeTicket;
  var body = document.getElementById('ct-body');
  var pick = document.getElementById('ct-pick');
  var sumEl = document.getElementById('ct-summary');
  if (!CT || !body || !pick) return null;
  var esc = window.MA.htmlUtils.escHtml;

  if (!_ctRows.length) {
    pick.innerHTML = '';
    body.innerHTML = '<div class="ct-empty">変更チケットはまだありません。'
      + '⇄ 一括置換 の ◈ 依存グラフ で影響を出し、「この変更をチケットにする」で残せます。</div>';
    if (sumEl) sumEl.textContent = CT.listText(_ctRows);
    return null;
  }

  var cur = _ctCurrent();
  _ctId = cur ? cur.id : '';
  var opts = '';
  _ctRows.forEach(function(t) {
    var p = CT.progress(t);
    opts += '<option value="' + esc(t.id) + '"' + (t.id === _ctId ? ' selected' : '') + '>'
      + esc(t.title) + ' (' + p.done + '/' + p.total + ')</option>';
  });
  pick.innerHTML = opts;
  body.innerHTML = _ctItemsHtml(cur);
  if (sumEl) sumEl.textContent = CT.summaryText(cur) + ' — ' + CT.listText(_ctRows);

  var boxes = body.querySelectorAll('input.ct-done');
  for (var i = 0; i < boxes.length; i++) {
    (function(box) {
      box.addEventListener('change', function() {
        var row = box.parentNode.parentNode;
        var next = CT.setDone(_ctCurrent(), row.getAttribute('data-doc'), box.checked);
        if (!next) return;
        saveTicket(next).then(function() { renderTicketBoard(); });
      });
    })(boxes[i]);
  }
  var opens = body.querySelectorAll('button.ct-open');
  for (var j = 0; j < opens.length; j++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var row = btn.parentNode.parentNode;
        toggleTicketBoard(false);
        openFromFolderByName(row.getAttribute('data-doc'));
      });
    })(opens[j]);
  }
  return cur;
}

function toggleTicketBoard(open) {
  var modal = document.getElementById('ct-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  modal.style.display = 'flex';
  renderTicketBoard();
  loadTickets().then(function() { renderTicketBoard(); });
}

function setupTicketBoard() {
  var modal = document.getElementById('ct-modal');
  if (!modal) return;
  var closeBtn = document.getElementById('ct-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleTicketBoard(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleTicketBoard(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleTicketBoard(false);
  });

  var pick = document.getElementById('ct-pick');
  if (pick) pick.addEventListener('change', function() { _ctId = pick.value; renderTicketBoard(); });

  // 洗い直し。図が増減しても札を作り直させない (直した印が消えるため)。
  var refresh = document.getElementById('ct-refresh');
  if (refresh) refresh.addEventListener('click', function() {
    var CT = window.MA.changeTicket;
    var DG = window.MA.depGraph;
    var cur = _ctCurrent();
    if (!CT || !DG || !cur) return;
    var run = function() {
      var graph = DG.build(_dgDocs());
      var hops = (typeof cur.hops === 'number') ? cur.hops : 2;
      var next = CT.refresh(cur, DG.impactDocs(graph, cur.subject, hops));
      saveTicket(next).then(function() { renderTicketBoard(); });
    };
    if (_fiEnabled()) loadFolderImpact(true).then(run);
    else run();
  });

  var del = document.getElementById('ct-delete');
  if (del) del.addEventListener('click', function() {
    var cur = _ctCurrent();
    if (!cur) return;
    deleteTicket(cur.id).then(function() { renderTicketBoard(); });
  });
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
  var openNames = {};
  WS.list().forEach(function(d) { openNames[d.name] = true; });
  var rows = FI.merge([], _fiFileDocs, _fiRoles).filter(function(r) { return !openNames[r.name]; });
  var targets = FI.applyTargets(rows, from);
  if (targets.length === 0) return Promise.resolve(empty);
  var res = { docs: 0, total: 0, failed: 0, rows: [] };
  return Promise.all(targets.map(function(r) {
    var next = br.replaceIn(r.dsl, from, to);
    var n = br.countIn(r.dsl, from);
    return WS.saveToFile({ name: r.name, dsl: next }, dir).then(function(ok) {
      if (!ok) { res.failed++; return; }
      res.docs++;
      res.total += n;
      res.rows.push({ name: r.name, count: n, before: r.dsl, after: next });
      // 読み込み済みの控えも進めておく。次のプレビューが古い本文を数えないように。
      _fiFileDocs.forEach(function(d) { if (d.name === r.name) d.dsl = next; });
      // BLK-primary-20260914-1206: 書いた後を基準にすると「変更なし」になり、
      // 後から開いたときに直した前後が出せない。基準がまだ無い図は書く **前** を
      // 基準にする (この置換がそのまま ± 差分として読める)。
      if (window.MA.saveDiff) { try { window.MA.saveDiff.markIfAbsent(r.name, r.dsl); } catch (e) {} }
    });
  })).then(function() { return res; });
}

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
  var total = 0;
  rows.forEach(function(r) {
    total += r.count;
    var row = document.createElement('div');
    row.className = 'hit' + (r.count === 0 ? ' zero' : '');
    row.setAttribute('data-doc-name', r.name);
    var n = document.createElement('span');
    n.textContent = r.name;
    var c = document.createElement('span');
    c.className = 'hit-count';
    c.textContent = r.count + ' 件';
    row.appendChild(n);
    row.appendChild(c);
    hits.appendChild(row);
  });

  renderRenameImpact(docs, from);
  renderRenameSemantic(docs, from);
  renderSignatureApply(docs, from);
  renderRenameFolder();
  renderRenameHistory(from);
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
      + (folder.docs > 0 ? ' (うち未オープン ' + folder.docs + ' 枚)' : '');
  }
  summary.setAttribute('data-total', String(total));
  summary.setAttribute('data-grand-total', String(grand));
  summary.setAttribute('data-unopened-docs', String(folder.docs));
  applyBtn.disabled = !ok;
  // 「▤ 影響を見る」は置換後の名前がまだでも押せる。どの行に当たっているかを
  // 先に確かめてから置換後を決める、という順序を塞がないため。
  var prevBtn = document.getElementById('btn-rename-preview');
  if (prevBtn) prevBtn.disabled = !from || grand === 0;
}

// 置換前・置換後を決めたあとの共通処理。一括置換パネルと名前突合の
// 「統一」ボタンが同じ経路を通るようにここへ出す。
function renameAcrossDocs(from, to, docs) {
  var br = window.MA.bulkRename;
  if (!br || !window.MA.workspace) return null;
  var activeId = window.MA.workspace.getActiveId();

  var res = br.apply(docs, from, to);
  if (res.changed.length === 0) return res;

  // BLK-primary-20260908-2203-wish: 当てる前の本文を図ごとに控える。
  // レビュー会議で「置換前はこうで、今はこうです」を 1 画面に並べられるように
  // する (Ctrl+Z で戻すと変更後が消えるので、往復では見せられない)。
  _captureBeforeRename(from, to, docs, res.changed);

  // 前後の組を res に添える。保存フォルダへ書いた回として控えるのは呼び出し側
  // (開いている図とフォルダ直書きを 1 回の置換として 1 件にまとめるため)。
  var _before = {};
  (docs || []).forEach(function(d) { if (d && d.id != null) _before[d.id] = String(d.dsl == null ? '' : d.dsl); });
  res.pairs = res.changed.map(function(c) {
    return { name: c.name, before: _before[c.id] || '', after: String(c.dsl == null ? '' : c.dsl) };
  });

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
    if (d.name === from && br.isValidTarget(to)) window.MA.workspace.rename(d.id, to);
  });

  if (window.MA.selection) window.MA.selection.clearSelection();
  updateLineNumbers();
  scheduleRefresh();
  renderTabs();
  // 保存フォルダ運用時は、置換が当たった図だけを書き出す (BLK-primary-20260913-0206)。
  writeChangedToFolder(res.changed);
  return res;
}

// BLK-primary-20260913-0206-wish: 略語辞書の「表を確定」。複数の組を 1 回で当てる。
// 1 組ずつ renameAcrossDocs を呼ぶと undo が組の数だけ積まれ、戻すのに略語の数だけ
// Ctrl+Z を押すことになる (確定が 1 操作でなくなる)。
function renameGlossaryPairs(pairs) {
  var br = window.MA.bulkRename;
  var WS = window.MA.workspace;
  if (!br || !WS || !Array.isArray(pairs) || !pairs.length) return { total: 0, docs: 0 };
  var activeId = WS.getActiveId();
  var next = [];
  var total = 0;
  _renameDocs().forEach(function(d) {
    var dsl = String(d.dsl == null ? '' : d.dsl);
    var n = 0;
    pairs.forEach(function(p) {
      var c = br.countIn(dsl, p.from);
      if (!c) return;
      n += c;
      dsl = br.replaceIn(dsl, p.from, p.to);
    });
    if (n > 0) { next.push({ id: d.id, dsl: dsl }); total += n; }
  });
  if (!next.length) return { total: 0, docs: 0 };

  // 確定も保存フォルダへ書き戻す操作なので、前後を 1 件として控える。
  var _gBefore = {};
  _renameDocs().forEach(function(d) { if (d && d.id != null) _gBefore[d.id] = String(d.dsl == null ? '' : d.dsl); });
  _recordWrite('glossary', { note: pairs.length + ' 組' }, next.map(function(c) {
    var d = null;
    WS.list().forEach(function(x) { if (x.id === c.id) d = x; });
    return { name: d ? d.name : '', before: _gBefore[c.id] || '', after: c.dsl };
  }));

  if (window.MA.history) window.MA.history.pushHistory();
  next.forEach(function(c) {
    if (c.id === activeId) {
      mmdText = c.dsl;
      suppressSync = true;
      editorEl.value = mmdText;
      suppressSync = false;
    }
    WS.updateDoc(c.id, { dsl: c.dsl });
  });
  // タブ名自体が略語なら追随させる (SpiDrv.puml → Spi_Driver.puml)。
  WS.list().forEach(function(d) {
    pairs.forEach(function(p) {
      if (d.name === p.from && br.isValidTarget(p.to)) WS.rename(d.id, p.to);
    });
  });
  if (window.MA.selection) window.MA.selection.clearSelection();
  updateLineNumbers();
  scheduleRefresh();
  renderTabs();
  // 当てた図だけを書き戻す (BLK-primary-20260913-0206 と同じ後始末)。
  writeChangedToFolder(next);
  return { total: total, docs: next.length };
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

// ── テンプレートから新規作成 ───────────────────────────────────────────────
// BLK-junior-20260907-0803-wish: 同じ構成の図をもう 1 枚作るとき、今までは
// 元の図を開いて構造を覚え、新しいタブでゼロから打ち直していた (模写)。
// 「元の図 + 置換元語 + 置換先語」を選ぶだけで新しいタブが出来るようにする。
// 置換結果は確定前に行単位で見せるので、写し間違いが起きる余地がない。
// 覗いた図など、外から渡されたテンプレートで新規作成の画面を開くための入口。
// setupTemplateNew の中の open をここに預ける。
var _openTemplateNew = null;

function setupTemplateNew() {
  var btn = document.getElementById('btn-tab-template');
  var modal = document.getElementById('tpl-modal');
  var content = document.getElementById('tpl-modal-content');
  var TN = window.MA.templateNew;
  var TM = window.MA.templateMap;
  if (!btn || !modal || !content || !TN || !TM) return;

  var esc = window.MA.htmlUtils.escHtml;
  var docs = [];          // [{ id, name, dsl }] 開いているタブ
  var files = [];         // 保存フォルダのファイル名
  var fileCache = {};     // name → dsl (読み込み済み)
  // 他のフォルダから覗いた 1 枚 (BLK-junior-20260909-0503-wish)。
  // 自分の保存フォルダには無いので、渡された本文をそのまま材料にする。
  var seedTpl = null;

  var LABEL = 'display:block;font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 3px 0;';
  var FIELD = 'width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);'
    + 'font-family:var(--font-mono);font-size:12px;padding:4px 6px;border-radius:3px;';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);'
    + 'border-radius:3px;cursor:pointer;padding:4px 12px;font-size:12px;';

  function close() { modal.style.display = 'none'; }

  function templateOptions() {
    var html = '';
    // 覗いてきた図は「これを写したい」と決めて来ているので先頭に置く。
    if (seedTpl) {
      html += '<option value="' + esc(seedTpl.value) + '">' + esc(seedTpl.label) + '</option>';
    }
    docs.forEach(function(d) {
      html += '<option value="doc:' + esc(d.id) + '">' + esc(d.name) + ' (開いている図)</option>';
    });
    files.forEach(function(name) {
      html += '<option value="file:' + esc(name) + '">' + esc(name) + ' (保存フォルダ)</option>';
    });
    // BLK-junior-20260907-0703: その図種の図がまだ 1 枚も無いときの写す元。
    // 既にある図が既定なのは変えず、末尾に置く。今の図種の雛形が group の先頭に来る。
    var bi = TN.builtins(currentDiagramType);
    if (bi.length) {
      html += '<optgroup label="組み込みの雛形">';
      bi.forEach(function(b) {
        html += '<option value="builtin:' + esc(b.id) + '">' + esc(b.label) + '</option>';
      });
      html += '</optgroup>';
    }
    return html;
  }

  // 選ばれているテンプレートの DSL。フォルダのファイルはまだ読んでいない
  // ことがあるので null を返し、呼び出し側が読み込んでからやり直す。
  function currentTemplate() {
    var sel = document.getElementById('tpl-source');
    var v = sel ? sel.value : '';
    if (v.indexOf('doc:') === 0) {
      var id = v.slice(4);
      for (var i = 0; i < docs.length; i++) {
        if (String(docs[i].id) === id) return { name: docs[i].name, dsl: docs[i].dsl };
      }
      return null;
    }
    if (v.indexOf('file:') === 0) {
      var name = v.slice(5);
      if (fileCache[name] == null) return null;
      return { name: name, dsl: fileCache[name] };
    }
    if (seedTpl && v === seedTpl.value) {
      return { name: seedTpl.name, dsl: seedTpl.dsl };
    }
    if (v.indexOf('builtin:') === 0) {
      var b = TN.builtin(v.slice(8));
      if (!b) return null;
      // placeholder があるので、置換元は打たずに決まる。
      return { name: b.name, dsl: b.dsl, placeholder: b.placeholder };
    }
    return null;
  }

  function fillCandidates(dsl) {
    var dl = document.getElementById('tpl-candidates');
    if (!dl) return;
    dl.textContent = '';
    TN.candidates(dsl).slice(0, 20).forEach(function(c) {
      var o = document.createElement('option');
      o.value = c.name;
      o.label = c.name + ' (' + c.count + ' 箇所)';
      dl.appendChild(o);
    });
  }

  // BLK-primary-20260907-0803-wish: 1 語目の置換のあとに元の系統の名前が
  // 残っていたら、それを片付けるまで確定させない。今までは複製した図に
  // Spi_Driver が残ったまま提出され、同じ指摘をレビューで何度も受けていた。
  // 残った名前ごとに「新しい名前」を入れるか、「そのままで良い」を
  // 明示的に選ぶかのどちらかを必ず通す。
  // BLK-junior-20260907-0943-wish: 先輩の図の流用は「⧉ 取り込み」と「⇄ 一括置換」を
  // 手で組み合わせるしかなく、2 操作の間に無関係な宣言行まで壊れる余地があった。
  // テンプレートに宣言されている部品を全部この表に並べ、それぞれの新しい名前を
  // 1 画面で埋めてから複製する。表からの置換は文字列一致ではなく
  // 「宣言済みの部品名の付け替え」(template-map) として当てるので、
  // 置換元の名前を含まない行が巻き込まれることが原理的に起きない。
  var mapRows = [];        // [{ from, base, to, resolved }] from は元の図での名前

  function _headPair() {
    return {
      from: (document.getElementById('tpl-from') || {}).value.trim(),
      to: (document.getElementById('tpl-to') || {}).value.trim(),
    };
  }

  // 系統の置換 (Uart → Gpio、UART → GPIO …) を 1 語に当てた結果。
  function _afterHead(name) {
    var p = _headPair();
    return (p.from && p.to) ? TN.instantiate(name, p.from, p.to) : name;
  }

  function _rowInput(name) {
    return document.querySelector('[data-map-input="' + name + '"]');
  }

  function isKept(name) {
    var el = document.querySelector('[data-remaining-keep="' + name + '"]');
    return !!(el && el.checked);
  }

  // 対応表の今の中身。base は系統の置換のあとの名前 (構造置換の置換元)。
  function currentRows() {
    return mapRows.map(function(r) {
      var el = _rowInput(r.from);
      return {
        from: r.from,
        base: r.base,
        to: el ? el.value.trim() : r.to,
        keep: isKept(r.from),
        resolved: r.resolved,
      };
    });
  }

  // 系統の置換で決まらず、表も空で、「このままで良い」も付いていない部品。
  function unresolved() {
    return currentRows().filter(function(r) {
      return !r.resolved && !r.to && !r.keep;
    }).map(function(r) { return { name: r.from }; });
  }

  // 表のうち構造置換に回す組。系統の置換で既に付いた名前を置換元にする。
  function structuralRows() {
    return currentRows().filter(function(r) {
      return !r.keep && r.to && r.to !== r.base;
    }).map(function(r) { return { from: r.base, to: r.to }; });
  }

  // テンプレート → 新しい図の DSL。系統の置換を先に当て、
  // 残りを対応表で構造的に付け替える。
  function buildResult(dsl) {
    var p = _headPair();
    var text = (p.from && p.to) ? TN.instantiate(dsl, p.from, p.to) : dsl;
    return TM ? TM.apply(text, structuralRows()) : text;
  }

  // 対応表を作り直す。系統の置換が変わったときだけ呼ぶ
  // (入力のたびに作り直すと打っている最中にフォーカスが飛ぶため)。
  function rebuildRemaining() {
    var tpl = currentTemplate();
    var box = document.getElementById('tpl-remaining');
    var head = document.getElementById('tpl-remaining-head');
    if (!box || !head || !TM) return;
    // 打ちかけの入力は作り直しでも残す
    var typed = {};
    currentRows().forEach(function(r) { if (r.to && !r.resolved) typed[r.from] = r.to; });

    mapRows = tpl ? TM.mapRows(tpl.dsl, _afterHead).map(function(r) {
      return {
        from: r.from, base: _afterHead(r.from), kind: r.kind,
        to: r.resolved ? r.to : (typed[r.from] || ''), resolved: r.resolved,
      };
    }) : [];

    var left = mapRows.filter(function(r) { return !r.resolved && !r.to && !isKept(r.from); });
    head.setAttribute('data-remaining', String(left.length));
    head.setAttribute('data-map-rows', String(mapRows.length));
    if (!mapRows.length) {
      head.textContent = '元の系統の部品名は残っていません';
      box.innerHTML = '';
      return;
    }
    head.textContent = left.length
      ? ('まだ元の名前のままの部品が ' + left.length
         + ' 件あります。新しい名前を入れるか「このままで良い」を選んでください')
      : '元の系統の部品名は残っていません';

    var html = '';
    mapRows.forEach(function(r) {
      var pending = !r.resolved && !r.to;
      html += '<div class="tpl-map-row' + (pending ? ' tpl-remaining-row' : '')
        + '" data-map-from="' + esc(r.from) + '" data-map-state="'
        + (r.resolved ? 'auto' : (r.to ? 'filled' : 'pending')) + '"'
        + ' style="display:flex;align-items:center;gap:8px;'
        + 'padding:3px 4px;border-bottom:1px solid var(--border);">'
        + '<span style="font-family:var(--font-mono);font-size:11px;min-width:150px;color:'
        + (pending ? 'var(--accent-orange)' : 'var(--text-secondary)') + ';">'
        + esc(r.from) + '</span>'
        + '<span style="color:var(--text-secondary);font-size:11px;">→</span>'
        + '<input data-map-input="' + esc(r.from) + '"'
        + (pending ? ' data-remaining-input="' + esc(r.from) + '"' : '')
        + ' value="' + esc(r.to) + '" autocomplete="off" spellcheck="false" '
        + 'placeholder="新しい名前" style="' + FIELD + 'flex:1;">'
        + '<label style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">'
        + '<input type="checkbox" data-remaining-keep="' + esc(r.from) + '" style="width:auto;"'
        + (isKept(r.from) ? ' checked' : '') + '> '
        + 'このままで良い</label>'
        + '</div>';
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('[data-map-input]'), function(el) {
      el.addEventListener('input', updatePreview);
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-remaining-keep]'), function(el) {
      el.addEventListener('change', updatePreview);
    });
  }

  // BLK-primary-20260907-1203-wish: 作る前に、これから作る図の名前がクラスの宣言と
  // 噛み合うかをその場で突き合わせる。複製は接頭辞の置換なので、置換しただけでは
  // 意味の合わない名前 (Adc 由来の conv 系を Timer に付け替えたもの) がそのまま残る。
  // 押してから「🔍 名前突合」で見つけるのでは、次の run まで気づけない。
  //
  // 作れなくはしない。テンプレートより先にクラス図を書き足す順序もあるので、
  // 赤い警告を出して判断は利用者に残す (design の「常時表示 / その他」と同じ考え方)。
  function updateAudit(result, tpl) {
    var TA = window.MA.templateAudit;
    var head = document.getElementById('tpl-audit-head');
    var box = document.getElementById('tpl-audit');
    if (!TA || !head || !box) return;

    var nameEl = document.getElementById('tpl-name');
    var name = nameEl ? nameEl.value.trim() : '';
    var others = docs.filter(function(d) { return d && d.dsl; });
    var srcName = tpl ? tpl.name : '';

    if (!tpl || !result) {
      head.textContent = '';
      head.setAttribute('data-audit', 'idle');
      box.innerHTML = '';
      return;
    }

    var checked = TA.hasClassDocs(others, srcName);
    var res = checked ? TA.auditResult(result, name || '(新しい図)', others, srcName) : null;
    head.textContent = TA.summaryText(res, checked);
    head.setAttribute('data-audit',
      !checked ? 'skipped' : (res.clean ? 'ok' : 'ng'));
    head.setAttribute('data-audit-count', String(res ? res.issues.length : 0));
    box.innerHTML = checked ? TA.buildIssuesHtml(res) : '';
  }

  function updatePreview() {
    var tpl = currentTemplate();
    var fromEl = document.getElementById('tpl-from');
    var toEl = document.getElementById('tpl-to');
    var nameEl = document.getElementById('tpl-name');
    var preview = document.getElementById('tpl-preview');
    var summary = document.getElementById('tpl-summary');
    var createBtn = document.getElementById('btn-tpl-create');
    var blocked = document.getElementById('tpl-blocked');
    if (!fromEl || !toEl || !preview || !summary || !createBtn) return;

    if (!tpl) {
      summary.textContent = 'テンプレートを読み込んでいます…';
      summary.setAttribute('data-changed', '0');
      preview.textContent = '';
      createBtn.disabled = true;
      return;
    }
    var from = fromEl.value.trim();
    var to = toEl.value.trim();
    var result = buildResult(tpl.dsl);
    var rows = [];
    var beforeLines = tpl.dsl.split('\n');
    var afterLines = result.split('\n');
    for (var i = 0; i < beforeLines.length; i++) {
      if (beforeLines[i] !== afterLines[i]) {
        rows.push({ line: i + 1, before: beforeLines[i], after: afterLines[i] });
      }
    }
    summary.setAttribute('data-changed', String(rows.length));
    if (!from || !to) {
      summary.textContent = '置換元と置換先を入れると、変わる行がここに出ます';
    } else if (rows.length === 0) {
      summary.textContent = '「' + from + '」はこのテンプレートに出てきません';
    } else {
      summary.textContent = rows.length + ' 行が変わります (全 '
        + tpl.dsl.split('\n').length + ' 行)';
    }
    var left = unresolved();
    // 対応表を埋めた分だけ見出しの件数も減らす (作り直さずに数だけ合わせる)。
    var head = document.getElementById('tpl-remaining-head');
    if (head && head.getAttribute('data-map-rows') !== '0') {
      head.setAttribute('data-remaining', String(left.length));
      head.textContent = left.length
        ? ('まだ元の名前のままの部品が ' + left.length
           + ' 件あります。新しい名前を入れるか「このままで良い」を選んでください')
        : '元の系統の部品名は残っていません';
    }
    if (blocked) {
      blocked.setAttribute('data-unresolved', String(left.length));
      blocked.textContent = left.length
        ? '元の名前が残っています: ' + left.map(function(l) { return l.name; }).join(', ')
        : '';
      blocked.style.display = left.length ? 'block' : 'none';
    }
    createBtn.disabled = !(from && to && rows.length > 0
      && (nameEl ? nameEl.value.trim() : '') && left.length === 0);

    updateAudit(result, tpl);

    var html = '';
    rows.forEach(function(r) {
      html += '<div class="tpl-row" data-line="' + r.line + '" style="font-family:var(--font-mono);font-size:11px;'
        + 'padding:2px 4px;border-bottom:1px solid var(--border);">'
        + '<span style="color:var(--text-secondary);">L' + r.line + '</span> '
        + '<span style="color:var(--accent-red);">' + esc(r.before) + '</span>'
        + '<span style="color:var(--text-secondary);"> → </span>'
        + '<span style="color:var(--accent-green);">' + esc(r.after) + '</span></div>';
    });
    preview.innerHTML = html;
  }

  // 置換先を打った時点で、新しい図の名前も自動で埋める
  // (利用者が名前欄を自分で触っていたら上書きしない)。
  var nameTouched = false;

  function syncName() {
    var nameEl = document.getElementById('tpl-name');
    var tpl = currentTemplate();
    if (!nameEl || nameTouched || !tpl) return;
    var from = (document.getElementById('tpl-from') || {}).value || '';
    var to = (document.getElementById('tpl-to') || {}).value || '';
    if (!to) { nameEl.value = ''; return; }
    nameEl.value = TN.suggestName(tpl.name, from, to);
  }

  // フォルダのファイルは選ばれたときに初めて読む (一覧を開くたびに全部
  // 読みに行くと枚数だけ待たされるため)。
  function ensureTemplateLoaded(then) {
    var sel = document.getElementById('tpl-source');
    var v = sel ? sel.value : '';
    if (v.indexOf('file:') !== 0) { then(); return; }
    var name = v.slice(5);
    if (fileCache[name] != null) { then(); return; }
    window.MA.workspace.loadFile(name, _wsFileDir()).then(function(text) {
      fileCache[name] = text == null ? '' : text;
      then();
    });
  }

  function onSourceChange() {
    ensureTemplateLoaded(function() {
      var tpl = currentTemplate();
      if (tpl) {
        fillCandidates(tpl.dsl);
        var fromEl = document.getElementById('tpl-from');
        // BLK-junior-20260907-0703: 組み込みの雛形は部品名がぜんぶ `Xxx` で
        // 始まるので、置換元は選んだ時点で決まる。利用者が打つのは
        // 作る部品名の 1 語だけになり、そこへ焦点を移す。
        if (tpl.placeholder && fromEl) {
          fromEl.value = tpl.placeholder;
          var toEl = document.getElementById('tpl-to');
          if (toEl) toEl.focus();
        } else if (fromEl && !fromEl.value) {
          // 置換元が空なら、いちばん多く出てくる語を入れておく
          // (入力ゼロで押せる状態から始める)。
          var cands = TN.candidates(tpl.dsl);
          var PF = window.MA.peekFolder;
          // 覗いてきた図は、写したい部品名がファイル名に出ている
          // (timer_init_sequence.puml → Timer)。出現数だけで選ぶと、
          // どの図にもある App が勝って置換元を選び直すことになる。
          if (seedTpl && PF && tpl.name === seedTpl.name && tpl.dsl === seedTpl.dsl) {
            fromEl.value = PF.seedHint(seedTpl.name, cands);
          } else if (cands.length && cands[0].count > 1) {
            fromEl.value = cands[0].name;
          }
        }
      }
      syncName();
      rebuildRemaining();
      updatePreview();
    });
  }

  function create() {
    var tpl = currentTemplate();
    var from = (document.getElementById('tpl-from') || {}).value.trim();
    var to = (document.getElementById('tpl-to') || {}).value.trim();
    var name = (document.getElementById('tpl-name') || {}).value.trim();
    if (!tpl || !from || !to || !name) return;
    if (unresolved().length) return;   // 元の名前が残ったままの図は作らせない
    var dsl = buildResult(tpl.dsl);
    saveActiveDoc();
    var detected = window.MA.workspace.detectType(dsl);
    window.MA.workspace.open({
      name: name,
      dsl: dsl,
      diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
    });
    applyActiveDoc();
    // BLK-primary-20260907-0823: 作った直後にフォルダへ書き出す。ここを踏まないと
    // 新しいタブは「まだ 1 度も保存されていない図」のままで、保存先ディレクトリを
    // 設定していても {name}.puml が現れない。
    saveActiveDoc();
    // BLK-junior-20260907-1403-wish: テンプレート元は、そのままこの図の「型の基準」。
    // ここで覚えておけば、作った直後から「同じ形のままか」を見てもらえる。
    if (window.MA.reviewDesk) {
      try {
        window.MA.reviewDesk.setBaseline(name, tpl.name, tpl.dsl, new Date().toISOString());
      } catch (e) {}
    }
    close();
    // パネルを開くのは「作る」のクリックが抜けた後にする。同じクリックの中で開くと、
    // 外側クリックで閉じる仕掛けが自分の open を打ち消してしまう。
    try {
      renderReviewBadge();
      window.setTimeout(function() { try { openReviewPanel(); } catch (e) {} }, 0);
    } catch (e) {}
  }

  // ── 骨格から新規作成 (BLK-junior-20260907-1903-wish) ─────────────────────
  // 同じ骨格の図 (本体 1 + 周辺 3 + 依存 6 本) を題材ごとに毎回ゼロから組み直して
  // いた。下のテンプレート欄でも作れるが、そこで打つのは 4 か所あり、置換元を
  // 選び損ねると骨格が割れる。ここは「同じ図種の図」に絞り、置換元も新しい図の
  // 名前も図の中身から決めるので、打つのは題材名 1 語だけになる。
  var SK = window.MA.skeletonNew;

  function skelSources() {
    if (!SK) return [];
    var active = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
    var list = SK.sources(docs, currentDiagramType, active);
    // 今のタブも中身があれば土台にできる (自分の図を題材替えするのがいちばん多い)。
    return list.length ? list : SK.sources(docs, currentDiagramType);
  }

  function skelCurrent() {
    var sel = document.getElementById('skel-source');
    var list = skelSources();
    if (!list.length) return null;
    var v = sel ? sel.value : '';
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === v) return list[i];
    return list[0];
  }

  function skelPlan() {
    var src = skelCurrent();
    var el = document.getElementById('skel-subject');
    return src ? SK.plan(src, el ? el.value : '') : null;
  }

  function updateSkeleton() {
    if (!SK) return;
    var src = skelCurrent();
    var summary = document.getElementById('skel-summary');
    var btn = document.getElementById('btn-skel-create');
    if (!summary || !btn) return;
    var p = skelPlan();
    summary.textContent = SK.summaryText(p, src);
    summary.setAttribute('data-ok', p && p.ok ? '1' : '0');
    summary.setAttribute('data-changed', String(p && p.ok ? p.changed : 0));
    btn.disabled = !(p && p.ok);
  }

  function skelCreate() {
    var p = skelPlan();
    if (!p || !p.ok) return;
    saveActiveDoc();
    var detected = window.MA.workspace.detectType(p.dsl);
    window.MA.workspace.open({
      name: p.name,
      dsl: p.dsl,
      diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
    });
    applyActiveDoc();
    saveActiveDoc();   // 作った時点でフォルダにも現れる (テンプレートと同じ)
    close();
  }

  function skelSectionHtml() {
    var list = skelSources();
    var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">骨格から新規作成</h3>'
      + '<div style="font-size:11px;color:var(--text-secondary);">'
      + '同じ図種で描いた図の骨格 (要素と関係) をそのまま土台にします。打つのは題材名 1 語だけです。</div>';
    if (!list.length) {
      return html + '<div id="skel-summary" data-ok="0" data-changed="0" '
        + 'style="font-size:11px;color:var(--text-secondary);margin-top:6px;">'
        + esc(SK.summaryText(null, null)) + '</div>';
    }
    html += '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:6px;">'
      + '<div style="flex:2;"><label style="' + LABEL + '" for="skel-source">土台にする図</label>'
      + '<select id="skel-source" style="' + FIELD + '">';
    list.forEach(function(s) {
      html += '<option value="' + esc(String(s.id)) + '">' + esc(SK.sourceLabel(s)) + '</option>';
    });
    html += '</select></div>'
      + '<div style="flex:1;"><label style="' + LABEL + '" for="skel-subject">題材名</label>'
      + '<input id="skel-subject" autocomplete="off" spellcheck="false" placeholder="Can" style="'
      + FIELD + '"></div>'
      + '<button id="btn-skel-create" style="' + BTN + '" disabled>骨格から作る</button>'
      + '</div>'
      + '<div id="skel-summary" data-ok="0" data-changed="0" '
      + 'style="font-size:11px;color:var(--text-secondary);margin-top:4px;"></div>'
      + '<div style="border-bottom:1px solid var(--border);margin:12px 0 4px 0;"></div>';
    return html;
  }

  function bindSkeleton() {
    var sel = document.getElementById('skel-source');
    var sub = document.getElementById('skel-subject');
    var btn = document.getElementById('btn-skel-create');
    if (sel) sel.addEventListener('change', updateSkeleton);
    if (sub) {
      sub.addEventListener('input', updateSkeleton);
      sub.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); skelCreate(); }
      });
    }
    if (btn) btn.addEventListener('click', skelCreate);
    updateSkeleton();
  }

  // ── 部品を起こす (BLK-junior-20260913-0206-wish) ─────────────────────────
  // 手本がまったく無い部品を起こす周では、6 図種を別々のタブ・別々の下書き機能で
  // やり直し、部品名を図種ごとに打ち直していた。ここは部品名 1 語で 6 図種ぶんの
  // 下書きをまとめて開く。打つのは 1 回なので、図種を跨いだ綴りが割れない。
  var PS = window.MA.partStarter;

  function partSubject() {
    var el = document.getElementById('part-subject');
    return el ? el.value : '';
  }

  function partPlan() {
    return PS ? PS.plan(partSubject(), docs) : null;
  }

  // どの図種を開くか。既にある図種は既定で外す (書きかけを二重に持たない)。
  function partKeys() {
    var out = [];
    var boxes = content.querySelectorAll('input[data-part-kind]');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) out.push(boxes[i].getAttribute('data-part-kind'));
    }
    return out;
  }

  function updatePart() {
    if (!PS) return;
    var p = partPlan();
    var summary = document.getElementById('part-summary');
    var btn = document.getElementById('btn-part-create');
    var list = document.getElementById('part-sheets');
    if (!summary || !btn || !list) return;
    summary.textContent = PS.summary(p);
    summary.setAttribute('data-new', String(p ? p.newCount : 0));
    if (!p) {
      list.innerHTML = '';
      btn.disabled = true;
      btn.textContent = '6 図種の下書きを開く';
      return;
    }
    // 図種の行は部品名を打ち替えても組み替えない (チェックの選び直しになる)。
    if (list.getAttribute('data-subject') !== p.subject) {
      list.setAttribute('data-subject', p.subject);
      list.innerHTML = p.sheets.map(function(s) {
        return '<label data-part-row="' + esc(s.key) + '" '
          + 'style="display:flex;gap:6px;align-items:baseline;font-size:11px;padding:1px 0;">'
          + '<input type="checkbox" data-part-kind="' + esc(s.key) + '"'
          + (s.existing.length ? '' : ' checked') + '>'
          + '<span style="min-width:7em;">' + esc(s.label) + '</span>'
          + '<span data-part-name="' + esc(s.key) + '" style="color:var(--text-secondary);">'
          + esc(s.name) + '</span>'
          + '<span data-part-had="' + esc(s.key) + '" style="color:var(--accent-orange);">'
          + (s.existing.length ? '既にあります (' + esc(s.existing[0]) + ')' : '') + '</span>'
          + '</label>';
      }).join('');
      var boxes = list.querySelectorAll('input[data-part-kind]');
      for (var i = 0; i < boxes.length; i++) boxes[i].addEventListener('change', updatePart);
    } else {
      // 名前だけ打ち替えに追随させる。
      p.sheets.forEach(function(s) {
        var n = list.querySelector('[data-part-name="' + s.key + '"]');
        if (n) n.textContent = s.name;
        var h = list.querySelector('[data-part-had="' + s.key + '"]');
        if (h) h.textContent = s.existing.length ? '既にあります (' + s.existing[0] + ')' : '';
      });
    }
    var keys = partKeys();
    btn.disabled = !keys.length;
    btn.textContent = keys.length + ' 図種の下書きを開く';
  }

  function partCreate() {
    var p = partPlan();
    if (!p || !PS) return null;
    var sheets = PS.selected(p, partKeys());
    if (!sheets.length) return null;
    saveActiveDoc();
    var opened = [];
    sheets.forEach(function(s) {
      window.MA.workspace.open({ name: s.name, dsl: s.dsl, diagramType: s.type });
      opened.push(s.name);
      // 開いた時点で保存フォルダにも現れる (テンプレート・骨格と同じ)。
      applyActiveDoc();
      saveActiveDoc();
    });
    close();
    if (window.MA.toast) {
      window.MA.toast.show(p.body + ' の下書きを ' + opened.length
        + ' 図種ぶん、別タブで開きました');
    }
    return opened;
  }

  function partSectionHtml() {
    return '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">部品を起こす (6 図種まとめて)</h3>'
      + '<div style="font-size:11px;color:var(--text-secondary);">'
      + '手本の無い部品を起こすときに使います。部品名を 1 回打つと、シーケンス・状態遷移・クラス・'
      + 'アクティビティ・コンポーネント・ユースケースの下書きが、同じ名前で揃って別タブに開きます。</div>'
      + '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:6px;">'
      + '<div style="flex:1;"><label style="' + LABEL + '" for="part-subject">部品名</label>'
      + '<input id="part-subject" autocomplete="off" spellcheck="false" placeholder="TIMER" style="'
      + FIELD + '"></div>'
      + '<button id="btn-part-create" style="' + BTN + '" disabled>6 図種の下書きを開く</button>'
      + '</div>'
      + '<div id="part-summary" data-new="0" '
      + 'style="font-size:11px;color:var(--text-secondary);margin-top:4px;"></div>'
      + '<div id="part-sheets" data-subject="" style="margin-top:4px;"></div>'
      + '<hr style="border:0;border-top:1px solid var(--border);margin:12px 0;">';
  }

  function bindPart() {
    var sub = document.getElementById('part-subject');
    var btn = document.getElementById('btn-part-create');
    if (sub) {
      sub.addEventListener('input', updatePart);
      sub.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); partCreate(); }
      });
    }
    if (btn) btn.addEventListener('click', partCreate);
    updatePart();
  }

  function render() {
    content.innerHTML =
      (PS ? partSectionHtml() : '')
      + (SK ? skelSectionHtml() : '')
      + '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">テンプレートから新規作成</h3>'
      + '<div style="font-size:11px;color:var(--text-secondary);">'
      + '既にある図か組み込みの雛形と同じ構成のまま、部品名だけを替えた図を新しいタブに作ります。</div>'
      + '<label style="' + LABEL + '" for="tpl-source">テンプレートにする図</label>'
      + '<select id="tpl-source" style="' + FIELD + '">' + templateOptions() + '</select>'
      + '<div style="display:flex;gap:10px;">'
      + '<div style="flex:1;"><label style="' + LABEL + '" for="tpl-from">置換元 (元の部品名)</label>'
      + '<input id="tpl-from" list="tpl-candidates" autocomplete="off" spellcheck="false" '
      + 'placeholder="Uart" style="' + FIELD + '"><datalist id="tpl-candidates"></datalist></div>'
      + '<div style="flex:1;"><label style="' + LABEL + '" for="tpl-to">置換先 (作る部品名)</label>'
      + '<input id="tpl-to" autocomplete="off" spellcheck="false" placeholder="Gpio" style="' + FIELD + '"></div>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text-secondary);margin-top:3px;">'
      + '大小の綴りは族ごと置換します (Uart → Gpio なら UART → GPIO、uart → gpio も同時)。</div>'
      + '<label style="' + LABEL + '" for="tpl-name">新しい図の名前</label>'
      + '<input id="tpl-name" autocomplete="off" spellcheck="false" style="' + FIELD + '">'
      + '<label style="' + LABEL + '">部品名の対応表 (元の名前が残っていると作れません)</label>'
      + '<div id="tpl-remaining-head" style="font-size:11px;color:var(--text-secondary);" '
      + 'data-remaining="0"></div>'
      + '<div id="tpl-remaining" style="max-height:22vh;overflow-y:auto;margin-top:4px;"></div>'
      + '<label style="' + LABEL + '">クラスの宣言との突合 (作る前に見ます)</label>'
      + '<div id="tpl-audit-head" style="font-size:11px;" data-audit="idle" data-audit-count="0"></div>'
      + '<div id="tpl-audit" style="max-height:16vh;overflow-y:auto;margin-top:4px;"></div>'
      + '<label style="' + LABEL + '">置換の結果 (確定前に確認できます)</label>'
      + '<div id="tpl-summary" style="font-size:11px;color:var(--text-secondary);" data-changed="0"></div>'
      + '<div id="tpl-preview" style="max-height:28vh;overflow-y:auto;margin-top:4px;'
      + 'border:1px solid var(--border);border-radius:3px;"></div>'
      + '<div id="tpl-blocked" style="display:none;font-size:11px;color:var(--accent-orange);'
      + 'margin-top:6px;" data-unresolved="0"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">'
      + '<button id="btn-tpl-create" style="' + BTN + '" disabled>この内容で作る</button>'
      + '<button id="btn-tpl-cancel" style="' + BTN + '">キャンセル</button>'
      + '</div>';

    document.getElementById('tpl-source').addEventListener('change', onSourceChange);
    document.getElementById('tpl-from').addEventListener('input', function() { syncName(); rebuildRemaining(); updatePreview(); });
    document.getElementById('tpl-to').addEventListener('input', function() { syncName(); rebuildRemaining(); updatePreview(); });
    document.getElementById('tpl-name').addEventListener('input', function() { nameTouched = true; updatePreview(); });
    document.getElementById('btn-tpl-create').addEventListener('click', create);
    document.getElementById('btn-tpl-cancel').addEventListener('click', close);
    if (SK) bindSkeleton();
    if (PS) bindPart();
  }

  function open(focusSkeleton, seed) {
    saveActiveDoc();
    docs = window.MA.workspace ? window.MA.workspace.list() : [];
    files = [];
    fileCache = {};
    seedTpl = seed || null;
    nameTouched = false;
    render();
    modal.style.display = 'flex';
    if (focusSkeleton === 'part') {
      var psub = document.getElementById('part-subject');
      if (psub) psub.focus();
    } else if (focusSkeleton) {
      var sub = document.getElementById('skel-subject');
      if (sub) sub.focus();
    }
    // 覗いてきた図で開いたときは、置換先だけ打てば作れる状態にしておく。
    if (seedTpl) {
      var sel0 = document.getElementById('tpl-source');
      if (sel0) sel0.value = seedTpl.value;
    }
    onSourceChange();
    if (seedTpl) {
      var toEl0 = document.getElementById('tpl-to');
      if (toEl0) toEl0.focus();
    }
    // 保存フォルダの図もテンプレートに選べる (先輩が保存した図が主な出所)。
    window.MA.workspace.listFiles(_wsFileDir()).then(function(list) {
      files = (list || []).filter(function(n) { return n; });
      if (!files.length || modal.style.display === 'none') return;
      var sel = document.getElementById('tpl-source');
      var keep = sel ? sel.value : '';
      if (sel) {
        sel.innerHTML = templateOptions();
        if (keep) sel.value = keep;
      }
    });
  }

  _openTemplateNew = open;
  btn.addEventListener('click', function() { open(false); });
  var btnSkel = document.getElementById('btn-tab-skeleton');
  if (btnSkel) btnSkel.addEventListener('click', function() { open(true); });
  var btnPart = document.getElementById('btn-tab-part');
  if (btnPart) btnPart.addEventListener('click', function() { open('part'); });

  modal.addEventListener('click', function(ev) { if (ev.target === modal) close(); });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display !== 'none') close();
  });
}

function setupBulkRename() {
  var panel = document.getElementById('rename-panel');
  var btn = document.getElementById('btn-tab-rename');
  if (!panel || !btn || !window.MA.bulkRename) return;
  var fromEl = document.getElementById('rename-from');
  var toEl = document.getElementById('rename-to');
  var allEl = document.getElementById('rename-all-docs');
  var cancel = document.getElementById('btn-rename-cancel');
  var applyBtn = document.getElementById('btn-rename-apply');
  var summary = document.getElementById('rename-summary');

  function closePanel() { panel.classList.remove('open'); }

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

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    fillCandidates();
    // 選択中の部品があればそれを置換前の初期値にする (入力ゼロで始められる)。
    var sel = (window.MA.selection && window.MA.selection.getSelected()) || [];
    if (sel.length === 1 && sel[0] && typeof sel[0].id === 'string' && !fromEl.value) {
      fromEl.value = sel[0].id;
    }
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left - 60) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
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
  });

  [fromEl, toEl].forEach(function(el) {
    if (!el) return;
    el.addEventListener('input', updateRenamePreview);
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
    var res = applyBulkRename();
    var openTotal = (res && res.total) || 0;
    var openDocs = (res && res.docs) || 0;
    // 開いていない図はタブを開かずに保存フォルダへ書き戻す。書き終えてから
    // 件数を足すので、表示された枚数は「実際に書けた枚数」になる。
    applyRenameToUnopenedFiles(from, to).then(function(f) {
      var total = openTotal + f.total;
      var docs = openDocs + f.docs;
      if (total === 0) return;
      // 履歴は「1 回の置換」で 1 件。開いている図とフォルダ直書きを 1 つにまとめる。
      _recordRename(from, to, ((res && res.changed) || []).map(function(c) {
        return { name: c.name, count: c.count };
      }).concat(f.rows || []));
      // 前後の本文も 1 件として控える。会議で「今日のこの回」を選んで並べられる。
      _recordWrite('rename', { from: from, to: to },
        ((res && res.pairs) || []).concat((f.rows || []).map(function(r) {
          return { name: r.name, before: r.before, after: r.after };
        })));
      fromEl.value = '';
      toEl.value = '';
      fillCandidates();
      updateRenamePreview();
      var msg = total + ' 件 / ' + docs + ' 枚を置換しました';
      if (f.docs > 0) msg += ' (未オープン ' + f.docs + ' 枚を含む)';
      if (f.failed > 0) msg += ' / ' + f.failed + ' 枚は書き込めませんでした';
      summary.textContent = msg;
      summary.setAttribute('data-applied', String(total));
      summary.setAttribute('data-applied-unopened', String(f.docs));
    });
  }

  if (applyBtn) applyBtn.addEventListener('click', doApply);
  if (cancel) cancel.addEventListener('click', closePanel);

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    // 影響ボードはこのパネルの続きなので、外側クリック扱いにしない
    // (閉じてしまうと、見た後に置換前後を直す手が消える)。
    var ri = document.getElementById('ri-modal');
    if (ri && ri.contains(ev.target)) return;
    // 依存グラフも同じ理由でパネルの続き (見た名前を置換前に入れて戻る)。
    var dg = document.getElementById('dg-modal');
    if (dg && dg.contains(ev.target)) return;
    closePanel();
  });
}

// ── 症状検索 ───────────────────────────────────────────────────────────────
// BLK-primary-20260907-2203-wish: 不具合対応は症状文から始まるのに、過去図を
// 探す入口は「部品名を思い付いて打つ」しか無かった。思い付ける名前の数が探索の
// 上限になるので、経験の浅い担当者はそもそも探索を始められない。症状文をその
// まま貼れば関連度順に図が並び、当たった行を押せばその図のその行へ運ぶ。

// BLK-primary-20260909-0203-wish: 症状検索の探索範囲。既定は開いているタブだけ
// だが、不具合対応で要る図 (dma_transfer_sequence など) は開いていないことの
// ほうが多い。保存フォルダを入れると、開いていない図も列に載る。
function _symptomScanFolder() {
  var el = document.getElementById('symptom-scan-folder');
  return !!(el && el.checked) && _fiFolderMode();
}

function _symptomDocs() {
  return _symptomScanFolder() ? _fiRows() : _renameDocs();
}

// 系統の行から図を開く。開いていない図はまず開いてから行へ運ぶ。
function _symptomOpenDoc(row) {
  if (!row) return;
  if (row.id != null && String(row.id).indexOf('file:') !== 0) {
    jumpToDocLine(row.id, row.line);
    return;
  }
  openFromFolderByName(row.name);
}

// 系統ごとの段。ここが「当たらなかった系統に気付く」ための面なので、
// 関連度上位だけに絞らず、語ごとに当たった図を全部出す。
function renderSymptomSystems(docs, text) {
  var box = document.getElementById('symptom-systems');
  var sys = window.MA.symptomSystems;
  if (!box) return;
  box.textContent = '';
  if (!sys) return;
  var g = sys.group(docs, text);
  box.setAttribute('data-systems', String(g.systems.length));
  if (!g.terms.length) return;

  g.systems.forEach(function(row) {
    var item = document.createElement('div');
    item.className = 'sym-sys';
    item.setAttribute('data-term', row.term);
    item.setAttribute('data-docs', String(row.docCount));
    var head = document.createElement('div');
    head.className = 'sym-sys-head';
    head.textContent = sys.systemLabel(row);
    item.appendChild(head);
    row.docs.forEach(function(d) {
      var b = document.createElement('div');
      b.className = 'sym-sys-doc' + (d.open ? '' : ' closed');
      b.setAttribute('data-doc-name', d.name);
      b.setAttribute('data-line', String(d.line));
      b.title = d.name + ' の ' + d.line + ' 行目へ移動 (' + d.term + ' → ' + d.target + ')';
      var n = document.createElement('span');
      n.textContent = d.name;
      var k = document.createElement('span');
      k.className = 'sym-sys-kind';
      k.textContent = d.kindLabel + ' / ' + d.target;
      b.appendChild(n);
      b.appendChild(k);
      b.addEventListener('click', function() { _symptomOpenDoc(d); });
      item.appendChild(b);
    });
    box.appendChild(item);
  });

  if (g.actions.length) {
    var act = document.createElement('div');
    act.className = 'sym-act';
    act.id = 'symptom-actions-line';
    act.textContent = '動作の語 (系統ではない): '
      + g.actions.map(function(a) { return a.term; }).join('・');
    box.appendChild(act);
  }
}

// BLK-primary-20260909-0703-wish: 当たった図どうしの流れ突合。
// 症状検索で 6 図が当たったあと、利用者は「シーケンスのメッセージに対応する状態が
// 状態遷移図にあるか」を 1 枚ずつ開いて目で確かめていた。ここで先に突き合わせ、
// 対応の無い流れを持つ図だけを赤く浮かせ、対応済みの図は「開かなくてよい」と名指しする。
function _symptomCrossOn() {
  var el = document.getElementById('symptom-cross');
  return !el || !!el.checked;
}

function renderSymptomFlow(docs, text) {
  var box = document.getElementById('symptom-flow');
  var headEl = document.getElementById('symptom-flow-head');
  var sf = window.MA.symptomFlow;
  if (!box || !headEl) return;
  box.textContent = '';
  headEl.textContent = '';
  box.removeAttribute('data-gap-docs');
  if (!sf) return;
  if (!_symptomCrossOn()) { headEl.textContent = ''; return; }

  var x = sf.cross(docs, text);
  box.setAttribute('data-gap-docs', String(x.gapDocs));
  box.setAttribute('data-ok-docs', String(x.okDocs));
  headEl.setAttribute('data-gap-docs', String(x.gapDocs));
  if (!x.rows.length) return;
  headEl.textContent = sf.headline(x);

  x.rows.forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'sym-fl ' + r.status;
    item.setAttribute('data-doc-name', r.name);
    item.setAttribute('data-status', r.status);
    item.setAttribute('data-gaps', String(r.gapCount));
    var head = document.createElement('div');
    head.className = 'sym-fl-head';
    head.title = r.name + ' を開く';
    var n = document.createElement('span');
    n.textContent = (r.status === 'gap' ? '⚠ ' : '') + r.name;
    var note = document.createElement('span');
    note.className = 'sym-fl-note';
    note.textContent = r.kindLabel + ' / ' + r.note;
    head.appendChild(n);
    head.appendChild(note);
    head.addEventListener('click', function() {
      _symptomOpenDoc({ id: r.id, name: r.name, line: r.gaps.length ? r.gaps[0].line : 1 });
    });
    item.appendChild(head);
    // 欠落した流れは行ごとに出す。押せばその図のその行へ運ぶ (開くのはここだけでよい)。
    r.gaps.forEach(function(g) {
      var row = document.createElement('div');
      row.className = 'sym-fl-gap';
      row.setAttribute('data-name', g.name);
      row.setAttribute('data-line', String(g.line));
      row.title = r.name + ' の ' + g.line + ' 行目へ移動 (対応する状態/遷移が見当たりません)';
      var no = document.createElement('span');
      no.className = 'sym-fl-line';
      no.textContent = String(g.line);
      var tx = document.createElement('span');
      tx.textContent = g.name + ' → 対応なし';
      row.appendChild(no);
      row.appendChild(tx);
      row.addEventListener('click', function() {
        _symptomOpenDoc({ id: r.id, name: r.name, line: g.line });
      });
      item.appendChild(row);
    });
    box.appendChild(item);
  });
}

function renderSymptomSearch() {
  var ss = window.MA.symptomSearch;
  var textEl = document.getElementById('symptom-text');
  var termsEl = document.getElementById('symptom-terms');
  var headEl = document.getElementById('symptom-head');
  var resEl = document.getElementById('symptom-results');
  if (!ss || !textEl || !termsEl || !headEl || !resEl) return;
  var text = textEl.value;
  var docs = _symptomDocs();
  var ov = ss.overview(docs, text);
  var rows = ss.search(docs, text);

  termsEl.textContent = '';
  var missed = {};
  ov.missed.forEach(function(t) { missed[t] = true; });
  ov.terms.forEach(function(t) {
    var chip = document.createElement('span');
    chip.className = 'sym-term' + (missed[t] ? ' missed' : '');
    chip.textContent = t;
    chip.title = missed[t] ? 'どの図にも見当たらない語' : 'この語で図が当たっている';
    termsEl.appendChild(chip);
  });

  headEl.setAttribute('data-docs', String(rows.length));
  headEl.setAttribute('data-terms', String(ov.terms.length));
  if (ov.terms.length === 0) {
    headEl.textContent = '症状を貼ると関連しそうな図が並びます';
  } else if (rows.length === 0) {
    headEl.textContent = ov.terms.length + ' 語で該当なし / 語を足すか綴りを確かめてください';
  } else {
    headEl.textContent = ov.terms.length + ' 語で ' + rows.length + ' 図が該当'
      + (ov.missed.length ? ' / 当たらなかった語: ' + ov.missed.join('・') : '');
  }

  var sys = window.MA.symptomSystems;
  if (sys && ov.terms.length && rows.length) {
    var g = sys.group(docs, text);
    headEl.setAttribute('data-systems', String(g.systems.length));
    headEl.textContent = sys.headline(g);
  } else if (sys) {
    headEl.setAttribute('data-systems', '0');
  }
  renderSymptomSystems(docs, text);
  renderSymptomFlow(docs, text);

  resEl.textContent = '';
  rows.forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'sym-doc';
    item.setAttribute('data-doc-name', r.name);
    item.setAttribute('data-score', String(r.score));
    item.setAttribute('data-kind', r.kind);
    var line = document.createElement('div');
    line.className = 'sym-doc-name';
    var n = document.createElement('span');
    n.textContent = r.name;
    var k = document.createElement('span');
    k.className = 'sym-kind';
    k.textContent = r.kindLabel + ' / 関連度 ' + r.score;
    line.appendChild(n);
    line.appendChild(k);
    item.appendChild(line);
    var m = document.createElement('div');
    m.className = 'sym-matched';
    m.textContent = '当たった語: ' + r.summary;
    item.appendChild(m);
    r.hits.forEach(function(h) {
      var hit = document.createElement('div');
      hit.className = 'sym-hit';
      hit.setAttribute('data-term', h.term);
      hit.setAttribute('data-line', String(h.line));
      hit.title = r.name + ' の ' + h.line + ' 行目へ移動';
      var no = document.createElement('span');
      no.className = 'sym-hit-line';
      no.textContent = String(h.line);
      var tx = document.createElement('span');
      tx.textContent = h.term + ' → ' + h.target + ' (' + h.label + ')';
      hit.appendChild(no);
      hit.appendChild(tx);
      hit.addEventListener('click', function() { jumpToDocLine(r.id, h.line); });
      item.appendChild(hit);
    });
    resEl.appendChild(item);
  });
}

function setupSymptomSearch() {
  var panel = document.getElementById('symptom-panel');
  var btn = document.getElementById('btn-tab-symptom');
  if (!panel || !btn || !window.MA.symptomSearch) return;
  var textEl = document.getElementById('symptom-text');
  var clearBtn = document.getElementById('btn-symptom-clear');
  var closeBtn = document.getElementById('btn-symptom-close');

  function closePanel() { panel.classList.remove('open'); }

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left - 60) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    panel.classList.add('open');
    var scan = document.getElementById('symptom-scan-folder');
    if (scan) {
      var ok = _fiFolderMode();
      scan.disabled = !ok;
      if (!ok) scan.checked = false;
      var lab = scan.parentNode;
      if (lab) lab.title = ok ? '保存フォルダの .puml も探索範囲に入れる'
        : '保存先がフォルダのときだけ使えます (設定 → 自動保存)';
    }
    if (_symptomScanFolder()) loadFolderImpact(false).then(function() { renderSymptomSearch(); });
    renderSymptomSearch();
    textEl.focus();
  });

  if (textEl) {
    textEl.addEventListener('input', renderSymptomSearch);
    textEl.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closePanel(); }
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', function() {
    textEl.value = '';
    renderSymptomSearch();
    textEl.focus();
  });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  // 流れ突合の入切。既定は入 (当たった図を 1 枚ずつ開く手数がこの段で消える)。
  var crossEl = document.getElementById('symptom-cross');
  if (crossEl) crossEl.addEventListener('change', renderSymptomSearch);

  // 保存フォルダを探索範囲に入れる。読み込みはフォルダ保存のときだけ意味がある
  // ので、それ以外では押せないようにして理由を出す。
  var scanEl = document.getElementById('symptom-scan-folder');
  if (scanEl) {
    scanEl.addEventListener('change', function() {
      if (!scanEl.checked) { renderSymptomSearch(); return; }
      loadFolderImpact(false).then(function() { renderSymptomSearch(); },
        function() { renderSymptomSearch(); });
      renderSymptomSearch();
    });
  }

  // 受け取った側。渡された保存先を打ち直さず、検証してから設定に反映する
  // (BLK-primary-20260908-0103-wish)。書式の崩れは反映前にここで止める。
  var SDH = window.MA.saveDirHandoff;
  var dirBtn = document.getElementById('btn-xref-dir');
  var dirBox = document.getElementById('xref-dir-box');
  var dirInput = document.getElementById('xref-dir-input');
  var dirMsg = document.getElementById('xref-dir-msg');
  var dirNow = document.getElementById('xref-dir-now');
  var dirApply = document.getElementById('btn-xref-dir-apply');
  var dirCancel = document.getElementById('btn-xref-dir-cancel');

  function showDirMsg(text, ng) {
    if (!dirMsg) return;
    dirMsg.textContent = text || '';
    dirMsg.className = ng ? 'ng' : '';
  }
  function showDirNow() {
    if (!dirNow) return;
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    dirNow.textContent = (cfg && cfg.backend === 'file')
      ? '今の保存先: ' + cfg.fileDir
      : '今は保存先フォルダ未設定 (localStorage)。反映するとファイル保存に切り替わります。';
  }

  if (dirBtn && dirBox && SDH) dirBtn.addEventListener('click', function() {
    dirBox.hidden = !dirBox.hidden;
    if (!dirBox.hidden) { showDirMsg(''); showDirNow(); if (dirInput) dirInput.focus(); }
  });
  if (dirCancel && dirBox) dirCancel.addEventListener('click', function() {
    dirBox.hidden = true;
    showDirMsg('');
  });
  if (dirApply && SDH) dirApply.addEventListener('click', function() {
    var raw = SDH.fromText(dirInput ? dirInput.value : '');
    if (!raw) {
      showDirMsg('⚠ 貼られた文面から' + SDH.LABEL + 'を見つけられませんでした。'
        + 'パスを 1 行だけ貼ってみてください。', true);
      return;
    }
    var res = SDH.check(raw);
    if (!res.ok) { showDirMsg(SDH.messageFor(res), true); return; }
    if (window.MA.autoSave) {
      window.MA.autoSave.setConfig({ backend: 'file', fileDir: res.value });
      updateTopSaveTarget();
    }
    // 設定モーダルを開いたときに古い値が出ないよう、入力欄も合わせておく。
    var cfgDirEl = document.getElementById('cfg-file-dir');
    if (cfgDirEl) cfgDirEl.value = res.value;
    showDirNow();
    showDirMsg(SDH.messageFor(res), false);
    setSaveStatus(SDH.messageFor(res));
  });
}

// ── 観点一括 ───────────────────────────────────────────────────────────────
// BLK-junior-20260908-0003-wish: 指摘は 1 件でも、同じ観点は他の題材の対応する
// 図にも当てはまる。今までは図を 1 枚ずつ開いて目で確かめるしかなく、手数が
// 図の枚数に比例した。観点を先に選べば「欠けている図」だけが残るので、
// 開くのはその枚数だけで済む。

function renderPatternCheck() {
  var pc = window.MA.patternCheck;
  var kindEl = document.getElementById('pattern-kind');
  var hintEl = document.getElementById('pattern-hint');
  var headEl = document.getElementById('pattern-head');
  var resEl = document.getElementById('pattern-results');
  if (!pc || !kindEl || !hintEl || !headEl || !resEl) return;

  var docs = _renameDocs();
  var res = pc.run(docs, kindEl.value);
  var p = pc.findPattern(kindEl.value);
  hintEl.textContent = p ? p.hint : '';

  headEl.setAttribute('data-missing', String(res.rows.length));
  headEl.setAttribute('data-checked', String(res.checked));
  headEl.textContent = pc.summaryText(res);

  resEl.textContent = '';
  res.rows.forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'pat-doc';
    item.setAttribute('data-doc-name', r.name);
    item.setAttribute('data-kind', r.kind);
    var line = document.createElement('div');
    line.className = 'pat-doc-name';
    var n = document.createElement('span');
    n.textContent = r.name;
    var k = document.createElement('span');
    k.className = 'pat-kind';
    k.textContent = r.kindLabel + ' / ' + r.missing.length + ' ' + (p ? p.unit : '件');
    line.appendChild(n);
    line.appendChild(k);
    item.appendChild(line);
    r.missing.forEach(function(m) {
      var row = document.createElement('div');
      row.className = 'pat-miss';
      row.setAttribute('data-missing-text', m.text);
      row.setAttribute('data-line', String(m.line));
      row.title = r.name + ' の ' + m.line + ' 行目へ移動';
      var no = document.createElement('span');
      no.className = 'pat-miss-line';
      no.textContent = String(m.line);
      var tx = document.createElement('span');
      tx.textContent = m.text;
      row.appendChild(no);
      row.appendChild(tx);
      row.addEventListener('click', function() { jumpToDocLine(r.id, m.line); });
      item.appendChild(row);
    });
    resEl.appendChild(item);
  });
}

function setupPatternCheck() {
  var panel = document.getElementById('pattern-panel');
  var btn = document.getElementById('btn-tab-pattern');
  var pc = window.MA.patternCheck;
  if (!panel || !btn || !pc) return;
  var kindEl = document.getElementById('pattern-kind');
  var noteEl = document.getElementById('pattern-note');
  var closeBtn = document.getElementById('btn-pattern-close');

  if (kindEl && !kindEl.options.length) {
    pc.patterns().forEach(function(p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      kindEl.appendChild(o);
    });
  }

  function closePanel() { panel.classList.remove('open'); }

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left - 60) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    panel.classList.add('open');
    renderPatternCheck();
    if (noteEl) noteEl.focus();
  });

  if (kindEl) kindEl.addEventListener('change', renderPatternCheck);
  if (noteEl) {
    // 指摘文を貼ると観点が選ばれる。当たらなければ今の観点のままにする
    // (勝手に別の観点へ動くと、出た一覧がどの観点のものか読めなくなる)。
    noteEl.addEventListener('input', function() {
      var p = pc.suggest(noteEl.value);
      if (p && kindEl && kindEl.value !== p.id) {
        kindEl.value = p.id;
        renderPatternCheck();
      }
    });
    noteEl.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closePanel(); }
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
}

// ── 参照関係 ───────────────────────────────────────────────────────────────
// BLK-primary-20260908-0003-wish: 14 枚一式を新人に渡すとき、「この図とこの図は
// 同じ部品名で繋がっている」という関係そのものを渡す手段が無く、渡された側は
// 1 枚ずつ開いて名前を照合するしかなかった。開いている図を 1 プロジェクトとして
// 扱い、図をまたぐ部品名を並べ、選べばその名前が出る図をタブ上でハイライトして
// 一覧に出す。行を押せばその図のその行へ運ぶ。関係は書き出して渡せる。

var _xrefSelected = '';   // 今ハイライトしている部品名

// タブは編集のたびに組み立て直されるので、印は毎回付け直す。
function applyXrefHighlight(names) {
  var bar = document.getElementById('tab-bar');
  if (!bar) return;
  var hit = {};
  (names || []).forEach(function(n) { hit[n] = true; });
  var tabs = bar.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    var el = tabs[i];
    if (hit[el.getAttribute('data-doc-name')]) el.classList.add('xref-hit');
    else el.classList.remove('xref-hit');
  }
}

function _xrefHighlightSelected(graph) {
  if (!_xrefSelected) { applyXrefHighlight([]); return; }
  var e = window.MA.xrefGraph.forName(graph, _xrefSelected);
  applyXrefHighlight(e ? e.docs.map(function(d) { return d.name; }) : []);
}

function renderXrefGraph() {
  var XG = window.MA.xrefGraph;
  var headEl = document.getElementById('xref-head');
  var namesEl = document.getElementById('xref-names');
  var refsEl = document.getElementById('xref-refs');
  var linksEl = document.getElementById('xref-links');
  if (!XG || !headEl || !namesEl || !refsEl || !linksEl) return;

  var graph = XG.build(_renameDocs());
  var activeName = '';
  if (window.MA.workspace) {
    var act = window.MA.workspace.getActive();
    activeName = (act && act.name) || '';
  }

  headEl.textContent = XG.summaryLine(graph);
  headEl.setAttribute('data-docs', String(graph.counts.docs));
  headEl.setAttribute('data-shared', String(graph.counts.shared));
  headEl.setAttribute('data-links', String(graph.counts.links));

  // 選んでいた名前がもう跨いでいなければ選択を落とす。
  if (_xrefSelected && !XG.forName(graph, _xrefSelected)) _xrefSelected = '';

  namesEl.textContent = '';
  graph.shared.forEach(function(n) {
    var row = document.createElement('div');
    row.className = 'xref-name' + (n.name === _xrefSelected ? ' on' : '');
    row.setAttribute('data-name', n.name);
    row.setAttribute('data-docs', String(n.docCount));
    row.title = n.name + ' が出てくる図: ' + n.docs.map(function(d) { return d.name; }).join(', ');
    var nm = document.createElement('span');
    nm.textContent = n.name;
    var ct = document.createElement('span');
    ct.className = 'xref-count';
    ct.textContent = n.docCount + ' 枚';
    row.appendChild(nm);
    row.appendChild(ct);
    row.addEventListener('click', function() {
      _xrefSelected = (_xrefSelected === n.name) ? '' : n.name;
      renderXrefGraph();
    });
    namesEl.appendChild(row);
  });
  if (graph.shared.length === 0) {
    var none = document.createElement('div');
    none.id = 'xref-no-shared';
    none.className = 'xref-hint';
    none.textContent = '図をまたぐ部品名はありません';
    namesEl.appendChild(none);
  }

  refsEl.textContent = '';
  var sel = _xrefSelected ? XG.forName(graph, _xrefSelected) : null;
  if (!sel) {
    var hint = document.createElement('div');
    hint.id = 'xref-hint';
    hint.className = 'xref-hint';
    hint.textContent = '部品名を押すと、その名前が出てくる図が並びます';
    refsEl.appendChild(hint);
  } else {
    refsEl.setAttribute('data-name', sel.name);
    refsEl.setAttribute('data-count', String(sel.docCount));
    sel.docs.forEach(function(d) {
      var row = document.createElement('div');
      row.className = 'xref-ref' + (d.declared ? '' : ' xref-ref-undeclared');
      row.setAttribute('data-doc-name', d.name);
      row.setAttribute('data-line', String(d.line));
      row.setAttribute('data-declared', d.declared ? '1' : '0');
      if (d.name === activeName) row.setAttribute('data-active', '1');
      row.title = d.name + ' の ' + d.line + ' 行目へ移動'
        + (d.declared ? '' : ' (宣言が無く、矢印にだけ出てくる)');
      var no = document.createElement('span');
      no.className = 'xref-ref-line';
      no.textContent = String(d.line);
      var tx = document.createElement('span');
      tx.textContent = d.name + ' (' + d.kind + ')';
      row.appendChild(no);
      row.appendChild(tx);
      row.addEventListener('click', function() { jumpToDocLine(d.id, d.line); });
      refsEl.appendChild(row);
    });
  }

  linksEl.textContent = '';
  linksEl.setAttribute('data-links', String(graph.links.length));
  graph.links.slice(0, 12).forEach(function(l) {
    var row = document.createElement('div');
    row.className = 'xref-link';
    row.setAttribute('data-a', l.a);
    row.setAttribute('data-b', l.b);
    row.textContent = l.a + ' ⇄ ' + l.b + ': ' + l.names.join(', ');
    linksEl.appendChild(row);
  });

  _xrefHighlightSelected(graph);
}

function setupXrefGraph() {
  var panel = document.getElementById('xref-panel');
  var btn = document.getElementById('btn-tab-xref');
  if (!panel || !btn || !window.MA.xrefGraph) return;
  var closeBtn = document.getElementById('btn-xref-close');
  var exportBtn = document.getElementById('btn-xref-export');

  function closePanel() {
    panel.classList.remove('open');
    _xrefSelected = '';
    applyXrefHighlight([]);
    var box = document.getElementById('xref-dir-box');
    if (box) box.hidden = true;
  }

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left - 200) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    panel.classList.add('open');
    renderXrefGraph();
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    var txt = window.MA.xrefGraph.toText(window.MA.xrefGraph.build(_renameDocs()), cfg);
    downloadBlob('xref.md', new Blob([txt], { type: 'text/markdown' }));
    setSaveStatus('参照関係を xref.md に書き出しました');
  });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
}

// ── 一括適用 ───────────────────────────────────────────────────────────────
// レビュー指摘は「この 3 クラスに同じメソッドが無い」の形で来るのに、GUI 側は
// クラスを 1 つ選ぶ → フォームを開く → 打つ、を対象の数だけ繰り返すしかなく、
// 手数が対象数に比例して増えていた (BLK-primary-20260906-2043)。
// 名前を 1 度だけ打ち、当てる先をまとめて選んで 1 回で当てる。

function setupBulkApply() {
  var panel = document.getElementById('apply-panel');
  var btn = document.getElementById('btn-tab-apply');
  var ba = window.MA.bulkApply;
  if (!panel || !btn || !ba) return;
  var kindEl = document.getElementById('apply-kind');
  var nameEl = document.getElementById('apply-name');
  var extraEl = document.getElementById('apply-extra');
  var extraLabel = document.getElementById('apply-extra-label');
  var listEl = document.getElementById('apply-targets');
  var summary = document.getElementById('apply-summary');
  var runBtn = document.getElementById('btn-apply-run');
  var selected = {};

  ba.kinds().forEach(function(k) {
    var o = document.createElement('option');
    o.value = k.kind;
    o.textContent = k.label;
    kindEl.appendChild(o);
  });

  function closePanel() { panel.classList.remove('open'); }

  function spec() {
    return kindEl.value === 'class-method'
      ? { name: nameEl.value.trim(), params: '', returnType: extraEl.value.trim(), visibility: '+' }
      : { name: nameEl.value.trim(), type: extraEl.value.trim(), visibility: '+' };
  }

  function renderTargets() {
    var docs = _renameDocs();
    var kind = kindEl.value;
    var list = ba.targets(docs, kind);
    var keys = Object.keys(selected).filter(function(k) { return selected[k]; });
    var rows = ba.preview(docs, keys, kind, spec());
    var stateOf = {};
    rows.forEach(function(r) { stateOf[r.key] = r.status; });

    listEl.textContent = '';
    if (list.length === 0) {
      var none = document.createElement('div');
      none.className = 'ap-row';
      none.id = 'apply-no-targets';
      none.textContent = 'クラス図が開かれていません';
      listEl.appendChild(none);
    }
    list.forEach(function(t) {
      var row = document.createElement('label');
      row.className = 'ap-row' + (stateOf[t.key] === 'skip' ? ' skip' : '');
      row.setAttribute('data-key', t.key);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ap-check';
      cb.checked = !!selected[t.key];
      cb.addEventListener('change', function() {
        selected[t.key] = cb.checked;
        renderTargets();
      });
      var n = document.createElement('span');
      n.className = 'ap-name';
      n.textContent = t.name;
      var d = document.createElement('span');
      d.className = 'ap-doc';
      d.textContent = t.docName;
      var s = document.createElement('span');
      s.className = 'ap-state';
      s.textContent = stateOf[t.key] === 'skip' ? '既にあり' : '';
      row.appendChild(cb); row.appendChild(n); row.appendChild(d); row.appendChild(s);
      listEl.appendChild(row);
    });

    var add = rows.filter(function(r) { return r.status === 'add'; }).length;
    var skip = rows.filter(function(r) { return r.status === 'skip'; }).length;
    var label = ba.memberLine(kind, spec());
    if (!nameEl.value.trim()) summary.textContent = '名前を入力してください';
    else if (keys.length === 0) summary.textContent = '当てる先を選んでください';
    else if (add === 0) summary.textContent = '選んだ ' + skip + ' 件はすべて既にあります';
    else summary.textContent = '「' + label + '」を ' + add + ' 件に追加' + (skip ? '（' + skip + ' 件は既にあり）' : '');
    summary.setAttribute('data-add', String(add));
    summary.setAttribute('data-skip', String(skip));
    runBtn.disabled = !(add > 0);
  }

  function syncExtraLabel() {
    var isMethod = kindEl.value === 'class-method';
    extraLabel.textContent = isMethod ? '戻り値' : '型';
    extraEl.placeholder = isMethod ? 'void' : 'uint8';
  }

  function doApply() {
    var docs = _renameDocs();
    var keys = Object.keys(selected).filter(function(k) { return selected[k]; });
    var res = ba.apply(docs, keys, kindEl.value, spec());
    if (!res.changed.length) { renderTargets(); return; }
    var activeId = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
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
    updateLineNumbers();
    scheduleRefresh();
    renderTabs();
    // 保存フォルダ運用時は当てた図を書き出す (一括置換と同じ扱い)。
    writeChangedToFolder(res.changed);
    renderTargets();
    summary.textContent = res.added + ' 件 / ' + res.changed.length + ' 枚に追加しました';
    summary.setAttribute('data-applied', String(res.added));
  }

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left - 60) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    panel.classList.add('open');
    syncExtraLabel();
    renderTargets();
    nameEl.focus();
  });

  kindEl.addEventListener('change', function() { selected = {}; syncExtraLabel(); renderTargets(); });
  [nameEl, extraEl].forEach(function(el) {
    el.addEventListener('input', renderTargets);
    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' && !runBtn.disabled) { ev.preventDefault(); doApply(); }
      if (ev.key === 'Escape') { ev.preventDefault(); closePanel(); }
    });
  });
  document.getElementById('btn-apply-all').addEventListener('click', function() {
    ba.targets(_renameDocs(), kindEl.value).forEach(function(t) { selected[t.key] = true; });
    renderTargets();
  });
  document.getElementById('btn-apply-none').addEventListener('click', function() {
    selected = {};
    renderTargets();
  });
  runBtn.addEventListener('click', doApply);
  document.getElementById('btn-apply-close').addEventListener('click', closePanel);
  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    closePanel();
  });
}

// ── 名前突合 ───────────────────────────────────────────────────────────────
// 図が増えるほど「participant 名・class 名・状態名が図をまたいで揃っているか」の
// 目視確認が追いつかなくなる。宣言行から名前を機械抽出して、表記揺れ (IRQCtrl と
// IrqCtrl)、宣言の無い名前 (どの図にもクラスが無い DmaCtrl)、図 × 名前の対照表を
// 一度に出す。揺れはその場で 1 クリック統一できる。

function openNameAudit() {
  var modal = document.getElementById('na-modal');
  var content = document.getElementById('na-modal-content');
  var na = window.MA.nameAudit;
  if (!modal || !content || !na) return null;
  var esc = window.MA.htmlUtils.escHtml;

  var docs = _renameDocs();
  var result = na.audit(docs);

  var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:12px 0 4px 0;';
  var CELL = 'padding:3px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-primary);';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 8px;font-size:11px;';

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">名前突合</h3>' +
    '<div id="na-summary" style="font-size:11px;color:var(--text-secondary);" ' +
      'data-docs="' + docs.length + '" data-names="' + result.names.length + '" ' +
      'data-variants="' + result.variants.length + '" data-undeclared="' + result.undeclared.length + '">' +
      docs.length + ' 枚 / 部品名 ' + result.names.length + ' 件 — ' +
      '表記揺れ ' + result.variants.length + ' 組、宣言なし ' + result.undeclared.length + ' 件' +
    '</div>';

  html += '<div style="' + SECTION + '">表記揺れ (同じ部品が別の綴りで書かれている)</div>';
  if (result.variants.length === 0) {
    html += '<div id="na-no-variants" style="font-size:11px;color:var(--text-secondary);">揺れはありません</div>';
  } else {
    html += '<table id="na-variants" style="border-collapse:collapse;width:100%;">';
    result.variants.forEach(function(g, gi) {
      g.members.forEach(function(m, mi) {
        html += '<tr class="na-variant-row" data-key="' + esc(g.key) + '" data-name="' + esc(m.name) + '">' +
          (mi === 0 ? '<td rowspan="' + g.members.length + '" style="' + CELL + 'color:var(--text-secondary);white-space:nowrap;">' + esc(g.key) + '</td>' : '') +
          '<td style="' + CELL + 'font-family:var(--font-mono);">' + esc(m.name) + '</td>' +
          '<td style="' + CELL + 'color:var(--text-secondary);">' + esc(m.docs.join(', ')) + '</td>' +
          '<td style="' + CELL + 'text-align:right;color:var(--text-secondary);">' + m.refs + ' 件</td>' +
          '<td style="' + CELL + 'text-align:right;"><button class="na-unify" data-gi="' + gi + '" ' +
            'data-to="' + esc(m.name) + '" style="' + BTN + '">これに統一</button></td>' +
        '</tr>';
      });
    });
    html += '</table>';
  }

  html += '<div style="' + SECTION + '">宣言なし (矢印にだけ出てきて、どの図にも宣言が無い)</div>';
  if (result.undeclared.length === 0) {
    html += '<div id="na-no-undeclared" style="font-size:11px;color:var(--text-secondary);">ありません</div>';
  } else {
    html += '<div id="na-undeclared" style="font-size:11px;font-family:var(--font-mono);color:var(--accent-red);">' +
      result.undeclared.map(function(r) { return esc(r.name) + ' (' + esc(r.docs.join(', ')) + ')'; }).join('<br>') +
      '</div>';
  }

  // BLK-reviewer-20260907-0143: 名前だけでなくメソッドの宣言と引数まで突き合わせる。
  // 図が増えるたびに繰り返していた「Xxx_Init() を呼んでいるのにクラスが無い」
  // 「クラスはあるがメソッドが無い」「引数の個数が違う」を、grep 目視の前にここで出す。
  var MAUD = window.MA.methodAudit;
  var mres = MAUD ? MAUD.audit(docs) : { issues: [], calls: [] };
  var KIND_LABEL = { 'no-class': 'クラス無し', 'no-method': 'メソッド無し', arity: '引数違い' };
  html += '<div style="' + SECTION + '">メソッド突合 (呼び出しとクラス宣言)</div>';
  html += '<div id="na-method-summary" style="font-size:11px;color:var(--text-secondary);" ' +
    'data-calls="' + mres.calls.length + '" data-issues="' + mres.issues.length + '">' +
    '呼び出し ' + mres.calls.length + ' 件 — 指摘 ' + mres.issues.length + ' 件</div>';
  // BLK-primary-20260907-1303: 何を対象外にしたかを表の上に書く。書かないと
  // 「0 件」が「見ていないだけ」なのか「揃っている」のか、渡された側に分からない。
  if (MAUD && MAUD.excludedLine) {
    var exLine = MAUD.excludedLine(mres);
    if (exLine) {
      html += '<div id="na-method-excluded" style="font-size:11px;color:var(--text-secondary);" ' +
        'data-count="' + ((mres.excludedEvents || []).length) + '">' + esc(exLine) + '</div>';
    }
  }
  if (mres.issues.length === 0) {
    html += '<div id="na-no-methods" style="font-size:11px;color:var(--text-secondary);">' +
      '呼び出しと宣言は一致しています</div>';
  } else {
    html += '<table id="na-methods" style="border-collapse:collapse;width:100%;">';
    mres.issues.forEach(function(it) {
      html += '<tr class="na-method-row" data-kind="' + esc(it.kind) + '" data-method="' + esc(it.method) + '">' +
        '<td style="' + CELL + 'color:var(--accent-red);white-space:nowrap;">' + esc(KIND_LABEL[it.kind] || it.kind) + '</td>' +
        '<td style="' + CELL + 'font-family:var(--font-mono);">' + esc(it.method) + '()</td>' +
        '<td style="' + CELL + '">' + esc(MAUD.describe(it)) + '</td>' +
        '<td style="' + CELL + 'color:var(--text-secondary);">' + esc(it.docs.join(', ')) + '</td>' +
      '</tr>';
    });
    html += '</table>';
  }

  html += '<div style="' + SECTION + '">図 × 部品名</div>' +
    '<table id="na-matrix" style="border-collapse:collapse;width:100%;">' +
    '<tr><th style="' + CELL + 'text-align:left;">部品名</th>' +
    '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">種類</th>' +
    result.matrix.docs.map(function(n) {
      return '<th style="' + CELL + 'text-align:center;color:var(--text-secondary);font-weight:normal;">' + esc(n) + '</th>';
    }).join('') + '</tr>';
  result.matrix.rows.forEach(function(r) {
    html += '<tr class="na-matrix-row" data-name="' + esc(r.name) + '">' +
      '<td style="' + CELL + 'font-family:var(--font-mono);">' + esc(r.name) + '</td>' +
      '<td style="' + CELL + 'color:var(--text-secondary);">' + esc(r.kind || '—') + '</td>' +
      r.present.map(function(p, i) {
        return '<td class="na-cell" data-doc-index="' + i + '" data-present="' + (p ? '1' : '0') + '" ' +
          'style="' + CELL + 'text-align:center;' + (p ? 'cursor:pointer;' : 'color:var(--text-secondary);') + '">' +
          (p ? '●' : '·') + '</td>';
      }).join('') + '</tr>';
  });
  html += '</table>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button id="na-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button>' +
    '</div>';

  content.innerHTML = html;
  modal.style.display = 'flex';

  function close() { modal.style.display = 'none'; }

  var closeBtn = document.getElementById('na-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  // 揺れの 1 組を選んだ綴りへ寄せる。組の他の綴りを順に置換していく。
  var unifyBtns = content.querySelectorAll('.na-unify');
  for (var i = 0; i < unifyBtns.length; i++) {
    unifyBtns[i].addEventListener('click', function(ev) {
      var to = ev.currentTarget.getAttribute('data-to');
      var g = result.variants[Number(ev.currentTarget.getAttribute('data-gi'))];
      if (!g || !to) return;
      g.members.forEach(function(m) {
        if (m.name === to) return;
        renameAcrossDocs(m.name, to, _renameDocs());
      });
      openNameAudit();      // 置換後の状態で開き直す
    });
  }

  // ● のセルはその図へのショートカット。名前を追いかけて図を渡り歩ける。
  var cells = content.querySelectorAll('.na-cell');
  for (var j = 0; j < cells.length; j++) {
    cells[j].addEventListener('click', function(ev) {
      if (ev.currentTarget.getAttribute('data-present') !== '1') return;
      var idx = Number(ev.currentTarget.getAttribute('data-doc-index'));
      var target = docs[idx];
      if (!target || !window.MA.workspace) return;
      close();
      saveActiveDoc();
      window.MA.workspace.setActive(target.id);
      applyActiveDoc();
    });
  }

  return result;
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
  var btn = document.getElementById('btn-tab-lines');
  if (!le || !panel || !btn) return;
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

  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    _lineEditIndex = null;
    if (textEl) { textEl.value = ''; textEl.disabled = true; }
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left - 220) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    panel.classList.add('open');
    renderLineEditList();
    // 選択中の要素があればその行を初期選択にする (探す手数をゼロにする)。
    var sel = (window.MA.selection && window.MA.selection.getSelected()) || [];
    if (sel.length === 1 && sel[0] && typeof sel[0].line === 'number') {
      selectLineEditRow(sel[0].line);
    } else if (filterEl) {
      filterEl.focus();
    }
  });

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

// ── 構造 / Outline ─────────────────────────────────────────────────────────
// design/「PlantUMLAssist - リデザイン案」1a のエディタペインは DSL と
// 構造 (Outline) の 2 タブ。DSL 全文を目で追わずに図の骨格を掴み、
// 目的の要素の行へ 1 クリックで飛ぶための索引。
// 行の書き換えは行編集パネルの職掌なので、ここは「見る・飛ぶ」だけにする。

var _outlineTab = 'dsl';     // 'dsl' | 'outline'
var _outlineLine = null;     // 選択中の行 (0 始まり)

function setEditorTab(tab) {
  var wrap = document.getElementById('editor-wrap');
  var pane = document.getElementById('outline-pane');
  if (!wrap || !pane) return;
  _outlineTab = (tab === 'outline') ? 'outline' : 'dsl';
  var isOutline = _outlineTab === 'outline';
  wrap.style.display = isOutline ? 'none' : 'flex';
  if (isOutline) pane.classList.add('open'); else pane.classList.remove('open');
  Array.prototype.forEach.call(document.querySelectorAll('.editor-tab'), function(b) {
    var on = b.getAttribute('data-editor-tab') === _outlineTab;
    if (on) b.classList.add('active'); else b.classList.remove('active');
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (isOutline) {
    renderOutline();
    var f = document.getElementById('outline-filter');
    if (f) f.focus();
  } else if (editorEl) {
    editorEl.focus();
  }
}

function renderOutline() {
  var ol = window.MA.outline;
  var list = document.getElementById('outline-list');
  var summary = document.getElementById('outline-summary');
  if (!ol || !list || !summary) return;
  var result = ol.build(mmdText);
  var q = (document.getElementById('outline-filter') || {}).value || '';
  var rows = ol.filter(result.nodes, q);

  list.textContent = '';
  if (rows.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'outline-empty';
    empty.textContent = q
      ? '「' + q + '」に一致する要素はありません'
      : 'この図にはまだ要素がありません';
    list.appendChild(empty);
  }
  rows.forEach(function(n) {
    var row = document.createElement('div');
    row.className = 'outline-row' + (n.line === _outlineLine ? ' selected' : '');
    row.setAttribute('data-outline-line', String(n.line));
    row.setAttribute('data-outline-kind', n.kind);
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(n.depth + 1));
    var no = document.createElement('span');
    no.className = 'outline-no';
    no.textContent = String(n.line + 1);
    var kind = document.createElement('span');
    kind.className = 'outline-kind';
    kind.textContent = n.kind;
    var label = document.createElement('span');
    label.className = 'outline-label';
    // 入れ子は字下げで見せる (ブロックの内と外を取り違えないため)。
    label.style.paddingLeft = (n.depth * 12) + 'px';
    label.textContent = n.label;
    var detail = document.createElement('span');
    detail.className = 'outline-detail';
    detail.textContent = n.detail ? ': ' + n.detail : '';
    row.appendChild(no);
    row.appendChild(kind);
    row.appendChild(label);
    row.appendChild(detail);
    row.title = 'クリックで ' + (n.line + 1) + ' 行目へ移動し、その要素を選ぶ';
    row.addEventListener('click', function() { gotoOutlineLine(n.line); });
    list.appendChild(row);
  });

  // 何を数えたのかは図種で変わる (design 4a/4b/4c)。
  summary.textContent = ol.summary(result, currentDiagramType);
  if (result.ok) summary.classList.remove('ng'); else summary.classList.add('ng');
  if (!result.ok && result.errors.length) {
    summary.title = result.errors.map(function(e) { return e.message; }).join('\n');
  } else {
    summary.title = '';
  }
  renderOutlineCompare(result);
}

// BLK-junior-20260907-1703-wish: 先輩の図と「同じ形か」を、開いた瞬間に数で出す。
// 参照図はタブから選ぶ (compare-view と同じ選び方)。選んだ相手は覚えておくので、
// 図を直すたびに選び直さずに済む。
var _outlineCmpRefId = null;

function renderOutlineCompare(result) {
  var sel = document.getElementById('outline-cmp-select');
  var out = document.getElementById('outline-cmp-result');
  var cv = window.MA.compareView, cc = window.MA.countCompare;
  if (!sel || !out || !cv || !cc) return;

  var docs = _compareDocs();
  var activeId = window.MA.workspace ? window.MA.workspace.getActiveId() : null;
  var opts = cv.options(docs, activeId);
  var ref = cv.pick(docs, activeId, _outlineCmpRefId);

  sel.textContent = '';
  if (opts.length === 0) {
    _outlineCmpRefId = null;
    sel.disabled = true;
    var none = document.createElement('option');
    none.textContent = '(他のタブがありません)';
    sel.appendChild(none);
    out.className = '';
    out.textContent = '＋ で先輩の図をもう 1 枚開くと、要素数・関係数を突き合わせます。';
    return;
  }
  sel.disabled = false;
  opts.forEach(function(o) {
    var op = document.createElement('option');
    op.value = String(o.id);
    op.textContent = o.name + ' (' + String(o.diagramType || '').replace('plantuml-', '') + ')';
    if (ref && o.id === ref.id) op.selected = true;
    sel.appendChild(op);
  });

  _outlineCmpRefId = ref ? ref.id : null;
  var full = cv.doc ? (cv.doc(docs, _outlineCmpRefId) || {}) : {};
  var cmp = cc.compare(result.counts,
    window.MA.outline.build(full.dsl || '').counts,
    currentDiagramType, full.diagramType);
  out.className = cmp.comparable ? (cmp.same ? 'same' : 'diff') : '';
  out.textContent = cc.label(cmp);
}

// 構造の行を選ぶと DSL タブに戻り、その行をキャレット選択して見える位置に出す。
function gotoOutlineLine(line) {
  _outlineLine = line;
  var lines = String(mmdText || '').split('\n');
  if (line == null || line < 0 || line >= lines.length) return;
  setEditorTab('dsl');
  var start = 0;
  for (var i = 0; i < line; i++) start += lines[i].length + 1;
  var end = start + lines[line].length;
  if (!editorEl) return;
  editorEl.focus();
  editorEl.setSelectionRange(start, end);
  // 選んだ行が画面の中ほどに来るようにする (先頭に貼り付くと前後が見えない)。
  var lineHeight = editorEl.scrollHeight / Math.max(1, lines.length);
  editorEl.scrollTop = Math.max(0, (line * lineHeight) - (editorEl.clientHeight / 2));
  if (lineNumbersEl) lineNumbersEl.scrollTop = editorEl.scrollTop;
  // BLK-junior-20260907-2303: 行へ飛ぶだけではなく、その行の要素を選んだ
  // 状態にする。右パネルにその要素の編集フォームが出るので、
  // プレビュー上で座標を探し直さなくて済む。
  if (!selectElementAtLine(line + 1) && window.MA.selection) {
    // 選べない行 (@startuml など) では前の選択を残さない。
    // 右パネルに別の要素のフォームが出たままになると、
    // それを目的の要素だと思って編集してしまう。
    window.MA.selection.clearSelection();
  }
}

// ── 参照ペイン (2 枚の図を並べて見比べる) ────────────────────────────────
// 先輩の図を真似て書くとき、タブを行き来して記憶する往復が要らないように、
// 別のタブの図を右に出したまま編集を続けられるようにする。
// 参照側は読むだけ (選択・編集はしない)。スクロールは主プレビューと独立。

var _compareOpen = false;
var _compareRefId = null;    // 選んでいる参照図の doc id
var _compareShownDsl = null; // 直近に描いた DSL (同じなら描き直さない)

function _compareDocs() {
  if (!window.MA.workspace) return [];
  // 編集中の内容を workspace に載せてから読む (参照側が古い DSL にならない)。
  saveActiveDoc();
  try { return window.MA.workspace.list() || []; } catch (e) { return []; }
}

// BLK-primary-20260909-0303-wish: 「この図の変更前後」と「他の図との見比べ」は
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
  if (_compareOpen) {
    _compareShownDsl = null;   // 開き直したら必ず描く
    // 登録した雛形は 2 枚目のタブが無くても選べる (参照図が要らないのが登録の値打ち)。
    renderTemplateRegistry();
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
// 保存フォルダへ直接書いた回を ± 差分の基準に使えるか (BLK-primary-20260914-1206)。
// 使うのは「前回保存時点という基準が役に立たないとき」だけ:
//  - 基準がまだ無い (開き直した図・一度も保存していない図)
//  - 基準はあるが今と同じ (書いた後が基準になっていて、直した前後が出ない)
// どちらでもなければ従来どおり前回保存時点と比べる (意味を勝手にすり替えない)。
function _diffFallbackBasis(active, st) {
  var WH = window.MA.writeHistory;
  var SD = window.MA.saveDiff;
  if (!WH || !SD || !active || (st !== 'new' && st !== 'same')) return null;
  try {
    var entries = WH.forDoc(_reviewStore(), _wsFileDir(), active.name);
    for (var i = 0; i < entries.length; i++) {
      var pair = WH.pairOf(entries[i], active.name);
      if (!pair || SD.normalize(pair.before) === SD.normalize(active.dsl)) continue;
      return {
        dsl: pair.before,
        label: WH.kindLabel(entries[i].kind) + ' ' + WH.when(entries[i]) + ' の前',
      };
    }
  } catch (e) {}
  return null;
}

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
    var st = SD.statusOf(active.name, active.dsl);
    var at = SD.markedAt(active.name);
    var c = SD.changedLines(active.name, active.dsl);
    var head = esc(active.name) + ' ・ ';
    // BLK-primary-20260914-1206: 保存フォルダへ直接書いた図は「前回保存時点」が
    // 無い (または書いた後と同じ) ので、これまでは「まだ保存していない (基準なし)」
    // としか出ず、レビュー会議でその図の前後を出せなかった。基準が無い/変わって
    // いないときは、書き込み履歴の直近の回の **書く前** を基準に据える。
    var fb = _diffFallbackBasis(active, st);
    if (st === 'new') head += 'まだ保存していない (基準なし)';
    else if (st === 'same') head += '前回保存時点から変更なし';
    else head += '前回保存時点から +' + c.added + ' −' + c.removed;
    if (at) head += ' ・ 基準 ' + esc(at.replace('T', ' ').slice(0, 16));
    // 前回保存時点では前後が出せないとき、書き込み履歴の回を **足して** 出す。
    // 「前回保存時点と比べてどうか」は言い切ったままにする (意味をすり替えない)。
    var fc = fb ? SD.countBetween(fb.dsl, active.dsl) : null;
    if (fb) head += ' ・ ' + esc(fb.label) + 'から +' + fc.added + ' −' + fc.removed;
    html += '<div class="cd-head" id="compare-diff-head"'
      + (fb ? ' data-basis="write-history"' : '') + '>' + head + '</div>';
    var rowsOut = fb
      ? SD.diffBetween(fb.dsl, active.dsl)
      : (st === 'changed' ? SD.diffLines(active.name, active.dsl) : []);
    rowsOut.forEach(function(r) {
      var cls = r.mark === '+' ? 'add' : (r.mark === '-' ? 'del' : (r.mark === '…' ? 'skip' : ''));
      html += '<div class="cd-line ' + cls + '">' + esc(r.mark + ' ' + r.text) + '</div>';
    });
  }

  var others = docs.filter(function(d) {
    return d && d.id !== activeId && SD.statusOf(d.name, d.dsl) !== 'same';
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

// ── 書き込み履歴から並べる (BLK-primary-20260914-1206-wish) ─────────────────
// 保存フォルダへ直接書いた操作は、その図を開いていなくても前後が残っている。
// 編集中の図に当たる回を、参照ペインの候補として出す。
function _activeWriteHistory(docs, activeId) {
  var WH = window.MA.writeHistory;
  if (!WH || activeId == null) return [];
  var active = null;
  (docs || []).forEach(function(d) { if (d && d.id === activeId) active = d; });
  if (!active) return [];
  try {
    return WH.forDoc(_reviewStore(), _wsFileDir(), active.name).map(function(e) {
      var pair = WH.pairOf(e, active.name) || {};
      return {
        id: e.id,
        name: active.name,
        dsl: pair.before || '',
        label: WH.optionLabel(e, active.name),
      };
    }).filter(function(h) { return h.dsl; });
  } catch (e) { return []; }
}

// 一覧: そのフォルダで行った書き込み操作を新しい順に並べる。行を押すと
// その図を開き、その回の変更前を並べた状態にする (会議の「見せたい回を選ぶ」)。
function renderWriteHistory() {
  var WH = window.MA.writeHistory;
  var listEl = document.getElementById('compare-hist-list');
  var sum = document.getElementById('compare-hist-summary');
  if (!WH || !listEl) return;
  var entries = [];
  try { entries = WH.list(_reviewStore(), _wsFileDir()); } catch (e) { entries = []; }
  if (sum) sum.textContent = entries.length ? entries.length + ' 回' : '記録なし';
  listEl.textContent = '';
  if (!entries.length) {
    var empty = document.createElement('div');
    empty.id = 'compare-hist-empty';
    empty.style.cssText = 'font-size:10px;color:var(--text-secondary);padding:4px 8px;';
    empty.textContent = '⇄ 一括置換・🔖 [適用] で保存フォルダへ書くと、'
      + 'その回の前後がここに残ります (ブラウザを開き直しても残ります)。';
    listEl.appendChild(empty);
    return;
  }
  entries.forEach(function(e) {
    var row = document.createElement('div');
    row.className = 'wh-entry';
    row.setAttribute('data-hist-id', e.id);
    var head = document.createElement('div');
    head.className = 'wh-head';
    head.textContent = WH.label(e);
    row.appendChild(head);
    (e.files || []).forEach(function(f) {
      var fr = document.createElement('button');
      fr.type = 'button';
      fr.className = 'wh-file';
      fr.setAttribute('data-doc-name', f.name);
      fr.textContent = f.name;
      fr.title = f.name + ' のこの回の変更前を並べて見る';
      fr.addEventListener('click', function() { showWriteHistoryPair(e.id, f.name); });
      row.appendChild(fr);
    });
    var drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'wh-drop';
    drop.textContent = '捨てる';
    drop.title = 'この回の控えを捨てる';
    drop.addEventListener('click', function() {
      try { WH.drop(_reviewStore(), _wsFileDir(), e.id); } catch (err) {}
      if (_compareRefId === (window.MA.compareView.HIST_PREFIX + e.id)) {
        _compareRefId = null;
        _compareShownDsl = null;
      }
      renderWriteHistory();
      renderCompareView();
    });
    row.appendChild(drop);
    listEl.appendChild(row);
  });
}

// その回・その図を並べた状態にする。開いていない図はフォルダから開く
// (開いてからでないと「今」の側が出せない)。
function showWriteHistoryPair(entryId, name) {
  var WS = window.MA.workspace;
  var CV = window.MA.compareView;
  if (!CV) return;
  var target = null;
  ((WS && WS.list()) || []).forEach(function(d) { if (d.name === name) target = d; });
  var go = function() {
    _compareRefId = CV.HIST_PREFIX + entryId;
    _compareShownDsl = null;
    toggleCompareView(true, 'ref');
    renderCompareView();
  };
  if (target) { switchToDoc(target.id); go(); return; }
  openFromFolderByName(name);
  window.setTimeout(go, 400);
}

function toggleWriteHistory(open) {
  var listEl = document.getElementById('compare-hist-list');
  var btn = document.getElementById('btn-compare-hist');
  if (!listEl) return;
  var show = (open == null) ? listEl.hidden : !!open;
  listEl.hidden = !show;
  if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) renderWriteHistory();
}

// 編集中の図の「変更前スナップショット」(BLK-primary-20260908-2203-wish)。
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
  var showing = !!(snap && ref && ref.isBefore && !ref.isHistory);
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
  var hist = _activeWriteHistory(docs, activeId);
  var ref = cv.pick(docs, activeId, _compareRefId, snap, hist);
  var opts = cv.options(docs, activeId, snap, hist);
  renderWriteHistory();

  sel.textContent = '';
  opts.forEach(function(o) {
    var op = document.createElement('option');
    op.value = String(o.id);
    // 「変更前」の候補は図種を添えない。名前に既に (変更前) が入っており、
    // 図種まで並ぶと別の図と読み違える。
    // 覗いた 1 枚も図種を添えない (名前が `primary / timer_state.puml` の形で、
    // どこの図かは名前だけで読める)。
    op.textContent = (o.isBefore || o.isPeek) ? o.name
      : o.name + ' (' + String(o.diagramType || '').replace('plantuml-', '') + ')';
    if (o.isBefore && !o.isHistory) op.setAttribute('data-before', '1');
    if (o.isHistory) op.setAttribute('data-hist', '1');
    if (o.isPeek) op.setAttribute('data-peek', '1');
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
    msg.textContent = '並べる図がありません。＋ で 2 枚目のタブを開くか、'
      + '「他の保存フォルダを覗く」で手本を選んで「⇔ 自分の図と並べる」を押してください。';
    host.appendChild(msg);
    return;
  }

  _compareRefId = ref.id;
  var full = cv.doc(docs, ref.id, activeId, snap, hist) || {};
  var dsl = full.dsl || '';
  if (dsl === _compareShownDsl) return;   // 中身が変わっていなければ描き直さない
  _compareShownDsl = dsl;
  if (status) status.textContent = '描画中…';
  renderDslToSvg(dsl).then(function(svg) {
    // 描いている間に参照図が切り替わっていたら捨てる (遅れて届いた結果で上書きしない)
    if (!_compareOpen || _compareShownDsl !== dsl) return;
    host.innerHTML = svg;
    if (status) {
      status.textContent = full.isBefore ? '変更前 (読むだけ)'
        : full.isPeek ? '手本 ' + (full.folder || '他フォルダ') + ' (読むだけ)'
        : '参照 (読むだけ)';
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

// ── 整合チェック (BLK-junior-20260907-0843-wish) ──────────────────────────
// 同じ雛形を部品名だけ替えて書き写す業務では、打ち間違い・並べ間違いが毎回起きる。
// 参照図と突き合わせて食い違いを保存前に挙げ、行を押すとその行へ飛ぶ。
// 判断は consistency-check が持ち、ここは押した結果を並べるだけ。
var _checkFindings = [];

// 参照図を替えたら前の指摘は捨てる (どの図に対する指摘か分からなくなるため)。
function _clearCheckList() {
  _checkFindings = [];
  var listEl = document.getElementById('check-list');
  var sumEl = document.getElementById('check-summary');
  if (listEl) { listEl.textContent = ''; listEl.hidden = true; }
  if (sumEl) { sumEl.textContent = ''; sumEl.classList.remove('clean', 'dirty'); }
}

function renderCheckList() {
  var listEl = document.getElementById('check-list');
  var sumEl = document.getElementById('check-summary');
  var cc = window.MA.consistencyCheck;
  if (!listEl || !sumEl || !cc) return;

  listEl.textContent = '';
  listEl.hidden = false;
  sumEl.textContent = cc.summary(_checkFindings);
  sumEl.classList.remove('clean', 'dirty');
  sumEl.classList.add(_checkFindings.length === 0 ? 'clean' : 'dirty');

  if (_checkFindings.length === 0) {
    var ok = document.createElement('div');
    ok.id = 'check-empty';
    ok.textContent = '参照図との食い違いはありません。';
    listEl.appendChild(ok);
    return;
  }
  var LABEL = { order: '並び', suffix: '語尾', typo: '打ち間違い' };
  _checkFindings.forEach(function(f) {
    var row = document.createElement('div');
    row.className = 'check-row';
    row.setAttribute('data-check-kind', f.kind);
    if (f.line != null) row.setAttribute('data-check-line', String(f.line));
    var kind = document.createElement('span');
    kind.className = 'check-kind';
    kind.textContent = LABEL[f.kind] || f.kind;
    var no = document.createElement('span');
    no.className = 'check-no';
    no.textContent = f.line == null ? '—' : String(f.line + 1);
    var msg = document.createElement('span');
    msg.className = 'check-msg';
    msg.textContent = f.message;
    row.appendChild(kind); row.appendChild(no); row.appendChild(msg);
    if (f.line != null) {
      row.addEventListener('click', function() { gotoOutlineLine(f.line); });
    }
    listEl.appendChild(row);
  });
}

function runConsistencyCheck() {
  var cc = window.MA.consistencyCheck;
  var cv = window.MA.compareView;
  var sumEl = document.getElementById('check-summary');
  var listEl = document.getElementById('check-list');
  if (!cc || !cv || !sumEl) return;
  var ref = _compareRefId ? cv.doc(_compareDocs(), _compareRefId) : null;
  if (!ref) {
    _checkFindings = [];
    sumEl.classList.remove('clean', 'dirty');
    sumEl.textContent = '参照図を選んでください';
    if (listEl) { listEl.textContent = ''; listEl.hidden = true; }
    return;
  }
  _checkFindings = cc.check(ref.dsl || '', mmdText).findings;
  renderCheckList();
}

// ── 対応表 (BLK-junior-20260908-0823-wish) ────────────────────────────────
// 先輩の図と自分の図は、同じ GPIO ドライバの状態遷移でも状態名・イベント名・
// 抽象度がばらばらで、読み比べても「先輩が後から足した 1 要素」を名前だけでは
// 当てられない。名前の形だけで対応を機械的に取り、対応が付いた組と
// 片方にしか無い状態・遷移を分けて出す。行を押すと自分の図のその行へ飛ぶ
// (参照図だけの行は、押しても飛び先が無いので参照図の行番号を出すだけ)。
// 対応の規則は state-map が持ち、ここは並べるだけ。
//
// BLK-junior-20260908-1103-wish: 参照図だけの行 (橙) には「＋この図にも足す」を
// 付ける。見つけた要素をそのまま自分の図の末尾に入れられれば、
// 「読み比べて一括入力欄に打ち直す」がボタン 1 回になる。
// 端点の対応が付かない遷移だけ、どの状態から出すかを 1 回聞き返す。
//
// BLK-junior-20260908-1203-wish: クラス図にも同じ対応表を出す。図種で使う規則を
// 選ぶだけで、並べ方も「＋この図にも足す」も共通にする (図種によらず同じ操作)。
// クラス図の関係は向き (どちらが親か) を行に持つので、取り込みでは参照図の向きを
// そのまま写す。Relation フォームで From/To を選び直して逆向きに張る手間が消える。
//
// BLK-junior-20260908-0823 (差し戻し 1 回目): 名前の形だけで組んだ対応は、
// 抽象度の違う 2 枚では当たらない。「参照図だけ」の行が先輩の足した要素なのか、
// 対応を取り損ねただけなのかを機械は決められない。対応そのものを人が
// 「同じもの」「対応なし」で決められるようにし、推測が 0 件になった時点で
// 残った「参照図だけ」を言い切る。決めた内容は図の組ごとに憶えておく。
var _mapResult = null;
var _mapMineParsed = null;
var _mapRefParsed = null;
var _mapModule = null;   // 今の対応表が使っている規則 (stateMap / classMap)
var _mapOverrides = null;
var _mapOverrideKey = '';

var MAP_OVERRIDE_KEY = 'plantuml-state-map-overrides';

function _loadMapOverrides(key) {
  var sm = _mapper();
  var empty = (sm && sm.overrides) ? sm.overrides(null) : { pairs: [], none: [] };
  if (!key) return empty;
  try {
    var raw = window.localStorage.getItem(MAP_OVERRIDE_KEY);
    if (raw == null) return empty;
    var all = JSON.parse(raw);
    if (!all || typeof all !== 'object') return empty;
    return (sm && sm.overrides) ? sm.overrides(all[key]) : empty;
  } catch (e) { return empty; }
}

function _saveMapOverrides(key, ov) {
  if (!key) return;
  try {
    var raw = window.localStorage.getItem(MAP_OVERRIDE_KEY);
    var all = {};
    if (raw != null) {
      var v = JSON.parse(raw);
      if (v && typeof v === 'object') all = v;
    }
    if ((ov.pairs || []).length === 0 && (ov.none || []).length === 0) delete all[key];
    else all[key] = ov;
    window.localStorage.setItem(MAP_OVERRIDE_KEY, JSON.stringify(all));
  } catch (e) { /* 憶えられなくても対応表そのものは使える */ }
}

// 決めた内容を入れ替えて、対応表を組み直して描き直す。
function setMapOverrides(ov) {
  var sm = _mapper();
  if (!sm || !sm.supportsOverrides || !_mapRefParsed || !_mapMineParsed) return;
  _mapOverrides = sm.overrides(ov);
  _saveMapOverrides(_mapOverrideKey, _mapOverrides);
  _mapResult = sm.build(_mapRefParsed, _mapMineParsed, _mapOverrides);
  renderStateMap();
}

function _mapper() { return _mapModule || window.MA.stateMap; }

// 図種を選ぶ。自分の図が読めればそれに合わせる。読めないときだけ参照図を見る。
function _pickMapModule(refText, mineText) {
  var classMod = window.MA.modules && window.MA.modules.plantumlClass;
  if (!window.MA.classMap || !classMod) return window.MA.stateMap;
  if (classMod.detect(mineText || '')) return window.MA.classMap;
  var stateMod = window.MA.modules && window.MA.modules.plantumlState;
  var mineStates = stateMod ? stateMod.parse(mineText || '') : null;
  var hasState = mineStates
    && (((mineStates.states || []).length > 0) || ((mineStates.transitions || []).length > 0));
  if (!hasState && classMod.detect(refText || '')) return window.MA.classMap;
  return window.MA.stateMap;
}

function _clearStateMap() {
  _mapResult = null;
  _mapMineParsed = null;
  _mapRefParsed = null;
  _mapModule = null;
  _mapOverrides = null;
  _mapOverrideKey = '';
  var listEl = document.getElementById('map-list');
  var sumEl = document.getElementById('map-summary');
  var warnEl = document.getElementById('map-warn');
  var askedEl = document.getElementById('map-asked');
  var decEl = document.getElementById('map-decision');
  if (decEl) decEl.hidden = true;
  if (listEl) { listEl.textContent = ''; listEl.hidden = true; }
  if (warnEl) { warnEl.textContent = ''; warnEl.hidden = true; }
  if (askedEl) { askedEl.textContent = ''; askedEl.hidden = true; }
  if (sumEl) { sumEl.textContent = ''; sumEl.classList.remove('clean', 'dirty'); }
}

function _mapSection(listEl, title) {
  var head = document.createElement('div');
  head.className = 'map-head';
  head.textContent = title;
  listEl.appendChild(head);
}

function _mapRow(listEl, row) {
  var sm = _mapper();
  var el = document.createElement('div');
  el.className = 'map-row';
  el.setAttribute('data-map-match', row.match);
  el.setAttribute('data-map-type', row.type);
  if (row.decided) el.setAttribute('data-map-decided', '1');
  if (row.mineLine != null) el.setAttribute('data-map-line', String(row.mineLine));

  var match = document.createElement('span');
  match.className = 'map-match';
  match.textContent = sm.matchLabel(row.match);
  var ref = document.createElement('span');
  ref.className = 'map-ref';
  ref.textContent = row.ref || '—';
  if (row.ref) ref.title = row.ref;
  var mine = document.createElement('span');
  mine.className = 'map-mine';
  mine.textContent = row.mine || '—';
  if (row.mine) mine.title = row.mine;
  el.appendChild(match); el.appendChild(ref); el.appendChild(mine);

  // 自分の図に対応する行があるなら、押してそこへ飛ぶ。
  // 参照図は読むだけなので、参照図だけの行は飛び先を持たない。
  if (row.mineLine != null) {
    el.addEventListener('click', function() { gotoOutlineLine(row.mineLine - 1); });
  }
  _mapDecideControls(el, row);
  // 不一致の行は、機械では「どちらが後から足したか」まで決められない。
  // 自分で決め切らずに先輩・reviewer へ 1 件の質問として預けて、次へ進む
  // (BLK-junior-20260908-0923-wish)。
  var mq = window.MA.mapQuestion;
  if (mq && mq.askable(row)) {
    var ask = document.createElement('button');
    ask.type = 'button';
    ask.className = 'map-ask';
    var asked = mq.hasAsked(mmdText, row);
    ask.textContent = mq.buttonLabel(mmdText, row);
    ask.title = asked
      ? 'この行はもう ' + mq.defaultTo().join(' / ') + ' に預けてあります'
      : 'この行を ' + mq.defaultTo().join(' / ') + ' への質問 1 件にして図に残す (答えは待たない)';
    ask.disabled = asked;
    ask.addEventListener('click', function(e) {
      e.stopPropagation();
      askMapRow(row);
    });
    el.appendChild(ask);
  }
  // 参照図だけの行は「まだ自分の図に無い要素」なので、その場で足せる。
  if (row.match === 'ref-only') {
    var take = document.createElement('button');
    take.type = 'button';
    take.className = 'map-take';
    take.textContent = '＋この図にも足す';
    take.title = 'この要素を自分の図の末尾に足す';
    take.addEventListener('click', function(e) {
      e.stopPropagation();
      adoptMapRow(row, el);
    });
    el.appendChild(take);
  }
  listEl.appendChild(el);
}

// 1 行に「同じもの」「対応なし」「戻す」を付ける (BLK-junior-20260908-0823)。
// 機械が組んだ行は人が見て確かめるまで推測のままで、決めた行だけが確定になる。
function _mapDecideControls(el, row) {
  var sm = _mapper();
  if (!sm || !sm.supportsOverrides || !_mapOverrides) return;
  var ov = _mapOverrides;

  function btn(text, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'map-decide';
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
    el.appendChild(b);
    return b;
  }

  if (row.decided) {
    btn('戻す', 'この行の対応の決めを取り消して、機械の推測に戻す', function() {
      var next = ov;
      if (row.ref) next = sm.without(next, row.type, 'ref', row.ref);
      if (row.mine) next = sm.without(next, row.type, 'mine', row.mine);
      setMapOverrides(next);
    });
    return;
  }

  // 機械が組にした行 — その組でよいか、別物かを決める。
  if (row.ref && row.mine) {
    btn('同じもの', 'この 2 つは同じものだと決める (推測が 1 件減る)', function() {
      setMapOverrides(sm.withPair(ov, row.type, row.ref, row.mine));
    });
    btn('別もの', 'この 2 つは別ものだと決め、それぞれ相手のいない要素として分ける', function() {
      var next = sm.withNone(ov, row.type, 'ref', row.ref);
      next = sm.withNone(next, row.type, 'mine', row.mine);
      setMapOverrides(next);
    });
    return;
  }

  // 片方だけの行 — 相手を選び直すか、相手がいないと決める。
  var side = row.match === 'ref-only' ? 'ref' : 'mine';
  var name = side === 'ref' ? row.ref : row.mine;
  if (!name) return;
  var opts = sm.pairOptions(_mapResult, row);
  if (opts.length > 0) {
    var sel = document.createElement('select');
    sel.className = 'map-pick';
    sel.title = 'この要素に対応する相手を選ぶ';
    var head = document.createElement('option');
    head.value = '';
    head.textContent = '対応を選ぶ…';
    sel.appendChild(head);
    opts.forEach(function(o) {
      var op = document.createElement('option');
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
    sel.addEventListener('click', function(e) { e.stopPropagation(); });
    sel.addEventListener('change', function(e) {
      e.stopPropagation();
      if (sel.value === '') return;
      var refName = side === 'ref' ? name : sel.value;
      var mineName = side === 'ref' ? sel.value : name;
      setMapOverrides(sm.withPair(ov, row.type, refName, mineName));
    });
    el.appendChild(sel);
  }
  btn('対応なし', '自分の図に対応する相手はいないと決める (足すかどうかはこの後に選ぶ)', function() {
    setMapOverrides(sm.withNone(ov, row.type, side, name));
  });
}

// 端点の対応が付かない遷移を足す前の確認。聞くのは対応の付かなかった端点だけ。
function _mapConfirm(row, rowEl, plan) {
  _closeMapConfirm();
  var box = document.createElement('div');
  box.className = 'map-confirm';
  box.id = 'map-confirm';

  var lead = document.createElement('div');
  lead.className = 'map-confirm-lead';
  lead.id = 'map-confirm-lead';
  lead.textContent = plan.describe + '。自分の図に対応する'
    + (plan.kind === 'relation' ? 'クラス' : '状態') + 'が見つからない端点があります。';
  box.appendChild(lead);

  var sels = {};
  plan.needs.forEach(function(end) {
    var line = document.createElement('div');
    line.className = 'map-confirm-row';
    line.setAttribute('data-side', end.side);

    var label = document.createElement('span');
    label.className = 'map-confirm-label';
    label.textContent = (end.sideLabel || (end.side === 'from' ? '出どころ' : '行き先'))
      + ' 「' + end.name + '」';
    line.appendChild(label);

    var sel = document.createElement('select');
    sel.className = 'map-confirm-sel';
    sel.id = 'map-confirm-' + end.side;
    var mk = document.createElement('option');
    mk.value = _mapper().NEW_STATE;
    mk.textContent = '新しく作る: ' + (end.newLabel || end.newId);
    sel.appendChild(mk);
    (end.options || []).forEach(function(o) {
      var op = document.createElement('option');
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
    line.appendChild(sel);
    sels[end.side] = sel;
    box.appendChild(line);
  });

  var ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'map-confirm-ok';
  ok.id = 'btn-map-confirm-ok';
  ok.textContent = 'これで足す';
  ok.addEventListener('click', function() {
    var picks = {};
    Object.keys(sels).forEach(function(k) { picks[k] = sels[k].value; });
    _closeMapConfirm();
    _applyMapAdopt(row, picks);
  });
  box.appendChild(ok);

  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'map-confirm-cancel';
  cancel.id = 'btn-map-confirm-cancel';
  cancel.textContent = 'やめる';
  cancel.addEventListener('click', function() { _closeMapConfirm(); });
  box.appendChild(cancel);

  if (rowEl && rowEl.parentNode) rowEl.parentNode.insertBefore(box, rowEl.nextSibling);
  // 一覧は高さが限られているので、聞き返しが下に隠れたままにならないようにする。
  if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
}

function _closeMapConfirm() {
  var old = document.getElementById('map-confirm');
  if (old && old.parentNode) old.parentNode.removeChild(old);
}

// 橙の行を 1 つ自分の図に足す。端点が全部決まっていれば聞かずに足す。
function adoptMapRow(row, rowEl) {
  var sm = _mapper();
  if (!sm || !_mapResult || !editorEl) return;
  var plan = sm.adoptPlan(row, _mapResult, _mapMineParsed);
  if (!plan || !plan.adoptable) return;
  if (!plan.ready) { _mapConfirm(row, rowEl, plan); return; }
  _applyMapAdopt(row, null);
}

function _applyMapAdopt(row, picks) {
  var sm = _mapper();
  if (!sm || !_mapResult || !editorEl) return;
  var out = sm.applyAdopt(editorEl.value, row, _mapResult, _mapMineParsed, picks);
  if (!out) return;
  editorEl.value = out.text;
  editorEl.dispatchEvent(new Event('input'));
  jumpToLine(out.line);
  // 足したものは自分の図に入ったので、「対応なし」と決めた覚えは外す
  // (外さないと、足したのに参照図だけの行として残り続ける)。
  if (sm.supportsOverrides && _mapOverrides && row.ref) {
    _saveMapOverrides(_mapOverrideKey, sm.without(_mapOverrides, row.type, 'ref', row.ref));
  }
  // 足した分だけ橙が減るので、対応表を作り直して残りを見せる。
  runStateMap();
  if (window.MA.toast) window.MA.toast.show('自分の図に足しました: ' + out.added.join(' / '));
}

// 不一致の行 1 つを、先輩・reviewer 宛ての質問 1 件にして自分の図に残す
// (BLK-junior-20260908-0923-wish)。図と一緒に保存フォルダへ渡るので、相手の
// 「📮 指摘箱」に並ぶ。ここで答えを待たないのが要点なので、飛び先へは移動しない。
function askMapRow(row) {
  var mq = window.MA.mapQuestion;
  if (!mq || !editorEl) return;
  var out = mq.ask(mmdText, row, {
    author: (typeof _inboxMe === 'function' && _inboxMe()) || 'junior',
    at: new Date().toISOString().slice(0, 16),
  });
  if (!out) {
    if (window.MA.toast) window.MA.toast.show('この行はもう預けてあります');
    return;
  }
  _applyLineEditText(out.text);
  renderPinBadge();
  renderPinPanel();
  // 「聞き済み」に変わった印を出すため対応表を描き直す (組み直しはしない)。
  renderStateMap();
  if (window.MA.toast) {
    window.MA.toast.show(out.to.join(' / ') + ' に預けました: ' + out.question);
  }
}

function renderMapAsked() {
  var el = document.getElementById('map-asked');
  var mq = window.MA.mapQuestion;
  if (!el) return;
  var text = mq ? mq.summary(mmdText) : '';
  el.textContent = text;
  el.hidden = (text === '');
}

// 対応をどこまで決めたか。ここが「取り込む 1 個を選んでよいか」の判断そのものなので、
// 表の上に常に出す (行を 1 つ決めるたびに件数が減る)。
function renderMapDecision() {
  var el = document.getElementById('map-decision');
  var textEl = document.getElementById('map-decision-text');
  var resetEl = document.getElementById('btn-map-reset');
  var sm = _mapper();
  if (!el || !textEl) return;
  if (!sm || !sm.supportsOverrides || !_mapResult) {
    el.hidden = true;
    return;
  }
  var text = sm.decisionSummary(_mapResult);
  el.hidden = (text === '');
  textEl.textContent = text;
  el.classList.toggle('settled', sm.settled(_mapResult));
  if (resetEl) {
    var ov = _mapOverrides || { pairs: [], none: [] };
    resetEl.hidden = ((ov.pairs || []).length + (ov.none || []).length) === 0;
  }
}

function renderStateMap() {
  var listEl = document.getElementById('map-list');
  var sumEl = document.getElementById('map-summary');
  var warnEl = document.getElementById('map-warn');
  var sm = _mapper();
  if (!listEl || !sumEl || !sm || !_mapResult) return;

  _closeMapConfirm();
  listEl.textContent = '';
  listEl.hidden = false;
  sumEl.textContent = sm.summary(_mapResult);
  sumEl.classList.remove('clean', 'dirty');
  var onlyCount = _mapResult.states.concat(_mapResult.transitions).filter(function(r) {
    return r.match === 'ref-only' || r.match === 'mine-only';
  }).length;
  sumEl.classList.add(onlyCount === 0 ? 'clean' : 'dirty');

  renderMapAsked();
  renderMapDecision();
  var warn = sm.abstractionWarning(_mapResult);
  if (warnEl) {
    warnEl.textContent = warn;
    warnEl.hidden = (warn === '');
  }

  if (_mapResult.states.length === 0 && _mapResult.transitions.length === 0) {
    var empty = document.createElement('div');
    empty.id = 'map-empty';
    empty.textContent = sm.emptyMessage;
    listEl.appendChild(empty);
    return;
  }
  if (_mapResult.states.length > 0) {
    _mapSection(listEl, sm.sectionTitles.states);
    _mapResult.states.forEach(function(r) { _mapRow(listEl, r); });
  }
  if (_mapResult.transitions.length > 0) {
    _mapSection(listEl, sm.sectionTitles.transitions);
    _mapResult.transitions.forEach(function(r) { _mapRow(listEl, r); });
  }
}

function runStateMap() {
  var cv = window.MA.compareView;
  var stateMod = window.MA.modules && window.MA.modules.plantumlState;
  var sumEl = document.getElementById('map-summary');
  var listEl = document.getElementById('map-list');
  if (!cv || !stateMod || !sumEl) return;

  var ref = _compareRefId ? cv.doc(_compareDocs(), _compareRefId) : null;
  if (!ref) {
    _clearStateMap();
    sumEl.textContent = '参照図を選んでください';
    sumEl.classList.add('dirty');
    return;
  }
  // 図種の設定は見ずに、中身が何として読めるかで規則を選ぶ。設定が実際の中身と
  // 食い違っていることがあり、設定を直させるより読める方を採る。
  var sm = _pickMapModule(ref.dsl || '', mmdText || '');
  _mapModule = sm;
  var mod = (sm === window.MA.classMap)
    ? (window.MA.modules && window.MA.modules.plantumlClass)
    : stateMod;
  var refParsed = mod.parse(ref.dsl || '');
  var mineParsed = mod.parse(mmdText || '');
  _mapMineParsed = mineParsed;
  _mapRefParsed = refParsed;
  // 決めた対応は「この参照図とこの図」の組ごとに憶える。別の図を相手にしたときに
  // 前の決めが混ざると、決めていない対応が決まったことになってしまう。
  _mapOverrideKey = sm.supportsOverrides
    ? (String(ref.name || ref.id || '') + ' | ' + String(_activeDocName() || ''))
    : '';
  _mapOverrides = sm.supportsOverrides ? _loadMapOverrides(_mapOverrideKey) : null;
  _mapResult = sm.build(refParsed, mineParsed, _mapOverrides);
  renderStateMap();
  if (listEl) listEl.hidden = false;
}

// ── 雛形との差分 (BLK-junior-20260908-1303-wish) ───────────────────────────
// UART / CAN / GPIO の初期化図は、同じ雛形をペリフェラル名だけ変えて複製したもの。
// これまでは 2 枚をまっさらな図として全文読み比べ、構造が同じかどうかを毎回
// 目で判断していた。参照図を雛形とみなし、題材語を伏せて行を突き合わせて
// 「この図だけ / 雛形だけ」の行を出す。並び替えは差分にしない。
function _clearTemplateDiff() {
  var listEl = document.getElementById('td-list');
  var noteEl = document.getElementById('td-note');
  var sumEl = document.getElementById('td-summary');
  if (listEl) { listEl.textContent = ''; listEl.hidden = true; }
  if (noteEl) { noteEl.textContent = ''; noteEl.hidden = true; }
  if (sumEl) { sumEl.textContent = ''; sumEl.classList.remove('clean', 'dirty'); }
}

// ── 雛形を登録して残す (BLK-junior-20260908-1403-wish) ─────────────────────
// 「雛形との差分」の相手は毎回その場で探していた。別の人のフォルダにある図なら
// 「🧩 相手のフォルダ」に絶対パスを打ち直し、名前の近い図を選び直す。同じ 2 枚を
// 何周も突き合わせる業務では、この探し直しだけが毎周積み上がる。
// ここは雛形を 1 回登録して呼び名で選べるようにする。登録は localStorage に残るので
// 次の周・次の図種でもそのまま選べる。保存先設定 (autoSave の fileDir) には触らない。
var TR_KEY = 'pua.templateRegistry';
var _trList = null;      // 登録済みの雛形 (遅延読み込み)
var _trPickedId = '';    // 選んでいる登録の id。空なら参照図を雛形にする

function _trMod() { return window.MA.templateRegistry; }

function _trLoad() {
  if (_trList) return _trList;
  var TR = _trMod();
  var raw = '';
  try { raw = (window.localStorage && window.localStorage.getItem(TR_KEY)) || ''; } catch (e) { raw = ''; }
  _trList = TR ? TR.parse(raw) : [];
  return _trList;
}

function _trSave(list) {
  var TR = _trMod();
  _trList = TR ? TR.normalize(list) : [];
  try {
    if (window.localStorage) window.localStorage.setItem(TR_KEY, TR ? TR.serialize(_trList) : '[]');
  } catch (e) { /* 使えない環境でも登録はその場では効く */ }
  return _trList;
}

function _trMessage(text, cls) {
  var el = document.getElementById('tr-note');
  if (!el) return;
  el.textContent = text || '';
  el.className = cls || '';
  el.hidden = !text;
}

// 一覧を描く。既定は「参照図を雛形にする」。図の名前に近い登録があればそれを既定に
// 選んでおく (毎回どれと比べるかを選び直さないで済む)。
function renderTemplateRegistry() {
  var TR = _trMod();
  var sel = document.getElementById('tr-pick');
  var label = document.getElementById('tr-label');
  if (!TR || !sel) return;
  var list = _trLoad();
  if (_trPickedId && !TR.get(list, _trPickedId)) _trPickedId = '';
  if (!_trPickedId) {
    var near = TR.suggestFor(list, _activeDocName());
    if (near) _trPickedId = near.id;
  }
  sel.textContent = '';
  var none = document.createElement('option');
  none.value = '';
  none.textContent = '参照図を雛形にする';
  sel.appendChild(none);
  list.forEach(function(e) {
    var op = document.createElement('option');
    op.value = e.id;
    op.textContent = e.label;
    if (e.id === _trPickedId) op.selected = true;
    sel.appendChild(op);
  });
  if (label && !label.value) label.value = TR.suggestLabel(_activeDocName());
  var picked = _trPickedId ? TR.get(list, _trPickedId) : null;
  _trMessage(picked ? TR.originNote(picked) : TR.summary(list), picked ? 'clean' : '');
}

// いま開いている図を雛形として登録する。呼び名が空なら図の名前から下書きする。
function registerTemplate() {
  var TR = _trMod();
  var labelEl = document.getElementById('tr-label');
  if (!TR) return null;
  var dsl = editorEl ? editorEl.value : (mmdText || '');
  if (String(dsl).trim() === '') {
    _trMessage('この図には中身がありません (雛形にできません)', 'dirty');
    return null;
  }
  var label = labelEl ? labelEl.value.trim() : '';
  if (!label) label = TR.suggestLabel(_activeDocName());
  if (!label) {
    _trMessage('雛形の呼び名を入れてください', 'dirty');
    return null;
  }
  var before = _trLoad();
  var existed = !!TR.byLabel(before, label);
  var list = _trSave(TR.add(before, { label: label, source: _activeDocName(), dsl: dsl }));
  var saved = TR.byLabel(list, label);
  _trPickedId = saved ? saved.id : '';
  if (labelEl) labelEl.value = '';
  renderTemplateRegistry();
  _trMessage('雛形「' + label + '」を' + (existed ? '登録し直しました' : '登録しました')
    + ' (次からはこの呼び名を選ぶだけです)', 'clean');
  return saved;
}

function forgetTemplate() {
  var TR = _trMod();
  if (!TR) return;
  var list = _trLoad();
  var picked = _trPickedId ? TR.get(list, _trPickedId) : null;
  if (!picked) {
    _trMessage('消す登録を選んでください', 'dirty');
    return;
  }
  _trSave(TR.remove(list, picked.id));
  _trPickedId = '';
  _clearTemplateDiff();
  renderTemplateRegistry();
  _trMessage('雛形「' + picked.label + '」の登録を消しました', '');
}

// 差分の相手。登録した雛形を選んでいればそれ、選んでいなければ参照図。
function _templateSource() {
  var TR = _trMod();
  var cv = window.MA.compareView;
  var picked = (TR && _trPickedId) ? TR.get(_trLoad(), _trPickedId) : null;
  if (picked) return { dsl: picked.dsl, note: TR.originNote(picked) };
  var ref = (cv && _compareRefId) ? cv.doc(_compareDocs(), _compareRefId) : null;
  if (ref) return { dsl: ref.dsl || '', note: '参照図「' + (ref.name || ref.id) + '」を雛形にしています' };
  return null;
}

function runTemplateDiff() {
  var td = window.MA.templateDiff;
  var sumEl = document.getElementById('td-summary');
  var listEl = document.getElementById('td-list');
  var noteEl = document.getElementById('td-note');
  if (!td || !sumEl || !listEl) return;

  var src = _templateSource();
  if (!src) {
    _clearTemplateDiff();
    sumEl.textContent = '雛形にする参照図を選んでください (この図を「📌 雛形に登録」しても比べられます)';
    sumEl.classList.add('dirty');
    return;
  }
  _trMessage(src.note, 'clean');
  var diff = td.build(src.dsl, mmdText || '');
  sumEl.textContent = td.summary(diff);
  sumEl.classList.remove('clean', 'dirty');
  var off = td.count(diff, 'added') + td.count(diff, 'removed');
  sumEl.classList.add(off === 0 ? 'clean' : 'dirty');
  if (noteEl) {
    noteEl.textContent = td.subjectNote(diff);
    noteEl.hidden = false;
  }

  listEl.textContent = '';
  listEl.hidden = false;
  if (diff.rows.length === 0) {
    var empty = document.createElement('div');
    empty.id = 'td-empty';
    empty.textContent = '比べる行がありません。どちらにも図の中身を入れてください。';
    listEl.appendChild(empty);
    return;
  }
  diff.rows.forEach(function(row) {
    var el = document.createElement('div');
    el.className = 'td-row';
    el.setAttribute('data-td-kind', row.kind);
    var kind = document.createElement('span');
    kind.className = 'td-kind';
    kind.textContent = td.kindLabel(row.kind);
    var text = document.createElement('span');
    text.className = 'td-text';
    text.textContent = row.derived || row.template;
    el.appendChild(kind); el.appendChild(text);
    listEl.appendChild(el);
  });
}

// ── 系統ぜんぶと比べる (BLK-junior-20260908-1403) ──────────────────────────
// 2 枚比べ (雛形との差分) は、先発版と後発版の間に固有の行が 1 つも無いとき
// 「違いは語の言い換えだけ」で行き止まりになり、「取り込む対象がどこにあるのか /
// 本当にどこにも無いのか」を人が同じ 2 枚を読み直して判断し続けることになる。
// 開いている図 (と、相手フォルダで引き当てた図) をまとめて突き合わせ、
// 行ごとにどの図にあるかを出す。1 枚にだけある行が取り込み候補で、0 件なら
// 「N 枚とも同じ雛形の複製」と言い切る。
function _clearTemplateCohort() {
  var listEl = document.getElementById('tc-list');
  var noteEl = document.getElementById('tc-note');
  var vEl = document.getElementById('tc-verdict');
  var sumEl = document.getElementById('tcoh-summary');
  if (listEl) { listEl.textContent = ''; listEl.hidden = true; }
  if (noteEl) { noteEl.textContent = ''; noteEl.hidden = true; }
  if (vEl) { vEl.textContent = ''; vEl.hidden = true; }
  if (sumEl) { sumEl.textContent = ''; sumEl.classList.remove('clean', 'dirty'); }
}

// 並べる図。開いているタブ全部に、相手フォルダで引き当てた図があればそれも足す
// (先輩のフォルダの版を相手にしたまま系統を見たい場面がそのまま繋がる)。
function _cohortDocs() {
  var docs = _compareDocs().map(function(d) {
    return { name: d.name, dsl: d.dsl || '', id: d.id };
  });
  if (_xfFile && _xfRefDsl) {
    var label = '相手: ' + _xfFile;
    var dup = docs.filter(function(d) { return d.name === label; }).length > 0;
    if (!dup) docs.push({ name: label, dsl: _xfRefDsl, id: null });
  }
  return docs;
}

function runTemplateCohort() {
  var tc = window.MA.templateCohort;
  var sumEl = document.getElementById('tcoh-summary');
  var listEl = document.getElementById('tc-list');
  var noteEl = document.getElementById('tc-note');
  var vEl = document.getElementById('tc-verdict');
  if (!tc || !sumEl || !listEl) return;

  _clearTemplateCohort();   // 前回の結果を残さない (少ない枚数で押し直したときに混ざる)
  var docs = _cohortDocs();
  var result = tc.build(docs);
  var mine = _activeDocName();
  var total = result.docs.length;

  sumEl.textContent = tc.summary(result);
  sumEl.classList.remove('clean', 'dirty');
  if (tc.isComparable(result)) {
    sumEl.classList.add(tc.count(result, 'only') > 0 ? 'dirty' : 'clean');
  }

  if (vEl) {
    var v = tc.verdict(result, mine);
    vEl.textContent = v;
    vEl.hidden = (v === '');
  }
  if (noteEl) {
    var note = tc.subjectNote(result);
    noteEl.textContent = note;
    noteEl.hidden = (note === '');
  }

  listEl.textContent = '';
  listEl.hidden = false;
  // 1 枚しかないときは行を並べない。全部の行が「共通」に見えてしまい、
  // 比べていないことが表から読み取れなくなる。
  if (!tc.isComparable(result)) {
    var empty = document.createElement('div');
    empty.id = 'tc-empty';
    empty.textContent = (total < 2)
      ? '並べる図が足りません。＋ でもう 1 枚開くか、🔍 探す で相手の図を引き当ててください。'
      : '比べる行がありません。図の中身を入れてください。';
    listEl.appendChild(empty);
    return;
  }
  result.rows.forEach(function(row) {
    var el = document.createElement('div');
    el.className = 'tc-row';
    el.setAttribute('data-tc-kind', row.kind);
    if (row.owner) el.setAttribute('data-tc-owner', row.owner);
    var kind = document.createElement('span');
    kind.className = 'tc-kind';
    kind.textContent = tc.kindLabel(row.kind);
    var text = document.createElement('span');
    text.className = 'tc-text';
    text.textContent = row.sample;
    var where = document.createElement('span');
    where.className = 'tc-where';
    where.textContent = tc.whereLabel(row, total);
    el.appendChild(kind); el.appendChild(text); el.appendChild(where);
    listEl.appendChild(el);
  });
}

// ── 他の人のフォルダの同じ図と突き合わせる (BLK-junior-20260908-0723-wish) ──
// 先輩版と自分版の同種図を見比べる場面で、これまでは自分の保存先設定を先輩の
// フォルダへ一時的に替えて開き、内容を憶えてから設定を戻し、記憶を頼りに
// 打ち直していた。相手のフォルダを打てば、名前の近い図を勝手に引き当て、
// 「相手にしかない要素」を並べる。取り込みは行ごとに 1 クリック。
// 自分の保存先設定 (autoSave の fileDir) には一切触らない。
var _xfDir = '';        // 相手のフォルダ
var _xfNames = [];      // そのフォルダのファイル名
var _xfFile = null;     // 相手にしている図の名前
var _xfRefDsl = '';     // その中身
var _xfResult = null;   // 直近の突き合わせ結果

var XF_DIR_KEY = 'pua.crossRef.dir';

function _xfStore(dir) {
  try { if (window.localStorage) window.localStorage.setItem(XF_DIR_KEY, dir); } catch (e) { /* 使えない環境でも動く */ }
}

function _xfRestore() {
  try { return (window.localStorage && window.localStorage.getItem(XF_DIR_KEY)) || ''; } catch (e) { return ''; }
}

function _xfEl(id) { return document.getElementById(id); }

// 相手フォルダを読み、名前の近い図を選んで突き合わせる。
function loadCrossRefFolder() {
  var input = _xfEl('xf-dir');
  var summary = _xfEl('xf-summary');
  var dir = input ? input.value.trim() : '';
  if (!dir) {
    _xfShowMessage('相手のフォルダを入れてください (自分の保存先は変わりません)', 'dirty');
    return Promise.resolve();
  }
  _xfDir = dir;
  _xfStore(dir);
  if (summary) { summary.hidden = false; summary.className = ''; summary.textContent = '読み込み中…'; }
  if (!window.MA.workspace) return Promise.resolve();
  return window.MA.workspace.listFolder(dir).then(function(res) {
    var entries = (res && res.entries) || [];
    _xfNames = entries.map(function(e) { return (e && e.name) || ''; })
      .filter(function(n) { return n !== ''; });
    if (res && res.exists === false) {
      _xfShowMessage('そのフォルダが見つかりません: ' + dir, 'dirty');
      _xfClearPick();
      return;
    }
    if (_xfNames.length === 0) {
      _xfShowMessage('そのフォルダに図がありません: ' + dir, 'dirty');
      _xfClearPick();
      return;
    }
    var CRD = window.MA.crossRefDiff;
    var selfName = _xfSelfName();
    var pick = CRD ? CRD.pickCounterpart(_xfNames, selfName) : null;
    _xfRenderPick(pick || _xfNames[0]);
    return _xfSelectFile(pick || _xfNames[0]);
  });
}

function _xfSelfName() {
  try {
    var d = window.MA.workspace ? window.MA.workspace.getActive() : null;
    return (d && d.name) || '';
  } catch (e) { return ''; }
}

function _xfShowMessage(text, cls) {
  var summary = _xfEl('xf-summary');
  if (!summary) return;
  summary.hidden = false;
  summary.className = cls || '';
  summary.textContent = text;
}

function _xfClearPick() {
  var pick = _xfEl('xf-pick'), list = _xfEl('xf-list');
  if (pick) pick.hidden = true;
  if (list) { list.hidden = true; list.textContent = ''; }
  _xfFile = null;
  _xfResult = null;
}

// 相手の候補を近い順に並べる。近さの付いた名前を先に出す。
function _xfRenderPick(selected) {
  var pick = _xfEl('xf-pick'), sel = _xfEl('xf-file');
  if (!pick || !sel) return;
  var CRD = window.MA.crossRefDiff;
  var ranked = CRD ? CRD.counterparts(_xfNames, _xfSelfName())
                   : _xfNames.map(function(n) { return { name: n, distance: null }; });
  sel.textContent = '';
  ranked.forEach(function(c) {
    var op = document.createElement('option');
    op.value = c.name;
    op.textContent = c.name + (c.distance === 0 ? ' (同じ名前)' : c.distance == null ? ' (名前が離れています)' : '');
    if (c.name === selected) op.selected = true;
    sel.appendChild(op);
  });
  pick.hidden = false;
}

// 相手の図を 1 枚読み、要素を突き合わせて並べる。
function _xfSelectFile(name) {
  if (!name || !window.MA.workspace) return Promise.resolve();
  _xfFile = name;
  return window.MA.workspace.loadFile(name, _xfDir).then(function(dsl) {
    _xfRefDsl = dsl == null ? '' : dsl;
    if (_xfRefDsl === '') {
      _xfShowMessage('その図を読めませんでした: ' + name, 'dirty');
      return;
    }
    renderCrossRefDiff();
  });
}

// 突き合わせ結果を描く。自分の DSL が変わるたびに呼び直してよい。
function renderCrossRefDiff() {
  var CRD = window.MA.crossRefDiff;
  var list = _xfEl('xf-list'), note = _xfEl('xf-rename');
  if (!CRD || !list || !_xfFile) return;
  var selfDsl = editorEl ? editorEl.value : '';
  var map = CRD.renameMap(_xfSelfName(), _xfFile);
  _xfResult = CRD.diff(selfDsl, _xfRefDsl, map);
  if (note) {
    note.textContent = map ? ('読み替え: ' + map.from + ' → ' + map.to) : '';
  }
  var clean = _xfResult.onlyRef.length === 0 && _xfResult.onlySelf.length === 0;
  _xfShowMessage(CRD.summary(_xfResult), clean ? 'clean' : 'dirty');

  // BLK-junior-20260908-0823: 名前が 1 つも対応しない 2 枚は、行の一覧を
  // 「相手が足した差分」として出しても取り込む 1 個を選べない。
  // 形 (種別ごとの件数) の見比べに切り替えて、同じ粒度かどうかを先に見せる。
  var comp = CRD.comparability(_xfResult);
  // BLK-junior-20260908-1303: 名前が対応しなくても、種別の並びが位置ごとに
  // 一致していれば「別の粒度」ではなく「同じ骨格の言い換え」。形の件数表より、
  // 位置で対応させた語の対応表の方が「取り込む要素は無い」と言い切れる。
  var par = CRD.parallel(selfDsl, _xfRefDsl);
  var isParallel = CRD.isRephrase(par);
  if (isParallel) _xfShowMessage(CRD.parallelSummary(par), 'clean');
  _xfRenderParallel(isParallel ? par : null);
  _xfRenderShape((comp.level === 'disjoint' && !isParallel) ? CRD.shapeRows(selfDsl, _xfRefDsl) : null,
    (comp.level === 'disjoint' && !isParallel) ? CRD.shapeSummary(selfDsl, _xfRefDsl) : '');

  list.textContent = '';
  _xfResult.onlyRef.forEach(function(e) { list.appendChild(_xfRow(e, 'ref')); });
  _xfResult.onlySelf.forEach(function(e) { list.appendChild(_xfRow(e, 'self')); });
  // 骨格が同じ 2 枚では「相手だけ」の行は言い換えであって足された要素ではない。
  // 「取り込む」を出すと、同じ手順を別の語でもう 1 本足すことになる。
  list.hidden = isParallel || (_xfResult.onlyRef.length + _xfResult.onlySelf.length) === 0;
}

// 語の対応表。par が null なら畳む (骨格が違う 2 枚には出さない)。
function _xfRenderParallel(par) {
  var host = _xfEl('xf-parallel');
  if (!host) return;
  host.textContent = '';
  if (!par) { host.hidden = true; return; }
  host.hidden = false;
  var CRD = window.MA.crossRefDiff;

  var lead = document.createElement('div');
  lead.className = 'xf-shape-lead';
  lead.id = 'xf-parallel-lead';
  lead.textContent = '要素の並びが位置ごとに一致しています。'
    + '片方にだけある要素は無いので、違いは語の言い換えだけです。';
  host.appendChild(lead);

  var table = document.createElement('table');
  table.className = 'xf-shape-table';
  table.id = 'xf-parallel-table';
  var head = document.createElement('tr');
  ['#', '要素', '自分', '相手'].forEach(function(t) {
    var th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });
  table.appendChild(head);
  par.pairs.forEach(function(p, i) {
    var tr = document.createElement('tr');
    tr.className = 'xf-parallel-row' + (p.same ? '' : ' differs');
    tr.setAttribute('data-kind', p.kind);
    [String(i + 1), p.label, p.self.label, p.ref.label].forEach(function(t) {
      var td = document.createElement('td');
      td.textContent = t;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  host.appendChild(table);

  // 対応表を目で写して申し送りに貼る手を残さない。
  var copy = document.createElement('button');
  copy.type = 'button';
  copy.id = 'btn-xf-parallel-copy';
  copy.className = 'xf-parallel-copy';
  copy.textContent = '対応表をコピー';
  copy.title = '語の対応表を申し送り・レビュー依頼にそのまま貼れる形でコピーする';
  copy.addEventListener('click', function() {
    var text = CRD.parallelText(par, _xfSelfName(), _xfFile);
    var done = function() { copy.textContent = 'コピーしました'; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else { done(); }
    } catch (e) { done(); }
  });
  host.appendChild(copy);
}

// 形の見比べの表。rows が null なら畳む (名前で対応が付いているときは要らない)。
function _xfRenderShape(rows, headline) {
  var host = _xfEl('xf-shape');
  if (!host) return;
  host.textContent = '';
  if (!rows) { host.hidden = true; return; }
  host.hidden = false;

  var lead = document.createElement('div');
  lead.className = 'xf-shape-lead';
  lead.id = 'xf-shape-lead';
  lead.textContent = '名前では対応が付かないので、形で見比べます。'
    + '同じ粒度で描き直すか、粒度の違いを申し送りに残すかを先に決めてください。';
  host.appendChild(lead);

  var sum = document.createElement('div');
  sum.className = 'xf-shape-sum';
  sum.id = 'xf-shape-sum';
  sum.textContent = headline;
  host.appendChild(sum);

  var table = document.createElement('table');
  table.className = 'xf-shape-table';
  table.id = 'xf-shape-table';
  var head = document.createElement('tr');
  ['要素', '自分', '相手'].forEach(function(t) {
    var th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });
  table.appendChild(head);
  rows.forEach(function(r) {
    var tr = document.createElement('tr');
    tr.className = 'xf-shape-row' + (r.self === r.ref ? '' : ' differs');
    tr.setAttribute('data-kind', r.kind);
    [r.label, String(r.self), String(r.ref)].forEach(function(t, i) {
      var td = document.createElement('td');
      td.textContent = t;
      if (i > 0) td.className = 'num';
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  host.appendChild(table);
}

// 1 行。相手にしかない行には「取り込む」を付ける (自分にしかない行は取り込めない)。
function _xfRow(entry, side) {
  var row = document.createElement('div');
  row.className = 'xf-row ' + (side === 'ref' ? 'only-ref' : 'only-self');
  row.setAttribute('data-side', side);
  row.setAttribute('data-kind', entry.kind || '');

  var tag = document.createElement('span');
  tag.className = 'xf-side';
  tag.textContent = side === 'ref' ? '相手だけ' : '自分だけ';
  row.appendChild(tag);

  var text = document.createElement('span');
  text.className = 'xf-text';
  text.textContent = entry.text;
  text.title = entry.text;
  // 自分にしかない行はその場で見に行ける。相手の行は自分の図にまだ無いので飛べない。
  if (side === 'self') {
    text.addEventListener('click', function() { jumpToLine(entry.line); });
  } else {
    text.style.cursor = 'default';
  }
  row.appendChild(text);

  if (side === 'ref') {
    var take = document.createElement('button');
    take.type = 'button';
    take.className = 'xf-take';
    take.textContent = '取り込む';
    take.title = 'この 1 行を自分の図に入れる';
    take.addEventListener('click', function() { takeCrossRefEntry(entry); });
    row.appendChild(take);
  }
  return row;
}

// 相手にしかない 1 行を自分の DSL へ入れ、その行へ飛んで、一覧を出し直す。
function takeCrossRefEntry(entry) {
  var CRD = window.MA.crossRefDiff;
  if (!CRD || !editorEl) return;
  var out = CRD.applyInsert(editorEl.value, entry);
  if (!out) return;
  editorEl.value = out.dsl;
  editorEl.dispatchEvent(new Event('input'));
  jumpToLine(out.line);
  renderCrossRefDiff();
}

function setupCrossRefDiff() {
  var btn = _xfEl('btn-xf-load');
  var dir = _xfEl('xf-dir');
  var file = _xfEl('xf-file');
  if (dir) dir.value = _xfRestore();
  if (btn) btn.addEventListener('click', function() { loadCrossRefFolder(); });
  if (dir) {
    dir.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); loadCrossRefFolder(); }
    });
  }
  if (file) {
    file.addEventListener('change', function() { _xfSelectFile(file.value); });
  }
}

function setupCompareView() {
  setupCrossRefDiff();
  var checkBtn = document.getElementById('btn-check-run');
  if (checkBtn) checkBtn.addEventListener('click', runConsistencyCheck);
  var mapBtn = document.getElementById('btn-map-run');
  if (mapBtn) mapBtn.addEventListener('click', runStateMap);
  var mapReset = document.getElementById('btn-map-reset');
  if (mapReset) {
    mapReset.addEventListener('click', function() {
      var sm = _mapper();
      setMapOverrides(sm && sm.EMPTY_OVERRIDES ? sm.EMPTY_OVERRIDES : null);
    });
  }
  var tdBtn = document.getElementById('btn-td-run');
  if (tdBtn) tdBtn.addEventListener('click', runTemplateDiff);
  // BLK-junior-20260908-1403-wish: 雛形の登録・選択・取り消し
  var trAdd = document.getElementById('btn-tr-add');
  if (trAdd) trAdd.addEventListener('click', function() { registerTemplate(); });
  var trDel = document.getElementById('btn-tr-del');
  if (trDel) trDel.addEventListener('click', forgetTemplate);
  var trPick = document.getElementById('tr-pick');
  if (trPick) {
    trPick.addEventListener('change', function() {
      _trPickedId = trPick.value;
      _clearTemplateDiff();
      renderTemplateRegistry();
    });
  }
  var tcBtn = document.getElementById('btn-tc-run');
  if (tcBtn) tcBtn.addEventListener('click', runTemplateCohort);
  var btn = document.getElementById('btn-tab-compare');
  var sel = document.getElementById('compare-select');
  var close = document.getElementById('btn-compare-close');
  if (btn) btn.addEventListener('click', function() { toggleCompareView(null, 'ref'); });
  if (close) close.addEventListener('click', function() { toggleCompareView(false); });
  var histBtn = document.getElementById('btn-compare-hist');
  if (histBtn) histBtn.addEventListener('click', function() { toggleWriteHistory(); });
  var mRef = document.getElementById('compare-mode-ref');
  var mDiff = document.getElementById('compare-mode-diff');
  if (mRef) mRef.addEventListener('click', function() { setCompareMode('ref'); });
  if (mDiff) mDiff.addEventListener('click', function() { setCompareMode('diff'); });
  if (sel) {
    sel.addEventListener('change', function() {
      _compareRefId = sel.value;
      _compareShownDsl = null;
      _clearCheckList();
      _clearStateMap();
      _clearTemplateDiff();
      renderCompareView();
    });
  }
}

function setupOutline() {
  var dslBtn = document.getElementById('btn-editor-tab-dsl');
  var outBtn = document.getElementById('btn-editor-tab-outline');
  var filter = document.getElementById('outline-filter');
  if (dslBtn) dslBtn.addEventListener('click', function() { setEditorTab('dsl'); });
  if (outBtn) outBtn.addEventListener('click', function() { setEditorTab('outline'); });
  var cmpSel = document.getElementById('outline-cmp-select');
  if (cmpSel) cmpSel.addEventListener('change', function() {
    _outlineCmpRefId = cmpSel.value;
    renderOutline();
  });
  if (filter) {
    filter.addEventListener('input', renderOutline);
    filter.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); setEditorTab('dsl'); }
    });
  }
}

// ── 系統チェック ───────────────────────────────────────────────────────────
// 同じ系統 (図の名前の頭を共有する複数枚) の sequence のメッセージ列と state の
// 遷移列が揃っているかは、今は 3 枚を開いて目で追うしかない。ここは系統ごとに
// 動作名を突き合わせ、片方にしか無い名前を機械的に出す。名前突合 (部品名) と
// 対になる道具で、こちらは動作名 (矢印のラベル) を見る。

var _familyAuditDocs = [];   // 表の行から図へ飛ぶための、表示中の系統の図一覧
var _familyDensity = null;   // BLK-primary-20260908-1403-wish: 系統ごとの遷移密度
var _familyTrace = [];       // BLK-primary-20260908-1603-wish: 系統ごとのトレース突合
var _familyLabelRows = [];   // 上の表の行 → 図の行へ飛ぶための控え
var _familyLabelPos = null;  // BLK-reviewer-20260908-1703-wish: ラベル位置の慣習

// 遷移密度の表。系統ごとに「1 メッセージ何遷移か」を並べ、他系統の中央値から
// 外れた系統を上に置く。レビュー指摘の粒度差は、これまで指摘の文章を読んでから
// 他系統を自分で開いて見比べるしかなかった。ここを見れば相手を選ばずに済む。
function _densityTableHtml(result, SECTION, CELL) {
  var td = window.MA.transitionDensity;
  var esc = window.MA.htmlUtils.escHtml;
  if (!td || !result) return '';
  var html = '<div style="' + SECTION + '">遷移密度 (系統ごと・外れた系統が上)</div>'
    + '<div id="fd-summary" data-outliers="' + result.outliers.length + '" '
    + 'data-median="' + (result.median == null ? '' : result.median) + '" '
    + 'style="font-size:11px;color:' + (result.outliers.length ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + esc(td.summaryLine(result)) + '</div>';
  if (!result.rows.length) return html;
  html += '<table id="fd-table" style="border-collapse:collapse;width:100%;margin-top:4px;">'
    + '<tr>'
    // BLK-reviewer-20260908-1603: メッセージが遷移と同じ粒度かを見せる。
    // 「6 メッセージ」だけでは、それが初期化 1 回の内訳なのか状態機械の動作なのか分からない。
    + ['系統', '状態数', '遷移数', 'メッセージ数', '遷移に対応', '遷移/メッセージ', ''].map(function(h) {
        return '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);font-weight:normal;">'
          + esc(h) + '</th>';
      }).join('') + '</tr>';
  result.rows.forEach(function(r) {
    var mark = r.outlier ? 'color:var(--accent-orange);' : '';
    html += '<tr class="fd-row' + (r.outlier ? ' fd-outlier' : '') + '" data-key="' + esc(r.key) + '"'
      + ' data-density="' + (r.density == null ? '' : r.density) + '"'
      + ' data-outlier="' + (r.outlier ? '1' : '0') + '" style="cursor:pointer;">'
      + '<td style="' + CELL + 'font-family:var(--font-mono);' + mark + '">' + esc(r.key) + '</td>'
      + '<td style="' + CELL + '">' + r.states + '</td>'
      + '<td style="' + CELL + '">' + r.transitions + '</td>'
      + '<td style="' + CELL + '">' + r.messages + '</td>'
      + '<td class="fd-matched" style="' + CELL + (r.sameGrain ? '' : 'color:var(--text-secondary);') + '">'
      + (r.msgMatched || 0) + '</td>'
      + '<td class="fd-density" style="' + CELL + mark + '">' + esc(td.densityText(r)) + '</td>'
      + '<td class="fd-why" style="' + CELL + 'color:var(--text-secondary);">'
      + esc(r.reason || '') + '</td>'
      + '</tr>';
  });
  return html + '</table>';
}

// ラベル位置の慣習。系統ごとに「遷移ラベルが対応するメッセージの何番目を
// 指しているか」を並べ、他系統の多数派からズレた系統を上に置く。
// ラベル突合 (下の表) は実在するかどうかまでしか見ないので、実在名を使って
// いても系統だけが末尾の内部呼び出し名を指している、という慣習のズレは
// ここでしか出ない (今までは 9 系統 × 2 図を開いて何番目かを数えていた)。
function _labelPositionHtml(result, SECTION, CELL) {
  var lp = window.MA.labelPosition;
  var esc = window.MA.htmlUtils.escHtml;
  if (!lp || !result) return '';
  var html = '<div style="' + SECTION + '">ラベル位置の慣習 (系統ごと・ズレた系統が上)</div>'
    + '<div id="lp-summary" data-odd="' + result.odd.length + '" '
    + 'data-common="' + esc(result.common || '') + '" '
    + 'style="font-size:11px;color:' + (result.odd.length ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + esc(lp.summaryLine(result)) + '</div>';
  if (!result.rows.length) return html;
  html += '<table id="lp-table" style="border-collapse:collapse;width:100%;margin-top:4px;">'
    + '<tr>'
    + ['系統', '対応した遷移', 'ラベルが指す位置', '例'].map(function(h) {
        return '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);font-weight:normal;">'
          + esc(h) + '</th>';
      }).join('') + '</tr>';
  result.rows.forEach(function(r) {
    var mark = r.odd ? 'color:var(--accent-orange);' : '';
    // 例は「ズレている行」を優先して出す。ズレの中身をこの 1 行で読ませる。
    var ex = null;
    r.entries.forEach(function(e) { if (!ex && e.odd) ex = e; });
    if (!ex) ex = r.entries[0];
    html += '<tr class="lp-row' + (r.odd ? ' lp-odd' : '') + '" data-key="' + esc(r.key) + '"'
      + ' data-convention="' + esc(r.convention || '') + '"'
      + ' data-odd="' + (r.odd ? '1' : '0') + '" style="cursor:pointer;'
      + (r.odd ? 'background:rgba(255,140,0,0.10);' : '') + '">'
      + '<td style="' + CELL + 'font-family:var(--font-mono);' + mark + '">' + esc(r.key) + '</td>'
      + '<td style="' + CELL + '">' + r.matched + '</td>'
      + '<td class="lp-pos" style="' + CELL + mark + '">' + esc(lp.positionText(r)) + '</td>'
      + '<td class="lp-example" style="' + CELL + 'color:var(--text-secondary);'
        + 'font-family:var(--font-mono);">'
      + (ex ? esc(ex.label + ' → ' + ex.message + ' (' + ex.ordinal + '/' + ex.total + ')') : '')
      + '</td>'
      + '</tr>';
  });
  return html + '</table>';
}

// 系統 1 つぶんの「行 → 位置」。ラベル突合表に位置の列を足すために引く。
function _labelPosEntries(key) {
  var out = {};
  if (!_familyLabelPos) return out;
  _familyLabelPos.rows.forEach(function(r) {
    if (r.key !== key) return;
    r.entries.forEach(function(e) { out[e.docId + '#' + e.line] = e; });
  });
  return out;
}

// ラベル突合表。系統の状態遷移のラベルを「対応するシーケンスのメッセージ名」と
// 並べ、対応が無い行を先頭に置く。遷移密度が件数しか見ないので、件数は揃って
// いるのにラベルだけが架空 (Dma_Configure) という食い違いはここでしか出ない。
// 対応が無い行には、その系統に実在するメッセージ名の候補を添える。
function _labelTableHtml(key, SECTION, CELL) {
  var TT = window.MA.traceLabelTable;
  var esc = window.MA.htmlUtils.escHtml;
  _familyLabelRows = [];
  if (!TT) return '';
  var fam = null;
  for (var i = 0; i < _familyTrace.length; i++) {
    if (_familyTrace[i].key === key) fam = _familyTrace[i];
  }
  var html = '<div style="' + SECTION + '">'
    + '遷移ラベル × シーケンスのメッセージ (対応が無い行が上)</div>';
  if (!fam) {
    return html + '<div id="fl-empty" style="font-size:11px;color:var(--text-secondary);">'
      + 'この系統に状態遷移図がありません。</div>';
  }
  var t = TT.build(fam);
  _familyLabelRows = t.rows;
  html += '<div id="fl-summary" data-missing="' + t.counts.missing + '" '
    + 'data-rows="' + t.rows.length + '" '
    + 'style="font-size:11px;color:' + (t.counts.missing ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + esc(TT.summaryLine(t)) + '</div>';
  if (!t.rows.length) return html;
  html += '<table id="fl-table" style="border-collapse:collapse;width:100%;margin-top:4px;">'
    + '<tr>'
    + ['遷移', 'ラベル', '対応するメッセージ', '位置', ''].map(function(h) {
        return '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);font-weight:normal;">'
          + esc(h) + '</th>';
      }).join('') + '</tr>';
  var posOf = _labelPosEntries(key);
  var LP = window.MA.labelPosition;
  t.rows.forEach(function(r, ri) {
    var bad = r.status === 'missing';
    // その遷移が指しているメッセージの位置。慣習からズレた行は色を変える
    // (系統の中でどの行がズレの元かを、上の表から降りて 1 目で見せる)。
    var pe = posOf[r.docId + '#' + r.line];
    html += '<tr class="fl-row' + (bad ? ' fl-missing' : '') + '" data-row-index="' + ri + '"'
      + ' data-status="' + esc(r.status) + '" data-label="' + esc(r.label) + '"'
      + ' style="cursor:pointer;' + (bad ? 'background:rgba(255,140,0,0.10);' : '') + '">'
      + '<td style="' + CELL + 'font-family:var(--font-mono);color:var(--text-secondary);">'
        + esc(r.from) + ' → ' + esc(r.to) + '</td>'
      + '<td class="fl-label" style="' + CELL + 'font-family:var(--font-mono);'
        + (bad ? 'color:var(--accent-orange);font-weight:bold;' : '') + '">' + esc(r.label) + '</td>'
      + '<td class="fl-match" style="' + CELL
        + (bad ? 'color:var(--accent-orange);' : 'color:var(--text-secondary);') + '">'
        + esc(TT.matchText(r)) + '</td>'
      + '<td class="fl-pos" data-position="' + esc(pe ? pe.position : '') + '"'
        + ' data-odd="' + (pe && pe.odd ? '1' : '0') + '" style="' + CELL
        + (pe && pe.odd ? 'color:var(--accent-orange);' : 'color:var(--text-secondary);') + '">'
        + esc(pe && LP ? pe.positionLabel + ' ' + pe.ordinal + '/' + pe.total : '') + '</td>'
      + '<td style="' + CELL + 'color:var(--text-secondary);">' + esc(r.statusLabel) + '</td>'
      + '</tr>';
  });
  return html + '</table>';
}

function _familyAuditRender(families, selectedKey) {
  var content = document.getElementById('fa-modal-content');
  var fa = window.MA.familyAudit;
  if (!content || !fa) return;
  var esc = window.MA.htmlUtils.escHtml;

  var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:12px 0 4px 0;';
  var CELL = 'padding:3px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-primary);';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 8px;font-size:11px;';

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">系統チェック</h3>';
  html += _densityTableHtml(_familyDensity, SECTION, CELL);
  html += _labelPositionHtml(_familyLabelPos, SECTION, CELL);

  if (families.length === 0) {
    html += '<div id="fa-empty" style="font-size:11px;color:var(--text-secondary);">'
      + '同じ頭の名前を持つ図が 2 枚以上ありません。Adc_Seq / Adc_State のように'
      + '系統の頭を揃えて名前を付けると突き合わせられます。</div>'
      + '<div style="display:flex;gap:8px;margin-top:14px;">'
      + '<button id="fa-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';
    content.innerHTML = html;
    _familyAuditDocs = [];
    return;
  }

  var sel = null;
  for (var i = 0; i < families.length; i++) if (families[i].key === selectedKey) sel = families[i];
  if (!sel) sel = families[0];
  _familyAuditDocs = sel.docs;

  html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">'
    + '<label for="fa-family">系統</label> '
    + '<select id="fa-family" style="background:var(--bg-primary);border:1px solid var(--border);'
      + 'color:var(--text-primary);padding:3px 6px;border-radius:3px;font-family:var(--font-mono);">'
    + families.map(function(f) {
        return '<option value="' + esc(f.key) + '"' + (f === sel ? ' selected' : '') + '>'
          + esc(f.key) + ' (' + f.docs.length + ' 枚, 食い違い ' + f.mismatches.length + ' 件)</option>';
      }).join('')
    + '</select></div>';

  html += '<div id="fa-summary" data-mismatches="' + sel.mismatches.length + '" '
    + 'data-docs="' + sel.docs.length + '" data-comparable="' + (sel.comparable ? '1' : '0') + '" '
    + 'style="font-size:11px;color:' + (sel.mismatches.length ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + esc(fa.summaryLine(sel)) + '</div>';

  html += _labelTableHtml(sel.key, SECTION, CELL);

  html += '<div style="' + SECTION + '">動作名 × 図 (● がある方にだけ名前がある行が食い違い)</div>'
    + '<table id="fa-matrix" style="border-collapse:collapse;width:100%;">'
    + '<tr><th style="' + CELL + 'text-align:left;">動作名</th>'
    + sel.docs.map(function(d) {
        return '<th style="' + CELL + 'text-align:center;color:var(--text-secondary);font-weight:normal;">'
          + esc(d.name) + '</th>';
      }).join('') + '</tr>';

  if (sel.rows.length === 0) {
    html += '<tr><td id="fa-no-rows" colspan="' + (sel.docs.length + 1) + '" style="' + CELL
      + 'color:var(--text-secondary);">矢印にラベルが付いていないため突き合わせられません</td></tr>';
  }
  sel.rows.forEach(function(r) {
    html += '<tr class="fa-row' + (r.onlyIn ? ' fa-mismatch' : '') + '" data-key="' + esc(r.key) + '"'
      + ' data-only-in="' + esc(r.onlyIn || '') + '">'
      + '<td style="' + CELL + 'font-family:var(--font-mono);'
        + (r.onlyIn ? 'color:var(--accent-orange);' : '') + '">' + esc(r.label) + '</td>'
      + r.present.map(function(p, di) {
          return '<td class="fa-cell" data-doc-index="' + di + '" data-present="' + (p ? '1' : '0') + '" '
            + 'style="' + CELL + 'text-align:center;'
            + (p ? 'cursor:pointer;' : 'color:var(--accent-orange);') + '">' + (p ? '●' : '·') + '</td>';
        }).join('')
      + '</tr>';
  });
  html += '</table>'
    + '<div style="display:flex;gap:8px;margin-top:14px;">'
    + '<button id="fa-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';

  content.innerHTML = html;
}

function _familyAuditBind(families) {
  var content = document.getElementById('fa-modal-content');
  var modal = document.getElementById('fa-modal');
  if (!content || !modal) return;

  function close() { modal.style.display = 'none'; }
  var closeBtn = document.getElementById('fa-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  // 密度の行 → その系統の突合表へ。外れた系統をクリックしたらすぐ中身が見える。
  // 系統チェックに載らない系統 (1 枚しか無い) は、その状態遷移図を開く。
  var dRows = content.querySelectorAll('.fd-row');
  for (var k = 0; k < dRows.length; k++) {
    dRows[k].addEventListener('click', function(ev) {
      var key = ev.currentTarget.getAttribute('data-key');
      var hit = null;
      for (var i = 0; i < families.length; i++) if (families[i].key === key) hit = families[i];
      if (hit) {
        _familyAuditRender(families, key);
        _familyAuditBind(families);
        return;
      }
      var row = null;
      if (_familyDensity) {
        for (var j = 0; j < _familyDensity.rows.length; j++) {
          if (_familyDensity.rows[j].key === key) row = _familyDensity.rows[j];
        }
      }
      var doc = row && (row.stateDocs[0] || row.seqDocs[0]);
      if (!doc || !doc.id || !window.MA.workspace) return;
      close();
      saveActiveDoc();
      window.MA.workspace.setActive(doc.id);
      applyActiveDoc();
    });
  }

  // ラベル位置の行 → その系統のラベル突合表へ (ズレの中身をその場で開く)。
  var pRows = content.querySelectorAll('.lp-row');
  for (var p = 0; p < pRows.length; p++) {
    pRows[p].addEventListener('click', function(ev) {
      var key = ev.currentTarget.getAttribute('data-key');
      for (var i = 0; i < families.length; i++) {
        if (families[i].key !== key) continue;
        _familyAuditRender(families, key);
        _familyAuditBind(families);
        return;
      }
    });
  }

  // ラベル突合表の行 → その遷移が書かれている状態遷移図の、その行へ。
  var lRows = content.querySelectorAll('.fl-row');
  for (var m = 0; m < lRows.length; m++) {
    lRows[m].addEventListener('click', function(ev) {
      var r = _familyLabelRows[Number(ev.currentTarget.getAttribute('data-row-index'))];
      if (!r || !r.docId || !window.MA.workspace) return;
      close();
      saveActiveDoc();
      window.MA.workspace.setActive(r.docId);
      applyActiveDoc();
      _traceScrollToLine(r.line);
    });
  }

  var famSel = document.getElementById('fa-family');
  if (famSel) famSel.addEventListener('change', function() {
    _familyAuditRender(families, this.value);
    _familyAuditBind(families);
  });

  // ● のセルはその図へのショートカット。開いていないファイルには飛ばない。
  var cells = content.querySelectorAll('.fa-cell');
  for (var i = 0; i < cells.length; i++) {
    cells[i].addEventListener('click', function(ev) {
      if (ev.currentTarget.getAttribute('data-present') !== '1') return;
      var d = _familyAuditDocs[Number(ev.currentTarget.getAttribute('data-doc-index'))];
      if (!d || !d.id || !window.MA.workspace) return;
      close();
      saveActiveDoc();
      window.MA.workspace.setActive(d.id);
      applyActiveDoc();
    });
  }
}

function openFamilyAudit() {
  var modal = document.getElementById('fa-modal');
  var fa = window.MA.familyAudit;
  if (!modal || !fa) return null;

  // 突合の対象は開いているタブ。保存フォルダの図は保存時点の中身なので、
  // 編集中のタブと混ぜると「今の食い違い」が出せない (見たい図は 📂 一覧で開く)。
  var docs = _renameDocs().map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
  var families = fa.audit(docs);
  _familyDensity = window.MA.transitionDensity ? window.MA.transitionDensity.rank(docs) : null;
  // ラベル突合はトレースカバレッジと同じ突合を使う (同じ食い違いを 2 通りに数えない)。
  _familyTrace = window.MA.traceCoverage ? window.MA.traceCoverage.audit(docs) : [];
  // ラベル位置の慣習は、同じトレース突合の結果から数える (同じ食い違いを
  // 2 通りに突き合わせない)。
  _familyLabelPos = window.MA.labelPosition ? window.MA.labelPosition.rank(_familyTrace) : null;
  // 外れた系統があるなら、開いた時点でその系統を出す (指摘の相手を探す手間を消す)。
  var firstKey = families.length ? families[0].key : null;
  var wanted = null;
  if (_familyDensity && _familyDensity.outliers.length) wanted = _familyDensity.outliers[0].key;
  // 密度が揃っている系統でも、ラベルの指す位置だけがズレていることがある。
  else if (_familyLabelPos && _familyLabelPos.odd.length) wanted = _familyLabelPos.odd[0].key;
  if (wanted) {
    for (var i = 0; i < families.length; i++) if (families[i].key === wanted) firstKey = wanted;
  }
  _familyAuditRender(families, firstKey);
  _familyAuditBind(families);
  modal.style.display = 'flex';
  return families;
}

// ── トレースカバレッジ ─────────────────────────────────────────────────────
// BLK-reviewer-20260907-1903-wish: 状態遷移図に書いた遷移が、同じ系統の
// シーケンス図のどこにも現れないことを見つけるのに、系統チェックの
// 「片方にしか無い動作名」から目視で拾い上げていた。ここは向きを
// 「状態遷移 → シーケンス」の 1 方向に固定し、系統ごとに遷移を全件並べて
// どのシーケンスにも現れなかった行だけを赤にする。行をクリックすると
// その状態遷移図のその行へ飛ぶ。

var _traceRows = [];   // 表の行から図の行へ飛ぶための、表示中の系統の遷移一覧

// ── 担当範囲の宣言 ─────────────────────────────────────────────────────────
// BLK-reviewer-20260907-2003-wish: 「初期化専用シーケンス vs フル状態遷移」の
// 粒度差を、これまでは語彙一致率から推測していた。推測なので系統が増えるたび
// 誤検出が出る。ここでシーケンス図が担当する遷移をチェックボックスで宣言し、
// DSL に `' @covers Idle -> Configured` として書き込む。宣言のある系統では、
// 宣言されていない遷移は最初から突き合わせの対象外になる。
var _traceScopeDocId = null;   // 宣言を編集しているシーケンス図
var _traceScopeChoices = [];   // 表示中のチェックボックス一覧

function _traceScopeDoc(family) {
  if (!family) return null;
  var seq = (family.docs || []).filter(function(d) { return d.kind === 'sequence'; });
  if (!seq.length) return null;
  for (var i = 0; i < seq.length; i++) if (seq[i].id === _traceScopeDocId) return seq[i];
  return seq[0];
}

function _traceScopeSection(family, SECTION, CELL, BTN) {
  var tc = window.MA.traceCoverage;
  var sd = window.MA.scopeDecl;
  var esc = window.MA.htmlUtils.escHtml;
  _traceScopeChoices = [];
  if (!tc || !sd) return '';

  var seq = (family.docs || []).filter(function(d) { return d.kind === 'sequence'; });
  var html = '<div style="' + SECTION + '">担当範囲の宣言 '
    + '(このシーケンス図が担当する遷移。宣言すると、宣言外の遷移は突き合わせない)</div>';
  if (!seq.length) {
    html += '<div id="tc-scope-empty" style="font-size:11px;color:var(--text-secondary);">'
      + 'この系統にシーケンス図が無いので宣言できません。</div>';
    return html;
  }

  var doc = _traceScopeDoc(family);
  _traceScopeDocId = doc.id;
  var mine = sd.parse(doc.dsl).covers;
  _traceScopeChoices = tc.scopeChoices(family);

  html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">'
    + '<label for="tc-scope-doc">シーケンス図</label> '
    + '<select id="tc-scope-doc" style="background:var(--bg-primary);border:1px solid var(--border);'
      + 'color:var(--text-primary);padding:3px 6px;border-radius:3px;font-family:var(--font-mono);">'
    + seq.map(function(d) {
        return '<option value="' + esc(d.id) + '"' + (d.id === doc.id ? ' selected' : '') + '>'
          + esc(d.name) + (sd.declared(d.dsl) ? ' (宣言あり)' : ' (宣言なし)') + '</option>';
      }).join('')
    + '</select></div>';

  html += '<div id="tc-scope-list" data-declared="' + (mine.length ? '1' : '0') + '" '
    + 'data-count="' + mine.length + '" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);'
    + 'border-radius:3px;padding:4px 6px;">';
  if (!_traceScopeChoices.length) {
    html += '<div id="tc-scope-none" style="font-size:11px;color:var(--text-secondary);">'
      + 'この系統の状態遷移図にラベル付きの遷移がありません。</div>';
  }
  _traceScopeChoices.forEach(function(c, ci) {
    var on = sd.covered(mine, c);
    html += '<label class="tc-scope-item" style="display:block;font-size:11px;color:var(--text-primary);'
      + 'font-family:var(--font-mono);padding:1px 0;cursor:pointer;">'
      + '<input type="checkbox" class="tc-scope-cb" data-choice-index="' + ci + '"'
      + ' data-from="' + esc(c.from) + '" data-to="' + esc(c.to) + '"'
      + (on ? ' checked' : '') + '> '
      + esc(sd.label(c))
      + ' <span style="color:var(--text-secondary);">: ' + esc(c.labels.join(' / ')) + '</span>'
      + '</label>';
  });
  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-top:6px;align-items:center;">'
    + '<button id="tc-scope-save" style="' + BTN + '">宣言を保存</button>'
    + '<button id="tc-scope-all" style="' + BTN + '">全部にする</button>'
    + '<button id="tc-scope-clear" style="' + BTN + '">宣言を消す</button>'
    + '<span id="tc-scope-note" style="font-size:11px;color:var(--text-secondary);">'
    + _traceScopeNote(family)
    + '</span></div>';

  if ((family.outOfScope || []).length) {
    html += '<div id="tc-scope-out" style="font-size:11px;color:var(--text-secondary);margin-top:4px;">'
      + (family.declared ? '宣言対象外: ' : '粒度違いで見ていない遷移: ')
      + family.outOfScope.map(function(r) { return esc(r.from + ' → ' + r.to); }).join(', ')
      + '</div>';
  }
  return html;
}

// 宣言欄の注記。宣言が無い系統でも、粒度違いで外した遷移があればそう言う
// (BLK-reviewer-20260907-2003)。「遷移すべてを突き合わせています」と出しながら
// 実際には外している状態を作らない。
function _traceScopeNote(family) {
  var esc = window.MA.htmlUtils.escHtml;
  if (family.declared) {
    return '宣言あり (' + esc(family.declaredBy.join(' / ')) + ') / 対象外 '
      + (family.outOfScope || []).length + ' 件';
  }
  var oos = (family.outOfScope || []).length;
  if (oos) {
    return '宣言なし: 粒度が違うとして ' + oos + ' 件を外しています。'
      + '担当範囲を宣言すれば意図どおりに突き合わせられます';
  }
  return '宣言なし: 遷移すべてを突き合わせています';
}

// チェックの状態を DSL に書き戻す。正本は PlantUML テキストなので、
// 宣言も図の中に置く (保存・再読込・差分のどれでも一緒に動く)。
function _traceScopeSave(covers) {
  var sd = window.MA.scopeDecl;
  var ws = window.MA.workspace;
  if (!sd || !ws || !_traceScopeDocId) return false;
  var doc = null;
  ws.list().forEach(function(d) { if (d.id === _traceScopeDocId) doc = d; });
  if (!doc) return false;
  var next = sd.apply(window.MA.dslUtils.docDsl(doc), covers);
  if (window.MA.history) window.MA.history.pushHistory();
  ws.updateDoc(doc.id, { dsl: next });
  if (doc.id === ws.getActiveId()) {
    mmdText = next;
    suppressSync = true;
    if (editorEl) editorEl.value = next;
    suppressSync = false;
    updateLineNumbers();
    scheduleRefresh();
  }
  renderTabs();
  return true;
}

function _traceRender(families, selectedKey) {
  var content = document.getElementById('tc-modal-content');
  var tc = window.MA.traceCoverage;
  if (!content || !tc) return;
  var esc = window.MA.htmlUtils.escHtml;

  var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:12px 0 4px 0;';
  var CELL = 'padding:3px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-primary);';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 8px;font-size:11px;';

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">トレースカバレッジ</h3>';

  if (families.length === 0) {
    html += '<div id="tc-empty" style="font-size:11px;color:var(--text-secondary);">'
      + '状態遷移図が開かれていません。dma_state / dma_transfer_sequence のように'
      + '系統の頭を揃えて名前を付けた状態遷移図とシーケンス図を開くと突き合わせられます。</div>'
      + '<div style="display:flex;gap:8px;margin-top:14px;">'
      + '<button id="tc-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';
    content.innerHTML = html;
    _traceRows = [];
    return;
  }

  var sel = null;
  for (var i = 0; i < families.length; i++) if (families[i].key === selectedKey) sel = families[i];
  if (!sel) sel = families[0];
  _traceRows = sel.rows;

  html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">'
    + '<label for="tc-family">系統</label> '
    + '<select id="tc-family" style="background:var(--bg-primary);border:1px solid var(--border);'
      + 'color:var(--text-primary);padding:3px 6px;border-radius:3px;font-family:var(--font-mono);">'
    + families.map(function(f) {
        // 対象外に回した遷移があれば件数を並べる。「遷移 0, 漏れ 0 件」だけだと
        // 遷移を書いていない系統と見分けが付かない (BLK-reviewer-20260907-2003)。
        var oos = (f.outOfScope || []).length;
        return '<option value="' + esc(f.key) + '"' + (f === sel ? ' selected' : '') + '>'
          + esc(f.key) + ' (遷移 ' + f.rows.length + ', 漏れ ' + f.missing.length + ' 件'
          + (oos ? ', 対象外 ' + oos + ' 件' : '') + ')</option>';
      }).join('')
    + '</select></div>';

  html += '<div id="tc-summary" data-missing="' + sel.missing.length + '" '
    + 'data-rows="' + sel.rows.length + '" data-comparable="' + (sel.comparable ? '1' : '0') + '" '
    + 'style="font-size:11px;color:' + (sel.missing.length ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + esc(tc.summaryLine(sel)) + '</div>';

  html += '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">'
    + '突合先のシーケンス図: '
    + (sel.seqDocs.length
        ? sel.seqDocs.map(function(d) { return esc(d.name); }).join(' / ')
        : '(なし)')
    + '</div>';

  html += _traceScopeSection(sel, SECTION, CELL, BTN);

  html += '<div style="' + SECTION + '">遷移 × 現れたシーケンス (赤い行はどこにも現れない = トレース漏れの候補)</div>'
    + '<table id="tc-table" style="border-collapse:collapse;width:100%;">'
    + '<tr><th style="' + CELL + 'text-align:left;">遷移</th>'
    + '<th style="' + CELL + 'text-align:left;">ラベル</th>'
    + '<th style="' + CELL + 'text-align:left;">現れたシーケンス</th></tr>';

  if (sel.rows.length === 0) {
    // 対象外に回した遷移があるのに「遷移がありません」と出すと、
    // 図を書いていないのか見ていないのかが読めない (BLK-reviewer-20260907-2003)。
    var oosN = (sel.outOfScope || []).length;
    html += '<tr><td id="tc-no-rows" colspan="3" style="' + CELL
      + 'color:var(--text-secondary);">'
      + (oosN
          ? (sel.declared ? '宣言された遷移がありません (上の欄で宣言してください)'
                          : '遷移 ' + oosN + ' 件は粒度が違うとして外しています (上の欄で宣言すれば突き合わせます)')
          : 'ラベルの付いた遷移がありません')
      + '</td></tr>';
  }
  sel.rows.forEach(function(r, ri) {
    var missing = r.status === 'missing';
    var seen = r.status === 'unknown' ? '(突き合わせていません)'
      : (r.seenIn.length ? r.seenIn.join(' / ') : 'どこにも現れない');
    html += '<tr class="tc-row' + (missing ? ' tc-missing' : '') + '" data-row-index="' + ri + '"'
      + ' data-status="' + esc(r.status) + '" data-label="' + esc(r.label) + '"'
      + ' style="cursor:pointer;' + (missing ? 'background:rgba(255,140,0,0.10);' : '') + '">'
      + '<td style="' + CELL + 'font-family:var(--font-mono);color:var(--text-secondary);">'
        + esc(r.from) + ' → ' + esc(r.to) + '</td>'
      + '<td style="' + CELL + 'font-family:var(--font-mono);'
        + (missing ? 'color:var(--accent-orange);font-weight:bold;' : '') + '">' + esc(r.label) + '</td>'
      + '<td style="' + CELL + (missing ? 'color:var(--accent-orange);' : 'color:var(--text-secondary);') + '">'
        + esc(seen) + (r.status === 'partial' ? ' (部分一致)' : '') + '</td>'
      + '</tr>';
  });
  html += '</table>'
    + '<div style="display:flex;gap:8px;margin-top:14px;">'
    + '<button id="tc-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';

  content.innerHTML = html;
}

function _traceBind(families) {
  var content = document.getElementById('tc-modal-content');
  var modal = document.getElementById('tc-modal');
  if (!content || !modal) return;

  function close() { modal.style.display = 'none'; }
  var closeBtn = document.getElementById('tc-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  var famSel = document.getElementById('tc-family');
  if (famSel) famSel.addEventListener('change', function() {
    _traceScopeDocId = null;
    _traceRender(families, this.value);
    _traceBind(families);
  });

  var selectedKey = famSel ? famSel.value : (families.length ? families[0].key : null);

  var scopeSel = document.getElementById('tc-scope-doc');
  if (scopeSel) scopeSel.addEventListener('change', function() {
    _traceScopeDocId = this.value;
    _traceRender(families, selectedKey);
    _traceBind(families);
  });

  function checkedCovers() {
    var covers = [];
    var boxes = content.querySelectorAll('.tc-scope-cb');
    for (var i = 0; i < boxes.length; i++) {
      if (!boxes[i].checked) continue;
      covers.push({ from: boxes[i].getAttribute('data-from'), to: boxes[i].getAttribute('data-to') });
    }
    return covers;
  }

  function saveScope(covers) {
    if (!_traceScopeSave(covers)) return;
    _traceRefresh(selectedKey);
  }

  var saveBtn = document.getElementById('tc-scope-save');
  if (saveBtn) saveBtn.addEventListener('click', function() { saveScope(checkedCovers()); });

  var allBtn = document.getElementById('tc-scope-all');
  if (allBtn) allBtn.addEventListener('click', function() {
    saveScope(_traceScopeChoices.map(function(c) { return { from: c.from, to: c.to }; }));
  });

  var clearBtn = document.getElementById('tc-scope-clear');
  if (clearBtn) clearBtn.addEventListener('click', function() { saveScope([]); });

  // 行はその遷移が書かれている状態遷移図の、その行へのショートカット。
  var rows = content.querySelectorAll('.tc-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].addEventListener('click', function(ev) {
      var r = _traceRows[Number(ev.currentTarget.getAttribute('data-row-index'))];
      if (!r || !r.docId || !window.MA.workspace) return;
      close();
      saveActiveDoc();
      window.MA.workspace.setActive(r.docId);
      applyActiveDoc();
      _traceScrollToLine(r.line);
    });
  }
}

// 開いた図の該当行にキャレットを置く。editor-jump と同じ計算を使うので、
// 表の行と DSL の行がずれない。
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

// 宣言を書き換えたあと、同じ系統を選んだまま突合をやり直す。
function _traceRefresh(key) {
  var tc = window.MA.traceCoverage;
  if (!tc) return null;
  var docs = _renameDocs().map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
  var families = tc.audit(docs);
  var has = families.some(function(f) { return f.key === key; });
  _traceRender(families, has ? key : (families.length ? families[0].key : null));
  _traceBind(families);
  return families;
}

function openTraceCoverage() {
  var modal = document.getElementById('tc-modal');
  var tc = window.MA.traceCoverage;
  if (!modal || !tc) return null;

  // 系統チェックと同じく、突合の対象は開いているタブ (今の中身を見る)。
  var docs = _renameDocs().map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
  var families = tc.audit(docs);
  _traceScopeDocId = null;
  _traceRender(families, families.length ? families[0].key : null);
  _traceBind(families);
  modal.style.display = 'flex';
  return families;
}

function setupTraceCoverage() {
  var btn = document.getElementById('btn-tab-trace');
  var modal = document.getElementById('tc-modal');
  if (!btn || !modal || !window.MA.traceCoverage) return;
  btn.addEventListener('click', function() { openTraceCoverage(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
}

// ── 整合性チェック ─────────────────────────────────────────────────────────
// BLK-reviewer-20260907-0843: レビューは 17 枚の DSL を読み、命名規約・未使用
// participant・メソッドの欠落・粒度対応を突合パターンごとに探していた。ここは
// 4 種の突合結果を 1 本の一覧にし、ステータスバーに件数を常時出す。作った側も
// 保存を待たずに自分の逸脱に気付ける。

function _consistencyDocs() {
  if (!window.MA.workspace) return [];
  saveActiveDoc();
  return window.MA.workspace.list();
}

// BLK-reviewer-20260908-1703: ラベル位置の慣習ズレは「⇉ 系統チェック」を開けば
// 並ぶが、開くまで在ることに気付けない。実在チェックを通ってしまうズレなので、
// 気付く手掛かりが要る。同じ突合結果を下端の 整合 の件数にも数え、開く前から出す。
function _labelOddRows(docs) {
  var LP = window.MA.labelPosition;
  var TC = window.MA.traceCoverage;
  if (!LP || !TC) return [];
  var r = LP.rank(TC.audit(docs));
  return (r && r.odd) ? r.odd : [];
}

function renderConsistencyBadge() {
  var btn = document.getElementById('status-consistency');
  var ck = window.MA.consistency;
  if (!btn || !ck) return null;
  var docs = _consistencyDocs();
  var result = ck.check(docs);
  result.labelPos = _labelOddRows(docs);
  var total = result.count + result.labelPos.length;
  btn.textContent = ck.badgeLabel({ count: total });
  btn.className = total > 0 ? 'has-warning' : '';
  btn.setAttribute('data-label-pos', String(result.labelPos.length));
  btn.title = total > 0
    ? ('命名 ' + result.naming.length + ' / 未使用 ' + result.unused.length
       + ' / メソッド ' + result.methods.length + ' / 粒度 ' + result.granularity.length
       + ' / イベント ' + result.events.length
       + ' / ラベル位置 ' + result.labelPos.length)
    : '命名規約・未使用 participant・メソッド不一致・粒度不一致・イベント名不一致・'
      + 'ラベル位置の慣習ズレはない';
  return result;
}

function openConsistencyPanel() {
  var modal = document.getElementById('ck-modal');
  var content = document.getElementById('ck-modal-content');
  var ck = window.MA.consistency;
  if (!modal || !content || !ck) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var ckDocs = _consistencyDocs();
  var result = ck.check(ckDocs);
  result.labelPos = _labelOddRows(ckDocs);

  var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:12px 0 4px 0;';
  var ROW = 'font-size:11px;color:var(--text-primary);padding:2px 0;border-bottom:1px solid var(--border);';
  var NONE = 'font-size:11px;color:var(--text-secondary);';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 8px;font-size:11px;';

  function section(id, title, rows, render) {
    var html = '<div style="' + SECTION + '">' + esc(title) + ' — ' + rows.length + ' 件</div>';
    if (rows.length === 0) {
      html += '<div id="' + id + '-none" style="' + NONE + '">ありません</div>';
      return html;
    }
    html += '<div id="' + id + '">' + rows.map(function(r) {
      return '<div class="ck-row" data-kind="' + id + '">' + render(r) + '</div>';
    }).join('') + '</div>';
    return html;
  }

  var ckTotal = result.count + result.labelPos.length;
  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">整合性チェック</h3>'
    + '<div id="ck-summary" data-count="' + ckTotal + '" '
    + 'data-label-pos="' + result.labelPos.length + '" '
    + 'data-naming="' + result.naming.length + '" data-unused="' + result.unused.length + '" '
    + 'data-methods="' + result.methods.length + '" data-granularity="' + result.granularity.length + '" '
    + 'data-events="' + result.events.length + '" '
    + 'data-method-replies="' + (result.methodReplies || []).length + '" '
    + 'style="font-size:11px;color:' + (ckTotal ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + (ckTotal === 0 ? '警告はありません' : '警告 ' + ckTotal + ' 件') + '</div>';

  // 4.11 の慣習ズレ。実在チェックは通ってしまうので、ここに出さないと
  // 系統ごとの図を開いて「ラベルが何番目の呼び出しか」を数えるしかない。
  html += section('ck-labelpos', 'ラベル位置の慣習ズレ (他系統と違う位置のメッセージを指している)',
    result.labelPos, function(r) {
      var ex = (r.entries || []).filter(function(e) { return e.odd; })[0] || (r.entries || [])[0];
      return '<span style="font-family:var(--font-mono);color:var(--accent-orange);">' + esc(r.key) + '</span>'
        + ' — ' + esc(r.conventionLabel || '')
        + ' を指す (他系統は ' + esc(r.commonLabel || '') + ')'
        + (ex ? ' <span style="color:var(--text-secondary);">' + esc(ex.label || '')
                + (ex.message && ex.message !== ex.label ? ' = ' + esc(ex.message) : '')
                + ' は ' + ex.ordinal + '/' + ex.total + ' 番目</span>' : '');
    });

  html += section('ck-naming', '命名規約の逸脱 (多数派の接尾辞から外れている)', result.naming, function(r) {
    return '<span style="font-family:var(--font-mono);color:var(--accent-orange);">' + esc(r.name) + '</span>'
      + ' — 末尾 <code>' + esc(r.suffix) + '</code> は <code>' + esc(r.expected) + '</code> に揃える'
      + ' <span style="color:var(--text-secondary);">(' + esc(r.docs.join(', ')) + ')</span>';
  });
  html += section('ck-unused', '未使用 participant (宣言だけで矢印に出てこない)', result.unused, function(r) {
    return '<span style="font-family:var(--font-mono);color:var(--accent-orange);">' + esc(r.name) + '</span>'
      + ' <span style="color:var(--text-secondary);">(' + esc(r.doc) + ')</span>';
  });
  // BLK-reviewer-20260907-1703: 応答 (Ack / Ready) は毎回ここに並び、
  // どれが本物の欠落かを目でふるい分けていた。突合から外した分は数だけ出す。
  html += section('ck-methods', 'メソッド不一致 (呼んでいるのにクラスに無い)', result.methods, function(r) {
    return '<span style="font-family:var(--font-mono);color:var(--accent-orange);">'
      + esc(r.target) + '.' + esc(r.method) + '</span>'
      + ' <span style="color:var(--text-secondary);">(' + esc(r.doc) + ')</span>';
  });
  var reps = result.methodReplies || [];
  if (reps.length) {
    html += '<div id="ck-method-replies" style="' + NONE + 'margin-top:2px;">'
      + '呼び出しへの応答 ' + reps.length + ' 件は突合から外しました ('
      + esc(reps.slice(0, 5).map(function(r) { return r.method; }).join(', '))
      + (reps.length > 5 ? ' ほか' : '') + ')</div>';
  }
  // BLK-reviewer-20260907-0943: state の遷移ラベルはこれまでどの突合にも掛からず、
  // 接頭辞だけ替えて複製した図のイベント名の取り残しを誰も見つけられなかった。
  html += section('ck-events', 'イベント名不一致 (state の遷移に対応するクラスメソッドが無い)', result.events, function(r) {
    return '<span style="font-family:var(--font-mono);color:var(--accent-orange);">' + esc(r.event) + '</span>'
      + (r.kind === 'no-class'
          ? ' — ' + esc(r.owner || '対応する型') + ' のクラスがどの図にも無い'
          : ' — ' + esc(r.cls) + ' に宣言が無い')
      + ' <span style="color:var(--text-secondary);">(' + esc(r.docs.join(', ')) + ')</span>';
  });
  html += section('ck-granularity', '粒度不一致 (系統の片方にしか無い動作名)', result.granularity, function(r) {
    return '<span style="font-family:var(--font-mono);color:var(--accent-orange);">' + esc(r.label) + '</span>'
      + ' <span style="color:var(--text-secondary);">(' + esc(r.family) + ' 系 / ' + esc(r.onlyIn) + ' にだけ)</span>';
  });

  html += '<div style="display:flex;gap:8px;margin-top:14px;">'
    + '<button id="ck-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';

  content.innerHTML = html;
  var rows = content.querySelectorAll('.ck-row');
  for (var i = 0; i < rows.length; i++) rows[i].setAttribute('style', ROW);
  modal.style.display = 'flex';

  // ズレの行から「⇉ 系統チェック」のその系統へ降りる。ここで系統名を覚えて
  // 別のパネルを探し直す、をしないで済むようにする。
  var lpRows = content.querySelectorAll('#ck-labelpos .ck-row');
  for (var j = 0; j < lpRows.length; j++) {
    lpRows[j].setAttribute('style', ROW + 'cursor:pointer;');
    lpRows[j].setAttribute('data-key', (result.labelPos[j] || {}).key || '');
    lpRows[j].addEventListener('click', function(ev) {
      var key = ev.currentTarget.getAttribute('data-key');
      modal.style.display = 'none';
      openFamilyAudit();
      var sel = document.getElementById('fa-family');
      if (sel && key && sel.value !== key) {
        sel.value = key;
        sel.dispatchEvent(new Event('change'));
      }
    });
  }

  var closeBtn = document.getElementById('ck-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
  return result;
}

function setupConsistencyPanel() {
  var btn = document.getElementById('status-consistency');
  var modal = document.getElementById('ck-modal');
  if (!btn || !modal || !window.MA.consistency) return;
  btn.addEventListener('click', function() { openConsistencyPanel(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
  renderConsistencyBadge();
}

// ── イベント⇔メソッド整合 ─────────────────────────────────────────────────
// BLK-primary-20260907-1803-wish: レビュー指摘は「イベント名の一覧」で来るのに、
// GUI 側には「どのクラスに何が足りないか」をまとめて示す画面が無かった。
// 指摘文とクラス一覧を目で見比べて対応表を作り、Adc_Driver / Gpio_Driver /
// Can_Driver を順にクリックしてメソッド追加フォームを開き名前を打つ、を
// クラスの数だけ繰り返していた。ここは突合表を 1 画面に出し、欠落行から
// 直接メソッドを足せるようにする。複数行をまとめて当てられるので、
// 「同じ種類の修正を 1 件ずつ繰り返す」形にならない。
// 表と DSL の書き換えは src/core/event-sync.js の職掌。ここは表示と結線だけ。

function renderEventSyncBadge() {
  var btn = document.getElementById('status-eventsync');
  var es = window.MA.eventSync;
  if (!btn || !es) return null;
  var result = es.build(_consistencyDocs());
  btn.textContent = es.badgeLabel(result);
  var n = result.counts.missing + result.counts.noClass;
  btn.className = n > 0 ? 'has-warning' : '';
  btn.title = n > 0
    ? ('state の遷移イベント ' + result.total + ' 種 — 欠落 ' + result.counts.missing
       + ' / クラス無し ' + result.counts.noClass)
    : 'state の遷移イベントに対応するクラスメソッドはすべて揃っている';
  return result;
}

// 図の書き換えをまとめて反映する。アクティブな図はエディタごと差し替え、
// undo は 1 手で戻せるようにする (一括置換と同じ経路)。
function _applyDocPatches(changed) {
  if (!window.MA.workspace || !changed || !changed.length) return;
  var activeId = window.MA.workspace.getActiveId();
  if (window.MA.history) window.MA.history.pushHistory();
  changed.forEach(function(c) {
    if (c.id === activeId) {
      mmdText = c.dsl;
      suppressSync = true;
      editorEl.value = mmdText;
      suppressSync = false;
    }
    window.MA.workspace.updateDoc(c.id, { dsl: c.dsl });
  });
  updateLineNumbers();
  scheduleRefresh();
  renderTabs();
  try { renderConsistencyBadge(); } catch (e) {}
  try { renderEventSyncBadge(); } catch (e) {}
}

// 表の行 (index の配列) をクラスに足す。戻り値の型はパネル上の入力を使う。
function applyEventSync(indexes) {
  var es = window.MA.eventSync;
  if (!es) return null;
  var docs = _consistencyDocs();
  var result = es.build(docs);
  var retEl = document.getElementById('ev-ret');
  var ret = retEl ? String(retEl.value || '').trim() : 'void';
  var rows = (indexes || []).map(function(i) { return result.rows[i]; })
    .filter(function(r) { return r && r.status === 'missing'; });
  if (rows.length === 0) return null;
  var res = es.apply(docs, rows, ret);
  _applyDocPatches(res.changed);
  openEventSyncPanel(res);
  return res;
}

function openEventSyncPanel(applied) {
  var modal = document.getElementById('ev-modal');
  var content = document.getElementById('ev-modal-content');
  var es = window.MA.eventSync;
  if (!modal || !content || !es) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var result = es.build(_consistencyDocs());

  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 8px;font-size:11px;';
  var TD = 'font-size:11px;padding:3px 6px;border-bottom:1px solid var(--border);vertical-align:top;';
  var TH = 'font-size:10px;color:var(--accent);text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);';
  var LABEL = {
    missing: '欠落', 'no-class': 'クラス無し', ok: '宣言あり', excluded: '対象外',
  };
  var COLOR = {
    missing: 'var(--accent-orange)', 'no-class': 'var(--accent-red)',
    ok: 'var(--accent-green)', excluded: 'var(--text-secondary)',
  };

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">⇄ イベント整合 (state の遷移 ⇔ class のメソッド)</h3>'
    + '<div id="ev-summary" data-total="' + result.total + '" data-missing="' + result.counts.missing + '"'
    + ' data-no-class="' + result.counts.noClass + '" data-ok="' + result.counts.ok + '"'
    + ' data-excluded="' + result.counts.excluded + '"'
    + ' style="font-size:11px;color:' + (result.counts.missing + result.counts.noClass ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + esc(es.summary(result)) + '</div>';

  if (applied) {
    html += '<div id="ev-applied" style="font-size:11px;color:var(--accent-green);margin-top:4px;">'
      + applied.added.length + ' 件を追加しました'
      + (applied.added.length ? ' (' + esc(applied.added.join(', ')) + ')' : '')
      + (applied.skipped.length ? ' / 見送り ' + applied.skipped.length + ' 件' : '') + '</div>';
  }

  html += '<div style="display:flex;gap:8px;align-items:center;margin:10px 0 6px 0;">'
    + '<label style="font-size:11px;color:var(--text-secondary);">追加するメソッドの戻り値</label>'
    + '<input id="ev-ret" type="text" value="void" style="width:100px;font-size:11px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:3px;padding:2px 4px;">'
    + '<button id="ev-select-all" style="' + BTN + '">欠落をすべて選ぶ</button>'
    + '<button id="ev-apply-selected" style="' + BTN + '">選んだ行をまとめて追加</button>'
    + '<span id="ev-selected-count" style="font-size:11px;color:var(--text-secondary);">0 件選択</span>'
    + '</div>';

  html += '<table id="ev-table" style="width:100%;border-collapse:collapse;">'
    + '<tr><th style="' + TH + '"></th><th style="' + TH + '">イベント</th>'
    + '<th style="' + TH + '">state 図</th><th style="' + TH + '">状態</th>'
    + '<th style="' + TH + '">クラス (図)</th><th style="' + TH + '"></th></tr>';

  result.rows.forEach(function(r, i) {
    var can = r.status === 'missing';
    html += '<tr class="ev-row" data-index="' + i + '" data-status="' + r.status + '" data-event="' + esc(r.event) + '">'
      + '<td style="' + TD + '">'
      + (can ? '<input type="checkbox" class="ev-pick" data-index="' + i + '">' : '')
      + '</td>'
      + '<td style="' + TD + 'font-family:var(--font-mono);color:' + COLOR[r.status] + ';">' + esc(r.event) + '</td>'
      + '<td style="' + TD + 'color:var(--text-secondary);">' + esc(r.stateDocs.join(', ')) + '</td>'
      + '<td style="' + TD + 'color:' + COLOR[r.status] + ';">' + LABEL[r.status] + '</td>'
      + '<td style="' + TD + 'font-family:var(--font-mono);">'
      + (r.cls ? esc(r.cls) + (r.classDoc ? ' <span style="color:var(--text-secondary);font-family:var(--font-sans);">(' + esc(r.classDoc) + ')</span>' : '')
               : (r.status === 'no-class' ? '<span style="color:var(--text-secondary);">' + esc(r.owner || '対応する型') + ' のクラスがどの図にも無い</span>'
                                          : '<span style="color:var(--text-secondary);">接頭辞なし (突合の対象外)</span>'))
      + '</td>'
      + '<td style="' + TD + '">'
      + (can ? '<button class="ev-add" data-index="' + i + '" style="' + BTN + '">このクラスに追加</button>' : '')
      + '</td></tr>';
  });
  html += '</table>';

  html += '<div style="display:flex;gap:8px;margin-top:14px;">'
    + '<button id="ev-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';

  content.innerHTML = html;
  modal.style.display = 'flex';

  function countPicked() {
    var picks = content.querySelectorAll('.ev-pick');
    var n = 0;
    for (var i = 0; i < picks.length; i++) if (picks[i].checked) n++;
    var el = document.getElementById('ev-selected-count');
    if (el) el.textContent = n + ' 件選択';
    return n;
  }
  function pickedIndexes() {
    var picks = content.querySelectorAll('.ev-pick');
    var out = [];
    for (var i = 0; i < picks.length; i++) {
      if (picks[i].checked) out.push(parseInt(picks[i].getAttribute('data-index'), 10));
    }
    return out;
  }

  var picks = content.querySelectorAll('.ev-pick');
  for (var p = 0; p < picks.length; p++) picks[p].addEventListener('change', countPicked);

  var adds = content.querySelectorAll('.ev-add');
  for (var a = 0; a < adds.length; a++) {
    adds[a].addEventListener('click', function(ev) {
      applyEventSync([parseInt(ev.currentTarget.getAttribute('data-index'), 10)]);
    });
  }
  var selAll = document.getElementById('ev-select-all');
  if (selAll) selAll.addEventListener('click', function() {
    var all = content.querySelectorAll('.ev-pick');
    for (var i = 0; i < all.length; i++) all[i].checked = true;
    countPicked();
  });
  var applyBtn = document.getElementById('ev-apply-selected');
  if (applyBtn) applyBtn.addEventListener('click', function() { applyEventSync(pickedIndexes()); });
  var closeBtn = document.getElementById('ev-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
  return result;
}

function setupEventSyncPanel() {
  var btn = document.getElementById('status-eventsync');
  var modal = document.getElementById('ev-modal');
  if (!btn || !modal || !window.MA.eventSync) return;
  btn.addEventListener('click', function() { openEventSyncPanel(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
  renderEventSyncBadge();
}

// ── 引き継ぎパッケージ ─────────────────────────────────────────────────────
// BLK-primary-20260907-1303-wish: 新人への引き継ぎは ⇉系統チェック・🔍名前突合・
// ▤変更サマリ を別々のタブで開いて見せ、「問題なし」を口頭で伝える形だった。
// 渡された側は後から同じ状態を再現できない。ここは 4 つ (系統チェック結果 /
// 名前突合結果 / 直近の変更サマリ / SVG 一式) を 1 つの zip に固めて渡す。
// 判定と HTML は src/core/handoff-package.js の職掌。ここは材料を集めるだけ。

function buildHandoffPackage(targetDocs) {
  var HP = window.MA.handoffPackage;
  var BE = window.MA.bulkExport;
  if (!HP || !BE || !window.MA.workspace) return Promise.resolve(null);
  // 編集中の内容が workspace に載っていないと 1 枚だけ古い DSL で固まる。
  saveActiveDoc();

  // 対象は「対象確認」で確定したもの。渡されなければ開いているタブ。
  var src = Array.isArray(targetDocs) && targetDocs.length ? targetDocs : _renameDocs();
  var docs = src.map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
  var status = document.getElementById('bulk-export-status');
  if (status) { status.style.display = 'block'; status.textContent = '引き継ぎパッケージを作っています…'; }

  var svgs = {};
  var order = docs.slice();

  function renderNext(i) {
    if (i >= order.length) return Promise.resolve();
    var d = order[i];
    if (status) status.textContent = '引き継ぎパッケージを作っています… ' + (i + 1) + ' / ' + order.length;
    // 1 枚失敗しても残りは続ける。落ちた図は「書き出せませんでした」と書いて渡す。
    return Promise.resolve(renderDslToSvg(d.dsl)).then(function(svg) {
      if (svg) svgs[d.id] = svg;
    }, function() {}).then(function() { return renderNext(i + 1); });
  }

  return renderNext(0).then(function() {
    var FA = window.MA.familyAudit;
    var NA = window.MA.nameAudit;
    var snapshot = HP.buildSnapshot({
      docs: docs,
      families: FA ? FA.audit(docs) : [],
      names: NA ? NA.audit(docs) : null,
      board: _changeBoardModel(),
      svgs: svgs,
      notes: window.MA.handoverNotes ? window.MA.handoverNotes.list() : [],
    });
    // 渡した時点のチェックリストを控える。次の起動で未読・要フォローを出すため。
    if (window.MA.handoverChecklist) window.MA.handoverChecklist.issue(snapshot.checklist);
    var name = HP.packageName();
    downloadBlob(name, new Blob([BE.buildZip(HP.files(snapshot))], { type: 'application/zip' }));
    // 何枚のうち何枚を出したかを結果にも残す (zip を開くまで気づけない欠落を作らない)。
    var msg = '引き継ぎパッケージを書き出しました（' + name + '） '
      + (_etResultLine ? _etResultLine + ' ・ ' : '') + snapshot.verdict;
    if (status) status.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    return snapshot;
  });
}

// ── 書き出す前の対象確認 ───────────────────────────────────────────────────
// BLK-primary-20260908-2303-wish: 📦引き継ぎ は開いているタブだけを対象にする
// ため、保存フォルダに 14 枚あってもタブ 2 枚分しか zip に入らず、受け取った
// 新人が開いて初めて欠落に気づく。書き出す前に「対象 2 枚 / 保存フォルダ 14 枚」
// の差分と「保存フォルダ全体を対象にする」への切替を出し、渡す前に直せるようにする。
// 判定は src/core/export-target.js の職掌。ここは材料集めと結線だけ。

var _etMode = null;      // 'open' | 'folder' | null (既定に任せる)
// BLK-primary-20260909-0403-wish: 「-編集中」等のスクラッチは既定で対象外。
// 渡す側が意図してチェックを入れたときだけ同梱する (開き直すと既定に戻る)。
var _etIncludeScratch = false;
var _etFileDocs = [];    // 保存フォルダから読んだ図 ({name, dsl})
var _etRoles = {};
var _etDir = '';
var _etLoading = false;
var _etSeq = 0;
var _etOnBuild = null;   // 「書き出す」で呼ぶもの (docs, model) => Promise
var _etTitle = '';
var _etResultLine = '';  // 直前の書き出しの対象内訳。結果の 1 行に混ぜる

function _etLoadFolder() {
  var WS = window.MA.workspace;
  if (!WS || !WS.listFolder || !_fiFolderMode()) {
    _etFileDocs = []; _etRoles = {}; _etDir = ''; _etLoading = false;
    return Promise.resolve(false);
  }
  var dir = _wsFileDir();
  var seq = ++_etSeq;
  _etLoading = true;
  return WS.listFolder(dir).then(function(info) {
    var names = ((info && info.entries) || []).map(function(e) {
      return e && typeof e === 'object' ? e.name : e;
    }).filter(function(n) { return n; });
    var roles = (info && info.roles) || {};
    return Promise.all(names.map(function(n) {
      return WS.loadFile(n, dir).then(function(text) {
        return typeof text === 'string' ? { name: n, dsl: text } : null;
      }, function() { return null; });
    })).then(function(docs) {
      if (seq !== _etSeq) return false;
      _etFileDocs = docs.filter(function(d) { return d; });
      _etRoles = roles;
      _etDir = dir;
      _etLoading = false;
      if (document.getElementById('et-modal-content')) renderExportTargetPanel();
      return true;
    });
  }).catch(function() {
    if (seq === _etSeq) { _etLoading = false; renderExportTargetPanel(); }
    return false;
  });
}

function _etModel() {
  var ET = window.MA.exportTarget;
  var WS = window.MA.workspace;
  if (!ET) return null;
  return ET.model({
    openDocs: _renameDocs(),
    folderDocs: _etFileDocs,
    roles: _etRoles,
    folderAvailable: _fiFolderMode() && _etFileDocs.length > 0,
    folderDir: _etDir,
    loading: _etLoading,
    mode: _etMode,
    includeScratch: _etIncludeScratch,
    detectType: (WS && WS.detectType) ? WS.detectType : null,
  });
}

function renderExportTargetPanel() {
  var content = document.getElementById('et-modal-content');
  var m = _etModel();
  if (!content || !m) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:4px 12px;font-size:11px;';

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">' + esc(_etTitle) + ' — 対象確認</h3>'
    + '<div style="font-size:11px;color:var(--text-secondary);">書き出す前に、何が入るかをここで確定します。</div>';

  html += '<div id="et-line" data-warn="' + (m.warn ? '1' : '0')
    + '" data-count="' + m.count + '" data-folder="' + m.folderCount + '"'
    + ' data-missing="' + m.missing + '" data-mode="' + esc(m.mode) + '"'
    + ' data-scratch="' + m.scratch + '" data-include-scratch="' + (m.includeScratch ? '1' : '0') + '"'
    + ' style="margin-top:10px;font-size:12px;'
    + (m.warn ? 'color:var(--warning,#d98b00);' : 'color:var(--text-primary);') + '">'
    + esc((m.warn ? '⚠ ' : '') + m.line) + '</div>';
  if (m.hint) {
    html += '<div id="et-hint" style="margin-top:2px;font-size:11px;color:var(--text-secondary);">'
      + esc(m.hint) + '</div>';
  }

  html += '<div style="margin-top:10px;font-size:10px;color:var(--accent);font-weight:bold;">対象の的</div>'
    + '<label style="display:block;font-size:11px;color:var(--text-primary);padding:2px 0;">'
    + '<input type="radio" name="et-mode" id="et-mode-folder" value="folder"'
    + (m.mode === 'folder' ? ' checked' : '') + (m.folderAvailable ? '' : ' disabled') + '> '
    + '保存フォルダ全体（' + m.folderCount + ' 枚'
    + (m.folderDir ? ' ・ ' + esc(m.folderDir) : '') + '）'
    + (m.folderAvailable ? '' : ' — 保存先フォルダが未設定です') + '</label>'
    + '<label style="display:block;font-size:11px;color:var(--text-primary);padding:2px 0;">'
    + '<input type="radio" name="et-mode" id="et-mode-open" value="open"'
    + (m.mode === 'open' ? ' checked' : '') + '> '
    + '開いているタブだけ（' + m.openCount + ' 枚）</label>';
  if (m.scratch > 0) {
    html += '<label id="et-scratch-row" style="display:block;font-size:11px;padding:4px 0 0;'
      + 'color:var(--warning,#d98b00);">'
      + '<input type="checkbox" id="et-include-scratch"' + (m.includeScratch ? ' checked' : '') + '> '
      + esc(m.scratchLine) + '</label>';
  }
  if (m.loading) {
    html += '<div id="et-loading" style="font-size:11px;color:var(--text-secondary);">保存フォルダを読んでいます…</div>';
  }

  html += '<div id="et-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);'
    + 'border-radius:3px;margin-top:8px;padding:4px;">';
  m.all.forEach(function(d) {
    var on = m.targets.indexOf(d) !== -1;
    html += '<div class="et-item" data-name="' + esc(d.name) + '" data-in="' + (on ? '1' : '0')
      + '" data-open="' + (d.open ? '1' : '0') + '" data-scratch="' + (d.scratch ? '1' : '0')
      + '" data-role="' + esc(d.role || 'unset')
      + '" style="font-size:11px;padding:1px 2px;color:'
      + (on ? 'var(--text-primary)' : 'var(--text-secondary)') + ';">'
      + (on ? '✔ ' : '− ') + esc(d.name)
      + '<span style="color:var(--text-secondary);"> '
      + esc(String(d.diagramType || '').replace('plantuml-', ''))
      + (d.open ? '' : ' ・ 未オープン')
      + (d.scratch ? ' ・ ⚠ 未確定' : '')
      + (d.role === 'template' ? ' ・ テンプレ' : '') + '</span></div>';
  });
  html += '</div>';

  html += '<div id="et-status" style="margin-top:8px;font-size:11px;color:var(--text-secondary);min-height:14px;"></div>';
  html += '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">'
    + '<button type="button" id="et-cancel" style="' + BTN + '">キャンセル</button>'
    + '<button type="button" id="et-build" style="' + BTN + 'background:var(--accent);color:#fff;"'
    + (m.canBuild ? '' : ' disabled') + '>この ' + m.count + ' 枚で書き出す</button></div>';

  content.innerHTML = html;

  var folder = document.getElementById('et-mode-folder');
  if (folder) folder.addEventListener('change', function() { _etMode = 'folder'; renderExportTargetPanel(); });
  var open = document.getElementById('et-mode-open');
  if (open) open.addEventListener('change', function() { _etMode = 'open'; renderExportTargetPanel(); });
  var inc = document.getElementById('et-include-scratch');
  if (inc) inc.addEventListener('change', function() {
    _etIncludeScratch = !!inc.checked; renderExportTargetPanel();
  });
  var cancel = document.getElementById('et-cancel');
  if (cancel) cancel.addEventListener('click', function() { closeExportTargetPanel(); });
  var build = document.getElementById('et-build');
  if (build) build.addEventListener('click', function() { confirmExportTarget(); });
  return m;
}

function openExportTargetPanel(title, onBuild) {
  var modal = document.getElementById('et-modal');
  if (!modal || !window.MA.exportTarget) return null;
  _etTitle = title || '書き出し';
  _etOnBuild = onBuild;
  // 開くたびに的を取り直す (タブが増減した後で古い選択を引きずらない)。
  _etMode = null;
  _etIncludeScratch = false;
  _etFileDocs = [];
  _etRoles = {};
  _etDir = '';
  _etLoadFolder();
  var m = renderExportTargetPanel();
  modal.style.display = 'flex';
  return m;
}

function closeExportTargetPanel() {
  var modal = document.getElementById('et-modal');
  if (modal) modal.style.display = 'none';
}

function confirmExportTarget() {
  var ET = window.MA.exportTarget;
  var m = _etModel();
  if (!m || !m.canBuild) return Promise.resolve(null);
  _etResultLine = ET.resultLine(m);
  var fn = _etOnBuild;
  closeExportTargetPanel();
  if (typeof fn !== 'function') return Promise.resolve(null);
  return Promise.resolve(fn(m.targets, m));
}

function setupHandoffPackage() {
  var btn = document.getElementById('btn-tab-handoff');
  var modal = document.getElementById('et-modal');
  if (!btn || !window.MA.handoffPackage) return;
  btn.addEventListener('click', function() {
    if (!window.MA.exportTarget || !modal) { buildHandoffPackage(); return; }
    openExportTargetPanel('\u{1F4E6} 引き継ぎ', function(docs) { return buildHandoffPackage(docs); });
  });
  if (modal) modal.addEventListener('click', function(ev) {
    if (ev.target === modal) closeExportTargetPanel();
  });
}

// ── 納品パッケージ ─────────────────────────────────────────────────────────
// BLK-primary-20260907-1703-wish: 顧客に渡す最終成果物は、全図 SVG の zip に
// 表紙 (図一覧・版数・提出前チェック結果) と変更履歴 (前回提出からの差分) を
// 人手で足して作っていた。材料はどれも GUI にあるのに、組み立てだけが画面の外だった。
// ここは対象の枚数・題・版数を選ばせ、1 つの zip にまとめて出す。
// 判定と HTML は src/core/delivery-package.js の職掌。ここは材料を集めるだけ。

var _dpDocs = null;      // 対象に選んでいる図 (name の配列)。null は「まだ既定を決めていない」

// BLK-primary-20260908-1903: 対象の的は保存フォルダ全体。開いているタブだけを
// 見ていたので、14 枚のフォルダで 5 枚しかタブが無いと残り 9 枚が黙って落ちた。
var _dpFileDocs = [];    // 保存フォルダから読んだ図 ({name, dsl})
var _dpRoles = {};       // file-role (テンプレは既定から外す)
var _dpFolderDir = null; // 読み込み済みのフォルダ。開き直すたびに取り直す
var _dpLoading = false;
var _dpSeq = 0;

// BLK-primary-20260909-0003-wish: 「前回いつ・どの版を客先に出したか」の控えは
// 保存フォルダに置く (localStorage だけだと開き直すたびに消え、同じフォルダで
// 何度出しても毎回「初回提出 (23 枚すべて新規)」になっていた)。
// ここは読み込んだ控えを持つだけ。判定は src/core/export-log.js の職掌。
var _dpMetaTouched = false;  // 題・版数を手で書き換えたか (書き換えていなければ控えから引き直す)
var _elLog = null;        // 保存フォルダの控え。null は「まだ読んでいない」
var _elDir = null;        // その控えを読んだフォルダ

function _elHas(channel) {
  var EL = window.MA.exportLog;
  return !!(EL && _elLog && EL.latest(_elLog, channel).at);
}

// 前回書き出しの控えを保存フォルダから読む。フォルダ運用でなければ何もしない。
function _elLoad() {
  var WS = window.MA.workspace;
  var EL = window.MA.exportLog;
  if (!WS || !EL || !WS.listFolder || !_fiFolderMode()) return Promise.resolve(null);
  var dir = _wsFileDir();
  return WS.listFolder(dir).then(function(info) {
    _elLog = EL.parse((info && info.exportLog) || null);
    _elDir = dir;
    return _elLog;
  }, function() { return null; });
}

// 控えに 1 件足してフォルダに書き戻す。書けなくても書き出し自体は成り立つ。
function _elRecord(channel, entry) {
  var WS = window.MA.workspace;
  var EL = window.MA.exportLog;
  if (!EL) return Promise.resolve(null);
  _elLog = EL.record(_elLog || EL.empty(), channel, entry);
  if (!WS || !WS.saveExportLog || !_fiFolderMode()) return Promise.resolve(_elLog);
  return WS.saveExportLog(_elLog, _wsFileDir()).then(function() { return _elLog; },
                                                     function() { return _elLog; });
}

// 前回提出時点の DSL。フォルダの控えがあればそれが基準、無ければ localStorage の控え。
function _dpBaselineOf(name) {
  var EL = window.MA.exportLog;
  var DP = window.MA.deliveryPackage;
  if (EL && _elHas('delivery')) return EL.baselineOf(_elLog, 'delivery', name);
  return DP ? DP.baselineOf(name) : null;
}

// 前回提出の見出し。フォルダの控えを localStorage より優先する。
function _dpLastDelivery() {
  var EL = window.MA.exportLog;
  var DP = window.MA.deliveryPackage;
  if (EL && _elHas('delivery')) {
    var e = EL.latest(_elLog, 'delivery');
    return { title: e.title, revision: e.revision, at: e.at, count: e.count, file: e.file };
  }
  var l = DP ? DP.lastDelivery() : { title: '', revision: '', at: '', count: 0 };
  l.file = '';
  return l;
}

// 開いているタブ + 保存フォルダ。判定は delivery-package.candidates の職掌。
function _dpCandidates() {
  var DP = window.MA.deliveryPackage;
  var WS = window.MA.workspace;
  var open = _renameDocs();
  if (!DP || !DP.candidates) return open;
  return DP.candidates(open, _dpFileDocs, _dpRoles,
    (WS && WS.detectType) ? WS.detectType : null);
}

function _dpSelectedDocs() {
  var docs = _dpCandidates();
  if (!_dpDocs) return docs;
  return docs.filter(function(d) { return _dpDocs.indexOf(d.name) !== -1; });
}

// 保存フォルダの全 puml を読む。localStorage 運用では「フォルダ全体」という的が
// 無いので何もしない (その場合の的は開いているタブのまま)。
function _dpLoadFolder() {
  var WS = window.MA.workspace;
  if (!WS || !WS.listFolder || !_fiFolderMode()) {
    _dpFileDocs = []; _dpRoles = {}; _dpFolderDir = null;
    return Promise.resolve(false);
  }
  var dir = _wsFileDir();
  var seq = ++_dpSeq;
  _dpLoading = true;
  return WS.listFolder(dir).then(function(info) {
    var names = ((info && info.entries) || []).map(function(e) {
      return e && typeof e === 'object' ? e.name : e;
    }).filter(function(n) { return n; });
    var roles = (info && info.roles) || {};
    return Promise.all(names.map(function(n) {
      return WS.loadFile(n, dir).then(function(text) {
        return typeof text === 'string' ? { name: n, dsl: text } : null;
      }, function() { return null; });
    })).then(function(docs) {
      if (seq !== _dpSeq) return false;
      // 図の一覧と同じ呼び出しで控えも受け取る (別呼び出しにすると
      // 「初回提出」と出したあとで履歴が現れる、という見え方になる)。
      if (window.MA.exportLog) {
        _elLog = window.MA.exportLog.parse((info && info.exportLog) || null);
        _elDir = dir;
      }
      _dpFileDocs = docs.filter(function(d) { return d; });
      _dpRoles = roles;
      _dpFolderDir = dir;
      _dpLoading = false;
      // フォルダが読めたので既定を取り直す (タブだけの既定を引きずらない)。
      _dpDocs = null;
      if (document.getElementById('dp-modal-content')) renderDeliveryPanel();
      return true;
    });
  }).catch(function() {
    if (seq === _dpSeq) { _dpLoading = false; renderDeliveryPanel(); }
    return false;
  });
}

function _dpBoard(docs) {
  var CB = window.MA.changeBoard;
  var DP = window.MA.deliveryPackage;
  if (!CB || !DP) return null;
  // 提出物の一覧なので、変わっていない図も「変更なし」と書いて並べる。
  return CB.build(docs, _dpBaselineOf, { includeSame: true, collapse: true, context: 0 });
}

function _dpSubmitResult(docs) {
  var SC = window.MA.submitCheck;
  if (!SC) return null;
  return SC.check(docs, SC.parseDict(_scLoadDict()));
}

// 納品履歴の節。保存フォルダの控えにある提出を新しい順に出す。
// 「過去に何度も同じフォルダで作っているのに前回が分からない」を無くすための一覧。
function _dpHistoryHtml(esc) {
  var EL = window.MA.exportLog;
  var list = EL ? EL.entries(_elLog, 'delivery') : [];
  var html = '<div id="dp-history" data-count="' + list.length
    + '" style="margin-top:8px;font-size:11px;color:var(--text-secondary);'
    + 'border:1px solid var(--border);border-radius:3px;padding:6px;">'
    + '<div style="font-size:10px;color:var(--accent);font-weight:bold;">納品履歴（このフォルダ）</div>';
  if (list.length === 0) {
    html += '<div class="dp-hist-row">このフォルダからの提出はまだ記録されていません</div>';
  } else {
    list.slice(0, 5).forEach(function(e, i) {
      html += '<div class="dp-hist-row"' + (i === 0 ? ' data-latest="1"' : '') + '>'
        + esc((i === 0 ? '前回 ' : '') + EL.historyLine(e, 'delivery')) + '</div>';
    });
    if (list.length > 5) {
      html += '<div class="dp-hist-row">ほか ' + esc(String(list.length - 5)) + ' 件</div>';
    }
  }
  return html + '</div>';
}

function renderDeliveryPanel() {
  var DP = window.MA.deliveryPackage;
  var content = document.getElementById('dp-modal-content');
  if (!DP || !content) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var all = _dpCandidates();
  if (!_dpDocs) _dpDocs = DP.defaultPicks(all);
  var picked = _dpSelectedDocs();
  var cover = DP.coverage(all, _dpDocs);
  var last = _dpLastDelivery();
  var submit = _dpSubmitResult(picked);
  var board = _dpBoard(picked);
  var change = DP.changeSection(board, last);
  var sub = DP.submitSection(submit);

  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:4px 12px;font-size:11px;';
  var IN = 'background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:3px 6px;font-size:12px;';

  // 手で書き換えていないうちは、画面に残っている値ではなく前回提出の控えから引く
  // (保存フォルダの控えは開いた後から届くので、届く前の既定を固定しない)。
  var titleVal = document.getElementById('dp-title');
  var revVal = document.getElementById('dp-revision');
  var title = (_dpMetaTouched && titleVal) ? titleVal.value : (last.title || '設計書 図面集');
  var rev = (_dpMetaTouched && revVal) ? revVal.value : DP.nextRevision(last.revision);

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">\u{1F4E6} 納品パッケージ</h3>'
    + '<div id="dp-last" style="font-size:11px;color:var(--text-secondary);">'
    + esc(last.at ? '前回提出 ' + (last.revision || '版数なし') + ' ・ ' + last.at.replace('T', ' ').slice(0, 16)
                  + ' ・ ' + last.count + ' 枚' + (last.file ? ' ・ ' + last.file : '')
                : 'まだ 1 度も提出していません（今回が初回提出になります）') + '</div>';

  // 納品履歴。「前回いつ・どの版を出したか」は表紙の材料であり、
  // 次に確かめる図を絞る基準でもあるので、対象を選ぶ前に見せる。
  html += _dpHistoryHtml(esc);

  html += '<div style="display:flex;gap:12px;margin-top:10px;">'
    + '<label style="flex:2;font-size:10px;color:var(--accent);font-weight:bold;">タイトル'
    + '<input id="dp-title" style="' + IN + 'width:100%;margin-top:3px;" value="' + esc(title) + '"></label>'
    + '<label style="flex:1;font-size:10px;color:var(--accent);font-weight:bold;">版数'
    + '<input id="dp-revision" style="' + IN + 'width:100%;margin-top:3px;" value="' + esc(rev) + '"></label>'
    + '</div>';

  html += '<div style="margin-top:12px;font-size:10px;color:var(--accent);font-weight:bold;">'
    + '対象の図 <span id="dp-count" style="color:var(--text-secondary);font-weight:normal;">'
    + esc(picked.length + ' / ' + all.length + ' 枚') + '</span>'
    + (_dpLoading ? ' <span id="dp-loading" style="color:var(--text-secondary);font-weight:normal;">保存フォルダを読んでいます…</span>' : '')
    + ' <button type="button" id="dp-all" style="' + BTN + 'padding:1px 8px;">全部</button>'
    + ' <button type="button" id="dp-none" style="' + BTN + 'padding:1px 8px;">全部外す</button>'
    // 前回提出からの差分だけを見る。23 枚全部の要確認を毎回目視する代わりに、
    // 「前回提出以降に変わった図」だけを対象に絞れるようにする。
    + ' <button type="button" id="dp-changed" style="' + BTN + 'padding:1px 8px;"'
    + (_elHas('delivery') ? '' : ' disabled title="まだ 1 度も提出していません"')
    + '>前回提出から変わった図だけ</button></div>';
  // 欠落の警告。枚数を数えなくても「9 枚落ちる」と読めるようにする。
  html += '<div id="dp-coverage" data-warn="' + (cover.warn ? '1' : '0')
    + '" data-total="' + cover.total + '" data-picked="' + cover.picked + '"'
    + ' data-missing="' + cover.missing + '" data-unopened="' + cover.missingUnopened + '"'
    + ' style="margin-top:4px;font-size:11px;'
    + (cover.warn ? 'color:var(--warning,#d98b00);' : 'color:var(--text-secondary);') + '">'
    + esc((cover.warn ? '⚠ ' : '') + cover.line) + '</div>';
  html += '<div id="dp-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:3px;margin-top:4px;padding:4px;">';
  all.forEach(function(d) {
    var on = _dpDocs.indexOf(d.name) !== -1;
    var st = '';
    (board ? board.entries : []).forEach(function(e) { if (e.name === d.name) st = e.status; });
    var label = st === 'new' ? '新規' : (st === 'changed' ? '変更' : (st === 'same' ? '変更なし' : ''));
    // 開いていない図・テンプレはその旨を出す。既定から外れる理由が見えないと
    // 「勝手に減った」と同じになる。
    var where = d.open === false ? '未オープン' : '';
    var role = d.role === 'template' ? 'テンプレ' : '';
    html += '<label class="dp-item" data-open="' + (d.open === false ? '0' : '1')
      + '" data-role="' + esc(d.role || 'unset')
      + '" style="display:block;font-size:11px;color:var(--text-primary);padding:1px 2px;">'
      + '<input type="checkbox" class="dp-pick" data-name="' + esc(d.name) + '"' + (on ? ' checked' : '') + '> '
      + esc(d.name)
      + '<span style="color:var(--text-secondary);"> ' + esc(String(d.diagramType || '').replace('plantuml-', ''))
      + (label ? ' ・ ' + esc(label) : '')
      + (where ? ' ・ ' + esc(where) : '')
      + (role ? ' ・ ' + esc(role) : '') + '</span></label>';
  });
  html += '</div>';

  html += '<div id="dp-summary" style="margin-top:12px;font-size:11px;color:var(--text-primary);'
    + 'border:1px solid var(--border);border-radius:3px;padding:8px;">'
    + '<div id="dp-submit-line">提出前チェック: ' + esc(sub.line) + '</div>'
    + '<div id="dp-change-line">前回提出からの差分: ' + esc(change.line) + '</div>'
    + '</div>';

  html += '<div id="dp-status" style="margin-top:8px;font-size:11px;color:var(--text-secondary);"></div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px;">'
    + '<button id="dp-review" style="flex:2;' + BTN + 'padding:8px;">\u{1F50D} 変更前後を見比べる</button>'
    + '<button id="dp-build" style="flex:2;' + BTN + 'padding:8px;">\u{1F4E6} この内容で zip を作る</button>'
    + '<button id="dp-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';

  content.innerHTML = html;

  ['dp-title', 'dp-revision'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() { _dpMetaTouched = true; });
  });

  var closeBtn = document.getElementById('dp-close');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    var m = document.getElementById('dp-modal');
    if (m) m.style.display = 'none';
  });
  var picks = content.querySelectorAll('.dp-pick');
  Array.prototype.forEach.call(picks, function(cb) {
    cb.addEventListener('change', function() {
      var names = [];
      Array.prototype.forEach.call(content.querySelectorAll('.dp-pick'), function(x) {
        if (x.checked) names.push(x.getAttribute('data-name'));
      });
      _dpDocs = names;
      renderDeliveryPanel();
    });
  });
  var allBtn = document.getElementById('dp-all');
  if (allBtn) allBtn.addEventListener('click', function() {
    _dpDocs = all.map(function(d) { return d.name; });
    renderDeliveryPanel();
  });
  var noneBtn = document.getElementById('dp-none');
  if (noneBtn) noneBtn.addEventListener('click', function() { _dpDocs = []; renderDeliveryPanel(); });
  var changedBtn = document.getElementById('dp-changed');
  if (changedBtn) changedBtn.addEventListener('click', function() {
    var EL = window.MA.exportLog;
    if (!EL || !_elHas('delivery')) return;
    _dpDocs = EL.changedNames(_elLog, 'delivery', all);
    renderDeliveryPanel();
  });
  var buildBtn = document.getElementById('dp-build');
  if (buildBtn) buildBtn.addEventListener('click', function() { buildDeliveryPackage(); });
  var reviewBtn = document.getElementById('dp-review');
  if (reviewBtn) reviewBtn.addEventListener('click', function() { openDeliveryReview(null); });
  return { picked: picked, submit: sub, change: change };
}

function openDeliveryPanel() {
  var modal = document.getElementById('dp-modal');
  if (!modal || !window.MA.deliveryPackage) return null;
  // 開くたびに対象を今の図に取り直す (タブが増減した後で古い選択を引きずらない)。
  // 題と版数も、閉じたときの入力ではなく前回提出の控えから引き直す
  // (前回 1.0 で出したなら次は 1.1 が既定になる)。
  _dpDocs = null;
  _dpMetaTouched = false;
  // 見比べ用に描いた SVG も捨てる (前に開いたときの絵を今の puml として見せない)。
  _drCache = {};
  _drName = null;
  var content = document.getElementById('dp-modal-content');
  if (content) content.innerHTML = '';
  // 保存フォルダ全体が対象の的。読み終わったら _dpLoadFolder が描き直す。
  _dpLoadFolder();
  var model = renderDeliveryPanel();
  modal.style.display = 'flex';
  return model;
}

function buildDeliveryPackage() {
  var DP = window.MA.deliveryPackage;
  var BE = window.MA.bulkExport;
  if (!DP || !BE) return Promise.resolve(null);
  var docs = _dpSelectedDocs().map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
  var status = document.getElementById('dp-status');
  if (docs.length === 0) {
    if (status) status.textContent = '対象の図が 1 枚もありません。';
    return Promise.resolve(null);
  }
  var title = (document.getElementById('dp-title') || {}).value || '';
  var revision = (document.getElementById('dp-revision') || {}).value || '';
  var last = _dpLastDelivery();
  var submit = _dpSubmitResult(docs);
  var board = _dpBoard(docs);

  var svgs = {};
  function renderNext(i) {
    if (i >= docs.length) return Promise.resolve();
    if (status) status.textContent = '納品パッケージを作っています… ' + (i + 1) + ' / ' + docs.length;
    // 1 枚失敗しても残りは続ける。落ちた図は「書き出せませんでした」と書いて渡す。
    return Promise.resolve(renderDslToSvg(docs[i].dsl)).then(function(svg) {
      if (svg) svgs[docs[i].id] = svg;
    }, function() {}).then(function() { return renderNext(i + 1); });
  }

  return renderNext(0).then(function() {
    var pkg = DP.buildPackage({
      docs: docs, svgs: svgs, title: title, revision: revision,
      submit: submit, board: board, last: last,
    });
    var name = DP.packageName();
    downloadBlob(name, new Blob([BE.buildZip(DP.files(pkg))], { type: 'application/zip' }));
    // 出した時点を控える。次に作るときの「前回提出から」の基準になる。
    // localStorage (この端末の控え) と保存フォルダ (図に付いて回る控え) の両方に残す。
    DP.markDelivered(docs, { title: pkg.title, revision: pkg.revision });
    // 何枚のうち何枚を出したかを結果にも残す (zip を開くまで気づけない欠落を作らない)。
    var cov = DP.coverage(_dpCandidates(), _dpDocs);
    var msg = '納品パッケージを書き出しました（' + name + '） ' + cov.picked + ' / ' + cov.total + ' 枚 ・ ' + pkg.verdict
      + (cov.missing > 0 ? ' ／ ⚠ ' + cov.missing + ' 枚は対象外' : '');
    if (status) status.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    // 控えを保存フォルダにも残し、画面の納品履歴を今出した分まで進める
    // (書き出した直後に「まだ 1 度も提出していません」と出ていると控えを信用できない)。
    return _elRecord('delivery', { title: pkg.title, revision: pkg.revision, file: name, docs: docs })
      .then(function() {
        if (document.getElementById('dp-modal-content')) {
          renderDeliveryPanel();
          var st = document.getElementById('dp-status');
          if (st) st.textContent = msg;
        }
        return pkg;
      });
  });
}

// ── 提出前レビュー (変更前後を並べて出す) ─────────────────────────────────
// BLK-primary-20260908-1903-wish: 納品パッケージは「差分の行数」までしか言わず、
// 客の目に何が違って見えるかはタブを 1 枚ずつ切り替えて見比べるしかなかった。
// ここは前回提出時点の puml を描き直した SVG と今の SVG を、並べる / 重ねるで出す。
// 判断は src/core/delivery-review.js の職掌。ここは描画と DOM だけ。

var _drMode = 'side';   // 'side' | 'overlay'
var _drName = null;     // 今見比べている図の name
var _drCache = {};      // name -> { before: svg|null, after: svg|null }

function _drEntries() {
  var board = _dpBoard(_dpSelectedDocs());
  return board ? board.entries : [];
}

function _drDocByName(name) {
  var found = null;
  _dpSelectedDocs().forEach(function(d) { if (d.name === name) found = d; });
  return found;
}

// 前回提出時点の SVG と今の SVG を用意する。前回が無い図 (新規) は before が null。
function _drLoad(name) {
  var DP = window.MA.deliveryPackage;
  if (_drCache[name]) return Promise.resolve(_drCache[name]);
  var doc = _drDocByName(name);
  if (!doc || !DP) return Promise.resolve({ before: null, after: null });
  var base = _dpBaselineOf(name);
  var jobs = [
    Promise.resolve(renderDslToSvg(doc.dsl)).then(function(s) { return s; }, function() { return null; }),
    base ? Promise.resolve(renderDslToSvg(base.dsl)).then(function(s) { return s; }, function() { return null; })
         : Promise.resolve(null),
  ];
  return Promise.all(jobs).then(function(r) {
    _drCache[name] = { after: r[0], before: r[1] };
    return _drCache[name];
  });
}

function renderDeliveryReview(pair) {
  var DR = window.MA.deliveryReview;
  var content = document.getElementById('dr-modal-content');
  if (!DR || !content) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var entries = _drEntries();
  var rows = DR.plan(entries);
  var p = pair || { before: null, after: null };
  var d = DR.diff(p.before, p.after);

  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:3px 10px;font-size:11px;';
  var html = '<style>' + DR.overlayCss() + '</style>'
    + '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">\u{1F50D} 提出前レビュー（変更前後を並べる）</h3>'
    + '<div id="dr-headline" style="font-size:11px;color:var(--text-secondary);">' + esc(DR.headline(entries)) + '</div>';

  html += '<div id="dr-tabs" style="display:flex;flex-wrap:wrap;gap:4px;margin:10px 0;">';
  rows.forEach(function(r) {
    var on = r.name === _drName;
    var mark = r.status === 'changed' ? '変更' : (r.status === 'new' ? '新規' : '同じ');
    html += '<button type="button" class="dr-pick" data-name="' + esc(r.name) + '" style="' + BTN
      + (on ? 'outline:2px solid var(--accent);' : '') + '">' + esc(r.name)
      + ' <span style="color:var(--text-secondary);">' + esc(mark) + '</span></button>';
  });
  html += '</div>';

  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">'
    + '<button type="button" id="dr-mode" style="' + BTN + '">' + esc(DR.modeLabel(_drMode))
    + '（切り替え）</button>'
    + '<span id="dr-summary" style="font-size:11px;color:var(--text-primary);">' + esc(DR.summaryLine(d)) + '</span>'
    + '</div>';

  var before = p.before ? p.before : '';
  var after = p.after ? p.after : '<div style="font-size:11px;color:var(--text-secondary);">描けませんでした</div>';
  html += '<div id="dr-view" style="border:1px solid var(--border);border-radius:3px;padding:8px;background:var(--bg-primary);overflow:auto;max-height:52vh;">';
  if (_drMode === 'overlay') {
    html += '<div class="dr-stack">'
      + '<div class="dr-before">' + before + '</div>'
      + '<div class="dr-after">' + after + '</div></div>';
  } else {
    html += '<div class="dr-side">'
      + '<div><div style="font-size:10px;color:var(--accent);font-weight:bold;">前回提出</div>'
      + (before || '<div style="font-size:11px;color:var(--text-secondary);">前回提出には入っていません</div>') + '</div>'
      + '<div><div style="font-size:10px;color:var(--accent);font-weight:bold;">今回</div>' + after + '</div>'
      + '</div>';
  }
  html += '</div>';

  html += '<div id="dr-detail" style="margin-top:8px;font-size:11px;color:var(--text-primary);">';
  if (d.added.length) {
    html += '<div id="dr-added">増えた文字: ' + esc(d.added.join(' / ')) + '</div>';
  }
  if (d.removed.length) {
    html += '<div id="dr-removed">消えた文字: ' + esc(d.removed.join(' / ')) + '</div>';
  }
  d.shape.forEach(function(s) {
    html += '<div class="dr-shape">' + esc(s.label + ' の数 ' + s.was + ' → ' + s.now) + '</div>';
  });
  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-top:12px;">'
    + '<button type="button" id="dr-close" style="flex:1;' + BTN + 'padding:8px;">納品パッケージに戻る</button></div>';

  content.innerHTML = html;

  Array.prototype.forEach.call(content.querySelectorAll('.dr-pick'), function(b) {
    b.addEventListener('click', function() { openDeliveryReview(b.getAttribute('data-name')); });
  });
  var modeBtn = document.getElementById('dr-mode');
  if (modeBtn) modeBtn.addEventListener('click', function() {
    _drMode = window.MA.deliveryReview.toggleMode(_drMode);
    renderDeliveryReview(_drCache[_drName] || p);
  });
  var close = document.getElementById('dr-close');
  if (close) close.addEventListener('click', function() {
    var m = document.getElementById('dr-modal');
    if (m) m.style.display = 'none';
  });
  return d;
}

function openDeliveryReview(name) {
  var DR = window.MA.deliveryReview;
  var modal = document.getElementById('dr-modal');
  if (!DR || !modal) return Promise.resolve(null);
  var target = name || DR.firstOf(_drEntries());
  if (!target) return Promise.resolve(null);
  _drName = target;
  modal.style.display = 'flex';
  renderDeliveryReview(_drCache[target] || { before: null, after: null });
  var head = document.getElementById('dr-summary');
  if (head && !_drCache[target]) head.textContent = '描いています…';
  return _drLoad(target).then(function(pair) {
    // 描いている間に別の図に移っていたら、その図の表示を上書きしない。
    if (_drName !== target) return null;
    return renderDeliveryReview(pair);
  });
}

function setupDeliveryPackage() {
  var btn = document.getElementById('btn-tab-delivery');
  var modal = document.getElementById('dp-modal');
  if (!btn || !modal || !window.MA.deliveryPackage) return;
  btn.addEventListener('click', function() { openDeliveryPanel(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
  var review = document.getElementById('dr-modal');
  if (review) review.addEventListener('click', function(ev) {
    if (ev.target === review) review.style.display = 'none';
  });
}


// ── 系統マップ ────────────────────────────────────
// BLK-reviewer-20260908-0103-wish: spi_init_sequence → spi_state のような図と図の
// 対応関係は現場では固定なのに、GUI はそれをどこにも持っていなかった。
// 系統チェックは毎回名前の頭から推測し直し、語彙が重ならない組を黙って外す。
// ここでは対応関係を宣言として保存し、宣言された組は必ず突き合わせて、崩れていれば赤くする。

var DM_KEY = 'pua.driverMap';

function _dmLoad() {
  if (!window.MA.driverMap) return { version: 1, families: [] };
  try { return window.MA.driverMap.parse(window.localStorage.getItem(DM_KEY) || ''); }
  catch (e) { return window.MA.driverMap.parse(''); }
}

function _dmSave(decl) {
  try { window.localStorage.setItem(DM_KEY, window.MA.driverMap.serialize(decl)); }
  catch (e) { /* 次に開いたときに残らないだけ */ }
}

function _dmDocs() {
  return _renameDocs().map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
}

// タブ列のボタンに「崩れている系統の数」を出す。開かなくても崩れたことが分かる。
function syncDriverMapBadge() {
  var btn = document.getElementById('btn-tab-drivermap');
  if (!btn || !window.MA.driverMap || !window.MA.workspace) return;
  var decl = _dmLoad();
  if (!decl.families.length) {
    btn.textContent = '\uD83E\uDDE9 系統マップ −';
    btn.classList.remove('has-red');
    return;
  }
  var docs = window.MA.workspace.list().map(function(d) {
    return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
  });
  var r = window.MA.driverMap.check(decl, docs);
  btn.textContent = '\uD83E\uDDE9 系統マップ ' + (r.red ? r.red : '−');
  if (r.red > 0) btn.classList.add('has-red');
  else btn.classList.remove('has-red');
}

function _dmRender(result) {
  var content = document.getElementById('dm-modal-content');
  var DM = window.MA.driverMap;
  if (!content || !DM) return;
  var esc = window.MA.htmlUtils.escHtml;
  var html = '<h3 style="margin:0 0 6px;">\uD83E\uDDE9 系統マップ</h3>'
    + '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">'
    + 'どの図がどの図の相手かを宣言しておくと、その組だけを確かめれば済む。'
    + '宣言は次に開いたときも残る。</div>'
    + '<div id="dm-summary" style="margin-bottom:10px;font-weight:bold;'
    + (result.red ? 'color:var(--accent-red);' : '') + '">' + esc(DM.summaryLine(result)) + '</div>'
    + '<div style="margin-bottom:12px;">'
    + '<button id="dm-rebuild" class="btn-small">開いている図から宣言を作り直す</button> '
    + '<button id="dm-clear" class="btn-small">宣言を消す</button></div>'
    + '<div id="dm-families">';

  result.families.forEach(function(f) {
    html += '<div class="dm-family' + (f.status === 'red' ? ' red' : '') + '" data-key="' + esc(f.key) + '">'
      + '<div style="font-weight:bold;margin-bottom:4px;">' + esc(f.label)
      + ' <span class="dm-state" style="font-weight:normal;font-size:11px;color:'
      + (f.status === 'red' ? 'var(--accent-red)' : 'var(--text-secondary)') + ';">'
      + esc(f.status === 'red' ? f.reasons.join(' / ') : '対応どおりに揃っています') + '</span></div>';
    f.members.forEach(function(m) {
      html += '<span class="dm-member' + (m.present ? '' : ' missing') + '"'
        + (m.present ? ' data-doc="' + esc(m.name) + '"' : '')
        + ' title="' + esc(m.present ? '押すとこの図に移る' : '宣言されているが開かれていない') + '">'
        + esc(m.name) + (m.role ? ' <span style="color:var(--text-secondary);">' + esc(m.role) + '</span>' : '')
        + '</span>';
    });
    if (f.members.filter(function(m) { return m.present; }).length >= 2) {
      html += ' <button class="btn-small dm-pair" data-key="' + esc(f.key) + '">⇔ 相手を並べる</button>';
    }
    if (f.mismatch.length) {
      html += '<div class="dm-mismatch">';
      f.mismatch.forEach(function(m) {
        html += '<div class="dm-row" data-doc="' + esc(m.onlyIn) + '" data-line="' + (m.line || '') + '">'
          + esc(m.label) + ' — ' + esc(m.onlyIn) + ' にしか無い ('
          + esc(m.missingIn.join(' / ')) + ' に無し)</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  if (result.undeclared.length) {
    html += '<div id="dm-undeclared" style="font-size:12px;color:var(--text-secondary);margin-top:8px;">'
      + '宣言に入っていない図 (' + result.undeclared.length + ' 枚): '
      + esc(result.undeclared.join(', ')) + '</div>';
  }
  content.innerHTML = html;
}

// 宣言された相手を右に並べて開く。1 枚開けば対応する図が並ぶ、が wish の本体。
function openWithPartner(name, partnerName) {
  if (!window.MA.workspace) return false;
  var a = window.MA.workspace.findByName(name);
  var b = window.MA.workspace.findByName(partnerName);
  if (!a || !b) return false;
  switchToDoc(a.id);
  _compareRefId = b.id;
  _compareShownDsl = null;
  toggleCompareView(true);
  return true;
}

function _dmBind(decl, result) {
  var content = document.getElementById('dm-modal-content');
  var modal = document.getElementById('dm-modal');
  if (!content) return;

  var rebuild = document.getElementById('dm-rebuild');
  if (rebuild) rebuild.addEventListener('click', function() {
    _dmSave(window.MA.driverMap.suggest(_dmDocs(), decl));
    openDriverMap();
  });
  var clear = document.getElementById('dm-clear');
  if (clear) clear.addEventListener('click', function() {
    _dmSave({ version: 1, families: [] });
    openDriverMap();
  });

  Array.prototype.forEach.call(content.querySelectorAll('.dm-member[data-doc]'), function(el) {
    el.addEventListener('click', function() {
      var d = window.MA.workspace.findByName(el.getAttribute('data-doc'));
      if (modal) modal.style.display = 'none';
      if (d) switchToDoc(d.id);
    });
  });

  Array.prototype.forEach.call(content.querySelectorAll('.dm-pair'), function(btn) {
    btn.addEventListener('click', function() {
      var key = btn.getAttribute('data-key');
      var fam = null;
      result.families.forEach(function(f) { if (f.key === key) fam = f; });
      if (!fam) return;
      var present = fam.members.filter(function(m) { return m.present; });
      if (present.length < 2) return;
      if (modal) modal.style.display = 'none';
      openWithPartner(present[0].name, present[1].name);
    });
  });

  Array.prototype.forEach.call(content.querySelectorAll('.dm-row'), function(row) {
    row.addEventListener('click', function() {
      var d = window.MA.workspace.findByName(row.getAttribute('data-doc'));
      var line = parseInt(row.getAttribute('data-line'), 10);
      if (modal) modal.style.display = 'none';
      if (d) switchToDoc(d.id);
      if (!isNaN(line)) jumpToLine(line);
    });
  });
}

function openDriverMap() {
  var modal = document.getElementById('dm-modal');
  var DM = window.MA.driverMap;
  if (!modal || !DM) return null;
  var decl = _dmLoad();
  var result = DM.check(decl, _dmDocs());
  _dmRender(result);
  _dmBind(decl, result);
  modal.style.display = 'flex';
  syncDriverMapBadge();
  return result;
}

function setupDriverMap() {
  var btn = document.getElementById('btn-tab-drivermap');
  var modal = document.getElementById('dm-modal');
  if (!btn || !modal || !window.MA.driverMap) return;
  btn.addEventListener('click', function() { openDriverMap(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
  syncDriverMapBadge();
}

function setupFamilyAudit() {
  var btn = document.getElementById('btn-tab-family');
  var modal = document.getElementById('fa-modal');
  if (!btn || !modal || !window.MA.familyAudit) return;
  btn.addEventListener('click', function() { openFamilyAudit(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
}

// ── 提出前チェック ─────────────────────────────────────────────────────────
// BLK-primary-20260907-1403-wish: 顧客資料に組み込む前、14 枚のタイトル・注釈・
// 部品名を 1 枚ずつ開いて社内略語や日付入りの一時識別子が残っていないか読んでいた。
// 読む対象は決まっているので、全図から抜き出して 1 枚の表にし、辞書に当たった行だけ
// 赤くする。辞書はその場で書き換えられ、次に開いたときも残る。

var SC_DICT_KEY = 'pua.submitCheck.dict';

function _scLoadDict() {
  try {
    var raw = window.localStorage.getItem(SC_DICT_KEY);
    if (raw === null || raw === '') return window.MA.submitCheck.DEFAULT_TERMS.join('\n');
    return raw;
  } catch (e) { return window.MA.submitCheck.DEFAULT_TERMS.join('\n'); }
}

function _scSaveDict(text) {
  try { window.localStorage.setItem(SC_DICT_KEY, text); } catch (e) { /* 残らないだけ */ }
}

function openSubmitCheck() {
  var modal = document.getElementById('sc-modal');
  var content = document.getElementById('sc-modal-content');
  var SC = window.MA.submitCheck;
  if (!modal || !content || !SC) return null;
  var esc = window.MA.htmlUtils.escHtml;

  var docs = _renameDocs();
  var dictText = _scLoadDict();
  var result = SC.check(docs, SC.parseDict(dictText));

  var CELL = 'padding:3px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-primary);';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:3px 10px;font-size:11px;';

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">\u{1F4E4} 提出前チェック</h3>' +
    '<div id="sc-summary" style="font-size:11px;color:var(--text-secondary);" ' +
      'data-docs="' + result.docs.length + '" data-rows="' + result.rows.length + '" ' +
      'data-flagged="' + result.flagged.length + '">' + esc(SC.summaryLine(result)) + '</div>';

  html += '<div style="display:flex;gap:12px;margin-top:10px;align-items:flex-start;">' +
    '<div style="flex:1;min-width:0;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">' +
        '全図のタイトル・注釈・部品名</label>' +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:4px;">' +
        '<input type="checkbox" id="sc-only-flagged"' + (result.flagged.length ? ' checked' : '') + '> 要確認だけ表示</label>' +
      '<table id="sc-table" style="border-collapse:collapse;width:100%;">' +
        '<tr><th style="' + CELL + 'text-align:left;color:var(--text-secondary);">図</th>' +
        '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">種別</th>' +
        '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">文字列</th>' +
        '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">当たった語</th></tr>';

  if (result.rows.length === 0) {
    html += '<tr id="sc-empty"><td colspan="4" style="' + CELL + 'color:var(--text-secondary);">' +
      '読む対象の行がありません</td></tr>';
  }
  result.rows.forEach(function(r) {
    var red = r.flagged ? 'color:var(--accent-red);font-weight:bold;' : '';
    html += '<tr class="sc-row' + (r.flagged ? ' sc-flagged' : '') + '"' +
      ' data-doc="' + esc(r.doc) + '" data-line="' + r.line + '" data-kind="' + esc(r.kind) + '"' +
      ' style="cursor:pointer;">' +
      '<td style="' + CELL + 'color:var(--text-secondary);white-space:nowrap;">' + esc(r.doc) + '</td>' +
      '<td style="' + CELL + 'color:var(--text-secondary);white-space:nowrap;">' + esc(SC.kindLabel(r.kind)) + ' L' + r.line + '</td>' +
      '<td style="' + CELL + 'font-family:var(--font-mono);' + red + '">' + esc(r.text) + '</td>' +
      '<td style="' + CELL + red + '">' + esc(r.hits.join(', ')) + '</td>' +
      '</tr>';
  });
  html += '</table></div>';

  html += '<div style="width:200px;flex-shrink:0;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">' +
        '社内略語辞書 (1 行 1 語)</label>' +
      '<textarea id="sc-dict" style="width:100%;min-height:180px;font-family:var(--font-mono);font-size:11px;' +
        'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);' +
        'border-radius:3px;padding:4px;box-sizing:border-box;">' + esc(dictText) + '</textarea>' +
      '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
        '日付入りの識別子 (20260907 / 2026-09-07) は辞書に書かなくても当たります</div>' +
      '<button id="sc-recheck" style="' + BTN + 'width:100%;margin-top:6px;">辞書を保存して再チェック</button>' +
    '</div></div>';

  html += _glossaryHtml(docs, CELL, BTN);

  html += '<div style="display:flex;gap:8px;margin-top:12px;">' +
    '<button id="sc-close" style="' + BTN + 'flex:1;">閉じる</button></div>';

  content.innerHTML = html;
  modal.style.display = 'flex';
  _wireGlossary();

  var only = document.getElementById('sc-only-flagged');
  function applyFilter() {
    var onlyFlagged = only && only.checked;
    Array.prototype.forEach.call(content.querySelectorAll('.sc-row'), function(tr) {
      tr.hidden = !!(onlyFlagged && tr.className.indexOf('sc-flagged') === -1);
    });
  }
  if (only) only.addEventListener('change', applyFilter);
  applyFilter();

  // 行を押すとその図のタブへ移り、該当行を選ぶ。赤い行から直しに行ける。
  Array.prototype.forEach.call(content.querySelectorAll('.sc-row'), function(tr) {
    tr.addEventListener('click', function() {
      var name = tr.getAttribute('data-doc');
      var line = parseInt(tr.getAttribute('data-line'), 10);
      modal.style.display = 'none';
      if (window.MA.workspace) {
        var d = window.MA.workspace.findByName(name);
        if (d) switchToDoc(d.id);
      }
      if (!isNaN(line)) jumpToLine(line);
    });
  });

  document.getElementById('sc-recheck').addEventListener('click', function() {
    _scSaveDict(document.getElementById('sc-dict').value);
    openSubmitCheck();
  });
  document.getElementById('sc-close').addEventListener('click', function() {
    modal.style.display = 'none';
  });
  return result;
}

// ── 社内略語 → 正式名称の対応表 ────────────────────────────────────────────
// BLK-primary-20260913-0206-wish: 提出前チェックは「どの行に社内略語が残っているか」を
// 並べるところまでで、直すのは ⇄ 一括置換を略語ごとに開き直す作業だった
// (洗い出し → 個別適用 → SVG を 1 枚ずつ目視、の 3 工程)。同じ画面に
// 「略語 / 出現 / 正式名称」の表を置き、確定 1 回で全図に当て、当てた後の
// 残存件数を表で言い切る (目視の代わりになる 1 行を出す)。

function _glossaryRows(docs) {
  var G = window.MA.glossary;
  return G ? G.scan(docs) : [];
}

function _glossaryHtml(docs, CELL, BTN) {
  var G = window.MA.glossary;
  if (!G) return '';
  var esc = window.MA.htmlUtils.escHtml;
  var rows = _glossaryRows(docs);
  var html = '<div style="margin-top:14px;">' +
    '<label style="display:block;font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">' +
      '社内略語 → 顧客向け正式名称 (この表を確定すると全図に当たります)</label>' +
    '<div id="gl-verdict" role="status" data-remaining="" data-applied="0" ' +
      'style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">' +
      esc(rows.length ? rows.length + ' 件の社内略語が全図に残っています' : '社内略語は見つかりません') +
    '</div>';
  html += '<table id="gl-table" style="border-collapse:collapse;width:100%;">' +
    '<tr><th style="' + CELL + 'text-align:left;color:var(--text-secondary);">略語</th>' +
    '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">出現</th>' +
    '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">正式名称</th>' +
    '<th style="' + CELL + 'text-align:left;color:var(--text-secondary);">残存</th></tr>';
  if (rows.length === 0) {
    html += '<tr id="gl-empty"><td colspan="4" style="' + CELL + 'color:var(--text-secondary);">' +
      '社内略語は見つかりません</td></tr>';
  }
  rows.forEach(function(r) {
    html += '<tr class="gl-row" data-term="' + esc(r.term) + '">' +
      '<td style="' + CELL + 'font-family:var(--font-mono);white-space:nowrap;">' + esc(r.term) + '</td>' +
      '<td style="' + CELL + 'color:var(--text-secondary);white-space:nowrap;">' +
        r.count + ' 件 / ' + r.docs + ' 枚</td>' +
      '<td style="' + CELL + '"><input class="gl-to" data-to="' + esc(r.term) + '" value="' + esc(r.suggestion) + '"' +
        ' placeholder="正式名称を入れると当たります" autocomplete="off" spellcheck="false"' +
        ' style="width:100%;box-sizing:border-box;font-family:var(--font-mono);font-size:11px;' +
        'background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);' +
        'border-radius:3px;padding:2px 4px;"></td>' +
      '<td class="gl-left" data-left-of="' + esc(r.term) + '" style="' + CELL +
        'color:var(--text-secondary);white-space:nowrap;">' + r.count + ' 件</td>' +
      '</tr>';
  });
  html += '</table>';
  html += '<button id="gl-apply" style="' + BTN + 'width:100%;margin-top:6px;"' +
    (rows.length ? '' : ' disabled') +
    ' title="表の正式名称を全図に一度で当てます (取り消しは Ctrl+Z 1 回)">表を確定して全図に適用</button>';
  html += '</div>';
  return html;
}

function _glossaryEntries() {
  var out = [];
  Array.prototype.forEach.call(document.querySelectorAll('#gl-table .gl-to'), function(inp) {
    out.push({ term: inp.getAttribute('data-to'), to: inp.value });
  });
  return out;
}

function _wireGlossary() {
  var btn = document.getElementById('gl-apply');
  var G = window.MA.glossary;
  if (!btn || !G) return;
  btn.addEventListener('click', function() {
    var entries = _glossaryEntries();
    var res = renameGlossaryPairs(G.pairs(entries));

    // 当てたあとの本文で数え直す。表の数字が「今の図」を指していないと、
    // 残存 0 が目視の代わりにならない。
    var docs = _renameDocs();
    var terms = entries.map(function(e) { return e.term; });
    var left = G.remaining(docs, terms);
    var leftBy = {};
    left.forEach(function(x) { leftBy[x.term] = x.count; });
    Array.prototype.forEach.call(document.querySelectorAll('#gl-table .gl-left'), function(td) {
      var n = leftBy[td.getAttribute('data-left-of')] || 0;
      td.textContent = n + ' 件';
      td.style.color = n ? 'var(--accent-red)' : 'var(--text-secondary)';
    });

    var v = document.getElementById('gl-verdict');
    if (v) {
      var applied = (res && res.total) || 0;
      v.textContent = G.verdict({ remaining: left, unset: G.unset(entries) })
        + '（' + applied + ' 件 / ' + ((res && res.docs) || 0) + ' 枚に適用。取り消しは Ctrl+Z 1 回）';
      v.setAttribute('data-remaining', String(left.reduce(function(a, x) { return a + x.count; }, 0)));
      v.setAttribute('data-applied', String(applied));
    }
  });
}

function setupSubmitCheck() {
  var btn = document.getElementById('btn-tab-submit');
  var modal = document.getElementById('sc-modal');
  if (!btn || !modal || !window.MA.submitCheck) return;
  btn.addEventListener('click', function() { openSubmitCheck(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
}

function setupNameAudit() {
  var btn = document.getElementById('btn-tab-audit');
  var modal = document.getElementById('na-modal');
  if (!btn || !modal || !window.MA.nameAudit) return;
  btn.addEventListener('click', function() { openNameAudit(); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) modal.style.display = 'none';
  });
}

function openFile() {
  document.getElementById('file-input').click();
}

function onFilePicked(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    window.MA.history.pushHistory();
    var text = ev.target.result;
    // 開いたファイルは新しいタブになる。今のタブの編集内容は残る。
    if (window.MA.workspace) {
      saveActiveDoc();
      var detected = window.MA.workspace.detectType(text);
      openExistingFile({
        name: window.MA.workspace.sanitizeName(file.name),
        dsl: text,
        diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
      });
      applyActiveDoc();
      return;
    }
    mmdText = text;
    suppressSync = true;
    editorEl.value = mmdText;
    suppressSync = false;
    updateLineNumbers();
    isFirstRender = true;
    scheduleRefresh();
  };
  reader.readAsText(file);
  e.target.value = '';
}

// BLK-primary-20260907-0823: 保存先ディレクトリを設定していても「保存」は
// ダウンロードしか起こさず、フォルダに .puml ができなかった。保存先を設定して
// いる間は、保存先へ書くのが「保存」である。判定は save-target が唯一の規約。
function saveFile() {
  var title = (currentParsed && currentParsed.meta && currentParsed.meta.title) || 'untitled';
  // 押した時点の編集内容を workspace のアクティブなドキュメントに書き戻してから
  // 保存する (打った直後に押しても最後の 1 文字が落ちない)。
  var doc = saveActiveDoc();
  var cfg = null;
  try { cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfg = null; }
  // 手で押した「保存」も、開いた元ファイルの錠に従う (BLK-junior-20260908-1803-wish)。
  // 「元のまま保つ」を選んだあとに保存を押して元が消えたら、選ばせた意味が無い。
  var SLm = window.MA.sourceLock;
  if (doc && SLm && cfg && cfg.backend === 'file') {
    // 手で押した保存は、本文が開いたときのまま (skip) でも元ファイルへ書いてよい
    // (利用者が自分で押している。decide は skip でも書き先に元の名前を返す)。
    var dm = SLm.decide(doc.id, doc.name, _openDocNames(), doc.dsl);
    if (dm.action === 'ask') { try { askSourceLock(doc); } catch (e) {} return; }
    if (dm.name !== doc.name) doc = { id: doc.id, name: dm.name, diagramType: doc.diagramType, dsl: doc.dsl };
  }
  var ST = window.MA.saveTarget;
  var target = ST ? ST.decide(cfg, doc, title) : { mode: 'download', name: title };

  if (target.mode === 'file') {
    // saveActiveDoc() が既に書き出しているが、ここでは結果を待って利用者に伝える。
    window.MA.workspace.saveToFile(doc, target.dir).then(function(ok) {
      setSaveStatus(ST.messageFor(target, ok));
      // 保存できた図にだけ、その場で突合を掛ける (BLK-reviewer-20260908-1503-wish)。
      if (ok) {
        runSaveCheck(doc && doc.name);
        // この保存で中身が別名の図と入れ替わっていないか (BLK-reviewer-20260912-2103-wish)
        runSaveSwapCheck(doc && doc.name, doc && doc.dsl);
      }
    });
    return;
  }

  downloadBlob(target.name + '.puml', new Blob([mmdText], { type: 'text/plain' }));
  if (ST) setSaveStatus(ST.messageFor(target, true));
  runSaveCheck(doc && doc.name);
  runSaveSwapCheck(doc && doc.name, doc && doc.dsl);
}

// ── 保存時チェック (BLK-reviewer-20260908-1503-wish) ────────────────────────
// 「保存」を押したその場で突合ボードと同じ突合を掛け、いま保存した図に新しく
// 生えた不一致を図の上に出す。判定は src/core/save-check.js。ここは結線だけ。

function _svckState() {
  var SC = window.MA.saveCheck;
  return SC ? SC.load(_reviewStore(), _wsFileDir()) : { seen: {} };
}

// 保存した図 1 枚について突合を掛け、警告を作る。控えは進めない (描画側で進める)。
function _svckEvaluate(docName) {
  var SC = window.MA.saveCheck, AB = window.MA.auditBoard;
  if (!SC || !AB || !docName) return null;
  var run = _atRunAudits();
  var findings = null;
  try { findings = _mfRows(); } catch (e) { findings = null; }
  // SVG 実体のずれは 📂 一覧が読んだ結果があるときだけ載る (保存で読みに行かない)。
  var board = AB.build({ audits: run.audits, svg: _abSvgScan, findings: findings });
  _abBoard = board;
  return SC.evaluate(board, { doc: docName, state: _svckState() });
}

function hideSaveCheck() {
  var el = document.getElementById('save-check-overlay');
  if (el) el.hidden = true;
}

function renderSaveCheck(res) {
  var SC = window.MA.saveCheck;
  var el = document.getElementById('save-check-overlay');
  if (!SC || !el) return;
  var esc = window.MA.htmlUtils.escHtml;
  var sum = document.getElementById('sck-summary');
  var list = document.getElementById('sck-list');
  if (!res) { el.hidden = true; return; }

  if (sum) sum.textContent = SC.summaryLine(res);
  if (list) {
    var html = '';
    SC.lines(res).forEach(function(l) {
      html += '<li class="' + (l.isNew ? 'sck-new' : 'sck-old') + '">'
        + '<span class="sck-tag">' + (l.isNew ? '新規' : 'そのまま ' + l.ignored + ' 回')
        + '</span>' + esc(l.text) + '</li>';
    });
    list.innerHTML = html;
    list.hidden = !html;
  }
  // 指摘が無いときは帯を出さない (毎回の保存で図が隠れる方が邪魔になる)。
  // 指摘が無いときは帯を出さず、突合の結果はステータスバーの保存先の後ろに足す。
  // ここで setSaveStatus に置き換えると「どこに書いたか」が消える。
  if (!SC.shouldWarn(res)) { el.hidden = true; appendSaveStatus(SC.checkLine(res)); return; }
  el.hidden = false;
}

// 保存のたびに呼ぶ。突合が落ちても保存そのものは成立させる。
function runSaveCheck(docName) {
  var SC = window.MA.saveCheck;
  if (!SC) return null;
  var res = null;
  try { res = _svckEvaluate(docName); } catch (e) { res = null; }
  if (!res) { hideSaveCheck(); return null; }
  try { renderSaveCheck(res); } catch (e) { /* 表示できなくても控えは進める */ }
  try { SC.save(_reviewStore(), _wsFileDir(), SC.advance(_svckState(), res)); } catch (e) {}
  return res;
}

// ── 保存の入れ替わり検知 (BLK-reviewer-20260912-2103-wish) ──────────────────
// 「この保存で図の中身が別名の図と入れ替わっていないか」を保存のその場で言い、
// 保存操作そのものをファイル名込みで控える。判定は src/core/save-swap.js。
//
// 直前の中身は、この画面がその図を最後に保存したときのものを覚えておく
// (server 側の _versions/ は中身は残るが「どの操作で」が残らない)。
// BLK-reviewer-20260914-0906-wish: 一覧を読んだときのクロス判定の控え。
// 保存の直後に「この図の SVG は別の図の絵だ」とその場で言うために使う。
var _svgCrossLatest = null;

var _sswPrev = {};       // 図の名前 → この画面が最後に保存した中身
var _sswLogOpen = false;

function _sswFolderDocs() {
  // 保存フォルダを読んであれば、その一覧と突き合わせる。読んでいないときは
  // 開いているタブどうしで突き合わせる (何とも比べずに黙るより手掛かりになる)。
  if (_fiFileDocs && _fiFileDocs.length) return _fiFileDocs;
  return _diffDocs();
}

function hideSaveSwap() {
  var el = document.getElementById('save-swap-overlay');
  if (el) el.hidden = true;
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
  // 警告が無いときは帯を出さない。ただし記録を開いているなら出したままにする
  // (事故を追っている最中に、次の保存で画面が消えないようにする)。
  el.hidden = !(res && res.warn) && !_sswLogOpen && !_trGroups.length;
  renderSaveSwapLog();
}

// ── 一致した組の一覧と 1 操作の復元 (BLK-primary-20260912-2206-wish) ────────
// save-swap は「いま保存した 1 枚」の相手しか言わない。3 枚が同時に雛形へ落ちた
// primary の事故では、保存した 1 枚を直しても残りが黙って壊れたままになる。
// ここはフォルダ全体の一致した組を並べ、保存した図には「戻す」を 1 つ出す。
// 判定は src/core/twin-restore.js。ここは結線だけ。

var _trGroups = [];      // フォルダ全体で中身が一致した組
var _trPick = null;      // 保存した図の戻し先 { stamp, label, lines }
var _trName = '';        // 戻す対象の図の名前

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
function _trLoadPick(name, dsl) {
  var TR = window.MA.twinRestore, VH = window.MA.versionHistory;
  _trPick = null;
  _trName = String(name == null ? '' : name);
  if (!TR || !VH || !_trName) return Promise.resolve(null);
  var url = '/autosave-versions?dir=' + encodeURIComponent(_wsFileDir())
    + '&type=' + encodeURIComponent(_trName);
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
  var url = '/autosave-versions?dir=' + encodeURIComponent(_wsFileDir())
    + '&type=' + encodeURIComponent(_trName) + '&stamp=' + encodeURIComponent(_trPick.stamp);
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
function runSaveSwapCheck(docName, dsl) {
  var SS = window.MA.saveSwap;
  if (!SS || !docName) return null;
  var prev = _sswPrev[docName] || null;
  _sswPrev[docName] = String(dsl == null ? '' : dsl);

  function evaluate() {
    var res = null;
    var docs = _sswFolderDocs();
    try {
      res = SS.inspect({ name: docName, dsl: dsl, prev: prev, folderDocs: docs });
    } catch (e) { res = null; }
    // フォルダ全体の一致した組は、保存した図が入っていなくても挙げる
    // (3 枚目に気付けるのはここだけ)。判定が落ちても保存は成立させる。
    try {
      var TR = window.MA.twinRestore;
      _trGroups = TR ? TR.groups(docs.concat([{ name: docName, dsl: dsl }])) : [];
    } catch (e) { _trGroups = []; }
    if (!res) { hideSaveSwap(); return null; }
    // 巻き込まれた図にだけ「戻す」を出す。版の一覧は読めてから帯に足す。
    if (_trGroups.length && window.MA.twinRestore
        && window.MA.twinRestore.groupFor(_trGroups, docName)) {
      _trLoadPick(docName, dsl).then(function() {
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
    // BLK-reviewer-20260914-0906-wish: 出力先がクロスしていることに、保存した本人が
    // その場で気付けるようにする (reviewer の突合を待たない)。一覧を読んでいない
    // 間は控えが無いので何も言わない。
    try {
      var SX = window.MA.svgCross;
      var line = SX ? SX.saveLine(_svgCrossLatest, docName) : '';
      if (line) appendSaveStatus(line);
    } catch (e) {}
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

function setupSaveCheck() {
  // 帯は #preview-container の中にある。キャンバスのクリック (挿入ピッカー) へ
  // 抜けさせない。抜けると帯のボタンを押すたびに挿入ピッカーが開く。
  var el = document.getElementById('save-check-overlay');
  if (el) el.addEventListener('click', function(ev) { ev.stopPropagation(); });
  var close = document.getElementById('btn-sck-close');
  if (close) close.addEventListener('click', hideSaveCheck);
  var board = document.getElementById('btn-sck-board');
  if (board) board.addEventListener('click', function() { toggleAuditBoard(true); });
}

// 保存の結果をステータスバーに数秒だけ出す。押しても何も起きないように
// 見える状態を作らないための表示で、通常の自動保存表示は上書きしない。
var _saveStatusTimer = null;
function setSaveStatus(msg) {
  var el = document.getElementById('status-save-result');
  if (!el || !msg) return;
  el.textContent = msg;
  if (_saveStatusTimer) clearTimeout(_saveStatusTimer);
  _saveStatusTimer = setTimeout(function() { el.textContent = ''; }, 6000);
}

// 保存の直後に出した「どこに書いたか」の後ろへ、突合の結果を足す。
// 保存先の文言は保存が成立したことの唯一の手掛かりなので、上書きしない。
function appendSaveStatus(msg) {
  var el = document.getElementById('status-save-result');
  if (!el || !msg) return;
  var cur = el.textContent || '';
  setSaveStatus(cur ? cur + ' ／ ' + msg : msg);
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportSVG() {
  var svgEl = previewSvgEl.querySelector('svg');
  if (!svgEl) return;
  var clone = svgEl.cloneNode(true);
  downloadBlob(((currentParsed.meta && currentParsed.meta.title) || 'untitled') + '.svg',
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  // 書き出した瞬間が「この周を完走した」区切り。ここで庫へロックする
  // (BLK-junior-20260908-2203-wish)。
  stashToVault('SVG');
}

// BLK-primary-20260907-0443: 図が増えるほど「タブ切替 → Export → SVG」の 3 クリックが
// 枚数分積み上がっていた。ここではタブを切り替えず、各ドキュメントの DSL を /render に
// 直接投げて保存するので、何枚でも Export を開く → この項目を押す の 2 クリックで済む。
// 保存はブラウザの複数ダウンロードを 1 件ずつ直列に走らせる。
function renderDslToSvg(dsl) {
  var mode = (document.getElementById('render-mode') || {}).value || 'local';
  return fetch('/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: dsl, mode: mode }),
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

// BLK-human-20260909-2200: アプリ版 (pywebview) にはブラウザのダウンロード先が無く、
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

function exportAllSVG(pickedDocs, statusEl) {
  if (!window.MA.bulkExport || !window.MA.workspace) return;
  // 編集中の内容が workspace に載っていないと 1 枚だけ古い DSL で書き出される。
  saveActiveDoc();
  var docs = Array.isArray(pickedDocs) ? pickedDocs : window.MA.workspace.list();
  var status = statusEl || document.getElementById('bulk-export-status');
  if (status) { status.style.display = 'block'; status.textContent = 'SVG を書き出しています…'; }
  var files = [];
  return window.MA.bulkExport.run(docs, {
    render: renderDslToSvg,
    save: function(filename, svg) { files.push({ name: filename, content: svg }); },
    onProgress: function(done, total) {
      if (status) status.textContent = 'SVG を書き出しています… ' + done + ' / ' + total;
    },
  }).then(function(summary) {
    var msg = summary.message;
    if (files.length > 0) {
      // 会議資料は「図 + どの指摘への対応か」で 1 組。指摘を 1 件でも結んでいれば
      // 対応表を同じ zip に入れる (BLK-primary-20260908-1703-wish)。
      var map = buildFindingMap();
      if (map && map.table && map.table.total > 0) {
        files.push({ name: '指摘対応表.md', content: map.text });
      }
      var name = window.MA.bulkExport.zipName();
      downloadBlob(name, new Blob([window.MA.bulkExport.buildZip(files)], { type: 'application/zip' }));
      msg = msg + '（' + name + '）';
      summary.zipFile = name;
    }
    if (status) status.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    // BLK-primary-20260909-0003-wish: 出した時点を保存フォルダに控える。
    // 次に書き出すときの「前回書き出しから変わった図」の基準になる。
    if (!summary.zipFile) return summary;
    return _elRecord('svg', { file: summary.zipFile, docs: docs }).then(function() {
      if (document.getElementById('expick-modal') &&
          document.getElementById('expick-modal').style.display === 'flex') {
        _expickList = _expickBuild();
        renderExportPick();
        if (status) status.textContent = msg;
      }
      return summary;
    });
  });
}

// ── 部品の図をまとめて資料化 (BLK-junior-20260908-1903-wish) ─────────────────
// 設計書には同じ部品の全図種を並べて貼る。1 枚ずつ「開き直す → Export → PNG」を
// 図種の数だけ繰り返していたので、枚数に比例して手数が伸びていた。保存フォルダの
// 名前から部品を割り出して全図種を集め、図番号・図名を振った PNG セットと図一覧を
// 1 つの zip で出す。図を開き直す必要も、図番号を手で振り直す必要も無くなる。

function _cpackEsc(s) { return window.MA.htmlUtils.escHtml(String(s == null ? '' : s)); }

var _cpackGroups = [];
var _cpackPick = '';

// SVG 文字列を PNG の Blob にする。画面の SVG ではなく描画結果を直接使うので、
// タブを切り替えずに何枚でも書き出せる。
function svgTextToPngBlob(svgText, transparent) {
  return new Promise(function(resolve, reject) {
    var m = /<svg[^>]*\bwidth="([\d.]+)/.exec(svgText);
    var m2 = /<svg[^>]*\bheight="([\d.]+)/.exec(svgText);
    var w = m ? parseFloat(m[1]) : 800;
    var h = m2 ? parseFloat(m2[1]) : 400;
    if (!(w > 0)) w = 800;
    if (!(h > 0)) h = 400;
    var img = new Image();
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(w);
        canvas.height = Math.ceil(h);
        var ctx = canvas.getContext('2d');
        if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          if (blob) resolve(blob); else reject(new Error('PNG 変換に失敗しました'));
        });
      } catch (e) { reject(e); }
    };
    img.onerror = function() { reject(new Error('SVG 読み込みエラー')); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  });
}

function _cpackRenderList() {
  var body = document.getElementById('cpack-body');
  var count = document.getElementById('cpack-count');
  var run = document.getElementById('cpack-run');
  if (!body) return;
  if (!_cpackGroups.length) {
    body.innerHTML = '<div class="cpack-empty">保存フォルダに .puml がありません。図を保存してから開いてください。</div>';
    if (count) count.textContent = '';
    if (run) run.disabled = true;
    _cpackPreview();
    return;
  }
  if (count) count.textContent = _cpackGroups.length + ' 部品';
  var html = '';
  for (var i = 0; i < _cpackGroups.length; i++) {
    var g = _cpackGroups[i];
    var checked = g.component === _cpackPick ? ' checked' : '';
    html += '<label class="cpack-row"><input type="radio" name="cpack-pick" class="cpack-radio" value="'
      + _cpackEsc(g.component) + '"' + checked + '><span class="cpack-name">' + _cpackEsc(g.component) + '</span>'
      + '<span class="cpack-count">' + g.files.length + ' 枚</span></label>';
  }
  body.innerHTML = html;
  var radios = body.querySelectorAll('.cpack-radio');
  for (var r = 0; r < radios.length; r++) {
    radios[r].addEventListener('change', function() {
      _cpackPick = this.value;
      if (run) run.disabled = false;
      _cpackPreview();
    });
  }
  if (run) run.disabled = !_cpackPick;
  _cpackPreview();
}

function _cpackGroupOf(name) {
  for (var i = 0; i < _cpackGroups.length; i++) if (_cpackGroups[i].component === name) return _cpackGroups[i];
  return null;
}

// 押す前に「図1 が何になるか」を見せる。設計書に貼ってから番号がずれると
// 貼り直しになるので、番号の並びは書き出し前に確かめられる必要がある。
function _cpackPreview() {
  var el = document.getElementById('cpack-preview');
  if (!el) return;
  var CP = window.MA.componentPack;
  var g = _cpackGroupOf(_cpackPick);
  if (!CP || !g) { el.innerHTML = '部品を選ぶと、振られる図番号がここに出ます。'; return; }
  var items = CP.planPack(g.component, g.files);
  var html = '';
  for (var i = 0; i < items.length; i++) html += '<div class="cpack-fig">' + _cpackEsc(items[i].title) + '</div>';
  el.innerHTML = html || '書き出せる図がありません。';
}

function openComponentPack() {
  var modal = document.getElementById('cpack-modal');
  var CP = window.MA.componentPack;
  if (!modal || !CP || !window.MA.workspace) return Promise.resolve();
  var state = document.getElementById('cpack-state');
  if (state) state.textContent = '';
  _cpackGroups = [];
  _cpackPick = '';
  _cpackRenderList();
  modal.style.display = 'flex';
  return window.MA.workspace.listFiles(_wsFileDir()).then(function(list) {
    _cpackGroups = CP.groupByComponent(list || []);
    if (_cpackGroups.length === 1) _cpackPick = _cpackGroups[0].component;
    _cpackRenderList();
  });
}

function closeComponentPack() {
  var modal = document.getElementById('cpack-modal');
  if (modal) modal.style.display = 'none';
}

// 選んだ部品の図を 1 枚ずつ読み → 描画 → PNG にして、図一覧と一緒に zip で保存する。
// 1 枚失敗しても残りは続ける (1 枚のエラーで資料が丸ごと出ないほうが困る)。
function runComponentPack() {
  var CP = window.MA.componentPack;
  var g = _cpackGroupOf(_cpackPick);
  var state = document.getElementById('cpack-state');
  var run = document.getElementById('cpack-run');
  if (!CP || !g) return Promise.resolve(null);
  var items = CP.planPack(g.component, g.files);
  if (run) run.disabled = true;
  if (state) state.textContent = 'PNG を書き出しています… 0 / ' + items.length;

  var dir = _wsFileDir();
  var files = [];
  var results = [];

  function step(i) {
    if (i >= items.length) return Promise.resolve();
    var it = items[i];
    return Promise.resolve(window.MA.workspace.loadFile(it.source, dir))
      .then(function(dsl) {
        if (!dsl || String(dsl).trim() === '') throw new Error('中身が空です');
        return renderDslToSvg(dsl);
      })
      .then(function(svg) { return svgTextToPngBlob(svg, true); })
      .then(function(blob) { return blob.arrayBuffer(); })
      .then(function(buf) {
        files.push({ name: it.filename, content: new Uint8Array(buf) });
        results.push({ filename: it.filename, ok: true, error: null });
      })
      .catch(function(e) {
        results.push({ filename: it.filename, ok: false, error: String(e && e.message ? e.message : e) });
      })
      .then(function() {
        if (state) state.textContent = 'PNG を書き出しています… ' + results.length + ' / ' + items.length;
        return step(i + 1);
      });
  }

  return step(0).then(function() {
    var summary = CP.summarize(g.component, results);
    summary.items = items;
    if (files.length > 0) {
      files.push({ name: '図一覧.md', content: CP.indexText(g.component, items) });
      var zipName = CP.packName(g.component);
      downloadBlob(zipName, new Blob([window.MA.bulkExport.buildZip(files)], { type: 'application/zip' }));
      summary.message = summary.message + '（' + zipName + '）';
      summary.zipName = zipName;
    }
    if (state) state.textContent = summary.message;
    if (window.MA.toast) window.MA.toast.show(summary.message);
    if (run) run.disabled = false;
    return summary;
  });
}

function setupComponentPack() {
  var open = document.getElementById('exp-png-pack');
  if (open) open.addEventListener('click', function() {
    var menu = document.getElementById('export-menu');
    if (menu) menu.classList.remove('open');
    openComponentPack();
  });
  var modalEl = document.getElementById('cpack-modal');
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modalEl && modalEl.style.display === 'flex') closeComponentPack();
  });
  var close = document.getElementById('cpack-close');
  if (close) close.addEventListener('click', closeComponentPack);
  var run = document.getElementById('cpack-run');
  if (run) run.addEventListener('click', function() { runComponentPack(); });
  var modal = document.getElementById('cpack-modal');
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeComponentPack(); });
}

// ── 1 枚を資料化 (BLK-junior-20260908-2303-wish) ─────────────────────────────
// 設計書に貼る資料を作る場面は「題名に (資料用) を付けて保存」「図種に合わせた形式で
// Export」「保存先確認」「一覧から開き直す」の 4 操作に分かれ、しかも形式 (状態遷移図
// = SVG、他 = PNG 透過) は利用者が覚えて選んでいた。覚え違いは実際に手戻りになっている。
// 形式は図種で一意に決まるので materialExport が持ち、画面で選ぶのは部品と図種だけ。
// 押すと 元の図を読む → 題名に (資料用) → 決まった形式で書き出す → 保存フォルダに
// 保存 → 提出物庫へ控える → 一覧を描き直す、までが 1 回で終わる。

var _mexpFiles = [];

function _mexpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
  });
}

function _mexpSel(id) { return document.getElementById(id); }

function _mexpPlan() {
  var ME = window.MA.materialExport;
  var comp = _mexpSel('mexp-component');
  var kind = _mexpSel('mexp-kind');
  if (!ME || !comp || !kind) return null;
  return ME.plan(_mexpFiles, comp.value, kind.value);
}

// 図種の選択肢は部品によって変わる。形式は選択肢そのものに出す
// (プルダウンを開いた時点で「状態遷移図 → SVG」と読めるようにする)。
function _mexpRenderKinds() {
  var ME = window.MA.materialExport;
  var comp = _mexpSel('mexp-component');
  var kindSel = _mexpSel('mexp-kind');
  if (!ME || !comp || !kindSel) return;
  var want = kindSel.value;
  var rows = ME.kindsFor(_mexpFiles, comp.value);
  var html = '';
  for (var i = 0; i < rows.length; i++) {
    html += '<option value="' + _mexpEsc(rows[i].kind) + '">'
      + _mexpEsc(rows[i].kind) + '（' + _mexpEsc(rows[i].formatLabel) + '）</option>';
  }
  kindSel.innerHTML = html;
  for (var j = 0; j < rows.length; j++) if (rows[j].kind === want) kindSel.value = want;
  _mexpRenderPlan();
}

function _mexpRenderPlan() {
  var ME = window.MA.materialExport;
  var el = _mexpSel('mexp-plan');
  var run = _mexpSel('mexp-run');
  if (!ME) return;
  var p = _mexpPlan();
  if (el) el.textContent = ME.planText(p);
  if (run) run.disabled = !p;
}

function _mexpRenderComponents() {
  var ME = window.MA.materialExport;
  var comp = _mexpSel('mexp-component');
  var count = _mexpSel('mexp-count');
  if (!ME || !comp) return;
  var list = ME.components(_mexpFiles);
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += '<option value="' + _mexpEsc(list[i].component) + '">' + _mexpEsc(list[i].component) + '</option>';
  }
  comp.innerHTML = html;
  if (count) count.textContent = list.length ? (list.length + ' 部品') : '';
  var empty = ME.emptyText(_mexpFiles);
  if (empty) {
    var el = _mexpSel('mexp-plan');
    if (el) el.textContent = empty;
    var run = _mexpSel('mexp-run');
    if (run) run.disabled = true;
    return;
  }
  _mexpRenderKinds();
}

function openMaterialExport() {
  var modal = document.getElementById('mexp-modal');
  if (!modal || !window.MA.materialExport || !window.MA.workspace) return Promise.resolve();
  var state = _mexpSel('mexp-state');
  if (state) state.textContent = '';
  _mexpFiles = [];
  _mexpRenderComponents();
  modal.style.display = 'flex';
  return window.MA.workspace.listFiles(_wsFileDir()).then(function(list) {
    _mexpFiles = list || [];
    _mexpRenderComponents();
  });
}

function closeMaterialExport() {
  var modal = document.getElementById('mexp-modal');
  if (modal) modal.style.display = 'none';
}

// 押したら全部やる。途中で失敗したら何が失敗したかを言い、
// 半端に (資料用) の名前だけが保存フォルダに残らないよう、書き出せてから保存する。
// runMaterialPlan(p, opts) — 1 件の計画を最後まで流す。1 枚の資料化と、
// 資料一式ボードのまとめ資料化が同じ道を通るようにここに切り出す
// (2 通りの手順を持つと、まとめて出したときだけ庫に入らない、が起きる)。
// opts.open=false のときはタブを開き直さない (まとめて流すときに図種の数だけ
// タブが開くと、終わったあとの画面が資料の最後の 1 枚で埋まる)。
function runMaterialPlan(p, opts) {
  var ME = window.MA.materialExport;
  var WS = window.MA.workspace;
  if (!ME || !WS || !p) return Promise.resolve(null);
  var o = opts || {};
  var openTab = o.open !== false;
  var dir = _wsFileDir();
  var dsl = '';
  return Promise.resolve(WS.loadFile(p.source, dir))
    .then(function(text) {
      if (!text || String(text).trim() === '') throw new Error('元の図が空です');
      dsl = ME.applyTitle(text, p.title);
      return renderDslToSvg(dsl);
    })
    .then(function(svg) {
      if (p.format === 'svg') return new Blob([svg], { type: 'image/svg+xml' });
      return svgTextToPngBlob(svg, true);
    })
    .then(function(blob) {
      downloadBlob(p.filename, blob);
      return WS.saveToFile({ name: p.docName, dsl: dsl }, dir);
    })
    .then(function() {
      if (openTab) {
        saveActiveDoc();
        var detected = WS.detectType(dsl);
        openExistingFile({
          name: p.docName,
          dsl: dsl,
          diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
        });
        applyActiveDoc();
      }
      return stashToVault(p.formatLabel);
    })
    .then(function() { return p; });
}

function runMaterialExport() {
  var ME = window.MA.materialExport;
  var WS = window.MA.workspace;
  var p = _mexpPlan();
  var state = _mexpSel('mexp-state');
  var run = _mexpSel('mexp-run');
  if (!ME || !WS || !p) return Promise.resolve(null);
  var dir = _wsFileDir();
  if (run) run.disabled = true;
  if (state) state.textContent = p.source + ' を ' + p.formatLabel + ' で資料化しています…';

  var dsl = '';
  return Promise.resolve(WS.loadFile(p.source, dir))
    .then(function(text) {
      if (!text || String(text).trim() === '') throw new Error('元の図が空です');
      dsl = ME.applyTitle(text, p.title);
      return renderDslToSvg(dsl);
    })
    .then(function(svg) {
      if (p.format === 'svg') {
        return new Blob([svg], { type: 'image/svg+xml' });
      }
      return svgTextToPngBlob(svg, true);
    })
    .then(function(blob) {
      downloadBlob(p.filename, blob);
      // 資料用の版を保存フォルダにも残す (次の周に開き直せないと資料を作り直しになる)。
      return WS.saveToFile({ name: p.docName, dsl: dsl }, dir);
    })
    .then(function() {
      // 開いているタブを資料用の版に切り替える。一覧から開き直す手順がここで済む。
      saveActiveDoc();
      var detected = WS.detectType(dsl);
      openExistingFile({
        name: p.docName,
        dsl: dsl,
        diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
      });
      applyActiveDoc();
      // 書き出した瞬間が周の区切り。Export と同じく庫へ控える。
      return stashToVault(p.formatLabel);
    })
    .then(function() {
      var msg = ME.doneMessage(p);
      if (state) state.textContent = msg;
      if (window.MA.toast) window.MA.toast.show(msg);
      if (run) run.disabled = false;
      try { refreshFolderPanelNow(); } catch (e) {}
      closeMaterialExport();
      return p;
    })
    .catch(function(e) {
      var msg = ME.failMessage(p, e);
      if (state) state.textContent = msg;
      if (window.MA.toast) window.MA.toast.show(msg);
      if (run) run.disabled = false;
      return null;
    });
}

function setupMaterialExport() {
  var open = document.getElementById('exp-material');
  if (open) open.addEventListener('click', function() {
    var menu = document.getElementById('export-menu');
    if (menu) menu.classList.remove('open');
    openMaterialExport();
  });
  var modal = document.getElementById('mexp-modal');
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal && modal.style.display === 'flex') closeMaterialExport();
  });
  var close = document.getElementById('mexp-close');
  if (close) close.addEventListener('click', closeMaterialExport);
  var run = document.getElementById('mexp-run');
  if (run) run.addEventListener('click', function() { runMaterialExport(); });
  var comp = document.getElementById('mexp-component');
  if (comp) comp.addEventListener('change', _mexpRenderKinds);
  var kind = document.getElementById('mexp-kind');
  if (kind) kind.addEventListener('change', _mexpRenderPlan);
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeMaterialExport(); });
}

// ── 要求ID対応 (BLK-junior-20260909-0103-wish) ──────────────────────────────
// 設計書に貼る資料では、クラス・メソッドの横に対応する ASPICE 要求 ID を書く。
// 今まで GUI にはそれを書く場所も見る場所も無く、図を作ったあとで別文書に対応表を
// 手で作り直していた (図と表の二重管理。名前を直すと表だけが古くなる)。
// 図の要素を一覧にして要求 ID を付けられるようにし、Export のときに対応表 (CSV) と
// 画像の脚注を同時に確定させる。対応そのものは DSL の注記行として図に残る。

function _reqSel(id) { return document.getElementById(id); }

function _reqDocName() {
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  return (doc && doc.name) ? doc.name : '図';
}

// DSL を書き換えて画面に戻す。編集中の内容が正本なので mmdText を通す。
function _reqSetDsl(next) {
  if (next === mmdText) return;
  if (window.MA.history) window.MA.history.pushHistory();
  mmdText = next;
  suppressSync = true;
  if (editorEl) editorEl.value = mmdText;
  suppressSync = false;
  scheduleRefresh();
  saveActiveDoc();
}

function _reqRenderRows() {
  var RT = window.MA.reqTrace;
  var body = _reqSel('req-rows');
  var sum = _reqSel('req-summary');
  var exp = _reqSel('req-export');
  if (!RT || !body) return;
  var rows = RT.rows(mmdText);
  var html = '';
  rows.forEach(function(r) {
    html += '<tr class="req-row" data-key="' + _mexpEsc(r.key) + '" data-kind="' + _mexpEsc(r.kind)
      + '" data-status="' + _mexpEsc(r.status) + '">'
      + '<td class="req-kind">' + _mexpEsc(r.kindLabel) + '</td>'
      + '<td class="req-element">' + _mexpEsc((r.owner ? r.owner + '.' : '') + r.label) + '</td>'
      + '<td><input type="text" class="req-ids" data-key="' + _mexpEsc(r.key)
      + '" value="' + _mexpEsc(r.ids.join(', ')) + '"></td>'
      + '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="3">要求 ID を付けられる要素がありません。</td></tr>';
  if (sum) sum.textContent = RT.summary(rows);
  if (exp) exp.disabled = RT.assignedRows(rows).length === 0;

  // 入力は離れた時点で図に書き戻す (打つたびに履歴が積もらない)。
  var inputs = body.querySelectorAll('input.req-ids');
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener('change', function(ev) {
      _reqApplyInput(ev.target);
    });
  }
}

function _reqApplyInput(input) {
  var RT = window.MA.reqTrace;
  var state = _reqSel('req-state');
  if (!RT || !input) return;
  var key = input.getAttribute('data-key');
  var bad = RT.invalidIds(input.value);
  _reqSetDsl(RT.setIds(mmdText, key, input.value));
  // 脚注を出しているときは、付け替えがそのまま脚注に映る (出し直さなくてよい)。
  if (_reqSel('req-footnote') && _reqSel('req-footnote').checked) _reqApplyFootnote(true);
  _reqRenderRows();
  if (state) {
    state.textContent = bad.length
      ? '要求 ID として読めない語は入れていません：' + bad.join('、')
      : (key + ' の要求 ID を図に書き込みました');
  }
}

// 脚注 (legend) の出し入れ。図そのものに入るので、書き出した画像がそのまま
// 対応表を持つ (画像だけを設計書に貼っても対応が伝わる)。
function _reqApplyFootnote(on) {
  var RT = window.MA.reqTrace;
  if (!RT) return;
  var base = RT.stripFootnote(mmdText);
  _reqSetDsl(on ? RT.applyFootnote(base, RT.rows(base)) : base);
}

function openReqTrace() {
  var modal = _reqSel('req-modal');
  var RT = window.MA.reqTrace;
  if (!modal || !RT) return;
  var title = _reqSel('req-title');
  var state = _reqSel('req-state');
  var foot = _reqSel('req-footnote');
  if (title) title.textContent = _reqDocName();
  if (state) state.textContent = '';
  if (foot) foot.checked = RT.stripFootnote(mmdText) !== mmdText;
  modal.style.display = 'flex';
  _reqRenderRows();
}

function closeReqTrace() {
  var modal = _reqSel('req-modal');
  if (modal) modal.style.display = 'none';
}

// 対応表を書き出す。画像と並べて設計書に貼るので、名前は画像と揃える。
function runReqExport() {
  var RT = window.MA.reqTrace;
  var state = _reqSel('req-state');
  if (!RT) return null;
  var name = _reqDocName();
  var plan = RT.plan(mmdText, name);
  // Excel が既定の文字コードで開けるように BOM を付ける (対応表は Excel で読む)。
  var blob = new Blob(['﻿' + RT.tableCsv(plan.rows, plan.title)],
    { type: 'text/csv;charset=utf-8' });
  downloadBlob(plan.filename, blob);
  var msg = RT.doneMessage(plan);
  if (state) state.textContent = msg;
  if (window.MA.toast) window.MA.toast.show(msg);
  return plan;
}

function setupReqTrace() {
  var open = document.getElementById('exp-req-trace');
  if (open) open.addEventListener('click', function() {
    var menu = document.getElementById('export-menu');
    if (menu) menu.classList.remove('open');
    openReqTrace();
  });
  var modal = document.getElementById('req-modal');
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal && modal.style.display === 'flex') closeReqTrace();
  });
  var close = document.getElementById('req-close');
  if (close) close.addEventListener('click', closeReqTrace);
  var exp = document.getElementById('req-export');
  if (exp) exp.addEventListener('click', function() { runReqExport(); });
  var foot = document.getElementById('req-footnote');
  if (foot) foot.addEventListener('change', function(ev) {
    _reqApplyFootnote(ev.target.checked);
    var state = _reqSel('req-state');
    if (state) state.textContent = ev.target.checked
      ? '書き出す画像の下に要求ID対応の脚注が入ります'
      : '脚注を外しました';
  });
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeReqTrace(); });
}

// ── 部品の資料一式 (BLK-junior-20260909-0003-wish) ───────────────────────────
// 設計書に貼る資料は 1 部品の複数図種で 1 組なのに、資料化は 1 枚ずつしかできず、
// 「どの図種の資料用がまだ無いか」「元の図が資料用より新しくないか」は保存フォルダの
// 名前と日時を人が読み比べるしかなかった。開いてから初めて気付くので、手順 1 で
// 前周の成果物を探すところから毎回やり直しになっていた。
// 部品を選べば図種が全部並び、状態が色分けで読め、手当ての要る図種だけを
// まとめて 1 回で書き出せるようにする。状態の決めかたは materialBoard が持つ。

var _mboardEntries = [];
var _mboardPicked = {};   // kind -> true。部品を切り替えたら選び直す

function _mboardSel(id) { return document.getElementById(id); }

function _mboardRows() {
  var MB = window.MA.materialBoard;
  var comp = _mboardSel('mboard-component');
  if (!MB || !comp) return [];
  return MB.rows(_mboardEntries, comp.value);
}

function _mboardSelectedKinds() {
  return _mboardRows().filter(function(r) { return _mboardPicked[r.kind]; })
    .map(function(r) { return r.kind; });
}

function _mboardRenderRows() {
  var MB = window.MA.materialBoard;
  var body = _mboardSel('mboard-rows');
  var sum = _mboardSel('mboard-summary');
  var run = _mboardSel('mboard-run');
  if (!MB || !body) return;
  var rows = _mboardRows();
  var html = '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    html += '<tr class="mboard-row" data-kind="' + _mexpEsc(r.kind) + '" data-status="' + _mexpEsc(r.status) + '">'
      + '<td class="mboard-pick"><input type="checkbox" class="mboard-check" data-kind="' + _mexpEsc(r.kind) + '"'
      + (_mboardPicked[r.kind] ? ' checked' : '') + '></td>'
      + '<td class="mboard-kind">' + _mexpEsc(r.kind) + '</td>'
      + '<td class="mboard-status">' + _mexpEsc(r.statusLabel) + '</td>'
      + '<td class="mboard-format">' + _mexpEsc(r.formatLabel) + '</td>'
      + '<td class="mboard-note">' + _mexpEsc(MB.rowText(r)) + '</td>'
      + '</tr>';
  }
  body.innerHTML = html;
  if (sum) {
    var empty = MB.emptyText(_mboardEntries);
    sum.textContent = empty ? empty : MB.summaryText(rows);
  }
  var picked = _mboardSelectedKinds();
  if (run) {
    run.disabled = picked.length === 0;
    run.textContent = MB.runText(picked);
  }
  var checks = body.querySelectorAll('input.mboard-check');
  for (var c = 0; c < checks.length; c++) {
    checks[c].addEventListener('change', function(ev) {
      var k = ev.target.getAttribute('data-kind');
      if (ev.target.checked) _mboardPicked[k] = true; else delete _mboardPicked[k];
      _mboardRenderRows();
    });
  }
}

// 部品を選び直したら、手当ての要る図種を選び直す (最新の図種まで既定で選ぶと、
// 変わっていない図を毎回描き直すことになる)。
function _mboardResetPicks() {
  var MB = window.MA.materialBoard;
  _mboardPicked = {};
  if (!MB) return;
  MB.pendingKinds(_mboardRows()).forEach(function(k) { _mboardPicked[k] = true; });
}

function _mboardRenderComponents() {
  var MB = window.MA.materialBoard;
  var comp = _mboardSel('mboard-component');
  if (!MB || !comp) return;
  var want = comp.value;
  var list = MB.components(_mboardEntries);
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += '<option value="' + _mexpEsc(list[i].component) + '">' + _mexpEsc(list[i].component) + '</option>';
  }
  comp.innerHTML = html;
  for (var j = 0; j < list.length; j++) if (list[j].component === want) comp.value = want;
  _mboardResetPicks();
  _mboardRenderRows();
}

function openMaterialBoard() {
  var modal = document.getElementById('mboard-modal');
  var WS = window.MA.workspace;
  if (!modal || !window.MA.materialBoard || !WS) return Promise.resolve();
  var state = _mboardSel('mboard-state');
  if (state) state.textContent = '';
  _mboardEntries = [];
  _mboardRenderComponents();
  modal.style.display = 'flex';
  // 日時が要る (資料用より元が新しいかを言うため)。日時の取れない一覧しか
  // 返らない環境でも materialBoard は動く (鮮度を「最新」に倒さない)。
  var p = WS.listFileEntries ? WS.listFileEntries(_wsFileDir()) : WS.listFiles(_wsFileDir());
  return Promise.resolve(p).then(function(list) {
    _mboardEntries = list || [];
    _mboardRenderComponents();
  });
}

function closeMaterialBoard() {
  var modal = document.getElementById('mboard-modal');
  if (modal) modal.style.display = 'none';
}

// 選んだ図種を順に流す。1 件失敗しても残りは続ける (1 枚のしくじりで
// 資料一式の作り直しにならないように)。結果はどれが落ちたかまで言う。
function runMaterialBoard() {
  var MB = window.MA.materialBoard;
  var comp = _mboardSel('mboard-component');
  var state = _mboardSel('mboard-state');
  var run = _mboardSel('mboard-run');
  if (!MB || !comp) return Promise.resolve([]);
  var plans = MB.plans(_mboardEntries, comp.value, _mboardSelectedKinds());
  if (!plans.length) {
    if (state) state.textContent = MB.doneMessage([]);
    return Promise.resolve([]);
  }
  if (run) run.disabled = true;
  var results = [];
  var chain = Promise.resolve();
  plans.forEach(function(p, i) {
    chain = chain.then(function() {
      if (state) state.textContent = '(' + (i + 1) + '/' + plans.length + ') ' + p.source
        + ' を ' + p.formatLabel + ' で資料化しています…';
      return runMaterialPlan(p, { open: false })
        .then(function() { results.push({ ok: true, kind: p.kind, filename: p.filename }); })
        .catch(function() { results.push({ ok: false, kind: p.kind, filename: p.filename }); });
    });
  });
  return chain.then(function() {
    var msg = MB.doneMessage(results);
    if (state) state.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    try { refreshFolderPanelNow(); } catch (e) {}
    // 出したあとの一覧をその場で描き直す (作った資料用がすぐ「最新」になる)。
    var WS = window.MA.workspace;
    var next = WS.listFileEntries ? WS.listFileEntries(_wsFileDir()) : WS.listFiles(_wsFileDir());
    return Promise.resolve(next).then(function(list) {
      _mboardEntries = list || [];
      _mboardResetPicks();
      _mboardRenderRows();
      if (state) state.textContent = msg;
      if (run) run.disabled = _mboardSelectedKinds().length === 0;
      return results;
    });
  });
}

function setupMaterialBoard() {
  var open = document.getElementById('exp-material-board');
  if (open) open.addEventListener('click', function() {
    var menu = document.getElementById('export-menu');
    if (menu) menu.classList.remove('open');
    openMaterialBoard();
  });
  var modal = document.getElementById('mboard-modal');
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal && modal.style.display === 'flex') closeMaterialBoard();
  });
  var close = document.getElementById('mboard-close');
  if (close) close.addEventListener('click', closeMaterialBoard);
  var run = document.getElementById('mboard-run');
  if (run) run.addEventListener('click', function() { runMaterialBoard(); });
  var pending = document.getElementById('mboard-pending');
  if (pending) pending.addEventListener('click', function() {
    _mboardResetPicks();
    _mboardRenderRows();
  });
  var comp = document.getElementById('mboard-component');
  if (comp) comp.addEventListener('change', function() {
    _mboardResetPicks();
    _mboardRenderRows();
  });
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeMaterialBoard(); });
}

// ── 指摘の付いた図だけを 1 押しで出す (BLK-primary-20260908-1903-friction) ──
// 指摘対応で「名指しされた数枚だけ」を再エクスポートするのに、図を 1 枚ずつ開いて
// Export ▾ → SVG を図の数だけ繰り返していた (図 2 枚で 6 クリック)。絞り込みの画面は
// あるが Export メニューからは「全図」しか見えず、指摘対応の場面で見つからない。
// メニューに該当枚数を出し、そこから 1 押しで [要修正] の図だけを zip にする。

function _fixExportList() {
  var ES = window.MA.exportSelect;
  if (!ES || !window.MA.workspace) return [];
  saveActiveDoc();
  var SD = window.MA.saveDiff;
  var RV = window.MA.reviewVerdicts;
  return ES.buildList(window.MA.workspace.list(), {
    statusOf: SD ? function(name, dsl) { return SD.statusOf(name, dsl); } : null,
    fixCountOf: RV ? function(name) { return RV.counts(name).fix; } : null,
  });
}

// メニューを開くたびに枚数を数え直す (印はボードでいつでも増減する)。
function refreshFixExportEntry() {
  var btn = document.getElementById('exp-svg-fix');
  var ES = window.MA.exportSelect;
  if (!btn || !ES) return;
  var list = _fixExportList();
  btn.textContent = ES.menuLabel(list, 'fix');
  btn.disabled = ES.pickedByMode(list, 'fix').length === 0;
}

function exportFixedSVG() {
  var ES = window.MA.exportSelect;
  if (!ES) return Promise.resolve(null);
  var picked = ES.pickedByMode(_fixExportList(), 'fix');
  if (!picked.length) {
    if (window.MA.toast) window.MA.toast.show('[要修正] の印が付いた図がありません');
    return Promise.resolve(null);
  }
  return exportAllSVG(picked);
}

function setupFixExport() {
  var btn = document.getElementById('exp-svg-fix');
  if (!btn) return;
  btn.addEventListener('click', function() {
    var menu = document.getElementById('export-menu');
    if (menu) menu.classList.remove('open');
    exportFixedSVG();
  });
  refreshFixExportEntry();
}

// ── 提出用 zip の図選び (BLK-primary-20260908-1203-wish) ─────────────────────
// 「全図をSVGで保存（zip）」は開いている図を無条件に全部詰める。顧客に渡すのは
// ふつう「前回提出後に変わった図」か「[要修正] が付いた図」だけなので、見比べた
// 結果を頭に置いたまま Export に戻って選び直す二度手間になっていた。
// ▤ ボードと同じ絞り込みをこの画面に持たせ、選んだ図だけを zip に詰める。

var _expickList = [];
var _expickMode = 'all';

function _expickDocs() {
  if (!window.MA.workspace) return [];
  saveActiveDoc();
  return window.MA.workspace.list();
}

function _expickBuild() {
  var ES = window.MA.exportSelect;
  if (!ES) return [];
  var SD = window.MA.saveDiff;
  var RV = window.MA.reviewVerdicts;
  var EL = window.MA.exportLog;
  return ES.buildList(_expickDocs(), {
    statusOf: SD ? function(name, dsl) { return SD.statusOf(name, dsl); } : null,
    fixCountOf: RV ? function(name) { return RV.counts(name).fix; } : null,
    // BLK-primary-20260909-0003-wish: 「前回この zip を出した時点から」の差。
    // 保存からの差 (statusOf) では、出したあとに保存し直しただけの図と
    // 出してから中身が変わった図が区別できない。
    sinceStatusOf: EL ? function(name, dsl) { return EL.statusOf(_elLog, 'svg', name, dsl); } : null,
  });
}

// 「前回書き出しはいつで、そこから何枚変わったか」の 1 行。
function _expickSinceLine() {
  var EL = window.MA.exportLog;
  var el = document.getElementById('expick-since');
  if (!el) return '';
  var line = EL ? EL.sinceLine(_elLog, 'svg', _expickList) : '';
  el.textContent = line;
  var btn = document.getElementById('expick-mode-since');
  if (btn) btn.disabled = !_elHas('svg');
  return line;
}

function renderExportPick() {
  var ES = window.MA.exportSelect;
  var body = document.getElementById('expick-body');
  if (!ES || !body) return;
  var esc = window.MA.htmlUtils.escHtml;
  if (_expickList.length === 0) {
    body.innerHTML = '<div class="expick-empty">書き出せる図がありません（DSL が空の図は詰められません）</div>';
  } else {
    body.innerHTML = _expickList.map(function(it) {
      var marks = [];
      if (it.status === 'new') marks.push('<span class="expick-mark">新規</span>');
      else if (it.status === 'changed') marks.push('<span class="expick-mark">変更あり</span>');
      if (it.fix > 0) marks.push('<span class="expick-mark fix">要修正 ' + it.fix + '</span>');
      return '<label class="expick-row"><input type="checkbox" class="expick-check" data-id="'
        + esc(String(it.id)) + '"' + (it.selected ? ' checked' : '') + '>'
        + '<span>' + esc(it.name) + '</span>' + marks.join(' ') + '</label>';
    }).join('');
  }
  var count = document.getElementById('expick-count');
  if (count) count.textContent = ES.countText(_expickList, _expickMode);
  _expickSinceLine();
  ES.MODES.forEach(function(m) {
    var b = document.getElementById('expick-mode-' + m);
    if (b) b.classList.toggle('on', m === _expickMode);
  });
  var save = document.getElementById('expick-save');
  if (save) save.disabled = (ES.counts(_expickList).selected === 0);
}

function toggleExportPick(open) {
  var modal = document.getElementById('expick-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  _expickList = _expickBuild();
  _expickMode = 'all';
  var state = document.getElementById('expick-state');
  if (state) state.textContent = '';
  modal.style.display = 'flex';
  renderExportPick();
  // 保存フォルダの控えは開くたびに読み直す (別の端末で出した分も基準に入れる)。
  _elLoad().then(function(log) {
    if (!log || modal.style.display !== 'flex') return;
    _expickList = _expickBuild();
    _expickList = window.MA.exportSelect.applyMode(_expickList, _expickMode);
    renderExportPick();
  });
  var body = document.getElementById('expick-body');
  if (body) body.scrollTop = 0;
}

function exportPickedSVG() {
  var ES = window.MA.exportSelect;
  var state = document.getElementById('expick-state');
  if (!ES) return null;
  var picked = ES.selectedDocs(_expickList);
  if (picked.length === 0) {
    if (state) state.textContent = '図が 1 枚も選ばれていません';
    return null;
  }
  return exportAllSVG(picked, state);
}

function setupExportPick() {
  var open = document.getElementById('exp-svg-pick');
  var modal = document.getElementById('expick-modal');
  if (!open || !modal) return;
  var exportMenu = document.getElementById('export-menu');
  open.addEventListener('click', function() {
    if (exportMenu) exportMenu.classList.remove('open');
    toggleExportPick(true);
  });

  var closeBtn = document.getElementById('expick-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleExportPick(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleExportPick(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleExportPick(false);
  });

  (window.MA.exportSelect ? window.MA.exportSelect.MODES : []).forEach(function(m) {
    var b = document.getElementById('expick-mode-' + m);
    if (!b) return;
    b.addEventListener('click', function() {
      _expickMode = m;
      _expickList = window.MA.exportSelect.applyMode(_expickList, m);
      renderExportPick();
    });
  });

  // 絞り込んだ後の 1 枚単位の足し引き。絞り込みの名前はそのまま残す
  // (「要修正のみ + この 1 枚」を選んだことが見出しから分かるようにする)。
  var body = document.getElementById('expick-body');
  if (body) body.addEventListener('change', function(ev) {
    var t = ev.target;
    if (!t || !t.classList || !t.classList.contains('expick-check')) return;
    _expickList = window.MA.exportSelect.setSelected(_expickList, t.getAttribute('data-id'), t.checked);
    var count = document.getElementById('expick-count');
    if (count) count.textContent = window.MA.exportSelect.countText(_expickList, _expickMode);
    var save = document.getElementById('expick-save');
    if (save) save.disabled = (window.MA.exportSelect.counts(_expickList).selected === 0);
  });

  var save = document.getElementById('expick-save');
  if (save) save.addEventListener('click', function() { exportPickedSVG(); });
}

function svgToCanvas(transparent, callback) {
  var svgEl = previewSvgEl.querySelector('svg');
  if (!svgEl) return;
  var clone = svgEl.cloneNode(true);
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
  img.onerror = function() { alert('PNG エクスポートに失敗しました (SVG 読み込みエラー)'); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
}

function exportPNG(transparent) {
  svgToCanvas(transparent, function(canvas) {
    canvas.toBlob(function(blob) {
      if (!blob) return;
      downloadBlob(((currentParsed.meta && currentParsed.meta.title) || 'untitled') + '.png', blob);
      stashToVault(transparent ? 'PNG（透過背景）' : 'PNG');
    });
  });
}

// ── 提出物庫 (BLK-junior-20260908-2203-wish) ─────────────────────────────────
// 保存は「図の名前 = ファイル名」なので、次の周が diagram1 という同じ名前で
// 始まれば前の周に完走した図は上書きで消える。_versions の控えは残るが、そこに
// 積まれるのは「上書きされた中身」で、どれが提出物かは開くまで分からない。
// 「周を 1 つ完走して画像を出した」という区切りが記録されていないのが根っこ
// なので、画像を書き出した瞬間の DSL を、ファイル名と無関係な刻印で庫へ積む。
// 庫は追記しかしない。あとの周が同じ名前で上書きしても、前回分は消えない。
var _vaultRows = [];
var _vaultDir = null;
var _vaultLoading = false;
var _vaultSubject = null;   // null = まだ選んでいない (開いている図から決める)
var _vaultKind = '';

function loadVault(force) {
  if (!_fiFolderMode()) { _vaultRows = []; _vaultDir = null; return Promise.resolve([]); }
  var dir = _wsFileDir();
  if (!force && _vaultDir === dir && !_vaultLoading) return Promise.resolve(_vaultRows);
  _vaultLoading = true;
  return window.fetch('/vault?dir=' + encodeURIComponent(dir))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      _vaultRows = window.MA.vault ? window.MA.vault.rows(data) : [];
      _vaultDir = dir;
      _vaultLoading = false;
      return _vaultRows;
    }, function() {
      // 読めなくても「読んだ」ことにする。読み直しを繰り返すと、一覧を開く
      // たびに再描画が走り続ける (庫は無くても一覧は使える)。
      _vaultDir = dir;
      _vaultLoading = false;
      return _vaultRows;
    });
}

// 画像を書き出した瞬間に呼ぶ。積めなくても書き出しは止めない (庫は副作用)。
function stashToVault(format) {
  var V = window.MA.vault;
  if (!V || !_fiFolderMode()) return Promise.resolve(null);
  var dsl = mmdText;
  if (!dsl || !dsl.trim()) return Promise.resolve(null);
  var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
  var entry = V.entryFor({
    dsl: dsl,
    title: (currentParsed && currentParsed.meta && currentParsed.meta.title) || '',
    name: doc ? doc.name : '',
    format: format,
  });
  entry.dsl = dsl;
  entry.dir = _wsFileDir();
  return window.fetch('/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).then(function(r) { return r.ok ? r.json() : null; })
    .then(function(res) {
      if (!res) return null;
      _vaultDir = null;          // 次に開いたときに読み直す
      if (window.MA.toast) {
        window.MA.toast.show('提出物庫に控えました（' + (entry.subject || entry.name || '図')
          + ' / ' + (entry.kind || '図種不明') + '）。あとの周で上書きしても消えません');
      }
      return res;
    }, function() { return null; });
}

function renderVaultBoard() {
  var V = window.MA.vault;
  var body = document.getElementById('vault-body');
  var subjSel = document.getElementById('vault-subject');
  var kindSel = document.getElementById('vault-kind');
  var sumEl = document.getElementById('vault-summary');
  if (!V || !body || !subjSel || !kindSel) return;
  var esc = window.MA.htmlUtils.escHtml;
  var all = _vaultRows;

  var subs = V.subjects(all);
  // まだ選んでいなければ、今開いている図の部品を出す (選び直させない)。
  if (_vaultSubject === null) {
    var doc = window.MA.workspace ? window.MA.workspace.getActive() : null;
    var want = V.subjectOf((currentParsed && currentParsed.meta && currentParsed.meta.title) || '',
                           doc ? doc.name : '');
    _vaultSubject = '';
    for (var i = 0; i < subs.length; i++) {
      if (subs[i].subject === want) { _vaultSubject = want; break; }
    }
  }
  var opts = '<option value="">すべての部品</option>';
  subs.forEach(function(s) {
    opts += '<option value="' + esc(s.subject) + '"' + (s.subject === _vaultSubject ? ' selected' : '')
      + '>' + esc(s.subject) + '（' + s.count + ' 件 / ' + s.kinds.length + ' 図種）</option>';
  });
  subjSel.innerHTML = opts;

  var scoped = V.filter(all, _vaultSubject, '');
  var kinds = Object.keys(V.byKind(scoped, _vaultSubject)).sort();
  if (_vaultKind && kinds.indexOf(_vaultKind) < 0) _vaultKind = '';
  var kopts = '<option value="">すべての図種</option>';
  kinds.forEach(function(k) {
    kopts += '<option value="' + esc(k) + '"' + (k === _vaultKind ? ' selected' : '') + '>'
      + esc(k) + '</option>';
  });
  kindSel.innerHTML = kopts;

  if (sumEl) sumEl.textContent = V.summaryText(all, _vaultSubject);

  var hits = V.filter(all, _vaultSubject, _vaultKind);
  if (!hits.length) {
    body.innerHTML = '<div class="cb-empty">'
      + esc(all.length ? 'この絞り込みに当たる提出物はありません。'
                       : '提出物庫はまだ空です。Export から画像を書き出すと、その時点の図がここに積まれます。')
      + '</div>';
    return;
  }
  // 新しい順。先頭が最新、その次が「前回分」— 手順 1 が探すのはここ。
  var html = '<table class="vault-table"><thead><tr>'
    + '<th>いつ</th><th>版</th><th>部品名</th><th>図種</th><th>題名</th><th>書き出し</th><th></th>'
    + '</tr></thead><tbody>';
  // 「最新 / 前回分」は同じ部品の同じ図種の中でしか意味を持たない。絞り込む前に
  // 並び順で数えると、別の図の行が「前回分」に見えて取り違える。
  var ranked = !!(_vaultSubject && _vaultKind);
  hits.forEach(function(r, i) {
    html += '<tr class="vault-row" data-stamp="' + esc(r.stamp) + '" data-subject="' + esc(r.subject)
      + '" data-kind="' + esc(r.kind) + '" data-back="' + i + '">'
      + '<td class="vault-at">' + esc(r.label) + '</td>'
      + '<td class="vault-back">'
      + (ranked ? (i === 0 ? '最新' : (i === 1 ? '前回分' : i + ' つ前')) : '—') + '</td>'
      + '<td>' + esc(r.subject || '—') + '</td>'
      + '<td>' + esc(r.kind || '図種不明') + '</td>'
      + '<td class="vault-title">' + esc(r.title || r.name || '—') + '</td>'
      + '<td>' + esc(r.format || '—') + '</td>'
      + '<td><button type="button" class="vault-open">この版を開く</button></td></tr>';
  });
  body.innerHTML = html + '</tbody></table>';

  var opens = body.querySelectorAll('.vault-open');
  for (var j = 0; j < opens.length; j++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var row = btn.parentNode.parentNode;
        openVaultEntry(row.getAttribute('data-stamp'));
      });
    })(opens[j]);
  }
}

// 庫の 1 件を別タブで開く。タブ名に刻印を付けるので、開いたまま自動保存が
// 走っても今の作業ファイルを過去の中身で塗り潰さない。
function openVaultEntry(stamp) {
  var url = '/vault?dir=' + encodeURIComponent(_wsFileDir()) + '&stamp=' + encodeURIComponent(stamp);
  return window.fetch(url).then(function(r) { return r.ok ? r.text() : null; }).then(function(text) {
    if (text == null) {
      if (window.MA.toast) window.MA.toast.show('この提出物を読めませんでした');
      return;
    }
    var row = null;
    _vaultRows.forEach(function(r) { if (r.stamp === stamp) row = r; });
    toggleVault(false);
    saveActiveDoc();
    var detected = window.MA.workspace.detectType(text);
    var base = (row && (row.title || row.name)) || '提出物';
    openExistingFile({
      name: base + '@' + stamp,
      dsl: text,
      diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
    });
    applyActiveDoc();
    if (window.MA.toast) {
      window.MA.toast.show(base + '（' + (row ? row.label : stamp)
        + ' の提出物）を別タブで開きました');
    }
  });
}

function toggleVault(open) {
  var modal = document.getElementById('vault-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  modal.style.display = 'flex';
  renderVaultBoard();
  loadVault().then(function() { renderVaultBoard(); });
  var body = document.getElementById('vault-body');
  if (body) body.scrollTop = 0;
}

function setupVault() {
  var modal = document.getElementById('vault-modal');
  if (!modal) return;
  var btn = document.getElementById('btn-vault');
  if (btn) btn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    toggleVault(true);
  });
  var closeBtn = document.getElementById('vault-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { toggleVault(false); });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) toggleVault(false);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && modal.style.display === 'flex') toggleVault(false);
  });
  var subj = document.getElementById('vault-subject');
  if (subj) subj.addEventListener('change', function() {
    _vaultSubject = subj.value;
    _vaultKind = '';
    renderVaultBoard();
  });
  var kind = document.getElementById('vault-kind');
  if (kind) kind.addEventListener('change', function() {
    _vaultKind = kind.value;
    renderVaultBoard();
  });
}

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

// ── レビュー指摘のピン (BLK-reviewer-20260907-1203-wish) ────────────────────
// 指摘を文章で書き直しては次の run で該当箇所を探し直す、を繰り返していた。
// 指摘を図の行に貼れば、図を開いた瞬間に該当箇所へ赤い番号が出る。既読の印が
// そのまま「反映を確認した」の記録になるので、前回指摘の追跡が diff 読みでなくなる。
// 保存先は DSL のコメント行 (src/core/review-pins.js)。図と指摘が離れない。

function _pins() {
  return window.MA.reviewPins ? window.MA.reviewPins.list(mmdText) : [];
}

// 指摘を付ける先の行。図の要素を選んでいればその行、無ければエディタのキャレット行。
function _pinTargetLine() {
  var sel = (window.MA.selection && window.MA.selection.getRange) ? window.MA.selection.getRange() : null;
  if (sel && sel.start) return sel.start;
  if (!editorEl) return 0;
  var before = editorEl.value.slice(0, editorEl.selectionStart || 0);
  return before.split('\n').length;
}

function _pinLineText(line) {
  var lines = String(mmdText || '').replace(/\r\n?/g, '\n').split('\n');
  return (line >= 1 && line <= lines.length) ? lines[line - 1].trim() : '';
}

// 対応済みにするときの「修正後の行」。指摘先の行が生きていればその行、
// 書き換わって迷子になっていれば、いま選んでいる要素の行 (直した相手) を使う。
function _pinFixedLine(pin) {
  var sel = (window.MA.selection && window.MA.selection.getRange) ? window.MA.selection.getRange() : null;
  if (pin && !pin.stale && pin.line) return pin.line;
  if (sel && sel.start) return sel.start;
  return 0;
}

function renderPinBadge() {
  var btn = document.getElementById('btn-tab-pins');
  var RP = window.MA.reviewPins;
  if (!btn || !RP) return null;
  var sum = RP.summary(_pins());
  btn.textContent = RP.badgeText(sum);
  btn.classList.toggle('has-open', sum.pending > 0);
  btn.title = sum.total
    ? ('レビュー指摘 ' + sum.total + ' 件 (未対応 ' + sum.pending + ' / 対応済み ' + sum.done
      + ' / 迷子 ' + sum.stale + ')')
    : 'この図にレビュー指摘はない';
  return sum;
}

// 図の上の印。指摘先の行に当たる overlay の枠を探し、その左上に番号を置く。
function drawPinMarkers(overlayEl) {
  var RP = window.MA.reviewPins;
  if (!overlayEl || !RP) return 0;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var byLine = RP.byLine(mmdText);
  var drawn = 0;
  Object.keys(byLine).forEach(function(line) {
    var host = overlayEl.querySelector('[data-line="' + line + '"]');
    if (!host) return;
    var x = parseFloat(host.getAttribute('x')) || 0;
    var y = parseFloat(host.getAttribute('y')) || 0;
    byLine[line].forEach(function(pin, i) {
      var g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'review-pin');
      g.setAttribute('data-pin-id', pin.id);
      g.setAttribute('data-pin-state', pin.state);
      g.setAttribute('data-pin-line', String(line));
      g.style.cursor = 'pointer';
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(x - 2 + i * 18));
      c.setAttribute('cy', String(y - 2));
      c.setAttribute('r', '9');
      c.setAttribute('fill', RP.markerColor(pin));
      c.setAttribute('stroke', '#ffffff');
      c.setAttribute('stroke-width', '1.5');
      var t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(x - 2 + i * 18));
      t.setAttribute('y', String(y + 2));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '11');
      t.setAttribute('fill', '#ffffff');
      t.textContent = RP.markerLabel(pin);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = RP.stateLabel(pin.state) + ': ' + pin.text
        + (RP.fixText(pin) ? ' (' + RP.fixText(pin) + ')' : '');
      g.appendChild(c);
      g.appendChild(t);
      g.appendChild(title);
      g.addEventListener('click', function(ev) {
        ev.stopPropagation();
        openPinPanel(pin.id);
        // 印を押した時点で対象要素を選び、修正フォームまで開く。
        jumpToPin(pin.id);
      });
      overlayEl.appendChild(g);
      drawn++;
    });
  });
  return drawn;
}

function openPinPanel(focusId) {
  var btn = document.getElementById('btn-tab-pins');
  var panel = document.getElementById('pin-panel');
  if (!btn || !panel) return;
  renderPinPanel();
  panel.classList.add('open');
  var rect = btn.getBoundingClientRect();
  panel.style.left = Math.max(4, rect.left) + 'px';
  panel.style.top = (rect.bottom + 2) + 'px';
  if (focusId) {
    var row = panel.querySelector('.pin-row[data-pin-id="' + focusId + '"]');
    if (row) {
      row.style.background = 'var(--bg-secondary)';
      if (row.scrollIntoView) row.scrollIntoView();
    }
  }
}

// 指摘 1 件ぶんの「直す側の応答」(BLK-reviewer-20260908-1303-wish)。
// 応答が書かれていれば誰が何と言ったかを出し、書かれていなければ書く欄を出す。
// 応答は指摘 1 件に何度でも返せる (保留 → 対応した が履歴として残る)。
function _pinReplyHtml(p, esc) {
  var PR = window.MA.pinReply;
  if (!PR) return '';
  var id = esc(p.id);
  var now = PR.latest(mmdText, p.id);
  var html = '<div class="pin-reply" data-pin-id="' + id + '"'
    + ' data-verdict="' + esc(now ? now.verdict : '') + '">';
  if (now) {
    html += '<span class="pin-reply-now">' + esc(PR.statusText(mmdText, p.id)) + '</span>'
      + '<button type="button" class="pin-reply-del" data-pin-id="' + id + '"'
      + ' title="応答を取り消してもう一度書く">応答を消す</button>';
  }
  html += '<select class="pin-reply-verdict" data-pin-id="' + id + '">';
  PR.verdicts().forEach(function(v) {
    html += '<option value="' + esc(v) + '" title="' + esc(PR.verdictTitle(v)) + '">'
      + esc(PR.verdictLabel(v)) + '</option>';
  });
  html += '</select>'
    + '<input class="pin-reply-text" data-pin-id="' + id + '"'
    + ' placeholder="理由 (保留・直さない には必須。いつ・何待ちか)">'
    + '<button type="button" class="pin-reply-add" data-pin-id="' + id + '"'
    + ' title="この指摘に応答を返す。reviewer は次の run で全部を調べ直さずに済む">'
    + (now ? '応答を書き足す' : '応答を書く') + '</button>'
    + '<span class="pin-reply-err" data-pin-id="' + id + '" hidden></span>'
    + '</div>';
  return html;
}

function renderPinPanel() {
  var panel = document.getElementById('pin-panel');
  var RP = window.MA.reviewPins;
  if (!panel || !RP) return;
  var esc = window.MA.htmlUtils.escHtml;
  var pins = _pins();
  var sum = RP.summary(pins);
  var target = _pinTargetLine();

  var html = '<div class="pin-head" data-total="' + sum.total + '" data-open="' + sum.open
    + '" data-done="' + sum.done + '" data-pending="' + sum.pending
    + '" data-stale="' + sum.stale + '">レビュー指摘 ' + sum.total + ' 件 ・ 未対応 ' + sum.pending
    + ' ・ 対応済み ' + sum.done
    + (sum.stale ? ' ・ 行が見つからない ' + sum.stale : '') + '</div>';
  // 直す側の応答の内訳 (BLK-reviewer-20260908-1303-wish)。reviewer が最初に
  // 知りたいのは「全部確かめ直すのか、裏取りだけでよいのか」なので先頭に置く。
  var PR = window.MA.pinReply;
  if (PR && pins.length) {
    var rsum = PR.summary(pins, mmdText);
    html += '<div class="pin-reply-head" id="pin-reply-head"'
      + ' data-recheck="' + rsum.recheck + '" data-waiting="' + rsum.waiting
      + '" data-unanswered="' + rsum.unanswered + '">'
      + esc(PR.headText(rsum)) + '</div>';
  }
  if (!pins.length) {
    html += '<div class="pin-row" id="pin-empty">この図に指摘はありません</div>';
  }
  pins.forEach(function(p) {
    var fix = RP.fixText(p);
    html += '<div class="pin-row' + (p.state === 'read' ? ' read' : '')
      + (p.state === 'done' ? ' done' : '') + (p.stale ? ' stale' : '') + '"'
      + ' data-pin-id="' + esc(p.id) + '" data-pin-state="' + esc(p.state) + '">'
      + '<span class="pin-where">#' + esc(p.id) + ' '
      + (p.stale ? '行が見つかりません' : ('L' + p.line)) + '</span>'
      + '<span class="pin-state">' + esc(RP.stateLabel(p.state)) + '</span>'
      + '<span class="pin-text">' + esc(p.text) + '</span>'
      + '<span class="pin-anchor">' + esc(p.anchor) + '</span>'
      // どの指摘にどの修正が対応するかを、指摘の行そのものに残して見せる。
      + (fix ? '<span class="pin-fix">' + esc(fix) + '</span>' : '') + '<br>'
      + '<button type="button" class="pin-jump" data-pin-id="' + esc(p.id) + '"'
      + (window.MA.pinJump && !window.MA.pinJump.canJump(p) ? ' disabled' : '')
      + ' title="この指摘の対象を選択して修正フォームを開く">'
      + (window.MA.pinJump ? esc(window.MA.pinJump.jumpLabel(p)) : '対象へジャンプ')
      + '</button> '
      + (p.state === 'done'
        ? '<button type="button" class="pin-reopen" data-pin-id="' + esc(p.id) + '"'
          + ' title="修正が足りなかったときに未対応へ戻す">未対応に戻す</button> '
        : '<button type="button" class="pin-done" data-pin-id="' + esc(p.id) + '"'
          + ' title="直した内容をこの指摘に記録する。選択中の要素の行を修正後として憶える">'
          + '対応済みにする</button> '
          + '<button type="button" class="pin-toggle" data-pin-id="' + esc(p.id) + '">'
          + (p.state === 'read' ? '未読に戻す' : '既読にする') + '</button> ')
      + '<button type="button" class="pin-del" data-pin-id="' + esc(p.id) + '">消す</button>'
      + _pinReplyHtml(p, esc)
      + '</div>';
  });
  html += '<div class="pin-jump-bar">'
    + '<button type="button" id="pin-next-open"'
    + (sum.open ? '' : ' disabled') + ' title="未読の指摘を上から順に辿る">'
    + '次の未読へジャンプ (' + sum.open + ')</button>'
    + '<div id="pin-jump-note" hidden></div></div>';
  html += '<div class="pin-new">'
    + '<div class="pin-target" id="pin-target" data-line="' + target + '">'
    + (target ? ('付ける先: L' + target + ' ' + esc(_pinLineText(target))) : '付ける先の行がありません')
    + '</div>'
    + '<input id="pin-text" placeholder="指摘の内容 (末尾に「根拠: 図名 に 語 が無い」を書くと毎回確かめ直します)">'
    + '<button type="button" id="pin-add">この行に指摘を付ける</button></div>';
  panel.innerHTML = html;

  function bindAll(cls, fn) {
    var els = panel.querySelectorAll('.' + cls);
    for (var i = 0; i < els.length; i++) {
      (function(el) {
        el.addEventListener('click', function() { fn(el.getAttribute('data-pin-id'), el); });
      })(els[i]);
    }
  }
  bindAll('pin-toggle', function(id) {
    _applyLineEditText(RP.toggleState(mmdText, id));
    renderPinBadge();
    renderPinPanel();
  });
  // 「対応済みにする」: 直した後の行を修正後として憶える。指摘の行を直すと anchor が
  // 変わって迷子になるので、いま選んでいる要素の行 (= ジャンプして直した相手) を渡す。
  bindAll('pin-done', function(id) {
    var pin = null;
    pins.forEach(function(q) { if (String(q.id) === String(id)) pin = q; });
    _applyLineEditText(RP.markDone(mmdText, id, { line: _pinFixedLine(pin) }));
    renderPinBadge();
    renderPinPanel();
  });
  bindAll('pin-reopen', function(id) {
    _applyLineEditText(RP.reopen(mmdText, id));
    renderPinBadge();
    renderPinPanel();
  });
  bindAll('pin-del', function(id) {
    // 指摘を消したら、その指摘への応答も一緒に消す (相手のいない応答を残さない)。
    var PRd = window.MA.pinReply;
    var next = RP.remove(mmdText, id);
    if (PRd) next = PRd.removeFor(next, id);
    _applyLineEditText(next);
    renderPinBadge();
    renderPinPanel();
  });
  // 直す側の応答 (BLK-reviewer-20260908-1303-wish)。
  bindAll('pin-reply-add', function(id) {
    var PRa = window.MA.pinReply;
    if (!PRa) return;
    var sel = panel.querySelector('.pin-reply-verdict[data-pin-id="' + id + '"]');
    var txt = panel.querySelector('.pin-reply-text[data-pin-id="' + id + '"]');
    var err = panel.querySelector('.pin-reply-err[data-pin-id="' + id + '"]');
    var verdict = sel ? sel.value : '';
    var text = txt ? txt.value : '';
    var msg = PRa.replyError(verdict, text);
    if (msg) {
      // 理由の無い保留は、次の run でゼロから調べ直しになる。書かせてから通す。
      if (err) { err.textContent = msg; err.hidden = false; }
      return;
    }
    _applyLineEditText(PRa.add(mmdText, id, {
      verdict: verdict, text: text,
      author: _inboxMe() || 'primary', at: new Date().toISOString().slice(0, 16),
    }));
    renderPinBadge();
    renderPinPanel();
  });
  bindAll('pin-reply-del', function(id) {
    var PRr = window.MA.pinReply;
    if (!PRr) return;
    _applyLineEditText(PRr.removeFor(mmdText, id));
    renderPinBadge();
    renderPinPanel();
  });
  // 「対象へジャンプ」: 行への移動だけでなく、対象要素の選択と修正フォームまで開く。
  bindAll('pin-jump', function(id) { jumpToPin(id); });
  var nextBtn = document.getElementById('pin-next-open');
  if (nextBtn) nextBtn.addEventListener('click', function() { jumpToNextOpenPin(); });
  // L番号の表示も同じジャンプにする (「行だけ動いて要素は選ばれない」を無くす)。
  var wheres = panel.querySelectorAll('.pin-where');
  for (var i = 0; i < wheres.length; i++) {
    (function(el) {
      el.addEventListener('click', function() {
        var row = el.parentNode;
        jumpToPin(row.getAttribute('data-pin-id'));
      });
    })(wheres[i]);
  }
  var add = document.getElementById('pin-add');
  if (add) {
    add.addEventListener('click', function() {
      var input = document.getElementById('pin-text');
      var text = input ? input.value.trim() : '';
      var line = _pinTargetLine();
      if (!text || !line) return;
      _applyLineEditText(RP.add(mmdText, {
        line: line, text: text, author: 'reviewer', at: new Date().toISOString().slice(0, 16),
      }));
      renderPinBadge();
      renderPinPanel();
    });
  }
}

// ── 指摘から対象要素へのジャンプ (BLK-junior-20260907-2303-wish) ────────────
// 指摘の対象を選び直すのに、レイアウトが変わるたび要素を目で探してクリックし直して
// いた。再レイアウト直後は隣を掴む誤クリックも起きる。指摘は対象行を覚えているので、
// その行の選択候補を引き当てて 移動 + 選択 + 修正フォームまでを 1 操作で済ませる。

// 今の図で「選べる要素」の一覧。図種ごとの kbdSelectables があればそれを使い、
// 無い図種では message 関係を候補にする (command palette の jump と同じ土俵)。
function pinSelectables() {
  if (!currentModule) return [];
  if (typeof currentModule.kbdSelectables === 'function') {
    try { return currentModule.kbdSelectables(currentParsed) || []; } catch (e) { return []; }
  }
  return (((currentParsed && currentParsed.relations) || [])
    .filter(function(r) { return r.kind === 'message'; })
    .map(function(r) { return { type: 'message', id: r.id, line: r.line }; }));
}

var _lastJumpedPinId = null;

// 指摘 1 件へジャンプする。行へ移動し、対象要素を選択して図の上でハイライトし、
// 右ペインを「選択中」タブ (修正フォーム) にする。迷子の指摘は動かさず理由を出す。
function jumpToPin(pinId) {
  var PJ = window.MA.pinJump;
  if (!PJ || !window.MA.reviewPins) return null;
  var pin = null;
  _pins().forEach(function(p) { if (String(p.id) === String(pinId)) pin = p; });
  var p = PJ.plan(pin, pinSelectables());
  var note = document.getElementById('pin-jump-note');
  if (note) { note.textContent = p.message; note.hidden = false; }
  if (!p.ok) return p;
  jumpToLine(p.line);
  if (p.item && window.MA.selection) {
    window.MA.selection.setSelected([{ type: p.item.type, id: p.item.id, line: p.item.line }]);
  }
  if (p.openProps) showPropsTab('props');
  _lastJumpedPinId = pin ? pin.id : null;
  return p;
}

// 未読の指摘を上から順に辿る。1 件直したら次の指摘へ、を同じボタンで続けられる。
function jumpToNextOpenPin() {
  var PJ = window.MA.pinJump;
  if (!PJ) return null;
  var next = PJ.nextOpen(_pins(), _lastJumpedPinId);
  if (!next) {
    var note = document.getElementById('pin-jump-note');
    if (note) { note.textContent = '未読の指摘はありません'; note.hidden = false; }
    return null;
  }
  return jumpToPin(next.id);
}

// 指摘先の行へ飛ぶ。エディタのキャレットをその行に置き、行が見えるまでスクロールする。
function jumpToLine(line) {
  if (!editorEl || !line) return;
  var r = window.MA.lineResolver.caretRangeForLine(editorEl.value, line - 1);
  if (!r) return;
  editorEl.focus();
  editorEl.selectionStart = r.start;
  editorEl.selectionEnd = r.end;
  editorEl.scrollTop = Math.max(0, (line - 3) * 18);
}

function setupPinPanel() {
  var btn = document.getElementById('btn-tab-pins');
  var panel = document.getElementById('pin-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    openPinPanel();
  });
  // 既読・削除・追加はその場でパネルを組み直す。組み直した後の click は
  // 対象が DOM から外れていて panel.contains が偽になり、外側クリック扱いで
  // パネルが閉じてしまう。パネル内の click はここで止める。
  panel.addEventListener('click', function(ev) { ev.stopPropagation(); });
  // 図を見に戻るときは Esc で閉じる (他のパネルと同じ作法)。
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') panel.classList.remove('open');
  });
  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    if (ev.target && ev.target.closest && ev.target.closest('.review-pin')) return;
    panel.classList.remove('open');
  });
  renderPinBadge();
}

// ── 指摘の受信箱 (BLK-junior-20260907-2203-wish) ────────────────────────────
// 📌 指摘は開いている 1 図ぶんしか出ない。指摘を受けて直す業務は、前の図を
// 1 枚ずつ開いてバッジを見て回るところから始まっていた。保存フォルダの図を
// まとめて読み、「未対応が何件・どの図に残っているか」を先に出す。
// 行を押すとその図を開いて該当行へ飛ぶので、直す作業がそのまま続く。
// 集計は src/core/pin-inbox.js。ここは読み込みと画面だけ。

var _inboxItems = null;      // 直近の走査結果 (絞り込み前)
var _inboxDocs = null;       // 走査で読んだ図の束 (根拠の確かめ直しに使う)
var _inboxLoading = false;

// 「自分」の名前。自分で書いた指摘を受信箱から外すために憶えておく。
function _inboxMe() {
  try { return window.localStorage.getItem('pua.pin-inbox.me') || ''; } catch (e) { return ''; }
}
function _inboxSetMe(v) {
  try { window.localStorage.setItem('pua.pin-inbox.me', String(v == null ? '' : v)); } catch (e) { /* 保存できなくても画面は動く */ }
}
function _inboxUnreadOnly() {
  try { return window.localStorage.getItem('pua.pin-inbox.unread') !== '0'; } catch (e) { return true; }
}
function _inboxSetUnreadOnly(v) {
  try { window.localStorage.setItem('pua.pin-inbox.unread', v ? '1' : '0'); } catch (e) { /* 同上 */ }
}

// ── 着手状況の追跡 (BLK-reviewer-20260908-1603-wish) ───────────────────────
// 受信箱は「まだ直っていない指摘」を並べるが、並ぶのは指摘であって着手状況ではない。
// 前回の依頼に手が付いたかを知るには audit.js --since-files で保存フォルダの全図の
// 指紋を控えと突き合わせるしかなく、何 tick 放置されているかも数え直していた。
// 走査のたびに指摘 1 件ずつを未着手 / 着手 / 解消へ仕分け、控えを憶えておく。
// 仕分けの規則は src/core/pin-progress.js。ここは控えの出し入れと画面だけ。
var _inboxProgress = null;   // { key: entry } 直近の走査で付けた着手状況

function _progressKey() {
  return 'pua.pin-progress:' + String(_wsFileDir() || './autosave');
}
function _progressMemo() {
  try {
    var raw = window.localStorage.getItem(_progressKey());
    if (!raw) return {};
    var v = JSON.parse(raw);
    return (v && typeof v === 'object') ? v : {};
  } catch (e) { return {}; }
}
function _progressSaveMemo(memo) {
  try { window.localStorage.setItem(_progressKey(), JSON.stringify(memo || {})); } catch (e) { /* 控えが残らなくても仕分けは出る */ }
}
// 解消も出すか。既定は出さない (受信箱は「まだ直っていない指摘」の箱のまま)。
function _inboxShowResolved() {
  try { return window.localStorage.getItem('pua.pin-inbox.resolved') === '1'; } catch (e) { return false; }
}
function _inboxSetShowResolved(v) {
  try { window.localStorage.setItem('pua.pin-inbox.resolved', v ? '1' : '0'); } catch (e) { /* 同上 */ }
}

// 走査結果に着手状況を付け直し、控えを更新する。
function _inboxTrackProgress() {
  var PP = window.MA.pinProgress;
  _inboxProgress = null;
  if (!PP || !_inboxItems) return null;
  var res = PP.observe(_inboxItems, _inboxDocs || [], _progressMemo(), {
    now: new Date().toISOString(),
  });
  _progressSaveMemo(res.memo);
  var map = {};
  res.entries.forEach(function(e) { map[e.key] = e; });
  _inboxProgress = map;
  return res;
}

function _progressOf(item) {
  var PP = window.MA.pinProgress;
  if (!PP || !_inboxProgress || !item) return null;
  return _inboxProgress[PP.keyOf(item)] || null;
}

// ── 反映の判定 (BLK-reviewer-20260908-1903-wish) ───────────────────────────
// 着手状況が言えるのは puml 側だけで、客が見る SVG に出ているかは別に確かめていた
// (puml diff・label-position 監査・/render 再描画・/verify-svg を 4 本別々に回す)。
// 指摘の付いている図だけを描き直して突き合わせ、1 件ごとに 1 つの札にする。
// 判定の規則は src/core/pin-verify.js。ここは材料集めと画面だけ。
var _inboxVerify = null;      // { key2: judgement } 直近の判定
var _inboxVerifyState = '';   // '' | 'running' | 'done' | 'failed'

function _inboxVerifyOf(item) {
  if (!_inboxVerify || !item) return null;
  return _inboxVerify[String(item.doc) + '#' + String(item.id)] || null;
}

function _inboxVerifyList() {
  var out = [];
  if (!_inboxVerify) return out;
  Object.keys(_inboxVerify).forEach(function(k) { out.push(_inboxVerify[k]); });
  return out;
}

// 前回控え (review-diff) との行差分。puml 側の「変更点」はここから取る。
function _inboxDiffs(docs) {
  var RD = window.MA.reviewDiff;
  if (!RD) return {};
  var bodies = RD.load(window.localStorage, _wsFileDir());
  var out = {};
  (docs || []).forEach(function(name) {
    out[name] = RD.compare(bodies, name, _inboxDsl(name));
  });
  return out;
}

// 指摘の付いている図だけを 10 枚ずつ描き直して突き合わせる。
// 箱は先に開く (判定は後から差し込む)。1 枚も確かめられなくても箱は使える。
function _inboxRunVerify() {
  var PV = window.MA.pinVerify;
  if (!PV || !_inboxProgress) { _inboxVerify = null; _inboxVerifyState = ''; return Promise.resolve(null); }
  var entries = _progressEntries();
  var docs = PV.docsOf(entries).slice(0, 40);
  if (!docs.length) { _inboxVerify = null; _inboxVerifyState = ''; return Promise.resolve(null); }
  var dir = _wsFileDir();
  var mode = (document.getElementById('render-mode') || {}).value || 'local';
  var svgs = {}, svgDiffs = {};
  var queue = docs.slice();
  _inboxVerifyState = 'running';

  function finish() {
    var list = PV.judgeAll(entries, {
      svgs: svgs, diffs: _inboxDiffs(docs), svgDiffs: svgDiffs,
    });
    var map = {};
    list.forEach(function(j) { map[j.key2] = j; });
    _inboxVerify = map;
    return list;
  }

  function step() {
    if (!queue.length) {
      _inboxVerifyState = 'done';
      finish();
      return Promise.resolve(true);
    }
    var chunk = queue.splice(0, 10);
    return fetch('/verify-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: dir, types: chunk, mode: mode }),
    }).then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function(res) {
      var results = (res && res.results) || {};
      var SD = window.MA.svgDiffSummary;
      chunk.forEach(function(name) {
        var r = results[name] || { status: 'error' };
        svgs[name] = r;
        // 食い違った図は、ラベルと図形の数まで言う。この 1 行が無いと
        // reviewer は「どこが違うのか」をまた別の入口で調べ直すことになる。
        if (r.status === 'differ-content' && SD && typeof r.pumlText === 'string') {
          svgDiffs[name] = SD.compare(r.pumlText, r.svgLabels, {
            drawnLabels: r.drawnLabels, svgShape: r.svgShape, drawnShape: r.drawnShape,
          });
        }
      });
      return step();
    }, function() {
      // server が答えられなくても「反映済み」とは言わない (未確認のまま出す)。
      chunk.forEach(function(name) { svgs[name] = { status: 'error', error: '確かめられませんでした' }; });
      return step();
    });
  }

  return step().then(function() { return _inboxVerify; }, function() {
    _inboxVerifyState = 'failed';
    finish();
    return _inboxVerify;
  });
}

function _progressEntries() {
  var out = [];
  if (!_inboxProgress) return out;
  Object.keys(_inboxProgress).forEach(function(k) { out.push(_inboxProgress[k]); });
  return out;
}

function _inboxShown() {
  var PI = window.MA.pinInbox;
  if (!PI || !_inboxItems) return [];
  // 受信箱は「まだ直っていない指摘」の箱。対応済み (対応した修正を記録済み) は
  // 既定で落とす。追跡ビューとして「解消も出す」を選んだときだけ残す。
  var list = PI.filter(_inboxItems, {
    unreadOnly: _inboxUnreadOnly(), pendingOnly: !_inboxShowResolved(), excludeAuthor: _inboxMe(),
  });
  if (_inboxShowResolved() || !_inboxProgress) return list;
  // 観測して解消と分かったものも落とす。対応済みの印が押されていなくても、
  // 指摘した行がもう無いなら未対応ではない (押印待ちで箱に残り続けていた)。
  return list.filter(function(p) {
    var e = _progressOf(p);
    if (!(e && e.status === 'resolved')) return true;
    // BLK-reviewer-20260908-1903-wish: puml が直っていても、保存中の SVG が
    // 直す前のままなら依頼は終わっていない。作り直し漏れと分かったものは
    // 解消として落とさず箱に残す (落とすと、再エクスポート漏れは誰も見ない)。
    // SVG がそもそも無い図はここでは残さない。書き出していない保存フォルダで
    // 解消済みの指摘が全部戻ってくると、箱が「まだ直っていない指摘」でなくなる。
    var j = _inboxVerifyOf(p);
    return !!(j && j.svg && j.svg.state === 'differ-content');
  });
}

// 保存フォルダの図を 1 枚ずつ読む。開いているタブは編集中の本文で見る
// (保存前の指摘も受信箱に出す)。1 枚読めなくても残りは集める。
function scanPinInbox() {
  var WS = window.MA.workspace;
  if (!WS) return Promise.resolve([]);
  var dir = _wsFileDir();
  saveActiveDoc();
  var openDocs = {};
  WS.list().forEach(function(d) { openDocs[d.name] = d.dsl; });
  return WS.listFiles(dir).then(function(names) {
    var list = (names || []).slice();
    var docs = [];
    function step(i) {
      if (i >= list.length) return Promise.resolve(docs);
      var name = list[i];
      if (typeof openDocs[name] === 'string') {
        docs.push({ name: name, dsl: openDocs[name] });
        return step(i + 1);
      }
      return WS.loadFile(name, dir).then(function(text) {
        docs.push({ name: name, dsl: text });
        return step(i + 1);
      }, function() { return step(i + 1); });
    }
    return step(0);
  }, function() { return []; }).then(function(docs) {
    // 保存フォルダに無い開いたままの図 (新規タブ) も見る。
    Object.keys(openDocs).forEach(function(n) {
      for (var i = 0; i < docs.length; i++) { if (docs[i].name === n) return; }
      docs.push({ name: n, dsl: openDocs[n] });
    });
    _inboxDocs = docs;
    return window.MA.pinInbox.collect(docs);
  });
}

function renderInboxBadge() {
  var btn = document.getElementById('btn-tab-inbox');
  var PI = window.MA.pinInbox;
  if (!btn || !PI) return null;
  if (!_inboxItems) {
    btn.textContent = '📥 指摘箱 −';
    btn.classList.remove('has-open');
    btn.title = '保存フォルダの図をまたいで、未対応のレビュー指摘を集める';
    return null;
  }
  var sum = PI.summary(_inboxShown());
  btn.textContent = PI.badgeText(sum);
  btn.classList.toggle('has-open', sum.pending > 0);
  btn.title = PI.headText(sum);
  return sum;
}

// 指摘の図を開き、該当行へ飛ぶ。開いていない図は保存フォルダから読む。
function openInboxItem(item) {
  var WS = window.MA.workspace;
  if (!WS || !item) return;
  var panel = document.getElementById('inbox-panel');
  if (panel) panel.classList.remove('open');
  var active = WS.getActive();
  if (!(active && active.name === item.doc)) saveActiveDoc();
  function show() {
    applyActiveDoc();
    renderTabs();
    renderPinBadge();
    if (item.line) jumpToLine(item.line);
  }
  var already = WS.findByName ? WS.findByName(item.doc) : null;
  if (already) { WS.setActive(already.id); show(); return; }
  WS.loadFile(item.doc, _wsFileDir()).then(function(text) {
    if (text == null) return;
    var detected = WS.detectType(text);
    WS.openOrActivate({
      name: item.doc,
      dsl: text,
      diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
    });
    show();
  }, function() { /* 読めない図は開かない。受信箱はそのまま */ });
}

// 受信箱の 1 件に対する応答。受信箱の項目は図名しか持たないので、
// 走査で読んだ図の本文 (_inboxDocs) から引き直す。
function _inboxDsl(doc) {
  var list = _inboxDocs || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].name === doc) return list[i].dsl;
  }
  return '';
}

function _inboxReply(item) {
  var PR = window.MA.pinReply;
  if (!PR || !item) return null;
  return PR.latest(_inboxDsl(item.doc), item.id);
}

function _inboxReplyText(item) {
  var PR = window.MA.pinReply;
  if (!PR || !item) return '';
  return PR.statusText(_inboxDsl(item.doc), item.id);
}

function renderInboxPanel() {
  var panel = document.getElementById('inbox-panel');
  var PI = window.MA.pinInbox;
  if (!panel || !PI) return;
  var esc = window.MA.htmlUtils.escHtml;

  if (_inboxLoading) {
    panel.innerHTML = '<div class="ib-head">保存フォルダの図を読んでいます…</div>';
    return;
  }
  var shown = _inboxShown();
  var sum = PI.summary(shown);
  var html = '<div class="ib-head" data-total="' + sum.total + '" data-open="' + sum.open
    + '" data-docs="' + sum.openDocs + '">' + esc(PI.headText(sum)) + '</div>'
    + '<div class="ib-filter">'
    + '<label><input type="checkbox" id="ib-unread"' + (_inboxUnreadOnly() ? ' checked' : '')
    + '> 未対応だけ</label> '
    + '<label><input type="checkbox" id="ib-resolved"' + (_inboxShowResolved() ? ' checked' : '')
    + '> 解消も出す</label> '
    + '<label>自分 <input id="ib-me" placeholder="junior" value="' + esc(_inboxMe()) + '"></label>'
    + ' <button type="button" id="ib-reload">読み直す</button></div>';

  // 着手状況の帯 (BLK-reviewer-20260908-1603-wish)。指摘そのものではなく
  // 「前回の依頼に手が付いたか」を先に出す。手順 1 はこの 1 行で足りる。
  var PP = window.MA.pinProgress;
  if (PP && _inboxProgress) {
    var psum = PP.summary(_progressEntries());
    html += '<div class="ib-progress" id="ib-progress"'
      + ' data-untouched="' + psum.untouched + '" data-started="' + psum.started + '"'
      + ' data-resolved="' + psum.resolved + '" data-stalled="' + psum.stalled + '">'
      + esc(PP.headText(psum)) + '</div>';
  }

  // 反映の判定の帯 (BLK-reviewer-20260908-1903-wish)。puml と SVG を 1 つの札にした
  // 結果をここで先に言う。手順 8 (前回指摘の反映確認) はこの 1 行で終わる。
  var PV = window.MA.pinVerify;
  if (PV && _inboxVerifyState === 'running') {
    html += '<div class="ib-verify-head" id="ib-verify-head" data-state="running">'
      + 'SVG に反映されたかを確かめています…</div>';
  } else if (PV && _inboxVerify) {
    var vsum = PV.summary(_inboxVerifyList());
    html += '<div class="ib-verify-head" id="ib-verify-head" data-state="' + esc(_inboxVerifyState) + '"'
      + ' data-reflected="' + vsum.reflected + '" data-pumlonly="' + vsum['puml-only'] + '"'
      + ' data-open="' + vsum.open + '" data-unknown="' + vsum.unknown + '">'
      + esc(PV.headText(vsum)) + '</div>';
  }

  // BLK-reviewer-20260908-0003: 手で書いた指摘は audit.js のどの監査にも当たらず、
  // 根拠 (別の図の中身) が消えても「DSL 無変更 → 前回のまま」で引き継がれ続ける。
  // 受信箱を開いた時点で、根拠が崩れたものだけを名指しで先頭に出す。
  var CC = window.MA.claimCheck;
  var cres = CC ? CC.scan(shown, _inboxDocs || []) : null;
  if (cres) {
    html += '<div class="ib-claims" id="ib-claims" data-claims="' + cres.claims.length
      + '" data-broken="' + cres.broken.length + '">'
      + '<div class="ib-claim-head">' + esc(CC.headText(cres)) + '</div>';
    cres.broken.forEach(function(e) {
      html += '<div class="ib-claim-row" data-doc="' + esc(e.item.doc) + '"'
        + ' data-pin-id="' + esc(e.item.id) + '"'
        + ' data-claim-doc="' + esc(e.claim.doc) + '"'
        + ' data-claim-line="' + e.result.line + '">'
        + '<span class="ib-claim-where">' + esc(e.item.doc) + ' #' + esc(e.item.id) + '</span>'
        + '<span class="ib-claim-why">' + esc(CC.describe(e)) + '</span></div>';
    });
    html += '</div>';
  }

  var groups = PI.groupByDoc(shown);
  if (!groups.length) {
    html += '<div class="ib-empty" id="ib-empty">'
      + (_inboxItems ? '未対応の指摘はありません' : '「読み直す」で保存フォルダを走査します') + '</div>';
  }
  groups.forEach(function(g) {
    html += '<div class="ib-group" data-doc="' + esc(g.doc) + '" data-open="' + g.open + '">'
      + '<div class="ib-doc">' + esc(PI.groupText(g)) + '</div>';
    g.items.forEach(function(p) {
      // 直す側の応答を指摘と同じ行に出す (BLK-reviewer-20260908-1303-wish)。
      // これが無いと、reviewer は次の run で図をまたいで全部を確かめ直すことになる。
      var reply = _inboxReply(p);
      var prog = _progressOf(p);
      var jv = _inboxVerifyOf(p);
      html += '<div class="ib-row' + (p.state === 'read' ? ' read' : '') + (p.stale ? ' stale' : '')
        + '" data-doc="' + esc(p.doc) + '" data-pin-id="' + esc(p.id) + '" data-line="' + p.line + '"'
        + ' data-verdict="' + esc(reply ? reply.verdict : '') + '"'
        + (prog ? ' data-progress="' + esc(prog.status) + '" data-passes="' + prog.passes + '"' : '')
        + (jv ? ' data-reflect="' + esc(jv.key) + '" data-svg="' + esc(jv.svg.state) + '"' : '')
        + '>'
        + (jv
          ? '<span class="ib-verify ' + esc(jv.key) + '" title="' + esc(jv.title) + '">'
            + esc(jv.label) + '</span>'
            + '<span class="ib-verify-why">' + esc('puml: ' + jv.puml.text
              + (jv.puml.change ? '（' + jv.puml.change + '）' : '')
              + ' / SVG: ' + jv.svg.text) + '</span>'
          : '')
        + (prog
          ? '<span class="ib-prog ' + esc(prog.status) + '" title="' + esc(prog.title + ' — ' + prog.why) + '">'
            + esc(window.MA.pinProgress.entryText(prog)) + '</span>'
          : '')
        + '<span class="ib-where">' + (p.stale ? '行が見つかりません' : ('L' + p.line)) + '</span> '
        + '<span class="ib-who">' + esc(p.author || '?') + '</span>'
        + '<span class="ib-text">' + esc(p.text) + '</span>'
        + (reply
          ? '<span class="ib-reply">↩ ' + esc(_inboxReplyText(p)) + '</span>'
          : '<span class="ib-reply none">↩ 応答なし</span>')
        + '</div>';
    });
    html += '</div>';
  });
  panel.innerHTML = html;

  var unread = document.getElementById('ib-unread');
  if (unread) {
    unread.addEventListener('change', function() {
      _inboxSetUnreadOnly(unread.checked);
      renderInboxPanel();
      renderInboxBadge();
    });
  }
  var resolvedBox = document.getElementById('ib-resolved');
  if (resolvedBox) {
    resolvedBox.addEventListener('change', function() {
      _inboxSetShowResolved(resolvedBox.checked);
      renderInboxPanel();
      renderInboxBadge();
    });
  }
  var me = document.getElementById('ib-me');
  if (me) {
    me.addEventListener('change', function() {
      _inboxSetMe(me.value.trim());
      renderInboxPanel();
      renderInboxBadge();
    });
  }
  var reload = document.getElementById('ib-reload');
  if (reload) reload.addEventListener('click', function() { loadInbox(); });

  var claimRows = panel.querySelectorAll('.ib-claim-row');
  for (var ci = 0; ci < claimRows.length; ci++) {
    (function(el) {
      el.addEventListener('click', function() {
        openInboxItem({
          doc: el.getAttribute('data-claim-doc'),
          line: Number(el.getAttribute('data-claim-line')) || 1,
        });
      });
    })(claimRows[ci]);
  }

  var rows = panel.querySelectorAll('.ib-row');
  for (var i = 0; i < rows.length; i++) {
    (function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-pin-id');
        var docName = el.getAttribute('data-doc');
        var hit = null;
        shown.forEach(function(p) { if (p.id === id && p.doc === docName) hit = p; });
        if (hit) openInboxItem(hit);
      });
    })(rows[i]);
  }
}

function loadInbox() {
  _inboxLoading = true;
  // 前回の判定はここで捨てる。走査し直したのに古い札が残っていると、
  // 「もう直った」を前の run の材料で言うことになる。
  _inboxVerify = null;
  _inboxVerifyState = '';
  renderInboxPanel();
  return scanPinInbox().then(function(items) {
    _inboxItems = items;
    _inboxLoading = false;
    // 走査のたびに着手状況を付け直す。控えと突き合わせるのはここ 1 か所。
    _inboxTrackProgress();
    renderInboxPanel();
    renderInboxBadge();
    // SVG に出ているかは描き直しが要るので、箱を開いたあとで差し込む。
    return _inboxRunVerify().then(function() {
      renderInboxPanel();
      renderInboxBadge();
      return items;
    }, function() { return items; });
  }, function() {
    _inboxLoading = false;
    _inboxItems = _inboxItems || [];
    renderInboxPanel();
    renderInboxBadge();
  });
}

function setupPinInbox() {
  var btn = document.getElementById('btn-tab-inbox');
  var panel = document.getElementById('inbox-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    panel.classList.add('open');
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    loadInbox();
  });
  panel.addEventListener('click', function(ev) { ev.stopPropagation(); });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') panel.classList.remove('open');
  });
  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    panel.classList.remove('open');
  });
  renderInboxBadge();
}

// ── 手動指摘の台帳 (BLK-reviewer-20260908-0003-wish) ────────────────────────
// audit.js が拾えない、図を読んで初めて気づく類の指摘は `指摘.md` に自然文で書くしか
// なく、次に見るときは全文を読み直していた。読み直しを省くと、もう直っている指摘を
// 引き継ぎ続ける。指摘 1 件を「対象ファイル + 行 + 行の指紋」で憶えておき、
// 開いたときに「未変更のため前回判定を維持」と「要再確認」へ仕分ける。
// 仕分けの規則は src/core/manual-findings.js。ここは走査と画面だけ。

var _mfDocs = null;      // 直近に読んだ {図名: DSL}
var _mfLoading = false;

function _mfList() {
  var MF = window.MA.manualFindings;
  if (!MF) return [];
  return MF.load(_reviewStore(), _wsFileDir());
}

function _mfSave(list) {
  var MF = window.MA.manualFindings;
  if (!MF) return;
  MF.save(_reviewStore(), _wsFileDir(), list);
}

function _mfRows() {
  var MF = window.MA.manualFindings;
  if (!MF) return [];
  return MF.review(_mfList(), _mfDocs || _mfOpenDocs());
}

// 開いているタブは編集中の本文で見る (保存前の直しも仕分けに効く)。
function _mfOpenDocs() {
  var out = {};
  if (!window.MA.workspace) return out;
  saveActiveDoc();
  window.MA.workspace.list().forEach(function(d) { out[d.name] = d.dsl; });
  return out;
}

// 保存フォルダの図を全部読む。指摘の対象は今開いていない図のことが多い。
function scanManualFindings() {
  var WS = window.MA.workspace;
  if (!WS) return Promise.resolve({});
  var dir = _wsFileDir();
  var docs = _mfOpenDocs();
  return WS.listFiles(dir).then(function(names) {
    var list = (names || []).slice();
    function step(i) {
      if (i >= list.length) return Promise.resolve(docs);
      var name = list[i];
      if (typeof docs[name] === 'string') return step(i + 1);
      return WS.loadFile(name, dir).then(function(text) {
        if (typeof text === 'string') docs[name] = text;
        return step(i + 1);
      }, function() { return step(i + 1); });
    }
    return step(0);
  }, function() { return docs; });
}

function renderFindingsBadge() {
  var btn = document.getElementById('btn-tab-findings');
  var MF = window.MA.manualFindings;
  if (!btn || !MF) return null;
  var rows = _mfRows();
  var sum = MF.summary(rows);
  btn.textContent = MF.badgeText(sum);
  btn.classList.toggle('has-recheck', sum.recheck > 0);
  btn.title = MF.headText(sum);
  return sum;
}

// 指摘の図を開いて該当行へ飛ぶ。開いていない図は保存フォルダから読む。
function openFindingRow(row) {
  var WS = window.MA.workspace;
  if (!WS || !row) return;
  var active = WS.getActive();
  if (!(active && active.name === row.doc)) saveActiveDoc();
  function show() {
    applyActiveDoc();
    renderTabs();
    renderPinBadge();
    if (row.line) jumpToLine(row.line);
  }
  var already = WS.findByName ? WS.findByName(row.doc) : null;
  if (already) { WS.setActive(already.id); show(); return; }
  WS.loadFile(row.doc, _wsFileDir()).then(function(text) {
    if (text == null) return;
    var detected = WS.detectType(text);
    WS.openOrActivate({
      name: row.doc, dsl: text,
      diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
    });
    show();
  }, function() { /* 読めない図は開かない。台帳はそのまま */ });
}

function renderFindingsPanel() {
  var panel = document.getElementById('findings-panel');
  var MF = window.MA.manualFindings;
  if (!panel || !MF) return;
  var esc = window.MA.htmlUtils.escHtml;

  if (_mfLoading) {
    panel.innerHTML = '<div class="mf-head">保存フォルダの図を読んでいます…</div>';
    return;
  }
  var rows = _mfRows();
  var sum = MF.summary(rows);
  var target = _pinTargetLine();
  var html = '<div class="mf-head" data-total="' + sum.total + '" data-recheck="' + sum.recheck
    + '" data-keep="' + sum.keep + '">' + esc(MF.headText(sum)) + '</div>'
    + '<div class="mf-bar">'
    + '<input id="mf-text" placeholder="この行への指摘 (例: 対応するリセットフローが無い)">'
    + ' <button type="button" id="mf-add">L' + target + ' に足す</button>'
    + ' <button type="button" id="mf-reload">読み直す</button>'
    + ' <button type="button" id="mf-copy">指摘.md へコピー</button></div>';

  if (!rows.length) {
    html += '<div class="mf-empty" id="mf-empty">'
      + (_mfDocs ? '手動の指摘はまだありません。行を選んで上の欄に書くと台帳に載ります'
                 : '手動の指摘はまだありません。「読み直す」で保存フォルダの図と突き合わせます')
      + '</div>';
  }
  rows.forEach(function(r) {
    html += '<div class="mf-row' + (r.keep ? '' : ' recheck') + '" data-mf-id="' + esc(r.id) + '"'
      + ' data-mf-status="' + esc(r.status) + '" data-mf-keep="' + (r.keep ? '1' : '0') + '"'
      + ' title="' + esc(r.title) + '">'
      + '<span class="mf-mark">' + esc(r.label) + '</span>'
      + '<span class="mf-where">' + esc(r.doc) + (r.line ? (':' + r.line) : ':—') + '</span>'
      + '<span class="mf-id">' + esc(r.id) + '</span>'
      + (r.verdict ? '<span class="mf-verdict">→ ' + esc(r.verdict) + '</span>' : '')
      + '<span class="mf-text">' + esc(r.text) + '</span>'
      + '<span class="mf-acts">'
      + (r.keep ? '' : '<button type="button" data-mf-act="confirm">確認した (今の行で憶え直す)</button>')
      + '<button type="button" data-mf-act="drop">消す</button></span>'
      + '</div>';
  });
  panel.innerHTML = html;

  var add = document.getElementById('mf-add');
  if (add) {
    add.addEventListener('click', function() {
      var input = document.getElementById('mf-text');
      var text = input ? input.value.trim() : '';
      var doc = _activeDocName();
      var line = _pinTargetLine();
      if (!text || !doc || !line) return;
      _mfSave(MF.add(_mfList(), {
        doc: doc, dsl: mmdText, line: line, text: text,
        author: _inboxMe() || 'reviewer', at: new Date().toISOString().slice(0, 16),
        verdict: '未解消',
      }));
      if (_mfDocs) _mfDocs[doc] = mmdText;
      renderFindingsPanel();
      renderFindingsBadge();
    });
  }
  var reload = document.getElementById('mf-reload');
  if (reload) reload.addEventListener('click', function() { loadFindings(); });
  var copy = document.getElementById('mf-copy');
  if (copy) {
    copy.addEventListener('click', function() {
      var text = MF.toMarkdown(rows);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          copy.textContent = 'コピーしました';
        }, function() { copy.textContent = 'コピーできません'; });
      }
    });
  }

  var els = panel.querySelectorAll('.mf-row');
  for (var i = 0; i < els.length; i++) {
    (function(el) {
      var id = el.getAttribute('data-mf-id');
      var row = null;
      rows.forEach(function(r) { if (r.id === id) row = r; });
      el.addEventListener('click', function(ev) {
        var act = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-mf-act') : null;
        if (act === 'drop') {
          _mfSave(MF.remove(_mfList(), id));
          renderFindingsPanel(); renderFindingsBadge(); return;
        }
        if (act === 'confirm' && row) {
          var docs = _mfDocs || _mfOpenDocs();
          _mfSave(MF.confirm(_mfList(), id, docs[row.doc], row.verdict));
          renderFindingsPanel(); renderFindingsBadge(); return;
        }
        if (row) openFindingRow(row);
      });
    })(els[i]);
  }
}

function loadFindings() {
  var MF = window.MA.manualFindings;
  if (!MF) return Promise.resolve({});
  _mfLoading = true;
  renderFindingsPanel();
  return scanManualFindings().then(function(docs) {
    _mfDocs = docs;
    _mfLoading = false;
    // 行が動いただけの指摘は、ここで新しい行番号を憶える (次からは走査せずに当たる)。
    _mfSave(MF.applyMoves(_mfList(), MF.review(_mfList(), docs)));
    renderFindingsPanel();
    renderFindingsBadge();
    return docs;
  }, function() {
    _mfLoading = false;
    renderFindingsPanel();
    renderFindingsBadge();
  });
}

function setupManualFindings() {
  var btn = document.getElementById('btn-tab-findings');
  var panel = document.getElementById('findings-panel');
  if (!btn || !panel || !window.MA.manualFindings) return;
  btn.addEventListener('click', function() {
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    panel.classList.add('open');
    var rect = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, rect.left) + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    loadFindings();
  });
  panel.addEventListener('click', function(ev) { ev.stopPropagation(); });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') panel.classList.remove('open');
  });
  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    panel.classList.remove('open');
  });
  renderFindingsBadge();
}

// ── セット複製 (BLK-junior-20260907-1203-wish) ──────────────────────────────
// 題材替え (GPIO → UART) は 6 図種ぶん、テンプレート作成を図種の数だけ
// 繰り返していた。系統でまとまった 1 セットに対応表を 1 回入れれば 6 枚が
// 一度に揃う。組み立て (どの図がどんな名前で作られるか) は
// src/core/family-clone.js、ここは画面と保存だけ。

var _fcGroups = [];
var _fcExtraPairs = [];

function _fcSelectedGroup() {
  var sel = document.getElementById('fc-set');
  if (!sel) return null;
  for (var i = 0; i < _fcGroups.length; i++) {
    if (_fcGroups[i].key === sel.value) return _fcGroups[i];
  }
  return _fcGroups[0] || null;
}

function _fcPairs() {
  var from = (document.getElementById('fc-from') || {}).value || '';
  var to = (document.getElementById('fc-to') || {}).value || '';
  var pairs = [{ from: from.trim(), to: to.trim() }];
  _fcExtraPairs.forEach(function(p, i) {
    var el = document.getElementById('fc-extra-' + i);
    pairs.push({ from: p.from, to: el ? el.value.trim() : '' });
  });
  return pairs;
}

function _fcPlan() {
  var FC = window.MA.familyClone;
  return FC ? FC.plan(_fcSelectedGroup(), _fcPairs(), _fcExistingNames()) : null;
}

function _fcExistingNames() {
  var names = (window.MA.workspace ? window.MA.workspace.list() : []).map(function(d) { return d.name; });
  return names.concat(_fcFiles || []);
}

var _fcFiles = [];

// セットの元になる図。開いているタブと、保存フォルダから読み込んだ図の両方。
var _fcFileDocs = [];

function _fcSourceDocs() {
  var open = window.MA.workspace ? window.MA.workspace.list() : [];
  var byName = {};
  var out = [];
  open.forEach(function(d) {
    byName[String(d.name).replace(/\.puml$/i, '').toLowerCase()] = true;
    out.push(d);
  });
  _fcFileDocs.forEach(function(d) {
    var k = String(d.name).replace(/\.puml$/i, '').toLowerCase();
    if (byName[k]) return;   // タブで開いている図が正 (打ちかけの内容を使う)
    out.push(d);
  });
  return out;
}

// ── 題材プリセット (BLK-junior-20260907-1303-wish) ─────────────────────────
// セットを 1 度登録しておけば、次の題材からは「プリセットを選ぶ → 題材名を打つ →
// 生成」の 3 操作で一式が揃う。元の図をタブに開く必要も、置換元を打ち直す必要も無い。
// 何がどう置き換わるかは src/core/subject-preset.js、ここは画面と保存だけ。

function _spSelected() {
  var SP = window.MA.subjectPreset;
  var sel = document.getElementById('sp-preset');
  if (!SP || !sel || !sel.value) return null;
  return SP.load(null, sel.value);
}

function _spSubject() {
  var el = document.getElementById('sp-subject');
  return el ? el.value.trim() : '';
}

function _spPlan() {
  var SP = window.MA.subjectPreset;
  var preset = _spSelected();
  return (SP && preset) ? SP.plan(preset, _spSubject(), _fcExistingNames()) : null;
}

function _spBlockHtml(s) {
  var SP = window.MA.subjectPreset;
  if (!SP) return '';
  var esc = s.esc;
  var presets = SP.list(null);
  var keepName = (document.getElementById('sp-preset') || {}).value || '';
  var keepSubject = (document.getElementById('sp-subject') || {}).value || '';

  var html = '<div id="sp-block" style="border:1px solid var(--border);border-radius:4px;padding:8px 10px;margin-top:8px;">'
    + '<div style="font-size:11px;color:var(--text-secondary);">'
    + '<b style="color:var(--text-primary);">題材プリセット</b> — 登録済みのセットなら、題材名を打つだけで一式が作れます'
    + ' (元の図を開く必要はありません)。</div>';

  if (!presets.length) {
    html += '<div id="sp-empty" style="font-size:11px;color:var(--text-secondary);margin-top:6px;">'
      + 'まだプリセットがありません。下でセットを 1 度作ってから「このセットをプリセットに登録」を押すと、'
      + '次の題材からここで選べます。</div></div>';
    return html;
  }

  var preset = null;
  presets.forEach(function(p) { if (p.name === keepName) preset = p; });
  if (!preset) preset = presets[0];

  html += '<div style="display:flex;gap:10px;align-items:flex-end;margin-top:2px;">'
    + '<div style="flex:2;"><label style="' + s.LABEL + '" for="sp-preset">プリセット</label>'
    + '<select id="sp-preset" style="' + s.FIELD + '">';
  presets.forEach(function(p) {
    html += '<option value="' + esc(p.name) + '"' + (p.name === preset.name ? ' selected' : '') + '>'
      + esc(SP.describe(p)) + '</option>';
  });
  html += '</select></div>'
    + '<div style="flex:1;"><label style="' + s.LABEL + '" for="sp-subject">新しい題材名</label>'
    + '<input id="sp-subject" style="' + s.FIELD + '" autocomplete="off" spellcheck="false" placeholder="I2c" value="'
    + esc(keepSubject) + '"></div>'
    + '</div>';

  var plan = _spPlan();
  var conflicts = SP.conflicts(preset, _spSubject(), _fcExistingNames());
  html += '<div id="sp-plan" style="font-size:11px;color:var(--text-secondary);margin-top:6px;"'
    + ' data-docs="' + ((plan && plan.docs) || 0) + '">'
    + esc(((plan && plan.items) || []).map(function(it) { return it.name; }).join(' ・ ')) + '</div>';
  // 同じ題材で既に作ってあると名前に連番が付く。黙って 2 セット目を作らせない。
  if (conflicts.length) {
    html += '<div id="sp-renamed" style="font-size:11px;color:var(--accent-red);margin-top:2px;">'
      + 'この題材の図は既にあります (' + esc(conflicts.join(' ・ ')) + ')。作ると別名でもう 1 セット増えます</div>';
  }
  html += '<div id="sp-summary" style="font-size:11px;color:var(--text-secondary);margin-top:4px;"'
    + ' data-ready="' + (plan && plan.ready ? '1' : '0') + '">' + esc(SP.summaryText(plan)) + '</div>'
    + '<div style="margin-top:6px;">'
    + '<button id="btn-sp-create" style="' + s.BTN + '"' + (plan && plan.ready ? '' : ' disabled') + '>'
    + 'この題材で一式を作る</button>'
    + '<button id="btn-sp-delete" style="' + s.BTN + '">このプリセットを削除</button>'
    + '</div></div>';
  return html;
}

function _spBind() {
  var sel = document.getElementById('sp-preset');
  if (sel) sel.addEventListener('change', renderFamilyClone);
  var sub = document.getElementById('sp-subject');
  if (sub) {
    sub.addEventListener('input', function() {
      renderFamilyClone();
      // 再描画で作り直した入力欄にカーソルを戻す (1 文字ごとに外れないように)。
      var el = document.getElementById('sp-subject');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }
  var create = document.getElementById('btn-sp-create');
  if (create) create.addEventListener('click', createFromSubjectPreset);
  var del = document.getElementById('btn-sp-delete');
  if (del) del.addEventListener('click', function() {
    var s = document.getElementById('sp-preset');
    if (!s || !s.value) return;
    if (!confirm('プリセット「' + s.value + '」を削除しますか。')) return;
    window.MA.subjectPreset.remove(null, s.value);
    renderFamilyClone();
  });
  var save = document.getElementById('btn-fc-save-preset');
  if (save) save.addEventListener('click', saveSubjectPreset);
}

// 今 fc 側で選んでいるセットと置換元を、そのままプリセットにする。
// 名前はセット名を既定にして、その場で直せるようにする。
function saveSubjectPreset() {
  var SP = window.MA.subjectPreset;
  var FC = window.MA.familyClone;
  var group = _fcSelectedGroup();
  if (!SP || !FC || !group) return;
  var from = (document.getElementById('fc-from') || {}).value || FC.suggestFrom(group);
  var name = prompt('プリセット名', FC.groupLabel(group));
  if (name == null) return;
  var preset = SP.fromGroup(group, from, name);
  var err = SP.validate(preset);
  if (err) { alert(err); return; }
  try {
    SP.save(null, preset);
  } catch (e) {
    alert(e.message);
    return;
  }
  var sel = document.getElementById('sp-preset');
  if (sel) sel.value = preset.name;
  renderFamilyClone();
  var s2 = document.getElementById('sp-preset');
  if (s2) s2.value = preset.name;
  renderFamilyClone();
}

function createFromSubjectPreset() {
  var plan = _spPlan();
  if (!plan || !plan.ready) return;
  saveActiveDoc();
  plan.items.forEach(function(it) {
    var detected = window.MA.workspace.detectType(it.dsl);
    var type = (it.diagramType && modules[it.diagramType])
      ? it.diagramType
      : ((detected && modules[detected]) ? detected : currentDiagramType);
    window.MA.workspace.open({ name: it.name, dsl: it.dsl, diagramType: type });
    applyActiveDoc();
    saveActiveDoc();
  });
  closeFamilyClone();
}

function renderFamilyClone() {
  var content = document.getElementById('fc-modal-content');
  var FC = window.MA.familyClone;
  if (!content || !FC) return;
  var esc = window.MA.htmlUtils.escHtml;
  var LABEL = 'display:block;font-size:10px;color:var(--text-secondary);margin:8px 0 2px 0;';
  var FIELD = 'width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:5px;font-size:12px;';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:5px 12px;font-size:12px;margin-right:6px;';
  var CELL = 'padding:3px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-primary);';

  var group = _fcSelectedGroup();
  var plan = _fcPlan();

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">セットごとまとめて題材を替える</h3>'
    + _spBlockHtml({ LABEL: LABEL, FIELD: FIELD, BTN: BTN, esc: esc })
    + '<div style="font-size:11px;color:var(--text-secondary);margin-top:14px;">'
    + '登録がまだのセットは、下で 1 度作ってから「プリセットに登録」を押してください。'
    + '同じ系統の図をまとめて 1 セットとして選び、対応表を 1 回入れると、そのセットの図が全部 '
    + '新しいタブに揃います。図種ごとにテンプレートを作り直す必要はありません。</div>'
    + '<label style="' + LABEL + '" for="fc-set">セット (図の名前の頭でまとめています)</label>'
    + '<select id="fc-set" style="' + FIELD + '">';
  _fcGroups.forEach(function(g) {
    html += '<option value="' + esc(g.key) + '"' + (group && g.key === group.key ? ' selected' : '') + '>'
      + esc(FC.groupLabel(g)) + '</option>';
  });
  html += '</select>';

  if (group) {
    html += '<div id="fc-members" style="font-size:11px;color:var(--text-secondary);margin-top:4px;">'
      + group.docs.map(function(d) { return esc(String(d.name).replace(/\.puml$/i, '')); }).join(' ・ ')
      + '</div>';
  }

  html += '<div style="display:flex;gap:10px;">'
    + '<div style="flex:1;"><label style="' + LABEL + '" for="fc-from">置換元 (今の題材)</label>'
    + '<input id="fc-from" style="' + FIELD + '" autocomplete="off" spellcheck="false" value="'
    + esc((document.getElementById('fc-from') || {}).value || (group ? FC.suggestFrom(group) : '')) + '"></div>'
    + '<div style="flex:1;"><label style="' + LABEL + '" for="fc-to">置換先 (新しい題材)</label>'
    + '<input id="fc-to" style="' + FIELD + '" autocomplete="off" spellcheck="false" placeholder="Uart" value="'
    + esc((document.getElementById('fc-to') || {}).value || '') + '"></div>'
    + '</div>';

  // 1 組目で消えなかった宣言名は、ここで 1 個ずつ引き取らせる。
  if (_fcExtraPairs.length) {
    html += '<label style="' + LABEL + '">まだ元の系統の名前が残っています</label>'
      + '<table id="fc-extra" style="border-collapse:collapse;width:100%;">';
    _fcExtraPairs.forEach(function(p, i) {
      html += '<tr><td style="' + CELL + 'width:45%;">' + esc(p.from) + '</td>'
        + '<td style="' + CELL + '"><input id="fc-extra-' + i + '" data-from="' + esc(p.from) + '" style="'
        + FIELD + '" value="' + esc(p.to || '') + '"></td></tr>';
    });
    html += '</table>';
  }

  html += '<label style="' + LABEL + '">作られる図</label>'
    + '<table id="fc-plan" style="border-collapse:collapse;width:100%;">';
  ((plan && plan.items) || []).forEach(function(it) {
    html += '<tr class="fc-plan-row" data-name="' + esc(it.name) + '" data-changed="' + it.changed + '">'
      + '<td style="' + CELL + 'color:var(--text-secondary);">' + esc(it.sourceName) + '</td>'
      + '<td style="' + CELL + 'color:var(--text-secondary);">→</td>'
      + '<td style="' + CELL + '">' + esc(it.name) + '</td>'
      + '<td style="' + CELL + 'color:' + (it.changed ? 'var(--text-secondary)' : 'var(--accent-red)') + ';">'
      + (it.changed ? (it.changed + ' 行') : '変わらない') + '</td></tr>';
  });
  html += '</table>';

  html += '<div id="fc-summary" style="font-size:11px;color:var(--text-secondary);margin-top:8px;"'
    + ' data-ready="' + (plan && plan.ready ? '1' : '0') + '"'
    + ' data-docs="' + ((plan && plan.docs) || 0) + '">'
    + esc(FC.summaryText(plan)) + '</div>'
    + '<div style="margin-top:10px;">'
    + '<button id="btn-fc-create" style="' + BTN + '"' + (plan && plan.ready ? '' : ' disabled') + '>'
    + 'セットをまとめて作る</button>'
    + '<button id="btn-fc-open" style="' + BTN + '">このセットを全部開く</button>'
    + '<button id="btn-fc-save-preset" style="' + BTN + '">このセットをプリセットに登録</button>'
    + '<button id="btn-fc-cancel" style="' + BTN + '">キャンセル</button>'
    + '</div>';

  content.innerHTML = html;
  _spBind();

  document.getElementById('fc-set').addEventListener('change', function() {
    var f = document.getElementById('fc-from');
    var g = _fcSelectedGroup();
    if (f && g) f.value = FC.suggestFrom(g);
    _fcExtraPairs = [];
    renderFamilyClone();
  });
  ['fc-from', 'fc-to'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function() {
      _fcSyncExtraPairs();
      renderFamilyClone();
    });
  });
  _fcExtraPairs.forEach(function(p, i) {
    var el = document.getElementById('fc-extra-' + i);
    if (!el) return;
    el.addEventListener('input', function() {
      _fcExtraPairs[i].to = el.value;
      var plan2 = _fcPlan();
      var sum = document.getElementById('fc-summary');
      var btn = document.getElementById('btn-fc-create');
      if (sum) {
        sum.textContent = FC.summaryText(plan2);
        sum.setAttribute('data-ready', plan2 && plan2.ready ? '1' : '0');
      }
      if (btn) btn.disabled = !(plan2 && plan2.ready);
    });
  });
  document.getElementById('btn-fc-create').addEventListener('click', createFamilyClone);
  document.getElementById('btn-fc-open').addEventListener('click', openFamilySet);
  document.getElementById('btn-fc-cancel').addEventListener('click', closeFamilyClone);
}

// 1 組目を当てても残る宣言名を、対応表の行として持ち直す。
// 既に打った置換先は保つ (打ち直させない)。
function _fcSyncExtraPairs() {
  var FC = window.MA.familyClone;
  if (!FC) return;
  var kept = {};
  _fcExtraPairs.forEach(function(p) {
    var el = document.getElementById('fc-extra-' + _fcExtraPairs.indexOf(p));
    kept[p.from] = el ? el.value : p.to;
  });
  var from = (document.getElementById('fc-from') || {}).value || '';
  var to = (document.getElementById('fc-to') || {}).value || '';
  var base = FC.plan(_fcSelectedGroup(), [{ from: from.trim(), to: to.trim() }], _fcExistingNames());
  _fcExtraPairs = FC.remainingNames(base).map(function(n) {
    return { from: n, to: kept[n] || '' };
  });
}

function createFamilyClone() {
  var plan = _fcPlan();
  if (!plan || !plan.ready) return;
  saveActiveDoc();
  plan.items.forEach(function(it) {
    // 図種は元の図のものを使う。複製は構成をそのまま写したものなので、
    // 本文からの推測 (actor を含むシーケンスがユースケースに見える等) より確かである。
    var detected = window.MA.workspace.detectType(it.dsl);
    var type = (it.diagramType && modules[it.diagramType])
      ? it.diagramType
      : ((detected && modules[detected]) ? detected : currentDiagramType);
    window.MA.workspace.open({ name: it.name, dsl: it.dsl, diagramType: type });
    applyActiveDoc();
    // 作った直後に保存フォルダへ書き出す (テンプレート作成と同じ作法)。
    saveActiveDoc();
  });
  closeFamilyClone();
}

// セット単位で開く。まだタブに無い図だけをタブに足す
// (レビューで先輩の図と突き合わせるとき、1 枚ずつ探し出さずに済む)。
function openFamilySet() {
  var group = _fcSelectedGroup();
  if (!group) return;
  saveActiveDoc();
  group.docs.forEach(function(d) {
    window.MA.workspace.openOrActivate({
      name: String(d.name).replace(/\.puml$/i, ''),
      dsl: d.dsl,
      diagramType: d.diagramType,
    });
    applyActiveDoc();
  });
  closeFamilyClone();
}

function closeFamilyClone() {
  var modal = document.getElementById('fc-modal');
  if (modal) modal.style.display = 'none';
}

function setupFamilyClone() {
  var btn = document.getElementById('btn-tab-set');
  var modal = document.getElementById('fc-modal');
  if (!btn || !modal) return;
  btn.addEventListener('click', function() {
    saveActiveDoc();
    _fcExtraPairs = [];
    _fcFileDocs = [];
    _fcFiles = [];
    _fcGroups = window.MA.familyClone.groups(_fcSourceDocs());
    renderFamilyClone();
    modal.style.display = 'flex';
    // 保存フォルダの図もセットに入れる (先輩が保存した図がセットの主な出所)。
    window.MA.workspace.listFiles(_wsFileDir()).then(function(list) {
      var names = (list || []).filter(function(n) { return n; });
      _fcFiles = names;
      return Promise.all(names.map(function(n) {
        return window.MA.workspace.loadFile(n, _wsFileDir()).then(function(text) {
          if (!text) return null;
          return { id: 'file:' + n, name: n, dsl: text, diagramType: window.MA.workspace.detectType(text) };
        }).catch(function() { return null; });
      }));
    }).then(function(docs) {
      if (!docs || modal.style.display === 'none') return;
      _fcFileDocs = docs.filter(function(d) { return d && d.dsl; });
      var keep = (document.getElementById('fc-set') || {}).value;
      _fcGroups = window.MA.familyClone.groups(_fcSourceDocs());
      renderFamilyClone();
      var sel = document.getElementById('fc-set');
      if (sel && keep) {
        sel.value = keep;
        renderFamilyClone();
      }
    }).catch(function() { /* 保存フォルダが無くてもタブの図だけでセットは作れる */ });
  });
  modal.addEventListener('click', function(ev) {
    if (ev.target === modal) closeFamilyClone();
  });
}

// ── Render pipeline ────────────────────────────────────────────────────────
function scheduleRefresh() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(refresh, RENDER_DEBOUNCE_MS);
}

function refresh() {
  updateLineNumbers();
  updateUndoRedoButtons();
  // 構造タブを開いたまま DSL が変わったら (エディタ・行編集・一括追加・タブ切替)
  // 一覧も追随させる。開いていないときは組み立てない。
  if (_outlineTab === 'outline') renderOutline();
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
  var mod = detectedType ? modules[detectedType] : null;
  if (mod) currentModule = mod;

  try {
    currentParsed = currentModule.parse(mmdText);
    statusParseEl.textContent = 'パース OK';
    statusParseEl.classList.remove('error');
  } catch (e) {
    statusParseEl.textContent = 'パース NG · ' + e.message;
    statusParseEl.classList.add('error');
    currentParsed = { meta: {}, elements: [], relations: [], groups: [] };
  }
  // design 1a/4a/4b/4c: 下端で何を数えるかは図種で変わる (3 classes · 2 relations /
  // 3 actions · 1 branch / 2 states · 4 transitions)。Activity / State のパーサは
  // elements / relations を持たないので、モジュールの戻り値を直接数えると
  // どちらも常に 0 になっていた。構造タブと同じ outline.countLabel で数えて、
  // 同じ図の 2 か所に違う数が出ないようにする。
  statusInfoEl.textContent = window.MA.outline.countLabel(
    window.MA.outline.build(mmdText).counts,
    detectedType || currentDiagramType);

  renderProps(currentParsed);
  syncStateTable();
  renderSvg();
}

// ── 図の設定タブ (BLK-primary-20260907-0703) ───────────────────────────────
// 色・文字サイズ・テーマ・タイトルを変える経路が DSL の手書きしか無かった。
// 右パネルに常設のタブを置き、選ぶとその場で DSL 先頭に skinparam / title が
// 書き込まれ、書き込まれる行も同じ画面に出す。
var dsSettings = null;

// ── ドメイン宣言 (BLK-reviewer-20260909-0703-wish) ──────────────────────────
// 図の設定に置く「隣のフォルダの同名ドメインと同一 / 別物」の宣言欄。
// 書くのは domain-verdict の印 1 行だけで、名前の置換や title の書き換えはしない
// (それは突合の画面で差分を見ながら決めること)。宣言は手順 4 / 4.7 の突合が読む。

// 隣のフォルダ名の候補。覗きの一覧をまだ取っていなければ 1 回だけ取りに行き、
// 取れたら描き直す (取れなくても欄は使える — 手で打てる)。
var _dsPeekFetched = false;

function _dsOtherFolders() {
  var PF = window.MA.peekFolder;
  var mine = _myPeekDir();
  return (_peekDirs || []).filter(function(d) {
    return d && d.path && !(PF && PF.samePath(d.path, mine));
  }).map(function(d) { return window.MA.domainCohort ? window.MA.domainCohort.baseOf(d.path) : d.path; });
}

function _dsEnsurePeekDirs() {
  if (_dsPeekFetched || (_peekDirs && _peekDirs.length)) return;
  _dsPeekFetched = true;
  var PF = window.MA.peekFolder;
  if (!PF || !window.fetch) return;
  fetch('/peek-dirs?dir=' + encodeURIComponent(_wsFileDir()))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (!data) return;
      _peekDirs = PF.choices(data);
      renderDiagramSettings(true);
    }).catch(function() {});
}

function _dsSetDsl(next) {
  if (next === mmdText) return;
  if (window.MA.history) window.MA.history.pushHistory();
  mmdText = next;
  suppressSync = true;
  editorEl.value = next;
  suppressSync = false;
  scheduleRefresh();
}

function dsVerdictGroup(group) {
  var DV = window.MA.domainVerdict;
  var DC = window.MA.domainCohort;
  if (!DV || !DC) return;
  _dsEnsurePeekDirs();
  var g = group('ドメイン宣言 / Domain verdict');
  g.id = 'ds-verdict-group';
  var domain = DC.domainOf(_dsActiveDocName());

  var marks = DV.listMarks(mmdText);
  var list = document.createElement('div');
  list.id = 'ds-verdict-list';
  list.className = 'ds-note';
  if (!marks.length) {
    list.textContent = 'まだ宣言していません (突合では「これから判断するもの」として出ます)';
  } else {
    marks.forEach(function(m) {
      var row = document.createElement('div');
      row.className = 'ds-row';
      row.setAttribute('data-verdict-other', m.other);
      var text = document.createElement('span');
      text.textContent = DV.markText(m);
      row.appendChild(text);
      var off = document.createElement('button');
      off.type = 'button';
      off.className = 'ds-choice';
      off.textContent = '解除';
      off.title = m.other + ' についての宣言を消す';
      off.addEventListener('click', function() {
        _dsSetDsl(DV.removeMark(mmdText, m.other));
        renderDiagramSettings(true);
      });
      row.appendChild(off);
      list.appendChild(row);
    });
  }
  g.appendChild(list);

  var others = _dsOtherFolders();
  var pick = document.createElement('input');
  pick.type = 'text';
  pick.id = 'ds-verdict-folder';
  pick.placeholder = '相手のフォルダ名 (例: junior)';
  pick.setAttribute('list', 'ds-verdict-folders');
  if (others.length === 1) pick.value = others[0];
  g.appendChild(pick);
  var dl = document.createElement('datalist');
  dl.id = 'ds-verdict-folders';
  others.forEach(function(f) {
    var o = document.createElement('option');
    o.value = f;
    dl.appendChild(o);
  });
  g.appendChild(dl);

  var note = document.createElement('div');
  note.id = 'ds-verdict-note';
  note.className = 'ds-note';
  note.textContent = domain ? 'このドメイン: ' + domain : 'ドメイン名が図名から決まりません';
  var row = document.createElement('div');
  row.className = 'ds-row';
  [
    { kind: 'shared', label: '同一ドメイン', hint: '同じものを指している。名前の食い違いは直すべき指摘' },
    { kind: 'separate', label: '別ドメイン', hint: '名前が同じだけの別物。突合は以後この組を出さない' },
  ].forEach(function(spec) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ds-choice';
    b.id = 'ds-verdict-' + spec.kind;
    b.textContent = spec.label;
    b.title = spec.hint;
    b.addEventListener('click', function() {
      var folder = (pick.value || '').trim();
      if (!folder) { note.textContent = '相手のフォルダ名を入れてください'; return; }
      _dsSetDsl(DV.applyMark(mmdText, spec.kind, domain, folder));
      note.textContent = folder + ' とは' + (spec.kind === 'shared' ? '同一' : '別')
        + 'ドメインと宣言しました (突合がこの宣言を読みます)';
      var msg = note.textContent;
      renderDiagramSettings(true);
      var after = document.getElementById('ds-verdict-note');
      if (after) after.textContent = msg;
    });
    row.appendChild(b);
  });
  g.appendChild(row);
  g.appendChild(note);
}

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
// BLK-junior-20260908-1603。名前を変えると、前の名前のファイルは保存フォルダに
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

  // 前の名前で既にファイルが書かれているか。保存フォルダを使っていないなら
  // 残るファイルも無い。
  var cfg = null;
  try { cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null; } catch (e) { cfg = null; }
  var saved = !!(cfg && cfg.backend === 'file');
  var VT = window.MA.versionTimeline;
  var version = (RG && VT && saved) ? RG.previousVersion(VT.historyOf(from), mmdText) : null;

  if (window.MA.reviewDesk) {
    try { window.MA.reviewDesk.renameBaseline(from, to); } catch (e) {}
  }
  var id = ws.getActiveId();
  ws.rename(id, to);
  var name = _dsActiveDocName();
  var note = RG ? RG.notice({ from: from, to: name, saved: saved, version: version }) : null;
  _dsRenameNotice = note
    ? { text: note.text, canRestore: note.canRestore, from: from, dsl: version ? version.dsl : '' }
    : null;
  renderTabs();
  renderDiagramSettings(true);
  return name;
}

// ── 図名とタイトルの末尾を連動させる ───────────────────────────────────────
// BLK-junior-20260909-0003: 手順4「タイトルの末尾に (資料用) を付け足して保存」は、
// 「タイトル / Title」と「図名 / File name」を別々に書き換える作業になっていた。
// 片方だけ直すとファイル名と図の見出しがずれる。末尾を足した / 外しただけの編集は
// もう片方にも同じことをして、何をしたかを欄の下に書く (黙って書き換えない)。
var _dsLinkNotice = '';

// BLK-junior-20260909-0103: 図名が新規タブの既定名 (diagram2_sequence-3 など) のままなら、
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
  // BLK-junior-20260909-0003: 欄の change から再描画が入れ子で走ると、先に消えた
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
  // BLK-junior-20260908-1603: 台本の「タイトルの末尾に付け足す」を DSL の title 行の
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
  // 連動したことの知らせ (BLK-junior-20260909-0003)。
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

  // ドメイン宣言 / Domain verdict (BLK-reviewer-20260909-0703-wish)
  // 「この図は隣のフォルダの同名ドメインと同一か別物か」は、これまで突合の画面まで
  // 行かないと決められず、決めた印は DSL のコメント行の手書き規約だった。reviewer は
  // 突合が出した食い違い 1 件ごとに「もう判断済みか」を grep で確かめ直していた。
  // 図を開いたまま宣言でき、宣言済みの組は突合が最初から外す。
  dsVerdictGroup(group);

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

  // BLK-builder-20260907-1248-2 (design 5b の網羅表): メッセージの通し番号。
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
    numHint.textContent = an.on ? AN.fmtLine(an.start, an.step) : '(番号なし)';
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
// キーボードで選択を移している最中かどうか。design 5a の「選んだ行へ飛ぶ」は
// 図をクリックした場面のために textarea へ focus を移すが、↑↓ などキー操作で
// 選択が動いた場面で同じことをすると、次の 1 打が textarea に吸われて
// FEAT-012 / FEAT-109 の連打も Esc の選択解除も効かなくなる。
// キー由来の選択変更ではスクロールと行のハイライトだけ行い、focus は移さない。
var _kbdNavSelect = false;
function kbdSetSelected(items) {
  _kbdNavSelect = true;
  try { window.MA.selection.setSelected(items); }
  finally { _kbdNavSelect = false; }
}

function jumpEditorToSelection(sel) {
  var EJ = window.MA.editorJump;
  if (!EJ || !editorEl) return;
  if (currentEditorPrefs && currentEditorPrefs.clickToLine === false) return;
  if (_outlineTab && _outlineTab !== 'dsl') return;
  var line = EJ.targetLine(sel);
  if (line === null) return;
  var range = EJ.lineRange(editorEl.value, line);
  if (!range) return;
  var style = window.getComputedStyle(editorEl);
  var lineHeight = parseFloat(style.lineHeight);
  if (!isFinite(lineHeight)) lineHeight = (parseFloat(style.fontSize) || 13) * 1.5;
  editorEl.scrollTop = EJ.scrollTopFor(range.line, {
    lineHeight: lineHeight,
    viewportHeight: editorEl.clientHeight,
    scrollTop: editorEl.scrollTop,
  });
  // 行を選択状態にして、どこへ来たのかを見えるようにする。focus を奪うのは
  // クリック元が図 (textarea の外) のときだけなので、入力中の邪魔にはならない。
  try {
    if (!_kbdNavSelect) editorEl.focus({ preventScroll: true });
    editorEl.setSelectionRange(range.start, range.end);
  } catch (e) {}
  updateLineNumbers();
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

function renderProps(parsed) {
  if (!parsed) parsed = currentParsed;
  var sel = window.MA.selection.getSelected();
  updatePropsTabLabel(sel);
  currentModule.renderProps(sel, parsed, propsEl, {
    getMmdText: function() { return mmdText; },
    setMmdText: function(s) {
      mmdText = s;
      suppressSync = true;
      editorEl.value = s;
      suppressSync = false;
      // Re-parse synchronously so any setSelected() that fires right
      // after sees the updated structure. Without this, currentParsed
      // stayed stale until the async refresh tick and caused selection
      // look-ups to hit wrong elements (cross-ported from MermaidAssist
      // PR #1 commit a4e8410).
      if (currentModule && currentModule.parse) {
        try { currentParsed = currentModule.parse(mmdText); } catch (e) { /* leave stale */ }
      }
    },
    onUpdate: function() { scheduleRefresh(); },
  });
}

// design 5a: 描画エラーの出し方。「図の上に重ねて表示」が入っていれば
// 直前の図を残して帯だけ重ね、外れていれば従来どおり図をエラー 1 行に差し替える。
function showRenderError(message) {
  var banner = document.getElementById('render-error-overlay');
  var text = 'Render error: ' + message;
  if (!currentErrorOverlay || !banner || !previewSvgEl.querySelector('svg')) {
    if (banner) { banner.hidden = true; banner.textContent = ''; }
    previewSvgEl.innerHTML = '<p style="color:var(--accent-red);padding:20px;white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;">' +
      window.MA.htmlUtils.escHtml(text) + '</p>';
    return;
  }
  banner.textContent = text;
  banner.hidden = false;
}

function clearRenderError() {
  var banner = document.getElementById('render-error-overlay');
  if (banner) { banner.hidden = true; banner.textContent = ''; }
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
  fetch('/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: mmdText, mode: mode }),
  }).then(function(resp) {
    var contentType = resp.headers.get('Content-Type') || '';
    if (!resp.ok) {
      return resp.json().then(function(err) { throw new Error(err.error || ('HTTP ' + resp.status)); });
    }
    if (contentType.indexOf('image/svg') < 0) {
      throw new Error('Unexpected content type: ' + contentType);
    }
    return resp.text();
  }).then(function(svg) {
    if (myGen !== renderGen) return;  // stale response \u2014 a newer renderSvg() superseded this one
    // design 5a: PlantUML \u306f\u6587\u6cd5\u30a8\u30e9\u30fc\u3067\u3082 200 + SVG \u3092\u8fd4\u3059\u3002\u305d\u306e\u307e\u307e\u6d41\u3057\u8fbc\u3080\u3068
    // \u76f4\u524d\u307e\u3067\u898b\u3048\u3066\u3044\u305f\u56f3\u304c\u300cSyntax Error?\u300d\u306e\u7d75\u306b\u4e38\u3054\u3068\u7f6e\u304d\u63db\u308f\u308b\u306e\u3067\u3001
    // \u3053\u3053\u3067\u62fe\u3063\u3066\u63cf\u753b\u30a8\u30e9\u30fc\u6271\u3044\u306b\u3057\u3001\u76f4\u524d\u306e\u56f3\u3092\u6b8b\u3057\u305f\u307e\u307e\u5e2f\u3060\u3051\u3092\u91cd\u306d\u308b\u3002
    var errInfo = window.MA.renderError.detect(svg);
    if (errInfo.isError) throw new Error(window.MA.renderError.describe(errInfo));
    clearRenderError();
    previewSvgEl.innerHTML = svg;
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
    if (warnEl) { warnEl.style.display = 'none'; warnEl.textContent = ''; }
    if (svgEl && currentModule && currentModule.buildOverlay) {
      var report = currentModule.buildOverlay(svgEl, currentParsed, overlayEl);
      if (report && warnEl) {
        var u = report.unmatched || {};
        var totalUnmatched = (u.participant || 0) + (u.message || 0) + (u.note || 0) + (u.activation || 0);
        if (totalUnmatched > 0) {
          warnEl.style.display = 'block';
          warnEl.textContent = '\u26A0 Overlay \u30DE\u30C3\u30C1\u30F3\u30B0\u5931\u6557: ' + JSON.stringify(u) + ' \u3002\u30EA\u30B9\u30C8\u4E00\u89A7\u304B\u3089\u7DE8\u96C6\u3057\u3066\u304F\u3060\u3055\u3044\u3002';
        }
      }
      if (moduleHas('overlaySelection')) {
        var sel = window.MA.selection.getSelected() || [];
        window.MA.selectionRouter.applyHighlight(overlayEl, sel);
      }
      // BLK-reviewer-20260907-1203-wish: 指摘の付いた行に印を置く。
      try { drawPinMarkers(overlayEl); } catch (e) {}
      // BLK-primary-20260908-1603: overlay は描画のたびに作り直されるので、
      // 今のキャレット行の対応表示を引き直す (再描画で peek が消えたままにしない)。
      try { refreshLinePeek(); } catch (e) {}
    }
    renderStatusEl.textContent = 'OK (' + mode + ')';
    var took = elapsed();
    _renderTimings[mode] = took;   // design 5a: 設定画面での速度比較に使う
    updateTopRenderStatus('ok', took);
  }).catch(function(err) {
    if (myGen !== renderGen) return;  // stale failure — ignore
    showRenderError(err.message || err);
    renderStatusEl.textContent = 'ERROR';
    renderStatusEl.classList.add('error');
    updateTopRenderStatus('error');
  });
}

// BLK-junior-20260908-1903: 保存先 (backend / fileDir) はブラウザの好みではなく
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
  var as = window.MA.autoSave;
  if (!as || !as.hydrateFromServer) { init(); return; }
  var started = false;
  function go() { if (!started) { started = true; init(); } }
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
