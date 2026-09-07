'use strict';
// BLK-primary-20260907-1903-wish: 影響範囲プレビュー。
// 一括置換のヒット数だけでは「この名前を変えると、どの図のどの種類の矢印
// (継承/呼び出し/遷移) が影響するか」が分からない。置換前に図種 × 関係の
// 内訳が出ることをここで固定する。内訳の合計は bulkRename のヒット数と一致する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
try { delete require.cache[require.resolve('../src/core/impact-scan.js')]; } catch (e) {}
require('../src/core/impact-scan.js');
var is = global.window.MA.impactScan;
var br = global.window.MA.bulkRename;

var CLS = [
  '@startuml',
  'class Spi_Driver',
  'class Spi_DriverBase',
  'class Logger',
  'Spi_DriverBase <|-- Spi_Driver',
  'Spi_Driver --> Logger',
  '@enduml',
].join('\n');

var SEQ = [
  '@startuml',
  'participant Spi_Driver',
  'participant SpiHw',
  'Spi_Driver -> SpiHw : transfer',
  '@enduml',
].join('\n');

var STATE = [
  '@startuml',
  '[*] --> Idle',
  'state Spi_Driver',
  'Idle --> Spi_Driver : Start',
  'Spi_Driver --> Idle : Done',
  '@enduml',
].join('\n');

var COMP = [
  '@startuml',
  'component Spi_Driver',
  'component Reg_Access',
  'Spi_Driver ..> Reg_Access',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'driver_common_class.puml', dsl: CLS },
  { id: 'd2', name: 'spi_init_sequence.puml', dsl: SEQ },
  { id: 'd3', name: 'spi_state.puml', dsl: STATE },
  { id: 'd4', name: 'spi_component.puml', dsl: COMP },
  { id: 'd5', name: 'other.puml', dsl: '@startuml\nclass Logger\n@enduml' },
];

// 図種を取り違えると同じ `-->` が継承にも遷移にも読めてしまう。
assert.strictEqual(is.detectKind(CLS), 'class');
assert.strictEqual(is.detectKind(SEQ), 'sequence');
assert.strictEqual(is.detectKind(STATE), 'state');
assert.strictEqual(is.detectKind(COMP), 'component');

// class 図: 宣言 1 + 継承 1 + 関連 1。Spi_DriverBase は識別子違いなので拾わない。
var c = is.scanDoc(CLS, 'Spi_Driver');
assert.strictEqual(c.total, 3);
assert.strictEqual(is.summarize(c), 'class 宣言 1 個・継承 1 本・関連 1 本');

// sequence 図: participant 1 + 呼び出し 1。
var s = is.scanDoc(SEQ, 'Spi_Driver');
assert.strictEqual(s.total, 2);
assert.strictEqual(is.summarize(s), 'participant 1 個・呼び出し 1 本');

// state 図: state 宣言 1 + 遷移 2。同じ `-->` が class 図とは違う役割になる。
var st = is.scanDoc(STATE, 'Spi_Driver');
assert.strictEqual(st.total, 3);
assert.strictEqual(is.summarize(st), 'state 宣言 1 個・遷移 2 本');

// component 図: 宣言 1 + 依存 1 (`..>` は矢印記号で決まるので図種によらない)。
var cp = is.scanDoc(COMP, 'Spi_Driver');
assert.strictEqual(is.summarize(cp), 'component 宣言 1 個・依存 1 本');

// 出現の無い図は行に出さない。
var rows = is.scan(DOCS, 'Spi_Driver');
assert.strictEqual(rows.length, 4);
assert.ok(rows.every(function(r) { return r.name !== 'other.puml'; }));
assert.strictEqual(rows[0].kindLabel, 'クラス図');

// 内訳の合計は一括置換のヒット数と必ず一致する (ずれると影響範囲が嘘になる)。
DOCS.forEach(function(d) {
  assert.strictEqual(is.scanDoc(d.dsl, 'Spi_Driver').total, br.countIn(d.dsl, 'Spi_Driver'));
});

// 見出し: 何図に出るか + 全体の内訳。
var ov = is.overview(DOCS, 'Spi_Driver');
assert.strictEqual(ov.docs, 4);
assert.strictEqual(ov.total, br.totalCount(DOCS, 'Spi_Driver'));
assert.strictEqual(ov.summary,
  'class 宣言 1 個・participant 1 個・state 宣言 1 個・component 宣言 1 個・継承 1 本・依存 1 本・関連 1 本・遷移 2 本・呼び出し 1 本');

// 名前が空・未出現なら空の結果。
assert.deepStrictEqual(is.scan(DOCS, ''), []);
assert.strictEqual(is.overview(DOCS, 'NoSuchName').docs, 0);

console.log('blk-primary-1903-impact-scan: ok');
