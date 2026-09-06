'use strict';
// BLK-primary-20260907-0443: 開いている全図をまとめて SVG に書き出す。
// ランナーは全テストを 1 プロセスで動かすため、既存の window があればそれを使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-export.js')]; } catch (e) {}
require('../src/core/bulk-export.js');
var be = global.window.MA.bulkExport;

var DOCS = [
  { id: 'd1', name: 'SpiInit', dsl: '@startuml\nA -> B : x\n@enduml' },
  { id: 'd2', name: 'GpioInit', dsl: '@startuml\nC -> D : y\n@enduml' },
];

describe('bulkExport.plan', function() {
  test('開いている図の数だけ書き出し計画を作る', function() {
    var p = be.plan(DOCS);
    expect(p.length).toBe(2);
    expect(p[0].filename).toBe('SpiInit.svg');
    expect(p[1].filename).toBe('GpioInit.svg');
    expect(p[0].dsl).toBe(DOCS[0].dsl);
  });

  test('タブの順序を保つ', function() {
    var p = be.plan([DOCS[1], DOCS[0]]);
    expect(p[0].name).toBe('GpioInit');
    expect(p[1].name).toBe('SpiInit');
  });

  test('DSL が空の図は対象外', function() {
    var p = be.plan([DOCS[0], { id: 'x', name: 'Empty', dsl: '   \n' }, { id: 'y', name: 'NoDsl' }]);
    expect(p.length).toBe(1);
    expect(p[0].name).toBe('SpiInit');
  });

  test('同名タブは -2 で一意化して上書きを防ぐ', function() {
    var p = be.plan([DOCS[0], { id: 'd3', name: 'SpiInit', dsl: '@startuml\nE -> F : z\n@enduml' }]);
    expect(p[0].filename).toBe('SpiInit.svg');
    expect(p[1].filename).toBe('SpiInit-2.svg');
  });

  test('名前が無ければ diagram を使う', function() {
    var p = be.plan([{ id: 'd4', name: '', dsl: '@startuml\n@enduml' }]);
    expect(p[0].filename).toBe('diagram.svg');
  });

  test('docs が空・不正でも落ちない', function() {
    expect(be.plan([]).length).toBe(0);
    expect(be.plan(null).length).toBe(0);
  });

  test('11 枚でも 11 件の計画になる (枚数に上限を設けない)', function() {
    var many = [];
    for (var i = 0; i < 11; i++) many.push({ id: 'd' + i, name: 'fig' + i, dsl: '@startuml\n@enduml' });
    expect(be.plan(many).length).toBe(11);
  });
});

describe('bulkExport.summarize', function() {
  test('全件成功なら枚数を報告する', function() {
    var s = be.summarize([{ filename: 'a.svg', ok: true }, { filename: 'b.svg', ok: true }]);
    expect(s.total).toBe(2);
    expect(s.ok).toBe(2);
    expect(s.failed).toBe(0);
    expect(s.message).toContain('2 枚');
  });

  test('一部失敗なら失敗したファイル名を挙げる', function() {
    var s = be.summarize([{ filename: 'a.svg', ok: true }, { filename: 'b.svg', ok: false, error: 'boom' }]);
    expect(s.ok).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.failedNames).toEqual(['b.svg']);
    expect(s.message).toContain('b.svg');
  });

  test('0 件なら書き出せる図が無いと言う', function() {
    expect(be.summarize([]).message).toContain('ありません');
  });
});

// このランナーの test() は同期で返り値を await しないため、Promise 版の run() ではなく
// 同期に完走できる runSequential() を検証する。run() は runSequential の薄い包みで、
// GUI 経路は tests/e2e/blk-primary-0443-bulk-export.spec.js が見る。
describe('bulkExport.runSequential', function() {
  test('タブを切り替えずに各図の DSL をレンダリングして保存する', function() {
    var rendered = [];
    var saved = [];
    var done = null;
    be.runSequential(DOCS, {
      render: function(dsl, cb) { rendered.push(dsl); cb(null, '<svg>' + dsl + '</svg>'); },
      save: function(filename, svg) { saved.push([filename, svg]); },
    }, function(s) { done = s; });
    expect(rendered).toEqual([DOCS[0].dsl, DOCS[1].dsl]);
    expect(saved.length).toBe(2);
    expect(saved[0][0]).toBe('SpiInit.svg');
    expect(saved[1][0]).toBe('GpioInit.svg');
    expect(done.ok).toBe(2);
    expect(done.failed).toBe(0);
  });

  test('1 枚失敗しても残りを続ける', function() {
    var saved = [];
    var done = null;
    be.runSequential(DOCS, {
      render: function(dsl, cb) {
        if (dsl === DOCS[0].dsl) return cb(new Error('render failed'), null);
        cb(null, '<svg/>');
      },
      save: function(filename) { saved.push(filename); },
    }, function(s) { done = s; });
    expect(saved).toEqual(['GpioInit.svg']);
    expect(done.ok).toBe(1);
    expect(done.failedNames).toEqual(['SpiInit.svg']);
  });

  test('render が例外を投げても残りを続ける', function() {
    var done = null;
    be.runSequential(DOCS, {
      render: function(dsl, cb) {
        if (dsl === DOCS[0].dsl) throw new Error('boom');
        cb(null, '<svg/>');
      },
      save: function() {},
    }, function(s) { done = s; });
    expect(done.total).toBe(2);
    expect(done.ok).toBe(1);
  });

  test('空の SVG は失敗として数える', function() {
    var done = null;
    be.runSequential([DOCS[0]], {
      render: function(dsl, cb) { cb(null, ''); },
      save: function() {},
    }, function(s) { done = s; });
    expect(done.ok).toBe(0);
    expect(done.failedNames).toEqual(['SpiInit.svg']);
  });

  test('進捗を件数で通知する', function() {
    var progress = [];
    be.runSequential(DOCS, {
      render: function(dsl, cb) { cb(null, '<svg/>'); },
      save: function() {},
      onProgress: function(d, t) { progress.push(d + '/' + t); },
    }, function() {});
    expect(progress).toEqual(['1/2', '2/2']);
  });

  test('11 枚を 1 回の呼び出しで書き出す (枚数に上限を設けない)', function() {
    var many = [];
    for (var i = 0; i < 11; i++) many.push({ id: 'd' + i, name: 'fig' + i, dsl: '@startuml\n@enduml' });
    var saved = [];
    var done = null;
    be.runSequential(many, {
      render: function(dsl, cb) { cb(null, '<svg/>'); },
      save: function(f) { saved.push(f); },
    }, function(s) { done = s; });
    expect(saved.length).toBe(11);
    expect(done.ok).toBe(11);
    expect(done.message).toContain('11 枚');
  });
});

