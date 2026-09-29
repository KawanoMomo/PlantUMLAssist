'use strict';
// BLK-primary-20260929-2056-friction: 系統を 1 つ足すたびに、シーケンス図の参加者名・呼び出し名と状態遷移図のきっかけを
// クラス図に打ち直していた。「⌗ クラス構成をまとめて追加」の窓の「⧉ 他の図から取り込む」の候補集めと、
// 窓が書く行 (もう有るクラスへのメンバの追加・図の書き方に揃えた継承・兄弟と同じ親) を確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/line-edit.js', '../src/core/seq-to-activity.js', '../src/core/reuse-picker.js', '../src/core/class-scaffold.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var rp = global.window.MA.reusePicker;
var CS = global.window.MA.classScaffold;

var SEQ = ['@startuml', 'actor App', 'participant Pwm_Driver', 'participant PwmRegs', 'participant Irq_Controller',
  'App -> Pwm_Driver : Pwm_Init()', 'Pwm_Driver -> PwmRegs : WriteConfig()', 'Pwm_Driver -> Irq_Controller : EnableIrq()',
  'Irq_Controller --> Pwm_Driver : Ack', 'Pwm_Driver --> App : InitDone', '@enduml'].join('\r\n');
var ST = ['@startuml', '[*] --> Idle', 'Idle --> Pwm_Ready : Pwm_Init', 'Pwm_Ready --> Pwm_Running : Pwm_Start [ok] / log',
  'Pwm_Running --> Idle : Pwm_Stop', 'Pwm_Running --> Fault : Fault', '@enduml'].join('\n');
var CLASS = ['@startuml', 'class Driver_Common {', '  + Init() : void', '}', 'class Spi_Driver {', '  + Spi_Init() : void', '}',
  'class Can_Driver {', '  + Can_Init() : void', '}', 'class Irq_Controller {', '  + EnableIrq() : void', '}',
  'Spi_Driver --|> Driver_Common', 'Can_Driver --|> Driver_Common', 'Spi_Driver -- Irq_Controller', '@enduml'].join('\n');
var DOCS = [
  { id: 's', name: 'pwm_init_sequence', diagramType: 'plantuml-sequence', dsl: SEQ },
  { id: 't', name: 'pwm_state', diagramType: 'plantuml-state', dsl: ST },
  { id: 'c', name: 'driver_common_class', diagramType: 'plantuml-class', dsl: CLASS },
];

describe('BLK-primary-20260929-2056-friction クラス図へ他の図から取り込む', function() {
  test('classCandidates: 参加者 → クラス、受ける呼び出し → メソッド、きっかけ → 頭が同じクラスのメソッド、呼び出し → 関連', function() {
    var got = rp.classCandidates(DOCS, 'c', CLASS).map(function(it) { return it.kind + ' ' + it.text; });
    expect(got).toEqual([
      'class Pwm_Driver',
      'method Pwm_Driver : + Pwm_Init() : void',
      'method Pwm_Driver : + Pwm_Start() : void',
      'method Pwm_Driver : + Pwm_Stop() : void',
      'relation Pwm_Driver -- PwmRegs',
      'relation Pwm_Driver -- Irq_Controller',
      'class PwmRegs',
      'method PwmRegs : + WriteConfig() : void',
    ]);
  });

  test('classCandidates: 応答 (点線) と actor はメソッド・クラスにしない。もう有るメソッド・関連は出さず、もう有るクラスは「既にある」', function() {
    var cls = CLASS.replace('  + EnableIrq() : void\n', '');
    var items = rp.classCandidates(DOCS, 'c', cls);
    var texts = items.map(function(it) { return it.text; }).join('\n');
    expect(/Ack|InitDone|App/.test(texts)).toBe(false);
    var irq = items.filter(function(it) { return it.kind === 'class' && it.cls === 'Irq_Controller'; })[0];
    expect(irq.exists).toBe(true);
    expect(texts).toContain('Irq_Controller : + EnableIrq() : void');
    // 関連が既にあれば出ない
    var withRel = CLASS.replace('@enduml', 'Pwm_Driver -- Irq_Controller\n@enduml');
    expect(rp.classCandidates(DOCS, 'c', withRel).map(function(it) { return it.text; })).not.toContain('Pwm_Driver -- Irq_Controller');
  });

  test('classCandidates: 図のメソッドに型が無ければ「: void」を付けない / 頭が同じクラスが 2 つあるきっかけは持ち込まない', function() {
    var plain = '@startuml\nclass Pwm_Driver {\n  + Pwm_Reset()\n}\nclass Pwm_Timer\n@enduml';
    var items = rp.classCandidates([DOCS[0]], 'c', plain);
    expect(items.map(function(it) { return it.text; })).toContain('Pwm_Driver : + Pwm_Init()');
    var st = rp.classCandidates([DOCS[1]], 'c', plain).map(function(it) { return it.text; });
    expect(st).toEqual([]);   // Pwm_Driver と Pwm_Timer のどちらのきっかけか決められない
  });

  test('toClassSpec: メソッドだけ選んでもクラスの行が立ち、関連は関連の行になる', function() {
    var items = rp.classCandidates(DOCS, 'c', CLASS).filter(function(it) { return it.kind !== 'class'; });
    var spec = rp.toClassSpec(items);
    expect(spec.classes.map(function(c) { return c.name + ':' + c.members.length; })).toEqual(['Pwm_Driver:3', 'PwmRegs:1']);
    expect(spec.relations).toEqual([{ from: 'Pwm_Driver', to: 'PwmRegs' }, { from: 'Pwm_Driver', to: 'Irq_Controller' }]);
  });

  test('siblingParent: 同じ語尾の兄弟が 2 つ以上そろって継承している親 / childFirstInheritance: 図の継承の向き', function() {
    expect(CS.siblingParent(CLASS, 'Pwm_Driver')).toBe('Driver_Common');
    expect(CS.siblingParent(CLASS, 'PwmRegs')).toBe('');
    expect(CS.siblingParent(CLASS, 'Pwm_Timer')).toBe('');
    expect(CS.childFirstInheritance(CLASS)).toBe(true);
    expect(CS.childFirstInheritance('@startuml\nA <|-- B\n@enduml')).toBe(false);
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
