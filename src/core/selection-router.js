'use strict';
window.MA = window.MA || {};
window.MA.selectionRouter = (function() {

  function _itemFromTarget(target) {
    if (!target.getAttribute) return null;
    var type = target.getAttribute('data-type');
    var id = target.getAttribute('data-id');
    if (!type || !id) return null;
    var line = parseInt(target.getAttribute('data-line'), 10);
    var item = { type: type, id: id, line: isNaN(line) ? null : line };
    if (type === 'member') {
      item.parentId = target.getAttribute('data-parent-id');
      item.parentKind = target.getAttribute('data-parent-kind');
      var mi = parseInt(target.getAttribute('data-member-index'), 10);
      item.memberIndex = isNaN(mi) ? null : mi;
      item.memberKind = target.getAttribute('data-member-kind');
    }
    return item;
  }

  function _isSameItem(a, b) {
    return a && b && a.type === b.type && a.id === b.id;
  }

  function _coerceMembersToParent(items) {
    return items.map(function(it) {
      if (it.type === 'member') {
        return { type: it.parentKind || 'class', id: it.parentId };
      }
      return it;
    });
  }

  function bind(overlayEl, opts) {
    if (!overlayEl) return;
    overlayEl.addEventListener('click', function(e) {
      var item = _itemFromTarget(e.target);
      if (!item) {
        if (!e.shiftKey) window.MA.selection.clearSelection();
        return;
      }

      var current = window.MA.selection.getSelected() || [];

      if (e.shiftKey) {
        var existing = current.filter(function(s) { return _isSameItem(s, item); });
        var nextSelection;
        if (existing.length > 0) {
          nextSelection = current.filter(function(s) { return !_isSameItem(s, item); });
        } else {
          nextSelection = current.concat([item]);
        }
        // Coerce members to parent for multi-select connect compatibility
        var coerced = _coerceMembersToParent(nextSelection);
        // Dedup by type:id after coerce
        var seen = {};
        var deduped = coerced.filter(function(s) {
          var k = s.type + ':' + s.id;
          if (seen[k]) return false;
          seen[k] = true;
          return true;
        });
        window.MA.selection.setSelected(deduped);
      } else {
        if (current.length === 1 && _isSameItem(current[0], item)) {
          window.MA.selection.clearSelection();
        } else {
          window.MA.selection.setSelected([item]);
        }
      }
    });
  }

  function applyHighlight(overlayEl, selData) {
    if (!overlayEl) return;
    var all = overlayEl.querySelectorAll('rect.selectable');
    Array.prototype.forEach.call(all, function(r) { r.classList.remove('selected'); });
    if (!selData || selData.length === 0) return;
    selData.forEach(function(s) {
      var rects = overlayEl.querySelectorAll(
        'rect[data-type="' + s.type + '"][data-id="' + s.id + '"]'
      );
      Array.prototype.forEach.call(rects, function(r) { r.classList.add('selected'); });
    });
  }

  return {
    bind: bind,
    applyHighlight: applyHighlight,
  };
})();