// zip は無圧縮 (store) なので、ヘッダを読んでファイル名と中身をそのまま取り出せる。
// 検証はその手順で行い、実際に unzip できる形になっていることを見る。
function readZip(bytes) {
  function u16(o) { return bytes[o] | (bytes[o + 1] << 8); }
  function u32(o) { return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0; }
  // end of central directory を末尾から探す
  var eocd = -1;
  for (var i = bytes.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  var count = u16(eocd + 10);
  var cdOffset = u32(eocd + 16);
  var entries = [];
  var p = cdOffset;
  for (var n = 0; n < count; n++) {
    if (u32(p) !== 0x02014b50) throw new Error('bad central header at ' + p);
    var nameLen = u16(p + 28);
    var localOffset = u32(p + 42);
    var name = '';
    for (var c = 0; c < nameLen; c++) name += String.fromCharCode(bytes[p + 46 + c]);
    if (u32(localOffset) !== 0x04034b50) throw new Error('bad local header for ' + name);
    var method = u16(localOffset + 8);
    var size = u32(localOffset + 18);
    var lnLen = u16(localOffset + 26);
    var exLen = u16(localOffset + 28);
    var dataAt = localOffset + 30 + lnLen + exLen;
    var content = '';
    for (var d = 0; d < size; d++) content += String.fromCharCode(bytes[dataAt + d]);
    entries.push({ name: name, method: method, content: content });
    p += 46 + nameLen + u16(p + 30) + u16(p + 32);
  }
  return { count: count, entries: entries };
}

describe('bulkExport.buildZip', function() {
  test('中央ディレクトリに全ファイルが入る', function() {
    var zip = readZip(be.buildZip([
      { name: 'SpiInit.svg', content: '<svg>spi</svg>' },
      { name: 'CanInit.svg', content: '<svg>can</svg>' },
    ]));
    expect(zip.count).toBe(2);
    expect(zip.entries[0].name).toBe('SpiInit.svg');
    expect(zip.entries[1].name).toBe('CanInit.svg');
  });

  test('無圧縮なので中身をそのまま取り出せる', function() {
    var zip = readZip(be.buildZip([{ name: 'a.svg', content: '<svg>hello</svg>' }]));
    expect(zip.entries[0].method).toBe(0);
    expect(zip.entries[0].content).toBe('<svg>hello</svg>');
  });

  test('11 枚ぶんを 1 つの zip にまとめる', function() {
    var files = [];
    for (var i = 0; i < 11; i++) files.push({ name: 'fig' + i + '.svg', content: '<svg>' + i + '</svg>' });
    var zip = readZip(be.buildZip(files));
    expect(zip.count).toBe(11);
    expect(zip.entries[10].content).toBe('<svg>10</svg>');
  });

  test('CRC を各エントリに書く (0 のままにしない)', function() {
    var bytes = be.buildZip([{ name: 'a.svg', content: '<svg>hello</svg>' }]);
    var crc = (bytes[14] | (bytes[15] << 8) | (bytes[16] << 16) | (bytes[17] << 24)) >>> 0;
    // 期待値は Node の zlib.crc32('<svg>hello</svg>') と一致することを確認済み
    expect(crc).toBe(1587768093);
  });

  test('空でも壊れない zip を返す', function() {
    expect(readZip(be.buildZip([])).count).toBe(0);
  });
});

describe('bulkExport.zipName', function() {
  test('日時入りのファイル名にする', function() {
    expect(be.zipName(new Date(2026, 8, 7, 7, 3))).toBe('diagrams-20260907-0703.zip');
  });

  test('拡張子は zip', function() {
    expect(be.zipName()).toContain('.zip');
  });
});
