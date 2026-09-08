'use strict';
// BLK-primary-20260908-1603-wish: 遷移密度は件数しか見ないので、件数は揃って
// いるのにラベルだけが架空 (dma_state の Dma_Configure がシーケンスのどの
// メッセージとも一致しない) というケースは表に出なかった。
// ここでは「対応が無い行が先頭に来ること」「実在メッセージ名が対応欄に出ること」
// 「架空ラベルに実在名の候補が付くこと」を固定する。

const { loadMA } = require('../tools/audit-runtime');
const TT = require('../src/core/trace-label-table');

const { MA } = loadMA();

const NL = String.fromCharCode(10);

const STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Dma_Configure',
  'Configured --> Transferring : StartTransfer',
  '@enduml',
].join('\n');

const SEQ = [
  '@startuml',
  'participant App', 'participant Dma',
  'App -> Dma : SetSrcDst',
  'App -> Dma : ArmChannel',
  'App -> Dma : StartTransfer',
  '@enduml',
].join('\n');

function family() {
  const docs = [
    { id: 's1', name: 'dma_state', diagramType: 'plantuml-state', dsl: STATE },
    { id: 'q1', name: 'dma_transfer_sequence', diagramType: 'plantuml-sequence', dsl: SEQ },
  ];
  const families = MA.traceCoverage.audit(docs);
  expect(families.length).toBe(1);
  return families[0];
}

