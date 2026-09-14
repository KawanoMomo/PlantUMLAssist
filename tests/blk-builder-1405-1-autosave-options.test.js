'use strict';
// BLK-builder-20260907-1405-1: design 1a の設定「自動保存」タブ —
// 保存間隔のセグメント、起動時の復元カード、保存先カード。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/autosave-options.js')]; } catch (e) {}
require('../src/core/autosave-options.js');
var AO = global.window.MA.autosaveOptions;

describe('保存間隔 / Debounce', function() {
  test('design 1a の 4 択がこの順で並ぶ', function() {
    expect(AO.DEBOUNCE_CHOICES.map(function(c) { return c.value; })).toEqual([500, 1000, 2000, 5000]);
    expect(AO.DEBOUNCE_CHOICES.map(function(c) { return c.label; })).toEqual(['500ms', '1s', '2s', '5s']);
  });

  test('選択肢どおりの値はそのまま通る', function() {
    expect(AO.normalizeDebounce(500)).toBe(500);
    expect(AO.normalizeDebounce('2000')).toBe(2000);
  });

  test('未指定は既定 (1s)。0 と取り違えない', function() {
    expect(AO.normalizeDebounce(undefined)).toBe(1000);
    expect(AO.normalizeDebounce(null)).toBe(1000);
    expect(AO.normalizeDebounce('')).toBe(1000);
    expect(AO.normalizeDebounce('abc')).toBe(1000);
  });

  test('選択肢から外れた保存値は一番近いチップに寄る', function() {
    expect(AO.normalizeDebounce(700)).toBe(500);
    expect(AO.normalizeDebounce(1600)).toBe(2000);
    expect(AO.normalizeDebounce(99999)).toBe(5000);
  });
});

describe('起動時の復元 / On startup', function() {
  test('3 枚のカードが design 1a の順に出る', function() {
    var cards = AO.restoreCards('confirm');
    expect(cards.map(function(c) { return c.id; })).toEqual(['confirm', 'auto', 'none']);
    expect(cards[0].title).toBe('確認してから復元');
    expect(cards[2].title).toBe('復元しない（常にテンプレート）');
  });

  test('「確認してから復元」だけが推奨バッジと説明文を持つ', function() {
    var cards = AO.restoreCards('auto');
    expect(cards[0].badge).toEqual({ text: '推奨', tone: 'ok' });
    expect(cards[0].desc).toBe('前回の DSL があればダイアログで尋ねます。');
    expect(cards[1].badge).toBe(null);
    cards.forEach(function(c) { expect(typeof c.desc).toBe('string'); expect(c.desc.length).toBeGreaterThan(0); });
  });

  test('選ばれているカードにだけ checked が付く', function() {
    var cards = AO.restoreCards('none');
    expect(cards.filter(function(c) { return c.checked; }).map(function(c) { return c.id; })).toEqual(['none']);
  });

  test('知らない値は確認モードに寄せる (画面が無選択にならない)', function() {
    expect(AO.normalizeRestoreMode('nope')).toBe('confirm');
    expect(AO.normalizeRestoreMode(undefined)).toBe('confirm');
    expect(AO.restoreCards('nope')[0].checked).toBe(true);
  });
});

describe('保存先 / Backend', function() {
  test('2 枚のカードが localStorage / ファイル の順に出る', function() {
    var cards = AO.backendCards('localStorage');
    expect(cards.map(function(c) { return c.id; })).toEqual(['localStorage', 'file']);
    expect(cards[0].desc).toContain('ブラウザ内・高速');
    expect(cards[1].desc).toContain('ディスク永続・git 管理可');
  });

  test('選ばれているカードにだけ checked が付く', function() {
    var cards = AO.backendCards('file');
    expect(cards.filter(function(c) { return c.checked; }).map(function(c) { return c.id; })).toEqual(['file']);
  });

  test('知らない値は localStorage に寄せる', function() {
    expect(AO.normalizeBackend('sqlite')).toBe('localStorage');
    expect(AO.normalizeBackend(null)).toBe('localStorage');
  });

  test('保存先ディレクトリ欄は file のときだけ要る', function() {
    expect(AO.needsFileDir('file')).toBe(true);
    expect(AO.needsFileDir('localStorage')).toBe(false);
    expect(AO.needsFileDir(undefined)).toBe(false);
  });
});
