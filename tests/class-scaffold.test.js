'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/class-scaffold.js')]; } catch (e) {}
require('../src/core/class-scaffold.js');
var cs = global.window.MA.classScaffold;

var BASE = [
  '@startuml',
  'class Driver_Common',
  '@enduml',
].join('\n');

function spec(over) {
  var s = {
    parent: 'CanDrv',
    parentKind: 'abstract',
    parentMembers: '+init() : void',
    classes: [
      { name: 'CanDrvHs', members: '+send()', relation: 'inheritance' },
      { name: 'CanDrvFd', members: '+send()', relation: 'inheritance' },
    ],
    relations: [],
  };
  Object.keys(over || {}).forEach(function(k) { s[k] = over[k]; });
  return s;
}

describe('class-scaffold existingIds', function() {
  test('宣言済みのクラスを拾う', function() {
    var ids = cs.existingIds('@startuml\nclass Foo\nabstract class Bar\ninterface Baz\n@enduml');
    expect(ids.Foo).toBe(true);
    expect(ids.Bar).toBe(true);
    expect(ids.Baz).toBe(true);
  });

  test('関連の両端も拾う', function() {
    var ids = cs.existingIds('@startuml\nA <|-- B\nC --> D : uses\n@enduml');
    expect(ids.A).toBe(true);
    expect(ids.B).toBe(true);
    expect(ids.C).toBe(true);
    expect(ids.D).toBe(true);
  });

  test('別名宣言は別名の方を拾う', function() {
    var ids = cs.existingIds('@startuml\nclass "通信ドライバ" as C1\n@enduml');
    expect(ids.C1).toBe(true);
  });
});

describe('class-scaffold parseMembers', function() {
  test('改行でもカンマでも区切れる', function() {
    expect(cs.parseMembers('+a()\n+b()').length).toBe(2);
    expect(cs.parseMembers('+a(), +b(), +c()').length).toBe(3);
  });

  test('空行は捨てる', function() {
    expect(cs.parseMembers('  \n+a()\n\n , ').length).toBe(1);
  });

  test('未入力なら空配列', function() {
    expect(cs.parseMembers('').length).toBe(0);
    expect(cs.parseMembers(null).length).toBe(0);
  });
});

describe('class-scaffold preview', function() {
  test('親・子の宣言と継承をまとめて出す', function() {
    var lines = cs.preview(BASE, spec());
    expect(lines.join('\n')).toBe([
      'abstract class CanDrv {',
      '  +init() : void',
      '}',
      'class CanDrvHs {',
      '  +send()',
      '}',
      'class CanDrvFd {',
      '  +send()',
      '}',
      'CanDrv <|-- CanDrvHs',
      'CanDrv <|-- CanDrvFd',
    ].join('\n'));
  });

  test('メンバが無ければ本体ブロックを出さない', function() {
    var lines = cs.preview(BASE, spec({
      parentMembers: '',
      classes: [{ name: 'CanDrvHs', members: '', relation: 'inheritance' }],
    }));
    expect(lines[0]).toBe('abstract class CanDrv');
    expect(lines[1]).toBe('class CanDrvHs');
  });

  test('クラス名が空の行は無視する', function() {
    var lines = cs.preview(BASE, spec({
      classes: [
        { name: 'CanDrvHs', members: '', relation: 'inheritance' },
        { name: '  ', members: '+x()', relation: 'inheritance' },
      ],
    }));
    expect(lines.filter(function(l) { return l.indexOf('class ') === 0; }).length).toBe(1);
  });

  test('既に宣言済みのクラスは宣言し直さない', function() {
    var lines = cs.preview(BASE, spec({
      parent: 'Driver_Common',
      classes: [{ name: 'CanDrvHs', members: '', relation: 'inheritance' }],
    }));
    expect(lines.indexOf('class Driver_Common')).toBe(-1);
    expect(lines.indexOf('Driver_Common <|-- CanDrvHs') >= 0).toBe(true);
  });

  test('関連の種別ごとに記法が変わる', function() {
    var kinds = {
      inheritance: 'CanDrv <|-- X',
      implementation: 'CanDrv <|.. X',
      composition: 'CanDrv *-- X',
      aggregation: 'CanDrv o-- X',
      dependency: 'CanDrv ..> X',
      association: 'CanDrv -- X',
    };
    Object.keys(kinds).forEach(function(k) {
      var lines = cs.preview(BASE, spec({
        classes: [{ name: 'X', members: '', relation: k }],
      }));
      expect(lines[lines.length - 1]).toBe(kinds[k]);
    });
  });

  test('関連「なし」なら関連行を出さない', function() {
    var lines = cs.preview(BASE, spec({
      classes: [{ name: 'X', members: '', relation: 'none' }],
    }));
    expect(lines.join('\n').indexOf('<|--')).toBe(-1);
  });

  test('追加の関連にラベルを付けられる', function() {
    var lines = cs.preview(BASE, spec({
      relations: [{ kind: 'association', from: 'CanDrvHs', to: 'CanBus', label: 'uses' }],
    }));
    expect(lines[lines.length - 1]).toBe('CanDrvHs -- CanBus : uses');
  });

  test('from/to が欠けた関連の行は無視する', function() {
    var lines = cs.preview(BASE, spec({
      relations: [{ kind: 'association', from: 'CanDrvHs', to: '' }],
    }));
    expect(lines[lines.length - 1]).toBe('CanDrv <|-- CanDrvFd');
  });

  test('日本語のクラス名は ASCII 別名へ寄せる', function() {
    var lines = cs.preview(BASE, spec({
      parent: '通信ドライバ',
      parentMembers: '',
      classes: [{ name: '高速CAN', members: '', relation: 'inheritance' }],
    }));
    expect(lines[0]).toBe('abstract class "通信ドライバ" as C1');
    expect(lines[1]).toBe('class "高速CAN" as C2');
    expect(lines[2]).toBe('C1 <|-- C2');
  });

  test('親もクラスも空なら何も出さない', function() {
    expect(cs.preview(BASE, { parent: '', classes: [], relations: [] }).length).toBe(0);
  });
});

