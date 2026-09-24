'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../src/core/html-utils.js');
require('../src/core/label-colors.js');
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
  // BLK-owner-20260924-2232-4: 本文欄は 1 行で足りる欄なので、Tab は次の欄へ移る (空白を入れない)。
  // 以前の「Tab で空白 2 つ / Shift+Tab で外す」(workspace ADR-011 のエディタ向け) は本文欄では外した。
  test('Tab は空白を入れず、ブラウザの既定 (次の欄へ移る) に任せる', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, 'hello');
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 0);
    ta.focus();
    var ev = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ta.value).toBe('hello');
    expect(ev.defaultPrevented).toBe(false);
  });

  test('Enter で確定: 末尾の空白を落として onChange を 1 回呼び、rle-enter を出す。blur でもう一度は書かない', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var got = [];
    RLE.mount(container, '', function(v) { got.push(v); });
    var ta = container.querySelector('.rle-textarea');
    var entered = 0;
    container.addEventListener('rle-enter', function() { entered++; });
    ta.value = 'request  ';
    var ev = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(got).toEqual(['request']);
    expect(entered).toBe(1);
    expect(ta.value).toBe('request');
    ta.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(got).toEqual(['request']);
  });

  test('Shift+Enter は改行のまま (確定しない)。確定すると改行は \\n で書かれる', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var got = [];
    var obj = RLE.mount(container, '', function(v) { got.push(v); });
    var ta = container.querySelector('.rle-textarea');
    var ev = new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(got.length).toBe(0);
    ta.value = 'a' + String.fromCharCode(10) + 'b' + String.fromCharCode(10);
    expect(obj.getValue()).toBe('a\\nb');
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

describe('onChange timing', function() {
  test('input event does not fire onChange (only preview updates)', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var calls = 0;
    RLE.mount(container, 'initial', function() { calls++; });
    var ta = container.querySelector('.rle-textarea');
    ta.value = 'modified';
    ta.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(calls).toBe(0);  // input では onChange 呼ばれない
  });

  test('change event fires onChange', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var calls = 0;
    RLE.mount(container, 'initial', function() { calls++; });
    var ta = container.querySelector('.rle-textarea');
    ta.value = 'modified';
    ta.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(calls).toBe(1);
  });

  test('Feature #9: clicking bold button fires onChange immediately', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var calls = 0;
    var lastVal = null;
    RLE.mount(container, 'hello', function(v) { calls++; lastVal = v; });
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 5);
    container.querySelector('.rle-b').click();
    expect(calls).toBe(1);
    expect(lastVal).toBe('<b>hello</b>');
  });

  test('Feature #9: clicking color button fires onChange immediately', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var calls = 0;
    var lastVal = null;
    RLE.mount(container, 'hello', function(v) { calls++; lastVal = v; });
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 5);
    container.querySelector('.rle-color').click();
    expect(calls).toBe(1);
    expect(lastVal.indexOf('<color:') === 0).toBe(true);
    expect(lastVal.indexOf('hello')).toBeGreaterThan(-1);
    expect(lastVal.indexOf('</color>')).toBeGreaterThan(-1);
  });

  test('Feature #9: newline button fires onChange immediately', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var calls = 0;
    RLE.mount(container, '', function() { calls++; });
    container.querySelector('.rle-newline').click();
    expect(calls).toBe(1);
  });
});

