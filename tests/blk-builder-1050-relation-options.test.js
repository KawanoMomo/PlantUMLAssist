'use strict';
// BLK-builder-20260907-1050-2 / design 3c「関係のその他の設定パレット」。
//
// 仕様: 関係を選んだときの右ペインで、主要な「関係の種類」は常時表示のまま、
// 向き / 多重度 / 線の色 / 線へのノート を「その他の設定… ▾」に畳む。
// UseCase / Component / Class で共通 (判断は src/core/relation-options.js に 1 つだけ置く)。
//
// ここでは DSL 面 (純関数) と、パレットを組み立てる HTML、3 図種が同じ入口を
// 使っていることを検証する。

var fs = require('fs');
var path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var RO = W.MA.relationOptions;
var P = W.MA.properties;

function src(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
}

describe('関係行の読み取り', function() {
  test('ふつうの関係行を左 / 矢印 / 右 / ラベルに分ける', function() {
    var p = RO.parseLine('User --> (Login) : 使う');
    expect(p.left).toBe('User');
    expect(p.arrow).toBe('-->');
    expect(p.right).toBe('(Login)');
    expect(p.label).toBe('使う');
  });

  test('多重度つきの行を読める', function() {
    var p = RO.parseLine('Order "1" *-- "*" Item');
    expect(p.left).toBe('Order');
    expect(p.leftMult).toBe('1');
    expect(p.arrow).toBe('*--');
    expect(p.rightMult).toBe('*');
    expect(p.right).toBe('Item');
  });

  test('色つきの行を読める', function() {
    expect(RO.lineColor('A -[#red]-> B')).toBe('red');
    expect(RO.lineColor('A --> B')).toBe('');
  });

  test('関係でない行は null を返す', function() {
    ['@startuml', 'actor User', 'title Sample', '', '  }'].forEach(function(l) {
      expect(RO.parseLine(l)).toBe(null);
    });
  });

  test('読める矢印の種類 (3 図種で使うもの) をすべて矢印と認める', function() {
    ['-->', '<--', '..>', '<..', '<|--', '--|>', '<|..', '*--', 'o--', '--', '-', '-[#red]>']
      .forEach(function(a) { expect(RO.isArrow(a)).toBe(true); });
  });

  test('識別子は矢印と間違えない', function() {
    ['User', '(Login)', '"Order Item"', ':Actor:'].forEach(function(t) {
      expect(RO.isArrow(t)).toBe(false);
    });
  });
});

describe('向き / Direction', function() {
  test('現在の向きを読む', function() {
    expect(RO.direction('A --> B')).toBe('forward');
    expect(RO.direction('A <-- B')).toBe('backward');
    expect(RO.direction('A -- B')).toBe('none');
  });

  test('To → From にすると矢の先が左へ移る', function() {
    expect(RO.setDirection('A --> B', 'backward')).toBe('A <-- B');
  });

  test('From → To に戻すと矢の先が右へ移る', function() {
    expect(RO.setDirection('A <-- B', 'forward')).toBe('A --> B');
  });

  test('矢印なしは両端の矢の先を落とす', function() {
    expect(RO.setDirection('A --> B', 'none')).toBe('A -- B');
    expect(RO.setDirection('A <|-- B', 'none')).toBe('A -- B');
  });

  test('矢印なしの行に向きを与えると普通の矢が付く', function() {
    expect(RO.setDirection('A -- B', 'forward')).toBe('A --> B');
    expect(RO.setDirection('A -- B', 'backward')).toBe('A <-- B');
  });

  test('継承の三角は三角のまま向きだけ変わる', function() {
    expect(RO.setDirection('A <|-- B', 'forward')).toBe('A --|> B');
    expect(RO.setDirection('A --|> B', 'backward')).toBe('A <|-- B');
  });

  test('合成・集約の菱形は元の側に残る', function() {
    expect(RO.setDirection('A *-- B', 'forward')).toBe('A *--> B');
    expect(RO.setDirection('A o--> B', 'none')).toBe('A o-- B');
  });

  test('点線は点線のまま', function() {
    expect(RO.setDirection('A ..> B', 'backward')).toBe('A <.. B');
  });

  test('向きを変えてもラベルと多重度は残る', function() {
    expect(RO.setDirection('Order "1" --> "*" Item : holds', 'backward'))
      .toBe('Order "1" <-- "*" Item : holds');
  });

  test('インデントを保つ (package の中の行が左に寄らない)', function() {
    expect(RO.setDirection('  A --> B', 'backward')).toBe('  A <-- B');
  });
});

