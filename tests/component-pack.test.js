'use strict';
// BLK-junior-20260908-1903-wish: 設計書に貼る資料として、同じ部品の全図種を
// 図番号付きの PNG セットで書き出す。ここでは名前の解釈と番号付けを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/component-pack.js')]; } catch (e) {}
require('../src/core/component-pack.js');
var CP = global.window.MA.componentPack;

// 実際の保存フォルダ (persona-data) にある並び。
var FILES = [
  'GPIOドライバコンポーネント構成.puml',
  'GPIOドライバユースケース.puml',
  'GPIOドライバ初期化アクティビティ.puml',
  'GPIOドライバ初期化シーケンス.puml',
  'GPIOドライバ状態遷移.puml',
  'GPIOドライバ派生クラス.puml',
  'CANドライバユースケース.puml',
  'CANドライバ初期化シーケンス.puml',
];

describe('componentPack.kindOf', function() {
  test('名前の図種の語から図種が決まる', function() {
    expect(CP.kindOf('GPIOドライバ初期化シーケンス.puml')).toBe('シーケンス図');
    expect(CP.kindOf('GPIOドライバ状態遷移.puml')).toBe('状態遷移図');
    expect(CP.kindOf('GPIOドライバ派生クラス.puml')).toBe('クラス図');
    expect(CP.kindOf('GPIOドライバコンポーネント構成.puml')).toBe('コンポーネント図');
    expect(CP.kindOf('gpio_init_sequence.puml')).toBe('シーケンス図');
  });

  test('図種の語が無ければ空', function() {
    expect(CP.kindOf('diagram1.puml')).toBe('');
  });
});

describe('componentPack.groupByComponent', function() {
  test('同じ部品の図が図種をまたいで 1 つにまとまる', function() {
    var groups = CP.groupByComponent(FILES);
    var gpio = groups.filter(function(g) { return g.component === 'GPIOドライバ'; })[0];
    expect(!!gpio).toBe(true);
    // 「GPIOドライバ初期化◯◯」も同じ部品の図として入る (初期化は場面であって別部品ではない)
    expect(gpio.files.length).toBe(6);
  });

  test('先頭の一部が同じだけの別部品は混ざらない', function() {
    var groups = CP.groupByComponent(FILES);
    var names = groups.map(function(g) { return g.component; });
    expect(names).toContain('GPIOドライバ');
    expect(names).toContain('CANドライバ');
    var can = groups.filter(function(g) { return g.component === 'CANドライバ'; })[0];
    expect(can.files.length).toBe(2);
  });

  test('別の拡張子を持つものは図として拾わない', function() {
    var groups = CP.groupByComponent(['GPIO_Init_Sequence.png', '_meta.json']);
    expect(groups.length).toBe(0);
  });

  test('server の一覧のように拡張子が落ちていても拾う', function() {
    var groups = CP.groupByComponent(['GPIOドライバユースケース', 'GPIOドライバ状態遷移']);
    expect(groups.length).toBe(1);
    expect(groups[0].component).toBe('GPIOドライバ');
    expect(groups[0].files.length).toBe(2);
  });

  test('版の別 (先輩反映など) は同じ部品の別の図として入る', function() {
    var groups = CP.groupByComponent([
      'GPIOドライバユースケース.puml',
      'GPIOドライバユースケース(先輩反映).puml',
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].component).toBe('GPIOドライバ');
    expect(groups[0].files.length).toBe(2);
  });
});

describe('componentPack.planPack', function() {
  var groups = CP.groupByComponent(FILES);
  var gpio = groups.filter(function(g) { return g.component === 'GPIOドライバ'; })[0];
  var items = CP.planPack(gpio.component, gpio.files);

  test('設計書の読み順 (用途 → 構造 → 動き) で通し番号が振られる', function() {
    expect(items.map(function(i) { return i.kind; })).toEqual([
      'ユースケース図', 'コンポーネント図', 'クラス図',
      'シーケンス図', 'アクティビティ図', '状態遷移図',
    ]);
    expect(items.map(function(i) { return i.figure; })).toEqual(['図1', '図2', '図3', '図4', '図5', '図6']);
  });

  test('図名は 図番号 + 部品名 + 図種', function() {
    expect(items[0].title).toBe('図1 GPIOドライバ ユースケース図');
    expect(items[0].filename).toBe('図1_GPIOドライバ_ユースケース図.png');
  });

  test('版の別は図名に残す', function() {
    var v = CP.planPack('GPIOドライバ', ['GPIOドライバユースケース(先輩反映).puml']);
    expect(v[0].title).toBe('図1 GPIOドライバ ユースケース図（先輩反映）');
    expect(v[0].filename).toBe('図1_GPIOドライバ_ユースケース図_先輩反映.png');
  });

  test('ファイル名に使えない文字は落ちる', function() {
    var v = CP.planPack('A/B:C', ['A/B:Cシーケンス.puml']);
    expect(v[0].filename.indexOf('/')).toBe(-1);
    expect(v[0].filename.indexOf(':')).toBe(-1);
  });

  test('同じ図名になっても書き出しファイルは重ならない', function() {
    var v = CP.planPack('X', ['Xシーケンス.puml', 'X_sequence.puml']);
    expect(v[0].filename).not.toBe(v[1].filename);
  });
});

describe('componentPack.indexText', function() {
  test('図番号と図名の対応表が出る', function() {
    var items = CP.planPack('GPIOドライバ', ['GPIOドライバ状態遷移.puml']);
    var md = CP.indexText('GPIOドライバ', items);
    expect(md).toContain('# GPIOドライバ 図一覧');
    expect(md).toContain('| 図1 | GPIOドライバ 状態遷移図 | 図1_GPIOドライバ_状態遷移図.png |');
  });

  test('0 枚なら表ではなくその旨を出す', function() {
    expect(CP.indexText('GPIOドライバ', [])).toContain('書き出せる図がありません');
  });
});

describe('componentPack.summarize', function() {
  test('全部成功なら枚数を報せる', function() {
    var s = CP.summarize('GPIOドライバ', [{ filename: 'a.png', ok: true }, { filename: 'b.png', ok: true }]);
    expect(s.ok).toBe(2);
    expect(s.message).toBe('GPIOドライバ の図 2 枚を PNG で書き出しました');
  });

  test('失敗した図は名前を挙げる (残りは書き出す)', function() {
    var s = CP.summarize('GPIOドライバ', [{ filename: 'a.png', ok: true }, { filename: 'b.png', ok: false }]);
    expect(s.failed).toBe(1);
    expect(s.message).toContain('失敗: b.png');
  });
});

describe('componentPack.packName', function() {
  test('部品名と日時の入った zip 名', function() {
    var n = CP.packName('GPIOドライバ', new Date(2026, 8, 8, 19, 5));
    expect(n).toBe('GPIOドライバ-資料-20260908-1905.zip');
  });
});

describe('bulkExport.buildZip がバイト列を素通しする', function() {
  test('PNG のバイト列が文字列化されずに入る', function() {
    try { delete require.cache[require.resolve('../src/core/bulk-export.js')]; } catch (e) {}
    require('../src/core/bulk-export.js');
    var be = global.window.MA.bulkExport;
    var png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    var zip = be.buildZip([{ name: '図1.png', content: png }]);
    // local file header の直後に名前、その後ろに中身がそのまま並ぶ
    var bytes = Array.prototype.slice.call(zip);
    var found = false;
    for (var i = 0; i + png.length <= bytes.length; i++) {
      var same = true;
      for (var j = 0; j < png.length; j++) if (bytes[i + j] !== png[j]) { same = false; break; }
      if (same) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});
