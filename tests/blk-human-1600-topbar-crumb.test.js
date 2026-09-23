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

// design 9a: 「⇔ 先輩」は「並べて比較」1 つの入口になる。実体は据え置きの枠で、
// 「据え置く / 1 回だけ」を枠の中で切り替える (別画面を増やさない)。
try { delete require.cache[require.resolve('../src/core/senior-pane.js')]; } catch (e) {}
var SP = require('../src/core/senior-pane.js');

describe('並べて比較の枠 (design 9a)', function() {

  test('既定は据え置き (図を切り替えると相手も入れ替わる)', function() {
    expect(SP.normalize(null).mode).toBe('keep');
    expect(SP.normalize({ mode: 'nonsense' }).mode).toBe('keep');
  });

  test('1 回だけに切り替えた状態は覚える', function() {
    expect(SP.normalize({ mode: 'once' }).mode).toBe('once');
  });

  test('枠の中の 2 択は「据え置く」「1 回だけ」と名乗る', function() {
    expect(SP.MODE_LABELS.keep).toBe('据え置く');
    expect(SP.MODE_LABELS.once).toBe('1 回だけ');
  });

  test('下端の札は「先輩」ではなく「並べて比較」と名乗り、絵文字を出さない', function() {
    var t = SP.statusText(null, { ready: false });
    expect(t.label).toBe('並べて比較 −');
    expect(t.label.indexOf('\u{1F440}')).toBe(-1);
    expect(t.label.indexOf('先輩')).toBe(-1);
  });

  test('画面側も「比較相手」と名乗り、仮の手本の口は図種で言う', function() {
    var html = require('fs').readFileSync(require('path').join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
    expect(html).toContain('<strong>比較相手</strong>');
    expect(html).toContain('id="senior-mode-keep"');
    expect(html).toContain('id="senior-mode-once"');
    expect(html).toContain('相手に無い図種を仮に組む');
    expect(html).toContain('>並べて比較 −</button>');
  });
});
