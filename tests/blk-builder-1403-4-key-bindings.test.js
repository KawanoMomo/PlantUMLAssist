'use strict';
// BLK-builder-20260907-1403-4 (design 5b): ショートカットの割り当てを差し替える。
// ランナーは全テストを 1 プロセスで動かすので、window は既にあれば使う。
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

var ST = global.window.MA.settingsTabs;
var KB = global.window.MA.keyBindings;

// jsdom の localStorage は共有なので、各 test の頭で既定に戻す。
function reset() { KB.resetAll(); }

function ev(opts) {
  return {
    key: opts.key,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    altKey: !!opts.alt,
    shiftKey: !!opts.shift,
    isComposing: false,
    keyCode: opts.keyCode || 0,
  };
}

describe('key-bindings — 割り当ての差し替え (design 5b)', () => {
  test('format: 修飾キー付きの打鍵を一覧と同じ表記にそろえる', () => {
    reset();
    expect(KB.format(ev({ key: 'r', ctrl: true }))).toBe('Ctrl+R');
    expect(KB.format(ev({ key: 'S', ctrl: true, shift: true }))).toBe('Ctrl+Shift+S');
    expect(KB.format(ev({ key: 'ArrowUp', alt: true }))).toBe('Alt+↑');
    expect(KB.format(ev({ key: 'Enter', ctrl: true }))).toBe('Ctrl+Enter');
    // Meta は Ctrl と同じ扱い (mac)
    expect(KB.format(ev({ key: 'k', meta: true }))).toBe('Ctrl+K');
  });

  test('format: 修飾なし / 修飾キーだけ / IME 変換中は割り当てとして受けない', () => {
    reset();
    expect(KB.format(ev({ key: 'a' }))).toBe(null);
    expect(KB.format(ev({ key: 'A', shift: true }))).toBe(null);
    expect(KB.format(ev({ key: 'Control', ctrl: true }))).toBe(null);
    expect(KB.format(ev({ key: 'Shift', shift: true, ctrl: true }))).toBe(null);
    expect(KB.format({ key: 'r', ctrlKey: true, isComposing: true })).toBe(null);
    expect(KB.format({ key: 'r', ctrlKey: true, keyCode: 229 })).toBe(null);
    expect(KB.format(null)).toBe(null);
  });

  test('既定では一覧のキーがそのまま効く', () => {
    reset();
    expect(KB.keysFor('render')).toBe('Ctrl+R');
    expect(KB.keysFor('palette')).toBe('Ctrl+K');
    expect(KB.matches('render', ev({ key: 'r', ctrl: true }))).toBe(true);
    expect(KB.matches('render', ev({ key: 's', ctrl: true }))).toBe(false);
  });

  test('差し替えると新しいキーが効き、古いキーは効かなくなる', () => {
    reset();
    var res = KB.setBinding('render', 'Ctrl+Alt+R');
    expect(res.ok).toBe(true);
    expect(KB.keysFor('render')).toBe('Ctrl+Alt+R');
    expect(KB.matches('render', ev({ key: 'r', ctrl: true, alt: true }))).toBe(true);
    expect(KB.matches('render', ev({ key: 'r', ctrl: true }))).toBe(false);
    reset();
    expect(KB.keysFor('render')).toBe('Ctrl+R');
  });

  test('既に別の操作に割り当てられているキーは保存せず、相手を返す', () => {
    reset();
    var res = KB.setBinding('render', 'Ctrl+K');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('conflict');
    expect(res.conflict.id).toBe('palette');
    expect(KB.keysFor('render')).toBe('Ctrl+R');   // 変わっていない
  });

  test('差し替え後のキーとも衝突を見る (既定だけを見ない)', () => {
    reset();
    KB.setBinding('render', 'Ctrl+Alt+R');
    var res = KB.setBinding('save', 'Ctrl+Alt+R');
    expect(res.ok).toBe(false);
    expect(res.conflict.id).toBe('render');
    // 空いた既定 (Ctrl+R) は別の操作が取れる
    expect(KB.setBinding('save', 'Ctrl+R').ok).toBe(true);
    reset();
  });

  test('範囲・素キーの行 (Ctrl+1 … Ctrl+6 など) は差し替え対象外', () => {
    reset();
    expect(KB.isRemappable('view-type')).toBe(false);
    expect(KB.isRemappable('sel-move')).toBe(false);
    expect(KB.isRemappable('undo-redo')).toBe(false);
    expect(KB.isRemappable('render')).toBe(true);
    expect(KB.isRemappable('exp-svg')).toBe(true);
    expect(KB.setBinding('view-type', 'Ctrl+Alt+T').reason).toBe('not-remappable');
  });

  test('既定と同じキーに戻したら差し替えとして覚えない', () => {
    reset();
    KB.setBinding('save', 'Ctrl+Alt+S');
    expect(Object.keys(KB.readOverrides())).toEqual(['save']);
    KB.setBinding('save', 'Ctrl+S');
    expect(KB.readOverrides().save).toBe(undefined);
    reset();
  });

  test('resetAll: 全部の差し替えが消えて既定に戻る', () => {
    reset();
    KB.setBinding('render', 'Ctrl+Alt+R');
    KB.setBinding('save', 'Ctrl+Alt+S');
    expect(Object.keys(KB.readOverrides()).length).toBe(2);
    KB.resetAll();
    expect(KB.readOverrides()).toEqual({});
    expect(KB.keysFor('render')).toBe('Ctrl+R');
    expect(KB.keysFor('save')).toBe('Ctrl+S');
  });

  test('matchEvent: 差し替え済みのキーから操作の id を引ける (Export も同じ表)', () => {
    reset();
    expect(KB.matchEvent(ev({ key: 'S', ctrl: true, shift: true }))).toBe('exp-svg');
    KB.setBinding('exp-svg', 'Ctrl+Alt+1');
    expect(KB.matchEvent(ev({ key: '1', ctrl: true, alt: true }))).toBe('exp-svg');
    expect(KB.matchEvent(ev({ key: 'S', ctrl: true, shift: true }))).toBe(null);
    reset();
    expect(KB.matchEvent(ev({ key: 'a' }))).toBe(null);
  });
});

