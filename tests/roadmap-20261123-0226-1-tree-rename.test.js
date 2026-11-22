'use strict';
// TICKET-roadmap-20261123-0226-1 (roadmap v7.0 必須 2)
// ⇄ 一括置換の「開いていない図も数える」が保存先の木 (サブフォルダ) の図も数える。
// 同じ名前の図 (直下の a と hw/a) は名前で 1 行に畳まず、居場所の鍵で別の行にする。
// 畳むと、開いている直下の a に hw/a が吸い込まれ、hw/a が黙って置換から外れる (data-loss)。

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
try { delete require.cache[require.resolve('../src/core/folder-impact.js')]; } catch (e) {}
require('../src/core/folder-impact.js');
const fi = () => global.window.MA.folderImpact;

const ROOT_A = 'participant SpiDrv\nSpiDrv -> Hw : go()\n';
const HW_A = 'participant SpiDrv\nHw -> SpiDrv : irq()\nSpiDrvMon -> SpiDrv : poll()\n';
const HW_SPI_B = 'class SpiDrv\n';
const HW_DIR = 'C:\\save\\hw';
const SPI_DIR = 'C:\\save\\hw\\spi';

function files() {
  return [
    { name: 'a', dsl: ROOT_A },
    { name: 'a', dsl: HW_A, rel: 'hw', dir: HW_DIR, key: fi().keyOf('a', HW_DIR) },
    { name: 'b', dsl: HW_SPI_B, rel: 'hw/spi', dir: SPI_DIR, key: fi().keyOf('b', SPI_DIR) },
  ];
}

describe('folderImpact: 保存先の木の図を居場所で見分ける (TICKET-roadmap-20261123-0226-1)', () => {
  test('keyOf: 直下の図は名前のまま、サブフォルダの図はフォルダと名前 (区切り・大小を揃える)', () => {
    expect(fi().keyOf('a')).toBe('a');
    expect(fi().keyOf('a', null)).toBe('a');
    expect(fi().keyOf('a', 'C:\\Save\\HW\\')).toBe(fi().keyOf('a', 'c:/save/hw'));
    expect(fi().keyOf('a', HW_DIR)).not.toBe(fi().keyOf('a'));
    expect(fi().keyOf('a', HW_DIR)).not.toBe(fi().keyOf('a', SPI_DIR));
  });

  test('直下の a を開いていても hw/a は別の行で残り、道付きの見出しになる', () => {
    const open = [{ id: 'd1', name: 'a', dsl: ROOT_A, key: 'a' }];
    const rows = fi().merge(open, files());
    expect(rows.map((r) => r.label)).toEqual(['a', 'hw/a', 'hw/spi/b']);
    expect(rows.map((r) => r.open)).toEqual([true, false, false]);
    expect(rows[1].dir).toBe(HW_DIR);
    expect(rows[1].dsl).toBe(HW_A);
  });

  test('サブフォルダの図を開いているときは、開いている方 (未保存の編集) が勝ち、直下の a は残る', () => {
    const open = [{ id: 'd2', name: 'a', dsl: HW_A + "' edit\n", key: fi().keyOf('a', HW_DIR), rel: 'hw', dir: HW_DIR }];
    const rows = fi().merge(open, files());
    expect(rows.map((r) => r.label + ':' + (r.open ? 'open' : 'file'))).toEqual(['hw/a:open', 'a:file', 'hw/spi/b:file']);
    expect(rows[0].dsl).toContain("' edit");
  });

  test('3 枚とも数えられ、当てる的にもなる', () => {
    const pv = fi().preview(fi().merge([], files()), 'SpiDrv');
    const s = fi().summarize(pv);
    expect(s.hitDocs).toBe(3);
    expect(s.total).toBe(2 + 3 + 1);
    expect(fi().applyTargets(fi().merge([], files()), 'SpiDrv').map((r) => r.label)).toEqual(['a', 'hw/a', 'hw/spi/b']);
    expect(pv.map((r) => r.rel)).toEqual(['', 'hw', 'hw/spi']);
  });

  test('鍵を持たない今までの入力 (直下だけ) は今までどおり名前で畳む', () => {
    const rows = fi().merge([{ id: 'x', name: 'a', dsl: 'A' }], [{ name: 'a', dsl: 'old' }, { name: 'b', dsl: 'B' }]);
    expect(rows.map((r) => r.name + ':' + r.dsl)).toEqual(['a:A', 'b:B']);
    expect(rows[1].id).toBe('file:b');
  });
});