describe('trace-label-table — 遷移ラベル × シーケンスのメッセージ', function() {
  test('対応が無い行が先頭に来て、一致した行は実在のメッセージ名で答える', function() {
    const t = TT.build(family());
    expect(t.rows[0].label).toBe('Dma_Configure');
    expect(t.rows[0].status).toBe('missing');
    expect(t.counts.missing).toBe(1);

    const ok = t.rows.filter((r) => r.status === 'covered');
    expect(ok.length).toBe(1);
    expect(ok[0].label).toBe('StartTransfer');
    // 図の名前ではなく、対応したメッセージ名そのもの
    expect(ok[0].matched.map((m) => m.name)).toEqual(['StartTransfer']);
    expect(TT.matchText(ok[0])).toBe('StartTransfer');
  });

  test('架空のラベルには、その系統に実在するメッセージ名が出る', function() {
    // Dma_Configure は実在名 (SetSrcDst / ArmChannel …) と綴りも似ていない。
    // 綴りの近い候補が無いときは、系統に実在する名前をそのまま出す。
    const t = TT.build(family());
    const bad = t.rows[0];
    const names = bad.suggest.map((s) => s.name);
    expect(names.length).toBeGreaterThan(0);
    names.forEach((n) => expect(['SetSrcDst', 'ArmChannel', 'StartTransfer']).toContain(n));
    expect(bad.fallback).toBe(true);
    expect(TT.matchText(bad)).toContain('実在するメッセージ');
  });

  test('綴りの近い実在名があれば、そちらを候補として先に出す', function() {
    const docs = [
      { id: 's1', name: 'dma_state', diagramType: 'plantuml-state',
        dsl: ['@startuml', '[*] --> Idle', 'Idle --> Armed : ArmChannels', '@enduml'].join(NL) },
      { id: 'q1', name: 'dma_sequence', diagramType: 'plantuml-sequence',
        dsl: ['@startuml', 'App -> Dma : ArmChannel', 'App -> Dma : Reset', '@enduml'].join(NL) },
    ];
    const t = TT.build(MA.traceCoverage.audit(docs)[0]);
    const bad = t.rows.filter((r) => r.status === 'missing');
    if (bad.length) {
      expect(bad[0].fallback).toBeUndefined();
      expect(bad[0].suggest[0].name).toBe('ArmChannel');
      expect(TT.matchText(bad[0])).toContain('候補');
    }
  });

  test('一致した行には候補を付けない', function() {
    const t = TT.build(family());
    t.rows.filter((r) => r.status !== 'missing').forEach((r) => expect(r.suggest).toEqual([]));
  });

  test('見出しは件数ではなく「対応が無いラベル」の数で言う', function() {
    const t = TT.build(family());
    expect(TT.summaryLine(t)).toContain('対応するメッセージが無いラベル 1 件');
  });

  test('全部対応していれば、その旨を言う', function() {
    const docs = [
      { id: 's1', name: 'adc_state', diagramType: 'plantuml-state',
        dsl: '@startuml\n[*] --> Idle\nIdle --> Ready : Adc_Init\n@enduml' },
      { id: 'q1', name: 'adc_sequence', diagramType: 'plantuml-sequence',
        dsl: '@startuml\nApp -> Adc : Adc_Init\n@enduml' },
    ];
    const t = TT.build(MA.traceCoverage.audit(docs)[0]);
    expect(t.counts.missing).toBe(0);
    expect(TT.summaryLine(t)).toContain('対応しています');
  });

  test('シーケンス図が無い系統では「対応なし 0 件」と言わない', function() {
    const docs = [
      { id: 's1', name: 'spi_state', diagramType: 'plantuml-state',
        dsl: '@startuml\n[*] --> Idle\nIdle --> Ready : Spi_Init\n@enduml' },
    ];
    const t = TT.build(MA.traceCoverage.audit(docs)[0]);
    expect(t.seqDocs.length).toBe(0);
    expect(TT.summaryLine(t)).toContain('突き合わせていません');
  });

  test('並び順は 対応なし → 部分一致 → 一致 → 対象外、同じ状態なら図に書かれた順', function() {
    const t = TT.build({
      key: 'x',
      rows: [
        { docName: 'a', line: 3, from: 'A', to: 'B', label: 'Ok1', status: 'covered', matched: [{ name: 'Ok1', doc: 'q' }], seenIn: ['q'] },
        { docName: 'a', line: 4, from: 'B', to: 'C', label: 'Part', status: 'partial', matched: [{ name: 'PartialX', doc: 'q' }], seenIn: ['q'] },
        { docName: 'a', line: 5, from: 'C', to: 'D', label: 'Ghost', status: 'missing', matched: [], seenIn: [] },
        { docName: 'a', line: 6, from: 'D', to: 'E', label: 'Ok2', status: 'covered', matched: [{ name: 'Ok2', doc: 'q' }], seenIn: ['q'] },
      ],
      outOfScope: [{ docName: 'a', line: 7, from: 'E', to: 'F', label: 'Later', status: 'out-of-scope', reason: 'declared' }],
      messages: [], seqDocs: [{ name: 'q' }], comparable: true,
    });
    expect(t.rows.map((r) => r.label)).toEqual(['Ghost', 'Part', 'Ok1', 'Ok2', 'Later']);
    expect(t.counts.outOfScope).toBe(1);
    expect(TT.matchText(t.rows[4])).toBe('宣言の対象外');
    expect(TT.matchText(t.rows[1])).toContain('部分一致');
  });

  test('近さは 2-gram の Dice 係数。同名は 1、似ていない名前は候補にならない', function() {
    expect(TT.similarity('armchannel', 'armchannel')).toBe(1);
    expect(TT.similarity('armchannel', 'armchannels')).toBeGreaterThan(TT.SUGGEST_MIN);
    expect(TT.similarity('dmaconfigure', 'zzz')).toBeLessThan(TT.SUGGEST_MIN);
    const s = TT.suggestFor({ keys: ['dmaconfigure'] },
      [{ name: 'Zzz', key: 'zzz', doc: 'q' }]);
    expect(s).toEqual([]);
  });

  test('候補は近い順で 3 件まで', function() {
    const msgs = ['armchannel', 'armchannels', 'armchan', 'armchannelx', 'armch']
      .map((k) => ({ name: k, key: k, doc: 'q' }));
    const s = TT.suggestFor({ keys: ['armchannel'] }, msgs);
    expect(s.length).toBe(TT.SUGGEST_MAX);
    expect(s[0].name).toBe('armchannel');
    expect(s[0].score >= s[1].score).toBe(true);
  });

  test('空の入力でも落ちない', function() {
    const t = TT.build(null);
    expect(t.rows).toEqual([]);
    expect(TT.summaryLine(t)).toContain('突き合わせていません');
    expect(TT.similarity('', 'a')).toBe(0);
  });
});
