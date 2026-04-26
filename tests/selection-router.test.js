'use strict';
var jsdom = require('jsdom');

// run-tests.js が先に sandbox.window.MA に各 core モジュールを登録している。
// jsdom の window に置き換えると後続テスト (parser-utils 等) が落ちるため、
// 既存 window を保存し、本ファイル末尾で復元する。
// (overlay-builder.test.js と同じパターン)
var prevWindow = global.window;
var prevDocument = global.document;

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.MouseEvent = dom.window.MouseEvent;

// require.cache を落として selection.js / selection-router.js の IIFE を
// 現在の global.window で再実行させる。
try { delete require.cache[require.resolve('../src/core/selection.js')]; } catch (e) {}
require('../src/core/selection.js');
try { delete require.cache[require.resolve('../src/core/selection-router.js')]; } catch (e) {}
require('../src/core/selection-router.js');

var SR = (typeof window !== 'undefined' && window.MA && window.MA.selectionRouter)
  || (global.window && global.window.MA && global.window.MA.selectionRouter);
var Sel = (typeof window !== 'undefined' && window.MA && window.MA.selection)
  || (global.window && global.window.MA && global.window.MA.selection);

describe('selectionRouter.bind', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="selectable" data-type="actor" data-id="A" data-line="3" x="0" y="0" width="50" height="50"/>' +
      '<rect class="selectable" data-type="usecase" data-id="U" data-line="4" x="60" y="0" width="50" height="50"/>' +
      '</svg>';
    Sel.clearSelection();
  });

  test('click on rect selects single item', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    var r = ov.querySelector('[data-id="A"]');
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    var sel = Sel.getSelected();
    expect(sel.length).toBe(1);
    expect(sel[0].id).toBe('A');
    expect(sel[0].type).toBe('actor');
    expect(sel[0].line).toBe(3);
  });

  test('shift+click adds to selection', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    ov.querySelector('[data-id="A"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ov.querySelector('[data-id="U"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(Sel.getSelected().length).toBe(2);
  });

  test('clicking same item again toggles off', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    var r = ov.querySelector('[data-id="A"]');
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(Sel.getSelected().length).toBe(0);
  });

  test('shift+click on already-selected item removes it (multi toggle)', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    ov.querySelector('[data-id="A"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ov.querySelector('[data-id="U"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    ov.querySelector('[data-id="U"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    var sel = Sel.getSelected();
    expect(sel.length).toBe(1);
    expect(sel[0].id).toBe('A');
  });

  test('click on non-selectable area clears selection', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    ov.querySelector('[data-id="A"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(Sel.getSelected().length).toBe(0);
  });
});

describe('selectionRouter.applyHighlight', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="selectable" data-type="actor" data-id="A"/>' +
      '<rect class="selectable" data-type="actor" data-id="A"/>' +
      '<rect class="selectable" data-type="usecase" data-id="U"/>' +
      '</svg>';
  });
  test('adds .selected class to all rects with matching type+id', function() {
    var ov = document.getElementById('ov');
    SR.applyHighlight(ov, [{ type: 'actor', id: 'A' }]);
    var sel = ov.querySelectorAll('rect.selected');
    expect(sel.length).toBe(2);
  });
  test('removes .selected from all when selData is empty', function() {
    var ov = document.getElementById('ov');
    SR.applyHighlight(ov, [{ type: 'actor', id: 'A' }]);
    SR.applyHighlight(ov, []);
    expect(ov.querySelectorAll('rect.selected').length).toBe(0);
  });

  test('non-matching selection clears highlight', function() {
    var ov = document.getElementById('ov');
    SR.applyHighlight(ov, [{ type: 'actor', id: 'A' }]);
    SR.applyHighlight(ov, [{ type: 'usecase', id: 'U' }]);
    var sel = ov.querySelectorAll('rect.selected');
    expect(sel.length).toBe(1);
    expect(sel[0].getAttribute('data-id')).toBe('U');
  });
});

// jsdom window を run-tests.js が用意した sandbox window に戻す。
// これをしないと後続 test ファイル (parser-utils, regex-parts 等) が
// window.MA.* を見失って失敗する。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;

// require.cache を落とすことで、後続の selection.test.js が
// require('../src/core/selection.js') した際に
// 自分の jsdom window 上で IIFE を再実行できるようにする。
try { delete require.cache[require.resolve('../src/core/selection.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/selection-router.js')]; } catch (e) {}
