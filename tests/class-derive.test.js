'use strict';
// BLK-junior-20260909-0703-wish: 手本のクラス図の親から派生を 1 つ起こす。
// 親の宣言とメンバが原文のまま引き継がれ、親の関連を「同じ関連を引く」で選べることを
// 機械判定する。行の生成は classScaffold と同じ経路を通るので、書式が割れないことも見る。
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/class-scaffold.js', '../src/core/class-derive.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

var CD = global.window.MA.classDerive;
var cls = global.window.MA.modules.plantumlClass;

// junior が手本にしている「共通の親 + 派生 + 周辺クラス」の形。
var SAMPLE = [
  '@startuml',
  'abstract class Driver_Common {',
  '  +Init() : void',
  '  +Write(d) : void',
  '  -state : int',
  '}',
  'class Spi_Driver {',
  '  +Transmit() : void',
  '}',
  'class IRQCtrl',
  'Driver_Common <|-- Spi_Driver',
  'Driver_Common --> IRQCtrl : uses',
  'IRQCtrl ..> Driver_Common : notify',
  '@enduml',
].join('\n');

function parse() { return cls.parse(SAMPLE); }
function elementOf(id) {
  return parse().elements.filter(function(e) { return e.id === id; })[0];
}

describe('memberSource — 親のメンバを原文のまま引き継ぐ', function() {
  test('可視性と型の書き方をそのまま 1 行 1 メンバで返す', function() {
    expect(CD.memberSource(SAMPLE, elementOf('Driver_Common')))
      .toBe('+Init() : void\n+Write(d) : void\n-state : int');
  });

  test('メンバを持たないクラスは空文字', function() {
    expect(CD.memberSource(SAMPLE, elementOf('IRQCtrl'))).toBe('');
  });

  test('element が無くても落ちない', function() {
    expect(CD.memberSource(SAMPLE, null)).toBe('');
  });
});

describe('declOf — 親の宣言の見出し', function() {
  test('abstract class はそのキーワードで出す', function() {
    expect(CD.declOf(elementOf('Driver_Common'))).toBe('abstract class Driver_Common');
  });
  test('class はそのまま', function() {
    expect(CD.declOf(elementOf('IRQCtrl'))).toBe('class IRQCtrl');
  });
});

describe('relationCandidates — 「同じ関連を引く」の候補', function() {
  test('親が出入りしている関連を向き付きで拾う', function() {
    var c = CD.relationCandidates(SAMPLE, parse(), 'Driver_Common');
    expect(c.length).toBe(2);
    expect(c[0].kind).toBe('association');
    expect(c[0].dir).toBe('out');
    expect(c[0].other).toBe('IRQCtrl');
    expect(c[0].label).toBe('uses');
    expect(c[1].kind).toBe('dependency');
    expect(c[1].dir).toBe('in');
    expect(c[1].other).toBe('IRQCtrl');
    // 判定のためではなく、そのまま写して使う元の行を持つ
    expect(c[0].rawLine).toBe('Driver_Common --> IRQCtrl : uses');
  });

  test('継承 / 実装は候補にしない (派生を作れば必ず引かれる)', function() {
    var c = CD.relationCandidates(SAMPLE, parse(), 'Driver_Common');
    expect(c.filter(function(x) { return x.kind === 'inheritance'; }).length).toBe(0);
  });

  test('親が指定されていなければ候補は無い', function() {
    expect(CD.relationCandidates(SAMPLE, parse(), '').length).toBe(0);
  });

  test('candidateText は親を「(派生)」に置いた原文を見せる', function() {
    var c = CD.relationCandidates(SAMPLE, parse(), 'Driver_Common');
    expect(CD.candidateText(c[0], 'Driver_Common')).toBe('(派生) --> IRQCtrl : uses');
    expect(CD.candidateText(c[1], 'Driver_Common')).toBe('IRQCtrl ..> (派生) : notify');
  });
});

