'use strict';
window.MA = window.MA || {};

window.MA.autoSave = (function() {
  var KEY_CONFIG = 'plantuml-autosave-config';
  var DEFAULTS = {
    enabled: true,
    debounceMs: 1000,
    restoreMode: 'confirm',
  };

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

  function getConfig() {
    var stored = _readJson(KEY_CONFIG, {}) || {};
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
    return merged;
  }

  return {
    init: noop,
    scheduleSave: noop,
    flush: noop,
    restoreFor: function() { return null; },
    hasSavedFor: function() { return false; },
    getMeta: function() { return null; },
    clearAll: noop,
    getConfig: getConfig,
    setConfig: setConfig,
    isAvailable: isAvailable,
    onSave: noop,
  };
})();
