'use strict';
// BLK-reviewer-20260912-2206-wish: junior/primary の gpio_init_sequence.puml で
// participant 名 (Gpio / Gpio_Driver) と粒度が食い違っているのを見つけたが、
// GUI にはこの 2 枚を並べて見る手段が無く、persona-data の 2 フォルダから
// 同名ファイルを自分でテキストとして開いて読み比べるしかなかった。
// 同名ファイルで組み、本文を左右に並べ、食い違う語だけに印を付ける。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
[
  '../src/core/dsl-utils.js',
  '../src/core/parser-utils.js',
  '../src/core/name-audit.js',
  '../src/core/scope-decl.js',
  '../src/core/family-audit.js',
  '../src/core/audit-scope.js',
  '../src/core/domain-cohort.js',
  '../src/core/side-by-side.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var sbs = global.window.MA.sideBySide;

function seq(participants, messages) {
  return ['@startuml']
    .concat(participants.map(function(p) { return 'participant ' + p; }))
    .concat(messages)
    .concat(['@enduml']).join('\n');
}

// reviewer が実際に突き当たった 2 枚。junior は Gpio、primary は Gpio_Driver。
// primary の方が 1 メッセージ細かい (粒度の食い違い)。
var JUNIOR = {
  name: 'junior/gpio_init_sequence.puml',
  dsl: seq(['Gpio', 'Hw_Ctrl'], ['Gpio -> Hw_Ctrl : Gpio_Init', 'Hw_Ctrl --> Gpio : Gpio_Done']),
};
var PRIMARY = {
  name: 'primary/gpio_init_sequence.puml',
  dsl: seq(['Gpio_Driver', 'Hw_Ctrl'],
    ['Gpio_Driver -> Hw_Ctrl : Gpio_Init', 'Gpio_Driver -> Hw_Ctrl : Gpio_SetMode',
     'Hw_Ctrl --> Gpio_Driver : Gpio_Done']),
};

describe('sideBySide の組み方', function() {
  test('同じファイル名でフォルダの違う 2 枚を組む', function() {
    var pairs = sbs.pairsByFile([
      JUNIOR, PRIMARY,
      { name: 'junior/spi_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
    ]);
    expect(pairs.length).toBe(1);
    expect(pairs[0].base).toBe('gpio_init_sequence');
    // 左右はフォルダ名順で固定する (開くたびに入れ替わらない)
    expect(pairs[0].a.folder).toBe('junior');
    expect(pairs[0].b.folder).toBe('primary');
  });

  test('同じフォルダの 2 枚や、フォルダの無い名前は組まない', function() {
    var pairs = sbs.pairsByFile([
      { name: 'junior/gpio_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
      { name: 'gpio_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
    ]);
    expect(pairs.length).toBe(0);
  });

  test('ファイル名が同じでもドメインが違えば別の組になる', function() {
    var pairs = sbs.pairsByFile([
      JUNIOR, PRIMARY,
      { name: 'junior/can_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
      { name: 'primary/can_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
    ]);
    expect(pairs.map(function(p) { return p.base; })).toEqual(['can_state', 'gpio_init_sequence']);
  });

  test('見出しは、どちらのフォルダが左かを言う', function() {
    var p = sbs.pairsByFile([JUNIOR, PRIMARY])[0];
    expect(sbs.headerLabel(p)).toBe('gpio_init_sequence: junior ⇔ primary');
  });
});

describe('sideBySide の印', function() {
  test('綴りまで同じ語には印を付けない', function() {
    var m = sbs.marks(JUNIOR, PRIMARY);
    expect(m.left['Hw_Ctrl'].status).toBe('same');
    expect(m.right['Hw_Ctrl'].status).toBe('same');
  });

  test('Gpio と Gpio_Driver を、同じものの綴り違いとして 1 件に組む', function() {
    var m = sbs.marks(JUNIOR, PRIMARY);
    expect(m.left['Gpio'].status).toBe('spelling');
    expect(m.left['Gpio'].right).toBe('Gpio_Driver');
    expect(m.left['Gpio'].by).toBe('部分一致');
    // 同じ組を指すので、右から引いても同じ行が返る
    expect(m.right['Gpio_Driver'].left).toBe('Gpio');
    // 2 件ではなく 1 件 (片方にしか無い語が 2 つ、とは出さない)
    expect(m.names.filter(function(r) { return r.status !== 'same'; }).length).toBe(1);
  });

  test('片方にしか無いメッセージ名は only のまま残す', function() {
    var m = sbs.marks(JUNIOR, PRIMARY);
    var only = m.labels.filter(function(r) { return r.status === 'only'; });
    expect(only.map(function(r) { return r.right; })).toContain('Gpio_SetMode');
  });

  test('3 文字未満の語や、候補が 2 つ以上ある語は組まない', function() {
    var a = { name: 'junior/x.puml', dsl: seq(['Hw'], ['Hw -> Hw : Ping']) };
    var b = { name: 'primary/x.puml', dsl: seq(['Hw_Ctrl'], ['Hw_Ctrl -> Hw_Ctrl : Ping']) };
    var m = sbs.marks(a, b);
    expect(m.left['Hw'].status).toBe('only');

    var c = { name: 'junior/y.puml', dsl: seq(['Gpio'], ['Gpio -> Gpio : Go']) };
    var d = { name: 'primary/y.puml',
      dsl: seq(['Gpio_Driver', 'Gpio_Port'], ['Gpio_Driver -> Gpio_Port : Go']) };
    var m2 = sbs.marks(c, d);
    // Gpio の相手が 2 つあるので、どちらとも決めない
    expect(m2.left['Gpio'].status).toBe('only');
  });

  test('食い違った語だけを数え上げられる', function() {
    var g = sbs.gaps(sbs.marks(JUNIOR, PRIMARY));
    expect(g.length).toBe(2);           // Gpio/Gpio_Driver と Gpio_SetMode
    expect(sbs.summaryLine(JUNIOR, PRIMARY)).toContain('Gpio / Gpio_Driver');
    expect(sbs.summaryLine(JUNIOR, PRIMARY)).toContain('対応候補');
    expect(sbs.summaryLine(JUNIOR, JUNIOR)).toBe('部品名・メッセージ名とも一致しています (綴りまで同じ)');
  });
});

describe('sideBySide の行', function() {
  test('印の付く語だけを切り出し、同じ語の途中には当てない', function() {
    var m = sbs.marks(JUNIOR, PRIMARY);
    var segs = sbs.segments('Gpio -> Hw_Ctrl : Gpio_Init', m, 'left');
    var marked = segs.filter(function(s) { return s.mark; });
    expect(marked.length).toBe(1);
    expect(marked[0].text).toBe('Gpio');
    expect(marked[0].mark).toBe('spelling');
    // Gpio_Init の中の Gpio には当たらない (語の途中)
    expect(segs.map(function(s) { return s.text; }).join('')).toBe('Gpio -> Hw_Ctrl : Gpio_Init');
  });

  test('長い綴りを先に当てる (Gpio_Driver が Gpio + _Driver に割れない)', function() {
    var m = sbs.marks(JUNIOR, PRIMARY);
    var segs = sbs.segments('Gpio_Driver -> Hw_Ctrl : Gpio_Init', m, 'right');
    var marked = segs.filter(function(s) { return s.mark; });
    expect(marked.length).toBe(1);
    expect(marked[0].text).toBe('Gpio_Driver');
  });

  test('綴り違いの行は同じ段に並べ、片方にしか無い行だけを段の増減にする', function() {
    var rows = sbs.rows(JUNIOR, PRIMARY);
    var kinds = rows.map(function(r) { return r.kind; });
    // 片方にしか無い行はちょうど 1 本 (primary の Gpio_SetMode)
    var onlyRight = rows.filter(function(r) { return r.kind === 'only-right'; });
    expect(onlyRight.length).toBe(1);
    expect(onlyRight[0].right).toContain('Gpio_SetMode');
    expect(kinds).not.toContain('only-left');
    // participant 宣言の行は綴り違いとして同じ段に並ぶ
    var decl = rows.filter(function(r) { return (r.left || '').indexOf('participant Gpio') === 0; });
    expect(decl.length).toBe(1);
    expect(decl[0].kind).toBe('changed');
    expect(decl[0].right).toBe('participant Gpio_Driver');
  });

  test('行番号は元の本文の番号のまま返す', function() {
    var rows = sbs.rows(JUNIOR, PRIMARY);
    var last = rows[rows.length - 1];
    expect(last.left).toBe('@enduml');
    expect(last.lineA).toBe(JUNIOR.dsl.split('\n').length);
    expect(last.lineB).toBe(PRIMARY.dsl.split('\n').length);
  });

  test('同じ図どうしなら、印の付く段は 1 つも出ない', function() {
    var rows = sbs.rows(JUNIOR, JUNIOR);
    expect(rows.every(function(r) { return r.kind === 'same'; })).toBe(true);
  });

  test('どちらの綴りに揃えるかの選択肢を、フォルダ名付きで出す', function() {
    var m = sbs.marks(JUNIOR, PRIMARY);
    var c = sbs.choicesFor(m.left['Gpio'], 'junior', 'primary');
    expect(c.map(function(x) { return x.folder + ':' + x.name; }))
      .toEqual(['junior:Gpio', 'primary:Gpio_Driver']);
    // 片方にしか無い語は「揃える」対象ではない
    expect(sbs.choicesFor(m.labels.filter(function(r) { return r.status === 'only'; })[0],
      'junior', 'primary')).toEqual([]);
  });
});
