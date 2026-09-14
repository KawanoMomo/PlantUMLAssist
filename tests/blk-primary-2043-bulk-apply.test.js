'use strict';
// BLK-primary-20260906-2043 (4 回目の再発、格上げ friction→blocked):
// レビュー指摘は「この 3 クラスに同じメソッドが無い」の形で来るのに、GUI では
// クラスを 1 つ選ぶ→フォームを開く→打つ、を対象の数だけ繰り返すしかなかった。
// 名前を 1 度だけ打ち、当てる先をまとめて選んで 1 回で当てられるようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-apply.js')]; } catch (e) {}
require('../src/core/bulk-apply.js');
var BA = global.window.MA.bulkApply;

var COMMON = [
  '@startuml',
  'title driver_common_class',
  'class Adc_Driver {',
  '  + Adc_Init() : void',
  '}',
  'class Gpio_Driver {',
  '  + Gpio_Init() : void',
  '  + Gpio_Reset() : void',
  '}',
  'class Can_Driver',
  '@enduml',
].join('\n');

var OTHER = [
  '@startuml',
  'interface Spi_Port {',
  '}',
  '@enduml',
].join('\n');

var SEQ = ['@startuml', 'A -> B : x', '@enduml'].join('\n');

function docs() {
  return [
    { id: 'd1', name: 'driver_common_class', diagramType: 'plantuml-class', dsl: COMMON },
    { id: 'd2', name: 'spi_class', diagramType: 'plantuml-class', dsl: OTHER },
    { id: 'd3', name: 'seq', diagramType: 'plantuml-sequence', dsl: SEQ },
  ];
}

function eq(a, b, msg) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((msg || '') + ' expected ' + y + ' got ' + x);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

