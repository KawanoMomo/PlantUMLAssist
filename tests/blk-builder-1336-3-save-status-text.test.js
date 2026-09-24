'use strict';
// BLK-builder-20260924-1336-3 (design 9c / 9a): 下端の保存状態と保存直後の 1 行は
// 文字だけで出す。💾 などの絵文字を付けない (9c の After「13:31 に自動保存 · 変更なし」)。
// 書けなかった回の ⚠ は警告なので残す。
var W = (typeof window !== 'undefined' && window) || global.window;
['autosave-status', 'save-target', 'save-redirect'].forEach(function(n) {
  var f = '../src/core/' + n + '.js';
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var AST = W.MA.autosaveStatus;
var ST = W.MA.saveTarget;
var SR = W.MA.saveRedirect;
var EMOJI = /[\u{1F300}-\u{1FAFF}]/u;
var meta = { lastSavedAt: '2026-09-24T13:31:04', lastSavedType: 'plantuml-sequence' };

describe('保存状態の 1 行に絵文字を付けない (design 9c)', function() {
  test('ブラウザに控えた回・書けた回・変更なしの回・書き込み停止の回', function() {
    var rows = [
      AST.describe(meta, { where: 'local' }, 'たった今', 'spi', '13:31'),
      AST.describe(meta, { where: 'file', fileName: 'spi' }, 'たった今', 'spi', '13:31'),
      AST.describe(meta, { where: 'deferred', reason: 'unchanged' }, 'たった今', 'spi', '13:31'),
      AST.describe(meta, { where: 'blocked', fileName: 'spi', reason: 'x' }, 'たった今', 'spi', '13:31'),
    ];
    rows.forEach(function(d) { expect(EMOJI.test(d.text)).toBe(false); });
    expect(rows[0].text).toBe('13:31 に自動保存');
    expect(rows[2].text).toBe('13:31 に自動保存 · 変更なし');
    expect(rows[3].text).toBe('ブラウザにのみ · spi.puml は書き込み停止中');
  });

  test('書けなかった回の ⚠ は残す', function() {
    var d = AST.describe(meta, { where: 'deferred', reason: 'ask' }, 'たった今', 'spi', '13:31');
    expect(d.text.indexOf('⚠')).toBe(0);
  });

  test('保存直後の 1 行と書き直しの 1 行も文字だけ', function() {
    var f = { mode: 'file', name: 'spi', dir: 'E:/p' };
    expect(ST.messageFor(f, true)).toBe('E:/p/spi.puml に保存しました');
    expect(EMOJI.test(SR.doneText('spi'))).toBe(false);
    expect(EMOJI.test(ST.saveButton({ backend: 'file', fileDir: 'E:/p' }, { name: 'spi' }).text)).toBe(false);
  });
});
