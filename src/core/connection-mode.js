'use strict';
window.MA = window.MA || {};
window.MA.connectionMode = (function() {
  var active = false;
  var sourceType = null;
  var sourceId = null;
  var onCompleteCallback = null;

  function startConnectionMode(srcType, srcId, onComplete) {
    active = true;
    sourceType = srcType;
    sourceId = srcId;
    onCompleteCallback = onComplete;
  }

  function cancelConnectionMode() {
    active = false;
    sourceType = null;
    sourceId = null;
    onCompleteCallback = null;
  }

  function isInConnectionMode() {
    return active;
  }

  function notifyTarget(targetType, targetId) {
    if (!active || !onCompleteCallback) return;
    var cb = onCompleteCallback;
    var src = { type: sourceType, id: sourceId };
    cancelConnectionMode();
    cb(src, { type: targetType, id: targetId });
  }

  function getSource() {
    return active ? { type: sourceType, id: sourceId } : null;
  }

  return {
    startConnectionMode: startConnectionMode,
    cancelConnectionMode: cancelConnectionMode,
    isInConnectionMode: isInConnectionMode,
    notifyTarget: notifyTarget,
    getSource: getSource,
  };
})();
