'use strict';
// BLK-primary-20260924-2232-friction: 会議セットの図を選ぶ欄に保存先の図も並べ、開き直さずに選べる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
}

// 共有 window の localStorage は無い (run-tests.js の素の object) か、opaque origin の
// jsdom で参照すると例外を投げる。どちらでも動くよう、素の実装を必ず差し込む。
var _store = {};
Object.defineProperty(global.window, 'localStorage', {
  configurable: true,
  value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
    clear: function() { _store = {}; },
  },
});

try { delete require.cache[require.resolve('../src/core/meeting-set.js')]; } catch (e) {}
require('../src/core/meeting-set.js');
var ms = global.window.MA.meetingSet;

beforeEach(() => {
  _store = {};
  ms._reset();
});

describe('会議セットの候補 docOptions', () => {
  test('開いている図の後に保存先の図が名前順で並び、同名は開いている方だけ', () => {
    var open = [{ name: 'diagram1' }, { name: 'spi_init_sequence' }];
    var files = [{ name: 'spi_state' }, { name: 'driver_common_class' }, { name: 'spi_init_sequence' }];
    var o = ms.docOptions(open, files);
    expect(o.map(function(x) { return x.name + ':' + x.group; })).toEqual([
      'diagram1:open', 'spi_init_sequence:open', 'driver_common_class:folder', 'spi_state:folder',
    ]);
  });

  test('会議セットに入っている図には picked が立つ', () => {
    ms.add('spi_state');
    var o = ms.docOptions([], [{ name: 'spi_state' }, { name: 'x' }]);
    expect(o[0]).toEqual({ name: 'spi_state', group: 'folder', picked: true });
    expect(o[1].picked).toBe(false);
  });

  test('保存先が無い (localStorage 運用) ときは開いている図だけ', () => {
    expect(ms.docOptions([{ name: 'a' }], []).map(function(x) { return x.name; })).toEqual(['a']);
    expect(ms.docOptions(null, null)).toEqual([]);
  });
});

describe('会議セットの図を保存フォルダから補う folderPicks', () => {
  var files = [
    { name: 'spi_init_sequence', dsl: '@startuml\nA -> B\n@enduml', mtime: '2026-09-20T10:00:00' },
    { name: 'spi_state', dsl: '@startuml\n[*] --> Idle\n@enduml', mtime: '2026-09-19T10:00:00' },
    { name: 'driver_common_class', dsl: '@startuml\nclass X\n@enduml', mtime: '2026-09-18T10:00:00' },
    { name: 'unused', dsl: 'x', mtime: '' },
  ];

  test('会議セットの図のうちボードに無いものだけを、選んだ順に folder の図として返す', () => {
    ms.add('spi_state');
    ms.add('diagram1');
    ms.add('driver_common_class');
    var out = ms.folderPicks(files, [{ name: 'diagram1', dsl: '' }]);
    expect(out.map(function(d) { return d.name; })).toEqual(['spi_state', 'driver_common_class']);
    expect(out[0]).toEqual({
      id: 'file:spi_state', name: 'spi_state', dsl: '@startuml\n[*] --> Idle\n@enduml',
      diagramType: '', origin: 'folder', mtime: '2026-09-19T10:00:00', meetingPick: true,
    });
  });

  test('ボードに既にある図 (開いている / 今日更新) は重ねない', () => {
    ms.add('spi_init_sequence');
    expect(ms.folderPicks(files, [{ name: 'spi_init_sequence' }])).toEqual([]);
  });

  test('会議セットが空なら何も足さない', () => {
    expect(ms.folderPicks(files, [])).toEqual([]);
  });

  test('保存フォルダにも無い名前は足さない (missing で「見つからない図」と言う)', () => {
    ms.add('gone');
    expect(ms.folderPicks(files, [])).toEqual([]);
    expect(ms.missing([])).toEqual(['gone']);
  });

  test('pickDocs と組み合わせると、開いていない 3 枚も選んだ順に並ぶ', () => {
    ['spi_init_sequence', 'spi_state', 'driver_common_class'].forEach(function(n) { ms.add(n); });
    var board = [{ name: 'diagram1' }];
    var all = board.concat(ms.folderPicks(files, board));
    expect(ms.pickDocs(all).map(function(d) { return d.name; }))
      .toEqual(['spi_init_sequence', 'spi_state', 'driver_common_class']);
  });
});
