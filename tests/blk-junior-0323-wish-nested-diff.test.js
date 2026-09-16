'use strict';
// BLK-junior-20260917-0323-wish
// 場面3 (先輩の図の変更を自分の図に取り込む)・状態遷移図 (TIMER)。
// 先輩が Configured の中に子状態 (Idle / Running) と子の間の遷移を足した回、
// 「⇔並べて見る」の一覧はそれをトップレベルの状態と区別せずに出していた。
//   - `state Configured {` が括りとして読まれず、`}` が「対応する開始がない」になる
//   - 子状態の行に親が出ないので、親を手で開いて中を見比べる手が残る
//   - 取り込むと子が親の外へ入り、トップレベルの兄弟状態になって図の意味が変わる
// ここで守るのは「入れ子の増分が入れ子のまま一覧に出て、入れ子のまま入る」こと。

const CRD = () => window.MA.crossRefDiff;

// 自分の図: Configured はまだ中身を持たない 1 行の宣言。
const SELF = [
  '@startuml',
  'title TIMER ドライバ状態遷移',
  '[*] --> Uninit',
  'state Uninit',
  'state Configured',
  'Uninit --> Configured : Init()',
  'Configured --> Uninit : DeInit()',
  '@enduml',
].join('\n');

// 先輩の図: Configured の中に Idle / Running と、その間の遷移が増えている。
const REF = [
  '@startuml',
  'title TIMER ドライバ状態遷移',
  '[*] --> Uninit',
  'state Uninit',
  'state Configured {',
  '  state Idle',
  '  state Running',
  '  Idle --> Running : Start()',
  '  Running --> Idle : Stop()',
  '}',
  'Uninit --> Configured : Init()',
  'Configured --> Uninit : DeInit()',
  '@enduml',
].join('\n');

