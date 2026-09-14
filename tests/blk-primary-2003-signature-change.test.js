'use strict';
// BLK-primary-20260907-2003-wish: 影響範囲プレビューから「どの行が対象か」へ飛べること、
// 綴りの変わらない仕様変更 (戻り値型・引数) を全図へ 1 回で当てられることを固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/impact-scan.js')]; } catch (e) {}
require('../src/core/impact-scan.js');
try { delete require.cache[require.resolve('../src/core/signature-change.js')]; } catch (e) {}
require('../src/core/signature-change.js');
var is = global.window.MA.impactScan;
var sc = global.window.MA.signatureChange;

var CLS = [
  '@startuml',
  'class Spi_Driver {',
  '  + Spi_Reset() : void',
  '  + Spi_Init(uint8 ch) : void',
  '}',
  '@enduml',
].join('\n');

var CLS2 = [
  '@startuml',
  'class Uart_Driver {',
  '  {static} + Spi_Reset(uint8 ch) : void',
  '}',
  '@enduml',
].join('\n');

var SEQ = [
  '@startuml',
  'participant Spi_Driver',
  'Spi_Driver -> Hw : Spi_Reset()',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'driver_common_class.puml', dsl: CLS },
  { id: 'd2', name: 'uart_class.puml', dsl: CLS2 },
  { id: 'd3', name: 'spi_sequence.puml', dsl: SEQ },
];

// ── 影響範囲プレビューの行 ────────────────────────────────────────────────
// 内訳だけでは「この図のどの記述か」が分からない。行番号と本文が付いて初めて
// タブを開かずに対象へ飛べる。
var rows = is.scan(DOCS, 'Spi_Reset');
var byName = {};
rows.forEach(function(r) { byName[r.name] = r; });

assert.ok(byName['driver_common_class.puml'], 'クラス図が影響範囲に出る');
var cl = byName['driver_common_class.puml'].lines;
assert.strictEqual(cl.length, 1);
assert.strictEqual(cl[0].line, 3, '1 始まりの行番号 (editor-jump と同じ数え方)');
assert.strictEqual(cl[0].text.trim(), '+ Spi_Reset() : void');
assert.strictEqual(cl[0].count, 1);

// 行の合計は今までどおりヒット数と一致する (行を足したことで数がずれない)。
rows.forEach(function(r) {
  var sum = r.lines.reduce(function(a, x) { return a + x.count; }, 0);
  assert.strictEqual(sum, r.total, r.name + ' の行合計は total と一致');
});

// ── 宣言行の判定 ──────────────────────────────────────────────────────────
var p = sc.parseLine('  + Spi_Reset(uint8 ch) : void', 'Spi_Reset');
assert.strictEqual(p.params, 'uint8 ch');
assert.strictEqual(p.returnType, 'void');
assert.strictEqual(p.prefix, '+ ');

// 修飾子付きも宣言。行頭側はそのまま残す。
assert.strictEqual(sc.parseLine('  {static} + Spi_Reset(uint8 ch) : void', 'Spi_Reset').returnType, 'void');

// 戻り値が無い宣言は null (「型を書いていない」と「void」を混ぜない)。
assert.strictEqual(sc.parseLine('+ Spi_Reset()', 'Spi_Reset').returnType, null);

// メッセージ行は宣言ではない。ここを取り違えるとシーケンス図のラベルに
// 戻り値型を書き足してしまう。
assert.strictEqual(sc.parseLine('Spi_Driver -> Hw : Spi_Reset()', 'Spi_Reset'), null);

// 別名の関数は拾わない (前方一致で巻き込まない)。
assert.strictEqual(sc.parseLine('+ Spi_ResetAll() : void', 'Spi_Reset'), null);

// ── 書き換え ──────────────────────────────────────────────────────────────
// 戻り値だけ指定したら引数は今の値が残る (仕様変更で引数を消さない)。
assert.strictEqual(
  sc.rewriteLine('  + Spi_Reset(uint8 ch) : void', 'Spi_Reset', { returnType: 'StatusType' }),
  '  + Spi_Reset(uint8 ch) : StatusType');
// 引数だけ指定したら戻り値は残る。
assert.strictEqual(
  sc.rewriteLine('  + Spi_Reset(uint8 ch) : void', 'Spi_Reset', { params: '' }),
  '  + Spi_Reset() : void');
// 戻り値が無かった行に付けられる。
assert.strictEqual(
  sc.rewriteLine('+ Spi_Reset()', 'Spi_Reset', { returnType: 'StatusType' }),
  '+ Spi_Reset() : StatusType');

// ── 洗い出しと一括適用 ────────────────────────────────────────────────────
var hits = sc.findAll(DOCS, 'Spi_Reset');
assert.strictEqual(hits.length, 2, 'クラス図 2 枚の宣言だけが対象 (シーケンスは除く)');
assert.deepStrictEqual(sc.returnTypes(DOCS, 'Spi_Reset'), ['void']);

var plan = sc.plan(DOCS, 'Spi_Reset', { returnType: 'StatusType' });
assert.strictEqual(plan.length, 2);
assert.ok(plan.every(function(x) { return x.status === 'change'; }));
assert.strictEqual(plan[0].after.trim(), '+ Spi_Reset() : StatusType');

var res = sc.apply(DOCS, 'Spi_Reset', { returnType: 'StatusType' });
assert.strictEqual(res.updated, 2);
assert.strictEqual(res.changed.length, 2, '変わった図だけ返す');
assert.ok(/\+ Spi_Reset\(\) : StatusType/.test(res.changed[0].dsl));
assert.ok(/\{static\} \+ Spi_Reset\(uint8 ch\) : StatusType/.test(res.changed[1].dsl));
// 同じ図の別メソッドは触らない。
assert.ok(/\+ Spi_Init\(uint8 ch\) : void/.test(res.changed[0].dsl));
// シーケンス図は変わらない。
assert.ok(res.changed.every(function(c) { return c.id !== 'd3'; }));

// 既にその形なら 2 回目は何も変わらない (何度押しても同じ)。
var again = sc.apply(res.changed.map(function(c) { return { id: c.id, name: c.name, dsl: c.dsl }; }),
  'Spi_Reset', { returnType: 'StatusType' });
assert.strictEqual(again.updated, 0);
assert.strictEqual(again.changed.length, 0);

// 行を選んで当てる (keys は docId#行番号)。
var one = sc.apply(DOCS, 'Spi_Reset', { returnType: 'StatusType' }, ['d1#3']);
assert.strictEqual(one.updated, 1);
assert.strictEqual(one.changed[0].id, 'd1');

console.log('blk-primary-2003-signature-change: ok');