describe('多重度 / Multiplicity', function() {
  test('両端に付ける', function() {
    expect(RO.setMultiplicity('Order --> Item', '1', '*')).toBe('Order "1" --> "*" Item');
  });

  test('片側だけ付ける', function() {
    expect(RO.setMultiplicity('Order --> Item', '', '0..1')).toBe('Order --> "0..1" Item');
  });

  test('空にすると引用符ごと消える', function() {
    expect(RO.setMultiplicity('Order "1" --> "*" Item', '', '')).toBe('Order --> Item');
  });

  test('現在値を読む', function() {
    expect(RO.multiplicity('Order "1" --> "*" Item')).toEqual({ left: '1', right: '*' });
    expect(RO.multiplicity('Order --> Item')).toEqual({ left: '', right: '' });
  });
});

describe('線の色 / Line color', function() {
  test('色は線の中に `-[#red]>` の形で入る', function() {
    expect(RO.setLineColor('A --> B', 'red')).toBe('A -[#red]-> B');
    expect(RO.setLineColor('A -> B', 'red')).toBe('A -[#red]> B');
  });

  test('別の色に差し替えても二重にならない', function() {
    expect(RO.setLineColor('A -[#red]-> B', 'blue')).toBe('A -[#blue]-> B');
  });

  test('既定 (空) に戻すと色が消える', function() {
    expect(RO.setLineColor('A -[#red]-> B', '')).toBe('A --> B');
  });

  test('先頭の # を書かれても 1 つだけにする', function() {
    expect(RO.setLineColor('A --> B', '#00FF00')).toBe('A -[#00FF00]-> B');
  });

  test('点線・継承にも同じように付く', function() {
    expect(RO.setLineColor('A ..> B', 'green')).toBe('A .[#green].> B');
    expect(RO.setLineColor('A <|-- B', 'blue')).toBe('A <|-[#blue]- B');
  });

  test('design が挙げる色見本を持つ', function() {
    var vals = RO.COLORS.map(function(c) { return c.value; });
    ['', 'red', 'orange', 'green', 'blue', 'violet'].forEach(function(v) {
      expect(vals.indexOf(v) >= 0).toBe(true);
    });
    RO.COLORS.forEach(function(c) { expect(/^#[0-9a-fA-F]{6}$/.test(c.swatch)).toBe(true); });
  });
});

describe('この線にノートを添える', function() {
  var BASE = ['@startuml', 'A --> B : call', 'B --> C', '@enduml'].join('\n');

  test('関係行の直後に note on link ブロックを入れる', function() {
    var out = RO.setNoteAt(BASE, 2, '要確認');
    expect(out.split('\n')).toEqual([
      '@startuml', 'A --> B : call', 'note on link', '  要確認', 'end note', 'B --> C', '@enduml',
    ]);
  });

  test('入れたノートを読み返せる', function() {
    expect(RO.noteAt(RO.setNoteAt(BASE, 2, '要確認'), 2)).toBe('要確認');
    expect(RO.noteAt(BASE, 2)).toBe(null);
  });

  test('もう一度書くと差し替わる (ブロックが増えない)', function() {
    var out = RO.setNoteAt(RO.setNoteAt(BASE, 2, 'A'), 2, 'B');
    expect(out.split('\n').filter(function(l) { return /note on link/.test(l); }).length).toBe(1);
    expect(RO.noteAt(out, 2)).toBe('B');
  });

  test('外すとブロックごと消え、元の DSL に戻る', function() {
    expect(RO.setNoteAt(RO.setNoteAt(BASE, 2, '要確認'), 2, null)).toBe(BASE);
  });

  test('ノートを付けても他の行は 1 バイトも変わらない', function() {
    var before = BASE.split('\n'), after = RO.setNoteAt(BASE, 2, 'x').split('\n');
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[5]).toBe(before[2]);
    expect(after[6]).toBe(before[3]);
  });

  test('関係でない行に付けようとしても DSL は変わらない', function() {
    expect(RO.setNoteAt(BASE, 1, 'x')).toBe(BASE);
  });
});

describe('optionsAt: 右ペインが今の値をそのまま出せる', function() {
  test('既定の関係行', function() {
    var o = RO.optionsAt('@startuml\nA --> B\n@enduml', 2);
    expect(o).toEqual({ direction: 'forward', leftMult: '', rightMult: '', color: '', note: null });
  });

  test('全部指定された関係行', function() {
    var t = '@startuml\nA "1" <-[#red]- "*" B : x\nnote on link\n  memo\nend note\n@enduml';
    var o = RO.optionsAt(t, 2);
    expect(o.direction).toBe('backward');
    expect(o.leftMult).toBe('1');
    expect(o.rightMult).toBe('*');
    expect(o.color).toBe('red');
    expect(o.note).toBe('memo');
  });

  test('関係でない行なら null', function() {
    expect(RO.optionsAt('@startuml\nA --> B\n@enduml', 1)).toBe(null);
  });
});

describe('その他の設定パレットの HTML', function() {
  function html(o) { return P.relationOptionsHtml('x-more', o); }
  var DEFAULT = { direction: 'forward', leftMult: '', rightMult: '', color: '', note: null };

  test('「その他の設定…」の開閉ボタンを持つ', function() {
    expect(html(DEFAULT)).toContain('その他の設定…');
    expect(html(DEFAULT)).toContain('id="x-more-btn"');
  });

  test('design が挙げる 4 つの見出しが並ぶ', function() {
    var h = html(DEFAULT);
    ['向き / Direction', '多重度 / Multiplicity', '線の色 / Line color', 'この線にノートを添える']
      .forEach(function(s) { expect(h).toContain(s); });
  });

  test('向きは 3 つの選択肢を出し、現在値が押された状態になる', function() {
    var h = html(DEFAULT);
    expect(h).toContain('From → To');
    expect(h).toContain('To → From');
    expect(h).toContain('矢印なし');
    expect(h).toContain('data-value="forward" aria-pressed="true"');
    expect(h).toContain('data-value="none" aria-pressed="false"');
  });

  test('色見本を COLORS の数だけ出す', function() {
    var h = html(DEFAULT);
    expect((h.match(/class="prop-rel-color/g) || []).length).toBe(RO.COLORS.length);
    expect(h).toContain('data-value="violet"');
  });

  test('既定のままならパレットは閉じている', function() {
    expect(html(DEFAULT)).toContain('id="x-more" hidden');
  });

  test('既定から外れていればパレットは開いた状態で出る', function() {
    var h = html({ direction: 'forward', leftMult: '1', rightMult: '', color: '', note: null });
    expect(h).not.toContain('id="x-more" hidden');
    expect(h).toContain('aria-expanded="true"');
  });

  test('Esc で閉じることと即時反映を画面に書く', function() {
    expect(html(DEFAULT)).toContain('Esc で閉じる');
    expect(html(DEFAULT)).toContain('変更は即座に DSL へ反映');
  });

  test('ノートが無ければ入力欄は畳まれ、あれば中身が入って開く', function() {
    expect(html(DEFAULT)).toContain('id="x-more-note" hidden');
    var h = html({ direction: 'forward', leftMult: '', rightMult: '', color: '', note: 'memo' });
    expect(h).toContain('id="x-more-note-on" type="checkbox" checked');
    expect(h).toContain('>memo</textarea>');
  });

  test('多重度は現在値を入れて出す', function() {
    var h = html({ direction: 'forward', leftMult: '1', rightMult: '*', color: '', note: null });
    expect(h).toContain('id="x-more-mult-left" type="text" value="1"');
    expect(h).toContain('id="x-more-mult-right" type="text" value="*"');
  });
});

describe('その他の設定を当てた行を 3 図種が読み続けられる', function() {
  var mods = {
    UseCase: [W.MA.modules.plantumlUsecase, '@startuml\nactor User\nusecase "Login" as UC1\n{REL}\n@enduml',
              'User', 'UC1'],
    Component: [W.MA.modules.plantumlComponent, '@startuml\ncomponent Web\ncomponent Api\n{REL}\n@enduml',
                'Web', 'Api'],
    Class: [W.MA.modules.plantumlClass, '@startuml\nclass Order\nclass Item\n{REL}\n@enduml',
            'Order', 'Item'],
  };

  Object.keys(mods).forEach(function(name) {
    var mod = mods[name][0], tpl = mods[name][1], A = mods[name][2], B = mods[name][3];
    function rel(line) {
      return (mod.parse(tpl.replace('{REL}', line)).relations || [])
        .filter(function(r) { return r.line === 4; })[0];
    }

    test(name + ': 多重度を付けた行を関係として読み続ける', function() {
      var r = rel(A + ' "1" -- "*" ' + B);
      expect(!!r).toBe(true);
      expect(r.from).toBe(A);
      expect(r.to).toBe(B);
    });

    test(name + ': 線の色を付けた行を関係として読み続ける', function() {
      var r = rel(A + ' -[#red]- ' + B);
      expect(!!r).toBe(true);
      expect(r.from).toBe(A);
      expect(r.to).toBe(B);
    });

    test(name + ': 多重度と色を付けてもラベルは読める', function() {
      var r = rel(A + ' "1" -[#blue]- "*" ' + B + ' : holds');
      expect(!!r).toBe(true);
      expect(r.label).toBe('holds');
    });

    test(name + ': ラベルを書き換えても多重度と色が消えない', function() {
      var text = tpl.replace('{REL}', A + ' "1" -[#red]- "*" ' + B);
      var out = mod.updateRelation(text, 4, 'label', 'holds').split('\n')[3];
      expect(out).toContain('"1"');
      expect(out).toContain('"*"');
      expect(out).toContain('[#red]');
      expect(out).toContain('holds');
    });
  });

  test('Class: 向きを反転した関連 `<--` を読み、矢の先を to にする', function() {
    var r = (W.MA.modules.plantumlClass.parse('@startuml\nclass Order\nclass Item\nOrder <-- Item\n@enduml')
      .relations || [])[0];
    expect(!!r).toBe(true);
    expect(r.kind).toBe('association');
    expect(r.from).toBe('Item');
    expect(r.to).toBe('Order');
  });

  test('Class: 合成に向きを付けた `*-->` も合成のまま読む', function() {
    var r = (W.MA.modules.plantumlClass.parse('@startuml\nclass Order\nclass Item\nOrder *--> Item\n@enduml')
      .relations || [])[0];
    expect(r.kind).toBe('composition');
    expect(r.from).toBe('Order');
    expect(r.to).toBe('Item');
  });
});

describe('3 図種が同じ入口を使う', function() {
  var files = {
    UseCase: ['src/modules/usecase.js', 'uc-rel-more'],
    Component: ['src/modules/component.js', 'co-rel-more'],
    Class: ['src/modules/class.js', 'cl-rel-more'],
  };

  Object.keys(files).forEach(function(name) {
    var rel = files[name][0], id = files[name][1];
    test(name + ' の関係パネルが「その他の設定」を出す', function() {
      expect(src(rel)).toContain("P.relationOptionsFor('" + id + "'");
    });
    test(name + ' の関係パネルが「その他の設定」を配線する', function() {
      expect(src(rel)).toContain("P.bindRelationOptionsFor('" + id + "', relation.line, ctx)");
    });
  });

  test('図種ごとに向き / 色 / 多重度の判断を書き写していない', function() {
    Object.keys(files).forEach(function(name) {
      expect(src(files[name][0])).not.toContain('[#');
    });
  });

  test('本体 HTML が core モジュールを読み込む', function() {
    expect(src('plantuml-assist.html')).toContain('src/core/relation-options.js');
  });
});