describe('bulk-apply — 同じ種類の変更を複数の対象へ 1 回で当てる (BLK-primary-2043)', function() {

test('当てられる変更はメソッド追加と属性追加', function() {
  eq(BA.kinds().map(function(k) { return k.kind; }), ['class-method', 'class-attribute']);
  eq(BA.diagramTypeFor('class-method'), 'plantuml-class');
  eq(BA.diagramTypeFor('nope'), null);
});

test('本体の有無・interface・abstract に関わらずクラス宣言を拾う', function() {
  eq(BA.classesIn(COMMON).map(function(c) { return c.name; }),
     ['Adc_Driver', 'Gpio_Driver', 'Can_Driver']);
  eq(BA.classesIn(OTHER).map(function(c) { return c.name; }), ['Spi_Port']);
  eq(BA.classesIn('abstract class Base {\n}').map(function(c) { return c.name; }), ['Base']);
  eq(BA.classesIn('class "表示名" as Real_Id {\n}').map(function(c) { return c.name; }), ['Real_Id']);
  // enum はメンバーを足す対象ではない
  eq(BA.classesIn('enum Mode {\n  A\n}').length, 0);
});

test('対象はクラス図だけから集まり、どの図のどのクラスかが区別できる', function() {
  var ts = BA.targets(docs(), 'class-method');
  eq(ts.map(function(t) { return t.key; }),
     ['d1#Adc_Driver', 'd1#Gpio_Driver', 'd1#Can_Driver', 'd2#Spi_Port']);
  eq(ts[0].docName, 'driver_common_class');
});

test('当てる 1 行はメソッド / 属性で書き分ける', function() {
  eq(BA.memberLine('class-method', { name: 'Reset', returnType: 'void' }), '+ Reset() : void');
  eq(BA.memberLine('class-method', { name: 'Reset' }), '+ Reset()');
  eq(BA.memberLine('class-method', { name: 'Set', params: 'uint8 v', returnType: 'void' }), '+ Set(uint8 v) : void');
  eq(BA.memberLine('class-attribute', { name: 'state', type: 'uint8' }), '+ state : uint8');
  eq(BA.memberLine('class-method', { name: '' }), '');
});

test('既にあるメンバーを見分ける (名前で見る)', function() {
  ok(BA.hasMember(COMMON, 'Gpio_Driver', 'class-method', 'Gpio_Reset'), '既存を見落とす');
  ok(!BA.hasMember(COMMON, 'Adc_Driver', 'class-method', 'Gpio_Reset'), '別クラスのを拾う');
  ok(!BA.hasMember(COMMON, 'Can_Driver', 'class-method', 'Reset'), '本体無しは持っていない');
  ok(!BA.hasMember(COMMON, 'Adc_Driver', 'class-method', 'Adc_In'), '前方一致で誤検出');
});

test('3 クラスへ 1 回で追加でき、本体の無いクラスには本体を開いて入れる', function() {
  var res = BA.apply(docs(), ['d1#Adc_Driver', 'd1#Gpio_Driver', 'd1#Can_Driver'],
                     'class-method', { name: 'Reset', returnType: 'void' });
  eq(res.added, 3, '追加件数');
  eq(res.skipped, 0);
  eq(res.changed.length, 1, '変わった図は 1 枚');
  var out = res.changed[0].dsl.split('\n');
  eq(out.filter(function(l) { return l.trim() === '+ Reset() : void'; }).length, 3);
  // 本体の無かった Can_Driver が `class Can_Driver {` / メンバー / `}` になる
  var i = out.indexOf('class Can_Driver {');
  ok(i > 0, 'Can_Driver の本体が開かれていない');
  eq(out[i + 1].trim(), '+ Reset() : void');
  eq(out[i + 2].trim(), '}');
  // 先に足したクラスの中身がずれていない
  ok(out.join('\n').indexOf('  + Adc_Init() : void') >= 0, '既存メンバーが壊れた');
});

test('既にあるクラスは飛ばし、無いクラスにだけ入る', function() {
  var res = BA.apply(docs(), ['d1#Gpio_Driver', 'd1#Adc_Driver'],
                     'class-method', { name: 'Gpio_Reset', returnType: 'void' });
  eq(res.added, 1, 'Adc_Driver にだけ入る');
  eq(res.skipped, 1, 'Gpio_Driver は飛ばす');
});

test('図をまたいで当てられる', function() {
  var res = BA.apply(docs(), ['d1#Adc_Driver', 'd2#Spi_Port'],
                     'class-attribute', { name: 'state', type: 'uint8' });
  eq(res.added, 2);
  eq(res.changed.length, 2, '2 枚が変わる');
});

test('選ばれていない対象は当たらない / 選択ゼロなら何も変わらない', function() {
  var res = BA.apply(docs(), ['d1#Adc_Driver'], 'class-method', { name: 'Reset' });
  ok(res.changed[0].dsl.indexOf('Gpio_Driver {\n  + Gpio_Init') >= 0 ||
     res.changed[0].dsl.indexOf('+ Reset()') >= 0, '当たっていない');
  eq(res.added, 1);
  eq(BA.apply(docs(), [], 'class-method', { name: 'Reset' }).changed.length, 0);
  eq(BA.apply(docs(), ['d1#Adc_Driver'], 'class-method', { name: '' }).changed.length, 0);
});

test('preview が「入る / 既にあり」を対象ごとに返す', function() {
  var rows = BA.preview(docs(), ['d1#Adc_Driver', 'd1#Gpio_Driver'],
                        'class-method', { name: 'Gpio_Reset' });
  eq(rows.map(function(r) { return [r.name, r.status]; }),
     [['Adc_Driver', 'add'], ['Gpio_Driver', 'skip']]);
  // 名前が空なら判定できないので none
  eq(BA.preview(docs(), ['d1#Adc_Driver'], 'class-method', { name: '' })[0].status, 'none');
});

test('当てても他の図・他のクラスの行数は変わらない', function() {
  var before = docs();
  var res = BA.apply(before, ['d1#Adc_Driver'], 'class-method', { name: 'Reset', returnType: 'void' });
  eq(res.changed[0].dsl.split('\n').length, COMMON.split('\n').length + 1, '1 行だけ増える');
  eq(before[0].dsl, COMMON, '入力の docs を書き換えている');
});

});
