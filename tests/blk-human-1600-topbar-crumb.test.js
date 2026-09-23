'use strict';
// BLK-human-20260923-1600 (design 9a): 上部バー左を「{フォルダ} / {ファイル名}」の
// パンくず 1 本にし、保存先チップを畳む。保存ボタンは状態をそのまま出す
// (未保存のときだけ ● とキー、保存済みは「保存済み」)。絵文字は使わない。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/save-target.js')]; } catch (e) {}
require('../src/core/save-target.js');
var ST = global.window.MA.saveTarget;

var FILE_CFG = { backend: 'file', fileDir: 'E:\\work\\junior' };
var DL_CFG = { backend: 'memory' };
var DOC = { name: 'spi_init_sequence', dsl: '@startuml\n@enduml' };

describe('上部バーのパンくず (design 9a)', function() {
  test('保存フォルダ運用では {フォルダ} / {ファイル名} を出す', function() {
    var bc = ST.breadcrumb(FILE_CFG, DOC, '(無題)');
    expect(bc.folder).toBe('junior');
    expect(bc.name).toBe('spi_init_sequence.puml');
    expect(bc.configured).toBe(true);
    expect(bc.mode).toBe('file');
  });

  test('フォルダ名の説明に、押すと保存先を変えられることが出る', function() {
    var bc = ST.breadcrumb(FILE_CFG, DOC, '(無題)');
    expect(bc.folderTitle).toContain('E:\\work\\junior');
    expect(bc.folderTitle).toContain('保存先を変えられます');
  });

  test('保存先が未設定なら「ダウンロード」と言い切る', function() {
    var bc = ST.breadcrumb(DL_CFG, DOC, '(無題)');
    expect(bc.folder).toBe('ダウンロード');
    expect(bc.configured).toBe(false);
    expect(bc.mode).toBe('download');
  });

  test('図を開いていなくても名前の場所が空にならない', function() {
    var bc = ST.breadcrumb(FILE_CFG, null, '(無題)');
    expect(bc.name).toBe('(無題).puml');
  });

  // design 9a: レールの 1px 線画と調子が合わないので絵文字は出さない。
  test('パンくずに絵文字を出さない', function() {
    [ST.breadcrumb(FILE_CFG, DOC, ''), ST.breadcrumb(DL_CFG, DOC, '')].forEach(function(bc) {
      expect(/[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/u.test(bc.folder)).toBe(false);
      expect(/[\u{1F300}-\u{1FAFF}]/u.test(bc.name)).toBe(false);
    });
  });
});

describe('保存の状態 (design 9a)', function() {
  test('未保存のときは ● とキーを出し、状態は dirty', function() {
    var s = ST.saveState(FILE_CFG, DOC, true, '');
    expect(s.text).toBe('● 保存');
    expect(s.key).toBe('Ctrl+S');
    expect(s.state).toBe('dirty');
    expect(s.title).toContain('保存していない変更があります');
    // 押したら何がどこへ書かれるかは、状態が変わっても言い切る。
    expect(s.title).toContain('junior');
    expect(s.title).toContain('spi_init_sequence.puml');
  });

  test('保存済みのときは「保存済み」だけに落とし、キーは出さない', function() {
    var s = ST.saveState(FILE_CFG, DOC, false, '');
    expect(s.text).toBe('保存済み');
    expect(s.key).toBe('');
    expect(s.state).toBe('saved');
    expect(s.dirty).toBe(false);
  });

  test('ダウンロード運用でも状態の出し分けは同じ', function() {
    expect(ST.saveState(DL_CFG, DOC, true, '').state).toBe('dirty');
    expect(ST.saveState(DL_CFG, DOC, false, '').state).toBe('saved');
    expect(ST.saveState(DL_CFG, DOC, true, '').title).toContain('ダウンロードします');
  });

  test('保存ボタンに 💾 を出さない', function() {
    [true, false].forEach(function(d) {
      expect(ST.saveState(FILE_CFG, DOC, d, '').text.indexOf('\u{1F4BE}')).toBe(-1);
    });
  });
});