// design 2b: ツールバーは `B I U ··· ↵ creole` のみ。色は `···` の内側に畳む。
describe('design 2b color panel', function() {
  function mountFresh(value) {
    try { window.localStorage.removeItem(window.MA.labelColors.RECENT_KEY); } catch (e) {}
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, value == null ? 'hello' : value, function() {});
    return container;
  }

  test('toolbar shows the creole hint and no always-on color swatches', function() {
    var c = mountFresh();
    expect(c.querySelector('.rle-creole')).not.toBeNull();
    expect(c.querySelector('.rle-color-more')).not.toBeNull();
    // 見本はパネルの中にだけ在る
    expect(c.querySelector('.rle-color').closest('.rle-color-panel')).not.toBeNull();
  });

  test('panel is folded away until ··· is pressed', function() {
    var c = mountFresh();
    var panel = c.querySelector('.rle-color-panel');
    var more = c.querySelector('.rle-color-more');
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    more.click();
    expect(panel.hasAttribute('hidden')).toBe(true);
  });

  test('panel holds 文字色 / 色を外す / Esc で閉じる', function() {
    var c = mountFresh();
    var panel = c.querySelector('.rle-color-panel');
    expect(panel.textContent).toContain('文字色');
    expect(panel.textContent).toContain('色を外す');
    expect(panel.textContent).toContain('Esc で閉じる');
  });

  test('Esc closes the panel first, keeping rle-escape for the second Esc', function() {
    var c = mountFresh();
    var ta = c.querySelector('.rle-textarea');
    var panel = c.querySelector('.rle-color-panel');
    var escaped = 0;
    c.addEventListener('rle-escape', function() { escaped++; });
    c.querySelector('.rle-color-more').click();
    ta.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(escaped).toBe(0);
    ta.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(escaped).toBe(1);
  });

  test('a used color comes back under 最近使った色', function() {
    var c = mountFresh();
    var ta = c.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 5);
    c.querySelector('.rle-color-more').click();
    var swatch = c.querySelector('.rle-color-panel .rle-color');
    var used = swatch.getAttribute('data-color');
    swatch.click();
    var row = c.querySelector('.rle-recent-row');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('最近使った色');
    expect(row.querySelector('.rle-recent').getAttribute('data-color')).toBe(used);
  });

  test('a recent swatch inserts the color too', function() {
    var c = mountFresh();
    var ta = c.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 5);
    c.querySelector('.rle-color-more').click();
    var swatch = c.querySelector('.rle-color-panel .rle-color');
    var used = swatch.getAttribute('data-color');
    swatch.click();
    ta.value = 'hello';
    ta.setSelectionRange(0, 5);
    c.querySelector('.rle-recent-row .rle-recent').click();
    expect(ta.value).toBe('<color:' + used + '>hello</color>');
  });

  test('色を外す strips the color from the selection', function() {
    var c = mountFresh('<color:#f00>hello</color>');
    var ta = c.querySelector('.rle-textarea');
    ta.setSelectionRange(0, ta.value.length);
    c.querySelector('.rle-color-clear').click();
    expect(ta.value).toBe('hello');
  });
});

// BLK-owner-20260923-2332-prune: 見え方の欄が白い 1 行欄に見え、メッセージの本文の欄が
// 2 つあると読まれていた。打てない欄と分かる見出しを付け、空の間は出さない。
describe('見え方の欄は本文の欄と見分けられる', function() {
  test('空の本文では見え方の欄を出さない', function() {
    var c = document.createElement('div');
    document.body.appendChild(c);
    RLE.mount(c, '');
    expect(c.querySelector('.rle-preview-wrap').hidden).toBe(true);
    expect(c.querySelectorAll('textarea').length).toBe(1);
    expect(c.querySelectorAll('input[type="text"], input:not([type])').length).toBe(0);
  });
  test('打つと「図での見え方」の見出し付きで出て、消すとまた隠れる', function() {
    var c = document.createElement('div');
    document.body.appendChild(c);
    RLE.mount(c, '');
    var ta = c.querySelector('.rle-textarea');
    ta.value = 'Spi_Init';
    ta.dispatchEvent(new window.Event('input'));
    expect(c.querySelector('.rle-preview-wrap').hidden).toBe(false);
    expect(c.querySelector('.rle-preview-caption').textContent).toBe('図での見え方');
    expect(c.querySelector('.rle-preview').textContent).toBe('Spi_Init');
    ta.value = '';
    ta.dispatchEvent(new window.Event('input'));
    expect(c.querySelector('.rle-preview-wrap').hidden).toBe(true);
  });
  test('既に本文がある要素を開いたときは最初から見え方が出ている', function() {
    var c = document.createElement('div');
    document.body.appendChild(c);
    RLE.mount(c, 'Ack');
    expect(c.querySelector('.rle-preview-wrap').hidden).toBe(false);
  });
});
