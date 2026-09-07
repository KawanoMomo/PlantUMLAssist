'use strict';
// BLK-primary-20260907-1703-wish 「納品パッケージ一括生成」。
//
// 願望: 14 枚を zip にしたあと、表紙 (図一覧・版数・提出前チェック結果) と
// 変更履歴 (前回提出からの差分一覧) を別ファイルで人手作りしていた。
// これを 1 つの提出物 (表紙+目次+差分要約+全図 SVG) として一括生成したい。
//
// ここでは組み立て側の純関数を検証する (zip 化は bulk-export の職掌)。
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
var CB = global.window.MA.changeBoard;
var SC = global.window.MA.submitCheck;
var BE = global.window.MA.bulkExport;

var SEQ_A = ['@startuml', 'title ADC 初期化', 'participant App', 'participant Adc',
  'App -> Adc : Init', '@enduml'].join('\n');
var SEQ_A2 = ['@startuml', 'title ADC 初期化', 'participant App', 'participant Adc',
  'App -> Adc : Init', 'App -> Adc : Start', '@enduml'].join('\n');
var SEQ_B = ['@startuml', 'title 仮 SPI 送信', 'participant App', 'participant SpiDrv',
  'App -> SpiDrv : Send', '@enduml'].join('\n');

function docs2() {
  return [
    { id: 'd1', name: 'adc-seq', diagramType: 'plantuml-sequence', dsl: SEQ_A },
    { id: 'd2', name: 'spi-seq', diagramType: 'plantuml-sequence', dsl: SEQ_B },
  ];
}

