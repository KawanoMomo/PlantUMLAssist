'use strict';
// TICKET-primary-20261116-0420-wish: 手書きのクラス図で、属性は先に並べた属性の塊の末尾に足す。
// 本体に属性があれば最後の属性の直後、属性が無くメソッドがあれば最初のメソッドの直前、
// どちらも無ければ閉じ `}` の直前。字下げは隣の行に合わせる。ほかの行はバイト一致。

var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
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
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;
var fs = require('fs');
var path = require('path');

// 足した 1 行を除くと元の行がそのまま同じ順で残ることを確かめ、足した行の位置 (0 始まり) を返す。
function insertedAt(before, after) {
  var a = before.split('\n'), b = after.split('\n');
  expect(b.length).toBe(a.length + 1);
  for (var i = 0; i < b.length; i++) {
    if (b[i] !== a[i]) {
      expect(b.slice(0, i).concat(b.slice(i + 1))).toEqual(a);
      return i;
    }
  }
  return -1;
}

describe('class.addAttribute は属性の塊の末尾に入れる', () => {
  test('hand-class (属性 → コメント → メソッドの並び) では最後の属性の直後に入り、差分は 1 行', () => {
    var src = fs.readFileSync(path.join(__dirname, 'scenarios', 'fixtures', 'hand-class.puml'), 'utf8').replace(/\r\n/g, '\n');
    var lines = src.split('\n');
    var classLine = lines.indexOf('class Drv {') + 1;
    var out = clMod.addAttribute(src, classLine, '+', 'mode', 'uint8', false);
    var at = insertedAt(src, out);
    var o = out.split('\n');
    expect(o[at]).toBe('  + mode : uint8');
    expect(o[at - 1]).toBe('  - rate : uint16');
    expect(o[at + 1]).toBe('  + open() : void');
  });

  test('属性が複数あれば最後の属性の直後 (メソッドの前)', () => {
    var src = '@startuml\nclass Foo {\n  - a : int\n  - b : int\n  + run() : void\n  + stop() : void\n}\n@enduml';
    var out = clMod.addAttribute(src, 2, '-', 'c', 'int', false);
    expect(out).toBe('@startuml\nclass Foo {\n  - a : int\n  - b : int\n  - c : int\n  + run() : void\n  + stop() : void\n}\n@enduml');
  });

  test('属性が無くメソッドだけなら最初のメソッドの直前', () => {
    var src = '@startuml\nclass Foo {\n  + run() : void\n  + stop() : void\n}\n@enduml';
    var out = clMod.addAttribute(src, 2, '-', 'a', 'int', false);
    expect(out).toBe('@startuml\nclass Foo {\n  - a : int\n  + run() : void\n  + stop() : void\n}\n@enduml');
  });

  test('字下げは隣の属性の字下げに合わせる (手で 4 字に揃えた本体)', () => {
    var src = '@startuml\nclass Foo {\n    - a : int\n    + run() : void\n}\n@enduml';
    var out = clMod.addAttribute(src, 2, '-', 'b', 'int', false);
    expect(out).toBe('@startuml\nclass Foo {\n    - a : int\n    - b : int\n    + run() : void\n}\n@enduml');
  });

  test('区切り線・コメントの後に属性が続く場合も最後の属性の直後。区切り線やコメントを属性と見ない', () => {
    var src = '@startuml\nclass Foo {\n  - a : int\n  ' + "' 内部" + '\n  -- 内部 --\n  - b : int\n  ==\n  + run() : void\n}\n@enduml';
    var out = clMod.addAttribute(src, 2, '-', 'c', 'int', false);
    var o = out.split('\n');
    var at = insertedAt(src, out);
    expect(o[at]).toBe('  - c : int');
    expect(o[at - 1]).toBe('  - b : int');
    expect(o[at + 1]).toBe('  ==');
  });

  test('型を先に書く C 風の属性 (- uint8 pin) も属性として数える', () => {
    var src = '@startuml\nclass Dio {\n  - uint8 pin\n  + void Init(uint8 pin)\n}\n@enduml';
    var out = clMod.addAttribute(src, 2, '-', 'level', 'uint8', false);
    var at = insertedAt(src, out);
    expect(at).toBe(3);
  });

  test('本体が空なら閉じ } の直前 (従来どおり)', () => {
    var out = clMod.addAttribute('@startuml\nclass Foo {\n}\n@enduml', 2, '-', 'a', 'int', false);
    expect(out).toBe('@startuml\nclass Foo {\n  - a : int\n}\n@enduml');
  });

  test('メソッドの追加は今のまま閉じ } の直前', () => {
    var src = '@startuml\nclass Foo {\n  - a : int\n  + run() : void\n}\n@enduml';
    var out = clMod.addMethod(src, 2, '+', 'stop', '', 'void', false, false);
    expect(out).toBe('@startuml\nclass Foo {\n  - a : int\n  + run() : void\n  + stop() : void\n}\n@enduml');
  });

  test('別のクラスの属性は数えない (DrvMon の属性の後ろに入らない)', () => {
    var src = '@startuml\nclass Drv {\n  + open() : void\n}\nclass DrvMon {\n  - speed : int\n}\n@enduml';
    var out = clMod.addAttribute(src, 2, '-', 'speed', 'int', false);
    expect(out).toBe('@startuml\nclass Drv {\n  - speed : int\n  + open() : void\n}\nclass DrvMon {\n  - speed : int\n}\n@enduml');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
