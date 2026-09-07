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
    if (!res || !currentModule || typeof currentModule.insertTargetLine !== 'function') return null;
    var target = currentModule.insertTargetLine(res.line, res.position);
    if (target === null || typeof target === 'undefined') return null;
    return '+ DSL ' + target + ' 行目に挿入';
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
    if (cfg && cfgBtn) cfg.addEventListener('click', function() { cfgBtn.click(); });
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
        renderModeCards();
        refreshRenderNote();
      });
    }

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
    if (!hit) return;
    var ae0 = document.activeElement;
    if (ae0 && ae0 !== editorEl
      && (ae0.tagName === 'INPUT' || ae0.tagName === 'TEXTAREA' || ae0.tagName === 'SELECT' || ae0.isContentEditable)) return;
    e.preventDefault();
    if (hit === 'render') { scheduleRefresh(); return; }
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
    currentDiagramType = t;
    window.MA.history.pushHistory();
    currentModule = mod;  // explicit user choice overrides auto-detection
    // Per-type restore: if a saved DSL exists for the new type, prefer it
    // over the default template. Type switch is an explicit user action so
    // we silently restore (no confirm() prompt regardless of restoreMode).
    var savedForType = window.MA.autoSave ? window.MA.autoSave.restoreFor(t) : null;
    mmdText = (savedForType != null && savedForType !== '') ? savedForType : mod.template();
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
  setupSymptomSearch();
  setupBulkApply();
  setupTemplateNew();
  setupDiffPanel();
  setupReviewPanel();
  setupChangeBoard();
  setupAuditTimeline();
  setupPinPanel();
  setupPinInbox();
  setupNameAudit();
  setupSubmitCheck();
  setupFamilyAudit();
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
      { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', keywords: ['save', 'file', 'ほぞん'], run: function() { clickById('btn-save'); } },
      { id: 'consistency', title: '整合性チェックを開く / Consistency', hint: 'Review', keywords: ['consistency', 'check', 'せいごう', 'かくにん'], run: function() { clickById('status-consistency'); } },
      { id: 'eventsync', title: 'イベント整合を開く / Event sync', hint: 'Review', keywords: ['event', 'sync', 'method', 'いべんと', 'せいごう', 'めそっど'], run: function() { clickById('status-eventsync'); } },
      { id: 'family-audit', title: '系統チェックを開く / Family audit', hint: 'Tabs', keywords: ['family', 'audit', 'けいとう', 'とつごう'], run: function() { clickById('btn-tab-family'); } },
      { id: 'trace-coverage', title: 'トレースカバレッジを開く / Trace coverage', hint: 'Tabs', keywords: ['trace', 'coverage', 'とれーす', 'もれ', 'せんい'], run: function() { clickById('btn-tab-trace'); } },
      // BLK-primary-20260907-0923: タブバーの道具はどれもパレットに無く、design 1a で
      // ペインが狭くなった後は潰れたラベルを目で数えて押すしか経路が無かった。
      { id: 'tab-new', title: '新しい図を開く / New diagram', hint: 'Tabs', keywords: ['new', 'tab', 'あたらしい', 'ず'], run: function() { clickById('btn-tab-new'); } },
      { id: 'tab-folder', title: '保存フォルダの図を一覧 / Folder', hint: 'Tabs', keywords: ['folder', 'list', 'いちらん', 'ふぉるだ'], run: function() { clickById('btn-tab-folder'); } },
      { id: 'tab-rename', title: '部品名を一括置換 / Bulk rename', hint: 'Tabs', keywords: ['rename', 'replace', 'いっかつ', 'ちかん'], run: function() { clickById('btn-tab-rename'); } },
      { id: 'tab-symptom', title: '症状から関連図を探す / Symptom search', hint: 'Tabs', keywords: ['symptom', 'search', 'しょうじょう', 'けんさく', 'ふぐあい'], run: function() { clickById('btn-tab-symptom'); } },
      { id: 'tab-submit', title: '提出前チェックを開く / Submit check', hint: 'Tabs', keywords: ['submit', 'check', 'ていしゅつ', 'かくにん', '略語'], run: function() { clickById('btn-tab-submit'); } },
      { id: 'tab-audit', title: '名前突合を開く / Name audit', hint: 'Tabs', keywords: ['name', 'audit', 'なまえ', 'つきあわせ'], run: function() { clickById('btn-tab-audit'); } },
      { id: 'tab-handoff', title: '引き継ぎパッケージを作る / Handoff package', hint: 'Tabs', keywords: ['handoff', 'package', 'zip', 'ひきつぎ', 'ぱっけーじ'], run: function() { clickById('btn-tab-handoff'); } },
      { id: 'tab-delivery', title: '納品パッケージを作る / Delivery package', hint: 'Tabs', keywords: ['delivery', 'package', 'zip', 'のうひん', 'ぱっけーじ', '提出'], run: function() { clickById('btn-tab-delivery'); } },
      { id: 'tab-lines', title: '行編集を開く / Line edit', hint: 'Tabs', keywords: ['line', 'edit', 'ぎょう', 'へんしゅう'], run: function() { clickById('btn-tab-lines'); } },
      { id: 'tab-compare', title: '並べて見る / Compare', hint: 'Tabs', keywords: ['compare', 'side', 'ならべて', 'みくらべ'], run: function() { clickById('btn-tab-compare'); } },
      { id: 'tab-template', title: 'テンプレートから新しい図を作る / Template', hint: 'Tabs', keywords: ['template', 'copy', 'てんぷれ', 'ふくせい'], run: function() { clickById('btn-tab-template'); } },
      { id: 'tab-diff', title: '前回保存からの差分 / Diff', hint: 'Tabs', keywords: ['diff', 'change', 'さぶん', 'へんこう'], run: function() { clickById('btn-tab-diff'); } },
      { id: 'tab-pins', title: 'レビュー指摘 / Review pins', hint: 'Tabs', keywords: ['pin', 'review', 'してき', 'ぴん'], run: function() { clickById('btn-tab-pins'); } },
      { id: 'tab-set', title: 'セット複製 / Clone a set', hint: 'Tabs', keywords: ['set', 'clone', 'family', 'せっと', 'ふくせい'], run: function() { clickById('btn-tab-set'); } },
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

// アクティブなタブの現在の編集内容を workspace に書き戻す。
function saveActiveDoc() {
  if (!window.MA.workspace) return null;
  var doc = window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType });
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (doc && cfg && cfg.backend === 'file') {
      window.MA.workspace.saveToFile(doc, cfg.fileDir);
      // 保存した時点を差分の基準にする (BLK-reviewer-20260907-0803)。
      if (window.MA.saveDiff) window.MA.saveDiff.mark(doc.name, doc.dsl);
    }
  } catch (e) { /* 保存フォルダへの書き出しは best-effort */ }
  renderDiffBadge();
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
  var tabs = bar.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) bar.removeChild(tabs[i]);
  var firstTool = bar.querySelector('.tab-tool');
  docs.forEach(function(doc) {
    var el = document.createElement('div');
    el.className = 'tab' + (doc.id === activeId ? ' active' : '');
    el.setAttribute('data-doc-id', doc.id);
    el.setAttribute('data-doc-name', doc.name);
    el.title = doc.name + ' (' + doc.diagramType.replace('plantuml-', '') + ') — ダブルクリックで名前変更';
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
        if (window.MA.workspace.close(doc.id)) {
          if (wasActive) applyActiveDoc(); else renderTabs();
        }
      });
      el.appendChild(close);
    }
    el.addEventListener('click', function() { switchToDoc(doc.id); });
    el.addEventListener('dblclick', function(ev) {
      ev.preventDefault();
      var next = window.prompt('図の名前 (英数字・_ ・- のみ)', doc.name);
      if (next == null) return;
      // 図の名前が変わってもレビューの基準は持ち越す。
      if (window.MA.reviewDesk) {
        try { window.MA.reviewDesk.renameBaseline(doc.name, next); } catch (e) {}
      }
      window.MA.workspace.rename(doc.id, next);
      renderTabs();
    });
    bar.insertBefore(el, firstTool);
  });
  renderDiffBadge();
  try { renderConsistencyBadge(); } catch (e) {}
  try { renderEventSyncBadge(); } catch (e) {}
  try { renderPinBadge(); } catch (e) {}
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
  btn.className = sum.hasChange ? 'tab-tool has-change' : 'tab-tool';
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
  btn.className = r.findings.length ? 'tab-tool has-finding' : 'tab-tool';
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

