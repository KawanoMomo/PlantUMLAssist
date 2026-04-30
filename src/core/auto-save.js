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
  };

  var _pending = null;       // { diagramType, dsl }
  var _timerId = null;
  var _saveListeners = [];

  function noop() {}

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

  function getConfig() {
    var stored = _readJson(KEY_CONFIG, {});
    var out = {};
    out.enabled = (typeof stored.enabled === 'boolean') ? stored.enabled : DEFAULTS.enabled;
    out.debounceMs = (typeof stored.debounceMs === 'number' && stored.debounceMs >= 100) ? stored.debounceMs : DEFAULTS.debounceMs;
    out.restoreMode = (stored.restoreMode === 'auto' || stored.restoreMode === 'confirm' || stored.restoreMode === 'none') ? stored.restoreMode : DEFAULTS.restoreMode;
    return out;
  }
  function setConfig(partial) {
    var merged = getConfig();
    if (partial && typeof partial === 'object') {
      if ('enabled' in partial) merged.enabled = !!partial.enabled;
      if ('debounceMs' in partial) merged.debounceMs = partial.debounceMs;
      if ('restoreMode' in partial) merged.restoreMode = partial.restoreMode;
    }
    _writeJson(KEY_CONFIG, merged);
    return getConfig();
  }

  function _doWrite(diagramType, dsl) {
    var ok = _writeRaw(DSL_PREFIX + diagramType, dsl);
    if (!ok) return null;
    var meta = { lastSavedAt: new Date().toISOString(), lastSavedType: diagramType };
    _writeJson(KEY_META, meta);
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
  }

  function onSave(listener) {
    if (typeof listener === 'function') _saveListeners.push(listener);
  }

  function init() {
    // app.js wires visibilitychange / beforeunload separately (Task 7).
    // Nothing to do here yet.
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
