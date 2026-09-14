'use strict';
// BLK-primary-20260907-1303-wish 「引き継ぎパッケージ」。
//
// 願望: 14 枚一式について「系統チェック結果」「名前突合結果」「直近の変更サマリ」
// 「SVG 一式」を 1 枚のスナップショットとして書き出したい。3 つのタブを順に開いて
// 見せ回す代わりに 1 操作で終わり、渡された側は 1 つ開くだけで同じものを見られる。
//
// ここでは 4 つを 1 つに固める純関数側を検証する (zip 化は bulk-export の職掌)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/dsl-utils.js',
  '../src/core/name-audit.js',
  '../src/core/family-audit.js',
  '../src/core/change-board.js',
  '../src/core/bulk-export.js',
  '../src/core/review-pins.js',
  '../src/core/handoff-summary.js',
  '../src/core/handoff-package.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var HP = global.window.MA.handoffPackage;
var FA = global.window.MA.familyAudit;
var NA = global.window.MA.nameAudit;
var CB = global.window.MA.changeBoard;
var BE = global.window.MA.bulkExport;

// 揃っている 2 枚 (同じ adc 系統・同じ動作名)。
var ADC_SEQ = [
  '@startuml', 'participant Drv', 'participant Hw',
  'Drv -> Hw : Adc_Init', 'Drv -> Hw : Adc_Start', '@enduml',
].join('\n');
var ADC_ST = [
  '@startuml', 'state Idle', 'state Busy',
  'Idle --> Busy : Adc_Init', 'Busy --> Idle : Adc_Start', '@enduml',
].join('\n');
// 片方にしか無い動作名を持つ 2 枚 (dma 系統)。
var DMA_SEQ = [
  '@startuml', 'participant Drv', 'participant Hw',
  'Drv -> Hw : Dma_Init', 'Drv -> Hw : Dma_Abort', '@enduml',
].join('\n');
var DMA_ST = [
  '@startuml', 'state Idle', 'state Busy',
  'Idle --> Busy : Dma_Init', '@enduml',
].join('\n');

function docs(clean) {
  return clean
    ? [
      { id: 'd1', name: 'Adc_Seq', diagramType: 'plantuml-sequence', dsl: ADC_SEQ },
      { id: 'd2', name: 'Adc_State', diagramType: 'plantuml-state', dsl: ADC_ST },
    ]
    : [
      { id: 'd1', name: 'Dma_Seq', diagramType: 'plantuml-sequence', dsl: DMA_SEQ },
      { id: 'd2', name: 'Dma_State', diagramType: 'plantuml-state', dsl: DMA_ST },
    ];
}

function snapshotOf(clean, svgs, board) {
  var list = docs(clean);
  return HP.buildSnapshot({
    docs: list,
    families: FA.audit(list),
    names: NA.audit(list),
    board: board || null,
    svgs: svgs || { d1: '<svg id="a"></svg>', d2: '<svg id="b"></svg>' },
    now: new Date(2026, 8, 7, 13, 45),
  });
}

describe('パッケージの名前と日時', function() {
  test('作った日時が名前に入るので、渡したものを後から見分けられる', function() {
    expect(HP.packageName(new Date(2026, 8, 7, 13, 45))).toBe('handoff-20260907-1345.zip');
  });

  test('中に書く作成日時も同じ時刻から出る', function() {
    expect(HP.stamp(new Date(2026, 8, 7, 13, 45))).toBe('2026-09-07 13:45');
  });
});

