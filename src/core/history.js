'use strict';
window.MA = window.MA || {};
window.MA.history = (function() {
  var MAX_HISTORY = 80;
  var undoStack = [];
  var future = [];
  var state = {
    getMmdText: function() { return ''; },
    setMmdText: function(t) {},
    onUpdate: function() {},
  };

  function init(opts) {
    state.getMmdText = opts.getMmdText;
    state.setMmdText = opts.setMmdText;
    state.onUpdate = opts.onUpdate || function() {};
  }

  function pushHistory() {
    undoStack.push(state.getMmdText());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    future = [];
    state.onUpdate();
  }

  function undo() {
    if (undoStack.length === 0) return;
    future.push(state.getMmdText());
    state.setMmdText(undoStack.pop());
    state.onUpdate();
  }

  function redo() {
    if (future.length === 0) return;
    undoStack.push(state.getMmdText());
    state.setMmdText(future.pop());
    state.onUpdate();
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return future.length > 0; }

  return {
    init: init,
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
  };
})();