describe('class-scaffold validate', function() {
  test('4 クラス 6 関連の spec は通る', function() {
    var v = cs.validate(spec({
      classes: [
        { name: 'CanDrvHs', members: '', relation: 'inheritance' },
        { name: 'CanDrvFd', members: '', relation: 'inheritance' },
        { name: 'CanBus', members: '', relation: 'none' },
      ],
      relations: [
        { kind: 'association', from: 'CanDrvHs', to: 'CanBus' },
        { kind: 'association', from: 'CanDrvFd', to: 'CanBus' },
        { kind: 'dependency', from: 'CanDrv', to: 'CanBus' },
      ],
    }), BASE);
    expect(v.ok).toBe(true);
  });

  test('クラスが 1 つも無ければ通らない', function() {
    var v = cs.validate({ parent: '', classes: [], relations: [] }, BASE);
    expect(v.ok).toBe(false);
    expect(v.errors[0].indexOf('1 つ以上') >= 0).toBe(true);
  });

  test('クラス名の重複を弾く', function() {
    var v = cs.validate(spec({
      classes: [
        { name: 'CanDrvHs', members: '', relation: 'inheritance' },
        { name: 'CanDrvHs', members: '', relation: 'inheritance' },
      ],
    }), BASE);
    expect(v.ok).toBe(false);
  });

  test('親と同名の子を弾く', function() {
    var v = cs.validate(spec({
      classes: [{ name: 'CanDrv', members: '', relation: 'inheritance' }],
    }), BASE);
    expect(v.ok).toBe(false);
  });

  test('親が無いのに関連を張ろうとしたら弾く', function() {
    var v = cs.validate(spec({ parent: '' }), BASE);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ').indexOf('親クラス') >= 0).toBe(true);
  });

  test('親が無くても関連「なし」なら通る', function() {
    var v = cs.validate({
      parent: '',
      classes: [{ name: 'A', members: '', relation: 'none' }],
      relations: [],
    }, BASE);
    expect(v.ok).toBe(true);
  });

  test('未定義の相手への関連を弾く', function() {
    var v = cs.validate(spec({
      relations: [{ kind: 'association', from: 'CanDrvHs', to: 'Nowhere' }],
    }), BASE);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ').indexOf('Nowhere') >= 0).toBe(true);
  });

  test('DSL に既にあるクラスは関連の相手にできる', function() {
    var v = cs.validate(spec({
      relations: [{ kind: 'association', from: 'CanDrvHs', to: 'Driver_Common' }],
    }), BASE);
    expect(v.ok).toBe(true);
  });
});

describe('class-scaffold apply', function() {
  test('@enduml の手前へ一括で入る', function() {
    var out = cs.apply(BASE, spec());
    var lines = out.split('\n');
    expect(lines[0]).toBe('@startuml');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(out.indexOf('CanDrv <|-- CanDrvHs') >= 0).toBe(true);
    expect(out.indexOf('class Driver_Common') >= 0).toBe(true);
  });

  test('@enduml が無くても補って有効な DSL を返す', function() {
    var out = cs.apply('class Foo', spec());
    expect(out.split('\n')[0]).toBe('@startuml');
    expect(out.split('\n').pop()).toBe('@enduml');
  });

  test('空の spec なら元の text をそのまま返す', function() {
    expect(cs.apply(BASE, { parent: '', classes: [], relations: [] })).toBe(BASE);
  });

  test('2 回続けて呼んでも親を二重宣言しない', function() {
    var once = cs.apply(BASE, spec());
    var twice = cs.apply(once, spec({
      classes: [{ name: 'CanDrvLs', members: '', relation: 'inheritance' }],
    }));
    var decls = twice.split('\n').filter(function(l) {
      return l.trim().indexOf('abstract class CanDrv') === 0;
    });
    expect(decls.length).toBe(1);
    expect(twice.indexOf('CanDrv <|-- CanDrvLs') >= 0).toBe(true);
  });
});
