'use strict';
// BLK-primary-20260914-1906-wish 「引き継ぎサマリ画面」。
//
// 願望: 📦引き継ぎ zip は材料 (系統チェック・名前突合・変更サマリ・SVG 一式) しか持たず、
// 「今日どの図の何を直したか」「なぜ直したか (reviewer 指摘との対応)」は口頭で伝える
// 前提だった。zip を開いた先頭に「今回変更した図」だけを並べ、変更点と反映した指摘の
// 文言を図と並べて出せば、手順4 (引き継ぐ) の質問往復が要らなくなる。
//
// ここでは材料を道筋に組み替える純関数と、index.html の先頭節を検証する。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
  '../src/core/html-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/dsl-utils.js',
  '../src/core/name-audit.js',
  '../src/core/family-audit.js',
  '../src/core/change-board.js',
  '../src/core/review-pins.js',
  '../src/core/handoff-summary.js',
  '../src/core/handoff-package.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var HS = global.window.MA.handoffSummary;
var HP = global.window.MA.handoffPackage;
var CB = global.window.MA.changeBoard;
var RP = global.window.MA.reviewPins;

// 指摘を 1 件受けて直した図。指摘ピンは DSL の中に残っている。
var BEFORE = [
  '@startuml', 'participant Drv', 'participant Hw',
  'Drv -> Hw : Adc_Strt', '@enduml',
].join('\n');
var AFTER = [
  '@startuml', 'participant Drv', 'participant Hw',
  'Drv -> Hw : Adc_Start',
  "' @pin 1|done|reviewer|2026-09-14T09:00|Drv -> Hw : Adc_Start|Adc_Strt は綴りが違う。Adc_Start に揃えること|Drv -> Hw : Adc_Strt",
  "' @pin 2|open|reviewer|2026-09-14T09:05|participant Hw|Hw は略語。Adc_Hw に改めたい",
  '@enduml',
].join('\n');
var UNTOUCHED = ['@startuml', 'Idle --> Busy : Go', '@enduml'].join('\n');

var DOCS = [
  { id: 'd1', name: 'adc_seq', diagramType: 'sequence', dsl: AFTER },
  { id: 'd2', name: 'adc_state', diagramType: 'state', dsl: UNTOUCHED },
];

function boardOf() {
  return CB.build(DOCS, function(name) {
    return name === 'adc_seq' ? { dsl: BEFORE, at: '2026-09-14T08:00' }
                              : { dsl: UNTOUCHED, at: '2026-09-14T08:00' };
  });
}

function snapshot() {
  return HP.buildSnapshot({
    docs: DOCS, families: [], names: null, board: boardOf(),
    svgs: { d1: '<svg id="a"></svg>', d2: '<svg id="b"></svg>' },
    verdicts: { adc_seq: [{ verdict: '要修正', text: 'Drv -> Hw : Adc_Start' }] },
    now: new Date(2026, 8, 14, 19, 6),
  });
}

