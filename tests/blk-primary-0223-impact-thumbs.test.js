'use strict';
// BLK-primary-20260917-0223: 手順4 の会議で見せたいのは、テキスト差分ではなく
// 「置換前の図」と「置換後 (仮適用) の図」。影響ボードの各図に変更前後の図を並べる。
// ここは「何をどの順で描くか」の決め方を固定する (描画そのものは app.js)。
const assert = require('assert');
const IT = require('../src/core/impact-thumbs');

const ENTRIES = [
  { id: 'd1', name: 'spi_init_sequence.puml', count: 3,
    before: '@startuml\nparticipant SpiDrv\nSpiDrv -> Hal : init()\n@enduml',
    after: '@startuml\nparticipant Spi_Driver\nSpi_Driver -> Hal : init()\n@enduml' },
  { id: 'd2', name: 'driver_common_class.puml', count: 1,
    before: '@startuml\nclass SpiDrv\n@enduml',
    after: '@startuml\nclass Spi_Driver\n@enduml' },
];

describe('描く順', function() {
  test('図ごとに 今 → 置換後 の順で並ぶ (図をまたいで先に全部の今を描かない)', function() {
    const plan = IT.renderPlan(ENTRIES);
    assert.deepStrictEqual(plan.map((p) => p.name + ':' + p.side), [
      'spi_init_sequence.puml:before', 'spi_init_sequence.puml:after',
      'driver_common_class.puml:before', 'driver_common_class.puml:after',
    ]);
    assert.deepStrictEqual(plan.map((p) => p.label), ['今', '置換後', '今', '置換後']);
    assert.strictEqual(plan[0].dsl, ENTRIES[0].before);
    assert.strictEqual(plan[1].dsl, ENTRIES[0].after);
    assert.strictEqual(plan[0].id, 'd1');
  });

  test('本文の無い側は描く対象にしない', function() {
    const plan = IT.renderPlan([{ id: 'x', name: 'x.puml', before: '', after: '@startuml\n@enduml' }]);
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].side, 'after');
  });

  test('entries が無い / 壊れていても落ちない', function() {
    assert.deepStrictEqual(IT.renderPlan(null), []);
    assert.deepStrictEqual(IT.renderPlan([null, undefined]), []);
  });
});

describe('同じ本文は 1 度だけ描く', function() {
  test('置換で 1 文字も変わらない図は 1 枚で足りる', function() {
    const same = '@startuml\nclass Adc\n@enduml';
    const plan = IT.uniquePlan([{ id: 'd3', name: 'adc.puml', before: same, after: same }]);
    assert.strictEqual(plan.length, 1);
  });

  test('本文が違えば別々に描く', function() {
    assert.strictEqual(IT.uniquePlan(ENTRIES).length, 4);
  });

  test('別の図でも本文が同じなら 1 枚にまとまる', function() {
    const a = '@startuml\nclass A\n@enduml';
    const b = '@startuml\nclass B\n@enduml';
    const plan = IT.uniquePlan([
      { id: '1', name: 'x.puml', before: a, after: b },
      { id: '2', name: 'y.puml', before: a, after: b },
    ]);
    assert.strictEqual(plan.length, 2);
  });

  test('key は本文で決まり、名前や側では変わらない', function() {
    assert.strictEqual(IT.key('@startuml\nA\n@enduml'), IT.key('@startuml\nA\n@enduml'));
    assert.notStrictEqual(IT.key('@startuml\nA\n@enduml'), IT.key('@startuml\nB\n@enduml'));
    assert.strictEqual(IT.key(null), IT.key(''));
  });
});

describe('見た目が変わらない図', function() {
  test('本文が同じ図を名指しできる (会議で「見た目は変わりません」と言い切れる)', function() {
    const same = '@startuml\nclass Adc\n@enduml';
    const names = IT.unchangedNames(ENTRIES.concat([
      { id: 'd3', name: 'adc.puml', before: same, after: same },
    ]));
    assert.deepStrictEqual(names, ['adc.puml']);
  });
});

describe('描いている間の 1 行', function() {
  test('残り枚数が出る', function() {
    assert.strictEqual(IT.statusText(0, 4), '図を描いています 0/4');
    assert.strictEqual(IT.statusText(2, 4), '図を描いています 2/4');
  });

  test('描き終わったら枚数だけを出す', function() {
    assert.strictEqual(IT.statusText(4, 4), '図 4 枚');
    assert.strictEqual(IT.statusText(9, 4), '図 4 枚');
  });

  test('描く図が無ければ何も出さない', function() {
    assert.strictEqual(IT.statusText(0, 0), '');
  });
});
