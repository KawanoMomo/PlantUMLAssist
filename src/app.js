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
var mmdText = '';
var currentDiagramType = 'plantuml-sequence';
var currentModule = null;
var currentParsed = { meta: {}, elements: [], relations: [], groups: [] };
var suppressSync = false;
var renderTimer = null;
var RENDER_DEBOUNCE_MS = 150;
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
    var p = as.init();
    if (p && typeof p.then === 'function') {
      p.then(doRestore, doRestore);
    } else {
      doRestore();
    }
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
  });

  editorEl.addEventListener('scroll', function() {
    if (lineNumbersEl) lineNumbersEl.scrollTop = editorEl.scrollTop;
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
    var start = this.selectionStart, end = this.selectionEnd;
    if (e.shiftKey) {
      var before = this.value.substring(0, start);
      var lineStart = before.lastIndexOf('\n') + 1;
      if (this.value.substring(lineStart, lineStart + 2) === '  ') {
        this.value = this.value.substring(0, lineStart) + this.value.substring(lineStart + 2);
        this.selectionStart = this.selectionEnd = Math.max(lineStart, start - 2);
      }
    } else {
      this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
      this.selectionStart = this.selectionEnd = start + 2;
    }
    this.dispatchEvent(new Event('input'));
  });

  document.getElementById('render-mode').addEventListener('change', function() {
    localStorage.setItem('plantuml-render-mode', this.value);
    updateOnlineWarning();
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
    window.MA.selection.setSelected([{ type: next.type || 'message', id: next.id, line: next.line }]);
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
        window.MA.selection.setSelected(
          [{ type: after[n].type || 'message', id: after[n].id, line: after[n].line }]);
        break;
      }
    }
    scheduleRefresh();
  });

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
      if (dirRow) dirRow.style.display = (backend === 'file') ? 'block' : 'none';
    }

    function open() {
      var as = window.MA.autoSave;
      var cfg = as ? as.getConfig() : { enabled: true, debounceMs: 1000, restoreMode: 'confirm', backend: 'localStorage', fileDir: './autosave' };
      document.getElementById('cfg-enabled').checked = !!cfg.enabled;
      document.getElementById('cfg-debounce').value = String(cfg.debounceMs);
      var radios = document.getElementsByName('cfg-restore-mode');
      for (var i = 0; i < radios.length; i++) radios[i].checked = (radios[i].value === cfg.restoreMode);
      var backendRadios = document.getElementsByName('cfg-backend');
      var backend = cfg.backend || 'localStorage';
      for (var j = 0; j < backendRadios.length; j++) backendRadios[j].checked = (backendRadios[j].value === backend);
      var dirInput = document.getElementById('cfg-file-dir');
      if (dirInput) dirInput.value = cfg.fileDir || './autosave';
      applyBackendVisibility(backend);
      refreshMetaInfo();
      modal.style.display = 'flex';
    }
    function close() { modal.style.display = 'none'; }

    btn.addEventListener('click', open);
    document.getElementById('cfg-cancel').addEventListener('click', close);
    document.getElementById('cfg-ok').addEventListener('click', function() {
      var enabled = document.getElementById('cfg-enabled').checked;
      var debounceMs = parseInt(document.getElementById('cfg-debounce').value, 10);
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
    // Toggle the file-dir input visibility when the backend radio changes
    var backendRadios = document.getElementsByName('cfg-backend');
    for (var k = 0; k < backendRadios.length; k++) {
      backendRadios[k].addEventListener('change', function() {
        if (this.checked) applyBackendVisibility(this.value);
      });
    }
  })();

  // Zoom
  document.getElementById('btn-zoom-in').addEventListener('click', function() { setZoom(zoom + 0.1); });
  document.getElementById('btn-zoom-out').addEventListener('click', function() { setZoom(zoom - 0.1); });
  document.getElementById('btn-zoom-fit').addEventListener('click', zoomToFit);

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
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if ((e.key || '').toLowerCase() !== 'e') return;
    e.preventDefault();
    exportReturnFocusEl = document.activeElement;
    exportMenu.classList.add('open');
    var firstItem = document.getElementById('exp-svg');
    if (firstItem) firstItem.focus();
  });

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
    renderProps();
  });

  setupTabs();
  setupBulkRename();
  setupNameAudit();
  setupLineEdit();

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
  var openBtn = document.getElementById('btn-command-palette');
  if (!CP || !modal || !input || !listEl) return;

  var items = [];       // 絞り込み前
  var shown = [];       // 絞り込み後 (画面の並びと同じ)
  var active = -1;
  var returnFocusEl = null;

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
    shown.forEach(function(item, i) {
      var row = document.createElement('div');
      row.className = 'cp-item' + (i === active ? ' active' : '');
      row.setAttribute('role', 'option');
      row.dataset.cpId = item.id;
      var kind = document.createElement('span');
      kind.className = 'cp-kind';
      kind.textContent = item.kind === 'element' ? '要素' : 'コマンド';
      var title = document.createElement('span');
      title.className = 'cp-title';
      title.textContent = item.title;
      var hint = document.createElement('span');
      hint.className = 'cp-hint';
      hint.textContent = item.hint || '';
      row.appendChild(kind); row.appendChild(title); row.appendChild(hint);
      row.addEventListener('click', function() { active = i; execute(); });
      listEl.appendChild(row);
    });
    if (emptyEl) emptyEl.style.display = shown.length ? 'none' : 'block';
    var activeRow = listEl.children[active];
    if (activeRow && activeRow.scrollIntoView) activeRow.scrollIntoView({ block: 'nearest' });
  }

  function refilter() {
    shown = CP.filter(items, input.value);
    active = shown.length ? 0 : -1;
    render();
  }

  function open() {
    returnFocusEl = document.activeElement;
    items = CP.buildItems(commands(), editorEl ? editorEl.value : '');
    input.value = '';
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
    if (item.kind === 'element') gotoLine(item.line);
    else if (typeof item.run === 'function') item.run();
  }

  if (openBtn) openBtn.addEventListener('click', open);

  document.addEventListener('keydown', function(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if ((e.key || '').toLowerCase() !== 'k') return;
    e.preventDefault();
    if (modal.classList.contains('open')) close(); else open();
  });

  input.addEventListener('input', refilter);

  input.addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = CP.moveIndex(active, 1, shown.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = CP.moveIndex(active, -1, shown.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); execute(); }
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