function _changeBoardModel() {
  var CB = window.MA.changeBoard;
  var SD = window.MA.saveDiff;
  if (!CB || !SD) return null;
  return CB.build(_diffDocs(), SD.baselineOf, {
    includeSame: _cbSame,
    collapse: !_cbFull,
    context: 2,
  });
}

function renderChangeBoard() {
  var CB = window.MA.changeBoard;
  var body = document.getElementById('cb-body');
  var sumEl = document.getElementById('cb-summary');
  if (!CB || !body) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var board = _changeBoardModel();
  if (!board) return null;

  if (sumEl) {
    var head = CB.summaryText(board);
    if (board.markedAt) head += ' ・ 基準 ' + board.markedAt.replace('T', ' ').slice(0, 16);
    sumEl.textContent = head;
  }

  if (board.entries.length === 0) {
    body.innerHTML = '<div class="cb-empty">前回保存した時点から変わった図はありません。'
      + '「± 差分」の [今の内容を基準にする] を押すと、そこからの変更がここに並びます。</div>';
    return board;
  }

  var html = '';
  board.entries.forEach(function(e) {
    var t = String(e.diagramType || '').replace('plantuml-', '');
    html += '<div class="cb-entry" data-doc-id="' + esc(e.id) + '">'
      + '<div class="cb-entry-head"><span>' + esc(e.name) + (t ? ' (' + esc(t) + ')' : '') + '</span>'
      + '<span class="cb-count">' + esc(_cbCountText(e)) + '</span>'
      + '<button type="button" class="cb-goto">この図を開く</button></div>'
      + '<div class="cb-cols"><span>変更前' + (e.markedAt ? ' (' + esc(e.markedAt.replace('T', ' ').slice(0, 16)) + ')' : ' (基準なし)') + '</span>'
      + '<span>変更後 (今)</span></div>'
      + '<table class="cb-diff"><tbody>';
    e.rows.forEach(function(r) {
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

  var gotos = body.querySelectorAll('.cb-goto');
  for (var i = 0; i < gotos.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var entry = btn.parentNode.parentNode;
        toggleChangeBoard(false);
        switchToDoc(entry.getAttribute('data-doc-id'));
      });
    })(gotos[i]);
  }
  return board;
}

