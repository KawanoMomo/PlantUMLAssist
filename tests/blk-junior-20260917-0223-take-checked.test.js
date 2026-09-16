'use strict';
// BLK-junior-20260917-0223-wish: 場面3 (先輩の図の変更を自分の図に取り込む) の手順1〜2。
// 先輩側の増分は「相手だけ」の行として既に挙がるが、取り込みは 1 行ずつで、
// 押すまでどこへ入るかが分からず、押すと一覧が出し直されカーソルも飛ぶので、
// 増分が何本もある回は次の 1 行を毎回探し直すことになる。
// 入る位置を先に見せ、チェックした分をまとめて入れられるようにする。

const CRD = () => window.MA.crossRefDiff;

const SELF = [
  '@startuml',
  'title TIMER ドライバ初期化',
  'actor App',
  'participant Timer_Driver',
  'App -> Timer_Driver : Timer_Init()',
  '@enduml',
].join('\n');

// 先輩側で participant 1 つとメッセージ 2 本が増えている回。
const REF = [
  '@startuml',
  'title TIMER ドライバ初期化',
  'actor App',
  'participant Timer_Driver',
  'participant Driver_Common',
  'App -> Timer_Driver : Timer_Init()',
  'Timer_Driver -> Driver_Common : Common_Init()',
  'Timer_Driver -> Driver_Common : Common_Start()',
  '@enduml',
].join('\n');

function onlyRef() {
  return CRD().diff(SELF, REF, null).onlyRef;
}

describe('入る位置を取り込む前に見せる (planText)', () => {
  test('宣言は宣言の並びの最後の後に入ると言う', () => {
    const entry = onlyRef().filter((e) => /^participant Driver_Common/.test(e.text))[0];
    expect(typeof entry).toBe('object');
    const text = CRD().planText(SELF, entry);
    expect(text).toContain('participant Timer_Driver');
    expect(text).toContain('行目');
  });

  test('関係は @enduml の直前 = 最後の行の後に入ると言う', () => {
    const entry = onlyRef().filter((e) => /Common_Init\(\)/.test(e.text))[0];
    expect(CRD().planText(SELF, entry)).toContain('App -> Timer_Driver : Timer_Init()');
  });

  test('行が空なら位置も出さない (押せない行に位置だけ出さない)', () => {
    expect(CRD().planText(SELF, { text: '   ' })).toBe('');
  });

  test('本文が空の図でも落ちない', () => {
    expect(typeof CRD().planText('', { text: 'actor App' })).toBe('string');
  });
});

describe('チェックした分をまとめて取り込む (applyInserts)', () => {
  test('3 件を 1 回で入れ、入った行番号を返す', () => {
    const res = CRD().applyInserts(SELF, onlyRef());
    expect(res.count).toBe(3);
    expect(res.lines.length).toBe(3);
    expect(res.dsl).toContain('participant Driver_Common');
    expect(res.dsl).toContain('Common_Init()');
    expect(res.dsl).toContain('Common_Start()');
  });

  test('1 件ずつ押したときと同じ置き場所になる', () => {
    const entries = onlyRef();
    let one = SELF;
    entries.forEach((e) => { one = CRD().applyInsert(one, e).dsl; });
    expect(CRD().applyInserts(SELF, entries).dsl).toBe(one);
  });

  test('宣言は宣言の並びに、関係は @enduml の手前に入る', () => {
    const lines = CRD().applyInserts(SELF, onlyRef()).dsl.split('\n');
    const decl = lines.indexOf('participant Driver_Common');
    const msg = lines.findIndex((l) => /Common_Init\(\)/.test(l));
    const end = lines.findIndex((l) => /^@enduml/.test(l));
    expect(decl).toBeLessThan(msg);
    expect(msg).toBeLessThan(end);
  });

  test('既に自分の図にある行は入れない (同じ手順が 2 本にならない)', () => {
    const entries = [{ text: 'App -> Timer_Driver : Timer_Init()', kind: 'message' }];
    const res = CRD().applyInserts(SELF, entries);
    expect(res.count).toBe(0);
    expect(res.skipped[0].reason).toBe('already');
    expect(res.dsl).toBe(SELF);
  });

  test('チェックが 0 件なら何も変わらない', () => {
    const res = CRD().applyInserts(SELF, []);
    expect(res.count).toBe(0);
    expect(res.dsl).toBe(SELF);
    expect(res.firstLine).toBe(0);
  });

  test('空行だけの行は数にも入れない', () => {
    expect(CRD().applyInserts(SELF, [{ text: '  ' }]).count).toBe(0);
  });

  test('entries が配列でなくても落ちない', () => {
    expect(CRD().applyInserts(SELF, null).dsl).toBe(SELF);
  });

  test('最初に入った行へ飛べるよう firstLine を返す', () => {
    const res = CRD().applyInserts(SELF, onlyRef());
    expect(res.firstLine).toBe(res.lines[0]);
    expect(res.dsl.split('\n')[res.firstLine - 1]).toBe('participant Driver_Common');
  });
});

describe('取り込んだ結果の 1 行 (insertsSummary)', () => {
  test('件数と入った行番号を言う', () => {
    const res = CRD().applyInserts(SELF, onlyRef());
    const line = CRD().insertsSummary(res);
    expect(line).toContain('3 件を取り込みました');
    expect(line).toContain('行目');
  });

  test('既にあった分は「入れていません」と言う (増えないのを不具合に見せない)', () => {
    const res = CRD().applyInserts(SELF, [{ text: 'App -> Timer_Driver : Timer_Init()' }]);
    expect(CRD().insertsSummary(res)).toContain('既に自分の図にあった');
  });

  test('何も選んでいなければ選ぶよう促す', () => {
    expect(CRD().insertsSummary(CRD().applyInserts(SELF, []))).toContain('選んでください');
  });

  test('引数が無くても落ちない', () => {
    expect(typeof CRD().insertsSummary(null)).toBe('string');
  });
});
