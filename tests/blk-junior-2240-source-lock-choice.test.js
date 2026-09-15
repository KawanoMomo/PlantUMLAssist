'use strict';
// BLK-junior-20260915-2240: 上書き確認の二択が同格に見え、強調はむしろ
// 「元ファイルを保つ」側に付いていた。直した部品名を元ファイルへ入れるつもりで
// 上書き保存を押した人が「保つ」を選ぶと、元ファイルは元の表記のままになり、
// エラーも出ないので気づけない。ここで固定するのは「どちらが既定かを文言が言う」
// ことと「保つを選んだ結果と戻し方を言い切る」こと。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
// source-lock は window.localStorage に錠を憶える。run-tests の素の window は
// 読み書きしない作りものなので、覚える所を持たせてから読み込む。
if (!global.window.localStorage || typeof global.window.localStorage.removeItem !== 'function') {
  const mem = {};
  global.window.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}
try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
require('../src/core/source-lock.js');
const SL = global.window.MA.sourceLock;

describe('BLK-junior-2240 上書き確認の選択肢', function() {
  test('おすすめは「このファイルを書き換える」側だと文言が言う', function() {
    const t = SL.askText('spi_component');
    assert.strictEqual(t.recommended, 'overwrite');
    assert.ok(t.overwriteNote.indexOf('おすすめ') >= 0, t.overwriteNote);
    assert.ok(t.overwriteNote.indexOf("元ファイル") < 0 && t.overwriteNote.indexOf("このファイルに入ります") >= 0, t.overwriteNote);
  });

  test('「保つ」側には、元ファイルが今の表記に変わらないことを添える', function() {
    const t = SL.askText('spi_component');
    assert.ok(t.keepNote.indexOf('変わりません') >= 0, t.keepNote);
  });

  test('保つを選んだら、書き先と戻し方を言い切る', function() {
    const said = SL.answeredText('keep', 'spi_component', 'spi_component-編集中');
    assert.ok(said.text.indexOf('変更前のまま') >= 0, said.text);
    assert.ok(said.text.indexOf('spi_component-編集中.puml') >= 0, said.text);
    assert.ok(said.undo.indexOf('やっぱり') >= 0, said.undo);
  });

  test('書き換えるを選んだら、戻し方は出さない (戻す先が無い)', function() {
    const said = SL.answeredText('overwrite', 'spi_component', '');
    assert.ok(said.text.indexOf('書き換えます') >= 0, said.text);
    assert.strictEqual(said.undo, '');
  });

  test('元ファイル保護の札は、押せば戻せると分かる印を持つ', function() {
    const id = 'doc-2240';
    SL.clearAll();
    SL.mark(id, 'spi_component', '@startuml\nA -> B\n@enduml');
    SL.answer(id, 'keep', [], false);
    const label = SL.label(id, 'spi_component');
    assert.strictEqual(label.undoable, true);
    assert.ok(label.title.indexOf('書き換える方に戻せます') >= 0, label.title);
  });

  test('書き換える方に戻したら、札は元ファイル保護ではなくなる', function() {
    const id = 'doc-2240b';
    SL.clearAll();
    SL.mark(id, 'spi_component', '@startuml\nA -> B\n@enduml');
    SL.answer(id, 'keep', [], false);
    const back = SL.answer(id, 'overwrite', [], false);
    assert.strictEqual(back.name, 'spi_component');
    const label = SL.label(id, 'spi_component');
    assert.ok(!label.undoable);
    assert.ok(label.text.indexOf('✎') >= 0, label.text);
  });
});