function _cbCountText(e) {
  if (e.status === 'same') return '変更なし';
  if (e.status === 'new') return '新規 +' + e.added;
  return '+' + e.added + ' −' + e.removed;
}

function toggleChangeBoard(open) {
  var modal = document.getElementById('cb-modal');
  if (!modal) return;
  var want = (open == null) ? (modal.style.display === 'none' || !modal.style.display) : !!open;
  if (!want) { modal.style.display = 'none'; return; }
  modal.style.display = 'flex';
  renderChangeBoard();
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

  var full = document.getElementById('cb-full');
  if (full) full.addEventListener('change', function() { _cbFull = full.checked; renderChangeBoard(); });
  var same = document.getElementById('cb-same');
  if (same) same.addEventListener('change', function() { _cbSame = same.checked; renderChangeBoard(); });
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
  return { audits: out, docs: docs.length };
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
  var clr = document.getElementById('at-clear');
  if (clr) {
    clr.addEventListener('click', function() {
      if (!confirm('記録した監査履歴を全部消します。よろしいですか。')) return;
      TL.clear();
      renderAuditTimeline();
    });
  }
}

function setupTabs() {
  if (!window.MA.workspace) return;
  renderTabs();

  var btnNew = document.getElementById('btn-tab-new');
  if (btnNew) {
    btnNew.addEventListener('click', function() {
      saveActiveDoc();
      var mod = modules[currentDiagramType];
      window.MA.workspace.open({
        name: 'diagram' + (window.MA.workspace.count() + 1),
        diagramType: currentDiagramType,
        dsl: mod ? mod.template() : '',
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
  // BLK-reviewer-20260907-1803-wish: 図名 → new/changed/unchanged。
  // 「変更のある図だけ選ぶ」と行ごとの [差分] がここを見る。
  var folderStatus = {};
  // BLK-junior-20260907-2009-wish: 一時控えの印が付いた図名。畳んでいる間は
  // folderNames に入れない (「全部選ぶ」や「変更図だけ選ぶ」が控えを掴まない)。
  var draftNames = [];

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
          var detected = window.MA.workspace.detectType(text);
          window.MA.workspace.openOrActivate({
            name: name,
            dsl: text,
            diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
          });
        }
        step();
      }, step);
    }
    if (FS) step();
  }

  openFromFolderByName = function(name) { openFromFolder(name); };

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
    window.MA.workspace.loadFile(name, dir).then(function(text) {
      var FR = window.MA.folderReopen;
      var before = mmdText;
      var info = FR
        ? FR.describe(name, text, before, sameTab)
        : { kind: text == null ? 'missing' : 'opened', changed: text != null, message: '' };
      if (text != null) {
        var detected = window.MA.workspace.detectType(text);
        window.MA.workspace.openOrActivate({
          name: name,
          dsl: text,
          diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
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
  function renderFolderPanel() {
    var dir = _wsFileDir();
    var RW = window.MA.reviewWatch;
    var store = _reviewStore();
    window.MA.workspace.listFileEntries(dir).then(function(entries) {
      panel.textContent = '';
      if (!entries || entries.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.textContent = '保存フォルダに図がありません';
        panel.appendChild(empty);
        return;
      }
      // 消えた図の一時控えの印は捨てる (印だけが残り続けないようにする)。
      var DM = window.MA.draftMark;
      draftNames = DM ? DM.keepExisting(DM.load(store, dir), entries) : [];
      if (DM) DM.save(store, dir, draftNames);

      if (!RW) {
        var plain = DM ? DM.split(entries, draftNames) : { items: entries, drafts: [] };
        setFolderNames(plain);
        folderStatus = {};
        panel.appendChild(folderPickBar());
        plain.items.forEach(function(e) { panel.appendChild(folderRow(e.name || e, null, null)); });
        appendDraftSection(plain.drafts, function(e) { return folderRow(e.name || e, null, null); });
        syncFolderPickUi();
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
      panel.appendChild(folderPickBar());

      folderStatus = {};
      rows.forEach(function(r) { folderStatus[r.name] = r.status; });
      syncFolderPickUi();
      function rowOf(r) {
        return folderRow(r.name, RW.badge(r.status), RW.formatMtime(r.mtime), r.status);
      }
      sp.items.forEach(function(r) { panel.appendChild(rowOf(r)); });
      appendDraftSection(sp.drafts, rowOf);

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
    });
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
    row.appendChild(b);
    if (status === 'changed' || status === 'new') row.appendChild(folderDiffButton(name, status));
    row.appendChild(folderDraftButton(name));
    return row;
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
    if (mtime) {
      var t = document.createElement('span');
      t.className = 'folder-mtime';
      t.textContent = mtime;
      t.title = '最終保存時刻';
      b.appendChild(t);
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
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (cfg && cfg.backend === 'file') {
      window.MA.workspace.list().forEach(function(d) {
        window.MA.workspace.saveToFile(d, cfg.fileDir);
        if (window.MA.saveDiff) window.MA.saveDiff.mark(d.name, d.dsl);
      });
    }
  } catch (e) { /* best-effort */ }
  if (window.MA.toast) {
    try { window.MA.toast.show(res.updated + ' 行 / ' + res.changed.length + ' 枚に適用しました'); } catch (e) {}
  }
  updateRenamePreview();
  return res;
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
  renderSignatureApply(docs, from);

  var ok = !!from && br.isValidTarget(to) && from !== to && total > 0;
  if (!from) summary.textContent = '置換前の部品名を入力してください';
  else if (total === 0) summary.textContent = '「' + from + '」は見つかりません';
  else if (!to) summary.textContent = '置換後の名前を入力してください';
  else if (!br.isValidTarget(to)) summary.textContent = '置換後は英数字・_ ・- ・. のみ';
  else if (from === to) summary.textContent = '置換前と置換後が同じです';
  else summary.textContent = total + ' 件 / ' + rows.filter(function(r) { return r.count > 0; }).length + ' 枚を置換します';
  summary.setAttribute('data-total', String(total));
  applyBtn.disabled = !ok;
}

// 置換前・置換後を決めたあとの共通処理。一括置換パネルと名前突合の
// 「統一」ボタンが同じ経路を通るようにここへ出す。
function renameAcrossDocs(from, to, docs) {
  var br = window.MA.bulkRename;
  if (!br || !window.MA.workspace) return null;
  var activeId = window.MA.workspace.getActiveId();

  var res = br.apply(docs, from, to);
  if (res.changed.length === 0) return res;

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
  // 保存フォルダ運用時は置換後の全図を書き出す。
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (cfg && cfg.backend === 'file') {
      window.MA.workspace.list().forEach(function(d) {
        window.MA.workspace.saveToFile(d, cfg.fileDir);
        if (window.MA.saveDiff) window.MA.saveDiff.mark(d.name, d.dsl);
      });
    }
  } catch (e) { /* best-effort */ }
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

// ── テンプレートから新規作成 ───────────────────────────────────────────────
// BLK-junior-20260907-0803-wish: 同じ構成の図をもう 1 枚作るとき、今までは
// 元の図を開いて構造を覚え、新しいタブでゼロから打ち直していた (模写)。
// 「元の図 + 置換元語 + 置換先語」を選ぶだけで新しいタブが出来るようにする。
// 置換結果は確定前に行単位で見せるので、写し間違いが起きる余地がない。
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

  var LABEL = 'display:block;font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 3px 0;';
  var FIELD = 'width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);'
    + 'font-family:var(--font-mono);font-size:12px;padding:4px 6px;border-radius:3px;';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);'
    + 'border-radius:3px;cursor:pointer;padding:4px 12px;font-size:12px;';

  function close() { modal.style.display = 'none'; }

  function templateOptions() {
    var html = '';
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
          if (cands.length && cands[0].count > 1) fromEl.value = cands[0].name;
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

  function render() {
    content.innerHTML =
      (SK ? skelSectionHtml() : '')
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
  }

  function open(focusSkeleton) {
    saveActiveDoc();
    docs = window.MA.workspace ? window.MA.workspace.list() : [];
    files = [];
    fileCache = {};
    nameTouched = false;
    render();
    modal.style.display = 'flex';
    if (focusSkeleton) {
      var sub = document.getElementById('skel-subject');
      if (sub) sub.focus();
    }
    onSourceChange();
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

  btn.addEventListener('click', function() { open(false); });
  var btnSkel = document.getElementById('btn-tab-skeleton');
  if (btnSkel) btnSkel.addEventListener('click', function() { open(true); });

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
    updateRenamePreview();
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

  function doApply() {
    var res = applyBulkRename();
    if (res && res.total > 0) {
      summary.textContent = res.total + ' 件 / ' + res.docs + ' 枚を置換しました';
      summary.setAttribute('data-applied', String(res.total));
      fromEl.value = '';
      toEl.value = '';
      fillCandidates();
      updateRenamePreview();
      summary.textContent = res.total + ' 件 / ' + res.docs + ' 枚を置換しました';
    }
  }

  if (applyBtn) applyBtn.addEventListener('click', doApply);
  if (cancel) cancel.addEventListener('click', closePanel);

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btn) return;
    closePanel();
  });
}

// ── 症状検索 ───────────────────────────────────────────────────────────────
// BLK-primary-20260907-2203-wish: 不具合対応は症状文から始まるのに、過去図を
// 探す入口は「部品名を思い付いて打つ」しか無かった。思い付ける名前の数が探索の
// 上限になるので、経験の浅い担当者はそもそも探索を始められない。症状文をその
// まま貼れば関連度順に図が並び、当たった行を押せばその図のその行へ運ぶ。

function renderSymptomSearch() {
  var ss = window.MA.symptomSearch;
  var textEl = document.getElementById('symptom-text');
  var termsEl = document.getElementById('symptom-terms');
  var headEl = document.getElementById('symptom-head');
  var resEl = document.getElementById('symptom-results');
  if (!ss || !textEl || !termsEl || !headEl || !resEl) return;
  var text = textEl.value;
  var docs = _renameDocs();
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
    try {
      var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
      if (cfg && cfg.backend === 'file') {
        res.changed.forEach(function(c) {
          var d = window.MA.workspace.list().filter(function(x) { return x.id === c.id; })[0];
          if (!d) return;
          window.MA.workspace.saveToFile(d, cfg.fileDir);
          if (window.MA.saveDiff) window.MA.saveDiff.mark(d.name, d.dsl);
        });
      }
    } catch (e) { /* best-effort */ }
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

function toggleCompareView(open) {
  var pane = document.getElementById('compare-pane');
  if (!pane) return;
  _compareOpen = (open == null) ? !_compareOpen : !!open;
  pane.hidden = !_compareOpen;
  if (_compareOpen) {
    _compareShownDsl = null;   // 開き直したら必ず描く
    renderCompareView();
  }
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
  var ref = cv.pick(docs, activeId, _compareRefId);
  var opts = cv.options(docs, activeId);

  sel.textContent = '';
  opts.forEach(function(o) {
    var op = document.createElement('option');
    op.value = String(o.id);
    op.textContent = o.name + ' (' + String(o.diagramType || '').replace('plantuml-', '') + ')';
    if (ref && o.id === ref.id) op.selected = true;
    sel.appendChild(op);
  });

  if (!ref) {
    _compareRefId = null;
    _compareShownDsl = null;
    host.textContent = '';
    if (status) status.textContent = '';
    var msg = document.createElement('div');
    msg.id = 'compare-empty';
    msg.style.cssText = 'font-size:11px;color:var(--text-secondary);';
    msg.textContent = '並べる図がありません。＋ で 2 枚目のタブを開いてください。';
    host.appendChild(msg);
    return;
  }

  _compareRefId = ref.id;
  var full = cv.doc(docs, ref.id) || {};
  var dsl = full.dsl || '';
  if (dsl === _compareShownDsl) return;   // 中身が変わっていなければ描き直さない
  _compareShownDsl = dsl;
  if (status) status.textContent = '描画中…';
  renderDslToSvg(dsl).then(function(svg) {
    // 描いている間に参照図が切り替わっていたら捨てる (遅れて届いた結果で上書きしない)
    if (!_compareOpen || _compareShownDsl !== dsl) return;
    host.innerHTML = svg;
    if (status) status.textContent = '参照 (読むだけ)';
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

function setupCompareView() {
  var checkBtn = document.getElementById('btn-check-run');
  if (checkBtn) checkBtn.addEventListener('click', runConsistencyCheck);
  var btn = document.getElementById('btn-tab-compare');
  var sel = document.getElementById('compare-select');
  var close = document.getElementById('btn-compare-close');
  if (btn) btn.addEventListener('click', function() { toggleCompareView(); });
  if (close) close.addEventListener('click', function() { toggleCompareView(false); });
  if (sel) {
    sel.addEventListener('change', function() {
      _compareRefId = sel.value;
      _compareShownDsl = null;
      _clearCheckList();
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

function _familyAuditRender(families, selectedKey) {
  var content = document.getElementById('fa-modal-content');
  var fa = window.MA.familyAudit;
  if (!content || !fa) return;
  var esc = window.MA.htmlUtils.escHtml;

  var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:12px 0 4px 0;';
  var CELL = 'padding:3px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-primary);';
  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 8px;font-size:11px;';

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">系統チェック</h3>';

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
  _familyAuditRender(families, families.length ? families[0].key : null);
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

function renderConsistencyBadge() {
  var btn = document.getElementById('status-consistency');
  var ck = window.MA.consistency;
  if (!btn || !ck) return null;
  var result = ck.check(_consistencyDocs());
  btn.textContent = ck.badgeLabel(result);
  btn.className = result.count > 0 ? 'has-warning' : '';
  btn.title = result.count > 0
    ? ('命名 ' + result.naming.length + ' / 未使用 ' + result.unused.length
       + ' / メソッド ' + result.methods.length + ' / 粒度 ' + result.granularity.length
       + ' / イベント ' + result.events.length)
    : '命名規約・未使用 participant・メソッド不一致・粒度不一致・イベント名不一致はない';
  return result;
}

function openConsistencyPanel() {
  var modal = document.getElementById('ck-modal');
  var content = document.getElementById('ck-modal-content');
  var ck = window.MA.consistency;
  if (!modal || !content || !ck) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var result = ck.check(_consistencyDocs());

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

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">整合性チェック</h3>'
    + '<div id="ck-summary" data-count="' + result.count + '" '
    + 'data-naming="' + result.naming.length + '" data-unused="' + result.unused.length + '" '
    + 'data-methods="' + result.methods.length + '" data-granularity="' + result.granularity.length + '" '
    + 'data-events="' + result.events.length + '" '
    + 'data-method-replies="' + (result.methodReplies || []).length + '" '
    + 'style="font-size:11px;color:' + (result.count ? 'var(--accent-orange)' : 'var(--accent-green)') + ';">'
    + (result.count === 0 ? '警告はありません' : '警告 ' + result.count + ' 件') + '</div>';

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

function buildHandoffPackage() {
  var HP = window.MA.handoffPackage;
  var BE = window.MA.bulkExport;
  if (!HP || !BE || !window.MA.workspace) return Promise.resolve(null);
  // 編集中の内容が workspace に載っていないと 1 枚だけ古い DSL で固まる。
  saveActiveDoc();

  var docs = _renameDocs().map(function(d) {
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
    });
    var name = HP.packageName();
    downloadBlob(name, new Blob([BE.buildZip(HP.files(snapshot))], { type: 'application/zip' }));
    var msg = '引き継ぎパッケージを書き出しました（' + name + '） ' + snapshot.verdict;
    if (status) status.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    return snapshot;
  });
}

function setupHandoffPackage() {
  var btn = document.getElementById('btn-tab-handoff');
  if (!btn || !window.MA.handoffPackage) return;
  btn.addEventListener('click', function() { buildHandoffPackage(); });
}

// ── 納品パッケージ ─────────────────────────────────────────────────────────
// BLK-primary-20260907-1703-wish: 顧客に渡す最終成果物は、全図 SVG の zip に
// 表紙 (図一覧・版数・提出前チェック結果) と変更履歴 (前回提出からの差分) を
// 人手で足して作っていた。材料はどれも GUI にあるのに、組み立てだけが画面の外だった。
// ここは対象の枚数・題・版数を選ばせ、1 つの zip にまとめて出す。
// 判定と HTML は src/core/delivery-package.js の職掌。ここは材料を集めるだけ。

var _dpDocs = null;      // 対象に選んでいる図 (name の配列)。null は「全部」

function _dpSelectedDocs() {
  var docs = _renameDocs();
  if (!_dpDocs) return docs;
  return docs.filter(function(d) { return _dpDocs.indexOf(d.name) !== -1; });
}

function _dpBoard(docs) {
  var CB = window.MA.changeBoard;
  var DP = window.MA.deliveryPackage;
  if (!CB || !DP) return null;
  // 提出物の一覧なので、変わっていない図も「変更なし」と書いて並べる。
  return CB.build(docs, DP.baselineOf, { includeSame: true, collapse: true, context: 0 });
}

function _dpSubmitResult(docs) {
  var SC = window.MA.submitCheck;
  if (!SC) return null;
  return SC.check(docs, SC.parseDict(_scLoadDict()));
}

function renderDeliveryPanel() {
  var DP = window.MA.deliveryPackage;
  var content = document.getElementById('dp-modal-content');
  if (!DP || !content) return null;
  var esc = window.MA.htmlUtils.escHtml;
  var all = _renameDocs();
  if (!_dpDocs) _dpDocs = all.map(function(d) { return d.name; });
  var picked = _dpSelectedDocs();
  var last = DP.lastDelivery();
  var submit = _dpSubmitResult(picked);
  var board = _dpBoard(picked);
  var change = DP.changeSection(board, last);
  var sub = DP.submitSection(submit);

  var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:4px 12px;font-size:11px;';
  var IN = 'background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;padding:3px 6px;font-size:12px;';

  var titleVal = document.getElementById('dp-title');
  var revVal = document.getElementById('dp-revision');
  var title = titleVal ? titleVal.value : (last.title || '設計書 図面集');
  var rev = revVal ? revVal.value : DP.nextRevision(last.revision);

  var html = '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">\u{1F4E6} 納品パッケージ</h3>'
    + '<div id="dp-last" style="font-size:11px;color:var(--text-secondary);">'
    + esc(last.at ? '前回提出 ' + (last.revision || '版数なし') + ' ・ ' + last.at.replace('T', ' ').slice(0, 16)
                  + ' ・ ' + last.count + ' 枚'
                : 'まだ 1 度も提出していません（今回が初回提出になります）') + '</div>';

  html += '<div style="display:flex;gap:12px;margin-top:10px;">'
    + '<label style="flex:2;font-size:10px;color:var(--accent);font-weight:bold;">タイトル'
    + '<input id="dp-title" style="' + IN + 'width:100%;margin-top:3px;" value="' + esc(title) + '"></label>'
    + '<label style="flex:1;font-size:10px;color:var(--accent);font-weight:bold;">版数'
    + '<input id="dp-revision" style="' + IN + 'width:100%;margin-top:3px;" value="' + esc(rev) + '"></label>'
    + '</div>';

  html += '<div style="margin-top:12px;font-size:10px;color:var(--accent);font-weight:bold;">'
    + '対象の図 <span id="dp-count" style="color:var(--text-secondary);font-weight:normal;">'
    + esc(picked.length + ' / ' + all.length + ' 枚') + '</span>'
    + ' <button type="button" id="dp-all" style="' + BTN + 'padding:1px 8px;">全部</button>'
    + ' <button type="button" id="dp-none" style="' + BTN + 'padding:1px 8px;">全部外す</button></div>';
  html += '<div id="dp-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:3px;margin-top:4px;padding:4px;">';
  all.forEach(function(d) {
    var on = _dpDocs.indexOf(d.name) !== -1;
    var st = '';
    (board ? board.entries : []).forEach(function(e) { if (e.name === d.name) st = e.status; });
    var label = st === 'new' ? '新規' : (st === 'changed' ? '変更' : (st === 'same' ? '変更なし' : ''));
    html += '<label class="dp-item" style="display:block;font-size:11px;color:var(--text-primary);padding:1px 2px;">'
      + '<input type="checkbox" class="dp-pick" data-name="' + esc(d.name) + '"' + (on ? ' checked' : '') + '> '
      + esc(d.name)
      + '<span style="color:var(--text-secondary);"> ' + esc(String(d.diagramType || '').replace('plantuml-', ''))
      + (label ? ' ・ ' + esc(label) : '') + '</span></label>';
  });
  html += '</div>';

  html += '<div id="dp-summary" style="margin-top:12px;font-size:11px;color:var(--text-primary);'
    + 'border:1px solid var(--border);border-radius:3px;padding:8px;">'
    + '<div id="dp-submit-line">提出前チェック: ' + esc(sub.line) + '</div>'
    + '<div id="dp-change-line">前回提出からの差分: ' + esc(change.line) + '</div>'
    + '</div>';

  html += '<div id="dp-status" style="margin-top:8px;font-size:11px;color:var(--text-secondary);"></div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px;">'
    + '<button id="dp-build" style="flex:2;' + BTN + 'padding:8px;">\u{1F4E6} この内容で zip を作る</button>'
    + '<button id="dp-close" style="flex:1;' + BTN + 'padding:8px;">閉じる</button></div>';

  content.innerHTML = html;

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
  var buildBtn = document.getElementById('dp-build');
  if (buildBtn) buildBtn.addEventListener('click', function() { buildDeliveryPackage(); });
  return { picked: picked, submit: sub, change: change };
}

function openDeliveryPanel() {
  var modal = document.getElementById('dp-modal');
  if (!modal || !window.MA.deliveryPackage) return null;
  // 開くたびに対象を今の図に取り直す (タブが増減した後で古い選択を引きずらない)。
  // 題と版数も、閉じたときの入力ではなく前回提出の控えから引き直す
  // (前回 1.0 で出したなら次は 1.1 が既定になる)。
  _dpDocs = null;
  var content = document.getElementById('dp-modal-content');
  if (content) content.innerHTML = '';
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
  var last = DP.lastDelivery();
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
    DP.markDelivered(docs, { title: pkg.title, revision: pkg.revision });
    var msg = '納品パッケージを書き出しました（' + name + '） ' + pkg.verdict;
    if (status) status.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    return pkg;
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

  html += '<div style="display:flex;gap:8px;margin-top:12px;">' +
    '<button id="sc-close" style="' + BTN + 'flex:1;">閉じる</button></div>';

  content.innerHTML = html;
  modal.style.display = 'flex';

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
      window.MA.workspace.openOrActivate({
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
  var ST = window.MA.saveTarget;
  var target = ST ? ST.decide(cfg, doc, title) : { mode: 'download', name: title };

  if (target.mode === 'file') {
    // saveActiveDoc() が既に書き出しているが、ここでは結果を待って利用者に伝える。
    window.MA.workspace.saveToFile(doc, target.dir).then(function(ok) {
      setSaveStatus(ST.messageFor(target, ok));
    });
    return;
  }

  var blob = new Blob([mmdText], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = target.name + '.puml';
  a.click();
  URL.revokeObjectURL(a.href);
  if (ST) setSaveStatus(ST.messageFor(target, true));
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

// ── Export ─────────────────────────────────────────────────────────────────
function exportSVG() {
  var svgEl = previewSvgEl.querySelector('svg');
  if (!svgEl) return;
  var clone = svgEl.cloneNode(true);
  var blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ((currentParsed.meta && currentParsed.meta.title) || 'untitled') + '.svg';
  a.click();
  URL.revokeObjectURL(a.href);
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

function downloadBlob(filename, blob) {
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

function exportAllSVG() {
  if (!window.MA.bulkExport || !window.MA.workspace) return;
  // 編集中の内容が workspace に載っていないと 1 枚だけ古い DSL で書き出される。
  saveActiveDoc();
  var docs = window.MA.workspace.list();
  var status = document.getElementById('bulk-export-status');
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
      var name = window.MA.bulkExport.zipName();
      downloadBlob(name, new Blob([window.MA.bulkExport.buildZip(files)], { type: 'application/zip' }));
      msg = msg + '（' + name + '）';
    }
    if (status) status.textContent = msg;
    if (window.MA.toast) window.MA.toast.show(msg);
    return summary;
  });
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
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = ((currentParsed.meta && currentParsed.meta.title) || 'untitled') + '.png';
      a.click();
      URL.revokeObjectURL(a.href);
    });
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

function renderPinBadge() {
  var btn = document.getElementById('btn-tab-pins');
  var RP = window.MA.reviewPins;
  if (!btn || !RP) return null;
  var sum = RP.summary(_pins());
  btn.textContent = RP.badgeText(sum);
  btn.className = sum.open > 0 ? 'tab-tool has-open' : 'tab-tool';
  btn.title = sum.total
    ? ('レビュー指摘 ' + sum.total + ' 件 (未読 ' + sum.open + ' / 迷子 ' + sum.stale + ')')
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
      title.textContent = (pin.state === 'read' ? '既読' : '未読') + ': ' + pin.text;
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

function renderPinPanel() {
  var panel = document.getElementById('pin-panel');
  var RP = window.MA.reviewPins;
  if (!panel || !RP) return;
  var esc = window.MA.htmlUtils.escHtml;
  var pins = _pins();
  var sum = RP.summary(pins);
  var target = _pinTargetLine();

  var html = '<div class="pin-head" data-total="' + sum.total + '" data-open="' + sum.open
    + '" data-stale="' + sum.stale + '">レビュー指摘 ' + sum.total + ' 件 ・ 未読 ' + sum.open
    + (sum.stale ? ' ・ 行が見つからない ' + sum.stale : '') + '</div>';
  if (!pins.length) {
    html += '<div class="pin-row" id="pin-empty">この図に指摘はありません</div>';
  }
  pins.forEach(function(p) {
    html += '<div class="pin-row' + (p.state === 'read' ? ' read' : '') + (p.stale ? ' stale' : '') + '"'
      + ' data-pin-id="' + esc(p.id) + '" data-pin-state="' + esc(p.state) + '">'
      + '<span class="pin-where">#' + esc(p.id) + ' '
      + (p.stale ? '行が見つかりません' : ('L' + p.line)) + '</span>'
      + '<span class="pin-text">' + esc(p.text) + '</span>'
      + '<span class="pin-anchor">' + esc(p.anchor) + '</span><br>'
      + '<button type="button" class="pin-jump" data-pin-id="' + esc(p.id) + '"'
      + (window.MA.pinJump && !window.MA.pinJump.canJump(p) ? ' disabled' : '')
      + ' title="この指摘の対象を選択して修正フォームを開く">'
      + (window.MA.pinJump ? esc(window.MA.pinJump.jumpLabel(p)) : '対象へジャンプ')
      + '</button> '
      + '<button type="button" class="pin-toggle" data-pin-id="' + esc(p.id) + '">'
      + (p.state === 'read' ? '未読に戻す' : '既読にする') + '</button> '
      + '<button type="button" class="pin-del" data-pin-id="' + esc(p.id) + '">消す</button>'
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
    + '<input id="pin-text" placeholder="指摘の内容 (例: Timer_StartConv に対応する method が無い)">'
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
  bindAll('pin-del', function(id) {
    _applyLineEditText(RP.remove(mmdText, id));
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

function _inboxShown() {
  var PI = window.MA.pinInbox;
  if (!PI || !_inboxItems) return [];
  return PI.filter(_inboxItems, { unreadOnly: _inboxUnreadOnly(), excludeAuthor: _inboxMe() });
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
    return window.MA.pinInbox.collect(docs);
  });
}

function renderInboxBadge() {
  var btn = document.getElementById('btn-tab-inbox');
  var PI = window.MA.pinInbox;
  if (!btn || !PI) return null;
  if (!_inboxItems) {
    btn.textContent = '📥 指摘箱 −';
    btn.className = 'tab-tool';
    btn.title = '保存フォルダの図をまたいで、未対応のレビュー指摘を集める';
    return null;
  }
  var sum = PI.summary(_inboxShown());
  btn.textContent = PI.badgeText(sum);
  btn.className = sum.open > 0 ? 'tab-tool has-open' : 'tab-tool';
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
    + '<label>自分 <input id="ib-me" placeholder="junior" value="' + esc(_inboxMe()) + '"></label>'
    + ' <button type="button" id="ib-reload">読み直す</button></div>';

  var groups = PI.groupByDoc(shown);
  if (!groups.length) {
    html += '<div class="ib-empty" id="ib-empty">'
      + (_inboxItems ? '未対応の指摘はありません' : '「読み直す」で保存フォルダを走査します') + '</div>';
  }
  groups.forEach(function(g) {
    html += '<div class="ib-group" data-doc="' + esc(g.doc) + '" data-open="' + g.open + '">'
      + '<div class="ib-doc">' + esc(PI.groupText(g)) + '</div>';
    g.items.forEach(function(p) {
      html += '<div class="ib-row' + (p.state === 'read' ? ' read' : '') + (p.stale ? ' stale' : '') + '"'
        + ' data-doc="' + esc(p.doc) + '" data-pin-id="' + esc(p.id) + '" data-line="' + p.line + '">'
        + '<span class="ib-where">' + (p.stale ? '行が見つかりません' : ('L' + p.line)) + '</span> '
        + '<span class="ib-who">' + esc(p.author || '?') + '</span>'
        + '<span class="ib-text">' + esc(p.text) + '</span></div>';
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
  renderInboxPanel();
  return scanPinInbox().then(function(items) {
    _inboxItems = items;
    _inboxLoading = false;
    renderInboxPanel();
    renderInboxBadge();
    return items;
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

function renderDiagramSettings(keepState) {
  var host = document.getElementById('diagram-settings-content');
  var ds = window.MA.diagramSettings;
  if (!host || !ds) return;
  // タブを開いた時点の DSL を読み戻して、今の図の見た目に合わせる。
  if (!keepState || !dsSettings) dsSettings = ds.readFrom(mmdText);
  var resolved = ds.resolve(dsSettings);
  while (host.firstChild) host.removeChild(host.firstChild);

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

  // タイトル
  var gTitle = group('タイトル / Title');
  var title = document.createElement('input');
  title.type = 'text';
  title.id = 'ds-title';
  title.value = dsSettings.title || '';
  title.addEventListener('change', function() { dsSet({ title: title.value }); });
  gTitle.appendChild(title);

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
