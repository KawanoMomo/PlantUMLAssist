'use strict';
// BLK-builder-20260924-1413-2 (design 7a / 9c): 下端は 1 行。保存直後の 1 行は短い形で見せ、
// フォルダのパスと（…）の内訳は title (全文) に回す。
var W = (typeof window !== 'undefined' && window) || global.window;
try { delete require.cache[require.resolve('../src/core/autosave-status.js')]; } catch (e) {}
require('../src/core/autosave-status.js');
var AST = W.MA.autosaveStatus;
var fs = require('fs');
var path = require('path');

describe('shortResult — 保存直後の 1 行の短い形', function() {
  test('パスはファイル名だけ、（…）の内訳と前置きは落とし、区切りは · にする', function() {
    expect(AST.shortResult('./test-results/autosave/probe/junior/diagram1.puml に保存しました ／ 他 persona との部品名の衝突なし（1 枚と照合）'))
      .toBe('diagram1.puml に保存しました · 衝突なし');
  });

  test('Windows のパスもファイル名だけ', function() {
    expect(AST.shortResult('上書き保存しました: E:\\work\\spi\\spi_state.puml')).toBe('上書き保存しました: spi_state.puml');
  });

  test('保存時チェックの「… を見て、この図に不一致はありません」は結論だけ', function() {
    expect(AST.shortResult('./a/spi.puml に保存しました ／ 名前・整合・系統・トレース・手動指摘 を見て、この図に不一致はありません'))
      .toBe('spi.puml に保存しました · 不一致なし');
  });

  test('衝突ありの件数は残す (警告は消さない)', function() {
    expect(AST.shortResult('./a/b/spi.puml に保存しました ／ 他 persona と衝突 2 図')).toBe('spi.puml に保存しました · 他 persona と衝突 2 図');
  });

  test('パスも内訳も無い文はそのまま', function() {
    expect(AST.shortResult('保存を止めました: 旧称が 2 件残っています')).toBe('保存を止めました: 旧称が 2 件残っています');
    expect(AST.shortResult('')).toBe('');
    expect(AST.shortResult(null)).toBe('');
  });
});

describe('下端の並びと折り返し (plantuml-assist.html)', function() {
  var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf-8');
  var bar = html.slice(html.indexOf('<div id="statusbar">'), html.indexOf('</div>', html.indexOf('<div id="statusbar">')));

  test('パース OK → 件数 (elements · relations) → 保存状態 の順', function() {
    var i = function(id) { return bar.indexOf('id="' + id + '"'); };
    expect(i('status-parse')).toBeLessThan(i('status-info'));
    expect(i('status-info')).toBeLessThan(i('status-autosave'));
    expect(i('status-autosave')).toBeLessThan(i('status-save-result'));
    expect(i('status-save-result')).toBeLessThan(i('status-diff'));
  });

  test('項目の中で折り返さない (nowrap)、保存直後の 1 行は省略記号で縮む', function() {
    expect(html).toContain('#statusbar > * { white-space: nowrap; flex-shrink: 0; }');
    expect(/#statusbar > #status-save-result \{[^}]*text-overflow: ellipsis/.test(html)).toBe(true);
  });
});
