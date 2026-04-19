'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../src/core/html-utils.js');
require('../src/ui/rich-label-editor.js');
var RLE = window.MA.richLabelEditor;

describe('plantumlToHtml', function() {
  test('converts \\n to <br>', function() {
    expect(RLE.plantumlToHtml('line1\\nline2')).toBe('line1<br>line2');
  });
  test('converts <color:red>x</color> to span', function() {
    expect(RLE.plantumlToHtml('<color:red>x</color>')).toBe('<span style="color:red">x</span>');
  });
  test('converts <b>x</b> to bold', function() {
    expect(RLE.plantumlToHtml('<b>x</b>')).toContain('<b>x</b>');
  });
  test('escapes HTML in plain text', function() {
    expect(RLE.plantumlToHtml('a < b')).toBe('a &lt; b');
  });
});

describe('insertWrapAtSelection', function() {
  test('wraps selected text with given open/close tags', function() {
    var ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.value = 'hello world';
    ta.setSelectionRange(0, 5);
    RLE.insertWrapAtSelection(ta, '<b>', '</b>');
    expect(ta.value).toBe('<b>hello</b> world');
  });
});

describe('keyboard handling', function() {
  test('Tab inserts 2 spaces (workspace ADR-011)', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, 'hello');
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 0);
    ta.focus();
    var ev = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ta.value.substring(0, 2)).toBe('  ');
  });

  test('Shift+Tab removes leading 2 spaces (outdent)', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, '  hello');
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(4, 4);
    ta.focus();
    var ev = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ta.value).toBe('hello');
  });

  test('Escape dispatches rle-escape custom event', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, 'x');
    var ta = container.querySelector('.rle-textarea');
    var fired = false;
    container.addEventListener('rle-escape', function() { fired = true; });
    var ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(fired).toBe(true);
  });
});
