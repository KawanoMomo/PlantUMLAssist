'use strict';
// BLK-reviewer-20260907-0803: 前回保存時点との差分の有無を図ごとに持つ。
// レビューが「毎回全文 diff」から「変更ありの図だけ読む」に変わることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/save-diff.js')]; } catch (e) {}
require('../src/core/save-diff.js');
// 共有 window の localStorage は無い (run-tests.js の素の object) か、opaque origin の
// jsdom で参照すると例外を投げる。どちらでも動くよう、素の実装を必ず差し込む。
var _store = {};
Object.defineProperty(global.window, 'localStorage', {
  configurable: true,
  value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
  },
});

var SD = global.window.MA.saveDiff;

var A = ['@startuml', 'participant Spi_Driver', 'Spi_Driver -> Hal : Spi_Init()', '@enduml'].join('\n');
var B = ['@startuml', 'participant Spi_Driver', 'Spi_Driver -> Hal : Spi_Transmit()', '@enduml'].join('\n');

describe('save-diff', function() {
  beforeEach(function() { SD.reset(); });

  test('基準が無い図は new', function() {
    expect(SD.statusOf('Spi', A)).toBe('new');
    expect(SD.isDirty('Spi', A)).toBe(true);
  });

  test('保存した時点を基準にすると same になる', function() {
    SD.mark('Spi', A);
    expect(SD.statusOf('Spi', A)).toBe('same');
    expect(SD.isDirty('Spi', A)).toBe(false);
  });

  test('中身が変われば changed', function() {
    SD.mark('Spi', A);
    expect(SD.statusOf('Spi', B)).toBe('changed');
  });

  test('改行コード・行末空白・末尾の空行は差分にしない', function() {
    SD.mark('Spi', A);
    expect(SD.statusOf('Spi', A.replace(/\n/g, '\r\n'))).toBe('same');
    expect(SD.statusOf('Spi', A + '\n\n')).toBe('same');
    expect(SD.statusOf('Spi', A.split('\n').join('   \n'))).toBe('same');
  });

  test('forget で基準を捨てると new に戻る', function() {
    SD.mark('Spi', A);
    expect(SD.forget('Spi')).toBe(true);
    expect(SD.statusOf('Spi', A)).toBe('new');
    expect(SD.forget('Spi')).toBe(false);
  });

  test('markAll は開いている図をまとめて基準にする', function() {
    var docs = [{ name: 'Spi', dsl: A }, { name: 'Can', dsl: B }];
    expect(SD.markAll(docs).length).toBe(2);
    expect(SD.summary(docs).hasChange).toBe(false);
  });

  test('summary は変更あり・新規・変更なしを分けて数える', function() {
    var docs = [{ name: 'Spi', dsl: A }, { name: 'Can', dsl: A }, { name: 'Gpio', dsl: A }];
    SD.markAll(docs);
    docs[1].dsl = B;                       // 変更
    docs.push({ name: 'Uart', dsl: A });   // 新規 (基準なし)
    var s = SD.summary(docs);
    expect(s.total).toBe(4);
    expect(s.changed.join(',')).toBe('Can');
    expect(s.added.join(',')).toBe('Uart');
    expect(s.same.join(',')).toBe('Spi,Gpio');
    expect(s.changedCount).toBe(2);
    expect(s.hasChange).toBe(true);
  });

  test('無変更 tick では summary が変更 0 件を返す (15 枚一括の判定)', function() {
    var docs = [];
    for (var i = 0; i < 15; i++) docs.push({ name: 'D' + i, dsl: A + '\n' });
    SD.markAll(docs);
    var s = SD.summary(docs);
    expect(s.total).toBe(15);
    expect(s.changedCount).toBe(0);
    expect(s.hasChange).toBe(false);
    expect(SD.badgeText(s)).toBe('± 変更なし');
  });

  test('badgeText は状態ごとに出し分ける', function() {
    expect(SD.badgeText(SD.summary([]))).toBe('± 差分 −');
    var docs = [{ name: 'Spi', dsl: A }, { name: 'Can', dsl: A }];
    expect(SD.badgeText(SD.summary(docs))).toBe('± 基準なし');
    SD.markAll(docs);
    docs[0].dsl = B;
    expect(SD.badgeText(SD.summary(docs))).toBe('± 変更 1/2');
  });

  test('changedLines は増減した行数を返す', function() {
    SD.mark('Spi', A);
    var d = SD.changedLines('Spi', B);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(SD.changedLines('Spi', A).added).toBe(0);
  });

  test('基準は localStorage に残り、読み直しても効く', function() {
    SD.mark('Spi', A, '2026-09-07T08:00:00.000Z');
    expect(SD.markedAt('Spi')).toBe('2026-09-07T08:00:00.000Z');
    var raw = global.window.localStorage.getItem('plantuml-save-baseline');
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw).marks.Spi.dsl).toBe(SD.normalize(A));
  });
});
