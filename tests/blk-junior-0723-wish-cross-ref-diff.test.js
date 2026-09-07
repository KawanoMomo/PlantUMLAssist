'use strict';
// BLK-junior-20260908-0723-wish
// 先輩(primary)版と自分(junior)版の同種図を突き合わせる場面。
// これまでは保存先設定を先輩フォルダへ替えて開き、内容を憶えてから設定を戻し、
// 記憶を頼りに打ち直していた。相手フォルダのファイルを名前で引き当て、
// 「相手にしかない要素」を挙げ、その 1 行を自分の DSL の適切な位置へ入れる。

const CRD = () => window.MA.crossRefDiff;

const SELF = [
  '@startuml',
  'title GPIO ドライバ初期化',
  'actor App',
  'participant Gpio_Driver',
  'participant Driver_Common',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver -> Driver_Common : Common_Init()',
  '@enduml',
].join('\n');

// 先輩版は note が 1 本多い (今日の場面そのもの)。
const REF = [
  '@startuml',
  'title GPIO ドライバ初期化',
  'actor App',
  'participant Gpio_Driver',
  'participant Driver_Common',
  'note over Gpio_Driver : shares Driver_Common base with Spi_Driver',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver -> Driver_Common : Common_Init()',
  '@enduml',
].join('\n');

describe('相手フォルダのファイル選び', () => {
  test('括弧書きと拡張子を落とした形で同じ名前を引き当てる', () => {
    const names = ['SPI初期化.puml', 'GPIOドライバ初期化シーケンス.puml', 'CAN送信.puml'];
    expect(CRD().pickCounterpart(names, 'GPIOドライバ初期化シーケンス(先輩反映)'))
      .toBe('GPIOドライバ初期化シーケンス.puml');
  });

  test('完全一致が 1 位、似ているものが次、無関係は後ろ', () => {
    const names = ['can_send_sequence', 'gpio_init_sequence', 'gpio_init_state'];
    const got = CRD().counterparts(names, 'gpio_init_sequence').map((c) => c.name);
    expect(got[0]).toBe('gpio_init_sequence');
    expect(got[1]).toBe('gpio_init_state');
  });

  test('近い名前が 1 つも無ければ勝手に選ばない', () => {
    expect(CRD().pickCounterpart(['zzz', 'qqq'], 'gpio_init_sequence')).toBe(null);
  });

  test('候補が空でも落ちない', () => {
    expect(CRD().counterparts([], 'gpio')).toEqual([]);
    expect(CRD().pickCounterpart(null, 'gpio')).toBe(null);
  });
});

describe('部品名をそろえる置換', () => {
  test('名前の違う 1 語から置換を組み立てる', () => {
    expect(CRD().renameMap('uart_init_sequence', 'gpio_init_sequence'))
      .toEqual({ from: 'gpio', to: 'uart' });
  });

  test('違う語が 2 語以上なら組み立てない (勝手な置換はしない)', () => {
    expect(CRD().renameMap('uart_send_sequence', 'gpio_init_sequence')).toBe(null);
  });

  test('同じ名前なら置換は要らない', () => {
    expect(CRD().renameMap('gpio_init', 'gpio_init.puml')).toBe(null);
  });

  test('大文字小文字の形を保って置換する', () => {
    const map = { from: 'gpio', to: 'uart' };
    expect(CRD().applyRename('GPIO_Driver Gpio_Init() gpio', map))
      .toBe('UART_Driver Uart_Init() uart');
  });
});

describe('要素の突き合わせ', () => {
  test('相手にしかない要素を挙げる', () => {
    const r = CRD().diff(SELF, REF, null);
    expect(r.onlyRef.length).toBe(1);
    expect(r.onlyRef[0].kind).toBe('note');
    expect(r.onlyRef[0].text).toContain('shares Driver_Common base');
    expect(r.onlySelf.length).toBe(0);
  });

  test('自分にしかない要素も挙げる', () => {
    const r = CRD().diff(REF, SELF, null);
    expect(r.onlySelf.length).toBe(1);
    expect(r.onlySelf[0].kind).toBe('note');
    expect(r.onlyRef.length).toBe(0);
  });

  test('同じ図なら差は 0 件で、共通の数を言う', () => {
    const r = CRD().diff(SELF, SELF, null);
    expect(r.onlyRef).toEqual([]);
    expect(r.onlySelf).toEqual([]);
    expect(r.common).toBeGreaterThan(0);
    expect(CRD().summary(r)).toContain('同じ要素が揃っています');
  });

  test('title は差分に数えない (骨組みであって中身ではない)', () => {
    const other = SELF.replace('title GPIO ドライバ初期化', 'title 別のタイトル');
    const r = CRD().diff(SELF, other, null);
    expect(r.onlyRef).toEqual([]);
    expect(r.onlySelf).toEqual([]);
  });

  test('部品名だけ違う 2 枚は、置換を渡せば全行が差分にならない', () => {
    const uart = CRD().applyRename(SELF, { from: 'gpio', to: 'uart' });
    const noMap = CRD().diff(uart, SELF, null);
    expect(noMap.onlyRef.length).toBeGreaterThan(1);   // そのままでは総崩れ
    const withMap = CRD().diff(uart, SELF, { from: 'gpio', to: 'uart' });
    expect(withMap.onlyRef).toEqual([]);
    expect(withMap.onlySelf).toEqual([]);
  });

  test('見出しは「相手にしかない / 自分にしかない」を数で言い切る', () => {
    expect(CRD().summary(CRD().diff(SELF, REF, null))).toContain('相手にしかない 1 件');
  });

  test('要素は元の行番号 (1 始まり) を持つ', () => {
    const r = CRD().diff(SELF, REF, null);
    expect(r.onlyRef[0].line).toBe(6);   // REF の 6 行目が note
  });
});

describe('足りない 1 行を入れる場所', () => {
  test('関係や注釈は @enduml の直前に入る', () => {
    const entry = CRD().diff(SELF, REF, null).onlyRef[0];
    const out = CRD().applyInsert(SELF, entry);
    const lines = out.dsl.split('\n');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(lines[out.line - 1]).toContain('shares Driver_Common base');
  });

  test('宣言は最後の宣言の直後に入る (関係行より前を保つ)', () => {
    const entry = { kind: 'participant', text: 'participant Spi_Driver' };
    const out = CRD().applyInsert(SELF, entry);
    const lines = out.dsl.split('\n');
    expect(lines[out.line - 1]).toBe('participant Spi_Driver');
    expect(lines[out.line - 2]).toBe('participant Driver_Common');
    expect(lines[out.line]).toBe('App -> Gpio_Driver : Gpio_Init()');
  });

  test('@enduml が無い DSL でも末尾に入れて落ちない', () => {
    const out = CRD().applyInsert('@startuml\nactor A', { kind: 'note', text: 'note over A : x' });
    expect(out.dsl.split('\n')[out.line - 1]).toBe('note over A : x');
  });

  test('中身の無い要素は入れない', () => {
    expect(CRD().insertPlan(SELF, { text: '   ' })).toBe(null);
    expect(CRD().applyInsert(SELF, null)).toBe(null);
  });
});
