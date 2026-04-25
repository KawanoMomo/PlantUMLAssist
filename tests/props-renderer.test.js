'use strict';
var PR = (typeof window !== 'undefined' && window.MA && window.MA.propsRenderer)
  || (global.window && global.window.MA && global.window.MA.propsRenderer);

function makeMockEl() { return { innerHTML: '' }; }

describe('propsRenderer.renderByDispatch', function() {
  var parsed = {
    elements: [{ kind: 'actor', id: 'U', label: 'U', line: 3 }],
    relations: [{ id: '__r_0', kind: 'association', from: 'U', to: 'L', line: 4 }],
    groups: [{ kind: 'package', id: 'pkg_0', label: 'P', startLine: 5, endLine: 7 }],
  };

  test('calls onNoSelection when selData empty', function() {
    var called = null;
    PR.renderByDispatch([], parsed, makeMockEl(), {
      onNoSelection: function() { called = 'noSel'; },
      onElement: function() { called = 'elt'; },
    });
    expect(called).toBe('noSel');
  });

  test('calls onElement for actor selection', function() {
    var got = null;
    PR.renderByDispatch([{ type: 'actor', id: 'U', line: 3 }], parsed, makeMockEl(), {
      onElement: function(e) { got = e; },
    });
    expect(got.kind).toBe('actor');
    expect(got.id).toBe('U');
  });

  test('calls onRelation for relation selection', function() {
    var got = null;
    PR.renderByDispatch([{ type: 'message', id: '__r_0', line: 4 }], parsed, makeMockEl(), {
      onRelation: function(r) { got = r; },
    });
    expect(got.id).toBe('__r_0');
  });

  test('calls onGroup for group selection', function() {
    var got = null;
    PR.renderByDispatch([{ type: 'group', id: 'pkg_0', line: 5 }], parsed, makeMockEl(), {
      onGroup: function(g) { got = g; },
    });
    expect(got.kind).toBe('package');
  });

  test('does not throw when no matching dispatcher', function() {
    expect(function() {
      PR.renderByDispatch([{ type: 'unknown', id: 'X' }], parsed, makeMockEl(), {});
    }).not.toThrow();
  });
});
