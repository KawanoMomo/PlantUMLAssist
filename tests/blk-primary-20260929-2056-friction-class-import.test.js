'use strict';
// BLK-primary-20260929-2056-friction: 「⌗ クラス構成をまとめて追加」の窓が書く行
// (もう有るクラスへのメンバの追加・図の書き方に揃えた継承) を確かめる。
// 窓の「⧉ 他の図から取り込む」(シーケンス図・状態遷移図からの候補集め・兄弟と同じ親を入れる) は
// TICKET-owner-20261116-0321-prune で外した。窓の欄は打って埋める。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/line-edit.js', '../src/core/class-scaffold.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var CS = global.window.MA.classScaffold;

var CLASS = ['@startuml', 'class Driver_Common {', '  + Init() : void', '}', 'class Spi_Driver {', '  + Spi_Init() : void', '}',
  'class Can_Driver {', '  + Can_Init() : void', '}', 'class Irq_Controller {', '  + EnableIrq() : void', '}',
  'Spi_Driver --|> Driver_Common', 'Can_Driver --|> Driver_Common', 'Spi_Driver -- Irq_Controller', '@enduml'].join('\n');

describe('BLK-primary-20260929-2056-friction クラス構成の窓が書く行', function() {
  test('childFirstInheritance: 図の継承の向き / 他の図から取り込む道は無い', function() {
    expect(CS.childFirstInheritance(CLASS)).toBe(true);
    expect(CS.childFirstInheritance('@startuml\nA <|-- B\n@enduml')).toBe(false);
    expect(CS.siblingParent).toBe(undefined);
    expect(global.window.MA.reusePicker).toBe(undefined);
  });

  test('apply: 継承は図の向き (子 --|> 親) で書き、もう有るクラスには持ち込んだメンバのうち無いものだけを中へ足す', function() {
    var spec = {
      parent: 'Driver_Common', parentKind: 'class', parentMembers: '',
      classes: [
        { name: 'Pwm_Driver', members: '+ Pwm_Init() : void', relation: 'inheritance' },
        { name: 'Irq_Controller', members: '+ EnableIrq() : void, + Pwm_Isr() : void', relation: 'none' },
      ],
      relations: [{ from: 'Pwm_Driver', kind: 'association', to: 'Irq_Controller', label: '' }],
    };
    expect(CS.validate(spec, CLASS).ok).toBe(true);
    var out = CS.apply(CLASS, spec);
    expect(out).toContain('class Irq_Controller {\n  + EnableIrq() : void\n  + Pwm_Isr() : void\n}');
    expect(out).toContain('Pwm_Driver --|> Driver_Common');
    expect(out).not.toContain('Driver_Common <|-- Pwm_Driver');
    expect(out).toContain('Pwm_Driver -- Irq_Controller');
    expect(out.split('\n').filter(function(l) { return /^class Irq_Controller/.test(l); }).length).toBe(1);
    expect(CS.preview(CLASS, spec)).toContain("' Irq_Controller に足す");
    // 本体の無い宣言には本体を付けて足す
    var bare = CS.apply('@startuml\nclass Irq_Controller\n@enduml', { classes: [{ name: 'Irq_Controller', members: '+ Pwm_Isr()', relation: 'none' }] });
    expect(bare).toBe('@startuml\nclass Irq_Controller {\n  + Pwm_Isr()\n}\n@enduml');
  });
});
