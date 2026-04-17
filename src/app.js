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

var editorEl, previewSvgEl, propsEl, statusParseEl, statusInfoEl, renderStatusEl;
var mmdText = '';
var currentModule = null;
var suppressSync = false;
var renderTimer = null;
var RENDER_DEBOUNCE_MS = 150;

function init() {
  editorEl = document.getElementById('editor');
  previewSvgEl = document.getElementById('preview-svg');
  propsEl = document.getElementById('props-pane');
  statusParseEl = document.getElementById('status-parse');
  statusInfoEl = document.getElementById('status-info');
  renderStatusEl = document.getElementById('render-status');

  _registerModules();

  var savedMode = localStorage.getItem('plantuml-render-mode') || 'local';
  document.getElementById('render-mode').value = savedMode;

  currentModule = modules['plantuml-sequence'];
  mmdText = currentModule.template();
  editorEl.value = mmdText;

  editorEl.addEventListener('input', function() {
    if (suppressSync) return;
    window.MA.history.pushHistory();
    mmdText = editorEl.value;
    scheduleRefresh();
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
    scheduleRefresh();
  });

  document.getElementById('btn-render').addEventListener('click', scheduleRefresh);

  document.getElementById('btn-undo').addEventListener('click', function() { window.MA.history.undo(); });
  document.getElementById('btn-redo').addEventListener('click', function() { window.MA.history.redo(); });

  document.getElementById('diagram-type').addEventListener('change', function() {
    var t = this.value;
    var mod = modules[t];
    if (!mod) return;
    window.MA.history.pushHistory();
    mmdText = mod.template();
    suppressSync = true;
    editorEl.value = mmdText;
    suppressSync = false;
    window.MA.selection.clearSelection();
    scheduleRefresh();
  });

  window.MA.history.init({
    getMmdText: function() { return mmdText; },
    setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; scheduleRefresh(); },
    onUpdate: function() {},
  });

  window.MA.selection.init(function() { renderProps(); });

  scheduleRefresh();
}

function scheduleRefresh() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(refresh, RENDER_DEBOUNCE_MS);
}

function refresh() {
  var detectedType = window.MA.parserUtils.detectDiagramType(mmdText);
  var mod = detectedType ? modules[detectedType] : null;
  if (mod) currentModule = mod;

  var parsed;
  try {
    parsed = currentModule.parse(mmdText);
    statusParseEl.textContent = 'OK';
    statusParseEl.style.color = 'var(--text-secondary)';
  } catch (e) {
    statusParseEl.textContent = 'Parse error: ' + e.message;
    statusParseEl.style.color = '#ff7b72';
    parsed = { meta: {}, elements: [], relations: [], groups: [] };
  }
  statusInfoEl.textContent = (parsed.elements ? parsed.elements.length : 0) + ' elements, ' + (parsed.relations ? parsed.relations.length : 0) + ' relations';

  renderProps(parsed);
  renderSvg();
}

function renderProps(parsed) {
  if (!parsed) {
    try { parsed = currentModule.parse(mmdText); } catch (e) { parsed = { meta: {}, elements: [], relations: [], groups: [] }; }
  }
  var sel = window.MA.selection.getSelected();
  currentModule.renderProps(sel, parsed, propsEl, {
    getMmdText: function() { return mmdText; },
    setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; },
    onUpdate: function() { scheduleRefresh(); },
  });
}

function renderSvg() {
  var mode = document.getElementById('render-mode').value || 'local';
  renderStatusEl.textContent = 'Rendering\u2026';
  renderStatusEl.classList.remove('error');

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
    previewSvgEl.innerHTML = svg;
    renderStatusEl.textContent = 'OK (' + mode + ')';
  }).catch(function(err) {
    previewSvgEl.innerHTML = '<p style="color:#ff7b72;padding:20px;white-space:pre-wrap;">Render error: ' + (err.message || err) + '</p>';
    renderStatusEl.textContent = 'ERROR';
    renderStatusEl.classList.add('error');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
