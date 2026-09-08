'use strict';
// BLK-reviewer-20260909-0403-wish: 対象を junior の図に広げたとき、GPIO ドメインで
// junior/primary 双方の図が別物と気付くまでに、該当ファイルを名前で推測して
// 4 枚個別に開き、テキストを見比べる以外の手段が無かった。
// ドメイン名でフォルダを横断して束ね、同じ図種の組の差分をその場で出す。

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
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var dc = global.window.MA.domainCohort;

function seq(participants, messages) {
  return ['@startuml']
    .concat(participants.map(function(p) { return 'participant ' + p; }))
    .concat(messages)
    .concat(['@enduml']).join('\n');
}

var DOCS = [
  {
    name: 'junior/gpio_init_sequence.puml',
    dsl: seq(['GpioDrv', 'Hw_Ctrl'], ['GpioDrv -> Hw_Ctrl : Gpio_Init']),
  },
  {
    name: 'primary/gpio_init_sequence.puml',
    dsl: seq(['Gpio_Driver', 'Hw_Ctrl'],
      ['Gpio_Driver -> Hw_Ctrl : Gpio_Init', 'Gpio_Driver -> Hw_Ctrl : Gpio_SetMode']),
  },
  {
    name: 'junior/gpio_state.puml',
    dsl: '@startuml\n[*] --> Uninit\nUninit --> Ready : Gpio_Init\n@enduml',
  },
  {
    name: 'primary/gpio_state.puml',
    dsl: '@startuml\n[*] --> Uninit\nUninit --> Ready : Gpio_Init\n@enduml',
  },
  // 1 フォルダにしか無いドメイン。比べる相手がいないので突合の母数に入れない。
  { name: 'primary/spi_state.puml', dsl: '@startuml\n[*] --> Idle\nIdle --> Busy : Spi_Start\n@enduml' },
  // フォルダの無い名前 (単体ファイルを直接渡した場合)。
  { name: 'uart_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
];

describe('domainCohort の分類', function() {
  test('フォルダ名とドメイン名をファイル名から取れる', function() {
    expect(dc.folderOf('junior/gpio_init_sequence.puml')).toBe('junior');
    expect(dc.folderOf('junior\\gpio_state.puml')).toBe('junior');
    expect(dc.folderOf('uart_state.puml')).toBe('');
    expect(dc.baseOf('junior/gpio_init_sequence.puml')).toBe('gpio_init_sequence');
    expect(dc.domainOf('junior/gpio_init_sequence.puml')).toBe('gpio');
    // family-audit の系統キーと同じ規則 (CLI の「系統」と画面の「ドメイン」を割らない)
    expect(dc.domainOf('primary/GpioClass.puml')).toBe('gpio');
  });

  test('ドメインで束ね、2 フォルダ以上にまたがるものだけを比較対象にする', function() {
    var all = dc.groups(DOCS);
    expect(all.map(function(g) { return g.domain; })).toEqual(['gpio', 'spi', 'uart']);
    var cross = dc.crossFolder(all);
    expect(cross.map(function(g) { return g.domain; })).toEqual(['gpio']);
    expect(cross[0].folders).toEqual(['junior', 'primary']);
    expect(cross[0].entries.length).toBe(4);
    // 並びはフォルダ順 → ファイル名順。画面の列と CLI の行がこの順で一致する
    expect(cross[0].entries.map(function(e) { return e.folder + '/' + e.base; }))
      .toEqual(['junior/gpio_init_sequence', 'junior/gpio_state',
        'primary/gpio_init_sequence', 'primary/gpio_state']);
  });

  test('組むのはフォルダが違い図種が同じ 2 枚だけ', function() {
    var g = dc.crossFolder(dc.groups(DOCS))[0];
    var pairs = dc.pairsFor(g);
    expect(pairs.length).toBe(2);
    pairs.forEach(function(p) {
      expect(p.a.folder).not.toBe(p.b.folder);
      expect(p.a.kind).toBe(p.b.kind);
    });
    expect(pairs.map(function(p) { return p.kind; }).sort())
      .toEqual(['plantuml-sequence', 'plantuml-state']);
  });
});

describe('domainCohort の突合', function() {
  test('部品名と矢印ラベルを別々に、共通 / 片方だけ に分ける', function() {
    var d = dc.diff(DOCS[0], DOCS[1]);
    expect(d.names.both).toEqual(['Hw_Ctrl']);
    expect(d.names.onlyA).toEqual(['GpioDrv']);
    expect(d.names.onlyB).toEqual(['Gpio_Driver']);
    expect(d.labels.both).toEqual(['Gpio_Init']);
    expect(d.labels.onlyA).toEqual([]);
    expect(d.labels.onlyB).toEqual(['Gpio_SetMode']);
    expect(d.gaps).toBe(3);
    expect(d.matched).toBe(false);
  });

  test('揃っている組は matched になる', function() {
    var d = dc.diff(DOCS[2], DOCS[3]);
    expect(d.gaps).toBe(0);
    expect(d.matched).toBe(true);
  });

  // 状態遷移図で初期遷移にしか出てこない状態 (`[*] --> Ready`) は name-audit の
  // 矢印規則に掛からない。拾わないと状態名の食い違いがその 1 つ分だけ静かに消える。
  test('初期遷移にしか出てこない状態名も部品名として拾う', function() {
    var names = dc.namesOf({
      name: 'junior/x_state.puml',
      dsl: '@startuml\n[*] --> Uninit\nUninit --> Ready : Init\nReady --> [*]\n@enduml',
    }).map(function(n) { return n.name; });
    expect(names).toEqual(['Ready', 'Uninit']);
  });

  test('片方にしか無い状態が「共通」に紛れない', function() {
    var a = { name: 'junior/y_state.puml', dsl: '@startuml\n[*] --> Uninit\n@enduml' };
    var b = { name: 'primary/y_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' };
    var d = dc.diff(a, b);
    expect(d.names.onlyA).toEqual(['Uninit']);
    expect(d.names.onlyB).toEqual(['Idle']);
    expect(d.matched).toBe(false);
  });

  test('綴りが割れているだけの共通名は両方の綴りを見せる', function() {
    var a = { name: 'junior/x_state.puml', dsl: '@startuml\n[*] --> Ready : Init\n@enduml' };
    var b = { name: 'primary/x_state.puml', dsl: '@startuml\n[*] --> READY : Init\n@enduml' };
    var d = dc.diff(a, b);
    expect(d.names.both).toContain('Ready / READY');
    expect(d.matched).toBe(true);
  });
});

describe('domainCohort.audit', function() {
  var r = dc.audit(DOCS);

  test('食い違うドメインを、どのフォルダの間かまで名指しできる', function() {
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].domain).toBe('gpio');
    expect(r.groups[0].mismatched).toBe(1);        // sequence だけが食い違い
    expect(r.groups[0].unpaired).toBe(false);
    expect(dc.summaryLine(r)).toContain('gpio [junior × primary]');
  });

  test('相手のいないドメインは「揃っている」に数えず、別に持つ', function() {
    expect(r.soloDomains).toEqual(['spi', 'uart']);
    expect(r.domains).toBe(3);
  });

  test('同じドメインだが図種が噛み合わない組は unpaired として残す', function() {
    var docs = [
      { name: 'junior/dma_state.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
      { name: 'primary/dma_init_sequence.puml', dsl: seq(['Dma'], ['Dma -> Dma : Go']) },
    ];
    var out = dc.audit(docs);
    expect(out.groups.length).toBe(1);
    expect(out.groups[0].pairs.length).toBe(0);
    expect(out.groups[0].unpaired).toBe(true);
    expect(dc.summaryLine(out)).toContain('図種が噛み合わず比べられないドメイン 1 件: dma');
  });

  test('フォルダをまたぐドメインが無ければ、そう言い切る', function() {
    var out = dc.audit([DOCS[4]]);
    expect(out.groups).toEqual([]);
    expect(dc.summaryLine(out)).toContain('フォルダをまたぐドメインがありません');
  });

  test('rows は画面の 1 行 = 突き合わせた 1 組', function() {
    var rows = dc.rows(r);
    expect(rows.length).toBe(2);
    expect(rows[0].domain).toBe('gpio');
    expect(rows[0].left).toBe('junior / gpio_init_sequence');
    expect(rows[0].right).toBe('primary / gpio_init_sequence');
    expect(rows[0].matched).toBe(false);
    expect(rows[1].matched).toBe(true);
  });
});