describe('SVG のファイル名', function() {
  test('図の名前をそのまま svg/ の下に置く', function() {
    var f = HP.svgFileNames([{ id: 'a', name: 'Adc_Seq' }, { id: 'b', name: 'Adc_State' }]);
    expect(f[0].filename).toBe('svg/Adc_Seq.svg');
    expect(f[1].filename).toBe('svg/Adc_State.svg');
  });

  test('同名のタブがあっても上書きにならない', function() {
    var f = HP.svgFileNames([{ id: 'a', name: 'X' }, { id: 'b', name: 'X' }, { id: 'c', name: 'X' }]);
    expect(f.map(function(x) { return x.filename; }))
      .toEqual(['svg/X.svg', 'svg/X-2.svg', 'svg/X-3.svg']);
  });

  test('名前の無い図でも落ちない', function() {
    expect(HP.svgFileNames([{ id: 'a', name: '' }])[0].filename).toBe('svg/diagram.svg');
  });
});

describe('系統チェックの節', function() {
  test('食い違いが無ければ「揃っています」と言い切る', function() {
    var sec = HP.familySection(FA.audit(docs(true)));
    expect(sec.ok).toBe(true);
    expect(sec.count).toBe(0);
    expect(sec.line).toContain('揃っています');
  });

  test('片方にしか無い動作名があれば件数を出す', function() {
    var sec = HP.familySection(FA.audit(docs(false)));
    expect(sec.ok).toBe(false);
    expect(sec.count).toBe(1);
    expect(sec.line).toContain('1 件');
  });

  test('系統が 1 つも無ければ、その旨を書いて ok にはしない', function() {
    var sec = HP.familySection([]);
    expect(sec.ok).toBe(false);
    expect(sec.line).toContain('系統がありません');
  });
});

describe('名前突合の節', function() {
  test('揺れも宣言もれも無ければ 0 件と書く', function() {
    var sec = HP.nameSection(NA.audit(docs(true)));
    expect(sec.line).toBe('表記揺れ 0 件 ・ 宣言もれ 0 件');
    expect(sec.ok).toBe(true);
  });

  test('揺れがあれば件数を出し、ok にしない', function() {
    var list = [
      { id: 'd1', name: 'A', dsl: '@startuml\nparticipant Adc_Drv\n@enduml' },
      { id: 'd2', name: 'B', dsl: '@startuml\nparticipant AdcDrv\n@enduml' },
    ];
    var sec = HP.nameSection(NA.audit(list));
    expect(sec.ok).toBe(false);
    expect(sec.variants.length).toBe(1);
  });
});

describe('変更サマリの節', function() {
  test('変わった図が無ければその旨を書く', function() {
    var board = CB.build(docs(true), function() { return null; }, {});
    // baseline が無い図は「新規」扱いになるので、同じ DSL を baseline に渡して確かめる。
    var same = CB.build(docs(true), function(n) {
      return { dsl: n === 'Adc_Seq' ? ADC_SEQ : ADC_ST, at: '2026-09-07T00:00:00Z' };
    }, {});
    expect(HP.changeSection(same).line).toBe('変わった図はありません');
    expect(board.total).toBe(2);
  });

  test('変わった図があれば枚数と増減行数が出る', function() {
    var changed = CB.build(docs(true), function(n) {
      return { dsl: n === 'Adc_Seq' ? '@startuml\n@enduml' : ADC_ST, at: '2026-09-07T00:00:00Z' };
    }, {});
    expect(HP.changeSection(changed).line).toContain('変わった図 1/2 枚');
  });
});

describe('スナップショット', function() {
  test('4 つが 1 つのモデルに揃う', function() {
    var s = snapshotOf(true);
    expect(s.total).toBe(2);
    expect(s.renderedCount).toBe(2);
    expect(typeof s.family.line).toBe('string');
    expect(typeof s.names.line).toBe('string');
    expect(typeof s.change.line).toBe('string');
    expect(s.diagrams.length).toBe(2);
    expect(s.createdAt).toBe('2026-09-07 13:45');
  });

  test('全部問題なしなら、渡す 1 行が「問題なし」になる', function() {
    expect(snapshotOf(true).verdict).toContain('どちらも問題なし');
  });

  test('食い違いがあれば、渡す 1 行が「要確認」になる', function() {
    expect(snapshotOf(false).verdict).toContain('要確認');
  });

  test('SVG にできなかった図があっても、残りは入る', function() {
    var s = snapshotOf(true, { d1: '<svg id="a"></svg>' });
    expect(s.renderedCount).toBe(1);
    expect(s.diagrams[0].rendered).toBe(true);
    expect(s.diagrams[1].rendered).toBe(false);
  });
});

