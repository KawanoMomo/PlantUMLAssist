'use strict';
window.MA = window.MA || {};
window.MA.selection = (function() {
  var sel = [];
  var onChange = function() {};

  function init(callback) {
    onChange = callback || function() {};
  }

  function getSelected() {
    return sel.slice();
  }

  function setSelected(newSel) {
    sel = newSel.slice();
    onChange();
  }

  function isSelected(id) {
    return sel.some(function(s) { return s.id === id; });
  }

  function selectItem(type, id, multi) {
    if (multi) {
      var found = false;
      for (var i = 0; i < sel.length; i++) {
        if (sel[i].id === id) {
          sel.splice(i, 1);
          found = true;
          break;
        }
      }
      if (!found) {
        sel.push({ type: type, id: id });
      }
    } else {
      if (sel.length === 1 && sel[0].id === id) {
        sel = [];
      } else {
        sel = [{ type: type, id: id }];
      }
    }
    onChange();
  }

  function clearSelection() {
    sel = [];
    onChange();
  }

  return {
    init: init,
    getSelected: getSelected,
    setSelected: setSelected,
    isSelected: isSelected,
    selectItem: selectItem,
    clearSelection: clearSelection,
  };
})();