// アクティブなタブの現在の編集内容を workspace に書き戻す。
function saveActiveDoc() {
  if (!window.MA.workspace) return null;
  var doc = window.MA.workspace.updateActive({ dsl: mmdText, diagramType: currentDiagramType });
  try {
    var cfg = window.MA.autoSave ? window.MA.autoSave.getConfig() : null;
    if (doc && cfg && cfg.backend === 'file') {
      window.MA.workspace.saveToFile(doc, cfg.fileDir);
    }
  } catch (e) { /* 保存フォルダへの書き出しは best-effort */ }
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
  var tabs = bar.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) bar.removeChild(tabs[i]);
  var firstTool = bar.querySelector('.tab-tool');
  docs.forEach(function(doc) {
    var el = document.createElement('div');
    el.className = 'tab' + (doc.id === activeId ? ' active' : '');
    el.setAttribute('data-doc-id', doc.id);
    el.setAttribute('data-doc-name', doc.name);
    el.title = doc.name + ' (' + doc.diagramType.replace('plantuml-', '') + ') — ダブルクリックで名前変更';
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
      window.MA.workspace.rename(doc.id, next);
      renderTabs();
    });
    bar.insertBefore(el, firstTool);
  });
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
    });
  }

  var panel = document.getElementById('folder-panel');
  var btnFolder = document.getElementById('btn-tab-folder');
  if (!panel || !btnFolder) return;

  function closePanel() { panel.classList.remove('open'); }

  function openFromFolder(name) {
    closePanel();
    var dir = _wsFileDir();
    window.MA.workspace.loadFile(name, dir).then(function(text) {
      if (text == null) return;
      saveActiveDoc();
      var detected = window.MA.workspace.detectType(text);
      window.MA.workspace.openOrActivate({
        name: name,
        dsl: text,
        diagramType: (detected && modules[detected]) ? detected : currentDiagramType,
      });
      applyActiveDoc();
    });
  }

  btnFolder.addEventListener('click', function() {
    if (panel.classList.contains('open')) { closePanel(); return; }
    // 開いているタブの内容を先に書き出してから一覧を取り直す。
    saveActiveDoc();
    panel.textContent = '';
    var loading = document.createElement('div');
    loading.className = 'folder-empty';
    loading.textContent = '読み込み中…';
    panel.appendChild(loading);
    panel.classList.add('open');
    var rect = btnFolder.getBoundingClientRect();
    panel.style.left = rect.left + 'px';
    panel.style.top = (rect.bottom + 2) + 'px';
    window.MA.workspace.listFiles(_wsFileDir()).then(function(files) {
      panel.textContent = '';
      if (!files || files.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.textContent = '保存フォルダに図がありません';
        panel.appendChild(empty);
        return;
      }
      files.forEach(function(name) {
        var b = document.createElement('button');
        b.className = 'folder-item';
        b.setAttribute('data-file-name', name);
        b.textContent = name;
        b.addEventListener('click', function() { openFromFolder(name); });
        panel.appendChild(b);
      });
    });
  });

  document.addEventListener('click', function(ev) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target === btnFolder) return;
    closePanel();
  });
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

function saveFile() {
  var title = (currentParsed && currentParsed.meta && currentParsed.meta.title) || 'untitled';
  var blob = new Blob([mmdText], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title + '.puml';
  a.click();
  URL.revokeObjectURL(a.href);
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

// ── Render pipeline ────────────────────────────────────────────────────────
function scheduleRefresh() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(refresh, RENDER_DEBOUNCE_MS);
}

function refresh() {
  updateLineNumbers();
  updateUndoRedoButtons();
  var detectedType = window.MA.parserUtils.detectDiagramType(mmdText);
  var mod = detectedType ? modules[detectedType] : null;
  if (mod) currentModule = mod;

  try {
    currentParsed = currentModule.parse(mmdText);
    statusParseEl.textContent = 'OK';
    statusParseEl.classList.remove('error');
  } catch (e) {
    statusParseEl.textContent = 'Parse error: ' + e.message;
    statusParseEl.classList.add('error');
    currentParsed = { meta: {}, elements: [], relations: [], groups: [] };
  }
  statusInfoEl.textContent = (currentParsed.elements ? currentParsed.elements.length : 0) + ' elements, ' + (currentParsed.relations ? currentParsed.relations.length : 0) + ' relations';

  renderProps(currentParsed);
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

function renderProps(parsed) {
  if (!parsed) parsed = currentParsed;
  var sel = window.MA.selection.getSelected();
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

function renderSvg() {
  var mode = document.getElementById('render-mode').value || 'local';
  renderStatusEl.textContent = 'Rendering\u2026';
  renderStatusEl.classList.remove('error');

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
    }
    renderStatusEl.textContent = 'OK (' + mode + ')';
  }).catch(function(err) {
    if (myGen !== renderGen) return;  // stale failure — ignore
    previewSvgEl.innerHTML = '<p style="color:var(--accent-red);padding:20px;white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;">Render error: ' + (err.message || err) + '</p>';
    renderStatusEl.textContent = 'ERROR';
    renderStatusEl.classList.add('error');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
