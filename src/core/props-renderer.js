'use strict';
window.MA = window.MA || {};
window.MA.propsRenderer = (function() {
  function renderByDispatch(selData, parsedData, propsEl, dispatchers) {
    if (!propsEl) return;
    if (!selData || selData.length === 0) {
      if (dispatchers.onNoSelection) dispatchers.onNoSelection(parsedData, propsEl);
      return;
    }
    // 2-element selection: multi-select connect (Phase B)
    if (selData.length === 2 && dispatchers.onMultiSelectConnect) {
      dispatchers.onMultiSelectConnect(selData, parsedData, propsEl);
      return;
    }
    // 3+ selection (or 2 without connect handler): generic multi-select callback
    if (selData.length >= 2 && dispatchers.onMultiSelect) {
      dispatchers.onMultiSelect(selData, parsedData, propsEl);
      return;
    }
    var sel = selData[0];
    var relation = (parsedData.relations || []).find(function(r) { return r.id === sel.id; });
    if (relation && dispatchers.onRelation) {
      dispatchers.onRelation(relation, parsedData, propsEl);
      return;
    }
    var group = (parsedData.groups || []).find(function(g) { return g.id === sel.id; });
    if (group && dispatchers.onGroup) {
      dispatchers.onGroup(group, parsedData, propsEl);
      return;
    }
    var element = (parsedData.elements || []).find(function(e) {
      return e.id === sel.id && e.kind === sel.type;
    });
    if (element && dispatchers.onElement) {
      dispatchers.onElement(element, parsedData, propsEl);
      return;
    }
    if (dispatchers.onUnknown) dispatchers.onUnknown(sel, parsedData, propsEl);
  }
  return { renderByDispatch: renderByDispatch };
})();
