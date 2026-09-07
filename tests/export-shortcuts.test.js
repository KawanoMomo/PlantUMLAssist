'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/export-shortcuts.js')]; } catch (e) {}
require('../src/core/export-shortcuts.js');
var ES = global.window.MA.exportShortcuts;

function ev(over) {
  return Object.assign({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: '' }, over);
}

describe('export-shortcuts — Export メニューのキー割り当て (design 2c)', () => {
  test('bindings: よく使う 2 つだけに割り当てる', () => {
    expect(ES.bindings().map(b => b.id)).toEqual(['exp-svg', 'exp-clipboard']);
    expect(ES.bindings().map(b => b.keys)).toEqual(['Ctrl+Shift+S', 'Ctrl+Shift+C']);
  });

  test('bindings: 返り値を書き換えても内部の表は壊れない', () => {
    var a = ES.bindings();
    a[0].keys = 'XXX';
    a.length = 0;
    expect(ES.bindings().length).toBe(2);
    expect(ES.bindings()[0].keys).toBe('Ctrl+Shift+S');
  });

  test('keyHintFor: 割り当ての無い行は空文字 (行の形を変えない)', () => {
    expect(ES.keyHintFor('exp-svg')).toBe('Ctrl+Shift+S');
    expect(ES.keyHintFor('exp-clipboard')).toBe('Ctrl+Shift+C');
    expect(ES.keyHintFor('exp-png')).toBe('');
    expect(ES.keyHintFor('exp-png-transparent')).toBe('');
    expect(ES.keyHintFor('exp-svg-all')).toBe('');
  });

  test('matchEvent: Ctrl+Shift+S / Ctrl+Shift+C が対応するボタンに当たる', () => {
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 'S' }))).toBe('exp-svg');
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 's' }))).toBe('exp-svg');
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 'C' }))).toBe('exp-clipboard');
  });

  test('matchEvent: mac の Meta でも当たる', () => {
    expect(ES.matchEvent(ev({ metaKey: true, shiftKey: true, key: 'S' }))).toBe('exp-svg');
  });

  test('matchEvent: Shift 無しのブラウザ既定 (Ctrl+S / Ctrl+C) は奪わない', () => {
    expect(ES.matchEvent(ev({ ctrlKey: true, key: 's' }))).toBeNull();
    expect(ES.matchEvent(ev({ ctrlKey: true, key: 'c' }))).toBeNull();
  });

  test('matchEvent: 修飾なし・Alt 付き・別のキーでは発火しない', () => {
    expect(ES.matchEvent(ev({ key: 's' }))).toBeNull();
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, altKey: true, key: 's' }))).toBeNull();
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 'e' }))).toBeNull();
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 'p' }))).toBeNull();
  });

  test('matchEvent: IME 変換中は素通しする / 空入力でも落ちない', () => {
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 's', isComposing: true }))).toBeNull();
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: 's', keyCode: 229 }))).toBeNull();
    expect(ES.matchEvent(null)).toBeNull();
    expect(ES.matchEvent(ev({ ctrlKey: true, shiftKey: true, key: undefined }))).toBeNull();
  });

  // BLK-builder-20260907-1403-4: 一覧の行は割り当ての差し替え先を指すため id を持つ。
  test('shortcutRows: 設定のショートカット一覧と同じ形 ({id, keys, desc}) で渡せる', () => {
    expect(ES.shortcutRows()).toEqual([
      { id: 'exp-svg', keys: 'Ctrl+Shift+S', desc: 'SVG として保存' },
      { id: 'exp-clipboard', keys: 'Ctrl+Shift+C', desc: 'クリップボードにコピー' },
    ]);
  });
});

describe('settings-tabs — 書き出しキーを一覧に足す (design 2c)', () => {
  test('shortcutRows: 既存のキーの後ろに書き出しの 2 行が並ぶ', () => {
    try { delete require.cache[require.resolve('../src/core/settings-tabs.js')]; } catch (e) {}
    require('../src/core/settings-tabs.js');
    var ST = global.window.MA.settingsTabs;
    // design 5b で一覧がグループ分けされたので、基準は GROUPS の行数の総和。
    // 書き出しの 2 つは全体のキーなので「全体」グループの末尾に合流する。
    var declared = ST.GROUPS.reduce(function(n, g) { return n + g.rows.length; }, 0);
    var rows = ST.shortcutRows();
    expect(rows.length).toBe(declared + 2);
    var globalRows = ST.shortcutGroups()[0].rows;
    // BLK-builder-20260907-1403-4: 行は id / 差し替えの可否 / 既定からの変更も持つ。
    expect(globalRows[globalRows.length - 1]).toEqual({
      id: 'exp-clipboard', keys: 'Ctrl+Shift+C', desc: 'クリップボードにコピー',
      state: 'done', remap: true, changed: false,
    });
    expect(ST.buildShortcutsHtml()).toContain('<kbd>Ctrl+Shift+S</kbd>');
  });
});
