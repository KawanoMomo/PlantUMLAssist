'use strict';
// BLK-primary-20260909-0303: ⇄ 一括置換は design 7b の既定でタブ列から畳まれており、
// 入口がツールメニューか Ctrl+K のコマンド名しか無い。同じ手順の手数が「今どのボタンが
// 出ているか」で上下しないよう、単独キー Ctrl+H を与え、ツールメニューにもそれを出す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/export-shortcuts.js')]; } catch (e) {}
require('../src/core/export-shortcuts.js');
try { delete require.cache[require.resolve('../src/core/settings-tabs.js')]; } catch (e) {}
require('../src/core/settings-tabs.js');
try { delete require.cache[require.resolve('../src/core/key-bindings.js')]; } catch (e) {}
require('../src/core/key-bindings.js');
try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');

var ST = global.window.MA.settingsTabs;
var KB = global.window.MA.keyBindings;
var TM = global.window.MA.toolMenu;

function ev(opts) {
  return {
    key: opts.key,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    altKey: !!opts.alt,
    shiftKey: !!opts.shift,
    isComposing: false,
    keyCode: 0,
  };
}

function rowOf(id) {
  return ST.defaultRows().filter(function(r) { return r.id === id; })[0] || null;
}

describe('一括置換に単独キーがある', () => {
  test('ショートカット表の「全体」に実装済みとして載る', () => {
    KB.resetAll();
    var row = rowOf('bulk-rename');
    expect(row).not.toBe(null);
    expect(row.keys).toBe('Ctrl+H');
    expect(row.state).toBe('done');

    var global_ = ST.defaultGroups().filter(function(g) { return g.id === 'global'; })[0];
    expect(global_.rows.some(function(r) { return r.id === 'bulk-rename'; })).toBe(true);
  });

  test('Ctrl+H が一括置換に当たり、他の全体キーとは衝突しない', () => {
    KB.resetAll();
    expect(KB.matches('bulk-rename', ev({ key: 'h', ctrl: true }))).toBe(true);
    expect(KB.matches('bulk-rename', ev({ key: 'H', ctrl: true, shift: true }))).toBe(false);
    expect(KB.matches('bulk-rename', ev({ key: 'h' }))).toBe(false);
    expect(KB.matchEvent(ev({ key: 'h', ctrl: true }))).toBe('bulk-rename');
    expect(KB.conflictOf('bulk-rename', 'Ctrl+H')).toBe(null);
  });

  test('他の割り当てと同じく差し替えられる (design 5b)', () => {
    KB.resetAll();
    expect(KB.isRemappable('bulk-rename')).toBe(true);
    var res = KB.setBinding('bulk-rename', 'Ctrl+Alt+R');
    expect(res.ok).toBe(true);
    expect(KB.keysFor('bulk-rename')).toBe('Ctrl+Alt+R');
    expect(KB.matches('bulk-rename', ev({ key: 'r', ctrl: true, alt: true }))).toBe(true);
    // 既に使われているキーは奪えない。
    expect(KB.setBinding('bulk-rename', 'Ctrl+K').ok).toBe(false);
  });
});

describe('ツールメニューがそのキーを見せる', () => {
  test('一括置換の行にだけ、いま効いているキーが出る', () => {
    KB.resetAll();
    expect(TM.keyHintOf('btn-tab-rename')).toBe('Ctrl+H');
    expect(TM.keyHintOf('btn-tab-apply')).toBe('');

    var html = TM.buildMenuHtml({});
    expect(html).toContain('<span class="tool-menu-key">Ctrl+H</span>');
    // キーを持たない項目に空の枠を作らない。
    expect(html.split('tool-menu-key').length - 1).toBe(1);
  });

  test('差し替えたら表示も追随する (表と食い違わせない)', () => {
    KB.resetAll();
    KB.setBinding('bulk-rename', 'Ctrl+Alt+R');
    expect(TM.keyHintOf('btn-tab-rename')).toBe('Ctrl+Alt+R');
    expect(TM.buildMenuHtml({})).toContain('>Ctrl+Alt+R<');
  });

  test('件数の badge と並んでも両方出る', () => {
    KB.resetAll();
    var html = TM.buildMenuHtml({ 'btn-tab-rename': '3' });
    expect(html).toContain('<span class="tool-menu-key">Ctrl+H</span>'
      + '<span class="tool-menu-badge">3</span>');
  });
});

KB.resetAll();
