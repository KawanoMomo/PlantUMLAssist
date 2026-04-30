'use strict';
window.MA = window.MA || {};

window.MA.autoSave = (function() {
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
  return {
    init: noop,
    scheduleSave: noop,
    flush: noop,
    restoreFor: function() { return null; },
    hasSavedFor: function() { return false; },
    getMeta: function() { return null; },
    clearAll: noop,
    getConfig: function() { return {}; },
    setConfig: noop,
    isAvailable: isAvailable,
    onSave: noop,
  };
})();
