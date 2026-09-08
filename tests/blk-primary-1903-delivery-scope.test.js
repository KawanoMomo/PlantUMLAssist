'use strict';
// BLK-primary-20260908-1903 「納品パッケージの対象がタブを開いた図だけになる」。
//
// 保存フォルダに 14 枚あるのに、タブを 5 枚しか開いていなかったので
// 「対象の図」に 5 枚しか入らず、残り 9 枚が黙って zip から落ちた。
// モーダルも「5 / 5 枚」としか出さないので、枚数を数えない限り気づけない。
//
// 対象の的は保存フォルダ全体。ここは候補の作り方と欠落の数え方を検証する
// (フォルダの読み込みは app.js の職掌)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/dsl-utils.js',
  '../src/core/save-diff.js',
  '../src/core/change-board.js',
  '../src/core/submit-check.js',
  '../src/core/bulk-export.js',
  '../src/core/delivery-package.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var DP = global.window.MA.deliveryPackage;

var SEQ = ['@startuml', 'participant App', 'App -> Adc : Init', '@enduml'].join('\n');
var ST = ['@startuml', '[*] --> Idle', 'state Idle', '@enduml'].join('\n');

function detectType(dsl) {
  if (/\[\*\] -->/.test(dsl)) return 'plantuml-state';
  return 'plantuml-sequence';
}

// タブ 2 枚 / フォルダ 4 枚 (うち 1 枚は開いている図と同名)。
function openDocs() {
  return [
    { id: 'd1', name: 'spi_init_sequence', diagramType: 'plantuml-sequence', dsl: SEQ + '\nApp -> Spi : Send' },
    { id: 'd2', name: 'spi_state', diagramType: 'plantuml-state', dsl: ST },
  ];
}
function fileDocs() {
  return [
    { name: 'spi_init_sequence', dsl: SEQ },   // 開いている方が勝つ
    { name: 'dma_state', dsl: ST },
    { name: 'dma_transfer_sequence', dsl: SEQ },
    { name: '_template_sequence', dsl: SEQ },
  ];
}

describe('納品パッケージの対象は保存フォルダ全体 (BLK-primary-20260908-1903)', function() {

  test('開いていない図もフォルダから候補に入る (タブ 2 枚 + フォルダ 3 枚 = 4 枚)', function() {
    var c = DP.candidates(openDocs(), fileDocs(), {}, detectType);
    expect(c.map(function(x) { return x.name; })).toEqual([
      'spi_init_sequence', 'spi_state', 'dma_state', 'dma_transfer_sequence', '_template_sequence',
    ]);
    expect(c.length).toBe(5);
    expect(c[2].open).toBe(false);
    expect(c[0].open).toBe(true);
  });

  test('同名はタブが勝つ (未保存の編集分を落とさない)', function() {
    var c = DP.candidates(openDocs(), fileDocs(), {}, detectType);
    var d = c.filter(function(x) { return x.name === 'spi_init_sequence'; })[0];
    expect(d.dsl).toContain('App -> Spi : Send');
    expect(d.id).toBe('d1');
  });

  test('フォルダから来た図には id と図種が付く (SVG の対応付けに要る)', function() {
    var c = DP.candidates([], fileDocs(), {}, detectType);
    var s = c.filter(function(x) { return x.name === 'dma_state'; })[0];
    expect(s.id).toBe('file:dma_state');
    expect(s.diagramType).toBe('plantuml-state');
  });

  test('既定の対象はテンプレ以外の全部 — フォルダ全体が的になる', function() {
    var c = DP.candidates(openDocs(), fileDocs(), { _template_sequence: { role: 'template' } }, detectType);
    var picks = DP.defaultPicks(c);
    expect(picks).toEqual(['spi_init_sequence', 'spi_state', 'dma_state', 'dma_transfer_sequence']);
    expect(picks.indexOf('_template_sequence')).toBe(-1);
  });

  test('既定のままなら欠落 0 で警告は出ない', function() {
    var c = DP.candidates(openDocs(), fileDocs(), { _template_sequence: { role: 'template' } }, detectType);
    var cov = DP.coverage(c, DP.defaultPicks(c));
    expect(cov.warn).toBe(false);
    expect(cov.picked).toBe(4);
    expect(cov.total).toBe(5);
    expect(cov.template).toBe(1);
    expect(cov.line).toContain('4 / 5 枚');
    expect(cov.line).toContain('テンプレ 1 枚は対象外');
  });

  test('タブの分しか選んでいなければ「何枚が落ちるか」と内訳を出す', function() {
    var c = DP.candidates(openDocs(), fileDocs(), {}, detectType);
    var cov = DP.coverage(c, ['spi_init_sequence', 'spi_state']);
    expect(cov.warn).toBe(true);
    expect(cov.picked).toBe(2);
    expect(cov.total).toBe(5);
    expect(cov.missing).toBe(3);
    expect(cov.missingUnopened).toBe(3);
    expect(cov.line).toContain('2 / 5 枚');
    expect(cov.line).toContain('3 枚が対象から外れています');
    expect(cov.line).toContain('うち 3 枚はタブを開いていない図');
    expect(cov.line).toContain('dma_state');
  });

  test('落ちる図が 6 枚以上なら名前は 5 件までで「ほか」を付ける', function() {
    var many = [];
    for (var i = 1; i <= 8; i++) many.push({ name: 'd' + i, dsl: SEQ });
    var c = DP.candidates([], many, {}, detectType);
    var cov = DP.coverage(c, ['d1']);
    expect(cov.missing).toBe(7);
    expect(cov.line).toContain('ほか');
    expect(cov.line).toContain('d2, d3, d4, d5, d6');
    expect(cov.line.indexOf('d7')).toBe(-1);
  });

  test('フォルダが読めない (localStorage 運用) なら開いているタブがそのまま候補', function() {
    var c = DP.candidates(openDocs(), [], {}, detectType);
    expect(c.length).toBe(2);
    var cov = DP.coverage(c, DP.defaultPicks(c));
    expect(cov.warn).toBe(false);
    expect(cov.line).toBe('2 / 2 枚');
  });

  test('候補は納品 zip の SVG 名付けにそのまま渡せる', function() {
    var c = DP.candidates(openDocs(), fileDocs(), {}, detectType);
    var names = DP.svgFileNames(c);
    expect(names.length).toBe(5);
    expect(names[2]).toEqual({ id: 'file:dma_state', name: 'dma_state', filename: 'svg/dma_state.svg' });
  });
});

global.window = prevWindow;
global.document = prevDocument;