// BLK-reviewer-20260909-0503-wish: 突合を GPIO の外へ広げた回、`plantuml` ドメインが
// junior/primary/reviewer の 3 フォルダで「食い違い」と出た。中身はアプリ同梱テンプレ
// (plantuml-sequence.puml の Sample Sequence / User→System→DB) を各自が独立に複製した
// 練習用ファイルで、業務上の名前空間衝突ではない。テンプレ由来の雑音を業務データの
// 食い違いと同じ件数に混ぜないことを、ここで守る。
describe('domainCohort のテンプレ除外', function() {
  function tpl(folder, base, title) {
    return {
      name: folder + '/' + base + '.puml',
      dsl: ['@startuml', 'title ' + title, 'actor User', 'participant System', 'database DB',
        'User -> System : Request', 'System -> DB : Query', '@enduml'].join('\n'),
    };
  }
  // 3 人がそれぞれ同梱テンプレを複製し、うち 1 人だけが少し書き換えた状態。
  var TPL_DOCS = [
    tpl('junior', 'plantuml-sequence', 'Sample Sequence'),
    tpl('primary', 'plantuml-sequence', 'Sample Sequence'),
    {
      name: 'reviewer/plantuml-sequence.puml',
      dsl: ['@startuml', 'title Sample Sequence', 'actor User', 'participant System',
        'User -> System : Ping', '@enduml'].join('\n'),
    },
    // 新規タブの既定サンプル。フォルダをまたいで同名で残りやすい。
    { name: 'junior/diagram1.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },
    { name: 'primary/diagram1.puml', dsl: '@startuml\n[*] --> Ready\n@enduml' },
  ];

  test('テンプレ由来のファイルに印が付く', function() {
    var all = dc.groups(TPL_DOCS);
    var g = all.filter(function(x) { return x.domain === 'plantuml'; })[0];
    expect(g.entries.length).toBe(3);
    expect(g.templateOnly).toBe(true);
    expect(g.dataEntries.length).toBe(0);
    expect(g.entries[0].template).toBe(true);
    expect(g.entries[0].templateReason).toBe('アプリ同梱テンプレ');
    expect(dc.isTemplate('junior/gpio_state.puml')).toBe(false);
  });

  test('テンプレだけのドメインは食い違いに数えず、除外として別に持つ', function() {
    var out = dc.audit(TPL_DOCS);
    expect(out.groups).toEqual([]);
    expect(out.templateDomains.map(function(t) { return t.domain; })).toEqual(['diagram1', 'plantuml']);
    expect(out.templateDomains[1].folders).toEqual(['junior', 'primary', 'reviewer']);
    expect(out.templateFiles).toBe(5);
    // 「相手がいないので比べていない」ドメインにも混ぜない (直し方が違う)。
    expect(out.soloDomains).toEqual([]);
  });

  test('除外した件数は要約に必ず出る (黙って減らさない)', function() {
    var line = dc.summaryLine(dc.audit(TPL_DOCS));
    expect(line).toContain('テンプレ由来 2 ドメインは除外: diagram1, plantuml');
  });

  test('業務データの食い違いはテンプレを混ぜても変わらない', function() {
    var out = dc.audit(DOCS.concat(TPL_DOCS));
    expect(out.groups.map(function(g) { return g.domain; })).toEqual(['gpio']);
    expect(out.groups[0].mismatched).toBe(1);
    expect(dc.summaryLine(out)).toContain('gpio [junior × primary]');
  });

  test('見たいときは includeTemplates で戻せる', function() {
    var out = dc.audit(TPL_DOCS, { includeTemplates: true });
    expect(out.groups.map(function(g) { return g.domain; })).toEqual(['diagram1', 'plantuml']);
    // reviewer だけ書き換えているので、含めれば食い違いとして出る。
    var pl = out.groups[1];
    expect(pl.mismatched).toBeGreaterThan(0);
    expect(dc.summaryLine(out)).toContain('テンプレ由来 2 ドメインも含めている');
  });

  test('テンプレと業務データが同じドメインに混ざったら、業務データだけで組む', function() {
    var docs = [
      { name: 'junior/sample.puml', dsl: '@startuml\n[*] --> Idle\n@enduml' },   // 既定名のまま
      { name: 'primary/sample_gpio_state.puml', dsl: '@startuml\n[*] --> Ready\n@enduml' },
      { name: 'reviewer/sample_gpio_state.puml', dsl: '@startuml\n[*] --> Ready\n@enduml' },
    ];
    var g = dc.groups(docs)[0];
    expect(g.domain).toBe('sample');
    expect(g.templateEntries.length).toBe(1);
    expect(g.dataFolders).toEqual(['primary', 'reviewer']);
    var out = dc.audit(docs);
    expect(out.groups.length).toBe(1);
    expect(out.groups[0].folders).toEqual(['primary', 'reviewer']);
    expect(out.groups[0].templates).toBe(1);
    expect(out.groups[0].pairs.length).toBe(1);
    expect(out.groups[0].mismatched).toBe(0);
  });
});