describe('settings-tabs — 差し替えを表に出す (design 5b)', () => {
  test('表の行は id を持ち、差し替えできる行だけ押せる形になる', () => {
    reset();
    var html = ST.buildShortcutsHtml('');
    expect(html).toContain('data-sc-id="render"');
    expect(html).toContain('data-sc-remap="1"');
    expect(html).toContain('data-sc-remap="0"');
    expect(html).toContain('role="button"');
  });

  test('差し替えたキーが表にも出て、「変更」の印が付く', () => {
    reset();
    expect(ST.buildShortcutsHtml('')).toContain('<kbd>Ctrl+R</kbd>');
    KB.setBinding('render', 'Ctrl+Alt+R');
    var html = ST.buildShortcutsHtml('');
    expect(html).toContain('<kbd>Ctrl+Alt+R</kbd>');
    expect(html).toContain('cfg-sc-changed');
    expect(html).not.toContain('<kbd>Ctrl+R</kbd>');
    reset();
  });

  test('キー待ちの行だけ「キーを押してください」に変わる', () => {
    reset();
    var html = ST.buildShortcutsHtml('', 'save');
    expect(html).toContain('cfg-sc-capturing');
    expect(html).toContain('キーを押してください');
    // 待っていない行のキー表示はそのまま
    expect(html).toContain('<kbd>Ctrl+R</kbd>');
  });

  test('既定の一覧 (defaultRows) は差し替えに影響されない', () => {
    reset();
    KB.setBinding('render', 'Ctrl+Alt+R');
    var def = ST.defaultRows().filter(function(r) { return r.id === 'render'; })[0];
    expect(def.keys).toBe('Ctrl+R');
    reset();
  });

  test('Export の 2 つも同じ表に載る (割り当ての衝突を 1 枚で見つけられる)', () => {
    reset();
    var ids = ST.shortcutRows().map(function(r) { return r.id; });
    expect(ids.indexOf('exp-svg')).toBeGreaterThan(-1);
    expect(ids.indexOf('exp-clipboard')).toBeGreaterThan(-1);
    expect(ids.indexOf('')).toBe(-1);
  });
});