describe('delivery-package — 納品パッケージ (BLK-primary-20260907-1703-wish)', function() {
  beforeEach(function() { DP.reset(); });

  test('まだ 1 度も出していなければ「初回提出」で、版数の既定は 1.0', function() {
    var last = DP.lastDelivery();
    expect(last.at).toBe('');
    expect(DP.nextRevision(last.revision)).toBe('1.0');
    var board = CB.build(docs2(), DP.baselineOf, { includeSame: true });
    var sec = DP.changeSection(board, last);
    expect(sec.first).toBe(true);
    expect(sec.line.indexOf('初回提出')).toBe(0);
  });

  test('版数は前回の末尾の数を 1 つ進める', function() {
    expect(DP.nextRevision('1.0')).toBe('1.1');
    expect(DP.nextRevision('1.9')).toBe('1.10');
    expect(DP.nextRevision('rev2')).toBe('rev3');
    // 数で終わらない書き方は数えようがないのでそのまま返す
    expect(DP.nextRevision('A 版')).toBe('A 版');
  });

  test('提出すると控えが残り、次は「前回提出から」の差分になる', function() {
    DP.markDelivered(docs2(), { title: '設計書', revision: '1.0' }, '2026-09-07T17:00:00.000Z');
    var last = DP.lastDelivery();
    expect(last.revision).toBe('1.0');
    expect(last.count).toBe(2);

    // 1 枚だけ 1 行増やし、1 枚を新しく足す
    var next = docs2();
    next[0].dsl = SEQ_A2;
    next.push({ id: 'd3', name: 'adc-state', diagramType: 'plantuml-state', dsl: '@startuml\n[*] --> Idle\n@enduml' });
    var sec = DP.changeSection(CB.build(next, DP.baselineOf, { includeSame: true }), last);
    expect(sec.first).toBe(false);
    expect(sec.changed).toBe(1);
    expect(sec.added).toBe(1);      // 新規の枚数
    expect(sec.entries.length).toBe(3);
    var same = sec.entries.filter(function(e) { return e.status === 'same'; });
    expect(same.length).toBe(1);    // 変わっていない図も提出物の一覧には並ぶ
  });

  test('保存し直しただけ (行末空白・改行コードの違い) は変更に数えない', function() {
    DP.markDelivered(docs2(), { title: '設計書', revision: '1.0' });
    var next = docs2();
    next[0].dsl = SEQ_A.replace(/\n/g, '\r\n') + '\n\n';
    var sec = DP.changeSection(CB.build(next, DP.baselineOf, { includeSame: true }), DP.lastDelivery());
    expect(sec.changed).toBe(0);
  });

  test('提出前チェックの結果が表紙の 1 行になる (要確認の件数)', function() {
    var res = SC.check(docs2(), SC.parseDict(SC.DEFAULT_TERMS.join('\n')));
    var sec = DP.submitSection(res);
    expect(sec.ran).toBe(true);
    expect(sec.ok).toBe(false);          // 「仮」「Drv」が残っている
    expect(sec.count).toBeGreaterThan(0);
    expect(sec.line).toContain('要確認 ' + sec.count + ' 件');
    // チェックを回していないときは「実行していません」と書く (0 件と区別する)
    expect(DP.submitSection(null).ran).toBe(false);
  });

  test('buildPackage は表紙・目次・差分・図をひとつのモデルにする', function() {
    var d = docs2();
    var pkg = DP.buildPackage({
      docs: d,
      svgs: { d1: '<svg id="a"></svg>' },
      title: 'GpioDrv 設計書',
      revision: '1.2',
      submit: SC.check(d, ['NOTHING-MATCHES']),
      board: CB.build(d, DP.baselineOf, { includeSame: true }),
      last: DP.lastDelivery(),
      now: new Date(2026, 8, 7, 17, 5),
    });
    expect(pkg.title).toBe('GpioDrv 設計書');
    expect(pkg.revision).toBe('1.2');
    expect(pkg.date).toBe('2026-09-07');
    expect(pkg.total).toBe(2);
    expect(pkg.renderedCount).toBe(1);   // SVG 化できなかった 1 枚は数から外す
    expect(pkg.diagrams[0].filename).toBe('svg/adc-seq.svg');
    expect(pkg.diagrams[1].rendered).toBe(false);
    expect(pkg.verdict).toContain('要確認 0 件');
    expect(pkg.verdict).toContain('初回提出');
  });

  test('タイトルと版数が空なら既定を入れる (無題の提出物を作らない)', function() {
    var pkg = DP.buildPackage({ docs: docs2(), svgs: {}, title: '', revision: '' });
    expect(pkg.title).toBe('設計書 図面集');
    expect(pkg.revision).toBe('1.0');
  });

  test('同じ名前の図が 2 枚あっても SVG のファイル名がぶつからない', function() {
    var names = DP.svgFileNames([{ id: 'a', name: 'seq' }, { id: 'b', name: 'seq' }]);
    expect(names[0].filename).toBe('svg/seq.svg');
    expect(names[1].filename).toBe('svg/seq-2.svg');
  });

  test('index.html は表紙 (題・版数・日付・チェック結果) と目次と差分表を含む', function() {
    var d = docs2();
    DP.markDelivered([d[0]], { title: '設計書', revision: '1.0' }, '2026-09-06T09:00:00.000Z');
    var pkg = DP.buildPackage({
      docs: d, svgs: { d1: '<svg id="a"></svg>', d2: '<svg id="b"></svg>' },
      title: 'GpioDrv 設計書', revision: '1.1',
      submit: SC.check(d, SC.DEFAULT_TERMS),
      board: CB.build(d, DP.baselineOf, { includeSame: true }),
      last: DP.lastDelivery(),
      now: new Date(2026, 8, 7, 17, 5),
    });
    var html = DP.renderIndexHtml(pkg);
    expect(html).toContain('GpioDrv 設計書');
    expect(html).toContain('1.1');
    expect(html).toContain('2026-09-07');
    expect(html).toContain('目次');
    expect(html).toContain('提出前チェック');
    expect(html).toContain('前回提出からの差分');
    // 目次のリンク先が図の見出しにある
    expect(html).toContain('href="#fig-1"');
    expect(html).toContain('id="fig-1"');
    // 図は index.html に埋まっている (顧客は 1 枚開くだけで見られる)
    expect(html).toContain('<svg id="a">');
    // 新しく足した図は「新規」と書かれる
    expect(html).toContain('新規');
  });

  test('題に < > が入っても表紙が壊れない', function() {
    var html = DP.renderIndexHtml(DP.buildPackage({ docs: [], svgs: {}, title: '<b>設計書</b>' }));
    expect(html).toContain('&lt;b&gt;設計書');
    expect(html).not.toContain('<b>設計書</b>');
  });

  test('files() は index.html と svg/ 一式を返し、zip にできる', function() {
    var pkg = DP.buildPackage({
      docs: docs2(), svgs: { d1: '<svg id="a"></svg>', d2: '<svg id="b"></svg>' },
      title: '設計書', revision: '1.0',
    });
    var files = DP.files(pkg);
    expect(files.length).toBe(3);
    expect(files[0].name).toBe('index.html');
    expect(files.slice(1).map(function(f) { return f.name; }))
      .toEqual(['svg/adc-seq.svg', 'svg/spi-seq.svg']);
    var zip = BE.buildZip(files);
    expect(zip.length).toBeGreaterThan(0);
  });

  test('書き出せなかった図は zip に入れず、index.html にその旨を書く', function() {
    var pkg = DP.buildPackage({ docs: docs2(), svgs: { d1: '<svg id="a"></svg>' } });
    var files = DP.files(pkg);
    expect(files.length).toBe(2);
    expect(DP.renderIndexHtml(pkg)).toContain('この図は書き出せませんでした');
  });

  test('納品 zip の名前は日時入りで、引き継ぎ用と見分けが付く', function() {
    expect(DP.packageName(new Date(2026, 8, 7, 17, 5))).toBe('delivery-20260907-1705.zip');
  });
});

global.window = prevWindow;
global.document = prevDocument;
