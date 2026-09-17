'use strict';
// BLK-primary-20260914-1106-friction: 過去に当てた置換の組が「今どうなっているか」を
// 置換前・置換後を打つ前に出す。打ってヒット 0 件を見るための空打ちを無くすこと。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/bulk-rename.js', '../src/core/rename-redo.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var RR = global.window.MA.renameRedo;

function hist(from, to, at) { return { from: from, to: to, at: at || '2026-09-14T10:06:00' }; }

var DOCS = [
  { name: 'spi_init_sequence', dsl: 'participant Spi_Driver\nSpi_Driver -> Hw_Ctrl : init\n' },
  { name: 'driver_common_class', dsl: 'class Spi_Driver\nclass Hw_Ctrl\n' },
  { name: 'can_sequence', dsl: 'participant CanDrv\nCanDrv -> Hw_Ctrl : send\n' },
];

describe('rename-redo: 過去の置換の組', function() {

  test('置換済みの組は「適用済み」になり、残存件数は 0', function() {
    var rows = RR.pairs([hist('SpiDrv', 'Spi_Driver')], DOCS);
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('done');
    expect(rows[0].remaining).toBe(0);
    expect(rows[0].appliedDocs).toBe(2);
  });

  // BLK-primary-20260917-0523-friction: パネルを開いた時点で、適用済みの行にも
  // 残件数を出す (下端のバッジを押して確かめに行かなくてよい)。
  test('適用済みの行は開いた時点で「統一 済 · 残り 0 件」と残件数まで言う', function() {
    var rows = RR.pairs([hist('SpiDrv', 'Spi_Driver')], DOCS);
    expect(RR.stateText(rows[0])).toBe('統一 済 · 残り 0 件 (2 枚に適用)');
  });

  test('旧称が残っている組は pending で、残りの件数と枚数を出す', function() {
    var rows = RR.pairs([hist('CanDrv', 'Can_Driver')], DOCS);
    expect(rows[0].state).toBe('pending');
    expect(rows[0].remaining).toBe(2);
    expect(rows[0].remainingDocs).toBe(1);
    expect(RR.stateText(rows[0])).toBe('残り 2 件 / 1 枚');
  });

  test('旧称も新称も無い組は「対象なし」(置換済みと取り違えない)', function() {
    var rows = RR.pairs([hist('EthDrv', 'Eth_Driver')], DOCS);
    expect(rows[0].state).toBe('gone');
    expect(RR.stateText(rows[0])).toBe('対象なし');
  });

  test('同じ組が履歴に何度あっても 1 行にまとめる', function() {
    var rows = RR.pairs([
      hist('SpiDrv', 'Spi_Driver', '2026-09-14T10:06:00'),
      hist('SpiDrv', 'Spi_Driver', '2026-09-13T02:06:00'),
      hist('CanDrv', 'Can_Driver'),
    ], DOCS);
    expect(rows.length).toBe(2);
    expect(rows[0].at).toBe('2026-09-14T10:06:00');
  });

  test('from か to が欠けた記録は行にしない', function() {
    expect(RR.pairs([{ from: 'SpiDrv' }, { to: 'X' }, null], DOCS).length).toBe(0);
  });

  test('見出しは残っている組の有無を先に言う', function() {
    var done = RR.pairs([hist('SpiDrv', 'Spi_Driver')], DOCS);
    expect(RR.summary(done)).toBe('過去の置換 1 組は、すべて適用済みです');
    expect(RR.summaryClass(done)).toBe('rr-done');
    var mixed = RR.pairs([hist('SpiDrv', 'Spi_Driver'), hist('CanDrv', 'Can_Driver')], DOCS);
    expect(RR.summary(mixed)).toBe('過去の置換 2 組のうち 1 組に旧称が残っています');
    expect(RR.summaryClass(mixed)).toBe('rr-pending');
    expect(RR.summary([])).toBe('過去の置換の組はまだありません');
  });

  test('行の見出しは組と状態を 1 行に持つ', function() {
    var rows = RR.pairs([hist('CanDrv', 'Can_Driver')], DOCS);
    expect(RR.label(rows[0])).toBe('CanDrv → Can_Driver  残り 2 件 / 1 枚');
  });

  test('適用済みの行は「打ち直して確かめる必要はない」と言い切る', function() {
    var rows = RR.pairs([hist('SpiDrv', 'Spi_Driver')], DOCS);
    expect(RR.title(rows[0]).indexOf('打ち直して確かめる必要はありません') >= 0).toBe(true);
  });

  test('識別子の途中に含まれるだけの綴りは残存に数えない', function() {
    var docs = [{ name: 'x', dsl: 'participant SpiDrvTest\n' }];
    var rows = RR.pairs([hist('SpiDrv', 'Spi_Driver')], docs);
    expect(rows[0].remaining).toBe(0);
    expect(rows[0].state).toBe('gone');
  });

  test('履歴が無い・図が無いときも落ちない', function() {
    expect(RR.pairs(null, null).length).toBe(0);
    expect(RR.label(null)).toBe('');
    expect(RR.title(null)).toBe('');
  });
});
