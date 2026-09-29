'use strict';
// BLK-primary-20260925-0232-design (design 10a / 10b): ツリーから別のフォルダを保存先にする入口。
// 保存先の行・「保存先」見出しの右クリックに「別のフォルダを保存先にする…」を置く。
// 部品のフォルダ (名前で束ねた仮のフォルダ) と読むだけのフォルダには出さない。

var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;

function byId(items, id) { return items.filter(function(it) { return it.id === id; })[0]; }

describe('保存先の右クリック: 別のフォルダを保存先にする…', function() {
  test('保存先 (行・見出し) には押せる形で出る', function() {
    var it = byId(FM.folderItems({ kind: 'target' }), 'change-target');
    expect(!!it).toBe(true);
    expect(it.label).toBe('別のフォルダを保存先にする…');
    expect(!!it.disabled).toBe(false);
  });
  test('部品のフォルダ・読むだけのフォルダには出さない (読むだけは「保存先にする」をそのまま使う)', function() {
    expect(!!byId(FM.folderItems({ kind: 'part' }), 'change-target')).toBe(false);
    var ro = FM.folderItems({ kind: 'readonly' });
    expect(!!byId(ro, 'change-target')).toBe(false);
    expect(!!byId(ro, 'set-target').disabled).toBe(false);
  });
  test('↑↓ で灰色の 2 行を飛ばして届く', function() {
    var items = FM.folderItems({ kind: 'target' });
    var i = FM.nextIndex(items, 1, 1);
    expect(items[i].id).toBe('change-target');
  });
});
