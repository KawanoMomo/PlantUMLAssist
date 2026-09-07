'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/family-audit.js')]; } catch (e) {}
require('../src/core/family-audit.js');
try { delete require.cache[require.resolve('../src/core/consistency.js')]; } catch (e) {}
require('../src/core/consistency.js');
var ck = global.window.MA.consistency;

var SEQ = [
  '@startuml',
  'participant Can_Driver',
  'participant CanDrv',
  'participant Unused_Driver',
  'Can_Driver -> CanDrv : Send',
  '@enduml',
].join('\n');

var CLS = [
  '@startuml',
  'class Adc_Driver {',
  '  + read(ch) : int',
  '  + start() : void',
  '}',
  '@enduml',
].join('\n');

var ADC_SEQ = [
  '@startuml',
  'participant Drv',
  'participant Adc_Driver',
  'Drv -> Adc_Driver : read',
  'Drv -> Adc_Driver : stop',
  '@enduml',
].join('\n');

describe('consistency — レビューの突合を 1 本の警告一覧にする', () => {
  test('suffixOf: 役割語の接尾辞を取る (長い綴りを優先)', () => {
    expect(ck.suffixOf('Can_Driver')).toBe('driver');
    expect(ck.suffixOf('CanDrv')).toBe('drv');
    expect(ck.suffixOf('IrqCtrl')).toBe('ctrl');
    expect(ck.suffixOf('Adc')).toBe('');
    expect(ck.suffixOf('Driver')).toBe('');       // 名前が接尾辞そのものなら役割語ではない
    expect(ck.suffixOf(null)).toBe('');
  });

  test('scanDoc: participant / class / メッセージ / メンバーを取り分ける', () => {
    var s = ck.scanDoc({ name: 'Seq', dsl: SEQ });
    expect(s.participants).toEqual(['Can_Driver', 'CanDrv', 'Unused_Driver']);
    expect(s.messages.length).toBe(1);
    // BLK-reviewer-20260907-1703: 呼び出しと応答を見分けるため、矢印そのものと
    // 向きを揃えた src / dst も持つようになった。
    expect(s.messages[0]).toEqual({
      from: 'Can_Driver', to: 'CanDrv', label: 'Send',
      arrow: '->', dashed: false, src: 'Can_Driver', dst: 'CanDrv',
    });
    var c = ck.scanDoc({ name: 'Cls', dsl: CLS });
    expect(Object.keys(c.classes)).toEqual(['Adc_Driver']);
    expect(c.classes.Adc_Driver).toEqual(['read', 'start']);
  });

  test('scanDoc: 本体を持たないクラスへの `X : + m()` 形式も拾う', () => {
    var c = ck.scanDoc({ name: 'Cls', dsl: '@startuml\nclass Foo\nFoo : + run() : void\n@enduml' });
    expect(c.classes.Foo).toEqual(['run']);
  });

  test('namingViolations: 同義の接尾辞が混ざったら多数派を規約として少数派を挙げる', () => {
    var v = ck.namingViolations([
      { name: 'A', dsl: '@startuml\nparticipant Can_Driver\nparticipant Spi_Driver\nparticipant GpioDrv\n@enduml' },
    ]);
    expect(v.length).toBe(1);
    expect(v[0].name).toBe('GpioDrv');
    expect(v[0].suffix).toBe('drv');
    expect(v[0].expected).toBe('driver');
    expect(v[0].docs).toEqual(['A']);
  });

  test('namingViolations: 綴りが 1 通りに揃っていれば 0 件', () => {
    expect(ck.namingViolations([
      { name: 'A', dsl: '@startuml\nparticipant CanDrv\nparticipant SpiDrv\n@enduml' },
    ])).toEqual([]);
    expect(ck.namingViolations([])).toEqual([]);
  });

  test('namingViolations: 図をまたいだ混在も見る', () => {
    var v = ck.namingViolations([
      { name: 'A', dsl: '@startuml\nparticipant Can_Driver\nparticipant Spi_Driver\n@enduml' },
      { name: 'B', dsl: '@startuml\nclass GpioDrv\n@enduml' },
    ]);
    expect(v.map(function(x) { return x.name; })).toEqual(['GpioDrv']);
    expect(v[0].docs).toEqual(['B']);
  });

  test('unusedParticipants: どの矢印にも出てこない participant を挙げる', () => {
    var u = ck.unusedParticipants([{ name: 'Seq', dsl: SEQ }]);
    expect(u).toEqual([{ name: 'Unused_Driver', doc: 'Seq' }]);
  });

  test('methodGaps: class に無いメソッドを呼んでいる sequence を挙げる', () => {
    var g = ck.methodGaps([
      { name: 'Cls', dsl: CLS },
      { name: 'Seq', dsl: ADC_SEQ },
    ]);
    expect(g).toEqual([{ doc: 'Seq', target: 'Adc_Driver', method: 'stop' }]);
  });

  test('methodGaps: クラスが 1 枚も無い相手は対象にしない', () => {
    expect(ck.methodGaps([{ name: 'Seq', dsl: ADC_SEQ }])).toEqual([]);
  });

  test('granularityGaps: family-audit の食い違いを同じ一覧に載せる', () => {
    var g = ck.granularityGaps([
      { name: 'Dma_Seq', dsl: '@startuml\nA -> B : ConfigureChannel\nA -> B : ArmChannel\n@enduml' },
      { name: 'Dma_State', dsl: '@startuml\nX --> Y : arm channel\n@enduml' },
    ]);
    expect(g.length).toBe(1);
    expect(g[0].label).toBe('ConfigureChannel');
    expect(g[0].onlyIn).toBe('Dma_Seq');
    expect(g[0].family).toBe('dma');
  });

  test('check: 4 種を合算し、件数を出す', () => {
    var r = ck.check([
      { name: 'Cls', dsl: CLS },
      { name: 'Seq', dsl: ADC_SEQ },
      { name: 'Other', dsl: SEQ },
    ]);
    expect(r.unused.length).toBe(1);
    expect(r.methods.length).toBe(1);
    expect(r.naming.length).toBe(1);          // CanDrv が Can_Driver / Adc_Driver の多数派から外れる
    expect(r.count).toBe(r.naming.length + r.unused.length + r.methods.length + r.granularity.length);
  });

  test('badgeLabel: 0 件は「整合 OK」と言い切る', () => {
    expect(ck.badgeLabel({ count: 0 })).toBe('整合 OK');
    expect(ck.badgeLabel({ count: 3 })).toBe('⚠ 3');
    expect(ck.badgeLabel(null)).toBe('整合 —');
  });

  test('check: 何も無い入力でも 0 件で返り、例外を投げない', () => {
    var r = ck.check([]);
    expect(r.count).toBe(0);
    expect(ck.check(null).count).toBe(0);
  });
});
