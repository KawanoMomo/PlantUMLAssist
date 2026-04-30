'use strict';
window.MA = window.MA || {};

window.MA.autoSave = (function() {
  var KEY_CONFIG = 'plantuml-autosave-config';
  var KEY_META = 'plantuml-autosave-meta';
  var DSL_PREFIX = 'plantuml-autosave-dsl-';
  var DEFAULTS = {
    enabled: true,
    debounceMs: 1000,
    restoreMode: 'confirm',
    backend: 'localStorage',
    fileDir: './autosave',
  };

  var _pending = null;       // { diagramType, dsl }
  var _timerId = null;
  var _saveListeners = [];

  function isAvailable() {
    try {
      var k = '__plantuml_autosave_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _readJson(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function _writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function _writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }
  function _readRaw(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function _fileBackendWrite(diagramType, dsl, fileDir) {
    // Fire-and-forget POST to /autosave. We don't await: localStorage
    // already has the canonical sync copy. Errors are logged but don't
    // block the localStorage write.
    // Use window.fetch so test sandboxes can stub it via global.window.fetch.
    try {
      var body = JSON.stringify({ type: diagramType, dsl: dsl, dir: fileDir || './autosave' });
      window.fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function(e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[autoSave] file write failed:', e);
        }
      });
    } catch (e) { /* fetch may not exist in test sandbox; localStorage still works */ }
  }
  function _fileBackendDelete(fileDir) {
    try {
      window.fetch('/autosave?dir=' + encodeURIComponent(fileDir || './autosave'), {
        method: 'DELETE',
        keepalive: true,
      }).catch(function() {});
    } catch (e) {}
  }
  function _fileBackendList(fileDir) {
    // Returns Promise<{files: [...types], meta: {...}|null, dir: '...'} | null>
    try {
      return window.fetch('/autosave?dir=' + encodeURIComponent(fileDir || './autosave'))
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  function _fileBackendGetOne(diagramType, fileDir) {
    // Returns Promise<string | null>
    try {
      return window.fetch('/autosave?type=' + encodeURIComponent(diagramType) + '&dir=' + encodeURIComponent(fileDir || './autosave'))
        .then(function(r) { return r.ok ? r.text() : null; })
        .catch(function() { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function getConfig() {
    var stored = _readJson(KEY_CONFIG, {});
    var out = {};
    out.enabled = (typeof stored.enabled === 'boolean') ? stored.enabled : DEFAULTS.enabled;
    out.debounceMs = (typeof stored.debounceMs === 'number' && stored.debounceMs >= 100) ? stored.debounceMs : DEFAULTS.debounceMs;
    out.restoreMode = (stored.restoreMode === 'auto' || stored.restoreMode === 'confirm' || stored.restoreMode === 'none') ? stored.restoreMode : DEFAULTS.restoreMode;
    out.backend = (stored.backend === 'localStorage' || stored.backend === 'file') ? stored.backend : DEFAULTS.backend;
    out.fileDir = (typeof stored.fileDir === 'string' && stored.fileDir.length > 0) ? stored.fileDir : DEFAULTS.fileDir;
    return out;
  }
  function setConfig(partial) {
    var merged = getConfig();
    if (partial && typeof partial === 'object') {
      if ('enabled' in partial) merged.enabled = !!partial.enabled;
      if ('debounceMs' in partial) merged.debounceMs = partial.debounceMs;
      if ('restoreMode' in partial) merged.restoreMode = partial.restoreMode;
      if ('backend' in partial) merged.backend = partial.backend;
      if ('fileDir' in partial) merged.fileDir = partial.fileDir;
    }
    _writeJson(KEY_CONFIG, merged);
    return getConfig();
  }

  function _doWrite(diagramType, dsl) {
    var ok = _writeRaw(DSL_PREFIX + diagramType, dsl);
    if (!ok) return null;
    var meta = { lastSavedAt: new Date().toISOString(), lastSavedType: diagramType };
    _writeJson(KEY_META, meta);
    // If file backend selected, mirror the write to disk via the server.
    var cfg = getConfig();
    if (cfg.backend === 'file') {
      _fileBackendWrite(diagramType, dsl, cfg.fileDir);
    }
    for (var i = 0; i < _saveListeners.length; i++) {
      try { _saveListeners[i](meta); } catch (e) { /* listener errors must not block */ }
    }
    return meta;
  }

  function flush() {
    if (_timerId != null) {
      try { clearTimeout(_timerId); } catch (e) {}
      _timerId = null;
    }
    if (_pending == null) return;
    var p = _pending;
    _pending = null;
    var cfg = getConfig();
    if (!cfg.enabled) return;
    _doWrite(p.diagramType, p.dsl);
  }

  function scheduleSave(diagramType, dsl) {
    if (!diagramType) return;
    var cfg = getConfig();
    if (!cfg.enabled) return;
    _pending = { diagramType: diagramType, dsl: String(dsl == null ? '' : dsl) };
    if (_timerId != null) {
      try { clearTimeout(_timerId); } catch (e) {}
    }
    _timerId = setTimeout(flush, cfg.debounceMs);
  }

  function restoreFor(diagramType) {
    if (!diagramType) return null;
    return _readRaw(DSL_PREFIX + diagramType);
  }
  function hasSavedFor(diagramType) {
    return restoreFor(diagramType) != null;
  }
  function getMeta() {
    return _readJson(KEY_META, null);
  }

  function clearAll() {
    var keysToRemove = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && (k.indexOf(DSL_PREFIX) === 0 || k === KEY_META)) {
          keysToRemove.push(k);
        }
      }
    } catch (e) { /* best-effort */ }
    for (var j = 0; j < keysToRemove.length; j++) {
      try { window.localStorage.removeItem(keysToRemove[j]); } catch (e) {}
    }
    // If file backend selected, also wipe the server-side directory.
    var cfg = getConfig();
    if (cfg.backend === 'file') {
      _fileBackendDelete(cfg.fileDir);
    }
  }

  function onSave(listener) {
    if (typeof listener === 'function') _saveListeners.push(listener);
  }

  // init() returns either undefined (sync, localStorage backend) or a
  // Promise (async, file backend hydrating localStorage from disk).
  // app.js bootRestore must check for the Promise and await it before
  // doing the restoreFor() lookups.
  function init() {
    var cfg = getConfig();
    if (cfg.backend !== 'file') return;
    return _fileBackendList(cfg.fileDir).then(function(data) {
      if (!data || !Array.isArray(data.files)) return;
      // Fetch every file in parallel and seed localStorage with them.
      var promises = data.files.map(function(t) {
        return _fileBackendGetOne(t, cfg.fileDir).then(function(text) {
          if (text != null) {
            try { window.localStorage.setItem(DSL_PREFIX + t, text); } catch (e) {}
          }
        });
      });
      // Update meta from server's record (more authoritative)
      if (data.meta) {
        try { window.localStorage.setItem(KEY_META, JSON.stringify(data.meta)); } catch (e) {}
      }
      return Promise.all(promises).then(function() { return data; });
    });
  }

  return {
    init: init,
    scheduleSave: scheduleSave,
    flush: flush,
    restoreFor: restoreFor,
    hasSavedFor: hasSavedFor,
    getMeta: getMeta,
    clearAll: clearAll,
    getConfig: getConfig,
    setConfig: setConfig,
    isAvailable: isAvailable,
    onSave: onSave,
  };
})();
