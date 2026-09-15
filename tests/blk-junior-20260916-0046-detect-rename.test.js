'use strict';
// BLK-junior-20260916-0046: 表記統一の反映は同じ直しが何枚にも及ぶ。1 枚目を直した
// その場から一括置換へ渡すとき、直した本人に新旧の組を打ち直させない。
// ここで固定するのは「1 枚の差分から綴り直しの組を読み取れること」と、
// 「言い切れないときは黙って諦めること」(当て推量で別の名前を書き換えさせない)。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
const BR = global.window.MA.bulkRename;

const doc = (a, b) => ['@startuml', 'participant ' + a, 'participant Hal',
  a + ' -> Hal : Init()', 'participant ' + b, '@enduml'].join('\n');

describe('BLK-junior-20260916-0046 直した組を差分から読む', function() {
  test('綴りを直しただけなら、新旧の組を answer する', function() {
    const r = BR.detectRename(doc('SPI_Driver', 'IrqCtrl'), doc('Spi_Driver', 'IrqCtrl'));
    assert.ok(r, '組を読めていない');
    assert.strictEqual(r.from, 'SPI_Driver');
    assert.strictEqual(r.to, 'Spi_Driver');
  });

  test('本文が変わっていなければ null (聞く理由が無い)', function() {
    const same = doc('SPI_Driver', 'IrqCtrl');
    assert.strictEqual(BR.detectRename(same, same), null);
  });

  test('綴り直し以外の編集が混ざっていたら null', function() {
    const before = doc('SPI_Driver', 'IrqCtrl');
    const after = doc('Spi_Driver', 'IrqCtrl') + '\nnote right : 追記';
    assert.strictEqual(BR.detectRename(before, after), null);
  });

  test('2 組を同時に直したら null (どちらの組か言い切れない)', function() {
    const r = BR.detectRename(doc('SPI_Driver', 'IrqCtrl'), doc('Spi_Driver', 'Irq_Ctrl'));
    assert.strictEqual(r, null);
  });

  test('識別子が増えただけ・減っただけなら null', function() {
    const before = doc('SPI_Driver', 'IrqCtrl');
    const after = before.replace('participant IrqCtrl\n', '');
    assert.strictEqual(BR.detectRename(before, after), null);
  });

  test('空の入力でも落ちず null を返す', function() {
    assert.strictEqual(BR.detectRename(null, doc('A', 'B')), null);
    assert.strictEqual(BR.detectRename(doc('A', 'B'), undefined), null);
    assert.strictEqual(BR.detectRename('', ''), null);
  });

  test('読み取った組は、そのまま一括置換に渡せる形になっている', function() {
    const before = doc('SPI_Driver', 'IrqCtrl');
    const after = doc('Spi_Driver', 'IrqCtrl');
    const r = BR.detectRename(before, after);
    assert.strictEqual(BR.replaceIn(before, r.from, r.to), after);
    assert.ok(BR.isValidTarget(r.to));
  });
});
