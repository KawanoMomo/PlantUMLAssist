'use strict';
// BLK-owner-20260929-0351-1: 関係フォームの上の欄 (From) は、どの種類でも図に描かれる矢の根元。
// 継承・実現・汎化は子 (実装クラス) から親 (インターフェース) へ矢を引くので、
// 上の欄に子を選んだら `親 <|-- 子` (または本文の書き方に揃えて `子 --|> 親`) が書かれる。
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
  '../src/modules/usecase.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const rr = global.window.MA.relationRoles;
const cl = global.window.MA.modules.plantumlClass;
const uc = global.window.MA.modules.plantumlUsecase;

// 矢の根元 (矢じりの無い端) と矢じりの端を、書かれた 1 行から読む。
function rootAndHead(line) {
  var m = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)/);
  var a = m[1], arrow = m[2], b = m[3];
  if (/^<\|/.test(arrow)) return { root: b, head: a };
  if (/\|>$/.test(arrow)) return { root: a, head: b };
  if (/>$/.test(arrow)) return { root: a, head: b };
  return { root: a, head: b };
}
function lastRelLine(text) {
  var ls = text.split('\n').filter(function(l) { return /<\||\|>|--|\.\./.test(l) && !/^@/.test(l); });
  return ls[ls.length - 1];
}

describe('From は矢の根元 (BLK-owner-20260929-0351-1)', function() {
  var base = '@startuml\ninterface IDrv\nabstract class BaseDrv\nclass SpiDrv\n@enduml';

  test('継承・実現・汎化は上の欄が子 (実装クラス)、下の欄が親 (インターフェース)', function() {
    expect(rr.fieldLabel('inheritance', 'from')).toBe('子 (From)');
    expect(rr.fieldLabel('inheritance', 'to')).toBe('親 (To)');
    expect(rr.fieldLabel('implementation', 'from')).toBe('実装クラス (From)');
    expect(rr.fieldLabel('implementation', 'to')).toBe('インターフェース (To)');
    expect(rr.fieldLabel('generalization', 'from')).toBe('子 (From)');
    // ほかの種類は従来どおり (From = 記法の左 = 矢の根元)
    expect(rr.fieldLabel('dependency', 'from')).toBe('使う側 (From)');
    expect(rr.fieldLabel('composition', 'from')).toBe('全体 (From)');
  });

  test('種類ごとに、上の欄に選んだものが書かれた行の矢の根元になる', function() {
    ['inheritance', 'implementation', 'dependency', 'association'].forEach(function(kind) {
      var m = rr.toModel(kind, 'SpiDrv', 'IDrv');
      var out = cl.addRelation(base, kind, m.from, m.to, null);
      var e = rootAndHead(lastRelLine(out));
      expect({ kind: kind, root: e.root, head: e.head }).toEqual({ kind: kind, root: 'SpiDrv', head: 'IDrv' });
    });
  });

  test('起票の再現: 子 SpiDrv を From、親 BaseDrv を To に選ぶと SpiDrv が子になる', function() {
    var m = rr.toModel('inheritance', 'SpiDrv', 'BaseDrv');
    var out = cl.addRelation(base, 'inheritance', m.from, m.to, null);
    expect(out).toContain('BaseDrv <|-- SpiDrv');
    var parsed = cl.parse(out);
    var rel = parsed.relations[parsed.relations.length - 1];
    expect(rel.from).toBe('BaseDrv');   // 記法の左 = 親
    expect(rel.to).toBe('SpiDrv');
    // 選び直したときの欄の値も、上 = 子・下 = 親
    expect(rr.toUi(rel.kind, rel.from, rel.to)).toEqual({ from: 'SpiDrv', to: 'BaseDrv' });
  });

  test('toModel と toUi は往復で元に戻る', function() {
    Object.keys(rr.ROLES).forEach(function(k) {
      var m = rr.toModel(k, 'A', 'B');
      expect(rr.toUi(k, m.from, m.to)).toEqual({ from: 'A', to: 'B' });
    });
  });

  test('本文が `子 --|> 親` で書かれていれば、新しい行も同じ書き方で書く', function() {
    var t = '@startuml\nclass A\nclass B\nclass C\nB --|> A\nC ..|> I\n@enduml';
    var m = rr.toModel('inheritance', 'C', 'A');
    var out = cl.addRelation(t, 'inheritance', m.from, m.to, null);
    expect(out).toContain('C --|> A');
    expect(out).not.toContain('A <|-- C');
    var parsed = cl.parse(out);
    var rel = parsed.relations[parsed.relations.length - 1];
    expect([rel.kind, rel.from, rel.to]).toEqual(['inheritance', 'A', 'C']);
    // 下書きの 1 行も同じ書き方
    expect(rr.preview('inheritance', 'C', 'A', rr.prefersRootFirst(t)).indexOf('C --|> A')).toBe(0);
  });

  test('`子 --|> 親` の行を直しても書き方は崩さない (ラベル・相手の変更)', function() {
    var t = '@startuml\nclass A\nclass B\nclass X\nB --|> A\n@enduml';
    var out = cl.updateRelation(t, 5, 'label', 'extends');
    expect(out.split('\n')[4]).toBe('B --|> A : extends');
    var out2 = cl.updateRelation(t, 5, 'from', 'X');   // 記法の左 (親) を X に
    expect(out2.split('\n')[4]).toBe('B --|> X');
  });

  test('ユースケース図の汎化: 上の欄 (子) が矢の根元、`子 --|> 親` の行を直しても親子が逆にならない', function() {
    var t = '@startuml\nactor User\nactor Admin\n@enduml';
    var out = uc.addRelation(t, 'generalization', 'User', 'Admin', '');   // 記法の左右 = 親, 子
    expect(out).toContain('User <|-- Admin');
    var t2 = '@startuml\nactor User\nactor Admin\nactor Guest\nAdmin --|> User\n@enduml';
    var parsed = uc.parse(t2);
    var rel = parsed.relations[0];
    expect([rel.from, rel.to]).toEqual(['User', 'Admin']);
    // 従来はここで `Admin <|-- User` と書き直され、親子が逆になっていた
    var out2 = uc.updateRelation(t2, 5, 'to', 'Guest');
    expect(out2.split('\n')[4]).toBe('Guest --|> User');
  });
});