describe('preview / apply — 派生 1 つ分の行', function() {
  var spec = {
    parentId: 'Driver_Common',
    parentKind: 'abstract',
    name: 'Timer_Driver',
    members: '+Init() : void\n+Start(us) : void',
    picked: [0],
  };

  test('派生の宣言・メンバ・継承・選んだ関連だけを出す (親は宣言し直さない)', function() {
    expect(CD.preview(SAMPLE, parse(), spec)).toEqual([
      'class Timer_Driver {',
      '  +Init() : void',
      '  +Start(us) : void',
      '}',
      'Driver_Common <|-- Timer_Driver',
      // 手本の矢印 (`-->`) がそのまま引き継がれる (kind に畳んで `--` にしない)
      'Timer_Driver --> IRQCtrl : uses',
    ]);
  });

  test('関連を 1 つも選ばなければ継承だけ引く', function() {
    var only = CD.preview(SAMPLE, parse(), Object.assign({}, spec, { picked: [] }));
    expect(only[only.length - 1]).toBe('Driver_Common <|-- Timer_Driver');
  });

  test('派生クラス名が空なら 1 行も出さない', function() {
    expect(CD.preview(SAMPLE, parse(), Object.assign({}, spec, { name: '' }))).toEqual([]);
  });

  test('apply は @enduml の前に差し込み、他の行を触らない', function() {
    var out = CD.apply(SAMPLE, parse(), spec);
    var lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(out.indexOf('Driver_Common <|-- Timer_Driver')).toBeGreaterThan(-1);
    expect(out.indexOf('Driver_Common <|-- Spi_Driver')).toBeGreaterThan(-1);
    // 引き継いだメンバは派生側にも入る (打ち直しが要らない)
    expect(out).toContain('  +Start(us) : void');
  });

  test('日本語のクラス名は ASCII 別名に寄せ、関連も別名で引く', function() {
    var out = CD.apply(SAMPLE, parse(), Object.assign({}, spec, { name: 'タイマ' }));
    expect(out).toContain('class "タイマ" as C1');
    expect(out).toContain('Driver_Common <|-- C1');
    expect(out).toContain('C1 --> IRQCtrl : uses');
  });
});

describe('sameRelationLine — 同じ関連をもう 1 本', function() {
  function relOf(line) {
    return parse().relations.filter(function(r) { return r.line === line; })[0];
  }

  test('端点だけ差し替え、矢印の記法とラベルはそのまま', function() {
    expect(CD.sameRelationLine(SAMPLE, relOf(12), 'Timer_Driver', 'IRQCtrl'))
      .toBe('Timer_Driver --> IRQCtrl : uses');
  });

  test('向きが逆に読まれる関連でも原文の並びを崩さない', function() {
    expect(CD.sameRelationLine(SAMPLE, relOf(13), 'IRQCtrl', 'Timer_Driver'))
      .toBe('IRQCtrl ..> Timer_Driver : notify');
  });

  test('端点を入れ違いに指定しても名前が混ざらない', function() {
    expect(CD.sameRelationLine(SAMPLE, relOf(12), 'IRQCtrl', 'Driver_Common'))
      .toBe('IRQCtrl --> Driver_Common : uses');
  });

  test('relation が無ければ空文字', function() {
    expect(CD.sameRelationLine(SAMPLE, null, 'A', 'B')).toBe('');
  });
});

describe('validate — 確定できる条件', function() {
  var base = { parentId: 'Driver_Common', parentKind: 'abstract', name: 'Timer_Driver', members: '', picked: [] };

  test('親と名前が揃えば確定できる', function() {
    expect(CD.validate(SAMPLE, parse(), base).ok).toBe(true);
  });

  test('名前が空なら確定できない', function() {
    var v = CD.validate(SAMPLE, parse(), Object.assign({}, base, { name: '' }));
    expect(v.ok).toBe(false);
    expect(v.errors.join('')).toContain('派生クラス名');
  });

  test('親が無ければ確定できない', function() {
    var v = CD.validate(SAMPLE, parse(), Object.assign({}, base, { parentId: '' }));
    expect(v.ok).toBe(false);
    expect(v.errors.join('')).toContain('親クラス');
  });

  // BLK-human-20260923-1330: 同名でも DSL は書ける (既存クラスに足される)。
  // 意図と違うことが多いので警告として出すが、止めはしない。
  test('図にある名前は、警告を出したうえで追加できる', function() {
    var v = CD.validate(SAMPLE, parse(), Object.assign({}, base, { name: 'Spi_Driver' }));
    expect(v.ok).toBe(true);
    expect(v.warnings.join('')).toContain('図にあります');
  });

  test('確定できない spec の apply は DSL を 1 文字も変えない', function() {
    expect(CD.apply(SAMPLE, parse(), Object.assign({}, base, { name: '' }))).toBe(SAMPLE);
  });
});
