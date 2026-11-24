'use strict';
// TICKET-owner-20261124-0822-2: 未保存の図のタブを × で閉じる前に知らせる。
// 聞くのは上部バーが「● 保存」になる図だけ。保存済み・見本のままの図は 1 押しで閉じる。

// 先に回るテストが global.window を差し替えることがあるので、src/core を自分で読み込む。
const _CG = require('./load-ma').loadMA().MA.closeGuard;
const CG = () => _CG;

describe('close-guard — タブを閉じる前に聞くか', () => {
  test('前回保存版から変わった図 (●) は聞く', () => {
    expect(CG().needsAsk({ status: 'changed', dsl: '@startuml\nA -> B\n@enduml', untouched: false })).toBe(true);
  });

  test('まだ保存していない図 (○) で利用者の字がある図は聞く', () => {
    expect(CG().needsAsk({ status: 'new', dsl: '@startuml\nparticipant A\nA -> A\n@enduml', untouched: false })).toBe(true);
  });

  test('保存済みの図は聞かない', () => {
    expect(CG().needsAsk({ status: 'same', dsl: '@startuml\nA -> B\n@enduml', untouched: false })).toBe(false);
  });

  test('見本・白紙のままの図は聞かない', () => {
    expect(CG().needsAsk({ status: 'new', dsl: '@startuml\nAlice -> Bob\n@enduml', untouched: true })).toBe(false);
    expect(CG().needsAsk({ status: 'new', dsl: '   \n', untouched: false })).toBe(false);
  });

  test('ファイルを開いたときの本文のまま (眺めただけ) の図は聞かない', () => {
    expect(CG().needsAsk({ status: 'new', dsl: '@startuml\nA -> B\n@enduml', untouched: false, asOpened: true })).toBe(false);
    expect(CG().needsAsk({ status: 'changed', dsl: '@startuml\nA -> B\n@enduml', untouched: false, asOpened: true })).toBe(false);
  });

  test('sourceLock.isUnchanged は開いたときの本文と比べるだけで錠を外さない', () => {
    const L = require('./load-ma').loadMA();
    const mem = {};
    L.window.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    const SL = L.MA.sourceLock;
    SL.clearAll();
    SL.mark('d1', 's1-out', '@startuml\nA -> B\n@enduml');
    expect(SL.isUnchanged('d1', '@startuml\r\nA -> B\r\n@enduml')).toBe(true);
    expect(SL.isUnchanged('d1', '@startuml\nA -> B\nB -> A\n@enduml')).toBe(false);
    // 読むだけなので、本文を戻せばまた「開いたときのまま」
    expect(SL.isUnchanged('d1', '@startuml\nA -> B\n@enduml')).toBe(true);
    expect(SL.isUnchanged('nope', '@startuml\n@enduml')).toBe(false);
  });

  test('判定の材料が無ければ聞かない', () => {
    expect(CG().needsAsk(null)).toBe(false);
    expect(CG().needsAsk({ status: 'new', dsl: null, untouched: false })).toBe(false);
  });

  test('窓の語は保存・保存せず・やめるの 3 つで、最初が保存して閉じる', () => {
    const c = CG().choices();
    expect(c.map((x) => x.id)).toEqual(['save', 'discard', 'cancel']);
    expect(c[0].label).toBe('保存して閉じる');
    expect(c[1].label).toBe('保存せずに閉じる');
  });

  test('見出しにファイル名、本文に保存の行き先と失うものを書く', () => {
    const d = CG().message('s1-out.puml', 'download');
    expect(d.title).toContain('s1-out.puml');
    expect(d.body).toContain('ダウンロード');
    expect(d.body).toContain('元に戻す履歴');
    const f = CG().message('a.puml', 'file');
    expect(f.body).not.toContain('ダウンロード');
  });
});
