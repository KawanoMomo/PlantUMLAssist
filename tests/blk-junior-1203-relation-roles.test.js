'use strict';
// BLK-junior-20260908-1203: Relation 追加フォームの From/To が親子のどちらか
// 分からず、Inheritance を逆向きに張ってしまう。種類ごとの呼び名と
// 「押すとこう入る」の 1 行をここで作る。
//
// 見たいこと:
//   - 種類ごとに From/To の呼び名が変わる (継承なら 親 / 子)
//   - 呼び名には従来の From / To も残る (DSL の並びと対応が取れる)
//   - 下書きの 1 行は、実際に入る行と同じ並びで出る
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/relation-roles.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/modules/class.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const rr = global.window.MA.relationRoles;
const clMod = global.window.MA.modules.plantumlClass;

describe('関係の From/To の呼び名 (BLK-junior-20260908-1203)', function() {

  test('継承は 親 / 子 で呼ぶ', function() {
    expect(rr.fieldLabel('inheritance', 'from')).toBe('親 (From)');
    expect(rr.fieldLabel('inheritance', 'to')).toBe('子 (To)');
  });

  test('種類ごとに呼び名が変わる', function() {
    expect(rr.fieldLabel('implementation', 'from')).toBe('インタフェース (From)');
    expect(rr.fieldLabel('composition', 'to')).toBe('部分 (To)');
    expect(rr.fieldLabel('dependency', 'from')).toBe('使う側 (From)');
    expect(rr.fieldLabel('nested', 'to')).toBe('内側 (To)');
  });

  test('知らない種類でも落ちず、関連として扱う', function() {
    expect(rr.fieldLabel('', 'from')).toBe('一方 (From)');
    expect(rr.fieldLabel(undefined, 'to')).toBe('もう一方 (To)');
  });

  test('下書きの 1 行は、実際に入る行と同じ並びになる', function() {
    var line = rr.preview('inheritance', 'DriverBase', 'GpioDrv');
    expect(line.indexOf('DriverBase <|-- GpioDrv')).toBe(0);
    expect(line).toContain('親: DriverBase');
    expect(line).toContain('子: GpioDrv');
    // 実際に足される行と食い違わない (ここがずれると下書きの意味が無い)。
    var out = clMod.addRelation('@startuml\nclass DriverBase\nclass GpioDrv\n@enduml',
      'inheritance', 'DriverBase', 'GpioDrv', null);
    expect(out).toContain('DriverBase <|-- GpioDrv');
  });

  test('選んでいない端点は ? で出す (空欄のまま押させない)', function() {
    expect(rr.preview('inheritance', '', 'GpioDrv').indexOf('? <|-- GpioDrv')).toBe(0);
  });

  test('全種類の矢印が addRelation の書き出しと一致する', function() {
    Object.keys(rr.ROLES).forEach(function(kind) {
      var out = clMod.addRelation('@startuml\nclass A\nclass B\n@enduml', kind, 'A', 'B', null);
      expect(out).toContain('A ' + rr.ROLES[kind].arrow + ' B');
    });
  });
});