describe('handoffSummary.build — 今回変更した図が先頭に来る', function() {

  test('変えた図だけが changed に入り、変えていない図は後ろに残る', function() {
    var s = HS.build({ diagrams: snapshot().diagrams, board: boardOf() });
    expect(s.changedCount).toBe(1);
    expect(s.changed[0].name).toBe('adc_seq');
    expect(s.rest.map(function(r) { return r.name; })).toEqual(['adc_state']);
  });

  test('変更点は ± 行数で言う (新しく作った図はそう書く)', function() {
    var s = HS.build({ diagrams: snapshot().diagrams, board: boardOf() });
    expect(s.changed[0].changeLine).toBe('+1 −1 行');
    expect(HS.changeLine({ status: 'new', added: 5 })).toBe('新しく作った図 (+5 行)');
  });

  test('なぜ直したかは、対応済みの指摘の文言と「修正前 → 修正後」で出る', function() {
    var s = HS.build({ diagrams: snapshot().diagrams, board: boardOf() });
    var reasons = s.changed[0].reasons;
    expect(reasons.length).toBe(1);
    expect(reasons[0]).toContain('Adc_Strt は綴りが違う');
    expect(reasons[0]).toContain('Drv -> Hw : Adc_Strt → Drv -> Hw : Adc_Start');
  });

  test('まだ直していない指摘は理由に混ぜず、宿題として別に数える', function() {
    var s = HS.build({ diagrams: snapshot().diagrams, board: boardOf() });
    expect(s.changed[0].openPins).toEqual(['Hw は略語。Adc_Hw に改めたい']);
    expect(s.openCount).toBe(1);
    expect(s.reasonCount).toBe(1);
  });

  test('変更サマリの「要修正」の印の数が図ごとに付く', function() {
    var s = HS.build({
      diagrams: snapshot().diagrams, board: boardOf(),
      verdicts: { adc_seq: [{ verdict: '要修正' }, { verdict: '済' }] },
    });
    expect(s.changed[0].fixCount).toBe(1);
  });

  test('1 行見出しが枚数・反映した指摘・宿題を言う', function() {
    var s = HS.build({ diagrams: snapshot().diagrams, board: boardOf() });
    var line = HS.summaryLine(s);
    expect(line).toContain('今回変更した図 1/2 枚');
    expect(line).toContain('反映した指摘 1 件');
    expect(line).toContain('未対応の指摘 1 件');
    expect(HS.summaryLine({ changedCount: 0, total: 3 })).toContain('今回変更した図はありません');
  });

  test('指摘ピンの行は変更点に数えない (指摘を付けただけで +1 行にしない)', function() {
    var s = HS.build({ diagrams: snapshot().diagrams, board: boardOf() });
    expect(s.changed[0].added).toBe(1);
    expect(s.changed[0].removed).toBe(1);
    var texts = s.changed[0].diffRows.map(function(r) { return r.kind === 'del' ? r.before : r.after; });
    texts.forEach(function(t) { expect(RP.isPinLine(t)).toBe(false); });
  });

  test('指摘ピンが 1 つも無くても落ちない (指摘によらない変更)', function() {
    var docs = [{ id: 'd1', name: 'x', diagramType: 'sequence', dsl: '@startuml\nA -> B : c\n@enduml' }];
    var board = CB.build(docs, function() { return { dsl: '@startuml\n@enduml', at: '' }; });
    var s = HS.build({ diagrams: docs.map(function(d) { return { id: d.id, name: d.name, dsl: d.dsl }; }), board: board });
    expect(s.changedCount).toBe(1);
    expect(s.changed[0].reasons).toEqual([]);
  });
});

describe('index.html の先頭節', function() {

  test('1 節目が「今回の変更と、その理由」で、材料より前に出る', function() {
    var html = HP.renderIndexHtml(snapshot());
    var head = html.indexOf('1. 今回の変更と、その理由');
    expect(head).toBeGreaterThan(-1);
    expect(html.indexOf('2. 系統チェック結果')).toBeGreaterThan(head);
    expect(html.indexOf('6. 図一式')).toBeGreaterThan(head);
  });

  test('変更点・理由・図が同じ塊に並ぶ (新人はここだけ読めばよい)', function() {
    var html = HP.renderIndexHtml(snapshot());
    var block = html.slice(html.indexOf('1. 今回の変更と、その理由'), html.indexOf('2. 系統チェック結果'));
    expect(block).toContain('adc_seq');
    expect(block).toContain('+1 −1 行');
    expect(block).toContain('Adc_Strt は綴りが違う');
    expect(block).toContain('まだ直していない指摘 1 件');
    expect(block).toContain('要修正」の印が 1 行');
    expect(block).toContain('<svg id="a">');
    // 変えていない図の SVG は先頭節には出さない (先頭は「今日の話」だけ)。
    expect(block).not.toContain('<svg id="b">');
  });

  test('変えていない図に残った指摘も、宿題として先頭節で名指しする', function() {
    var docs = [
      { id: 'd1', name: 'adc_seq', diagramType: 'sequence', dsl: AFTER },
      { id: 'd2', name: 'old_state', diagramType: 'state',
        dsl: "@startuml\nIdle --> Busy : Go\n' @pin 9|open|reviewer|2026-09-10T10:00|Idle --> Busy : Go|遷移の契機が書かれていない\n@enduml" },
    ];
    var board = CB.build(docs, function(name) {
      return name === 'adc_seq' ? { dsl: BEFORE, at: '' } : { dsl: docs[1].dsl, at: '' };
    });
    var snap = HP.buildSnapshot({ docs: docs, families: [], names: null, board: board, svgs: {} });
    var html = HP.renderIndexHtml(snap);
    var block = html.slice(html.indexOf('1. 今回の変更と、その理由'), html.indexOf('2. 系統チェック結果'));
    expect(block).toContain('今回は変えていないが、指摘が残っている図');
    expect(block).toContain('old_state: 遷移の契機が書かれていない');
  });

  test('変えた図が無ければ、そう言って材料へ送る', function() {
    var snap = HP.buildSnapshot({ docs: DOCS, families: [], names: null, board: null, svgs: {} });
    var html = HP.renderIndexHtml(snap);
    expect(html).toContain('今回変更した図はありません');
  });
});

// 他のテストファイルは共有の window を使う。借りた window は必ず返す。
global.window = prevWindow;
global.document = prevDocument;
