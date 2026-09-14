'use strict';
// BLK-junior-20260913-0306: 一覧・覗く・書き出すはタブ列のボタンを押せるのに、毎周必ず
// 通る保存だけが Ctrl+K で「ファイルを保存」と打つ経路しか無かった。保存先の隣に出す
// [💾 保存] の文言と説明を守る (押す前に、何がどこへ書かれるかが読めること)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/save-target.js')]; } catch (e) {}
require('../src/core/workspace.js');
require('../src/core/save-target.js');

var ST = global.window.MA.saveTarget;

var DOC = { name: 'gpio_init_sequence', dsl: '@startuml\n@enduml' };

describe('save-target saveButton (上部バーの保存ボタン)', function() {
  test('保存フォルダ運用なら「上書き保存」と言い、書き先を説明に出す', function() {
    var b = ST.saveButton({ backend: 'file', fileDir: 'E:\\01_Loop\\persona-data\\junior' }, DOC);
    expect(b.mode).toBe('file');
    expect(b.text).toBe('💾 上書き保存');
    expect(b.title).toContain('gpio_init_sequence.puml');
    expect(b.title).toContain('persona-data');
    expect(b.title).toContain('Ctrl+S');
  });

  test('保存先が未設定ならダウンロードだと分かる文言になる', function() {
    var b = ST.saveButton({ backend: 'local' }, DOC);
    expect(b.mode).toBe('download');
    expect(b.text).toBe('💾 保存');
    expect(b.title).toContain('ダウンロード');
    expect(b.title).toContain('gpio_init_sequence.puml');
  });

  test('フォルダのファイル名にできない図はダウンロードに落ちる (黙って何も起きない状態を作らない)', function() {
    var b = ST.saveButton({ backend: 'file', fileDir: './autosave' }, { name: 'a b/c', dsl: '' });
    expect(b.mode).toBe('download');
  });

  test('名前の無い図でも押せる文言になる (題名を代わりに使う)', function() {
    var b = ST.saveButton({ backend: 'local' }, null, 'untitled');
    expect(b.text).toBe('💾 保存');
    expect(b.title).toContain('untitled.puml');
  });

  test('保存先チップの説明は Ctrl+K ではなく隣のボタンを案内する', function() {
    var l = ST.label({ backend: 'file', fileDir: './autosave' });
    expect(l.title).toContain('💾 保存');
    expect(l.title).not.toContain('Ctrl+K');
  });
});