describe('BLK-junior-20260917-0323-wish 入れ子状態の増分', () => {

  describe('outline が本体付きの宣言を括りとして読む', () => {
    test('`state X {` … `}` はパースエラーにならない', () => {
      const built = window.MA.outline.build(REF);
      expect(built.ok).toBe(true);
      expect(built.errors.length).toBe(0);
    });

    test('中の子状態・子の遷移は親より 1 段深い', () => {
      const nodes = window.MA.outline.build(REF).nodes;
      const idle = nodes.filter((n) => n.label === 'Idle')[0];
      const start = nodes.filter((n) => n.kind === 'relation' && n.detail === 'Start()')[0];
      expect(idle.depth).toBe(1);
      expect(idle.parent).toBe('Configured');
      expect(start.depth).toBe(1);
      expect(start.parent).toBe('Configured');
    });

    test('トップレベルの要素は親を持たない', () => {
      const nodes = window.MA.outline.build(REF).nodes;
      const uninit = nodes.filter((n) => n.label === 'Uninit' && n.kind === 'state')[0];
      expect(uninit.parent).toBe('');
      expect(uninit.depth).toBe(0);
    });

    test('class の本体も同じく括りとして読む', () => {
      const dsl = ['@startuml', 'class Spi_Driver {', '  + Init()', '}', '@enduml'].join('\n');
      const built = window.MA.outline.build(dsl);
      expect(built.ok).toBe(true);
    });
  });

  describe('一覧に入れ子の増分が出る', () => {
    test('子状態も子の遷移も「相手にしかない」に挙がる', () => {
      const d = CRD().diff(SELF, REF, null);
      const labels = d.onlyRef.map((e) => e.text);
      expect(labels.indexOf('state Idle') >= 0).toBe(true);
      expect(labels.indexOf('state Running') >= 0).toBe(true);
      expect(labels.indexOf('Idle --> Running : Start()') >= 0).toBe(true);
      expect(d.onlyRef.length).toBe(4);
      expect(d.onlySelf.length).toBe(0);
    });

    test('各行はどの親の中かを持つ', () => {
      const d = CRD().diff(SELF, REF, null);
      d.onlyRef.forEach((e) => { expect(e.parent).toBe('Configured'); });
    });

    test('一覧の名前は親の道筋ごと出る', () => {
      const d = CRD().diff(SELF, REF, null);
      expect(CRD().entryLabel(d.onlyRef[0])).toBe('Configured / Idle');
    });

    test('見出しが入れ子の増分の件数を言う', () => {
      const d = CRD().diff(SELF, REF, null);
      expect(CRD().nestedCount(d.onlyRef)).toBe(4);
      expect(CRD().summary(d).indexOf('4 件は親の中') >= 0).toBe(true);
    });

    test('親の中の Idle とトップレベルの Idle は別の状態', () => {
      const flat = ['@startuml', 'state Idle', '@enduml'].join('\n');
      const nested = ['@startuml', 'state Configured {', '  state Idle', '}', '@enduml'].join('\n');
      const d = CRD().diff(flat, nested, null);
      // 相手の Idle は親の中にあるので、自分のトップレベル Idle とは揃わない
      expect(d.onlyRef.filter((e) => e.label === 'Idle' && e.parent === 'Configured').length).toBe(1);
      expect(d.common).toBe(0);
    });
  });

  describe('入れ子のまま取り込む', () => {
    test('子状態は親の本体を開いてその中へ入る', () => {
      const plan = CRD().insertPlan(SELF, { text: 'state Idle', parent: 'Configured' });
      expect(plan.parent).toBe('Configured');
      expect(plan.expand.name).toBe('Configured');
      expect(plan.text).toBe('  state Idle');
    });

    test('入る場所の 1 行が親の中だと言う', () => {
      const where = CRD().planText(SELF, { text: 'state Idle', parent: 'Configured' });
      expect(where.indexOf('「Configured」に { } を開いて') >= 0).toBe(true);
    });

    test('1 行の取り込みで親に本体 { } が開く', () => {
      const out = CRD().applyInsert(SELF, { text: 'state Idle', parent: 'Configured' });
      const lines = out.dsl.split('\n');
      expect(lines[4]).toBe('state Configured {');
      expect(lines[5]).toBe('  state Idle');
      expect(lines[6]).toBe('}');
      expect(window.MA.outline.build(out.dsl).ok).toBe(true);
    });

    test('まとめて取り込むと先輩の図と同じ形になる', () => {
      const d = CRD().diff(SELF, REF, null);
      const res = CRD().applyInserts(SELF, d.onlyRef);
      expect(res.count).toBe(4);
      const after = CRD().diff(res.dsl, REF, null);
      expect(after.onlyRef.length).toBe(0);
      expect(after.onlySelf.length).toBe(0);
      expect(window.MA.outline.build(res.dsl).ok).toBe(true);
    });

    test('既に親の中にある子は二重に入れない', () => {
      const d = CRD().diff(SELF, REF, null);
      const once = CRD().applyInserts(SELF, d.onlyRef);
      const twice = CRD().applyInserts(once.dsl, d.onlyRef);
      expect(twice.count).toBe(0);
      expect(twice.skipped.length).toBe(4);
    });

    test('同じ名前がトップレベルにあっても、親の中には入れる', () => {
      const self = ['@startuml', 'state Idle', 'state Configured {', '}', '@enduml'].join('\n');
      const res = CRD().applyInserts(self, [{ text: 'state Idle', parent: 'Configured' }]);
      expect(res.count).toBe(1);
      expect(res.dsl.split('\n')[3]).toBe('  state Idle');
    });

    test('親が自分の図にまだ無いときはトップレベルへ置く (親も別行で取り込む)', () => {
      const self = ['@startuml', 'state Uninit', '@enduml'].join('\n');
      const out = CRD().applyInsert(self, { text: 'state Idle', parent: 'NotThere' });
      expect(out.dsl.split('\n')[2]).toBe('state Idle');
    });

    test('本体を開く宣言を取り込むと閉じ括弧まで入る', () => {
      const self = ['@startuml', 'state Uninit', '@enduml'].join('\n');
      const out = CRD().applyInsert(self, { text: 'state Configured {', parent: '' });
      const lines = out.dsl.split('\n');
      expect(lines[2]).toBe('state Configured {');
      expect(lines[3]).toBe('}');
      expect(window.MA.outline.build(out.dsl).ok).toBe(true);
    });

    test('トップレベルの取り込みは今まで通りの置き場所', () => {
      const self = ['@startuml', 'state Uninit', '@enduml'].join('\n');
      const out = CRD().applyInsert(self, { text: 'state Configured' });
      expect(out.dsl.split('\n')[2]).toBe('state Configured');
      expect(out.line).toBe(3);
    });
  });
});
