'use strict';
// BLK-primary-20260915-0007-friction: reviewer の依頼2 は「クラス図への追加、または
// 意図的省略である旨の明記」という二択で来る。前者だけが [適用] だったので、後者を
// 選んだ primary は `note top of ClockCtrl : ...` を #editor へ全文手打ちしていた
// (実測 keys=124)。名指しされている `ClockCtrl.EnableClock()` から note を組み立て、
// 押すだけで自分のクラス図に入ることをここで守る。

var W = (typeof window !== 'undefined' && window) || global.window;
var NI = W.MA.noteIntent;
var FA = W.MA.findingActions;

// 実物の指摘.md (persona-data\reviewer) の依頼2 と同じ書き方。
var REQ2 = '## 【継続・3 tick目・変化なし】依頼2: メソッド呼び出し先のクラス図欠落(6件)\n'
  + '- `ClockCtrl.EnableClock()`(adc/can/gpio/spi/timer/uart 各 init_sequence)\n'
  + '- `NVIC.EnableVector()` `NVIC.SetPriority()`(irq_init_sequence)\n'
  + '対応するクラス図にメソッド宣言がない。クラス図への追加、または '
  + '`irq_init_sequence.puml` の note のように意図的省略である旨を明記してほしい。';

var CLASS_DOC = ['@startuml', 'title 共通クラス',
  'class ClockCtrl', 'class NVIC', 'class Timer_Driver {', '  + Timer_Init() : void', '}',
  '@enduml'].join('\n');

describe('note-intent — 指摘文から note を組み立てる', function() {
  test('「意図的省略である旨を明記」を二択のもう一方として読む', function() {
    expect(NI.offered(REQ2)).toBe(true);
    expect(NI.offered('クラス図にメソッド宣言がない。追加してほしい。')).toBe(false);
    // 「意図」の一語だけでは取らない (指摘文のどこにでも出る)。
    expect(NI.offered('設計意図が読み取れません')).toBe(false);
  });

  test('`クラス.メソッド()` をクラスごとにまとめて拾う (並びは指摘文の順)', function() {
    var t = NI.targets(REQ2);
    expect(t.map(function(x) { return x.cls; })).toEqual(['ClockCtrl', 'NVIC']);
    expect(t[1].methods).toEqual(['EnableVector', 'SetPriority']);
  });

  test('ファイル名は組として拾わない', function() {
    expect(NI.targets('`irq_init_sequence.puml` と diagram1.svg を見てください')).toEqual([]);
  });

  test('note の本文が、意図して省略したことと依頼の見出しを言う', function() {
    var line = NI.lineFor({ cls: 'NVIC', methods: ['EnableVector', 'SetPriority'] },
      { heading: '依頼2' });
    expect(line).toBe('note top of NVIC : EnableVector()・SetPriority() の呼び先は'
      + 'クラス図に置かず、意図して省略しています（依頼2への回答）');
  });

  test('宣言のあるクラスにだけ書く。無い相手は先に [クラス追加] へ回す', function() {
    var res = NI.apply(CLASS_DOC, NI.targets(REQ2).concat([{ cls: 'DmaCtrl', methods: ['Can_Write'] }]),
      { heading: '依頼2' });
    expect(res.added).toEqual(['ClockCtrl', 'NVIC']);
    expect(res.dsl).toContain('note top of ClockCtrl : EnableClock() の呼び先は');
    // クラス本体 `{ ... }` の内側や @enduml の後ろに落ちない。
    var lines = res.dsl.split('\n');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(res.dsl).not.toContain('note top of DmaCtrl');
    expect(NI.blockReason(res)).toContain('DmaCtrl はクラス図に宣言がありません');
    expect(NI.blockReason(res)).toContain('[クラス追加]');
  });

  test('同じクラス宛の note が既にあれば重ねない (tick のたびに行が積まれない)', function() {
    var once = NI.apply(CLASS_DOC, NI.targets(REQ2), {});
    var twice = NI.apply(once.dsl, NI.targets(REQ2), {});
    expect(twice.added).toEqual([]);
    expect(twice.dsl).toBe(once.dsl);
    expect(NI.blockReason(twice)).toContain('既に note が書かれています');
  });
});

describe('finding-actions — 二択の指摘は 2 つ目の手を持つ', function() {
  var row = { id: 'f2', heading: '依頼2', text: REQ2, docs: [] };

  test('本手はこれまで通りメソッド追加で、隣に「意図を明記」が付く', function() {
    var p = FA.planFor(row, { mineFolder: 'primary' });
    expect(p.kind).toBe('addmethod');
    expect(p.ready).toBe(true);
    expect(p.alt.kind).toBe('noteintent');
    expect(p.alt.label).toBe('意図を明記');
    expect(p.alt.ready).toBe(true);
    expect(p.alt.classes).toEqual(['ClockCtrl', 'NVIC']);
    expect(p.alt.text).toContain('意図を明記: ClockCtrl・NVIC');
  });

  test('二択で来ていない指摘には 2 つ目の手を付けない', function() {
    var p = FA.planFor({ id: 'f3', text: '`ClockCtrl.EnableClock()` のメソッドが無い。クラス図に足してほしい。', docs: [] },
      { mineFolder: 'primary' });
    expect(p.kind).toBe('addmethod');
    expect(p.alt).toBe(null);
  });

  test('当てたあとの 1 行が、どのクラスに書いたかを言う', function() {
    var p = FA.planFor(row, { mineFolder: 'primary' });
    expect(FA.resultText(p.alt, { ok: true, added: ['ClockCtrl', 'NVIC'], done: ['driver_common_class'] }))
      .toBe('ClockCtrl・NVIC に意図的省略の note を driver_common_class へ書きました');
  });
});