describe('index.html', function() {
  // 申し送りチェックリストが 4 番目に入り、図一式は 5 番目になった
  // (BLK-primary-20260908-1803-wish)。さらに「今回の変更と、その理由」が先頭に入り、
  // 材料の 5 節はそれぞれ 1 つ後ろへ動いた (BLK-primary-20260914-1906-wish)。
  test('6 つの節がこの順で並ぶ', function() {
    var html = HP.renderIndexHtml(snapshotOf(true));
    var i0 = html.indexOf('1. 今回の変更と、その理由');
    var i1 = html.indexOf('2. 系統チェック結果');
    var i2 = html.indexOf('3. 名前突合結果');
    var i3 = html.indexOf('4. 直近の変更サマリ');
    var i4 = html.indexOf('5. 申し送りチェックリスト');
    var i5 = html.indexOf('6. 図一式');
    expect(i0).toBeGreaterThan(-1);
    expect(i1).toBeGreaterThan(i0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(i4).toBeGreaterThan(i3);
    expect(i5).toBeGreaterThan(i4);
  });

  test('作成日時と引き継ぎ 1 行が上に出る', function() {
    var html = HP.renderIndexHtml(snapshotOf(true));
    expect(html).toContain('2026-09-07 13:45');
    expect(html).toContain('どちらも問題なし');
  });

  test('SVG は中に埋まっているので、この 1 枚だけで図が見られる', function() {
    var html = HP.renderIndexHtml(snapshotOf(true));
    expect(html).toContain('<svg id="a"></svg>');
    expect(html).toContain('<svg id="b"></svg>');
  });

  test('外部ファイルも外部スクリプトも参照しない (渡した先で開ける)', function() {
    var html = HP.renderIndexHtml(snapshotOf(true));
    expect(html).not.toContain('<script');
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
  });

  test('図の名前は HTML として解釈されない', function() {
    var s = HP.buildSnapshot({
      docs: [{ id: 'x', name: '<img src=x>', dsl: '@startuml\n@enduml' }],
      families: [], names: null, board: null, svgs: {},
    });
    expect(HP.renderIndexHtml(s)).not.toContain('<img src=x>');
    expect(HP.renderIndexHtml(s)).toContain('&lt;img src=x&gt;');
  });

  test('食い違った動作名の行に印が付く', function() {
    var html = HP.renderIndexHtml(snapshotOf(false));
    expect(html).toContain('warn-row');
    expect(html).toContain('Dma_Abort');
  });
});

describe('zip に入れるファイル', function() {
  test('index.html と SVG 一式が入る', function() {
    var files = HP.files(snapshotOf(true));
    expect(files[0].name).toBe('index.html');
    expect(files.map(function(f) { return f.name; }))
      .toEqual(['index.html', 'svg/Adc_Seq.svg', 'svg/Adc_State.svg']);
  });

  test('SVG にできなかった図は入れない (空ファイルを渡さない)', function() {
    var files = HP.files(snapshotOf(true, { d1: '<svg id="a"></svg>' }));
    expect(files.map(function(f) { return f.name; })).toEqual(['index.html', 'svg/Adc_Seq.svg']);
  });

  test('そのまま bulk-export.buildZip に渡せる', function() {
    var zip = BE.buildZip(HP.files(snapshotOf(true)));
    expect(zip.length).toBeGreaterThan(0);
    // local file header のシグネチャ PK\x03\x04 で始まる。
    expect([zip[0], zip[1], zip[2], zip[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

global.window = prevWindow;
global.document = prevDocument;
