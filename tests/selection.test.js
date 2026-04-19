'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
require('../src/core/selection.js');
var sel = window.MA.selection;

describe('selection range', function() {
  beforeEach(function() {
    sel.init(function() {});
    sel.clearSelection();
  });
  test('getRange returns min/max line of multi-selection', function() {
    sel.setSelected([
      { type: 'message', id: 'a', line: 5 },
      { type: 'message', id: 'b', line: 8 },
      { type: 'message', id: 'c', line: 6 },
    ]);
    var r = sel.getRange();
    expect(r).toEqual({ start: 5, end: 8 });
  });
  test('getRange returns null when no selection', function() {
    expect(sel.getRange()).toBe(null);
  });
});
